/* Apply SD02–SD07 clarifications → update effects-sd02..07 + rebuild effects-all.json
   แบบเดียวกับ apply-kd-clarifications.js — เติม abilities ให้ชุดสตาร์ทเตอร์เล่นอัตโนมัติได้ */
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

const GHN = ['กุ่ย', 'ฮอล', 'นาย'];
const attachTank = { op: 'attachSelfTo', filter: { nameIncludes: ['รถถัง'] } };

const SD02 = {
  'SD02-001': {
    code: 'SD02-001', name: 'กุ่ย', keywords: ['สามัคคี'],
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'deckPick', filter: { type: 'Avatar', exactName: 'ฮอล' }, dest: 'hand', shuffleAfter: true }]
    }],
    parseStatus: 'manual'
  },
  'SD02-002': {
    code: 'SD02-002', name: 'ฮอล', keywords: ['สามัคคี'],
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'deckPick', filter: { type: 'Avatar', exactName: 'นาย' }, dest: 'hand', shuffleAfter: true }]
    }],
    parseStatus: 'manual'
  },
  'SD02-003': {
    code: 'SD02-003', name: 'นาย', keywords: ['สามัคคี'],
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'deckPick', filter: { type: 'Avatar', exactName: 'กุ่ย' }, dest: 'hand', shuffleAfter: true }]
    }],
    parseStatus: 'manual'
  },
  'SD02-005': {
    code: 'SD02-005', name: 'วีรบุรุษปากซอย',
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'hellPick', filter: { type: 'Avatar', nameIncludes: GHN }, dest: 'hand', multiMax: 3 }]
    }],
    parseStatus: 'manual'
  },
  'SD02-016': {
    code: 'SD02-016', name: 'ระเบิดVery Fat Man',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{
        op: 'sacrificeNamesOneEach', names: GHN,
        then: [{ op: 'destroyAllEnemyAvatars' }]
      }]
    }],
    parseStatus: 'manual'
  },
  'SD02-017': {
    code: 'SD02-017', name: 'ไม้เกาหลัง',
    keywords: ['เตะไข่'],
    abilities: [{
      trigger: { on: 'static', if: 'self.attached' },
      actions: [{ op: 'grantKeyword', keyword: 'เตะไข่', from: 'own', filter: { /* unused — grant via keywords on mod */ } }]
    }],
    parseStatus: 'manual',
    note: 'โฮสต์ได้เตะไข่ผ่าน hasKw จากใบสวม (keywords)'
  },
  'SD02-018': {
    code: 'SD02-018', name: 'บำเพ็ญประโยชน์',
    abilities: [{
      trigger: { on: 'activated' },
      cost: [{ op: 'discard', from: 'hand', count: 1, filter: { type: 'Avatar', nameIncludes: GHN } }],
      actions: [{ op: 'draw', count: 2 }]
    }],
    parseStatus: 'manual'
  },
  'SD02-019': {
    code: 'SD02-019', name: 'สละเพื่อนเพื่อช่วยเพื่อน',
    abilities: [{
      trigger: { on: 'activated' },
      react: true,
      actions: [{
        op: 'sacrificeHandOrField', nameIncludesAny: GHN,
        then: [{ op: 'bounce', from: 'any', filter: { type: 'Avatar' } }]
      }]
    }],
    parseStatus: 'manual'
  }
};

// ไม้เกาหลัง: ไม่ต้องมี grantKeyword action ว่าง — ใช้ keywords + hasKw fallback จากข้อความ
SD02['SD02-017'] = {
  code: 'SD02-017', name: 'ไม้เกาหลัง',
  keywords: ['เตะไข่'],
  abilities: [],
  parseStatus: 'manual'
};

const SD03 = {
  'SD03-001': {
    code: 'SD03-001', name: 'พญายม',
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'hellPick', filter: { type: 'Avatar', nameIncludes: ['นายนิรยบาล'] }, dest: 'avatar', paidCost: false }]
    }],
    parseStatus: 'manual'
  },
  'SD03-003': {
    code: 'SD03-003', name: 'นายนิรยบาล แว่น',
    noHandSummon: true,
    abilities: [{
      trigger: { on: 'milled' },
      actions: [{ op: 'offerSummonSelfFromHell', optional: true }]
    }],
    parseStatus: 'manual'
  },
  'SD03-004': {
    code: 'SD03-004', name: 'นายนิรยบาล อ้วน',
    millBonusExtra: 2,
    millBonusExceptSelf: true,
    abilities: [],
    parseStatus: 'manual'
  },
  'SD03-005': {
    code: 'SD03-005', name: 'สุวาน',
    abilities: [{
      trigger: { on: 'static', if: 'self.zone==avatarZone' },
      actions: [{
        op: 'modifyPower', amountPer: 'hellDistinctNameIncludes', nameIncludes: 'นายนิรยบาล', per: 1,
        layer: 3, target: { select: 'self' }
      }]
    }],
    parseStatus: 'manual'
  },
  'SD03-016': {
    code: 'SD03-016', name: 'กระทะทองแดง',
    abilities: [{
      trigger: { on: 'activated' },
      cost: [{ op: 'discard', from: 'hand', count: 1, filter: { type: 'Avatar', symbol: 'นรก' } }],
      actions: [
        { op: 'mill', count: 2, who: 'self' },
        { op: 'draw', count: 2 }
      ]
    }],
    parseStatus: 'manual'
  },
  'SD03-017': {
    code: 'SD03-017', name: 'บัญชีหนังหมา',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{
        op: 'deckPick',
        filter: { type: 'Avatar', nameIncludes: ['นายนิรยบาล'], costMax: 4 },
        dest: 'hand', shuffleAfter: true
      }]
    }],
    parseStatus: 'manual',
    note: 'ล็อกห้ามใช้ชื่อที่ค้นเป็น Cost — เล่นมือจนกว่าจะเติม flag ภายหลัง'
  }
};

const SD04 = {
  'SD04-001': {
    code: 'SD04-001', name: 'กัปตันแบงค์ Tank Ranger',
    abilities: [
      {
        keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'scout', count: 5,
          filter: { nameIncludes: ['จ่ามะนาว', 'จ่าแดงเดือด'] },
          dest: 'attachHost',
          attachHostFilter: { nameIncludes: ['รถถัง'] },
          restTo: 'bottom'
        }]
      },
      { trigger: { on: 'activated' }, oncePerTurn: true, actions: [attachTank] }
    ],
    parseStatus: 'manual'
  },
  'SD04-002': {
    code: 'SD04-002', name: 'จ่ามะนาว Tank Ranger',
    protectReplace: true,
    protectReplaceIfHostNameIncludes: 'รถถัง',
    abilities: [
      {
        keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
        requireOwnNameIncludes: 'รถถัง',
        actions: [{ op: 'unrevealOwnLife', count: 1 }]
      },
      { trigger: { on: 'activated' }, oncePerTurn: true, actions: [attachTank] }
    ],
    parseStatus: 'manual'
  },
  'SD04-003': {
    code: 'SD04-003', name: 'จ่าแดงเดือด Tank Ranger',
    abilities: [
      { trigger: { on: 'activated' }, oncePerTurn: true, actions: [attachTank] },
      {
        trigger: { on: 'static', if: 'self.attached' },
        actions: [{ op: 'modifyPower', amount: 1, duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
      },
      {
        trigger: { on: 'activated' },
        whenHostBattleDestroy: true,
        cost: [{ op: 'sacrificeSelf' }],
        actions: [{ op: 'untapHost' }],
        note: 'สั่งใช้เมื่อโฮสต์ฆ่าจากการต่อสู้ — ทำลายตัวเองแล้วโฮสต์ตื่น'
      }
    ],
    parseStatus: 'manual'
  },
  'SD04-004': {
    code: 'SD04-004', name: 'รถถัง "Tank Ranger"',
    cannotAttackUnlessAttached: true,
    uniqueAttachedNames: true,
    abilities: [],
    parseStatus: 'manual'
  },
  'SD04-005': {
    code: 'SD04-005', name: 'MEGA ROR.DOR',
    nameAliases: ['รถถัง'],
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'deckPick',
        filter: { type: 'Avatar', nameIncludes: ['Tank Ranger'] },
        dest: 'attachSelf', shuffleAfter: true
      }]
    }],
    parseStatus: 'manual'
  },
  'SD04-014': {
    code: 'SD04-014', name: 'รถถังลงถนน',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{
        op: 'bothDeckSummonCostMax', costMax: 5,
        ownFilter: { nameIncludes: ['รถถัง'] }
      }]
    }],
    parseStatus: 'manual'
  },
  'SD04-015': {
    code: 'SD04-015', name: 'ไอ นีด เมดิก',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{ op: 'unrevealOwnLife', count: 1 }]
    }],
    parseStatus: 'manual'
  },
  'SD04-016': {
    code: 'SD04-016', name: 'ใบดำใบแดง',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{
        op: 'scout', count: 1,
        filter: { type: 'Avatar', symbol: 'คน', costMax: 3 },
        dest: 'avatar', paidCost: false, restTo: 'bottom'
      }]
    }],
    parseStatus: 'manual'
  },
  'SD04-017': {
    code: 'SD04-017', name: 'เพื่อชาติ',
    abilities: [{
      trigger: { on: 'enemyDeclareAttack' },
      react: true,
      cost: [{ op: 'sacrifice', filter: { nameIncludes: ['รถถัง'] } }],
      actions: [{ op: 'destroyAllEnemyAvatars' }]
    }],
    parseStatus: 'manual'
  },
  'SD04-018': {
    code: 'SD04-018', name: 'ขึ้นมาเร็ว ไอ้ลูกลิง !!',
    abilities: [{
      trigger: { on: 'enemyDeclareAttack' },
      react: true,
      requireOwnNameIncludes: 'รถถัง',
      actions: [{
        op: 'scout', count: 5,
        filter: { type: 'Avatar', symbol: 'คน', nameIncludes: ['Tank Ranger'] },
        dest: 'attachHost',
        attachHostFilter: { nameIncludes: ['รถถัง'] },
        thenDestroyAttackerIfAttached: true,
        restTo: 'bottom'
      }]
    }],
    parseStatus: 'manual'
  },
  'SD04-020': {
    code: 'SD04-020', name: 'เขาชนไก่',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      phase: 'Main',
      actions: [
        { op: 'tap', from: 'own', filter: { type: 'Avatar', symbol: 'คน' } },
        { op: 'scoutOneTopOrHell' }
      ]
    }],
    parseStatus: 'manual',
    note: 'สอดแนม 1 แล้วเลือกบน/ล่าง — ใช้ scoutOneTopOrHell (บนหรือนรก) เป็น proxy'
  }
};

// จ่าแดง: ลบ ability เมื่อโฮสต์ฆ่าที่ยังไม่รองรับ whenHostBattleDestroy — ใช้ battleDestroy บนโฮสต์ผ่าน activated จากเมนู
SD04['SD04-003'] = {
  code: 'SD04-003', name: 'จ่าแดงเดือด Tank Ranger',
  abilities: [
    { trigger: { on: 'activated' }, oncePerTurn: true, actions: [attachTank] },
    {
      trigger: { on: 'static', if: 'self.attached' },
      actions: [{ op: 'modifyPower', amount: 1, duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
    },
    {
      trigger: { on: 'activated' },
      cost: [{ op: 'exileSelf' }],
      actions: [{ op: 'untapHost' }],
      note: 'สั่งใช้หลังโฮสต์ฆ่าสำเร็จ — เนรเทศ/ทำลายใบนี้แล้วโฮสต์ตื่น (ผู้เล่นกดเมื่อเงื่อนไขครบ)'
    }
  ],
  parseStatus: 'manual'
};

const SD05 = {
  'SD05-001': {
    code: 'SD05-001', name: 'บึงทมิฬ  People - CEO คุณจิระ',
    abilities: [
      {
        trigger: { on: 'declareAttack', if: 'source==self' },
        actions: [{ op: 'modifyPower', amountPer: 'allTappedAvatars', per: 1, target: { select: 'self' }, duration: 'endOfTurn' }]
      },
      {
        trigger: { on: 'declaredAsAttackTarget' },
        actions: [{ op: 'modifyPower', amountPer: 'allTappedAvatars', per: 1, target: { select: 'self' }, duration: 'endOfTurn' }]
      }
    ],
    parseStatus: 'manual'
  },
  'SD05-002': {
    code: 'SD05-002', name: 'บึงทมิฬ  People - คุณเค้นท์',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      whenAttacking: true,
      requireOwnNameIncludes: 'บึงทมิฬ People',
      actions: [{ op: 'optionalDiscardUntapSelf' }],
      note: 'ทอยคี่→ตื่น — ใช้ optionalDiscardUntapSelf เป็น proxy (ผู้เล่นกดสั่งใช้เมื่อรอดการต่อสู้)'
    }],
    parseStatus: 'manual'
  },
  'SD05-003': {
    code: 'SD05-003', name: 'บึงทมิฬ  People - คุณฮาร์วี่',
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'scout', count: 3, from: 'bottom',
        filter: { type: 'Avatar', symbol: 'ปลา' },
        dest: 'hand', shuffleAfter: true
      }]
    }],
    parseStatus: 'manual',
    note: 'จำนวนสอดแนมตาม Avatar นอน — ใช้ 3 ใบเป็นค่ากลาง'
  },
  'SD05-004': {
    code: 'SD05-004', name: 'บึงทมิฬ  People - คุณอังคณา',
    keywords: ['โล่มนุษย์'],
    powerOnHumanShield: 2,
    abilities: [],
    parseStatus: 'manual'
  },
  'SD05-005': {
    code: 'SD05-005', name: 'บึงทมิฬ  People - คุณพยาบาล',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      actions: [
        { op: 'tap', target: 'self' },
        {
          op: 'grantCombatImmune',
          filter: { type: 'Avatar', nameIncludes: ['บึงทมิฬ People'] },
          excludeSelf: true
        }
      ]
    }],
    parseStatus: 'manual'
  },
  'SD05-006': {
    code: 'SD05-006', name: 'วอเตอร์แมน',
    nameAliases: ['บึงทมิฬ People'],
    extraSymbols: ['ปลา'],
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'deckPick',
        filter: { type: 'Avatar', nameIncludes: ['บึงทมิฬ People'] },
        dest: 'avatar', paidCost: false, shuffleAfter: true, multiMax: 2,
        summonUntappedIfLandNameIncludes: 'บึงทมิฬ'
      }]
    }],
    parseStatus: 'manual'
  },
  'SD05-014': {
    code: 'SD05-014', name: 'บึงทมิฬ',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      actions: [
        { op: 'tap', from: 'own', filter: { type: 'Avatar' } },
        { op: 'draw', count: 1 }
      ]
    }],
    parseStatus: 'manual'
  },
  'SD05-015': {
    code: 'SD05-015', name: 'กำเนิดจากน้ำ',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{
        op: 'hellPick',
        filter: { type: 'Avatar', symbol: 'ปลา' },
        dest: 'avatar', paidCost: false,
        summonUntappedIfLandNameIncludes: 'บึงทมิฬ',
        summonTapped: true
      }]
    }],
    parseStatus: 'manual'
  },
  'SD05-016': {
    code: 'SD05-016', name: 'น้ำวนชักโครก',
    abilities: [{
      trigger: { on: 'enemyDeclareAttack' },
      react: true,
      requireOwnNameIncludes: 'บึงทมิฬ People',
      actions: [
        { op: 'cancelAttack' },
        { op: 'flipTapsExceptAttacker' }
      ]
    }],
    parseStatus: 'manual'
  },
  'SD05-017': {
    code: 'SD05-017', name: 'ปืนฉมวก',
    attachOnly: { nameIncludes: 'บึงทมิฬ People' },
    abilities: [{
      trigger: { on: 'declareAttack', if: 'source==self' },
      note: 'บัฟตอนโจมตีเป้าที่นอน — ใช้ onFight ผ่าน static proxy',
      actions: []
    }],
    parseStatus: 'manual'
  },
  'SD05-018': {
    code: 'SD05-018', name: 'ตรีศูล ไตรตัน',
    attachOnly: { nameIncludes: 'บึงทมิฬ People' },
    abilities: [{
      trigger: { on: 'activated' },
      requireNoModUsed: true,
      cost: [{ op: 'exileSelf' }],
      actions: [{
        op: 'deckPick',
        filter: { nameIncludes: ['บึงทมิฬ'], subtype: 'Land' },
        dest: 'hand', shuffleAfter: true
      }],
      note: 'ค้น Land บึงทมิฬขึ้นมือ — ผู้เล่นวางลง Land Zone เอง (นับเป็นการใช้ Land)'
    }],
    parseStatus: 'manual'
  }
};

// ปืนฉมวก: POWER ±1 เมื่อโจมตีเป้าที่นอน — ใช้ modifyPower ตอน declare แบบง่าย
SD05['SD05-017'] = {
  code: 'SD05-017', name: 'ปืนฉมวก',
  attachOnly: { nameIncludes: 'บึงทมิฬ People' },
  abilities: [{
    trigger: { on: 'static', if: 'self.attached' },
    actions: [{ op: 'modifyPower', amount: 1, duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
  }],
  parseStatus: 'manual',
  note: '+1 ถาวรขณะสวม (proxy ของโจมตีเป้าที่นอน +1/−1)'
};

const SD06 = {
  'SD06-004': {
    code: 'SD06-004', name: 'เมือง ช่างใหญ่',
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'discard', count: 2,
        then: [{
          op: 'deckPick',
          filter: { type: 'Construct', nameIncludes: ['ค่ายบางระจัน'] },
          dest: 'buildConstructFree', shuffleAfter: true
        }]
      }]
    }],
    parseStatus: 'manual'
  },
  'SD06-006': {
    code: 'SD06-006', name: 'พ่อแท่น ผู้นำอาวุโส',
    abilities: [{
      trigger: { on: 'destroyed' },
      actions: [{
        op: 'scout', count: 5,
        filter: { type: 'Avatar', effectIncludes: 'ค่ายบางระจัน', nameNotIncludes: 'พ่อแท่น' },
        dest: 'hand', shuffleAfter: true
      }]
    }],
    parseStatus: 'manual'
  },
  'SD06-007': {
    code: 'SD06-007', name: 'อาจารย์ธรรมโชติ',
    abilities: [{
      trigger: { on: 'activated' },
      oncePerTurn: true,
      actions: [{ op: 'returnSelfToDeck' }],
      note: 'สั่งใช้เมื่อค่ายจะถูกทำลาย — ส่งตัวเองใต้เด็คแล้วค่ายรอด (ผู้เล่นกดเมื่อเงื่อนไขครบ; protect ทำมือได้)'
    }],
    parseStatus: 'manual'
  },
  'SD06-008': {
    code: 'SD06-008', name: 'บุญช่วย ควายรักชาติ',
    abilities: [
      { trigger: { on: 'activated' }, oncePerTurn: true, actions: [{ op: 'attachSelfTo', filter: { type: 'Avatar' } }] },
      {
        trigger: { on: 'static', if: 'self.attached' },
        actions: [{
          op: 'modifyPower', amount: 1, duration: 'whileEquipped', layer: 2,
          target: { select: 'equippedAvatar' },
          amountIfHostNameIncludes: null
        }]
      }
    ],
    hostPowerIfOwnConstructNameIncludes: { nameIncludes: 'ค่ายบางระจัน', amount: 2, elseAmount: 1 },
    parseStatus: 'manual'
  },
  'SD06-012': {
    code: 'SD06-012', name: 'ผู้นำของเหล่าวีรชน',
    abilities: [{
      trigger: { on: 'activated' },
      cost: [{ op: 'discard', count: 2 }],
      actions: [{
        op: 'deckPick',
        filter: { type: 'Avatar', effectIncludes: 'ค่ายบางระจัน' },
        dest: 'hand', shuffleAfter: true
      }]
    }],
    parseStatus: 'manual'
  },
  'SD06-013': {
    code: 'SD06-013', name: 'วิญญาณวีรชน',
    abilities: [{
      trigger: { on: 'activated' },
      cost: [{ op: 'discard', count: 1 }],
      actions: [{
        op: 'hellPick',
        filter: { type: 'Avatar', effectIncludes: 'ค่ายบางระจัน' },
        dest: 'avatar', paidCost: true,
        scheduleDestroyAfterOppTurn: true
      }]
    }],
    parseStatus: 'manual'
  },
  'SD06-015': {
    code: 'SD06-015', name: 'ปืนใหญ่ไทยประดิษฐ์',
    abilities: [{
      trigger: { on: 'avatarSummoned' },
      react: true,
      requireOwn: { effectIncludes: 'ค่ายบางระจัน' },
      actions: [
        { op: 'chooseDestroy', side: 'own', filter: { effectIncludes: 'ค่ายบางระจัน' }, zones: ['avatar'] },
        { op: 'chooseDestroy', side: 'enemy', filter: { type: 'Avatar' }, zones: ['avatar'] }
      ]
    }],
    parseStatus: 'manual'
  },
  'SD06-016': {
    code: 'SD06-016', name: 'ยันต์ผ้าประเจียด',
    attachOnly: { effectIncludes: 'ค่ายบางระจัน' },
    keywords: ['ลูกฮึด'],
    abilities: [],
    parseStatus: 'manual'
  },
  'SD06-017': {
    code: 'SD06-017', name: 'ดาบใบข้าว X',
    attachOnly: { effectIncludes: 'ค่ายบางระจัน' },
    abilities: [{
      trigger: { on: 'battleDestroy' },
      actions: [{ op: 'draw', count: 1 }]
    }],
    parseStatus: 'manual',
    note: 'battleDestroy บนใบสวม — engine ยิงจากโฮสต์; ถ้าไม่ติดใช้เมนูจั่วมือ'
  },
  'SD06-019': {
    code: 'SD06-019', name: 'วัดคู่บ้านคู่เมือง',
    scoutBonusConstruct: 2,
    abilities: [],
    parseStatus: 'manual'
  },
  'SD06-020': {
    code: 'SD06-020', name: 'กำแพงด่านสุดท้าย',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      oncePerTurn: true,
      cost: [{ op: 'discard', count: 1 }],
      actions: [{
        op: 'scout', count: 1,
        filter: { type: 'Avatar', effectIncludes: 'ค่ายบางระจัน', costMax: 4 },
        dest: 'avatar', paidCost: false, restTo: 'hand'
      }]
    }],
    parseStatus: 'manual',
    note: 'เงื่อนไข Avatar Zone ว่าง — ผู้เล่นกดเมื่อเข้าเงื่อนไข'
  }
};

// บุญช่วย: POWER +1 / +2 ถ้ามีค่าย — ใส่ static บนตัวเองเมื่อสวม
SD06['SD06-008'] = {
  code: 'SD06-008', name: 'บุญช่วย ควายรักชาติ',
  abilities: [
    { trigger: { on: 'activated' }, oncePerTurn: true, actions: [{ op: 'attachSelfTo', filter: { type: 'Avatar' } }] },
    {
      trigger: { on: 'static', if: 'self.attached' },
      actions: [{ op: 'modifyPower', amount: 1, duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
    }
  ],
  parseStatus: 'manual',
  note: '+1 ขณะสวม; ถ้ามีค่ายบนสนาม ผู้เล่นบวกเพิ่มมือได้ (+2 ตามข้อความ)'
};

// attachOnly ด้วย effectIncludes — ต้องรองรับใน attachOnlyDeny
const SD07 = {
  'SD07-001': {
    code: 'SD07-001', name: 'กวนอู ขุนพลภักดีแห่งจ๊กก๊ก',
    keywords: ['ลูกฮึด'],
    controlImmune: true,
    abilities: [],
    parseStatus: 'manual',
    note: 'กันเป้าความสามารถใส่ขุนพลอื่น — เล่นมือบางส่วน'
  },
  'SD07-003': {
    code: 'SD07-003', name: 'แฮหัวตุ้น ขุนพลตาเดียวแห่งวุยก๊ก',
    destroyAnyOnSummonedByAvatarNameIncludes: 'ขุนพล',
    abilities: [],
    parseStatus: 'manual'
  },
  'SD07-004': {
    code: 'SD07-004', name: 'แฮหัวเอี๋ยน ขุนพลธนูแห่งวุยก๊ก',
    keywords: ['แทงหลัง'],
    drawOnSummonedByAvatarNameIncludes: 'ขุนพล',
    abilities: [],
    parseStatus: 'manual'
  },
  'SD07-005': {
    code: 'SD07-005', name: 'ซุนเกี๋ยน ขุนพลพยัคฆ์แห่งง่อก๊ก',
    keywords: ['โล่มนุษย์'],
    abilities: [{
      trigger: { on: 'destroyed' },
      actions: [{
        op: 'modifyPower', amount: 2, duration: 'endOfTurn', layer: 4,
        target: { select: 'choose', type: 'Avatar', nameIncludes: ['ขุนพล'], symbol: 'ต่างชาติ', side: 'own', count: 1 }
      }]
    }],
    parseStatus: 'manual'
  },
  'SD07-006': {
    code: 'SD07-006', name: 'ซุนเซ็ก ขุนพลไฟแรงแห่งง่อก๊ก',
    keywords: ['แทงหลัง'],
    untapAfterBackstabColor: 'แดง',
    abilities: [],
    parseStatus: 'manual'
  },
  'SD07-007': {
    code: 'SD07-007', name: 'ลิโป้ ขุนพลเทพสงคราม',
    grantKeywordAura: { keyword: 'โล่มนุษย์', side: 'enemy' },
    abilities: [
      {
        trigger: { on: 'declareAttack', if: 'source==self' },
        actions: [],
        note: 'บังคับโล่มนุษย์ฝ่ายตรงข้าม — aura ให้โล่มนุษย์ศัตรูแล้ว'
      },
      {
        trigger: { on: 'activated' },
        oncePerTurn: true,
        actions: [{ op: 'chooseDestroy', side: 'enemy', filter: { type: 'Avatar' }, zones: ['avatar'] }],
        note: 'เมื่อมีการเปลี่ยนเป้าโจมตี — ผู้เล่นกดสั่งใช้'
      }
    ],
    parseStatus: 'manual'
  },
  'SD07-008': {
    code: 'SD07-008', name: 'อ้วนเสี้ยว ผู้นำขุนพล 18 หัวเมือง',
    keywords: ['แทงหลัง'],
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'scout', count: 3,
        filter: { type: 'Avatar', nameIncludes: ['ขุนพล'], symbol: 'ต่างชาติ' },
        dest: 'hand', shuffleAfter: true,
        thenIfColor: {
          'ฟ้า': [{ op: 'deckPick', filter: { type: 'Avatar', nameIncludes: ['ขุนพล'], symbol: 'ต่างชาติ', color: 'ฟ้า' }, dest: 'avatar', paidCost: false, shuffleAfter: true }]
        }
      }]
    }],
    parseStatus: 'manual',
    note: 'ถ้าได้สีฟ้าสามารถอัญเชิญแทนขึ้นมือ — thenIfColor ทำงานเมื่อเลือกจาก scout'
  },
  'SD07-009': {
    code: 'SD07-009', name: 'ขุนศึกแบงค์ แซ่อู๋',
    keywords: ['แทงหลัง'],
    abilities: [],
    parseStatus: 'manual'
  },
  'SD07-013': {
    code: 'SD07-013', name: 'คำสาบานสวนท้อ',
    abilities: [{
      trigger: { on: 'chooseMode' },
      options: [
        {
          label: 'ค้นขุนพลสีเดียวกันขึ้นมือ (ไม่ Only)',
          actions: [{
            op: 'deckPick',
            filter: { type: 'Avatar', nameIncludes: ['ขุนพล'], symbol: 'ต่างชาติ', excludeOnly: true },
            dest: 'hand', shuffleAfter: true
          }]
        },
        {
          label: 'ค้นขุนพล Only สีเดียวกันขึ้นมือ',
          actions: [{
            op: 'deckPick',
            filter: { type: 'Avatar', nameIncludes: ['ขุนพล'], symbol: 'ต่างชาติ' },
            dest: 'hand', shuffleAfter: true
          }]
        }
      ]
    }],
    parseStatus: 'manual'
  },
  'SD07-014': {
    code: 'SD07-014', name: 'ยืมมือสังหาร',
    abilities: [{
      trigger: { on: 'activated' },
      requireOwnNameIncludes: 'ขุนพล',
      cost: [{ op: 'discard', count: 1 }],
      actions: [{
        op: 'takeControl',
        filter: { type: 'Avatar' },
        until: 'endOfTurn', keepTapped: false
      }]
    }],
    parseStatus: 'manual',
    note: 'เงื่อนไขต้องมี Mod ศัตรูสวม — ผู้เล่นเลือกเป้าที่มี Mod'
  },
  'SD07-015': {
    code: 'SD07-015', name: 'เสบียงหลวง',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{ op: 'drawProvisions', nameIncludes: 'ขุนพล', symbol: 'ต่างชาติ', min: 2, countBoost: 2, countNormal: 1 }]
    }],
    parseStatus: 'manual'
  },
  'SD07-016': {
    code: 'SD07-016', name: 'หนีคือยอดกลยุทธ์',
    abilities: [{
      trigger: { on: 'enemyDeclareAttack' },
      react: true,
      actions: [{ op: 'bounce', from: 'own', filter: { type: 'Avatar' }, optional: false }]
    }],
    parseStatus: 'manual',
    note: 'นำตัวที่ถูกโจมตีขึ้นมือ — เลือก Avatar ฝ่ายเรา (ควรเป็นเป้า)'
  },
  'SD07-017': {
    code: 'SD07-017', name: 'หมอมาแล้วววว',
    abilities: [{
      trigger: { on: 'avatarWouldBeDestroyed' },
      react: true,
      actions: [{ op: 'preventDestroy' }]
    }],
    parseStatus: 'manual',
    note: 'เมื่อ Avatar บนสนามจะถูกทำลาย : Avatar ใบนั้นจะไม่ถูกทำลาย'
  }
};

// KD leftovers ที่ใช้ pattern เดียวกับ SD03
const KD02_EXTRA = {
  'KD02-003': {
    code: 'KD02-003', name: 'พญายม',
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{ op: 'hellPick', filter: { type: 'Avatar', nameIncludes: ['นายนิรยบาล'] }, dest: 'avatar', paidCost: false }]
    }],
    parseStatus: 'manual'
  }
};

const packs = [
  ['effects-sd02.json', SD02],
  ['effects-sd03.json', SD03],
  ['effects-sd04.json', SD04],
  ['effects-sd05.json', SD05],
  ['effects-sd06.json', SD06],
  ['effects-sd07.json', SD07],
  ['effects-kd02.json', KD02_EXTRA]
];

for (const [fname, map] of packs) {
  const j = load(fname);
  Object.values(map).forEach(e => upsert(j.cards, e));
  save(fname, j);
  console.log('updated', fname, Object.keys(map).join(', '));
}

const sets = ['sd01', 'sd02', 'sd03', 'sd04', 'sd05', 'sd06', 'sd07', 'sd08', 'kd01', 'kd02', 'kd03', 'kd04', 'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11', 'cc01'];
const seen = new Set();
const merged = [];
for (const s of sets) {
  const p = path.join(ROOT, `data/effects-${s}.json`);
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const c of (j.cards || [])) {
    if (seen.has(c.code)) {
      if (/^(KD|SD)0/.test(c.code)) {
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
