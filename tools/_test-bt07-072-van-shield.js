/* Test: ยานรายการ เถียงทันหน่วง (BT07-072) — สั่งใช้ให้โล่มนุษย์ฝ่ายตรงข้ามได้ */
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
    oncePerTurn: {}
  };
}

const van = 'van';
const nuang = 'nuang';
const foe = 'foe';
const ally = 'ally';

const st = emptyState();
st.inst[van] = {
  id: van, code: 'BT07-072', name: 'ยานรายการ เถียงทันหน่วง', type: 'Construct',
  symbol: 'หุ่นยนต์', color: 'ม่วง', power: 2, cost: 3, gem: 4, faceUp: true
};
st.zones['A.construct'].push(van);
st.inst[nuang] = {
  id: nuang, code: 'BT07-023', name: 'พี่หน่วง พิธีกรผมสวย', type: 'Avatar',
  symbol: 'คน', power: 4, faceUp: true
};
st.zones['A.avatar'].push(nuang);
st.inst[ally] = {
  id: ally, code: 'BT01-001', name: 'พันธมิตร', type: 'Avatar', power: 2, faceUp: true
};
st.zones['A.avatar'].push(ally);
st.inst[foe] = {
  id: foe, code: 'BT01-002', name: 'ศัตรู', type: 'Avatar', power: 5, faceUp: true
};
st.zones['B.avatar'].push(foe);

console.log('--- Activate van: can pick enemy ---');
BoT.applyAction(st, { type: 'activateAbility', k: van, by: 'A', seed: 1 });
assert(st.prompts.length === 1 && st.prompts[0].dest === 'grantKeyword', 'grantKeyword prompt');
assert(st.prompts[0].from === 'allAvatars', 'from = allAvatars (own + enemy)');
const cands = BoT.promptCandidates(st, st.prompts[0]);
assert(cands.includes(foe), 'enemy selectable');
assert(cands.includes(ally), 'ally selectable');
assert(cands.includes(nuang), 'พี่หน่วง selectable');

BoT.applyAction(st, { type: 'chooseTarget', k: foe, by: 'A', seed: 1 });
assert(BoT.hasKw(st, foe, 'โล่มนุษย์'), 'enemy got โล่มนุษย์');
const g = (st.inst[foe].grantedKeywords || [])[0];
assert(g && g.until === 'oppNextEnd' && g.opp === 'B', 'until oppNextEnd (B)');

console.log('--- Survive A end turn ---');
BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 1 });
assert(BoT.hasKw(st, foe, 'โล่มนุษย์'), 'still has โล่มนุษย์ after own end');

console.log('--- Clear on B end turn ---');
BoT.applyAction(st, { type: 'endTurn', by: 'B', seed: 1 });
assert(!BoT.hasKw(st, foe, 'โล่มนุษย์'), 'โล่มนุษย์ cleared after enemy end');

console.log('🎉 All tests passed for BT07-072!');
