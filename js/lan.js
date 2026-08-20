/* BoT online — WebRTC P2P · สัญญาณผ่านเซิร์ฟเวอร์เราเอง (/signal)
   โฮสต์ = ที่นั่ง A · แขก = B · เกมวิ่งเครื่องต่อเครื่อง */
(function (root) {
  'use strict';
  const PREFIX = 'botlan-';
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

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

  function openSignal() {
    return new Promise((resolve, reject) => {
      let done = false;
      const ws = new WebSocket(signalUrl());
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { ws.close(); } catch (e) { }
        reject(new Error('เชื่อมสัญญาณไม่สำเร็จ — รีเฟรชแล้วลองใหม่'));
      }, 10000);
      ws.onopen = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(ws);
      };
      ws.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(new Error('เชื่อมสัญญาณไม่สำเร็จ — ตรวจเน็ตแล้วลองใหม่'));
      };
    });
  }

  function bindWsJson(ws, onMsg) {
    ws.onmessage = (ev) => {
      let m = ev.data;
      if (typeof m === 'string') {
        try { m = JSON.parse(m); } catch (e) { return; }
      }
      if (onMsg) onMsg(m);
    };
  }

  function sendWs(ws, obj) {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function makePc() {
    return new RTCPeerConnection({ iceServers: ICE });
  }

  function wireChannel(ch, handlers) {
    ch.onmessage = (ev) => {
      let m = ev.data;
      if (typeof m === 'string') {
        try { m = JSON.parse(m); } catch (e) { return; }
      }
      if (handlers.onMessage) handlers.onMessage(m);
    };
    ch.onclose = () => { if (handlers.onClose) handlers.onClose(); };
    ch.onerror = (err) => { if (handlers.onError) handlers.onError(err); };
  }

  function waitOpen(ch, ms) {
    if (ch.readyState === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('ต่อโฮสต์ไม่สำเร็จ — ให้โฮสต์เปิดห้องค้างไว้ แล้วลองเข้าใหม่')), ms || 20000);
      ch.onopen = () => { clearTimeout(t); resolve(); };
    });
  }

  function host(handlers) {
    handlers = handlers || {};
    if (typeof RTCPeerConnection === 'undefined') {
      return Promise.reject(new Error('เบราว์เซอร์นี้เล่นออนไลน์ไม่ได้'));
    }
    let code = makeCode(6);
    let tries = 0;
    return openSignal().then(function tryHost(ws) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const t = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error('สร้างห้องหมดเวลา')); }
        }, 12000);
        bindWsJson(ws, (m) => {
          if (settled) return;
          if (m.t === 'ok') {
            settled = true;
            clearTimeout(t);
            resolve({ ws, code });
            return;
          }
          if (m.t === 'busy') {
            if (++tries < 5) {
              code = makeCode(6);
              sendWs(ws, { t: 'host', code });
              return;
            }
            settled = true;
            clearTimeout(t);
            reject(new Error('สร้างห้องไม่สำเร็จ — ลองใหม่'));
          }
          if (m.t === 'error') {
            settled = true;
            clearTimeout(t);
            reject(new Error(m.m || 'สร้างห้องไม่สำเร็จ'));
          }
        });
        sendWs(ws, { t: 'host', code });
      });
    }).then(({ ws, code }) => {
      const pc = makePc();
      const ch = pc.createDataChannel('bot', { ordered: true });
      const iceBuf = [];
      let remoteSet = false;
      let connOpen = false;

      function flushIce() {
        if (!remoteSet) return;
        iceBuf.splice(0).forEach((c) => { try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { } });
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendWs(ws, { t: 'relay', msg: { k: 'ice', c: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate } });
      };

      bindWsJson(ws, (m) => {
        if (m.t === 'guest') {
          pc.createOffer().then((off) => pc.setLocalDescription(off)).then(() => {
            sendWs(ws, { t: 'relay', msg: { k: 'offer', sdp: pc.localDescription } });
          }).catch((err) => { if (handlers.onError) handlers.onError(err); });
          return;
        }
        if (m.t === 'relay' && m.msg) {
          const msg = m.msg;
          if (msg.k === 'answer' && msg.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(() => {
              remoteSet = true;
              flushIce();
            }).catch((err) => { if (handlers.onError) handlers.onError(err); });
          }
          if (msg.k === 'ice' && msg.c) {
            if (remoteSet) { try { pc.addIceCandidate(new RTCIceCandidate(msg.c)); } catch (e) { } }
            else iceBuf.push(msg.c);
          }
        }
        if (m.t === 'gone') {
          connOpen = false;
          if (handlers.onPeerClose) handlers.onPeerClose();
        }
      });

      wireChannel(ch, {
        onMessage: handlers.onMessage,
        onClose: () => {
          connOpen = false;
          if (handlers.onPeerClose) handlers.onPeerClose();
        },
        onError: handlers.onError,
      });
      ch.onopen = () => {
        connOpen = true;
        if (handlers.onPeerConnect) handlers.onPeerConnect();
      };

      return {
        code,
        peerId: peerId(code),
        send(msg) {
          if (!ch || ch.readyState !== 'open') return false;
          try { ch.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; }
          catch (e) { return false; }
        },
        connected() { return connOpen && ch.readyState === 'open'; },
        destroy() {
          try { ch.close(); } catch (e) { }
          try { pc.close(); } catch (e2) { }
          try { ws.close(); } catch (e3) { }
        },
      };
    });
  }

  function join(code, handlers) {
    handlers = handlers || {};
    const clean = parseCode(code);
    if (clean.length !== 6) return Promise.reject(new Error('รหัสห้องต้องมี 6 ตัว'));
    if (typeof RTCPeerConnection === 'undefined') {
      return Promise.reject(new Error('เบราว์เซอร์นี้เล่นออนไลน์ไม่ได้'));
    }
    return openSignal().then(ws => new Promise((resolve, reject) => {
      const pc = makePc();
      const iceBuf = [];
      let remoteSet = false;
      let ch = null;
      let settled = false;

      function flushIce() {
        if (!remoteSet) return;
        iceBuf.splice(0).forEach((c) => { try { pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { } });
      }

      function fail(err) {
        if (settled) return;
        settled = true;
        try { pc.close(); } catch (e) { }
        try { ws.close(); } catch (e2) { }
        reject(err instanceof Error ? err : new Error(String(err && err.message || err)));
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendWs(ws, { t: 'relay', msg: { k: 'ice', c: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate } });
      };
      pc.ondatachannel = (ev) => {
        ch = ev.channel;
        wireChannel(ch, {
          onMessage: handlers.onMessage,
          onClose: () => { if (handlers.onClose) handlers.onClose(); },
          onError: handlers.onError,
        });
        waitOpen(ch, 18000).then(() => {
          if (settled) return;
          settled = true;
          const api = {
            code: clean,
            peerId: peerId(clean),
            send(msg) {
              if (!ch || ch.readyState !== 'open') return false;
              try { ch.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; }
              catch (e) { return false; }
            },
            connected() { return !!(ch && ch.readyState === 'open'); },
            destroy() {
              try { if (ch) ch.close(); } catch (e) { }
              try { pc.close(); } catch (e2) { }
              try { ws.close(); } catch (e3) { }
            },
          };
          if (handlers.onOpen) handlers.onOpen();
          resolve(api);
        }).catch(fail);
      };

      bindWsJson(ws, (m) => {
        if (m.t === 'nohost') return fail(new Error('ไม่พบห้องนี้ — ให้โฮสต์สร้างห้องใหม่แล้วส่งรหัสล่าสุด'));
        if (m.t === 'full') return fail(new Error('ห้องเต็มแล้ว'));
        if (m.t === 'error') return fail(new Error(m.m || 'เข้าห้องไม่สำเร็จ'));
        if (m.t === 'gone') {
          if (handlers.onClose) handlers.onClose();
          return;
        }
        if (m.t === 'relay' && m.msg) {
          const msg = m.msg;
          if (msg.k === 'offer' && msg.sdp) {
            pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)).then(() => {
              remoteSet = true;
              flushIce();
              return pc.createAnswer();
            }).then((ans) => pc.setLocalDescription(ans)).then(() => {
              sendWs(ws, { t: 'relay', msg: { k: 'answer', sdp: pc.localDescription } });
            }).catch(fail);
          }
          if (msg.k === 'ice' && msg.c) {
            if (remoteSet) { try { pc.addIceCandidate(new RTCIceCandidate(msg.c)); } catch (e) { } }
            else iceBuf.push(msg.c);
          }
        }
      });

      sendWs(ws, { t: 'join', code: clean });
      setTimeout(() => fail(new Error('ต่อโฮสต์ไม่สำเร็จ — ให้โฮสต์เปิดหน้าห้องค้างไว้ แล้วลองเข้าใหม่')), 22000);
    }));
  }

  function inviteURL(code) {
    const origin = location.origin + location.pathname.replace(/\/?$/, '/');
    return origin + '?lan=' + encodeURIComponent(parseCode(code));
  }

  function qrDataUrl(text, size) {
    size = size || 180;
    const u = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size
      + '&margin=8&data=' + encodeURIComponent(text);
    return u;
  }

  root.BotLAN = { makeCode, parseCode, peerId, host, join, inviteURL, qrDataUrl, PREFIX };
})(typeof self !== 'undefined' ? self : this);
