/* กติกาในบรรทัด # ของการ์ด — ชื่อ/สี/Symbol เสริม, ข้อจำกัด Cost, ควบคุมใบเดียว, ใช้ได้เทิร์นละครั้งตามชื่อ
   รัน: node tools/_test-hash-rules.js */
const fs = require('fs');
const path = require('path');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
BoT.loadEffects(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8')));

const byCode = code => { const c = cards.find(x => x.code === code); if (!c) throw new Error('missing ' + code); return c; };
const find = (fn, label) => { const c = cards.find(fn); if (!c) throw new Error('missing ' + label); return c; };
function fail(m) { console.error('FAIL', m); process.exit(1); }
function ok(c, m) { if (!c) fail(m); console.log('ok', m); }
const fxOf = code => BoT.effectOf(code, byCode(code).name);

/* ชื่อเสริม */
['BT08-005', 'BT08-006', 'BT08-018', 'BT08-035'].forEach(code => ok(BoT.nameMatches(byCode(code), 'ขุนพล'), code + ': นับชื่อ ขุนพล'));
ok(BoT.nameMatches(byCode('BT11-031'), 'สมาชม'), 'คุณคำดี: นับชื่อ สมาชม');
ok(BoT.nameMatches(byCode('BT09-015'), 'ทหารหิมะ'), 'เพนกวินหิมะ: นับชื่อ ทหารหิมะ');

/* สี / Symbol เสริม */
ok((fxOf('BT10-011').extraColors || []).includes('เขียว'), 'ซุนฮูหยิน: เป็นสีเขียวด้วย');
ok((fxOf('BT10-012').extraSymbols || []).includes('หุ่นยนต์'), 'บ่าวแสม: เป็นหุ่นยนต์ด้วย');
ok((fxOf('BT09-015').extraSymbols || []).includes('ต่างชาติ'), 'เพนกวินหิมะ: เป็นต่างชาติด้วย');

/* ข้อจำกัด Cost */
const deity = find(c => c.type === 'Avatar' && c.symbol === 'เทพ', 'เทพ');
const human = find(c => c.type === 'Avatar' && c.symbol === 'คน' && !/ไอดอล|โปรดิวเซอร์|จอมเวทย์/.test(c.name), 'คน');
const idol = find(c => c.type === 'Avatar' && /ไอดอล/.test(c.name), 'ไอดอล');
const producer = find(c => c.type === 'Avatar' && /โปรดิวเซอร์/.test(c.name), 'โปรดิวเซอร์');
const dj = find(c => c.type === 'Avatar' && /DJ ปีโป้/.test(c.name), 'DJ ปีโป้');
const mage = find(c => c.type === 'Avatar' && /จอมเวทย์/.test(c.name), 'จอมเวทย์');
const redRobot = find(c => c.type === 'Avatar' && c.symbol === 'หุ่นยนต์' && c.color === 'แดง', 'หุ่นยนต์แดง');
const greenRobot = find(c => c.type === 'Avatar' && c.symbol === 'หุ่นยนต์' && c.color === 'เขียว', 'หุ่นยนต์เขียว');
const pay = (code, target) => BoT.costOnlyDeny(byCode(code), target);

ok(!pay('BT03-001', deity), 'พระลักษมี: จ่ายให้เทพได้');
ok(!!pay('BT03-001', human), 'พระลักษมี: จ่ายให้คนไม่ได้');
ok(!pay('BT03-006', redRobot), 'ไดบาเรีย: จ่ายให้หุ่นยนต์แดงได้');
ok(!!pay('BT03-006', greenRobot), 'ไดบาเรีย: หุ่นยนต์สีอื่นไม่ได้');
ok(!pay('BT04-013', idol), 'โอตะตัวกะปอม: จ่ายให้ไอดอลได้');
ok(!!pay('BT04-013', producer), 'โอตะตัวกะปอม: โปรดิวเซอร์ไม่ได้');
ok(!pay('BT04-054', idol) && !pay('BT04-054', producer), 'ของขวัญจากโอตะ: ไอดอล/โปรดิวเซอร์จ่ายได้ (เดิมจ่ายไม่ได้เลย)');
ok(!!pay('BT04-054', human), 'ของขวัญจากโอตะ: ใบอื่นไม่ได้');
ok(!pay('BT09-049', dj), 'ขอโทษสังคม: DJ ปีโป้จ่ายได้');
ok(!!pay('BT09-049', human), 'ขอโทษสังคม: ใบอื่นไม่ได้');
ok(!pay('BT10-055', mage), 'คาถา เฟรนลี่คัม: จอมเวทย์จ่ายได้');
ok(!!pay('BT10-055', human), 'คาถา เฟรนลี่คัม: ใบอื่นไม่ได้');
ok(!pay('BT07-006', byCode('BT06-004')), 'อนันตวดี: Symbol สัตว์วิเศษยังจ่ายได้');

/* ข้อมูลอื่น */
ok(fxOf('BT08-011').uniqueOnField === true, 'ซาบะริว: ควบคุมได้ใบเดียว');
ok(fxOf('BT09-032').noPaidSummon === true, 'วินดิโก้: จ่าย Cost อัญเชิญไม่ได้');
ok(fxOf('BT08-032').overdoseLockOwnAbilities === true, 'ชาโค่ล: มีกติกา Overdose');
['BT09-012', 'BT09-013'].forEach(code => ok((fxOf(code).gemAsCostForNameIncludes || []).includes('นาย'), code + ': ใช้เป็น Gem ไร้สีได้'));

/* เนฟิล สวมใส่ไม่ได้ */
{
  const st = { inst: { h: Object.assign({}, byCode('BT09-035')), o: Object.assign({}, byCode('SD01-001')) }, zones: {} };
  const mod = byCode('BT09-064');
  ok(!!BoT.attachOnlyDeny(st, mod.code, 'h', mod.name), 'เนฟิล: สวมใส่การ์ดไม่ได้');
}

console.log('ALL HASH RULE TESTS PASSED');
