/* apply-stub-fixes.js — Implement all stub cards (CC01/CC02/PRMO/ODY1) */
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

// ==================== CC01 Stubs ====================
const cc01Fixes = {

  // จุติ ถ้านรกมี Avatar ชื่อไม่ซ้ำ >= 5 → สอดแนม 7 นำ Avatar ชื่อไม่ซ้ำจากสอดแนมและ AZ ลง AZ ทั้งหมด
  'CC01-003': {
    code: 'CC01-003', name: 'พระพรหม เทพผู้สร้าง', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      condition: { ownGrave: { distinctNames: { min: 5 } } },
      actions: [{
        op: 'scoutAndSummonAll',
        count: 7,
        filter: { type: 'Avatar', distinctNames: true },
        dest: 'avatarZone',
        restTo: 'deckBottom',
        shuffleAfter: true,
        uncancellable: true
      }]
    }],
    note: 'จุติ: ถ้านรกมี Avatar ชื่อไม่ซ้ำ 5+, สอดแนม 7 นำ Avatar ชื่อไม่ซ้ำลง AZ ทั้งหมด'
  },

  // ต่อเนื่อง POWER+N ตามจำนวน Life คว่ำ; เมื่อออกจากสนาม หงาย Life บนสุด 1
  'CC01-005': {
    code: 'CC01-005', name: 'ปื๊ดเปรตกังฟู', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [{
          op: 'modifyPower',
          amountPer: 'ownFaceDownLife',
          per: 1,
          layer: 3,
          target: { select: 'self' }
        }]
      },
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'leavesField' },
        actions: [{ op: 'revealTopLife', count: 1, player: 'owner' }]
      }
    ],
    note: 'ต่อเนื่อง: POWER +1 ต่อ Life คว่ำ; ออกจากสนาม: หงาย Life บนสุด 1'
  },

  // จุติ: อัญเชิญ {symbol ปลา} กี่ใบก็ได้ Cost รวมไม่เกิน 7 จากนรก; ต่อเนื่อง {symbol ปลา} POWER+1 + สามัคคี
  'CC01-006': {
    code: 'CC01-006', name: 'ไตรตัน เจ้าสมุทร', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'hellSummonMulti',
          filter: { type: 'Avatar', symbol: 'ปลา' },
          totalCostMax: 7,
          dest: 'avatarZone',
          paidCost: false
        }]
      },
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [
          {
            op: 'modifyPower', amount: 1, duration: 'whileOnField', layer: 3,
            target: { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone', symbol: 'ปลา', excludeSelf: true }
          },
          {
            op: 'grantKeyword', keyword: 'สามัคคี',
            target: { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone', symbol: 'ปลา', excludeSelf: true }
          }
        ]
      }
    ],
    note: 'จุติ: อัญเชิญ Symbol ปลา จากนรก Cost รวมไม่เกิน 7; ต่อเนื่อง: Symbol ปลา ฝ่ายเรา POWER+1 + สามัคคี'
  },

  // จุติ: นำ กุ่ย ฮอล นาย จากนรกมาสวม; หลังโจมตีสำเร็จ+มีทั้ง 3 สวม → อัญเชิญวีรบุรุษปากซอย
  'CC01-007': {
    code: 'CC01-007', name: 'วีรบุรุษสุดซอย', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          { op: 'attachFromGrave', filter: { nameIncludes: ['กุ่ย'] }, count: 1 },
          { op: 'attachFromGrave', filter: { nameIncludes: ['ฮอล'] }, count: 1 },
          { op: 'attachFromGrave', filter: { nameIncludes: ['นาย'] }, count: 1 }
        ]
      },
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'afterAttackSuccess', if: 'source==self' },
        condition: {
          selfAttached: { allNameIncludes: ['กุ่ย', 'ฮอล', 'นาย'] }
        },
        actions: [
          { op: 'sendSelfToGrave' },
          {
            op: 'summonFromHandOrDeck',
            filter: { nameIncludes: ['วีรบุรุษปากซอย'] },
            paidCost: true,
            shuffleAfterIfDeck: true
          }
        ]
      }
    ],
    note: 'จุติ: แนบ กุ่ย/ฮอล/นาย จากนรก; หลังโจมตีสำเร็จมีทั้ง 3 → ส่งตัวเองนรก อัญเชิญวีรบุรุษปากซอย'
  },

  // ถ้าอัญเชิญรัททาทุย นางพญา ไปแล้วในเกมนี้ → นับเป็นชื่อ รัททาทุย นางพญา บน AZ
  'CC01-009': {
    code: 'CC01-009', name: 'ชู้รักรัททาทุย', parseStatus: 'auto',
    nameAliases: ['รัททาทุย นางพญา'],
    aliasCondition: { ifOwnSummonedThisGame: 'รัททาทุย นางพญา' },
    abilities: [],
    note: 'ถ้าเคยอัญเชิญรัททาทุย นางพญา ในเกมนี้ → นับชื่อเป็น รัททาทุย นางพญา บน AZ'
  },

  // only สุวาน; ต่อเนื่อง: {symbol นรก} ในนรกได้ชื่อ นายนิรยบาล; สั่งใช้: อัญเชิญนายนิรบาลจากนรก
  'CC01-011': {
    code: 'CC01-011', name: 'พญายม With The Shotgun', parseStatus: 'auto',
    only: 'สุวาน',
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [{
          op: 'grantNameInGrave',
          filter: { symbol: 'นรก' },
          grantName: 'นายนิรยบาล',
          player: 'owner'
        }]
      },
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        actions: [{
          op: 'hellSummon',
          filter: { nameIncludes: ['นายนิรบาล'] },
          dest: 'avatarZone',
          paidCost: false
        }]
      }
    ],
    note: 'only สุวาน; ต่อเนื่อง: Symbol นรก ในนรก = นายนิรยบาล; สั่งใช้: อัญเชิญนายนิรบาลจากนรก'
  },

  // ต่อเนื่อง โจมตีไม่ได้; ทุก End Phase ทั้ง 2 ฝ่าย: ทอยลูกเต๋า ออก4→ทำลาย+หงาย Life; อื่น→เปลี่ยนการควบคุม
  'CC01-013': {
    code: 'CC01-013', name: 'เจนนี่', parseStatus: 'auto',
    cannotAttack: true,
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'anyEndPhase' },
        actions: [{
          op: 'rollDie',
          results: {
            4: [
              { op: 'destroySelf' },
              { op: 'revealTopLife', count: 1, player: 'controller' }
            ],
            other: [{ op: 'changeControl', target: { select: 'self' } }]
          }
        }]
      }
    ],
    note: 'ต่อเนื่อง โจมตีไม่ได้; ทุก End Phase: ลูกเต๋า 4→ทำลาย+หงาย Life, อื่น→เปลี่ยนการควบคุม'
  },

  // จุติ: สอดแนม 2 นำ 1 ขึ้นมือ ที่เหลือเลือกวางบนสุด/ล่างสุด
  'CC01-015': {
    code: 'CC01-015', name: 'HR ผู้รู้ความจริง', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      actions: [{
        op: 'scout',
        count: 2,
        pick: 1,
        dest: 'hand',
        restTo: 'deckTopOrBottom'
      }]
    }],
    note: 'จุติ: สอดแนม 2 เอา 1 ขึ้นมือ ที่เหลือเลือกวางบน/ล่าง Deck'
  },

  // อัตโนมัติ เทิร์นละครั้ง เมื่อมีการอัญเชิญ Avatar: การ์ดนี้เปลี่ยนการควบคุมไปฝ่ายตรงข้าม
  // ต่อเนื่อง: ผู้ควบคุมปัจจุบันดึงการ์ดจาก Deck ด้วย Avatar/Magic ไม่ได้
  'CC01-016': {
    code: 'CC01-016', name: 'แมวนิค', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'avatarSummoned', if: 'any' },
        oncePerTurn: true,
        actions: [{ op: 'changeControl', target: { select: 'self' }, toOpponent: true }]
      },
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [{
          op: 'blockDraw',
          sources: ['Avatar', 'Magic'],
          player: 'controller'
        }]
      }
    ],
    note: 'อัตโนมัติ เทิร์นละครั้ง เมื่อมีการอัญเชิญ Avatar: เปลี่ยนการควบคุมไปฝ่ายตรงข้าม; ต่อเนื่อง: ผู้ควบคุมดึงจาก Avatar/Magic ไม่ได้'
  },

  // นำ Avatar ทั้งหมดที่ถูก changeControl กลับเจ้าของเดิม
  'CC01-043': {
    code: 'CC01-043', name: 'รู้สึกเหมือนโดนแย่งเมีย', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{ op: 'returnControlToOwner', target: { select: 'all', type: 'Avatar', filter: 'changedControl' } }]
    }],
    note: 'นำ Avatar ที่ถูก changeControl ทั้งหมดกลับเจ้าของเดิม'
  },

  // เงื่อนไข: ฝ่ายตรงข้าม มี Avatar บน AZ และเราไม่มี
  // เลือก รถถัง + Tank Ranger Cost 3 จากนรก → อัญเชิญรถถัง แล้วสวม Tank Ranger
  'CC01-044': {
    code: 'CC01-044', name: 'ซ่อมบำรุงประจำปี', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'activated' },
      condition: {
        opponent: { avatarZone: { min: 1 } },
        own: { avatarZone: { count: 0 } }
      },
      actions: [
        {
          op: 'hellSummon',
          filter: { nameIncludes: ['รถถัง'], cost: 3 },
          dest: 'avatarZone',
          paidCost: false
        },
        {
          op: 'attachFromGrave',
          filter: { nameIncludes: ['Tank Ranger'], cost: 3 },
          attachTo: 'lastSummoned',
          count: 1
        }
      ]
    }],
    note: 'ฝ่ายตรงข้ามมี Avatar แต่เราไม่มี: เลือกรถถัง+Tank Ranger Cost 3 จากนรก อัญเชิญรถถัง+สวมTank Ranger'
  },

  // React เมื่อทั้ง 2 ฝ่ายมี Avatar: เปิดล่างสุด Deck ทั้ง 2 ฝ่าย เทียบ Cost; ชนะ→เลือก: ทำลาย 1/นำเข้า Deck
  'CC01-045': {
    code: 'CC01-045', name: 'กฎร้าน', parseStatus: 'auto',
    abilities: [{
      keyword: 'React',
      trigger: { on: 'anyWindow' },
      reactAnyWindow: true,
      condition: {
        own: { avatarZone: { min: 1 } },
        opponent: { avatarZone: { min: 1 } }
      },
      actions: [{
        op: 'revealDeckBottomBoth',
        compareField: 'cost',
        winnerChooses: [
          { op: 'destroy', target: { select: 'choose', type: 'Avatar', side: 'opponent', count: 1 } },
          { op: 'returnToDeck', target: { select: 'choose', type: 'Avatar', side: 'any', count: 1 }, shuffleAfter: true }
        ]
      }]
    }],
    note: 'React: ทั้ง 2 ฝ่ายมี Avatar → เปิดล่างสุด Deck เทียบ Cost; ฝ่าย Cost สูงกว่าเลือก: ทำลาย1 หรือ นำ Avatar กลับเด็ค'
  },

  // React: เลือก Avatar ที่กำลังต่อสู้ 1 ใบ → ปรับ POWER ตั้งต้น = 0 จนจบ Battle Phase
  'CC01-046': {
    code: 'CC01-046', name: 'ขอให้ทั้งตัวมีแต่---', parseStatus: 'auto',
    abilities: [{
      keyword: 'React',
      trigger: { on: 'duringCombat' },
      react: true,
      actions: [{
        op: 'setPrintedPower',
        amount: 0,
        duration: 'endOfBattlePhase',
        target: { select: 'choose', type: 'Avatar', filter: 'inCombat', count: 1 }
      }]
    }],
    note: 'React: เลือก Avatar ที่กำลังต่อสู้ → ปรับ POWER ตั้งต้นเป็น 0 จนจบ Battle Phase'
  },

  // Land: สั่งใช้ 2 ทาง: 1) ทิ้งมือ→สอดแนม3 นำ Avatar 1 วางใน MZ; 2) Avatar ใน MZ→อัญเชิญขึ้น AZ
  'CC01-050': {
    code: 'CC01-050', name: 'SD Plaza สายเหนือเก่า', parseStatus: 'auto',
    abilities: [{
      keyword: 'สั่งใช้',
      trigger: { on: 'activated' },
      oncePerTurn: true,
      actions: [{
        op: 'choose',
        options: [
          {
            cost: [{ op: 'discard', from: 'hand', count: 1 }],
            actions: [{
              op: 'scout', count: 3,
              filter: { type: 'Avatar' },
              dest: 'magicZone',
              restTo: 'deckBottom'
            }]
          },
          {
            actions: [{
              op: 'summonFromMagicZone',
              filter: { type: 'Avatar' },
              dest: 'avatarZone',
              paidCost: false
            }]
          }
        ]
      }]
    }],
    note: 'Land เทิร์นละครั้ง: 1) ทิ้งมือ → สอดแนม3 นำ Avatar วางMagicZone; 2) Avatar ในMZ → อัญเชิญขึ้น AZ'
  },

  // Land: เทิร์นละครั้ง Main Phase → ทิ้งมือ 1 อัญเชิญ เสามงคล จาก Deck
  // ก่อน Main Phase: จั่วตามจำนวน เสามงคล บนสนาม
  'CC01-051': {
    code: 'CC01-051', name: 'สมชายห้องเช่าพันล้าน', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'mainPhase' },
        oncePerTurn: true,
        cost: [{ op: 'discard', from: 'hand', count: 1 }],
        actions: [{
          op: 'deckPick',
          filter: { nameIncludes: ['เสามงคล'] },
          dest: 'avatarZone',
          paidCost: false,
          shuffleAfter: true
        }]
      },
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'beforeMainPhase' },
        actions: [{
          op: 'draw',
          countPer: 'ownNameOnField',
          nameIncludes: 'เสามงคล',
          player: 'owner'
        }]
      }
    ],
    note: 'Land: ทิ้งมือ1 → อัญเชิญเสามงคลจาก Deck; ก่อน Main Phase: จั่วตามจำนวนเสามงคลบนสนาม'
  }
};

// ==================== CC02 Stubs ====================
const cc02Fixes = {

  // ลูกฮึด โล่มนุษย์
  // อัตโนมัติ เมื่อต่อสู้: POWER +2 จนจบการต่อสู้
  // อัตโนมัติ เมื่อจะถูกทำลายจากต่อสู้ ทิ้ง Modification ที่สวมทั้งหมด → ไม่ถูกทำลาย
  // คำสั่งเสีย: Avatar ฝ่ายเรา POWER +1
  'CC02-001': {
    code: 'CC02-001', name: 'มหาราชาสีนิล', parseStatus: 'auto',
    keywords: ['ลูกฮึด', 'โล่มนุษย์'],
    abilities: [
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'enterCombat', if: 'source==self' },
        actions: [{ op: 'modifyPower', amount: 2, duration: 'endOfCombat', layer: 4, target: { select: 'self' } }]
      },
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'willBeDestroyedByCombat', if: 'target==self' },
        actions: [{
          op: 'discardAttachedAll',
          filter: { subtype: 'Modification' },
          then: [{ op: 'preventDestroy', target: { select: 'self' } }]
        }]
      },
      {
        keyword: 'คำสั่งเสีย',
        trigger: { on: 'destroyed' },
        actions: [{
          op: 'modifyPower', amount: 1, duration: 'endOfTurn', layer: 4,
          target: { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone' }
        }]
      }
    ],
    note: 'ลูกฮึด โล่มนุษย์; อัตโนมัติ ต่อสู้: POWER+2; จะถูกทำลาย → ทิ้ง Modification ทั้งหมด ป้องกัน; คำสั่งเสีย: ฝ่ายเรา POWER+1'
  },

  // สั่งใช้ จากนรก ถ้า AZ ฝ่ายเราไม่มีชื่อนี้ ทิ้งมือ 1 → อัญเชิญตัวเองจากนรก
  'CC02-002': {
    code: 'CC02-002', name: 'บัมเบิ้ลแบงค์', parseStatus: 'auto',
    abilities: [{
      keyword: 'สั่งใช้',
      trigger: { on: 'activated', from: 'grave' },
      oncePerTurn: true,
      condition: { ownField: { nameOnField: { name: 'บัมเบิ้ลแบงค์', count: 0 } } },
      cost: [{ op: 'discard', from: 'hand', count: 1 }],
      actions: [{ op: 'hellSummonSelf', dest: 'avatarZone', paidCost: false }]
    }],
    note: 'สั่งใช้ จากนรก: ถ้า AZ ไม่มีชื่อนี้ ทิ้งมือ1 → อัญเชิญตัวเองจากนรก'
  },

  // สั่งใช้ เทิร์นละครั้ง: ทอยลูกเต๋า POWER +ผลลัพธ์ จนจบเทิร์น
  // คำสั่งเสีย: นำการ์ดนี้จากนรกเข้า Deck แล้วสับ
  'CC02-003': {
    code: 'CC02-003', name: 'คุณโดม ผู้จัดการทีมการ์ด', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        actions: [{
          op: 'rollDie',
          results: { any: [{ op: 'modifyPower', amountFromDie: true, duration: 'endOfTurn', layer: 4, target: { select: 'self' } }] }
        }]
      },
      {
        keyword: 'คำสั่งเสีย',
        trigger: { on: 'destroyed' },
        actions: [{ op: 'returnFromGraveToDeck', target: { select: 'self' }, shuffleAfter: true }]
      }
    ],
    note: 'สั่งใช้ เทิร์นละครั้ง: ทอยลูกเต๋า POWER +ผล จนจบเทิร์น; คำสั่งเสีย: นำตัวเองจากนรกเข้า Deck'
  },

  // อัตโนมัติ เมื่อไม่ถูกทำลายจากถูกโจมตี: ทำลาย Avatar ฝ่ายตรงข้าม 1 ใบ
  // #นับเป็น Symbol หุ่นยนต์ ด้วย
  'CC02-004': {
    code: 'CC02-004', name: 'นักดาบตะวันแดง', parseStatus: 'auto',
    extraSymbols: ['หุ่นยนต์'],
    abilities: [{
      keyword: 'อัตโนมัติ',
      trigger: { on: 'surviveAttack', if: 'target==self' },
      actions: [{
        op: 'destroy',
        target: { select: 'choose', type: 'Avatar', side: 'opponent', zone: 'avatarZone', count: 1 }
      }]
    }],
    note: 'นับเป็น Symbol หุ่นยนต์ด้วย; อัตโนมัติ เมื่อรอดจากถูกโจมตี: ทำลาย Avatar ฝ่ายตรงข้าม 1'
  },

  // จุติ แสดง Avatar แดง 1 ใบ จากมือ: เลือกปฏิบัติ
  // 1) Avatar ฝ่ายเรา 1 ใบ POWER +2  2) จั่ว 2 ทิ้ง 1
  'CC02-005': {
    code: 'CC02-005', name: 'หมีบราซิล', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      cost: [{ op: 'reveal', from: 'hand', filter: { type: 'Avatar', color: 'แดง' }, count: 1 }],
      actions: [{
        op: 'choose',
        options: [
          {
            actions: [{
              op: 'modifyPower', amount: 2, duration: 'endOfTurn', layer: 4,
              target: { select: 'choose', type: 'Avatar', side: 'own', zone: 'avatarZone', count: 1 }
            }]
          },
          {
            actions: [
              { op: 'draw', count: 2, player: 'owner' },
              { op: 'discard', from: 'hand', count: 1 }
            ]
          }
        ]
      }]
    }],
    note: 'จุติ แสดง Avatar แดงจากมือ: 1) POWER+2, 2) จั่ว2 ทิ้ง1'
  },

  // จุติ เซ่นไหว้ Avatar {symbol สัตว์} 1 ใบ: สอดแนม 7 นำ Avatar Cost ≤5 ขึ้นมือ;
  // ถ้า Cost ≤2 → อัญเชิญลง AZ แทน; แล้วสับ
  'CC02-007': {
    code: 'CC02-007', name: 'ไอ้ชนหมา', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      cost: [{ op: 'sacrifice', filter: { type: 'Avatar', symbol: 'สัตว์' }, count: 1 }],
      actions: [{
        op: 'scout',
        count: 7,
        filter: { type: 'Avatar', costMax: 5 },
        pick: 1,
        destIfCostMax: { cost: 2, dest: 'avatarZone', paidCost: false },
        dest: 'hand',
        restTo: 'deck',
        shuffleAfter: true
      }]
    }],
    note: 'จุติ เซ่น Avatar สัตว์: สอดแนม7 เอา Avatar Cost≤5 ขึ้นมือ; ถ้า Cost≤2 → อัญเชิญแทน'
  },

  // ต่อเนื่อง ตราบเท่าที่มี บึงทมิฬ บน Land MZ: ทุกคนควบคุม Avatar ที่ไม่ใช่ Symbol ปลา ได้แค่ 1 ใบ
  'CC02-009': {
    code: 'CC02-009', name: 'บึงทมิฬ  People - คุณปลาชด', parseStatus: 'auto',
    abilities: [{
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'self.zone==avatarZone' },
      condition: { landZone: { nameIncludes: 'บึงทมิฬ' } },
      actions: [{
        op: 'limitAvatarZone',
        filter: { symbolNot: 'ปลา' },
        maxCount: 1,
        player: 'both'
      }]
    }],
    note: 'ต่อเนื่อง ถ้ามีบึงทมิฬบน Land MZ: ทั้ง 2 ฝ่ายควบคุม Avatar ที่ไม่ใช่ Symbol ปลา ได้สูงสุด 1 ใบ'
  },

  // จุติ แสดง Avatar ฟ้า 1 ใบจากมือ: เลือกปฏิบัติ
  // 1) สอดแนม5 อัญเชิญ Avatar Cost≤3  2) สอดแนม5 นำ Avatar 1 ขึ้นมือ
  'CC02-010': {
    code: 'CC02-010', name: 'หมีขาว', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      cost: [{ op: 'reveal', from: 'hand', filter: { type: 'Avatar', color: 'ฟ้า' }, count: 1 }],
      actions: [{
        op: 'choose',
        options: [
          {
            actions: [{
              op: 'scout', count: 5,
              filter: { type: 'Avatar', costMax: 3 },
              dest: 'avatarZone',
              paidCost: false,
              restTo: 'deck',
              shuffleAfter: true
            }]
          },
          {
            actions: [{
              op: 'scout', count: 5,
              filter: { type: 'Avatar' },
              pick: 1,
              dest: 'hand',
              restTo: 'deck',
              shuffleAfter: true
            }]
          }
        ]
      }]
    }],
    note: 'จุติ แสดง Avatar ฟ้าจากมือ: 1) สอดแนม5 อัญเชิญ Avatar Cost≤3; 2) สอดแนม5 นำ Avatar 1 ขึ้นมือ'
  },

  // ต่อเนื่อง ถ้ามี Avatar ขุนพล สีม่วง Symbol ต่างชาติ บน AZ ฝ่ายเรา → การ์ดนี้ถูกโจมตีไม่ได้
  // สั่งใช้ เทิร์นละครั้ง: เปลี่ยน Avatar ฝ่ายตรงข้ามทั้งหมดเป็นสภาพตื่น
  'CC02-012': {
    code: 'CC02-012', name: 'เตียวเสียน จันทร์หลบโฉมสุดา', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        condition: {
          own: { avatarZone: { filter: { nameIncludes: ['ขุนพล'], color: 'ม่วง', symbol: 'ต่างชาติ' }, min: 1 } }
        },
        actions: [{ op: 'setCannotBeAttackTarget', target: { select: 'self' } }]
      },
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        actions: [{
          op: 'changeStatus', status: 'awake',
          target: { select: 'all', type: 'Avatar', side: 'opponent', zone: 'avatarZone' }
        }]
      }
    ],
    note: 'ต่อเนื่อง ถ้ามีขุนพลม่วง Symbol ต่างชาติ ฝ่ายเรา → โจมตีไม่ได้; สั่งใช้: Avatar ฝ่ายตรงข้ามทั้งหมดตื่น'
  },

  // จุติ: นำ Avatar ขุนพล สีม่วง Symbol ต่างชาติ (ไม่ใช่ชื่อนี้) จากนรกขึ้นมือ Cost-3 จนจบเทิร์น
  // อัตโนมัติ เทิร์นละครั้ง เทิร์นเรา เมื่อ Avatar ฝ่ายตรงข้ามเปลี่ยนสภาพ: จั่ว 1
  'CC02-013': {
    code: 'CC02-013', name: 'ตั๋งโต๊ะ ขุนพลฮ่องเต้ทรราช', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'retrieveFromGrave',
          filter: {
            nameIncludes: ['ขุนพล'], color: 'ม่วง', symbol: 'ต่างชาติ',
            nameNotExact: 'ตั๋งโต๊ะ ขุนพลฮ่องเต้ทรราช'
          },
          count: 1,
          dest: 'hand',
          grantCostReduce: { amount: 3, until: 'endOfTurn' }
        }]
      },
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'enemyAvatarChangeStatus', if: 'ownTurn' },
        oncePerTurn: true,
        actions: [{ op: 'draw', count: 1, player: 'owner' }]
      }
    ],
    note: 'จุติ: นำขุนพลม่วงต่างชาติจากนรกขึ้นมือ Cost-3; อัตโนมัติ เทิร์นละครั้ง เมื่อ Avatar ตรงข้ามเปลี่ยนสภาพ: จั่ว1'
  },

  // จุติ แสดง Avatar ม่วง 1 ใบจากมือ: เลือกปฏิบัติ
  // 1) ธรณีสูบ2 → อัญเชิญ Avatar จากนรก POWER≤2 ที่ไม่ใช่ {only}
  // 2) ธรณีสูบ2 → นำการ์ดจากนรกที่ไม่ใช่ {only} 1 ใบ ไว้ใต้ Deck
  'CC02-015': {
    code: 'CC02-015', name: 'หมีดำ', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      cost: [{ op: 'reveal', from: 'hand', filter: { type: 'Avatar', color: 'ม่วง' }, count: 1 }],
      actions: [{
        op: 'choose',
        options: [
          {
            cost: [{ op: 'mill', count: 2 }],
            actions: [{
              op: 'hellSummon',
              filter: { type: 'Avatar', powerMax: 2, notOnly: true },
              dest: 'avatarZone',
              paidCost: false
            }]
          },
          {
            cost: [{ op: 'mill', count: 2 }],
            actions: [{
              op: 'retrieveFromGrave',
              filter: { notOnly: true },
              count: 1,
              dest: 'deckBottom'
            }]
          }
        ]
      }]
    }],
    note: 'จุติ แสดงม่วง: 1) ธรณีสูบ2 → อัญเชิญจากนรก POWER≤2; 2) ธรณีสูบ2 → นำจากนรกใต้ Deck'
  },

  // ต่อเนื่อง ถ้า AZ ฝ่ายเรามี Avatar Overdose ชื่อไม่ซ้ำ 4 ใบ → ฝ่ายตรงข้ามใช้ React/Normal Magic ไม่ได้
  // สั่งใช้ เทิร์นละครั้ง หงาย LIFE 1 ใบ: เลือก Avatar จากนรกใดก็ได้ อัญเชิญลง AZ ของเจ้าของ
  // ถ้าเป็น Avatar ฝ่ายตรงข้าม → สั่งใช้ความสามารถไม่ได้
  'CC02-017': {
    code: 'CC02-017', name: 'มอร์ฟีน Overdose', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        condition: {
          own: { avatarZone: { filter: { nameIncludes: ['Overdose'] }, distinctNames: { min: 4 } } }
        },
        actions: [{ op: 'blockMagicTypes', types: ['React', 'Normal'], player: 'opponent' }]
      },
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'activated' },
        oncePerTurn: true,
        cost: [{ op: 'revealLife', count: 1, player: 'owner' }],
        actions: [{
          op: 'hellSummonAny',
          target: { select: 'choose', type: 'Avatar', from: 'anyGrave' },
          dest: 'ownersAvatarZone',
          paidCost: false,
          ifOpponentAvatar: { blockAbilities: true }
        }]
      }
    ],
    note: 'ต่อเนื่อง Overdose≥4 ชื่อไม่ซ้ำ→ ฝ่ายตรงข้ามใช้ Magic ไม่ได้; สั่งใช้ หงาย LIFE: อัญเชิญจากนรกใดก็ได้'
  },

  // จุติ แสดง Avatar เขียว 1 ใบจากมือ: เลือกปฏิบัติ
  // 1) Avatar 1 ใบ → ไม่ถูกทำลายจากต่อสู้ จนจบเทิร์นถัดไปของฝ่ายตรงข้าม
  // 2) Avatar 1 ใบ → ไม่รับผล Magic ฝ่ายตรงข้าม จนจบเทิร์นถัดไปของฝ่ายตรงข้าม
  'CC02-020': {
    code: 'CC02-020', name: 'หมีเหลือง', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      cost: [{ op: 'reveal', from: 'hand', filter: { type: 'Avatar', color: 'เขียว' }, count: 1 }],
      actions: [{
        op: 'choose',
        options: [
          {
            actions: [{
              op: 'grantImmunity', immunity: 'combatDestroy',
              duration: 'untilOpponentNextTurnEnd',
              target: { select: 'choose', type: 'Avatar', side: 'any', count: 1 }
            }]
          },
          {
            actions: [{
              op: 'grantImmunity', immunity: 'opponentMagic',
              duration: 'untilOpponentNextTurnEnd',
              target: { select: 'choose', type: 'Avatar', side: 'any', count: 1 }
            }]
          }
        ]
      }]
    }],
    note: 'จุติ แสดงเขียว: 1) Avatar 1 ใบ ไม่ถูกทำลายจากต่อสู้; 2) Avatar 1 ใบ ไม่รับผล Magic ตรงข้าม — จนจบเทิร์นถัดไปตรงข้าม'
  },

  // React: เลือก Avatar เราที่กำลังต่อสู้ 1 ใบ → ถ้า Avatar คู่ต่อสู้ในสภาพตื่น: ทำลาย Avatar คู่ต่อสู้นั้น
  'CC02-046': {
    code: 'CC02-046', name: 'กาจอก', parseStatus: 'auto',
    abilities: [{
      keyword: 'React',
      trigger: { on: 'duringCombat' },
      react: true,
      actions: [{
        op: 'destroyIfOpponentCombatAvatarIsAwake',
        target: { select: 'choose', type: 'Avatar', side: 'own', filter: 'inCombat', count: 1 },
        then: [{ op: 'destroyCombatOpponent' }]
      }]
    }],
    note: 'React: เลือก Avatar เราในต่อสู้ → ถ้า Avatar คู่ต่อสู้ตื่น: ทำลาย Avatar คู่ต่อสู้'
  },

  // React: เมื่อ Avatar ฝ่ายตรงข้ามโจมตีเข้า LIFE และในเทิร์นนี้มี Avatar เราถูกทำลายจากต่อสู้:
  // การโจมตีครั้งนี้ไม่ทำความเสียหาย LIFE
  'CC02-047': {
    code: 'CC02-047', name: 'เราจะตายแล้วท่านหยุดเถอะ', parseStatus: 'auto',
    abilities: [{
      keyword: 'React',
      trigger: { on: 'enemyAttackLife' },
      react: true,
      condition: { thisOwnTurn: { ownAvatarDestroyedByCombat: { min: 1 } } },
      actions: [{ op: 'preventLifeDamage' }]
    }],
    note: 'React: เมื่อ Avatar ตรงข้ามโจมตีเข้า LIFE และเทิร์นนี้ Avatar เราถูกทำลายจากต่อสู้: ป้องกันความเสียหาย LIFE'
  },

  // Land: ต่อเนื่อง ถ้า AZ ฝ่ายเรามี Avatar 2+ ใบ และ Symbol ไม่ซ้ำกัน → Avatar ทุกใบ POWER +1
  'CC02-049': {
    code: 'CC02-049', name: 'ดินแดนแห่งความหลากหลาย', parseStatus: 'auto',
    abilities: [{
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'self.zone==landZone' },
      condition: {
        own: { avatarZone: { min: 2, allDistinctSymbols: true } }
      },
      actions: [{
        op: 'modifyPower', amount: 1, duration: 'whileOnField', layer: 3,
        target: { select: 'all', type: 'Avatar', side: 'any', zone: 'avatarZone' }
      }]
    }],
    note: 'Land ต่อเนื่อง: ถ้า AZ ฝ่ายเรามี Avatar 2+ ใบ Symbol ไม่ซ้ำ → Avatar ทุกใบ POWER+1'
  },

  // Land: สั่งใช้ เทิร์นละครั้ง → เปลี่ยน Avatar {symbol ปลา} 1 ใบ เป็นนอน → สอดแนม3 เลือก Symbol ปลา 1 ขึ้นมือ ที่เหลือลงนรก
  // #นับเป็นชื่อ บึงทมิฬ
  'CC02-050': {
    code: 'CC02-050', name: 'วิหารเจ้าสมุทร', parseStatus: 'auto',
    nameAliases: ['บึงทมิฬ'],
    abilities: [{
      keyword: 'สั่งใช้',
      trigger: { on: 'activated' },
      oncePerTurn: true,
      actions: [
        {
          op: 'changeStatus', status: 'sleep',
          target: { select: 'choose', type: 'Avatar', zone: 'avatarZone', symbol: 'ปลา', count: 1 }
        },
        {
          op: 'scout', count: 3,
          filter: { symbol: 'ปลา' },
          pick: 1,
          dest: 'hand',
          restTo: 'grave'
        }
      ]
    }],
    note: 'Land นับเป็น บึงทมิฬ; สั่งใช้: เปลี่ยน Avatar ปลาเป็นนอน → สอดแนม3 เอา Symbol ปลา 1 ขึ้นมือ ที่เหลือลงนรก'
  }
};

// ==================== ODY1 Stubs (ไม่มี effect text) ====================
const ody1Fixes = {
  // ไม่มีข้อความ effect → Vanilla verified
  'ODY1-037': {
    code: 'ODY1-037', name: 'เด็กหนวด โอเดนย่า', parseStatus: 'verified',
    abilities: [], note: 'ไม่มีข้อความ effect — Vanilla'
  },
  'ODY1-038': {
    code: 'ODY1-038', name: 'กัปตันโซเดียม', parseStatus: 'verified',
    abilities: [], note: 'ไม่มีข้อความ effect — Vanilla'
  }
};

// ==================== PRMO Stubs ====================
const prmoFixes = {

  // Land: เมื่อมีการ์ดใบนี้บน Land MZ: ทั้ง 2 ฝ่ายวาง Land Magic ได้โดยไม่ทำลาย Land Magic ของอีกฝ่าย
  'PRMO-029': {
    code: 'PRMO-029', name: 'แบ่งแยกดินแดน', parseStatus: 'auto',
    abilities: [{
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'self.zone==landZone' },
      actions: [{ op: 'allowBothLandPlay' }]
    }],
    note: 'Land: ทั้ง 2 ฝ่ายวาง Land Magic ได้โดยไม่ทำลาย Land ของอีกฝ่าย'
  },

  // Land: การ์ดทุกใบต้องทิ้ง GEM พอดี Cost (exactGemPay global)
  'PRMO-039': {
    code: 'PRMO-039', name: 'หมู่บ้านพอดี', parseStatus: 'auto',
    abilities: [{
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'self.zone==landZone' },
      actions: [{ op: 'forceExactGemPay', player: 'both' }]
    }],
    note: 'Land: ทุกคนต้องทิ้ง GEM พอดี Cost'
  },

  // เมื่ออัญเชิญ: เลือกการ์ดในนรกฝ่ายตรงข้าม 1 ใบ → นำไว้ใต้ Deck ฝ่ายตรงข้าม; ถ้าสำเร็จ Avatar ตรงข้าม 1 ใบ POWER -2
  'PRMO-052': {
    code: 'PRMO-052', name: 'แม่นาค พระปะแดง', parseStatus: 'auto',
    abilities: [{
      keyword: 'อัตโนมัติ',
      trigger: { on: 'summoned' },
      actions: [
        {
          op: 'retrieveFromGrave',
          filter: {},
          from: 'opponentGrave',
          count: 1,
          dest: 'opponentDeckBottom',
          then: [{
            op: 'modifyPower', amount: -2, duration: 'endOfTurn', layer: 4,
            target: { select: 'choose', type: 'Avatar', side: 'opponent', zone: 'avatarZone', count: 1 }
          }]
        }
      ]
    }],
    note: 'เมื่ออัญเชิญ: เลือกการ์ดจากนรกตรงข้าม → ไว้ใต้ Deck ตรงข้าม; ถ้าสำเร็จ POWER-2 Avatar ตรงข้าม 1'
  },

  // ไม่มี effect text → Vanilla verified
  'PRMO-055': {
    code: 'PRMO-055', name: 'รัททาทุย ผู้พิทักษ์ราชินี', parseStatus: 'verified',
    abilities: [], note: 'ไม่มีข้อความ effect — Vanilla'
  },

  // สั่งใช้ เมื่อมีบึงทมิฬบน Land MZ; เมื่อ Avatar นี้ทำลาย Avatar ตรงข้ามสำเร็จ → ทิ้งมือ 1 กลับมาตื่น
  'PRMO-058': {
    code: 'PRMO-058', name: 'บึงทมิฬ  People - คุณดีไมส์', parseStatus: 'auto',
    abilities: [{
      keyword: 'อัตโนมัติ',
      trigger: { on: 'destroyEnemyAvatarByCombat', if: 'source==self' },
      condition: { landZone: { nameIncludes: 'บึงทมิฬ' } },
      actions: [{
        op: 'activated',
        cost: [{ op: 'discard', from: 'hand', count: 1 }],
        then: [{ op: 'changeStatus', status: 'awake', target: { select: 'self' } }]
      }]
    }],
    note: 'ถ้ามีบึงทมิฬบน Land MZ; เมื่อทำลาย Avatar ตรงข้ามสำเร็จ → ทิ้งมือ1 กลับมาตื่น'
  },

  // ใช้เป็น Cost อัญเชิญได้เฉพาะ Avatar {symbol เทพ}; เมื่อถูกใช้เป็น Cost อัญเชิญ พระนารายณ์ → POWER+3
  'PRMO-063': {
    code: 'PRMO-063', name: 'นางลักษมี', parseStatus: 'auto',
    costOnlyForSymbol: 'เทพ',
    abilities: [{
      keyword: 'อัตโนมัติ',
      trigger: { on: 'usedAsCostFor', filter: { nameIncludes: ['พระนารายณ์'] } },
      actions: [{
        op: 'modifyPower', amount: 3, duration: 'endOfTurn', layer: 4,
        target: { select: 'triggerSource' }
      }]
    }],
    note: 'ใช้เป็น Cost ได้เฉพาะ Symbol เทพ; ถ้าใช้เป็น Cost อัญเชิญพระนารายณ์ → POWER+3'
  },

  // Life x4: ใน Main Phase ถัดไป จั่ว 1
  'PRMO-080': {
    code: 'PRMO-080', name: 'ไม่นะ ผู้เล่น TOP 32!', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }],
    note: 'Life: ใน Main Phase ถัดไป จั่ว 1'
  },
  'PRMO-097': {
    code: 'PRMO-097', name: 'ไม่นะโอคุง!!', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }],
    note: 'Life: ใน Main Phase ถัดไป จั่ว 1'
  },
  'PRMO-098': {
    code: 'PRMO-098', name: 'ไม่นะฟุจัง!!', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }],
    note: 'Life: ใน Main Phase ถัดไป จั่ว 1'
  },
  'PRMO-099': {
    code: 'PRMO-099', name: 'ไม่นะ Judge!!!', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }],
    note: 'Life: ใน Main Phase ถัดไป จั่ว 1'
  },

  // จุติ ทิ้ง Land Magic 1 ใบจาก MZ: นำ Land Magic 1 ใบจาก Deck มาเล่นบน Land MZ แล้วสับ
  'PRMO-075': {
    code: 'PRMO-075', name: 'แมลงปอแจ๊ค', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      actions: [
        { op: 'destroyLand', target: { select: 'choose', type: 'Magic', subtype: 'Land', count: 1 } },
        {
          op: 'deckPick',
          filter: { type: 'Magic', subtype: 'Land' },
          dest: 'landZone',
          count: 1,
          shuffleAfter: true
        }
      ]
    }],
    note: 'จุติ: ทำลาย Land MZ → นำ Land จาก Deck เล่น Land MZ แล้วสับ'
  },

  // จุติ: สอดแนม 5 เลือก อาวุธหุ่นนักรบผู้กล้า 1 ใบขึ้นมือ ที่เหลือเรียงใต้ Deck
  // อัตโนมัติ เทิร์นละครั้ง เมื่อมีการใช้ Modification อาวุธหุ่นนักรบผู้กล้า: จั่ว 1
  'PRMO-078': {
    code: 'PRMO-078', name: 'หุ่นนักรบผู้กล้า ไมเกรน', parseStatus: 'auto',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'scout', count: 5,
          filter: { nameIncludes: ['อาวุธหุ่นนักรบผู้กล้า'] },
          pick: 1,
          dest: 'hand',
          restTo: 'deckBottom'
        }]
      },
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'magicPlayed', filter: { subtype: 'Modification', nameIncludes: ['อาวุธหุ่นนักรบผู้กล้า'] } },
        oncePerTurn: true,
        actions: [{ op: 'draw', count: 1, player: 'owner' }]
      }
    ],
    note: 'จุติ: สอดแนม5 เลือกอาวุธหุ่นนักรบผู้กล้า ขึ้นมือ; อัตโนมัติ เมื่อใช้ Modification อาวุธนั้น: จั่ว1'
  },

  // จุติ ทิ้ง Avatar ครุฑ หรือ ขนมณี แฟลร์ จากมือลงนรก: อัญเชิญ Avatar ครุฑ Cost≤4 จาก Deck แล้วสับ
  'PRMO-116': {
    code: 'PRMO-116', name: 'ครุฑ เกล - ครุฑสัจจะ เจ้าแห่งแสง', parseStatus: 'auto',
    abilities: [{
      keyword: 'จุติ',
      trigger: { on: 'summoned', if: 'paidCost' },
      cost: [{
        op: 'discard', from: 'hand', count: 1,
        filter: { type: 'Avatar', nameMatchAny: ['ครุฑ', 'ขนมณี แฟลร์'] }
      }],
      actions: [{
        op: 'deckPick',
        filter: { nameIncludes: ['ครุฑ'], costMax: 4 },
        dest: 'avatarZone',
        paidCost: false,
        shuffleAfter: true
      }]
    }],
    note: 'จุติ ทิ้ง Avatar ครุฑ/ขนมณี แฟลร์ จากมือ: อัญเชิญ Avatar ครุฑ Cost≤4 จาก Deck'
  }
};

// ==================== Apply to effect files ====================
const SETS = {
  'effects-cc01.json': cc01Fixes,
  'effects-cc02.json': cc02Fixes,
  'effects-ody1.json': ody1Fixes,
  'effects-prmo.json': prmoFixes
};

let totalUpdated = 0;
Object.entries(SETS).forEach(([file, fixes]) => {
  const j = load(file);
  const count = Object.keys(fixes).length;
  Object.values(fixes).forEach(entry => upsert(j.cards, entry));
  save(file, j);
  console.log(`Updated ${count} cards in ${file}`);
  totalUpdated += count;
});
console.log(`Total stub fixes applied: ${totalUpdated}`);

// Rebuild
console.log('Rebuilding abilities...');
const reb = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { cwd: ROOT, encoding: 'utf8' });
if (reb.stdout) process.stdout.write(reb.stdout);
if (reb.stderr) process.stderr.write(reb.stderr);
if (reb.status) { console.error('Rebuild failed!'); process.exit(reb.status); }
console.log('Stub fixes complete!');
