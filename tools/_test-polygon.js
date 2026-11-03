/* โพลีกอน (BT09-006/007/022/030/031) — ทดสอบความสามารถทุกใบ */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
E.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { fails++; console.log('FAIL', name, '—', e.message); }
}
function mk(mainA, mainB) {
  const st = E.buildInitialState(cards, () => 0.5, {
    A: { main: Object.assign({ 'SD01-006': 30 }, mainA || {}), life: { 'SD01-021': 5 } },
    B: { main: Object.assign({ 'SD01-006': 30 }, mainB || {}), life: { 'SD01-021': 5 } }
  }, { strict: true });
  st.mulliganDone = { A: true, B: true };
  st.active = 'A'; st.phase = 'Main'; st.turn = 3;
  return st;
}
const find = (st, code, side = 'A', skip = []) => Object.keys(st.inst).find(k => st.inst[k].code === code && st.inst[k].cardOwner === side && !skip.includes(k));
function put(st, k, zone) {
  for (const z of Object.keys(st.zones)) st.zones[z] = st.zones[z].filter(x => x !== k);
  st.zones[zone].push(k);
  st.inst[k].faceUp = true; st.inst[k].tapped = false;
}
const act = (st, a) => E.applyAction(st, Object.assign({ by: 'A' }, a)) || {};

test('ลูเซีย: จ่ายเจมม่วงอัญเชิญได้ (# นับเป็นสีม่วงด้วย)', () => {
  const st = mk({ 'BT09-006': 1, 'BT03-039': 2 });
  const lu = find(st, 'BT09-006'); put(st, lu, 'A.hand');
  const p1 = find(st, 'BT03-039'), p2 = find(st, 'BT03-039', 'A', [p1]);
  put(st, p1, 'A.hand'); put(st, p2, 'A.hand');
  const r = act(st, { type: 'summon', k: lu, to: 'A.avatar', payIds: [p1, p2] });
  assert(!r.deny, r.deny);
  assert(st.zones['A.avatar'].includes(lu), 'ลูเซียต้องอยู่บน Avatar Zone');
  assert.deepStrictEqual(E.avatarCostColors(st.inst[lu]).sort(), ['ม่วง', 'แดง'].sort());
});

test('ลูเซีย: จ่ายเจมฟ้าไม่ได้', () => {
  const st = mk({ 'BT09-006': 1 });
  const arr = cards.filter(c => c.gemColor === 'ฟ้า' && +c.gem >= 2);
  const st2 = mk({ 'BT09-006': 1, [arr[0].code]: 1 });
  const lu = find(st2, 'BT09-006'); put(st2, lu, 'A.hand');
  const p = find(st2, arr[0].code); put(st2, p, 'A.hand');
  const r = act(st2, { type: 'summon', k: lu, to: 'A.avatar', payIds: [p] });
  assert(r.deny, 'ควรปฏิเสธ');
});

test('ลูเซีย: สั่งใช้ หาโพลีกอนจากเด็ควางบนสุด', () => {
  const st = mk({ 'BT09-006': 1, 'BT09-031': 1 });
  const lu = find(st, 'BT09-006'); put(st, lu, 'A.avatar');
  const ln = find(st, 'BT09-031');
  const r = act(st, { type: 'activateAbility', k: lu });
  assert(!r.deny, r.deny);
  const pr = st.prompts[st.prompts.length - 1];
  assert(pr, 'ต้องมี prompt');
  const cands = E.promptCandidates(st, pr);
  assert(cands.includes(ln), 'ลูเซเน่ต้องเลือกได้');
  const r2 = act(st, { type: 'chooseTarget', k: ln, seed: 1 });
  assert(!r2.deny, r2.deny);
  const deck = st.zones['A.deck'];
  const top = deck[deck.length - 1] === ln || deck[0] === ln;
  assert(top, 'ลูเซเน่ต้องอยู่บนสุดของเด็ค');
  const r3 = act(st, { type: 'activateAbility', k: lu });
  assert(r3.deny, 'เทิร์นละครั้ง');
});

test('ลูเซเน่: POWER +2 เมื่อมีโพลีกอนอื่น / +1 เมื่อมีจอมเวทย์อื่น', () => {
  const st = mk({ 'BT09-031': 1, 'BT09-006': 1, 'BT03-039': 1 });
  const ln = find(st, 'BT09-031'); put(st, ln, 'A.avatar');
  assert.strictEqual(E.effPower(st, ln), 3);
  const mage = find(st, 'BT03-039'); put(st, mage, 'A.avatar');
  assert.strictEqual(E.effPower(st, ln), 4);
  const lu = find(st, 'BT09-006'); put(st, lu, 'A.avatar');
  assert.strictEqual(E.effPower(st, ln), 5);
  assert(E.nameMatches(st.inst[ln], 'จอมเวทย์'), 'นับเป็นจอมเวทย์');
});

test('โฮคุ: POWER +1 เมื่อมี Avatar ใบอื่น · นับเป็นสัตว์', () => {
  const st = mk({ 'BT09-007': 1, 'BT09-006': 1 });
  const h = find(st, 'BT09-007'); put(st, h, 'A.avatar');
  assert.strictEqual(E.effPower(st, h), 4);
  const lu = find(st, 'BT09-006'); put(st, lu, 'A.avatar');
  assert.strictEqual(E.effPower(st, h), 5);
  assert(E.cardSymbols(st, h).includes('สัตว์'));
});

test('โซน่า: นับเป็นปลา · สั่งใช้นอนจั่ว 1 (ต้องคู่หูก่อน)', () => {
  const st = mk({ 'BT09-022': 1, 'BT09-007': 1 });
  const so = find(st, 'BT09-022'); put(st, so, 'A.avatar');
  assert(E.cardSymbols(st, so).includes('ปลา'));
  const hk = find(st, 'BT09-007'); put(st, hk, 'A.avatar');
  assert(act(st, { type: 'activateAbility', k: so }).deny, 'ยังไม่คู่หู ต้องใช้ไม่ได้');
  assert(!act(st, { type: 'pair', k: hk, to: so }).deny, 'จับคู่หู');
  const hand0 = st.zones['A.hand'].length;
  const r = act(st, { type: 'activateAbility', k: so });
  assert(!r.deny, r.deny);
  assert.strictEqual(st.zones['A.hand'].length, hand0 + 1);
  assert(st.inst[so].tapped, 'ต้องนอน');
});

test('ลูเซเน่: สั่งใช้ ทิ้งมือ 1 → เลือก Magic ในนรก', () => {
  const magic = cards.find(c => c.type === 'Magic' && c.code === 'SD01-021') || cards.find(c => c.type === 'Magic');
  const st = mk({ 'BT09-031': 1, 'SD01-021': 3 });
  const ln = find(st, 'BT09-031'); put(st, ln, 'A.avatar');
  const mg = find(st, 'SD01-021'); put(st, mg, 'A.hell');
  const disc = st.zones['A.hand'][0] || (() => { const k = st.zones['A.deck'][0]; put(st, k, 'A.hand'); return k; })();
  const r = act(st, { type: 'activateAbility', k: ln, payIds: [disc] });
  assert(!r.deny, r.deny);
  console.log('   prompts:', JSON.stringify((st.prompts || []).map(p => ({ kind: p.kind, from: p.from, dest: p.dest }))));
});

test('ลาพิเน่: สั่งใช้จากนรกหลังทิ้งมือด้วยผลการ์ด (ลูเซเน่) → เนรเทศ+ธรณีสูบ 3 จั่ว 1', () => {
  const st = mk({ 'BT09-031': 1, 'BT09-030': 1, 'SD07-015': 1 });
  const ln = find(st, 'BT09-031'), lp = find(st, 'BT09-030'), mg = find(st, 'SD07-015');
  put(st, ln, 'A.avatar'); put(st, lp, 'A.hell'); put(st, mg, 'A.hell');
  for (let i = 0; i < 3; i++) put(st, st.zones['A.deck'][0], 'A.hand');
  assert(act(st, { type: 'activateAbility', k: lp }).deny, 'ยังไม่มีการทิ้งมือ ต้องใช้ไม่ได้');
  let r = act(st, { type: 'activateAbility', k: ln }); assert(!r.deny, r.deny);
  r = act(st, { type: 'chooseTarget', k: st.zones['A.hand'][0], seed: 1 }); assert(!r.deny, r.deny);
  const pr = st.prompts[st.prompts.length - 1];
  assert(pr && pr.dest === 'exileMagicFromHellAndCast', 'ต้องเลือก Magic ในนรก');
  assert(E.promptCandidates(st, pr).includes(mg));
  r = act(st, { type: 'chooseTarget', k: mg, seed: 1 }); assert(!r.deny, r.deny);
  const h0 = st.zones['A.hand'].length;
  r = act(st, { type: 'activateAbility', k: lp }); assert(!r.deny, r.deny);
  assert.strictEqual(E.zoneOf(st, lp), 'A.dark');
  assert.strictEqual(st.zones['A.hand'].length, h0 + 1);
});

if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
console.log('ALL PASS');
