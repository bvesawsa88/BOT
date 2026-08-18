/* focused: บังคับเป้าโจมตี / ห้ามโจมตี / สามัคคี — จอมเวทย์ เดสสึหวา / โลกิ */
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
    skipLethalPlead: true
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
function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 12) {
    const chooser = st.prompts[0].chooser;
    const fx = apply(st, { type: 'reactNo', by: chooser, seed: (seed || 1) + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
function padDecks(st) {
  put(st, 'A.deck', 'SD01-006');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
}

/* 1) ศัตรูต้องโจมตีเดสสึหวา */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  const des = put(st, 'A.avatar', 'BT10-026');
  const other = put(st, 'A.avatar', 'SD01-003');
  const atk = put(st, 'B.avatar', 'SD01-002');
  padDecks(st);
  let fx = apply(st, { type: 'declareAttack', atk, def: other, by: 'B', seed: 2 });
  ok(!!fx.deny, 'must attack desuwa: ' + fx.deny);
  fx = apply(st, { type: 'declareAttack', atk, def: des, by: 'B', seed: 3 });
  if (fx.deny) fail('attack desuwa deny: ' + fx.deny);
  ok(!!st.pending || !!st.inst[atk].tapped, 'attack desuwa allowed');
}

/* 2) ถูกโจมตีเทิร์นละครั้ง: จั่ว 1 ครั้งเดียว */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  const des = put(st, 'A.avatar', 'BT10-026');
  const atk1 = put(st, 'B.avatar', 'SD01-006');
  const atk2 = put(st, 'B.avatar', 'SD01-003');
  padDecks(st);
  const hand0 = (st.zones['A.hand'] || []).length;
  let fx = apply(st, { type: 'declareAttack', atk: atk1, def: des, by: 'B', seed: 4 });
  if (fx.deny) fail('atk1 deny: ' + fx.deny);
  drainReact(st, 5);
  ok((st.zones['A.hand'] || []).length === hand0 + 1, 'draw 1 when attacked');
  st.pending = null;
  fx = apply(st, { type: 'declareAttack', atk: atk2, def: des, by: 'B', seed: 6 });
  if (fx.deny) fail('atk2 deny: ' + fx.deny);
  drainReact(st, 7);
  ok((st.zones['A.hand'] || []).length === hand0 + 1, 'no second draw same turn');
}

/* 3) จุติ: ทิ้งคาถา แล้วจั่ว 2 — ใบอื่นในมือเลือกทิ้งไม่ได้ */
{
  const st = emptyState();
  const des = put(st, 'A.hand', 'BT10-026');
  const pay = put(st, 'A.hand', 'SD03-011');
  const spell = put(st, 'A.hand', 'BT07-051');
  const junk = put(st, 'A.hand', 'SD01-006');
  padDecks(st);
  let fx = apply(st, { type: 'summon', k: des, to: 'A.avatar', payIds: [pay], by: 'A', seed: 10 });
  if (fx.deny) fail('summon desuwa deny: ' + fx.deny);
  drainReact(st, 11);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDiscard', 'juti discard prompt: ' + (pr && pr.kind));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(spell) && !cands.includes(junk), 'discard only คาถา/จอมเวทย์');
  const handBeforeDraw = (st.zones['A.hand'] || []).length;
  fx = apply(st, { type: 'chooseTarget', k: spell, by: 'A', seed: 12 });
  if (fx.deny) fail('juti discard deny: ' + fx.deny);
  drainReact(st, 13);
  ok((st.zones['A.hand'] || []).length === handBeforeDraw - 1 + 2, 'drew 2 after juti discard');
}

/* 4) เวทที่ไม่มีคำว่าคาถา ไม่เปิดบัฟจอมเวทย์ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT10-026');
  put(st, 'A.avatar', 'SD01-003');
  const otherMag = put(st, 'A.hand', 'BT07-055');
  padDecks(st);
  const fx = apply(st, { type: 'playMagic', k: otherMag, by: 'A', seed: 20 });
  if (fx.deny) fail('play other magic deny: ' + fx.deny);
  drainReact(st, 21);
  ok(!(st.prompts || []).some(p => p.kind === 'chooseBuff'), 'non-คาถา no buff prompt');
}

/* 5) ใช้ Magic คาถา → เลือกจอมเวทย์ POWER +1 */
{
  const st = emptyState();
  const des = put(st, 'A.avatar', 'BT10-026');
  const indra = put(st, 'A.avatar', 'SD01-003');
  const spell = put(st, 'A.hand', 'BT07-051');
  padDecks(st);
  let fx = apply(st, { type: 'playMagic', k: spell, by: 'A', seed: 22 });
  if (fx.deny) fail('play คาถา deny: ' + fx.deny);
  drainReact(st, 23);
  const buffPr = (st.prompts || []).find(p => p.kind === 'chooseBuff') || (st.prompts || [])[0];
  ok(buffPr && buffPr.kind === 'chooseBuff', 'คาถา opens chooseBuff: ' + (buffPr && buffPr.kind));
  const buffCands = BoT.promptCandidates(st, buffPr);
  ok(buffCands.includes(des) && !buffCands.includes(indra), 'buff only จอมเวทย์');
  const p0 = BoT.effPower(st, des);
  fx = apply(st, { type: 'chooseTarget', k: des, by: 'A', seed: 24 });
  if (fx.deny) fail('chooseBuff deny: ' + fx.deny);
  ok(BoT.effPower(st, des) === p0 + 1, 'desuwa +1 after คาถา');
}

/* 5) โลกิโจมตีไม่ได้ + มีสามัคคี */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  const loki = put(st, 'A.avatar', 'BT09-025');
  const fod = put(st, 'B.avatar', 'SD01-003');
  padDecks(st);
  ok(BoT.hasKw(st, loki, 'สามัคคี'), 'loki has unity keyword');
  const fx = apply(st, { type: 'declareAttack', atk: loki, def: fod, by: 'A', seed: 30 });
  ok(!!fx.deny, 'loki cannot attack: ' + fx.deny);
}

/* 6) สามัคคีได้เฉพาะธอร์ */
{
  const st = emptyState();
  const loki = put(st, 'A.avatar', 'BT09-025');
  const thor = put(st, 'A.avatar', 'BT09-024');
  const indra = put(st, 'A.avatar', 'SD01-003');
  padDecks(st);
  let fx = apply(st, { type: 'unity', k: loki, to: indra, by: 'A', seed: 31 });
  ok(!!fx.deny, 'unity only thor: ' + fx.deny);
  fx = apply(st, { type: 'activateAbility', k: loki, by: 'A', seed: 31.5 });
  if (fx.deny) fail('loki buff before unity deny: ' + fx.deny);
  drainReact(st, 31);
  const thorP = BoT.effPower(st, thor);
  const lokiP = BoT.effPower(st, loki);
  fx = apply(st, { type: 'unity', k: loki, to: thor, by: 'A', seed: 32 });
  if (fx.deny) fail('unity to thor deny: ' + fx.deny);
  ok(!!st.inst[loki].tapped, 'loki tapped after unity');
  ok(BoT.effPower(st, thor) === thorP + lokiP, 'thor gained unity power ' + BoT.effPower(st, thor));
}

/* 7) สั่งใช้: +1 และ +1 ต่อนรกทุก 5 ใบ */
{
  const st = emptyState();
  const loki = put(st, 'A.avatar', 'BT09-025');
  padDecks(st);
  ok(BoT.effPower(st, loki) === 0, 'loki printed 0');
  let fx = apply(st, { type: 'activateAbility', k: loki, by: 'A', seed: 40 });
  if (fx.deny) fail('loki activate empty hell deny: ' + fx.deny);
  drainReact(st, 41);
  ok(BoT.effPower(st, loki) === 1, 'loki +1 with empty hell: ' + BoT.effPower(st, loki));

  const st2 = emptyState();
  const loki2 = put(st2, 'A.avatar', 'BT09-025');
  for (let i = 0; i < 10; i++) put(st2, 'A.hell', 'SD01-006');
  padDecks(st2);
  fx = apply(st2, { type: 'activateAbility', k: loki2, by: 'A', seed: 42 });
  if (fx.deny) fail('loki activate 10 hell deny: ' + fx.deny);
  drainReact(st2, 43);
  ok(BoT.effPower(st2, loki2) === 3, 'loki +1 +2 from 10 hell: ' + BoT.effPower(st2, loki2));
}

console.log('ALL PASS desuwa+loki');
