/* ชุดตรวจการ์ด 2: ข้อมูลที่เคยเป็นความสามารถของใบอื่น
   รัน: node tools/_test-wrong-card-batch.js */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8'));
BoT.loadEffects(effects);

const byCode = code => { const c = cards.find(x => x.code === code); if (!c) throw new Error('missing ' + code); return c; };
const codeByName = re => { const c = cards.find(x => re.test(x.name || '') && x.type === 'Avatar'); if (!c) throw new Error('missing ' + re); return c.code; };
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

/* ไม่เหลือความสามารถของใบอื่น */
const abilitiesText = code => JSON.stringify((effects.cards.find(e => e.code === code) || {}).abilities || []);
[['BT06-010', 'แม่ศรีนวล'], ['BT06-012', 'ทหาร'], ['BT07-011', 'แผนการ'], ['BT07-019', 'สัตว์มหัศจรรย์'], ['BT07-020', 'ครุฑ'],
  ['BT07-024', 'อาคารผู้โดยสาร'], ['BT08-013', 'ตำรวจ'], ['BT08-015', 'คาถา'], ['BT10-012', 'อัศวิน'], ['BT10-033', 'คน'], ['BT11-004', 'เทพ']].forEach(([code, word]) => {
  ok(!abilitiesText(code).includes(word), code + ': ไม่มี "' + word + '" ที่เป็นของใบอื่น');
});

/* ราชินีหิมะ: +2 ต่อทหารหิมะ +3 ต่อราชาหิมะ */
{
  const st = emptyState();
  const queen = put(st, 'A.avatar', 'BT07-019');
  const base = BoT.effPower(st, queen);
  put(st, 'A.avatar', 'BT07-020');
  put(st, 'A.avatar', 'BT07-020');
  ok(BoT.effPower(st, queen) === base + 4, 'ราชินีหิมะ: ทหารหิมะ 2 ใบ +4');
  put(st, 'A.avatar', codeByName(/ราชาหิมะ/));
  ok(BoT.effPower(st, queen) === base + 7, 'ราชินีหิมะ: ราชาหิมะ +3');
}

/* เอเจ้นท์สมูท: Battle Phase เรา +1 ต่อ 2 ใบในนรก */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'BT08-009');
  for (let i = 0; i < 4; i++) put(st, 'A.hell', 'BT08-009');
  ok(BoT.effPower(st, k) === 0, 'สมูท: Main ไม่เพิ่ม');
  st.phase = 'Battle';
  ok(BoT.effPower(st, k) === 2, 'สมูท: นรก 4 ใบ +2');
  st.active = 'B';
  ok(BoT.effPower(st, k) === 0, 'สมูท: Battle ศัตรูไม่เพิ่ม');
}

/* เปรตรัททาทุย: +1 ต่อ LIFE หงาย */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'BT08-013');
  const base = BoT.effPower(st, k);
  const l1 = put(st, 'A.life', 'SD01-007');
  const l2 = put(st, 'A.life', 'SD01-007');
  st.inst[l2].faceUp = false;
  ok(BoT.effPower(st, k) === base + 1, 'เปรตรัททาทุย: นับเฉพาะ LIFE หงาย');
  ok(!!l1, 'เปรตรัททาทุย: มี LIFE หงาย');
}

/* คุณเก่ง: ต้องมีพี่หน่วง */
{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'BT07-024');
  const base = BoT.effPower(st, k);
  put(st, 'A.avatar', 'BT06-024');
  ok(BoT.effPower(st, k) === base + 1, 'คุณเก่ง: มีพี่หน่วง +1');
}

/* นางฟ้าลูกซอง: สั่งใช้จากนรก เนรเทศตัวเอง */
{
  const st = emptyState();
  const av = put(st, 'A.avatar', 'SD01-001');
  const angel = put(st, 'A.hell', 'BT09-003');
  const base = BoT.effPower(st, av);
  act(st, { type: 'activateAbility', k: angel, by: 'A', seed: 2 });
  let g = 0;
  while (st.prompts[0] && st.prompts[0].chooser === 'B' && g++ < 4) act(st, { type: 'reactNo', by: 'B', seed: 20 + g });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseBuff', 'นางฟ้า: เลือก Avatar รับบัฟ');
  act(st, { type: 'chooseTarget', k: av, by: 'A', seed: 3 });
  ok(BoT.effPower(st, av) === base + 2, 'นางฟ้า: POWER +2');
  ok(BoT.zoneOf(st, angel) === 'A.dark', 'นางฟ้า: เนรเทศตัวเอง');
}

console.log('ALL WRONG CARD BATCH TESTS PASSED');
