/* focused: คลื่น 1 ODY1-004 ทาโกะจัง — คืนทาโกะซังชื่อไม่ซ้ำ 3 จากนรก แล้วจั่ว */
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

function summonJang(st, seed) {
  const jang = put(st, 'A.hand', 'ODY1-004');
  const pay = put(st, 'A.hand', 'BT07-012');
  const fx = apply(st, { type: 'summon', k: jang, to: 'A.avatar', payIds: [pay], by: 'A', seed });
  ok(!fx.deny, 'summon ทาโกะจัง: ' + (fx.deny || ''));
  return jang;
}

/* 1) นรกมีสูตร 3 ชื่อ + ทาโกะจัง + สูตรซ้ำ → คืน 3 ชื่อไม่ซ้ำ แล้วจั่ว */
{
  const st = emptyState();
  const heaven = put(st, 'A.hell', 'ODY1-001');
  const human = put(st, 'A.hell', 'ODY1-002');
  const hellF = put(st, 'A.hell', 'ODY1-003');
  const dup = put(st, 'A.hell', 'ODY1-001');
  const jangHell = put(st, 'A.hell', 'ODY1-004');
  const draw1 = put(st, 'A.deck', 'SD01-011');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  summonJang(st, 1);
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'hellMultiDeck' && pr.distinctNames && pr.multiExact === 3,
    'hellMulti distinct 3: ' + JSON.stringify(pr && { dest: pr.dest, exact: pr.multiExact, dist: pr.distinctNames }));
  let cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(heaven) && cands.includes(human) && cands.includes(hellF), 'three formulas legal');
  ok(cands.includes(dup), 'duplicate formula still listed before first pick');
  ok(!cands.includes(jangHell), 'ทาโกะจัง not ทาโกะซัง');
  let fx = apply(st, { type: 'chooseTarget', k: heaven, by: 'A', seed: 2 });
  if (fx.deny) fail('pick heaven deny: ' + fx.deny);
  ok(BoT.zoneOf(st, heaven) === 'A.deck', 'heaven returned');
  pr = (st.prompts || [])[0];
  cands = BoT.promptCandidates(st, pr);
  ok(!cands.includes(dup), 'same name blocked after pick: ' + cands.map(id => st.inst[id].name).join(','));
  fx = apply(st, { type: 'chooseTarget', k: human, by: 'A', seed: 3 });
  if (fx.deny) fail('pick human deny: ' + fx.deny);
  fx = apply(st, { type: 'chooseTarget', k: hellF, by: 'A', seed: 4 });
  if (fx.deny) fail('pick hell deny: ' + fx.deny);
  ok([heaven, human, hellF].every(k => BoT.zoneOf(st, k) !== 'A.hell'), 'formulas left hell');
  ok([heaven, human, hellF].filter(k => BoT.zoneOf(st, k) === 'A.deck' || BoT.zoneOf(st, k) === 'A.hand').length === 3,
    'formulas in deck/hand after shuffle+draw');
  ok((st.zones['A.hand'] || []).length >= 1, 'drew 1 after return: ' + (st.zones['A.hand'] || []).length);
  ok(BoT.zoneOf(st, jangHell) === 'A.hell', 'ทาโกะจัง stayed in hell');
  ok(BoT.zoneOf(st, dup) === 'A.hell', 'duplicate stayed in hell');
}

/* 2) นรกมีแค่ 2 ชื่อ → จุติไม่เปิดคืน */
{
  const st = emptyState();
  put(st, 'A.hell', 'ODY1-001');
  put(st, 'A.hell', 'ODY1-002');
  put(st, 'A.hell', 'ODY1-001');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  summonJang(st, 10);
  const pr = (st.prompts || [])[0];
  ok(!pr || pr.dest !== 'hellMultiDeck', 'no hell return when <3 names: ' + (pr && pr.dest));
}

console.log('wave1 takojang: all passed');
