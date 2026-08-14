/* focused: เอริ หน่วยรบ XVI — สนามเต็มแล้วยังโชว์สอดแนม แต่ไม่ขึ้นมือ */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    attacksThisTurn: { A: 0, B: 0 }, skipLethalPlead: true
  };
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
function drainPrompts(st, seed) {
  let n = 0;
  while ((st.prompts || []).length && n++ < 12) {
    const pr = st.prompts[0];
    if (pr.kind === 'react') {
      const fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: seed + n });
      if (fx.deny) fail('reactNo deny: ' + fx.deny);
      continue;
    }
    break;
  }
}

{
  const st = emptyState();
  const eri = put(st, 'A.avatar', 'BT11-017', { power: 5 });
  put(st, 'A.avatar', 'BT11-014');
  put(st, 'A.avatar', 'BT11-015');
  put(st, 'A.avatar', 'BT11-016');
  put(st, 'A.deck', 'SD01-003');
  const s1 = put(st, 'A.deck', 'BT11-014');
  const s2 = put(st, 'A.deck', 'BT11-015');
  const s3 = put(st, 'A.deck', 'BT11-016');
  put(st, 'B.deck', 'SD01-003');
  const enemy = put(st, 'B.avatar', 'SD01-003', { power: 1 });

  const fx = BoT.applyAction(st, { type: 'declareAttack', atk: eri, def: enemy, by: 'A', seed: 1 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  drainPrompts(st, 1);

  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'ids' && pr.revealAllScout, 'scout window shown even when field full');
  ok((pr.ids || []).length === 3, 'all 3 scout cards visible');
  ok(pr.dest === 'avatar' && pr.restTo === 'hell', 'dest still summon / rest hell');

  const skip = BoT.applyAction(st, { type: 'skipPrompt', by: 'A', seed: 2 });
  if (skip.deny) fail('skipPrompt deny: ' + skip.deny);
  ok(BoT.zoneOf(st, s1) === 'A.hell', 'scout 1 to hell after skip');
  ok(BoT.zoneOf(st, s2) === 'A.hell', 'scout 2 to hell after skip');
  ok(BoT.zoneOf(st, s3) === 'A.hell', 'scout 3 to hell after skip');
  ok((st.zones['A.hand'] || []).length === 0, 'hand empty after skip');
  ok((st.zones['A.avatar'] || []).length === 4, 'field still 4');
}

{
  const st = emptyState();
  const eri = put(st, 'A.avatar', 'BT11-017', { power: 5 });
  put(st, 'A.avatar', 'BT11-014');
  put(st, 'A.avatar', 'BT11-015');
  put(st, 'A.avatar', 'BT11-016');
  put(st, 'A.deck', 'SD01-003');
  const s1 = put(st, 'A.deck', 'BT11-014');
  const s2 = put(st, 'A.deck', 'SD01-003');
  const s3 = put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  const enemy = put(st, 'B.avatar', 'SD01-003', { power: 1 });

  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: eri, def: enemy, by: 'A', seed: 5 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  drainPrompts(st, 5);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && (pr.ids || []).includes(s1), 'scout shown; XVI pickable');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: s1, by: 'A', seed: 6 });
  if (fx.deny) fail('pick when full deny: ' + fx.deny);
  drainPrompts(st, 6);
  ok(BoT.zoneOf(st, s1) === 'A.hell', 'picked XVI goes to hell (cannot summon)');
  ok(BoT.zoneOf(st, s2) === 'A.hell', 'rest 1 hell');
  ok(BoT.zoneOf(st, s3) === 'A.hell', 'rest 2 hell');
  ok((st.zones['A.hand'] || []).length === 0, 'pick when full does not go to hand');
  ok((st.zones['A.avatar'] || []).length === 4, 'field still 4 after pick');
}

{
  const st = emptyState();
  const eri = put(st, 'A.avatar', 'BT11-017', { power: 5 });
  put(st, 'A.avatar', 'BT11-014');
  put(st, 'A.deck', 'SD01-003');
  const filler1 = put(st, 'A.deck', 'SD01-003');
  const filler2 = put(st, 'A.deck', 'SD01-011');
  const xvi = put(st, 'A.deck', 'BT11-015');
  put(st, 'B.deck', 'SD01-003');
  const enemy = put(st, 'B.avatar', 'SD01-003', { power: 1 });

  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: eri, def: enemy, by: 'A', seed: 10 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  drainPrompts(st, 10);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'avatar', 'pick summon when there is room');
  ok((pr.ids || []).includes(xvi), 'XVI in scout');

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: xvi, by: 'A', seed: 11 });
  if (fx.deny) fail('pick XVI deny: ' + fx.deny);
  drainPrompts(st, 11);
  ok(BoT.zoneOf(st, xvi) === 'A.avatar', 'XVI summoned');
  ok(BoT.zoneOf(st, filler1) === 'A.hell', 'rest filler 1 hell');
  ok(BoT.zoneOf(st, filler2) === 'A.hell', 'rest filler 2 hell');
  ok((st.zones['A.hand'] || []).length === 0, 'nothing to hand when summoning');
}

console.log('all eri full-field tests passed');
