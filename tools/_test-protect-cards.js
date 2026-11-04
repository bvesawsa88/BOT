/* กันทำลาย (ถวาย / ช่างมาแล้วววว / ขอจบรายการ) · นัดทำลายหลังออกจากสนาม · สีระหว่างต่อสู้
   รัน: node tools/_test-protect-cards.js */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function codeOf(re, type) {
  const c = cards.find(x => re.test(x.name || '') && (!type || x.type === type));
  if (!c) throw new Error('missing ' + re);
  return c.code;
}
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
  if (!c) throw new Error('missing ' + code);
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
const schedule = (st, k) => st.scheduled.push({ player: 'A', op: 'destroyCard', k, when: 'endPhase' });
function passB(st) {
  let g = 0;
  while (st.prompts[0] && st.prompts[0].chooser === 'B' && g++ < 5) act(st, { type: 'reactNo', by: 'B', seed: 40 + g });
}

/* ถวาย: ทิ้งมือทั้งหมด กัน Avatar ไม่ให้ถูกทำลาย */
{
  const st = emptyState();
  const av = put(st, 'A.avatar', 'SD01-001');
  const card = put(st, 'A.hand', 'BT02-051');
  const other = put(st, 'A.hand', 'SD01-007');
  schedule(st, av);
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  const pr = st.prompts[0];
  ok(pr && pr.reactTrigger === 'avatarWouldBeDestroyed' && pr.options.includes(card), 'ถวาย: เปิดหน้าต่างกันทำลาย');
  act(st, { type: 'reactYes', k: card, by: 'A', seed: 2 });
  ok(zone(st, other) === 'A.hell', 'ถวาย: ทิ้งมือทั้งหมด');
  passB(st);
  ok(zone(st, av) === 'A.avatar', 'ถวาย: Avatar ไม่ถูกทำลาย');
  ok(zone(st, card) === 'A.hell', 'ถวาย: ใช้แล้วลงนรก');
  ok(st.active === 'B', 'ถวาย: จบเทิร์นเดินต่อ');
}

/* ช่างมาแล้วววว: กัน Construct · ไม่ขึ้นตอน Avatar จะถูกทำลาย */
{
  const construct = codeOf(/.+/, 'Construct');
  const st = emptyState();
  const cons = put(st, 'A.construct', construct);
  const card = put(st, 'A.hand', 'BT06-050');
  schedule(st, cons);
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  const pr = st.prompts[0];
  ok(pr && (pr.options || []).includes(card), 'ช่าง: เปิดหน้าต่างเมื่อ Construct จะถูกทำลาย');
  act(st, { type: 'reactYes', k: card, by: 'A', seed: 2 });
  passB(st);
  ok(zone(st, cons) === 'A.construct', 'ช่าง: Construct ไม่ถูกทำลาย');

  const st2 = emptyState();
  const av = put(st2, 'A.avatar', 'SD01-001');
  put(st2, 'A.hand', 'BT06-050');
  schedule(st2, av);
  act(st2, { type: 'endTurn', by: 'A', seed: 1 });
  ok(!st2.prompts.length && zone(st2, av) === 'A.hell', 'ช่าง: ไม่กัน Avatar');
}

/* หมอมาแล้วววว: ไม่กัน Construct */
{
  const st = emptyState();
  const cons = put(st, 'A.construct', codeOf(/.+/, 'Construct'));
  put(st, 'A.hand', 'BT01-040');
  schedule(st, cons);
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  ok(zone(st, cons) === 'A.hell', 'หมอ: ไม่กัน Construct');
}

/* ขอจบรายการ: พี่หน่วงขึ้นมือแทน · ต้องมียาน · ไม่กันใบอื่น */
{
  const nuang = codeOf(/พี่หน่วง/, 'Avatar');
  const ship = codeOf(/ยานรายการ เถียงทันหน่วง/);
  const st = emptyState();
  const av = put(st, 'A.avatar', nuang);
  const shipK = put(st, 'A.construct', ship);
  const card = put(st, 'A.hand', 'BT07-061');
  schedule(st, av);
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  ok(st.prompts[0] && st.prompts[0].options.includes(card), 'ขอจบรายการ: เปิดหน้าต่าง');
  act(st, { type: 'reactYes', k: card, by: 'A', seed: 2 });
  ok(zone(st, shipK) === 'A.hell', 'ขอจบรายการ: ยานลงนรก');
  passB(st);
  ok(zone(st, av) === 'A.hand', 'ขอจบรายการ: พี่หน่วงขึ้นมือ');

  const st2 = emptyState();
  const av2 = put(st2, 'A.avatar', nuang);
  put(st2, 'A.hand', 'BT07-061');
  schedule(st2, av2);
  act(st2, { type: 'endTurn', by: 'A', seed: 1 });
  ok(zone(st2, av2) === 'A.hell', 'ขอจบรายการ: ไม่มียานใช้ไม่ได้');

  const st3 = emptyState();
  const av3 = put(st3, 'A.avatar', 'SD01-001');
  put(st3, 'A.construct', ship);
  put(st3, 'A.hand', 'BT07-061');
  schedule(st3, av3);
  act(st3, { type: 'endTurn', by: 'A', seed: 1 });
  ok(zone(st3, av3) === 'A.hell', 'ขอจบรายการ: กันเฉพาะพี่หน่วง');
}

/* นัดทำลาย: ออกจากสนามแล้วหมดผล */
{
  const st = emptyState();
  const inHand = put(st, 'A.hand', 'SD01-001');
  schedule(st, inHand);
  act(st, { type: 'endTurn', by: 'A', seed: 1 });
  ok(zone(st, inHand) === 'A.hand', 'นัดทำลาย: ไม่แตะใบในมือ');

  const st2 = emptyState();
  const av = put(st2, 'A.avatar', 'SD01-001');
  schedule(st2, av);
  act(st2, { type: 'move', k: av, to: 'A.hand', by: 'A' });
  ok(!st2.scheduled.some(s => s.k === av), 'นัดทำลาย: ออกจากสนามแล้วนัดถูกยกเลิก');
  st2.zones['A.hand'] = st2.zones['A.hand'].filter(x => x !== av); st2.zones['A.avatar'].push(av); // ลงสนามใหม่
  act(st2, { type: 'endTurn', by: 'A', seed: 1 });
  ok(zone(st2, av) === 'A.avatar', 'นัดทำลาย: ลงสนามใหม่ไม่โดนทำลาย');
}

/* เซอร์นัท: นับสีเสริม และสีที่ถูกเปลี่ยนจากใบสวม */
{
  const fightLog = (setup) => {
    const st = emptyState();
    st.phase = 'Battle';
    const nut = put(st, 'A.avatar', 'BT08-010');
    const foe = setup(st, nut);
    act(st, { type: 'declareAttack', atk: nut, def: foe, by: 'A', seed: 3 });
    return st.log.map(l => l.t || '');
  };
  ok(fightLog(st => put(st, 'B.avatar', 'BT09-006')).some(t => t.includes('POWER +3')), 'เซอร์นัท: ลูเซียนับเป็นสีม่วง');
  const withMimmi = fightLog((st, nut) => {
    const m = put(st, 'A.magic', 'BT11-019');
    st.inst[m].attachedTo = nut;
    return put(st, 'B.avatar', 'SD01-001');
  });
  ok(withMimmi.some(t => t.includes('เป็นสีม่วง')), 'มีมมิ: คู่ต่อสู้เป็นสีม่วง');
  ok(withMimmi.some(t => t.includes('POWER +3')), 'มีมมิ + เซอร์นัท: ได้ +3');
}

/* ใบสวมลด POWER คู่ต่อสู้ */
{
  const st = emptyState();
  st.phase = 'Battle';
  const atk = put(st, 'A.avatar', 'SD01-001');
  const mod = put(st, 'A.magic', 'BT08-062');
  st.inst[mod].attachedTo = atk;
  const foe = put(st, 'B.avatar', 'SD01-001');
  act(st, { type: 'declareAttack', atk, def: foe, by: 'A', seed: 3 });
  ok(st.log.some(l => (l.t || '').includes('POWER -1')), 'เนยถั่ว: คู่ต่อสู้ POWER -1');
}

console.log('ALL PROTECT TESTS PASSED');
