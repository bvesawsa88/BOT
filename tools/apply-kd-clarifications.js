/* Apply KD clarifications → update effects-kd01..04 + merge into effects-all.json */
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

const KD01 = {
  'KD01-001': {
    code: 'KD01-001', name: 'พระนารายณ์ เทพผดุงธรรม',
    abilities: [{
      trigger: { on: 'handAfterBattleDestroy', if: 'killerNameIncludes:พระนารายณ์' },
      oncePerTurnByName: 'ร่างอวตารพระนารายณ์',
      actions: [
        { op: 'naraiFormSummon', sacrificeNameIncludes: 'พระนารายณ์', then: [
          { op: 'scoutNaraiExile', count: 2 }
        ]}
      ]
    }],
    parseStatus: 'manual'
  },
  'KD01-002': {
    code: 'KD01-002', name: 'ร่างอวตารพระนารายณ์ - นรสิง',
    abilities: [{
      trigger: { on: 'handAfterBattleDestroy', if: 'killerNameIncludes:พระนารายณ์' },
      oncePerTurnByName: 'ร่างอวตารพระนารายณ์ - นรสิง',
      actions: [
        { op: 'naraiFormSummon', sacrificeNameIncludes: 'พระนารายณ์', then: [
          // ทำลายศัตรู Cost≤4 สำเร็จเท่านั้น → นัดเปลี่ยนร่างตอนจบเทิร์น (ข้าม/ไม่มีเป้า = ไม่เปลี่ยนร่าง)
          { op: 'destroy', target: { select: 'choose', type: 'Avatar', side: 'enemy', costMax: 4, count: 1 }, optional: true,
            then: [{ op: 'schedule', when: 'ownEndPhase', actions: [{ op: 'replaceSelfWithHellNarai' }] }] }
        ]}
      ]
    }],
    parseStatus: 'manual'
  },
  'KD01-003': {
    code: 'KD01-003', name: 'ร่างอวตารพระนารายณ์ - เกษียรสมุทร',
    abilities: [{
      trigger: { on: 'handAfterBattleDestroy', if: 'killerNameIncludes:พระนารายณ์' },
      oncePerTurnByName: 'ร่างอวตารพระนารายณ์ - เกษียรสมุทร',
      actions: [
        { op: 'naraiFormSummon', sacrificeNameIncludes: 'พระนารายณ์', then: [
          { op: 'untap', from: 'own', filter: { symbol: 'เทพ', requireTapped: true }, optional: true },
          { op: 'schedule', when: 'ownEndPhase', actions: [
            { op: 'replaceSelfWithHellNarai' }
          ]}
        ]}
      ]
    }],
    parseStatus: 'manual'
  },
  'KD01-005': {
    code: 'KD01-005', name: 'พระนารายณ์ เทพผู้พิทักษ์',
    keywords: ['โล่มนุษย์', 'เตะไข่'],
    abilities: [],
    halvePrintedInsteadDestroy: true,
    parseStatus: 'manual'
  },
  'KD01-009': {
    code: 'KD01-009', name: 'นางอัปสร',
    abilities: [{
      trigger: { on: 'declareAttack' },
      actions: [{ op: 'blockReactUntilCombatEnd' }]
    }],
    nameAliases: ['พระนารายณ์'],
    parseStatus: 'manual',
    note: 'อัตโนมัติ เมื่อโจมตี: บล็อก React · #นับเป็นชื่อ พระนารายณ์'
  },
  'KD01-007': {
    code: 'KD01-007', name: 'พระอินทร์ เทพขยัน',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'scout', count: 3,
        filter: { symbol: 'เทพ' },
        dest: 'hand', restTo: 'bottom'
      }]
    }],
    parseStatus: 'auto'
  },
  'KD01-020': {
    code: 'KD01-020', name: 'แอสการ์ดคือสถานที่ไม่ใช่ผู้คน',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      cost: { op: 'discard', count: 1 },
      actions: [{
        op: 'takeControl',
        filter: { type: 'Avatar', costMax: 3, requireTapped: true },
        until: 'endOfTurn', keepTapped: true
      }]
    }],
    forceAllAvatarSymbol: 'เทพ',
    parseStatus: 'manual'
  }
};

const KD02 = {
  'KD02-001': {
    code: 'KD02-001', name: 'ปีศาจแห่งพันรเลือด เมฟิสโตเฟเลส',
    noPaidSummon: true,
    abilities: [
      {
        trigger: { on: 'activatedFromHand' },
        requireUniqueHellSymbolNames: { symbol: 'นรก', min: 7 },
        cost: { discardHand: 2 },
        actions: [{ op: 'summonSelfFromHandFree', noJuti: true }]
      },
      {
        trigger: { on: 'activated' },
        oncePerTurn: true,
        actions: [
          { op: 'mill', count: 5, who: 'self' },
          { op: 'destroyAllAvatarsExceptSelf' }
        ]
      }
    ],
    addToHandWhenScoutedByNameIncludes: 'สุวรรณ',
    parseStatus: 'manual'
  },
  'KD02-002': {
    code: 'KD02-002', name: 'ลิลิธ ปีศาจสาวตนแรก',
    nameAliases: ['นายนิรยบาล'],
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      requireUniqueHellSymbolNames: { symbol: 'นรก', min: 4 },
      cost: { exileHell: 2 },
      actions: [{ op: 'hellPick', filter: { symbol: 'นรก' }, dest: 'hand' }]
    }],
    parseStatus: 'manual'
  },
  'KD02-007': {
    code: 'KD02-007', name: 'นายนิรยบาล แว่น',
    noHandSummon: true,
    abilities: [{
      trigger: { on: 'milled' },
      actions: [{ op: 'offerSummonSelfFromHell', optional: true }]
    }],
    parseStatus: 'manual'
  },
  'KD02-008': {
    code: 'KD02-008', name: 'นายนิรยบาล อ้วน',
    millBonusExtra: 2,
    millBonusExceptSelf: true,
    abilities: [],
    parseStatus: 'manual'
  },
  'KD02-014': {
    code: 'KD02-014', name: 'สัญญาเลือด',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [
        { op: 'mill', count: 3, who: 'self' },
        { op: 'drawHellUnique', symbol: 'นรก', threshold: 5, countBelow: 1, countAtLeast: 2 }
      ]
    }],
    milledOptional: {
      actions: [
        { op: 'exileSelf' },
        { op: 'hellPick', filter: { nameIncludes: ['นายนิรยบาล'] }, dest: 'avatar', paidCost: false }
      ]
    },
    parseStatus: 'manual'
  },
  'KD02-020': {
    code: 'KD02-020', name: 'ประตูนรก',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      cost: { discardHandFilter: { type: 'Avatar', symbol: 'นรก' } },
      actions: [{
        op: 'hellPick',
        filter: { nameIncludes: ['นายนิรยบาล'], costMax: 4 },
        dest: 'avatar', paidCost: false
      }]
    }],
    parseStatus: 'manual'
  }
};

const KD03 = {
  'KD03-002': {
    code: 'KD03-002', name: 'โอตะคูลา',
    costOnlyForNameIncludes: 'ไอดอล',
    abilities: [
      {
        trigger: { on: 'chooseMode' },
        oncePerTurn: true,
        options: [
          {
            label: 'สวมใส่ให้ไอดอล/บีมมิ',
            actions: [{ op: 'attach', from: 'self', targetFilter: { nameIncludesAny: ['ไอดอล', 'บีมมิ'] } }]
          },
          {
            label: 'อัญเชิญจากสภาพสวมใส่',
            actions: [{ op: 'detachSummonSelf' }]
          }
        ]
      },
      {
        trigger: { on: 'static', if: 'self.attached' },
        actions: [
          { op: 'modifyPower', amount: 1, target: { select: 'equippedAvatar' }, ifHostNameIncludes: 'ไอดอล' },
          { op: 'modifyPower', amount: 2, target: { select: 'equippedAvatar' }, ifHostNameIncludes: 'บีมมิ' }
        ]
      },
      {
        trigger: { on: 'activated' },
        cost: { exileSelf: true, discardHand: 1 },
        actions: [{ op: 'deckPick', filter: { nameIncludes: ['บีมมิ'], type: 'Avatar' }, dest: 'hand', shuffleAfter: true }]
      }
    ],
    parseStatus: 'manual'
  },
  'KD03-006': {
    code: 'KD03-006', name: 'มยุราซัง  ไอดอลยุค 80',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      actions: [{ op: 'attachOtaToIdol', allowDeckIfNameIncludes: 'ทัตดนัยซัง' }]
    }],
    parseStatus: 'manual'
  },
  'KD03-011': {
    code: 'KD03-011', name: 'แมลงปอแจ็ค',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'replaceLandFromDeck' }]
    }],
    parseStatus: 'manual'
  },
  'KD03-020': {
    code: 'KD03-020', name: 'เวทีแห่งความฝัน',
    abilities: [{
      trigger: { on: 'chooseMode' },
      oncePerTurn: true,
      cost: { discardHand: 1 },
      options: [
        {
          label: 'สอดแนม 5 — สวมโอตะสูงสุด 2 ให้ไอดอล',
          actions: [{ op: 'scoutAttachOta', scout: 5, maxOta: 2 }]
        },
        {
          label: 'สอดแนม 7 — ไอดอลขึ้นมือ',
          actions: [{ op: 'scout', count: 7, filter: { type: 'Avatar', nameIncludes: ['ไอดอล'] }, dest: 'hand', shuffleAfter: true }]
        }
      ]
    }],
    parseStatus: 'manual'
  }
};

const KD04 = {
  'KD04-001': {
    code: 'KD04-001', name: 'ราชันย์หุ่นนักรบผู้กล้า : คริติคอล ไมเกรน',
    controlImmune: true,
    abilities: [{
      trigger: { on: 'chooseMode' },
      oncePerTurn: true,
      cost: { exileHellDistinctNames: { nameIncludes: 'ไมเกรน', count: 3 } },
      options: [
        {
          label: 'สวมอาวุธจากนรกสูงสุด 2',
          actions: [{ op: 'hellAttachMods', nameIncludes: 'อาวุธหุ่นนักรบผู้กล้า', max: 2, toSelf: true }]
        },
        {
          label: 'ฆ่าแล้วโจมตี LIFE 1 ครั้ง จนจบเทิร์น',
          actions: [{ op: 'grantBattleDestroyLifeHit', until: 'endOfTurn' }]
        }
      ]
    }],
    parseStatus: 'manual'
  },
  'KD04-002': {
    code: 'KD04-002', name: 'ด็อกเตอร์ เพน',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'scout', count: 5, filter: { nameIncludes: ['ไมเกรน'], type: 'Avatar' }, dest: 'hand', shuffleAfter: true }]
      },
      {
        trigger: { on: 'activated' },
        oncePerTurn: true,
        cost: { discardHand: 1 },
        actions: [{ op: 'hellPick', filter: { nameIncludes: ['อาวุธหุ่นนักรบผู้กล้า'], subtype: 'Modification' }, dest: 'hand' }]
      }
    ],
    parseStatus: 'manual'
  },
  'KD04-004': {
    code: 'KD04-004', name: 'หุ่นนักรบผู้กล้า : โปรโตไมเกรน',
    abilities: [{
      trigger: { on: 'battleDestroy' },
      actions: [{ op: 'evolveToMigraineKeepAttach' }]
    }],
    parseStatus: 'manual'
  },
  'KD04-006': {
    code: 'KD04-006', name: 'อากาศยานผู้กล้า : แอร์ซิด รีฟลักซ์',
    protectReplaceForNameIncludes: 'หุ่นนักรบผู้กล้า : ไมเกรน',
    abilities: [],
    parseStatus: 'auto'
  },
  'KD04-009': {
    code: 'KD04-009', name: 'คนรวย',
    abilities: [{
      trigger: { on: 'enemyActivateAbility' },
      oncePerTurn: true,
      countsAsReact: true,
      actions: [{ op: 'negateByGiveHand' }]
    }],
    parseStatus: 'manual'
  },
  'KD04-010': {
    code: 'KD04-010', name: 'ลูกคนรวย',
    abilities: [{
      trigger: { on: 'enemyActivateAbility' },
      oncePerTurn: true,
      countsAsReact: true,
      actions: [{ op: 'negateByGiveHand' }]
    }],
    parseStatus: 'manual'
  },
  'KD04-012': {
    code: 'KD04-012', name: 'สุดยอดท่าไม้ตายผู้กล้า THE END',
    abilities: [
      {
        trigger: { on: 'playMagic' },
        actions: [{ op: 'grantAttackAllEnemy', filter: { nameIncludes: ['ไมเกรน'] }, until: 'endOfTurn' }]
      },
      {
        trigger: { on: 'activatedFromHell' },
        cost: { exileSelf: true },
        actions: [{ op: 'hellAttachAllDistinctWeaponMods', toNameIncludes: 'ไมเกรน' }]
      }
    ],
    addToHandWhenMilledOrScoutedByNameIncludes: 'ไมเกรน',
    parseStatus: 'manual'
  },
  'KD04-014': {
    code: 'KD04-014', name: 'อาวุธนักรบผู้กล้า " ไบโพล่า ชิลด์ "',
    attachOnly: { nameIncludes: 'ผู้กล้า', symbol: 'หุ่นยนต์' },
    protectLeaveDiceEven: true,
    abilities: [],
    parseStatus: 'auto'
  },
  'KD04-015': {
    code: 'KD04-015', name: 'อาวุธหุ่นนักรบผู้กล้า "GHD โคลค"',
    attachOnly: { symbol: 'หุ่นยนต์' },
    hostSymbolLock: true,
    abilities: [],
    parseStatus: 'auto'
  },
  'KD04-016': {
    code: 'KD04-016', name: 'ฐานหุ่นนักรบผู้กล้า ซีทันยาน',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      requireNoModUsed: true,
      actions: [{ op: 'allowExtraWeaponMod', count: 2 }]
    }],
    parseStatus: 'manual'
  },
  'KD04-017': {
    code: 'KD04-017', name: 'Micro Plaza สะพานพลาสติก',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      phase: 'Main',
      cost: { discardHand: 1 },
      actions: [{ op: 'deckPick', filter: { subtype: 'Modification' }, dest: 'hand', shuffleAfter: true }]
    }],
    parseStatus: 'manual'
  }
};

const packs = [
  ['effects-kd01.json', KD01],
  ['effects-kd02.json', KD02],
  ['effects-kd03.json', KD03],
  ['effects-kd04.json', KD04]
];

for (const [fname, map] of packs) {
  const j = load(fname);
  Object.values(map).forEach(e => upsert(j.cards, e));
  save(fname, j);
  console.log('updated', fname, Object.keys(map).join(', '));
}

// rebuild effects-all from set files (keep order)
const sets = ['sd01','sd02','sd03','sd04','sd05','sd06','sd07','sd08','kd01','kd02','kd03','kd04','bt01','bt02','bt03','bt04','bt05','bt06','bt07','bt08','bt09','bt10','bt11'];
const seen = new Set();
const merged = [];
for (const s of sets) {
  const p = path.join(ROOT, `data/effects-${s}.json`);
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const c of (j.cards || [])) {
    if (seen.has(c.code)) {
      // later KD/BT shouldn't override if already present — but we want KD updates: allow overwrite for KD
      if (/^KD0/.test(c.code)) {
        const idx = merged.findIndex(x => x.code === c.code);
        if (idx >= 0) merged[idx] = c;
      }
      continue;
    }
    seen.add(c.code);
    merged.push(c);
  }
}
fs.writeFileSync(path.join(ROOT, 'data/effects-all.json'), JSON.stringify({ cards: merged }));
console.log('effects-all', merged.length);
