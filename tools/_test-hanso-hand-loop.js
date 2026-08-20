/* focused: ฮันโซ นินจาในตำนาน — สั่งใช้จากมือโดยไม่มีนินจาบนสนามต้อง deny ไม่เคลม once-per-turn */
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
    phase: 'Main', active: 'B', turn: 5, turnSeq: 5,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
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
function logText(st) {
  return (st.log || []).map(x => (x && x.msg) || x || '').join('\n');
}

/* 1) ไม่มีนินจาบนสนาม — deny ก่อนรันเอฟเฟกต์ ห้ามสแปม log สั่งใช้ */
{
  const st = emptyState();
  const hanso = put(st, 'B.hand', 'BT10-005');
  const ab = ((BoT.effectOf(st.inst[hanso].code, st.inst[hanso].name) || {}).abilities || [])
    .find(x => x.trigger && x.trigger.on === 'activatedFromHand');
  const denyPre = BoT.activatedTargetDeny(st, 'B', ab, hanso);
  ok(!!denyPre && /สนาม/.test(denyPre), 'activatedTargetDeny: ไม่มีนินจา — ' + denyPre);

  const fx1 = BoT.applyAction(st, { type: 'activateAbility', k: hanso, by: 'B', seed: 1 });
  ok(!!fx1.deny && /สนาม/.test(fx1.deny), 'activate deny ไม่มีนินจา: ' + fx1.deny);
  ok(!(st.prompts || []).length, 'ไม่มี prompt หลัง deny');
  ok(!(st.zones['B.avatar'] || []).includes(hanso), 'ฮันโซยังอยู่ในมือ');
  ok(!/⚡ สั่งใช้จากมือ/.test(logText(st)), 'deny แล้วไม่ log สั่งใช้จากมือ');

  const fx2 = BoT.applyAction(st, { type: 'activateAbility', k: hanso, by: 'B', seed: 2 });
  ok(!!fx2.deny && /สนาม/.test(fx2.deny), 'ลองซ้ำยัง deny เงื่อนไขสนาม ไม่ใช่ once-per-turn');
  ok(!/ใช้ความสามารถชื่อนี้ไปแล้ว/.test(fx2.deny || ''), 'ยังไม่เคลม once-per-turn');
}

/* 2) deny แล้วมีนินจาทีหลัง — ยังสั่งใช้ได้ในเทิร์นเดียวกัน */
{
  const st = emptyState();
  const hanso = put(st, 'B.hand', 'BT10-005');
  const fx1 = BoT.applyAction(st, { type: 'activateAbility', k: hanso, by: 'B', seed: 3 });
  ok(!!fx1.deny, 'deny รอบแรกไม่มีนินจา');
  const ninja = put(st, 'B.avatar', 'BT05-045');
  const fx2 = BoT.applyAction(st, { type: 'activateAbility', k: hanso, by: 'B', seed: 4 });
  if (fx2.deny) fail('มีนินจาแล้วต้องใช้ได้: ' + fx2.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'ninjaBounceSummon', 'prompt เด้งนินจา: ' + (pr && pr.dest));
  ok((pr.ids || []).includes(ninja), 'เป้าคือ นินจาไร้นาม');
}

/* 3) มีนินจา — เด้งแล้วอัญเชิญฮันโซ */
{
  const st = emptyState();
  const ninja = put(st, 'B.avatar', 'BT05-045');
  const hanso = put(st, 'B.hand', 'BT10-005');
  let fx = BoT.applyAction(st, { type: 'activateAbility', k: hanso, by: 'B', seed: 5 });
  if (fx.deny) fail('activate มีนินจา deny: ' + fx.deny);
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: ninja, by: 'B', seed: 6 });
  if (fx.deny) fail('pick ninja deny: ' + fx.deny);
  ok(BoT.zoneOf(st, ninja) === 'B.hand', 'นินจาเด้งขึ้นมือ');
  ok(BoT.zoneOf(st, hanso) === 'B.avatar', 'ฮันโซลงสนาม');
}

console.log('all ok');
