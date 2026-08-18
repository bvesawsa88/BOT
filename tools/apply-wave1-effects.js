/* คลื่น 1 — PRE0 / ODY1 */
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

function takoJuti(exactName) {
  return [{
    keyword: 'จุติ',
    trigger: { on: 'summoned', if: 'paidCost' },
    actions: [{
      op: 'deckPick',
      filter: { type: 'Avatar', exactName },
      dest: 'hand',
      shuffleAfter: true
    }]
  }];
}

const BY_SET = {
  'effects-ody1.json': {
    'ODY1-001': {
      code: 'ODY1-001',
      name: 'ทาโกะซัง สูตรสวรรค์',
      parseStatus: 'auto',
      abilities: takoJuti('ทาโกะซัง สูตรมนุษย์'),
      note: 'จุติ: นำ ทาโกะซัง สูตรมนุษย์ จากเด็คขึ้นมือ แล้วสับ'
    },
    'ODY1-002': {
      code: 'ODY1-002',
      name: 'ทาโกะซัง สูตรมนุษย์',
      parseStatus: 'auto',
      abilities: takoJuti('ทาโกะซัง สูตรนรก'),
      note: 'จุติ: นำ ทาโกะซัง สูตรนรก จากเด็คขึ้นมือ แล้วสับ'
    },
    'ODY1-003': {
      code: 'ODY1-003',
      name: 'ทาโกะซัง สูตรนรก',
      parseStatus: 'auto',
      abilities: takoJuti('ทาโกะซัง สูตรสวรรค์'),
      note: 'จุติ: นำ ทาโกะซัง สูตรสวรรค์ จากเด็คขึ้นมือ แล้วสับ'
    },
    'ODY1-004': {
      code: 'ODY1-004',
      name: 'ทาโกะจัง พนักงานดีเด่น',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'hellPickMulti',
          filter: { type: 'Avatar', nameIncludes: ['ทาโกะซัง'] },
          countExact: 3,
          distinctNames: true,
          thenDraw: 1
        }]
      }],
      note: 'จุติ: คืนทาโกะซังชื่อไม่ซ้ำ 3 ใบจากนรกเข้าเด็ค สับ แล้วจั่ว 1'
    },
    'ODY1-005': {
      code: 'ODY1-005',
      name: 'โอเดนย่ากาย',
      parseStatus: 'auto',
      abilities: [],
      attackIf: 'onlyAlliesNameIncludes:ทาโกะ',
      note: 'โจมตีได้เมื่อ Avatar Zone ฝ่ายเรามีทาโกะเท่านั้น (ตัวเองยกเว้น)'
    },
    'ODY1-028': {
      code: 'ODY1-028',
      name: 'ทศกัณฑ์ยักษ์ที่---เมียพระอิศวร',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'takeControl',
          filter: { type: 'Avatar' },
          until: 'permanent',
          keepTapped: true,
          optional: true
        }]
      }],
      note: 'จุติ: ยึด Avatar ศัตรู 1 ใบมาฝั่งเราในสภาพนอน'
    },
    'ODY1-066': {
      code: 'ODY1-066',
      name: 'ดาว O.D.Y 88',
      parseStatus: 'auto',
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{
          op: 'modifyPower',
          amount: 1,
          target: { select: 'all', type: 'Avatar', nameIncludes: ['ทาโกะ'], zone: 'avatarZone' }
        }]
      }],
      note: 'POWER +1 ให้ Avatar ทาโกะ บนสนามทุกใบ จนจบเทิร์น'
    },
    'ODY1-063': {
      code: 'ODY1-063',
      name: 'เอาแค่การ์ด !!!',
      parseStatus: 'auto',
      abilities: [{
        trigger: { on: 'activated' },
        cost: [{
          op: 'discard',
          count: 1,
          filter: { nameIncludesAny: ['ทาโกะ', 'โอเดนย่า'] }
        }],
        actions: [{
          op: 'bounce',
          from: 'any',
          filter: { type: 'Avatar' }
        }]
      }],
      note: 'ทิ้งทาโกะหรือโอเดนย่า 1 ใบ : เด้ง Avatar บนสนามขึ้นมือเจ้าของ'
    },
    'ODY1-064': {
      code: 'ODY1-064',
      name: 'โอเดนย่า อร่อยมัก',
      parseStatus: 'manual',
      abilities: [],
      note: 'พิมพ์ Normal แต่เป็นกับดักเมื่อทาโกะถูกโจมตี — ต้องเฝ้าสนามจาก Magic Zone'
    },
    'ODY1-065': {
      code: 'ODY1-065',
      name: 'ถุงเกราะโอเดนย่า',
      parseStatus: 'manual',
      abilities: [],
      note: 'พิมพ์ Normal แต่ทำงานตอนถูกทำลายในสภาพสวมใส่ — ต้องเป็น Modification/ใบสวม'
    }
  },
  'effects-pre0.json': {
    'PRE0-001': {
      code: 'PRE0-001',
      name: 'ผู้เล่นยุคแรก',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'peekOppBottomPickTop', count: 3 }]
      }],
      note: 'จุติ: ดู 3 ใบล่างสุดเด็คศัตรู เลือก 1 ใบขึ้นบนสุด ที่เหลือเรียงเดิม'
    },
    'PRE0-002': {
      code: 'PRE0-002',
      name: 'ผู้เล่นภักดี',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'oppHandToDeckTop', random: true }]
      }],
      note: 'จุติ: สุ่มการ์ดมือศัตรู 1 ใบวางบนสุดเด็คศัตรู'
    },
    'PRE0-003': {
      code: 'PRE0-003',
      name: 'ผู้เล่นเหลี่ยม',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'revealOppHand' }]
      }],
      note: 'จุติ: ดูการ์ดบนมือฝ่ายตรงข้ามทั้งหมด'
    },
    'PRE0-005-2': {
      code: 'PRE0-005-2',
      name: 'ผู้เล่นโซเชียล',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'pick',
          from: 'enemy',
          dest: 'magic',
          filter: { type: 'Avatar', powerLtSrc: true }
        }]
      }],
      note: 'จุติ: เลือก Avatar ศัตรูที่ POWER น้อยกว่าใบนี้ มา Magic Zone ฝ่ายเรา'
    },
    'PRE0-004': {
      code: 'PRE0-004',
      name: 'ผู้เล่นจำไม',
      parseStatus: 'manual',
      abilities: [],
      note: 'อัญเชิญได้เฉพาะทิ้ง GEM 1 จำนวน 5 ใบ + จุติถามจำนวน Avatar/Magic/Only ในเด็คศัตรู — กลไกใหม่หลายทาง'
    },
    'PRE0-001-2': {
      code: 'PRE0-001-2',
      name: 'น้ำใจ',
      parseStatus: 'auto',
      abilities: [{
        trigger: { on: 'static', if: 'self.attached' },
        actions: [{
          op: 'modifyPower',
          amount: 0,
          duration: 'whileEquipped',
          layer: 2,
          target: { select: 'equippedAvatar' }
        }]
      }],
      note: 'Avatar ที่สวมใส่ POWER +0'
    },
    'PRE0-005': {
      code: 'PRE0-005',
      name: 'ผู้เล่นมั่ว',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [{
          op: 'modifyPower',
          amountPer: 'ownHellDistinctAvatarsMin',
          min: 10,
          amount: 2,
          layer: 3,
          target: { select: 'self' }
        }]
      }],
      note: 'ต่อเนื่อง: นรกเรามี Avatar ชื่อไม่ซ้ำ ≥10 → POWER +2'
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
