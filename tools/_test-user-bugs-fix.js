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
