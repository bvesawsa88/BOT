/* focused: คลื่น 2 CC02-008 ลุงน้อย — พอดี จุติจั่ว 3 คืนเด็ค 2 */
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
  const av = put(st, 'A.hand', 'CC02-008');
  const over = put(st, 'A.hand', 'SD02-006');
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [over], by: 'A', seed: 1 });
  ok(!!fx.deny && /พอดี/.test(fx.deny), 'overpay deny: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const av = put(st, 'A.hand', 'CC02-008');
  const pay = put(st, 'A.hand', 'SD02-009');
  const d1 = put(st, 'A.deck', 'SD01-002');
  const d2 = put(st, 'A.deck', 'SD01-011');
  const d3 = put(st, 'A.deck', 'SD01-003');
  const d4 = put(st, 'A.deck', 'SD02-006');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 2 });
  ok(!fx.deny, 'summon: ' + (fx.deny || ''));
  ok((st.zones['A.hand'] || []).length === 3, 'drew 3: ' + (st.zones['A.hand'] || []).length);
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDiscard' && pr.toDeck, 'return1: ' + (pr && pr.kind));
  const h1 = (st.zones['A.hand'] || [])[0];
  fx = apply(st, { type: 'chooseTarget', k: h1, by: 'A', seed: 3 });
  if (fx.deny) fail('return1 deny: ' + fx.deny);
  ok(BoT.zoneOf(st, h1) === 'A.deck', 'first returned');
  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDiscard' && pr.toDeck, 'return2: ' + (pr && pr.kind));
  const h2 = (st.zones['A.hand'] || [])[0];
  fx = apply(st, { type: 'chooseTarget', k: h2, by: 'A', seed: 4 });
  if (fx.deny) fail('return2 deny: ' + fx.deny);
  ok(BoT.zoneOf(st, h2) === 'A.deck', 'second returned');
  ok((st.zones['A.hand'] || []).length === 1, '1 card left in hand');
  ok(!(st.prompts || []).length, 'no leftover prompt');
}

console.log('wave2 lungnoi: all passed');
