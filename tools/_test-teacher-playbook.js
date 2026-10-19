const BoT = require('../js/engine.js');
global.BoTEngine = BoT;
const U = require('../js/bot-universal.js');
const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));
const starters = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/starters.json'), 'utf8'));

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('ok', msg);
}

// 1. Export check
ok(typeof U.recordTeacherGame === 'function', 'recordTeacherGame exported');
ok(typeof U.getPlaybookForDeck === 'function', 'getPlaybookForDeck exported');
ok(typeof U.detectGuaranteedLethal === 'function', 'detectGuaranteedLethal exported');
ok(typeof U.isSuicideAttack === 'function', 'isSuicideAttack exported');

// 2. Playbook recording test
const dummySession = {
  deckFp: 'TEST_FP_123',
  deckName: 'Teacher Aggro',
  mulligan: {
    kept: ['สมชาย', 'ห้องเช่าถูกๆ'],
    dropped: ['การ์ดคอสต์สูง']
  },
  actions: [
    { turn: 1, type: 'summon', name: 'สมชาย', payNames: ['ขยะ'], handRemainingNames: ['ไม้ตาย'] }
  ]
};

const res = U.recordTeacherGame(dummySession, true);
ok(res && res.games === 1 && res.wins === 1, 'session recorded');
ok(res.openings['สมชาย'] >= 3, 'teacher opening weighted');
ok(res.gemAvoid['ไม้ตาย'] >= 1, 'teacher gem preservation recorded');
ok(res.gemUsed['ขยะ'] >= 1, 'teacher gem sacrifice recorded');

const pb = U.getPlaybookForDeck('TEST_FP_123');
ok(pb && pb.deckName === 'Teacher Aggro', 'getPlaybookForDeck retrieved data');

// 3. Test suicide attack check
const st = BoT.buildInitialState(cards, Math.random, { A: starters.SD01, B: starters.SD02 });
const aHand = st.zones['A.hand'] || [];
// Place a 1-power avatar and a 5-power enemy avatar
const atkK = aHand[0];
const defK = (st.zones['B.deck'] || [])[0];
if (atkK && defK) {
  st.inst[atkK] = { type: 'Avatar', power: 1, name: 'Small Attacker' };
  st.inst[defK] = { type: 'Avatar', power: 5, name: 'Big Defender' };
  ok(U.isSuicideAttack(st, 'A', atkK, defK) === true, 'suicide attack detected correctly');
  st.inst[atkK].power = 6;
  ok(U.isSuicideAttack(st, 'A', atkK, defK) === false, 'winning attack not suicide');
}

// 4. Test Guaranteed Lethal check
// Empty enemy avatars, enemy has 1 life, friendly has 1 ready avatar
st.zones['B.avatar'] = [];
st.zones['A.avatar'] = [atkK];
st.zones['B.life'] = [defK];
st.inst[atkK] = { type: 'Avatar', power: 4, tapped: false, faceUp: true };
const lethal = U.detectGuaranteedLethal(st, 'A');
ok(lethal && lethal.isLethal === true, 'guaranteed lethal detected on direct life hit');

console.log('ALL TEACHER PLAYBOOK & ZERO BLUNDER TESTS PASSED!');
