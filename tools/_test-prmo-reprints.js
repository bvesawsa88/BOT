/* รีปริ้นท์ PRMO-137/138/139/140/152 + APFD-001 — เช็คออโต้ตรงข้อความการ์ด
   รัน: node tools/_test-prmo-reprints.js */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  return {
    inst: {}, zones, phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
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
const pay = (st, code, n) => Array.from({ length: n }, () => put(st, 'A.hand', code));
function deck(st) { for (let i = 0; i < 8; i++) { put(st, 'A.deck', 'SD01-007'); put(st, 'B.deck', 'SD01-007'); } }

/* PRMO-138 ริน บันนี่เกิร์ล — ยึด Avatar POWER 0 ฝ่ายตรงข้าม แล้ว POWER +1 */
{
  const st = emptyState(); deck(st);
  const p0 = put(st, 'B.avatar', 'SD03-010');   // แม่นีโม่ขยับไม่ได้ P0
  const p3 = put(st, 'B.avatar', 'SD03-009');   // P3 — ยึดไม่ได้
  const rin = put(st, 'A.hand', 'PRMO-138');
  act(st, { type: 'summon', k: rin, to: 'A.avatar', payIds: pay(st, 'SD03-013', 3), by: 'A' });
  const pr = st.prompts[0];
  ok(pr && pr.dest === 'takeControl', 'ริน: เปิดเลือกยึดการควบคุม');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(p0) && !cands.includes(p3), 'ริน: เลือกได้เฉพาะ Avatar POWER 0 ฝ่ายตรงข้าม');
  act(st, { type: 'chooseTarget', k: p0, by: 'A' });
  ok(zone(st, p0) === 'A.avatar', 'ริน: ยึด Avatar มาฝั่งเรา');
  ok(BoT.effPower(st, p0) === 1, 'ริน: Avatar ที่ยึดได้ POWER +1 (=1)');
  ok(!st.scheduled.some(s => s.op === 'returnControl' && s.k === p0), 'ริน: ยึดถาวร ไม่คืนตอนจบเทิร์น');
}

/* PRMO-139 หมอเสริมศักดิ์ — จุติ สอดแนม 5 หา Magic หมอมาแล้วววว / คำสั่งเสีย Cost≤2 หรือ พยาบาล เอ๋ */
{
  const st = emptyState();
  deck(st);
  const deeper = put(st, 'A.deck', 'BT01-040');   // ใบที่ 6 จากบน — สอดแนมไม่ถึง
  const docMagic = put(st, 'A.deck', 'BT01-040'); // ใบที่ 5 จากบน (ท้าย array = บนสุด)
  put(st, 'A.deck', 'SD01-018');                  // Magic อื่น — ห้ามเลือก
  for (let i = 0; i < 3; i++) put(st, 'A.deck', 'SD01-007');
  const doc = put(st, 'A.hand', 'PRMO-139');
  act(st, { type: 'summon', k: doc, to: 'A.avatar', payIds: pay(st, 'SD01-007', 3), by: 'A' });
  const pr = st.prompts[0];
  ok(pr, 'หมอ: จุติเปิดเลือกการ์ดจากสอดแนม');
  const cands = BoT.promptCandidates(st, pr);
  ok(!cands.includes(deeper), 'หมอ: สอดแนมแค่ 5 ใบบน');
  ok(cands.length === 1 && cands[0] === docMagic, 'หมอ: เลือกได้เฉพาะ Magic หมอมาแล้วววว ใน 5 ใบบน');
  act(st, { type: 'chooseTarget', k: docMagic, by: 'A' });
  ok(zone(st, docMagic) === 'A.hand', 'หมอ: หมอมาแล้วววว ขึ้นมือ');
}
{
  const st = emptyState(); deck(st);
  const doc = put(st, 'A.avatar', 'PRMO-139');
  const c2 = put(st, 'A.hell', 'SD01-009');    // Cost 2 ✔
  const c3 = put(st, 'A.hell', 'SD03-009');    // Cost 3 ✘
  const nurse = put(st, 'A.hell', 'BT02-027'); // พยาบาล เอ๋ Cost 6 ✔
  act(st, { type: 'destroyCard', k: doc, by: 'A' });
  const pr = st.prompts.find(p => p.from === 'hell');
  ok(pr, 'หมอ: คำสั่งเสียเปิดเลือกจากนรก');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(c2) && cands.includes(nurse) && !cands.includes(c3), 'หมอ: เลือกได้ Cost≤2 หรือ พยาบาล เอ๋ เท่านั้น');
  act(st, { type: 'chooseTarget', k: nurse, by: 'A' });
  ok(zone(st, nurse) === 'A.avatar', 'หมอ: อัญเชิญ พยาบาล เอ๋ ลง Avatar Zone');
}

/* PRMO-140 มาโกะ — สั่งใช้เทิร์นละครั้ง อัญเชิญ Avatar "มะม่วง" Symbol ต้นไม้ จาก Magic Zone */
{
  const st = emptyState(); deck(st);
  const mako = put(st, 'A.avatar', 'PRMO-140');
  const sprite = put(st, 'A.magic', 'BT09-036'); // ภูติผลไม้ มะม่วง (Symbol เทพ) — เลือกไม่ได้
  const tree = put(st, 'A.magic', 'BT02-036');   // ต้นมะม่วง (Symbol ต้นไม้)
  act(st, { type: 'activateAbility', k: mako, by: 'A' });
  const pr = st.prompts[0];
  const cands = pr ? BoT.promptCandidates(st, pr) : [];
  ok(cands.includes(tree) && !cands.includes(sprite), 'มาโกะ: เลือกได้เฉพาะ Avatar "มะม่วง" Symbol ต้นไม้ จาก Magic Zone');
  act(st, { type: 'chooseTarget', k: tree, by: 'A' });
  ok(zone(st, tree) === 'A.avatar', 'มาโกะ: อัญเชิญจาก Magic Zone ลง Avatar Zone');
  const again = BoT.applyAction(st, { type: 'activateAbility', k: mako, by: 'A' });
  ok(again && again.deny, 'มาโกะ: เทิร์นละครั้ง');
}

/* PRMO-137 อู๊ด — สอดแนม 2 เรียงบน/ล่าง แล้วทำลาย Avatar ศัตรู Cost ≤ ผลรวม */
{
  const st = emptyState();
  for (let i = 0; i < 4; i++) put(st, 'A.deck', 'SD03-013');      // ก้นเด็ค
  const s1 = put(st, 'A.deck', 'SD01-009');                         // Cost 2
  const s2 = put(st, 'A.deck', 'SD01-007');                         // Cost 1 — บนสุด (ท้าย array) · รวม 3
  for (let i = 0; i < 6; i++) put(st, 'B.deck', 'SD01-007');
  const e3 = put(st, 'B.avatar', 'SD03-009'); // Cost 3 ✔
  const e4 = put(st, 'B.avatar', 'SD03-008'); // Cost 4 ✘
  const ood = put(st, 'A.hand', 'PRMO-137');
  act(st, { type: 'summon', k: ood, to: 'A.avatar', payIds: pay(st, 'SD03-013', 4), by: 'A' });
  const pr = st.prompts.find(p => p.kind === 'chooseDestroy');
  ok(pr, 'อู๊ด: หลังสอดแนมเปิดเลือกทำลาย');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(e3) && !cands.includes(e4), 'อู๊ด: ทำลายได้เฉพาะ Cost ≤ ผลรวม Cost ที่สอดแนม (3)');
  act(st, { type: 'chooseTarget', k: e3, by: 'A' });
  ok(zone(st, e3) === 'B.hell', 'อู๊ด: ทำลาย Avatar ศัตรู');
  ok(st.scout && st.scout.noTake && st.scout.ids.length === 2, 'อู๊ด: เปิดหน้าต่างเรียงการ์ดที่สอดแนม 2 ใบ');
  const take = BoT.applyAction(st, { type: 'scoutTake', k: s1, by: 'A' });
  ok(take && take.deny, 'อู๊ด: หยิบการ์ดที่สอดแนมขึ้นมือไม่ได้');
  act(st, { type: 'scoutEnd', where: 'bottom', by: 'A' });
  const d = st.zones['A.deck'];
  ok(!st.scout && d.indexOf(s1) < 2 && d.indexOf(s2) < 2, 'อู๊ด: เลือกเรียงไว้ล่างสุดของ Deck ได้');
}

/* APFD-001 ความเจริญ — จั่ว 2 */
{
  const st = emptyState(); deck(st);
  const m = put(st, 'A.hand', 'APFD-001');
  const payIds = pay(st, 'SD01-007', 1);
  const deckBefore = st.zones['A.deck'].length;
  act(st, { type: 'playMagic', k: m, payIds, by: 'A', seed: 1 });
  let g = 0;
  while (st.prompts[0] && st.prompts[0].chooser === 'B' && g++ < 5) act(st, { type: 'reactNo', by: 'B', seed: 9 + g });
  ok(!st.zones['A.hand'].includes(m), 'ความเจริญ: ใช้ Magic แล้วออกจากมือ');
  ok(st.zones['A.deck'].length === deckBefore - 2, 'ความเจริญ: จั่ว 2 ใบ (เด็ค ' + deckBefore + ' → ' + st.zones['A.deck'].length + ')');
}

/* PRMO-152 เชาว์ปัญญาลิง — React เมื่อศัตรูสั่งใช้ความสามารถ Avatar → สูญเสียความสามารถจนจบเทิร์น */
{
  const st = emptyState(); deck(st);
  st.active = 'B';
  const monkey = put(st, 'A.hand', 'PRMO-152');
  const mako = put(st, 'B.avatar', 'PRMO-140');
  put(st, 'B.magic', 'BT09-036');
  put(st, 'B.magic', 'BT02-036'); // ต้นมะม่วง → มาโกะ ต่อเนื่อง POWER +1
  ok(BoT.effPower(st, mako) === 7, 'ลิง(ก่อน): มาโกะ POWER 6+1 = 7');
  act(st, { type: 'activateAbility', k: mako, by: 'B' });
  const pr = st.prompts.find(p => p.kind === 'react' && p.chooser === 'A');
  ok(pr && (pr.options || []).includes(monkey), 'ลิง: เปิด React ให้ใช้เมื่อศัตรูสั่งใช้ความสามารถ Avatar');
  act(st, { type: 'reactYes', k: monkey, by: 'A', seed: 5 });
  ok(st.prompts[0] && st.prompts[0].chooser === 'B' && st.prompts[0].magicNegate && st.prompts[0].target === monkey, 'ลิง: เปิดหน้าต่างให้ศัตรูขัดลิงก่อน');
  act(st, { type: 'reactNo', by: 'B', seed: 6 });
  ok(zone(st, mako) === 'B.avatar' && !st.prompts.some(p => p.src === mako && p.chooser === 'B' && p.kind === 'pick'),
    'ลิง: ความสามารถของ Avatar ศัตรูถูกยกเลิก');
  ok(BoT.effPower(st, mako) === 6, 'ลิง: มาโกะสูญเสียความสามารถต่อเนื่อง (POWER กลับเป็น 6)');
}

console.log('ALL PRMO REPRINT TESTS PASSED');
