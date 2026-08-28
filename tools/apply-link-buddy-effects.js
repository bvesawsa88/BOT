/* Link / คู่หู — เพมมุ สไปรท์ เจ้าหญิง · โฮคุ โกลเด้น · เดสสึหวา โลกิ · มิสทรอม่า ดินแดนยุติธรรม ออส่วนบอย */
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

const BY_SET = {
  'effects-bt09.json': {
    'BT09-007': {
      code: 'BT09-007',
      name: 'โฮคุ โพลีกอน',
      extraSymbols: ['สัตว์'],
      onlyAttackableAllyNameIncludes: 'โฮคุ',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          requireOtherAvatar: true,
          actions: [{
            op: 'modifyPower',
            amount: 1,
            layer: 3,
            target: { select: 'self' }
          }]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'enterLink' },
          actions: [{ op: 'destroyHighestPower' }]
        }
      ],
      parseStatus: 'auto',
      note: 'POWER +1 ถ้ามี Avatar ใบอื่นบนสนาม · นับเป็นสัตว์ด้วย · ศัตรูต้องโจมตีโฮคุ · เมื่อเข้า Link ทำลาย Avatar ศัตรู POWER สูงสุด 1 ใบ · [Link โซน่า]'
    },
    'BT09-008': {
      code: 'BT09-008',
      name: 'เพมมุ ยอดมนุษย์',
      hostAttachNameIncludes: 'อาวุธของเพมมุ',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          actions: [{
            op: 'modifyPower',
            amount: 2,
            layer: 3,
            target: { select: 'self', requireAttached: true }
          }]
        },
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          requireLinked: true,
          oncePerTurn: true,
          countsAsModification: true,
          actions: [{
            op: 'attach',
            from: 'deck',
            host: 'self',
            shuffleAfter: true,
            filter: { nameIncludes: ['อาวุธของเพมมุ'] }
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'สวมได้เฉพาะอาวุธของเพมมุ · สวม {mod} แล้ว POWER +2 · [Link สไปรท์] สั่งใช้เทิร์นละครั้งค้นอาวุธจากเด็คมาสวม (นับเป็นใช้ Modification)'
    },
    'BT09-009': {
      code: 'BT09-009',
      name: 'สไปรท์ ยอดสุนัข',
      linkKeywords: ['โล่มนุษย์', 'ลูกฮึด', 'สามัคคี'],
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'ownTurnEnd' },
          requireLinked: true,
          actions: [
            { op: 'untap', target: 'self' },
            {
              op: 'modifyPower',
              amount: 2,
              duration: 'nextOwnDraw',
              target: { select: 'self' }
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: '[Link เพมมุ ยอดมนุษย์] โล่มนุษย์ ลูกฮึด สามัคคี · อัตโนมัติ ในช่วง End Phase เรา : เปลี่ยน Avatar ใบนี้เป็นสภาพตื่น และ/หรือ POWER +2 จนถึง Draw Phase ต่อไปของเรา · # จะต้องใส่การ์ด Avatar "เพมมุ" ไว้ใน Deck ด้วยเสมอ'
    },
    'BT09-010': {
      code: 'BT09-010',
      name: 'เมย์ แวมไพร์โกธิค',
      protectAllyNameIncludes: 'เจ้าหญิงรวงข้าว',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'ownAvatarFights' },
          requireFighterNameAny: ['เพมมุ', 'สไปรท์'],
          requireOwnDarkNameMissing: 'เมย์ แวมไพร์โกธิค',
          cost: [{ op: 'exileSelf' }],
          actions: [{
            op: 'modifyPower',
            amount: 4,
            duration: 'endOfTurn',
            target: { select: 'combatOwn' }
          }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          requireOwnNameIncludes: 'เจ้าหญิงรวงข้าว',
          actions: [{
            op: 'modifyPower',
            amount: 3,
            layer: 3,
            target: { select: 'self' }
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'จากมือเมื่อเพมมุ/สไปรท์ต่อสู้ และมิติมืดยังไม่มีเมย์: เนรเทศใบนี้ POWER +4 จนจบเทิร์นให้ Avatar ที่ต่อสู้ · มีเจ้าหญิงรวงข้าวแล้ว POWER ตั้งต้น 5 · กันเจ้าหญิงเป็นเป้าโจมตีและความสามารถ · [Link เจ้าหญิงรวงข้าว]'
    },
    'BT09-011': {
      code: 'BT09-011',
      name: 'เจ้าหญิงรวงข้าว',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [{
            op: 'chooseMode',
            optional: false,
            options: [
              {
                label: 'เมย์จากมิติมืดกลับเด็ค แล้วสับ จั่ว 1',
                actions: [{
                  op: 'darkPick',
                  dest: 'deck',
                  shuffleAfter: true,
                  optional: true,
                  filter: { nameIncludes: ['เมย์ แวมไพร์โกธิค'] },
                  then: [{ op: 'draw', count: 1, player: 'owner' }]
                }]
              },
              {
                label: 'อาวุธของเพมมุจากนรกกลับเด็ค แล้วสับ จั่ว 1',
                actions: [{
                  op: 'hellPick',
                  dest: 'deck',
                  shuffleAfter: true,
                  optional: true,
                  filter: { nameIncludes: ['อาวุธของเพมมุ'] },
                  then: [{ op: 'draw', count: 1, player: 'owner' }]
                }]
              }
            ]
          }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          onlyOwnTurn: true,
          actions: [{
            op: 'modifyPower',
            amount: 2,
            layer: 3,
            target: {
              select: 'all',
              type: 'Avatar',
              side: 'own',
              nameIncludes: ['เพมมุ', 'สไปรท์', 'เมย์ แวมไพร์'],
              requireLinked: true
            }
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'จุติ: เลือกเมย์จากมิติมืด หรืออาวุธของเพมมุจากนรก กลับเด็คแล้วสับ จากนั้นจั่ว 1 · ต่อเนื่องในเทิร์นเรา: เพมมุ/สไปรท์/เมย์ ที่ Link แล้ว POWER +2'
    },
    'BT09-024': {
      code: 'BT09-024',
      name: 'ธอร์ บุตรแห่งโอดิน',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'battleDestroy' },
          requireLinked: true,
          actions: [
            {
              op: 'destroyEnemyCostScaledByHellOrRevealLife'
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'Link โลกิ / เมื่อทำลายศัตรูจากการต่อสู้ : ทำลาย Avatar Cost ตามจำนวนนรก หรือ หงาย LIFE ศัตรู 1'
    },
    'BT09-025': {
      code: 'BT09-025',
      name: 'โลกิ เจ้าชายยักษ์น้ำแข็ง',
      keywords: ['สามัคคี'],
      cannotAttack: true,
      cannotBeAttackTargetIfLinked: true,
      unityOnlyNameIncludes: 'ธอร์',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          oncePerTurn: true,
          actions: [{
            op: 'modifyPower',
            amount: 1,
            amountPer: 'ownHellPerN',
            perN: 5,
            per: 1,
            duration: 'endOfTurn',
            target: { select: 'self' }
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'สามัคคีได้เฉพาะธอร์ · โจมตีไม่ได้ · สั่งใช้เทิร์นละครั้ง POWER +1 จนจบเทิร์น และ +1 ต่อนรกเราทุก 5 ใบ · [Link ธอร์ บุตรแห่งโอดิน]'
    },
    'BT09-052': {
      code: 'BT09-052',
      name: 'ผจญภัยด้วยกัน',
      abilities: [{
        trigger: { on: 'activated' },
        actions: [{
          op: 'chooseMode',
          optional: false,
          options: [
            {
              label: 'มีเพมมุ → อัญเชิญสไปรท์จากเด็ค แล้วสับ',
              requireOwnNameIncludes: 'เพมมุ',
              actions: [{
                op: 'deckPick',
                filter: { type: 'Avatar', nameIncludes: ['สไปรท์'] },
                dest: 'avatar',
                paidCost: false,
                shuffleAfter: true
              }]
            },
            {
              label: 'มีสไปรท์ → อัญเชิญเพมมุจากเด็ค แล้วสับ',
              requireOwnNameIncludes: 'สไปรท์',
              actions: [{
                op: 'deckPick',
                filter: { type: 'Avatar', nameIncludes: ['เพมมุ'] },
                dest: 'avatar',
                paidCost: false,
                shuffleAfter: true
              }]
            }
          ]
        }]
      }],
      parseStatus: 'auto',
      note: 'เลือกปฏิบัติ: มีเพมมุบนสนาม → อัญเชิญสไปรท์จากเด็ค · มีสไปรท์บนสนาม → อัญเชิญเพมมุจากเด็ค'
    },
    'BT09-067': {
      code: 'BT09-067',
      name: 'อาวุธของเพมมุ ปืนพกรุ่น 19',
      attachOnly: { nameIncludes: 'เพมมุ' },
      uniqueMagicNameIncludes: 'อาวุธของเพมมุ',
      abilities: [
        {
          trigger: { on: 'battleDestroy' },
          ifDestroyedPowerDiffGte: 2,
          actions: [{ op: 'revealOppLifeTop' }]
        }
      ],
      parseStatus: 'auto',
      note: 'สวมได้เฉพาะเพมมุ · ฆ่าแล้วถ้าเหยื่อ POWER น้อยกว่าโฮสต์ตั้งแต่ 2 ขึ้นไป หงาย LIFE บนสุดศัตรู · Magic Zone มีอาวุธของเพมมุได้ 1 ใบ'
    }
  },
  'effects-bt10.json': {
    'BT10-025': {
      code: 'BT10-025',
      name: 'จอมเวทย์ โกลเด้น',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'enterLink' },
          actions: [{
            op: 'deckOrHellPick',
            dest: 'buildConstructFree',
            shuffleAfterIfFromDeck: true,
            filter: { type: 'Construct', nameIncludes: ['จอมเวทย์'] }
          }]
        }
      ],
      parseStatus: 'partial',
      note: 'เมื่อเข้า Link: ก่อสร้าง Construct จอมเวทย์ จากเด็คหรือนรก (ถ้าจากเด็คให้สับ) · สั่งใช้เซ่นตัวเองกันจอมเวทย์ใบอื่นออกสนามยังไม่ทำ · [Link เดสสึหวา]'
    },
    'BT10-026': {
      code: 'BT10-026',
      name: 'จอมเวทย์ เดสสึหวา',
      onlyAttackableAllyNameIncludes: 'เดสสึหวา',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          cost: [{
            op: 'discard',
            count: 1,
            filter: {
              anyOf: [
                { nameIncludes: ['คาถา'] },
                { type: 'Avatar', nameIncludes: ['จอมเวทย์'] }
              ]
            }
          }],
          actions: [{ op: 'draw', count: 2, player: 'owner' }]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'ownPlayMagic' },
          requireMagicNameIncludes: 'คาถา',
          actions: [{
            op: 'modifyPower',
            amount: 1,
            duration: 'endOfTurn',
            target: { select: 'choose', side: 'own', type: 'Avatar', nameIncludes: ['จอมเวทย์'] }
          }]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'declaredAsAttackTarget' },
          oncePerTurn: true,
          actions: [{ op: 'draw', count: 1, player: 'owner' }]
        }
      ],
      parseStatus: 'auto',
      note: 'จุติ ทิ้งคาถาหรือ Avatar จอมเวทย์ แล้วจั่ว 2 · เมื่อใช้ Magic คาถา เลือกจอมเวทย์เรา POWER +1 · ศัตรูต้องโจมตีเดสสึหวา · ถูกโจมตีเทิร์นละครั้งจั่ว 1 · [Link จอมเวทย์ โกลเด้น]'
    },
    'BT10-009': {
      code: 'BT10-009',
      name: 'K-BO ยอดหุ่นยนต์',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activatedFromHand' },
          cost: [{
            op: 'sendMagicToHell',
            count: 1,
            filter: { nameIncludes: ['อาวุธของเพมมุ'] }
          }],
          actions: [{ op: 'summonSelfFromHandFree', bySelfAbility: true }]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'summoned', if: 'bySelfAbility' },
          actions: [{
            op: 'grantSelfAbilities',
            abilities: [{
              keyword: 'สั่งใช้',
              trigger: { on: 'activated' },
              until: 'endOfTurn',
              cost: [{ op: 'exileSelf' }],
              actions: [{ op: 'armPemuSpriteCombatLock' }]
            }]
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'จากมือ ส่งอาวุธของเพมมุบน Magic Zone ลงนรก แล้วอัญเชิญตัวเอง · ได้รับสั่งใช้ในเทิร์นนี้: เนรเทศตัวเอง แล้วเมื่อเพมมุ/สไปรท์โจมตี Avatar ศัตรู ฝ่ายตรงข้ามใช้ React/ความสามารถไม่ได้จนกว่าจะจบการต่อสู้ และกันทำลายหลังปะทะไม่ได้'
    },
    'BT10-070': {
      code: 'BT10-070',
      name: 'ดินแดนยุติธรรม',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==landZone' },
          protectOwnFromOppLeave: true,
          requireOwnLinkedNameAny: ['เพมมุ', 'สไปรท์'],
          protectNameOrEffectIncludes: 'เพมมุ',
          actions: []
        }
      ],
      parseStatus: 'auto',
      note: 'ตราบเท่าที่เพมมุหรือสไปรท์อยู่ใน Link: Avatar ฝ่ายเราที่มี "เพมมุ" ในชื่อหรือข้อความ ไม่ถูกนำออกจากสนามโดยความสามารถ/ผู้เล่นฝ่ายตรงข้าม (ยกเว้นต่อสู้)'
    },
    'BT10-069': {
      code: 'BT10-069',
      name: 'อาวุธของเพมมุ ดาบมารไร้พ่าย',
      attachOnly: { nameIncludes: 'เพมมุ' },
      uniqueMagicNameIncludes: 'อาวุธของเพมมุ',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.attached' },
          actions: [{
            op: 'modifyPower',
            amount: 1,
            layer: 2,
            target: { select: 'equippedAvatar' }
          }]
        },
        {
          trigger: { on: 'battleDestroy' },
          actions: [
            {
              op: 'destroy',
              target: { select: 'choose', side: 'enemy', type: 'Avatar', printedPowerLteDestroyed: true }
            },
            {
              op: 'chooseMode',
              optional: true,
              options: [{
                label: 'ทำลายดาบแล้วเปลี่ยนสภาพเพมมุ',
                actions: [
                  { op: 'destroy', target: { select: 'self' } },
                  { op: 'toggleTap', filter: { nameIncludes: ['เพมมุ'] } }
                ]
              }]
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'สวมได้เฉพาะเพมมุ · โฮสต์ POWER +1 · ฆ่าจากการต่อสู้แล้วทำลาย Avatar ศัตรูที่ POWER ตั้งต้น ≤ POWER เหยื่อ จากนั้นเลือกทำลายดาบแล้วเปลี่ยนสภาพเพมมุ · Magic Zone มีอาวุธของเพมมุได้ 1 ใบ'
    }
  },
  'effects-bt11.json': {
    'BT11-008': {
      code: 'BT11-008',
      name: 'ออส่วนบอย',
      onlyAttackableAllyNameIncludes: 'กิมมิคแมน',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'ownAvatarDestroyed', if: 'oppTurn' },
          requireDestroyedNameIncludes: 'กิมมิคแมน',
          actions: [{ op: 'setPrintedPower', amount: 6 }]
        }
      ],
      parseStatus: 'auto',
      note: 'เมื่อกิมมิคแมนถูกทำลายในเทิร์นศัตรู: POWER ตั้งต้นเป็น 6 · ต่อเนื่อง ฝ่ายตรงข้ามต้องโจมตีกิมมิคแมนถ้ามีบนสนาม · [Link กิมมิคแมน]'
    },
    'BT11-011': {
      code: 'BT11-011',
      name: 'มิสทรอม่า',
      abilities: [
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          requireOwnAnyLinked: true,
          unlessOwnLinkedNamesAll: ['เพมมุ', 'สไปรท์'],
          actions: [{
            op: 'modifyPower',
            amount: 1,
            layer: 3,
            target: { select: 'self' }
          }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==avatarZone' },
          requireOwnLinkedNamesAll: ['เพมมุ', 'สไปรท์'],
          actions: [{
            op: 'modifyPower',
            amount: 2,
            layer: 3,
            target: { select: 'self' }
          }]
        },
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          actions: [
            { op: 'chooseDestroy', zones: ['land'], side: 'enemy', optional: true },
            {
              op: 'deckPick',
              filter: { nameIncludes: ['ดินแดนยุติธรรม'], subtype: 'Land' },
              dest: 'playLandFromDeck',
              shuffleAfter: true,
              optional: true
            },
            { op: 'lockOppLandPlay' }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'ต่อเนื่อง: มี Avatar ใน Link แล้ว POWER +1 · ถ้าเพมมุและสไปรท์อยู่ใน Link POWER +2 แทน · จุติ: ทำลาย Land ศัตรู 1 ใบ แล้วเล่นดินแดนยุติธรรมจากเด็ค สับ ฝ่ายตรงข้ามใช้ Land ไม่ได้จนจบเทิร์นถัดไปของฝ่ายตรงข้าม'
    }
  },
  'effects-cc01.json': {
    'CC01-042': {
      code: 'CC01-042',
      name: 'พรของอิศวร',
      abilities: [
        {
          keyword: 'เลือกปฏิบัติ',
          trigger: { on: 'activated' },
          actions: [{
            op: 'chooseMode',
            optional: false,
            options: [
              {
                label: 'จั่วให้มือครบ 5',
                actions: [{ op: 'draw', untilHand: 5 }]
              },
              {
                label: 'ทำลาย Avatar ศัตรูไม่เกิน 2',
                actions: [{
                  op: 'chooseDestroy',
                  side: 'enemy',
                  filter: { type: 'Avatar' },
                  zones: ['avatar'],
                  optional: true,
                  count: 2
                }]
              },
              {
                label: 'นรกขึ้นมือ 2 ใบ',
                actions: [{
                  op: 'hellPick',
                  dest: 'hand',
                  optional: true,
                  multiMax: 2
                }]
              }
            ]
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'เลือกปฏิบัติ 1 ข้อ: จั่วให้มือครบ 5 / ทำลาย Avatar ศัตรูไม่เกิน 2 / นรกเราขึ้นมือ 2 ใบ ประเภทใดก็ได้ · Only #1'
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
