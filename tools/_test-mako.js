const BoT = require('../js/engine.js');
const cards = require('../data/cards.json');
BoT.loadEffects(require('../data/effects-all.json'));

function ok(c, m) { if (!c) throw new Error(m); console.log('ok ' + m); }
function fail(m) { throw new Error(m); }

function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  return {
    inst: {}, zones, phase: 'Main', active: 'A', turn: 1, strict: true,
    mulliganDone: { A: true, B: true }, buffs: [], prompts: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [], gems: { A: 10, B: 10 }
  };
}

function put(st, zone, code) {
  const c = cards.find(x => x.code === code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', cost: c.cost, color: c.color, gem: c.gem, gemColor: c.gemColor,
    power: c.power, effect: c.effect || '', attachedTo: null, faceUp: true
  };
  st.zones[zone].push(k);
  return k;
}

function apply(st, a) { return BoT.applyAction(st, a); }
function zone(st, k) { return BoT.zoneOf(st, k); }

/* 1. จุติจากการอัญเชิญปกติจากมือ (Normal Summon จ่าย 10 เขียว):
   เลือก Avatar มะม่วงที่เป็น Symbol ต้นไม้ จากนรก ที่ชื่อไม่ซ้ำกัน มาวางบน Magic Zone */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-001');
  put(st, 'B.deck', 'SD01-001');

  // จ่าย 10 เขียว
  const payIds = [];
  for (let i = 0; i < 10; i++) {
    payIds.push(put(st, 'A.hand', 'BT10-040'));
  }

  const mako = put(st, 'A.hand', 'BT10-039');
  const h1 = put(st, 'A.hell', 'BT02-036'); // ต้นมะม่วง
  const h2 = put(st, 'A.hell', 'BT10-041'); // นักรบทองแห่งภาคีมะม่วง
  const h3 = put(st, 'A.hell', 'BT09-036'); // ภูติผลไม้ มะม่วง (symbol เทพ - ไม่ใช่ต้นไม้)

  const fx = apply(st, { type: 'summon', k: mako, to: 'A.avatar', payIds, by: 'A' });
  if (fx.deny) fail('summon mako deny: ' + fx.deny);
  ok(zone(st, mako) === 'A.avatar', 'mako on avatar zone');
  ok(st.prompts.length === 1 && st.prompts[0].kind === 'pick', 'juti prompt opened');
  ok(st.prompts[0].dest === 'magic', 'juti dest is magic');
  ok(st.prompts[0].distinctNames === true, 'juti requires distinct names');

  // เลือก h1 (ต้นมะม่วง)
  apply(st, { type: 'chooseTarget', k: h1, by: 'A' });
  ok(zone(st, h1) === 'A.magic', 'h1 moved to magic zone');

  // เลือก h2 (นักรบทอง)
  apply(st, { type: 'chooseTarget', k: h2, by: 'A' });
  ok(zone(st, h2) === 'A.magic', 'h2 moved to magic zone');

  // กดข้ามการเลือกต่อ
  apply(st, { type: 'skipPrompt', by: 'A' });
  ok(st.prompts.length === 0, 'prompt finished');
}

/* 2. สั่งใช้จาก Magic Zone (ส่ง 5 ใบลงนรก -> อัญเชิญ จุติ มาโกะ):
   จุติทำงาน -> เก็บมะม่วงจากนรกกลับมาวาง Magic Zone */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-001');
  put(st, 'B.deck', 'SD01-001');

  const mako = put(st, 'A.magic', 'BT10-039');
  const mg1 = put(st, 'A.magic', 'BT02-036'); // ต้นมะม่วง
  const mg2 = put(st, 'A.magic', 'BT10-040'); // ผู้คุมกฎ
  const mg3 = put(st, 'A.magic', 'BT10-041'); // นักรบทอง
  const mg4 = put(st, 'A.magic', 'BT10-042'); // ผู้พิทักษ์
  const mg5 = put(st, 'A.magic', 'BT11-046'); // ดยุก

  let fx = apply(st, { type: 'activateAbility', k: mako, by: 'A' });
  if (fx.deny) fail('activate mako from magic deny: ' + fx.deny);

  // เลือก 5 ใบลงนรก
  [mg1, mg2, mg3, mg4, mg5].forEach(id => {
    apply(st, { type: 'chooseTarget', k: id, by: 'A' });
  });

  ok(zone(st, mako) === 'A.avatar', 'mako summoned from magic to avatar zone');
  ok(st.prompts.length === 1 && st.prompts[0].from === 'hell', 'juti hell pick opened after summon');

  // เลือก ต้นมะม่วง และ ผู้คุมกฎ กลับมาวาง Magic Zone
  apply(st, { type: 'chooseTarget', k: mg1, by: 'A' });
  ok(zone(st, mg1) === 'A.magic', 'mg1 retrieved to magic zone');
  apply(st, { type: 'chooseTarget', k: mg2, by: 'A' });
  ok(zone(st, mg2) === 'A.magic', 'mg2 retrieved to magic zone');

  apply(st, { type: 'skipPrompt', by: 'A' });
  ok(st.prompts.length === 0, 'juti pick completed');
}

/* 3. ความสามารถต่อเนื่อง: POWER +1 ตามจำนวน ต้นมะม่วง บน Magic Zone */
{
  const st = emptyState();
  const mako = put(st, 'A.avatar', 'BT10-039');
  ok(BoT.effPower(st, mako) === 6, 'mako base power 6');

  const tree1 = put(st, 'A.magic', 'BT02-036');
  ok(BoT.effPower(st, mako) === 7, 'mako power 7 with 1 tree');

  const tree2 = put(st, 'A.magic', 'PRMO-121');
  ok(BoT.effPower(st, mako) === 8, 'mako power 8 with 2 trees');

  const nonTree = put(st, 'A.magic', 'BT10-040'); // ผู้คุมกฎ (ไม่นับเป็นต้นมะม่วง)
  ok(BoT.effPower(st, mako) === 8, 'mako power remains 8 with non-tree mango');
}

/* 4. สั่งใช้เทิร์นละครั้งของมาโกะ: อัญเชิญ จุติ Avatar มะม่วง 1 ใบ จาก Magic Zone */
{
  const st = emptyState();
  put(st, 'A.deck', 'BT02-036');
  put(st, 'B.deck', 'SD01-001');

  const mako = put(st, 'A.avatar', 'BT10-039');
  const warden = put(st, 'A.magic', 'BT10-040'); // ผู้คุมกฎ (มี จุติ)

  let fx = apply(st, { type: 'activateAbility', k: mako, by: 'A' });
  if (fx.deny) fail('mako 4th ability deny: ' + fx.deny);

  ok(st.prompts.length === 1 && st.prompts[0].from === 'ownMagic', 'magicPick prompt opened');
  apply(st, { type: 'chooseTarget', k: warden, by: 'A' });
  ok(zone(st, warden) === 'A.avatar', 'warden summoned to avatar zone');
  
  // ผู้คุมกฎมี จุติ -> ทำงานต่อเนื่อง (ค้นหาจากเด็คมาวาง Magic Zone)
  ok(st.prompts.length === 1 && st.prompts[0].from === 'deckAll', 'warden juti triggered');
}

/* 5. สั่งใช้มาโกะ ขณะที่มี Land แอสการ์ด (BT02-060) อยู่ในสนาม — มะม่วงใน Magic Zone ต้องยังคงเป็น Symbol ต้นไม้ และสั่งใช้เลือกได้ */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-001');
  put(st, 'B.deck', 'SD01-001');

  const mako = put(st, 'A.avatar', 'BT10-039');
  const tree = put(st, 'A.magic', 'BT02-036');
  const gold = put(st, 'A.magic', 'BT10-041');
  const asgard = put(st, 'land', 'BT02-060');

  // ตรวจสอบว่า Avatar บน Avatar Zone ได้รับ Symbol เทพ จากแอสการ์ด
  ok(BoT.cardSymbols(st, mako).includes('เทพ'), 'mako on avatar zone has symbol god from asgard');
  // ตรวจสอบว่า Avatar บน Magic Zone ไม่โดนเปลี่ยน Symbol และยังคงเป็น ต้นไม้
  ok(BoT.cardSymbols(st, tree).includes('ต้นไม้'), 'tree on magic zone retains symbol tree');
  ok(BoT.cardSymbols(st, gold).includes('ต้นไม้'), 'gold warrior on magic zone retains symbol tree');

  let fx = apply(st, { type: 'activateAbility', k: mako, by: 'A' });
  if (fx.deny) fail('mako with asgard deny: ' + fx.deny);

  ok(st.prompts.length === 1 && st.prompts[0].from === 'ownMagic', 'magicPick prompt opened even with asgard land');
  apply(st, { type: 'chooseTarget', k: tree, by: 'A' });
  ok(zone(st, tree) === 'A.avatar', 'tree summoned to avatar zone');
  // เมื่อ tree ลงมาที่ Avatar Zone แล้ว จะกลายเป็น Symbol เทพ ตามผลของแอสการ์ด
  ok(BoT.cardSymbols(st, tree).includes('เทพ'), 'tree on avatar zone now has symbol god from asgard');
}

console.log('ALL MAKO TESTS PASSED');
