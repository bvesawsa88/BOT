const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
}

function saveJson(file, data) {
  fs.writeFileSync(path.join(ROOT, 'data', file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const PATCHES = {
  // BT05-003
  'BT05-003': {
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          {
            op: 'deckPick',
            filter: { type: 'Magic', nameIncludes: ['ดาบศักดิ์สิทธิ์'] },
            dest: 'hell',
            shuffleAfter: true
          },
          {
            op: 'hellPick',
            filter: { type: 'Avatar', nameIncludes: ['อัศวินโต๊ะกลม'] },
            dest: 'deckTop',
            optional: true
          },
          {
            op: 'modifyPower',
            amount: 1,
            duration: 'endOfTurn',
            target: { select: 'self' }
          }
        ]
      }
    ],
    note: 'จุติ : นำการ์ด Magic ดาบศักดิ์สิทธิ์ 1 ใบจาก Deck ลงนรก สับ Deck แล้วนำ Avatar อัศวินโต๊ะกลม 1 ใบจากนรกไว้บนสุดของ Deck และ POWER +1'
  },
  // BT05-004
  'BT05-004': {
    grantKeywordIfAllyNameIncludes: { name: 'อัศวินโต๊ะกลม', keyword: 'สามัคคี' },
    destroyEnemyAnyOnSummonedByAvatarNameIncludes: 'อัศวินโต๊ะกลม',
    abilities: [
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'summonedByAvatarNameIncludes', name: 'อัศวินโต๊ะกลม' },
        actions: [
          {
            op: 'chooseDestroy',
            target: { select: 'choose', side: 'enemy', count: 1 }
          }
        ]
      },
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'ownFieldHasOtherName:อัศวินโต๊ะกลม' },
        actions: [
          {
            op: 'grantKeywordToHost',
            keyword: 'สามัคคี'
          }
        ]
      }
    ],
    note: 'ทำลาย 1 ใบเมื่อจุติจากอัศวินโต๊ะกลม / ได้สามัคคีถ้ามีพวก'
  },
  // BT05-014
  'BT05-014': {
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          {
            op: 'scout',
            count: 2,
            filter: { nameIncludes: ['อัศวินโต๊ะกลม'] },
            dest: 'avatar',
            paidCost: false,
            restTo: 'bottom',
            shuffleAfter: true,
            thenIfColor: {
              'แดง': [
                {
                  op: 'modifyPower',
                  amount: 1,
                  duration: 'endOfTurn',
                  target: { select: 'all', side: 'own', nameIncludes: ['อัศวินโต๊ะกลม'] }
                }
              ],
              'ฟ้า': [
                { op: 'draw', count: 1 }
              ]
            }
          }
        ]
      }
    ],
    note: 'จุติ : สอดแนม 2 ใบ เรียก อัศวินโต๊ะกลม (แดง = ทั้งหมด POWER +1, ฟ้า = จั่ว 1)'
  },
  // BT05-015
  'BT05-015': {
    keywords: ['โล่มนุษย์'],
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone,oppTurn' },
        actions: [
          {
            op: 'modifyPower',
            amount: 2,
            duration: 'whileOnField',
            layer: 3,
            target: { select: 'self' }
          }
        ]
      }
    ],
    note: 'โล่มนุษย์ / POWER +2 ในเทิร์นคู่แข่ง'
  },
  // BT05-064
  'BT05-064': {
    attachOnly: 'Avatar',
    hostAttachNameIncludes: 'อัศวินโต๊ะกลม',
    hostBlockHumanShield: true,
    abilities: [
      {
        trigger: { on: 'static', if: 'self.attached' },
        actions: [
          {
            op: 'modifyPower',
            amount: 1,
            duration: 'whileEquipped',
            layer: 2,
            target: { select: 'equippedAvatar' }
          }
        ]
      },
      {
        trigger: { on: 'activatedFromHell', if: 'noModUsedThisTurn' },
        cost: [{ op: 'millSelf', count: 1 }],
        actions: [
          { op: 'attachFromHellToAvatar', targetFilter: { nameIncludes: ['อัศวินโต๊ะกลม'] } }
        ]
      }
    ],
    note: 'สวม อัศวินโต๊ะกลม / POWER +1 / ห้ามใช้โล่มนุษย์ป้องกัน / สวมจากนรกได้ถ้ายังไม่ได้ใช้ Mod'
  },
  // BT06-006
  'BT06-006': {
    uniqueOnField: true,
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          {
            op: 'deckPick',
            filter: { type: 'Magic', subtype: 'Modification', nameIncludes: ['ดาบศักดิ์สิทธิ์'] },
            count: 2,
            multiMax: 2,
            multiExact: 2,
            dest: 'hell',
            shuffleAfter: true
          },
          {
            op: 'deckPick',
            filter: { type: 'Avatar', nameIncludes: ['อัศวินโต๊ะกลม'] },
            dest: 'avatar',
            paidCost: false,
            restrictSameNameAttackAndEffectUntilEndOfTurn: true,
            shuffleAfter: true
          }
        ]
      }
    ],
    note: 'จุติ : ส่ง ดาบศักดิ์สิทธิ์ 2 ใบจาก Deck ลงนรก แล้วเรียก อัศวินโต๊ะกลม 1 ใบจาก Deck (ห้ามโจมตี/ใช้ผลตัวชื่อซ้ำจนจบเทิร์น)'
  },
  // BT06-007
  'BT06-007': {
    abilities: [
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'targetedByAttack', if: 'oppTurn' },
        oncePerTurn: true,
        cost: [
          {
            op: 'sendMagicOnFieldToHell',
            filter: { subtype: 'Modification', nameIncludes: ['ดาบศักดิ์สิทธิ์'] },
            count: 1
          }
        ],
        actions: [
          {
            op: 'modifyPower',
            amount: 2,
            duration: 'endOfTurn',
            target: { select: 'choose', side: 'own', type: 'Avatar', nameIncludes: ['อัศวินโต๊ะกลม'] }
          }
        ]
      }
    ],
    note: 'ในเทิร์นศัตรูเมื่ออัศวินถูกโจมตี ส่ง ดาบศักดิ์สิทธิ์ ลงนรก : อัศวินโต๊ะกลม POWER +2'
  },
  // BT06-058
  'BT06-058': {
    attachOnly: 'Avatar',
    hostAttachNameIncludes: 'อัศวินโต๊ะกลม',
    abilities: [
      {
        trigger: { on: 'static', if: 'self.attached,host.untapped' },
        actions: [
          { op: 'immuneHostMagicDestroy' }
        ]
      },
      {
        trigger: { on: 'activatedFromHell', if: 'noModUsedThisTurn' },
        cost: [{ op: 'millSelf', count: 1 }],
        actions: [
          { op: 'attachFromHellToAvatar', targetFilter: { nameIncludes: ['อัศวินโต๊ะกลม'] } }
        ]
      }
    ],
    note: 'สวม อัศวินโต๊ะกลม / ไม่ถูกทำลายด้วยผลของ Magic ถ้าตื่นอยู่ / สวมจากนรกได้ถ้ายังไม่ได้ใช้ Mod'
  },
  // BT07-021
  'BT07-021': {
    abilities: [
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'activatedFromHand' },
        cost: [
          { op: 'discardCardsWithGemTotal', targetGem: 3 }
        ],
        actions: [
          { op: 'summonSelfFromHand', setBasePower: 3 }
        ]
      }
    ],
    note: 'สั่งใช้จากมือ : ทิ้งการ์ดที่มี GEM รวมกันเท่ากับ 3 อัญเชิญลงสนาม POWER ตั้งต้น 3'
  },
  // BT08-008
  'BT08-008': {
    costFourIfOwnModMagicMin2: true,
    abilities: [
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [
          {
            op: 'modifyPower',
            amountPer: 'distinctOwnMagicNameIncludes',
            nameIncludes: ['ดาบศักดิ์สิทธิ์'],
            per: 1,
            layer: 3,
            target: { select: 'self' }
          }
        ]
      }
    ],
    note: 'มี ดาบศักดิ์สิทธิ์ 2+ ใบใน Magic Zone Cost = 4 / POWER +1 ตามจำนวน ดาบศักดิ์สิทธิ์ ชื่อซ้ำไม่นับ'
  },
  // BT08-017
  'BT08-017': {
    abilities: [
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'attachedByMod', filter: { nameIncludes: ['ดาบศักดิ์สิทธิ์'] } },
        oncePerTurn: true,
        cost: [
          { op: 'sacrifice', filter: { type: 'Avatar', exceptSelf: true }, count: 1 }
        ],
        actions: [
          {
            op: 'hellPick',
            filter: { type: 'Avatar', color: 'ฟ้า', nameIncludes: ['อัศวินโต๊ะกลม'] },
            dest: 'avatar',
            paidCost: true
          }
        ]
      }
    ],
    note: 'เมื่อถูกสวม ดาบศักดิ์สิทธิ์ : เซ่นไหว้ 1 ใบ อัญเชิญ อัศวินโต๊ะกลม สีฟ้า จากนรก'
  },
  // BT08-059
  'BT08-059': {
    attachOnly: 'Avatar',
    hostAttachNameIncludes: 'อัศวินโต๊ะกลม',
    abilities: [
      {
        trigger: { on: 'hostDestroyedEnemyInBattle' },
        actions: [
          { op: 'destroyEnemyMagicOnField' }
        ]
      },
      {
        trigger: { on: 'static', if: 'self.attachedTo:มอเดรด' },
        actions: [
          { op: 'grantKeywordToHost', keyword: 'เตะไข่' }
        ]
      },
      {
        trigger: { on: 'activatedFromHell', if: 'noModUsedThisTurn' },
        cost: [{ op: 'millSelf', count: 1 }],
        actions: [
          { op: 'attachFromHellToAvatar', targetFilter: { nameIncludes: ['อัศวินโต๊ะกลม'] } }
        ]
      }
    ],
    note: 'สวม อัศวินโต๊ะกลม / ทำลายศัตรูจากการต่อสู้ -> ทำลาย Magic ศัตรู / สวม มอเดรด ได้ เตะไข่ / สวมจากนรกได้'
  },
  // BT08-060
  'BT08-060': {
    attachOnly: 'Avatar',
    hostAttachNameIncludes: 'อาเธอร์',
    protectReplace: true,
    protectReplaceIfHostNameIncludes: 'อาเธอร์',
    abilities: [
      {
        trigger: { on: 'static', if: 'self.attached' },
        actions: [
          {
            op: 'modifyPower',
            amount: 2,
            duration: 'whileEquipped',
            layer: 2,
            target: { select: 'equippedAvatar' }
          }
        ]
      },
      {
        trigger: { on: 'activatedFromHell', if: 'noModUsedThisTurn' },
        actions: [
          { op: 'attachFromHellToAvatar', targetFilter: { nameIncludes: ['อาเธอร์'] } }
        ]
      }
    ],
    note: 'สวม อาเธอร์ / POWER +2 / ป้องกันการออกจากสนามแทน อาเธอร์ / สวมจากนรกได้'
  },
  // BT10-022
  'BT10-022': {
    keywords: ['โล่มนุษย์'],
    extraColors: ['แดง'],
    abilities: [
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'targetedByAttack' },
        actions: [
          {
            op: 'modifyPower',
            amount: -2,
            duration: 'endOfCombat',
            layer: 4,
            target: { select: 'attacker' }
          }
        ]
      }
    ],
    note: 'โล่มนุษย์ / ถูกโจมตี -> ผู้โจมตี POWER -2 / นับว่าเป็นสีแดงด้วย'
  },
  // BT11-003
  'BT11-003': {
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          {
            op: 'hellPick',
            filter: { nameIncludes: ['ไอ้นัท'] },
            dest: 'attachToSelf'
          }
        ]
      },
      {
        keyword: 'สั่งใช้',
        trigger: { on: 'enemyActivateAbility', if: 'onlyTalingchanAvatarsOnField' },
        oncePerTurn: true,
        cost: [
          { op: 'exileAttachedCards', count: 2 }
        ],
        actions: [
          { op: 'negateCardAbility' }
        ]
      },
      {
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        actions: [
          {
            op: 'modifyPower',
            amountPer: 'attachedCardsCount',
            per: 1,
            layer: 3,
            target: { select: 'self' }
          }
        ]
      }
    ],
    note: 'จุติ : นำ ไอ้นัท จากนรกมาสวม / ยกเลิกเอฟเฟกต์ศัตรูโดยเนรเทศการ์ดที่สวม 2 ใบ / POWER +1 ตามจำนวนการ์ดที่สวม'
  },
  // BT11-018
  'BT11-018': {
    abilities: [
      {
        keyword: 'อัตโนมัติ',
        trigger: { on: 'declareAttack', if: 'source==self' },
        actions: [
          {
            op: 'modifyPower',
            amountPer: 'ownAvatarNameIncludesCount',
            nameIncludes: ['ไอ้นัท', 'เซอร์นัท'],
            per: 1,
            duration: 'endOfTurn',
            layer: 4,
            target: { select: 'self' }
          }
        ]
      }
    ],
    note: 'เมื่อโจมตี : POWER +1 ตามจำนวน ไอ้นัท/เซอร์นัท ฝ่ายเรา'
  },
  // BT11-033
  'BT11-033': {
    nameAliases: ['เลอร์ติ๊ก เด็กไม่ชอบแดรคคูลา'],
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          {
            op: 'scout',
            count: 5,
            filter: { nameIncludes: ['ไอ้นัท', 'เซอร์นัท', 'อัศวินตลิ่งชัน'] },
            dest: 'hand',
            pickCount: 1,
            restTo: 'deck',
            shuffle: true
          }
        ]
      }
    ],
    note: 'จุติ : สอดแนม 5 ใบ เอา ไอ้นัท/เซอร์นัท/อัศวินตลิ่งชัน ขึ้นมือ / มีชื่อ เลอร์ติ๊ก เด็กไม่ชอบแดรคคูลา ด้วย'
  },
  // BT11-057
  'BT11-057': {
    abilities: [
      {
        trigger: { on: 'activated' },
        actions: [
          { op: 'summonKnightTalingchanFromHellAndDrawIfChachaMemmi' }
        ]
      }
    ],
    note: 'เรียก อัศวินตลิ่งชัน Cost <= ไอ้นัท/เซอร์นัท จากนรก (มี ชาช่า/มีมมิ จั่ว 1)'
  },
  // BT11-064
  'BT11-064': {
    attachOnly: 'Avatar',
    hostAttachNameIncludes: ['ไอ้นัท', 'เซอร์นัท'],
    abilities: [
      {
        trigger: { on: 'static', if: 'self.attachedTo:เซอร์นัท' },
        actions: [
          {
            op: 'modifyPower',
            amount: 1,
            layer: 3,
            target: { select: 'allOther', side: 'own', nameIncludes: ['อัศวินตลิ่งชัน'] }
          }
        ]
      }
    ],
    note: 'สวม ไอ้นัท/เซอร์นัท (ถ้าสวม เซอร์นัท: อัศวินตลิ่งชัน อื่นทุกใบ POWER +1)'
  }
};

const fileMap = {
  'BT05-003': 'effects-bt05.json',
  'BT05-004': 'effects-bt05.json',
  'BT05-014': 'effects-bt05.json',
  'BT05-015': 'effects-bt05.json',
  'BT05-064': 'effects-bt05.json',
  'BT06-006': 'effects-bt06.json',
  'BT06-007': 'effects-bt06.json',
  'BT06-058': 'effects-bt06.json',
  'BT07-021': 'effects-bt07.json',
  'BT08-008': 'effects-bt08.json',
  'BT08-017': 'effects-bt08.json',
  'BT08-059': 'effects-bt08.json',
  'BT08-060': 'effects-bt08.json',
  'BT10-022': 'effects-bt10.json',
  'BT11-003': 'effects-bt11.json',
  'BT11-018': 'effects-bt11.json',
  'BT11-033': 'effects-bt11.json',
  'BT11-057': 'effects-bt11.json',
  'BT11-064': 'effects-bt11.json'
};

const cache = {};

for (const code in PATCHES) {
  const file = fileMap[code];
  if (!file) continue;
  if (!cache[file]) cache[file] = loadJson(file);
  const data = cache[file];
  const card = (data.cards || []).find(c => c.code === code);
  if (card) {
    Object.assign(card, PATCHES[code]);
    console.log('Patched', code, 'in', file);
  } else {
    console.warn('Card not found:', code, 'in', file);
  }
}

for (const file in cache) {
  saveJson(file, cache[file]);
  console.log('Saved', file);
}

console.log('Running rebuild-abilities.js ...');
const reb = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { cwd: ROOT, encoding: 'utf8' });
console.log(reb.stdout);
if (reb.stderr) console.error(reb.stderr);
console.log('Done patching Knight effects!');
