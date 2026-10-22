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

console.log('--- Testing BT10-002 (พระอิศวร นักเต้น) ---');

// Test 1: สั่งใช้ -> จั่ว 1 ใบ และย้ายฝั่งไป B.avatar
{
  const st = emptyState({ active: 'A', phase: 'Main', turn: 2, turnSeq: 2 });
  const shiva = put(st, 'A.avatar', 'BT10-002');
  for (let i = 0; i < 5; i++) {
    put(st, 'A.deck', 'SD01-001', { faceUp: false });
    put(st, 'B.deck', 'SD01-001', { faceUp: false });
  }

  ok(BoT.zoneOf(st, shiva) === 'A.avatar', 'initially on A.avatar');
  ok(st.zones['A.hand'].length === 0, 'A hand initially empty');

  const fx = apply(st, { type: 'activateAbility', k: shiva, by: 'A' });
  ok(!fx.deny, 'activateAbility succeeds');
  ok(st.zones['A.hand'].length === 1, 'A drew 1 card');
  ok(BoT.zoneOf(st, shiva) === 'B.avatar', 'shiva moved to B.avatar');
  ok(!st.inst[shiva].cannotAttack, 'shiva does not have cannotAttack flag');

  // Test 2: B takes their turn and activates shiva back to A
  apply(st, { type: 'endTurn', by: 'A' });
  ok(st.active === 'B', 'turn passed to B');

  const fxB = apply(st, { type: 'activateAbility', k: shiva, by: 'B' });
  ok(!fxB.deny, 'B activateAbility succeeds');
  ok(BoT.zoneOf(st, shiva) === 'A.avatar', 'shiva returned to A.avatar');
}

// Test 3: Quota deny when opponent's avatar zone is full (6 cards)
{
  const st = emptyState({ active: 'A', phase: 'Main', turn: 2, turnSeq: 2 });
  const shiva = put(st, 'A.avatar', 'BT10-002');
  for (let i = 0; i < 5; i++) put(st, 'A.deck', 'SD01-001', { faceUp: false });
  for (let i = 0; i < 6; i++) put(st, 'B.avatar', 'SD01-003');

  const fx = apply(st, { type: 'activateAbility', k: shiva, by: 'A' });
  ok(!fx.deny, 'activation still processes draw');
  ok(st.zones['A.hand'].length === 1, 'A drew 1 card');
  ok(BoT.zoneOf(st, shiva) === 'A.avatar', 'shiva stayed on A because B avatar zone is full');
  ok(st.log.some(l => l.t.includes('ย้ายฝั่งไม่ได้')), 'log contains quota deny message');
}

console.log('ALL PASS BT10-002 (พระอิศวร นักเต้น)!');
