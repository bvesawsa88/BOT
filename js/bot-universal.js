/* BotUniversal — Adaptive AI ที่อ่านคุณสมบัติการ์ด + ความสัมพันธ์ + สถานการณ์
   ไม่ผูก Strategy กับชื่อเด็ค ใช้คู่กับ heuristic กติกาใน bot-ai.js / game.js
   โมดูล: CardAnalyzer · DeckAnalyzer · StrategyEngine · GameStateAnalyzer ·
          OpponentModel · CandidateMove · MoveEvaluator · SearchEngine ·
          MulliganEngine · MatchupAnalyzer · LearningEngine · SelfPlayEngine · DebugEngine */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BotUniversal = api;
})(typeof self !== 'undefined' ? self : typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  if (!root.BoTEngine && typeof require === 'function') {
    try { root.BoTEngine = require('./engine.js'); } catch (e) { }
  }

  const LS_LEARN = 'bot_universal_learn_v1';
  const LS_DEBUG = 'bot_ai_debug';
  const CARD_CACHE_MAX = 4000;
  const BEAM_HARD = 12;
  const BEAM_NORMAL = 8;

  const TAGS = [
    'cost', 'attack', 'defense', 'damage', 'heal', 'draw', 'search', 'discard',
    'destroy', 'summon', 'buff', 'debuff', 'removal', 'control', 'resource',
    'combo', 'finisher', 'protection', 'disruption', 'recovery', 'land',
    'react', 'tempo', 'mill', 'life',
  ];

  const OP_TAGS = {
    draw: ['draw', 'resource'], drawHellUnique: ['draw', 'recovery'], drawIfOwnHellTypeMin: ['draw'],
    drawProvisions: ['draw', 'resource'],
    scout: ['search'], deckPick: ['search'], deckPickMulti: ['search'], deckOrHellPick: ['search', 'recovery'],
    magicPick: ['search'], darkPick: ['search'], peekOwnTop: ['search'], revealDeckThenTop: ['search'],
    hellPick: ['recovery', 'search'], hellPickMulti: ['recovery'], hellReturnFilter: ['recovery'],
    summonSelfFromHell: ['summon', 'recovery'], summonSelfFromHandFree: ['summon'], summonSelfFromHandPaying: ['summon'],
    summonSelfFromMagic: ['summon'], summonSelfFromDark: ['summon'], handSummon: ['summon'],
    offerSummonSelfFromHell: ['summon', 'recovery'], bothDeckSummonCostMax: ['summon'],
    chooseDestroy: ['removal', 'destroy'], destroy: ['removal', 'destroy'], destroyTarget: ['removal', 'destroy'],
    destroyAllEnemyAvatars: ['removal', 'destroy', 'finisher'], destroyAllAvatarsExceptSelf: ['removal', 'destroy'],
    destroyAttacker: ['defense', 'removal'], destroyAttackTarget: ['removal', 'destroy'],
    destroyHighestPower: ['removal', 'destroy'], sendAttackerToHell: ['defense', 'removal'],
    bounce: ['disruption', 'removal'], returnToHand: ['disruption'], bounceAttackTarget: ['defense', 'disruption'],
    bounceTappedToDeckDraw: ['disruption', 'draw'], bounceOwnThenSummonSelf: ['summon', 'tempo'],
    mill: ['mill', 'disruption'], millChooseCount: ['mill'], millScouted: ['mill', 'search'],
    modifyPower: ['buff'], setAlliesPowerToSelf: ['buff'], setPrintedPower: ['buff'], grantCostPower: ['buff'],
    grantKeyword: ['buff'], grantSelfKeyword: ['buff'], grantSelfAbilities: ['buff'], grantBuffSummoned: ['buff'],
    curseEnemy: ['debuff', 'disruption'], weakenAttacker: ['debuff', 'defense'],
    negate: ['disruption', 'control'], negateByGiveHand: ['disruption'],
    preventDestroy: ['protection'], preventDestroySelf: ['protection'], grantCombatImmune: ['protection'],
    grantCombatImmuneAllOwn: ['protection'], grantProtectSummoned: ['protection'], grantProtectMagicLeaveSummoned: ['protection'],
    cancelAttack: ['defense'], cancelAttackByRestAlly: ['defense'], redirectPendingAttackToSelf: ['defense'],
    discard: ['discard'], discardOppRandom: ['disruption', 'discard'], discardAnyThenSummon: ['summon', 'discard'],
    sacrifice: ['risk'], sacrificeSelf: ['risk'], sacrificeHandOrField: ['risk'],
    tap: ['disruption', 'control'], untap: ['tempo', 'resource'], untapHost: ['tempo'],
    takeControl: ['control'], switchControl: ['control'],
    revealOppLifeTop: ['life', 'finisher'], revealOppLifeOrWin: ['life', 'finisher'], revealOwnLife: ['life'],
    unrevealOwnLife: ['life', 'recovery'], revealAndActivateOwnLife: ['life'],
    grantBattleDestroyLifeHit: ['finisher', 'life'],
    attach: ['buff'], replaceLandFromDeck: ['land', 'search'],
    chooseMode: ['combo'], schedule: ['combo'],
    exile: ['removal'], exileHand: ['discard'], exileSelf: ['risk'],
    counterSelf: ['risk'], swapCostPowerCombat: ['buff', 'tempo'],
    guessOppTopType: ['disruption'], revealOppHand: ['disruption'],
    bothReshuffleHandDraw: ['draw', 'resource'], bothReturnAvatar: ['disruption'],
  };

  /* ── internals ── */
  const cardCache = Object.create(null);
  const deckCache = Object.create(null);
  let botSide = 'B';
  let matchDecks = { A: null, B: null };
  let lastExplain = null;
  let lastStrategy = null;
  let lastStateSnap = null;
  let learnMem = null;
  let debugOn = false;

  function eng() {
    if (root.BoTEngine) return root.BoTEngine;
    if (typeof BoTEngine !== 'undefined') return BoTEngine;
    return null;
  }
  function otherSide(side) { return side === 'A' ? 'B' : 'A'; }
  function zoneIds(st, z) { return (st && st.zones && st.zones[z]) || []; }
  function nameOf(c) { return (c && c.name) || ''; }
  function nm(c, needle) {
    if (!c || !needle) return false;
    const E = eng();
    if (E && E.nameMatches) return E.nameMatches(c, needle);
    return nameOf(c).includes(needle);
  }
  function effectOf(c) {
    if (!c) return null;
    const E = eng();
    return (E && E.effectOf && E.effectOf(c.code, c.name)) || null;
  }
  function keywordsOf(c) {
    if (!c) return [];
    const E = eng();
    if (E && E.keywordsOf) return E.keywordsOf(c.code, c.name) || [];
    const e = effectOf(c);
    return (e && e.keywords) || [];
  }
  function uniq(arr) {
    const s = Object.create(null), out = [];
    (arr || []).forEach(x => { if (x != null && x !== '' && !s[x]) { s[x] = 1; out.push(x); } });
    return out;
  }
  function pushAll(arr, xs) { (xs || []).forEach(x => arr.push(x)); }
  function asArr(v) {
    if (v == null || v === '') return [];
    return Array.isArray(v) ? v : [v];
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function walkActions(actions, visit) {
    (actions || []).forEach(ac => {
      if (!ac) return;
      visit(ac);
      walkActions(ac.then, visit);
      walkActions(ac.actions, visit);
      (ac.options || []).forEach(opt => {
        if (!opt) return;
        visit(opt);
        walkActions(opt.actions, visit);
      });
    });
  }

  /* ability.cost ใน JSON เป็นได้ทั้ง array และ object เดี่ยว (เช่น { op:'discard' }) */
  function abilityCostList(ab) {
    if (!ab || ab.cost == null) return [];
    return Array.isArray(ab.cost) ? ab.cost : [ab.cost];
  }

  function tagsFromOp(op) {
    if (!op) return [];
    if (OP_TAGS[op]) return OP_TAGS[op];
    if (/destroy|bounce|exile|curse/.test(op)) return ['removal', 'destroy'];
    if (/draw/.test(op)) return ['draw'];
    if (/scout|pick|search/.test(op)) return ['search'];
    if (/summon/.test(op)) return ['summon'];
    if (/prevent|immune|protect/.test(op)) return ['protection'];
    if (/negate|cancelAttack/.test(op)) return ['disruption', 'defense'];
    if (/grant|modifyPower|buff/.test(op)) return ['buff'];
    if (/mill/.test(op)) return ['mill', 'disruption'];
    if (/hell/.test(op)) return ['recovery'];
    if (/discard/.test(op)) return ['discard'];
    if (/tap/.test(op)) return ['disruption'];
    if (/untap/.test(op)) return ['tempo'];
    if (/life/.test(op)) return ['life'];
    return ['ability'];
  }

  function collectNeedles(obj, out) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.landNameIncludes) pushAll(out.land, asArr(obj.landNameIncludes));
    if (obj.requireLandNameIncludes) pushAll(out.land, asArr(obj.requireLandNameIncludes));
    if (obj.requireOwnNameIncludes) pushAll(out.requireNames, asArr(obj.requireOwnNameIncludes));
    const f = obj.filter;
    if (f) {
      if (f.exactName) pushAll(out.searchExact, asArr(f.exactName));
      if (f.nameIncludes) pushAll(out.searchIncludes, asArr(f.nameIncludes));
      if (f.symbol) pushAll(out.searchSymbol, asArr(f.symbol));
      if (f.color) pushAll(out.searchColor, asArr(f.color));
      if (f.subtype) pushAll(out.searchSubtype, asArr(f.subtype));
    }
    if (obj.exactName) pushAll(out.searchExact, asArr(obj.exactName));
    if (obj.nameIncludes) pushAll(out.searchIncludes, asArr(obj.nameIncludes));
  }

  /* ═══════════════ 1. CardAnalyzer ═══════════════ */
  function analyzeCard(c) {
    if (!c) return emptyProfile();
    const key = (c.code || '') + '\0' + (c.name || '');
    if (cardCache[key]) return cardCache[key];
    const e = effectOf(c);
    const kws = keywordsOf(c);
    const tags = Object.create(null);
    const ops = [];
    const triggers = [];
    const needles = { land: [], requireNames: [], searchExact: [], searchIncludes: [], searchSymbol: [], searchColor: [], searchSubtype: [] };
    const cost = +c.cost || 0;
    const power = +c.power || 0;
    const gem = +c.gem || 0;

    function addTag(t, n) {
      if (!t) return;
      tags[t] = (tags[t] || 0) + (n == null ? 1 : n);
    }

    if (c.type === 'Avatar') {
      addTag('attack', Math.max(1, power));
      if (power >= 4) addTag('finisher', 1);
      if (cost <= 3 && power >= 2) addTag('tempo', 1);
      if (gem >= 3 && power <= 0) addTag('resource', 2);
    }
    if (c.type === 'Construct') addTag('control', 1);
    if (c.type === 'Magic') {
      const sub = c.subtype || 'Normal';
      if (sub === 'Land') addTag('land', 3);
      else if (sub === 'React') addTag('react', 2), addTag('defense', 1);
      else if (sub === 'Modification') addTag('buff', 1);
      else addTag('control', 1);
    }
    if (c.type === 'Life') addTag('life', 2);

    kws.forEach(kw => {
      if (kw === 'เตะไข่') addTag('finisher', 2), addTag('life', 2), addTag('damage', 1);
      else if (kw === 'โล่มนุษย์') addTag('protection', 2), addTag('defense', 1);
      else if (kw === 'สามัคคี') addTag('combo', 1), addTag('buff', 1);
      else if (kw === 'จุติ') addTag('summon', 1);
      else if (kw === 'ลูกฮึด') addTag('protection', 1);
      else if (kw === 'แทงหลัง') addTag('disruption', 1), addTag('attack', 1);
    });

    collectNeedles(e, needles);
    if (e && e.grantKeywordAura && e.grantKeywordAura.landNameIncludes)
      pushAll(needles.land, asArr(e.grantKeywordAura.landNameIncludes));

    ((e && e.abilities) || []).forEach(ab => {
      if (!ab) return;
      const on = ab.trigger && ab.trigger.on;
      if (on) triggers.push(on);
      if (ab.keyword) {
        if (ab.keyword === 'จุติ') addTag('summon', 1);
        if (ab.keyword === 'เตะไข่') addTag('finisher', 2), addTag('life', 2);
        if (ab.keyword === 'โล่มนุษย์') addTag('protection', 2);
      }
      collectNeedles(ab, needles);
      abilityCostList(ab).forEach(ac => collectNeedles(ac, needles));
      walkActions(ab.actions, ac => {
        collectNeedles(ac, needles);
        if (ac.op) {
          ops.push(ac.op);
          tagsFromOp(ac.op).forEach(t => addTag(t, 1));
        }
        if (ac.keyword === 'เตะไข่') addTag('finisher', 2), addTag('life', 1);
        if (ac.keyword === 'โล่มนุษย์') addTag('protection', 1);
      });
    });

    if (needles.requireNames.length || needles.searchExact.length) addTag('combo', 2);
    if (needles.land.length) addTag('combo', 1), addTag('land', 1);
    if (triggers.indexOf('enemyDeclareAttack') >= 0 || triggers.indexOf('enemyPlayMagic') >= 0)
      addTag('react', 1), addTag('disruption', 1);
    if (triggers.indexOf('activated') >= 0) addTag('resource', 1);

    const risk = (tags.risk || 0) + (tags.discard || 0) * 0.4 + (cost >= 6 ? 1 : 0);
    const roles = {
      aggro: (power * 1.2) + (cost <= 3 ? 4 : 0) + (tags.tempo || 0) * 2 - cost,
      control: (tags.removal || 0) * 4 + (tags.disruption || 0) * 3 + (tags.react || 0) * 2,
      combo: (tags.combo || 0) * 5 + (tags.search || 0) * 3 + needles.searchExact.length * 4,
      midrange: power * 0.8 + (cost >= 3 && cost <= 5 ? 4 : 0),
      ramp: (tags.draw || 0) * 3 + (tags.resource || 0) * 2 + gem,
      finisher: (tags.finisher || 0) * 5 + (power >= 5 ? 4 : 0) + (tags.life || 0) * 2,
    };

    const p = {
      code: c.code || '',
      name: c.name || '',
      type: c.type || '',
      subtype: c.subtype || '',
      color: c.color || '',
      symbol: c.symbol || '',
      cost, power, gem,
      tags, ops: uniq(ops), triggers: uniq(triggers), keywords: kws.slice(),
      landNeedles: uniq(needles.land),
      requireNames: uniq(needles.requireNames),
      searchExact: uniq(needles.searchExact),
      searchIncludes: uniq(needles.searchIncludes),
      searchSymbol: uniq(needles.searchSymbol),
      searchColor: uniq(needles.searchColor),
      roles, risk,
      isLand: c.subtype === 'Land',
      isReact: c.subtype === 'React',
      isMod: c.subtype === 'Modification',
      isGemBattery: c.type === 'Avatar' && power <= 0 && gem >= 3 && !(kws && kws.length),
      hasKickEgg: kws.indexOf('เตะไข่') >= 0,
      hasShield: kws.indexOf('โล่มนุษย์') >= 0,
    };
    const keys = Object.keys(cardCache);
    if (keys.length > CARD_CACHE_MAX) keys.slice(0, 400).forEach(k => { delete cardCache[k]; });
    cardCache[key] = p;
    return p;
  }

  function emptyProfile() {
    return {
      code: '', name: '', type: '', subtype: '', color: '', symbol: '',
      cost: 0, power: 0, gem: 0, tags: {}, ops: [], triggers: [], keywords: [],
      landNeedles: [], requireNames: [], searchExact: [], searchIncludes: [],
      searchSymbol: [], searchColor: [], roles: {}, risk: 0,
      isLand: false, isReact: false, isMod: false, isGemBattery: false,
      hasKickEgg: false, hasShield: false,
    };
  }

  /* ═══════════════ 2. DeckAnalyzer ═══════════════ */
  function fingerprintCards(cards) {
    const counts = Object.create(null);
    (cards || []).forEach(c => {
      if (!c || !c.code) return;
      counts[c.code] = (counts[c.code] || 0) + 1;
    });
    return Object.keys(counts).sort().map(k => k + ':' + counts[k]).join('|');
  }

  function analyzeDeck(cards) {
    cards = (cards || []).filter(Boolean);
    const fp = fingerprintCards(cards);
    if (fp && deckCache[fp]) return deckCache[fp];

    const profiles = cards.map(analyzeCard);
    const tagSum = Object.create(null);
    const landVotes = Object.create(null);
    const colorVotes = Object.create(null);
    const symbolVotes = Object.create(null);
    const nameSet = Object.create(null);
    const refCount = Object.create(null);
    let avatars = 0, costs = 0, powers = 0, curve = [0, 0, 0, 0, 0, 0, 0, 0];
    let react = 0, land = 0, mod = 0, searchN = 0, removalN = 0, kickN = 0;

    profiles.forEach(p => {
      nameSet[p.name] = 1;
      Object.keys(p.tags).forEach(t => { tagSum[t] = (tagSum[t] || 0) + p.tags[t]; });
      p.landNeedles.forEach(n => { landVotes[n] = (landVotes[n] || 0) + 1; });
      if (p.isLand && p.name) landVotes[p.name] = (landVotes[p.name] || 0) + 2;
      if (p.color) colorVotes[p.color] = (colorVotes[p.color] || 0) + 1;
      if (p.symbol) symbolVotes[p.symbol] = (symbolVotes[p.symbol] || 0) + 1;
      if (p.type === 'Avatar') {
        avatars++;
        costs += p.cost;
        powers += p.power;
        curve[Math.min(7, p.cost)]++;
      }
      if (p.isReact) react++;
      if (p.isLand) land++;
      if (p.isMod) mod++;
      if ((p.tags.search || 0) > 0) searchN++;
      if ((p.tags.removal || 0) > 0) removalN++;
      if (p.hasKickEgg) kickN++;
      p.searchExact.concat(p.requireNames, p.searchIncludes).forEach(n => {
        refCount[n] = (refCount[n] || 0) + 1;
      });
    });

    const avgCost = avatars ? costs / avatars : 4;
    const avgPower = avatars ? powers / avatars : 0;
    const n = profiles.length || 1;
    const landIdentity = Object.keys(landVotes).sort((a, b) => landVotes[b] - landVotes[a])[0] || null;
    const keyNeedles = Object.keys(refCount).filter(k => refCount[k] >= 2)
      .sort((a, b) => refCount[b] - refCount[a]);
    const keyCards = profiles.filter(p => {
      if (keyNeedles.some(nd => (p.name && p.name.indexOf(nd) >= 0) || (nd && p.name && nd.indexOf(p.name) >= 0))) return true;
      if (landIdentity && p.landNeedles.indexOf(landIdentity) >= 0 && (p.tags.search || 0) > 0) return true;
      if (p.isLand && landIdentity && nm({ name: p.name }, landIdentity)) return true;
      return false;
    });
    const comboPieces = profiles.filter(p =>
      p.requireNames.length || p.searchExact.length || (p.landNeedles.length && (p.tags.search || 0) > 0));

    const roleSum = { aggro: 0, control: 0, combo: 0, midrange: 0, ramp: 0, finisher: 0 };
    profiles.forEach(p => {
      Object.keys(roleSum).forEach(k => { roleSum[k] += p.roles[k] || 0; });
    });
    if (avgCost <= 3.2 && avgPower >= 2) roleSum.aggro += 40;
    if (removalN + react >= n * 0.18) roleSum.control += 35;
    if (comboPieces.length >= 4 || searchN >= 6) roleSum.combo += 40;
    if (avgCost >= 3.2 && avgCost <= 4.6) roleSum.midrange += 20;
    if ((tagSum.draw || 0) + (tagSum.resource || 0) >= n * 0.4) roleSum.ramp += 15;

    const rankedRoles = Object.keys(roleSum).sort((a, b) => roleSum[b] - roleSum[a]);
    const primary = rankedRoles[0] || 'midrange';
    const secondary = (roleSum[rankedRoles[1]] > roleSum[primary] * 0.62) ? rankedRoles[1] : null;
    const hybrid = !!secondary;

    const winConditions = [];
    if (kickN >= 2 || (tagSum.life || 0) >= 4)
      winConditions.push({ type: 'lifeRace', score: kickN * 8 + (tagSum.life || 0), pieces: profiles.filter(p => p.hasKickEgg || (p.tags.life || 0) > 1).slice(0, 6) });
    if (avgPower >= 2.4)
      winConditions.push({ type: 'boardBeatdown', score: avgPower * 12 + roleSum.aggro * 0.2, pieces: profiles.filter(p => p.type === 'Avatar' && p.power >= 3).slice(0, 6) });
    if (comboPieces.length >= 3)
      winConditions.push({ type: 'comboFinish', score: roleSum.combo * 0.4 + searchN * 5, pieces: comboPieces.slice(0, 8) });
    if (removalN >= 4 && (tagSum.draw || 0) >= 3)
      winConditions.push({ type: 'grind', score: roleSum.control * 0.3 + removalN * 4, pieces: profiles.filter(p => (p.tags.removal || 0) > 0).slice(0, 6) });
    winConditions.sort((a, b) => b.score - a.score);

    const pace = primary === 'aggro' ? 'fast' : primary === 'control' || primary === 'combo' ? 'slow' : 'mid';
    const weakness = [];
    if (avgCost >= 4.5 && land < 2) weakness.push('highCurve');
    if (comboPieces.length >= 4 && searchN < 3) weakness.push('comboNoSearch');
    if (removalN < 2 && react < 2) weakness.push('lowInteraction');
    if (avatars < n * 0.35) weakness.push('lowBodies');
    if (kickN === 0 && avgPower < 2) weakness.push('lowPressure');

    const profile = {
      fingerprint: fp,
      size: cards.length,
      avatars, avgCost, avgPower, curve, react, land, mod, searchN, removalN, kickN,
      tagSum, landVotes, landIdentity, colorVotes, symbolVotes,
      keyNeedles, keyCards, comboPieces,
      primary, secondary, hybrid, roleSum, pace,
      winConditions, weakness,
      earlyPlan: pace === 'fast' ? 'developCheap' : landIdentity ? 'setLand' : 'developBoard',
      midPlan: primary === 'combo' ? 'assembleCombo' : primary === 'control' ? 'answerThreats' : 'winBoard',
      latePlan: winConditions[0] ? winConditions[0].type : 'attrition',
      names: nameSet,
    };
    if (fp) deckCache[fp] = profile;
    return profile;
  }

  function cardsFromState(st, side) {
    if (!st || !st.zones) return [];
    const bags = [
      ...zoneIds(st, side + '.deck'),
      ...zoneIds(st, side + '.hand'),
      ...zoneIds(st, side + '.avatar'),
      ...zoneIds(st, side + '.magic'),
      ...zoneIds(st, side + '.construct'),
      ...zoneIds(st, side + '.hell'),
      ...zoneIds(st, side + '.dark'),
      ...zoneIds(st, side + '.life'),
      ...zoneIds(st, 'land').filter(k => st.inst[k] && st.inst[k].controller === side),
    ];
    return bags.map(k => st.inst[k]).filter(Boolean);
  }

  function deckOf(st, side) {
    if (matchDecks[side]) return matchDecks[side];
    return analyzeDeck(cardsFromState(st, side));
  }

  function isKeyCard(c, deck) {
    if (!c) return false;
    const d = deck || matchDecks[botSide];
    if (!d) {
      const p = analyzeCard(c);
      return (p.roles.combo || 0) >= 8 || p.landNeedles.length > 0;
    }
    if (d.keyCards.some(p => p.code === c.code || p.name === c.name)) return true;
    return d.keyNeedles.some(nd => nm(c, nd));
  }

  function isWantedLand(c, deck) {
    if (!c || c.subtype !== 'Land') return false;
    const d = deck || matchDecks[botSide];
    if (!d || !d.landIdentity) return true;
    return nm(c, d.landIdentity);
  }

  function hasKeyword(c, kw) {
    return keywordsOf(c).indexOf(kw) >= 0;
  }

  /* ═══════════════ 3. GameStateAnalyzer ═══════════════ */
  function lifeInfo(st, side) {
    const lives = zoneIds(st, side + '.life');
    const down = lives.filter(k => st.inst[k] && !st.inst[k].faceUp).length;
    return { n: lives.length, down, up: lives.length - down, critical: lives.length > 0 && down === 0 };
  }

  function boardPower(st, side) {
    const E = eng();
    let n = 0, p = 0, egg = 0;
    zoneIds(st, side + '.avatar').forEach(k => {
      const c = st.inst[k]; if (!c) return;
      n++;
      try { p += (E && E.effPower) ? E.effPower(st, k) : (+c.power || 0); }
      catch (e) { p += +c.power || 0; }
      if (E && E.hasKw && E.hasKw(st, k, 'เตะไข่')) egg++;
    });
    return { n, p, egg };
  }

  function analyzeState(st, side) {
    const opp = otherSide(side);
    const myL = lifeInfo(st, side);
    const oppL = lifeInfo(st, opp);
    const mine = boardPower(st, side);
    const theirs = boardPower(st, opp);
    const handN = zoneIds(st, side + '.hand').length;
    const oppHand = zoneIds(st, opp + '.hand').length;
    const hellN = zoneIds(st, side + '.hell').length;
    const landN = zoneIds(st, 'land').length;
    const turn = st.turn || 1;
    const boardAdv = (mine.n - theirs.n) * 8 + (mine.p - theirs.p);
    const cardAdv = handN - oppHand;
    const lifeAdv = (myL.n - oppL.n) * 12 + (myL.down - oppL.down) * 8;
    const tempo = boardAdv + (turn <= 3 ? cardAdv * 2 : 0);
    const lethal = oppL.critical && (theirs.n === 0 || mine.egg > 0);
    const threatened = myL.critical || (theirs.n >= mine.n + 2 && theirs.p > mine.p + 3);
    let stance = 'even';
    if (lifeAdv + boardAdv >= 18) stance = 'ahead';
    else if (lifeAdv + boardAdv <= -18 || threatened) stance = 'behind';
    let goal = 'develop';
    if (lethal) goal = 'finish';
    else if (threatened || (theirs.n >= 3 && mine.n <= 1)) goal = 'stabilize';
    else if (stance === 'ahead') goal = 'pressure';
    else if (turn >= 6) goal = 'close';
    const deck = deckOf(st, side);
    if (deck && deck.primary === 'combo' && goal === 'develop') goal = 'setup';
    return {
      side, turn, phase: st.phase, myL, oppL, mine, theirs, handN, oppHand, hellN, landN,
      boardAdv, cardAdv, lifeAdv, tempo, lethal, threatened, stance, goal,
      resource: handN + hellN * 0.15,
    };
  }

  /* ═══════════════ 4. OpponentModel ═══════════════ */
  function visibleOppCards(st, opp) {
    const ids = [
      ...zoneIds(st, opp + '.avatar'),
      ...zoneIds(st, opp + '.magic'),
      ...zoneIds(st, opp + '.construct'),
      ...zoneIds(st, opp + '.hell'),
      ...zoneIds(st, 'land').filter(k => st.inst[k] && st.inst[k].controller === opp),
      ...zoneIds(st, opp + '.life').filter(k => st.inst[k] && st.inst[k].faceUp),
    ];
    return ids.map(k => st.inst[k]).filter(Boolean);
  }

  function modelOpponent(st, opp) {
    const seen = visibleOppCards(st, opp);
    const guess = analyzeDeck(seen);
    const handN = zoneIds(st, opp + '.hand').length;
    const deckN = zoneIds(st, opp + '.deck').length;
    const conf = clamp(seen.length / 12, 0.12, 0.85);
    const threat = boardPower(st, opp).p + (guess.kickN || 0) * 6 + (guess.removalN || 0) * 3;
    return {
      opp, seen: seen.length, handN, deckN, confidence: conf,
      primary: guess.primary, secondary: guess.secondary,
      landIdentity: guess.landIdentity,
      threat, likelyCombo: (guess.comboPieces || []).length >= 2,
      likelyNext: threat >= 18 ? 'attack' : guess.primary === 'control' ? 'answer' : 'develop',
      guess,
    };
  }

  /* ═══════════════ 5. StrategyEngine + Matchup ═══════════════ */
  function defaultWeights() {
    return {
      immediate: 1, tempo: 0.9, cardAdv: 0.7, synergy: 1.1, winProg: 1.2,
      future: 0.55, threat: 0.85, risk: 0.7, cost: 0.35, survival: 1,
    };
  }

  function buildStrategy(deck, state, opp) {
    const w = defaultWeights();
    const primary = (deck && deck.primary) || 'midrange';
    const secondary = deck && deck.secondary;
    const goal = (state && state.goal) || 'develop';
    if (primary === 'aggro') { w.tempo += 0.45; w.winProg += 0.25; w.future -= 0.15; w.cost -= 0.1; }
    if (primary === 'control') { w.threat += 0.4; w.cardAdv += 0.25; w.survival += 0.2; w.tempo -= 0.1; }
    if (primary === 'combo') { w.synergy += 0.5; w.future += 0.35; w.immediate -= 0.15; }
    if (primary === 'ramp') { w.future += 0.25; w.cardAdv += 0.2; }
    if (goal === 'finish') { w.winProg += 0.8; w.risk -= 0.3; w.future -= 0.3; }
    if (goal === 'stabilize') { w.survival += 0.55; w.threat += 0.35; w.tempo -= 0.15; }
    if (goal === 'pressure') { w.tempo += 0.3; w.winProg += 0.2; }
    if (goal === 'setup') { w.synergy += 0.35; w.future += 0.2; }
    if (state && state.threatened) { w.survival += 0.4; w.threat += 0.25; }
    if (state && state.myL && state.myL.critical) { w.survival += 0.7; w.risk += 0.2; }

    if (opp && opp.confidence >= 0.25) {
      if (opp.primary === 'aggro' && primary === 'combo') { w.survival += 0.45; w.immediate += 0.2; }
      if (opp.primary === 'control' && primary === 'aggro') { w.tempo += 0.3; w.winProg += 0.2; }
      if (opp.primary === 'combo') { w.threat += 0.35; w.disruption = (w.disruption || 1) + 0.4; }
      if (opp.likelyCombo) w.threat += 0.2;
    }

    applyLearnWeights(w, primary);
    const label = secondary ? (primary + '/' + secondary) : primary;
    const strat = {
      primary, secondary, hybrid: !!(deck && deck.hybrid),
      label, goal, weights: w,
      landIdentity: deck && deck.landIdentity,
      winCondition: (deck && deck.winConditions && deck.winConditions[0] && deck.winConditions[0].type) || 'boardBeatdown',
      pace: (deck && deck.pace) || 'mid',
      tags: [primary, secondary, goal].filter(Boolean),
    };
    lastStrategy = strat;
    return strat;
  }

  function mainPriority(lv, strat) {
    if (lv === 'easy') return ['summon'];
    const g = (strat && strat.goal) || 'develop';
    const p = (strat && strat.primary) || 'midrange';
    if (g === 'stabilize') return ['magic', 'activate', 'summon', 'attach'];
    if (p === 'combo' || g === 'setup') return ['magic', 'activate', 'summon', 'attach', 'activate'];
    if (p === 'aggro') return ['summon', 'attach', 'magic', 'activate'];
    if (p === 'control') return ['magic', 'activate', 'summon', 'attach', 'magic'];
    return ['magic', 'attach', 'activate', 'summon', 'magic', 'summon'];
  }

  /* ═══════════════ 6–7. Candidate + MoveEvaluator ═══════════════ */
  function actionKind(a) {
    if (!a) return 'none';
    if (a.type === 'summon') return 'summon';
    if (a.type === 'playMagic') return 'play';
    if (a.type === 'activateAbility') return 'activate';
    if (a.type === 'attach') return 'attach';
    if (a.type === 'declareAttack') return a.life ? 'lifeAttack' : 'attack';
    if (a.type === 'unity') return 'unity';
    if (a.type === 'endTurn' || a.type === 'setPhase') return 'pass';
    return a.type || 'other';
  }

  function actionCard(st, a) {
    if (!a || !st) return null;
    const k = a.k || a.atk || a.src;
    return (k && st.inst[k]) || null;
  }

  function evaluateCandidate(st, side, it, strat, state) {
    const a = it.a;
    const heur = it.heur || 0;
    const c = actionCard(st, a);
    const p = c ? analyzeCard(c) : emptyProfile();
    const w = (strat && strat.weights) || defaultWeights();
    const kind = actionKind(a);
    const reasons = [];
    let immediate = heur;
    let tempo = 0, card = 0, synergy = 0, win = 0, future = 0, threat = 0, risk = 0, costP = 0, survival = 0;

    if (kind === 'summon') {
      tempo += p.power * 3 + (p.cost <= 3 ? 8 : 0);
      win += p.hasKickEgg ? 18 : 0;
      if (p.isGemBattery) { immediate -= 80; reasons.push('GEM battery — เก็บจ่าย Cost'); }
      if (state && state.mine.n === 0) { survival += 22; reasons.push('ว่างบอร์ด — ลงตัว'); }
      if (p.hasShield) { survival += 16; reasons.push('โล่'); }
    }
    if (kind === 'play') {
      if (p.isLand) {
        const need = strat && strat.landIdentity;
        if (need && nm(c, need)) { synergy += 55; win += 12; reasons.push('แลนด์ที่เด็คต้องการ'); }
        else if (need) { synergy -= 20; reasons.push('แลนด์ไม่ตรง identity'); }
        else { tempo += 12; reasons.push('วางแลนด์'); }
      }
      if ((p.tags.removal || 0) > 0) {
        const en = state ? state.theirs.n : 0;
        threat += en ? 28 : -30;
        reasons.push(en ? 'removal มีเป้า' : 'removal ไม่มีเป้า');
      }
      if ((p.tags.draw || 0) > 0 || (p.tags.search || 0) > 0) {
        card += 16; future += 10; reasons.push('ได้การ์ด/เสิร์ช');
      }
      if (p.isMod) {
        if (state && state.mine.n) { synergy += 14; reasons.push('สวมมอด'); }
        else { immediate -= 50; reasons.push('ไม่มีโฮสต์'); }
      }
    }
    if (kind === 'activate') {
      tempo += 8;
      if ((p.tags.search || 0) > 0 || (p.tags.recovery || 0) > 0) { future += 14; synergy += 10; reasons.push('สั่งใช้เสิร์ช/คืนทรัพยากร'); }
      if (p.isLand) { synergy += 18; reasons.push('สั่งใช้แลนด์'); }
    }
    if (kind === 'attach') {
      if (p.hasKickEgg || (c && /เตะไข่/.test((c.effect || '') + nameOf(c)))) {
        win += 22; reasons.push('มอดเตะไข่');
      } else tempo += 8;
    }
    if (kind === 'lifeAttack') { win += 40; reasons.push('ตี LIFE'); }
    if (kind === 'attack') { tempo += 12; threat += 8; }

    if (strat && strat.landIdentity && p.landNeedles.indexOf(strat.landIdentity) >= 0) {
      const has = zoneIds(st, 'land').some(k => nm(st.inst[k], strat.landIdentity));
      if (has) { synergy += 28; reasons.push('แลนด์ปลดล็อกแล้ว'); }
      else { synergy -= 22; risk += 10; reasons.push('ยังไม่มีแลนด์ปลดล็อก'); }
    }
    if (isKeyCard(c, deckOf(st, side))) { synergy += 16; reasons.push('ใบสำคัญของเด็ค'); }
    p.requireNames.forEach(nd => {
      const ok = zoneIds(st, side + '.avatar').some(k => nm(st.inst[k], nd));
      if (!ok) { synergy -= 18; reasons.push('ยังไม่มีชิ้นคอมโบบนสนาม'); }
    });
    if (state && state.goal === 'finish' && (kind === 'lifeAttack' || p.hasKickEgg)) win += 30;
    if (state && state.goal === 'stabilize' && ((p.tags.removal || 0) > 0 || p.hasShield)) survival += 18;
    if (state && state.goal === 'setup' && ((p.tags.search || 0) > 0 || p.isLand)) future += 14;
    costP += p.cost * 2;
    risk += p.risk * 4;

    const score =
      immediate * w.immediate
      + tempo * w.tempo
      + card * w.cardAdv
      + synergy * w.synergy
      + win * w.winProg
      + future * w.future
      + threat * w.threat
      + survival * w.survival
      - risk * w.risk
      - costP * w.cost;

    if (!reasons.length) reasons.push(kind);
    return { score, reasons, kind, name: nameOf(c) };
  }

  function pruneCandidates(cands, beam) {
    if (!cands || !cands.length) return [];
    const b = beam || BEAM_NORMAL;
    return cands.slice().sort((a, b2) => (b2.heur || 0) - (a.heur || 0)).slice(0, Math.max(b, 4));
  }

  function chooseAction(st, side, cands, opts) {
    opts = opts || {};
    if (!cands || !cands.length) {
      lastExplain = { strategy: lastStrategy, goal: lastStrategy && lastStrategy.goal, candidates: [], selected: null };
      return { fallback: true };
    }
    const state = analyzeState(st, side);
    const deck = deckOf(st, side);
    const opp = modelOpponent(st, otherSide(side));
    const strat = buildStrategy(deck, state, opp);
    lastStateSnap = state;
    const beam = opts.beam || (opts.level === 'nightmare' || opts.level === 'hard' ? BEAM_HARD : BEAM_NORMAL);
    const pruned = pruneCandidates(cands, beam);
    const now = opts.evalPos ? opts.evalPos(st) : 0;
    const scored = [];
    for (let i = 0; i < pruned.length; i++) {
      const it = pruned[i];
      const ev = evaluateCandidate(st, side, it, strat, state);
      let look = 0;
      let ok = true;
      if (opts.sim && opts.evalPos) {
        const after = opts.sim(it.a);
        if (!after) { ok = false; }
        else look = opts.evalPos(after);
      }
      if (!ok) continue;
      const mix = ev.score + look * (opts.lookWeight != null ? opts.lookWeight : 0.82);
      scored.push({
        a: it.a, heur: it.heur || 0, score: Math.round(ev.score), look, mix,
        reasons: ev.reasons, kind: ev.kind, name: ev.name,
      });
    }
    scored.sort((a, b) => b.mix - a.mix);
    lastExplain = {
      strategy: strat.label,
      goal: strat.goal,
      stance: state.stance,
      oppThreat: opp.threat >= 22 ? 'High' : opp.threat >= 10 ? 'Mid' : 'Low',
      oppGuess: opp.primary,
      candidates: scored.slice(0, 6),
      selected: scored[0] || null,
      turn: state.turn,
      phase: state.phase,
    };
    if (!scored[0]) return { fallback: true };
    if (opts.sim && scored[0].look < now - 18 && strat.goal !== 'finish' && strat.goal !== 'pressure')
      return { pass: true, explain: lastExplain };
    return { a: scored[0].a, explain: lastExplain };
  }

  /* ═══════════════ 8. Search (beam wrapper) ═══════════════ */
  function beamPick(cands, sim, evalPos, width) {
    return chooseAction(null, botSide, cands, { sim, evalPos, beam: width || 8 });
  }

  /* ═══════════════ 9. Mulligan ═══════════════ */
  function mulliganKeepScore(st, side, k, canPlay) {
    const c = st.inst[k]; if (!c) return 0;
    const p = analyzeCard(c);
    const deck = deckOf(st, side);
    let s = 6;
    if (isWantedLand(c, deck)) s += 48;
    if (isKeyCard(c, deck)) s += 36;
    if (p.type === 'Avatar' && canPlay) s += 22 + Math.max(0, 6 - p.cost) * 3;
    if (p.type === 'Avatar' && !canPlay && p.cost >= 6) s -= 28;
    if (p.isGemBattery) s += 8;
    if (p.isReact) s += 10;
    if (p.isMod && !zoneIds(st, side + '.hand').some(id => st.inst[id] && st.inst[id].type === 'Avatar'))
      s -= 18;
    if (deck && deck.primary === 'aggro' && p.cost <= 3 && p.power >= 2) s += 14;
    if (deck && deck.primary === 'combo' && ((p.tags.search || 0) > 0 || p.isLand)) s += 16;
    if (deck && deck.pace === 'fast' && p.cost >= 7) s -= 12;
    return s;
  }

  function mulliganIds(st, side, canPlayFn) {
    const hand = zoneIds(st, side + '.hand').slice();
    if (hand.length < 5) return [];
    const scored = hand.map(k => {
      const c = st.inst[k];
      const can = canPlayFn ? canPlayFn(k) : (c && c.type === 'Avatar' && (+c.cost || 0) <= 4);
      return { k, s: mulliganKeepScore(st, side, k, can) };
    });
    scored.sort((a, b) => a.s - b.s);
    const keepMin = 2;
    const drops = [];
    scored.forEach(row => {
      if (row.s < 8 && drops.length < hand.length - keepMin) drops.push(row.k);
    });
    return drops.slice(0, 3);
  }

  /* ═══════════════ 10. Position bonus ═══════════════ */
  function positionBonus(st, side) {
    const deck = deckOf(st, side);
    if (!deck) return 0;
    let v = 0;
    if (deck.landIdentity) {
      const has = zoneIds(st, 'land').some(k => nm(st.inst[k], deck.landIdentity));
      v += has ? 36 : 0;
    }
    const fieldNames = zoneIds(st, side + '.avatar').map(k => nameOf(st.inst[k]));
    deck.keyNeedles.slice(0, 4).forEach(nd => {
      if (fieldNames.some(n => n && n.indexOf(nd) >= 0)) v += 14;
    });
    return v;
  }

  function playSynergy(st, side, c) {
    if (!c) return 0;
    const p = analyzeCard(c);
    const deck = deckOf(st, side);
    let b = 0;
    if (deck && isKeyCard(c, deck)) b += 18;
    if (deck && deck.landIdentity) {
      const has = zoneIds(st, 'land').some(k => nm(st.inst[k], deck.landIdentity));
      if (p.landNeedles.indexOf(deck.landIdentity) >= 0) b += has ? 40 : -28;
    }
    return b;
  }

  function cardValue(st, side, c) {
    if (!c) return 0;
    const p = analyzeCard(c);
    const deck = deckOf(st, side);
    let v = p.gem;
    if (p.type === 'Avatar') v = 36 + p.power * 11 - p.cost * 2;
    else if (p.type === 'Construct') v = 22 + p.power * 7;
    else if (p.isLand) v = 34;
    else if (p.isReact) v = 26;
    else if (p.isMod) v = 20 + p.gem;
    else v = 16 + p.gem;
    if (p.isGemBattery) v = p.gem * 3;
    if (isKeyCard(c, deck)) v += 28;
    if (isWantedLand(c, deck)) v += 36;
    if (p.hasShield) v += 14;
    return v;
  }

  function scoreDeckPlayability(cards) {
    const d = analyzeDeck(cards);
    let score = Math.min(d.avatars, 28) * 2
      + Math.max(0, 12 - Math.abs(d.avgCost - 3.6)) * 4
      + d.avgPower * 3
      + Math.min(d.land, 6) * 5
      + Math.min(d.react, 8) * 3
      + Math.min(d.searchN, 8) * 2
      - (d.weakness.length * 6);
    if (d.landIdentity) score += 16;
    const why = [
      d.hybrid ? (d.primary + '/' + d.secondary) : d.primary,
      'curve ' + d.avgCost.toFixed(1),
      'P' + d.avgPower.toFixed(1),
      d.landIdentity ? ('land:' + d.landIdentity) : 'land:?',
    ].join(' · ');
    return { score, why, profile: d };
  }

  /* ═══════════════ 11. Learning ═══════════════ */
  function defaultLearn() { return { games: 0, byTag: {} }; }
  function loadLearn() {
    if (learnMem) return learnMem;
    try {
      if (typeof localStorage !== 'undefined') {
        learnMem = JSON.parse(localStorage.getItem(LS_LEARN) || 'null') || defaultLearn();
      } else learnMem = defaultLearn();
    } catch (e) { learnMem = defaultLearn(); }
    return learnMem;
  }
  function saveLearn() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LS_LEARN, JSON.stringify(learnMem));
    } catch (e) { }
  }
  function applyLearnWeights(w, primary) {
    const mem = loadLearn();
    const row = mem.byTag && mem.byTag[primary];
    if (!row || row.n < 8) return;
    const wr = row.wins / row.n;
    const conf = clamp((row.n - 8) / 40, 0, 1);
    const adj = (wr - 0.5) * 0.14 * conf;
    w.winProg += adj;
    w.tempo += adj * 0.5;
  }
  function recordResult(st, winner) {
    const mem = loadLearn();
    mem.games = (mem.games || 0) + 1;
    const win = winner === botSide;
    const tags = (lastStrategy && lastStrategy.tags) || ['generic'];
    tags.forEach(t => {
      mem.byTag[t] = mem.byTag[t] || { n: 0, wins: 0 };
      mem.byTag[t].n++;
      if (win) mem.byTag[t].wins++;
    });
    saveLearn();
  }

  /* ═══════════════ 12. Debug ═══════════════ */
  function debugEnabled() {
    if (debugOn) return true;
    try { return typeof localStorage !== 'undefined' && localStorage.getItem(LS_DEBUG) === '1'; }
    catch (e) { return false; }
  }
  function setDebug(on) {
    debugOn = !!on;
    try { localStorage.setItem(LS_DEBUG, on ? '1' : '0'); } catch (e) { }
  }
  function formatExplain(ex) {
    ex = ex || lastExplain;
    if (!ex) return 'ยังไม่มีคำตัดสิน';
    const lines = [];
    lines.push('Current Strategy: ' + (ex.strategy || '—'));
    lines.push('Current Goal: ' + (ex.goal || '—'));
    lines.push('Stance: ' + (ex.stance || '—') + ' · Opponent: ' + (ex.oppGuess || '?') + ' (' + (ex.oppThreat || '?') + ')');
    lines.push('');
    lines.push('Candidate Actions:');
    (ex.candidates || []).forEach((c, i) => {
      lines.push((i + 1) + '. ' + (c.kind || '') + (c.name ? ' ' + c.name : ''));
      lines.push('   Score: ' + c.score + (c.look ? ('  look:' + Math.round(c.look)) : ''));
      (c.reasons || []).forEach(r => lines.push('   - ' + r));
    });
    if (ex.selected) {
      lines.push('');
      lines.push('Selected: ' + (ex.selected.kind || '') + (ex.selected.name ? ' ' + ex.selected.name : ''));
    }
    return lines.join('\n');
  }

  /* ═══════════════ 13. Match bind ═══════════════ */
  function beginMatch(st, opts) {
    opts = opts || {};
    botSide = opts.botSide || 'B';
    debugOn = opts.debug != null ? !!opts.debug : debugEnabled();
    matchDecks.A = analyzeDeck(cardsFromState(st, 'A'));
    matchDecks.B = analyzeDeck(cardsFromState(st, 'B'));
    lastExplain = null;
    lastStrategy = buildStrategy(matchDecks[botSide], analyzeState(st, botSide), modelOpponent(st, otherSide(botSide)));
    return lastStrategy;
  }

  function bindDeckCards(side, cards) {
    matchDecks[side] = analyzeDeck(cards);
    return matchDecks[side];
  }

  /* ═══════════════ 14. Self-play (engine จริง) ═══════════════ */
  function simplePay(st, side, summonK, cost) {
    if (cost <= 0) return [];
    const E = eng();
    const c0 = st.inst[summonK];
    if (!c0) return null;
    const eAll = effectOf(c0);
    const avColor = (eAll && eAll.allColors) ? '' : (c0.color || '');
    const hand = zoneIds(st, side + '.hand').filter(x => x !== summonK);
    const usable = [];
    hand.forEach(k => {
      const x = st.inst[k]; if (!x) return;
      const gc = (E && E.gemColorOf) ? E.gemColorOf(x) : (((x && x.gemColor) && x.gemColor !== 'ใส' && x.gemColor !== 'ไร้สี') ? x.gemColor : 'ขาว');
      const ok = E && E.gemPaysFor ? E.gemPaysFor(gc, avColor) : (!avColor || gc === 'ขาว' || gc === avColor);
      const g = +x.gem || 0;
      if (ok && g > 0) usable.push({ k, g, keep: cardValue(st, side, x) });
    });
    usable.sort((a, b) => a.keep - b.keep || b.g - a.g);
    const pay = [];
    let gem = 0;
    for (let i = 0; i < usable.length && gem < cost; i++) {
      pay.push(usable[i].k);
      gem += usable[i].g;
    }
    if (gem < cost) return null;
    return pay;
  }

  function collectLegalMains(st, side) {
    const E = eng();
    const out = [];
    const hand = zoneIds(st, side + '.hand');
    const magicUsed = (st.magicUsed && st.magicUsed[side]) || {};
    hand.forEach(k => {
      const c = st.inst[k]; if (!c) return;
      if (c.type === 'Magic') {
        const mtype = c.subtype || 'Normal';
        if (mtype === 'React') return;
        if (magicUsed[mtype]) return;
        const p = analyzeCard(c);
        out.push({ a: { type: 'playMagic', k, by: side }, heur: p.isLand ? 40 : 18 + (p.tags.removal || 0) * 6 });
      }
      if (c.type === 'Avatar' || c.type === 'Construct') {
        const eBot = effectOf(c);
        if (eBot && (eBot.noPaidSummon || eBot.noHandSummon || eBot.sacrificeSummon)) return;
        const free = !!(E && E.freeSummonOk && E.freeSummonOk(st, k));
        const cost = free ? 0 : ((E && E.effCost) ? E.effCost(st, k) : (+c.cost || 0));
        const pay = free ? [] : simplePay(st, side, k, cost);
        if (pay == null) return;
        const a = { type: 'summon', k, to: side + (c.type === 'Construct' ? '.construct' : '.avatar'), payIds: pay, by: side };
        if (free) a.free = true;
        out.push({ a, heur: (+c.power || 0) * 10 - cost * 2 });
      }
    });
    const pools = [
      ...zoneIds(st, side + '.avatar'),
      ...zoneIds(st, side + '.construct'),
      ...zoneIds(st, side + '.magic'),
      ...zoneIds(st, 'land').filter(k => st.inst[k] && st.inst[k].controller === side),
    ];
    pools.forEach(k => {
      const e = effectOf(st.inst[k]);
      const abs = (e && e.abilities) || [];
      const actAb = abs.find(ab => ab.trigger && ab.trigger.on === 'activated');
      if (!actAb) return;
      const E = eng();
      if (E && E.activatedTargetDeny && E.activatedTargetDeny(st, side, actAb, k)) return;
      out.push({ a: { type: 'activateAbility', k, by: side }, heur: 12 });
    });
    const mods = zoneIds(st, side + '.magic').filter(k => {
      const c = st.inst[k];
      return c && c.subtype === 'Modification' && !c.attachedTo;
    });
    const hosts = zoneIds(st, side + '.avatar');
    mods.forEach(mod => {
      hosts.forEach(host => {
        out.push({ a: { type: 'attach', k: mod, to: host, by: side }, heur: 20 });
      });
    });
    return out;
  }

  function collectAttacks(st, side) {
    const E = eng();
    const pwr = k => {
      try { return (E && E.effPower) ? E.effPower(st, k) : (+(st.inst[k] && st.inst[k].power) || 0); }
      catch (e) { return +(st.inst[k] && st.inst[k].power) || 0; }
    };
    const hasEgg = k => !!(E && E.hasKw && E.hasKw(st, k, 'เตะไข่'));
    const mine = zoneIds(st, side + '.avatar').filter(k => {
      const c = st.inst[k];
      return c && !c.tapped && c.faceUp !== false && c.type === 'Avatar' && pwr(k) > 0;
    });
    const opp = otherSide(side);
    const enemies = zoneIds(st, opp + '.avatar').filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
    const out = [];
    mine.forEach(atk => {
      const ap = pwr(atk);
      enemies.forEach(def => {
        if (ap > pwr(def)) out.push({ a: { type: 'declareAttack', atk, def, by: side }, heur: 40 + pwr(def) });
      });
      if (!enemies.length || hasEgg(atk)) {
        const lives = zoneIds(st, opp + '.life');
        if (lives.length) out.push({ a: { type: 'declareAttack', atk, life: lives[0] || true, by: side }, heur: 50 });
      }
    });
    return out;
  }

  function promptAction(st, pr) {
    const E = eng();
    const chooser = pr.chooser;
    if (pr.kind === 'react') return { type: 'reactNo', by: chooser };
    if (pr.kind === 'chooseMode' && pr.options && pr.options.length)
      return { type: 'chooseMode', k: pr.src, opt: 0, by: chooser };
    if (pr.kind === 'peekTop') return { type: 'peekTopPlace', where: 'top', by: chooser };
    const cands = (E && E.promptCandidates && E.promptCandidates(st, pr)) || [];
    if (cands[0]) {
      const deck = matchDecks[chooser];
      const ranked = cands.slice().sort((a, b) => cardValue(st, chooser, st.inst[b]) - cardValue(st, chooser, st.inst[a]));
      const pick = (pr.dest === 'discard' || pr.dest === 'sacrifice') ? ranked[ranked.length - 1] : ranked[0];
      return { type: 'chooseTarget', k: pick || cands[0], by: chooser };
    }
    if (pr.optional !== false) return { type: 'skipPrompt', by: chooser };
    return { type: 'skipPrompt', by: chooser };
  }

  function nextSelfPlayAction(st, side) {
    const E = eng();
    if (!st || st.over) return null;
    if (st.awaitBattleStart) return { type: 'beginDuel', by: side };
    if (st.turn === 1 && !st.fpDrawn && !(st.mulliganDone && st.mulliganDone[side])) {
      const ids = mulliganIds(st, side, k => {
        const c = st.inst[k];
        if (!c || c.type !== 'Avatar') return false;
        const cost = +c.cost || 0;
        return !!simplePay(st, side, k, cost);
      });
      return { type: 'mulligan', p: side, ids, by: side };
    }
    const pr = (st.prompts || [])[0];
    if (pr && pr.chooser === side) return promptAction(st, pr);
    if (st.scout && st.scout.p === side) return { type: 'scoutEnd', where: 'top', by: side };
    if (st.pending && st.pending.target === side) {
      if (st.pending.by && st.pending.by !== side) {
        return { type: 'resolveAttack', by: side };
      }
    }
    if ((st.chain || []).length && st.chainPri === side) return { type: 'chainPass', by: side };
    if (st.active !== side) return null;
    if (st.phase === 'Main') {
      const bag = collectLegalMains(st, side);
      const pick = chooseAction(st, side, bag, { beam: 8 });
      if (pick && pick.a) return pick.a;
      return { type: 'setPhase', phase: 'Battle', by: side };
    }
    if (st.phase === 'Battle') {
      const atk = collectAttacks(st, side);
      const pick = chooseAction(st, side, atk, { beam: 6 });
      if (pick && pick.a) return pick.a;
      const hand = zoneIds(st, side + '.hand');
      if (hand.length > 7) {
        const drop = hand.slice().sort((a, b) => cardValue(st, side, st.inst[a]) - cardValue(st, side, st.inst[b]))[0];
        return { type: 'move', k: drop, to: side + '.hell', by: side };
      }
      return { type: 'endTurn', by: side };
    }
    return { type: st.phase === 'End' ? 'endTurn' : 'setPhase', phase: 'Main', by: side };
  }

  function playGame(cards, decks, opts) {
    opts = opts || {};
    const E = eng();
    if (!E || !E.buildInitialState) throw new Error('BoTEngine required');
    let seed = opts.seed != null ? opts.seed : 1;
    const rng = function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const st = E.buildInitialState(cards, rng, decks, { strict: true });
    beginMatch(st, { botSide: 'B' });
    bindDeckCards('A', cardsFromState(st, 'A'));
    const maxSteps = opts.maxSteps || 900;
    const maxTurns = opts.maxTurns || 36;
    let steps = 0;
    let denies = 0;
    const actSeed = { n: 7 };
    while (!st.over && steps < maxSteps && (st.turn || 1) <= maxTurns) {
      steps++;
      let actor = st.active;
      const pr = (st.prompts || [])[0];
      if (pr) actor = pr.chooser;
      else if (st.scout) actor = st.scout.p;
      else if (st.pending && st.pending.target) actor = st.pending.target;
      else if (st.awaitBattleStart) actor = st.firstPlayer || 'A';
      else if (st.turn === 1 && !st.fpDrawn) {
        const d = st.mulliganDone || {};
        actor = !d.A ? 'A' : !d.B ? 'B' : actor;
      }
      const a = nextSelfPlayAction(st, actor);
      if (!a) {
        if (st.active && st.phase === 'Main') {
          E.applyAction(st, { type: 'setPhase', phase: 'Battle', by: st.active, seed: actSeed.n++ });
          continue;
        }
        if (st.active) {
          E.applyAction(st, { type: 'endTurn', by: st.active, seed: actSeed.n++ });
          continue;
        }
        break;
      }
      const fx = E.applyAction(st, Object.assign({ seed: actSeed.n++ }, a));
      if (fx && fx.deny) {
        denies++;
        if (denies > 40) break;
        if (a.type !== 'endTurn' && st.active === actor) {
          if (st.phase === 'Main')
            E.applyAction(st, { type: 'setPhase', phase: 'Battle', by: actor, seed: actSeed.n++ });
          else
            E.applyAction(st, { type: 'endTurn', by: actor, seed: actSeed.n++ });
        }
      } else denies = 0;
    }
    const winner = (st.over && st.over.winner) || (st.over === true ? null : st.over) || null;
    return { st, winner, steps, turns: st.turn, over: !!st.over };
  }

  return {
    TAGS,
    analyzeCard,
    analyzeDeck,
    analyzeState,
    modelOpponent,
    buildStrategy,
    chooseAction,
    mainPriority,
    beamPick,
    pruneCandidates,
    evaluateCandidate,
    mulliganKeepScore,
    mulliganIds,
    positionBonus,
    playSynergy,
    cardValue,
    scoreDeck: scoreDeckPlayability,
    isKeyCard,
    isWantedLand,
    hasKeyword,
    deckOf,
    cardsFromState,
    beginMatch,
    bindDeckCards,
    recordResult,
    debugEnabled,
    setDebug,
    formatExplain,
    lastExplain: () => lastExplain,
    lastStrategy: () => lastStrategy,
    lastState: () => lastStateSnap,
    nextSelfPlayAction,
    playGame,
    collectLegalMains,
    collectAttacks,
    fingerprintCards,
  };
});
