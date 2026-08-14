/* reprint ชายจากอนาคต ติดป้าย Normal ผิด — ต้องกินโควต้า React
   และไม่นะ อู๊ด ต้องเก็บได้แค่ Normal Magic (ห้าม React) */
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
function skipNegateWindows(st, seed0) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 8) {
    const skip = BoT.applyAction(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: seed0 + n });
    if (skip.deny) fail('negate skip deny: ' + skip.deny);
  }
}

/* 1) ชายจากอนาคต reprint ป้าย Normal → กิน React → อุบัติเหตุใช้ต่อไม่ได้ */
{
  const st = emptyState();
  const mag = put(st, 'A.hand', 'BT01-038');
  const av = put(st, 'A.hand', 'SD01-011');
  const man = put(st, 'B.hand', 'SD05-020', { subtype: 'Normal' });
  const acc = put(st, 'B.hand', 'SD01-017');

  let fx = BoT.applyAction(st, { type: 'playMagic', k: mag, by: 'A', seed: 1 });
  if (fx.deny) fail('playMagic deny: ' + fx.deny);
  let pr = (st.prompts || [])[0];
  ok(pr && (pr.magicNegate || pr.mode === 'negateMagic') && (pr.options || []).includes(man),
    'negate window offers ชายจากอนาคต');

  fx = BoT.applyAction(st, { type: 'chooseTarget', k: man, by: 'B', seed: 2 });
  if (fx.deny) fail('ชายจากอนาคต deny: ' + fx.deny);
  skipNegateWindows(st, 10);
  ok(!!st.magicUsed.B.React, 'ชายจากอนาคต ป้าย Normal กินโควต้า React: ' + JSON.stringify(st.magicUsed.B));

  fx = BoT.applyAction(st, { type: 'summon', k: av, to: 'A.avatar', by: 'A', seed: 3 });
  if (fx.deny) fail('summon deny: ' + fx.deny);
  pr = (st.prompts || [])[0];
  const accidentOffered = pr && pr.kind === 'react' && pr.reactTrigger === 'avatarSummoned'
    && (pr.options || []).includes(acc);
  ok(!accidentOffered, 'อุบัติเหตุใช้ต่อไม่ได้หลังชายจากอนาคต: ' + ((pr && pr.kind) || 'no-prompt'));
}

/* 2) ไม่นะ อู๊ด — hellPick subtype Normal ห้าม React (รวม reprint ป้ายผิด) */
{
  const st = emptyState();
  const life = put(st, 'A.life', 'KD03-022');
  const acc = put(st, 'A.hell', 'SD01-017');
  const man = put(st, 'A.hell', 'SD05-020', { subtype: 'Normal' });
  const norm = put(st, 'A.hell', 'BT01-038');
  const p = {
    kind: 'pick', from: 'hell', src: life, chooser: 'A',
    filter: { type: 'Magic', subtype: 'Normal' }, dest: 'hand', showAllHell: true
  };
  const cands = BoT.promptCandidates(st, p);
  ok(cands.includes(norm), 'Normal Magic เก็บได้');
  ok(!cands.includes(acc), 'อุบัติเหตุ (React) เก็บไม่ได้');
  ok(!cands.includes(man), 'ชายจากอนาคต reprint ป้าย Normal เก็บไม่ได้');
}

console.log('all ok');
