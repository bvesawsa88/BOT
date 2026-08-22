/* tools/apply-remaining-effects.js — Implement all remaining card effects across all sets */
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

// Maps to hold entries by set
const setUpdates = {};

function addEffect(code, entry) {
  const m = code.match(/^([A-Za-z]+\d*)/);
  if (!m) return;
  const setKey = 'effects-' + m[1].toLowerCase() + '.json';
  if (!setUpdates[setKey]) setUpdates[setKey] = [];
  entry.code = code;
  entry.parseStatus = entry.parseStatus || 'auto';
  setUpdates[setKey].push(entry);
}

// ==================== 1. BT01 - BT04 Effects ====================

// BT01-008: รัททาทุย นางพญา -> ในช่วง Draw Phase แรกของเรา เราสามารถนำการ์ดใบนี้จาก Deck ขึ้นมือแทนการจั่วได้
addEffect('BT01-008', {
  name: 'รัททาทุย นางพญา',
  replaceFirstDrawWithSelf: true,
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'drawPhaseFirst' },
    condition: { selfInDeck: true },
    actions: [{ op: 'replaceDrawWithSelf', target: { select: 'self' } }]
  }],
  note: 'Draw Phase แรก นำจาก Deck ขึ้นมือแทนการจั่ว'
});

// BT01-010: รัททาทุย -> สามัคคี / ใส่ใน Deck ได้สูงสุด 50 ใบ
addEffect('BT01-010', {
  name: 'รัททาทุย',
  keywords: ['สามัคคี'],
  customLimit: '50',
  abilities: [{
    keyword: 'สามัคคี',
    trigger: { on: 'unityActivated' },
    actions: [{ op: 'unityBoost' }]
  }],
  note: 'สามัคคี / ใส่ได้สูงสุด 50 ใบ'
});

// BT01-014: จ่ามะนาว -> โล่มนุษย์
addEffect('BT01-014', {
  name: 'จ่ามะนาว',
  keywords: ['โล่มนุษย์'],
  abilities: [{
    keyword: 'โล่มนุษย์',
    trigger: { on: 'humanShieldActivated' },
    actions: [{ op: 'humanShieldRedirect' }]
  }],
  note: 'โล่มนุษย์'
});

// BT01-044: รั้วของชาติ -> Avatar ที่สวมใส่ได้รับ โล่มนุษย์
addEffect('BT01-044', {
  name: 'รั้วของชาติ',
  keywords: ['โล่มนุษย์'],
  grantKeywordAura: { keyword: 'โล่มนุษย์' },
  abilities: [{
    keyword: 'โล่มนุษย์',
    trigger: { on: 'humanShieldActivated' },
    actions: [{ op: 'humanShieldRedirect' }]
  }],
  note: 'Avatar ที่สวมใส่การ์ดใบนี้ได้รับความสามารถ โล่มนุษย์'
});

// BT01-049: มวยทะเลลลลลล -> ต่างฝ่ายต่างสั่ง Avatar โจมตีได้แค่ 1 ตัวต่อเทิร์น โดยที่การ์ดใบนี้จะอยู่บนสนามได้แค่ 4 เทิร์น
addEffect('BT01-049', {
  name: 'มวยทะเลลลลลล',
  attackLimitPerTurn: 1,
  destroyAfterGlobalEndPhases: 4,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'setGlobalAttackLimit', count: 1 }]
  }],
  note: 'โจมตีได้แค่ 1 ตัวต่อเทิร์น อยู่บนสนาม 4 เทิร์น'
});

// BT02-029: รถถัง B66 - เอ็กซ์เซลเซอร์ -> ถ้าไม่มี Avatar สวมใส่ Avatar ตัวนี้ จะไม่สามารถโจมตีได้ และ ไม่สามารถใช้ Avatar ชื่อซ้ำกันในการสวมใส่การ์ดใบนี้
addEffect('BT02-029', {
  name: 'รถถัง B66 - เอ็กซ์เซลเซอร์',
  hostCannotAttack: true,
  uniqueAttachedNames: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'cannotAttackWithoutHost' }]
  }],
  note: 'ถ้าไม่มี Avatar สวมใส่จะโจมตีไม่ได้ และห้ามสวมใส่ชื่อซ้ำ'
});

// BT02-055: ประกันชั้นต่ำ -> Avatar ที่สวมใส่การ์ดใบนี้ จะไม่ถูกทำลายจากการโจมตี 1 ครั้ง หลังจากโดนโจมตีแล้ว ส่งการ์ดใบนี้ลงนรก
addEffect('BT02-055', {
  name: 'ประกันชั้นต่ำ',
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'hostCombatDestroy' },
    actions: [
      { op: 'preventCombatDestroy' },
      { op: 'sendSelfToHell' }
    ]
  }],
  note: 'กันถูกทำลายจากการต่อสู้ 1 ครั้ง แล้วส่งลงนรก'
});

// BT03-007: อากาศยานผู้กล้า : แอร์ซิด รีฟลักซ์ -> อัตโนมัติ สั่งใช้ เมื่อ "หุ่นนักรบผู้กล้า : ไม้ท์เกรน" กำลังจะถูกทำลาย : ทำลายการ์ดใบนี้แทนได้
addEffect('BT03-007', {
  name: 'อากาศยานผู้กล้า : แอร์ซิด รีฟลักซ์',
  protectReplaceIfHostNameIncludes: 'หุ่นนักรบผู้กล้า : ไม้ท์เกรน',
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'allyDestroying', filter: { nameIncludes: 'หุ่นนักรบผู้กล้า : ไม้ท์เกรน' } },
    actions: [{ op: 'destroySelfInstead' }]
  }],
  note: 'ทำลายใบนี้แทนเมื่อไม้ท์เกรนจะถูกทำลาย'
});

// BT03-009: จีสัส -> ต่อเนื่อง การ์ดใบนี้สามารถสั่งโจมตีได้ เมื่อเราไม่มีการ์ดบนมือเหลืออยู่
addEffect('BT03-009', {
  name: 'จีสัส',
  attackIf: { ownHandEmpty: true },
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'restrictAttack', condition: { ownHandCount: 0 } }]
  }],
  note: 'โจมตีได้เฉพาะเมื่อไม่มีการ์ดบนมือ'
});

// BT03-024: บัลเดอร์ เทพแสง แห่งแอสการ์ด -> อัตโนมัติ เทิร์นละครั้ง ถ้า Avatar ตัวนี้จะถูกทำลาย : ธรณีสูบ 9 ใบ แทนการทำลายได้
addEffect('BT03-024', {
  name: 'บัลเดอร์ เทพแสง แห่งแอสการ์ด',
  millInsteadDestroy: 9,
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'selfDestroying' },
    condition: { oncePerTurn: true },
    actions: [{ op: 'millInsteadDestroy', count: 9 }]
  }],
  note: 'เทิร์นละครั้ง ธรณีสูบ 9 ใบ แทนถูกทำลาย'
});

// BT03-025: ฮามดัล เทพผู้รู้เห็น แห่งแอสการ์ด -> ต่อเนื่อง ตราบเท่าที่ Avatar ใบนี้อยู่บน Avatar Zone การ์ดใบบนสุดของ Deck ทั้ง2ฝ่าย จะถูกหงายหน้า
addEffect('BT03-025', {
  name: 'ฮามดัล เทพผู้รู้เห็น แห่งแอสการ์ด',
  revealDeckTops: 'both',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    actions: [{ op: 'revealDeckTops', target: 'both' }]
  }],
  note: 'หงายหน้าใบบนสุด Deck ทั้ง 2 ฝ่าย'
});

// BT03-028: ราชาอาณาจักรของแพง  พระเจ้านิโคไล -> ต่อเนื่อง Avatar ใบนี้จะไม่ถูกทำลายจากการต่อสู้ กับ Avatar ที่ Cost น้อยกว่าการ์ดใบนี้
addEffect('BT03-028', {
  name: 'ราชาอาณาจักรของแพง  พระเจ้านิโคไล',
  combatImmuneVsLowerCost: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'combatImmuneVsLowerCost' }]
  }],
  note: 'ไม่ถูกทำลายจากการต่อสู้กับ Avatar ที่ Cost น้อยกว่า'
});

// BT03-029: ทหารอาณาจักรของแพง -> ต่อเนื่อง Avatar ทุกตัวบนสนามอีกฝ่าย Cost -1 / ถ้ามีพระเจ้านิโคไล POWER เป็น 2
addEffect('BT03-029', {
  name: 'ทหารอาณาจักรของแพง',
  enemyCostAura: -1,
  setPowerIfAllyNameIncludes: { name: 'ราชาอาณาจักรของแพง  พระเจ้านิโคไล', power: 2 },
  abilities: [
    {
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static' },
      actions: [{ op: 'modifyEnemyCost', amount: -1 }]
    },
    {
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'ownFieldHasName:ราชาอาณาจักรของแพง  พระเจ้านิโคไล' },
      actions: [{ op: 'setBasePower', value: 2 }]
    }
  ],
  note: 'อีกฝ่าย Cost -1 / มีนิโคไล POWER เป็น 2'
});

// BT03-053: ยาแก้ไอน้ำดำ -> Avatar ที่สวมใส่จะไม่รับผลการลด POWER และเพิ่ม POWER คืนเท่าที่เคยถูกลด
addEffect('BT03-053', {
  name: 'ยาแก้ไอน้ำดำ',
  ignoreNegativePower: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'ignoreNegativePower' }]
  }],
  note: 'ไม่รับผลการลด POWER และเพิ่มคืนเท่าที่โดนลด'
});

// BT03-054: ขวานไม้เน่าๆเหม็นๆ -> Avatar ที่สวมใส่การ์ดใบนี้ Cost -1
addEffect('BT03-054', {
  name: 'ขวานไม้เน่าๆเหม็นๆ',
  hostCostDelta: -1,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'modifyHostCost', amount: -1 }]
  }],
  note: 'Avatar ที่สวมใส่ Cost -1'
});

// BT04-003: ไอ้นัท - คนใจเด็ด -> ต่อเนื่อง Avatar ใบนี้จะไม่ถูกเปลี่ยนการควบคุม ยกเว้นจากความสามารถของ อีช่า - สาวน้อยคนเก่ง
addEffect('BT04-003', {
  name: 'ไอ้นัท - คนใจเด็ด',
  controlImmuneExcept: 'อีช่า - สาวน้อยคนเก่ง',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'controlImmuneExcept', name: 'อีช่า - สาวน้อยคนเก่ง' }]
  }],
  note: 'ไม่ถูกเปลี่ยนการควบคุมยกเว้นจากอีช่า'
});

// BT04-005: ยายกบ 1954 -> จุติโดยสังเวย Avatar กบ ที่บัฟ 3+ ครั้ง, POWER ตามกบที่สังเวย
addEffect('BT04-005', {
  name: 'ยายกบ 1954',
  noPaidSummon: true,
  sacrificeSummon: { symbol: 'กบ', minBuffs: 3 },
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'summoned' },
    actions: [{ op: 'setPowerFromSacrificed' }]
  }],
  note: 'สังเวยกบที่บัฟ 3+ ครั้งเพื่ออัญเชิญ'
});

// BT04-006: แบงค์ทีสต้า นักมวยปล้ำ -> สามัคคี
addEffect('BT04-006', {
  name: 'แบงค์ทีสต้า นักมวยปล้ำ',
  keywords: ['สามัคคี'],
  abilities: [{
    keyword: 'สามัคคี',
    trigger: { on: 'unityActivated' },
    actions: [{ op: 'unityBoost' }]
  }],
  note: 'สามัคคี'
});

// BT04-011: เทอราโนดอน จากต่างแดน -> ความสามารถ สอดแนม ของ Symbol กะปอม +1 ใบ
addEffect('BT04-011', {
  name: 'เทอราโนดอน จากต่างแดน',
  scoutBonusOwnKapom: 1,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'modifyScoutCount', symbol: 'กะปอม', bonus: 1 }]
  }],
  note: 'สอดแนม Symbol กะปอม ฝ่ายเรา +1 ใบ'
});

// BT04-016: ริกกี้ คุณตา -> ต่อเนื่อง Avatar ใบนี้ไม่รับผลจากความสามารถของการ์ด Magic ฝ่ายตรงข้าม
addEffect('BT04-016', {
  name: 'ริกกี้ คุณตา',
  immuneOppMagicTarget: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'immuneOppMagic' }]
  }],
  note: 'ไม่รับผลจาก Magic ฝ่ายตรงข้าม'
});

// ==================== 2. BT04 - BT07 Effects ====================

// BT04-018: รัททาทุย 2 หัว -> โล่มนุษย์ / POWER-1 แทนทำลาย / ทำลายเมื่อ POWER=0
addEffect('BT04-018', {
  name: 'รัททาทุย 2 หัว',
  keywords: ['โล่มนุษย์'],
  destroyHostIfPower0: true,
  abilities: [
    {
      keyword: 'อัตโนมัติ',
      trigger: { on: 'combatDestroying' },
      condition: { oncePerTurn: true },
      actions: [
        { op: 'modifyPower', amount: -1, target: { select: 'self' } },
        { op: 'preventCombatDestroy' }
      ]
    }
  ],
  note: 'โล่มนุษย์ / ลด POWER 1 แทนถูกทำลายจากต่อสู้'
});

// BT04-032: พลปืนอาณาจักรของแพง -> ได้รับ "เตะไข่" ถ้ามี นิโคไล อยู่บนสนาม
addEffect('BT04-032', {
  name: 'พลปืนอาณาจักรของแพง',
  grantKeywordIfAllyNameIncludes: { name: 'ราชาอาณาจักรของแพง  พระเจ้านิโคไล', keyword: 'เตะไข่' },
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'ownFieldHasName:ราชาอาณาจักรของแพง  พระเจ้านิโคไล' },
    actions: [{ op: 'grantKeywordSelf', keyword: 'เตะไข่' }]
  }],
  note: 'ได้รับ เตะไข่ หากมี นิโคไล อยู่บนสนาม'
});

// BT04-053: อาวุธหุ่นนักรบผู้กล้า " ไบโพล่า ชิลด์ " -> ทอยลูกเต๋าออกเลขคู่ ไม่ถูกนำออกจากสนาม
addEffect('BT04-053', {
  name: 'อาวุธหุ่นนักรบผู้กล้า " ไบโพล่า ชิลด์ "',
  hostAttachNameIncludes: 'ผู้กล้า',
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'hostLeavingFieldByOpp' },
    condition: { oncePerTurn: true },
    actions: [{ op: 'rollDicePreventLeaving', required: 'even' }]
  }],
  note: 'สวมใส่ผู้กล้าหุ่นยนต์ / ทอยเต๋าเลขคู่ กันออกจากสนาม'
});

// BT04-054: ของขวัญจากโอตะ -> สวมใส่ไอดอล จั่ว 1 / ใช้เป็น Cost ได้เฉพาะ ไอดอล/โปรดิวเซอร์
addEffect('BT04-054', {
  name: 'ของขวัญจากโอตะ',
  hostAttachNameIncludes: 'ไอดอล',
  costOnlyForSymbol: ['ไอดอล', 'โปรดิวเซอร์'],
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'attached' },
    actions: [{ op: 'drawCard', count: 1 }]
  }],
  note: 'สวมไอดอล จั่ว 1 / เป็น Cost ให้ไอดอลและโปรดิวเซอร์'
});

// BT04-055: ดาบพิฆาตสวรรค์ ราคา 4000 เหรียญทอง -> Host Cost +2 / ถ้า Cost >= 6 POWER +1
addEffect('BT04-055', {
  name: 'ดาบพิฆาตสวรรค์ ราคา 4000 เหรียญทอง',
  hostCostDelta: 2,
  hostPowerIfEffCostMin: { minCost: 6, power: 1 },
  abilities: [
    {
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static' },
      actions: [{ op: 'modifyHostCost', amount: 2 }]
    },
    {
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'host.cost>=6' },
      actions: [{ op: 'modifyPower', amount: 1, target: { select: 'host' } }]
    }
  ],
  note: 'Host Cost +2 / ถ้า Cost >= 6 POWER +1'
});

// BT04-058: โรงบาลรัฐ -> LIFE Card ทั้งสองฝ่ายห้ามคว่ำ
addEffect('BT04-058', {
  name: 'โรงบาลรัฐ',
  blockLifeUnreveal: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'blockLifeUnreveal' }]
  }],
  note: 'LIFE Card ทั้งสองฝ่ายห้ามเปลี่ยนเป็นสภาพคว่ำ'
});

// BT05-004: ทริสทัน อัศวินโต๊ะกลมแห่งความแม่นยำ -> ทำลาย 1 ใบเมื่อจุติจากอัศวินโต๊ะกลม / ได้รับ สามัคคี ถ้ามีอัศวินโต๊ะกลมอื่น
addEffect('BT05-004', {
  name: 'ทริสทัน อัศวินโต๊ะกลมแห่งความแม่นยำ',
  grantKeywordIfAllyNameIncludes: { name: 'อัศวินโต๊ะกลม', keyword: 'สามัคคี' },
  abilities: [
    {
      keyword: 'อัตโนมัติ',
      trigger: { on: 'summonedByAvatarNameIncludes', name: 'อัศวินโต๊ะกลม' },
      actions: [{ op: 'destroyCard', target: { select: 'oppAnyCard', count: 1 } }]
    },
    {
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'ownFieldHasOtherName:อัศวินโต๊ะกลม' },
      actions: [{ op: 'grantKeywordSelf', keyword: 'สามัคคี' }]
    }
  ],
  note: 'ทำลาย 1 ใบเมื่อจุติจากอัศวินโต๊ะกลม / ได้สามัคคีถ้ามีพวก'
});

// BT05-011: ฤๅษี ภฤคุ -> ใช้ Magic ฤๅษี ในเทิร์นฝ่ายตรงข้ามได้
addEffect('BT05-011', {
  name: 'ฤๅษี ภฤคุ',
  allowOppTurnMagic: 'ฤๅษี',
  reactAnyWindow: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'allowOppTurnMagic', symbol: 'ฤๅษี' }]
  }],
  note: 'ใช้ Magic ฤๅษี ในเทิร์นฝ่ายตรงข้ามได้'
});

// BT05-013: ผู้เจริญ นาย -> Avatar คน และ ต้นไม้ ฝ่ายเราได้รับ สามัคคี
addEffect('BT05-013', {
  name: 'ผู้เจริญ นาย',
  grantKeywordAura: { symbols: ['คน', 'ต้นไม้'], keyword: 'สามัคคี' },
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'grantKeywordAura', symbols: ['คน', 'ต้นไม้'], keyword: 'สามัคคี' }]
  }],
  note: ' Avatar คน และ ต้นไม้ ฝ่ายเราได้รับ สามัคคี'
});

// BT05-016: โคลัมบัส นักท่องเรือ -> ถือเป็น Avatar ทุกสี
addEffect('BT05-016', {
  name: 'โคลัมบัส นักท่องเรือ',
  allColors: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'grantAllColors' }]
  }],
  note: 'ถือเป็น Avatar ทุกสี'
});

// BT05-018: ของขวัญที่เมียทิ้งไว้ให้ -> ฟรี Summon ถ้าคุม เจค นักฆ่ามือเก๋า และไม่มีชื่อซ้ำบนสนาม
addEffect('BT05-018', {
  name: 'ของขวัญที่เมียทิ้งไว้ให้',
  freeSummonIf: { ownControlName: 'เจค นักฆ่ามือเก๋า', uniqueSelf: true },
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'handSummon' },
    condition: { ownControlName: 'เจค นักฆ่ามือเก๋า', uniqueSelf: true },
    actions: [{ op: 'freeSummon' }]
  }],
  note: 'ลงฟรีถ้ามี เจค และไม่มีตัวซ้ำบนสนาม'
});

// BT05-037: หมาเครื่องบิน Super Air -> ได้รับ "เตะไข่" ตราบเท่าที่ควบคุม Super Air
addEffect('BT05-037', {
  name: 'หมาเครื่องบิน Super Air',
  grantKeywordIfAllyNameIncludes: { name: 'Super Air', keyword: 'เตะไข่' },
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'ownFieldHasName:Super Air' },
    actions: [{ op: 'grantKeywordSelf', keyword: 'เตะไข่' }]
  }],
  note: 'ได้รับ เตะไข่ ถ้ามี Super Air บนสนาม'
});

// BT05-038: ผู้โดยสาร Super Air -> สังเวยแทน Super Air ถูกทำลาย / ห้ามตกเป็นเป้าการโจมตี
addEffect('BT05-038', {
  name: 'ผู้โดยสาร Super Air',
  protectReplaceIfHostNameIncludes: 'Super Air',
  cannotBeAttackTargetIfOwnNameIncludes: 'Super Air',
  abilities: [
    {
      keyword: 'อัตโนมัติ',
      trigger: { on: 'allyDestroying', filter: { nameIncludes: 'Super Air' } },
      actions: [{ op: 'destroySelfInstead' }]
    },
    {
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'ownFieldHasName:Super Air' },
      actions: [{ op: 'cannotBeAttackTarget' }]
    }
  ],
  note: 'สังเวยแทน Super Air ถูกทำลาย / ห้ามตกเป็นเป้าการโจมตี'
});

// BT05-040: วานรแบงค์ -> ลูกฮึด
addEffect('BT05-040', {
  name: 'วานรแบงค์',
  keywords: ['ลูกฮึด'],
  abilities: [{
    keyword: 'ลูกฮึด',
    trigger: { on: 'fireInTheBellyActivated' },
    actions: [{ op: 'fireInTheBellyWin' }]
  }],
  note: 'ลูกฮึด'
});

// BT05-063: อาวุธหุ่นนักรบผู้กล้า "GHD โคลค" -> สวมใส่หุ่นยนต์ ห้ามถูกเปลี่ยน Symbol
addEffect('BT05-063', {
  name: 'อาวุธหุ่นนักรบผู้กล้า "GHD โคลค"',
  hostAttachNameIncludes: 'หุ่นยนต์',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'protectSymbolChange' }]
  }],
  note: 'สวมใส่หุ่นยนต์ ห้ามถูกเปลี่ยน Symbol'
});

// BT05-069: กรุงลงกา -> ใช้ POWER ของ Avatar ยักษ์ บนมือแทน GEM
addEffect('BT05-069', {
  name: 'กรุงลงกา',
  powerAsGemForSymbol: 'ยักษ์',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'allowPowerAsGem', symbol: 'ยักษ์' }]
  }],
  note: 'ใช้ POWER ของ Avatar ยักษ์ บนมือแทนค่า GEM'
});

// ==================== 3. BT06 - BT11 & Other Effects ====================

// BT06-017: วิลโล่ ปลาแกะ -> นับเป็น Symbol สัตว์
addEffect('BT06-017', {
  name: 'วิลโล่ ปลาแกะ',
  extraSymbols: ['สัตว์'],
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'addSymbol', symbol: 'สัตว์' }]
  }],
  note: 'นับเป็น Symbol สัตว์ ด้วย'
});

// BT06-038: แมมมอธแช่แข็ง -> โจมตีไม่ได้ / สวม Modification ไม่ได้
addEffect('BT06-038', {
  name: 'แมมมอธแช่แข็ง',
  cannotAttack: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'cannotAttack' }, { op: 'blockModification' }]
  }],
  note: 'โจมตีไม่ได้ และสวมใส่ Modification ไม่ได้'
});

// BT06-061: สภาแบงค์ -> Avatar แบงค์ บนมือ Cost -1 และ Gem เป็นไร้สี
addEffect('BT06-061', {
  name: 'สภาแบงค์',
  gemAsCostForNameIncludes: 'แบงค์',
  gemAsCostColor: 'colorless',
  hostCostDelta: -1,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'modifyHandCostAndGem', nameIncludes: 'แบงค์', costDelta: -1, gemColor: 'colorless' }]
  }],
  note: 'Avatar แบงค์ บนมือ Cost -1 และ Gem เป็นไร้สี'
});

// BT07-007: สัตว์ทดลอง #1 -> ถ้าในนรกมีชื่อซ้ำไม่เกิน 10 ใบ เป็น Gem 8 ไร้สี
addEffect('BT07-007', {
  name: 'สัตว์ทดลอง #1',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'ownGraveCountDistinct>=10' },
    actions: [{ op: 'setGemValue', gem: 8, color: 'colorless' }]
  }],
  note: 'ถ้าในนรกมี 10+ ชื่อ ถือเป็น Gem 8 ไร้สี'
});

// BT07-065: ปลอกคอซื่อสัตย์ -> Avatar ที่สวมใส่จะไม่ถูกเปลี่ยนการควบคุม
addEffect('BT07-065', {
  name: 'ปลอกคอซื่อสัตย์',
  controlImmune: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'grantControlImmunity' }]
  }],
  note: 'Avatar ที่สวมใส่จะไม่ถูกเปลี่ยนการควบคุม'
});

// BT08-043: รถถังเฟืองเหล็ก -> ถ้าไม่มีสวมใส่ 2+ ใบ โจมตีไม่ได้ / สวมใส่ได้แค่ Tank Ranger
addEffect('BT08-043', {
  name: 'รถถังเฟืองเหล็ก',
  hostAttachNameIncludes: 'Tank Ranger',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'attachedCount<2' },
    actions: [{ op: 'cannotAttack' }]
  }],
  note: 'ต้องมีสวมใส่ 2+ ใบจึงจะโจมตีได้'
});

// BT09-029: สตางค์น้องชายแบงค์ ตัวเขียว -> สามัคคี / Avatar สีเขียวอีกฝ่ายห้ามเลือกเป็นเป้าโจมตี
addEffect('BT09-029', {
  name: 'สตางค์น้องชายแบงค์ ตัวเขียว',
  keywords: ['สามัคคี'],
  cannotBeAttackTargetIf: { oppColor: 'เขียว' },
  abilities: [{
    keyword: 'สามัคคี',
    trigger: { on: 'unityActivated' },
    actions: [{ op: 'unityBoost' }]
  }],
  note: 'สามัคคี / Avatar สีเขียวอีกฝ่ายห้ามเลือกเป็นเป้าโจมตี'
});

// BT09-036: ภูติผลไม้ มะม่วง -> ได้รับ โล่มนุษย์ ถ้ามี ป่าพงไพร บนสนาม
addEffect('BT09-036', {
  name: 'ภูติผลไม้ มะม่วง',
  grantKeywordIfLandNameIncludes: { name: 'ป่าพงไพร เผ่าพงศ์พันธุ์', keyword: 'โล่มนุษย์' },
  abilities: [{
    keyword: 'โล่มนุษย์',
    trigger: { on: 'humanShieldActivated' },
    actions: [{ op: 'humanShieldRedirect' }]
  }],
  note: 'ได้รับ โล่มนุษย์ ถ้ามี ป่าพงไพร'
});

// BT09-038: ภูติผลไม้ มะเฟือง -> ได้รับ เตะไข่ ถ้ามี ป่าพงไพร และอีกฝ่ายมี Life คว่ำ
addEffect('BT09-038', {
  name: 'ภูติผลไม้ มะเฟือง',
  grantKeywordIfLandNameIncludes: { name: 'ป่าพงไพร เผ่าพงศ์พันธุ์', keyword: 'เตะไข่', condition: 'oppHasFaceDownLife' },
  abilities: [{
    keyword: 'เตะไข่',
    trigger: { on: 'nutKickActivated' },
    actions: [{ op: 'nutKickTarget' }]
  }],
  note: 'ได้รับ เตะไข่ ถ้ามี ป่าพงไพร และอีกฝ่ายมี Life คว่ำ'
});

// BT09-049: ขอโทษสังคม -> ยกโทษการขอโทษ DJ ปีโป้ / เป็น Cost ให้ DJ ปีโป้
addEffect('BT09-049', {
  name: 'ขอโทษสังคม',
  costOnlyForSymbol: ['DJ ปีโป้'],
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'playMagic' },
    actions: [{ op: 'pipoApologyForgiven' }]
  }],
  note: 'การขอโทษจาก DJ ปีโป้ ได้รับการยกโทษเสมอ'
});

// BT09-065: กระสอบ -> Avatar สวมใส่โจมตีไม่ได้ / ลงนรกใน End Phase ที่ 4
addEffect('BT09-065', {
  name: 'กระสอบ',
  hostCannotAttack: true,
  destroyAfterGlobalEndPhases: 4,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'hostCannotAttack' }]
  }],
  note: 'Host โจมตีไม่ได้ / ลงนรกหลัง 4 End Phases'
});

// BT09-070: สวนกล้วยหนีภาษี -> ห้ามใช้ Land / ลงนรกหลัง 4 End Phases
addEffect('BT09-070', {
  name: 'สวนกล้วยหนีภาษี',
  blockAllLandPlay: true,
  destroyAfterGlobalEndPhases: 4,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'blockLandPlay' }]
  }],
  note: 'ห้ามทุกคนใช้ Land / ลงนรกหลัง 4 End Phases'
});

// BT10-074: ZeedZad Server -> Cost 0 ถ้ามี แก๊งขยะ 2+ ชื่อ / แก๊งขยะ ได้รับ ลูกฮึด
addEffect('BT10-074', {
  name: 'ZeedZad Server',
  costZeroIfDistinctOwnNameIncludes: { name: 'แก๊งขยะ', count: 2 },
  grantKeywordAura: { nameIncludes: 'แก๊งขยะ', keyword: 'ลูกฮึด' },
  abilities: [{
    keyword: 'ลูกฮึด',
    trigger: { on: 'fireInTheBellyActivated' },
    actions: [{ op: 'fireInTheBellyWin' }]
  }],
  note: 'Cost 0 ถ้ามีแก๊งขยะ 2+ ชื่อ / แก๊งขยะได้ลูกฮึด'
});

// BT11-045: โคลัมแบงค์ -> Gem ของ Avatar แบงค์ บนมือเป็นไร้สี
addEffect('BT11-045', {
  name: 'โคลัมแบงค์',
  gemAsCostForNameIncludes: 'แบงค์',
  gemAsCostColor: 'colorless',
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'modifyHandGemColor', nameIncludes: 'แบงค์', gemColor: 'colorless' }]
  }],
  note: 'Gem ของ Avatar แบงค์ บนมือเป็นไร้สี'
});

// BT11-067: อาวุธนคร ดินสอ 5H -> สวมใส่ มือปืนนคร / โจมตีแล้วอีกฝ่ายห้ามใช้ React Magic
addEffect('BT11-067', {
  name: 'อาวุธนคร ดินสอ 5H',
  hostAttachNameIncludes: 'มือปืนนคร',
  hostBlockReactUntilCombatEnd: true,
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'hostAttacking' },
    actions: [{ op: 'blockOppReactMagicUntilCombatEnd' }]
  }],
  note: 'สวมใส่ มือปืนนคร / โจมตีห้ามอีกฝ่ายใช้ React Magic'
});

// BT11-073: รูปประจำบ้าน -> Avatar ฝ่ายเราจะไม่ถูกเปลี่ยนการควบคุม
addEffect('BT11-073', {
  name: 'รูปประจำบ้าน',
  controlImmuneOwnAvatars: true,
  abilities: [{
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static' },
    actions: [{ op: 'grantControlImmunityAllOwn' }]
  }],
  note: 'Avatar ฝ่ายเราจะไม่ถูกเปลี่ยนการควบคุม'
});

// ODY1-064: โอเดนย่า อร่อยมัก -> เมื่อ Avatar ทาโกะ ตกเป็นเป้าหมายการโจมตี : POWER +2 จนจบเทิร์น
addEffect('ODY1-064', {
  name: 'โอเดนย่า อร่อยมัก',
  abilities: [{
    keyword: 'อัตโนมัติ',
    trigger: { on: 'attackTargeted', filter: { nameIncludes: 'ทาโกะ' } },
    actions: [{ op: 'modifyPower', amount: 2, until: 'endOfTurn' }]
  }],
  note: 'เมื่อ ทาโกะ โดนเล็งโจมตี POWER +2 จนจบเทิร์น'
});

// ODY1-065: ถุงเกราะโอเดนย่า -> ทำลายสวมใส่: Host POWER +2 จนจบเทิร์นถัดไปของฝ่ายตรงข้าม
addEffect('ODY1-065', {
  name: 'ถุงเกราะโอเดนย่า',
  abilities: [{
    keyword: 'สั่งใช้',
    trigger: { on: 'activated' },
    cost: [{ op: 'destroySelf' }],
    actions: [{ op: 'modifyPower', amount: 2, target: { select: 'host' }, until: 'endOfOpponentNextTurn' }]
  }],
  note: 'ทำลายตนเอง Host POWER +2 จนจบเทิร์นถัดไปอีกฝ่าย'
});

// KD00-00B: เบียดเบียนผู้อื่น -> สุ่มหยิบการ์ดจากมือคนซ้าย เปรียบเทียบ Cost
addEffect('KD00-00B', {
  name: 'เบียดเบียนผู้อื่น',
  abilities: [{
    keyword: 'สั่งใช้',
    trigger: { on: 'playMagic' },
    actions: [{ op: 'leftHandCardStealCompareCost' }]
  }],
  note: 'สุ่มหยิบการ์ดคนทางซ้ายมาเทียบ Cost'
});


// ==================== Execute Upserts ====================

let totalApplied = 0;
Object.keys(setUpdates).forEach(fileName => {
  const json = load(fileName);
  const cardsList = json.cards || [];
  setUpdates[fileName].forEach(entry => {
    upsert(cardsList, entry);
    totalApplied++;
  });
  json.cards = cardsList;
  save(fileName, json);
  console.log(`Updated ${setUpdates[fileName].length} cards in data/${fileName}`);
});

console.log(`\nSuccessfully applied ${totalApplied} card effect updates!`);

// Run rebuild-abilities.js
console.log('\nRunning node tools/rebuild-abilities.js ...');
const res = spawnSync('node', [path.join(ROOT, 'tools', 'rebuild-abilities.js')], { encoding: 'utf8' });
console.log(res.stdout || res.stderr);
