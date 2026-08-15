/* focused: เพนกวิ้น ฮัท (BT11-024) — เนรเทศจากมือ ยกเลิกท่าปิดเกม จบเทิร์นฝ่ายโจมตีทันที */
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
    phase: 'Battle', active: 'A', turn: 3, turnSeq: 3,
    strict: true, firstPlayer: 'B', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    pendingLethal: null, oncePerGame: {}
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
function seedDeck(st, side, n) {
  for (let i = 0; i < n; i++) put(st, side + '.deck', 'SD01-011', { faceUp: false });
}

{
  const st = emptyState();
  seedDeck(st, 'A', 8); seedDeck(st, 'B', 8);
  const atk = put(st, 'A.avatar', 'SD01-002');
  const life = put(st, 'B.life', 'KD01-021', { type: 'Life', faceUp: true });
  const hat = put(st, 'B.hand', 'BT11-024');
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk, life, by: 'A', seed: 1 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  ok(!st.pendingLethal, 'auto penguin: no plead window');
  ok(BoT.zoneOf(st, hat) === 'B.dark', 'hat auto-exiled to dark');
  ok(st.active === 'B' && st.phase === 'Main', 'attacker turn ended immediately');
  ok(st.oncePerGame && st.oncePerGame['B:BT11-024'], 'once per game marked');
}

{
  const st = emptyState();
  seedDeck(st, 'A', 8); seedDeck(st, 'B', 8);
  const atk = put(st, 'A.avatar', 'SD01-002');
  const life = put(st, 'B.life', 'KD01-021', { type: 'Life', faceUp: true });
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk, life, by: 'A', seed: 1 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  ok(!st.pendingLethal, 'no hat → no plead bar');
  ok(st.over && st.over.winner === 'A', 'no hat → game over immediately');
}

{
  const st = emptyState();
  seedDeck(st, 'A', 8); seedDeck(st, 'B', 8);
  const atk = put(st, 'A.avatar', 'SD01-002');
  const life = put(st, 'B.life', 'KD01-021', { type: 'Life', faceUp: true });
  const hat = put(st, 'B.hand', 'BT11-024');
  st.prompts.push({ kind: 'react', chooser: 'B', reactTrigger: 'oppBattlePhaseStart', options: [], optional: true });
  for (let i = 0; i < 5; i++) put(st, 'A.hand', 'SD01-011');
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk, life, by: 'A', seed: 3 });
  if (fx.deny) fail('auto penguin leftover prompt deny: ' + fx.deny);
  ok(!st.pendingLethal, 'auto lethal cancelled despite leftover prompt');
  ok(st.active === 'B', 'forced end turn despite leftover prompt + attacker hand size');
  ok(BoT.zoneOf(st, hat) === 'B.dark', 'hat auto-exiled');
}

{
  const st = emptyState();
  seedDeck(st, 'A', 8); seedDeck(st, 'B', 8);
  const atk = put(st, 'A.avatar', 'SD01-002');
  const life = put(st, 'B.life', 'KD01-021', { type: 'Life', faceUp: true });
  const hat = put(st, 'B.hand', 'BT11-024');
  st.pendingLethal = { atk, life, by: 'A', target: 'B', phase: 'grant' };
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: hat, by: 'B', seed: 4 });
  if (fx.deny) fail('penguin during grant deny: ' + fx.deny);
  ok(!st.pendingLethal && st.active === 'B', 'penguin still works after plead yes (grant)');
}

{
  const st = emptyState({ phase: 'Main', active: 'B' });
  const hat = put(st, 'B.hand', 'BT11-024');
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: hat, by: 'B', seed: 5 });
  ok(fx.deny && /สาหัส/.test(fx.deny), 'cannot use without lethal: ' + fx.deny);
  ok(BoT.zoneOf(st, hat) === 'B.hand', 'hat stays in hand');
}

{
  const st = emptyState({ skipLethalPlead: true });
  seedDeck(st, 'A', 8); seedDeck(st, 'B', 8);
  const atk = put(st, 'A.avatar', 'SD01-002');
  const life = put(st, 'B.life', 'KD01-021', { type: 'Life', faceUp: true });
  const hat = put(st, 'B.hand', 'BT11-024');
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk, life, by: 'A', seed: 6 });
  if (fx.deny) fail('bot lethal penguin deny: ' + fx.deny);
  ok(!st.over, 'penguin still auto-saves against bot skipLethalPlead');
  ok(BoT.zoneOf(st, hat) === 'B.dark' && st.active === 'B', 'hat auto-fired vs bot');
}

console.log('all penguin hut tests passed');
