/* Test: เนียจัง (BT08-029) / โอตะท๊อปโดเนท (BT08-021) / เสามงคล ทรงญี่ปุ่น (BT06-034) */
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

const NIA = 'เนียจัง ไอดอลอินฟลูเอนเซอร์';
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
  st.inst[id] = Object.assign({ type: 'Avatar', power: 3, faceUp: true, cardOwner: zone[0] }, card);
  st.zones[zone].push(id);
}
function nia() {
  const st = base();
  put(st, 'nia', 'A.avatar', { code: 'BT08-029', name: NIA, cost: 4 });
  put(st, 'foe', 'B.avatar', { code: 'BT01-001', name: 'ศัตรูตัวเก่ง' });
  return st;
}
const ota = (st, id, code = 'BT03-014', name = 'โอตะปุส') => put(st, id, 'A.magic', { code, name, attachedTo: 'nia' });
const activate = st => BoT.applyAction(st, { type: 'activateAbility', k: 'nia', by: 'A' });
const choose = (st, k) => BoT.applyAction(st, { type: 'chooseTarget', k, by: 'A' });

// เนียจัง: ค่าใช้จ่าย 2 ใบ
{
  let st = nia();
  ota(st, 'o1');
  assert(activate(st).deny, 'โอตะ 1 ใบ → สั่งใช้ไม่ได้');

  st = nia();
  ota(st, 'o1');
  ota(st, 'o2', 'BT02-010', 'โอตะ รุ่นก่อตั้ง');
  assert(!activate(st).deny, 'โอตะ 2 ใบ → สั่งใช้ได้');
  assert(!choose(st, 'o1').deny && st.prompts[0].dest === 'destroyAttachedCost', 'ใบแรกแล้วเลือกใบที่ 2 ต่อ');
  assert(!choose(st, 'o2').deny, 'จ่ายครบ 2 ใบ');
  assert(st.zones['A.hell'].includes('o1') && st.zones['A.hell'].includes('o2'), 'โอตะทั้ง 2 ใบลงนรก');
  assert(!choose(st, 'foe').deny, 'เลือก Avatar ศัตรู');
  assert(st.inst.foe.name === 'โอตะ' && st.inst.foe.attachedTo === 'nia', 'ศัตรูเปลี่ยนชื่อเป็นโอตะและสวมให้เนียจัง');
  assert(!st.zones['B.avatar'].includes('foe'), 'ศัตรูออกจาก Avatar Zone ฝ่ายตรงข้าม');

  // ใบที่ขโมยมานับเป็นโอตะ และกลับนรกเจ้าของด้วยชื่อเดิม
  ota(st, 'o3');
  st.inst.foe2 = null; delete st.inst.foe2;
  put(st, 'foe2', 'B.avatar', { code: 'BT01-001', name: 'ศัตรูอีกใบ' });
  assert(activate(st).deny, 'ครบเทิร์นละครั้ง (ไม่มีทัตดนัยซัง) → ใช้ซ้ำไม่ได้');
  st.turnSeq = 5; st.turn = 5; st._onceTurn = {};
  assert(!activate(st).deny, 'เทิร์นใหม่ใช้ได้อีก');
  choose(st, 'foe');
  assert(st.zones['B.hell'].includes('foe') && st.inst.foe.name === 'ศัตรูตัวเก่ง', 'ใบที่ขโมยลงนรกเจ้าของและคืนชื่อเดิม');
}

// โอตะท๊อปโดเนท นับเป็น 2 ใบเฉพาะ เนียจัง
{
  const st = nia();
  ota(st, 'top', 'BT08-021', 'โอตะท๊อปโดเนท');
  assert(!activate(st).deny, 'ท๊อปโดเนท 1 ใบจ่ายให้เนียจังได้');
  choose(st, 'top');
  assert(st.prompts[0] && st.prompts[0].dest === 'renameAttach', 'จ่ายครบด้วยใบเดียว แล้วเลือกเป้า');

  const eff = BoT.effectOf('BT08-021', 'โอตะท๊อปโดเนท');
  assert(eff.abilities.length === 1 && eff.abilities[0].trigger.on === 'chooseMode', 'ไม่มีจุติธรณีสูบแล้ว เหลือเลือกปฏิบัติ');

  const s2 = base();
  put(s2, 'cha', 'A.avatar', { code: 'BT07-022', name: 'ชาช่าจัง ไอดอลคนเก่ง' });
  put(s2, 'top', 'A.avatar', { code: 'BT08-021', name: 'โอตะท๊อปโดเนท', cost: 0 });
  assert(!BoT.applyAction(s2, { type: 'chooseMode', k: 'top', opt: 0, by: 'A' }).deny, 'เลือกสวมใส่ไอดอลได้');
  assert(!BoT.applyAction(s2, { type: 'chooseTarget', k: 'cha', by: 'A' }).deny && s2.inst.top.attachedTo === 'cha', 'สวมให้ชาช่าจัง');
}

// เนียจัง: ทัตดนัยซังเพิ่มเป็น 2 ครั้ง / ไม่มีเป้าห้ามจ่าย
{
  const st = nia();
  put(st, 'tat', 'A.avatar', { code: 'BT05-031', name: 'ทัตดนัยซัง โปรดิวเซอร์มือทอง' });
  put(st, 'foe2', 'B.avatar', { code: 'BT01-001', name: 'ศัตรูอีกใบ' });
  ['o1', 'o2', 'o3', 'o4'].forEach(id => ota(st, id));
  activate(st); choose(st, 'o1'); choose(st, 'o2'); choose(st, 'foe');
  assert(!activate(st).deny, 'มีทัตดนัยซัง → ใช้ครั้งที่ 2 ได้');
  choose(st, 'o3'); choose(st, 'o4'); choose(st, 'foe2');
  ['o5', 'o6'].forEach(id => ota(st, id));
  put(st, 'foe3', 'B.avatar', { code: 'BT01-001', name: 'ศัตรูใบที่สาม' });
  assert(activate(st).deny, 'ครั้งที่ 3 ใช้ไม่ได้');

  const s2 = nia();
  s2.zones['B.avatar'] = [];
  ota(s2, 'o1'); ota(s2, 'o2');
  assert(activate(s2).deny && s2.inst.o1.attachedTo === 'nia', 'ไม่มี Avatar ศัตรู → ไม่ให้จ่ายค่า');
}

// เนียจัง จุติ: LIFE หงาย 3 ใบ "หรือ" มี มยุราซัง
{
  const summon = setupFn => {
    const st = base();
    st.inst.nia = { code: 'BT08-029', name: NIA, type: 'Avatar', power: 4, cost: 1, gem: 1, faceUp: true, cardOwner: 'A' };
    put(st, 'pay', 'A.hand', { code: 'BT01-001', name: 'จ่าย', gem: 1 });
    st.zones['A.hand'].push('nia');
    put(st, 'tat', 'A.deck', { code: 'BT05-031', name: 'ทัตดนัยซัง โปรดิวเซอร์มือทอง', faceUp: false });
    setupFn(st);
    const fx = BoT.applyAction(st, { type: 'summon', k: 'nia', to: 'A.avatar', by: 'A', payIds: ['pay'] });
    assert(!fx.deny && st.zones['A.avatar'].includes('nia'), 'อัญเชิญเนียจัง: ' + (fx.deny || 'สำเร็จ'));
    return { st, fx };
  };
  const life = (st, n) => { for (let i = 0; i < n; i++) put(st, 'l' + i, 'A.life', { code: 'BT01-001', name: 'L', faceUp: true }); };
  const offered = st => (st.prompts || []).some(p => p.from === 'deckOrHand');
  assert(!offered(summon(() => {}).st), 'ไม่เข้าเงื่อนไข → จุติไม่ทำงาน');
  assert(!offered(summon(st => life(st, 2)).st), 'LIFE หงาย 2 ใบ → จุติไม่ทำงาน');
  assert(offered(summon(st => life(st, 3)).st), 'LIFE หงาย 3 ใบ → จุติทำงาน');
  assert(offered(summon(st => put(st, 'may', 'A.avatar', { code: 'BT05-043', name: 'มยุราซัง  ไอดอลยุค 80' })).st), 'มีมยุราซัง → จุติทำงาน');

  const { st } = summon(s => life(s, 3));
  put(st, 'foe', 'B.avatar', { code: 'BT01-001', name: 'ศัตรู' });
  choose(st, 'tat');
  assert(st.zones['A.avatar'].includes('tat'), 'อัญเชิญทัตดนัยซังลงสนาม');
  assert(st.prompts[0] && st.prompts[0].dest === 'renameAttach', 'อัญเชิญแบบพอดี → จุติของทัตดนัยซังทำงาน');
}

// เสามงคล ทรงญี่ปุ่น
{
  const mk = () => {
    const st = base();
    put(st, 'pil', 'A.avatar', { code: 'BT06-034', name: 'เสามงคล ทรงญี่ปุ่น' });
    put(st, 'man', 'A.hand', { code: 'BT02-023', name: 'ผู้เจริญ', power: 3 });
    return st;
  };
  let st = mk();
  assert(!BoT.applyAction(st, { type: 'activateAbility', k: 'pil', by: 'A' }).deny, 'สั่งใช้ได้');
  assert(!choose(st, 'man').deny && st.zones['A.avatar'].includes('man'), 'อัญเชิญผู้เจริญจากมือ');
  assert(BoT.effPower(st, 'man') === 4, 'ผู้เจริญ POWER +1');
  assert(BoT.applyAction(st, { type: 'activateAbility', k: 'pil', by: 'A' }).deny, 'เทิร์นละครั้ง');
  assert(!BoT.applyAction(st, { type: 'endTurn', by: 'A' }).deny, 'จบเทิร์น');
  assert(st.zones['A.hell'].includes('man'), 'End Phase ส่งผู้เจริญลงนรก');

  st = mk();
  BoT.applyAction(st, { type: 'activateAbility', k: 'pil', by: 'A' });
  choose(st, 'man');
  st.zones['A.avatar'] = st.zones['A.avatar'].filter(x => x !== 'man');
  st.zones['A.hand'].push('man');
  BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  assert(st.zones['A.hand'].includes('man'), 'ออกจากสนามก่อน End Phase → ไม่ถูกส่งลงนรก');

  const eff = BoT.effectOf('BT06-034', 'เสามงคล ทรงญี่ปุ่น');
  assert(!eff.abilities.some(a => a.trigger.on === 'static'), 'ไม่มีออร่า POWER ถาวรแล้ว');
}

console.log('nia / ota top donate / pillar: all passed');
