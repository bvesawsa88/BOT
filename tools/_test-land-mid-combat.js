/* แลนด์ถูกทำลายระหว่างโจมตี: มะเฟืองเสียเตะไข่ต้องเลือกเป้าใหม่ · สามัคคีออร่าหลุด */
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

/* 1) มะเฟืองเตะไข่ → ทำลายแลนด์ระหว่างโจมตี → ต้องเลือกเป้าใหม่ */
{
  const st = emptyState();
  const land = put(st, 'land', 'BT09-071', { controller: 'A', subtype: 'Land' });
  const star = put(st, 'A.avatar', 'BT09-038');
  const foe = put(st, 'B.avatar', 'SD01-003');
  const life = put(st, 'B.life', 'SD01-001', { faceUp: false, type: 'Avatar' });
  ok(BoT.hasKw(st, star, 'เตะไข่'), 'มะเฟืองมีเตะไข่ตอนมีป่า + LIFE คว่ำ');
  st.pending = { kind: 'life', atk: star, def: null, life: life, by: 'A', target: 'B', held: true };
  const fx = BoT.applyAction(st, { type: 'move', k: land, to: 'A.hell', by: 'A' });
  ok(!fx.deny, 'ย้ายแลนด์ลงนรกได้' + (fx.deny ? ': ' + fx.deny : ''));
  ok(!BoT.hasKw(st, star, 'เตะไข่'), 'เสียเตะไข่หลังแลนด์หาย');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.dest === 'retargetAttack', 'มีหน้าต่างเลือกเป้าโจมตีใหม่');
  ok(pr && pr.chooser === 'A', 'ผู้โจมตีเป็นคนเลือกเป้าใหม่');
  ok(pr && (pr.ids || []).includes(foe), 'เป้าใหม่รวม Avatar ศัตรู');
  const pick = BoT.applyAction(st, { type: 'chooseTarget', k: foe, by: 'A' });
  ok(!pick.deny, 'เลือกเป้าใหม่ได้' + (pick.deny ? ': ' + pick.deny : ''));
  ok(st.pending && st.pending.def === foe && !st.pending.life, 'pending ชี้ Avatar ศัตรู ไม่ใช่ LIFE');
}

/* 2) ภูติสามัคคีแล้วตี → ทำลายแลนด์ → พาวเหลือค่าตั้งต้น ผู้ให้นอนแล้วไม่บวก */
{
  const st = emptyState();
  const land = put(st, 'land', 'BT09-071', { controller: 'A', subtype: 'Land' });
  const recv = put(st, 'A.avatar', 'BT09-038');
  const giver = put(st, 'A.avatar', 'BT09-036');
  put(st, 'B.avatar', 'SD01-003');
  ok(BoT.hasKw(st, giver, 'สามัคคี'), 'ภูติได้สามัคคีจากออร่าป่า');
  const printed = +st.inst[recv].power || 0;
  const withAura = BoT.effPower(st, recv);
  ok(withAura === printed + 2, `ออร่าป่า +2 (พิมพ์ ${printed} → ${withAura})`);
  const uni = BoT.applyAction(st, { type: 'unity', k: giver, to: recv, by: 'A' });
  ok(!uni.deny, 'สามัคคีได้' + (uni.deny ? ': ' + uni.deny : ''));
  ok(st.inst[giver].tapped, 'ผู้ให้นอนแล้ว');
  const boosted = BoT.effPower(st, recv);
  ok(boosted > withAura, `หลังสามัคคีพลังขึ้น (${withAura} → ${boosted})`);
  const fx = BoT.applyAction(st, { type: 'move', k: land, to: 'A.hell', by: 'A' });
  ok(!fx.deny, 'ทำลายแลนด์ได้' + (fx.deny ? ': ' + fx.deny : ''));
  ok(!BoT.hasKw(st, giver, 'สามัคคี'), 'ผู้ให้เสียสามัคคีหลังแลนด์หาย');
  ok(st.inst[giver].tapped, 'ผู้ให้ยังนอนอยู่');
  const after = BoT.effPower(st, recv);
  ok(after === printed, `เหลือแค่พาวตั้งต้น ${printed} (ได้ ${after}) — ออร่าและสามัคคีหลุด`);
}

console.log('all ok');
