/* BT01 ที่ยัง partial/manual — เติมออโต้แล้ว rebuild abilities / effects-all */
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
  'effects-bt01.json': {
    'BT01-005': {
      code: 'BT01-005',
      name: 'อู๊ดลูกเสือ',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'whenAttacked' },
          actions: [{ op: 'cancelAttackByRestAlly' }]
        }
      ],
      parseStatus: 'auto',
      note: 'เมื่อถูกโจมตี: นอน Avatar อื่นฝ่ายเรา 1 ใบ → ยกเลิกการโจมตี (ข้ามได้)'
    },
    'BT01-008': {
      code: 'BT01-008',
      name: 'รัททาทุย นางพญา',
      abilities: [],
      parseStatus: 'auto',
      replaceFirstDrawWithSelf: true,
      note: 'Draw Phase แรกของเรา: นำใบนี้จากเด็คขึ้นมือแทนการจั่ว (ข้ามได้)'
    },
    'BT01-009': {
      code: 'BT01-009',
      name: 'รัททาทุย พ่อพันธุ์',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          requireOwnNameIncludes: 'รัททาทุย นางพญา',
          actions: [
            {
              op: 'deckPick',
              filter: { nameIncludes: ['รัททาทุย'] },
              dest: 'avatar',
              paidCost: false,
              shuffleAfter: true,
              optional: true,
              multiMax: 99,
              costSumMax: 5
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'มีนางพญาบนสนาม → อัญเชิญรัททาทุยจากเด็คกี่ใบก็ได้ Cost รวม≤5 (ไม่จุติ)'
    },
    'BT01-042': {
      code: 'BT01-042',
      name: 'ริกกี้ นักปลอมแปลง',
      abilities: [
        {
          keyword: 'React',
          trigger: { on: 'ownAvatarDestroyed', if: 'fromCombat' },
          actions: [
            {
              op: 'takeControl',
              filter: { type: 'Avatar', requireTapped: true },
              until: 'permanent',
              keepTapped: true,
              thenAttachSrc: true,
              optional: false
            }
          ]
        }
      ],
      parseStatus: 'auto',
      bounceHostOnLeave: true,
      note: 'React เมื่อ Avatar เราถูกทำลายจากการต่อสู้: ยึด Avatar นอนของศัตรูแล้วสวมใบนี้ — ใบนี้ถูกทำลายแล้วโฮสต์กลับมือเจ้าของ'
    },
    'BT01-046': {
      code: 'BT01-046',
      name: 'ตีพ่อ',
      abilities: [
        {
          trigger: { on: 'battleDestroy' },
          oncePerTurn: true,
          oncePerTurnTag: 'battleDestroy',
          actions: [{ op: 'untapHost' }]
        },
        {
          trigger: { on: 'sentToHell' },
          actions: [{ op: 'revealOwnLife', count: 1 }]
        }
      ],
      parseStatus: 'auto',
      note: 'โฮสต์ทำลายจากการต่อสู้ → ตื่นได้เทิร์นละครั้ง · ใบนี้ตกนรกแล้วหงาย LIFE 1'
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
