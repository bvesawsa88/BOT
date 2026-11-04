/* ความกล้าหาญ — POWER +4 แล้วถูกทำลายตอน End Phase · กันทำลายได้ POWER ค้าง
   รัน: node tools/_test-courage.js */
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

function setup(code, medicSide) {
  const st = emptyState(); deck(st);
  const av = put(st, 'A.avatar', 'SD01-001'); // P5
  const card = put(st, 'A.hand', code);
  const medic = medicSide ? put(st, medicSide + '.hand', 'BT01-040') : null;
  const payIds = Array.from({ length: +byCode(code).cost || 0 }, () => put(st, 'A.hand', 'SD01-007'));
  act(st, { type: 'playMagic', k: card, payIds, by: 'A', seed: 1 });
  let g = 0;
  while (st.prompts[0] && st.prompts[0].chooser === 'B' && st.prompts[0].magicNegate && g++ < 5)
    act(st, { type: 'reactNo', by: 'B', seed: 10 + g });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseBuff', code + ': เลือก Avatar รับบัฟ');
  act(st, { type: 'chooseTarget', k: av, by: 'A', seed: 2 });
  ok(BoT.effPower(st, av) === 9, code + ': POWER 5+4 = 9');
  return { st, av, card, medic };
}

/* ทุกรหัส: ไม่มีตัวกัน → ถูกทำลายตอน End Phase */
['BT02-045', 'KD01-014', 'ODY1-086'].forEach(code => {
  const { st, av } = setup(code);
  ok(zone(st, av) === 'A.avatar', code + ': ยังไม่ถูกทำลายก่อน End Phase');
  act(st, { type: 'endTurn', by: 'A', seed: 3 });
  ok(zone(st, av) === 'A.hell', code + ': ถูกทำลายตอน End Phase');
  ok(st.active === 'B', code + ': จบเทิร์นปกติ');
});

/* หมอมาแล้วววว: กันได้ · POWER +4 ค้าง · จบเทิร์นเดินต่อ · ไม่ถูกทำลายซ้ำรอบหน้า */
{
  const { st, av, medic } = setup('BT02-045', 'A');
  act(st, { type: 'endTurn', by: 'A', seed: 3 });
  const pr = st.prompts[0];
  ok(pr && pr.reactTrigger === 'avatarWouldBeDestroyed' && (pr.options || []).includes(medic), 'หมอ: เปิดหน้าต่างกันทำลาย');
  ok(st.active === 'A', 'หมอ: จบเทิร์นรอคำตอบก่อน');
  act(st, { type: 'reactYes', k: medic, by: 'A', seed: 4 });
  let g = 0;
  while (st.prompts[0] && st.prompts[0].chooser === 'B' && g++ < 5) act(st, { type: 'reactNo', by: 'B', seed: 20 + g });
  if (st.active === 'A') act(st, { type: 'endTurn', by: 'A', seed: 5 });
  ok(zone(st, av) === 'A.avatar', 'หมอ: Avatar ไม่ถูกทำลาย');
  ok(st.active === 'B', 'หมอ: จบเทิร์นต่อได้');
  ok(BoT.effPower(st, av) === 9, 'หมอ: POWER +4 ค้างข้ามเทิร์น');
  act(st, { type: 'endTurn', by: 'B', seed: 6 });
  g = 0;
  while (st.prompts.length && g++ < 5) act(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 30 + g });
  ok(zone(st, av) === 'A.avatar', 'หมอ: ไม่ถูกทำลายซ้ำเทิร์นถัดไป');
  ok(BoT.effPower(st, av) === 9, 'หมอ: POWER ยังค้าง');
}

/* มีหมอแต่ไม่ใช้ → ถูกทำลาย */
{
  const { st, av } = setup('BT02-045', 'A');
  act(st, { type: 'endTurn', by: 'A', seed: 3 });
  act(st, { type: 'reactNo', by: 'A', seed: 4 });
  if (st.active === 'A') act(st, { type: 'endTurn', by: 'A', seed: 5 });
  ok(zone(st, av) === 'A.hell', 'หมอ: ไม่ใช้แล้วถูกทำลาย');
  ok(st.active === 'B', 'หมอ: ไม่ใช้แล้วจบเทิร์น');
}

console.log('ALL COURAGE TESTS PASSED');
