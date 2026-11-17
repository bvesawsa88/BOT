/* B2SA น้อง Passion ชุด + B2SB-001 อิศวร ประทานพร */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

const byCode = code => cards.find(c => c.code === code && c.image === code + '.png') || cards.find(c => c.code === code);
const byName = n => cards.find(c => c.name.includes(n));
let passed = 0;
const failures = [];
function ok(cond, msg) { if (cond) passed++; else { failures.push(msg); console.error('FAIL', msg); } }
function fresh(extra) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; }));
  return Object.assign({
    inst: {}, zones, phase: 'Main', active: 'A', turn: 3, turnSeq: 3, strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [], magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false, _tokSeq: 0, _mainPhaseSeq: 3, mainCount: { A: 2, B: 2 }
  }, extra || {});
}
function put(st, zone, key, extra) {
  const c = /^[A-Z0-9]+-\d/.test(key) ? byCode(key) : byName(key);
  if (!c) throw new Error('missing ' + key);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '', symbol: c.symbol || '', color: c.color || '',
    gemColor: c.gemColor || '', cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '', ex: c.ex || '',
    img: '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone].push(k);
  return k;
}
const vanilla = (st, zone, over) => {
  const k = put(st, zone, 'BT12-053', Object.assign({ name: 'ทดสอบ', code: 'TEST', symbol: 'สัตว์', color: 'แดง', power: 3, cost: 3, gem: 1, effect: '' }, over));
  return k;
};
const act = (st, a) => BoT.applyAction(st, Object.assign({ seed: 7 }, a));
const use = (st, k, by) => act(st, { type: 'activateAbility', k, by: by || 'A' });
const choose = (st, k, by) => act(st, { type: 'chooseTarget', k, by: by || (st.prompts[0] && st.prompts[0].chooser) });
const skip = (st, by) => act(st, { type: 'skipPrompt', by: by || (st.prompts[0] && st.prompts[0].chooser) });
/* ปล่อยหน้าต่างขัดเวทของอีกฝ่าย */
function drain(st) {
  let n = 0;
  while (st.prompts[0] && st.prompts[0].kind === 'react' && st.prompts[0].magicNegate && n++ < 4) act(st, { type: 'reactNo', by: st.prompts[0].chooser });
}
function playM(st, k, by) {
  const fx = act(st, { type: 'playMagic', k, by });
  if (!fx.deny) drain(st);
  return fx;
}
const mode = (st, opt) => act(st, { type: 'chooseMode', k: st.prompts[0] && st.prompts[0].src, opt, by: st.prompts[0] && st.prompts[0].chooser });
const P = (st, k) => BoT.effPower(st, k);
const has = (st, z, k) => (st.zones[z] || []).includes(k);
function fill(st, side, n) { for (let i = 0; i < n; i++) vanilla(st, side + '.deck', { name: 'เด็ค' + i }); }
function run(title, fn) { try { fn(); } catch (e) { failures.push(title + ': ' + e.message); console.error('ERROR', title, e.stack.split('\n').slice(0, 3).join(' | ')); } }
const PASS = 'B2SA-001', SHOP = 'B2SA-002', BOMB = 'B2SA-003', IDEA = 'B2SA-004', ROD = 'B2SA-005', ISV = 'B2SB-001';
const atk = (st, a, d) => act(st, { type: 'declareAttack', atk: a, def: d, by: 'A' });
const kind = st => st.prompts[0] && st.prompts[0].kind;
/* เลือก Passion รับ +1 จากระเบิดความรู้ที่ถูกทิ้ง */
function buffs(st, p) { let n = 0; while (kind(st) === 'chooseBuff' && n++ < 6) choose(st, p); }
/* อัญเชิญแบบจ่าย Cost ด้วยการ์ดเพชรแดงในมือ */
function summonPaid(st, k) {
  const pay = vanilla(st, 'A.hand', { name: 'จ่าย', gem: 3, gemColor: 'แดง', color: 'แดง' });
  return act(st, { type: 'summon', k, to: 'A.avatar', payIds: [pay], by: 'A' });
}
function battleSetup() {
  const st = fresh(); fill(st, 'A', 3); fill(st, 'B', 3);
  st.phase = 'Battle';
  return st;
}

run('Passion ทิ้ง 2 ใบ ทำลาย Cost 3 + POWER +2', () => {
  const st = battleSetup();
  const p = put(st, 'A.avatar', PASS);
  const b1 = put(st, 'A.hand', BOMB), b2 = put(st, 'A.hand', BOMB);
  const other = vanilla(st, 'A.hand', { name: 'อื่น' });
  const foe = vanilla(st, 'B.avatar', { cost: 3, power: 9 });
  const def = vanilla(st, 'B.avatar', { cost: 1, power: 1 });
  const fx = atk(st, p, def);
  ok(!fx.deny, 'โจมตีได้ ' + fx.deny);
  ok(kind(st) === 'chooseDiscard', 'ถามทิ้งระเบิดความรู้ ' + kind(st));
  ok(!BoT.promptTargetOk(st, other), 'ทิ้งใบอื่นไม่ได้');
  choose(st, b1); buffs(st, p);
  ok(kind(st) === 'chooseDiscard', 'ทิ้งต่อได้');
  choose(st, b2); buffs(st, p);
  ok(has(st, 'A.hell', b1) && has(st, 'A.hell', b2), 'ทิ้งลงนรก 2 ใบ');
  ok(kind(st) === 'chooseDestroy', 'มือหมดแล้วไปเลือกทำลาย ' + kind(st));
  choose(st, foe);
  ok(has(st, 'B.hell', foe), 'ทำลาย Cost 3');
  ok(P(st, p) === 5, 'Passion 3+2 = ' + P(st, p));
  ok(!!st._onceTurn && Object.keys(st._onceTurn).some(x => x.startsWith(p + ':') && x.endsWith(':whenAttacking')), 'นับเทิร์นละครั้ง');
});

run('Passion หยุดทิ้งเองได้ · ไม่มีคทาทำลาย Cost 4 ไม่ได้', () => {
  const st = battleSetup();
  const p = put(st, 'A.avatar', PASS);
  const b1 = put(st, 'A.hand', BOMB), b2 = put(st, 'A.hand', BOMB);
  const foe = vanilla(st, 'B.avatar', { cost: 4 });
  const low = vanilla(st, 'B.avatar', { cost: 2, power: 1 });
  atk(st, p, low);
  choose(st, b1); buffs(st, p);
  ok(kind(st) === 'chooseDiscard', 'ถามทิ้งต่อ');
  skip(st); buffs(st, p);
  ok(has(st, 'A.hand', b2), 'เก็บอีกใบไว้');
  ok(kind(st) === 'chooseDestroy', 'ข้ามแล้วไปทำลาย ' + kind(st));
  ok(!BoT.promptTargetOk(st, foe), 'Cost 4 ทำลายไม่ได้');
});

run('Passion ข้ามตั้งแต่แรก = ไม่ใช้ ไม่เสียเทิร์นละครั้ง', () => {
  const st = battleSetup();
  const p = put(st, 'A.avatar', PASS);
  put(st, 'A.hand', BOMB);
  const low = vanilla(st, 'B.avatar', { cost: 2, power: 1 });
  atk(st, p, low);
  skip(st);
  ok(kind(st) !== 'chooseDestroy', 'ไม่ทำลาย');
  ok(!st._onceTurn || !Object.keys(st._onceTurn).some(x => x.endsWith(':whenAttacking')), 'ยังไม่นับใช้');
});

run('คทารูปไฟฟ้า: +1 และทำลาย Cost 4 ได้', () => {
  const st = battleSetup();
  const p = put(st, 'A.avatar', PASS);
  put(st, 'A.magic', ROD, { attachedTo: p });
  const b1 = put(st, 'A.hand', BOMB);
  const foe = vanilla(st, 'B.avatar', { cost: 4, power: 9 });
  const hi = vanilla(st, 'B.avatar', { cost: 5, power: 9 });
  const low = vanilla(st, 'B.avatar', { cost: 1, power: 1 });
  ok(P(st, p) === 4, 'สวมคทา +1 → ' + P(st, p));
  atk(st, p, low);
  choose(st, b1); buffs(st, p);
  if (kind(st) === 'chooseDiscard') skip(st);
  ok(kind(st) === 'chooseDestroy' && BoT.promptTargetOk(st, foe), 'Cost 4 เลือกได้');
  ok(!BoT.promptTargetOk(st, hi), 'Cost 5 ไม่ได้');
});

run('Passion End Phase', () => {
  const st = fresh(); fill(st, 'A', 3); fill(st, 'B', 3);
  put(st, 'A.avatar', PASS);
  const idea = put(st, 'A.hell', IDEA), bomb = put(st, 'A.hell', BOMB);
  act(st, { type: 'endTurn', by: 'A' });
  ok(kind(st) === 'pick', 'ถามเนรเทศปิ๊งไอเดีย ' + kind(st));
  choose(st, idea);
  ok(has(st, 'A.dark', idea), 'ปิ๊งไอเดียลงมิติมืด');
  if (kind(st) === 'pick') choose(st, bomb);
  ok(has(st, 'A.hand', bomb), 'ระเบิดความรู้ขึ้นมือ');
  const st2 = fresh(); fill(st2, 'A', 3); fill(st2, 'B', 3);
  put(st2, 'A.avatar', PASS);
  const bomb2 = put(st2, 'A.hell', BOMB);
  act(st2, { type: 'endTurn', by: 'A' });
  if (kind(st2) === 'pick') skip(st2);
  ok(!has(st2, 'A.hand', bomb2), 'ไม่มีปิ๊งไอเดีย ไม่ได้ระเบิดความรู้ฟรี');
});

run('ระเบิดความรู้', () => {
  let st = fresh(); fill(st, 'A', 3);
  const b = put(st, 'A.hand', BOMB);
  ok(!!playM(st, b, 'A').deny, 'ไม่มี Passion ใช้ไม่ได้');
  st = fresh(); fill(st, 'A', 3);
  put(st, 'A.avatar', PASS);
  const b2 = put(st, 'A.hand', BOMB);
  const fx = playM(st, b2, 'A');
  ok(!fx.deny && st.zones['A.hand'].length === 1 && has(st, 'A.hell', b2), 'จั่ว 1 แล้วลงนรก ' + fx.deny);
});

run('ปิ๊งไอเดีย', () => {
  const st = fresh(); fill(st, 'A', 3);
  const i = put(st, 'A.hand', IDEA);
  const pd = put(st, 'A.deck', PASS);
  playM(st, i, 'A');
  ok(kind(st) === 'chooseMode', 'ให้เลือกข้อ ' + kind(st));
  mode(st, 1);
  if (st.prompts[0]) choose(st, pd);
  ok(has(st, 'A.hand', pd), 'Passion จากเด็คขึ้นมือ');
  const st2 = fresh(); fill(st2, 'A', 3);
  const i2 = put(st2, 'A.hand', IDEA);
  const bh = put(st2, 'A.hell', BOMB);
  playM(st2, i2, 'A'); mode(st2, 0);
  if (st2.prompts[0]) choose(st2, bh);
  ok(has(st2, 'A.hand', bh), 'ระเบิดความรู้จากนรกขึ้นมือ');
});

run('เจ้าของร้านหนังสือ จุติ', () => {
  let st = fresh(); fill(st, 'A', 3); fill(st, 'B', 3);
  const idea = put(st, 'A.dark', IDEA);
  const s = put(st, 'A.hand', SHOP);
  const fx = summonPaid(st, s);
  ok(!fx.deny, 'อัญเชิญได้ ' + fx.deny);
  ok(kind(st) === 'pick', 'ถามเลือกปิ๊งไอเดียจากมิติมืด ' + kind(st));
  choose(st, idea);
  ok(has(st, 'A.deck', idea) && st.zones['A.hand'].length === 1, 'กลับเด็คแล้วจั่ว 1');
  st = fresh(); fill(st, 'A', 3); fill(st, 'B', 3);
  const s2 = put(st, 'A.hand', SHOP);
  summonPaid(st, s2);
  ok(st.zones['A.hand'].length === 0, 'ไม่มีปิ๊งไอเดีย ไม่จั่ว');
});

run('อิศวร ประทานพร จุติ +1', () => {
  const st = fresh(); fill(st, 'A', 3); fill(st, 'B', 3);
  const ally = vanilla(st, 'A.avatar', { power: 2 });
  const s = put(st, 'A.hand', ISV);
  const fx = summonPaid(st, s);
  ok(!fx.deny, 'อัญเชิญได้ ' + fx.deny);
  if (st.prompts[0]) choose(st, ally);
  ok(P(st, ally) === 3, 'พวก +1 → ' + P(st, ally));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
