/* focused: หมอมาแล้วววว (BT01-040) — เมื่อ Avatar จะถูกทำลาย → ไม่ถูกทำลาย */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) {
  return cards.find(c => c.code === code);
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
    phase: 'Battle', active: 'B', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
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
function promptKinds(st) {
  return (st.prompts || []).map(p => p.kind + (p.reactTrigger ? ':' + p.reactTrigger : ''));
}
function combatUntilWindow(st, atk, def, by, seed) {
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk, def, by, seed });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  let guard = 0;
  while (guard++ < 10) {
    const pr = (st.prompts || [])[0];
    if (pr && pr.kind === 'react' && pr.reactTrigger === 'avatarWouldBeDestroyed') return fx;
    if (pr && pr.kind === 'react' && pr.chooser !== by) {
      fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: seed + guard });
      if (fx.deny) fail('reactNo deny: ' + fx.deny);
      continue;
    }
    if (!st.pending) break;
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: st.pending.target, seed: seed + 20 + guard });
    if (fx.deny) fail('resolveAttack deny: ' + fx.deny);
  }
  return fx;
}

/* 1) ต่อสู้จะทำลาย Avatar + มีหมอมาแล้ววววในมือ → หน้าต่าง React → ใช้แล้ว Avatar รอด */
{
  const st = emptyState();
  const weak = put(st, 'A.avatar', 'SD01-011');
  const doc = put(st, 'A.hand', 'BT01-040');
  const enemy = put(st, 'B.avatar', 'SD01-002');
  st.inst[enemy].power = 4;

  combatUntilWindow(st, enemy, weak, 'B', 1);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.reactTrigger === 'avatarWouldBeDestroyed',
    'would-destroy window: ' + promptKinds(st).join(','));
  ok((pr.options || []).includes(doc), 'หมอมาแล้วววว is a react option');
  ok(BoT.zoneOf(st, weak) === 'A.avatar', 'avatar still on field during window');

  const fx = BoT.applyAction(st, { type: 'chooseTarget', k: doc, by: 'A', seed: 2 });
  if (fx.deny) fail('play หมอมาแล้ว deny: ' + fx.deny);
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && st.prompts[0].magicNegate && n++ < 8) {
    const chooser = st.prompts[0].chooser;
    const skip = BoT.applyAction(st, { type: 'reactNo', by: chooser, seed: 2 + n });
    if (skip.deny) fail('negate skip deny: ' + skip.deny);
  }
  ok(BoT.zoneOf(st, weak) === 'A.avatar', 'avatar saved on field');
  ok(BoT.zoneOf(st, doc) === 'A.hell', 'หมอมาแล้วววว went to hell (now ' + BoT.zoneOf(st, doc) + ')');
  ok(!(st.prompts || []).some(p => p.reactTrigger === 'avatarWouldBeDestroyed'), 'window closed');
  ok(!st._wouldDestroyPending, 'pending destroy cleared');
}

/* 2) มีหมอมาแล้ววววแต่กดไม่ใช้ → Avatar ถูกทำลาย */
{
  const st = emptyState();
  const weak = put(st, 'A.avatar', 'SD01-011');
  put(st, 'A.hand', 'BT01-040');
  const enemy = put(st, 'B.avatar', 'SD01-002');
  st.inst[enemy].power = 4;

  combatUntilWindow(st, enemy, weak, 'B', 10);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.reactTrigger === 'avatarWouldBeDestroyed', 'window before skip');
  const fx = BoT.applyAction(st, { type: 'reactNo', by: 'A', seed: 11 });
  if (fx.deny) fail('reactNo deny: ' + fx.deny);
  ok(BoT.zoneOf(st, weak) === 'A.hell', 'avatar destroyed after skip');
}

/* 3) ไม่มีหมอมาแล้ววววในมือ → ไม่มีหน้าต่าง ตายทันที */
{
  const st = emptyState();
  const weak = put(st, 'A.avatar', 'SD01-011');
  const enemy = put(st, 'B.avatar', 'SD01-002');
  st.inst[enemy].power = 4;

  combatUntilWindow(st, enemy, weak, 'B', 20);
  ok(!(st.prompts || []).some(p => p.reactTrigger === 'avatarWouldBeDestroyed'), 'no window without the card');
  ok(BoT.zoneOf(st, weak) === 'A.hell', 'avatar destroyed immediately');
}

/* 4) ห้ามใช้หมอมาแล้ววววใน Main ตอนไม่มีใครจะถูกทำลาย */
{
  const st = emptyState();
  st.phase = 'Main';
  st.active = 'A';
  const doc = put(st, 'A.hand', 'BT01-040');
  put(st, 'A.avatar', 'SD01-011');
  const fx = BoT.applyAction(st, { type: 'playMagic', k: doc, by: 'A', seed: 30 });
  ok(!!fx.deny && /จะถูกทำลาย/.test(fx.deny || ''), 'deny play in Main: ' + (fx.deny || 'no deny'));
}

console.log('all หมอมาแล้วววว tests passed');
