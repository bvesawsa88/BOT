/* focused: คลื่น 0 SL02-008 พลังแฝง — React เมื่อ Avatar ฝ่ายเราต่อสู้ */
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
    phase: 'Battle', active: 'A', turn: 2, turnSeq: 2,
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
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 6) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}

/* 1) โจมตีด้วย Avatar ฝ่ายเรา → เล่นพลังแฝง ตัวโจมตี +2 */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  padDecks(st);
  const atk = put(st, 'A.avatar', 'SD01-003');
  const def = put(st, 'B.avatar', 'SD01-011');
  const react = put(st, 'A.hand', 'SL02-008');
  const p0 = BoT.effPower(st, atk);
  let fx = apply(st, { type: 'declareAttack', atk, def, by: 'A', seed: 1 });
  if (fx.deny) fail('declare deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.reactTrigger === 'ownAvatarFights' && pr.chooser === 'A',
    'own fight prompt: ' + JSON.stringify(pr && { kind: pr.kind, trig: pr.reactTrigger, chooser: pr.chooser }));
  ok((pr.options || []).includes(react), 'พลังแฝง in attacker options');
  fx = apply(st, { type: 'chooseTarget', k: react, by: 'A', seed: 2 });
  if (fx.deny) fail('play hidden power deny: ' + fx.deny);
  skipNegate(st);
  ok(BoT.effPower(st, atk) === p0 + 2, 'attacker +2: ' + BoT.effPower(st, atk));
}

/* 2) ถูกโจมตี → ฝ่ายรับเล่นพลังแฝง ตัวรับ +2 */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  padDecks(st);
  const atk = put(st, 'A.avatar', 'SD01-003');
  const def = put(st, 'B.avatar', 'SD01-011');
  const react = put(st, 'B.hand', 'SL02-008');
  const p0 = BoT.effPower(st, def);
  let fx = apply(st, { type: 'declareAttack', atk, def, by: 'A', seed: 10 });
  if (fx.deny) fail('declare2 deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.chooser === 'B',
    'defender react prompt: ' + JSON.stringify(pr && { kind: pr.kind, trig: pr.reactTrigger, chooser: pr.chooser }));
  ok((pr.options || []).includes(react), 'พลังแฝง in defender options');
  fx = apply(st, { type: 'chooseTarget', k: react, by: 'B', seed: 11 });
  if (fx.deny) fail('defender play deny: ' + fx.deny);
  skipNegate(st);
  ok(BoT.effPower(st, def) === p0 + 2, 'defender +2: ' + BoT.effPower(st, def));
}

console.log('wave0 hidden power: all passed');
