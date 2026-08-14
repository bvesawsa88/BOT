/* focused: อย่าให้มีครั้งที่ 2 (BT05-058) — ขัด React ของฝ่ายตรงข้าม */
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
function promptInfo(st) {
  return (st.prompts || []).map(p =>
    p.kind + ':' + (p.reactTrigger || p.mode || '') + '@' + p.chooser
    + '[' + (p.options || []).map(k => (st.inst[k] && st.inst[k].name) || k).join('|') + ']'
    + (p.magicNegate ? '!neg' : '')
  ).join(' ; ');
}

/* 1) อัญเชิญ → อุบัติเหตุ → อย่าให้มีครั้งที่ 2 ต้องกะพริบแล้วขัดได้ */
{
  const st = emptyState();
  const av = put(st, 'A.hand', 'SD01-011');
  const acc = put(st, 'B.hand', 'SD01-017');
  const twice = put(st, 'A.hand', 'BT05-058');
  let fx = BoT.applyAction(st, { type: 'summon', k: av, to: 'A.avatar', by: 'A', seed: 1 });
  if (fx.deny) fail('summon deny: ' + fx.deny);
  ok(BoT.zoneOf(st, av) === 'A.avatar', 'avatar summoned');
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.reactTrigger === 'avatarSummoned' && (pr.options || []).includes(acc),
    'accident window: ' + promptInfo(st));

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: acc, by: 'B', seed: 2 });
  if (fx.deny) fail('play accident deny: ' + fx.deny);
  pr = (st.prompts || [])[0];
  console.log('after accident', promptInfo(st), 'accZone', BoT.zoneOf(st, acc), 'avZone', BoT.zoneOf(st, av));
  ok(pr && (pr.magicNegate || pr.mode === 'negateMagic'), 'negate window after accident: ' + promptInfo(st));
  ok((pr.options || []).includes(twice), 'อย่าให้มีครั้งที่ 2 in negate options: ' + promptInfo(st));

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: twice, by: 'A', seed: 3 });
  if (fx.deny) fail('play อย่าให้มีครั้งที่ 2 deny: ' + fx.deny);
  console.log('after twice', promptInfo(st), 'acc', BoT.zoneOf(st, acc), 'twice', BoT.zoneOf(st, twice), 'av', BoT.zoneOf(st, av));

  // nested negate on อย่าให้มีครั้งที่ 2 — B skips
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const skip = BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 4 + n });
    if (skip.deny) fail('nested negate skip deny: ' + skip.deny);
  }
  console.log('after drain', promptInfo(st), 'acc', BoT.zoneOf(st, acc), 'twice', BoT.zoneOf(st, twice), 'av', BoT.zoneOf(st, av));
  ok(BoT.zoneOf(st, acc) === 'B.hell', 'อุบัติเหตุ hell after negate');
  ok(BoT.zoneOf(st, twice) === 'A.hell', 'อย่าให้มีครั้งที่ 2 hell');
  ok(BoT.zoneOf(st, av) === 'A.avatar', 'avatar survived accident');
}

/* 2) ใช้ React ไปแล้วในเทิร์น ยังใช้ อย่าให้มีครั้งที่ 2 ขัดได้ */
{
  const st = emptyState();
  st.magicUsed.A.React = true;
  const av = put(st, 'A.hand', 'SD01-011');
  const acc = put(st, 'B.hand', 'SD01-017');
  const twice = put(st, 'A.hand', 'BT05-058');
  let fx = BoT.applyAction(st, { type: 'summon', k: av, to: 'A.avatar', by: 'A', seed: 10 });
  if (fx.deny) fail('summon2 deny: ' + fx.deny);
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: acc, by: 'B', seed: 11 });
  if (fx.deny) fail('accident2 deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && (pr.options || []).includes(twice), 'still in options after own React used: ' + promptInfo(st));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: twice, by: 'A', seed: 12 });
  if (fx.deny) fail('twice after react-used deny: ' + fx.deny);
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const skip = BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 13 + n });
    if (skip.deny) fail('skip2 deny: ' + skip.deny);
  }
  ok(BoT.zoneOf(st, av) === 'A.avatar', 'avatar survived after second-react negate');
}

/* 3) Main ไม่มีหน้าต่าง React → ใช้ไม่ได้ (ต้อง deny ไม่ใช่ฟีซเซิล) */
{
  const st = emptyState();
  const twice = put(st, 'A.hand', 'BT05-058');
  const fx = BoT.applyAction(st, { type: 'playMagic', k: twice, by: 'A', seed: 20 });
  ok(!!fx.deny && /React/.test(fx.deny || ''), 'deny play in Main: ' + (fx.deny || 'no deny'));
  ok(BoT.zoneOf(st, twice) === 'A.hand', 'stays in hand after deny');
}

/* 4) หมอมาแล้วววว (React) ถูกขัดด้วย อย่าให้มีครั้งที่ 2 → Avatar ตาย */
{
  const st = emptyState();
  st.phase = 'Battle';
  st.active = 'B';
  const weak = put(st, 'A.avatar', 'SD01-011');
  const doc = put(st, 'A.hand', 'BT01-040');
  const twice = put(st, 'B.hand', 'BT05-058');
  const enemy = put(st, 'B.avatar', 'SD01-002');
  st.inst[enemy].power = 4;
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: enemy, def: weak, by: 'B', seed: 30 });
  if (fx.deny) fail('atk deny: ' + fx.deny);
  let guard = 0;
  while (guard++ < 10) {
    const pr = (st.prompts || [])[0];
    if (pr && pr.kind === 'react' && pr.reactTrigger === 'avatarWouldBeDestroyed') break;
    if (pr && pr.kind === 'react' && pr.chooser !== 'B') {
      fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: 30 + guard });
      continue;
    }
    if (!st.pending) break;
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: st.pending.target, seed: 40 + guard });
    if (fx.deny) fail('resolve deny: ' + fx.deny);
  }
  ok((st.prompts || [])[0] && st.prompts[0].reactTrigger === 'avatarWouldBeDestroyed', 'morma window');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: doc, by: 'A', seed: 50 });
  if (fx.deny) fail('morma play deny: ' + fx.deny);
  const prN = (st.prompts || [])[0];
  console.log('negate after morma', promptInfo(st));
  ok(prN && (prN.options || []).includes(twice), 'อย่าให้มีครั้งที่ 2 can negate หมอมาแล้ว: ' + promptInfo(st));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: twice, by: 'B', seed: 51 });
  if (fx.deny) fail('twice vs morma deny: ' + fx.deny);
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const skip = BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 52 + n });
    if (skip.deny) fail('skip morma-neg deny: ' + skip.deny);
  }
  console.log('after negate morma', 'weak', BoT.zoneOf(st, weak), 'doc', BoT.zoneOf(st, doc), 'twice', BoT.zoneOf(st, twice), promptInfo(st));
  ok(BoT.zoneOf(st, weak) === 'A.hell', 'avatar dies after หมอมาแล้ว negated');
  ok(BoT.zoneOf(st, doc) === 'A.hell', 'หมอมาแล้ว hell');
}

/* 5) ไปเลยมอนตี้ (ป้าย Normal แต่ใช้เป็น React) ถูกขัดด้วย อย่าให้มีครั้งที่ 2 */
{
  const st = emptyState();
  st.phase = 'Battle';
  st.active = 'B';
  const def = put(st, 'A.avatar', 'SD01-002');
  const monty = put(st, 'A.hand', 'SD06-014');
  const twice = put(st, 'B.hand', 'BT05-058');
  const atk = put(st, 'B.avatar', 'SD01-011');
  st.inst[atk].power = 1;
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk, def, by: 'B', seed: 60 });
  if (fx.deny) fail('atk monty deny: ' + fx.deny);
  let guard = 0;
  while (guard++ < 8) {
    const pr = (st.prompts || [])[0];
    if (pr && pr.kind === 'react' && pr.chooser === 'A' && (pr.options || []).includes(monty)) break;
    if (pr && pr.kind === 'react' && pr.chooser !== 'B') {
      fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: 60 + guard });
      continue;
    }
    if (!st.pending) break;
    break;
  }
  const prAtk = (st.prompts || [])[0];
  ok(prAtk && prAtk.kind === 'react' && (prAtk.options || []).includes(monty),
    'monty in attack react window: ' + promptInfo(st));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: monty, by: 'A', seed: 70 });
  if (fx.deny) fail('play monty deny: ' + fx.deny);
  const prN = (st.prompts || [])[0];
  ok(prN && (prN.magicNegate || prN.mode === 'negateMagic') && (prN.options || []).includes(twice),
    'อย่าให้มีครั้งที่ 2 can negate ไปเลยมอนตี้: ' + promptInfo(st));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: twice, by: 'B', seed: 71 });
  if (fx.deny) fail('twice vs monty deny: ' + fx.deny);
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const skip = BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 72 + n });
    if (skip.deny) fail('skip monty-neg deny: ' + skip.deny);
  }
  ok(BoT.zoneOf(st, monty) === 'A.hell', 'ไปเลยมอนตี้ hell after negate');
  ok(BoT.zoneOf(st, twice) === 'B.hell', 'อย่าให้มีครั้งที่ 2 hell after monty');
}

console.log('all อย่าให้มีครั้งที่ 2 tests passed');
