/* Unit tests for Knight Deck (เด็คอัศวิน / อัศวินโต๊ะกลม) */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');

// 1. Load cards and effects
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const effs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8'));
const customDecks = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/custom-decks.json'), 'utf8'));

BoT.loadEffects(effs);

function byCode(code) {
  const c = cards.find(x => x.code === code);
  if (!c) throw new Error('Card not found: ' + code);
  return c;
}

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

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✔ PASS:', name);
    passed++;
  } catch (err) {
    console.error('✘ FAIL:', name, err.message);
    failed++;
  }
}

console.log('=== Running Knight Deck Tests ===\n');

// Test 1: Preset Deck Validity
test('Knight Deck Preset is present and valid in custom-decks.json', () => {
  const deck = customDecks['อัศวินโต๊ะกลม'];
  if (!deck) throw new Error('Deck อัศวินโต๊ะกลม is missing from custom-decks.json');
  const mainCount = Object.values(deck.main).reduce((a, b) => a + b, 0);
  const lifeCount = Object.values(deck.life).reduce((a, b) => a + b, 0);
  if (mainCount !== 50) throw new Error(`Main deck count must be 50, got ${mainCount}`);
  if (lifeCount !== 5) throw new Error(`Life deck count must be 5, got ${lifeCount}`);
});

// Test 2: Bedivere (BT05-003) effect structure
test('BT05-003 Bedivere has Juti effect to search Holy Sword into hell', () => {
  const st = emptyState();
  const bedi = put(st, 'A.hand', 'BT05-003');
  const sword = put(st, 'A.deck', 'BT05-064');
  const rtk = put(st, 'A.hell', 'BT05-004');
  
  // Verify effect is registered in engine
  const eff = BoT.effectOf(st.inst[bedi].code, st.inst[bedi].name);
  if (!eff || !eff.abilities || !eff.abilities.length) {
    throw new Error('Bedivere has no abilities in engine');
  }
  const juti = eff.abilities.find(a => a.keyword === 'จุติ');
  if (!juti) throw new Error('Bedivere missing Juti ability');
});

// Test 3: Lancelot (BT05-014) effect structure
test('BT05-014 Lancelot has Juti scout 2 effect', () => {
  const st = emptyState();
  const lance = put(st, 'A.hand', 'BT05-014');
  const eff = BoT.effectOf(st.inst[lance].code, st.inst[lance].name);
  if (!eff || !eff.abilities || !eff.abilities.length) {
    throw new Error('Lancelot has no abilities in engine');
  }
  const juti = eff.abilities.find(a => a.keyword === 'จุติ');
  if (!juti) throw new Error('Lancelot missing Juti ability');
});

// Test 4: Arthur (BT06-006) effect structure & uniqueOnField
test('BT06-006 Arthur has Juti effect and uniqueOnField meta', () => {
  const st = emptyState();
  const arthur = put(st, 'A.hand', 'BT06-006');
  const eff = BoT.effectOf(st.inst[arthur].code, st.inst[arthur].name);
  if (!eff) throw new Error('Arthur has no effect in engine');
  if (!eff.uniqueOnField) throw new Error('Arthur should have uniqueOnField');
  const juti = eff.abilities.find(a => a.keyword === 'จุติ');
  if (!juti) throw new Error('Arthur missing Juti ability');
});

// Test 5: Kay (BT06-007) effect structure
test('BT06-007 Kay has attack react ability', () => {
  const st = emptyState();
  const kay = put(st, 'A.avatar', 'BT06-007');
  const eff = BoT.effectOf(st.inst[kay].code, st.inst[kay].name);
  if (!eff) throw new Error('Kay has no effect in engine');
  const cmd = eff.abilities.find(a => a.keyword === 'สั่งใช้');
  if (!cmd) throw new Error('Kay missing สั่งใช้ ability');
});

// Test 6: Galahad (BT08-008) static power buff per distinct Holy Sword
test('BT08-008 Galahad has static power buff per distinct Holy Sword', () => {
  const st = emptyState();
  const galahad = put(st, 'A.avatar', 'BT08-008');
  const s1 = put(st, 'A.magic', 'BT05-064');
  const s2 = put(st, 'A.magic', 'BT06-058');
  
  const p1 = BoT.effPower(st, galahad);
  if (p1 !== 5) { // Base 3 + 2 distinct Holy Swords
    throw new Error(`Expected Galahad POWER to be 5, got ${p1}`);
  }
});

// Test 7: Holy Swords (BT05-064, BT06-058, BT08-059, BT08-060) attachment rules
test('Holy Swords have hostAttachNameIncludes / attachOnly', () => {
  ['BT05-064', 'BT06-058', 'BT08-059', 'BT08-060'].forEach(code => {
    const card = byCode(code);
    const eff = effs.cards.find(e => e.code === code);
    if (!eff) throw new Error(`Missing effect for ${code}`);
    if (eff.attachOnly !== 'Avatar') throw new Error(`${code} should attach to Avatar`);
    if (!eff.hostAttachNameIncludes) throw new Error(`${code} should specify hostAttachNameIncludes`);
  });
});

// Test 8: Galahad (BT08-008) Cost reduction with 2 Holy Swords
test('BT08-008 Galahad cost becomes 4 when 2 Holy Swords in Magic Zone', () => {
  const st = emptyState();
  const galahad = put(st, 'A.hand', 'BT08-008');
  const baseCost = BoT.effCost(st, galahad);
  if (baseCost !== 6) throw new Error(`Base cost should be 6, got ${baseCost}`);

  put(st, 'A.magic', 'BT05-064');
  put(st, 'A.magic', 'BT06-058');

  const reducedCost = BoT.effCost(st, galahad);
  if (reducedCost !== 4) throw new Error(`Cost with 2 Holy Swords should be 4, got ${reducedCost}`);
});

// Test 9: Gawain (BT05-015) POWER +2 in opponent turn
test('BT05-015 Gawain gets POWER +2 only in opponent turn', () => {
  const st = emptyState();
  const gawain = put(st, 'A.avatar', 'BT05-015');

  st.active = 'A'; // Own turn
  const ownPower = BoT.effPower(st, gawain);
  if (ownPower !== 4) throw new Error(`Own turn power should be 4, got ${ownPower}`);

  st.active = 'B'; // Opponent turn
  const oppPower = BoT.effPower(st, gawain);
  if (oppPower !== 6) throw new Error(`Opponent turn power should be 6, got ${oppPower}`);
});

// Test 10: Activating Holy Swords (BT05-064, BT06-058, BT08-059, BT08-060) from hell
test('Holy Swords can be activated from hell and attach to valid Avatar', () => {
  ['BT05-064', 'BT06-058', 'BT08-059', 'BT08-060'].forEach(code => {
    const st = emptyState();
    const arthur = put(st, 'A.avatar', 'BT06-006'); // Arthur (Round Table Knight)
    put(st, 'A.deck', 'SD01-001'); // Deck card
    const sword = put(st, 'A.hell', code);

    const actRes = BoT.applyAction(st, { type: 'activateAbility', k: sword, by: 'A' });
    if (!st.prompts.length) throw new Error(`Activating ${code} from hell did not generate target prompt`);

    const p = st.prompts[0];
    if (p.dest !== 'attachTo' || p.attachMod !== sword) {
      throw new Error(`Invalid prompt created for ${code} from hell`);
    }

    const chooseRes = BoT.applyAction(st, { type: 'chooseTarget', k: arthur, by: 'A' });
    if (BoT.zoneOf(st, sword) !== 'A.magic') {
      throw new Error(`${code} failed to move to A.magic after attaching from hell`);
    }
    if (st.inst[sword].attachedTo !== arthur) {
      throw new Error(`${code} failed to set attachedTo to ${arthur}`);
    }
  });
});

// Test 11: BT06-006 Arthur Juti sends 2 Holy Swords to hell first, then summons Knight from deck
test('BT06-006 Arthur Juti prompts 2 Holy Swords to hell first, then summons Knight', () => {
  const st = emptyState();
  const arthur = put(st, 'A.hand', 'BT06-006');
  const s1 = put(st, 'A.deck', 'BT05-064'); // Alondite
  const s2 = put(st, 'A.deck', 'BT06-058'); // Galatine
  const rtk = put(st, 'A.deck', 'BT05-003'); // Bedivere

  // Gems for cost (4 copies of BT05-003 = 8 Red gems)
  const payGems = [];
  for (let i = 0; i < 4; i++) payGems.push(put(st, 'A.hand', 'BT05-003'));
  for (let i = 0; i < 5; i++) put(st, 'B.deck', 'SD01-001');

  BoT.applyAction(st, { type: 'summon', k: arthur, by: 'A', to: 'A.avatar', payIds: payGems });
  if (!st.prompts.length || st.prompts[0].dest !== 'hell') {
    throw new Error('Arthur Juti should prompt to send Holy Swords to hell first');
  }

  // Pick 1st sword
  BoT.applyAction(st, { type: 'chooseTarget', k: s1, by: 'A' });
  // Pick 2nd sword
  BoT.applyAction(st, { type: 'chooseTarget', k: s2, by: 'A' });

  if (!st.prompts.length || st.prompts[0].dest !== 'avatar') {
    throw new Error('Arthur Juti should prompt to summon Round Table Knight after sending Holy Swords to hell');
  }

  // Pick Bedivere to avatar
  BoT.applyAction(st, { type: 'chooseTarget', k: rtk, by: 'A' });

  if (BoT.zoneOf(st, s1) !== 'A.hell' || BoT.zoneOf(st, s2) !== 'A.hell') {
    throw new Error('Holy Swords were not sent to hell');
  }
  if (BoT.zoneOf(st, rtk) !== 'A.avatar') {
    throw new Error('Round Table Knight was not summoned to avatar zone');
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
