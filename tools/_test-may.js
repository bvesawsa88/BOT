/* focused: เมย์ แวมไพร์โกธิค — จากมือตอนเพมมุ/สไปรท์ต่อสู้ + คู่หูเจ้าหญิง */
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
  while ((st.prompts || [])[0] && (st.prompts[0].kind === 'react' || st.prompts[0].magicNegate) && n++ < 10) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}

{
  const e = BoT.effectOf('BT09-010', 'เมย์ แวมไพร์โกธิค');
  ok(e && e.protectAllyNameIncludes === 'เจ้าหญิงรวงข้าว', 'protect princess meta');
  ok((e.abilities || []).some(a => a.trigger && a.trigger.on === 'ownAvatarFights'), 'ownAvatarFights ability');
}

/* 1) เพมมุโจมตี → เนรเทศเมย์จากมือ → เพมมุ +4 */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.avatar', 'BT09-009');
  const may = put(st, 'A.hand', 'BT09-010');
  const foe = put(st, 'B.avatar', 'SD01-003');
  const before = BoT.effPower(st, pem);
  let fx = apply(st, { type: 'declareAttack', atk: pem, def: foe, by: 'A', seed: 1 });
  if (fx.deny) fail('declare pemu deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.reactTrigger === 'ownAvatarFights',
    'fight window: ' + JSON.stringify(pr && { kind: pr.kind, trig: pr.reactTrigger }));
  ok((pr.options || []).includes(may), 'may in fight options');
  fx = apply(st, { type: 'chooseTarget', k: may, by: 'A', seed: 2 });
  if (fx.deny) fail('use may deny: ' + fx.deny);
  ok(zone(st, may) === 'A.dark', 'may exiled: ' + zone(st, may));
  ok(BoT.effPower(st, pem) === before + 4, 'pemu +4: ' + before + ' → ' + BoT.effPower(st, pem));
}

/* 2) สไปรท์ถูกโจมตีก็ใช้เมย์ได้ */
{
  const st = emptyState({ active: 'B' });
  const spr = put(st, 'A.avatar', 'BT09-009');
  put(st, 'A.avatar', 'BT09-008');
  const may = put(st, 'A.hand', 'BT09-010');
  const atk = put(st, 'B.avatar', 'SD01-002');
  const before = BoT.effPower(st, spr);
  let fx = apply(st, { type: 'declareAttack', atk, def: spr, by: 'B', seed: 10 });
  if (fx.deny) fail('declare on sprite deny: ' + fx.deny);
  const pr = (st.prompts || []).find(p => p.reactTrigger === 'ownAvatarFights' && p.chooser === 'A');
  ok(pr && (pr.options || []).includes(may), 'defender may window');
  fx = apply(st, { type: 'chooseTarget', k: may, by: 'A', seed: 11 });
  if (fx.deny) fail('defender may deny: ' + fx.deny);
  ok(zone(st, may) === 'A.dark', 'may exiled while defending');
  ok(BoT.effPower(st, spr) === before + 4, 'sprite +4: ' + before + ' → ' + BoT.effPower(st, spr));
}

/* 3) Avatar อื่นต่อสู้ — เมย์ไม่ขึ้น */
{
  const st = emptyState();
  const other = put(st, 'A.avatar', 'SD01-003');
  const may = put(st, 'A.hand', 'BT09-010');
  const foe = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'declareAttack', atk: other, def: foe, by: 'A', seed: 20 });
  if (fx.deny) fail('other attack deny: ' + fx.deny);
  const pr = (st.prompts || []).find(p => p.reactTrigger === 'ownAvatarFights' && p.chooser === 'A');
  ok(!pr || !(pr.options || []).includes(may), 'may not offered for unrelated fighter');
}

/* 4) มีเมย์ในมิติมืดแล้ว — ใช้ใบในมือไม่ได้ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.avatar', 'BT09-009');
  put(st, 'A.dark', 'BT09-010');
  const may = put(st, 'A.hand', 'BT09-010');
  const foe = put(st, 'B.avatar', 'SD01-003');
  let fx = apply(st, { type: 'declareAttack', atk: pem, def: foe, by: 'A', seed: 30 });
  if (fx.deny) fail('pemu attack 2 deny: ' + fx.deny);
  const pr = (st.prompts || []).find(p => p.reactTrigger === 'ownAvatarFights' && p.chooser === 'A');
  ok(!pr || !(pr.options || []).includes(may), 'may blocked when name already in dark');
}

/* 5) มีเจ้าหญิง — POWER ตั้งต้น 5 (+2 ในเทิร์นเราถ้า Link) */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const may = put(st, 'A.avatar', 'BT09-010');
  ok(BoT.effPower(st, may) === 2, 'may base 2: ' + BoT.effPower(st, may));
  put(st, 'A.avatar', 'BT09-011');
  ok(BoT.effPower(st, may) === 7, 'may 5 base +2 princess own turn: ' + BoT.effPower(st, may));
  st.active = 'B';
  ok(BoT.effPower(st, may) === 5, 'may 5 on opp turn: ' + BoT.effPower(st, may));
}

/* 6) กันเจ้าหญิงเป็นเป้าโจมตี และเป้าทำลายของศัตรู */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  put(st, 'A.avatar', 'BT09-010');
  const princess = put(st, 'A.avatar', 'BT09-011');
  const other = put(st, 'A.avatar', 'SD01-003');
  const atk = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'declareAttack', atk, def: princess, by: 'B', seed: 40 });
  ok(!!fx.deny, 'cannot attack princess: ' + fx.deny);
  fx = apply(st, { type: 'declareAttack', atk, def: other, by: 'B', seed: 41 });
  if (fx.deny) fail('attack other deny: ' + fx.deny);
  skipReacts(st, 42);

  const st2 = emptyState({ phase: 'Main', active: 'B' });
  put(st2, 'A.avatar', 'BT09-010');
  const princess2 = put(st2, 'A.avatar', 'BT09-011');
  const other2 = put(st2, 'A.avatar', 'SD01-003');
  const ish = put(st2, 'B.avatar', 'FPRO-004');
  fx = apply(st2, { type: 'activateAbility', k: ish, by: 'B', seed: 50 });
  if (fx.deny) fail('ishvar deny: ' + fx.deny);
  skipReacts(st2, 51);
  const pr = (st2.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'ishvar chooseDestroy');
  const cands = BoT.promptCandidates(st2, pr);
  ok(!cands.includes(princess2), 'princess not destroyable: ' + JSON.stringify(cands));
  ok(cands.includes(other2), 'other still destroyable');
}

/* 7) Main ไม่มีหน้าต่างต่อสู้ — สั่งใช้จากมือไม่ได้ */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const may = put(st, 'A.hand', 'BT09-010');
  const fx = apply(st, { type: 'activateAbility', k: may, by: 'A', seed: 60 });
  ok(!!fx.deny, 'no free hand activate: ' + (fx.deny || '(no deny)'));
}

console.log('ALL PASS');
