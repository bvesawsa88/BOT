/* focused: คลื่น 1 ODY1-028 ทศกัณฑ์ยักษ์ — จุติยึด Avatar นอน */
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
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const toss = put(st, 'A.hand', 'ODY1-028');
  const pay = put(st, 'A.hand', 'SD03-005');
  const foe = put(st, 'B.avatar', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: toss, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 });
  ok(!fx.deny, 'summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'takeControl', 'takeControl prompt: ' + (pr && pr.dest));
  ok((BoT.promptCandidates(st, pr) || []).includes(foe), 'can steal foe');
  fx = apply(st, { type: 'chooseTarget', k: foe, by: 'A', seed: 2 });
  if (fx.deny) fail('steal deny: ' + fx.deny);
  ok(BoT.zoneOf(st, foe) === 'A.avatar', 'stolen to our avatar');
  ok(!!st.inst[foe].tapped, 'stolen tapped');
  ok(st.inst[foe].originalOwner === 'B', 'remembers original owner');
}

console.log('wave1 tossakan-wife: all passed');
