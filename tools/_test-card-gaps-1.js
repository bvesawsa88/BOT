/* Test: เงื่อนไขความสามารถ และ trigger/คำสั่งของการ์ดที่เคยไม่ทำงาน (ชุด 1) */
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

function deck(st, side, n) {
  for (let i = 0; i < n; i++) put(st, side + 'deck' + st.zones[side + '.deck'].length, side + '.deck', { faceUp: false });
}
function base(phase = 'Main') {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  const st = {
    inst: {}, zones, log: [],
    phase, active: 'A', turn: 4, turnSeq: 4,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
  };
  deck(st, 'A', 4);
  deck(st, 'B', 4);
  return st;
}
function put(st, id, zone, card) {
  st.inst[id] = Object.assign({ code: 'BT01-001', name: id, type: 'Avatar', power: 3, faceUp: true, cardOwner: zone[0] }, card);
  st.zones[zone].push(id);
}
const magic = (code, name, subtype = 'Normal') => ({ code, name, type: 'Magic', subtype, cost: 0 });
const play = (st, k) => BoT.applyAction(st, { type: 'playMagic', k, by: 'A' });
const pick = (st, k) => BoT.applyAction(st, { type: 'chooseTarget', k, by: 'A' });
const clearReact = st => {
  while (st.prompts[0] && st.prompts[0].kind === 'react') BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser });
};

// เงื่อนไขของเวท
{
  const spell = magic('BT07-051', 'คาถา ปลดอาวุสสิวะ');
  let st = base();
  put(st, 'm', 'A.hand', spell);
  put(st, 'foe', 'B.avatar', { power: 3 });
  assert(play(st, 'm').deny, 'คาถา ไม่มีจอมเวท → ใช้ไม่ได้');

  st = base();
  put(st, 'w', 'A.avatar', { name: 'จอมเวทย์ กาลู' });
  put(st, 'm', 'A.hand', spell);
  put(st, 'foe', 'B.avatar', { power: 3 });
  assert(!play(st, 'm').deny, 'คาถา มีจอมเวท → ใช้ได้');
  clearReact(st);
  assert(!pick(st, 'foe').deny, 'เลือก Avatar ศัตรู');
  clearReact(st);
  assert(st.zones['B.hell'].includes('foe'), 'POWER เหลือ 0 → ถูกทำลาย');

  st = base();
  put(st, 'm', 'A.hand', magic('BT07-053', 'ชะตาไม่มีวันจบลง'));
  put(st, 'g', 'A.hell', { name: 'ตั๊กแตนหยิน' });
  assert(play(st, 'm').deny, 'ชะตาไม่มีวันจบลง ไม่สาหัส → ใช้ไม่ได้');
}

// ใบแรกของ Main Phase
{
  const st = base();
  put(st, 'av', 'A.hand', { cost: 1, gem: 1 });
  put(st, 'pay', 'A.hand', { gem: 1 });
  put(st, 'm', 'A.hand', magic('BT10-057', '1 - 2 - 2'));
  BoT.applyAction(st, { type: 'summon', k: 'av', to: 'A.avatar', by: 'A', payIds: ['pay'] });
  assert(play(st, 'm').deny, '1-2-2 ไม่ใช่ใบแรกของ Main Phase → ใช้ไม่ได้');
}

// เมื่อทำลายด้วยการต่อสู้
{
  const fight = setup => {
    const st = base('Battle');
    put(st, 'atk', 'A.avatar', { power: 5 });
    put(st, 'foe', 'B.avatar', { power: 2 });
    put(st, 'bl', 'B.life', { faceUp: false });
    setup(st);
    BoT.applyAction(st, { type: 'declareAttack', atk: 'atk', def: 'foe', by: 'A' });
    for (let i = 0; i < 12 && st.pending; i++) {
      if (st.prompts[0]) BoT.applyAction(st, { type: st.prompts[0].kind === 'react' ? 'reactNo' : 'skipPrompt', by: st.prompts[0].chooser });
      else BoT.applyAction(st, { type: 'resolveAttack', by: 'A' });
    }
    clearReact(st);
    return st;
  };
  const st = fight(s => put(s, 'gun', 'A.magic', Object.assign(magic('BT02-057', 'ช็อตกัน นัยนาวุธ', 'Modification'), { attachedTo: 'atk' })));
  assert(st.zones['B.hell'].includes('foe'), 'ศัตรูถูกทำลายจากการต่อสู้');
  assert(st.inst.bl.faceUp, 'ช็อตกัน นัยนาวุธ: หงาย LIFE ใบบนสุดของอีกฝ่าย');

  const s2 = fight(s => { s.inst.atk.code = 'BT06-025'; s.inst.atk.name = 'เลอติ๊ก เด็กไม่ชอบแดรคคูลา'; });
  assert(s2.zones['B.deck'].includes('foe') && !s2.zones['B.hell'].includes('foe'), 'เลอติ๊ก: ศัตรูกลับเข้า Deck แทนลงนรก');
}

// เมื่อใช้เวท
{
  const st = base();
  put(st, 'school', 'A.construct', { code: 'BT09-073', name: 'สำนักภฤคุ', type: 'Construct' });
  put(st, 'm', 'A.hand', Object.assign(magic('BT02-041', 'ไม่ใช่ฤษี')));
  const before = st.zones['A.hand'].length;
  play(st, 'm');
  clearReact(st);
  assert(st.zones['A.hand'].length === before - 1, 'เวทไม่ใช่ Symbol ฤษี → สำนักภฤคุไม่จั่ว');

  const s2 = base();
  put(s2, 'school', 'A.construct', { code: 'BT09-073', name: 'สำนักภฤคุ', type: 'Construct' });
  put(s2, 'm', 'A.hand', Object.assign(magic('BT01-050', 'เวทฤษี'), { symbol: 'ฤษี' }));
  play(s2, 'm');
  clearReact(s2);
  assert(s2.zones['A.hand'].length === 1, 'เวท Symbol ฤษี → สำนักภฤคุจั่ว 1 ใบ');
}

// คำสั่งทั่วไป
{
  let st = base();
  put(st, 'a1', 'A.avatar', {});
  put(st, 'b1', 'B.avatar', {});
  put(st, 'm', 'A.hand', magic('BT11-058', 'ระเบิดความเกลียดชัง'));
  assert(play(st, 'm').deny, 'ระเบิดความเกลียดชัง Avatar ไม่ครบ 10 → ใช้ไม่ได้');

  st = base();
  ['x1', 'x2', 'x3', 'x4'].forEach(id => put(st, id, 'B.magic', magic('BT01-050', id)));
  put(st, 'm', 'A.hand', magic('BT09-051', 'ไม้กวาดปีกปักษา'));
  play(st, 'm');
  clearReact(st);
  assert(['x1', 'x2', 'x3', 'x4'].every(id => st.zones['B.hell'].includes(id)), 'ไม้กวาด: ทำลาย Magic หงายทุกใบ');
  assert(st.zones['A.hand'].length === 2, 'ไม้กวาด: จั่วทุก 2 ใบที่ทำลาย');

  st = base();
  put(st, 'w', 'A.avatar', { name: 'จอมเวทย์' });
  put(st, 'f1', 'B.avatar', { power: 1 });
  put(st, 'f2', 'B.avatar', { power: 3 });
  put(st, 'f3', 'B.avatar', { power: 5 });
  put(st, 'm', 'A.hand', magic('BT09-055', 'คาถา เสกควายเข้าท้อง'));
  play(st, 'm');
  clearReact(st);
  assert(!BoT.promptCandidates(st, st.prompts[0]).includes('f3'), 'เสกควาย: POWER เกินงบเลือกไม่ได้');
  pick(st, 'f2');
  clearReact(st);
  pick(st, 'f1');
  clearReact(st);
  assert(st.zones['B.hell'].includes('f1') && st.zones['B.hell'].includes('f2'), 'เสกควาย: ทำลายหลายใบในงบ POWER 4');
}

console.log('card gaps 1: all passed');
