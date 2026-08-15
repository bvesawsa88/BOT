/* focused: นักท่องเรื่องราว / Skill — evolve, grant, extra react, hypersense */
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
function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); }
function apply(st, a) { return BoT.applyAction(st, a); }
function zone(st, k) { return BoT.zoneOf(st, k); }
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser });
    if (fx.deny) throw new Error('FAIL: negate skip: ' + fx.deny);
  }
}

/* 1) ขวัญตา evolve → เนรเทศตัวเอง จั่ว 1 อัญเชิญนาคแล้วได้ grant */
{
  const st = emptyState();
  const exp = put(st, 'A.avatar', 'BT09-042');
  const naga = put(st, 'A.hand', 'BT09-043');
  const deckCard = put(st, 'A.deck', 'BT09-056');
  const fx = apply(st, { type: 'activateAbility', k: exp, by: 'A' });
  ok(!fx.deny, 'evolve activate: ' + (fx.deny || ''));
  ok(st.prompts.length === 1 && st.prompts[0].dest === 'storyEvolve', 'prompt storyEvolve');
  apply(st, { type: 'chooseTarget', k: naga, by: 'A' });
  ok(zone(st, exp) === 'A.dark', 'explorer exiled to dark');
  ok(zone(st, naga) === 'A.avatar', 'naga summoned');
  ok(zone(st, deckCard) === 'A.hand', 'drew 1 on exile');
  ok((st.inst[naga].granted || []).length >= 1, 'naga granted abilities');
  ok(BoT.effPower(st, naga) === 0, 'naga base P0 before hell magics');
}

/* 2) นาค POWER +1 ต่อ Magic ในนรกทุก 2 ใบ */
{
  const st = emptyState();
  const naga = put(st, 'A.avatar', 'BT09-043');
  st.inst[naga].granted = [{
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    actions: [{
      op: 'modifyPower', amountPer: 'ownHellTypePerN', hellType: 'Magic', perN: 2, per: 1,
      layer: 3, target: { select: 'self' }
    }]
  }];
  put(st, 'A.hell', 'BT09-056');
  put(st, 'A.hell', 'BT09-059');
  put(st, 'A.hell', 'BT09-060');
  put(st, 'A.hell', 'BT01-038');
  ok(BoT.effPower(st, naga) === 2, 'naga +2 from 4 magic in hell');
}

/* 3) มายา evolve ให้ POWER +1 */
{
  const st = emptyState();
  const maya = put(st, 'A.avatar', 'BT11-048');
  const bolt = put(st, 'A.hand', 'BT11-049');
  apply(st, { type: 'activateAbility', k: maya, by: 'A' });
  apply(st, { type: 'chooseTarget', k: bolt, by: 'A' });
  ok(zone(st, maya) === 'A.dark', 'maya explorer exiled');
  ok(zone(st, bolt) === 'A.avatar', 'bolt summoned');
  ok((st.inst[bolt].powerDelta || 0) === 1, 'maya evolve +1 power');
  ok(BoT.effPower(st, bolt) === 4, 'bolt 3+1');
}

/* 4) Hypersense: สนามเรื่องราวทั้งหมด → nullify */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT09-043');
  const hyper = put(st, 'A.hand', 'BT09-059');
  const enemy = put(st, 'B.avatar', 'BT09-042');
  put(st, 'B.hand', 'BT09-043');
  st.phase = 'Main';
  st.active = 'B';
  apply(st, { type: 'activateAbility', k: enemy, by: 'B' });
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper), 'hypersense offered on enemy activate');
  apply(st, { type: 'reactYes', k: hyper, by: 'A' });
  ok(!!st.inst[enemy].nullifyUntilEOT, 'enemy nullified until EOT');
}

/* 5) Extra Skill React จากครุฑ */
{
  const st = emptyState();
  const garuda = put(st, 'A.avatar', 'BT09-044');
  st.inst[garuda].granted = [{
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    extraReactSkillUnusedName: true,
    actions: []
  }];
  put(st, 'A.hand', 'BT01-039'); // เจ้ากล้า — ใช้ React โควต้าแรก
  const hyper = put(st, 'A.hand', 'BT09-059');
  put(st, 'A.avatar', 'BT09-043');
  const enemy = put(st, 'B.avatar', 'BT09-042');
  put(st, 'B.hand', 'BT09-043');
  st.magicUsed.A.React = true;
  st._reactNamesUsed = { A: ['เจ้ากล้าดียังไง'] };
  st.phase = 'Main';
  st.active = 'B';
  apply(st, { type: 'activateAbility', k: enemy, by: 'B' });
  const react = (st.prompts || []).find(p => p.kind === 'react' && p.abilityReact);
  ok(react && react.options && react.options.includes(hyper), 'extra skill react still offered after react used');
}

/* 6) Full Drive: นรก Magic 8 → จั่ว */
{
  const st = emptyState();
  const fd = put(st, 'A.hand', 'BT09-056');
  const story = put(st, 'A.deck', 'BT09-043');
  const draw = put(st, 'A.deck', 'BT01-038');
  for (let i = 0; i < 8; i++) put(st, 'A.hell', 'BT09-059');
  apply(st, { type: 'playMagic', k: fd, by: 'A' });
  skipNegate(st);
  ok(st.prompts.length && st.prompts[0].kind === 'chooseMode', 'full drive chooseMode');
  apply(st, { type: 'chooseMode', k: fd, opt: 0, by: 'A' });
  const pick = (st.prompts || []).find(p => p.kind === 'pick');
  ok(pick, 'full drive deck pick');
  apply(st, { type: 'chooseTarget', k: story, by: 'A' });
  ok(zone(st, story) === 'A.hand', 'story to hand');
  ok(zone(st, draw) === 'A.hand', 'drew because 8 magic in hell');
}

console.log('all story deck tests passed');
