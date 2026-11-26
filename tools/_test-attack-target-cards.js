/* focused: การ์ดที่ทำงานตอนถูกเลือกเป็นเป้าโจมตี
   - BT07-060 คาถา สตอปปุ: จอมเวทย์ฝ่ายเราถูกโจมตี → นำ "คาถา" จากนรกกลับใต้ Deck → ยกเลิกการโจมตี
   - ODY1-064 โอเดนย่า อร่อยมัก: "ทาโกะ" ฝ่ายเราถูกโจมตี → ใบนั้น POWER +2 จนจบเทิร์น
   - BT10-022 เดออง อัศวินเฟมบอย: ถูกโจมตี → ผู้โจมตี POWER -2
   - BT06-005 รีวิวแมน: สวม Modification ได้โดยไม่สนเงื่อนไขการสวมใส่ของ Mod */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  return {
    inst: {}, zones,
    phase: 'Battle', active: 'B', turn: 4, turnSeq: 4,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    pendingLethal: null, oncePerGame: {}, gems: { A: 10, B: 10 },
    attacksThisTurn: { A: 0, B: 0 }, skipLethalPlead: true
  };
}
function put(st, zone, code, extra) {
  const c = byCode(code);
  if (!c) throw new Error('missing ' + code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    img: '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone].push(k);
  return k;
}
function padDecks(st) { for (let i = 0; i < 6; i++) { put(st, 'A.deck', 'SD01-011'); put(st, 'B.deck', 'SD01-011'); } }
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
const apply = (st, a) => BoT.applyAction(st, a);
const zone = (st, k) => BoT.zoneOf(st, k);
const reactTop = st => (st.prompts || [])[0] && st.prompts[0].kind === 'react' ? st.prompts[0] : null;
/** ปิดหน้าต่าง React ที่ไม่ใช่ของ `keepFor` จนกว่าจะถึงหน้าต่างของ keepFor (หรือไม่มี) */
function skipReactsExcept(st, keepFor, seed) {
  let n = 0;
  while (reactTop(st) && reactTop(st).chooser !== keepFor && n++ < 12) {
    const fx = apply(st, { type: 'reactNo', by: reactTop(st).chooser, seed: seed + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
function skipAllReacts(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].kind === 'react' || st.prompts[0].magicNegate) && n++ < 12) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
/** B โจมตี def → A ได้หน้าต่าง React → A เล่นการ์ด k (คืน fx ของการเล่น) */
function attackAndPlay(st, atk, def, card, seed) {
  let fx = apply(st, { type: 'declareAttack', atk, def, by: 'B', seed });
  if (fx.deny) fail('declare deny: ' + fx.deny);
  skipReactsExcept(st, 'A', seed + 1);
  const win = reactTop(st);
  if (!win) return { deny: 'no React window for A' };
  // หน้าต่าง React ต้องไม่เสนอใบที่ใช้ไม่ได้
  if (!(win.options || []).includes(card)) return { deny: 'not offered in React window' };
  return apply(st, { type: 'chooseTarget', k: card, by: 'A', seed: seed + 20 });
}

/* 1) คาถา สตอปปุ: จอมเวทย์ถูกโจมตี → จ่ายคาถาใต้ Deck → ยกเลิกการโจมตี */
{
  const st = emptyState(); padDecks(st);
  const mage = put(st, 'A.avatar', 'BT07-029');
  const katha = put(st, 'A.hell', 'BT07-051');
  const stop = put(st, 'A.hand', 'BT07-060');
  const atk = put(st, 'B.avatar', 'SD01-002');
  let fx = attackAndPlay(st, atk, mage, stop, 10);
  if (fx.deny) fail('stoppu play deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'exileHellCost' && pr.costTo === 'deckBottom', 'pick คาถา to deck bottom: ' + JSON.stringify(pr && { dest: pr.dest, costTo: pr.costTo }));
  fx = apply(st, { type: 'chooseTarget', k: katha, by: 'A', seed: 40 });
  if (fx.deny) fail('pay katha deny: ' + fx.deny);
  skipAllReacts(st, 41);
  ok(st.zones['A.deck'][0] === katha, 'คาถา at bottom of deck: ' + zone(st, katha));
  ok(!st.pending, 'attack cancelled');
  ok(zone(st, mage) === 'A.avatar', 'mage survives');
  ok(zone(st, stop) === 'A.hell', 'stoppu to hell: ' + zone(st, stop));
}

/* 2) คาถา สตอปปุ: ไม่ใช่จอมเวทย์ถูกโจมตี → ใช้ไม่ได้ */
{
  const st = emptyState(); padDecks(st);
  put(st, 'A.avatar', 'BT07-029');
  const other = put(st, 'A.avatar', 'SD01-011');
  put(st, 'A.hell', 'BT07-051');
  const stop = put(st, 'A.hand', 'BT07-060');
  const atk = put(st, 'B.avatar', 'SD01-002');
  const fx = attackAndPlay(st, atk, other, stop, 50);
  ok(!!fx.deny && zone(st, stop) === 'A.hand', 'non-mage target denied: ' + fx.deny);
}

/* 3) คาถา สตอปปุ: ไม่มี "คาถา" ในนรก → ใช้ไม่ได้ */
{
  const st = emptyState(); padDecks(st);
  const mage = put(st, 'A.avatar', 'BT07-029');
  const stop = put(st, 'A.hand', 'BT07-060');
  const atk = put(st, 'B.avatar', 'SD01-002');
  const fx = attackAndPlay(st, atk, mage, stop, 60);
  ok(!!fx.deny && zone(st, stop) === 'A.hand', 'no คาถา in hell denied: ' + fx.deny);
}

/* 4) โอเดนย่า อร่อยมัก: ทาโกะถูกโจมตี → POWER +2 จนจบเทิร์น */
{
  const st = emptyState(); padDecks(st);
  const tako = put(st, 'A.avatar', 'ODY1-002'); // P2
  const oden = put(st, 'A.hand', 'ODY1-064');
  const atk = put(st, 'B.avatar', 'SD01-002');
  const before = BoT.effPower(st, tako);
  const fx = attackAndPlay(st, atk, tako, oden, 70);
  if (fx.deny) fail('oden play deny: ' + fx.deny);
  skipAllReacts(st, 90);
  ok(BoT.effPower(st, tako) === before + 2, `tako POWER ${before} → ${BoT.effPower(st, tako)}`);
}

/* 5) โอเดนย่า อร่อยมัก: ไม่ใช่ทาโกะ → ใช้ไม่ได้ */
{
  const st = emptyState(); padDecks(st);
  put(st, 'A.avatar', 'ODY1-002');
  const other = put(st, 'A.avatar', 'SD01-011');
  const oden = put(st, 'A.hand', 'ODY1-064');
  const atk = put(st, 'B.avatar', 'SD01-002');
  const fx = attackAndPlay(st, atk, other, oden, 100);
  ok(!!fx.deny && zone(st, oden) === 'A.hand', 'non-tako target denied: ' + fx.deny);
}

/* 6) เดออง: ถูกโจมตี → ผู้โจมตี POWER -2 */
{
  const st = emptyState(); padDecks(st);
  const deong = put(st, 'A.avatar', 'BT10-022');
  const atk = put(st, 'B.avatar', 'SD01-002');
  const before = BoT.effPower(st, atk); // พระนารายณ์ P4 · โจมตี → +2 ของตัวเอง
  const fx = apply(st, { type: 'declareAttack', atk, def: deong, by: 'B', seed: 110 });
  if (fx.deny) fail('deong declare deny: ' + fx.deny);
  ok(fx.announce && fx.announce.pa === before + 2 - 2, `attacker POWER at declare ${fx.announce && fx.announce.pa} (base ${before} +2 own −2 เดออง)`);
  ok(st.log.some(l => /POWER -2/.test(l.t) && /เดออง/.test(l.t)), 'log shows เดออง −2');
  skipAllReacts(st, 111);
  ok(BoT.effPower(st, atk) === before + 2, 'attacker −2 ends with combat (own +2 stays till end of turn)');
}

/* 7) รีวิวแมน: สวม Mod ที่จำกัด Symbol ได้ · Avatar ปกติสวมไม่ได้ */
{
  const st = emptyState();
  const review = put(st, 'A.avatar', 'BT06-005');
  const plain = put(st, 'A.avatar', 'SD01-011');
  const mod = byCode('BT05-063'); // สวมได้เฉพาะ Symbol หุ่นยนต์
  ok(!!BoT.attachOnlyDeny(st, mod.code, plain, mod.name), 'plain avatar still restricted');
  ok(BoT.attachOnlyDeny(st, mod.code, review, mod.name) === null, 'รีวิวแมน ignores attach condition');
  const e = BoT.effectOf('BT06-005', 'รีวิวแมน');
  ok(!(e.abilities || []).some(ab => (ab.actions || []).some(ac => ac.op === 'cancelAttack')), 'old wrong cancelAttack removed');
}

console.log('ALL PASS');
