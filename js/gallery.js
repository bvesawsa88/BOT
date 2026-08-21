/* BoT — Card Gallery + เปิดซองจำลอง
   ใช้ CardDB จาก js/carddb.js · BotUtil จาก js/util.js */
(function () {
  'use strict';
  const { byId, esc } = BotUtil;
  function fillSelect(id, first, vals) {
    byId(id).innerHTML = `<option value="">${esc(first)}</option>` +
      vals.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }

/* ═══════════════ CARD GALLERY + เปิดซอง ═══════════════ */
  const GL = { db: null, mode: 'gallery', q: '', series: '', rarity: '', shown: 72, packSeries: '' };
  const HOT = ['UR', 'SEC', 'USEC', 'PR', 'CBR'];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function galleryPool() {
    return GL.db.prints || GL.db.cards;
  }

  function packPool() {
    const series = GL.packSeries || byId('glPackSeries').value;
    return galleryPool().filter(c => c.series === series && /^BT/.test(c.series || ''));
  }

  function lookupPrint(el) {
    if (!el || !GL.db) return null;
    if (el.dataset.uid && GL.db.byUid) return GL.db.byUid[el.dataset.uid];
    return GL.db.byCode[el.dataset.code];
  }

  function pickRarity(pool, rarity) {
    const p = pool.filter(c => c.rarity === rarity);
    return p.length ? p[Math.floor(Math.random() * p.length)] : null;
  }

  function pickC(pool) {
    return pickRarity(pool, 'C') || pool[Math.floor(Math.random() * pool.length)];
  }

  function makePack(pool, hitRarity) {
    let hit = pickRarity(pool, hitRarity);
    if (!hit) hit = pickRarity(pool, 'R') || pickC(pool);
    return [pickC(pool), pickC(pool), pickC(pool), pickC(pool), hit];
  }

  function cardHtml(c, i, delayScale) {
    const hot = HOT.includes(c.rarity);
    const d = (delayScale == null ? i : delayScale) * 0.08;
    return `<div class="gl-pack-card" data-uid="${esc(c.uid || '')}" data-code="${esc(c.code)}" style="animation:packPop .45s ease-out ${d}s both${hot ? `, shine 1.2s ease-in-out ${d + .4}s 2` : ''}">
      <div class="gl-img big" style="background-image:url('${esc(c.imageUrl)}')"></div>
      <div class="gl-pack-name">${esc(c.name)}</div>
      <div class="gl-pack-rar${hot ? ' hot' : ''}">${esc(c.rarity)}</div>
    </div>`;
  }

  function showSummary(hits) {
    const order = ['SEC', 'UR', 'SR', 'R', 'C'];
    const cnt = {};
    hits.forEach(c => { cnt[c.rarity] = (cnt[c.rarity] || 0) + 1; });
    const keys = [...order.filter(k => cnt[k]), ...Object.keys(cnt).filter(k => !order.includes(k))];
    byId('glPackSummary').innerHTML = keys.map(k =>
      `<span class="gl-box-chip${HOT.includes(k) ? ' hot' : ''}">${esc(k)} ×${cnt[k]}</span>`
    ).join('') + `<span class="gl-box-chip">ท้ายซอง ${hits.length} ใบ</span>`;
    byId('glPackSummary').classList.remove('hidden');
  }

  window.openGallery = function () {
    CardDB.load().then(db => {
      GL.db = db;
      const pool = db.prints || db.cards;
      const rarOrder = ['C', 'R', 'SR', 'UR', 'SEC', 'USEC', 'PR', 'CBR'];
      const rarities = [...new Set(pool.map(c => c.rarity).filter(Boolean))]
        .sort((a, b) => {
          const ia = rarOrder.indexOf(a), ib = rarOrder.indexOf(b);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
        });
      fillSelect('glSeries', 'ทุกซีรีส์', [...new Set(pool.map(c => c.series).filter(Boolean))].sort());
      fillSelect('glRarity', 'ทุกความหายาก', rarities);
      // เปิดซอง/กล่องเฉพาะชุด BT (นับทุกพิมพ์รวม SEC)
      const cnt = {};
      pool.forEach(c => { if (c.series && /^BT/.test(c.series)) cnt[c.series] = (cnt[c.series] || 0) + 1; });
      const boosters = Object.keys(cnt).sort();
      byId('glPackSeries').innerHTML = boosters.map(v => `<option value="${esc(v)}">${esc(v)} (${cnt[v]} ใบ)</option>`).join('');
      if (!GL.packSeries || !cnt[GL.packSeries]) GL.packSeries = boosters[0] || '';
      if (GL.packSeries) byId('glPackSeries').value = GL.packSeries;
      renderGL();
    });
  };
  function setGLMode(mode) {
    GL.mode = mode;
    byId('glTabG').className = mode === 'gallery' ? 'btn-primary small' : 'btn-dark small';
    byId('glTabP').className = mode === 'pack' ? 'btn-primary small' : 'btn-dark small';
    byId('glGalleryView').classList.toggle('hidden', mode !== 'gallery');
    byId('glPackView').classList.toggle('hidden', mode !== 'pack');
  }
  function renderGL() {
    if (!GL.db) return;
    setGLMode(GL.mode);
    const q = GL.q.trim().toLowerCase();
    const filtered = galleryPool().filter(c => {
      const eff = c.effect || '';
      const textMatch = !q || (
        (c.name + ' ' + eff + ' ' + c.code).toLowerCase().includes(q) ||
        (q === 'คู่หู' && /\[\s*Link\b/i.test(eff)) ||
        (q === 'link' && eff.includes('คู่หู'))
      );
      return textMatch &&
        (!GL.series || c.series === GL.series) && (!GL.rarity || c.rarity === GL.rarity);
    });
    byId('glResult').textContent = `${filtered.length} ใบ · แสดง ${Math.min(GL.shown, filtered.length)} · คลิกการ์ดเพื่อดูเต็มจอ`;
    byId('glGrid').innerHTML = filtered.slice(0, GL.shown).map(c =>
      `<div class="gl-card" data-uid="${esc(c.uid || '')}" data-code="${esc(c.code)}">
        <div class="gl-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
        <div class="gl-rar">${esc(c.rarity)}</div>
      </div>`).join('');
    byId('glMore').classList.toggle('hidden', filtered.length <= GL.shown);
  }
  function zoomCard(c) {
    byId('glZoom').innerHTML = `<div class="gl-zoom-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
      <div class="gl-zoom-info">
        <div class="gl-zoom-name">${esc(c.name)}</div>
        <div class="gl-zoom-meta">${BotUtil.cardMetaHtml(c)}</div>
        <div class="gl-zoom-effect">${BotUtil.formatEffect((c.effect || '') + (c.favorText ? '\n\n"' + c.favorText + '"' : ''))}</div>
      </div>`;
    byId('glZoom').classList.remove('hidden');
  }

  byId('glBack').onclick = () => BOT.showScreen('menu');
  byId('glTabG').onclick = () => { GL.mode = 'gallery'; renderGL(); };
  byId('glTabP').onclick = () => { GL.mode = 'pack'; renderGL(); };
  byId('glQ').addEventListener('input', e => { GL.q = e.target.value; GL.shown = 72; renderGL(); });
  byId('glSeries').onchange = e => { GL.series = e.target.value; GL.shown = 72; renderGL(); };
  byId('glRarity').onchange = e => { GL.rarity = e.target.value; GL.shown = 72; renderGL(); };
  byId('glMore').onclick = () => { GL.shown += 72; renderGL(); };
  byId('glGrid').addEventListener('click', e => {
    const c = lookupPrint(e.target.closest('[data-code], [data-uid]'));
    if (c) zoomCard(c);
  });
  byId('glZoom').onclick = () => byId('glZoom').classList.add('hidden');
  byId('glPackSeries').onchange = e => { GL.packSeries = e.target.value; };

  // 1 ซอง: Common ×4 + ท้ายซองตามน้ำหนัก (ไม่การันตี)
  byId('glOpenPack').onclick = () => {
    const pool = packPool();
    if (!pool.length) return;
    const WEIGHTS = [['R', 55], ['SR', 28], ['UR', 11], ['SEC', 4.5], ['USEC', 1], ['PR', 0.3], ['CBR', 0.2]];
    const avail = WEIGHTS.filter(([r]) => pool.some(c => c.rarity === r));
    let hitR = 'R';
    if (avail.length) {
      const total = avail.reduce((s, [, w]) => s + w, 0);
      let roll = Math.random() * total;
      for (const [r, w] of avail) { roll -= w; if (roll <= 0) { hitR = r; break; } }
    }
    const out = makePack(pool, hitR);
    byId('glPackSummary').classList.add('hidden');
    byId('glPackCards').className = 'gl-pack-cards';
    byId('glPackCards').innerHTML = out.map((c, i) => cardHtml(c, i)).join('');
  };

  // 1 กล่อง = 20 ซอง การันตี: 1 SEC + 2 UR + 3 SR + 14 R
  byId('glOpenBox').onclick = () => {
    const pool = packPool();
    if (!pool.length) return;
    const hitsPlan = shuffle([
      'SEC',
      'UR', 'UR',
      'SR', 'SR', 'SR',
      ...Array(14).fill('R')
    ]);
    const packs = hitsPlan.map(r => makePack(pool, r));
    const hits = packs.map(p => p[4]);
    showSummary(hits);
    byId('glPackCards').className = 'gl-box-packs';
    byId('glPackCards').innerHTML = packs.map((cards, pi) => {
      const hit = cards[4];
      return `<div class="gl-box-pack">
        <div class="gl-box-pack-head">
          <span>ซอง ${pi + 1}/20</span>
          <span class="hit">ท้ายซอง · ${esc(hit.rarity)}</span>
        </div>
        <div class="gl-pack-cards">${cards.map((c, i) => cardHtml(c, i, pi * 0.35 + i * 0.05)).join('')}</div>
      </div>`;
    }).join('');
  };

  byId('glPackCards').addEventListener('click', e => {
    const c = lookupPrint(e.target.closest('[data-code], [data-uid]'));
    if (c) zoomCard(c);
  });

})();
