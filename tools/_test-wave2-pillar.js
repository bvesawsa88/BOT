/* focused: คลื่น 2 CC01-031 เสามงคล — โจมตีไม่ได้ + จั่วเพิ่มหลัง Draw Phase */
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
  const e = BoT.effectOf('CC01-031');
  ok(e && e.parseStatus === 'auto' && e.cannotAttack, 'เสามงคล cannotAttack auto');
  const ab = ((e && e.abilities) || []).find(a => a.trigger && a.trigger.on === 'afterNormalDraw');
  ok(ab && (ab.actions || []).some(ac => ac.op === 'draw' && ac.count === 1), 'afterNormalDraw จั่ว 1');
}

{
  const st = emptyState({ phase: 'Battle' });
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const pillar = put(st, 'A.avatar', 'CC01-031');
  const foe = put(st, 'B.avatar', 'SD01-003');
  const fx = apply(st, { type: 'declareAttack', atk: pillar, def: foe, by: 'A', seed: 1 });
  ok(fx.deny && /โจมตีไม่ได้/.test(fx.deny), 'เสามงคลโจมตีไม่ได้: ' + (fx.deny || ''));
}

function seedHandsDecks(st) {
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

{
  const st = emptyState();
  seedHandsDecks(st);
  const stay = put(st, 'A.deck', 'SD01-002');
  const extra = put(st, 'A.deck', 'SD01-005');
  const top = put(st, 'A.deck', 'SD01-007');
  put(st, 'A.avatar', 'CC01-031');
  const hand0 = st.zones['A.hand'].length;
  let fx = apply(st, { type: 'endTurn', by: 'A', seed: 10 });
  if (fx.deny) fail('A endTurn deny: ' + fx.deny);
  fx = apply(st, { type: 'endTurn', by: 'B', seed: 11 });
  if (fx.deny) fail('B endTurn deny: ' + fx.deny);
  ok(st.active === 'A' && st.phase === 'Main', 'กลับมา Main ของ A');
  ok(st.zones['A.hand'].length === hand0 + 2, 'จั่วปกติ 1 + เสามงคล 1: ' + st.zones['A.hand'].length);
  ok(st.zones['A.hand'].includes(top), 'ใบบนสุดขึ้นมือจากจั่วปกติ');
  ok(st.zones['A.hand'].includes(extra), 'ใบถัดไปขึ้นมือจากเสามงคล');
  ok(st.zones['A.deck'].includes(stay), 'ใบล่างยังอยู่ในเด็ค');
}

{
  const st = emptyState();
  seedHandsDecks(st);
  put(st, 'A.deck', 'SD01-002');
  put(st, 'A.deck', 'SD01-005');
  put(st, 'A.deck', 'SD01-007');
  put(st, 'A.avatar', 'SD01-003');
  const hand0 = st.zones['A.hand'].length;
  apply(st, { type: 'endTurn', by: 'A', seed: 20 });
  apply(st, { type: 'endTurn', by: 'B', seed: 21 });
  ok(st.zones['A.hand'].length === hand0 + 1, 'ไม่มีเสามงคลจั่วแค่ 1: ' + st.zones['A.hand'].length);
}

console.log('wave2 pillar: all passed');
