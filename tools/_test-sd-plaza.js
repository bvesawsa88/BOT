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

console.log('--- Test 1: Activating SD Plaza creates chooseMode prompt ---');
{
  const st = emptyState();
  const sd = put(st, 'land', 'CC01-050', { controller: 'A' });
  const h1 = put(st, 'A.hand', 'BT01-001');
  const d1 = put(st, 'A.deck', 'BT10-040');
  const d2 = put(st, 'A.deck', 'BT10-041');
  const d3 = put(st, 'A.deck', 'BT10-042');
  const m1 = put(st, 'A.magic', 'BT02-036');

  const fx = BoT.applyAction(st, { type: 'activateAbility', k: sd, by: 'A' });
  if (fx.deny) throw new Error('Activate denied: ' + fx.deny);

  if (!st.prompts.length || st.prompts[0].kind !== 'chooseMode') {
    throw new Error('Expected prompt of kind chooseMode, got: ' + JSON.stringify(st.prompts));
  }
  const opts = st.prompts[0].options;
  if (!opts || opts.length !== 2) {
    throw new Error('Expected 2 options in chooseMode, got: ' + (opts ? opts.length : 0));
  }
  console.log('OK: chooseMode prompt created with 2 options');
  console.log('Opt 1:', opts[0].label);
  console.log('Opt 2:', opts[1].label);

  // Test Option 1: Discard 1 hand -> Scout 3 -> Put Avatar to Magic Zone
  console.log('\n--- Test Option 1 (Discard 1 -> Scout 3 -> Magic Zone) ---');
  const fxOpt1 = BoT.applyAction(st, { type: 'chooseMode', k: sd, opt: 0, by: 'A' });
  if (fxOpt1.deny) throw new Error('Option 1 denied: ' + fxOpt1.deny);

  if (!st.prompts.length || st.prompts[0].kind !== 'chooseDiscard') {
    throw new Error('Expected prompt of kind chooseDiscard, got: ' + JSON.stringify(st.prompts));
  }
  console.log('OK: chooseDiscard prompt created for cost');

  // Discard h1
  const fxDisc = BoT.applyAction(st, { type: 'chooseTarget', k: h1, by: 'A' });
  if (fxDisc.deny) throw new Error('Discard denied: ' + fxDisc.deny);
  if (BoT.zoneOf(st, h1) !== 'A.hell') throw new Error('h1 should be in hell');
  console.log('OK: h1 discarded to hell');

  // Next prompt should be scout pick
  if (!st.prompts.length || st.prompts[0].kind !== 'pick') {
    throw new Error('Expected scout pick prompt, got: ' + JSON.stringify(st.prompts));
  }
  const scoutPrompt = st.prompts[0];
  console.log('Scout candidates:', scoutPrompt.ids);
  if (!scoutPrompt.ids.includes(d3)) throw new Error('d3 should be in scouted cards');

  // Choose d3 to put on Magic Zone
  const fxPick = BoT.applyAction(st, { type: 'chooseTarget', k: d3, by: 'A' });
  if (fxPick.deny) throw new Error('Pick denied: ' + fxPick.deny);

  if (BoT.zoneOf(st, d3) !== 'A.magic') throw new Error('d3 should be in A.magic, was in ' + BoT.zoneOf(st, d3));
  if (st.inst[d3].tapped) throw new Error('d3 should be untapped (in active state)');
  console.log('OK: d3 placed in A.magic untapped');
}

console.log('\n--- Test 2: Option 2 (Summon from Magic Zone) ---');
{
  const st = emptyState();
  const sd = put(st, 'land', 'CC01-050', { controller: 'A' });
  const m1 = put(st, 'A.magic', 'BT10-041'); // นักรบทองแห่งภาคีมะม่วง

  const fx = BoT.applyAction(st, { type: 'activateAbility', k: sd, by: 'A' });
  if (fx.deny) throw new Error('Activate denied: ' + fx.deny);

  // Choose Option 2 (index 1)
  const fxOpt2 = BoT.applyAction(st, { type: 'chooseMode', k: sd, opt: 1, by: 'A' });
  if (fxOpt2.deny) throw new Error('Option 2 denied: ' + fxOpt2.deny);

  if (!st.prompts.length || st.prompts[0].kind !== 'pick') {
    throw new Error('Expected magic pick prompt, got: ' + JSON.stringify(st.prompts));
  }
  const pickPrompt = st.prompts[0];
  if (pickPrompt.from !== 'ownMagic') throw new Error('Expected from ownMagic');
  console.log('OK: magic pick prompt created');

  // Select m1 to summon
  const fxPickM = BoT.applyAction(st, { type: 'chooseTarget', k: m1, by: 'A' });
  if (fxPickM.deny) throw new Error('Pick m1 denied: ' + fxPickM.deny);

  if (BoT.zoneOf(st, m1) !== 'A.avatar') throw new Error('m1 should be in A.avatar, was ' + BoT.zoneOf(st, m1));
  if (st.inst[m1].tapped) throw new Error('m1 should be untapped');
  console.log('OK: m1 summoned from magic zone to avatar zone untapped');
}

console.log('\nALL SD PLAZA TESTS PASSED SUCCESSFULLY!');
