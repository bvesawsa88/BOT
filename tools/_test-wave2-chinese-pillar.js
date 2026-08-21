/* focused: คลื่น 2 CC01-018 เสามงคล ทรงจีน — โจมตีไม่ได้ + จุติอัญเชิญผู้เจริญแล้วเด้งจบเทิร์น */
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

{
  const e = BoT.effectOf('CC01-018');
  ok(e && e.parseStatus === 'auto' && e.cannotAttack, 'ทรงจีน cannotAttack auto');
  const pick = ((((e && e.abilities) || [])[0] || {}).actions || []).find(a => a.op === 'deckPick');
  ok(pick && pick.dest === 'avatar' && pick.filter && (pick.filter.nameIncludes || []).includes('ผู้เจริญ'),
    'จุติ deckPick ผู้เจริญ dest avatar');
  const sch = ((pick && pick.then) || []).find(a => a.op === 'schedule');
  ok(sch && sch.when === 'ownEndPhase' && sch.src === 'summoned', 'นัดเด้ง summoned จบเทิร์น');
}

{
  const st = emptyState({ phase: 'Battle' });
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const pillar = put(st, 'A.avatar', 'CC01-018');
  const foe = put(st, 'B.avatar', 'SD01-003');
  const fx = apply(st, { type: 'declareAttack', atk: pillar, def: foe, by: 'A', seed: 1 });
  ok(fx.deny && /โจมตีไม่ได้/.test(fx.deny), 'ทรงจีนโจมตีไม่ได้: ' + (fx.deny || ''));
}

{
  const st = emptyState();
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-011');
  put(st, 'B.hand', 'SD01-003');
  const other = put(st, 'A.deck', 'SD01-002');
  const guy = put(st, 'A.deck', 'BT04-037');
  put(st, 'A.deck', 'SD01-007');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-011');
  put(st, 'A.hand', 'SD01-003');
  const av = put(st, 'A.hand', 'CC01-018');
  const p1 = put(st, 'A.hand', 'SD01-017');
  const p2 = put(st, 'A.hand', 'SD02-018');
  const p3 = put(st, 'A.hand', 'SD01-011');
  let fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [p1, p2, p3], by: 'A', seed: 2 });
  ok(!fx.deny, 'summon ทรงจีน: ' + (fx.deny || ''));
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.dest === 'avatar', 'pick ผู้เจริญ dest avatar: ' + (pr && pr.dest));
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(guy) && !cands.includes(other), 'เลือกได้เฉพาะผู้เจริญ');
  fx = apply(st, { type: 'chooseTarget', k: guy, by: 'A', seed: 3 });
  if (fx.deny) fail('pick guy deny: ' + fx.deny);
  ok(BoT.zoneOf(st, guy) === 'A.avatar', 'ผู้เจริญลงสนาม');
  ok(BoT.zoneOf(st, av) === 'A.avatar', 'ทรงจีนยังอยู่');
  ok((st.scheduled || []).some(s => s.when === 'ownEndPhase' && s.src === guy), 'นัดเด้งผู้เจริญจบเทิร์น');

  fx = apply(st, { type: 'endTurn', by: 'A', seed: 4 });
  if (fx.deny) fail('endTurn deny: ' + fx.deny);
  ok(BoT.zoneOf(st, guy) === 'A.hand', 'จบเทิร์นผู้เจริญกลับมือ');
  ok(BoT.zoneOf(st, av) === 'A.avatar', 'ทรงจีนไม่เด้ง');
}

console.log('wave2 chinese pillar: all passed');
