/* BT06-031 งี่เง่า และ งอแง — กด ⚡ แล้วขึ้นกล่องเลือกเทค 2 อัน */
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
    mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
}
function put(st, zone, code) {
  const c = byCode(code);
  if (!c) throw new Error('missing ' + code);
  const n = Object.keys(st.inst).length + 1;
  const k = 't' + n;
  st.inst[k] = {
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', cost: c.cost, gem: c.gem, power: c.power,
    effect: c.effect || '—', img: '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  };
  st.zones[zone].push(k);
  return k;
}
function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }

{
  const e = BoT.effectOf('BT06-031', 'งี่เง่า และ งอแง');
  const ab = ((e && e.abilities) || []).find(x => x.trigger && x.trigger.on === 'activated');
  ok(!!ab, 'BT06-031 has activated (⚡ on card)');
  ok(!!(ab.actions || []).some(a => a.op === 'chooseMode' && (a.options || []).length === 2),
    'activated opens 2-tech chooseMode');
}

{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'BT06-031');
  let fx = BoT.applyAction(st, { type: 'activateAbility', k, by: 'A', seed: 1 });
  if (fx.deny) fail('activate deny: ' + fx.deny);
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseMode' && pr.src === k, 'after ⚡: choose-tech prompt');
  ok((pr.options || []).length === 2, 'two tech boxes');

  fx = BoT.applyAction(st, { type: 'chooseMode', k, opt: 1, by: 'A', seed: 2 });
  if (fx.deny) fail('mode 2 deny: ' + fx.deny);
  ok((st.inst[k].grantedKeywords || []).some(g => g.kw === 'เตะไข่'), 'mode 2 grants เตะไข่ after pick');
}

{
  const st = emptyState();
  const k = put(st, 'A.avatar', 'BT06-031');
  BoT.applyAction(st, { type: 'activateAbility', k, by: 'A', seed: 1 });
  const fx = BoT.applyAction(st, { type: 'chooseMode', k, opt: 0, by: 'A', seed: 2 });
  if (fx.deny) fail('mode 1 deny: ' + fx.deny);
  ok(BoT.zoneOf(st, k) === 'A.hell', 'mode 1 sacrificeSelf to hell');
}

console.log('all ok');
