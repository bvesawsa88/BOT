/* เทสจับคู่ออนไลน์ /signal — โฮสต์+แขก ส่งข้อความหากันได้ */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const assert = require('assert');

const PORT = 3097;
process.env.PORT = String(PORT);
process.env.DISCORD_FEEDBACK_WEBHOOK = '';

require(path.join(__dirname, '..', 'server.js'));

function maskKey() { return crypto.randomBytes(4); }

function encodeClient(obj) {
  const data = Buffer.from(JSON.stringify(obj));
  const len = data.length;
  const mask = maskKey();
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    throw new Error('payload too big');
  }
  const out = Buffer.alloc(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, out]);
}

function attachClient(socket) {
  let buf = Buffer.alloc(0);
  const api = {
    send(obj) { socket.write(encodeClient(obj)); },
    close() { try { socket.end(); } catch (e) { } },
    onMessage: null,
  };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b1 = buf[1];
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) return;
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
      try {
        const msg = JSON.parse(payload.toString('utf8'));
        if (api.onMessage) api.onMessage(msg);
      } catch (e) { }
    }
  });
  return api;
}

function connectSignal() {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/signal',
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (res, socket) => resolve(attachClient(socket)));
    req.on('error', reject);
    req.end();
  });
}

function waitMsg(ws, pred, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for message')), ms || 4000);
    const prev = ws.onMessage;
    ws.onMessage = (m) => {
      if (prev) prev(m);
      if (pred(m)) {
        clearTimeout(t);
        ws.onMessage = prev;
        resolve(m);
      }
    };
  });
}

async function main() {
  await new Promise((r) => setTimeout(r, 400));

  const host = await connectSignal();
  const gotOk = waitMsg(host, (m) => m.t === 'ok');
  host.send({ t: 'host', code: 'K3KKSA' });
  const ok = await gotOk;
  assert.strictEqual(ok.code, 'K3KKSA');

  const guest = await connectSignal();
  const hostGuest = waitMsg(host, (m) => m.t === 'guest');
  const guestOk = waitMsg(guest, (m) => m.t === 'ok' || m.t === 'nohost' || m.t === 'full');
  guest.send({ t: 'join', code: 'K3KKSA' });
  const g = await guestOk;
  assert.strictEqual(g.t, 'ok', 'guest should join: ' + JSON.stringify(g));
  await hostGuest;

  const hostHello = waitMsg(host, (m) => m.t === 'relay' && m.msg && m.msg.k === 'data' && m.msg.d && m.msg.d.t === 'hello');
  guest.send({ t: 'relay', msg: { k: 'data', d: { t: 'hello', nick: 'cici' } } });
  const hello = await hostHello;
  assert.strictEqual(hello.msg.d.nick, 'cici');

  const guestPong = waitMsg(guest, (m) => m.t === 'relay' && m.msg && m.msg.d && m.msg.d.t === 'hi');
  host.send({ t: 'relay', msg: { k: 'data', d: { t: 'hi' } } });
  await guestPong;

  const no = await connectSignal();
  const noWait = waitMsg(no, (m) => m.t === 'nohost' || m.t === 'ok');
  no.send({ t: 'join', code: 'ZZZZZZ' });
  const n = await noWait;
  assert.strictEqual(n.t, 'nohost');

  console.log('ok: host/join/relay + nohost');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
