/* BT12: ทดสอบความสามารถการ์ดผ่าน applyAction — เล่นจริงตามลำดับเกม */
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

function run(title, fn) {
  try { fn(); } catch (e) { failures.push(title + ': ' + e.message); console.error('ERROR', title, e.stack.split('\n').slice(0, 3).join(' | ')); }
}

run('001 จอมมาร', () => {
  let st = fresh({ mainCount: { A: 1 } });
  fill(st, 'A', 5);
  const k = put(st, 'A.hand', 'BT12-001');
  let fx = use(st, k);
  ok(!fx.deny, '001 ใช้จากมือได้ใน Main แรก ' + fx.deny);
  ok(has(st, 'A.dark', k), '001 เนรเทศไปมิติมืด');
  ok(st.zones['A.hand'].length === 2, '001 จั่ว 2');
  st = fresh({ mainCount: { A: 3 } });
  const k2 = put(st, 'A.hand', 'BT12-001');
  ok(!!use(st, k2).deny, '001 ใช้หลัง Main แรกไม่ได้');
  st = fresh();
  const boss = put(st, 'A.dark', 'BT12-001');
  const army = [];
  for (let i = 0; i < 5; i++) army.push(put(st, 'A.dark', 'BT12-002'));
  const foe = vanilla(st, 'B.avatar');
  fx = use(st, boss);
  ok(!fx.deny && st.prompts[0] && st.prompts[0].dest === 'aimArmyReturn', '001 เปิดเลือกกองทัพจากมิติมืด ' + fx.deny);
  army.forEach(a => choose(st, a));
  ok(has(st, 'A.avatar', boss), '001 อัญเชิญลงสนาม');
  ok(P(st, boss) === 5, '001 POWER = 5 ได้ ' + P(st, boss));
  ok(st.zones['A.deck'].length === 5, '001 กองทัพกลับเข้าเด็ค');
  ok(st.prompts[0] && st.prompts[0].dest === 'hell', '001 ทุก 5 ใบส่งการ์ดลงนรก');
  choose(st, foe);
  ok(has(st, 'B.hell', foe), '001 ส่งศัตรูลงนรก');
  const g = put(st, 'A.avatar', 'BT12-002');
  ok(P(st, g) === 2, '001 กองทัพปีศาจ +1');
  // เริ่มเกม: เสนอจากเด็ค
  st = fresh({ phase: 'Draw', mainCount: {}, _mainPhaseSeq: 0 });
  const dk = put(st, 'A.deck', 'BT12-001');
  fill(st, 'A', 3);
  act(st, { type: 'setPhase', phase: 'Main', by: 'A' });
  ok(st.prompts[0] && st.prompts[0].ids && st.prompts[0].ids.includes(dk), '001 เสนอเนรเทศจากเด็คใน Main แรก');
  if (st.prompts[0]) { choose(st, dk); ok(has(st, 'A.dark', dk), '001 เนรเทศจากเด็ค'); }
});

run('002-004 กองทัพปีศาจ', () => {
  let st = fresh();
  const g = put(st, 'A.avatar', 'BT12-002');
  const man = vanilla(st, 'B.avatar', { symbol: 'คน', power: 3 });
  st.phase = 'Battle';
  let fx = act(st, { type: 'declareAttack', atk: g, def: man, by: 'A' });
  ok(!fx.deny, '002 ประกาศโจมตี ' + fx.deny);
  ok(has(st, 'B.hell', man) && has(st, 'A.avatar', g), '002 +3 ชนะ Avatar คน');
  st = fresh();
  put(st, 'A.dark', 'BT12-001');
  fill(st, 'A', 2);
  const g2 = put(st, 'A.avatar', 'BT12-002');
  const src = vanilla(st, 'B.avatar');
  act(st, { type: 'destroyCard', k: g2, by: 'A' });
  ok(has(st, 'A.dark', g2), '002 คำสั่งเสียเนรเทศตัวเอง');
  ok(st.zones['A.hand'].length === 1, '002 คำสั่งเสียจั่ว 1');
  st = fresh();
  const g3 = put(st, 'A.avatar', 'BT12-002');
  act(st, { type: 'destroyCard', k: g3, by: 'A' });
  ok(has(st, 'A.hell', g3), '002 ไม่มีจอมมาร ไม่เนรเทศ');

  st = fresh();
  const z = put(st, 'A.hell', 'BT12-003');
  ok(!!use(st, z).deny, '003 ไม่มีจอมมาร ใช้ไม่ได้');
  put(st, 'A.dark', 'BT12-001');
  const a1 = put(st, 'A.deck', 'BT12-002');
  fill(st, 'A', 3);
  const fx3 = use(st, z);
  ok(!fx3.deny && has(st, 'A.dark', z), '003 เนรเทศตัวเอง ' + fx3.deny);
  ok(st.prompts[0] && st.prompts[0].ids.includes(a1), '003 สอดแนม 4 ใบ');
  choose(st, a1);
  ok(has(st, 'A.hand', a1), '003 กองทัพขึ้นมือ');

  st = fresh();
  const ub = put(st, 'A.avatar', 'BT12-004');
  const ar = put(st, 'A.avatar', 'BT12-002');
  ok(P(st, ar) === 2, '004 กองทัพใบอื่น +1');
  ok(P(st, ub) === 5, '004 ไม่บวกตัวเอง');
  ok(BoT.hasKw(st, ar, 'โล่มนุษย์'), '004 กองทัพได้โล่มนุษย์');
  ok(!BoT.hasKw(st, ub, 'โล่มนุษย์'), '004 ตัวเองไม่ได้โล่มนุษย์');
});

run('005 ภาคีสะพานเหล็ก', () => {
  const st = fresh();
  const pay = put(st, 'A.hand', 'BT12-005');
  const rob = vanilla(st, 'A.hand', { symbol: 'หุ่นยนต์', cost: 3, color: '' });
  const fx = act(st, { type: 'summon', k: rob, to: 'A.avatar', payIds: [pay], by: 'A' });
  ok(!fx.deny, '005 จ่ายเป็น Cost ' + fx.deny);
  ok(BoT.hasKw(st, rob, 'โล่มนุษย์'), '005 หุ่นยนต์ได้โล่มนุษย์');
  ok(!BoT.hasKw(st, rob, 'แทงหลัง'), '005 ไม่ได้ keyword สัญลักษณ์อื่น');
});

run('006 นานาโฮชิ', () => {
  const st = fresh({ phase: 'Battle' });
  const n = put(st, 'A.avatar', 'BT12-006');
  vanilla(st, 'A.avatar', { symbol: 'คน' });
  ok(P(st, n) === 3, '006 POWER +1 ต่อ Symbol (ไซเบอร์ เทพ คน) ได้ ' + P(st, n));
  const d1 = put(st, 'A.hand', 'BT12-053');
  const d2 = put(st, 'A.hand', 'BT12-053');
  const weak = vanilla(st, 'B.avatar', { power: 2 });
  const strong = vanilla(st, 'B.avatar', { power: 9 });
  act(st, { type: 'declareAttack', atk: n, def: strong, by: 'A' });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseDiscard', '006 ถามทิ้งมือเมื่อโจมตี');
  choose(st, d1); choose(st, d2);
  ok(st.prompts[0] && st.prompts[0].dest === 'destroy', '006 เลือกทำลาย');
  const cands = BoT.promptCandidates(st, st.prompts[0]);
  ok(cands.includes(weak) && !cands.includes(strong), '006 เลือกได้เฉพาะ POWER ≤ ตัวเอง');
  choose(st, weak);
  ok(has(st, 'B.hell', weak), '006 ทำลายสำเร็จ');
  ok(BoT.cardSymbols(st, n).includes('เทพ'), '006 นับเป็นเทพ');
});

run('007 038 020 กุ่ย ฮอล นาย', () => {
  const st = fresh();
  const nai = put(st, 'A.hand', 'BT12-007');
  ok(BoT.effCost(st, nai) === 2, '007 Cost ปกติ 2');
  const kui = put(st, 'A.avatar', 'BT12-038');
  ok(BoT.effCost(st, nai) === 1, '007 มีกุ่ย Cost -1');
  const hol = put(st, 'A.avatar', 'BT12-020');
  ok(BoT.effCost(st, nai) === 0, '007 มีกุ่ยและฮอล Cost -2');
  ok(BoT.hasKw(st, kui, 'โล่มนุษย์'), '038 มีฮอลได้โล่มนุษย์');
  ok(P(st, kui) === 2, '038 ยังไม่มีนาย POWER 2');
  const n2 = put(st, 'A.avatar', 'BT12-007');
  ok(P(st, kui) === 4, '038 มีนาย +2');
  st.phase = 'Battle';
  const foe = vanilla(st, 'B.avatar', { power: 9 });
  act(st, { type: 'unity', k: hol, to: n2, by: 'A' });
  ok(P(st, hol) === 4, '020 ใช้สามัคคีแล้ว +2 ได้ ' + P(st, hol));
});

run('009 ซาร์อึก', () => {
  const st = fresh();
  const z = put(st, 'A.avatar', 'BT12-009');
  const d = put(st, 'A.hand', 'BT12-013');
  ok(BoT.effCost(st, d) === 4, '009 มังกรบนมือ Cost -1');
  const st2 = fresh();
  const zz = put(st2, 'A.hand', 'BT12-009');
  const dr = put(st2, 'A.hand', 'BT12-013');
  const fx = use(st2, zz);
  ok(!fx.deny && has(st2, 'A.hell', zz), '009 ทิ้งตัวเอง ' + fx.deny);
  ok(st2.prompts[0] && st2.prompts[0].dest === 'avatar', '009 เลือกมังกร');
  choose(st2, dr);
  ok(has(st2, 'A.avatar', dr), '009 อัญเชิญ Cost -6');
  const other = vanilla(st2, 'A.hand', { symbol: 'คน', cost: 0 });
  ok(!!act(st2, { type: 'summon', k: other, to: 'A.avatar', payIds: [], by: 'A' }).deny, '009 ล็อกอัญเชิญทั้งเกม');
  const d2 = put(st2, 'A.hand', 'BT12-053', { cost: 0 });
  ok(!act(st2, { type: 'summon', k: d2, to: 'A.avatar', payIds: [], by: 'A' }).deny, '009 ยังอัญเชิญมังกรได้');
});

run('010 เมอลิน', () => {
  const st = fresh();
  fill(st, 'A', 3);
  const m = put(st, 'A.avatar', 'BT12-010');
  const d = put(st, 'A.hand', 'BT12-053');
  const kn = vanilla(st, 'A.hell', { name: 'เซอร์ อัศวินโต๊ะกลม', cost: 3 });
  const fx = use(st, m);
  ok(!fx.deny, '010 สั่งใช้ ' + fx.deny);
  choose(st, d);
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode', '010 เลือกปฏิบัติ');
  mode(st, 0);
  ok(st.prompts[0] && st.prompts[0].dest === 'deck', '010 เลือกอัศวินจากนรก');
  choose(st, kn);
  ok(has(st, 'A.deck', kn) && st.zones['A.hand'].length === 1, '010 กลับเด็คแล้วจั่ว 1');
  ok(!!use(st, m).deny, '010 ใช้ซ้ำในเทิร์นไม่ได้');
});

run('011 074 กำเหลง เรือรบ', () => {
  const st = fresh();
  const g = put(st, 'A.avatar', 'BT12-011');
  ok(P(st, g) === 4, '011 ไม่มีเรือ POWER 4');
  const ship = put(st, 'A.construct', 'BT12-074');
  ok(P(st, g) === 6, '011 มีเรือ +2');
  ok(P(st, ship) === 3, '011 เรือรบ +1 ได้ ' + P(st, ship));
  const inHand = put(st, 'A.hand', 'BT12-011');
  ok(BoT.effCost(st, inHand) === 4, '011 Avatar Zone มีแต่ขุนพลแดง Cost -1');
  vanilla(st, 'A.avatar');
  ok(BoT.effCost(st, inHand) === 5, '011 มีใบอื่น Cost ปกติ');
  const low = put(st, 'A.deck', 'BT12-012');
  fill(st, 'A', 2);
  const fx = use(st, ship);
  ok(!fx.deny && st.prompts[0] && st.prompts[0].ids.includes(low), '074 สอดแนม ' + fx.deny);
  choose(st, low);
  ok(st.prompts[0] && st.prompts[0].kind === 'handOrSummon', '074 Cost ≤4 เลือกอัญเชิญได้');
});

run('013 028 041 052 มังกร', () => {
  let st = fresh();
  const i = put(st, 'A.avatar', 'BT12-013');
  const other = put(st, 'A.avatar', 'BT12-053');
  ok(P(st, other) === 9, '013 นรกมังกร <4 ไม่บวก');
  for (let n = 0; n < 4; n++) put(st, 'A.hell', 'BT12-053');
  ok(P(st, other) === 10, '013 นรกมังกร ≥4 +1');
  ok(P(st, i) === 6, '013 ไม่บวกตัวเอง');

  st = fresh();
  const a = put(st, 'A.avatar', 'BT12-028');
  ok(!!use(st, a).deny, '028 ไม่มีมังกรอื่นใช้ไม่ได้');
  put(st, 'A.avatar', 'BT12-053');
  const sv = vanilla(st, 'B.magic');
  const fx = use(st, a);
  ok(!fx.deny && st.inst[a].tapped, '028 จ่ายนอน ' + fx.deny);
  choose(st, sv);
  ok(has(st, 'B.hell', sv), '028 ทำลาย Avatar บน Magic Zone');
  ok(!st.inst[a].tapped, '028 ตื่นเมื่อ Avatar ใน Magic Zone ศัตรูถูกทำลาย');

  st = fresh();
  const dd = put(st, 'A.hand', 'BT12-041', { cost: 0 });
  const dh = put(st, 'A.hell', 'BT12-053');
  const foe = vanilla(st, 'B.avatar', { power: 3 });
  act(st, { type: 'summon', k: dd, to: 'A.avatar', payIds: [], by: 'A' });
  ok(st.prompts[0] && st.prompts[0].dest === 'hand', '041 จุติเลือกมังกรจากนรก');
  choose(st, dh);
  ok(has(st, 'A.hand', dh) && P(st, foe) === 2, '041 ศัตรูทุกใบ -1 ได้ ' + P(st, foe));

  st = fresh({ phase: 'Battle', active: 'B', turn: 4, turnSeq: 4 });
  const nm = put(st, 'A.avatar', 'BT12-052');
  const atk = vanilla(st, 'B.avatar');
  ok(!act(st, { type: 'declareAttack', atk, def: nm, by: 'B' }).deny, '052 ไม่มีมังกรอื่นถูกโจมตีได้');
  const st2 = fresh({ phase: 'Battle', active: 'B', turn: 4, turnSeq: 4 });
  const nm2 = put(st2, 'A.avatar', 'BT12-052');
  put(st2, 'A.avatar', 'BT12-053');
  const atk2 = vanilla(st2, 'B.avatar');
  ok(!!act(st2, { type: 'declareAttack', atk: atk2, def: nm2, by: 'B' }).deny, '052 มีมังกรอื่นถูกโจมตีไม่ได้');
});

run('014 068 ฮิมไลน์', () => {
  const st = fresh();
  fill(st, 'A', 3);
  const h = put(st, 'A.avatar', 'BT12-014');
  ok(P(st, h) === 2, '014 POWER 2');
  const tr = put(st, 'A.hell', 'BT12-068');
  st.inst[h].tapped = true;
  act(st, { type: 'destroyCard', k: h, by: 'A' });
  ok(has(st, 'A.avatar', h), '014 ไม่ถูกทำลาย');
  ok(!st.inst[h].tapped, '014 เปลี่ยนเป็นสภาพตื่น');
  choose(st, tr);
  ok(st.inst[tr].attachedTo === h, '014 สวมสมบัติจากนรก');
  ok(P(st, h) === 7, '014 POWER ตั้งต้น 7 ได้ ' + P(st, h));
  const devil = put(st, 'B.avatar', 'BT12-002', { power: 7 });
  const eff = BoT.effectOf('BT12-068', 'สมบัติศักดิ์สิทธิ์ แอสคาลอน');
  ok(eff.hostImmuneSymbol, '068 มีข้อมูลกันผลจากการ์ดนรก');
  act(st, { type: 'destroyCard', k: h, by: 'A' });
  ok(has(st, 'A.hell', h), '014 ทดแทนได้ครั้งเดียวต่อการอัญเชิญ');
  ok(has(st, 'A.deck', tr), '068 กลับเข้า Deck แทนการถูกทำลาย');
});

run('015 016 017 ปาร์ตี้ผู้กล้า', () => {
  let st = fresh();
  const mag = put(st, 'A.hand', 'BT12-056');
  const f = put(st, 'A.hand', 'BT12-015');
  const pay = [put(st, 'A.hand', 'BT12-005'), put(st, 'A.hand', 'BT12-005')];
  const foe = vanilla(st, 'B.avatar', { power: 5 });
  fill(st, 'A', 1);
  const m1 = put(st, 'A.deck', 'BT12-056');
  const p1 = put(st, 'A.deck', 'BT12-016');
  put(st, 'A.deck', 'BT12-053');
  const fx = act(st, { type: 'summon', k: f, to: 'A.avatar', payIds: pay, by: 'A' });
  ok(!fx.deny, '015 อัญเชิญ ' + fx.deny);
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseDiscard', '015 จุติทิ้ง Magic');
  choose(st, mag);
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseBuff' && st.prompts[0].amt === -2, '015 POWER -1 ต่อ Magic/ปาร์ตี้ ที่เจอ');
  choose(st, foe);
  ok(P(st, foe) === 3, '015 ลด POWER ศัตรู');
  ok(st.prompts[0] && st.prompts[0].kind === 'pick', '015 เลือกการ์ดจากสอดแนม');
  choose(st, p1);
  ok(has(st, 'A.hand', p1), '015 ปาร์ตี้ขึ้นมือ');

  st = fresh();
  const hit = put(st, 'A.avatar', 'BT12-016');
  const him = put(st, 'A.hell', 'BT12-014');
  const tr = put(st, 'A.deck', 'BT12-068');
  fill(st, 'A', 2);
  const fx2 = use(st, hit);
  ok(!fx2.deny && has(st, 'A.dark', hit), '016 เนรเทศตัวเอง ' + fx2.deny);
  choose(st, him);
  ok(has(st, 'A.avatar', him), '016 อัญเชิญฮิมไลน์');
  ok(st.prompts[0] && st.prompts[0].dest === 'attachToFixed', '016 เลือกสมบัติจาก Deck');
  choose(st, tr);
  ok(st.inst[tr].attachedTo === him, '016 สวมสมบัติ');

  // ทอยเต๋า: ลองทั้งคู่และคี่ด้วย seed หลายค่า
  const seen = {};
  for (let seed = 1; seed < 40 && Object.keys(seen).length < 2; seed++) {
    const s = fresh();
    const g = put(s, 'A.hand', 'BT12-017', { cost: 0 });
    put(s, 'A.avatar', 'BT12-015');
    const foe2 = vanilla(s, 'B.avatar', { power: 3 });
    fill(s, 'A', 2);
    BoT.applyAction(s, { type: 'summon', k: g, to: 'A.avatar', payIds: [], by: 'A', seed });
    const line = s.log.map(l => l.m || l.text || l.msg || JSON.stringify(l)).join('|');
    const even = /\(คู่\)/.test(line);
    seen[even ? 'even' : 'odd'] = true;
    if (even) ok(s.zones['A.hand'].length === 1, '017 คู่ มือศัตรูว่าง เราจั่ว 1');
    else {
      ok(s.prompts[0] && s.prompts[0].kind === 'chooseBuff', '017 คี่ เลือกลด POWER');
      if (s.prompts[0]) { choose(s, foe2); ok(P(s, foe2) === 2, '017 คี่ POWER -1'); }
    }
  }
  ok(seen.even && seen.odd, '017 ได้ทั้งคู่และคี่');
});

run('018 066 หน่วยรบ XVI', () => {
  const st = fresh({ phase: 'Battle', active: 'B', turn: 4, turnSeq: 4 });
  const unit = put(st, 'A.avatar', 'มิเรีย หน่วยรบ XVI');
  const atk = vanilla(st, 'B.avatar', { power: 9 });
  const op = put(st, 'A.hand', 'BT12-066');
  const mar = put(st, 'A.deck', 'BT12-018');
  fill(st, 'A', 2);
  act(st, { type: 'declareAttack', atk, def: unit, by: 'B' });
  const pr = st.prompts[0];
  ok(pr && pr.kind === 'react' && pr.options.includes(op), '066 เสนอ React เมื่อหน่วยรบต่อสู้ในเทิร์นศัตรู');
  if (!pr) return;
  const fx = act(st, { type: 'reactYes', k: op, by: 'A' });
  ok(!fx.deny, '066 ใช้ React ' + fx.deny);
  drain(st);
  const sc = st.prompts.find(p => p.dest === 'hell');
  ok(!!sc, '066 สอดแนม 3 ใบ');
  if (!sc) return;
  ok(sc.ids.length === 3, '066 ได้ 3 ใบ');
  st.prompts = [sc].concat(st.prompts.filter(p => p !== sc));
  choose(st, mar);
  ok(has(st, 'A.hand', mar), '066+018 มารินะถูกทิ้งแล้วขึ้นมือ');
  ok(has(st, 'B.hell', atk), '066 ทำลาย Avatar ที่ต่อสู้ด้วย');
});
run('018 มารินะ', () => {
  const st = fresh();
  const scoutK = put(st, 'A.avatar', 'คาร์ร่า หน่วยรบ XVI');
  const buddy = put(st, 'A.avatar', 'มิเรีย หน่วยรบ XVI');
  fill(st, 'A', 2);
  const mar = put(st, 'A.deck', 'BT12-018');
  const up = put(st, 'A.deck', 'ฮินะ หน่วยรบ XVI');
  put(st, 'A.deck', 'BT12-053');
  use(st, scoutK);
  ok(st.prompts[0] && st.prompts[0].restTo === 'hell', '018 การ์ดที่เหลือลงนรก');
  choose(st, up);
  ok(has(st, 'A.hand', mar), '018 ทิ้งจากสอดแนมแล้วขึ้นมือ');
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseBuff', '018 เลือกหน่วยรบ POWER +1');
});

run('019 มามิ', () => {
  const st = fresh();
  const ab = put(st, 'A.avatar', 'BT12-012');
  const mami = put(st, 'A.hand', 'BT12-019');
  put(st, 'A.hell', 'BT12-011');
  fill(st, 'A', 2);
  use(st, ab);
  choose(st, mami);
  ok(has(st, 'A.magic', mami), '019 ถูกทิ้งด้วยความสามารถ Avatar ไป Magic Zone');
  const two = put(st, 'A.avatar', 'BT12-006');
  const one = vanilla(st, 'A.avatar', { power: 3 });
  ok(P(st, one) === 3, '019 Symbol เดียวไม่บวก');
  ok(P(st, two) >= 1 && BoT.powerBreakdown(st, two).lines.some(l => /ออร่า/.test(l.label)), '019 2 Symbol ขึ้นไป +1');
});

run('021 022 023', () => {
  let st = fresh();
  const r = put(st, 'A.hell', 'BT12-021');
  const rat = vanilla(st, 'A.avatar', { symbol: 'รัททาทุย', power: 1 });
  const fx = use(st, r);
  ok(!fx.deny && has(st, 'A.dark', r), '021 เนรเทศจากนรก ' + fx.deny);
  choose(st, rat);
  ok(P(st, rat) === 2, '021 +1');

  st = fresh();
  const m = put(st, 'A.hand', 'BT12-022', { cost: 0 });
  const low = vanilla(st, 'B.hell', { cost: 1, name: 'ถูกสุด' });
  vanilla(st, 'B.hell', { cost: 4, name: 'แพง' });
  act(st, { type: 'summon', k: m, to: 'A.avatar', payIds: [], by: 'A' });
  ok(st.prompts[0] && st.prompts[0].dest === 'servantMagic' && st.prompts[0].ids.length === 1, '022 เลือกได้เฉพาะ Cost ต่ำสุด');
  choose(st, low);
  ok(has(st, 'A.magic', low) && st.inst[low].name === 'ข้ารับใช้ของ มนุษย์ดาว R18', '022 เปลี่ยนชื่อ');
  ok(BoT.cardSymbols(st, low).includes('เอเลี่ยน'), '022 เปลี่ยน Symbol');
  const pal = vanilla(st, 'A.avatar', { name: 'เพื่อน มนุษย์ดาว R18', power: 2 });
  ok(P(st, pal) === 3, '022 มนุษย์ดาว R18 ใบอื่น +1');

  st = fresh();
  const b = put(st, 'A.avatar', 'BT12-023');
  ok(!!use(st, b).deny, '023 นรกไม่มีปลาใช้ไม่ได้');
  const fish = vanilla(st, 'A.hell', { symbol: 'ปลา' });
  fill(st, 'A', 2);
  use(st, b);
  choose(st, fish);
  const d = st.zones['A.deck'];
  ok(d[d.length - 1] === fish, '023 ไว้บนสุด Deck');
});

run('024 025 ไดโนเสาร์', () => {
  let st = fresh();
  const dr = put(st, 'A.hand', 'BT12-024', { cost: 0 });
  const ex = vanilla(st, 'A.hell', { symbol: 'กะปอม', name: 'เนรเทศ' });
  const tg = vanilla(st, 'A.hell', { symbol: 'กะปอม', cost: 5, name: 'เป้า' });
  act(st, { type: 'summon', k: dr, to: 'A.avatar', payIds: [], by: 'A' });
  ok(st.prompts[0] && st.prompts[0].dest === 'exileHellCost', '024 จุติเนรเทศกะปอมจากนรก');
  choose(st, ex);
  ok(has(st, 'A.dark', ex), '024 เนรเทศแล้ว');
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode', '024 เลือกอัญเชิญปกติหรือจุติ');
  mode(st, 0);
  choose(st, tg);
  ok(has(st, 'A.avatar', tg), '024 อัญเชิญจากนรก');
  act(st, { type: 'destroyCard', k: tg, by: 'A' });
  ok(has(st, 'A.dark', tg), '024 ได้รับคำสั่งเสียเนรเทศตัวเอง');

  st = fresh();
  const scouter = vanilla(st, 'A.avatar', { symbol: 'กะปอม', code: 'BT12-035', name: 'หัวหน้า' });
  const rap = put(st, 'A.deck', 'BT12-025');
  fill(st, 'A', 3);
  st.zones['A.deck'] = st.zones['A.deck'].filter(x => x !== rap).concat([rap]);
  const hand = put(st, 'A.hand', 'BT12-035', { cost: 0, symbol: 'กะปอม' });
  act(st, { type: 'summon', k: hand, to: 'A.avatar', payIds: [], by: 'A' });
  ok(has(st, 'A.avatar', rap), '025 ถูกสอดแนมโดย Avatar กะปอมแล้วลงสนาม');
  ok(P(st, rap) === 5, '025 เทิร์นเรา +2 ได้ ' + P(st, rap));
});

run('026 027 วุยก๊ก', () => {
  let st = fresh();
  const joe = put(st, 'A.hand', 'BT12-026', { cost: 0 });
  const wei = vanilla(st, 'A.deck', { name: 'ทหารแห่งวุยก๊ก', type: 'Avatar' });
  fill(st, 'A', 2);
  act(st, { type: 'summon', k: joe, to: 'A.avatar', payIds: [], by: 'A' });
  ok(st.prompts[0] && st.prompts[0].dest === 'avatar', '026 สอดแนมอัญเชิญวุยก๊ก');
  ok(BoT.promptCandidates(st, st.prompts[0]).length === 0 || st.prompts[0].ids.length === 3, '026 สอดแนม 3 ใบ');

  st = fresh({ active: 'B', turn: 4, turnSeq: 4, phase: 'Main', _mainPhaseSeq: 4 });
  const j2 = put(st, 'A.avatar', 'BT12-026');
  const foe = vanilla(st, 'B.avatar');
  act(st, { type: 'setPhase', phase: 'Battle', by: 'B' });
  ok(st.prompts[0] && st.prompts[0].dest === 'forceAttack', '026 เริ่ม Battle ศัตรูเลือกบังคับโจมตี');
  if (st.prompts[0]) {
    choose(st, foe);
    ok(st.inst[foe].mustAttackSeq === 4, '026 ศัตรูต้องโจมตี');
    const fx = act(st, { type: 'endTurn', by: 'B' });
    ok(!!fx.deny, '026 จบเทิร์นไม่ได้ถ้ายังไม่โจมตี');
  }

  st = fresh();
  const pay = put(st, 'A.hand', 'BT12-027');
  const gen = put(st, 'A.hand', 'BT12-026', { cost: 1 });
  const ok2 = vanilla(st, 'A.deck', { name: 'ขุนพลทดสอบ', color: 'ฟ้า', symbol: 'ต่างชาติ' });
  fill(st, 'A', 1);
  st.zones['A.deck'] = st.zones['A.deck'].filter(x => x !== ok2).concat([ok2]);
  act(st, { type: 'summon', k: gen, to: 'A.avatar', payIds: [pay], by: 'A' });
  const pr = st.prompts.find(p => p.ids && p.ids.includes(ok2));
  ok(!!pr, '027 จ่ายเป็น Cost แล้วสอดแนม 2');
});

run('029 ปัณณ์', () => {
  const st = fresh();
  const land = put(st, 'land', 'โคกอีสานนูน', { controller: 'A' });
  const pan = put(st, 'A.hand', 'BT12-029', { cost: 0 });
  const back = put(st, 'A.hell', 'อีสานสลิงเกอร์ ปิ๊ก');
  fill(st, 'A', 5);
  act(st, { type: 'summon', k: pan, to: 'A.avatar', payIds: [], by: 'A' });
  ok(st.zones['A.deck'].length === 2, '029 ธรณีสูบ 3');
  ok(st.prompts[0] && st.prompts[0].dest, '029 เลือกกลับ Deck');
});

run('030-033 ผี', () => {
  let st = fresh();
  const t = put(st, 'A.avatar', 'BT12-030');
  ok(!!use(st, t).deny, '030 ไม่มีผีใบอื่นใช้ไม่ได้');
  vanilla(st, 'A.avatar', { symbol: 'ผี' });
  const mod = put(st, 'A.hell', 'BT12-070');
  const foe = vanilla(st, 'B.avatar', { symbol: 'คน' });
  const fx = use(st, t);
  ok(!fx.deny, '030 สั่งใช้ ' + fx.deny);
  ok(st.prompts.some(p => p.dest === 'setTempSymbol'), '030 เลือกเปลี่ยน Symbol ศัตรู');
  const stp = st.prompts.find(p => p.dest === 'setTempSymbol');
  st.prompts = [stp];
  choose(st, foe);
  ok(BoT.cardSymbols(st, foe).includes('ผี'), '030 Symbol เปลี่ยนเป็นผี');

  st = fresh();
  const n = put(st, 'A.avatar', 'BT12-031');
  vanilla(st, 'A.avatar', { symbol: 'ผี' });
  ok(P(st, n) === 4, '031 POWER ตั้งต้น = ผี 2 ใบ × 2 ได้ ' + P(st, n));
  ok(!!use(st, n).deny, '031 ผีไม่ถึง 3 ใช้ไม่ได้');
  vanilla(st, 'A.avatar', { symbol: 'ผี' });
  ok(P(st, n) === 6, '031 ผี 3 ใบ POWER 6');
  use(st, n);
  ok(P(st, n) === 3, '031 ลดครึ่ง ได้ ' + P(st, n));

  st = fresh({ phase: 'Battle' });
  const y = put(st, 'A.avatar', 'BT12-032');
  const ghost = vanilla(st, 'B.avatar', { symbol: 'ผี', power: 7 });
  act(st, { type: 'declareAttack', atk: y, def: ghost, by: 'A' });
  ok(has(st, 'B.hell', ghost), '032 สู้กับผี POWER เป็น 8 ชนะ');

  st = fresh();
  const f = put(st, 'A.hand', 'BT12-033', { cost: 0 });
  const l1 = vanilla(st, 'A.life', { faceUp: false, type: 'Life', name: 'L' });
  fill(st, 'A', 2);
  act(st, { type: 'summon', k: f, to: 'A.avatar', payIds: [], by: 'A' });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode', '033 ถามจ่าย');
  mode(st, 0);
  ok(st.inst[l1].faceUp && st.zones['A.hand'].length === 1, '033 หงาย LIFE แล้วจั่ว');
});

run('034 คาไม', () => {
  const st = fresh({ active: 'B', turn: 4, turnSeq: 4 });
  vanilla(st, 'A.avatar', { symbol: 'คน' });
  vanilla(st, 'A.avatar', { symbol: 'ปลา' });
  const k = put(st, 'A.hand', 'BT12-034');
  const d = put(st, 'A.hand', 'BT12-053');
  const foe = vanilla(st, 'B.avatar', { power: 5 });
  const mag = put(st, 'B.hand', 'BT12-060');
  const fx = act(st, { type: 'playMagic', k: mag, by: 'B' });
  ok(!fx.deny, '034 ศัตรูใช้ Magic ' + fx.deny);
  const pr = st.prompts[0];
  ok(pr && pr.dest === 'handReactSummon' && pr.ids.includes(k), '034 เสนออัญเชิญจากมือ');
  if (!pr) return;
  choose(st, k, 'A');
  ok(has(st, 'A.avatar', k), '034 อัญเชิญจากมือ');
  const dp = st.prompts.find(p => p.kind === 'chooseDiscard');
  ok(!!dp, '034 จุติทิ้งมือ');
  st.prompts = [dp].concat(st.prompts.filter(p => p !== dp));
  choose(st, d, 'A');
  const bp = st.prompts.find(p => p.kind === 'chooseBuff');
  ok(bp && bp.amt === -3, '034 POWER -1 ต่อ Symbol (ไซเบอร์ คน ปลา) ได้ ' + (bp || {}).amt);
});

run('035 036 044 สอดแนมขึ้นมือ', () => {
  let st = fresh();
  const h = put(st, 'A.hand', 'BT12-035', { cost: 0 });
  const t = vanilla(st, 'A.deck', { name: 'ผู้รู้ความจริง ทดสอบ' });
  fill(st, 'A', 1);
  st.zones['A.deck'] = st.zones['A.deck'].filter(x => x !== t).concat([t]);
  act(st, { type: 'summon', k: h, to: 'A.avatar', payIds: [], by: 'A' });
  choose(st, t);
  ok(has(st, 'A.hand', t), '035 ขึ้นมือ');
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseBuff', '035 เลือก Avatar +1');
  st = fresh();
  const one = put(st, 'A.avatar', 'BT12-036');
  ok(BoT.nameMatches(st.inst[one], 'ผู้รู้ความจริง'), '036 นับชื่อผู้รู้ความจริง');
  fill(st, 'A', 2);
  use(st, one);
  ok(st.prompts[0] && st.prompts[0].kind === 'peekTop', '036 เลือกบน/ล่าง');
  st = fresh();
  const b = put(st, 'A.hand', 'BT12-044', { cost: 0 });
  const tgt = put(st, 'A.deck', 'BT12-038');
  fill(st, 'A', 4);
  st.zones['A.deck'] = st.zones['A.deck'].filter(x => x !== tgt).concat([tgt]);
  act(st, { type: 'summon', k: b, to: 'A.avatar', payIds: [], by: 'A' });
  choose(st, tgt);
  ok(has(st, 'A.hand', tgt) && st.zones['A.deck'].length === 4, '044 ที่เหลือกลับ Deck');
});

run('037 บัซ', () => {
  const st = fresh();
  const b = put(st, 'A.avatar', 'BT12-037');
  ok(P(st, b) === 4, '037 ไม่มีอัศวินอื่น');
  vanilla(st, 'A.avatar', { name: 'เพื่อน อัศวินตลิ่งชัน' });
  ok(P(st, b) === 6, '037 มีอัศวินชื่ออื่น +2');
  st.active = 'B';
  ok(P(st, b) === 4, '037 เทิร์นศัตรูไม่บวก');
  st.active = 'A';
  const nut = put(st, 'A.avatar', 'เซอร์นัท');
  act(st, { type: 'destroyCard', k: b, by: 'A' });
  ok(st.prompts[0] && st.prompts[0].dest === 'attachTo', '037 คำสั่งเสียเลือกเซอร์นัท');
  choose(st, nut);
  ok(st.inst[b].attachedTo === nut, '037 สวมให้เซอร์นัท');
});

run('039 051 GEM จากนรก', () => {
  let st = fresh();
  put(st, 'A.avatar', 'BT12-039');
  const lb = vanilla(st, 'A.hand', { name: 'ลิโป้ ทดสอบ', symbol: 'ต่างชาติ', color: '', cost: 5 });
  const ex = vanilla(st, 'A.hell', { name: 'ใบนรก', effect: 'ขุนพล ทุกใบ', gem: 5 });
  const fx = act(st, { type: 'summon', k: lb, to: 'A.avatar', payIds: [], by: 'A' });
  ok(!fx.deny && has(st, 'A.avatar', lb), '039 เนรเทศนรกจ่าย GEM ' + fx.deny);
  ok(has(st, 'A.dark', ex), '039 เนรเทศการ์ดที่มีขุนพลใน Text Box');
  st = fresh();
  const lb2 = vanilla(st, 'A.hand', { name: 'คนอื่น', symbol: 'ต่างชาติ', color: '', cost: 5 });
  put(st, 'A.avatar', 'BT12-039');
  vanilla(st, 'A.hell', { effect: 'ขุนพล', gem: 5 });
  ok(!!act(st, { type: 'summon', k: lb2, to: 'A.avatar', payIds: [], by: 'A' }).deny, '039 ไม่ใช่ลิโป้ใช้ไม่ได้');
  st = fresh();
  const pay = put(st, 'A.hand', 'BT12-051');
  const gen = vanilla(st, 'A.hand', { name: 'ขุนพลใหญ่', symbol: 'ต่างชาติ', color: '', cost: 6 });
  const gh = vanilla(st, 'A.hell', { name: 'ขุนพลเขียว', symbol: 'ต่างชาติ', color: 'เขียว', gem: 2 });
  const fx2 = act(st, { type: 'summon', k: gen, to: 'A.avatar', payIds: [pay], by: 'A' });
  ok(!fx2.deny && has(st, 'A.dark', gh), '051 รวม GEM จากนรก ' + fx2.deny);
});

run('040 เซ็กเธาว์', () => {
  const st = fresh();
  const lb = vanilla(st, 'A.avatar', { name: 'ลิโป้', power: 5 });
  const h = put(st, 'A.hand', 'BT12-040');
  const fx = use(st, h);
  ok(!fx.deny, '040 ใช้จากมือ ' + fx.deny);
  choose(st, lb);
  ok(st.inst[h].attachedTo === lb, '040 สวมให้ลิโป้');
  ok(P(st, lb) === 6, '040 ลิโป้ +1 ได้ ' + P(st, lb));
  st.buffs.push({ k: lb, amt: -3, until: 'endOfTurn' });
  ok(P(st, lb) === 6, '040 ไม่รับผลลด POWER');
  const st2 = fresh();
  const kw = vanilla(st2, 'A.avatar', { name: 'กวนอู', power: 4 });
  vanilla(st2, 'A.avatar', { name: 'เตียวหุย จ๊กก๊ก' });
  const h2 = put(st2, 'A.hand', 'BT12-040');
  use(st2, h2);
  choose(st2, kw);
  ok(P(st2, kw) === 5, '040 กวนอู +1 ต่อจ๊กก๊กใบอื่น ได้ ' + P(st2, kw));
});

run('042 เกดุ', () => {
  const st = fresh({ phase: 'Battle' });
  const g = put(st, 'A.avatar', 'BT12-042');
  const foe = vanilla(st, 'B.avatar', { power: 1 });
  ok(!!act(st, { type: 'declareAttack', atk: g, def: foe, by: 'A' }).deny, '042 ไม่มีหนึ่งเดียวโจมตีไม่ได้');
  st.buffs.push({ k: g, amt: 5, until: 'endOfTurn' });
  ok(P(st, g) === 1, '042 ไม่รับการเพิ่ม POWER');
  const one = put(st, 'A.magic', 'หนึ่งเดียวเพื่อทุกอย่าง', { attachedTo: g });
  ok(P(st, g) === 2, '042 รับ POWER จากหนึ่งเดียว');
  const l = [0, 1, 2].map(i => vanilla(st, 'B.life', { type: 'Life', faceUp: false, name: 'L' + i }));
  const fx = act(st, { type: 'declareAttack', atk: g, def: foe, by: 'A' });
  ok(!fx.deny, '042 โจมตี ' + fx.deny);
  if (st.pending) act(st, { type: 'resolveAttack', by: 'A' });
  ok(has(st, 'B.hell', foe), '042 ทำลายศัตรู');
  ok(has(st, 'A.dark', one), '042 เนรเทศหนึ่งเดียว');
  ok(l.every(x => st.inst[x].faceUp), '042 ทำความเสียหาย LIFE 3 ครั้ง');
});

run('043 แอมเฟสต้า', () => {
  const st = fresh({ phase: 'Battle' });
  const a = put(st, 'A.avatar', 'BT12-043');
  const o = vanilla(st, 'A.avatar', { name: 'Overdose ทดสอบ', power: 2 });
  ok(P(st, o) === 2, '043 ยังไม่ Overdose ไม่บวก');
  [0, 1, 2].forEach(i => vanilla(st, 'A.life', { type: 'Life', faceUp: true, name: 'L' + i }));
  ok(BoT.inOverdose(st, a), '043 LIFE หงาย 3 ใบเข้า Overdose');
  ok(P(st, o) === 3, '043 Overdose ใบอื่น +1');
  const foe = vanilla(st, 'B.avatar', { power: 1 });
  act(st, { type: 'declareAttack', atk: o, def: foe, by: 'A' });
  ok(!st.inst[o].tapped, '043 Overdose ชื่ออื่นตื่นเมื่อนอน');
});

run('045 บันบัน', () => {
  const st = fresh();
  const b = put(st, 'A.hand', 'BT12-045', { cost: 0 });
  act(st, { type: 'summon', k: b, to: 'A.avatar', payIds: [], by: 'A' });
  const tok = st.zones['A.avatar'].find(id => st.inst[id].isToken);
  ok(tok && st.inst[tok].name === 'สัตว์ในตำนาน' && P(st, tok) === 2 && st.inst[tok].cost === 2, '045 Token C2 G0 P2');
  ['คน', 'ปลา'].forEach(s => vanilla(st, 'A.avatar', { symbol: s }));
  st.phase = 'Battle';
  const l = [0, 1, 2].map(i => vanilla(st, 'B.life', { type: 'Life', faceUp: false, name: 'L' + i }));
  act(st, { type: 'declareAttack', atk: b, life: l[0], by: 'A' });
  if (st.pending) act(st, { type: 'resolveAttack', by: 'A' });
  ok(st.inst[l[0]].faceUp && st.inst[l[1]].faceUp && !st.inst[l[2]].faceUp, '045 Symbol 5 ขึ้นไป LIFE 2 ใบ');
});

run('046 047 ภาคีมะม่วง', () => {
  let st = fresh();
  const s = put(st, 'A.hand', 'BT12-046', { cost: 0 });
  const tree = put(st, 'A.hell', 'ต้นมะม่วง');
  act(st, { type: 'summon', k: s, to: 'A.avatar', payIds: [], by: 'A' });
  choose(st, tree);
  ok(has(st, 'A.avatar', tree), '046 อัญเชิญต้นมะม่วง');
  const base = +st.inst[tree].power;
  ok(P(st, tree) === base + 2, '046 POWER +2');
  const foe = vanilla(st, 'B.avatar');
  act(st, { type: 'destroyCard', k: s, by: 'B' });
  ok(has(st, 'A.magic', s) || has(st, 'A.hell', s), '046 ถูกทำลาย');

  st = fresh({ phase: 'Battle' });
  const q = put(st, 'A.avatar', 'BT12-047');
  put(st, 'A.magic', 'ต้นมะม่วง');
  const f = vanilla(st, 'B.avatar', { power: 1 });
  act(st, { type: 'declareAttack', atk: q, def: f, by: 'A' });
  ok(!st.inst[q].tapped, '047 โจมตีแล้วตื่น');
});

run('048 049 ขวัญตา', () => {
  let st = fresh();
  const trav = put(st, 'A.avatar', 'นักท่องเรื่องราว ขวัญตา');
  const ev = put(st, 'A.hand', 'BT12-048');
  fill(st, 'A', 4);
  use(st, trav);
  choose(st, ev);
  ok(has(st, 'A.avatar', ev), '048 อัญเชิญด้วยนักท่องเรื่องราว');
  ok(st.inst[ev].saveByMill === true, '048 ได้ความสามารถกันทำลาย');
  const m1 = put(st, 'A.deck', 'BT12-056');
  const m2 = put(st, 'A.deck', 'BT12-056');
  act(st, { type: 'destroyCard', k: ev, by: 'A' });
  ok(has(st, 'A.avatar', ev), '048 ธรณีสูบ Magic 2 ใบไม่ถูกทำลาย');
  ok(has(st, 'A.hell', m1) && has(st, 'A.hell', m2), '048 ธรณีสูบ 2 ใบ');

  st = fresh();
  const trav2 = put(st, 'A.avatar', 'นักท่องเรื่องราว ขวัญตา');
  const ev2 = put(st, 'A.hand', 'BT12-049');
  use(st, trav2);
  choose(st, ev2);
  const blank = vanilla(st, 'B.avatar', { power: 3, effect: '' });
  ok(P(st, blank) === 3, '049 นรกไม่มี Magic ไม่ลด');
  [0, 1].forEach(() => put(st, 'A.hell', 'BT12-056'));
  ok(P(st, blank) === 2, '049 Magic ทุก 2 ใบ -1 ได้ ' + P(st, blank));
});

run('050 054', () => {
  const st = fresh();
  const h = put(st, 'A.hand', 'BT12-050', { cost: 0 });
  const liu = vanilla(st, 'A.hell', { name: 'เล่าปี่ ทดสอบ', symbol: 'ต่างชาติ' });
  act(st, { type: 'summon', k: h, to: 'A.avatar', payIds: [], by: 'A' });
  choose(st, liu);
  ok(has(st, 'A.avatar', liu), '050 อัญเชิญเล่าปี่');
  ok(P(st, h) === 3, '050 POWER ปกติ 3');
  [0, 1, 2].forEach(i => vanilla(st, 'A.avatar', { name: 'ขุนพลเขียว' + i, color: 'เขียว', symbol: 'ต่างชาติ' }));
  ok(P(st, h) === 5, '050 ขุนพลเขียว 3 ใบ POWER 5 ได้ ' + P(st, h));
  const m = put(st, 'A.avatar', 'BT12-054');
  ok(BoT.nameMatches(st.inst[m], 'หมา') && BoT.nameMatches(st.inst[m], 'กบ'), '054 นับชื่อหมาและกบ');
});

run('055-063 Magic', () => {
  let st = fresh();
  fill(st, 'A', 3);
  const m = put(st, 'A.hand', 'BT12-055');
  const pay = [put(st, 'A.hand', 'BT12-053', { gem: 3 })];
  const gen = vanilla(st, 'A.hand', { name: 'ขุนพลใหญ่', color: 'แดง', ex: 'Only #1' });
  const adv = vanilla(st, 'A.deck', { name: 'กุนซือแดง', color: 'แดง' });
  vanilla(st, 'A.deck', { name: 'กุนซือฟ้า', color: 'ฟ้า' });
  let fx = playM(st, m, 'A');
  ok(!fx.deny, '055 ใช้ Magic ' + fx.deny);
  ok(st.prompts[0] && st.prompts[0].dest === 'revealGeneral', '055 เลือกขุนพล Only');
  choose(st, gen);
  ok(st.prompts[0] && BoT.promptCandidates(st, st.prompts[0]).length === 1, '055 กุนซือสีเดียวกันเท่านั้น');
  choose(st, adv);
  ok(has(st, 'A.avatar', adv) && BoT.nameMatches(st.inst[adv], 'ขุนพล'), '055 อัญเชิญและได้ชื่อขุนพล');

  st = fresh({ turn: 1, turnSeq: 1 });
  const n = put(st, 'A.hand', 'BT12-056');
  put(st, 'A.hand', 'BT12-053', { gem: 3 });
  ok(!!playM(st, n, 'A').deny, '056 เทิร์นแรกของเกมใช้ไม่ได้');
  st = fresh();
  const n2 = put(st, 'A.hand', 'BT12-056');
  const a1 = put(st, 'A.hand', 'BT12-053');
  const a2 = put(st, 'A.hand', 'BT12-053');
  const b1 = put(st, 'B.hand', 'BT12-053');
  fill(st, 'A', 3); fill(st, 'B', 3);
  fx = playM(st, n2, 'A');
  ok(!fx.deny, '056 ใช้ ' + fx.deny);
  ok(has(st, 'A.hell', a1) && has(st, 'A.hell', a2) && has(st, 'B.hell', b1), '056 ทุกคนทิ้งมือ');
  ok(st.zones['A.hand'].length === 2 && st.zones['B.hand'].length === 1, '056 จั่วตามจำนวนที่ทิ้ง');

  st = fresh();
  const inv = put(st, 'A.hand', 'BT12-057');
  const ar = [put(st, 'A.dark', 'BT12-002'), put(st, 'A.dark', 'BT12-003')];
  fx = playM(st, inv, 'A');
  ok(!fx.deny, '057 ใช้ ' + fx.deny);
  mode(st, 0);
  choose(st, ar[0]);
  ok(has(st, 'A.avatar', ar[0]), '057 อัญเชิญใบแรก');
  ok(st.prompts[0], '057 อัญเชิญเพิ่มได้');
  if (st.prompts[0]) choose(st, ar[1]);
  ok(has(st, 'A.avatar', ar[1]), '057 อัญเชิญใบที่ 2');
  ok(st.scheduled.filter(s => s.op === 'destroyCard').length === 2, '057 นัดทำลายตอน End Phase');

  st = fresh();
  const nm = put(st, 'A.hand', 'BT12-058');
  const p58 = put(st, 'A.hand', 'BT12-053', { gem: 2 });
  const hellA = vanilla(st, 'A.hell', { symbol: 'ปลา' });
  const mine = vanilla(st, 'A.avatar', { symbol: 'คน' });
  playM(st, nm, 'A');
  choose(st, hellA); choose(st, mine);
  ok(BoT.cardSymbols(st, mine).includes('ปลา') && BoT.cardSymbols(st, mine).includes('คน'), '058 ได้ Symbol เพิ่ม');

  st = fresh();
  const blk = put(st, 'A.hand', 'BT12-059');
  ok(!!playM(st, blk, 'A').deny, '059 จอมเวทย์ไม่ถึง 3 ใช้ไม่ได้');
  [0, 1, 2].forEach(i => vanilla(st, 'A.avatar', { name: 'จอมเวทย์' + i }));
  const fx59 = playM(st, blk, 'A');
  ok(!fx59.deny && st.reactBlockedFor && st.reactBlockedFor.p === 'B', '059 ฝ่ายตรงข้ามใช้ React ไม่ได้ ' + fx59.deny);

  st = fresh({ phase: 'Main' });
  const eye = put(st, 'A.hand', 'BT12-060');
  const p60 = put(st, 'A.hand', 'BT12-053', { gem: 2 });
  const mine2 = vanilla(st, 'A.avatar', { power: 3 });
  playM(st, eye, 'A');
  choose(st, mine2);
  ok(P(st, mine2) === 5, '060 +2');
  const f1 = vanilla(st, 'B.avatar', { power: 1 });
  const f2 = vanilla(st, 'B.avatar', { power: 9 });
  st.phase = 'Battle';
  act(st, { type: 'declareAttack', atk: mine2, def: f1, by: 'A' });
  const rp = st.prompts.find(p => p.dest === 'retargetAttack');
  ok(rp && rp.chooser === 'B', '060 ฝ่ายตรงข้ามเลือกเป้าหมาย');
  if (rp) { st.prompts = [rp]; choose(st, f2, 'B'); ok(st.pending && st.pending.def === f2, '060 เปลี่ยนเป้าตามที่เลือก'); }

  st = fresh();
  const dr = put(st, 'A.hand', 'BT12-062');
  const p62 = put(st, 'A.hand', 'BT12-053', { gem: 2 });
  const dgn = put(st, 'A.avatar', 'BT12-013');
  playM(st, dr, 'A');
  choose(st, dgn);
  ok(P(st, dgn) === 8 && st.buffs.some(b => b.k === dgn && b.until === 'nextOwnDraw'), '062 +2 จนถึง Draw ถัดไป');

  st = fresh();
  const w = put(st, 'A.hand', 'BT12-063');
  const p63 = put(st, 'A.hand', 'BT12-053', { gem: 2 });
  const toss = put(st, 'A.hand', 'BT12-053');
  const modD = put(st, 'A.deck', 'BT12-070');
  const onlyM = put(st, 'A.deck', 'BT12-070', { ex: 'Only #1' });
  fx = playM(st, w, 'A');
  ok(!fx.deny, '063 ใช้ ' + fx.deny);
  if (st.prompts[0] && st.prompts[0].kind === 'chooseDiscard') choose(st, toss);
  drain(st);
  const c63 = st.prompts[0] ? BoT.promptCandidates(st, st.prompts[0]) : [];
  ok(c63.includes(modD) && !c63.includes(onlyM), '063 Mod ที่ไม่ใช่ Only เท่านั้น');
});

run('061 ฉิบหายการช่าง', () => {
  const st = fresh();
  const m = put(st, 'A.hand', 'BT12-061');
  const p = put(st, 'A.hand', 'BT12-053', { gem: 1, gemColor: '' });
  const e1 = vanilla(st, 'A.deck', { name: 'เครื่องใช้ไฟฟ้า ก' });
  const e2 = vanilla(st, 'A.deck', { name: 'เครื่องใช้ไฟฟ้า ก' });
  const e3 = vanilla(st, 'A.deck', { name: 'เครื่องใช้ไฟฟ้า ข' });
  playM(st, m, 'A');
  mode(st, 0);
  choose(st, e1);
  ok(has(st, 'A.magic', e1), '061 วางบน Magic Zone');
  const c = st.prompts[0] ? BoT.promptCandidates(st, st.prompts[0]) : [];
  ok(c.includes(e3) && !c.includes(e2), '061 ใบที่ 2 ต้องชื่อต่างกัน');
});

run('064 065 067 React', () => {
  let st = fresh({ phase: 'Battle', active: 'B', turn: 4, turnSeq: 4 });
  const story = vanilla(st, 'A.avatar', { name: 'ใคร เรื่องราว', tapped: true });
  const him = put(st, 'A.avatar', 'BT12-014');
  const tr = put(st, 'A.magic', 'BT12-068', { attachedTo: him });
  const bait = vanilla(st, 'A.avatar', { power: 1 });
  const r = put(st, 'A.hand', 'BT12-065');
  const atk = vanilla(st, 'B.avatar', { power: 2 });
  act(st, { type: 'declareAttack', atk, def: bait, by: 'B' });
  const pr = st.prompts.find(p => p.kind === 'react' && (p.options || []).includes(r));
  const opts = BoT.attackReactOptions(st, 'A');
  ok(!!pr || opts.includes(r), '065 เสนอ React ตอนถูกโจมตี');
  const fx = pr ? act(st, { type: 'reactYes', k: r, by: 'A' }) : playM(st, r, 'A');
  ok(!fx.deny, '065 ใช้ ' + fx.deny);
  drain(st);
  const rp = st.prompts.find(p => p.dest === 'returnModRedirect');
  ok(!!rp, '065 เลือกใบสวมของฮิมไลน์');
  if (rp) {
    st.prompts = [rp];
    choose(st, tr);
    ok(has(st, 'A.deck', tr), '065 ใบสวมกลับใต้ Deck');
    ok(st.pending && st.pending.def === him, '065 เปลี่ยนเป้ามาที่ฮิมไลน์');
  }
  st = fresh();
  fill(st, 'A', 3); fill(st, 'B', 3);
  const hand = put(st, 'B.hand', 'BT12-067');
  const mine = put(st, 'A.avatar', 'BT12-036');
  const search = put(st, 'A.hand', 'BT12-063');
  const paySearch = put(st, 'A.hand', 'BT12-053', { gem: 2 });
  const toss = put(st, 'A.hand', 'BT12-053');
  const modD = put(st, 'A.deck', 'BT12-070');
  playM(st, search, 'A');
  if (st.prompts[0] && st.prompts[0].kind === 'chooseDiscard') choose(st, toss);
  drain(st);
  choose(st, modD);
  const r67 = st.prompts.find(p => p.kind === 'react' && p.reactTrigger === 'enemyDrawFromDeckByEffect');
  ok(!!r67, '067 เสนอ React เมื่อศัตรูค้น Deck ขึ้นมือ');
  if (r67) {
    st.prompts = [r67];
    const f = act(st, { type: 'reactYes', k: hand, by: 'B' });
    ok(!f.deny, '067 ใช้ ' + f.deny);
    drain(st);
    ok(st.zones['A.dark'].length === 1, '067 สุ่มเนรเทศมือศัตรู');
  }
});

run('069 070 Mod', () => {
  let st = fresh();
  const t = vanilla(st, 'A.avatar', { name: 'รถถัง ทดสอบ', symbol: 'หุ่นยนต์', power: 3 });
  const nt = vanilla(st, 'A.avatar', { name: 'ไม่ใช่', symbol: 'หุ่นยนต์', power: 3 });
  const chip = put(st, 'A.magic', 'BT12-069', { attachedTo: t });
  ok(P(st, t) === 5, '069 +2 ได้ ' + P(st, t));
  ok(!!BoT.attachOnlyDeny(st, 'BT12-069', nt, 'ชิป Tank Ranger A.I.'), '069 สวมได้เฉพาะรถถัง');
  ok(!BoT.attachOnlyDeny(st, 'BT12-069', t, 'ชิป Tank Ranger A.I.'), '069 สวมรถถังได้');
  st = fresh({ phase: 'Draw', _mainPhaseSeq: 0 });
  const p = vanilla(st, 'A.avatar', { name: 'เพมมุ ยอดมนุษย์' });
  const sh = put(st, 'A.magic', 'BT12-070', { attachedTo: p });
  const l1 = vanilla(st, 'A.life', { type: 'Life', faceUp: false, name: 'L' });
  act(st, { type: 'setPhase', phase: 'Main', by: 'A' });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode', '070 เริ่ม Main ต้องเลือก');
  mode(st, 0);
  ok(st.inst[l1].faceUp, '070 หงาย LIFE');
  act(st, { type: 'destroyCard', k: p, by: 'A' });
  ok(has(st, 'A.avatar', p) && has(st, 'A.hell', sh), '070 ทำลายใบนี้แทน');
});

run('071-075 Land Construct', () => {
  let st = fresh();
  const g = vanilla(st, 'A.avatar', { symbol: 'ผี', power: 3 });
  const m = vanilla(st, 'B.avatar', { symbol: 'คน', power: 3 });
  put(st, 'land', 'BT12-071', { controller: 'A' });
  ok(P(st, g) === 4 && P(st, m) === 2, '071 ผี +1 คน -1');
  st = fresh();
  const d = vanilla(st, 'A.avatar', { symbol: 'มังกร', power: 3 });
  const t2 = vanilla(st, 'B.avatar', { symbol: 'ต้นไม้', power: 3 });
  const x = vanilla(st, 'A.avatar', { symbol: 'คน', power: 3 });
  put(st, 'land', 'BT12-072', { controller: 'A' });
  ok(P(st, d) === 4 && P(st, t2) === 4 && P(st, x) === 3, '072 มังกร ต้นไม้ สัตว์วิเศษ +1');
  st = fresh();
  const land = put(st, 'land', 'BT12-073', { controller: 'A' });
  const k = vanilla(st, 'A.deck', { name: 'เซอร์ อัศวินโต๊ะกลม', cost: 5 });
  const fx = use(st, land);
  ok(!fx.deny, '073 สั่งใช้ ' + fx.deny);
  ok(st.prompts[0], '073 เปิดให้เลือก');
  if (st.prompts[0]) { choose(st, k); ok(has(st, 'A.avatar', k), '073 อัญเชิญ'); }
  st = fresh();
  const tb = put(st, 'A.construct', 'BT12-075');
  const ks = [0, 1, 2].map(i => vanilla(st, 'A.avatar', { name: 'อัศวินโต๊ะกลม' + i, power: 2 }));
  ok(P(st, ks[0]) === 2, '075 ยังไม่ครบ 4 ไม่บวก');
  const mer = put(st, 'A.avatar', 'BT12-010');
  ok(P(st, ks[0]) === 3, '075 ครบ 4 +1 ได้ ' + P(st, ks[0]));
});

run('049 เมื่อต่อสู้ ทั้งโจมตีและตั้งรับ', () => {
  const setup = () => {
    const st = fresh();
    fill(st, 'A', 3); fill(st, 'B', 3);
    const trav = put(st, 'A.avatar', 'นักท่องเรื่องราว ขวัญตา');
    const ev = put(st, 'A.hand', 'BT12-049');
    use(st, trav); choose(st, ev);
    st.phase = 'Battle';
    return { st, ev };
  };
  let { st, ev } = setup();
  const l = vanilla(st, 'A.life', { type: 'Life', faceUp: false, name: 'L' });
  const foe = vanilla(st, 'B.avatar', { power: 1, effect: 'มีข้อความ' });
  act(st, { type: 'declareAttack', atk: ev, def: foe, by: 'A' });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode' && st.prompts[0].chooser === 'A', '049 ถามเมื่อโจมตี');
  mode(st, 0);
  ok(st.inst[l].faceUp, '049 ทำความเสียหาย LIFE เรา');
  choose(st, foe);
  ok(st.inst[foe].nullifyUntilEOT, '049 ศัตรูสูญเสียความสามารถ');

  ({ st, ev } = setup());
  const lf = vanilla(st, 'B.life', { type: 'Life', faceUp: false, name: 'LB' });
  act(st, { type: 'declareAttack', atk: ev, life: lf, by: 'A' });
  ok(!(st.prompts[0] && st.prompts[0].kind === 'chooseMode'), '049 โจมตี LIFE ไม่ใช่การต่อสู้ ไม่ถาม');

  ({ st, ev } = setup());
  st.active = 'B'; st.turn = 4; st.turnSeq = 4;
  const l2 = vanilla(st, 'A.life', { type: 'Life', faceUp: false, name: 'L' });
  const atk = vanilla(st, 'B.avatar', { power: 1, effect: 'มีข้อความ' });
  act(st, { type: 'declareAttack', atk, def: ev, by: 'B' });
  const mp = st.prompts.find(p => p.kind === 'chooseMode');
  ok(mp && mp.chooser === 'A', '049 ถามเมื่อตั้งรับ');
  if (mp) {
    st.prompts = [mp].concat(st.prompts.filter(p => p !== mp));
    mode(st, 0);
    ok(st.inst[l2].faceUp, '049 ตั้งรับ ทำความเสียหาย LIFE เรา');
    const np = st.prompts.find(p => p.dest === 'nullifyTarget');
    ok(!!np, '049 ตั้งรับ เลือกศัตรู');
    if (np) { st.prompts = [np]; choose(st, atk, 'A'); ok(st.inst[atk].nullifyUntilEOT, '049 ตั้งรับ ศัตรูสูญเสียความสามารถ'); }
  }
});

run('BT08-025 ปิ่น + 029 ปัณณ์', () => {
  let st = fresh({ phase: 'Battle' });
  fill(st, 'A', 5);
  const pin = put(st, 'A.avatar', 'BT08-025');
  const foe = vanilla(st, 'B.avatar', { power: 9 });
  act(st, { type: 'declareAttack', atk: pin, def: foe, by: 'A' });
  ok(!(st.prompts[0] && st.prompts[0].kind === 'chooseMode'), 'ปิ่น ไม่มีโคกอีสานนูน ไม่ถาม');

  st = fresh({ phase: 'Battle' });
  fill(st, 'A', 5);
  put(st, 'land', 'โคกอีสานนูน', { controller: 'A' });
  const pin2 = put(st, 'A.avatar', 'BT08-025');
  const pan = put(st, 'A.avatar', 'BT12-029');
  const foe2 = vanilla(st, 'B.avatar', { power: 9 });
  const foe3 = vanilla(st, 'B.avatar', { power: 1 });
  const l2 = vanilla(st, 'B.life', { type: 'Life', faceUp: false, name: 'L' });
  st.phase = 'Main';
  const fxp = act(st, { type: 'pair', k: pan, to: pin2, by: 'A' });
  st.phase = 'Battle';
  ok(!fxp.deny, 'ปัณณ์ จับคู่ Link กับปิ่น ' + fxp.deny);
  ok(BoT.inLinkStatus(st, pan), 'ปัณณ์ อยู่ในสถานะ Link');
  act(st, { type: 'declareAttack', atk: pin2, def: foe2, by: 'A' });
  ok(st.prompts[0] && st.prompts[0].kind === 'chooseMode', 'ปิ่น ถามย้ายเป้า');
  mode(st, 0);
  ok(st.zones['A.deck'].length === 2, 'ปิ่น ธรณีสูบ 3');
  ok(st.pending && st.pending.life === l2 && !st.pending.def, 'ปิ่น ย้ายเป้าไป LIFE');
  const dp = st.prompts.find(p => p.kind === 'chooseDestroy');
  ok(!!dp, 'ปัณณ์ ถูกเปลี่ยนเป้าแล้วทำลายการ์ดศัตรู');
  if (dp) { st.prompts = [dp]; choose(st, foe3, 'A'); ok(has(st, 'B.hell', foe3), 'ปัณณ์ ทำลายสำเร็จ'); }
  st.prompts = [];
  act(st, { type: 'resolveAttack', by: 'B' });
  ok(st.inst[l2].faceUp && has(st, 'A.avatar', pin2), 'ปิ่น โจมตีเข้า LIFE สำเร็จ');
});

run('รีปริ้นต์ที่เพิ่ม', () => {
  [['PRMO-141', 'BT09-060'], ['PRMO-142', 'BT09-039'], ['PRMO-143', 'BT08-016'], ['PRMO-151', 'BT08-041'], ['PRMO-154-A', 'SD09-003'], ['PRMO-154-B', 'SD09-003'],
    ['PRMO-155', 'BT02-060'], ['PRMO-156', 'BT10-057'], ['PRMO-148', 'CC02-017'], ['STOR-001', 'SD02-005'], ['APFD-002', 'SD05-020']].forEach(([n, o]) => {
    const cn = byCode(n), co = byCode(o);
    ok(!!cn, n + ' อยู่ในฐานการ์ด');
    if (!cn) return;
    ok(JSON.stringify(BoT.effectOf(n, cn.name).abilities) === JSON.stringify(BoT.effectOf(o, co.name).abilities), n + ' ความสามารถเท่าใบเดิม');
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
