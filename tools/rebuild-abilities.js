/* จัดความสามารถตามหมวด + การ์ดชื่อเดียวกันใช้ชุดเดียวกัน
   หมวด:
     Magic      → data/abilities/magic-{Normal|React|Modification|Land}.json
     Avatar     → data/abilities/avatar-{red|blue|purple|green|colorless}.json
     Construct  → data/abilities/construct-{red|blue|purple|green|colorless}.json
     Life       → data/abilities/life.json
   รัน: node tools/rebuild-abilities.js
   ผลลัพธ์: เขียนหมวด + rebuild data/effects-all.json (ทุกโค้ดของชื่อเดียวกันได้ abilities ชุดเดียวกัน)
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ABIL_DIR = path.join(ROOT, 'data', 'abilities');

const COLOR_SLUG = {
  'แดง': 'red', 'ฟ้า': 'blue', 'ม่วง': 'purple', 'เขียว': 'green', '': 'colorless', 'ไร้สี': 'colorless'
};
const COLOR_TH = { red: 'แดง', blue: 'ฟ้า', purple: 'ม่วง', green: 'เขียว', colorless: 'ไร้สี' };

const META_KEYS = [
  'noPaidSummon', 'noHandSummon', 'milledOptional', 'millBonusExtra', 'millBonusExceptSelf',
  'halvePrintedInsteadDestroy', 'forceAllAvatarSymbol', 'nameAliases', 'sacrificeSummon',
  'freeSummonIf', 'uniqueOnField', 'exactGemPay', 'allColors', 'blockLifeUnreveal',
  'grantKeywordAura', 'grantKeywordIfAllyNameIncludes', 'grantKeywordIfLandNameIncludes',
  'ignoreNegativePower', 'auraPower', 'auraNameIncludes',
  'immuneOppMagicTarget', 'millInsteadDestroy', 'lifeBothModes', 'controlImmune',
  'addToHandWhenScoutedByNameIncludes', 'addToHandWhenMilledOrScoutedByNameIncludes',
  'extraSymbols', 'destroyHostIfPower0', 'powerAsGemForSymbol',
  'gemAsCostForNameIncludes', 'revealOppDeckTopIfOwnNameIncludes', 'cannotBeAttackTargetIf',
  'cannotBeAttackTargetIfOwnSymbolOther', 'hostSymbolReplace', 'reattachOnHostDestroy', 'reactAnyWindow',
  'costZeroIfDistinctOwnNameIncludes', 'costZeroIfOwnSymbol', 'abilitiesFromMagicZone',
  'blockAllLandPlay', 'destroyAfterGlobalEndPhases', 'stayOnMagic', 'remainOnMagic',
  'allowOppTurnMagic', 'oncePerTurnCard', 'ignoreReactOncePerTurnLimit', 'revealDeckTops',
  'protectReplace', 'protectReplaceIfHostNameIncludes', 'protectReplaceForNameIncludes',
  'overdoseIfOwnFaceUpLifeMin', 'overdoseSuppressEnemyKeywords', 'overdoseLockOwnAbilities',
  'uniqueAttachedNames', 'attachOnly', 'hostBlockReactUntilCombatEnd', 'suppressVictimDestroyed',
  'protectAllyNameIncludes', 'attackLimitPerTurn', 'hostCannotAttack', 'instantWinIf'
];

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function saveJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function effectRichness(e) {
  if (!e) return -1;
  let n = (e.abilities || []).length * 10;
  if (e.keywords && e.keywords.length) n += e.keywords.length;
  for (const k of META_KEYS) {
    const v = e[k];
    if (v == null) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
    n += 2;
  }
  return n;
}

function setCode(code) {
  const m = String(code || '').match(/^([A-Za-z]+\d*)/);
  return m ? m[1].toUpperCase() : '';
}

function categoryOf(card) {
  const type = card.type || '';
  if (type === 'Magic') {
    const sub = card.subtype || 'Normal';
    return { file: 'magic-' + sub, type: 'Magic', subtype: sub, color: '' };
  }
  if (type === 'Avatar' || type === 'Construct') {
    const col = card.color || 'ไร้สี';
    const slug = COLOR_SLUG[col] || 'colorless';
    return {
      file: type.toLowerCase() + '-' + slug,
      type,
      subtype: '',
      color: COLOR_TH[slug] || col || 'ไร้สี'
    };
  }
  if (type === 'Life') return { file: 'life', type: 'Life', subtype: '', color: '' };
  return { file: 'other', type: type || 'Other', subtype: '', color: '' };
}

function pickMeta(e) {
  const out = {};
  for (const k of META_KEYS) {
    if (e[k] != null) out[k] = e[k];
  }
  if (e.parseStatus) out.parseStatus = e.parseStatus;
  if (e.note) out.note = e.note;
  return out;
}

function loadAllEffectsByCode() {
  const dir = path.join(ROOT, 'data');
  const byCode = {};
  fs.readdirSync(dir).filter(f => /^effects-.+\.json$/.test(f) && f !== 'effects-all.json').forEach(f => {
    const j = loadJson(path.join(dir, f));
    (j.cards || []).forEach(c => {
      if (!c || !c.code) return;
      const cur = byCode[c.code];
      if (!cur || effectRichness(c) > effectRichness(cur)) byCode[c.code] = c;
    });
  });
  return byCode;
}

function loadCards() {
  const raw = loadJson(path.join(ROOT, 'data', 'cards.json'));
  const list = Array.isArray(raw) ? raw : (raw.cards || []);
  const byCode = {};
  list.forEach(c => {
    if (!c || !c.code) return;
    // เก็บพิมพ์หลัก (ไม่ใช่ SCR ถ้ามีตัวปกติ)
    if (!byCode[c.code] || c.image === c.code + '.png') byCode[c.code] = c;
  });
  return { list, byCode };
}

function buildNameGroups(cardsByCode, effectsByCode) {
  const byName = {};
  Object.values(cardsByCode).forEach(card => {
    const name = card.name;
    if (!name) return;
    if (!byName[name]) byName[name] = { name, codes: [], card, bestEff: null };
    if (!byName[name].codes.includes(card.code)) byName[name].codes.push(card.code);
    // card ตัวแทน = ชุดที่ออกก่อน / รหัสเล็กกว่า ถ้ายังไม่มี type
    if (!byName[name].card || String(card.code) < String(byName[name].card.code))
      byName[name].card = card;
  });
  // เติมโค้ดที่มีแต่ใน effects (ไม่มีใน cards — ไม่น่าเกิด)
  Object.values(effectsByCode).forEach(e => {
    if (!e.name) return;
    if (!byName[e.name]) byName[e.name] = { name: e.name, codes: [], card: null, bestEff: null };
    if (e.code && !byName[e.name].codes.includes(e.code)) byName[e.name].codes.push(e.code);
  });
  Object.values(byName).forEach(g => {
    let best = null;
    g.codes.forEach(code => {
      const e = effectsByCode[code];
      if (!e) return;
      if (!best || effectRichness(e) > effectRichness(best)) best = e;
    });
    g.bestEff = best;
    g.codes.sort();
  });
  return byName;
}

function writeCategories(byName) {
  const buckets = {};
  Object.values(byName).forEach(g => {
    const card = g.card || { name: g.name, type: 'Other' };
    const cat = categoryOf(card);
    if (!buckets[cat.file]) {
      buckets[cat.file] = {
        category: cat.file,
        type: cat.type,
        subtype: cat.subtype || undefined,
        color: cat.color || undefined,
        entries: []
      };
    }
    const eff = g.bestEff || {};
    const entry = {
      name: g.name,
      codes: g.codes.slice(),
      abilities: (eff.abilities && eff.abilities.length) ? eff.abilities : [],
      keywords: (eff.keywords && eff.keywords.length) ? eff.keywords : undefined
    };
    Object.assign(entry, pickMeta(eff));
    if (!entry.keywords) delete entry.keywords;
    const hasFx = entry.abilities.length || (entry.keywords && entry.keywords.length)
      || META_KEYS.some(k => entry[k] != null);
    if (hasFx && entry.parseStatus === 'manual') entry.parseStatus = 'auto';
    if (!entry.abilities.length && !Object.keys(pickMeta(eff)).length) {
      entry.parseStatus = entry.parseStatus || 'stub';
    }
    buckets[cat.file].entries.push(entry);
  });
  Object.values(buckets).forEach(b => {
    b.entries.sort((a, b2) => a.name.localeCompare(b2.name, 'th'));
  });
  fs.mkdirSync(ABIL_DIR, { recursive: true });
  // ล้างไฟล์เก่าในโฟลเดอร์ abilities (เฉพาะ .json)
  fs.readdirSync(ABIL_DIR).filter(f => f.endsWith('.json')).forEach(f => {
    fs.unlinkSync(path.join(ABIL_DIR, f));
  });
  Object.keys(buckets).sort().forEach(file => {
    saveJson(path.join(ABIL_DIR, file + '.json'), buckets[file]);
  });
  return buckets;
}

function rebuildEffectsAll(buckets) {
  const cards = [];
  const seen = new Set();
  Object.values(buckets).forEach(b => {
    b.entries.forEach(entry => {
      entry.codes.forEach(code => {
        if (seen.has(code)) return;
        seen.add(code);
        const row = {
          code,
          name: entry.name,
          abilities: entry.abilities || [],
          parseStatus: entry.parseStatus || (entry.abilities && entry.abilities.length ? 'auto' : 'stub')
        };
        if (entry.keywords && entry.keywords.length) row.keywords = entry.keywords;
        for (const k of META_KEYS) {
          if (entry[k] != null) row[k] = entry[k];
        }
        if (entry.note) row.note = entry.note;
        cards.push(row);
      });
    });
  });
  cards.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  saveJson(path.join(ROOT, 'data', 'effects-all.json'), { cards });
  return cards;
}

/** sync คำนิยามชื่อเดียวกันกลับเข้า effects-{set}.json ตามรหัส */
function syncSetFiles(buckets) {
  const bySet = {};
  Object.values(buckets).forEach(b => {
    b.entries.forEach(entry => {
      entry.codes.forEach(code => {
        const set = setCode(code).toLowerCase();
        if (!set) return;
        if (!bySet[set]) bySet[set] = [];
        const row = {
          code,
          name: entry.name,
          abilities: entry.abilities || [],
          parseStatus: entry.parseStatus || (entry.abilities && entry.abilities.length ? 'auto' : 'stub')
        };
        if (entry.keywords && entry.keywords.length) row.keywords = entry.keywords;
        for (const k of META_KEYS) {
          if (entry[k] != null) row[k] = entry[k];
        }
        if (entry.note) row.note = entry.note;
        bySet[set].push(row);
      });
    });
  });
  let updated = 0;
  Object.entries(bySet).forEach(([set, rows]) => {
    const p = path.join(ROOT, 'data', 'effects-' + set + '.json');
    if (!fs.existsSync(p)) return;
    const j = loadJson(p);
    const map = {};
    rows.forEach(r => { map[r.code] = r; });
    const out = [];
    const seen = new Set();
    (j.cards || []).forEach(c => {
      if (map[c.code]) {
        out.push(Object.assign({}, c, map[c.code]));
        seen.add(c.code);
      } else out.push(c);
    });
    rows.forEach(r => {
      if (!seen.has(r.code)) out.push(r);
    });
    saveJson(p, { cards: out });
    updated++;
  });
  return updated;
}

function main() {
  const { byCode: cardsByCode } = loadCards();
  const effectsByCode = loadAllEffectsByCode();
  const byName = buildNameGroups(cardsByCode, effectsByCode);
  const buckets = writeCategories(byName);
  const all = rebuildEffectsAll(buckets);
  const sets = syncSetFiles(buckets);

  const withAbil = all.filter(c => (c.abilities && c.abilities.length) || c.keywords || META_KEYS.some(k => c[k] != null)).length;
  const reprintFilled = Object.values(byName).filter(g => g.codes.length > 1 && g.bestEff && effectRichness(g.bestEff) > 0).length;
  console.log('abilities files:', Object.keys(buckets).sort().join(', '));
  console.log('names:', Object.keys(byName).length, '· codes in effects-all:', all.length, '· with effect:', withAbil);
  console.log('reprint groups with shared abilities:', reprintFilled);
  console.log('synced set files:', sets);

  // ตัวอย่างการ์ดซ้ำ
  for (const name of ['ชายจากอนาคต', 'ของขวัญที่เมียทิ้งไว้ให้', 'เจค นักฆ่ามือเก๋า', 'โคกอีสานนูน']) {
    const g = byName[name];
    if (!g) continue;
    console.log(' ·', name, '→', g.codes.join(', '), 'abil=', (g.bestEff && g.bestEff.abilities || []).length);
  }
}

main();
