/* แก๊งขยะ / ขยะแขยง — เติม effects ออโต้ + rebuild effects-all.json */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
}
function save(name, j) {
  fs.writeFileSync(path.join(ROOT, 'data', name), JSON.stringify(j, null, 2) + '\n');
}
function upsert(cards, entry) {
  const i = cards.findIndex(c => c.code === entry.code);
  if (i >= 0) cards[i] = Object.assign({}, cards[i], entry);
  else cards.push(entry);
}

const GANG = {
  'BT10-003': {
    code: 'BT10-003',
    name: 'พี่บูม แก๊งขยะ',
    parseStatus: 'manual',
    abilities: [
      {
        trigger: { on: 'activated' },
        oncePerTurn: true,
        cost: [{ op: 'discard', from: 'hand', count: 1 }],
        actions: [{
          op: 'chooseMode',
          options: [
            {
              label: 'พี่ซี๊ด แก๊งขยะ จากเด็คขึ้นมือ',
              actions: [{
                op: 'deckPick',
                filter: { nameIncludes: ['พี่ซี๊ด แก๊งขยะ'] },
                dest: 'hand',
                shuffleAfter: true
              }]
            },
            {
              label: 'เบรกเกต แก๊งขยะ จากเด็คขึ้นมือ',
              actions: [{
                op: 'deckPick',
                filter: { nameIncludes: ['เบรกเกต แก๊งขยะ'] },
                dest: 'hand',
                shuffleAfter: true
              }]
            }
          ]
        }]
      },
      {
        trigger: { on: 'receivedUnity' },
        requireGiverNameIncludes: 'พี่ซี๊ด แก๊งขยะ',
        actions: [{
          op: 'modifyPower',
          amount: 1,
          duration: 'permanent',
          layer: 4,
          target: { select: 'all', type: 'Avatar', side: 'own', nameIncludes: ['แก๊งขยะ'] }
        }]
      }
    ]
  },
  'BT10-013': {
    code: 'BT10-013',
    name: 'พี่เจมส์ แก๊งขยะ',
    parseStatus: 'manual',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [
          {
            op: 'deckPick',
            filter: { nameIncludes: ['พี่บูม แก๊งขยะ'] },
            dest: 'hand',
            shuffleAfter: true
          },
          {
            op: 'handCostMod',
            nameIncludes: 'พี่บูม แก๊งขยะ',
            amount: -1,
            until: 'endOfTurn'
          }
        ]
      },
      {
        trigger: { on: 'receivedUnity' },
        requireGiverNameIncludes: 'พี่ซี๊ด แก๊งขยะ',
        actions: [{
          op: 'hellPick',
          filter: { type: 'Avatar', nameIncludes: ['แก๊งขยะ'], nameNotEquals: 'พี่เจมส์ แก๊งขยะ' },
          dest: 'avatar',
          paidCost: false,
          multiMax: 2,
          multiMin: 1,
          distinctNames: true,
          optional: true,
          showAll: true
        }]
      }
    ]
  },
  'BT10-047': {
    code: 'BT10-047',
    name: 'เบรกเกต แก๊งขยะ',
    parseStatus: 'manual',
    abilities: [
      {
        trigger: { on: 'receivedUnity' },
        requireGiverNameIncludes: 'พี่ซี๊ด แก๊งขยะ',
        actions: [{ op: 'untap', target: 'self' }]
      }
    ]
  },
  'BT10-074': {
    code: 'BT10-074',
    name: 'ZeedZad Server',
    parseStatus: 'manual',
    costZeroIfDistinctOwnNameIncludes: { nameIncludes: 'แก๊งขยะ', min: 2 },
    grantKeywordAura: { keyword: 'ลูกฮึด', nameIncludes: 'แก๊งขยะ', side: 'own' },
    abilities: [],
    note: 'Cost 0 ถ้าแก๊งขยะชื่อไม่ซ้ำ ≥2 · ออร่าลูกฮึดให้แก๊งขยะ'
  }
};

const bt10 = load('effects-bt10.json');
Object.values(GANG).forEach(e => upsert(bt10.cards, e));
// พี่ซี๊ด มีอยู่แล้ว — เก็บ keywords
{
  const seed = bt10.cards.find(c => c.code === 'BT10-032');
  if (seed) {
    seed.keywords = seed.keywords || ['สามัคคี'];
    if (!seed.keywords.includes('สามัคคี')) seed.keywords.push('สามัคคี');
  }
}
save('effects-bt10.json', bt10);

// เจค SL reprint
const slPath = path.join(ROOT, 'data', 'effects-sl02.json');
let sl = fs.existsSync(slPath) ? load('effects-sl02.json') : { cards: [] };
upsert(sl.cards, {
  code: 'SL02-003',
  name: 'เจค นักฆ่ามือเก๋า',
  keywords: ['ลูกฮึด'],
  uniqueOnField: true,
  parseStatus: 'manual',
  abilities: [
    {
      trigger: { on: 'declareAttack' },
      requireOwnHellNameIncludes: 'ของขวัญที่เมียทิ้งไว้ให้',
      actions: [{ op: 'discardOppRandom', count: 1 }]
    }
  ]
});
save('effects-sl02.json', sl);

const bt05 = load('effects-bt05.json');
upsert(bt05.cards, {
  code: 'BT05-017',
  name: 'เจค นักฆ่ามือเก๋า',
  keywords: ['ลูกฮึด'],
  uniqueOnField: true,
  parseStatus: 'auto',
  abilities: [
    {
      trigger: { on: 'declareAttack' },
      requireOwnHellNameIncludes: 'ของขวัญที่เมียทิ้งไว้ให้',
      actions: [{ op: 'discardOppRandom', count: 1 }]
    }
  ],
  note: 'ลูกฮึด + ทิ้งมือศัตรูเมื่อมีของขวัญในนรก'
});
upsert(bt05.cards, {
  code: 'BT05-018',
  name: 'ของขวัญที่เมียทิ้งไว้ให้',
  parseStatus: 'auto',
  abilities: [],
  freeSummonIf: {
    requireOwnNameIncludes: 'เจค นักฆ่ามือเก๋า',
    requireNoOwnExactName: 'ของขวัญที่เมียทิ้งไว้ให้'
  },
  note: 'อัญเชิญฟรีจากมือถ้ามีเจค และยังไม่มีของขวัญบนสนาม'
});
save('effects-bt05.json', bt05);

// rebuild
const sets = ['sd01', 'sd02', 'sd03', 'sd04', 'sd05', 'sd06', 'sd07', 'sd08',
  'kd01', 'kd02', 'kd03', 'kd04',
  'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11',
  'cc01', 'cc02', 'sl01', 'sl02'];
const merged = [];
const seen = new Set();
for (const s of sets) {
  const p = path.join(ROOT, `data/effects-${s}.json`);
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const c of (j.cards || [])) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    merged.push(c);
  }
}
fs.writeFileSync(path.join(ROOT, 'data/effects-all.json'), JSON.stringify({ cards: merged }));
console.log('effects-all', merged.length);
['BT10-003', 'BT10-013', 'BT10-032', 'BT10-047', 'BT10-074', 'BT05-017', 'BT05-018', 'SL02-003'].forEach(code => {
  const c = merged.find(x => x.code === code);
  console.log(code, c ? `abil=${(c.abilities || []).length} ${c.name || ''}` : 'MISSING');
});
try { require('child_process').execSync('node tools/rebuild-abilities.js', { cwd: ROOT, stdio: 'inherit' }); }
catch (e) { console.warn('rebuild-abilities failed', e.message); }