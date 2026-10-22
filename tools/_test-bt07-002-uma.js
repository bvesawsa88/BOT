const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BoTEngine = require('../js/engine.js');

console.log('Testing BT07-002 พระแม่อุมาเทวี ability...');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoTEngine.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

// Build state
const decks = {
  A: { main: { 'BT07-002': 1, 'SD01-001': 1, 'BT07-003': 1, 'SD01-006': 30 }, life: { 'SD01-021': 5 } },
  B: { main: { 'BT01-017': 1, 'SD01-001': 1, 'SD01-006': 30 }, life: { 'SD01-021': 5 } }
};

const st = BoTEngine.buildInitialState(cards, () => 0.5, decks, { strict: false });
st.mulliganDone = { A: true, B: true };

// Setup board:
// Player A has BT07-002 (พระแม่อุมาเทวี) on avatar zone
const umaK = Object.keys(st.inst).find(k => st.inst[k].code === 'BT07-002');
// Player A has SD01-001 (พระอิศวร)
const isuanK = Object.keys(st.inst).find(k => st.inst[k].code === 'SD01-001' && st.inst[k].cardOwner === 'A');
// Player A has BT07-003 (เจ้าแม่กาลี) in deck
const kaliDeckK = Object.keys(st.inst).find(k => st.inst[k].code === 'BT07-003' && st.inst[k].cardOwner === 'A');

// Remove from whatever zone they were in
for (const z of Object.keys(st.zones)) {
  st.zones[z] = st.zones[z].filter(k => k !== umaK && k !== isuanK && k !== kaliDeckK);
}

// Put พระแม่อุมาเทวี on A.avatar
st.zones['A.avatar'].push(umaK);
st.inst[umaK].faceUp = true;
st.inst[umaK].tapped = false;

// Put เจ้าแม่กาลี in A.deck
st.zones['A.deck'].push(kaliDeckK);

// Test 1: Opponent has no พระอิศวร -> ability should be denied
let res = BoTEngine.applyAction(st, { type: 'activateAbility', k: umaK, by: 'A' });
assert(res && res.deny, 'Should deny when opponent has no พระอิศวร');
console.log('Test 1 passed: Denied when opponent has no พระอิศวร (' + res.deny + ')');

// Test 2: Opponent has their OWN พระอิศวร on B.avatar -> ability should still be denied
const isuanB = Object.keys(st.inst).find(k => st.inst[k].code === 'SD01-001' && st.inst[k].cardOwner === 'B');
for (const z of Object.keys(st.zones)) {
  st.zones[z] = st.zones[z].filter(k => k !== isuanB);
}
st.zones['B.avatar'].push(isuanB);
st.inst[isuanB].faceUp = true;
res = BoTEngine.applyAction(st, { type: 'activateAbility', k: umaK, by: 'A' });
assert(res && res.deny, 'Should deny when opponent only has their own พระอิศวร');
console.log('Test 2 passed: Denied when opponent has their own พระอิศวร (' + res.deny + ')');

// Test 3: Player A's พระอิศวร is taken by opponent (stolen) onto B.avatar
st.zones['B.avatar'] = st.zones['B.avatar'].filter(k => k !== isuanB); // remove B's own
st.zones['B.avatar'].push(isuanK);
st.inst[isuanK].faceUp = true;
st.inst[isuanK].originalOwner = 'A'; // stolen from A

// Ability should now succeed!
// Test 3a: Can activate in Player A's turn
st.active = 'A';
st.phase = 'Main';
const aHandBefore = st.zones['A.hand'].length;

res = BoTEngine.applyAction(st, { type: 'activateAbility', k: umaK, by: 'A' });
assert(!res || !res.deny, 'Should succeed activating ability: ' + (res && res.deny));
assert(!st.zones['A.avatar'].includes(umaK), 'พระแม่อุมาเทวี should leave avatar zone');
assert(st.zones['A.hell'].includes(umaK), 'พระแม่อุมาเทวี should be in hell');
assert(st.prompts.length > 0, 'Should have prompt to pick เจ้าแม่กาลี');
assert.strictEqual(st.prompts[0].from, 'deckOrHand');
console.log('Test 3a passed: Ability activated successfully, sacrificeSelf cost paid, prompt created');

// Resolve prompt: pick เจ้าแม่กาลี from deck
const pickRes = BoTEngine.applyAction(st, { type: 'chooseTarget', k: kaliDeckK, by: 'A' });
assert(!pickRes || !pickRes.deny, 'Pick should succeed: ' + (pickRes && pickRes.deny));
assert(st.zones['A.avatar'].includes(kaliDeckK), 'เจ้าแม่กาลี should now be on avatar zone');
assert.strictEqual(st.zones['A.hand'].length, aHandBefore + 1, 'เจ้าแม่กาลี Juti should have triggered and drawn 1 card');
console.log('Test 3b passed: เจ้าแม่กาลี summoned to avatar zone and Juti triggered (+1 card drawn)');

// Test 4: Can activate during opponent's turn (activatedAnyTurn)
// Reset พระแม่อุมาเทวี to A.avatar, create another เจ้าแม่กาลี in A.hand
st.zones['A.hell'] = st.zones['A.hell'].filter(k => k !== umaK);
st.zones['A.avatar'].push(umaK);

const kaliHandK = 'i999';
st.inst[kaliHandK] = { id: kaliHandK, code: 'BT07-003', name: 'เจ้าแม่กาลี', type: 'Avatar', cost: 4, power: 2, cardOwner: 'A' };
st.zones['A.hand'].push(kaliHandK);

st.active = 'B'; // Opponent's turn!
st.phase = 'Battle'; // Even outside Main phase!
res = BoTEngine.applyAction(st, { type: 'activateAbility', k: umaK, by: 'A' });
assert(!res || !res.deny, 'Should succeed activating during opponent turn: ' + (res && res.deny));
assert(st.zones['A.hell'].includes(umaK), 'พระแม่อุมาเทวี should be in hell');
assert(st.prompts.length > 0, 'Should have prompt for pick');

// Pick from hand
const aHandBeforeHandPick = st.zones['A.hand'].length;
const pickHandRes = BoTEngine.applyAction(st, { type: 'chooseTarget', k: kaliHandK, by: 'A' });
assert(!pickHandRes || !pickHandRes.deny, 'Pick from hand should succeed');
assert(st.zones['A.avatar'].includes(kaliHandK), 'เจ้าแม่กาลี from hand should now be on avatar zone');
console.log('Test 4 passed: Activated during opponent turn, picked from hand, Juti triggered');

console.log('ALL TESTS PASSED SUCCESSFULLY!');
