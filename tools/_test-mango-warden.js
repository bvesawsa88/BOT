/* focused: BT10-040 ผู้คุมกฎ — ใบแรกห้าม Only · ได้ต้นมะม่วงแล้วค่อยค้นเด็ค/นรก */
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
function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 12) {
    const chooser = st.prompts[0].chooser;
    const fx = BoT.applyAction(st, { type: 'reactNo', by: chooser, seed: (seed || 1) + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}
function pickPrompt(st) {
  return (st.prompts || []).find(p => p.kind === 'pick') || (st.prompts || [])[0] || null;
}
function candNames(st, p) {
  return BoT.promptCandidates(st, p).map(id => (st.inst[id] && st.inst[id].name) || id);
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
  ok(!pick.autoPickThenName, 'does not auto-pick ต้นมะม่วง');
  ok(pick.thenIfExactName === 'ต้นมะม่วง', 'second search only after ต้นมะม่วง');
  const then = (pick.thenIfFound || [])[0];
  ok(then && then.op === 'deckOrHellPick' && !then.autoPickOnly, 'then search deck or hell, no auto Only');
}

/* ใบแรก: เลือกเอง ห้ามมาโกะ · หยิบต้นแล้วเปิดเด็ค/นรก (รวม Only) */
{
  const st = emptyState();
  const tree = put(st, 'A.deck', 'BT02-036');
  const mako = put(st, 'A.deck', 'BT10-039');
  const duke = put(st, 'A.deck', 'BT11-046');
  summonWarden(st, 11);
  const p1 = pickPrompt(st);
  ok(p1 && p1.from === 'deckAll', 'first overlay searches deck');
  const n1 = candNames(st, p1);
  ok(n1.includes('ต้นมะม่วง'), 'first pick can take ต้นมะม่วง');
  ok(n1.includes('ดยุกแห่งภาคีมะม่วง'), 'first pick can take other non-Only mango');
  ok(!n1.includes('มาโกะ มารดาแห่งภาคีมะม่วง'), 'first pick hides Only: ' + n1.join(', '));
  let fx = BoT.applyAction(st, { type: 'chooseTarget', k: tree, by: 'A', seed: 12 });
  if (fx.deny) fail('pick tree deny: ' + fx.deny);
  ok(BoT.zoneOf(st, tree) === 'A.magic', 'tree on magic after first pick');
  const p2 = pickPrompt(st);
  ok(p2 && p2.from === 'deckOrHell', 'after tree, search deck or hell');
  const n2 = candNames(st, p2);
  ok(n2.includes('มาโกะ มารดาแห่งภาคีมะม่วง'), 'second pick can take Only: ' + n2.join(', '));
  ok(n2.includes('ดยุกแห่งภาคีมะม่วง'), 'second pick can take other mango');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: mako, by: 'A', seed: 13 });
  if (fx.deny) fail('pick mako deny: ' + fx.deny);
  ok(BoT.zoneOf(st, mako) === 'A.magic', 'Only from deck after tree');
  ok(BoT.zoneOf(st, duke) === 'A.deck', 'duke left in deck');
}

/* หยิบดยุกใบแรก → ไม่เปิดรอบสอง ไม่ได้มาโกะ */
{
  const st = emptyState();
  const mako = put(st, 'A.deck', 'BT10-039');
  const duke = put(st, 'A.deck', 'BT11-046');
  summonWarden(st, 21);
  const p1 = pickPrompt(st);
  ok(!candNames(st, p1).includes('มาโกะ มารดาแห่งภาคีมะม่วง'), 'no Only on first pick');
  const fx = BoT.applyAction(st, { type: 'chooseTarget', k: duke, by: 'A', seed: 22 });
  if (fx.deny) fail('pick duke deny: ' + fx.deny);
  ok(!(st.prompts || []).some(x => x.kind === 'pick'), 'no second pick without ต้นมะม่วง');
  ok(BoT.zoneOf(st, duke) === 'A.magic', 'duke on magic');
  ok(BoT.zoneOf(st, mako) === 'A.deck', 'Only stayed in deck');
}

/* ต้นมะม่วงจากเด็ค แล้วหยิบมาโกะจากนรก */
{
  const st = emptyState();
  const tree = put(st, 'A.deck', 'BT02-036');
  const mako = put(st, 'A.hell', 'BT10-039');
  summonWarden(st, 31);
  let fx = BoT.applyAction(st, { type: 'chooseTarget', k: tree, by: 'A', seed: 32 });
  if (fx.deny) fail('pick tree deny: ' + fx.deny);
  const p2 = pickPrompt(st);
  ok(p2 && p2.from === 'deckOrHell', 'second search includes hell');
  ok(BoT.promptCandidates(st, p2).includes(mako), 'Only in hell is a candidate');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: mako, by: 'A', seed: 33 });
  if (fx.deny) fail('pick mako from hell deny: ' + fx.deny);
  ok(BoT.zoneOf(st, mako) === 'A.magic', 'Only from hell after tree');
}

console.log('all ok');
