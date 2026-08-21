/* BoT — ฐานข้อมูลการ์ดกลาง (data/cards.json + banlist) · แชร์ให้ game / deck builder / gallery */
(function (root) {
  'use strict';
  // ★ เปิดทุกชุดแล้ว (รวม BT11 · 1,745 ใบ จาก bottcg.com) — โหมดแมนนวล 100% ไม่ต้องรอแปลงเอฟเฟกต์
  // ถ้าจะจำกัดชุดอีกครั้ง ใส่รายชื่อซีรีส์ลงใน Set นี้ (Set ว่าง = เปิดหมด)
  const ALLOWED_SERIES = new Set();
  root.ALLOWED_SERIES = ALLOWED_SERIES;
  const seriesOK = c => !ALLOWED_SERIES.size || ALLOWED_SERIES.has(c.series);

  root.CardDB = (function () {
    let cache = null, pending = null;
    function load() {
      if (cache) return Promise.resolve(cache);
      if (pending) return pending;
      const asset = (root.BotUtil && root.BotUtil.asset) || (p => p);
      pending = Promise.all([
        fetch(asset('data/cards.json')).then(r => { if (!r.ok) throw 0; return r.json(); })
          .catch(() => fetch(asset('data/sd01.json')).then(r => r.json())),
        fetch(asset('data/banlist.json')).then(r => r.json()).catch(() => ({})),
      ]).then(([all, ban]) => {
        const byCode = {};
        const byUid = {};
        const byPrint = {};
        const printsByCode = {};
        all.forEach(c => {
          if (c.uid) byUid[c.uid] = c;
          if (!printsByCode[c.code]) printsByCode[c.code] = [];
          printsByCode[c.code].push(c);
          if (c.rarity) {
            byPrint[`${c.code}-${c.rarity}`] = c;
            byPrint[`${c.code}__${c.rarity}`] = c;
          }
          // เกม/เด็คยึดพิมพ์หลัก (ไม่ใช่ SCR/PR/CBR) เป็นตัวแทนรหัส
          if (!byCode[c.code] || c.image === c.code + '.png') byCode[c.code] = c;
        });
        // cards = รหัสไม่ซ้ำ (จัดเด็ค/เกม) · prints = ทุกความหายากรวม SEC/PR/CBR (แกลเลอรี/เปิดซอง)
        const cards = Object.values(byCode).filter(seriesOK).sort((a, b) => a.code < b.code ? -1 : 1);
        const prints = all.filter(seriesOK).sort((a, b) =>
          a.code < b.code ? -1 : a.code > b.code ? 1 : (a.rarity || '').localeCompare(b.rarity || ''));
        const onlyNames = new Set();
        const customLimitByName = {};
        cards.forEach(c => {
          if (isOnlyPrint(c)) onlyNames.add(c.name);
          if (c.customLimit) {
            const m = String(c.customLimit).match(/\d+/);
            if (m) customLimitByName[c.name] = Math.max(customLimitByName[c.name] || 0, +m[0]);
          }
        });
        function lookup(key) {
          if (!key) return null;
          if (byUid[key]) return byUid[key];
          if (byPrint[key]) return byPrint[key];
          if (byCode[key]) return byCode[key];
          const stripped = String(key).replace(/-[A-Za-z0-9]{1,5}$/, '');
          return byCode[stripped] || null;
        }
        function printsOf(codeOrUid) {
          const c = lookup(codeOrUid);
          if (!c) return [];
          return printsByCode[c.code] || [c];
        }
        cache = {
          all, cards, prints, byCode, byUid, byPrint, printsByCode,
          lookup, printsOf,
          onlyNames, customLimitByName,
          ban: {
            banned: ban.banned || [], limit1: ban.limit1 || [],
            limit2: ban.limit2 || [], chooseOne: ban.chooseOne || []
          }
        };
        return cache;
      });
      return pending;
    }
    /* Only #1 บนพิมพ์นี้ (ยังไม่ดูรีปริ้นชื่อเดียวกัน) */
    function isOnlyPrint(c) {
      if (!c) return false;
      if (/Only\s*#?\s*1/i.test(c.ex || '')) return true;
      if (c.customLimit && /only/i.test(String(c.customLimit)) && !/\d/.test(String(c.customLimit))) return true;
      return false;
    }
    /* Only #1 — ใส่ได้ใบเดียวต่อชื่อ · เด็คมีได้แค่ 1 ชื่อ Only
       ยกเว้น customLimit (เช่น พระไตรปิฎก = 3) ซึ่งทับค่าเริ่มต้น 1
       รีปริ้นชื่อเดียวกันถ้ารหัสใดมี Only ให้ถือว่าชื่อนั้นเป็น Only ทั้งก้อน */
    function isOnly(c) {
      if (!c) return false;
      if (isOnlyPrint(c)) return true;
      return !!(cache && cache.onlyNames && cache.onlyNames.has(c.name));
    }
    function limitOf(db, c) {
      let lim = 4;
      let fromCustom = false;
      const namedCustom = db && db.customLimitByName && db.customLimitByName[c.name];
      if (namedCustom != null) {
        lim = namedCustom;
        fromCustom = true;
      } else if (c.customLimit) {
        const m = String(c.customLimit).match(/\d+/);
        if (m) { lim = +m[0]; fromCustom = true; }
        else if (/only/i.test(c.customLimit)) lim = 1;
      }
      // Only #1 → 1 ใบ เว้นมี customLimit ตัวเลข (กรณีพิเศษใส่ได้ 3 ฯลฯ)
      if (!fromCustom && isOnly(c)) lim = 1;
      if (db.ban.banned.includes(c.name)) return 0;
      if (db.ban.limit1.includes(c.name)) lim = Math.min(lim, 1);
      if (db.ban.limit2.includes(c.name)) lim = Math.min(lim, 2);
      return lim;
    }
    function authToken() {
      try { return localStorage.getItem('bot_auth_token') || ''; }
      catch (e) { return ''; }
    }
    function isLoggedIn() { return !!authToken(); }
    function savedDecks() {
      try { return JSON.parse(localStorage.getItem('bot_decks_v1') || '{}'); }
      catch (e) { return {}; }
    }
    function writeLocalDecks(sv) {
      try { localStorage.setItem('bot_decks_v1', JSON.stringify(sv)); }
      catch (e) { }
    }
    function pushDecks(sv) {
      const t = authToken();
      if (!t) return;
      fetch('/auth/decks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ decks: sv })
      }).catch(() => { });
    }
    function saveDecks(sv) {
      writeLocalDecks(sv);
      pushDecks(sv);
    }
    function pullDecks() {
      const t = authToken();
      if (!t) return Promise.resolve(savedDecks());
      return fetch('/auth/decks', { headers: { Authorization: 'Bearer ' + t } })
        .then(r => r.json())
        .then(j => {
          if (!j.ok) return savedDecks();
          const local = savedDecks();
          const remote = (j.decks && typeof j.decks === 'object') ? j.decks : {};
          const merged = Object.assign({}, remote, local);
          writeLocalDecks(merged);
          try {
            if (JSON.stringify(merged) !== JSON.stringify(remote)) pushDecks(merged);
          } catch (e) { pushDecks(merged); }
          return merged;
        })
        .catch(() => savedDecks());
    }
    return { load, limitOf, isOnly, savedDecks, saveDecks, pullDecks, isLoggedIn };
  })();
})(typeof self !== 'undefined' ? self : this);
