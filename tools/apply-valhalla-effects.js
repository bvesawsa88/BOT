/* ซีรีเทพธิดาแห่งวัลฮัลลา — สั่งใช้ธรณีสูบ + โดนธรณีสูบโดยเทพม่วง/Magic */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
}
function save(name, j) {
  fs.writeFileSync(path.join(ROOT, 'data', name), JSON.stringify(j, null, 2) + '\n');
}
function upsert(fileCards, entry) {
  const i = fileCards.findIndex(c => c.code === entry.code);
  if (i < 0) fileCards.push(entry);
  else fileCards[i] = Object.assign({}, fileCards[i], entry);
}

const MILLED_BY_PURPLE_GOD_OR_MAGIC = {
  anyOf: [
    { type: 'Avatar', symbol: 'เทพ', color: 'ม่วง' },
    { type: 'Magic' }
  ]
};

const BY_SET = {
  'effects-bt06.json': {
    'BT06-029': {
      code: 'BT06-029',
      name: 'ซีกรุน เทพธิดาแห่งวัลฮัลลา',
      abilities: [{
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        cost: [{ op: 'mill', count: 3, who: 'self' }],
        actions: [{
          op: 'modifyPower',
          amount: 1,
          duration: 'permanent',
          target: { select: 'self' }
        }]
      }],
      parseStatus: 'auto',
      note: 'เทิร์นละครั้ง สั่งใช้ ธรณีสูบ 3 : POWER +1 จนกว่าออกจากสนาม'
    },
    'BT06-063': {
      code: 'BT06-063',
      name: 'ประตูวัลฮัลลา',
      abilities: [{
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        cost: [{ op: 'mill', count: 2, who: 'self' }],
        actions: [{
          op: 'hellPick',
          dest: 'hand',
          filter: { type: 'Avatar', nameIncludes: ['เทพธิดาแห่งวัลฮัลลา'] }
        }]
      }],
      parseStatus: 'auto',
      note: 'เทิร์นละครั้ง สั่งใช้ ธรณีสูบ 2 : เลือกเทพธิดาแห่งวัลฮัลลาในนรกเราขึ้นมือ'
    },
    'BT06-028': {
      code: 'BT06-028',
      name: 'โอลรุน เทพธิดาแห่งวัลฮัลลา',
      abilities: [{
        keyword: 'อัตโนมัติ',
        trigger: { on: 'milled' },
        requireMillSource: MILLED_BY_PURPLE_GOD_OR_MAGIC,
        actions: [{ op: 'returnSelfToHand' }]
      }],
      parseStatus: 'auto',
      note: 'โดนธรณีสูบโดย Avatar เทพม่วงหรือ Magic → กลับขึ้นมือ'
    },
    'BT06-027': {
      code: 'BT06-027',
      name: 'สกัลด์ เทพธิดาแห่งวัลฮัลลา',
      abilities: [{
        keyword: 'อัตโนมัติ',
        trigger: { on: 'milled' },
        requireMillSource: MILLED_BY_PURPLE_GOD_OR_MAGIC,
        actions: [{
          op: 'hellPick',
          dest: 'avatar',
          paidCost: false,
          filter: {
            type: 'Avatar',
            nameIncludes: ['เทพธิดาแห่งวัลฮัลลา'],
            costMax: 4,
            nameNotEquals: 'สกัลด์ เทพธิดาแห่งวัลฮัลลา'
          }
        }]
      }],
      parseStatus: 'auto',
      note: 'โดนธรณีสูบโดยเทพม่วง/Magic → อัญเชิญเทพธิดาวัลฮัลลา Cost≤4 ที่ไม่ใช่สกัลด์จากนรก'
    },
    'BT06-052': {
      code: 'BT06-052',
      name: 'เสียงเรียกแห่งวัลฮัลลา',
      abilities: [
        {
          keyword: 'React',
          trigger: { on: 'enemyDeclareAttack' },
          react: true,
          requireCritical: true,
          cost: [{ op: 'mill', count: 5, who: 'self' }],
          actions: [
            { op: 'cancelAttack' },
            {
              op: 'hellPick',
              dest: 'avatar',
              paidCost: false,
              multiMax: 4,
              filter: { type: 'Avatar', nameIncludes: ['เทพธิดาแห่งวัลฮัลลา'] }
            }
          ]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'milled' },
          requireMillSource: MILLED_BY_PURPLE_GOD_OR_MAGIC,
          actions: [{ op: 'returnSelfToHand' }]
        }
      ],
      parseStatus: 'auto',
      note: 'สาหัสเท่านั้น เมื่อถูกประกาศโจมตี ธรณีสูบ 5 ยกเลิกโจมตี แล้วอัญเชิญเทพธิดาวัลฮัลลาสูงสุด 4 จากนรก · โดนธรณีสูบโดยเทพม่วง/Magic → กลับขึ้นมือ'
    }
  },
  'effects-bt05.json': {
    'BT05-027': {
      code: 'BT05-027',
      name: 'บรุนฮิลด์  เทพธิดาแห่งวัลฮัลลา',
      abilities: [{
        keyword: 'อัตโนมัติ',
        trigger: { on: 'milled' },
        requireMillSource: MILLED_BY_PURPLE_GOD_OR_MAGIC,
        actions: [{ op: 'offerSummonSelfFromHell' }]
      }],
      parseStatus: 'auto',
      note: 'โดนธรณีสูบโดย Avatar เทพม่วงหรือ Magic → ถามอัญเชิญตัวเองจากนรก'
    }
  }
};

Object.entries(BY_SET).forEach(([file, map]) => {
  const j = load(file);
  Object.values(map).forEach(entry => upsert(j.cards, entry));
  save(file, j);
  console.log('updated', file, Object.keys(map).join(', '));
});

const reb = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { cwd: ROOT, encoding: 'utf8' });
if (reb.stdout) process.stdout.write(reb.stdout);
if (reb.stderr) process.stderr.write(reb.stderr);
if (reb.status) process.exit(reb.status);
