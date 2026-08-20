/* focused: K-BO ยอดหุ่นยนต์ — จากมือส่งอาวุธเพมมุลงนรก แล้วล็อก React ตอนเพมมุโจมตี */
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
    pendingLethal: null, oncePerGame: {}, gems: { A: 10, B: 10 },
    attacksThisTurn: { A: 0, B: 0 }, skipLethalPlead: true
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
function skipReacts(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].kind === 'react' || st.prompts[0].magicNegate) && n++ < 12) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
function drain(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && n++ < 16) {
    const pr = st.prompts[0];
    if (pr.kind === 'react' || pr.magicNegate) {
      const fx = apply(st, { type: 'reactNo', by: pr.chooser, seed: seed + n });
      if (fx.deny) fail('drain react deny: ' + fx.deny);
      continue;
    }
    break;
  }
}

{
  const e = BoT.effectOf('BT10-009', 'K-BO ยอดหุ่นยนต์');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'activatedFromHand'), 'hand activate');
}

/* 1) ไม่มีอาวุธบน Magic Zone — สั่งใช้จากมือไม่ได้ */
{
  const st = emptyState();
  const kbo = put(st, 'A.hand', 'BT10-009');
  const fx = apply(st, { type: 'activateAbility', k: kbo, by: 'A', seed: 1 });
  ok(!!fx.deny, 'no weapon deny: ' + (fx.deny || '(no deny)'));
}

/* 2) ส่งปืนลงนรก → อัญเชิญ K-BO + ได้สั่งใช้เนรเทศ */
{
  const st = emptyState();
  const kbo = put(st, 'A.hand', 'BT10-009');
  const gun = put(st, 'A.magic', 'BT09-067');
  let fx = apply(st, { type: 'activateAbility', k: kbo, by: 'A', seed: 2 });
  if (fx.deny) fail('kbo hand deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'magicToHellCost', 'pick weapon: ' + (pr && pr.dest));
  fx = apply(st, { type: 'chooseTarget', k: gun, by: 'A', seed: 3 });
  if (fx.deny) fail('send gun deny: ' + fx.deny);
  drain(st, 4);
  ok(zone(st, gun) === 'A.hell', 'gun to hell: ' + zone(st, gun));
  ok(zone(st, kbo) === 'A.avatar', 'kbo summoned: ' + zone(st, kbo));
  ok((st.inst[kbo].granted || []).some(g => g.trigger && g.trigger.on === 'activated'),
    'granted exile ability');
}

/* 3) เนรเทศ K-BO แล้วเพมมุโจมตี → ไปเลยมอนตี้ใช้ไม่ได้ + หมอกันทำลายไม่ได้ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const kbo = put(st, 'A.hand', 'BT10-009');
  const gun = put(st, 'A.magic', 'BT09-067');
  const foe = put(st, 'B.avatar', 'BT09-011');
  const monty = put(st, 'B.hand', 'BT02-054');
  const medic = put(st, 'B.hand', 'BT01-040');
  let fx = apply(st, { type: 'activateAbility', k: kbo, by: 'A', seed: 10 });
  if (fx.deny) fail('kbo2 hand deny: ' + fx.deny);
  fx = apply(st, { type: 'chooseTarget', k: gun, by: 'A', seed: 11 });
  if (fx.deny) fail('kbo2 gun deny: ' + fx.deny);
  drain(st, 12);
  fx = apply(st, { type: 'activateAbility', k: kbo, by: 'A', seed: 13 });
  if (fx.deny) fail('kbo exile deny: ' + fx.deny);
  drain(st, 14);
  ok(zone(st, kbo) === 'A.dark', 'kbo exiled: ' + zone(st, kbo));
  ok(!!(st.pemuSpriteCombatLock && st.pemuSpriteCombatLock.A), 'combat lock armed');

  st.phase = 'Battle';
  fx = apply(st, { type: 'declareAttack', atk: pem, def: foe, by: 'A', seed: 15 });
  if (fx.deny) fail('pemu attack deny: ' + fx.deny);
  const fightReact = (st.prompts || []).find(p => p.reactTrigger === 'enemyDeclareAttack');
  ok(!fightReact, 'no enemy declare-attack react');
  ok(zone(st, monty) === 'B.hand', 'monty unused: ' + zone(st, monty));
  if (st.pending) {
    fx = apply(st, { type: 'resolveAttack', by: 'B', seed: 16 });
    if (fx.deny) fail('resolve deny: ' + fx.deny);
  }
  drain(st, 17);
  ok(zone(st, foe) === 'B.hell', 'princess destroyed: ' + zone(st, foe));
  ok(zone(st, medic) === 'B.hand', 'medic unused: ' + zone(st, medic));
}

/* 4) อัญเชิญแบบจ่ายคอสธรรมดา — ไม่ได้ความสามารถล็อก */
{
  const st = emptyState();
  const kbo = put(st, 'A.hand', 'BT10-009');
  const pay = put(st, 'A.hand', 'BT09-010');
  let fx = apply(st, { type: 'summon', k: kbo, to: 'A.avatar', payIds: [pay], by: 'A', seed: 20 });
  if (fx.deny) fail('normal summon deny: ' + fx.deny);
  drain(st, 21);
  ok(zone(st, kbo) === 'A.avatar', 'normal summoned');
  ok(!(st.inst[kbo].granted || []).length, 'no granted on paid summon');
}

console.log('ALL PASS');
