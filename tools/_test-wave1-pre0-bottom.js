/* focused: คลื่น 1 PRE0-001 ผู้เล่นยุคแรก — ดู 3 ใบล่างสุดเด็คศัตรู เลือกขึ้นบนสุด */
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

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  const b0 = put(st, 'B.deck', 'SD01-003');
  const b1 = put(st, 'B.deck', 'SD01-002');
  const b2 = put(st, 'B.deck', 'SD01-011');
  const bTop = put(st, 'B.deck', 'SD02-006');
  const av = put(st, 'A.hand', 'PRE0-001');
  const pay = put(st, 'A.hand', 'SD03-005');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 });
  ok(!fx.deny, 'summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'oppBottomPickTop', 'peek prompt: ' + (pr && pr.dest));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(b0) && cands.includes(b1) && cands.includes(b2), 'bottom 3 are candidates');
  ok(!cands.includes(bTop), 'current top not in peek');
  ok(!!st.inst[b0].revealed && !!st.inst[b1].revealed && !!st.inst[b2].revealed, 'peeked cards shown');
  fx = apply(st, { type: 'chooseTarget', k: b1, by: 'A', seed: 2 });
  if (fx.deny) fail('pick deny: ' + fx.deny);
  ok(st.zones['B.deck'][st.zones['B.deck'].length - 1] === b1, 'picked card is new top');
  ok(JSON.stringify(st.zones['B.deck']) === JSON.stringify([b0, b2, bTop, b1]), 'rest keep original order');
  ok(!st.inst[b0].revealed && !st.inst[b1].faceUp, 'peeked cards hidden again');
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  const av = put(st, 'A.hand', 'PRE0-001');
  const pay = put(st, 'A.hand', 'SD03-005');
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 3 });
  ok(!fx.deny, 'empty opp deck summon: ' + (fx.deny || ''));
  ok(!(st.prompts || []).length, 'empty opp deck no prompt');
}

console.log('wave1 pre0-bottom: all passed');
