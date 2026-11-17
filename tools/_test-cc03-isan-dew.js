/* อีสานสลิงเกอร์ ดิว (CC03-TBD): เทิร์นละครั้ง สั่งใช้ มีโคกอีสานนูน ธรณีสูบกี่ใบก็ได้ → POWER +1 ทุก 3 ใบ */
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
  const c = /^[A-Z]+\d*-\d/.test(key) ? byCode(key) : byName(key);
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
const DEW = 'อีสานสลิงเกอร์ ดิว';
const LAND = 'BT08-065';
const PIN = 'BT08-025';
function setup(deckN, withLand) {
  const st = fresh();
  fill(st, 'A', deckN); fill(st, 'B', 3);
  if (withLand !== false) put(st, 'land', LAND, { owner: 'A' });
  const dew = put(st, 'A.avatar', DEW);
  const pin = put(st, 'A.avatar', PIN);
  return { st, dew, pin };
}

run('ไม่มีโคกอีสานนูน ใช้ไม่ได้', () => {
  const { st, dew } = setup(10, false);
  ok(!!use(st, dew).deny, 'ไม่มีแลนด์ → deny');
});

run('ธรณีสูบ 6 → ปิ่น +2', () => {
  const { st, dew, pin } = setup(10);
  const p0 = P(st, pin);
  let fx = use(st, dew);
  ok(!fx.deny, 'สั่งใช้ได้ ' + fx.deny);
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode', 'ขึ้นตัวเลือกจำนวน');
  fx = mode(st, 1);
  ok(!fx.deny, 'เลือก 6 ใบ ' + fx.deny);
  ok(st.zones['A.deck'].length === 4 && st.zones['A.hell'].length === 6, 'ธรณีสูบ 6 ใบ deck=' + st.zones['A.deck'].length);
  ok(st.prompts[0] && BoT.promptTargetOk(st, pin), 'เลือก Avatar อีสานสลิงเกอร์ (' + (st.prompts[0] && st.prompts[0].kind) + ')');
  const cands = BoT.promptCandidates ? BoT.promptCandidates(st, st.prompts[0]) : null;
  fx = choose(st, pin);
  ok(!fx.deny, 'เลือกปิ่น ' + fx.deny);
  ok(P(st, pin) === p0 + 2, `ปิ่น POWER +2 (${p0}→${P(st, pin)})`);
  ok(!!use(st, dew).deny, 'เทิร์นละครั้ง');
});

run('เด็คไม่พอ ตัวเลือกใหญ่ใช้ไม่ได้', () => {
  const { st, dew } = setup(4);
  let fx = use(st, dew);
  ok(!fx.deny, 'สั่งใช้ได้ (มีพอ 3) ' + fx.deny);
  ok(st.zones['A.deck'].length === 1, 'เด็ค 4 → เหลือตัวเลือกเดียว ธรณีสูบ 3 อัตโนมัติ');
  const s7 = setup(7);
  use(s7.st, s7.dew);
  ok(s7.st.prompts[0] && s7.st.prompts[0].kind === 'chooseMode', 'เด็ค 7 → ให้เลือก 3/6');
  fx = mode(s7.st, 2);
  ok(!!fx.deny && s7.st.zones['A.deck'].length === 7, 'เลือก 9 ไม่ได้และไม่เสียเด็ค');
  ok(s7.st.prompts[0] && s7.st.prompts[0].kind === 'chooseMode', 'ยังเลือกข้ออื่นได้ (ไม่เสียสิทธิ์)');
  fx = mode(s7.st, 1);
  ok(!fx.deny && s7.st.zones['A.deck'].length === 1, 'เลือก 6 แทนได้');
  const st2 = setup(2).st; const d2 = Object.keys(st2.inst).find(k => st2.inst[k].name === DEW);
  ok(!!use(st2, d2).deny, 'เด็คไม่ถึง 3 ใช้ไม่ได้');
});

run('เลือกได้แต่อีสานสลิงเกอร์ฝ่ายเรา', () => {
  const { st, dew } = setup(10);
  const enemy = put(st, 'B.avatar', PIN);
  const other = vanilla(st, 'A.avatar', { name: 'คนอื่น' });
  use(st, dew); mode(st, 0);
  ok(!!choose(st, enemy).deny || st.inst[enemy] && P(st, enemy) === 2, 'เลือกศัตรูไม่ได้');
  ok(!!choose(st, other).deny || P(st, other) === 3, 'เลือกตัวที่ไม่ใช่อีสานสลิงเกอร์ไม่ได้');
  const fx = choose(st, dew);
  ok(!fx.deny && P(st, dew) === 3, 'ดิวเลือกตัวเองได้ +1 → ' + P(st, dew));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
