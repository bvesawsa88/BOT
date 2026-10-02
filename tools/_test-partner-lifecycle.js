const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));
try {
  const sd09 = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-sd09.json'), 'utf8'));
  BoT.loadEffects(sd09);
} catch (e) {}

function emptyState(extra) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return Object.assign({
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 1, turnSeq: 1,
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

console.log('=== TEST 1: สถานะคู่หูตรงตามชื่อ (Name Matching & Not Auto-linked) ===');
{
  const st = emptyState();
  const hanuman = put(st, 'A.avatar', 'SD09-001'); // [Link นิลพัท]
  const nilphat = put(st, 'A.avatar', 'SD09-002'); // [Link หนุมาน]
  const randomGuy = put(st, 'A.avatar', 'SD01-003');

  // Both are on the field but NOT yet paired: must not be in Link status automatically!
  assert.strictEqual(BoT.inLinkStatus(st, hanuman), false, 'Hanuman should NOT be in link status before pairing');
  assert.strictEqual(BoT.inLinkStatus(st, nilphat), false, 'Nilphat should NOT be in link status before pairing');

  // Attempt pairing with unrelated card
  const fxMismatch = BoT.applyAction(st, { type: 'pair', k: hanuman, to: randomGuy, by: 'A' });
  assert.ok(fxMismatch.deny, 'Pairing with non-matching name should be denied');
  assert.ok(fxMismatch.deny.includes('ต้องเป็นคู่ที่ระบุบนการ์ด'), 'Deny reason mentions partner name');

  // Pair Hanuman and Nilphat
  const fxPair = BoT.applyAction(st, { type: 'pair', k: hanuman, to: nilphat, by: 'A' });
  assert.strictEqual(fxPair.deny, undefined, 'Pairing matching partner should succeed');
  assert.strictEqual(st.inst[hanuman].pairWith, nilphat);
  assert.strictEqual(st.inst[nilphat].pairWith, hanuman);
  assert.strictEqual(BoT.inLinkStatus(st, hanuman), true, 'Hanuman is now in link status');
  assert.strictEqual(BoT.inLinkStatus(st, nilphat), true, 'Nilphat is now in link status');

  console.log('✔ PASS: Name matching and active pairing requirement verified');
}

console.log('=== TEST 2: สามารถคู่หูได้เทิร์นละครั้ง (Once Per Turn) ===');
{
  const st = emptyState({ turn: 1, turnSeq: 1 });
  const hanuman = put(st, 'A.avatar', 'SD09-001');
  const nilphat = put(st, 'A.avatar', 'SD09-002');
  const loki = put(st, 'A.avatar', 'BT09-025'); // [Link ธอร์]
  const thor = put(st, 'A.avatar', 'BT09-024'); // [Link โลกิ]

  // First pair in turn 1 succeeds
  const fx1 = BoT.applyAction(st, { type: 'pair', k: hanuman, to: nilphat, by: 'A' });
  assert.strictEqual(fx1.deny, undefined, 'First pair succeeds');

  // Second pair in turn 1 must be denied (once per turn)
  const fx2 = BoT.applyAction(st, { type: 'pair', k: loki, to: thor, by: 'A' });
  assert.ok(fx2.deny, 'Second pair in same turn must be denied');
  assert.ok(fx2.deny.includes('เทิร์นละครั้ง'), 'Deny mentions once per turn');

  // Advance turn to player A next turn
  // End A's turn -> B's turn
  BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  assert.strictEqual(st.turnSeq, 2);
  // End B's turn -> A's turn 2
  BoT.applyAction(st, { type: 'endTurn', by: 'B' });
  assert.strictEqual(st.turnSeq, 3);
  assert.strictEqual(st.active, 'A');

  // In new turn, player A can pair Loki and Thor
  const fx3 = BoT.applyAction(st, { type: 'pair', k: loki, to: thor, by: 'A' });
  assert.strictEqual(fx3.deny, undefined, 'Pair in next turn succeeds');
  assert.strictEqual(st.inst[loki].pairWith, thor);
  assert.strictEqual(st.inst[thor].pairWith, loki);

  console.log('✔ PASS: Once per turn restriction verified');
}

console.log('=== TEST 3: ทุกใบคู่หูได้ครั้งเดียวจนกว่าจะตาย (Once Per Life Until Death) ===');
{
  const st = emptyState({ turn: 1, turnSeq: 1 });
  const hanuman = put(st, 'A.avatar', 'SD09-001');
  const nilphat1 = put(st, 'A.avatar', 'SD09-002');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');

  // Turn 1: Pair Hanuman and Nilphat 1
  BoT.applyAction(st, { type: 'pair', k: hanuman, to: nilphat1, by: 'A' });
  assert.strictEqual(st.inst[hanuman].pairWith, nilphat1);

  // Nilphat 1 dies (goes to hell)
  BoT.doMove(st, nilphat1, 'A.hell');
  assert.strictEqual(st.inst[hanuman].pairWith, undefined, 'Hanuman partner cleared when Nilphat dies');
  assert.strictEqual(BoT.inLinkStatus(st, hanuman), false, 'Hanuman no longer in link status');

  // Next turn for player A
  BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  BoT.applyAction(st, { type: 'endTurn', by: 'B' });

  // Player A puts a fresh Nilphat 2 onto the avatar zone
  const nilphat2 = put(st, 'A.avatar', 'SD09-002');

  // Attempt to pair surviving Hanuman with Nilphat 2
  // Denied because Hanuman already paired in this life and never died!
  const fxPairAgain = BoT.applyAction(st, { type: 'pair', k: hanuman, to: nilphat2, by: 'A' });
  assert.ok(fxPairAgain.deny, 'Surviving Hanuman cannot pair again');
  assert.ok(fxPairAgain.deny.includes('จนกว่าจะตาย'), 'Deny reason states card can only pair once until it dies');

  console.log('✔ PASS: Once per life until death verified for surviving partner');
}

console.log('=== TEST 4: แล้วคู่หูใหม่ในเทิร์นหน้า (Can Only Re-pair in Next Turn After Death) ===');
{
  const st = emptyState({ turn: 1, turnSeq: 1 });
  const hanuman1 = put(st, 'A.avatar', 'SD09-001');
  const nilphat = put(st, 'A.avatar', 'SD09-002');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');

  // Turn 1: Pair
  BoT.applyAction(st, { type: 'pair', k: hanuman1, to: nilphat, by: 'A' });

  // Nilphat dies on turn 1
  BoT.doMove(st, nilphat, 'A.hell');

  // Nilphat is revived to A.avatar in the SAME turn 1
  BoT.doMove(st, nilphat, 'A.avatar');
  const freshHanuman2 = put(st, 'A.avatar', 'SD09-001'); // Never paired before

  // Reset pair count for testing the same-turn death block directly
  delete st._lastPairTurnSeq;

  // Nilphat died in this turn: cannot pair in the same turn it died!
  const fxSameTurn = BoT.applyAction(st, { type: 'pair', k: nilphat, to: freshHanuman2, by: 'A' });
  assert.ok(fxSameTurn.deny, 'Nilphat cannot pair in the same turn it died');
  assert.ok(fxSameTurn.deny.includes('เทิร์นหน้า'), 'Deny mentions can only pair in next turn');

  // Advance turn to next turn
  BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  BoT.applyAction(st, { type: 'endTurn', by: 'B' });

  // In next turn: Nilphat has died and it is now next turn -> pairing with fresh Hanuman succeeds!
  const fxNextTurn = BoT.applyAction(st, { type: 'pair', k: nilphat, to: freshHanuman2, by: 'A' });
  assert.strictEqual(fxNextTurn.deny, undefined, 'Nilphat pairs successfully in next turn');
  assert.strictEqual(st.inst[nilphat].pairWith, freshHanuman2);
  assert.strictEqual(st.inst[freshHanuman2].pairWith, nilphat);
  assert.strictEqual(BoT.inLinkStatus(st, nilphat), true);

  console.log('✔ PASS: Re-pairing next turn after death verified');
}

console.log('=== TEST 5: Frontend Helper canPairCard & pairDenyReason ===');
{
  const st = emptyState({ turn: 1, turnSeq: 1 });
  const hanuman = put(st, 'A.avatar', 'SD09-001');
  const nilphat = put(st, 'A.avatar', 'SD09-002');

  assert.strictEqual(BoT.canPairCard(st, hanuman, 'A'), null, 'Hanuman can pair');
  assert.strictEqual(BoT.pairDenyReason(st, hanuman, nilphat, 'A'), null, 'No deny reason between partners');

  BoT.applyAction(st, { type: 'pair', k: hanuman, to: nilphat, by: 'A' });
  assert.ok(BoT.canPairCard(st, hanuman, 'A') != null, 'Cannot pair card that is already paired in life');

  console.log('✔ PASS: Helper functions work as expected');
}

console.log('\n🎉 ALL PARTNER LIFECYCLE TESTS PASSED PERFECTLY!');
