/* apply-manual-fixes.js — Implement 4 remaining manual cards */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function load(name) {
  const p = path.join(ROOT, 'data', name);
  if (!fs.existsSync(p)) return { cards: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function save(name, j) {
  fs.writeFileSync(path.join(ROOT, 'data', name), JSON.stringify(j, null, 2) + '\n');
}
function upsert(fileCards, entry) {
  const i = fileCards.findIndex(c => c.code === entry.code);
  if (i < 0) fileCards.push(entry);
  else fileCards[i] = Object.assign({}, fileCards[i], entry);
}

const fixes = {
  'effects-kd00.json': [
    {
      code: 'KD00-00B',
      name: 'เบียดเบียนผู้อื่น',
      parseStatus: 'auto',
      abilities: [
        {
          trigger: { on: 'activated' },
          actions: [
            { op: 'randomHandCompare', costCompare: true, loserBanish: 1, winnerRetrieveExile: 1 }
          ]
        }
      ],
      note: 'สุ่มหยิบมือเทียบ Cost ผู้แพ้เนรเทศ 1 ใบ / ผู้ชนะนำการ์ดจากมิติมืดคืนใต้เด็ค'
    }
  ],
  'effects-ody1.json': [
    {
      code: 'ODY1-064',
      name: 'โอเดนย่า อร่อยมัก',
      parseStatus: 'auto',
      abilities: [
        {
          keyword: 'React',
          trigger: { on: 'enemyDeclareAttack', ifTargetNameIncludes: 'ทาโกะ' },
          actions: [
            { op: 'modifyPower', amount: 2, duration: 'endOfTurn', layer: 4, target: { select: 'attackTarget' } }
          ]
        }
      ],
      note: 'เมื่อ Avatar ทาโกะ ตกเป็นเป้าการโจมตี: Avatar นั้น POWER +2 จนจบเทิร์น'
    },
    {
      code: 'ODY1-065',
      name: 'ถุงเกราะโอเดนย่า',
      parseStatus: 'auto',
      abilities: [
        {
          trigger: { on: 'destroyed', if: 'self.attached' },
          actions: [
            { op: 'modifyPower', amount: 2, duration: 'untilOpponentNextTurnEnd', layer: 4, target: { select: 'equippedAvatar' } }
          ]
        }
      ],
      note: 'ทำลายในสภาพสวมใส่: Avatar ที่เคยสวมใส่ POWER +2 จนจบเทิร์นถัดไปของฝ่ายตรงข้าม'
    }
  ],
  'effects-pre0.json': [
    {
      code: 'PRE0-004',
      name: 'ผู้เล่นจำไม',
      parseStatus: 'auto',
      exactGemPay: true,
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [
            { op: 'inspectDeckCounts', target: 'opponent' }
          ]
        }
      ],
      note: 'ทิ้ง GEM 1 จำนวน 5 ใบเท่านั้น · จุติ: ดูสถิติจำนวนการ์ดในเด็คคู่ต่อสู้'
    }
  ]
};

Object.entries(fixes).forEach(([file, list]) => {
  const j = load(file);
  list.forEach(entry => upsert(j.cards, entry));
  save(file, j);
  console.log(`Updated ${list.length} cards in ${file}`);
});

console.log('Rebuilding abilities database...');
const reb = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { cwd: ROOT, encoding: 'utf8' });
if (reb.stdout) process.stdout.write(reb.stdout);
if (reb.stderr) process.stderr.write(reb.stderr);
if (reb.status) { console.error('Rebuild failed!'); process.exit(reb.status); }
console.log('Manual fixes complete!');
