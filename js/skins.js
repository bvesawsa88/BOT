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
        id: 'cardboard', name: 'กระดาษลัง', label: 'เพลย์แมทกระดาษลังวาดมือ', tier: 'free',
        playmatOnly: true,
        cardBack: 'assets/card-back.png',
        lifeBack: 'assets/life-card-back.png',
        playmat: 'assets/skins/cardboard/playmat.png'
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
  let customAllowed = false;
  let onNeedLogin = null;
  let fileSlot = null;
  let pulling = false;
  let pullGen = 0;
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
  function isOpenPack(p) {
    if (!p) return false;
    if (p.tier === 'shop' || p.tier === 'sponsor') return false;
    if (p.id === sponsorPackId()) return false;
    return true;
  }
  function playerPacks() {
    return packs().filter(p => isOpenPack(p) && !p.playmatOnly);
  }
  function playmatChoices() {
    return packs().filter(p => isOpenPack(p) && p.playmat);
  }
  function isPlayerSlot(id) {
    if (id === 'custom') return true;
    return isOpenPack(packById(id));
  }
  function clampSlot(id, slot) {
    const s = String(id || '');
    if (!isPlayerSlot(s)) return officialId();
    const p = packById(s);
    if (p && p.playmatOnly && slot && slot !== 'playmat') return officialId();
    return s;
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
          cardBack: clampSlot(raw.cardBack || d.cardBack, 'cardBack'),
          lifeBack: clampSlot(raw.lifeBack || d.lifeBack, 'lifeBack'),
          playmat: clampSlot(raw.playmat || d.playmat, 'playmat')
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
  function authToken() {
    try { return localStorage.getItem('bot_auth_token') || ''; }
    catch (e) { return ''; }
  }
  function isDefaultSel(sel) {
    const id = officialId();
    return sel.cardBack === id && sel.lifeBack === id && sel.playmat === id;
  }
  function writeSel(sel) {
    try { localStorage.setItem(KEY, JSON.stringify(sel)); } catch (e) { }
  }
  function persistSel(sel) {
    writeSel(sel);
    pushSel();
  }
  function pushSel() {
    const t = authToken();
    if (!t || pulling) return;
    fetch('/auth/skins', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ sel: readSel() })
    }).catch(() => { });
  }
  function readCustom() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeCustom(obj) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(obj)); } catch (e) { }
  }
  function publicCustom() {
    const c = readCustom();
    const out = {};
    SLOTS.forEach(slot => {
      const u = c[slot];
      if (u && !/^data:/i.test(u)) out[slot] = u;
    });
    return out;
  }
  function resolveSlot(slot, sel, allowCustom, extraCustom) {
    if (sel[slot] === 'custom') {
      if (extraCustom && extraCustom[slot]) return extraCustom[slot];
      if (allowCustom !== false) {
        const u = readCustom()[slot];
        if (u) return u;
      }
      const fb = fallbackPack();
      return fb ? fb[slot] : '';
    }
    return slotUrl(slot, sel[slot], false);
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
    const a = sel.cardBack, b = sel.lifeBack;
    if (a === b) return a;
    return '';
  }
  function setSideVars(side, sel, allowCustom, extraCustom) {
    const root = document.documentElement;
    const suf = side === 'opp' ? '-opp' : '-my';
    root.style.setProperty('--skin-card-back' + suf, cssUrl(resolveSlot('cardBack', sel, allowCustom, extraCustom)));
    root.style.setProperty('--skin-life-back' + suf, cssUrl(resolveSlot('lifeBack', sel, allowCustom, extraCustom)));
    const mat = resolveSlot('playmat', sel, allowCustom, extraCustom);
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
      }, false, oppSel.custom || null);
    } else {
      setSideVars('opp', mine, true);
    }
    syncMounts();
  }
  function exportIds() {
    const sel = readSel();
    const oid = catalog.fallbackPack || 'official';
    const pub = publicCustom();
    const out = {
      cardBack: sel.cardBack === 'custom' && !pub.cardBack ? oid : sel.cardBack,
      lifeBack: sel.lifeBack === 'custom' && !pub.lifeBack ? oid : sel.lifeBack,
      playmat: sel.playmat === 'custom' && !pub.playmat ? oid : sel.playmat
    };
    const used = {};
    SLOTS.forEach(slot => {
      if (out[slot] === 'custom' && pub[slot]) used[slot] = pub[slot];
    });
    if (Object.keys(used).length) out.custom = used;
    return out;
  }
  function applyCustomPack() {
    const c = readCustom();
    const sel = readSel();
    persistSel({
      cardBack: c.cardBack ? 'custom' : sel.cardBack,
      lifeBack: c.lifeBack ? 'custom' : sel.lifeBack,
      playmat: sel.playmat
    });
    applyLocal();
  }
  function setPack(id) {
    if (id === 'custom') {
      if (!loggedIn) {
        if (typeof onNeedLogin === 'function') onNeedLogin();
        return;
      }
      if (hasAnyCustom()) applyCustomPack();
      openModal();
      return;
    }
    const p = packById(id);
    if (!p || p.playmatOnly || !isOpenPack(p)) return;
    const sel = readSel();
    persistSel({ cardBack: id, lifeBack: id, playmat: sel.playmat });
    applyLocal();
  }
  function setSlot(slot, id) {
    if (!SLOTS.includes(slot) || !isPlayerSlot(id)) return;
    const p = packById(id);
    if (p && p.playmatOnly && slot !== 'playmat') return;
    const sel = readSel();
    sel[slot] = id;
    persistSel(sel);
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
  async function uploadSlot(slot, dataUrl) {
    const t = authToken();
    if (!t) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    const r = await fetch('/auth/skins/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: JSON.stringify({ slot, data: dataUrl })
    });
    let j = {};
    try { j = await r.json(); } catch (e) { }
    if (!r.ok || !j.ok) throw new Error((j && j.error) || 'อัปโหลดไม่สำเร็จ');
    const custom = Object.assign({}, readCustom(), j.custom || {});
    if (j.url) custom[slot] = j.url;
    writeCustom(custom);
    if (j.sel) writeSel(j.sel);
    else {
      const sel = readSel();
      sel[slot] = 'custom';
      writeSel(sel);
    }
    applyLocal();
    return j;
  }
  async function importSlot(slot, file) {
    const size = SLOT_SIZE[slot] || [510, 717];
    const data = await resizeImage(file, size[0], size[1]);
    await uploadSlot(slot, data);
  }
  function activateCustomSlot(slot) {
    if (!loggedIn) {
      if (typeof onNeedLogin === 'function') onNeedLogin();
      return;
    }
    if (!customAllowed) {
      alert('☕ ฟังก์ชันคัสตอมสนามและการ์ดเปิดให้เฉพาะผู้สนับสนุน (เลี้ยงกาแฟ)\nกรุณาติดต่อแอดมินหรือเลี้ยงกาแฟเพื่อปลดล็อกสิทธิ์');
      return;
    }
    if (readCustom()[slot]) setSlot(slot, 'custom');
    else startImport(slot);
  }
  function startImport(slot) {
    if (!loggedIn) {
      if (typeof onNeedLogin === 'function') onNeedLogin();
      return;
    }
    if (!customAllowed) {
      alert('☕ ฟังก์ชันคัสตอมสนามและการ์ดเปิดให้เฉพาะผู้สนับสนุน (เลี้ยงกาแฟ)\nกรุณาติดต่อแอดมินหรือเลี้ยงกาแฟเพื่อปลดล็อกสิทธิ์');
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
    const customOn = packMatch(sel) === 'custom' ? ' on' : '';
    const customHint = !loggedIn ? 'ล็อกอินก่อน' : (!customAllowed ? '🔒 ปลดล็อกด้วยการเลี้ยงกาแฟ' : (hasAnyCustom() ? 'แตะเพื่อแก้รูป' : 'แตะเพื่อนำเข้า'));
    const customMatSrc = thumbFor('playmat', 'custom');
    const matBtns = playmatChoices().map(p =>
      `<button type="button" class="skin-pack-btn skin-pack-mat${sel.playmat === p.id ? ' on' : ''}" data-skin-slot="playmat" data-skin-id="${p.id}">
        <img src="${p.playmat}" alt="">
        <span>${p.name}</span>
      </button>`
    ).join('');
    return `<div class="skin-setup">
      <div class="menu-deck-lab">สกินโต๊ะ</div>
      <div class="skin-pack-row">
        ${btns}
        <button type="button" class="skin-pack-btn${customOn}" data-skin-pack="custom">
          <img src="${customSrc}" alt="">
          <span>Custom</span>
          <span class="skin-soon">${customHint}</span>
        </button>
      </div>
      <div class="menu-deck-lab">สนาม</div>
      <div class="skin-pack-row">
        ${matBtns}
        <button type="button" class="skin-pack-btn skin-pack-mat${sel.playmat === 'custom' ? ' on' : ''}" data-skin-custom-mat>
          <img src="${customMatSrc}" alt="">
          <span>Custom</span>
        </button>
      </div>
      <p class="skin-note">ธรรมดา = ชุดทางการ · สนามเลือกได้อิสระจากหลังการ์ด · Custom เซฟตามบัญชีที่ล็อกอิน · บอทใช้สกินสปอนเซอร์เสมอ</p>
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
      const choices = slot === 'playmat' ? playmatChoices() : playerPacks();
      const chips = choices.map(p => {
        const src = slot === 'playmat' ? (p.playmat || p.cardBack) : p[slot];
        const extra = slot === 'playmat' ? ' skin-chip-mat' : '';
        return `<button type="button" class="skin-chip${extra}${sel[slot] === p.id ? ' on' : ''}" data-skin-slot="${slot}" data-skin-id="${p.id}">
          <img src="${src}" alt="">
          <span>${p.name}</span>
        </button>`;
      }).join('');
      const hasC = !!readCustom()[slot];
      const customOn = sel[slot] === 'custom' ? ' on' : '';
      const customSrc = thumbFor(slot, 'custom');
      const matCls = slot === 'playmat' ? ' skin-chip-mat' : '';
      const customChip = hasC
        ? `<button type="button" class="skin-chip${matCls}${customOn}" data-skin-slot="${slot}" data-skin-id="custom">
            <img src="${customSrc}" alt="">
            <span>Custom</span>
          </button>`
        : '';
      return `<div class="skin-slot">
        <div class="skin-slot-h">${SLOT_LABEL[slot]}</div>
        <div class="skin-slot-row">
          ${chips}
          ${customChip}
          <button type="button" class="skin-chip${matCls}" data-skin-import="${slot}">
            <img src="${customSrc}" alt="">
            <span>${hasC ? 'เปลี่ยนรูป' : 'นำเข้า'}</span>
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
      setPack(id);
      return;
    }
    if (e.target.closest('[data-skin-customize]')) { openModal(); return; }
    const customMat = e.target.closest('[data-skin-custom-mat]');
    if (customMat) {
      activateCustomSlot('playmat');
      return;
    }
    const chip = e.target.closest('[data-skin-slot][data-skin-id]');
    if (chip) {
      const id = chip.getAttribute('data-skin-id');
      if (id === 'custom' && !loggedIn) {
        if (typeof onNeedLogin === 'function') onNeedLogin();
        return;
      }
      setSlot(chip.getAttribute('data-skin-slot'), id);
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

  async function pull() {
    const t = authToken();
    if (!t) return;
    const gen = ++pullGen;
    pulling = true;
    const localSel = readSel();
    const localCustom = readCustom();
    try {
      const r = await fetch('/auth/skins', { headers: { Authorization: 'Bearer ' + t } });
      const j = await r.json();
      if (gen !== pullGen || !authToken()) return;
      if (!j.ok) return;
      customAllowed = !!(j.customAllowed || j.isSupporter);
      const remoteCustom = (j.custom && typeof j.custom === 'object') ? j.custom : {};
      const remoteSel = j.sel && typeof j.sel === 'object' ? {
        cardBack: clampSlot(j.sel.cardBack, 'cardBack'),
        lifeBack: clampSlot(j.sel.lifeBack, 'lifeBack'),
        playmat: clampSlot(j.sel.playmat, 'playmat')
      } : defaultSel();
      writeCustom(remoteCustom);
      if (!isDefaultSel(remoteSel)) writeSel(remoteSel);
      else if (!isDefaultSel(localSel)) writeSel(localSel);
      else writeSel(remoteSel);
      for (let i = 0; i < SLOTS.length; i++) {
        const slot = SLOTS[i];
        const u = localCustom[slot];
        if (u && /^data:/i.test(u) && !remoteCustom[slot]) {
          try { await uploadSlot(slot, u); } catch (e) { }
          if (gen !== pullGen || !authToken()) return;
        }
      }
      applyLocal();
      const needPush = isDefaultSel(remoteSel) && !isDefaultSel(readSel());
      pulling = false;
      if (needPush) pushSel();
    } catch (e) { }
    finally { if (gen === pullGen) pulling = false; }
  }
  function clearAccount() {
    pullGen++;
    pulling = false;
    customAllowed = false;
    writeCustom({});
    const sel = readSel();
    const oid = officialId();
    let changed = false;
    SLOTS.forEach(slot => {
      if (sel[slot] === 'custom') { sel[slot] = oid; changed = true; }
    });
    if (changed) writeSel(sel);
    applyLocal();
  }

  async function load() {
    try {
      const v = (root.BotUtil && root.BotUtil.CACHE_V) || Date.now();
      let loaded = false;
      try {
        const r = await fetch('/api/skins?v=' + v);
        if (r.ok) { catalog = await r.json(); loaded = !!(catalog && catalog.packs); }
      } catch (e) { }
      if (!loaded) {
        const r = await fetch('data/skins.json?v=' + v);
        if (r.ok) catalog = await r.json();
      }
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
        }, {
          id: 'cardboard', name: 'กระดาษลัง', tier: 'free', playmatOnly: true,
          cardBack: 'assets/card-back.png',
          lifeBack: 'assets/life-card-back.png',
          playmat: 'assets/skins/cardboard/playmat.png'
        }]
      };
    }
    if (!catalog.sponsorPack) catalog.sponsorPack = 'tinny';
    applyLocal();
    if (authToken()) pull();
    return catalog;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { load(); });
  else load();

  root.BotSkins = {
    load, apply: applyLocal, applyMatch, exportIds, setPack, setSlot, sponsorIds, pull,
    setLoggedIn(on) {
      loggedIn = !!on;
      if (loggedIn) pull();
      else clearAccount();
      syncMounts();
    },
    setOnNeedLogin(fn) { onNeedLogin = fn; },
    openModal, closeModal, selected: readSel, catalog: () => catalog
  };
  applyLocal();
})(typeof self !== 'undefined' ? self : this);
