/* รันเทสต์ทั้งหมดใน tools/ — ใช้ผ่าน `npm test`
   กรองชื่อได้: `npm test -- bot` จะรันเฉพาะไฟล์ที่ชื่อมีคำว่า bot */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TIMEOUT_MS = 120000;
const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname)
  .filter(f => /^_test[-_].*\.js$/.test(f) && f.includes(filter))
  .sort();

const failed = [];
const t0 = Date.now();
for (const file of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status === 0) {
    console.log('[PASS] ' + file);
    continue;
  }
  failed.push(file);
  console.log('[FAIL] ' + file + (r.error ? ' (' + r.error.code + ')' : ''));
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-8).join('\n');
  if (out) console.log(out);
}

console.log('\n' + (files.length - failed.length) + '/' + files.length + ' passed in '
  + Math.round((Date.now() - t0) / 1000) + 's');
if (failed.length) {
  console.log('Failed: ' + failed.join(', '));
  process.exit(1);
}
