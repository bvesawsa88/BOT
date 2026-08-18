/* focused: คลื่น 0 KD00-00D ขอมือเธอหน่อย~ — มือเยอะสุดทิ้ง 2 แล้วจั่วให้เท่ากัน */
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
function padDecks(st) {
  for (let i = 0; i < 8; i++) {
    put(st, 'A.deck', 'SD01-003');
    put(st, 'B.deck', 'SD01-011');
  }
}
function discardAll(st, n, by) {
  for (let i = 0; i < n; i++) {
    const pr = (st.prompts || [])[0];
    ok(pr && pr.kind === 'chooseDiscard' && pr.chooser === by,
      'discard prompt ' + (i + 1) + '/' + n + ' for ' + by + ': ' + (pr && pr.kind + '/' + (pr && pr.chooser)));
    const hand = (st.zones[by + '.hand'] || []).slice();
    ok(hand.length, 'hand to discard for ' + by);
    const fx = apply(st, { type: 'chooseTarget', k: hand[0], by, seed: 20 + i });
    if (fx.deny) fail('discard deny ' + by + ': ' + fx.deny);
  }
}

/* 1) A มือมากกว่าหลังเล่นเวท → A ทิ้ง 2 แล้วจั่วให้เท่า B */
{
  const st = emptyState();
  padDecks(st);
  const mag = put(st, 'A.hand', 'KD00-00D');
  const a1 = put(st, 'A.hand', 'SD01-003');
  const a2 = put(st, 'A.hand', 'SD01-003');
  const a3 = put(st, 'A.hand', 'SD01-003');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  ok(!fx.deny, 'play 00D: ' + (fx.deny || ''));
  skipNegate(st);
  ok((st.zones['A.hand'] || []).length === 3, 'A hand after play: ' + (st.zones['A.hand'] || []).length);
  ok((st.zones['B.hand'] || []).length === 2, 'B still 2');
  discardAll(st, 2, 'A');
  ok((st.zones['A.hand'] || []).length === 2, 'A after discard+draw to B max: ' + (st.zones['A.hand'] || []).length);
  ok((st.zones['B.hand'] || []).length === 2, 'B unchanged 2: ' + (st.zones['B.hand'] || []).length);
  ok([a1, a2, a3].filter(k => BoT.zoneOf(st, k) === 'A.hell').length === 2, 'A discarded 2 to hell');
}

/* 2) มือเท่ากันหลังเล่น → ทั้งคู่ทิ้ง 2 แล้วจั่วให้เท่ากัน (ไม่จั่วเพิ่ม) */
{
  const st = emptyState();
  padDecks(st);
  const mag = put(st, 'A.hand', 'KD00-00D');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 2 });
  ok(!fx.deny, 'play 00D tie: ' + (fx.deny || ''));
  skipNegate(st);
  ok((st.zones['A.hand'] || []).length === 3 && (st.zones['B.hand'] || []).length === 3, 'both 3 after play');
  discardAll(st, 2, 'A');
  discardAll(st, 2, 'B');
  ok((st.zones['A.hand'] || []).length === 1, 'A ended at 1: ' + (st.zones['A.hand'] || []).length);
  ok((st.zones['B.hand'] || []).length === 1, 'B ended at 1: ' + (st.zones['B.hand'] || []).length);
}

console.log('wave0 kd00d: all passed');
