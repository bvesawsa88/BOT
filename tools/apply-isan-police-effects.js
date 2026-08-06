/* ตำรวจภาคอีสาน — เติม effects ให้เล่นออโต้ได้ + rebuild effects-all.json */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
}
function save(name, j) {
  fs.writeFileSync(path.join(ROOT, 'data', name), JSON.stringify(j, null, 2));
}
function upsert(fileCards, entry) {
  const i = fileCards.findIndex(c => c.code === entry.code);
  if (i < 0) fileCards.push(entry);
  else fileCards[i] = Object.assign({}, fileCards[i], entry);
}

const guessHitMill = [{ op: 'millScouted' }];
const guessMissKeep = []; // ใบบนสุดอยู่เดิม

const BY_SET = {
  'effects-bt07.json': {
    'BT07-008': {
      code: 'BT07-008', name: 'ตำรวจไซบอร์ค จ่านิ่ง',
      abilities: [{
        trigger: { on: 'activated' }, oncePerTurn: true,
        actions: [
          { op: 'draw', count: 1, player: 'opp' },
          { op: 'oppHandToDeckTop' }
        ]
      }],
      parseStatus: 'manual',
      note: 'ศัตรูจั่ว 1 → เลือกใบจากมือศัตรูวางบนสุดเด็ค'
    },
    'BT07-034': {
      code: 'BT07-034', name: 'ตำรวจนอกเครื่องแบบ ไซเฮย์',
      abilities: [{
        trigger: { on: 'activatedFromHand' }, oncePerTurn: true,
        actions: [{
          op: 'guessOppTopType',
          onHit: [
            { op: 'summonSelfFromHandFree', noJuti: true },
            { op: 'millScouted' }
          ],
          onMiss: [
            { op: 'discardSelfFromHand' }
          ]
        }]
      }],
      parseStatus: 'manual'
    }
  },
  'effects-bt08.json': {
    'BT08-024': {
      code: 'BT08-024', name: 'อีสานสลิงเกอร์ ปิ๊ก',
      keywords: ['ลูกฮึด'],
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          { op: 'mill', count: 3, who: 'self' },
          {
            op: 'deckOrHellPick',
            filter: { exactName: 'โคกอีสานนูน' },
            dest: 'hand',
            shuffleAfterIfFromDeck: true
          }
        ]
      }],
      parseStatus: 'manual',
      note: 'จุติ: ธรณีสูบ 3 ก่อน แล้วเลือกโคกอีสานนูนจากเด็ค/นรกขึ้นมือ'
    },
    'BT08-026': {
      code: 'BT08-026', name: 'อีสานสลิงเกอร์ เปอร์',
      abilities: [
        {
          trigger: { on: 'activated' }, oncePerTurn: true,
          requireLandNameIncludes: 'โคกอีสานนูน',
          actions: [
            { op: 'mill', count: 3, who: 'self' },
            {
              op: 'modifyPower', amount: 2, duration: 'endOfTurn', layer: 4,
              target: { select: 'self' }
            }
          ]
        },
        {
          trigger: { on: 'battleDestroy' },
          requireLandNameIncludes: 'โคกอีสานนูน',
          requireMainPhase: true,
          actions: [{ op: 'revealOppLifeTop', count: 1 }]
        }
      ],
      parseStatus: 'manual'
    },
    'BT08-065': {
      code: 'BT08-065', name: 'โคกอีสานนูน',
      stayOnMagic: true,
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{
          op: 'chooseMode',
          options: [
            {
              label: 'เทค 1: คืนนรก 6 ใบ (Magic≤2) → จั่ว 1',
              oncePerTurn: true,
              oncePerTurnTag: 'kok1',
              requireOwnNameIncludes: 'อีสานสลิงเกอร์',
              actions: [{
                op: 'hellPickMulti',
                countMax: 6,
                magicMax: 2,
                thenDraw: 1,
                trackHellReturn: true,
                requireOwnNameIncludes: 'อีสานสลิงเกอร์',
                filter: {}
              }]
            },
            {
              label: 'เทค 2: ดวลอีสานสลิงเกอร์ (ต้องคืนนรก≥6 ในเทิร์นนี้ก่อน)',
              oncePerTurn: true,
              oncePerTurnTag: 'kok2',
              requireHellReturnedThisTurnMin: 6,
              actions: [{
                op: 'forceDuelNoTap',
                ownNameIncludes: 'อีสานสลิงเกอร์',
                blockReact: true,
                requireHellReturnedThisTurnMin: 6
              }]
            }
          ]
        }]
      }],
      parseStatus: 'manual',
      note: 'เทค1 คืนนรก6 จั่ว1 · เทค2 ดวลได้หลังคืน≥6 ในเทิร์น (สั่งใช้แยกเทิร์นละครั้งต่อเทค)'
    }
  },
  'effects-bt09.json': {
    'BT09-026': {
      code: 'BT09-026', name: 'แมวดำ สมาชิกลัทธิแห่หัว',
      abilities: [{
        trigger: { on: 'activated' }, oncePerTurn: true,
        actions: [{ op: 'mill', count: 1, who: 'opp' }]
      }],
      parseStatus: 'manual',
      note: 'โหมดพี่โปจิ (เนรเทศใบบนสุดนรกศัตรู) ยังไม่ครอบ — ใช้ธรณีสูบอย่างเดียว'
    },
    'BT09-057': {
      code: 'BT09-057', name: 'ไต้ฝุ่น',
      reactAnyWindow: true,
      abilities: [{
        trigger: { on: 'chooseMode' },
        options: [
          {
            label: 'ทำลาย Magic Zone ศัตรู 1 ใบ',
            actions: [{ op: 'chooseDestroy', zones: ['magic'], side: 'enemy', filter: {}, optional: false }]
          },
          {
            label: 'ทำลาย Land Magic 1 ใบ',
            actions: [{ op: 'chooseDestroy', zones: ['land'], filter: {}, optional: false }]
          }
        ]
      }],
      parseStatus: 'manual'
    }
  },
  'effects-bt10.json': {
    'BT10-007': {
      code: 'BT10-007', name: 'ตำรวจเอไอ มุเค',
      abilities: [{
        trigger: { on: 'activated' }, oncePerTurn: true,
        actions: [{
          op: 'guessOppTopType',
          onHit: [
            {
              op: 'modifyPower', amount: -2, duration: 'endOfTurn', layer: 4,
              target: { select: 'choose', type: 'Avatar', side: 'enemy', count: 1 }
            },
            { op: 'millScouted' }
          ],
          onMiss: [
            {
              op: 'modifyPower', amount: -2, duration: 'endOfTurn', layer: 4,
              target: { select: 'self' }
            }
          ]
        }]
      }],
      parseStatus: 'manual'
    },
    'BT10-034': {
      code: 'BT10-034', name: 'ตำรวจสัมภเวสี ทาย',
      abilities: [{
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'revealOwnHandNameIncludes',
          nameIncludes: 'ตำรวจ',
          required: true,
          then: [{ op: 'scoutOppPickHellOrTop', count: 2 }]
        }]
      }],
      parseStatus: 'manual'
    },
    'BT10-045': {
      code: 'BT10-045', name: 'นักข่าวสาว เดย์วัน',
      gemAsCostForNameIncludes: 'ตำรวจ',
      gemAsCostValue: 5,
      gemAsCostColor: 'ขาว',
      revealOppDeckTopIfOwnNameIncludes: 'ตำรวจ',
      cannotBeAttackTargetIf: { allyNameIncludes: 'ตำรวจ' },
      abilities: [{
        trigger: { on: 'paidAsCost', if: 'summonNameIncludes:ตำรวจ' },
        actions: [{ op: 'peekOppTopKeep' }]
      }],
      parseStatus: 'manual'
    }
  },
  'effects-cc01.json': {
    'CC01-014': {
      code: 'CC01-014', name: 'วูตาตู',
      hostSymbolReplace: 'ผี',
      reattachOnHostDestroy: true,
      abilities: [
        {
          trigger: { on: 'activated' }, oncePerTurn: true,
          actions: [{ op: 'attachSelfTo', filter: { type: 'Avatar' } }]
        },
        {
          trigger: { on: 'static', if: 'self.attached' },
          actions: [{
            op: 'modifyPower', amount: 3, duration: 'whileEquipped',
            target: { select: 'equippedAvatar' }
          }]
        }
      ],
      parseStatus: 'manual'
    },
    'CC01-048': {
      code: 'CC01-048', name: 'น้ำซุปชาบู',
      abilities: [
        {
          trigger: { on: 'static', if: 'self.attached' },
          actions: [{
            op: 'modifyPower', amount: 3, duration: 'whileEquipped',
            target: { select: 'equippedAvatar' }
          }]
        },
        {
          trigger: { on: 'declareAttack' },
          actions: [{ op: 'hostNoUntapUntilNextOwnEnd' }]
        }
      ],
      parseStatus: 'manual'
    }
  },
  'effects-sd01.json': {
    /* PRMO reprints resolve by name — ใส่รหัส PRMO ด้วยถ้าโหลดตรงรหัส */
  }
};

const PRMO = {
  'PRMO-079': {
    code: 'PRMO-079', name: 'ศาลพระภูมิ',
    cannotBeAttackTargetIfOwnSymbolOther: 'ผี',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'deckPick',
        filter: { type: 'Avatar', symbol: 'ผี' },
        dest: 'avatar', paidCost: false, shuffleAfter: true
      }]
    }],
    parseStatus: 'manual'
  },
  'PRMO-106': {
    code: 'PRMO-106', name: 'ตำรวจไฟแรง เอนโว่',
    abilities: [{
      trigger: { on: 'declareAttack', if: 'targetIsAvatar' },
      actions: [{
        op: 'guessOppTopType',
        onHit: [
          { op: 'destroyAttackTarget' },
          { op: 'millScouted' }
        ],
        onMiss: []
      }]
    }],
    parseStatus: 'manual'
  },
  'PRMO-108': {
    code: 'PRMO-108', name: 'อีสานสลิงเกอร์ ปิ๊ก',
    keywords: ['ลูกฮึด'],
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      actions: [
        { op: 'mill', count: 3, who: 'self' },
        {
          op: 'deckOrHellPick',
          filter: { exactName: 'โคกอีสานนูน' },
          dest: 'hand',
          shuffleAfterIfFromDeck: true
        }
      ]
    }],
    parseStatus: 'manual',
    note: 'จุติ: ธรณีสูบ 3 ก่อน แล้วเลือกโคกอีสานนูนจากเด็ค/นรกขึ้นมือ'
  },
  'PRMO-157': {
    code: 'PRMO-157', name: 'ไปเลยมอนตี้',
    abilities: [{
      trigger: { on: 'enemyDeclareAttack' },
      react: true,
      actions: [{
        op: 'weakenAttacker',
        per: 2,
        count: ['ownSide']
      }]
    }],
    parseStatus: 'manual'
  },
  'PRMO-003': {
    code: 'PRMO-003', name: 'อุบัติเหตุ!!!',
    abilities: [{
      trigger: { on: 'avatarSummoned', if: 'any' },
      react: true,
      actions: [{ op: 'destroy', target: { select: 'triggerSource' } }]
    }],
    parseStatus: 'verified',
    note: 'ซ้ำ SD01-017'
  }
};

const SL = {
  'SL02-006': {
    code: 'SL02-006', name: 'งี่เง่ากับงอแง',
    abilities: [{
      trigger: { on: 'activated' }, oncePerTurn: true,
      actions: [{
        op: 'chooseMode',
        options: [
          {
            label: 'เซ่นไหว้ตัวเอง — จั่ว 2',
            actions: [
              { op: 'sacrificeSelf' },
              { op: 'draw', count: 2 }
            ]
          },
          {
            label: 'ได้เตะไข่จนจบเทิร์น แล้วทำลายตัวเอง End Phase',
            actions: [
              { op: 'grantSelfKeyword', keyword: 'เตะไข่', until: 'endOfTurn' },
              { op: 'destroySelfAtEndPhase' }
            ]
          }
        ]
      }]
    }],
    parseStatus: 'manual'
  }
};

// apply per-set
for (const [file, map] of Object.entries(BY_SET)) {
  const j = load(file);
  for (const entry of Object.values(map)) upsert(j.cards, entry);
  save(file, j);
  console.log(file, Object.keys(map).length, 'updated');
}

// PRMO / SL — เก็บใน effects-bt08 (อีสาน) + effects-bt10 (ตำรวจ) / สร้างไฟล์ promo-sl แล้ว merge
{
  const j = load('effects-bt08.json');
  upsert(j.cards, PRMO['PRMO-108']);
  upsert(j.cards, PRMO['PRMO-079']);
  save('effects-bt08.json', j);
}
{
  const j = load('effects-bt10.json');
  upsert(j.cards, PRMO['PRMO-106']);
  upsert(j.cards, PRMO['PRMO-157']);
  upsert(j.cards, PRMO['PRMO-003']);
  upsert(j.cards, SL['SL02-006']);
  save('effects-bt10.json', j);
}

// rebuild effects-all (first wins)
const sets = ['sd01', 'sd02', 'sd03', 'sd04', 'sd05', 'sd06', 'sd07', 'sd08',
  'kd01', 'kd02', 'kd03', 'kd04',
  'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11',
  'cc01', 'cc02', 'sl01', 'sl02'];
const merged = [];
const seen = new Set();
for (const s of sets) {
  const p = path.join(ROOT, `data/effects-${s}.json`);
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const c of (j.cards || [])) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    merged.push(c);
  }
}
fs.writeFileSync(path.join(ROOT, 'data/effects-all.json'), JSON.stringify({ cards: merged }));
console.log('effects-all', merged.length, 'cards');

const check = ['BT07-008','BT07-034','BT08-024','BT08-026','BT08-065','BT09-057','BT10-007','BT10-034','BT10-045','CC01-014','CC01-048','PRMO-106','PRMO-108','PRMO-079','SL02-006'];
for (const code of check) {
  const c = merged.find(x => x.code === code);
  console.log(code, c ? `abil=${(c.abilities||[]).length} ${c.name||''}` : 'MISSING');
}
// หลังแก้ชุด — sync หมวด abilities + รีปริ้นชื่อเดียวกัน
try { require('child_process').execSync('node tools/rebuild-abilities.js', { cwd: ROOT, stdio: 'inherit' }); }
catch (e) { console.warn('rebuild-abilities failed', e.message); }
