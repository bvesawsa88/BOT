/* focused: คลื่น 2 CC01-008/010 จุติค้นเด็คขึ้นมือ */
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
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

{
  const st = emptyState();
  padDecks(st);
  const av = put(st, 'A.hand', 'CC01-008');
  const pay = put(st, 'A.hand', 'SD02-006');
  const bug = put(st, 'A.deck', 'BT02-047');
  const chaff = put(st, 'A.deck', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 });
  ok(!fx.deny, '008 summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'deckAll' && pr.dest === 'hand', '008 deckPick: ' + (pr && pr.dest));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(bug), 'can pick แมลงปอทอด');
  ok(!cands.includes(chaff), 'cannot pick chaff');
  fx = apply(st, { type: 'chooseTarget', k: bug, by: 'A', seed: 2 });
  if (fx.deny) fail('008 pick deny: ' + fx.deny);
  ok(BoT.zoneOf(st, bug) === 'A.hand', 'แมลงปอทอดขึ้นมือ');
}

{
  const st = emptyState();
  padDecks(st);
  const av = put(st, 'A.hand', 'CC01-010');
  const pay = put(st, 'A.hand', 'SD02-006');
  const land = put(st, 'A.deck', 'CC01-051');
  const chaff = put(st, 'A.deck', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [pay], by: 'A', seed: 3 });
  ok(!fx.deny, '010 summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'hand', '010 deckPick: ' + (pr && pr.dest));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(land), 'can pick สมชายห้องเช่า');
  ok(!cands.includes(chaff), 'cannot pick chaff');
  fx = apply(st, { type: 'chooseTarget', k: land, by: 'A', seed: 4 });
  if (fx.deny) fail('010 pick deny: ' + fx.deny);
  ok(BoT.zoneOf(st, land) === 'A.hand', 'สมชายห้องเช่าขึ้นมือ');
}

console.log('wave2 isan-boonchok: all passed');
