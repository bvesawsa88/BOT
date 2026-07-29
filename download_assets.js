const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://bot.premiumhubth.com';

const filesToDownload = [
  'index.html',
  'css/style.css',
  'css/tools.css',
  'css/howto.css',
  'js/util.js',
  'js/carddb.js',
  'js/engine.js',
  'js/game.js',
  'js/deck-builder.js',
  'js/gallery.js',
  'manifest.json',
  'sw.js',
  'data/cards.json',
  'data/banlist.json',
  'data/sd01.json',
  'data/effects-all.json',
  'data/starters.json',
  'data/effects-sd01.json',
  'data/effects-sd02.json',
  'data/effects-sd03.json',
  'data/effects-sd04.json',
  'data/effects-sd05.json',
  'data/effects-sd06.json',
  'data/effects-sd07.json',
  'data/effects-sd08.json',
  'data/effects-kd01.json',
  'data/effects-kd02.json',
  'data/effects-kd03.json',
  'data/effects-kd04.json',
  'data/effects-bt01.json',
  'data/effects-bt02.json',
  'data/effects-bt03.json',
  'data/effects-bt04.json',
  'data/effects-bt05.json',
  'data/effects-bt06.json',
  'data/effects-bt07.json',
  'data/effects-bt08.json',
  'data/effects-bt09.json',
  'data/effects-bt10.json',
  'data/effects-bt11.json',
  'assets/mat-a.png',
  'assets/mat-b.png',
  'assets/card-back.png',
  'assets/life-card-back.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/bottcg/logo_full_white.png'
];

async function downloadFile(relPath) {
  const targetPath = path.join(__dirname, relPath);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const url = `${BASE_URL}/${relPath}`;
  console.log(`Downloading ${url} -> ${targetPath}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed ${url}: ${res.status} ${res.statusText}`);
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);
    console.log(`Saved ${targetPath} (${buffer.length} bytes)`);
  } catch (err) {
    console.error(`Error downloading ${url}:`, err.message);
  }
}

async function main() {
  for (const file of filesToDownload) {
    await downloadFile(file);
  }
  console.log('Download complete!');
}

main();
