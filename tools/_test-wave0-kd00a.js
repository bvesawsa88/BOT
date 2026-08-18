/* focused: คลื่น 0 KD00-00A อะไรวะ ! — React เมื่อ Avatar ฝ่ายเราออกจากสนาม */
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
function skipNegate(st) {
  let n = 0;
  while ((st.prompts || [])[0] && (st.prompts[0].magicNegate || st.prompts[0].mode === 'negateMagic') && n++ < 6) {
    const fx = apply(st, { type: 'reactNo', by: st.prompts[0].chooser, seed: 90 + n });
    if (fx.deny) fail('negate skip: ' + fx.deny);
  }
}
function lifeUp(st, side) {
  return (st.zones[side + '.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
}
function handAvatars(st, side) {
  return (st.zones[side + '.hand'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar').length;
}

/* 1) ทำลาย Avatar ฝ่ายเรา → เล่นอะไรวะ ! → คืนมือสับ จั่ว 4 · B มี Avatar น้อยกว่า → หงาย LIFE 2 */
{
  const st = emptyState();
  const isuan = put(st, 'A.avatar', 'FPRO-004');
  const fodder = put(st, 'A.avatar', 'SD01-003');
  const react = put(st, 'A.hand', 'KD00-00A');
  for (let i = 0; i < 8; i++) put(st, 'A.deck', 'SD01-003');
  for (let i = 0; i < 8; i++) put(st, 'B.deck', 'SD01-018');
  put(st, 'B.hand', 'SD01-019');
  put(st, 'B.hand', 'SD01-019');
  const aLife = [];
  const bLife = [];
  for (let i = 0; i < 5; i++) aLife.push(put(st, 'A.life', 'SD01-021', { faceUp: false }));
  for (let i = 0; i < 5; i++) bLife.push(put(st, 'B.life', 'SD01-021', { faceUp: false }));

  let fx = apply(st, { type: 'activateAbility', k: isuan, by: 'A', seed: 1 });
  ok(!fx.deny, 'isuan activate: ' + (fx.deny || ''));
  let pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'chooseDestroy fodder: ' + (pr && pr.kind));
  fx = apply(st, { type: 'chooseTarget', k: fodder, by: 'A', seed: 2 });
  if (fx.deny) fail('destroy deny: ' + fx.deny);
  ok(BoT.zoneOf(st, fodder) === 'A.hell', 'fodder left field');

  pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'react' && pr.reactTrigger === 'ownAvatarLeftField' && pr.chooser === 'A',
    'left-field prompt: ' + JSON.stringify(pr && { kind: pr.kind, trig: pr.reactTrigger, chooser: pr.chooser }));
  ok((pr.options || []).includes(react), 'อะไรวะ in options');

  fx = apply(st, { type: 'chooseTarget', k: react, by: 'A', seed: 3 });
  if (fx.deny) fail('play 00A deny: ' + fx.deny);
  skipNegate(st);

  ok((st.zones['A.hand'] || []).length === 4, 'A drew 4: ' + (st.zones['A.hand'] || []).length);
  ok((st.zones['B.hand'] || []).length === 4, 'B drew 4: ' + (st.zones['B.hand'] || []).length);
  ok(BoT.zoneOf(st, react) === 'A.hell', '00A went to hell');
  ok(handAvatars(st, 'A') === 4, 'A hand all avatars: ' + handAvatars(st, 'A'));
  ok(handAvatars(st, 'B') === 0, 'B hand no avatars: ' + handAvatars(st, 'B'));
  ok(lifeUp(st, 'A') === 0, 'A life still down: ' + lifeUp(st, 'A'));
  ok(lifeUp(st, 'B') === 2, 'B fewest avatars → 2 life: ' + lifeUp(st, 'B'));
}

/* 2) เล่นอิสระใน Main โดยไม่มีหน้าต่างออกสนาม → ใช้ไม่ได้ */
{
  const st = emptyState();
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
  const react = put(st, 'A.hand', 'KD00-00A');
  const fx = apply(st, { type: 'playMagic', k: react, by: 'A', seed: 10 });
  ok(!!fx.deny, 'free play denied: ' + (fx.deny || '(no deny)'));
}

console.log('wave0 kd00a: all passed');
