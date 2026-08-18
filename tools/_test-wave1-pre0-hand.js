/* focused: คลื่น 1 PRE0-002/003 — สุ่มมือขึ้นเด็ค + เปิดมือศัตรู */
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
  const av = put(st, 'A.hand', 'PRE0-002');
  const pay = put(st, 'A.hand', 'SD02-006');
  const stolen = put(st, 'B.hand', 'SD01-002');
  const topBefore = st.zones['B.deck'][st.zones['B.deck'].length - 1];
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 });
  ok(!fx.deny, '002 summon: ' + (fx.deny || ''));
  ok(BoT.zoneOf(st, stolen) === 'B.deck', 'stolen card on opp deck');
  ok(st.zones['B.deck'][st.zones['B.deck'].length - 1] === stolen, 'stolen is new top');
  ok(st.zones['B.deck'].includes(topBefore), 'old top still in deck');
  ok(!!st.inst[stolen].faceUp, 'random pick shown face up');
}

{
  const st = emptyState();
  padDecks(st);
  const av = put(st, 'A.hand', 'PRE0-002');
  const pay = put(st, 'A.hand', 'SD02-006');
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 2 });
  ok(!fx.deny, '002 empty hand summon: ' + (fx.deny || ''));
  ok(!(st.prompts || []).length, '002 empty hand no prompt');
}

{
  const st = emptyState();
  padDecks(st);
  const av = put(st, 'A.hand', 'PRE0-003');
  const pay = put(st, 'A.hand', 'SD04-008');
  const h1 = put(st, 'B.hand', 'SD01-002');
  const h2 = put(st, 'B.hand', 'SD01-011');
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 3 });
  ok(!fx.deny, '003 summon: ' + (fx.deny || ''));
  ok(!!st.inst[h1].revealed && !!st.inst[h2].revealed, 'both opp hand cards revealed');
  ok(fx.toss && fx.toss.by === 'B' && (fx.toss.names || []).length === 2, 'toss popup names');
  ok(BoT.zoneOf(st, h1) === 'B.hand' && BoT.zoneOf(st, h2) === 'B.hand', 'cards stay in hand');
}

console.log('wave1 pre0-hand: all passed');
