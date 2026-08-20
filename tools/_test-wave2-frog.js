/* focused: คลื่น 2 CC01-020 ผู้กองอึ่งอ่าง — นับเป็นทุก Symbol บนสนาม */
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

{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-003');
  const frog = put(st, 'A.avatar', 'CC01-020');
  const vanilla = put(st, 'A.avatar', 'SD01-003');
  const inHand = put(st, 'A.hand', 'CC01-020');
  const prYak = { kind: 'pick', from: 'ownAvatars', src: vanilla, chooser: 'A', filter: { symbol: 'ยักษ์' }, dest: 'bounceHand', includeSelf: true };
  const prThep = { kind: 'pick', from: 'ownAvatars', src: vanilla, chooser: 'A', filter: { symbol: 'เทพ' }, dest: 'bounceHand', includeSelf: true };
  const prFish = { kind: 'pick', from: 'ownAvatars', src: vanilla, chooser: 'A', filter: { symbol: 'ปลา' }, dest: 'bounceHand', includeSelf: true };
  ok(BoT.promptCandidates(st, prYak).includes(frog), 'field frog is ยักษ์');
  ok(BoT.promptCandidates(st, prThep).includes(frog), 'field frog is เทพ');
  ok(BoT.promptCandidates(st, prFish).includes(frog), 'field frog is ปลา');
  ok(!BoT.promptCandidates(st, prYak).includes(vanilla), 'พระอินทร์ is not ยักษ์');
  const prHand = { kind: 'pick', from: 'ids', ids: [inHand], src: frog, chooser: 'A', filter: { symbol: 'ยักษ์' }, dest: 'bounceHand', allowAnyZone: true };
  ok(!BoT.promptCandidates(st, prHand).includes(inHand), 'hand frog is not every symbol');
}

console.log('wave2 frog-all-symbols: all passed');
