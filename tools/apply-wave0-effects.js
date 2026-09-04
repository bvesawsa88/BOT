/* คลื่น 0 — ปิดรูชุดที่เกือบครบ: persist meta + ใบที่รีใช้ op เดิม */
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
  else fileCards[i] = entry;
}

const BY_SET = {
  'effects-bt03.json': {
    'BT03-009': {
      code: 'BT03-009',
      name: 'จีสัส',
      abilities: [],
      attackIf: 'emptyHand',
      parseStatus: 'auto',
      note: 'โจมตีได้เมื่อมือว่าง'
    },
    'BT03-028': {
      code: 'BT03-028',
      name: 'ราชาอาณาจักรของแพง  พระเจ้านิโคไล',
      abilities: [],
      combatImmuneVsLowerCost: true,
      parseStatus: 'auto'
    },
    'BT03-029': {
      code: 'BT03-029',
      name: 'ทหารอาณาจักรของแพง',
      abilities: [],
      enemyCostAura: -1,
      setPowerIfAllyNameIncludes: 'ราชาอาณาจักรของแพง',
      setPowerTo: 2,
      parseStatus: 'auto'
    },
    'BT03-054': {
      code: 'BT03-054',
      name: 'ขวานไม้เน่าๆเหม็นๆ',
      abilities: [],
      hostCostDelta: -1,
      parseStatus: 'auto'
    }
  },
  'effects-bt04.json': {
    'BT04-003': {
      code: 'BT04-003',
      name: 'ไอ้นัท - คนใจเด็ด',
      abilities: [],
      controlImmune: true,
      controlImmuneExcept: 'อีช่า',
      parseStatus: 'auto'
    },
    'BT04-011': {
      code: 'BT04-011',
      name: 'เทอราโนดอน จากต่างแดน',
      abilities: [],
      scoutBonusOwnKapom: 1,
      parseStatus: 'auto',
      note: 'กะปอมฝ่ายเราสอดแนม +1'
    },
    'BT04-055': {
      code: 'BT04-055',
      name: 'ดาบพิฆาตสวรรค์ ราคา 4000 เหรียญทอง',
      abilities: [],
      hostCostDelta: 2,
      hostPowerIfEffCostMin: { min: 6, amount: 1 },
      parseStatus: 'auto'
    }
  },
  'effects-bt06.json': {
    'BT06-003': {
      code: 'BT06-003',
      name: 'เอรา นาคเกล็ดเขียว',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'modifyPower',
          amount: 2,
          until: 'permanent',
          target: {
            select: 'choose',
            side: 'own',
            type: 'Avatar',
            nameIncludes: ['นาค']
          }
        }]
      }],
      note: 'จุติเลือกนาค สัตว์วิเศษ ฝ่ายเรา POWER +2 ถาวร'
    }
  },
  'effects-sd06.json': {
    'SD06-019': {
      code: 'SD06-019',
      name: 'วัดคู่บ้านคู่เมือง',
      abilities: [],
      scoutBonusConstruct: 2,
      parseStatus: 'auto',
      note: 'Construct ฝ่ายเราสอดแนม +2'
    }
  },
  'effects-bt08.json': {
    'BT08-020': {
      code: 'BT08-020',
      name: 'เตียวเลี้ยว ขุนพลมือปราบแห่งวุยก๊ก',
      extraColors: ['ม่วง'],
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'scout',
          count: 5,
          filter: {
            type: 'Avatar',
            nameIncludes: ['ขุนพล'],
            symbol: 'ต่างชาติ',
            sameColorAsSrc: true
          },
          dest: 'hand',
          restTo: 'bottom',
          shuffleAfter: true
        }]
      }],
      note: 'ถือว่าเป็นสีม่วง · จุติสอดแนมขุนพล ต่างชาติ สีเดียวกัน'
    }
  },
  'effects-sd07.json': {
    'SD07-003': {
      code: 'SD07-003',
      name: 'แฮหัวตุ้น ขุนพลตาเดียวแห่งวุยก๊ก',
      abilities: [],
      parseStatus: 'auto',
      destroyAnyOnSummonedByAvatarNameIncludes: 'ขุนพล',
      destroyAnyOnSummonedByAvatarSymbol: 'ต่างชาติ',
      note: 'ถูกอัญเชิญโดยขุนพล ต่างชาติ → ทำลายการ์ดบนสนาม 1 ใบ'
    }
  },
  'effects-sl02.json': {
    'SL02-004': {
      code: 'SL02-004',
      name: 'เตียวเลี้ยว ขุนพลมือปราบแห่งวุยก๊ก',
      extraColors: ['ม่วง'],
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'scout',
          count: 5,
          filter: {
            type: 'Avatar',
            nameIncludes: ['ขุนพล'],
            symbol: 'ต่างชาติ',
            sameColorAsSrc: true
          },
          dest: 'hand',
          restTo: 'bottom',
          shuffleAfter: true
        }]
      }],
      note: 'ถือว่าเป็นสีม่วง · จุติสอดแนมขุนพล ต่างชาติ สีเดียวกัน'
    },
    'BT06-003': {
      code: 'BT06-003',
      name: 'เอรา นาคเกล็ดเขียว',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'modifyPower',
          amount: 2,
          until: 'permanent',
          target: {
            select: 'choose',
            side: 'own',
            type: 'Avatar',
            nameIncludes: ['นาค'],
            symbol: 'สัตว์วิเศษ'
          }
        }]
      }]
    },
    'SL02-009': {
      code: 'SL02-009',
      name: 'เอรา นาคเกล็ดเขียว',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'modifyPower',
          amount: 2,
          until: 'permanent',
          target: {
            select: 'choose',
            side: 'own',
            type: 'Avatar',
            nameIncludes: ['นาค'],
            symbol: 'สัตว์วิเศษ'
          }
        }]
      }]
    },
    'SL02-002': {
      code: 'SL02-002',
      name: 'ครุฑเวนไตย เจ้ากำลัง',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        actions: [{
          op: 'hellPick',
          filter: {
            nameIncludesAny: ['ครุฑ', 'ขนมณี'],
            nameNotIncludes: 'ครุฑเวนไตย'
          },
          dest: 'deck',
          shuffleAfter: true,
          optional: true,
          then: [{ op: 'modifyPower', amount: 3, target: { select: 'self' } }]
        }]
      }]
    },
    'SL02-008': {
      code: 'SL02-008',
      name: 'พลังแฝง',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'React',
        trigger: { on: 'ownAvatarFights' },
        actions: [{
          op: 'modifyPower',
          amount: 2,
          target: { select: 'combatOwn' }
        }]
      }],
      note: 'เมื่อ Avatar ฝ่ายเราต่อสู้ (โจมตีหรือถูกโจมตี) POWER +2 จนจบเทิร์น'
    },
    'SL02-010': {
      code: 'SL02-010',
      name: 'อนันต์ ราชาแห่งนาค',
      parseStatus: 'auto',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          oncePerTurn: true,
          actions: [{
            op: 'setAlliesPowerToSelf',
            filter: { type: 'Avatar', nameIncludes: ['นาค'], symbol: 'สัตว์วิเศษ' }
          }]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'battleDestroy' },
          actions: [{ op: 'revealOppLifeTop' }]
        }
      ]
    },
    'SL02-001': {
      code: 'SL02-001',
      name: 'อนันตวดี ราชินีแห่งนาค',
      parseStatus: 'auto',
      costOnlyForSymbol: 'สัตว์วิเศษ',
      gemAsCostForNameIncludes: 'อนันต์ ราชาแห่งนาค',
      gemAsCostValue: 6,
      gemAsCostColor: 'แดง',
      abilities: [{
        trigger: { on: 'paidAsCost', if: 'summonNameIncludes:นาค&summonSymbol:สัตว์วิเศษ' },
        actions: [{ op: 'modifyPower', amount: 3, target: { select: 'summoned' } }]
      }],
      note: 'จ่ายได้เฉพาะสัตว์วิเศษ · จ่ายอัญเชิญอนันต์ = GEM 6 แดง · นาคที่ได้ +3'
    }
  },
  'effects-fpro.json': {
    'FPRO-004': {
      code: 'FPRO-004',
      name: 'พระอิศวร เทพผู้ทำลาย',
      parseStatus: 'auto',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'chooseDestroy',
            filter: {},
            zones: ['avatar', 'magic', 'construct', 'land'],
            optional: true
          }]
        },
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          oncePerTurn: true,
          actions: [{
            op: 'chooseDestroy',
            filter: {},
            zones: ['avatar', 'magic', 'construct', 'land'],
            optional: true
          }]
        }
      ]
    },
    'FPRO-006': {
      code: 'FPRO-006',
      name: 'พญายักษ์ ทศกัณฐ์',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        cost: [{ op: 'discard', count: 1 }],
        actions: [{
          op: 'deckPick',
          filter: {
            type: 'Avatar',
            symbol: 'ยักษ์',
            power: 3,
            nameNotIncludes: 'ทศกัณฐ์'
          },
          dest: 'avatar',
          paidCost: false,
          shuffleAfter: true
        }]
      }]
    },
    'FPRO-003': {
      code: 'FPRO-003',
      name: 'พี่หน่วง พิธีกรผมสวย',
      parseStatus: 'auto',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'deckOrHellPick',
            filter: { nameIncludes: ['ยานรายการ เถียงทันหน่วง'] },
            dest: 'hand',
            shuffleAfterIfFromDeck: true
          }]
        },
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          oncePerTurn: true,
          requireOwnConstructNameIncludes: 'ยานรายการ เถียงทันหน่วง',
          cost: [{ op: 'discard', count: 1 }],
          actions: [{
            op: 'pick',
            from: 'enemy',
            dest: 'magic',
            filter: { hasKeywordAny: ['สามัคคี', 'เตะไข่', 'โล่มนุษย์', 'คำสั่งเสีย'] }
          }]
        },
        {
          keyword: 'คำสั่งเสีย',
          trigger: { on: 'destroyed' },
          actions: [{
            op: 'pick',
            from: 'ownerMagic',
            dest: 'bounceHand',
            chooser: 'opp',
            filter: { type: 'Avatar' }
          }]
        }
      ]
    }
  },
  'effects-kd00.json': {
    'KD00-00A': {
      code: 'KD00-00A',
      name: 'อะไรวะ !',
      parseStatus: 'auto',
      abilities: [{
        keyword: 'React',
        trigger: { on: 'ownAvatarLeftField' },
        actions: [
          { op: 'bothReshuffleHandDraw', count: 4 },
          { op: 'fewestHandAvatarsRevealLife', count: 2 }
        ]
      }],
      note: 'เมื่อ Avatar ฝ่ายเราออกจากสนาม — ทั้งคู่คืนมือสับ จั่ว 4 แล้วคนที่มี Avatar ในมือน้อยสุดหงาย LIFE 2'
    },
    'KD00-00D': {
      code: 'KD00-00D',
      name: 'ขอมือเธอหน่อย~',
      parseStatus: 'auto',
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{ op: 'partyMostHandDiscardThenDrawToMax', discard: 2 }]
      }],
      note: 'ผู้เล่นมือเยอะสุดทิ้ง 2 ใบ แล้วทุกคนจั่วให้เท่ามือมากสุด'
    },
    'KD00-00C': {
      code: 'KD00-00C',
      name: 'โอน้อยออกแห่งโชคชะตา',
      parseStatus: 'auto',
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{ op: 'rpsRevealLoserLife', count: 1 }]
      }],
      note: '2 คนข้ามโอน้อยออก — เป่ายิ้งฉุบ ผู้แพ้หงาย LIFE บนสุด ถ้าสาหัสแล้วแพ้เกม'
    },
    'KD00-00B': {
      code: 'KD00-00B',
      name: 'เบียดเบียนผู้อื่น',
      abilities: [],
      parseStatus: 'manual',
      note: 'สุ่มหยิบมือซ้ายแล้วเทียบ Cost / เนรเทศ / คืนมืด / ทิ้งพร้อมกัน — กิ่งปาร์ตี้ซับซ้อน เล่นมือ'
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
