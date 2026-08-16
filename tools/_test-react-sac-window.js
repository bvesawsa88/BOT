/* ไปคุยกับรากมะม่วง / เพื่อชาติ — ไม่ยื่นให้ใช้ถ้าไม่มีเป้าเซ่นบนสนาม */
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
    phase: 'Battle', active: 'A', turn: 2, turnSeq: 2,
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
function names(st, ids) { return (ids || []).map(k => (st.inst[k] && st.inst[k].name) || k); }

{
  const st = emptyState();
  const atk = put(st, 'A.avatar', 'SD01-003');
  const mangoReact = put(st, 'B.hand', 'BT10-063');
  const nation = put(st, 'B.hand', 'SD04-017');
  st.pending = { atk, def: null, life: true, target: 'B', by: 'A' };
  const opts = BoT.attackReactOptions(st, 'B');
  ok(!opts.includes(mangoReact), 'no mango on field → hide ไปคุยกับรากมะม่วง: ' + names(st, opts).join(','));
  ok(!opts.includes(nation), 'no tank on field → hide เพื่อชาติ: ' + names(st, opts).join(','));
}

{
  const st = emptyState();
  const atk = put(st, 'A.avatar', 'SD01-003');
  const mango = put(st, 'B.avatar', 'BT09-036', { symbol: 'ต้นไม้' });
  const mangoReact = put(st, 'B.hand', 'BT10-063');
  const nation = put(st, 'B.hand', 'SD04-017');
  st.pending = { atk, def: mango, target: 'B', by: 'A' };
  const opts = BoT.attackReactOptions(st, 'B');
  ok(opts.includes(mangoReact), 'mango on field → show ไปคุยกับรากมะม่วง: ' + names(st, opts).join(','));
  ok(!opts.includes(nation), 'mango only → still hide เพื่อชาติ: ' + names(st, opts).join(','));
}

{
  const st = emptyState();
  const atk = put(st, 'A.avatar', 'SD01-003');
  const tank = put(st, 'B.avatar', 'BT05-048');
  const mangoReact = put(st, 'B.hand', 'BT10-063');
  const nation = put(st, 'B.hand', 'SD04-017');
  st.pending = { atk, def: tank, target: 'B', by: 'A' };
  const opts = BoT.attackReactOptions(st, 'B');
  ok(opts.includes(nation), 'tank on field → show เพื่อชาติ: ' + names(st, opts).join(','));
  ok(!opts.includes(mangoReact), 'tank only → still hide ไปคุยกับรากมะม่วง: ' + names(st, opts).join(','));
}

{
  const st = emptyState();
  st.phase = 'Main';
  st.active = 'A';
  put(st, 'B.avatar', 'SD01-011');
  const mangoReact = put(st, 'B.hand', 'BT10-063');
  const fx = BoT.applyAction(st, { type: 'playMagic', k: mangoReact, by: 'B', seed: 1 });
  ok(fx.deny && /มะม่วง|เซ่น/.test(fx.deny), 'play mango react without mango denies: ' + (fx.deny || 'no deny'));
  ok(BoT.zoneOf(st, mangoReact) === 'B.hand', 'mango react stays in hand after deny');
}

console.log('react-sac-window ok');
