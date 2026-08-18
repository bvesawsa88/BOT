/* focused: นักท่องเรื่องราว / Skill — evolve, grant, extra react, hypersense */
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
    phase: 'Main', active: 'A', turn: 3, turnSeq: 3,
    strict: true, firstPlayer: 'B', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    pendingLethal: null, oncePerGame: {}, gems: { A: 10, B: 10 }
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
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); }
function apply(st, a) { return BoT.applyAction(st, a); }
function zone(st, k) { return BoT.zoneOf(st, k); }
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser });
    if (fx.deny) throw new Error('FAIL: negate skip: ' + fx.deny);
  }
}

/* 1) ขวัญตา evolve → เนรเทศตัวเอง จั่ว 1 อัญเชิญนาคแล้วได้ grant */
{
  const st = emptyState();
  const exp = put(st, 'A.avatar', 'BT09-042');
  const naga = put(st, 'A.hand', 'BT09-043');
  const deckCard = put(st, 'A.deck', 'BT09-056');
  const fx = apply(st, { type: 'activateAbility', k: exp, by: 'A' });
  ok(!fx.deny, 'evolve activate: ' + (fx.deny || ''));
  ok(st.prompts.length === 1 && st.prompts[0].dest === 'storyEvolve', 'prompt storyEvolve');
  apply(st, { type: 'chooseTarget', k: naga, by: 'A' });
  ok(zone(st, exp) === 'A.dark', 'explorer exiled to dark');
  ok(zone(st, naga) === 'A.avatar', 'naga summoned');
  ok(zone(st, deckCard) === 'A.hand', 'drew 1 on exile');
  ok((st.inst[naga].granted || []).length >= 1, 'naga granted abilities');
  ok(BoT.effPower(st, naga) === 0, 'naga base P0 before hell magics');
}

/* 2) นาค POWER +1 ต่อ Magic ในนรกทุก 2 ใบ */
{
  const st = emptyState();
  const naga = put(st, 'A.avatar', 'BT09-043');
  st.inst[naga].granted = [{
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    actions: [{
      op: 'modifyPower', amountPer: 'ownHellTypePerN', hellType: 'Magic', perN: 2, per: 1,
      layer: 3, target: { select: 'self' }
    }]
  }];
  put(st, 'A.hell', 'BT09-056');
  put(st, 'A.hell', 'BT09-059');
  put(st, 'A.hell', 'BT09-060');
  put(st, 'A.hell', 'BT01-038');
  ok(BoT.effPower(st, naga) === 2, 'naga +2 from 4 magic in hell');
}

/* 3) มายา evolve ให้ POWER +1 */
{
  const st = emptyState();
  const maya = put(st, 'A.avatar', 'BT11-048');
  const bolt = put(st, 'A.hand', 'BT11-049');
  apply(st, { type: 'activateAbility', k: maya, by: 'A' });
  apply(st, { type: 'chooseTarget', k: bolt, by: 'A' });
  ok(zone(st, maya) === 'A.dark', 'maya explorer exiled');
  ok(zone(st, bolt) === 'A.avatar', 'bolt summoned');
  ok((st.inst[bolt].powerDelta || 0) === 1, 'maya evolve +1 power');
  ok(BoT.effPower(st, bolt) === 4, 'bolt 3+1');
}

/* 3b) มายาสายฟ้า: ใช้ Magic ในเทิร์นเรา → POWER +1 ค้างข้ามเทิร์น (ไม่ใช่จนจบเทิร์น) */
{
  const st = emptyState();
  const maya = put(st, 'A.avatar', 'BT11-048');
  const bolt = put(st, 'A.hand', 'BT11-049');
  apply(st, { type: 'activateAbility', k: maya, by: 'A' });
  apply(st, { type: 'chooseTarget', k: bolt, by: 'A' });
  const mag = put(st, 'A.hand', 'BT01-038');
  put(st, 'A.deck', 'BT09-059');
  put(st, 'A.deck', 'BT09-060');
  apply(st, { type: 'playMagic', k: mag, by: 'A' });
  skipNegate(st);
  ok(BoT.effPower(st, bolt) === 5, 'bolt 3+1 evolve +1 from magic: ' + BoT.effPower(st, bolt));
  const fxEnd = apply(st, { type: 'endTurn', by: 'A' });
  ok(!fxEnd.deny, 'endTurn: ' + (fxEnd.deny || ''));
  ok(BoT.effPower(st, bolt) === 5, 'bolt still +1 after end turn (until leave field): ' + BoT.effPower(st, bolt));
}

/* 9) ไต้ฝุ่น: ลากใช้แล้วต้องกดเลือกปฏิบัติ — ยังไม่ลงนรกจนกว่าจะเลือก */
{
  const st = emptyState();
  const ty = put(st, 'A.hand', 'BT09-057');
  const em = put(st, 'B.magic', 'BT01-038');
  const fx = apply(st, { type: 'playMagic', k: ty, by: 'A' });
  ok(!fx.deny, 'play typhoon: ' + (fx.deny || ''));
  skipNegate(st);
  ok(zone(st, ty) === 'A.magic', 'typhoon stays on magic until choose: ' + zone(st, ty));
  const mode = (st.prompts || []).find(p => p.kind === 'chooseMode');
  ok(mode && mode.optional === false && (mode.options || []).length === 2,
    'typhoon chooseMode required: ' + JSON.stringify((st.prompts || []).map(p => p.kind + ':' + p.optional)));
  const skipFx = apply(st, { type: 'skipPrompt', by: 'A' });
  ok(skipFx.deny, 'cannot skip typhoon chooseMode: ' + (skipFx.deny || ''));
  apply(st, { type: 'chooseMode', k: ty, opt: 0, by: 'A' });
  const dest = (st.prompts || [])[0];
  ok(dest && dest.kind === 'chooseDestroy', 'choose destroy enemy magic: ' + ((dest && dest.kind) || ''));
  apply(st, { type: 'chooseTarget', k: em, by: 'A' });
  ok(zone(st, em) === 'B.hell', 'enemy magic destroyed');
  ok(zone(st, ty) === 'A.hell', 'typhoon to hell after resolve');
}

/* 10) ไต้ฝุ่น: ใช้ในเทิร์นฝ่ายตรงข้ามได้ (นับเป็น React) */
{
  const st = emptyState();
  st.active = 'B';
  const ty = put(st, 'A.hand', 'BT09-057');
  put(st, 'B.magic', 'BT01-038');
  const fx = apply(st, { type: 'playMagic', k: ty, by: 'A' });
  ok(!fx.deny, 'typhoon on opp turn: ' + (fx.deny || ''));
  skipNegate(st);
  ok((st.prompts || []).some(p => p.kind === 'chooseMode'), 'chooseMode on opp turn');
}

/* 4) Hypersense: สนามเรื่องราวทั้งหมด → nullify */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const enemy = put(st, 'B.avatar', 'BT09-042');
  put(st, 'B.hand', 'BT09-043');
  st.phase = 'Main';
  st.active = 'B';
  apply(st, { type: 'activateAbility', k: enemy, by: 'B' });
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper), 'hypersense offered on enemy activate');
  apply(st, { type: 'reactYes', k: hyper, by: 'A' });
  ok(!!st.inst[enemy].nullifyUntilEOT, 'enemy nullified until EOT');
}

/* 4b) Hypersense: คู่แข่งอัญเชิญแล้วจุติ — ต้องเสนอ React */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const juti = put(st, 'B.hand', 'SD01-001', { cost: 0 });
  st.phase = 'Main';
  st.active = 'B';
  const fx = apply(st, { type: 'summon', k: juti, to: 'B.avatar', by: 'B' });
  ok(!fx.deny, 'summon juti: ' + (fx.deny || ''));
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper),
    'hypersense offered on enemy juti (no accident): ' + JSON.stringify((st.prompts || []).map(p => p.kind + ':' + (p.reactTrigger || ''))));
  apply(st, { type: 'reactYes', k: hyper, by: 'A' });
  ok(!!st.inst[juti].nullifyUntilEOT, 'juti avatar nullified until EOT');
}

/* 4c) Hypersense: มีอุบัติเหตุในมือ — ข้ามอุบัติเหตุแล้วยังต้องเสนอ Hypersense ตอนจุติ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const acc = put(st, 'A.hand', 'SD01-017');
  const juti = put(st, 'B.hand', 'SD01-001', { cost: 0 });
  st.phase = 'Main';
  st.active = 'B';
  const fx = apply(st, { type: 'summon', k: juti, to: 'B.avatar', by: 'B' });
  ok(!fx.deny, 'summon juti with accident in hand: ' + (fx.deny || ''));
  const accPr = (st.prompts || [])[0];
  ok(accPr && accPr.kind === 'react' && accPr.reactTrigger === 'avatarSummoned' && (accPr.options || []).includes(acc),
    'accident window first: ' + ((accPr && accPr.reactTrigger) || ''));
  apply(st, { type: 'reactNo', by: 'A' });
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper),
    'hypersense offered after skip accident: ' + JSON.stringify((st.prompts || []).map(p => p.kind + ':' + (p.reactTrigger || ''))));
}

/* 4d) Hypersense: สามัคคี */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const giver = put(st, 'B.avatar', 'SD01-003');
  const recv = put(st, 'B.avatar', 'SD01-002');
  st.inst[giver].grantedKeywords = [{ kw: 'สามัคคี' }];
  st.phase = 'Main';
  st.active = 'B';
  let fx = apply(st, { type: 'unity', k: giver, to: recv, by: 'B' });
  ok(!fx.deny, 'unity: ' + (fx.deny || ''));
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper), 'hypersense offered on unity');
  ok(!st.inst[giver].tapped, 'unity not applied until skip/use');
  apply(st, { type: 'reactNo', by: 'A' });
  ok(!!st.inst[giver].tapped, 'unity applies after skip hypersense');
  ok((st.buffs || []).some(b => b.k === recv && b.unity), 'unity buff on receiver');
}

/* 4e) Hypersense: โล่มนุษย์ — ใช้แล้วยกเลิกโล่ */
{
  const st = emptyState();
  const atk = put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const def = put(st, 'B.avatar', 'SD01-002');
  const sh = put(st, 'B.avatar', 'SD01-003');
  st.inst[sh].grantedKeywords = [{ kw: 'โล่มนุษย์' }];
  st.phase = 'Battle';
  st.active = 'A';
  apply(st, { type: 'declareAttack', atk, def, by: 'A' });
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && st.prompts[0].chooser === 'B')
    apply(st, { type: 'reactNo', by: 'B' });
  ok(!!st.pending && st.pending.def === def, 'attack pending on def');
  let fx = apply(st, { type: 'humanShield', k: sh, by: 'B' });
  ok(!fx.deny, 'humanShield: ' + (fx.deny || ''));
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper), 'hypersense offered on human shield');
  apply(st, { type: 'reactYes', k: hyper, by: 'A' });
  ok(!!st.inst[sh].nullifyUntilEOT, 'shield avatar nullified');
  ok(!st.inst[sh].tapped, 'shield cancelled — not tapped');
  ok(st.pending && st.pending.def === def, 'attack still on original def');
}

/* 4f) Hypersense: อัตโนมัติตอนโจมตี (พระนารายณ์ POWER +2) */
{
  const st = emptyState();
  const def = put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const narai = put(st, 'B.avatar', 'SD01-002');
  st.phase = 'Battle';
  st.active = 'B';
  const base = BoT.effPower(st, narai);
  apply(st, { type: 'declareAttack', atk: narai, def, by: 'B' });
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact && (p.options || []).includes(hyper));
  ok(react, 'hypersense offered on attack auto: ' + JSON.stringify((st.prompts || []).map(p => p.kind + ':' + (p.reactTrigger || '') + '@' + p.chooser)));
  ok((st.prompts || [])[0] && (st.prompts || [])[0].abilityReact, 'hypersense is first window before combat react');
  ok(BoT.effPower(st, narai) === base, 'auto POWER not applied before hypersense');
  apply(st, { type: 'reactNo', by: 'A' });
  ok(BoT.effPower(st, narai) > base, 'auto POWER applied after skip hypersense');
}

/* 4g) Hypersense: ใช้ตอนอัตโนมัติโจมตี — ยกเลิกบัฟ แต่การโจมตียังค้าง */
{
  const st = emptyState();
  const def = put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const narai = put(st, 'B.avatar', 'SD01-002');
  st.phase = 'Battle';
  st.active = 'B';
  const base = BoT.effPower(st, narai);
  apply(st, { type: 'declareAttack', atk: narai, def, by: 'B' });
  apply(st, { type: 'reactYes', k: hyper, by: 'A' });
  ok(!!st.inst[narai].nullifyUntilEOT, 'narai nullified');
  ok(BoT.effPower(st, narai) === base, 'auto POWER cancelled by hypersense');
  ok(!!st.inst[narai].tapped, 'attack still declared (tapped)');
}

/* 5) Extra Skill React จากครุฑ */
{
  const st = emptyState();
  const garuda = put(st, 'A.avatar', 'BT09-044');
  st.inst[garuda].granted = [{
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    extraReactSkillUnusedName: true,
    actions: []
  }];
  put(st, 'A.hand', 'BT01-039'); // เจ้ากล้า — ใช้ React โควต้าแรก
  const hyper = put(st, 'A.hand', 'BT09-059');
  put(st, 'A.avatar', 'BT09-043');
  const enemy = put(st, 'B.avatar', 'BT09-042');
  put(st, 'B.hand', 'BT09-043');
  st.magicUsed.A.React = true;
  st._reactNamesUsed = { A: ['เจ้ากล้าดียังไง'] };
  st.phase = 'Main';
  st.active = 'B';
  apply(st, { type: 'activateAbility', k: enemy, by: 'B' });
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper), 'extra skill react still offered after react used');
}

/* 6) Full Drive: นรก Magic 8 → จั่ว */
{
  const st = emptyState();
  const fd = put(st, 'A.hand', 'BT09-056');
  const story = put(st, 'A.deck', 'BT09-043');
  const draw = put(st, 'A.deck', 'BT01-038');
  for (let i = 0; i < 8; i++) put(st, 'A.hell', 'BT09-059');
  apply(st, { type: 'playMagic', k: fd, by: 'A' });
  skipNegate(st);
  ok(st.prompts.length && st.prompts[0].kind === 'chooseMode', 'full drive chooseMode');
  apply(st, { type: 'chooseMode', k: fd, opt: 0, by: 'A' });
  const pick = (st.prompts || []).find(p => p.kind === 'pick');
  ok(pick, 'full drive deck pick');
  apply(st, { type: 'chooseTarget', k: story, by: 'A' });
  ok(zone(st, story) === 'A.hand', 'story to hand');
  ok(zone(st, draw) === 'A.hand', 'drew because 8 magic in hell');
}

/* 7) ใบรับสมัครพนักงานลงกา: ขวัญตา Cost 4 −2 ต้องจ่ายอีก 2 ก่อนลง */
{
  const st = emptyState();
  st.turnSeq = 3;
  const app = put(st, 'A.magic', 'CC02-044');
  st.inst[app].magicEnteredTurnSeq = 1;
  const khwan = put(st, 'A.hand', 'BT09-042');
  const pay1 = put(st, 'A.hand', 'SD01-017');
  const pay2 = put(st, 'A.hand', 'SD02-018');
  const fx = apply(st, { type: 'activateAbility', k: app, by: 'A' });
  ok(!fx.deny, 'activate ใบรับสมัคร: ' + (fx.deny || ''));
  ok(zone(st, app) === 'A.hell', 'ใบรับสมัครถูกทำลาย');
  const pick = (st.prompts || [])[0];
  ok(pick && pick.kind === 'pick' && pick.dest === 'avatar' && (pick.options || pick.ids || []).includes(khwan),
    'เลือกขวัญตาจากมือ: ' + ((pick && pick.dest) || ''));
  apply(st, { type: 'chooseTarget', k: khwan, by: 'A' });
  const pay = (st.prompts || [])[0];
  ok(pay && pay.dest === 'payRemainSummon' && pay.need === 2 && pay.summonK === khwan,
    'ต้องจ่าย Cost เหลือ 2: ' + JSON.stringify(pay && { dest: pay.dest, need: pay.need }));
  ok(zone(st, khwan) === 'A.hand', 'ขวัญตายังไม่ลงจนกว่าจะจ่ายครบ');
  apply(st, { type: 'chooseTarget', k: pay1, by: 'A' });
  ok(zone(st, khwan) === 'A.hand', 'จ่าย 1 ใบแล้วยังไม่ลง');
  apply(st, { type: 'chooseTarget', k: pay2, by: 'A' });
  ok(zone(st, khwan) === 'A.avatar', 'จ่ายครบ 2 แล้วขวัญตาลงสนาม');
  ok(zone(st, pay1) === 'A.hell' && zone(st, pay2) === 'A.hell', 'ใบจ่ายลงนรก');
  ok((st.inst[khwan].costDelta || 0) === -2, 'Cost −2 บนสนาม');
}

/* 8) ใบรับสมัคร: GEM ไม่พอ — เลือกขวัญตาไม่ได้ */
{
  const st = emptyState();
  st.turnSeq = 3;
  const app = put(st, 'A.magic', 'CC02-044');
  st.inst[app].magicEnteredTurnSeq = 1;
  const khwan = put(st, 'A.hand', 'BT09-042');
  apply(st, { type: 'activateAbility', k: app, by: 'A' });
  const pick = (st.prompts || [])[0];
  ok(!pick || !(pick.ids || []).includes(khwan), 'ขวัญตา Cost 4 ไม่โผล่ถ้า GEM ไม่พอจ่ายเหลือ 2');
}

console.log('all story deck tests passed');
