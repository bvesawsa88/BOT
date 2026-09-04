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
    strict: true, firstPlayer: 'A', fpDrawn: true,
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

// 1. Test SD09-010 Caesar Salad scout ability upon destroyed
{
  const st = emptyState();

  const caesarId = put(st, 'A.avatar', 'SD09-010');
  const magic1 = put(st, 'A.deck', 'BT01-001');
  const magic2 = put(st, 'A.deck', 'BT01-002');
  const monkey1 = put(st, 'A.deck', 'SD09-001');

  // Destroy Caesar Salad
  BoT.applyAction(st, { type: 'destroyCard', k: caesarId, by: 'A' });

  assert.strictEqual(st.prompts.length, 1, 'Should have 1 scout prompt');
  const p = st.prompts[0];
  assert.strictEqual(p.dest, 'avatar', 'Scout dest should be avatar');
  assert.strictEqual(p.ids.length, 3, 'Should scout 3 cards');

  // Pick monkey card to summon to Avatar Zone
  const monkeyId = p.ids.find(id => st.inst[id].code === 'SD09-001');
  assert.ok(monkeyId, 'Should find monkey card');

  BoT.applyAction(st, { type: 'chooseTarget', k: monkeyId, by: 'A' });

  assert.ok(st.zones['A.avatar'].includes(monkeyId), 'Monkey avatar should be in A.avatar');
  assert.strictEqual(st.prompts.length, 0, 'Prompts cleared');
}

console.log('SD09-010 Caesar Salad scout test passed');
