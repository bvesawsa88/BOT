/* ทดสอบการจับห้องออนไลน์ (Online Room Matchmaking & Relay & LAN Hall) */
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const assert = require('assert');

const PORT = 3098;
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
  const listeners = [];
  const api = {
    send(obj) { socket.write(encodeClient(obj)); },
    close() { try { socket.end(); } catch (e) { } },
    addListener(fn) { listeners.push(fn); return () => { const idx = listeners.indexOf(fn); if (idx >= 0) listeners.splice(idx, 1); }; },
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
        listeners.slice().forEach(fn => fn(msg));
      } catch (e) { }
    }
  });
  return api;
}

function connectWs(endpoint) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: endpoint,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (res, socket, head) => {
      const client = attachClient(socket);
      resolve(client);
      if (head && head.length) setImmediate(() => socket.emit('data', head));
    });
    req.on('error', reject);
    req.end();
  });
}

function waitMsg(ws, pred, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { remove(); reject(new Error('timeout waiting for message')); }, ms || 5000);
    const remove = ws.addListener((m) => {
      if (pred(m)) {
        clearTimeout(t);
        remove();
        resolve(m);
      }
    });
  });
}

async function testOnlineFlow() {
  console.log('--- 1. ทดสอบสร้างห้องและส่งข้อมูลผ่าน /signal ---');
  const host = await connectWs('/signal');
  const gotHostOk = waitMsg(host, (m) => m.t === 'ok');
  host.send({ t: 'host', code: 'ROOM01' });
  const hostOk = await gotHostOk;
  assert.strictEqual(hostOk.code, 'ROOM01');
  console.log('  ✓ Host สร้างห้อง ROOM01 สำเร็จ');

  const guest = await connectWs('/signal');
  const gotGuestNotifyHost = waitMsg(host, (m) => m.t === 'guest');
  const gotGuestOk = waitMsg(guest, (m) => m.t === 'ok');
  guest.send({ t: 'join', code: 'ROOM01' });
  const guestOk = await gotGuestOk;
  assert.strictEqual(guestOk.code, 'ROOM01');
  await gotGuestNotifyHost;
  console.log('  ✓ Guest เข้าห้อง ROOM01 สำเร็จ และ Host ได้รับแจ้งเตือน');

  const hostReceiveHello = waitMsg(host, (m) => m.t === 'relay' && m.msg && m.msg.d && m.msg.d.t === 'hello');
  guest.send({ t: 'relay', msg: { k: 'data', d: { t: 'hello', nick: 'PlayerB' } } });
  const helloMsg = await hostReceiveHello;
  assert.strictEqual(helloMsg.msg.d.nick, 'PlayerB');
  console.log('  ✓ Relay ข้อความ hello (Guest -> Host) สำเร็จ');

  const guestReceiveRoom = waitMsg(guest, (m) => m.t === 'relay' && m.msg && m.msg.d && m.msg.d.t === 'room');
  host.send({ t: 'relay', msg: { k: 'data', d: { t: 'room', phase: 'wait', A: { nick: 'PlayerA', ready: true }, B: { nick: 'PlayerB', ready: false } } } });
  const roomMsg = await guestReceiveRoom;
  assert.strictEqual(roomMsg.msg.d.phase, 'wait');
  console.log('  ✓ Relay ข้อความ room state (Host -> Guest) สำเร็จ');

  const thirdPlayer = await connectWs('/signal');
  const gotFull = waitMsg(thirdPlayer, (m) => m.t === 'full');
  thirdPlayer.send({ t: 'join', code: 'ROOM01' });
  await gotFull;
  console.log('  ✓ ป้องกันคนที่ 3 เข้าซ้ำ (full) สำเร็จ');
  thirdPlayer.close();

  const lostPlayer = await connectWs('/signal');
  const gotNoHost = waitMsg(lostPlayer, (m) => m.t === 'nohost');
  lostPlayer.send({ t: 'join', code: 'NOROOM' });
  await gotNoHost;
  console.log('  ✓ ตรวจสอบรหัสห้องที่ไม่มีจริง (nohost) สำเร็จ');
  lostPlayer.close();

  const gotGone = waitMsg(host, (m) => m.t === 'gone');
  guest.close();
  await gotGone;
  console.log('  ✓ ตรวจจับสัญญาณหลุดการเชื่อมต่อ (gone) สำเร็จ');

  host.close();
}

async function testLanHallFlow() {
  console.log('\n--- 2. ทดสอบระบบล็อบบี้ LAN Hall (/lan) ---');
  const user1 = await connectWs('/lan');
  const u1Welcome = await waitMsg(user1, (m) => m.t === 'welcome');
  assert.ok(u1Welcome.you, 'user1 ได้รับ peer id');

  const u1GotUser2 = waitMsg(user1, (m) => m.t === 'peers' && m.list && m.list.length >= 2);
  const user2 = await connectWs('/lan');
  const u2Welcome = await waitMsg(user2, (m) => m.t === 'welcome');
  assert.ok(u2Welcome.you, 'user2 ได้รับ peer id');

  await u1GotUser2;
  console.log('  ✓ รายชื่อผู้เล่นออนไลน์ใน LAN ทำงานถูกต้อง');

  const u2Challenge = waitMsg(user2, (m) => m.t === 'challenged' && m.from === u1Welcome.you);
  user1.send({ t: 'challenge', to: u2Welcome.you });
  await u2Challenge;
  console.log('  ✓ ส่งคำท้าสู้ไปยังผู้เล่นปลายทางสำเร็จ');

  const u1ChallengeRes = waitMsg(user1, (m) => m.t === 'challengeResult' && m.accept === true);
  const u2MatchReady = waitMsg(user2, (m) => m.t === 'matchReady');
  user2.send({ t: 'challengeResp', accept: true });
  const res1 = await u1ChallengeRes;
  const res2 = await u2MatchReady;
  assert.strictEqual(res1.role, 'host');
  assert.strictEqual(res2.role, 'guest');
  console.log('  ✓ ตอบรับคำท้าและกำหนด role โฮสต์/แขก สำเร็จ');

  user1.close();
  user2.close();
}

async function main() {
  await new Promise((r) => setTimeout(r, 400));
  await testOnlineFlow();
  await testLanHallFlow();
  console.log('\n========================================');
  console.log('🎉 ระบบจับห้องออนไลน์ทำงานสมบูรณ์ทุกจุด!');
  console.log('========================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
