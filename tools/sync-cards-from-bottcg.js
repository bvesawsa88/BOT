#!/usr/bin/env node
/**
 * Sync data/cards.json (+ data/sd01.json) from https://bottcg.com/cards
 * Card DB is embedded in a Next.js chunk; rarity SCR is stored as SEC (same as site badge).
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

function toLocalCard(c) {
  const rare = c.rare || '';
  const rarity = rare === 'SCR' ? 'SEC' : rare;
  const code = c.print;
  const isAltImg = ['SCR', 'PR', 'CBR'].includes(rare);
  const image = isAltImg ? `${code}-${rare}.png` : `${code}.png`;
  const uid = `${code}__${rare || 'X'}`;

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
    series: (code || '').split('-')[0] || '',
    image,
    imageUrl: (code || '').startsWith('SD09-') ? `https://cdn.bottcg.com/cards/123v1k1/${image}` : `${CDN}/${image}`,
  };
}

async function findCardsChunkUrl(html) {
  const scripts = [...new Set([...html.matchAll(/\/_next\/static\/(?:immutable\/)?chunks\/[^"'?]+\.js/g)].map(m => m[0]))];
  for (const s of scripts) {
    const url = BASE + s;
    const js = await (await fetch(url)).text();
    if ((js.includes('let r=[{name:') || js.includes('let r=[{')) && js.includes('print:"SD01-001"')) {
      return { url, js };
    }
  }
  throw new Error('Could not find bottcg cards data chunk');
}

async function main() {
  console.log('Fetching', BASE + '/cards');
  const html = await (await fetch(BASE + '/cards')).text();
  const { url, js } = await findCardsChunkUrl(html);
  console.log('Data chunk:', url, `(${js.length} bytes)`);

  const raw = extractCardsFromChunk(js);
  const cards = raw.map(toLocalCard);
  console.log('Cards:', cards.length);

  const rar = {};
  cards.forEach(c => { rar[c.rarity] = (rar[c.rarity] || 0) + 1; });
  console.log('Rarities:', rar);

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const prevMap = new Map(prev.map(c => [c.uid, c]));
  let added = 0, removed = 0, changed = 0;
  const nextMap = new Map(cards.map(c => [c.uid, c]));
  // คง gemColor ที่เติมเองไว้ ถ้า bottcg ยังว่าง (สีเพชรบนการ์ดยังไม่ครบใน DB)
  // คง Only #1 ที่เช็คจากรูปแล้ว ถ้า bottcg ตกหล่นบนรีปริ้น
  for (const c of cards) {
    const p = prevMap.get(c.uid);
    if (p && p.gemColor && !c.gemColor) c.gemColor = p.gemColor;
    if (p && /Only\s*#?\s*1/i.test(p.ex || '') && !/Only\s*#?\s*1/i.test(c.ex || '')) c.ex = p.ex;
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

  fs.writeFileSync(OUT, JSON.stringify(cards));
  console.log('Wrote', OUT);

  const sd01 = cards.filter(c => c.series === 'SD01');
  fs.writeFileSync(SD01, JSON.stringify(sd01));
  console.log('Wrote', SD01, `(${sd01.length})`);
}

main().catch(e => { console.error(e); process.exit(1); });
