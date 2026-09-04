/* สร้าง effects สำหรับ SD02–SD07 + KD01–KD04
   - แมปซ้ำชื่อกับเอฟเฟกต์ที่มีอยู่แล้ว (KD มักซ้ำ BT)
   - แปลงข้อความแบบที่พบบ่อย (Life / Land / Mod / React / จุติ / จั่ว)
   - ที่เหลือ = partial ว่าง (เล่นบนโต๊ะได้ แต่ผลซับซ้อนต้องเติมทีหลัง)
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cardsAll = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8'));
const existingSets = ['sd01', 'sd08', 'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11'];
const known = {};
for (const s of existingSets) {
  const p = path.join(ROOT, `data/effects-${s}.json`);
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  (j.cards || []).forEach(e => { known[e.code] = e; });
}

const byName = {};
cardsAll.forEach(c => {
  if (!byName[c.name]) byName[c.name] = [];
  if (!byName[c.name].includes(c.code)) byName[c.name].push(c.code);
});

function uniqSeries(series) {
  const map = new Map();
  cardsAll.filter(c => c.series === series).forEach(c => {
    if (!map.has(c.code)) map.set(c.code, c);
  });
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function cloneAbilities(src) {
  return JSON.parse(JSON.stringify(src.abilities || []));
}

function findAlias(card) {
  if (known[card.code] && (known[card.code].abilities || []).length) return known[card.code];
  for (const code of (byName[card.name] || [])) {
    if (code === card.code) continue;
    const e = known[code];
    if (e && (e.abilities || []).length) return e;
  }
  return null;
}

function parseEffect(card) {
  const text = (card.effect || '').replace(/\s+/g, ' ').trim();
  if (!text) return { abilities: [], parseStatus: 'verified', note: 'ไม่มีข้อความเอฟเฟกต์' };

  const abilities = [];
  let status = 'auto';

  // Life
  if (card.type === 'Life' || /ถูกหงายจากการโจมตี/.test(text)) {
    const m = text.match(/จั่ว(?:การ์ด)?\s*(\d+)/);
    abilities.push({
      trigger: { on: 'lifeRevealedByAttack' },
      actions: [{ op: 'draw', count: m ? +m[1] : 1, player: 'owner', schedule: 'nextOwnMainPhase' }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // Modification POWER +N
  if (card.subtype === 'Modification') {
    const m = text.match(/POWER\s*\+(\d+)/i);
    if (m) {
      abilities.push({
        trigger: { on: 'static', if: 'self.attached' },
        actions: [{ op: 'modifyPower', amount: +m[1], duration: 'whileEquipped', layer: 2, target: { select: 'equippedAvatar' } }]
      });
    }
    if (/สวมใส่ได้แค่|สวมใส่ได้เฉพาะ/.test(text)) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const nm = text.match(/Avatar\s*"([^"]+)"/);
      if (sym) return { abilities, attachOnly: { symbol: sym[1].trim() }, parseStatus: abilities.length ? 'auto' : 'partial' };
      if (nm) return { abilities, attachOnly: { nameIncludes: nm[1].trim() }, parseStatus: abilities.length ? 'auto' : 'partial' };
    }
    if (abilities.length) return { abilities, parseStatus: 'auto' };
  }

  // Land POWER
  if (card.subtype === 'Land') {
    const m = text.match(/POWER\s*\+(\d+)/i);
    if (m) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const target = { select: 'all', type: 'Avatar', side: 'any', zone: 'avatarZone' };
      if (sym) target.symbol = sym[1].trim();
      else if (/ฝ่ายเรา/.test(text)) target.side = 'own';
      abilities.push({
        trigger: { on: 'static', if: 'self.zone==landZone' },
        actions: [{ op: 'modifyPower', amount: +m[1], duration: 'whileOnField', layer: 3, target }]
      });
      return { abilities, parseStatus: 'auto' };
    }
  }

  // React: อุบัติเหตุ — ทำลายตอนอัญเชิญ
  if (card.subtype === 'React' && /เมื่อมี Avatar อัญเชิญ|เมื่อ Avatar .*อัญเชิญ/.test(text) && /ทำลาย/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'avatarSummoned', if: 'any' },
      react: true,
      actions: [{ op: 'destroy', target: { select: 'triggerSource' } }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // React: ไปเลยมอนตี้ — ลด POWER ตามจำนวนมือ+สนาม
  if (card.subtype === 'React' && /ประกาศโจมตี/.test(text) && /POWER\s*ลด|ลดลงตามจำนวน/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'enemyDeclareAttack' },
      actions: [{ op: 'weakenAttacker', per: 2, count: ['ownSide'], until: 'endOfTurn' }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // React: ทำลายผู้โจมตี
  if (card.subtype === 'React' && /ประกาศโจมตี/.test(text) && /ทำลาย Avatar ที่โจมตี|ส่ง.*ที่โจมตี.*นรก|ทำลายผู้โจมตี/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'enemyDeclareAttack' },
      actions: [{ op: 'destroyAttacker' }]
    });
    return { abilities, parseStatus: 'auto' };
  }

  // React generic: enemyDeclareAttack with destroyTarget / cancel — mark partial with trigger so UI shows
  if (card.subtype === 'React' && /ประกาศโจมตี|เป็นเป้าหมายการโจมตี|ถูกโจมตี/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'enemyDeclareAttack' },
      actions: [],
      note: 'ผลซับซ้อน — เล่นมือ/รอเติม'
    });
    return { abilities, parseStatus: 'partial', note: text.slice(0, 80) };
  }

  if (card.subtype === 'React' && /อัญเชิญ/.test(text)) {
    abilities.push({
      keyword: 'React',
      trigger: { on: 'avatarSummoned', if: 'any' },
      react: true,
      actions: [],
      note: 'ผลซับซ้อน — เล่นมือ/รอเติม'
    });
    return { abilities, parseStatus: 'partial', note: text.slice(0, 80) };
  }

  // Normal Magic: จั่วอย่างเดียว
  if (card.type === 'Magic' && (card.subtype === 'Normal' || !card.subtype)) {
    const drawOnly = text.match(/^จั่ว(?:การ์ด)?\s*(\d+)\s*ใบ\.?$/);
    if (drawOnly) {
      abilities.push({
        trigger: { on: 'activated' },
        actions: [{ op: 'draw', count: +drawOnly[1], player: 'owner' }]
      });
      return { abilities, parseStatus: 'auto' };
    }
    // ทิ้ง ... จั่ว N
    const discDraw = text.match(/ทิ้ง[\s\S]{0,80}?จั่ว(?:การ์ด)?\s*(\d+)/);
    if (discDraw && /จาก(?:บน)?มือ|จากมือ/.test(text)) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const cost = [{ op: 'discard', from: 'hand', count: 1, filter: { type: 'Avatar' } }];
      if (sym) cost[0].filter.symbol = sym[1].trim();
      abilities.push({
        trigger: { on: 'activated' },
        cost,
        actions: [{ op: 'draw', count: +discDraw[1], player: 'owner' }]
      });
      return { abilities, parseStatus: 'auto' };
    }
    // POWER +N เลือก Avatar
    const buff = text.match(/POWER\s*\+(\d+)[\s\S]{0,40}?(จนจบเทิร์น|จนจบการต่อสู้)?/i);
    if (buff && /เลือก Avatar|Avatar 1 ใบ/.test(text) && !/ทิ้ง|เซ่น|นอน/.test(text.slice(0, 40))) {
      const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/);
      const target = { select: 'choose', type: 'Avatar', count: 1, side: 'any' };
      if (sym) target.symbol = sym[1].trim();
      abilities.push({
        trigger: { on: 'activated' },
        actions: [{ op: 'modifyPower', amount: +buff[1], duration: 'endOfTurn', layer: 4, target }]
      });
      return { abilities, parseStatus: 'auto' };
    }
  }

  // Avatar จุติ POWER +/-N choose — อย่าหยิบ POWER จากบรรทัดต่อเนื่อง
  if (/จุติ/.test(text)) {
    const m = text.split(/ต่อเนื่อง/)[0].match(/POWER\s*([+-]\d+)/i);
    if (m) {
      abilities.push({
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'modifyPower', amount: +m[1], duration: 'endOfTurn', layer: 4,
          target: { select: 'choose', type: 'Avatar', count: 1, side: 'any' }
        }]
      });
    } else if (/จั่ว(?:การ์ด)?\s*(\d+)/.test(text)) {
      const d = text.match(/จั่ว(?:การ์ด)?\s*(\d+)/);
      abilities.push({
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{ op: 'draw', count: d ? +d[1] : 1, player: 'owner' }]
      });
    } else {
      abilities.push({
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [],
        note: 'จุติซับซ้อน'
      });
      status = 'partial';
    }
  }

  // อัตโนมัติ เมื่อโจมตี POWER +N — อย่าหยิบ POWER จากบรรทัดต่อเนื่อง
  if (/อัตโนมัติ|อัติโนมัติ/.test(text) && /โจมตี/.test(text)) {
    const autoText = (text.match(/(?:อัตโนมัติ|อัติโนมัติ)[\s\S]*?(?=ต่อเนื่อง|$)/) || [text])[0];
    const m = autoText.match(/POWER\s*\+(\d+)/i);
    if (m) {
      abilities.push({
        keyword: 'อัตโนมัติ',
        trigger: { on: 'declareAttack', if: 'source==self' },
        actions: [{ op: 'modifyPower', amount: +m[1], duration: 'endOfTurn', layer: 4, target: { select: 'self' } }]
      });
    }
  }

  // ต่อเนื่อง POWER +N — กรองชื่อในเครื่องหมายคำพูด หรือ symbol
  if (/ต่อเนื่อง/.test(text) && /POWER\s*\+(\d+)/i.test(text)) {
    const m = text.match(/POWER\s*\+(\d+)/i);
    const named = text.match(/ต่อเนื่อง[\s\S]{0,80}?Avatar\s*[“"']([^“"']+)[”"']/);
    const sym = text.match(/\{[Ss]ymbol\s*[:：]?\s*([^}]+)\}/) || text.match(/Avatar\s*\{[^}]*symbol\s*([^}]+)\}/i);
    const target = { select: 'all', type: 'Avatar', side: 'own', zone: 'avatarZone' };
    if (named) target.nameIncludes = [named[1].trim()];
    else if (sym) target.symbol = (sym[1] || '').trim();
    abilities.push({
      keyword: 'ต่อเนื่อง',
      trigger: { on: 'static', if: 'self.zone==avatarZone' },
      actions: [{ op: 'modifyPower', amount: +m[1], duration: 'whileOnField', layer: 3, target }]
    });
  }

  // สามัคคี keyword only
  if (/สามัคคี/.test(text) && !abilities.length) {
    return { keywords: ['สามัคคี'], abilities: [], parseStatus: 'partial', note: 'สามัคคี — keyword' };
  }

  if (abilities.length) return { abilities, parseStatus: status, note: status === 'partial' ? text.slice(0, 100) : undefined };

  // fallback
  return { abilities: [], parseStatus: 'manual', note: text.slice(0, 120) };
}

function buildSeries(series) {
  const cards = uniqSeries(series);
  const out = [];
  let aliased = 0, parsed = 0, empty = 0, manual = 0;
  
  // Load existing series file if available to preserve manual/verified cards
  const existingFile = path.join(ROOT, `data/effects-${series.toLowerCase()}.json`);
  const existingMap = new Map();
  if (fs.existsSync(existingFile)) {
    try {
      const j = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
      (j.cards || []).forEach(c => {
        if (c && c.code) existingMap.set(c.code, c);
      });
    } catch(e) {}
  }

  for (const card of cards) {
    const existing = existingMap.get(card.code);
    if (existing && ((existing.abilities && existing.abilities.length > 0) || existing.parseStatus === 'manual' || existing.parseStatus === 'verified')) {
      out.push(existing);
      if (existing.parseStatus === 'manual') manual++;
      else parsed++;
      continue;
    }

    const alias = findAlias(card);
    if (alias && (alias.abilities || []).length) {
      const entry = {
        code: card.code,
        name: card.name,
        abilities: cloneAbilities(alias),
        parseStatus: 'auto',
        note: `แมปจาก ${alias.code}`
      };
      if (alias.keywords) entry.keywords = alias.keywords;
      if (alias.attachOnly) entry.attachOnly = alias.attachOnly;
      if (alias.nullifyHost) entry.nullifyHost = alias.nullifyHost;
      out.push(entry);
      aliased++;
      continue;
    }
    const parsedE = parseEffect(card);
    const entry = { code: card.code, name: card.name, ...parsedE };
    out.push(entry);
    if (!(card.effect || '').trim()) empty++;
    else if (parsedE.parseStatus === 'manual') manual++;
    else parsed++;
  }
  return { cards: out, stats: { total: cards.length, aliased, parsed, empty, manual } };
}

const TARGETS = ['SD02', 'SD03', 'SD04', 'SD05', 'SD06', 'SD07', 'SD09', 'KD01', 'KD02', 'KD03', 'KD04'];
const allNew = [];
for (const ser of TARGETS) {
  const { cards, stats } = buildSeries(ser);
  const file = path.join(ROOT, `data/effects-${ser.toLowerCase()}.json`);
  fs.writeFileSync(file, JSON.stringify({
    $schema: 'bot-effect-schema v0.2 (starter-gen)',
    note: `${ser} — gen จากข้อความ + แมปชื่อซ้ำ · auto/partial/manual`,
    cards
  }, null, 2));
  console.log(ser, stats, '→', path.basename(file));
  allNew.push(...cards);
}

// rebuild effects-all
const sets = ['sd01', 'sd02', 'sd03', 'sd04', 'sd05', 'sd06', 'sd07', 'sd08', 'sd09',
  'kd01', 'kd02', 'kd03', 'kd04',
  'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11', 'cc01'];
const merged = [];
const seen = new Set();
for (const s of sets) {
  const p = path.join(ROOT, `data/effects-${s}.json`);
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const c of (j.cards || [])) {
    // later sets can override earlier for same code only if first time
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    merged.push(c);
  }
}
fs.writeFileSync(path.join(ROOT, 'data/effects-all.json'), JSON.stringify({ cards: merged }));
console.log('effects-all', merged.length, 'cards');

// starters.json — ตามจำนวนในกล่องจริง (Main 50 + Life 5)
// ใช้ dropRate จาก cards.json เป็นหลัก · ชุดที่ยังไม่มี dropRate ใช้รายการอ้างอิงจาก My Space
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
  // รายการอ้างอิงกล่องจริงมาก่อน (บางใบใน cards.json dropRate คลาดเคลื่อน)
  if (OFFICIAL_COUNTS[ser] && OFFICIAL_COUNTS[ser][c.code] != null) return OFFICIAL_COUNTS[ser][c.code];
  const m = String(c.dropRate || '').match(/(\d+)\s*\//);
  if (m) return +m[1];
  if (c.type === 'Life') return 1;
  if (c.rarity === 'UR' || c.rarity === 'SEC') return 1;
  if (c.rarity === 'SR') return 2;
  return 2;
}

const starters = {};
for (const ser of ['SD01', 'SD02', 'SD03', 'SD04', 'SD05', 'SD06', 'SD07', 'SD08', 'KD01', 'KD02', 'KD03', 'KD04']) {
  const list = uniqSeries(ser);
  const main = {}, life = {};
  list.forEach(c => {
    const n = countOf(c, ser);
    if (c.type === 'Life') life[c.code] = n;
    else main[c.code] = n;
  });
  const mainN = Object.values(main).reduce((a, b) => a + b, 0);
  const lifeN = Object.values(life).reduce((a, b) => a + b, 0);
  if (mainN !== 50 || lifeN !== 5) {
    console.warn('WARN starter', ser, 'is', mainN + '+' + lifeN, '(expected 50+5)');
  }
  starters[ser] = {
    name: `${ser} Starter`,
    label: `${ser} Starter (${mainN}+${lifeN})`,
    main, life
  };
}
fs.writeFileSync(path.join(ROOT, 'data/starters.json'), JSON.stringify(starters, null, 2));
console.log('starters', Object.keys(starters).map(k => {
  const s = starters[k];
  const m = Object.values(s.main).reduce((a, b) => a + b, 0);
  const l = Object.values(s.life).reduce((a, b) => a + b, 0);
  return k + '=' + m + '+' + l;
}).join(', '));
