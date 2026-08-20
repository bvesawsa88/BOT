/* focused: คลื่น 2 CC01-012 เฟรนชี่ — คำสั่งเสียจั่ว 2 แล้ววางมือใต้เด็ค */
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
  const av = put(st, 'A.avatar', 'CC01-012');
  const bottom = put(st, 'A.deck', 'SD01-003');
  const d1 = put(st, 'A.deck', 'SD01-002');
  const d2 = put(st, 'A.deck', 'SD01-011');
  const d3 = put(st, 'A.deck', 'SD02-006');
  let fx = apply(st, { type: 'move', k: av, to: 'A.hell', by: 'A', seed: 1 });
  ok(!fx.deny, 'destroy: ' + (fx.deny || ''));
  ok(BoT.zoneOf(st, av) === 'A.hell', 'frenchie in hell');
  ok((st.zones['A.hand'] || []).length === 2, 'drew 2: ' + (st.zones['A.hand'] || []).length);
  ok((st.zones['A.hand'] || []).includes(d2) && (st.zones['A.hand'] || []).includes(d3), 'drew top 2');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDiscard' && pr.toDeck && pr.toDeckBottom, 'put bottom prompt');
  fx = apply(st, { type: 'chooseTarget', k: d3, by: 'A', seed: 2 });
  if (fx.deny) fail('bottom deny: ' + fx.deny);
  ok(BoT.zoneOf(st, d3) === 'A.deck', 'chosen back to deck');
  ok(st.zones['A.deck'][0] === d3, 'chosen is new bottom');
  ok(st.zones['A.deck'][st.zones['A.deck'].length - 1] !== d3, 'not on top');
  ok((st.zones['A.hand'] || []).length === 1 && (st.zones['A.hand'] || [])[0] === d2, 'other draw stays in hand');
  ok(st.zones['A.deck'].includes(bottom) && st.zones['A.deck'].includes(d1), 'rest of deck kept');
}

console.log('wave2 frenchie: all passed');
