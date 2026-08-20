/* focused: คลื่น 2 CC02-014 แร้งทึ้งศพ — เมื่อมี mill จั่ว 1 เทิร์นละครั้ง */
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
function padMillDecks(st) {
  ['A', 'B'].forEach(p => {
    put(st, p + '.deck', 'SD01-003');
    put(st, p + '.deck', 'SD01-011');
    put(st, p + '.deck', 'SD01-002');
    put(st, p + '.deck', 'SD02-006');
  });
}

{
  const st = emptyState();
  padMillDecks(st);
  put(st, 'A.avatar', 'CC02-014');
  const mag = put(st, 'A.hand', 'BT01-035');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  ok(!fx.deny, 'play mill: ' + (fx.deny || ''));
  skipNegate(st);
  ok((st.zones['A.hand'] || []).length === 1, 'drew 1 from vulture: ' + (st.zones['A.hand'] || []).length);
  ok((st.zones['A.hell'] || []).length >= 3, 'A milled');
  ok((st.zones['B.hell'] || []).length >= 3, 'B milled');
}

{
  const st = emptyState();
  padMillDecks(st);
  const mag = put(st, 'A.hand', 'BT01-035');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 2 });
  ok(!fx.deny, 'play mill no vulture: ' + (fx.deny || ''));
  skipNegate(st);
  ok((st.zones['A.hand'] || []).length === 0, 'no extra draw without vulture');
}

console.log('wave2 vulture: all passed');
