/* focused: คลื่น 0 ชุด meta ที่เอ็นจินมีแล้ว — จีสัส / ราชา / ทหาร / ขวาน / นัท / เทอราโนดอน / ดาบ / วัด / แฮหัวตุ้น */
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
    phase: 'Battle', active: 'A', turn: 2, turnSeq: 2,
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
function padDecks(st) {
  put(st, 'A.deck', 'SD01-003');
  put(st, 'A.deck', 'SD01-011');
  put(st, 'B.deck', 'SD01-003');
  put(st, 'B.deck', 'SD01-011');
}

/* 1) จีสัส: มือไม่ว่างโจมตีไม่ได้ */
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  padDecks(st);
  const jesus = put(st, 'A.avatar', 'BT03-009');
  put(st, 'A.hand', 'SD01-011');
  const foe = put(st, 'B.avatar', 'SD01-011');
  const fx = apply(st, { type: 'declareAttack', atk: jesus, def: foe, by: 'A', seed: 1 });
  ok(!!fx.deny && /มือ/.test(fx.deny), 'jesus blocked while hand not empty: ' + (fx.deny || 'no deny'));
}
{
  const st = emptyState({ phase: 'Battle', active: 'A' });
  padDecks(st);
  const jesus = put(st, 'A.avatar', 'BT03-009');
  const foe = put(st, 'B.avatar', 'SD01-011');
  const fx = apply(st, { type: 'declareAttack', atk: jesus, def: foe, by: 'A', seed: 2 });
  ok(!fx.deny, 'jesus attacks with empty hand: ' + (fx.deny || ''));
}

/* 2) ราชา: ไม่ถูกทำลายจากการต่อสู้กับ Cost น้อยกว่า */
{
  const st = emptyState({ phase: 'Battle', active: 'B' });
  padDecks(st);
  const king = put(st, 'A.avatar', 'BT03-028'); // C4 P3
  const weak = put(st, 'B.avatar', 'SD01-011'); // C0 P1 — buff him
  st.inst[weak].power = 9;
  let fx = apply(st, { type: 'declareAttack', atk: weak, def: king, by: 'B', seed: 3 });
  if (fx.deny) fail('king declare deny: ' + fx.deny);
  let guard = 0;
  while (st.pending && guard++ < 8) {
    const pr = (st.prompts || [])[0];
    if (pr && pr.kind === 'react') {
      fx = apply(st, { type: 'reactNo', by: pr.chooser, seed: 4 + guard });
      continue;
    }
    fx = apply(st, { type: 'resolveAttack', by: st.pending.target, seed: 10 + guard });
    if (fx.deny) fail('king resolve deny: ' + fx.deny);
  }
  ok(BoT.zoneOf(st, king) === 'A.avatar', 'king survived vs lower cost');
}

/* 3) ทหาร: Cost -1 ศัตรู + POWER=2 เมื่อมีราชา */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  const soldier = put(st, 'A.avatar', 'BT03-029');
  const enemy = put(st, 'B.avatar', 'SD01-003'); // printed C2
  ok(BoT.effCost(st, enemy) === 1, 'enemy cost -1 from soldier aura: ' + BoT.effCost(st, enemy));
  ok(BoT.effPower(st, soldier) === 0, 'soldier P0 without king');
  put(st, 'A.avatar', 'BT03-028');
  ok(BoT.effPower(st, soldier) === 2, 'soldier P2 with king');
}

/* 4) ขวานไม้: โฮสต์ Cost -1 */
{
  const st = emptyState();
  const host = put(st, 'A.avatar', 'SD01-003'); // C2
  const axe = put(st, 'A.magic', 'BT03-054');
  st.inst[axe].attachedTo = host;
  ok(BoT.effCost(st, host) === 1, 'axe host cost -1: ' + BoT.effCost(st, host));
}

/* 5) นัท: กันยึด ยกเว้นอีช่า */
{
  const e = BoT.effectOf('BT04-003');
  ok(e && e.controlImmune && e.controlImmuneExcept === 'อีช่า', 'nut controlImmune except eisha');
}

/* 6) ดาบ: Cost +2 และถ้า Cost≥6 POWER +1 */
{
  const st = emptyState();
  const host = put(st, 'A.avatar', 'BT03-028'); // C4
  const sword = put(st, 'A.magic', 'BT04-055');
  st.inst[sword].attachedTo = host;
  ok(BoT.effCost(st, host) === 6, 'sword host cost +2: ' + BoT.effCost(st, host));
  ok(BoT.effPower(st, host) === 4, 'sword +1 power because cost>=6: ' + BoT.effPower(st, host));
  const cheap = put(st, 'A.avatar', 'SD01-011'); // C0
  const sword2 = put(st, 'A.magic', 'BT04-055');
  st.inst[sword2].attachedTo = cheap;
  ok(BoT.effPower(st, cheap) === 1, 'sword no bonus when host cost <6: ' + BoT.effPower(st, cheap));
}

/* 7) เทอราโนดอน / วัด: meta scout bonus ติดใน effects-all */
{
  const tera = BoT.effectOf('BT04-011');
  ok(tera && tera.scoutBonusOwnKapom === 1, 'teranodon scoutBonusOwnKapom');
  const wat = BoT.effectOf('SD06-019');
  ok(wat && wat.scoutBonusConstruct === 2, 'temple scoutBonusConstruct');
}

/* 8) แฮหัวตุ้น: ถูกอัญเชิญโดยขุนพล ต่างชาติ → เลือกทำลาย */
{
  const st = emptyState({ phase: 'Main', active: 'A' });
  padDecks(st);
  const gen = put(st, 'A.avatar', 'SD07-001');
  st.inst[gen].granted = [{
    trigger: { on: 'activated' },
    actions: [{ op: 'deckPick', filter: { nameIncludes: ['แฮหัวตุ้น'] }, dest: 'avatar', paidCost: false, shuffleAfter: true }]
  }];
  const dun = put(st, 'A.deck', 'SD07-003');
  const fodder = put(st, 'B.avatar', 'SD01-011');
  let fx = apply(st, { type: 'activateAbility', k: gen, by: 'A', seed: 20 });
  if (fx.deny) fail('gen activate deny: ' + fx.deny);
  fx = apply(st, { type: 'chooseTarget', k: dun, by: 'A', seed: 21 });
  if (fx.deny) fail('summon dun deny: ' + fx.deny);
  ok(BoT.zoneOf(st, dun) === 'A.avatar', 'dun on field');
  const pr = (st.prompts || [])[0];
  ok(pr && pr.kind === 'chooseDestroy', 'dun destroy prompt: ' + JSON.stringify(pr && { kind: pr.kind, dest: pr.dest }));
  fx = apply(st, { type: 'chooseTarget', k: fodder, by: 'A', seed: 22 });
  if (fx.deny) fail('dun destroy deny: ' + fx.deny);
  ok(BoT.zoneOf(st, fodder) === 'B.hell', 'fodder destroyed');
}

console.log('wave0 meta batch: all passed');
