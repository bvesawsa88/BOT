/* focused: เทคการ์ดเด็คนินจาสับโดด — ผนึกเงา / หนีคือยอดกลยุทธ์ / โรงบาล / หนึ่งเดียวเพื่อทุกอย่าง / โกเอมอน */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
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
function skipNegate(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const fx = BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}

/* 1) ผนึกเงา — เทิร์นศัตรู ล็อก Avatar ไม่ให้โจมตี/เปลี่ยนสภาพ */
{
  const st = emptyState();
  st.active = 'B';
  const ninja = put(st, 'A.avatar', 'BT05-045');
  const foe = put(st, 'B.avatar', 'BT04-036');
  const seal = put(st, 'A.hand', 'BT10-064');
  let fx = BoT.applyAction(st, { type: 'playMagic', k: seal, by: 'A', seed: 1 });
  if (fx.deny) fail('play ผนึกเงา deny: ' + fx.deny);
  skipNegate(st, 2);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'grantCannotChangeState', 'ผนึกเงา: เลือกเป้า ' + (pr && pr.dest));
  ok((pr.ids || BoT.promptCandidates(st, pr) || []).includes(foe) || BoT.promptCandidates(st, pr).includes(foe),
    'ผนึกเงา: เป้าเป็น Avatar ศัตรู');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: foe, by: 'A', seed: 10 });
  if (fx.deny) fail('pick ผนึกเงา deny: ' + fx.deny);
  ok(!!st.inst[foe].cannotChangeStateUntilEOT, 'ผนึกเงา: ติดธงห้ามเปลี่ยนสภาพ');
  fx = BoT.applyAction(st, { type: 'declareAttack', atk: foe, def: ninja, by: 'B', seed: 11 });
  ok(!!fx.deny && /เปลี่ยนสภาพ/.test(fx.deny), 'ผนึกเงา: โจมตีไม่ได้ — ' + fx.deny);
  fx = BoT.applyAction(st, { type: 'toggleTap', k: foe, by: 'B', seed: 12 });
  ok(!!fx.deny && /เปลี่ยนสภาพ/.test(fx.deny), 'ผนึกเงา: นอน/ตื่นไม่ได้ — ' + fx.deny);
  const ally = put(st, 'B.avatar', 'BT05-008');
  fx = BoT.applyAction(st, { type: 'unity', k: foe, to: ally, by: 'B', seed: 13 });
  ok(!!fx.deny && /เปลี่ยนสภาพ/.test(fx.deny), 'ผนึกเงา: สามัคคีไม่ได้ — ' + fx.deny);
}

/* 1b) ผนึกเงา — โจมตีแล้วใช้ใส่ผู้โจมตี → ยกเลิกการโจมตี */
{
  const st = emptyState();
  st.active = 'B';
  st.phase = 'Battle';
  const ninja = put(st, 'A.avatar', 'BT05-045');
  const foe = put(st, 'B.avatar', 'BT04-036');
  const seal = put(st, 'A.hand', 'BT10-064');
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: foe, def: ninja, by: 'B', seed: 1 });
  if (fx.deny) fail('declareAttack ผนึกเงา deny: ' + fx.deny);
  ok(!!st.pending && st.pending.atk === foe, 'ผนึกเงา: มีการโจมตีค้าง');
  const react = (st.prompts || [])[0];
  ok(react && react.kind === 'react' && (react.options || []).includes(seal),
    'ผนึกเงา in attack react: ' + ((react && react.options) || []).join(','));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: seal, by: 'A', seed: 2 });
  if (fx.deny) fail('play ผนึกเงา in attack deny: ' + fx.deny);
  skipNegate(st, 3);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'grantCannotChangeState', 'ผนึกเงา: เลือกเป้าหลังโจมตี');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: foe, by: 'A', seed: 10 });
  if (fx.deny) fail('pick ผนึกเงา attacker deny: ' + fx.deny);
  ok(!st.pending, 'ผนึกเงา: โจมตียกเลิกเพราะห้ามเปลี่ยนสภาพ');
  ok(!!st.inst[foe].tapped, 'ผนึกเงา: ผู้โจมตีนอนค้าง (ประกาศไปแล้ว)');
}

/* 1c) ผนึกเงา — โล่มนุษย์ไม่ได้ */
{
  const st = emptyState();
  const ninja = put(st, 'A.avatar', 'BT05-045');
  const foe = put(st, 'B.avatar', 'BT04-036');
  const sh = put(st, 'B.avatar', 'BT05-008');
  const sh2 = put(st, 'B.avatar', 'BT05-050');
  const seal = put(st, 'A.hand', 'BT10-064');
  st.inst[sh].grantedKeywords = [{ kw: 'โล่มนุษย์', until: 'endOfTurn' }];
  st.inst[sh2].grantedKeywords = [{ kw: 'โล่มนุษย์', until: 'endOfTurn' }];
  let fx = BoT.applyAction(st, { type: 'playMagic', k: seal, by: 'A', seed: 1 });
  if (fx.deny) fail('play ผนึกเงา shield deny: ' + fx.deny);
  skipNegate(st, 2);
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: sh, by: 'A', seed: 3 });
  if (fx.deny) fail('pick ผนึกเงา shield deny: ' + fx.deny);
  st.phase = 'Battle';
  fx = BoT.applyAction(st, { type: 'declareAttack', atk: ninja, def: foe, by: 'A', seed: 4 });
  if (fx.deny) fail('atk vs shield deny: ' + fx.deny);
  ok(!(BoT.humanShieldOptions(st, 'B') || []).includes(sh), 'ผนึกเงา: ไม่เสนอโล่มนุษย์');
  fx = BoT.applyAction(st, { type: 'humanShield', k: sh, by: 'B', seed: 5 });
  ok(!!fx.deny && /เปลี่ยนสภาพ/.test(fx.deny), 'ผนึกเงา: โล่มนุษย์ไม่ได้ — ' + fx.deny);
}

/* 2) ผนึกเงา — มี Avatar ที่ไม่ใช่นินจา ใช้ไม่ได้ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT05-045');
  put(st, 'A.avatar', 'BT04-036');
  put(st, 'B.avatar', 'BT05-008');
  const seal = put(st, 'A.hand', 'BT10-064');
  const fx = BoT.applyAction(st, { type: 'playMagic', k: seal, by: 'A', seed: 1 });
  ok(!!fx.deny && /นินจา/.test(fx.deny), 'ผนึกเงา: ต้องมีแค่นินจา — ' + fx.deny);
}

/* 3) หนีคือยอดกลยุทธ์ — เด้งตัวที่ถูกโจมตีขึ้นมือ แล้วโจมตีสลาย */
{
  const st = emptyState();
  st.active = 'B';
  const def = put(st, 'A.avatar', 'BT05-045');
  const atk = put(st, 'B.avatar', 'BT04-036');
  const flee = put(st, 'A.hand', 'SD07-016');
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk, def, by: 'B', seed: 1 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && (pr.options || []).includes(flee),
    'หนีคือยอดกลยุทธ์ in attack react: ' + ((pr && pr.options) || []).join(','));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: flee, by: 'A', seed: 2 });
  if (fx.deny) fail('play หนี deny: ' + fx.deny);
  skipNegate(st, 3);
  ok(BoT.zoneOf(st, def) === 'A.hand', 'หนี: ตัวที่ถูกโจมตีขึ้นมือ (' + BoT.zoneOf(st, def) + ')');
  ok(!st.pending, 'หนี: โจมตีสลาย');
}

/* 3b) วิชานินจา รุกรับพลิกผัน — เป็น Normal Magic (เล่นใน Main Phase) ไม่เด้งถาม React ตอนถูกโจมตี */
{
  const st = emptyState();
  st.active = 'B';
  const def = put(st, 'A.avatar', 'BT05-045');
  const atk = put(st, 'B.avatar', 'BT04-036');
  const tech = put(st, 'A.hand', 'BT10-065');
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk, def, by: 'B', seed: 1 });
  const react = (st.prompts || [])[0];
  const options = (react && react.options) || [];
  ok(!options.includes(tech), 'รุกรับพลิกผัน ไม่ถาม React ตอนถูกโจมตี');
}

/* 4) โรงบาล — ขึ้นมือแล้วอัญเชิญชื่อนั้นไม่ได้ */
{
  const st = emptyState();
  const land = put(st, 'land', 'BT01-050', { controller: 'A' });
  const hellAv = put(st, 'A.hell', 'BT04-036');
  const fodder = put(st, 'A.hand', 'BT01-038');
  let fx = BoT.applyAction(st, { type: 'activateAbility', k: land, by: 'A', seed: 1 });
  if (fx.deny) fail('activate โรงบาล deny: ' + fx.deny);
  const dpr = (st.prompts || [])[0];
  ok(dpr && dpr.kind === 'chooseDiscard', 'โรงบาล: ทิ้งมือจ่าย — ' + (dpr && dpr.kind));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: fodder, by: 'A', seed: 2 });
  if (fx.deny) fail('discard โรงบาล deny: ' + fx.deny);
  const hpr = (st.prompts || [])[0];
  ok(hpr && hpr.kind === 'pick' && (hpr.dest === 'hand' || !hpr.dest), 'โรงบาล: เลือกจากนรก');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: hellAv, by: 'A', seed: 3 });
  if (fx.deny) fail('hellPick โรงบาล deny: ' + fx.deny);
  ok(BoT.zoneOf(st, hellAv) === 'A.hand', 'โรงบาล: ขึ้นมือ');
  ok(st.lockSummonAndAbility && (st.lockSummonAndAbility.names || []).includes(st.inst[hellAv].name),
    'โรงบาล: ล็อกชื่อ ' + JSON.stringify(st.lockSummonAndAbility));
  fx = BoT.applyAction(st, { type: 'summon', k: hellAv, to: 'A.avatar', by: 'A', seed: 4 });
  ok(!!fx.deny && /โรงบาล/.test(fx.deny), 'โรงบาล: อัญเชิญไม่ได้ — ' + fx.deny);
}

/* 5) หนึ่งเดียวเพื่อทุกอย่าง — สวม +1 แล้วย้ายโฮสต์ +2 */
{
  const st = emptyState();
  const host1 = put(st, 'A.avatar', 'BT05-045');
  const host2 = put(st, 'A.avatar', 'BT10-006');
  const mod = put(st, 'A.magic', 'BT11-068', { attachedTo: host1 });
  const p1 = BoT.effPower(st, host1);
  const printed1 = +(st.inst[host1].power) || 0;
  ok(p1 === printed1 + 1, 'หนึ่งเดียว: โฮสต์แรก POWER +1 (' + p1 + ' vs ' + (printed1 + 1) + ')');
  let fx = BoT.applyAction(st, { type: 'move', k: host1, to: 'A.hell', by: 'A', seed: 1 });
  if (fx.deny) fail('destroy host deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'attachTo' && pr.stackOnReattach,
    'หนึ่งเดียว: ถามสวมโฮสต์ใหม่');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: host2, by: 'A', seed: 2 });
  if (fx.deny) fail('reattach deny: ' + fx.deny);
  ok(st.inst[mod].attachedTo === host2, 'หนึ่งเดียว: สวมโฮสต์ใหม่');
  ok((st.inst[mod].equipHostChanges || 0) === 1, 'หนึ่งเดียว: นับการเปลี่ยนโฮสต์');
  const p2 = BoT.effPower(st, host2);
  const printed2 = +(st.inst[host2].power) || 0;
  ok(p2 === printed2 + 2, 'หนึ่งเดียว: โฮสต์ใหม่ POWER +2 (' + p2 + ' vs ' + (printed2 + 2) + ')');
}

/* 5b) หนึ่งเดียว — สนามเราว่างแล้วเด้งไปฝั่งตรงข้าม · เราเป็นคนเลือก */
{
  const st = emptyState();
  const host = put(st, 'A.avatar', 'BT05-045');
  const foe1 = put(st, 'B.avatar', 'BT04-036');
  const foe2 = put(st, 'B.avatar', 'BT05-008');
  const mod = put(st, 'A.magic', 'BT11-068', { attachedTo: host, modOwner: 'A' });
  let fx = BoT.applyAction(st, { type: 'move', k: host, to: 'A.hell', by: 'A', seed: 1 });
  if (fx.deny) fail('destroy last host deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'attachTo' && pr.chooser === 'A',
    'หนึ่งเดียว: สนามว่างแล้วเราเลือก (chooser=' + (pr && pr.chooser) + ')');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(foe1) && cands.includes(foe2), 'หนึ่งเดียว: เป้าเป็น Avatar ฝั่งตรงข้าม');
  ok(!cands.includes(host), 'หนึ่งเดียว: ไม่รวมโฮสต์ที่ออกไปแล้ว');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: foe2, by: 'A', seed: 2 });
  if (fx.deny) fail('reattach enemy deny: ' + fx.deny);
  ok(st.inst[mod].attachedTo === foe2, 'หนึ่งเดียว: สวม Avatar ฝั่งตรงข้าม');
  ok(BoT.zoneOf(st, mod) === 'B.magic', 'หนึ่งเดียว: ใบไป Magic Zone ฝั่งโฮสต์ (' + BoT.zoneOf(st, mod) + ')');
  ok((st.inst[mod].equipHostChanges || 0) === 1, 'หนึ่งเดียว: สแต็ก +1 ตอนเด้งฝั่งตรงข้าม');
  const pFoe = BoT.effPower(st, foe2);
  const printedFoe = +(st.inst[foe2].power) || 0;
  ok(pFoe === printedFoe + 2, 'หนึ่งเดียว: โฮสต์ศัตรู POWER +2 (' + pFoe + ' vs ' + (printedFoe + 2) + ')');
}

/* 5c) หนึ่งเดียว — ยังมี Avatar ฝั่งเรา ห้ามเลือกฝั่งตรงข้าม */
{
  const st = emptyState();
  const host1 = put(st, 'A.avatar', 'BT05-045');
  const host2 = put(st, 'A.avatar', 'BT10-006');
  const foe = put(st, 'B.avatar', 'BT04-036');
  put(st, 'A.magic', 'BT11-068', { attachedTo: host1, modOwner: 'A' });
  let fx = BoT.applyAction(st, { type: 'move', k: host1, to: 'A.hell', by: 'A', seed: 1 });
  if (fx.deny) fail('destroy with own left deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(host2) && !cands.includes(foe), 'หนึ่งเดียว: มีใบเราแล้วเลือกได้แค่ฝั่งเรา');
}

/* 6) มนุษย์ดัดแปลง — อัญเชิญจากนรกแล้วสวม · หลุดสนามแล้วโฮสต์ลงนรก */
{
  const st = emptyState();
  const hellAv = put(st, 'A.hell', 'BT04-036');
  const mod = put(st, 'A.hand', 'BT05-066');
  const fodder = put(st, 'A.hand', 'BT01-038');
  let fx = BoT.applyAction(st, { type: 'playMagic', k: mod, by: 'A', seed: 1 });
  if (fx.deny) fail('play มนุษย์ดัดแปลง deny: ' + fx.deny);
  skipNegate(st, 2);
  const dpr = (st.prompts || [])[0];
  ok(dpr && dpr.kind === 'chooseDiscard', 'มนุษย์ดัดแปลง: ทิ้งมือ — ' + (dpr && dpr.kind));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: fodder, by: 'A', seed: 3 });
  if (fx.deny) fail('discard มนุษย์ดัดแปลง deny: ' + fx.deny);
  skipNegate(st, 4);
  const hpr = (st.prompts || [])[0];
  ok(hpr && hpr.kind === 'pick' && hpr.dest === 'avatar', 'มนุษย์ดัดแปลง: เลือกจากนรกลงสนาม');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: hellAv, by: 'A', seed: 5 });
  if (fx.deny) fail('summon มนุษย์ดัดแปลง deny: ' + fx.deny);
  ok(BoT.zoneOf(st, hellAv) === 'A.avatar', 'มนุษย์ดัดแปลง: อัญเชิญจากนรก');
  ok(st.inst[mod].attachedTo === hellAv, 'มนุษย์ดัดแปลง: สวมโฮสต์');
  const e = BoT.effectOf('BT05-066');
  ok(e && e.hostSymbolReplace === 'เครื่องจักร', 'มนุษย์ดัดแปลง: เปลี่ยน Symbol เป็นเครื่องจักร');
  fx = BoT.applyAction(st, { type: 'move', k: mod, to: 'A.hell', by: 'A', seed: 6 });
  if (fx.deny) fail('unequip deny: ' + fx.deny);
  ok(BoT.zoneOf(st, hellAv) === 'A.hell', 'มนุษย์ดัดแปลง: โฮสต์ลงนรกเมื่อใบสวมหลุด (' + BoT.zoneOf(st, hellAv) + ')');
}

/* 7) เด็คนินจาสับโดด 50+5 */
{
  const decks = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../data/custom-decks.json'), 'utf8'));
  const d = decks['นินจาสับโดด'];
  ok(!!d, 'มีเด็คนินจาสับโดด');
  const mn = Object.values(d.main).reduce((a, b) => a + b, 0);
  const lf = Object.values(d.life).reduce((a, b) => a + b, 0);
  ok(mn === 50, 'main 50 (ได้ ' + mn + ')');
  ok(lf === 5, 'life 5 (ได้ ' + lf + ')');
}

/* 8) มอดสวมโฮสต์ศัตรู — โฮสต์พังแล้วมอดลงนรกเจ้าของใบ */
{
  const st = emptyState();
  const host = put(st, 'B.avatar', 'BT04-036');
  const mod = put(st, 'A.magic', 'ODY1-076');
  let fx = BoT.applyAction(st, { type: 'attach', k: mod, to: host, by: 'A', seed: 1 });
  if (fx.deny) fail('attach ไม้เกาหลัง deny: ' + fx.deny);
  ok(st.inst[mod].attachedTo === host, 'มอด: สวมโฮสต์ศัตรู');
  fx = BoT.applyAction(st, { type: 'move', k: host, to: 'B.hell', by: 'B', seed: 2 });
  if (fx.deny) fail('destroy host with mod deny: ' + fx.deny);
  ok(BoT.zoneOf(st, mod) === 'A.hell', 'มอด: ลงนรกเจ้าของใบ (' + BoT.zoneOf(st, mod) + ')');
}

/* 9) ยึด Avatar แล้วทำลาย — ลงนรกเจ้าของเดิม */
{
  const st = emptyState();
  const av = put(st, 'A.avatar', 'BT04-036');
  let fx = BoT.applyAction(st, { type: 'takeControl', k: av, by: 'B', seed: 1 });
  if (fx.deny) fail('takeControl deny: ' + fx.deny);
  ok(BoT.zoneOf(st, av) === 'B.avatar', 'ยึด: อยู่สนามฝั่งที่ยึด');
  fx = BoT.applyAction(st, { type: 'move', k: av, to: 'B.hell', by: 'B', seed: 2 });
  if (fx.deny) fail('destroy stolen deny: ' + fx.deny);
  ok(BoT.zoneOf(st, av) === 'A.hell', 'ยึด: ลงนรกเจ้าของเดิม (' + BoT.zoneOf(st, av) + ')');
}

/* 10) โกเอมอน ตี LIFE — ขโมยจากนรกได้แค่ Magic ปกติ / Modification (ห้าม React / Land) */
{
  const st = emptyState();
  st.phase = 'Battle';
  const goe = put(st, 'A.avatar', 'BT10-004');
  const e = BoT.effectOf('BT10-004');
  const grantAc = ((e.abilities || []).find(ab => ab.trigger && ab.trigger.on === 'summoned') || {}).actions || [];
  const granted = (grantAc[0] && grantAc[0].abilities) || [];
  ok(granted.length, 'โกเอมอน: มี grant เมื่ออัญเชิญจากความสามารถตัวเอง');
  st.inst[goe].granted = JSON.parse(JSON.stringify(granted));
  const life = put(st, 'B.life', 'SD07-024', { faceUp: false });
  const norm = put(st, 'B.hell', 'BT01-038');
  const mod = put(st, 'B.hell', 'ODY1-076');
  const react = put(st, 'B.hell', 'BT10-064');
  const land = put(st, 'B.hell', 'ODY1-090');
  put(st, 'A.hand', 'BT05-045');
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: goe, life: life, by: 'A', seed: 1 });
  if (fx.deny) fail('โกเอมอน atk LIFE deny: ' + fx.deny);
  skipNegate(st, 2);
  if (st.pending) {
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: 'B', seed: 20 });
    if (fx.deny) fail('โกเอมอน resolveAttack deny: ' + fx.deny);
  }
  skipNegate(st, 21);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'oppHellToHandThenDiscard', 'โกเอมอน: เลือกจากนรกศัตรู (' + ((pr && pr.dest) || 'no-prompt') + ')');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(norm), 'โกเอมอน: หยิบ Magic ปกติได้');
  ok(cands.includes(mod), 'โกเอมอน: หยิบ Modification ได้');
  ok(!cands.includes(react), 'โกเอมอน: หยิบ React ไม่ได้');
  ok(!cands.includes(land), 'โกเอมอน: หยิบ Land ไม่ได้');
}

console.log('ALL OK');
