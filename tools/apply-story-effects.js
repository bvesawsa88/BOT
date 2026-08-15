/* นักท่องเรื่องราว / Skill — เติม effects ออโต้ + rebuild abilities / effects-all */
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

const STORY6 = { type: 'Avatar', nameIncludes: ['เรื่องราว'], cost: 6 };
const SKILL_MAGIC = { type: 'Magic', nameIncludes: ['Skill'] };
const DRAW_IF_8_MAGIC = {
  op: 'drawIfOwnHellTypeMin',
  hellType: 'Magic',
  min: 8,
  count: 1
};

const NAGA_GRANT = [
  {
    keyword: 'สั่งใช้',
    trigger: { on: 'activated' },
    fromAvatarZone: true,
    oncePerTurn: true,
    cost: [{ op: 'discard', count: 1 }],
    actions: [{ op: 'hellPick', filter: SKILL_MAGIC, dest: 'hand', optional: true }]
  },
  {
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    actions: [{
      op: 'modifyPower',
      amountPer: 'ownHellTypePerN',
      hellType: 'Magic',
      perN: 2,
      per: 1,
      layer: 3,
      target: { select: 'self' }
    }]
  }
];

const GARUDA_GRANT = [
  {
    keyword: 'อัตโนมัติ',
    trigger: { on: 'declareAttack' },
    oncePerTurn: true,
    actions: [{
      op: 'deckPick',
      filter: SKILL_MAGIC,
      dest: 'hell',
      shuffleAfter: true,
      optional: true
    }]
  },
  {
    keyword: 'ต่อเนื่อง',
    trigger: { on: 'static', if: 'self.zone==avatarZone' },
    extraReactSkillUnusedName: true,
    actions: []
  }
];

const MAYA_GRANT = [
  {
    keyword: 'อัตโนมัติ',
    trigger: { on: 'ownPlayMagic' },
    oncePerTurn: true,
    actions: [{
      op: 'modifyPower',
      amount: 1,
      duration: 'endOfTurn',
      target: { select: 'self' }
    }]
  }
];

const BY_SET = {
  'effects-bt09.json': {
    'BT09-042': {
      code: 'BT09-042',
      name: 'นักท่องเรื่องราว ขวัญตา',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          fromAvatarZone: true,
          allowOwnBattlePhase: true,
          requireHandFilter: STORY6,
          actions: [{ op: 'storyEvolve', filter: STORY6, powerBonus: 0 }]
        },
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'exiledFromAvatar' },
          actions: [{ op: 'draw', count: 1 }]
        }
      ],
      parseStatus: 'auto',
      note: 'แสดงเรื่องราว Cost 6 จากมือ → เนรเทศตัวเองแล้วอัญเชิญใบที่แสดง · เนรเทศจาก Avatar Zone แล้วจั่ว 1'
    },
    'BT09-043': {
      code: 'BT09-043',
      name: 'ขวัญตา เรื่องราว ราชาแห่งนาค',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'summoned', if: 'summonedByNameIncludes', nameIncludes: 'นักท่องเรื่องราว' },
          actions: [{ op: 'grantSelfAbilities', abilities: NAGA_GRANT }]
        }
      ],
      parseStatus: 'auto',
      note: 'ถูกอัญเชิญโดยนักท่องเรื่องราว → ทิ้งมือแลก Skill จากนรก + POWER+1 ต่อ Magic ในนรกทุก 2 ใบ'
    },
    'BT09-044': {
      code: 'BT09-044',
      name: 'ขวัญตา เรื่องราว ครุฑเจ้าเวหา',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'summoned', if: 'summonedByNameIncludes', nameIncludes: 'นักท่องเรื่องราว' },
          actions: [{ op: 'grantSelfAbilities', abilities: GARUDA_GRANT }]
        }
      ],
      parseStatus: 'auto',
      note: 'ถูกอัญเชิญโดยนักท่องเรื่องราว → โจมตีแล้วส่ง Skill จากเด็คลงนรก · ใช้ React Skill ชื่อไม่ซ้ำเพิ่ม 1 ใบ'
    },
    'BT09-056': {
      code: 'BT09-056',
      name: 'Skill : Full Drive',
      abilities: [
        {
          trigger: { on: 'activated' },
          actions: [{
            op: 'chooseMode',
            options: [
              {
                label: 'เรื่องราวจากเด็คขึ้นมือ แล้วสับ',
                actions: [
                  { op: 'deckPick', filter: { type: 'Avatar', nameIncludes: ['เรื่องราว'] }, dest: 'hand', shuffleAfter: true, optional: true },
                  DRAW_IF_8_MAGIC
                ]
              },
              {
                label: 'เรื่องราวจากนรกขึ้นมือ',
                actions: [
                  { op: 'hellPick', filter: { type: 'Avatar', nameIncludes: ['เรื่องราว'] }, dest: 'hand', optional: true },
                  DRAW_IF_8_MAGIC
                ]
              }
            ]
          }]
        }
      ],
      parseStatus: 'auto',
      note: 'เลือกเด็คหรือนรกเอาเรื่องราวขึ้นมือ · ถ้านรกมี Magic ≥8 จั่ว 1'
    },
    'BT09-059': {
      code: 'BT09-059',
      name: 'Skill : Hypersense',
      abilities: [
        {
          keyword: 'React',
          trigger: { on: 'enemyActivateAbility' },
          requireOwnNameIncludes: 'เรื่องราว',
          requireOwnAllNameIncludes: 'เรื่องราว',
          actions: [
            { op: 'nullifyTriggerAvatarUntilEOT' },
            {
              op: 'destroy',
              target: { select: 'triggerSource' },
              ifOwnHellTypeMin: { type: 'Magic', min: 8 }
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'React ตอนศัตรูใช้ความสามารถ Avatar (สนามเราเป็นเรื่องราวทั้งหมด) → สูญเสียความสามารถ · Magic ในนรก ≥8 ทำลายได้'
    },
    'BT09-060': {
      code: 'BT09-060',
      name: 'Skill : Second Energy',
      abilities: [
        {
          keyword: 'React',
          trigger: { on: 'avatarWouldBeDestroyed' },
          requireFromOppCard: true,
          requireTargetNameIncludes: 'เรื่องราว',
          actions: [
            { op: 'preventDestroy' },
            {
              op: 'oppExileHellChoose',
              ifOwnHellTypeMin: { type: 'Magic', min: 8 }
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'React เมื่อเรื่องราวเราจะถูกการ์ดศัตรูทำลาย → ไม่ออกจากสนาม · Magic ในนรก ≥8 ศัตรูเนรเทศจากนรก 1'
    }
  },
  'effects-bt11.json': {
    'BT11-048': {
      code: 'BT11-048',
      name: 'นักท่องเรื่องราว มายา',
      abilities: [
        {
          keyword: 'สั่งใช้',
          trigger: { on: 'activated' },
          fromAvatarZone: true,
          allowOwnBattlePhase: true,
          requireHandFilter: STORY6,
          actions: [{ op: 'storyEvolve', filter: STORY6, powerBonus: 1 }]
        }
      ],
      parseStatus: 'auto',
      note: 'แสดงเรื่องราว Cost 6 จากมือ → เนรเทศตัวเองแล้วอัญเชิญ · ใบที่อัญเชิญ POWER +1'
    },
    'BT11-049': {
      code: 'BT11-049',
      name: 'มายา เรื่องราว เทพเจ้าสายฟ้า',
      abilities: [
        {
          keyword: 'อัตโนมัติ',
          trigger: { on: 'summoned', if: 'summonedByNameIncludes', nameIncludes: 'นักท่องเรื่องราว' },
          actions: [
            { op: 'grantSelfAbilities', abilities: MAYA_GRANT },
            { op: 'deckPick', filter: SKILL_MAGIC, dest: 'hand', shuffleAfter: true, optional: true }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'ถูกอัญเชิญโดยนักท่องเรื่องราว → หา Skill จากเด็ค · ใช้ Magic แล้ว POWER +1 เทิร์นละครั้ง'
    }
  },
  'effects-cc02.json': {
    'CC02-044': {
      code: 'CC02-044',
      name: 'ใบรับสมัครพนักงานลงกา',
      stayOnMagic: true,
      abilities: [
        {
          trigger: { on: 'activated' },
          actions: [{
            op: 'scout',
            count: 2,
            filter: { color: 'เขียว' },
            dest: 'hand',
            restTo: 'bottom'
          }]
        },
        {
          trigger: { on: 'activated' },
          fromMagicZone: true,
          requireTurnsOnMagicMin: 1,
          actions: [
            { op: 'destroy', target: { select: 'self' } },
            {
              op: 'handSummon',
              filter: { type: 'Avatar', color: 'เขียว' },
              costReduce: 2,
              paidCost: false
            }
          ]
        }
      ],
      parseStatus: 'auto',
      note: 'สอดแนม 2 เอาเขียวขึ้นมือ แล้วค้าง Magic Zone · เทิร์นถัดไปทำลายตัวเองอัญเชิญเขียว Cost−2'
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
