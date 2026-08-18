/* focused: BT01 remaining auto — อู๊ดลูกเสือ / ตีพ่อ / พ่อพันธุ์ / นางพญา / ริกกี้ */
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
    phase: 'Battle', active: 'B', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
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
function skipTopReact(st, seed) {
  const pr = (st.prompts || [])[0];
  if (pr && pr.kind === 'react') {
    const fx = apply(st, { type: 'reactNo', by: pr.chooser, seed: seed || 1 });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
    return true;
  }
  return false;
}
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

/* 1) อู๊ดลูกเสือ: นอน Avatar อื่น → ยกเลิกการโจมตี */
{
  const st = emptyState();
  padDecks(st);
  const oud = put(st, 'A.avatar', 'BT01-005');
  const ally = put(st, 'A.avatar', 'SD01-003');
  const atk = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'declareAttack', atk, def: oud, by: 'B', seed: 1 });
  if (fx.deny) fail('oud declare deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'cancelAttackRest', 'oud prompt rest ally: ' + JSON.stringify(pr && { dest: pr.dest, kind: pr.kind }));
  fx = apply(st, { type: 'chooseTarget', k: ally, by: 'A', seed: 2 });
  if (fx.deny) fail('oud pick deny: ' + fx.deny);
  ok(!st.pending, 'attack cancelled');
  ok(!!st.inst[ally].tapped, 'ally rested');
  ok(zone(st, oud) === 'A.avatar', 'oud still on field');
}

/* 2) อู๊ดลูกเสือ: ข้าม → โจมตีต่อ */
{
  const st = emptyState();
  padDecks(st);
  const oud = put(st, 'A.avatar', 'BT01-005');
  put(st, 'A.avatar', 'SD01-003');
  const atk = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'declareAttack', atk, def: oud, by: 'B', seed: 3 });
  if (fx.deny) fail('oud skip declare deny: ' + fx.deny);
  ok((st.prompts || [])[0] && st.prompts[0].dest === 'cancelAttackRest', 'oud skip has rest prompt');
  fx = apply(st, { type: 'skipPrompt', by: 'A', seed: 4 });
  if (fx.deny) fail('oud skipPrompt deny: ' + fx.deny);
  while (skipTopReact(st, 5)) { /* drain */ }
  ok(!!st.pending, 'attack still pending after skip');
}

/* 3) ตีพ่อ: ทำลายจากการต่อสู้ → โฮสต์ตื่น เทิร์นละครั้ง */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  padDecks(st);
  const host = put(st, 'A.avatar', 'SD01-002'); // P4
  const dad = put(st, 'A.magic', 'BT01-046');
  st.inst[dad].attachedTo = host;
  const e1 = put(st, 'B.avatar', 'SD01-011'); // P1
  const e2 = put(st, 'B.avatar', 'SD01-011', { power: 1 });
  let fx = apply(st, { type: 'declareAttack', atk: host, def: e1, by: 'A', seed: 10 });
  if (fx.deny) fail('dad atk1 deny: ' + fx.deny);
  let guard = 0;
  while (st.pending && guard++ < 8) {
    skipTopReact(st, 11 + guard);
    if (!st.pending) break;
    fx = apply(st, { type: 'resolveAttack', by: st.pending.target, seed: 20 + guard });
    if (fx.deny) fail('dad resolve1 deny: ' + fx.deny);
  }
  ok(zone(st, e1) === 'B.hell', 'first enemy destroyed');
  ok(!st.inst[host].tapped, 'host woke after kill');

  fx = apply(st, { type: 'declareAttack', atk: host, def: e2, by: 'A', seed: 30 });
  if (fx.deny) fail('dad atk2 deny: ' + fx.deny);
  guard = 0;
  while (st.pending && guard++ < 8) {
    skipTopReact(st, 31 + guard);
    if (!st.pending) break;
    fx = apply(st, { type: 'resolveAttack', by: st.pending.target, seed: 40 + guard });
    if (fx.deny) fail('dad resolve2 deny: ' + fx.deny);
  }
  ok(zone(st, e2) === 'B.hell', 'second enemy destroyed');
  ok(!!st.inst[host].tapped, 'second kill does not wake (oncePerTurn)');
}

/* 4) พ่อพันธุ์: มีนางพญา → อัญเชิญรัททาทุยจากเด็ค Cost รวม≤5 */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  padDecks(st);
  put(st, 'A.avatar', 'BT01-008');
  const dad = put(st, 'A.hand', 'BT01-009');
  const pay = put(st, 'A.hand', 'BT01-026');
  const r1 = put(st, 'A.deck', 'BT01-010');
  const r2 = put(st, 'A.deck', 'BT01-010');
  put(st, 'A.deck', 'BT01-013'); // Cost 3 — หลังร1+ร2=2 ยังเลือกได้ แต่โซนเต็มที่ 4 จึงไม่ใช้
  let fx = apply(st, { type: 'summon', k: dad, to: 'A.avatar', payIds: [pay], by: 'A', seed: 50 });
  if (fx.deny) fail('father summon deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'avatar' && pr.costSumMax === 5, 'father multi summon costSumMax 5: ' + JSON.stringify(pr && { dest: pr.dest, costSumMax: pr.costSumMax, from: pr.from }));
  fx = apply(st, { type: 'chooseTarget', k: r1, by: 'A', seed: 51 });
  if (fx.deny) fail('pick r1 deny: ' + fx.deny);
  ok(zone(st, r1) === 'A.avatar', 'r1 summoned');
  fx = apply(st, { type: 'chooseTarget', k: r2, by: 'A', seed: 52 });
  if (fx.deny) fail('pick r2 deny: ' + fx.deny);
  ok(zone(st, r2) === 'A.avatar', 'r2 summoned (Cost รวม 2/5)');
  fx = apply(st, { type: 'skipPrompt', by: 'A', seed: 54 });
  if (fx.deny) fail('father skip more deny: ' + fx.deny);
}

/* 5) พ่อพันธุ์: ไม่มีนางพญา → ข้ามจุติ */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  padDecks(st);
  const dad = put(st, 'A.hand', 'BT01-009');
  const pay = put(st, 'A.hand', 'BT01-026');
  put(st, 'A.deck', 'BT01-010');
  const fx = apply(st, { type: 'summon', k: dad, to: 'A.avatar', payIds: [pay], by: 'A', seed: 55 });
  if (fx.deny) fail('father no-queen summon deny: ' + fx.deny);
  ok(!(st.prompts || []).some(p => p.dest === 'avatar' && p.costSumMax === 5), 'no multi-summon without queen');
  ok(zone(st, dad) === 'A.avatar', 'father on field');
}

/* 6) นางพญา: Draw Phase แรก หยิบจากเด็คแทนจั่ว */
{
  const st = emptyState({ phase: 'Main', active: 'A', turn: 1, turnSeq: 1, firstPlayer: 'A' });
  const queen = put(st, 'A.deck', 'BT01-008');
  const top = put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-003');
  let fx = apply(st, { type: 'endTurn', by: 'A', seed: 60 });
  if (fx.deny) fail('A endTurn1 deny: ' + fx.deny);
  fx = apply(st, { type: 'endTurn', by: 'B', seed: 61 });
  if (fx.deny) fail('B endTurn deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'replaceFirstDraw', 'queen first-draw prompt: ' + JSON.stringify(pr && { dest: pr.dest, ids: pr.ids }));
  fx = apply(st, { type: 'chooseTarget', k: queen, by: 'A', seed: 62 });
  if (fx.deny) fail('queen pick deny: ' + fx.deny);
  ok(zone(st, queen) === 'A.hand', 'queen in hand instead of draw');
  ok(zone(st, top) === 'A.deck', 'normal top card not drawn');
  ok(st.phase === 'Main' && st.active === 'A', 'entered A Main after first draw');
}

/* 7) นางพญา: ข้ามแล้วจั่วปกติ */
{
  const st = emptyState({ phase: 'Main', active: 'A', turn: 1, turnSeq: 1, firstPlayer: 'A' });
  const queen = put(st, 'A.deck', 'BT01-008');
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-003');
  let fx = apply(st, { type: 'endTurn', by: 'A', seed: 70 });
  if (fx.deny) fail('A endTurn skip deny: ' + fx.deny);
  fx = apply(st, { type: 'endTurn', by: 'B', seed: 71 });
  if (fx.deny) fail('B endTurn skip deny: ' + fx.deny);
  ok((st.prompts || [])[0] && st.prompts[0].dest === 'replaceFirstDraw', 'queen skip still prompted');
  fx = apply(st, { type: 'skipPrompt', by: 'A', seed: 72 });
  if (fx.deny) fail('queen skipPrompt deny: ' + fx.deny);
  ok(zone(st, queen) === 'A.deck', 'queen stayed in deck when skipped');
  ok(st.phase === 'Main' && st.active === 'A', 'Main after skip draw');
}

/* 8) ริกกี้: ถูกทำลายจากการต่อสู้ → ยึด Avatar นอน แล้วสวม — ใบนี้ถูกทำลายแล้วโฮสต์กลับมือเจ้าของ */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  padDecks(st);
  const fodder = put(st, 'A.avatar', 'SD01-011');
  const ricky = put(st, 'A.hand', 'BT01-042');
  const enemy = put(st, 'B.avatar', 'SD01-002'); // P4
  let fx = apply(st, { type: 'declareAttack', atk: enemy, def: fodder, by: 'B', seed: 80 });
  if (fx.deny) fail('ricky declare deny: ' + fx.deny);
  let guard = 0;
  while (st.pending && guard++ < 10) {
    const pr0 = (st.prompts || [])[0];
    if (pr0 && pr0.kind === 'react' && pr0.reactTrigger !== 'ownAvatarDestroyed') {
      fx = apply(st, { type: 'reactNo', by: pr0.chooser, seed: 81 + guard });
      if (fx.deny) fail('ricky reactNo deny: ' + fx.deny);
      continue;
    }
    if (pr0 && pr0.kind === 'react' && pr0.reactTrigger === 'ownAvatarDestroyed') break;
    if (!st.pending) break;
    fx = apply(st, { type: 'resolveAttack', by: st.pending.target, seed: 90 + guard });
    if (fx.deny) fail('ricky resolve deny: ' + fx.deny);
  }
  ok(zone(st, fodder) === 'A.hell' || !st.zones['A.avatar'].includes(fodder), 'fodder destroyed');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.reactTrigger === 'ownAvatarDestroyed',
    'ricky react window: ' + JSON.stringify(pr && { kind: pr.kind, trig: pr.reactTrigger, options: pr.options }));
  fx = apply(st, { type: 'chooseTarget', k: ricky, by: 'A', seed: 100 });
  if (fx.deny) fail('ricky play deny: ' + fx.deny);
  while (skipTopReact(st, 101)) { /* negate window */ }
  const steal = (st.prompts || [])[0];
  ok(steal && steal.dest === 'takeControl', 'takeControl prompt: ' + JSON.stringify(steal && { dest: steal.dest, filter: steal.filter }));
  fx = apply(st, { type: 'chooseTarget', k: enemy, by: 'A', seed: 102 });
  if (fx.deny) fail('ricky steal deny: ' + fx.deny);
  ok(zone(st, enemy) === 'A.avatar', 'stolen onto A field');
  ok(!!st.inst[enemy].tapped, 'stolen stays resting');
  ok(st.inst[ricky].attachedTo === enemy, 'ricky attached to stolen');
  ok(zone(st, ricky) === 'A.magic', 'ricky stays as modification: ' + zone(st, ricky));

  fx = apply(st, { type: 'move', k: ricky, to: 'A.hell', by: 'A', seed: 103 });
  if (fx.deny) fail('destroy ricky deny: ' + fx.deny);
  ok(zone(st, enemy) === 'B.hand', 'host bounced to original owner hand: ' + zone(st, enemy));
}

console.log('BT01 remaining auto: all passed');
