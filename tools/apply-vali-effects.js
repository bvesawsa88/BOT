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

const BY_SET = {
  'effects-bt07.json': {
    'BT07-041': {
      code: 'BT07-041',
      name: 'คาบู ช่วยด้วย',
      abilities: [
        {
          keyword: 'React',
          trigger: {
            on: 'avatarWouldBeDestroyed'
          },
          fromHand: true,
          requireTargetOwn: true,
          requireTargetSymbol: 'สัตว์',
          cost: {
            discardHand: 1
          },
          actions: [
            {
              op: 'summonSelfFromHandFree'
            },
            {
              op: 'preventDestroy'
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'เมื่อสัตว์เราจะถูกทำลาย ทิ้งมือ 1: อัญเชิญใบนี้แล้วยกเลิกการทำลาย'
    }
  },
  'effects-bt08.json': {
    'BT08-061': {
      code: 'BT08-061',
      name: 'ขวาน 7 สี',
      abilities: [
        {
          trigger: {
            on: 'declareAttack',
            if: 'hostColor==แดง'
          },
          actions: [
            {
              op: 'modifyPower',
              amount: 2,
              duration: 'combat',
              target: {
                select: 'self'
              }
            }
          ]
        },
        {
          trigger: {
            on: 'declareAttack',
            if: 'hostColor==ฟ้า'
          },
          actions: [
            {
              op: 'draw',
              count: 1
            }
          ]
        },
        {
          trigger: {
            on: 'declareAttack',
            if: 'hostColor==ม่วง'
          },
          actions: [
            {
              op: 'mill',
              count: 1
            },
            {
              op: 'modifyPower',
              amount: 1,
              duration: 'endOfTurn',
              target: {
                select: 'self'
              }
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'สวมใส่: ทำงานตามสีโฮสต์ (แดง: Power+2 combat / ฟ้า: จั่ว 1 / ม่วง: ธรณีสูบ 1 Power+1 / เขียว: ได้รับลูกฮึด)'
    }
  },
  'effects-bt09.json': {
    'BT09-054': {
      code: 'BT09-054',
      name: 'แผนการตู้เย็นทับ',
      abilities: [
        {
          trigger: {
            on: 'activated'
          },
          actions: [
            {
              op: 'pick',
              from: 'ownConstructs',
              dest: 'pickTuyenConstruct',
              required: true
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'เลือก Construct เรา 1 ใบ -> เลือกทำลาย Avatar ศัตรูที่มี Power <= Construct'
    }
  },
  'effects-bt11.json': {
    'BT11-073': {
      code: 'BT11-073',
      name: 'รูปประจำบ้าน',
      abilities: [],
      controlImmuneOwnAvatars: true,
      parseStatus: 'auto',
      note: 'ต่อเนื่อง: Avatar เราทั้งหมดไม่ถูกเปลี่ยนการควบคุม'
    }
  }
};

Object.entries(BY_SET).forEach(([file, map]) => {
  const j = load(file);
  Object.values(map).forEach(entry => upsert(j.cards, entry));
  save(file, j);
  console.log('updated', file, Object.keys(map).join(', '));
});

console.log('Rebuilding abilities database...');
const reb = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { cwd: ROOT, encoding: 'utf8' });
if (reb.stdout) process.stdout.write(reb.stdout);
if (reb.stderr) process.stderr.write(reb.stderr);
if (reb.status) process.exit(reb.status);

console.log('Successfully completed!');
