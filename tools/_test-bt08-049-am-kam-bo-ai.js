/* Test: แหมกำบ่อ้าย (BT08-049) - เลือกการ์ดในนรกสูงสุด 5 ใบ (ยกเว้นแหมกำบ่อ้าย) นำกลับเข้า Deck แล้วสับ เมื่อ Deck เหลือ <= 15 ใบ */
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

// Put BT08-049 in A.hand
const cardMagic = 'm1';
st.inst[cardMagic] = { code: 'BT08-049', name: 'แหมกำบ่อ้าย', type: 'Magic', subtype: 'Normal' };
st.zones['A.hand'] = [cardMagic];

// Put 16 cards in A.deck (> 15)
for (let i = 1; i <= 16; i++) {
  const dId = 'd' + i;
  st.inst[dId] = { code: 'BT01-001', name: 'การ์ดทดสอบ ' + i, type: 'Avatar' };
  st.zones['A.deck'].push(dId);
}

// Put 3 cards in A.hell (h1 is BT08-049, h2 and h3 are other cards)
const h1 = 'h1', h2 = 'h2', h3 = 'h3';
st.inst[h1] = { code: 'BT08-049', name: 'แหมกำบ่อ้าย', type: 'Magic', subtype: 'Normal' };
st.inst[h2] = { code: 'BT01-002', name: 'มอนสเตอร์ A', type: 'Avatar' };
st.inst[h3] = { code: 'BT01-003', name: 'มอนสเตอร์ B', type: 'Avatar' };
st.zones['A.hell'] = [h1, h2, h3];

console.log('--- Test 1: Play magic when deck has 16 cards (must be denied) ---');
let fx1 = BoT.applyAction(st, { type: 'playMagic', k: cardMagic, by: 'A', seed: 1 });
assert(!!fx1.deny && fx1.deny.includes('เด็คต้องเหลือ ≤ 15 ใบ'), 'Play magic denied when deck > 15: ' + fx1.deny);

console.log('--- Test 2: Reset magicUsed and reduce deck to 15 cards ---');
st.magicUsed = {};
st.zones['A.deck'].pop(); // Now 15 cards
let fx2 = BoT.applyAction(st, { type: 'playMagic', k: cardMagic, by: 'A', seed: 1 });
assert(!fx2.deny, 'Play magic succeeds when deck <= 15: ' + (fx2.deny || ''));

// Resolve magic effect (pass react)
let fx3 = BoT.applyAction(st, { type: 'reactNo', by: 'B' });
assert(st.prompts.length === 1 && st.prompts[0].dest === 'hellMultiDeck', 'Prompt hellMultiDeck created');

// Check candidates in prompt (must exclude h1 which is BT08-049)
const cands = BoT.promptCandidates(st, st.prompts[0]);
assert(!cands.includes(h1), 'BT08-049 in hell must be excluded from candidates');
assert(cands.includes(h2) && cands.includes(h3), 'h2 and h3 are valid candidates');

// Pick h2 from hell to return to deck
let fx4 = BoT.applyAction(st, { type: 'chooseTarget', k: h2, by: 'A', seed: 1 });
assert(st.zones['A.deck'].includes(h2), 'h2 returned to A.deck');
assert(!st.zones['A.hell'].includes(h2), 'h2 removed from A.hell');

// Skip further picks to finish
let fx5 = BoT.applyAction(st, { type: 'skipPrompt', by: 'A' });
assert(st.prompts.length === 0, 'Prompts cleared after skipPrompt');

console.log('🎉 All tests passed for BT08-049 แหมกำบ่อ้าย!');
