/* ── Firebase (Cloud Firestore) persistence — ไม่ใช้ dependency ภายนอก ──
   ใช้ REST API + Service Account (JWT RS256 ผ่าน crypto) แทน firebase-admin
   แนวคิด: ไฟล์ data/*.json ยังเป็น cache ในเครื่อง (โค้ดเดิมอ่าน/เขียนแบบ sync ได้เหมือนเดิม)
   - ตอนเปิดเซิร์ฟเวอร์: hydrate() ดึงข้อมูลจาก Firestore ลงไฟล์ในเครื่อง
     (ถ้า Firestore ยังว่าง → อัปโหลดข้อมูลจากไฟล์ในเครื่องขึ้นไป = migrate ครั้งแรก)
   - ทุกครั้งที่ save → schedule() ส่งการเปลี่ยนแปลงขึ้น Firestore (debounce + ส่งเฉพาะที่เปลี่ยน)

   โครงสร้างใน Firestore:
     users/{key}                    — 1 เอกสารต่อผู้ใช้ (field _key = key จริง)
     app/site-settings              — ค่าตั้งเว็บ
     app/analytics                  — สถิติ (ไม่รวม uniqueVisitorsSet)
     analyticsVisitors/{chunk-N}    — uniqueVisitorsSet แบ่งเป็นก้อน (กันเกิน 1MB/เอกสาร)
     uploads/{filename}             — meta ไฟล์อัปโหลด + uploads/{filename}/parts/{i} (bytes ≤ 700KB)

   ตั้งค่า credential (เลือกอย่างใดอย่างหนึ่ง):
     FIREBASE_SERVICE_ACCOUNT        = JSON ของ service account (หรือ base64 ของ JSON)
     FIREBASE_SERVICE_ACCOUNT_FILE / GOOGLE_APPLICATION_CREDENTIALS = path ไฟล์ JSON
     หรือวางไฟล์ firebase-service-account.json ไว้ที่รากโปรเจกต์ (ไม่ขึ้น git)
   FIREBASE_PROJECT_ID (ค่าเริ่มต้น bot-by-wsm-3f447) · FIREBASE_DISABLED=1 เพื่อปิด */
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_PROJECT_ID = 'bot-by-wsm-3f447';
const PART_BYTES = 700 * 1024;
const VISITOR_CHUNK = 15000;
const MAX_WRITES_PER_COMMIT = 400;

function createStore(opts) {
  const ROOT = opts.root;
  const files = opts.files; // { users, settings, analytics, uploadDir }
  const log = (...a) => console.log('[firebase]', ...a);
  const warn = (...a) => console.warn('[firebase]', ...a);

  /* ── credential ── */
  function readServiceAccount() {
    if (String(process.env.FIREBASE_DISABLED || '') === '1') return null;
    let raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
    if (raw && !raw.startsWith('{')) {
      try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { raw = ''; }
    }
    if (!raw) {
      const candidates = [
        process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
        path.join(ROOT, 'firebase-service-account.json'),
      ].filter(Boolean);
      for (const p of candidates) {
        try { if (fs.existsSync(p)) { raw = fs.readFileSync(p, 'utf8'); break; } } catch (e) { }
      }
    }
    if (!raw) return null;
    try {
      const sa = JSON.parse(raw);
      if (!sa.client_email || !sa.private_key) throw new Error('missing client_email/private_key');
      return sa;
    } catch (e) {
      warn('service account ไม่ถูกต้อง:', e.message);
      return null;
    }
  }

  const sa = readServiceAccount();
  // รันบน Google Cloud (Firebase App Hosting / Cloud Run) → ใช้ service account ของเครื่องผ่าน metadata server ได้เลย ไม่ต้องมีไฟล์ key
  const onGoogleCloud = !sa && String(process.env.FIREBASE_DISABLED || '') !== '1' && !!(process.env.K_SERVICE || process.env.FIREBASE_APP_HOSTING);
  const projectId = String(process.env.FIREBASE_PROJECT_ID || (sa && sa.project_id) || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID);
  const enabled = !!sa || onGoogleCloud;
  const DB = `projects/${projectId}/databases/(default)/documents`;

  /* ── HTTP ── */
  function request(method, url, body, headers) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
      const req = https.request({
        method, hostname: u.hostname, path: u.pathname + u.search,
        headers: Object.assign(
          data != null ? { 'Content-Type': headers && headers['Content-Type'] || 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
          headers || {}
        ),
        timeout: 30000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = text; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      if (data != null) req.write(data);
      req.end();
    });
  }

  let tokenCache = { token: '', exp: 0 };
  async function accessToken() {
    if (tokenCache.token && Date.now() < tokenCache.exp - 60000) return tokenCache.token;
    if (!sa) return metadataToken();
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
    });
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    const form = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + sig;
    const r = await request('POST', 'https://oauth2.googleapis.com/token', form, { 'Content-Type': 'application/x-www-form-urlencoded' });
    if (r.status !== 200 || !r.body || !r.body.access_token) {
      throw new Error('ขอ access token ไม่สำเร็จ: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 300));
    }
    tokenCache = { token: r.body.access_token, exp: Date.now() + (r.body.expires_in || 3600) * 1000 };
    return tokenCache.token;
  }

  function metadataToken() {
    return new Promise((resolve, reject) => {
      const http = require('http');
      http.get({
        hostname: 'metadata.google.internal',
        path: '/computeMetadata/v1/instance/service-accounts/default/token',
        headers: { 'Metadata-Flavor': 'Google' },
        timeout: 5000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (res.statusCode !== 200 || !j.access_token) throw new Error('metadata token HTTP ' + res.statusCode);
            tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
            resolve(tokenCache.token);
          } catch (e) { reject(e); }
        });
      }).on('timeout', function () { this.destroy(new Error('metadata timeout')); }).on('error', reject);
    });
  }

  async function api(method, pathAndQuery, body) {
    const token = await accessToken();
    const url = `https://firestore.googleapis.com/v1/${pathAndQuery}`;
    const r = await request(method, url, body, { Authorization: 'Bearer ' + token });
    if (r.status >= 400 && r.status !== 404) {
      const msg = r.body && r.body.error ? r.body.error.message : JSON.stringify(r.body).slice(0, 300);
      throw new Error(`${method} ${pathAndQuery.split('?')[0]} → ${r.status} ${msg}`);
    }
    return r;
  }

  /* ── Firestore value <-> JS ── */
  function toValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (Buffer.isBuffer(v)) return { bytesValue: v.toString('base64') };
    if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => toValue(x === undefined ? null : x)) } };
    switch (typeof v) {
      case 'boolean': return { booleanValue: v };
      case 'number':
        if (Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER) return { integerValue: String(v) };
        return { doubleValue: Number.isFinite(v) ? v : 0 };
      case 'string': return { stringValue: v };
      case 'object': return { mapValue: { fields: toFields(v) } };
      default: return { nullValue: null };
    }
  }
  function toFields(obj) {
    const out = {};
    Object.keys(obj).forEach((k) => { if (obj[k] !== undefined && typeof obj[k] !== 'function') out[k] = toValue(obj[k]); });
    return out;
  }
  function fromValue(v) {
    if (!v || 'nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('bytesValue' in v) return Buffer.from(v.bytesValue, 'base64');
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
    if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
    if ('referenceValue' in v) return v.referenceValue;
    if ('geoPointValue' in v) return v.geoPointValue;
    return null;
  }
  function fromFields(fields) {
    const out = {};
    Object.keys(fields || {}).forEach((k) => { out[k] = fromValue(fields[k]); });
    return out;
  }

  /* doc id ที่ Firestore ยอมรับ (ห้าม / , . , .. , __x__ , ยาวเกิน 1500 bytes) */
  function docId(key) {
    const k = String(key);
    if (!k || k.includes('/') || k === '.' || k === '..' || /^__.*__$/.test(k) || Buffer.byteLength(k) > 1400) {
      return 'k_' + Buffer.from(k).toString('hex').slice(0, 1400);
    }
    return k;
  }
  const docPath = (col, id) => `${DB}/${col}/${encodeURIComponent(id)}`;
  const docName = (col, id) => `${DB}/${col}/${id}`;

  async function getDoc(col, id) {
    const r = await api('GET', docPath(col, id));
    if (r.status === 404 || !r.body || !r.body.fields) return null;
    return fromFields(r.body.fields);
  }

  async function listCollection(col) {
    const out = [];
    let pageToken = '';
    do {
      const q = `${DB}/${col}?pageSize=300` + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
      const r = await api('GET', q);
      if (r.status === 404 || !r.body) break;
      (r.body.documents || []).forEach((d) => {
        out.push({ id: decodeURIComponent(d.name.split('/').pop()), data: fromFields(d.fields || {}) });
      });
      pageToken = r.body.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  /* writes: [{ update: {col,id,data} } | { delete: {col,id} }] */
  async function commit(writes) {
    for (let i = 0; i < writes.length; i += MAX_WRITES_PER_COMMIT) {
      const slice = writes.slice(i, i + MAX_WRITES_PER_COMMIT).map((w) => {
        if (w.delete) return { delete: docName(w.delete.col, w.delete.id) };
        return { update: { name: docName(w.update.col, w.update.id), fields: toFields(w.update.data) } };
      });
      await api('POST', `${DB}:commit`, { writes: slice });
    }
  }

  /* ── local file helpers ── */
  function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
  }
  function writeJson(file, obj, pretty) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, pretty ? 2 : 0), 'utf8');
    try { fs.renameSync(tmp, file); }
    catch (e) { try { fs.unlinkSync(file); } catch (e2) { } fs.renameSync(tmp, file); }
  }
  const stable = (o) => JSON.stringify(o);

  /* ── snapshot ล่าสุดที่ sync แล้ว (ใช้ diff) ── */
  const synced = { users: new Map(), settings: '', analytics: '', visitors: [], uploads: new Map() };

  /* ── push: users ── */
  async function pushUsers() {
    const users = readJson(files.users, {});
    if (!users || typeof users !== 'object' || Array.isArray(users)) return;
    const writes = [];
    const seen = new Set();
    Object.keys(users).forEach((key) => {
      const id = docId(key);
      seen.add(id);
      const s = stable(users[key]);
      if (synced.users.get(id) === s) return;
      writes.push({ update: { col: 'users', id, data: Object.assign({}, users[key], { _key: key }) }, _id: id, _s: s });
    });
    [...synced.users.keys()].forEach((id) => {
      if (!seen.has(id)) writes.push({ delete: { col: 'users', id }, _id: id });
    });
    if (!writes.length) return;
    await commit(writes);
    writes.forEach((w) => { if (w.delete) synced.users.delete(w._id); else synced.users.set(w._id, w._s); });
  }

  async function pushSettings() {
    const s = readJson(files.settings, null);
    if (!s || typeof s !== 'object') return;
    const str = stable(s);
    if (str === synced.settings) return;
    await commit([{ update: { col: 'app', id: 'site-settings', data: s } }]);
    synced.settings = str;
  }

  async function pushAnalytics() {
    const a = readJson(files.analytics, null);
    if (!a || typeof a !== 'object') return;
    const visitors = Array.isArray(a.uniqueVisitorsSet) ? a.uniqueVisitorsSet : [];
    const rest = Object.assign({}, a);
    delete rest.uniqueVisitorsSet;
    const writes = [];
    const str = stable(rest);
    const chunks = [];
    for (let i = 0; i < visitors.length; i += VISITOR_CHUNK) chunks.push(stable(visitors.slice(i, i + VISITOR_CHUNK)));
    if (str !== synced.analytics || chunks.length !== synced.visitors.length) {
      writes.push({ update: { col: 'app', id: 'analytics', data: Object.assign({}, rest, { visitorChunks: chunks.length }) } });
    }
    chunks.forEach((c, i) => {
      if (synced.visitors[i] !== c) writes.push({ update: { col: 'analyticsVisitors', id: 'chunk-' + i, data: { ids: JSON.parse(c) } } });
    });
    for (let i = chunks.length; i < synced.visitors.length; i++) writes.push({ delete: { col: 'analyticsVisitors', id: 'chunk-' + i } });
    if (!writes.length) return;
    await commit(writes);
    synced.analytics = str;
    synced.visitors = chunks;
  }

  /* ── uploads (รูปสปอนเซอร์ / สกินผู้ใช้) ── */
  const SAFE_UPLOAD = /^[A-Za-z0-9._-]+$/;
  async function pushUploads() {
    if (!fs.existsSync(files.uploadDir)) return;
    const names = fs.readdirSync(files.uploadDir).filter((n) => SAFE_UPLOAD.test(n) && !n.endsWith('.tmp'));
    const present = new Set(names);
    for (const name of names) {
      const full = path.join(files.uploadDir, name);
      let st;
      try { st = fs.statSync(full); } catch (e) { continue; }
      if (!st.isFile()) continue;
      const buf = fs.readFileSync(full);
      const hash = crypto.createHash('sha1').update(buf).digest('hex');
      const prev = synced.uploads.get(name);
      if (prev && prev.hash === hash) continue;
      const parts = Math.max(1, Math.ceil(buf.length / PART_BYTES));
      const writes = [];
      for (let i = 0; i < parts; i++) {
        writes.push({ update: { col: `uploads/${docId(name)}/parts`, id: String(i), data: { b: buf.subarray(i * PART_BYTES, (i + 1) * PART_BYTES) } } });
      }
      for (let i = parts; prev && i < prev.parts; i++) writes.push({ delete: { col: `uploads/${docId(name)}/parts`, id: String(i) } });
      writes.push({ update: { col: 'uploads', id: docId(name), data: { name, size: buf.length, parts, hash, updatedAt: new Date().toISOString() } } });
      // ส่งทีละไฟล์ (แต่ละ part ใหญ่ → แยก commit กันเกินขนาด request)
      for (const w of writes) await commit([w]);
      synced.uploads.set(name, { hash, parts });
    }
    for (const [name, meta] of [...synced.uploads.entries()]) {
      if (present.has(name)) continue;
      const writes = [{ delete: { col: 'uploads', id: docId(name) } }];
      for (let i = 0; i < meta.parts; i++) writes.push({ delete: { col: `uploads/${docId(name)}/parts`, id: String(i) } });
      await commit(writes);
      synced.uploads.delete(name);
    }
  }

  /* ── hydrate (เปิดเซิร์ฟเวอร์) ── */
  async function hydrate() {
    if (!enabled) {
      log('ไม่พบ service account → ใช้ไฟล์ data/*.json ในเครื่องอย่างเดียว');
      return { enabled: false };
    }
    log(`เชื่อมต่อ Firestore project "${projectId}" ...`);
    const stats = { users: 0, migrated: [] };

    // users
    const userDocs = await listCollection('users');
    if (userDocs.length) {
      const users = {};
      userDocs.forEach((d) => {
        const key = d.data._key || d.id;
        const u = Object.assign({}, d.data);
        delete u._key;
        users[key] = u;
        synced.users.set(d.id, stable(u));
      });
      writeJson(files.users, users, false);
      stats.users = userDocs.length;
    } else if (fs.existsSync(files.users)) {
      await pushUsers();
      stats.migrated.push('users');
    }

    // site settings
    const settings = await getDoc('app', 'site-settings');
    if (settings) {
      writeJson(files.settings, settings, true);
      synced.settings = stable(settings);
    } else if (fs.existsSync(files.settings)) {
      await pushSettings();
      stats.migrated.push('site-settings');
    }

    // analytics
    const analytics = await getDoc('app', 'analytics');
    if (analytics) {
      const n = Number(analytics.visitorChunks) || 0;
      delete analytics.visitorChunks;
      const chunks = [];
      let visitors = [];
      for (let i = 0; i < n; i++) {
        const c = await getDoc('analyticsVisitors', 'chunk-' + i);
        const ids = c && Array.isArray(c.ids) ? c.ids : [];
        chunks.push(stable(ids));
        visitors = visitors.concat(ids);
      }
      synced.analytics = stable(analytics);
      synced.visitors = chunks;
      writeJson(files.analytics, Object.assign({}, analytics, { uniqueVisitorsSet: visitors }), true);
    } else if (fs.existsSync(files.analytics)) {
      await pushAnalytics();
      stats.migrated.push('analytics');
    }

    // uploads
    const upDocs = await listCollection('uploads');
    if (upDocs.length) {
      if (!fs.existsSync(files.uploadDir)) fs.mkdirSync(files.uploadDir, { recursive: true });
      for (const d of upDocs) {
        const name = d.data.name;
        if (!name || !SAFE_UPLOAD.test(name)) continue;
        const parts = [];
        for (let i = 0; i < (d.data.parts || 0); i++) {
          const p = await getDoc(`uploads/${d.id}/parts`, String(i));
          if (p && Buffer.isBuffer(p.b)) parts.push(p.b);
        }
        const buf = Buffer.concat(parts);
        if (buf.length !== d.data.size) { warn('ไฟล์อัปโหลดไม่ครบ:', name); continue; }
        fs.writeFileSync(path.join(files.uploadDir, name), buf);
        synced.uploads.set(name, { hash: d.data.hash, parts: d.data.parts });
      }
    } else {
      await pushUploads();
      if (synced.uploads.size) stats.migrated.push('uploads');
    }

    log(`พร้อมใช้งาน · users ${stats.users || synced.users.size}` +
      (stats.migrated.length ? ` · ย้ายข้อมูลเดิมขึ้น Firestore: ${stats.migrated.join(', ')}` : ''));
    return { enabled: true, projectId, migrated: stats.migrated };
  }

  /* ── schedule / flush (debounce + ทำทีละงาน) ── */
  const pushers = { users: pushUsers, settings: pushSettings, analytics: pushAnalytics, uploads: pushUploads };
  const delays = { users: 400, settings: 400, analytics: 5000, uploads: 400 };
  const timers = {};
  const dirty = new Set();
  let chain = Promise.resolve();
  let hydrated = false;

  function runKind(kind) {
    dirty.delete(kind);
    chain = chain.then(() => pushers[kind]()).catch((err) => {
      warn(`sync ${kind} ล้มเหลว:`, err.message || err);
      // ลองใหม่ภายหลัง
      schedule(kind, 15000);
    });
    return chain;
  }

  function schedule(kind, delay) {
    if (!enabled || !pushers[kind]) return;
    dirty.add(kind);
    if (!hydrated) return; // ยัง hydrate ไม่เสร็จ — จะ flush หลัง hydrate
    clearTimeout(timers[kind]);
    timers[kind] = setTimeout(() => runKind(kind), delay == null ? delays[kind] : delay);
  }

  async function flush() {
    if (!enabled) return;
    Object.keys(timers).forEach((k) => clearTimeout(timers[k]));
    [...dirty].forEach((k) => runKind(k));
    await chain.catch(() => { });
  }

  /* ถ้า hydrate ล้มเหลว จะไม่ push ข้อมูลในเครื่องขึ้นไปทับ Firestore — ลอง hydrate ใหม่เป็นระยะ */
  async function tryHydrate() {
    const info = await hydrate();
    hydrated = true;
    [...dirty].forEach((k) => schedule(k));
    return info;
  }

  async function init() {
    if (!enabled) return hydrate();
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return await tryHydrate(); }
      catch (err) {
        lastErr = err;
        warn(`hydrate ครั้งที่ ${attempt} ไม่สำเร็จ:`, err.message || err);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    warn('ใช้ไฟล์ในเครื่องชั่วคราว — จะลองเชื่อม Firestore ใหม่ทุก 60 วินาที');
    const retry = setInterval(() => {
      tryHydrate().then(() => { clearInterval(retry); log('เชื่อม Firestore สำเร็จ'); }).catch(() => { });
    }, 60000);
    if (retry.unref) retry.unref();
    return { enabled, error: String(lastErr && lastErr.message || lastErr) };
  }

  return { enabled, projectId, init, schedule, flush };
}

module.exports = { createStore };
