#!/usr/bin/env node
/* แก้ gemColor ตามหน้าการ์ด: เจมใส=ขาว · เจค=ม่วง (cost ฟ้า) */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'cards.json');
const cards = JSON.parse(fs.readFileSync(file, 'utf8'));

const BY_CODE = {
  // เจค — ช่อง cost ฟ้า แต่เพชรม่วง
  'BT05-017': 'ม่วง',
  'SL02-003': 'ม่วง',
  // จากสกรีนช็อตผู้ใช้: เพชรใสบนการ์ดสี
  'BT07-034': 'ขาว', // ตำรวจนอกเครื่องแบบ ไซเฮย์
  'BT01-020': 'ขาว', // ศาลพระภูมิ
  'CC02-032': 'ขาว',
  'ODY1-029': 'ขาว',
  'PRMO-079': 'ขาว',
};

const BY_NAME_WHITE = new Set([
  'ศาลพระภูมิ',
]);

let n = 0;
cards.forEach(c => {
  let next = null;
  if (BY_CODE[c.code] != null) next = BY_CODE[c.code];
  else if (BY_NAME_WHITE.has(c.name)) next = 'ขาว';
  if (next != null && c.gemColor !== next) {
    c.gemColor = next;
    n++;
  }
});
fs.writeFileSync(file, JSON.stringify(cards));
console.log('updated gemColor on', n, 'rows');
