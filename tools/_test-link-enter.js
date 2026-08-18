/* focused: เข้าสู่สถานะ Link — โฮคุ โพลีกอน / จอมเวทย์ โกลเด้น */
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
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
function apply(st, a) { return BoT.applyAction(st, a); }
function zone(st, k) { return BoT.zoneOf(st, k); }
function tick(st, seed) {
  const fx = apply(st, { type: 'chat', by: 'A', text: 'sync', seed: seed || 1 });
  if (fx.deny) fail('tick deny: ' + fx.deny);
  return fx;
}

/* 1) โฮคุคนเดียว POWER 4 · นับสัตว์ */
{
  const st = emptyState();
  const hoku = put(st, 'A.avatar', 'BT09-007');
  ok(BoT.effPower(st, hoku) === 4, 'hoku alone power 4: ' + BoT.effPower(st, hoku));
  const e = BoT.effectOf('BT09-007');
  ok(e && (e.extraSymbols || []).includes('สัตว์'), 'hoku extra symbol animal');
}

/* 2) มี Avatar ใบอื่น → POWER +1 */
{
  const st = emptyState();
  const hoku = put(st, 'A.avatar', 'BT09-007');
  put(st, 'B.avatar', 'SD01-003');
  ok(BoT.effPower(st, hoku) === 5, 'hoku +1 with other avatar: ' + BoT.effPower(st, hoku));
}

/* 3) ศัตรูต้องโจมตีโฮคุ */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  const hoku = put(st, 'A.avatar', 'BT09-007');
  const other = put(st, 'A.avatar', 'SD01-003');
  const atk = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'declareAttack', atk, def: other, by: 'B', seed: 2 });
  ok(!!fx.deny, 'must attack hoku: ' + fx.deny);
  fx = apply(st, { type: 'declareAttack', atk, def: hoku, by: 'B', seed: 3 });
  if (fx.deny) fail('attack hoku deny: ' + fx.deny);
  ok(!!st.pending || !!st.inst[atk].tapped, 'attack hoku allowed');
}

/* 4) เข้า Link กับโซน่า → ทำลาย Avatar ศัตรู POWER สูงสุด */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const hoku = put(st, 'A.avatar', 'BT09-007');
  const weak = put(st, 'B.avatar', 'SD01-011');
  const strong = put(st, 'B.avatar', 'SD01-002');
  put(st, 'A.avatar', 'BT09-022');
  tick(st, 4);
  ok(zone(st, strong) === 'B.hell', 'highest power enemy destroyed: ' + zone(st, strong));
  ok(zone(st, weak) === 'B.avatar', 'lower power enemy remains');
  ok(zone(st, hoku) === 'A.avatar', 'hoku still on field');
}

/* 5) ไม่เข้า Link ซ้ำถ้ายังคู่กัน */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'A.avatar', 'BT09-007');
  const enemy = put(st, 'B.avatar', 'SD01-002');
  put(st, 'A.avatar', 'BT09-022');
  tick(st, 5);
  ok(zone(st, enemy) === 'B.hell', 'destroyed on first enter');
  const enemy2 = put(st, 'B.avatar', 'SD01-001');
  tick(st, 6);
  ok(zone(st, enemy2) === 'B.avatar', 'no second enterLink while still linked: ' + zone(st, enemy2));
}

/* 6) โกลเด้นเข้า Link → ก่อสร้างจอมเวทย์จากเด็ค */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'A.avatar', 'BT10-025');
  put(st, 'A.avatar', 'BT10-026');
  const lib = put(st, 'A.deck', 'BT10-072');
  tick(st, 7);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'deckOrHell', 'golden pick construct: ' + JSON.stringify(pr && { kind: pr.kind, from: pr.from, dest: pr.dest }));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(lib), 'library in candidates');
  const fx = apply(st, { type: 'chooseTarget', k: lib, by: 'A', seed: 8 });
  if (fx.deny) fail('build construct deny: ' + fx.deny);
  ok(zone(st, lib) === 'A.construct', 'library built: ' + zone(st, lib));
}

console.log('ALL PASS');
