/* focused: Link ชุดแรก — เพมมุ ยอดมนุษย์ / สไปรท์ ยอดสุนัข */
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

/* 1) เพมมุไม่มีสวม — POWER ตั้งต้น 2 */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  ok(BoT.effPower(st, pem) === 2, 'pemmu base power 2');
}

/* 2) สวมอาวุธของเพมมุแล้ว POWER +2 */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const gun = put(st, 'A.magic', 'BT09-067');
  let fx = apply(st, { type: 'attach', k: gun, to: pem, by: 'A', seed: 1 });
  if (fx.deny) fail('attach weapon deny: ' + fx.deny);
  ok(st.inst[gun].attachedTo === pem, 'gun attached to pemmu');
  ok(BoT.effPower(st, pem) === 4, 'pemmu +2 while equipped: ' + BoT.effPower(st, pem));
}

/* 3) สวมใบอื่นไม่ได้ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const other = put(st, 'A.magic', 'SD01-016');
  const fx = apply(st, { type: 'attach', k: other, to: pem, by: 'A', seed: 1 });
  ok(!!fx.deny, 'non-weapon attach denied: ' + fx.deny);
  ok(!st.inst[other].attachedTo, 'water not attached');
}

/* 4) สั่งใช้: ต้องมีคู่หู (Link) ก่อนถึงจะสั่งใช้ค้นอาวุธจากเด็คมาสวมได้ + นับ Modification + เทิร์นละครั้ง */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const gun = put(st, 'A.deck', 'BT09-067');
  put(st, 'A.deck', 'SD01-003');
  // ยังไม่ Link -> ต้องถูก deny
  let fx = apply(st, { type: 'activateAbility', k: pem, by: 'A', seed: 2 });
  ok(!!fx.deny, 'activate without link denied: ' + fx.deny);

  // จับ Link กับสไปรท์
  const spr = put(st, 'A.avatar', 'BT09-009');
  apply(st, { type: 'pair', k: pem, to: spr, by: 'A', seed: 2 });

  // Link แล้ว -> สั่งใช้สำเร็จ
  fx = apply(st, { type: 'activateAbility', k: pem, by: 'A', seed: 2 });
  if (fx.deny) fail('activate deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'pickAttachHost', 'prompt pick weapon from deck: ' + JSON.stringify(pr && { dest: pr.dest, from: pr.from }));
  fx = apply(st, { type: 'chooseTarget', k: gun, by: 'A', seed: 3 });
  if (fx.deny) fail('pick gun deny: ' + fx.deny);
  ok(st.inst[gun].attachedTo === pem, 'activated attach to self');
  ok(zone(st, gun) === 'A.magic', 'gun moved to magic zone');
  ok(BoT.effPower(st, pem) === 4, 'power +2 after activated attach');
  ok(!!(st.magicUsed && st.magicUsed.A && st.magicUsed.A.Modification), 'counts as Modification used');
  fx = apply(st, { type: 'activateAbility', k: pem, by: 'A', seed: 4 });
  ok(!!fx.deny, 'second activate same turn denied: ' + fx.deny);
}

/* 5) จับคู่หูเพมมุ ↔ สไปรท์ ได้ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const spr = put(st, 'A.avatar', 'BT09-009');
  const fx = apply(st, { type: 'pair', k: pem, to: spr, by: 'A', seed: 5 });
  if (fx.deny) fail('pair deny: ' + fx.deny);
  ok(st.inst[pem].pairWith === spr && st.inst[spr].pairWith === pem, 'linked pair');
}

/* 6) สไปรท์มีโล่มนุษย์ / ลูกฮึด / สามัคคี */
{
  const st = emptyState();
  const spr = put(st, 'A.avatar', 'BT09-009');
  ok(BoT.hasKw(st, spr, 'โล่มนุษย์'), 'sprite human shield');
  ok(BoT.hasKw(st, spr, 'ลูกฮึด'), 'sprite stubborn');
  ok(BoT.hasKw(st, spr, 'สามัคคี'), 'sprite unity');
}

/* 7) End Phase มีคู่หู (เพมมุ) + ถ้านอน: ตื่น + POWER +2 จน Draw Phase ถัดไปของเรา */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const pem = put(st, 'A.avatar', 'BT09-008');
  const spr = put(st, 'A.avatar', 'BT09-009', { tapped: true });
  let fx = apply(st, { type: 'endTurn', by: 'A', seed: 6 });
  if (fx.deny) fail('endTurn deny: ' + fx.deny);
  ok(!st.inst[spr].tapped, 'sprite untapped at own end with buddy');
  ok(BoT.effPower(st, spr) === 6, 'sprite +2 until next own draw: ' + BoT.effPower(st, spr));
  ok(st.active === 'B', 'opponent turn after A ends');
  ok(BoT.effPower(st, spr) === 6, 'buff lasts through opponent turn: ' + BoT.effPower(st, spr));
  fx = apply(st, { type: 'endTurn', by: 'B', seed: 7 });
  if (fx.deny) fail('opp endTurn deny: ' + fx.deny);
  ok(st.active === 'A' && st.phase === 'Draw', 'back to A draw');
  ok(BoT.effPower(st, spr) === 4, 'buff gone at next own draw: ' + BoT.effPower(st, spr));
}

/* 8) End Phase ถ้าไม่มีคู่หู (เพมมุ) — ถ้านอน จะไม่ตื่น */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const spr = put(st, 'A.avatar', 'BT09-009', { tapped: true });
  const fx = apply(st, { type: 'endTurn', by: 'A', seed: 8 });
  if (fx.deny) fail('no-buddy endTurn deny: ' + fx.deny);
  ok(st.inst[spr].tapped === true, 'sprite stays tapped without buddy');
  ok(BoT.effPower(st, spr) === 4, 'sprite no power buff without buddy: ' + BoT.effPower(st, spr));
}

/* 8b) End Phase มีคู่หู และตื่นอยู่ (ไม่นอน) — ยังคงได้รับ POWER +2 จนถึง Draw Phase ถัดไป */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'A.avatar', 'BT09-008');
  const spr = put(st, 'A.avatar', 'BT09-009', { tapped: false });
  const fx = apply(st, { type: 'endTurn', by: 'A', seed: 8 });
  if (fx.deny) fail('untapped endTurn deny: ' + fx.deny);
  ok(!st.inst[spr].tapped, 'sprite still untapped');
  ok(BoT.effPower(st, spr) === 6, 'untapped sprite still gets end-phase power +2: ' + BoT.effPower(st, spr));
}

/* 9) รีปริ้น PRMO สไปรท์ได้คู่กับเพมมุ */
{
  const st = emptyState();
  const pem = put(st, 'A.avatar', 'BT09-008');
  const spr = put(st, 'A.avatar', 'PRMO-112');
  const fx = apply(st, { type: 'pair', k: spr, to: pem, by: 'A', seed: 9 });
  if (fx.deny) fail('prmo pair deny: ' + fx.deny);
  ok(st.inst[spr].pairWith === pem, 'prmo sprite pairs with pemmu');
}

/* 10) เจ้าหญิงรวงข้าว: ในเทิร์นเรา เพมมุ/สไปรท์ ที่ Link แล้ว POWER +2 */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  put(st, 'A.avatar', 'BT09-011');
  const pem = put(st, 'A.avatar', 'BT09-008');
  ok(BoT.effPower(st, pem) === 2, 'pemmu not linked without sprite: ' + BoT.effPower(st, pem));
  const spr = put(st, 'A.avatar', 'BT09-009');
  ok(BoT.effPower(st, pem) === 4, 'pemmu +2 in link with sprite: ' + BoT.effPower(st, pem));
  ok(BoT.effPower(st, spr) === 6, 'sprite +2 in link with pemmu: ' + BoT.effPower(st, spr));
  st.active = 'B';
  ok(BoT.effPower(st, pem) === 2, 'princess aura off on opp turn: ' + BoT.effPower(st, pem));
}

console.log('ALL PASS');
