/* focused: ปืนจักรวุทธ (CC02-048) */
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

function drainPrompts(st, seed) {
  let n = 0;
  while ((st.prompts || []).length && n++ < 12) {
    const pr = st.prompts[0];
    if (pr.kind === 'react') {
      const fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: seed + n });
      if (fx.deny) fail('reactNo deny: ' + fx.deny);
      continue;
    }
    break;
  }
}

function combat(st, atk, def, by, seed) {
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk, def, by, seed });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  drainPrompts(st, seed);
  let guard = 0;
  while (st.pending && guard++ < 8) {
    drainPrompts(st, seed + guard);
    if (!st.pending) break;
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: st.pending.target, seed: seed + 20 + guard });
    if (fx.deny) fail('resolveAttack deny: ' + fx.deny);
  }
  return fx;
}

function setupGun(twoEnemies) {
  const st = emptyState();
  for (let i = 0; i < 8; i++) {
    put(st, 'A.deck', i % 2 ? 'SD01-011' : 'SD01-003');
    put(st, 'B.deck', i % 2 ? 'SD01-011' : 'SD01-003');
  }
  const host = put(st, 'A.avatar', 'BT11-014', { power: 6 });
  const gun = put(st, 'A.magic', 'CC02-048', { attachedTo: host });
  const e1 = put(st, 'B.avatar', 'SD01-003', { power: 1 });
  const e2 = twoEnemies ? put(st, 'B.avatar', 'SD01-011', { power: 1 }) : null;
  return { st, host, gun, e1, e2 };
}

{
  const e = BoT.effectOf('CC02-048', 'ปืนจักรวุทธ');
  ok(e && e.hostMustAttack, 'hostMustAttack meta');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'declareAttack'), 'declareAttack +4');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'battleDestroy'), 'battleDestroy wake');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'activated'), 'activated bounce');
}

{
  const { st, host } = setupGun(true);
  const fx = BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  ok(!!fx.deny && /ต้องโจมตี/.test(fx.deny), 'must-attack blocks endTurn: ' + (fx.deny || 'no deny'));
  ok(!st.inst[host].tapped, 'host still awake');
}

{
  const { st, host, gun, e1, e2 } = setupGun(true);
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: host, def: e1, by: 'A', seed: 1 });
  if (fx.deny) fail('atk1 deny: ' + fx.deny);
  const logTxt = (st.log || []).map(x => x.t).join('\n');
  ok(/ปืนจักรวุทธ.*POWER \+4/.test(logTxt), 'attack POWER +4 until combat: ' + logTxt.split('\n').filter(t => /POWER/.test(t)).join(' | '));
  drainPrompts(st, 1);
  let guard = 0;
  while (st.pending && guard++ < 8) {
    drainPrompts(st, 2 + guard);
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: st.pending.target, seed: 10 + guard });
    if (fx.deny) fail('resolve1 deny: ' + fx.deny);
  }
  ok(BoT.zoneOf(st, e1) === 'B.hell', 'first enemy destroyed');
  ok(!st.inst[host].tapped, 'kill-wake host');
  ok(st.inst[host].noUntapExceptName === 'ปืนจักรวุทธ', 'lock no-untap except gun');

  const fxEnd = BoT.applyAction(st, { type: 'endTurn', by: 'A' });
  ok(!!fxEnd.deny && /ต้องโจมตี/.test(fxEnd.deny), 'after wake still must attack: ' + (fxEnd.deny || 'no deny'));

  combat(st, host, e2, 'A', 30);
  ok(BoT.zoneOf(st, e2) === 'B.hell', 'second enemy destroyed');
  ok(!!st.inst[host].tapped, 'second kill does not wake (oncePerTurn)');

  fx = BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 31 });
  if (fx.deny) fail('A endTurn after second attack: ' + fx.deny);
  fx = BoT.applyAction(st, { type: 'endTurn', by: 'B', seed: 32 });
  if (fx.deny) fail('B endTurn: ' + fx.deny);
  ok(!!st.inst[host].tapped, 'Draw Phase skipped wake because of lock');
  ok(st.phase === 'Main' && st.active === 'A', 'back to A Main');

  fx = BoT.applyAction(st, { type: 'activateAbility', k: gun, by: 'A', seed: 33 });
  if (fx.deny) fail('activate deny: ' + fx.deny);
  drainPrompts(st, 33);
  ok(!st.inst[host].tapped, 'สั่งใช้ wakes host');
  ok(BoT.zoneOf(st, gun) === 'A.hand', 'gun bounced to hand');
  ok(!st.inst[gun].attachedTo, 'gun detached');
  ok(!st.inst[host].noUntapExceptName, 'lock cleared by gun wake');
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const gun = put(st, 'A.magic', 'CC02-048');
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: gun, by: 'A', seed: 50 });
  ok(!!fx.deny && /สวมใส่/.test(fx.deny), 'สั่งใช้ requires attached: ' + (fx.deny || 'no deny'));
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const host = put(st, 'A.avatar', 'SD01-003', { power: 5 });
  const gun = put(st, 'A.hand', 'CC02-048');
  let fx = BoT.applyAction(st, { type: 'playMagic', k: gun, by: 'A', seed: 90 });
  if (fx.deny) fail('playMagic gun deny: ' + fx.deny);
  ok(BoT.zoneOf(st, gun) === 'A.magic', 'play from hand stays on Magic Zone (now ' + BoT.zoneOf(st, gun) + ')');
  ok(!st.inst[gun].attachedTo, 'not attached until player equips');

  fx = BoT.applyAction(st, { type: 'attach', k: gun, to: host, by: 'A', seed: 91 });
  if (fx.deny) fail('attach deny: ' + fx.deny);
  ok(st.inst[gun].attachedTo === host, 'attached to host');
  ok(BoT.zoneOf(st, gun) === 'A.magic', 'still on Magic Zone after attach');
  st.inst[host].tapped = true;

  fx = BoT.applyAction(st, { type: 'activateAbility', k: gun, by: 'A', seed: 92 });
  if (fx.deny) fail('สั่งใช้ after attach deny: ' + fx.deny);
  ok(BoT.zoneOf(st, gun) === 'A.hand', 'สั่งใช้ bounces gun to hand');
  ok(!st.inst[host].tapped, 'สั่งใช้ wakes host');
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const host = put(st, 'A.avatar', 'SD01-003', { power: 5 });
  const gun = put(st, 'A.magic', 'CC02-048', { attachedTo: host });
  put(st, 'B.avatar', 'SD01-011', { power: 1 });
  ok(BoT.effPower(st, host) === 5, 'gun does not give +4 until declare (P' + BoT.effPower(st, host) + ')');
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk: host, def: st.zones['B.avatar'][0], by: 'A', seed: 60 });
  if (fx.deny) fail('vanilla gun atk deny: ' + fx.deny);
  ok(/ปืนจักรวุทธ.*POWER \+4/.test((st.log || []).map(x => x.t).join('\n')), 'declare attack applies +4');
  ok(gun && st.inst[gun], 'gun still equipped during attack');
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const host = put(st, 'A.avatar', 'SD01-003', { power: 6 });
  put(st, 'A.magic', 'CC01-048', { attachedTo: host });
  put(st, 'A.magic', 'BT01-043', { attachedTo: host });
  const foe = put(st, 'B.avatar', 'SD01-011', { power: 1 });
  combat(st, host, foe, 'A', 70);
  ok(!!st.inst[host].tapped, 'soup host tapped after attack');
  ok(!!st.inst[host].noUntapHard, 'soup sets hard no-untap');

  let fx = BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 71 });
  if (fx.deny) fail('soup A endTurn: ' + fx.deny);
  ok(!!st.inst[host].tapped, 'น้ำชูกำลัง cannot wake soup host');

  fx = BoT.applyAction(st, { type: 'endTurn', by: 'B', seed: 72 });
  if (fx.deny) fail('soup B endTurn: ' + fx.deny);
  ok(!!st.inst[host].tapped, 'next Draw still skipped (soup ทุกกรณี)');
  ok(!!st.inst[host].noUntapHard, 'hard lock lasts through next Main');

  fx = BoT.applyAction(st, { type: 'endTurn', by: 'A', seed: 73 });
  if (fx.deny) fail('soup A second endTurn: ' + fx.deny);
  fx = BoT.applyAction(st, { type: 'endTurn', by: 'B', seed: 74 });
  if (fx.deny) fail('soup B second endTurn: ' + fx.deny);
  ok(!st.inst[host].tapped, 'wakes on Draw after soup lock expired');
  ok(!st.inst[host].noUntapHard, 'soup lock cleared');
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const host = put(st, 'A.avatar', 'SD01-003', { power: 6 });
  put(st, 'A.magic', 'CC01-048', { attachedTo: host });
  put(st, 'A.magic', 'CC02-048', { attachedTo: host });
  const foe = put(st, 'B.avatar', 'SD01-011', { power: 1 });
  combat(st, host, foe, 'A', 80);
  ok(BoT.zoneOf(st, foe) === 'B.hell', 'enemy died');
  ok(!!st.inst[host].tapped, 'soup ทุกกรณี blocks ปืน kill-wake');
}

console.log('all cc02-048 tests passed');
