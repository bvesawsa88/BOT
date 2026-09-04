/* Apply full JSON ability definitions for Starter Deck 09 (เด็ควานร / SD09) */
const fs = require('fs');
const path = require('path');

const fileSD09 = path.join(__dirname, '../data/effects-sd09.json');
const sd09Data = JSON.parse(fs.readFileSync(fileSD09, 'utf8'));

const SD09_EFFECTS = {
  'SD09-001': {
    code: 'SD09-001', name: 'หนุมาน วานรวายุ', parseStatus: 'manual',
    keywords: ['โล่มนุษย์'],
    specialSummon: {
      from: 'hand',
      cost: { sacrificeOwnAvatar: { count: 2, nameIncludes: ['วานร'] } }
    },
    abilities: [
      {
        keyword: 'Link',
        link: { partner: 'SD09-002' },
        trigger: { on: 'leavingFieldByEnemyCard' },
        oncePerTurn: true,
        actions: [{ op: 'scoutPreventLeaveIfMonkey' }]
      },
      {
        keyword: 'อัตโนมัติ', trigger: { on: 'declareAttack', if: 'source==self' },
        actions: [{ op: 'modifyPower', amount: 1, duration: 'endOfTurn', layer: 4, target: { select: 'self' } }]
      }
    ]
  },
  'SD09-002': {
    code: 'SD09-002', name: 'นิลพัท วานรสีกาฬ', parseStatus: 'manual',
    keywords: ['สามัคคี'],
    specialSummon: {
      from: 'hand',
      cost: { sacrificeOwnAvatar: { count: 2, nameIncludes: ['วานร'] } }
    },
    abilities: [
      {
        keyword: 'Link',
        link: { partner: 'SD09-001' },
        trigger: { on: 'linkActivated' },
        actions: [{ op: 'summonToken', count: 2, name: 'วานร', power: 1, cost: 1, color: 'เขียว', symbol: 'สัตว์' }]
      },
      {
        keyword: 'ต่อเนื่อง', trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [{ op: 'modifyPowerPerMonkeyToken', amountPerToken: 1, target: { select: 'self' } }]
      }
    ]
  },
  'SD09-003': {
    code: 'SD09-003', name: 'สุครีพ วานรปากแซ่บ', parseStatus: 'manual',
    abilities: [{
      keyword: 'อัตโนมัติ', trigger: { on: 'ownMainPhaseStart' },
      actions: [{ op: 'setChosenEnemyCostsToLowest', count: 2 }]
    }]
  },
  'SD09-004': {
    code: 'SD09-004', name: 'พาลี วานรแห่งเมืองขีดขิน', parseStatus: 'manual',
    abilities: [
      {
        keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'destroyEnemyLowestCost' }]
      },
      {
        keyword: 'อัตโนมัติ', trigger: { on: 'ownMainPhaseStart' },
        actions: [{ op: 'destroyEnemyLowestCost' }]
      }
    ]
  },
  'SD09-005': {
    code: 'SD09-005', name: 'คิงคา วานรเจ้าป่า', parseStatus: 'manual',
    abilities: [{
      keyword: 'จุติ', trigger: { on: 'summoned', if: 'paidCost' },
      requireOwnHellMonkeyMin: 4,
      actions: [{ op: 'summonToken', count: 1, name: 'วานร', power: 1, cost: 1, color: 'เขียว', symbol: 'สัตว์' }]
    }]
  },
  'SD09-006': {
    code: 'SD09-006', name: 'วานรกินซากลากอเวจี', parseStatus: 'manual',
    abilities: [{
      keyword: 'คำสั่งเสีย', trigger: { on: 'destroyed' },
      requireOwnHellMonkeyMin: 4,
      actions: [{ op: 'summonToken', count: 1, name: 'วานร', power: 1, cost: 1, color: 'เขียว', symbol: 'สัตว์' }]
    }]
  },
  'SD09-007': {
    code: 'SD09-007', name: 'วานรถลกหนังฝังกระดูก', parseStatus: 'manual',
    abilities: [{
      keyword: 'อัตโนมัติ', trigger: { on: 'sacrificedForMonkeySummon' },
      actions: [{ op: 'summonToken', count: 1, name: 'วานร', power: 1, cost: 1, color: 'เขียว', symbol: 'สัตว์' }]
    }]
  },
  'SD09-008': {
    code: 'SD09-008', name: 'วานรหมวกเหล็ก', parseStatus: 'manual',
    abilities: [{
      keyword: 'ต่อเนื่อง', trigger: { on: 'static', if: 'self.zone==avatarZone' },
      actions: [{ op: 'grantKeyword', keyword: 'ลูกฮึด', target: { select: 'all', type: 'Avatar', side: 'own', nameIncludes: ['วานร'] } }]
    }]
  },
  'SD09-009': {
    code: 'SD09-009', name: 'ดารา นางชั่ว', parseStatus: 'manual',
    abilities: [{
      trigger: { on: 'activated' }, oncePerTurn: true,
      cost: { sacrificeOwnAvatar: { count: 2, symbol: 'สัตว์' } },
      actions: [{ op: 'summonFromHell', filter: { nameIncludes: ['พาลี'] } }]
    }]
  },
  'SD09-010': {
    code: 'SD09-010', name: 'วานร ซีซ่าสลัด', parseStatus: 'manual',
    abilities: [{
      keyword: 'คำสั่งเสีย', trigger: { on: 'destroyed' },
      actions: [{ op: 'scoutAndSummon', count: 3, filter: { type: 'Avatar', nameIncludes: ['วานร'], maxCost: 4 }, restToBottom: true }]
    }]
  },
  'SD09-013': {
    code: 'SD09-013', name: 'หนุมานถวายแหวน', parseStatus: 'manual',
    abilities: [{
      trigger: { on: 'activated' },
      cost: { discardFromHand: { count: 1, nameIncludes: ['วานร'] } },
      actions: [{ op: 'destroyEnemyAvatar', count: 1 }]
    }]
  },
  'SD09-014': {
    code: 'SD09-014', name: 'เลือกตั้งเจ้าป่า', parseStatus: 'manual',
    abilities: [{
      trigger: { on: 'activated' },
      cost: { sacrificeOwnAvatar: { count: 1, nameIncludes: ['วานร'] } },
      actions: [{ op: 'scoutAndPickOrSummonKingka', count: 7, filter: { type: 'Avatar', nameIncludes: ['วานร'], maxCost: 5 } }]
    }]
  },
  'SD09-015': {
    code: 'SD09-015', name: 'เตรียมเสบียง', parseStatus: 'manual',
    abilities: [{
      trigger: { on: 'activated' },
      actions: [{ op: 'bothPlayersPutHellAvatarToTopDeck', maxCost: 4 }]
    }]
  },
  'SD09-016': {
    code: 'SD09-016', name: 'ชีวิตเหนือหน้าที่', parseStatus: 'manual',
    keywords: ['React'], reactAnyWindow: true,
    abilities: [{
      keyword: 'React', trigger: { on: 'enemyDeclareAttack' },
      cost: { putOwnAvatarToTopDeck: { nameIncludes: ['วานร'] } },
      actions: [{ op: 'cancelAttack' }]
    }]
  },
  'SD09-017': {
    code: 'SD09-017', name: 'วานรร้อนรัก', parseStatus: 'manual',
    keywords: ['React'], reactAnyWindow: true,
    abilities: [{
      keyword: 'React', trigger: { on: 'ownAvatarFights' },
      cost: { sacrificeOtherOwnAvatar: { nameIncludes: ['วานร'] } },
      actions: [{ op: 'modifyPower', amount: 2, duration: 'endOfTurn', layer: 4, target: { select: 'battlingAvatar' } }]
    }]
  },
  'SD09-018': {
    code: 'SD09-018', name: 'ตรีเพชร', parseStatus: 'manual',
    attachOnly: { type: 'Avatar', nameIncludes: ['วานร'] },
    abilities: [{
      trigger: { on: 'activated' },
      cost: { destroyHostAvatar: true },
      actions: [{ op: 'summonFromHell', filter: { nameIncludes: ['หนุมาน', 'นิลพัท'] } }]
    }]
  },
  'SD09-019': {
    code: 'SD09-019', name: 'ดาบพระขรรค์', parseStatus: 'auto',
    attachOnly: { type: 'Avatar', nameIncludes: ['วานร'] },
    abilities: [{
      trigger: { on: 'static', if: 'self.attached' },
      actions: [{ op: 'modifyPower', amount: 2, duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
    }]
  },
  'SD09-020': {
    code: 'SD09-020', name: 'ป่าแห่งเมืองขีดขิน', parseStatus: 'manual',
    abilities: [{
      trigger: { on: 'activated' }, oncePerTurn: true,
      cost: { sacrificeOwnAvatar: { count: 1, nameIncludes: ['วานร'] } },
      actions: [{ op: 'draw', count: 1 }]
    }]
  },
  'SD09-021': {
    code: 'SD09-021', name: 'ไม่นะ หนุมาน', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }]
  },
  'SD09-022': {
    code: 'SD09-022', name: 'ไม่นะ นิลพัท', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }]
  },
  'SD09-023': {
    code: 'SD09-023', name: 'ไม่นะ คิงคา', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      requireOwnHellMonkeyMin: 4,
      actions: [{ op: 'summonToken', count: 1, name: 'วานร', power: 1, cost: 1, color: 'เขียว', symbol: 'สัตว์', schedule: 'nextOwnMainPhase' }]
    }]
  },
  'SD09-024': {
    code: 'SD09-024', name: 'นังชั่ว ตายแล้ว (ดารา)', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      requireOwnHellMonkeyMin: 4,
      actions: [{ op: 'summonToken', count: 1, name: 'วานร', power: 1, cost: 1, color: 'เขียว', symbol: 'สัตว์', schedule: 'nextOwnMainPhase' }]
    }]
  },
  'SD09-025': {
    code: 'SD09-025', name: 'ไม่นะ สุครีพ', parseStatus: 'auto',
    abilities: [{
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    }]
  }
};

const cardsList = Array.isArray(sd09Data.cards) ? sd09Data.cards : (Array.isArray(sd09Data) ? sd09Data : Object.values(sd09Data));

let count = 0;
Object.keys(SD09_EFFECTS).forEach(code => {
  const entry = SD09_EFFECTS[code];
  const idx = cardsList.findIndex(c => c.code === code);
  if (idx >= 0) {
    cardsList[idx] = Object.assign({}, cardsList[idx], entry);
  } else {
    cardsList.push(entry);
  }
  count++;
});

fs.writeFileSync(fileSD09, JSON.stringify(sd09Data, null, 2), 'utf8');
console.log(`Successfully updated ${count} SD09 card ability entries in ${fileSD09}`);
