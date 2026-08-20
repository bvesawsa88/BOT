/* Universal Adaptive AI — วิเคราะห์การ์ด/เด็คจาก properties จริง ไม่ใช้ชื่อเด็ค */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
global.BoTEngine = BoT;
const U = require('../js/bot-universal.js');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8'));
const starters = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/starters.json'), 'utf8'));
BoT.loadEffects(effects);

function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }

const byCode = {};
cards.forEach(c => { if (c && c.code && (!byCode[c.code] || c.image === c.code + '.png')) byCode[c.code] = c; });

function expand(spec) {
  const out = [];
  Object.entries((spec && spec.main) || {}).forEach(([code, n]) => {
    const c = byCode[code];
    if (c) for (let i = 0; i < (+n || 0); i++) out.push(c);
  });
  return out;
}

ok(typeof U.analyzeCard === 'function', 'CardAnalyzer exported');
ok(typeof U.analyzeDeck === 'function', 'DeckAnalyzer exported');
ok(typeof U.analyzeState === 'function', 'GameStateAnalyzer exported');
ok(typeof U.chooseAction === 'function', 'MoveEvaluator exported');
ok(U.analyzeDeck.length === 1, 'analyzeDeck takes cards only — no deckName');

const destroyCard = byCode['BT01-001'];
ok(destroyCard, 'BT01-001 in cards.json');
const pDestroy = U.analyzeCard(destroyCard);
ok(pDestroy.ops.indexOf('destroyTarget') >= 0, 'ops from effect: destroyTarget');
ok((pDestroy.tags.removal || 0) > 0, 'destroyTarget → removal tag');
ok((pDestroy.tags.destroy || 0) > 0, 'destroyTarget → destroy tag');

const landCard = cards.find(c => c.subtype === 'Land' && c.code);
ok(landCard, 'has a Land card');
const pLand = U.analyzeCard(landCard);
ok(pLand.isLand && (pLand.tags.land || 0) > 0, 'Land subtype → land tag');

const kick = cards.find(c => c.code && (BoT.keywordsOf(c.code, c.name) || []).indexOf('เตะไข่') >= 0);
if (kick) {
  const pk = U.analyzeCard(kick);
  ok(pk.hasKickEgg && (pk.tags.finisher || 0) > 0, 'เตะไข่ keyword → finisher (not by card name)');
} else {
  console.log('skip kick-egg keyword sample (none loaded)');
}

const sd01 = expand(starters.SD01);
const sd02 = expand(starters.SD02);
ok(sd01.length >= 40 && sd02.length >= 40, 'starter lists expand from cards.json');

const d1 = U.analyzeDeck(sd01);
const d2 = U.analyzeDeck(sd02);
ok(d1.primary && d2.primary, 'archetype from composition: ' + d1.primary + ' / ' + d2.primary);
ok(d1.fingerprint !== d2.fingerprint, 'different decks → different fingerprints');
ok(Array.isArray(d1.winConditions), 'win conditions listed');
ok(!('deckName' in d1) && !d1.name, 'deck profile has no deckName field');

const mixed = sd01.slice(0, 20).concat(sd02.slice(0, 20));
const dm = U.analyzeDeck(mixed);
ok(dm.primary, 'unseen mix still gets a strategy: ' + dm.primary + (dm.secondary ? '/' + dm.secondary : ''));
ok(dm.size === mixed.length, 'mixed deck size');

const sPlay = U.scoreDeck(sd01);
ok(typeof sPlay.score === 'number' && sPlay.why, 'scoreDeck playability: ' + sPlay.why);

const st = BoT.buildInitialState(cards, () => 0.3, {
  A: starters.SD01,
  B: starters.SD02,
});
U.beginMatch(st, { botSide: 'B' });
const state = U.analyzeState(st, 'B');
ok(state.goal && state.stance, 'game state: stance=' + state.stance + ' goal=' + state.goal);
ok(state.handN === 5, 'opening hand 5');
ok(state.oppHand === 5, 'opp hand count only — no hidden cards');

const opp = U.modelOpponent(st, 'A');
ok(opp.confidence < 0.9, 'opponent model uses probability (conf=' + opp.confidence.toFixed(2) + ')');
ok(opp.handN === 5 && opp.seen < 20, 'does not read opp deck/hand contents');

const cands = U.collectLegalMains(st, 'B');
ok(cands.length >= 1, 'candidate generator from real engine state: ' + cands.length);
const pick = U.chooseAction(st, 'B', cands, { beam: 6 });
ok(pick && (pick.a || pick.fallback || pick.pass), 'chooseAction returns a decision');
const ex = U.formatExplain();
ok(/Current Strategy/.test(ex), 'debug explain:\n' + ex.split('\n').slice(0, 6).join('\n'));

const ids = U.mulliganIds(st, 'B');
ok(Array.isArray(ids), 'mulligan returns id list (' + ids.length + ' drops)');

console.log('bot-universal unit: all passed');
console.log('SD01', d1.primary, d1.landIdentity || 'no-land', 'WC', (d1.winConditions[0] && d1.winConditions[0].type) || '-');
console.log('SD02', d2.primary, d2.landIdentity || 'no-land', 'WC', (d2.winConditions[0] && d2.winConditions[0].type) || '-');
console.log('mix ', dm.primary, dm.hybrid ? dm.secondary : '');
