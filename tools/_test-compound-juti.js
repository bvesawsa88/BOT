/* Test: จุติที่มีเงื่อนไขหลายข้อ + ความสามารถของกลุ่มเดียวกัน */
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

function base() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones, log: [],
    phase: 'Main', active: 'A', turn: 4, turnSeq: 4,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
  };
}
function put(st, id, zone, card) {
  st.inst[id] = Object.assign({ code: 'BT01-001', name: id, type: 'Avatar', power: 3, faceUp: true, cardOwner: zone[0] }, card);
  st.zones[zone].push(id);
}
/* อัญเชิญ a (Cost 1): gem 1 = พอดี, gem 3 = จ่ายเกิน */
function summon(code, name, gem, setup) {
  const st = base();
  put(st, 'a', 'A.hand', { code, name, cost: 1, gem: 1 });
  put(st, 'pay', 'A.hand', { gem });
  put(st, 'foe', 'B.avatar', { name: 'ศัตรู', symbol: 'คน', power: 6 });
  if (setup) setup(st);
  const fx = BoT.applyAction(st, { type: 'summon', k: 'a', to: 'A.avatar', by: 'A', payIds: ['pay'] });
  assert(!fx.deny && st.zones['A.avatar'].includes('a'), name + ' อัญเชิญสำเร็จ ' + (fx.deny || ''));
  return st;
}
const pick = (st, k) => BoT.applyAction(st, { type: 'chooseTarget', k, by: 'A' });
const dest = st => st.prompts[0] && st.prompts[0].dest;
const life = (st, n) => { for (let i = 0; i < n; i++) put(st, 'l' + i, 'A.life', {}); };
const EXACT = 1;
const OVER = 3;

// พอดี จุติ
{
  const ghost = st => put(st, 'g', 'A.hell', { name: 'ผีน้อย', symbol: 'ผี', cost: 2 });
  assert(!summon('BT06-026', 'แอชวิคกับอโศกาบาร์พิศวง', OVER, ghost).prompts.length, 'แอชวิค จ่ายเกิน → จุติไม่ทำงาน');
  assert(summon('BT06-026', 'แอชวิคกับอโศกาบาร์พิศวง', EXACT, ghost).prompts.length, 'แอชวิค จ่ายพอดี → จุติทำงาน');

  const guy = st => put(st, 'g', 'A.hell', { name: 'กุ่ย นักเอาตัวรอด' });
  assert(!summon('BT09-014', 'นาย หน้าตาดี', OVER, guy).prompts.length, 'นาย หน้าตาดี จ่ายเกิน → จุติไม่ทำงาน');
  assert(summon('BT09-014', 'นาย หน้าตาดี', EXACT, guy).prompts.length, 'นาย หน้าตาดี จ่ายพอดี → จุติทำงาน');
}

// มิสเตอร์โบโบ้
{
  const NAME = 'มิสเตอร์โบโบ้';
  const top = card => st => put(st, 't', 'A.deck', card);
  const god = { code: 'SD01-002', name: 'พระนารายณ์', symbol: 'เทพ', faceUp: false };
  assert(!summon('BT09-027', NAME, OVER, top(god)).prompts.length, 'โบโบ้ จ่ายเกิน → ไม่สอดแนม');

  let st = summon('BT09-027', NAME, EXACT, top(god));
  assert(st.prompts[0] && st.prompts[0].optional === false, 'บนเด็คเป็นเทพ → ต้องอัญเชิญ ห้ามข้าม');
  assert(!pick(st, 't').deny && st.zones['A.avatar'].includes('t'), 'อัญเชิญเทพลงสนาม');

  st = summon('BT09-027', NAME, EXACT, top({ name: 'ชาวบ้าน', symbol: 'คน', faceUp: false }));
  assert(st.prompts[0] && st.prompts[0].optional === true, 'ไม่ใช่เทพ → ไม่บังคับเลือก');
  assert(!BoT.promptCandidates(st, st.prompts[0]).length, 'ไม่ใช่เทพ → เลือกอัญเชิญไม่ได้');
  BoT.applyAction(st, { type: 'skipPrompt', by: 'A' });
  assert(!st.prompts.length && st.zones['A.hell'].includes('t'), 'ไม่ใช่เทพ → ลงนรก');
}

// วาฬทมิฬ ก้า
{
  const NAME = 'วาฬทมิฬ ก้า';
  const hell = st => put(st, 'g', 'A.hell', { name: 'ตั๊กแตนเล็ก' });
  const grass = st => put(st, 'b', 'A.avatar', { name: 'ตั๊กแตนหยิน' });
  assert(!summon('BT07-038', NAME, OVER, st => { hell(st); grass(st); life(st, 1); }).prompts.length, 'ก้า LIFE หงาย 1 ใบ → จุติไม่ทำงาน');
  assert(!summon('BT07-038', NAME, OVER, st => { hell(st); life(st, 2); }).prompts.length, 'ก้า ไม่มีตั๊กแตน → จุติไม่ทำงาน');
  assert(summon('BT07-038', NAME, OVER, st => { hell(st); grass(st); life(st, 2); }).prompts.length, 'ก้า ครบเงื่อนไข → จุติทำงาน');
}

// จูล่ง
{
  const NAME = 'จูล่ง ขุนพลสุภาพบุรุษแห่งจ๊กก๊ก';
  const hell = st => put(st, 'g', 'A.hell', { name: 'เตียวหุย ขุนพล', color: 'green', symbol: 'ต่างชาติ' });
  assert(!summon('BT08-037', NAME, OVER, st => { hell(st); put(st, 'o', 'A.avatar', {}); }).prompts.length, 'จูล่ง มี Avatar อื่น → จุติไม่ทำงาน');
  assert(summon('BT08-037', NAME, OVER, hell).prompts.length, 'จูล่ง อยู่ลำพัง → จุติทำงาน');
}

// จอมเวทย์ เบล่า
{
  const NAME = 'จอมเวทย์ เบล่า';
  const spell = st => put(st, 'sp', 'A.hell', { code: 'BT10-055', name: 'คาถา เฟรนลี่คัม', type: 'Magic', subtype: 'Normal' });
  assert(!summon('BT07-031', NAME, OVER, spell).prompts.length, 'เบล่า ไม่มีจอมเวทย์อื่น → จุติไม่ทำงาน');
  assert(!summon('BT07-031', NAME, OVER, st => { spell(st); put(st, 'o', 'A.avatar', { code: 'BT07-031', name: NAME }); }).prompts.length, 'เบล่า มีแต่ชื่อเดียวกัน → จุติไม่ทำงาน');

  const st = summon('BT07-031', NAME, OVER, s => {
    spell(s);
    put(s, 'o', 'A.avatar', { name: 'จอมเวทย์ กาลู' });
    put(s, 'w', 'A.deck', { name: 'จอมเวทย์ อะปัด', faceUp: false });
  });
  assert(dest(st) === 'castHellMagic', 'เบล่า มีจอมเวทย์ชื่ออื่น → เลือกคาถาจากนรก');
  assert(!pick(st, 'sp').deny && st.zones['A.hell'].includes('sp'), 'สั่งใช้แล้วคาถายังอยู่ในนรก');
  assert(!pick(st, 'w').deny && st.zones['A.avatar'].includes('w'), 'ผลของคาถาทำงาน (สอดแนมและอัญเชิญจอมเวทย์)');

  put(st, 'b2', 'A.hand', { code: 'BT07-031', name: NAME, cost: 1, gem: 1 });
  put(st, 'pay2', 'A.hand', { gem: 1 });
  BoT.applyAction(st, { type: 'summon', k: 'b2', to: 'A.avatar', by: 'A', payIds: ['pay2'] });
  assert(st.zones['A.avatar'].includes('b2') && !st.prompts.length, 'เบล่าใบที่ 2 ในเทิร์นเดียวกัน → จุติไม่ทำงาน');
}

// พี่ไท่ น้องเฟิง
{
  const NAME = 'พี่ไท่ น้องเฟิง นักดาบวายุ';
  const ready = st => {
    st.turn = 1; st.turnSeq = 1; st.mulliganDone = { A: true, B: true };
    put(st, 'h1', 'A.hand', {});
    put(st, 'h2', 'A.hand', {});
    put(st, 'd1', 'A.deck', { cost: 1, symbol: 'คน', faceUp: false });
    put(st, 'd2', 'A.deck', { cost: 0, symbol: 'คน', faceUp: false });
    put(st, 'd3', 'A.deck', { cost: 1, symbol: 'ผี', faceUp: false });
    put(st, 'd4', 'A.deck', { cost: 1, symbol: 'ปลา', faceUp: false });
    put(st, 'd5', 'A.deck', { cost: 2, symbol: 'แมลง', faceUp: false });
  };
  assert(!summon('BT08-028', NAME, OVER, st => { ready(st); st.turnSeq = 3; }).prompts.length, 'เทิร์นที่ 2 ของเรา → จุติไม่ทำงาน');
  assert(summon('BT08-028', NAME, OVER, st => { ready(st); st.firstPlayer = 'B'; st.turnSeq = 2; }).prompts.length, 'ผู้เล่นคนที่สอง เทิร์นแรกของตัวเอง → จุติทำงาน');

  const st = summon('BT08-028', NAME, OVER, ready);
  assert(st.prompts[0].kind === 'chooseDiscard', 'จุติทำงาน ต้องทิ้งมือ 2 ใบ');
  pick(st, 'h1');
  pick(st, 'h2');
  assert(st.zones['A.hell'].includes('h1') && st.zones['A.hell'].includes('h2'), 'ทิ้งมือ 2 ใบ');
  assert(!BoT.promptCandidates(st, st.prompts[0]).includes('d5'), 'Cost 2 เลือกไม่ได้');
  pick(st, 'd1');
  assert(!BoT.promptCandidates(st, st.prompts[0]).includes('d2'), 'Symbol ซ้ำเลือกไม่ได้');
  pick(st, 'd3');
  pick(st, 'd4');
  assert(['d1', 'd3', 'd4'].every(id => st.zones['A.avatar'].includes(id)) && !st.prompts.length, 'อัญเชิญครบ 3 ใบ Symbol ไม่ซ้ำ');

  st.zones['A.avatar'] = st.zones['A.avatar'].filter(x => x !== 'd1');
  put(st, 'a2', 'A.hand', { code: 'BT08-028', name: NAME, cost: 1, gem: 1 });
  put(st, 'pay2', 'A.hand', { gem: 3 });
  put(st, 'h3', 'A.hand', {});
  put(st, 'h4', 'A.hand', {});
  BoT.applyAction(st, { type: 'summon', k: 'a2', to: 'A.avatar', by: 'A', payIds: ['pay2'] });
  assert(st.zones['A.avatar'].includes('a2') && !st.prompts.length, 'ใบที่ 2 → ใช้ได้ 1 ครั้งต่อเกม');

  const poor = summon('BT08-028', NAME, OVER, s => { ready(s); s.zones['A.hand'] = s.zones['A.hand'].filter(x => x !== 'h2'); });
  assert(!poor.prompts.length && !(poor.oncePerGame || {})['A:BT08-028'], 'มือไม่พอ → ไม่เสียสิทธิ์ 1 ครั้งต่อเกม');
}

// ราชาสิ่งปฏิกูล
{
  const NAME = 'ราชาสิ่งปฏิกูล';
  const hell = n => st => { for (let i = 0; i < n; i++) put(st, 'p' + i, 'A.hell', { name: 'สิ่งปฏิกูลมีชีวิต' }); };
  assert(!summon('BT10-019', NAME, EXACT, hell(4)).prompts.length, 'ราชา สิ่งปฏิกูล 4 ใบ → จุติไม่ทำงาน');
  assert(!summon('BT10-019', NAME, OVER, hell(5)).prompts.length, 'ราชา จ่ายเกิน → จุติไม่ทำงาน');

  const st = summon('BT10-019', NAME, EXACT, hell(5));
  assert(dest(st) === 'transformEnemy', 'ราชา ครบเงื่อนไข → เลือก Avatar ศัตรู');
  assert(!pick(st, 'foe').deny, 'เลือก Avatar ศัตรู');
  const foe = st.inst.foe;
  assert(foe.name === 'สิ่งปฏิกูล' && foe.symbol === 'สัตว์วิเศษ' && BoT.effPower(st, 'foe') === 1, 'ศัตรูเปลี่ยนชื่อ Symbol และ POWER 1');

  assert(!BoT.applyAction(st, { type: 'move', k: 'foe', to: 'B.hell', by: 'B' }).deny && st.zones['B.hell'].includes('foe'), 'ศัตรูออกจากสนาม');
  assert(foe.name === 'ศัตรู' && foe.symbol === 'คน' && foe.power === 6, 'ลงนรกแล้วกลับเป็นการ์ดเดิม');

  // อัญเชิญด้วยคำสั่งเสียของ สิ่งปฏิกูลมีชีวิต ในเทิร์นเรา
  const dying = n => {
    const s2 = base();
    put(s2, 'plunge', 'A.hand', { code: 'BT10-062', name: 'ทะลวงส้วม', type: 'Magic', subtype: 'Normal', cost: 0 });
    for (let i = 0; i < 4; i++) { put(s2, 'c' + i, 'A.deck', { faceUp: false }); s2.zones['A.deck'].unshift(s2.zones['A.deck'].pop()); }
    put(s2, 'liv', 'A.avatar', { code: 'BT10-017', name: 'สิ่งปฏิกูลมีชีวิต', power: 1 });
    put(s2, 'king', 'A.deck', { code: 'BT10-019', name: NAME, faceUp: false });
    put(s2, 'bd', 'B.deck', { faceUp: false });
    put(s2, 'foe', 'B.avatar', { name: 'ศัตรู', symbol: 'คน' });
    hell(n)(s2);
    const fx = BoT.applyAction(s2, { type: 'playMagic', k: 'plunge', by: 'A' });
    assert(!fx.deny, 'ใช้ ทะลวงส้วม ' + (fx.deny || ''));
    pick(s2, 'liv');
    while (s2.prompts[0] && s2.prompts[0].kind === 'react') BoT.applyAction(s2, { type: 'reactNo', by: s2.prompts[0].chooser });
    assert(s2.zones['A.hell'].includes('liv') && s2.prompts[0] && s2.prompts[0].dest === 'avatar', 'คำสั่งเสีย: สอดแนมแล้วอัญเชิญในเทิร์นเรา');
    pick(s2, 'king');
    assert(s2.zones['A.avatar'].includes('king'), 'อัญเชิญราชาสิ่งปฏิกูลจากสอดแนม');
    return s2;
  };
  // ใบที่ถูกเซ่นไหว้อยู่ในนรกแล้วจึงนับด้วย
  assert(!dying(3).prompts.some(p => p.dest === 'transformEnemy'), 'อัญเชิญโดยสิ่งปฏิกูล แต่ในนรกมี 4 ใบ → ไม่ทำงาน');
  assert(dying(4).prompts.some(p => p.dest === 'transformEnemy'), 'อัญเชิญโดยสิ่งปฏิกูล ในนรกครบ 5 ใบ → ทำความสามารถ พอดี จุติ');
}

console.log('compound juti: all passed');
