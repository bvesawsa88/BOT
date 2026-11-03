/* CC02-002 บัมเบิ้ลแบงค์ — เทิร์นละครั้ง สั่งใช้จากในนรก (ถ้าไม่มีชื่อนี้บน AZ) ทิ้งมือ 1 : อัญเชิญตัวเองจากนรก */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
E.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

const st = E.buildInitialState(cards, () => 0.5, {
  A: { main: { 'CC02-002': 2, 'SD01-006': 30 }, life: { 'SD01-021': 5 } },
  B: { main: { 'SD01-006': 30 }, life: { 'SD01-021': 5 } }
}, { strict: true });
st.mulliganDone = { A: true, B: true }; st.active = 'A'; st.phase = 'Main'; st.turn = 3;
const ids = Object.keys(st.inst).filter(k => st.inst[k].code === 'CC02-002');
const put = (k, z) => { for (const q in st.zones) st.zones[q] = st.zones[q].filter(x => x !== k); st.zones[z].push(k); st.inst[k].faceUp = true; st.inst[k].tapped = false; };
const act = a => E.applyAction(st, Object.assign({ by: 'A' }, a)) || {};
const [b1, b2] = ids;
put(b1, 'A.hell'); put(b2, 'A.avatar');
for (let i = 0; i < 3; i++) put(st.zones['A.deck'][0], 'A.hand');

// 1) มีชื่อนี้บน AZ → ใช้ไม่ได้
let r = act({ type: 'activateAbility', k: b1 });
assert(r.deny, 'ต้องห้ามเมื่อมีบัมเบิ้ลแบงค์บน AZ'); console.log('PASS 1', r.deny);

// 2) ไม่มีชื่อนี้ → ทิ้งมือ 1 แล้วลงสนาม
put(b2, 'A.hell');
const hand0 = st.zones['A.hand'].length;
r = act({ type: 'activateAbility', k: b1 });
assert(!r.deny, r.deny);
const pr = st.prompts[st.prompts.length - 1];
if (pr) { r = act({ type: 'chooseTarget', k: st.zones['A.hand'][0], seed: 1 }); assert(!r.deny, r.deny); }
assert(st.zones['A.avatar'].includes(b1), 'ต้องลง Avatar Zone');
assert.strictEqual(st.zones['A.hand'].length, hand0 - 1, 'ต้องทิ้งมือ 1');
console.log('PASS 2 อัญเชิญจากนรกสำเร็จ');

// 3) เทิร์นละครั้ง (และตอนนี้มีชื่อนี้บน AZ แล้ว)
r = act({ type: 'activateAbility', k: b2 });
assert(r.deny, 'ใช้ซ้ำไม่ได้'); console.log('PASS 3', r.deny);
// 4) เทิร์นละครั้ง (ต่อใบ) — ใบเดิมกลับนรกแล้วใช้ซ้ำไม่ได้
put(b1, 'A.hell');
r = act({ type: 'activateAbility', k: b1 });
assert(r.deny, 'เทิร์นละครั้ง'); console.log('PASS 4', r.deny);
console.log('ALL PASS');
