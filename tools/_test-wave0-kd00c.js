/* focused: คลื่น 0 KD00-00C โอน้อยออกแห่งโชคชะตา — 2p เป่ายิ้งฉุบ ผู้แพ้หงาย LIFE */
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
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 6) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}
function playToRps(st) {
  const mag = put(st, 'A.hand', 'KD00-00C');
  let fx = apply(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  if (fx.deny) fail('play 00C deny: ' + fx.deny);
  skipNegate(st);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'rps' && pr.then === 'revealLoserLife',
    'rps prompt: ' + JSON.stringify(pr && { kind: pr.kind, then: pr.then }));
  return mag;
}

/* 1) A ค้อน ชนะ B กรรไกร → B หงาย LIFE 1 */
{
  const st = emptyState();
  padDecks(st);
  for (let i = 0; i < 3; i++) put(st, 'B.life', 'SD01-021', { faceUp: false });
  for (let i = 0; i < 3; i++) put(st, 'A.life', 'SD01-021', { faceUp: false });
  playToRps(st);
  let fx = apply(st, { type: 'rpsPick', v: 'rock', by: 'A', seed: 2 });
  if (fx.deny) fail('A rps deny: ' + fx.deny);
  fx = apply(st, { type: 'rpsPick', v: 'scissors', by: 'B', seed: 3 });
  if (fx.deny) fail('B rps deny: ' + fx.deny);
  const bUp = (st.zones['B.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
  const aUp = (st.zones['A.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
  ok(bUp === 1, 'loser B revealed 1 life: ' + bUp);
  ok(aUp === 0, 'winner A life still down: ' + aUp);
  ok(!st.over, 'game not over');
}

/* 2) B สาหัสแล้วแพ้เป่ายิ้งฉุบ → แพ้เกมทันที */
{
  const st = emptyState();
  padDecks(st);
  put(st, 'B.life', 'SD01-021', { faceUp: true });
  put(st, 'B.life', 'SD01-021', { faceUp: true });
  put(st, 'A.life', 'SD01-021', { faceUp: false });
  playToRps(st);
  apply(st, { type: 'rpsPick', v: 'paper', by: 'A', seed: 4 });
  const fx = apply(st, { type: 'rpsPick', v: 'rock', by: 'B', seed: 5 });
  if (fx.deny) fail('crit rps deny: ' + fx.deny);
  ok(st.over && st.over.winner === 'A', 'critical loser B → A wins: ' + JSON.stringify(st.over));
  ok(fx.over === 'A', 'fx.over A: ' + fx.over);
}

console.log('wave0 kd00c: all passed');
