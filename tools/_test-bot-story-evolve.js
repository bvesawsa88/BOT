/* บอทตัวจริงกับการแปลงร่างนักท่องเรื่องราว + การเล่นโง่ที่พบจาก self-play */
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
global.BoTEngine = E;
const U = require('../js/bot-universal.js');
const Core = require('../js/bot-core.js');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
E.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

const EXPLORER = 'BT09-042', NAGA = 'BT09-043', GARUDA = 'BT09-044';
const GEM3 = 'SD04-007', GEM4 = 'SD04-008', WEAK = 'SD04-013';

function ok(cond, msg) { if (!cond) throw new Error('FAIL: ' + msg); console.log('ok', msg); }
function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; }));
  return {
    inst: {}, zones, phase: 'Main', active: 'A', turn: 3, turnSeq: 3, strict: true, firstPlayer: 'B', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [], magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false, pendingLethal: null, oncePerGame: {}, gems: { A: 10, B: 10 },
  };
}
function put(st, zone, code, extra) {
  const c = cards.find(x => x.code === code);
  if (!c) throw new Error('missing ' + code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = Object.assign({
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '', symbol: c.symbol || '', color: c.color || '',
    gemColor: c.gemColor || '', cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—', img: '',
    faceUp: true, tapped: false, counters: 0, attachedTo: null,
  }, extra || {});
  st.zones[zone].push(k);
  return k;
}
function board(setup) {
  const st = emptyState();
  for (let i = 0; i < 8; i++) { put(st, 'A.deck', 'BT09-056'); put(st, 'B.deck', 'BT09-056'); }
  for (let i = 0; i < 5; i++) { put(st, 'A.life', GEM3, { faceUp: false }); put(st, 'B.life', GEM3, { faceUp: false }); }
  return Object.assign({ st }, setup(st));
}
/** ให้บอทฝั่ง A เล่นจนจบเทิร์น ฝั่ง B แค่รับการโจมตี · คืนรายการ action ของ A ที่ผ่าน */
function playTurn(st, level) {
  const acts = [];
  let seed = 3;
  const send = a => {
    const fx = E.applyAction(st, Object.assign({ seed: seed++ }, a));
    if (!fx || !fx.deny) acts.push(a);
    return fx;
  };
  const bot = Core.createPlayer({ side: 'A', level: () => level || 'normal', state: () => st, send, schedule() { } });
  for (let i = 0; i < 80 && st.active === 'A' && !st.over; i++) {
    const pr = (st.prompts || [])[0];
    if (pr && pr.chooser === 'B') {
      E.applyAction(st, { type: pr.kind === 'react' ? 'reactNo' : 'skipPrompt', by: 'B', seed: seed++ });
    } else if (!pr && st.pending && st.pending.target === 'B') {
      E.applyAction(st, { type: 'resolveAttack', by: 'B', seed: seed++ });
    } else bot.tick();
  }
  return acts;
}
const summoned = (acts, k) => acts.some(a => a.type === 'summon' && a.k === k);
const paid = (acts, k) => acts.some(a => a.type === 'summon' && (a.payIds || []).includes(k));
const attackers = acts => acts.filter(a => a.type === 'declareAttack').map(a => a.atk);

/* 1) มีนักท่องในมือ: ลงนักท่อง ตีก่อน แล้วแปลงร่างใน Battle ให้ร่างใหม่ตีซ้ำ */
['normal', 'hard'].forEach(level => {
  const { st, exp, garuda } = board(s => {
    put(s, 'B.avatar', WEAK); put(s, 'B.avatar', WEAK);
    put(s, 'A.hand', GEM4);
    return { exp: put(s, 'A.hand', EXPLORER), garuda: put(s, 'A.hand', GARUDA) };
  });
  put(st, 'A.hand', GEM4);
  const acts = playTurn(st, level);
  ok(summoned(acts, exp), level + ': ลงนักท่อง');
  ok(!summoned(acts, garuda) && !paid(acts, garuda), level + ': ไม่ลงครุฑเอง และไม่เอาไปจ่าย GEM');
  ok(E.zoneOf(st, garuda) === 'A.avatar' && (st.inst[garuda].granted || []).length > 0, level + ': ครุฑลงสนามจากการแปลงร่างและได้ความสามารถ');
  const hit = attackers(acts);
  ok(hit.includes(exp) && hit.includes(garuda), level + ': นักท่องตีแล้ว ครุฑตีซ้ำในเทิร์นเดียว');
});

/* 2) ไม่มีนักท่อง แต่บอร์ดยังมีตัว: เก็บการ์ดเรื่องราวไว้ */
{
  const { st, garuda } = board(s => {
    put(s, 'A.avatar', GEM3);
    put(s, 'A.hand', GEM4); put(s, 'A.hand', GEM4);
    return { garuda: put(s, 'A.hand', GARUDA) };
  });
  ok(!summoned(playTurn(st), garuda), 'มีตัวบนบอร์ด ไม่ลงครุฑเปล่า');
}

/* 3) ทางออกสุดท้าย: บอร์ดว่าง ศัตรูกด ไม่มีนักท่อง ลงครุฑเป็นตัวบล็อกได้ · นาค POWER 0 ไม่ลง */
{
  const { st, garuda } = board(s => {
    put(s, 'B.avatar', GEM3);
    put(s, 'A.hand', GEM4); put(s, 'A.hand', GEM4);
    return { garuda: put(s, 'A.hand', GARUDA) };
  });
  ok(summoned(playTurn(st), garuda), 'บอร์ดว่างโดนกด ลงครุฑได้');
  const b = board(s => {
    put(s, 'B.avatar', GEM3);
    put(s, 'A.hand', GEM4); put(s, 'A.hand', GEM4);
    return { naga: put(s, 'A.hand', NAGA) };
  });
  ok(!summoned(playTurn(b.st), b.naga), 'นาค POWER 0 ไม่ลงเอง แม้บอร์ดว่าง');
}

/* 4) นักท่องบนสนาม: จ่ายค่าลงตัวอื่นโดยไม่แตะร่างแปลง */
{
  const { st, garuda, cheap } = board(s => {
    put(s, 'A.avatar', EXPLORER);
    put(s, 'A.hand', GEM4);
    return { garuda: put(s, 'A.hand', GARUDA), cheap: put(s, 'A.hand', GEM3) };
  });
  const acts = playTurn(st);
  ok(summoned(acts, cheap) && !paid(acts, garuda), 'ลงตัวอื่นโดยไม่จ่ายครุฑ');
  ok((st.inst[garuda].granted || []).length > 0, 'แปลงร่างครุฑหลังลงตัวอื่น');
}

/* 4.1) มีนักท่องบนสนามแล้ว: ไม่จ่ายครุฑเพื่อลงนักท่องใบที่สอง ให้แปลงร่างแทน */
{
  const { st, garuda, second } = board(s => {
    put(s, 'A.avatar', EXPLORER);
    put(s, 'A.hand', 'BT09-056');
    return { garuda: put(s, 'A.hand', GARUDA), second: put(s, 'A.hand', 'BT11-048') };
  });
  const acts = playTurn(st);
  ok(!paid(acts, garuda) && !summoned(acts, second), 'ไม่เอาครุฑไปจ่ายลงนักท่องใบที่สอง');
  ok(E.zoneOf(st, garuda) === 'A.avatar', 'แปลงร่างเป็นครุฑแทน');
}

/* 5) เลือกร่างตาม POWER จริง: นรกว่าง = ครุฑ · Magic ในนรก 12 ใบ = นาค */
{
  const pick = hellMagics => {
    const b = board(s => {
      put(s, 'A.avatar', EXPLORER);
      for (let i = 0; i < hellMagics; i++) put(s, 'A.hell', 'BT09-056');
      return { naga: put(s, 'A.hand', NAGA), garuda: put(s, 'A.hand', GARUDA) };
    });
    playTurn(b.st);
    return E.zoneOf(b.st, b.naga) === 'A.avatar' ? 'naga' : E.zoneOf(b.st, b.garuda) === 'A.avatar' ? 'garuda' : 'none';
  };
  ok(pick(0) === 'garuda', 'นรกว่าง แปลงเป็นครุฑ');
  ok(pick(12) === 'naga', 'Magic ในนรก 12 ใบ แปลงเป็นนาค');
}

/* 6) มีแต่นาคและนรกว่าง: คงนักท่อง P3 ไว้ ไม่แปลงเป็น P0 */
{
  const { st, exp, naga } = board(s => ({ exp: put(s, 'A.avatar', EXPLORER), naga: put(s, 'A.hand', NAGA) }));
  playTurn(st);
  ok(E.zoneOf(st, exp) === 'A.avatar' && E.zoneOf(st, naga) === 'A.hand', 'ไม่แปลงเป็นนาค POWER 0');
}

/* 7) มัลลิแกน: การ์ดเรื่องราวมีค่าเมื่อมีนักท่องในมือ */
{
  const score = withExplorer => {
    const { st, garuda } = board(s => {
      if (withExplorer) put(s, 'A.hand', EXPLORER);
      return { garuda: put(s, 'A.hand', GARUDA) };
    });
    return U.mulliganKeepScore(st, 'A', garuda, false);
  };
  ok(score(true) > score(false), 'เก็บครุฑเมื่อมีนักท่อง ทิ้งเมื่อไม่มี');
}

/* 8) พระอิศวรไม่ทำลายตัวเองเมื่อศัตรูไม่มีเป้า */
{
  const { st, shiva } = board(s => ({ shiva: put(s, 'A.avatar', 'CC01-001') }));
  playTurn(st);
  ok(E.zoneOf(st, shiva) === 'A.avatar', 'พระอิศวรยังอยู่บนสนาม');
}

/* 9) โล่มนุษย์: นารายณ์ตัวเดียวออกตี · มะม่วงยังเฝ้า · กาเวนหลายใบเฝ้าแค่ใบเดียว */
{
  const a = board(s => {
    put(s, 'B.avatar', GEM3);
    return { narai: put(s, 'A.avatar', 'CC01-002') };
  });
  ok(attackers(playTurn(a.st)).includes(a.narai), 'นารายณ์ P8 ออกตี');
  const b = board(s => {
    put(s, 'B.avatar', WEAK);
    return { mango: put(s, 'A.avatar', 'BT09-036') };
  });
  ok(!attackers(playTurn(b.st)).includes(b.mango), 'มะม่วงไม่บุก');
  const c = board(s => {
    put(s, 'B.avatar', WEAK); put(s, 'B.avatar', WEAK);
    return {
      big: put(s, 'A.avatar', 'CC01-002'),
      g1: put(s, 'A.avatar', 'BT05-015'), g2: put(s, 'A.avatar', 'BT05-015', { powerDelta: 1 }),
    };
  });
  const hit = attackers(playTurn(c.st));
  ok(hit.includes(c.big) && hit.includes(c.g2) && !hit.includes(c.g1), 'โล่ใบอ่อนสุดเฝ้า ใบที่เหลือออกตี');
}

/* 10) แลนด์ค้นเด็ค: ไม่ทิ้งการ์ดถ้าเด็คเราไม่มีเป้าหมาย */
{
  const { st, kept } = board(s => {
    put(s, 'land', 'BT03-057', { controller: 'A' });
    return { kept: put(s, 'A.hand', 'CC01-001') };
  });
  playTurn(st);
  ok(E.zoneOf(st, kept) !== 'A.hell', 'ไม่จ่าย cost ค้นการ์ดที่ไม่มีในเด็ค');
}

/* 11) Magic ที่ทำลายตัวเองเพื่ออัญเชิญ: รอจนมีตัวบนมือ */
{
  const placed = { magicEnteredTurnSeq: 1 };
  const a = board(s => ({ job: put(s, 'A.magic', 'CC02-044', placed) }));
  playTurn(a.st);
  ok(E.zoneOf(a.st, a.job) === 'A.magic', 'ใบรับสมัครไม่ทำลายตัวเองเมื่อไม่มี Avatar เขียวบนมือ');
  const b = board(s => {
    put(s, 'A.hand', GEM4);
    return { job: put(s, 'A.magic', 'CC02-044', placed), target: put(s, 'A.hand', GEM3) };
  });
  playTurn(b.st);
  ok(E.zoneOf(b.st, b.target) === 'A.avatar', 'มี Avatar เขียวแล้วลงสนามได้');
}

/* 12) นโยบายตี LIFE ตามแนวเด็ค */
{
  const AI = globalThis.BotAI;
  const byType = (pace, primary) => JSON.parse(fs.readFileSync(path.join(__dirname, '../data/public-decks.json'), 'utf8')).decks.find(d => {
    const list = [];
    Object.entries(d.main).forEach(([code, n]) => {
      const c = cards.find(x => x.code === code);
      if (c) for (let i = 0; i < n; i++) list.push(c);
    });
    const p = U.analyzeDeck(list);
    return p.pace === pace && p.primary === primary && (primary !== 'control' || p.roleSum.control - p.roleSum.aggro > 20);
  });
  const REACT = cards.find(c => c.subtype === 'React').code;
  const decks = { fast: byType('fast', 'aggro'), control: byType('slow', 'control'), mid: byType('mid', 'ramp') };
  const hit = (type, o) => {
    const { st } = board(s => {
      s.zones['A.deck'] = [];
      s.zones['A.life'] = [];
      Object.entries(decks[type].main).forEach(([code, n]) => { for (let i = 0; i < n; i++) put(s, 'A.deck', code); });
      for (let i = 0; i < (o.oppHand || 0); i++) put(s, 'B.hand', GEM3);
      for (let i = 0; i < (o.ready || 1); i++) put(s, 'A.avatar', GEM3);
      if (o.react) put(s, 'A.hand', REACT);
      return {};
    });
    st.zones['B.life'].slice(0, o.up || 0).forEach(k => { st.inst[k].faceUp = true; });
    return AI.shouldLifeAttack(st, 'A', {});
  };
  ok(hit('mid', { oppHand: 4 }) && hit('mid', { oppHand: 4, up: 2 }), 'เปิดใบที่ 1-3 ตีปกติ');
  ok(!hit('mid', { oppHand: 4, up: 3 }), 'ใบที่ 4 สวนไม่ได้ ไม่ตี');
  ok(hit('mid', { oppHand: 4, up: 3, react: true }), 'ใบที่ 4 มี React สวน ตี');
  ok(hit('mid', { oppHand: 4, up: 3, ready: 2 }), 'ใบที่ 4 ยังเหลือตัวตื่น ตี');
  ok(hit('fast', { oppHand: 4, up: 3 }) && hit('fast', { oppHand: 1 }), 'เด็คปูบอร์ดไว ตีรวดเดียว');
  ok(!hit('control', { oppHand: 4 }), 'เด็คตั้งรับ ไม่ตี');
  ok(hit('mid', { oppHand: 2 }), 'มือศัตรูน้อย ใบที่ 1-3 ยังตีปกติ');
  ok(!hit('mid', { oppHand: 2, up: 3, react: true }), 'มือศัตรูน้อย ใบที่ 4 ไม่ตีแม้สวนได้');
  ok(hit('control', { oppHand: 7 }) && hit('mid', { oppHand: 7, up: 3 }), 'มือศัตรูเกิน 6 ตีบังคับให้เล่น');
  ok(hit('control', { oppHand: 1, up: 5 }), 'LIFE หงายหมด ปิดเกมเสมอ');
}

/* 13) กันบอทค้าง: พรอมป์ต์ชื่อไม่ซ้ำ และการสั่งใช้ที่กระดานไม่เปลี่ยน */
{
  const { st } = board(s => {
    const src = put(s, 'A.avatar', GEM3);
    const dup = put(s, 'A.hell', GEM3);
    s.prompts.push({
      kind: 'pick', from: 'hell', src, chooser: 'A', filter: { type: 'Avatar' }, dest: 'exileDistinctHell',
      optional: true, multiMax: 99, multiGot: 1, seenNames: { [s.inst[dup].name]: true },
    });
    return {};
  });
  const acts = playTurn(st);
  ok(!acts.some(a => a.type === 'chooseTarget') && st.active === 'B', 'ไม่เลือกชื่อซ้ำ แล้วเล่นต่อจนจบเทิร์น');

  const b = board(s => ({ shiva: put(s, 'A.avatar', 'CC01-001') }));
  let tries = 0;
  const bot = Core.createPlayer({
    side: 'A', level: () => 'normal', state: () => b.st, schedule() { },
    send(a) { if (a.type === 'activateAbility') tries++; return {}; },
  });
  for (let i = 0; i < 40; i++) bot.tick();
  ok(tries > 0 && tries <= 6, 'สั่งใช้ซ้ำโดยกระดานไม่เปลี่ยน หยุดที่ ' + tries + ' ครั้ง');
}

console.log('bot story evolve: all passed');
