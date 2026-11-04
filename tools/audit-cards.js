/* ตรวจข้อมูลความสามารถเทียบข้อความการ์ด (อ่านอย่างเดียว ไม่แก้ไฟล์)
   รัน: node tools/audit-cards.js              สรุปจำนวนต่อประเภท/ชุด
        node tools/audit-cards.js --set SD01   รายการของชุด
        node tools/audit-cards.js --check dead รายการของประเภท
        node tools/audit-cards.js --verified   รวมใบที่ติด verified แล้วด้วย
   ประเภทเป็นตัวชี้จุดสงสัย ไม่ใช่คำตัดสินว่าผิด */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const cards = JSON.parse(read('data/cards.json'));
const effects = JSON.parse(read('data/effects-all.json')).cards;
const code = read('js/engine.js') + read('js/game.js');

const args = process.argv.slice(2);
const argOf = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const onlySet = argOf('--set');
const onlyCheck = argOf('--check');
const includeVerified = args.includes('--verified');

const known = new Set();
const isKnown = s => {
  if (!known.has(s) && (code.includes("'" + s + "'") || code.includes('"' + s + '"') || code.includes('`' + s + '`'))) known.add(s);
  return known.has(s);
};
const effByCode = {};
effects.forEach(e => { effByCode[e.code] = e; });

function walk(list, fn) {
  (list || []).forEach(x => {
    if (!x || typeof x !== 'object') return;
    fn(x);
    walk(x.actions, fn);
    walk(Array.isArray(x.then) ? x.then : (x.then ? [x.then] : []), fn);
    walk(x.options, fn);
  });
}
const META_SKIP = new Set(['code', 'name', 'abilities', 'parseStatus', 'note', 'codes']);
const hasMeta = e => Object.keys(e).some(k => !META_SKIP.has(k));

function audit(card, e) {
  const out = [];
  const add = (check, detail) => out.push({ check, detail });
  const text = (card.effect || '').trim();
  const abilities = (e && e.abilities) || [];
  const json = JSON.stringify(e || {});

  if (!abilities.length && !(e && hasMeta(e))) add('noAbility', text.slice(0, 80));

  abilities.forEach(ab => {
    const on = ab.trigger && ab.trigger.on;
    if (on && !isKnown(on)) add('dead', 'trigger ' + on);
    walk(ab.actions, x => { if (x.op && !isKnown(x.op)) add('dead', 'op ' + x.op); });
    (Array.isArray(ab.cost) ? ab.cost : []).forEach(c => { if (c && c.op && !isKnown(c.op)) add('dead', 'cost ' + c.op); });

    const cond = (ab.trigger && ab.trigger.if) || '';
    if (card.subtype === 'Land' && /self\.zone==avatarZone/.test(cond)) add('zone', 'Land ใช้ avatarZone');
    if (card.type === 'Construct' && /self\.zone==avatarZone/.test(cond)) add('zone', 'Construct ใช้ avatarZone');
    if (card.type === 'Avatar' && /self\.zone==land/.test(cond)) add('zone', 'Avatar ใช้ landZone');

    if (on === 'static') (ab.actions || []).forEach(ac => {
      const t = ac.target || {};
      if (ac.op !== 'modifyPower' || t.select !== 'all') return;
      const filtered = t.nameIncludes || t.nameNotIncludes || t.symbol || t.symbols || t.color
        || t.requireLinked || t.requireAttachedNameIncludes || t.cost != null || t.gem != null || t.power != null;
      if (!filtered && /"[^"]+"|\{\s*symbol|Symbol|Cost \d|สี(แดง|ฟ้า|เขียว|ม่วง)/.test(text)) add('unfilteredAura', (ac.amount >= 0 ? '+' : '') + ac.amount);
    });
  });

  const nums = new Set();
  JSON.stringify(abilities).replace(/"(?:amount|per|amt)":\s*(-?\d+)/g, (m, n) => { nums.add(Math.abs(+n)); return m; });
  const powers = [...text.matchAll(/POWER\s*([+-])\s*(\d+)/g)].map(m => +m[2]);
  const missing = powers.filter(n => !nums.has(n));
  if (powers.length && abilities.length && missing.length) add('powerNumber', 'ข้อความ ' + [...new Set(missing)].join(',') + ' ข้อมูล ' + ([...nums].join(',') || '-'));

  if (abilities.length) {
    if (/เทิร์นละครั้ง/.test(text) && !/oncePerTurn/.test(json)) add('missingClause', 'เทิร์นละครั้ง');
    if (/เซ่นไหว้/.test(text) && !/sacrifice|Sacrifice|เซ่น/.test(json)) add('missingClause', 'เซ่นไหว้');
    if (/End Phase/.test(text) && !/EndPhase|endPhase|TurnEnd|destroyAtEnd|oppNextEnd/.test(json)) add('missingClause', 'End Phase');
    if (/จนจบการต่อสู้/.test(text) && !/combat|Combat/.test(json)) add('missingClause', 'จนจบการต่อสู้');
    if (/สุ่ม/.test(text) && !/andom|rng|สุ่ม/.test(json)) add('missingClause', 'สุ่ม');
    if (/เนรเทศ/.test(text) && !/exile|dark|Exile|banish/.test(json)) add('missingClause', 'เนรเทศ');
    if (/ธรณีสูบ/.test(text) && !/mill|Mill/.test(json)) add('missingClause', 'ธรณีสูบ');
    if (/สอดแนม/.test(text) && !/scout|Scout|peek|reveal/.test(json)) add('missingClause', 'สอดแนม');
  }
  return out;
}

/* หนึ่งชื่อตรวจครั้งเดียว ใช้ข้อมูลรหัสใหม่สุดที่มีความสามารถ */
const byName = new Map();
cards.forEach(c => {
  const text = (c.effect || '').trim();
  if (!text || text === '—') return;
  const cur = byName.get(c.name);
  const e = effByCode[c.code];
  if (!cur || ((e && (e.abilities || []).length) && !(cur.e && (cur.e.abilities || []).length))) byName.set(c.name, { c, e });
});

const rows = [];
byName.forEach(({ c, e }) => {
  if (!includeVerified && e && e.parseStatus === 'verified') return;
  const set = c.code.split('-')[0];
  audit(c, e).forEach(f => rows.push({ set, code: c.code, name: c.name, check: f.check, detail: f.detail }));
});

const filtered = rows.filter(r => (!onlySet || r.set === onlySet) && (!onlyCheck || r.check === onlyCheck));
if (onlySet || onlyCheck) {
  filtered.forEach(r => console.log(`${r.code}\t${r.name}\t${r.check}\t${r.detail}`));
  console.log('รวม', filtered.length, 'รายการ', new Set(filtered.map(r => r.name)).size, 'ชื่อ');
} else {
  const count = key => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});
  console.log('ตรวจ', byName.size, 'ชื่อ · มีรายการ', new Set(rows.map(r => r.name)).size, 'ชื่อ ·', rows.length, 'รายการ');
  console.log('ต่อประเภท', JSON.stringify(count('check')));
  console.log('ต่อชุด', JSON.stringify(count('set')));
}
