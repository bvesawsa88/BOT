/* Test: การ์ดที่ text จำกัดการโจมตี — รถถัง / ชาช่าจัง / ทองเหม็น / ป้อมยาม */
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

function setup(code, name, foe = true) {
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
  st.inst.atk = { code, name, type: 'Avatar', power: 5, faceUp: true };
  zones['A.avatar'].push('atk');
  if (foe) {
    st.inst.foe = { code: 'BT01-001', name: 'ศัตรู', type: 'Avatar', power: 3, faceUp: true };
    zones['B.avatar'].push('foe');
  }
  for (let i = 0; i < 2; i++) {
    st.inst['life' + i] = { code: 'BT01-001', name: 'LIFE', type: 'Avatar', faceUp: false };
    zones['B.life'].push('life' + i);
  }
  return st;
}
function attach(st, id, card, host = 'atk') {
  st.inst[id] = Object.assign({ type: 'Avatar', power: 1, faceUp: true, attachedTo: host }, card);
  st.zones['A.magic'].push(id);
}
const attack = st => BoT.applyAction(st, { type: 'declareAttack', atk: 'atk', def: 'foe', by: 'A' });
const hitLife = st => BoT.applyAction(st, { type: 'declareAttack', atk: 'atk', life: 'life0', by: 'A' });
const RANGER = { code: 'BT02-028', name: 'สตีฟ Tank Ranger' };

// รถถังที่ต้องมี Avatar สวมใส่ 1 ใบ
[['SD04-004', 'รถถัง "Tank Ranger"'], ['PRMO-038', 'รถถัง "Tank Ranger"'],
  ['BT02-029', 'รถถัง B66 - เอ็กซ์เซลเซอร์'], ['CC02-037', 'รถถัง B66 - เอ็กซ์เซลเซอร์']].forEach(([code, name]) => {
  assert(attack(setup(code, name)).deny, code + ' ไม่มีสวมใส่ → โจมตีไม่ได้');
  let st = setup(code, name);
  attach(st, 'mod', { code: 'BT04-054', name: 'ของขวัญจากโอตะ', type: 'Magic', subtype: 'Modification' });
  assert(attack(st).deny, code + ' สวม Magic อย่างเดียว → โจมตีไม่ได้');
  st = setup(code, name);
  attach(st, 'r1', RANGER);
  assert(!attack(st).deny, code + ' มี Avatar สวมใส่ → โจมตีได้');
});

// รถถังเฟืองเหล็ก ต้องสวม 2 ใบ
{
  const mk = () => setup('BT08-043', 'รถถังเฟืองเหล็ก');
  let st = mk();
  attach(st, 'r1', RANGER);
  assert(attack(st).deny, 'BT08-043 สวม 1 ใบ → โจมตีไม่ได้');
  st = mk();
  attach(st, 'r1', RANGER);
  attach(st, 'r2', { code: 'BT04-030', name: 'มาติเนซ Tank Ranger' });
  assert(!attack(st).deny, 'BT08-043 สวม 2 ใบ → โจมตีได้');
}

// ชาช่าจัง
['BT07-022', 'PRMO-076'].forEach(code => {
  const name = 'ชาช่าจัง ไอดอลคนเก่ง';
  let st = setup(code, name);
  assert(attack(st).deny, code + ' โจมตีไม่ได้ตามปกติ');
  assert(BoT.attachOnlyDeny(st, 'BT02-028', 'atk', RANGER.name), code + ' สวมการ์ดที่ไม่ใช่โอตะไม่ได้');
  assert(!BoT.attachOnlyDeny(st, 'BT02-010', 'atk', 'โอตะ รุ่นก่อตั้ง'), code + ' สวมโอตะได้');

  st.phase = 'Main';
  assert(BoT.applyAction(st, { type: 'activateAbility', k: 'atk', by: 'A' }).deny, code + ' ไม่มีโอตะสวมอยู่ → สั่งใช้ไม่ได้');

  st = setup(code, name);
  st.phase = 'Main';
  st.inst.idol = { code: 'BT02-009', name: 'มีมมิจัง ไอดอลหน้าใหม่', type: 'Avatar', power: 3, faceUp: true };
  st.zones['A.avatar'].push('idol');
  attach(st, 'ota', { code: 'BT02-010', name: 'โอตะ รุ่นก่อตั้ง' }, 'idol');
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: 'atk', by: 'A' });
  assert(!fx.deny, code + ' มีโอตะสวมไอดอลใบอื่น → สั่งใช้ได้: ' + (fx.deny || ''));
  const p = st.prompts[0];
  assert(p && BoT.promptCandidates(st, p).includes('ota'), code + ' เลือกโอตะจ่ายค่าได้');
  assert(!BoT.applyAction(st, { type: 'chooseTarget', k: 'ota', by: 'A' }).deny, code + ' จ่ายค่าสำเร็จ');
  assert(st.zones['A.hell'].includes('ota'), code + ' โอตะถูกทำลายลงนรก');
  assert(st.inst.atk.attackAllowedTurn === 4, code + ' ปลดล็อกการโจมตีเทิร์นนี้');
  st.phase = 'Battle';
  assert(!attack(st).deny, code + ' เทิร์นนี้โจมตีได้');

  st.pending = null;
  st.turnSeq = 5;
  st.inst.atk.tapped = false;
  assert(attack(st).deny, code + ' เทิร์นถัดไปโจมตีไม่ได้อีก');
});

// ทองเหม็น
['SD06-003', 'PRMO-105'].forEach(code => {
  const name = 'ทองเหม็น ขวานคลั่ง';
  let st = setup(code, name, false);
  assert(hitLife(st).deny, code + ' ไม่มีค่ายบางระจัน → ตี LIFE ไม่ได้');
  st = setup(code, name);
  assert(!attack(st).deny, code + ' ไม่มีค่ายบางระจัน → ตี Avatar ได้');
  st = setup(code, name, false);
  st.inst.camp = { code: 'SD06-012', name: 'ค่ายบางระจัน', type: 'Construct', faceUp: true };
  st.zones['A.construct'].push('camp');
  assert(!hitLife(st).deny, code + ' มีค่ายบางระจัน → ตี LIFE ได้');
});

// ป้อมยาม
{
  const code = 'BT01-002', name = 'ผู้โจมตี';
  let st = setup(code, name, false);
  st.inst.post = { code: 'BT06-068', name: 'ป้อมยาม', type: 'Construct', faceUp: true };
  st.zones['B.construct'].push('post');
  assert(hitLife(st).deny, 'ฝ่ายตรงข้ามมีป้อมยาม → ตี LIFE ไม่ได้');
  st = setup(code, name, false);
  assert(!hitLife(st).deny, 'ไม่มีป้อมยาม → ตี LIFE ได้');
}

// เสามงคล ทรงญี่ปุ่น
assert(attack(setup('BT06-034', 'เสามงคล ทรงญี่ปุ่น')).deny, 'BT06-034 โจมตีไม่ได้');

// ถูกบังคับโจมตี แต่ LIFE ถูกป้อมยามกัน ต้องจบเทิร์นได้ (ไม่ค้าง)
{
  const st = setup('BT01-002', 'ผู้โจมตี', false);
  st.inst.gun = { code: 'CC02-048', name: 'ปืนจักรวุทธ', type: 'Magic', subtype: 'Modification', faceUp: true, attachedTo: 'atk' };
  st.zones['A.magic'].push('gun');
  const forced = BoT.applyAction(JSON.parse(JSON.stringify(st)), { type: 'endTurn', by: 'A' });
  assert(forced.deny && forced.deny.includes('ต้องโจมตี'), 'ไม่มีป้อมยาม → ต้องโจมตีก่อนจบเทิร์น');
  st.inst.post = { code: 'BT06-068', name: 'ป้อมยาม', type: 'Construct', faceUp: true };
  st.zones['B.construct'].push('post');
  const free = BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  assert(!(free.deny && free.deny.includes('ต้องโจมตี')), 'มีป้อมยาม → จบเทิร์นได้ ไม่ค้าง');
}

console.log('attack restrictions: all passed');
