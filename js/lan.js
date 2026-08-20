/* BoT online — จับคู่ผ่าน WebSocket /signal ของเซิร์ฟเวอร์นี้ (มือถือใช้ได้) */
(function (root) {
  'use strict';
  const PREFIX = 'botlan-';
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

  function signalUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/signal';
  }

  function sendWs(ws, obj) {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function parseEv(ev) {
    let m = ev.data;
    if (typeof m === 'string') {
      try { m = JSON.parse(m); } catch (e) { return null; }
    }
    return m;
  }

  function openSignal() {
    return new Promise((resolve, reject) => {
      let done = false;
      const ws = new WebSocket(signalUrl());
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { ws.close(); } catch (e) { }
        reject(new Error('เชื่อมเซิร์ฟเวอร์ไม่สำเร็จ — รีเฟรชแล้วลองใหม่'));
      }, 12000);
      ws.onopen = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        ws._keep = setInterval(() => sendWs(ws, { t: 'ping' }), 20000);
        resolve(ws);
      };
      ws.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(new Error('เชื่อมเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจเน็ตแล้วลองใหม่'));
      };
    });
  }

  function attachRoom(ws, code, handlers, isHost) {
    let peerOn = !isHost;
    ws.onmessage = (ev) => {
      const m = parseEv(ev);
      if (!m || m.t === 'pong') return;
      if (m.t === 'guest') {
        peerOn = true;
        if (handlers.onPeerConnect) handlers.onPeerConnect();
        return;
      }
      if (m.t === 'gone') {
        peerOn = false;
        if (isHost && handlers.onPeerClose) handlers.onPeerClose();
        else if (!isHost && handlers.onClose) handlers.onClose();
        return;
      }
      if (m.t === 'relay' && m.msg && m.msg.k === 'data') {
        let d = m.msg.d;
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch (e) { }
        }
        if (handlers.onMessage) handlers.onMessage(d);
      }
    };
    ws.addEventListener('close', () => {
      if (ws._keep) clearInterval(ws._keep);
      peerOn = false;
      if (isHost && handlers.onPeerClose) handlers.onPeerClose();
      else if (!isHost && handlers.onClose) handlers.onClose();
    });
    return {
      code,
      peerId: peerId(code),
      send(msg) { return sendWs(ws, { t: 'relay', msg: { k: 'data', d: msg } }); },
      connected() { return ws.readyState === 1 && peerOn; },
      destroy() {
        if (ws._keep) clearInterval(ws._keep);
        try { ws.close(); } catch (e) { }
      },
    };
  }

  function host(handlers) {
    handlers = handlers || {};
    let code = makeCode(6);
    let tries = 0;
    return openSignal().then(ws => new Promise((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('สร้างห้องหมดเวลา')); }
      }, 10000);
      ws.onmessage = (ev) => {
        const m = parseEv(ev);
        if (!m || settled) return;
        if (m.t === 'ok') {
          settled = true;
          clearTimeout(t);
          resolve(attachRoom(ws, code, handlers, true));
          return;
        }
        if (m.t === 'busy') {
          if (++tries < 6) {
            code = makeCode(6);
            sendWs(ws, { t: 'host', code });
          } else {
            settled = true;
            clearTimeout(t);
            reject(new Error('สร้างห้องไม่สำเร็จ — ลองใหม่'));
          }
          return;
        }
        if (m.t === 'error') {
          settled = true;
          clearTimeout(t);
          reject(new Error(m.m || 'สร้างห้องไม่สำเร็จ'));
        }
      };
      sendWs(ws, { t: 'host', code });
    }));
  }

  function join(code, handlers) {
    handlers = handlers || {};
    const clean = parseCode(code);
    if (clean.length !== 6) return Promise.reject(new Error('รหัสห้องต้องมี 6 ตัว'));
    return openSignal().then(ws => new Promise((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch (e) { }
          reject(new Error('เข้าห้องไม่สำเร็จ — ลองใหม่อีกครั้ง'));
        }
      }, 10000);
      ws.onmessage = (ev) => {
        const m = parseEv(ev);
        if (!m || settled) return;
        if (m.t === 'ok') {
          settled = true;
          clearTimeout(t);
          const api = attachRoom(ws, clean, handlers, false);
          if (handlers.onOpen) handlers.onOpen();
          resolve(api);
          return;
        }
        if (m.t === 'nohost') {
          settled = true;
          clearTimeout(t);
          try { ws.close(); } catch (e) { }
          reject(new Error('ไม่พบห้องนี้ — ให้โฮสต์สร้างใหม่แล้วส่งรหัสล่าสุด'));
          return;
        }
        if (m.t === 'full') {
          settled = true;
          clearTimeout(t);
          try { ws.close(); } catch (e) { }
          reject(new Error('ห้องเต็มแล้ว'));
          return;
        }
        if (m.t === 'error') {
          settled = true;
          clearTimeout(t);
          try { ws.close(); } catch (e) { }
          reject(new Error(m.m || 'เข้าห้องไม่สำเร็จ'));
        }
      };
      sendWs(ws, { t: 'join', code: clean });
    }));
  }

  function inviteURL(code) {
    const origin = location.origin + location.pathname.replace(/\/?$/, '/');
    return origin + '?lan=' + encodeURIComponent(parseCode(code));
  }

  function qrDataUrl(text, size) {
    size = size || 180;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size
      + '&margin=8&data=' + encodeURIComponent(text);
  }

  root.BotLAN = { makeCode, parseCode, peerId, host, join, inviteURL, qrDataUrl, PREFIX };
})(typeof self !== 'undefined' ? self : this);
