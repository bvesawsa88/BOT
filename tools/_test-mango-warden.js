/* focused: BT10-040 ผู้คุมกฎแห่งภาคีมะม่วง — หยิบต้นมะม่วงก่อน แล้วค่อย Only #1 */
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
    cost: c.cost, gem: c.gem, power: c.power, ex: c.ex || '', effect: c.effect || '—',
    img: c.imageUrl || '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  if (extra) Object.assign(st.inst[k], extra);
  st.zones[zone] = st.zones[zone] || [];
  st.zones[zone].push(k);
  return k;
}
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
function namesIn(st, zone) {
  return (st.zones[zone] || []).map(id => (st.inst[id] && st.inst[id].name) || id);
}
function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 12) {
    const chooser = st.prompts[0].chooser;
    const fx = BoT.applyAction(st, { type: 'reactNo', by: chooser, seed: (seed || 1) + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
function summonWarden(st, seed) {
  const warden = put(st, 'A.hand', 'BT10-040');
  const g1 = put(st, 'A.hand', 'SD01-006');
  const g2 = put(st, 'A.hand', 'SD01-006');
  const fx = BoT.applyAction(st, { type: 'summon', k: warden, to: 'A.avatar', payIds: [g1, g2], by: 'A', seed: seed || 7 });
  if (fx.deny) fail('summon deny: ' + fx.deny);
  drainReact(st, seed || 7);
  return warden;
}

{
  const e = BoT.effectOf('BT10-040', 'ผู้คุมกฎแห่งภาคีมะม่วง');
  const ab = ((e && e.abilities) || []).find(x => x.keyword === 'จุติ');
  const pick = ((ab && ab.actions) || []).find(a => a.op === 'deckPick');
  ok(!!pick, 'warden has deckPick juti');
  ok(!!(pick.filter && pick.filter.excludeOnly), 'first pick excludes Only');
  ok(pick.thenIfExactName === 'ต้นมะม่วง', 'second pick only after ต้นมะม่วง');
  ok(!!pick.autoPickThenName, 'auto-picks ต้นมะม่วง when in deck');
  const then = (pick.thenIfFound || [])[0];
  ok(then && then.op === 'deckOrHellPick' && then.autoPickOnly, 'then auto-picks Only #1');
}

/* มีต้นมะม่วง + มาโกะ + ดยุก → หยิบต้นมะม่วงแล้ว Only อัตโนมัติ ไม่โผล่ Only ในใบแรก */
{
  const st = emptyState();
  const tree = put(st, 'A.deck', 'BT02-036');
  const mako = put(st, 'A.deck', 'BT10-039');
  const duke = put(st, 'A.deck', 'BT11-046');
  summonWarden(st, 11);
  const magic = namesIn(st, 'A.magic');
  ok(magic.includes('ต้นมะม่วง'), 'first search took ต้นมะม่วง: ' + magic.join(', '));
  ok(magic.includes('มาโกะ มารดาแห่งภาคีมะม่วง'), 'then took Only #1: ' + magic.join(', '));
  ok(!magic.includes('ดยุกแห่งภาคีมะม่วง'), 'did not take duke instead of Only');
  ok(!(st.prompts || []).some(p => p.kind === 'pick'), 'no leftover pick prompt');
  ok(BoT.zoneOf(st, tree) === 'A.magic', 'tree on magic');
  ok(BoT.zoneOf(st, mako) === 'A.magic', 'mako on magic');
  ok(BoT.zoneOf(st, duke) === 'A.deck', 'duke stayed in deck');
}

/* ไม่มีต้นมะม่วง → ใบแรกห้าม Only · หยิบดยุกแล้วไม่เปิดหยิบ Only */
{
  const st = emptyState();
  const mako = put(st, 'A.deck', 'BT10-039');
  const duke = put(st, 'A.deck', 'BT11-046');
  summonWarden(st, 21);
  const p = (st.prompts || [])[0];
  ok(p && p.kind === 'pick' && p.from === 'deckAll', 'asks first mango (not Only)');
  const cands = BoT.promptCandidates(st, p);
  const candNames = cands.map(id => st.inst[id].name);
  ok(candNames.includes('ดยุกแห่งภาคีมะม่วง'), 'first pick has non-Only mango');
  ok(!candNames.includes('มาโกะ มารดาแห่งภาคีมะม่วง'), 'first pick hides Only #1: ' + candNames.join(', '));
  const fx = BoT.applyAction(st, { type: 'chooseTarget', k: duke, by: 'A', seed: 22 });
  if (fx.deny) fail('pick duke deny: ' + fx.deny);
  ok(!(st.prompts || []).some(x => x.kind === 'pick'), 'no second pick without ต้นมะม่วง');
  ok(BoT.zoneOf(st, duke) === 'A.magic', 'duke on magic');
  ok(BoT.zoneOf(st, mako) === 'A.deck', 'Only stayed in deck');
}

/* ต้นมะม่วงในเด็ค มาโกะในนรก → หยิบต้นแล้วหยิบ Only จากนรก */
{
  const st = emptyState();
  put(st, 'A.deck', 'BT02-036');
  const mako = put(st, 'A.hell', 'BT10-039');
  summonWarden(st, 31);
  ok(namesIn(st, 'A.magic').includes('ต้นมะม่วง'), 'tree from deck');
  ok(BoT.zoneOf(st, mako) === 'A.magic', 'Only #1 from hell after tree');
}

console.log('all ok');
