const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exit(1);
  }
  console.log('✅ PASS:', msg);
}

function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones, log: [],
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
  };
}

console.log('=== Test Polygon Abilities ===');

// 1. Test BT09-006 Lucia Polygon
{
  console.log('\n--- Test 1: BT09-006 ลูเซีย โพลีกอน ---');
  const st = emptyState();
  const luciaK = 'lucia';
  st.inst[luciaK] = { id: luciaK, code: 'BT09-006', name: 'ลูเซีย โพลีกอน', type: 'Avatar', cost: 2, power: 2, faceUp: true, tapped: false };
  st.zones['A.avatar'].push(luciaK);

  // Deck has avatars: God, Hell, and Polygon, plus normal card
  const c1 = 'c1', c2 = 'c2', c3 = 'c3', c4 = 'c4';
  st.inst[c1] = { id: c1, code: 'BT09-007', name: 'โฮคุ โพลีกอน', type: 'Avatar', cost: 3, power: 3, symbol: 'สัตว์' };
  st.inst[c2] = { id: c2, code: 'BT01-001', name: 'เทพเจ้า A', type: 'Avatar', cost: 4, power: 4, symbol: 'เทพ' };
  st.inst[c3] = { id: c3, code: 'BT01-002', name: 'ปีศาจนรก B', type: 'Avatar', cost: 5, power: 2, symbol: 'นรก' };
  st.inst[c4] = { id: c4, code: 'BT01-003', name: 'คนธรรมดา C', type: 'Avatar', cost: 6, power: 2, symbol: 'มนุษย์' };
  st.zones['A.deck'] = [c1, c2, c3, c4];

  // Activate ability
  const res = BoT.applyAction(st, { type: 'activateAbility', k: luciaK, by: 'A' });
  assert(!res || !res.deny, 'Lucia activated ability allowed');

  const p = st.prompts[0];
  assert(p && p.dest === 'deckTop', 'Prompt created to pick card to deckTop');

  const cands = BoT.promptCandidates(st, p);
  console.log('Candidates found in deck:', cands);
  assert(cands.includes(c1), 'Hoku Polygon is valid target');
  assert(cands.includes(c2), 'God is valid target');
  assert(cands.includes(c3), 'Hell is valid target');
  assert(!cands.includes(c4), 'Cost 6 Human is NOT valid target');

  // Choose c1 (Hoku Polygon)
  BoT.applyAction(st, { type: 'chooseTarget', k: c1, by: 'A' });
  const deck = st.zones['A.deck'];
  assert(deck[deck.length - 1] === c1, 'Hoku Polygon is on top of deck');

  // Second activation in same turn must be denied (once per turn)
  const res2 = BoT.applyAction(st, { type: 'activateAbility', k: luciaK, by: 'A' });
  assert(res2 && res2.deny, 'Second activation denied (once per turn)');
}

// 2. Test BT09-022 Sona Polygon
{
  console.log('\n--- Test 2: BT09-022 โซน่า โพลีกอน ---');
  const st = emptyState();
  const sonaK = 'sona';
  st.inst[sonaK] = { id: sonaK, code: 'BT09-022', name: 'โซน่า โพลีกอน', type: 'Avatar', cost: 4, power: 1, faceUp: true, tapped: false };
  st.zones['A.avatar'].push(sonaK);

  // Put a card in deck to draw
  st.inst['cardD'] = { id: 'cardD', code: 'BT01-001', name: 'จั่วได้', type: 'Avatar' };
  st.zones['A.deck'].push('cardD');

  assert(st.zones['A.hand'].length === 0, 'Hand initially 0');
  assert(!st.inst[sonaK].tapped, 'Sona initially untapped');

  // Activate Sona: tapSelf -> draw 1
  const res = BoT.applyAction(st, { type: 'activateAbility', k: sonaK, by: 'A' });
  assert(!res || !res.deny, 'Sona ability allowed');
  assert(st.inst[sonaK].tapped === true, 'Sona is now tapped');
  assert(st.zones['A.hand'].length === 1 && st.zones['A.hand'][0] === 'cardD', 'Drew 1 card to hand');

  // Try activating while tapped -> denied
  const resTapped = BoT.applyAction(st, { type: 'activateAbility', k: sonaK, by: 'A' });
  assert(resTapped && resTapped.deny, 'Cannot activate while tapped');
}

// 3. Test BT09-030 Lapine Polygon
{
  console.log('\n--- Test 3: BT09-030 ลาพิเน่ โพลีกอน ---');
  const st = emptyState();
  const lapineK = 'lapine';
  st.inst[lapineK] = { id: lapineK, code: 'BT09-030', name: 'ลาพิเน่ โพลีกอน', type: 'Avatar', cost: 4, power: 1 };
  st.zones['A.hell'].push(lapineK);

  // Activate before ally discard -> denied
  const resDeny = BoT.applyAction(st, { type: 'activateAbility', k: lapineK, by: 'A' });
  assert(resDeny && resDeny.deny, 'Cannot activate from Hell if no ally discard this turn');

  // Simulate ally discard
  st.allyEffectDiscardedThisTurn = { A: true };

  // Setup deck to mill: 1 polygon + 2 others + 1 to draw
  const m1 = 'm1', m2 = 'm2', m3 = 'm3', mDraw = 'mDraw';
  st.inst[m1] = { id: m1, code: 'BT09-031', name: 'ลูเซเน่ โพลีกอน', type: 'Avatar' };
  st.inst[m2] = { id: m2, code: 'BT01-001', name: 'ใบอื่น 1', type: 'Avatar' };
  st.inst[m3] = { id: m3, code: 'BT01-002', name: 'ใบอื่น 2', type: 'Avatar' };
  st.inst[mDraw] = { id: mDraw, code: 'BT01-003', name: 'ใบจั่ว', type: 'Avatar' };
  st.zones['A.deck'] = [mDraw, m3, m2, m1];

  const resAct = BoT.applyAction(st, { type: 'activateAbility', k: lapineK, by: 'A' });
  assert(!resAct || !resAct.deny, 'Lapine activated from Hell');

  assert(st.zones['A.dark'].includes(lapineK), 'Lapine exiled to dark dimension');
  assert(st.zones['A.hand'].includes(mDraw), 'Drew 1 card');

  // Check prompt to pick milled polygon
  const p = st.prompts[0];
  assert(p && p.dest === 'handOrSummonIfLucene', 'Prompt to pick milled polygon');
  assert(p.ids.includes(m1), 'Milled Lucene Polygon is candidate');

  // Choose Lucene
  BoT.applyAction(st, { type: 'chooseTarget', k: m1, by: 'A' });

  // Lucene offers choice: hand or summon
  const pSummon = st.prompts[0];
  assert(pSummon && pSummon.kind === 'handOrSummon', 'Lucene offered hand or summon');
  // Choose summon
  BoT.applyAction(st, { type: 'handOrSummonPick', where: 'avatar', by: 'A' });
  assert(st.zones['A.avatar'].includes(m1), 'Lucene successfully summoned to Avatar Zone');
}

// 4. Test BT09-031 Lucene Polygon
{
  console.log('\n--- Test 4: BT09-031 ลูเซเน่ โพลีกอน ---');
  const st = emptyState();
  const luceneK = 'lucene';
  st.inst[luceneK] = { id: luceneK, code: 'BT09-031', name: 'ลูเซเน่ โพลีกอน', type: 'Avatar', cost: 5, power: 1, faceUp: true };
  st.zones['A.avatar'].push(luceneK);

  assert(BoT.effPower(st, luceneK) === 1, 'Base power is 1');

  // Add polygon ally -> +2
  const polyAlly = 'polyAlly';
  st.inst[polyAlly] = { id: polyAlly, code: 'BT09-006', name: 'ลูเซีย โพลีกอน', type: 'Avatar', power: 2, faceUp: true };
  st.zones['A.avatar'].push(polyAlly);
  assert(BoT.effPower(st, luceneK) === 3, 'Power with Polygon ally is 1 + 2 = 3');

  // Test activated ability: discard 1 from hand -> exile magic in hell and cast
  const handCard = 'h1';
  st.inst[handCard] = { id: handCard, code: 'BT01-001', name: 'มือทิ้ง', type: 'Avatar' };
  st.zones['A.hand'].push(handCard);

  const magicInHell = 'mHell';
  // Magic: draw 1
  st.inst[magicInHell] = { id: magicInHell, code: 'BT05-066', name: 'เวททดสอบ', type: 'Magic', subtype: 'Normal' };
  st.zones['A.hell'].push(magicInHell);

  const deckCard = 'dCard';
  st.inst[deckCard] = { id: deckCard, code: 'BT01-002', name: 'การ์ดในเด็ค', type: 'Avatar' };
  st.zones['A.deck'].push(deckCard);

  const resAct = BoT.applyAction(st, { type: 'activateAbility', k: luceneK, by: 'A' });
  assert(!resAct || !resAct.deny, 'Lucene ability allowed');

  // Discard prompt
  assert(st.prompts[0] && st.prompts[0].kind === 'chooseDiscard', 'Prompt to discard hand');
  BoT.applyAction(st, { type: 'chooseTarget', k: handCard, by: 'A' });

  // Hell pick prompt
  assert(st.prompts[0] && st.prompts[0].dest === 'exileMagicFromHellAndCast', 'Prompt to exile magic and cast');
  BoT.applyAction(st, { type: 'chooseTarget', k: magicInHell, by: 'A' });

  assert(st.zones['A.dark'].includes(magicInHell), 'Magic exiled to dark dimension');
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
