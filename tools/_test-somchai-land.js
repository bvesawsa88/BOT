/* สมชาย ห้องเช่าถูกๆ: +2 เฉพาะ กุ่ย/ฮอล/นาย ตอนโจมตี — ไม่บัฟใบอื่นบนสนาม */
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
    phase: 'Battle', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
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
function logs(st) { return (st.log || []).map(x => x.t || x.msg || '').join('\n'); }
function hasLandBuffLog(st, name) {
  return (st.log || []).some(x => {
    const t = x.t || x.msg || '';
    return t.includes('สมชาย ห้องเช่าถูกๆ') && t.includes(name) && t.includes('+2');
  });
}

{
  const st = emptyState();
  put(st, 'land', 'SD02-020', { controller: 'A', subtype: 'Land' });
  const guy = put(st, 'A.avatar', 'SD02-001');
  const other = put(st, 'A.avatar', 'SD02-006'); // ครูภาษาไทย — ไม่ใช่เทค
  const foe = put(st, 'B.avatar', 'SD01-003');
  put(st, 'A.deck', 'SD02-007');
  put(st, 'B.deck', 'SD01-004');

  const pOther = BoT.effPower(st, other);
  ok(pOther === (+st.inst[other].power || 0), 'non-tech not static-buffed by land');

  const fx = BoT.applyAction(st, { type: 'declareAttack', atk: guy, def: foe, by: 'A', seed: 1 });
  ok(!fx.deny, 'กุ่ย can declare attack: ' + (fx.deny || 'ok'));
  ok(hasLandBuffLog(st, 'กุ่ย'), 'log: กุ่ย +2 from land\n' + logs(st));
  ok(!hasLandBuffLog(st, st.inst[other].name), 'log: non-tech not buffed');
}

{
  const st = emptyState();
  put(st, 'land', 'SD02-020', { controller: 'A', subtype: 'Land' });
  const teacher = put(st, 'A.avatar', 'SD02-006');
  const foe = put(st, 'B.avatar', 'SD01-003');
  put(st, 'A.deck', 'SD02-007');
  put(st, 'B.deck', 'SD01-004');
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk: teacher, def: foe, by: 'A', seed: 2 });
  ok(!fx.deny, 'ครู can declare attack: ' + (fx.deny || 'ok'));
  ok(!hasLandBuffLog(st, st.inst[teacher].name), 'non-tech attacker gets no land +2\n' + logs(st));
}

{
  const st = emptyState();
  put(st, 'land', 'SD02-020', { controller: 'A', subtype: 'Land' });
  const hol = put(st, 'A.avatar', 'SD02-002');
  const foe = put(st, 'B.avatar', 'SD01-003');
  put(st, 'A.deck', 'SD02-007');
  put(st, 'B.deck', 'SD01-004');
  BoT.applyAction(st, { type: 'declareAttack', atk: hol, def: foe, by: 'A', seed: 3 });
  ok(hasLandBuffLog(st, 'ฮอล'), 'ฮอล gets +2 on attack');
}

{
  const st = emptyState();
  put(st, 'land', 'SD02-020', { controller: 'A', subtype: 'Land' });
  const nai = put(st, 'A.avatar', 'SD02-003');
  const foe = put(st, 'B.avatar', 'SD01-003');
  put(st, 'A.deck', 'SD02-007');
  put(st, 'B.deck', 'SD01-004');
  BoT.applyAction(st, { type: 'declareAttack', atk: nai, def: foe, by: 'A', seed: 4 });
  ok(hasLandBuffLog(st, 'นาย'), 'นาย gets +2 on attack');
}

console.log('ALL PASS');
