const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE_URL = 'https://bottcg.com';
const CDN_URL = 'https://cdn.bangbon.app/assets/bottcg';

// Keyword icons จากเว็บทางการ
const keywords = [
  'rebirth', 'lastwill', 'worship', 'spy', 'earthquake', 'discrimination',
  'unity', 'humanshield', 'kick', 'onceperturn', 'continuous', 'command',
  'auto', 'exact', 'guts', 'backstab', 'exile', 'link'
];

// Symbol / Subtype icons จากเว็บทางการ
const symbols = [
  'deity', 'giant', 'wizard', 'human', 'insect', 'animal', 'rattatuy',
  'hell', 'ghost', 'fish', 'robot', 'construct', 'foreign', 'tree',
  'pret', 'rishi', 'alien', 'kapom', 'beast', 'soldier', 'cyber',
  'dragon', 'magic', 'react', 'mod', 'land'
];

const generalAssets = [
  'logo_full_white.png'
];

async function downloadFile(url, targetPath) {
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  [FAIL] ${url} -> ${res.status} ${res.statusText}`);
      return false;
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.error(`  [SKIP] ${url} returned HTML instead of asset.`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);
    console.log(`  [OK] Saved ${path.relative(__dirname, targetPath)} (${buffer.length} bytes)`);
    return true;
  } catch (err) {
    console.error(`  [ERROR] downloading ${url}:`, err.message);
    return false;
  }
}

async function main() {
  console.log(`=== Battle of Talingchan Asset & Card Sync ===`);
  console.log(`Source: ${BASE_URL} / ${CDN_URL}\n`);

  // 1. Sync ข้อมูลการ์ดทั้งหมดจาก bottcg.com
  console.log('1. Syncing card database from https://bottcg.com/cards ...');
  const syncScript = path.join(__dirname, 'tools', 'sync-cards-from-bottcg.js');
  const sync = spawnSync(process.execPath, [syncScript], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  if (sync.status !== 0) {
    console.error('Card sync failed with exit code', sync.status);
  } else {
    console.log('Card database synced successfully.\n');
  }

  // 2. ดาวน์โหลด Official Assets (Logo, Keywords, Symbols)
  console.log('2. Downloading official icons and assets to assets/bottcg ...');
  let downloadedCount = 0;

  for (const asset of generalAssets) {
    const url = `${CDN_URL}/${asset}`;
    const target = path.join(__dirname, 'assets', 'bottcg', asset);
    if (await downloadFile(url, target)) downloadedCount++;
  }

  for (const kw of keywords) {
    const url = `${CDN_URL}/keywords/${kw}.png`;
    const target = path.join(__dirname, 'assets', 'bottcg', 'keywords', `${kw}.png`);
    if (await downloadFile(url, target)) downloadedCount++;
  }

  for (const sym of symbols) {
    const url = `${CDN_URL}/symbol/${sym}.png`;
    const target = path.join(__dirname, 'assets', 'bottcg', 'symbol', `${sym}.png`);
    if (await downloadFile(url, target)) downloadedCount++;
  }

  console.log(`\nCompleted! Successfully synced & downloaded ${downloadedCount} assets.`);
}

main();
