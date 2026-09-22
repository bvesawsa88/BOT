const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const effs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8'));
BoT.loadEffects(effs);

function test(title, fn) {
  try {
    fn();
    console.log(`✔ PASS: ${title}`);
  } catch (err) {
    console.error(`✖ FAIL: ${title}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function emptyState() {
  const st = BoT.buildInitialState(['A', 'B'], cards);
  st.turn = 2;
  st.mulliganDone = { A: true, B: true };
  st.phase = 'Main';
  st.active = 'A';
  return st;
}

function put(st, zone, code) {
  const c = cards.find(x => x.code === code);
  if (!c) throw new Error(`Card code ${code} not found`);
  const id = `inst_${Math.random().toString(36).substr(2, 9)}`;
  const inst = Object.assign({}, c, { id, k: id, cardOwner: zone[0], faceUp: true, tapped: false, attachedTo: null });
  st.inst[id] = inst;
  if (!st.zones[zone]) st.zones[zone] = [];
  st.zones[zone].push(id);
  return id;
}

console.log('=== Running User Bug Fix Tests ===\n');

// Test 1: Arthur uniqueOnField check
test('BT06-006 Arthur cannot be summoned if another Arthur is already on field', () => {
  const st = emptyState();
  const arthur1 = put(st, 'A.avatar', 'BT06-006');
  const arthur2 = put(st, 'A.hand', 'BT06-006');

  // Try to summon second Arthur
  const res = BoT.applyAction(st, { type: 'summon', k: arthur2, by: 'A', to: 'A.avatar', free: true });
  if (!res.deny || !res.deny.includes('ควบคุม "อาเธอร์ ราชาแห่งอัศวินโต๊ะกลม"')) {
    throw new Error(`Expected deny message for second Arthur, got: ${res.deny || JSON.stringify(res)}`);
  }
});

test('BT06-006 Arthur Juti deck pick excludes Arthur if Arthur is already on field', () => {
  const st = emptyState();
  const arthurOnField = put(st, 'A.avatar', 'BT06-006');
  const arthurInDeck = put(st, 'A.deck', 'BT06-006');
  const lancelotInDeck = put(st, 'A.deck', 'BT05-014'); // Lancelot

  const p = {
    kind: 'pick',
    from: 'deckAll',
    src: arthurOnField,
    chooser: 'A',
    filter: { type: 'Avatar', nameIncludes: ['อัศวินโต๊ะกลม'] },
    dest: 'avatar'
  };

  const candidates = BoT.promptCandidates(st, p);
  if (candidates.includes(arthurInDeck)) {
    throw new Error('Arthur in deck should be filtered out when Arthur is already on field');
  }
  if (!candidates.includes(lancelotInDeck)) {
    throw new Error('Lancelot in deck should be selectable');
  }
});

// Test 2: Sword / Modification attachment limit
test('Attaching a Modification card marks Modification as used and blocks second attach', () => {
  const st = emptyState();
  const monkey = put(st, 'A.avatar', 'SD09-001'); // หนุมาน วานรวายุ
  const sword1 = put(st, 'A.magic', 'SD09-019'); // ดาบพระขรรค์ (Modification - attachOnly: วานร)
  const sword2 = put(st, 'A.magic', 'SD09-019');

  // First attach
  const res1 = BoT.applyAction(st, { type: 'attach', k: sword1, to: monkey, by: 'A' });
  if (res1.deny) throw new Error(`First attach failed: ${res1.deny}`);

  // Second attach in same turn
  const res2 = BoT.applyAction(st, { type: 'attach', k: sword2, to: monkey, by: 'A' });
  if (!res2.deny || !res2.deny.includes('เทิร์นนี้ใช้ Modification Magic ไปแล้ว')) {
    throw new Error(`Expected second attach to be denied, got: ${res2.deny || JSON.stringify(res2)}`);
  }
});

// Test 3: City of Luoyang (SD07-019) 4-color requirement & Columbus
test('SD07-019 City of Luoyang gives +0 POWER with <4 colors, +2 POWER with 4 colors', () => {
  const st = emptyState();
  const luoyang = put(st, 'land', 'SD07-019');
  
  // 1 Red Avatar (SD01-001)
  const redAv = put(st, 'A.avatar', 'SD01-001'); // Red
  let p1 = BoT.effPower(st, redAv);
  const baseRedP = st.inst[redAv].power;
  if (p1 !== baseRedP) throw new Error(`Expected POWER ${baseRedP} with only 1 color, got ${p1}`);

  // Add Blue (SD02-001), Green (SD04-001), Purple (SD03-001)
  put(st, 'A.avatar', 'SD02-001'); // Blue
  put(st, 'A.avatar', 'SD04-001'); // Green
  put(st, 'A.avatar', 'SD03-001'); // Purple

  let p2 = BoT.effPower(st, redAv);
  if (p2 !== baseRedP + 2) throw new Error(`Expected POWER ${baseRedP + 2} with 4 colors, got ${p2}`);
});

test('SD07-019 City of Luoyang gives +2 POWER when Columbus (allColors) is on avatar zone', () => {
  const st = emptyState();
  const luoyang = put(st, 'land', 'SD07-019');
  
  const columbus = put(st, 'A.avatar', 'BT05-016'); // โคลัมบัส (allColors)
  const baseColP = st.inst[columbus].power;

  let p = BoT.effPower(st, columbus);
  if (p !== baseColP + 2) throw new Error(`Expected Columbus to get +2 POWER from Luoyang, got ${p}`);
});

test('BT10-029 Sigurd: activatedFromHell, static aura, and field ability', () => {
  // Test 1: activatedFromHell
  const st1 = emptyState();
  for (let i = 0; i < 15; i++) put(st1, 'A.deck', 'SD01-007');
  const sigurdHell = put(st1, 'A.hell', 'BT10-029');

  let res = BoT.applyAction(st1, { type: 'activateAbility', k: sigurdHell, by: 'A' });
  if (!res || !res.deny || !res.deny.includes('บรุนฮิลด์')) {
    throw new Error('Should deny without Brunhild');
  }

  put(st1, 'A.avatar', 'BT05-027'); // Brunhild
  const deckBefore = st1.zones['A.deck'].length;
  res = BoT.applyAction(st1, { type: 'activateAbility', k: sigurdHell, by: 'A' });
  if (res && res.deny) throw new Error('Should not deny: ' + res.deny);
  if (st1.zones['A.deck'].length !== deckBefore - 9) throw new Error('Deck should have 9 cards milled');
  if (BoT.zoneOf(st1, sigurdHell) !== 'A.avatar') throw new Error('Sigurd should be on A.avatar');

  // Test 2: static aura
  const st2 = emptyState();
  const sigurdField = put(st2, 'A.avatar', 'BT10-029');
  const valkOther = put(st2, 'A.avatar', 'BT06-027');
  const brunhild2 = put(st2, 'A.avatar', 'BT05-027');
  const unrelated = put(st2, 'A.avatar', 'SD01-007');

  if (BoT.effPower(st2, valkOther) !== st2.inst[valkOther].power + 1) throw new Error('Valkyrie should have +1 power');
  if (BoT.effPower(st2, brunhild2) !== st2.inst[brunhild2].power + 2) throw new Error('Brunhild should have +2 power');
  if (BoT.effPower(st2, unrelated) !== st2.inst[unrelated].power) throw new Error('Unrelated avatar should have +0 power');

  // Test 3: field ability
  const st3 = emptyState();
  const sigurd3 = put(st3, 'A.avatar', 'BT10-029');
  const vHell1 = put(st3, 'A.hell', 'BT06-027');
  const vHell2 = put(st3, 'A.hell', 'BT06-028');
  const vDeckTop = put(st3, 'A.deck', 'BT06-029');
  for (let i = 0; i < 5; i++) put(st3, 'A.deck', 'SD01-007');
  const oppAv1 = put(st3, 'B.avatar', 'SD01-003'); // cost 2

  res = BoT.applyAction(st3, { type: 'activateAbility', k: sigurd3, by: 'A' });
  if (!st3.prompts[0] || st3.prompts[0].dest !== 'sigurdReturnHell') throw new Error('Expected sigurdReturnHell prompt');
  BoT.applyAction(st3, { type: 'chooseTarget', k: vHell1, by: 'A' });
  BoT.applyAction(st3, { type: 'skipPrompt', by: 'A' });
  if (!st3.prompts[0] || st3.prompts[0].dest !== 'sigurdDestroyEnemy') throw new Error('Expected sigurdDestroyEnemy prompt');
  BoT.applyAction(st3, { type: 'chooseTarget', k: oppAv1, by: 'A' });
  if (BoT.zoneOf(st3, oppAv1) !== 'B.hell') throw new Error('oppAv1 should be in B.hell');
});

