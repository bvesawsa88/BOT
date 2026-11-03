/* BoT — โหมดผจญภัยไต่ด่าน (Campaign / Endless Ladder)
   - สุ่มเด็คบอทให้ถูกกติกา: Main 50 พอดี · LIFE 5 พอดี · Only #1 หนึ่งชื่อ · ≤ ลิมิตต่อชื่อ · ไม่ใช้การ์ดแบน/PR
   - ใช้เฉพาะการ์ดที่เอนจินมีออโต้ (abilities) หรือการ์ดไม่มีเอฟเฟกต์ → บอทเล่นได้จริง
   - สีเพชร (gemColor) ต้องจ่ายให้สีเด็คได้ · เน้นเส้นโค้ง Cost + เผ่าเดียวกันให้บอทเล่นลื่น
   - ด่านไม่มีที่สิ้นสุด: ทุก 5 ด่านเป็นบอส (ใช้เด็คแนะนำที่จัดมือ) · ความยาก/ความแรงการ์ดไต่ตามด่าน
   ใช้ได้ทั้งเบราว์เซอร์ (window.Campaign) และ Node (require) สำหรับเทสต์ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Campaign = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── สุ่มแบบกำหนด seed ได้ (mulberry32) ── */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function weightedPick(rng, items, wfn) {
    let tot = 0;
    const ws = items.map(it => { const w = Math.max(0, wfn(it)); tot += w; return w; });
    if (tot <= 0) return items.length ? pick(rng, items) : null;
    let r = rng() * tot;
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const COLORS = ['แดง', 'ฟ้า', 'ม่วง', 'เขียว'];
  const COLOR_META = {
    'แดง': { hex: '#e2483d', label: 'แดง', icon: '🔥' },
    'ฟ้า': { hex: '#3d8fe2', label: 'ฟ้า', icon: '💧' },
    'ม่วง': { hex: '#9a4de2', label: 'ม่วง', icon: '🔮' },
    'เขียว': { hex: '#3dbb5e', label: 'เขียว', icon: '🌿' },
  };
  const RARITY_W = { C: 1, R: 1.6, SR: 2.4, UR: 3.2, SEC: 3.4, USEC: 3.8, CBR: 2.4 };

  /* ── กฎเด็ค (ตรงกับ deck-builder) ── */
  const isOnlyPrint = c => !!c && (/Only\s*#?\s*1/i.test(c.ex || '') || /Only\s*#?\s*1/i.test(c.effect || '')
    || (!!c.customLimit && /only/i.test(String(c.customLimit)) && !/\d/.test(String(c.customLimit))));

  /* สร้างตัวช่วยกติกาจากรายการการ์ดทั้งหมด + banlist — ใช้ซ้ำได้ทั้งเกมและเทสต์ */
  function makeRules(allCards, ban) {
    ban = ban || {};
    const onlyNames = new Set(), customLimitByName = {};
    allCards.forEach(c => {
      if (isOnlyPrint(c)) onlyNames.add(c.name);
      if (c.customLimit) {
        const m = String(c.customLimit).match(/\d+/);
        if (m) customLimitByName[c.name] = Math.max(customLimitByName[c.name] || 0, +m[0]);
      }
    });
    const banned = new Set(ban.banned || []), l1 = new Set(ban.limit1 || []), l2 = new Set(ban.limit2 || []);
    const isOnly = c => !!c && (isOnlyPrint(c) || onlyNames.has(c.name));
    function limitOf(c) {
      let lim = 4, fromCustom = false;
      if (customLimitByName[c.name] != null) { lim = customLimitByName[c.name]; fromCustom = true; }
      if (!fromCustom && isOnly(c)) lim = 1;
      if (banned.has(c.name)) return 0;
      if (l1.has(c.name)) lim = Math.min(lim, 1);
      if (l2.has(c.name)) lim = Math.min(lim, 2);
      return lim;
    }
    return { isOnly, limitOf, banned, chooseOne: ban.chooseOne || [] };
  }

  /* การ์ดตัวแทนต่อรหัส (พิมพ์หลัก) */
  function uniqueByCode(allCards) {
    const by = {};
    allCards.forEach(c => { if (!by[c.code] || c.image === c.code + '.png') by[c.code] = c; });
    return Object.values(by);
  }

  const splitCols = s => String(s || '').split(/[/,]/).map(x => x.trim()).filter(Boolean);
  const gemOk = (c, colors) => {
    const g = splitCols(c.gemColor);
    if (!g.length) return true;
    return g.some(x => x === 'ขาว' || x === 'ใส' || x === 'ไร้สี' || colors.includes(x));
  };
  const symbolsOf = c => splitCols(c.symbol).concat(String(c.symbol || '').split(/\s+/)).filter((v, i, a) => v && a.indexOf(v) === i);

  /* การ์ดที่บอทเล่นได้: ไม่มีเอฟเฟกต์ หรือมีออโต้ในเอนจิน · ไม่เป็นใบลงจากมือไม่ได้ */
  function playable(c, effectOf) {
    if (!c || !c.code) return false;
    if (!['Avatar', 'Magic', 'Construct', 'Life'].includes(c.type)) return false;
    if (c.rarity === 'PR') return false;
    if (c.type === 'Avatar' && (c.cost === '' || c.cost == null || isNaN(+c.cost))) return false;
    const e = effectOf ? effectOf(c.code, c.name) : null;
    if (e && (e.noPaidSummon || e.noHandSummon)) return false;
    if (!c.effect || !String(c.effect).trim()) return true;
    return !!(e && e.abilities && e.abilities.length);
  }

  function cardScore(c, effectOf) {
    let s = RARITY_W[c.rarity] || 1;
    if (c.type === 'Avatar') {
      const cost = +c.cost || 0, pw = +c.power || 0;
      s += (pw - cost * 0.75) * 0.45;
      if (cost === 0 && pw >= 2) s += 0.6;
      if (+c.gem >= 2) s += 0.35;
    }
    const e = effectOf ? effectOf(c.code, c.name) : null;
    if (e && e.parseStatus === 'verified') s += 0.6;
    if (e && e.abilities && e.abilities.length) s += Math.min(1.2, e.abilities.length * 0.4);
    return s;
  }

  /* พูลการ์ดที่เล่นได้ + แคชเอฟเฟกต์ (effectOf ช้า ~1ms/ใบ) — คำนวณครั้งเดียวต่อชุดข้อมูล */
  let poolCache = null;
  function preparePool(allCards, effectOf, rules) {
    if (poolCache && poolCache.cards === allCards && poolCache.effectOf === effectOf && poolCache.rules === rules)
      return poolCache;
    const fxMap = {};
    const cachedFx = (code, name) => {
      if (!effectOf) return null;
      if (!(code in fxMap)) fxMap[code] = effectOf(code, name) || null;
      return fxMap[code];
    };
    const pool = uniqueByCode(allCards).filter(c => playable(c, cachedFx) && rules.limitOf(c) > 0);
    const byCode = {}, score = {};
    pool.forEach(c => { byCode[c.code] = c; score[c.code] = cardScore(c, cachedFx); });
    poolCache = { cards: allCards, effectOf, rules, pool, byCode, score };
    return poolCache;
  }

  const STYLES = {
    aggro: { label: 'บุกเร็ว', icon: '⚔️', avatars: [36, 40], curve: { 0: .16, 1: .3, 2: .26, 3: .12, 4: .1, 5: .04, 6: .02 } },
    balanced: { label: 'สมดุล', icon: '⚖️', avatars: [32, 37], curve: { 0: .14, 1: .24, 2: .22, 3: .14, 4: .14, 5: .07, 6: .05 } },
    control: { label: 'คุมเกม', icon: '🛡️', avatars: [28, 33], curve: { 0: .12, 1: .18, 2: .2, 3: .16, 4: .17, 5: .09, 6: .08 } },
  };

  /* ── สุ่มจัดเด็คให้ถูกกติกา ──
     opts: { rng, effectOf, rules, ban, colors?, style?, tier (0..1 ความแรงการ์ด) } */
  function generateDeck(allCards, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const effectOf = opts.effectOf || null;
    const rules = opts.rules || makeRules(allCards, opts.ban);
    const tier = Math.max(0, Math.min(1, opts.tier != null ? opts.tier : 0.3));
    const style = STYLES[opts.style] ? opts.style : pick(rng, Object.keys(STYLES));
    const S = STYLES[style];

    const P = preparePool(allCards, effectOf, rules);
    const pool = P.pool;
    // สีหลัก: ต้องมี Avatar เล่นได้อย่างน้อย 18 ชื่อ
    const avByColor = {};
    COLORS.forEach(col => { avByColor[col] = pool.filter(c => c.type === 'Avatar' && c.color === col); });
    let colors = (opts.colors && opts.colors.length) ? opts.colors.slice() : null;
    // ด่านเผ่า: เลือกสีที่มี Avatar เผ่านั้นมากสุด
    let forcedTheme = opts.theme || '';
    if (forcedTheme === '*') { // สุ่มเผ่าที่มี Avatar อย่างน้อย 8 ชื่อในสีเดียว
      const cands = [];
      COLORS.forEach(col => {
        const cnt = {};
        avByColor[col].forEach(c => symbolsOf(c).forEach(sy => { (cnt[sy] = cnt[sy] || new Set()).add(c.name); }));
        Object.entries(cnt).forEach(([sy, set]) => { if (set.size >= 8 && !cands.includes(sy)) cands.push(sy); });
      });
      forcedTheme = cands.length ? pick(rng, cands.sort()) : '';
    }
    if (!colors && forcedTheme) {
      const best = COLORS.map(col => [col, new Set(avByColor[col].filter(c => symbolsOf(c).includes(forcedTheme)).map(c => c.name)).size])
        .sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 4) colors = [best[0]];
    }
    if (!colors) {
      const okCols = COLORS.filter(col => new Set(avByColor[col].map(c => c.name)).size >= 18);
      colors = [pick(rng, okCols.length ? okCols : COLORS)];
      if (!opts.mono && rng() < 0.28) colors.push(pick(rng, COLORS.filter(x => x !== colors[0])));
    }
    const main = colors[0];

    const nameCount = {};
    const deck = { main: {}, life: {} };
    const pairBlocked = nm => rules.chooseOne.some(pair => pair.includes(nm) && pair.some(o => o !== nm && nameCount[o]));
    let total = 0;
    function add(c, n) {
      const lim = rules.limitOf(c);
      const room = Math.min(n, lim - (nameCount[c.name] || 0), 50 - total);
      if (room <= 0 || pairBlocked(c.name)) return 0;
      deck.main[c.code] = (deck.main[c.code] || 0) + room;
      nameCount[c.name] = (nameCount[c.name] || 0) + room;
      total += room;
      return room;
    }
    const weightOf = c => Math.exp((P.score[c.code] || 1) * (0.25 + tier * 1.4)) * (0.5 + rng());

    // ผู้เล่นเหลือแค่ 1 พิมพ์ต่อชื่อ — กันรีปริ้นซ้ำชื่อในพูลสุ่ม
    const dedupe = list => {
      const seen = {};
      return list.filter(c => { if (seen[c.name]) return false; seen[c.name] = 1; return true; });
    };

    // 1) ธีมเผ่า (symbol) ที่มีหลายใบในสีหลัก → บอทได้ซินเนอร์จี
    const avPool = dedupe(shuffle(rng, pool.filter(c => c.type === 'Avatar' && !rules.isOnly(c)
      && (colors.includes(c.color) || (!c.color && rng() < 0.5)) && gemOk(c, colors))));
    const symCount = {};
    avPool.filter(c => c.color === main).forEach(c => symbolsOf(c).forEach(s => { symCount[s] = (symCount[s] || 0) + 1; }));
    const symCands = Object.entries(symCount).filter(([, n]) => n >= 6).map(([s]) => s);
    const theme = forcedTheme && (symCount[forcedTheme] || 0) >= 4 ? forcedTheme
      : symCands.length && rng() < 0.75 ? pick(rng, symCands) : '';
    const themeW = forcedTheme && theme === forcedTheme ? 7 : 2.6;
    const themeBoost = c => (theme && symbolsOf(c).includes(theme) ? themeW : 1) * (c.color === main ? 1.6 : 1);

    // 2) Only #1 — บังคับ 1 ชื่อ (เลือกใบสีเราก่อน)
    const onlyPool = dedupe(pool.filter(c => rules.isOnly(c) && c.type !== 'Life' && gemOk(c, colors)
      && (c.type === 'Avatar' ? colors.includes(c.color) : (!c.color || colors.includes(c.color)))));
    const ace = weightedPick(rng, onlyPool, c => weightOf(c) * (c.type === 'Avatar' ? 3 : 1) * themeBoost(c));
    if (ace) add(ace, Math.max(1, Math.min(rules.limitOf(ace), 1 + Math.floor(rng() * 3))));

    // 3) Avatar ตามเส้นโค้ง Cost
    const nAv = S.avatars[0] + Math.floor(rng() * (S.avatars[1] - S.avatars[0] + 1));
    const bucketOf = c => Math.min(6, +c.cost || 0);
    const target = {};
    Object.keys(S.curve).forEach(k => { target[k] = Math.round(S.curve[k] * nAv); });
    const avInDeck = () => Object.entries(deck.main).reduce((n, [k, v]) => {
      const c = P.byCode[k]; return n + (c && c.type === 'Avatar' ? v : 0);
    }, 0);
    const have = {};
    if (ace && ace.type === 'Avatar') have[bucketOf(ace)] = deck.main[ace.code];
    const copies = () => (rng() < 0.55 + tier * 0.3 ? 4 : rng() < 0.6 ? 3 : 2);
    // ด่านเผ่า: ลงแกนเผ่าก่อน (~18 ใบ, Cost ≤ 5) แล้วค่อยเติมตามเส้นโค้ง
    if (forcedTheme && theme === forcedTheme) {
      const core = avPool.filter(c => symbolsOf(c).includes(theme) && bucketOf(c) <= 5);
      let n = 0, g0 = 0;
      while (n < 18 && core.length && g0++ < 30) {
        const c = weightedPick(rng, core, weightOf);
        core.splice(core.indexOf(c), 1);
        const got = add(c, rng() < 0.7 ? 4 : 3);
        have[bucketOf(c)] = (have[bucketOf(c)] || 0) + got;
        n += got;
      }
    }
    [0, 1, 2, 3, 4, 5, 6].forEach(b => {
      const cands = avPool.filter(c => bucketOf(c) === b);
      let guard = 0;
      while ((have[b] || 0) < target[b] && cands.length && guard++ < 40) {
        const c = weightedPick(rng, cands, c2 => weightOf(c2) * themeBoost(c2));
        cands.splice(cands.indexOf(c), 1);
        const got = add(c, Math.min(copies(), target[b] - (have[b] || 0) + 1));
        have[b] = (have[b] || 0) + got;
      }
    });
    // เติม Avatar ให้ถึงจำนวนเป้า (เผื่อบางช่อง Cost การ์ดไม่พอ)
    let guard = 0;
    while (avInDeck() < nAv && guard++ < 80) {
      const cands = avPool.filter(c => (nameCount[c.name] || 0) < rules.limitOf(c) && bucketOf(c) <= 4);
      if (!cands.length) break;
      const c = weightedPick(rng, cands, c2 => weightOf(c2) * themeBoost(c2));
      add(c, Math.min(copies(), nAv - avInDeck()));
    }

    // 4) Magic / Construct (ไร้สีหรือสีเรา · เพชรต้องจ่ายสีเราได้)
    const spellPool = dedupe(shuffle(rng, pool.filter(c => (c.type === 'Magic' || c.type === 'Construct')
      && !rules.isOnly(c) && (!c.color || colors.includes(c.color)) && gemOk(c, colors))));
    let constructs = 0;
    guard = 0;
    while (total < 50 && guard++ < 120) {
      const cands = spellPool.filter(c => (nameCount[c.name] || 0) < rules.limitOf(c)
        && !(c.type === 'Construct' && constructs >= 4));
      if (!cands.length) break;
      const c = weightedPick(rng, cands, c2 => weightOf(c2) * (theme && symbolsOf(c2).includes(theme) ? 2 : 1));
      const got = add(c, Math.min(rng() < 0.5 + tier * 0.3 ? 3 : 2, 50 - total));
      if (c.type === 'Construct') constructs += got;
    }
    // 5) ยังไม่ครบ 50 → เติมสำเนาเพิ่มจากที่มี แล้วค่อย Avatar อื่น
    guard = 0;
    while (total < 50 && guard++ < 200) {
      const inDeck = Object.keys(deck.main).map(k => P.byCode[k])
        .filter(c => c && (nameCount[c.name] || 0) < rules.limitOf(c));
      const c = inDeck.length ? pick(rng, inDeck) : pick(rng, avPool.concat(spellPool).filter(x => (nameCount[x.name] || 0) < rules.limitOf(x)));
      if (!c) break;
      add(c, 1);
    }

    // 6) LIFE 5 ใบ ชื่อไม่ซ้ำ ไม่ติด Only
    const lifePool = dedupe(shuffle(rng, pool.filter(c => c.type === 'Life' && !rules.isOnly(c) && !nameCount[c.name])));
    const lifeNames = {};
    guard = 0;
    while (Object.keys(lifeNames).length < 5 && lifePool.length && guard++ < 60) {
      const c = weightedPick(rng, lifePool, weightOf);
      lifePool.splice(lifePool.indexOf(c), 1);
      if (pairBlocked(c.name)) continue;
      lifeNames[c.name] = 1;
      deck.life[c.code] = 1;
      nameCount[c.name] = 1;
    }

    const aceCard = ace && ace.type === 'Avatar' ? ace : (() => {
      const avs = Object.keys(deck.main).map(k => P.byCode[k]).filter(c => c && c.type === 'Avatar');
      return avs.sort((a, b) => (+b.cost || 0) - (+a.cost || 0) || (+b.power || 0) - (+a.power || 0))[0] || ace;
    })();
    return {
      main: deck.main, life: deck.life, colors, style, theme,
      ace: aceCard ? { code: aceCard.code, name: aceCard.name, image: aceCard.imageUrl || '' } : null,
    };
  }

  /* ตรวจเด็คตามกติกา — คืน [] เมื่อถูกต้อง */
  function validateDeck(deck, allCards, rules) {
    const errs = [];
    const by = {};
    allCards.forEach(c => { if (!by[c.code] || c.image === c.code + '.png') by[c.code] = c; });
    const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
    if (sum(deck.main) !== 50) errs.push('main=' + sum(deck.main));
    if (sum(deck.life) !== 5) errs.push('life=' + sum(deck.life));
    const nameN = {}, onlyN = new Set();
    ['main', 'life'].forEach(sec => Object.entries(deck[sec] || {}).forEach(([k, n]) => {
      const c = by[k];
      if (!c) { errs.push('missing ' + k); return; }
      if (sec === 'life' && c.type !== 'Life') errs.push('non-life in life ' + k);
      if (sec === 'main' && c.type === 'Life') errs.push('life in main ' + k);
      if (c.rarity === 'PR') errs.push('PR ' + k);
      nameN[c.name] = (nameN[c.name] || 0) + n;
      if (sec === 'main' && rules.isOnly(c)) onlyN.add(c.name);
    }));
    Object.entries(nameN).forEach(([nm, n]) => {
      const c = allCards.find(x => x.name === nm);
      if (n > rules.limitOf(c)) errs.push('over limit ' + nm + ' ' + n);
    });
    if (onlyN.size !== 1) errs.push('only#1 names=' + onlyN.size);
    rules.chooseOne.forEach(pair => { if (pair.filter(p => nameN[p]).length > 1) errs.push('chooseOne ' + pair.join('/')); });
    return errs;
  }

  /* ── ด่าน ── */
  const CHAPTERS = [
    { name: 'ทุ่งตลิ่งชัน', bg: ['#1d3b2a', '#0d1f16'], accent: '#7ee08f' },
    { name: 'ป่าหิมพานต์', bg: ['#1a3324', '#09160f'], accent: '#c3f07a' },
    { name: 'บึงทมิฬ', bg: ['#1c2a3a', '#0a121c'], accent: '#7ac8f0' },
    { name: 'นครเปรตา', bg: ['#2d1c3a', '#130a1c'], accent: '#c88af0' },
    { name: 'แดนเทพนิรันดร์', bg: ['#3a2a14', '#1a1206'], accent: '#f0c86a' },
    { name: 'ขุมนรกโลกันตร์', bg: ['#3a1414', '#1a0606'], accent: '#f07a6a' },
    { name: 'มหาสมุทรนาคา', bg: ['#0f2f3a', '#04141a'], accent: '#5ee0e0' },
    { name: 'ทะเลทรายฟาโรห์', bg: ['#3a3014', '#1a1406'], accent: '#f0dc6a' },
    { name: 'เมืองไซเบอร์', bg: ['#141f3a', '#060a1a'], accent: '#6a9cf0' },
    { name: 'ดินแดนวัลฮัลลา', bg: ['#26303a', '#0c1218'], accent: '#cfe4f0' },
    { name: 'อาณาจักรมังกร', bg: ['#3a1a24', '#1a0810'], accent: '#f06a9c' },
    { name: 'บัลลังก์จักรวาล', bg: ['#22143a', '#0a0618'], accent: '#b48cff' },
  ];
  const BOT_FIRST = ['สมชาย', 'บุญมี', 'แม่หมอ', 'ลุงแดง', 'ป้าจิ๋ว', 'น้องเมฆ', 'ฤๅษี', 'ขุนแผน', 'จอมเวท', 'นายพราน',
    'เจ้าพ่อ', 'หมอผี', 'ซามูไร', 'นักดาบ', 'ราชินี', 'เซียน', 'พรานป่า', 'โจรสลัด', 'นินจา', 'อัศวิน'];
  const BOT_LAST = ['ไร้เทียมทาน', 'จอมวางแผน', 'มือสั่น', 'ใจเย็น', 'ดวงแข็ง', 'หมัดหนัก', 'เจ้าเล่ห์', 'สายเปย์',
    'แห่งตลิ่งชัน', 'ไม่เคยแพ้', 'ขี้โม้', 'สายลุย', 'สายคุม', 'จอมจั่ว', 'เงาทมิฬ', 'ตาทิพย์'];
  const BOSS_TITLES = ['ผู้พิทักษ์ประตู', 'ขุนศึก', 'จอมราชันย์', 'มหาเทพ', 'ราชาปีศาจ', 'ตำนานไร้พ่าย'];
  /* ประเภทด่าน — ตำแหน่งในบท (n % 10) กำหนดด่านพิเศษ */
  const KIND_META = {
    normal: { label: 'ด่านปกติ', icon: '', desc: '', xp: 1 },
    tribe: { label: 'ด่านเผ่า', icon: '🐾', desc: 'บอทจัดเด็คเผ่าเดียว เน้นซินเนอร์จี', xp: 1.25 },
    rush: { label: 'ด่านสายบุก', icon: '⚡', desc: 'บอทบุกเร็ว การ์ด Cost ต่ำเต็มเด็ค', xp: 1.15 },
    mono: { label: 'ด่านสีเดียว', icon: '💎', desc: 'บอทใช้สีเดียวล้วน จ่าย Cost ลื่นทุกเทิร์น', xp: 1.1 },
    elite: { label: 'ด่านเอลีท', icon: '💀', desc: 'บอทฉลาดขึ้น 1 ระดับ การ์ดแรงกว่าปกติ', xp: 1.5 },
    legend: { label: 'ด่านเด็คตำนาน', icon: '📜', desc: 'บอทใช้เด็คแนะนำที่จัดมาอย่างดี', xp: 1.35 },
    boss: { label: 'ด่านบอส', icon: '👑', desc: 'บอสใช้เด็คตำนานหรือเด็คแรงพิเศษ', xp: 1.8 },
    bigBoss: { label: 'บอสใหญ่ประจำบท', icon: '👑', desc: 'ชนะครั้งแรกรับโบนัสจบบท', xp: 2.5 },
  };
  const LEVEL_UP = { easy: 'normal', normal: 'hard', hard: 'nightmare', nightmare: 'nightmare' };
  function kindOf(n, rng) {
    if (n % 10 === 0) return 'bigBoss';
    if (n % 5 === 0) return 'boss';
    const pos = n % 10;
    if (pos === 7 && n >= 7) return 'elite';
    if (pos === 3 && n >= 3) return 'tribe';
    if (pos === 8 && n >= 8) return 'legend';
    if (pos === 4 && n >= 14) return 'rush';
    if (n >= 11 && rng() < 0.3) return 'mono';
    return 'normal';
  }
  const LEVEL_META = {
    easy: { label: 'ง่าย', pips: 1 },
    normal: { label: 'ปานกลาง', pips: 2 },
    hard: { label: 'ยาก', pips: 3 },
    nightmare: { label: 'ฝันร้าย', pips: 4 },
  };

  function chapterOf(n) { return Math.floor((n - 1) / 10); }
  function chapterInfo(n) {
    const i = chapterOf(n);
    const base = CHAPTERS[i % CHAPTERS.length];
    const lap = Math.floor(i / CHAPTERS.length);
    return Object.assign({}, base, { index: i, title: `บทที่ ${i + 1} · ${base.name}${lap ? ' ' + 'I'.repeat(Math.min(lap + 1, 5)) : ''}` });
  }

  /* ข้อมูลด่าน (ไม่รวมเด็ค) — seed ผูกกับเซฟผู้เล่น + จำนวนครั้งที่สุ่มใหม่ */
  function stageInfo(n, salt, roll) {
    const seed = hashStr(`${salt || 'bot'}|${n}|${roll || 0}`);
    const rng = makeRng(seed);
    const boss = n % 5 === 0;
    const bigBoss = n % 10 === 0;
    let level;
    if (boss) level = n >= 25 ? 'nightmare' : 'hard';
    else if (n <= 2) level = 'easy';
    else if (n <= 8) level = rng() < 0.25 ? 'easy' : 'normal';
    else if (n <= 18) level = rng() < 0.35 ? 'normal' : 'hard';
    else level = rng() < 0.15 ? 'nightmare' : 'hard';
    const kind = kindOf(n, rng);
    if (kind === 'elite') level = LEVEL_UP[level];
    const tier = Math.min(1, 0.1 + n * 0.03 + (boss ? 0.2 : 0) + (kind === 'elite' ? 0.25 : 0));
    let style = pick(rng, Object.keys(STYLES));
    if (kind === 'rush') style = 'aggro';
    const name = boss
      ? `${BOSS_TITLES[Math.min(BOSS_TITLES.length - 1, Math.floor(n / 10))]} ${pick(rng, BOT_FIRST)}`
      : `${pick(rng, BOT_FIRST)} ${pick(rng, BOT_LAST)}`;
    const xp = Math.round((25 + n * 6) * KIND_META[kind].xp);
    return { n, seed, boss, bigBoss, kind, level, tier, style, name, xp, chapter: chapterInfo(n) };
  }

  /* โปรไฟล์เด็ค: สีหลัก · เผ่าเด่น · Cost เฉลี่ย · การ์ดเด่น */
  function deckProfile(deck, byCode, rules) {
    const col = {}, sym = {};
    let cost = 0, nAv = 0, ace = null, aceScore = -1;
    Object.entries(deck.main || {}).forEach(([k, n]) => {
      const c = byCode[k];
      if (!c || c.type !== 'Avatar') return;
      nAv += n; cost += (+c.cost || 0) * n;
      if (c.color) col[c.color] = (col[c.color] || 0) + n;
      symbolsOf(c).forEach(s => { sym[s] = (sym[s] || 0) + n; });
      const sc = (rules && rules.isOnly(c) ? 100 : 0) + (+c.cost || 0) * 3 + (+c.power || 0);
      if (sc > aceScore) { aceScore = sc; ace = c.code; }
    });
    const colors = Object.entries(col).sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 6).map(([c]) => c);
    const topSym = Object.entries(sym).sort((a, b) => b[1] - a[1])[0];
    return {
      colors, ace,
      tribe: topSym && topSym[1] >= 12 ? topSym[0] : '',
      avgCost: nAv ? Math.round(cost / nAv * 100) / 100 : 0,
    };
  }

  /* เลือกเด็คชุมชน (bottcg.com) ให้ตรงประเภทด่าน — คืน null = ใช้เด็คสุ่มแทน
     decks เรียงตามยอดไลก์มาก→น้อย · บอส/เอลีท/ตำนาน หยิบจากกลุ่มไลก์สูง */
  function pickPublicDeck(decks, info, rng) {
    if (!decks || !decks.length) return null;
    const k = info.kind;
    const strong = k === 'boss' || k === 'bigBoss' || k === 'elite' || k === 'legend';
    if (!strong && rng() >= 0.75) return null;
    let cands = decks;
    if (k === 'mono') cands = decks.filter(d => d.colors && d.colors.length === 1);
    else if (k === 'tribe') cands = decks.filter(d => d.tribe);
    else if (k === 'rush') cands = decks.filter(d => d.avgCost && d.avgCost <= 2.2);
    if (!cands.length) return strong ? pick(rng, decks) : null;
    if (strong) {
      const frac = k === 'bigBoss' ? 0.1 : k === 'boss' ? 0.2 : 0.35;
      cands = cands.slice(0, Math.max(3, Math.ceil(cands.length * frac)));
    }
    return pick(rng, cands);
  }

  function starsFor(lifeLost, turns) {
    if (lifeLost <= 1) return 3;
    if (lifeLost <= 3) return 2;
    return 1;
  }

  /* ── เซฟความคืบหน้า ── */
  function xpNeed(lv) { return 80 + (lv - 1) * 40; }
  function defaultProgress() {
    return {
      v: 1, stage: 1, best: 0, xp: 0, level: 1, wins: 0, losses: 0, streak: 0, bestStreak: 0,
      stars: {}, rolls: {}, salt: Math.random().toString(36).slice(2, 10), deck: '',
    };
  }
  function normalize(p) {
    const d = defaultProgress();
    if (!p || typeof p !== 'object') return d;
    const out = Object.assign(d, p);
    out.stars = p.stars && typeof p.stars === 'object' ? p.stars : {};
    out.rolls = p.rolls && typeof p.rolls === 'object' ? p.rolls : {};
    out.stage = Math.max(1, +out.stage || 1);
    out.level = Math.max(1, +out.level || 1);
    return out;
  }
  /* ผลแข่ง → อัปเดตเซฟ · คืนสรุปรางวัล */
  function applyResult(p, n, won, lifeLost, info) {
    const res = { won, stage: n, stars: 0, xp: 0, levelUp: 0, newBest: false, firstClear: false };
    if (won) {
      const stars = starsFor(lifeLost);
      const prev = p.stars[n] || 0;
      res.firstClear = !prev;
      res.stars = stars;
      if (stars > prev) p.stars[n] = stars;
      p.wins++; p.streak++; p.bestStreak = Math.max(p.bestStreak, p.streak);
      const streakBonus = 1 + Math.min(0.5, (p.streak - 1) * 0.1);
      res.xp = Math.round(info.xp * (res.firstClear ? 1 : 0.4) * (0.7 + stars * 0.1) * streakBonus);
      if (n >= p.stage) { p.stage = n + 1; }
      if (res.firstClear && n % 10 === 0) { // โบนัสจบบท
        res.chapterBonus = 80 + chapterOf(n) * 40;
        res.xp += res.chapterBonus;
      }
      if (n > p.best) { p.best = n; res.newBest = true; }
    } else {
      p.losses++; p.streak = 0;
      res.xp = Math.round(info.xp * 0.15);
    }
    p.xp += res.xp;
    while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; res.levelUp++; }
    return res;
  }

  return {
    makeRng, hashStr, makeRules, preparePool, uniqueByCode, playable, generateDeck, validateDeck,
    stageInfo, chapterInfo, deckProfile, pickPublicDeck, starsFor, xpNeed, defaultProgress, normalize, applyResult,
    COLORS, COLOR_META, STYLES, LEVEL_META, KIND_META,
  };
});
