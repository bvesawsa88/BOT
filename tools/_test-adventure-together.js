/* focused: ผจญภัยด้วยกัน — เลือกเพมมุหรือสไปรท์จากเด็คอัญเชิญ */
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
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); }
function apply(st, a) { return BoT.applyAction(st, a); }
function zone(st, k) { return BoT.zoneOf(st, k); }
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser });
    if (fx.deny) throw new Error('FAIL: negate skip: ' + fx.deny);
  }
}
function playAdventure(st, mag) {
  const fx = apply(st, { type: 'playMagic', k: mag, by: 'A' });
  if (fx.deny) throw new Error('FAIL: playMagic: ' + fx.deny);
  skipNegate(st);
  return fx;
}

/* 1) มีเพมมุ → อัญเชิญสไปรท์จากเด็ค */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-008');
  const mag = put(st, 'A.hand', 'BT09-052');
  const spr = put(st, 'A.deck', 'BT09-009');
  const rest = put(st, 'A.deck', 'SD01-003');
  playAdventure(st, mag);
  ok(st.prompts.length && st.prompts[0].kind === 'chooseMode', 'chooseMode after play');
  const opts = st.prompts[0].options || [];
  ok(!BoT.chooseModeOptionDeny(st, mag, 'A', opts[0]), 'mode 0 ok with pemmu');
  ok(!!BoT.chooseModeOptionDeny(st, mag, 'A', opts[1]), 'mode 1 denied without sprite');
  let fx = apply(st, { type: 'chooseMode', k: mag, opt: 0, by: 'A' });
  ok(!fx.deny, 'choose mode 0: ' + (fx.deny || ''));
  const pick = (st.prompts || []).find(p => p.kind === 'pick');
  ok(pick && pick.dest === 'avatar', 'deckPick dest avatar');
  fx = apply(st, { type: 'chooseTarget', k: spr, by: 'A' });
  ok(!fx.deny, 'pick sprite: ' + (fx.deny || ''));
  ok(zone(st, spr) === 'A.avatar', 'sprite summoned from deck');
  ok(zone(st, rest) === 'A.deck', 'other deck card stays');
  ok(zone(st, mag) === 'A.hell', 'magic to hell');
}

/* 2) มีสไปรท์ → อัญเชิญเพมมุจากเด็ค — ไม่เลือกอาวุธของเพมมุ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-009');
  const mag = put(st, 'A.hand', 'BT09-052');
  const pem = put(st, 'A.deck', 'BT09-008');
  const gun = put(st, 'A.deck', 'BT09-067');
  playAdventure(st, mag);
  const opts = st.prompts[0].options || [];
  ok(!!BoT.chooseModeOptionDeny(st, mag, 'A', opts[0]), 'mode 0 denied without pemmu');
  ok(!BoT.chooseModeOptionDeny(st, mag, 'A', opts[1]), 'mode 1 ok with sprite');
  apply(st, { type: 'chooseMode', k: mag, opt: 1, by: 'A' });
  const pick = (st.prompts || []).find(p => p.kind === 'pick');
  ok(pick, 'deckPick pemmu');
  const cands = BoT.promptCandidates(st, pick);
  ok(cands.includes(pem), 'pemmu avatar is a candidate');
  ok(!cands.includes(gun), 'weapon of pemmu is not a candidate');
  apply(st, { type: 'chooseTarget', k: pem, by: 'A' });
  ok(zone(st, pem) === 'A.avatar', 'pemmu summoned');
  ok(zone(st, gun) === 'A.deck', 'weapon stays in deck');
}

/* 3) PRMO สไปรท์อัญเชิญได้ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-008');
  const mag = put(st, 'A.hand', 'BT09-052');
  const spr = put(st, 'A.deck', 'PRMO-112');
  playAdventure(st, mag);
  apply(st, { type: 'chooseMode', k: mag, opt: 0, by: 'A' });
  apply(st, { type: 'chooseTarget', k: spr, by: 'A' });
  ok(zone(st, spr) === 'A.avatar', 'prmo sprite summoned');
}

/* 4) ไม่มีเพมมุ/สไปรท์บนสนาม → ข้ามเลือกปฏิบัติได้ */
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'BT09-052');
  put(st, 'A.deck', 'BT09-008');
  put(st, 'A.deck', 'BT09-009');
  playAdventure(st, mag);
  ok(st.prompts.length && st.prompts[0].kind === 'chooseMode', 'chooseMode even if neither on field');
  const opts = st.prompts[0].options || [];
  ok(!!BoT.chooseModeOptionDeny(st, mag, 'A', opts[0]), 'mode 0 denied');
  ok(!!BoT.chooseModeOptionDeny(st, mag, 'A', opts[1]), 'mode 1 denied');
  const fx = apply(st, { type: 'skipPrompt', by: 'A' });
  ok(!fx.deny, 'skip when both modes denied: ' + (fx.deny || ''));
  ok(!(st.prompts || []).length, 'prompt cleared');
}

console.log('ALL PASS');
