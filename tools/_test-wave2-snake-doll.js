/* focused: คลื่น 2 CC01-047 ตุ๊กตางูพันคอ — โฮสต์ +2 และต้องโจมตี */
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

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const host = put(st, 'A.avatar', 'SD01-011');
  put(st, 'A.magic', 'CC01-047', { attachedTo: host });
  put(st, 'B.avatar', 'SD01-003');
  ok(BoT.effPower(st, host) === 3, 'host P1 +2 = 3, got ' + BoT.effPower(st, host));
  const fx = apply(st, { type: 'endTurn', by: 'A', seed: 1 });
  ok(!!fx.deny && /ต้องโจมตี/.test(fx.deny), 'must attack: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const host = put(st, 'A.avatar', 'SD01-011');
  put(st, 'A.magic', 'CC01-047', { attachedTo: host });
  st.inst[host].tapped = true;
  put(st, 'B.avatar', 'SD01-003');
  const fx = apply(st, { type: 'endTurn', by: 'A', seed: 2 });
  ok(!fx.deny, 'tapped host can end turn: ' + (fx.deny || ''));
}

console.log('wave2 snake-doll: all passed');
