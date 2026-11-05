/* Test: บัวนิด วานรแห่งสวนสัตว์ (BT07-042) — โจมตีได้ต่อเมื่อควบคุม Avatar "วานร" ใบอื่น */
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

const BUANID = { code: 'BT07-042', name: 'บัวนิด วานรแห่งสวนสัตว์', type: 'Avatar', power: 5, faceUp: true };

function setup(allies) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  const st = {
    inst: {}, zones, log: [],
    phase: 'Battle', active: 'A', turn: 4, turnSeq: 4,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
  };
  st.inst.bua = Object.assign({}, BUANID);
  zones['A.avatar'].push('bua');
  allies.forEach((c, i) => {
    const k = 'ally' + i;
    st.inst[k] = Object.assign({ type: 'Avatar', power: 3, faceUp: true }, c);
    zones['A.avatar'].push(k);
  });
  st.inst.foe = { code: 'BT01-001', name: 'ศัตรู', type: 'Avatar', power: 3, faceUp: true };
  zones['B.avatar'].push('foe');
  return st;
}
const attack = st => BoT.applyAction(st, { type: 'declareAttack', atk: 'bua', def: 'foe', by: 'A' });

let fx = attack(setup([]));
assert(fx.deny && fx.deny.includes('วานร'), 'อยู่ใบเดียว → โจมตีไม่ได้');

fx = attack(setup([{ code: 'BT01-002', name: 'ซัวเจ๋ง' }]));
assert(fx.deny && fx.deny.includes('วานร'), 'มีเพื่อนที่ไม่ใช่วานร → โจมตีไม่ได้');

fx = attack(setup([{ code: 'SD09-008', name: 'วานรหมวกเหล็ก' }]));
assert(!fx.deny, 'มีวานรใบอื่น → โจมตีได้');

fx = attack(setup([{ code: 'BT01-002', name: 'ซัวเจ๋ง' }, { code: 'SD09-008', name: 'วานรหมวกเหล็ก' }]));
assert(!fx.deny, 'มีวานรปนกับใบอื่น → โจมตีได้');

fx = attack(setup([Object.assign({}, BUANID)]));
assert(!fx.deny, 'บัวนิดอีกใบนับเป็นวานรใบอื่น → โจมตีได้');

console.log('BT07-042 บัวนิด: all passed');
