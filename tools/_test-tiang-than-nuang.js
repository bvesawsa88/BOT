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
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
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

// Test 1: Without พี่หน่วง -> Cost is 3, cannot free summon
{
  const st = emptyState();
  const ship = put(st, 'A.hand', 'BT07-072');
  ok(BoT.effCost(st, ship) === 3, 'No Nuang: effCost is 3 (was ' + BoT.effCost(st, ship) + ')');
  ok(!BoT.freeSummonOk(st, ship), 'No Nuang: freeSummonOk is false');
  
  const fx = BoT.applyAction(st, { type: 'summon', k: ship, to: 'A.construct', by: 'A', seed: 1 });
  ok(!!fx.deny, 'No Nuang: cannot summon without paying: ' + fx.deny);
}

// Test 2: With พี่หน่วง -> Cost is 0, free summon succeeds
{
  const st = emptyState();
  const nuang = put(st, 'A.avatar', 'BT07-023'); // พี่หน่วง พิธีกรผมสวย
  const ship = put(st, 'A.hand', 'BT07-072');
  
  ok(BoT.effCost(st, ship) === 0, 'With Nuang: effCost is 0');
  ok(BoT.freeSummonOk(st, ship), 'With Nuang: freeSummonOk is true');
  
  const fx = BoT.applyAction(st, { type: 'summon', k: ship, to: 'A.construct', by: 'A', seed: 2 });
  ok(!fx.deny, 'With Nuang: summon succeeds without gems (free): ' + (fx.deny || ''));
  ok(BoT.zoneOf(st, ship) === 'A.construct', 'Ship is now on A.construct');
}

// Test 3: End Phase Draw when Nuang on Avatar & enemy on Magic
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-011');
  const nuang = put(st, 'A.avatar', 'BT07-023');
  const ship = put(st, 'A.construct', 'BT07-072');
  const enemyCard = put(st, 'A.magic', 'BT04-036'); // Enemy avatar captured in our magic zone
  st.inst[enemyCard].cardOwner = 'B';
  
  const handBefore = (st.zones['A.hand'] || []).length;
  const fx = BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 3 });
  ok(!fx.deny, 'endTurn succeeds: ' + (fx.deny || ''));
  ok((st.zones['A.hand'] || []).length === handBefore + 1, 'End Phase draw 1 triggered');
}

// Test 4: Activated ability gives โล่มนุษย์
{
  const st = emptyState();
  const nuang = put(st, 'A.avatar', 'BT07-023');
  const ship = put(st, 'A.construct', 'BT07-072');
  
  let fx = BoT.applyAction(st, { type: 'activateAbility', k: ship, by: 'A', seed: 4 });
  ok(!fx.deny, 'activateAbility succeeds: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'grantKeyword' && pr.keyword === 'โล่มนุษย์', 'Prompted to grant โล่มนุษย์');
  
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: nuang, by: 'A', seed: 5 });
  ok(!fx.deny, 'chooseTarget succeeds');
  ok(BoT.hasKw(st, nuang, 'โล่มนุษย์'), 'Nuang has โล่มนุษย์ keyword');
}

console.log('ALL TESTS PASSED FOR ยานรายการ เถียงทันหน่วง');
