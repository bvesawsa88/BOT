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

  window.openGallery = function () {
    CardDB.load().then(db => {
      GL.db = db;
      fillSelect('glSeries', 'ทุกซีรีส์', [...new Set(db.cards.map(c => c.series).filter(Boolean))].sort());
      fillSelect('glRarity', 'ทุกความหายาก', [...new Set(db.cards.map(c => c.rarity).filter(Boolean))].sort());
      // ★ เปิดซองได้ทุกชุด (ไม่จำกัดแค่ BT) — เรียง BT ก่อน แล้วชุดอื่นตามหลัง
      const cnt = {};
      db.cards.forEach(c => { if (c.series) cnt[c.series] = (cnt[c.series] || 0) + 1; });
      const boosters = Object.keys(cnt).sort((a, b) => {
        const ba = /^BT/.test(a) ? 0 : 1, bb = /^BT/.test(b) ? 0 : 1;
        return ba !== bb ? ba - bb : (a < b ? -1 : 1);
      });
      byId('glPackSeries').innerHTML = boosters.map(v => `<option value="${esc(v)}">${esc(v)} (${cnt[v]} ใบ)</option>`).join('');
      if (!GL.packSeries && boosters.length) GL.packSeries = boosters[0];
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
    const filtered = GL.db.cards.filter(c =>
      (!q || (c.name + ' ' + (c.effect || '') + ' ' + c.code).toLowerCase().includes(q)) &&
      (!GL.series || c.series === GL.series) && (!GL.rarity || c.rarity === GL.rarity));
    byId('glResult').textContent = `${filtered.length} ใบ · แสดง ${Math.min(GL.shown, filtered.length)} · คลิกการ์ดเพื่อดูเต็มจอ`;
    byId('glGrid').innerHTML = filtered.slice(0, GL.shown).map(c =>
      `<div class="gl-card" data-code="${esc(c.code)}">
        <div class="gl-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
        <div class="gl-rar">${esc(c.rarity)}</div>
      </div>`).join('');
    byId('glMore').classList.toggle('hidden', filtered.length <= GL.shown);
  }
  function zoomCard(c) {
    byId('glZoom').innerHTML = `<div class="gl-zoom-img" style="background-image:url('${esc(c.imageUrl)}')"></div>
      <div class="gl-zoom-info">
        <div class="gl-zoom-name">${esc(c.name)}</div>
        <div class="gl-zoom-meta">${esc(`${c.code} · ${c.type}${c.subtype ? ' / ' + c.subtype : ''} · ${c.rarity}${c.color ? ' · ' + c.color : ''}${c.symbol ? ' · ' + c.symbol : ''}${c.cost !== '' && c.cost != null ? ' · COST ' + c.cost : ''}${c.power !== '' && c.power != null ? ' · POWER ' + c.power : ''}`)}</div>
        <div class="gl-zoom-effect">${esc((c.effect || '') + (c.favorText ? '\n\n"' + c.favorText + '"' : ''))}</div>
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
    const el = e.target.closest('[data-code]');
    if (el) zoomCard(GL.db.byCode[el.dataset.code]);
  });
  byId('glZoom').onclick = () => byId('glZoom').classList.add('hidden');
  byId('glPackSeries').onchange = e => { GL.packSeries = e.target.value; };
  byId('glOpenPack').onclick = () => {
    const pool = GL.db.cards.filter(c => c.series === (GL.packSeries || byId('glPackSeries').value));
    if (!pool.length) return;
    const pick = rs => { const p = pool.filter(c => rs.includes(c.rarity)); return p.length ? p[Math.floor(Math.random() * p.length)] : null; };
    const pickC = () => pick(['C']) || pool[Math.floor(Math.random() * pool.length)];
    // ซอง = 5 ใบ: Common 4 + การ์ดหายาก (Rare ขึ้นไป) 1 ใบ อยู่ "ท้ายซอง" เสมอ
    // สุ่มระดับความหายากตามน้ำหนัก (Rare พบบ่อย, ยิ่งสูงยิ่งหายาก)
    const WEIGHTS = [['R', 55], ['SR', 28], ['UR', 11], ['SCR', 4.5], ['USEC', 1], ['PR', 0.3], ['CBR', 0.2]];
    const avail = WEIGHTS.filter(([r]) => pool.some(c => c.rarity === r));
    let hit = null;
    if (avail.length) {
      const total = avail.reduce((s, [, w]) => s + w, 0);
      let roll = Math.random() * total, hitR = avail[0][0];
      for (const [r, w] of avail) { roll -= w; if (roll <= 0) { hitR = r; break; } }
      hit = pick([hitR]);
    }
    hit = hit || pick(['R', 'SR', 'UR', 'SCR']) || pickC();
    // Common 4 ใบ ตามด้วยการ์ดหายาก 1 ใบท้ายสุด (เปิดท้ายซอง)
    const out = [pickC(), pickC(), pickC(), pickC(), hit];
    byId('glPackCards').innerHTML = out.map((c, i) => {
      const hot = ['UR', 'SCR', 'USEC', 'PR', 'CBR'].includes(c.rarity);
      return `<div class="gl-pack-card" data-code="${esc(c.code)}" style="animation:packPop .5s ease-out ${i * .12}s both${hot ? `, shine 1.2s ease-in-out ${i * .12 + .5}s 2` : ''}">
        <div class="gl-img big" style="background-image:url('${esc(c.imageUrl)}')"></div>
        <div class="gl-pack-name">${esc(c.name)}</div>
        <div class="gl-pack-rar${hot ? ' hot' : ''}">${esc(c.rarity)}</div>
      </div>`;
    }).join('');
  };
  byId('glPackCards').addEventListener('click', e => {
    const el = e.target.closest('[data-code]');
    if (el) zoomCard(GL.db.byCode[el.dataset.code]);
  });

})();