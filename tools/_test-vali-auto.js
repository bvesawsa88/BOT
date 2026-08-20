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

function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }
function apply(st, a) { return BoT.applyAction(st, a); }
function skipReact(st) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 8) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 80 + n });
    if (fx.deny) fail('reactNo: ' + fx.deny);
  }
}
function padDeck(st, side, n, code) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(put(st, side + '.deck', code || 'SD01-011', { faceUp: false }));
  return ids;
}

console.log('--- STARTING VALI DECK AUTOMATION TESTS ---');

// ==========================================
// TEST 1: BT11-073 รูปประจำบ้าน (Control Immunity Construct)
// ==========================================
{
  const st = emptyState();
  const avatarA = put(st, 'A.avatar', 'SD01-001'); // พระอิศวร
  
  // Without รูปประจำบ้าน, B can take control of A's avatar
  let fxBefore = apply(st, { type: 'takeControl', k: avatarA, by: 'B' });
  ok(!fxBefore.deny, 'B can take control before Construct is placed');
  
  // Reset state
  const st2 = emptyState();
  const avatarA2 = put(st2, 'A.avatar', 'SD01-001');
  const house = put(st2, 'A.construct', 'BT11-073'); // Place รูปประจำบ้าน
  
  // With รูปประจำบ้าน, B taking control should be denied
  let fxAfter = apply(st2, { type: 'takeControl', k: avatarA2, by: 'B' });
  ok(!!fxAfter.deny && fxAfter.deny.includes('รูปประจำบ้าน'), 'Control change is blocked by รูปประจำบ้าน: ' + fxAfter.deny);
}

// ==========================================
// TEST 2: BT07-041 คาบู ช่วยด้วย (React from hand to save symbol สัตว์)
// ==========================================
{
  const st = emptyState();
  const animal = put(st, 'A.avatar', 'BT05-048', { symbol: 'สัตว์' }); // รถถัง A003, set symbol to สัตว์
  const kabu = put(st, 'A.hand', 'BT07-041'); // คาบู ช่วยด้วย
  const costCard = put(st, 'A.hand', 'SD01-011'); // Card to discard as cost
  
  // Trigger destruction on animal avatar
  let fx = apply(st, { type: 'destroyCard', k: animal, by: 'B' });
  if (fx.deny) fail('destroy animal failed: ' + fx.deny);
  
  // Verify react prompt is shown for คาบู ช่วยด้วย
  const p = (st.prompts || [])[0];
  ok(p && p.kind === 'react' && p.reactTrigger === 'avatarWouldBeDestroyed', 'Should prompt react on destruction');
  ok(p.options.includes(kabu), 'คาบู ช่วยด้วย should be a react option');
  
  // Use React
  fx = apply(st, { type: 'reactYes', k: kabu, by: 'A' });
  if (fx.deny) fail('React yes failed: ' + fx.deny);
  
  // Verify cost prompt (discard hand)
  const cp = (st.prompts || [])[0];
  ok(cp && cp.kind === 'chooseDiscard', 'Should prompt to discard a card as cost: ' + (cp && cp.kind));
  
  // Choose card to discard
  fx = apply(st, { type: 'chooseTarget', k: costCard, by: 'A' });
  if (fx.deny) fail('Discard cost failed: ' + fx.deny);
  
  // Verify result: คาบู ช่วยด้วย is summoned, animal is saved, cost card is in hell
  ok(st.zones['A.avatar'].includes(kabu), 'คาบู ช่วยด้วย should be summoned on field');
  ok(st.zones['A.avatar'].includes(animal), 'Animal Avatar should be saved on field');
  ok(st.zones['A.hell'].includes(costCard), 'Cost card should be discarded to hell');
}

// ==========================================
// TEST 3: BT08-061 ขวาน 7 สี (Modification according to host color)
// ==========================================
{
  // Test Red color: Power +2 combat
  {
    const st = emptyState();
    const redAv = put(st, 'A.avatar', 'SD01-001', { color: 'แดง' });
    const axe = put(st, 'A.magic', 'BT08-061', { attachedTo: redAv });
    const foe = put(st, 'B.avatar', 'SD01-001');
    put(st, 'B.hand', 'BT01-039'); // B has a React magic (เจ้ากล้าดียังไง) so combat remains pending
    const basePower = st.inst[redAv].power || 0;
    
    let fx = apply(st, { type: 'declareAttack', atk: redAv, def: foe, by: 'A' });
    if (fx.deny) fail('Attack failed: ' + fx.deny);
    
    console.log('DEBUG RED HOST POWER: effPower =', BoT.effPower(st, redAv), 'basePower =', basePower);
    ok(BoT.effPower(st, redAv) === basePower + 2, 'Red Host: Power buff +2 combat, effPower: ' + BoT.effPower(st, redAv));
  }

  // Test Blue color: Draw 1
  {
    const st = emptyState();
    const blueAv = put(st, 'A.avatar', 'SD01-001', { color: 'ฟ้า' });
    const axe = put(st, 'A.magic', 'BT08-061', { attachedTo: blueAv });
    const foe = put(st, 'B.avatar', 'SD01-001');
    put(st, 'B.hand', 'BT01-039');
    padDeck(st, 'A', 5);
    
    let fx = apply(st, { type: 'declareAttack', atk: blueAv, def: foe, by: 'A' });
    if (fx.deny) fail('Attack failed: ' + fx.deny);
    
    ok((st.zones['A.hand'] || []).length === 1, 'Blue Host: Draw 1 card on attack');
  }

  // Test Purple color: Mill 1 and Power +1 endOfTurn
  {
    const st = emptyState();
    const purpleAv = put(st, 'A.avatar', 'SD01-001', { color: 'ม่วง' });
    const axe = put(st, 'A.magic', 'BT08-061', { attachedTo: purpleAv });
    const foe = put(st, 'B.avatar', 'SD01-001');
    put(st, 'B.hand', 'BT01-039');
    padDeck(st, 'A', 5);
    const basePower = st.inst[purpleAv].power || 0;
    
    let fx = apply(st, { type: 'declareAttack', atk: purpleAv, def: foe, by: 'A' });
    if (fx.deny) fail('Attack failed: ' + fx.deny);
    
    ok((st.zones['A.hell'] || []).length === 1, 'Purple Host: Mill 1 card to hell');
    ok(BoT.effPower(st, purpleAv) === basePower + 1, 'Purple Host: Power buff +1 EOT, effPower: ' + BoT.effPower(st, purpleAv));
  }

  // Test Green color: Keyword ลูกฮึด fallback
  {
    const st = emptyState();
    const greenAv = put(st, 'A.avatar', 'SD01-001', { color: 'เขียว' });
    const redAv = put(st, 'A.avatar', 'SD01-001', { color: 'แดง' });
    
    const axe = put(st, 'A.magic', 'BT08-061', { attachedTo: greenAv });
    
    ok(BoT.hasKw(st, greenAv, 'ลูกฮึด') === true, 'Green Host gets ลูกฮึด from ขวาน 7 สี');
    ok(BoT.hasKw(st, redAv, 'ลูกฮึด') === false, 'Red Host does NOT get ลูกฮึด from ขวาน 7 สี');
  }
}

// ==========================================
// TEST 4: BT09-054 แผนการตู้เย็นทับ (Pick Construct -> Destroy Avatar with Power <= Construct)
// ==========================================
{
  const st = emptyState();
  const con = put(st, 'A.construct', 'BT11-073', { power: 3 }); // Construct with power 3
  const magic = put(st, 'A.hand', 'BT09-054'); // แผนการตู้เย็นทับ
  
  const targetWeak = put(st, 'B.avatar', 'SD01-001', { power: 3 }); // Enemy Avatar with power 3 (<= 3)
  const targetStrong = put(st, 'B.avatar', 'SD01-001', { power: 5 }); // Enemy Avatar with power 5 (> 3)
  
  // Cast magic
  let fx = apply(st, { type: 'playMagic', k: magic, by: 'A' });
  if (fx.deny) fail('Play magic failed: ' + fx.deny);
  
  // Skip player B's negate magic react prompt
  skipReact(st);
  
  // Verify prompt: pick own construct
  let p = (st.prompts || [])[0];
  ok(p && p.kind === 'pick' && p.from === 'ownConstructs', 'Should prompt to pick own Construct: ' + (p && p.from));
  ok(p.dest === 'pickTuyenConstruct', 'Prompt destination should be pickTuyenConstruct');
  
  // Pick construct
  fx = apply(st, { type: 'chooseTarget', k: con, by: 'A' });
  if (fx.deny) fail('Pick construct failed: ' + fx.deny);
  
  // Verify next prompt: pick enemy avatar to destroy (must be targetWeak, not targetStrong)
  p = (st.prompts || [])[0];
  ok(p && p.kind === 'pick' && p.dest === 'destroy', 'Should prompt to pick enemy avatar to destroy: ' + (p && p.dest));
  ok(p.ids.includes(targetWeak), 'Should include weak avatar in targets');
  ok(!p.ids.includes(targetStrong), 'Should NOT include strong avatar in targets');
  
  // Pick target to destroy
  fx = apply(st, { type: 'chooseTarget', k: targetWeak, by: 'A' });
  if (fx.deny) fail('Destroy target failed: ' + fx.deny);
  
  // Verify result: weak avatar is in hell, strong avatar is on field
  ok(st.zones['B.hell'].includes(targetWeak), 'Weak avatar should be destroyed');
  ok(st.zones['B.avatar'].includes(targetStrong), 'Strong avatar should remain');
}

console.log('--- ALL VALI DECK AUTOMATION TESTS PASSED SUCCESSFULLY! ---');
