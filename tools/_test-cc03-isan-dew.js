/* อีสานสลิงเกอร์ ดิว (CC03-015): เทิร์นละครั้ง สั่งใช้ มีโคกอีสานนูน ธรณีสูบกี่ใบก็ได้ → POWER +1 ทุก 3 ใบ */
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

run("ธรณีสูบ 6 → ปิ่น +2", () => {
  const { st, dew, pin } = setup(10);
  const p0 = P(st, pin);
  ok(!use(st, dew).deny && st.prompts[0].options.length === 9, "เลือกได้ 1–9 (ไม่ให้สูบจนเด็คหมด)");
  ok(!mode(st, 5).deny && st.zones["A.deck"].length === 4 && st.zones["A.hell"].length === 6, "ธรณีสูบ 6");
  choose(st, pin);
  ok(P(st, pin) === p0 + 2, "POWER +2");
  ok(!!use(st, dew).deny, "เทิร์นละครั้ง");
});
run("จำนวนไม่ลงตัว", () => {
  let { st, dew } = setup(10); use(st, dew); mode(st, 1);
  ok(st.zones["A.hell"].length === 2 && !st.prompts.length, "2 ใบ ไม่ได้โบนัส");
  ({ st, dew } = setup(10)); use(st, dew); mode(st, 4); choose(st, dew);
  ok(st.zones["A.hell"].length === 5 && P(st, dew) === 3, "5 ใบ +1");
});
run("เลือกได้แต่อีสานสลิงเกอร์ฝ่ายเรา", () => {
  const { st, dew } = setup(10); const enemy = put(st, "B.avatar", PIN), other = vanilla(st, "A.avatar", { name: "คนอื่น" });
  use(st, dew); mode(st, 2);
  ok(!BoT.promptTargetOk(st, enemy) && !BoT.promptTargetOk(st, other) && BoT.promptTargetOk(st, dew), "เป้าถูกต้อง");
});
console.log(passed + " passed, " + failures.length + " failed");
if (failures.length) process.exit(1);
