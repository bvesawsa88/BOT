/* focused: พรของอิศวร — เลือกปฏิบัติ จั่วครบ 5 / ทำลาย ≤2 / นรกขึ้นมือ 2 */
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
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}
function playBless(st, mag) {
  const fx = apply(st, { type: 'playMagic', k: mag, by: 'A' });
  if (fx.deny) fail('playMagic: ' + fx.deny);
  skipNegate(st);
  return fx;
}

{
  const e = BoT.effectOf('CC01-042', 'พรของอิศวร');
  const ab = (e.abilities || []).find(a => a.trigger && a.trigger.on === 'activated');
  const mode = ab && (ab.actions || []).find(a => a.op === 'chooseMode');
  ok(mode && (mode.options || []).length === 3, '3 chooseMode options');
}

/* 1) จั่วให้มือครบ 5 (หลังเล่นเหลือ 0 → จั่ว 5) */
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'CC01-042');
  for (let i = 0; i < 8; i++) put(st, 'A.deck', 'SD01-003');
  playBless(st, mag);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseMode', 'chooseMode: ' + (pr && pr.kind));
  let fx = apply(st, { type: 'chooseMode', k: mag, opt: 0, by: 'A', seed: 1 });
  if (fx.deny) fail('mode0 deny: ' + fx.deny);
  skipNegate(st);
  ok((st.zones['A.hand'] || []).length === 5, 'hand 5: ' + (st.zones['A.hand'] || []).length);
  ok(zone(st, mag) === 'A.hell', 'spell to hell: ' + zone(st, mag));
}

/* 2) มือมี 4 หลังเล่น (เริ่ม 5 รวมเวท) → จั่ว 1 */
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'CC01-042');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'A.hand', 'SD01-003');
  put(st, 'A.hand', 'SD01-003');
  for (let i = 0; i < 4; i++) put(st, 'A.deck', 'SD01-003');
  playBless(st, mag);
  let fx = apply(st, { type: 'chooseMode', k: mag, opt: 0, by: 'A', seed: 2 });
  if (fx.deny) fail('mode0b deny: ' + fx.deny);
  ok((st.zones['A.hand'] || []).length === 5, 'hand filled from 4: ' + (st.zones['A.hand'] || []).length);
}

/* 3) ทำลาย Avatar ศัตรู 2 ใบ */
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'CC01-042');
  const a1 = put(st, 'B.avatar', 'SD01-003');
  const a2 = put(st, 'B.avatar', 'SD01-002');
  const a3 = put(st, 'B.avatar', 'BT09-011');
  playBless(st, mag);
  let fx = apply(st, { type: 'chooseMode', k: mag, opt: 1, by: 'A', seed: 3 });
  if (fx.deny) fail('mode1 deny: ' + fx.deny);
  skipNegate(st);
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'chooseDestroy: ' + (pr && pr.kind));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(a1) && cands.includes(a2) && cands.includes(a3), 'all 3 enemy avatars');
  fx = apply(st, { type: 'chooseTarget', k: a1, by: 'A', seed: 4 });
  if (fx.deny) fail('destroy1 deny: ' + fx.deny);
  ok(zone(st, a1) === 'B.hell', 'first destroyed');
  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'second destroy prompt');
  fx = apply(st, { type: 'chooseTarget', k: a2, by: 'A', seed: 5 });
  if (fx.deny) fail('destroy2 deny: ' + fx.deny);
  ok(zone(st, a2) === 'B.hell', 'second destroyed');
  ok(zone(st, a3) === 'B.avatar', 'third remains');
  ok(!(st.prompts || []).some(p => p.kind === 'chooseDestroy'), 'no third destroy');
  ok(zone(st, mag) === 'A.hell', 'spell hell after 2 destroys');
}

/* 4) นรกขึ้นมือ 2 ใบ ประเภทใดก็ได้ */
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'CC01-042');
  const h1 = put(st, 'A.hell', 'SD01-003');
  const h2 = put(st, 'A.hell', 'BT09-067');
  const h3 = put(st, 'A.hell', 'BT01-040');
  playBless(st, mag);
  let fx = apply(st, { type: 'chooseMode', k: mag, opt: 2, by: 'A', seed: 6 });
  if (fx.deny) fail('mode2 deny: ' + fx.deny);
  skipNegate(st);
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'hand' && pr.multiMax === 2,
    'hell pick multiMax 2: ' + JSON.stringify(pr && { kind: pr.kind, dest: pr.dest, multi: pr.multiMax }));
  fx = apply(st, { type: 'chooseTarget', k: h1, by: 'A', seed: 7 });
  if (fx.deny) fail('hell1 deny: ' + fx.deny);
  fx = apply(st, { type: 'chooseTarget', k: h2, by: 'A', seed: 8 });
  if (fx.deny) fail('hell2 deny: ' + fx.deny);
  ok(zone(st, h1) === 'A.hand', 'avatar from hell to hand');
  ok(zone(st, h2) === 'A.hand', 'mod from hell to hand');
  ok(zone(st, h3) === 'A.hell', 'third stays in hell');
}

console.log('ALL PASS');
