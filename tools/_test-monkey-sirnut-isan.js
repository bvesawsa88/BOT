/* เชาว์ปัญญาลิงถูกขัดได้ · เซอร์นัท BT08-010 บัฟเฉพาะเลอติ๊ก · โคกอีสานนูนวางได้เสมอ
   รัน: node tools/_test-monkey-sirnut-isan.js */
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
const act = (st, a) => { const fx = BoT.applyAction(st, a); if (fx && fx.deny) fail(a.type + ' deny: ' + fx.deny); return fx; };
const zone = (st, k) => BoT.zoneOf(st, k);
function deck(st) { for (let i = 0; i < 8; i++) { put(st, 'A.deck', 'SD01-007'); put(st, 'B.deck', 'SD01-007'); } }

function monkeySetup() {
  const st = emptyState(); deck(st);
  st.active = 'B'; // บอท (A ในเทสต์นี้) ใช้ลิงในเทิร์นของฝ่าย B
  const monkey = put(st, 'A.hand', 'PRMO-152');
  const counter = put(st, 'B.hand', 'BT05-058'); // อย่าให้มีครั้งที่ 2
  const mako = put(st, 'B.avatar', 'PRMO-140');
  put(st, 'B.magic', 'BT09-036');
  put(st, 'B.magic', 'BT02-036');
  act(st, { type: 'activateAbility', k: mako, by: 'B' });
  act(st, { type: 'reactYes', k: monkey, by: 'A', seed: 5 });
  return { st, monkey, counter, mako };
}

/* ลิงเปิดหน้าต่างให้ขัด + ขัดสำเร็จแล้วความสามารถเดินต่อ */
{
  const { st, monkey, counter, mako } = monkeySetup();
  const pr = st.prompts[0];
  ok(pr && pr.kind === 'react' && pr.chooser === 'B' && pr.target === monkey, 'ลิง: ฝ่ายที่ถูกขัดได้หน้าต่าง React');
  ok((pr.options || []).includes(counter), 'ลิง: อย่าให้มีครั้งที่ 2 อยู่ในตัวเลือก');
  act(st, { type: 'reactYes', k: counter, by: 'B', seed: 7 });
  act(st, { type: 'reactNo', by: 'A', seed: 8 });
  ok(zone(st, monkey) === 'A.hell', 'ลิง: ถูกยกเลิกลงนรก');
  ok(!st.inst[mako].nullifyUntilEOT, 'ลิง: ถูกขัดแล้ว Avatar ไม่เสียความสามารถ');
  ok(BoT.effPower(st, mako) === 7, 'ลิง: ความสามารถต่อเนื่องยังอยู่ (P7)');
  ok(!st._pendingAbility && !st._pendingMagic, 'ลิง: ไม่มี pending ค้าง');
  ok(st.prompts.some(p => p.src === mako && p.chooser === 'B'), 'ลิง: ความสามารถเดิมเดินต่อ (เปิด prompt ของ Avatar)');
}

/* ลิงไม่ถูกขัด → ยกเลิกตามเดิม */
{
  const { st, monkey, mako } = monkeySetup();
  act(st, { type: 'reactNo', by: 'B', seed: 7 });
  ok(zone(st, monkey) === 'A.hell', 'ลิง: ไม่ถูกขัดแล้วลงนรก');
  ok(st.inst[mako].nullifyUntilEOT === true, 'ลิง: ไม่ถูกขัด Avatar เสียความสามารถ');
  ok(BoT.effPower(st, mako) === 6, 'ลิง: POWER กลับเป็น 6');
  ok(!st._pendingAbility && !st._pendingMagic, 'ลิง: ไม่มี pending ค้าง (ไม่ถูกขัด)');
}

/* เซอร์นัท: +2 เฉพาะเลอติ๊ก เด็กไม่ชอบแดรคคูลา */
{
  const st = emptyState(); deck(st);
  const nut = put(st, 'A.avatar', 'BT08-010');
  const letik = put(st, 'A.avatar', 'BT06-025');
  const other = put(st, 'A.avatar', 'SD01-001');
  const enemyLetik = put(st, 'B.avatar', 'BT06-025');
  ok(BoT.effPower(st, letik) === 5, 'เซอร์นัท: เลอติ๊กฝ่ายเรา P3+2 = 5');
  ok(BoT.effPower(st, other) === 5, 'เซอร์นัท: Avatar อื่นไม่ได้บัฟ (P5)');
  ok(BoT.effPower(st, nut) === +byCode('BT08-010').power, 'เซอร์นัท: ตัวเองไม่ได้บัฟ');
  ok(BoT.effPower(st, enemyLetik) === 3, 'เซอร์นัท: เลอติ๊กฝ่ายศัตรูไม่ได้บัฟ');
}

/* เซอร์นัท: +3 เฉพาะตอนสู้ Avatar สีม่วง */
{
  const run = (foeCode) => {
    const st = emptyState(); deck(st);
    const nut = put(st, 'A.avatar', 'BT08-010');
    const foe = put(st, 'B.avatar', foeCode);
    act(st, { type: 'declareAttack', atk: nut, def: foe, by: 'A', seed: 3 });
    return st.log.some(l => (l.t || '').includes('POWER +3')); // ต่อสู้จบทันที บัฟหมดแล้ว — เช็คจาก log
  };
  ok(run('SD03-001'), 'เซอร์นัท: สู้สีม่วง POWER +3');
  ok(!run('SD01-001'), 'เซอร์นัท: สู้สีอื่นไม่ได้ +3');
}

/* โคกอีสานนูน: วางได้แม้ไม่มีอีสานสลิงเกอร์ · สั่งใช้ต้องมี */
{
  const st = emptyState(); deck(st);
  const land = put(st, 'A.hand', 'BT08-065');
  const payIds = Array.from({ length: +byCode('BT08-065').cost || 0 }, () => put(st, 'A.hand', 'SD03-013'));
  act(st, { type: 'playMagic', k: land, payIds, by: 'A', seed: 1 });
  let g = 0;
  while (st.prompts[0] && st.prompts[0].chooser === 'B' && g++ < 5) act(st, { type: 'reactNo', by: 'B', seed: 9 + g });
  ok(zone(st, land) === 'land', 'โคกอีสานนูน: วางได้แม้ไม่มีอีสานสลิงเกอร์');
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: land, by: 'A' });
  ok(fx && fx.deny, 'โคกอีสานนูน: สั่งใช้ไม่ได้เมื่อไม่มีอีสานสลิงเกอร์');
  put(st, 'A.avatar', 'BT08-024');
  for (let i = 0; i < 6; i++) put(st, 'A.hell', 'SD01-007');
  act(st, { type: 'activateAbility', k: land, by: 'A' });
  ok(st.prompts.length > 0, 'โคกอีสานนูน: มีอีสานสลิงเกอร์แล้วสั่งใช้ได้');
}

console.log('ALL MONKEY / SIR NUT / ISAN TESTS PASSED');
