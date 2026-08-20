/* focused: คลื่น 2 CC02-006 ซุส — จุติเลือกจากเด็คขึ้นมือ 2 ใบ */
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
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const av = put(st, 'A.hand', 'CC02-006');
  const p1 = put(st, 'A.hand', 'SD02-006');
  const p2 = put(st, 'A.hand', 'SD02-009');
  const a = put(st, 'A.deck', 'SD01-002');
  const b = put(st, 'A.deck', 'SD01-011');
  const c = put(st, 'A.deck', 'SD01-003');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [p1, p2], by: 'A', seed: 1 });
  ok(!fx.deny, 'summon: ' + (fx.deny || ''));
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'hand' && pr.multiMax === 2, 'multiMax 2: ' + JSON.stringify(pr && { dest: pr.dest, max: pr.multiMax }));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(a) && cands.includes(b) && cands.includes(c), 'all deck cards legal');
  fx = apply(st, { type: 'chooseTarget', k: a, by: 'A', seed: 2 });
  if (fx.deny) fail('pick1 deny: ' + fx.deny);
  ok(BoT.zoneOf(st, a) === 'A.hand', 'first to hand');
  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'hand', 'second pick prompt');
  fx = apply(st, { type: 'chooseTarget', k: b, by: 'A', seed: 3 });
  if (fx.deny) fail('pick2 deny: ' + fx.deny);
  ok(BoT.zoneOf(st, b) === 'A.hand', 'second to hand');
  ok(BoT.zoneOf(st, c) === 'A.deck', 'third stays in deck');
  ok(!(st.prompts || []).length, 'done after 2');
}

console.log('wave2 zeus: all passed');
