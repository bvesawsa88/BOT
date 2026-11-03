/* กติกาคู่หู + ลาพิเน่
   1) ลาพิเน่: ทิ้งมือจากความสามารถการ์ดใดก็ได้ของฝ่ายเรา (เช่น จ่ายค่าเวท บีมมม) → สั่งใช้จากนรกได้
   2) คู่หูตายในเทิร์นฝ่ายตรงข้าม → เทิร์นเราใบที่เหลือจับคู่ใหม่ได้
   3) ความสามารถใต้สัญลักษณ์คู่หู ทำงานเฉพาะตอนอยู่ในสถานะคู่หู (โซน่าสั่งใช้จั่ว / โฮคุบังคับเป้าโจมตี) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
E.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

let fails = 0;
function test(name, fn) { try { fn(); console.log('PASS', name); } catch (e) { fails++; console.log('FAIL', name, '—', e.message); } }
function mk(mainA, mainB) {
  const st = E.buildInitialState(cards, () => 0.5, {
    A: { main: Object.assign({ 'SD01-006': 30 }, mainA || {}), life: { 'SD01-021': 5 } },
    B: { main: Object.assign({ 'SD01-006': 30 }, mainB || {}), life: { 'SD01-021': 5 } }
  }, { strict: true });
  st.mulliganDone = { A: true, B: true }; st.active = 'A'; st.phase = 'Main'; st.turn = 3; st.turnSeq = 3;
  return st;
}
const find = (st, code, side = 'A', skip = []) => Object.keys(st.inst).find(k => st.inst[k].code === code && st.inst[k].cardOwner === side && !skip.includes(k));
function put(st, k, zone) {
  for (const z of Object.keys(st.zones)) st.zones[z] = st.zones[z].filter(x => x !== k);
  st.zones[zone].push(k); st.inst[k].faceUp = true; st.inst[k].tapped = false;
}
const act = (st, a) => E.applyAction(st, Object.assign({ by: 'A', seed: 1 }, a)) || {};

test('ลาพิเน่: ใช้ บีมมม (ทิ้งมือจ่ายค่าเวท) แล้วสั่งใช้จากนรกได้', () => {
  const st = mk({ 'BT09-030': 1, 'BT04-044': 1 }, { 'BT09-006': 1 });
  const lp = find(st, 'BT09-030'), bm = find(st, 'BT04-044'), foe = find(st, 'BT09-006', 'B');
  put(st, lp, 'A.hell'); put(st, bm, 'A.hand'); put(st, foe, 'B.avatar');
  for (let i = 0; i < 3; i++) put(st, st.zones['A.deck'][0], 'A.hand');
  assert(act(st, { type: 'activateAbility', k: lp }).deny, 'ก่อนทิ้งมือต้องใช้ไม่ได้');
  let r = act(st, { type: 'playMagic', k: bm }); assert(!r.deny, r.deny);
  let guard = 0;
  while ((st.prompts || []).length && guard++ < 6) {
    const pr = st.prompts[0];
    const c = E.promptCandidates(st, pr);
    if (pr.kind === 'chooseDiscard') r = act(st, { type: 'chooseTarget', k: st.zones['A.hand'].find(k => k !== bm) });
    else if (c.length) r = act(st, { type: 'chooseTarget', k: c.includes(foe) ? foe : c[0] });
    else if (st.prompts[0] && st.prompts[0].kind === 'react') r = act(st, { type: 'reactNo', by: 'B' });
    else break;
    if (r.deny) { r = act(st, { type: 'chainPass', by: 'B' }); }
  }
  assert(st.allyEffectDiscardedThisTurn && st.allyEffectDiscardedThisTurn.A, 'ต้องบันทึกว่ามีการทิ้งมือด้วยความสามารถการ์ด');
  r = act(st, { type: 'activateAbility', k: lp });
  assert(!r.deny, r.deny);
  assert.strictEqual(E.zoneOf(st, lp), 'A.dark');
});

test('คู่หู: คู่หูตายในเทิร์นฝ่ายตรงข้าม → เทิร์นเราจับคู่ใหม่ได้', () => {
  const st = mk({ 'BT09-007': 1, 'BT09-022': 2 });
  const h = find(st, 'BT09-007'), s1 = find(st, 'BT09-022'), s2 = find(st, 'BT09-022', 'A', [s1]);
  put(st, h, 'A.avatar'); put(st, s1, 'A.avatar');
  let r = act(st, { type: 'pair', k: h, to: s1 }); assert(!r.deny, r.deny);
  assert(E.inLinkStatus(st, h));
  // เทิร์นฝ่ายตรงข้าม: โซน่าตาย
  st.turnSeq = 4; st.active = 'B';
  E.doMove(st, s1, 'A.hell', null, {});
  assert(!E.inLinkStatus(st, h));
  // เทิร์นเรา: โซน่าใบใหม่ลงสนาม จับคู่ใหม่
  st.turnSeq = 5; st.active = 'A';
  put(st, s2, 'A.avatar');
  r = act(st, { type: 'pair', k: h, to: s2 });
  assert(!r.deny, r.deny);
  assert(E.inLinkStatus(st, h) && E.inLinkStatus(st, s2));
});

test('คู่หู: คู่หูตายในเทิร์นเรา → เทิร์นนั้นยังจับคู่ใหม่ไม่ได้', () => {
  const st = mk({ 'BT09-007': 1, 'BT09-022': 2 });
  const h = find(st, 'BT09-007'), s1 = find(st, 'BT09-022'), s2 = find(st, 'BT09-022', 'A', [s1]);
  put(st, h, 'A.avatar'); put(st, s1, 'A.avatar');
  st.turnSeq = 1; act(st, { type: 'pair', k: h, to: s1 });
  st.turnSeq = 3;
  E.doMove(st, s1, 'A.hell', null, {});
  put(st, s2, 'A.avatar');
  assert(act(st, { type: 'pair', k: h, to: s2 }).deny, 'ต้องห้ามในเทิร์นเดียวกัน');
});

test('โซน่า: สั่งใช้จั่วได้เฉพาะตอนอยู่ในสถานะคู่หู', () => {
  const st = mk({ 'BT09-007': 1, 'BT09-022': 1 });
  const h = find(st, 'BT09-007'), so = find(st, 'BT09-022');
  put(st, h, 'A.avatar'); put(st, so, 'A.avatar');
  assert(act(st, { type: 'activateAbility', k: so }).deny, 'ยังไม่คู่หู ต้องใช้ไม่ได้');
  assert(!act(st, { type: 'pair', k: h, to: so }).deny);
  const h0 = st.zones['A.hand'].length;
  const r = act(st, { type: 'activateAbility', k: so });
  assert(!r.deny, r.deny);
  assert.strictEqual(st.zones['A.hand'].length, h0 + 1);
});

test('โฮคุ: บังคับเป้าโจมตีเฉพาะตอนคู่หู', () => {
  const st = mk({ 'BT09-007': 1, 'BT09-022': 1 }, { 'BT09-006': 1 });
  const h = find(st, 'BT09-007'), so = find(st, 'BT09-022'), atk = find(st, 'BT09-006', 'B');
  put(st, h, 'A.avatar'); put(st, so, 'A.avatar'); put(st, atk, 'B.avatar');
  st.active = 'B'; st.phase = 'Battle'; st.turnSeq = 4;
  const can = () => !(E.applyAction(JSON.parse(JSON.stringify(st)), { type: 'declareAttack', atk, def: so, by: 'B', seed: 1 }) || {}).deny;
  assert(can(), 'ยังไม่คู่หู ต้องโจมตีโซน่าได้');
  st.inst[h].pairWith = so; st.inst[so].pairWith = h;
  assert(!can(), 'คู่หูแล้ว ต้องโจมตีได้เฉพาะโฮคุ');
});

if (fails) { console.log(fails + ' FAILED'); process.exit(1); }
console.log('ALL PASS');
