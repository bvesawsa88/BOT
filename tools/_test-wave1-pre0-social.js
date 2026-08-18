/* focused: คลื่น 1 PRE0-005-2 ผู้เล่นโซเชียล — ขโมย Avatar POWER น้อยกว่าไป Magic Zone */
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
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

{
  const st = emptyState();
  padDecks(st);
  const av = put(st, 'A.hand', 'PRE0-005-2');
  const p1 = put(st, 'A.hand', 'SD03-005');
  const p2 = put(st, 'A.hand', 'SD03-006');
  const weak = put(st, 'B.avatar', 'SD01-011');
  const mid = put(st, 'B.avatar', 'SD01-003');
  const strong = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [p1, p2], by: 'A', seed: 1 });
  ok(!fx.deny, 'summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'magic', 'steal-to-magic prompt: ' + (pr && pr.dest));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(weak), 'P1 < P3 legal');
  ok(cands.includes(mid), 'P2 < P3 legal');
  ok(!cands.includes(strong), 'P4 not < P3');
  fx = apply(st, { type: 'chooseTarget', k: weak, by: 'A', seed: 2 });
  if (fx.deny) fail('steal deny: ' + fx.deny);
  ok(BoT.zoneOf(st, weak) === 'A.magic', 'stolen to our magic');
  ok(st.inst[weak].originalOwner === 'B', 'remembers original owner');
}

{
  const st = emptyState();
  padDecks(st);
  const av = put(st, 'A.hand', 'PRE0-005-2');
  const p1 = put(st, 'A.hand', 'SD03-005');
  const p2 = put(st, 'A.hand', 'SD03-006');
  put(st, 'B.avatar', 'SD01-002');
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [p1, p2], by: 'A', seed: 3 });
  ok(!fx.deny, 'no legal target summon: ' + (fx.deny || ''));
  ok(!(st.prompts || []).length, 'no legal target skips pick');
}

console.log('wave1 pre0-social: all passed');
