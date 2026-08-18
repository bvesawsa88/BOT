/* focused: คลื่น 0 SL02 — เตียวเลี้ยว / เอรา / ครุฑเวนไตย */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState(extra) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return Object.assign({
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    gems: { A: 10, B: 10 }
  }, extra || {});
}
function put(st, zone, code, extra) {
  const c = byCode(code);
  if (!c) throw new Error('missing ' + code);
  const n = Object.keys(st.inst).length + 1;
  const k = 't' + n;
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    img: c.imageUrl || '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone] = st.zones[zone] || [];
  st.zones[zone].push(k);
  return k;
}
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
function apply(st, a) { return BoT.applyAction(st, a); }

/* 1) เตียวเลี้ยว: extraColors ม่วง + จุติสอดแนมขุนพลต่างชาติสีเดียวกัน */
{
  const e = BoT.effectOf('SL02-004');
  ok(e && (e.extraColors || []).includes('ม่วง'), 'teo extraColors purple');
}

{
  const st = emptyState();
  const teo = put(st, 'A.hand', 'SL02-004');
  const pay = put(st, 'A.hand', 'SD03-005'); // ม่วง GEM 4 — จ่ายได้เพราะ extraColors
  put(st, 'A.deck', 'SD01-011');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const fx = apply(st, { type: 'summon', k: teo, to: 'A.avatar', payIds: [pay], by: 'A', seed: 3 });
  ok(!fx.deny, 'teo paid with purple gem: ' + (fx.deny || ''));
  ok(BoT.zoneOf(st, teo) === 'A.avatar', 'teo on field after purple pay');
}

{
  const st = emptyState();
  const teo = put(st, 'A.hand', 'SL02-004');
  const pay = put(st, 'A.hand', 'BT07-012'); // ฟ้า GEM 4 = Cost 4
  const blueGen = put(st, 'A.deck', 'SD07-003'); // ฟ้า ขุนพล ต่างชาติ
  const purpleGen = put(st, 'A.deck', 'SD07-007'); // ม่วง ขุนพล ต่างชาติ
  const greenGen = put(st, 'A.deck', 'SD07-001'); // เขียว — ไม่เข้า
  const chaff = put(st, 'A.deck', 'SD01-011');
  const chaff2 = put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  let fx = apply(st, { type: 'summon', k: teo, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 });
  ok(!fx.deny, 'teo summon: ' + (fx.deny || ''));
  ok(BoT.zoneOf(st, teo) === 'A.avatar', 'teo on field');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'ids', 'teo scout prompt');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(blueGen), 'scout allows blue general');
  ok(cands.includes(purpleGen), 'scout allows purple general via extraColors');
  ok(!cands.includes(greenGen), 'scout rejects green general');
  ok(!cands.includes(chaff) && !cands.includes(chaff2), 'scout rejects non-generals');
  fx = apply(st, { type: 'chooseTarget', k: blueGen, by: 'A', seed: 2 });
  if (fx.deny) fail('teo pick deny: ' + fx.deny);
  ok(BoT.zoneOf(st, blueGen) === 'A.hand', 'picked general to hand');
  ok(BoT.zoneOf(st, greenGen) === 'A.deck', 'rest returned to deck');
}

/* 2) เอรา: จุติเลือกนาค สัตว์วิเศษ ฝ่ายเรา POWER +2 ถาวร */
{
  const st = emptyState();
  const era = put(st, 'A.hand', 'SL02-009');
  const pay = put(st, 'A.hand', 'SL02-001'); // แดง GEM 4
  const naga = put(st, 'A.avatar', 'SL02-010'); // นาค สัตว์วิเศษ P7
  const ghost = put(st, 'A.avatar', 'BT03-022'); // แม่นาค ผี — ไม่เข้า
  const foeNaga = put(st, 'B.avatar', 'BT06-001');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: era, to: 'A.avatar', payIds: [pay], by: 'A', seed: 10 });
  ok(!fx.deny, 'era summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseBuff', 'era chooseBuff prompt: ' + (pr && pr.kind));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(naga), 'era can buff own naga');
  ok(cands.includes(era), 'era herself is นาก สัตว์วิเศษ');
  ok(!cands.includes(ghost), 'era cannot buff แม่นาค ผี');
  ok(!cands.includes(foeNaga), 'era cannot buff enemy naga');
  const pBefore = BoT.effPower(st, naga);
  fx = apply(st, { type: 'chooseTarget', k: naga, by: 'A', seed: 11 });
  if (fx.deny) fail('era buff deny: ' + fx.deny);
  ok(BoT.effPower(st, naga) === pBefore + 2, 'naga +2 permanent: ' + BoT.effPower(st, naga));
}

/* 3) ครุฑเวนไตย: hellPick กลับเด็คแล้ว POWER +3 — ห้ามเลือกตัวเอง */
{
  const st = emptyState();
  const g = put(st, 'A.avatar', 'SL02-002');
  const other = put(st, 'A.hell', 'BT07-012');
  const selfCopy = put(st, 'A.hell', 'BT07-013');
  const flare = put(st, 'A.hell', 'BT07-062');
  const junk = put(st, 'A.hell', 'SD01-011');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const p0 = BoT.effPower(st, g);
  let fx = apply(st, { type: 'activateAbility', k: g, by: 'A', seed: 20 });
  ok(!fx.deny, 'garuda activate: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'deck', 'garuda hellPick dest deck');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(other), 'can pick other garuda');
  ok(cands.includes(flare), 'can pick ขนมณี');
  ok(!cands.includes(selfCopy), 'cannot pick ครุฑเวนไตย');
  ok(!cands.includes(junk), 'cannot pick unrelated');
  fx = apply(st, { type: 'chooseTarget', k: other, by: 'A', seed: 21 });
  if (fx.deny) fail('garuda pick deny: ' + fx.deny);
  ok(BoT.zoneOf(st, other) === 'A.deck', 'picked garuda to deck');
  ok(BoT.effPower(st, g) === p0 + 3, 'garuda +3 after hellPick: ' + BoT.effPower(st, g));
}

console.log('wave0 sl02 reuse: all passed');
