/* focused: BT09-011 เจ้าหญิงรวงข้าว — จุติคืนเด็คแล้วจั่ว */
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
function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 12) {
    const chooser = st.prompts[0].chooser;
    const fx = apply(st, { type: 'reactNo', by: chooser, seed: (seed || 1) + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
function summonPrincess(st, seed) {
  const av = put(st, 'A.hand', 'BT09-011');
  const g1 = put(st, 'A.hand', 'SD01-006');
  const fx = apply(st, { type: 'summon', k: av, to: 'A.avatar', payIds: [g1], by: 'A', seed: seed || 7 });
  if (fx.deny) fail('summon deny: ' + fx.deny);
  drainReact(st, seed || 7);
  return av;
}

{
  const e = BoT.effectOf('BT09-011');
  const ab = ((e && e.abilities) || []).find(x => x.keyword === 'จุติ');
  const mode = ((ab && ab.actions) || []).find(a => a.op === 'chooseMode');
  ok(!!mode && (mode.options || []).length === 2, 'juti is chooseMode with 2 options');
  ok((mode.options[0].actions || []).some(a => a.op === 'darkPick'), 'opt1 darkPick May');
  ok((mode.options[1].actions || []).some(a => a.op === 'hellPick'), 'opt2 hellPick weapon');
}

/* 1) เมย์ในมิติมืด → กลับเด็ค สับ จั่ว 1 */
{
  const st = emptyState();
  const may = put(st, 'A.dark', 'BT09-010');
  const draw = put(st, 'A.deck', 'SD01-003');
  const junk = put(st, 'A.deck', 'SD01-011');
  const prin = summonPrincess(st, 11);
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseMode', 'juti opens chooseMode: ' + ((pr && pr.kind) || 'none'));
  let fx = apply(st, { type: 'chooseMode', k: prin, opt: 0, by: 'A', seed: 12 });
  if (fx.deny) fail('choose May deny: ' + fx.deny);
  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'dark', 'pick from dark: ' + JSON.stringify(pr && { kind: pr.kind, from: pr.from, dest: pr.dest }));
  fx = apply(st, { type: 'chooseTarget', k: may, by: 'A', seed: 13 });
  if (fx.deny) fail('return May deny: ' + fx.deny);
  ok(zone(st, may) === 'A.deck', 'May back to deck: ' + zone(st, may));
  ok((st.zones['A.hand'] || []).includes(draw) || (st.zones['A.hand'] || []).includes(junk),
    'drew 1 after return: hand=' + (st.zones['A.hand'] || []).map(id => st.inst[id].name).join(','));
  ok(!(st.prompts || []).length, 'no leftover prompt');
}

/* 2) อาวุธในนรก → กลับเด็ค สับ จั่ว 1 */
{
  const st = emptyState();
  const gun = put(st, 'A.hell', 'BT09-067');
  const draw = put(st, 'A.deck', 'SD01-003');
  const prin = summonPrincess(st, 21);
  let fx = apply(st, { type: 'chooseMode', k: prin, opt: 1, by: 'A', seed: 22 });
  if (fx.deny) fail('choose weapon deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'pick' && pr.from === 'hell' && pr.dest === 'deck',
    'pick weapon from hell to deck: ' + JSON.stringify(pr && { kind: pr.kind, from: pr.from, dest: pr.dest }));
  fx = apply(st, { type: 'chooseTarget', k: gun, by: 'A', seed: 23 });
  if (fx.deny) fail('return gun deny: ' + fx.deny);
  ok(zone(st, gun) === 'A.deck', 'gun back to deck: ' + zone(st, gun));
  ok((st.zones['A.hand'] || []).includes(draw), 'drew leftover deck card');
}

/* 3) ไม่มีเมย์ในมิติมืด — เลือกข้อ 1 แล้วยังจั่วได้ */
{
  const st = emptyState();
  const draw = put(st, 'A.deck', 'SD01-003');
  const prin = summonPrincess(st, 31);
  const fx = apply(st, { type: 'chooseMode', k: prin, opt: 0, by: 'A', seed: 32 });
  if (fx.deny) fail('empty dark deny: ' + fx.deny);
  ok(!(st.prompts || []).length, 'no pick when dark empty');
  ok((st.zones['A.hand'] || []).includes(draw), 'still drew when dark empty');
}

console.log('princess juti: all passed');
