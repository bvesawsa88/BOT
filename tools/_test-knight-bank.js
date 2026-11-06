/* focused: อัศวินแบงค์ (BT07-021) ทิ้งมือ GEM รวมพอดี 3 อัญเชิญตัวเอง POWER ตั้งต้น 3 · SD Plaza เทค 2 ไม่มีเป้าต้องเลือกไม่ได้ */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

function emptyState() {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => {
    ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; });
  });
  return {
    inst: {}, zones, phase: 'Main', active: 'B', turn: 5, turnSeq: 5,
    strict: true, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [],
    magicUsed: { A: {}, B: {} }, log: [], mulliganDone: { A: true, B: true }, awaitBattleStart: false
  };
}
function put(st, zone, code, extra) {
  const c = cards.find(x => x.code === code);
  if (!c) throw new Error('missing ' + code);
  const k = 't' + (Object.keys(st.inst).length + 1);
  st.inst[k] = Object.assign({
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '',
    symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '',
    cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—',
    img: '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  }, extra || {});
  st.zones[zone].push(k);
  return k;
}
function ok(cond, msg) { if (!cond) { console.error('FAIL', msg); process.exit(1); } console.log('ok', msg); }
const logText = st => (st.log || []).map(x => x.t).join(' | ');
const FILLER = 'SD01-008';
const KNIGHT = 'BT07-021';
const activate = (st, k) => BoT.applyAction(st, { type: 'activateAbility', k, by: 'B', seed: 1 });
const discard = (st, k) => BoT.applyAction(st, { type: 'chooseTarget', k, by: 'B', seed: 1 });

/* 1) ทิ้ง GEM 3 ใบเดียว → ลงสนาม POWER 3 */
{
  const st = emptyState();
  const knight = put(st, 'B.hand', KNIGHT);
  const pay = put(st, 'B.hand', FILLER, { gem: 3 });
  const fx = activate(st, knight);
  ok(!fx.deny, 'สั่งใช้ได้เมื่อมี GEM 3');
  ok(st.prompts.length === 1 && st.prompts[0].kind === 'chooseDiscard', 'ขึ้นหน้าต่างทิ้งมือ');
  const fx2 = discard(st, pay);
  ok(!fx2.deny, 'ทิ้งจ่ายได้ ' + (fx2.deny || ''));
  ok(st.zones['B.avatar'].includes(knight), 'อัศวินแบงค์ลงสนาม');
  ok(st.zones['B.hell'].includes(pay), 'ใบที่จ่ายลงนรก');
  ok(BoT.effPower(st, knight) === 3, 'POWER ตั้งต้น 3 (ได้ ' + BoT.effPower(st, knight) + ')');
}

/* 2) ทิ้งหลายใบรวมพอดี */
{
  const st = emptyState();
  const knight = put(st, 'B.hand', KNIGHT);
  const a = put(st, 'B.hand', FILLER, { gem: 2 });
  const b = put(st, 'B.hand', FILLER, { gem: 1 });
  activate(st, knight);
  discard(st, a);
  ok(!st.zones['B.avatar'].includes(knight), 'ยังไม่ครบ ยังไม่ลงสนาม');
  discard(st, b);
  ok(st.zones['B.avatar'].includes(knight), 'GEM 2+1 ลงสนาม');
}

/* 3) รวมพอดีไม่ได้ — deny ไม่สแปม log (ต้นเหตุบั๊กบอทวน) */
[[0, 0], [2, 2], [1, 1], [4, 5]].forEach(gems => {
  const st = emptyState();
  const knight = put(st, 'B.hand', KNIGHT);
  gems.forEach(g => put(st, 'B.hand', FILLER, { gem: g }));
  const fx = activate(st, knight);
  ok(!!fx.deny, `GEM ${gems} — deny: ${fx.deny}`);
  ok(!/⚡ สั่งใช้จากมือ/.test(logText(st)) && !st.prompts.length, `GEM ${gems} — ไม่มี log/prompt`);
});

/* 4) GEM 2,2,3: ห้ามเลือกใบ 2 ที่ทำให้ต่อไม่ครบแล้วเสียการ์ดฟรี */
{
  const st = emptyState();
  const knight = put(st, 'B.hand', KNIGHT);
  put(st, 'B.hand', FILLER, { gem: 2 });
  put(st, 'B.hand', FILLER, { gem: 2 });
  const three = put(st, 'B.hand', FILLER, { gem: 3 });
  activate(st, knight);
  const cands = BoT.promptCandidates(st, st.prompts[0]);
  ok(cands.length === 1 && cands[0] === three, 'เลือกได้เฉพาะใบ GEM 3');
}

/* 5) ออกจากสนามแล้ว POWER ตั้งต้นกลับเป็นปกติ */
{
  const st = emptyState();
  const knight = put(st, 'B.hand', KNIGHT);
  const pay = put(st, 'B.hand', FILLER, { gem: 3 });
  activate(st, knight);
  discard(st, pay);
  BoT.doMove(st, knight, 'B.hand', null, {});
  ok(st.inst[knight].baseOverride == null, 'กลับขึ้นมือแล้วล้าง POWER ตั้งต้น 3');
}

/* 6) SD Plaza: Magic Zone ไม่มี Avatar — เลือกเทค 2 ไม่ได้ */
{
  const st = emptyState();
  const land = put(st, 'land', 'CC01-050');
  const e = BoT.effectOf('CC01-050', st.inst[land].name);
  const opts = e.abilities[0].actions[0].options;
  ok(!!BoT.chooseModeOptionDeny(st, land, 'B', opts[1]), 'ไม่มีเป้า เทค 2 ถูกปฏิเสธ');
  put(st, 'B.magic', FILLER);
  ok(!BoT.chooseModeOptionDeny(st, land, 'B', opts[1]), 'มี Avatar บน Magic Zone เทค 2 ใช้ได้');
}
/* 7) บอทจริง: เด็คมี 4 ใบ ต้องไม่สแปมสั่งใช้ซ้ำใบเดิม */
{
  global.BoTEngine = BoT;
  require('../js/bot-universal.js');
  const Core = require('../js/bot-core.js');
  const starters = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/starters.json'), 'utf8'));
  const deck = JSON.parse(JSON.stringify(starters.SD02));
  delete deck.main['SD02-006'];
  deck.main[KNIGHT] = 4;
  // log ถูกตัดเหลือ 200 บรรทัด — ดักทุกบรรทัดที่ push เข้ามาระหว่างเกม
  const push = Array.prototype.push;
  let lines = [];
  Array.prototype.push = function (...xs) {
    xs.forEach(x => { if (x && typeof x.t === 'string' && 'p' in x) push.call(lines, x.t); });
    return push.apply(this, xs);
  };
  try {
    [11, 42, 77].forEach(seed => {
      lines = [];
      Core.playMatch(cards, { A: deck, B: starters.SD01 }, { seed, maxSteps: 900, maxTurns: 30 });
      let run = 0, worst = 0;
      lines.forEach(l => { run = /⚡ สั่งใช้จากมือ อัศวินแบงค์/.test(l) ? run + 1 : 0; worst = Math.max(worst, run); });
      if (worst > 1) throw new Error('seed ' + seed + ': สั่งใช้ซ้ำติดกัน ' + worst + ' ครั้ง');
    });
  } finally { Array.prototype.push = push; }
  ok(true, 'ทุกเกมไม่สั่งใช้อัศวินแบงค์ซ้ำติดกัน');
}
console.log('ALL OK');
