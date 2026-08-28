/* Rebuild data/starters.json as official 50+5 box counts */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cardsAll = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));

function uniqSeries(series) {
  const map = new Map();
  cardsAll.filter(c => c.series === series).forEach(c => {
    if (!map.has(c.code)) map.set(c.code, c);
  });
  return [...map.values()];
}

const OFFICIAL_COUNTS = {
  SD08: {
    'SD08-001': 1, 'SD08-002': 4, 'SD08-003': 2, 'SD08-004': 2, 'SD08-005': 2,
    'SD08-006': 2, 'SD08-007': 2, 'SD08-008': 2, 'SD08-009': 4, 'SD08-010': 4,
    'SD08-011': 4, 'SD08-012': 2, 'SD08-013': 1, 'SD08-014': 2, 'SD08-015': 2,
    'SD08-016': 2, 'SD08-017': 4, 'SD08-018': 2, 'SD08-019': 2, 'SD08-020': 4,
    'SD08-021': 1, 'SD08-022': 1, 'SD08-023': 1, 'SD08-024': 1, 'SD08-025': 1
  },
  KD01: {
    'KD01-001': 1, 'KD01-002': 2, 'KD01-003': 2, 'KD01-004': 3, 'KD01-005': 2,
    'KD01-006': 4, 'KD01-007': 3, 'KD01-008': 2, 'KD01-009': 4, 'KD01-010': 4,
    'KD01-011': 3, 'KD01-012': 4, 'KD01-013': 2, 'KD01-014': 2, 'KD01-015': 2,
    'KD01-016': 2, 'KD01-017': 2, 'KD01-018': 2, 'KD01-019': 3, 'KD01-020': 1,
    'KD01-021': 1, 'KD01-022': 1, 'KD01-023': 1, 'KD01-024': 1, 'KD01-025': 1
  },
  KD02: {
    'KD02-001': 1, 'KD02-002': 2, 'KD02-003': 2, 'KD02-004': 3, 'KD02-005': 3,
    'KD02-006': 3, 'KD02-007': 4, 'KD02-008': 2, 'KD02-009': 2, 'KD02-010': 4,
    'KD02-011': 4, 'KD02-012': 1, 'KD02-013': 2, 'KD02-014': 2, 'KD02-015': 2,
    'KD02-016': 2, 'KD02-017': 1, 'KD02-018': 2, 'KD02-019': 4, 'KD02-020': 4,
    'KD02-021': 1, 'KD02-022': 1, 'KD02-023': 1, 'KD02-024': 1, 'KD02-025': 1
  },
  KD03: {
    'KD03-001': 1, 'KD03-002': 2, 'KD03-003': 4, 'KD03-004': 4, 'KD03-005': 2,
    'KD03-006': 2, 'KD03-007': 4, 'KD03-008': 3, 'KD03-009': 4, 'KD03-010': 2,
    'KD03-011': 2, 'KD03-012': 2, 'KD03-013': 2, 'KD03-014': 2, 'KD03-015': 3,
    'KD03-016': 2, 'KD03-017': 2, 'KD03-018': 1, 'KD03-019': 4, 'KD03-020': 2,
    'KD03-021': 1, 'KD03-022': 1, 'KD03-023': 1, 'KD03-024': 1, 'KD03-025': 1
  },
  KD04: {
    'KD04-001': 2, 'KD04-002': 2, 'KD04-003': 2, 'KD04-004': 3, 'KD04-005': 3,
    'KD04-006': 4, 'KD04-007': 3, 'KD04-008': 2, 'KD04-009': 2, 'KD04-010': 3,
    'KD04-011': 4, 'KD04-012': 1, 'KD04-013': 3, 'KD04-014': 3, 'KD04-015': 4,
    'KD04-016': 3, 'KD04-017': 1, 'KD04-018': 1, 'KD04-019': 1, 'KD04-020': 3,
    'KD04-021': 1, 'KD04-022': 1, 'KD04-023': 1, 'KD04-024': 1, 'KD04-025': 1
  }
};

function countOf(c, ser) {
  if (OFFICIAL_COUNTS[ser] && OFFICIAL_COUNTS[ser][c.code] != null) return OFFICIAL_COUNTS[ser][c.code];
  const m = String(c.dropRate || '').match(/(\d+)\s*\//);
  if (m) return +m[1];
  if (c.type === 'Life') return 1;
  if (c.rarity === 'UR' || c.rarity === 'SEC') return 1;
  if (c.rarity === 'SR') return 2;
  return 2;
}

const starters = {};
const series = ['SD01', 'SD02', 'SD03', 'SD04', 'SD05', 'SD06', 'SD07', 'SD08', 'SD09', 'KD01', 'KD02', 'KD03', 'KD04'];
for (const ser of series) {
  const list = uniqSeries(ser);
  const main = {}, life = {};
  list.forEach(c => {
    const n = countOf(c, ser);
    if (c.type === 'Life') life[c.code] = n;
    else main[c.code] = n;
  });
  const mainN = Object.values(main).reduce((a, b) => a + b, 0);
  const lifeN = Object.values(life).reduce((a, b) => a + b, 0);
  const ok = mainN === 50 && lifeN === 5 ? 'OK' : 'WARN';
  console.log(ok, ser, mainN + '+' + lifeN);
  starters[ser] = {
    name: `${ser} Starter`,
    label: `${ser} Starter (${mainN}+${lifeN})`,
    main, life
  };
}
fs.writeFileSync(path.join(ROOT, 'data/starters.json'), JSON.stringify(starters, null, 2));
console.log('wrote data/starters.json');
