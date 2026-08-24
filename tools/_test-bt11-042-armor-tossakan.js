/* Test: อาเมอร์ ทศกัณฐ์ (BT11-042)
   - ไม่มียักษ์อื่น / มณโฑ → POWER -2
   - มียักษ์อื่น หรือ มณโฑ → POWER +2
   - สอดแนม: เลือกได้เฉพาะ ยักษ์ P3 หรือชื่อมี ทศกัณฐ์
*/
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

const armor = 'armor';
const giant = 'giant';
const montho = 'montho';
const nonGiant = 'nongiant';
const tossakan = 'toss';

function placeArmor(st) {
  st.inst[armor] = {
    id: armor, code: 'BT11-042', name: 'อาเมอร์ ทศกัณฐ์', type: 'Avatar',
    symbol: 'ยักษ์', color: 'เขียว', power: 3, cost: 4, gem: 1, faceUp: true, tapped: false
  };
  st.zones['A.avatar'].push(armor);
}

console.log('--- POWER: alone → -2 ---');
{
  const st = emptyState();
  placeArmor(st);
  assert(BoT.effPower(st, armor) === 1, 'alone POWER = 3-2 = 1');
}

console.log('--- POWER: other ยักษ์ → +2 ---');
{
  const st = emptyState();
  placeArmor(st);
  st.inst[giant] = {
    id: giant, code: 'BT01-010', name: 'ยักษ์ล้างส้วม', type: 'Avatar',
    symbol: 'ยักษ์', power: 3, faceUp: true, tapped: false
  };
  st.zones['A.avatar'].push(giant);
  assert(BoT.effPower(st, armor) === 5, 'with other ยักษ์ POWER = 3+2 = 5');
}

console.log('--- POWER: มณโฑ → +2 ---');
{
  const st = emptyState();
  placeArmor(st);
  st.inst[montho] = {
    id: montho, code: 'BT07-001', name: 'มณโฑ ราชินีเหล่ายักษ์', type: 'Avatar',
    symbol: 'ยักษ์', power: 5, faceUp: true, tapped: false
  };
  st.zones['A.avatar'].push(montho);
  assert(BoT.effPower(st, armor) === 5, 'with มณโฑ POWER = 3+2 = 5');
}

console.log('--- Scout filter ---');
{
  const st = emptyState();
  placeArmor(st);
  // deck top = end of array
  const ids = [];
  [
    [nonGiant, 'BT01-001', 'คนธรรมดา', 'คน', 3],
    [giant, 'BT01-010', 'ยักษ์ล้างส้วม', 'ยักษ์', 3],
    [tossakan, 'FPRO-006', 'พญายักษ์ ทศกัณฐ์', 'ยักษ์', 7],
    ['p5', 'BT01-002', 'ยักษ์พลัง5', 'ยักษ์', 5],
    ['mage', 'BT01-099', 'เวทอะไรสักอย่าง', '', 0]
  ].forEach(([id, code, name, symbol, power]) => {
    st.inst[id] = {
      id, code, name, type: id === 'mage' ? 'Magic' : 'Avatar',
      symbol, power, faceUp: true
    };
    if (id === 'mage') st.inst[id].type = 'Magic';
    st.zones['A.deck'].push(id);
    ids.push(id);
  });

  const fx = {};
  BoT.applyAction(st, { type: 'pass', by: 'A', seed: 1 }); // no-op safety; use run via summon path
  // trigger juti via runActions through summon paidCost
  const e = BoT.effectOf('BT11-042', 'อาเมอร์ ทศกัณฐ์');
  assert(e && e.abilities && e.abilities.length >= 2, 'effect loaded');

  // Simulate scout action from armor
  const scoutAb = e.abilities.find(a => a.keyword === 'จุติ');
  const engine = BoT;
  // Use applyAction summon isn't set up — call through chooseTarget after manually pushing prompt
  // Directly exercise promptCandidates with the scout filter
  const filter = scoutAb.actions[0].filter;
  const p = {
    kind: 'pick', from: 'ids', ids: st.zones['A.deck'].slice(), chooser: 'A',
    filter, dest: 'avatar', src: armor
  };
  const cands = BoT.promptCandidates(st, p);
  assert(cands.includes(giant), 'ยักษ์ P3 selectable');
  assert(cands.includes(tossakan), 'ทศกัณฐ์ selectable');
  assert(!cands.includes(nonGiant), 'non-ยักษ์ P3 not selectable');
  assert(!cands.includes('p5'), 'ยักษ์ P5 not selectable');
  assert(!cands.includes('mage'), 'Magic not selectable');
}

console.log('🎉 All tests passed for BT11-042 อาเมอร์ ทศกัณฐ์!');
