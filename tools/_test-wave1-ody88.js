/* focused: คลื่น 1 ODY1-066 ดาว O.D.Y 88 — ทาโกะทั้งสนาม +1 */
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
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 6) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const mag = put(st, 'A.hand', 'ODY1-066');
  const tako = put(st, 'A.avatar', 'ODY1-001');
  const foeTako = put(st, 'B.avatar', 'ODY1-002');
  const other = put(st, 'A.avatar', 'SD01-003');
  const pTako = BoT.effPower(st, tako);
  const pFoe = BoT.effPower(st, foeTako);
  const pOth = BoT.effPower(st, other);
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  ok(!fx.deny, 'play star: ' + (fx.deny || ''));
  skipNegate(st);
  ok(BoT.effPower(st, tako) === pTako + 1, 'own tako +1: ' + BoT.effPower(st, tako));
  ok(BoT.effPower(st, foeTako) === pFoe + 1, 'enemy tako +1: ' + BoT.effPower(st, foeTako));
  ok(BoT.effPower(st, other) === pOth, 'non-tako unchanged: ' + BoT.effPower(st, other));
}

console.log('wave1 ody88: all passed');
