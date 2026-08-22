/* Test: ไวรัสสั่งใช้จากมิติมืด (Virus activation from Dark Dimension) */
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

// 1. Setup game state with 5 Virus cards in A.dark and 2 cards in hand
let st = emptyState();
const card1 = 'k1', card2 = 'k2', card3 = 'k3', card4 = 'k4', card5 = 'k5';
st.inst[card1] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar' };
st.inst[card2] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar' };
st.inst[card3] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar' };
st.inst[card4] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar' };
st.inst[card5] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar' };
st.zones['A.dark'] = [card1, card2, card3, card4, card5];

const h1 = 'h1', h2 = 'h2';
st.inst[h1] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar', gem: 1 };
st.inst[h2] = { code: 'BT11-020', name: 'ไวรัสแห่งการแพร่เชื้อ บลาสเตอร์', type: 'Avatar', gem: 1 };
st.zones['A.hand'] = [h1, h2];

// 2. Activate Virus ability from Dark Dimension
let fx1 = BoT.applyAction(st, { type: 'activateAbility', k: card1, by: 'A', seed: 1 });
assert(!fx1.deny, 'activateAbility should not be denied when dark has >= 5 viruses');
assert(st.prompts.length === 1 && st.prompts[0].kind === 'chooseDiscard', 'Prompt chooseDiscard should be pushed');

// 3. Pay discard cost 1
let fx2 = BoT.applyAction(st, { type: 'chooseTarget', k: h1, by: 'A', seed: 1 });
assert(st.prompts[0].discardGot === 1, 'First discard recorded');

// 4. Pay discard cost 2
let fx3 = BoT.applyAction(st, { type: 'chooseTarget', k: h2, by: 'A', seed: 1 });
assert(st.prompts.length === 0, 'Prompt completed');
assert(st.zones['A.avatar'].includes(card1), 'Virus summoned to A.avatar');
assert(st.zones['A.dark'].length === 4, 'Virus removed from A.dark');
assert(st.zones['A.hell'].includes(h1) && st.zones['A.hell'].includes(h2), 'Discarded cards moved to A.hell');

console.log('🎉 All tests passed successfully!');
