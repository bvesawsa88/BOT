#!/usr/bin/env node
/**
 * ดึงเด็คสาธารณะจาก https://bottcg.com/decks/public → data/public-decks.json
 * ให้บอท (โหมดผจญภัย / เล่นกับบอท) ใช้เด็คที่ผู้เล่นจัดและเล่นจริง
 *
 * คัดเฉพาะเด็คที่:
 *   - เว็บระบุ isValid และไม่มี violations
 *   - การ์ดทุกใบมีใน data/cards.json · Main 50 / LIFE 5 พอดี
 *   - ผ่านกติกาเดียวกับ deck builder (Only #1, ลิมิตต่อชื่อ, banlist, ไม่มี PR)
 *   - การ์ด ≥ 94% เป็นใบที่เอนจินมีออโต้หรือไม่มีเอฟเฟกต์ (บอทเล่นได้จริง)
 *
 * ใช้: node tools/sync-public-decks.js [--likes 500] [--views 300]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BoT = require('../js/engine.js');
global.BoTEngine = BoT;
const C = require('../js/campaign.js');

const API = 'https://bottcg.com/api/decks/public';
const UA = 'BoT-Talingchan-DeckSync/1.0 (+https://bot-5uph.onrender.com)';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const N_LIKES = arg('likes', 500), N_VIEWS = arg('views', 300);
const MIN_PLAYABLE = 0.94;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(sort, offset, limit) {
  const q = new URLSearchParams({ sort, limit: String(limit), offset: String(offset), includeCards: 'true' });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${API}?${q}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.success) throw new Error('success=false');
      return j.decks || [];
    } catch (e) {
      console.warn(`  ${sort}@${offset} ล้มเหลว (${e.message}) — ลองใหม่`);
      await sleep(1500 * (attempt + 1));
    }
  }
  return [];
}
async function fetchTop(sort, n) {
  const out = [];
  for (let off = 0; off < n; off += 100) {
    const got = await page(sort, off, Math.min(100, n - off));
    out.push(...got);
    console.log(`  ${sort}: ${out.length}/${n}`);
    if (got.length < Math.min(100, n - off)) break;
    await sleep(600); // สุภาพกับเซิร์ฟเวอร์
  }
  return out;
}

(async () => {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
  const ban = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/banlist.json'), 'utf8'));
  BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/effects-all.json'), 'utf8')));
  BoT.mergeEffects(cards.map(c => ({ code: c.code, name: c.name })));
  const fxC = {};
  const effectOf = (code, name) => (code in fxC ? fxC[code] : (fxC[code] = BoT.effectOf(code, name)));
  const rules = C.makeRules(cards, ban);
  const byCode = {};
  cards.forEach(c => { if (!byCode[c.code] || c.image === c.code + '.png') byCode[c.code] = c; });

  console.log('ดึงเด็คสาธารณะจาก bottcg.com …');
  const raw = [...await fetchTop('likes', N_LIKES), ...await fetchTop('views', N_VIEWS)];
  const seen = new Set();
  const stat = { fetched: raw.length, dup: 0, invalidSite: 0, missing: 0, size: 0, rules: 0, unplayable: 0, kept: 0 };
  const missingCodes = {};
  const out = [];
  for (const d of raw) {
    if (seen.has(d.uuid)) { stat.dup++; continue; }
    seen.add(d.uuid);
    if (!d.isValid || (d.violations && d.violations.length)) { stat.invalidSite++; continue; }
    const main = {}, life = {};
    let miss = false;
    (d.cards || []).forEach(x => {
      if (!byCode[x.print]) { miss = true; missingCodes[x.print] = 1; return; }
      main[x.print] = (main[x.print] || 0) + (+x.quantity || 0);
    });
    (d.lifeCards || []).forEach(x => {
      if (!byCode[x.print]) { miss = true; missingCodes[x.print] = 1; return; }
      life[x.print] = (life[x.print] || 0) + (+x.quantity || 1);
    });
    if (miss) { stat.missing++; continue; }
    const deck = { main, life };
    const errs = C.validateDeck(deck, cards, rules);
    if (errs.some(e => /^main=|^life=/.test(e))) { stat.size++; continue; }
    // PR = ห้ามในโหมดแข่งเท่านั้น (deck builder เตือนแต่ไม่บล็อก) → ให้บอทใช้ได้
    if (errs.some(e => !/^PR /.test(e))) { stat.rules++; continue; }
    let tot = 0, ok = 0;
    Object.entries(main).forEach(([k, n]) => { tot += n; const c = byCode[k]; if (C.playable(c.rarity === 'PR' ? Object.assign({}, c, { rarity: 'C' }) : c, effectOf)) ok += n; });
    const playRate = ok / tot;
    if (playRate < MIN_PLAYABLE) { stat.unplayable++; continue; }
    const prof = C.deckProfile(deck, byCode, rules);
    out.push({
      id: d.uuid,
      name: String(d.name || 'เด็คชุมชน').slice(0, 60),
      by: String((d.user && d.user.name) || '').slice(0, 40),
      likes: +d.likesCount || 0,
      views: +d.viewsCount || 0,
      cover: d.coverCardPrint && byCode[d.coverCardPrint] ? d.coverCardPrint : (prof.ace || ''),
      colors: prof.colors,
      tribe: prof.tribe,
      avgCost: prof.avgCost,
      play: Math.round(playRate * 100),
      main, life,
    });
  }
  stat.kept = out.length;
  out.sort((a, b) => b.likes - a.likes || b.views - a.views);
  const file = path.join(ROOT, 'data/public-decks.json');
  fs.writeFileSync(file, JSON.stringify({
    source: 'https://bottcg.com/decks/public',
    syncedAt: new Date().toISOString(),
    count: out.length,
    decks: out,
  }));
  console.log('สรุป:', JSON.stringify(stat));
  const mc = Object.keys(missingCodes);
  if (mc.length) console.log(`รหัสการ์ดที่ไม่มีใน cards.json (${mc.length}):`, mc.slice(0, 30).join(' '), mc.length > 30 ? '…' : '');
  console.log(`บันทึก ${out.length} เด็ค → ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
})().catch(e => { console.error(e); process.exit(1); });
