/* หน่วยรบ XVI — ต่อเนื่อง +P เฉพาะชื่อ "หน่วยรบ XVI" (ไม่บัฟรถถัง) + จุติจริง */
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

const XVI_AURA = {
  keyword: 'ต่อเนื่อง',
  trigger: { on: 'static', if: 'self.zone==avatarZone' },
  actions: [{
    op: 'modifyPower',
    amount: 1,
    duration: 'whileOnField',
    layer: 3,
    target: {
      select: 'all',
      type: 'Avatar',
      side: 'own',
      zone: 'avatarZone',
      nameIncludes: ['หน่วยรบ XVI']
    }
  }]
};

const BY_SET = {
  'effects-bt11.json': {
    'BT11-014': {
      code: 'BT11-014',
      name: 'มิเรีย หน่วยรบ XVI',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'scout',
            count: 3,
            filter: {
              excludeOnly: true,
              nameOrSymbol: [
                { nameIncludes: ['หน่วยรบ XVI'] },
                { symbol: 'ทหาร' }
              ]
            },
            dest: 'hand',
            restTo: 'bottom'
          }]
        },
        XVI_AURA
      ],
      parseStatus: 'verified',
      note: 'จุติ: สอดแนม 3 เอาหน่วยรบ XVI หรือเวททหารขึ้นมือ (ไม่ใช่ only) · ต่อเนื่อง +1 เฉพาะหน่วยรบ XVI'
    },
    'BT11-015': {
      code: 'BT11-015',
      name: 'ฮินะ หน่วยรบ XVI',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'hellPick',
            filter: { type: 'Magic', symbol: 'ทหาร' },
            dest: 'hand',
            optional: true
          }]
        },
        XVI_AURA
      ],
      parseStatus: 'verified',
      note: 'จุติ: เวททหารจากนรกขึ้นมือ · ต่อเนื่อง +1 เฉพาะหน่วยรบ XVI'
    },
    'BT11-016': {
      code: 'BT11-016',
      name: 'คาร์ร่า หน่วยรบ XVI',
      grantKeywordAura: {
        keyword: 'โล่มนุษย์',
        side: 'own',
        nameIncludes: ['หน่วยรบ XVI'],
        onlyOppTurn: true
      },
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          oncePerTurn: true,
          actions: [{
            op: 'scout',
            count: 3,
            filter: { nameIncludes: ['หน่วยรบ XVI'], excludeOnly: true },
            dest: 'avatar',
            paidCost: true,
            restTo: 'hell'
          }]
        }
      ],
      parseStatus: 'verified',
      note: 'เทิร์นละครั้ง สั่งใช้: สอดแนม 3 อัญเชิญจุติหน่วยรบ XVI (ไม่ใช่ only) ที่เหลือลงนรก · เทิร์นศัตรูหน่วยรบ XVI ได้โล่มนุษย์'
    },
    'BT11-052': {
      code: 'BT11-052',
      name: 'โอเปอเรชั่น : สเกาท์',
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{
          op: 'scout',
          count: 3,
          filter: { nameIncludes: ['หน่วยรบ XVI'], excludeOnly: true },
          dest: 'avatar',
          paidCost: true,
          restTo: 'bottom'
        }]
      }],
      parseStatus: 'verified',
      note: 'สอดแนม 3 อัญเชิญจุติหน่วยรบ XVI 1 ใบ ที่เหลือใต้เด็ค'
    },
    'BT11-053': {
      code: 'BT11-053',
      name: 'โอเปอเรชั่น : รอยัล',
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{
          op: 'tap',
          from: 'own',
          filter: { type: 'Avatar', nameIncludes: ['หน่วยรบ XVI'] },
          requireUntapped: true,
          multiExact: 2,
          optional: false,
          then: [{
            op: 'chooseDestroy',
            side: 'enemy',
            zones: ['avatar'],
            filter: { type: 'Avatar' }
          }]
        }]
      }],
      parseStatus: 'verified',
      note: 'พักหน่วยรบ XVI ที่ตื่น 2 ใบ : ทำลาย Avatar ศัตรู 1 ใบ'
    },
    'BT11-017': {
      code: 'BT11-017',
      name: 'เอริ หน่วยรบ XVI',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'declareAttack', if: 'source==self' },
          actions: [{
            op: 'scout',
            count: 3,
            filter: { nameIncludes: ['หน่วยรบ XVI'], excludeOnly: true },
            dest: 'avatar',
            paidCost: false,
            restTo: 'hell'
          }]
        },
        XVI_AURA
      ],
      parseStatus: 'verified',
      note: 'โจมตี: สอดแนม 3 อัญเชิญหน่วยรบ XVI (ไม่จุติ) ที่เหลือลงนรก · สนามเต็มยังโชว์สอดแนม แต่ลงนรกไม่ขึ้นมือ · ต่อเนื่อง +1 เฉพาะหน่วยรบ XVI'
    },
    'BT11-071': {
      code: 'BT11-071',
      name: 'โรงเรียนฝึกหน่วยรบ',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'declareAttack' },
          actions: [{
            op: 'modifyPower',
            amount: 1,
            duration: 'combat',
            ifAttackerNameIncludes: 'หน่วยรบ XVI',
            target: { select: 'attacker' }
          }]
        },
        {
          trigger: { on: 'activated' },
          oncePerTurn: true,
          cost: [{ op: 'discard', from: 'hand', count: 1 }],
          actions: [{
            op: 'hellPick',
            filter: { nameIncludes: ['หน่วยรบ XVI'] },
            dest: 'deckBottom',
            optional: true
          }]
        }
      ],
      parseStatus: 'verified',
      note: 'หน่วยรบ XVI โจมตี +1 จนจบการต่อสู้ · สั่งใช้ทิ้งมือ: หน่วยรบจากนรกใต้เด็ค'
    }
  },
  'effects-cc02.json': {
    'CC02-048': {
      code: 'CC02-048',
      name: 'ปืนจักรวุทธ',
      hostMustAttack: true,
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'declareAttack' },
          actions: [{
            op: 'modifyPower',
            amount: 4,
            duration: 'combat',
            target: { select: 'self' }
          }]
        },
        {
          keyword: 'อัตโนมัติ',
          oncePerTurn: true,
          oncePerTurnTag: 'battleDestroy',
          trigger: { on: 'battleDestroy' },
          actions: [
            { op: 'untapHost' },
            { op: 'hostNoUntapExceptSelf' }
          ]
        },
        {
          keyword: 'สั่งใช้',
          oncePerTurn: true,
          requireAttached: true,
          trigger: { on: 'activated' },
          actions: [
            { op: 'untapHost' },
            { op: 'returnToHand', target: 'self' }
          ]
        }
      ],
      parseStatus: 'verified',
      note: '+4 เฉพาะตอนประกาศโจมตีจนจบการต่อสู้ · ต้องโจมตีถ้าทำได้ · ฆ่าศัตรูแล้วตื่น 1 ครั้ง/เทิร์น แล้วห้ามตื่นยกเว้นสั่งใช้ Main ของใบนี้'
    }
  }
};

Object.entries(BY_SET).forEach(([file, map]) => {
  const j = load(file);
  Object.values(map).forEach(entry => upsert(j.cards, entry));
  save(file, j);
  console.log('updated', file, Object.keys(map).join(', '));
});

const rb = spawnSync(process.execPath, [path.join(__dirname, 'rebuild-abilities.js')], {
  cwd: ROOT, stdio: 'inherit'
});
if (rb.status !== 0) process.exit(rb.status || 1);
