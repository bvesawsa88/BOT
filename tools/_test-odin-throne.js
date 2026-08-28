/* Test script for BT08-069 บัลลังก์โอดิน */
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
    phase: 'Main', active: 'A', turn: 3, turnSeq: 3,
    strict: true, firstPlayer: 'B', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    pendingLethal: null, oncePerGame: {}, gems: { A: 10, B: 10 }
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
function padDecks(st) {
  ['A', 'B'].forEach(p => {
    while ((st.zones[p + '.deck'] || []).length < 15) put(st, p + '.deck', 'SD01-003');
    while ((st.zones[p + '.life'] || []).length < 5) put(st, p + '.life', 'SD01-003', { faceUp: false });
  });
}
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }

console.log('--- TEST 1: บัลลังก์โอดิน (BT08-069) Aura in Battle Phase ---');
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const throne = put(st, 'A.construct', 'BT08-069');
  const odin = put(st, 'A.avatar', 'BT02-019'); // โอดิน พ่อทุกสถาบัน แห่ง แอสการ์ด (P4)
  const loki = put(st, 'A.avatar', 'BT09-025'); // โลกิ เจ้าชายยักษ์น้ำแข็ง (P0, เทพ, ม่วง)
  padDecks(st);

  ok(BoT.effPower(st, odin) === 4, 'Main phase: Odin power is base (4)');
  ok(BoT.effPower(st, loki) === 0, 'Main phase: Loki power is base (0)');

  st.phase = 'Battle';
  ok(BoT.effPower(st, odin) === 7, 'Battle phase: Odin power gains +3 (4 -> 7)');
  ok(BoT.effPower(st, loki) === 1, 'Battle phase: Loki power gains +1 (0 -> 1)');
}

console.log('--- TEST 2: บัลลังก์โอดิน (BT08-069) Activated effect ---');
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const throne = put(st, 'A.construct', 'BT08-069');
  const odinHell = put(st, 'A.hell', 'BT02-019');
  padDecks(st);

  const fx = BoT.applyAction(st, { type: 'activateAbility', k: throne, by: 'A' });
  if (fx.deny) fail('throne activate denied: ' + fx.deny);

  ok(BoT.zoneOf(st, throne) === 'A.hell', 'Throne destroyed self as cost');
  const pr = st.prompts[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'hell', 'opened hell pick prompt');

  const fxPick = BoT.applyAction(st, { type: 'chooseTarget', k: odinHell, by: 'A' });
  if (fxPick.deny) fail('chooseTarget odin deny: ' + fxPick.deny);

  ok(BoT.zoneOf(st, odinHell) === 'A.hand', 'Odin returned to hand from Hell');
}

console.log('--- TEST 3: บัลลังก์โอดิน (BT08-069) Milled trigger ---');
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  padDecks(st);
  const throne = put(st, 'A.deck', 'BT08-069'); // put on top of deck

  // Play Sigrun and use her activated ability (mill 3)
  const sigrun = put(st, 'A.avatar', 'BT06-029');
  const fxAct = BoT.applyAction(st, { type: 'activateAbility', k: sigrun, by: 'A' });
  if (fxAct.deny) fail('sigrun activate denied: ' + fxAct.deny);

  ok(BoT.zoneOf(st, throne) === 'A.construct', 'Odin Throne automatically constructed to Construct zone when milled');
}

console.log('--- TEST 4: Thor Son of Odin (BT09-024) is counted as Odin ---');
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const throne = put(st, 'A.construct', 'BT08-069');
  const thor = put(st, 'A.avatar', 'BT09-024'); // ธอร์ บุตรแห่งโอดิน (P5, เทพ, ม่วง)
  const thorHell = put(st, 'A.hell', 'BT09-024'); // ธอร์ บุตรแห่งโอดิน อีกใบในนรก
  padDecks(st);

  ok(BoT.effPower(st, thor) === 5, 'Main phase: Thor base power is 5');

  st.phase = 'Battle';
  ok(BoT.effPower(st, thor) === 8, 'Battle phase: Thor (Son of Odin) gets +3 POWER as Odin (5 -> 8)');

  st.phase = 'Main';
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: throne, by: 'A' });
  if (fx.deny) fail('throne activate denied: ' + fx.deny);

  const fxPick = BoT.applyAction(st, { type: 'chooseTarget', k: thorHell, by: 'A' });
  if (fxPick.deny) fail('chooseTarget Thor (Son of Odin) deny: ' + fxPick.deny);

  ok(BoT.zoneOf(st, thorHell) === 'A.hand', 'Thor (Son of Odin) returned from Hell to Hand via Throne effect');
}

console.log('ALL ODIN THRONE TESTS COMPLETED SUCCESSFUL!');
