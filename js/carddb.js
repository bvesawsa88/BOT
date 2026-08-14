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
        all.forEach(c => {
          byUid[c.uid] = c;
          // เกม/เด็คใช้รหัสเดียวต่อใบ — ยึดพิมพ์หลัก (ไม่ใช่ SCR/PR/CBR)
          if (!byCode[c.code] || c.image === c.code + '.png') byCode[c.code] = c;
        });
        // cards = รหัสไม่ซ้ำ (จัดเด็ค/เกม) · prints = ทุกความหายากรวม SEC/PR/CBR (แกลเลอรี/เปิดซอง)
        const cards = Object.values(byCode).filter(seriesOK).sort((a, b) => a.code < b.code ? -1 : 1);
        const prints = all.filter(seriesOK).sort((a, b) =>
          a.code < b.code ? -1 : a.code > b.code ? 1 : (a.rarity || '').localeCompare(b.rarity || ''));
        cache = {
          all, cards, prints, byCode, byUid,
          ban: {
            banned: ban.banned || [], limit1: ban.limit1 || [],
            limit2: ban.limit2 || [], chooseOne: ban.chooseOne || []
          }
        };
        return cache;
      });
      return pending;
    }
    /* Only #1 — ใส่ได้ใบเดียวต่อชื่อ · เด็คมีได้แค่ 1 ชื่อ Only
       ยกเว้น customLimit (เช่น พระไตรปิฎก = 3) ซึ่งทับค่าเริ่มต้น 1 */
    function isOnly(c) {
      if (!c) return false;
      if (/Only\s*#?\s*1/i.test(c.ex || '')) return true;
      if (c.customLimit && /only/i.test(String(c.customLimit)) && !/\d/.test(String(c.customLimit))) return true;
      return false;
    }
    function limitOf(db, c) {
      let lim = 4;
      let fromCustom = false;
      if (c.customLimit) {
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
    function savedDecks() {
      try { return JSON.parse(localStorage.getItem('bot_decks_v1') || '{}'); }
      catch (e) { return {}; }
    }
    function saveDecks(sv) {
      try { localStorage.setItem('bot_decks_v1', JSON.stringify(sv)); }
      catch (e) { }
    }
    return { load, limitOf, isOnly, savedDecks, saveDecks };
  })();
})(typeof self !== 'undefined' ? self : this);
