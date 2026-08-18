/* focused: คลื่น 0 FPRO-004 พระอิศวร + FPRO-006 ทศกัณฐ์ */
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
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    gems: { A: 10, B: 10 }
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
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

/* 1) พระอิศวร: จุติ + สั่งใช้ ทำลายการ์ดบนสนาม */
{
  const st = emptyState();
  padDecks(st);
  const isuan = put(st, 'A.hand', 'FPRO-004');
  const p1 = put(st, 'A.hand', 'SD01-005');
  const p2 = put(st, 'A.hand', 'SD01-006');
  const fodder = put(st, 'B.avatar', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: isuan, to: 'A.avatar', payIds: [p1, p2], by: 'A', seed: 1 });
  ok(!fx.deny, 'isuan summon: ' + (fx.deny || ''));
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'juti chooseDestroy: ' + (pr && pr.kind));
  fx = apply(st, { type: 'chooseTarget', k: fodder, by: 'A', seed: 2 });
  if (fx.deny) fail('juti destroy deny: ' + fx.deny);
  ok(BoT.zoneOf(st, fodder) === 'B.hell', 'juti destroyed fodder');
  const fodder2 = put(st, 'B.avatar', 'SD01-003');
  fx = apply(st, { type: 'activateAbility', k: isuan, by: 'A', seed: 3 });
  ok(!fx.deny, 'isuan activate: ' + (fx.deny || ''));
  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'activated chooseDestroy');
  fx = apply(st, { type: 'chooseTarget', k: fodder2, by: 'A', seed: 4 });
  if (fx.deny) fail('act destroy deny: ' + fx.deny);
  ok(BoT.zoneOf(st, fodder2) === 'B.hell', 'activated destroyed fodder2');
}

/* 2) ทศกัณฐ์: ทิ้งมือ 1 → อัญเชิญยักษ์ P3 ที่ไม่ใช่ทศกัณฐ์ */
{
  const st = emptyState();
  padDecks(st);
  const tossakan = put(st, 'A.avatar', 'FPRO-006');
  const disc = put(st, 'A.hand', 'SD01-011');
  const yak = put(st, 'A.deck', 'BT01-001'); // นนทก P3
  const selfName = put(st, 'A.deck', 'FPRO-006');
  const weakYak = put(st, 'A.deck', 'SD01-011'); // ยักษ์ P1
  let fx = apply(st, { type: 'activateAbility', k: tossakan, by: 'A', seed: 10 });
  ok(!fx.deny, 'tossakan activate: ' + (fx.deny || ''));
  const dpr = (st.prompts || [])[0];
  ok(dpr && dpr.kind === 'chooseDiscard', 'discard cost prompt: ' + (dpr && dpr.kind));
  fx = apply(st, { type: 'chooseTarget', k: disc, by: 'A', seed: 11 });
  if (fx.deny) fail('discard deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick', 'deckPick after discard');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(yak), 'can pick นนทก P3');
  ok(!cands.includes(selfName), 'cannot pick ทศกัณฐ์');
  ok(!cands.includes(weakYak), 'cannot pick ยักษ์ P1');
  fx = apply(st, { type: 'chooseTarget', k: yak, by: 'A', seed: 12 });
  if (fx.deny) fail('summon yak deny: ' + fx.deny);
  ok(BoT.zoneOf(st, yak) === 'A.avatar', 'นนทก on field');
}

/* 3) พี่หน่วง: จุติค้นยาน · ขโมย Avatar คีย์เวิร์ดไป Magic · คำสั่งเสียคืนมือเจ้าของ */
{
  const st = emptyState();
  padDecks(st);
  const host = put(st, 'A.hand', 'FPRO-003');
  const pay = put(st, 'A.hand', 'SD03-005'); // ม่วง GEM 4
  const van = put(st, 'A.hell', 'BT07-072');
  let fx = apply(st, { type: 'summon', k: host, to: 'A.avatar', payIds: [pay], by: 'A', seed: 30 });
  ok(!fx.deny, 'nuang summon: ' + (fx.deny || ''));
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick', 'juti deckOrHell pick');
  fx = apply(st, { type: 'chooseTarget', k: van, by: 'A', seed: 31 });
  if (fx.deny) fail('pick van deny: ' + fx.deny);
  ok(BoT.zoneOf(st, van) === 'A.hand', 'van to hand from hell');
}
{
  const st = emptyState();
  padDecks(st);
  const host = put(st, 'A.avatar', 'FPRO-003');
  put(st, 'A.construct', 'BT07-072');
  const disc = put(st, 'A.hand', 'SD01-011');
  const steal = put(st, 'B.avatar', 'SD06-002'); // เตะไข่
  const plain = put(st, 'B.avatar', 'SD01-003');
  let fx = apply(st, { type: 'activateAbility', k: host, by: 'A', seed: 40 });
  ok(!fx.deny, 'nuang steal activate: ' + (fx.deny || ''));
  fx = apply(st, { type: 'chooseTarget', k: disc, by: 'A', seed: 41 });
  if (fx.deny) fail('nuang discard deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'magic', 'steal to magic prompt');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(steal), 'can steal เตะไข่');
  ok(!cands.includes(plain), 'cannot steal plain avatar');
  fx = apply(st, { type: 'chooseTarget', k: steal, by: 'A', seed: 42 });
  if (fx.deny) fail('steal deny: ' + fx.deny);
  ok(BoT.zoneOf(st, steal) === 'A.magic', 'stolen on our magic');
  fx = apply(st, { type: 'move', k: host, to: 'A.hell', by: 'A', seed: 43 });
  if (fx.deny) fail('destroy nuang deny: ' + fx.deny);
  const will = (st.prompts || [])[0];
  ok(will && will.kind === 'pick' && will.chooser === 'B' && will.dest === 'bounceHand',
    'last will opp bounce: ' + JSON.stringify(will && { kind: will.kind, chooser: will.chooser, dest: will.dest }));
  fx = apply(st, { type: 'chooseTarget', k: steal, by: 'B', seed: 44 });
  if (fx.deny) fail('bounce deny: ' + fx.deny);
  ok(BoT.zoneOf(st, steal) === 'B.hand', 'returned to original owner hand');
}

console.log('wave0 fpro 003/004/006: all passed');
