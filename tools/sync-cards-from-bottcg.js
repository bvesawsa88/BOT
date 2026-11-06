#!/usr/bin/env node
/**
 * Sync data/cards.json (+ data/sd01.json) from https://bottcg.com/cards
 * Card DB is fetched from bottcg CDN JSON (or Next.js chunk fallback); rarity SCR is stored as SEC (same as site badge).
 *
 * node tools/sync-cards-from-bottcg.js                ซิงก์ทั้งฐาน (ทับค่าที่แก้มือจากรูปการ์ด)
 * node tools/sync-cards-from-bottcg.js --series BT12  เพิ่ม/อัปเดตเฉพาะชุดนั้น ไม่แตะการ์ดชุดอื่น
 * node tools/sync-cards-from-bottcg.js --new-only     เพิ่มเฉพาะการ์ดที่ยังไม่มี ไม่แตะการ์ดเดิม
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'cards.json');
const SD01 = path.join(ROOT, 'data', 'sd01.json');
const BASE = 'https://bottcg.com';
const CDN = 'https://cdn.bangbon.app/cards';

function extractCardsFromChunk(js) {
  const marker = 'let r=[{name:';
  const start = js.indexOf(marker);
  if (start < 0) throw new Error('card array not found in chunk');
  let i = start + 'let r='.length;
  let depth = 0;
  let inStr = false;
  let quote = null;
  let esc = false;
  for (; i < js.length; i++) {
    const ch = js[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) { inStr = false; quote = null; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; quote = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const lit = js.slice(start + 'let r='.length, i + 1);
        return Function('"use strict"; return (' + lit + ')')();
      }
    }
  }
  throw new Error('card array end not found');
}

function emptyToBlank(v) {
  return v == null ? '' : v;
}

function toLocalCard(c, prefixMap = {}) {
  const rare = c.rare || '';
  const rarity = rare === 'SCR' ? 'SEC' : rare;
  const code = c.print;
  const isAltImg = ['SCR', 'PR', 'CBR'].includes(rare);
  const image = isAltImg ? `${code}-${rare}.png` : `${code}.png`;
  const uid = `${code}__${rare || 'X'}`;
  const series = (code || '').split('-')[0] || '';

  let cost = emptyToBlank(c.cost);
  let gem = emptyToBlank(c.gem);
  let power = emptyToBlank(c.power);

  // bottcg: Magic printed cost lives in `cost`
  // local engine/UI: Magic uses empty cost + gem = printed cost (gem = value for payment math / display)
  if (c.type === 'Magic') {
    if ((gem === '' || gem == null) && cost !== '' && cost != null) {
      gem = cost;
      cost = '';
    }
  }
  if (c.type === 'Life') {
    cost = '';
    gem = '';
    power = '';
  }

  let imageUrl = `${CDN}/${image}`;
  const cdnSubdir = prefixMap[series];
  if (cdnSubdir) {
    const cleanSubdir = String(cdnSubdir).replace(/^\/+|\/+$/g, '');
    imageUrl = `https://cdn.bottcg.com/cards/${cleanSubdir}/${image}`;
  }

  return {
    uid,
    code,
    name: c.name || '',
    type: c.type || '',
    subtype: c.subtype || '',
    rarity,
    color: c.color || '',
    symbol: c.symbol || '',
    cost,
    gem,
    gemColor: c.gemColor || '',
    power,
    soi: emptyToBlank(c.soi),
    ex: c.ex || '',
    effect: (c.mainEffect || '').replace(/\r\n/g, '\n'),
    favorText: c.favorText || '',
    dropRate: c.dropRate || '',
    customLimit: c.customLimit || '',
    creator: c.creator || '',
    series,
    image,
    imageUrl,
  };
}

/* แทนการ์ดของชุดนี้ด้วยข้อมูลใหม่ · ชุดใหม่แทรกต่อจาก BT ล่าสุด (เรียงแบบเดียวกับเว็บ) */
function mergeSeries(prev, fresh, series) {
  const kept = prev.filter(c => c.series !== series);
  const firstOld = prev.findIndex(c => c.series === series);
  let at = firstOld;
  if (at < 0) {
    at = kept.length;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (/^BT[0-9]+$/.test(kept[i].series)) { at = i + 1; break; }
    }
  }
  return kept.slice(0, at).concat(fresh, kept.slice(at));
}

async function discoverCardDbInfo(html) {
  const scripts = [...new Set([...html.matchAll(/\/_next\/static\/(?:immutable\/)?chunks\/[^"'?]+\.js/g)].map(m => m[0]))];
  let cardDbUrl = null;
  let prefixMap = { SD09: '123v1k1', RM01: '0aslabe', BT12: 'thankyoupnes' };
  let fallbackChunkJs = null;

  for (const s of scripts) {
    const url = BASE + s;
    try {
      const js = await (await fetch(url)).text();
      const dbMatch = js.match(/["']CARD_DB_URL["'],\s*\d*,\s*["']([^"']+)["']/);
      if (dbMatch) {
        cardDbUrl = dbMatch[1];
      }
      const mapMatch = js.match(/n\s*=\s*(\{([A-Z0-9]+:\s*"[^"]+",?)+\})/);
      if (mapMatch) {
        try {
          const parsed = Function('"use strict"; return (' + mapMatch[1] + ')')();
          prefixMap = Object.assign({}, prefixMap, parsed);
        } catch (e) {}
      }
      if ((js.includes('let r=[{name:') || js.includes('let r=[{')) && js.includes('print:"SD01-001"')) {
        fallbackChunkJs = js;
      }
    } catch (e) {}
  }

  return { cardDbUrl, prefixMap, fallbackChunkJs };
}

async function main() {
  console.log('Fetching', BASE + '/cards');
  const html = await (await fetch(BASE + '/cards')).text();
  const { cardDbUrl, prefixMap, fallbackChunkJs } = await discoverCardDbInfo(html);
  console.log('Prefix map:', prefixMap);

  let raw = null;
  if (cardDbUrl) {
    console.log('Fetching card DB from JSON endpoint:', cardDbUrl);
    raw = await (await fetch(cardDbUrl)).json();
  } else if (fallbackChunkJs) {
    console.log('Extracting card DB from fallback chunk...');
    raw = extractCardsFromChunk(fallbackChunkJs);
  } else {
    throw new Error('Could not find bottcg cards data chunk or JSON endpoint');
  }

  const argSeries = process.argv.indexOf('--series');
  const onlySeries = argSeries >= 0 ? String(process.argv[argSeries + 1] || '').toUpperCase() : '';
  let cards = raw.map(c => toLocalCard(c, prefixMap));
  console.log('Cards fetched:', cards.length);

  const rar = {};
  cards.forEach(c => { rar[c.rarity] = (rar[c.rarity] || 0) + 1; });
  console.log('Rarities:', rar);

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  if (process.argv.includes('--new-only')) {
    const have = new Set(prev.map(c => c.uid));
    const fresh = cards.filter(c => !have.has(c.uid));
    cards = fresh.reduce((list, c) => {
      let at = list.length;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].series === c.series) { at = i + 1; break; }
      }
      return list.slice(0, at).concat([c], list.slice(at));
    }, prev.slice());
    console.log('New cards:', fresh.map(c => c.uid).join(', ') || 'none');
  } else if (onlySeries) {
    const fresh = cards.filter(c => c.series === onlySeries);
    if (!fresh.length) throw new Error('ไม่พบการ์ดชุด ' + onlySeries);
    cards = mergeSeries(prev, fresh, onlySeries);
    console.log('Merged series', onlySeries, ':', fresh.length);
  }
  const prevMap = new Map(prev.map(c => [c.uid, c]));
  const prevByName = new Map();
  for (const p of prev) {
    if (p.name && !prevByName.has(p.name)) {
      prevByName.set(p.name, p);
    }
  }

  let added = 0, removed = 0, changed = 0;
  const nextMap = new Map(cards.map(c => [c.uid, c]));

  // 1. คง gemColor จากการ์ดเดิม (ตาม uid) หรือ inherit จากการ์ดชื่อเดียวกันใน DB (เช่น รีปริ้นท์ชุด RM01)
  // 2. คง Only #1 ที่เช็คจากรูปแล้ว ถ้า bottcg ตกหล่นบนรีปริ้น
  for (const c of cards) {
    const p = prevMap.get(c.uid);
    if (p && p.gemColor && !c.gemColor) {
      c.gemColor = p.gemColor;
    }
    if (!c.gemColor && prevByName.has(c.name)) {
      const match = prevByName.get(c.name);
      if (match.gemColor) {
        c.gemColor = match.gemColor;
      }
    }
    if (p && /Only\s*#?\s*1/i.test(p.ex || '') && !/Only\s*#?\s*1/i.test(c.ex || '')) {
      c.ex = p.ex;
    }
    if (!/Only\s*#?\s*1/i.test(c.ex || '') && prevByName.has(c.name)) {
      const match = prevByName.get(c.name);
      if (/Only\s*#?\s*1/i.test(match.ex || '')) {
        c.ex = match.ex;
      }
    }
  }

  for (const c of cards) {
    const p = prevMap.get(c.uid);
    if (!p) added++;
    else if (JSON.stringify(p) !== JSON.stringify(c)) changed++;
  }
  for (const uid of prevMap.keys()) if (!nextMap.has(uid)) removed++;
  console.log({ added, changed, removed, prev: prev.length });

  const sec = cards.filter(c => c.rarity === 'SEC');
  console.log('SEC:', sec.length, '(incl. new:', sec.filter(c => !prevMap.has(c.uid)).map(c => c.uid).join(', ') || 'none', ')');

  const rm01 = cards.filter(c => c.series === 'RM01');
  console.log('RM01 cards:', rm01.length);

  fs.writeFileSync(OUT, JSON.stringify(cards));
  console.log('Wrote', OUT);

  const sd01 = cards.filter(c => c.series === 'SD01');
  fs.writeFileSync(SD01, JSON.stringify(sd01));
  console.log('Wrote', SD01, `(${sd01.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
