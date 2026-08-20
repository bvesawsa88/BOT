/* focused: ซีรีเทพธิดาแห่งวัลฮัลลา — สั่งใช้ธรณีสูบ + โดนธรณีสูบ */
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
function skipReact(st) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 80 + n });
    if (fx.deny) fail('reactNo: ' + fx.deny);
  }
}
function skipReactExcept(st, keepK) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 8) {
    const p = st.prompts[0];
    if ((p.options || []).includes(keepK) && p.chooser === BoT.ownerOf(st, keepK)) break;
    const fx = apply(st, { type: 'reactNo', by: p.chooser, seed: 70 + n });
    if (fx.deny) fail('reactNo except: ' + fx.deny);
  }
}
function padDeck(st, side, n, code) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(put(st, side + '.deck', code || 'SD01-011', { faceUp: false }));
  return ids;
}

{
  const st = emptyState();
  const sig = put(st, 'A.avatar', 'BT06-029');
  padDeck(st, 'A', 8);
  padDeck(st, 'B', 4);
  let fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 1 });
  if (fx.deny) fail('sigrun activate: ' + fx.deny);
  skipReact(st);
  ok((st.zones['A.hell'] || []).length === 3, 'sigrun milled 3: ' + (st.zones['A.hell'] || []).length);
  ok(BoT.effPower(st, sig) === 6, 'sigrun POWER 5+1: ' + BoT.effPower(st, sig));
  fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 2 });
  ok(!!fx.deny, 'sigrun once per turn: ' + fx.deny);
}

{
  const st = emptyState();
  const sig = put(st, 'A.avatar', 'BT06-029');
  padDeck(st, 'A', 2);
  const fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 3 });
  ok(!!fx.deny && /ธรณีสูบ/.test(fx.deny), 'sigrun deny short deck: ' + fx.deny);
  ok(BoT.effPower(st, sig) === 5, 'sigrun no buff if unpaid');
}

{
  const st = emptyState();
  const gate = put(st, 'land', 'BT06-063', { controller: 'A' });
  const brun = put(st, 'A.hell', 'BT05-027');
  padDeck(st, 'A', 6);
  let fx = apply(st, { type: 'activateAbility', k: gate, by: 'A', seed: 4 });
  if (fx.deny) fail('gate activate: ' + fx.deny);
  ok((st.zones['A.hell'] || []).length >= 3, 'gate milled 2 plus brun already in hell');
  const p = (st.prompts || [])[0];
  ok(p && p.kind === 'pick' && p.dest === 'hand', 'gate hellPick prompt: ' + (p && p.kind) + '/' + (p && p.dest));
  fx = apply(st, { type: 'chooseTarget', k: brun, by: 'A', seed: 5 });
  if (fx.deny) fail('gate pick: ' + fx.deny);
  ok(BoT.zoneOf(st, brun) === 'A.hand', 'brunhild to hand');
}

{
  const st = emptyState();
  const sig = put(st, 'A.avatar', 'BT06-029');
  const olr = put(st, 'A.deck', 'BT06-028', { faceUp: false });
  padDeck(st, 'A', 2);
  const fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 6 });
  if (fx.deny) fail('sigrun mill olrun: ' + fx.deny);
  skipReact(st);
  ok(BoT.zoneOf(st, olr) === 'A.hand', 'olrun bounced to hand when milled by purple god');
}

{
  const st = emptyState();
  const red = put(st, 'A.avatar', 'SD01-002');
  const olr = put(st, 'A.hell', 'BT06-028');
  /* mill via red avatar mill action: นายนิรยบาล mill both is milled-by-self, use a mill op from red by forcing mill through Sigrun-less source.
     ใช้ใบ BT01-015 เต๋าในเด็คไม่ได้ — จำลอง mill จาก Avatar แดงโดย activate ไม่มี mill.
     ใส่โอลรุนในเด็คแล้ว mill จาก Magic ประตู */
  const st2 = emptyState();
  const gate = put(st2, 'land', 'BT06-063', { controller: 'A' });
  const olr2 = put(st2, 'A.deck', 'BT06-028', { faceUp: false });
  padDeck(st2, 'A', 1);
  const fx2 = apply(st2, { type: 'activateAbility', k: gate, by: 'A', seed: 7 });
  if (fx2.deny) fail('gate mill olrun: ' + fx2.deny);
  ok(BoT.zoneOf(st2, olr2) === 'A.hand', 'olrun bounced when milled by Magic land');
  void red; void olr;
}

{
  const st = emptyState();
  const sig = put(st, 'A.avatar', 'BT06-029');
  const skuld = put(st, 'A.deck', 'BT06-027', { faceUp: false });
  const olr = put(st, 'A.hell', 'BT06-028');
  padDeck(st, 'A', 2);
  const fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 8 });
  if (fx.deny) fail('sigrun mill skuld: ' + fx.deny);
  skipReact(st);
  ok(BoT.zoneOf(st, skuld) === 'A.hell', 'skuld stays in hell');
  const p = (st.prompts || []).find(x => x.kind === 'pick' && x.dest === 'avatar');
  ok(!!p, 'skuld offers hellPick summon');
  const pickFx = apply(st, { type: 'chooseTarget', k: olr, by: 'A', seed: 9 });
  if (pickFx.deny) fail('skuld pick olrun: ' + pickFx.deny);
  ok(BoT.zoneOf(st, olr) === 'A.avatar', 'olrun summoned from hell via skuld');
}

{
  const st = emptyState();
  const sig = put(st, 'A.avatar', 'BT06-029');
  const brun = put(st, 'A.deck', 'BT05-027', { faceUp: false });
  padDeck(st, 'A', 2);
  const fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 10 });
  if (fx.deny) fail('sigrun mill brun: ' + fx.deny);
  skipReact(st);
  const p = (st.prompts || []).find(x => x.kind === 'milledOptional' && x.src === brun);
  ok(!!p, 'brunhild offers summon from hell');
  const yes = apply(st, { type: 'chooseTarget', k: brun, by: 'A', seed: 11 });
  if (yes.deny) fail('brunhild yes: ' + yes.deny);
  ok(BoT.zoneOf(st, brun) === 'A.avatar', 'brunhild summoned from hell');
}

{
  const st = emptyState();
  const sig = put(st, 'A.avatar', 'BT06-029');
  const call = put(st, 'A.deck', 'BT06-052', { faceUp: false });
  padDeck(st, 'A', 2);
  const fx = apply(st, { type: 'activateAbility', k: sig, by: 'A', seed: 12 });
  if (fx.deny) fail('sigrun mill call: ' + fx.deny);
  skipReact(st);
  ok(BoT.zoneOf(st, call) === 'A.hand', 'call of valhalla bounced when milled');
}

{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  padDeck(st, 'A', 6);
  padDeck(st, 'B', 8);
  put(st, 'A.life', 'SD01-021', { type: 'Life', faceUp: false });
  put(st, 'B.life', 'SD01-021', { type: 'Life', faceUp: false });
  const atk = put(st, 'B.avatar', 'SD01-002');
  const def = put(st, 'A.avatar', 'BT06-029');
  const call = put(st, 'A.hand', 'BT06-052');
  let fx = apply(st, { type: 'declareAttack', atk, def, by: 'B', seed: 20 });
  if (fx.deny) fail('attack not-critical: ' + fx.deny);
  const pr = (st.prompts || []).find(p => p.kind === 'react' && p.chooser === 'A');
  ok(!pr || !(pr.options || []).includes(call), 'call not offered unless critical');
}

{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  padDeck(st, 'A', 8);
  padDeck(st, 'B', 4);
  put(st, 'A.life', 'SD01-021', { type: 'Life', faceUp: true });
  put(st, 'B.life', 'SD01-021', { type: 'Life', faceUp: false });
  const atk = put(st, 'B.avatar', 'SD01-002');
  const def = put(st, 'A.avatar', 'BT06-029');
  const call = put(st, 'A.hand', 'BT06-052');
  const olr = put(st, 'A.hell', 'BT06-028');
  let fx = apply(st, { type: 'declareAttack', atk, def, by: 'B', seed: 21 });
  if (fx.deny) fail('attack critical: ' + fx.deny);
  skipReactExcept(st, call);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && (pr.options || []).includes(call), 'call offered when critical');
  fx = apply(st, { type: 'chooseTarget', k: call, by: 'A', seed: 22 });
  if (fx.deny) fail('play call: ' + fx.deny);
  skipReact(st);
  ok(!st.pending, 'attack cancelled');
  ok((st.zones['A.hell'] || []).length >= 5, 'milled 5 for call cost');
  const pick = (st.prompts || []).find(p => p.kind === 'pick' && p.dest === 'avatar');
  ok(!!pick, 'call hellPick goddesses');
  fx = apply(st, { type: 'chooseTarget', k: olr, by: 'A', seed: 23 });
  if (fx.deny) fail('call summon olrun: ' + fx.deny);
  ok(BoT.zoneOf(st, olr) === 'A.avatar', 'olrun summoned by call');
}

console.log('all valhalla tests passed');
