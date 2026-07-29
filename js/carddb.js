/* BoT — ฐานข้อมูลการ์ดกลาง (data/cards.json + banlist) · แชร์ให้ game / deck builder / gallery */
(function (root) {
  'use strict';
  // ★ เปิดทุกชุดแล้ว (32 ซีรีส์ · 1,646 ใบ) — โหมดแมนนวล 100% ไม่ต้องรอแปลงเอฟเฟกต์
  // ถ้าจะจำกัดชุดอีกครั้ง ใส่รายชื่อซีรีส์ลงใน Set นี้ (Set ว่าง = เปิดหมด)
  const ALLOWED_SERIES = new Set();
  root.ALLOWED_SERIES = ALLOWED_SERIES;
  const seriesOK = c => !ALLOWED_SERIES.size || ALLOWED_SERIES.has(c.series);

  root.CardDB = (function () {
    let cache = null, pending = null;
    function load() {
      if (cache) return Promise.resolve(cache);
      if (pending) return pending;
      pending = Promise.all([
        fetch('data/cards.json').then(r => { if (!r.ok) throw 0; return r.json(); })
          .catch(() => fetch('data/sd01.json').then(r => r.json())),
        fetch('data/banlist.json').then(r => r.json()).catch(() => ({})),
      ]).then(([all, ban]) => {
        const byCode = {};
        all.forEach(c => { if (!byCode[c.code] || c.image === c.code + '.png') byCode[c.code] = c; });
        // cards = พูลที่เลือกได้/แสดง (เฉพาะชุดที่เปิด) · byCode = ครบทุกใบ (ให้ engine หาโค้ดได้)
        const cards = Object.values(byCode).filter(seriesOK).sort((a, b) => a.code < b.code ? -1 : 1);
        cache = {
          all, cards, byCode,
          ban: {
            banned: ban.banned || [], limit1: ban.limit1 || [],
            limit2: ban.limit2 || [], chooseOne: ban.chooseOne || []
          }
        };
        return cache;
      });
      return pending;
    }
    function limitOf(db, c) {
      let lim = 4;
      if (c.customLimit) {
        const m = String(c.customLimit).match(/\d+/);
        if (m) lim = +m[0];
        else if (/only/i.test(c.customLimit)) lim = 1;
      }
      if (/Only\s*#?\s*1/i.test(c.ex || '')) lim = 1;
      if (db.ban.banned.includes(c.name)) return 0;
      if (db.ban.limit1.includes(c.name)) lim = Math.min(lim, 1);
      if (db.ban.limit2.includes(c.name)) lim = Math.min(lim, 2);
      return lim;
    }
    function savedDecks() {
      try { return JSON.parse(localStorage.getItem('bot_decks_v1') || '{}'); }
      catch (e) { return {}; }
    }
    function saveDecks(sv) {
      try { localStorage.setItem('bot_decks_v1', JSON.stringify(sv)); }
      catch (e) { }
    }
    return { load, limitOf, savedDecks, saveDecks };
  })();
})(typeof self !== 'undefined' ? self : this);
