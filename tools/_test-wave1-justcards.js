/* focused: คลื่น 1 ODY1-063 เอาแค่การ์ด !!! — ทิ้งทาโกะ/โอเดนย่า แล้วเด้ง Avatar */
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
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

{
  const st = emptyState();
  padDecks(st);
  const mag = put(st, 'A.hand', 'ODY1-063');
  put(st, 'A.hand', 'SD01-011');
  const fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  ok(!!fx.deny && /ทิ้ง/.test(fx.deny), 'no tako/odenya deny: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  padDecks(st);
  const mag = put(st, 'A.hand', 'ODY1-063');
  const tako = put(st, 'A.hand', 'ODY1-001');
  const chaff = put(st, 'A.hand', 'SD01-011');
  const foe = put(st, 'B.avatar', 'SD01-003');
  const ally = put(st, 'A.avatar', 'SD01-002');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 2 });
  ok(!fx.deny, 'play: ' + (fx.deny || ''));
  skipNegate(st);
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDiscard', 'discard cost: ' + (pr && pr.kind));
  const disc = BoT.promptCandidates(st, pr);
  ok(disc.includes(tako), 'can discard tako');
  ok(!disc.includes(chaff), 'cannot discard chaff');
  fx = apply(st, { type: 'chooseTarget', k: tako, by: 'A', seed: 3 });
  if (fx.deny) fail('discard deny: ' + fx.deny);
  skipNegate(st);
  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'bounceHand', 'bounce prompt: ' + (pr && pr.dest));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(foe) && cands.includes(ally), 'can bounce any field avatar');
  fx = apply(st, { type: 'chooseTarget', k: foe, by: 'A', seed: 4 });
  if (fx.deny) fail('bounce deny: ' + fx.deny);
  ok(BoT.zoneOf(st, foe) === 'B.hand', 'foe back to owner hand');
  ok(BoT.zoneOf(st, tako) === 'A.hell', 'tako discarded');
}

console.log('wave1 just-cards: all passed');
