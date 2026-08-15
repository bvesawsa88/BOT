/* focused: ตุตันคาเมน ฟาโรห์ทองคำ (CC02-011)
   จุติเลือกปฏิบัติ · อัญเชิญจากนรกใครก็ได้ · ใบนี้ถูกอัญเชิญจากนรกไม่ได้ */
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
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    attacksThisTurn: { A: 0, B: 0 }, oncePerGame: {}
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

function skipUntilAnyHell(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && n++ < 24) {
    const p = st.prompts[0];
    if (p.kind === 'pick' && p.from === 'anyHell') return p;
    const type = p.kind === 'react' ? 'reactNo' : 'skipPrompt';
    const fx = BoT.applyAction(st, { type, by: p.chooser, seed: (seed || 1) + n });
    if (fx.deny) fail(type + ' deny: ' + fx.deny + ' kind=' + p.kind);
  }
  return (st.prompts || [])[0];
}

function setupHell(st) {
  return {
    indra: put(st, 'A.hell', 'SD01-003'),     // จุติ C2
    isuan: put(st, 'A.hell', 'SD01-001'),     // จุติ C6
    wife: put(st, 'A.hell', 'SD01-005'),      // จุติ Only C3
    tutHell: put(st, 'B.hell', 'CC02-011'),   // ตุตันคาเมนในนรกศัตรู
    ricky: put(st, 'B.hell', 'SD02-004')      // จุติ C3 จากนรกศัตรู
  };
}

function summonTut(st, seed) {
  const tut = put(st, 'A.hand', 'CC02-011');
  const g1 = put(st, 'A.hand', 'SD03-005'); // GEM 4 ม่วง
  const g2 = put(st, 'A.hand', 'SD03-004'); // GEM 2 ม่วง
  const fx = BoT.applyAction(st, { type: 'summon', k: tut, to: 'A.avatar', payIds: [g1, g2], by: 'A', seed: seed || 1 });
  if (fx.deny) fail('summon tut deny: ' + fx.deny);
  return tut;
}

/* 1) จุติข้อ 1: จากนรกใครก็ได้ · ไม่ใช่ Only · Cost รวม≤8 · ตุตันคาเมนถูกกรอง */
{
  const st = emptyState();
  const hell = setupHell(st);
  const tut = summonTut(st, 1);
  ok(BoT.zoneOf(st, tut) === 'A.avatar', 'tut on avatar');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseMode' && (pr.options || []).length === 2, 'juti chooseMode 2 options');

  let fx = BoT.applyAction(st, { type: 'chooseMode', k: tut, opt: 0, by: 'A', seed: 2 });
  if (fx.deny) fail('chooseMode 0 deny: ' + fx.deny);
  const pick = skipUntilAnyHell(st, 3);
  ok(pick && pick.from === 'anyHell' && pick.costSumMax === 8, 'mode1 anyHell costSumMax 8');
  ok(pick.paidCost === true, 'mode1 paidCost so nested juti fires');
  const cands = BoT.promptCandidates(st, pick);
  ok(cands.includes(hell.indra), 'mode1 includes พระอินทร์ (own hell)');
  ok(cands.includes(hell.ricky), 'mode1 includes ริกกี้ (opp hell)');
  ok(cands.includes(hell.isuan), 'mode1 includes พระอิศวร C6');
  ok(!cands.includes(hell.wife), 'mode1 excludes Only');
  ok(!cands.includes(hell.tutHell), 'mode1 excludes ตุตันคาเมน (noHellSummon)');

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: hell.ricky, by: 'A', seed: 4 });
  if (fx.deny) fail('pick ricky deny: ' + fx.deny);
  ok(BoT.zoneOf(st, hell.ricky) === 'A.avatar', 'ricky summoned from opp hell to our avatar');
  const pick2 = skipUntilAnyHell(st, 5);
  ok(pick2 && pick2.from === 'anyHell', 'continue pick after first summon');
  ok(pick2.costGot === 3, 'costGot 3 after ricky');
  const cands2 = BoT.promptCandidates(st, pick2);
  ok(cands2.includes(hell.indra), 'C2 still legal (3+2=5≤8)');
  ok(!cands2.includes(hell.isuan), 'C6 blocked when remaining 5 (3+6=9>8)');

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: hell.indra, by: 'A', seed: 6 });
  if (fx.deny) fail('pick indra deny: ' + fx.deny);
  ok(BoT.zoneOf(st, hell.indra) === 'A.avatar', 'indra summoned from own hell');
  const pick3 = skipUntilAnyHell(st, 7);
  if (pick3 && pick3.from === 'anyHell') {
    const cands3 = BoT.promptCandidates(st, pick3);
    ok(!cands3.includes(hell.isuan), 'C6 still blocked after 3+2');
    fx = BoT.applyAction(st, { type: 'skipPrompt', by: 'A', seed: 8 });
    if (fx.deny) fail('skip extra pick deny: ' + fx.deny);
  }
}

/* 2) จุติข้อ 2: จุติ Avatar 1 ใบ (Only ได้) · ตุตันคาเมนยังถูกกรอง */
{
  const st = emptyState();
  const hell = setupHell(st);
  const tut = summonTut(st, 10);
  let fx = BoT.applyAction(st, { type: 'chooseMode', k: tut, opt: 1, by: 'A', seed: 11 });
  if (fx.deny) fail('chooseMode 1 deny: ' + fx.deny);
  const pick = skipUntilAnyHell(st, 12);
  ok(pick && pick.from === 'anyHell' && pick.costSumMax == null, 'mode2 single pick no cost cap');
  const cands = BoT.promptCandidates(st, pick);
  ok(cands.includes(hell.wife), 'mode2 includes Only juti');
  ok(cands.includes(hell.ricky), 'mode2 includes opp hell juti');
  ok(!cands.includes(hell.tutHell), 'mode2 still excludes ตุตันคาเมน');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: hell.wife, by: 'A', seed: 13 });
  if (fx.deny) fail('pick wife deny: ' + fx.deny);
  ok(BoT.zoneOf(st, hell.wife) === 'A.avatar', 'Only juti summoned via mode 2');
  ok(!(st.prompts || []).some(p => p.from === 'anyHell'), 'mode2 does not continue picking');
}

/* 3) อัญเชิญตุตันคาเมนจากนรกโดยตรงไม่ได้ */
{
  const st = emptyState();
  const tut = put(st, 'A.hell', 'CC02-011');
  const fx = BoT.applyAction(st, { type: 'summon', k: tut, to: 'A.avatar', by: 'A', free: true, seed: 20 });
  ok(!!fx.deny && /นรก/.test(fx.deny), 'free hell summon denied: ' + (fx.deny || 'no deny'));
  ok(BoT.zoneOf(st, tut) === 'A.hell', 'tut stays in hell');
}

console.log('all tutankhamen tests passed');
