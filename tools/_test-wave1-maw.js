/* focused: คลื่น 1 PRE0-005 ผู้เล่นมั่ว — นรกชื่อ Avatar ไม่ซ้ำ ≥10 แล้ว +2 */
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

const DISTINCT = [
  'SD01-001', 'SD01-002', 'SD01-003', 'SD01-004', 'SD01-005',
  'SD01-006', 'SD01-007', 'SD01-008', 'SD01-009', 'SD01-010'
];

{
  const st = emptyState();
  const maw = put(st, 'A.avatar', 'PRE0-005');
  ok(BoT.effPower(st, maw) === 2, 'base P2 without hell: ' + BoT.effPower(st, maw));
  DISTINCT.slice(0, 9).forEach(code => put(st, 'A.hell', code));
  ok(BoT.effPower(st, maw) === 2, '9 unique still P2: ' + BoT.effPower(st, maw));
  put(st, 'A.hell', DISTINCT[9]);
  ok(BoT.effPower(st, maw) === 4, '10 unique → P4: ' + BoT.effPower(st, maw));
  put(st, 'A.hell', DISTINCT[0]);
  ok(BoT.effPower(st, maw) === 4, 'duplicate 11th still P4: ' + BoT.effPower(st, maw));
}

console.log('wave1 maw: all passed');
