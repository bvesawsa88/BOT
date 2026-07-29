/* BoTEngine v3 — เอนจินสถานะโต๊ะ Battle of Talingchan (ใช้ร่วม client/server)
   เอฟเฟกต์อ่านจาก effects-*.json ผ่าน loadEffects([json,...]) — ต้องโหลดชุดเดียวกันทั้งสองฝั่ง
   ความสุ่มภายใน action (สับจาก effect) ใช้ seed ที่ติดมากับ action (a.seed) → deterministic
   trigger ที่รองรับ: summoned · activated · static · declareAttack · anyDeclareAttack ·
     enemyDeclareAttack (React) · avatarSummoned (React) · lifeRevealedByAttack · destroyed ·
     milled (ธรณีสูบ) · sentToHell · ownTurnEnd · turnStart · battlePhaseStart · selfDamaged · enemyActivateAbility · chooseMode
   op: modifyPower(choose/self/all/equippedAvatar, amountPer) · draw · mill · scout · deckPick ·
     hellPick · chooseDestroy · destroyTarget · destroyAttacker · destroyAllEnemyAvatars ·
     sacrifice(cost) · discard(cost) · counterSelf · untapHost · returnSelfToDeck ·
     revealOwnLife · unrevealOwnLife */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BoTEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const PER_PLAYER_ZONES = ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'];
  const Z_LABEL = { avatar: 'Avatar Zone', magic: 'Magic Zone', construct: 'Construct Zone', hell: 'นรก', dark: 'มิติมืด', hand: 'มือ', deck: 'เด็ค', life: 'LIFE' };
  const HAND_MIN = 3;

  let EFFECTS = {};
  let EFFECTS_BY_NAME = {};
  function rebuildNameIndex() {
    EFFECTS_BY_NAME = {};
    for (const code in EFFECTS) {
      const e = EFFECTS[code];
      if (!e || !e.name) continue;
      const cur = EFFECTS_BY_NAME[e.name];
      const nNew = (e.abilities || []).length;
      const nCur = cur ? (cur.abilities || []).length : -1;
      if (!cur || nNew > nCur) EFFECTS_BY_NAME[e.name] = e;
    }
  }
  function loadEffects(jsonOrList) {
    EFFECTS = {};
    (Array.isArray(jsonOrList) ? jsonOrList : [jsonOrList]).forEach(j =>
      ((j && j.cards) || []).forEach(c => { EFFECTS[c.code] = c; }));
    rebuildNameIndex();
  }
  // merge คีย์จาก DB แบบปลอดภัย: abilities ทับเฉพาะเมื่อมี · keywords แนบเสมอ (ไม่ล้าง ability JSON)
  function mergeEffects(cards) {
    (cards || []).forEach(c => {
      const e = EFFECTS[c.code] || (EFFECTS[c.code] = { code: c.code, abilities: [] });
      if (c.abilities && c.abilities.length) e.abilities = c.abilities;
      if (c.keywords) e.keywords = c.keywords;
      if (c.name && !e.name) e.name = c.name;
    });
    rebuildNameIndex();
  }
  /* reprint (เช่น CC02 ขวานทอง): ถ้าโค้ดนี้ยังไม่มี abilities ให้ใช้ใบชื่อเดียวกันที่มีนิยาม */
  function resolveEffect(code, nameHint) {
    const e = EFFECTS[code];
    if (e && e.abilities && e.abilities.length) return e;
    const nm = nameHint || (e && e.name);
    if (nm && EFFECTS_BY_NAME[nm] && (EFFECTS_BY_NAME[nm].abilities || []).length)
      return EFFECTS_BY_NAME[nm];
    return e || null;
  }
  const keywordsOf = (code) => {
    const e = resolveEffect(code);
    return (e && e.keywords) || (EFFECTS[code] && EFFECTS[code].keywords) || [];
  };
  function nameMatches(c, needle) {
    if (!c || !needle) return false;
    if ((c.name || '').includes(needle)) return true;
    const e = resolveEffect(c.code, c.name);
    return !!(e && e.nameAliases && e.nameAliases.some(a => (a || '').includes(needle) || (needle || '').includes(a)));
  }
  /* คู่หู / Link — แยกชื่อพันธมิตรจากข้อความการ์ด */
  const normBuddyName = s => (s || '').replace(/[่-๋]/g, '').replace(/ี/g, 'ิ').replace(/ื/g, 'ึ').replace(/ู/g, 'ุ').replace(/["“”']/g, '').replace(/\s+/g, '').toLowerCase();
  function buddyPartnerNameOf(c) {
    const e = (c && c.effect) || '';
    let m = e.match(/\[\s*(?:Link|คู่หู)\s*[-–—]?\s*([^\]\n]+?)\s*\]/);
    if (m) return m[1].trim().replace(/^["“”]|["“”]$/g, '');
    m = e.match(/(?:^|\n)\s*คู่หู\s*[-–—]\s*["“”]?([^"“”\n\[]+)["“”]?/);
    return m ? m[1].trim() : null;
  }
  function cardHasBuddyAbility(c) {
    if (!c) return false;
    const e = c.effect || '';
    return /\[\s*(?:Link|คู่หู)\b/.test(e) || /(?:^|\n)\s*คู่หู\s*[-–—]/.test(e);
  }
  function buddyNamesMatch(a, b) {
    const na = normBuddyName(a), nb = normBuddyName(b);
    return !!(na && nb && (na.includes(nb) || nb.includes(na)));
  }
  /* จับคู่ได้เมื่อใบต้นมีคู่หู/Link และใบเป้าตรงชื่อคู่ (หรือใบเป้าชี้กลับมาที่ใบต้น) */
  function buddyPairAllowed(c1, c2) {
    if (!c1 || !c2) return false;
    if (!cardHasBuddyAbility(c1) && !cardHasBuddyAbility(c2)) return false;
    const p1 = buddyPartnerNameOf(c1);
    const p2 = buddyPartnerNameOf(c2);
    if (p1 && buddyNamesMatch(p1, c2.name)) return true;
    if (p2 && buddyNamesMatch(p2, c1.name)) return true;
    return false;
  }

  // มี keyword บนตัวการ์ด หรือบน Modification ที่สวมอยู่ (เช่น รั้วของชาติ ให้โล่มนุษย์)
  const hasKw = (st, k, kw) => {
    const c = st.inst[k]; if (!c) return false;
    if (keywordsOf(c.code).includes(kw)) return true;
    if ((c.grantedKeywords || []).some(g => g.kw === kw)) return true;
    for (const id in st.inst) {
      if (st.inst[id].attachedTo === k && keywordsOf(st.inst[id].code).includes(kw)) return true;
      // fallback: ใบสวมระบุในข้อความว่าให้ keyword นี้ (เช่น รั้วของชาติ → โล่มนุษย์)
      if (st.inst[id].attachedTo === k && st.inst[id].subtype === 'Modification') {
        const txt = st.inst[id].effect || '';
        if (kw === 'โล่มนุษย์' && /ได้รับความสามารถ\s*โล่มนุษย์|ได้รับ\s*โล่มนุษย์/.test(txt)) return true;
        if (kw === 'ลูกฮึด' && /ได้รับ\s*ลูกฮึด|ได้รับความสามารถ\s*ลูกฮึด/.test(txt)) return true;
        if (kw === 'สามัคคี' && /ได้รับ\s*สามัคคี|ได้รับความสามารถ\s*สามัคคี/.test(txt)) return true;
        if (kw === 'เตะไข่' && /ได้รับ\s*เตะไข่|ได้รับความสามารถ\s*เตะไข่/.test(txt)) return true;
      }
    }
    const e = EFFECTS[c.code];
    if (e && e.grantKeywordIfAllyNameIncludes && e.grantKeywordIfAllyNameIncludes.keyword === kw) {
      const z = zoneOf(st, k) || '';
      if (z.endsWith('.avatar')) {
        const side = z[0];
        if ((st.zones[side + '.avatar'] || []).some(id => id !== k && nameMatches(st.inst[id], e.grantKeywordIfAllyNameIncludes.nameIncludes)))
          return true;
      }
    }
    // aura จากพันธมิตรบนสนาม (เช่น ผู้เจริญ นาย ให้สามัคคี)
    {
      const z = zoneOf(st, k) || '';
      if (z.endsWith('.avatar')) {
        const side = z[0];
        for (const id of (st.zones[side + '.avatar'] || [])) {
          if (id === k) continue;
          const ae = EFFECTS[(st.inst[id] || {}).code];
          if (!ae || !ae.grantKeywordAura || ae.grantKeywordAura.keyword !== kw) continue;
          const g = ae.grantKeywordAura;
          if (g.side === 'own' || !g.side) {
            if (g.symbols && !g.symbols.some(sy => cardSymbols(st, k).includes(sy))) continue;
            return true;
          }
        }
      }
    }
    return false;
  };
  // สาหัส: มี LIFE และหงายหมด (ตรงกับตัวบ่งชี้ในหน้าเกม)
  const inCritical = (st, side) => { const l = st.zones[side + '.life'] || []; return l.length > 0 && l.every(k => st.inst[k] && st.inst[k].faceUp); };
  // ★ เปิดระบบ effect อัตโนมัติ — ความสามารถที่ verified/auto จะทำงานอัตโนมัติ
  const abilitiesOf = (code, on) => {
    const e = resolveEffect(code);
    return ((e && e.abilities) || []).filter(ab => ab.trigger && ab.trigger.on === on);
  };
  const abilitiesOf_AUTO = (code, on) => abilitiesOf(code, on);
  // ความสามารถของการ์ด k ตาม trigger on — รวม "ความสามารถที่สืบทอดมา" (Inheritance Chain: inst[k].granted)
  // ความสามารถของการ์ด k ตาม trigger on (รวม granted)
  function abil(st, k, on) {
    const c = st.inst[k]; if (!c) return [];
    // ขวานเงิน: ความสามารถของโฮสต์ไร้ผลขณะสวมอยู่ (จุติที่ทำงานไปแล้วไม่นับ)
    if (abilitiesNullified(st, k)) return [];
    const e = resolveEffect(c.code, c.name);
    const base = ((e && e.abilities) || []).filter(ab => ab.trigger && ab.trigger.on === on);
    const g = (c.granted || []).filter(ab => ab.trigger && ab.trigger.on === on);
    return g.length ? base.concat(g) : base;
  }

  /* PRNG แบบ seed (mulberry32) — ให้ client/server สุ่มได้ผลเดียวกันจาก a.seed */
  function mulberry32(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  }

  function zLabel(z) { return z === 'land' ? 'Land Magic' : (Z_LABEL[(z || '').split('.')[1]] || z); }
  function zoneOf(st, k) { for (const z in st.zones) if (st.zones[z].includes(k)) return z; return null; }
  function ownerOf(st, k) { const z = zoneOf(st, k); return !z || z === 'land' ? 'S' : z[0]; }
  /* สวมใส่การ์ดให้โฮสต์: ให้การ์ดอยู่ใน Magic Zone ฝั่งโฮสต์ (เห็นบนจอ + ลากเส้น)
     — ถ้าอยู่ Magic Zone อยู่แล้วแค่ผูกสาย · ถ้ามาจากเด็ค/นรก/Avatar Zone ให้ย้ายเข้า Magic Zone */
  function equipOnto(st, modK, hostK) {
    const mod = st.inst[modK], host = st.inst[hostK];
    if (!mod || !host) return false;
    let hostOwn = ownerOf(st, hostK);
    if (hostOwn !== 'A' && hostOwn !== 'B') {
      // fallback: โฮสต์อยู่นอกโซน (ไม่น่าเกิด) — ใช้เจ้าของการ์ดสวมถ้ามี
      const mz0 = zoneOf(st, modK);
      hostOwn = (mz0 && (mz0[0] === 'A' || mz0[0] === 'B')) ? mz0[0] : null;
      if (!hostOwn) return false;
    }
    const from = zoneOf(st, modK);
    const magicZ = hostOwn + '.magic';
    if (from !== magicZ) {
      if (from) st.zones[from] = st.zones[from].filter(x => x !== modK);
      if (!st.zones[magicZ].includes(modK)) st.zones[magicZ].push(modK);
    }
    mod.attachedTo = hostK;
    mod.faceUp = true;
    return true;
  }
  function other(p) { return p === 'A' ? 'B' : 'A'; }
  function addLog(st, p, t) { st.log.push({ p, t }); if (st.log.length > 200) st.log = st.log.slice(-200); }
  function nameOf(st, k) { return st.inst[k] ? st.inst[k].name : '?'; }

  function revealOwnLife(st, side, count) {
    const arr = st.zones[side + '.life'] || [];
    let done = 0;
    for (let i = arr.length - 1; i >= 0 && done < count; i--) {
      if (!st.inst[arr[i]].faceUp) { st.inst[arr[i]].faceUp = true; done++; addLog(st, 'S', `เอฟเฟกต์: หงาย LIFE "${nameOf(st, arr[i])}" ของ ${side}`); }
    }
  }
  function unrevealOwnLife(st, side, count) {
    if ((st.zones['land'] || []).some(id => EFFECTS[(st.inst[id] || {}).code] && EFFECTS[(st.inst[id] || {}).code].blockLifeUnreveal)) {
      addLog(st, 'S', 'โรงบาลรัฐ: LIFE ไม่สามารถคว่ำกลับได้ — ฮีลไม่เกิดผล');
      return;
    }
    const arr = st.zones[side + '.life'] || [];
    let done = 0;
    for (let i = arr.length - 1; i >= 0 && done < count; i--) {
      if (st.inst[arr[i]].faceUp) { st.inst[arr[i]].faceUp = false; done++; addLog(st, 'S', `เอฟเฟกต์: คว่ำ LIFE กลับ 1 ใบของ ${side}`); }
    }
  }

  function notePowerBuff(st, k, amt) {
    if (!st.inst[k] || !(amt > 0)) return;
    st.inst[k].powerBuffCount = (st.inst[k].powerBuffCount || 0) + 1;
  }

  function controlImmuneBlock(st, targetK, srcK) {
    const e = EFFECTS[(st.inst[targetK] || {}).code];
    if (!e || !e.controlImmuneExcept) return null;
    const src = st.inst[srcK];
    if (src && nameMatches(src, e.controlImmuneExcept)) return null;
    return `"${nameOf(st, targetK)}" ไม่ถูกเปลี่ยนการควบคุม (ยกเว้น ${e.controlImmuneExcept})`;
  }

  function fireSentToHell(st, fx, k, side) {
    abilitiesOf((st.inst[k] || {}).code, 'sentToHell').forEach(ab => (ab.actions || []).forEach(ac => {
      if (ac.op === 'revealOwnLife') revealOwnLife(st, side, ac.count || 1);
    }));
  }

  function doMove(st, k, to, pos, fx) {
    const from = zoneOf(st, k); if (!from || !st.zones[to]) return;
    st.zones[from] = st.zones[from].filter(x => x !== k);
    if (pos === 'bottom') st.zones[to].unshift(k); else st.zones[to].push(k);
    if (/\.(hand|hell|dark|deck)$/.test(to)) {
      st.inst[k].tapped = false; st.inst[k].counters = 0;
      delete st.inst[k].costDelta; delete st.inst[k].powerDelta; delete st.inst[k].powerDeltaFrom;
      delete st.inst[k].cannotAttack; delete st.inst[k].curse;
      delete st.inst[k].grantedKeywords; delete st.inst[k].draculaRevive;
      if (st.buffs) st.buffs = st.buffs.filter(b => b.k !== k);
      // ใบสวมใส่: ตัดสาย + ย้ายลงนรกเจ้าของโฮสต์จริงๆ (ห้ามค้างใน Magic Zone)
      const hostOwner = (from[0] === 'A' || from[0] === 'B') ? from[0] : 'A';
      const hellZ = hostOwner + '.hell';
      Object.keys(st.inst).forEach(id => {
        const m = st.inst[id];
        if (!m || m.attachedTo !== k) return;
        m.attachedTo = null;
        const modZ = zoneOf(st, id);
        if (modZ) st.zones[modZ] = st.zones[modZ].filter(x => x !== id);
        if (!st.zones[hellZ].includes(id)) st.zones[hellZ].push(id);
        addLog(st, 'S', `${m.name} (สวมใส่) ตกนรกตาม ${st.inst[k].name}`);
        fireSentToHell(st, fx || {}, id, hostOwner);
      });
    }
    if (to.endsWith('.hand')) st.inst[k].faceUp = true;
    if (from.endsWith('.hand')) delete st.inst[k].revealed; // ออกจากมือแล้ว = เลิกสถานะ "เปิดให้ดู"
    if (to.endsWith('.hell') && from[1] === '.'[0]) { /* noop */ }
    if (to.endsWith('.hell')) fireSentToHell(st, fx || {}, k, from === 'land' ? to[0] : from[0]);
    // Token: ออกจาก Avatar Zone → ย้ายไป Zone ปลายทางก่อน (trigger ทำงาน) แล้วนำออกจากเกม (ไม่ใช่นรก/มิติมืด)
    if (st.inst[k] && st.inst[k].isToken && !to.endsWith('.avatar')) {
      st.zones[to] = st.zones[to].filter(x => x !== k);
      addLog(st, 'S', `Token "${st.inst[k].name}" ออกจาก Avatar Zone → นำออกจากเกม`);
      delete st.inst[k];
    }
  }

  /* สร้าง Token (ตัวแทน Avatar) — อยู่บน Avatar Zone · ออกจากโซนเมื่อไหร่ = นำออกจากเกม */
  function mkToken(st, owner, spec) {
    const id = 'tk' + (++st._tokSeq);
    st.inst[id] = {
      id, code: spec.code || 'TOKEN', name: spec.name || 'Token', type: 'Avatar', subtype: '',
      symbol: spec.symbol || '', color: spec.color || '', gemColor: '', cost: 0, gem: 0,
      power: spec.power || 0, effect: spec.effect || 'Token', img: '', faceUp: true, tapped: false,
      counters: 0, attachedTo: null, isToken: true,
    };
    return id;
  }

  /* ทำลายการ์ด (ลงนรกเจ้าของ) + trigger คำสั่งเสีย
     opts.ignoreProtect = true → ข้ามกันทำลาย (เช่น ฉุบสั่งตาย)
     ประกันชั้นต่ำ: ทำลายใบสวมแทนโฮสต์
     protectUntilEndTurn: กันทำลายจนจบเทิร์น (วันชัย) */
  function abilitiesNullified(st, k) {
    const c = st.inst[k];
    if (c && c.nullifyUntilEOT) return true;
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== k) continue;
      const e = EFFECTS[m.code];
      if (e && e.nullifyHost) return true;
    }
    return false;
  }
  function isPrime(n) {
    n = Math.abs(+n || 0);
    if (n < 2) return false;
    if (n % 2 === 0) return n === 2;
    for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
    return true;
  }
  function hasAttachedNameIncludes(st, hostK, needle) {
    for (const id in st.inst) {
      const m = st.inst[id];
      if (m && m.attachedTo === hostK && nameMatches(m, needle)) return true;
    }
    return false;
  }
  /* พิภพรัททาทุยหลุด / เงื่อนไขพัง → ตัด Avatar เกินเพดาน */
  function enforceAvatarCap(st, fx, side) {
    const zone = st.zones[side + '.avatar'] || [];
    const real = zone.filter(k => st.inst[k] && st.inst[k].type === 'Avatar' && !st.inst[k].isToken);
    const pipop = [...(st.zones['land'] || [])].some(k => {
      const m = st.inst[k]; return m && m.faceUp && /พิภพรัททาทุย/.test(m.name || '');
    });
    const allRat = real.length > 0 && real.every(k => (st.inst[k].symbol || '') === 'รัททาทุย');
    const hardCap = (pipop && allRat) ? 6 : 4;
    if (real.length <= hardCap) return;
    const excess = real.length - hardCap;
    addLog(st, side, `พิภพ/เพดาน Avatar: มี ${real.length} ใบ เกินเพดาน ${hardCap} — เลือกส่งลงนรก ${excess} ใบ`);
    st.prompts.unshift({
      kind: 'pick', from: 'ownAvatars', src: null, chooser: side,
      dest: 'cullAvatar', optional: false, cullLeft: excess
    });
  }
  /* ทรายดูด: Avatar POWER 0 ถูกทำลาย */
  function sandTrapActive(st) {
    return (st.zones['land'] || []).some(id => {
      const e = EFFECTS[(st.inst[id] || {}).code];
      return e && e.destroyPowerZero && st.inst[id] && st.inst[id].faceUp;
    });
  }
  function sweepDestroyPowerZero(st, fx) {
    if (!sandTrapActive(st)) return;
    ['A', 'B'].forEach(side => {
      (st.zones[side + '.avatar'] || []).slice().forEach(id => {
        if (!st.inst[id]) return;
        if (effPower(st, id) === 0) {
          addLog(st, 'S', `ทรายดูด: ${nameOf(st, id)} (P0) ถูกทำลาย`);
          destroyCard(st, fx, id);
        }
      });
    });
  }
  function hellSummonBlocked(st) {
    for (const side of ['A', 'B']) {
      for (const id of (st.zones[side + '.avatar'] || [])) {
        const e = EFFECTS[(st.inst[id] || {}).code];
        if (e && e.blockHellSummon && st.inst[id] && st.inst[id].faceUp) return st.inst[id].name;
      }
    }
    return null;
  }
  /* ไพรมอล ฯลฯ: จะออกจาก Avatar Zone → เลือกเนรเทศจากนรกเพื่อรอด (เทิร์นละครั้ง)
     resume = { type:'destroy', opts } | { type:'move', to, pos, who }
     คืน true ถ้าค้างถาม (ยังไม่ออกสนาม) */
  function offerPreventLeave(st, fx, k, resume) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k); if (!z || !z.endsWith('.avatar')) return false;
    const ePrev = EFFECTS[c.code];
    if (!ePrev || !ePrev.preventLeaveExileHell) return false;
    const cfg = ePrev.preventLeaveExileHell;
    const sideP = z[0];
    const need = cfg.count || 5;
    const hellOk = (st.zones[sideP + '.hell'] || []).filter(id => matchFilterEx(st, id, cfg.filter || {}));
    const askKey = k + ':preventLeave:' + st.turn;
    st._preventLeaveAsk = st._preventLeaveAsk || {};
    if (st._preventLeaveAsk[askKey]) return false;
    if (st.prompts.some(p => (p.kind === 'preventLeaveExile' || p.dest === 'preventLeavePick') && (p.k === k || p.stayK === k))) return false;
    if (hellOk.length < need) {
      addLog(st, 'S', `เอฟเฟกต์ ${c.name}: จะออกจากสนาม — รัททาทุยในนรกไม่พอ (${hellOk.length}/${need}) ใช้กันออกไม่ได้`);
      return false;
    }
    st._preventLeaveAsk[askKey] = true; // จอง once/turn แม้ข้าม
    // เปิดเลือกเนรเทศทันที (ข้าม = ไม่ใช้ แล้วออกสนาม)
    st.prompts.push({
      kind: 'pick', from: 'hell', src: k, chooser: sideP,
      filter: cfg.filter || {}, dest: 'preventLeavePick', optional: true,
      need, got: 0, stayK: k
    });
    st._preventLeavePending = Object.assign({ k }, resume || { type: 'destroy', opts: { ignorePreventLeave: true } });
    addLog(st, sideP, `เอฟเฟกต์ ${c.name}: จะออกจากสนาม — เลือกเนรเทศรัททาทุยจากนรก ${need} ใบเพื่อรอด (หรือข้ามเพื่อออกสนาม)`);
    return true;
  }
  function resumePreventLeaveFail(st, fx) {
    const pend = st._preventLeavePending;
    delete st._preventLeavePending;
    if (!pend || !pend.k || !st.inst[pend.k]) return;
    if (pend.type === 'move' && pend.to) {
      const c = st.inst[pend.k];
      const from = zoneOf(st, pend.k);
      if (!from || !st.zones[pend.to]) return;
      doMove(st, pend.k, pend.to, pend.pos, fx);
      const who = pend.who || (pend.to === 'land' ? 'S' : pend.to[0]);
      addLog(st, who, `${c.name}: ${zLabel(from)} → ${zLabel(pend.to)}${pend.pos === 'bottom' ? ' (ล่างสุด)' : ''}`);
      fx.snd = 'place';
      return;
    }
    destroyCard(st, fx, pend.k, (pend.opts && Object.assign({}, pend.opts, { ignorePreventLeave: true })) || { ignorePreventLeave: true });
  }

  function destroyCard(st, fx, k, opts) {
    opts = opts || {};
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k); if (!z) return false;
    // ริกกี้: ไม่รับผล Magic ที่เล็งตัวนี้ (เวทสั่งผู้เล่นยังได้)
    if (opts.fromOppMagic) {
      const eImm = EFFECTS[c.code];
      if (eImm && eImm.immuneOppMagicTarget) {
        addLog(st, 'S', `${c.name} ไม่รับผลจาก Magic ฝ่ายตรงข้าม (เล็งตัวนี้)`);
        return false;
      }
    }
    if (!opts.ignoreProtect) {
      // ไพรมอล: จะออกจากสนาม → เนรเทศรัททาทุยในนรก 5 ใบ (เลือกเอง ชื่อซ้ำได้) เทิร์นละครั้ง
      if (!opts.ignorePreventLeave && offerPreventLeave(st, fx, k, { type: 'destroy', opts: Object.assign({}, opts, { ignorePreventLeave: true }) }))
        return false;
      // น้องส้ม: กันออกจากสนามด้วย Magic จนจบเทิร์นถัดไปของศัตรู
      if (opts.fromOppMagic || opts.fromMagic) {
        if (c.protectMagicLeave) {
          addLog(st, 'S', `${c.name} ไม่ถูกนำออกจากสนามด้วย Magic (น้องส้ม)`);
          return false;
        }
      }
      // ไบโพล่า ชิลด์: จะออกจากสนามโดยการ์ดศัตรู → ทอยคู่แล้วรอด (ไม่กันต่อสู้)
      if (opts.fromOppCard && !opts.fromCombat) {
        for (const id in st.inst) {
          const m = st.inst[id];
          if (!m || m.attachedTo !== k) continue;
          const me = EFFECTS[m.code];
          if (!me || !me.protectLeaveDiceEven) continue;
          st._shieldDice = st._shieldDice || {};
          const key = id + ':' + (st.turn || 0);
          if (st._shieldDice[key]) continue;
          st._shieldDice[key] = true;
          const roll = 1 + Math.floor(((fx && fx._rng) ? fx._rng() : Math.random()) * 6);
          addLog(st, 'S', `🎲 ${m.name}: ทอยได้ ${roll} (${roll % 2 === 0 ? 'คู่ — รอด!' : 'คี่ — ไม่รอด'})`);
          if (roll % 2 === 0) {
            addLog(st, 'S', `🛡️ ${m.name}: ${c.name} ไม่ถูกนำออกจากสนาม`);
            return false;
          }
        }
      }
      if (c.protectUntilEndTurn) {
        addLog(st, 'S', `${c.name} ถูกป้องกันการทำลายจนจบเทิร์น`);
        return false;
      }
      // พระนารายณ์ เทพผู้พิทักษ์: POWER ตั้งต้นลดครึ่งแทนทำลาย (ครั้งเดียวต่อการอัญเชิญ)
      {
        const e = EFFECTS[c.code];
        if (e && e.halvePrintedInsteadDestroy && !c._halvedPrintedOnce) {
          const before = +c.power || 0;
          c.power = Math.floor(before / 2);
          c._halvedPrintedOnce = true;
          addLog(st, 'S', `เอฟเฟกต์ ${c.name}: POWER ตั้งต้น ${before} → ${c.power} แทนการถูกทำลาย`);
          return false;
        }
      }
      // บัลเดอร์: ธรณีสูบ 9 แทนการทำลาย (บังคับ เทิร์นละครั้ง)
      {
        const e = EFFECTS[c.code];
        if (e && e.millInsteadDestroy && !opts.fromCombatImmuneSkip) {
          const sideB = z[0];
          st._millInstead = st._millInstead || {};
          const key = sideB + ':' + st.turn;
          if (!st._millInstead[k + key]) {
            st._millInstead[k + key] = true;
            addLog(st, 'S', `เอฟเฟกต์ ${c.name}: ธรณีสูบ ${e.millInsteadDestroy} ใบแทนการทำลาย`);
            mill(st, fx, sideB, e.millInsteadDestroy, (fx && fx._rng) || (() => 0.5), 0);
            return false;
          }
        }
      }
      // รัททาทุย 2 หัว: สั่งใช้ P−1 กันทำลายจากการต่อสู้ (เทิร์นละครั้ง)
      if (opts.fromCombat && !opts.ignoreSurvive) {
        const e = EFFECTS[c.code];
        if (e && e.combatSurvivePowerMinus) {
          const sideB = z[0];
          st._surviveAsk = st._surviveAsk || {};
          const askKey = k + ':' + st.turn;
          if (!st._surviveAsk[askKey] && !st.prompts.some(p => p.kind === 'combatSurvive' && p.k === k)) {
            st.prompts.push({ kind: 'combatSurvive', k, chooser: sideB, amt: e.combatSurvivePowerMinus, optional: true });
            st._survivePending = { k, opts: Object.assign({}, opts, { ignoreSurvive: true }) };
            addLog(st, sideB, `เอฟเฟกต์ ${c.name}: จะถูกทำลายจากการต่อสู้ — สั่งใช้ POWER ${e.combatSurvivePowerMinus} เพื่อรอดไหม?`);
            return false;
          }
        }
      }
      // ประกันชั้นต่ำ / โอตะ: ทำลายใบสวมแทนโฮสต์
      for (const id in st.inst) {
        const m = st.inst[id];
        if (!m || m.attachedTo !== k) continue;
        const e = EFFECTS[m.code];
        if (!e || !e.protectReplace) continue;
        if (e.protectReplaceIfHostNameIncludes && !(c.name || '').includes(e.protectReplaceIfHostNameIncludes)) continue;
        addLog(st, 'S', `🛡️ ${m.name}: ทำลายใบสวมแทน ${c.name}`);
        m.attachedTo = null;
        destroyCard(st, fx, id, { ignoreProtect: true });
        return false;
      }
      // ผู้โดยสาร Super Air: สั่งใช้ทำลายแทนเครื่องบิน (ถามก่อน)
      if (!opts.ignorePassengerReplace) {
        const sidePx = z === 'land' ? null : z[0];
        if (sidePx && nameMatches(c, 'เครื่องบิน Super Air')) {
          const pass = (st.zones[sidePx + '.avatar'] || []).find(id => {
            const pe = EFFECTS[(st.inst[id] || {}).code];
            return pe && pe.protectReplaceForNameIncludes && nameMatches(c, pe.protectReplaceForNameIncludes);
          });
          if (pass && st.inst[pass] && !st.prompts.some(p => p.kind === 'passengerReplace' && p.plane === k)) {
            st.prompts.push({ kind: 'passengerReplace', plane: k, pass, chooser: sidePx, optional: true });
            st._passengerPending = { k, opts: Object.assign({}, opts, { ignorePassengerReplace: true }) };
            addLog(st, sidePx, `เอฟเฟกต์ ${nameOf(st, pass)}: ${c.name} จะถูกทำลาย — ทำลายผู้โดยสารแทนไหม?`);
            return false;
          }
        }
      }
      // แอร์ซิด: Avatar อื่นบนสนามฝ่ายเดียวกัน กันทำลายแทน
      const side0 = z === 'land' ? null : z[0];
      if (side0) {
        for (const id of (st.zones[side0 + '.avatar'] || []).slice()) {
          if (id === k) continue;
          const e = EFFECTS[(st.inst[id] || {}).code];
          if (!e || !e.protectReplaceForNameIncludes) continue;
          if (!nameMatches(c, e.protectReplaceForNameIncludes) && !(c.name || '').includes(e.protectReplaceForNameIncludes)) continue;
          addLog(st, 'S', `🛡️ ${nameOf(st, id)}: ทำลายตัวเองแทน ${c.name}`);
          destroyCard(st, fx, id, { ignoreProtect: true });
          return false;
        }
      }
    }
    // ตรวจ nullify ก่อนย้าย (doMove จะถอดใบสวมออก)
    const wasNullified = abilitiesNullified(st, k);
    // Land กลางสนาม: ส่งลงนรกตาม controller (คนที่วาง) — ไม่มีก็ fallback A
    const side = z === 'land'
      ? ((c.controller === 'A' || c.controller === 'B') ? c.controller : 'A')
      : z[0];
    const hadDraculaRevive = !!c.draculaRevive;
    const wasAvatar = z.endsWith('.avatar');
    const destroyedSymbol = c.symbol;
    const destroyedSyms = wasAvatar ? cardSymbols(st, k) : [];
    const destroyedName = c.name;
    // เคลียร์คำสาปที่ชี้มาที่ใบนี้
    if (c.curse) delete c.curse;
    doMove(st, k, side + '.hell', null, fx);
    // แดรกคูลา: จุติแล้วถูกทำลาย → เทิร์นหน้าอัญเชิญอัตโนมัติ
    if (hadDraculaRevive) {
      st.scheduled.push({ player: side, op: 'reviveFromHell', k, when: 'nextOwnTurn' });
      addLog(st, 'S', `เอฟเฟกต์ ${c.name}: จะอัญเชิญกลับจากนรกอัตโนมัติในเทิร์นหน้าของ ${side}`);
    }
    if (!wasNullified) {
      abil(st, k, 'destroyed').forEach(ab => {
        runActions(st, fx, ab.actions || [], { src: k, owner: side, toHellAfter: false, rng: (fx && fx._rng) || (() => 0.5) });
      });
    }
    // บ่อหมัก / รัททาท่วม: เมื่อ Avatar ฝ่ายเราถูกทำลาย
    if (wasAvatar) {
      const reactDestroyOpts = [];
      const fireOwnDestroyed = (srcK) => {
        abil(st, srcK, 'ownAvatarDestroyed').forEach(ab => {
          const cond = (ab.trigger && ab.trigger.if) || '';
          const mSym = cond.match(/^symbol:(.+)$/);
          if (mSym && !destroyedSyms.includes(mSym[1]) && destroyedSymbol !== mSym[1]) return;
          if (ab.oncePerTurn && !claimOncePerTurn(st, srcK, 'ownAvatarDestroyed')) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, srcK)}: ใช้ไปแล้วในเทิร์นนี้ (เมื่อ Avatar ถูกทำลาย)`);
            return;
          }
          // React จากมือ หรือที่วาง Magic Zone — รวบรวมให้เลือกใบ
          const sc = st.inst[srcK];
          const sz = zoneOf(st, srcK) || '';
          if (sc && sc.type === 'Magic' && sc.subtype === 'React' && (sz.endsWith('.hand') || sz.endsWith('.magic'))) {
            if (isMagicTypeUsed(st, side, 'React')) {
              addLog(st, 'S', `React "${nameOf(st, srcK)}": ใช้เวทประเภท React ไปแล้วในเทิร์นนี้ — ข้าม`);
              return;
            }
            reactDestroyOpts.push({ k: srcK, ab });
            return;
          }
          runActions(st, fx, ab.actions || [], { src: srcK, owner: side, triggerSource: k, rng: (fx && fx._rng) || (() => 0.5) });
        });
      };
      (st.zones[side + '.construct'] || []).slice().forEach(fireOwnDestroyed);
      (st.zones[side + '.avatar'] || []).slice().forEach(fireOwnDestroyed);
      (st.zones[side + '.hand'] || []).slice().forEach(fireOwnDestroyed);
      (st.zones[side + '.magic'] || []).slice().forEach(fireOwnDestroyed);
      if (reactDestroyOpts.length) {
        const options = [];
        reactDestroyOpts.forEach(o => { if (!options.includes(o.k)) options.push(o.k); });
        const rab = reactDestroyOpts[0].ab;
        st.prompts.push({
          kind: 'react', mode: 'runActions', src: null, options, chooser: side, target: k,
          actions: (rab && rab.actions) || [], reactTrigger: 'ownAvatarDestroyed',
          label: `${destroyedName} ถูกทำลาย`
        });
        addLog(st, side, `React พร้อมใช้ (${options.length} ใบ): ${destroyedName} ถูกทำลาย — เลือกใบหรือไม่ใช้`);
      }
    }
    // React: เอาไปอยู่ด้วย — Avatar ถูกทำลายโดยฝ่ายตรงข้าม
    if (wasAvatar && opts.byOpp) {
      const options = collectReactOptions(st, side, 'ownAvatarDestroyedByOpp', (m, mc) => {
        return abilitiesOf(mc.code, 'ownAvatarDestroyedByOpp').some(ab => {
          const cond = (ab.trigger && ab.trigger.if) || '';
          const mSym = cond.match(/^symbol:(.+)$/);
          if (mSym && !destroyedSyms.includes(mSym[1]) && destroyedSymbol !== mSym[1]) return false;
          return true;
        });
      });
      if (options.length) {
        const rab = abilitiesOf(st.inst[options[0]].code, 'ownAvatarDestroyedByOpp')[0];
        st.prompts.push({
          kind: 'react', mode: 'runActions', src: null, options, chooser: side, target: k,
          actions: (rab && rab.actions) || [], reactTrigger: 'ownAvatarDestroyedByOpp',
          label: `${destroyedName} ถูกทำลายโดยฝ่ายตรงข้าม`
        });
        addLog(st, side, `React พร้อมใช้ (${options.length} ใบ): ${destroyedName} ถูกทำลายโดยฝ่ายตรงข้าม — เลือกใบหรือไม่ใช้`);
      }
    }
    if (z === 'land') ['A', 'B'].forEach(s => enforceAvatarCap(st, fx, s));
    syncHeimdall(st);
    return true;
  }

  /* ฮามดัล: หงายใบบนสุดเด็คทั้งสองฝ่ายขณะอยู่บนสนาม */
  function syncHeimdall(st) {
    const active = ['A', 'B'].some(p => (st.zones[p + '.avatar'] || []).some(k => {
      const e = EFFECTS[(st.inst[k] || {}).code];
      return e && e.revealDeckTops;
    }));
    ['A', 'B'].forEach(p => {
      const d = st.zones[p + '.deck'] || [];
      if (!d.length) return;
      const top = d[d.length - 1];
      if (active) {
        st.inst[top].faceUp = true;
        st.inst[top]._heimdallReveal = true;
      } else if (st.inst[top]._heimdallReveal) {
        st.inst[top].faceUp = false;
        delete st.inst[top]._heimdallReveal;
      }
      // ใบที่ไม่ใช่บนสุดที่เคยถูกหงายด้วยฮามดัล → คว่ำกลับ
      d.slice(0, -1).forEach(k => {
        if (st.inst[k] && st.inst[k]._heimdallReveal) {
          st.inst[k].faceUp = false;
          delete st.inst[k]._heimdallReveal;
        }
      });
    });
  }

  /* จบ hellPickMulti: สับเด็ค จั่ว บัฟตามจำนวนที่คืน */
  function finishHellMulti(st, fx, p, rng) {
    const n = p.multiGot || 0;
    if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }
    if (p.thenDraw) {
      const d = st.zones[p.chooser + '.deck'];
      let got = 0;
      for (let i = 0; i < p.thenDraw && d.length; i++) { st.zones[p.chooser + '.hand'].push(d.pop()); got++; }
      if (got) { addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: จั่ว ${got} ใบ`); fx.snd = 'draw'; }
    }
    if (p.buffPer && n > 0 && st.inst[p.src]) {
      st.buffs.push({ k: p.src, amt: (p.buffPer || 1) * n, until: 'endOfTurn' });
      addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: POWER +${(p.buffPer || 1) * n} จนจบเทิร์น (คืน ${n} ใบ)`);
    }
  }

  /* จบเป่ายิ้งฉุบ → ผู้ชนะเลือกทำลาย Avatar (ignoreProtect) */
  function finishRps(st, fx, rng) {
    const p = st.prompts[0];
    if (!p || p.kind !== 'rps') return;
    st.prompts.shift();
    const A = p.picks.A, B = p.picks.B;
    const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
    const label = { rock: 'ค้อน', paper: 'กระดาษ', scissors: 'กรรไกร' };
    addLog(st, 'S', `เป่ายิ้งฉุบผล: A=${label[A] || A} · B=${label[B] || B}`);
    const hellSrc = () => {
      if (p.srcToHell && zoneOf(st, p.src)) {
        const own = ownerOf(st, p.src);
        doMove(st, p.src, (own === 'S' ? p.chooser : own) + '.hell', null, fx);
      }
    };
    if (A === B) {
      addLog(st, 'S', 'เป่ายิ้งฉุบเสมอ — ไม่ทำลายใคร');
      hellSrc();
      return;
    }
    const winner = beats[A] === B ? 'A' : 'B';
    addLog(st, 'S', `ผู้ชนะเป่ายิ้งฉุบ: ${winner} — เลือกทำลาย Avatar 1 ใบ (กันเวทไม่ช่วย)`);
    const cd = { kind: 'chooseDestroy', src: p.src, chooser: winner, filter: { type: 'Avatar' }, zones: ['avatar'], ignoreProtect: true, srcToHell: !!p.srcToHell, optional: false };
    if (promptCandidates(st, cd).length) st.prompts.push(cd);
    else { addLog(st, 'S', 'ไม่มี Avatar ให้ทำลาย'); hellSrc(); }
  }

  /* ธรณีสูบ: เด็คบนสุด → นรก + trigger milled (เต๋า/นีโม่)
     srcK = การ์ดต้นทางที่สั่งสูบ (อ้วนไม่โบนัสการสูบของตัวเอง) */
  function mill(st, fx, player, count, rng, depth, srcK) {
    depth = depth || 0; if (depth > 5) return [];
    let extra = 0;
    (st.zones[player + '.avatar'] || []).forEach(id => {
      const e = EFFECTS[(st.inst[id] || {}).code];
      if (!e || !e.millBonusExtra) return;
      if (e.millBonusExceptSelf && srcK && id === srcK) return;
      extra += e.millBonusExtra;
    });
    const total = (count || 0) + extra;
    if (extra) addLog(st, 'S', `โบนัสธรณีสูบ +${extra} (นายนิรยบาล อ้วน ฯลฯ)`);
    const milledIds = [];
    for (let i = 0; i < total; i++) {
      const d = st.zones[player + '.deck'];
      if (!d.length) break;
      const k = d.pop();
      st.zones[player + '.hell'].push(k);
      milledIds.push(k);
    }
    if (milledIds.length) addLog(st, 'S', `ธรณีสูบ ${player}: ${milledIds.map(k => nameOf(st, k)).join(', ')} ตกนรก (${milledIds.length} ใบ)`);
    milledIds.forEach(k => {
      fireSentToHell(st, fx, k, player);
      const ce = EFFECTS[(st.inst[k] || {}).code];
      // สัญญาเลือด: โดนธรณีสูบ → ถามว่าจะเนรเทศแล้วเรียกนายนิรยบาลไหม
      if (ce && ce.milledOptional && ce.milledOptional.actions) {
        st.prompts.push({
          kind: 'milledOptional', src: k, chooser: player, optional: true,
          actions: ce.milledOptional.actions
        });
        addLog(st, player, `เอฟเฟกต์ ${nameOf(st, k)}: โดนธรณีสูบ — จะใช้ผลพิเศษไหม? (ข้ามได้)`);
      }
      abilitiesOf(st.inst[k].code, 'milled').forEach(ab => (ab.actions || []).forEach(ac => {
        if (ac.op === 'mill' && ac.who === 'both') {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: ทั้งสองฝ่ายธรณีสูบ ${ac.count} ใบ`);
          mill(st, fx, 'A', ac.count, rng, depth + 1, k);
          mill(st, fx, 'B', ac.count, rng, depth + 1, k);
        }
        if (ac.op === 'returnSelfToDeck') {
          st.zones[player + '.hell'] = st.zones[player + '.hell'].filter(x => x !== k);
          st.zones[player + '.deck'].push(k);
          if (ac.shuffle) seededShuffle(st.zones[player + '.deck'], rng);
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: กลับเข้าเด็คแล้วสับ`);
        }
        if (ac.op === 'offerSummonSelfFromHell') {
          const qd = quotaDeny(st, player + '.avatar', st.inst[k]);
          if (qd) addLog(st, 'S', `แว่น: ลงสนามไม่ได้ (${qd})`);
          else {
            st.prompts.push({
              kind: 'milledOptional', src: k, chooser: player, optional: true,
              actions: [{ op: 'summonSelfFromHell' }]
            });
            addLog(st, player, `เอฟเฟกต์ ${nameOf(st, k)}: โดนธรณีสูบ — จะอัญเชิญจากนรกไหม?`);
          }
        }
      }));
      // THE END / เมฟิสโตถูกสอดแนม — handled elsewhere; milled→hand for THE END
      if (ce && ce.addToHandWhenMilledOrScoutedByNameIncludes) {
        /* only when milled by migraine scout — skip generic mill */
      }
    });
    return milledIds;
  }

  // จำนวน Avatar สูงสุดของฝั่งหนึ่ง — ปกติ 4; ขยายเป็น 6 ถ้ามี "พิภพรัททาทุย" (Land) บนสนาม
  // และ Avatar ฝั่งนั้นเป็น Symbol รัททาทุย ทั้งหมด (รวมตัวที่กำลังจะลง)
  function avatarCap(st, side, summoningSymbol) {
    // นับเฉพาะ Avatar จริง (ไม่นับ Token) สำหรับเพดาน 4/6
    const avatars = (st.zones[side + '.avatar'] || []).filter(k => st.inst[k].type === 'Avatar' && !st.inst[k].isToken);
    const pipop = [...(st.zones['land'] || []), ...(st.zones[side + '.magic'] || [])].some(k => {
      const m = st.inst[k]; return m && m.faceUp && /พิภพรัททาทุย/.test(m.name || '');
    });
    if (!pipop) return 4;
    const allRat = avatars.every(k => (st.inst[k].symbol || '') === 'รัททาทุย');
    return (allRat && summoningSymbol === 'รัททาทุย') ? 6 : 4;
  }
  function quotaDeny(st, to, c) {
    // Avatar Zone: Avatar จริงสูงสุด 4 (ขยายได้) · Avatar + Token รวมสูงสุด 6 · Construct สูงสุด 3
    // Land Zone: สูงสุด 1 ใบ — ไม่ deny ที่นี่ แต่ clearLandZoneFor จะทำลายใบเดิมตอนวางใบใหม่
    if (to.endsWith('.avatar')) {
      const zone = st.zones[to] || [];
      if (zone.length >= 6) return 'Avatar Zone เต็ม (Avatar + Token รวมสูงสุด 6 ใบ)';
      if (!(c && c.isToken)) { // Token ไม่นับในเพดาน Avatar 4
        const cap = avatarCap(st, to[0], (c && c.symbol) || '');
        const realAv = zone.filter(k => st.inst[k].type === 'Avatar' && !st.inst[k].isToken).length;
        if (realAv >= cap) return `Avatar Zone เต็ม (Avatar สูงสุด ${cap} ใบ)`;
      }
    }
    if (to.endsWith('.construct') && (st.zones[to] || []).length >= 3) return 'Construct Zone เต็ม (สูงสุด 3 ใบ)'; // Rule Book 3.2
    return null;
  }

  /* จำกัดโฮสต์ตาม attachOnly (นวมรัททาทุย / ไบโพล่า / ดาบอัศวิน ฯลฯ) — คืนข้อความ deny หรือ null */
  function attachOnlyDeny(st, modCode, hostK) {
    const eAtt = EFFECTS[modCode];
    const ao = eAtt && eAtt.attachOnly;
    if (!ao) return null;
    const host = st.inst[hostK];
    if (!host) return 'ไม่มี Avatar เป้าหมาย';
    if (ao.symbol) {
      const hostSym = host.symbol || '';
      const want = ao.symbol;
      const ok = hostSym === want
        || (want === 'เครื่องจักร' && (hostSym === 'หุ่นยนต์' || hostSym === 'เครื่องจักร'))
        || (want === 'หุ่นยนต์' && (hostSym === 'หุ่นยนต์' || hostSym === 'เครื่องจักร'));
      if (!ok) return `สวมใส่ได้เฉพาะ Avatar Symbol ${ao.symbol}`;
    }
    if (ao.nameIncludes && !nameMatches(host, ao.nameIncludes))
      return `สวมใส่ได้เฉพาะ Avatar ชื่อมี "${ao.nameIncludes}"`;
    return null;
  }

  /* Land Magic Zone มีได้แค่ 1 ใบ — วางใบใหม่ = ทำลายใบเดิมทั้งหมด (ยกเว้นใบที่กำลังจะวาง) */
  function clearLandZoneFor(st, fx, keepK) {
    const lands = (st.zones['land'] || []).slice().filter(id => id !== keepK);
    lands.forEach(id => {
      const nm = nameOf(st, id);
      if (destroyCard(st, fx, id, { ignoreProtect: true }))
        addLog(st, 'S', `Land ใหม่เข้าสนาม — ทำลาย ${nm}`);
    });
  }

  function matchFilterEx(st, k, f) {
    const c = st.inst[k]; if (!c) return false;
    if (!f) return true;
    if (f.type && c.type !== f.type) return false;
    if (f.subtype && c.subtype !== f.subtype) return false;
    // symbol รวม curse override + extraSymbols
    const syms = cardSymbols(st, k);
    if (f.symbol && !syms.includes(f.symbol)) return false;
    if (f.symbols && !f.symbols.some(s => syms.includes(s))) return false;
    if (f.color && c.color !== f.color) return false;
    if (f.nameIncludes && !f.nameIncludes.some(n => nameMatches(c, n))) return false;
    if (f.nameIncludesAny && !f.nameIncludesAny.some(n => nameMatches(c, n))) return false;
    if (f.nameNotIncludes && nameMatches(c, f.nameNotIncludes)) return false;
    if (f.nameNotEquals && (c.name || '') === f.nameNotEquals) return false;
    if (f.excludeOnly && c.ex && /^Only/i.test(String(c.ex))) return false;
    if (f.nameOrSymbol && Array.isArray(f.nameOrSymbol)) {
      const ok = f.nameOrSymbol.some(cond => {
        if (cond.symbol && cardSymbols(st, k).includes(cond.symbol)) return true;
        if (cond.nameIncludes && cond.nameIncludes.some(n => nameMatches(c, n))) return true;
        return false;
      });
      if (!ok) return false;
    }
    if (f.costMax != null && effCost(st, k) > f.costMax) return false;
    if (f.cost != null && effCost(st, k) !== +f.cost) return false;
    if (f.gem != null && (+c.gem || 0) !== +f.gem) return false;
    if (f.gemMin != null && (+c.gem || 0) < +f.gemMin) return false;
    if (f.power != null && (+c.power || 0) !== +f.power) return false;
    if (f.powerMax != null && (+c.power || 0) > f.powerMax) return false;
    if (f.powerEquals != null && effPower(st, k) !== +f.powerEquals) return false;
    if (f.excludeSelf && f._srcK && k === f._srcK) return false;
    if (f.powerBuffCountMin != null && (c.powerBuffCount || 0) < f.powerBuffCountMin) return false;
    if (f.hasCost && (c.cost === '' || c.cost == null)) return false;
    if (f.requireTapped && !c.tapped) return false;
    if (f.requireUntapped && c.tapped) return false;
    return true;
  }

  function uniqueHellSymbolNames(st, player, symbol) {
    const names = new Set();
    (st.zones[player + '.hell'] || []).forEach(id => {
      const c = st.inst[id];
      if (!c || c.type !== 'Avatar') return;
      if (symbol && !cardSymbols(st, id).includes(symbol)) return;
      if (c.name) names.add(c.name);
    });
    return names;
  }

  /* แปลง cost แบบ object (clarification) → รูปแบบ array ที่ activate ใช้ได้ */
  function normalizeAbilityCost(cost) {
    if (!cost) return null;
    if (Array.isArray(cost)) return cost;
    if (typeof cost !== 'object') return null;
    if (cost.discardHand != null) return [{ op: 'discard', count: cost.discardHand }];
    if (cost.discardHandFilter) return [{ op: 'discard', filter: cost.discardHandFilter, count: cost.count || 1 }];
    if (cost.exileHell != null) return [{ op: 'exileHell', count: cost.exileHell }];
    if (cost.exileHellDistinctNames) {
      const spec = cost.exileHellDistinctNames;
      return [{ op: 'exileHellDistinctNames', nameIncludes: spec.nameIncludes, count: spec.count || 3 }];
    }
    if (cost.exileSelf) return [{ op: 'exileSelf' }];
    if (cost.op) return [cost];
    return null;
  }

  function cardSymbols(st, k) {
    const c = st.inst[k]; if (!c) return [];
    // Land force symbol (แอสการ์ด): บังคับ Symbol ทั้งสนามจนกว่า Land จะออก
    for (const id of (st.zones['land'] || [])) {
      const L = st.inst[id];
      const le = EFFECTS[(L || {}).code];
      if (L && L.faceUp && le && le.forceAllAvatarSymbol) return [le.forceAllAvatarSymbol];
    }
    const out = [];
    if (c.curse && c.curse.symbol) out.push(c.curse.symbol);
    else if (c.symbol) out.push(c.symbol);
    const e = EFFECTS[c.code];
    if (e && e.extraSymbols) e.extraSymbols.forEach(s => { if (!out.includes(s)) out.push(s); });
    return out;
  }

  /* เทิร์นละครั้ง — คืน true ถ้ายังไม่ใช้ในเทิร์นผู้เล่นนี้ แล้วมาร์คว่าใช้แล้ว
     ใช้ turnSeq (นับทุกครั้งที่จบเทิร์น) ไม่ใช้ st.turn อย่างเดียว เพราะ st.turn แชร์ข้ามตา A↔B ในรอบเดียวกัน */
  function claimOncePerTurn(st, k, tag) {
    st._onceTurn = st._onceTurn || {};
    const seq = st.turnSeq != null ? st.turnSeq : ((st.turn || 0) + ':' + (st.active || ''));
    const key = k + ':' + seq + ':' + (tag || 'x');
    if (st._onceTurn[key]) return false;
    st._onceTurn[key] = true;
    return true;
  }

  /* หลังนารายณ์ฆ่าจากการต่อสู้ — เสนออวตารจากมือ (001/002/003) */
  function offerNaraiHandForms(st, fx, owner, killerK) {
    const opts = [];
    (st.zones[owner + '.hand'] || []).forEach(id => {
      abilitiesOf(st.inst[id].code, 'handAfterBattleDestroy').forEach(ab => {
        const tag = ab.oncePerTurnByName || st.inst[id].name;
        st._naraiFormOnce = st._naraiFormOnce || {};
        const key = owner + ':' + (st.turnSeq || st.turn) + ':' + tag;
        if (st._naraiFormOnce[key]) return;
        opts.push({ k: id, ab, label: st.inst[id].name });
      });
    });
    if (!opts.length) return;
    st.prompts.push({
      kind: 'naraiHandForm', chooser: owner, killer: killerK, optional: true, options: opts,
      label: 'สั่งใช้อวตารนารายณ์จากมือ'
    });
    addLog(st, owner, `อวตารนารายณ์พร้อมใช้จากมือ (${opts.length} ใบ) — เลือกหรือข้าม`);
  }

  /* เมื่อสวม Mod ชื่ออาวุธหุ่นนักรบผู้กล้า → ไมเกรนทุกใบบนสนามจั่ว (เทิร์นละครั้งต่อใบ) */
  function fireWeaponModAttached(st, fx, modId, rng) {
    const mod = st.inst[modId]; if (!mod) return;
    const host = mod.attachedTo ? st.inst[mod.attachedTo] : null;
    const me = EFFECTS[mod.code];
    if (me && me.drawOnAttachIfHostNameIncludes && host && nameMatches(host, me.drawOnAttachIfHostNameIncludes)) {
      const side = ownerOf(st, mod.attachedTo);
      if (side === 'A' || side === 'B') {
        const d = st.zones[side + '.deck'];
        if (d && d.length) {
          st.zones[side + '.hand'].push(d.pop());
          addLog(st, side, `เอฟเฟกต์ ${mod.name}: สวมไอดอล → จั่ว 1`);
          fx.snd = 'draw';
        }
      }
    }
    if (!(mod.name || '').includes('อาวุธหุ่นนักรบผู้กล้า')) return;
    ['A', 'B'].forEach(side => {
      (st.zones[side + '.avatar'] || []).forEach(k => {
        abil(st, k, 'weaponModAttached').forEach(ab => {
          if (ab.oncePerTurn && !claimOncePerTurn(st, k, 'weaponModAttached')) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: ใช้จั่วจากอาวุธไปแล้วในเทิร์นนี้`);
            return;
          }
          addLog(st, side, `เอฟเฟกต์ ${nameOf(st, k)}: สวมอาวุธหุ่นนักรบผู้กล้า → จั่ว 1`);
          runActions(st, fx, ab.actions || [], { src: k, owner: side, rng: rng || (() => 0.5) });
        });
      });
    });
  }

  /* Cost จริงบนสนาม: ค่าพิมพ์ + delta + Aura ทหาร (−1 ฝั่งตรงข้าม) + ขวานไม้ (−1 โฮสต์) */
  function effCost(st, k) {
    const c = st.inst[k]; if (!c) return 0;
    if (c._swapCombat) return Math.max(0, +c.power || 0);
    const e0 = EFFECTS[c.code];
    // น้องนาว: มีเปรตบนสนาม → Cost บนมือ = 0
    if (e0 && e0.costZeroIfOwnSymbol) {
      const z0 = zoneOf(st, k) || '';
      if (z0.endsWith('.hand')) {
        const has = (st.zones[z0[0] + '.avatar'] || []).some(id => st.inst[id] && st.inst[id].symbol === e0.costZeroIfOwnSymbol);
        if (has) return 0;
      }
    }
    let cost = (+c.cost || 0) + (+c.costDelta || 0);
    const z = zoneOf(st, k) || '';
    if (z.endsWith('.avatar')) {
      const side = z[0], opp = other(side);
      (st.zones[opp + '.avatar'] || []).forEach(id => {
        const e = EFFECTS[(st.inst[id] || {}).code];
        if (e && e.enemyCostAura) cost += e.enemyCostAura;
      });
      for (const id in st.inst) {
        const m = st.inst[id];
        if (!m || m.attachedTo !== k) continue;
        const e = EFFECTS[m.code];
        if (e && e.hostCostDelta) cost += e.hostCostDelta;
        else {
          // fallback: ข้อความ "Cost ±N" บนใบสวม
          const txt = m.effect || '';
          const mm = txt.match(/Cost\s*([+-]\s*\d+)/i);
          if (mm) cost += parseInt(String(mm[1]).replace(/\s/g, ''), 10) || 0;
        }
      }
    }
    return Math.max(0, cost);
  }

  function pushBuff(st, buff) {
    st.buffs = st.buffs || [];
    if (buff.from && !buff.fromName && st.inst[buff.from]) buff.fromName = nameOf(st, buff.from);
    st.buffs.push(buff);
  }
  /* สรุป POWER ล่าสุด + แหล่งเพิ่ม/ลด (ใช้โชว์ UI) */
  function powerBreakdown(st, k) {
    const empty = { total: 0, base: 0, lines: [], note: '' };
    const c = st.inst[k]; if (!c) return empty;
    const lines = [];
    const add = (amt, label) => { if (!amt) return; lines.push({ amt, label }); };
    if (c._swapCombat) {
      const total = Math.max(0, +c.cost || 0);
      return { total, base: +c.power || 0, lines: [{ amt: total, label: 'สลับ Cost↔POWER (ใช้ Cost เป็น POWER)' }], note: 'swap' };
    }
    if ((st.buffs || []).some(b => b.k === k && b.lockPrinted && b.until === 'combat')) {
      const total = Math.max(0, +c.power || 0);
      return { total, base: total, lines: [{ amt: total, label: 'ล็อก POWER ตั้งต้น (จนจบการต่อสู้)' }], note: 'lock' };
    }
    {
      const e = EFFECTS[c.code];
      if (e && e.setPowerFrom === 'oppHandCount') {
        const z = zoneOf(st, k) || '';
        if (z.endsWith('.avatar')) {
          const total = Math.max(0, (st.zones[other(z[0]) + '.hand'] || []).length);
          return { total, base: +c.power || 0, lines: [{ amt: total, label: 'เท่าจำนวนมือฝ่ายตรงข้าม' }], note: 'set' };
        }
      }
    }
    {
      const e = EFFECTS[c.code];
      if (e && e.setPowerIfAllyNameIncludes) {
        const z = zoneOf(st, k) || '';
        if (z.endsWith('.avatar')) {
          const has = (st.zones[z[0] + '.avatar'] || []).some(id => nameMatches(st.inst[id], e.setPowerIfAllyNameIncludes));
          if (has) {
            let p = e.setPowerTo != null ? e.setPowerTo : 2;
            lines.push({ amt: p, label: `ตั้งเป็น ${p} (มี ${e.setPowerIfAllyNameIncludes})` });
            (st.buffs || []).forEach(b => {
              if (b.k !== k || b.until !== 'combat' || !b.amt) return;
              const who = b.fromName || (b.from && nameOf(st, b.from)) || 'เอฟเฟกต์';
              add(b.amt, `${who} (จนจบการต่อสู้)`);
              p += b.amt;
            });
            if (c.curse && c.curse.powerMod) { add(c.curse.powerMod, `คำสาป${c.curse.symbol ? ' ' + c.curse.symbol : ''}`); p += c.curse.powerMod; }
            return { total: Math.max(0, p), base: +c.power || 0, lines, note: 'setAlly' };
          }
        }
      }
    }
    const base = +c.power || 0;
    let p = base;
    lines.push({ amt: base, label: 'ค่าตั้งต้นบนการ์ด' });
    if (c.counters) { add(c.counters, 'เคาน์เตอร์'); p += c.counters; }
    if (+c.powerDelta) {
      if (c.powerDeltaFrom && c.powerDeltaFrom.length) {
        c.powerDeltaFrom.forEach(d => {
          if (!d.amt) return;
          add(d.amt, `${d.fromName || (d.from && nameOf(st, d.from)) || 'เอฟเฟกต์'} (ถาวร)`);
        });
      } else add(+c.powerDelta, 'ปรับถาวร (จนกว่าออกจากสนาม)');
      p += +c.powerDelta;
    }
    const kz = zoneOf(st, k) || '';
    if (kz.endsWith('.avatar') && c.type === 'Avatar' && c.faceUp) {
      const side = kz[0];
      if (c.curse && c.curse.powerMod) { add(c.curse.powerMod, `คำสาป${c.curse.symbol ? ' ' + c.curse.symbol : ''}`); p += c.curse.powerMod; }
      for (const id in st.inst) if (st.inst[id].attachedTo === k) {
        const mod = st.inst[id];
        const me = EFFECTS[mod.code];
        let modAmt = 0;
        if (me && me.hostPowerIfEffCostMin && effCost(st, k) >= me.hostPowerIfEffCostMin.min)
          modAmt += me.hostPowerIfEffCostMin.amount || 0;
        const staticAbs = abilitiesOf(mod.code, 'static');
        let gotStaticPow = false;
        staticAbs.forEach(ab => (ab.actions || []).forEach(ac => {
          if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'equippedAvatar') {
            if (ac.ifHostNameIncludes && !nameMatches(c, ac.ifHostNameIncludes)) return;
            gotStaticPow = true;
            let amt = ac.amount || 0;
            if (ac.amountIfHostNameIncludes && (c.name || '').includes(ac.amountIfHostNameIncludes.name))
              amt = ac.amountIfHostNameIncludes.amount;
            if (ac.amountPer === 'ownAvatarSymbol') {
              const own = ownerOf(st, k);
              amt = (ac.per || 1) * (st.zones[own + '.avatar'] || []).filter(x => {
                if (!st.inst[x] || !st.inst[x].faceUp) return false;
                if (!ac.includeSelf && x === k) return false;
                return cardSymbols(st, x).includes(ac.symbol);
              }).length;
            }
            modAmt += amt;
          }
        }));
        if (!gotStaticPow) {
          const txt = mod.effect || '';
          const mm = txt.match(/POWER\s*([+-]\s*\d+)/i);
          if (mm) {
            const symM = txt.match(/\{?\s*symbol\s+([^}\s]+)\s*\}?/i);
            const needSym = symM ? symM[1].trim() : '';
            if (!needSym || cardSymbols(st, k).includes(needSym))
              modAmt += parseInt(String(mm[1]).replace(/\s/g, ''), 10) || 0;
          }
        }
        if (modAmt) { add(modAmt, `สวม「${mod.name}」`); p += modAmt; }
      }
      const sources = [
        ...(st.zones['A.avatar'] || []), ...(st.zones['B.avatar'] || []),
        ...(st.zones['land'] || []),
        ...(st.zones['A.construct'] || []), ...(st.zones['B.construct'] || [])
      ];
      sources.forEach(src => {
        const s = st.inst[src]; if (!s || !s.faceUp) return;
        const sz = zoneOf(st, src) || '';
        abil(st, src, 'static').forEach(ab => {
          const cond = (ab.trigger && ab.trigger.if) || '';
          if (cond === 'self.zone==avatarZone' && !sz.endsWith('.avatar')) return;
          if ((cond === 'self.zone==landZone' || cond === 'self.zone==land') && sz !== 'land') return;
          if (cond === 'self.zone==construct' && !sz.endsWith('.construct')) return;
          (ab.actions || []).forEach(ac => {
            if (ac.op !== 'modifyPower') return;
            const t = ac.target || {};
            let amt = 0;
            if (t.select === 'all') {
              if (t.side === 'own' && sz[0] !== side && sz !== 'land') return;
              if (sz.endsWith('.construct') && t.side === 'own' && sz[0] !== side) return;
              if (t.side === 'enemy' && sz[0] === side) return;
              if (t.excludeSelf && src === k) return;
              if (t.type && c.type !== t.type) return;
              if (t.symbol && !cardSymbols(st, k).includes(t.symbol)) return;
              if (t.symbols && !t.symbols.some(sy => cardSymbols(st, k).includes(sy))) return;
              if (t.nameIncludes && !t.nameIncludes.some(n => nameMatches(c, n))) return;
              if (t.requireAttachedNameIncludes && !hasAttachedNameIncludes(st, k, t.requireAttachedNameIncludes)) return;
              if (t.cost != null && (+c.cost || 0) !== +t.cost) return;
              if (t.gem != null && (+c.gem || 0) !== +t.gem) return;
              if (t.power != null && (+c.power || 0) !== +t.power) return;
              amt = ac.amount || 0;
            } else if (t.select === 'self' && src === k) {
              if (ac.amountPer === 'ownRevealedLife')
                amt = (ac.per || 1) * (st.zones[side + '.life'] || []).filter(x => st.inst[x].faceUp).length;
              else if (ac.amountPer === 'allRevealedLife')
                amt = (ac.per || 1) * (
                  (st.zones['A.life'] || []).filter(x => st.inst[x].faceUp).length +
                  (st.zones['B.life'] || []).filter(x => st.inst[x].faceUp).length
                );
              else if (ac.amountPer === 'ownAvatarSymbol')
                amt = (ac.per || 1) * (st.zones[side + '.avatar'] || []).filter(x => (ac.includeSelf || x !== k) && cardSymbols(st, x).includes(ac.symbol) && st.inst[x].faceUp).length;
              else if (ac.amountPer === 'allFieldModifications')
                amt = (ac.per || 1) * Object.values(st.inst).filter(x => x && x.subtype === 'Modification' && x.attachedTo).length
                  + (ac.per || 1) * ['A.magic', 'B.magic'].reduce((n, z) => n + (st.zones[z] || []).filter(id => st.inst[id] && st.inst[id].subtype === 'Modification').length, 0);
              else if (ac.amountPer === 'ownAttachedMods')
                amt = (ac.per || 1) * Object.values(st.inst).filter(x => x.attachedTo === k).length;
              else amt = ac.amount || 0;
            }
            if (amt) {
              const who = src === k ? 'ความสามารถต่อเนื่องของตัวเอง' : `ออร่า「${s.name}」`;
              add(amt, who);
              p += amt;
            }
          });
        });
      });
      (st.zones['land'] || []).forEach(lk => {
        const e = EFFECTS[(st.inst[lk] || {}).code];
        if (e && e.auraNameIncludes && e.auraPower && nameMatches(c, e.auraNameIncludes)) {
          add(e.auraPower, `ออร่า「${nameOf(st, lk)}」`);
          p += e.auraPower;
        }
      });
    }
    if (c.type === 'Avatar' && c.faceUp && kz.endsWith('.avatar') && hasKw(st, k, 'ลูกฮึด') && inCritical(st, kz[0])) {
      add(1, 'ลูกฮึด (สถานะสาหัส)'); p += 1;
    }
    {
      const e = EFFECTS[c.code];
      if (e && e.powerPlusOnOppTurn && kz.endsWith('.avatar') && st.active && st.active !== kz[0]) {
        add(e.powerPlusOnOppTurn, 'เทิร์นฝ่ายตรงข้าม'); p += e.powerPlusOnOppTurn;
      }
    }
    {
      const e = EFFECTS[c.code];
      if (e && e.powerPerAllyNameIncludesWhileTapped && c.tapped && kz.endsWith('.avatar')) {
        const cfg = e.powerPerAllyNameIncludesWhileTapped;
        const names = cfg.names || [];
        const per = cfg.per || 1;
        let n = 0;
        (st.zones[kz[0] + '.avatar'] || []).forEach(id => {
          if (id === k) return;
          const o = st.inst[id]; if (!o || !o.faceUp) return;
          if (cfg.symbol && o.symbol !== cfg.symbol) return;
          if (names.some(nm => nameMatches(o, nm))) n += per;
        });
        if (n) { add(n, 'พันธมิตรขณะนอน'); p += n; }
      }
    }
    const hasAntidote = (() => {
      for (const id in st.inst) {
        const m = st.inst[id];
        if (m && m.attachedTo === k && EFFECTS[m.code] && EFFECTS[m.code].ignoreNegativePower) return true;
      }
      return false;
    })();
    const untilLbl = u => u === 'permanent' ? 'ถาวร' : u === 'combat' ? 'จนจบการต่อสู้' : u === 'oppNextEnd' ? 'จน End ฝ่ายตรงข้าม' : 'จนจบเทิร์น';
    (st.buffs || []).forEach(b => {
      if (b.k !== k || b.lockPrinted || !b.amt) return;
      if (hasAntidote && b.amt < 0) return;
      const who = b.fromName || (b.from && nameOf(st, b.from)) || 'เอฟเฟกต์';
      add(b.amt, `${who} (${untilLbl(b.until)})`);
      p += b.amt;
    });
    return { total: Math.max(0, p), base, lines };
  }
  function effPower(st, k) { return powerBreakdown(st, k).total; }

  /* นับจำนวนการ์ดตามแหล่ง (ใช้กับ weakenAttacker ฯลฯ) — excludeK = การ์ดที่ไม่ให้นับ (เช่น เวทสวนเอง) */
  function countSource(st, owner, src, excludeK) {
    const opp = other(owner);
    const cnt = zs => zs.reduce((n, z) => n + (st.zones[z] || []).filter(k => k !== excludeK).length, 0);
    switch (src) {
      case 'ownHand': return cnt([owner + '.hand']);
      case 'ownField': return cnt([owner + '.avatar', owner + '.construct']);
      // มือ + สนามฝ่ายเรา (อวตาร/คอนสตรัค/เวท) — ไปเลยมอนตี้ ฯลฯ
      case 'ownSide': return cnt([owner + '.hand', owner + '.avatar', owner + '.construct', owner + '.magic']);
      case 'oppField': return cnt([opp + '.avatar', opp + '.construct']);
      // ทุกการ์ดบนสนามทั้งสองฝั่ง (อวตาร + คอนสตรัค + เวทที่วางอยู่ + Land)
      case 'fieldAll': return cnt(['A.avatar', 'A.construct', 'A.magic', 'B.avatar', 'B.construct', 'B.magic', 'land']);
      default: return 0;
    }
  }

  /* การ์ดสวนกลับที่เล่นได้ตอนนี้ (React ที่ดักโจมตี) สำหรับฝ่าย owner — ใช้โชว์กล่องสวนกลับฝั่ง client */
  function counterOptions(st, owner) {
    if (!st.pending || st.pending.target !== owner) return [];
    if (st.pending.blockReact) return [];
    return (st.zones[owner + '.hand'] || []).filter(k => {
      const c = st.inst[k];
      if (!c || c.type !== 'Magic' || c.subtype !== 'React') return false;
      if (!abilitiesOf(c.code, 'enemyDeclareAttack').length) return false;
      if (isMagicTypeUsed(st, owner, 'React')) return false;
      return true;
    });
  }

  /* เป้าที่เลือกได้ของ prompt ปัจจุบัน */
  function promptCandidates(st, p) {
    if (!p) return [];
    if (p.kind === 'naraiHandForm')
      return (p.options || []).map(o => o.k).filter(k => st.inst[k] && (zoneOf(st, k) || '').endsWith('.hand'));
    if (p.kind === 'milledOptional')
      return p.src && st.inst[p.src] && zoneOf(st, p.src) ? [p.src] : [];
    if (p.kind === 'react') {
      if (p.options && p.options.length) return p.options.filter(k => !!st.inst[k] && !!zoneOf(st, k));
      return p.src && st.inst[p.src] && zoneOf(st, p.src) ? [p.src] : [];
    }
    if (p.kind === 'chooseBuff') {
      const out = [];
      ['A', 'B'].forEach(s => (st.zones[s + '.avatar'] || []).forEach(k => {
        if (p.side === 'own' && s !== p.chooser) return;
        if (matchFilterEx(st, k, { type: p.ftype || 'Avatar', symbol: p.fsymbol || undefined })) out.push(k);
      }));
      return out;
    }
    if (p.kind === 'chooseDiscard')
      return (st.zones[p.chooser + '.hand'] || []).filter(k => {
        if (p.excludeIds && p.excludeIds.includes(k)) return false;
        return matchFilterEx(st, k, p.filter);
      });
    if (p.kind === 'chooseDestroy') {
      const out = [];
      (p.zones || ['magic', 'land']).forEach(zn => {
        if (zn === 'land') (st.zones['land'] || []).forEach(k => { if (matchFilterEx(st, k, p.filter)) out.push(k); });
        else ['A', 'B'].forEach(s => {
          if (p.side === 'enemy' && s === p.chooser) return;
          if (p.side === 'own' && s !== p.chooser) return;
          (st.zones[s + '.' + zn] || []).forEach(k => {
            if (!matchFilterEx(st, k, p.filter)) return;
            // ริกกี้: ไม่ให้เลือกเป็นเป้า Magic ศัตรู
            const eImm = EFFECTS[(st.inst[k] || {}).code];
            if (eImm && eImm.immuneOppMagicTarget && p.fromOppMagic) return;
            out.push(k);
          });
        });
      });
      return out;
    }
    if (p.kind === 'pick') {
      let pool = [];
      if (p.from === 'ids') {
        if (p.dest === 'swapCombat' || p.allowAnyZone) pool = (p.ids || []).slice();
        else pool = (p.ids || []).filter(k => (st.zones[p.chooser + '.deck'] || []).includes(k));
      }
      else if (p.from === 'deckAll') pool = (st.zones[p.chooser + '.deck'] || []).slice();
      else if (p.from === 'hell') pool = (st.zones[p.chooser + '.hell'] || []).filter(x => x !== p.src);
      else if (p.from === 'ownAvatars') pool = (st.zones[p.chooser + '.avatar'] || []).filter(x => x !== p.src);
      else if (p.from === 'enemyAvatars') pool = (st.zones[other(p.chooser) + '.avatar'] || []).slice();
      else if (p.from === 'allAvatars') pool = [...(st.zones['A.avatar'] || []), ...(st.zones['B.avatar'] || [])].filter(x => x !== p.src);
      else if (p.from === 'ownHand') {
        pool = (st.zones[p.chooser + '.hand'] || []).slice();
        if (p.excludeIds && p.excludeIds.length) pool = pool.filter(k => !p.excludeIds.includes(k));
      }
      return pool.filter(k => matchFilterEx(st, k, p.filter) && (!p.requireUntapped || (st.inst[k] && !st.inst[k].tapped)));
    }
    return [];
  }

  /* เอเลี่ยนทูต: จบขั้นแสดงมือ → ทำลายศัตรู P = ผลรวม Cost → ให้มือ 1 ใบ */
  function finishAlienReveal(st, fx, p) {
    const revealed = (p.revealed || []).filter(k => (st.zones[p.chooser + '.hand'] || []).includes(k));
    const sum = revealed.reduce((s, k) => s + effCost(st, k), 0);
    addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: แสดง ${revealed.length} ใบ (รวม Cost ${sum})`);
    fx.toss = { by: p.chooser, names: revealed.map(k => nameOf(st, k)) };
    fx.snd = 'flip';
    const dp = {
      kind: 'chooseDestroy', src: p.src, chooser: p.chooser,
      filter: { type: 'Avatar', powerEquals: sum },
      zones: ['avatar'], side: 'enemy', optional: true,
      afterAlienGive: true, alienRevealed: revealed
    };
    if (promptCandidates(st, dp).length) {
      st.prompts.unshift(dp);
      addLog(st, p.chooser, `เลือก Avatar ฝ่ายตรงข้ามที่ POWER = ${sum} เพื่อทำลาย`);
    } else {
      addLog(st, 'S', `ไม่มี Avatar ฝ่ายตรงข้ามที่ POWER = ${sum} — ข้ามทำลาย`);
      revealed.forEach(k => { if (st.inst[k]) delete st.inst[k].revealed; });
      pushAlienGive(st, p.src, p.chooser);
    }
  }
  function pushAlienGive(st, src, chooser) {
    const gp = {
      kind: 'pick', from: 'ownHand', src, chooser,
      filter: {}, dest: 'giveToOpp', optional: false
    };
    if (promptCandidates(st, gp).length) {
      st.prompts.unshift(gp);
      addLog(st, chooser, `เอฟเฟกต์ ${nameOf(st, src)}: เลือกการ์ดในมือ 1 ใบ ให้ฝ่ายตรงข้าม`);
    } else addLog(st, 'S', `ไม่มีใบในมือให้ฝ่ายตรงข้าม`);
  }

  /* มาติเนซ: รถถังโดน Magic เล็ง → บังคับทำลายมาติเนซ ยกเลิกเวท */
  function tryMartinezNegate(st, fx, targetK, p) {
    const src = p && p.src ? st.inst[p.src] : null;
    if (!src || src.type !== 'Magic') return false;
    const host = st.inst[targetK];
    if (!host || !(host.name || '').includes('รถถัง')) return false;
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== targetK) continue;
      const e = EFFECTS[m.code];
      if (!e || !e.negateHostMagicByDestroySelf) continue;
      addLog(st, 'S', `🛡️ ${m.name}: ทำลายตัวเองจากสภาพสวมใส่ → ยกเลิก ${src.name}`);
      m.attachedTo = null;
      destroyCard(st, fx, id, { ignoreProtect: true });
      if (p.src && zoneOf(st, p.src)) doMove(st, p.src, (ownerOf(st, p.src) || p.chooser) + '.hell', null, fx);
      fx.snd = 'clash';
      return true;
    }
    return false;
  }

  /* ใครเจ๋งกว่า — เลือกพร้อมกัน (ซ่อนจนครบ) แล้วเทียบ Cost */
  function cardHasCost(c) { return c && c.cost !== '' && c.cost != null; }
  function startWhoIsCooler(st, fx, ctx) {
    const state = { src: ctx.src, by: ctx.owner, picks: {}, showAll: {} };
    ['A', 'B'].forEach(side => {
      const hand = st.zones[side + '.hand'] || [];
      const withCost = hand.filter(k => cardHasCost(st.inst[k]));
      if (!withCost.length) {
        state.showAll[side] = true;
        hand.forEach(k => { if (st.inst[k]) st.inst[k].revealed = true; });
        addLog(st, side, `ใครเจ๋งกว่า: ไม่มีการ์ดที่มี Cost — เปิดมือทั้งหมดให้ดู`);
        fx.toss = { by: side, names: hand.map(k => nameOf(st, k)) };
      }
    });
    st.whoCool = state;
    queueWhoCoolPick(st);
  }
  function queueWhoCoolPick(st) {
    const w = st.whoCool; if (!w) return;
    const need = ['A', 'B'].find(side => !w.showAll[side] && !w.picks[side]);
    if (!need) { finishWhoIsCooler(st, {}); return; }
    st.prompts.unshift({
      kind: 'pick', from: 'ownHand', src: w.src, chooser: need,
      filter: { hasCost: true }, dest: 'whoCoolShow', optional: false, hiddenPick: true
    });
    addLog(st, need, `ใครเจ๋งกว่า: เลือกการ์ดที่มี Cost จากมือ (ซ่อนจนกว่าอีกฝ่ายเลือกครบ)`);
  }
  function finishWhoIsCooler(st, fx) {
    const w = st.whoCool; if (!w) return;
    st.whoCool = null;
    const reveal = (side, k) => {
      if (!k || !st.inst[k]) return;
      st.inst[k].revealed = true;
      addLog(st, side, `👁 แสดง ${nameOf(st, k)} (Cost ${+(st.inst[k].cost) || 0})`);
    };
    ['A', 'B'].forEach(side => {
      if (w.picks[side]) reveal(side, w.picks[side]);
    });
    const aK = w.picks.A, bK = w.picks.B;
    if (w.showAll.A && w.showAll.B) {
      addLog(st, 'S', `ใครเจ๋งกว่า: ทั้งสองฝ่ายไม่มี Cost — แค่โชว์มือจบ`);
    } else if (w.showAll.A || w.showAll.B) {
      addLog(st, 'S', `ใครเจ๋งกว่า: ฝ่ายที่ไม่มี Cost โชว์มือ — จบ (ไม่ทิ้ง/ไม่คืนเด็ค)`);
    } else if (aK && bK) {
      const ca = +(st.inst[aK].cost) || 0, cb = +(st.inst[bK].cost) || 0;
      if (ca < cb) {
        doMove(st, aK, 'A.hell', null, fx);
        addLog(st, 'S', `ใครเจ๋งกว่า: A Cost ${ca} < B Cost ${cb} → A ทิ้ง ${nameOf(st, aK)}`);
        if (st.inst[bK]) delete st.inst[bK].revealed;
      } else if (cb < ca) {
        doMove(st, bK, 'B.hell', null, fx);
        addLog(st, 'S', `ใครเจ๋งกว่า: B Cost ${cb} < A Cost ${ca} → B ทิ้ง ${nameOf(st, bK)}`);
        if (st.inst[aK]) delete st.inst[aK].revealed;
      } else {
        ['A', 'B'].forEach(side => {
          const k = w.picks[side];
          if (!k || !st.inst[k]) return;
          doMove(st, k, side + '.deck', null, fx);
          seededShuffle(st.zones[side + '.deck'], () => 0.5);
          addLog(st, side, `Cost เท่ากัน (${ca}) → คืน ${nameOf(st, k)} เข้าเด็คแล้วสับ`);
        });
        syncHeimdall(st);
      }
    }
    // เคลียร์ revealed จากโชว์มือทั้งหมด
    ['A', 'B'].forEach(side => {
      if (!w.showAll[side]) return;
      (st.zones[side + '.hand'] || []).forEach(k => { if (st.inst[k]) delete st.inst[k].revealed; });
    });
    if (w.src && zoneOf(st, w.src)) doMove(st, w.src, w.by + '.hell', null, fx);
    fx.snd = 'clash';
  }

  /* รวบรวม React ในมือ/เซ็ตที่ตอบ trigger ได้ (ยังไม่ใช้ประเภท React ในเทิร์น) */
  function collectReactOptions(st, owner, triggerOn, filterFn) {
    if (isMagicTypeUsed(st, owner, 'React')) return [];
    const out = [];
    const consider = (m, allowFacedown) => {
      const mc = st.inst[m]; if (!mc) return;
      if (mc.type === 'Magic' && mc.subtype !== 'React') return;
      if (!abilitiesOf(mc.code, triggerOn).length) return;
      if (filterFn && !filterFn(m, mc)) return;
      if (!out.includes(m)) out.push(m);
    };
    (st.zones[owner + '.hand'] || []).forEach(m => consider(m, false));
    (st.zones[owner + '.magic'] || []).forEach(m => {
      const mc = st.inst[m];
      if (mc && !mc.faceUp) consider(m, true);
    });
    return out;
  }

  function bindReactPromptCard(st, p, cardK) {
    const c = st.inst[cardK]; if (!c) return false;
    p.src = cardK;
    const triggerOn = p.reactTrigger || (p.magicNegate || p.mode === 'negateMagic' ? 'enemyPlayMagic' : p.abilityReact ? 'enemyActivateAbility' : 'avatarSummoned');
    let rab = abilitiesOf(c.code, triggerOn)[0];
    if (!rab && p.reactTriggerAlt) rab = abilitiesOf(c.code, p.reactTriggerAlt)[0];
    if (rab) {
      p.actions = rab.actions || p.actions || [];
      if (rab.mode) p.mode = rab.mode;
    }
    return true;
  }

  /* เชาว์ปัญญาลิง: เสนอ React จากมือเมื่อศัตรูใช้ความสามารถ Avatar */
  function offerAbilityReact(st, fx, activator, avatarK, pending) {
    const opp = other(activator);
    if (abilitiesNullified(st, avatarK)) return false; // ถูก nullify อยู่แล้ว — ไม่ต้องถามซ้ำตอนใช้ความสามารถที่ไม่มีแล้ว
    const options = collectReactOptions(st, opp, 'enemyActivateAbility');
    if (!options.length) return false;
    const rab = abilitiesOf(st.inst[options[0]].code, 'enemyActivateAbility')[0];
    st._pendingAbility = pending || { activator, avatarK };
    st.prompts.unshift({
      kind: 'react', mode: 'runActions', src: null, options, chooser: opp, target: avatarK,
      actions: (rab && rab.actions) || [], abilityReact: true, reactTrigger: 'enemyActivateAbility',
      label: `${nameOf(st, avatarK)} ใช้ความสามารถ`
    });
    addLog(st, opp, `React พร้อมใช้ (${options.length} ใบ): ${nameOf(st, avatarK)} ใช้ความสามารถ — เลือกใบหรือไม่ใช้`);
    return true;
  }

  /* จ่ายค่า + รันผลสั่งใช้ (หลังคู่ต่อสู้กดไม่ใช้เชาว์ปัญญาลิง) */
  function payCostAndRunActivated(st, fx, owner, srcK, costList, actions, rng) {
    costList = costList || [];
    actions = actions || [];
    if (costList.length) {
      const costOp = costList[0];
      if (costOp.op === 'discard') {
        const filt = Object.assign({}, costOp.filter || {});
        if (costOp.gemMin != null) filt.gemMin = costOp.gemMin;
        const need = costOp.count || 1;
        st.prompts.push({ kind: 'chooseDiscard', src: srcK, chooser: owner, filter: filt, actions, effectDiscard: true, discardNeed: need > 1 ? need : undefined, discardGot: 0 });
        addLog(st, owner, `เลือกการ์ดในมือทิ้งเพื่อจ่ายค่า${need > 1 ? ` (${need} ใบ)` : ''}`);
      } else if (costOp.op === 'discardGemSum') {
        st.prompts.push({ kind: 'chooseDiscard', src: srcK, chooser: owner, gemSumMin: costOp.min || 3, gemGot: 0, actions, effectDiscard: true });
        addLog(st, owner, `ทิ้งมือรวม GEM ≥ ${costOp.min || 3}`);
      } else if (costOp.op === 'returnHandToDeck') {
        st.prompts.push({ kind: 'chooseDiscard', src: srcK, chooser: owner, filter: costOp.filter, actions, toDeck: true, effectDiscard: true });
      } else if (costOp.op === 'sacrifice') {
        const filt = Object.assign({}, costOp.filter || {}, { _srcK: srcK });
        st.prompts.push({ kind: 'pick', from: 'ownAvatars', src: srcK, chooser: owner, filter: filt, dest: 'sacrifice', actions, optional: false, keepSrc: true });
      } else if (costOp.op === 'exileHell') {
        const need = costOp.count || 1;
        st.prompts.push({
          kind: 'pick', from: 'hell', src: srcK, chooser: owner, filter: {},
          dest: 'exileHellCost', need, got: 0, actions, optional: false
        });
        addLog(st, owner, `เนรเทศจากนรก ${need} ใบเพื่อจ่ายค่า`);
      } else if (costOp.op === 'exileHellDistinctNames') {
        st.prompts.push({
          kind: 'pick', from: 'hell', src: srcK, chooser: owner,
          filter: { nameIncludes: [costOp.nameIncludes].filter(Boolean) },
          dest: 'exileDistinctCost', need: costOp.count || 3, got: 0, seenNames: {},
          actions, optional: false
        });
        addLog(st, owner, `เนรเทศ "${costOp.nameIncludes}" ชื่อไม่ซ้ำ ${costOp.count || 3} จากนรก`);
      } else if (costOp.op === 'exileSelf') {
        doMove(st, srcK, owner + '.dark', null, fx);
        runActions(st, fx, actions, { src: srcK, owner, rng });
      } else runActions(st, fx, actions, { src: srcK, owner, rng });
    } else {
      runActions(st, fx, actions, { src: srcK, owner, rng });
    }
  }

  /* การ์ดในมือที่ยกเลิก Magic ได้ (ชายจากอนาคต ฯลฯ) */
  function canNegateMagicCard(st, handId) {
    const c = st.inst[handId];
    if (!c || c.type !== 'Magic') return false;
    if (abilitiesOf(c.code, 'enemyPlayMagic').length) return true;
    if ((c.name || '').includes('ชายจากอนาคต')) return true;
    if (c.subtype === 'React') {
      const act = abilitiesOf(c.code, 'activated')[0];
      if (act && (act.actions || []).some(ac => ac.op === 'negate')) return true;
      if (/ยกเลิก/.test(c.effect || '')) return true;
    }
    return false;
  }

  /* เสนอ React ยกเลิกเวทเมื่อฝ่ายตรงข้ามใช้ Magic — คืน true ถ้ามี prompt ให้ตอบ */
  function offerMagicNegateReact(st, fx, activator, magicK) {
    const opp = other(activator);
    if (!magicK || !st.inst[magicK]) return false;
    // ไม่ยกเลิกเวทยกเลิกเอง (ชายจากอนาคตซ้อนชายจากอนาคต)
    if (canNegateMagicCard(st, magicK)) return false;
    if (st.prompts.some(p => p.kind === 'react' && p.mode === 'negateMagic' && p.target === magicK)) return false;
    const options = [];
    (st.zones[opp + '.hand'] || []).forEach(m => {
      if (!canNegateMagicCard(st, m)) return;
      const c = st.inst[m];
      const sub = c.subtype || 'Normal';
      if (st.strict && st.magicUsed && st.magicUsed[opp] && st.magicUsed[opp][sub]) return;
      if (sub === 'React' && isMagicTypeUsed(st, opp, 'React')) return;
      options.push(m);
    });
    if (!options.length) return false;
    st.prompts.unshift({
      kind: 'react', mode: 'negateMagic', src: null, options, chooser: opp, target: magicK,
      actions: [], magicNegate: true, reactTrigger: 'enemyPlayMagic',
      label: `ฝ่าย ${activator} ใช้ "${nameOf(st, magicK)}"`
    });
    addLog(st, opp, `React พร้อมใช้ (${options.length} ใบ): ฝ่าย ${activator} ใช้ "${nameOf(st, magicK)}" — เลือกใบยกเลิกหรือไม่ใช้`);
    return true;
  }

  /* ทำผลเวทที่ค้างไว้หลังคู่ต่อสู้กดไม่ใช้ชายจากอนาคต */
  function resolvePendingMagic(st, fx, pend, rng) {
    if (!pend) return;
    const r = rng || (() => 0.5);
    if (pend.type === 'poorModes') {
      runActions(st, fx, [{ op: 'choosePoorModes' }], { src: pend.src, owner: pend.owner, rng: r });
      fireEnemyActivate(st, fx, pend.owner, r);
    } else if (pend.type === 'activated' && pend.actions) {
      // หลังถาม React แล้วยกเลิก — รันผลเลย (ไม่เปิดเชนถามซ้ำ)
      runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, toHellAfter: true, rng: r });
      fireEnemyActivate(st, fx, pend.owner, r);
    } else if (pend.type === 'reactActions') {
      // React อื่น (อุบัติเหตุ ฯลฯ) หลังไม่ถูกชายจากอนาคตยกเลิก
      if (pend.mode === 'destroyAttacker') {
        if (st.inst[pend.target] && (zoneOf(st, pend.target) || '').endsWith('.avatar')) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ส่ง ${nameOf(st, pend.target)} ที่ประกาศโจมตีลงนรก`);
          destroyCard(st, fx, pend.target);
        }
        if (st.pending && st.pending.atk === pend.target) { st.pending = null; addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่แล้ว'); }
      } else if (pend.actions && pend.actions.length) {
        runActions(st, fx, pend.actions, {
          src: pend.src, owner: pend.owner, target: pend.target,
          triggerSource: pend.triggerSource || pend.target, rng: r
        });
      } else if (pend.target && st.inst[pend.target] && (zoneOf(st, pend.target) || '').endsWith('.avatar')) {
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ทำลาย ${nameOf(st, pend.target)} — ส่งนรกแล้ว`);
        destroyCard(st, fx, pend.target);
      }
      if (st.strict) {
        st.magicUsed[pend.owner] = st.magicUsed[pend.owner] || {};
        const sub = (st.inst[pend.src] && st.inst[pend.src].subtype) || 'React';
        st.magicUsed[pend.owner][sub] = true;
      } else {
        markMagicTypeUsed(st, pend.owner, (st.inst[pend.src] && st.inst[pend.src].subtype) || 'React');
      }
      if (zoneOf(st, pend.src)) doMove(st, pend.src, pend.owner + '.hell', null, fx);
      fx.snd = 'clash';
      // เทคจุติ: โดนอุบัติเหตุทำลายแล้วยังรันจุติ
      if (pend.pendingSummon) resumePendingSummon(st, fx, pend.pendingSummon);
    } else if (pend.type === 'placeOnly') {
      fireEnemyActivate(st, fx, pend.owner, r);
    }
  }

  function promptTargetOk(st, k) { return promptCandidates(st, (st.prompts || [])[0]).includes(k); }

  function declareBuffs(st, atkId) {
    abil(st, atkId, 'declareAttack').forEach(ab =>
      (ab.actions || []).forEach(ac => {
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
          st.buffs.push({ k: atkId, amt: ac.amount, until: 'endOfTurn', from: atkId });
          addLog(st, 'S', `อัตโนมัติ ${nameOf(st, atkId)}: โจมตี → POWER ${ac.amount > 0 ? '+' : ''}${ac.amount} จนจบเทิร์น`);
        }
      }));
  }

  /* ผลตอนประกาศโจมตี: นิ้วเพชร(ทำลายเป้าเทพ) + Land ธรณีสูบผู้โจมตี + ใบสวม (ขวานทอง/สายฟ้า) — คืน true ถ้าเป้าถูกทำลายไปแล้ว */
  function declareEffects(st, fx, atkId, defId, rng) {
    let targetGone = false;
    const A = st.inst[atkId];
    const runDeclare = (srcK, label) => {
      abil(st, srcK, 'declareAttack').forEach(ab => {
        const cond = (ab.trigger && ab.trigger.if) || '';
        const m = cond.match(/^targetSymbol:(.+)$/);
        if (m && (!defId || !st.inst[defId] || st.inst[defId].symbol !== m[1])) return;
        if (ab.requireOwnHellNameIncludes) {
          const own = ownerOf(st, atkId);
          const ok = (st.zones[own + '.hell'] || []).some(id => nameMatches(st.inst[id], ab.requireOwnHellNameIncludes));
          if (!ok) return;
        }
        (ab.actions || []).forEach(ac => {
          if (ac.op === 'destroyTarget' && defId && st.inst[defId] && (zoneOf(st, defId) || '').endsWith('.avatar')) {
            addLog(st, 'S', `อัตโนมัติ ${label}: ทำลาย ${nameOf(st, defId)}`);
            destroyCard(st, fx, defId);
            targetGone = true; fx.snd = 'clash';
          } else if (ac.op === 'discardOppRandom') {
            const own = ownerOf(st, atkId);
            const opp = other(own);
            const hand = st.zones[opp + '.hand'] || [];
            if (!hand.length) addLog(st, 'S', `เอฟเฟกต์ ${label}: มือศัตรูว่าง`);
            else {
              const pick = hand[Math.floor((typeof rng === 'function' ? rng() : Math.random()) * hand.length)];
              addLog(st, 'S', `เอฟเฟกต์ ${label}: สุ่มทิ้งมือ ${opp} → ${nameOf(st, pick)}`);
              doMove(st, pick, opp + '.hell', null, fx);
              fx.snd = 'clash';
            }
          } else if (ac.op === 'draw') {
            const own = ownerOf(st, atkId);
            const d = st.zones[own + '.deck'];
            let n = 0;
            for (let i = 0; i < (ac.count || 1) && d.length; i++) { st.zones[own + '.hand'].push(d.pop()); n++; }
            if (n) { addLog(st, own, `เอฟเฟกต์ ${label}: จั่ว ${n} ใบ`); fx.snd = 'draw'; }
          } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
            // ตัวโจมตีเอง: declareBuffs ใส่ไปแล้ว — อย่าซ้ำ (พระนารายณ์ +2 สองรอบ)
            // ใบสวมบนตัวโจมตี: ยังใส่ได้ (บัฟจาก Mod)
            if (srcK === atkId) return;
            st.buffs.push({ k: atkId, amt: ac.amount || 0, until: 'endOfTurn', from: srcK });
            addLog(st, 'S', `อัตโนมัติ ${label}: POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0} จนจบเทิร์น`);
          }
        });
      });
    };
    runDeclare(atkId, A.name);
    for (const id in st.inst) {
      if (st.inst[id] && st.inst[id].attachedTo === atkId) runDeclare(id, st.inst[id].name);
    }
    (st.zones['land'] || []).forEach(lk => {
      abilitiesOf(st.inst[lk].code, 'anyDeclareAttack').forEach(ab => (ab.actions || []).forEach(ac => {
        if (ac.op === 'mill' && ac.who === 'attacker') {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, lk)}: ฝ่ายประกาศโจมตีธรณีสูบ ${ac.count} ใบ`);
          mill(st, fx, ownerOf(st, atkId), ac.count, rng, 0);
        }
      }));
    });
    return targetGone;
  }

  /* รัน action ของเอฟเฟกต์ */
  function runActions(st, fx, actions, ctx) {
    let prompted = false;
    (actions || []).forEach(ac => {
      if (ctx._abortActions) return;
      if (ac.op === 'draw') {
        const p = ctx.owner, d = st.zones[p + '.deck'];
        let n = 0;
        let count = ac.count || 1;
        if (ac.countPer === 'ownAttachedMods') count = Object.values(st.inst).filter(x => x.attachedTo === ctx.src).length;
        for (let i = 0; i < count && d.length; i++) { st.zones[p + '.hand'].push(d.pop()); n++; }
        addLog(st, p, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จั่ว ${n} ใบ`);
        fx.snd = 'draw';
      } else if (ac.op === 'discard') {
        // ทิ้งจากมือ (กัญญา / เอเลี่ยน) — actions/then รันหลังทิ้ง
        const p = { kind: 'chooseDiscard', src: ctx.src, chooser: ctx.owner, filter: ac.filter, actions: ac.then || ac.actions || [], optional: false, effectDiscard: true };
        const legal = promptCandidates(st, p);
        if (!legal.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดในมือให้ทิ้ง — ข้าม`);
        else { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดในมือทิ้ง 1 ใบ`); }
      } else if (ac.op === 'grantProtectSummoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          st.inst[sk].protectUntilEndTurn = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} ไม่ถูกทำลายในเทิร์นนี้`);
        }
      } else if (ac.op === 'grantProtectMagicLeaveSummoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          st.inst[sk].protectMagicLeave = true;
          st.inst[sk].protectMagicLeaveOpp = other(ctx.owner);
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} ไม่ถูกนำออกจากสนามด้วย Magic จนจบเทิร์นถัดไปของฝ่ายตรงข้าม`);
        }
      } else if (ac.op === 'grantImmuneOppMagicSummoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          st.inst[sk].immuneOppMagicUntil = { opp: other(ctx.owner) };
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} ไม่รับผล Magic ฝ่ายตรงข้าม จนจบเทิร์นถัดไปของฝ่ายตรงข้าม`);
        }
      } else if (ac.op === 'revealOwnLifeMarked') {
        const arr = st.zones[ctx.owner + '.life'] || [];
        let done = 0;
        // บน→ล่าง: จากท้ายอาร์เรย์ (ใบบนสุด)
        for (let i = arr.length - 1; i >= 0 && done < (ac.count || 1); i--) {
          const id = arr[i];
          if (st.inst[id] && !st.inst[id].faceUp) {
            st.inst[id].faceUp = true;
            st.inst[id].lifeMark = ac.mark || 'naw';
            done++;
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: หงาย LIFE "${nameOf(st, id)}" ของ ${ctx.owner}`);
          }
        }
      } else if (ac.op === 'unrevealMarkedLife') {
        const arr = st.zones[ctx.owner + '.life'] || [];
        arr.forEach(id => {
          const L = st.inst[id];
          if (L && L.lifeMark === (ac.mark || 'naw') && L.faceUp) {
            L.faceUp = false;
            delete L.lifeMark;
            addLog(st, 'S', `เอฟเฟกต์: คว่ำ LIFE ที่หงายด้วยน้องนาวกลับ`);
          }
        });
      } else if (ac.op === 'hellReturnFilter') {
        const hell = st.zones[ctx.owner + '.hell'] || [];
        const matches = hell.filter(id => matchFilterEx(st, id, ac.filter || {}));
        if (ac.required && matches.length < (ac.count || 1)) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ในนรกมีไม่ครบ ${ac.count} ใบ — ข้าม`);
          ctx._abortActions = true;
        } else {
          const take = matches.slice(0, ac.count || 1);
          take.forEach(id => doMove(st, id, ctx.owner + '.deck', null, fx));
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: คืนนรก ${take.length} ใบเข้าเด็ค`);
          if (ac.shuffleAfter) { seededShuffle(st.zones[ctx.owner + '.deck'], ctx.rng || (() => 0.5)); syncHeimdall(st); addLog(st, ctx.owner, 'สับเด็ค'); }
        }
      } else if (ac.op === 'phobiaPackage') {
        const hell = st.zones[ctx.owner + '.hell'] || [];
        const found = [];
        for (const nm of (ac.returnNames || [])) {
          const id = hell.find(x => !found.includes(x) && nameMatches(st.inst[x], nm));
          if (!id) {
            addLog(st, 'S', `จุติ โฟเบีย: ไม่ครบชิ้นหุ่นในนรก ("${nm}") — จุติไม่ทำงาน`);
            found.length = 0; break;
          }
          found.push(id);
        }
        if (found.length === (ac.returnNames || []).length) {
          found.forEach(id => doMove(st, id, ctx.owner + '.deck', null, fx));
          addLog(st, ctx.owner, `โฟเบีย: คืนชิ้นหุ่น ${found.length} ใบเข้าเด็ค`);
          const p = {
            kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner,
            filter: { nameIncludes: [ac.summonNameIncludes], costMax: ac.summonCostMax },
            dest: 'avatar', paidCost: false, shuffleAfter: true, optional: false,
            thenAttachSrc: true,
            summonedByAvatar: st.inst[ctx.src]
          };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
          else addLog(st, 'S', `โฟเบีย: ไม่พบไมเกรน Cost≤${ac.summonCostMax} ในเด็ค`);
        }
      } else if (ac.op === 'scoutTopKeepOrHandIfSameSymbolAsSummoned') {
        const d = st.zones[ctx.owner + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เด็คว่าง`);
        else {
          const top = d[d.length - 1];
          const tc = st.inst[top];
          const sk = ctx.summoned && st.inst[ctx.summoned];
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: สอดแนม "${tc.name}" (${tc.symbol || '—'})`);
          if (sk && tc.type === 'Avatar' && tc.symbol && tc.symbol === sk.symbol) {
            doMove(st, top, ctx.owner + '.hand', null, fx);
            addLog(st, ctx.owner, `Symbol ตรงกับ ${sk.name} — ขึ้นมือ`);
          } else {
            addLog(st, ctx.owner, `ไม่ตรงเงื่อนไข — ไว้ที่เดิม (ไม่สับ)`);
          }
        }
      } else if (ac.op === 'jumpScare') {
        const d = st.zones[ctx.owner + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `Jump Scare: เด็คว่าง`);
        else {
          const idx = Math.floor((typeof ctx.rng === 'function' ? ctx.rng() : Math.random()) * d.length);
          const id = d[idx];
          const tc = st.inst[id];
          addLog(st, 'S', `Jump Scare: ฝ่ายตรงข้ามสุ่มได้ "${tc.name}"`);
          if (tc.type === 'Avatar' && effCost(st, id) <= 5) {
            const qd = quotaDeny(st, ctx.owner + '.avatar', tc);
            if (qd) { doMove(st, id, ctx.owner + '.hell', null, fx); addLog(st, 'S', `ลงสนามไม่ได้ (${qd}) — ส่งนรก`); }
            else {
              doMove(st, id, ctx.owner + '.avatar', null, fx);
              addLog(st, ctx.owner, `อัญเชิญ ${tc.name} (Jump Scare — ไม่จ่าย Cost / ไม่จุติ)`);
              triggerSummon(st, fx, id, ctx.owner, { paidCost: false });
            }
          } else {
            doMove(st, id, ctx.owner + '.hell', null, fx);
            addLog(st, 'S', `"${tc.name}" ไม่ใช่ Avatar Cost≤5 — ส่งนรก`);
          }
          seededShuffle(st.zones[ctx.owner + '.deck'], ctx.rng || (() => 0.5));
          syncHeimdall(st);
          addLog(st, ctx.owner, 'สับเด็ค');
        }
      } else if (ac.op === 'becomeAvatar') {
        const c = st.inst[ctx.src];
        if (c) {
          c.type = 'Avatar';
          c.subtype = '';
          c.symbol = ac.symbol || c.symbol;
          c.cost = ac.cost != null ? ac.cost : c.cost;
          c.gem = ac.gem != null ? ac.gem : 0;
          c.power = ac.power != null ? ac.power : c.power;
          const z = zoneOf(st, ctx.src);
          if (z && z.endsWith('.magic')) doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
          else if (z && z.endsWith('.hand')) doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
          st.lockSummonExcept = { owner: ctx.owner, nameIncludes: ac.lockSummonExceptNameIncludes || 'Super Air', untilTurnEnd: true };
          addLog(st, ctx.owner, `เครื่องบิน Super Air: กลายเป็น Avatar ${c.symbol} C${c.cost}/P${c.power} — ล็อกอัญเชิญเหลือ Super Air จนจบเทิร์น`);
          triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false });
        }
      } else if (ac.op === 'summonSelfFromHell') {
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c || !z.endsWith('.hell')) addLog(st, 'S', `อัญเชิญจากนรกไม่ได้ — ไม่อยู่นรก`);
        else {
          const blk = hellSummonBlocked(st);
          if (blk) addLog(st, 'S', `อัญเชิญจากนรกไม่ได้ — ${blk}`);
          else {
            const qd = quotaDeny(st, ctx.owner + '.avatar', c);
            if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
            else {
              doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
              addLog(st, ctx.owner, `อัญเชิญ ${c.name} จากนรก (ไม่จ่าย / ไม่จุติ)`);
              triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false });
            }
          }
        }
      } else if (ac.op === 'summonSelfFromHandPaying') {
        // ฮอล: ถูกเรียกจาก React — จ่าย cost ผ่าน prompt แยก / หรือ free+noJuti ตาม ctx
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c || !z.endsWith('.hand')) addLog(st, 'S', `ฮอล: ไม่อยู่ในมือ`);
        else {
          st.prompts.push({
            kind: 'hallSummonPay', src: ctx.src, chooser: ctx.owner, optional: false,
            redirectAfter: true
          });
          prompted = true;
          addLog(st, ctx.owner, `นักรบ ฮอล: เลือก GEM จ่าย Cost ${effCost(st, ctx.src)} เพื่ออัญเชิญ (ไม่จุติ)`);
        }
      } else if (ac.op === 'redirectPendingAttackToSelf') {
        if (st.pending && st.inst[ctx.src] && (zoneOf(st, ctx.src) || '').endsWith('.avatar')) {
          st.pending.def = ctx.src; st.pending.life = null; st.pending.kind = 'battle';
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เปลี่ยนเป้าการโจมตีมาที่ตัวเอง`);
        }
      } else if (ac.op === 'attachSelfFromHell') {
        const z = zoneOf(st, ctx.src) || '';
        if (!z.endsWith('.hell')) addLog(st, 'S', `ดาบ: ไม่อยู่นรก`);
        else {
          const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || {}, dest: 'attachTo', attachMod: ctx.src, optional: false };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
          else addLog(st, 'S', `ไม่มีอัศวินให้สวมดาบ`);
        }
      } else if (ac.op === 'revealOppLifeOrWin') {
        const opp = other(ctx.owner);
        const life = st.zones[opp + '.life'] || [];
        const faceDown = life.filter(id => st.inst[id] && !st.inst[id].faceUp).length;
        if (faceDown <= (ac.winIfFaceDownLte != null ? ac.winIfFaceDownLte : 2)) {
          st.over = { winner: ctx.owner }; fx.over = ctx.owner;
          addLog(st, 'S', `รหัสดำ: LIFE คว่ำศัตรู ${faceDown} ≤ ${ac.winIfFaceDownLte} — ${ctx.owner} ชนะทันที!`);
        } else {
          let n = 0;
          for (let i = 0; i < life.length && n < (ac.count || 3); i++) {
            if (st.inst[life[i]] && !st.inst[life[i]].faceUp) {
              st.inst[life[i]].faceUp = true; n++;
              addLog(st, 'S', `รหัสดำ: หงาย LIFE "${nameOf(st, life[i])}" ของ ${opp}`);
            }
          }
        }
      } else if (ac.op === 'grantCombatImmuneAllOwn') {
        (st.zones[ctx.owner + '.avatar'] || []).forEach(id => {
          st.inst[id].combatImmuneUntilEOT = true;
        });
        addLog(st, ctx.owner, `พระคุ้มครอง: Avatar ฝ่ายเราไม่ถูกทำลายจากการต่อสู้ในเทิร์นนี้`);
      } else if (ac.op === 'renameAttachEnemy') {
        const p = {
          kind: 'pick', from: 'enemyAvatars', src: ctx.src, chooser: ctx.owner,
          filter: { type: 'Avatar' }, dest: 'renameAttach',
          renameTo: ac.renameTo || 'โอตะ',
          attachToFilter: ac.attachToFilter || { nameIncludes: ['ไอดอล'] },
          thenIfOwnNameIncludes: ac.thenIfOwnNameIncludes || null,
          optional: false
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `ทัตดนัยซัง: ไม่มี Avatar ศัตรู`);
      } else if (ac.op === 'deckPickMulti') {
        const multiMax = ac.multiMax != null ? ac.multiMax : (ac.countMax != null ? ac.countMax : 2);
        const multiMin = ac.multiMin != null ? ac.multiMin : null;
        const multiExact = ac.multiExact != null ? ac.multiExact
          : (ac.multiMin != null || ac.multiMax != null ? null : multiMax);
        const p = {
          kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'multiAvatar', multiExact, multiMin, multiMax,
          paidCost: !!ac.paidCost, shuffleAfter: !!ac.shuffleAfter, optional: true
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่พบในเด็ค`);
      } else if (ac.op === 'untapHostIfEnemyHasAvatar') {
        const host = st.inst[ctx.src] && st.inst[ctx.src].attachedTo;
        if (host && st.inst[host]) {
          const opp = other(ownerOf(st, host));
          if ((st.zones[opp + '.avatar'] || []).length) {
            st.inst[host].tapped = false;
            addLog(st, 'S', `กระบองแสง: ${nameOf(st, host)} ตื่น`);
          }
        }
      } else if (ac.op === 'exileHellDistinctNames') {
        // กินซาก: เลือกเนรเทศรัททาทุยในนรกชื่อไม่ซ้ำ กี่ใบก็ได้ → +1 ต่อใบ
        const hell = (st.zones[ctx.owner + '.hell'] || []).filter(id => matchFilterEx(st, id, ac.filter || {}));
        if (!hell.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นรกไม่มีเป้าเนรเทศ`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: ac.filter || {},
            dest: 'exileDistinctHell', optional: true, multiMax: 99, multiGot: 0,
            seenNames: {}, thenBuffSelfPer: ac.thenBuffSelfPer || 1, duration: ac.duration || 'endOfTurn'
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เนรเทศรัททาทุยชื่อไม่ซ้ำจากนรก (ข้ามเมื่อพอใจ)`);
        }
      } else if (ac.op === 'hellBuildConstructMulti') {
        const p = {
          kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner,
          filter: ac.filter || { type: 'Construct' },
          dest: 'hellBuildConstruct', optional: true, multiMax: ac.countMax || 2, multiGot: 0,
          costSumMax: ac.costSumMax != null ? ac.costSumMax : 5, costGot: 0
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ก่อสร้างจากนรกสูงสุด ${p.multiMax} ใบ Cost รวม≤${p.costSumMax}`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Construct ในนรก`);
      } else if (ac.op === 'buildSelfAsConstruct') {
        const c = st.inst[ctx.src];
        if (!c) addLog(st, 'S', `ก่อสร้างตัวเองไม่ได้`);
        else {
          const qd = quotaDeny(st, ctx.owner + '.construct', c);
          if (qd) addLog(st, 'S', `ก่อสร้างไม่ได้ (${qd})`);
          else if (zoneOf(st, ctx.src)) {
            doMove(st, ctx.src, ctx.owner + '.construct', null, fx);
            if (st.inst[ctx.src]) { st.inst[ctx.src].type = 'Construct'; st.inst[ctx.src].faceUp = true; }
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ก่อสร้างตัวเองลง Construct Zone`);
            abil(st, ctx.src, 'constructed').forEach(ab => runActions(st, fx, ab.actions, { src: ctx.src, owner: ctx.owner, rng: ctx.rng }));
            fx.snd = 'place';
          } else addLog(st, 'S', `ก่อสร้างไม่ได้ — การ์ดไม่อยู่ในโซน`);
        }
      } else if (ac.op === 'sacrificeSelf') {
        if (st.inst[ctx.src] && (zoneOf(st, ctx.src) || '').endsWith('.avatar')) {
          addLog(st, ctx.owner, `เซ่นไหว้ ${nameOf(st, ctx.src)}`);
          destroyCard(st, fx, ctx.src, { ignoreProtect: true });
        }
      } else if (ac.op === 'showHandBuildConstruct') {
        const ids = (st.zones[ctx.owner + '.hand'] || []).filter(id => matchFilterEx(st, id, ac.filter || { type: 'Construct' }));
        if (!ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Construct ในมือให้ก่อสร้าง`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner,
            filter: ac.filter || {}, dest: 'buildConstructFree', optional: false, allowAnyZone: true
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: แสดง Construct จากมือแล้วก่อสร้าง (ไม่จ่าย Cost)`);
        }
      } else if (ac.op === 'discardAnyThenSummon') {
        const hand = (st.zones[ctx.owner + '.hand'] || []).filter(id => id !== ctx.src && matchFilterEx(st, id, ac.discardFilter || {}));
        if (!hand.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีรัททาทุยในมือให้ทิ้ง`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: hand, src: ctx.src, chooser: ctx.owner,
            filter: ac.discardFilter || {}, dest: 'discardSumCostSummon', optional: true,
            multiMax: 99, multiGot: 0, costSum: 0, allowAnyZone: true,
            summonFilter: ac.summonFilter || {}, shuffleAfter: !!ac.shuffleAfter, paidCost: false
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทิ้งรัททาทุยกี่ใบก็ได้ แล้วอัญเชิญ Cost≤ผลรวม (ฟรี ไม่จุติ)`);
        }
      } else if (ac.op === 'handSummon') {
        const ids = (st.zones[ctx.owner + '.hand'] || []).filter(id => matchFilterEx(st, id, ac.filter || { type: 'Avatar' }));
        if (!ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ในมือตรงเงื่อนไข`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner,
            filter: ac.filter || {}, dest: 'avatar', paidCost: !!ac.paidCost, optional: true, allowAnyZone: true
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์: อัญเชิญจากมือ (ฟรี ไม่จุติ)`);
        }
      } else if (ac.op === 'schedule') {
        st.scheduled.push({
          player: ctx.owner, when: ac.when || 'nextOwnMainPhase',
          op: 'runActions', actions: ac.actions || [], src: ctx.src
        });
        addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นัดทำผลใน ${ac.when || 'nextOwnMainPhase'}`);
      } else if (ac.op === 'chooseMode') {
        st.prompts.push({ kind: 'chooseMode', src: ctx.src, chooser: ctx.owner, optional: false, options: ac.options || [] });
        prompted = true;
        addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกปฏิบัติ`);
      } else if (ac.op === 'grantBuffSummoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          st.buffs.push({ k: sk, amt: ac.amount || 0, until: ac.duration === 'permanent' ? 'permanent' : 'endOfTurn' });
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${ac.duration === 'permanent' ? '' : ' จนจบเทิร์น'}`);
        }
      } else if (ac.op === 'blockReactUntilCombatEnd') {
        // นางอัปสร: ตั้งตอนประกาศโจมตี — ใช้กับ pending หลังสร้าง
        ctx._blockReact = true;
      } else if (ac.op === 'scoutOppTop') {
        // เก๊าท์: เปิดใบบนสุดเด็คศัตรู — Avatar → นรก, อื่น → ใต้เด็ค
        const opp = other(ctx.owner);
        const d = st.zones[opp + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เด็คฝ่ายตรงข้ามว่าง`);
        else {
          const top = d[d.length - 1];
          const tc = st.inst[top];
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: สอดแนมเด็ค ${opp} → "${tc.name}" (${tc.type})`);
          if (tc.type === 'Avatar') {
            doMove(st, top, opp + '.hell', null, fx);
            addLog(st, 'S', `"${tc.name}" เป็น Avatar — ส่งนรก`);
            fx.snd = 'clash';
          } else {
            doMove(st, top, opp + '.deck', 'bottom', fx);
            addLog(st, 'S', `"${tc.name}" ไม่ใช่ Avatar — ไว้ใต้เด็ค`);
          }
        }
      } else if (ac.op === 'peekOwnTop') {
        // อิสานโนซอรัส: เปิด 1 ใบบนเด็ค เลือกอยู่บนหรือใต้
        const d = st.zones[ctx.owner + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เด็คว่าง`);
        else {
          const top = d[d.length - 1];
          st.prompts.push({ kind: 'peekTop', src: ctx.src, chooser: ctx.owner, card: top, optional: false });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: สอดแนม "${nameOf(st, top)}" — เลือกไว้บนหรือใต้เด็ค`);
        }
      } else if (ac.op === 'hellPickMulti') {
        // ภูเวียง: เลือกจากนรกสูงสุด N ใบกลับเด็ค แล้วจั่ว + บัฟ
        const p = {
          kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'hellMultiDeck', optional: true, multiMax: ac.countMax || 4, multiGot: 0,
          thenDraw: ac.thenDraw || 0, buffPer: ac.buffPer || 0, shuffleAfter: true,
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกจากนรกสูงสุด ${p.multiMax} ใบกลับเด็ค (ข้ามได้เมื่อพอใจ)`); }
        else {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดในนรก — จั่วอย่างเดียว`);
          if (ac.thenDraw) runActions(st, fx, [{ op: 'draw', count: ac.thenDraw }], { src: ctx.src, owner: ctx.owner, rng: ctx.rng });
        }
      } else if (ac.op === 'coinDestroyChoose') {
        // เอเลี่ยนแสงสีฟ้า: เลือก Avatar ศัตรู → ทอยเหรียญ หัวทำลายเป้า / ก้อยทำลายตัวเอง
        const p = { kind: 'pick', from: 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' }, dest: 'coinDestroy', optional: false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar ฝ่ายตรงข้าม แล้วทอยเหรียญ`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ฝ่ายตรงข้าม`);
      } else if (ac.op === 'rpsDestroy') {
        // ฉุบสั่งตาย: เป่ายิ้งฉุบทั้งสองฝ่าย → ผู้ชนะเลือกทำลาย Avatar (ข้ามกันทำลาย)
        st.prompts.push({
          kind: 'rps', src: ctx.src, chooser: ctx.owner, picks: {},
          seconds: ac.seconds || 10, ignoreProtect: true, srcToHell: !!ctx.toHellAfter,
        });
        prompted = true;
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เป่ายิ้งฉุบ! ทั้งสองฝ่ายเลือกภายใน ${ac.seconds || 10} วินาที`);
      } else if (ac.op === 'mill') {
        const who = ac.who === 'both' ? ['A', 'B'] : ac.who === 'opp' ? [other(ctx.owner)] : [ctx.owner];
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${ac.who === 'both' ? 'ทั้งสองฝ่าย' : (ac.who === 'opp' ? other(ctx.owner) : ctx.owner)}ธรณีสูบ ${ac.count} ใบ`);
        who.forEach(p => mill(st, fx, p, ac.count || 1, ctx.rng, 0, ctx.src));
      } else if (ac.op === 'drawHellUnique') {
        const hell = st.zones[ctx.owner + '.hell'] || [];
        const names = new Set();
        hell.forEach(id => {
          const c = st.inst[id];
          if (c && c.type === 'Avatar' && (!ac.symbol || c.symbol === ac.symbol)) names.add(c.name);
        });
        const n = names.size >= (ac.threshold || 5) ? (ac.countAtLeast || 2) : (ac.countBelow || 1);
        const d = st.zones[ctx.owner + '.deck'];
        let got = 0;
        for (let i = 0; i < n && d.length; i++) { st.zones[ctx.owner + '.hand'].push(d.pop()); got++; }
        addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จั่ว ${got} ใบ (นรกชื่อไม่ซ้ำ ${names.size})`);
        fx.snd = 'draw';
      } else if (ac.op === 'destroyAllAvatarsExceptSelf') {
        ['A', 'B'].forEach(side => {
          (st.zones[side + '.avatar'] || []).slice().forEach(id => {
            if (id === ctx.src) return;
            destroyCard(st, fx, id);
          });
        });
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย Avatar ทั้งสนามยกเว้นตัวเอง`);
        fx.snd = 'clash';
      } else if (ac.op === 'exileSelf') {
        if (zoneOf(st, ctx.src)) {
          const own = ownerOf(st, ctx.src);
          doMove(st, ctx.src, (own === 'S' ? ctx.owner : own) + '.dark', null, fx);
          addLog(st, ctx.owner, `เนรเทศ ${nameOf(st, ctx.src)}`);
        }
      } else if (ac.op === 'summonSelfFromHandFree') {
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c || !z.endsWith('.hand')) addLog(st, 'S', `อัญเชิญจากมือไม่ได้`);
        else {
          const qd = quotaDeny(st, ctx.owner + '.avatar', c);
          if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
          else {
            doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
            addLog(st, ctx.owner, `อัญเชิญ ${c.name} จากมือ (ความสามารถพิเศษ)`);
            if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false });
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'naraiFormSummon') {
        const cands = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ac.sacrificeNameIncludes || 'พระนารายณ์'));
        if (!cands.length) addLog(st, 'S', `ไม่มีพระนารายณ์บนสนามให้ส่งนรก`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: cands, src: ctx.src, chooser: ctx.owner,
            dest: 'naraiSacSummon', then: ac.then || [], optional: false, allowAnyZone: true
          });
          prompted = true;
          addLog(st, ctx.owner, `เลือกพระนารายณ์ส่งนรก เพื่ออัญเชิญ ${nameOf(st, ctx.src)}`);
        }
      } else if (ac.op === 'scoutNaraiExile') {
        const n = ac.count || 2;
        const deck = st.zones[ctx.owner + '.deck'] || [];
        const ids = deck.slice(-Math.min(n, deck.length)).reverse();
        if (!ids.length) addLog(st, 'S', `สอดแนมไม่ได้`);
        else {
          const sum = ids.reduce((s, id) => s + (+st.inst[id].cost || 0), 0);
          const enemies = (st.zones[other(ctx.owner) + '.avatar'] || []).filter(id => (+st.inst[id].cost || 0) <= sum);
          if (!enemies.length) {
            addLog(st, ctx.owner, `สอดแนม ${ids.length} ใบ (รวม Cost ${sum}) — ไม่มีเป้าเนรเทศ → เก็บไว้บนเด็ค`);
          } else {
            ids.forEach(id => {
              st.zones[ctx.owner + '.deck'] = st.zones[ctx.owner + '.deck'].filter(x => x !== id);
              st.zones[ctx.owner + '.hand'].push(id);
            });
            addLog(st, ctx.owner, `สอดแนม ${ids.length} ใบขึ้นมือ (รวม Cost ${sum}) — เลือกเนรเทศศัตรู Cost ≤ ${sum}`);
            st.prompts.push({ kind: 'pick', from: 'ids', ids: enemies, src: ctx.src, chooser: ctx.owner, dest: 'dark', optional: false, allowAnyZone: true });
            prompted = true;
          }
        }
      } else if (ac.op === 'replaceSelfWithHellNarai') {
        if ((zoneOf(st, ctx.src) || '').endsWith('.avatar')) {
          doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
          const hell = (st.zones[ctx.owner + '.hell'] || []).filter(id => st.inst[id] && nameMatches(st.inst[id], 'พระนารายณ์') && id !== ctx.src);
          if (!hell.length) addLog(st, 'S', `End Phase: ไม่มีพระนารายณ์ในนรก`);
          else {
            st.prompts.push({ kind: 'pick', from: 'ids', ids: hell, src: ctx.src, chooser: ctx.owner, dest: 'avatar', paidCost: false, optional: false, allowAnyZone: true });
            prompted = true;
            addLog(st, ctx.owner, `End Phase: เลือกพระนารายณ์จากนรกอัญเชิญแทน`);
          }
        }
      } else if (ac.op === 'replaceLandFromDeck') {
        const lands = (st.zones['land'] || []).slice();
        if (!lands.length) addLog(st, 'S', `ไม่มี Land ให้ทำลาย`);
        else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: lands, src: ctx.src, chooser: ctx.owner, dest: 'jackReplaceLand', optional: false, allowAnyZone: true });
          prompted = true;
          addLog(st, ctx.owner, `แมลงปอแจ็ค: เลือก Land ทำลาย แล้วเล่น Land จากเด็ค`);
        }
      } else if (ac.op === 'attachOtaToIdol') {
        const idols = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], 'ไอดอล'));
        if (!idols.length) addLog(st, 'S', `ไม่มีไอดอลให้สวม`);
        else {
          const hasTat = (st.zones[ctx.owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ac.allowDeckIfNameIncludes || 'ทัตดนัยซัง'));
          st.prompts.push({ kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: { nameIncludes: ['ไอดอล'] }, dest: 'mayuraHost', optional: false, allowDeckOta: !!hasTat });
          prompted = true;
          addLog(st, ctx.owner, `มยุราซัง: เลือกไอดอลที่จะสวมโอตะ${hasTat ? ' (เลือกจากเด็คได้)' : ' จากนรก'}`);
        }
      } else if (ac.op === 'evolveToMigraineKeepAttach') {
        const mods = Object.keys(st.inst).filter(id => st.inst[id] && st.inst[id].attachedTo === ctx.src);
        doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
        const deck = st.zones[ctx.owner + '.deck'] || [];
        const mig = deck.find(id => (st.inst[id].name || '') === 'หุ่นนักรบผู้กล้า : ไมเกรน');
        if (!mig) addLog(st, 'S', `ไม่มีไมเกรนในเด็ค`);
        else {
          doMove(st, mig, ctx.owner + '.avatar', null, fx);
          mods.forEach(id => { st.inst[id].attachedTo = mig; });
          addLog(st, ctx.owner, `โปรโตไมเกรน → อัญเชิญจุติ ไมเกรน (ย้ายของสวม ${mods.length} ใบ)`);
          triggerSummon(st, fx, mig, ctx.owner, { paidCost: true });
          const darr = st.zones[ctx.owner + '.deck'];
          for (let i = darr.length - 1; i > 0; i--) { const j = Math.floor((ctx.rng || Math.random)() * (i + 1)); [darr[i], darr[j]] = [darr[j], darr[i]]; }
        }
      } else if (ac.op === 'grantAttackAllEnemy') {
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'grantAttackAll', until: ac.until || 'endOfTurn', optional: false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `ไม่มีไมเกรนให้มอบท่าไม้ตาย`);
      } else if (ac.op === 'allowExtraWeaponMod') {
        st._weaponModExtra = st._weaponModExtra || {};
        st._weaponModExtra[ctx.owner] = { left: ac.count || 2, onlyNameIncludes: 'อาวุธหุ่นนักรบผู้กล้า', turnSeq: st.turnSeq };
        addLog(st, ctx.owner, `ซีทันยาน: เทิร์นนี้ใช้ Mod "อาวุธหุ่นนักรบผู้กล้า" ได้ ${ac.count || 2} ใบ`);
      } else if (ac.op === 'negateByGiveHand') {
        const hand = st.zones[ctx.owner + '.hand'] || [];
        if (!hand.length) addLog(st, 'S', `คนรวย: ไม่มีมือให้ยื่น`);
        else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: hand.slice(), src: ctx.src, chooser: ctx.owner, dest: 'giveHandNegate', optional: true, allowAnyZone: true });
          prompted = true;
          addLog(st, ctx.owner, `คนรวย: เลือกการ์ดในมือยื่นเพื่อยกเลิก (นับเป็น React)`);
        }
      } else if (ac.op === 'destroyAllEnemyAvatars') {
        const opp = other(ctx.owner);
        const targets = (st.zones[opp + '.avatar'] || []).slice();
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย Avatar ฝั่ง ${opp} ทั้งหมด (${targets.length} ใบ)`);
        targets.forEach(t => destroyCard(st, fx, t));
        fx.snd = 'clash';
      } else if (ac.op === 'destroy' || ac.op === 'destroyTarget') {
        let tgt = null;
        if (ac.target && ac.target.select === 'triggerSource') tgt = ctx.triggerSource || ctx.target;
        else if (ac.target && ac.target.select === 'self') tgt = ctx.src;
        else if (ctx.target) tgt = ctx.target;
        if (tgt && st.inst[tgt] && zoneOf(st, tgt)) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย ${nameOf(st, tgt)}`);
          destroyCard(st, fx, tgt); fx.snd = 'clash';
        } else if (ac.target && ac.target.select === 'choose') {
          const side = ac.target.side === 'enemy' ? 'enemyAvatars' : ac.target.side === 'own' ? 'ownAvatars' : 'allAvatars';
          const filt = Object.assign({}, ac.target);
          delete filt.select; delete filt.side; delete filt.count;
          const p = { kind: 'pick', from: side, src: ctx.src, chooser: ctx.owner, filter: filt, dest: 'destroy', optional: !!ac.optional };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือก Avatar ทำลาย`); }
          else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าทำลาย`);
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าทำลาย`);
      } else if (ac.op === 'scoutAttachOta') {
        const n = ac.scout || 5;
        const deck = st.zones[ctx.owner + '.deck'] || [];
        const ids = deck.slice(-Math.min(n, deck.length)).reverse();
        const otas = ids.filter(id => nameMatches(st.inst[id], 'โอตะ'));
        const rest = ids.filter(id => !otas.includes(id));
        ids.forEach(id => { st.zones[ctx.owner + '.deck'] = st.zones[ctx.owner + '.deck'].filter(x => x !== id); });
        const maxO = ac.maxOta || 2;
        const take = otas.slice(0, maxO);
        take.forEach(id => st.zones[ctx.owner + '.hand'].push(id)); // temp then attach
        const leftoverOta = otas.slice(maxO);
        rest.concat(leftoverOta).forEach(id => st.zones[ctx.owner + '.deck'].unshift(id));
        if (!take.length) addLog(st, 'S', `สอดแนม ${n}: ไม่มีโอตะ`);
        else {
          addLog(st, ctx.owner, `สอดแนม ${n}: พบโอตะ ${otas.length} ใบ — สวมสูงสุด ${maxO}`);
          st.prompts.push({
            kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner,
            filter: { nameIncludes: ['ไอดอล'] }, dest: 'scoutOtaHost', otaIds: take, optional: false
          });
          prompted = true;
        }
        seededShuffle(st.zones[ctx.owner + '.deck'], ctx.rng || (() => 0.5));
      } else if (ac.op === 'hellAttachMods') {
        const hell = (st.zones[ctx.owner + '.hell'] || []).filter(id => {
          const c = st.inst[id];
          return c && (c.subtype === 'Modification' || c.type === 'Magic') && nameMatches(c, ac.nameIncludes || 'อาวุธ');
        });
        if (!hell.length) addLog(st, 'S', `นรกไม่มีอาวุธให้สวม`);
        else {
          const host = ac.toSelf ? ctx.src : null;
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: hell, src: ctx.src, chooser: ctx.owner,
            dest: 'hellAttachMulti', hostFixed: host, multiMax: ac.max || 2, multiGot: 0, optional: true, allowAnyZone: true
          });
          prompted = true;
          addLog(st, ctx.owner, `เลือกอาวุธจากนรกสวมสูงสุด ${ac.max || 2} (ข้ามได้)`);
        }
      } else if (ac.op === 'grantBattleDestroyLifeHit') {
        if (st.inst[ctx.src]) {
          st.inst[ctx.src].battleDestroyLifeHitUntilEOT = true;
          addLog(st, ctx.owner, `${nameOf(st, ctx.src)}: ฆ่าแล้วโจมตี LIFE ได้ 1 ครั้ง จนจบเทิร์น`);
        }
      } else if (ac.op === 'hellAttachAllDistinctWeaponMods') {
        const hosts = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ac.toNameIncludes || 'ไมเกรน'));
        if (!hosts.length) addLog(st, 'S', `ไม่มีไมเกรนบนสนาม`);
        else {
          const seen = {};
          const hell = (st.zones[ctx.owner + '.hell'] || []).filter(id => {
            const c = st.inst[id];
            if (!c || !nameMatches(c, 'อาวุธหุ่นนักรบผู้กล้า')) return false;
            if (seen[c.name]) return false;
            seen[c.name] = true;
            return true;
          });
          let n = 0;
          hell.forEach(mod => {
            if (equipOnto(st, mod, hosts[0])) { n++; fireWeaponModAttached(st, fx, mod, ctx.rng); }
          });
          addLog(st, ctx.owner, `THE END จากนรก: สวมอาวุธชื่อไม่ซ้ำ ${n} ใบให้ ${nameOf(st, hosts[0])}`);
        }
      } else if (ac.op === 'untapHost') {
        const host = st.inst[ctx.src] && st.inst[ctx.src].attachedTo;
        if (host && st.inst[host]) { st.inst[host].tapped = false; addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ตื่น ${nameOf(st, host)}`); }
      } else if (ac.op === 'returnSelfToDeck') {
        if (zoneOf(st, ctx.src)) {
          doMove(st, ctx.src, ctx.owner + '.deck', ac.pos === 'bottom' ? 'bottom' : null, fx);
          if (ac.shuffle) seededShuffle(st.zones[ctx.owner + '.deck'], ctx.rng || (() => 0.5));
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: กลับเด็ค${ac.pos === 'bottom' ? ' (ใต้กอง)' : ''}${ac.shuffle ? 'แล้วสับ' : ''}`);
        }
      } else if (ac.op === 'bounce') {
        const p = { kind: 'pick', from: ac.from === 'own' ? 'ownAvatars' : ac.from === 'any' ? 'allAvatars' : 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'bounceHand', optional: !!ac.optional, srcToHell: !!ctx.toHellAfter };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าให้นำขึ้นมือ`);
      } else if (ac.op === 'pick') {
        const from = ac.from === 'own' ? 'ownAvatars' : ac.from === 'enemy' ? 'enemyAvatars' : ac.from === 'any' ? 'allAvatars' : 'ownAvatars';
        const p = {
          kind: 'pick', from, src: ctx.src, chooser: ctx.owner, filter: ac.filter || {},
          dest: ac.dest || 'bounceHand', optional: !ac.required, then: ac.then || null, srcToHell: !!ctx.toHellAfter
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`);
          if (ac.required) ctx._abortActions = true;
        }
      } else if (ac.op === 'returnToHand') {
        // บังคับคืนขึ้นมือโดยไม่ต้องเลือก (ใช้กับตัวเอง) หรือเลือก
        if (ac.target === 'self' || (ac.target && ac.target.select === 'self')) {
          if (zoneOf(st, ctx.src)) { doMove(st, ctx.src, ctx.owner + '.hand', null, fx); addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: กลับขึ้นมือ`); }
        } else {
          const p = { kind: 'pick', from: ac.from === 'own' ? 'ownAvatars' : ac.from === 'any' ? 'allAvatars' : 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'bounceHand', optional: !!ac.optional, srcToHell: !!ctx.toHellAfter };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
          else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าให้นำขึ้นมือ`);
        }
      } else if (ac.op === 'sacrifice' && !ctx._asCost) {
        // เซ่นไหว้เป็นผลของเอฟเฟกต์ (อ๊บ / พระพรหม) — then = ผลหลังเซ่น
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' }, dest: 'sacrificeOnly', optional: false, then: ac.then || null };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar เซ่นไหว้`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ให้เซ่นไหว้`);
      } else if (ac.op === 'revealOwnLife') revealOwnLife(st, ctx.owner, ac.count || 1);
      else if (ac.op === 'unrevealOwnLife') unrevealOwnLife(st, ctx.owner, ac.count || 1);
      else if (ac.op === 'counterSelf') {
        if (st.inst[ctx.src]) { st.inst[ctx.src].counters += ac.amount || 1; addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เคาน์เตอร์ +${ac.amount || 1}`); }
      } else if (ac.op === 'sacrificeSelf') {
        if (st.inst[ctx.src] && zoneOf(st, ctx.src)) { addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เซ่นไหว้ตัวเอง (ลงนรก)`); destroyCard(st, fx, ctx.src); }
      } else if (ac.op === 'destroySelfAtEndPhase') {
        st.scheduled.push({ player: st.active, op: 'destroyCard', k: ctx.src, when: 'endPhase' });
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จะถูกทำลายช่วง End Phase`);
      } else if (ac.op === 'grantKeyword') {
        const p = { kind: 'pick', from: ac.from === 'any' ? 'allAvatars' : 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' }, dest: 'grantKeyword', keyword: ac.keyword || 'สามัคคี', until: ac.until || ac.duration || 'endOfTurn', optional: false, srcToHell: !!ctx.toHellAfter };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ให้รับ "${ac.keyword}"`);
      } else if (ac.op === 'curseEnemy') {
        const p = { kind: 'pick', from: 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' }, dest: 'curse', symbol: ac.symbol || 'ผี', powerMod: ac.powerMod != null ? ac.powerMod : -2, optional: false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar ศัตรูติดคำสาป`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`);
      } else if (ac.op === 'switchControl') {
        const from = zoneOf(st, ctx.src);
        if (from && from.endsWith('.avatar')) {
          const toP = other(from[0]);
          const qd = quotaDeny(st, toP + '.avatar', st.inst[ctx.src]);
          if (qd) addLog(st, 'S', `${nameOf(st, ctx.src)} ย้ายฝั่งไม่ได้ (${qd})`);
          else {
            doMove(st, ctx.src, toP + '.avatar', null, fx);
            st.inst[ctx.src].cannotAttack = true;
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ย้ายไปฝั่ง ${toP} — สั่งโจมตีไม่ได้`);
          }
        }
      } else if (ac.op === 'grantDraculaRevive') {
        if (st.inst[ctx.src]) { st.inst[ctx.src].draculaRevive = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ได้ความสามารถฟื้นจากนรกเทิร์นหน้า`); }
      } else if (ac.op === 'oppHellToBottom') {
        const opp = other(ctx.owner);
        const pool = (st.zones[opp + '.hell'] || []).filter(x => matchFilterEx(st, x, ac.filter));
        if (!pool.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นรกฝ่ายตรงข้ามว่าง — ข้าม`);
        else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: pool, src: ctx.src, chooser: ctx.owner, dest: 'oppDeckBottom', then: ac.then || null, optional: true });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดจากนรกศัตรูลงใต้เด็ค`);
        }
      } else if (ac.op === 'grantCostPower') {
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'grantCostPower', costDelta: ac.costDelta || 1, powerDelta: ac.powerDelta || 1, optional: false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`);
      } else if (ac.op === 'returnHandToDeck') {
        const p = { kind: 'chooseDiscard', src: ctx.src, chooser: ctx.owner, filter: ac.filter, actions: ac.then || ac.actions || [], optional: false, effectDiscard: true, toDeck: true };
        if (!promptCandidates(st, p).length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดในมือ`);
        else { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดในมือคืนเด็ค`); }
      } else if (ac.op === 'pickSymbolRandomHand') {
        st.prompts.push({ kind: 'pickSymbol', src: ctx.src, chooser: ctx.owner, srcToHell: !!ctx.toHellAfter, optional: false });
        prompted = true;
        addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Symbol แล้วสุ่มมือศัตรู`);
      } else if (ac.op === 'bothReturnAvatar') {
        if (!(st.zones['A.avatar'] || []).length || !(st.zones['B.avatar'] || []).length)
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ใช้ไม่ได้ — ต้องมี Avatar ทั้งสองฝ่าย`);
        else {
          st.prompts.push({ kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, dest: 'bothReturn', optional: false, srcToHell: !!ctx.toHellAfter });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar ฝ่ายเรากลับใต้เด็ค`);
        }
      } else if (ac.op === 'destroyOtaOnIdol') {
        let found = null, host = null;
        for (const id in st.inst) {
          const m = st.inst[id];
          if (!m || !m.attachedTo || !nameMatches(m, 'โอตะ')) continue;
          const h = st.inst[m.attachedTo];
          if (h && nameMatches(h, 'ไอดอล') && ownerOf(st, m.attachedTo) === ctx.owner) { found = id; host = m.attachedTo; break; }
        }
        if (!found) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีโอตะสวมไอดอล`);
        else {
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย ${nameOf(st, found)} ที่สวม ${nameOf(st, host)}`);
          st.inst[found].attachedTo = null;
          destroyCard(st, fx, found, { ignoreProtect: true });
          const p = { kind: 'chooseDestroy', src: ctx.src, chooser: ctx.owner, filter: {}, zones: ['avatar', 'magic', 'construct', 'land'], optional: false, srcToHell: !!ctx.toHellAfter };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        }
      } else if (ac.op === 'modifyPower' && ac.target && (ac.target.select === 'attacker' || ac.target.select === 'foe')) {
        const tgt = ac.target.select === 'attacker' ? ctx.attacker : ctx.foe;
        if (tgt && st.inst[tgt]) {
          const until = ac.duration === 'combat' ? 'combat' : (ac.duration === 'permanent' ? 'permanent' : 'endOfTurn');
          st.buffs.push({ k: tgt, amt: ac.amount || 0, until, from: ctx.src });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, tgt)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${until === 'combat' ? ' จนจบการต่อสู้' : until === 'permanent' ? ' ถาวร' : ' จนจบเทิร์น'} → P${effPower(st, tgt)}`);
        }
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
        if (st.inst[ctx.src]) {
          const until = ac.duration === 'oppNextEnd' ? 'oppNextEnd' : (ac.duration === 'permanent' ? 'permanent' : (ac.duration === 'combat' ? 'combat' : 'endOfTurn'));
          const buff = { k: ctx.src, amt: ac.amount || 0, until, from: ctx.src };
          if (until === 'oppNextEnd') buff.opp = other(ctx.owner);
          st.buffs.push(buff);
          if ((ac.amount || 0) > 0) notePowerBuff(st, ctx.src, ac.amount);
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${until === 'oppNextEnd' ? ' จน End Phase ถัดไปของฝ่ายตรงข้าม' : until === 'permanent' ? ' ถาวร' : until === 'combat' ? ' จนจบการต่อสู้' : ' จนจบเทิร์น'} → P${effPower(st, ctx.src)}`);
        }
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'summoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          const until = ac.duration === 'permanent' ? 'permanent' : (ac.duration === 'combat' ? 'combat' : 'endOfTurn');
          st.buffs.push({ k: sk, amt: ac.amount || 0, until, from: ctx.src });
          if ((ac.amount || 0) > 0) notePowerBuff(st, sk, ac.amount);
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${until === 'permanent' ? '' : ' จนจบเทิร์น'}`);
        }
      } else if (ac.op === 'bounceTappedToDeckDraw') {
        const ids = [];
        ['A', 'B'].forEach(side => (st.zones[side + '.avatar'] || []).forEach(id => {
          if (st.inst[id] && st.inst[id].tapped) ids.push(id);
        }));
        if (!ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar นอน`);
        else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner, filter: {}, dest: 'bounceTappedDeckDraw', optional: false, srcToHell: !!ctx.toHellAfter, allowAnyZone: true });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar นอนกลับเด็ค แล้วเจ้าของจั่ว 1`);
        }
      } else if (ac.op === 'markModUsed') {
        st.magicUsed = st.magicUsed || { A: {}, B: {} };
        st.magicUsed[ctx.owner] = st.magicUsed[ctx.owner] || {};
        st.magicUsed[ctx.owner]['Modification'] = true;
        addLog(st, ctx.owner, `นับว่าใช้ Modification Magic แล้วในเทิร์นนี้`);
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'all') {
        const side = ac.target.side, sides = side === 'own' ? [ctx.owner] : side === 'enemy' ? [other(ctx.owner)] : ['A', 'B'];
        let cnt = 0;
        sides.forEach(s => (st.zones[s + '.avatar'] || []).forEach(k => {
          if ((!ac.target.type || st.inst[k].type === ac.target.type) && (!ac.target.symbol || st.inst[k].symbol === ac.target.symbol)) { st.buffs.push({ k, amt: ac.amount || 0, until: 'endOfTurn', from: ctx.src }); cnt++; }
        }));
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0} กับ ${cnt} ตัว จนจบเทิร์น`);
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'choose') {
        const p = { kind: 'chooseBuff', src: ctx.src, chooser: ctx.owner, amt: ac.amount, side: (ac.target.side) || 'any', ftype: ac.target.type || 'Avatar', fsymbol: ac.target.symbol || '', srcToHell: !!ctx.toHellAfter, destroyAtEnd: !!ac.destroyAtEnd, until: ac.duration === 'permanent' ? 'permanent' : 'endOfTurn' };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าหมายให้เลือก — ข้าม`);
      } else if (ac.op === 'chooseDestroy') {
        const p = { kind: 'chooseDestroy', src: ctx.src, chooser: ctx.owner, filter: ac.filter, zones: ac.zones, side: ac.side || null, srcToHell: !!ctx.toHellAfter, optional: !!ac.optional };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าหมายให้ทำลาย — ข้าม`);
      } else if (ac.op === 'bothReshuffleHandDraw') {
        const n = ac.count || 4;
        ['A', 'B'].forEach(side => {
          const hand = st.zones[side + '.hand'] || [];
          while (hand.length) {
            const id = hand.pop();
            st.zones[side + '.deck'].push(id);
          }
          seededShuffle(st.zones[side + '.deck'], ctx.rng || (() => 0.5));
          let got = 0;
          const d = st.zones[side + '.deck'];
          for (let i = 0; i < n && d.length; i++) { st.zones[side + '.hand'].push(d.pop()); got++; }
          addLog(st, side, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: คืนมือเข้าเด็ค สับ แล้วจั่ว ${got} ใบ`);
        });
        syncHeimdall(st);
        fx.snd = 'draw';
      } else if (ac.op === 'grandRumble') {
        const all = [...(st.zones['A.avatar'] || []), ...(st.zones['B.avatar'] || [])];
        if (all.length !== 6) { addLog(st, 'S', `Grand Rumble ใช้ได้เมื่อ Avatar รวม 6 ใบ (ตอนนี้ ${all.length})`); return; }
        const nums = [1, 2, 3, 4, 5, 6];
        // สุ่มสลับเลขแล้วติดตามลำดับสนาม (UI กำหนดเองทำภายหลัง)
        for (let i = nums.length - 1; i > 0; i--) {
          const j = Math.floor((ctx.rng ? ctx.rng() : Math.random()) * (i + 1));
          [nums[i], nums[j]] = [nums[j], nums[i]];
        }
        const map = {};
        all.forEach((id, i) => {
          map[id] = nums[i];
          addLog(st, 'S', `🎲 ${nameOf(st, id)} = เลข ${nums[i]}`);
        });
        const roll = 1 + Math.floor((ctx.rng ? ctx.rng() : Math.random()) * 6);
        addLog(st, 'S', `ทอยลูกเต๋า: ออก ${roll}`);
        all.forEach(id => {
          if (map[id] !== roll) {
            addLog(st, 'S', `ทำลาย ${nameOf(st, id)} (เลข ${map[id]})`);
            destroyCard(st, fx, id, { ignoreProtect: true });
          } else addLog(st, 'S', `${nameOf(st, id)} รอด (เลข ${roll})`);
        });
        fx.snd = 'clash';
      } else if (ac.op === 'swapCostPowerCombat') {
        const p = { kind: 'pick', from: 'ids', ids: [], src: ctx.src, chooser: ctx.owner, dest: 'swapCombat', optional: false, srcToHell: !!ctx.toHellAfter };
        if (st.pending) {
          if (st.pending.atk) p.ids.push(st.pending.atk);
          if (st.pending.def) p.ids.push(st.pending.def);
        }
        if (p.ids.length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือก Avatar ที่กำลังต่อสู้ เพื่อสลับ Cost↔POWER`); }
        else addLog(st, 'S', `ไม่มี Avatar ที่กำลังต่อสู้`);
      } else if (ac.op === 'alienEnvoy') {
        const p = {
          kind: 'pick', from: 'ownHand', src: ctx.src, chooser: ctx.owner,
          filter: { type: 'Avatar' }, dest: 'alienReveal', optional: true,
          revealed: [], excludeIds: []
        };
        if (promptCandidates(st, p).length) {
          st.prompts.push(p); prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: แสดง Avatar ในมือกี่ใบก็ได้ (แตะทีละใบ) แล้วกดข้ามเมื่อพอใจ`);
        } else {
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ในมือ — แสดง 0 ใบ`);
          finishAlienReveal(st, fx, p);
          prompted = !!(st.prompts || []).length;
        }
      } else if (ac.op === 'scout') {
        let count = ac.count || 5;
        if (cardSymbols(st, ctx.src).includes('กะปอม') && (zoneOf(st, ctx.src) || '').endsWith('.avatar')) {
          (st.zones[ctx.owner + '.avatar'] || []).forEach(id => {
            const e = EFFECTS[(st.inst[id] || {}).code];
            if (e && e.scoutBonusOwnKapom) count += e.scoutBonusOwnKapom;
          });
        }
        let ids = (st.zones[ctx.owner + '.deck'] || []).slice(-Math.min(count, (st.zones[ctx.owner + '.deck'] || []).length)).reverse();
        if (!ids.length) { addLog(st, 'S', `สอดแนมไม่ได้ — เด็คหมด`); return; }
        // คนแก่ฯ: ถูกสอดแนมโดยผู้รู้ความจริง → อัญเชิญ (ไม่จุติ)
        {
          const kept = [];
          ids.forEach(id => {
            const e = EFFECTS[(st.inst[id] || {}).code];
            if (e && e.summonWhenScoutedByNameIncludes && nameMatches(st.inst[ctx.src], e.summonWhenScoutedByNameIncludes)) {
              const qd = quotaDeny(st, ctx.owner + '.avatar', st.inst[id]);
              if (qd) { kept.push(id); return; }
              doMove(st, id, ctx.owner + '.avatar', null, fx);
              addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, id)}: ถูกสอดแนมโดย ${nameOf(st, ctx.src)} → อัญเชิญลงสนาม (ไม่จุติ)`);
              triggerSummon(st, fx, id, ctx.owner, { paidCost: !!e.summonWhenScoutedPaidCost });
              fx.snd = 'place';
            } else kept.push(id);
          });
          ids = kept;
        }
        // เมฟิสโต / THE END: ถูกสอดแนมโดยชื่อที่กำหนด → ขึ้นมือ
        {
          const kept = [];
          ids.forEach(id => {
            const e = EFFECTS[(st.inst[id] || {}).code];
            const byName = e && (e.addToHandWhenScoutedByNameIncludes || e.addToHandWhenMilledOrScoutedByNameIncludes);
            if (byName && nameMatches(st.inst[ctx.src], byName)) {
              doMove(st, id, ctx.owner + '.hand', null, fx);
              addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, id)}: ถูกสอดแนมโดย ${nameOf(st, ctx.src)} → ขึ้นมือ`);
              fx.snd = 'draw';
            } else kept.push(id);
          });
          ids = kept;
        }
        // ยุคกาฬสินธุ์ฯ: ถ้าสอดแนมโดย Avatar กะปอม → วาง Land จากเด็คทันที
        if (cardSymbols(st, ctx.src).includes('กะปอม')) {
          const kept = [];
          ids.forEach(id => {
            const e = EFFECTS[(st.inst[id] || {}).code];
            if (e && e.placeLandWhenScoutedByKapom) {
              clearLandZoneFor(st, fx, id);
              doMove(st, id, 'land', null, fx);
              st.inst[id].faceUp = true;
              st.inst[id].controller = ctx.owner;
              addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, id)}: ถูกสอดแนมโดยกะปอม → วางบน Land Zone จากเด็ค`);
              fx.snd = 'place';
            } else kept.push(id);
          });
          ids = kept;
        }
        if (!ids.length) { addLog(st, ctx.owner, `สอดแนมเสร็จ`); return; }
        addLog(st, ctx.owner, `สอดแนม ${ids.length} ใบจากบนเด็ค`);
        const scoutSum = ids.reduce((s, id) => s + effCost(st, id), 0);
        if (ac.dest === 'nongSam' && ac.buffFromNameIncludes) {
          let add = 0;
          ids.forEach(id => { if (nameMatches(st.inst[id], ac.buffFromNameIncludes)) add += (+(st.inst[id].power) || 0); });
          if (add) {
            st.inst[ctx.src].powerDelta = (st.inst[ctx.src].powerDelta || 0) + add;
            notePowerBuff(st, ctx.src, add);
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: POWER +${add} ถาวร → P${effPower(st, ctx.src)}`);
          }
        }
        if (ac.thenDestroyEnemyCostSumLte) {
          addLog(st, ctx.owner, `ผลรวม Cost ที่สอดแนม = ${scoutSum} — เลือกทำลายศัตรู Cost ≤ ${scoutSum} (2 ใบสอดแนมยังอยู่บนเด็ค — เรียงเองได้)`);
          const dp = {
            kind: 'chooseDestroy', src: ctx.src, chooser: ctx.owner,
            filter: { type: 'Avatar', costMax: scoutSum },
            zones: ['avatar'], side: 'enemy', optional: true
          };
          if (promptCandidates(st, dp).length) { st.prompts.push(dp); prompted = true; }
          else addLog(st, 'S', `ไม่มี Avatar ศัตรู Cost ≤ ${scoutSum}`);
        } else {
          const pickFilter = (ac.dest === 'nongSam' && ac.buffFromNameIncludes)
            ? Object.assign({}, ac.filter || {}, { nameIncludes: [ac.buffFromNameIncludes] })
            : ac.filter;
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner, filter: pickFilter,
            dest: ac.dest === 'nongSam' ? 'hand' : (ac.dest || 'hand'),
            restTo: ac.restTo === 'choose' ? 'bottom' : (ac.restTo || 'bottom'),
            shuffleAfter: !!ac.shuffleAfter,
            optional: ac.multiExact ? false : true, srcToHell: !!ctx.toHellAfter, paidCost: !!ac.paidCost,
            thenIfFound: ac.thenIfFound || null, thenIfColor: ac.thenIfColor || null,
            attacker: ctx.attacker || null,
            summonCostMax: ac.summonCostMax != null ? ac.summonCostMax : null,
            multiExact: ac.multiExact || null, multiMax: ac.multiMax || null,
            summonedByAvatar: (st.inst[ctx.src] && st.inst[ctx.src].type === 'Avatar') ? st.inst[ctx.src] : null
          });
          prompted = true;
        }
      } else if (ac.op === 'deckPick') {
        const p = { kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: ac.dest || 'hand', shuffleAfter: !!ac.shuffleAfter, optional: true, srcToHell: !!ctx.toHellAfter, paidCost: !!ac.paidCost };
        if (promptCandidates(st, p).length) {
          addLog(st, ctx.owner, `ค้นหาการ์ดในเด็คด้วยเอฟเฟกต์ ${nameOf(st, ctx.src)}`);
          st.prompts.push(p); prompted = true;
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในเด็ค`);
      } else if (ac.op === 'hellPick') {
        let filter = Object.assign({}, ac.filter || {});
        if (ctx.sacrificed) {
          if (filter.sameSymbolAs === 'sacrificed') { filter.symbol = ctx.sacrificed.symbol; delete filter.sameSymbolAs; }
          if (filter.nameNot === 'sacrificed') { filter.nameNotEquals = ctx.sacrificed.name; delete filter.nameNot; }
        }
        const p = { kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter, dest: ac.dest || 'hand', optional: true, paidCost: !!ac.paidCost };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดจากนรก`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในนรก`);
      } else if (ac.op === 'summon') {
        // อัญเชิญการ์ดตรงเงื่อนไขจากเด็ค/นรก ลงสนาม (เลือกเป้าผ่าน prompt)
        const p = { kind: 'pick', from: ac.from === 'hell' ? 'hell' : 'deckAll', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'avatar', shuffleAfter: ac.from !== 'hell', optional: true };
        if (promptCandidates(st, p).length) { addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดอัญเชิญ`); st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขให้อัญเชิญ`);
      } else if (ac.op === 'summonToken') {
        // อัญเชิญ Token (ตัวแทน Avatar) ลง Avatar Zone ฝ่ายเรา — ระบุ ชื่อ/POWER/จำนวน/Symbol
        const want = ac.count || 1; let made = 0;
        for (let i = 0; i < want; i++) {
          if (quotaDeny(st, ctx.owner + '.avatar', { type: 'Avatar', symbol: ac.symbol || '', isToken: true })) break;
          const id = mkToken(st, ctx.owner, { name: ac.name || 'Token', power: ac.power != null ? ac.power : (ac.amount || 0), symbol: ac.symbol || '', color: ac.color || '' });
          st.zones[ctx.owner + '.avatar'].push(id); made++;
        }
        if (made) { addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: อัญเชิญ Token "${ac.name || 'Token'}" (P${ac.power != null ? ac.power : (ac.amount || 0)}) ${made} ตัว`); fx.snd = 'place'; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: อัญเชิญ Token ไม่ได้ — Avatar Zone เต็ม (รวมไม่เกิน 6)`);
      } else if (ac.op === 'takeControl') {
        const p = { kind: 'pick', from: 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'takeControl', optional: true, until: ac.until || 'endOfTurn', keepTapped: ac.keepTapped !== false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ฝ่ายตรงข้ามให้ยึด`);
      } else if (ac.op === 'exile') {
        if (ac.target === 'self') { if (zoneOf(st, ctx.src)) { doMove(st, ctx.src, ctx.owner + '.dark', null, fx); addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เนรเทศตัวเองลงมิติมืด`); } }
        else { const p = { kind: 'pick', from: ac.from === 'own' ? 'ownAvatars' : ac.from === 'any' ? 'allAvatars' : 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'dark', optional: true };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าให้เนรเทศ`); }
      } else if (ac.op === 'tap' || ac.op === 'untap') {
        if (ac.target === 'self') { if (st.inst[ctx.src]) { st.inst[ctx.src].tapped = (ac.op === 'tap'); addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${ac.op === 'tap' ? 'นอน' : 'ตื่น'}ตัวเอง`); } }
        else if (ac.target === 'triggerSource' || (ac.target && ac.target.select === 'triggerSource')) {
          const t = ctx.triggerSource || ctx.target;
          if (t && st.inst[t]) { st.inst[t].tapped = (ac.op === 'tap'); addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${ac.op === 'tap' ? 'นอน' : 'ตื่น'} ${nameOf(st, t)}`); }
        } else { const p = { kind: 'pick', from: ac.from === 'enemy' ? 'enemyAvatars' : ac.from === 'any' ? 'allAvatars' : 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: ac.op, optional: true };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`); }
      } else if (ac.op === 'negate') {
        if (st.chain && st.chain.length) { st.chain[st.chain.length - 1].negated = true; addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: 🚫 ยกเลิกความสามารถบนสุดของเชน`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีความสามารถบนเชนให้ยกเลิก`);
      } else if (ac.op === 'destroyAttacker') {
        // React: ทำลายตัวที่ประกาศโจมตี (ctx.attacker) — ต้องยังอยู่ใน Avatar Zone
        const atk = ctx.attacker;
        if (atk && st.inst[atk] && (zoneOf(st, atk) || '').endsWith('.avatar')) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ส่ง ${nameOf(st, atk)} ที่ประกาศโจมตีลงนรก`);
          destroyCard(st, fx, atk); ctx.attackerKilled = true; fx.snd = 'clash';
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีผู้โจมตีให้ทำลาย`);
      } else if (ac.op === 'weakenAttacker') {
        // React: ลด POWER ผู้โจมตี — amount คงที่ (กรอกในเอดิเตอร์) หรือ per × จำนวนการ์ดตามแหล่ง (JSON) ไม่นับตัวเวทสวนเอง
        const atk = ctx.attacker;
        if (atk && st.inst[atk]) {
          let amt, note = '';
          if (ac.amount != null && ac.count == null) amt = -Math.abs(ac.amount);
          else { let n = 0; (ac.count || ['ownSide']).forEach(s => n += countSource(st, ctx.owner, s, ctx.src)); amt = -(ac.per || 1) * n; note = ` (นับ ${n} ใบ)`; }
          st.buffs.push({ k: atk, amt: amt, until: ac.until || 'endOfTurn', from: ctx.src });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, atk)} POWER ${amt}${note} → เหลือ P${effPower(st, atk)}`);
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีผู้โจมตีให้ลดพลัง`);
      } else if (ac.op === 'cancelAttackByRestAlly') {
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, dest: 'cancelAttackRest', optional: true, requireUntapped: true };
        const cands = promptCandidates(st, p).filter(id => st.inst[id] && !st.inst[id].tapped);
        if (!cands.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar อื่นให้นอนยกเลิกการโจมตี`);
        else {
          st.prompts.push(p);
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar อื่นนอนเพื่อยกเลิกการโจมตี (หรือข้าม)`);
        }
      } else if (ac.op === 'attach') {
        if (ac.from === 'self' || !ac.from) {
          // สวมใส่การ์ดต้นทาง (ctx.src เป็น Modification) → เลือก Avatar ฝ่ายเรา
          // งานจับมือ: ถ้ามีเป้าโจมตีเป็นไอดอล → สวมให้ใบนั้นก่อน
          if (ctx.target && st.inst[ctx.target] && matchFilterEx(st, ctx.target, ac.targetFilter || {})) {
            const mod = ctx.src;
            if (st.inst[mod] && equipOnto(st, mod, ctx.target)) {
              addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: สวมใส่ ${nameOf(st, mod)} ให้ ${nameOf(st, ctx.target)}`);
              fireWeaponModAttached(st, fx, mod, ctx.rng);
            }
          } else {
            const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.targetFilter, dest: 'attachTo', attachMod: ctx.src, optional: true };
            if (promptCandidates(st, p).length) { addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar สวมใส่`); st.prompts.push(p); prompted = true; }
            else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ให้สวมใส่`);
          }
        } else {
          // ดึง Modification จากนรก/เด็ค แล้วเลือก Avatar สวม (2 ขั้น)
          // ถ้าระบุ nameIncludes ใน filter และมี ctx.target ที่ตรง targetFilter → สวมให้เป้าเลยถ้าเจอใบเดียว?
          const filter = Object.assign({ subtype: 'Modification' }, ac.filter || {});
          // Avatar จากนรก (โอตะ) — ไม่ใช่แค่ Modification
          const filt2 = Object.assign({}, ac.filter || {});
          const p = { kind: 'pick', from: ac.from === 'deck' ? 'deckAll' : 'hell', src: ctx.src, chooser: ctx.owner, filter: filt2, dest: 'pickAttachHost', hostFilter: ac.targetFilter, optional: true, preferHost: ctx.target || null };
          if (promptCandidates(st, p).length) { addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดมาสวมใส่`); st.prompts.push(p); prompted = true; }
          else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดให้สวมใส่`);
        }
      } else if (ac.op === 'detachSummonSelf') {
        // โอตะ: จากสภาพสวมใส่ → ลง Avatar Zone
        const c = st.inst[ctx.src];
        if (!c || !c.attachedTo) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่ได้อยู่ในสภาพสวมใส่`);
        else {
          c.attachedTo = null;
          const qd = quotaDeny(st, ctx.owner + '.avatar', c);
          if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
          else if (zoneOf(st, ctx.src)) {
            doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: อัญเชิญจากสภาพสวมใส่ลงสนาม`);
            fx.snd = 'place';
          } else {
            st.zones[ctx.owner + '.avatar'].push(ctx.src);
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: อัญเชิญจากสภาพสวมใส่ลงสนาม`);
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'destroySidesIfPrimePower') {
        ['A', 'B'].forEach(side => {
          const sum = (st.zones[side + '.avatar'] || []).reduce((n, id) => n + effPower(st, id), 0);
          if (isPrime(sum)) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ฝ่าย ${side} รวม POWER = ${sum} (จำนวนเฉพาะ) → ทำลายทั้งหมด`);
            (st.zones[side + '.avatar'] || []).slice().forEach(id => destroyCard(st, fx, id, { ignoreProtect: true }));
            fx.snd = 'clash';
          } else addLog(st, 'S', `ฝ่าย ${side} รวม POWER = ${sum} — ไม่ใช่จำนวนเฉพาะ`);
        });
      } else if (ac.op === 'optionalDiscardUntapSelf') {
        const hand = st.zones[ctx.owner + '.hand'] || [];
        if (!hand.length) addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีมือทิ้งเพื่อตื่น`);
        else {
          st.prompts.push({
            kind: 'chooseDiscard', src: ctx.src, chooser: ctx.owner, filter: {},
            actions: [{ op: 'untap', target: 'self' }], effectDiscard: true, optional: true
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทิ้งมือ 1 ใบเพื่อตื่น (หรือข้าม)`);
        }
      } else if (ac.op === 'attachPayCard') {
        // โอตะตัวกะปอม: ถูกทิ้งเป็น Cost ให้ไอดอล → สวมใส่ไอดอล (prefer ใบที่เพิ่งอัญเชิญ)
        const payK = ctx.payK;
        if (!payK || !st.inst[payK]) addLog(st, 'S', `ไม่มีใบจ่าย Cost ให้สวม`);
        else {
          const filt = ac.filter || {};
          const summoned = ctx.summoned;
          if (summoned && st.inst[summoned] && matchFilterEx(st, summoned, filt) && equipOnto(st, payK, summoned)) {
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, payK)}: สวมใส่ให้ ${nameOf(st, summoned)}`);
            fireWeaponModAttached(st, fx, payK, ctx.rng);
            fx.snd = fx.snd || 'place';
            fx.attach = fx.attach || { mod: payK, host: summoned };
          } else {
            const p = { kind: 'pick', from: 'ownAvatars', src: payK, chooser: ctx.owner, filter: filt, dest: 'attachTo', attachMod: payK, optional: true };
            if (promptCandidates(st, p).length) {
              st.prompts.push(p); prompted = true;
              addLog(st, ctx.owner, `เลือกไอดอลที่จะสวม ${nameOf(st, payK)} (หรือข้าม)`);
            } else addLog(st, 'S', `ไม่มีไอดอลให้สวม`);
          }
        }
      } else if (ac.op === 'attachSelfTo') {
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'attachTo', attachMod: ctx.src, optional: true };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือก Avatar "รถถัง" ที่จะสวม ${nameOf(st, ctx.src)}`); }
        else addLog(st, 'S', `ไม่มีรถถังให้สวม`);
      } else if (ac.op === 'scoutOneTopOrHell') {
        const d = st.zones[ctx.owner + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `เด็คว่าง — สอดแนมไม่ได้`);
        else {
          const id = d[d.length - 1];
          st.prompts.push({ kind: 'peekTop', card: id, src: ctx.src, chooser: ctx.owner, optional: false, allowHell: true });
          prompted = true;
          addLog(st, ctx.owner, `สอดแนม 1 ใบ: "${nameOf(st, id)}" — ไว้บนเด็ค หรือส่งนรก`);
        }
      } else if (ac.op === 'revealDeckThenTop') {
        const p = { kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner, filter: {}, dest: 'revealThenTop', shuffleAfter: true, optional: false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือกการ์ดจากเด็คแสดง แล้วสับ วางใบนั้นบนสุด`); }
        else addLog(st, 'S', `เด็คว่าง`);
      } else if (ac.op === 'choosePoorModes') {
        const myLifeUp = (st.zones[ctx.owner + '.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
        const oppLifeUp = (st.zones[other(ctx.owner) + '.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
        const both = myLifeUp >= 4 && myLifeUp > oppLifeUp;
        const filt = { type: 'Avatar', costMax: 5, excludeOnly: true };
        const hellAct = { op: 'hellPick', filter: filt, dest: 'hand' };
        const deckAct = { op: 'deckPick', filter: filt, dest: 'hand', shuffleAfter: true };
        const hellOk = promptCandidates(st, { kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: filt, dest: 'hand' }).length > 0;
        const deckOk = promptCandidates(st, { kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner, filter: filt, dest: 'hand' }).length > 0;
        if (both) {
          addLog(st, ctx.owner, `ไลฟ์หงาย ${myLifeUp} > ศัตรู ${oppLifeUp} → ทำทั้งจากนรกและจากเด็ค`);
          const acts = [];
          if (hellOk) acts.push(hellAct); else addLog(st, 'S', `ไม่มี Avatar Cost≤5 ในนรก`);
          if (deckOk) acts.push(deckAct); else addLog(st, 'S', `ไม่มี Avatar Cost≤5 ในเด็ค`);
          if (acts.length) runActions(st, fx, acts, { src: ctx.src, owner: ctx.owner, rng: ctx.rng });
          prompted = !!(st.prompts || []).length;
        } else {
          const options = [];
          if (hellOk) options.push({ label: 'จากนรก — Avatar Cost≤5 ขึ้นมือ (ยกเว้น Only)', actions: [hellAct] });
          if (deckOk) options.push({ label: 'จากเด็ค — Avatar Cost≤5 ขึ้นมือ (ยกเว้น Only) แล้วสับ', actions: [deckAct] });
          if (!options.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar Cost≤5 ในนรกหรือเด็ค`);
          else if (options.length === 1) {
            addLog(st, ctx.owner, `มีแหล่งเดียว: ${options[0].label}`);
            runActions(st, fx, options[0].actions, { src: ctx.src, owner: ctx.owner, rng: ctx.rng });
            prompted = !!(st.prompts || []).length;
          } else {
            st.prompts.push({ kind: 'chooseMode', src: ctx.src, chooser: ctx.owner, optional: false, options });
            prompted = true;
            addLog(st, ctx.owner, `เลือกปฏิบัติ: จากนรก หรือจากเด็ค`);
          }
        }
      } else if (ac.op === 'cancelAttack') {
        if (st.pending) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ยกเลิกการโจมตีของ ${nameOf(st, st.pending.atk)} (ใบอื่นยังโจมตีได้)`);
          st.pending = null;
        }
      } else if (ac.op === 'nullifyTriggerAvatarUntilEOT') {
        const t = ctx.triggerSource || ctx.target;
        if (t && st.inst[t]) {
          st.inst[t].nullifyUntilEOT = true;
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, t)} สูญเสียความสามารถจนจบเทิร์น — ความสามารถที่กำลังใช้ถูกยกเลิก`);
        }
        if (st._pendingAbility) st._pendingAbility.cancelled = true;
        if (st.chain && st.chain.length) {
          st.chain[st.chain.length - 1].negated = true;
          addLog(st, 'S', `🚫 ยกเลิกความสามารถบนเชน`);
        }
      } else if (ac.op === 'bothDestroyOneMod') {
        const modsA = [], modsB = [];
        for (const id in st.inst) {
          const m = st.inst[id];
          if (!m || m.subtype !== 'Modification' || !m.attachedTo) continue;
          const ow = ownerOf(st, m.attachedTo);
          if (ow === 'A') modsA.push(id); else if (ow === 'B') modsB.push(id);
        }
        if (!modsA.length || !modsB.length) addLog(st, 'S', `ลดราคาล้นตลาด: ต้องมี Mod สวมทั้งสองฝ่าย`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: modsA.concat(modsB), src: ctx.src, chooser: ctx.owner,
            dest: 'saleModPick', optional: false, allowAnyZone: true, salePicked: [], saleNeedA: true, saleNeedB: true
          });
          prompted = true;
          addLog(st, ctx.owner, `ลดราคาล้นตลาด: เลือก Mod ฝ่ายละ 1 ใบส่งนรก`);
        }
      } else if (ac.op === 'whoIsCooler') {
        startWhoIsCooler(st, fx, ctx);
        prompted = !!(st.prompts || []).length;
      }
    });
    if (ctx.toHellAfter && !prompted) {
      if (zoneOf(st, ctx.src)) doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
    }
  }

  function isMagicTypeUsed(st, player, mtype) {
    return !!(st.magicUsed && st.magicUsed[player] && st.magicUsed[player][mtype]);
  }
  function markMagicTypeUsed(st, player, mtype) {
    st.magicUsed = st.magicUsed || { A: {}, B: {} };
    st.magicUsed[player] = st.magicUsed[player] || {};
    st.magicUsed[player][mtype] = true;
  }
  /* จุติ/เอฟเฟกต์ตอนอัญเชิญ — เรียกหลัง React ดักอัญเชิญ (อุบัติเหตุ) จบ; จุติยังทำงานแม้โดนทำลายแล้ว */
  function runAvatarSummonedAbilities(st, fx, k, owner, opts) {
    opts = opts || {};
    const c = st.inst[k]; if (!c) return;
    abil(st, k, 'summoned').forEach(ab => {
      if (ab.trigger && ab.trigger.if === 'paidCost' && !opts.paidCost) return;
      if (ab.trigger && ab.trigger.if === 'paidExact' && !opts.paidExact) return;
      if (ab.requireOwnNameIncludes) {
        const ok = (st.zones[owner + '.avatar'] || []).some(id => id !== k && nameMatches(st.inst[id], ab.requireOwnNameIncludes)
          && (!ab.requireOwnSymbol || st.inst[id].symbol === ab.requireOwnSymbol));
        if (!ok) { addLog(st, 'S', `จุติ ${nameOf(st, k)}: ไม่มี "${ab.requireOwnNameIncludes}"${ab.requireOwnSymbol ? ' (' + ab.requireOwnSymbol + ')' : ''} บนสนาม — ข้าม`); return; }
      }
      if (!opts._skipReact && (opts.paidCost || opts.paidExact) && ab.keyword === 'จุติ' && offerAbilityReact(st, fx, owner, k, { type: 'summoned', k, owner, opts: Object.assign({}, opts, { _onlyAb: ab }) })) {
        st._pendingAbility = { type: 'activate', actions: ab.actions, src: k, owner };
        return;
      }
      runActions(st, fx, ab.actions, { src: k, owner, toHellAfter: false, rng: fx._rng });
    });
    {
      const e = EFFECTS[c.code];
      if (e && e.destroyEnemyAnyOnSummonedByAvatarNameIncludes && opts.summonedByAvatar
          && nameMatches(opts.summonedByAvatar, e.destroyEnemyAnyOnSummonedByAvatarNameIncludes)) {
        const p = { kind: 'chooseDestroy', src: k, chooser: owner, filter: {}, zones: ['avatar', 'magic', 'construct', 'land'], side: 'enemy', optional: false };
        if (promptCandidates(st, p).length) {
          st.prompts.push(p);
          addLog(st, owner, `เอฟเฟกต์ ${c.name}: ถูกอัญเชิญโดยอัศวิน — เลือกทำลายการ์ดฝ่ายตรงข้าม 1 ใบ`);
        }
      }
    }
  }
  function resumePendingSummon(st, fx, ps) {
    if (!ps || !ps.k) return;
    if (!st.inst[ps.k]) return;
    const z = zoneOf(st, ps.k) || '';
    // เทคจุติ: โดนอุบัติเหตุทำลายแล้วยังทำงาน (อาจอยู่นรกแล้ว)
    if (!z.endsWith('.avatar') && !z.endsWith('.hell') && !z.endsWith('.dark')) return;
    if (z.endsWith('.hell') || z.endsWith('.dark'))
      addLog(st, 'S', `จุติ ${nameOf(st, ps.k)}: ยังทำงานหลังโดนอุบัติเหตุ`);
    runAvatarSummonedAbilities(st, fx, ps.k, ps.owner, Object.assign({}, ps.opts || {}, { _skipReact: true }));
  }

  function triggerSummon(st, fx, k, owner, opts) {
    opts = opts || {};
    const c = st.inst[k];
    let deferSummoned = false;
    if (c.type === 'Avatar') {
      const opp = other(owner);
      // React ประเภทละ 1 ครั้ง/เทิร์น — บังคับเสมอ (กันอุบัติเหตุครั้งที่ 2)
      const options = collectReactOptions(st, opp, 'avatarSummoned');
      if (options.length) {
        const rab = abilitiesOf(st.inst[options[0]].code, 'avatarSummoned')[0];
        // รอ React (อุบัติเหตุ) ก่อน — จุติรันหลัง React จบ (แม้โดนทำลายแล้วยังทำงาน)
        st.prompts.push({
          kind: 'react', mode: (rab && rab.mode) || 'runActions', src: null, options, chooser: opp, target: k,
          actions: (rab && rab.actions) || [{ op: 'destroy', target: { select: 'triggerSource' } }],
          pendingSummon: { k, owner, opts: Object.assign({}, opts) },
          reactTrigger: 'avatarSummoned',
          label: `${nameOf(st, k)} อัญเชิญลงสนาม`
        });
        deferSummoned = true;
        addLog(st, opp, `React พร้อมใช้ (${options.length} ใบ): มี Avatar อัญเชิญ — แตะใบที่กะพริบเขียว หรือกดไม่ใช้`);
      } else if (isMagicTypeUsed(st, opp, 'React') && (st.zones[opp + '.hand'] || []).some(m => {
        const mc = st.inst[m];
        return mc && mc.type === 'Magic' && mc.subtype === 'React' && abilitiesOf(mc.code, 'avatarSummoned').length;
      })) {
        addLog(st, 'S', `React ดักอัญเชิญ: ฝ่าย ${opp} ใช้เวทประเภท React ไปแล้วในเทิร์นนี้ — ข้าม`);
      }
    }
    // Construct: เมื่อก่อสร้าง (ลง Construct Zone) — เช่น รังรักรัททาทุย เรียก C1G1P1 จากเด็ค
    if (c.type === 'Construct' && (zoneOf(st, k) || '').endsWith('.construct')) {
      abil(st, k, 'constructed').forEach(ab => {
        runActions(st, fx, ab.actions || [], { src: k, owner, toHellAfter: false, rng: fx._rng });
      });
    }
    if (!deferSummoned) runAvatarSummonedAbilities(st, fx, k, owner, opts);
  }

  /* ── ระบบเชน (chain) ── เวท/เอฟเฟกต์ที่ใช้ → ถ้าฝ่ายตรงข้ามมีเวทยกเลิก/ตอบโต้ได้ ค่อยเปิดหน้าต่างเชน ไม่งั้น resolve ทันที */
  function canRespondOnChain(st, player) {
    return (st.zones[player + '.hand'] || []).some(k => {
      const c = st.inst[k];
      if (!c || c.type !== 'Magic') return false;
      // React ยกเลิกเวท (enemyActivate / negate) หรือ activated ที่เป็น negate
      if (abilitiesOf(c.code, 'enemyActivateAbility').length) return true;
      const act = abilitiesOf(c.code, 'activated')[0];
      if (act && (act.actions || []).some(ac => ac.op === 'negate')) return true;
      // BT01-041 ชายจากอนาคต = React เมื่อใช้ Magic — เก็บเป็น activated/react flag ใน JSON ภายหลัง
      if (c.subtype === 'React' && /ยกเลิก/.test(c.effect || '')) return true;
      return false;
    });
  }
  function enterChainOrResolve(st, fx, link) {
    // link = { src, owner, actions }
    if (st.strict && canRespondOnChain(st, other(link.owner))) {
      st.chain.push({ src: link.src, owner: link.owner, actions: link.actions, negated: false });
      st.chainPri = other(link.owner);
      addLog(st, link.owner, `⛓️ ${nameOf(st, link.src)} เข้าเชน — ฝ่าย ${st.chainPri} ตอบโต้ได้ (เล่นเวท/ยกเลิก) หรือกดผ่าน`);
      fx.snd = 'place';
    } else {
      runActions(st, fx, link.actions, { src: link.src, owner: link.owner, toHellAfter: true, rng: fx._rng });
    }
  }
  function resolveChain(st, fx, rng) {
    st.chainPri = null;
    const chain = st.chain; st.chain = [];
    if (chain.length > 1) addLog(st, 'S', `เชนตัดสิน — ทำงานจากบนลงล่าง (${chain.length} ลิงก์)`);
    for (let i = chain.length - 1; i >= 0; i--) {
      const link = chain[i];
      if (link.negated) {
        addLog(st, 'S', `${nameOf(st, link.src)} ถูกยกเลิก — ไม่ทำงาน`);
        if (zoneOf(st, link.src)) doMove(st, link.src, link.owner + '.hell', null, fx);
        continue;
      }
      runActions(st, fx, link.actions, { src: link.src, owner: link.owner, toHellAfter: true, rng });
    }
  }

  /* ยิง trigger "ศัตรูใช้ความสามารถ" — เมื่อผู้เล่น activator ใช้ความสามารถ (เวท) → Avatar ฝ่ายตรงข้าม auto ตอบสนอง
     ไม่วนลูป: รันผ่าน runActions ซึ่งไม่เรียก playMagic/chooseMode ต่อ */
  function fireEnemyActivate(st, fx, activator, rng) {
    const opp = other(activator);
    (st.zones[opp + '.avatar'] || []).slice().forEach(k => {
      abil(st, k, 'enemyActivateAbility').forEach(ab => {
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: ตอบสนองการใช้ความสามารถของฝ่าย ${activator}`);
        runActions(st, fx, ab.actions, { src: k, owner: opp, rng: rng });
      });
    });
  }

  /* React response window: สรุปผลการ์ดสวนหลัง prompt (เลือกเป้า) เสร็จ — เคลียร์การโจมตี + ทิ้ง React ลงนรก
     เรียกจาก post-hook ท้าย applyAction เมื่อ st.prompts ว่างและมี st.reactCleanup ค้าง */
  function finishReactCleanup(st, fx) {
    const rc = st.reactCleanup; if (!rc) return;
    st.reactCleanup = null;
    if (!rc.attackerKilled && st.pending && st.inst[rc.atk] && (zoneOf(st, rc.atk) || '').endsWith('.avatar') && effPower(st, rc.atk) <= 0)
      addLog(st, 'S', `${nameOf(st, rc.atk)} POWER เหลือ 0 — การโจมตีถูกสลาย`);
    st.pending = null;
    if (zoneOf(st, rc.src)) doMove(st, rc.src, rc.owner + '.hell', null, fx); // React ลงนรกหลังเลือกเป้าครบ
    addLog(st, 'S', 'การ์ดสวนทำงานครบ — จบการโจมตี');
    fx.snd = 'clash';
  }

  /* เติมมือให้ถึงขั้นต่ำ — เรียกเฉพาะตอนเริ่มเทิร์นของผู้เล่นคนนั้น (ไม่เติมทันทีกลางเทิร์น) */
  function refillHand(st, fx, p) {
    const h = st.zones[p + '.hand'], d = st.zones[p + '.deck'];
    if (!h || !d) return;
    let n = 0;
    while (h.length < HAND_MIN && d.length) { const k = d.pop(); h.push(k); n++; fx.drawn = k; }
    if (n) addLog(st, p, `มือต่ำกว่า ${HAND_MIN} — จั่วเติม ${n} ใบ (ต้นเทิร์น)`);
  }

  /* onFight (พาหะ ฯลฯ): ใส่ตอนประกาศโจมตี — เคารพ duration จาก JSON (permanent / combat / endOfTurn) */
  function applyOnFightBuffs(st, atkId, defId) {
    if (!atkId || !defId) return;
    const untilOf = (ac) => ac.duration === 'permanent' ? 'permanent' : (ac.duration === 'endOfTurn' ? 'endOfTurn' : 'combat');
    const untilLabel = (u) => u === 'permanent' ? ' ถาวร' : u === 'endOfTurn' ? ' จนจบเทิร์น' : ' จนจบการต่อสู้';
    const applyFight = (fighter, foe) => {
      abil(st, fighter, 'onFight').forEach(ab => (ab.actions || []).forEach(ac => {
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
          const until = untilOf(ac);
          st.buffs.push({ k: fighter, amt: ac.amount || 0, until, from: fighter });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, fighter)}: ${nameOf(st, fighter)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${untilLabel(until)} → P${effPower(st, fighter)}`);
        }
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'foe' && foe) {
          const until = untilOf(ac);
          st.buffs.push({ k: foe, amt: ac.amount || 0, until, from: fighter });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, fighter)}: ${nameOf(st, foe)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${untilLabel(until)} → P${effPower(st, foe)}`);
        }
        if (ac.op === 'lockPowerPrinted' && ac.target && ac.target.select === 'foe' && foe) {
          st.buffs.push({ k: foe, lockPrinted: true, until: 'combat', from: fighter });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, fighter)}: ล็อก POWER ตั้งต้นของ ${nameOf(st, foe)} จนจบการต่อสู้`);
        }
      }));
    };
    applyFight(atkId, defId);
    applyFight(defId, atkId);
  }
  /* ไพรมอล ฯลฯ: เสนอสั่งใช้ whenAttacking หลังประกาศโจมตี (เซ่นแล้วตื่น) */
  function offerWhenAttacking(st, atkId) {
    const c = st.inst[atkId]; if (!c) return false;
    const ab = abilitiesOf(c.code, 'activated').find(x => x.whenAttacking);
    if (!ab) return false;
    const owner = ownerOf(st, atkId);
    if (!owner || (owner !== 'A' && owner !== 'B')) return false;
    if (!ab.cost || !ab.cost.length) return false;
    const costOp = ab.cost[0];
    if (costOp.op === 'sacrifice') {
      const filt = Object.assign({}, costOp.filter || {}, { _srcK: atkId });
      const p = {
        kind: 'pick', from: 'ownAvatars', src: atkId, chooser: owner, filter: filt,
        dest: 'sacrifice', actions: ab.actions || [], optional: true, keepSrc: true
      };
      if (!promptCandidates(st, p).length) return false;
      st.prompts.push(p);
      const sym = (costOp.filter && costOp.filter.symbol) || 'Avatar';
      addLog(st, owner, `⚡ ${c.name}: เลือกเซ่นไหว้ ${sym} เพื่อตื่น (หรือข้าม)`);
      return true;
    }
    return false;
  }
  function clearCombatBuffs(st) {
    st.buffs = (st.buffs || []).filter(b => b.until !== 'combat');
    for (const id in st.inst) {
      if (st.inst[id] && st.inst[id]._swapCombat) delete st.inst[id]._swapCombat;
    }
  }

  function resolveCombat(st, fx, atkId, defId, lifeId) {
    const A = st.inst[atkId];
    if (!A || !(zoneOf(st, atkId) || '').endsWith('.avatar')) { addLog(st, 'S', 'การปะทะเป็นโมฆะ — ผู้โจมตีไม่อยู่บนสนามแล้ว'); return; }
    const oa = ownerOf(st, atkId);
    if (lifeId) {
      const lifeOwner = ownerOf(st, lifeId);
      const arr = st.zones[lifeOwner + '.life'] || [];
      // กติกา: Avatar POWER 0 โจมตี LIFE ได้ แต่ไม่หงาย LIFE (ไม่ทำความเสียหาย)
      if (effPower(st, atkId) <= 0) { addLog(st, 'S', `${A.name} (P0) โจมตี LIFE ${lifeOwner} — POWER 0 ไม่หงาย LIFE (ตามกติกา)`); fx.snd = 'tap'; return; }
      // หงาย LIFE ไล่จากซ้ายไปขวา (ใบที่คว่ำอยู่ตัวแรกสุด) ไม่ว่าจะลากทับใบไหน
      const target = arr.find(k => !st.inst[k].faceUp);
      if (!target) {
        // LIFE หงายครบแล้ว (สถานะสาหัส) + ถูกโจมตี LIFE อีกครั้ง → แพ้ (Rule Book)
        st.over = { winner: oa };
        addLog(st, 'S', `💀 ฝ่าย ${lifeOwner} อยู่ในสถานะสาหัสแล้วถูกลง LIFE อีกครั้ง — ${oa} ชนะ! จบเกม`);
        fx.over = oa; fx.snd = 'clash';
        return;
      }
      const idx = arr.indexOf(target);
      const L = st.inst[target];
      L.faceUp = true;
      const remain = arr.filter(k => !st.inst[k].faceUp).length;
      addLog(st, 'S', `⚔️ ${A.name} โจมตี LIFE ${lifeOwner} → หงายใบที่ ${idx + 1} "${L.name}" (เหลือคว่ำ ${remain} ใบ)`);
      fx.snd = 'flip'; fx.flip = target;
      abilitiesOf(L.code, 'lifeRevealedByAttack').forEach(ab => (ab.actions || []).forEach(ac => {
        if (ac.op === 'draw') {
          st.scheduled.push({ player: lifeOwner, op: 'draw', count: ac.count || 1 });
          addLog(st, 'S', `เอฟเฟกต์ LIFE "${L.name}": ${lifeOwner} จะได้จั่ว ${ac.count || 1} ใบใน Main เทิร์นหน้าของตน`);
        }
      }));
      if (remain === 0) {
        // หงายครบ = เข้าสาหัส ยังไม่จบเกม — ต้องโจมตี LIFE อีกครั้ง
        addLog(st, 'S', `🩸 ฝ่าย ${lifeOwner} เข้าสู่สถานะสาหัส! (LIFE หงายครบ) — ต้องโดนโจมตี LIFE อีก 1 ครั้งจึงจะแพ้`);
        fx.critical = lifeOwner;
      }
      return;
    }
    const D = st.inst[defId];
    if (!D || !(zoneOf(st, defId) || '').endsWith('.avatar')) { addLog(st, 'S', 'การปะทะเป็นโมฆะ — เป้าหมายไม่อยู่บนสนามแล้ว'); return; }
    const od = ownerOf(st, defId);
    // บัฟ onFight ใส่ตอนประกาศโจมตีแล้ว — resolve ใช้ค่าที่มีอยู่ (อย่าใส่ซ้ำ)
    const pa = effPower(st, atkId), pd = effPower(st, defId);
    const tryDestroy = (victim, winner) => {
      const V = st.inst[victim], W = st.inst[winner];
      if (V && V.combatImmuneUntilEOT) {
        addLog(st, 'S', `${V.name} ไม่ถูกทำลายจากการต่อสู้ในเทิร์นนี้ (พระคุ้มครอง)`);
        return false;
      }
      const e = EFFECTS[(V || {}).code];
      // ราชา: ไม่ถูกทำลายจากการต่อสู้กับ Cost น้อยกว่า
      if (e && e.combatImmuneVsLowerCost && W && effCost(st, winner) < effCost(st, victim)) {
        addLog(st, 'S', `เอฟเฟกต์ ${V.name}: ไม่ถูกทำลายจากการต่อสู้กับ ${W.name} (Cost ${effCost(st, winner)} < ${effCost(st, victim)})`);
        return false;
      }
      const vOwn = ownerOf(st, victim), wOwn = ownerOf(st, winner);
      return destroyCard(st, fx, victim, { fromCombat: true, byOpp: !!(wOwn && vOwn && wOwn !== vOwn) });
    };
    let res;
    if (pa > pd) {
      const died = tryDestroy(defId, atkId);
      res = died ? `${D.name} ถูกทำลาย — ส่งนรกแล้ว` : `${D.name} รอดจากการต่อสู้ (กันทำลาย)`;
        if (died && st.inst[atkId] && (zoneOf(st, atkId) || '').endsWith('.avatar')) {
        abil(st, atkId, 'battleDestroy').forEach(ab => {
          if (ab.requireLandNameIncludes) {
            const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!ok) return;
          }
          runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random });
        });
        // อวตารนารายณ์: หลังนารายณ์ฆ่า — เสนอสั่งใช้จากมือ
        if (nameMatches(st.inst[atkId], 'พระนารายณ์')) offerNaraiHandForms(st, fx, oa, atkId);
        // คริติคอลไมเกรนโหมด: ฆ่าแล้วโจมตี LIFE ได้
        if (st.inst[atkId].battleDestroyLifeHitUntilEOT) {
          st.inst[atkId].tapped = false;
          st.inst[atkId]._allowLifeDespiteAvatars = true;
          addLog(st, oa, `${nameOf(st, atkId)}: ฆ่าแล้ว — ตื่นเพื่อโจมตี LIFE ได้ 1 ครั้ง`);
        }
      }
    }
    else if (pa < pd) {
      const died = tryDestroy(atkId, defId);
      res = died ? `${A.name} ถูกทำลาย — ส่งนรกแล้ว` : `${A.name} รอดจากการต่อสู้ (กันทำลาย)`;
    }
    else if (pa === 0) { res = 'POWER 0 ปะทะ POWER 0 — ไม่มีอะไรเกิดขึ้น (ตามกติกา)'; }
    else {
      // ลูกฮึด: POWER เท่ากัน + มี keyword / ฝ่ายตรงข้ามไม่มี → ชนะฝ่ายเดียว
      const hak = hasKw(st, atkId, 'ลูกฮึด'), hdk = hasKw(st, defId, 'ลูกฮึด');
      if (hak && !hdk) {
        const died = tryDestroy(defId, atkId);
        res = died ? `${D.name} ถูกทำลาย (ลูกฮึด) — ส่งนรกแล้ว` : `${D.name} รอดจากการต่อสู้ (กันทำลาย)`;
      } else if (hdk && !hak) {
        const died = tryDestroy(atkId, defId);
        res = died ? `${A.name} ถูกทำลาย (ลูกฮึด) — ส่งนรกแล้ว` : `${A.name} รอดจากการต่อสู้ (กันทำลาย)`;
      } else {
        const d1 = tryDestroy(atkId, defId), d2 = tryDestroy(defId, atkId);
        res = (d1 || d2) ? 'POWER เท่ากัน — ส่งนรกตามผลกันทำลาย' : 'POWER เท่ากัน — ทั้งคู่รอด';
      }
    }
    sweepDestroyPowerZero(st, fx);
    // เคลียร์บัฟจนจบการต่อสู้ (พาหะ / พิภพ / พาลี) + สลับ Cost/POWER
    clearCombatBuffs(st);
    const waitingLeave = (st.prompts || []).some(p => p.dest === 'preventLeavePick' || p.kind === 'preventLeaveExile');
    if (waitingLeave && pa === pd && pa > 0) {
      res = 'POWER เท่ากัน — รอเลือกเนรเทศเพื่อกันออกสนาม';
      fx.clash = `P${pa} ปะทะ P${pd} — เลือกเนรเทศเพื่อรอด!`;
    } else {
      fx.clash = `P${pa} ปะทะ P${pd} — ${pa > pd ? 'ฝ่ายรับแตก!' : pa < pd ? 'ฝ่ายบุกแตก!' : 'ตายทั้งคู่!'}`;
    }
    addLog(st, 'S', `ผลปะทะ: ${A.name} (P${pa}) ปะทะ ${D.name} (P${pd}) → ${res}`);
    fx.snd = 'clash';
    if (st.inst[defId] && (zoneOf(st, defId) || '').endsWith('.avatar'))
      abil(st, defId, 'selfDamaged').forEach(ab => runActions(st, fx, ab.actions, { src: defId, owner: od, rng: fx._rng || Math.random }));
  }

  function buildInitialState(cards, rng, decks, opts) {
    rng = rng || Math.random; decks = decks || {}; opts = opts || {};
    const byCode = {};
    cards.forEach(c => { if (!byCode[c.code] || c.image === c.code + '.png') byCode[c.code] = c; });
    const sd = Object.values(byCode).filter(c => c.series === 'SD01');
    const mainSD = sd.filter(c => c.type !== 'Life'), lifeSD = sd.filter(c => c.type === 'Life');
    const expand = counts => {
      const out = [];
      Object.entries(counts || {}).forEach(([code, ct]) => { const c = byCode[code]; if (c) for (let i = 0; i < ct; i++) out.push(c); });
      return out;
    };
    let n = 0; const inst = {}, zones = { land: [] };
    const mk = (c, faceUp) => {
      const k = 'i' + (++n);
      inst[k] = { id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '', symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '', cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '—', img: c.imageUrl || '', faceUp: faceUp !== false, tapped: false, counters: 0, attachedTo: null };
      return k;
    };
    ['A', 'B'].forEach(p => {
      PER_PLAYER_ZONES.forEach(z => zones[p + '.' + z] = []);
      const spec = decks[p];
      let mainCards = spec ? expand(spec.main) : [];
      let lifeCards = spec ? expand(spec.life) : [];
      if (!mainCards.length) mainCards = [...mainSD, ...mainSD];
      if (!lifeCards.length) lifeCards = lifeSD;
      const deck = mainCards.map(c => mk(c));
      // opts.noShuffle = โหมดซ้อมมือ (เรียงตามเด็ค ไม่สับ) · ปกติสับทั้งเด็คและ LIFE (Rule Book)
      if (!opts.noShuffle) {
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        for (let i = lifeCards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lifeCards[i], lifeCards[j]] = [lifeCards[j], lifeCards[i]]; }
      }
      zones[p + '.deck'] = deck;
      lifeCards.forEach(c => zones[p + '.life'].push(mk(c, false)));
      for (let i = 0; i < 5 && zones[p + '.deck'].length; i++) zones[p + '.hand'].push(zones[p + '.deck'].pop());
    });
    // ★ ทอยเหรียญหาผู้เริ่มก่อน (อัตโนมัติตอนเปิดโต๊ะ)
    //   ผู้เริ่มจะได้จั่วเพิ่ม 2 ใบ "หลังตอบคำถามเปลี่ยนมือ (มัลลิแกน)" — ดู case 'mulligan' (st.fpDrawn)
    const flip = (typeof rng === 'function' ? rng() : Math.random());
    const fp = flip < 0.5 ? 'A' : 'B';
    return {
      inst, zones, phase: 'Main', active: fp, turn: 1, turnSeq: 1, strict: opts.strict !== false, firstPlayer: fp, fpDrawn: false, scout: null,
      buffs: [], pending: null, prompts: [], scheduled: [], chain: [], chainPri: null, magicUsed: { A: {}, B: {} }, reactCleanup: null, pendingLethal: null, _tokSeq: 0, mulliganDone: {},
      log: [
        { p: 'S', t: 'เปิดโต๊ะ — โหมดกติกาอัตโนมัติ: จั่วต้นเทิร์น · ปะทะ · จ่าย Cost · หงาย LIFE · เอฟเฟกต์การ์ดที่มีข้อมูล' },
        ...(opts.noShuffle ? [] : [{ p: 'S', t: '🔀 สับเด็ค + สับกอง LIFE ทั้งสองฝั่งเรียบร้อย' }]),
        { p: 'A', t: 'จั่วเปิด 5 ใบ' }, { p: 'B', t: 'จั่วเปิด 5 ใบ' },
        { p: 'S', t: `🪙 ทอยเหรียญ: ออก "${flip < 0.5 ? 'หัว' : 'ก้อย'}" — ผู้เล่น ${fp} เริ่มก่อน · ตอบคำถามเปลี่ยนมือก่อน แล้วผู้เริ่มจะได้จั่วเพิ่ม 2 ใบ · เทิร์นแรกของ ${fp} โจมตีไม่ได้` },
      ],
    };
  }

  /* ผู้เริ่มก่อนตัดสินใจเรื่องมือเปิดแล้ว → จั่วเพิ่ม 2 ใบ (ครั้งเดียว) */
  function fpBonusDraw(st, fx, p) {
    if (p !== (st.firstPlayer || 'A') || st.fpDrawn) return;
    st.fpDrawn = true;
    const d = st.zones[p + '.deck']; let got = 0;
    for (let i = 0; i < 2 && d.length; i++) { st.zones[p + '.hand'].push(d.pop()); got++; }
    addLog(st, 'S', `🃏 ผู้เริ่ม (${p}) ตอบเรื่องมือแล้ว — จั่วเพิ่ม ${got} ใบ (เทิร์นแรกยังโจมตีไม่ได้)`);
    fx.snd = 'draw';
  }

  function applyAction(st, a) {
    const fx = {};
    const strict = !!st.strict; // โหมดกติกาอัตโนมัติ (default เปิดตอนสร้างโต๊ะ)
    const by = a.by;
    const isPlayer = by === 'A' || by === 'B';
    /* ★ คำสั่งที่ทำกับ "กองเด็ค" (จั่ว/สับ/ค้นหา/สอดแนม/เปิดกอง/ธรณีสูบ) — บังคับให้เป็นเด็คของคนที่กดเสมอ
       กันไม่ให้ฝั่งตรงข้ามไปสอดแนม/สูบเด็คเราตอนเทิร์นเรา (solo ส่ง by = p อยู่แล้ว จึงไม่กระทบ) */
    const deckSide = v => (isPlayer ? by : (v === 'B' ? 'B' : 'A'));
    const deny = m => { fx.deny = m; return fx; };
    const rng = mulberry32(a.seed);
    fx._rng = rng;
    st.buffs = st.buffs || []; st.prompts = st.prompts || []; st.scheduled = st.scheduled || []; st.chain = st.chain || []; if (st.chainPri === undefined) st.chainPri = null; st.magicUsed = st.magicUsed || { A: {}, B: {} };

    switch (a.type) {

      case 'setStrict': {
        st.strict = !!a.on;
        addLog(st, 'S', st.strict ? 'เปิดโหมดกติกาอัตโนมัติ' : 'ปิดโหมดกติกา — โต๊ะเสรี');
        break;
      }

      case 'move': {
        const c = st.inst[a.k], from = zoneOf(st, a.k), to = a.to;
        if (!c || !from || !st.zones[to]) break;
        if (from === to && a.pos !== 'bottom') break;
        if (strict && isPlayer) {
          if (from !== 'land' && from[0] !== by) return deny('โหมดกติกา: ขยับการ์ดฝั่งตรงข้ามไม่ได้ (จำเป็นจริงๆ ให้สลับเป็นโต๊ะเสรี)');
          if (to !== 'land' && to[0] !== by) return deny('โหมดกติกา: วางการ์ดลงฝั่งตรงข้ามไม่ได้');
          if (from.endsWith('.hand') && (to.endsWith('.avatar') || to.endsWith('.construct')) && (+c.cost || 0) > 0)
            return deny(`"${c.name}" มี COST ${c.cost} — แตะเลือกการ์ดในมือให้ GEM รวมพอ แล้วลากลงสนามเพื่ออัญเชิญ`);
          const qd = quotaDeny(st, to, c); if (qd) return deny('โหมดกติกา: ' + qd);
        }
        // Avatar → นรก = ทำลาย (ให้ ownAvatarDestroyed / บ่อหมัก ฯลฯ ทำงาน) ไม่ใช่แค่ย้ายโซน
        if (from.endsWith('.avatar') && to.endsWith('.hell')) {
          destroyCard(st, fx, a.k, { byOpp: isPlayer && by !== from[0] });
          fx.snd = fx.snd || 'clash';
          break;
        }
        // ไพรมอล: ลาก/ย้ายออกจากสนามก็ถามอัตโนมัติกันออก
        if (from.endsWith('.avatar') && !to.endsWith('.avatar')) {
          const who = to === 'land' ? (from === 'land' ? 'S' : from[0]) : to[0];
          if (offerPreventLeave(st, fx, a.k, { type: 'move', to, pos: a.pos, who })) {
            fx.snd = 'place';
            break;
          }
        }
        if (to === 'land') {
          clearLandZoneFor(st, fx, a.k);
          if (from[0] === 'A' || from[0] === 'B') c.controller = from[0];
        }
        doMove(st, a.k, to, a.pos, fx);
        const who = to === 'land' ? (from === 'land' ? 'S' : from[0]) : to[0];
        addLog(st, who, `${c.name}: ${zLabel(from)} → ${zLabel(to)}${a.pos === 'bottom' ? ' (ล่างสุด)' : ''}`);
        if (!strict) {
          const cap = { '.avatar': 4, '.construct': 4 };
          for (const suf in cap) if (to.endsWith(suf) && st.zones[to].length > cap[suf])
            addLog(st, 'S', `เตือน: ${zLabel(to)} เกิน ${cap[suf]} ใบ (โต๊ะเสรี — ตกลงกันเอง)`);
        }
        fx.snd = 'place'; break;
      }

      case 'summon': {
        const c = st.inst[a.k], from = zoneOf(st, a.k);
        if (!c || !from || !st.zones[a.to]) break;
        // ปกติอัญเชิญจากมือ; อัญเชิญพิเศษ (free) อนุญาตจากนรก/มิติมืด/เด็คได้ด้วย
        if (!a.free && !from.endsWith('.hand')) break;
        const owner = from[0];
        if (from.endsWith('.hell') || (a.free && from.endsWith('.hell'))) {
          const blk = hellSummonBlocked(st);
          if (blk) return deny(`อัญเชิญจากนรกไม่ได้ — ${blk} บล็อก`);
        }
        const eSum = EFFECTS[c.code];
        // ของขวัญ: อัญเชิญฟรีถ้ามีเจคและยังไม่มีของขวัญบนสนาม
        if (!a.free && eSum && eSum.freeSummonIf) {
          const fs = eSum.freeSummonIf;
          const hasReq = !fs.requireOwnNameIncludes || (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], fs.requireOwnNameIncludes));
          const noDup = !fs.requireNoOwnExactName || !(st.zones[owner + '.avatar'] || []).some(id => (st.inst[id].name || '') === fs.requireNoOwnExactName);
          if (hasReq && noDup) a = Object.assign({}, a, { free: true });
        }
        // uniqueOnField (เจค)
        if (eSum && eSum.uniqueOnField) {
          if ((st.zones[owner + '.avatar'] || []).some(id => st.inst[id] && st.inst[id].code === c.code))
            return deny(`ควบคุม "${c.name}" ได้เพียง 1 ใบ`);
        }
        // ยายกบ: อัญเชิญโดยส่งกบที่ +POWER ≥3 ครั้ง (ห้ามจ่าย Cost ปกติ)
        if (eSum && eSum.sacrificeSummon && !a.free) {
          if (strict) {
            if (isPlayer && owner !== by) return deny('อัญเชิญได้เฉพาะการ์ดในมือตัวเอง');
            if (isPlayer && st.active !== by) return deny('อัญเชิญได้เฉพาะในเทิร์นของคุณ');
            if (st.phase !== 'Main') return deny('อัญเชิญได้เฉพาะเฟส Main');
          }
          const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: eSum.sacrificeSummon.filter, dest: 'sacSummon', summonTo: a.to, optional: false };
          if (!promptCandidates(st, p).length) return deny(`อัญเชิญ "${c.name}" ไม่ได้ — ไม่มี Avatar ตรงเงื่อนไขบนสนาม`);
          st.prompts.push(p);
          addLog(st, owner, `อัญเชิญ ${c.name}: เลือก Avatar ส่งลงนรกแทน Cost`);
          fx.snd = 'place';
          break;
        }
        if (eSum && eSum.noPaidSummon && !a.free)
          return deny(`"${c.name}" อัญเชิญแบบจ่าย Cost ไม่ได้`);
        if (eSum && eSum.noHandSummon)
          return deny(`"${c.name}" อัญเชิญจากมือไม่ได้ (ลงได้จากเอฟเฟกต์เท่านั้น)`);
        const cost = +c.cost || 0;
        const payIds = (a.payIds || []).filter(k => k !== a.k && st.zones[owner + '.hand'].includes(k));
        // สีคอส = color ของอวตาร (ต้องจ่ายสีนี้) · สีเจม = gemColor ของใบที่จ่าย (ไม่ระบุ = ขาว/wild)
        // อวตารไร้สีจ่ายด้วยสีอะไรก็ได้ · เจมขาวจ่ายได้ทุกสี · ไม่งั้นสีเจมต้องตรงสีคอส
        // allColors (โคลัมบัส): ถือเป็นทุกสี → จ่ายสีอะไรก็ได้
        const eAll = EFFECTS[c.code];
        const avColor = (eAll && eAll.allColors) ? '' : (c.color || '');
        // กรุงลงกา: ใช้ POWER ของยักษ์บนมือแทน GEM
        let powerAsGemSym = null;
        (st.zones['land'] || []).forEach(lid => {
          const le = EFFECTS[(st.inst[lid] || {}).code];
          if (le && le.powerAsGemForSymbol && st.inst[lid].faceUp) powerAsGemSym = le.powerAsGemForSymbol;
        });
        const byColor = {}; let gem = 0, usable = 0;
        payIds.forEach(k => {
          const pc = st.inst[k]; if (!pc) return;
          if (powerAsGemSym && pc.type === 'Avatar' && pc.symbol === powerAsGemSym && c.symbol === powerAsGemSym) {
            const pv = +pc.power || 0;
            usable += pv; gem += pv; byColor['POWER'] = (byColor['POWER'] || 0) + pv;
            return;
          }
          const g = +pc.gem || 0, gc = pc.gemColor || 'ขาว';
          gem += g; byColor[gc] = (byColor[gc] || 0) + g;
          if (!avColor || gc === 'ขาว' || gc === avColor) usable += g;
        });
        if (strict) {
          if (isPlayer && owner !== by) return deny('อัญเชิญได้เฉพาะการ์ดในมือตัวเอง');
          if (isPlayer && st.active !== by) return deny('อัญเชิญได้เฉพาะในเทิร์นของคุณ');
          if (st.phase !== 'Main') return deny('อัญเชิญได้เฉพาะเฟส Main');
          if (a.to !== 'land' && a.to[0] !== owner) return deny('ลงได้เฉพาะโซนฝั่งตัวเอง');
          const qd = quotaDeny(st, a.to, c); if (qd) return deny('โหมดกติกา: ' + qd);
          if (!a.free && eSum && eSum.exactGemPay && usable !== cost)
            return deny(`พอดี: ต้องจ่าย GEM พอดี ${cost} (ตอนนี้ ${usable}) — เกิน/ขาดไม่ได้`);
          if (!a.free && usable < cost) return deny(avColor
            ? `GEM สีที่จ่ายได้ไม่พอ: "${c.name}" (สี${avColor}) ต้องการ ${cost} — จ่ายด้วยเจมสี${avColor}หรือขาวเท่านั้น (ตอนนี้ใช้ได้ ${usable})`
            : `GEM ไม่พอ: "${c.name}" ต้องการ ${cost} แต่จ่ายได้ ${usable} — แตะการ์ดในมือเพื่อเลือกเพิ่ม`);
        } else if (!a.free && cost > 0 && usable < cost) {
          return deny(`GEM ไม่พอ: "${c.name}" ต้องการ ${cost} แต่จ่ายได้ ${usable} — แตะการ์ดในมือให้ GEM พอ แล้วลากลงสนาม`);
        } else if (!a.free && eSum && eSum.exactGemPay && usable !== cost) {
          return deny(`พอดี: ต้องจ่าย GEM พอดี ${cost} (ตอนนี้ ${usable})`);
        }
        // เก็บเอฟเฟกต์ "ถูกใช้เป็น Cost" ก่อนย้ายลงนรก (วันชัย/กัญญา)
        const paidAsCostEffects = [];
        if (!a.free) {
          for (const pk of payIds) {
            const pc = st.inst[pk];
            if (!pc) continue;
            const pe = EFFECTS[pc.code];
            if (pe && pe.costOnlyForNameIncludes && !nameMatches(c, pe.costOnlyForNameIncludes))
              return deny(`"${pc.name}" ใช้เป็น Cost ได้เฉพาะ Avatar "${pe.costOnlyForNameIncludes}"`);
            if (pe && pe.costOnlyForSymbol && c.symbol !== pe.costOnlyForSymbol)
              return deny(`"${pc.name}" ใช้เป็น Cost ได้เฉพาะ Avatar Symbol ${pe.costOnlyForSymbol}`);
          }
          payIds.forEach(pk => {
            const pc = st.inst[pk];
            if (!pc) return;
            abilitiesOf(pc.code, 'paidAsCost').forEach(ab => {
              const cond = (ab.trigger && ab.trigger.if) || '';
              if (cond) {
                // รองรับเงื่อนไขหลายข้อด้วย & เช่น summonType:Avatar&summonSymbol:รัททาทุย
                const parts = cond.split('&').map(s => s.trim()).filter(Boolean);
                let ok = true;
                for (const part of parts) {
                  const mType = part.match(/^summonType:(.+)$/);
                  if (mType) { if ((c.type || '') !== mType[1]) ok = false; continue; }
                  const mSym = part.match(/^summonSymbol:(.+)$/);
                  if (mSym) { if (c.symbol !== mSym[1]) ok = false; continue; }
                  const mName = part.match(/^summonNameIncludes:(.+)$/);
                  if (mName) { if (!nameMatches(c, mName[1])) ok = false; continue; }
                  const mCol = part.match(/^summonColor:(.+)$/);
                  if (mCol) { if ((c.color || '') !== mCol[1]) ok = false; continue; }
                  if (part === 'summonDogOrCatAnimal') {
                    if (c.symbol !== 'สัตว์' || (!nameMatches(c, 'หมา') && !nameMatches(c, 'แมว'))) ok = false;
                    continue;
                  }
                }
                if (!ok) return;
              }
              paidAsCostEffects.push({ payK: pk, ab, name: pc.name });
            });
          });
          payIds.forEach(k => doMove(st, k, owner + '.hell', null, fx));
        }
        // เครื่องบิน Super Air: ล็อกอัญเชิญในเทิร์น
        if (st.lockSummonExcept && st.lockSummonExcept.owner === owner) {
          if (!(st.lockSummonExcept.nameIncludes && nameMatches(c, st.lockSummonExcept.nameIncludes)))
            return deny(`เทิร์นนี้ล็อกอัญเชิญ — อัญเชิญได้เฉพาะ "${st.lockSummonExcept.nameIncludes}"`);
        }
        doMove(st, a.k, a.to, null, fx);
        const paidCost = !!a.free ? false : (cost === 0 || usable >= cost);
        const paidExactFinal = !a.free && usable === cost;
        const colBreak = Object.entries(byColor).map(([col, n]) => `${n}${col}`).join(' ');
        addLog(st, owner, a.free
          ? `✨ อัญเชิญพิเศษ ${c.name} — ไม่จ่าย Cost`
          : (payIds.length
            ? `อัญเชิญ ${c.name}${avColor ? ' (สี' + avColor + ')' : ''} COST ${cost} — จ่าย ${colBreak || gem + ' GEM'}${paidExactFinal && eSum && eSum.exactGemPay ? ' (พอดี)' : ''}`
            : `อัญเชิญ ${c.name}${cost > 0 ? ` (COST ${cost})` : ''}`));
        fx.snd = 'place';
        // รันเอฟเฟกต์การ์ดที่ถูกจ่ายเป็น Cost
        paidAsCostEffects.forEach(({ payK, ab, name }) => {
          addLog(st, owner, `เอฟเฟกต์ ${name} (จ่ายเป็น Cost): ทำงาน`);
          runActions(st, fx, ab.actions, { src: payK || a.k, owner, summoned: a.k, payK, payName: name, toHellAfter: false, rng: fx._rng });
        });
        triggerSummon(st, fx, a.k, owner, { paidCost, paidExact: paidExactFinal });
        break;
      }

      case 'playMagic': {
        const c = st.inst[a.k], from = zoneOf(st, a.k);
        if (!c || c.type !== 'Magic' || !from || !from.endsWith('.hand')) break;
        const owner = from[0];
        // การ์ดสวน: ถ้าถูกโจมตีอยู่ + มี effect enemyDeclareAttack → รันผลอัตโนมัติ
        const counterAtk = !!(st.pending && st.pending.target === owner && c.subtype === 'React'
          && abilitiesOf(c.code, 'enemyDeclareAttack').length);
        if (counterAtk && st.pending.blockReact) return deny('ฝ่ายโจมตีห้ามใช้ React จนกว่าจะจบการต่อสู้ (นางอัปสร)');
        // ตอบโต้บนเชน — เล่นเวทใส่เชนได้แม้ไม่ใช่เทิร์นตัวเอง ถ้าเป็นฝ่ายที่มีสิทธิ์ตอบโต้
        const chainResp = st.chain.length && owner === by && by === st.chainPri;
        // ฤๅษี ภฤคุ: ใช้เวทฤษี (Normal/Mod/Land) ในเทิร์นฝ่ายตรงข้ามได้
        const rishiOk = (() => {
          if (st.active === owner) return false;
          if (!['Normal', 'Modification', 'Land'].includes(c.subtype || 'Normal')) return false;
          if (c.symbol !== 'ฤษี') return false;
          return (st.zones[owner + '.avatar'] || []).some(id => {
            const e = EFFECTS[(st.inst[id] || {}).code];
            return e && e.allowOppTurnMagic;
          });
        })();
        // React ยืดหยุ่น (ฮึบ / รหัสดำ)
        const reactAny = c.subtype === 'React' && (() => {
          const e = EFFECTS[c.code];
          const ab0 = abilitiesOf(c.code, 'activated')[0];
          return (e && e.reactAnyWindow) || (ab0 && ab0.reactAnyWindow) || abilitiesOf(c.code, 'enemyPlayReact').length
            || abilitiesOf(c.code, 'enemyDrawFromDeckByEffect').length || abilitiesOf(c.code, 'avatarTapped').length
            || abilitiesOf(c.code, 'oppBattlePhaseStart').length;
        })();
        if (strict && !counterAtk && !chainResp && !rishiOk && !(reactAny && st.active !== owner)) {
          if (isPlayer && owner !== by) return deny('ใช้ได้เฉพาะการ์ดในมือตัวเอง');
          if (isPlayer && st.active !== by) return deny('ใช้เวทได้ในเทิร์นของคุณ (การ์ดสวน/ตอบโต้เชน/ฤษีภฤคุใช้นอกเทิร์นได้)');
          if (st.phase !== 'Main' && !reactAny) return deny('ใช้/เซ็ตเวทได้เฉพาะเฟส Main (การ์ดสวน/ตอบโต้เชนใช้นอกเฟสได้)');
        }
        if (strict && counterAtk && isPlayer && owner !== by) return deny('ใช้การ์ดสวนของตัวเองเท่านั้น');
        // กติกา: Magic ใช้ได้ประเภทละ 1 ครั้ง/เทิร์น (แม้เทิร์นอีกฝ่าย) · React บังคับเสมอ
        const mtype = c.subtype || 'Normal';
        const enforceType = mtype === 'React' || !!strict;
        if (enforceType) {
          if (isMagicTypeUsed(st, owner, mtype)) {
            const extra = st._weaponModExtra && st._weaponModExtra[owner];
            const okExtra = mtype === 'Modification' && extra && extra.left > 0
              && extra.turnSeq === st.turnSeq
              && nameMatches(c, extra.onlyNameIncludes || 'อาวุธหุ่นนักรบผู้กล้า');
            if (okExtra) {
              extra.left--;
              addLog(st, owner, `ซีทันยาน: ใช้ Mod อาวุธเพิ่ม (เหลือโควต้า ${extra.left})`);
            } else {
              return deny(`ใช้เวทประเภท "${mtype}" ครบ 1 ครั้งแล้วในเทิร์นนี้ (ประเภทละ 1 ครั้ง/เทิร์น)`);
            }
          } else {
            markMagicTypeUsed(st, owner, mtype);
          }
        }
        if (c.subtype === 'React') {
          if (counterAtk) {
            const atkId = st.pending.atk;
            const defId = st.pending.def || null;
            addLog(st, owner, `ใช้การ์ดสวน "${c.name}"!`);
            // React = data-driven: รัน actions ผ่าน runActions โดยยัดผู้โจมตี (atkId) เข้า ctx.attacker
            const before = st.prompts.length;
            const rctx = { owner: owner, src: a.k, rng: rng, attacker: atkId, target: defId };
            abilitiesOf(c.code, 'enemyDeclareAttack').forEach(ab => {
              const cond = (ab.trigger && ab.trigger.if) || '';
              const mName = cond.match(/^targetNameIncludes:(.+)$/);
              if (mName && !(defId && st.inst[defId] && nameMatches(st.inst[defId], mName[1]))) return;
              runActions(st, fx, ab.actions, rctx);
            });
            if (st.prompts.length > before) {
              // React มี prompt ให้เลือกเป้า → ย้ายออกจากมือ (กันเล่นซ้ำ) + เลื่อนสรุปผลไปหลัง prompt เสร็จ (post-hook)
              doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
              st.reactCleanup = { src: a.k, owner: owner, atk: atkId, attackerKilled: !!rctx.attackerKilled };
              addLog(st, owner, `การ์ดสวน "${c.name}": เลือกเป้าให้ครบก่อน แล้วจึงสรุปผลการโจมตี`);
              fx.snd = 'clash'; break;
            }
            // ไม่มี prompt — สรุปทันที
            // ทำลายผู้โจมตี / POWER เหลือ 0 / ยกเลิกโจมตี → จบการโจมตี
            // แค่ลด POWER (ไปเลยมอนตี้ ฯลฯ) → ค้าง pending ให้กดปะทะต่อได้ด้วยพลังใหม่
            const atkGone = rctx.attackerKilled || !(st.inst[atkId] && (zoneOf(st, atkId) || '').endsWith('.avatar'));
            const atkP0 = !atkGone && effPower(st, atkId) <= 0;
            if (atkGone || atkP0 || rctx.cancelAttack) {
              if (atkP0) addLog(st, 'S', `${nameOf(st, atkId)} POWER เหลือ 0 — การโจมตีถูกสลาย`);
              st.pending = null;
            } else if (st.pending) {
              addLog(st, 'S', `การโจมตียังค้าง — ${nameOf(st, atkId)} เหลือ P${effPower(st, atkId)} (กดปะทะได้)`);
            }
            doMove(st, a.k, owner + '.hell', null, fx); // เวทสวนใช้แล้วลงนรก
            fx.snd = 'clash'; break;
          }
          // React ที่มี activated (เช่น ลดราคาล้นตลาด) → เล่นได้ตลอดเมื่อเงื่อนไขครบ
          {
            const actAb = abilitiesOf(c.code, 'activated')[0];
            if (actAb) {
              // ตกไปใช้เส้นทาง activated ด้านล่าง — อย่า break ตรงนี้
            } else {
              doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
              addLog(st, owner, `ใช้เวท ${c.name} — อ่านผลจากการ์ดแล้วจัดการกันเอง`);
              fx.snd = 'place'; break;
            }
          }
        }
        // เวทที่มี effect "activated" ใน JSON → รันอัตโนมัติ (เช่น ความเจริญ = จั่ว 2)
        // การ์ดที่ยังไม่มีข้อมูล effect → วางลง Magic Zone ให้เล่นมือตามเดิม
        // Land Magic → ลงโซน land (aura ทำงานผ่าน effPower) · มีได้ 1 ใบ — ใบใหม่ทำลายใบเดิม
        if (c.subtype === 'Land') {
          clearLandZoneFor(st, fx, a.k);
          doMove(st, a.k, 'land', null, fx); c.faceUp = true; c.controller = owner;
          addLog(st, owner, `วาง Land ${c.name}`);
          fx.snd = 'place';
          fireEnemyActivate(st, fx, owner, rng);
          break;
        }
        // เลือกมันสำหรับพวกจน: เปิด UI เลือก นรก / เด็ค (หรือทำทั้งสองถ้าไลฟ์หงาย≥4 และมากกว่าศัตรู)
        {
          const modeAb = abilitiesOf(c.code, 'chooseMode')[0];
          const eCard = EFFECTS[c.code];
          if (modeAb && modeAb.options && modeAb.options.length && eCard && eCard.lifeBothModes) {
            doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
            addLog(st, owner, `ใช้เวท ${c.name}`);
            fx.snd = 'place';
            if (offerMagicNegateReact(st, fx, owner, a.k)) {
              st._pendingMagic = { type: 'poorModes', src: a.k, owner };
              break;
            }
            runActions(st, fx, [{ op: 'choosePoorModes' }], { src: a.k, owner, rng });
            fireEnemyActivate(st, fx, owner, rng);
            break;
          }
        }
        // Modification ไม่มี activated → วาง Magic Zone ให้สวมทีหลัง
        const ab = abilitiesOf(c.code, 'activated')[0];
        if (!ab) {
          doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
          addLog(st, owner, `ใช้เวท ${c.name}${c.subtype === 'Modification' ? ' — ลากทับ Avatar เพื่อสวมใส่' : ' — อ่านผลจากการ์ดแล้วจัดการกันเอง'}`);
          fx.snd = 'place';
          // แม้ไม่มีเอฟเฟกต์อัตโนมัติ — ยังถามชายจากอนาคตได้ (ยกเลิกการใช้เวท)
          if (c.subtype !== 'Modification' && offerMagicNegateReact(st, fx, owner, a.k)) {
            st._pendingMagic = { type: 'placeOnly', src: a.k, owner };
          }
          break;
        }
        if (ab.requireOwnNameIncludes) {
          const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes));
          if (!ok) return deny(`ใช้ "${c.name}" ไม่ได้ — ต้องมี Avatar ชื่อมี "${ab.requireOwnNameIncludes}" บนสนาม`);
        }
        if (ab.requireBothHaveMods) {
          const has = side => {
            for (const id in st.inst) {
              const m = st.inst[id];
              if (m && m.subtype === 'Modification' && m.attachedTo && ownerOf(st, m.attachedTo) === side) return true;
            }
            return false;
          };
          if (!has('A') || !has('B')) return deny(`ใช้ "${c.name}" ไม่ได้ — ทั้งสองฝ่ายต้องมี Modification สวมอยู่`);
        }
        if (ab.requireLand) {
          const lands = (st.zones['land'] || []).filter(id => st.inst[id] && st.inst[id].faceUp);
          if (!lands.length) return deny(`ใช้ "${c.name}" ไม่ได้ — ต้องมี Land Magic หงายอยู่`);
        }
        if (ab.requireOwn) {
          const ro = ab.requireOwn;
          const ok = (st.zones[owner + '.avatar'] || []).some(id => {
            const x = st.inst[id]; if (!x) return false;
            if (ro.symbol && x.symbol !== ro.symbol) return false;
            if (ro.costMin != null && effCost(st, id) < ro.costMin) return false;
            if (ro.nameIncludes && !nameMatches(x, ro.nameIncludes)) return false;
            return true;
          });
          if (!ok) return deny(`ใช้ "${c.name}" ไม่ได้ — ไม่ตรงเงื่อนไขบนสนาม`);
        }
        if (ab.requireBothHaveAvatar) {
          if (!(st.zones['A.avatar'] || []).length || !(st.zones['B.avatar'] || []).length)
            return deny(`ใช้ "${c.name}" ไม่ได้ — ต้องมี Avatar ทั้งสองฝ่าย`);
        }
        if (ab.requireEnemyCostSumMax != null) {
          const opp = other(owner);
          const sum = (st.zones[opp + '.avatar'] || []).reduce((n, id) => n + effCost(st, id), 0);
          if (sum > ab.requireEnemyCostSumMax)
            return deny(`ใช้ "${c.name}" ไม่ได้ — Cost รวมศัตรู ${sum} > ${ab.requireEnemyCostSumMax}`);
        }
        if (ab.requireEnemyAvatarMin != null) {
          const opp = other(owner);
          const n = (st.zones[opp + '.avatar'] || []).length;
          if (n < ab.requireEnemyAvatarMin)
            return deny(`ใช้ "${c.name}" ไม่ได้ — ศัตรูต้องมี Avatar ≥ ${ab.requireEnemyAvatarMin} (ตอนนี้ ${n})`);
        }
        if (ab.requireAvatarCountExact != null) {
          const n = (st.zones['A.avatar'] || []).length + (st.zones['B.avatar'] || []).length;
          if (n !== ab.requireAvatarCountExact)
            return deny(`ใช้ "${c.name}" ไม่ได้ — ต้องมี Avatar รวม ${ab.requireAvatarCountExact} ใบ (ตอนนี้ ${n})`);
        }
        if (ab.cost && ab.cost.length) {
          const costOp = ab.cost[0];
          if (costOp.op === 'discard') {
            const filt = Object.assign({}, costOp.filter || {});
            if (costOp.gemMin != null) filt.gemMin = costOp.gemMin;
            const legal = (st.zones[owner + '.hand'] || []).filter(x => x !== a.k && matchFilterEx(st, x, filt));
            if (!legal.length) return deny(`ใช้ "${c.name}" ไม่ได้ — ไม่มีการ์ดตรงเงื่อนไขในมือให้ทิ้งจ่าย`);
            doMove(st, a.k, owner + '.magic', null, fx);
            // count จาก cost เท่านั้น — ห้ามใช้จำนวนจั่ว/ผลเวทมาเป็นจำนวนทิ้ง
            const needDiscard = Math.max(1, Math.floor(+costOp.count || 1));
            addLog(st, owner, `ใช้เวท ${c.name} — ทิ้งจ่ายค่า ${needDiscard} ใบ${filt.symbol ? ' (symbol ' + filt.symbol + ')' : ''}`);
            st.prompts.push({
              kind: 'chooseDiscard', src: a.k, chooser: owner, filter: filt,
              actions: (ab.actions || []).slice(),
              discardNeed: needDiscard, discardGot: 0, magicCostDiscard: true
            });
          } else if (costOp.op === 'discardGemSum') {
            const hand = (st.zones[owner + '.hand'] || []).filter(x => x !== a.k);
            const total = hand.reduce((n, id) => n + (+(st.inst[id] && st.inst[id].gem) || 0), 0);
            if (total < (costOp.min || 3)) return deny(`ใช้ "${c.name}" ไม่ได้ — GEM ในมือรวม ${total} < ${costOp.min || 3}`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, `ใช้เวท ${c.name} — ทิ้งมือรวม GEM ≥ ${costOp.min || 3}`);
            st.prompts.push({ kind: 'chooseDiscard', src: a.k, chooser: owner, gemSumMin: costOp.min || 3, gemGot: 0, actions: ab.actions, effectDiscard: true });
          } else if (costOp.op === 'returnHandToDeck') {
            const legal = (st.zones[owner + '.hand'] || []).filter(x => x !== a.k && matchFilterEx(st, x, costOp.filter));
            if (!legal.length) return deny(`ใช้ "${c.name}" ไม่ได้ — ไม่มีการ์ดในมือคืนเด็ค`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, `ใช้เวท ${c.name} — เลือกการ์ดในมือคืนเด็ค`);
            st.prompts.push({ kind: 'chooseDiscard', src: a.k, chooser: owner, filter: costOp.filter, actions: ab.actions, toDeck: true, effectDiscard: true });
          } else if (costOp.op === 'sacrifice') {
            const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: costOp.filter, dest: 'sacrifice', actions: ab.actions, optional: false };
            if (!promptCandidates(st, p).length) return deny(`ใช้ "${c.name}" ไม่ได้ — ไม่มีการ์ดบนสนามให้เซ่นไหว้`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, `ใช้เวท ${c.name} — เลือกการ์ดเซ่นไหว้`);
            st.prompts.push(p);
          }
          fireEnemyActivate(st, fx, owner, rng); // ศัตรูใช้ความสามารถ (เวทมีค่าใช้จ่าย)
          fx.snd = 'place'; break;
        }
        doMove(st, a.k, owner + '.magic', null, fx);
        addLog(st, owner, `ใช้เวท ${c.name}`);
        fx.snd = 'place';
        if (offerMagicNegateReact(st, fx, owner, a.k)) {
          st._pendingMagic = { type: 'activated', src: a.k, owner, actions: ab.actions };
          break;
        }
        enterChainOrResolve(st, fx, { src: a.k, owner, actions: ab.actions });
        fireEnemyActivate(st, fx, owner, rng); // ศัตรูใช้ความสามารถ (เวทปกติ)
        break;
      }

      case 'attach': {
        const c = st.inst[a.k], host = st.inst[a.to];
        const from = zoneOf(st, a.k), hz = zoneOf(st, a.to);
        if (!c || !host || !from || !hz || !hz.endsWith('.avatar')) break;
        if (c.subtype !== 'Modification') return deny('สวมใส่ได้เฉพาะ Magic ชนิด Modification');
        // ★ แมนนวล: สวมใส่ได้จาก "Magic Zone" เท่านั้น — เล่นการ์ดลง Magic Zone ก่อน แล้วค่อยสวมให้ Avatar
        if (!from.endsWith('.magic')) return deny('สวมใส่ได้เฉพาะการ์ดที่อยู่ใน Magic Zone — เล่นการ์ดลง Magic Zone ก่อน');
        if (strict && isPlayer) {
          if (from[0] !== by) return deny('สวมใส่ได้เฉพาะการ์ดฝั่งตัวเอง');
          if (st.active !== by) return deny('สวมใส่ได้ในเทิร์นของคุณ');
          if (st.phase !== 'Main') return deny('สวมใส่ได้เฉพาะเฟส Main');
        }
        {
          const ad = attachOnlyDeny(st, c.code, a.to);
          if (ad) return deny(`"${c.name}" ${ad}`);
        }
        // ★ การ์ดที่สวมใส่ "ไม่หายจาก Magic Zone" ตอนสวม — ค้างอยู่ที่เดิม แค่ผูกกับ Avatar (client ลากเส้น)
        //    แต่ถ้าโฮสต์ออกจากสนาม ใบสวมจะถูกย้ายลงนรกตาม (ดู doMove)
        const pBefore = effPower(st, a.to);
        c.attachedTo = a.to; c.faceUp = true;
        const pAfter = effPower(st, a.to);
        addLog(st, hz[0], `🔗 สวมใส่ ${c.name} → ${host.name}${pAfter !== pBefore ? ` (POWER ${pBefore} → ${pAfter})` : ''} · การ์ดยังอยู่ใน Magic Zone`);
        fx.announce = { src: a.k, tgt: a.to, srcName: c.name, tgtName: host.name, by: by || hz[0], kind: 'attach', pa: pBefore, pd: pAfter };
        fx.attach = { mod: a.k, host: a.to, pBefore, pAfter };
        fireWeaponModAttached(st, fx, a.k, rng);
        fx.snd = 'place'; break;
      }

      case 'detach': {
        const c = st.inst[a.k]; if (!c || !c.attachedTo) break;
        const host = c.attachedTo, side = ownerOf(st, host);
        if (strict && isPlayer && side !== by) return deny('ถอดได้เฉพาะของฝั่งตัวเอง');
        c.attachedTo = null;
        // การ์ดยังอยู่ใน Magic Zone อยู่แล้ว → แค่ตัดสาย ไม่ต้องย้ายไปไหน (ผู้เล่นลากลงนรกเองถ้าต้องการ)
        addLog(st, side === 'S' ? (by || 'A') : side, `✂️ ถอด ${c.name} ออกจาก ${nameOf(st, host)} (การ์ดยังอยู่ใน Magic Zone)`);
        fx.snd = 'tap';
        break;
      }

      case 'chooseTarget': {
        const p = st.prompts[0]; if (!p) break;
        if (isPlayer && by !== p.chooser) return deny('ยังไม่ใช่ตาคุณเลือกเป้า');
        // อวตารนารายณ์จากมือ
        if (p.kind === 'naraiHandForm') {
          const opt = (p.options || []).find(o => o.k === a.k);
          if (!opt) return deny('เลือกอวตารจากมือที่เสนอ');
          st.prompts.shift();
          const tag = (opt.ab && opt.ab.oncePerTurnByName) || (st.inst[a.k] && st.inst[a.k].name) || a.k;
          st._naraiFormOnce = st._naraiFormOnce || {};
          st._naraiFormOnce[p.chooser + ':' + (st.turnSeq || st.turn) + ':' + tag] = true;
          runActions(st, fx, (opt.ab && opt.ab.actions) || [], { src: a.k, owner: p.chooser, rng });
          fx.snd = 'place';
          break;
        }
        // โดนธรณีสูบแล้วเลือกใช้ผล (แว่น / สัญญาเลือด)
        if (p.kind === 'milledOptional') {
          if (a.k !== p.src) return deny('แตะการ์ดที่โดนธรณีสูบ หรือกดข้าม');
          st.prompts.shift();
          runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
          fx.snd = 'place';
          break;
        }
        if (!promptTargetOk(st, a.k)) return deny('เป้าหมายไม่ตรงเงื่อนไขเอฟเฟกต์');
        // React แบบเลือกใบ (อุบัติเหตุ / ชายจากอนาคต ฯลฯ) — แตะใบที่กะพริบ = เปิดใช้ใบนั้น
        if (p.kind === 'react') {
          if (!bindReactPromptCard(st, p, a.k)) return deny('ใช้ React ใบนี้ไม่ได้');
          a = Object.assign({}, a, { type: 'reactYes', k: a.k });
          // fall through intentionally — re-enter via nested apply would double post-hooks; run inline:
          {
            const m = st.inst[p.src];
            const mz = zoneOf(st, p.src) || '';
            if (!m || !(mz.endsWith('.magic') || mz.endsWith('.hand'))) { st.prompts.shift(); break; }
            const mtype = m.subtype || 'React';
            const enforceType = mtype === 'React' || !!st.strict;
            if (enforceType) {
              if (isMagicTypeUsed(st, p.chooser, mtype))
                return deny(`ใช้เวทประเภท "${mtype}" ครบ 1 ครั้งแล้วในเทิร์นนี้ (ประเภทละ 1 ครั้ง/เทิร์น)`);
              markMagicTypeUsed(st, p.chooser, mtype);
            }
            const pendingSummon = p.pendingSummon || null;
            st.prompts.shift();
            if (mz.endsWith('.hand')) { doMove(st, p.src, p.chooser + '.magic', null, fx); }
            m.faceUp = true;
            addLog(st, p.chooser, `เปิด React "${m.name}"!`);
            if (p.magicNegate || p.mode === 'negateMagic') {
              const pend = st._pendingMagic; delete st._pendingMagic;
              if (p.target && st.inst[p.target] && zoneOf(st, p.target)) {
                const magOwner = ownerOf(st, p.target);
                addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ยกเลิกการใช้ "${nameOf(st, p.target)}"`);
                doMove(st, p.target, (magOwner === 'S' ? 'A' : magOwner) + '.hell', null, fx);
              }
              doMove(st, p.src, p.chooser + '.hell', null, fx);
              if (pend && pend.pendingSummon) resumePendingSummon(st, fx, pend.pendingSummon);
              fx.snd = 'clash';
              break;
            }
            if (p.abilityReact) {
              delete st._pendingAbility;
              addLog(st, 'S', `เชาว์ปัญญาลิง: ยกเลิกความสามารถของ ${nameOf(st, p.target)}`);
            } else if (offerMagicNegateReact(st, fx, p.chooser, p.src)) {
              st._pendingMagic = {
                type: 'reactActions', src: p.src, owner: p.chooser,
                actions: p.actions || [], target: p.target, triggerSource: p.target,
                mode: p.mode || 'runActions', pendingSummon
              };
              fx.snd = 'place';
              break;
            }
            if (p.mode === 'destroyAttacker') {
              if (st.inst[p.target] && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ส่ง ${nameOf(st, p.target)} ที่ประกาศโจมตีลงนรก`);
                destroyCard(st, fx, p.target);
              }
              if (st.pending && st.pending.atk === p.target) { st.pending = null; addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่แล้ว'); }
            } else if (p.actions && p.actions.length) {
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
            } else {
              const tgt = st.inst[p.target];
              if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ทำลาย ${tgt.name} — ส่งนรกแล้ว`);
                destroyCard(st, fx, p.target);
              }
            }
            doMove(st, p.src, p.chooser + '.hell', null, fx);
            if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
            fx.snd = 'clash';
          }
          break;
        }
        if (p.kind === 'chooseBuff') {
          // มาติเนซ: รถถังโดนเวทเล็ง → บังคับทำลายมาติเนซ ยกเลิกเวท
          if (tryMartinezNegate(st, fx, a.k, p)) { st.prompts.shift(); break; }
          if (p.until === 'permanent') {
            st.inst[a.k].powerDelta = (st.inst[a.k].powerDelta || 0) + (p.amt || 0);
            st.inst[a.k].powerDeltaFrom = st.inst[a.k].powerDeltaFrom || [];
            st.inst[a.k].powerDeltaFrom.push({ amt: p.amt || 0, from: p.src, fromName: nameOf(st, p.src) });
            if (p.amt > 0) notePowerBuff(st, a.k, p.amt);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} POWER ${p.amt > 0 ? '+' : ''}${p.amt} (ถาวรจนออกสนาม) → P${effPower(st, a.k)}`);
          } else {
            st.buffs.push({ k: a.k, amt: p.amt, until: p.until || 'endOfTurn', from: p.src });
            if (p.amt > 0) notePowerBuff(st, a.k, p.amt);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} POWER ${p.amt > 0 ? '+' : ''}${p.amt}${p.until === 'oppNextEnd' ? ' จน End Phase ถัดไปของฝ่ายตรงข้าม' : ' จนจบเทิร์น'} → P${effPower(st, a.k)}`);
          }
          if (p.destroyAtEnd) {
            st.scheduled.push({ player: st.active, op: 'destroyCard', k: a.k, when: 'endPhase' });
            addLog(st, 'S', `${nameOf(st, a.k)} จะถูกทำลายช่วง End Phase`);
          }
          st.prompts.shift();
          if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          fx.snd = 'tap';
        } else if (p.kind === 'chooseDiscard') {
          if (p.toDeck) {
            doMove(st, a.k, p.chooser + '.deck', null, fx);
            seededShuffle(st.zones[p.chooser + '.deck'], rng);
            syncHeimdall(st);
            addLog(st, p.chooser, `คืน ${nameOf(st, a.k)} เข้าเด็คแล้วสับ`);
          } else {
            const gemAdd = +(st.inst[a.k].gem) || 0;
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            addLog(st, p.chooser, p.effectDiscard ? `ทิ้ง ${nameOf(st, a.k)}${p.gemSumMin != null ? ` (GEM +${gemAdd})` : ''}` : `ทิ้ง ${nameOf(st, a.k)} จ่ายค่าเวท`);
            if (p.gemSumMin != null) {
              p.gemGot = (p.gemGot || 0) + gemAdd;
              st.prompts.shift();
              if (p.gemGot < p.gemSumMin) {
                if (!promptCandidates(st, p).length) {
                  addLog(st, 'S', `GEM รวมได้ ${p.gemGot}/${p.gemSumMin} — มือหมด ข้ามเอฟเฟกต์`);
                } else {
                  st.prompts.unshift(p);
                  addLog(st, p.chooser, `GEM รวม ${p.gemGot}/${p.gemSumMin} — ทิ้งต่อ`);
                }
                fx.snd = 'tap';
                break;
              }
              addLog(st, p.chooser, `GEM รวมครบ ${p.gemGot} ≥ ${p.gemSumMin}`);
              if (p.actions && p.actions.length) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, toHellAfter: false, rng: rng });
              else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
              fx.snd = 'tap';
              break;
            }
            // จ่ายค่าเวทแบบทิ้ง N ใบ (รวม N=1) — นับทีละใบจนครบ แล้วค่อยรันผล
            if (p.discardNeed != null) {
              p.discardGot = (p.discardGot || 0) + 1;
              st.prompts.shift();
              if (p.discardGot < p.discardNeed) {
                if (!promptCandidates(st, p).length) {
                  addLog(st, 'S', `ทิ้งได้ ${p.discardGot}/${p.discardNeed} — มือหมด ข้ามเอฟเฟกต์`);
                  if (p.magicCostDiscard && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
                } else {
                  st.prompts.unshift(p);
                  addLog(st, p.chooser, `ทิ้งแล้ว ${p.discardGot}/${p.discardNeed} — เลือกใบถัดไป`);
                }
                fx.snd = 'tap';
                break;
              }
              addLog(st, p.chooser, `ทิ้งจ่ายค่าครบ ${p.discardGot}/${p.discardNeed} ใบ — ทำงานเอฟเฟกต์`);
              if (p.actions && p.actions.length) {
                if (p.magicCostDiscard || p.effectDiscard) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, toHellAfter: !!p.magicCostDiscard, rng: rng });
                else enterChainOrResolve(st, fx, { src: p.src, owner: p.chooser, actions: p.actions });
              } else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
              fx.snd = 'tap';
              break;
            }
          }
          st.prompts.shift();
          if (p.effectDiscard || p.toDeck) {
            if (p.actions && p.actions.length) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, toHellAfter: !!p.srcToHell || (!p.effectDiscard && !p.toDeck), rng: rng });
            else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          } else {
            enterChainOrResolve(st, fx, { src: p.src, owner: p.chooser, actions: p.actions || [] });
          }
        } else if (p.kind === 'chooseDestroy') {
          if (tryMartinezNegate(st, fx, a.k, p)) { st.prompts.shift(); break; }
          addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ทำลาย ${nameOf(st, a.k)}`);
          st.prompts.shift();
          destroyCard(st, fx, a.k, p.ignoreProtect ? { ignoreProtect: true } : { fromOppMagic: !!p.fromOppMagic, fromOppCard: !!p.fromOppCard, byOpp: !!p.byOpp });
          if (p.afterAlienGive) {
            (p.alienRevealed || []).forEach(k => { if (st.inst[k]) delete st.inst[k].revealed; });
            pushAlienGive(st, p.src, p.chooser);
          } else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          fx.snd = 'clash';
        } else if (p.kind === 'pick') {
          st.prompts.shift();
          if (p.dest === 'sacrifice') {
            addLog(st, p.chooser, `เซ่นไหว้ ${nameOf(st, a.k)}`);
            destroyCard(st, fx, a.k);
            // keepSrc = ความสามารถ Avatar บนสนาม (เช่น ไพรมอลตื่น) — ห้าม toHellAfter แบบเวท
            if (p.keepSrc) runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng: rng });
            else enterChainOrResolve(st, fx, { src: p.src, owner: p.chooser, actions: p.actions });
          } else if (p.dest === 'sacSummon') {
            const sk = p.src; // การ์ดที่จะอัญเชิญ (ยังในมือ)
            const sacP = effPower(st, a.k);
            addLog(st, p.chooser, `ส่ง ${nameOf(st, a.k)} (P${sacP}) ลงนรก เพื่ออัญเชิญ ${nameOf(st, sk)}`);
            destroyCard(st, fx, a.k, { ignoreProtect: true });
            const printed = +(st.inst[sk].power) || 0;
            st.inst[sk].powerDelta = sacP - printed;
            const to = p.summonTo || (p.chooser + '.avatar');
            const qd = quotaDeny(st, to, st.inst[sk]);
            if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
            else {
              doMove(st, sk, to, null, fx);
              addLog(st, p.chooser, `อัญเชิญ ${nameOf(st, sk)} POWER = ${sacP} (จากกบที่เซ่น)`);
              triggerSummon(st, fx, sk, p.chooser, { paidCost: false });
            }
            fx.snd = 'place';
          } else if (p.dest === 'sacrificeOnly') {
            const sacC = st.inst[a.k];
            const sacInfo = sacC ? { symbol: sacC.symbol, name: sacC.name, k: a.k } : null;
            addLog(st, p.chooser, `เซ่นไหว้ ${nameOf(st, a.k)}`);
            destroyCard(st, fx, a.k);
            fx.snd = 'clash';
            if (p.then && p.then.length && sacInfo) {
              runActions(st, fx, p.then, { src: p.src, owner: p.chooser, sacrificed: sacInfo, rng: rng });
            }
          } else if (p.dest === 'avatar') {
            const fromZ = zoneOf(st, a.k) || '';
            if (fromZ.endsWith('.hell')) {
              const blk = hellSummonBlocked(st);
              if (blk) { addLog(st, 'S', `อัญเชิญจากนรกไม่ได้ — ${blk} บล็อก`); break; }
            }
            const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[a.k]);
            if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd}) — ${nameOf(st, a.k)} ขึ้นมือแทน`), doMove(st, a.k, p.chooser + '.hand', null, fx);
            else {
              doMove(st, a.k, p.chooser + '.avatar', null, fx);
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: อัญเชิญ ${nameOf(st, a.k)} ลงสนาม`);
              triggerSummon(st, fx, a.k, p.chooser, { paidCost: !!p.paidCost, summonedByAvatar: p.summonedByAvatar || null });
              if (p.thenAttachSrc && st.inst[p.src]) {
                if (equipOnto(st, p.src, a.k))
                  addLog(st, p.chooser, `โฟเบีย: สวมใส่ตัวเองให้ ${nameOf(st, a.k)}`);
              }
              if (p.thenIfColor) {
                const col = (st.inst[a.k] && st.inst[a.k].color) || '';
                const acts = p.thenIfColor[col];
                if (acts && acts.length) runActions(st, fx, acts, { src: p.src, owner: p.chooser, rng });
              }
            }
          } else if (p.dest === 'renameAttach') {
            const enemy = st.inst[a.k];
            if (enemy) {
              enemy.name = p.renameTo || 'โอตะ';
              addLog(st, p.chooser, `ทัตดนัยซัง: เปลี่ยนชื่อเป็น "${enemy.name}"`);
              const hosts = (st.zones[p.chooser + '.avatar'] || []).filter(id => matchFilterEx(st, id, p.attachToFilter || {}));
              if (hosts.length) {
                if (equipOnto(st, a.k, hosts[0]))
                  addLog(st, p.chooser, `สวมใส่ ${enemy.name} ให้ ${nameOf(st, hosts[0])}`);
              } else addLog(st, 'S', `ไม่มีไอดอลให้สวม`);
              if (p.thenIfOwnNameIncludes && (st.zones[p.chooser + '.avatar'] || []).some(id => nameMatches(st.inst[id], p.thenIfOwnNameIncludes.name))) {
                runActions(st, fx, p.thenIfOwnNameIncludes.actions || [], { src: p.src, owner: p.chooser, rng });
              }
            }
          } else if (p.dest === 'naraiSacSummon') {
            // ส่งนารายณ์ที่เลือกลงนรก → อัญเชิญใบจากมือ (p.src) → รัน then
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            const form = p.src;
            if (st.inst[form] && (zoneOf(st, form) || '').endsWith('.hand')) {
              const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[form]);
              if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
              else {
                doMove(st, form, p.chooser + '.avatar', null, fx);
                delete st.inst[form]._halvedPrintedOnce;
                addLog(st, p.chooser, `อัญเชิญอวตาร ${nameOf(st, form)} (ส่ง ${nameOf(st, a.k)} ลงนรก)`);
                fx.snd = 'place';
                if (p.then && p.then.length) runActions(st, fx, p.then, { src: form, owner: p.chooser, rng });
              }
            }
          } else if (p.dest === 'jackReplaceLand') {
            destroyCard(st, fx, a.k);
            const deckLands = (st.zones[p.chooser + '.deck'] || []).filter(id => st.inst[id] && st.inst[id].subtype === 'Land');
            if (!deckLands.length) addLog(st, 'S', `ไม่มี Land ในเด็ค`);
            else {
              st.prompts.unshift({
                kind: 'pick', from: 'ids', ids: deckLands, src: p.src, chooser: p.chooser,
                dest: 'playLandFromDeck', optional: false, allowAnyZone: true, shuffleAfter: true
              });
              addLog(st, p.chooser, `เลือก Land จากเด็คเล่น`);
            }
          } else if (p.dest === 'playLandFromDeck') {
            clearLandZoneFor(st, fx, a.k);
            doMove(st, a.k, 'land', null, fx);
            st.inst[a.k].faceUp = true;
            st.inst[a.k].controller = p.chooser;
            addLog(st, p.chooser, `เล่น Land ${nameOf(st, a.k)} จากเด็ค`);
            if (p.shuffleAfter) {
              const d = st.zones[p.chooser + '.deck'];
              for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
            }
            fx.snd = 'place';
          } else if (p.dest === 'mayuraHost') {
            const host = a.k;
            const fromHell = (st.zones[p.chooser + '.hell'] || []).filter(id => nameMatches(st.inst[id], 'โอตะ'));
            const fromDeck = p.allowDeckOta ? (st.zones[p.chooser + '.deck'] || []).filter(id => nameMatches(st.inst[id], 'โอตะ')) : [];
            const pool = fromHell.concat(fromDeck);
            if (!pool.length) addLog(st, 'S', `ไม่มีโอตะในนรก/เด็ค`);
            else {
              st.prompts.unshift({
                kind: 'pick', from: 'ids', ids: pool, src: p.src, chooser: p.chooser,
                dest: 'attachTo', attachMod: null, hostFixed: host, optional: false, allowAnyZone: true, shuffleAfter: fromDeck.length > 0
              });
              // special: set attachMod on choose — use dest mayuraOta
              st.prompts[0].dest = 'mayuraOta';
              st.prompts[0].hostFixed = host;
              addLog(st, p.chooser, `เลือกโอตะมาสวม ${nameOf(st, host)}`);
            }
          } else if (p.dest === 'mayuraOta') {
            if (equipOnto(st, a.k, p.hostFixed)) {
              addLog(st, p.chooser, `มยุราซัง: สวม ${nameOf(st, a.k)} ให้ ${nameOf(st, p.hostFixed)}`);
              if ((zoneOf(st, a.k) || '').startsWith(p.chooser) && p.shuffleAfter) {
                const d = st.zones[p.chooser + '.deck'];
                for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
              }
            }
          } else if (p.dest === 'grantAttackAll') {
            st.inst[a.k].attackAllEnemyUntilEOT = true;
            addLog(st, p.chooser, `THE END: ${nameOf(st, a.k)} โจมตี Avatar ศัตรูทุกใบพร้อมกัน จนจบเทิร์น`);
          } else if (p.dest === 'exileHellCost') {
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            p.got = (p.got || 0) + 1;
            addLog(st, p.chooser, `เนรเทศ ${nameOf(st, a.k)} (${p.got}/${p.need})`);
            if (p.got < (p.need || 1) && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
            } else {
              runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
            }
          } else if (p.dest === 'exileDistinctCost') {
            const nm = (st.inst[a.k] && st.inst[a.k].name) || '';
            p.seenNames = p.seenNames || {};
            if (p.seenNames[nm]) {
              addLog(st, 'S', `ชื่อ "${nm}" เนรเทศไปแล้ว — เลือกชื่ออื่น`);
              st.prompts.unshift(p);
              break;
            }
            p.seenNames[nm] = true;
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            p.got = (p.got || 0) + 1;
            addLog(st, p.chooser, `เนรเทศ ${nm} (${p.got}/${p.need})`);
            if (p.got < (p.need || 3) && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
            } else if (p.got >= (p.need || 3)) {
              runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
            } else {
              addLog(st, 'S', `เนรเทศไม่ครบ — ยกเลิก`);
            }
          } else if (p.dest === 'giveHandNegate') {
            const opp = other(p.chooser);
            doMove(st, a.k, opp + '.hand', null, fx);
            markMagicTypeUsed(st, p.chooser, 'React');
            if (st._pendingMagic) {
              st._pendingMagic.negated = true;
              addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} — ยกเลิกความสามารถ`);
              delete st._pendingMagic;
            } else if (st.chain && st.chain.length) {
              st.chain[st.chain.length - 1].negated = true;
              addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} — ยกเลิกบนเชน`);
            } else addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} (ไม่มีเวทค้างให้ยกเลิก)`);
            if (!claimOncePerTurn(st, p.src, 'richNegate')) { /* already marked via once on ability */ }
          } else if (p.dest === 'exileDistinctHell') {
            const nm = (st.inst[a.k] && st.inst[a.k].name) || '';
            p.seenNames = p.seenNames || {};
            if (p.seenNames[nm]) {
              addLog(st, 'S', `ชื่อ "${nm}" เนรเทศไปแล้วในรอบนี้ — เลือกชื่ออื่น`);
              st.prompts.unshift(p);
              break;
            }
            p.seenNames[nm] = true;
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            p.multiGot = (p.multiGot || 0) + 1;
            addLog(st, p.chooser, `เนรเทศ ${nm} ลงมิติมืด (${p.multiGot})`);
            if (promptCandidates(st, p).length) {
              st.prompts.unshift(p);
              addLog(st, p.chooser, `เนรเทศเพิ่มได้ (ชื่อไม่ซ้ำ) หรือกดข้าม`);
            } else {
              const amt = (p.thenBuffSelfPer || 1) * (p.multiGot || 0);
              if (amt && st.inst[p.src]) {
                st.buffs.push({ k: p.src, amt, until: p.duration || 'endOfTurn' });
                addLog(st, p.chooser, `กินซาก: POWER +${amt} จนจบเทิร์น`);
              }
            }
            fx.snd = 'place';
          } else if (p.dest === 'hellBuildConstruct') {
            const cost = effCost(st, a.k);
            if ((p.costGot || 0) + cost > (p.costSumMax || 5)) {
              addLog(st, 'S', `Cost รวมจะเกิน ${p.costSumMax} — เลือกใบอื่นหรือข้าม`);
              st.prompts.unshift(p);
              break;
            }
            const qd = quotaDeny(st, p.chooser + '.construct', st.inst[a.k]);
            if (qd) { addLog(st, 'S', `ก่อสร้างไม่ได้ (${qd})`); st.prompts.unshift(p); break; }
            doMove(st, a.k, p.chooser + '.construct', null, fx);
            if (st.inst[a.k]) st.inst[a.k].faceUp = true;
            p.costGot = (p.costGot || 0) + cost;
            p.multiGot = (p.multiGot || 0) + 1;
            addLog(st, p.chooser, `ก่อสร้าง ${nameOf(st, a.k)} (Cost รวม ${p.costGot}/${p.costSumMax})`);
            abil(st, a.k, 'constructed').forEach(ab => runActions(st, fx, ab.actions, { src: a.k, owner: p.chooser, rng }));
            if ((p.multiGot || 0) < (p.multiMax || 2) && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
              addLog(st, p.chooser, `ก่อสร้างเพิ่มได้ หรือกดข้าม`);
            }
            fx.snd = 'place';
          } else if (p.dest === 'buildConstructFree') {
            const qd = quotaDeny(st, p.chooser + '.construct', st.inst[a.k]);
            if (qd) addLog(st, 'S', `ก่อสร้างไม่ได้ (${qd})`);
            else {
              doMove(st, a.k, p.chooser + '.construct', null, fx);
              if (st.inst[a.k]) st.inst[a.k].faceUp = true;
              addLog(st, p.chooser, `ก่อสร้าง ${nameOf(st, a.k)} (ไม่จ่าย Cost)`);
              abil(st, a.k, 'constructed').forEach(ab => runActions(st, fx, ab.actions, { src: a.k, owner: p.chooser, rng }));
              fx.snd = 'place';
            }
          } else if (p.dest === 'discardSumCostSummon') {
            const cost = +(st.inst[a.k].cost) || 0;
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            p.costSum = (p.costSum || 0) + cost;
            p.multiGot = (p.multiGot || 0) + 1;
            p.ids = (p.ids || []).filter(x => x !== a.k);
            addLog(st, p.chooser, `ทิ้ง ${nameOf(st, a.k)} (Cost ${cost}) — รวม Cost ${p.costSum}`);
            if ((p.ids || []).some(x => (st.zones[p.chooser + '.hand'] || []).includes(x) && matchFilterEx(st, x, p.filter))) {
              st.prompts.unshift(Object.assign({}, p, { ids: (st.zones[p.chooser + '.hand'] || []).filter(x => matchFilterEx(st, x, p.filter)) }));
              addLog(st, p.chooser, `ทิ้งเพิ่มได้ หรือกดข้ามเพื่ออัญเชิญ Cost≤${p.costSum}`);
            } else {
              const filt = Object.assign({}, p.summonFilter || {}, { costMax: p.costSum || 0 });
              const sp = { kind: 'pick', from: 'deckAll', src: p.src, chooser: p.chooser, filter: filt, dest: 'avatar', paidCost: false, shuffleAfter: !!p.shuffleAfter, optional: true };
              if (promptCandidates(st, sp).length) {
                st.prompts.unshift(sp);
                addLog(st, p.chooser, `อัญเชิญรัททาทุย Cost≤${p.costSum} จากเด็ค (ฟรี ไม่จุติ)`);
              } else addLog(st, 'S', `ไม่มีรัททาทุย Cost≤${p.costSum} ในเด็ค`);
            }
            fx.snd = 'tap';
          } else if (p.dest === 'preventLeavePick') {
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            p.got = (p.got || 0) + 1;
            addLog(st, p.chooser, `เนรเทศ ${nameOf(st, a.k)} (${p.got}/${p.need})`);
            if (p.got < p.need && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
            } else if (p.got >= p.need) {
              delete st._preventLeavePending;
              addLog(st, p.chooser, `เนรเทศครบ ${p.need} ใบ — ${nameOf(st, p.stayK)} ไม่ออกจากสนาม`);
            } else {
              // ไม่ครบ → ออกสนามตามเดิม
              resumePreventLeaveFail(st, fx);
            }
            fx.snd = 'place';
          } else if (p.dest === 'hell') {
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ส่ง ${nameOf(st, a.k)} ลงนรก`);
          } else if (p.dest === 'deckTop') {
            doMove(st, a.k, p.chooser + '.deck', null, fx); // push = บนสุด
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: วาง ${nameOf(st, a.k)} บนสุดเด็ค`);
          } else if (p.dest === 'bounceTappedDeckDraw') {
            const own = ownerOf(st, a.k);
            const side = own === 'S' ? p.chooser : own;
            doMove(st, a.k, side + '.deck', null, fx);
            seededShuffle(st.zones[side + '.deck'], rng);
            syncHeimdall(st);
            const d = st.zones[side + '.deck'];
            if (d.length) { st.zones[side + '.hand'].push(d.pop()); }
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} กลับเด็ค ${side} สับ แล้ว ${side} จั่ว 1`);
            fx.snd = 'draw';
          } else if (p.dest === 'multiAvatar') {
            const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[a.k]);
            if (qd) addLog(st, 'S', `ลงไม่ได้ (${qd})`);
            else {
              doMove(st, a.k, p.chooser + '.avatar', null, fx);
              addLog(st, p.chooser, `อัญเชิญ ${nameOf(st, a.k)} จากสอดแนม`);
              triggerSummon(st, fx, a.k, p.chooser, { paidCost: !!p.paidCost, summonedByAvatar: p.summonedByAvatar || null });
              p.multiGot = (p.multiGot || 0) + 1;
              if (p.thenIfColor) {
                const col = (st.inst[a.k] && st.inst[a.k].color) || '';
                const acts = p.thenIfColor[col];
                if (acts && acts.length) runActions(st, fx, acts, { src: p.src, owner: p.chooser, rng });
              }
            }
            const need = p.multiExact || null;
            const left = promptCandidates(st, p);
            const room = !quotaDeny(st, p.chooser + '.avatar', { type: 'Avatar' });
            const got = p.multiGot || 0;
            const maxN = p.multiMax != null ? p.multiMax : (need || 99);
            const minN = p.multiMin || 0;
            if (need && got < need && left.length && room) {
              st.prompts.unshift(Object.assign({}, p, { ids: p.from === 'ids' ? (p.ids || []).filter(x => x !== a.k) : p.ids, optional: false }));
              addLog(st, p.chooser, `ต้องอัญเชิญให้ครบ ${need} ใบ (ตอนนี้ ${got})`);
            } else if (!need && left.length && room && got < maxN) {
              const mustMore = got < minN;
              st.prompts.unshift(Object.assign({}, p, { ids: p.from === 'ids' ? (p.ids || []).filter(x => x !== a.k) : p.ids, optional: !mustMore }));
              addLog(st, p.chooser, mustMore
                ? `ต้องอัญเชิญอย่างน้อย ${minN} ใบ (ตอนนี้ ${got})`
                : `เลือกเพิ่มได้สูงสุด ${maxN} ใบ (หรือข้าม)`);
            } else {
              if (need && got < need) addLog(st, 'S', `ต้องการ ${need} ใบ แต่ได้น้อยกว่า — จุติไม่ครบ`);
              else if (minN && got < minN) addLog(st, 'S', `ต้องการอย่างน้อย ${minN} ใบ แต่ได้น้อยกว่า`);
              if (p.from === 'ids' && p.restTo === 'bottom') {
                const rest = (p.ids || []).filter(x => x !== a.k && (st.zones[p.chooser + '.deck'] || []).includes(x));
                rest.forEach(x => {
                  st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
                  st.zones[p.chooser + '.deck'].unshift(x);
                });
              }
              if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); syncHeimdall(st); }
            }
            fx.snd = 'place';
          } else if (p.dest === 'takeControl') {
            const block = controlImmuneBlock(st, a.k, p.src);
            if (block) { addLog(st, 'S', block); }
            else {
              const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[a.k]);
              if (qd) addLog(st, 'S', `ยึดไม่ได้ (${qd})`);
              else {
                const fromOwner = ownerOf(st, a.k);
                doMove(st, a.k, p.chooser + '.avatar', null, fx);
                if (p.keepTapped !== false) st.inst[a.k].tapped = true;
                addLog(st, p.chooser, `⛓️ เอฟเฟกต์ ${nameOf(st, p.src)}: ยึดการควบคุม ${nameOf(st, a.k)} มาฝั่งเรา${p.keepTapped !== false ? ' (นอน)' : ''}`);
                if ((p.until || 'endOfTurn') === 'endOfTurn') {
                  st.scheduled.push({
                    player: st.active, when: 'endPhase', op: 'returnControl',
                    k: a.k, toOwner: fromOwner
                  });
                }
              }
            }
          } else if (p.dest === 'destroy') {
            destroyCard(st, fx, a.k);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ทำลาย ${nameOf(st, a.k)}`);
            fx.snd = 'clash';
          } else if (p.dest === 'scoutOtaHost') {
            const host = a.k;
            const otas = (p.otaIds || []).filter(id => st.inst[id] && (zoneOf(st, id) || '').endsWith('.hand'));
            let n = 0;
            otas.forEach(id => {
              if (equipOnto(st, id, host)) { n++; fireWeaponModAttached(st, fx, id, rng); }
            });
            addLog(st, p.chooser, `เวทีแห่งความฝัน: สวมโอตะ ${n} ใบให้ ${nameOf(st, host)}`);
          } else if (p.dest === 'hellAttachMulti') {
            const host = p.hostFixed || ctx && null;
            const h = p.hostFixed;
            if (!h || !st.inst[h]) addLog(st, 'S', `ไม่มีโฮสต์`);
            else if (equipOnto(st, a.k, h)) {
              p.multiGot = (p.multiGot || 0) + 1;
              fireWeaponModAttached(st, fx, a.k, rng);
              addLog(st, p.chooser, `สวม ${nameOf(st, a.k)} ให้ ${nameOf(st, h)} (${p.multiGot}/${p.multiMax})`);
              if (p.multiGot < (p.multiMax || 2) && promptCandidates(st, p).length) {
                st.prompts.unshift(p);
              }
            }
          } else if (p.dest === 'dark') {
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: เนรเทศ ${nameOf(st, a.k)} ลงมิติมืด`);
          } else if (p.dest === 'tap' || p.dest === 'untap') {
            st.inst[a.k].tapped = (p.dest === 'tap');
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${p.dest === 'tap' ? 'นอน' : 'ตื่น'} ${nameOf(st, a.k)}`);
          } else if (p.dest === 'pickAttachHost') {
            // เลือกการ์ดมาสวมแล้ว → ถ้ามี preferHost ที่ยังอยู่และตรง filter ให้สวมเลย
            let host = p.preferHost;
            if (!(host && st.inst[host] && (zoneOf(st, host) || '').endsWith('.avatar') && matchFilterEx(st, host, p.hostFilter)))
              host = null;
            if (host) {
              if (equipOnto(st, a.k, host)) {
                addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ ${nameOf(st, a.k)} ให้ ${nameOf(st, host)}`);
                fireWeaponModAttached(st, fx, a.k, rng);
              }
            } else {
              const hp = { kind: 'pick', from: 'ownAvatars', src: p.src, chooser: p.chooser, filter: p.hostFilter, dest: 'attachTo', attachMod: a.k, optional: true };
              if (promptCandidates(st, hp).length) { st.prompts.unshift(hp); addLog(st, p.chooser, `เลือก Avatar ที่จะสวมใส่ ${nameOf(st, a.k)}`); }
              else addLog(st, 'S', `ไม่มี Avatar ให้สวมใส่`);
            }
          } else if (p.dest === 'hellMultiDeck') {
            doMove(st, a.k, p.chooser + '.deck', null, fx);
            p.multiGot = (p.multiGot || 0) + 1;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} จากนรกกลับเด็ค (${p.multiGot}/${p.multiMax})`);
            if (p.multiGot < (p.multiMax || 4) && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
            } else {
              finishHellMulti(st, fx, p, rng);
            }
          } else if (p.dest === 'attachTo') {
            const mod = st.inst[p.attachMod];
            if (mod) {
              const ad = attachOnlyDeny(st, mod.code, a.k);
              if (ad) return deny(`"${mod.name}" ${ad}`);
              if (equipOnto(st, p.attachMod, a.k)) {
                addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ ${mod.name} ให้ ${nameOf(st, a.k)}`);
                fireWeaponModAttached(st, fx, p.attachMod, rng);
                // ยาแก้ไอน้ำดำ: คืน POWER ที่ถูกลดไว้
                if (EFFECTS[mod.code] && EFFECTS[mod.code].ignoreNegativePower) {
                  let neg = 0;
                  (st.buffs || []).forEach(b => { if (b.k === a.k && b.amt < 0) neg += b.amt; });
                  if (st.inst[a.k].curse && st.inst[a.k].curse.powerMod < 0) neg += st.inst[a.k].curse.powerMod;
                  if (neg < 0) {
                    st.buffs.push({ k: a.k, amt: -neg, until: 'permanent' });
                    addLog(st, 'S', `เอฟเฟกต์ ${mod.name}: คืน POWER ${-neg} ที่ถูกลดไว้`);
                  }
                }
              }
            }
          } else if (p.dest === 'curse') {
            st.inst[a.k].curse = { symbol: p.symbol || 'ผี', powerMod: p.powerMod != null ? p.powerMod : -2, from: p.src };
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สาป ${nameOf(st, a.k)} → Symbol ${p.symbol || 'ผี'} POWER ${p.powerMod || -2}`);
          } else if (p.dest === 'oppDeckBottom') {
            const opp = other(p.chooser);
            doMove(st, a.k, opp + '.deck', 'bottom', fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} ลงใต้เด็ค ${opp}`);
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
          } else if (p.dest === 'grantCostPower') {
            st.inst[a.k].costDelta = (st.inst[a.k].costDelta || 0) + (p.costDelta || 1);
            st.inst[a.k].powerDelta = (st.inst[a.k].powerDelta || 0) + (p.powerDelta || 1);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} Cost +${p.costDelta || 1} POWER +${p.powerDelta || 1} (จนกว่าออกจากสนาม)`);
          } else if (p.dest === 'grantKeyword') {
            st.inst[a.k].grantedKeywords = st.inst[a.k].grantedKeywords || [];
            st.inst[a.k].grantedKeywords.push({ kw: p.keyword || 'สามัคคี', until: p.until || 'endOfTurn' });
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} ได้ "${p.keyword || 'สามัคคี'}" จนจบเทิร์น`);
          } else if (p.dest === 'bothReturn') {
            doMove(st, a.k, p.chooser + '.deck', 'bottom', fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} กลับใต้เด็ค`);
            const opp = other(p.chooser);
            const hp = { kind: 'pick', from: 'ownAvatars', src: p.src, chooser: opp, dest: 'deckBottom', optional: false, srcToHell: !!p.srcToHell };
            if (promptCandidates(st, hp).length) { st.prompts.unshift(hp); addLog(st, opp, `เลือก Avatar กลับใต้เด็ค`); }
            else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          } else if (p.dest === 'deckBottom') {
            const own = ownerOf(st, a.k);
            doMove(st, a.k, (own === 'S' ? p.chooser : own) + '.deck', 'bottom', fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} กลับใต้เด็ค`);
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
            else if (p.srcToHell && zoneOf(st, p.src)) {
              const so = ownerOf(st, p.src);
              doMove(st, p.src, (so === 'S' ? p.chooser : so) + '.hell', null, fx);
            }
          } else if (p.dest === 'attachSelf') {
            // มีมมิจัง: เอาจากเด็คมาสวมใส่ตัวเอง (src) — วางไว้ Magic Zone ให้เห็นบนจอ
            if (st.inst[a.k] && st.inst[p.src] && equipOnto(st, a.k, p.src)) {
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ ${nameOf(st, a.k)} ให้ตัวเอง`);
              fireWeaponModAttached(st, fx, a.k, rng);
            }
          } else if (p.dest === 'coinDestroy') {
            const flip = (typeof rng === 'function' ? rng() : Math.random());
            const heads = flip < 0.5;
            addLog(st, 'S', `🪙 ทอยเหรียญ: ออก "${heads ? 'หัว' : 'ก้อย'}"`);
            fx.coin = heads ? 'หัว' : 'ก้อย';
            if (heads) {
              addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: หัว — ทำลาย ${nameOf(st, a.k)}`);
              destroyCard(st, fx, a.k);
            } else {
              addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: ก้อย — ทำลายตัวเอง`);
              destroyCard(st, fx, p.src);
            }
            fx.snd = 'clash';
            fx.tool = `เหรียญออก ${fx.coin}`;
          } else if (p.dest === 'cancelAttackRest') {
            if (st.inst[a.k].tapped) return deny('ต้องเลือก Avatar ที่ยังตื่น');
            st.inst[a.k].tapped = true;
            if (st.pending) {
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นอน ${nameOf(st, a.k)} — ยกเลิกการโจมตีของ ${nameOf(st, st.pending.atk)}`);
              st.pending = null;
            } else addLog(st, p.chooser, `นอน ${nameOf(st, a.k)} แต่ไม่มีการโจมตีค้าง`);
            fx.snd = 'tap';
          } else if (p.dest === 'swapCombat') {
            if (st.inst[a.k]) {
              st.inst[a.k]._swapCombat = true;
              addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} สลับ Cost↔POWER จนจบการต่อสู้ (ตอนนี้ C${effCost(st, a.k)}/P${effPower(st, a.k)})`);
            }
          } else if (p.dest === 'alienReveal') {
            const c = st.inst[a.k];
            if (c) c.revealed = true;
            p.revealed = (p.revealed || []).concat([a.k]);
            p.excludeIds = (p.excludeIds || []).concat([a.k]);
            addLog(st, p.chooser, `👁 แสดง ${nameOf(st, a.k)} (Cost ${effCost(st, a.k)}) — รวม ${p.revealed.length} ใบ`);
            fx.toss = { by: p.chooser, names: [nameOf(st, a.k)] };
            fx.snd = 'flip';
            if (promptCandidates(st, p).length) {
              st.prompts.unshift(p);
              addLog(st, p.chooser, `แสดงเพิ่มได้ หรือกดข้ามเพื่อทำลาย (รวม Cost ${p.revealed.reduce((s, id) => s + effCost(st, id), 0)})`);
            } else {
              finishAlienReveal(st, fx, p);
            }
          } else if (p.dest === 'giveToOpp') {
            const opp = other(p.chooser);
            doMove(st, a.k, opp + '.hand', null, fx);
            if (st.inst[a.k]) delete st.inst[a.k].revealed;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ให้ ${nameOf(st, a.k)} แก่ฝ่ายตรงข้าม`);
            fx.snd = 'place';
          } else if (p.dest === 'whoCoolShow') {
            const w = st.whoCool;
            if (!w) break;
            w.picks[p.chooser] = a.k;
            addLog(st, p.chooser, `ใครเจ๋งกว่า: เลือกแล้ว (ซ่อนไว้)`);
            fx.snd = 'tap';
            queueWhoCoolPick(st);
          } else if (p.dest === 'saleModPick') {
            const m = st.inst[a.k];
            const hostOwn = m && m.attachedTo ? ownerOf(st, m.attachedTo) : null;
            if (hostOwn === 'A') p.saleNeedA = false;
            if (hostOwn === 'B') p.saleNeedB = false;
            p.salePicked = (p.salePicked || []).concat([a.k]);
            doMove(st, a.k, (hostOwn || p.chooser) + '.hell', null, fx);
            if (m) m.attachedTo = null;
            addLog(st, p.chooser, `ลดราคา: ส่ง ${nameOf(st, a.k)} ลงนรก`);
            if (p.saleNeedA || p.saleNeedB) {
              const left = (p.ids || []).filter(id => {
                if (p.salePicked.includes(id)) return false;
                const mm = st.inst[id]; if (!mm || !mm.attachedTo) return false;
                const ow = ownerOf(st, mm.attachedTo);
                if (ow === 'A' && !p.saleNeedA) return false;
                if (ow === 'B' && !p.saleNeedB) return false;
                return true;
              });
              if (left.length) {
                st.prompts.unshift(Object.assign({}, p, { ids: left }));
                addLog(st, p.chooser, `เลือก Mod อีกฝ่ายที่เหลือ`);
              }
            }
            if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
            fx.snd = 'clash';
          } else if (p.dest === 'cullAvatar') {
            destroyCard(st, fx, a.k, { ignoreProtect: true });
            p.cullLeft = (p.cullLeft || 1) - 1;
            addLog(st, p.chooser, `ตัดเพดาน Avatar: ส่ง ${nameOf(st, a.k)} ลงนรก (เหลือต้องตัด ${p.cullLeft})`);
            if (p.cullLeft > 0 && promptCandidates(st, p).length) st.prompts.unshift(p);
            fx.snd = 'clash';
          } else if (p.dest === 'revealThenTop') {
            addLog(st, p.chooser, `👁 แสดง ${nameOf(st, a.k)}`);
            fx.toss = { by: p.chooser, names: [nameOf(st, a.k)] };
            // เอาใบออก → สับเด็ค → วางใบบนสุด
            const d = st.zones[p.chooser + '.deck'] || [];
            st.zones[p.chooser + '.deck'] = d.filter(x => x !== a.k);
            seededShuffle(st.zones[p.chooser + '.deck'], rng);
            st.zones[p.chooser + '.deck'].push(a.k);
            addLog(st, p.chooser, `สับเด็คแล้ววาง ${nameOf(st, a.k)} ไว้บนสุด`);
            syncHeimdall(st);
            fx.snd = 'flip';
          } else if (p.dest === 'bounceHand') {
            const own = ownerOf(st, a.k);
            const handOwner = own === 'S' ? p.chooser : own;
            doMove(st, a.k, handOwner + '.hand', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} ขึ้นมือ`);
          } else if (p.dest === 'handOrSummon') {
            p._handOrSummonCard = a.k;
            p._canSummon = effCost(st, a.k) <= (p.summonCostMax != null ? p.summonCostMax : 3);
          } else {
            doMove(st, a.k, p.chooser + '.hand', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} ขึ้นมือ`);
            if (p.thenIfFound && p.thenIfFound.length && matchFilterEx(st, a.k, p.filter)) {
              runActions(st, fx, p.thenIfFound, { src: p.src, owner: p.chooser, attacker: p.attacker, rng });
            }
          }
          // ที่เหลือจากสอดแนมลงใต้เด็ค (ตามลำดับที่แสดง)
          if (p.dest === 'multiAvatar') {
            // rest/shuffle จัดการในสาขา multiAvatar แล้ว
          } else if (p.from === 'ids' && p.restTo === 'bottom') {
            const rest = (p.ids || []).filter(x => x !== a.k && (st.zones[p.chooser + '.deck'] || []).includes(x));
            rest.forEach(x => {
              st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
              st.zones[p.chooser + '.deck'].unshift(x);
            });
            if (rest.length) addLog(st, p.chooser, `การ์ดที่เหลือจากสอดแนม ${rest.length} ใบ ลงใต้เด็ค`);
          }
          if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); syncHeimdall(st); }
          if (p.dest === 'handOrSummon' && p._handOrSummonCard) {
            const cid = p._handOrSummonCard;
            if (p._canSummon && (st.zones[p.chooser + '.deck'] || []).includes(cid)) {
              st.prompts.unshift({ kind: 'handOrSummon', card: cid, src: p.src, chooser: p.chooser, paidCost: false, srcToHell: !!p.srcToHell, optional: false });
              addLog(st, p.chooser, `เลือก: ขึ้นมือ หรืออัญเชิญ "${nameOf(st, cid)}" (Cost≤${p.summonCostMax != null ? p.summonCostMax : 3} — ไม่ได้จุติ)`);
            } else if ((st.zones[p.chooser + '.deck'] || []).includes(cid)) {
              doMove(st, cid, p.chooser + '.hand', null, fx);
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, cid)} ขึ้นมือ`);
              if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
            }
          } else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          fx.snd = 'place';
        }
        break;
      }

      case 'skipPrompt': {
        const p = st.prompts[0]; if (!p) break;
        if (p.kind === 'rps') return deny('ต้องเลือกเป่ายิ้งฉุบ (หรือรอหมดเวลา)');
        if (p.kind === 'combatSurvive') {
          if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
          st.prompts.shift();
          const pend = st._survivePending;
          delete st._survivePending;
          if (pend && pend.k) destroyCard(st, fx, pend.k, pend.opts || { ignoreSurvive: true, fromCombat: true });
          fx.snd = 'clash';
          break;
        }
        if (p.kind === 'passengerReplace') {
          if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
          st.prompts.shift();
          const pend = st._passengerPending;
          delete st._passengerPending;
          if (pend && pend.k) destroyCard(st, fx, pend.k, pend.opts || { ignorePassengerReplace: true });
          fx.snd = 'clash';
          break;
        }
        if (p.kind === 'preventLeaveExile') {
          if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
          st.prompts.shift();
          resumePreventLeaveFail(st, fx);
          fx.snd = 'clash';
          break;
        }
        if (p.dest === 'preventLeavePick') {
          if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
          st.prompts.shift();
          addLog(st, p.chooser, `ข้ามกันออกสนาม — ${nameOf(st, p.stayK || p.src)} ออกจากสนาม`);
          resumePreventLeaveFail(st, fx);
          fx.snd = 'clash';
          break;
        }
        if (isPlayer && by !== p.chooser && p.kind !== 'rps') return deny('ไม่ใช่ prompt ของคุณ');
        if (p.optional === false && p.kind !== 'peekTop' && p.dest !== 'hellMultiDeck') return deny('เอฟเฟกต์นี้ต้องเลือกเป้า (ยกเลิกไม่ได้)');
        if (p.multiExact && (p.multiGot || 0) < p.multiExact) return deny(`ต้องอัญเชิญให้ครบ ${p.multiExact} ใบ`);
        if (p.multiMin && (p.multiGot || 0) < p.multiMin) return deny(`ต้องอัญเชิญอย่างน้อย ${p.multiMin} ใบ`);
        if (p.dest === 'discardSumCostSummon') {
          st.prompts.shift();
          const filt = Object.assign({}, p.summonFilter || {}, { costMax: p.costSum || 0 });
          const sp = { kind: 'pick', from: 'deckAll', src: p.src, chooser: p.chooser, filter: filt, dest: 'avatar', paidCost: false, shuffleAfter: !!p.shuffleAfter, optional: true };
          if ((p.multiGot || 0) === 0) addLog(st, p.chooser, `ไม่ได้ทิ้ง — ข้ามการอัญเชิญ`);
          else if (promptCandidates(st, sp).length) {
            st.prompts.unshift(sp);
            addLog(st, p.chooser, `อัญเชิญรัททาทุย Cost≤${p.costSum || 0} จากเด็ค (ฟรี ไม่จุติ)`);
          } else addLog(st, 'S', `ไม่มีรัททาทุย Cost≤${p.costSum || 0} ในเด็ค`);
          break;
        }
        st.prompts.shift();
        if (p.dest === 'hellMultiDeck') {
          finishHellMulti(st, fx, p, rng);
          break;
        }
        if (p.dest === 'exileDistinctHell') {
          const amt = (p.thenBuffSelfPer || 1) * (p.multiGot || 0);
          if (amt && st.inst[p.src]) {
            st.buffs.push({ k: p.src, amt, until: p.duration || 'endOfTurn' });
            addLog(st, p.chooser, `กินซาก: POWER +${amt} จนจบเทิร์น (เนรเทศ ${p.multiGot || 0} ใบ)`);
          } else addLog(st, p.chooser, `ข้ามการเนรเทศ`);
          break;
        }
        if (p.dest === 'hellBuildConstruct') {
          addLog(st, p.chooser, `จบการก่อสร้างจากนรก (${p.multiGot || 0} ใบ)`);
          break;
        }
        if (p.dest === 'alienReveal') {
          finishAlienReveal(st, fx, p);
          break;
        }
        if (p.thenDestroyEnemyCostSumLte) {
          const sum = p.scoutCostSum || 0;
          const dp = {
            kind: 'chooseDestroy', src: p.src, chooser: p.chooser,
            filter: { type: 'Avatar', costMax: sum },
            zones: ['avatar'], side: 'enemy', optional: true
          };
          if (promptCandidates(st, dp).length) {
            st.prompts.unshift(dp);
            addLog(st, p.chooser, `เลือก Avatar ฝ่ายตรงข้าม Cost ≤ ${sum} เพื่อทำลาย`);
          } else addLog(st, 'S', `ไม่มี Avatar ศัตรู Cost ≤ ${sum}`);
          break;
        }
        if (p.kind === 'chooseDestroy' && p.afterAlienGive) {
          (p.alienRevealed || []).forEach(k => { if (st.inst[k]) delete st.inst[k].revealed; });
          pushAlienGive(st, p.src, p.chooser);
          break;
        }
        if (p.kind === 'peekTop') {
          // default keep on top
          addLog(st, p.chooser, `สอดแนม: เก็บ "${nameOf(st, p.card)}" ไว้บนเด็ค`);
          break;
        }
        if (p.kind === 'chooseDiscard') {
          if (!p.effectDiscard && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hand', null, fx);
          if (!p.effectDiscard) addLog(st, p.chooser, `ยกเลิกการใช้ ${nameOf(st, p.src)} — คืนกลับมือ`);
          else addLog(st, p.chooser, `ข้ามการทิ้งการ์ด`);
        } else if (p.kind === 'pick' && p.from === 'ids' && p.restTo === 'bottom') {
          const rest = (p.ids || []).filter(x => (st.zones[p.chooser + '.deck'] || []).includes(x));
          rest.forEach(x => {
            st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
            st.zones[p.chooser + '.deck'].unshift(x);
          });
          addLog(st, p.chooser, `ไม่หยิบจากสอดแนม — ทั้ง ${rest.length} ใบลงใต้เด็ค`);
        } else {
          addLog(st, p.chooser, `ข้ามการเลือกเป้าของ ${nameOf(st, p.src)}`);
          if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }
        }
        if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
        break;
      }

      case 'reactYes': {
        const p = st.prompts[0]; if (!p || p.kind !== 'react') break;
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ React ของคุณ');
        // ต้องเลือกใบจาก options (แตะใบที่กะพริบ) — ปุ่มเปิดใช้เดี่ยวเลิกใช้แล้ว
        if (p.options && p.options.length) {
          const pick = a.k || p.src;
          if (!pick || !p.options.includes(pick))
            return deny('แตะ React ที่กะพริบเขียวในมือเพื่อเลือกใช้ (หรือกดไม่ใช้)');
          if (!bindReactPromptCard(st, p, pick)) return deny('ใช้ React ใบนี้ไม่ได้');
        } else if (a.k) {
          if (!bindReactPromptCard(st, p, a.k)) return deny('ใช้ React ใบนี้ไม่ได้');
        }
        if (!p.src) return deny('เลือก React ที่จะใช้');
        const m = st.inst[p.src];
        const mz = zoneOf(st, p.src) || '';
        if (!m || !(mz.endsWith('.magic') || mz.endsWith('.hand'))) { st.prompts.shift(); break; }
        // ประเภทละ 1 ครั้ง/เทิร์น — React นับเสมอ (แม้โต๊ะเสรี) · ประเภทอื่นนับในโหมดกติกา
        // นับทันทีที่เปิดใช้ (แม้ถูกชายจากอนาคตยกเลิกภายหลัง ก็ห้ามใช้ครั้งที่ 2)
        const mtype = m.subtype || 'React';
        const enforceType = mtype === 'React' || !!st.strict;
        if (enforceType) {
          if (isMagicTypeUsed(st, p.chooser, mtype))
            return deny(`ใช้เวทประเภท "${mtype}" ครบ 1 ครั้งแล้วในเทิร์นนี้ (ประเภทละ 1 ครั้ง/เทิร์น)`);
          markMagicTypeUsed(st, p.chooser, mtype);
        }
        const pendingSummon = p.pendingSummon || null;
        st.prompts.shift();
        if (mz.endsWith('.hand')) { doMove(st, p.src, p.chooser + '.magic', null, fx); }
        m.faceUp = true;
        addLog(st, p.chooser, `เปิด React "${m.name}"!`);
        if (p.magicNegate || p.mode === 'negateMagic') {
          // ชายจากอนาคต: ยกเลิกการใช้ Magic ที่ค้าง
          const pend = st._pendingMagic; delete st._pendingMagic;
          if (p.target && st.inst[p.target] && zoneOf(st, p.target)) {
            const magOwner = ownerOf(st, p.target);
            addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ยกเลิกการใช้ "${nameOf(st, p.target)}"`);
            doMove(st, p.target, (magOwner === 'S' ? 'A' : magOwner) + '.hell', null, fx);
          }
          doMove(st, p.src, p.chooser + '.hell', null, fx);
          // อุบัติเหตุถูกยกเลิก → Avatar รอด → รันจุติที่ค้างไว้
          if (pend && pend.pendingSummon) resumePendingSummon(st, fx, pend.pendingSummon);
          fx.snd = 'clash';
          break;
        }
        if (p.abilityReact) {
          // ยกเลิกความสามารถ Avatar ที่ค้าง (เชาว์ปัญญาลิง) — ไม่ผ่าน negate Magic
          delete st._pendingAbility;
          addLog(st, 'S', `เชาว์ปัญญาลิง: ยกเลิกความสามารถของ ${nameOf(st, p.target)}`);
        } else if (offerMagicNegateReact(st, fx, p.chooser, p.src)) {
          // React อื่น (อุบัติเหตุ ฯลฯ) — ให้ฝ่ายตรงข้ามขัดด้วยชายจากอนาคตก่อน
          st._pendingMagic = {
            type: 'reactActions', src: p.src, owner: p.chooser,
            actions: p.actions || [], target: p.target, triggerSource: p.target,
            mode: p.mode || 'runActions', pendingSummon
          };
          fx.snd = 'place';
          break;
        }
        if (p.mode === 'destroyAttacker') {
          if (st.inst[p.target] && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
            addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ส่ง ${nameOf(st, p.target)} ที่ประกาศโจมตีลงนรก`);
            destroyCard(st, fx, p.target);
          }
          if (st.pending && st.pending.atk === p.target) { st.pending = null; addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่แล้ว'); }
        } else if (p.actions && p.actions.length) {
          runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
        } else {
          const tgt = st.inst[p.target];
          if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
            addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ทำลาย ${tgt.name} — ส่งนรกแล้ว`);
            destroyCard(st, fx, p.target);
          }
        }
        doMove(st, p.src, p.chooser + '.hell', null, fx);
        // เทคจุติ: รันจุติต่อได้แม้ถูกอุบัติเหตุทำลาย (resume รองรับทั้งบนสนามและนรก)
        if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
        fx.snd = 'clash';
        break;
      }

      case 'reactNo': {
        const p = st.prompts[0]; if (!p || p.kind !== 'react') break;
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ React ของคุณ');
        const pendingSummon = p.pendingSummon || null;
        st.prompts.shift();
        if (p.magicNegate || p.mode === 'negateMagic') {
          const pend = st._pendingMagic; delete st._pendingMagic;
          resolvePendingMagic(st, fx, pend, rng);
          break;
        }
        if (p.abilityReact && st._pendingAbility) {
          const pend = st._pendingAbility; delete st._pendingAbility;
          if (pend.cancelled) {
            addLog(st, 'S', `ความสามารถถูกยกเลิกแล้ว — ไม่ทำงาน`);
          } else if (pend.type === 'activateFull') {
            payCostAndRunActivated(st, fx, pend.owner, pend.src, pend.costList || [], pend.actions || [], rng);
          } else if (pend.type === 'activate' && pend.actions) {
            runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, rng });
          } else if (pend.type === 'summoned') {
            triggerSummon(st, fx, pend.k, pend.owner, Object.assign({}, pend.opts || {}, { _skipReact: true }));
          } else if (pend.type === 'declareAtk' && pend.actions) {
            runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, rng, attacker: pend.src });
          } else if (pend.type === 'chooseMode' && pend.actions) {
            runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, rng });
          }
        }
        // ไม่ใช้อุบัติเหตุ → Avatar รอด → รันจุติ
        if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
        break;
      }

      case 'peekTopPlace': {
        const p = st.prompts[0]; if (!p || p.kind !== 'peekTop') return deny('ไม่ได้อยู่ในโหมดสอดแนม');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        if (a.where === 'hell' && p.allowHell && p.card) {
          doMove(st, p.card, p.chooser + '.hell', null, fx);
          addLog(st, p.chooser, `สอดแนม: ส่ง "${nameOf(st, p.card)}" ลงนรก`);
        } else if (a.where === 'bottom' && p.card && (st.zones[p.chooser + '.deck'] || []).includes(p.card)) {
          doMove(st, p.card, p.chooser + '.deck', 'bottom', fx);
          addLog(st, p.chooser, `สอดแนม: ย้าย "${nameOf(st, p.card)}" ไว้ใต้เด็ค`);
        } else {
          addLog(st, p.chooser, `สอดแนม: เก็บ "${nameOf(st, p.card)}" ไว้บนเด็ค`);
        }
        syncHeimdall(st);
        fx.snd = 'place';
        break;
      }

      case 'handOrSummonPick': {
        const p = st.prompts[0]; if (!p || p.kind !== 'handOrSummon') return deny('ไม่ได้อยู่ในโหมดเลือกขึ้นมือ/อัญเชิญ');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        const cid = p.card;
        if (!cid || !(st.zones[p.chooser + '.deck'] || []).includes(cid)) {
          st.prompts.shift();
          return deny('การ์ดไม่อยู่ในเด็คแล้ว');
        }
        st.prompts.shift();
        if (a.where === 'avatar') {
          const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[cid]);
          if (qd) {
            doMove(st, cid, p.chooser + '.hand', null, fx);
            addLog(st, 'S', `อัญเชิญไม่ได้ (${qd}) — ขึ้นมือแทน`);
          } else {
            doMove(st, cid, p.chooser + '.avatar', null, fx);
            addLog(st, p.chooser, `อัญเชิญ ${nameOf(st, cid)} จากสอดแนม (ไม่ได้จุติ)`);
            triggerSummon(st, fx, cid, p.chooser, { paidCost: false });
          }
        } else {
          doMove(st, cid, p.chooser + '.hand', null, fx);
          addLog(st, p.chooser, `นำ ${nameOf(st, cid)} ขึ้นมือ`);
        }
        if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
        fx.snd = 'place';
        break;
      }

      case 'combatSurviveYes': {
        const p = st.prompts[0]; if (!p || p.kind !== 'combatSurvive') return deny('ไม่ได้อยู่ในโหมดรอดจากการต่อสู้');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        const k = p.k;
        st._surviveAsk = st._surviveAsk || {};
        st._surviveAsk[k + ':' + st.turn] = true;
        delete st._survivePending;
        if (st.inst[k]) {
          st.inst[k].powerDelta = (st.inst[k].powerDelta || 0) + (p.amt || -1);
          addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, k)}: POWER ${p.amt || -1} (จนกว่าออกจากสนาม) → P${effPower(st, k)}`);
          if (effPower(st, k) <= 0) {
            addLog(st, 'S', `${nameOf(st, k)} POWER 0 — ทำลายทันที`);
            destroyCard(st, fx, k, { ignoreSurvive: true, ignoreProtect: true });
          }
        }
        fx.snd = 'tap';
        break;
      }
      case 'combatSurviveNo': {
        const p = st.prompts[0]; if (!p || p.kind !== 'combatSurvive') return deny('ไม่ได้อยู่ในโหมดรอดจากการต่อสู้');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        const pend = st._survivePending;
        delete st._survivePending;
        if (pend && pend.k) destroyCard(st, fx, pend.k, pend.opts || { ignoreSurvive: true, fromCombat: true });
        fx.snd = 'clash';
        break;
      }
      case 'passengerReplaceYes': {
        const p = st.prompts[0]; if (!p || p.kind !== 'passengerReplace') return deny('ไม่ได้อยู่ในโหมดผู้โดยสารแทน');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        delete st._passengerPending;
        if (p.pass) {
          addLog(st, p.chooser, `ผู้โดยสารรับการทำลายแทน ${nameOf(st, p.plane)}`);
          destroyCard(st, fx, p.pass, { ignoreProtect: true });
        }
        fx.snd = 'clash';
        break;
      }
      case 'passengerReplaceNo': {
        const p = st.prompts[0]; if (!p || p.kind !== 'passengerReplace') return deny('ไม่ได้อยู่ในโหมดผู้โดยสารแทน');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        const pend = st._passengerPending;
        delete st._passengerPending;
        if (pend && pend.k) destroyCard(st, fx, pend.k, pend.opts || { ignorePassengerReplace: true });
        fx.snd = 'clash';
        break;
      }
      case 'preventLeaveYes': {
        const p = st.prompts[0]; if (!p || p.kind !== 'preventLeaveExile') return deny('ไม่ได้อยู่ในโหมดกันออกสนาม');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        const pick = {
          kind: 'pick', from: 'hell', src: p.k, chooser: p.chooser,
          filter: p.filter || {}, dest: 'preventLeavePick', optional: false,
          need: p.need || 5, got: 0, stayK: p.k
        };
        if (promptCandidates(st, pick).length) {
          st.prompts.unshift(pick);
          addLog(st, p.chooser, `เลือกเนรเทศรัททาทุยจากนรก ${p.need || 5} ใบ`);
        } else {
          resumePreventLeaveFail(st, fx);
        }
        break;
      }
      case 'preventLeaveNo': {
        const p = st.prompts[0]; if (!p || p.kind !== 'preventLeaveExile') return deny('ไม่ได้อยู่ในโหมดกันออกสนาม');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        resumePreventLeaveFail(st, fx);
        fx.snd = 'clash';
        break;
      }

      case 'pickSymbol': {
        const p = st.prompts[0]; if (!p || p.kind !== 'pickSymbol') return deny('ไม่ได้อยู่ในโหมดเลือก Symbol');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        const sym = a.symbol || a.v;
        if (!sym) return deny('ต้องเลือก Symbol');
        st.prompts.shift();
        const opp = other(p.chooser);
        const hand = st.zones[opp + '.hand'] || [];
        if (!hand.length) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: ประกาศ "${sym}" แต่มือศัตรูว่าง`);
        } else {
          const pick = hand[Math.floor((typeof rng === 'function' ? rng() : Math.random()) * hand.length)];
          const pc = st.inst[pick];
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: ประกาศ "${sym}" สุ่มได้ "${pc.name}" (${pc.type}/${pc.symbol || '–'})`);
          if (pc.type === 'Avatar' && cardSymbols(st, pick).includes(sym)) {
            doMove(st, pick, opp + '.hell', null, fx);
            addLog(st, 'S', `ตรง Symbol — ส่ง ${pc.name} ลงนรก`);
            fx.snd = 'clash';
          } else addLog(st, 'S', 'ไม่ตรงเงื่อนไข — ไม่เกิดอะไร');
        }
        if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
        break;
      }

      case 'draw': {
        const p = deckSide(a.p); // เด็คของคนที่กดเสมอ
        // ★ สอดแนมค้างอยู่ = ห้ามจั่วเพิ่ม (ตามกติกา) จนกว่าจะจัดการ์ดที่เหลือเสร็จ
        if (st.scout && st.scout.p === p) return deny('กำลังสอดแนมอยู่ — จั่วเพิ่มไม่ได้ ต้องเลือกไว้บนกอง/ใต้กองให้เสร็จก่อน');
        const d = st.zones[p + '.deck'];
        if (!d.length) { st.over = { winner: other(p) }; fx.over = other(p); addLog(st, 'S', `💀 เด็ค ${p} หมด จั่วไม่ได้ — ${other(p)} ชนะ! จบเกม`); break; }
        const k = d.pop(); st.zones[p + '.hand'].push(k);
        addLog(st, p, 'จั่ว 1 ใบ'); fx.snd = 'draw'; fx.drawn = k; break;
      }

      case 'shuffle': {
        const p = deckSide(a.p); // เด็คของคนที่กดเสมอ
        const d = st.zones[p + '.deck'];
        // ★ ถ้า client ไม่ส่ง perm มา (โหมดออนไลน์) ให้สับด้วย seed จาก server — เดิมออนไลน์กด "สับ" แล้วไม่สับจริง
        if (Array.isArray(a.perm) && a.perm.length === d.length) st.zones[p + '.deck'] = a.perm.map(i => d[i]);
        else seededShuffle(d, rng);
        addLog(st, p, 'สับเด็ค');
        syncHeimdall(st);
        break;
      }

      /* ★ สับการ์ดบนมือ (ลำดับในมือสลับใหม่ — ใช้ตอนโดนเอฟเฟกต์สุ่มทิ้ง/สุ่มเลือก) */
      case 'shuffleHand': {
        const p = deckSide(a.p);
        const h = st.zones[p + '.hand'] || [];
        if (h.length < 2) return deny('มีการ์ดในมือน้อยเกินไป ไม่ต้องสับ');
        if (Array.isArray(a.perm) && a.perm.length === h.length) st.zones[p + '.hand'] = a.perm.map(i => h[i]);
        else seededShuffle(h, rng);
        addLog(st, p, `🔀 สับการ์ดบนมือ (${h.length} ใบ)`); fx.snd = 'place'; break;
      }

      /* ★ เปิดการ์ดบนมือให้อีกฝั่งดู — เลือกกี่ใบก็ได้ · กดซ้ำ = ปิดกลับ */
      case 'revealHand': {
        const p = deckSide(a.p);
        const h = st.zones[p + '.hand'] || [];
        const ids = (a.ids || []).filter(k => h.includes(k));
        if (!ids.length) { // ไม่ส่ง ids = ปิดที่เปิดไว้ทั้งหมด
          const had = h.filter(k => st.inst[k].revealed);
          if (!had.length) return deny('ยังไม่ได้เปิดการ์ดใบไหนไว้');
          had.forEach(k => { delete st.inst[k].revealed; });
          addLog(st, p, `🙈 ปิดการ์ดในมือที่เปิดไว้ (${had.length} ใบ)`); fx.snd = 'flip'; break;
        }
        const on = ids.filter(k => !st.inst[k].revealed);
        if (on.length) {
          on.forEach(k => { st.inst[k].revealed = true; });
          addLog(st, p, `👁 เปิดการ์ดในมือให้อีกฝั่งดู: ${on.map(k => nameOf(st, k)).join(' · ')}`);
          fx.toss = { by: p, names: on.map(k => nameOf(st, k)) }; // ป๊อปอัพให้อีกฝั่งเห็นชัด
        } else {
          ids.forEach(k => { delete st.inst[k].revealed; });
          addLog(st, p, `🙈 ปิดการ์ดในมือ: ${ids.map(k => nameOf(st, k)).join(' · ')}`);
        }
        fx.snd = 'flip'; break;
      }

      case 'peekDeck': {
        const p = deckSide(a.p); // เด็คของคนที่กดเสมอ
        // 🔒 ค้นหาเด็ค (a.priv) = ข้อมูลปิด — อีกฝั่งไม่เห็นเนื้อหาเด็ค
        //    แต่ใบที่หยิบขึ้นมือจะขึ้น log ชื่อเอง (case 'move') + ปิดแล้วสับเด็ค
        if (a.priv) {
          addLog(st, p, '🔒 ค้นหาการ์ดในเด็ค (ไม่เปิดเนื้อหา — ใบที่หยิบขึ้นมือจะแจ้งชื่อ)');
          break;
        }
        addLog(st, p, `🔍 เปิดดูการ์ดบนสุดของเด็ค ${a.n} ใบ (เปิดให้อีกฝั่งเห็นด้วย)`);
        fx.deckView = { p, n: a.n || 0 }; // ข้อมูลเปิด: ทุก client เปิด overlay ดูการ์ดชุดเดียวกัน
        break;
      }

      /* ★ ปิดหน้าค้นเด็ค — แจ้งอีกฝั่งให้ปิด overlay ตาม */
      case 'peekEnd': {
        addLog(st, a.p, '🔍 ปิดการค้นหาเด็ค');
        fx.deckViewEnd = { p: a.p };
        break;
      }

      /* ★ สอดแนม / เปิดท็อปเด็ค N ใบ — เปิดให้ทั้งสองฝั่งเห็น, เจ้าของหยิบขึ้นมือได้, ที่เหลือเลือกไว้บน/ใต้กอง
         ระหว่างสอดแนมค้างอยู่ (st.scout) ห้ามจั่ว/จบเทิร์น จนกว่าจะจัดการ์ดที่เหลือเสร็จ */
      case 'scout': {
        const p = deckSide(a.p); // เด็คของคนที่กดเสมอ
        const d = st.zones[p + '.deck'] || [];
        const n = Math.max(1, Math.min(+a.n || 1, d.length));
        if (!d.length) return deny('เด็คว่าง — สอดแนมไม่ได้');
        if (st.scout) return deny('ยังมีการสอดแนมค้างอยู่ — จัดการ์ดที่เหลือให้เสร็จก่อน');
        // deck เก็บแบบ "ท้าย = บนสุด" → บนกอง = slice(-n) กลับด้าน · ล่างกอง = slice(0,n) (ใบก้นสุดก่อน)
        const fromBottom = a.from === 'bottom';
        const ids = fromBottom ? d.slice(0, n) : d.slice(-n).reverse();
        st.scout = { p, ids: ids.slice(), taken: [], label: a.label || 'สอดแนม', from: fromBottom ? 'bottom' : 'top' };
        addLog(st, p, `🔍 ${st.scout.label} ${n} ใบ จาก${fromBottom ? 'ล่างกอง' : 'บนกอง'} — เปิดให้ทั้งสองฝั่งเห็น (เลือกขึ้นมือได้ · ห้ามจั่วจนกว่าจะจัดกองเสร็จ)`);
        fx.scoutView = { p, n };
        fx.snd = 'flip'; break;
      }

      /* หยิบการ์ดจากชุดที่สอดแนมขึ้นมือ */
      case 'scoutTake': {
        const s = st.scout; if (!s) break;
        if (isPlayer && by !== s.p) return deny('เฉพาะเจ้าของเด็คที่กำลังสอดแนม');
        if (!s.ids.includes(a.k)) return deny('การ์ดใบนี้ไม่ได้อยู่ในชุดที่เปิด');
        s.ids = s.ids.filter(x => x !== a.k); s.taken.push(a.k);
        st.zones[s.p + '.deck'] = (st.zones[s.p + '.deck'] || []).filter(x => x !== a.k);
        st.zones[s.p + '.hand'].push(a.k);
        st.inst[a.k].faceUp = true; // ★ ขึ้นมือแล้วเจ้าของต้องเห็นการ์ดตัวเอง (มือฝั่งตรงข้ามถูกซ่อนที่ตัว render อยู่แล้ว)
        addLog(st, s.p, `↑ ${s.label}: เอา "${nameOf(st, a.k)}" ขึ้นมือ`);
        fx.snd = 'draw'; break;
      }

      /* ★ สลับลำดับการ์ดที่กำลังสอดแนม (ผู้เล่นจัดเรียงเองก่อนวางคืนกอง)
         ทำเป็น action เพื่อให้อีกฝั่งเห็นลำดับตรงกัน (สอดแนม/กฏร้าน = ข้อมูลเปิด) */
      case 'scoutMove': {
        const s = st.scout; if (!s) break;
        if (isPlayer && by !== s.p) return deny('เฉพาะเจ้าของเด็คที่กำลังสอดแนม');
        const i = s.ids.indexOf(a.k); if (i < 0) break;
        // a.to = ย้ายไปตำแหน่งที่ระบุ (ลากวาง) · a.d = สลับกับใบข้างๆ (ปุ่ม ◀ ▶)
        let j = (a.to != null) ? Math.max(0, Math.min(s.ids.length - 1, a.to | 0)) : i + (a.d < 0 ? -1 : 1);
        if (j < 0 || j >= s.ids.length || j === i) break;
        s.ids.splice(i, 1); s.ids.splice(j, 0, a.k); // ถอดออกแล้วแทรกตำแหน่งใหม่ (ใบอื่นเลื่อนตาม)
        addLog(st, s.p, `↔ ${s.label}: ย้าย "${nameOf(st, a.k)}" ไปลำดับที่ ${j + 1}`);
        fx.snd = 'tap'; break;
      }

      /* จบสอดแนม — ที่เหลือไว้บนกอง (top, ตามลำดับที่จัดไว้) หรือใต้กอง (bottom) */
      case 'scoutEnd': {
        const s = st.scout; if (!s) break;
        if (isPlayer && by !== s.p) return deny('เฉพาะเจ้าของเด็คที่กำลังสอดแนม');
        const d = st.zones[s.p + '.deck'] || [];
        const rest = s.ids.filter(k => d.includes(k));
        const remain = d.filter(k => !rest.includes(k));
        // deck เก็บแบบ "ท้าย = บนสุด"
        // ★ ทิศของลำดับที่เห็น ขึ้นกับว่าเปิดมาจากไหน:
        //   บนกอง (สอดแนม/เปิดบนกอง) → ซ้ายสุด = ใบบนสุด  → ต้อง reverse ก่อนต่อ
        //   ล่างกอง (กฏร้าน)          → ซ้ายสุด = ใบล่างสุด (ใบแรกที่เปิด) → ต่อตามลำดับที่เห็นเลย
        const seq = s.from === 'bottom' ? rest.slice() : rest.slice().reverse();
        st.zones[s.p + '.deck'] = a.where === 'bottom' ? seq.concat(remain) : remain.concat(seq);
        addLog(st, s.p, `${s.label}: หยิบขึ้นมือ ${s.taken.length} ใบ · ที่เหลือ ${rest.length} ใบไว้${a.where === 'bottom' ? 'ใต้กอง' : 'บนกอง (ตามลำดับ)'}`);
        st.scout = null;
        fx.scoutEnd = { p: s.p };
        fx.snd = 'place'; break;
      }

      /* ★ ธรณีสูบ — ทิ้งการ์ดบนสุด N ใบลงนรกทันที (เปิดให้เห็นว่าทิ้งใบไหน) */
      case 'millDeck': {
        const p = deckSide(a.p); // เด็คของคนที่กดเสมอ
        const d = st.zones[p + '.deck'] || [];
        const n = Math.max(1, Math.min(+a.n || 1, d.length));
        if (!d.length) return deny('เด็คว่าง — ธรณีสูบไม่ได้');
        const names = [];
        for (let i = 0; i < n && st.zones[p + '.deck'].length; i++) {
          const k = st.zones[p + '.deck'][st.zones[p + '.deck'].length - 1];
          names.push(nameOf(st, k));
          st.inst[k].faceUp = true;
          doMove(st, k, p + '.hell', null, fx);
        }
        addLog(st, p, `🌊 ธรณีสูบ ${names.length} ใบ → นรก: ${names.join(' · ')}`);
        fx.toss = { by: p, names }; // ใช้ป๊อปอัพเดียวกับ "ทิ้งจ่าย" ให้อีกฝั่งเห็น
        fx.snd = 'place'; break;
      }

      case 'toggleTap': {
        const c = st.inst[a.k]; if (!c) break;
        if (strict && isPlayer && ownerOf(st, a.k) !== by) return deny('โหมดกติกา: นอน/ตื่นได้เฉพาะการ์ดตัวเอง');
        c.tapped = !c.tapped;
        addLog(st, ownerOf(st, a.k), `${c.name} ${c.tapped ? 'นอน (Tap)' : 'ตื่น'}`);
        fx.snd = 'tap'; break;
      }

      case 'toggleFace': {
        const c = st.inst[a.k]; if (!c) break;
        if (strict && isPlayer && ownerOf(st, a.k) !== by) return deny('โหมดกติกา: หงาย/คว่ำได้เฉพาะการ์ดตัวเอง');
        const isLife = (zoneOf(st, a.k) || '').endsWith('.life');
        if (isLife && c.faceUp && (st.zones['land'] || []).some(id => EFFECTS[(st.inst[id] || {}).code] && EFFECTS[(st.inst[id] || {}).code].blockLifeUnreveal))
          return deny('โรงบาลรัฐ: LIFE ไม่สามารถคว่ำกลับได้');
        c.faceUp = !c.faceUp;
        addLog(st, ownerOf(st, a.k), c.faceUp ? `หงาย${isLife ? ' LIFE' : 'การ์ด'} : ${c.name}` : `คว่ำ${isLife ? ' LIFE' : 'การ์ด'}`);
        fx.snd = 'flip'; fx.flip = a.k; break;
      }

      case 'counter': {
        const c = st.inst[a.k]; if (!c) break;
        c.counters += a.d;
        if (a.d > 0) notePowerBuff(st, a.k, a.d);
        addLog(st, ownerOf(st, a.k), `${c.name} เคาน์เตอร์ ${c.counters > 0 ? '+' : ''}${c.counters}`);
        break;
      }

      case 'declareAttack': {
        const A = st.inst[a.atk]; if (!A) break;
        const isLife = !!a.life;
        const tgtId = isLife ? a.life : a.def;
        const T = st.inst[tgtId]; if (!T) break;
        const oa = ownerOf(st, a.atk), ot = ownerOf(st, tgtId);
        if (oa === ot || oa === 'S' || ot === 'S') break;
        if (st.pending) return deny('มีการโจมตีค้างอยู่ — ตัดสินให้จบก่อน');
        // ★ กฎเดียวที่ยังบังคับ: เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้
        if (st.turn === 1 && (isPlayer ? by : st.active) === (st.firstPlayer || 'A'))
          return deny('เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้');
        if (strict && isPlayer && oa !== by) return deny('โจมตีด้วย Avatar ฝั่งตัวเองเท่านั้น');
        if (strict && isPlayer && st.active !== by) return deny('โจมตีได้ในเทิร์นของคุณ');
        // จีสัส: โจมตีได้เมื่อมือว่าง
        {
          const eAtk = EFFECTS[A.code];
          if (eAtk && eAtk.attackIf === 'emptyHand' && (st.zones[oa + '.hand'] || []).length > 0)
            return deny(`"${A.name}" โจมตีได้เมื่อมือว่างเท่านั้น`);
          if (eAtk && eAtk.cannotAttack) return deny(`"${A.name}" โจมตีไม่ได้`);
        }
        if (A.cannotAttack) return deny(`"${A.name}" สั่งโจมตีไม่ได้ (เปลี่ยนการควบคุม)`);
        // โจมตี LIFE ตอนสาหัสแล้ว = ท่าปิดเกม (ถามสวน) — ไม่หงายใบเพิ่ม
        if (isLife) {
          const enemyAv = (st.zones[ot + '.avatar'] || []).length;
          const canEgg = hasKw(st, a.atk, 'เตะไข่') || A._allowLifeDespiteAvatars;
          if (enemyAv > 0 && !canEgg)
            return deny('มี Avatar ศัตรูอยู่ — ตี LIFE ไม่ได้ (ต้องมี「เตะไข่」หรือเอฟเฟกต์พิเศษ)');
          if (A._allowLifeDespiteAvatars) delete A._allowLifeDespiteAvatars;
          const lives = st.zones[ot + '.life'] || [];
          const fdown = lives.filter(k => st.inst[k] && !st.inst[k].faceUp);
          if (lives.length > 0 && fdown.length === 0) {
            A.tapped = true;
            st.pendingLethal = { atk: a.atk, life: a.life, by: oa, target: ot };
            addLog(st, 'S', `⚠️ ${A.name} ประกาศท่าปิดเกมใส่ฝ่าย ${ot} (สถานะสาหัส) — รอฝั่ง ${ot} ตอบว่าจะใช้การ์ดสวนไหม`);
            fx.lethalAsk = { by: oa, target: ot, atk: a.atk };
            fx.snd = 'tap';
            break;
          }
        }
        // โทมาโทจัง: ห้ามเลือกเป็นเป้าโจมตี
        if (!isLife && a.def) {
          const eDef = EFFECTS[T.code];
          const cond = eDef && eDef.cannotBeAttackTargetIf;
          if (cond) {
            const defOwn = ot;
            const hasAttach = !cond.selfAttachedNameIncludes || hasAttachedNameIncludes(st, a.def, cond.selfAttachedNameIncludes);
            const hasAlly = !cond.allyNameIncludes || (st.zones[defOwn + '.avatar'] || []).some(id => id !== a.def && nameMatches(st.inst[id], cond.allyNameIncludes));
            if (hasAttach && hasAlly) return deny(`"${T.name}" ไม่สามารถถูกเลือกเป็นเป้าหมายการโจมตีได้`);
          }
          // ผู้โดยสาร Super Air: มีเครื่องบิน → ห้ามเล็งผู้โดยสาร
          if (eDef && eDef.cannotBeAttackTargetIfOwnNameIncludes) {
            const hasPlane = (st.zones[ot + '.avatar'] || []).some(id => nameMatches(st.inst[id], eDef.cannotBeAttackTargetIfOwnNameIncludes));
            if (hasPlane) return deny(`"${T.name}" ไม่สามารถถูกเลือกเป็นเป้าหมายการโจมตีได้ (มี ${eDef.cannotBeAttackTargetIfOwnNameIncludes})`);
          }
        }
        A.tapped = true;
        declareBuffs(st, a.atk);
        // พิภพรัททาทุย (Land): รัททาทุยที่โจมตี +2 จนจบการต่อสู้
        (st.zones['land'] || []).forEach(lid => {
          const le = EFFECTS[(st.inst[lid] || {}).code];
          if (!le || !st.inst[lid].faceUp) return;
          abil(st, lid, 'declareAttack').forEach(ab => {
            (ab.actions || []).forEach(ac => {
              if (ac.op !== 'modifyPower' || !ac.ifAttackerSymbol) return;
              if (A.symbol !== ac.ifAttackerSymbol) return;
              st.buffs.push({ k: a.atk, amt: ac.amount || 0, until: ac.duration === 'combat' ? 'combat' : 'endOfTurn', from: lid });
              addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, lid)}: ${A.name} POWER +${ac.amount || 0} จนจบการต่อสู้`);
            });
          });
        });
        // พาหะ ฯลฯ: onFight ใส่ตอนประกาศ เพื่อให้ POWER บน UI ลดทันที
        if (!isLife && a.def) applyOnFightBuffs(st, a.atk, a.def);
        const declCtx = { _blockReact: false };
        // รัน declareAttack actions ที่ไม่ใช่แค่ destroy (เช่น blockReact)
        abil(st, a.atk, 'declareAttack').forEach(ab => {
          const cond = (ab.trigger && ab.trigger.if) || '';
          if (cond.startsWith('targetSymbol:')) return; // จัดการใน declareEffects
          (ab.actions || []).forEach(ac => {
            if (ac.op === 'blockReactUntilCombatEnd') declCtx._blockReact = true;
          });
          const heavy = (ab.actions || []).filter(ac => ac.op !== 'blockReactUntilCombatEnd' && ac.op !== 'modifyPower');
          if (heavy.length) {
            if (offerAbilityReact(st, fx, oa, a.atk, { type: 'declareAtk', actions: heavy, src: a.atk, owner: oa })) {
              /* รอ React */
            } else {
              runActions(st, fx, heavy, { src: a.atk, owner: oa, rng, attacker: a.atk });
            }
          }
        });
        if (declareEffects(st, fx, a.atk, isLife ? null : a.def, rng)) {
          addLog(st, 'S', `⚔️ ${A.name} ประกาศโจมตี — เป้าถูกทำลายจากเอฟเฟกต์ (ไม่ต้องปะทะ)`);
          fx.snd = 'clash'; break;
        }
        // กระบองแสง: โฮสต์โจมตี → บล็อก React จนจบการต่อสู้
        for (const id in st.inst) {
          const m = st.inst[id];
          if (!m || m.attachedTo !== a.atk) continue;
          const me = EFFECTS[m.code];
          if (me && me.hostBlockReactUntilCombatEnd) { declCtx._blockReact = true; break; }
        }
        st.pending = { kind: isLife ? 'life' : 'battle', atk: a.atk, def: a.def || null, life: a.life || null, by: oa, target: ot, held: false, blockReact: !!declCtx._blockReact };
        if (declCtx._blockReact) addLog(st, 'S', `เอฟเฟกต์ ${A.name}: ฝ่ายรับใช้ React ไม่ได้จนกว่าจะจบการต่อสู้`);
        // whenAttacked (เช่น อู๊ดลูกเสือ) — ให้ฝ่ายรับเลือกนอนใบอื่นยกเลิกโจมตีได้
        if (!isLife && a.def) {
          abil(st, a.def, 'whenAttacked').forEach(ab => runActions(st, fx, ab.actions, { src: a.def, owner: ot, rng: rng }));
        }
        // ไพรมอล: เสนอเซ่นแล้วตื่น หลังประกาศโจมตี (ก่อนปะทะ)
        offerWhenAttacking(st, a.atk);
        // ฝ่ายรับสวนได้ไหม / มี prompt ค้าง (รวม whenAttacking) → อย่าปะทะทันที
        const defCanRespond = (() => {
          if ((st.prompts || []).length) return true;
          if (declCtx._blockReact) return false;
          if ((st.prompts || []).some(p => p.chooser === ot || p.kind === 'react')) return true;
          return (st.zones[ot + '.hand'] || []).some(k => {
            const c = st.inst[k];
            if (!c || c.type !== 'Magic' || c.subtype !== 'React') return false;
            if (!abilitiesOf(c.code, 'enemyDeclareAttack').length) return false;
            if (isMagicTypeUsed(st, ot, 'React')) return false;
            return true;
          });
        })();
        const paNow = effPower(st, a.atk);
        const tgtText = isLife
          ? `LIFE ใบที่ ${(st.zones[ot + '.life'] || []).indexOf(tgtId) + 1}`
          : `${T.name} (P${effPower(st, tgtId)})`;
        if (defCanRespond) {
          addLog(st, 'S', `⚔️ ${A.name} (P${paNow}) ประกาศโจมตี ${tgtText} — รอตอบสนอง`);
          fx.snd = 'tap';
        } else {
          addLog(st, 'S', `⚔️ ${A.name} (P${paNow}) โจมตี ${tgtText}`);
          const pnd = st.pending; st.pending = null;
          resolveCombat(st, fx, pnd.atk, pnd.def, pnd.life);
        }
        break;
      }

      case 'holdAttack': {
        if (!st.pending) break;
        if (isPlayer && by !== st.pending.target) return deny('เฉพาะฝ่ายที่ถูกโจมตีเท่านั้น');
        if (!st.pending.held) { st.pending.held = true; addLog(st, st.pending.target, 'ขอใช้การ์ด/เอฟเฟกต์ตอบโต้ — การโจมตีค้างไว้'); }
        break;
      }

      case 'resolveAttack': {
        if (!st.pending) break;
        if (isPlayer && by !== st.pending.target) return deny('ฝ่ายที่ถูกโจมตีเป็นคนกดปะทะ');
        const pnd = st.pending; st.pending = null;
        // THE END: โจมตี Avatar ศัตรูทุกใบพร้อมกัน
        if (st.inst[pnd.atk] && st.inst[pnd.atk].attackAllEnemyUntilEOT && !pnd.life) {
          const oa = ownerOf(st, pnd.atk);
          const foes = (st.zones[other(oa) + '.avatar'] || []).slice();
          addLog(st, 'S', `THE END: ${nameOf(st, pnd.atk)} ปะทะ Avatar ศัตรูทุกใบ (${foes.length})`);
          foes.forEach(def => {
            if (st.inst[pnd.atk] && (zoneOf(st, pnd.atk) || '').endsWith('.avatar') && st.inst[def] && (zoneOf(st, def) || '').endsWith('.avatar'))
              resolveCombat(st, fx, pnd.atk, def, null);
          });
        } else {
          resolveCombat(st, fx, pnd.atk, pnd.def, pnd.life);
        }
        break;
      }

      case 'cancelAttack': {
        if (!st.pending) break;
        if (isPlayer && by !== st.pending.by) return deny('เฉพาะฝ่ายผู้โจมตีที่ยกเลิกได้');
        addLog(st, st.pending.by, `ยกเลิกการโจมตีของ ${nameOf(st, st.pending.atk)}`);
        clearCombatBuffs(st);
        st.pending = null;
        break;
      }

      /* ผ่านเชน — ฝ่ายที่มีสิทธิ์ตอบโต้กดผ่าน → ตัดสินเชนจากบนลงล่าง */
      case 'chainPass': {
        if (!st.chain.length) break;
        if (isPlayer && by !== st.chainPri) return deny('ยังไม่ถึงตาคุณตอบโต้เชน');
        resolveChain(st, fx, rng);
        break;
      }

      /* ยกเลิกเวทบนเชน — ใช้การ์ดยกเลิก (ชายจากอนาคต ฯลฯ) กับลิงก์บนสุดที่ยังไม่ถูกยกเลิก */
      case 'chainNegate': {
        if (!st.chain.length) break;
        if (isPlayer && by !== st.chainPri) return deny('ยังไม่ถึงตาคุณตอบโต้เชน');
        for (let i = st.chain.length - 1; i >= 0; i--) {
          if (!st.chain[i].negated) { st.chain[i].negated = true; addLog(st, by, `🚫 ยกเลิกเวท "${nameOf(st, st.chain[i].src)}" บนเชน`); break; }
        }
        st.chainPri = other(by); // อีกฝ่ายตอบโต้ต่อได้ หรือผ่าน
        fx.snd = 'clash'; break;
      }

      /* เลือกปฏิบัติ — การ์ดที่ให้เลือก 1 ใน N ข้อ: บันทึกข้อที่เลือก + รัน actions ของข้อนั้นถ้ามีนิยาม */
      case 'chooseMode': {
        const c = st.inst[a.k]; if (!c) break;
        const owner = ownerOf(st, a.k);
        if (strict && isPlayer && owner !== by && owner !== 'S') return deny('เลือกปฏิบัติได้เฉพาะการ์ดฝั่งตัวเอง');
        const idx = a.opt | 0;
        // ถ้ามี prompt chooseMode ค้าง (เช่น เลือกมันสำหรับพวกจน) → ใช้ options จาก prompt
        const pr0 = (st.prompts || [])[0];
        if (pr0 && pr0.kind === 'chooseMode' && pr0.src === a.k) {
          if (isPlayer && by !== pr0.chooser) return deny('ยังไม่ใช่ตาคุณเลือกปฏิบัติ');
          const optP = (pr0.options || [])[idx];
          st.prompts.shift();
          const ownP = pr0.chooser;
          addLog(st, ownP, `🎯 ${c.name} · เลือกปฏิบัติ → ข้อ ${idx + 1}${optP && optP.label ? ': ' + optP.label : ''}`);
          if (optP && (optP.actions || []).length)
            runActions(st, fx, optP.actions, { src: a.k, owner: ownP, rng: rng });
          fx.snd = fx.snd || 'place';
          break;
        }
        const ab = abilitiesOf(c.code, 'chooseMode')[0];
        if (ab && ab.oncePerTurn && !claimOncePerTurn(st, a.k, 'chooseMode'))
          return deny(`"${c.name}" เลือกปฏิบัติไปแล้วในเทิร์นนี้`);
        const opt = ab && ab.options && ab.options[idx];
        if (opt && opt.requireNoModUsed && st.magicUsed && st.magicUsed[owner === 'S' ? by : owner] && st.magicUsed[owner === 'S' ? by : owner]['Modification'])
          return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว — เลือกข้อนี้ไม่ได้');
        const own = owner === 'S' ? (c.controller || by || 'A') : owner;
        const kz = zoneOf(st, a.k) || '';
        if (kz.endsWith('.avatar') && abilitiesNullified(st, a.k))
          return deny(`"${c.name}" สูญเสียความสามารถอยู่ (จนจบเทิร์น)`);
        addLog(st, own, `🎯 ${c.name} · เลือกปฏิบัติ → ข้อ ${idx + 1}${a.label ? ': ' + a.label : ''}${opt && opt.label ? ': ' + opt.label : ''}`);
        if (opt && (opt.actions || []).length) {
          if (kz.endsWith('.avatar') && offerAbilityReact(st, fx, own, a.k, {
            type: 'chooseMode', src: a.k, owner: own, actions: opt.actions
          })) {
            fx.snd = 'tap';
            break;
          }
          runActions(st, fx, opt.actions, { src: a.k, owner: own, rng: rng });
        }
        fx.snd = fx.snd || 'place';
        break;
      }

      /* สั่งใช้ความสามารถ activated ของการ์ดบนสนาม / Land / จากมือ / จากนรก */
      case 'activateAbility': {
        const c = st.inst[a.k]; if (!c) break;
        const z = zoneOf(st, a.k) || '';
        // จากมือ (เมฟิสโต)
        if (z.endsWith('.hand')) {
          const abH = abilitiesOf(c.code, 'activatedFromHand')[0];
          if (!abH) return deny(`"${c.name}" ไม่มีสั่งใช้จากมือ`);
          const ownerH = z[0];
          if (strict && isPlayer && ownerH !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
          if (strict && st.active !== by) return deny('สั่งใช้ได้ในเทิร์นของคุณ');
          if (strict && st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะเฟส Main');
          if (abH.requireUniqueHellSymbolNames) {
            const rq = abH.requireUniqueHellSymbolNames;
            const names = uniqueHellSymbolNames(st, ownerH, rq.symbol || 'นรก');
            if (names.size < (rq.min || 7))
              return deny(`ใช้ไม่ได้ — นรกต้องมี ${rq.symbol || 'นรก'} ชื่อไม่ซ้ำ ≥ ${rq.min || 7} (ตอนนี้ ${names.size})`);
          }
          const costsH = normalizeAbilityCost(abH.cost) || (Array.isArray(abH.cost) ? abH.cost : null);
          const runHand = () => runActions(st, fx, abH.actions || [], { src: a.k, owner: ownerH, rng });
          if (costsH && costsH[0] && costsH[0].op === 'discard') {
            const need = costsH[0].count || 1;
            const filt = costsH[0].filter || {};
            const handPay = (st.zones[ownerH + '.hand'] || []).filter(id => id !== a.k && matchFilterEx(st, id, filt));
            if (handPay.length < need) return deny(`ต้องทิ้งมือ ${need} ใบ`);
            st.prompts.push({
              kind: 'chooseDiscard', src: a.k, chooser: ownerH, filter: filt, excludeIds: [a.k],
              discardNeed: need, discardGot: 0, actions: abH.actions, effectDiscard: true
            });
            addLog(st, ownerH, `⚡ สั่งใช้จากมือ ${c.name} — ทิ้ง ${need} ใบ`);
            fx.snd = 'place'; break;
          }
          addLog(st, ownerH, `⚡ สั่งใช้จากมือ ${c.name}`);
          runHand();
          fx.snd = 'place'; break;
        }
        // จากนรก (THE END / ลุงไนท์)
        {
          const abHellTrig = abilitiesOf(c.code, 'activatedFromHell')[0];
          const absAct0 = abilitiesOf(c.code, 'activated');
          const abFromHellFlag = absAct0.find(x => x.fromHell);
          if (z.endsWith('.hell') && (abHellTrig || abFromHellFlag)) {
            const ab = abHellTrig || abFromHellFlag;
            const ownerH = z[0];
            if (strict && isPlayer && ownerH !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
            if (ab.requireNoModUsed && st.magicUsed && st.magicUsed[ownerH] && st.magicUsed[ownerH]['Modification'])
              return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว');
            const costsX = normalizeAbilityCost(ab.cost) || (Array.isArray(ab.cost) ? ab.cost : null);
            if (costsX && costsX[0] && costsX[0].op === 'exileSelf') {
              doMove(st, a.k, ownerH + '.dark', null, fx);
              addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name} (เนรเทศตัวเอง)`);
              runActions(st, fx, ab.actions || [], { src: a.k, owner: ownerH, rng });
              fx.snd = 'place'; break;
            }
            if (costsX && costsX[0] && costsX[0].op === 'discard') {
              if (!(st.zones[ownerH + '.hand'] || []).length) return deny('ไม่มีมือให้ทิ้ง');
              st.prompts.push({ kind: 'chooseDiscard', src: a.k, chooser: ownerH, filter: {}, actions: ab.actions, effectDiscard: true });
              addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name} — ทิ้งมือ 1 ใบ`);
              fx.snd = 'place'; break;
            }
            addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name}`);
            runActions(st, fx, ab.actions || [], { src: a.k, owner: ownerH, rng });
            fx.snd = 'place'; break;
          }
        }
        // เลือกความสามารถที่ถูกจังหวะ: ตอนโจมตี → whenAttacking · นอกนั้น → สั่งใช้ปกติ (เช่น ไพรมอลเรียกหนู)
        const absAct = abilitiesOf(c.code, 'activated');
        const abAtk = absAct.find(x => x.whenAttacking);
        const abNorm = absAct.find(x => !x.whenAttacking && !x.fromHell);
        const ab = (abAtk && st.pending && st.pending.atk === a.k) ? abAtk : (abNorm || abAtk || absAct[0]);
        if (!ab) return deny(`"${c.name}" ไม่มีความสามารถสั่งใช้`);
        // จากนรก (ลุงไนท์ / ดาบ) — legacy fromHell flag
        if (ab.fromHell) {
          if (!z || !z.endsWith('.hell')) return deny('ความสามารถนี้ใช้ได้เมื่ออยู่ในนรกเท่านั้น');
          const ownerH = z[0];
          if (strict && isPlayer && ownerH !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
          if (ab.requireNoModUsed && st.magicUsed && st.magicUsed[ownerH] && st.magicUsed[ownerH]['Modification'])
            return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว');
          if (ab.requireOwnNameIncludes) {
            const need = ab.requireOwnCount || 1;
            const n = (st.zones[ownerH + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes)).length;
            if (n < need) return deny(`ใช้ไม่ได้ — ต้องมี "${ab.requireOwnNameIncludes}" ≥ ${need} (ตอนนี้ ${n})`);
          }
          if (ab.cost && ab.cost[0] && ab.cost[0].op === 'discard') {
            if (!(st.zones[ownerH + '.hand'] || []).length) return deny('ไม่มีมือให้ทิ้ง');
            st.prompts.push({ kind: 'chooseDiscard', src: a.k, chooser: ownerH, filter: {}, actions: ab.actions, effectDiscard: true });
            addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name} — ทิ้งมือ 1 ใบ`);
            fx.snd = 'place'; break;
          }
          addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name}`);
          runActions(st, fx, ab.actions, { src: a.k, owner: ownerH, rng });
          fx.snd = 'place'; break;
        }
        if (!z || !(z === 'land' || z.endsWith('.avatar') || z.endsWith('.magic') || z.endsWith('.construct')))
          return deny('สั่งใช้ได้เฉพาะการ์ดบนสนาม');
        if (z.endsWith('.avatar') && abilitiesNullified(st, a.k))
          return deny(`"${c.name}" สูญเสียความสามารถอยู่ (จนจบเทิร์น)`);
        const owner = z === 'land' ? (c.controller || by) : z[0];
        if (!owner || (owner !== 'A' && owner !== 'B')) return deny('ไม่ทราบเจ้าของ Land');
        if (strict && isPlayer && owner !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
        // ไพรมอล: สั่งใช้ตอนโจมตี (เซ่นแล้วตื่น) — อนุญาตนอก Main ถ้า whenAttacking
        if (ab.whenAttacking) {
          if (!st.pending || st.pending.atk !== a.k) return deny('ใช้ได้เมื่อ Avatar ใบนี้กำลังโจมตี');
        } else {
          if (strict && st.active !== by) return deny('สั่งใช้ได้ในเทิร์นของคุณ');
          if (strict && st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะเฟส Main');
        }
        if (ab.requireUniqueHellSymbolNames) {
          const rq = ab.requireUniqueHellSymbolNames;
          const names = uniqueHellSymbolNames(st, owner, rq.symbol || 'นรก');
          if (names.size < (rq.min || 4))
            return deny(`ใช้ไม่ได้ — นรกต้องมี ${rq.symbol || 'นรก'} ชื่อไม่ซ้ำ ≥ ${rq.min || 4} (ตอนนี้ ${names.size})`);
        }
        if (ab.requireNoModUsed && st.magicUsed && st.magicUsed[owner] && st.magicUsed[owner]['Modification'])
          return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว');
        if (ab.requireOwnNameIncludes) {
          const need = ab.requireOwnCount || 1;
          const n = (st.zones[owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes)).length;
          if (need > 1) {
            if (n < need) return deny(`ใช้ไม่ได้ — ต้องมี "${ab.requireOwnNameIncludes}" ≥ ${need}`);
          } else {
            const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes));
            if (!ok) return deny(`ใช้ไม่ได้ — ต้องมี "${ab.requireOwnNameIncludes}"`);
          }
        }
        if (ab.requireBothHaveAvatar) {
          if (!(st.zones['A.avatar'] || []).length || !(st.zones['B.avatar'] || []).length)
            return deny('ใช้ไม่ได้ — ต้องมี Avatar ทั้งสองฝ่าย');
        }
        if (ab.requireEnemyCostSumMax != null) {
          const opp = other(owner);
          const sum = (st.zones[opp + '.avatar'] || []).reduce((n, id) => n + effCost(st, id), 0);
          if (sum > ab.requireEnemyCostSumMax) return deny(`ใช้ไม่ได้ — Cost รวมศัตรู ${sum} > ${ab.requireEnemyCostSumMax}`);
        }
        if (ab.requireOwn) {
          const ro = ab.requireOwn;
          const ok = (st.zones[owner + '.avatar'] || []).some(id => {
            const x = st.inst[id]; if (!x) return false;
            if (ro.symbol && x.symbol !== ro.symbol) return false;
            if (ro.costMin != null && effCost(st, id) < ro.costMin) return false;
            if (ro.nameIncludes && !nameMatches(x, ro.nameIncludes)) return false;
            return true;
          });
          if (!ok) return deny('ใช้ไม่ได้ — ไม่ตรงเงื่อนไขบนสนาม');
        }
        // รวม cost แบบ object + array
        const costList = normalizeAbilityCost(ab.cost) || (Array.isArray(ab.cost) ? ab.cost : (ab.cost ? [ab.cost] : []));
        // ตรวจค่าใช้จ่ายก่อนมาร์ค oncePerTurn
        if (costList.length) {
          const costOp = costList[0];
          if (costOp.op === 'discard') {
            const filt = Object.assign({}, costOp.filter || {});
            if (costOp.gemMin != null) filt.gemMin = costOp.gemMin;
            const need = costOp.count || 1;
            const avail = (st.zones[owner + '.hand'] || []).filter(x => matchFilterEx(st, x, filt));
            if (avail.length < need) return deny(need > 1 ? `ไม่มีมือตรงเงื่อนไขให้ทิ้งครบ ${need}` : 'ไม่มีมือตรงเงื่อนไขให้ทิ้งจ่าย');
          } else if (costOp.op === 'discardGemSum') {
            const total = (st.zones[owner + '.hand'] || []).reduce((n, id) => n + (+(st.inst[id] && st.inst[id].gem) || 0), 0);
            if (total < (costOp.min || 3)) return deny(`GEM ในมือรวม ${total} < ${costOp.min || 3}`);
          } else if (costOp.op === 'returnHandToDeck') {
            if (!(st.zones[owner + '.hand'] || []).some(x => matchFilterEx(st, x, costOp.filter)))
              return deny('ไม่มีมือให้คืนเด็ค');
          } else if (costOp.op === 'sacrifice') {
            const filt = Object.assign({}, costOp.filter || {}, { _srcK: a.k });
            const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: filt, dest: 'sacrifice', optional: false };
            if (!promptCandidates(st, p).length) return deny('ไม่มีเป้าเซ่นไหว้');
          } else if (costOp.op === 'exileHell') {
            const hell = st.zones[owner + '.hell'] || [];
            if (hell.length < (costOp.count || 1)) return deny(`นรกไม่พอเนรเทศ ${costOp.count || 1} ใบ`);
          } else if (costOp.op === 'exileHellDistinctNames') {
            const hell = (st.zones[owner + '.hell'] || []).filter(id => nameMatches(st.inst[id], costOp.nameIncludes || ''));
            const uniq = new Set(hell.map(id => st.inst[id].name));
            if (uniq.size < (costOp.count || 3)) return deny(`นรกไม่มี "${costOp.nameIncludes}" ชื่อไม่ซ้ำครบ ${costOp.count || 3}`);
          } else if (costOp.op === 'exileSelf') {
            /* ok */
          }
        }
        if (ab.oncePerTurn && !claimOncePerTurn(st, a.k, 'activated'))
          return deny(`"${c.name}" ใช้ความสามารถไปแล้วในเทิร์นนี้`);
        addLog(st, owner, `⚡ สั่งใช้ ${c.name}`);
        // เชาว์ปัญญาลิง: เสนอ React ก่อนจ่ายค่า/รันผล (ทั้งที่มีและไม่มี cost)
        if (z.endsWith('.avatar') && offerAbilityReact(st, fx, owner, a.k, {
          type: 'activateFull', src: a.k, owner, costList, actions: ab.actions || []
        })) {
          fx.snd = 'tap';
          break;
        }
        payCostAndRunActivated(st, fx, owner, a.k, costList, ab.actions || [], rng);
        fx.snd = fx.snd || 'place';
        break;
      }

      /* เป่ายิ้งฉุบ (ฉุบสั่งตาย) — ทั้งสองฝ่ายส่ง rock/paper/scissors */
      case 'rpsPick': {
        const p = st.prompts[0]; if (!p || p.kind !== 'rps') return deny('ไม่ได้อยู่ในโหมดเป่ายิ้งฉุบ');
        const who = by || a.p;
        if (who !== 'A' && who !== 'B') return deny('ระบุฝ่ายไม่ได้');
        if (p.picks[who]) return deny('เลือกไปแล้ว');
        const v = a.v;
        if (v !== 'rock' && v !== 'paper' && v !== 'scissors') return deny('เลือกค้อน/กระดาษ/กรรไกร');
        p.picks[who] = v;
        const label = { rock: 'ค้อน', paper: 'กระดาษ', scissors: 'กรรไกร' };
        addLog(st, who, `เป่ายิ้งฉุบ: เลือกแล้ว (${label[v]})`);
        if (p.picks.A && p.picks.B) finishRps(st, fx, rng);
        fx.snd = 'tap';
        break;
      }
      case 'rpsTimeout': {
        const p = st.prompts[0]; if (!p || p.kind !== 'rps') break;
        const opts = ['rock', 'paper', 'scissors'];
        ['A', 'B'].forEach(pl => {
          if (!p.picks[pl]) {
            p.picks[pl] = opts[Math.floor((typeof rng === 'function' ? rng() : Math.random()) * 3)];
            addLog(st, pl, 'เป่ายิ้งฉุบ: หมดเวลา — สุ่มให้อัตโนมัติ');
          }
        });
        finishRps(st, fx, rng);
        fx.snd = 'tap';
        break;
      }

      /* สืบทอดคำสั่ง (Inheritance Chain) — ยกความสามารถของการ์ด a.k ไปให้ผู้รับ a.to (ที่ระบุชื่อ) */
      case 'inherit': {
        const c = st.inst[a.k], tgt = st.inst[a.to];
        if (!c) break;
        if (!tgt) return deny('ไม่พบเป้าผู้รับสืบทอด');
        if (a.k === a.to) return deny('สืบทอดให้ตัวเองไม่ได้');
        const srcOwner = ownerOf(st, a.k) === 'S' ? (a.by || st.active) : ownerOf(st, a.k);
        if (strict && isPlayer) {
          const tside = ownerOf(st, a.to);
          if (tside !== by && tside !== 'S') return deny('สืบทอดให้การ์ดฝั่งตัวเองเท่านั้น');
        }
        const src = EFFECTS[c.code];
        const all = ((src && src.abilities) || []).concat(c.granted || []); // รวมสายที่สืบทอดต่อกันมา
        if (!all.length) return deny(`"${c.name}" ไม่มีความสามารถให้สืบทอด`);
        tgt.granted = (tgt.granted || []).concat(JSON.parse(JSON.stringify(all)));
        tgt.inheritedFrom = (tgt.inheritedFrom || []).concat(c.name);
        addLog(st, srcOwner, `🧬 สืบทอดคำสั่ง: ${tgt.name} รับความสามารถของ ${c.name} (${all.length} อย่าง)`);
        fx.snd = 'place';
        break;
      }

      /* สามัคคี — ฝ่ายที่ประกาศโจมตี นอน Avatar ตัวอื่นลง เพื่อเสริม POWER ให้ตัวโจมตีจนจบเทิร์น */
      /* ★ สามัคคี (แมนนวล): นอนการ์ด k แล้วยก POWER ของมันไปบวกให้ตัวที่เลือก (a.to) จนจบเทิร์น */
      case 'unity': {
        const c = st.inst[a.k]; if (!c) break;
        const tgt = st.inst[a.to]; if (!tgt) return deny('ต้องเลือกการ์ดที่จะรับพลังด้วย');
        const side = ownerOf(st, a.k);
        if (strict && isPlayer && side !== by) return deny('สามัคคีได้เฉพาะการ์ดฝั่งตัวเอง');
        if (a.k === a.to) return deny('เลือกตัวอื่นเป็นผู้รับพลัง');
        if (!(zoneOf(st, a.k) || '').endsWith('.avatar')) return deny('ใช้ได้เฉพาะ Avatar บนสนาม');
        if (!(zoneOf(st, a.to) || '').endsWith('.avatar')) return deny('ผู้รับต้องเป็น Avatar บนสนาม');
        if (c.tapped) return deny(`"${c.name}" นอนอยู่แล้ว ใช้สามัคคีไม่ได้`);
        const add = effPower(st, a.k);
        c.tapped = true;
        st.buffs.push({ k: a.to, amt: add, until: 'endOfTurn', from: a.k });
        addLog(st, side, `🤝 สามัคคี: ${c.name} นอนลง → เสริม POWER +${add} ให้ ${tgt.name} (ถึงจบเทิร์น)`);
        fx.announce = { src: a.k, tgt: a.to, srcName: c.name, tgtName: tgt.name, by: side, kind: 'unity', pa: add, pd: effPower(st, a.to) };
        fx.snd = 'tap'; break;
      }

      /* ★ คู่หู (แมนนวล): จับได้เฉพาะการ์ดที่มีข้อความ คู่หู/Link และเฉพาะชื่อคู่ที่ระบุ */
      case 'pair': {
        const c1 = st.inst[a.k], c2 = st.inst[a.to];
        if (!c1) break;
        if (!a.to) { // ยกเลิกคู่
          const old = c1.pairWith;
          if (old && st.inst[old]) { delete st.inst[old].pairWith; delete st.inst[old].pairId; }
          delete c1.pairWith; delete c1.pairId;
          addLog(st, by || 'S', `💔 ยกเลิกคู่หูของ ${c1.name}`);
          break;
        }
        if (!c2) return deny('ต้องเลือกการ์ดใบที่สองด้วย');
        if (a.k === a.to) return deny('เลือกการ์ดคนละใบ');
        if (!cardHasBuddyAbility(c1))
          return deny(`"${c1.name}" ไม่มีความสามารถคู่หู/Link — จับคู่ไม่ได้`);
        if (!buddyPairAllowed(c1, c2))
          return deny(`จับคู่หูไม่ได้ — ต้องเป็นคู่ที่ระบุบนการ์ด (เช่น "${buddyPartnerNameOf(c1) || 'ชื่อคู่หู'}")`);
        // ตัดคู่เดิมของทั้งสองใบก่อน (การ์ด 1 ใบมีคู่ได้ทีละคู่)
        [c1, c2].forEach(cc => { if (cc.pairWith && st.inst[cc.pairWith]) { delete st.inst[cc.pairWith].pairWith; delete st.inst[cc.pairWith].pairId; } });
        st._pairSeq = (st._pairSeq || 0) + 1;
        const pid = ((st._pairSeq - 1) % 4) + 1; // สีคู่ 1-4 วนไป
        c1.pairWith = a.to; c1.pairId = pid;
        c2.pairWith = a.k; c2.pairId = pid;
        addLog(st, by || 'S', `🤝 จับคู่หู: ${c1.name} ✚ ${c2.name}`);
        fx.announce = { src: a.k, tgt: a.to, srcName: c1.name, tgtName: c2.name, by: by || '?', kind: 'pair' };
        fx.snd = 'place'; break;
      }

      /* โล่มนุษย์ — ฝ่ายที่ถูกโจมตี นอน Avatar ลง แล้วเปลี่ยนเป้าการโจมตีมาที่ตัวเอง */
      case 'humanShield': {
        if (!st.pending) return deny('โล่มนุษย์ได้เฉพาะตอนถูกประกาศโจมตี');
        const c = st.inst[a.k]; if (!c) break;
        const side = ownerOf(st, a.k);
        if (strict && isPlayer && side !== by) return deny('โล่มนุษย์ได้เฉพาะการ์ดฝั่งตัวเอง');
        if (side !== st.pending.target) return deny('โล่มนุษย์ได้เฉพาะฝ่ายที่ถูกโจมตี');
        if (a.k === st.pending.def) return deny('การ์ดนี้เป็นเป้าอยู่แล้ว');
        if (!(zoneOf(st, a.k) || '').endsWith('.avatar')) return deny('ใช้ได้เฉพาะ Avatar บนสนาม');
        if (c.tapped) return deny('การ์ดนอนอยู่ ใช้โล่มนุษย์ไม่ได้');
        // ดาบศักดิ์สิทธิ์ ฯลฯ: ผู้โจมตีที่สวมโฮสต์บล็อกโล่มนุษย์
        {
          const atk = st.pending.atk;
          if (atk && st.inst[atk]) {
            for (const id in st.inst) {
              const m = st.inst[id];
              if (!m || m.attachedTo !== atk) continue;
              const me = EFFECTS[m.code];
              if (me && me.hostBlockHumanShield)
                return deny(`โล่มนุษย์ใช้ไม่ได้ — ${m.name} บนผู้โจมตีบล็อก`);
            }
          }
        }
        c.tapped = true;
        st.pending.def = a.k; st.pending.life = null; st.pending.kind = 'battle';
        addLog(st, side, `🛡️ โล่มนุษย์: ${c.name} นอนลง รับการโจมตีแทน`);
        fx.snd = 'tap'; break;
      }

      /* ยึดการควบคุม — ย้าย Avatar ฝ่ายตรงข้ามมาฝั่งเรา (สภาพนอน) สำหรับเอฟเฟกต์เปลี่ยนการควบคุม */
      case 'takeControl': {
        const c = st.inst[a.k]; if (!c) break;
        const z = zoneOf(st, a.k) || '';
        if (!z.endsWith('.avatar')) return deny('ยึดได้เฉพาะ Avatar บนสนาม');
        const from = z[0], to = other(from);
        if (strict && isPlayer && by !== to) return deny('ยึดได้เฉพาะฝั่งที่จะเอามาคุม');
        const block = controlImmuneBlock(st, a.k, a.src || null);
        if (block) return deny(block);
        doMove(st, a.k, to + '.avatar', null, fx);
        st.inst[a.k].tapped = true;
        addLog(st, to, `⛓️ ยึดการควบคุม ${c.name} มาฝั่งเรา (สภาพนอน)`);
        fx.snd = 'place'; break;
      }

      /* เปิดใช้ความสามารถจากนรก — marker ให้ทั้งห้องเห็น (ผลของการ์ดทำตามการ์ด เช่น ดึงขึ้นมือ) */
      case 'hellActivate': {
        const c = st.inst[a.k]; if (!c) break;
        const z = zoneOf(st, a.k) || '';
        if (!z.endsWith('.hell')) return deny('ใช้ได้เฉพาะการ์ดในนรก');
        if (strict && isPlayer && z[0] !== by) return deny('เปิดใช้ได้เฉพาะนรกฝั่งตัวเอง');
        addLog(st, z[0], `🔮 เปิดใช้ความสามารถจากนรก: ${c.name}`);
        fx.snd = 'flip'; break;
      }

      case 'battle': {
        const A = st.inst[a.atk], D = st.inst[a.def]; if (!A || !D) break;
        const oa = ownerOf(st, a.atk), od = ownerOf(st, a.def);
        if (oa === od || oa === 'S' || od === 'S') break;
        // ★ กฎเดียวที่ยังบังคับ: เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้
        if (st.turn === 1 && oa === (st.firstPlayer || 'A')) return deny('เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้');
        A.tapped = true;
        declareBuffs(st, a.atk);
        if (declareEffects(st, fx, a.atk, a.def, rng)) break;
        applyOnFightBuffs(st, a.atk, a.def);
        resolveCombat(st, fx, a.atk, a.def, null);
        break;
      }

      case 'lifeHit': {
        const A = st.inst[a.atk], L = st.inst[a.life]; if (!A || !L) break;
        // ★ กฎเดียวที่ยังบังคับ: เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้
        if (st.turn === 1 && ownerOf(st, a.atk) === (st.firstPlayer || 'A')) return deny('เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้');
        const atkOwn = ownerOf(st, a.atk);
        const lown = ownerOf(st, a.life);
        const enemyAv = (st.zones[lown + '.avatar'] || []).length;
        const canEgg = hasKw(st, a.atk, 'เตะไข่') || A._allowLifeDespiteAvatars;
        if (enemyAv > 0 && !canEgg)
          return deny('มี Avatar ศัตรูอยู่ — ตี LIFE ไม่ได้ (ต้องมี「เตะไข่」หรือเอฟเฟกต์พิเศษ)');
        if (A._allowLifeDespiteAvatars) delete A._allowLifeDespiteAvatars;
        const lives = st.zones[lown + '.life'] || [];
        const fdown = lives.filter(k => !st.inst[k].faceUp);
        // สาหัส = LIFE หงายครบแล้ว — โจมตี LIFE อีกครั้ง = ท่าปิดเกม (ถามสวนก่อน)
        const isCritical = lives.length > 0 && fdown.length === 0;
        if (isCritical && !a.confirmed && !st.pendingLethal) {
          A.tapped = true;
          st.pendingLethal = { atk: a.atk, life: a.life, by: atkOwn, target: lown };
          addLog(st, 'S', `⚠️ ${A.name} ประกาศท่าปิดเกมใส่ฝ่าย ${lown} (สถานะสาหัส) — รอฝั่ง ${lown} ตอบว่าจะใช้การ์ดสวนไหม`);
          fx.lethalAsk = { by: atkOwn, target: lown, atk: a.atk };
          fx.snd = 'tap';
          break;
        }
        A.tapped = true;
        declareBuffs(st, a.atk);
        declareEffects(st, fx, a.atk, null, rng);
        resolveCombat(st, fx, a.atk, null, a.life);
        break;
      }

      // ★ ฝั่งที่ถูกประกาศปิดเกมตอบ: ok=true = ขอสวน (ท่าเป็นโมฆะ เล่นต่อ) · ok=false = ไม่สวน → จบเกม
      case 'lethalAnswer': {
        const pl = st.pendingLethal; if (!pl) break;
        if (isPlayer && by !== pl.target) return deny('เฉพาะฝั่งที่ถูกประกาศปิดเกมเท่านั้นที่ตอบได้');
        st.pendingLethal = null;
        if (a.ok) {
          addLog(st, pl.target, `🛡️ ฝั่ง ${pl.target} ขอใช้การ์ดสวน — ท่าปิดเกมเป็นโมฆะ เล่นต่อได้ (ลงการ์ดสวนเองบนสนาม)`);
          fx.snd = 'tap'; break;
        }
        addLog(st, pl.target, `ฝั่ง ${pl.target} ไม่สวน — ท่าปิดเกมทำงาน`);
        declareBuffs(st, pl.atk);
        declareEffects(st, fx, pl.atk, null, rng);
        resolveCombat(st, fx, pl.atk, null, pl.life);
        break;
      }

      case 'payCost': {
        // กันทิ้งมือซ้ำตอนกำลังจ่ายค่าเวทด้วย chooseDiscard (เช่น เลือกเทพ 2 ใบแล้วกดทิ้งจ่าย)
        {
          const pd = (st.prompts || [])[0];
          if (pd && pd.kind === 'chooseDiscard' && (pd.chooser === a.p || pd.chooser === by))
            return deny('กำลังทิ้งจ่ายค่าเวท — แตะการ์ดในมือที่กะพริบตามแถบบน (อย่าใช้ปุ่มทิ้งจ่าย)');
        }
        if (strict && isPlayer && a.p !== by) return deny('จ่ายได้เฉพาะจากมือตัวเอง');
        const ids = (a.ids || []).filter(k => st.zones[a.p + '.hand'].includes(k));
        if (!ids.length) break;
        const names = ids.map(k => nameOf(st, k));
        ids.forEach(k => { st.inst[k].faceUp = true; doMove(st, k, a.p + '.hell', null, fx); });
        addLog(st, a.p, `🗑️ ทิ้งจ่าย: ${names.join(' · ')} (${ids.length} ใบ · GEM รวม ${a.gem})`);
        fx.toss = { by: a.p, names }; // client โชว์ป๊อปอัพให้อีกฝั่งเห็นว่าทิ้งใบไหน
        fx.snd = 'place'; break;
      }

      case 'setPhase': {
        if (strict && isPlayer && by !== st.active) return deny('โหมดกติกา: เปลี่ยนเฟสได้เฉพาะผู้เล่นที่ถือเทิร์น');
        st.phase = a.phase; addLog(st, a.by || st.active, `เข้าเฟส ${a.phase}`);
        // trigger เริ่ม Battle Phase (auto + เริ่ม Battle Phase) — ยิงให้ Avatar ฝ่ายที่ถือเทิร์น
        if (a.phase === 'Battle') (st.zones[st.active + '.avatar'] || []).slice().forEach(k => {
          abil(st, k, 'battlePhaseStart').forEach(ab => runActions(st, fx, ab.actions, { src: k, owner: st.active, rng: rng }));
        });
        // LIFE / schedule: nextOwnMainPhase
        if (a.phase === 'Main') {
          const due = st.scheduled.filter(s => s.player === st.active && s.when === 'nextOwnMainPhase');
          st.scheduled = st.scheduled.filter(s => !(s.player === st.active && s.when === 'nextOwnMainPhase'));
          due.forEach(s => {
            if (s.op === 'runActions' && s.actions) {
              addLog(st, st.active, `ทำเอฟเฟกต์ที่นัดไว้ (Main Phase)`);
              runActions(st, fx, s.actions, { src: s.src, owner: st.active, rng });
            } else if (s.op === 'draw') {
              const dd = st.zones[s.player + '.deck'];
              let got = 0;
              for (let i = 0; i < (s.count || 1) && dd.length; i++) { st.zones[s.player + '.hand'].push(dd.pop()); got++; }
              addLog(st, s.player, `เอฟเฟกต์ที่ค้างไว้: จั่ว ${got} ใบ`);
            }
          });
        }
        break;
      }

      case 'setFirstPlayer': {
        // เลือกผู้เริ่มก่อน — ได้เฉพาะก่อนเริ่มเล่นจริง (เทิร์น 1 · ยังไม่มีใครลงสนาม)
        const played = ['A.avatar', 'B.avatar', 'A.construct', 'B.construct', 'A.magic', 'B.magic'].some(z => (st.zones[z] || []).length);
        if (st.turn !== 1 || played) return deny('เลือกผู้เริ่มได้เฉพาะก่อนเริ่มเล่น (เทิร์น 1)');
        const p = a.p === 'B' ? 'B' : 'A';
        st.firstPlayer = p; st.active = p;
        addLog(st, 'S', `เลือกผู้เริ่มก่อน: ผู้เล่น ${p}`);
        break;
      }

      case 'mulligan': {
        // Rule Book (Game Setup): เปลี่ยนการ์ดบนมือกี่ใบก็ได้ → เรียงใต้ Deck (ไม่สับ) → จั่วใหม่เท่าเดิม · ทำได้ครั้งเดียวตอนเริ่มเกม (เทิร์น 1)
        const p = a.p || by;
        if (strict && isPlayer && p !== by) return deny('มัลลิแกนได้เฉพาะมือตัวเอง');
        if (st.turn !== 1) return deny('มัลลิแกนได้เฉพาะตอนเริ่มเกม (เทิร์น 1)');
        if (st.mulliganDone && st.mulliganDone[p]) return deny('มัลลิแกนได้ครั้งเดียวต่อเกม');
        st.mulliganDone = st.mulliganDone || {}; st.mulliganDone[p] = true;
        const hand = st.zones[p + '.hand'] || [];
        const ids = (a.ids || []).filter(k => hand.includes(k));
        if (!ids.length) { addLog(st, p, 'เก็บมือเดิม (ไม่เปลี่ยน)'); fpBonusDraw(st, fx, p); break; }
        ids.forEach(k => { st.zones[p + '.hand'] = st.zones[p + '.hand'].filter(x => x !== k); st.inst[k].faceUp = false; st.zones[p + '.deck'].unshift(k); }); // ลงใต้ Deck (ไม่สับ)
        let drew = 0; const d = st.zones[p + '.deck'];
        for (let i = 0; i < ids.length && d.length; i++) { st.zones[p + '.hand'].push(d.pop()); drew++; }
        addLog(st, p, `มัลลิแกน: เปลี่ยน ${ids.length} ใบ (เรียงใต้ Deck ไม่สับ) จั่วใหม่ ${drew} ใบ`);
        fpBonusDraw(st, fx, p);
        fx.snd = 'draw'; break;
      }

      case 'endTurn': {
        if (strict && isPlayer && by !== st.active) return deny('โหมดกติกา: จบเทิร์นได้เฉพาะผู้เล่นที่ถือเทิร์น');
        if (st.scout) return deny('กำลังสอดแนมอยู่ — เลือกไว้บนกอง/ใต้กองให้เสร็จก่อนจบเทิร์น');
        if (st.pendingLethal) return deny('มีท่าปิดเกมค้างอยู่ — รอฝั่งที่โดนตีตอบว่าจะสวนไหมก่อน');
        // กติกา: มือเกิน 7 ใบ ต้องทิ้งให้เหลือ 7 ก่อนจบเทิร์น
        if (strict) { const h = (st.zones[st.active + '.hand'] || []).length; if (h > 7) return deny(`มือเกิน 7 ใบ (มี ${h} ใบ) — ต้องทิ้งให้เหลือ 7 ก่อนจบเทิร์น (คลิกขวาการ์ดในมือ → ส่งลงนรก)`); }
        // trigger ช่วงจบเทิร์นของฝ่ายที่กำลังจบ (แม่กบ counter+1 · น้ำชูกำลัง ตื่น host · แรงงานกลับเด็ค)
        const ending = st.active;
        (st.zones[ending + '.avatar'] || []).slice().forEach(k => {
          abil(st, k, 'ownTurnEnd').forEach(ab => runActions(st, fx, ab.actions, { src: k, owner: ending, rng }));
        });
        // อวตารนารายณ์: นัด End Phase (replaceSelfWithHellNarai)
        {
          const dueEnd = st.scheduled.filter(s => s.player === ending && s.when === 'ownEndPhase');
          st.scheduled = st.scheduled.filter(s => !(s.player === ending && s.when === 'ownEndPhase'));
          dueEnd.forEach(s => {
            if (s.op === 'runActions' && s.actions) {
              addLog(st, ending, `End Phase: ทำเอฟเฟกต์ที่นัดไว้`);
              runActions(st, fx, s.actions, { src: s.src, owner: ending, rng });
            }
          });
        }
        for (const id in st.inst) {
          const m = st.inst[id];
          if (m && m.attachedTo && ownerOf(st, m.attachedTo) === ending) {
            abil(st, id, 'ownTurnEnd').forEach(ab => {
              if (ab.trigger && ab.trigger.if === 'self.attached' && !m.attachedTo) return;
              runActions(st, fx, ab.actions, { src: id, owner: ending, rng });
            });
          }
        }
        // การ์ดที่ตั้งเวลาให้ทำลายช่วง End Phase ของเจ้าของ
        st.scheduled.filter(s => s.op === 'destroyCard' && s.player === ending).forEach(s => {
          if (st.inst[s.k] && zoneOf(st, s.k)) { addLog(st, 'S', `End Phase: ทำลาย ${nameOf(st, s.k)} (ตามเอฟเฟกต์)`); destroyCard(st, fx, s.k); }
        });
        st.scheduled = st.scheduled.filter(s => !(s.op === 'destroyCard' && s.player === ending));
        // คืนการควบคุมที่แย่งมาจนจบเทิร์น (แอสการ์ด ฯลฯ)
        st.scheduled.filter(s => s.op === 'returnControl' && s.when === 'endPhase').forEach(s => {
          if (!st.inst[s.k] || !s.toOwner) return;
          const z = zoneOf(st, s.k) || '';
          if (!z.endsWith('.avatar')) return;
          const qd = quotaDeny(st, s.toOwner + '.avatar', st.inst[s.k]);
          if (qd) { addLog(st, 'S', `คืนการควบคุม ${nameOf(st, s.k)} ไม่ได้ (${qd})`); return; }
          doMove(st, s.k, s.toOwner + '.avatar', null, fx);
          addLog(st, 'S', `End Phase: คืนการควบคุม ${nameOf(st, s.k)} กลับฝ่าย ${s.toOwner}`);
        });
        st.scheduled = st.scheduled.filter(s => !(s.op === 'returnControl' && s.when === 'endPhase'));
        // เคลียร์ keyword ชั่วคราว + cannotAttack ของโลกิหลังครบเทิร์นเจ้าของใหม่? เก็บ cannotAttack จนย้ายอีกครั้ง
        for (const id in st.inst) {
          const c = st.inst[id];
          if (!c) continue;
          if (c.attackAllEnemyUntilEOT) delete c.attackAllEnemyUntilEOT;
          if (c.battleDestroyLifeHitUntilEOT) delete c.battleDestroyLifeHitUntilEOT;
          if (c._allowLifeDespiteAvatars) delete c._allowLifeDespiteAvatars;
          if (!c.grantedKeywords) continue;
          c.grantedKeywords = c.grantedKeywords.filter(g => g.until === 'permanent');
          if (!c.grantedKeywords.length) delete c.grantedKeywords;
        }
        st.pending = null; st.prompts = [];
        if (st.chain.length) { resolveChain(st, fx, rng); } st.chainPri = null;
        // เคลียร์บัฟจน End Phase ถัดไปของฝ่ายตรงข้าม (เมื่อฝ่ายนั้นจบเทิร์น)
        st.buffs = st.buffs.filter(b => {
          if (b.until === 'oppNextEnd' && b.opp === ending) return false;
          return b.until !== 'endOfTurn' && b.until !== 'combat';
        });
        sweepDestroyPowerZero(st, fx);
        for (const id in st.inst) if (st.inst[id] && st.inst[id].protectUntilEndTurn) delete st.inst[id].protectUntilEndTurn;
        for (const id in st.inst) {
          const x = st.inst[id]; if (!x) continue;
          if (x.combatImmuneUntilEOT) delete x.combatImmuneUntilEOT;
          // น้องส้ม: เคลียร์เมื่อฝ่ายตรงข้าม (ที่ถูก mark) จบเทิร์น
          if (x.protectMagicLeave && x.protectMagicLeaveOpp === ending) {
            delete x.protectMagicLeave; delete x.protectMagicLeaveOpp;
          }
          if (x.immuneOppMagicUntil && x.immuneOppMagicUntil.opp === ending) delete x.immuneOppMagicUntil;
        }
        if (st.lockSummonExcept && st.lockSummonExcept.owner === ending) delete st.lockSummonExcept;
        for (const id in st.inst) if (st.inst[id] && st.inst[id].nullifyUntilEOT) delete st.inst[id].nullifyUntilEOT;
        // เคลียร์ swap cost/power ชั่วคราว
        for (const id in st.inst) {
          if (st.inst[id] && st.inst[id]._swapCombat) {
            delete st.inst[id]._swapCombat;
          }
        }
        st.magicUsed = { A: {}, B: {} };
        st.active = st.active === 'A' ? 'B' : 'A';
        if (st.active === 'A') st.turn++;
        st.turnSeq = (st.turnSeq || 0) + 1; // นับทุกครั้งที่เปลี่ยนผู้เล่น (เทิร์นละครั้ง)
        st.phase = 'Main';
        ['avatar', 'magic', 'construct'].forEach(z => (st.zones[st.active + '.' + z] || []).forEach(k => st.inst[k].tapped = false));
        addLog(st, 'S', `จบเทิร์น — ถึงตา ${st.active} (เทิร์น ${st.turn})`);
        // แดรกคูลาฟื้นจากนรก
        const revives = st.scheduled.filter(s => s.op === 'reviveFromHell' && s.player === st.active && s.when === 'nextOwnTurn');
        st.scheduled = st.scheduled.filter(s => !(s.op === 'reviveFromHell' && s.player === st.active && s.when === 'nextOwnTurn'));
        revives.forEach(s => {
          if (!st.inst[s.k] || !(st.zones[st.active + '.hell'] || []).includes(s.k)) {
            addLog(st, 'S', `ฟื้น ${nameOf(st, s.k)} ไม่ได้ — ไม่อยู่นรก`);
            return;
          }
          const qd = quotaDeny(st, st.active + '.avatar', st.inst[s.k]);
          if (qd) { addLog(st, 'S', `ฟื้นไม่ได้ (${qd})`); return; }
          doMove(st, s.k, st.active + '.avatar', null, fx);
          st.inst[s.k].tapped = false;
          delete st.inst[s.k].draculaRevive;
          addLog(st, st.active, `🦇 อัญเชิญ ${nameOf(st, s.k)} จากนรกอัตโนมัติ (แดรกคูลา)`);
          // ไม่ได้จุติ
        });
        syncHeimdall(st);        // จั่วต้นเทิร์น 1 ใบ (เทิร์นแรกของผู้เริ่มไม่ผ่านจุดนี้ — เริ่มเกมด้วยมือเปิดอยู่แล้ว)
        {
          const dd = st.zones[st.active + '.deck'];
          if (!dd.length) {
            st.over = { winner: other(st.active) }; fx.over = other(st.active);
            addLog(st, 'S', `💀 เด็ค ${st.active} หมด จั่วต้นเทิร์นไม่ได้ — ${other(st.active)} ชนะ!`);
          } else {
            const dk = dd.pop(); st.zones[st.active + '.hand'].push(dk);
            addLog(st, st.active, 'จั่วต้นเทิร์น 1 ใบ');
            fx.drawn = dk;
          }
        }
        const due = st.scheduled.filter(s => s.player === st.active);
        st.scheduled = st.scheduled.filter(s => s.player !== st.active);
        due.forEach(s => {
          if (s.op === 'draw') {
            const dd = st.zones[s.player + '.deck'];
            let got = 0;
            for (let i = 0; i < s.count && dd.length; i++) { st.zones[s.player + '.hand'].push(dd.pop()); got++; }
            addLog(st, s.player, `เอฟเฟกต์ LIFE ที่ค้างไว้: จั่ว ${got} ใบ`);
          }
        });
        refillHand(st, fx, st.active); // เติมมือถึงขั้นต่ำ 3 ตอนเริ่มเทิร์นของฝ่ายที่ถึงตา
        // trigger เริ่มเทิร์นของฝ่ายที่ถึงตา (auto + เริ่มเทิร์น) — รันผ่าน runActions เต็มคลัง op
        (st.zones[st.active + '.avatar'] || []).slice().forEach(k => {
          abil(st, k, 'turnStart').forEach(ab => runActions(st, fx, ab.actions, { src: k, owner: st.active, rng: rng }));
        });
        fx.snd = 'draw'; break;
      }

      case 'untapAll': {
        if (strict && isPlayer && a.p !== by) return deny('ตื่นได้เฉพาะการ์ดฝั่งตัวเอง');
        ['avatar', 'magic', 'construct'].forEach(z => (st.zones[a.p + '.' + z] || []).forEach(k => st.inst[k].tapped = false));
        addLog(st, a.p, 'ตื่นทุกใบ'); break;
      }

      /* ★ ประกาศใช้การ์ดใส่เป้า (แมนนวล) — แจ้งอีกฝั่งว่า "ใช้ใบนี้ใส่ใบนี้นะ" พร้อมไฮไลต์+ป๊อปอัพ
         kind:'attack' = โจมตี → นอนตัวโจมตีให้อัตโนมัติ + โชว์ POWER ทั้งคู่ให้เทียบกันเอง */
      case 'announce': {
        const s = st.inst[a.src]; if (!s) break;
        const t = a.tgt ? st.inst[a.tgt] : null;
        const atkMode = a.kind === 'attack';
        if (atkMode) {
          // ★ กฎเดียวที่ยังบังคับ: เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้
          if (st.turn === 1 && ownerOf(st, a.src) === (st.firstPlayer || 'A')) return deny('เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้');
          if (s.tapped) return deny(`"${s.name}" นอนอยู่ — ต้องตื่นถึงจะโจมตีได้`);
          s.tapped = true; // โจมตีแล้วนอนเอง
        }
        const pa = atkMode ? effPower(st, a.src) : null;
        const pd = (atkMode && t) ? effPower(st, a.tgt) : null;
        if (atkMode) {
          addLog(st, by || 'S', t
            ? `⚔️ ${s.name} (P${pa}) โจมตี → ${t.name} (P${pd}) — นอนตัวโจมตีแล้ว · เทียบพลังแล้วเก็บการ์ดกันเอง`
            : `⚔️ ${s.name} (P${pa}) ประกาศโจมตี — นอนตัวโจมตีแล้ว`);
        } else {
          addLog(st, by || 'S', t ? `⚡ ประกาศใช้ "${s.name}" ใส่ "${t.name}"` : `⚡ ประกาศใช้ "${s.name}"`);
        }
        fx.announce = {
          src: a.src, tgt: a.tgt || null, srcName: s.name, tgtName: t ? t.name : '',
          by: by || '?', kind: atkMode ? 'attack' : 'use', pa, pd
        };
        fx.snd = atkMode ? 'clash' : 'flip'; break;
      }

      case 'dice': { addLog(st, a.by, `ทอยเต๋า d6 ได้ ${a.v}`); fx.snd = 'dice'; fx.tool = `เต๋าออก ${a.v}`; fx.dice = a.v; break; }
      case 'coin': { addLog(st, a.by, `โยนเหรียญได้ "${a.v}"`); fx.snd = 'dice'; fx.tool = `เหรียญออก ${a.v}`; fx.coin = a.v; break; }
      case 'chat': { addLog(st, a.by, `แชท: ${a.text}`); break; }
    }

    // React response window: ถ้ามีการ์ดสวนค้างรอเลือกเป้า และ prompt ทั้งหมด resolve ครบแล้ว → สรุปผล
    if (st.reactCleanup && (st.prompts || []).length === 0) finishReactCleanup(st, fx);

    // แผนการแกงส้มฯ: โฮสต์ POWER 0 → ทำลาย
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || !m.attachedTo) continue;
      const e = EFFECTS[m.code];
      if (!e || !e.destroyHostIfPower0) continue;
      const host = m.attachedTo;
      if (st.inst[host] && (zoneOf(st, host) || '').endsWith('.avatar') && effPower(st, host) <= 0) {
        addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ${nameOf(st, host)} POWER 0 — ทำลาย`);
        destroyCard(st, fx, host);
      }
    }

    delete fx._rng;
    return fx;
  }

  return { buildInitialState, applyAction, zoneOf, ownerOf, zLabel, effPower, powerBreakdown, effCost, loadEffects, mergeEffects, keywordsOf, promptTargetOk, promptCandidates, counterOptions, avatarCap, syncHeimdall, effectOf: (code) => resolveEffect(code) || EFFECTS[code] || null, hasKw };
});
