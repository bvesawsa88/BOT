/* Test:
   - ดาบศักดิ์สิทธิ์ สั่งใช้จากนรก: ไม่มีอัศวินโต๊ะกลม → ใช้ไม่ได้ และไม่ธรณีสูบ (กันบอทสูบวน)
   - มีอัศวิน → สวมได้ · ใช้ Mod ไปแล้วในเทิร์น → ดาบเล่มถัดไปใช้ไม่ได้
   - มณโฑ ราชินีเหล่ายักษ์ นับเป็นยักษ์: เซ่นตัวเอง → เรียกยักษ์ POWER เท่ากัน คนละชื่อ (+2)
   - ไม่มีใบในนรกที่เรียกได้ → สั่งใช้ไม่ได้ (ไม่เซ่นฟรี)
*/
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));
const cards = require('../data/cards.json');

function assert(cond, msg) {
  if (!cond) { console.error('❌ FAIL:', msg); process.exit(1); }
  console.log('✅ PASS:', msg);
}
function mk(st, id, code, z) {
  const c = cards.find(x => x.code === code);
  st.inst[id] = Object.assign({}, c, { id, faceUp: true, tapped: false, counters: 0 });
  st.zones[z].push(id);
}
function S() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; }));
  return { inst: {}, zones, log: [], phase: 'Main', active: 'A', turn: 2, turnSeq: 2, strict: true, firstPlayer: 'A', fpDrawn: true, buffs: [], pending: null, prompts: [], scheduled: [], chain: [] };
}

console.log('--- ดาบศักดิ์สิทธิ์ ---');
{
  const knight = cards.find(x => x.type === 'Avatar' && /อัศวินโต๊ะกลม/.test(x.name));
  const st = S();
  mk(st, 'sw', 'BT05-064', 'A.hell');
  for (let i = 0; i < 10; i++) mk(st, 'd' + i, 'SD09-012', 'A.deck');
  let r = BoT.applyAction(st, { type: 'activateAbility', k: 'sw', by: 'A', seed: 1 });
  assert(r && r.deny && st.zones['A.deck'].length === 10, 'no knight → denied, no mill');
  assert(!!BoT.activatedTargetDeny(st, 'A', BoT.effectOf('BT05-064').abilities[1], 'sw'), 'activatedTargetDeny flags it (bot skips)');
  mk(st, 'kn', knight.code, 'A.avatar');
  r = BoT.applyAction(st, { type: 'activateAbility', k: 'sw', by: 'A', seed: 1 });
  assert(!(r && r.deny) && st.zones['A.deck'].length === 9, 'with knight → mill 1');
  BoT.applyAction(st, { type: 'chooseTarget', k: 'kn', by: 'A', seed: 1 });
  assert(st.inst.sw.attachedTo === 'kn', 'sword attached to knight');
  mk(st, 'sw2', 'BT06-058', 'A.hell');
  r = BoT.applyAction(st, { type: 'activateAbility', k: 'sw2', by: 'A', seed: 1 });
  assert(r && r.deny && st.zones['A.deck'].length === 9, 'Mod used this turn → 2nd sword denied');
}

console.log('--- มณโฑ ราชินีเหล่ายักษ์ ---');
{
  const yak5 = cards.find(x => x.type === 'Avatar' && x.symbol === 'ยักษ์' && +x.power === 5);
  const st = S();
  mk(st, 'm', 'BT08-038', 'A.avatar');
  mk(st, 'y5', yak5.code, 'A.avatar');
  mk(st, 'h3', 'SD09-012', 'A.hell'); // ยักษ์ P3
  let r = BoT.applyAction(st, { type: 'activateAbility', k: 'm', by: 'A', seed: 1 });
  assert(!(r && r.deny), 'activate ok');
  const c = BoT.promptCandidates(st, st.prompts[0]);
  assert(c.length === 1 && c[0] === 'm', 'only มณโฑ (P3 pair) offered for sacrifice');
  BoT.applyAction(st, { type: 'chooseTarget', k: 'm', by: 'A', seed: 1 });
  BoT.applyAction(st, { type: 'chooseTarget', k: 'h3', by: 'A', seed: 1 });
  assert(st.zones['A.avatar'].includes('h3') && BoT.effPower(st, 'h3') === 5, 'summoned P3 ยักษ์ at P5');
}
{
  const yak5 = cards.find(x => x.type === 'Avatar' && x.symbol === 'ยักษ์' && +x.power === 5);
  const st = S();
  mk(st, 'm', 'BT08-038', 'A.avatar');
  mk(st, 'h5', yak5.code, 'A.hell');
  const r = BoT.applyAction(st, { type: 'activateAbility', k: 'm', by: 'A', seed: 1 });
  assert(r && r.deny && st.zones['A.avatar'].includes('m'), 'no matching hell ยักษ์ → denied, มณโฑ stays');
}
console.log('ALL PASS');
