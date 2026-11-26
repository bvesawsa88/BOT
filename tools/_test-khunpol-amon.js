/* focused: เด็คขุนพล (แข่วร้านละใบ) + อาม่อน No.7 (เด็คไวรัส)
   - CC02-013 ตั๋งโต๊ะ: จุติ ขุนพลม่วงต่างชาติจากนรกขึ้นมือ Cost −3 · Avatar ศัตรูเปลี่ยนสภาพในเทิร์นเรา → จั่ว 1
   - CC02-012 เตียวเสียน: มีขุนพลม่วงต่างชาติ → ไม่ถูกโจมตี · สั่งใช้: Avatar ศัตรูตื่นทั้งหมด
   - BT10-037 ตันก๋ง: Link ลิโป้ → ลิโป้โจมตีทำลายสำเร็จ หงาย LIFE ศัตรู 1 ใบ
   - PRMO-096 ลิโป้: ศัตรูต้องใช้โล่มนุษย์ · การโจมตีถูกเปลี่ยนเป้า → ทำลาย Avatar ศัตรูได้ 1 ใบ
   - PRMO-091 กวนอู: ศัตรูเลือกเป้าความสามารถไปที่ขุนพลต่างชาติใบอื่นไม่ได้
   - PRMO-129 ปลอกคอซื่อสัตย์: ใบสวมกันเปลี่ยนการควบคุม (ไม่มี op ตาย)
   - BT06-030 อาม่อน No.7: ถูกธรณีสูบ → อัญเชิญลงสนาม · ถูกทำลายจาก Avatar Zone → ใต้สุด Deck แทนนรก */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState(extra) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  return Object.assign({
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 4, turnSeq: 4,
    strict: true, firstPlayer: 'B', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    pendingLethal: null, oncePerGame: {}, gems: { A: 10, B: 10 },
    attacksThisTurn: { A: 0, B: 0 }, skipLethalPlead: true
  }, extra || {});
}
function put(st, zone, code, extra) {
  const c = byCode(code);
  if (!c) throw new Error('missing ' + code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    img: '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone].push(k);
  return k;
}
function padDecks(st) { for (let i = 0; i < 8; i++) { put(st, 'A.deck', 'SD01-011'); put(st, 'B.deck', 'SD01-011'); } }
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
const apply = (st, a) => BoT.applyAction(st, a);
const zone = (st, k) => BoT.zoneOf(st, k);
function must(fx, what) { if (fx && fx.deny) fail(what + ' deny: ' + fx.deny); return fx; }
function skipReacts(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].kind === 'react' || st.prompts[0].magicNegate) && n++ < 12)
    must(apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed + n }), 'reactNo');
}
const DONG = 'CC02-013', DIAOCHAN = 'CC02-012', LUBU = 'PRMO-096', TANGONG = 'BT10-037', GUANYU = 'PRMO-091';
const ZHANGLIAO = 'SL02-004', COLLAR = 'PRMO-129', AMON = 'BT06-030', BLOOD = 'KD02-014';

/* 1) ตั๋งโต๊ะ จุติ: ลิโป้จากนรกขึ้นมือ Cost 8 → 5 จนจบเทิร์น */
{
  const st = emptyState(); padDecks(st);
  const lubu = put(st, 'A.hell', LUBU);
  put(st, 'A.hell', DONG); // ชื่อเดียวกัน — เลือกไม่ได้
  const dong = put(st, 'A.hand', DONG);
  const pay = put(st, 'A.hand', 'SD01-011', { gem: 4, gemColor: 'ม่วง', color: 'ม่วง' });
  must(apply(st, { type: 'summon', k: dong, to: 'A.avatar', payIds: [pay], by: 'A', seed: 1 }), 'dong summon');
  skipReacts(st, 2);
  const pr = st.prompts[0];
  ok(pr && pr.from === 'hell' && pr.pickedHandCostDelta === -3, 'จุติ opens hell pick with Cost −3');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.length === 1 && cands[0] === lubu, 'only ลิโป้ pickable (not another ตั๋งโต๊ะ): ' + cands.length);
  must(apply(st, { type: 'chooseTarget', k: lubu, by: 'A', seed: 3 }), 'pick lubu');
  ok(zone(st, lubu) === 'A.hand', 'ลิโป้ to hand');
  ok(BoT.effCost(st, lubu) === 5, 'ลิโป้ hand Cost 8 → ' + BoT.effCost(st, lubu));
}

/* 2) เตียวเสียน: มีตั๋งโต๊ะ → โจมตีไม่ได้ · ไม่มี → โจมตีได้ */
{
  const st = emptyState({ phase: 'Battle', active: 'B' }); padDecks(st);
  const diao = put(st, 'A.avatar', DIAOCHAN);
  put(st, 'A.avatar', DONG);
  const atk = put(st, 'B.avatar', 'SD01-002');
  const fx = apply(st, { type: 'declareAttack', atk, def: diao, by: 'B', seed: 10 });
  ok(!!fx.deny, 'เตียวเสียน untargetable with ตั๋งโต๊ะ: ' + fx.deny);
}
{
  const st = emptyState({ phase: 'Battle', active: 'B' }); padDecks(st);
  const diao = put(st, 'A.avatar', DIAOCHAN);
  const atk = put(st, 'B.avatar', 'SD01-002');
  const fx = apply(st, { type: 'declareAttack', atk, def: diao, by: 'B', seed: 11 });
  ok(!fx.deny, 'เตียวเสียน attackable without ขุนพล');
}

/* 3) เตียวเสียน สั่งใช้: ศัตรูตื่นหมด → ตั๋งโต๊ะจั่ว 1 (เทิร์นละครั้ง) */
{
  const st = emptyState(); padDecks(st);
  const diao = put(st, 'A.avatar', DIAOCHAN);
  put(st, 'A.avatar', DONG);
  const e1 = put(st, 'B.avatar', 'SD01-011', { tapped: true });
  const e2 = put(st, 'B.avatar', 'SD01-011', { tapped: true });
  const hand0 = st.zones['A.hand'].length;
  must(apply(st, { type: 'activateAbility', k: diao, by: 'A', seed: 20 }), 'diaochan activate');
  skipReacts(st, 21);
  ok(!st.inst[e1].tapped && !st.inst[e2].tapped, 'all enemy Avatars awake');
  ok(st.zones['A.hand'].length === hand0 + 1, `ตั๋งโต๊ะ drew 1 (hand ${hand0} → ${st.zones['A.hand'].length})`);
  st.inst[e1].tapped = true; // เปลี่ยนสภาพอีกครั้งในเทิร์นเดียวกัน
  must(apply(st, { type: 'move', k: e1, to: 'B.avatar', by: 'A', seed: 22 }), 'noop');
  ok(st.zones['A.hand'].length === hand0 + 1, 'ตั๋งโต๊ะ draw is once per turn');
}

/* 4) ตันก๋ง Link ลิโป้: ลิโป้โจมตีทำลายสำเร็จ → หงาย LIFE ศัตรู */
{
  const st = emptyState({ phase: 'Battle' }); padDecks(st);
  const lubu = put(st, 'A.avatar', LUBU);
  const tan = put(st, 'A.avatar', TANGONG);
  st.inst[lubu].pairWith = tan; st.inst[tan].pairWith = lubu;
  const foe = put(st, 'B.avatar', 'SD01-011');
  const l1 = put(st, 'B.life', 'SD01-011', { faceUp: false });
  put(st, 'B.life', 'SD01-011', { faceUp: false });
  must(apply(st, { type: 'declareAttack', atk: lubu, def: foe, by: 'A', seed: 30 }), 'lubu attack');
  skipReacts(st, 31);
  if (st.pending) must(apply(st, { type: 'resolveAttack', by: 'B', seed: 35 }), 'resolve');
  skipReacts(st, 36);
  ok(zone(st, foe) === 'B.hell', 'enemy destroyed in battle');
  const up = st.zones['B.life'].filter(k => st.inst[k].faceUp).length;
  ok(up === 1, 'one enemy LIFE revealed: ' + up);
}
{
  // ไม่อยู่ในสถานะ Link → ไม่ได้ความสามารถ
  const st = emptyState({ phase: 'Battle' }); padDecks(st);
  const lubu = put(st, 'A.avatar', LUBU);
  put(st, 'A.avatar', TANGONG);
  const foe = put(st, 'B.avatar', 'SD01-011');
  put(st, 'B.life', 'SD01-011', { faceUp: false });
  must(apply(st, { type: 'declareAttack', atk: lubu, def: foe, by: 'A', seed: 40 }), 'lubu attack 2');
  skipReacts(st, 41);
  if (st.pending) must(apply(st, { type: 'resolveAttack', by: 'B', seed: 45 }), 'resolve 2');
  ok(!st.zones['B.life'].some(k => st.inst[k].faceUp), 'no LIFE revealed without Link');
}

/* 5) ลิโป้: ศัตรูไม่เลือกโล่ → บังคับใช้โล่มนุษย์ · เปลี่ยนเป้าแล้วเลือกทำลายศัตรูได้ */
{
  const st = emptyState({ phase: 'Battle' }); padDecks(st);
  const lubu = put(st, 'A.avatar', LUBU);
  const def = put(st, 'B.avatar', 'SD01-011');
  const shield = put(st, 'B.avatar', 'SD01-011');
  must(apply(st, { type: 'declareAttack', atk: lubu, def, by: 'A', seed: 50 }), 'lubu attack 3');
  skipReacts(st, 51);
  ok(!!st.pending, 'attack pending');
  ok(BoT.humanShieldOptions(st, 'B').includes(shield), 'enemy got โล่มนุษย์ in Battle Phase');
  must(apply(st, { type: 'resolveAttack', by: 'B', seed: 55 }), 'B passes');
  ok(st.inst[shield].tapped, 'shield forced (tapped)');
  ok(st.pending && st.pending.def === shield, 'attack redirected to shield');
  const pr = st.prompts[0];
  ok(pr && pr.kind === 'chooseDestroy' && pr.chooser === 'A' && pr.optional, 'ลิโป้ may destroy an enemy');
  must(apply(st, { type: 'chooseTarget', k: def, by: 'A', seed: 56 }), 'destroy pick');
  skipReacts(st, 57);
  ok(zone(st, def) === 'B.hell', 'chosen enemy destroyed');
  if (st.pending) must(apply(st, { type: 'resolveAttack', by: 'B', seed: 60 }), 'resolve after shield');
  ok(!st.pending, 'combat resolved (no shield loop)');
}

/* 6) กวนอู: ศัตรูเล็งขุนพลต่างชาติใบอื่นไม่ได้ เล็งกวนอูได้ */
{
  const st = emptyState({ active: 'B' }); padDecks(st);
  const guan = put(st, 'A.avatar', GUANYU);
  const zhang = put(st, 'A.avatar', ZHANGLIAO);
  const plain = put(st, 'A.avatar', 'SD01-011');
  const src = put(st, 'B.avatar', 'SD01-002');
  const p = { kind: 'chooseDestroy', src, chooser: 'B', filter: { type: 'Avatar' }, zones: ['avatar'], side: 'enemy' };
  const c = BoT.promptCandidates(st, p);
  ok(!c.includes(zhang), 'เตียวเลี้ยว (ขุนพลต่างชาติ) untargetable by enemy');
  ok(c.includes(guan) && c.includes(plain), 'กวนอู and non-ขุนพล still targetable');
  const own = BoT.promptCandidates(st, Object.assign({}, p, { chooser: 'A', side: 'own', src: guan }));
  ok(own.includes(zhang), 'own abilities can still target เตียวเลี้ยว');
  ok((BoT.effectOf(GUANYU, 'กวนอู ขุนพลภักดีแห่งจ๊กก๊ก').keywords || []).includes('ลูกฮึด'), 'กวนอู keeps ลูกฮึด (SD07-001 print)');
}

/* 7) ปลอกคอซื่อสัตย์: ไม่มีความสามารถตาย · controlImmune บนใบสวม */
{
  const e = BoT.effectOf(COLLAR, 'ปลอกคอซื่อสัตย์');
  ok(e.controlImmune === true && !(e.abilities || []).length, 'collar uses controlImmune meta');
}

/* 8) อาม่อน: ถูกธรณีสูบ → อัญเชิญ · ถูกทำลาย → ใต้สุด Deck */
{
  const st = emptyState(); padDecks(st);
  const amon = put(st, 'A.deck', AMON); // บนสุด
  const blood = put(st, 'A.hand', BLOOD);
  must(apply(st, { type: 'playMagic', k: blood, by: 'A', seed: 70 }), 'play สัญญาเลือด');
  let n = 0;
  while (st.prompts[0] && n++ < 10) {
    const pr = st.prompts[0];
    if (pr.kind === 'react' || pr.magicNegate) { must(apply(st, { type: 'reactNo', by: pr.chooser, seed: 71 + n }), 'reactNo'); continue; }
    if (pr.kind === 'milledOptional') { must(apply(st, { type: 'skipPrompt', by: pr.chooser, seed: 80 + n }), 'skip milled'); continue; }
    break;
  }
  ok(zone(st, amon) === 'A.avatar', 'อาม่อน summoned after being milled: ' + zone(st, amon));

  const foe = put(st, 'B.avatar', 'SD01-011');
  st.inst[foe].power = 9;
  st.active = 'B'; st.phase = 'Battle'; st.turnSeq++;
  must(apply(st, { type: 'declareAttack', atk: foe, def: amon, by: 'B', seed: 90 }), 'attack amon');
  skipReacts(st, 91);
  if (st.pending) must(apply(st, { type: 'resolveAttack', by: 'A', seed: 95 }), 'resolve amon');
  ok(zone(st, amon) === 'A.deck' && st.zones['A.deck'][0] === amon, 'อาม่อน to bottom of deck: ' + zone(st, amon));
}

console.log('ALL PASS');
