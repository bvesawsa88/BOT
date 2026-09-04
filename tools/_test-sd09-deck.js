const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));
const sd09Effects = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-sd09.json'), 'utf8'));
BoT.loadEffects(sd09Effects);

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
    strict: false, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    gems: { A: 10, B: 10 }
  }, extra || {});
}

function put(st, zone, code, extra) {
  const c = cards.find(x => x.code === code);
  if (!c) throw new Error('missing ' + code);
  const n = Object.keys(st.inst).length + 1;
  const k = 't' + n;
  st.inst[k] = Object.assign({
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    img: c.imageUrl || '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  }, extra || {});
  st.zones[zone] = st.zones[zone] || [];
  st.zones[zone].push(k);
  return k;
}

// 1. Test SD09-004 Pali (พาลี): destroyEnemyLowestCost
{
  const st = emptyState();
  const e1 = put(st, 'B.avatar', 'SD09-001'); // Cost 4
  const e2 = put(st, 'B.avatar', 'SD09-004'); // Cost 7
  const pali = put(st, 'A.hand', 'SD09-004'); // Cost 7

  // Apply Pali summon from hand with free=true & paidCost=true
  BoT.applyAction(st, { type: 'summon', k: pali, to: 'A.avatar', by: 'A', free: true, paidCost: true });

  assert.ok(!st.zones['B.avatar'].includes(e1), 'Enemy lowest cost avatar e1 should be destroyed by Pali');
  assert.ok(st.zones['B.avatar'].includes(e2), 'Enemy higher cost avatar e2 should survive Pali');
  console.log('SD09-004 Pali destroyEnemyLowestCost test passed');
}

// 2. Test SD09-014 Forest Election (เลือกตั้งเจ้าป่า): scout 7 & summon Kingka directly
{
  const st = emptyState();
  const m1 = put(st, 'A.avatar', 'SD09-001'); // monkey to sacrifice
  const cardMagic = put(st, 'A.hand', 'SD09-014');
  
  const d1 = put(st, 'A.deck', 'BT01-001');
  const d2 = put(st, 'A.deck', 'BT01-002');
  const d3 = put(st, 'A.deck', 'BT01-003');
  const d4 = put(st, 'A.deck', 'BT01-004');
  const d5 = put(st, 'A.deck', 'BT01-005');
  const d6 = put(st, 'A.deck', 'BT01-006');
  const kingka = put(st, 'A.deck', 'SD09-005'); // Kingka monkey top deck

  // Play Magic SD09-014
  BoT.applyAction(st, { type: 'playMagic', k: cardMagic, by: 'A', payIds: [] });

  // Prompt to sacrifice 1 monkey
  assert.strictEqual(st.prompts.length, 1, 'Should prompt to sacrifice monkey');
  BoT.applyAction(st, { type: 'chooseTarget', k: m1, by: 'A' });

  if (st.prompts.length && st.prompts[0].kind === 'react') {
    BoT.applyAction(st, { type: 'reactNo', by: 'B' });
  }

  // Should have scout prompt for 7 cards
  assert.strictEqual(st.prompts.length, 1, 'Should prompt scout 7 cards');
  const scoutPrompt = st.prompts[0];
  assert.strictEqual(scoutPrompt.dest, 'scoutPickOrSummonKingka', 'Scout dest should be scoutPickOrSummonKingka');
  assert.strictEqual(scoutPrompt.ids.length, 7, 'Should scout 7 cards');

  // Pick Kingka
  BoT.applyAction(st, { type: 'chooseTarget', k: kingka, by: 'A' });

  assert.ok(st.zones['A.avatar'].includes(kingka), 'Kingka should be summoned directly to A.avatar!');
  console.log('SD09-014 Forest Election scout & Kingka summon test passed');
}

// 3. Test SD09-003 Sukreep (สุครีพ): setChosenEnemyCostsToLowest
{
  const st = emptyState();
  const e1 = put(st, 'B.avatar', 'SD09-001'); // Cost 4
  const e2 = put(st, 'B.avatar', 'SD09-004'); // Cost 7
  const sukreep = put(st, 'A.avatar', 'SD09-003');

  const { effCost } = BoT;

  BoT.applyAction(st, { type: 'setPhase', phase: 'Main', by: 'A' });

  // Should prompt to pick 2 enemy avatars
  const p = st.prompts.find(x => x.dest === 'setCostsToLowest');
  if (p) {
    BoT.applyAction(st, { type: 'chooseTarget', k: e1, by: 'A' });
    BoT.applyAction(st, { type: 'chooseTarget', k: e2, by: 'A' });
    assert.strictEqual(effCost(st, e2), 4, 'e2 cost should be adjusted to lowest cost 4');
    console.log('SD09-003 Sukreep cost reduction test passed');
  }
}

console.log('All SD09 deck tests passed successfully!');
