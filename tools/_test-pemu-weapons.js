/* focused: อาวุธของเพมมุ — ปืนพกรุ่น 19 / ดาบมารไร้พ่าย + สไปรท์ตื่นโดยไม่ต้องคู่หู */
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

function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].kind === 'react' || st.prompts[0].magicNegate) && n++ < 10) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}

function combat(st, atk, def, by, seed) {
  let fx = apply(st, { type: 'declareAttack', atk, def, by, seed });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  drainReact(st, seed);
  let guard = 0;
  while (st.pending && guard++ < 8) {
    drainReact(st, seed + guard);
    if (!st.pending) break;
    fx = apply(st, { type: 'resolveAttack', by: st.pending.target, seed: seed + 20 + guard });
    if (fx.deny) fail('resolveAttack deny: ' + fx.deny);
  }
  return fx;
}

function promptDest(st) {
  const p = (st.prompts || [])[0];
  return p && (p.dest || p.kind);
}

{
  const e = BoT.effectOf('BT09-067', 'อาวุธของเพมมุ ปืนพกรุ่น 19');
  ok(e && e.attachOnly && e.attachOnly.nameIncludes === 'เพมมุ', 'gun attachOnly pemu');
  ok(e.uniqueMagicNameIncludes === 'อาวุธของเพมมุ', 'gun unique 1 in magic');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'battleDestroy' && a.ifDestroyedPowerDiffGte === 2),
    'gun battleDestroy if POWER diff >= 2');
}

{
  const e = BoT.effectOf('BT10-069', 'อาวุธของเพมมุ ดาบมารไร้พ่าย');
  ok(e && e.attachOnly && e.attachOnly.nameIncludes === 'เพมมุ', 'sword attachOnly pemu');
  ok(e.uniqueMagicNameIncludes === 'อาวุธของเพมมุ', 'sword unique 1 in magic');
  ok((e.abilities || []).some(a => (a.actions || []).some(ac => ac.target && ac.target.select === 'equippedAvatar' && ac.amount === 1)),
    'sword host POWER +1');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'battleDestroy'), 'sword battleDestroy');
}

/* ปืน: สวมเพมมุได้ สวมสไปรท์ไม่ได้ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const spr = put(st, 'A.avatar', 'BT09-009');
  const gun = put(st, 'A.magic', 'BT09-067');
  let fx = apply(st, { type: 'attach', k: gun, to: spr, by: 'A', seed: 1 });
  ok(!!fx.deny, 'gun cannot attach to sprite: ' + fx.deny);
  fx = apply(st, { type: 'attach', k: gun, to: pem, by: 'A', seed: 2 });
  if (fx.deny) fail('gun attach pemu deny: ' + fx.deny);
  ok(st.inst[gun].attachedTo === pem, 'gun on pemu');
  ok(BoT.effPower(st, pem) === 4, 'pemu +2 while equipped gun: ' + BoT.effPower(st, pem));
}

/* Magic Zone มีอาวุธของเพมมุได้ 1 ใบ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.magic', 'BT09-067');
  const sword = put(st, 'A.hand', 'BT10-069');
  const fx = apply(st, { type: 'playMagic', k: sword, by: 'A', seed: 3 });
  ok(!!fx.deny && /1 ใบ/.test(fx.deny), 'second pemu weapon denied: ' + fx.deny);
}

/* ปืน: ฆ่า POWER ต่าง ≥2 → หงาย LIFE */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const gun = put(st, 'A.magic', 'BT09-067');
  apply(st, { type: 'attach', k: gun, to: pem, by: 'A', seed: 4 });
  const foe = put(st, 'B.avatar', 'SD01-011'); /* ยักษ์ P1 */
  const life = put(st, 'B.life', 'SD01-003', { faceUp: false });
  combat(st, pem, foe, 'A', 10);
  ok(zone(st, foe) === 'B.hell', 'gun killed yak');
  ok(st.inst[life].faceUp === true, 'gun revealed opp LIFE');
}

/* ปืน: ฆ่าแล้วมี React ป้องกันทำลาย แต่เลือกไม่ใช้ (reactNo) → เหยื่อตาย และปืนหงาย LIFE */
{
  const st = emptyState({ phase: 'Battle', turn: 2 });
  const pem = put(st, 'A.avatar', 'BT09-008');
  const gun = put(st, 'A.magic', 'BT09-067');
  apply(st, { type: 'attach', k: gun, to: pem, by: 'A', seed: 4 });
  const foe = put(st, 'B.avatar', 'SD01-011'); /* ยักษ์ P1 */
  const life = put(st, 'B.life', 'SD01-003', { faceUp: false });
  put(st, 'A.hand', 'ODY1-073'); /* หมอมาแล้วววว */
  let fx = apply(st, { type: 'declareAttack', atk: pem, def: foe, by: 'A', seed: 12 });
  ok((st.prompts || []).some(p => p.kind === 'react' && p.reactTrigger === 'avatarWouldBeDestroyed'), 'react prompt opened');
  fx = apply(st, { type: 'reactNo', by: 'A', seed: 13 });
  if (fx.deny) fail('reactNo deny: ' + fx.deny);
  ok(zone(st, foe) === 'B.hell', 'foe sent to hell after reactNo');
  ok(st.inst[life].faceUp === true, 'gun revealed opp LIFE after reactNo');
}

/* ปืน: ฆ่า POWER ต่าง <2 → ไม่หงาย LIFE */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const gun = put(st, 'A.magic', 'BT09-067');
  apply(st, { type: 'attach', k: gun, to: pem, by: 'A', seed: 5 });
  const foe = put(st, 'B.avatar', 'SD01-007'); /* เทวดานักมวย P3 · เพมมุสวมปืน P4 */
  const life = put(st, 'B.life', 'SD01-003', { faceUp: false });
  combat(st, pem, foe, 'A', 20);
  ok(zone(st, foe) === 'B.hell', 'gun killed boxer P3');
  ok(st.inst[life].faceUp === false, 'gun skip LIFE when diff < 2');
}

/* ดาบ: POWER +1 ทับ +2 จากเพมมุ = 5 */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const sword = put(st, 'A.magic', 'BT10-069');
  apply(st, { type: 'attach', k: sword, to: pem, by: 'A', seed: 6 });
  ok(BoT.effPower(st, pem) === 5, 'pemu +2 attach +1 sword = 5: ' + BoT.effPower(st, pem));
}

/* ดาบ: ฆ่าแล้วยิงทำลายใบที่ POWER ตั้งต้น ≤ เหยื่อ แล้วถอดดาบเพื่อตื่นเพมมุ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const sword = put(st, 'A.magic', 'BT10-069');
  apply(st, { type: 'attach', k: sword, to: pem, by: 'A', seed: 7 });
  const e1 = put(st, 'B.avatar', 'SD01-011'); /* P1 */
  const e2 = put(st, 'B.avatar', 'SD01-011'); /* P1 — เป้ายิงต่อ */
  const e3 = put(st, 'B.avatar', 'SD01-007'); /* P3 — ไม่ใช่เป้า */
  combat(st, pem, e1, 'A', 30);
  ok(zone(st, e1) === 'B.hell', 'sword killed first yak');
  ok(!!st.inst[pem].tapped, 'pemu tapped after attack');

  let pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'destroy', 'sword shoot prompt: ' + promptDest(st));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(e2), 'shoot includes other P1');
  ok(!cands.includes(e3), 'shoot excludes P3');
  let fx = apply(st, { type: 'chooseTarget', k: e2, by: 'A', seed: 31 });
  if (fx.deny) fail('sword shoot deny: ' + fx.deny);
  ok(zone(st, e2) === 'B.hell', 'sword shot second yak');
  ok(zone(st, e3) === 'B.avatar', 'P3 still on field');

  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseMode', 'unequip-to-wake prompt: ' + promptDest(st));
  fx = apply(st, { type: 'chooseMode', k: sword, opt: 0, by: 'A', seed: 32 });
  if (fx.deny) fail('unequip mode deny: ' + fx.deny);
  ok(zone(st, sword) === 'A.hell', 'sword destroyed to wake');
  ok(!st.inst[pem].tapped, 'pemu woke after destroying sword');
}

/* ดาบ: ฆ่าแล้วไม่มีเป้ายิงต่อ — ยังถอดเพื่อตื่นได้ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const sword = put(st, 'A.magic', 'BT10-069');
  apply(st, { type: 'attach', k: sword, to: pem, by: 'A', seed: 8 });
  const e1 = put(st, 'B.avatar', 'SD01-011');
  const e3 = put(st, 'B.avatar', 'SD01-007');
  combat(st, pem, e1, 'A', 40);
  ok(zone(st, e1) === 'B.hell', 'solo kill');
  const dests = (st.prompts || []).map(p => p.dest || p.kind);
  ok(!dests.includes('destroy'), 'no shoot when no printed<=1: ' + dests.join(','));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseMode', 'still offer destroy sword to wake: ' + dests.join(','));
  const fx = apply(st, { type: 'chooseMode', k: sword, opt: 0, by: 'A', seed: 41 });
  if (fx.deny) fail('solo unequip deny: ' + fx.deny);
  ok(zone(st, sword) === 'A.hell', 'sword gone');
  ok(!st.inst[pem].tapped, 'pemu woke without shoot target');
  ok(zone(st, e3) === 'B.avatar', 'P3 untouched');
}

/* สไปรท์ไม่คู่หู: นอนจากสามัคคี แล้ว End Phase จะไม่ตื่น (ตื่นเมื่อมีคู่หูเท่านั้น) */
{
  const st = emptyState({ phase: 'Battle' });
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const spr = put(st, 'A.avatar', 'BT09-009');
  const dummy = put(st, 'A.avatar', 'SD01-010');
  let fx = apply(st, { type: 'unity', k: spr, to: dummy, by: 'A', seed: 50 });
  if (fx.deny) fail('unity deny: ' + fx.deny);
  ok(!!st.inst[spr].tapped, 'sprite tapped for unity without pair');
  fx = apply(st, { type: 'endTurn', by: 'A', seed: 51 });
  if (fx.deny) fail('endTurn deny: ' + fx.deny);
  ok(st.inst[spr].tapped === true, 'sprite stays tapped at own end without buddy');
}

/* เล่นอาวุธเพมมุจากมือ: ถ้าไม่มีเพมมุบนสนาม ต้องใช้ไม่ได้ (Deny) */
{
  const st = emptyState();
  const gun = put(st, 'A.hand', 'BT09-067');
  const sword = put(st, 'A.hand', 'BT10-069');
  
  // สนามว่าง
  let fx = apply(st, { type: 'playMagic', k: gun, by: 'A' });
  ok(!!fx.deny, 'gun without avatar on field denied: ' + fx.deny);

  // มีแค่อวาตาร์ตัวอื่น (เช่น สไปรท์)
  put(st, 'A.avatar', 'BT09-009');
  fx = apply(st, { type: 'playMagic', k: gun, by: 'A' });
  ok(!!fx.deny, 'gun with only sprite denied: ' + fx.deny);
  fx = apply(st, { type: 'playMagic', k: sword, by: 'A' });
  ok(!!fx.deny, 'sword with only sprite denied: ' + fx.deny);

  // มีเพมมุ -> เล่นได้
  put(st, 'A.avatar', 'BT09-008');
  fx = apply(st, { type: 'playMagic', k: gun, by: 'A' });
  ok(!fx.deny, 'gun with pemmu on field allowed: ' + (fx.deny || ''));
  ok(zone(st, gun) === 'A.magic', 'gun in magic zone');
}

console.log('ALL PASS');
