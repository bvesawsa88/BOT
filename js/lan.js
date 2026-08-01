/* BoT LAN — WebRTC P2P ผ่าน PeerJS (signaling ฟรี · เกมวิ่งเครื่องต่อเครื่อง)
   โฮสต์ = ที่นั่ง A · แขก = B · ไม่มีเซิร์ฟเวอร์เกม */
(function (root) {
  'use strict';
  const PREFIX = 'botlan-';
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PEER_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';

  let libReady = null;
  function ensureLib() {
    if (root.Peer) return Promise.resolve();
    if (libReady) return libReady;
    const load = (root.BotUtil && root.BotUtil.loadScript)
      ? root.BotUtil.loadScript(PEER_CDN)
      : new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PEER_CDN;
        s.onload = resolve;
        s.onerror = () => reject(new Error('โหลด PeerJS ไม่สำเร็จ — ต้องมีเน็ตตอนจับคู่'));
        document.head.appendChild(s);
      });
    libReady = load.catch(err => { libReady = null; throw err; });
    return libReady;
  }

  function makeCode(len) {
    len = len || 6;
    let out = '';
    const arr = new Uint32Array(len);
    if (root.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
    else for (let i = 0; i < len; i++) arr[i] = (Math.random() * 0xffffffff) >>> 0;
    for (let i = 0; i < len; i++) out += CHARSET[arr[i] % CHARSET.length];
    return out;
  }

  function peerId(code) {
    return PREFIX + String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function parseCode(raw) {
    const s = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('BOTLAN') === 0) return s.slice(6);
    return s;
  }

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id
        ? new root.Peer(id, { debug: 0 })
        : new root.Peer({ debug: 0 });
      const fail = (err) => {
        try { peer.destroy(); } catch (e) { }
        reject(err || new Error('เปิด Peer ไม่สำเร็จ'));
      };
      const t = setTimeout(() => fail(new Error('จับคู่หมดเวลา — ตรวจเน็ตแล้วลองใหม่')), 20000);
      peer.on('open', () => { clearTimeout(t); resolve(peer); });
      peer.on('error', (err) => {
        clearTimeout(t);
        const msg = (err && err.type === 'unavailable-id')
          ? 'รหัสห้องซ้ำ — ลองสร้างใหม่'
          : ((err && err.message) || 'เชื่อม Peer ไม่สำเร็จ');
        fail(new Error(msg));
      });
    });
  }

  function wireConn(conn, handlers) {
    conn.on('data', (data) => {
      let m = data;
      if (typeof data === 'string') {
        try { m = JSON.parse(data); } catch (e) { return; }
      }
      if (handlers.onMessage) handlers.onMessage(m);
    });
    conn.on('close', () => { if (handlers.onClose) handlers.onClose(); });
    conn.on('error', (err) => { if (handlers.onError) handlers.onError(err); });
  }

  /** สร้างห้องโฮสต์ — คืน { code, send, destroy } */
  function host(handlers) {
    handlers = handlers || {};
    return ensureLib().then(() => {
      let code = makeCode(6);
      let tries = 0;
      function tryHost() {
        return openPeer(peerId(code)).catch(err => {
          if (++tries < 4 && /ซ้ำ|unavailable/i.test(err.message || '')) {
            code = makeCode(6);
            return tryHost();
          }
          throw err;
        });
      }
      return tryHost().then(peer => {
        let conn = null;
        peer.on('connection', (c) => {
          if (conn && conn.open) {
            try { c.send(JSON.stringify({ t: 'error', m: 'ห้องเต็มแล้ว (รับได้ 2 คน)' })); } catch (e) { }
            setTimeout(() => { try { c.close(); } catch (e2) { } }, 200);
            return;
          }
          conn = c;
          wireConn(conn, {
            onMessage: handlers.onMessage,
            onClose: () => {
              conn = null;
              if (handlers.onPeerClose) handlers.onPeerClose();
            },
            onError: handlers.onError,
          });
          conn.on('open', () => {
            if (handlers.onPeerConnect) handlers.onPeerConnect();
          });
        });
        peer.on('disconnected', () => {
          try { peer.reconnect(); } catch (e) { }
        });
        peer.on('error', (err) => {
          if (handlers.onError) handlers.onError(err);
        });
        return {
          code,
          peerId: peerId(code),
          send(msg) {
            if (!conn || !conn.open) return false;
            try { conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; }
            catch (e) { return false; }
          },
          connected() { return !!(conn && conn.open); },
          destroy() {
            try { if (conn) conn.close(); } catch (e) { }
            try { peer.destroy(); } catch (e2) { }
            conn = null;
          },
        };
      });
    });
  }

  /** เข้าห้องด้วยรหัสโฮสต์ */
  function join(code, handlers) {
    handlers = handlers || {};
    const clean = parseCode(code);
    if (clean.length !== 6) return Promise.reject(new Error('รหัสห้อง LAN ต้องมี 6 ตัว'));
    return ensureLib().then(() => openPeer(null)).then(peer => new Promise((resolve, reject) => {
      const conn = peer.connect(peerId(clean), { reliable: true });
      const t = setTimeout(() => {
        try { peer.destroy(); } catch (e) { }
        reject(new Error('ต่อโฮสต์ไม่สำเร็จ — ให้โฮสต์เปิดห้องค้างไว้ และอยู่ Wi‑Fi/ฮอตสปอตเดียวกัน'));
      }, 25000);
      wireConn(conn, {
        onMessage: handlers.onMessage,
        onClose: () => { if (handlers.onClose) handlers.onClose(); },
        onError: handlers.onError,
      });
      conn.on('open', () => {
        clearTimeout(t);
        const api = {
          code: clean,
          peerId: peerId(clean),
          send(msg) {
            if (!conn.open) return false;
            try { conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; }
            catch (e) { return false; }
          },
          connected() { return !!conn.open; },
          destroy() {
            try { conn.close(); } catch (e) { }
            try { peer.destroy(); } catch (e2) { }
          },
        };
        if (handlers.onOpen) handlers.onOpen();
        resolve(api);
      });
      conn.on('error', (err) => {
        clearTimeout(t);
        try { peer.destroy(); } catch (e) { }
        reject(err || new Error('เชื่อมห้อง LAN ไม่สำเร็จ'));
      });
      peer.on('error', (err) => {
        clearTimeout(t);
        try { peer.destroy(); } catch (e) { }
        reject(err || new Error('เชื่อมห้อง LAN ไม่สำเร็จ'));
      });
    }));
  }

  function inviteURL(code) {
    const origin = location.origin + location.pathname.replace(/\/?$/, '/');
    return origin + '?lan=' + encodeURIComponent(parseCode(code));
  }

  /** วาด QR เป็น data URL (ไม่พึ่งไลบรารี — ใช้ API สาธารณะเมื่อออนไลน์) */
  function qrDataUrl(text, size) {
    size = size || 180;
    const u = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size
      + '&margin=8&data=' + encodeURIComponent(text);
    return u;
  }

  root.BotLAN = { ensureLib, makeCode, parseCode, peerId, host, join, inviteURL, qrDataUrl, PREFIX };
})(typeof self !== 'undefined' ? self : this);
