const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function decodePng(buffer) {
  let offset = 8;
  let width, height, bitDepth, colorType;
  let plte = null;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.slice(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idatChunks.push(data);
    else if (type === 'IEND') break;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = colorType === 3 ? 1 : colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * bytesPerPixel;
  const rgba = Buffer.alloc(width * height * 4);
  let srcPos = 0; const prevRow = Buffer.alloc(stride); const currRow = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filterType = decompressed[srcPos++];
    decompressed.copy(currRow, 0, srcPos, srcPos + stride);
    srcPos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bytesPerPixel ? currRow[i - bytesPerPixel] : 0;
      const b = prevRow[i];
      const c = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0;
      let val = currRow[i];
      if (filterType === 1) val += a;
      else if (filterType === 2) val += b;
      else if (filterType === 3) val += Math.floor((a + b) / 2);
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        let pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
        val += pr;
      }
      currRow[i] = val & 0xFF;
    }
    currRow.copy(prevRow);
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      if (colorType === 3 && plte) {
        const pIdx = currRow[x];
        rgba[dstIdx] = plte[pIdx * 3]; rgba[dstIdx + 1] = plte[pIdx * 3 + 1]; rgba[dstIdx + 2] = plte[pIdx * 3 + 2]; rgba[dstIdx + 3] = 255;
      } else if (colorType === 6) {
        const sIdx = x * 4;
        rgba[dstIdx] = currRow[sIdx]; rgba[dstIdx + 1] = currRow[sIdx + 1]; rgba[dstIdx + 2] = currRow[sIdx + 2]; rgba[dstIdx + 3] = 255;
      } else if (colorType === 2) {
        const sIdx = x * 3;
        rgba[dstIdx] = currRow[sIdx]; rgba[dstIdx + 1] = currRow[sIdx + 1]; rgba[dstIdx + 2] = currRow[sIdx + 2]; rgba[dstIdx + 3] = 255;
      }
    }
  }
  return { width, height, rgba };
}

function detectCardGemColor(img) {
  // Check strictly in diamond area x: 88..165, y: 45..54
  let red = 0, blue = 0, green = 0, purple = 0;
  for (let y = 45; y <= 54; y++) {
    for (let x = 88; x <= 165; x++) {
      const idx = (y * img.width + x) * 4;
      const r = img.rgba[idx], g = img.rgba[idx+1], b = img.rgba[idx+2];
      
      // Exclude dark lines & light background
      if (r < 50 && g < 50 && b < 50) continue;
      if (r > 175 && g > 165 && b > 140) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 20) continue;

      if (r > 115 && r > g + 35 && r > b + 35) {
        red++;
      } else if (g > 100 && g > r + 20 && g > b + 20) {
        green++;
      } else if (r > 55 && b > 75 && r > g + 15 && b > g + 25) {
        purple++;
      } else if (b > 110 && b > r + 30 && b > g + 15) {
        blue++;
      }
    }
  }

  const threshold = 5;
  if (red >= threshold && blue >= threshold) return 'แดง/ฟ้า';
  if (red >= threshold && red > blue && red > green && red > purple) return 'แดง';
  if (blue >= threshold && blue > red && blue > green && blue > purple) return 'ฟ้า';
  if (green >= threshold && green > red && green > blue && green > purple) return 'เขียว';
  if (purple >= threshold && purple > red && purple > blue && purple > green) return 'ม่วง';
  return '';
}

async function run() {
  const cardsFile = path.join(__dirname, '..', 'data', 'cards.json');
  const cards = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));

  // Get list of unique images/codes to scan
  const uniqueItems = new Map();
  cards.forEach(c => {
    const key = c.image || (c.code + '.png');
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, { code: c.code, image: key, name: c.name, gem: c.gem });
    }
  });

  const list = Array.from(uniqueItems.values()).filter(item => Number(item.gem) > 0);
  console.log('Scanning', list.length, 'cards with GEM > 0...');

  const results = {};
  const concurrency = 15;
  let finished = 0;

  async function processItem(item) {
    const url = 'https://cdn.bangbon.app/cards/' + encodeURIComponent(item.image);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const detected = detectCardGemColor(decodePng(buf));
      if (detected) {
        results[item.code] = detected;
        console.log(`[${finished + 1}/${list.length}] ${item.code} (${item.name}) -> GEM: ${detected}`);
      }
    } catch(e) {
      // Ignore fetch errors
    } finally {
      finished++;
    }
  }

  for (let i = 0; i < list.length; i += concurrency) {
    const chunk = list.slice(i, i + concurrency);
    await Promise.all(chunk.map(processItem));
  }

  console.log('\n--- SCAN COMPLETE ---');
  console.log('Total colored gems found:', Object.keys(results).length);

  // Apply to cards.json
  let updatedCount = 0;
  cards.forEach(c => {
    const targetGem = results[c.code] || '';
    if (c.gemColor !== targetGem) {
      c.gemColor = targetGem;
      updatedCount++;
    }
  });

  fs.writeFileSync(cardsFile, JSON.stringify(cards));
  console.log('Updated cards.json rows:', updatedCount);

  // Print summary by color
  const byColor = { 'แดง': [], 'ฟ้า': [], 'เขียว': [], 'ม่วง': [], 'แดง/ฟ้า': [] };
  Object.entries(results).forEach(([code, color]) => {
    if (byColor[color]) byColor[color].push(code);
  });
  console.log('\nBreakdown:');
  Object.entries(byColor).forEach(([col, arr]) => {
    console.log(`  ${col} (${arr.length}):`, arr.join(', '));
  });
}

run();
