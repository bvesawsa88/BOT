/* ภาคีมะม่วง — เติม effects ออโต้ + rebuild abilities / effects-all */
const fs = require('fs');
const path = require('path');
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

const mangoTree = { type: 'Avatar', nameIncludes: ['มะม่วง'], symbol: 'ต้นไม้' };
const mangoTreeNotOnly = Object.assign({ excludeOnly: true }, mangoTree);
const lastWill = (fromAvatar) => ({
  keyword: 'คำสั่งเสีย',
  trigger: { on: 'destroyed' },
  ifDestroyedByOppOrNameIncludes: 'มะม่วง',
  requireFromAvatarZone: !!fromAvatar,
  actions: [{ op: 'moveSelfToMagicZone' }]
});

const BY_SET = {
  'effects-bt10.json': {
    'BT10-039': {
      code: 'BT10-039',
      name: 'มาโกะ มารดาแห่งภาคีมะม่วง',
      only: true,
      abilitiesFromMagicZone: true,
      abilities: [
        {
          trigger: { on: 'activated' },
          fromMagicZone: true,
          cost: [{ op: 'sendMagicToHell', count: 5, filter: mangoTree, excludeSelf: true }],
          actions: [{ op: 'summonSelfFromMagic', paidCost: true }]
        },
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'hellPick',
            filter: mangoTree,
            dest: 'magic',
            distinctNames: true,
            multiMax: 99,
            optional: true
          }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          actions: [{
            op: 'modifyPower',
            amountPer: 'ownMagicNameIncludes',
            nameIncludes: 'ต้นมะม่วง',
            per: 1,
            layer: 3,
            target: { select: 'self' }
          }]
        },
        {
          trigger: { on: 'activated' },
          fromAvatarZone: true,
          oncePerTurn: true,
          actions: [{
            op: 'magicPick',
            filter: mangoTree,
            dest: 'avatar',
            paidCost: true,
            excludeSelf: true
          }]
        }
      ],
      parseStatus: 'auto'
    },
    'BT10-040': {
      code: 'BT10-040',
      name: 'ผู้คุมกฎแห่งภาคีมะม่วง',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'deckPick',
            filter: mangoTreeNotOnly,
            dest: 'magic',
            shuffleAfter: true,
            thenIfExactName: 'ต้นมะม่วง',
            thenIfFound: [{
              op: 'deckOrHellPick',
              filter: mangoTree,
              dest: 'magic',
              shuffleAfterIfFromDeck: true
            }]
          }]
        },
        lastWill(false)
      ],
      parseStatus: 'auto'
    },
    'BT10-041': {
      code: 'BT10-041',
      name: 'นักรบทองแห่งภาคีมะม่วง',
      keywords: ['โล่มนุษย์'],
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'ownTurnEnd' },
          requireOwnMagicNameIncludes: 'ต้นมะม่วง',
          actions: [
            { op: 'modifyPower', amount: 2, duration: 'nextOwnDraw', target: { select: 'self' } },
            { op: 'untap', target: 'self' }
          ]
        },
        lastWill(true)
      ],
      parseStatus: 'auto'
    },
    'BT10-042': {
      code: 'BT10-042',
      name: 'ผู้พิทักษ์แห่งภาคีมะม่วง',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==magicZone' },
          protectOwnMagicNameIncludes: 'ต้นมะม่วง',
          actions: []
        },
        lastWill(true)
      ],
      parseStatus: 'auto'
    },
    'BT10-063': {
      code: 'BT10-063',
      name: 'ไปคุยกับรากมะม่วง',
      reactAnyWindow: true,
      abilities: [
        {
          keyword: 'React',
          trigger: { on: 'activated' },
          reactAnyWindow: true,
          cost: [{ op: 'sacrifice', filter: mangoTree }],
          actions: [{
            op: 'chooseDestroy',
            side: 'enemy',
            zones: ['avatar', 'magic', 'construct', 'land'],
            optional: false
          }]
        }
      ],
      parseStatus: 'auto'
    }
  },
  'effects-bt11.json': {
    'BT11-046': {
      code: 'BT11-046',
      name: 'ดยุกแห่งภาคีมะม่วง',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'chooseDestroy',
            side: 'enemy',
            zones: ['avatar'],
            filter: { type: 'Avatar' },
            costMaxPlusOwnMagicNameIncludes: { nameIncludes: 'ต้นมะม่วง', base: 2, per: 1 },
            optional: true
          }]
        },
        lastWill(false)
      ],
      parseStatus: 'auto'
    },
    'BT11-070': {
      code: 'BT11-070',
      name: 'มะม่วงดราชิลด์',
      abilities: [
        {
          trigger: { on: 'static', if: 'self.zone==landZone' },
          requireOwnMagicNameIncludesMin: { nameIncludes: 'ต้นมะม่วง', min: 1 },
          immuneAbilityDestroy: true,
          actions: []
        },
        {
          trigger: { on: 'static', if: 'self.zone==landZone' },
          requireOwnMagicNameIncludesMin: { nameIncludes: 'ต้นมะม่วง', min: 2 },
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
              nameIncludes: ['มะม่วง'],
              symbol: 'ต้นไม้'
            }
          }]
        },
        {
          trigger: { on: 'static', if: 'self.zone==landZone' },
          requireOwnMagicNameIncludesMin: { nameIncludes: 'ต้นมะม่วง', min: 3 },
          untargetableOwnNameIncludes: 'มะม่วง',
          untargetableOwnSymbol: 'ต้นไม้',
          untargetableOwnZones: ['avatar', 'magic', 'construct'],
          actions: []
        },
        {
          trigger: { on: 'activated' },
          oncePerTurn: true,
          requireOwnMagicNameIncludesMin: { nameIncludes: 'ต้นมะม่วง', min: 4 },
          actions: [{
            op: 'hellPick',
            filter: mangoTree,
            dest: 'magic'
          }]
        }
      ],
      parseStatus: 'auto'
    }
  }
};

Object.entries(BY_SET).forEach(([file, map]) => {
  const j = load(file);
  Object.values(map).forEach(entry => upsert(j.cards, entry));
  save(file, j);
  console.log('updated', file, Object.keys(map).join(', '));
});

console.log('run: node tools/rebuild-abilities.js');
