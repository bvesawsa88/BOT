/* focused: คลื่น 1 ODY1-001/002/003 ทาโกะซัง จุติค้นชื่อจากเด็ค */
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
function jutiName(code) {
  const e = BoT.effectOf(code);
  const pick = ((((e && e.abilities) || [])[0] || {}).actions || []).find(a => a.op === 'deckPick');
  return pick && pick.filter && pick.filter.exactName;
}

ok(jutiName('ODY1-001') === 'ทาโกะซัง สูตรมนุษย์', '001 searches มนุษย์');
ok(jutiName('ODY1-002') === 'ทาโกะซัง สูตรนรก', '002 searches นรก');
ok(jutiName('ODY1-003') === 'ทาโกะซัง สูตรสวรรค์', '003 searches สวรรค์');

{
  const st = emptyState();
  const tako = put(st, 'A.hand', 'ODY1-001');
  const pay = put(st, 'A.hand', 'SD01-005');
  const human = put(st, 'A.deck', 'ODY1-002');
  const hell = put(st, 'A.deck', 'ODY1-003');
  const chaff = put(st, 'A.deck', 'SD01-011');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: tako, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 });
  ok(!fx.deny, 'summon สวรรค์: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'deckAll' && pr.dest === 'hand',
    'deckPick prompt: ' + JSON.stringify(pr && { kind: pr.kind, from: pr.from, dest: pr.dest }));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(human), 'can pick สูตรมนุษย์');
  ok(!cands.includes(hell), 'cannot pick สูตรนรก');
  ok(!cands.includes(chaff), 'cannot pick chaff');
  fx = apply(st, { type: 'chooseTarget', k: human, by: 'A', seed: 2 });
  if (fx.deny) fail('pick human deny: ' + fx.deny);
  ok(BoT.zoneOf(st, human) === 'A.hand', 'มนุษย์ขึ้นมือ');
  ok(BoT.zoneOf(st, hell) === 'A.deck', 'นรกยังในเด็ค');
}

console.log('wave1 tako 001-003: all passed');
