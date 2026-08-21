/* นครทิเนนทอล: ยกเลิกหน้าต่างเลือกได้ / เทคใช้ไม่ได้หรือข้ามเป้า = นับว่าใช้แล้ว */
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
function act(st, city) {
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: city, by: 'A', seed: 1 });
  if (fx.deny) fail('activate deny: ' + fx.deny);
  return fx;
}
function choose(st, city, opt, seed) {
  return BoT.applyAction(st, { type: 'chooseMode', k: city, opt, by: 'A', seed: seed || 2 });
}

{
  const st = emptyState();
  const city = put(st, 'A.construct', 'BT11-072');
  act(st, city);
  ok((st.prompts[0] && st.prompts[0].kind === 'chooseMode'), 'activate opens chooseMode');
  ok(st.prompts[0].optional === true, 'chooseMode skippable');
  const fx = BoT.applyAction(st, { type: 'skipPrompt', by: 'A' });
  ok(!fx.deny, 'can cancel chooseMode: ' + (fx.deny || 'ok'));
  ok(!(st.prompts || []).length, 'prompt cleared after cancel');
  const d1 = BoT.chooseModeOptionDeny(st, city, 'A', st.inst[city] && null);
  act(st, city);
  const fx2 = choose(st, city, 0);
  ok(!fx2.deny, 'after cancel, tech 1 still available: ' + (fx2.deny || 'ok'));
}

{
  const st = emptyState();
  const city = put(st, 'A.construct', 'BT11-072');
  act(st, city);
  const fx = choose(st, city, 1);
  ok(!fx.deny, 'can pick tech 2 without gunman (fizzle): ' + (fx.deny || 'ok'));
  ok(!(st.prompts || []).length, 'no pick prompt after fizzle');
  const opt2 = { oncePerTurn: true, oncePerTurnTag: 'tinentol-attach', label: 'เทค 2 สวมจากมิติมืด', countsAsModification: true, requireOwnNameIncludes: 'มือปืนนคร' };
  const deny2 = BoT.chooseModeOptionDeny(st, city, 'A', opt2);
  ok(!!deny2 && /ใช้ไปแล้ว/.test(deny2), 'tech 2 consumed: ' + deny2);
  ok(!!st.magicUsed.A.Modification, 'fizzle tech 2 still counts as Modification');
  act(st, city);
  const fx1 = choose(st, city, 0);
  ok(!fx1.deny, 'tech 1 still available after tech 2 fizzle: ' + (fx1.deny || 'ok'));
}

{
  const st = emptyState();
  const city = put(st, 'A.construct', 'BT11-072');
  put(st, 'A.avatar', 'BT11-004'); // บ่าวจุ้ย มือปืนนคร
  act(st, city);
  const fx = choose(st, city, 1);
  ok(!fx.deny, 'tech 2 with gunman empty dark: ' + (fx.deny || 'ok'));
  ok(!(st.prompts || []).length, 'no overlay when dark empty');
  const opt2 = { oncePerTurn: true, oncePerTurnTag: 'tinentol-attach', label: 'เทค 2 สวมจากมิติมืด' };
  const deny2 = BoT.chooseModeOptionDeny(st, city, 'A', opt2);
  ok(!!deny2 && /ใช้ไปแล้ว/.test(deny2), 'empty dark still consumes tech 2: ' + deny2);
  ok(!!st.magicUsed.A.Modification, 'empty dark still counts as Modification');
}

{
  const st = emptyState();
  const city = put(st, 'A.construct', 'BT11-072');
  put(st, 'A.avatar', 'BT11-004');
  put(st, 'A.dark', 'BT11-065');
  act(st, city);
  const fx = choose(st, city, 1);
  ok(!fx.deny, 'tech 2 opens dark pick: ' + (fx.deny || 'ok'));
  ok(st.prompts[0] && st.prompts[0].from === 'dark', 'prompt from dark');
  const skip = BoT.applyAction(st, { type: 'skipPrompt', by: 'A' });
  ok(!skip.deny, 'can skip dark pick: ' + (skip.deny || 'ok'));
  const opt2 = { oncePerTurn: true, oncePerTurnTag: 'tinentol-attach', label: 'เทค 2 สวมจากมิติมืด' };
  const deny2 = BoT.chooseModeOptionDeny(st, city, 'A', opt2);
  ok(!!deny2 && /ใช้ไปแล้ว/.test(deny2), 'skip dark pick consumes tech 2: ' + deny2);
  ok(!!st.magicUsed.A.Modification, 'skip dark pick counts as Modification');
}

{
  const st = emptyState();
  const city = put(st, 'A.construct', 'BT11-072');
  put(st, 'A.avatar', 'BT11-004');
  put(st, 'A.dark', 'BT11-065');
  st.magicUsed.A.Modification = true;
  act(st, city);
  const fx = choose(st, city, 1);
  ok(!fx.deny, 'can pick tech 2 even if Modification already used: ' + (fx.deny || 'ok'));
  const opt2 = { oncePerTurn: true, oncePerTurnTag: 'tinentol-attach', label: 'เทค 2 สวมจากมิติมืด' };
  const deny2 = BoT.chooseModeOptionDeny(st, city, 'A', opt2);
  ok(!!deny2 && /ใช้ไปแล้ว/.test(deny2), 'already-used-mod still consumes tech 2: ' + deny2);
}

{
  const st = emptyState();
  const city = put(st, 'A.construct', 'BT11-072');
  put(st, 'A.avatar', 'BT11-004');
  put(st, 'A.dark', 'BT11-065');
  const handMod = put(st, 'A.hand', 'BT11-066');
  act(st, city);
  const fx = choose(st, city, 1);
  ok(!fx.deny, 'tech 2 success path: ' + (fx.deny || 'ok'));
  const p = st.prompts[0];
  ok(p && p.from === 'dark', 'dark pick open');
  const cands = BoT.promptCandidates(st, p);
  ok(cands.length, 'has dark weapon');
  const pick = BoT.applyAction(st, { type: 'chooseTarget', k: cands[0], by: 'A', seed: 3 });
  ok(!pick.deny, 'equip from dark: ' + (pick.deny || 'ok'));
  const p2 = st.prompts[0];
  if (p2 && p2.dest === 'attachTo') {
    const hosts = BoT.promptCandidates(st, p2);
    ok(hosts.length, 'has gunman host');
    const hx = BoT.applyAction(st, { type: 'chooseTarget', k: hosts[0], by: 'A', seed: 4 });
    ok(!hx.deny, 'attach to gunman: ' + (hx.deny || 'ok'));
  }
  ok(!!st.magicUsed.A.Modification, 'successful tech 2 marks Modification used');
  const play = BoT.applyAction(st, { type: 'playMagic', k: handMod, by: 'A', seed: 5 });
  ok(!!play.deny && /Modification/.test(play.deny), 'cannot play another Modification after tech 2: ' + (play.deny || 'no deny'));
}

{
  // เมื่อเทค 1 ใช้แล้ว และไม่มีมือปืนในสนาม (เทค 2 ใช้ไม่ได้) -> สั่งใช้ต้อง deny ทันที ไม่เปิด prompt ลูป
  const st = emptyState();
  const city = put(st, 'B.construct', 'BT11-072');
  st.active = 'B';
  const fx1 = BoT.applyAction(st, { type: 'activateAbility', k: city, by: 'B', seed: 1 });
  ok(!fx1.deny, 'first activate ok: ' + (fx1.deny || 'ok'));
  const ch1 = BoT.applyAction(st, { type: 'chooseMode', k: city, opt: 0, by: 'B', seed: 2 });
  ok(!ch1.deny, 'tech 1 scout ok: ' + (ch1.deny || 'ok'));

  const fx2 = BoT.applyAction(st, { type: 'activateAbility', k: city, by: 'B', seed: 3 });
  ok(!!fx2.deny, 'second activate denied because tech 1 used and no gunman on field: ' + (fx2.deny || 'none'));
  ok(!(st.prompts || []).length, 'no prompt opened on denied activate');
}

console.log('all tinentol skip tests passed');
