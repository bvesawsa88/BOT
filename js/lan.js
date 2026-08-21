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
    if (!raw) return '';
    const str = String(raw).trim();
    const matchQuery = str.match(/[?&](?:room|lan)=([A-Za-z0-9]{6})/i);
    if (matchQuery) return matchQuery[1].toUpperCase();
    const s = str.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.indexOf('BOTLAN') === 0) return s.slice(6, 12);
    if (s.length > 6) {
      const m = str.match(/\b([A-Za-z0-9]{6})\b/);
      if (m) return m[1].toUpperCase();
      return s.slice(-6);
    }
    return s;
  }

  function candidateSignalUrls() {
    const urls = [];
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    urls.push(proto + location.host + '/signal');
    if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port !== '3000') {
      urls.push('ws://' + location.hostname + ':3000/signal');
      urls.push('ws://127.0.0.1:3000/signal');
    }
    return urls;
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
    const urls = candidateSignalUrls();
    let idx = 0;

    function tryConnect() {
      if (idx >= urls.length) {
        return Promise.reject(new Error('เชื่อมเซิร์ฟเวอร์ไม่สำเร็จ — รีเฟรชแล้วลองใหม่'));
      }
      const url = urls[idx++];
      return new Promise((resolve, reject) => {
        let done = false;
        let ws;
        try { ws = new WebSocket(url); } catch (e) { return reject(e); }
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          try { ws.close(); } catch (e) { }
          reject(new Error('timeout'));
        }, 5000);
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
          reject(new Error('failed'));
        };
      }).catch(() => tryConnect());
    }

    return tryConnect();
  }

  function attachRoom(ws, code, handlers, isHost) {
    let peerOn = !isHost;
    function onMsg(ev) {
      const m = parseEv(ev);
      if (!m || m.t === 'pong' || m.t === 'ok' || m.t === 'busy' || m.t === 'nohost' || m.t === 'full' || m.t === 'error') return;
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
    }
    ws.addEventListener('message', onMsg);
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
    return openSignal().then(ws => {
      const api = attachRoom(ws, code, handlers, true);
      return new Promise((resolve, reject) => {
        let settled = false;
        const t = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error('สร้างห้องหมดเวลา')); }
        }, 10000);
        function onHs(ev) {
          const m = parseEv(ev);
          if (!m || settled) return;
          if (m.t === 'ok') {
            settled = true;
            clearTimeout(t);
            ws.removeEventListener('message', onHs);
            api.code = m.code || code;
            api.peerId = peerId(api.code);
            resolve(api);
            return;
          }
          if (m.t === 'busy') {
            if (++tries < 6) {
              code = makeCode(6);
              sendWs(ws, { t: 'host', code });
            } else {
              settled = true;
              clearTimeout(t);
              ws.removeEventListener('message', onHs);
              reject(new Error('สร้างห้องไม่สำเร็จ — ลองใหม่'));
            }
            return;
          }
          if (m.t === 'error') {
            settled = true;
            clearTimeout(t);
            ws.removeEventListener('message', onHs);
            reject(new Error(m.m || 'สร้างห้องไม่สำเร็จ'));
          }
        }
        ws.addEventListener('message', onHs);
        sendWs(ws, { t: 'host', code });
      });
    });
  }

  function joinOnce(clean, handlers) {
    return openSignal().then(ws => new Promise((resolve, reject) => {
        let settled = false;
        const t = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { ws.close(); } catch (e) { }
            reject(new Error('เข้าห้องไม่สำเร็จ — ลองใหม่อีกครั้ง'));
          }
        }, 10000);
        function onHs(ev) {
          const m = parseEv(ev);
          if (!m || settled) return;
          if (m.t === 'ok') {
            settled = true;
            clearTimeout(t);
            ws.removeEventListener('message', onHs);
            const api = attachRoom(ws, clean, handlers, false);
            if (handlers.onOpen) handlers.onOpen();
            resolve(api);
            return;
          }
          if (m.t === 'nohost') {
            settled = true;
            clearTimeout(t);
            ws.removeEventListener('message', onHs);
            try { ws.close(); } catch (e) { }
            reject(Object.assign(new Error('ไม่พบห้องนี้ — ให้โฮสต์สร้างใหม่แล้วส่งรหัสล่าสุด'), { code: 'nohost' }));
            return;
          }
          if (m.t === 'full') {
            settled = true;
            clearTimeout(t);
            ws.removeEventListener('message', onHs);
            try { ws.close(); } catch (e) { }
            reject(new Error('ห้องเต็มแล้ว'));
            return;
          }
          if (m.t === 'error') {
            settled = true;
            clearTimeout(t);
            ws.removeEventListener('message', onHs);
            try { ws.close(); } catch (e) { }
            reject(new Error(m.m || 'เข้าห้องไม่สำเร็จ'));
          }
        }
        ws.addEventListener('message', onHs);
        sendWs(ws, { t: 'join', code: clean });
      }));
  }

  function join(code, handlers) {
    handlers = handlers || {};
    const clean = parseCode(code);
    if (clean.length !== 6) return Promise.reject(new Error('รหัสห้องต้องมี 6 ตัว'));
    let n = 0;
    function attempt() {
      return joinOnce(clean, handlers).catch(err => {
        if (err && err.code === 'nohost' && n < 4) {
          n++;
          return new Promise(r => setTimeout(r, 400 * n)).then(attempt);
        }
        throw err;
      });
    }
    return attempt();
  }

  function inviteURL(code) {
    const origin = location.origin + location.pathname.replace(/\/?$/, '/');
    return origin + '?room=' + encodeURIComponent(parseCode(code));
  }

  function qrDataUrl(text, size) {
    size = size || 180;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size
      + '&margin=8&data=' + encodeURIComponent(text);
  }

  root.BotLAN = { makeCode, parseCode, peerId, host, join, inviteURL, qrDataUrl, PREFIX };
})(typeof self !== 'undefined' ? self : this);
