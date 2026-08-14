/* ไซอิ๋ว / อัญเชิญพระไตรปิฎก — เทคเด็คอัตโนมัติ + rebuild abilities / effects-all */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { spawnSync } = require('child_process');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
}
function save(name, j) {
  const p = path.join(ROOT, 'data', name);
  const tmp = p + '.tmp';
  const data = JSON.stringify(j, null, 2) + '\n';
  fs.writeFileSync(tmp, data);
  let lastErr = null;
  for (let i = 0; i < 8; i++) {
    try {
      fs.copyFileSync(tmp, p);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const end = Date.now() + 80 * (i + 1);
      while (Date.now() < end) { /* retry lock */ }
    }
  }
  try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  if (lastErr) throw lastErr;
}
function upsert(fileCards, entry) {
  const i = fileCards.findIndex(c => c.code === entry.code);
  if (i < 0) fileCards.push(entry);
  else fileCards[i] = Object.assign({}, fileCards[i], entry);
}

const PILGRIMS = ['พระถังซัมจั๋ง', 'ซุนหงอคง', 'ตือโป๊ยก่าย', 'ซัวเจ๋ง'];
const DISCIPLES = ['ซุนหงอคง', 'ตือโป๊ยก่าย', 'ซัวเจ๋ง'];
const CREW2 = ['พระถังซัมจั๋ง', 'ซุนหงอคง', 'ตือโป๊ยก่าย'];

const BY_SET = {
  'effects-bt11.json': {
    'BT11-013': {
      code: 'BT11-013',
      name: 'ซุนหงอคง',
      protectAllyNameIncludes: 'พระถังซัมจั๋ง',
      abilities: [{
        keyword: 'ต่อเนื่อง',
        trigger: { on: 'static', if: 'self.zone==avatarZone' },
        requireOwnNameIncludes: 'พระถังซัมจั๋ง',
        actions: [{
          op: 'modifyPower', amount: 2, duration: 'whileOnField', layer: 3,
          target: { select: 'self' }
        }]
      }],
      parseStatus: 'auto',
      note: 'มีพระถังซัมจั๋ง: POWER +2 · กันเล็ง/กันความสามารถใส่พระถังซัมจั๋ง'
    },
    'BT11-025': {
      code: 'BT11-025',
      name: 'ซัวเจ๋ง',
      abilities: [{
        trigger: { on: 'activatedFromHell' },
        fromHell: true,
        requireOwnNameIncludesAnyMin: { names: CREW2, min: 2 },
        cost: [{ op: 'discard', count: 1 }],
        actions: [{ op: 'summonSelfFromHell' }]
      }],
      parseStatus: 'auto',
      note: 'จากนรก: ถ้ามีพระถังซัมจั๋ง/ซุนหงอคง/ตือโป๊ยก่าย รวม ≥2 ใบ ทิ้งมือ 1 → อัญเชิญตัวเอง'
    },
    'BT11-035': {
      code: 'BT11-035',
      name: 'ตือโป๊ยก่าย',
      abilities: [{
        keyword: 'อัตโนมัติ',
        trigger: { on: 'ownPlayMagic' },
        oncePerTurn: true,
        actions: [{
          op: 'modifyPower', amount: 1, duration: 'nextOwnDraw', layer: 4,
          target: { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone', nameIncludes: PILGRIMS }
        }]
      }],
      parseStatus: 'auto',
      note: 'เทิร์นละครั้ง เมื่อใช้ Magic: ไซอิ๋วทั้ง 4 POWER +1 จน Draw Phase ถัดไปของเรา'
    },
    'BT11-047': {
      code: 'BT11-047',
      name: 'พระถังซัมจั๋ง',
      abilities: [
        {
          keyword: 'จุติ',
          trigger: { on: 'summoned', if: 'paidCost' },
          cost: [{ op: 'discard', count: 1, filter: { type: 'Avatar' } }],
          actions: [{
            op: 'deckPick',
            filter: { type: 'Avatar', nameIncludes: DISCIPLES },
            dest: 'avatar',
            shuffleAfter: true,
            paidCost: false
          }]
        },
        {
          trigger: { on: 'activated' },
          oncePerTurn: true,
          requireOwnNamesAll: DISCIPLES,
          actions: [{
            op: 'deckOrHellPick',
            filter: { nameIncludes: ['พระไตรปิฎก'] },
            dest: 'hand',
            shuffleAfterIfFromDeck: true
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'จุติ ทิ้ง Avatar → อัญเชิญศิษย์จากเด็ค · สั่งใช้ถ้ามีศิษย์ครบ 3 ชื่อ → หาพระไตรปิฎกจากเด็ค/นรก'
    },
    'BT11-056': {
      code: 'BT11-056',
      name: 'พระไตรปิฎก',
      stayOnMagic: true,
      instantWinIf: {
        when: 'ownDrawPhase',
        ownMagicNameIncludesMin: { nameIncludes: 'พระไตรปิฎก', min: 3 },
        ownNamesAll: PILGRIMS
      },
      abilities: [
        {
          trigger: { on: 'playMagic' },
          requireOwnNameIncludes: 'พระถังซัมจั๋ง',
          actions: [{ op: 'draw', count: 1, player: 'owner' }]
        },
        {
          keyword: 'ต่อเนื่อง',
          trigger: { on: 'static', if: 'self.zone==magicZone' },
          actions: [{
            op: 'modifyPower', amount: 1, duration: 'whileOnField', layer: 3,
            target: { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone', nameIncludes: PILGRIMS }
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'ใช้ได้เมื่อมีพระถังซัมจั๋ง: จั่ว 1 ค้าง Magic Zone · ไซอิ๋ว +1 · Draw Phase มี 3 ใบ + ศิษย์ครบ = ชนะ'
    }
  },
  'effects-bt01.json': {
    'BT01-049': {
      code: 'BT01-049',
      name: 'มวยทะเลลลลลล',
      attackLimitPerTurn: 1,
      destroyAfterGlobalEndPhases: 4,
      abilities: [],
      parseStatus: 'auto',
      note: 'แต่ละฝ่ายโจมตีได้ 1 ตัว/เทิร์น · End Phase รวม 4 ครั้งแล้วลงนรก'
    }
  },
  'effects-bt08.json': {
    'BT08-057': {
      code: 'BT08-057',
      name: 'แหม่อ้ายก็~~~',
      abilities: [{
        keyword: 'React',
        trigger: { on: 'enemyDeclareAttack' },
        react: true,
        actions: [{ op: 'cancelAttack' }]
      }],
      parseStatus: 'auto',
      note: 'เมื่อฝ่ายตรงข้ามประกาศโจมตี: ยกเลิกการโจมตีนั้น'
    }
  },
  'effects-bt09.json': {
    'BT09-065': {
      code: 'BT09-065',
      name: 'กระสอบ',
      hostCannotAttack: true,
      destroyAfterGlobalEndPhases: 4,
      abilities: [],
      parseStatus: 'auto',
      note: 'โฮสต์โจมตีไม่ได้ · End Phase รวม 4 ครั้งแล้วลงนรก'
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
