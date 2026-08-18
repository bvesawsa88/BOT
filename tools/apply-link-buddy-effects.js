/* Link / คู่หู — เพมมุ สไปรท์ เจ้าหญิง · มิสทรอม่า ดินแดนยุติธรรม ออส่วนบอย */
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
  'effects-bt09.json': {
    'BT09-008': {
      code: 'BT09-008',
      name: 'เพมมุ ยอดมนุษย์',
      hostAttachNameIncludes: 'อาวุธของเพมมุ',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          actions: [{
            op: 'modifyPower',
            amount: 2,
            layer: 3,
            target: { select: 'self', requireAttached: true }
          }]
        },
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          oncePerTurn: true,
          countsAsModification: true,
          actions: [{
            op: 'attach',
            from: 'deck',
            host: 'self',
            shuffleAfter: true,
            filter: { nameIncludes: ['อาวุธของเพมมุ'] }
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'สวมได้เฉพาะอาวุธของเพมมุ · สวม {mod} แล้ว POWER +2 · สั่งใช้เทิร์นละครั้งค้นอาวุธจากเด็คมาสวม (นับเป็นใช้ Modification)'
    },
    'BT09-009': {
      code: 'BT09-009',
      name: 'สไปรท์ ยอดสุนัข',
      keywords: ['โล่มนุษย์', 'ลูกฮึด', 'สามัคคี'],
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'ownTurnEnd', if: 'selfTapped' },
          actions: [
            { op: 'untap', target: 'self' },
            {
              op: 'modifyPower',
              amount: 2,
              duration: 'nextOwnDraw',
              target: { select: 'self' }
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'โล่มนุษย์ ลูกฮึด สามัคคี · End Phase ถ้านอน: ตื่น และ POWER +2 จน Draw Phase ถัดไปของเรา · [Link เพมมุ]'
    },
    'BT09-011': {
      code: 'BT09-011',
      name: 'เจ้าหญิงรวงข้าว',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{ op: 'draw', count: 1, player: 'owner' }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          onlyOwnTurn: true,
          actions: [{
            op: 'modifyPower',
            amount: 2,
            layer: 3,
            target: {
              select: 'all',
              type: 'Avatar',
              side: 'own',
              nameIncludes: ['เพมมุ', 'สไปรท์', 'เมย์ แวมไพร์'],
              requireLinked: true
            }
          }]
        }
      ],
      parseStatus: 'partial',
      note: 'ต่อเนื่องในเทิร์นเรา: เพมมุ/สไปรท์/เมย์ ที่อยู่ในสถานะ Link POWER +2 · จุติยังคืนเด็คไม่ครบ (จั่ว 1)'
    }
  },
  'effects-bt10.json': {
    'BT10-070': {
      code: 'BT10-070',
      name: 'ดินแดนยุติธรรม',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==landZone' },
          protectOwnFromOppLeave: true,
          requireOwnLinkedNameAny: ['เพมมุ', 'สไปรท์'],
          protectNameOrEffectIncludes: 'เพมมุ',
          actions: []
        }
      ],
      parseStatus: 'auto',
      note: 'ตราบเท่าที่เพมมุหรือสไปรท์อยู่ใน Link: Avatar ฝ่ายเราที่มี "เพมมุ" ในชื่อหรือข้อความ ไม่ถูกนำออกจากสนามโดยความสามารถ/ผู้เล่นฝ่ายตรงข้าม (ยกเว้นต่อสู้)'
    }
  },
  'effects-bt11.json': {
    'BT11-008': {
      code: 'BT11-008',
      name: 'ออส่วนบอย',
      onlyAttackableAllyNameIncludes: 'กิมมิคแมน',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'ownAvatarDestroyed', if: 'oppTurn' },
          requireDestroyedNameIncludes: 'กิมมิคแมน',
          actions: [{ op: 'setPrintedPower', amount: 6 }]
        }
      ],
      parseStatus: 'auto',
      note: 'เมื่อกิมมิคแมนถูกทำลายในเทิร์นศัตรู: POWER ตั้งต้นเป็น 6 · ต่อเนื่อง ฝ่ายตรงข้ามต้องโจมตีกิมมิคแมนถ้ามีบนสนาม · [Link กิมมิคแมน]'
    },
    'BT11-011': {
      code: 'BT11-011',
      name: 'มิสทรอม่า',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          requireOwnAnyLinked: true,
          unlessOwnLinkedNamesAll: ['เพมมุ', 'สไปรท์'],
          actions: [{
            op: 'modifyPower',
            amount: 1,
            layer: 3,
            target: { select: 'self' }
          }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          requireOwnLinkedNamesAll: ['เพมมุ', 'สไปรท์'],
          actions: [{
            op: 'modifyPower',
            amount: 2,
            layer: 3,
            target: { select: 'self' }
          }]
        }
      ],
      parseStatus: 'partial',
      note: 'ต่อเนื่อง: มี Avatar ใน Link แล้ว POWER +1 · ถ้าเพมมุและสไปรท์อยู่ใน Link POWER +2 แทน · จุติ (ทำลาย Land ศัตรู / วางดินแดนยุติธรรม / ล็อก Land) ยังไม่ทำ'
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
