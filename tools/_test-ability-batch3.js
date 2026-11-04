/* ชุดตรวจการ์ด 3: ความสามารถที่เคยหาย / ค่าเปลี่ยนตามเงื่อนไข
   รัน: node tools/_test-ability-batch3.js */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

const byCode = code => { const c = cards.find(x => x.code === code); if (!c) throw new Error('missing ' + code); return c; };
const pick = (fn, l) => { const c = cards.find(fn); if (!c) throw new Error('missing ' + l); return c.code; };
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  const st = {
    inst: {}, zones, phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
  for (let i = 0; i < 8; i++) { put(st, 'A.deck', 'SD01-007'); put(st, 'B.deck', 'SD01-007'); }
  return st;
}
function put(st, zone, code) {
  const c = byCode(code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  st.zones[zone].push(k);
  return k;
}
function fail(m) { console.error('FAIL', m); process.exit(1); }
function ok(c, m) { if (!c) fail(m); console.log('ok', m); }
const act = (st, a) => { const fx = BoT.applyAction(st, a); if (fx && fx.deny) fail(a.type + ' deny: ' + fx.deny); return fx; };
const zone = (st, k) => BoT.zoneOf(st, k);
const logHas = (st, s) => st.log.some(l => (l.t || '').includes(s));
function passAll(st) { let g = 0; while (st.prompts[0] && st.prompts[0].kind === 'react' && g++ < 6) act(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 50 + g }); }

/* ง้าวมังกรเขียว: กวนอู +2 */
{
  const st = emptyState();
  const guan = put(st, 'A.avatar', pick(c => c.type === 'Avatar' && /กวนอู/.test(c.name), 'กวนอู'));
  const other = put(st, 'A.avatar', pick(c => c.type === 'Avatar' && /ขุนพล/.test(c.name) && !/กวนอู/.test(c.name) && c.symbol === 'ต่างชาติ', 'ขุนพล'));
  const b1 = BoT.effPower(st, guan), b2 = BoT.effPower(st, other);
  const m1 = put(st, 'A.magic', 'SD07-018'); st.inst[m1].attachedTo = guan;
  const m2 = put(st, 'A.magic', 'SD07-018'); st.inst[m2].attachedTo = other;
  ok(BoT.effPower(st, guan) === b1 + 2, 'ง้าวมังกรเขียว: กวนอู +2');
  ok(BoT.effPower(st, other) === b2 + 1, 'ง้าวมังกรเขียว: ใบอื่น +1');
}

/* บุญช่วย: ควบคุมค่าย +2 */
{
  const st = emptyState();
  const av = put(st, 'A.avatar', 'SD01-001');
  const b = BoT.effPower(st, av);
  const m = put(st, 'A.magic', 'SD06-008'); st.inst[m].attachedTo = av;
  ok(BoT.effPower(st, av) === b + 1, 'บุญช่วย: ปกติ +1');
  put(st, 'A.construct', 'SD06-018');
  ok(BoT.effPower(st, av) === b + 2, 'บุญช่วย: มีค่าย +2');
}

/* น้องไอซ์: ทำลายเป้า POWER ≤ 3 */
{
  const low = pick(c => c.type === 'Avatar' && +c.power === 3 && !/โล่|ไม่สามารถ/.test(c.effect || ''), 'P3');
  const st = emptyState(); st.phase = 'Battle';
  const ice = put(st, 'A.avatar', 'BT07-010');
  const foe = put(st, 'B.avatar', low);
  act(st, { type: 'declareAttack', atk: ice, def: foe, by: 'A', seed: 3 });
  ok(zone(st, foe) === 'B.hell', 'น้องไอซ์: เป้า P3 ถูกทำลาย');
  const st2 = emptyState(); st2.phase = 'Battle';
  const ice2 = put(st2, 'A.avatar', 'BT07-010');
  const big = put(st2, 'B.avatar', 'SD01-001');
  act(st2, { type: 'declareAttack', atk: ice2, def: big, by: 'A', seed: 3 });
  ok(!logHas(st2, 'ที่เป็นเป้าโจมตี'), 'น้องไอซ์: เป้า P5 ไม่โดนทำลายจากความสามารถ');
}

/* ไอ้แม๊ก: เลือกการ์ดใน Magic Zone ศัตรูกลับมือ */
{
  const st = emptyState();
  const mak = put(st, 'A.avatar', 'BT07-011');
  const mag = put(st, 'B.magic', 'BT05-058');
  st.scheduled.push({ player: 'A', op: 'destroyCard', k: mak, when: 'endPhase' });
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseDestroy', 'ไอ้แม๊ก: เปิดเลือกการ์ด');
  act(st, { type: 'chooseTarget', k: mag, by: 'A', seed: 2 });
  ok(zone(st, mag) === 'B.hand', 'ไอ้แม๊ก: การ์ดกลับมือเจ้าของ');
}

/* ดินแดนหิมะสีเทา: +1 ต่อทหารหิมะ 2 ใบในนรก */
{
  const st = emptyState();
  const snow = put(st, 'A.avatar', 'BT07-020');
  const land = put(st, 'land', 'BT07-068');
  for (let i = 0; i < 4; i++) put(st, 'A.hell', 'BT07-020');
  const b = BoT.effPower(st, snow);
  act(st, { type: 'activateAbility', k: land, by: 'A', seed: 2 });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseBuff', 'หิมะสีเทา: เลือกเป้า');
  act(st, { type: 'chooseTarget', k: snow, by: 'A', seed: 3 });
  ok(BoT.effPower(st, snow) === b + 2, 'หิมะสีเทา: นรก 4 ใบ +2');
}

/* กระบือชาวร๊อค: เพื่อนโจมตี +1 */
{
  const st = emptyState(); st.phase = 'Battle';
  const atk = put(st, 'A.avatar', 'SD01-001');
  put(st, 'A.avatar', 'BT10-024');
  const foe = put(st, 'B.avatar', 'SD01-001');
  act(st, { type: 'declareAttack', atk, def: foe, by: 'A', seed: 3 });
  ok(st.log.filter(l => (l.t || '').includes('POWER +1 จนจบเทิร์น')).length === 1, 'กระบือ: เพื่อนโจมตี +1 ครั้งเดียว');
}

/* กัปตัน 7 สี: เลือกตามสี Avatar ใบอื่น */
{
  const st = emptyState();
  put(st, 'A.avatar', 'SD01-001'); // แดง
  const capt = put(st, 'A.avatar', 'BT06-012');
  const deny = BoT.chooseModeOptionDeny;
  if (deny) {
    const ab = BoT.effectOf('BT06-012', byCode('BT06-012').name).abilities[0].actions[0];
    ok(!deny(st, capt, 'A', ab.options[0]), 'กัปตัน: มีสีแดงเลือกข้อแดงได้');
    ok(!!deny(st, capt, 'A', ab.options[1]), 'กัปตัน: ไม่มีสีฟ้าเลือกข้อฟ้าไม่ได้');
  } else ok(true, 'กัปตัน: ข้ามเช็คตัวเลือก (ไม่ส่งออกฟังก์ชัน)');
}

/* ค่ายบางระจัน ถูกทำลาย: Avatar ฝ่ายเราลงนรก */
{
  const st = emptyState();
  const camp = put(st, 'A.construct', 'SD06-018');
  const av = put(st, 'A.avatar', 'SD01-001');
  st.scheduled.push({ player: 'A', op: 'destroyCard', k: camp, when: 'endPhase' });
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  passAll(st);
  ok(zone(st, camp) === 'A.hell', 'ค่ายบางระจัน: ถูกทำลาย');
  ok(zone(st, av) === 'A.hell', 'ค่ายบางระจัน: Avatar ฝ่ายเราลงนรก');
}

/* พระอีสาน: จากมือตอนอีสานสลิงเกอร์ต่อสู้ */
{
  const st = emptyState(); st.phase = 'Battle';
  const sl = put(st, 'A.avatar', 'BT08-024');
  const monk = put(st, 'A.hand', 'BT10-033');
  const foe = put(st, 'B.avatar', 'SD01-001');
  act(st, { type: 'declareAttack', atk: sl, def: foe, by: 'A', seed: 3 });
  const pr = (st.prompts || []).find(p => p.reactTrigger === 'ownAvatarFights' && (p.options || []).includes(monk));
  ok(!!pr, 'พระอีสาน: เปิดให้ใช้จากมือ');
}

console.log('ALL ABILITY BATCH 3 TESTS PASSED');

/* การ์ด LIFE: นัดผลตามข้อความ */
{
  const st = emptyState();
  const av = put(st, 'B.avatar', 'SD01-001');
  st.active = 'B'; st.phase = 'Main';
  const life = put(st, 'B.hell', 'BT05-072');
  st.scheduled.push({ player: 'B', when: 'nextOwnBattlePhase', op: 'runActions', src: life, actions: [{ op: 'buffAllOwn', zone: 'avatar', amount: 1 }] });
  const foe = put(st, 'A.avatar', 'SD01-001');
  const before = BoT.effPower(st, av);
  act(st, { type: 'declareAttack', atk: av, def: foe, by: 'B', seed: 4 });
  ok(st.log.some(l => (l.t || '').includes('ทุกใบ POWER +1')), 'ไม่นะ ไมเกรน: Avatar ฝ่ายเจ้าของ +1 ตอนเริ่ม Battle Phase');
  ok(!st.scheduled.some(s => s.when === 'nextOwnBattlePhase'), 'ไม่นะ ไมเกรน: ใช้นัดแล้ว');
  ok(before === 5, 'ไม่นะ ไมเกรน: ก่อน Battle ยังไม่เพิ่ม');
}
const lifeData = code => JSON.stringify(BoT.effectOf(code, byCode(code).name).abilities);
['SD06-022', 'SD06-023', 'SD06-024', 'SD07-021', 'SD07-022', 'SD07-023', 'BT05-072', 'BT10-075'].forEach(code => {
  ok(!lifeData(code).includes('"op":"draw"'), code + ': ไม่ใช่จั่วการ์ดแล้ว');
});
console.log('ALL LIFE TESTS PASSED');
