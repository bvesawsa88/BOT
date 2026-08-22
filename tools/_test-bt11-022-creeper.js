/* Test: ไวรัสแห่งความเป็นไปได้ ครีปเปอร์ (BT11-022) - เมื่อโจมตี ธรณีสูบฝ่ายละ 3 ใบ ถ้าในการ์ดที่ถูกสูบมี Avatar >= 4 ใบ เลือก Avatar ศัตรู 1 ใบ ลบความสามารถและปรับ POWER เป็น 0 */
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

let st = emptyState();

// Add Creeper (BT11-022) to A.avatar
const creeper = 'c1';
st.inst[creeper] = { code: 'BT11-022', name: 'ไวรัสแห่งความเป็นไปได้ ครีปเปอร์', type: 'Avatar', power: 5 };
st.zones['A.avatar'].push(creeper);

// Add enemy defender to B.avatar
const enemy = 'e1';
st.inst[enemy] = { code: 'BT01-001', name: 'ศัตรู A', type: 'Avatar', power: 7 };
st.zones['B.avatar'].push(enemy);

// Put Magic first, then Avatars so top of deck (popped first) contains 3 Avatars in each deck
for (let i = 4; i <= 10; i++) {
  const da = 'da' + i; st.inst[da] = { code: 'BT01-099', name: 'Magic A' + i, type: 'Magic' };
  st.zones['A.deck'].push(da);
  const db = 'db' + i; st.inst[db] = { code: 'BT01-099', name: 'Magic B' + i, type: 'Magic' };
  st.zones['B.deck'].push(db);
}
for (let i = 1; i <= 3; i++) {
  const da = 'da' + i; st.inst[da] = { code: 'BT01-002', name: 'Avatar A' + i, type: 'Avatar' };
  st.zones['A.deck'].push(da);
  const db = 'db' + i; st.inst[db] = { code: 'BT01-003', name: 'Avatar B' + i, type: 'Avatar' };
  st.zones['B.deck'].push(db);
}

console.log('--- Test: Declare attack with Virus Creeper ---');
st.phase = 'Battle';
BoT.applyAction(st, { type: 'declareAttack', atk: creeper, def: enemy, by: 'A', seed: 1 });

assert(st.prompts.length === 1 && st.prompts[0].dest === 'zeroPowerEnemy', 'zeroPowerEnemy prompt pushed when milled Avatars >= 4');

// Select enemy avatar to zero power and disable abilities
BoT.applyAction(st, { type: 'chooseTarget', k: enemy, by: 'A', seed: 1 });

assert(st.inst[enemy].disabledUntilEOT === true, 'Enemy avatar disabledUntilEOT is set to true');
assert(BoT.effPower(st, enemy) === 0, 'Enemy effective power is now 0');

console.log('🎉 All tests passed for BT11-022 ไวรัสแห่งความเป็นไปได้ ครีปเปอร์!');
