/* BoT — สกินหลังการ์ด / ไลฟ์ / เพลย์แมท */
(function (root) {
  'use strict';
  const KEY = 'bot_skins_v1';
  const CUSTOM_KEY = 'bot_skins_custom_v1';
  const SLOTS = ['cardBack', 'lifeBack', 'playmat'];
  const SLOT_LABEL = { cardBack: 'หลังการ์ด', lifeBack: 'หลังไลฟ์', playmat: 'เพลย์แมท' };
  const SLOT_SIZE = { cardBack: [510, 717], lifeBack: [510, 717], playmat: [1069, 330] };

  let catalog = {
    defaultPack: 'official',
    fallbackPack: 'official',
    sponsorPack: 'tinny',
    packs: [
      {
        id: 'official', name: 'ธรรมดา', label: 'ทางการ Battle of Talingchan', tier: 'free',
        cardBack: 'assets/card-back.png',
        lifeBack: 'assets/life-card-back.png',
        playmat: 'assets/mat-b.png',
        playmatOpp: 'assets/mat-a.png'
      },
      {
        id: 'tinny', name: 'TINNY', label: 'สปอน · TINNY Cafe', tier: 'sponsor',
        cardBack: 'assets/skins/tinny/card-back.png',
        lifeBack: 'assets/skins/tinny/life-back.png',
        playmat: 'assets/skins/tinny/playmat.png',
        playmatOpp: 'assets/skins/tinny/playmat-opp.png'
      }
    ]
  };
  let loggedIn = false;
  let onNeedLogin = null;
  let fileSlot = null;
  const fileInp = document.createElement('input');
  fileInp.type = 'file';
  fileInp.accept = 'image/png,image/jpeg,image/webp,image/gif';
  fileInp.hidden = true;
  function attachFile() {
    if (!fileInp.isConnected && document.body) document.body.appendChild(fileInp);
  }
  if (document.body) attachFile();
  else document.addEventListener('DOMContentLoaded', attachFile);

  function packs() { return catalog.packs || []; }
  function packById(id) { return packs().find(p => p.id === id) || null; }
  function fallbackPack() {
    return packById(catalog.fallbackPack) || packById('official') || packs()[0] || null;
  }
  function officialId() {
    const d = fallbackPack();
    return d ? d.id : 'official';
  }
  function sponsorPackId() {
    return catalog.sponsorPack || 'tinny';
  }
  function playerPacks() {
    const sid = sponsorPackId();
    return packs().filter(p => p.tier !== 'shop' && p.tier !== 'sponsor' && p.id !== sid);
  }
  function isPlayerSlot(id) {
    if (id === 'custom') return true;
    const p = packById(id);
    if (!p) return false;
    if (p.tier === 'shop' || p.tier === 'sponsor') return false;
    if (p.id === sponsorPackId()) return false;
    return true;
  }
  function clampSlot(id) {
    const s = String(id || '');
    return isPlayerSlot(s) ? s : officialId();
  }
  function defaultSel() {
    const id = clampSlot(catalog.defaultPack || 'official');
    return { cardBack: id, lifeBack: id, playmat: id };
  }
  function readSel() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        const d = defaultSel();
        return {
          cardBack: clampSlot(raw.cardBack || d.cardBack),
          lifeBack: clampSlot(raw.lifeBack || d.lifeBack),
          playmat: clampSlot(raw.playmat || d.playmat)
        };
      }
    } catch (e) { }
    return defaultSel();
  }
  function sponsorIds() {
    const id = packById(sponsorPackId()) ? sponsorPackId() : officialId();
    return { cardBack: id, lifeBack: id, playmat: id };
  }
  function hasAnyCustom() {
    const c = readCustom();
    return SLOTS.some(slot => !!c[slot]);
  }
  function writeSel(sel) {
    try { localStorage.setItem(KEY, JSON.stringify(sel)); } catch (e) { }
  }
  function readCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeCustom(obj) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(obj)); } catch (e) { }
  }
  function cssUrl(u) {
    if (!u) return 'none';
    let href = String(u);
    if (/^(data:|blob:)/i.test(href)) return 'url(' + JSON.stringify(href) + ')';
    try { href = new URL(href, document.baseURI).href; } catch (e) { }
    return 'url(' + JSON.stringify(href) + ')';
  }
  function slotUrl(slot, id, allowCustom) {
    if (allowCustom !== false && id === 'custom') {
      const u = readCustom()[slot];
      if (u) return u;
      const fb = fallbackPack();
      return fb ? fb[slot] : '';
    }
    const p = packById(id);
    if (p && p[slot]) return p[slot];
    const fb = fallbackPack();
    return fb ? fb[slot] : '';
  }
  function slotMatOpp(id) {
    if (id === 'custom') return '';
    const p = packById(id);
    return (p && p.playmatOpp) || '';
  }
  function packMatch(sel) {
    const a = sel.cardBack, b = sel.lifeBack, c = sel.playmat;
    if (a === b && b === c) return a;
    return '';
  }
  function setSideVars(side, sel, allowCustom) {
    const root = document.documentElement;
    const suf = side === 'opp' ? '-opp' : '-my';
    root.style.setProperty('--skin-card-back' + suf, cssUrl(slotUrl('cardBack', sel.cardBack, allowCustom)));
    root.style.setProperty('--skin-life-back' + suf, cssUrl(slotUrl('lifeBack', sel.lifeBack, allowCustom)));
    const mat = slotUrl('playmat', sel.playmat, allowCustom);
    root.style.setProperty('--skin-mat' + suf, cssUrl(mat));
    const oppEl = document.querySelector('.mat-opp');
    if (side === 'opp' && oppEl) {
      const preflip = !!slotMatOpp(sel.playmat);
      if (preflip) root.style.setProperty('--skin-mat-opp', cssUrl(slotMatOpp(sel.playmat)));
      oppEl.classList.toggle('mat-skin-flip', !preflip);
    }
  }
  function applyLocal() {
    const sel = readSel();
    setSideVars('my', sel, true);
    setSideVars('opp', sel, true);
    syncMounts();
    return sel;
  }
  function applyMatch(mySel, oppSel) {
    const mine = mySel || readSel();
    setSideVars('my', mine, true);
    if (oppSel && (oppSel.cardBack || oppSel.lifeBack || oppSel.playmat)) {
      const oid = officialId();
      setSideVars('opp', {
        cardBack: oppSel.cardBack || oid,
        lifeBack: oppSel.lifeBack || oid,
        playmat: oppSel.playmat || oid
      }, false);
    } else {
      setSideVars('opp', mine, true);
    }
    syncMounts();
  }
  function exportIds() {
    const sel = readSel();
    const oid = catalog.fallbackPack || 'official';
    return {
      cardBack: sel.cardBack === 'custom' ? oid : sel.cardBack,
      lifeBack: sel.lifeBack === 'custom' ? oid : sel.lifeBack,
      playmat: sel.playmat === 'custom' ? oid : sel.playmat
    };
  }
  function setPack(id) {
    if (id === 'custom') {
      writeSel({ cardBack: 'custom', lifeBack: 'custom', playmat: 'custom' });
      applyLocal();
      return;
    }
    const p = packById(id);
    if (!p || p.tier === 'shop' || p.tier === 'sponsor') return;
    writeSel({ cardBack: id, lifeBack: id, playmat: id });
    applyLocal();
  }
  function setSlot(slot, id) {
    if (!SLOTS.includes(slot) || !isPlayerSlot(id)) return;
    const sel = readSel();
    sel[slot] = id;
    writeSel(sel);
    applyLocal();
  }

  function resizeImage(file, maxW, maxH) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxW / w, maxH / h);
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#140808';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let data = cv.toDataURL('image/jpeg', 0.84);
        if (data.length > 280000) data = cv.toDataURL('image/jpeg', 0.7);
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านรูปไม่ได้')); };
      img.src = url;
    });
  }
  async function importSlot(slot, file) {
    const size = SLOT_SIZE[slot] || [510, 717];
    const data = await resizeImage(file, size[0], size[1]);
    const custom = readCustom();
    custom[slot] = data;
    writeCustom(custom);
    setSlot(slot, 'custom');
  }
  function startImport(slot) {
    if (!loggedIn) {
      if (typeof onNeedLogin === 'function') onNeedLogin();
      return;
    }
    fileSlot = slot;
    fileInp.value = '';
    fileInp.click();
  }
  fileInp.addEventListener('change', () => {
    const f = fileInp.files && fileInp.files[0];
    const slot = fileSlot;
    fileSlot = null;
    if (!f || !slot) return;
    importSlot(slot, f).catch(err => {
      if (root.BotUtil && typeof console !== 'undefined') console.warn(err);
      alert((err && err.message) || 'นำเข้าไม่สำเร็จ');
    });
  });

  function thumbFor(slot, id) {
    if (id === 'custom') return readCustom()[slot] || slotUrl(slot, catalog.fallbackPack, false);
    return slotUrl(slot, id, false);
  }
  function mountHtml() {
    const sel = readSel();
    const active = packMatch(sel);
    const btns = playerPacks().map(p =>
      `<button type="button" class="skin-pack-btn${active === p.id ? ' on' : ''}" data-skin-pack="${p.id}">
        <img src="${p.cardBack}" alt="">
        <span>${p.name}</span>
      </button>`
    ).join('');
    const customSrc = thumbFor('cardBack', 'custom');
    return `<div class="skin-setup">
      <div class="menu-deck-lab">สกินโต๊ะ</div>
      <div class="skin-pack-row">
        ${btns}
        <button type="button" class="skin-pack-btn locked" data-skin-pack="custom" title="ยังไม่พร้อมใช้งาน" aria-disabled="true">
          <img src="${customSrc}" alt="">
          <span>Custom</span>
          <span class="skin-soon">ยังไม่พร้อมใช้งาน</span>
        </button>
      </div>
      <p class="skin-note">ธรรมดา = ชุดทางการ · Custom ยังไม่พร้อมใช้งาน · บอทใช้สกินสปอนเซอร์เสมอ</p>
    </div>`;
  }
  function syncMounts() {
    document.querySelectorAll('[data-skin-mount]').forEach(el => {
      el.innerHTML = mountHtml();
    });
    fillModal();
  }
  function fillModal() {
    const body = document.getElementById('skinSlots');
    if (!body) return;
    const sel = readSel();
    body.innerHTML = SLOTS.map(slot => {
      const chips = playerPacks().map(p => {
        const src = slot === 'playmat' ? (p.playmat || p.cardBack) : p[slot];
        const extra = slot === 'playmat' ? ' skin-chip-mat' : '';
        return `<button type="button" class="skin-chip${extra}${sel[slot] === p.id ? ' on' : ''}" data-skin-slot="${slot}" data-skin-id="${p.id}">
          <img src="${src}" alt="">
          <span>${p.name}</span>
        </button>`;
      }).join('');
      const customOn = sel[slot] === 'custom' ? ' on' : '';
      const customSrc = thumbFor(slot, 'custom');
      const matCls = slot === 'playmat' ? ' skin-chip-mat' : '';
      return `<div class="skin-slot">
        <div class="skin-slot-h">${SLOT_LABEL[slot]}</div>
        <div class="skin-slot-row">
          ${chips}
          <button type="button" class="skin-chip${matCls}${customOn}" data-skin-import="${slot}">
            <img src="${customSrc}" alt="">
            <span>นำเข้า</span>
          </button>
        </div>
      </div>`;
    }).join('');
  }
  function openModal() {
    fillModal();
    const m = document.getElementById('skinModal');
    if (m) m.classList.remove('hidden');
  }
  function closeModal() {
    const m = document.getElementById('skinModal');
    if (m) m.classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    const packBtn = e.target.closest('[data-skin-pack]');
    if (packBtn) {
      const id = packBtn.getAttribute('data-skin-pack');
      if (id === 'custom') return;
      setPack(id);
      return;
    }
    if (e.target.closest('[data-skin-customize]')) { openModal(); return; }
    const chip = e.target.closest('[data-skin-slot][data-skin-id]');
    if (chip) {
      setSlot(chip.getAttribute('data-skin-slot'), chip.getAttribute('data-skin-id'));
      return;
    }
    const imp = e.target.closest('[data-skin-import]');
    if (imp) {
      startImport(imp.getAttribute('data-skin-import'));
      return;
    }
    if (e.target.id === 'skinModal' || e.target.closest('#skinModalClose') || e.target.closest('#skinModalDone')) {
      closeModal();
    }
  });

  async function load() {
    try {
      const v = (root.BotUtil && root.BotUtil.CACHE_V) || Date.now();
      const r = await fetch('data/skins.json?v=' + v);
      if (r.ok) catalog = await r.json();
    } catch (e) { }
    if (!catalog.packs || !catalog.packs.length) {
      catalog = {
        defaultPack: 'official', fallbackPack: 'official', sponsorPack: 'tinny',
        packs: [{
          id: 'official', name: 'ธรรมดา', tier: 'free',
          cardBack: 'assets/card-back.png',
          lifeBack: 'assets/life-card-back.png',
          playmat: 'assets/mat-b.png',
          playmatOpp: 'assets/mat-a.png'
        }]
      };
    }
    if (!catalog.sponsorPack) catalog.sponsorPack = 'tinny';
    applyLocal();
    return catalog;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { load(); });
  else load();

  root.BotSkins = {
    load, apply: applyLocal, applyMatch, exportIds, setPack, setSlot, sponsorIds,
    setLoggedIn(on) { loggedIn = !!on; },
    setOnNeedLogin(fn) { onNeedLogin = fn; },
    openModal, closeModal, selected: readSel, catalog: () => catalog
  };
  applyLocal();
})(typeof self !== 'undefined' ? self : this);
