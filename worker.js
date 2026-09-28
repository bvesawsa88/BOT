/**
 * Cloudflare Worker for Battle of Talingchan
 * 100% Serverless: Static Assets + Multiplayer Signaling + User Auth + Cloud Decks
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_DECKS_FREE = 10;
const MAX_DECKS_SUPPORTER = 50;

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || [0]);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 10000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytesLen = 16) {
  const arr = new Uint8Array(bytesLen);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getBearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\S+)/i);
  if (m) return m[1];
  const cookie = request.headers.get('Cookie') || '';
  const cm = cookie.match(/(?:^|;\s*)bot_auth_token=([^;]+)/);
  if (cm) return decodeURIComponent(cm[1]);
  return '';
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...headers
    }
  });
}

export class SignalServer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map(); // code -> { host: ws, guest: ws }
    this.users = null;
  }

  async getUsers() {
    if (!this.users) {
      this.users = (await this.state.storage.get('users')) || {};
      // Ensure admin exists
      if (!this.users.admin) {
        const salt = randomHex(16);
        const hash = await hashPassword('123456', salt);
        this.users.admin = {
          username: 'admin',
          salt,
          hash,
          role: 'admin',
          isSupporter: true,
          decks: {},
          createdAt: new Date().toISOString()
        };
        await this.state.storage.put('users', this.users);
      }
    }
    return this.users;
  }

  async saveUsers() {
    if (this.users) {
      await this.state.storage.put('users', this.users);
    }
  }

  findUserByToken(token) {
    if (!token || !this.users) return null;
    const now = Date.now();
    for (const key of Object.keys(this.users)) {
      const u = this.users[key];
      if (!u) continue;
      if (u.token === token && u.tokenExp && u.tokenExp > now) return { key, user: u };
      if (Array.isArray(u.tokens)) {
        const found = u.tokens.find(t => t && t.token === token && t.exp && t.exp > now);
        if (found) return { key, user: u };
      }
    }
    return null;
  }

  issueSession(user) {
    const token = randomHex(32);
    const tokenExp = Date.now() + TOKEN_TTL_MS;
    if (!Array.isArray(user.tokens)) {
      user.tokens = [];
      if (user.token && user.tokenExp) user.tokens.push({ token: user.token, exp: user.tokenExp });
    }
    user.tokens = user.tokens.filter(t => t && t.token && t.exp && t.exp > Date.now());
    if (user.tokens.length >= 20) user.tokens.shift();
    user.tokens.push({ token, exp: tokenExp });
    user.token = token;
    user.tokenExp = tokenExp;

    const isAdmin = user.role === 'admin' || user.username === 'admin';
    const isSupporter = !!(user.isSupporter || isAdmin);
    const maxDecks = isSupporter ? MAX_DECKS_SUPPORTER : MAX_DECKS_FREE;

    return {
      ok: true,
      token,
      username: user.username,
      admin: isAdmin,
      isSupporter,
      maxDecks,
      customSkinsAllowed: isSupporter
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    // ── WebSocket Signaling (Multiplayer) ──
    if (path === '/signal' || path === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      server._sigCode = '';

      server.addEventListener('message', (ev) => {
        let m;
        try { m = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data; }
        catch (e) { return; }
        this.handleSignalMessage(server, m);
      });

      const onClose = () => this.leaveSignal(server);
      server.addEventListener('close', onClose);
      server.addEventListener('error', onClose);

      return new Response(null, { status: 101, webSocket: client });
    }

    // ── Auth Endpoints ──
    await this.getUsers();

    if (path === '/auth/oauth/config') {
      return jsonResponse({
        ok: true,
        googleClientId: this.env.GOOGLE_CLIENT_ID || '',
        discordClientId: this.env.DISCORD_CLIENT_ID || ''
      });
    }

    if (path === '/auth/register' || path === '/auth/login') {
      if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
      let body;
      try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'invalid json' }, 400); }
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!/^[A-Za-z0-9_\u0E00-\u0E7F]{3,20}$/.test(username)) {
        return jsonResponse({ ok: false, error: 'ชื่อผู้ใช้ 3–20 ตัว (อังกฤษ ตัวเลข _ หรือไทย)' }, 400);
      }
      if (password.length < 6 || password.length > 64) {
        return jsonResponse({ ok: false, error: 'รหัสผ่านอย่างน้อย 6 ตัว' }, 400);
      }

      const key = username.toLowerCase();
      const isReg = path === '/auth/register';

      if (isReg) {
        if (this.users[key]) return jsonResponse({ ok: false, error: 'ชื่อนี้มีคนใช้แล้ว' }, 409);
        const salt = randomHex(16);
        const hash = await hashPassword(password, salt);
        this.users[key] = {
          username,
          salt,
          hash,
          decks: {},
          createdAt: new Date().toISOString()
        };
        const session = this.issueSession(this.users[key]);
        await this.saveUsers();
        return jsonResponse(session);
      } else {
        const u = this.users[key];
        if (!u || !u.salt || !u.hash) return jsonResponse({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401);
        const hash = await hashPassword(password, u.salt);
        if (hash !== u.hash) return jsonResponse({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, 401);
        const session = this.issueSession(u);
        await this.saveUsers();
        return jsonResponse(session);
      }
    }

    if (path === '/auth/social-login') {
      if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
      let body;
      try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'invalid json' }, 400); }
      const provider = String(body.provider || 'google').toLowerCase();
      let rawName = String(body.name || body.username || 'User').trim();
      let cleanName = rawName.replace(/[^A-Za-z0-9_\u0E00-\u0E7F]/g, '').slice(0, 20);
      if (cleanName.length < 3) cleanName = (provider === 'google' ? 'G_' : 'D_') + cleanName + Math.floor(Math.random() * 899 + 100);

      const lookupKey = `${provider}:${body.id || body.email || cleanName}`.toLowerCase();
      let matchedKey = null;
      for (const [k, u] of Object.entries(this.users)) {
        if (u && u.socialId === lookupKey) { matchedKey = k; break; }
      }

      if (matchedKey && this.users[matchedKey]) {
        const session = this.issueSession(this.users[matchedKey]);
        await this.saveUsers();
        return jsonResponse(session);
      }

      let baseKey = cleanName.toLowerCase();
      while (this.users[baseKey]) {
        cleanName = cleanName.slice(0, 16) + Math.floor(Math.random() * 899 + 100);
        baseKey = cleanName.toLowerCase();
      }

      this.users[baseKey] = {
        username: cleanName,
        provider,
        socialId: lookupKey,
        decks: {},
        createdAt: new Date().toISOString()
      };
      const session = this.issueSession(this.users[baseKey]);
      await this.saveUsers();
      return jsonResponse(session);
    }

    // Authenticated routes
    const token = getBearerToken(request);
    const hit = this.findUserByToken(token);

    if (path === '/auth/me') {
      if (!hit) return jsonResponse({ ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }, 401);
      const u = hit.user;
      const isAdmin = u.role === 'admin' || u.username === 'admin';
      const isSupporter = !!(u.isSupporter || isAdmin);
      return jsonResponse({
        ok: true,
        username: u.username,
        admin: isAdmin,
        isSupporter,
        maxDecks: isSupporter ? MAX_DECKS_SUPPORTER : MAX_DECKS_FREE,
        customSkinsAllowed: isSupporter
      });
    }

    if (path === '/auth/decks') {
      if (!hit) return jsonResponse({ ok: false, error: 'ยังไม่ได้เข้าสู่ระบบ' }, 401);
      const u = hit.user;
      const isSupporter = !!(u.isSupporter || u.role === 'admin');
      const maxLimit = isSupporter ? MAX_DECKS_SUPPORTER : MAX_DECKS_FREE;

      if (request.method === 'GET') {
        return jsonResponse({
          ok: true,
          decks: u.decks && typeof u.decks === 'object' ? u.decks : {},
          maxDecks: maxLimit,
          isSupporter
        });
      }

      if (request.method === 'PUT') {
        let body;
        try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'invalid json' }, 400); }
        const decks = body.decks && typeof body.decks === 'object' ? body.decks : {};
        if (Object.keys(decks).length > maxLimit) {
          return jsonResponse({ ok: false, error: `จำกัดบันทึกได้สูงสุด ${maxLimit} เด็ค` }, 403);
        }
        u.decks = decks;
        await this.saveUsers();
        return jsonResponse({ ok: true, maxDecks: maxLimit });
      }

      return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
    }

    return jsonResponse({ ok: false, error: 'not found' }, 404);
  }

  // ── Signal Logic ──
  leaveSignal(ws) {
    const code = ws._sigCode;
    if (!code) return;
    const slot = this.rooms.get(code);
    if (!slot) { ws._sigCode = ''; return; }
    const other = slot.host === ws ? slot.guest : slot.host;
    if (other) {
      try { other.send(JSON.stringify({ t: 'gone' })); } catch (e) {}
    }
    if (slot.host === ws) {
      this.rooms.delete(code);
    } else if (slot.guest === ws) {
      slot.guest = null;
    }
    ws._sigCode = '';
  }

  handleSignalMessage(ws, m) {
    if (!m || !m.t) return;

    if (m.t === 'host') {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (code.length !== 6) {
        ws.send(JSON.stringify({ t: 'error', m: 'รหัสห้องไม่ถูกต้อง' }));
        return;
      }
      const old = this.rooms.get(code);
      if (old && old.host && old.host !== ws) {
        ws.send(JSON.stringify({ t: 'busy' }));
        return;
      }
      this.leaveSignal(ws);
      this.rooms.set(code, { host: ws, guest: (old && old.host === ws) ? old.guest : null });
      ws._sigCode = code;
      ws.send(JSON.stringify({ t: 'ok', code }));
      return;
    }

    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const slot = this.rooms.get(code);
      if (!slot || !slot.host) {
        ws.send(JSON.stringify({ t: 'nohost' }));
        return;
      }
      if (slot.guest && slot.guest !== ws) {
        ws.send(JSON.stringify({ t: 'full' }));
        return;
      }
      this.leaveSignal(ws);
      slot.guest = ws;
      ws._sigCode = code;
      ws.send(JSON.stringify({ t: 'ok', code }));
      try { slot.host.send(JSON.stringify({ t: 'guest' })); } catch (e) {}
      return;
    }

    if (m.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
      return;
    }

    if (m.t === 'relay') {
      const slot = this.rooms.get(ws._sigCode);
      if (!slot) return;
      const other = slot.host === ws ? slot.guest : slot.host;
      if (!other) return;
      try { other.send(JSON.stringify({ t: 'relay', msg: m.msg })); } catch (e) {}
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route /signal and /auth/* to the Durable Object
    if (
      path === '/signal' || path === '/signal/' ||
      path === '/ws' || path === '/ws/' ||
      path.startsWith('/auth/')
    ) {
      if (env.SIGNAL_DO) {
        const id = env.SIGNAL_DO.idFromName('global_server');
        const stub = env.SIGNAL_DO.get(id);
        return stub.fetch(request);
      }
      return jsonResponse({ error: 'SIGNAL_DO Durable Object binding is not configured in Cloudflare.' }, 500);
    }

    // Version API
    if (path === '/api/version') {
      return jsonResponse({ version: '2026.09.28' });
    }

    // Site settings & announcements
    if (path === '/api/site') {
      return jsonResponse({
        announcement: 'ยินดีต้อนรับสู่ Battle of Talingchan บน Cloudflare!',
        sponsors: []
      });
    }

    // Analytics / Effects fallback
    if (path === '/api/effects-db') {
      return jsonResponse({ cards: [] });
    }
    if (path === '/stat/table' || path.startsWith('/api/analytics')) {
      return jsonResponse({ ok: true });
    }

    // Feedback webhook
    if (path === '/feedback' && request.method === 'POST') {
      const webhook = env.DISCORD_FEEDBACK_WEBHOOK || env.FEEDBACK_WEBHOOK;
      if (!webhook) return jsonResponse({ ok: false, error: 'webhook not configured' }, 500);
      try {
        const body = await request.json();
        const text = `**[Bug Feedback]**\n${body.text || '(ไม่มีข้อความ)'}\n_Device: ${request.headers.get('User-Agent') || '-'}_`;
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text })
        });
        return jsonResponse({ ok: true });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // Serve static files via Cloudflare Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
