/* ทดสอบระบบสถิติ: รัน server.js ชุดสำเนาในโฟลเดอร์ชั่วคราว (ปิด Firebase) แล้วยิง ping จริง
   ไม่แตะ data/ ของโปรเจกต์ และไม่เชื่อม Firestore
   รัน: node tools/_test-analytics.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 3977;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASSWORD = 'test-admin-pass';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-analytics-'));
for (const f of ['server.js', 'firebase-store.js', 'firebase-auth.js', 'engine.js', 'admin.html']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
}
fs.mkdirSync(path.join(tmp, 'data'));
fs.cpSync(path.join(ROOT, 'js'), path.join(tmp, 'js'), { recursive: true });

function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: tmp,
    env: Object.assign({}, process.env, {
      PORT: String(PORT), FIREBASE_DISABLED: '1', BOT_ADMIN_PASSWORD: ADMIN_PASSWORD,
      RENDER: '', K_SERVICE: '', RENDER_EXTERNAL_URL: '', KEEP_ALIVE: '0',
    }),
    stdio: 'ignore',
  });
  return child;
}
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try { await fetch(BASE + '/admin.html'); return; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
}
function stop(child) {
  return new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
}
const ping = (body) => fetch(BASE + '/api/analytics/ping', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());
const fileData = () => JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'analytics.json'), 'utf8'));
const bangkokDay = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

(async () => {
  let server = startServer();
  try {
    await waitUp();
    const A = { visitorId: 'v_aaaaaaaaaaaaaaaa', sessionId: 's_one', device: 'mobile', token: '' };

    await ping(Object.assign({}, A, { referrer: 'https://l.facebook.com/x', action: { name: 'page_view', label: 'เข้าเว็บ' } }));
    await ping(Object.assign({}, A, { action: { name: 'play_bot', label: 'เล่นกับบอท' } }));
    await ping(Object.assign({}, A, { action: { name: 'play_online', label: 'ออนไลน์' } }));
    await ping(Object.assign({}, A, { action: { name: 'save_deck', label: 'บันทึกเด็ค' } }));
    await ping(Object.assign({}, A, { action: { name: 'junk_' + 'x'.repeat(40), label: 'ขยะ' } }));
    await ping(A);

    let a = fileData();
    let day = a.daily[bangkokDay()];
    assert.ok(day, 'บันทึกตามวันที่ไทย');
    assert.strictEqual(a.totals.visits, 1, 'หลาย ping ใน session เดียว = 1 การเข้าชม');
    assert.strictEqual(a.recentSessions.length, 1);
    assert.deepStrictEqual(a.recentSessions[0].actions.map((x) => x.name), ['page_view', 'play_bot', 'play_online', 'save_deck'],
      'กิจกรรมต้องถูกบันทึกลงประวัติ และไม่รับ event ที่ไม่รู้จัก');
    assert.strictEqual(day.onlineGames, 1);
    assert.strictEqual(day.events.play_bot, 1);
    assert.strictEqual(day.events['junk_' + 'x'.repeat(40)], undefined);
    assert.strictEqual(day.sources.facebook, 1);
    assert.strictEqual(day.devices.mobile, 1);
    assert.strictEqual(day.hours.reduce((n, v) => n + v, 0), 1);
    assert.strictEqual(day.uniques, 1);
    assert.strictEqual(day.newVisitors, 1);

    // คนเดิมกลับมาอีก session ในวันเดียวกัน: เข้าชมเพิ่ม แต่คนไม่เพิ่ม
    await ping(Object.assign({}, A, { sessionId: 's_two' }));
    a = fileData(); day = a.daily[bangkokDay()];
    assert.strictEqual(day.visits, 2);
    assert.strictEqual(day.uniques, 1);
    assert.strictEqual(day.sources.direct, 1);

    // คนเก่าที่กลับมาในวันใหม่ต้องนับเป็นคนของวันนั้น แต่ไม่ใช่คนใหม่
    a.dayVisitors = { date: '2000-01-01', ids: [] };
    a.recentSessions = [];
    fs.writeFileSync(path.join(tmp, 'data', 'analytics.json'), JSON.stringify(a));
    await ping(Object.assign({}, A, { sessionId: 's_three' }));
    a = fileData(); day = a.daily[bangkokDay()];
    assert.strictEqual(day.uniques, 2);
    assert.strictEqual(day.newVisitors, 1);

    // id จาก client ต้องไม่มีอักขระ HTML
    await ping({ visitorId: 'v_<img/src=x>', sessionId: 's_"><b>', device: 'desktop' });
    a = fileData();
    assert.ok(!/[<>"]/.test(a.recentSessions[0].visitorId + a.recentSessions[0].sessionId));

    // server restart: session เดิมยังไม่หมดอายุ ต้องไม่นับเข้าชมซ้ำ
    const visitsBefore = a.totals.visits;
    await stop(server);
    server = startServer();
    await waitUp();
    await ping(Object.assign({}, A, { sessionId: 's_three', action: { name: 'view_gallery', label: 'เปิดคลังการ์ด' } }));
    a = fileData();
    assert.strictEqual(a.totals.visits, visitsBefore, 'restart แล้วไม่นับซ้ำ');
    assert.strictEqual(a.recentSessions.find((s) => s.sessionId === 's_three').actions.length, 1);

    // เวลาใช้งาน: ช่วงห่าง ping ปกตินับ ช่วงที่พับจอนานเกินไปไม่นับ
    a.recentSessions.find((s) => s.sessionId === 's_three').lastPing = Date.now() - 30000;
    fs.writeFileSync(path.join(tmp, 'data', 'analytics.json'), JSON.stringify(a));
    await stop(server);
    server = startServer();
    await waitUp();
    const secondsBefore = a.daily[bangkokDay()].activeSeconds;
    await ping(Object.assign({}, A, { sessionId: 's_three' }));
    a = fileData();
    const added = a.daily[bangkokDay()].activeSeconds - secondsBefore;
    assert.ok(added >= 29 && added <= 35, 'นับเวลาใช้งาน 30 วิ ได้ ' + added);

    // ไฟล์ข้อมูลเก่า (ก่อนเพิ่ม field ใหม่) ต้องใช้ต่อได้
    a.daily[bangkokDay()] = { visits: 3, uniques: 2, botGames: 0, onlineGames: 0, deckSaves: 0, peakOnline: 1 };
    fs.writeFileSync(path.join(tmp, 'data', 'analytics.json'), JSON.stringify(a));
    await ping(Object.assign({}, A, { sessionId: 's_four', visitorId: 'v_bbbbbbbbbbbbbbbb' }));
    a = fileData(); day = a.daily[bangkokDay()];
    assert.strictEqual(day.visits, 4);
    assert.strictEqual(day.hours.length, 24);

    // API แอดมิน
    const denied = await fetch(BASE + '/admin/analytics');
    assert.strictEqual(denied.status, 401, 'ไม่ล็อกอินต้องดูสถิติไม่ได้');
    const login = await fetch(BASE + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
    }).then((r) => r.json());
    assert.ok(login.ok && login.token, 'admin login');
    const res = await fetch(BASE + '/admin/analytics', { headers: { Authorization: 'Bearer ' + login.token } }).then((r) => r.json());
    assert.ok(res.ok);
    assert.strictEqual(res.analytics.todayKey, bangkokDay());
    assert.strictEqual(res.analytics.today.visits, 4);
    assert.ok(res.analytics.activeOnline >= 1);
    assert.strictEqual(res.analytics.cloudSync, false, 'เครื่อง dev ต้องแจ้งว่าไม่ได้ซิงก์');
    assert.strictEqual(res.analytics.dayVisitors, undefined);
    assert.strictEqual(res.analytics.uniqueVisitorsSet, undefined);

    console.log('✓ analytics: ผ่านทุกข้อ');
  } finally {
    await stop(server);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exit(1); });
