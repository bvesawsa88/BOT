/* focused: Link ชุด 3 — มิสทรอม่า / ดินแดนยุติธรรม / ออส่วนบอย */
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

function skipReacts(st, seed) {
  let guard = 0;
  while (guard++ < 12) {
    const pr = (st.prompts || [])[0];
    if (!pr || pr.kind !== 'react') break;
    const fx = apply(st, { type: 'reactNo', by: pr.chooser, seed: seed + guard });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}

/* 1) มิสทรอม่าไม่มี Link — POWER ตั้งต้น 2 */
{
  const st = emptyState();
  const mist = put(st, 'A.avatar', 'BT11-011');
  ok(BoT.effPower(st, mist) === 2, 'mistroma base 2: ' + BoT.effPower(st, mist));
}

/* 2) มีคู่ Link อื่น (โฮคุ+โซน่า) — มิสทรอม่า +1 */
{
  const st = emptyState();
  const mist = put(st, 'A.avatar', 'BT11-011');
  put(st, 'A.avatar', 'BT09-007');
  put(st, 'A.avatar', 'BT09-022');
  ok(BoT.effPower(st, mist) === 3, 'mistroma +1 with any link: ' + BoT.effPower(st, mist));
}

/* 3) เพมมุ+สไปรท์ Link — มิสทรอม่า +2 แทน */
{
  const st = emptyState();
  const mist = put(st, 'A.avatar', 'BT11-011');
  put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.avatar', 'BT09-009');
  ok(BoT.effPower(st, mist) === 4, 'mistroma +2 with pemmu+sprite: ' + BoT.effPower(st, mist));
}

/* 4) ดินแดนยุติธรรม: เพมมุไม่ถูกทำลายด้วยความสามารถศัตรู ถ้ามี Link */
{
  const st = emptyState({ phase: 'Main', active: 'B' });
  put(st, 'land', 'BT10-070', { controller: 'A', faceUp: true });
  const pem = put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.avatar', 'BT09-009');
  const other = put(st, 'A.avatar', 'SD01-003');
  const ish = put(st, 'B.avatar', 'FPRO-004');
  let fx = apply(st, { type: 'activateAbility', k: ish, by: 'B', seed: 1 });
  if (fx.deny) fail('ishvar activate deny: ' + fx.deny);
  skipReacts(st, 2);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'ishvar chooseDestroy: ' + JSON.stringify(pr && { kind: pr.kind }));
  const cands = BoT.promptCandidates(st, pr);
  ok(!cands.includes(pem), 'pemmu not a destroy candidate: ' + JSON.stringify(cands));
  ok(cands.includes(other), 'unrelated avatar still destroyable');
  fx = apply(st, { type: 'chooseTarget', k: other, by: 'B', seed: 10 });
  if (fx.deny) fail('destroy other deny: ' + fx.deny);
  ok(zone(st, pem) === 'A.avatar', 'pemmu still on field');
  ok(zone(st, other) === 'A.hell', 'other destroyed: ' + zone(st, other));
}

/* 5) ไม่มี Link — ดินแดนยุติธรรมไม่กัน */
{
  const st = emptyState({ phase: 'Main', active: 'B' });
  put(st, 'land', 'BT10-070', { controller: 'A', faceUp: true });
  const pem = put(st, 'A.avatar', 'BT09-008');
  const ish = put(st, 'B.avatar', 'FPRO-004');
  let fx = apply(st, { type: 'activateAbility', k: ish, by: 'B', seed: 20 });
  if (fx.deny) fail('ishvar2 activate deny: ' + fx.deny);
  skipReacts(st, 21);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'ishvar2 chooseDestroy');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(pem), 'pemmu destroyable without link');
  fx = apply(st, { type: 'chooseTarget', k: pem, by: 'B', seed: 22 });
  if (fx.deny) fail('destroy pemmu deny: ' + fx.deny);
  ok(zone(st, pem) === 'A.hell', 'pemmu destroyed without link: ' + zone(st, pem));
}

/* 6) ออส่วนบอย: ต้องโจมตีกิมมิคแมน */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  const boy = put(st, 'A.avatar', 'BT11-008');
  const gim = put(st, 'A.avatar', 'BT11-007');
  const atk = put(st, 'B.avatar', 'SD01-002');
  let fx = apply(st, { type: 'declareAttack', atk, def: boy, by: 'B', seed: 30 });
  ok(!!fx.deny, 'cannot attack orphan boy: ' + fx.deny);
  fx = apply(st, { type: 'declareAttack', atk, def: gim, by: 'B', seed: 31 });
  if (fx.deny) fail('attack gimmick deny: ' + fx.deny);
  ok(!!st.pending || !!st.inst[atk].tapped, 'attack on gimmick allowed');
}

/* 7) กิมมิคแมนถูกทำลายในเทิร์นศัตรู → POWER ตั้งต้นออส่วนบอย = 6 */
{
  const st = emptyState({ phase: 'Main', active: 'B' });
  const boy = put(st, 'A.avatar', 'BT11-008');
  const gim = put(st, 'A.avatar', 'BT11-007');
  ok(BoT.effPower(st, boy) === 1, 'boy base 1');
  const ish = put(st, 'B.avatar', 'FPRO-004');
  let fx = apply(st, { type: 'activateAbility', k: ish, by: 'B', seed: 40 });
  if (fx.deny) fail('beam3 play deny: ' + fx.deny);
  skipReacts(st, 41);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'beam3 chooseDestroy');
  fx = apply(st, { type: 'chooseTarget', k: gim, by: 'B', seed: 42 });
  if (fx.deny) fail('destroy gimmick deny: ' + fx.deny);
  ok(zone(st, gim) === 'A.hell', 'gimmick destroyed: ' + zone(st, gim));
  ok(st.inst[boy].power === 6, 'boy printed power 6: ' + st.inst[boy].power);
  ok(BoT.effPower(st, boy) === 6, 'boy eff power 6: ' + BoT.effPower(st, boy));
}

/* 8) กิมมิคแมนถูกทำลายในเทิร์นเรา — ไม่ปรับ POWER */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const boy = put(st, 'A.avatar', 'BT11-008');
  const gim = put(st, 'A.avatar', 'BT11-007');
  const ish = put(st, 'A.avatar', 'FPRO-004');
  let fx = apply(st, { type: 'activateAbility', k: ish, by: 'A', seed: 50 });
  if (fx.deny) fail('own destroy play deny: ' + fx.deny);
  skipReacts(st, 51);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'own chooseDestroy: ' + (pr && pr.kind));
  fx = apply(st, { type: 'chooseTarget', k: gim, by: 'A', seed: 52 });
  if (fx.deny) fail('own destroy gimmick deny: ' + fx.deny);
  ok(zone(st, gim) === 'A.hell', 'gimmick destroyed on own turn: ' + zone(st, gim));
  ok(st.inst[boy].power === 1, 'boy printed still 1 on own turn: ' + st.inst[boy].power);
}

/* 9) ทำลายแบบ pick dest=destroy ก็เลือกเพมมุที่ถูกกันไม่ได้ */
{
  const st = emptyState({ phase: 'Main', active: 'B' });
  put(st, 'land', 'BT10-070', { controller: 'A', faceUp: true });
  const pem = put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.avatar', 'BT09-009');
  const other = put(st, 'A.avatar', 'SD01-003');
  const src = put(st, 'B.avatar', 'FPRO-004');
  const pr = { kind: 'pick', from: 'enemyAvatars', dest: 'destroy', chooser: 'B', src };
  const cands = BoT.promptCandidates(st, pr);
  ok(!cands.includes(pem), 'pick dest destroy skips pemu');
  ok(cands.includes(other), 'pick dest destroy still hits other');
}

/* 10) Land ของฝ่ายตรงข้ามไม่กันเพมมุเรา */
{
  const st = emptyState({ phase: 'Main', active: 'B' });
  put(st, 'land', 'BT10-070', { controller: 'B', faceUp: true });
  const pem = put(st, 'A.avatar', 'BT09-008');
  put(st, 'A.avatar', 'BT09-009');
  const ish = put(st, 'B.avatar', 'FPRO-004');
  let fx = apply(st, { type: 'activateAbility', k: ish, by: 'B', seed: 60 });
  if (fx.deny) fail('ishvar3 activate deny: ' + fx.deny);
  skipReacts(st, 61);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'ishvar3 chooseDestroy');
  const cands = BoT.promptCandidates(st, pr);
  ok(cands.includes(pem), 'opp land does not protect our pemu');
}

/* 11) จุติมิสทรอม่า: เล่นดินแดนยุติธรรมจากเด็ค แล้วล็อก Land ศัตรู */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const mist = put(st, 'A.hand', 'BT11-011');
  const pay = put(st, 'A.hand', 'SD01-006');
  const justice = put(st, 'A.deck', 'BT10-070');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  const oppLand = put(st, 'land', 'BT09-070', { controller: 'B', faceUp: true });
  let fx = apply(st, { type: 'summon', k: mist, to: 'A.avatar', payIds: [pay], by: 'A', seed: 70 });
  if (fx.deny) fail('summon mistroma deny: ' + fx.deny);
  skipReacts(st, 71);
  ok(st.blockLandPlayFor && st.blockLandPlayFor.B, 'opp land play locked after juti');
  let pr = (st.prompts || [])[0];
  if (pr && pr.kind === 'chooseDestroy') {
    const cands = BoT.promptCandidates(st, pr);
    ok(cands.includes(oppLand), 'juti can destroy opp land');
    fx = apply(st, { type: 'chooseTarget', k: oppLand, by: 'A', seed: 72 });
    if (fx.deny) fail('juti destroy land deny: ' + fx.deny);
    skipReacts(st, 73);
    pr = (st.prompts || [])[0];
  }
  ok(pr && pr.kind === 'pick', 'juti deckPick justice: ' + (pr && pr.kind));
  const deckCands = BoT.promptCandidates(st, pr);
  ok(deckCands.includes(justice), 'justice in deck pick');
  fx = apply(st, { type: 'chooseTarget', k: justice, by: 'A', seed: 74 });
  if (fx.deny) fail('play justice from deck deny: ' + fx.deny);
  ok(zone(st, justice) === 'land', 'justice on land: ' + zone(st, justice));
  ok(st.inst[justice].controller === 'A', 'justice controller A');
  st.prompts = [];
  st.pending = null;
  fx = apply(st, { type: 'endTurn', by: 'A', seed: 76 });
  if (fx.deny) fail('A endTurn deny: ' + fx.deny);
  skipReacts(st, 77);
  ok(st.blockLandPlayFor && st.blockLandPlayFor.B, 'lock lasts through our end turn');
  st.phase = 'Main';
  const bLand = put(st, 'B.hand', 'BT05-068');
  fx = apply(st, { type: 'playMagic', k: bLand, by: 'B', seed: 75 });
  ok(!!fx.deny, 'opp cannot play land while locked: ' + fx.deny);
  fx = apply(st, { type: 'endTurn', by: 'B', seed: 78 });
  if (fx.deny) fail('B endTurn deny: ' + fx.deny);
  skipReacts(st, 79);
  ok(!(st.blockLandPlayFor && st.blockLandPlayFor.B), 'lock clears at opp next end');
}

/* 12) สีเจมดินแดนยุติธรรมเป็นเจมใส (ขาว) */
{
  const land = byCode('BT10-070');
  ok(BoT.gemColorOf(land) === 'ขาว', 'justice gemColor clear: ' + BoT.gemColorOf(land));
}

console.log('ALL PASS');
