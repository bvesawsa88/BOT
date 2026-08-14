/* focused: โอเปอเรชั่น : สเกาท์ (BT11-052) */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) { return cards.find(c => c.code === code); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    attacksThisTurn: { A: 0, B: 0 }, skipLethalPlead: true
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
function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || []).length && n++ < 12) {
    const pr = st.prompts[0];
    if (pr.kind === 'react' || pr.magicNegate || pr.mode === 'negateMagic') {
      const fx = BoT.applyAction(st, { type: 'reactNo', by: pr.chooser, seed: seed + n });
      if (fx.deny) fail('reactNo deny: ' + fx.deny);
      continue;
    }
    break;
  }
}

{
  const e = BoT.effectOf('BT11-052', 'โอเปอเรชั่น : สเกาท์');
  const ab = (e && e.abilities || []).find(a => a.trigger && a.trigger.on === 'activated');
  ok(ab && (ab.actions || []).some(ac => ac.op === 'scout' && ac.dest === 'avatar' && ac.paidCost && ac.restTo === 'bottom'),
    'activated scout 3 summon จุติ rest bottom');
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const f1 = put(st, 'A.deck', 'SD01-011');
  const f2 = put(st, 'A.deck', 'SD01-003');
  const xvi = put(st, 'A.deck', 'BT11-017');
  const mag = put(st, 'A.hand', 'BT11-052');

  let fx = BoT.applyAction(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  if (fx.deny) fail('playMagic deny: ' + fx.deny);
  drainReact(st, 1);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'ids' && pr.dest === 'avatar', 'scout pick after play');
  ok(pr.paidCost === true, 'จุติ (paidCost)');
  ok(pr.restTo === 'bottom', 'rest to deck bottom');
  ok((pr.ids || []).includes(xvi), 'XVI in scout');

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: xvi, by: 'A', seed: 2 });
  if (fx.deny) fail('pick XVI deny: ' + fx.deny);
  drainReact(st, 2);
  ok(BoT.zoneOf(st, xvi) === 'A.avatar', 'XVI summoned');
  ok(BoT.zoneOf(st, f1) === 'A.deck', 'rest 1 still in deck');
  ok(BoT.zoneOf(st, f2) === 'A.deck', 'rest 2 still in deck');
  ok(st.zones['A.deck'][0] === f1 || st.zones['A.deck'][0] === f2, 'rest went to bottom');
  ok(BoT.zoneOf(st, mag) === 'A.hell', 'spell to hell: ' + BoT.zoneOf(st, mag));
}

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'A.avatar', 'BT11-014');
  put(st, 'A.avatar', 'BT11-015');
  put(st, 'A.avatar', 'BT11-016');
  put(st, 'A.avatar', 'BT11-017');
  const f1 = put(st, 'A.deck', 'SD01-011');
  const f2 = put(st, 'A.deck', 'SD01-003');
  const xvi = put(st, 'A.deck', 'BT11-014');
  const mag = put(st, 'A.hand', 'BT11-052');

  let fx = BoT.applyAction(st, { type: 'playMagic', k: mag, by: 'A', seed: 10 });
  if (fx.deny) fail('playMagic full deny: ' + fx.deny);
  drainReact(st, 10);
  ok((st.prompts || [])[0] && (st.prompts[0].ids || []).length === 3, 'scout shown when field full');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: xvi, by: 'A', seed: 11 });
  if (fx.deny) fail('pick when full deny: ' + fx.deny);
  ok(BoT.zoneOf(st, xvi) === 'A.deck', 'cannot summon → XVI to deck bottom not hand');
  ok(BoT.zoneOf(st, f1) === 'A.deck' && BoT.zoneOf(st, f2) === 'A.deck', 'rest also bottom');
  ok((st.zones['A.hand'] || []).length === 0, 'nothing to hand');
  ok((st.zones['A.avatar'] || []).length === 4, 'field still 4');
}

console.log('all op-scout tests passed');
