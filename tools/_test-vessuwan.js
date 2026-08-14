/* focused: ท้าวเวสสุวรรณ (BT09-041) — ยักษ์ถูกศัตรูต่อสู้ทำลาย → สั่งใช้จากมือ → ทำลายศัตรู */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) {
  return cards.find(c => c.code === code);
}
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones,
    phase: 'Battle', active: 'B', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
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

function attackUntilResolved(st, atk, def, by, seed) {
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk, def, by, seed });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  let guard = 0;
  while (st.pending && guard++ < 8) {
    const pr = (st.prompts || [])[0];
    if (pr && pr.kind === 'react' && pr.chooser !== by) {
      fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: seed + guard });
      if (fx.deny) fail('reactNo deny: ' + fx.deny);
      continue;
    }
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: st.pending.target, seed: seed + 20 + guard });
    if (fx.deny) fail('resolveAttack deny: ' + fx.deny);
  }
  return fx;
}

function promptKinds(st) {
  return (st.prompts || []).map(p => p.kind + (p.reactTrigger ? ':' + p.reactTrigger : '') + (p.avatarHandAbility ? ':hand' : ''));
}

/* 1) ยักษ์ถูกศัตรูต่อสู้ทำลาย → หน้าต่างสั่งใช้จากมือ → อัญเชิญ → เลือกทำลายศัตรู */
{
  const st = emptyState();
  const giant = put(st, 'A.avatar', 'SD01-011'); // ยักษ์ล้างส้วม P1
  const ves = put(st, 'A.hand', 'BT09-041');     // ท้าวเวสสุวรรณ
  const enemy = put(st, 'B.avatar', 'SD01-002'); // พระนารายณ์ P4
  st.inst[enemy].power = 4;

  attackUntilResolved(st, enemy, giant, 'B', 1);
  ok(BoT.zoneOf(st, giant) === 'A.hell' || !st.zones['A.avatar'].includes(giant), 'giant sent to hell');

  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.avatarHandAbility && pr.reactTrigger === 'ownAvatarDestroyedByOpp',
    'hand summon window after opp combat destroy: ' + promptKinds(st).join(','));
  ok(pr.options && pr.options.includes(ves), 'window includes ท้าวเวสสุวรรณ');

  let fx = BoT.applyAction(st, { type: 'chooseTarget', k: ves, by: 'A', seed: 3 });
  if (fx.deny) fail('choose hand summon deny: ' + fx.deny);
  ok(BoT.zoneOf(st, ves) === 'A.avatar', 'summoned from hand to Avatar Zone: ' + BoT.zoneOf(st, ves));

  const pr2 = (st.prompts || [])[0];
  ok(pr2 && pr2.kind === 'chooseDestroy' && pr2.optional && pr2.side === 'enemy',
    'auto destroy offer after self-summon: ' + promptKinds(st).join(','));
  const cands = BoT.promptCandidates(st, pr2);
  ok(cands.includes(enemy), 'destroy candidates include enemy avatar');

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: enemy, by: 'A', seed: 4 });
  if (fx.deny) fail('chooseDestroy deny: ' + fx.deny);
  ok(BoT.zoneOf(st, enemy) === 'B.hell' || !st.zones['B.avatar'].includes(enemy), 'enemy destroyed');

  ok(st.phase === 'Battle', 'still Battle Phase');
  const pBattle = BoT.effPower(st, ves);
  ok(pBattle === 7, 'Battle Phase ยักษ์ POWER +2 (printed 5 → ' + pBattle + ')');
  st.phase = 'Main';
  const pMain = BoT.effPower(st, ves);
  ok(pMain === 5, 'Main Phase no aura (printed 5 → ' + pMain + ')');
}

/* 2) มณโฑ (คน + extraSymbols ยักษ์) ถูกศัตรูทำลายก็เปิดหน้าต่าง */
{
  const st = emptyState();
  const monto = put(st, 'A.avatar', 'BT08-038');
  const ves = put(st, 'A.hand', 'BT09-041');
  const enemy = put(st, 'B.avatar', 'SD01-002');
  st.inst[enemy].power = 8;
  st.inst[monto].power = 1;

  attackUntilResolved(st, enemy, monto, 'B', 10);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.avatarHandAbility && pr.options && pr.options.includes(ves),
    'มณโฑ extraSymbols ยักษ์ also opens hand window: ' + promptKinds(st).join(','));
}

/* 3) ทำลายเอง (ไม่ใช่การ์ดศัตรู) ไม่เปิดหน้าต่าง */
{
  const st = emptyState();
  st.active = 'A';
  st.phase = 'Main';
  const giant = put(st, 'A.avatar', 'SD01-011');
  put(st, 'A.hand', 'BT09-041');
  const fx = BoT.applyAction(st, { type: 'move', k: giant, to: 'A.hell', by: 'A', seed: 20 });
  if (fx.deny) fail('self move to hell deny: ' + fx.deny);
  const handWin = (st.prompts || []).some(p => p.avatarHandAbility && p.reactTrigger === 'ownAvatarDestroyedByOpp');
  ok(!handWin, 'own destroy does not offer hand summon: ' + promptKinds(st).join(','));
}

console.log('ALL OK');
