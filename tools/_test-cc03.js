/* CC03: ทดสอบความสามารถผ่าน applyAction */
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
  const c = /^[A-Z0-9]+-\d/.test(key) ? byCode(key) : byName(key);
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
function run(title, fn) { try { fn(); } catch (e) { failures.push(title + ': ' + e.message); console.error('ERROR', title, e.stack.split('\n').slice(0, 3).join(' | ')); } }
const CC = n => 'CC03-' + n;
const pr = st => st.prompts[0];
const kind = st => pr(st) && pr(st).kind;
const dest = st => pr(st) && pr(st).dest;
const game = extra => { const st = fresh(extra); fill(st, 'A', 12); fill(st, 'B', 12); return st; };
const named = (st, zone, name, over) => vanilla(st, zone, Object.assign({ name }, over));
const eff = (st, k) => BoT.effPower(st, k);
const pays = (st, side, color, n) => { const a = []; for (let i = 0; i < n; i++) a.push(vanilla(st, side + '.hand', { name: 'จ่าย', gem: 5, gemColor: color, color, cost: 9 })); return a; };
const summon = (st, code, color) => {
  const k = put(st, 'A.hand', CC(code));
  const payIds = [vanilla(st, 'A.hand', { name: 'จ่าย', gem: +st.inst[k].cost, gemColor: st.inst[k].color, cost: 9 })];
  const fx = act(st, { type: 'summon', k, to: 'A.avatar', payIds, by: 'A' });
  ok(!fx.deny, code + ' อัญเชิญ ' + fx.deny);
  return k;
};
const cast = (st, k, by) => { const fx = act(st, { type: 'playMagic', k, by: by || 'A' }); drain(st); return fx; };
const attack = (st, a, d, by) => { st.phase = 'Battle'; return act(st, { type: 'declareAttack', atk: a, def: d, by: by || 'A' }); };
const resolve = st => { let n = 0; while (st.pending && n++ < 5) { if (pr(st) && pr(st).kind === 'react') act(st, { type: 'reactNo', by: pr(st).chooser }); else if (pr(st)) break; else act(st, { type: 'resolveAttack', by: st.pending.target }); } };
const link = (st, a, b) => { st.inst[a].pairWith = b; st.inst[b].pairWith = a; };
const equip = (st, code, host) => { const m = put(st, 'A.magic', CC(code)); const fx = act(st, { type: 'attach', k: m, to: host, by: 'A' }); return { m, fx }; };

run('001-002', () => {
  const st = game();
  const nar = put(st, 'A.deck', CC('002'));
  const isv = summon(st, '001');
  ok(dest(st) === 'cardSummon', '001 เลือกพระนารายณ์'); choose(st, nar);
  ok(has(st, 'A.avatar', nar), '001 อัญเชิญจากเด็ค');
  const ac = { srcK: isv, byOpp: true, fromOppCard: true };
  act(st, { type: 'destroyCard', k: nar, by: 'A' });
  ok(has(st, 'A.avatar', nar), '001 ไม่ถูกทำลายจากความสามารถจนจบเทิร์น');
  ok(!!use(st, isv).deny, '001 ไม่ Link สั่งใช้ไม่ได้');
  link(st, isv, nar);
  const foe = vanilla(st, 'B.avatar');
  ok(!use(st, isv).deny, '001 Link แล้วใช้ได้'); choose(st, foe);
  ok(has(st, 'B.hell', foe), '001 ทำลาย');
  ok(dest(st) === 'powerPick', '001 เลือกบัฟ'); choose(st, nar); ok(eff(st, nar) === 7, '001 +2');
  st.turnSeq++; ok(st.inst[nar].abilityDestroyImmuneSeq !== st.turnSeq, '001 หมดเทิร์น');
  act(st, { type: 'destroyCard', k: nar, by: 'A' }); ok(has(st, 'A.avatar', nar), '002 Link แล้วไม่ถูกทำลายจากความสามารถ');
  delete st.inst[nar].pairWith;
  act(st, { type: 'destroyCard', k: nar, by: 'A' }); ok(has(st, 'A.hell', nar), '002 ไม่ Link ถูกทำลายได้');
});

run('003', () => {
  let st = game();
  const k = put(st, 'A.avatar', CC('003')); const h = named(st, 'A.hell', 'เทพนรก', { symbol: 'เทพ' });
  const top = named(st, 'A.deck', 'เทพบน', { symbol: 'เทพ' });
  ok(!use(st, k).deny, '003 ใช้ได้'); choose(st, h); ok(has(st, 'A.dark', h), '003 เนรเทศจ่าย'); choose(st, top);
  ok(has(st, 'A.hand', top), '003 เทพขึ้นมือ');
  st = game();
  const g = named(st, 'A.avatar', 'เทพต่อย', { symbol: 'เทพ', power: 9 }); const d = vanilla(st, 'B.avatar', { power: 1 });
  const me = put(st, 'A.hell', CC('003')); const tgt = named(st, 'A.hell', 'เทพเป้า', { symbol: 'เทพ' });
  attack(st, g, d); resolve(st); ok(has(st, 'B.hell', d), '003 เทพฆ่า');
  act(st, { type: 'endTurn', by: 'A' }); ok(dest(st) === 'indraExile', '003 ถาม End Phase');
  choose(st, me); choose(st, tgt); ok(has(st, 'A.dark', me) && has(st, 'A.hand', tgt), '003 เนรเทศแล้วนำเทพขึ้นมือ');
  ok(st.active === 'B', '003 จบเทิร์นต่อเอง');
  st = game(); put(st, 'A.hell', CC('003')); named(st, 'A.hell', 'เทพเป้า', { symbol: 'เทพ' });
  act(st, { type: 'endTurn', by: 'A' }); ok(st.active === 'B', '003 ไม่ได้ฆ่า ไม่ถาม');
});

run('004', () => {
  let st = game({ active: 'B' });
  const k = put(st, 'A.hand', CC('004')); const mig = named(st, 'A.avatar', 'หุ่นนักรบผู้กล้า : ไมเกรน', { symbol: 'หุ่นยนต์', power: 1 });
  const w = put(st, 'A.hell', CC('049'));
  act(st, { type: 'destroyCard', k: mig, by: 'B' });
  ok(kind(st) === 'react', '004 เสนอจากมือ'); choose(st, k);
  ok(has(st, 'A.avatar', k), '004 ลงสนาม'); choose(st, w);
  ok(st.inst[w].attachedTo === k, '004 ติดอาวุธจากนรก');
  st = game(); const m2 = named(st, 'A.avatar', 'ไมเกรน', { power: 1 }); put(st, 'A.hand', CC('004'));
  act(st, { type: 'destroyCard', k: m2, by: 'A' }); ok(!pr(st), '004 เทิร์นเราไม่เสนอ');
  st = game(); const p = put(st, 'A.avatar', CC('004')); st.buffs.push({ k: p, amt: 3, until: 'permanent' });
  const big = named(st, 'A.hell', 'ไมเกรนใหญ่', { power: 6 }); const tooBig = named(st, 'A.hell', 'ไมเกรนยักษ์', { power: 7 });
  const mod = put(st, 'A.magic', CC('049'), { attachedTo: p });
  act(st, { type: 'setPhase', phase: 'Battle', by: 'A' });
  ok(dest(st) === 'postdromeEvolve' && !BoT.promptTargetOk(st, tooBig), '004 เริ่ม Battle เลือก'); choose(st, big);
  ok(has(st, 'A.hell', p) && has(st, 'A.avatar', big) && st.inst[mod].attachedTo === big, '004 แทนที่และย้ายใบสวม');
  st = game(); put(st, 'A.avatar', CC('004')); named(st, 'A.hell', 'ไมเกรน', { power: 1 });
  act(st, { type: 'setPhase', phase: 'Battle', by: 'A' }); ok(!pr(st), '004 POWER ไม่ถึง 6');
});

[['005', 'แดง'], ['012', 'ฟ้า'], ['018', 'ม่วง'], ['023', 'เขียว']].forEach(([c, col]) => run(c + ' สอดแนม 2', () => {
  const st = game();
  const good = vanilla(st, 'A.hell', { color: col, cost: 4 }), dear = vanilla(st, 'A.hell', { color: col, cost: 5 });
  const only = vanilla(st, 'A.hell', { color: col, cost: 1, ex: 'Only #1' }), wrong = vanilla(st, 'A.hell', { color: col === 'แดง' ? 'ฟ้า' : 'แดง', cost: 1 });
  const top = st.zones['A.deck'].slice(-2);
  summon(st, c);
  ok(kind(st) === 'pick' && BoT.promptTargetOk(st, good), c + ' Cost 4 ได้');
  ok(![dear, only, wrong].some(x => BoT.promptTargetOk(st, x)), c + ' กรอง Cost/Only/สี');
  ok(top.every(x => st.zones['A.deck'].slice(0, 2).includes(x)), c + ' ไว้ใต้เด็ค');
  choose(st, good); ok(has(st, 'A.hand', good), c + ' ขึ้นมือ');
}));
run('005 POWER ตั้งต้น 5', () => { const st = game(); const k = put(st, 'A.avatar', CC('005')); for (let i = 0; i < 2; i++) vanilla(st, 'A.avatar'); ok(eff(st, k) === 0, '005 3 ใบ'); vanilla(st, 'A.avatar'); ok(eff(st, k) === 5, '005 4 ใบ = ' + eff(st, k)); });

run('006', () => {
  let st = game(); const k = put(st, 'A.hand', CC('006'));
  ok(!!use(st, k).deny, '006 ไม่ครบใช้ไม่ได้');
  ok(!!act(st, { type: 'summon', k, to: 'A.avatar', payIds: pays(st, 'A', 'ฟ้า', 2), by: 'A' }).deny, '006 จ่าย GEM ไม่ได้');
  const a = named(st, 'A.hell', 'กุ่ย'), b = named(st, 'A.avatar', 'ฮอล'), c = named(st, 'A.hell', 'นาย');
  ok(!use(st, k).deny, '006 ใช้ได้'); choose(st, a); choose(st, b); choose(st, c);
  ok(has(st, 'A.avatar', k) && [a, b, c].every(x => has(st, 'A.dark', x)), '006 เนรเทศ 3 แล้วลงสนาม');
  st.inst[k].tapped = true; act(st, { type: 'endTurn', by: 'A' }); ok(!st.inst[k].tapped, '006 End Phase ตื่น');
  ok(BoT.hasKw(st, k, 'โล่มนุษย์'), '006 โล่มนุษย์');
});

run('007', () => {
  let st = game(); let k = put(st, 'A.avatar', CC('007')); const lo = vanilla(st, 'A.avatar', { cost: 2 }), hi = vanilla(st, 'A.avatar', { cost: 3 });
  ok(!use(st, k).deny, '007 ใช้'); if (kind(st) === 'chooseMode') mode(st, 0);
  ok(!BoT.promptTargetOk(st, hi), '007 Cost 3 ไม่ได้'); choose(st, lo); ok(BoT.hasKw(st, lo, 'สามัคคี'), '007 สามัคคี');
  ok(!!use(st, k).deny, '007 เทิร์นละครั้ง');
  st = game(); k = put(st, 'A.avatar', CC('007')); const dis = vanilla(st, 'A.hand'); const t = vanilla(st, 'A.hell', { cost: 2, color: 'แดง' }), pur = vanilla(st, 'A.hell', { cost: 2, color: 'ม่วง' });
  use(st, k); mode(st, 1); choose(st, dis); ok(!BoT.promptTargetOk(st, pur), '007 ม่วงไม่ได้'); choose(st, t); ok(has(st, 'A.avatar', t), '007 อัญเชิญจากนรก');
});

run('008', () => { const st = game(); const k = put(st, 'A.avatar', CC('008')); act(st, { type: 'endTurn', by: 'A' }); ok(eff(st, k) === 7, '008 -1'); act(st, { type: 'endTurn', by: 'B' }); ok(eff(st, k) === 7, '008 เทิร์นอีกฝ่ายไม่ลด'); });

run('009', () => {
  const st = game(); const k = put(st, 'A.hand', CC('009')); ok(!!use(st, k).deny, '009 ไม่ครบ');
  const q = put(st, 'A.hand', 'BT07-019'); named(st, 'A.hand', 'พลทหารหิมะ'); ok(!!use(st, k).deny, '009 แค่ 2 ชื่อ'); named(st, 'A.hand', 'เพนกวินหิมะ');
  for (let i = 0; i < 8; i++) named(st, 'A.hell', 'พลทหารหิมะ'); const foe = vanilla(st, 'B.avatar');
  ok(!use(st, k).deny && has(st, 'A.avatar', k), '009 ลงสนาม'); choose(st, foe); ok(has(st, 'B.hell', foe), '009 ทำลาย 1 ใบ');
  ok(dest(st) === 'cardSummon', '009 เสนอราชินี'); choose(st, q); ok(has(st, 'A.avatar', q), '009 ราชินีลงสนาม');
  const killer = put(st, 'B.avatar', 'BT08-005'); st.active = 'B'; st.prompts = [{ kind: 'chooseDestroy', src: killer, chooser: 'B', filter: {}, zones: ['avatar'], side: 'enemy' }];
  choose(st, k); ok(has(st, 'A.avatar', k), '009 ไม่ถูกทำลายจากความสามารถฝ่ายตรงข้าม');
});

run('010', () => {
  const st = game(); const a = put(st, 'A.deck', CC('010')); const b = named(st, 'A.deck', 'สิ่งปฏิกูลมีชีวิต');
  const k = summon(st, '010'); const hell0 = st.zones['A.hell'].length;
  choose(st, a); ok(has(st, 'A.avatar', a), '010 ลงสนาม'); ok(st.zones['A.hell'].length === hell0 + 2 && has(st, 'A.hell', b), '010 ที่เหลือลงนรก');
  ok(kind(st) === 'pick', '010 ถูกอัญเชิญด้วยสิ่งปฏิกูล → ทำจุติ');
});

run('011', () => {
  let st = game(); let k = summon(st, '011'); ok(!pr(st), '011 ไม่มีบึงทมิฬ');
  st = game(); put(st, 'land', 'บึงทมิฬ', { name: 'บึงทมิฬ' }); const f1 = vanilla(st, 'B.avatar'), f2 = vanilla(st, 'B.avatar', { tapped: true }), f3 = vanilla(st, 'B.avatar');
  k = summon(st, '011'); choose(st, f1); ok(has(st, 'B.hell', f1) && has(st, 'B.hell', f2) && has(st, 'B.avatar', f3) && has(st, 'A.avatar', k), '011 ทำลายที่นอนทั้งหมด');
});

run('012 จั่ว', () => { const st = game(); put(st, 'A.avatar', CC('012')); const a = vanilla(st, 'B.avatar'), b = vanilla(st, 'B.avatar'); act(st, { type: 'destroyCard', k: a, by: 'A' }); act(st, { type: 'destroyCard', k: b, by: 'A' }); ok(st.zones['A.hand'].length === 1, '012 จั่วเทิร์นละครั้ง'); });

run('013', () => {
  const st = game(); const d = named(st, 'A.deck', 'นายนิรยบาล แว่น', { gem: 3, gemColor: 'ม่วง', cost: 2 });
  const k = put(st, 'A.hand', CC('013')); const p = vanilla(st, 'A.hand', { gem: 3, gemColor: 'ม่วง' });
  const fx = act(st, { type: 'summon', k, to: 'A.avatar', payIds: [p], by: 'A' }); ok(!fx.deny && has(st, 'A.hell', d), '013 ใช้ GEM จากเด็ค ' + fx.deny);
  choose(st, d); ok(has(st, 'A.avatar', d), '013 อัญเชิญจากนรก');
});

run('014', () => { const st = game(); const m = put(st, 'A.deck', 'BT11-064'); const bad = put(st, 'A.deck', 'APFD-001'); const k = summon(st, '014'); ok(!BoT.promptTargetOk(st, bad), '014 กรอง'); choose(st, m); ok(has(st, 'A.hand', m) && BoT.hasKw(st, k, 'ลูกฮึด'), '014 ค้น + ลูกฮึด'); });

run('016', () => {
  const st = game(); st.zones['A.deck'].forEach(x => { st.inst[x].cost = 9; }); st.zones['B.deck'].forEach(x => { st.inst[x].cost = 1; });
  const a = vanilla(st, 'A.avatar'), b = vanilla(st, 'B.avatar'); const k = summon(st, '016');
  ok(has(st, 'B.hell', b) && eff(st, a) === 5 && eff(st, k) === 5, '016 ชนะ +2 และกวาด');
  const s2 = game(); const c = vanilla(s2, 'B.avatar'); summon(s2, '016'); ok(has(s2, 'B.avatar', c), '016 เท่ากันไม่เกิดอะไร');
});

run('017', () => {
  let st = game(); const foe = vanilla(st, 'B.avatar'); for (let i = 0; i < 8; i++) named(st, 'A.hell', 'แบงค์' + i); summon(st, '017'); choose(st, foe); ok(has(st, 'B.dark', foe), '017 เนรเทศ');
  st = game(); const f2 = vanilla(st, 'B.avatar'); for (let i = 0; i < 8; i++) named(st, 'A.hell', 'แบงค์'); summon(st, '017'); ok(!pr(st), '017 ชื่อซ้ำไม่นับ');
  st = game(); const k = put(st, 'A.avatar', CC('017')); const d = vanilla(st, 'B.avatar', { power: 4 }); named(st, 'A.deck', 'อัศวินแบงค์');
  attack(st, k, d); ok(dest(st) === 'bankMill', '017 ถามธรณีสูบ ' + dest(st)); choose(st, k); ok(dest(st) === 'powerPick', '017 เจอแบงค์'); choose(st, d); ok(eff(st, d) === 3, '017 -1');
});

run('018 เรียงบน', () => { const st = game(); const k = put(st, 'A.avatar', CC('018')); ok(!use(st, k).deny && st.scout.ids.length === 3, '018 สอดแนม 3'); ok(!!act(st, { type: 'scoutEnd', where: 'bottom', by: 'A' }).deny, '018 ใต้ไม่ได้'); ok(!act(st, { type: 'scoutEnd', where: 'top', by: 'A' }).deny && !st.scout, '018 บนได้'); });

run('019-020', () => {
  let st = game(); const h = put(st, 'A.hell', 'BT02-037', { name: 'เครื่องบิน Super Air', type: 'Magic', subtype: 'Normal' }); const d = put(st, 'A.deck', 'BT02-037', { name: 'เครื่องบิน Super Air', type: 'Magic', subtype: 'Normal' });
  const k = summon(st, '019'); choose(st, h); choose(st, d); ok(has(st, 'A.dark', h) && has(st, 'A.hand', d), '019 เนรเทศแล้วค้น');
  act(st, { type: 'destroyCard', k, by: 'A' }); choose(st, h); ok(st.zones['A.deck'][0] === h, '019 คำสั่งเสียใต้เด็ค');
  st = game(); const dk = put(st, 'A.dark', 'APFD-001', { name: 'เครื่องบิน Super Air' }); summon(st, '020'); if (pr(st)) choose(st, dk); ok(has(st, 'A.hand', dk), '020 มิติมืดขึ้นมือ');
  const n1 = put(st, 'A.hand', 'APFD-001'), n2 = put(st, 'A.hand', 'APFD-001');
  ok(!cast(st, n1).deny && !!cast(st, n2).deny, '020 Normal ปกติใบเดียว'); ok(!cast(st, dk).deny, '020 เครื่องบินเพิ่มได้');
});

run('021', () => {
  const st = game(); const k = put(st, 'A.hand', CC('021')); const t = [0, 1, 2].map(() => named(st, 'A.magic', 'ต้นมะม่วง', { symbol: 'ต้นไม้' }));
  ok(!use(st, k).deny, '021 ใช้'); choose(st, t[0]); choose(st, t[1]); ok(has(st, 'A.avatar', k), '021 ลงสนาม'); ok(BoT.cardSymbols(st, k).includes('มังกร'), '021 นับเป็นมังกร');
  act(st, { type: 'destroyCard', k: t[2], by: 'A' }); ok(has(st, 'A.hell', k), '021 ไม่มีต้นไม้ → ลงนรก');
});

run('022', () => {
  const st = game(); const k = put(st, 'A.avatar', CC('022')); const v = vanilla(st, 'A.avatar', { tapped: true });
  ok(!use(st, k).deny && has(st, 'A.magic', k), '022 ไป Magic Zone'); ok(!!use(st, k).deny, '022 เทิร์นละครั้ง');
  const foe = vanilla(st, 'B.avatar', { power: 1 }); const a2 = vanilla(st, 'A.avatar', { power: 5 }); attack(st, a2, foe); resolve(st);
  const n = st.zones['A.hand'].length; act(st, { type: 'endTurn', by: 'A' }); ok(st.zones['A.hand'].length === n + 1, '022 End Phase จั่ว 1');
  act(st, { type: 'endTurn', by: 'B' }); ok(eff(st, v) === 3, '022 อยู่ Magic ไม่บัฟ');
  ok(!use(st, k).deny && has(st, 'A.avatar', k), '022 กลับ Avatar Zone'); st.inst[v].tapped = true; st.inst[a2].tapped = true;
  act(st, { type: 'endTurn', by: 'A' }); act(st, { type: 'endTurn', by: 'B' }); ok(eff(st, v) === 4, '022 เริ่ม Main มีตัวตื่น +1 = ' + eff(st, v));
  act(st, { type: 'endTurn', by: 'A' }); act(st, { type: 'endTurn', by: 'B' }); ok(eff(st, v) === 4, '022 ไม่มีใครตื่น ไม่บัฟ');
});

run('023 กันเวท', () => { const st = game(); const k = put(st, 'A.avatar', CC('023')); const v = vanilla(st, 'A.avatar'); ok(!use(st, k).deny, '023 ใช้'); choose(st, v); ok(st.inst[k].tapped, '023 นอน'); const m = put(st, 'B.magic', 'APFD-001'); st.prompts = [{ kind: 'pick', from: 'enemyAvatars', src: m, chooser: 'B', filter: {}, dest: 'hell' }]; ok(!BoT.promptTargetOk(st, v) && BoT.promptTargetOk(st, k), '023 เวทอีกฝ่ายเล็งไม่ได้'); });

run('028', () => {
  const st = game(); const k = put(st, 'A.avatar', CC('028'), { power: 9 }); const d = vanilla(st, 'B.avatar', { power: 1 });
  attack(st, k, d); resolve(st); ok(has(st, 'A.magic', d) && st.inst[d].name === 'ข้ารับใช้ของ มนุษย์ดาว R18' && BoT.cardSymbols(st, d).includes('เอเลี่ยน'), '028 เป็นข้ารับใช้');
  act(st, { type: 'destroyCard', k, by: 'A' }); ok(pr(st) && pr(st).chooser === 'B', '028 ฝ่ายตรงข้ามเลือก'); choose(st, d); ok(has(st, 'B.hell', d) && st.inst[d].name === 'ทดสอบ', '028 กลับนรกเจ้าของ ชื่อเดิม');
});

run('029 / 037', () => {
  const st = game(); put(st, 'A.avatar', CC('029')); const h = vanilla(st, 'A.avatar', { symbol: 'คน' }), o = vanilla(st, 'A.avatar', { symbol: 'ผี' }); ok(BoT.hasKw(st, h, 'สามัคคี') && !BoT.hasKw(st, o, 'สามัคคี'), '029 ออร่าสามัคคี');
  const s2 = game(); const k = put(s2, 'A.avatar', CC('037')); const a = vanilla(s2, 'B.avatar', { power: 9 }); s2.active = 'B'; attack(s2, a, k, 'B'); resolve(s2); ok(has(s2, 'A.avatar', k), '037 POWER 9 ฆ่าไม่ได้');
  const s3 = game(); const k3 = put(s3, 'A.avatar', CC('037')); const a3 = vanilla(s3, 'B.avatar', { power: 10 }); s3.active = 'B'; attack(s3, a3, k3, 'B'); resolve(s3); ok(has(s3, 'A.hell', k3), '037 POWER 10 ฆ่าได้');
});

run('041', () => {
  let st = game(); let k = put(st, 'A.hand', CC('041')); ok(!!cast(st, k).deny, '041 เงื่อนไขไม่ครบ');
  st = game(); k = put(st, 'A.hand', CC('041')); const nat = named(st, 'A.avatar', 'ไอ้นัท'); const mem = named(st, 'A.deck', 'มีมมิ'); const sw = put(st, 'A.deck', 'BT11-064');
  ok(!cast(st, k).deny, '041 ใช้'); if (kind(st) === 'chooseMode') mode(st, 0); choose(st, nat); choose(st, mem);
  ok(has(st, 'A.hell', mem) && st.inst[sw].attachedTo === nat, '041 สวมดาบ'); ok(has(st, 'A.hell', k), '041 เวทลงนรก'); ok(!!(st.magicUsed.A.Modification), '041 นับเป็น Mod');
  st = game(); k = put(st, 'A.hand', CC('041')); named(st, 'A.avatar', 'ชาช่า'); const hn = named(st, 'A.hell', 'เซอร์นัท'); cast(st, k); if (kind(st) === 'chooseMode') mode(st, 1); choose(st, hn); ok(has(st, 'A.hand', hn) && has(st, 'A.hell', k), '041 ข้อ 2');
  st = game(); k = put(st, 'A.hand', CC('041')); named(st, 'A.avatar', 'ชาช่า'); named(st, 'A.avatar', 'ไอ้นัท'); const h3 = named(st, 'A.hell', 'ไอ้นัท'); cast(st, k); ok(kind(st) === 'chooseMode', '041 เลือกข้อได้'); mode(st, 1); choose(st, h3); ok(has(st, 'A.hell', k), '041 เลือกข้อแล้วเวทลงนรก z=' + BoT.zoneOf(st, k));
});

run('042', () => { const st = game(); const k = put(st, 'A.hand', CC('042')); const a = vanilla(st, 'A.hand'); ok(!!cast(st, k).deny, '042 ต้องมี 2'); const b = vanilla(st, 'A.hand'); ok(!cast(st, k).deny, '042 ใช้'); choose(st, a); choose(st, b); ok(st.zones['A.hand'].length === 3 && st.zones['A.deck'].length === 11 && has(st, 'A.hell', k), '042 จั่ว 3'); });
run('043', () => { const st = game(); const k = put(st, 'A.hand', CC('043')); const ids = [0, 1, 2].map(() => vanilla(st, 'A.hell')); ok(!!cast(st, k).deny, '043 ไม่ครบ 5'); [0, 1].forEach(() => ids.push(vanilla(st, 'B.hell'))); const only = vanilla(st, 'B.hell', { ex: 'Only #1' }); ok(!cast(st, k).deny && !BoT.promptTargetOk(st, only), '043 กรอง Only'); ids.forEach(x => choose(st, x)); ok(has(st, 'A.dark', ids[0]) && has(st, 'B.dark', ids[4]) && has(st, 'A.hell', k), '043 เนรเทศ 5'); });
run('044', () => { const st = game(); const k = put(st, 'A.hand', CC('044')); ok(!!cast(st, k).deny, '044 ไม่มีเครื่องบิน'); const pl = named(st, 'A.avatar', 'เครื่องบิน Super Air'); const foe = vanilla(st, 'B.avatar'); const sa = named(st, 'A.hand', 'กัปตัน Super Air'); const fx = cast(st, k); ok(!fx.deny, '044 ใช้ ' + fx.deny); choose(st, pl); drain(st); choose(st, foe); ok(st.zones['B.deck'].slice(-1)[0] === foe, '044 บนสุดเด็ค'); choose(st, sa); ok(has(st, 'A.avatar', sa) && has(st, 'A.hell', k), '044 อัญเชิญ z=' + BoT.zoneOf(st, k)); });
run('045', () => {
  const st = game(); const k = put(st, 'A.hand', CC('045')); st.active = 'B'; ok(!!act(st, { type: 'playMagic', k, by: 'A' }).deny, '045 เล่นอิสระไม่ได้');
  const pik = put(st, 'B.hand', 'BT08-024'); put(st, 'land', 'BT08-065'); const c = put(st, 'B.avatar', 'BT08-026'); const old = vanilla(st, 'B.hell');
  ok(!use(st, c, 'B').deny, '045 B ธรณีสูบ'); const r = st.prompts.find(p => p.reactTrigger === 'enemyMill'); ok(!!r && st.zones['B.hell'].length === 4, '045 เปิดหน้าต่าง');
  if (r) { choose(st, k, 'A'); drain(st); choose(st, old, 'A'); }
  ok(has(st, 'B.dark', old) && has(st, 'A.hell', k), '045 เนรเทศ z=' + BoT.zoneOf(st, k));
  const n = st.zones['B.dark'].length; act(st, { type: 'millDeck', p: 'B', n: 2, by: 'B' }); ok(st.zones['B.dark'].length === n + 2, '045 เด็ค→นรก ถูกเนรเทศแทน');
});
run('046', () => { const st = game(); const r = vanilla(st, 'A.avatar', { symbol: 'ฤษี' }), x = vanilla(st, 'A.avatar'); ok(!!equip(st, '046', x).fx.deny, '046 ไม่ใช่ฤษี'); const { m, fx } = equip(st, '046', r); ok(!fx.deny && eff(st, r) === 6, '046 +3'); ok(!use(st, m).deny, '046 สั่งใช้'); choose(st, r); ok(st.zones['A.deck'][0] === m && eff(st, r) === 7, '046 ใต้เด็ค +1'); });
run('047', () => { const st = game(); const a = vanilla(st, 'A.avatar'), b = vanilla(st, 'B.avatar'); ok(!!equip(st, '047', b).fx.deny, '047 ฝ่ายตรงข้ามไม่ได้'); const { m } = equip(st, '047', a); ok(eff(st, a) === 5, '047 +2'); act(st, { type: 'endTurn', by: 'A' }); ok(has(st, 'A.hell', a) && has(st, 'A.hell', m), '047 End Phase ลงนรกทั้งคู่'); });
run('048', () => {
  let st = game(); const a = vanilla(st, 'A.avatar', { power: 1 }); put(st, 'A.magic', CC('047'), { attachedTo: a }); ok(!!equip(st, '048', a).fx.deny, '048 มีใบสวมแล้วไม่ได้');
  st = game(); const b = vanilla(st, 'A.avatar', { power: 1 }); let m = put(st, 'A.magic', CC('048'), { attachedTo: b }); const f = vanilla(st, 'B.avatar', { power: 5 }); st.active = 'B'; attack(st, f, b, 'B'); resolve(st); ok(has(st, 'A.avatar', b) && has(st, 'A.hell', m), '048 กันต่อสู้');
  st = game(); const c = vanilla(st, 'A.avatar'); m = put(st, 'A.magic', CC('048'), { attachedTo: c }); act(st, { type: 'destroyCard', k: c, by: 'A' }); ok(has(st, 'A.hell', c), '048 ไม่กันความสามารถ');
  st = game(); const d = vanilla(st, 'A.avatar', { power: 5 }); m = put(st, 'A.magic', CC('048'), { attachedTo: d }); attack(st, d, vanilla(st, 'B.avatar', { power: 1 })); ok(has(st, 'A.hell', m), '048 โจมตีแล้วแตก');
});
run('049', () => { const st = game(); const r = named(st, 'A.avatar', 'หุ่นนักรบผู้กล้า', { symbol: 'หุ่นยนต์', power: 6 }); const em = put(st, 'B.magic', 'APFD-001'); const { m, fx } = equip(st, '049', r); ok(!fx.deny && kind(st) === 'chooseDestroy', '049 สวม ' + fx.deny); choose(st, em); ok(has(st, 'B.hell', em), '049 ทำลาย Magic Zone'); const h = [vanilla(st, 'A.hand'), vanilla(st, 'A.hand')]; const d = vanilla(st, 'B.avatar', { power: 1 }); attack(st, r, d); ok(kind(st) === 'chooseDiscard', '049 ถามทิ้ง'); choose(st, h[0]); choose(st, h[1]); ok(!st.inst[r].tapped, '049 ตื่น'); });
run('050', () => { const st = game(); const k = put(st, 'land', CC('050')); const t = ['A', 'B'].map(s => st.zones[s + '.deck'].slice(-1)[0]); ok(!use(st, k).deny && kind(st) === 'chooseMode', '050 ใช้'); const fx = mode(st, 0); ok(!fx.deny && has(st, 'A.hand', t[0]) && has(st, 'B.hand', t[1]), '050 ขึ้นมือทั้งคู่ ' + fx.deny); ok(!!use(st, k).deny, '050 เทิร์นละครั้ง'); });
run('060', () => {
  const st = game(); const k = put(st, 'A.construct', CC('060')); const l1 = vanilla(st, 'A.life', { faceUp: false }), l2 = vanilla(st, 'A.life', { faceUp: true }), l3 = vanilla(st, 'A.life', { faceUp: true });
  ok(!!use(st, k).deny, '060 เงื่อนไขไม่ครบ'); st._lifeAbilitySeq = { A: st.turnSeq - 1 }; ok(!use(st, k).deny, '060 ใช้'); ok(!st.inst[l3].faceUp && st.inst[l2].faceUp && has(st, 'A.hell', k), '060 คว่ำใบล่างสุด');
  const s2 = game({ active: 'B' }); const z = vanilla(s2, 'A.life', { faceUp: false }); vanilla(s2, 'A.life', { faceUp: false }); const a = vanilla(s2, 'B.avatar'); s2.phase = 'Battle'; act(s2, { type: 'declareAttack', atk: a, life: z, by: 'B' }); resolve(s2); ok(s2.inst[z].faceUp && !(s2._lifeAbilitySeq || {}).A, '060 หงายจากการโจมตีไม่นับ');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
