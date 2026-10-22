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
    phase: 'Battle', active: 'B', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    gems: { A: 10, B: 10 }
  }, extra || {});

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

console.log('--- Test 1: พระอิศวร destroyed triggers พระอิศวร วีลแชร์ from hand ---');
{
  const st = emptyState();
  const ishvara = put(st, 'A.avatar', 'SD01-001'); // พระอิศวร P5
  const wheelchair = put(st, 'A.hand', 'BT09-001'); // พระอิศวร วีลแชร์ in hand
  const enemy = put(st, 'B.avatar', 'SD01-002');    // Enemy avatar P5

  // Destroy พระอิศวร on field
  BoT.applyAction(st, { type: 'destroyCard', k: ishvara });

  // พระอิศวร should now be in Hell
  if (!st.zones['A.hell'].includes(ishvara)) {
    throw new Error('Expected พระอิศวร to be in Hell');
  }

  // A prompt for react:ownAvatarDestroyed with wheelchair should appear
  const pr = st.prompts[0];
  if (!pr || pr.kind !== 'react' || !pr.avatarHandAbility || !pr.options.includes(wheelchair)) {
    throw new Error('Expected hand react prompt for wheelchair, got: ' + JSON.stringify(st.prompts));
  }

  // Player chooses to use wheelchair from hand
  const fxUse = BoT.applyAction(st, { type: 'chooseTarget', k: wheelchair, by: 'A' });
  if (fxUse.deny) throw new Error('Failed to use wheelchair: ' + fxUse.deny);

  // Wheelchair should now be on A.avatar zone
  if (!st.zones['A.avatar'].includes(wheelchair)) {
    throw new Error('Expected wheelchair to be on Avatar zone, got: ' + JSON.stringify(st.zones['A.avatar']));
  }

  // Next prompt: choose พระอิศวร from Hell
  const prHell = st.prompts[0];
  if (!prHell || prHell.dest !== 'ishvaraWheelchairHell') {
    throw new Error('Expected ishvaraWheelchairHell prompt, got: ' + JSON.stringify(st.prompts));
  }
  const hellCands = BoT.promptCandidates(st, prHell);
  if (!hellCands.includes(ishvara)) {
    throw new Error('Expected ishvara to be in hell candidates, got: ' + JSON.stringify(hellCands));
  }

  // Choose ishvara from Hell
  const fxHell = BoT.applyAction(st, { type: 'chooseTarget', k: ishvara, by: 'A' });
  if (fxHell.deny) throw new Error('Failed to pick ishvara from hell: ' + fxHell.deny);

  // Wheelchair printed power should now be 2 (floor(5/2))
  if (st.inst[wheelchair].power !== 2) {
    throw new Error('Expected wheelchair printed power to be 2, got: ' + st.inst[wheelchair].power);
  }

  // Next prompt: pick enemy avatar to debuff by 2
  const prDebuff = st.prompts[0];
  if (!prDebuff || prDebuff.dest !== 'ishvaraWheelchairDebuff') {
    throw new Error('Expected ishvaraWheelchairDebuff prompt, got: ' + JSON.stringify(st.prompts));
  }
  if (prDebuff.debuffAmt !== 2) {
    throw new Error('Expected debuffAmt to be 2, got: ' + prDebuff.debuffAmt);
  }

  const prevEnemyPower = BoT.effPower(st, enemy);
  // Pick enemy avatar
  const fxDebuff = BoT.applyAction(st, { type: 'chooseTarget', k: enemy, by: 'A' });
  if (fxDebuff.deny) throw new Error('Failed to debuff enemy: ' + fxDebuff.deny);

  const newEnemyPower = BoT.effPower(st, enemy);
  if (newEnemyPower !== prevEnemyPower - 2) {
    throw new Error(`Expected enemy power to decrease by 2 from ${prevEnemyPower} to ${prevEnemyPower - 2}, got ${newEnemyPower}`);
  }

  console.log('Passed Test 1: พระอิศวร วีลแชร์ triggered from hand, summoned, copied half power (5->2), and debuffed enemy!');
}

console.log('--- Test 2: Non-พระอิศวร avatar destroyed does NOT trigger พระอิศวร วีลแชร์ ---');
{
  const st = emptyState();
  const otherAvatar = put(st, 'A.avatar', 'BT01-001'); // Not พระอิศวร
  const wheelchair = put(st, 'A.hand', 'BT09-001');

  BoT.applyAction(st, { type: 'destroyCard', k: otherAvatar });

  const pr = st.prompts[0];
  if (pr && pr.avatarHandAbility && pr.options && pr.options.includes(wheelchair)) {
    throw new Error('Wheelchair should not trigger on non-พระอิศวร destroyed');
  }
  console.log('Passed Test 2: Non-พระอิศวร avatar destroyed did not trigger wheelchair');
}

console.log('--- Test 3: พระอิศวร destroyed by self effect (e.g. sacrifice) also triggers พระอิศวร วีลแชร์ ---');
{
  const st = emptyState();
  const ishvara = put(st, 'A.avatar', 'SD01-001');
  const wheelchair = put(st, 'A.hand', 'BT09-001');

  // Destroy by own action / sacrifice
  BoT.applyAction(st, { type: 'destroyCard', k: ishvara });

  const pr = st.prompts[0];
  if (!pr || pr.kind !== 'react' || !pr.avatarHandAbility || !pr.options.includes(wheelchair)) {
    throw new Error('Expected wheelchair to trigger on any destruction to Hell, got: ' + JSON.stringify(st.prompts));
  }
  console.log('Passed Test 3: Wheelchair triggered on own destruction as well');
}

console.log('\nAll tests passed successfully!');
