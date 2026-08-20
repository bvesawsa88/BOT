/* คลื่น 2 — CC01 / CC02 */
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

const BY_SET = {
  'effects-cc01.json': {
    'CC01-008': {
      code: 'CC01-008',
      name: 'คนอีสาน ยุคครีเตเชียส',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'deckPick',
          filter: { exactName: 'แมลงปอทอด' },
          dest: 'hand',
          shuffleAfter: true
        }]
      }],
      note: 'จุติ: นำ แมลงปอทอด จากเด็คขึ้นมือ แล้วสับ'
    },
    'CC01-010': {
      code: 'CC01-010',
      name: 'ลุงบุญโชค',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'deckPick',
          filter: { type: 'Magic', nameIncludes: ['สมชายห้องเช่า'] },
          dest: 'hand',
          shuffleAfter: true
        }]
      }],
      note: 'จุติ: นำ Magic สมชายห้องเช่า จากเด็คขึ้นมือ แล้วสับ'
    },
    'CC01-047': {
      code: 'CC01-047',
      name: 'ตุ๊กตางูพันคอ',
      parseStatus: 'auto',
      hostMustAttack: true,
      abilities: [{
        trigger: { on: 'static', if: 'self.attached' },
        actions: [{
          op: 'modifyPower',
          amount: 2,
          duration: 'whileEquipped',
          layer: 2,
          target: { select: 'equippedAvatar' }
        }]
      }],
      note: 'สวมแล้วโฮสต์ POWER +2 และต้องโจมตีถ้าทำได้'
    },
    'CC01-012': {
      code: 'CC01-012',
      name: 'เฟรนชี่',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'คำสั่งเสีย',
        trigger: { on: 'destroyed' },
        actions: [
          { op: 'draw', count: 2 },
          { op: 'returnHandToDeck', pos: 'bottom' }
        ]
      }],
      note: 'คำสั่งเสีย: จั่ว 2 แล้วนำมือ 1 ใบไว้ล่างสุดเด็ค'
    },
    'CC01-020': {
      code: 'CC01-020',
      name: 'ผู้กองอึ่งอ่าง',
      parseStatus: 'auto',
      allSymbols: true,
      abilities: [],
      note: 'ต่อเนื่อง: นับเป็นทุก Symbol ขณะอยู่บน Avatar Zone'
    },
    'CC01-031': {
      code: 'CC01-031',
      name: 'เสามงคล',
      parseStatus: 'auto',
      cannotAttack: true,
      abilities: [{
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'afterNormalDraw' },
        actions: [{ op: 'draw', count: 1 }]
      }],
      note: 'โจมตีไม่ได้ · Draw Phase หลังจั่วปกติ: จั่ว 1'
    },
    'CC01-018': {
      code: 'CC01-018',
      name: 'เสามงคล ทรงจีน',
      parseStatus: 'auto',
      cannotAttack: true,
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'deckPick',
          filter: { type: 'Avatar', nameIncludes: ['ผู้เจริญ'] },
          dest: 'avatar',
          paidCost: false,
          shuffleAfter: true,
          then: [{
            op: 'schedule',
            when: 'ownEndPhase',
            src: 'summoned',
            actions: [{ op: 'returnToHand', target: 'self' }]
          }]
        }]
      }],
      note: 'โจมตีไม่ได้ · จุติ: อัญเชิญผู้เจริญจากเด็ค (ไม่จุติ) แล้วเด้งขึ้นมือเมื่อจบเทิร์น'
    }
  },
  'effects-cc02.json': {
    'CC02-006': {
      code: 'CC02-006',
      name: 'ซุส เทพเจ้าสูงสุดแห่งโอลิมปัส',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'deckPick',
          dest: 'hand',
          multiMax: 2,
          shuffleAfter: true
        }]
      }],
      note: 'จุติ: เลือกการ์ดจากเด็คขึ้นมือได้ 2 ใบ แล้วสับ'
    },
    'CC02-008': {
      code: 'CC02-008',
      name: 'ลุงน้อย พ่อค้าไก่ย่าง',
      parseStatus: 'auto',
      exactGemPay: true,
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          { op: 'draw', count: 3 },
          { op: 'returnHandToDeck', then: [{ op: 'returnHandToDeck' }] }
        ]
      }],
      note: 'พอดี · จุติ: จั่ว 3 แล้วนำมือ 2 ใบกลับเด็คแล้วสับ'
    },
    'CC02-014': {
      code: 'CC02-014',
      name: 'แร้งทึ้งศพ',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'อัตโนมัติ',
        trigger: { on: 'anyMill' },
        oncePerTurn: true,
        actions: [{ op: 'draw', count: 1 }]
      }],
      note: 'อัตโนมัติ เทิร์นละครั้ง เมื่อมีการธรณีสูบ: จั่ว 1'
    },
    'CC02-018': {
      code: 'CC02-018',
      name: 'หุ่นพิฆาต 300%',
      parseStatus: 'auto',
      blockDeckSummon: true,
      abilities: [],
      note: 'ต่อเนื่อง: ทุกคนอัญเชิญ Avatar จากเด็คไม่ได้'
    },
    'CC02-041': heritageMagic('CC02-041', 'มรดกของพระอิศวร', 'แดง'),
    'CC02-042': heritageMagic('CC02-042', 'หนังสือเอาตัวรอดของกุ่ย', 'ฟ้า'),
    'CC02-043': heritageMagic('CC02-043', 'หมอนข้างมฤตยูเทวี', 'ม่วง')
  }
};

function heritageMagic(code, name, color) {
  return {
    code,
    name,
    parseStatus: 'auto',
    stayOnMagic: true,
    abilities: [
      {
        trigger: { on: 'activated' },
        actions: [{
          op: 'scout',
          count: 2,
          filter: { color },
          dest: 'hand',
          restTo: 'bottom'
        }]
      },
      {
        trigger: { on: 'activated' },
        fromMagicZone: true,
        requireTurnsOnMagicMin: 1,
        actions: [
          { op: 'destroy', target: { select: 'self' } },
          {
            op: 'handSummon',
            filter: { type: 'Avatar', color },
            costReduce: 2,
            mustPayRemain: true,
            paidCost: true
          }
        ]
      }
    ],
    note: 'สอดแนม 2 เอา' + color + 'ขึ้นมือ ค้าง Magic · เทิร์นถัดไปทำลายตัวเองอัญเชิญ' + color + ' Cost−2'
  };
}

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
