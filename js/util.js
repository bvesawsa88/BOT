/* BoT — helpers ร่วมทุกหน้า (เมนู / โต๊ะ / deck builder / gallery) */
(function (root) {
  'use strict';
  const byId = id => document.getElementById(id);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const _once = Object.create(null);

  /** โหลด <script> ครั้งเดียว แล้ว cache promise */
  function loadScript(src) {
    if (_once[src]) return _once[src];
    _once[src] = new Promise((resolve, reject) => {
      const exist = document.querySelector('script[data-bot-src="' + src + '"]');
      if (exist) {
        if (exist.dataset.loaded === '1') return resolve();
        exist.addEventListener('load', () => resolve());
        exist.addEventListener('error', () => reject(new Error('script ' + src)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.botSrc = src;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('โหลดสคริปต์ไม่สำเร็จ: ' + src));
      document.head.appendChild(s);
    });
    return _once[src];
  }

  /** โหลด <link rel=stylesheet> ครั้งเดียว */
  function loadCss(href) {
    if (_once[href]) return _once[href];
    _once[href] = new Promise((resolve, reject) => {
      if (document.querySelector('link[data-bot-href="' + href + '"]')) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.dataset.botHref = href;
      l.onload = () => resolve();
      l.onerror = () => reject(new Error('โหลด CSS ไม่สำเร็จ: ' + href));
      document.head.appendChild(l);
    });
    return _once[href];
  }

  const V = '20260820asgard';
  function asset(path) {
    return path + (path.includes('?') ? '&' : '?') + 'v=' + V;
  }

  /* เทค / ซิมโบล — รูปทางการจาก bottcg (สีเดียวกับที่พิมพ์บนการ์ด) */
  const CDN_ASSETS = 'https://cdn.bangbon.app/assets/bottcg';
  const KW_FILE = {
    'จุติ': 'rebirth', 'คำสั่งเสีย': 'lastwill', 'เซ่นไหว้': 'worship',
    'สอดแนม': 'spy', 'ธรณีสูบ': 'earthquake', 'เลือกปฏิบัติ': 'discrimination',
    'สามัคคี': 'unity', 'โล่มนุษย์': 'humanshield', 'เตะไข่': 'kick',
    'เทิร์นละครั้ง': 'onceperturn', 'ต่อเนื่อง': 'continuous', 'สั่งใช้': 'command',
    'อัตโนมัติ': 'auto', 'พอดี': 'exact', 'ลูกฮึด': 'guts', 'แทงหลัง': 'backstab',
    'เนรเทศ': 'exile', 'คู่หู': 'link', 'Link': 'link', 'link': 'link'
  };
  const SYM_FILE = {
    'เทพ': 'deity', 'ยักษ์': 'giant', 'จอมเวทย์': 'wizard', 'คน': 'human',
    'แมลง': 'insect', 'สัตว์': 'animal', 'รัททาทุย': 'rattatuy', 'นรก': 'hell',
    'ผี': 'ghost', 'ปลา': 'fish', 'หุ่นยนต์': 'robot', 'สิ่งก่อสร้าง': 'construct',
    'ต่างชาติ': 'foreign', 'ต้นไม้': 'tree', 'เปรต': 'pret', 'ฤษี': 'rishi',
    'เอเลี่ยน': 'alien', 'กะปอม': 'kapom', 'สัตว์วิเศษ': 'beast', 'ทหาร': 'soldier',
    'ไซเบอร์': 'cyber', 'มังกร': 'dragon'
  };
  /* ชนิด Magic — ไฟล์อยู่ในโฟลเดอร์ symbol ชุดเดียวกับซิมโบล ({magic}/{react}/{mod}/{land}) */
  const MAGIC_FILE = { Normal: 'magic', React: 'react', Modification: 'mod', Land: 'land' };
  const MAGIC_TOKEN_FILE = { magic: 'magic', react: 'react', mod: 'mod', land: 'land' };
  const MAGIC_TOKEN_LABEL = { magic: 'Magic', react: 'React', mod: 'Modification', land: 'Land' };
  const KW_FILTER_ORDER = [
    'เตะไข่', 'แทงหลัง', 'ลูกฮึด', 'โล่มนุษย์', 'สามัคคี', 'ต่อเนื่อง', 'เทิร์นละครั้ง',
    'สั่งใช้', 'อัตโนมัติ', 'คำสั่งเสีย', 'จุติ', 'เซ่นไหว้', 'พอดี', 'ธรณีสูบ', 'เนรเทศ',
    'เลือกปฏิบัติ', 'สอดแนม', 'คู่หู'
  ];
  function kwHtml(name, extraClass) {
    const f = KW_FILE[name];
    if (!f) return esc(name);
    const cls = extraClass ? 'bot-kw ' + extraClass : 'bot-kw';
    return `<img class="${cls}" src="${CDN_ASSETS}/keywords/${f}.png" alt="${esc(name)}" title="${esc(name)}" draggable="false">`;
  }
  function symHtml(name, extraClass) {
    const f = SYM_FILE[name];
    if (!f) return esc(name);
    const cls = extraClass ? 'bot-sym ' + extraClass : 'bot-sym';
    return `<img class="${cls}" src="${CDN_ASSETS}/symbol/${f}.png" alt="${esc(name)}" title="${esc(name)}" draggable="false">`;
  }
  function magicHtml(subtype, extraClass) {
    const f = MAGIC_FILE[subtype];
    if (!f) return esc(subtype);
    const cls = extraClass ? 'bot-sym ' + extraClass : 'bot-sym';
    return `<img class="${cls}" src="${CDN_ASSETS}/symbol/${f}.png" alt="${esc(subtype)}" title="${esc(subtype)}" draggable="false">`;
  }
  function formatEffect(text) {
    const raw = String(text ?? '');
    if (!raw) return '';
    const kws = Object.keys(KW_FILE).sort((a, b) => b.length - a.length);
    const kwRe = kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp('\\{symbol\\s+([^}]+)\\}|\\{(magic|react|mod|land)\\}|(' + kwRe + ')', 'gi');
    let out = '', last = 0, m;
    while ((m = re.exec(raw))) {
      out += esc(raw.slice(last, m.index));
      if (m[1] != null) out += symHtml(m[1].trim());
      else if (m[2] != null) {
        const tok = m[2].toLowerCase();
        const label = MAGIC_TOKEN_LABEL[tok] || tok;
        const cls = 'bot-sym';
        out += `<img class="${cls}" src="${CDN_ASSETS}/symbol/${MAGIC_TOKEN_FILE[tok]}.png" alt="${esc(label)}" title="${esc(label)}" draggable="false">`;
      } else out += kwHtml(m[3]);
      last = m.index + m[0].length;
    }
    out += esc(raw.slice(last));
    return out;
  }
  function gemPrintColor(c) {
    const raw = (c && c.gemColor) || '';
    if (raw === 'ขาว' || raw === 'ใส' || raw === 'ไร้สี' || !raw) return 'ใส';
    return raw;
  }
  function cardMetaHtml(c) {
    if (!c) return '';
    const bits = [esc(c.code), esc(c.type + (c.subtype ? ' / ' + c.subtype : '')), esc(c.rarity || '')];
    bits.push(esc(c.color || 'ไร้สี'));
    if (c.symbol) bits.push(symHtml(c.symbol, 'meta'));
    if (c.cost !== '' && c.cost != null) bits.push('COST ' + esc(c.cost));
    if (c.power !== '' && c.power != null) bits.push('POWER ' + esc(c.power));
    if (c.gem !== '' && c.gem != null) {
      const gcol = gemPrintColor(c);
      if (gcol && gcol !== 'ใส') {
        bits.push('GEM ' + esc(gcol) + ' ' + esc(c.gem));
      } else {
        bits.push('GEM ' + esc(c.gem));
      }
    }
    return bits.filter(Boolean).join(' · ');
  }

  root.BotUtil = {
    byId, $, esc, loadScript, loadCss, asset, CACHE_V: V,
    kwHtml, symHtml, magicHtml, formatEffect, cardMetaHtml, gemPrintColor,
    KW_FILE, SYM_FILE, MAGIC_FILE, KW_FILTER_ORDER
  };
})(typeof self !== 'undefined' ? self : this);
