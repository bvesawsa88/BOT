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
    phase: 'Main', active: 'B', turn: 2, turnSeq: 2,
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

const st = emptyState();
// Player A Land: BT11-070
const landK = put(st, 'land', 'BT11-070', { controller: 'A' });

// Player A Mango Avatar: BT10-041 (นักรบทองแห่งภาคีมะม่วง)
const avMango = put(st, 'A.avatar', 'BT10-041');

// Player A non-mango Avatar: BT01-001 (อัศวินผู้พิทักษ์)
const avOther = put(st, 'A.avatar', 'BT01-001');

console.log('--- Case 1: 0 mangoes in Magic Zone ---');
let cands = BoT.promptCandidates(st, {
  kind: 'pick', from: 'enemyAvatars', chooser: 'B', src: 'opp_card'
});
console.log('Candidates for B pick (0 mangoes):', cands);
if (!cands.includes(avMango)) {
  console.error('FAIL: avMango should be targetable with 0 mangoes');
  process.exit(1);
}

console.log('--- Case 2: 2 mango cards in Magic Zone ---');
put(st, 'A.magic', 'BT02-036'); // ต้นมะม่วง 1
put(st, 'A.magic', 'BT02-036'); // ต้นมะม่วง 2

cands = BoT.promptCandidates(st, {
  kind: 'pick', from: 'enemyAvatars', chooser: 'B', src: 'opp_card'
});
console.log('Candidates for B pick (2 mangoes):', cands);
if (!cands.includes(avMango)) {
  console.error('FAIL: avMango should be targetable with 2 mangoes');
  process.exit(1);
}

console.log('--- Case 3: 3 mango cards in Magic Zone ---');
put(st, 'A.magic', 'BT02-036'); // ต้นมะม่วง 3

cands = BoT.promptCandidates(st, {
  kind: 'pick', from: 'enemyAvatars', chooser: 'B', src: 'opp_card'
});
console.log('Candidates for B pick (3 mangoes):', cands);
if (cands.includes(avMango)) {
  console.error('FAIL: avMango should NOT be targetable by B pick when 3 mangoes in Magic Zone!');
  process.exit(1);
}
if (!cands.includes(avOther)) {
  console.error('FAIL: avOther SHOULD still be targetable by B pick!');
  process.exit(1);
}

// chooseDestroy test
const candsDestroy = BoT.promptCandidates(st, {
  kind: 'chooseDestroy', zones: ['avatar'], side: 'enemy', chooser: 'B', src: 'opp_card'
});
console.log('Candidates for B chooseDestroy (3 mangoes):', candsDestroy);
if (candsDestroy.includes(avMango)) {
  console.error('FAIL: avMango should NOT be targetable by B chooseDestroy!');
  process.exit(1);
}
if (!candsDestroy.includes(avOther)) {
  console.error('FAIL: avOther SHOULD still be targetable by B chooseDestroy!');
  process.exit(1);
}

// chooseBuff test
const candsBuff = BoT.promptCandidates(st, {
  kind: 'chooseBuff', side: 'any', chooser: 'B', src: 'opp_card'
});
console.log('Candidates for B chooseBuff (3 mangoes):', candsBuff);
if (candsBuff.includes(avMango)) {
  console.error('FAIL: avMango should NOT be targetable by B chooseBuff!');
  process.exit(1);
}

// Player A friendly pick
const candsOwn = BoT.promptCandidates(st, {
  kind: 'pick', from: 'ownAvatars', chooser: 'A', src: 'own_card'
});
console.log('Candidates for A pick ownAvatars:', candsOwn);
if (!candsOwn.includes(avMango)) {
  console.error('FAIL: Player A should still be able to target own avMango!');
  process.exit(1);
}

// If avOther is removed, B's candidates should be empty
st.zones['A.avatar'] = [avMango];
const emptyCands = BoT.promptCandidates(st, {
  kind: 'pick', from: 'enemyAvatars', chooser: 'B', src: 'opp_card'
});
console.log('Candidates for B when only mango on field:', emptyCands);
if (emptyCands.length !== 0) {
  console.error('FAIL: candidates should be empty, no modal should open!');
  process.exit(1);
}

console.log('ALL TESTS PASSED SUCCESSFULLY!');
