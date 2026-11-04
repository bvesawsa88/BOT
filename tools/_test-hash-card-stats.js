/* ค่าบนการ์ดที่มี # — เทียบจากภาพการ์ดจริง
   รัน: node tools/_test-hash-card-stats.js */
const fs = require('fs');
const path = require('path');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
function fail(m) { console.error('FAIL', m); process.exit(1); }
function ok(c, m) { if (!c) fail(m); console.log('ok', m); }

const expected = {
  'BT04-007': { cost: 6, gem: 1, power: 4, color: 'แดง', gemColor: 'แดง' },
  'BT04-013': { cost: 2, gem: 4, power: 0, color: 'ฟ้า', gemColor: 'ขาว' },
  'KD03-009': { cost: 2, gem: 4, power: 0, color: 'ฟ้า', gemColor: 'ขาว' },
  'BT09-022': { cost: 4, gem: 2, power: 2, color: 'ฟ้า', gemColor: 'ขาว' },
  'PRMO-136': { cost: 1, gem: 1, power: 1, color: 'ฟ้า', gemColor: 'ฟ้า' },
  'PRMO-130': { cost: 3, gem: 3, power: 2, color: 'ม่วง', gemColor: 'ม่วง' },
  'SL02-004': { cost: 4, gem: 2, power: 4, color: 'ฟ้า', gemColor: 'ฟ้า' },
  'BT08-020': { cost: 4, gem: 2, power: 4, color: 'ฟ้า', gemColor: 'ขาว' },
  'KD03-002': { cost: 4, gem: 4, power: 1, color: 'ม่วง', gemColor: 'ขาว' },
  'BT09-032': { cost: 6, gem: 0, power: 8, color: 'ม่วง', gemColor: '' }
};
Object.keys(expected).forEach(code => {
  const rows = cards.filter(c => c.code === code);
  ok(rows.length > 0, code + ': มีในฐานข้อมูล');
  rows.forEach(r => Object.keys(expected[code]).forEach(k => {
    ok(r[k] === expected[code][k], `${r.uid} ${k}=${r[k]}`);
  }));
});

/* การ์ดที่มี # ทุกแถวของ Avatar / Construct ต้องมีสีคอส */
cards.filter(c => /#/.test(c.effect || '') && (c.type === 'Avatar' || c.type === 'Construct')).forEach(c => {
  if (!c.color) fail(`${c.uid}: ไม่มีสีคอส`);
});
console.log('ok ทุกใบที่มี # มีสีคอส');
console.log('ALL HASH CARD STAT TESTS PASSED');
