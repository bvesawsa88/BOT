/* เด็คนาค: วิรูฬ / ฉัพพยา / กัณหา / อนันต์ (POWER 7+ ตอนเริ่ม Battle Phase, ฆ่าเฉพาะตอนโจมตี) */
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
function skipWindows(st) {
  let n = 0;
  while ((st.prompts || [])[0] && n++ < 12) {
    const pr = st.prompts[0];
    if (pr.kind === 'react' || pr.magicNegate || pr.mode === 'negateMagic') {
      const fx = apply(st, { type: 'reactNo', by: pr.chooser, seed: 80 + n });
      if (fx.deny) fail('skip react: ' + fx.deny);
      continue;
    }
    break;
  }
}

function attack(st, a, seed) {
  let fx = apply(st, Object.assign({ type: 'declareAttack', by: 'A', seed }, a));
  if (fx.deny) fail('declare deny: ' + fx.deny);
  skipWindows(st);
  if (st.pending) {
    fx = apply(st, { type: 'resolveAttack', by: 'B', seed: seed + 1 });
    if (fx.deny) fail('resolve deny: ' + fx.deny);
  }
  skipWindows(st);
  return fx;
}
const faceDown = (st, ids) => ids.filter(id => !st.inst[id].faceUp).length;

/* 1) ฉัพพยา POWER 7+ ตอนเริ่ม Battle → ตี LIFE หงาย 2 ใบ */
{
  const st = emptyState();
  padDecks(st);
  const cha = put(st, 'A.avatar', 'BT06-002');
  const lifes = [put(st, 'B.life', 'BT01-052'), put(st, 'B.life', 'BT01-052'), put(st, 'B.life', 'BT01-052')];
  lifes.forEach(k => { st.inst[k].faceUp = false; });
  st.buffs.push({ k: cha, amt: 4, until: 'endOfTurn' });
  attack(st, { atk: cha, life: lifes[0] }, 10);
  ok(faceDown(st, lifes) === 1, 'chabbaya P7 → 2 LIFE revealed (facedown left ' + faceDown(st, lifes) + ')');
}
/* 1b) ฉัพพยา POWER ต่ำกว่า 7 → หงายใบเดียว */
{
  const st = emptyState();
  padDecks(st);
  const cha = put(st, 'A.avatar', 'BT06-002');
  const lifes = [put(st, 'B.life', 'BT01-052'), put(st, 'B.life', 'BT01-052')];
  lifes.forEach(k => { st.inst[k].faceUp = false; });
  attack(st, { atk: cha, life: lifes[0] }, 20);
  ok(faceDown(st, lifes) === 1, 'chabbaya P3 → only 1 LIFE revealed');
}

/* 1c) ฉัพพยา P7+ ตีตอนอีกฝ่ายเหลือ LIFE คว่ำ 1 ใบ → หงายใบสุดท้าย + ความเสียหายที่ 2 จบเกม */
{
  const st = emptyState();
  padDecks(st);
  const cha = put(st, 'A.avatar', 'BT06-002');
  st.buffs.push({ k: cha, amt: 4, until: 'endOfTurn' });
  const up = put(st, 'B.life', 'BT01-052');
  const last = put(st, 'B.life', 'BT01-052');
  st.inst[up].faceUp = true;
  st.inst[last].faceUp = false;
  attack(st, { atk: cha, life: last }, 25);
  ok(st.inst[last].faceUp, 'chabbaya: last LIFE revealed');
  ok(st.over && st.over.winner === 'A', 'chabbaya: 2nd damage on critical → A wins');
}
/* 1d) ฉัพพยา P7+ อีกฝ่ายเหลือคว่ำ 2 ใบ → หงายครบ เข้าสาหัส ยังไม่จบเกม */
{
  const st = emptyState();
  padDecks(st);
  const cha = put(st, 'A.avatar', 'BT06-002');
  st.buffs.push({ k: cha, amt: 4, until: 'endOfTurn' });
  const lifes = [put(st, 'B.life', 'BT01-052'), put(st, 'B.life', 'BT01-052')];
  lifes.forEach(k => { st.inst[k].faceUp = false; });
  attack(st, { atk: cha, life: lifes[0] }, 27);
  ok(faceDown(st, lifes) === 0 && !st.over, 'chabbaya: 2 facedown → critical, game continues');
}

/* 2) วิรูฬ POWER 7+ → LIFE ที่หงายความสามารถไม่ทำงาน · ต่ำกว่า 7 ทำงานปกติ */
function viroonCase(boost) {
  const st = emptyState();
  padDecks(st);
  const vi = put(st, 'A.avatar', 'BT06-001');
  if (boost) st.buffs.push({ k: vi, amt: 3, until: 'endOfTurn' });
  const life = put(st, 'B.life', 'BT01-052');
  st.inst[life].faceUp = false;
  const sched0 = st.scheduled.length;
  attack(st, { atk: vi, life }, 30);
  ok(st.inst[life].faceUp, 'viroon revealed LIFE');
  return st.scheduled.length - sched0;
}
ok(BoT.effectOf('BT01-052').abilities.length > 0, 'test LIFE card has ability');
ok(viroonCase(true) === 0, 'viroon P7: LIFE ability suppressed');
ok(viroonCase(false) > 0, 'viroon P4: LIFE ability works');

/* 3) อนันต์ ถูกโจมตีแล้วฆ่าผู้โจมตี → ไม่หงาย LIFE (ต้องเป็นฝ่ายโจมตี) */
{
  const st = emptyState({ active: 'B' });
  padDecks(st);
  const king = put(st, 'A.avatar', 'BT06-004');
  const weak = put(st, 'B.avatar', 'SD01-011');
  const life = put(st, 'B.life', 'BT01-052');
  st.inst[life].faceUp = false;
  let fx = apply(st, { type: 'declareAttack', atk: weak, def: king, by: 'B', seed: 40 });
  if (fx.deny) fail('B declare deny: ' + fx.deny);
  for (let i = 0; i < 10 && (st.prompts[0] || st.pending); i++) {
    const pr = st.prompts[0];
    if (pr) { apply(st, { type: 'reactNo', by: pr.chooser, seed: 41 + i }); continue; }
    fx = apply(st, { type: 'resolveAttack', by: 'A', seed: 60 + i });
    if (fx.deny) fail('resolve deny: ' + fx.deny);
  }
  ok(BoT.zoneOf(st, weak) === 'B.hell', 'attacker destroyed by ananta');
  ok(!st.inst[life].faceUp, 'ananta defending: no LIFE reveal');
}

/* 4) กัณหา POWER 7+ ฆ่าจากการโจมตี → อัญเชิญนาค Cost 3 จาก Deck + ได้ความสามารถของใบนั้นทันที */
{
  const st = emptyState();
  padDecks(st);
  const kan = put(st, 'A.avatar', 'BT09-005');
  st.buffs.push({ k: kan, amt: 3, until: 'endOfTurn' });
  const cha = put(st, 'A.deck', 'BT06-002');
  put(st, 'A.deck', 'BT06-004'); // Cost 6 — เลือกไม่ได้
  const weak = put(st, 'B.avatar', 'SD01-011');
  attack(st, { atk: kan, def: weak }, 70);
  ok(BoT.zoneOf(st, weak) === 'B.hell', 'kanha destroyed target');
  const pr = st.prompts[0];
  ok(pr && pr.dest === 'avatar', 'kanha deck summon prompt (' + (pr && pr.dest) + ')');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.length === 1 && cands[0] === cha, 'only cost-3 naga selectable');
  const fx = apply(st, { type: 'chooseTarget', k: cha, by: 'A', seed: 80 });
  if (fx.deny) fail('pick deny: ' + fx.deny);
  ok(BoT.zoneOf(st, cha) === 'A.avatar', 'chabbaya summoned from deck');
  ok(st.inst[cha].extraLifeHitsUntilEOT === 2, 'chabbaya auto fired without POWER check');
}
/* 4b) กัณหา POWER ต่ำกว่า 7 → ไม่อัญเชิญ */
{
  const st = emptyState();
  padDecks(st);
  const kan = put(st, 'A.avatar', 'BT09-005');
  put(st, 'A.deck', 'BT06-002');
  const weak = put(st, 'B.avatar', 'SD01-011');
  attack(st, { atk: kan, def: weak }, 90);
  ok(!(st.prompts[0] && st.prompts[0].dest === 'avatar'), 'kanha P4: no deck summon');
}

/* 4c) กัณหา POWER 7+ แต่สนามเต็ม → ไม่เปิดให้เลือก และใบในเด็คไม่ขึ้นมือ */
{
  const st = emptyState();
  padDecks(st);
  const kan = put(st, 'A.avatar', 'BT09-005');
  st.buffs.push({ k: kan, amt: 3, until: 'endOfTurn' });
  ['SD01-011', 'SD01-011', 'SD01-011'].forEach(c => put(st, 'A.avatar', c));
  const cha = put(st, 'A.deck', 'BT06-002');
  const weak = put(st, 'B.avatar', 'SD01-011');
  attack(st, { atk: kan, def: weak }, 100);
  ok(BoT.zoneOf(st, weak) === 'B.hell', 'kanha full field: target destroyed');
  ok(!(st.prompts[0] && st.prompts[0].dest === 'avatar'), 'kanha full field: no summon prompt');
  ok(BoT.zoneOf(st, cha) === 'A.deck', 'kanha full field: naga stays in deck');
}

/* 4d) กัณหา + หน้าต่างหมอมาแล้ว: ไม่ใช้ / หมดเวลา / ข้าม / ใช้แล้วถูกขัด → ยังอัญเชิญได้ · ใช้แล้วไม่ถูกขัด → ไม่อัญเชิญ */
function kanhaDoc(label, opts) {
  const st = emptyState();
  padDecks(st);
  const kan = put(st, 'A.avatar', 'BT09-005');
  st.buffs.push({ k: kan, amt: 3, until: 'endOfTurn' });
  put(st, 'A.deck', 'BT06-002');
  const weak = put(st, 'B.avatar', 'SD01-011');
  const doc = put(st, opts.docSide + '.hand', 'BT01-040');
  const neg = opts.negate ? put(st, 'A.hand', opts.negate) : null;
  let fx = apply(st, { type: 'declareAttack', atk: kan, def: weak, by: 'A', seed: 110 });
  if (fx.deny) fail(label + ' declare: ' + fx.deny);
  for (let i = 0; i < 20; i++) {
    const pr = st.prompts[0];
    if (pr) {
      if (pr.dest === 'avatar') break;
      let act = { type: opts.decline || 'reactNo', by: pr.chooser, seed: 120 + i };
      if (opts.use && pr.mode === 'preventDestroy') act = { type: 'reactYes', k: doc, by: pr.chooser, seed: 120 + i };
      else if (neg && pr.chooser === 'A' && (pr.options || []).includes(neg)) act = { type: 'reactYes', k: neg, by: 'A', seed: 120 + i };
      else if (pr.kind === 'react' && act.type !== 'reactTimeout' && act.type !== 'skipPrompt') act.type = 'reactNo';
      fx = apply(st, act);
      if (fx.deny) fail(label + ' prompt: ' + fx.deny);
      continue;
    }
    if (st.pending) { fx = apply(st, { type: 'resolveAttack', by: 'B', seed: 150 + i }); if (fx.deny) fail(label + ' resolve: ' + fx.deny); continue; }
    break;
  }
  const pr = st.prompts[0];
  const summoned = !!(pr && pr.dest === 'avatar');
  ok(summoned === opts.expect, label + ': summon prompt ' + summoned);
  ok((BoT.zoneOf(st, weak) === 'B.hell') === opts.expect, label + ': target destroyed ' + (BoT.zoneOf(st, weak) === 'B.hell'));
}
kanhaDoc('doc B not used', { docSide: 'B', expect: true });
kanhaDoc('doc B timeout', { docSide: 'B', decline: 'reactTimeout', expect: true });
kanhaDoc('doc B skip', { docSide: 'B', decline: 'skipPrompt', expect: true });
kanhaDoc('doc held by attacker, not used', { docSide: 'A', expect: true });
kanhaDoc('doc used, negated by BT01-041', { docSide: 'B', use: true, negate: 'BT01-041', expect: true });
kanhaDoc('doc used, negated by BT05-058', { docSide: 'B', use: true, negate: 'BT05-058', expect: true });
kanhaDoc('doc used, not negated', { docSide: 'B', use: true, expect: false });

console.log('naga deck: all passed');
