/* focused: คลื่น 2 CC02-041/042/043 มรดก / หนังสือกุ่ย / หมอนข้าง — แมปจาก CC02-044 */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState(extra) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return Object.assign({
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    gems: { A: 10, B: 10 }
  }, extra || {});
}
function put(st, zone, code, extra) {
  const c = byCode(code);
  if (!c) throw new Error('missing ' + code);
  const n = Object.keys(st.inst).length + 1;
  const k = 't' + n;
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    img: c.imageUrl || '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone] = st.zones[zone] || [];
  st.zones[zone].push(k);
  return k;
}
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
function apply(st, a) { return BoT.applyAction(st, a); }
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 6) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}
function zone(st, k) { return BoT.zoneOf(st, k); }

function heritageSpec(code, color) {
  const e = BoT.effectOf(code);
  ok(e && e.parseStatus === 'auto' && e.stayOnMagic, code + ' stayOnMagic auto');
  const abs = e.abilities || [];
  const scout = (abs[0] && abs[0].actions || []).find(a => a.op === 'scout');
  ok(scout && scout.count === 2 && scout.filter && scout.filter.color === color && scout.restTo === 'bottom',
    code + ' scout 2 ' + color + ' rest bottom');
  const mag = abs.find(a => a.fromMagicZone);
  ok(mag && mag.requireTurnsOnMagicMin === 1, code + ' fromMagic delay 1');
  const hs = (mag.actions || []).find(a => a.op === 'handSummon');
  ok(hs && hs.filter && hs.filter.color === color && hs.costReduce === 2 && hs.mustPayRemain && hs.paidCost,
    code + ' handSummon ' + color + ' Cost-2');
}

heritageSpec('CC02-041', 'แดง');
heritageSpec('CC02-042', 'ฟ้า');
heritageSpec('CC02-043', 'ม่วง');

{
  const st = emptyState();
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const blue = put(st, 'A.deck', 'SD02-014');
  const red = put(st, 'A.deck', 'SD01-002');
  const mag = put(st, 'A.hand', 'CC02-041');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  ok(!fx.deny, 'play มรดก: ' + (fx.deny || ''));
  skipNegate(st);
  ok(zone(st, mag) === 'A.magic', 'ค้าง Magic Zone');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'hand' && pr.restTo === 'bottom',
    'scout pick hand rest bottom: ' + JSON.stringify(pr && { dest: pr.dest, rest: pr.restTo }));
  ok((pr.ids || []).includes(red) && (pr.ids || []).includes(blue), 'สอดแนม 2 ใบบนสุด');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(red) && !cands.includes(blue), 'เลือกได้เฉพาะแดง');
  fx = apply(st, { type: 'chooseTarget', k: red, by: 'A', seed: 2 });
  if (fx.deny) fail('pick red deny: ' + fx.deny);
  ok(zone(st, red) === 'A.hand', 'แดงขึ้นมือ');
  ok(zone(st, blue) === 'A.deck' && st.zones['A.deck'][0] === blue, 'ฟ้าไว้ใต้เด็ค');
  ok(st.inst[mag].magicEnteredTurnSeq === 2, 'บันทึกเทิร์นที่วาง');

  fx = apply(st, { type: 'activateAbility', k: mag, by: 'A', seed: 3 });
  ok(fx.deny && /1 เทิร์น/.test(fx.deny), 'เทิร์นวางยังสั่งใช้ไม่ได้: ' + (fx.deny || ''));
}

{
  const st = emptyState();
  st.turnSeq = 3;
  const mag = put(st, 'A.magic', 'CC02-041');
  st.inst[mag].magicEnteredTurnSeq = 1;
  const nara = put(st, 'A.hand', 'SD01-002');
  const pay1 = put(st, 'A.hand', 'SD01-017');
  const pay2 = put(st, 'A.hand', 'SD02-018');
  const fx = apply(st, { type: 'activateAbility', k: mag, by: 'A', seed: 4 });
  ok(!fx.deny, 'activate มรดก: ' + (fx.deny || ''));
  ok(zone(st, mag) === 'A.hell', 'มรดกถูกทำลาย');
  const pick = (st.prompts || [])[0];
  ok(pick && pick.kind === 'pick' && pick.dest === 'avatar' && (pick.ids || []).includes(nara),
    'เลือกพระนารายณ์จากมือ');
  apply(st, { type: 'chooseTarget', k: nara, by: 'A' });
  const pay = (st.prompts || [])[0];
  ok(pay && pay.dest === 'payRemainSummon' && pay.need === 2 && pay.summonK === nara,
    'ต้องจ่าย Cost เหลือ 2: ' + JSON.stringify(pay && { dest: pay.dest, need: pay.need }));
  apply(st, { type: 'chooseTarget', k: pay1, by: 'A' });
  ok(zone(st, nara) === 'A.hand', 'จ่าย 1 ใบแล้วยังไม่ลง');
  apply(st, { type: 'chooseTarget', k: pay2, by: 'A' });
  ok(zone(st, nara) === 'A.avatar', 'จ่ายครบแล้วพระนารายณ์ลงสนาม');
  ok(zone(st, pay1) === 'A.hell' && zone(st, pay2) === 'A.hell', 'ใบจ่ายลงนรก');
  ok((st.inst[nara].costDelta || 0) === -2, 'Cost −2 บนสนาม');
}

{
  const st = emptyState();
  st.turnSeq = 3;
  const mag = put(st, 'A.magic', 'CC02-041');
  st.inst[mag].magicEnteredTurnSeq = 1;
  const nara = put(st, 'A.hand', 'SD01-002');
  apply(st, { type: 'activateAbility', k: mag, by: 'A', seed: 5 });
  const pick = (st.prompts || [])[0];
  ok(!pick || !(pick.ids || []).includes(nara), 'พระนารายณ์ Cost 4 ไม่โผล่ถ้า GEM ไม่พอจ่ายเหลือ 2');
}

{
  const st = emptyState();
  st.turnSeq = 3;
  const mag = put(st, 'A.magic', 'CC02-042');
  st.inst[mag].magicEnteredTurnSeq = 1;
  const blue = put(st, 'A.hand', 'SD02-014');
  const red = put(st, 'A.hand', 'SD01-002');
  const pay1 = put(st, 'A.hand', 'SD01-017');
  const pay2 = put(st, 'A.hand', 'SD02-018');
  apply(st, { type: 'activateAbility', k: mag, by: 'A', seed: 6 });
  const pick = (st.prompts || [])[0];
  ok(pick && (pick.ids || []).includes(blue) && !(pick.ids || []).includes(red),
    'หนังสือกุ่ยเลือกได้เฉพาะฟ้า');
}

console.log('wave2 heritage: all passed');
