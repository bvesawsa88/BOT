/* focused: เด็คอัญเชิญพระไตรปิฎก (ไซอิ๋ว) */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function byCode(code) {
  return cards.find(c => c.code === code);
}
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => {
      zones[p + '.' + z] = [];
    });
  });
  return {
    inst: {}, zones,
    phase: 'Main', active: 'A', turn: 2, turnSeq: 2,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false,
    attacksThisTurn: { A: 0, B: 0 }, oncePerGame: {}
  };
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

function drainReact(st, seed) {
  let n = 0;
  while ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && n++ < 12) {
    const chooser = st.prompts[0].chooser;
    const fx = BoT.applyAction(st, { type: 'reactNo', by: chooser, seed: (seed || 1) + n });
    if (fx.deny) fail('reactNo deny: ' + fx.deny);
  }
}

function pickFirst(st, seed) {
  const p = (st.prompts || [])[0];
  if (!p) fail('expected prompt, got none');
  const cands = BoT.promptCandidates(st, p);
  if (!cands.length) fail('prompt has no candidates: ' + p.kind);
  const fx = BoT.applyAction(st, { type: 'chooseTarget', k: cands[0], by: p.chooser, seed: seed || 9 });
  if (fx.deny) fail('chooseTarget deny: ' + fx.deny);
  return fx;
}

/* 1) ซุนหงอคง +2 เมื่อมีพระถังซัมจั๋ง · กันโจมตีพระถังซัมจั๋ง */
{
  const st = emptyState();
  const tang = put(st, 'A.avatar', 'BT11-047');
  const wukong = put(st, 'A.avatar', 'BT11-013');
  const fodder = put(st, 'A.avatar', 'SD01-006');
  const enemy = put(st, 'B.avatar', 'SD07-011');
  st.phase = 'Battle';
  st.active = 'B';
  ok(BoT.effPower(st, wukong) === (+byCode('BT11-013').power || 0) + 2, 'wukong +2 with tang');
  ok(BoT.effPower(st, fodder) === (+byCode('SD01-006').power || 0), 'vanilla not buffed by wukong');
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: enemy, def: tang, by: 'B', seed: 1 });
  ok(!!fx.deny, 'cannot attack tang while wukong protects: ' + (fx.deny || 'no deny'));
  fx = BoT.applyAction(st, { type: 'declareAttack', atk: enemy, def: fodder, by: 'B', seed: 2 });
  ok(!fx.deny, 'can attack other avatars: ' + (fx.deny || 'ok'));
}

/* 2) ไม่มีพระถังซัมจั๋ง → ซุนหงอคงไม่ +2 */
{
  const st = emptyState();
  const wukong = put(st, 'A.avatar', 'BT11-013');
  ok(BoT.effPower(st, wukong) === (+byCode('BT11-013').power || 0), 'wukong no +2 without tang');
}

/* 3) ซัวเจ๋ง จากนรก: 2 ใบในกลุ่ม (สำเนาซุนหงอคง 2 ใบก็ได้) */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT11-013');
  put(st, 'A.avatar', 'BT11-013');
  const sha = put(st, 'A.hell', 'BT11-025');
  const pay = put(st, 'A.hand', 'SD01-006');
  let fx = BoT.applyAction(st, { type: 'activateAbility', k: sha, by: 'A', seed: 3 });
  ok(!fx.deny, 'sha from hell with 2 wukong copies: ' + (fx.deny || 'ok'));
  ok((st.prompts || [])[0] && st.prompts[0].kind === 'chooseDiscard', 'discard cost prompt');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: pay, by: 'A', seed: 4 });
  if (fx.deny) fail('discard deny: ' + fx.deny);
  drainReact(st, 5);
  ok(BoT.zoneOf(st, sha) === 'A.avatar', 'sha summoned from hell');
}

/* 4) ซัวเจ๋ง จากนรก: มีแค่ 1 ใบในกลุ่ม → ใช้ไม่ได้ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT11-047');
  const sha = put(st, 'A.hell', 'BT11-025');
  put(st, 'A.hand', 'SD01-006');
  const fx = BoT.applyAction(st, { type: 'activateAbility', k: sha, by: 'A', seed: 6 });
  ok(!!fx.deny, 'sha denied with only 1 crew card: ' + (fx.deny || 'no deny'));
}

/* 5) ตือโป๊ยก่าย: ใช้ Magic → ไซอิ๋ว +1 จน nextOwnDraw */
{
  const st = emptyState();
  const pig = put(st, 'A.avatar', 'BT11-035');
  const tang = put(st, 'A.avatar', 'BT11-047');
  const magic = put(st, 'A.hand', 'BT01-038');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'A.deck', 'SD07-011');
  const before = BoT.effPower(st, tang);
  let fx = BoT.applyAction(st, { type: 'playMagic', k: magic, by: 'A', seed: 7 });
  if (fx.deny) fail('play ความเจริญ deny: ' + fx.deny);
  drainReact(st, 8);
  ok(BoT.effPower(st, tang) === before + 1, 'tang +1 after own magic');
  ok(BoT.effPower(st, pig) === (+byCode('BT11-035').power || 0) + 1, 'pig +1 after own magic');
}

/* 6) พระถังซัมจั๋ง จุติ: ทิ้ง Avatar → อัญเชิญศิษย์จากเด็ค */
{
  const st = emptyState();
  const tang = put(st, 'A.hand', 'BT11-047');
  const gem = put(st, 'A.hand', 'SD07-011');
  const disc = put(st, 'A.hand', 'SD01-006');
  const wukong = put(st, 'A.deck', 'BT11-013');
  let fx = BoT.applyAction(st, { type: 'summon', k: tang, to: 'A.avatar', payIds: [gem], by: 'A', seed: 10 });
  if (fx.deny) fail('summon tang deny: ' + fx.deny);
  drainReact(st, 11);
  ok((st.prompts || [])[0] && st.prompts[0].kind === 'chooseDiscard', 'juti discard avatar: ' + ((st.prompts || [])[0] && st.prompts[0].kind));
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: disc, by: 'A', seed: 12 });
  if (fx.deny) fail('juti discard deny: ' + fx.deny);
  drainReact(st, 13);
  ok((st.prompts || [])[0] && st.prompts[0].kind === 'pick', 'juti deck pick');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: wukong, by: 'A', seed: 14 });
  if (fx.deny) fail('juti pick deny: ' + fx.deny);
  drainReact(st, 15);
  ok(BoT.zoneOf(st, wukong) === 'A.avatar', 'wukong summoned from deck via juti');
}

/* 7) พระถังซัมจั๋ง สั่งใช้: มีศิษย์ครบ → หาพระไตรปิฎก */
{
  const st = emptyState();
  const tang = put(st, 'A.avatar', 'BT11-047');
  put(st, 'A.avatar', 'BT11-013');
  put(st, 'A.avatar', 'BT11-035');
  put(st, 'A.avatar', 'BT11-025');
  const book = put(st, 'A.hell', 'BT11-056');
  let fx = BoT.applyAction(st, { type: 'activateAbility', k: tang, by: 'A', seed: 16 });
  if (fx.deny) fail('tang activate deny: ' + fx.deny);
  ok((st.prompts || [])[0] && st.prompts[0].kind === 'pick', 'deckOrHell pick tripitaka');
  fx = BoT.applyAction(st, { type: 'chooseTarget', k: book, by: 'A', seed: 17 });
  if (fx.deny) fail('pick tripitaka deny: ' + fx.deny);
  ok(BoT.zoneOf(st, book) === 'A.hand', 'tripitaka to hand from hell');
}

/* 8) พระไตรปิฎก: ต้องมีพระถังซัมจั๋ง · จั่ว · ค้าง Magic Zone · +1 ไซอิ๋ว */
{
  const st = emptyState();
  const book = put(st, 'A.hand', 'BT11-056');
  put(st, 'A.deck', 'SD01-006');
  let fx = BoT.applyAction(st, { type: 'playMagic', k: book, by: 'A', seed: 18 });
  ok(!!fx.deny, 'tripitaka denied without tang: ' + (fx.deny || 'no deny'));

  const tang = put(st, 'A.avatar', 'BT11-047');
  const wukong = put(st, 'A.avatar', 'BT11-013');
  const pBefore = BoT.effPower(st, tang);
  const handBefore = (st.zones['A.hand'] || []).length;
  fx = BoT.applyAction(st, { type: 'playMagic', k: book, by: 'A', seed: 19 });
  if (fx.deny) fail('play tripitaka deny: ' + fx.deny);
  drainReact(st, 20);
  ok(BoT.zoneOf(st, book) === 'A.magic', 'tripitaka stays on magic zone');
  ok((st.zones['A.hand'] || []).length === handBefore, 'drew 1 (spent book, drew 1)');
  ok(BoT.effPower(st, tang) === pBefore + 1, 'tang +1 from tripitaka static');
  ok(BoT.effPower(st, wukong) >= (+byCode('BT11-013').power || 0) + 2 + 1, 'wukong +2 (tang) +1 (book)');
}

/* 9) ชนะทันทีตอน Draw Phase: 3 พระไตรปิฎก + ศิษย์ครบ */
{
  const st = emptyState();
  put(st, 'A.avatar', 'BT11-047');
  put(st, 'A.avatar', 'BT11-013');
  put(st, 'A.avatar', 'BT11-035');
  put(st, 'A.avatar', 'BT11-025');
  put(st, 'A.magic', 'BT11-056');
  put(st, 'A.magic', 'BT11-056');
  put(st, 'A.magic', 'BT11-056');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'A.deck', 'SD07-011');
  put(st, 'A.deck', 'SD01-006');
  put(st, 'B.deck', 'SD01-006');
  put(st, 'B.deck', 'SD07-011');
  put(st, 'B.deck', 'SD01-006');
  st.phase = 'Main';
  st.active = 'B';
  let fx = BoT.applyAction(st, { type: 'endTurn', by: 'B', seed: 21 });
  if (fx.deny) fail('endTurn B deny: ' + fx.deny);
  drainReact(st, 22);
  ok(!!st.over && st.over.winner === 'A', 'instant win on A draw: ' + JSON.stringify(st.over));
}

/* 10) แหม่อ้ายก็~~~ ยกเลิกโจมตี */
{
  const st = emptyState();
  const me = put(st, 'A.avatar', 'SD01-006');
  const enemy = put(st, 'B.avatar', 'SD07-011');
  const react = put(st, 'A.hand', 'BT08-057');
  st.phase = 'Battle';
  st.active = 'B';
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: enemy, def: me, by: 'B', seed: 23 });
  if (fx.deny) fail('declareAttack deny: ' + fx.deny);
  ok(!!st.pending, 'attack pending');
  const pr = (st.prompts || []).find(p => p.kind === 'react');
  ok(pr && pr.chooser === 'A', 'react window for A');
  fx = BoT.applyAction(st, { type: 'playMagic', k: react, by: 'A', seed: 24 });
  if (fx.deny) fail('play แหม่อ้ายก็ deny: ' + fx.deny);
  drainReact(st, 25);
  ok(!st.pending, 'attack cancelled');
  ok(st.inst[enemy] && !st.inst[enemy].tapped, 'attacker untapped after cancel');
}

/* 11) กระสอบ: โฮสต์โจมตีไม่ได้ */
{
  const st = emptyState();
  const host = put(st, 'A.avatar', 'SD07-011');
  const bag = put(st, 'A.magic', 'BT09-065');
  st.inst[bag].attachedTo = host;
  const enemy = put(st, 'B.avatar', 'SD01-006');
  st.phase = 'Battle';
  const fx = BoT.applyAction(st, { type: 'declareAttack', atk: host, def: enemy, by: 'A', seed: 26 });
  ok(!!fx.deny, 'bag host cannot attack: ' + (fx.deny || 'no deny'));
}

/* 12) มวยทะเลลลลลล: โจมตีได้ 1 ตัว/เทิร์น */
{
  const st = emptyState();
  put(st, 'land', 'BT01-049');
  const a1 = put(st, 'A.avatar', 'SD01-006');
  const a2 = put(st, 'A.avatar', 'SD07-011');
  const enemy = put(st, 'B.avatar', 'BT11-035');
  st.phase = 'Battle';
  let fx = BoT.applyAction(st, { type: 'declareAttack', atk: a1, def: enemy, by: 'A', seed: 27 });
  if (fx.deny) fail('first attack deny: ' + fx.deny);
  drainReact(st, 28);
  if (st.pending) {
    fx = BoT.applyAction(st, { type: 'resolveAttack', by: 'B', seed: 28 });
    if (fx.deny) fail('resolveAttack deny: ' + fx.deny);
  }
  fx = BoT.applyAction(st, { type: 'declareAttack', atk: a2, def: enemy, by: 'A', seed: 29 });
  ok(!!fx.deny && /มวยทะเล|เทิร์นละ/.test(fx.deny || ''), 'second attack blocked by มวยทะเล: ' + (fx.deny || 'no deny'));
}

console.log('ALL SAIYIU TESTS PASSED');
