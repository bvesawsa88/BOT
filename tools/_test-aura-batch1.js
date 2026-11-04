/* ชุดตรวจการ์ด 1: บัฟต่อเนื่องที่เคยไม่มีตัวกรอง / โซนผิด
   รัน: node tools/_test-aura-batch1.js */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  return {
    inst: {}, zones, phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
}
function put(st, zone, code) {
  const c = byCode(code);
  if (!c) throw new Error('missing ' + code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  st.zones[zone].push(k);
  return k;
}
function fail(m) { console.error('FAIL', m); process.exit(1); }
function ok(c, m) { if (!c) fail(m); console.log('ok', m); }
const printed = (st, k) => +st.inst[k].power || 0;
const delta = (st, k) => BoT.effPower(st, k) - printed(st, k);
const plain = 'SD01-001';
const camp = 'SD06-018';

/* ไม่ให้บัฟ Avatar ที่ไม่เกี่ยว */
[['SD06-001', 'A.avatar'], ['SD06-002', 'A.avatar'], ['SD06-005', 'A.avatar'], ['BT07-026', 'A.avatar'], ['BT08-004', 'A.avatar'],
  ['BT08-032', 'A.avatar'], ['BT06-060', 'land'], ['BT06-062', 'land'], ['BT07-068', 'land'], ['BT10-071', 'land'],
  ['SD06-018', 'A.construct'], ['BT08-067', 'A.construct'], ['BT10-073', 'A.construct']].forEach(([code, zone]) => {
  const st = emptyState();
  const av = put(st, 'A.avatar', plain);
  put(st, zone, code);
  ok(delta(st, av) === 0, code + ': ไม่บัฟ Avatar ที่ไม่เกี่ยว');
});

/* ถ้ำนาคา */
{
  const st = emptyState();
  const naga = cards.find(c => c.type === 'Avatar' && /นาค/.test(c.name) && /สัตว์วิเศษ/.test(c.symbol || ''));
  ok(!!naga, 'มี Avatar นาค สัตว์วิเศษให้ทดสอบ');
  const k = put(st, 'A.avatar', naga.code);
  const base = BoT.effPower(st, k);
  put(st, 'land', 'BT06-062');
  ok(BoT.effPower(st, k) === base + 1, 'ถ้ำนาคา: นาค สัตว์วิเศษ +1');
}

/* ค่ายบางระจัน: บัฟใบที่มีคำใน Text Box */
{
  const st = emptyState();
  const inn = put(st, 'A.avatar', 'SD06-002');
  const base = BoT.effPower(st, inn);
  put(st, 'A.construct', camp);
  ok(BoT.effPower(st, inn) === base + 3, 'อิน: ค่ายบางระจัน +1 และควบคุมค่าย +2');
}

/* จัน: +1 เฉพาะสาหัส */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'SD06-001');
  ok(delta(st, k) === 0, 'จัน: ปกติไม่ +1');
  put(st, 'A.life', 'SD01-007');
  ok(delta(st, k) === 1, 'จัน: สาหัส +1');
}

/* พันเรือง: +2 เฉพาะเทิร์นฝ่ายตรงข้าม */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'SD06-005');
  ok(delta(st, k) === 0, 'พันเรือง: เทิร์นเราไม่ +2');
  st.active = 'B';
  ok(delta(st, k) === 2, 'พันเรือง: เทิร์นศัตรู +2');
}

/* ทนายกิ๊บ: ต้องมีพี่หน่วง · บัฟตัวเอง */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'BT07-026');
  const other = put(st, 'A.avatar', plain);
  ok(delta(st, k) === 0, 'ทนายกิ๊บ: ไม่มีพี่หน่วงไม่ +2');
  put(st, 'A.avatar', 'BT06-024');
  ok(delta(st, k) === 2 && delta(st, other) === 0, 'ทนายกิ๊บ: มีพี่หน่วง +2 เฉพาะตัวเอง');
}

/* สนามของนักวิ่ง: Cost 0 · โซน Construct */
{
  const st = emptyState();
  const zero = cards.find(c => c.type === 'Avatar' && +c.cost === 0 && +c.power > 0);
  const k = put(st, 'A.avatar', zero.code);
  put(st, 'A.construct', 'BT08-067');
  ok(delta(st, k) === 1, 'สนามนักวิ่ง: Cost 0 +1');
}

/* เวทีเพื่อชีวิต: Battle Phase ฝ่ายเรา */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', plain);
  put(st, 'A.construct', 'BT06-064');
  ok(delta(st, k) === 0, 'เวที: Main ไม่ +1');
  st.phase = 'Battle';
  ok(delta(st, k) === 1, 'เวที: Battle เรา +1');
  st.active = 'B';
  ok(delta(st, k) === 0, 'เวที: Battle ศัตรูไม่ +1');
}

/* ด่านเฮาโลก๋วน: ขุนพลสีม่วงจาก Construct Zone */
{
  const st = emptyState();
  const purple = cards.find(c => c.type === 'Avatar' && /ขุนพล/.test(c.name) && c.color === 'ม่วง');
  const k = put(st, 'A.avatar', purple.code);
  const base = BoT.effPower(st, k);
  put(st, 'A.construct', 'SD07-020');
  ok(BoT.effPower(st, k) === base + 1, 'ด่านเฮาโลก๋วน: ขุนพลม่วง +1');
}

/* คุณคำดี: Avatar ฝ่ายเรา -1 */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', plain);
  put(st, 'A.avatar', 'BT11-031');
  ok(delta(st, k) === -1, 'คุณคำดี: Avatar ฝ่ายเรา -1');
}

/* ดินแดนแห่งความหลากหลาย */
{
  const st = emptyState();
  const a = put(st, 'A.avatar', 'SD01-001');
  put(st, 'land', 'CC02-049');
  ok(delta(st, a) === 0, 'หลากหลาย: ใบเดียวไม่ +1');
  const dup = put(st, 'A.avatar', 'SD01-001');
  ok(delta(st, a) === 0 && delta(st, dup) === 0, 'หลากหลาย: Symbol ซ้ำไม่ +1');
  st.zones['A.avatar'] = [a];
  const diff = cards.find(c => c.type === 'Avatar' && c.symbol && c.symbol !== st.inst[a].symbol && !/,|\s/.test(c.symbol) && !/Overdose/.test(c.name));
  put(st, 'A.avatar', diff.code);
  const withLand = BoT.effPower(st, a);
  const landK = st.zones.land.pop();
  const noLand = BoT.effPower(st, a);
  st.zones.land.push(landK);
  ok(withLand - noLand === 1, 'หลากหลาย: Symbol ไม่ซ้ำ +1');
}

console.log('ALL AURA BATCH 1 TESTS PASSED');
