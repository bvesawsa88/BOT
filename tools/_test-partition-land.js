const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) {
  const c = cards.find(x => x.code === code);
  if (!c) throw new Error('Card not found: ' + code);
  return c;
}

function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 1, turnSeq: 1,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }
  };
}

function put(st, zone, code, extra) {
  const c = byCode(code);
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

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('OK:', msg);
}

function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser });
  }
}

function play(st, k, by) {
  const res = BoT.applyAction(st, { type: 'playMagic', k, by });
  if (res.deny) throw new Error('playMagic denied: ' + res.deny);
  skipNegate(st);
  return res;
}

console.log('=== 1. Test standard land behavior without แบ่งแยกดินแดน ===');
{
  const st = emptyState();
  // Player A plays Somchai (SD02-020)
  const l1 = put(st, 'A.hand', 'SD02-020');
  play(st, l1, 'A');
  assert(st.zones['land'].includes(l1), 'Land 1 is on field');
  assert(st.zones['land'].length === 1, 'Only 1 land on field');

  // Player A plays Krailas (SD01-020) -> should replace Land 1
  st.magicUsed.A = {};
  const l2 = put(st, 'A.hand', 'SD01-020');
  play(st, l2, 'A');
  assert(!st.zones['land'].includes(l1), 'Land 1 was removed from land zone');
  assert(st.zones['A.hell'].includes(l1), 'Land 1 was destroyed and sent to A.hell');
  assert(st.zones['land'].includes(l2), 'Land 2 is on field');
  assert(st.zones['land'].length === 1, 'Still only 1 land on field');
}

console.log('=== 2. Test playing แบ่งแยกดินแดน and additional lands ===');
{
  const st = emptyState();
  // Player A plays แบ่งแยกดินแดน (PRMO-029)
  const part = put(st, 'A.hand', 'PRMO-029');
  play(st, part, 'A');
  assert(st.zones['land'].includes(part), 'แบ่งแยกดินแดน is on land zone');
  assert(st.inst[part].controller === 'A', 'แบ่งแยกดินแดน controller is A');

  // Reset magicUsed to test playing another land in same test
  st.magicUsed.A = {};

  // Player A plays Somchai (SD02-020)
  const lA = put(st, 'A.hand', 'SD02-020');
  play(st, lA, 'A');
  assert(st.zones['land'].includes(part), 'แบ่งแยกดินแดน remains on field');
  assert(st.zones['land'].includes(lA), 'Player A Land is also on field');
  assert(st.inst[lA].controller === 'A', 'Player A Land controller is A');
  assert(st.zones['land'].length === 2, 'Total 2 lands on field');

  // Player B plays Simplee (SD03-019)
  st.active = 'B';
  const lB = put(st, 'B.hand', 'SD03-019');
  play(st, lB, 'B');
  assert(st.zones['land'].includes(part), 'แบ่งแยกดินแดน still remains on field');
  assert(st.zones['land'].includes(lA), 'Player A Land still on field');
  assert(st.zones['land'].includes(lB), 'Player B Land is also on field');
  assert(st.inst[lB].controller === 'B', 'Player B Land controller is B');
  assert(st.zones['land'].length === 3, 'Total 3 lands on field');

  // Verify destruction of แบ่งแยกดินแดน destroys ALL other lands
  console.log('=== 3. Test destruction of แบ่งแยกดินแดน ===');
  BoT.applyAction(st, { type: 'destroyCard', k: part, by: 'B' });
  assert(!st.zones['land'].includes(part), 'แบ่งแยกดินแดน left land zone');
  assert(st.zones['A.hell'].includes(part), 'แบ่งแยกดินแดน in A.hell');
  assert(!st.zones['land'].includes(lA), 'Land A destroyed when partition destroyed');
  assert(st.zones['A.hell'].includes(lA), 'Land A in A.hell');
  assert(!st.zones['land'].includes(lB), 'Land B destroyed when partition destroyed');
  assert(st.zones['B.hell'].includes(lB), 'Land B in B.hell');
  assert(st.zones['land'].length === 0, 'Land zone is now completely empty');

  // Check log contains message
  const hasLog = (st.log || []).some(x => (x.t || x.msg || '').includes('แบ่งแยกดินแดนถูกทำลาย'));
  assert(hasLog, 'Log mentions แบ่งแยกดินแดนถูกทำลาย — ทำลาย Land ทั้งหมดบนสนาม');
}

console.log('=== 4. Test playing แบ่งแยกดินแดน when a Land already existed ===');
{
  const st = emptyState();
  // Player B already has Simplee (SD03-019) on field
  const lB = put(st, 'land', 'SD03-019', { controller: 'B' });
  assert(st.zones['land'].length === 1, 'Initial 1 land on field');

  // Player A plays แบ่งแยกดินแดน (PRMO-029)
  const part = put(st, 'A.hand', 'PRMO-029');
  play(st, part, 'A');
  assert(st.zones['land'].includes(lB), 'Existing Land B was not destroyed when partition entered');
  assert(st.zones['land'].includes(part), 'Partition entered field');
  assert(st.zones['land'].length === 2, 'Both lands exist on field');
}

console.log('=== 5. Test playing a land after partition was destroyed returns to normal rules ===');
{
  const st = emptyState();
  // Play partition then destroy it
  const part = put(st, 'land', 'PRMO-029', { controller: 'A' });
  const l1 = put(st, 'land', 'SD01-020', { controller: 'A' });
  assert(st.zones['land'].length === 2, '2 lands before destruction');

  BoT.applyAction(st, { type: 'destroyCard', k: part, by: 'B' });
  assert(st.zones['land'].length === 0, '0 lands after partition destroyed');

  // Now play a new land
  const lNew1 = put(st, 'A.hand', 'SD02-020');
  play(st, lNew1, 'A');
  assert(st.zones['land'].length === 1 && st.zones['land'][0] === lNew1, 'New land placed');

  // Play another land -> normal rule replaces old land
  st.magicUsed.A = {};
  const lNew2 = put(st, 'A.hand', 'SD04-020');
  play(st, lNew2, 'A');
  assert(st.zones['land'].length === 1 && st.zones['land'][0] === lNew2, 'Second land replaced first');
  assert(st.zones['A.hell'].includes(lNew1), 'First land went to hell');
}

console.log('ALL PARTITION LAND TESTS PASSED!');
