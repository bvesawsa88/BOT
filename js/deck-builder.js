/* BoT — Deck Builder (จัดเด็ค)
   ใช้ CardDB จาก js/carddb.js · BotUtil จาก js/util.js · เซฟเด็ค localStorage bot_decks_v1 */
(function () {
  'use strict';
  const { byId, esc, asset } = BotUtil;

/* ═══════════════ DECK BUILDER ═══════════════ */
  const DB = { db: null, q: '', type: '', color: '', cost: '', symbol: '', series: '', subtype: '', shown: 60, sort: 'code', dir: 1, deck: { main: {}, life: {} }, name: '', preview: null };
  const RARITY_ORDER = { C: 0, R: 1, SR: 2, UR: 3, SEC: 4, SCR: 4, USEC: 5, PR: 6, CBR: 7 };

  window.openDeckBuilder = function () {
    CardDB.load().then(db => {
      DB.db = db;
      byId('dbCount').textContent = `${db.cards.length} รหัสการ์ด · Rule Book 3.2`;
      fillSelect('dbSymbol', 'Symbol — ทั้งหมด', [...new Set(db.cards.map(c => c.symbol).filter(Boolean))].sort());
      fillSelect('dbSeries', 'ซีรีส์ — ทั้งหมด', [...new Set(db.cards.map(c => c.series).filter(Boolean))].sort());
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
  function setPreviewDB(code) {
    DB.preview = code;
    const c = DB.db.byCode[code];
    if (!c) { byId('dbPv').innerHTML = ''; return; }
    const meta = `${c.name} — ${c.type}${c.subtype ? ' · ' + c.subtype : ''}${c.cost !== '' && c.cost != null ? ` · COST ${c.cost}` : ''}${c.power !== '' && c.power != null ? ` · POWER ${c.power}` : ''}`;
    byId('dbPv').innerHTML = `<div class="pv-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
      <div class="db-pv-text">${esc(meta)}\n${esc(c.effect || '')}</div>`;
  }

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

    // สัดส่วนสี + GEM
    const colorHex = { 'แดง': '#c0392b', 'ฟ้า': '#3a7abf', 'ม่วง': '#8e5aa8', 'เขียว': '#3f8f5a' };
    const colorCounts = {}; let gemSum = 0, cardSum = 0;
    Object.entries(DB.deck.main).forEach(([k, n]) => {
      const c = DB.db.byCode[k]; if (!c) return;
      const col = c.color || 'ไร้สี';
      colorCounts[col] = (colorCounts[col] || 0) + n;
      gemSum += (+c.gem || 0) * n; cardSum += n;
    });
    if (cardSum) {
      const bars = Object.entries(colorCounts).map(([col, n]) =>
        `<div style="width:${n / cardSum * 100}%;background:${colorHex[col] || '#8a7f72'}"></div>`).join('');
      const legend = Object.entries(colorCounts).map(([col, n]) =>
        `<span class="db-dot"><i style="background:${colorHex[col] || '#8a7f72'}"></i>${esc(col)} ${n}</span>`).join('');
      const avg = gemSum / cardSum;
      byId('dbColors').innerHTML = `<div class="db-colorbar">${bars}</div><div class="db-legend">${legend}</div>
        <div class="db-gem">GEM รวมในเด็ค ${gemSum} · เฉลี่ย ${avg.toFixed(2)}/ใบ${avg < 1 ? ' — ค่อนข้างต่ำ ระวังจ่าย Cost ไม่ทัน' : ''}</div>`;
    } else byId('dbColors').innerHTML = '';

    // รายการเด็ค
    const entry = (k, n) => {
      const c = DB.db.byCode[k] || {};
      const meta = (c.cost !== '' && c.cost != null ? `C${c.cost}` : '') + (c.power !== '' && c.power != null ? `/P${c.power}` : '');
      return `<div class="db-row" data-code="${esc(k)}">
        <img src="${esc(c.imageUrl || '')}" loading="lazy" alt="">
        <div class="db-row-name">${esc(c.name || k)}</div>
        <div class="db-row-meta">${esc(meta)}</div>
        <button class="db-pm" data-act="sub">−</button><div class="db-row-n">×${n}</div><button class="db-pm" data-act="add">+</button>
      </div>`;
    };
    byId('dbMainList').innerHTML = Object.entries(DB.deck.main)
      .sort((a, b) => ((+DB.db.byCode[a[0]].cost || 0) - (+DB.db.byCode[b[0]].cost || 0)) || (DB.db.byCode[a[0]].name < DB.db.byCode[b[0]].name ? -1 : 1))
      .map(([k, n]) => entry(k, n)).join('');
    byId('dbLifeList').innerHTML = Object.entries(DB.deck.life).map(([k, n]) => entry(k, n)).join('');

    // เด็คที่เซฟ
    const saved = Object.keys(CardDB.savedDecks());
    byId('dbSaved').innerHTML = saved.length
      ? `<span class="db-hint">เด็คที่เซฟ:</span> ` + saved.map(n => `<button class="db-saved-chip" data-name="${esc(n)}" title="คลิก = โหลด · คลิกขวา = ลบ">${esc(n)}</button>`).join('')
      : '';
  }

  /* events — deck builder */
  byId('dbBack').onclick = () => BOT.showScreen('menu');
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
      if (act) { (act.dataset.act === 'add' ? addCode : subCode)(row.dataset.code); }
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
    msg(`บันทึก "${name}" แล้ว — ใช้เป็นเด็คหลักตอนเข้าห้อง/ซ้อมได้เลย`);
    renderDB();
  };
  byId('dbSaved').addEventListener('click', e => {
    const b = e.target.closest('.db-saved-chip'); if (!b) return;
    const sv = CardDB.savedDecks(), name = b.dataset.name;
    if (sv[name]) { DB.deck = { main: { ...sv[name].main }, life: { ...sv[name].life } }; byId('dbName').value = name; msg(`โหลด "${name}" แล้ว`); renderDB(); }
  });
  byId('dbSaved').addEventListener('contextmenu', e => {
    const b = e.target.closest('.db-saved-chip'); if (!b) return;
    e.preventDefault();
    const sv = CardDB.savedDecks(); delete sv[b.dataset.name]; CardDB.saveDecks(sv);
    msg(`ลบ "${b.dataset.name}" แล้ว`); renderDB();
  });
  byId('dbClearDeck').onclick = () => { DB.deck = { main: {}, life: {} }; msg('ล้างเด็คแล้ว'); renderDB(); };
  let STARTERS_DB = null;
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
  Promise.all([
    fetch(asset('data/starters.json')).then(r => r.json()).catch(() => null),
    fetch(asset('data/custom-decks.json')).then(r => r.json()).catch(() => null),
  ]).then(([starters, custom]) => {
    STARTERS_DB = Object.assign({}, starters || {}, custom || {});
    fillStarterSelect(STARTERS_DB);
  });
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
})();