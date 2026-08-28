/* Test script for Ah-ah, ah!, Loki partner attack protection, and Thor battle destroy effect */
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
function apply(st, a) { return BoT.applyAction(st, a); }

function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 12) {
    const chooser = st.prompts[0].chooser;
    const fx = apply(st, { type: 'reactNo', by: chooser, seed: (seed || 1) + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}

console.log('--- TEST 1: Ah-ah, ah! (BT09-058) ---');
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'BT09-058');
  const thor = put(st, 'A.avatar', 'BT09-024'); // ธอร์ บนสนาม
  const lokiHell = put(st, 'A.hell', 'BT09-025'); // โลกิ ในนรก
  padDecks(st);

  const initialHellLen = st.zones['A.hell'].length;
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  if (fx.deny) fail('Ah-ah, ah! play magic denied: ' + fx.deny);

  // Mills 5 cost -> hell length increased by 5
  ok(st.zones['A.hell'].length === initialHellLen + 5, 'milled 5 as cost for Ah-ah, ah!');

  drainReact(st, 1);
  // Should open chooseMode prompt
  const pr = st.prompts[0];
  ok(pr && pr.kind === 'chooseMode', 'opened chooseMode prompt');

  // Option 0: Summon Loki (Thor is on field)
  fx = apply(st, { type: 'chooseMode', k: mag, opt: 0, by: 'A', seed: 2 });
  if (fx.deny) fail('chooseMode 0 deny: ' + fx.deny);

  const pickPr = st.prompts[0];
  ok(pickPr && pickPr.kind === 'pick' && pickPr.from === 'hell', 'opened hell pick prompt for Loki');

  fx = apply(st, { type: 'chooseTarget', k: lokiHell, by: 'A', seed: 3 });
  if (fx.deny) fail('chooseTarget Loki deny: ' + fx.deny);

  ok(BoT.zoneOf(st, lokiHell) === 'A.avatar', 'Loki summoned to Avatar zone from Hell');
}

console.log('--- TEST 2: Loki in Partner state cannot be attacked ---');
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  const thor = put(st, 'A.avatar', 'BT09-024');
  const loki = put(st, 'A.avatar', 'BT09-025');
  const enemyAtk = put(st, 'B.avatar', 'SD01-003', { power: 10 });
  padDecks(st);

  // Pair Loki and Thor
  apply(st, { type: 'pair', k: loki, to: thor, by: 'A', seed: 10 });
  ok(st.inst[loki].pairWith === thor, 'Loki and Thor are paired');

  // Enemy B tries to attack Loki
  const fx = apply(st, { type: 'declareAttack', atk: enemyAtk, def: loki, by: 'B', seed: 11 });
  ok(!!fx.deny, 'Loki attack denied: ' + fx.deny);
  ok((fx.deny || '').includes('อยู่ในสถานะคู่หู'), 'Deny message mentions partner status: ' + fx.deny);
}

console.log('--- TEST 3: Thor in Partner state destroying Avatar triggers choice (destroy Cost <= maxCost OR unreveal opponent LIFE) ---');
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  const thor = put(st, 'A.avatar', 'BT09-024', { power: 10 });
  const loki = put(st, 'A.avatar', 'BT09-025');
  const enemyFodder = put(st, 'B.avatar', 'SD01-003', { cost: 1, power: 1 });
  const enemyBench = put(st, 'B.avatar', 'SD01-003', { cost: 3, power: 2 });
  padDecks(st);

  // Pair Thor and Loki
  apply(st, { type: 'pair', k: thor, to: loki, by: 'A', seed: 20 });

  // Add 10 cards to Hell -> maxCost = 3 + floor(10/10) = 4
  for (let i = 0; i < 10; i++) put(st, 'A.hell', 'SD01-003');

  // Thor attacks enemyFodder
  let fx = apply(st, { type: 'declareAttack', atk: thor, def: enemyFodder, by: 'A', seed: 21 });
  if (fx.deny) fail('Thor declareAttack deny: ' + fx.deny);

  // Check battleDestroy trigger prompted chooseMode
  const pr = st.prompts[0];
  ok(pr && pr.kind === 'chooseMode', 'Thor battleDestroy opened chooseMode prompt: ' + JSON.stringify(pr && pr.kind));

  // Option 0: Destroy enemy Avatar
  fx = apply(st, { type: 'chooseMode', k: thor, opt: 0, by: 'A', seed: 22 });
  if (fx.deny) fail('Thor chooseMode 0 deny: ' + fx.deny);

  const destroyPr = st.prompts[0];
  ok(destroyPr && destroyPr.kind === 'chooseDestroy', 'opened chooseDestroy prompt: ' + (destroyPr && destroyPr.kind));

  fx = apply(st, { type: 'chooseTarget', k: enemyBench, by: 'A', seed: 23 });
  if (fx.deny) fail('Thor destroy enemyBench deny: ' + fx.deny);

  ok(BoT.zoneOf(st, enemyBench) === 'B.hell', 'enemy bench avatar destroyed by Thor effect');
}

console.log('--- TEST 4: Thor in Partner state option 1 (unreveal opponent LIFE) ---');
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  const thor = put(st, 'A.avatar', 'BT09-024', { power: 10 });
  const loki = put(st, 'A.avatar', 'BT09-025');
  const enemyFodder = put(st, 'B.avatar', 'SD01-003', { cost: 1, power: 1 });
  const enemyBench = put(st, 'B.avatar', 'SD01-003', { cost: 2, power: 1 });
  padDecks(st);

  // Pair Thor and Loki
  apply(st, { type: 'pair', k: thor, to: loki, by: 'A', seed: 30 });

  // Thor attacks enemyFodder
  let fx = apply(st, { type: 'declareAttack', atk: thor, def: enemyFodder, by: 'A', seed: 31 });
  if (fx.deny) fail('Thor declareAttack deny: ' + fx.deny);

  const pr = st.prompts[0];
  ok(pr && pr.kind === 'chooseMode', 'Thor battleDestroy opened chooseMode prompt');

  // Option 1: Unreveal opponent LIFE card
  fx = apply(st, { type: 'chooseMode', k: thor, opt: 1, by: 'A', seed: 32 });
  if (fx.deny) fail('Thor chooseMode 1 deny: ' + fx.deny);

  const bLife = st.zones['B.life'];
  const faceUpLifeCount = bLife.filter(id => st.inst[id] && st.inst[id].faceUp).length;
  ok(faceUpLifeCount === 1, '1 top opponent LIFE revealed: ' + faceUpLifeCount);
}

console.log('--- TEST 5: Thor in Partner state automatic LIFE reveal when no enemy targets remain ---');
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  const thor = put(st, 'A.avatar', 'BT09-024', { power: 10 });
  const loki = put(st, 'A.avatar', 'BT09-025');
  const enemyFodder = put(st, 'B.avatar', 'SD01-003', { cost: 1, power: 1 });
  padDecks(st);

  // Pair Thor and Loki
  apply(st, { type: 'pair', k: thor, to: loki, by: 'A', seed: 40 });

  // Thor attacks enemyFodder (no other enemy avatars remain)
  let fx = apply(st, { type: 'declareAttack', atk: thor, def: enemyFodder, by: 'A', seed: 41 });
  if (fx.deny) fail('Thor declareAttack deny: ' + fx.deny);

  const bLife = st.zones['B.life'];
  const faceUpLifeCount = bLife.filter(id => st.inst[id] && st.inst[id].faceUp).length;
  ok(faceUpLifeCount === 1, '1 top opponent LIFE automatically revealed when no enemy targets remain');
}

console.log('ALL PASS valhalla-loki-thor tests!');
