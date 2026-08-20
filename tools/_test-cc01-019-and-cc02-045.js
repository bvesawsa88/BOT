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

console.log('--- Testing CC01-019 (หมวดเงียบ ทหารรับจ้าง) ---');
{
  const st = emptyState();
  const sergeant = put(st, 'A.avatar', 'CC01-019');
  const enemyAv = put(st, 'B.avatar', 'SD01-002'); // พระนารายณ์
  ok(!st.inst[enemyAv].tapped, 'enemy initially untapped');

  // Activate CC01-019 effect
  let fx = apply(st, { type: 'activateAbility', k: sergeant, by: 'A' });
  if (fx.deny) fail('activateAbility CC01-019: ' + fx.deny);

  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'tap', 'prompt dest is tap');

  fx = apply(st, { type: 'chooseTarget', k: enemyAv, by: 'A' });
  if (fx.deny) fail('chooseTarget CC01-019 target: ' + fx.deny);

  ok(st.inst[enemyAv].tapped === true, 'enemy avatar is now tapped (นอน)');

  // Try untapping enemyAv while sergeant is still on Avatar Zone
  const tryUntapRes = BoT.tryUntap(st, enemyAv, 'test');
  ok(tryUntapRes === false, 'enemy avatar cannot untap while sergeant is on Avatar Zone');

  // Move sergeant off Avatar Zone
  BoT.doMove(st, sergeant, 'A.hell');
  const tryUntapResAfter = BoT.tryUntap(st, enemyAv, 'test');
  ok(tryUntapResAfter === true, 'enemy avatar can untap after sergeant leaves Avatar Zone');
}

console.log('--- Testing CC02-045 (สิงสู่เพื่อสู่สม) ---');
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'CC02-045');
  const sacAvatar = put(st, 'A.avatar', 'SD01-001', { cost: 6 }); // Avatar cost 6 >= 3
  const victim = put(st, 'B.avatar', 'SD01-002', { cost: 4 });

  // Play Magic CC02-045
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A' });
  if (fx.deny) fail('playMagic CC02-045: ' + fx.deny);

function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic' || st.prompts[0].kind === 'magicNegate') && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}

  // Sacrifice prompt
  let pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'sacrifice', 'sac prompt open');
  fx = apply(st, { type: 'chooseTarget', k: sacAvatar, by: 'A' });
  if (fx.deny) fail('sac target: ' + fx.deny);

  skipNegate(st);

  ok(zone(st, sacAvatar) === 'A.hell', 'sacrificed avatar moved to hell');

  // Opponent B picks avatar to be stolen
  pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'takeControl' && pr.chooser === 'B', 'takeControl prompt for opponent B');

  fx = apply(st, { type: 'chooseTarget', k: victim, by: 'B' });
  if (fx.deny) fail('opp pick victim: ' + fx.deny);

  ok(zone(st, victim) === 'A.avatar', 'victim avatar stolen to player A avatar zone');
  ok(st.inst[mag].attachedTo === victim, 'magic attached to victim avatar');
  ok(st.inst[mag].subtype === 'Modification', 'magic subtype converted to Modification');

  // Destroy/remove magic card from field
  BoT.doMove(st, mag, 'A.hell');
  ok(zone(st, victim) === 'B.avatar', 'control returned to original owner B after magic leaves field');
}

console.log('ALL PASS!');
