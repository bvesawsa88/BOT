/* Self-play บน BoTEngine จริง — Bot A vs Bot B ด้วย Universal AI (ไม่ใช้ชื่อเด็ค) */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
global.BoTEngine = BoT;
const U = require('../js/bot-universal.js');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));
const starters = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/starters.json'), 'utf8'));

function fail(msg) { console.error('FAIL', msg); process.exit(1); }
function ok(cond, msg) { if (!cond) fail(msg); console.log('ok', msg); }

ok(starters.SD01 && starters.SD02, 'starter decks loaded');

const src = fs.readFileSync(path.join(__dirname, '../js/bot-universal.js'), 'utf8');
ok(!/deckName\s*===\s*['"]/.test(src), 'no deckName === hard-code in BotUniversal');
ok(!/if\s*\(\s*deck\s*===\s*['"]/.test(src), 'no if (deck === ...) strategy branch');

const t0 = Date.now();
const g1 = U.playGame(cards, { A: starters.SD01, B: starters.SD02 }, { seed: 42, maxSteps: 420, maxTurns: 24 });
ok(g1.steps > 8, 'game1 ran ' + g1.steps + ' steps / turn ' + g1.turns + (g1.over ? ' winner=' + g1.winner : ' (cap)'));
ok(g1.st && g1.st.zones['A.hand'] && g1.st.zones['B.hand'], 'engine zones intact');

const g2 = U.playGame(cards, { A: starters.SD02, B: starters.SD01 }, { seed: 99, maxSteps: 420, maxTurns: 24 });
ok(g2.steps > 8, 'game2 ran ' + g2.steps + ' steps / turn ' + g2.turns + (g2.over ? ' winner=' + g2.winner : ' (cap)'));

const srcAi = fs.readFileSync(path.join(__dirname, '../js/bot-ai.js'), 'utf8');
ok(/BotUniversal/.test(srcAi), 'legacy BotAI delegates to Universal');

const ms = Date.now() - t0;
ok(ms < 45000, 'self-play finished in ' + ms + 'ms');
console.log('bot-universal self-play: all passed (' + ms + 'ms)');
console.log('  SD01 vs SD02:', g1.over ? ('winner ' + g1.winner) : 'unfinished', 'steps', g1.steps);
console.log('  SD02 vs SD01:', g2.over ? ('winner ' + g2.winner) : 'unfinished', 'steps', g2.steps);
