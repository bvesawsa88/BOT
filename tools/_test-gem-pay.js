/* focused: ห้ามจ่าย GEM 0 และห้ามชุดจ่ายที่มีใบเกินจำเป็น */
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
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    attacksThisTurn: { A: 0, B: 0 }, skipLethalPlead: true
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
    cost: c.cost, gem: c.gem, power: c.power, ex: c.ex || '', effect: c.effect || '—',
    img: c.imageUrl || '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone] = st.zones[zone] || [];
  st.zones[zone].push(k);
  return k;
}
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }

function trySummon(st, av, payIds, seed) {
  return BoT.applyAction(st, { type: 'summon', k: av, to: 'A.avatar', payIds, by: 'A', seed: seed || 1 });
}

{
  const st = emptyState();
  const av = put(st, 'A.hand', 'SD01-003', { cost: 3 });
  const g4 = put(st, 'A.hand', 'SD01-006', { gem: 4, gemColor: 'ขาว' });
  const g2 = put(st, 'A.hand', 'SD01-003', { gem: 2, gemColor: 'ขาว' });
  const fx = trySummon(st, av, [g4, g2], 11);
  ok(!!fx.deny && /เกิน/.test(fx.deny), 'cost 3 cannot pay 4+2: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  const av = put(st, 'A.hand', 'SD01-003', { cost: 3 });
  const a = put(st, 'A.hand', 'SD01-003', { gem: 2, gemColor: 'ขาว' });
  const b = put(st, 'A.hand', 'SD01-003', { gem: 2, gemColor: 'ขาว' });
  const fx = trySummon(st, av, [a, b], 12);
  ok(!fx.deny, 'cost 3 can pay 2+2: ' + (fx.deny || 'ok'));
  ok(BoT.zoneOf(st, av) === 'A.avatar', 'summoned with 2+2');
}

{
  const st = emptyState();
  const av = put(st, 'A.hand', 'SD01-003', { cost: 3 });
  const g4 = put(st, 'A.hand', 'SD01-006', { gem: 4, gemColor: 'ขาว' });
  const fx = trySummon(st, av, [g4], 13);
  ok(!fx.deny, 'cost 3 can pay a single 4: ' + (fx.deny || 'ok'));
}

{
  const st = emptyState();
  const av = put(st, 'A.hand', 'SD01-003', { cost: 3 });
  const z = put(st, 'A.hand', 'SD01-003', { gem: 0, gemColor: 'ขาว' });
  const g3 = put(st, 'A.hand', 'SD01-003', { gem: 3, gemColor: 'ขาว' });
  const fx = trySummon(st, av, [z, g3], 14);
  ok(!!fx.deny && /GEM 0/.test(fx.deny), 'cannot include GEM 0: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  const av = put(st, 'A.hand', 'SD01-003', { cost: 5 });
  const a = put(st, 'A.hand', 'SD01-006', { gem: 4, gemColor: 'ขาว' });
  const b = put(st, 'A.hand', 'SD01-006', { gem: 4, gemColor: 'ขาว' });
  const fx = trySummon(st, av, [a, b], 15);
  ok(!fx.deny, 'cost 5 can pay 4+4: ' + (fx.deny || 'ok'));
}

ok(typeof BoT.gemPayDenyMsg === 'function', 'exports gemPayDenyMsg');

console.log('all ok');
