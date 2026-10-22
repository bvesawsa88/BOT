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
  const st = Object.assign({
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    gems: { A: 10, B: 10 }
  }, extra || {});

  // Prepopulate deck so game does not end from empty deck
  for (let i = 0; i < 10; i++) {
    put(st, 'A.deck', 'BT01-001');
    put(st, 'B.deck', 'BT01-001');
  }
  return st;
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

console.log('--- Test 1: พระพรหม (KD01-008) summoned alone can sacrifice itself ---');
{
  const st = emptyState();
  const brahmaHand = put(st, 'A.hand', 'KD01-008'); // พระพรหม (Cost 8, ไร้สี, Symbol: เทพ)
  const apsaraHell = put(st, 'A.hell', 'KD01-009'); // นางอัปสร (Cost 3, Symbol: เทพ)

  // BT01-001 has gem: 2. We need 8 GEMs total -> 4 cards
  const gems = [];
  for (let i = 0; i < 4; i++) {
    gems.push(put(st, 'A.hand', 'BT01-001'));
  }

  // Summon พระพรหม paying cost
  const fx = BoT.applyAction(st, { type: 'summon', k: brahmaHand, to: 'A.avatar', payIds: gems, by: 'A' });
  if (fx.deny) throw new Error('Summon denied: ' + fx.deny);

  // Check prompt: sacrificeOnly
  if (!st.prompts.length || st.prompts[0].dest !== 'sacrificeOnly') {
    throw new Error('Expected sacrificeOnly prompt, got: ' + JSON.stringify(st.prompts));
  }

  const cands = BoT.promptCandidates(st, st.prompts[0]);
  if (!cands.includes(brahmaHand)) {
    throw new Error('Expected พระพรหม to be a candidate to sacrifice itself, got candidates: ' + JSON.stringify(cands));
  }
  if (cands.length !== 1) {
    throw new Error('Expected only พระพรหม as sacrifice candidate since board was empty, got: ' + JSON.stringify(cands));
  }

  // Choose to sacrifice พระพรหม itself
  const fxSac = BoT.applyAction(st, { type: 'chooseTarget', k: brahmaHand, by: 'A' });
  if (fxSac.deny) throw new Error('Sacrifice denied: ' + fxSac.deny);

  // พระพรหม should now be in Hell
  if (!st.zones['A.hell'].includes(brahmaHand)) {
    throw new Error('Expected พระพรหม to be in Hell after sacrifice');
  }
  if (st.zones['A.avatar'].includes(brahmaHand)) {
    throw new Error('Expected พระพรหม to have left Avatar Zone');
  }

  // Next prompt should be hellPick
  if (!st.prompts.length || st.prompts[0].dest !== 'avatar' || st.prompts[0].from !== 'hell') {
    throw new Error('Expected hellPick to avatar prompt, got: ' + JSON.stringify(st.prompts));
  }

  const hellCands = BoT.promptCandidates(st, st.prompts[0]);
  if (!hellCands.includes(apsaraHell)) {
    throw new Error('Expected นางอัปสร to be eligible from Hell, got: ' + JSON.stringify(hellCands));
  }
  if (hellCands.includes(brahmaHand)) {
    throw new Error('Expected พระพรหม NOT to be eligible from Hell (nameNot sacrificed), got: ' + JSON.stringify(hellCands));
  }

  // Pick นางอัปสร from Hell
  const fxPick = BoT.applyAction(st, { type: 'chooseTarget', k: apsaraHell, by: 'A' });
  if (fxPick.deny) throw new Error('Pick from Hell denied: ' + fxPick.deny);

  // นางอัปสร should now be in Avatar zone
  if (!st.zones['A.avatar'].includes(apsaraHell)) {
    throw new Error('Expected นางอัปสร on Avatar zone, got: ' + JSON.stringify(st.zones['A.avatar']));
  }
  console.log('Passed Test 1: พระพรหม successfully sacrificed itself and summoned นางอัปสร from Hell!');
}

console.log('--- Test 2: พระพรหม with another avatar can choose itself or the other avatar ---');
{
  const st = emptyState();
  const otherAvatar = put(st, 'A.avatar', 'BT01-001');
  const brahmaHand = put(st, 'A.hand', 'KD01-008');
  const gems = [];
  for (let i = 0; i < 4; i++) {
    gems.push(put(st, 'A.hand', 'BT01-001'));
  }

  const fx = BoT.applyAction(st, { type: 'summon', k: brahmaHand, to: 'A.avatar', payIds: gems, by: 'A' });
  if (fx.deny) throw new Error('Summon denied: ' + fx.deny);

  const cands = BoT.promptCandidates(st, st.prompts[0]);
  if (!cands.includes(brahmaHand) || !cands.includes(otherAvatar) || cands.length !== 2) {
    throw new Error('Expected both avatars to be candidates, got: ' + JSON.stringify(cands));
  }
  console.log('Passed Test 2: พระพรหม and other avatar are both candidates');
}

console.log('--- Test 3: อีช่า (BT04-004) CANNOT sacrifice itself (Avatar ใบอื่น) ---');
{
  const st = emptyState();
  const eshaHand = put(st, 'A.hand', 'BT04-004'); // Cost 3 (แดง)
  // BT01-001 is แดง with gem 2 -> 2 cards = 4 red GEMs (pays cost 3)
  const gems = [];
  for (let i = 0; i < 2; i++) {
    gems.push(put(st, 'A.hand', 'BT01-001'));
  }

  const fx = BoT.applyAction(st, { type: 'summon', k: eshaHand, to: 'A.avatar', payIds: gems, by: 'A' });
  if (fx.deny) throw new Error('Summon denied: ' + fx.deny);

  // Since board has no other avatars, and อีช่า cannot sacrifice itself, no sacrifice prompt should be queued
  if (st.prompts.length > 0 && st.prompts[0].dest === 'sacrificeOnly') {
    const cands = BoT.promptCandidates(st, st.prompts[0]);
    if (cands.includes(eshaHand)) {
      throw new Error('อีช่า should NOT be able to sacrifice itself!');
    }
  }
  console.log('Passed Test 3: อีช่า cannot sacrifice itself');
}

console.log('--- Test 4: อ๊บ (BT02-007) CANNOT sacrifice itself (นอกจากใบนี้) ---');
{
  const st = emptyState();
  const frogHand = put(st, 'A.hand', 'BT02-007'); // Cost 2 (แดง)
  const gems = [put(st, 'A.hand', 'BT01-001')]; // gem 2

  const fx = BoT.applyAction(st, { type: 'summon', k: frogHand, to: 'A.avatar', payIds: gems, by: 'A' });
  if (fx.deny) throw new Error('Summon denied: ' + fx.deny);

  if (st.prompts.length > 0 && st.prompts[0].dest === 'sacrificeOnly') {
    const cands = BoT.promptCandidates(st, st.prompts[0]);
    if (cands.includes(frogHand)) {
      throw new Error('อ๊บ should NOT be able to sacrifice itself!');
    }
  }
  console.log('Passed Test 4: อ๊บ cannot sacrifice itself');
}

console.log('\nAll tests passed successfully!');
