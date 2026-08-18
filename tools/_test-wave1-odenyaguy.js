/* focused: คลื่น 1 ODY1-005 โอเดนย่ากาย — โจมตีได้เมื่อมีทาโกะเท่านั้น */
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
    phase: 'Battle', active: 'A', turn: 2, turnSeq: 2,
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
  const guy = put(st, 'A.avatar', 'ODY1-005');
  const foe = put(st, 'B.avatar', 'SD01-011');
  const fx = apply(st, { type: 'declareAttack', atk: guy, def: foe, by: 'A', seed: 1 });
  ok(!!fx.deny && /ทาโกะ/.test(fx.deny), 'solo blocked: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  padDecks(st);
  const guy = put(st, 'A.avatar', 'ODY1-005');
  put(st, 'A.avatar', 'SD01-003');
  const foe = put(st, 'B.avatar', 'SD01-011');
  const fx = apply(st, { type: 'declareAttack', atk: guy, def: foe, by: 'A', seed: 2 });
  ok(!!fx.deny && /ทาโกะ/.test(fx.deny), 'non-tako ally blocked: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  padDecks(st);
  const guy = put(st, 'A.avatar', 'ODY1-005');
  put(st, 'A.avatar', 'ODY1-001');
  const foe = put(st, 'B.avatar', 'SD01-011');
  const fx = apply(st, { type: 'declareAttack', atk: guy, def: foe, by: 'A', seed: 3 });
  ok(!fx.deny, 'with tako ally: ' + (fx.deny || ''));
}

console.log('wave1 odenyaguy: all passed');
