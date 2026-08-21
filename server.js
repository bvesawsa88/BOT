const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = +(process.env.PORT || 3000);
const ROOT = __dirname;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const FEEDBACK_WEBHOOK = process.env.DISCORD_FEEDBACK_WEBHOOK || process.env.FEEDBACK_WEBHOOK || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

function lanIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      const fam = i.family;
      if ((fam === 'IPv4' || fam === 4) && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function readBody(req, limit) {
  const max = limit || 65536;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function clip(s, n) {
  const t = String(s == null ? '' : s);
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(out);
        else reject(new Error('webhook HTTP ' + res.statusCode + ': ' + out));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function isDiscordWebhook(url) {
  return /^https:\/\/(?:discord(?:app)?\.com|discordapp\.com)\/api\/webhooks\//i.test(url);
}

function buildFeedbackDiscord(body) {
  const text = clip(body.text, 1800);
  const fields = [
    { name: 'หน้าจอ', value: clip(body.screen || '?', 256), inline: true },
    { name: 'โหมด', value: clip(body.mode || '?', 256), inline: true },
    { name: 'ห้อง', value: clip(body.room || '—', 256), inline: true },
  ];
  if (body.turn != null) {
    fields.push({
      name: 'สถานะเกม',
      value: clip('turn ' + body.turn + ' · phase ' + (body.phase || '?') + ' · active ' + (body.active || '?'), 1024),
      inline: false,
    });
  }
  if (body.log && body.log.length) {
    fields.push({ name: 'Log ล่าสุด', value: '```\n' + clip(body.log.join('\n'), 900) + '\n```', inline: false });
  }
  if (body.zones && typeof body.zones === 'object') {
    const zLines = Object.keys(body.zones).map((z) => z + ': ' + (body.zones[z] || []).join(', '));
    if (zLines.length) fields.push({ name: 'Zones', value: clip(zLines.join('\n'), 900), inline: false });
  }
  if (body.url) fields.push({ name: 'URL', value: clip(body.url, 512), inline: false });
  if (body.ua) fields.push({ name: 'User-Agent', value: clip(body.ua, 512), inline: false });

  return {
    username: 'BoT Table — แจ้งบัค',
    embeds: [{
      title: '🐞 แจ้งบัค',
      description: text,
      color: 0xc9a227,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };
}

async function handleFeedback(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    });
    res.end();
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    fs.readFile(path.join(ROOT, 'feedback.html'), (err, data) => {
      if (err) {
        res.writeHead(302, { Location: '/feedback', 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(data);
    });
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, m: 'method not allowed' });
    return;
  }
  if (!FEEDBACK_WEBHOOK || !isDiscordWebhook(FEEDBACK_WEBHOOK)) {
    console.warn('[feedback] ตั้ง DISCORD_FEEDBACK_WEBHOOK บน Render (Discord webhook URL)');
    json(res, 503, { ok: false, m: 'webhook not configured' });
    return;
  }
  try {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw || '{}'); } catch (e) { json(res, 400, { ok: false, m: 'invalid json' }); return; }
    const text = String(body.text || '').trim();
    if (!text) { json(res, 400, { ok: false, m: 'empty text' }); return; }
    await postJson(FEEDBACK_WEBHOOK, buildFeedbackDiscord(body));
    console.log('[feedback] sent to Discord');
    json(res, 200, { ok: true });
  } catch (e) {
    console.error('[feedback]', e.message || e);
    json(res, 502, { ok: false, m: 'discord send failed' });
  }
}

/* ── Auth + เก็บเด็คต่อบัญชี (ไฟล์ data/users.json ไม่ขึ้น git) ── */
const USERS_FILE = path.join(ROOT, 'data', 'users.json');
const USER_RE = /^[A-Za-z0-9_\u0E00-\u0E7F]{3,20}$/;
const CODE_RE = /^[A-Za-z0-9]{2,12}-\d{2,4}$/;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DECKS = 40;
const FREE_MAX_DECKS = 5;
const SUPPORTER_MAX_DECKS = 40;

function isSupporterUser(u) {
  return !!(u && (u.isSupporter || u.role === 'admin'));
}

function userMaxDecks(u) {
  if (u && typeof u.maxDecks === 'number' && u.maxDecks > 0) return u.maxDecks;
  return isSupporterUser(u) ? SUPPORTER_MAX_DECKS : FREE_MAX_DECKS;
}

function canUseCustomSkins(u) {
  if (u && typeof u.customSkinsAllowed === 'boolean') return u.customSkinsAllowed;
  return isSupporterUser(u);
}

function loadUsers() {

  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users), 'utf8');
  try {
    fs.renameSync(tmp, USERS_FILE);
  } catch (e) {
    try { fs.unlinkSync(USERS_FILE); } catch (e2) { }
    fs.renameSync(tmp, USERS_FILE);
  }
}

let userChain = Promise.resolve();
function mutateUsers(fn) {
  const p = userChain.then(async () => {
    const users = loadUsers();
    const result = await fn(users);
    saveUsers(users);
    return result;
  });
  userChain = p.catch((err) => { console.error('[auth]', err); });
  return p;
}

function scryptHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = String(h).match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : '';
}

function findByToken(users, token) {
  if (!token) return null;
  const now = Date.now();
  for (const key of Object.keys(users)) {
    const u = users[key];
    if (u && u.token === token && u.tokenExp && u.tokenExp > now) return { key, user: u };
  }
  return null;
}

function sanitizeCounts(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [code, n] of Object.entries(obj)) {
    const c = String(code).toUpperCase();
    if (!CODE_RE.test(c)) continue;
    const num = Math.max(0, Math.min(99, parseInt(n, 10) || 0));
    if (num) out[c] = num;
    if (Object.keys(out).length >= 80) break;
  }
  return out;
}

function sanitizeDecks(raw, maxLimit) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const limit = typeof maxLimit === 'number' && maxLimit > 0 ? maxLimit : MAX_DECKS;
  for (const name of Object.keys(raw).slice(0, limit)) {
    const n = String(name).trim().slice(0, 40);
    if (!n) continue;
    const d = raw[name];
    if (!d || typeof d !== 'object') continue;
    out[n] = { main: sanitizeCounts(d.main), life: sanitizeCounts(d.life) };
  }
  return out;
}

function authCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function isAdminUser(u) {
  return !!(u && u.role === 'admin');
}

function issueSession(user) {
  user.token = newToken();
  user.tokenExp = Date.now() + TOKEN_TTL_MS;
  return {
    ok: true,
    token: user.token,
    username: user.username,
    admin: isAdminUser(user),
    isSupporter: isSupporterUser(user),
    maxDecks: userMaxDecks(user),
    customSkinsAllowed: canUseCustomSkins(user)
  };
}

async function handleAuth(req, res, urlPath) {
  authCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const route = urlPath.replace(/\/+$/, '') || '/';

  if (route === '/auth/register' || route === '/auth/login') {
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
    let body;
    try { body = JSON.parse(await readBody(req, 4096) || '{}'); }
    catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!USER_RE.test(username)) {
      json(res, 400, { ok: false, error: 'ชื่อผู้ใช้ 3–20 ตัว (อังกฤษ ตัวเลข _ หรือไทย)' });
      return;
    }
    if (password.length < 6 || password.length > 64) {
      json(res, 400, { ok: false, error: 'รหัสผ่านอย่างน้อย 6 ตัว' });
      return;
    }
    const key = username.toLowerCase();
    const isReg = route === '/auth/register';
    try {
      const out = await mutateUsers(async (users) => {
        if (isReg) {
          if (key === 'admin' || (users[key] && isAdminUser(users[key]))) {
            return { status: 409, body: { ok: false, error: 'ชื่อนี้ใช้ไม่ได้' } };
          }
          if (users[key]) return { status: 409, body: { ok: false, error: 'ชื่อนี้มีคนใช้แล้ว' } };
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = await scryptHash(password, salt);
          users[key] = {
            username,
            salt,
            hash,
            decks: {},
            createdAt: new Date().toISOString(),
          };
          return { status: 200, body: issueSession(users[key]) };
        }
        const u = users[key];
        if (!u || !u.salt || !u.hash) return { status: 401, body: { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } };
        const hash = await scryptHash(password, u.salt);
        let ok = false;
        try {
          ok = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(String(u.hash), 'hex'));
        } catch (e) { ok = false; }
        if (!ok) return { status: 401, body: { ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' } };
        u.username = u.username || username;
        return { status: 200, body: issueSession(u) };
      });
      json(res, out.status, out.body);
    } catch (e) {
      console.error('[auth]', e.message || e);
      json(res, 500, { ok: false, error: 'server error' });
    }
    return;
  }

  if (route === '/auth/me' || route === '/auth/decks') {
    const token = bearer(req);
    const users = loadUsers();
    const hit = findByToken(users, token);
    if (!hit) { json(res, 401, { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }); return; }

    if (route === '/auth/me') {
      if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
      json(res, 200, {
        ok: true,
        username: hit.user.username,
        admin: isAdminUser(hit.user),
        isSupporter: isSupporterUser(hit.user),
        maxDecks: userMaxDecks(hit.user),
        customSkinsAllowed: canUseCustomSkins(hit.user)
      });
      return;
    }

    if (req.method === 'GET') {
      json(res, 200, {
        ok: true,
        decks: hit.user.decks && typeof hit.user.decks === 'object' ? hit.user.decks : {},
        maxDecks: userMaxDecks(hit.user),
        isSupporter: isSupporterUser(hit.user)
      });
      return;
    }
    if (req.method === 'PUT') {
      let body;
      try { body = JSON.parse(await readBody(req, 262144) || '{}'); }
      catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
      const maxLimit = userMaxDecks(hit.user);
      const reqDeckCount = body.decks && typeof body.decks === 'object' ? Object.keys(body.decks).length : 0;
      if (reqDeckCount > maxLimit) {
        json(res, 403, {
          ok: false,
          error: `จำกัดบันทึกได้สูงสุด ${maxLimit} เด็ค (ติดต่อแอดมินหรือเลี้ยงกาแฟเพื่อปลดล็อก ${SUPPORTER_MAX_DECKS} เด็ค)`
        });
        return;
      }
      try {
        const saved = await mutateUsers((users2) => {
          const h = findByToken(users2, token);
          if (!h) return { ok: false };
          h.user.decks = sanitizeDecks(body.decks, maxLimit);
          return { ok: true };
        });
        if (!saved || !saved.ok) { json(res, 401, { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }); return; }
        json(res, 200, { ok: true, maxDecks: maxLimit });
      } catch (e) {
        console.error('[auth]', e.message || e);
        json(res, 500, { ok: false, error: 'server error' });
      }
      return;
    }
    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  if (route === '/auth/skins' || route === '/auth/skins/upload') {
    await handleAuthSkins(req, res, route);
    return;
  }

  json(res, 404, { ok: false, error: 'not found' });
}

/* ── ตั้งค่าเว็บ (สปอนเซอร์ / ประกาศ) — แก้จากหน้าแอดมิน ไม่ต้องแตะโค้ด ── */
const SETTINGS_FILE = path.join(ROOT, 'data', 'site-settings.json');
const UPLOAD_DIR = path.join(ROOT, 'data', 'uploads');
const SKINS_FILE = path.join(ROOT, 'data', 'skins.json');
const SPONSOR_SLOTS = ['cardBack', 'lifeBack', 'playmat', 'playmatOpp'];

function loadBaseSkins() {
  try {
    const obj = JSON.parse(fs.readFileSync(SKINS_FILE, 'utf8'));
    if (obj && typeof obj === 'object') return obj;
  } catch (e) { }
  return {
    defaultPack: 'official', fallbackPack: 'official', sponsorPack: 'tinny',
    packs: [],
  };
}

function defaultSponsorFromSkins() {
  const skins = loadBaseSkins();
  const id = skins.sponsorPack || 'tinny';
  const sp = (skins.packs || []).find((p) => p.id === id)
    || (skins.packs || []).find((p) => p.tier === 'sponsor')
    || null;
  if (!sp) {
    return {
      id: 'tinny', name: 'TINNY', label: 'สปอน · TINNY Cafe',
      cardBack: 'assets/skins/tinny/card-back.png',
      lifeBack: 'assets/skins/tinny/life-back.png',
      playmat: 'assets/skins/tinny/playmat.png',
      playmatOpp: 'assets/skins/tinny/playmat-opp.png',
    };
  }
  return {
    id: sp.id,
    name: sp.name || sp.id,
    label: sp.label || sp.name || sp.id,
    cardBack: sp.cardBack || '',
    lifeBack: sp.lifeBack || '',
    playmat: sp.playmat || '',
    playmatOpp: sp.playmatOpp || '',
  };
}

function defaultSiteSettings() {
  const skins = loadBaseSkins();
  return {
    sponsorEnabled: true,
    sponsorPack: skins.sponsorPack || 'tinny',
    notice: '',
    promptpay: '',
    truemoney: '',
    sponsor: defaultSponsorFromSkins(),
  };
}

function loadSiteSettings() {
  const base = defaultSiteSettings();
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return base;
    return {
      sponsorEnabled: raw.sponsorEnabled !== false,
      sponsorPack: String(raw.sponsorPack || base.sponsorPack),
      notice: String(raw.notice || ''),
      promptpay: String(raw.promptpay || ''),
      truemoney: String(raw.truemoney || ''),
      sponsor: Object.assign({}, base.sponsor, raw.sponsor || {}),
    };
  } catch (e) {
    return base;
  }
}

function saveSiteSettings(s) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
  try { fs.renameSync(tmp, SETTINGS_FILE); }
  catch (e) {
    try { fs.unlinkSync(SETTINGS_FILE); } catch (e2) { }
    fs.renameSync(tmp, SETTINGS_FILE);
  }
}

function safeImgPath(p, fallback) {
  const s = String(p || '').trim().split('?')[0];
  if (!s || s.includes('..') || s.includes('\\')) return fallback;
  if (/^assets\/[A-Za-z0-9._\-\/]+$/.test(s)) return s;
  if (/^\/?data\/uploads\/[A-Za-z0-9._-]+$/.test(s)) return s.charAt(0) === '/' ? s : '/' + s;
  return fallback;
}

function publicSkins() {
  const skins = loadBaseSkins();
  const set = loadSiteSettings();
  const sp = set.sponsor || defaultSponsorFromSkins();
  const packs = (skins.packs || []).map((p) => {
    if (p.id !== sp.id) return p;
    return Object.assign({}, p, {
      name: clip(sp.name || p.name, 24),
      label: clip(sp.label || p.label || p.name, 60),
      cardBack: safeImgPath(sp.cardBack, p.cardBack),
      lifeBack: safeImgPath(sp.lifeBack, p.lifeBack),
      playmat: safeImgPath(sp.playmat, p.playmat),
      playmatOpp: safeImgPath(sp.playmatOpp, p.playmatOpp || ''),
      tier: 'sponsor',
    });
  });
  const sponsorId = set.sponsorEnabled ? (sp.id || set.sponsorPack || 'tinny') : (skins.fallbackPack || 'official');
  return {
    defaultPack: skins.defaultPack || 'official',
    fallbackPack: skins.fallbackPack || 'official',
    sponsorPack: sponsorId,
    packs,
  };
}

function publicSite() {
  const set = loadSiteSettings();
  return {
    ok: true,
    notice: clip(set.notice, 200),
    promptpay: String(set.promptpay || '').replace(/\D/g, '').slice(0, 15),
    truemoney: clip(set.truemoney, 200),
  };
}

function requireAdmin(req) {
  const hit = findByToken(loadUsers(), bearer(req));
  if (!hit || !isAdminUser(hit.user)) return null;
  return hit;
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: '.png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { ext: '.webp' };
  return null;
}

const SKIN_SLOTS = ['cardBack', 'lifeBack', 'playmat'];
const USER_SKIN_PATH_RE = /^\/data\/uploads\/user-[a-f0-9]{16}-(cardBack|lifeBack|playmat)\.(jpg|png|webp)$/;

function userSkinFileId(key) {
  return crypto.createHash('sha1').update('bot-skin:' + String(key)).digest('hex').slice(0, 16);
}

function allowedPlayerSkinIds() {
  const ids = ['custom'];
  const skins = loadBaseSkins();
  const sid = skins.sponsorPack || 'tinny';
  for (const p of skins.packs || []) {
    if (!p || !p.id) continue;
    if (p.tier === 'shop' || p.tier === 'sponsor' || p.id === sid) continue;
    ids.push(p.id);
  }
  return ids;
}

function sanitizeSkinSel(raw) {
  const d = { cardBack: 'official', lifeBack: 'official', playmat: 'official' };
  const allowed = new Set(allowedPlayerSkinIds());
  const packs = (loadBaseSkins().packs || []);
  if (!raw || typeof raw !== 'object') return d;
  for (const slot of SKIN_SLOTS) {
    const id = String(raw[slot] || '');
    if (!allowed.has(id)) continue;
    const p = packs.find((x) => x.id === id);
    if (p && p.playmatOnly && slot !== 'playmat') continue;
    d[slot] = id;
  }
  return d;
}

function readUserCustom(user) {
  const out = {};
  const c = user && user.customSkins;
  if (!c || typeof c !== 'object') return out;
  const uploadRoot = path.resolve(path.join(ROOT, 'data', 'uploads'));
  for (const slot of SKIN_SLOTS) {
    const p = String(c[slot] || '').split('?')[0];
    if (!USER_SKIN_PATH_RE.test(p)) continue;
    const fp = path.resolve(path.join(ROOT, p.replace(/^\//, '').replace(/\//g, path.sep)));
    if (fp !== uploadRoot && fp.indexOf(uploadRoot + path.sep) !== 0) continue;
    try {
      if (fs.existsSync(fp)) out[slot] = p;
    } catch (e) { }
  }
  return out;
}

async function handleAuthSkins(req, res, route) {
  const token = bearer(req);
  const hit0 = findByToken(loadUsers(), token);
  if (!hit0) { json(res, 401, { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }); return; }

  const allowedCustom = canUseCustomSkins(hit0.user);

  if (route === '/auth/skins') {
    if (req.method === 'GET') {
      json(res, 200, {
        ok: true,
        sel: sanitizeSkinSel(hit0.user.skins),
        custom: readUserCustom(hit0.user),
        customAllowed: allowedCustom,
        isSupporter: isSupporterUser(hit0.user)
      });
      return;
    }
    if (req.method === 'PUT') {
      let body;
      try { body = JSON.parse(await readBody(req, 8192) || '{}'); }
      catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
      if (!allowedCustom && body.sel && Object.values(body.sel).includes('custom')) {
        json(res, 403, { ok: false, error: 'ฟังก์ชันคัสตอมสนามและการ์ดเปิดให้เฉพาะผู้สนับสนุน (เลี้ยงกาแฟ) — ติดต่อแอดมินเพื่อปลดล็อก' });
        return;
      }
      try {
        const saved = await mutateUsers((users2) => {
          const h = findByToken(users2, token);
          if (!h) return { ok: false };
          h.user.skins = sanitizeSkinSel(body.sel);
          return { ok: true, sel: h.user.skins };
        });
        if (!saved || !saved.ok) { json(res, 401, { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }); return; }
        json(res, 200, { ok: true, sel: saved.sel });
      } catch (e) {
        console.error('[auth]', e.message || e);
        json(res, 500, { ok: false, error: 'server error' });
      }
      return;
    }
    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
  if (!allowedCustom) {
    json(res, 403, { ok: false, error: 'ฟังก์ชันคัสตอมสนามและการ์ดเปิดให้เฉพาะผู้สนับสนุน (เลี้ยงกาแฟ) — ติดต่อแอดมินเพื่อปลดล็อก' });
    return;
  }
  let body;
  try { body = JSON.parse(await readBody(req, 600000) || '{}'); }
  catch (e) { json(res, 400, { ok: false, error: 'รูปใหญ่เกินไปหรือไฟล์ไม่ถูกต้อง' }); return; }
  const slot = String(body.slot || '');
  if (!SKIN_SLOTS.includes(slot)) { json(res, 400, { ok: false, error: 'ช่องรูปไม่ถูกต้อง' }); return; }
  let raw = String(body.data || '');
  const dm = raw.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
  if (dm) raw = dm[1];
  let buf;
  try { buf = Buffer.from(raw, 'base64'); }
  catch (e) { json(res, 400, { ok: false, error: 'ไฟล์ไม่ถูกต้อง' }); return; }
  if (!buf.length || buf.length > 400000) { json(res, 400, { ok: false, error: 'รูปใหญ่เกินไป' }); return; }
  const kind = sniffImage(buf);
  if (!kind) { json(res, 400, { ok: false, error: 'ใช้ได้เฉพาะ PNG / JPG / WEBP' }); return; }
  const fileId = userSkinFileId(hit0.key);
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  ['.png', '.jpg', '.webp'].forEach((ext) => {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, 'user-' + fileId + '-' + slot + ext)); } catch (e) { }
  });
  const filename = 'user-' + fileId + '-' + slot + kind.ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  const url = '/data/uploads/' + filename;
  try {
    const saved = await mutateUsers((users2) => {
      const h = findByToken(users2, token);
      if (!h) return { ok: false };
      h.user.skins = sanitizeSkinSel(Object.assign({}, h.user.skins, { [slot]: 'custom' }));
      h.user.customSkins = Object.assign({}, h.user.customSkins || {}, { [slot]: url });
      return { ok: true, url, sel: h.user.skins, custom: readUserCustom(h.user) };
    });
    if (!saved || !saved.ok) { json(res, 401, { ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }); return; }
    json(res, 200, { ok: true, url: saved.url, sel: saved.sel, custom: saved.custom });
  } catch (e) {
    console.error('[auth]', e.message || e);
    json(res, 500, { ok: false, error: 'server error' });
  }
}

/* ครั้งแรก / เว็บที่ยังไม่เคยตั้งรหัส = 123456 · ถ้าเคยเปลี่ยนใน /admin แล้วจะไม่ถูกทับ
   ตั้ง BOT_ADMIN_PASSWORD บนโฮสต์ถ้ายกเลิกรหัสเริ่มต้น */
const ADMIN_PASS_REV = 1;
const DEFAULT_ADMIN_PASSWORD = '123456';

async function writeAdminPassword(user, password) {
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = await scryptHash(password, user.salt);
  user.role = 'admin';
  user.username = user.username || 'admin';
  user.passRev = ADMIN_PASS_REV;
  delete user.token;
  delete user.tokenExp;
}

async function ensureAdmin() {
  const fromEnv = String(process.env.BOT_ADMIN_PASSWORD || '').trim();
  const password = fromEnv || DEFAULT_ADMIN_PASSWORD;
  if (password.length < 6) return { created: false, error: 'BOT_ADMIN_PASSWORD สั้นเกินไป' };
  const users = loadUsers();
  let admin = Object.values(users).find(isAdminUser) || users.admin || null;
  if (admin && admin.hash) {
    admin.role = 'admin';
    const force = !!fromEnv;
    const stale = !admin.passRev || admin.passRev < ADMIN_PASS_REV;
    if (!force && !stale) {
      saveUsers(users);
      return { created: false };
    }
    await writeAdminPassword(admin, password);
    saveUsers(users);
    return { created: false, reset: true, password: fromEnv ? '' : password };
  }
  users.admin = {
    username: 'admin',
    decks: {},
    createdAt: new Date().toISOString(),
  };
  await writeAdminPassword(users.admin, password);
  saveUsers(users);
  return { created: true, password: fromEnv ? '' : password };
}

function serveAdminPage(res) {
  fs.readFile(path.join(ROOT, 'admin.html'), (err, data) => {
    if (err) { json(res, 404, { ok: false, error: 'admin.html missing' }); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

async function handleAdminApi(req, res, urlPath) {
  authCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const route = urlPath.replace(/\/+$/, '') || '/';
  const admin = requireAdmin(req);
  if (!admin) { json(res, 401, { ok: false, error: 'ต้องเป็นแอดมิน' }); return; }

  if (route === '/admin/settings') {
    if (req.method === 'GET') { json(res, 200, { ok: true, settings: loadSiteSettings() }); return; }
    if (req.method !== 'PUT') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
    let body;
    try { body = JSON.parse(await readBody(req, 65536) || '{}'); }
    catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
    const cur = loadSiteSettings();
    const spIn = body.sponsor && typeof body.sponsor === 'object' ? body.sponsor : {};
    const next = {
      sponsorEnabled: body.sponsorEnabled !== false,
      sponsorPack: cur.sponsorPack,
      notice: clip(body.notice, 200),
      promptpay: String(body.promptpay || '').replace(/\D/g, '').slice(0, 15),
      truemoney: clip(body.truemoney, 200),
      sponsor: {
        id: cur.sponsor.id,
        name: clip(spIn.name != null ? spIn.name : cur.sponsor.name, 24),
        label: clip(spIn.label != null ? spIn.label : cur.sponsor.label, 60),
        cardBack: safeImgPath(spIn.cardBack, cur.sponsor.cardBack),
        lifeBack: safeImgPath(spIn.lifeBack, cur.sponsor.lifeBack),
        playmat: safeImgPath(spIn.playmat, cur.sponsor.playmat),
        playmatOpp: safeImgPath(spIn.playmatOpp, cur.sponsor.playmatOpp),
      },
    };
    saveSiteSettings(next);
    json(res, 200, { ok: true, settings: next });
    return;
  }

  if (route === '/admin/upload') {
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
    let body;
    try { body = JSON.parse(await readBody(req, 3500000) || '{}'); }
    catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
    const slot = String(body.slot || '');
    if (!SPONSOR_SLOTS.includes(slot)) { json(res, 400, { ok: false, error: 'ช่องรูปไม่ถูกต้อง' }); return; }
    let buf;
    try { buf = Buffer.from(String(body.data || ''), 'base64'); }
    catch (e) { json(res, 400, { ok: false, error: 'ไฟล์ไม่ถูกต้อง' }); return; }
    if (!buf.length || buf.length > 2500000) { json(res, 400, { ok: false, error: 'รูปใหญ่เกินไป (สูงสุด ~2MB)' }); return; }
    const kind = sniffImage(buf);
    if (!kind) { json(res, 400, { ok: false, error: 'ใช้ได้เฉพาะ PNG / JPG / WEBP' }); return; }
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    ['.png', '.jpg', '.webp'].forEach((ext) => {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, 'sponsor-' + slot + ext)); } catch (e) { }
    });
    const filename = 'sponsor-' + slot + kind.ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
    const url = '/data/uploads/' + filename + '?t=' + Date.now();
    const set = loadSiteSettings();
    set.sponsor[slot] = url.split('?')[0];
    saveSiteSettings(set);
    json(res, 200, { ok: true, url, settings: set });
    return;
  }

  if (route === '/admin/password') {
    if (req.method !== 'PUT') { json(res, 405, { ok: false, error: 'method not allowed' }); return; }
    let body;
    try { body = JSON.parse(await readBody(req, 4096) || '{}'); }
    catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
    const cur = String(body.password || '');
    const next = String(body.next || '');
    if (next.length < 6 || next.length > 64) { json(res, 400, { ok: false, error: 'รหัสใหม่ต้องอย่างน้อย 6 ตัว' }); return; }
    try {
      const out = await mutateUsers(async (users) => {
        const hit = findByToken(users, bearer(req));
        if (!hit || !isAdminUser(hit.user)) return { status: 401, body: { ok: false, error: 'ต้องเป็นแอดมิน' } };
        const hash = await scryptHash(cur, hit.user.salt);
        let ok = false;
        try { ok = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(String(hit.user.hash), 'hex')); }
        catch (e) { ok = false; }
        if (!ok) return { status: 401, body: { ok: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' } };
        await writeAdminPassword(hit.user, next);
        return { status: 200, body: issueSession(hit.user) };
      });
      json(res, out.status, out.body);
    } catch (e) {
      console.error('[admin]', e.message || e);
      json(res, 500, { ok: false, error: 'server error' });
    }
    return;
  }

  if (route === '/admin/users') {
    if (req.method === 'GET') {
      const users = loadUsers();
      const list = Object.entries(users).map(([k, u]) => {
        const d = u.decks && typeof u.decks === 'object' ? u.decks : {};
        const c = u.customSkins && typeof u.customSkins === 'object' ? u.customSkins : {};
        return {
          key: k,
          username: u.username || k,
          role: u.role || 'user',
          isSupporter: isSupporterUser(u),
          maxDecks: userMaxDecks(u),
          customSkinsAllowed: canUseCustomSkins(u),
          supporterNote: u.supporterNote || '',
          deckCount: Object.keys(d).length,
          createdAt: u.createdAt || null,
          customSkins: c,
        };
      });
      json(res, 200, { ok: true, users: list });
      return;
    }

    if (req.method === 'PUT') {
      let body;
      try { body = JSON.parse(await readBody(req, 8192) || '{}'); }
      catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
      const target = String(body.username || '').trim().toLowerCase();
      if (!target) { json(res, 400, { ok: false, error: 'ระบุ username' }); return; }

      try {
        const result = await mutateUsers(async (users) => {
          const u = users[target];
          if (!u) return { status: 404, body: { ok: false, error: 'ไม่พบผู้ใช้นี้' } };

          if (typeof body.isSupporter === 'boolean') {
            u.isSupporter = body.isSupporter;
            if (body.isSupporter) {
              if (!u.maxDecks || u.maxDecks <= FREE_MAX_DECKS) u.maxDecks = SUPPORTER_MAX_DECKS;
              if (typeof u.customSkinsAllowed !== 'boolean') u.customSkinsAllowed = true;
            }
          }
          if (typeof body.maxDecks === 'number' && body.maxDecks > 0) {
            u.maxDecks = Math.max(1, Math.min(100, Math.floor(body.maxDecks)));
          }
          if (typeof body.customSkinsAllowed === 'boolean') {
            u.customSkinsAllowed = body.customSkinsAllowed;
          }
          if (typeof body.supporterNote === 'string') {
            u.supporterNote = clip(body.supporterNote, 300);
          }
          if (body.newPassword && typeof body.newPassword === 'string' && body.newPassword.length >= 6) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = await scryptHash(body.newPassword, salt);
            u.salt = salt;
            u.hash = hash;
            delete u.token;
            delete u.tokenExp;
          }

          return {
            status: 200,
            body: {
              ok: true,
              user: {
                username: u.username || target,
                role: u.role || 'user',
                isSupporter: isSupporterUser(u),
                maxDecks: userMaxDecks(u),
                customSkinsAllowed: canUseCustomSkins(u),
                supporterNote: u.supporterNote || '',
              }
            }
          };
        });
        json(res, result.status, result.body);
      } catch (e) {
        console.error('[admin]', e.message || e);
        json(res, 500, { ok: false, error: 'server error' });
      }
      return;
    }

    if (req.method === 'DELETE') {
      let body;
      try { body = JSON.parse(await readBody(req, 4096) || '{}'); }
      catch (e) { json(res, 400, { ok: false, error: 'invalid json' }); return; }
      const target = String(body.username || '').trim().toLowerCase();
      if (!target) { json(res, 400, { ok: false, error: 'ระบุ username' }); return; }

      try {
        const result = await mutateUsers((users) => {
          const u = users[target];
          if (!u) return { status: 404, body: { ok: false, error: 'ไม่พบผู้ใช้นี้' } };
          if (isAdminUser(u) || target === 'admin') {
            return { status: 403, body: { ok: false, error: 'ไม่สามารถลบบัญชีแอดมินได้' } };
          }
          delete users[target];
          return { status: 200, body: { ok: true } };
        });
        json(res, result.status, result.body);
      } catch (e) {
        console.error('[admin]', e.message || e);
        json(res, 500, { ok: false, error: 'server error' });
      }
      return;
    }

    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }

  json(res, 404, { ok: false, error: 'not found' });
}

const SERVER_BOOT_TIME = Date.now().toString(36);
function getServerVersion() {
  try {
    const files = [
      path.join(ROOT, 'index.html'),
      path.join(ROOT, 'js', 'game.js'),
      path.join(ROOT, 'js', 'bot-ai.js'),
      path.join(ROOT, 'js', 'carddb.js'),
      path.join(ROOT, 'css', 'style.css')
    ];
    let maxMtime = 0;
    for (const f of files) {
      if (fs.existsSync(f)) {
        const mt = fs.statSync(f).mtimeMs;
        if (mt > maxMtime) maxMtime = mt;
      }
    }
    return Math.floor(maxMtime / 1000).toString(36) + '-' + SERVER_BOOT_TIME;
  } catch (e) {
    return SERVER_BOOT_TIME;
  }
}

const server = http.createServer((req, res) => {
  // Security & Privacy Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  let urlPath = req.url.split('?')[0];

  // 🛡️ ป้องกันการเข้าถึงไฟล์และโฟลเดอร์ลับโดยตรง (tools, .git, server.js, users.json, etc.)
  const cleanPath = urlPath.replace(/\\/g, '/');
  const forbiddenPatterns = [
    /^\/tools(\/|$)/i,
    /^\/\./i,
    /\.env/i,
    /server\.js$/i,
    /download_assets\.js$/i,
    /package(-lock)?\.json$/i,
    /users\.json$/i,
    /feedback-log\.json$/i,
    /site-settings\.json$/i,
    /custom-decks\.json$/i
  ];
  if (forbiddenPatterns.some(pat => pat.test(cleanPath))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden: Protected Resource');
    return;
  }

  if (urlPath === '/feedback') {
    handleFeedback(req, res);
    return;
  }
  if (urlPath === '/auth' || urlPath.indexOf('/auth/') === 0) {
    handleAuth(req, res, urlPath).catch((err) => {
      console.error('[auth]', err);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }
  if (urlPath === '/api/version') {
    json(res, 200, {
      ok: true,
      version: getServerVersion(),
      timestamp: Date.now()
    });
    return;
  }
  if (urlPath === '/api/skins') {
    json(res, 200, publicSkins());
    return;
  }
  if (urlPath === '/api/site') {
    json(res, 200, publicSite());
    return;
  }
  if (urlPath === '/admin' || urlPath === '/admin/') {
    serveAdminPage(res);
    return;
  }
  if (urlPath.indexOf('/admin/') === 0) {
    handleAdminApi(req, res, urlPath).catch((err) => {
      console.error('[admin]', err);
      if (!res.headersSent) json(res, 500, { ok: false, error: 'server error' });
    });
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(ROOT, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('404 Not Found'); return; }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          res.end(d2);
        });
      } else {
        res.writeHead(500); res.end('Server Error');
      }
      return;
    }
    const isCode = ['.html', '.js', '.css', '.json'].includes(ext);
    const headers = {
      'Content-Type': mime,
      'Cache-Control': isCode ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400',
    };
    if (isCode) {
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

/* ── Minimal WebSocket (no npm deps) ── */
function encodeFrame(payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, data]);
}

function attachWs(socket) {
  let buf = Buffer.alloc(0);
  let closed = false;
  const api = {
    send(obj) {
      if (closed || socket.destroyed) return false;
      try {
        const raw = typeof obj === 'string' ? obj : JSON.stringify(obj);
        socket.write(encodeFrame(raw));
        return true;
      } catch (e) { return false; }
    },
    close() {
      if (closed) return;
      closed = true;
      try { socket.end(); } catch (e) { }
    },
    onMessage: null,
    onClose: null,
  };

  function emitClose() {
    if (closed) return;
    closed = true;
    if (api.onClose) api.onClose();
  }

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readUInt32BE(6));
        off = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      let payload = buf.slice(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.slice(off, off + 4);
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
        payload = out;
      }
      buf = buf.slice(off + maskLen + len);

      if (opcode === 0x8) { emitClose(); try { socket.end(); } catch (e) { } return; }
      if (opcode === 0x9) { // ping → pong
        try {
          const pong = Buffer.alloc(2 + payload.length);
          pong[0] = 0x8a;
          pong[1] = payload.length;
          payload.copy(pong, 2);
          socket.write(pong);
        } catch (e) { }
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        if (!api.onMessage) continue;
        try {
          const text = payload.toString('utf8');
          let msg;
          try { msg = JSON.parse(text); } catch (e) { msg = text; }
          api.onMessage(msg);
        } catch (e) { }
      }
    }
  });
  socket.on('close', emitClose);
  socket.on('error', emitClose);
  return api;
}

/* ── LAN presence lobby ── */
let nextPeerId = 1;
const lanPeers = new Map(); // id -> { id, nick, uid, status, ws, challengeTo, challengedBy }

function peerPublic(p) {
  return { id: p.id, nick: p.nick, status: p.status, uid: p.uid || '' };
}

function broadcastPeers() {
  const list = [...lanPeers.values()].map(peerPublic);
  for (const p of lanPeers.values()) {
    p.ws.send({ t: 'peers', you: p.id, list });
  }
}

function findPeer(id) {
  return lanPeers.get(id) || null;
}

function clearChallenge(p) {
  if (!p) return;
  if (p.challengeTo) {
    const t = findPeer(p.challengeTo);
    if (t && t.challengedBy === p.id) t.challengedBy = null;
    p.challengeTo = null;
  }
  if (p.challengedBy) {
    const f = findPeer(p.challengedBy);
    if (f && f.challengeTo === p.id) f.challengeTo = null;
    p.challengedBy = null;
  }
}

function removePeer(p) {
  if (!p || !lanPeers.has(p.id)) return;
  clearChallenge(p);
  if (p.challengeTo) {
    const t = findPeer(p.challengeTo);
    if (t) t.ws.send({ t: 'challengeGone', from: p.id });
  }
  if (p.challengedBy) {
    const f = findPeer(p.challengedBy);
    if (f) f.ws.send({ t: 'challengeResult', accept: false, id: p.id, nick: p.nick, reason: 'offline' });
  }
  lanPeers.delete(p.id);
  broadcastPeers();
}

function handleLanMessage(p, m) {
  if (!m || !m.t) return;

  if (m.t === 'hello') {
    p.nick = String(m.nick || 'ผู้เล่น').slice(0, 24) || 'ผู้เล่น';
    p.uid = String(m.uid || '').slice(0, 40);
    p.status = 'idle';
    p.ws.send({ t: 'welcome', you: p.id, nick: p.nick });
    broadcastPeers();
    return;
  }

  if (m.t === 'nick') {
    p.nick = String(m.nick || p.nick || 'ผู้เล่น').slice(0, 24) || 'ผู้เล่น';
    broadcastPeers();
    return;
  }

  if (m.t === 'status') {
    const s = m.status === 'busy' ? 'busy' : 'idle';
    if (p.status === s) return;
    p.status = s;
    if (s === 'busy') clearChallenge(p);
    broadcastPeers();
    return;
  }

  if (m.t === 'challenge') {
    const toId = +m.to;
    const target = findPeer(toId);
    if (!target || target.id === p.id) {
      p.ws.send({ t: 'error', m: 'ไม่พบผู้เล่น' });
      return;
    }
    if (p.status !== 'idle' || target.status !== 'idle') {
      p.ws.send({ t: 'error', m: 'ผู้เล่นไม่ว่าง' });
      return;
    }
    if (p.challengeTo || p.challengedBy || target.challengeTo || target.challengedBy) {
      p.ws.send({ t: 'error', m: 'มีคำท้าค้างอยู่ — รอหรือยกเลิกก่อน' });
      return;
    }
    p.challengeTo = target.id;
    target.challengedBy = p.id;
    target.ws.send({ t: 'challenged', from: p.id, nick: p.nick });
    p.ws.send({ t: 'challengeSent', to: target.id, nick: target.nick });
    return;
  }

  if (m.t === 'challengeCancel') {
    const toId = p.challengeTo;
    if (!toId) return;
    const target = findPeer(toId);
    p.challengeTo = null;
    if (target && target.challengedBy === p.id) {
      target.challengedBy = null;
      target.ws.send({ t: 'challengeGone', from: p.id });
    }
    return;
  }

  if (m.t === 'challengeResp') {
    const fromId = p.challengedBy;
    if (!fromId) {
      p.ws.send({ t: 'error', m: 'ไม่มีคำท้า' });
      return;
    }
    const challenger = findPeer(fromId);
    const accept = !!m.accept;
    p.challengedBy = null;
    if (challenger && challenger.challengeTo === p.id) challenger.challengeTo = null;

    if (!challenger) {
      p.ws.send({ t: 'error', m: 'คู่ท้าออฟไลน์แล้ว' });
      return;
    }

    if (!accept) {
      challenger.ws.send({ t: 'challengeResult', accept: false, id: p.id, nick: p.nick });
      return;
    }

    if (challenger.status !== 'idle' || p.status !== 'idle') {
      challenger.ws.send({ t: 'challengeResult', accept: false, id: p.id, nick: p.nick, reason: 'busy' });
      p.ws.send({ t: 'error', m: 'เริ่มแมตช์ไม่ได้ — มีคนไม่ว่าง' });
      return;
    }

    challenger.status = 'busy';
    p.status = 'busy';
    broadcastPeers();
    // challenger = host (A), acceptor = guest (B)
    challenger.ws.send({
      t: 'challengeResult', accept: true, id: p.id, nick: p.nick,
      role: 'host', oppId: p.id, oppNick: p.nick,
    });
    p.ws.send({
      t: 'matchReady', role: 'guest', oppId: challenger.id, oppNick: challenger.nick,
    });
    return;
  }

  if (m.t === 'matchCode') {
    const toId = +m.to;
    const target = findPeer(toId);
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!target || !code) {
      p.ws.send({ t: 'error', m: 'ส่งรหัสห้องไม่สำเร็จ' });
      return;
    }
    target.ws.send({ t: 'matchCode', from: p.id, nick: p.nick, code });
    return;
  }

  if (m.t === 'leave') {
    removePeer(p);
    p.ws.close();
  }
}

function wsAccept(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  if (head && head.length) socket.unshift(head);
  return attachWs(socket);
}

/* ── สัญญาณจับคู่ออนไลน์ (รีเลย์ข้อความผ่านเซิร์ฟเวอร์) ── */
const signalRooms = new Map(); // code -> { host, guest }

function signalOther(slot, ws) {
  if (!slot) return null;
  if (slot.host === ws) return slot.guest;
  if (slot.guest === ws) return slot.host;
  return null;
}

function leaveSignal(ws) {
  const code = ws._sigCode;
  if (!code) return;
  const slot = signalRooms.get(code);
  if (!slot) { ws._sigCode = ''; return; }
  const other = signalOther(slot, ws);
  if (other) other.send({ t: 'gone' });
  if (slot.host === ws) signalRooms.delete(code);
  else if (slot.guest === ws) slot.guest = null;
  ws._sigCode = '';
  ws._sigRole = '';
}

function handleSignalMessage(ws, m) {
  if (!m || !m.t) return;
  if (m.t === 'host') {
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (code.length !== 6) { ws.send({ t: 'error', m: 'รหัสห้องไม่ถูกต้อง' }); return; }
    const old = signalRooms.get(code);
    if (old && old.host && old.host !== ws) {
      ws.send({ t: 'busy' });
      return;
    }
    leaveSignal(ws);
    signalRooms.set(code, { host: ws, guest: (old && old.host === ws) ? old.guest : null });
    ws._sigCode = code;
    ws._sigRole = 'host';
    ws.send({ t: 'ok', code });
    return;
  }
  if (m.t === 'join') {
    const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const slot = signalRooms.get(code);
    if (!slot || !slot.host) { ws.send({ t: 'nohost' }); return; }
    if (slot.guest && slot.guest !== ws) { ws.send({ t: 'full' }); return; }
    leaveSignal(ws);
    slot.guest = ws;
    ws._sigCode = code;
    ws._sigRole = 'guest';
    ws.send({ t: 'ok', code });
    slot.host.send({ t: 'guest' });
    return;
  }
  if (m.t === 'ping') {
    ws.send({ t: 'pong' });
    return;
  }
  if (m.t === 'relay') {
    const slot = signalRooms.get(ws._sigCode);
    const other = signalOther(slot, ws);
    if (!other) return;
    other.send({ t: 'relay', msg: m.msg });
  }
}

function onSignalUpgrade(req, socket, head) {
  const ws = wsAccept(req, socket, head);
  if (!ws) return;
  ws._sigCode = '';
  ws._sigRole = '';
  ws.onMessage = (m) => handleSignalMessage(ws, m);
  ws.onClose = () => leaveSignal(ws);
}

function onLanUpgrade(req, socket, head) {
  const ws = wsAccept(req, socket, head);
  if (!ws) return;
  const peer = {
    id: nextPeerId++,
    nick: 'ผู้เล่น',
    uid: '',
    status: 'idle',
    ws,
    challengeTo: null,
    challengedBy: null,
  };
  lanPeers.set(peer.id, peer);
  ws.onMessage = (m) => handleLanMessage(peer, m);
  ws.onClose = () => removePeer(peer);
  ws.send({ t: 'welcome', you: peer.id, nick: peer.nick });
  broadcastPeers();
}

server.on('upgrade', (req, socket, head) => {
  const urlPath = (req.url || '').split('?')[0];
  if (urlPath === '/lan' || urlPath === '/lan/') {
    onLanUpgrade(req, socket, head);
    return;
  }
  if (urlPath === '/signal' || urlPath === '/signal/') {
    onSignalUpgrade(req, socket, head);
    return;
  }
  socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  socket.destroy();
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log(`\n✅  Battle of Talingchan — Local Server`);
  console.log(`   เครื่องนี้:     http://localhost:${PORT}/`);
  if (ips.length) {
    console.log(`   เพื่อนในวง LAN เปิด:`);
    ips.forEach((ip) => console.log(`     http://${ip}:${PORT}/`));
  } else {
    console.log(`   (ไม่พบ IP วง LAN — ตรวจ Wi‑Fi)`);
  }
  console.log(`   จับคู่ออนไลน์: WebSocket /signal`);
  console.log(`   แจ้งบัค: GET/POST /feedback` + (FEEDBACK_WEBHOOK ? ' → Discord ✓' : ' (ตั้ง DISCORD_FEEDBACK_WEBHOOK)'));
  ensureAdmin().then((info) => {
    console.log(`   แอดมิน:     http://localhost:${PORT}/admin`);
    if (info && (info.created || info.reset) && info.password) {
      console.log(`   บัญชีแอดมิน: admin / ${info.password}  (เปลี่ยนได้ที่ /admin)`);
    } else if (info && (info.created || info.reset)) {
      console.log(`   บัญชีแอดมิน: admin (รหัสจาก BOT_ADMIN_PASSWORD)`);
    }
    console.log(`   Press Ctrl+C to stop.\n`);
  }).catch((err) => {
    console.error('[admin] สร้างบัญชีแอดมินไม่สำเร็จ', err);
    console.log(`   Press Ctrl+C to stop.\n`);
  });
});
