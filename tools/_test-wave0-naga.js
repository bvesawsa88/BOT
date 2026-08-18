/* focused: คลื่น 0 SL02-010 อนันต์ + SL02-001 อนันตวดี */
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
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}
function skipWindows(st) {
  let n = 0;
  while ((st.prompts || [])[0] && n++ < 12) {
    const pr = st.prompts[0];
    if (pr.kind === 'react' || pr.magicNegate || pr.mode === 'negateMagic') {
      const fx = apply(st, { type: 'reactNo', by: pr.chooser, seed: 80 + n });
      if (fx.deny) fail('skip react: ' + fx.deny);
      continue;
    }
    break;
  }
}

/* 1) อนันต์: สั่งใช้ — นาคสัตว์วิเศษใบอื่น POWER = ตัวเอง · ไม่แตะแม่นาค */
{
  const st = emptyState();
  padDecks(st);
  const king = put(st, 'A.avatar', 'SL02-010'); // P7
  const era = put(st, 'A.avatar', 'SL02-009'); // P1
  const ghost = put(st, 'A.avatar', 'BT03-022'); // แม่นาค ผี
  const foe = put(st, 'B.avatar', 'BT06-001');
  const ghostP = BoT.effPower(st, ghost);
  const foeP = BoT.effPower(st, foe);
  const fx = apply(st, { type: 'activateAbility', k: king, by: 'A', seed: 1 });
  ok(!fx.deny, 'ananta activate: ' + (fx.deny || ''));
  ok(BoT.effPower(st, era) === BoT.effPower(st, king), 'era power = ananta: ' + BoT.effPower(st, era));
  ok(BoT.effPower(st, ghost) === ghostP, 'ghost naga unchanged: ' + BoT.effPower(st, ghost));
  ok(BoT.effPower(st, foe) === foeP, 'enemy naga unchanged');
}

/* 2) อนันต์: ฆ่าจากการต่อสู้ → หงาย LIFE บนสุดศัตรู */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  padDecks(st);
  const king = put(st, 'A.avatar', 'SL02-010');
  const weak = put(st, 'B.avatar', 'SD01-011');
  const life = put(st, 'B.life', 'SD01-021');
  st.inst[life].faceUp = false;
  let fx = apply(st, { type: 'declareAttack', atk: king, def: weak, by: 'A', seed: 10 });
  if (fx.deny) fail('ananta declare deny: ' + fx.deny);
  skipWindows(st);
  if (st.pending) {
    fx = apply(st, { type: 'resolveAttack', by: 'B', seed: 11 });
    if (fx.deny) fail('ananta resolve deny: ' + fx.deny);
  }
  ok(BoT.zoneOf(st, weak) === 'B.hell', 'weak destroyed');
  ok(st.inst[life].faceUp === true, 'opp life top revealed');
}

/* 3) อนันตวดี: จ่ายอัญเชิญอนันต์ได้ (GEM 6) และนาคที่ได้ +3 · จ่ายเทพไม่ได้ */
{
  const e = BoT.effectOf('SL02-001');
  ok(e && e.costOnlyForSymbol === 'สัตว์วิเศษ', 'wadi costOnlyForSymbol');
  ok(e && e.gemAsCostValue === 6 && e.gemAsCostForNameIncludes.indexOf('อนันต์') >= 0, 'wadi gem 6 for ananta');
}
{
  const st = emptyState();
  padDecks(st);
  const god = put(st, 'A.hand', 'SD01-003');
  const pay = put(st, 'A.hand', 'SL02-001');
  const fx = apply(st, { type: 'summon', k: god, to: 'A.avatar', payIds: [pay], by: 'A', seed: 20 });
  ok(!!fx.deny && /สัตว์วิเศษ/.test(fx.deny), 'cannot pay for เทพ: ' + (fx.deny || 'no deny'));
}
{
  const st = emptyState();
  padDecks(st);
  const king = put(st, 'A.hand', 'SL02-010');
  const pay = put(st, 'A.hand', 'SL02-001');
  const p0 = byCode('SL02-010').power;
  const fx = apply(st, { type: 'summon', k: king, to: 'A.avatar', payIds: [pay], by: 'A', seed: 21 });
  ok(!fx.deny, 'pay for ananta: ' + (fx.deny || ''));
  ok(BoT.zoneOf(st, king) === 'A.avatar', 'ananta summoned');
  ok(BoT.effPower(st, king) === p0 + 3, 'ananta +3 from wadi pay: ' + BoT.effPower(st, king));
}

console.log('wave0 naga royals: all passed');
