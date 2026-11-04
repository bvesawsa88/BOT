/* โหมดผจญภัย — สุ่มเด็คบอทต้องถูกกติกาทุกครั้ง + เล่นจริงบนเอนจินได้ */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
global.BoTEngine = BoT;
const Core = require('../js/bot-core.js');
const C = require('../js/campaign.js');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const ban = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/banlist.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));
BoT.mergeEffects(cards.map(c => ({ code: c.code, name: c.name })));

function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }

const rules = C.makeRules(cards, ban);
const fxC = {};
const effectOf = (code, name) => (code in fxC ? fxC[code] : (fxC[code] = BoT.effectOf(code, name)));
const by = {};
cards.forEach(c => { if (!by[c.code] || c.image === c.code + '.png') by[c.code] = c; });

let bad = 0;
const colorsSeen = {}, stylesSeen = {};
for (let i = 0; i < 300; i++) {
  const d = C.generateDeck(cards, { rng: C.makeRng(1000 + i), effectOf, rules, tier: (i % 10) / 10 });
  const errs = C.validateDeck(d, cards, rules);
  colorsSeen[d.colors.join('+')] = (colorsSeen[d.colors.join('+')] || 0) + 1;
  stylesSeen[d.style] = (stylesSeen[d.style] || 0) + 1;
  // ทุกใบเล่นได้ + เพชรจ่ายสีเด็คได้ + Avatar อยู่ในสีเด็ค
  Object.keys(d.main).concat(Object.keys(d.life)).forEach(k => {
    const c = by[k];
    if (!C.playable(c, effectOf)) errs.push('unplayable ' + k);
    if (c.type === 'Avatar' && c.color && !d.colors.includes(c.color)) errs.push('off-color ' + k);
  });
  if (errs.length) { bad++; if (bad < 5) console.log('deck', i, errs.slice(0, 5)); }
}
ok(bad === 0, '300 random decks are legal (50+5, Only#1, limits, ban, colors)');
ok(Object.keys(colorsSeen).length >= 4, 'color variety ' + JSON.stringify(colorsSeen));
ok(Object.keys(stylesSeen).length === 3, 'style variety ' + JSON.stringify(stylesSeen));

// ด่าน: seed เดิมได้ผลเดิม · สุ่มใหม่ได้คู่ต่อสู้ใหม่
const s1 = C.stageInfo(7, 'abc', 0), s1b = C.stageInfo(7, 'abc', 0), s2 = C.stageInfo(7, 'abc', 1);
ok(s1.name === s1b.name && s1.seed === s1b.seed, 'stage deterministic');
ok(s1.seed !== s2.seed, 'reroll changes seed');
ok(C.stageInfo(5, 'x').boss && C.stageInfo(10, 'x').bigBoss && !C.stageInfo(6, 'x').boss, 'boss every 5');
ok(C.stageInfo(1, 'x').level === 'easy' && C.stageInfo(30, 'x').level === 'nightmare', 'difficulty ramps');
ok(C.stageInfo(999, 'x').chapter.title.length > 0, 'endless stages');

// ความคืบหน้า
const p = C.normalize(null);
const r1 = C.applyResult(p, 1, true, 0, C.stageInfo(1, p.salt));
ok(r1.stars === 3 && p.stage === 2 && p.best === 1 && r1.xp > 0, 'win advances stage + xp');
const r2 = C.applyResult(p, 2, false, 5, C.stageInfo(2, p.salt));
ok(!r2.won && p.stage === 2 && p.streak === 0, 'loss keeps stage');

// เล่นจริง: เด็คสุ่ม vs เด็คสุ่ม
// ประเภทด่านพิเศษ
const kinds = {};
for (let n = 1; n <= 60; n++) { const k = C.stageInfo(n, 'kinds').kind; kinds[k] = (kinds[k] || 0) + 1; }
ok(['normal', 'tribe', 'rush', 'mono', 'elite', 'legend', 'boss', 'bigBoss'].every(k => kinds[k]), 'all stage kinds appear in 60 stages ' + JSON.stringify(kinds));
ok(C.stageInfo(7, 'x').kind === 'elite' && C.stageInfo(3, 'x').kind === 'tribe' && C.stageInfo(8, 'x').kind === 'legend', 'kinds by position');
ok(C.stageInfo(7, 'x').xp > C.stageInfo(6, 'x').xp, 'elite gives more xp');
ok(C.chapterInfo(71).name !== C.chapterInfo(1).name && C.chapterInfo(121).name === C.chapterInfo(1).name, '12 chapters before cycling');
let tribeHit = 0, monoBad = 0, kindBad = 0;
for (let i = 0; i < 80; i++) {
  const t = C.generateDeck(cards, { rng: C.makeRng(5000 + i), effectOf, rules, tier: 0.5, theme: '*', mono: true });
  if (C.validateDeck(t, cards, rules).length) kindBad++;
  if (t.colors.length !== 1) monoBad++;
  if (t.theme) {
    const n = Object.entries(t.main).reduce((a, [k, v]) => a + (by[k].type === 'Avatar' && String(by[k].symbol).includes(t.theme) ? v : 0), 0);
    if (n >= 12) tribeHit++;
  }
}
ok(kindBad === 0 && monoBad === 0, 'tribe/mono decks legal + single color');
ok(tribeHit >= 60, `tribe decks focus on one tribe (${tribeHit}/80 with ≥12 tribe avatars)`);
const pc = C.normalize(null);
for (let n = 1; n <= 10; n++) var rc = C.applyResult(pc, n, true, 0, C.stageInfo(n, pc.salt));
ok(rc.chapterBonus > 0 && pc.stage === 11, 'chapter clear bonus at stage 10');

// เด็คชุมชน bottcg.com
const pubFile = path.join(__dirname, '../data/public-decks.json');
const pub = fs.existsSync(pubFile) ? JSON.parse(fs.readFileSync(pubFile, 'utf8')).decks : [];
ok(pub.length >= 50, 'community decks synced: ' + pub.length);
const pubBad = pub.filter(d => C.validateDeck(d, cards, rules).some(e => !/^PR /.test(e)));
ok(pubBad.length === 0, 'all community decks legal (50+5, Only#1, limits, ban)');
const pickKinds = { boss: 0, mono: 0, tribe: 0, legend: 0, normal: 0 };
for (let i = 0; i < 400; i++) {
  const info = C.stageInfo(1 + (i % 40), 'pub' + i);
  const d = C.pickPublicDeck(pub, info, C.makeRng(i + 1));
  if (!d) { if (info.boss || info.kind === 'elite' || info.kind === 'legend') fail('strong stage got no community deck'); continue; }
  if (info.kind === 'mono' && d.colors.length !== 1) fail('mono stage picked multi-color deck');
  if (info.kind === 'tribe' && !d.tribe) fail('tribe stage picked deck without tribe');
  if (pickKinds[info.kind] != null) pickKinds[info.kind]++;
}
ok(pickKinds.boss > 0 && pickKinds.mono > 0 && pickKinds.tribe > 0 && pickKinds.normal > 0, 'community decks match stage kinds ' + JSON.stringify(pickKinds));
const bossPicks = new Set();
for (let i = 0; i < 200; i++) { const d = C.pickPublicDeck(pub, C.stageInfo(10, 'b' + i), C.makeRng(i + 9)); bossPicks.add(d.id); }
const topIds = new Set(pub.slice(0, Math.ceil(pub.length * 0.1)).map(d => d.id));
ok([...bossPicks].every(id => topIds.has(id)), 'big boss uses top-10% liked decks');

const t0 = Date.now();
let finished = 0;
for (let g = 0; g < 4; g++) {
  const A = pub[(g * 37) % pub.length], B = pub[(g * 53 + 11) % pub.length];
  const res = Core.playMatch(cards, { A, B }, { seed: 300 + g, maxSteps: 700, maxTurns: 30 });
  console.log('  community game', g, A.name, 'vs', B.name, '→', res.over ? 'winner ' + res.winner : 'cap', 'turn', res.turns, 'steps', res.steps);
  if (res.steps < 10) fail('community game ' + g + ' stalled');
  if (res.over) finished++;
}
ok(finished >= 2, `community self-play finished ${finished}/4`);
finished = 0;
for (let g = 0; g < 6; g++) {
  const A = C.generateDeck(cards, { rng: C.makeRng(77 + g), effectOf, rules, tier: 0.5 });
  const B = C.generateDeck(cards, { rng: C.makeRng(177 + g), effectOf, rules, tier: 0.8 });
  const res = Core.playMatch(cards, { A, B }, { seed: 11 + g, maxSteps: 700, maxTurns: 30 });
  if (res.over) finished++;
  console.log('  game', g, A.colors.join('+'), A.style, 'vs', B.colors.join('+'), B.style, '→', res.over ? 'winner ' + res.winner : 'cap', 'turn', res.turns, 'steps', res.steps);
  if (res.steps < 10) fail('game ' + g + ' stalled');
}
ok(finished >= 3, `self-play finished ${finished}/6 games (${Date.now() - t0}ms)`);
console.log('campaign: all passed');
