/* focused: BT10-041 นักรบทองแห่งภาคีมะม่วง — End Phase +2 แล้วตื่น ไม่ถาม */
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

{
  const e = BoT.effectOf('BT10-041', 'นักรบทองแห่งภาคีมะม่วง');
  const ab = ((e && e.abilities) || []).find(x => x.trigger && x.trigger.on === 'ownTurnEnd');
  ok(!!ab, 'BT10-041 has ownTurnEnd');
  ok(!(ab.actions || []).some(a => a.op === 'chooseMode'), 'ownTurnEnd does not ask chooseMode');
  ok((ab.actions || []).some(a => a.op === 'modifyPower' && a.amount === 2 && a.duration === 'nextOwnDraw'),
    'ownTurnEnd +2 until nextOwnDraw');
  ok((ab.actions || []).some(a => a.op === 'untap' && a.target === 'self'), 'ownTurnEnd untaps self');
}

/* มีต้นมะม่วงบน Magic → จบเทิร์นแล้ว +2 ตื่นทันที ไม่ค้าง prompt */
{
  const st = emptyState();
  const warrior = put(st, 'A.avatar', 'BT10-041', { tapped: true });
  put(st, 'A.magic', 'BT02-036');
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  const printed = +byCode('BT10-041').power || 0;
  const fx = BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 11 });
  if (fx.deny) fail('endTurn deny: ' + fx.deny);
  ok(!(st.prompts || []).some(p => p.kind === 'chooseMode'), 'no chooseMode prompt after endTurn');
  ok(st.active === 'B', 'now opponent turn');
  ok(!st.inst[warrior].tapped, 'warrior awake on opponent turn');
  ok(BoT.effPower(st, warrior) === printed + 2, 'warrior +2 on opponent turn');
}

/* ไม่มีต้นมะม่วง → ไม่ตื่น ไม่ +2 */
{
  const st = emptyState();
  const warrior = put(st, 'A.avatar', 'BT10-041', { tapped: true });
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  const printed = +byCode('BT10-041').power || 0;
  const fx = BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 12 });
  if (fx.deny) fail('endTurn deny (no tree): ' + fx.deny);
  ok(!!st.inst[warrior].tapped, 'stays tapped without mango tree');
  ok(BoT.effPower(st, warrior) === printed, 'no +2 without mango tree');
}

console.log('all ok');
