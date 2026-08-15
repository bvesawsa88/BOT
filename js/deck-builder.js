/* BoT — Deck Builder (จัดเด็ค)
   ใช้ CardDB จาก js/carddb.js · BotUtil จาก js/util.js · เซฟเด็ค localStorage bot_decks_v1 */
(function () {
  'use strict';
  const { byId, esc, asset } = BotUtil;

/* ═══════════════ DECK BUILDER ═══════════════ */
  const DB = { db: null, q: '', type: '', color: '', cost: '', symbol: '', series: '', subtype: '', shown: 60, sort: 'code', dir: 1, deck: { main: {}, life: {} }, name: '', preview: null };
  const DK = { sel: null };
  const RARITY_ORDER = { C: 0, R: 1, SR: 2, UR: 3, SEC: 4, SCR: 4, USEC: 5, PR: 6, CBR: 7 };
  const COLOR_HEX = { 'แดง': '#c0392b', 'ฟ้า': '#3a7abf', 'ม่วง': '#8e5aa8', 'เขียว': '#3f8f5a' };
  const TYPE_ORDER = { Avatar: 0, Magic: 1, Construct: 2 };
  const MAGIC_ORDER = { Normal: 0, React: 1, Land: 2, Modification: 3 };
  const STARTER_KEYS = ['SD01', 'SD02', 'SD03', 'SD04', 'SD05', 'SD06', 'SD07', 'SD08', 'KD01', 'KD02', 'KD03', 'KD04'];

  function cardOf(code) { return (DB.db && DB.db.byCode[code]) || null; }
  function nCards(obj) { return Object.values(obj || {}).reduce((a, b) => a + b, 0); }
  function specCounts(spec) {
    const types = { Avatar: 0, Magic: 0, Construct: 0 };
    const magics = { Normal: 0, React: 0, Land: 0, Modification: 0 };
    const colorCounts = {};
    let gemSum = 0, cardSum = 0;
    Object.entries((spec && spec.main) || {}).forEach(([k, n]) => {
      const c = cardOf(k); if (!c) return;
      cardSum += n;
      if (types[c.type] != null) types[c.type] += n;
      if (c.type === 'Magic') {
        const st = c.subtype || 'อื่นๆ';
        magics[st] = (magics[st] || 0) + n;
      }
      const col = c.color || 'ไร้สี';
      colorCounts[col] = (colorCounts[col] || 0) + n;
      gemSum += (+c.gem || 0) * n;
    });
    const extraMagic = Object.entries(magics).filter(([k]) => !['Normal', 'React', 'Land', 'Modification'].includes(k));
    return { types, magics, extraMagic, colorCounts, gemSum, cardSum };
  }
  function htmlComp(s) {
    const stat = (label, n) =>
      `<div class="db-stat${n ? '' : ' zero'}"><b>${n}</b><span>${esc(label)}</span></div>`;
    return `<div class="db-comp-grid seven">
         ${stat('Avatar', s.types.Avatar)}${stat('Magic', s.types.Magic)}${stat('Construct', s.types.Construct)}
         ${stat('Normal', s.magics.Normal)}${stat('React', s.magics.React)}${stat('Land', s.magics.Land)}${stat('Mod', s.magics.Modification || 0)}
       </div>` + (s.extraMagic.length
        ? `<div class="db-legend">${s.extraMagic.map(([k, n]) => `<span>${esc(k)} ${n}</span>`).join('')}</div>`
        : '');
  }
  function htmlColors(s) {
    if (!s.cardSum) return '';
    const bars = Object.entries(s.colorCounts).map(([col, n]) =>
      `<div style="width:${n / s.cardSum * 100}%;background:${COLOR_HEX[col] || '#8a7f72'}"></div>`).join('');
    const legend = Object.entries(s.colorCounts).map(([col, n]) =>
      `<span class="db-dot"><i style="background:${COLOR_HEX[col] || '#8a7f72'}"></i>${esc(col)} ${n}</span>`).join('');
    const avg = s.gemSum / s.cardSum;
    return `<div class="db-comp-label">สีในเด็ค</div><div class="db-colorbar">${bars}</div><div class="db-legend">${legend}</div>
        <div class="db-gem">GEM รวมในเด็ค ${s.gemSum} · เฉลี่ย ${avg.toFixed(2)}/ใบ${avg < 1 ? ' — ค่อนข้างต่ำ ระวังจ่าย Cost ไม่ทัน' : ''}</div>`;
  }
  function groupOf(c) {
    if (!c) return { order: 99, label: 'อื่นๆ' };
    if (c.type === 'Magic') {
      const st = c.subtype || 'อื่นๆ';
      const short = st === 'Modification' ? 'Mod' : st;
      return { order: 10 + (MAGIC_ORDER[st] ?? 9), label: `Magic · ${short}` };
    }
    return { order: TYPE_ORDER[c.type] ?? 50, label: c.type };
  }
  function groupedSpec(map) {
    const grouped = {};
    Object.entries(map || {}).forEach(([k, n]) => {
      const g = groupOf(cardOf(k));
      const bucket = grouped[g.order] || (grouped[g.order] = { label: g.label, items: [] });
      bucket.items.push([k, n]);
    });
    const sortEntry = (a, b) => {
      const ca = cardOf(a[0]) || {}, cb = cardOf(b[0]) || {};
      return ((+ca.cost || 0) - (+cb.cost || 0)) || ((ca.name || '') < (cb.name || '') ? -1 : 1);
    };
    return Object.keys(grouped).sort((a, b) => a - b).map(ord => {
      const g = grouped[ord];
      g.items.sort(sortEntry);
      g.total = g.items.reduce((s, [, n]) => s + n, 0);
      return g;
    });
  }
  function colorSummary(spec) {
    const s = specCounts(spec);
    return Object.entries(s.colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([col, n]) => `${col} ${n}`).join(' · ') || '—';
  }

  window.openDeckBuilder = function (opts) {
    opts = opts || {};
    CardDB.load().then(db => {
      DB.db = db;
      byId('dbCount').textContent = `${db.cards.length} รหัสการ์ด · Rule Book 3.2`;
      fillSelect('dbSymbol', 'Symbol — ทั้งหมด', [...new Set(db.cards.map(c => c.symbol).filter(Boolean))].sort());
      fillSelect('dbSeries', 'ซีรีส์ — ทั้งหมด', [...new Set(db.cards.map(c => c.series).filter(Boolean))].sort());
      if (opts.empty) {
        DB.deck = { main: {}, life: {} };
        byId('dbName').value = '';
        msg('');
      } else if (opts.deck) {
        DB.deck = { main: Object.assign({}, opts.deck.main || {}), life: Object.assign({}, opts.deck.life || {}) };
        byId('dbName').value = opts.name || '';
        msg(opts.note || '');
      }
      renderDB();
    });
  };
  function fillSelect(id, first, vals) {
    byId(id).innerHTML = `<option value="">${esc(first)}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
  function chipRow(id, vals, cur, onPick) {
    byId(id).innerHTML = vals.map(v => `<button class="db-chip${cur === v ? ' on' : ''}" data-v="${esc(v)}">${v === '' ? 'ทั้งหมด' : esc(v)}</button>`).join('');
    byId(id).onclick = e => { const b = e.target.closest('.db-chip'); if (b) { onPick(b.dataset.v); } };
  }
  function limitOf(c) { return CardDB.limitOf(DB.db, c); }
  function isOnly(c) { return CardDB.isOnly(c); }
  /* ★ ลิมิตนับต่อ "ชื่อการ์ด" ไม่ใช่ต่อ "รหัส"
     การ์ดชื่อเดียวกันมีหลายรหัส (ต่างซีรีส์/ความหายาก) เช่น "ชายจากอนาคต" มี 8 รหัส
     ถ้านับต่อรหัสจะใส่ได้ 8×4 = 32 ใบ และทะลุ banlist ด้วย (limit2 กลายเป็น 16 ใบ) */
  function nameCountInDeck(name) {
    let n = 0;
    ['main', 'life'].forEach(sec => Object.entries(DB.deck[sec]).forEach(([k, ct]) => {
      const cd = DB.db.byCode[k]; if (cd && cd.name === name) n += ct;
    }));
    return n;
  }
  /* Only #1 ในเด็ค — รายชื่อ Only ที่ใส่แล้ว (ปกติต้องมีพอดี 1 ชื่อ · ยกเว้นกรณีพิเศษลิมิต 3) */
  function onlyNamesInDeck(deck) {
    const names = new Set();
    ['main', 'life'].forEach(sec => Object.keys(deck[sec] || {}).forEach(k => {
      const cd = DB.db.byCode[k]; if (cd && isOnly(cd)) names.add(cd.name);
    }));
    return [...names];
  }
  // รวมจำนวนต่อชื่อทั้งเด็ค → { ชื่อ: {n, lim} } ใช้ทั้งตอนตรวจและตอน import
  function perNameCounts(deck) {
    const out = {};
    ['main', 'life'].forEach(sec => Object.entries(deck[sec] || {}).forEach(([k, ct]) => {
      const cd = DB.db.byCode[k]; if (!cd) return;
      const e = out[cd.name] = out[cd.name] || { n: 0, lim: 0 };
      e.n += ct;
      e.lim = Math.max(e.lim, limitOf(cd));   // ชื่อเดียวกันต่างรหัสอาจมี customLimit ไม่ตรงกัน — ยึดค่าสูงสุด
    }));
    return out;
  }
  function counts() {
    const m = Object.values(DB.deck.main).reduce((a, b) => a + b, 0);
    const l = Object.values(DB.deck.life).reduce((a, b) => a + b, 0);
    return { m, l };
  }
  function addCode(code) {
    const c = DB.db.byCode[code]; if (!c) return;
    const sec = c.type === 'Life' ? 'life' : 'main';
    const lim = limitOf(c), cur = DB.deck[sec][code] || 0;
    if (lim === 0) { msg(`"${c.name}" อยู่ในลิสต์ห้ามใส่ (การ์ดบาป)`); return; }
    // ★ Only #1: เด็คมีได้แค่ 1 ชื่อ — ห้ามผสม Only คนละใบ (ยกเว้นชื่อเดียวกันตามลิมิต)
    if (isOnly(c)) {
      const others = onlyNamesInDeck(DB.deck).filter(nm => nm !== c.name);
      if (others.length) {
        msg(`Only #1 ใส่ได้ชื่อเดียวต่อเด็ค — มี "${others[0]}" อยู่แล้ว เอาออกก่อนถึงจะใส่ "${c.name}" ได้`);
        return;
      }
    }
    // ★ เทียบกับจำนวน "ชื่อนี้" ทั้งเด็ค (รวมทุกรหัส/ความหายาก) ไม่ใช่แค่รหัสนี้
    const byName = nameCountInDeck(c.name);
    if (byName >= lim) {
      const why = isOnly(c) ? (lim === 1 ? ' (Only #1)' : ` (Only #1 กรณีพิเศษ ลิมิต ${lim})`) : (lim === 1 ? ' (banlist)' : '');
      msg(`"${c.name}" ใส่ได้สูงสุด ${lim} ใบ${why} — ตอนนี้มี ${byName} ใบแล้ว (นับรวมทุกรหัส/ความหายากของชื่อนี้)`);
      return;
    }
    DB.deck[sec][code] = cur + 1; msg(''); renderDB();
  }
  function subCode(code) {
    const c = DB.db.byCode[code]; if (!c) return;
    const sec = c.type === 'Life' ? 'life' : 'main';
    const cur = DB.deck[sec][code] || 0;
    if (cur <= 1) delete DB.deck[sec][code]; else DB.deck[sec][code] = cur - 1;
    renderDB();
  }
  function msg(t) { byId('dbMsg').textContent = t; }
  function setPreviewDB(code) { DB.preview = code; }

  function filteredCards() {
    const q = DB.q.trim().toLowerCase();
    const out = DB.db.cards.filter(c =>
      (!q || (c.name + ' ' + (c.effect || '') + ' ' + c.code).toLowerCase().includes(q)) &&
      (!DB.type || c.type === DB.type) && (!DB.color || c.color === DB.color) &&
      (!DB.symbol || c.symbol === DB.symbol) && (!DB.series || c.series === DB.series) &&
      (!DB.subtype || c.subtype === DB.subtype) &&
      (DB.cost === '' || (DB.cost === '8+' ? +c.cost >= 8 : String(c.cost) === DB.cost)));
    const key = {
      code: c => c.code, name: c => c.name,
      cost: c => +c.cost || 0, power: c => +c.power || 0, gem: c => +c.gem || 0,
      rarity: c => RARITY_ORDER[c.rarity] ?? 99,
    }[DB.sort] || (c => c.code);
    out.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const r = typeof ka === 'string' ? ka.localeCompare(kb, 'th') : ka - kb;
      return (r || a.code.localeCompare(b.code)) * DB.dir;
    });
    return out;
  }

  /* modal ดูการ์ดใหญ่ + ปรับจำนวน (แนวเดียวกับ bottcg.com) */
  function openCardModal(code) {
    const c = DB.db.byCode[code]; if (!c) return;
    const sec = c.type === 'Life' ? 'life' : 'main';
    const n = DB.deck[sec][code] || 0;
    const lim = limitOf(c);
    const meta = `${c.code} · ${c.type}${c.subtype ? ' / ' + c.subtype : ''} · ${c.rarity}${c.color ? ' · ' + c.color : ''}${c.symbol ? ' · ' + c.symbol : ''}${c.cost !== '' && c.cost != null ? ' · COST ' + c.cost : ''}${c.gem !== '' && c.gem != null ? ' · GEM ' + c.gem : ''}${c.power !== '' && c.power != null ? ' · POWER ' + c.power : ''}`;
    byId('dbZoom').innerHTML = `
      <div class="gl-zoom-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
      <div class="gl-zoom-info" data-stop="1">
        <div class="gl-zoom-name">${esc(c.name)}</div>
        <div class="gl-zoom-meta">${esc(meta)}</div>
        <div class="gl-zoom-effect">${esc((c.effect || '—') + (c.favorText ? '\n\n"' + c.favorText + '"' : ''))}</div>
        <div class="db-zoom-actions">
          <button class="db-pm big" data-q="sub" data-code="${esc(code)}">−</button>
          <div class="db-zoom-count">ในเด็ค ×${n}${lim < 4 ? ` <span>(ลิมิต ${lim})</span>` : ''}</div>
          <button class="db-pm big" data-q="add" data-code="${esc(code)}">+</button>
          <button class="btn-dark small" data-close="1">ปิด</button>
        </div>
      </div>`;
    byId('dbZoom').classList.remove('hidden');
  }

  function renderDB() {
    if (!DB.db) return;
    chipRow('dbTypeChips', ['', 'Avatar', 'Magic', 'Construct', 'Life'], DB.type, v => { DB.type = v; DB.shown = 60; renderDB(); });
    chipRow('dbColorChips', ['', 'แดง', 'ฟ้า', 'ม่วง', 'เขียว'], DB.color, v => { DB.color = v; DB.shown = 60; renderDB(); });
    chipRow('dbCostChips', ['', '0', '1', '2', '3', '4', '5', '6', '7', '8+'], DB.cost, v => { DB.cost = v; DB.shown = 60; renderDB(); });

    const filtered = filteredCards();
    byId('dbResult').textContent = `พบ ${filtered.length} ใบ · แสดง ${Math.min(DB.shown, filtered.length)}`;
    byId('dbGrid').innerHTML = filtered.slice(0, DB.shown).map(c => {
      const n = DB.deck.main[c.code] || DB.deck.life[c.code] || 0;
      return `<div class="db-card" data-code="${esc(c.code)}">
        <img src="${esc(c.imageUrl)}" loading="lazy" alt="">
        <div class="db-rar">${esc(c.rarity)}</div>
        ${n ? `<div class="db-badge">×${n}</div>` : ''}
        <div class="db-qty"><button class="db-pm" data-q="sub">−</button><span>${n ? '×' + n : ''}</span><button class="db-pm" data-q="add">+</button></div>
      </div>`;
    }).join('');
    byId('dbMore').classList.toggle('hidden', filtered.length <= DB.shown);
    // ถ้า modal เปิดอยู่ ให้รีเฟรชจำนวนตาม
    if (!byId('dbZoom').classList.contains('hidden')) {
      const cur = byId('dbZoom').querySelector('[data-code]');
      if (cur) openCardModal(cur.dataset.code);
    }

    // แผงเด็คขวา
    const { m: mainCount, l: lifeCount } = counts();
    byId('dbMainCount').textContent = mainCount; byId('dbLifeCount').textContent = lifeCount;
    byId('dbDeckBtn').textContent = `เด็ค ${mainCount}/50`;
    // ★ ตรวจลิมิตต่อชื่อ ครอบคลุมทั้ง Main และ LIFE (เดิมสแกนแค่ main + นับต่อรหัส)
    const overNames = Object.entries(perNameCounts(DB.deck)).filter(([, v]) => v.n > v.lim);
    const allCodes = Object.keys({ ...DB.deck.main, ...DB.deck.life });
    const nameOf = k => DB.db.byCode[k] ? DB.db.byCode[k].name : '';
    const onlyNames = onlyNamesInDeck(DB.deck);
    const onlyOk = onlyNames.length === 1;
    const onlyLabel = onlyNames.length === 0
      ? 'ต้องมี Only #1 ใน Main Deck (ยังไม่มี)'
      : onlyNames.length === 1
        ? `มี Only #1: ${onlyNames[0]}${(() => { const cd = DB.db.cards.find(x => x.name === onlyNames[0] && isOnly(x)); const lim = cd ? limitOf(cd) : 1; const n = nameCountInDeck(onlyNames[0]); return lim > 1 ? ` ×${n}/${lim}` : ''; })()}`
        : `Only #1 ใส่ได้ชื่อเดียว — ตอนนี้มี ${onlyNames.length} ชื่อ: ${onlyNames.slice(0, 3).join(' · ')}${onlyNames.length > 3 ? ' …' : ''}`;
    const checks = [
      [mainCount === 50, `Main Deck 50 ใบพอดี (ตอนนี้ ${mainCount})`],
      [lifeCount === 5, `LIFE Card 5 ใบพอดี (ตอนนี้ ${lifeCount})`],
      [onlyOk, onlyLabel],
      [overNames.length === 0, overNames.length
        ? `เกินลิมิต ${overNames.length} ชื่อ: ` + overNames.slice(0, 3).map(([nm, v]) => `${nm} ${v.n}/${v.lim}`).join(' · ') + (overNames.length > 3 ? ' …' : '')
        : 'ไม่เกินลิมิตต่อชื่อ (≤4 / Only #1 / banlist · นับรวมทุกรหัส)'],
    ];
    const prCount = allCodes.filter(k => DB.db.byCode[k] && DB.db.byCode[k].rarity === 'PR').length;
    if (prCount) checks.push([false, `มีการ์ด PR "ลำเอียง" ${prCount} ใบ — ห้ามใช้ในโหมดแข่ง`, true]);
    const bannedIn = allCodes.filter(k => DB.db.ban.banned.includes(nameOf(k)));
    if (bannedIn.length) checks.push([false, `มีการ์ดห้ามใส่ (การ์ดบาป) ${bannedIn.length} รายการ`]);
    DB.db.ban.chooseOne.forEach(pair => {
      const have = pair.filter(nm => Object.keys(DB.deck.main).some(k => nameOf(k) === nm)
        || Object.keys(DB.deck.life).some(k => nameOf(k) === nm));
      if (have.length > 1) checks.push([false, `เลือกใส่ได้อย่างเดียว: ${pair.join(' หรือ ')}`]);
    });
    byId('dbChecks').innerHTML = checks.map(([ok, label, warn]) =>
      `<div class="db-check ${ok ? 'ok' : warn ? 'warn' : 'bad'}">${ok ? '✓' : warn ? '!' : '✗'} ${esc(label)}</div>`).join('');

    // cost curve
    const curve = [0, 1, 2, 3, 4, 5, 6, 7, '8+'].map(v => {
      let n = 0;
      Object.entries(DB.deck.main).forEach(([k, ct]) => {
        const cd = DB.db.byCode[k]; if (!cd || cd.cost === '' || cd.cost == null) return;
        const co = +cd.cost;
        if (v === '8+' ? co >= 8 : co === v) n += ct;
      });
      return { label: String(v), n };
    });
    byId('dbCurve').innerHTML = curve.map(b =>
      `<div class="db-bar"><div class="db-bar-n">${b.n}</div><div class="db-bar-fill" style="height:${Math.min(b.n * 5, 38)}px"></div><div class="db-bar-l">${b.label}</div></div>`).join('');

    const stats = specCounts(DB.deck);
    byId('dbComp').innerHTML = htmlComp(stats);
    byId('dbColors').innerHTML = htmlColors(stats);

    const entry = (k, n) => {
      const c = cardOf(k) || {};
      return `<div class="db-deck-card" data-code="${esc(k)}" title="${esc(c.name || k)}">
        <img src="${esc(c.imageUrl || '')}" loading="lazy" alt="">
        ${n > 1 ? `<span class="db-deck-n">×${n}</span>` : ''}
        <div class="db-qty"><button class="db-pm" data-act="sub">−</button><span>×${n}</span><button class="db-pm" data-act="add">+</button></div>
      </div>`;
    };
    byId('dbMainList').innerHTML = groupedSpec(DB.deck.main).map(g =>
      `<div class="db-group-h">${esc(g.label)} · ${g.total}</div><div class="db-deck-cards">` + g.items.map(([k, n]) => entry(k, n)).join('') + `</div>`
    ).join('');
    byId('dbLifeList').innerHTML = `<div class="db-deck-cards">` + Object.entries(DB.deck.life).map(([k, n]) => entry(k, n)).join('') + `</div>`;
  }

  /* events — deck builder */
  byId('dbBack').onclick = () => { BOT.showScreen('decks'); window.openDeckList(); };
  // ลิ้นชักบนมือถือ: ฟิลเตอร์ซ้าย / เด็คขวา
  byId('dbFiltersBtn').onclick = () => { document.querySelector('.db-deck').classList.remove('open'); document.querySelector('.db-side').classList.toggle('open'); };
  byId('dbDeckBtn').onclick = () => { document.querySelector('.db-side').classList.remove('open'); document.querySelector('.db-deck').classList.toggle('open'); };
  byId('dbGrid').addEventListener('pointerdown', () => {
    document.querySelector('.db-side').classList.remove('open');
    document.querySelector('.db-deck').classList.remove('open');
  });
  byId('dbQ').addEventListener('input', e => { DB.q = e.target.value; DB.shown = 60; renderDB(); });
  byId('dbSymbol').onchange = e => { DB.symbol = e.target.value; DB.shown = 60; renderDB(); };
  byId('dbSeries').onchange = e => { DB.series = e.target.value; DB.shown = 60; renderDB(); };
  byId('dbSubtype').onchange = e => { DB.subtype = e.target.value; DB.shown = 60; renderDB(); };
  byId('dbClear').onclick = () => { Object.assign(DB, { q: '', type: '', color: '', cost: '', symbol: '', series: '', subtype: '', shown: 60 }); byId('dbQ').value = ''; byId('dbSymbol').value = ''; byId('dbSeries').value = ''; byId('dbSubtype').value = ''; renderDB(); };
  byId('dbMore').onclick = () => { DB.shown += 60; renderDB(); };
  byId('dbSort').onchange = e => { DB.sort = e.target.value; renderDB(); };
  byId('dbDir').onclick = () => { DB.dir = -DB.dir; byId('dbDir').textContent = DB.dir === 1 ? '▲' : '▼'; renderDB(); };
  byId('dbGrid').addEventListener('click', e => {
    const el = e.target.closest('[data-code]'); if (!el) return;
    const q = e.target.closest('[data-q]');
    if (q) { (q.dataset.q === 'add' ? addCode : subCode)(el.dataset.code); return; }
    openCardModal(el.dataset.code);
  });
  byId('dbZoom').addEventListener('click', e => {
    const q = e.target.closest('[data-q]');
    if (q) { (q.dataset.q === 'add' ? addCode : subCode)(q.dataset.code); return; }
    if (e.target.closest('[data-close]') || !e.target.closest('[data-stop]')) byId('dbZoom').classList.add('hidden');
  });
  byId('dbGrid').addEventListener('pointerover', e => { const el = e.target.closest('[data-code]'); if (el && DB.preview !== el.dataset.code) setPreviewDB(el.dataset.code); });
  ['dbMainList', 'dbLifeList'].forEach(id => {
    byId(id).addEventListener('click', e => {
      const row = e.target.closest('[data-code]'); if (!row) return;
      const act = e.target.closest('[data-act]');
      if (act) { (act.dataset.act === 'add' ? addCode : subCode)(row.dataset.code); return; }
      openCardModal(row.dataset.code);
    });
    byId(id).addEventListener('pointerover', e => { const row = e.target.closest('[data-code]'); if (row) setPreviewDB(row.dataset.code); });
  });
  byId('dbSave').onclick = () => {
    const name = (byId('dbName').value.trim() || 'เด็คไม่มีชื่อ');
    const sv = CardDB.savedDecks();
    sv[name] = { main: DB.deck.main, life: DB.deck.life };
    CardDB.saveDecks(sv);
    try { localStorage.setItem('bot_active_deck', name); } catch (e) { }
    byId('dbName').value = name;
    DK.sel = { kind: 'saved', id: name };
    msg(`บันทึก "${name}" แล้ว — ใช้เป็นเด็คหลักตอนเข้าห้อง/ซ้อมได้เลย`);
    renderDB();
  };
  byId('dbClearDeck').onclick = () => { DB.deck = { main: {}, life: {} }; msg('ล้างเด็คแล้ว'); renderDB(); };
  let STARTERS_DB = null, startersP = null;
  function fillStarterSelect(db) {
    const sel = byId('dbFillStarter');
    if (!sel || !db) return;
    const cur = sel.value;
    const keys = Object.keys(db);
    sel.innerHTML = keys.map(k => {
      const p = db[k];
      const label = (p && (p.label || p.name)) || k;
      return `<option value="${esc(k)}">${esc(label)}</option>`;
    }).join('');
    if (keys.includes(cur)) sel.value = cur;
    else if (keys.includes('SD01')) sel.value = 'SD01';
  }
  function loadStarters() {
    if (STARTERS_DB) return Promise.resolve(STARTERS_DB);
    if (startersP) return startersP;
    startersP = Promise.all([
      fetch(asset('data/starters.json')).then(r => r.json()).catch(() => null),
      fetch(asset('data/custom-decks.json')).then(r => r.json()).catch(() => null),
    ]).then(([starters, custom]) => {
      STARTERS_DB = Object.assign({}, starters || {}, custom || {});
      fillStarterSelect(STARTERS_DB);
      return STARTERS_DB;
    });
    return startersP;
  }
  loadStarters();
  byId('dbFillSD01').onclick = () => {
    const ser = (byId('dbFillStarter') && byId('dbFillStarter').value) || 'SD01';
    const preset = STARTERS_DB && STARTERS_DB[ser];
    if (preset) {
      DB.deck = { main: Object.assign({}, preset.main), life: Object.assign({}, preset.life) };
      if (!byId('dbName').value.trim()) byId('dbName').value = preset.name || (ser + ' Starter');
      const mn = Object.values(DB.deck.main).reduce((a, b) => a + b, 0);
      const lf = Object.values(DB.deck.life).reduce((a, b) => a + b, 0);
      msg(`ใส่เด็คตัวอย่าง ${ser} แล้ว (${mn}+${lf})`); renderDB();
      return;
    }
    // fallback เดิมถ้ายังโหลด starters ไม่ได้ — ใช้ dropRate / กล่องถ้ามี
    const sd = DB.db.cards.filter(c => c.series === ser);
    const main = {}, life = {};
    const seen = new Set();
    sd.forEach(c => {
      if (seen.has(c.code)) return;
      seen.add(c.code);
      const m = String(c.dropRate || '').match(/(\d+)\s*\//);
      const n = m ? +m[1] : (c.type === 'Life' ? 1 : 2);
      if (c.type === 'Life') life[c.code] = n;
      else main[c.code] = Math.min(n, limitOf(c));
    });
    DB.deck = { main, life };
    if (!byId('dbName').value.trim()) byId('dbName').value = ser + ' Starter';
    msg(`ใส่เด็คตัวอย่าง ${ser} แล้ว`); renderDB();
  };
  /* ── รหัสเด็ครูปแบบข้อความ (เข้ากันได้กับ bottcg.com) ── */
  const stripRarity = code => code.replace(/-[A-Z]{1,5}$/, ''); // "BT02-045-C" → "BT02-045"
  function buildDeckCode(deck, name) {
    const line = (code, n) => { const c = DB.db.byCode[code]; return `${n}x ${code}${c && c.rarity ? '-' + c.rarity : ''}`; };
    const mains = Object.entries(deck.main).sort((a, b) => a[0] < b[0] ? -1 : 1);
    const lifes = Object.entries(deck.life).sort((a, b) => a[0] < b[0] ? -1 : 1);
    let s = `# ${name || 'เด็คไม่มีชื่อ'}\n\n# Main Deck\n`;
    mains.forEach(([k, n]) => s += line(k, n) + '\n');
    s += `\n# Life Deck\n`;
    lifes.forEach(([k, n]) => s += line(k, n) + '\n');
    return s.trim();
  }
  function parseDeckCode(text) {
    const tr = (text || '').trim();
    if (tr[0] === '{') { try { const d = JSON.parse(tr); return { name: d.name || '', main: d.main || {}, life: d.life || {}, unknown: [], side: 0 }; } catch (e) { } }
    const main = {}, life = {}, unknown = []; let name = '', side = 0, section = 'main', firstComment = true;
    tr.split(/\r?\n/).forEach(raw => {
      const ln = raw.trim(); if (!ln) return;
      // หัวข้อส่วน — รับทั้งแบบมี # และไม่มี (bottcg/Discord ก๊อปมามักไม่มี #)
      const bare = ln.replace(/^#+\s*/, '');
      if (ln[0] === '#' || /^(main|life|side)\s*(deck|cards?)?$/i.test(bare) || /^(ไลฟ์|การ์ดหลัก)/.test(bare)) {
        if (/side/i.test(bare)) section = 'side';
        else if (/life|ไลฟ์/i.test(bare)) section = 'life';
        else if (/main|การ์ดหลัก/i.test(bare)) section = 'main';
        else if (firstComment && !name) name = bare;
        firstComment = false; return;
      }
      // ★ รับหลายใบในบรรทัดเดียว: "1x BT01-042-UR 2x BT03-024-R 40x BT08-009-C"
      //   (เดิม match ทั้งบรรทัดเป็นรหัสเดียว → ก๊อปจากแชท/เว็บที่ตัดบรรทัดต่างกันแล้วพังทั้งก้อน)
      const hits = ln.match(/(\d+)\s*x?\s*([A-Za-z]{2,5}\d{0,2}-\d{1,3}(?:-[A-Za-z]{1,4})?)/gi) || [];
      if (!hits.length) { if (firstComment && !name) { name = ln; firstComment = false; } return; }
      firstComment = false;
      hits.forEach(hit => {
        const mm = hit.match(/(\d+)\s*x?\s*(.+)/i); if (!mm) return;
        addEntry(+mm[1], stripRarity(mm[2].trim()));
      });
    });
    function addEntry(n, base) {
      const c = DB.db.byCode[base];
      if (!c) { unknown.push(base); return; }
      if (section === 'side') { side += n; return; }
      const dest = c.type === 'Life' ? life : main;
      dest[base] = (dest[base] || 0) + n;
    }
    return { name, main, life, unknown, side };
  }

  let dcMode = 'import';
  function dcOpen(mode) {
    dcMode = mode;
    const { m, l } = counts();
    if (mode === 'export') {
      byId('dcText').value = buildDeckCode(DB.deck, byId('dbName').value.trim());
      byId('dcText').readOnly = true;
      byId('dcLabel').textContent = 'คัดลอกรหัสนี้แล้วแชร์ให้เพื่อน (เปิดในเว็บ bottcg.com ได้ด้วย)';
      byId('dcSub').textContent = `${m} การ์ดหลัก + ${l} ไลฟ์การ์ด`;
      byId('dcAction').textContent = '📋 คัดลอกรหัส';
    } else {
      byId('dcText').value = ''; byId('dcText').readOnly = false;
      byId('dcLabel').textContent = 'วางรหัสเด็คจาก bottcg.com หรือที่ export ไว้ แล้วกด "ใช้รหัสเด็ค"';
      byId('dcSub').textContent = 'รองรับรูปแบบ 2x BT02-045-C ทีละบรรทัด';
      byId('dcAction').textContent = 'ใช้รหัสเด็ค';
    }
    byId('dcMsg').textContent = '';
    byId('deckCodeModal').classList.remove('hidden');
    if (mode === 'import') setTimeout(() => byId('dcText').focus(), 60);
  }
  const dcClose = () => byId('deckCodeModal').classList.add('hidden');
  byId('dbExport').onclick = () => dcOpen('export');
  byId('dbImport').onclick = () => dcOpen('import');
  byId('dcClose').onclick = dcClose;
  byId('dcCancel').onclick = dcClose;
  byId('dcAction').onclick = () => {
    if (dcMode === 'export') {
      const t = byId('dcText'); t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject())
        .then(() => byId('dcMsg').textContent = '✓ คัดลอกแล้ว', () => byId('dcMsg').textContent = 'กด Ctrl+C เพื่อคัดลอก');
      return;
    }
    const r = parseDeckCode(byId('dcText').value);
    let m = 0, l = 0;
    Object.values(r.main).forEach(n => m += n); Object.values(r.life).forEach(n => l += n);
    if (!m && !l) { byId('dcMsg').textContent = '✗ ไม่พบการ์ดในโค้ด — ตรวจรูปแบบอีกครั้ง'; return; }
    // ★ import ต้องผ่านลิมิตเหมือนกดเพิ่มทีละใบ (เดิมทะลุได้หมด — วาง "10x ขวานเงิน" ก็เข้า)
    //   ตัดส่วนเกินทิ้ง นับรวมต่อชื่อทุกรหัส แล้วรายงานว่าถูกตัดอะไรไปบ้าง
    //   Only #1: เก็บได้แค่ 1 ชื่อ — ชื่อ Only อื่นตัดทิ้ง
    const used = {}, asked = {}, lims = {};
    let keptOnlyName = null;
    const droppedOnly = [];
    ['main', 'life'].forEach(sec => Object.keys(r[sec]).forEach(code => {
      const cd = DB.db.byCode[code]; if (!cd) return;
      if (isOnly(cd)) {
        if (keptOnlyName == null) keptOnlyName = cd.name;
        else if (cd.name !== keptOnlyName) {
          droppedOnly.push(cd.name);
          delete r[sec][code];
          return;
        }
      }
      const lim = limitOf(cd); lims[cd.name] = lim;
      asked[cd.name] = (asked[cd.name] || 0) + r[sec][code];
      const keep = Math.min(r[sec][code], Math.max(0, lim - (used[cd.name] || 0)));
      used[cd.name] = (used[cd.name] || 0) + keep;
      if (keep) r[sec][code] = keep; else delete r[sec][code];
    }));
    // รายงานเป็น "ชื่อ" ไม่ใช่ต่อรหัส (ชื่อเดียวมีได้หลายรหัส เดี๋ยวนับซ้ำ)
    const trimmed = Object.keys(asked).filter(nm => asked[nm] > (used[nm] || 0))
      .map(nm => `${nm} ${asked[nm]}→${used[nm] || 0}${lims[nm] === 0 ? ' (ห้ามใส่)' : ''}`);
    const uniqDropOnly = [...new Set(droppedOnly)];
    m = 0; l = 0;
    Object.values(r.main).forEach(n => m += n); Object.values(r.life).forEach(n => l += n);
    DB.deck = { main: r.main, life: r.life };
    if (r.name) byId('dbName').value = r.name;
    renderDB();
    dcClose();
    let txt = `นำเข้าเด็คแล้ว: ${m} การ์ดหลัก + ${l} ไลฟ์`;
    if (trimmed.length) txt += ` · ⚠️ ตัดส่วนเกินลิมิต ${trimmed.length} ชื่อ (${trimmed.slice(0, 3).join(', ')}${trimmed.length > 3 ? ' …' : ''})`;
    if (uniqDropOnly.length) txt += ` · ⚠️ ตัด Only #1 ซ้ำชื่อ (${uniqDropOnly.slice(0, 3).join(', ')}${uniqDropOnly.length > 3 ? ' …' : ''}) — เหลือแค่ "${keptOnlyName}"`;
    if (r.unknown.length) txt += ` · ข้ามรหัสไม่รู้จัก ${r.unknown.length} (${r.unknown.slice(0, 4).join(', ')}${r.unknown.length > 4 ? ' …' : ''})`;
    // ★ นำเข้าแล้วยังไม่ได้บันทึก = เกมยังใช้เด็คหลักตัวเก่า (สาเหตุอันดับหนึ่งของ "เข้าไปแล้วเด็คไม่ครบ")
    txt += ' — ⚠️ ยังไม่ได้บันทึก! กดปุ่ม "บันทึก" ก่อนไปเล่น ไม่งั้นเกมจะใช้เด็คเดิม';
    if (r.side) txt += ` · ข้าม Side Deck ${r.side}`;
    msg(txt);
  };
  byId('deckCodeModal').addEventListener('click', e => { if (e.target.id === 'deckCodeModal') dcClose(); });

  /* ═══════════════ หน้าดูเด็ค (read-only) ═══════════════ */
  function activeDeckKey() {
    try { return localStorage.getItem('bot_active_deck') || ''; } catch (e) { return ''; }
  }
  function isActiveItem(kind, id) {
    const act = activeDeckKey();
    if (kind === 'saved') return act === id;
    return act === 'starter:' + id;
  }
  function resolveListItem(kind, id) {
    if (kind === 'saved') {
      const sv = CardDB.savedDecks()[id];
      if (!sv) return null;
      return { kind, id, name: id, spec: { main: sv.main || {}, life: sv.life || {} }, editable: true };
    }
    const p = STARTERS_DB && STARTERS_DB[id];
    if (!p) return null;
    return {
      kind, id,
      name: p.name || p.label || id,
      spec: { main: Object.assign({}, p.main || {}), life: Object.assign({}, p.life || {}) },
      editable: false
    };
  }
  function itemBtn(kind, id, label, spec) {
    const on = DK.sel && DK.sel.kind === kind && DK.sel.id === id;
    const star = isActiveItem(kind, id) ? '<i class="dk-star" title="เด็คหลัก">★</i>' : '';
    const m = nCards(spec && spec.main), l = nCards(spec && spec.life);
    return `<button type="button" class="dk-item${on ? ' on' : ''}" data-kind="${esc(kind)}" data-id="${esc(id)}">
      <div class="dk-item-name">${star}<span>${esc(label)}</span></div>
      <div class="dk-item-meta">${m}+${l} · ${esc(colorSummary(spec || {}))}</div>
    </button>`;
  }
  function htmlCardGrid(map) {
    return groupedSpec(map).map(g =>
      `<div class="dk-group">
        <div class="db-group-h">${esc(g.label)} · ${g.total}</div>
        <div class="dk-grid">${g.items.map(([k, n]) => {
          const c = cardOf(k) || {};
          return `<div class="dk-card" data-code="${esc(k)}" title="${esc(c.name || k)} ×${n}">
            <img src="${esc(c.imageUrl || '')}" loading="lazy" alt="">
            <div class="db-badge">×${n}</div>
          </div>`;
        }).join('')}</div>
      </div>`
    ).join('');
  }
  function renderDeckView() {
    const it = DK.sel && resolveListItem(DK.sel.kind, DK.sel.id);
    if (!it) {
      byId('dkView').innerHTML = '<div class="dk-empty">เลือกเด็คจากรายการซ้าย เพื่อดูการ์ดในเด็ค</div>';
      return;
    }
    const stats = specCounts(it.spec);
    const m = nCards(it.spec.main), l = nCards(it.spec.life);
    const active = isActiveItem(it.kind, it.id);
    const delBtn = it.editable ? `<button type="button" class="btn-dark small" data-dk="del">ลบเด็ค</button>` : '';
    const useLabel = active ? '★ เด็คหลักอยู่แล้ว' : 'ใช้เป็นเด็คหลัก';
    byId('dkView').innerHTML = `
      <div class="dk-head">
        <div>
          <div class="dk-title">${esc(it.name)}${active ? ' ★' : ''}</div>
          <div class="dk-sub">Main ${m}/50 · LIFE ${l}/5${it.editable ? '' : ' · เด็คตัวอย่าง'}</div>
        </div>
        <div class="dk-actions">
          <button type="button" class="btn-primary small" data-dk="use"${active ? ' disabled' : ''}>${useLabel}</button>
          <button type="button" class="btn-dark small" data-dk="edit">จัดเด็คนี้</button>
          ${delBtn}
        </div>
      </div>
      <div class="dk-stats db-comp">${htmlComp(stats)}${htmlColors(stats)}</div>
      ${htmlCardGrid(it.spec.main)}
      <div class="dk-group">
        <div class="db-group-h">LIFE CARD · ${l}</div>
        <div class="dk-grid">${Object.entries(it.spec.life).map(([k, n]) => {
          const c = cardOf(k) || {};
          return `<div class="dk-card" data-code="${esc(k)}" title="${esc(c.name || k)}">
            <img src="${esc(c.imageUrl || '')}" loading="lazy" alt="">
            ${n > 1 ? `<div class="db-badge">×${n}</div>` : ''}
          </div>`;
        }).join('')}</div>
      </div>`;
  }
  function renderDeckList() {
    if (!DB.db) return;
    const saved = CardDB.savedDecks();
    const savedNames = Object.keys(saved);
    const presets = Object.keys(STARTERS_DB || {}).filter(k => !STARTER_KEYS.includes(k));
    let html = `<div class="dk-sec">เด็คที่บันทึก</div>`;
    if (!savedNames.length) html += `<div class="dk-empty-mini">ยังไม่มีเด็คที่บันทึก — กด «จัดเด็คใหม่» มุมบนขวา</div>`;
    else html += savedNames.map(n => itemBtn('saved', n, n, saved[n])).join('');
    html += `<div class="dk-sec">เด็คตัวอย่าง (Starter)</div>`;
    html += STARTER_KEYS.map(k => {
      const p = STARTERS_DB && STARTERS_DB[k];
      if (!p) return '';
      return itemBtn('preset', k, p.label || p.name || k, p);
    }).join('');
    if (presets.length) {
      html += `<div class="dk-sec">เด็คพิเศษ</div>`;
      html += presets.map(k => {
        const p = STARTERS_DB[k];
        return itemBtn('preset', k, (p && (p.label || p.name)) || k, p);
      }).join('');
    }
    byId('dkList').innerHTML = html;
    renderDeckView();
  }
  function pickDefaultSel() {
    const act = activeDeckKey();
    const saved = CardDB.savedDecks();
    if (act && saved[act]) return { kind: 'saved', id: act };
    if (act && act.indexOf('starter:') === 0) {
      const id = act.slice(8);
      if (STARTERS_DB && STARTERS_DB[id]) return { kind: 'preset', id };
    }
    const names = Object.keys(saved);
    if (names.length) return { kind: 'saved', id: names[0] };
    return { kind: 'preset', id: 'SD01' };
  }
  function goBuilder(opts) {
    BOT.showScreen('deckbuilder');
    window.openDeckBuilder(opts);
  }
  window.openDeckList = function () {
    Promise.all([CardDB.load(), loadStarters()]).then(([db]) => {
      DB.db = db;
      if (!DK.sel || !resolveListItem(DK.sel.kind, DK.sel.id)) DK.sel = pickDefaultSel();
      renderDeckList();
    });
  };
  byId('dkBack').onclick = () => BOT.showScreen('menu');
  byId('dkNew').onclick = () => goBuilder({ empty: true });
  byId('dkList').addEventListener('click', e => {
    const b = e.target.closest('[data-kind]'); if (!b) return;
    DK.sel = { kind: b.dataset.kind, id: b.dataset.id };
    renderDeckList();
  });
  byId('dkView').addEventListener('click', e => {
    const act = e.target.closest('[data-dk]');
    if (act) {
      const it = DK.sel && resolveListItem(DK.sel.kind, DK.sel.id);
      if (!it) return;
      if (act.dataset.dk === 'edit') {
        goBuilder({
          deck: it.spec,
          name: it.editable ? it.id : it.name,
          note: it.editable ? `โหลด "${it.id}" แล้ว` : `คัดลอกเด็คตัวอย่างมาแล้ว — กดบันทึกถ้าจะเก็บเป็นเด็คตัวเอง`
        });
        return;
      }
      if (act.dataset.dk === 'use') {
        let key = it.kind === 'saved' ? it.id : 'starter:' + it.id;
        if (it.kind === 'preset' && !STARTER_KEYS.includes(it.id)) {
          const sv = CardDB.savedDecks();
          if (!sv[it.name]) {
            sv[it.name] = { main: it.spec.main, life: it.spec.life };
            CardDB.saveDecks(sv);
          }
          key = it.name;
          DK.sel = { kind: 'saved', id: it.name };
        }
        try { localStorage.setItem('bot_active_deck', key); } catch (err) { }
        renderDeckList();
        return;
      }
      if (act.dataset.dk === 'del' && it.editable) {
        if (!confirm('ลบเด็ค "' + it.id + '" ?')) return;
        const sv = CardDB.savedDecks();
        delete sv[it.id];
        CardDB.saveDecks(sv);
        try { if (localStorage.getItem('bot_active_deck') === it.id) localStorage.removeItem('bot_active_deck'); } catch (err) { }
        DK.sel = pickDefaultSel();
        renderDeckList();
      }
      return;
    }
    const card = e.target.closest('[data-code]');
    if (!card) return;
    const c = cardOf(card.dataset.code);
    if (!c) return;
    byId('dkZoom').innerHTML = `<div class="gl-zoom-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
      <div class="gl-zoom-info">
        <div class="gl-zoom-name">${esc(c.name)}</div>
        <div class="gl-zoom-meta">${esc(`${c.code} · ${c.type}${c.subtype ? ' / ' + c.subtype : ''} · ${c.rarity}${c.color ? ' · ' + c.color : ''}${c.symbol ? ' · ' + c.symbol : ''}${c.cost !== '' && c.cost != null ? ' · COST ' + c.cost : ''}${c.power !== '' && c.power != null ? ' · POWER ' + c.power : ''}`)}</div>
        <div class="gl-zoom-effect">${esc((c.effect || '—') + (c.favorText ? '\n\n"' + c.favorText + '"' : ''))}</div>
      </div>`;
    byId('dkZoom').classList.remove('hidden');
  });
  byId('dkZoom').addEventListener('click', () => byId('dkZoom').classList.add('hidden'));
})();