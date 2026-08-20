/* BoTEngine v3 — เอนจินสถานะโต๊ะ Battle of Talingchan (ใช้ร่วม client/server)
   เอฟเฟกต์อ่านจาก effects-*.json ผ่าน loadEffects([json,...]) — ต้องโหลดชุดเดียวกันทั้งสองฝั่ง
   ความสุ่มภายใน action (สับจาก effect) ใช้ seed ที่ติดมากับ action (a.seed) → deterministic
   trigger ที่รองรับ: summoned · activated · static · declareAttack · anyDeclareAttack ·
     enemyDeclareAttack (React) · ownAvatarFights (React) · ownAvatarLeftField (React) · avatarWouldBeDestroyed (React) · avatarSummoned (React) · lifeRevealedByAttack · destroyed ·
     milled (ธรณีสูบ) · sentToHell · ownTurnEnd · turnStart · battlePhaseStart · selfDamaged · enemyActivateAbility · chooseMode ·
     afterAttackCombat · battleDestroy · ownPlayMagic
   op: modifyPower(choose/self/all/equippedAvatar, amountPer, halveFloor) · draw · mill · scout · deckPick ·
     hellPick · darkPick · chooseDestroy · destroyTarget · destroyAttacker · sendAttackerToHell · destroyAllEnemyAvatars ·
     preventDestroy ·
     sacrifice(cost) · discard(cost) · exileHand(cost) · counterSelf · untapHost · hostNoUntapExceptSelf · returnSelfToDeck ·
     revealOwnLife · unrevealOwnLife · revealAndActivateOwnLife · revealOppLifeTop ·
     exileAttachedThenAttachFromDark
   amountPer: ownHellNameIncludesPerN (+ onlyOwnBattlePhase) · ownHellPerN · allRevealedLife · … */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BoTEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const PER_PLAYER_ZONES = ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'];
  const Z_LABEL = { avatar: 'Avatar Zone', magic: 'Magic Zone', construct: 'Construct Zone', hell: 'นรก', dark: 'มิติมืด', hand: 'มือ', deck: 'เด็ค', life: 'LIFE' };
  const HAND_MIN = 3;

  let EFFECTS = {};
  let EFFECTS_BY_NAME = {};
  /* วันจำหน่ายชุด (ms) — reprint ชื่อเดียวกันใช้ชุดที่จำหน่ายทีหลังเป็นหลัก (data/set-releases.json) */
  let SET_RELEASE_TS = Object.create(null);
  /* ค่าเริ่มต้น — sync กับ data/set-releases.json (Node/เทสต์ไม่ต้อง fetch) */
  (function seedSetReleases() {
    const sets = {
      PRE0: '2023-12-01', PRMO: '2024-01-10',
      SD01: '2024-01-19', BT01: '2024-01-19', SD02: '2024-03-15', BT02: '2024-04-19',
      SD03: '2024-05-17', BT03: '2024-06-21', SD04: '2024-07-19', BT04: '2024-08-16',
      SD05: '2024-09-20', BT05: '2024-10-18', SD06: '2024-11-15', BT06: '2024-12-20',
      SD07: '2025-01-17', BT07: '2025-02-21', CC01: '2025-03-14', BT08: '2025-04-18',
      SL01: '2025-05-16', BT09: '2025-06-20', CC02: '2025-07-18', BT10: '2025-08-15',
      ODY1: '2025-09-19', FPRO: '2025-10-17', KD00: '2025-11-14', SL02: '2026-02-13',
      KD01: '2026-03-13', KD02: '2026-03-13', KD03: '2026-03-13', KD04: '2026-03-13',
      SD08: '2026-06-12', BT11: '2026-08-14'
    };
    for (const k in sets) {
      const t = Date.parse(sets[k]);
      if (!isNaN(t)) SET_RELEASE_TS[k] = t;
    }
  })();
  function seriesOfCode(code) {
    const m = String(code || '').match(/^([A-Z]+)(\d*)/);
    return m ? (m[1] + (m[2] || '')) : '';
  }
  function setReleaseTs(e) {
    const s = seriesOfCode(e && e.code);
    if (s && SET_RELEASE_TS[s] != null) return SET_RELEASE_TS[s];
    // ไม่มีในตาราง — ประมาณจากเลขชุด (น้อยกว่าชุดที่มีวันจริงเสมอ)
    const n = parseInt((s.match(/(\d+)/) || [])[1], 10);
    return isFinite(n) ? n : 0;
  }
  function loadSetReleases(json) {
    const sets = (json && json.sets) || json || {};
    for (const k in sets) {
      const t = Date.parse(sets[k]);
      if (!isNaN(t)) SET_RELEASE_TS[k] = t;
    }
    rebuildNameIndex();
  }
  /* คะแนนความสมบูรณ์ — กัน stub ว่างจาก cards.json แย่งนิยามจริง */
  const META_RICH_KEYS = [
    'noPaidSummon', 'noHandSummon', 'milledOptional', 'millBonusExtra', 'millBonusExceptSelf',
    'halvePrintedInsteadDestroy', 'forceAllAvatarSymbol', 'nameAliases', 'sacrificeSummon',
    'freeSummonIf', 'uniqueOnField', 'exactGemPay', 'allColors', 'blockLifeUnreveal',
    'grantKeywordAura', 'grantKeywordIfAllyNameIncludes', 'grantKeywordIfLandNameIncludes',
    'ignoreNegativePower', 'auraPower', 'auraNameIncludes',
    'immuneOppMagicTarget', 'millInsteadDestroy', 'lifeBothModes', 'controlImmune',
    'addToHandWhenScoutedByNameIncludes', 'addToHandWhenMilledOrScoutedByNameIncludes',
    'extraSymbols', 'allSymbols', 'extraColors', 'destroyHostIfPower0', 'powerAsGemForSymbol',
    'gemAsCostForNameIncludes', 'gemAsCostValue', 'gemAsCostColor', 'costOnlyForSymbol', 'revealOppDeckTopIfOwnNameIncludes', 'cannotBeAttackTargetIf',
    'cannotBeAttackTargetIfOwnSymbolOther', 'cannotBeAttackTargetIfOwnNameIncludes', 'onlyAttackableAllyNameIncludes', 'cannotAttack', 'unityOnlyNameIncludes', 'hostSymbolReplace', 'reattachOnHostDestroy', 'reactAnyWindow',
    'costZeroIfDistinctOwnNameIncludes', 'costZeroIfOwnSymbol', 'abilitiesFromMagicZone',
    'blockAllLandPlay', 'blockDeckSummon', 'destroyAfterGlobalEndPhases',
    'protectReplace', 'protectReplaceIfHostNameIncludes', 'protectReplaceForNameIncludes',
    'hostBlockHumanShield', 'powerOnHumanShield', 'combatSurvivePowerMinus', 'destroyPowerZero',
    'uniqueAttachedNames', 'attachOnly', 'hostAttachNameIncludes', 'hostBlockReactUntilCombatEnd', 'suppressVictimDestroyed',
    'protectAllyNameIncludes', 'attackLimitPerTurn', 'hostCannotAttack', 'hostMustAttack', 'instantWinIf', 'stayOnMagic',
    'oncePerTurnCard', 'ignoreReactOncePerTurnLimit', 'stackPowerOnReattach', 'destroyHostOnLeave',
    'reattachEnemyIfNoOwn', 'noHellSummon', 'replaceFirstDrawWithSelf', 'bounceHostOnLeave',
    'combatImmuneVsLowerCost', 'attackIf', 'enemyCostAura', 'setPowerIfAllyNameIncludes', 'setPowerTo',
    'controlImmuneExcept', 'scoutBonusOwnKapom', 'scoutBonusConstruct', 'hostCostDelta',
    'hostPowerIfEffCostMin', 'destroyAnyOnSummonedByAvatarNameIncludes',
    'destroyAnyOnSummonedByAvatarSymbol', 'destroyEnemyAnyOnSummonedByAvatarNameIncludes',
    'drawOnSummonedByAvatarNameIncludes'
  ];
  function effectRichness(e) {
    if (!e) return -1;
    let n = (e.abilities || []).length * 10;
    if (e.keywords && e.keywords.length) n += e.keywords.length;
    for (let i = 0; i < META_RICH_KEYS.length; i++) {
      const v = e[META_RICH_KEYS[i]];
      if (v == null) continue;
      if (Array.isArray(v) && !v.length) continue;
      if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) continue;
      n += 2;
    }
    return n;
  }
  /* รีปริ้น: ใช้ชุดที่จำหน่ายทีหลังเป็นหลัก · stub ว่างไม่ทับนิยามจริง */
  function effectBetter(next, cur) {
    if (!cur) return true;
    const rn = effectRichness(next), rc = effectRichness(cur);
    if (rn > 0 && rc <= 0) return true;
    if (rn <= 0 && rc > 0) return false;
    const dn = setReleaseTs(next), dc = setReleaseTs(cur);
    if (dn !== dc) return dn > dc;
    if (rn !== rc) return rn > rc;
    return String(next.code || '') > String(cur.code || '');
  }
  function rebuildNameIndex() {
    EFFECTS_BY_NAME = {};
    for (const code in EFFECTS) {
      const e = EFFECTS[code];
      if (!e || !e.name) continue;
      const cur = EFFECTS_BY_NAME[e.name];
      if (effectBetter(e, cur)) EFFECTS_BY_NAME[e.name] = e;
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
      if (c.name) e.name = e.name || c.name;
    });
    rebuildNameIndex();
  }
  /* ดึงธง meta จาก reprint ชื่อเดียวกัน (เช่น protectReplace มีแค่ SD04 แต่ reprint CC01 เป็นหลัก) */
  const INHERIT_META_KEYS = [
    'protectReplace', 'protectReplaceIfHostNameIncludes', 'protectReplaceForNameIncludes',
    'nameAliases', 'uniqueAttachedNames',     'reattachOnHostDestroy', 'hostBlockHumanShield',
    'powerOnHumanShield', 'combatSurvivePowerMinus', 'destroyPowerZero', 'destroyHostIfPower0',
    'overdoseIfOwnFaceUpLifeMin', 'overdoseSuppressEnemyKeywords', 'overdoseLockOwnAbilities',
    'attachOnly', 'hostAttachNameIncludes', 'hostBlockReactUntilCombatEnd', 'suppressVictimDestroyed', 'stackPowerOnReattach',
    'destroyHostOnLeave', 'reattachEnemyIfNoOwn', 'noHellSummon',
    'replaceFirstDrawWithSelf', 'bounceHostOnLeave',
    'combatImmuneVsLowerCost', 'attackIf', 'controlImmuneExcept', 'scoutBonusOwnKapom',
    'scoutBonusConstruct', 'hostCostDelta', 'hostPowerIfEffCostMin',
    'destroyAnyOnSummonedByAvatarNameIncludes', 'destroyAnyOnSummonedByAvatarSymbol',
    'extraColors', 'onlyAttackableAllyNameIncludes', 'cannotAttack', 'unityOnlyNameIncludes'
  ];
  function inheritMetaFromNamePeers(chosen, nm) {
    if (!chosen || !nm) return chosen;
    let out = null;
    for (const code in EFFECTS) {
      const peer = EFFECTS[code];
      if (!peer || peer === chosen || peer.name !== nm) continue;
      for (let i = 0; i < INHERIT_META_KEYS.length; i++) {
        const k = INHERIT_META_KEYS[i];
        if (chosen[k] != null) continue;
        if (peer[k] == null) continue;
        if (!out) out = Object.assign({}, chosen);
        out[k] = peer[k];
      }
    }
    return out || chosen;
  }
  /* reprint ชื่อเดียวกันคนละรหัส — ใช้ชุดที่จำหน่ายทีหลังสุด (วันจำหน่าย) */
  function resolveEffect(code, nameHint) {
    const e = EFFECTS[code];
    const nm = nameHint || (e && e.name);
    const byName = (nm && EFFECTS_BY_NAME[nm]) || null;
    if (!e && !byName) return null;
    let chosen;
    if (!e) chosen = byName;
    else if (!byName || byName === e) chosen = e;
    else chosen = effectBetter(byName, e) ? byName : e;
    return inheritMetaFromNamePeers(chosen, nm || (chosen && chosen.name));
  }
  function fxCard(c) { return c ? resolveEffect(c.code, c.name) : null; }
  function fxId(st, id) { return st && st.inst ? fxCard(st.inst[id]) : null; }
  const keywordsOf = (code, nameHint) => {
    const e = resolveEffect(code, nameHint);
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

  /* สถานะ [Link] / คู่หู: จับคู่แล้ว หรือมีพันธมิตรที่ระบุบนการ์ดอยู่ใน Avatar Zone ฝั่งเดียวกัน */
  function inLinkStatus(st, k) {
    const c = st.inst[k]; if (!c || c.type !== 'Avatar' || c.faceUp === false) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.avatar')) return false;
    const side = z[0];
    if (c.pairWith && st.inst[c.pairWith]) {
      const pz = zoneOf(st, c.pairWith) || '';
      if (pz.endsWith('.avatar') && pz[0] === side && st.inst[c.pairWith].faceUp !== false) return true;
    }
    const partner = buddyPartnerNameOf(c);
    if (!partner) return false;
    return (st.zones[side + '.avatar'] || []).some(id => {
      if (id === k) return false;
      const o = st.inst[id];
      return !!(o && o.faceUp !== false && buddyNamesMatch(partner, o.name));
    });
  }
  function anyOwnLinked(st, side) {
    return (st.zones[side + '.avatar'] || []).some(id => inLinkStatus(st, id));
  }
  function ownLinkedNameIncludes(st, side, needle) {
    return (st.zones[side + '.avatar'] || []).some(id => {
      const o = st.inst[id];
      return !!(o && nameMatches(o, needle) && inLinkStatus(st, id));
    });
  }
  function ownLinkedNamesAll(st, side, names) {
    const need = Array.isArray(names) ? names : [names];
    return need.every(n => ownLinkedNameIncludes(st, side, n));
  }
  function ownLinkedNameAny(st, side, names) {
    const need = Array.isArray(names) ? names : [names];
    return need.some(n => ownLinkedNameIncludes(st, side, n));
  }
  function cardNameOrEffectIncludes(c, needle) {
    if (!c || !needle) return false;
    if (nameMatches(c, needle)) return true;
    return !!(c.effect && String(c.effect).indexOf(needle) >= 0);
  }
  function protectedFromOppLeave(st, k, chooser) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.avatar')) return false;
    const side = z[0];
    if (!chooser || chooser === side || chooser === 'S') return false;
    return (st.zones['land'] || []).some(id => {
      const L = st.inst[id]; if (!L || L.faceUp === false) return false;
      return abil(st, id, 'static').some(ab => {
        if (!ab.protectOwnFromOppLeave) return false;
        const cond = (ab.trigger && ab.trigger.if) || '';
        if ((cond === 'self.zone==landZone' || cond === 'self.zone==land') && zoneOf(st, id) !== 'land') return false;
        if (ab.requireOwnLinkedNameAny && !ownLinkedNameAny(st, side, ab.requireOwnLinkedNameAny)) return false;
        if (ab.protectNameOrEffectIncludes && !cardNameOrEffectIncludes(c, ab.protectNameOrEffectIncludes)) return false;
        return true;
      });
    });
  }
  function syncEnterLink(st, fx) {
    if (!st || st.over) return;
    const entering = [];
    ['A', 'B'].forEach(side => {
      (st.zones[side + '.avatar'] || []).forEach(k => {
        const c = st.inst[k]; if (!c || c.faceUp === false) return;
        const now = inLinkStatus(st, k);
        if (now && !c._linked) entering.push({ k, side });
        if (now) c._linked = true;
        else delete c._linked;
      });
    });
    entering.forEach(({ k, side }) => {
      const abs = abil(st, k, 'enterLink');
      if (!abs.length) return;
      addLog(st, side, `🤝 ${nameOf(st, k)} เข้าสู่สถานะ Link`);
      abs.forEach(ab => runActions(st, fx, ab.actions || [], {
        src: k, owner: side, rng: (fx && fx._rng) || Math.random
      }));
    });
  }

  function faceUpLifeCount(st, side) {
    return (st.zones[side + '.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
  }
  function inOverdose(st, k) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.avatar')) return false;
    const e = fxCard(c);
    const min = e && e.overdoseIfOwnFaceUpLifeMin;
    if (min == null) return false;
    return faceUpLifeCount(st, z[0]) >= min;
  }
  function printedHasKeyword(st, k, kw) {
    const c = st.inst[k]; if (!c || !kw) return false;
    if (keywordsOf(c.code, c.name).includes(kw)) return true;
    if (c.effect && c.effect.indexOf(kw) >= 0) return true;
    if ((c.grantedKeywords || []).some(g => g.kw === kw)) return true;
    return false;
  }
  function keywordSuppressedByOverdose(st, k, kw) {
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.avatar')) return false;
    const opp = other(z[0]);
    for (const id of (st.zones[opp + '.avatar'] || [])) {
      if (!inOverdose(st, id)) continue;
      const e = fxId(st, id);
      const list = (e && e.overdoseSuppressEnemyKeywords) || [];
      if (list.includes(kw)) return true;
    }
    return false;
  }
  function overdoseLocksAbilities(st, k) {
    const c = st.inst[k]; if (!c) return false;
    if (/Overdose/i.test(c.name || '')) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.avatar')) return false;
    return (st.zones[z[0] + '.avatar'] || []).some(id => {
      const e = fxId(st, id);
      return !!(e && e.overdoseLockOwnAbilities);
    });
  }
  // มี keyword บนตัวการ์ด หรือบน Modification ที่สวมอยู่ (เช่น รั้วของชาติ ให้โล่มนุษย์)
  const hasKw = (st, k, kw) => {
    const c = st.inst[k]; if (!c) return false;
    if (keywordSuppressedByOverdose(st, k, kw)) return false;
    if (keywordsOf(c.code, c.name).includes(kw)) return true;
    // fallback: ข้อความการ์ดขึ้นต้น/มีบรรทัด keyword (เช่น ยักษ์หินแผ่นดินใหญ่ — โล่มนุษย์)
    if (kw && c.effect && new RegExp('(^|\\n)\\s*' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(c.effect)) return true;
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
        if (kw === 'แทงหลัง' && /ได้รับ\s*แทงหลัง|ได้รับความสามารถ\s*แทงหลัง/.test(txt)) return true;
      }
    }
    const e = fxCard(c);
    if (e && e.grantKeywordIfAllyNameIncludes && e.grantKeywordIfAllyNameIncludes.keyword === kw) {
      const z = zoneOf(st, k) || '';
      if (z.endsWith('.avatar')) {
        const side = z[0];
        if ((st.zones[side + '.avatar'] || []).some(id => id !== k && nameMatches(st.inst[id], e.grantKeywordIfAllyNameIncludes.nameIncludes)))
          return true;
      }
    }
    // เงื่อนไข Land (เช่น ภูติผลไม้ + ป่าพงไพร → โล่มนุษย์ / เตะไข่)
    if (e && e.grantKeywordIfLandNameIncludes && e.grantKeywordIfLandNameIncludes.keyword === kw) {
      const z = zoneOf(st, k) || '';
      if (z.endsWith('.avatar')) {
        const g = e.grantKeywordIfLandNameIncludes;
        const landOk = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], g.landNameIncludes || g.nameIncludes || ''));
        if (landOk) {
          if (g.requireEnemyFaceDownLife) {
            const opp = other(z[0]);
            const hasDown = (st.zones[opp + '.life'] || []).some(id => st.inst[id] && !st.inst[id].faceUp);
            if (hasDown) return true;
          } else return true;
        }
      }
    }
    // aura จากพันธมิตรบนสนาม (เช่น ผู้เจริญ นาย ให้สามัคคี) / ศัตรู (ลิโป้ ให้โล่มนุษย์) / Land (ป่าพงไพร)
    {
      const z = zoneOf(st, k) || '';
      if (z.endsWith('.avatar')) {
        const side = z[0];
        const auraOk = (g) => {
          if (!g || g.keyword !== kw) return false;
          if (g.onlyOppTurn && st.active === side) return false;
          if (g.nameIncludes) {
            const needles = Array.isArray(g.nameIncludes) ? g.nameIncludes : [g.nameIncludes];
            if (!needles.some(n => nameMatches(c, n))) return false;
          }
          if (g.symbols && !g.symbols.some(sy => cardSymbols(st, k).includes(sy))) return false;
          return true;
        };
        for (const id of (st.zones[side + '.avatar'] || [])) {
          const ae = fxId(st, id);
          if (!ae || !ae.grantKeywordAura) continue;
          const g = ae.grantKeywordAura;
          if ((g.side === 'own' || !g.side) && auraOk(g)) return true;
        }
        for (const id of (st.zones[side + '.construct'] || [])) {
          const ae = fxId(st, id);
          if (!ae || !ae.grantKeywordAura) continue;
          const g = ae.grantKeywordAura;
          if ((g.side === 'own' || !g.side) && auraOk(g)) return true;
        }
        for (const id of (st.zones[other(side) + '.avatar'] || [])) {
          const ae = fxId(st, id);
          if (!ae || !ae.grantKeywordAura) continue;
          const g = ae.grantKeywordAura;
          if (g.side === 'enemy' && auraOk(g)) return true;
        }
        for (const id of (st.zones['land'] || [])) {
          if (!st.inst[id] || !st.inst[id].faceUp) continue;
          const ae = fxId(st, id);
          if (!ae || !ae.grantKeywordAura) continue;
          const g = ae.grantKeywordAura;
          if (!auraOk(g)) continue;
          if (g.side === 'enemy') {
            const landOwner = st.inst[id].controller;
            if (landOwner && landOwner === side) continue;
          }
          return true;
        }
      }
    }
    return false;
  };
  // สาหัส: มี LIFE และหงายหมด (ตรงกับตัวบ่งชี้ในหน้าเกม)
  const inCritical = (st, side) => { const l = st.zones[side + '.life'] || []; return l.length > 0 && l.every(k => st.inst[k] && st.inst[k].faceUp); };
  // ★ เปิดระบบ effect อัตโนมัติ — ความสามารถที่ verified/auto จะทำงานอัตโนมัติ
  const abilitiesOf = (code, on, nameHint) => {
    const e = resolveEffect(code, nameHint);
    return ((e && e.abilities) || []).filter(ab => ab.trigger && ab.trigger.on === on);
  };
  /* reprint บางใบติดป้าย Normal ผิด (SD05-020 / CC02-061 ชายจากอนาคต, SD06-014 ไปเลยมอนตี้)
     ยึด trigger/ชื่อ — ไม่ยึด subtype ที่พิมพ์ */
  const REACT_TRIGGER_ONS = [
    'enemyPlayMagic', 'enemyPlayReact', 'enemyDeclareAttack', 'ownAvatarFights', 'ownAvatarLeftField',
    'avatarSummoned', 'avatarWouldBeDestroyed', 'enemyActivateAbility'
  ];
  function cardCountsAsReact(c) {
    if (!c || c.type !== 'Magic') return false;
    if ((c.subtype || '') === 'React') return true;
    const name = c.name || '';
    if (/ชายจากอนาคต/.test(name)) return true;
    if (REACT_TRIGGER_ONS.some(on => abilitiesOf(c.code, on, name).length)) return true;
    const e = fxCard(c);
    if (e && e.reactAnyWindow) return true;
    return !!(e && (e.abilities || []).some(ab => ab && (ab.react || ab.keyword === 'React' || ab.countsAsReact)));
  }
  function magicSubtype(c) {
    if (!c) return '';
    if (c.type !== 'Magic') return c.subtype || '';
    if (cardCountsAsReact(c)) return 'React';
    return c.subtype || 'Normal';
  }
  function isLandMagic(c) {
    if (!c || c.type !== 'Magic') return false;
    return (c.subtype || '') === 'Land' || magicSubtype(c) === 'Land';
  }
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
  /* เจ้าของตัวการ์ด (คนที่เด็คใบนี้ออกมา) — ไม่เปลี่ยนตอนยึด/สวมฝั่งตรงข้าม */
  function cardOwnerOf(st, k) {
    const c = st.inst[k];
    if (!c) return null;
    if (c.cardOwner === 'A' || c.cardOwner === 'B') return c.cardOwner;
    if (c.modOwner === 'A' || c.modOwner === 'B') return c.modOwner;
    return null;
  }
  function ensureCardOwner(st, k, fromZ) {
    const c = st.inst[k];
    if (!c || c.cardOwner === 'A' || c.cardOwner === 'B') return;
    const z = fromZ || zoneOf(st, k);
    if (z === 'land') {
      if (c.controller === 'A' || c.controller === 'B') c.cardOwner = c.controller;
      return;
    }
    if (z && (z[0] === 'A' || z[0] === 'B') && z.indexOf('.') >= 0) c.cardOwner = z[0];
  }
  function hellZoneOf(st, k, fallback) {
    const own = cardOwnerOf(st, k);
    if (own && st.zones[own + '.hell']) return own + '.hell';
    return fallback;
  }
  /* สีเจมตอนจ่าย Cost: gemColor บนการ์ด · ว่าง = ใช้สีการ์ด · ไร้สี/ขาว/ใส = wild ลงได้ทุกสี */
  function gemColorOf(c) {
    if (!c) return 'ขาว';
    const raw = c.gemColor || '';
    if (raw === 'ขาว' || raw === 'ใส' || raw === 'ไร้สี') return 'ขาว';
    if (raw) return raw;
    return c.color || 'ขาว';
  }
  function gemPaysFor(gc, avColor) {
    if (Array.isArray(avColor)) {
      if (!avColor.length) return true; // allColors
      return !gc || gc === 'ขาว' || avColor.includes(gc);
    }
    if (!avColor) return true; // อวตารไร้สี / allColors
    return !gc || gc === 'ขาว' || gc === avColor;
  }
  function avatarCostColors(c, e) {
    e = e || fxCard(c);
    if (e && e.allColors) return [];
    const out = [];
    if (c && c.color) out.push(c.color);
    if (e && e.extraColors) e.extraColors.forEach(col => { if (col && !out.includes(col)) out.push(col); });
    return out;
  }
  function landPowerAsGemSymbol(st) {
    let powerAsGemSym = null;
    (st.zones['land'] || []).forEach(lid => {
      const le = fxId(st, lid);
      if (le && le.powerAsGemForSymbol && st.inst[lid] && st.inst[lid].faceUp) powerAsGemSym = le.powerAsGemForSymbol;
    });
    return powerAsGemSym;
  }
  /* GEM ที่ใบ payK จ่ายให้อัญเชิญ summonK ได้จริง (สีตรง / ขาว / POWER ยักษ์) */
  function gemUsableTowardSummon(st, payK, summonK) {
    const pc = st.inst[payK], c = st.inst[summonK];
    if (!pc || !c) return 0;
    const eAll = fxCard(c);
    const avColor = avatarCostColors(c, eAll);
    const powerAsGemSym = landPowerAsGemSymbol(st);
    if (powerAsGemSym && pc.type === 'Avatar' && pc.symbol === powerAsGemSym && c.symbol === powerAsGemSym)
      return +pc.power || 0;
    const peGem = fxCard(pc);
    let g = +pc.gem || 0, gc = gemColorOf(pc);
    if (peGem && peGem.gemAsCostForNameIncludes && nameMatches(c, peGem.gemAsCostForNameIncludes)) {
      g = peGem.gemAsCostValue != null ? peGem.gemAsCostValue : 5;
      gc = peGem.gemAsCostColor || 'ขาว';
    }
    return gemPaysFor(gc, avColor) ? g : 0;
  }
  /* ชุดจ่ายผิดกติกา: ใบที่นับ 0 / มีใบที่ถอดแล้วยังครบ Cost (Cost 3 ห้าม 4+2 แต่ 2+2 ได้) */
  function gemPayDenyMsg(st, payIds, summonK, cost) {
    if (!(cost > 0)) return null;
    const ids = payIds || [];
    if (!ids.length) return null;
    const vals = ids.map(k => gemUsableTowardSummon(st, k, summonK));
    if (vals.some(v => v <= 0))
      return 'ห้ามจ่าย Cost ด้วยการ์ด GEM 0 (หรือใบที่นับ GEM ไม่ได้)';
    const total = vals.reduce((s, v) => s + v, 0);
    if (total < cost) return null;
    if (vals.some(v => total - v >= cost))
      return `จ่าย GEM เกิน: Cost ${cost} มีใบที่ไม่จำเป็น (เช่น Cost 3 จ่าย 2+2 ได้ แต่ห้าม 4+2)`;
    return null;
  }
  function handGemUsableToward(st, owner, summonK, excludeIds) {
    const skip = {};
    (excludeIds || []).forEach(id => { skip[id] = true; });
    return (st.zones[owner + '.hand'] || []).reduce((n, id) => {
      if (skip[id]) return n;
      return n + gemUsableTowardSummon(st, id, summonK);
    }, 0);
  }
  /* สวมใส่การ์ดให้โฮสต์: ให้การ์ดอยู่ใน Magic Zone ฝั่งโฮสต์ (เห็นบนจอ + ลากเส้น)
     — ถ้าอยู่ Magic Zone อยู่แล้วแค่ผูกสาย · ถ้ามาจากเด็ค/นรก/Avatar Zone ให้ย้ายเข้า Magic Zone */
  function equipOnto(st, modK, hostK) {
    const mod = st.inst[modK], host = st.inst[hostK];
    if (!mod || !host) return false;
    ensureCardOwner(st, modK);
    const he = fxCard(host);
    if (he && he.uniqueAttachedNames) {
      for (const id in st.inst) {
        const m = st.inst[id];
        if (!m || m.attachedTo !== hostK || id === modK) continue;
        if ((m.name || '') === (mod.name || '')) return false;
      }
    }
    let hostOwn = ownerOf(st, hostK);
    if (hostOwn !== 'A' && hostOwn !== 'B') {
      // fallback: โฮสต์อยู่นอกโซน (ไม่น่าเกิด) — ใช้เจ้าของการ์ดสวมถ้ามี
      const mz0 = zoneOf(st, modK);
      hostOwn = (mz0 && (mz0[0] === 'A' || mz0[0] === 'B')) ? mz0[0] : null;
      if (!hostOwn) return false;
    }
    if (!mod.modOwner) {
      if (mod.cardOwner === 'A' || mod.cardOwner === 'B') mod.modOwner = mod.cardOwner;
      else {
        const mz0 = zoneOf(st, modK);
        if (mz0 && (mz0[0] === 'A' || mz0[0] === 'B')) mod.modOwner = mz0[0];
        else mod.modOwner = hostOwn;
      }
    }
    if (!mod.cardOwner) mod.cardOwner = mod.modOwner;
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
  /* บันทึกการ์ดที่ขึ้นมือ → UI แอนิเมชันลากเปิดทีละใบ */
  function noteDrawn(fx, player, kOrIds) {
    if (!fx) return;
    const ids = Array.isArray(kOrIds) ? kOrIds : [kOrIds];
    fx.drawnList = fx.drawnList || [];
    ids.forEach(k => {
      if (!k) return;
      fx.drawnList.push({ p: player, k });
      fx.drawn = k;
    });
    if (ids.some(Boolean)) fx.snd = 'draw';
  }

  /* LIFE "บนสุด" = ต้นอาร์เรย์ (index 0) — ตรงกับ UI (ใบบนสุดของกอง) และลำดับตอนโจมตีหงาย */
  function revealOwnLife(st, side, count) {
    const arr = st.zones[side + '.life'] || [];
    let done = 0;
    for (let i = 0; i < arr.length && done < count; i++) {
      if (!st.inst[arr[i]].faceUp) { st.inst[arr[i]].faceUp = true; done++; addLog(st, 'S', `เอฟเฟกต์: หงาย LIFE "${nameOf(st, arr[i])}" ของ ${side}`); }
    }
  }
  function unrevealOwnLife(st, side, count, rng) {
    if (inCritical(st, side)) {
      addLog(st, 'S', `สถานะสาหัส: ฝ่าย ${side} ฮีล LIFE ไม่ได้`);
      return;
    }
    if ((st.zones['land'] || []).some(id => fxId(st, id) && fxId(st, id).blockLifeUnreveal)) {
      addLog(st, 'S', 'โรงบาลรัฐ: LIFE ไม่สามารถคว่ำกลับได้ — ฮีลไม่เกิดผล');
      return;
    }
    const arr = st.zones[side + '.life'] || [];
    const faceUp = [];
    for (let i = 0; i < arr.length; i++) {
      if (st.inst[arr[i]] && st.inst[arr[i]].faceUp) faceUp.push(arr[i]);
    }
    const n = Math.min(count || 1, faceUp.length);
    if (!n) {
      addLog(st, 'S', `เอฟเฟกต์: ไม่มี LIFE ที่หงายให้ฮีล ของ ${side}`);
      return;
    }
    const r = typeof rng === 'function' ? rng : Math.random;
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(r() * (faceUp.length - i));
      const tmp = faceUp[i]; faceUp[i] = faceUp[j]; faceUp[j] = tmp;
      st.inst[faceUp[i]].faceUp = false;
      addLog(st, 'S', `เอฟเฟกต์: สุ่มคว่ำ LIFE กลับ 1 ใบของ ${side}`);
    }
  }

  function notePowerBuff(st, k, amt) {
    if (!st.inst[k] || !(amt > 0)) return;
    st.inst[k].powerBuffCount = (st.inst[k].powerBuffCount || 0) + 1;
  }

  function controlImmuneBlock(st, targetK, srcK) {
    const check = (e, label) => {
      if (!e || !e.controlImmune) return null;
      if (e.controlImmuneExcept) {
        const src = st.inst[srcK];
        if (src && nameMatches(src, e.controlImmuneExcept)) return null;
        return `"${label}" ไม่ถูกเปลี่ยนการควบคุม (ยกเว้น ${e.controlImmuneExcept})`;
      }
      return `"${label}" ไม่ถูกเปลี่ยนการควบคุม`;
    };
    const selfHit = check(fxId(st, targetK), nameOf(st, targetK));
    if (selfHit) return selfHit;
    // ปลอกคอซื่อสัตย์ ฯลฯ: ใบสวมให้โฮสต์กันเปลี่ยนการควบคุม
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== targetK) continue;
      const hit = check(fxCard(m), nameOf(st, targetK));
      if (hit) return hit;
    }
    return null;
  }

  function fireSentToHell(st, fx, k, side) {
    abilitiesOf((st.inst[k] || {}).code, 'sentToHell').forEach(ab => (ab.actions || []).forEach(ac => {
      if (ac.op === 'revealOwnLife') revealOwnLife(st, side, ac.count || 1);
    }));
  }

  /* จั่วจากเด็คขึ้นมือ — หงายเสมอ (กันบั๊กมัลลิแกน/ฮามดัลที่เคยคว่ำใบในเด็ค) */
  /* ใบที่กำลังสอดแนม — ล็อกไว้บนเด็ค ห้ามจั่ว/ธรณีสูบแย่ง (กัน UI เหลือ 4 ตอน LIFE จั่ว+สอดแนมพร้อมกัน) */
  function lockScoutIds(st, ids) {
    (ids || []).forEach(id => { if (st.inst[id]) st.inst[id]._scoutLock = true; });
  }
  function unlockScoutIds(st, ids) {
    (ids || []).forEach(id => { if (st.inst[id]) delete st.inst[id]._scoutLock; });
  }
  function popDeckTopUnlocked(st, player) {
    const d = st.zones[player + '.deck'] || [];
    for (let i = d.length - 1; i >= 0; i--) {
      const k = d[i];
      if (st.inst[k] && st.inst[k]._scoutLock) continue;
      d.splice(i, 1);
      return k;
    }
    return null;
  }
  /* ★ เด็คว่าง (เห็นพื้นกอง) = แพ้ทันที — ไม่รอจนจั่วไม่ได้ */
  function checkDeckEmptyLoss(st, fx, player) {
    if (!st || st.over || (player !== 'A' && player !== 'B')) return false;
    if ((st.zones[player + '.deck'] || []).length) return false;
    const win = other(player);
    st.over = { winner: win };
    if (fx) fx.over = win;
    addLog(st, 'S', `💀 เด็ค ${player} หมด (เห็นพื้น) — ${win} ชนะ! จบเกม`);
    return true;
  }
  function checkAllDecksEmptyLoss(st, fx) {
    if (!st || st.over) return false;
    if (checkDeckEmptyLoss(st, fx, 'A')) return true;
    if (checkDeckEmptyLoss(st, fx, 'B')) return true;
    return false;
  }
  function takeFromDeckToHand(st, player, count, fx) {
    const got = [];
    for (let i = 0; i < (count || 0); i++) {
      const k = popDeckTopUnlocked(st, player);
      if (!k) break;
      st.zones[player + '.hand'].push(k);
      if (st.inst[k]) {
        st.inst[k].faceUp = true;
        delete st.inst[k]._heimdallReveal;
        delete st.inst[k]._scoutLock;
      }
      got.push(k);
    }
    if (fx && got.length) noteDrawn(fx, player, got);
    checkDeckEmptyLoss(st, fx, player);
    return got;
  }

  function doMove(st, k, to, pos, fx) {
    const from = zoneOf(st, k); if (!from || !st.zones[to]) return;
    if (to === 'land' && from !== 'land' && !isLandMagic(st.inst[k])) return;
    ensureCardOwner(st, k, from);
    if (typeof to === 'string' && to.endsWith('.hell')) {
      const hz = hellZoneOf(st, k, to);
      if (hz && st.zones[hz]) to = hz;
    }
    const leaveHost = (from.endsWith('.magic') && !to.endsWith('.magic') && st.inst[k] && st.inst[k].attachedTo) || null;
    const leaveHostFx = leaveHost && fxCard(st.inst[k]);
    st.zones[from] = st.zones[from].filter(x => x !== k);
    if (pos === 'bottom') st.zones[to].unshift(k); else st.zones[to].push(k);
    if (from.endsWith('.avatar') && !String(to).endsWith('.avatar') && st.inst[k])
      delete st.inst[k]._linked;
    if (/\.(hand|hell|dark|deck)$/.test(to)) {
      st.inst[k].tapped = false; st.inst[k].counters = 0;
      st.inst[k].attachedTo = null;
      delete st.inst[k].costDelta; delete st.inst[k].powerDelta; delete st.inst[k].powerDeltaFrom;
      delete st.inst[k].cannotAttack; delete st.inst[k].curse;
      delete st.inst[k].grantedKeywords; delete st.inst[k].draculaRevive;
      delete st.inst[k].cannotChangeStateUntilEOT;
      delete st.inst[k].equipHostChanges;
      if (/\.(hand|deck)$/.test(to)) delete st.inst[k].granted;
      if (st.buffs) st.buffs = st.buffs.filter(b => b.k !== k);
      if (leaveHost && leaveHostFx && leaveHostFx.destroyHostOnLeave && !st._destroyHostOnLeave) {
        if (st.inst[leaveHost] && (zoneOf(st, leaveHost) || '').endsWith('.avatar')) {
          st._destroyHostOnLeave = true;
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: ออกจากสนาม — ส่ง ${nameOf(st, leaveHost)} ลงนรก`);
          destroyCard(st, fx || {}, leaveHost);
          delete st._destroyHostOnLeave;
        }
      }
      if (leaveHost && leaveHostFx && leaveHostFx.bounceHostOnLeave && !st._bounceHostOnLeave) {
        if (st.inst[leaveHost] && (zoneOf(st, leaveHost) || '').endsWith('.avatar')) {
          st._bounceHostOnLeave = true;
          const orig = st.inst[leaveHost].originalOwner || ownerOf(st, leaveHost);
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: ถูกทำลาย — ส่ง ${nameOf(st, leaveHost)} กลับขึ้นมือเจ้าของ (${orig})`);
          doMove(st, leaveHost, orig + '.hand', null, fx || {});
          if (st.inst[leaveHost]) delete st.inst[leaveHost].originalOwner;
          delete st._bounceHostOnLeave;
        }
      }
      // ใบสวมใส่: ตัดสาย + ย้ายลงนรกเจ้าของโฮสต์จริงๆ (ห้ามค้างใน Magic Zone)
      const hostOwner = (from[0] === 'A' || from[0] === 'B') ? from[0] : 'A';
      Object.keys(st.inst).forEach(id => {
        const m = st.inst[id];
        if (!m || m.attachedTo !== k) return;
        const me = fxCard(m);
        // วูตาตู / หนึ่งเดียวเพื่อทุกอย่าง: โฮสต์ถูกทำลาย → ย้ายสวมใส่ใบอื่น (ถาม) แทนการตกนรก
        if (me && me.reattachOnHostDestroy && (to.endsWith('.hell') || to.endsWith('.dark') || to.endsWith('.deck') || to.endsWith('.hand'))) {
          m.attachedTo = null;
          if (!m.modOwner) {
            const mz = zoneOf(st, id);
            if (mz && (mz[0] === 'A' || mz[0] === 'B')) m.modOwner = mz[0];
          }
          const chooser = (m.modOwner === 'A' || m.modOwner === 'B') ? m.modOwner : hostOwner;
          let hosts = (st.zones[chooser + '.avatar'] || []).filter(h => h !== k);
          let enemyFallback = false;
          if (!hosts.length && me.reattachEnemyIfNoOwn) {
            hosts = (st.zones[other(chooser) + '.avatar'] || []).filter(h => h !== k);
            enemyFallback = !!hosts.length;
          }
          if (hosts.length) {
            const p = {
              kind: 'pick', from: 'ids', ids: hosts, src: id, chooser,
              dest: 'attachTo', attachMod: id, optional: false, allowAnyZone: true,
              stackOnReattach: !!me.stackPowerOnReattach
            };
            st.prompts = st.prompts || [];
            st.prompts.push(p);
            addLog(st, chooser, enemyFallback
              ? `${m.name}: สนามเราไม่มี Avatar — เลือก Avatar ฝ่ายตรงข้ามเพื่อสวมใส่`
              : `${m.name}: โฮสต์ถูกทำลาย — เลือก Avatar ใหม่เพื่อสวมใส่`);
            return;
          }
        }
        m.attachedTo = null;
        ensureCardOwner(st, id);
        const hz = hellZoneOf(st, id, (cardOwnerOf(st, id) || hostOwner) + '.hell');
        if (zoneOf(st, id) && hz && st.zones[hz] && zoneOf(st, id) !== hz) {
          addLog(st, 'S', `${m.name} (สวมใส่) ตกนรกเจ้าของ`);
          doMove(st, id, hz, null, fx);
        } else {
          const modZ = zoneOf(st, id);
          if (modZ) st.zones[modZ] = st.zones[modZ].filter(x => x !== id);
          const hellOwner = (hz && hz[0]) || hostOwner;
          const modHell = hellOwner + '.hell';
          if (!st.zones[modHell].includes(id)) st.zones[modHell].push(id);
          addLog(st, 'S', `${m.name} (สวมใส่) ตกนรกเจ้าของ`);
          fireSentToHell(st, fx || {}, id, hellOwner);
        }
      });
    }
    // รัททาทุย นินจา ฯลฯ: Avatar ฝ่ายเราออกจากสนาม → เสนอสั่งใช้จากมือ
    if (from.endsWith('.avatar') && !to.endsWith('.avatar') && (from[0] === 'A' || from[0] === 'B')) {
      try {
        offerOwnAvatarLeftField(st, fx || {}, k, from[0], st.inst[k]);
      } catch (e) { /* ignore if helper not ready mid-patch */ }
      if (to.endsWith('.dark') && st.inst[k]) {
        const ownerEx = from[0];
        abilitiesOf(st.inst[k].code, 'exiledFromAvatar', st.inst[k].name).forEach(ab => {
          runActions(st, fx || {}, ab.actions || [], { src: k, owner: ownerEx, rng: (fx && fx._rng) || Math.random });
        });
      }
    }
    // หงายเมื่อเข้าโซนที่ต้องเห็นหน้า (มือ/สนาม/นรก/มืด) — เด็ค+LIFE คงสถานะคว่ำได้
    if (to.endsWith('.hand') || to.endsWith('.avatar') || to.endsWith('.magic')
      || to.endsWith('.construct') || to === 'land' || to.endsWith('.hell') || to.endsWith('.dark')) {
      st.inst[k].faceUp = true;
      delete st.inst[k]._heimdallReveal;
      delete st.inst[k]._guessReveal;
    }
    if (to.endsWith('.magic') && (!from || !from.endsWith('.magic')))
      st.inst[k].magicEnteredTurnSeq = st.turnSeq || 0;
    // กลับเด็ค / LIFE = คว่ำเสมอ (กันท็อปเด็คโชว์ COST จาก faceUp ค้าง)
    if (to.endsWith('.deck') || to.endsWith('.life')) {
      st.inst[k].faceUp = false;
      delete st.inst[k]._heimdallReveal;
      delete st.inst[k]._guessReveal;
      delete st.inst[k].revealed;
    }
    if (from.endsWith('.hand')) delete st.inst[k].revealed; // ออกจากมือแล้ว = เลิกสถานะ "เปิดให้ดู"
    if (to.endsWith('.hell') && from[1] === '.'[0]) { /* noop */ }
    if (to.endsWith('.hell')) fireSentToHell(st, fx || {}, k, (cardOwnerOf(st, k) || (from === 'land' ? to[0] : from[0])));
    // Token: ออกจาก Avatar Zone → ย้ายไป Zone ปลายทางก่อน (trigger ทำงาน) แล้วนำออกจากเกม (ไม่ใช่นรก/มิติมืด)
    if (st.inst[k] && st.inst[k].isToken && !to.endsWith('.avatar')) {
      st.zones[to] = st.zones[to].filter(x => x !== k);
      addLog(st, 'S', `Token "${st.inst[k].name}" ออกจาก Avatar Zone → นำออกจากเกม`);
      delete st.inst[k];
    }
    // ใบออกจากเด็คแล้วกองว่าง = แพ้ทันที (เห็นพื้น)
    if (from.endsWith('.deck') && (from[0] === 'A' || from[0] === 'B'))
      checkDeckEmptyLoss(st, fx || {}, from[0]);
    if ((to === 'land' || (typeof to === 'string' && to.endsWith('.magic'))) && st.inst[k])
      armGlobalEndPhaseTimer(st, k);
  }

  /* สร้าง Token (ตัวแทน Avatar) — อยู่บน Avatar Zone · ออกจากโซนเมื่อไหร่ = นำออกจากเกม */
  function mkToken(st, owner, spec) {
    const id = 'tk' + (++st._tokSeq);
    st.inst[id] = {
      id, code: spec.code || 'TOKEN', name: spec.name || 'Token', type: 'Avatar', subtype: '',
      symbol: spec.symbol || '', color: spec.color || '', gemColor: '', cost: 0, gem: 0,
      power: spec.power || 0, effect: spec.effect || 'Token', img: '', faceUp: true, tapped: false,
      counters: 0, attachedTo: null, isToken: true,
      cardOwner: (owner === 'A' || owner === 'B') ? owner : undefined,
    };
    return id;
  }

  /* ทำลายการ์ด (ลงนรกเจ้าของ) + trigger คำสั่งเสีย
     opts.ignoreProtect = true → ข้ามกันทำลาย (เช่น ฉุบสั่งตาย)
     ประกันชั้นต่ำ: ทำลายใบสวมแทนโฮสต์
     protectUntilEndTurn: กันทำลายจนจบเทิร์น (วันชัย) */
  function isNameLockedThisTurn(st, owner, name) {
    const L = st.lockSummonAndAbility;
    if (!L || L.owner !== owner || !name) return false;
    return (L.names || []).some(n => nameMatches({ name }, n));
  }
  function addLockSummonAndAbility(st, owner, name) {
    if (!owner || !name) return;
    st.lockSummonAndAbility = st.lockSummonAndAbility || { owner, names: [] };
    if (st.lockSummonAndAbility.owner !== owner) st.lockSummonAndAbility = { owner, names: [] };
    if (!st.lockSummonAndAbility.names.includes(name)) st.lockSummonAndAbility.names.push(name);
    addLog(st, owner, `โรงบาล: "${name}" (และชื่อเดียวกัน) อัญเชิญ/ใช้ความสามารถไม่ได้จนจบเทิร์น`);
  }
  function cannotChangeState(st, k) {
    const c = st.inst[k];
    return !!(c && c.cannotChangeStateUntilEOT);
  }
  function abilitiesNullified(st, k) {
    const c = st.inst[k];
    if (c && c.nullifyUntilEOT) return true;
    if (c && isNameLockedThisTurn(st, ownerOf(st, k), c.name)) return true;
    if (overdoseLocksAbilities(st, k)) return true;
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== k) continue;
      const e = fxCard(m);
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
  /* ทรายดูด: Avatar POWER ≤ 0 ถูกทำลายทันทีที่แลนหงายอยู่ */
  function sandTrapActive(st) {
    return (st.zones['land'] || []).some(id => {
      const c = st.inst[id]; if (!c || !c.faceUp) return false;
      const e = fxId(st, id);
      return !!(e && e.destroyPowerZero) || nameMatches(c, 'ทรายดูด');
    });
  }
  function sweepDestroyPowerZero(st, fx) {
    if (!sandTrapActive(st)) return;
    ['A', 'B'].forEach(side => {
      (st.zones[side + '.avatar'] || []).slice().forEach(id => {
        if (!st.inst[id]) return;
        if (effPower(st, id) <= 0) {
          addLog(st, 'S', `ทรายดูด: ${nameOf(st, id)} (P0) ถูกทำลาย`);
          destroyCard(st, fx, id);
        }
      });
    });
  }
  function hellSummonBlocked(st) {
    for (const side of ['A', 'B']) {
      for (const id of (st.zones[side + '.avatar'] || [])) {
        const e = fxId(st, id);
        if (e && e.blockHellSummon && st.inst[id] && st.inst[id].faceUp) return st.inst[id].name;
      }
    }
    return null;
  }
  function deckSummonBlocked(st) {
    for (const side of ['A', 'B']) {
      for (const id of (st.zones[side + '.avatar'] || [])) {
        const e = fxId(st, id);
        if (e && e.blockDeckSummon && st.inst[id] && st.inst[id].faceUp) return st.inst[id].name;
      }
    }
    return null;
  }
  /* ไพรมอล ฯลฯ: จะออกจาก Avatar Zone → เลือกเนรเทศจากนรกเพื่อรอด (เทิร์นละครั้ง)
     resume = { type:'destroy', opts } | { type:'move', to, pos, who }
     คืน true ถ้าค้างถาม (ยังไม่ออกสนาม) */
  function offerOwnAvatarLeftField(st, fx, leftK, side, leftCard) {
    if (!leftCard || st._suppressLeftField) return;
    const nm = leftCard.name || '';
    const isNinja = nameMatches(leftCard, 'นินจา') || nm.includes('นินจา');
    const syms = (() => { try { return cardSymbols(st, leftK); } catch (e) { return leftCard.symbol ? [leftCard.symbol] : []; } })();
    const isRatt = syms.includes('รัททาทุย') || nm.includes('รัททาทุย');
    const options = (st.zones[side + '.hand'] || []).filter(id => {
      if (id === leftK) return false;
      const c = st.inst[id]; if (!c) return false;
      if (!abilitiesOf(c.code, 'ownAvatarLeftField', c.name).length) return false;
      if (!isNinja && !isRatt && c.type !== 'Magic') return false;
      return true;
    });
    if (!options.length) return;
    if ((st.prompts || []).some(p => p.kind === 'react' && p.avatarHandAbility && p.chooser === side)) return;
    const rab = abilitiesOf(st.inst[options[0]].code, 'ownAvatarLeftField', st.inst[options[0]].name)[0];
    st.prompts = st.prompts || [];
    st._ownAvatarLeftFieldWindow = true;
    st.prompts.push({
      kind: 'react', mode: 'runActions', src: null, options, chooser: side, target: leftK,
      actions: (rab && rab.actions) || [], reactTrigger: 'ownAvatarLeftField',
      avatarHandAbility: options.some(id => st.inst[id] && st.inst[id].type !== 'Magic'),
      label: `${nm} ออกจากสนาม`, optional: true
    });
    addLog(st, side, `สั่งใช้พร้อม (${options.length} ใบ): ${nm} ออกจากสนาม — เลือกใบหรือไม่ใช้`);
  }
  /* ท้าวเวสสุวรรณ ฯลฯ: Avatar ในมือ สั่งใช้เมื่อยักษ์ฝ่ายเราถูกการ์ดศัตรูทำลาย (นับ extraSymbols) */
  function offerHandOnOwnAvatarDestroyedByOpp(st, fx, side, destroyedName, destroyedSyms, destroyedSymbol) {
    const options = (st.zones[side + '.hand'] || []).filter(id => {
      const c = st.inst[id]; if (!c) return false;
      if (c.type === 'Magic') return false;
      return abilitiesOf(c.code, 'ownAvatarDestroyedByOpp', c.name).some(ab => {
        const cond = (ab.trigger && ab.trigger.if) || '';
        const mSym = cond.match(/^symbol:(.+)$/);
        if (mSym && !(destroyedSyms || []).includes(mSym[1]) && destroyedSymbol !== mSym[1]) return false;
        return true;
      });
    });
    if (!options.length) return;
    if ((st.prompts || []).some(p => p.kind === 'react' && p.avatarHandAbility && p.reactTrigger === 'ownAvatarDestroyedByOpp' && p.chooser === side))
      return;
    const rab = abilitiesOf(st.inst[options[0]].code, 'ownAvatarDestroyedByOpp', st.inst[options[0]].name)[0];
    st.prompts = st.prompts || [];
    st.prompts.push({
      kind: 'react', mode: 'runActions', src: null, options, chooser: side,
      actions: (rab && rab.actions) || [], reactTrigger: 'ownAvatarDestroyedByOpp',
      avatarHandAbility: true, optional: true,
      label: `${destroyedName} ถูกทำลายโดยฝ่ายตรงข้าม`
    });
    addLog(st, side, `สั่งใช้พร้อม (${options.length} ใบ): ${destroyedName} ถูกทำลายโดยฝ่ายตรงข้าม — เลือกใบหรือไม่ใช้`);
  }
  function offerPreventLeave(st, fx, k, resume) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k); if (!z || !z.endsWith('.avatar')) return false;
    const ePrev = fxCard(c);
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
    if (pend.type === 'bounceTappedDeckDraw') {
      const side = pend.side;
      const rng = (fx && fx._rng) || (() => 0.5);
      doMove(st, pend.k, side + '.deck', null, fx);
      seededShuffle(st.zones[side + '.deck'], rng);
      syncHeimdall(st);
      takeFromDeckToHand(st, side, 1, fx);
      addLog(st, pend.chooser || side, `เอฟเฟกต์ ${nameOf(st, pend.src)}: ${nameOf(st, pend.k)} กลับเด็ค ${side} สับ แล้ว ${side} จั่ว 1`);
      fx.snd = 'draw';
      return;
    }
    if (pend.type === 'bothReturn') {
      doMove(st, pend.k, pend.chooser + '.deck', 'bottom', fx);
      addLog(st, pend.chooser, `เอฟเฟกต์ ${nameOf(st, pend.src)}: ${nameOf(st, pend.k)} กลับใต้เด็ค`);
      const opp = other(pend.chooser);
      const hp = { kind: 'pick', from: 'ownAvatars', src: pend.src, chooser: opp, dest: 'deckBottom', optional: false, srcToHell: !!pend.srcToHell };
      if (promptCandidates(st, hp).length) {
        st.prompts.unshift(hp);
        addLog(st, opp, `เลือก Avatar กลับใต้เด็ค`);
      } else if (pend.srcToHell && zoneOf(st, pend.src)) {
        doMove(st, pend.src, pend.chooser + '.hell', null, fx);
      }
      fx.snd = 'place';
      return;
    }
    destroyCard(st, fx, pend.k, (pend.opts && Object.assign({}, pend.opts, { ignorePreventLeave: true })) || { ignorePreventLeave: true });
  }

  /* ส่งลงนรกโดยไม่นับว่าถูกทำลาย — คำสั่งเสีย / โดนทำลาย / กันทำลาย ไม่ทำงาน
     (เจ้ากล้าดียังไง ฯลฯ) · กันออกสนาม (ไพรมอล) กับ กัน Magic พาออก (น้องส้ม) ยังใช้ได้ */
  function sendCardToHell(st, fx, k, opts) {
    opts = opts || {};
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k); if (!z) return false;
    if (opts.fromOppMagic && isImmuneOppMagicTarget(st, k)) {
      addLog(st, 'S', `${c.name} ไม่รับผลจาก Magic ฝ่ายตรงข้าม`);
      return false;
    }
    if (!opts.ignoreProtect) {
      if (opts.fromOppMagic || opts.fromMagic) {
        if (c.protectMagicLeave) {
          addLog(st, 'S', `${c.name} ไม่ถูกนำออกจากสนามด้วย Magic (น้องส้ม)`);
          return false;
        }
      }
      if (!opts.ignorePreventLeave && offerPreventLeave(st, fx, k, {
        type: 'move', to: (z === 'land' ? ((c.controller === 'A' || c.controller === 'B') ? c.controller : 'A') : z[0]) + '.hell',
        who: z === 'land' ? ((c.controller === 'A' || c.controller === 'B') ? c.controller : 'A') : z[0],
        k
      })) return false;
    }
    const side = z === 'land'
      ? ((c.controller === 'A' || c.controller === 'B') ? c.controller : 'A')
      : z[0];
    doMove(st, k, side + '.hell', null, fx);
    return true;
  }

  function wouldDestroyReactOptions(st, owner, opts) {
    return collectReactOptions(st, owner, 'avatarWouldBeDestroyed', null, Object.assign({}, opts || {}, { targetK: opts && opts.targetK }));
  }
  function flushWouldDestroyQueue(st, fx) {
    const q = st._wouldDestroyQueue;
    if (!q || !q.length) return;
    while (q.length && !st._wouldDestroyPending) {
      const next = q.shift();
      if (next && st.inst[next.k] && zoneOf(st, next.k))
        destroyCard(st, fx, next.k, next.opts);
    }
  }
  function cardStillOnAvatarZone(st, k) {
    return !!(k && st.inst[k] && (zoneOf(st, k) || '').endsWith('.avatar'));
  }
  /* จ่ายค่าเซ่นไหว้ไม่สำเร็จ (หมอมาแล้ววววกันทำลาย ฯลฯ) → เวท/ความสามารถใช้ไม่ได้ */
  function abortUnpaidDestroyCost(st, fx, cont) {
    if (!cont) return;
    if (cont.whenAttacking) {
      addLog(st, 'S', `เซ่นไหว้ไม่สำเร็จ — ข้ามความสามารถเมื่อโจมตีของ "${nameOf(st, cont.src)}"`);
      return;
    }
    addLog(st, 'S', `จ่ายค่าไม่ได้ — เป้าเซ่นไหว้ไม่ถูกทำลาย : "${nameOf(st, cont.src)}" ใช้ไม่ได้`);
    if (cont.isMagic && cont.src && zoneOf(st, cont.src))
      doMove(st, cont.src, cont.owner + '.hell', null, fx);
    fx.snd = fx.snd || 'clash';
  }
  /* ชนิดต้นทางหลังจ่ายคอส: magic = เวทจากมือ (ชายขัดได้) · land = สั่งใช้แลนด์ (ชายขัดไม่ได้) · avatar = เทค Avatar (เชาว์ขัดได้) */
  function paidCostKind(st, srcK) {
    const c = st.inst[srcK];
    const z = zoneOf(st, srcK) || '';
    if (!c) return 'other';
    if (z === 'land') return 'land';
    if (c.type === 'Avatar' || z.endsWith('.avatar')) return 'avatar';
    if (c.type === 'Magic') {
      const sub = c.subtype || magicSubtype(c);
      if (sub === 'Land') return 'land';
      return 'magic';
    }
    return 'other';
  }
  function runPaidCostEffect(st, fx, cont, rng) {
    if (!cont) return;
    const r = rng || (fx && fx._rng) || Math.random;
    const ctx = { src: cont.src, owner: cont.owner, rng: r, onceTag: cont.onceTag || null };
    if (cont.counterAtkCtx) {
      ctx.attacker = cont.counterAtkCtx.atk;
      ctx.target = cont.counterAtkCtx.def;
    }
    if (cont.keepSrc || cont.counterAtkCtx) runActions(st, fx, cont.actions || [], ctx);
    else enterChainOrResolve(st, fx, { src: cont.src, owner: cont.owner, actions: cont.actions || [] });
  }
  /* จ่ายคอสครบแล้ว: เวท→ชาย/อย่าให้มี · Avatar Zone→เชาว์ · แลนด์สั่งใช้→รันผลเลย */
  function continueAfterPaidCost(st, fx, cont, rng) {
    if (!cont) return;
    const r = rng || (fx && fx._rng) || Math.random;
    const kind = cont.kind || paidCostKind(st, cont.src);
    const srcC = st.inst[cont.src];
    if (kind === 'magic' && srcC && offerMagicNegateReact(st, fx, cont.owner, cont.src)) {
      const fromAtk = !!cont.counterAtkCtx;
      st._pendingMagic = {
        type: fromAtk ? 'reactActions' : 'activated',
        src: cont.src, owner: cont.owner,
        actions: cont.actions || [],
        toHellAfter: magicHellAfterPlay(srcC),
        costPaid: true,
        keepSrc: !!cont.keepSrc,
        fromCounterAtk: fromAtk,
        attacker: fromAtk ? cont.counterAtkCtx.atk : null,
        target: fromAtk ? (cont.counterAtkCtx.def || null) : null,
        triggerSource: fromAtk ? cont.counterAtkCtx.atk : null,
        mode: 'runActions'
      };
      return;
    }
    if (kind === 'avatar') {
      const z = zoneOf(st, cont.src) || '';
      if (z.endsWith('.avatar') && offerAbilityReact(st, fx, cont.owner, cont.src, {
        type: 'costPaidActivate', src: cont.src, owner: cont.owner,
        actions: cont.actions || [], keepSrc: !!cont.keepSrc,
        counterAtkCtx: cont.counterAtkCtx || null, onceTag: cont.onceTag || null,
        juti: !!cont.juti
      })) return;
      if (cont.juti && offerRichNegateOnJuti(st, fx, cont.owner, cont.src, {
        type: 'costPaidActivate', k: cont.src, src: cont.src, owner: cont.owner,
        actions: cont.actions || [], keepSrc: true
      })) return;
    }
    runPaidCostEffect(st, fx, cont, r);
  }
  function continueAfterDestroyCost(st, fx, cont, rng) {
    if (cont && !cont.kind) cont.kind = paidCostKind(st, cont.src);
    continueAfterPaidCost(st, fx, cont, rng);
  }
  function finishPaidDiscard(st, fx, p, rng) {
    if (!(p && (p.afterCostKind || p.magicCostDiscard))) return false;
    continueAfterPaidCost(st, fx, {
      src: p.src, owner: p.chooser, actions: p.actions || [],
      kind: p.afterCostKind || 'magic', keepSrc: !!p.keepSrc
    }, rng);
    return true;
  }
  function resumeWouldDestroy(st, fx, saved) {
    const pend = st._wouldDestroyPending;
    delete st._wouldDestroyPending;
    const cont = pend && pend.costContinue;
    if (saved) {
      if (pend && pend.k && st.inst[pend.k])
        addLog(st, 'S', `เอฟเฟกต์หมอมาแล้วววว: ${nameOf(st, pend.k)} ไม่ถูกทำลาย`);
      if (cont) abortUnpaidDestroyCost(st, fx, cont);
    } else if (pend && pend.k && st.inst[pend.k] && zoneOf(st, pend.k)) {
      destroyCard(st, fx, pend.k, pend.opts || { ignoreWouldDestroyReact: true });
      if (cont) {
        if (cardStillOnAvatarZone(st, pend.k)) abortUnpaidDestroyCost(st, fx, cont);
        else continueAfterDestroyCost(st, fx, cont, fx && fx._rng);
      }
    } else if (cont) {
      if (cardStillOnAvatarZone(st, pend && pend.k)) abortUnpaidDestroyCost(st, fx, cont);
      else continueAfterDestroyCost(st, fx, cont, fx && fx._rng);
    }
    flushWouldDestroyQueue(st, fx);
  }
  function offerWouldDestroyReact(st, fx, k, opts) {
    opts = opts || {};
    if (opts.ignoreWouldDestroyReact || opts.ignoreProtect) return false;
    const c = st.inst[k]; if (!c || c.type !== 'Avatar') return false;
    const z = zoneOf(st, k); if (!z || !z.endsWith('.avatar')) return false;
    if ((st.prompts || []).some(p => p.kind === 'react' && p.reactTrigger === 'avatarWouldBeDestroyed' && p.target === k))
      return true;
    if (st._wouldDestroyPending && st._wouldDestroyPending.k === k) return true;
    if (st._wouldDestroyPending && st._wouldDestroyPending.k !== k) {
      st._wouldDestroyQueue = st._wouldDestroyQueue || [];
      if (!st._wouldDestroyQueue.some(q => q.k === k))
        st._wouldDestroyQueue.push({ k, opts: Object.assign({}, opts) });
      return true;
    }
    const side = z[0];
    const opp = other(side);
    const ownOpts = wouldDestroyReactOptions(st, side, Object.assign({}, opts, { targetK: k }));
    const oppOpts = wouldDestroyReactOptions(st, opp, Object.assign({}, opts, { targetK: k }));
    const chooser = ownOpts.length ? side : (oppOpts.length ? opp : null);
    const options = chooser === side ? ownOpts : oppOpts;
    if (!chooser || !options.length) return false;
    st._wouldDestroyPending = {
      k, opts: Object.assign({}, opts, { ignoreWouldDestroyReact: true }),
      costContinue: opts.costContinue || null
    };
    st.prompts = st.prompts || [];
    st.prompts.unshift({
      kind: 'react', mode: 'preventDestroy', src: null, options, chooser, target: k,
      actions: [{ op: 'preventDestroy' }], reactTrigger: 'avatarWouldBeDestroyed',
      seconds: 10, optional: true,
      label: `${c.name} จะถูกทำลาย`
    });
    addLog(st, chooser, `React พร้อมใช้ (${options.length} ใบ): ${c.name} จะถูกทำลาย — ใช้หมอมาแล้ววววเพื่อกันทำลาย หรือไม่ใช้`);
    return true;
  }

  function destroyCard(st, fx, k, opts) {
    opts = opts || {};
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k); if (!z) return false;
    // ริกกี้: ไม่รับผล Magic ที่เล็งตัวนี้ (เวทสั่งผู้เล่นยังได้)
    if (opts.fromOppMagic) {
      if (isImmuneOppMagicTarget(st, k)) {
        addLog(st, 'S', `${c.name} ไม่รับผลจาก Magic ฝ่ายตรงข้าม`);
        return false;
      }
    }
    if (!opts.fromCombat && !opts.ignoreProtect) {
      if (isImmuneAbilityDestroy(st, k)) {
        addLog(st, 'S', `${c.name} ไม่ถูกทำลายจากความสามารถการ์ด`);
        return false;
      }
      {
        const chooser = opts.srcK ? ownerOf(st, opts.srcK) : ((opts.byOpp || opts.fromOppCard || opts.fromOppMagic) ? other(z[0]) : null);
        if ((opts.fromOppCard || opts.byOpp || opts.fromOppMagic) && protectedFromOppLeave(st, k, chooser)) {
          addLog(st, 'S', `${c.name} ไม่ถูกนำออกจากสนามโดยความสามารถฝ่ายตรงข้าม`);
          return false;
        }
      }
      if ((opts.fromOppCard || opts.byOpp || opts.fromOppMagic) && protectOwnMagicFromOpp(st, k)) {
        addLog(st, 'S', `${c.name} บน Magic Zone ถูกผู้พิทักษ์กันทำลายจากความสามารถฝ่ายตรงข้าม`);
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
          const me = fxCard(m);
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
        const e = fxCard(c);
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
        const e = fxCard(c);
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
        const e = fxCard(c);
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
        const e = fxCard(m);
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
            const pe = fxId(st, id);
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
          const e = fxId(st, id);
          if (!e || !e.protectReplaceForNameIncludes) continue;
          if (!nameMatches(c, e.protectReplaceForNameIncludes) && !(c.name || '').includes(e.protectReplaceForNameIncludes)) continue;
          addLog(st, 'S', `🛡️ ${nameOf(st, id)}: ทำลายตัวเองแทน ${c.name}`);
          destroyCard(st, fx, id, { ignoreProtect: true });
          return false;
        }
      }
      if (offerWouldDestroyReact(st, fx, k, opts)) return false;
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
    if (!wasNullified && !opts.skipDestroyed) {
      abil(st, k, 'destroyed').forEach(ab => {
        if (ab.requireLandNameIncludes) {
          const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
          if (!ok) return;
        }
        if (ab.requireFromAvatarZone && !wasAvatar) return;
        if (ab.ifDestroyedByOppOrNameIncludes) {
          const needle = ab.ifDestroyedByOppOrNameIncludes;
          const srcHas = !!(opts.srcName && String(opts.srcName).includes(needle));
          const selfHas = !!(destroyedName && String(destroyedName).includes(needle));
          if (!opts.byOpp && !srcHas && !selfHas) return;
        }
        runActions(st, fx, ab.actions || [], { src: k, owner: side, toHellAfter: false, rng: (fx && fx._rng) || (() => 0.5) });
      });
    }
    if (st.inst[k]) delete st.inst[k].granted;
    // บ่อหมัก / รัททาท่วม: เมื่อ Avatar ฝ่ายเราถูกทำลาย
    if (wasAvatar) {
      const reactDestroyOpts = [];
      const fireOwnDestroyed = (srcK) => {
        abil(st, srcK, 'ownAvatarDestroyed').forEach(ab => {
          const cond = (ab.trigger && ab.trigger.if) || '';
          if (cond === 'fromCombat' && !opts.fromCombat) return;
          if (cond === 'oppTurn' && st.active === side) return;
          if (ab.requireDestroyedNameIncludes) {
            const needle = ab.requireDestroyedNameIncludes;
            if (!nameMatches({ name: destroyedName }, needle) && String(destroyedName || '').indexOf(needle) < 0) return;
          }
          const mSym = cond.match(/^symbol:(.+)$/);
          if (mSym && !destroyedSyms.includes(mSym[1]) && destroyedSymbol !== mSym[1]) return;
          if (ab.oncePerTurn) {
            // oncePerTurnByName = แชร์โควต้าระหว่างทุกใบชื่อเดียวกัน (บ่อหมัก ฯลฯ)
            const onceKey = ab.oncePerTurnByName
              ? ('name:' + ab.oncePerTurnByName)
              : srcK;
            if (!claimOncePerTurn(st, onceKey, 'ownAvatarDestroyed')) {
              addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, srcK)}: ใช้ไปแล้วในเทิร์นนี้ (เมื่อ Avatar ถูกทำลาย)`);
              return;
            }
          }
          // React จากมือ หรือที่วาง Magic Zone — รวบรวมให้เลือกใบ
          const sc = st.inst[srcK];
          const sz = zoneOf(st, srcK) || '';
          if (sc && sc.type === 'Magic' && magicSubtype(sc) === 'React' && (sz.endsWith('.hand') || sz.endsWith('.magic'))) {
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
      (st.zones[side + '.magic'] || []).slice().forEach(fireOwnDestroyed);
      // มือ: เฉพาะ React (รัททาท่วม ฯลฯ) — ห้ามรัน Construct ในมือ (บ่อหมักต้องอยู่โซนก่อสร้าง)
      (st.zones[side + '.hand'] || []).slice().forEach(srcK => {
        const sc = st.inst[srcK];
        if (!sc || sc.type !== 'Magic' || magicSubtype(sc) !== 'React') return;
        fireOwnDestroyed(srcK);
      });
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
      offerHandOnOwnAvatarDestroyedByOpp(st, fx, side, destroyedName, destroyedSyms, destroyedSymbol);
    } else if (wasAvatar && opts.fromOppCard) {
      offerHandOnOwnAvatarDestroyedByOpp(st, fx, side, destroyedName, destroyedSyms, destroyedSymbol);
    }
    if (z === 'land') ['A', 'B'].forEach(s => enforceAvatarCap(st, fx, s));
    syncHeimdall(st);
    return true;
  }

  /* ฮามดัล / เดย์วัน: หงายใบบนสุดเด็ค */
  function syncHeimdall(st) {
    const revealBoth = ['A', 'B'].some(p => (st.zones[p + '.avatar'] || []).some(k => {
      const e = fxId(st, k);
      return e && e.revealDeckTops;
    }));
    const revealOppFor = { A: false, B: false };
    ['A', 'B'].forEach(p => {
      const need = (st.zones[p + '.avatar'] || []).some(k => {
        const e = fxId(st, k);
        if (!e || !e.revealOppDeckTopIfOwnNameIncludes) return false;
        return (st.zones[p + '.avatar'] || []).some(id => nameMatches(st.inst[id], e.revealOppDeckTopIfOwnNameIncludes));
      });
      if (need) revealOppFor[other(p)] = true;
    });
    ['A', 'B'].forEach(p => {
      const d = st.zones[p + '.deck'] || [];
      if (!d.length) return;
      const top = d[d.length - 1];
      const active = revealBoth || revealOppFor[p];
      if (active) {
        st.inst[top].faceUp = true;
        st.inst[top]._heimdallReveal = true;
      } else if (st.inst[top]._heimdallReveal) {
        st.inst[top].faceUp = false;
        delete st.inst[top]._heimdallReveal;
      }
      d.slice(0, -1).forEach(k => {
        if (st.inst[k] && st.inst[k]._heimdallReveal) {
          st.inst[k].faceUp = false;
          delete st.inst[k]._heimdallReveal;
        }
        if (st.inst[k] && st.inst[k]._guessReveal) {
          st.inst[k].faceUp = false;
          delete st.inst[k]._guessReveal;
        }
      });
    });
  }

  /* นับใบในนรกที่เลือกคืนได้ (เคารพ magicMax) — ใช้เช็คครบ countExact ก่อนเปิดเทค */
  function hellPickCapacity(st, owner, magicMax, filter, distinctNames) {
    const hell = st.zones[owner + '.hell'] || [];
    if (distinctNames) {
      const names = new Set();
      hell.forEach(k => {
        if (!st.inst[k]) return;
        if (filter && !matchFilterEx(st, k, filter)) return;
        names.add(st.inst[k].name || k);
      });
      return names.size;
    }
    let nonMagic = 0, magic = 0;
    hell.forEach(k => {
      if (!st.inst[k]) return;
      if (filter && !matchFilterEx(st, k, filter)) return;
      if (st.inst[k].type === 'Magic') magic++;
      else nonMagic++;
    });
    if (magicMax == null) return nonMagic + magic;
    return nonMagic + Math.min(magicMax | 0, magic);
  }

  /* จบ hellPickMulti: สับเด็ค จั่ว บัฟตามจำนวนที่คืน (ถ้ามี multiExact ต้องครบก่อนถึงจะนับ/จั่ว) */
  function finishHellMulti(st, fx, p, rng) {
    const n = p.multiGot || 0;
    if (p.multiExact != null && n < p.multiExact) {
      addLog(st, p.chooser, `เก็บไม่ได้ — คืนนรกไม่ครบ ${p.multiExact} ใบ (ได้ ${n})`);
      return false;
    }
    if (p.trackHellReturn && n > 0) {
      st.hellReturnedThisTurn = st.hellReturnedThisTurn || {};
      st.hellReturnedThisTurn[p.chooser] = (st.hellReturnedThisTurn[p.chooser] || 0) + n;
      addLog(st, p.chooser, `คืนนรกเข้าเด็ค ${n} ใบ (รวมเทิร์นนี้ ${st.hellReturnedThisTurn[p.chooser]})`);
    }
    if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }
    if (p.thenDraw) {
      const got = takeFromDeckToHand(st, p.chooser, p.thenDraw, fx).length;
      if (got) { addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: จั่ว ${got} ใบ`); fx.snd = 'draw'; }
    }
    if (p.buffPer && n > 0 && st.inst[p.src]) {
      st.buffs.push({ k: p.src, amt: (p.buffPer || 1) * n, until: 'endOfTurn' });
      addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: POWER +${(p.buffPer || 1) * n} จนจบเทิร์น (คืน ${n} ใบ)`);
    }
    return true;
  }

  function abortHellMulti(st, fx, p) {
    const ids = (p.returnedIds || []).slice().reverse();
    ids.forEach(k => {
      if (st.inst[k] && zoneOf(st, k)) doMove(st, k, p.chooser + '.hell', null, fx);
    });
    if (p.onceTag) unclaimOncePerTurn(st, p.src, p.onceTag);
    addLog(st, p.chooser, `ยกเลิกคืนนรก — เก็บไม่ได้ (ต้องครบ ${p.multiExact || p.multiMax} ใบ)`);
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
      addLog(st, 'S', p.then === 'revealLoserLife' ? 'เป่ายิ้งฉุบเสมอ — ไม่หงาย LIFE' : 'เป่ายิ้งฉุบเสมอ — ไม่ทำลายใคร');
      hellSrc();
      return;
    }
    const winner = beats[A] === B ? 'A' : 'B';
    const loser = winner === 'A' ? 'B' : 'A';
    if (p.then === 'revealLoserLife') {
      addLog(st, 'S', `ผู้แพ้เป่ายิ้งฉุบ: ${loser} — หงาย LIFE ${p.lifeCount || 1} ใบ`);
      if (inCritical(st, loser)) {
        st.over = { winner };
        addLog(st, 'S', `💀 ฝ่าย ${loser} อยู่ในสถานะสาหัสแล้วต้องหงาย LIFE — ${winner} ชนะ! จบเกม`);
        if (fx) fx.over = winner;
      } else {
        revealOwnLife(st, loser, p.lifeCount || 1);
      }
      hellSrc();
      return;
    }
    addLog(st, 'S', `ผู้ชนะเป่ายิ้งฉุบ: ${winner} — เลือกทำลาย Avatar 1 ใบ (กันเวทไม่ช่วย)`);
    const cd = { kind: 'chooseDestroy', src: p.src, chooser: winner, filter: { type: 'Avatar' }, zones: ['avatar'], ignoreProtect: true, srcToHell: !!p.srcToHell, optional: false };
    if (promptCandidates(st, cd).length) st.prompts.push(cd);
    else { addLog(st, 'S', 'ไม่มี Avatar ให้ทำลาย'); hellSrc(); }
  }

  /* วัลฮัลลา ฯลฯ: โดนธรณีสูบเฉพาะเมื่อต้นทางเป็น Avatar เทพม่วง หรือ Magic */
  function millSourceOk(st, srcK, ab) {
    const req = ab && ab.requireMillSource;
    if (!req) return true;
    if (!srcK || !st.inst[srcK]) return false;
    const opts = req.anyOf || [req];
    return opts.some(f => matchFilterEx(st, srcK, f));
  }
  function isMilledBuiltinOp(ac) {
    if (!ac) return false;
    if (ac.op === 'mill' && ac.who === 'both') return true;
    if (ac.op === 'returnSelfToDeck' || ac.op === 'returnSelfToHand') return true;
    if (ac.op === 'offerSummonSelfFromHell') return true;
    if (ac.op === 'returnToHand' && (ac.target === 'self' || (ac.target && ac.target.select === 'self'))) return true;
    return false;
  }

  /* ธรณีสูบ: เด็คบนสุด → นรก + trigger milled (เต๋า/นีโม่ / เทพธิดาวัลฮัลลา)
     srcK = การ์ดต้นทางที่สั่งสูบ (อ้วนไม่โบนัสการสูบของตัวเอง) */
  function mill(st, fx, player, count, rng, depth, srcK) {
    depth = depth || 0; if (depth > 5) return [];
    let extra = 0;
    (st.zones[player + '.avatar'] || []).forEach(id => {
      const e = fxId(st, id);
      if (!e || !e.millBonusExtra) return;
      if (e.millBonusExceptSelf && srcK && id === srcK) return;
      extra += e.millBonusExtra;
    });
    const total = (count || 0) + extra;
    if (extra) addLog(st, 'S', `โบนัสธรณีสูบ +${extra} (นายนิรยบาล อ้วน ฯลฯ)`);
    const milledIds = [];
    for (let i = 0; i < total; i++) {
      const k = popDeckTopUnlocked(st, player);
      if (!k) break;
      if (st.inst[k]) { st.inst[k].faceUp = true; delete st.inst[k]._scoutLock; } // เปิดให้เห็นว่าสูบใบไหน
      st.zones[player + '.hell'].push(k);
      milledIds.push(k);
    }
    if (milledIds.length) {
      addLog(st, 'S', `ธรณีสูบ ${player}: ${milledIds.map(k => nameOf(st, k)).join(', ')} ตกนรก (${milledIds.length} ใบ)`);
      fx.milled = fx.milled || [];
      milledIds.forEach(k => fx.milled.push({ p: player, k, name: nameOf(st, k) }));
      fx.snd = fx.snd || 'place';
    }
    milledIds.forEach(k => {
      if (st.inst[k]) st.inst[k].milledThisTurn = true; // หอกแหลมฯ: ใช้จากนรกได้เมื่อโดนธรณีสูบในเทิร์นนี้
      fireSentToHell(st, fx, k, player);
      const ce = fxId(st, k);
      // สัญญาเลือด / หอกแหลม: โดนธรณีสูบ → ถามว่าจะใช้ผลพิเศษไหม
      if (ce && ce.milledOptional && ce.milledOptional.actions) {
        const mo = ce.milledOptional;
        if (mo.requireNoModUsed && isMagicTypeUsed(st, player, 'Modification')) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: โดนธรณีสูบ — ใช้ Modification ไปแล้ว ใช้จากนรกไม่ได้`);
        } else {
          st.prompts.push({
            kind: 'milledOptional', src: k, chooser: player, optional: true,
            actions: mo.actions,
            countsAsModification: !!mo.countsAsModification
          });
          addLog(st, player, `เอฟเฟกต์ ${nameOf(st, k)}: โดนธรณีสูบ — จะใช้ผลพิเศษไหม? (ข้ามได้)`);
        }
      }
      abilitiesOf(st.inst[k].code, 'milled', (st.inst[k] || {}).name).forEach(ab => {
        if (!millSourceOk(st, srcK, ab)) return;
        const rest = [];
        (ab.actions || []).forEach(ac => {
          if (ac.op === 'mill' && ac.who === 'both') {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: ทั้งสองฝ่ายธรณีสูบ ${ac.count} ใบ`);
            mill(st, fx, 'A', ac.count, rng, depth + 1, k);
            mill(st, fx, 'B', ac.count, rng, depth + 1, k);
          } else if (ac.op === 'returnSelfToDeck') {
            st.zones[player + '.hell'] = st.zones[player + '.hell'].filter(x => x !== k);
            st.zones[player + '.deck'].push(k);
            if (ac.shuffle) seededShuffle(st.zones[player + '.deck'], rng);
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, k)}: กลับเข้าเด็คแล้วสับ`);
          } else if (ac.op === 'returnSelfToHand' || (ac.op === 'returnToHand' && (ac.target === 'self' || (ac.target && ac.target.select === 'self')))) {
            if ((zoneOf(st, k) || '') === player + '.hell') {
              doMove(st, k, player + '.hand', null, fx);
              addLog(st, player, `เอฟเฟกต์ ${nameOf(st, k)}: โดนธรณีสูบ — กลับขึ้นมือ`);
            }
          } else if (ac.op === 'offerSummonSelfFromHell') {
            const qd = quotaDeny(st, player + '.avatar', st.inst[k]);
            if (qd) addLog(st, 'S', `${nameOf(st, k)}: ลงสนามไม่ได้ (${qd})`);
            else {
              st.prompts.push({
                kind: 'milledOptional', src: k, chooser: player, optional: true,
                actions: [{ op: 'summonSelfFromHell' }]
              });
              addLog(st, player, `เอฟเฟกต์ ${nameOf(st, k)}: โดนธรณีสูบ — จะอัญเชิญจากนรกไหม?`);
            }
          } else if (!isMilledBuiltinOp(ac)) rest.push(ac);
        });
        if (rest.length) runActions(st, fx, rest, { src: k, owner: player, rng: rng || (fx && fx._rng) });
      });
      // THE END / เมฟิสโตถูกสอดแนม — handled elsewhere; milled→hand for THE END
      if (ce && ce.addToHandWhenMilledOrScoutedByNameIncludes) {
        /* only when milled by migraine scout — skip generic mill */
      }
    });
    if (milledIds.length) fireAnyMill(st, fx, rng);
    checkDeckEmptyLoss(st, fx, player);
    return milledIds;
  }

  function fireAnyMill(st, fx, rng) {
    ['A', 'B'].forEach(side => {
      (st.zones[side + '.avatar'] || []).slice().forEach(k => {
        const c = st.inst[k];
        if (!c || c.faceUp === false) return;
        abil(st, k, 'anyMill').forEach(ab => {
          if (ab.oncePerTurn && !claimOncePerTurn(st, k, ab.oncePerTurnTag || 'anyMill')) return;
          runActions(st, fx, ab.actions || [], { src: k, owner: side, rng: rng || (fx && fx._rng) });
        });
      });
    });
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
    if (to.endsWith('.construct')) {
      const zone = st.zones[to] || [];
      if (zone.length >= 3) return 'Construct Zone เต็ม (สูงสุด 3 ใบ)'; // Rule Book 3.2
      // ก่อสร้างชื่อซ้ำไม่ได้ (นับ reprint คนละรหัสชื่อเดียวกัน)
      if (c && c.name) {
        const selfId = c.id;
        const taken = zone.some(id => {
          if (selfId && id === selfId) return false;
          const o = st.inst[id];
          return !!(o && o.name === c.name);
        });
        if (taken) return `Construct Zone มี "${c.name}" อยู่แล้ว — ก่อสร้างชื่อซ้ำไม่ได้`;
      }
    }
    return null;
  }

  /* จำกัดโฮสต์ตาม attachOnly (นวมรัททาทุย / ไบโพล่า / ดาบอัศวิน ฯลฯ) — คืนข้อความ deny หรือ null
     โฮสต์ฝั่งเพมมุ ฯลฯ ใช้ hostAttachNameIncludes จำกัดว่าสวมได้เฉพาะชื่อนั้น */
  function attachOnlyDeny(st, modCode, hostK, modNameHint) {
    const host = st.inst[hostK];
    if (!host) return 'ไม่มี Avatar เป้าหมาย';
    const eAtt = resolveEffect(modCode, modNameHint);
    const ao = eAtt && eAtt.attachOnly;
    if (ao) {
      if (ao.symbol) {
        const want = ao.symbol;
        const syms = cardSymbols(st, hostK);
        const ok = syms.includes(want)
          || (want === 'เครื่องจักร' && (syms.includes('หุ่นยนต์') || syms.includes('เครื่องจักร')))
          || (want === 'หุ่นยนต์' && (syms.includes('หุ่นยนต์') || syms.includes('เครื่องจักร')));
        if (!ok) return `สวมใส่ได้เฉพาะ Avatar Symbol ${ao.symbol}`;
      }
      if (ao.nameIncludes && !nameMatches(host, ao.nameIncludes))
        return `สวมใส่ได้เฉพาะ Avatar ชื่อมี "${ao.nameIncludes}"`;
      if (ao.effectIncludes && !(host.effect || '').includes(ao.effectIncludes))
        return `สวมใส่ได้เฉพาะ Avatar ที่มี "${ao.effectIncludes}" ใน Text Box`;
    }
    const he = fxCard(host);
    if (he && he.hostAttachNameIncludes) {
      const needle = he.hostAttachNameIncludes;
      const fake = { name: modNameHint || '', code: modCode };
      if (!nameMatches(fake, needle))
        return `สวมใส่ให้ "${host.name}" ได้เฉพาะการ์ด "${needle}"`;
    }
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

  /* สวนกล้วยหนีภาษี ฯลฯ — บล็อกการใช้ Land ทั้งสนาม */
  function landPlayBlocked(st) {
    return (st.zones['land'] || []).some(id => {
      const c = st.inst[id];
      const e = fxCard(c);
      return !!(c && c.faceUp && e && e.blockAllLandPlay);
    });
  }
  function landPlayBlockName(st) {
    for (const id of (st.zones['land'] || [])) {
      const c = st.inst[id];
      const e = fxCard(c);
      if (c && c.faceUp && e && e.blockAllLandPlay) return c.name || 'Land';
    }
    return 'Land';
  }
  /* นับ End Phase รวมทุกฝ่าย → ครบแล้วลงนรก */
  function armGlobalEndPhaseTimer(st, k) {
    const c = st.inst[k]; if (!c) return;
    const e = fxCard(c);
    if (!e || e.destroyAfterGlobalEndPhases == null) return;
    const n = +e.destroyAfterGlobalEndPhases || 0;
    if (n <= 0) return;
    if (c._globalEndLeft != null) return;
    c._globalEndLeft = n;
    addLog(st, 'S', `${c.name}: จะลงนรกหลัง End Phase รวมทุกฝ่ายครบ ${n} ครั้ง`);
  }
  function tickOneGlobalEndTimer(st, fx, ending, k) {
    const c = st.inst[k]; if (!c) return;
    const e = fxCard(c);
    if (!e || e.destroyAfterGlobalEndPhases == null) return;
    if (c._globalEndLeft == null) c._globalEndLeft = +e.destroyAfterGlobalEndPhases || 0;
    if (c._globalEndLeft <= 0) return;
    c._globalEndLeft -= 1;
    const left = c._globalEndLeft;
    const total = +e.destroyAfterGlobalEndPhases || 0;
    addLog(st, 'S', `End Phase (${ending}): ${c.name} นับ ${total - left}/${total}${left > 0 ? ` · เหลือ ${left}` : ' · ลงนรก'}`);
    if (left <= 0) {
      const own = c.controller || ownerOf(st, k) || 'A';
      const hell = (own === 'A' || own === 'B') ? own + '.hell' : 'A.hell';
      if (zoneOf(st, k)) {
        doMove(st, k, hell, null, fx);
        addLog(st, 'S', `อัตโนมัติ ${c.name}: End Phase ครบ ${total} (นับทุกฝ่าย) — ส่งลงนรก`);
        fx.snd = fx.snd || 'clash';
      }
    }
  }
  function tickGlobalEndPhaseTimers(st, fx, ending) {
    (st.zones['land'] || []).slice().forEach(k => tickOneGlobalEndTimer(st, fx, ending, k));
    ['A.magic', 'B.magic'].forEach(z => (st.zones[z] || []).slice().forEach(k => tickOneGlobalEndTimer(st, fx, ending, k)));
  }

  function cardIsOnly(c) {
    if (!c) return false;
    if (/Only/i.test(String(c.ex || ''))) return true;
    const e = fxCard(c);
    return !!(e && e.only);
  }
  function matchFilterEx(st, k, f) {
    const c = st.inst[k]; if (!c) return false;
    if (!f) return true;
    if (f.anyOf && Array.isArray(f.anyOf)) {
      if (!f.anyOf.some(sub => matchFilterEx(st, k, sub))) return false;
    }
    if (f.type && c.type !== f.type) return false;
    if (f.subtype) {
      const sub = c.type === 'Magic' ? magicSubtype(c) : (c.subtype || '');
      if (sub !== f.subtype) return false;
    }
    if (f.subtypes && f.subtypes.length) {
      const sub = c.type === 'Magic' ? magicSubtype(c) : ((c.subtype || '') || 'Normal');
      if (!f.subtypes.includes(sub)) return false;
    }
    // symbol รวม curse override + extraSymbols
    const syms = cardSymbols(st, k);
    if (f.symbol && !syms.includes(f.symbol)) return false;
    if (f.symbols && !f.symbols.some(s => syms.includes(s))) return false;
    const cols = cardColors(st, k);
    if (f.color) {
      if (cols.length && !cols.includes(f.color)) return false;
    }
    if (f.colors && f.colors.length) {
      if (cols.length && !f.colors.some(col => cols.includes(col))) return false;
    }
    if (f.sameColorAsSrc && f._srcK) {
      const srcCols = cardColors(st, f._srcK);
      if (srcCols.length && cols.length && !cols.some(col => srcCols.includes(col))) return false;
    }
    if (f.nameIncludes) {
      const arr = Array.isArray(f.nameIncludes) ? f.nameIncludes : [f.nameIncludes];
      if (!arr.some(n => nameMatches(c, n))) return false;
    }
    if (f.nameIncludesAny && !f.nameIncludesAny.some(n => nameMatches(c, n))) return false;
    if (f.nameNotIncludes && nameMatches(c, f.nameNotIncludes)) return false;
    if (f.nameNotEquals && (c.name || '') === f.nameNotEquals) return false;
    if (f.excludeOnly && cardIsOnly(c)) return false;
    if (f.hasJuti && !cardHasJuti(st, k)) return false;
    if (f.hasKeywordAny && f.hasKeywordAny.length) {
      if (!f.hasKeywordAny.some(kw => printedHasKeyword(st, k, kw))) return false;
    }
    if (f.nameOrSymbol && Array.isArray(f.nameOrSymbol)) {
      const ok = f.nameOrSymbol.some(cond => {
        if (cond.symbol && cardSymbols(st, k).includes(cond.symbol)) return true;
        if (cond.nameIncludes && cond.nameIncludes.some(n => nameMatches(c, n))) return true;
        return false;
      });
      if (!ok) return false;
    }
    if (f.costMax != null && effCost(st, k) > f.costMax) return false;
    if (f.costLteSrc && f._srcK) {
      if (effCost(st, k) > effCost(st, f._srcK)) return false;
    }
    if (f.powerLtSrc && f._srcK) {
      if (effPower(st, k) >= effPower(st, f._srcK)) return false;
    }
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
    if (f.effectIncludes && !(c.effect || '').includes(f.effectIncludes)) return false;
    if (f.exactName && (c.name || '') !== f.exactName) return false;
    return true;
  }
  function cardHasJuti(st, k) {
    const c = st.inst[k]; if (!c) return false;
    if (keywordsOf(c.code, c.name).includes('จุติ')) return true;
    if (abilitiesOf(c.code, 'summoned', c.name).some(ab => ab.keyword === 'จุติ')) return true;
    return /(^|\n)\s*จุติ(\s|:|：)/.test(c.effect || '');
  }
  function noHellSummonCard(st, k) {
    const e = fxId(st, k);
    return !!(e && e.noHellSummon);
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

  function countOwnMagicNameIncludes(st, owner, needle) {
    const needles = Array.isArray(needle) ? needle : [needle];
    return (st.zones[owner + '.magic'] || []).filter(id => {
      const c = st.inst[id];
      return c && c.faceUp !== false && needles.some(n => n && nameMatches(c, n));
    }).length;
  }
  function countOwnHellType(st, owner, type) {
    return (st.zones[owner + '.hell'] || []).filter(id => st.inst[id] && st.inst[id].type === type).length;
  }
  function hasOwnNameIncludes(st, owner, needle) {
    if (!needle) return false;
    return (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], needle));
  }
  function ownAvatarsAllNameIncludes(st, owner, needle) {
    const avs = st.zones[owner + '.avatar'] || [];
    if (!avs.length) return false;
    return avs.every(id => nameMatches(st.inst[id], needle));
  }
  function hasStoryExtraSkillReact(st, owner) {
    return (st.zones[owner + '.avatar'] || []).some(k =>
      abil(st, k, 'static').some(ab => ab.extraReactSkillUnusedName));
  }
  function noteReactNameUsed(st, owner, name) {
    if (!name) return;
    st._reactNamesUsed = st._reactNamesUsed || {};
    st._reactNamesUsed[owner] = st._reactNamesUsed[owner] || [];
    if (!st._reactNamesUsed[owner].includes(name)) st._reactNamesUsed[owner].push(name);
  }
  function extraSkillReactOk(st, owner, c) {
    if (!c || !nameMatches(c, 'Skill')) return false;
    if (!hasStoryExtraSkillReact(st, owner)) return false;
    if (st._extraSkillReactUsed && st._extraSkillReactUsed[owner]) return false;
    const used = (st._reactNamesUsed && st._reactNamesUsed[owner]) || [];
    if (used.includes(c.name)) return false;
    return true;
  }
  function reactQuotaBlocks(st, owner, c) {
    if (!isMagicTypeUsed(st, owner, 'React')) return false;
    if (ignoresReactTypeLimit(c)) return false;
    if (extraSkillReactOk(st, owner, c)) return false;
    return true;
  }
  function reactFieldReqOk(st, owner, ab, opts) {
    if (!ab) return true;
    opts = opts || {};
    if (ab.requireOwnNameIncludes && !hasOwnNameIncludes(st, owner, ab.requireOwnNameIncludes)) return false;
    if (ab.requireOwnAllNameIncludes && !ownAvatarsAllNameIncludes(st, owner, ab.requireOwnAllNameIncludes)) return false;
    if (ab.requireFromOppCard && !(opts.fromOppCard || opts.byOpp || opts.fromOppMagic)) return false;
    if (ab.requireTargetNameIncludes && opts.targetK) {
      if (!nameMatches(st.inst[opts.targetK], ab.requireTargetNameIncludes)) return false;
    }
    if (ab.requireCritical && !inCritical(st, owner)) return false;
    return true;
  }
  function hasOwnConstructNameIncludes(st, owner, needle) {
    if (!needle) return false;
    return (st.zones[owner + '.construct'] || []).some(id => {
      const c = st.inst[id];
      return !!(c && c.faceUp !== false && nameMatches(c, needle));
    });
  }
  function abilityMagicReqOk(st, owner, ab) {
    if (!ab) return true;
    if (ab.requireOwnMagicNameIncludes) {
      if (countOwnMagicNameIncludes(st, owner, ab.requireOwnMagicNameIncludes) < 1) return false;
    }
    if (ab.requireOwnMagicNameIncludesMin) {
      const spec = ab.requireOwnMagicNameIncludesMin;
      const name = spec.nameIncludes || spec.name || spec;
      const min = spec.min != null ? spec.min : (spec.count != null ? spec.count : 1);
      if (countOwnMagicNameIncludes(st, owner, name) < min) return false;
    }
    return true;
  }
  function landControllerOf(st, landK, fallback) {
    const L = st.inst[landK];
    if (L && (L.controller === 'A' || L.controller === 'B')) return L.controller;
    return fallback;
  }
  /* Land ใช้ร่วม: เงื่อนไข/ผล "ฝ่ายเรา" ยึดผู้รับผลหรือผู้กด — ไม่ใช่คนที่วาง */
  function landSharedUser(beneficiary, fallback) {
    return (beneficiary === 'A' || beneficiary === 'B') ? beneficiary : fallback;
  }
  function isImmuneAbilityDestroy(st, k) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k) || '';
    if (z === 'land') {
      return abil(st, k, 'static').some(ab => {
        if (!ab.immuneAbilityDestroy) return false;
        const cond = (ab.trigger && ab.trigger.if) || '';
        if ((cond === 'self.zone==landZone' || cond === 'self.zone==land') && z !== 'land') return false;
        return ['A', 'B'].some(s => abilityMagicReqOk(st, s, ab));
      });
    }
    const own = (z[0] === 'A' || z[0] === 'B') ? z[0] : ownerOf(st, k);
    return abil(st, k, 'static').some(ab => {
      if (!ab.immuneAbilityDestroy) return false;
      const cond = (ab.trigger && ab.trigger.if) || '';
      if ((cond === 'self.zone==landZone' || cond === 'self.zone==land') && z !== 'land') return false;
      if ((cond === 'self.zone==magicZone' || cond === 'self.zone==magic') && !z.endsWith('.magic')) return false;
      if ((cond === 'self.zone==constructZone' || cond === 'self.zone==construct') && !z.endsWith('.construct')) return false;
      if ((cond === 'self.zone==avatarZone') && !z.endsWith('.avatar')) return false;
      return abilityMagicReqOk(st, own, ab);
    });
  }
  function protectOwnMagicFromOpp(st, k) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.magic')) return false;
    const side = z[0];
    return (st.zones[side + '.magic'] || []).some(id => {
      if (id === k) return false;
      const x = st.inst[id]; if (!x || x.faceUp === false) return false;
      return abil(st, id, 'static').some(ab => {
        if (!ab.protectOwnMagicNameIncludes) return false;
        const cond = (ab.trigger && ab.trigger.if) || '';
        if ((cond === 'self.zone==magicZone' || cond === 'self.zone==magic') && !(zoneOf(st, id) || '').endsWith('.magic')) return false;
        return nameMatches(c, ab.protectOwnMagicNameIncludes);
      });
    });
  }
  function isUntargetableByOppAbility(st, k, chooser) {
    const c = st.inst[k]; if (!c || !chooser) return false;
    const own = ownerOf(st, k);
    if (!own || own === 'S' || own === chooser) return false;
    const z = zoneOf(st, k) || '';
    return (st.zones['land'] || []).some(id => {
      const L = st.inst[id]; if (!L || L.faceUp === false) return false;
      return abil(st, id, 'static').some(ab => {
        if (!ab.untargetableOwnNameIncludes) return false;
        if (!abilityMagicReqOk(st, own, ab)) return false;
        if (!nameMatches(c, ab.untargetableOwnNameIncludes)) return false;
        if (ab.untargetableOwnSymbol && !cardSymbols(st, k).includes(ab.untargetableOwnSymbol)) return false;
        const zones = ab.untargetableOwnZones || ['avatar', 'magic', 'construct'];
        if (z === 'land') return zones.includes('land');
        return zones.some(zn => z.endsWith('.' + zn));
      });
    }) || allyProtectsName(st, k);
  }
  function countOwnAvatarNamesAny(st, owner, names) {
    const need = Array.isArray(names) ? names : [names];
    let n = 0;
    need.forEach(nm => {
      if ((st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], nm))) n++;
    });
    return n;
  }
  function countOwnAvatarsMatchingAny(st, owner, names) {
    const need = Array.isArray(names) ? names : [names];
    return (st.zones[owner + '.avatar'] || []).filter(id =>
      need.some(nm => nameMatches(st.inst[id], nm))
    ).length;
  }
  function countOwnNameIncludesAnyMin(st, owner, spec) {
    if (!spec) return 0;
    const names = spec.names || spec.nameIncludes || [];
    if (spec.distinctNames) return countOwnAvatarNamesAny(st, owner, names);
    return countOwnAvatarsMatchingAny(st, owner, names);
  }
  function ownNamesAllOk(st, owner, names) {
    if (!names || !names.length) return true;
    return names.every(nm => (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], nm)));
  }
  function allyProtectsName(st, k) {
    const c = st.inst[k]; if (!c) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.avatar')) return false;
    const side = z[0];
    return (st.zones[side + '.avatar'] || []).some(id => {
      if (id === k) return false;
      const e = fxId(st, id);
      return !!(e && e.protectAllyNameIncludes && nameMatches(c, e.protectAllyNameIncludes));
    });
  }
  /* ห้ามเล็งเป็นเป้าโจมตีไหม (โทมาโทจัง / ศาลพระภูมิ / ผู้โดยสาร ฯลฯ) */
  function cannotSelectAttackTarget(st, defId, atkId) {
    const T = st.inst[defId]; if (!T) return 'ไม่มีเป้าหมาย';
    const defZ = zoneOf(st, defId) || '';
    if (!defZ.endsWith('.avatar') && !defZ.endsWith('.construct'))
      return 'เป้าหมายโจมตีต้องเป็น Avatar หรือ Construct ฝ่ายตรงข้าม';
    const ot = ownerOf(st, defId);
    const oa = atkId ? ownerOf(st, atkId) : null;
    if (oa && (ot === oa || ot === 'S' || oa === 'S')) return 'ต้องเลือกฝ่ายตรงข้าม';
    const eDef = fxCard(T);
    const cond = eDef && eDef.cannotBeAttackTargetIf;
    if (cond) {
      const hasAttach = !cond.selfAttachedNameIncludes || hasAttachedNameIncludes(st, defId, cond.selfAttachedNameIncludes);
      const hasAlly = !cond.allyNameIncludes || (st.zones[ot + '.avatar'] || []).some(id => id !== defId && nameMatches(st.inst[id], cond.allyNameIncludes));
      if (hasAttach && hasAlly) return `"${T.name}" ไม่สามารถถูกเลือกเป็นเป้าหมายการโจมตีได้`;
    }
    if (eDef && eDef.cannotBeAttackTargetIfOwnSymbolOther) {
      const sym = eDef.cannotBeAttackTargetIfOwnSymbolOther;
      const hasOther = (st.zones[ot + '.avatar'] || []).some(id => id !== defId && cardSymbols(st, id).includes(sym));
      if (hasOther) return `"${T.name}" ไม่สามารถถูกเลือกเป็นเป้าหมายการโจมตีได้ (มี ${sym} ใบอื่น)`;
    }
    if (eDef && eDef.cannotBeAttackTargetIfOwnNameIncludes) {
      const hasPlane = (st.zones[ot + '.avatar'] || []).some(id => nameMatches(st.inst[id], eDef.cannotBeAttackTargetIfOwnNameIncludes));
      if (hasPlane) return `"${T.name}" ไม่สามารถถูกเลือกเป็นเป้าหมายการโจมตีได้ (มี ${eDef.cannotBeAttackTargetIfOwnNameIncludes})`;
    }
    for (let i = 0; i < (st.zones[ot + '.avatar'] || []).length; i++) {
      const id = st.zones[ot + '.avatar'][i];
      const eForce = fxId(st, id);
      if (!eForce || !eForce.onlyAttackableAllyNameIncludes) continue;
      const must = eForce.onlyAttackableAllyNameIncludes;
      const hasMust = (st.zones[ot + '.avatar'] || []).some(x => nameMatches(st.inst[x], must));
      if (!hasMust) continue;
      if (!nameMatches(T, must))
        return `ต้องเลือก "${must}" เป็นเป้าหมายการโจมตี`;
    }
    if (allyProtectsName(st, defId))
      return `"${T.name}" ไม่สามารถถูกเลือกเป็นเป้าหมายการโจมตีได้`;
    return null;
  }
  function lifeAttackStillLegal(st, atkId) {
    const A = st.inst[atkId]; if (!A) return false;
    const oa = ownerOf(st, atkId);
    const ot = other(oa);
    const enemyAv = (st.zones[ot + '.avatar'] || []).filter(id => st.inst[id]).length;
    const canEgg = hasKw(st, atkId, 'เตะไข่') || !!A._allowLifeDespiteAvatars;
    if (enemyAv > 0 && !canEgg) return false;
    return true;
  }
  function legalAttackRetargetIds(st, atkId) {
    const oa = ownerOf(st, atkId);
    const ot = other(oa);
    const out = [];
    (st.zones[ot + '.avatar'] || []).concat(st.zones[ot + '.construct'] || []).forEach(id => {
      if (!cannotSelectAttackTarget(st, id, atkId)) out.push(id);
    });
    return out;
  }
  /* มะเฟืองฯ เสียเตะไข่กลางการโจมตี (แลนด์ถูกทำลาย) → ต้องเลือกเป้าใหม่ */
  function offerAttackRetargetIfNeeded(st, fx) {
    if (!st.pending || st.over) return;
    if ((st.prompts || []).some(p => p.dest === 'retargetAttack')) return;
    if (!st.pending.life) return;
    const atk = st.pending.atk;
    if (!st.inst[atk] || !(zoneOf(st, atk) || '').endsWith('.avatar')) return;
    if (lifeAttackStillLegal(st, atk)) return;
    const cands = legalAttackRetargetIds(st, atk);
    if (!cands.length) {
      addLog(st, 'S', `การโจมตี LIFE ของ ${nameOf(st, atk)} เป็นโมฆะ — เสียเตะไข่และไม่มีเป้าใหม่`);
      st.pending = null;
      clearCombatBuffs(st);
      return;
    }
    st.prompts = st.prompts || [];
    st.prompts.push({
      kind: 'pick', from: 'ids', ids: cands, src: atk,
      chooser: st.pending.by, dest: 'retargetAttack',
      optional: false, allowAnyZone: true
    });
    addLog(st, st.pending.by, `${nameOf(st, atk)} เสียเตะไข่ — เลือกเป้าหมายโจมตีใหม่`);
  }
  function noteDroppedUnityAuras(st) {
    (st.buffs || []).forEach(b => {
      if (!b || !b.unity || !b.from) return;
      const gz = zoneOf(st, b.from) || '';
      const lost = gz.endsWith('.avatar') && !hasKw(st, b.from, 'สามัคคี');
      if (lost && !b._unityDropped) {
        b._unityDropped = true;
        addLog(st, 'S', `🤝 ${nameOf(st, b.from)} ไม่มีสามัคคีแล้ว — ไม่เสริม POWER ให้ ${nameOf(st, b.k)}`);
      } else if (!lost) delete b._unityDropped;
    });
  }
  function hostCannotAttackName(st, hostK) {
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== hostK) continue;
      const e = fxCard(m);
      if (e && e.hostCannotAttack) return m.name;
    }
    return null;
  }
  function hostMustAttackName(st, hostK) {
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== hostK) continue;
      const e = fxCard(m);
      if (e && e.hostMustAttack) return m.name;
    }
    return null;
  }
  /* ปืนจักรวุทธ: ห้ามตื่นยกเว้นใบที่ล็อก · น้ำซุปชาบู: ห้ามตื่นทุกกรณี */
  function tryUntap(st, hostK, srcK) {
    const c = st.inst[hostK];
    if (!c) return false;
    if (cannotChangeState(st, hostK)) {
      addLog(st, 'S', `${nameOf(st, hostK)} ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
      return false;
    }
    if (c.noUntapHard) {
      addLog(st, 'S', `${nameOf(st, hostK)} ห้ามตื่นทุกกรณี (น้ำซุปชาบู)`);
      return false;
    }
    const lock = c.noUntapExceptName;
    if (lock) {
      const src = srcK && st.inst[srcK];
      if (!(src && nameMatches(src, lock))) {
        addLog(st, 'S', `${nameOf(st, hostK)} ห้ามตื่น ยกเว้น「${lock}」`);
        return false;
      }
      delete c.noUntapExceptName;
      addLog(st, 'S', `${nameOf(st, hostK)}: สิ้นสุดห้ามตื่น (ยกเว้น ${lock})`);
    }
    c.tapped = false;
    return true;
  }
  function hostMustAttackPendingName(st, owner) {
    if (!owner || (owner !== 'A' && owner !== 'B')) return null;
    if (st.turn === 1 && owner === (st.firstPlayer || 'A')) return null;
    const lim = landAttackLimitPerTurn(st);
    if (lim != null) {
      st.attacksThisTurn = st.attacksThisTurn || { A: 0, B: 0 };
      if ((st.attacksThisTurn[owner] || 0) >= lim) return null;
    }
    const opp = other(owner);
    const avs = st.zones[owner + '.avatar'] || [];
    for (let i = 0; i < avs.length; i++) {
      const k = avs[i];
      const c = st.inst[k];
      if (!c || c.tapped || c.faceUp === false) continue;
      if (!hostMustAttackName(st, k)) continue;
      if (c.cannotAttack) continue;
      const eAtk = fxCard(c);
      if (eAtk && eAtk.cannotAttack) continue;
      if (attackIfDeny(st, k, owner)) continue;
      if (hostCannotAttackName(st, k)) continue;
      const foes = st.zones[opp + '.avatar'] || [];
      const lives = st.zones[opp + '.life'] || [];
      const canEgg = hasKw(st, k, 'เตะไข่') || c._allowLifeDespiteAvatars;
      if (foes.length || (lives.length && (canEgg || !foes.length))) return c.name;
    }
    return null;
  }
  function attackIfDeny(st, k, side) {
    const c = st.inst[k];
    const e = c && fxCard(c);
    if (!e || !e.attackIf) return null;
    if (e.attackIf === 'emptyHand' && (st.zones[side + '.hand'] || []).length > 0)
      return `"${c.name}" โจมตีได้เมื่อมือว่างเท่านั้น`;
    const m = String(e.attackIf).match(/^onlyAlliesNameIncludes:(.+)$/);
    if (m) {
      const needle = m[1];
      const avs = st.zones[side + '.avatar'] || [];
      let has = false;
      for (let i = 0; i < avs.length; i++) {
        const id = avs[i];
        if (id === k) continue;
        if (!nameMatches(st.inst[id], needle))
          return `"${c.name}" โจมตีได้เมื่อ Avatar Zone มี "${needle}" เท่านั้น`;
        has = true;
      }
      if (!has) return `"${c.name}" โจมตีได้เมื่อ Avatar Zone มี "${needle}" เท่านั้น`;
    }
    return null;
  }
  function landAttackLimitPerTurn(st) {
    for (const id of (st.zones['land'] || [])) {
      const e = fxId(st, id);
      if (st.inst[id] && st.inst[id].faceUp && e && e.attackLimitPerTurn != null) return +e.attackLimitPerTurn;
    }
    return null;
  }
  function fireOwnPlayMagic(st, fx, owner, rng, magicK) {
    if (owner !== 'A' && owner !== 'B') return;
    const mag = magicK ? st.inst[magicK] : null;
    (st.zones[owner + '.avatar'] || []).slice().forEach(k => {
      abil(st, k, 'ownPlayMagic').forEach(ab => {
        const cond = (ab.trigger && ab.trigger.if) || '';
        if (cond === 'ownTurn' && st.active !== owner) return;
        if (ab.requireMagicNameIncludes) {
          if (!mag || !nameMatches(mag, ab.requireMagicNameIncludes)) return;
        }
        if (ab.oncePerTurn && !claimOncePerTurn(st, k, ab.oncePerTurnTag || 'ownPlayMagic')) return;
        runActions(st, fx, ab.actions || [], { src: k, owner, rng: rng || fx._rng || Math.random });
      });
    });
  }
  function checkInstantWinDraw(st, fx, side) {
    if (!st || st.over) return;
    (st.zones[side + '.magic'] || []).forEach(k => {
      if (st.over) return;
      const e = fxId(st, k);
      if (!e || !e.instantWinIf) return;
      const spec = e.instantWinIf;
      if (spec.when && spec.when !== 'ownDrawPhase') return;
      if (spec.ownMagicNameIncludesMin) {
        const s = spec.ownMagicNameIncludesMin;
        const nm = s.nameIncludes || s.name;
        const min = s.min != null ? s.min : 1;
        if (countOwnMagicNameIncludes(st, side, nm) < min) return;
      }
      if (spec.ownNamesAll && !ownNamesAllOk(st, side, spec.ownNamesAll)) return;
      st.over = { winner: side };
      fx.over = side;
      addLog(st, 'S', `🏆 ${nameOf(st, k)}: เงื่อนไขครบ — ${side} ชนะทันที!`);
    });
  }
  function destroyOptsFromSrc(st, srcK, targetK) {
    const src = st.inst[srcK];
    if (!src) return {};
    const so = ownerOf(st, srcK);
    const to = ownerOf(st, targetK);
    const byOpp = !!(so && to && so !== to && so !== 'S' && to !== 'S');
    const fromMagic = src.type === 'Magic';
    return {
      srcK, srcName: src.name,
      byOpp, fromOppCard: byOpp,
      fromMagic, fromOppMagic: byOpp && fromMagic
    };
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
    if (cost.discardGemSum != null || cost.discardGemSumExact != null) {
      const exact = cost.discardGemSumExact != null || !!cost.exact
        || (cost.discardGemSum && typeof cost.discardGemSum === 'object' && cost.discardGemSum.exact != null);
      const min = cost.discardGemSumExact != null
        ? +cost.discardGemSumExact
        : (typeof cost.discardGemSum === 'object'
          ? +(cost.discardGemSum.exact != null ? cost.discardGemSum.exact : cost.discardGemSum.min) || 3
          : +cost.discardGemSum || 3);
      return [{ op: 'discardGemSum', min, exact: !!exact }];
    }
    if (cost.op) return [cost];
    return null;
  }

  function cardSymbols(st, k) {
    const c = st.inst[k]; if (!c) return [];
    // Land force symbol (แอสการ์ด): บังคับ Symbol ทั้งสนามจนกว่า Land จะออก
    for (const id of (st.zones['land'] || [])) {
      const L = st.inst[id];
      const le = fxCard(L);
      if (L && L.faceUp && le && le.forceAllAvatarSymbol) return [le.forceAllAvatarSymbol];
    }
    // วูตาตู ฯลฯ: ใบสวมบังคับ Symbol โฮสต์
    for (const id in st.inst) {
      const m = st.inst[id];
      if (!m || m.attachedTo !== k) continue;
      const me = fxCard(m);
      if (me && me.hostSymbolReplace) return [me.hostSymbolReplace];
    }
    const out = [];
    if (c.curse && c.curse.symbol) out.push(c.curse.symbol);
    else if (c.symbol) out.push(c.symbol);
    const e = fxCard(c);
    if (e && e.allSymbols && (zoneOf(st, k) || '').endsWith('.avatar')) {
      const all = ['กะปอม', 'คน', 'จอมเวทย์', 'ต่างชาติ', 'ชาวต่างชาติ', 'ต้นไม้', 'ทหาร', 'นรก', 'ปลา', 'ผี', 'ยักษ์', 'รัททาทุย', 'ฤษี', 'สัตว์', 'สัตว์วิเศษ', 'สิ่งก่อสร้าง', 'หุ่นยนต์', 'เครื่องจักร', 'เทพ', 'เปรต', 'เอเลี่ยน', 'แมลง', 'ไซเบอร์'];
      all.forEach(s => { if (!out.includes(s)) out.push(s); });
    }
    if (e && e.extraSymbols) e.extraSymbols.forEach(s => { if (!out.includes(s)) out.push(s); });
    return out;
  }
  function cardColors(st, k) {
    return avatarCostColors(st.inst[k], fxId(st, k) || fxCard(st.inst[k]));
  }

  /* เทิร์นละครั้ง — คืน true ถ้ายังไม่ใช้ในเทิร์นผู้เล่นนี้ แล้วมาร์คว่าใช้แล้ว
     ใช้ turnSeq (นับทุกครั้งที่จบเทิร์น) ไม่ใช้ st.turn อย่างเดียว เพราะ st.turn แชร์ข้ามตา A↔B ในรอบเดียวกัน */
  function oncePerTurnKey(st, k, tag) {
    const seq = st.turnSeq != null ? st.turnSeq : ((st.turn || 0) + ':' + (st.active || ''));
    return k + ':' + seq + ':' + (tag || 'x');
  }
  function isOncePerTurnUsed(st, k, tag) {
    st._onceTurn = st._onceTurn || {};
    return !!st._onceTurn[oncePerTurnKey(st, k, tag)];
  }
  function claimOncePerTurn(st, k, tag) {
    st._onceTurn = st._onceTurn || {};
    const key = oncePerTurnKey(st, k, tag);
    if (st._onceTurn[key]) return false;
    st._onceTurn[key] = true;
    return true;
  }
  function unclaimOncePerTurn(st, k, tag) {
    st._onceTurn = st._onceTurn || {};
    delete st._onceTurn[oncePerTurnKey(st, k, tag)];
  }
  /* ตัวเลือก chooseMode (โคกอีสานนูน ฯลฯ) — เช็ค oncePerTurn / เงื่อนไขก่อนรัน */
  function chooseModeOptionDeny(st, k, owner, opt) {
    if (!opt) return 'ไม่มีตัวเลือกนั้น';
    if (opt.oncePerTurn) {
      const tag = opt.oncePerTurnTag || ('mode:' + (opt.label || ''));
      if (isOncePerTurnUsed(st, k, tag))
        return `"${opt.label || 'ตัวเลือกนี้'}" ใช้ไปแล้วในเทิร์นนี้`;
    }
    if (opt.requireHellReturnedThisTurnMin != null) {
      const got = (st.hellReturnedThisTurn && st.hellReturnedThisTurn[owner]) || 0;
      if (got < opt.requireHellReturnedThisTurnMin)
        return `ใช้ไม่ได้ — ต้องคืนนรก ≥ ${opt.requireHellReturnedThisTurnMin} ในเทิร์นนี้ก่อน (ตอนนี้ ${got}) · ใช้เทค 1 ก่อน`;
    }
    if (opt.requireHellPickExact != null) {
      const ac = (opt.actions || []).find(x => x.op === 'hellPickMulti') || {};
      const cap = hellPickCapacity(st, owner, ac.magicMax != null ? ac.magicMax : null, ac.filter || {});
      if (cap < opt.requireHellPickExact)
        return `ใช้ไม่ได้ — ต้องคืนนรกครบ ${opt.requireHellPickExact} ใบ (ในนรกเลือกได้ ${cap} ใบ) · เก็บไม่ได้แล้วใช้เทค 2 ไม่ได้`;
    }
    if (opt.requireOwnNameIncludes) {
      const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], opt.requireOwnNameIncludes));
      if (!ok) return `ใช้ไม่ได้ — ต้องมี "${opt.requireOwnNameIncludes}" บนสนาม`;
    } else {
      // เผื่อเทควางเงื่อนไขไว้ใน action (เช่น forceDuelNoTap.ownNameIncludes)
      const acNeed = (opt.actions || []).map(x => x.requireOwnNameIncludes || x.ownNameIncludes).find(Boolean);
      if (acNeed) {
        const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], acNeed));
        if (!ok) return `ใช้ไม่ได้ — ต้องมี "${acNeed}" บนสนาม`;
      }
    }
    if (opt.requireOwnConstructNameIncludes) {
      if (!hasOwnConstructNameIncludes(st, owner, opt.requireOwnConstructNameIncludes))
        return `ใช้ไม่ได้ — ต้องมี "${opt.requireOwnConstructNameIncludes}" บน Construct Zone`;
    }
    if (opt.countsAsModification || opt.requireNoModUsed) {
      if (isMagicTypeUsed(st, owner, 'Modification'))
        return 'เทิร์นนี้ใช้ Modification Magic ไปแล้ว';
    }
    {
      const fd = fieldSummonDeny(st, owner, opt, k);
      if (fd) return fd;
    }
    return null;
  }
  function claimChooseModeOption(st, k, opt) {
    if (!opt || !opt.oncePerTurn) return true;
    const tag = opt.oncePerTurnTag || ('mode:' + (opt.label || ''));
    return claimOncePerTurn(st, k, tag);
  }
  function chooseModeOptionAlreadyUsed(st, k, opt) {
    if (!opt || !opt.oncePerTurn) return false;
    const tag = opt.oncePerTurnTag || ('mode:' + (opt.label || ''));
    return isOncePerTurnUsed(st, k, tag);
  }
  /* เลือกเทคแล้วใช้ไม่ได้ / กดข้ามหลังประกาศ — นับว่าใช้ไปแล้วในเทิร์นนี้ */
  function consumeChooseModeOption(st, owner, srcK, opt) {
    claimChooseModeOption(st, srcK, opt);
    if (opt && opt.countsAsModification) consumeCountsAsModification(st, owner);
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

  /* บ่าวจุ้ย ฯลฯ: จบการต่อสู้ที่ Avatar นี้โจมตี → สั่งใช้ (ข้ามได้) */
  function offerAfterAttackCombat(st, fx, atkId) {
    if (!atkId || !st.inst[atkId]) return;
    const owner = ownerOf(st, atkId);
    if (owner !== 'A' && owner !== 'B') return;
    if (!(zoneOf(st, atkId) || '').endsWith('.avatar')) return;
    abil(st, atkId, 'afterAttackCombat').forEach(ab => {
      if (ab.requireOwnConstructNameIncludes && !hasOwnConstructNameIncludes(st, owner, ab.requireOwnConstructNameIncludes))
        return;
      if (ab.oncePerTurn && isOncePerTurnUsed(st, atkId, ab.oncePerTurnTag || 'afterAttackCombat')) return;
      runActions(st, fx, ab.actions || [], {
        src: atkId, owner, rng: (fx && fx._rng) || Math.random,
        onceTag: ab.oncePerTurn ? (ab.oncePerTurnTag || 'afterAttackCombat') : null
      });
    });
  }

  /* เมื่อสวม Mod ชื่ออาวุธหุ่นนักรบผู้กล้า → ไมเกรนทุกใบบนสนามจั่ว (เทิร์นละครั้งต่อใบ) */
  function fireWeaponModAttached(st, fx, modId, rng) {
    const mod = st.inst[modId]; if (!mod) return;
    const host = mod.attachedTo ? st.inst[mod.attachedTo] : null;
    const me = fxCard(mod);
    if (me && me.drawOnAttachIfHostNameIncludes && host && nameMatches(host, me.drawOnAttachIfHostNameIncludes)) {
      const side = ownerOf(st, mod.attachedTo);
      if (side === 'A' || side === 'B') {
        if (takeFromDeckToHand(st, side, 1, fx).length) {
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

  /* ของขวัญ ฯลฯ — อัญเชิญฟรีถ้าเงื่อนไข freeSummonIf ครบ (มือเท่านั้น) */
  function freeSummonOk(st, k) {
    const c = st.inst[k]; if (!c || !st) return false;
    const e = fxCard(c); if (!e || !e.freeSummonIf) return false;
    const z = zoneOf(st, k) || '';
    if (!z.endsWith('.hand')) return false;
    const owner = z[0];
    const fs = e.freeSummonIf;
    const field = st.zones[owner + '.avatar'] || [];
    if (fs.requireOwnNameIncludes && !field.some(id => nameMatches(st.inst[id], fs.requireOwnNameIncludes)))
      return false;
    if (fs.requireNoOwnExactName && field.some(id => (st.inst[id] && st.inst[id].name) === fs.requireNoOwnExactName))
      return false;
    return true;
  }

  /* Cost จริงบนสนาม: ค่าพิมพ์ + delta + Aura ทหาร (−1 ฝั่งตรงข้าม) + ขวานไม้ (−1 โฮสต์) */
  function effCost(st, k) {
    const c = st.inst[k]; if (!c) return 0;
    if (c._swapCombat) return Math.max(0, +c.power || 0);
    const e0 = fxCard(c);
    // ของขวัญที่เมียทิ้งไว้ให้: มีเจค + ยังไม่มีของขวัญบนสนาม → Cost บนมือ = 0
    if (freeSummonOk(st, k)) return 0;
    // น้องนาว: มีเปรตบนสนาม → Cost บนมือ = 0
    if (e0 && e0.costZeroIfOwnSymbol) {
      const z0 = zoneOf(st, k) || '';
      if (z0.endsWith('.hand')) {
        const has = (st.zones[z0[0] + '.avatar'] || []).some(id => st.inst[id] && st.inst[id].symbol === e0.costZeroIfOwnSymbol);
        if (has) return 0;
      }
    }
    // ZeedZad Server: แก๊งขยะชื่อไม่ซ้ำ ≥2 → Cost = 0
    if (e0 && e0.costZeroIfDistinctOwnNameIncludes) {
      const z0 = zoneOf(st, k) || '';
      if (z0.endsWith('.hand') || z0.endsWith('.construct') || z0.endsWith('.avatar')) {
        const cfg = e0.costZeroIfDistinctOwnNameIncludes;
        const needle = cfg.nameIncludes || 'แก๊งขยะ';
        const names = new Set();
        (st.zones[z0[0] + '.avatar'] || []).forEach(id => {
          const x = st.inst[id];
          if (x && nameMatches(x, needle) && x.name) names.add(x.name);
        });
        if (names.size >= (cfg.min || 2)) return 0;
      }
    }
    let cost = (+c.cost || 0) + (+c.costDelta || 0);
    const z = zoneOf(st, k) || '';
    if (z.endsWith('.hand') && (st.handCostMods || []).length) {
      (st.handCostMods || []).forEach(m => {
        if (m.owner !== z[0]) return;
        if (m.nameIncludes && !nameMatches(c, m.nameIncludes)) return;
        cost += m.amount || 0;
      });
    }
    if (z.endsWith('.avatar')) {
      const side = z[0], opp = other(side);
      (st.zones[opp + '.avatar'] || []).forEach(id => {
        const e = fxId(st, id);
        if (e && e.enemyCostAura) cost += e.enemyCostAura;
      });
      for (const id in st.inst) {
        const m = st.inst[id];
        if (!m || m.attachedTo !== k) continue;
        const e = fxCard(m);
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
      let printed = Math.max(0, +c.power || 0);
      const zLock = zoneOf(st, k) || '';
      if (zLock.endsWith('.avatar') && c.faceUp) {
        const hasHalve = (st.zones['land'] || []).some(lk => {
          const s = st.inst[lk]; if (!s || !s.faceUp) return false;
          return abil(st, lk, 'static').some(ab => (ab.actions || []).some(ac => ac.op === 'modifyPower' && ac.halveFloor));
        });
        if (hasHalve) printed = Math.floor((+c.power || 0) / 2);
      }
      return { total: printed, base: printed, lines: [{ amt: printed, label: 'ล็อก POWER ตั้งต้น (จนจบการต่อสู้)' }], note: 'lock' };
    }
    {
      const e = fxCard(c);
      if (e && e.setPowerFrom === 'oppHandCount') {
        const z = zoneOf(st, k) || '';
        if (z.endsWith('.avatar')) {
          const total = Math.max(0, (st.zones[other(z[0]) + '.hand'] || []).length);
          return { total, base: +c.power || 0, lines: [{ amt: total, label: 'เท่าจำนวนมือฝ่ายตรงข้าม' }], note: 'set' };
        }
      }
    }
    {
      const e = fxCard(c);
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
    const printed = +c.power || 0;
    let base = printed;
    const kz0 = zoneOf(st, k) || '';
    let halvePrintedFrom = '';
    if (kz0.endsWith('.avatar') && c.type === 'Avatar' && c.faceUp) {
      (st.zones['land'] || []).forEach(lk => {
        const s = st.inst[lk]; if (!s || !s.faceUp) return;
        abil(st, lk, 'static').forEach(ab => {
          const cond = (ab.trigger && ab.trigger.if) || '';
          if (cond && cond !== 'self.zone==landZone' && cond !== 'self.zone==land') return;
          (ab.actions || []).forEach(ac => {
            if (ac.op !== 'modifyPower' || !ac.halveFloor) return;
            const t = ac.target || {};
            if (t.select && t.select !== 'all') return;
            if (t.type && c.type !== t.type) return;
            if (t.zone === 'avatarZone' && !kz0.endsWith('.avatar')) return;
            if (t.symbol && !cardSymbols(st, k).includes(t.symbol)) return;
            if (t.nameIncludes && !t.nameIncludes.some(n => nameMatches(c, n))) return;
            halvePrintedFrom = s.name;
          });
        });
      });
      if (halvePrintedFrom) base = Math.floor(printed / 2);
    }
    let p = base;
    lines.push({ amt: printed, label: 'ค่าตั้งต้นบนการ์ด' });
    if (halvePrintedFrom && base !== printed) {
      add(base - printed, `「${halvePrintedFrom}」ลดครึ่งค่าตั้งต้น (ปัดลง)`);
    }
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
    const kz = kz0;
    if (kz.endsWith('.avatar') && c.type === 'Avatar' && c.faceUp) {
      const side = kz[0];
      if (c.curse && c.curse.powerMod) { add(c.curse.powerMod, `คำสาป${c.curse.symbol ? ' ' + c.curse.symbol : ''}`); p += c.curse.powerMod; }
      for (const id in st.inst) if (st.inst[id].attachedTo === k) {
        const mod = st.inst[id];
        const me = fxCard(mod);
        if (me && me.attachOnly && attachOnlyDeny(st, mod.code, k, mod.name)) continue;
        let modAmt = 0;
        if (me && me.hostPowerIfEffCostMin && effCost(st, k) >= me.hostPowerIfEffCostMin.min)
          modAmt += me.hostPowerIfEffCostMin.amount || 0;
        const staticAbs = abilitiesOf(mod.code, 'static', mod.name);
        let gotStaticPow = false;
        staticAbs.forEach(ab => (ab.actions || []).forEach(ac => {
          if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'equippedAvatar') {
            if (ac.ifHostNameIncludes && !nameMatches(c, ac.ifHostNameIncludes)) return;
            gotStaticPow = true;
            let amt = ac.amount || 0;
            if (me && me.stackPowerOnReattach)
              amt += (mod.equipHostChanges || 0) * (typeof me.stackPowerOnReattach === 'number' ? me.stackPowerOnReattach : 1);
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
        if (!gotStaticPow && !(me && me.hostPowerIfEffCostMin)) {
          const hasAttackPow = abilitiesOf(mod.code, 'declareAttack', mod.name)
            .some(ab => (ab.actions || []).some(ac => ac.op === 'modifyPower'));
          if (!hasAttackPow) {
            const txt = mod.effect || '';
            const mm = txt.match(/POWER\s*([+-]\s*\d+)/i);
            if (mm) {
              const symM = txt.match(/\{?\s*symbol\s+([^}\s]+)\s*\}?/i);
              const needSym = symM ? symM[1].trim() : '';
              if (!needSym || cardSymbols(st, k).includes(needSym))
                modAmt += parseInt(String(mm[1]).replace(/\s/g, ''), 10) || 0;
            }
          }
        }
        if (modAmt) { add(modAmt, `สวม「${mod.name}」`); p += modAmt; }
      }
      const sources = [
        ...(st.zones['A.avatar'] || []), ...(st.zones['B.avatar'] || []),
        ...(st.zones['A.magic'] || []), ...(st.zones['B.magic'] || []),
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
          if ((cond === 'self.zone==magicZone' || cond === 'self.zone==magic') && !sz.endsWith('.magic')) return;
          if (ab.onlyBattlePhase && st.phase !== 'Battle') return;
          if (cond === 'battlePhase' && st.phase !== 'Battle') return;
          if (ab.requireLandNameIncludes) {
            const landOk = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!landOk) return;
          }
          const srcOwn = sz === 'land' ? landSharedUser(side, landControllerOf(st, src, side)) : (sz[0] === 'A' || sz[0] === 'B' ? sz[0] : side);
          if (ab.onlyOwnTurn && st.active !== srcOwn) return;
          if (ab.requireOtherAvatar) {
            const hasOther = ['A', 'B'].some(s => (st.zones[s + '.avatar'] || []).some(id => id !== src && st.inst[id]));
            if (!hasOther) return;
          }
          if (ab.requireOwnAnyLinked && !anyOwnLinked(st, srcOwn)) return;
          if (ab.requireOwnLinkedNamesAll && !ownLinkedNamesAll(st, srcOwn, ab.requireOwnLinkedNamesAll)) return;
          if (ab.unlessOwnLinkedNamesAll && ownLinkedNamesAll(st, srcOwn, ab.unlessOwnLinkedNamesAll)) return;
          if (ab.requireOwnNameIncludes) {
            const need = ab.requireOwnNameIncludes;
            const ok = (st.zones[srcOwn + '.avatar'] || []).some(id => nameMatches(st.inst[id], need));
            if (!ok) return;
          }
          if (!abilityMagicReqOk(st, srcOwn, ab)) return;
          (ab.actions || []).forEach(ac => {
            if (ac.op !== 'modifyPower') return;
            const t = ac.target || {};
            let amt = 0;
            if (t.select === 'all') {
              if (t.side === 'own' && sz[0] !== side && sz !== 'land') return;
              if (sz.endsWith('.construct') && t.side === 'own' && sz[0] !== side) return;
              if (sz.endsWith('.magic') && t.side === 'own' && sz[0] !== side) return;
              if (t.side === 'enemy' && sz[0] === side) return;
              if (t.excludeSelf && src === k) return;
              if (t.type && c.type !== t.type) return;
              if (t.symbol && !cardSymbols(st, k).includes(t.symbol)) return;
              if (t.symbols && !t.symbols.some(sy => cardSymbols(st, k).includes(sy))) return;
              if (t.nameIncludes && !t.nameIncludes.some(n => nameMatches(c, n))) return;
              if (t.requireLinked && !inLinkStatus(st, k)) return;
              if (t.requireAttachedNameIncludes && !hasAttachedNameIncludes(st, k, t.requireAttachedNameIncludes)) return;
              if (t.cost != null && (+c.cost || 0) !== +t.cost) return;
              if (t.gem != null && (+c.gem || 0) !== +t.gem) return;
              if (t.power != null && (+c.power || 0) !== +t.power) return;
              if (ac.amountPer === 'ownHellPerN') {
                const perN = ac.perN || 15;
                const hellN = (st.zones[side + '.hell'] || []).length;
                amt = (ac.per || 1) * Math.floor(hellN / perN);
              } else amt = ac.amount || 0;
            } else if (t.select === 'self' && src === k) {
              if (t.requireAttached) {
                let hasAtt = false;
                for (const id in st.inst) {
                  if (st.inst[id] && st.inst[id].attachedTo === k) { hasAtt = true; break; }
                }
                if (!hasAtt) return;
              }
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
              else if (ac.amountPer === 'hellDistinctNameIncludes') {
                const names = new Set();
                const needle = ac.nameIncludes || ac.nameIncludesAny || 'นายนิรยบาล';
                const needles = Array.isArray(needle) ? needle : [needle];
                (st.zones[side + '.hell'] || []).forEach(id => {
                  const hc = st.inst[id];
                  if (!hc || hc.type !== 'Avatar') return;
                  if (needles.some(n => nameMatches(hc, n))) names.add(hc.name);
                });
                amt = (ac.per || 1) * names.size;
              } else if (ac.amountPer === 'ownHellDistinctAvatarsMin') {
                const names = new Set();
                (st.zones[side + '.hell'] || []).forEach(id => {
                  const hc = st.inst[id];
                  if (hc && hc.type === 'Avatar') names.add(hc.name);
                });
                amt = names.size >= (ac.min || 10) ? (ac.amount || 2) : 0;
              } else if (ac.amountPer === 'ownDarkNameIncludes') {
                const needle = ac.nameIncludes || ac.nameIncludesAny || '';
                const needles = Array.isArray(needle) ? needle : [needle];
                amt = (ac.per || 1) * (st.zones[side + '.dark'] || []).filter(id => {
                  const dc = st.inst[id];
                  return dc && needles.some(n => nameMatches(dc, n));
                }).length;
              } else if (ac.amountPer === 'allTappedAvatars') {
                amt = (ac.per || 1) * (
                  (st.zones['A.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length +
                  (st.zones['B.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length
                );
              } else if (ac.amountPer === 'ownHellPerN') {
                const perN = ac.perN || 15;
                const hellN = (st.zones[side + '.hell'] || []).length;
                amt = (ac.per || 1) * Math.floor(hellN / perN);
              } else if (ac.amountPer === 'ownHellNameIncludesPerN') {
                if (ac.onlyOwnBattlePhase && !(st.phase === 'Battle' && st.active === side)) amt = 0;
                else {
                  const needle = ac.nameIncludes || ac.nameIncludesAny || '';
                  const needles = Array.isArray(needle) ? needle : [needle];
                  const perN = ac.perN || 2;
                  const n = (st.zones[side + '.hell'] || []).filter(id => {
                    const hc = st.inst[id];
                    return hc && needles.some(nm => nameMatches(hc, nm));
                  }).length;
                  amt = (ac.per || 1) * Math.floor(n / perN);
                }
              } else if (ac.amountPer === 'ownHellTypePerN') {
                const perN = ac.perN || 2;
                const n = countOwnHellType(st, side, ac.hellType || 'Magic');
                amt = (ac.per || 1) * Math.floor(n / perN);
              } else if (ac.amountPer === 'ownMagicNameIncludes') {
                const needle = ac.nameIncludes || ac.nameIncludesAny || '';
                amt = (ac.per || 1) * countOwnMagicNameIncludes(st, side, needle);
              }
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
        const e = fxId(st, lk);
        if (e && e.auraNameIncludes && e.auraPower && nameMatches(c, e.auraNameIncludes)) {
          add(e.auraPower, `ออร่า「${nameOf(st, lk)}」`);
          p += e.auraPower;
        }
      });
    }
    // ลูกฮึด = ไทเบรกเกอร์ตอน POWER เท่ากันเท่านั้น (ไม่บวก POWER) — ดู resolveCombat
    {
      const e = fxCard(c);
      if (e && e.powerPlusOnOppTurn && kz.endsWith('.avatar') && st.active && st.active !== kz[0]) {
        add(e.powerPlusOnOppTurn, 'เทิร์นฝ่ายตรงข้าม'); p += e.powerPlusOnOppTurn;
      }
    }
    {
      const e = fxCard(c);
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
        if (m && m.attachedTo === k && fxCard(m) && fxCard(m).ignoreNegativePower) return true;
      }
      return false;
    })();
    const untilLbl = u => u === 'permanent' ? 'จนกว่าออกจากสนาม' : u === 'combat' ? 'จนจบการต่อสู้' : u === 'oppNextEnd' ? 'จน End ฝ่ายตรงข้าม' : 'จนจบเทิร์น';
    (st.buffs || []).forEach(b => {
      if (b.k !== k || b.lockPrinted || !b.amt) return;
      if (hasAntidote && b.amt < 0) return;
      if (b.unity && b.from) {
        const gz = zoneOf(st, b.from) || '';
        if (gz.endsWith('.avatar') && !hasKw(st, b.from, 'สามัคคี')) return;
      }
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
      // มือ + สนามฝ่ายเรา (อวตาร/คอนสตรัค/เวท/แลนด์) — ไปเลยมอนตี้ ฯลฯ
      case 'ownSide': {
        let n = cnt([owner + '.hand', owner + '.avatar', owner + '.construct', owner + '.magic']);
        n += (st.zones.land || []).filter(k => k !== excludeK).length;
        return n;
      }
      case 'oppField': return cnt([opp + '.avatar', opp + '.construct']);
      // ทุกการ์ดบนสนามทั้งสองฝั่ง (อวตาร + คอนสตรัค + เวทที่วางอยู่ + Land)
      case 'fieldAll': return cnt(['A.avatar', 'A.construct', 'A.magic', 'B.avatar', 'B.construct', 'B.magic', 'land']);
      default: return 0;
    }
  }

  /* ค่าเซ่นไหว้ของความสามารถจ่ายได้ไหม (มะม่วง / รถถัง ฯลฯ ต้องอยู่บนสนาม) */
  function sacrificeCostOk(st, owner, cost, srcK) {
    const list = normalizeAbilityCost(cost) || (Array.isArray(cost) ? cost : null);
    if (!list || !list.length) return true;
    for (let i = 0; i < list.length; i++) {
      const costOp = list[i];
      if (!costOp || costOp.op !== 'sacrifice') continue;
      const p = {
        kind: 'pick', from: 'ownAvatars', src: srcK || null, chooser: owner,
        filter: costOp.filter || {}, dest: 'sacrifice', optional: false, includeSelf: true
      };
      if (!promptCandidates(st, p).length) return false;
    }
    return true;
  }
  function abilitySacrificeNeed(cost) {
    const list = normalizeAbilityCost(cost) || (Array.isArray(cost) ? cost : null) || [];
    const sac = list.find(c => c && c.op === 'sacrifice');
    if (!sac) return 'Avatar';
    const n = sac.filter && sac.filter.nameIncludes;
    if (Array.isArray(n) && n[0]) return n[0];
    if (typeof n === 'string' && n) return n;
    return 'Avatar';
  }
  /* เงื่อนไข/ค่าใช้จ่ายของ React ดักโจมตี (เช่น เพื่อชาติต้องเซ่นรถถัง) — คืนข้อความ deny หรือ null ถ้าใช้ได้ */
  function enemyDeclareAttackDeny(st, owner, abs, cardName) {
    if (!abs || !abs.length) return `ใช้ "${cardName}" ไม่ได้`;
    for (let i = 0; i < abs.length; i++) {
      const ab = abs[i];
      if (ab.requireBothHaveAvatar) {
        if (!(st.zones['A.avatar'] || []).length || !(st.zones['B.avatar'] || []).length)
          return `ใช้ "${cardName}" ไม่ได้ — ต้องมี Avatar ทั้งสองฝ่าย`;
      }
      if (ab.requireOwnNameIncludes) {
        const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes));
        if (!ok) return `ใช้ "${cardName}" ไม่ได้ — ต้องมี Avatar ชื่อมี "${ab.requireOwnNameIncludes}" บนสนาม`;
      }
      if (ab.requireCritical && !inCritical(st, owner))
        return `ใช้ "${cardName}" ได้เมื่ออยู่ในสถานะสาหัสเท่านั้น`;
      {
        const millCost = (normalizeAbilityCost(ab.cost) || []).find(c => c && c.op === 'mill');
        if (millCost) {
          const n = millCost.count || 1;
          const who = millCost.who === 'opp' ? other(owner) : owner;
          if ((st.zones[who + '.deck'] || []).length < n)
            return `ใช้ "${cardName}" ไม่ได้ — เด็คไม่พอธรณีสูบ ${n} ใบ`;
        }
      }
      if (!sacrificeCostOk(st, owner, ab.cost, null)) {
        return `ใช้ "${cardName}" ไม่ได้ — ไม่มี "${abilitySacrificeNeed(ab.cost)}" ให้เซ่นไหว้`;
      }
    }
    // ริกกี้ ฯลฯ: React ที่ผลแค่ทำลาย/ลดผู้โจมตี — ใช้ไม่ได้ถ้าผู้โจมตีกัน Magic
    const atk = st.pending && st.pending.atk;
    if (atk && isImmuneOppMagicTarget(st, atk)) {
      const ops = [];
      abs.forEach(ab => (ab.actions || []).forEach(ac => { if (ac && ac.op) ops.push(ac.op); }));
      const onlyAtk = ops.length > 0 && ops.every(op => op === 'destroyAttacker' || op === 'sendAttackerToHell' || op === 'weakenAttacker');
      if (onlyAtk)
        return `ใช้ "${cardName}" ไม่ได้ — "${nameOf(st, atk)}" ไม่รับผลจาก Magic ฝ่ายตรงข้าม`;
    }
    {
      const ops = [];
      abs.forEach(ab => (ab.actions || []).forEach(ac => { if (ac && ac.op) ops.push(ac.op); }));
      if (ops.includes('bounceAttackTarget')) {
        const def = st.pending && st.pending.def;
        if (!(def && st.inst[def] && (zoneOf(st, def) || '').endsWith('.avatar') && ownerOf(st, def) === owner))
          return `ใช้ "${cardName}" ไม่ได้ — ต้องมี Avatar ฝ่ายเราถูกโจมตี`;
      }
    }
    return null;
  }

  function isImmuneOppMagicTarget(st, k) {
    const c = st.inst[k];
    if (!c) return false;
    if (c.immuneOppMagicUntil) return true; // วีรชนชีวภาพ ฯลฯ จ่าย Cost แล้วกันเวทชั่วคราว
    const e = fxId(st, k);
    return !!(e && e.immuneOppMagicTarget);
  }
  /* Magic ของอีกฝ่ายเล็งไม่ได้ — bounce/เปิดหน้าต่าง ต้องเคารพธงเดียวกับ chooseDestroy */
  function blockedByOppMagicImmune(st, chooser, k, srcK) {
    if (!chooser || !k || chooser === ownerOf(st, k)) return false;
    if (!isImmuneOppMagicTarget(st, k)) return false;
    if (!srcK) return false;
    const src = st.inst[srcK];
    if (src && src.type && src.type !== 'Magic') return false;
    return true;
  }
  /* ทำลายด้วย Magic ของอีกฝ่าย — ให้ destroyCard เคารพ immuneOppMagicTarget */
  function destroyOptsFromMagic(st, srcK, targetK) {
    const src = st.inst[srcK];
    if (!src) return {};
    if (src.type !== 'Magic') return destroyOptsFromSrc(st, srcK, targetK);
    return destroyOptsFromSrc(st, srcK, targetK);
  }

  /* การ์ดสวนกลับที่เล่นได้ตอนนี้ (React ที่ดักโจมตี) สำหรับฝ่าย owner — ใช้โชว์กล่องสวนกลับฝั่ง client */
  function counterOptions(st, owner) {
    if (!st.pending || st.pending.target !== owner) return [];
    if (st.pending.blockReact) return [];
    return (st.zones[owner + '.hand'] || []).filter(k => {
      const c = st.inst[k];
      if (!c || c.type !== 'Magic') return false;
      const abs = abilitiesOf(c.code, 'enemyDeclareAttack', c.name);
      const fightAbs = abilitiesOf(c.code, 'ownAvatarFights', c.name);
      if (!abs.length && !fightAbs.length) return false;
      if (reactQuotaBlocks(st, owner, c)) return false;
      if (oncePerTurnCardBlocked(st, k, owner)) return false;
      if (abs.length && enemyDeclareAttackDeny(st, owner, abs, c.name)) return false;
      return true;
    });
  }

  /* React ที่เล่นได้ตอนถูกโจมตีแม้ไม่มี trigger enemyDeclareAttack (ฮึบ / ไปคุยกับรากมะม่วง)
     ไม่รวม อย่าให้มีครั้งที่ 2 — ใบนั้นขัดได้เฉพาะตอนคู่ต่อสู้ใช้ React */
  function reactAnyWindowHand(st, owner) {
    if (!st.pending || st.pending.target !== owner) return [];
    if (st.pending.blockReact) return [];
    return (st.zones[owner + '.hand'] || []).filter(k => {
      const c = st.inst[k];
      if (!c || c.type !== 'Magic' || magicSubtype(c) !== 'React') return false;
      const e = fxCard(c);
      const ab0 = abilitiesOf(c.code, 'activated', c.name)[0];
      const any = (e && e.reactAnyWindow) || (ab0 && ab0.reactAnyWindow);
      if (!any) return false;
      if (reactQuotaBlocks(st, owner, c)) return false;
      if (oncePerTurnCardBlocked(st, k, owner)) return false;
      const needle = (ab0 && ab0.requireOnlyNameIncludes) || (e && e.requireOnlyNameIncludes);
      if (needle) {
        const avs = st.zones[owner + '.avatar'] || [];
        if (!avs.length || avs.some(id => !nameMatches(st.inst[id], needle))) return false;
      }
      // ไปคุยกับรากมะม่วง ฯลฯ — ไม่มีเป้าเซ่น (มะม่วง) อย่ายื่นให้ใช้
      if (ab0 && !sacrificeCostOk(st, owner, ab0.cost, k)) return false;
      return true;
    });
  }
  function attackReactOptions(st, owner) {
    const a = counterOptions(st, owner);
    reactAnyWindowHand(st, owner).forEach(k => { if (!a.includes(k)) a.push(k); });
    return a;
  }

  /* Avatar ที่ใช้โล่มนุษย์ได้ตอนถูกโจมตี — โชว์ในแถบโจมตี / ให้รอตอบก่อนปะทะ */
  function humanShieldOptions(st, owner) {
    if (!st.pending || st.pending.target !== owner) return [];
    const atk = st.pending.atk;
    if (atk && st.inst[atk]) {
      for (const id in st.inst) {
        const m = st.inst[id];
        if (!m || m.attachedTo !== atk) continue;
        const me = fxCard(m);
        if (me && me.hostBlockHumanShield) return [];
      }
    }
    return (st.zones[owner + '.avatar'] || []).filter(k => {
      const c = st.inst[k];
      if (!c || !c.faceUp || c.tapped) return false;
      if (cannotChangeState(st, k)) return false;
      if (k === st.pending.def) return false;
      return hasKw(st, k, 'โล่มนุษย์');
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
      const filt = {
        type: p.ftype || 'Avatar',
        symbol: p.fsymbol || undefined,
        nameIncludes: p.fnameIncludes || undefined,
        _srcK: p.src || undefined
      };
      ['A', 'B'].forEach(s => (st.zones[s + '.avatar'] || []).forEach(k => {
        if (p.side === 'own' && s !== p.chooser) return;
        if (blockedByOppMagicImmune(st, p.chooser, k, p.src)) return;
        if (isUntargetableByOppAbility(st, k, p.chooser)) return;
        if (matchFilterEx(st, k, filt)) out.push(k);
      }));
      return out;
    }
    if (p.kind === 'chooseDiscard')
      return (st.zones[p.chooser + '.hand'] || []).filter(k => {
        if (p.excludeIds && p.excludeIds.includes(k)) return false;
        if (!matchFilterEx(st, k, p.filter)) return false;
        // GEM พอดี: ห้ามเลือกใบที่ทำให้เกินเป้าหมาย
        if (p.gemSumExact && p.gemSumMin != null) {
          const g = +(st.inst[k] && st.inst[k].gem) || 0;
          if ((p.gemGot || 0) + g > p.gemSumMin) return false;
        }
        return true;
      });
    if (p.kind === 'chooseDestroy') {
      const out = [];
      const filt = Object.assign({}, p.filter || {}, p.src ? { _srcK: p.src } : {});
      (p.zones || ['magic', 'land']).forEach(zn => {
        if (zn === 'land') (st.zones['land'] || []).forEach(k => {
          if (!matchFilterEx(st, k, filt)) return;
          if (p.side === 'enemy' || p.side === 'own') {
            const ctrl = landControllerOf(st, k, null);
            if (!ctrl) return;
            if (p.side === 'enemy' && ctrl === p.chooser) return;
            if (p.side === 'own' && ctrl !== p.chooser) return;
          }
          if (isUntargetableByOppAbility(st, k, p.chooser)) return;
          out.push(k);
        });
        else ['A', 'B'].forEach(s => {
          if (p.side === 'enemy' && s === p.chooser) return;
          if (p.side === 'own' && s !== p.chooser) return;
          (st.zones[s + '.' + zn] || []).forEach(k => {
            if (!matchFilterEx(st, k, filt)) return;
            // ริกกี้ / วีรชนชีวภาพ: ไม่ให้เลือกเป็นเป้า Magic ศัตรู
            if (p.fromOppMagic && isImmuneOppMagicTarget(st, k)) return;
            if (blockedByOppMagicImmune(st, p.chooser, k, p.src)) return;
            if (isUntargetableByOppAbility(st, k, p.chooser)) return;
            if (!p.ignoreProtect && protectedFromOppLeave(st, k, p.chooser)) return;
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
      else if (p.from === 'anyHell')
        pool = (st.zones['A.hell'] || []).concat(st.zones['B.hell'] || []).filter(x => x !== p.src);
      else if (p.from === 'deckOrHell') {
        pool = (st.zones[p.chooser + '.deck'] || []).slice()
          .concat((st.zones[p.chooser + '.hell'] || []).filter(x => x !== p.src));
      }
      else if (p.from === 'dark') pool = (st.zones[p.chooser + '.dark'] || []).filter(x => x !== p.src);
      else if (p.from === 'ownAvatars') pool = (st.zones[p.chooser + '.avatar'] || []).filter(x => p.includeSelf || x !== p.src);
      else if (p.from === 'enemyAvatars') pool = (st.zones[other(p.chooser) + '.avatar'] || []).slice();
      else if (p.from === 'allAvatars') pool = [...(st.zones['A.avatar'] || []), ...(st.zones['B.avatar'] || [])].filter(x => p.includeSelf || x !== p.src);
      else if (p.from === 'ownHand') {
        pool = (st.zones[p.chooser + '.hand'] || []).slice();
        if (p.excludeIds && p.excludeIds.length) pool = pool.filter(k => !p.excludeIds.includes(k));
      }
      else if (p.from === 'ownMagic') {
        pool = (st.zones[p.chooser + '.magic'] || []).filter(x => p.includeSelf || x !== p.src);
        if (p.excludeIds && p.excludeIds.length) pool = pool.filter(k => !p.excludeIds.includes(k));
      }
      return pool.filter(k => {
        const filt = Object.assign({}, p.filter || {}, p.src ? { _srcK: p.src } : {});
        if (!matchFilterEx(st, k, filt)) return false;
        if (blockedByOppMagicImmune(st, p.chooser, k, p.src)) return false;
        if ((p.dest === 'bounceHand' || p.dest === 'hell' || p.dest === 'dark') && protectedFromOppLeave(st, k, p.chooser)) return false;
        if (p.requireUntapped && !(st.inst[k] && !st.inst[k].tapped)) return false;
        if (p.magicMax != null && st.inst[k] && st.inst[k].type === 'Magic' && (p.magicGot || 0) >= p.magicMax) return false;
        if (p.distinctNames && (p.pickedNames || []).includes((st.inst[k] && st.inst[k].name) || '')) return false;
        if (p.dest === 'avatar' && (p.from === 'hell' || p.from === 'anyHell' || p.from === 'deckOrHell') && noHellSummonCard(st, k))
          return false;
        if (p.dest === 'avatar' && (zoneOf(st, k) || '').endsWith('.deck') && deckSummonBlocked(st))
          return false;
        if (p.dest === 'avatar' && p.mustPayRemain && (p.costReduce || 0)) {
          const remain = Math.max(0, effCost(st, k) - (p.costReduce || 0));
          if (remain > 0 && handGemUsableToward(st, p.chooser, k, [k]) < remain) return false;
        }
        if (p.dest === 'payRemainSummon' && p.summonK) {
          if (k === p.summonK) return false;
          if ((p.payIds || []).includes(k)) return false;
          if (gemUsableTowardSummon(st, k, p.summonK) <= 0) return false;
          const nextPay = (p.payIds || []).concat([k]);
          if (gemPayDenyMsg(st, nextPay, p.summonK, p.need)) return false;
        }
        if (p.costSumMax != null && (p.costGot || 0) + effCost(st, k) > p.costSumMax) return false;
        if (p.dest === 'attachTo' && p.attachMod && st.inst[p.attachMod]) {
          const mod = st.inst[p.attachMod];
          if (attachOnlyDeny(st, mod.code, k, mod.name)) return false;
        }
        // ก่อสร้าง Construct — ซ่อนใบที่ชื่อซ้ำกับที่มีบน Construct Zone แล้ว
        if ((p.dest === 'buildConstructFree' || p.dest === 'hellBuildConstruct') && st.inst[k]) {
          if (quotaDeny(st, p.chooser + '.construct', st.inst[k])) return false;
        }
        return true;
      });
    }
    return [];
  }

  function walkEffectActions(actions, fn) {
    (actions || []).forEach(ac => {
      if (!ac) return;
      fn(ac);
      if (ac.then) walkEffectActions(Array.isArray(ac.then) ? ac.then : [ac.then], fn);
      if (ac.actions) walkEffectActions(ac.actions, fn);
      (ac.options || []).forEach(opt => walkEffectActions(opt && opt.actions, fn));
    });
  }

  function actionFreesOwnAvatarSlot(ac) {
    if (!ac) return false;
    if (ac.op === 'sacrifice' || ac.op === 'bounceOwnThenSummonSelf' || ac.op === 'naraiFormSummon') return true;
    if ((ac.op === 'destroy' || ac.op === 'destroyTarget') && (ac.target === 'self' || ac.from === 'own')) return true;
    if ((ac.op === 'bounce' || ac.op === 'returnToHand') && (ac.target === 'self' || ac.from === 'own')) return true;
    if (ac.op === 'exileSelf' || (ac.op === 'exile' && ac.target === 'self')) return true;
    return false;
  }
  function actionSummonsToField(ac) {
    if (!ac) return false;
    if (ac.op === 'summon' || ac.op === 'summonToken' || ac.op === 'handSummon'
      || ac.op === 'summonSelfFromHell' || ac.op === 'summonSelfFromMagic'
      || ac.op === 'summonSelfFromHandFree' || ac.op === 'summonSelfFromHandPaying'
      || ac.op === 'summonSelfFromDark') return true;
    return ac.dest === 'avatar' || ac.dest === 'multiAvatar';
  }
  function summonQuotaDummy(st, ac, srcK) {
    if (ac.op === 'summonToken') return { type: 'Avatar', symbol: ac.symbol || '', isToken: true };
    if (ac.op && String(ac.op).indexOf('summonSelf') === 0 && srcK && st.inst[srcK]) return st.inst[srcK];
    const f = ac.filter || {};
    return { type: f.type || 'Avatar', symbol: f.symbol || '' };
  }
  /* เทค/เวทที่อัญเชิญลง Avatar Zone — ห้ามใช้ถ้าสนามเต็ม (ยกเว้นเซ่น/เด้งฝ่ายเราก่อน แล้วมีช่อง) */
  function fieldSummonDeny(st, owner, spec, srcK) {
    if (!st || !owner || !spec) return null;
    const costs = normalizeAbilityCost(spec.cost) || (Array.isArray(spec.cost) ? spec.cost : (spec.cost ? [spec.cost] : []));
    if (costs.some(actionFreesOwnAvatarSlot)) return null;
    let freed = false;
    let msg = null;
    const walk = (actions) => {
      (actions || []).forEach(ac => {
        if (msg || !ac) return;
        if (ac.op === 'chooseMode') return;
        const thenActs = Array.isArray(ac.then) ? ac.then : (ac.then ? [ac.then] : []);
        if (actionFreesOwnAvatarSlot(ac)) {
          freed = true;
          walk(thenActs);
          walk(ac.actions);
          return;
        }
        if (!freed && actionSummonsToField(ac)) {
          const qd = quotaDeny(st, owner + '.avatar', summonQuotaDummy(st, ac, srcK));
          if (qd) msg = qd + ' — อัญเชิญลงสนามไม่ได้';
          return;
        }
        walk(thenActs);
        walk(ac.actions);
      });
    };
    walk(spec.actions);
    return msg;
  }

  /** ห้ามเล่น/สั่งใช้ถ้าฮีลไม่มีไลฟ์หงาย หรือเด้งศัตรูโดยอีกฝ่ายไม่มีมอน */
  function activatedTargetDeny(st, owner, ab, srcK) {
    if (!ab || !owner) return null;
    {
      const fd = fieldSummonDeny(st, owner, ab, srcK);
      if (fd) return fd;
    }
    if (ab.requireHandFilter) {
      const hand = (st.zones[owner + '.hand'] || []).filter(id => matchFilterEx(st, id, ab.requireHandFilter));
      if (!hand.length) return 'ไม่มี Avatar เรื่องราว Cost 6 ในมือให้แสดง';
    }
    let msg = null;
    walkEffectActions(ab.actions, ac => {
      if (msg) return;
      if (ac.op === 'unrevealOwnLife' || ac.op === 'unrevealMarkedLife') {
        if (inCritical(st, owner)) { msg = 'สถานะสาหัส ฮีล LIFE ไม่ได้'; return; }
        if ((st.zones['land'] || []).some(id => fxId(st, id) && fxId(st, id).blockLifeUnreveal)) {
          msg = 'LIFE ไม่สามารถคว่ำกลับได้';
          return;
        }
        const faceUp = (st.zones[owner + '.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp);
        if (ac.op === 'unrevealMarkedLife') {
          const mark = ac.mark || 'naw';
          if (!faceUp.some(id => st.inst[id] && st.inst[id].lifeMark === mark))
            msg = 'ไม่มี LIFE ที่หงายให้ฮีล';
        } else if (!faceUp.length) {
          msg = 'ไม่มี LIFE ที่หงายให้ฮีล';
        }
        return;
      }
      if (ac.optional) return;
      const bounceEnemy = (ac.op === 'bounce' || ac.op === 'returnToHand')
        && ac.target !== 'self' && ac.from !== 'own' && ac.from !== 'any';
      const pickEnemyBounce = ac.op === 'pick' && ac.from === 'enemy'
        && (ac.dest === 'bounceHand' || !ac.dest);
      if (bounceEnemy || pickEnemyBounce) {
        const p = {
          kind: 'pick', from: 'enemyAvatars', src: srcK || null, chooser: owner,
          filter: ac.filter || { type: 'Avatar' }, dest: 'bounceHand', optional: true
        };
        if (!promptCandidates(st, p).length) {
          const any = (st.zones[other(owner) + '.avatar'] || []).length;
          msg = any ? 'เป้าหมายไม่รับผลจาก Magic ฝ่ายตรงข้าม' : 'อีกฝ่ายไม่มี Avatar บนสนาม';
        }
      }
      // ฮันโซ / ชิโยเมะ / โกเอมอน — ต้องมีนินจาบนสนามก่อนสั่งใช้จากมือ (deny ก่อนเคลม once-per-turn กันบอทวน)
      if (ac.op === 'bounceOwnThenSummonSelf') {
        const need = ac.count || 1;
        const filter = Object.assign({ type: 'Avatar' }, ac.filter || {});
        const cands = (st.zones[owner + '.avatar'] || []).filter(id => matchFilterEx(st, id, filter));
        if (cands.length < need)
          msg = `ต้องมี Avatar ตรงเงื่อนไข ≥ ${need} ใบบนสนาม (มี ${cands.length})`;
        return;
      }
      // ความกล้าหาญ ฯลฯ — เลือก Avatar บนสนามฝ่ายเรา
      if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'choose') {
        const p = {
          kind: 'chooseBuff', src: null, chooser: owner,
          amt: ac.amount, side: (ac.target.side) || 'any',
          ftype: ac.target.type || 'Avatar', fsymbol: ac.target.symbol || ''
        };
        if (!promptCandidates(st, p).length) {
          msg = (ac.target.side === 'own') ? 'ไม่มี Avatar บนสนามฝ่ายเรา' : 'ไม่มีเป้าหมายให้เลือก';
        }
      }
    });
    return msg;
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
      const e = fxCard(m);
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

  /* ยักษ์หินแผ่นดินใหญ่: ยักษ์ฝ่ายเราโดน Magic เล็ง → เสนอให้นอนยักษ์หินแล้วเปลี่ยนเป้ามาที่ตัวเอง */
  function offerMagicRedirect(st, fx, targetK, p) {
    if (st._skipMagicRedirect) return false;
    if (st.prompts.some(x => x.kind === 'magicRedirect')) return false;
    const src = p && p.src ? st.inst[p.src] : null;
    if (!src || src.type !== 'Magic') return false;
    const tgt = st.inst[targetK];
    if (!tgt || !(zoneOf(st, targetK) || '').endsWith('.avatar')) return false;
    const side = ownerOf(st, targetK);
    if (side !== 'A' && side !== 'B') return false;
    const shields = (st.zones[side + '.avatar'] || []).filter(id => {
      if (id === targetK) return false;
      const c = st.inst[id];
      if (!c || c.tapped || !c.faceUp) return false;
      const e = fxCard(c);
      if (!e || !e.redirectMagicTargetToSelf) return false;
      const needSym = e.redirectMagicIfSymbol || 'ยักษ์';
      return cardSymbols(st, targetK).includes(needSym);
    });
    if (!shields.length) return false;
    const shield = shields[0];
    st._magicRedirectPending = { promptKind: p.kind, chooser: p.chooser, origTarget: targetK };
    st.prompts.unshift({
      kind: 'magicRedirect', shield, origTarget: targetK, chooser: side,
      magicSrc: p.src, optional: true
    });
    addLog(st, side, `🛡️ ${nameOf(st, shield)}: "${nameOf(st, targetK)}" ถูกเวท "${src.name}" เล็ง — นอนรับเป้าแทนไหม?`);
    fx.snd = 'tap';
    return true;
  }

  function applyMagicPromptOnTarget(st, fx, p, targetK, rng) {
    if (p.kind === 'chooseBuff') {
      if (p.until === 'permanent') {
        st.inst[targetK].powerDelta = (st.inst[targetK].powerDelta || 0) + (p.amt || 0);
        st.inst[targetK].powerDeltaFrom = st.inst[targetK].powerDeltaFrom || [];
        st.inst[targetK].powerDeltaFrom.push({ amt: p.amt || 0, from: p.src, fromName: nameOf(st, p.src) });
        if (p.amt > 0) notePowerBuff(st, targetK, p.amt);
        addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, targetK)} POWER ${p.amt > 0 ? '+' : ''}${p.amt} (ถาวรจนออกสนาม) → P${effPower(st, targetK)}`);
      } else {
        st.buffs.push({ k: targetK, amt: p.amt, until: p.until || 'endOfTurn', from: p.src });
        if (p.amt > 0) notePowerBuff(st, targetK, p.amt);
        addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, targetK)} POWER ${p.amt > 0 ? '+' : ''}${p.amt}${p.until === 'oppNextEnd' ? ' จน End Phase ถัดไปของฝ่ายตรงข้าม' : ' จนจบเทิร์น'} → P${effPower(st, targetK)}`);
      }
      if (p.destroyAtEnd) {
        st.scheduled.push({ player: st.active, op: 'destroyCard', k: targetK, when: 'endPhase' });
        addLog(st, 'S', `${nameOf(st, targetK)} จะถูกทำลายช่วง End Phase`);
      }
      // ทรายดูด: ลด POWER เหลือ 0 → ทำลายทันที (ไม่รอจบ action)
      sweepDestroyPowerZero(st, fx);
      if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
      fx.snd = 'tap';
      return;
    }
    if (p.kind === 'chooseDestroy') {
      addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ทำลาย ${nameOf(st, targetK)}`);
      destroyCard(st, fx, targetK, p.ignoreProtect ? { ignoreProtect: true } : destroyOptsFromMagic(st, p.src, targetK));
      if (p.afterAlienGive) {
        (p.alienRevealed || []).forEach(k => { if (st.inst[k]) delete st.inst[k].revealed; });
        pushAlienGive(st, p.src, p.chooser);
      } else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
      fx.snd = 'clash';
    }
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

  /* รวบรวม React ในมือ/เซ็ตที่ตอบ trigger ได้ (ยังไม่ใช้ประเภท React ในเทิร์น · ยกเว้นใบข้ามโควต้า / Skill เพิ่มจากครุฑ) */
  function collectReactOptions(st, owner, triggerOn, filterFn, reqOpts) {
    const out = [];
    const consider = (m, allowFacedown) => {
      const mc = st.inst[m]; if (!mc) return;
      if (mc.type !== 'Magic' || magicSubtype(mc) !== 'React') return;
      if (!abilitiesOf(mc.code, triggerOn, mc.name).length) return;
      if (reactQuotaBlocks(st, owner, mc)) return;
      if (oncePerTurnCardBlocked(st, m, owner)) return;
      const ab = abilitiesOf(mc.code, triggerOn, mc.name)[0];
      if (ab && !reactFieldReqOk(st, owner, ab, reqOpts)) return;
      if (ab && !sacrificeCostOk(st, owner, ab.cost, m)) return;
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
    let rab = abilitiesOf(c.code, triggerOn, c.name)[0];
    if (!rab && p.reactTriggerAlt) rab = abilitiesOf(c.code, p.reactTriggerAlt, c.name)[0];
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
    const options = collectReactOptions(st, opp, 'enemyActivateAbility', null, { targetK: avatarK });
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
  function applyInnerAction(st, fx, action) {
    const inner = applyAction(st, action);
    if (!inner) return;
    Object.keys(inner).forEach(key => {
      if (key === '_rng') return;
      fx[key] = inner[key];
    });
  }
  function abilityReactContinuesAttack(pend) {
    return !!(pend && (pend.type === 'declareAtkAuto' || pend.type === 'defenderAtkAuto' || pend.type === 'whenAttackedAuto'));
  }
  function noteAbilityReactCancel(st, targetK) {
    const pend = st._pendingAbility;
    if (abilityReactContinuesAttack(pend)) pend.cancelled = true;
    else delete st._pendingAbility;
    addLog(st, 'S', `ยกเลิกความสามารถของ ${nameOf(st, targetK)}`);
  }
  function resumeAbilityReactIfNeeded(st, fx, rng) {
    if (!st._pendingAbility) return;
    const pend = st._pendingAbility; delete st._pendingAbility;
    resumeAbilityReactPending(st, fx, pend, rng);
  }
  function resumeAbilityReactPending(st, fx, pend, rng) {
    if (!pend) return;
    if (pend.cancelled) {
      addLog(st, 'S', `ความสามารถถูกยกเลิกแล้ว — ไม่ทำงาน`);
      if (!abilityReactContinuesAttack(pend)) return;
    }
    if (pend.type === 'unity') {
      applyInnerAction(st, fx, { type: 'unity', k: pend.k, to: pend.to, by: pend.owner, _skipAbilityReact: true });
      return;
    }
    if (pend.type === 'humanShield') {
      applyInnerAction(st, fx, { type: 'humanShield', k: pend.k, by: pend.owner, _skipAbilityReact: true });
      return;
    }
    if (pend.type === 'backstab') {
      applyInnerAction(st, fx, { type: 'backstab', k: pend.k, to: pend.to, by: pend.owner, _skipAbilityReact: true });
      return;
    }
    if (pend.type === 'declareAtkAuto') {
      applyInnerAction(st, fx, {
        type: 'declareAttack', atk: pend.atkId, def: pend.def, life: pend.life, by: pend.owner,
        _resumeAfterAtkAuto: true, _skipAtkBuffs: !!pend.cancelled
      });
      return;
    }
    if (pend.type === 'whenAttackedAuto') {
      if (!pend.cancelled) {
        abil(st, pend.src, 'whenAttacked').forEach(ab =>
          runActions(st, fx, ab.actions || [], { src: pend.src, owner: pend.owner, rng }));
      }
      return;
    }
    if (pend.type === 'defenderAtkAuto') {
      applyInnerAction(st, fx, {
        type: 'declareAttack', atk: pend.atkId, def: pend.def, life: pend.life, by: pend.atkOwner,
        _resumeAfterDefAuto: true, _skipDefBuffs: !!pend.cancelled, _blockReact: !!pend.blockReact
      });
      return;
    }
  }

  function superAirCostIds(st, owner, spec) {
    spec = spec || {};
    const needle = spec.nameIncludesExtra || 'Super Air';
    const need = spec.names || [];
    return (st.zones[owner + '.avatar'] || []).filter(id => {
      const n = (st.inst[id] && st.inst[id].name) || '';
      return n.includes(needle) || need.some(nm => n === nm || n.includes(nm));
    });
  }
  function sacNamedUniqueOk(st, owner, spec) {
    spec = spec || {};
    const ids = superAirCostIds(st, owner, spec);
    const names = [];
    ids.forEach(id => {
      const n = (st.inst[id] && st.inst[id].name) || '';
      if (n && names.indexOf(n) < 0) names.push(n);
    });
    const total = spec.totalUnique || 4;
    if (names.length < total) return false;
    return (spec.names || []).every(nm => names.some(n => n === nm || n.includes(nm)));
  }
  function makeSacNamedUniquePrompt(st, srcK, owner, spec, actions) {
    const ids = superAirCostIds(st, owner, spec).slice();
    return {
      kind: 'pick', from: 'ids', ids, src: srcK, chooser: owner, filter: {},
      dest: 'sacNamedUnique', actions: actions || [], optional: false, allowAnyZone: true,
      needNames: (spec.names || []).slice(),
      extraNeedle: spec.nameIncludesExtra || 'Super Air',
      totalUnique: spec.totalUnique || 4,
      got: [], gotNames: {},
      afterCostKind: paidCostKind(st, srcK)
    };
  }

  /* จ่ายค่า + รันผลสั่งใช้ (หลังจ่ายคอสแล้วค่อยเชาว์/ชาย ตามชนิดต้นทาง) */
  function payCostAndRunActivated(st, fx, owner, srcK, costList, actions, rng, onceTag, afterOpts) {
    costList = costList || [];
    actions = actions || [];
    const actCtx = { src: srcK, owner, rng, onceTag: onceTag || null };
    const afterKind = (afterOpts && afterOpts.kind) || paidCostKind(st, srcK);
    const contBase = Object.assign({
      src: srcK, owner, actions, keepSrc: true, onceTag: onceTag || null, kind: afterKind
    }, afterOpts || {});
    const tagCost = (p) => Object.assign(p, { afterCostKind: afterKind, keepSrc: true });
    if (costList.length) {
      const costOp = costList[0];
      if (costOp.op === 'discard') {
        const filt = Object.assign({}, costOp.filter || {});
        if (costOp.gemMin != null) filt.gemMin = costOp.gemMin;
        const need = costOp.count || 1;
        const legal = (st.zones[owner + '.hand'] || []).filter(id => id !== srcK && matchFilterEx(st, id, filt));
        if (legal.length < need) {
          addLog(st, 'S', `จ่ายค่าไม่ได้ — ต้องทิ้งมือ ${need} ใบตรงเงื่อนไข (มี ${legal.length})`);
          return;
        }
        st.prompts.push(tagCost({ kind: 'chooseDiscard', src: srcK, chooser: owner, filter: filt, actions, effectDiscard: true, discardNeed: need > 1 ? need : undefined, discardGot: 0, excludeIds: [srcK] }));
        addLog(st, owner, `เลือกการ์ดในมือทิ้งเพื่อจ่ายค่า${need > 1 ? ` (${need} ใบ)` : ''}`);
      } else if (costOp.op === 'discardGemSum') {
        const need = costOp.min || 3;
        const exact = !!costOp.exact;
        st.prompts.push(tagCost({
          kind: 'chooseDiscard', src: srcK, chooser: owner,
          filter: { gemMin: 1 }, excludeIds: [srcK],
          gemSumMin: need, gemSumExact: exact, gemGot: 0, actions, effectDiscard: true
        }));
        addLog(st, owner, exact
          ? `ทิ้งมือรวม GEM ให้พอดี ${need} (ห้ามทิ้งใบไม่มี GEM)`
          : `ทิ้งมือรวม GEM ≥ ${need} (ห้ามทิ้งใบไม่มี GEM)`);
      } else if (costOp.op === 'paySelfCostMinus') {
        const minus = costOp.minus != null ? costOp.minus : 1;
        const before = effCost(st, srcK);
        st.inst[srcK].costDelta = (st.inst[srcK].costDelta || 0) - minus;
        const after = effCost(st, srcK);
        addLog(st, owner, `จ่ายค่า: ${nameOf(st, srcK)} Cost −${minus} (${before} → ${after})`);
        continueAfterPaidCost(st, fx, contBase, rng);
      } else if (costOp.op === 'returnHandToDeck') {
        st.prompts.push(tagCost({ kind: 'chooseDiscard', src: srcK, chooser: owner, filter: costOp.filter, actions, toDeck: true, effectDiscard: true }));
      } else if (costOp.op === 'sacrifice') {
        const filt = Object.assign({}, costOp.filter || {}, { _srcK: srcK });
        st.prompts.push(tagCost({ kind: 'pick', from: 'ownAvatars', src: srcK, chooser: owner, filter: filt, dest: 'sacrifice', actions, optional: false, keepSrc: true }));
      } else if (costOp.op === 'sacNamedUnique') {
        if (!sacNamedUniqueOk(st, owner, costOp)) {
          addLog(st, 'S', `จ่ายค่าไม่ได้ — ต้องส่ง Super Air ชื่อไม่ซ้ำครบ ${costOp.totalUnique || 4} ใบ (รวมชื่อบังคับ)`);
          return;
        }
        st.prompts.push(makeSacNamedUniquePrompt(st, srcK, owner, costOp, actions));
        addLog(st, owner, `รหัสดำ: เลือก Super Air ชื่อไม่ซ้ำ ${costOp.totalUnique || 4} ใบส่งนรก`);
      } else if (costOp.op === 'sendMagicToHell') {
        const need = costOp.count || 1;
        const filt = Object.assign({}, costOp.filter || {}, { _srcK: srcK, excludeSelf: true });
        const p = tagCost({
          kind: 'pick', from: 'ownMagic', src: srcK, chooser: owner, filter: filt,
          dest: 'magicToHellCost', need, got: 0, actions, optional: false,
          excludeIds: [srcK]
        });
        if (promptCandidates(st, p).length < need) addLog(st, 'S', `บน Magic Zone ไม่ครบ ${need} ใบให้ส่งนรก`);
        else {
          st.prompts.push(p);
          addLog(st, owner, `ส่งการ์ดบน Magic Zone ${need} ใบลงนรกเพื่อจ่ายค่า`);
        }
      } else if (costOp.op === 'exileHell') {
        const need = costOp.count || 1;
        st.prompts.push(tagCost({
          kind: 'pick', from: 'hell', src: srcK, chooser: owner, filter: {},
          dest: 'exileHellCost', need, got: 0, actions, optional: false
        }));
        addLog(st, owner, `เนรเทศจากนรก ${need} ใบเพื่อจ่ายค่า`);
      } else if (costOp.op === 'exileHellDistinctNames') {
        st.prompts.push(tagCost({
          kind: 'pick', from: 'hell', src: srcK, chooser: owner,
          filter: { nameIncludes: [costOp.nameIncludes].filter(Boolean) },
          dest: 'exileDistinctCost', need: costOp.count || 3, got: 0, seenNames: {},
          actions, optional: false
        }));
        addLog(st, owner, `เนรเทศ "${costOp.nameIncludes}" ชื่อไม่ซ้ำ ${costOp.count || 3} จากนรก`);
      } else if (costOp.op === 'exileSelf') {
        doMove(st, srcK, owner + '.dark', null, fx);
        continueAfterPaidCost(st, fx, contBase, rng);
      } else if (costOp.op === 'exileDeckTop') {
        const d = st.zones[owner + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `เด็คว่าง — เนรเทศใบบนสุดไม่ได้`);
        else {
          const top = d[d.length - 1];
          doMove(st, top, owner + '.dark', null, fx);
          addLog(st, owner, `เนรเทศใบบนสุดของเด็ค (${nameOf(st, top)}) ลงมิติมืด`);
          continueAfterPaidCost(st, fx, contBase, rng);
        }
      } else if (costOp.op === 'exileHand') {
        const need = costOp.count || 1;
        const filt = costOp.filter || {};
        const p = tagCost({
          kind: 'pick', from: 'ownHand', src: srcK, chooser: owner, filter: filt,
          dest: 'dark', actions, optional: false, excludeIds: [srcK], onceTag: actCtx.onceTag || null
        });
        if (promptCandidates(st, p).length < need) addLog(st, 'S', 'ไม่มีมือตรงเงื่อนไขให้เนรเทศ');
        else {
          st.prompts.push(p);
          addLog(st, owner, `เนรเทศการ์ดจากมือ ${need} ใบลงมิติมืดเพื่อจ่ายค่า`);
        }
      } else if (costOp.op === 'mill') {
        const n = costOp.count || 1;
        const who = costOp.who === 'opp' ? other(owner) : owner;
        if ((st.zones[who + '.deck'] || []).length < n) {
          addLog(st, 'S', `จ่ายค่าไม่ได้ — เด็คไม่พอธรณีสูบ ${n} ใบ`);
          if (actCtx.onceTag) unclaimOncePerTurn(st, srcK, actCtx.onceTag);
          return;
        }
        mill(st, fx, who, n, rng, 0, srcK);
        addLog(st, owner, `จ่ายค่า: ธรณีสูบ ${n} ใบ`);
        continueAfterPaidCost(st, fx, contBase, rng);
      } else runActions(st, fx, actions, actCtx);
    } else {
      runActions(st, fx, actions, actCtx);
    }
  }

  /* การ์ดในมือที่ยกเลิก Magic/React ได้ (ชายจากอนาคต · อย่าให้มีครั้งที่ 2 ฯลฯ) */
  function cardHasNegateOp(code, triggerOn, nameHint) {
    return abilitiesOf(code, triggerOn, nameHint).some(ab => (ab.actions || []).some(ac => ac.op === 'negate'));
  }
  function ignoresReactTypeLimit(c) {
    if (!c) return false;
    const e = fxCard(c);
    if (e && e.ignoreReactOncePerTurnLimit) return true;
    // กันรีปริ้น/effects ค้าง — ชื่อการ์ดบอกชัดว่าใช้ได้แม้ใช้ React ไปแล้ว
    return /อย่าให้มีครั้งที่/.test(c.name || '');
  }
  /* Normal ที่ข้อความ/แฟล็กบอกให้วางค้าง Magic Zone — ไม่ลงนรกหลังใช้
     Modification / Land ไม่ใช่ one-shot (สวม / วาง Land แยก) */
  function magicStaysOnMagicZone(c) {
    if (!c || c.type !== 'Magic') return false;
    const sub = c.subtype || 'Normal';
    if (sub === 'Modification' || sub === 'Land') return true;
    const e = fxCard(c);
    if (e && (e.stayOnMagic || e.remainOnMagic)) return true;
    const txt = (c.effect || '') + ' ' + ((e && e.note) || '');
    return /นำการ์ดใบนี้\s*วางไว้|วางไว้บน\s*Magic\s*Zone|การ์ดใบนี้\s*วางไว้บน\s*Magic/.test(txt);
  }
  /* ใช้เวทแล้วลงนรก — Normal/React one-shot ที่ไม่ได้บอกให้ค้างโซน */
  function magicHellAfterPlay(c) {
    if (!c || c.type !== 'Magic') return false;
    const sub = c.subtype || 'Normal';
    if (sub === 'Modification' || sub === 'Land') return false;
    if (magicStaysOnMagicZone(c)) return false;
    return true;
  }
  /* oncePerTurnCard — การ์ดใบนี้ใช้ได้ 1 ครั้ง/เทิร์น (เช่น อย่าให้มีครั้งที่ 2) */
  function oncePerTurnCardKey(st, owner, tag) {
    const seq = st.turnSeq != null ? st.turnSeq : ((st.turn || 0) + ':' + (st.active || ''));
    return owner + ':' + seq + ':' + (tag || 'x');
  }
  function isOncePerTurnCardSpent(st, owner, tag) {
    st._oncePerTurnCard = st._oncePerTurnCard || {};
    return !!st._oncePerTurnCard[oncePerTurnCardKey(st, owner, tag)];
  }
  function markOncePerTurnCard(st, owner, tag) {
    st._oncePerTurnCard = st._oncePerTurnCard || {};
    st._oncePerTurnCard[oncePerTurnCardKey(st, owner, tag)] = true;
  }
  function oncePerTurnCardBlocked(st, handId, owner) {
    const c = st.inst[handId];
    const e = c && fxCard(c);
    if (!e || !e.oncePerTurnCard) return false;
    return isOncePerTurnCardSpent(st, owner, c.name || c.code);
  }

  /* นับเป็น React สำหรับ อย่าให้มีครั้งที่ 2 — รวมใบสวนที่ป้าย subtype ผิด (ไปเลยมอนตี้ / ชายจากอนาคต ฯลฯ) */
  function magicCountsAsReact(st, k) {
    const c = st.inst[k]; if (!c) return false;
    if (cardCountsAsReact(c)) return true;
    const pend = st._pendingMagic;
    if (pend && pend.src === k && pend.fromCounterAtk) return true;
    return false;
  }
  /**
   * ใบที่ขัดเวทได้ในมือ — targetMagicK กำหนดว่าเป้าหมายเป็น React หรือไม่
   * อย่าให้มีครั้งที่ 2 (enemyPlayReact เท่านั้น) ขัดได้เฉพาะ React
   * ชายจากอนาคต / enemyPlayMagic ขัดเมจิกธรรมดาและ React ได้
   */
  function canNegateMagicCard(st, handId, targetMagicK) {
    const c = st.inst[handId];
    if (!c || c.type !== 'Magic') return false;
    const targetIsReact = magicCountsAsReact(st, targetMagicK);
    const name = c.name || '';
    const hasPlayMagic = abilitiesOf(c.code, 'enemyPlayMagic', name).length > 0 || name.includes('ชายจากอนาคต');
    const onlyReactNegate = !hasPlayMagic && (
      cardHasNegateOp(c.code, 'enemyPlayReact', name)
      || name.includes('อย่าให้มีครั้งที่')
      || abilitiesOf(c.code, 'enemyPlayReact', name).length > 0
    );
    if (hasPlayMagic) return true;
    if (onlyReactNegate) return targetIsReact;
    if (magicSubtype(c) === 'React') {
      const act = abilitiesOf(c.code, 'activated', name)[0];
      if (act && (act.actions || []).some(ac => ac.op === 'negate')) return targetIsReact;
      if (/ยกเลิก/.test(c.effect || '')) return targetIsReact;
    }
    return false;
  }

  /* เสนอหน้าต่างขัดเวทเมื่อฝ่ายตรงข้ามใช้ Magic/React — ถามเสมอ (แม้ไม่มีใบขัดในมือ) · รอสูงสุด 10 วิ */
  function offerMagicNegateReact(st, fx, activator, magicK) {
    const opp = other(activator);
    if (!magicK || !st.inst[magicK]) return false;
    if (st.prompts.some(p => p.kind === 'react' && p.mode === 'negateMagic' && p.target === magicK)) return false;
    const options = [];
    (st.zones[opp + '.hand'] || []).forEach(m => {
      if (m === magicK) return;
      if (!canNegateMagicCard(st, m, magicK)) return;
      if (oncePerTurnCardBlocked(st, m, opp)) return;
      const c = st.inst[m];
      const sub = magicSubtype(c);
      const ignoreLim = ignoresReactTypeLimit(c);
      if (!ignoreLim && st.strict && st.magicUsed && st.magicUsed[opp] && st.magicUsed[opp][sub] && !(sub === 'React' && extraSkillReactOk(st, opp, c))) return;
      if (!ignoreLim && sub === 'React' && reactQuotaBlocks(st, opp, c)) return;
      options.push(m);
    });
    const magName = nameOf(st, magicK);
    const isReactMag = magicCountsAsReact(st, magicK);
    st.prompts.unshift({
      kind: 'react', mode: 'negateMagic', src: null, options, chooser: opp, target: magicK,
      actions: [], magicNegate: true,
      reactTrigger: isReactMag ? 'enemyPlayReact' : 'enemyPlayMagic',
      // alt เฉพาะเมื่อเป้าหมายเป็น React: ให้ชายจากอนาคต (enemyPlayMagic) ผูกได้
      // ไม่ใส่ alt สำหรับเมจิกธรรมดา — กันอย่าให้มีครั้งที่ 2 ผูกผ่าน enemyPlayReact โดยผิดพลาด
      reactTriggerAlt: isReactMag ? 'enemyPlayMagic' : null,
      seconds: 10,
      label: `ฝ่าย ${activator} ใช้ "${magName}"`
    });
    if (options.length) {
      addLog(st, opp, `รอขัดเวท (${options.length} ใบ): ฝ่าย ${activator} ใช้ "${magName}" — เลือกใบยกเลิก / ไม่ใช้ / รอ 10 วิ`);
    } else {
      addLog(st, opp, `รอขัดเวท: ฝ่าย ${activator} ใช้ "${magName}" — กดไม่ใช้หรือรอ 10 วิ`);
    }
    return true;
  }

  /* เสนอหน้าต่าง React เมื่อถูกประกาศโจมตี — มีใบสวน/React ยืดหยุ่นในมือถึงถาม · รอสูงสุด 10 วิ
     โล่มนุษย์ยังแตะ Avatar ที่กะพริบได้ระหว่างหน้าต่างนี้ */
  function offerAttackReact(st, fx, attackerSide, atkK) {
    const opp = other(attackerSide);
    if (!st.pending || st.pending.target !== opp) return false;
    if (st.pending.blockReact) return false;
    if ((st.prompts || []).some(p => p.kind === 'react' && p.reactTrigger === 'enemyDeclareAttack' && p.chooser === opp))
      return false;
    const options = attackReactOptions(st, opp);
    if (!options.length) return false;
    const atkName = nameOf(st, atkK);
    st.prompts.push({
      kind: 'react', mode: 'runActions', src: null, options, chooser: opp, target: atkK,
      actions: [], fromCounterAtk: true, reactTrigger: 'enemyDeclareAttack',
      seconds: 10,
      label: `ฝ่าย ${attackerSide} ประกาศโจมตีด้วย "${atkName}"`
    });
    addLog(st, opp, `รอ React (${options.length} ใบ): ฝ่าย ${attackerSide} ประกาศโจมตี "${atkName}" — เลือกใบ / ไม่ใช้ / รอ 10 วิ`);
    return true;
  }

  function ownFightReactOptions(st, owner) {
    if (!st.pending || st.pending.by !== owner) return [];
    return (st.zones[owner + '.hand'] || []).filter(k => {
      const c = st.inst[k];
      if (!c || c.type !== 'Magic') return false;
      if (!abilitiesOf(c.code, 'ownAvatarFights', c.name).length) return false;
      if (reactQuotaBlocks(st, owner, c)) return false;
      if (oncePerTurnCardBlocked(st, k, owner)) return false;
      return true;
    });
  }
  function offerOwnFightReact(st, fx, attackerSide, atkK) {
    if (!st.pending || st.pending.by !== attackerSide) return false;
    if ((st.prompts || []).some(p => p.kind === 'react' && p.reactTrigger === 'ownAvatarFights' && p.chooser === attackerSide))
      return false;
    const options = ownFightReactOptions(st, attackerSide);
    if (!options.length) return false;
    const atkName = nameOf(st, atkK);
    st.prompts.push({
      kind: 'react', mode: 'runActions', src: null, options, chooser: attackerSide, target: atkK,
      actions: [], fromCounterAtk: true, reactTrigger: 'ownAvatarFights',
      seconds: 10,
      label: `"${atkName}" ฝ่ายเราต่อสู้`
    });
    addLog(st, attackerSide, `รอ React (${options.length} ใบ): "${atkName}" ต่อสู้ — เลือกใบ / ไม่ใช้ / รอ 10 วิ`);
    return true;
  }

  /* ทำผลเวทที่ค้างไว้หลังคู่ต่อสู้กดไม่ใช้ชายจากอนาคต */
  function resolvePendingMagic(st, fx, pend, rng) {
    if (!pend) return;
    const r = rng || (() => 0.5);
    if (pend.type === 'poorModes') {
      runActions(st, fx, [{ op: 'choosePoorModes' }], { src: pend.src, owner: pend.owner, rng: r, toHellAfter: true });
      fireEnemyActivate(st, fx, pend.owner, r);
    } else if (pend.type === 'activated' && pend.actions) {
      // หลังถาม React แล้วยกเลิก — รันผลเลย (ไม่เปิดเชนถามซ้ำ)
      fireOwnPlayMagic(st, fx, pend.owner, r, pend.src);
      const toHell = pend.toHellAfter != null ? !!pend.toHellAfter : magicHellAfterPlay(st.inst[pend.src]);
      runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, toHellAfter: toHell, rng: r });
      fireEnemyActivate(st, fx, pend.owner, r);
    } else if (pend.type === 'reactActions') {
      // React อื่น (อุบัติเหตุ ฯลฯ) หลังไม่ถูกชายจากอนาคตยกเลิก
      if (pend.mode === 'destroyAttacker') {
        if (st.inst[pend.target] && (zoneOf(st, pend.target) || '').endsWith('.avatar')) {
          if (isImmuneOppMagicTarget(st, pend.target) && pend.owner !== ownerOf(st, pend.target)) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ${nameOf(st, pend.target)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม — ไม่ถูกทำลาย`);
          } else {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ส่ง ${nameOf(st, pend.target)} ที่ประกาศโจมตีลงนรก`);
            destroyCard(st, fx, pend.target, destroyOptsFromMagic(st, pend.src, pend.target));
          }
        }
        if (st.pending && st.pending.atk === pend.target && !(st.inst[pend.target] && (zoneOf(st, pend.target) || '').endsWith('.avatar'))) {
          st.pending = null; addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่แล้ว');
        }
      } else if (pend.actions && pend.actions.length) {
        // คอสเซ่นจ่ายตอนเปิดใช้แล้ว (costPaid) — อย่าจ่ายซ้ำหลังถูกขัด
        // fallback: ใบเก่าที่ยังติด costList บน pending (ไม่ควรเกิดหลังจ่ายก่อนขัด)
        if (!pend.costPaid && pend.costList && pend.costList[0] && pend.costList[0].op === 'sacrifice') {
          const p = {
            kind: 'pick', from: 'ownAvatars', src: pend.src, chooser: pend.owner,
            filter: pend.costList[0].filter || {}, dest: 'sacrifice',
            actions: pend.actions, optional: false, keepSrc: true,
            counterAtkCtx: pend.fromCounterAtk ? { atk: pend.attacker, def: pend.target } : null
          };
          if (!promptCandidates(st, p).length) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ไม่มีเป้าเซ่นไหว้ — ผลไม่เกิด`);
          } else {
            st.prompts.push(p);
            if (pend.fromCounterAtk) {
              st.reactCleanup = { src: pend.src, owner: pend.owner, atk: pend.attacker, pendingSummon: pend.pendingSummon || null };
            }
            addLog(st, pend.owner, `การ์ดสวน "${nameOf(st, pend.src)}": เลือก Avatar เซ่นไหว้`);
            fx.snd = 'place';
            // ยังไม่ลงนรก — รอเลือกเซ่น + reactCleanup
            if (!isMagicTypeUsed(st, pend.owner, magicSubtype(st.inst[pend.src]) || 'React')) {
              markMagicTypeUsed(st, pend.owner, magicSubtype(st.inst[pend.src]) || 'React');
            }
            return;
          }
        } else {
          const rctx = {
            src: pend.src, owner: pend.owner, target: pend.target,
            triggerSource: pend.triggerSource || pend.target,
            attacker: pend.attacker || null,
            rng: r
          };
          runActions(st, fx, pend.actions, rctx);
          // การ์ดสวนตอนถูกโจมตี (ไปเลยมอนตี้ ฯลฯ) — อัปเดต pending หลังลด POWER
          // ไม่สลายโจมตีเพราะ P0: ต้องกดปะทะ — น้อยกว่าฝ่ายรับ = ตาย / 0ชน0 = ไม่ตาย
          if (pend.fromCounterAtk && st.pending) {
            const atkId = pend.attacker;
            const atkGone = rctx.attackerKilled || !(atkId && st.inst[atkId] && (zoneOf(st, atkId) || '').endsWith('.avatar'));
            if (atkGone || rctx.cancelAttack) {
              st.pending = null;
            } else if (atkId) {
              addLog(st, 'S', `การโจมตียังค้าง — ${nameOf(st, atkId)} เหลือ P${effPower(st, atkId)} (กดปะทะได้)`);
            }
          }
        }
      } else if (pend.target && st.inst[pend.target] && (zoneOf(st, pend.target) || '').endsWith('.avatar')) {
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ทำลาย ${nameOf(st, pend.target)} — ส่งนรกแล้ว`);
        destroyCard(st, fx, pend.target);
      }
      // นับประเภทแล้วตอนเปิดใช้ — ไม่ mark ซ้ำ (ยกเว้นยังไม่เคยนับ)
      if (!isMagicTypeUsed(st, pend.owner, magicSubtype(st.inst[pend.src]) || 'React')) {
        markMagicTypeUsed(st, pend.owner, magicSubtype(st.inst[pend.src]) || 'React');
      }
      if (zoneOf(st, pend.src)) doMove(st, pend.src, pend.owner + '.hell', null, fx);
      fx.snd = 'clash';
      // เทคจุติ: โดนอุบัติเหตุทำลายแล้วยังรันจุติ
      if (pend.pendingSummon) resumePendingSummon(st, fx, pend.pendingSummon);
    } else if (pend.type === 'placeOnly') {
      fireEnemyActivate(st, fx, pend.owner, r);
      // Normal one-shot ที่ค้างถามขัดเวท — หลังไม่ถูกยกเลิกให้ลงนรก (ใบที่ stay ไม่เข้า type นี้)
      if (pend.hellAfter && zoneOf(st, pend.src)) {
        doMove(st, pend.src, pend.owner + '.hell', null, fx);
        addLog(st, pend.owner, `ใช้เวทเสร็จ — ${nameOf(st, pend.src)} ลงนรก`);
      }
    } else if (pend.type === 'playLand') {
      const c = st.inst[pend.src];
      if (c && zoneOf(st, pend.src)) {
        if (landPlayBlocked(st)) {
          // ถูกบล็อกหลังถามขัดเวท (ไม่น่าเกิด) — คืนลงนรกแทน
          doMove(st, pend.src, pend.owner + '.hell', null, fx);
          addLog(st, 'S', `วาง Land ไม่ได้ — ถูกบล็อกการใช้ Land`);
        } else if (!isLandMagic(c)) {
          doMove(st, pend.src, pend.owner + '.hell', null, fx);
          addLog(st, 'S', `วาง Land ไม่ได้ — ไม่ใช่ Magic ชนิด Land`);
        } else {
          // แลนด์เดิมเคลียร์ตอนใช้แล้ว — เคลียร์ซ้ำกันพลาด
          clearLandZoneFor(st, fx, pend.src);
          doMove(st, pend.src, 'land', null, fx);
          c.faceUp = true;
          c.controller = pend.owner;
          addLog(st, pend.owner, `วาง Land ${c.name}`);
          armGlobalEndPhaseTimer(st, pend.src);
          fx.snd = 'place';
          // กวาด P0 ทันทีที่แลนเข้าสนาม (ก่อนหน้าต่างอัตโนมัติอื่น)
          sweepDestroyPowerZero(st, fx);
          fireEnemyActivate(st, fx, pend.owner, r);
        }
      }
    } else if (pend.type === 'confirmNegate') {
      // ชายจากอนาคต ฯลฯ ทำงานหลังคู่ต่อสู้ไม่ขัด — ยกเลิกเวทเป้า
      // หา playLand ที่ถูกยกเลิก (ซ้อนชายได้)
      let cancelledLandPlay = null;
      for (let ip = pend.innerPending; ip; ip = ip.innerPending) {
        if (ip.type === 'playLand') { cancelledLandPlay = ip; break; }
        if (ip.type !== 'confirmNegate') break;
      }
      if (pend.target && st.inst[pend.target] && zoneOf(st, pend.target)) {
        const magOwner = ownerOf(st, pend.target);
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, pend.src)}: ยกเลิกการใช้ "${nameOf(st, pend.target)}"`);
        doMove(st, pend.target, (magOwner === 'S' ? 'A' : magOwner) + '.hell', null, fx);
      }
      if (zoneOf(st, pend.src)) doMove(st, pend.src, pend.owner + '.hell', null, fx);
      if (pend.innerPending && pend.innerPending.type === 'confirmNegate') {
        // ซ้อนชายจากอนาคตสำเร็จ → เวทเดิมทำงานต่อ
        const orig = pend.innerPending.innerPending;
        if (orig) resolvePendingMagic(st, fx, orig, r);
      } else if (st._wouldDestroyPending && pend.innerPending && (
        pend.innerPending.type === 'preventDestroy'
        || pend.innerPending.mode === 'preventDestroy'
        || (pend.innerPending.type === 'reactActions'
          && (pend.innerPending.actions || []).some(x => x.op === 'preventDestroy'))
      )) {
        resumeWouldDestroy(st, fx, false);
      } else if (pend.innerPending && pend.innerPending.pendingSummon) {
        resumePendingSummon(st, fx, pend.innerPending.pendingSummon);
      } else if (cancelledLandPlay) {
        // ยกเลิกการใช้ Land → แลนด์เดิมต้องหลุด (กันกรณีที่ยังไม่เคลียร์ตอนใช้)
        clearLandZoneFor(st, fx, null);
        addLog(st, 'S', `การใช้ Land ถูกยกเลิก — Land Zone ว่าง (แลนด์เดิมหลุดแล้ว)`);
      }
      fx.snd = 'clash';
    }
  }

  function promptTargetOk(st, k) { return promptCandidates(st, (st.prompts || [])[0]).includes(k); }
  /* เทพผดุงธรรม: รับใบสอดแนมทั้งหมดขึ้นมือ แล้วเลือกเนรเทศศัตรู Cost ≤ ผลรวม */
  function finishScoutAllHandThenExile(st, fx, p) {
    const ids = (p.ids || []).filter(x => (st.zones[p.chooser + '.deck'] || []).includes(x));
    unlockScoutIds(st, p.ids || ids);
    const sum = p.scoutCostSum != null ? p.scoutCostSum : ids.reduce((s, id) => s + effCost(st, id), 0);
    ids.forEach(id => doMove(st, id, p.chooser + '.hand', null, fx));
    if (ids.length) {
      addLog(st, p.chooser, `สอดแนม ${ids.length} ใบขึ้นมือ (รวม Cost ${sum})`);
      fx.snd = 'draw';
    }
    const enemies = (st.zones[other(p.chooser) + '.avatar'] || []).filter(id => effCost(st, id) <= sum);
    if (!enemies.length) {
      addLog(st, 'S', `ไม่มี Avatar ศัตรู Cost ≤ ${sum} ให้เนรเทศ`);
      return;
    }
    st.prompts.unshift({
      kind: 'pick', from: 'ids', ids: enemies, src: p.src, chooser: p.chooser,
      dest: 'dark', optional: false, allowAnyZone: true
    });
    addLog(st, p.chooser, `เลือก Avatar ศัตรู Cost ≤ ${sum} เนรเทศลงมิติมืด`);
  }
  /* เมฟิสโต้ ฯลฯ — ขึ้นมือหลังโชว์ทุกใบในหน้าต่างสอดแนม (เรียกตอนเลือก/ข้าม) */
  function flushScoutAutoHand(st, fx, p) {
    const auto = (p.autoHandIds || []).filter(id => (st.zones[p.chooser + '.deck'] || []).includes(id));
    if (!auto.length) { if (p.autoHandIds) p.autoHandIds = []; return auto; }
    unlockScoutIds(st, auto);
    auto.forEach(id => {
      doMove(st, id, p.chooser + '.hand', null, fx);
      addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, id)}: ถูกสอดแนมโดย ${nameOf(st, p.src)} → ขึ้นมือ`);
      fx.snd = 'draw';
    });
    if (p.ids) p.ids = p.ids.filter(x => !auto.includes(x));
    p.autoHandIds = [];
    return auto;
  }

  function declareBuffs(st, atkId) {
    abil(st, atkId, 'declareAttack').forEach(ab => {
        if (ab.trigger && ab.trigger.if === 'targetIsAvatar') {
          const def0 = st.pending && st.pending.def;
          if (!def0 || !(zoneOf(st, def0) || '').endsWith('.avatar')) return;
        }
      // oncePerTurn (พ่อจีจ้า ฯลฯ) — บัฟจัดการคู่กับ mill ในเส้นทางประกาศโจมตีแล้ว
      if (ab.oncePerTurn) return;
      (ab.actions || []).forEach(ac => {
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
          let amt = ac.amount || 0;
          if (ac.amountPer === 'allTappedAvatars') {
            amt = (ac.per || 1) * (
              (st.zones['A.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length +
              (st.zones['B.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length
            );
          }
          if (!amt) return;
          st.buffs.push({ k: atkId, amt, until: ac.duration === 'combat' ? 'combat' : 'endOfTurn', from: atkId });
          addLog(st, 'S', `อัตโนมัติ ${nameOf(st, atkId)}: โจมตี → POWER ${amt > 0 ? '+' : ''}${amt} จนจบเทิร์น`);
        }
      });
    });
  }

function applySelfPowerBuffsFromAb(st, k, ab, logLabel) {
    (ab.actions || []).forEach(ac => {
      if (ac.op !== 'modifyPower' || !ac.target || ac.target.select !== 'self') return;
      let amt = ac.amount || 0;
      if (ac.amountPer === 'allTappedAvatars') {
        amt = (ac.per || 1) * (
          (st.zones['A.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length +
          (st.zones['B.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length
        );
      }
      if (!amt) return;
      st.buffs.push({ k, amt, until: ac.duration === 'combat' ? 'combat' : 'endOfTurn', from: k });
      addLog(st, 'S', `อัตโนมัติ ${nameOf(st, k)}: ${logLabel} → POWER ${amt > 0 ? '+' : ''}${amt} จนจบเทิร์น`);
    });
  }

  /* พ่อจีจ้า ฯลฯ: oncePerTurn ตอนสั่งโจมตี (Avatar หรือ LIFE) — mill/heavy + POWER
     คืน true ถ้ามีอะไรบล็อก React จนจบการต่อสู้ */
  function runAttackerDeclareOncePerTurn(st, fx, atkId, owner, rng, label, opts) {
    opts = opts || {};
    let blockReact = false;
    abil(st, atkId, 'declareAttack').forEach(ab => {
      const cond = (ab.trigger && ab.trigger.if) || '';
      if (cond.startsWith('targetSymbol:')) return;
      (ab.actions || []).forEach(ac => {
        if (ac.op === 'blockReactUntilCombatEnd') blockReact = true;
      });
      const heavy = (ab.actions || []).filter(ac => ac.op !== 'blockReactUntilCombatEnd' && ac.op !== 'modifyPower');
      const hasSelfBuff = (ab.actions || []).some(ac => ac.op === 'modifyPower' && ac.target && ac.target.select === 'self');
      if (!(ab.oncePerTurn && (heavy.length || hasSelfBuff))) return;
      if (!claimOncePerTurn(st, atkId, ab.oncePerTurnTag || 'declareAttack')) return;
      if (heavy.length) {
        if (opts.allowReact !== false
          && offerAbilityReact(st, fx, owner, atkId, { type: 'declareAtk', actions: heavy, src: atkId, owner })) {
          if (hasSelfBuff) {
            st._pendingDeclareBuff = st._pendingDeclareBuff || [];
            st._pendingDeclareBuff.push({ k: atkId, ab, label: label || 'โจมตี' });
          }
        } else {
          runActions(st, fx, heavy, { src: atkId, owner, rng, attacker: atkId });
          if (hasSelfBuff) applySelfPowerBuffsFromAb(st, atkId, ab, label || 'โจมตี');
        }
      } else if (hasSelfBuff) {
        applySelfPowerBuffsFromAb(st, atkId, ab, label || 'โจมตี');
      }
    });
    return blockReact;
  }

  /* ผลตอนประกาศโจมตี: นิ้วเพชร(ทำลายเป้าเทพ) + Land ธรณีสูบผู้โจมตี + ใบสวม (ขวานทอง/สายฟ้า) — คืน true ถ้าเป้าถูกทำลายไปแล้ว */
  function declareEffects(st, fx, atkId, defId, rng) {
    let targetGone = false;
    const A = st.inst[atkId];
    const runDeclare = (srcK, label) => {
      abil(st, srcK, 'declareAttack').forEach(ab => {
        const cond = (ab.trigger && ab.trigger.if) || '';
        if (cond === 'source==self' && srcK !== atkId) return;
        const m = cond.match(/^targetSymbol:(.+)$/);
        if (m && (!defId || !st.inst[defId] || st.inst[defId].symbol !== m[1])) return;
        if (cond === 'targetIsAvatar' && (!defId || !(zoneOf(st, defId) || '').endsWith('.avatar'))) return;
        if (ab.requireOwnHellNameIncludes) {
          const own = ownerOf(st, atkId);
          const ok = (st.zones[own + '.hell'] || []).some(id => nameMatches(st.inst[id], ab.requireOwnHellNameIncludes));
          if (!ok) return;
        }
        // ตำรวจไฟแรง ฯลฯ: ทายประเภทตอนโจมตี — รันผ่าน runActions
        if ((ab.actions || []).some(ac => ac.op === 'guessOppTopType')) {
          const own = ownerOf(st, atkId);
          runActions(st, fx, ab.actions || [], { src: srcK, owner: own, rng, target: defId, attacker: atkId });
          return;
        }
        // เอริ ฯลฯ: scout/hellPick ตอนโจมตี (oncePerTurn รันใน runAttackerDeclareOncePerTurn แล้ว)
        const handled = { destroyTarget: 1, discardOppRandom: 1, draw: 1, modifyPower: 1, blockReactUntilCombatEnd: 1 };
        const extra = (ab.actions || []).filter(ac => ac && ac.op && !handled[ac.op]);
        if (extra.length && !ab.oncePerTurn) {
          const own = ownerOf(st, atkId);
          runActions(st, fx, extra, { src: srcK, owner: own, rng, target: defId, attacker: atkId });
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
            const n = takeFromDeckToHand(st, own, ac.count || 1, fx).length;
            if (n) { addLog(st, own, `เอฟเฟกต์ ${label}: จั่ว ${n} ใบ`); fx.snd = 'draw'; }
          } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
            // ตัวโจมตีเอง: declareBuffs ใส่ไปแล้ว — อย่าซ้ำ (พระนารายณ์ +2 สองรอบ)
            // ใบสวมบนตัวโจมตี: ยังใส่ได้ (บัฟจาก Mod)
            if (srcK === atkId) return;
            const until = ac.duration === 'combat' ? 'combat' : 'endOfTurn';
            st.buffs.push({ k: atkId, amt: ac.amount || 0, until, from: srcK });
            addLog(st, 'S', `อัตโนมัติ ${label}: POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${until === 'combat' ? ' จนจบการต่อสู้' : ' จนจบเทิร์น'}`);
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
        const who = ac.who || (ac.player === 'opp' ? 'opp' : ac.player === 'both' ? 'both' : null);
        const players = who === 'both' ? ['A', 'B'] : who === 'opp' ? [other(ctx.owner)] : [ctx.owner];
        let count = ac.count || 1;
        if (ac.countPer === 'ownAttachedMods') count = Object.values(st.inst).filter(x => x.attachedTo === ctx.src).length;
        if (ac.countPer === 'ownHellPerN') {
          const perN = ac.perN || 15;
          count = (ac.per || 1) * Math.floor(((st.zones[ctx.owner + '.hell'] || []).length) / perN);
        }
        if (ac.countIfOwnNameIncludesMin) {
          const need = ac.countIfOwnNameIncludesMin.nameIncludes;
          const min = ac.countIfOwnNameIncludesMin.min || 2;
          const nOwn = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], need)).length;
          if (nOwn >= min) count = ac.countIfOwnNameIncludesMin.count || count;
          else { /* keep base count; if onlyIf skip draw when below — handled via onlyIfOwn */ }
        }
        if (ac.onlyIfOwnNameIncludesMin) {
          const need = ac.onlyIfOwnNameIncludesMin.nameIncludes;
          const min = ac.onlyIfOwnNameIncludesMin.min || 2;
          const nOwn = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], need)).length;
          if (nOwn >= min) { /* use count as-is (caller sets higher) */ }
          else if (ac.fallbackCount != null) count = ac.fallbackCount;
        }
        players.forEach(p => {
          const got = takeFromDeckToHand(st, p, count, fx);
          if (got.length) addLog(st, p, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จั่ว ${got.length} ใบ`);
        });
      } else if (ac.op === 'discard') {
        // ทิ้งจากมือ (กัญญา / เอเลี่ยน) — actions/then รันหลังทิ้ง
        const need = ac.count || 1;
        const chooser = ac.who === 'opp' ? other(ctx.owner)
          : (ac.who === 'A' || ac.who === 'B') ? ac.who
          : ctx.owner;
        const p = {
          kind: 'chooseDiscard', src: ctx.src, chooser, filter: ac.filter,
          actions: ac.then || ac.actions || [], optional: false, effectDiscard: true,
          discardNeed: need > 1 ? need : undefined, discardGot: 0
        };
        const legal = promptCandidates(st, p);
        if (legal.length < need) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: มือไม่พอทิ้ง ${need} ใบ — ข้าม`);
        else { st.prompts.push(p); prompted = true; addLog(st, chooser, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดในมือทิ้ง ${need} ใบ`); }
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
        // บน→ล่าง: จากต้นอาร์เรย์ (ใบบนสุด = ใบเดียวกับที่โดนโจมตีก่อน)
        for (let i = 0; i < arr.length && done < (ac.count || 1); i++) {
          const id = arr[i];
          if (st.inst[id] && !st.inst[id].faceUp) {
            st.inst[id].faceUp = true;
            st.inst[id].lifeMark = ac.mark || 'naw';
            done++;
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: หงาย LIFE "${nameOf(st, id)}" ของ ${ctx.owner}`);
          }
        }
      } else if (ac.op === 'unrevealMarkedLife') {
        if (inCritical(st, ctx.owner)) {
          addLog(st, 'S', `สถานะสาหัส: ฝ่าย ${ctx.owner} ฮีล LIFE ไม่ได้`);
        } else if ((st.zones['land'] || []).some(id => fxId(st, id) && fxId(st, id).blockLifeUnreveal)) {
          addLog(st, 'S', 'โรงบาลรัฐ: LIFE ไม่สามารถคว่ำกลับได้ — ฮีลไม่เกิดผล');
        } else {
          const arr = st.zones[ctx.owner + '.life'] || [];
          arr.forEach(id => {
            const L = st.inst[id];
            if (L && L.lifeMark === (ac.mark || 'naw') && L.faceUp) {
              L.faceUp = false;
              delete L.lifeMark;
              addLog(st, 'S', `เอฟเฟกต์: คว่ำ LIFE ที่หงายด้วยน้องนาวกลับ`);
            }
          });
        }
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
      } else if (ac.op === 'moveSelfToMagicZone') {
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c) addLog(st, 'S', 'ย้ายไป Magic Zone ไม่ได้');
        else if (z.endsWith('.magic')) addLog(st, ctx.owner, `${c.name} อยู่ใน Magic Zone อยู่แล้ว`);
        else {
          doMove(st, ctx.src, ctx.owner + '.magic', null, fx);
          c.faceUp = true;
          c.tapped = false;
          addLog(st, ctx.owner, `จุติ ${c.name}: ย้ายไป Magic Zone (ใช้ความสามารถจาก Magic Zone ได้)`);
          fx.snd = 'place';
        }
      } else if (ac.op === 'summonSelfFromMagic') {
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c || !z.endsWith('.magic')) addLog(st, 'S', `อัญเชิญจาก Magic Zone ไม่ได้ — ไม่อยู่ Magic Zone`);
        else {
          const qd = quotaDeny(st, ctx.owner + '.avatar', c);
          if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
          else {
            doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
            c.faceUp = true;
            c.tapped = false;
            addLog(st, ctx.owner, `อัญเชิญ จุติ ${c.name} จาก Magic Zone`);
            triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: ac.paidCost !== false });
          }
        }
      } else if (ac.op === 'magicPick') {
        const p = {
          kind: 'pick', from: 'ownMagic', src: ctx.src, chooser: ctx.owner, filter: ac.filter || {},
          dest: ac.dest || 'avatar', optional: ac.optional !== false, paidCost: !!ac.paidCost,
          excludeIds: ac.excludeSelf === false ? [] : [ctx.src]
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดบน Magic Zone`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขบน Magic Zone`);
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
        else if (fxCard(c) && fxCard(c).noHellSummon) addLog(st, 'S', `${c.name} อัญเชิญจากนรกไม่ได้`);
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
          refreshOnFightBuffs(st, st.pending.atk, ctx.src);
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
            if (tryUntap(st, host, ctx.src)) addLog(st, 'S', `กระบองแสง: ${nameOf(st, host)} ตื่น`);
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
          costSumMax: ac.costSumMax != null ? ac.costSumMax : 5, costGot: 0,
          srcToHell: !!ctx.toHellAfter
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
        const reduce = ac.costReduce || 0;
        const mustPay = !!ac.mustPayRemain;
        const ids = (st.zones[ctx.owner + '.hand'] || []).filter(id => {
          if (!matchFilterEx(st, id, ac.filter || { type: 'Avatar' })) return false;
          if (!mustPay || !reduce) return true;
          const remain = Math.max(0, effCost(st, id) - reduce);
          if (remain <= 0) return true;
          return handGemUsableToward(st, ctx.owner, id, [id]) >= remain;
        });
        if (!ids.length) {
          const any = (st.zones[ctx.owner + '.hand'] || []).some(id => matchFilterEx(st, id, ac.filter || { type: 'Avatar' }));
          addLog(st, 'S', any
            ? `เอฟเฟกต์ ${nameOf(st, ctx.src)}: มี Avatar ตรงเงื่อนไข แต่ GEM ในมือไม่พอจ่าย Cost ที่เหลือ`
            : `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ในมือตรงเงื่อนไข`);
        } else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner,
            filter: ac.filter || {}, dest: 'avatar', paidCost: !!ac.paidCost, optional: true, allowAnyZone: true,
            then: ac.then || ac.actions || null, grantSummoned: ac.grantSummoned || null,
            costReduce: reduce, mustPayRemain: mustPay
          });
          prompted = true;
          addLog(st, ctx.owner, mustPay && reduce
            ? `เอฟเฟกต์: เลือก Avatar จากมือ — Cost −${reduce} แล้วจ่าย GEM ที่เหลือก่อนลงสนาม`
            : `เอฟเฟกต์: อัญเชิญจากมือ (ฟรี ไม่จุติ)`);
        }
      } else if (ac.op === 'darkPick') {
        const p = {
          kind: 'pick', from: 'dark', src: ctx.src, chooser: ctx.owner, filter: ac.filter || {},
          dest: ac.dest || 'deck', shuffleAfter: !!ac.shuffleAfter, optional: ac.optional != null ? !!ac.optional : true,
          hostFilter: ac.hostFilter || ac.attachToFilter || null,
          preferHost: ac.preferHost === 'self' ? ctx.src : (ac.preferHost || null),
          thenBuffHost: ac.thenBuffHost || null, thenUntap: !!ac.thenUntap,
          countsAsModification: !!ac.countsAsModification,
          then: ac.then || null,
          onceTag: ctx.onceTag || null
        };
        if (promptCandidates(st, p).length) {
          st.prompts.push(p); prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกจากมิติมืด`);
        } else {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในมิติมืด — นับว่าใช้ไปแล้ว`);
          if (ac.countsAsModification || p.countsAsModification) consumeCountsAsModification(st, ctx.owner);
          if (ac.then && ac.then.length) runActions(st, fx, ac.then, { src: ctx.src, owner: ctx.owner, rng: ctx.rng });
        }
      } else if (ac.op === 'exileAttachedThenAttachFromDark') {
        const host = ctx.src;
        const needle = ac.attachedNameIncludes || ac.nameIncludes || 'อาวุธนคร';
        const attached = Object.keys(st.inst).filter(id => {
          const m = st.inst[id];
          return !!(m && m.attachedTo === host && nameMatches(m, needle));
        });
        const darkNeedle = ac.darkNameIncludes || needle;
        const darkOk = (st.zones[ctx.owner + '.dark'] || []).some(id => st.inst[id] && nameMatches(st.inst[id], darkNeedle));
        if (!attached.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี "${needle}" ที่สวมใส่`);
        else if (!darkOk) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี "${darkNeedle}" ในมิติมืด`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: attached, src: ctx.src, chooser: ctx.owner,
            dest: 'exileThenDarkAttach', optional: true, allowAnyZone: true,
            hostK: host, nameIncludes: darkNeedle, thenUntap: ac.thenUntap !== false,
            onceTag: ctx.onceTag || null
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เนรเทศ "${needle}" ที่สวม แล้วสวมใบชื่อต่างจากมิติมืด (ข้ามได้)`);
        }
      } else if (ac.op === 'exileDeckTop') {
        const d = st.zones[ctx.owner + '.deck'] || [];
        if (!d.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เด็คว่าง — เนรเทศใบบนสุดไม่ได้`);
        else {
          const top = d[d.length - 1];
          doMove(st, top, ctx.owner + '.dark', null, fx);
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เนรเทศใบบนสุดของเด็ค (${nameOf(st, top)}) ลงมิติมืด`);
          fx.snd = 'tap';
        }
      } else if (ac.op === 'schedule') {
        const src = (ac.src === 'summoned' && ctx.summoned) ? ctx.summoned : ctx.src;
        st.scheduled.push({
          player: ctx.owner, when: ac.when || 'nextOwnMainPhase',
          op: 'runActions', actions: ac.actions || [], src
        });
        addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, src)}: นัดทำผลใน ${ac.when || 'nextOwnMainPhase'}`);
      } else if (ac.op === 'revealAndActivateOwnLife') {
        /* วันชัยเปรตรุ่นพ่อ: หงาย LIFE ใบบนสุด แล้วใช้ผลทันที
           ถ้าผลระบุ "ใน Main Phase ถัดไป" ให้ทำในเทิร์นนี้ทันที */
        const need = ac.count || 1;
        const arr = st.zones[ctx.owner + '.life'] || [];
        const picked = [];
        for (let i = 0; i < arr.length && picked.length < need; i++) {
          const id = arr[i];
          if (st.inst[id] && !st.inst[id].faceUp) picked.push(id);
        }
        if (!picked.length) {
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี LIFE ที่คว่ำให้หงาย`);
        } else {
          picked.forEach(lifeId => {
            const L = st.inst[lifeId];
            L.faceUp = true;
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: หงาย LIFE "${L.name}" แล้วสั่งใช้ผลทันที`);
            fx.flip = lifeId;
            fx.snd = 'flip';
            const flattenImmediate = (list) => {
              const out = [];
              (list || []).forEach(a0 => {
                if (!a0) return;
                if (a0.op === 'schedule') {
                  flattenImmediate(a0.actions || []).forEach(x => out.push(x));
                  return;
                }
                const copy = Object.assign({}, a0);
                if (copy.schedule === 'nextOwnMainPhase') delete copy.schedule;
                out.push(copy);
              });
              return out;
            };
            abilitiesOf(L.code, 'lifeRevealedByAttack', L.name).forEach(ab => {
              const acts = flattenImmediate(ab.actions || []);
              if (!acts.length) return;
              addLog(st, ctx.owner, `สั่งใช้ผล LIFE "${L.name}" ทันที (ข้ามรอ Main ถัดไป)`);
              runActions(st, fx, acts, { src: lifeId, owner: ctx.owner, rng: ctx.rng || Math.random });
            });
          });
        }
      } else if (ac.op === 'chooseMode') {
        const optional = ac.optional !== false;
        st.prompts.push({ kind: 'chooseMode', src: ctx.src, chooser: ctx.owner, optional, options: ac.options || [] });
        prompted = true;
        addLog(st, ctx.owner, optional
          ? `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกปฏิบัติ (ข้ามได้ — ยังไม่นับว่าใช้เทค)`
          : `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกปฏิบัติ`);
      } else if (ac.op === 'grantBuffSummoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          st.buffs.push({ k: sk, amt: ac.amount || 0, until: ac.duration === 'permanent' ? 'permanent' : 'endOfTurn' });
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${ac.duration === 'permanent' ? '' : ' จนจบเทิร์น'}`);
        }
      } else if (ac.op === 'blockReactUntilCombatEnd') {
        // นางอัปสร: ตั้งตอนประกาศโจมตี — ใช้กับ pending หลังสร้าง
        ctx._blockReact = true;
      } else if (ac.op === 'guessOppTopType') {
        // ตำรวจ: ประกาศได้แค่ อวตาร / เมจิก / คอนสตรัค
        const TYPE_LABELS = { Avatar: 'อวตาร', Magic: 'เมจิก', Construct: 'คอนสตรัค' };
        const types = (ac.types && ac.types.length) ? ac.types : ['Avatar', 'Magic', 'Construct'];
        const options = types.filter(t => TYPE_LABELS[t] || t).map(t => ({
          label: 'ประกาศ: ' + (TYPE_LABELS[t] || t),
          actions: [{
            op: 'resolveGuessOppTop',
            declareType: t,
            onHit: ac.onHit || [],
            onMiss: ac.onMiss || []
          }]
        }));
        st.prompts.push({ kind: 'chooseMode', src: ctx.src, chooser: ctx.owner, optional: false, options, guessTypes: true });
        prompted = true;
        addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ประกาศประเภทใบบนสุดเด็คฝ่ายตรงข้าม (อวตาร/เมจิก/คอนสตรัค)`);
      } else if (ac.op === 'resolveGuessOppTop') {
        const opp = other(ctx.owner);
        const d = st.zones[opp + '.deck'] || [];
        if (!d.length) addLog(st, 'S', 'เด็คฝ่ายตรงข้ามว่าง — สอดแนมไม่ได้');
        else {
          const top = d[d.length - 1];
          const tc = st.inst[top];
          const hit = (tc.type || '') === ac.declareType;
          // เปิดโชว์ที่ท็อปเด็คก่อน — ยังไม่ทิ้งนรก จนกว่าจะกดดำเนินการ
          tc.faceUp = true;
          tc._guessReveal = true;
          const TYPE_LABELS = { Avatar: 'อวตาร', Magic: 'เมจิก', Construct: 'คอนสตรัค', Life: 'ไลฟ์' };
          const declL = TYPE_LABELS[ac.declareType] || ac.declareType;
          const realL = TYPE_LABELS[tc.type] || tc.type;
          addLog(st, 'S', `สอดแนม ${opp}: เปิด "${tc.name}" (${realL}) ที่ท็อปเด็ค — ประกาศ ${declL} → ${hit ? '✓ ถูก' : '✗ ผิด'}`);
          st.prompts.push({
            kind: 'guessReveal',
            src: ctx.src,
            chooser: ctx.owner,
            optional: false,
            card: top,
            opp,
            hit,
            declareType: ac.declareType,
            declareLabel: declL,
            realType: tc.type,
            realLabel: realL,
            cardName: tc.name,
            onHit: ac.onHit || [],
            onMiss: ac.onMiss || [],
            scouted: top
          });
          prompted = true;
          fx.snd = 'flip';
          fx.guessReveal = { card: top, hit, opp };
        }
      } else if (ac.op === 'millScouted') {
        const id = ctx.scouted;
        if (id && st.inst[id] && zoneOf(st, id)) {
          const own = ownerOf(st, id);
          const hell = (own === 'A' || own === 'B') ? own + '.hell' : other(ctx.owner) + '.hell';
          if (st.inst[id]) delete st.inst[id]._guessReveal;
          doMove(st, id, hell, null, fx);
          addLog(st, 'S', `ส่งการ์ดที่สอดแนม "${nameOf(st, id)}" ลงนรก`);
          fx.snd = 'clash';
        } else addLog(st, 'S', 'ไม่มีใบสอดแนมให้ส่งนรก');
      } else if (ac.op === 'discardSelfFromHand') {
        const z = zoneOf(st, ctx.src) || '';
        if (z.endsWith('.hand')) {
          doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
          addLog(st, ctx.owner, `ทิ้ง ${nameOf(st, ctx.src)} จากมือลงนรก`);
        } else addLog(st, 'S', 'ทิ้งจากมือไม่ได้ — ไม่อยู่ในมือ');
      } else if (ac.op === 'destroyAttackTarget') {
        const def = (st.pending && st.pending.def) || ctx.target;
        if (def && st.inst[def] && (zoneOf(st, def) || '').endsWith('.avatar')) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย ${nameOf(st, def)} ที่เป็นเป้าโจมตี`);
          destroyCard(st, fx, def);
          if (st.pending && st.pending.def === def) { st.pending = null; clearCombatBuffs(st); }
          fx.snd = 'clash';
        } else addLog(st, 'S', 'ไม่มีเป้าโจมตีให้ทำลาย');
      } else if (ac.op === 'bounceAttackTarget') {
        const def = (st.pending && st.pending.def) || ctx.target;
        if (def && st.inst[def] && (zoneOf(st, def) || '').endsWith('.avatar')) {
          const own = ownerOf(st, def);
          const handOwner = own === 'S' ? ctx.owner : own;
          if (offerPreventLeave(st, fx, def, {
            type: 'move', to: handOwner + '.hand', who: handOwner, k: def
          })) {
            prompted = true;
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นำ ${nameOf(st, def)} ขึ้นมือ — รอกันออกสนาม`);
          } else {
            doMove(st, def, handOwner + '.hand', null, fx);
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นำ ${nameOf(st, def)} ที่ถูกโจมตีกลับขึ้นมือ`);
            if (st.pending && st.pending.def === def) { st.pending = null; clearCombatBuffs(st); }
            fx.snd = 'place';
          }
        } else addLog(st, 'S', 'ไม่มี Avatar ที่ถูกโจมตีให้นำขึ้นมือ');
      } else if (ac.op === 'peekOppTopKeep') {
        const opp = other(ctx.owner);
        const d = st.zones[opp + '.deck'] || [];
        if (!d.length) addLog(st, 'S', 'เด็คฝ่ายตรงข้ามว่าง');
        else {
          const top = d[d.length - 1];
          st.inst[top].faceUp = true;
          addLog(st, ctx.owner, `สอดแนมใบบนสุดเด็ค ${opp}: "${nameOf(st, top)}" (${st.inst[top].type}) — กลับไว้เดิม`);
          syncHeimdall(st);
        }
      } else if (ac.op === 'oppHandToDeckTop') {
        const opp = other(ctx.owner);
        const hand = st.zones[opp + '.hand'] || [];
        if (!hand.length) addLog(st, 'S', 'ฝ่ายตรงข้ามไม่มีมือให้แสดง');
        else if (ac.random) {
          const rng = ctx.rng || (() => 0.5);
          const pick = hand[Math.floor(rng() * hand.length)];
          doMove(st, pick, opp + '.deck', null, fx);
          if (st.inst[pick]) { st.inst[pick].faceUp = true; st.inst[pick].revealed = true; }
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: สุ่มมือ ${opp} วางบนสุดเด็ค → ${nameOf(st, pick)}`);
          fx.snd = 'place';
        } else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: hand.slice(), src: ctx.src, chooser: opp, dest: 'deckTop', optional: false, allowAnyZone: true });
          prompted = true;
          addLog(st, opp, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดในมือ 1 ใบแสดง แล้ววางบนสุดเด็ค`);
        }
      } else if (ac.op === 'revealOppHand') {
        const opp = other(ctx.owner);
        const hand = (st.zones[opp + '.hand'] || []).filter(id => st.inst[id]);
        if (!hand.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: มือฝ่ายตรงข้ามว่าง`);
        else {
          hand.forEach(id => { st.inst[id].revealed = true; st.inst[id].faceUp = true; });
          const names = hand.map(id => nameOf(st, id));
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ดูมือ ${opp} ทั้ง ${hand.length} ใบ — ${names.join(' · ')}`);
          fx.toss = { by: opp, names };
          fx.snd = 'flip';
        }
      } else if (ac.op === 'peekOppBottomPickTop') {
        const opp = other(ctx.owner);
        const n = ac.count || 3;
        const d = st.zones[opp + '.deck'] || [];
        const ids = d.slice(0, Math.min(n, d.length));
        if (!ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เด็คฝ่ายตรงข้ามว่าง`);
        else {
          ids.forEach(id => { if (st.inst[id]) { st.inst[id].faceUp = true; st.inst[id].revealed = true; } });
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: ids.slice(), src: ctx.src, chooser: ctx.owner,
            dest: 'oppBottomPickTop', optional: false, allowAnyZone: true,
            peekRest: ids.slice(), scoutOpp: opp
          });
          prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ดู ${ids.length} ใบล่างสุดเด็ค ${opp} แล้วเลือก 1 ใบขึ้นบนสุด`);
        }
      } else if (ac.op === 'revealOppLifeTop') {
        const opp = other(ctx.owner);
        const life = st.zones[opp + '.life'] || [];
        // ใบบนสุด = ใบแรกที่ยังคว่ำ (ลำดับเดียวกับตอนโจมตี LIFE)
        const top = life.find(id => st.inst[id] && !st.inst[id].faceUp) || null;
        if (top) {
          st.inst[top].faceUp = true;
          addLog(st, 'S', `หงาย LIFE ใบบนสุดของ ${opp}: "${nameOf(st, top)}"`);
        } else addLog(st, 'S', 'หงาย LIFE ไม่ได้ (ว่างหรือหงายอยู่แล้ว)');
      } else if (ac.op === 'revealOwnHandNameIncludes') {
        const need = ac.nameIncludes || '';
        const hand = (st.zones[ctx.owner + '.hand'] || []).filter(id => nameMatches(st.inst[id], need));
        if (!hand.length) {
          addLog(st, 'S', `จุติ ${nameOf(st, ctx.src)}: ไม่มี "${need}" ในมือ`);
          if (ac.required) ctx._skipRest = true;
        } else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: hand, src: ctx.src, chooser: ctx.owner, dest: 'revealHandCard', optional: !ac.required, allowAnyZone: true, then: ac.then || null });
          prompted = true;
          addLog(st, ctx.owner, `แสดงการ์ด "${need}" จากมือ 1 ใบ`);
        }
      } else if (ac.op === 'scoutOppPickHellOrTop') {
        if (ctx._skipRest) addLog(st, 'S', 'ข้ามสอดแนม (ไม่แสดงตำรวจจากมือ)');
        else {
          const opp = other(ctx.owner);
          const n = ac.count || 2;
          const d = st.zones[opp + '.deck'] || [];
          const ids = d.slice(-Math.min(n, d.length)).reverse();
          if (!ids.length) addLog(st, 'S', 'สอดแนมเด็คศัตรูไม่ได้');
          else {
            ids.forEach(id => { if (st.inst[id]) st.inst[id].faceUp = true; });
            st.prompts.push({
              kind: 'pick', from: 'ids', ids: ids.slice(), src: ctx.src, chooser: ctx.owner,
              dest: 'scoutOppHell', optional: false, allowAnyZone: true,
              scoutRest: ids.slice(), scoutOpp: opp, revealAllScout: true
            });
            prompted = true;
            addLog(st, ctx.owner, `สอดแนมเด็ค ${opp} ${ids.length} ใบ — เลือก 1 ใบทิ้งนรก ที่เหลือไว้บนสุด`);
          }
        }
      } else if (ac.op === 'hostNoUntapUntilNextOwnEnd') {
        const hostK = (st.inst[ctx.src] && st.inst[ctx.src].attachedTo) || ctx.src;
        if (st.inst[hostK]) {
          st.inst[hostK].noUntapHard = true;
          delete st.inst[hostK].noUntapSkippedDraw;
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, hostK)} ห้ามตื่นทุกกรณี จนจบ End Phase ถัดไปของเรา`);
        }
      } else if (ac.op === 'hostNoUntapExceptSelf') {
        const hostK = (st.inst[ctx.src] && st.inst[ctx.src].attachedTo) || ctx.src;
        if (st.inst[hostK]) {
          const exceptName = (st.inst[ctx.src] && st.inst[ctx.src].name) || '';
          st.inst[hostK].noUntapExceptName = exceptName;
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, hostK)} ห้ามตื่นทุกกรณี ยกเว้น「${exceptName}」`);
        }
      } else if (ac.op === 'grantSelfKeyword') {
        const c = st.inst[ctx.src];
        if (c) {
          c.grantedKeywords = c.grantedKeywords || [];
          c.grantedKeywords.push({ kw: ac.keyword || 'เตะไข่', until: ac.until || 'endOfTurn' });
          addLog(st, ctx.owner, `${c.name} ได้ "${ac.keyword}" จนจบเทิร์น`);
        }
      } else if (ac.op === 'forceDuelNoTap') {
        const needN = ac.requireHellReturnedThisTurnMin;
        const gotN = (st.hellReturnedThisTurn && st.hellReturnedThisTurn[ctx.owner]) || 0;
        if (needN != null && gotN < needN) {
          addLog(st, 'S', `ใช้ไม่ได้ — คืนนรกในเทิร์นนี้ ${gotN} < ${needN}`);
        } else {
          const ownNeed = ac.ownNameIncludes || 'อีสานสลิงเกอร์';
          const mine = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ownNeed));
          const foes = (st.zones[other(ctx.owner) + '.avatar'] || []).slice();
          if (!mine.length || !foes.length) addLog(st, 'S', `ดวลไม่ได้ — ต้องมี "${ownNeed}" และ Avatar ศัตรู`);
          else {
            st.prompts.push({ kind: 'pick', from: 'ids', ids: mine, src: ctx.src, chooser: ctx.owner, dest: 'forceDuelOwn', optional: false, allowAnyZone: true, foeIds: foes, blockReact: !!ac.blockReact });
            prompted = true;
            addLog(st, ctx.owner, 'เลือกอีสานสลิงเกอร์สำหรับดวล (ไม่นอน · ห้าม React)');
          }
        }
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
        // ภูเวียง / โคกอีสานนูน: เลือกจากนรกกลับเด็ค แล้วจั่ว + บัฟ
        // countExact = ต้องครบถึงจะ "เก็บได้" (เช่น เทค 1 โคก ต้อง 6 ใบ)
        if (ac.requireOwnNameIncludes) {
          const ok = (st.zones[ctx.owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ac.requireOwnNameIncludes));
          if (!ok) { addLog(st, 'S', `ใช้ไม่ได้ — ต้องมี "${ac.requireOwnNameIncludes}" บนสนาม`); return; }
        }
        const exact = ac.countExact != null ? ac.countExact : null;
        const maxN = ac.countMax != null ? ac.countMax : (exact || 4);
        if (exact != null) {
          const cap = hellPickCapacity(st, ctx.owner, ac.magicMax != null ? ac.magicMax : null, ac.filter || {}, !!ac.distinctNames);
          if (cap < exact) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เก็บไม่ได้ — ในนรกเลือกได้ ${cap}/${exact} ใบ`);
            if (ctx.onceTag) unclaimOncePerTurn(st, ctx.src, ctx.onceTag);
            return;
          }
        }
        const p = {
          kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'hellMultiDeck', optional: exact == null, multiMax: maxN, multiGot: 0,
          multiExact: exact, multiMin: exact != null ? exact : (ac.countMin != null ? ac.countMin : null),
          thenDraw: ac.thenDraw || 0, buffPer: ac.buffPer || 0, shuffleAfter: true,
          magicMax: ac.magicMax != null ? ac.magicMax : null, magicGot: 0,
          trackHellReturn: !!ac.trackHellReturn,
          distinctNames: !!ac.distinctNames, pickedNames: [],
          returnedIds: [], onceTag: ctx.onceTag || null,
        };
        if (promptCandidates(st, p).length) {
          st.prompts.push(p); prompted = true;
          addLog(st, ctx.owner, exact != null
            ? `เอฟเฟกต์ ${nameOf(st, ctx.src)}: คืนนรกให้ครบ ${exact} ใบกลับเด็ค (ไม่ครบ = เก็บไม่ได้)`
            : `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกจากนรกสูงสุด ${p.multiMax} ใบกลับเด็ค (ข้ามได้เมื่อพอใจ)`);
        } else if (exact != null) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เก็บไม่ได้ — ไม่มีการ์ดในนรก`);
          if (ctx.onceTag) unclaimOncePerTurn(st, ctx.src, ctx.onceTag);
        } else {
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
      } else if (ac.op === 'rpsRevealLoserLife') {
        st.prompts.push({
          kind: 'rps', src: ctx.src, chooser: ctx.owner, picks: {},
          seconds: ac.seconds || 10, srcToHell: !!ctx.toHellAfter,
          then: 'revealLoserLife', lifeCount: ac.count || 1
        });
        prompted = true;
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เป่ายิ้งฉุบ! ผู้แพ้หงาย LIFE ใบบนสุด`);
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
        const got = takeFromDeckToHand(st, ctx.owner, n, fx).length;
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
      } else if (ac.op === 'storyEvolve') {
        const filt = Object.assign({ type: 'Avatar' }, ac.filter || {});
        const ids = (st.zones[ctx.owner + '.hand'] || []).filter(id => matchFilterEx(st, id, filt));
        if (!ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar เรื่องราว Cost 6 ในมือให้แสดง`);
        else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner,
            filter: filt, dest: 'storyEvolve', optional: false, allowAnyZone: true,
            powerBonus: ac.powerBonus || 0
          });
          prompted = true;
          addLog(st, ctx.owner, `แสดง Avatar "เรื่องราว" Cost 6 จากมือ แล้วเนรเทศ ${nameOf(st, ctx.src)} เพื่ออัญเชิญ`);
        }
      } else if (ac.op === 'drawIfOwnHellTypeMin') {
        const n = countOwnHellType(st, ctx.owner, ac.hellType || 'Magic');
        if (n >= (ac.min || 8)) {
          const got = takeFromDeckToHand(st, ctx.owner, ac.count || 1, fx).length;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นรกมี Magic ${n} ≥ ${ac.min || 8} → จั่ว ${got} ใบ`);
          fx.snd = 'draw';
        }
      } else if (ac.op === 'oppExileHellChoose') {
        const spec = ac.ifOwnHellTypeMin || {};
        const n = countOwnHellType(st, ctx.owner, spec.type || ac.hellType || 'Magic');
        const min = spec.min != null ? spec.min : (ac.min || 8);
        if (n < min) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: Magic ในนรก ${n} < ${min} — ไม่เนรเทศจากนรกศัตรู`);
        else {
          const opp = other(ctx.owner);
          const hell = (st.zones[opp + '.hell'] || []).slice();
          if (!hell.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นรกฝ่ายตรงข้ามว่าง — ข้ามเนรเทศ`);
          else {
            st.prompts.push({
              kind: 'pick', from: 'ids', ids: hell, src: ctx.src, chooser: opp,
              dest: 'dark', optional: false, allowAnyZone: true
            });
            prompted = true;
            addLog(st, opp, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ด 1 ใบจากนรกตนเองเนรเทศลงมิติมืด`);
          }
        }
      } else if (ac.op === 'cancelLethalEndOppTurn') {
        // เพนกวิ้น ฮัท: ยกเลิกท่าปิดเกม + จบเทิร์นฝ่ายโจมตี (ไม่ถามอีกฝ่าย)
        const pl = st.pendingLethal;
        if (!pl || pl.target !== ctx.owner)
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีท่าปิดเกมให้ยกเลิก`);
        else finishLethalBegGranted(st, fx, pl, ctx.rng || Math.random, 'penguin');
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
            if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false, bySelfAbility: !!ac.bySelfAbility });
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'bounceOwnThenSummonSelf') {
        /* นินจา: เด้ง Avatar ฝ่ายเรา N ใบขึ้นมือ แล้วอัญเชิญตัวเองจากมือ (bySelfAbility) */
        const need = ac.count || 1;
        const filter = Object.assign({ type: 'Avatar' }, ac.filter || {});
        const cands = (st.zones[ctx.owner + '.avatar'] || []).filter(id => matchFilterEx(st, id, filter));
        if (cands.length < need) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ต้องมี Avatar ตรงเงื่อนไข ≥ ${need} ใบบนสนาม (มี ${cands.length})`);
          const c0 = st.inst[ctx.src];
          if (c0 && c0.name) unclaimOncePerTurn(st, 'name:' + c0.name, 'activatedFromHand');
        } else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: cands.slice(), src: ctx.src, chooser: ctx.owner,
            filter, dest: 'ninjaBounceSummon', multiExact: need, multiGot: 0,
            optional: false, allowAnyZone: true, bySelfAbility: true
          });
          prompted = true;
          addLog(st, ctx.owner, `สั่งใช้จากมือ ${nameOf(st, ctx.src)}: เลือก Avatar ${need} ใบนำขึ้นมือ แล้วอัญเชิญตัวเอง`);
        }
      } else if (ac.op === 'summonSelfFromDark') {
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c || !z.endsWith('.dark')) addLog(st, 'S', `อัญเชิญจากมิติมืดไม่ได้`);
        else {
          const qd = quotaDeny(st, ctx.owner + '.avatar', c);
          if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
          else {
            doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
            addLog(st, ctx.owner, `อัญเชิญ ${c.name} จากมิติมืด`);
            if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false, bySelfAbility: !!ac.bySelfAbility });
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'grantSelfAbilities') {
        const c = st.inst[ctx.src];
        if (c && (ac.abilities || []).length) {
          c.granted = (c.granted || []).concat(JSON.parse(JSON.stringify(ac.abilities)));
          addLog(st, ctx.owner, `${c.name} ได้รับความสามารถเพิ่ม`);
        }
      } else if (ac.op === 'oppHellPick') {
        const opp = other(ctx.owner);
        const p = {
          kind: 'pick', from: 'ids',
          ids: (st.zones[opp + '.hell'] || []).slice(),
          src: ctx.src, chooser: ctx.owner, filter: ac.filter || {},
          dest: 'oppHellToHandThenDiscard', optional: !!ac.optional, allowAnyZone: true,
          thenDiscard: ac.thenDiscard != null ? ac.thenDiscard : 1
        };
        if (promptCandidates(st, p).length) {
          st.prompts.push(p); prompted = true;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Magic ปกติ/Modification จากนรกฝ่ายตรงข้ามขึ้นมือ`);
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในนรกฝ่ายตรงข้าม`);
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
        // เทพผดุงธรรม: สอดแนม N ใบ (โชว์ก่อน) → ทั้งชุดขึ้นมือ → เนรเทศศัตรู Cost ≤ ผลรวม
        const n = ac.count || 2;
        const deck = st.zones[ctx.owner + '.deck'] || [];
        const ids = deck.slice(-Math.min(n, deck.length)).reverse();
        if (!ids.length) addLog(st, 'S', `สอดแนมไม่ได้`);
        else {
          const sum = ids.reduce((s, id) => s + effCost(st, id), 0);
          addLog(st, ctx.owner, `สอดแนม ${ids.length} ใบ (รวม Cost ${sum}) — ดูการ์ดแล้วกดรับขึ้นมือ`);
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner,
            dest: 'scoutAllHandThenExile', filter: {}, optional: true,
            revealAllScout: true, scoutCostSum: sum
          });
          lockScoutIds(st, ids);
          prompted = true;
        }
      } else if (ac.op === 'replaceSelfWithHellNarai') {
        // นรสิง/เกษียรสมุทร จบเทิร์น: ส่งตัวเองลงนรก → เลือกพระนารายณ์จากนรกอัญเชิญกลับ (บังคับเลือก)
        if ((zoneOf(st, ctx.src) || '').endsWith('.avatar')) {
          doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
          addLog(st, ctx.owner, `End Phase: ${nameOf(st, ctx.src)} กลับนรก — เลือกพระนารายณ์อัญเชิญแทน`);
          const hell = (st.zones[ctx.owner + '.hell'] || []).filter(id => {
            if (id === ctx.src) return false;
            const c = st.inst[id]; if (!c) return false;
            // เฉพาะพระนารายณ์จริง — ไม่รวมร่างอวตารอื่น
            if ((c.name || '').includes('ร่างอวตาร')) return false;
            return nameMatches(c, 'พระนารายณ์');
          });
          if (!hell.length) addLog(st, 'S', `End Phase: ไม่มีพระนารายณ์ในนรกให้อัญเชิญ`);
          else {
            st.prompts.push({
              kind: 'pick', from: 'ids', ids: hell, src: ctx.src, chooser: ctx.owner,
              dest: 'avatar', paidCost: false, optional: false, allowAnyZone: true,
              naraiReturn: true
            });
            prompted = true;
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
        const mzAvatars = (st.zones[opp + '.magic'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar');
        const targets = (st.zones[opp + '.avatar'] || []).slice().concat(mzAvatars);
        // กันต้นมะม่วงก่อนทำลายใคร — ถ้าผู้พิทักษ์โดนก่อนในลูปเดียวกัน ต้นจะไม่ควรถูกปลดกันกลางทาง
        const guarded = new Set(targets.filter(t => protectOwnMagicFromOpp(st, t)));
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย Avatar บนสนามฝั่ง ${opp} ทั้งหมด (${targets.length} ใบ)`);
        targets.forEach(t => {
          const opts = destroyOptsFromMagic(st, ctx.src, t);
          if (guarded.has(t)) {
            addLog(st, 'S', `${nameOf(st, t)} บน Magic Zone ถูกผู้พิทักษ์กันทำลายจากความสามารถฝ่ายตรงข้าม`);
            return;
          }
          destroyCard(st, fx, t, opts);
        });
        fx.snd = 'clash';
      } else if (ac.op === 'destroy' || ac.op === 'destroyTarget') {
        if (ac.ifOwnHellTypeMin) {
          const spec = ac.ifOwnHellTypeMin;
          const n = countOwnHellType(st, ctx.owner, spec.type || 'Magic');
          if (n < (spec.min || 8)) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: Magic ในนรก ${n} < ${spec.min || 8} — ไม่ทำลาย`);
            return;
          }
        }
        let tgt = null;
        if (ac.target && ac.target.select === 'triggerSource') tgt = ctx.triggerSource || ctx.target;
        else if (ac.target && ac.target.select === 'self') tgt = ctx.src;
        else if (ctx.target) tgt = ctx.target;
        if (tgt && st.inst[tgt] && zoneOf(st, tgt)) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย ${nameOf(st, tgt)}`);
          destroyCard(st, fx, tgt, destroyOptsFromMagic(st, ctx.src, tgt)); fx.snd = 'clash';
        } else if (ac.target && ac.target.select === 'choose') {
          const side = ac.target.side === 'enemy' ? 'enemyAvatars' : ac.target.side === 'own' ? 'ownAvatars' : 'allAvatars';
          const filt = Object.assign({}, ac.target);
          delete filt.select; delete filt.side; delete filt.count;
          // then = รันหลังทำลายสำเร็จเท่านั้น (นรสิง: นัดเปลี่ยนร่างตอนจบเทิร์น)
          const p = { kind: 'pick', from: side, src: ctx.src, chooser: ctx.owner, filter: filt, dest: 'destroy', optional: !!ac.optional, then: ac.then || null };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือก Avatar ทำลาย`); }
          else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าทำลาย — ไม่เปลี่ยนร่างตอนจบเทิร์น`);
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
        take.forEach(id => {
          st.zones[ctx.owner + '.hand'].push(id); // temp then attach
          if (st.inst[id]) st.inst[id].faceUp = true;
        });
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
        if (host && st.inst[host] && tryUntap(st, host, ctx.src)) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ตื่น ${nameOf(st, host)}`);
        }
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
        const chooser = ac.chooser === 'opp' ? other(ctx.owner) : ctx.owner;
        let from = ac.from === 'own' ? 'ownAvatars' : ac.from === 'enemy' ? 'enemyAvatars' : ac.from === 'any' ? 'allAvatars' : ac.from === 'ownMagic' ? 'ownMagic' : 'ownAvatars';
        const p = {
          kind: 'pick', from, src: ctx.src, chooser, filter: ac.filter || {},
          dest: ac.dest || 'bounceHand', optional: !ac.required, then: ac.then || null, srcToHell: !!ctx.toHellAfter,
          allowAnyZone: false
        };
        if (ac.from === 'ownerMagic') {
          p.from = 'ids';
          p.ids = (st.zones[ctx.owner + '.magic'] || []).slice();
          p.allowAnyZone = true;
        }
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`);
          if (ac.required) ctx._abortActions = true;
        }
      } else if (ac.op === 'returnToHand') {
        // บังคับคืนขึ้นมือโดยไม่ต้องเลือก (ใช้กับตัวเอง) หรือเลือก
        if (ac.target === 'self' || (ac.target && ac.target.select === 'self')) {
          if (zoneOf(st, ctx.src)) {
            if ((zoneOf(st, ctx.src) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, ctx.src, {
                type: 'move', to: ctx.owner + '.hand', who: ctx.owner, k: ctx.src
              })) {
              prompted = true;
            } else {
              doMove(st, ctx.src, ctx.owner + '.hand', null, fx);
              addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: กลับขึ้นมือ`);
            }
          }
        } else {
          const p = { kind: 'pick', from: ac.from === 'own' ? 'ownAvatars' : ac.from === 'any' ? 'allAvatars' : 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'bounceHand', optional: !!ac.optional, srcToHell: !!ctx.toHellAfter };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
          else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าให้นำขึ้นมือ`);
        }
      } else if (ac.op === 'sacrifice' && !ctx._asCost) {
        // เซ่นไหว้เป็นผลของเอฟเฟกต์ (อ๊บ / พระพรหม) — then = ผลหลังเซ่น
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' }, dest: 'sacrificeOnly', optional: false, then: ac.then || null, includeSelf: !!ac.includeSelf };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar เซ่นไหว้`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ให้เซ่นไหว้`);
      } else if (ac.op === 'revealOwnLife') revealOwnLife(st, ctx.owner, ac.count || 1);
      else if (ac.op === 'unrevealOwnLife') unrevealOwnLife(st, ctx.owner, ac.count || 1, ctx.rng);
      else if (ac.op === 'counterSelf') {
        if (st.inst[ctx.src]) { st.inst[ctx.src].counters += ac.amount || 1; addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เคาน์เตอร์ +${ac.amount || 1}`); }
      } else if (ac.op === 'sacrificeSelf') {
        if (st.inst[ctx.src] && zoneOf(st, ctx.src)) { addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เซ่นไหว้ตัวเอง (ลงนรก)`); destroyCard(st, fx, ctx.src); }
      } else if (ac.op === 'destroySelfAtEndPhase') {
        st.scheduled.push({ player: st.active, op: 'destroyCard', k: ctx.src, when: 'endPhase' });
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จะถูกทำลายช่วง End Phase`);
      } else if (ac.op === 'grantKeyword') {
        const p = { kind: 'pick', from: ac.from === 'any' ? 'allAvatars' : 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' }, dest: 'grantKeyword', keyword: ac.keyword || 'สามัคคี', until: ac.until || ac.duration || 'endOfTurn', optional: false, srcToHell: !!ctx.toHellAfter, includeSelf: ac.includeSelf !== false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ให้รับ "${ac.keyword}"`);
      } else if (ac.op === 'grantCannotChangeState') {
        const p = {
          kind: 'pick', from: ac.from === 'own' ? 'ownAvatars' : ac.from === 'any' ? 'allAvatars' : 'enemyAvatars',
          src: ctx.src, chooser: ctx.owner, filter: ac.filter || { type: 'Avatar' },
          dest: 'grantCannotChangeState', optional: !!ac.optional, srcToHell: !!ctx.toHellAfter
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ให้ผนึกสภาพ`);
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
      } else if (ac.op === 'setAlliesPowerToSelf') {
        const srcP = effPower(st, ctx.src);
        const filt = Object.assign({}, ac.filter || {}, { _srcK: ctx.src });
        let n = 0;
        (st.zones[ctx.owner + '.avatar'] || []).forEach(id => {
          if (id === ctx.src) return;
          if (!matchFilterEx(st, id, filt)) return;
          const cur = effPower(st, id);
          const amt = srcP - cur;
          st.buffs.push({ k: id, amt, until: 'endOfTurn', from: ctx.src });
          n++;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, id)} POWER = ${srcP} จนจบเทิร์น`);
        });
        if (!n) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ฝ่ายเราตรงเงื่อนไข`);
      } else if (ac.op === 'grantCostPower') {
        const p = { kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'grantCostPower', costDelta: ac.costDelta || 1, powerDelta: ac.powerDelta || 1, optional: false };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`);
      } else if (ac.op === 'returnHandToDeck') {
        const p = {
          kind: 'chooseDiscard', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          actions: ac.then || ac.actions || [], optional: false, effectDiscard: true,
          toDeck: true, toDeckBottom: ac.pos === 'bottom'
        };
        if (!promptCandidates(st, p).length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดในมือ`);
        else {
          st.prompts.push(p); prompted = true;
          addLog(st, ctx.owner, ac.pos === 'bottom'
            ? `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดในมือวางไว้ล่างสุดเด็ค`
            : `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกการ์ดในมือคืนเด็ค`);
        }
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
          sweepDestroyPowerZero(st, fx);
        }
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'combatOwn') {
        let tgt = null;
        if (st.pending) {
          if (ownerOf(st, st.pending.atk) === ctx.owner) tgt = st.pending.atk;
          else if (st.pending.def && ownerOf(st, st.pending.def) === ctx.owner) tgt = st.pending.def;
        }
        if (!tgt && ctx.attacker && ownerOf(st, ctx.attacker) === ctx.owner) tgt = ctx.attacker;
        if (!tgt && ctx.target && ownerOf(st, ctx.target) === ctx.owner) tgt = ctx.target;
        if (tgt && st.inst[tgt]) {
          st.buffs.push({ k: tgt, amt: ac.amount || 0, until: 'endOfTurn', from: ctx.src });
          if ((ac.amount || 0) > 0) notePowerBuff(st, tgt, ac.amount);
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, tgt)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0} จนจบเทิร์น → P${effPower(st, tgt)}`);
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ฝ่ายเราในการต่อสู้`);
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
        if (st.inst[ctx.src]) {
          const until = ac.duration === 'oppNextEnd' ? 'oppNextEnd' : (ac.duration === 'nextOwnDraw' ? 'nextOwnDraw' : (ac.duration === 'permanent' ? 'permanent' : (ac.duration === 'combat' ? 'combat' : 'endOfTurn')));
          let amt = ac.amount || 0;
          if (ac.amountPer === 'ownHellPerN') {
            const perN = ac.perN || 5;
            amt += (ac.per || 1) * Math.floor((st.zones[ctx.owner + '.hell'] || []).length / perN);
          }
          const buff = { k: ctx.src, amt, until, from: ctx.src };
          if (until === 'oppNextEnd') buff.opp = other(ctx.owner);
          st.buffs.push(buff);
          if (amt > 0) notePowerBuff(st, ctx.src, amt);
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: POWER ${amt > 0 ? '+' : ''}${amt}${until === 'oppNextEnd' ? ' จน End Phase ถัดไปของฝ่ายตรงข้าม' : until === 'nextOwnDraw' ? ' จน Draw Phase ต่อไปของเรา' : until === 'permanent' ? ' ถาวร' : until === 'combat' ? ' จนจบการต่อสู้' : ' จนจบเทิร์น'} → P${effPower(st, ctx.src)}`);
          sweepDestroyPowerZero(st, fx);
        }
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'summoned') {
        const sk = ctx.summoned;
        if (sk && st.inst[sk]) {
          const until = ac.duration === 'permanent' ? 'permanent' : (ac.duration === 'combat' ? 'combat' : 'endOfTurn');
          st.buffs.push({ k: sk, amt: ac.amount || 0, until, from: ctx.src });
          if ((ac.amount || 0) > 0) notePowerBuff(st, sk, ac.amount);
          addLog(st, ctx.owner, `เอฟเฟกต์ ${ctx.payName || nameOf(st, ctx.src)}: ${nameOf(st, sk)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${until === 'permanent' ? '' : ' จนจบเทิร์น'}`);
          sweepDestroyPowerZero(st, fx);
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
      } else if (ac.op === 'setPrintedPower') {
        const c = st.inst[ctx.src];
        if (c) {
          c.power = ac.amount != null ? ac.amount : (ac.power != null ? ac.power : c.power);
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: POWER ตั้งต้นเป็น ${c.power}`);
        }
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'all') {
        const side = ac.target.side, sides = side === 'own' ? [ctx.owner] : side === 'enemy' ? [other(ctx.owner)] : ['A', 'B'];
        let cnt = 0;
        const needles = ac.target.nameIncludes
          ? (Array.isArray(ac.target.nameIncludes) ? ac.target.nameIncludes : [ac.target.nameIncludes])
          : null;
        const until = ac.duration === 'nextOwnDraw' ? 'nextOwnDraw'
          : ac.duration === 'permanent' ? 'permanent'
          : ac.duration === 'combat' ? 'combat' : 'endOfTurn';
        const untilTxt = until === 'nextOwnDraw' ? ' จน Draw Phase ต่อไปของเรา'
          : until === 'permanent' ? ' จนกว่าออกจากสนาม'
          : until === 'combat' ? ' จนจบการต่อสู้' : ' จนจบเทิร์น';
        sides.forEach(s => (st.zones[s + '.avatar'] || []).forEach(k => {
          const x = st.inst[k]; if (!x) return;
          if (ac.target.type && x.type !== ac.target.type) return;
          if (ac.target.symbol && x.symbol !== ac.target.symbol) return;
          if (needles && !needles.some(n => nameMatches(x, n))) return;
          st.buffs.push({ k, amt: ac.amount || 0, until, from: ctx.src });
          cnt++;
        }));
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0} กับ ${cnt} ตัว${untilTxt}`);
        if (cnt) sweepDestroyPowerZero(st, fx);
      } else if (ac.op === 'handCostMod') {
        st.handCostMods = st.handCostMods || [];
        st.handCostMods.push({
          owner: ctx.owner,
          nameIncludes: ac.nameIncludes || '',
          amount: ac.amount || -1,
          until: ac.until || 'endOfTurn'
        });
        addLog(st, ctx.owner, `Cost บนมือ「${ac.nameIncludes || '?'}」 ${ac.amount > 0 ? '+' : ''}${ac.amount || -1} จนจบเทิร์น`);
      } else if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'choose') {
        const p = {
          kind: 'chooseBuff', src: ctx.src, chooser: ctx.owner, amt: ac.amount,
          side: (ac.target.side) || 'any', ftype: ac.target.type || 'Avatar',
          fsymbol: ac.target.symbol || '', fnameIncludes: ac.target.nameIncludes || null,
          srcToHell: !!ctx.toHellAfter, destroyAtEnd: !!ac.destroyAtEnd,
          until: (ac.duration === 'permanent' || ac.until === 'permanent') ? 'permanent' : 'endOfTurn'
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าหมายให้เลือก — ข้าม`);
      } else if (ac.op === 'chooseDestroy') {
        const srcC = st.inst[ctx.src];
        const fromMagic = srcC && srcC.type === 'Magic';
        let filter = Object.assign({}, ac.filter || {});
        if (ac.costMaxPlusOwnMagicNameIncludes) {
          const spec = ac.costMaxPlusOwnMagicNameIncludes;
          const n = countOwnMagicNameIncludes(st, ctx.owner, spec.nameIncludes || spec.name);
          filter.costMax = (spec.base != null ? spec.base : (filter.costMax != null ? filter.costMax : 0)) + n * (spec.per || 1);
        }
        const p = {
          kind: 'chooseDestroy', src: ctx.src, chooser: ctx.owner, filter, zones: ac.zones, side: ac.side || null,
          srcToHell: !!ctx.toHellAfter, optional: !!ac.optional,
          fromOppMagic: fromMagic && ac.side === 'enemy', fromOppCard: fromMagic && ac.side === 'enemy'
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าหมายให้ทำลาย — ข้าม`);
      } else if (ac.op === 'destroyHighestPower') {
        const ot = other(ctx.owner);
        const ids = (st.zones[ot + '.avatar'] || []).filter(id => st.inst[id] && st.inst[id].faceUp !== false);
        if (!ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ฝ่ายตรงข้าม`);
        else {
          let max = -1;
          ids.forEach(id => { const p = effPower(st, id); if (p > max) max = p; });
          const tops = ids.filter(id => effPower(st, id) === max);
          if (tops.length === 1) {
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย ${nameOf(st, tops[0])} (POWER สูงสุด)`);
            destroyCard(st, fx, tops[0], destroyOptsFromSrc(st, ctx.src, tops[0]));
            fx.snd = 'clash';
          } else {
            st.prompts.push({
              kind: 'pick', from: 'ids', ids: tops, src: ctx.src, chooser: ctx.owner,
              dest: 'destroy', optional: false, allowAnyZone: true
            });
            prompted = true;
            addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือกทำลาย Avatar POWER ${max}`);
          }
        }
      } else if (ac.op === 'bothReshuffleHandDraw') {
        const n = ac.count || 4;
        ['A', 'B'].forEach(side => {
          const hand = st.zones[side + '.hand'] || [];
          while (hand.length) {
            const id = hand.pop();
            st.zones[side + '.deck'].push(id);
          }
          seededShuffle(st.zones[side + '.deck'], ctx.rng || (() => 0.5));
          const got = takeFromDeckToHand(st, side, n, fx).length;
          addLog(st, side, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: คืนมือเข้าเด็ค สับ แล้วจั่ว ${got} ใบ`);
        });
        syncHeimdall(st);
        fx.snd = 'draw';
      } else if (ac.op === 'fewestHandAvatarsRevealLife') {
        const n = ac.count || 2;
        const counts = {};
        ['A', 'B'].forEach(side => {
          counts[side] = (st.zones[side + '.hand'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar').length;
          (st.zones[side + '.hand'] || []).forEach(id => {
            if (st.inst[id] && st.inst[id].type === 'Avatar') st.inst[id].revealed = true;
          });
        });
        const min = Math.min(counts.A, counts.B);
        ['A', 'B'].forEach(side => {
          if (counts[side] !== min) return;
          addLog(st, side, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: Avatar ในมือน้อยสุด (${min}) — หงาย LIFE ${n} ใบ`);
          revealOwnLife(st, side, n);
        });
      } else if (ac.op === 'drawAllToMaxHand') {
        const sizeOf = s => (st.zones[s + '.hand'] || []).length;
        const max = Math.max(sizeOf('A'), sizeOf('B'));
        ['A', 'B'].forEach(side => {
          const nDraw = max - sizeOf(side);
          if (nDraw <= 0) return;
          const got = takeFromDeckToHand(st, side, nDraw, fx).length;
          addLog(st, side, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จั่วให้เท่ามือมากสุด (${max}) ได้ ${got} ใบ`);
        });
        fx.snd = 'draw';
      } else if (ac.op === 'partyMostHandDiscardThenDrawToMax') {
        const nDisc = ac.discard || 2;
        const sizeOf = s => (st.zones[s + '.hand'] || []).length;
        const max0 = Math.max(sizeOf('A'), sizeOf('B'));
        const who = ['A', 'B'].filter(s => sizeOf(s) === max0 && sizeOf(s) > 0);
        const drawOp = { op: 'drawAllToMaxHand' };
        if (!who.length) {
          runActions(st, fx, [drawOp], ctx);
        } else {
          const first = who[0];
          const rest = who.slice(1);
          let thenActs = [drawOp];
          for (let i = rest.length - 1; i >= 0; i--) {
            thenActs = [{ op: 'discard', count: nDisc, who: rest[i], then: thenActs }];
          }
          const need = Math.min(nDisc, sizeOf(first));
          const p = {
            kind: 'chooseDiscard', src: ctx.src, chooser: first, filter: ac.filter,
            actions: thenActs, optional: false, effectDiscard: true,
            discardNeed: need > 1 ? need : undefined, discardGot: 0
          };
          if (promptCandidates(st, p).length < need) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: มือไม่พอทิ้ง — จั่วให้เท่ากันเลย`);
            runActions(st, fx, thenActs, ctx);
          } else {
            st.prompts.push(p); prompted = true;
            addLog(st, first, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: มือเยอะสุด — ทิ้ง ${need} ใบ`);
          }
        }
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
      } else if (ac.op === 'diceLowestDeckBottomAllAvatars') {
        // ลุ้นเยี่ยวเหนียว: ทั้งสองฝ่ายทอย — แต้มน้อยสุด Avatar ทั้งหมดกลับใต้เด็ค (เสมอ = ทั้งคู่)
        if (!(st.zones['A.avatar'] || []).length || !(st.zones['B.avatar'] || []).length) {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ต้องมี Avatar ทั้งสองฝ่าย`);
        } else {
          const rng = ctx.rng || (() => 0.5);
          const rollA = 1 + Math.floor(rng() * 6);
          const rollB = 1 + Math.floor(rng() * 6);
          addLog(st, 'S', `🎲 ${nameOf(st, ctx.src)}: A ทอยได้ ${rollA} · B ทอยได้ ${rollB}`);
          fx.dice = rollA;
          fx.tool = `A=${rollA} B=${rollB}`;
          const losers = rollA < rollB ? ['A'] : rollB < rollA ? ['B'] : ['A', 'B'];
          losers.forEach(side => {
            const ids = (st.zones[side + '.avatar'] || []).slice();
            ids.forEach(id => {
              doMove(st, id, side + '.deck', 'bottom', fx);
            });
            if (ids.length) {
              addLog(st, side, `ทอยต่ำสุด (${side === 'A' ? rollA : rollB}) — Avatar ${ids.length} ใบกลับใต้เด็ค`);
              fx.snd = 'draw';
            }
          });
          if (st.pending) {
            const atkId = st.pending.atk;
            const atkGone = !(atkId && st.inst[atkId] && (zoneOf(st, atkId) || '').endsWith('.avatar'));
            if (atkGone) {
              st.pending = null;
              ctx.cancelAttack = true;
              addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่บนสนามแล้ว');
            }
          }
          fx.snd = fx.snd || 'dice';
        }
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
            const e = fxId(st, id);
            if (e && e.scoutBonusOwnKapom) count += e.scoutBonusOwnKapom;
          });
        }
        (st.zones[ctx.owner + '.construct'] || []).forEach(id => {
          const e = fxId(st, id);
          if (e && e.scoutBonusConstruct) count += e.scoutBonusConstruct;
        });
        let ids = (st.zones[ctx.owner + '.deck'] || []).slice(-Math.min(count, (st.zones[ctx.owner + '.deck'] || []).length)).reverse();
        if (!ids.length) {
          addLog(st, 'S', `สอดแนมไม่ได้ — เด็คหมด`);
          checkDeckEmptyLoss(st, fx, ctx.owner);
          return;
        }
        // คนแก่ฯ: ถูกสอดแนมโดยผู้รู้ความจริง → อัญเชิญ (ไม่จุติ)
        {
          const kept = [];
          ids.forEach(id => {
            const e = fxId(st, id);
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
        // (เลื่อนขึ้นมือหลังโชว์ทุกใบในหน้าต่างสอดแนม — เก็บใน autoHandIds)
        const autoHandIds = [];
        ids.forEach(id => {
          const e = fxId(st, id);
          const byName = e && (e.addToHandWhenScoutedByNameIncludes || e.addToHandWhenMilledOrScoutedByNameIncludes);
          if (byName && nameMatches(st.inst[ctx.src], byName)) autoHandIds.push(id);
        });
        // ยุคกาฬสินธุ์ฯ: ถ้าสอดแนมโดย Avatar กะปอม → วาง Land จากเด็คทันที
        if (cardSymbols(st, ctx.src).includes('กะปอม')) {
          const kept = [];
          ids.forEach(id => {
            const e = fxId(st, id);
            if (e && e.placeLandWhenScoutedByKapom && isLandMagic(st.inst[id])) {
              clearLandZoneFor(st, fx, id);
              doMove(st, id, 'land', null, fx);
              st.inst[id].faceUp = true;
              st.inst[id].controller = ctx.owner;
              addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, id)}: ถูกสอดแนมโดยกะปอม → วางบน Land Zone จากเด็ค`);
              fx.snd = 'place';
              sweepDestroyPowerZero(st, fx);
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
          // ไม่มีหน้าต่างโชว์สอดแนม — ขึ้นมืออัตโนมัติทันที
          flushScoutAutoHand(st, fx, { chooser: ctx.owner, src: ctx.src, autoHandIds, ids });
          ids = ids.filter(id => (st.zones[ctx.owner + '.deck'] || []).includes(id));
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
          const dest = ac.dest === 'nongSam' ? 'hand' : (ac.dest || 'hand');
          const restTo = ac.restTo === 'choose' ? 'bottom' : (ac.restTo || 'bottom');
          const fieldFull = dest === 'avatar' && restTo === 'hell'
            && !!quotaDeny(st, ctx.owner + '.avatar', { type: 'Avatar' });
          if (fieldFull) addLog(st, ctx.owner, `Avatar Zone เต็ม — สอดแนมให้ดูได้ แต่ลงสนามไม่ได้ (เลือก/ข้ามแล้วลงนรก ไม่ขึ้นมือ)`);
          st.prompts.push({
            kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner, filter: pickFilter,
            dest,
            restTo,
            shuffleAfter: !!ac.shuffleAfter,
            optional: ac.multiExact ? false : true, srcToHell: !!ctx.toHellAfter, paidCost: !!ac.paidCost,
            thenIfFound: ac.thenIfFound || null, thenIfColor: ac.thenIfColor || null,
            attacker: ctx.attacker || null,
            summonCostMax: ac.summonCostMax != null ? ac.summonCostMax : null,
            multiExact: ac.multiExact || null, multiMax: ac.multiMax || null,
            summonedByAvatar: (st.inst[ctx.src] && st.inst[ctx.src].type === 'Avatar') ? st.inst[ctx.src] : null,
            attachHostFilter: ac.attachHostFilter || null,
            thenDestroyAttackerIfAttached: !!ac.thenDestroyAttackerIfAttached,
            autoHandIds: autoHandIds.slice(),
            revealAllScout: true,
            onceTag: ctx.onceTag || null
          });
          lockScoutIds(st, ids);
          fx.scoutView = { p: ctx.owner, n: ids.length }; // เปิดหน้าต่างให้ทั้งสองฝั่งเห็น
          prompted = true;
        }
      } else if (ac.op === 'deckPick') {
        const p = {
          kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: ac.dest || 'hand',
          shuffleAfter: !!ac.shuffleAfter, optional: true, srcToHell: !!ctx.toHellAfter, paidCost: !!ac.paidCost,
          summonTapped: !!ac.summonTapped, summonUntappedIfLandNameIncludes: ac.summonUntappedIfLandNameIncludes || null,
          scheduleDestroyAfterOppTurn: !!ac.scheduleDestroyAfterOppTurn, thenIfColor: ac.thenIfColor || null,
          thenIfFound: ac.thenIfFound || null, thenIfExactName: ac.thenIfExactName || null,
          autoPickThenName: !!ac.autoPickThenName, autoPickOnly: !!ac.autoPickOnly,
          multiMax: ac.multiMax || null, multiGot: 0,
          costSumMax: ac.costSumMax != null ? ac.costSumMax : null, costGot: 0,
          summonedByAvatar: (st.inst[ctx.src] && st.inst[ctx.src].type === 'Avatar') ? st.inst[ctx.src] : null,
          then: ac.then || null
        };
        const deckCands = promptCandidates(st, p);
        if (deckCands.length) {
          addLog(st, ctx.owner, `ค้นหาการ์ดในเด็คด้วยเอฟเฟกต์ ${nameOf(st, ctx.src)}`);
          const autoName = p.autoPickThenName ? p.thenIfExactName : null;
          const autoK = (autoName && deckCands.find(id => (st.inst[id] && st.inst[id].name) === autoName))
            || (p.autoPickOnly && deckCands.find(id => cardIsOnly(st.inst[id])));
          if (autoK) {
            st.prompts.push(p);
            const inner = applyAction(st, { type: 'chooseTarget', k: autoK, by: ctx.owner, seed: 1 });
            if (inner) Object.keys(inner).forEach(key => { if (key !== 'deny' && inner[key] != null) fx[key] = inner[key]; });
            prompted = !!(st.prompts || []).length;
          } else {
            st.prompts.push(p); prompted = true;
          }
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในเด็ค`);
      } else if (ac.op === 'deckOrHellPick') {
        const p = {
          kind: 'pick', from: 'deckOrHell', src: ctx.src, chooser: ctx.owner, filter: ac.filter || {},
          dest: ac.dest || 'hand', optional: true, srcToHell: !!ctx.toHellAfter, paidCost: !!ac.paidCost,
          shuffleAfterIfFromDeck: ac.shuffleAfterIfFromDeck !== false,
          autoPickOnly: !!ac.autoPickOnly,
          summonedByAvatar: (st.inst[ctx.src] && st.inst[ctx.src].type === 'Avatar') ? st.inst[ctx.src] : null
        };
        const orCands = promptCandidates(st, p);
        if (orCands.length) {
          addLog(st, ctx.owner, `ค้นหาการ์ดในเด็คหรือนรกด้วยเอฟเฟกต์ ${nameOf(st, ctx.src)}`);
          const autoK = p.autoPickOnly && orCands.find(id => cardIsOnly(st.inst[id]));
          if (autoK) {
            st.prompts.push(p);
            const inner = applyAction(st, { type: 'chooseTarget', k: autoK, by: ctx.owner, seed: 1 });
            if (inner) Object.keys(inner).forEach(key => { if (key !== 'deny' && inner[key] != null) fx[key] = inner[key]; });
            prompted = !!(st.prompts || []).length;
          } else {
            st.prompts.push(p); prompted = true;
          }
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในเด็คหรือนรก`);
      } else if (ac.op === 'hellPick') {
        let filter = Object.assign({}, ac.filter || {});
        if (ctx.sacrificed) {
          if (filter.sameSymbolAs === 'sacrificed') { filter.symbol = ctx.sacrificed.symbol; delete filter.sameSymbolAs; }
          if (filter.samePowerAs === 'sacrificed') { filter.power = ctx.sacrificed.power; delete filter.samePowerAs; }
          if (filter.nameNot === 'sacrificed') { filter.nameNotEquals = ctx.sacrificed.name; delete filter.nameNot; }
        }
        const fromZ = ac.from === 'anyHell' ? 'anyHell' : 'hell';
        const p = {
          kind: 'pick', from: fromZ, src: ctx.src, chooser: ctx.owner, filter, dest: ac.dest || 'hand',
          optional: ac.optional != null ? !!ac.optional : true, paidCost: !!ac.paidCost,
          summonTapped: !!ac.summonTapped, summonUntappedIfLandNameIncludes: ac.summonUntappedIfLandNameIncludes || null,
          scheduleDestroyAfterOppTurn: !!ac.scheduleDestroyAfterOppTurn, multiMax: ac.multiMax || null, multiMin: ac.multiMin || null, multiGot: 0,
          distinctNames: !!ac.distinctNames, pickedNames: [],
          showAllHell: !!ac.showAll, grantSummoned: ac.grantSummoned || null, then: ac.then || null,
          shuffleAfter: !!ac.shuffleAfter, onceTag: ctx.onceTag || null,
          lockSummonAndAbility: !!ac.lockSummonAndAbility,
          thenAttachSrc: !!ac.thenAttachSrc,
          costSumMax: ac.costSumMax != null ? ac.costSumMax : null, costGot: 0,
          summonedByAvatar: (st.inst[ctx.src] && st.inst[ctx.src].type === 'Avatar') ? st.inst[ctx.src] : null
        };
        const hell = fromZ === 'anyHell'
          ? (st.zones['A.hell'] || []).concat(st.zones['B.hell'] || []).filter(x => x !== ctx.src)
          : (st.zones[ctx.owner + '.hell'] || []).filter(x => x !== ctx.src);
        const cands = promptCandidates(st, p);
        // showAll: เปิดนรกให้ดูเสมอ (แม้ไม่มีใบตรงเงื่อนไข) — ไม่นะโดม / อู๊ด / มณโท ฯลฯ
        if (ac.showAll || cands.length) {
          if (ac.showAll) p.showAllHell = true;
          st.prompts.push(p); prompted = true;
          const hellLabel = fromZ === 'anyHell' ? 'นรกใครก็ได้' : 'นรก';
          if (cands.length) addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เปิด${hellLabel} — เลือกได้ ${cands.length}/${hell.length} ใบ`);
          else addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เปิด${hellLabel} (${hell.length} ใบ) — ไม่มีใบตรงเงื่อนไข (ข้ามได้)`);
        } else {
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในนรก`);
          if (ac.optional === false) {
            ctx._abortActions = true;
            if (ctx.onceTag) unclaimOncePerTurn(st, ctx.src, ctx.onceTag);
          } else if (ac.then && ac.then.length) {
            runActions(st, fx, ac.then, { src: ctx.src, owner: ctx.owner, rng: ctx.rng });
          }
        }
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
        const p = {
          kind: 'pick', from: 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'takeControl', optional: ac.optional != null ? !!ac.optional : true,
          until: ac.until || 'endOfTurn', keepTapped: ac.keepTapped !== false,
          thenAttachSrc: !!ac.thenAttachSrc, srcToHell: !!ctx.toHellAfter
        };
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar ฝ่ายตรงข้ามให้ยึด`);
      } else if (ac.op === 'exile') {
        if (ac.target === 'self') { if (zoneOf(st, ctx.src)) { doMove(st, ctx.src, ctx.owner + '.dark', null, fx); addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เนรเทศตัวเองลงมิติมืด`); } }
        else { const p = { kind: 'pick', from: ac.from === 'own' ? 'ownAvatars' : ac.from === 'any' ? 'allAvatars' : 'enemyAvatars', src: ctx.src, chooser: ctx.owner, filter: ac.filter, dest: 'dark', optional: true };
          if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้าให้เนรเทศ`); }
      } else if (ac.op === 'tap' || ac.op === 'untap') {
        if (ac.target === 'self') {
          if (st.inst[ctx.src]) {
            if (ac.op === 'untap') {
              if (tryUntap(st, ctx.src, ctx.src)) addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ตื่นตัวเอง`);
            } else {
              if (cannotChangeState(st, ctx.src)) addLog(st, 'S', `${nameOf(st, ctx.src)} ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
              else {
                st.inst[ctx.src].tapped = true;
                addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นอนตัวเอง`);
              }
            }
          }
        }
        else if (ac.target === 'triggerSource' || (ac.target && ac.target.select === 'triggerSource')) {
          const t = ctx.triggerSource || ctx.target;
          if (t && st.inst[t]) {
            if (ac.op === 'untap') {
              if (tryUntap(st, t, ctx.src)) addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ตื่น ${nameOf(st, t)}`);
            } else {
              if (cannotChangeState(st, t)) addLog(st, 'S', `${nameOf(st, t)} ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
              else {
                st.inst[t].tapped = true;
                addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: นอน ${nameOf(st, t)}`);
              }
            }
          }
        } else {
          const filt = Object.assign({}, ac.filter || {}, { _srcK: ctx.src, excludeSelf: ac.excludeSelf !== false });
          const need = ac.multiExact || ac.count || 1;
          const p = {
            kind: 'pick', from: ac.from === 'enemy' ? 'enemyAvatars' : ac.from === 'any' ? 'allAvatars' : 'ownAvatars',
            src: ctx.src, chooser: ctx.owner, filter: filt, dest: ac.op,
            optional: ac.optional != null ? !!ac.optional : true,
            requireUntapped: ac.op === 'tap' && ac.requireUntapped !== false,
            multiExact: need > 1 ? need : null, multiGot: 0,
            then: ac.then || null
          };
          const cands = promptCandidates(st, p);
          if (cands.length < need) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ต้องมี Avatar ตรงเงื่อนไข${ac.op === 'tap' ? 'ที่ตื่น' : ''} ${need} ใบ (มี ${cands.length})`);
          } else {
            st.prompts.push(p); prompted = true;
            addLog(st, ctx.owner, ac.op === 'tap'
              ? `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar ที่ตื่น ${need} ใบให้นอน`
              : `เอฟเฟกต์ ${nameOf(st, ctx.src)}: เลือก Avatar ที่นอนให้ตื่น`);
          }
        }
      } else if (ac.op === 'negate') {
        if (st.chain && st.chain.length) { st.chain[st.chain.length - 1].negated = true; addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: 🚫 ยกเลิกความสามารถบนสุดของเชน`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีความสามารถบนเชนให้ยกเลิก`);
      } else if (ac.op === 'destroyAttacker') {
        // React: ทำลายตัวที่ประกาศโจมตี (ctx.attacker) — นับว่าถูกทำลาย (คำสั่งเสียทำงาน)
        const atk = ctx.attacker;
        if (atk && st.inst[atk] && (zoneOf(st, atk) || '').endsWith('.avatar')) {
          if (isImmuneOppMagicTarget(st, atk) && ownerOf(st, ctx.src) !== ownerOf(st, atk)) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, atk)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม — ไม่ถูกทำลาย`);
          } else {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ทำลาย ${nameOf(st, atk)} ที่ประกาศโจมตี`);
            const died = destroyCard(st, fx, atk, destroyOptsFromMagic(st, ctx.src, atk));
            if (died) ctx.attackerKilled = true;
            fx.snd = 'clash';
          }
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีผู้โจมตีให้ทำลาย`);
      } else if (ac.op === 'sendAttackerToHell') {
        // เจ้ากล้าดียังไง: ส่งลงนรก — ไม่ใช่ทำลาย (คำสั่งเสีย/โดนทำลายไม่ทำงาน)
        const atk = ctx.attacker;
        if (atk && st.inst[atk] && (zoneOf(st, atk) || '').endsWith('.avatar')) {
          if (isImmuneOppMagicTarget(st, atk) && ownerOf(st, ctx.src) !== ownerOf(st, atk)) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, atk)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม — ไม่ถูกลงนรก`);
          } else {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ส่ง ${nameOf(st, atk)} ที่ประกาศโจมตีลงนรก (ไม่นับว่าถูกทำลาย)`);
            const gone = sendCardToHell(st, fx, atk, destroyOptsFromMagic(st, ctx.src, atk));
            if (gone || !(zoneOf(st, atk) || '').endsWith('.avatar')) ctx.attackerKilled = true;
            fx.snd = 'clash';
          }
        } else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีผู้โจมตีให้ส่งลงนรก`);
      } else if (ac.op === 'weakenAttacker') {
        // React: ลด POWER ผู้โจมตี — amount คงที่ หรือ per × จำนวนการ์ดตามแหล่ง
        // countIncludeSelf: นับใบเวทนี้ด้วย (แม้ลงนรกแล้ว) — ไปเลยมอนตี้
        const atk = ctx.attacker;
        if (atk && st.inst[atk]) {
          if (isImmuneOppMagicTarget(st, atk) && ownerOf(st, ctx.src) !== ownerOf(st, atk)) {
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, atk)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม — ไม่ถูกลด POWER`);
          } else {
            let amt, note = '';
            const until = ac.until || 'endOfTurn';
            if (ac.amount != null && ac.count == null) amt = -Math.abs(ac.amount);
            else {
              let n = 0;
              (ac.count || ['ownSide']).forEach(s => n += countSource(st, ctx.owner, s, ctx.src));
              if (ac.countIncludeSelf) n += 1;
              amt = -(ac.per || 1) * n;
              note = ` (นับ ${n} ใบ${ac.countIncludeSelf ? ' รวมใบนี้' : ''})`;
            }
            st.buffs.push({ k: atk, amt: amt, until, from: ctx.src });
            const untilTxt = until === 'permanent' ? ' ตลอดไป' : until === 'combat' ? ' จนจบการต่อสู้' : ' จนจบเทิร์น';
            addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ${nameOf(st, atk)} POWER ${amt}${note}${untilTxt} → เหลือ P${effPower(st, atk)}`);
          }
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
          const p = {
            kind: 'pick', from: ac.from === 'deck' ? 'deckAll' : 'hell', src: ctx.src, chooser: ctx.owner,
            filter: filt2, dest: 'pickAttachHost', hostFilter: ac.targetFilter, optional: true,
            preferHost: ac.host === 'self' ? ctx.src : (ctx.target || null),
            shuffleAfter: !!ac.shuffleAfter, countsAsModification: !!ac.countsAsModification
          };
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
        const toHell = !!ctx.toHellAfter;
        const runPoor = (acts) => runActions(st, fx, acts, { src: ctx.src, owner: ctx.owner, rng: ctx.rng, toHellAfter: toHell });
        if (both) {
          addLog(st, ctx.owner, `ไลฟ์หงาย ${myLifeUp} > ศัตรู ${oppLifeUp} → ทำทั้งจากนรกและจากเด็ค`);
          const acts = [];
          if (hellOk) acts.push(hellAct); else addLog(st, 'S', `ไม่มี Avatar Cost≤5 ในนรก`);
          if (deckOk) acts.push(deckAct); else addLog(st, 'S', `ไม่มี Avatar Cost≤5 ในเด็ค`);
          if (acts.length) runPoor(acts);
          prompted = !!(st.prompts || []).length;
          // ถ้ายังค้างเลือกเป้า — ใบเวทไปนรกหลังจบ prompt (srcToHell บน pick)
          if (prompted && toHell) {
            (st.prompts || []).forEach(p => { if (p && p.src === ctx.src) p.srcToHell = true; });
          }
        } else {
          const options = [];
          if (hellOk) options.push({ label: 'จากนรก — Avatar Cost≤5 ขึ้นมือ (ยกเว้น Only)', actions: [hellAct] });
          if (deckOk) options.push({ label: 'จากเด็ค — Avatar Cost≤5 ขึ้นมือ (ยกเว้น Only) แล้วสับ', actions: [deckAct] });
          if (!options.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี Avatar Cost≤5 ในนรกหรือเด็ค`);
          else if (options.length === 1) {
            addLog(st, ctx.owner, `มีแหล่งเดียว: ${options[0].label}`);
            runPoor(options[0].actions);
            prompted = !!(st.prompts || []).length;
            if (prompted && toHell) {
              (st.prompts || []).forEach(p => { if (p && p.src === ctx.src) p.srcToHell = true; });
            }
          } else {
            st.prompts.push({ kind: 'chooseMode', src: ctx.src, chooser: ctx.owner, optional: false, options, srcToHell: toHell });
            prompted = true;
            addLog(st, ctx.owner, `เลือกปฏิบัติ: จากนรก หรือจากเด็ค`);
          }
        }
        // กัน runActions ชั้นนอกย้ายลงนรกซ้ำก่อนจบเลือก — ชั้นนี้ดูแลเอง
        if (toHell) ctx.toHellAfter = false;
      } else if (ac.op === 'cancelAttack') {
        if (st.pending) {
          const atk = st.pending.atk;
          const oa = st.pending.by || ownerOf(st, atk);
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ยกเลิกการโจมตีของ ${nameOf(st, atk)} (ใบอื่นยังโจมตีได้)`);
          if (atk && st.inst[atk]) st.inst[atk].tapped = false;
          if (oa === 'A' || oa === 'B') {
            st.attacksThisTurn = st.attacksThisTurn || { A: 0, B: 0 };
            if ((st.attacksThisTurn[oa] || 0) > 0) st.attacksThisTurn[oa]--;
          }
          st.pending = null;
        }
      } else if (ac.op === 'flipTapsExceptAttacker') {
        const atk = ctx.attacker || (st.pending && st.pending.atk);
        let n = 0;
        ['A', 'B'].forEach(side => {
          (st.zones[side + '.avatar'] || []).forEach(id => {
            if (id === atk || !st.inst[id]) return;
            st.inst[id].tapped = !st.inst[id].tapped;
            n++;
          });
        });
        addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: สลับสภาพ Avatar ${n} ใบ (ยกเว้นผู้โจมตี)`);
        fx.snd = 'tap';
      } else if (ac.op === 'preventDestroy') {
        resumeWouldDestroy(st, fx, true);
      } else if (ac.op === 'grantCombatImmune') {
        const p = {
          kind: 'pick', from: 'ownAvatars', src: ctx.src, chooser: ctx.owner,
          filter: ac.filter || { type: 'Avatar' }, dest: 'grantCombatImmune',
          optional: false, excludeSelf: !!ac.excludeSelf, srcToHell: !!ctx.toHellAfter
        };
        if (ac.excludeSelf) p.filter = Object.assign({}, p.filter, { excludeSelf: true, _srcK: ctx.src });
        if (promptCandidates(st, p).length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือก Avatar ที่จะไม่ถูกทำลาย`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มีเป้า`);
      } else if (ac.op === 'sacrificeHandOrField') {
        const names = ac.nameIncludesAny || ac.nameIncludes || [];
        const needles = Array.isArray(names) ? names : [names];
        const ids = [];
        (st.zones[ctx.owner + '.hand'] || []).forEach(id => {
          if (needles.some(n => nameMatches(st.inst[id], n))) ids.push(id);
        });
        (st.zones[ctx.owner + '.avatar'] || []).forEach(id => {
          if (id !== ctx.src && needles.some(n => nameMatches(st.inst[id], n))) ids.push(id);
        });
        const p = {
          kind: 'pick', from: 'ids', ids, src: ctx.src, chooser: ctx.owner,
          filter: {}, dest: 'sacrificeOnly', optional: false, then: ac.then || null, srcToHell: !!ctx.toHellAfter
        };
        if (ids.length) { st.prompts.push(p); prompted = true; addLog(st, ctx.owner, `เลือกส่ง "${needles.join('/')}" จากมือหรือสนามลงนรก`); }
        else addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่มี "${needles.join('/')}" ในมือ/สนาม`);
      } else if (ac.op === 'sacrificeNamesOneEach') {
        const need = (ac.names || []).slice();
        const p = {
          kind: 'pick', from: 'ids', ids: [], src: ctx.src, chooser: ctx.owner,
          dest: 'sacrificeNamesOneEach', needNames: need, gotNames: {},
          actions: ac.then || ac.actions || [], optional: false, srcToHell: !!ctx.toHellAfter
        };
        const refresh = () => {
          const ids = [];
          const got = p.gotNames || {};
          (st.zones[ctx.owner + '.hand'] || []).concat(st.zones[ctx.owner + '.avatar'] || []).forEach(id => {
            if (id === ctx.src) return;
            const c = st.inst[id]; if (!c) return;
            const hit = need.find(n => nameMatches(c, n) && !got[n]);
            if (hit) ids.push(id);
          });
          p.ids = ids;
        };
        refresh();
        if (!p.ids.length) addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, ctx.src)}: ไม่ครบชื่อ ${need.join(', ')}`);
        else {
          st.prompts.push(p); prompted = true;
          addLog(st, ctx.owner, `ส่งลงนรกอย่างละ 1: ${need.join(', ')} (${Object.keys(p.gotNames).length}/${need.length})`);
        }
      } else if (ac.op === 'bothDeckSummonCostMax') {
        const max = ac.costMax != null ? ac.costMax : 5;
        const myFilt = Object.assign({ type: 'Avatar', costMax: max }, ac.ownFilter || {});
        const oppFilt = Object.assign({ type: 'Avatar', costMax: max }, ac.oppFilter || {});
        const mine = { kind: 'pick', from: 'deckAll', src: ctx.src, chooser: ctx.owner, filter: myFilt, dest: 'avatar', paidCost: false, shuffleAfter: true, optional: true };
        const opp = other(ctx.owner);
        const theirs = { kind: 'pick', from: 'deckAll', src: ctx.src, chooser: opp, filter: oppFilt, dest: 'avatar', paidCost: false, shuffleAfter: true, optional: true };
        if (promptCandidates(st, mine).length) { st.prompts.push(mine); prompted = true; addLog(st, ctx.owner, `อัญเชิญจากเด็ค Cost≤${max}`); }
        else addLog(st, 'S', `ไม่มี Avatar Cost≤${max} ในเด็คเรา`);
        if (promptCandidates(st, theirs).length) { st.prompts.push(theirs); prompted = true; addLog(st, opp, `อัญเชิญจากเด็ค Cost≤${max}`); }
        else addLog(st, 'S', `ไม่มี Avatar Cost≤${max} ในเด็คฝ่ายตรงข้าม`);
      } else if (ac.op === 'drawProvisions') {
        const need = ac.nameIncludes || 'ขุนพล';
        const min = ac.min || 2;
        const nOwn = (st.zones[ctx.owner + '.avatar'] || []).filter(id => {
          const x = st.inst[id];
          return x && nameMatches(x, need) && (!ac.symbol || cardSymbols(st, id).includes(ac.symbol));
        }).length;
        if (nOwn >= min) {
          const n = takeFromDeckToHand(st, ctx.owner, ac.countBoost || 2, fx).length;
          addLog(st, ctx.owner, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: มี${need}≥${min} → จั่ว ${n} ใบ`);
        } else {
          ['A', 'B'].forEach(p => {
            const n = takeFromDeckToHand(st, p, ac.countNormal || 1, fx).length;
            addLog(st, p, `เอฟเฟกต์ ${nameOf(st, ctx.src)}: จั่ว ${n} ใบ`);
          });
        }
        fx.snd = 'draw';
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
    // เปิด prompt แล้ว: ติด srcToHell ให้เวทต้นทางลงนรกหลังจบเลือก (กัน Normal ค้าง Magic Zone)
    if (prompted && ctx.toHellAfter) {
      (st.prompts || []).forEach(p => {
        if (p && p.src === ctx.src && p.srcToHell == null) p.srcToHell = true;
      });
    }
    if (ctx.toHellAfter && !prompted) {
      if (zoneOf(st, ctx.src)) doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
    }
  }

  function isMagicTypeUsed(st, player, mtype) {
    return !!(st.magicUsed && st.magicUsed[player] && st.magicUsed[player][mtype]);
  }
  function markMagicTypeUsed(st, player, mtype, cardName) {
    st.magicUsed = st.magicUsed || { A: {}, B: {} };
    st.magicUsed[player] = st.magicUsed[player] || {};
    st.magicUsed[player][mtype] = true;
    if (mtype === 'React') noteReactNameUsed(st, player, cardName);
  }
  /* นับโควต้าประเภทเวท · อย่าให้มีครั้งที่ 2: ใช้เป็นครั้งที่ 2 ได้ (ไม่โดนบล็อก)
     แต่ถ้าใช้เป็นใบแรกต้องกินโควต้า React — ใบอื่นใช้ต่อไม่ได้
     คืนข้อความ deny หรือ null ถ้าผ่าน (และมาร์คโควต้าแล้ว) */
  function claimMagicTypeOrDeny(st, owner, c, mtype, opts) {
    opts = opts || {};
    const ignoreLim = ignoresReactTypeLimit(c);
    if (ignoreLim) {
      if (!isMagicTypeUsed(st, owner, mtype)) markMagicTypeUsed(st, owner, mtype, c && c.name);
      else if (mtype === 'React') noteReactNameUsed(st, owner, c && c.name);
      return null;
    }
    if (isMagicTypeUsed(st, owner, mtype)) {
      if (mtype === 'React' && extraSkillReactOk(st, owner, c)) {
        st._extraSkillReactUsed = st._extraSkillReactUsed || {};
        st._extraSkillReactUsed[owner] = true;
        noteReactNameUsed(st, owner, c.name);
        addLog(st, owner, `ครุฑเจ้าเวหา: ใช้ React Skill เพิ่ม "${c.name}" (ชื่อไม่ซ้ำ)`);
        return null;
      }
      if (mtype === 'Modification' && opts.allowWeaponExtra) {
        const extra = st._weaponModExtra && st._weaponModExtra[owner];
        const okExtra = extra && extra.left > 0
          && extra.turnSeq === st.turnSeq
          && nameMatches(c, extra.onlyNameIncludes || 'อาวุธหุ่นนักรบผู้กล้า');
        if (okExtra) {
          extra.left--;
          addLog(st, owner, `ซีทันยาน: ใช้ Mod อาวุธเพิ่ม (เหลือโควต้า ${extra.left})`);
          return null;
        }
      }
      return `ใช้เวทประเภท "${mtype}" ครบ 1 ครั้งแล้วในเทิร์นนี้ (ประเภทละ 1 ครั้ง/เทิร์น)`;
    }
    markMagicTypeUsed(st, owner, mtype, c && c.name);
    return null;
  }
  /* หอกแหลมฯ: นับใช้ Modification หลังสวมสำเร็จเท่านั้น (ข้ามเป้า = ยังไม่เสียโควต้า) */
  function beginDeferredModUse(st, owner, modK) {
    st._pendingModMark = { owner, from: modK };
  }
  function commitDeferredModUse(st, modK) {
    if (!st._pendingModMark || st._pendingModMark.from !== modK) return;
    markMagicTypeUsed(st, st._pendingModMark.owner, 'Modification');
    delete st._pendingModMark;
  }
  /* เทคที่นับเป็น Modification — ปิดโควต้าแม้ begin ไว้ที่ Construct แต่สวมใบอาวุธ */
  function consumeCountsAsModification(st, owner) {
    if (st._pendingModMark) commitDeferredModUse(st, st._pendingModMark.from);
    else if (owner) markMagicTypeUsed(st, owner, 'Modification');
  }
  function clearDeferredModUse(st, modK) {
    if (!st._pendingModMark) return;
    if (!modK || st._pendingModMark.from === modK) delete st._pendingModMark;
  }
  function actionsAttachSelf(actions) {
    return (actions || []).some(ac => ac && ac.op === 'attach' && (ac.from === 'self' || !ac.from));
  }
  /* จุติ/เอฟเฟกต์ตอนอัญเชิญ — เรียกหลัง React ดักอัญเชิญ (อุบัติเหตุ) จบ; จุติยังทำงานแม้โดนทำลายแล้ว */
  function runAvatarSummonedAbilities(st, fx, k, owner, opts) {
    opts = opts || {};
    const c = st.inst[k]; if (!c) return;
    abil(st, k, 'summoned').forEach(ab => {
      if (ab.trigger && ab.trigger.if === 'paidCost' && !opts.paidCost) return;
      if (ab.trigger && ab.trigger.if === 'paidExact' && !opts.paidExact) return;
      if (ab.trigger && ab.trigger.if === 'bySelfAbility' && !opts.bySelfAbility) return;
      if (ab.trigger && ab.trigger.if === 'summonedByNameIncludes') {
        const needle = ab.trigger.nameIncludes || 'นักท่องเรื่องราว';
        if (!opts.summonedByAvatar || !nameMatches(opts.summonedByAvatar, needle)) return;
      }
    if (ab.requireOwnNameIncludes) {
      const ok = (st.zones[owner + '.avatar'] || []).some(id => id !== k && nameMatches(st.inst[id], ab.requireOwnNameIncludes)
        && (!ab.requireOwnSymbol || st.inst[id].symbol === ab.requireOwnSymbol));
      if (!ok) { addLog(st, 'S', `จุติ ${nameOf(st, k)}: ไม่มี "${ab.requireOwnNameIncludes}"${ab.requireOwnSymbol ? ' (' + ab.requireOwnSymbol + ')' : ''} บนสนาม — ข้าม`); return; }
    }
    if (ab.requireOwnConstructNameIncludes) {
      if (!hasOwnConstructNameIncludes(st, owner, ab.requireOwnConstructNameIncludes)) {
        addLog(st, 'S', `จุติ ${nameOf(st, k)}: ไม่มี "${ab.requireOwnConstructNameIncludes}" บน Construct Zone — ข้าม`);
        return;
      }
    }
      // จุติที่มี cost — จ่ายก่อน แล้วค่อยเชาว์/คนรวย (คอสไม่คืน)
      const costList = normalizeAbilityCost(ab.cost) || (Array.isArray(ab.cost) ? ab.cost : []);
      if (costList.length) {
        payCostAndRunActivated(st, fx, owner, k, costList, ab.actions || [], fx._rng || Math.random, null, { juti: true, kind: 'avatar' });
        return;
      }
      if (!opts._skipReact && (opts.paidCost || opts.paidExact) && ab.keyword === 'จุติ' && offerAbilityReact(st, fx, owner, k, { type: 'summoned', k, owner, opts: Object.assign({}, opts, { _onlyAb: ab }) })) {
        st._pendingAbility = { type: 'activate', actions: ab.actions, src: k, owner, costList: [] };
        return;
      }
      // คนรวย: ยกเลิกจุติได้ด้วยการยื่นมือ (หลังเชาว์ปัญญาลิงในมือ)
      if (!opts._skipReact && (opts.paidCost || opts.paidExact) && ab.keyword === 'จุติ'
        && offerRichNegateOnJuti(st, fx, owner, k, {
          type: 'summonedJuti', k, owner,
          actions: ab.actions || [],
          costList: []
        })) {
        return;
      }
      runActions(st, fx, ab.actions, { src: k, owner, toHellAfter: false, rng: fx._rng });
    });
    {
      const e = fxCard(c);
      if (e && e.destroyEnemyAnyOnSummonedByAvatarNameIncludes && opts.summonedByAvatar
          && nameMatches(opts.summonedByAvatar, e.destroyEnemyAnyOnSummonedByAvatarNameIncludes)) {
        const p = { kind: 'chooseDestroy', src: k, chooser: owner, filter: {}, zones: ['avatar', 'magic', 'construct', 'land'], side: 'enemy', optional: false };
        if (promptCandidates(st, p).length) {
          st.prompts.push(p);
          addLog(st, owner, `เอฟเฟกต์ ${c.name}: ถูกอัญเชิญโดยอัศวิน — เลือกทำลายการ์ดฝ่ายตรงข้าม 1 ใบ`);
        }
      }
      if (e && e.destroyAnyOnSummonedByAvatarNameIncludes && opts.summonedByAvatar
          && nameMatches(opts.summonedByAvatar, e.destroyAnyOnSummonedByAvatarNameIncludes)) {
        const byAv = opts.summonedByAvatar;
        const needSym = e.destroyAnyOnSummonedByAvatarSymbol;
        const byK = byAv && byAv.id;
        const syms = byK && st.inst[byK] ? cardSymbols(st, byK) : ((byAv && byAv.symbol) ? [byAv.symbol] : []);
        if (!needSym || syms.includes(needSym)) {
          const p = { kind: 'chooseDestroy', src: k, chooser: owner, filter: {}, zones: ['avatar', 'magic', 'construct', 'land'], side: 'any', optional: false };
          if (promptCandidates(st, p).length) {
            st.prompts.push(p);
            addLog(st, owner, `เอฟเฟกต์ ${c.name}: ถูกอัญเชิญโดยขุนพล — เลือกทำลายการ์ดบนสนาม 1 ใบ`);
          }
        }
      }
      if (e && e.drawOnSummonedByAvatarNameIncludes && opts.summonedByAvatar
          && nameMatches(opts.summonedByAvatar, e.drawOnSummonedByAvatarNameIncludes)) {
        if (takeFromDeckToHand(st, owner, 1, fx).length) {
          addLog(st, owner, `เอฟเฟกต์ ${c.name}: ถูกอัญเชิญโดยขุนพล — จั่ว 1 ใบ`);
          fx.snd = 'draw';
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
    // หลังหน้าต่างอุบัติเหตุจบ — ยังต้องถาม React ขัดจุติ (Hypersense / เชาว์ปัญญาลิง)
    runAvatarSummonedAbilities(st, fx, ps.k, ps.owner, ps.opts || {});
  }

  function triggerSummon(st, fx, k, owner, opts) {
    opts = opts || {};
    const c = st.inst[k];
    // บันทึกชื่อที่อัญเชิญในเทิร์นนี้ (พี่ซี๊ด ฯลฯ ใช้เช็คเงื่อนไข)
    if (c && c.type === 'Avatar' && (owner === 'A' || owner === 'B')) {
      st.summonedThisTurn = st.summonedThisTurn || { A: [], B: [] };
      st.summonedThisTurn[owner] = st.summonedThisTurn[owner] || [];
      st.summonedThisTurn[owner].push(c.name || '');
    }
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
        return mc && mc.type === 'Magic' && magicSubtype(mc) === 'React' && abilitiesOf(mc.code, 'avatarSummoned').length;
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
    // link = { src, owner, actions, toHellAfter? }
    const srcC = st.inst[link.src];
    if (srcC && srcC.type === 'Magic') fireOwnPlayMagic(st, fx, link.owner, fx._rng, link.src);
    const toHell = link.toHellAfter != null ? !!link.toHellAfter : magicHellAfterPlay(srcC);
    if (st.strict && canRespondOnChain(st, other(link.owner))) {
      st.chain.push({ src: link.src, owner: link.owner, actions: link.actions, negated: false, toHellAfter: toHell });
      st.chainPri = other(link.owner);
      addLog(st, link.owner, `⛓️ ${nameOf(st, link.src)} เข้าเชน — ฝ่าย ${st.chainPri} ตอบโต้ได้ (เล่นเวท/ยกเลิก) หรือกดผ่าน`);
      fx.snd = 'place';
    } else {
      runActions(st, fx, link.actions, { src: link.src, owner: link.owner, toHellAfter: toHell, rng: fx._rng });
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
      const toHell = link.toHellAfter != null ? !!link.toHellAfter : magicHellAfterPlay(st.inst[link.src]);
      runActions(st, fx, link.actions, { src: link.src, owner: link.owner, toHellAfter: toHell, rng });
    }
  }

  function resumeJutiAfterRichNegate(st, fx, pend, rng) {
    if (!pend || pend.cancelled) {
      if (pend && pend.cancelled) addLog(st, 'S', `ความสามารถถูกยกเลิกแล้ว — ไม่ทำงาน`);
      return;
    }
    const src = pend.k || pend.src;
    if (!src || !pend.owner) return;
    if ((pend.type === 'summonedJuti' || pend.type === 'activate' || pend.type === 'costPaidActivate') && pend.actions) {
      if (pend.type === 'costPaidActivate')
        runPaidCostEffect(st, fx, { src, owner: pend.owner, actions: pend.actions, keepSrc: true }, rng);
      else if (pend.costList && pend.costList.length)
        payCostAndRunActivated(st, fx, pend.owner, src, pend.costList, pend.actions, rng || fx._rng || Math.random);
      else
        runActions(st, fx, pend.actions, { src, owner: pend.owner, toHellAfter: false, rng: rng || fx._rng });
    } else if (pend.type === 'summoned') {
      triggerSummon(st, fx, pend.k, pend.owner, Object.assign({}, pend.opts || {}, { _skipReact: true }));
    }
  }

  /* คนรวย / ลูกคนรวย บนสนาม: ยกเลิกความสามารถตอนอัญเชิญ(จุติ) โดยยื่นมือ 1 ใบ (นับเป็น React · เทิร์นละครั้ง)
     ไม่ทำงานตอนศัตรูแค่เล่นเวท — ตามกติกาโต๊ะ: ใช้ได้เมื่ออัญเชิญเท่านั้น */
  function offerRichNegateOnJuti(st, fx, summoner, summonedK, pending) {
    const opp = other(summoner);
    if (isMagicTypeUsed(st, opp, 'React')) return false;
    if ((st.prompts || []).some(p => p.dest === 'giveHandNegate')) return false;
    let pick = null, abPick = null;
    for (const k of (st.zones[opp + '.avatar'] || []).slice()) {
      if (abilitiesNullified(st, k)) continue;
      const abs = abil(st, k, 'enemyActivateAbility');
      for (const ab of abs) {
        if (!(ab.actions || []).some(ac => ac.op === 'negateByGiveHand')) continue;
        if (ab.oncePerTurn && isOncePerTurnUsed(st, k, 'richNegate')) continue;
        if (ab.countsAsReact && isMagicTypeUsed(st, opp, 'React')) continue;
        const hand = st.zones[opp + '.hand'] || [];
        if (!hand.length) continue;
        pick = k; abPick = ab; break;
      }
      if (pick) break;
    }
    if (!pick) return false;
    st._pendingAbility = pending || { type: 'summonedJuti', k: summonedK, owner: summoner };
    st.prompts.push({
      kind: 'pick', from: 'ids', ids: (st.zones[opp + '.hand'] || []).slice(),
      src: pick, chooser: opp, dest: 'giveHandNegate', optional: true, allowAnyZone: true,
      richNegate: true, target: summonedK
    });
    addLog(st, opp, `${nameOf(st, pick)}: อีกฝ่ายจุติ「${nameOf(st, summonedK)}」— ยื่นมือ 1 ใบเพื่อยกเลิกได้ (นับ React · หรือข้าม)`);
    fx.snd = fx.snd || 'tap';
    return true;
  }

  /* ยิง trigger "ศัตรูใช้ความสามารถ" บนสนาม — ไม่ใช้กับเวทแล้ว (คนรวยฯ ใช้ offerRichNegateOnJuti ตอนอัญเชิญ) */
  function fireEnemyActivate(st, fx, activator, rng) {
    /* no-op: คนรวยไม่ตอบสนองการเล่นเวท — คงฟังก์ชันไว้กัน call site เก่าพัง */
  }

  /* React response window: สรุปผลการ์ดสวนหลัง prompt (เลือกเป้า) เสร็จ — เคลียร์การโจมตี + ทิ้ง React ลงนรก
     เรียกจาก post-hook ท้าย applyAction เมื่อ st.prompts ว่างและมี st.reactCleanup ค้าง */
  function finishReactCleanup(st, fx) {
    const rc = st.reactCleanup; if (!rc) return;
    st.reactCleanup = null;
    // ทำลายผู้โจมตีแล้ว / ยกเลิกโจมตี → เคลียร์ pending · ลด POWER อย่างเดียว → ค้างโจมตีให้กดปะทะ
    const atkAlive = !rc.attackerKilled && st.pending && st.inst[rc.atk] && (zoneOf(st, rc.atk) || '').endsWith('.avatar');
    if (zoneOf(st, rc.src)) doMove(st, rc.src, rc.owner + '.hell', null, fx); // React ลงนรกหลังเลือกเป้าครบ
    if (atkAlive && !rc.cancelAttack) {
      addLog(st, 'S', `การ์ดสวนทำงานครบ — การโจมตียังค้าง P${effPower(st, rc.atk)} (กดปะทะได้)`);
    } else {
      st.pending = null;
      addLog(st, 'S', 'การ์ดสวนทำงานครบ — จบการโจมตี');
    }
    if (rc.pendingSummon) resumePendingSummon(st, fx, rc.pendingSummon);
    fx.snd = 'clash';
  }

  /* เติมมือให้ถึงขั้นต่ำ — เรียกเฉพาะตอนเริ่มเทิร์นของผู้เล่นคนนั้น (ไม่เติมทันทีกลางเทิร์น) */
  function refillHand(st, fx, p) {
    const h = st.zones[p + '.hand'];
    if (!h) return;
    const need = HAND_MIN - h.length;
    if (need <= 0) return;
    const got = takeFromDeckToHand(st, p, need, fx);
    if (got.length) {
      fx.drawn = got[got.length - 1];
      addLog(st, p, `มือต่ำกว่า ${HAND_MIN} — จั่วเติม ${got.length} ใบ (ต้นเทิร์น)`);
    }
  }

  /* onFight (พาหะ / จอมหักกระดูก ฯลฯ): ใส่ตอนประกาศโจมตี — เคารพ duration จาก JSON (permanent / combat / endOfTurn) */
  function applyOnFightBuffs(st, atkId, defId) {
    if (!atkId || !defId) return;
    if (!(zoneOf(st, defId) || '').endsWith('.avatar')) return;
    const untilOf = (ac) => ac.duration === 'permanent' ? 'permanent' : (ac.duration === 'endOfTurn' ? 'endOfTurn' : 'combat');
    const untilLabel = (u) => u === 'permanent' ? ' ถาวร' : u === 'endOfTurn' ? ' จนจบเทิร์น' : ' จนจบการต่อสู้';
    const applyFight = (fighter, foe) => {
      abil(st, fighter, 'onFight').forEach(ab => (ab.actions || []).forEach(ac => {
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'self') {
          const until = untilOf(ac);
          st.buffs.push({ k: fighter, amt: ac.amount || 0, until, from: fighter, onFight: true });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, fighter)}: ${nameOf(st, fighter)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${untilLabel(until)} → P${effPower(st, fighter)}`);
        }
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'foe' && foe) {
          const until = untilOf(ac);
          st.buffs.push({ k: foe, amt: ac.amount || 0, until, from: fighter, onFight: true });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, fighter)}: ${nameOf(st, foe)} POWER ${ac.amount > 0 ? '+' : ''}${ac.amount || 0}${untilLabel(until)} → P${effPower(st, foe)}`);
        }
        if (ac.op === 'lockPowerPrinted' && ac.target && ac.target.select === 'foe' && foe) {
          st.buffs.push({ k: foe, lockPrinted: true, until: 'combat', from: fighter, onFight: true });
          addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, fighter)}: ล็อก POWER ตั้งต้นของ ${nameOf(st, foe)} จนจบการต่อสู้`);
        }
      }));
    };
    applyFight(atkId, defId);
    applyFight(defId, atkId);
  }
  /* โล่มนุษย์ / เปลี่ยนเป้า: ถอด onFight คู่เดิม แล้วใส่ใหม่ตามผู้ต่อสู้ปัจจุบัน */
  function refreshOnFightBuffs(st, atkId, defId) {
    st.buffs = (st.buffs || []).filter(b => !b.onFight && !(b.lockPrinted && b.until === 'combat'));
    applyOnFightBuffs(st, atkId, defId);
  }
  /* ไพรมอล ฯลฯ: เสนอสั่งใช้ whenAttacking ตอนประกาศโจมตี (ก่อนปะทะ/ทำลาย) */
  function offerWhenAttacking(st, atkId) {
    const c = st.inst[atkId]; if (!c) return false;
    const ab = abilitiesOf(c.code, 'activated').find(x => x.whenAttacking);
    if (!ab) return false;
    const owner = ownerOf(st, atkId);
    if (!owner || (owner !== 'A' && owner !== 'B')) return false;
    if (!ab.cost || !ab.cost.length) return false;
    const costOp = ab.cost[0];
    if (costOp.op === 'sacrifice') {
      const filt = Object.assign({}, costOp.filter || {}, { excludeSelf: true, _srcK: atkId });
      const p = {
        kind: 'pick', from: 'ownAvatars', src: atkId, chooser: owner, filter: filt,
        dest: 'sacrifice', actions: ab.actions || [], optional: true, keepSrc: true,
        whenAttacking: true
      };
      if (!promptCandidates(st, p).length) return false;
      // ถามก่อนเอฟเฟกต์/React อื่นของจังหวะโจมตี — ต้องตอบก่อนกดปะทะ
      st.prompts.unshift(p);
      const sym = (costOp.filter && costOp.filter.symbol) || 'Avatar';
      addLog(st, owner, `⚡ ${c.name}: เมื่อโจมตี — เซ่นไหว้ ${sym} เพื่อตื่น? (หรือข้าม)`);
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

  function isPenguinHutCard(c) {
    return !!(c && (c.code === 'BT11-024' || (c.name || '').includes('เพนกวิ้น ฮัท')));
  }
  function penguinHutReadyInHand(st, side) {
    if (!st || !side) return null;
    if (st.oncePerGame && st.oncePerGame[side + ':BT11-024']) return null;
    if (isNameLockedThisTurn(st, side, 'เพนกวิ้น ฮัท')) return null;
    return (st.zones[side + '.hand'] || []).find(id => isPenguinHutCard(st.inst[id])) || null;
  }
  function mergeFx(dst, src) {
    if (!src) return;
    ['snd', 'over', 'drawn', 'drawnList', 'critical', 'toast'].forEach(k => {
      if (src[k] != null) dst[k] = src[k];
    });
  }
  /* อ้อนวอนสำเร็จ / เพนกวิ้น ฮัท: ยกเลิกท่าปิดเกม แล้วจบเทิร์นฝ่ายโจมตี */
  function finishLethalBegGranted(st, fx, pl, rng, via) {
    st.pendingLethal = null;
    if (st.pending && st.pending.atk === pl.atk) st.pending = null;
    clearCombatBuffs(st);
    if (via === 'penguin')
      addLog(st, 'S', `🐧 เพนกวิ้น ฮัท: ยกเลิกท่าปิดเกม — จบเทิร์นฝ่าย ${pl.by} ทันที (ไม่ต้องรออีกฝ่ายยอม)`);
    else
      addLog(st, 'S', `🙏 ฝ่าย ${pl.by} ยอมให้อ้อนวอน — ยกเลิกท่าปิดเกม แล้วจบเทิร์นฝ่าย ${pl.by}`);
    fx.snd = 'tap';
    st.scout = null;
    const cont = applyAction(st, { type: 'endTurn', by: pl.by, _forceFromEffect: true });
    mergeFx(fx, cont);
    // อย่าคัดลอก deny — ท่าปิดเกมถูกยกเลิกแล้ว การบังคับจบเทิร์นต้องสำเร็จ
    if (cont && cont.deny) addLog(st, 'S', `จบเทิร์นฝ่าย ${pl.by} ไม่ครบ: ${cont.deny}`);
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
      // โกเอมอน ฯลฯ: ความสามารถของผู้โจมตีเมื่อหงาย LIFE
      abil(st, atkId, 'lifeRevealedByAttack').forEach(ab => {
        runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random, lifeCard: target });
      });
      abilitiesOf(L.code, 'lifeRevealedByAttack', L.name).forEach(ab => (ab.actions || []).forEach(ac => {
        // ส่วนใหญ่ทำงานใน Main Phase ถัดไปของเจ้าของ LIFE
        if (ac.op === 'draw' && (ac.schedule === 'nextOwnMainPhase' || !ac.schedule)) {
          st.scheduled.push({ player: lifeOwner, op: 'draw', count: ac.count || 1 });
          addLog(st, 'S', `เอฟเฟกต์ LIFE "${L.name}": ${lifeOwner} จะได้จั่ว ${ac.count || 1} ใบใน Main เทิร์นหน้าของตน`);
        } else if (ac.op === 'schedule') {
          st.scheduled.push({
            player: lifeOwner, when: ac.when || 'nextOwnMainPhase',
            op: 'runActions', actions: ac.actions || [], src: target
          });
          addLog(st, 'S', `เอฟเฟกต์ LIFE "${L.name}": นัดทำผลใน ${ac.when || 'Main Phase ถัดไป'} ของ ${lifeOwner}`);
        } else if (ac.schedule === 'nextOwnMainPhase') {
          st.scheduled.push({
            player: lifeOwner, when: 'nextOwnMainPhase',
            op: 'runActions', actions: [ac], src: target
          });
          addLog(st, 'S', `เอฟเฟกต์ LIFE "${L.name}": นัดทำผลใน Main Phase ถัดไปของ ${lifeOwner}`);
        } else {
          runActions(st, fx, [ac], { src: target, owner: lifeOwner, rng: fx._rng || Math.random });
        }
      }));
      if (remain === 0) {
        // หงายครบ = เข้าสาหัส ยังไม่จบเกม — ต้องโจมตี LIFE อีกครั้ง
        addLog(st, 'S', `🩸 ฝ่าย ${lifeOwner} เข้าสู่สถานะสาหัส! (LIFE หงายครบ) — ต้องโดนโจมตี LIFE อีก 1 ครั้งจึงจะแพ้`);
        fx.critical = lifeOwner;
      }
      offerAfterAttackCombat(st, fx, atkId);
      return;
    }
    const D = st.inst[defId];
    const defZ = zoneOf(st, defId) || '';
    // โจมตี Construct: P โจมตี > P Construct → ทำลาย Construct · เท่ากัน/น้อยกว่า → ไม่เกิดอะไร (ผู้โจมตีไม่ตาย)
    if (D && defZ.endsWith('.construct')) {
      const od = ownerOf(st, defId);
      const pa = effPower(st, atkId), pd = effPower(st, defId);
      if (pa > pd) {
        const died = destroyCard(st, fx, defId, { fromCombat: true, byOpp: !!(oa && od && oa !== od) });
        addLog(st, 'S', `⚔️ ${A.name} (P${pa}) โจมตี Construct ${D.name} (P${pd}) → ${died ? 'ทำลาย Construct ส่งนรก' : 'Construct รอด (กันทำลาย)'}`);
        fx.snd = 'clash';
      } else {
        addLog(st, 'S', `⚔️ ${A.name} (P${pa}) โจมตี Construct ${D.name} (P${pd}) → ไม่เกิดอะไร (ต้อง POWER มากกว่า)`);
        fx.snd = 'tap';
      }
      clearCombatBuffs(st);
      offerAfterAttackCombat(st, fx, atkId);
      return;
    }
    if (!D || !defZ.endsWith('.avatar')) { addLog(st, 'S', 'การปะทะเป็นโมฆะ — เป้าหมายไม่อยู่บนสนามแล้ว'); return; }
    const od = ownerOf(st, defId);
    // บัฟ onFight ใส่ตอนประกาศโจมตีแล้ว — resolve ใช้ค่าที่มีอยู่ (อย่าใส่ซ้ำ)
    const pa = effPower(st, atkId), pd = effPower(st, defId);
    const tryDestroy = (victim, winner) => {
      const V = st.inst[victim], W = st.inst[winner];
      if (V && V.combatImmuneUntilEOT) {
        addLog(st, 'S', `${V.name} ไม่ถูกทำลายจากการต่อสู้ในเทิร์นนี้ (พระคุ้มครอง)`);
        return false;
      }
      const e = fxCard(V);
      // ราชา: ไม่ถูกทำลายจากการต่อสู้กับ Cost น้อยกว่า
      if (e && e.combatImmuneVsLowerCost && W && effCost(st, winner) < effCost(st, victim)) {
        addLog(st, 'S', `เอฟเฟกต์ ${V.name}: ไม่ถูกทำลายจากการต่อสู้กับ ${W.name} (Cost ${effCost(st, winner)} < ${effCost(st, victim)})`);
        return false;
      }
      const vOwn = ownerOf(st, victim), wOwn = ownerOf(st, winner);
      let skipDestroyed = false;
      for (const id in st.inst) {
        const m = st.inst[id];
        if (!m || m.attachedTo !== winner) continue;
        const me = fxCard(m);
        if (me && me.suppressVictimDestroyed) {
          skipDestroyed = true;
          addLog(st, 'S', `เอฟเฟกต์ ${m.name}: คำสั่งเสียของ ${nameOf(st, victim)} ไม่ทำงาน`);
          break;
        }
      }
      return destroyCard(st, fx, victim, { fromCombat: true, byOpp: !!(wOwn && vOwn && wOwn !== vOwn), skipDestroyed });
    };
    const fireBattleDestroy = (winnerId, victimId, extra) => {
      if (!diedFlag(winnerId)) return;
      const wOwn = ownerOf(st, winnerId);
      const runBattle = (srcK) => {
        abil(st, srcK, 'battleDestroy').forEach(ab => {
          if (ab.oncePerTurn && !claimOncePerTurn(st, srcK, ab.oncePerTurnTag || 'battleDestroy')) return;
          if (ab.requireLandNameIncludes) {
            const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!ok) return;
          }
          if (ab.requireMainPhase && st.phase !== 'Main') return;
          if (ab.ifDestroyedHasKeyword) {
            const kws = Array.isArray(ab.ifDestroyedHasKeyword) ? ab.ifDestroyedHasKeyword : [ab.ifDestroyedHasKeyword];
            if (!kws.some(kw => printedHasKeyword(st, victimId, kw))) return;
          }
          runActions(st, fx, ab.actions || [], { src: srcK, owner: wOwn, rng: fx._rng || Math.random, destroyed: victimId, host: winnerId });
        });
      };
      runBattle(winnerId);
      for (const id in st.inst) {
        if (st.inst[id] && st.inst[id].attachedTo === winnerId) runBattle(id);
      }
      if (extra) extra();
    };
    const diedFlag = (winnerId) => st.inst[winnerId] && (zoneOf(st, winnerId) || '').endsWith('.avatar');
    let res;
    if (pa > pd) {
      const died = tryDestroy(defId, atkId);
      res = died ? `${D.name} ถูกทำลาย — ส่งนรกแล้ว` : `${D.name} รอดจากการต่อสู้ (กันทำลาย)`;
      if (died) {
        fireBattleDestroy(atkId, defId, () => {
          if (nameMatches(st.inst[atkId], 'พระนารายณ์')) offerNaraiHandForms(st, fx, oa, atkId);
          if (st.inst[atkId] && st.inst[atkId].battleDestroyLifeHitUntilEOT) {
            if (tryUntap(st, atkId, atkId)) {
              st.inst[atkId]._allowLifeDespiteAvatars = true;
              addLog(st, oa, `${nameOf(st, atkId)}: ฆ่าแล้ว — ตื่นเพื่อโจมตี LIFE ได้ 1 ครั้ง`);
            }
          }
        });
      }
    }
    else if (pa < pd) {
      const died = tryDestroy(atkId, defId);
      res = died ? `${A.name} ถูกทำลาย — ส่งนรกแล้ว` : `${A.name} รอดจากการต่อสู้ (กันทำลาย)`;
      if (died) fireBattleDestroy(defId, atkId);
    }
    else if (pa === 0) { res = 'POWER 0 ปะทะ POWER 0 — ไม่มีอะไรเกิดขึ้น (ตามกติกา)'; }
    else {
      // ลูกฮึด: POWER เท่ากัน + มี keyword / ฝ่ายตรงข้ามไม่มี → ชนะฝ่ายเดียว
      const hak = hasKw(st, atkId, 'ลูกฮึด'), hdk = hasKw(st, defId, 'ลูกฮึด');
      if (hak && !hdk) {
        const died = tryDestroy(defId, atkId);
        res = died ? `${D.name} ถูกทำลาย (ลูกฮึด) — ส่งนรกแล้ว` : `${D.name} รอดจากการต่อสู้ (กันทำลาย)`;
        if (died) fireBattleDestroy(atkId, defId);
      } else if (hdk && !hak) {
        const died = tryDestroy(atkId, defId);
        res = died ? `${A.name} ถูกทำลาย (ลูกฮึด) — ส่งนรกแล้ว` : `${A.name} รอดจากการต่อสู้ (กันทำลาย)`;
        if (died) fireBattleDestroy(defId, atkId);
      } else {
        const d1 = tryDestroy(atkId, defId), d2 = tryDestroy(defId, atkId);
        res = (d1 || d2) ? 'POWER เท่ากัน — ส่งนรกตามผลกันทำลาย' : 'POWER เท่ากัน — ทั้งคู่รอด';
      }
    }
    sweepDestroyPowerZero(st, fx);
    // แทงหลัง: หลังจบการต่อสู้ ถ้าผู้โจมตีสีต่างจากผู้แทงหลัง → ทำลายผู้โจมตี
    {
      const doomed = [];
      (st.buffs || []).forEach(b => {
        if (!b.backstabFrom || b.k !== atkId) return;
        const atkC = st.inst[atkId], fromC = st.inst[b.backstabFrom];
        if (!atkC || !fromC) return;
        if ((atkC.color || '') && (b.backstabColor || fromC.color || '') && (atkC.color || '') !== (b.backstabColor || fromC.color || ''))
          doomed.push({ atk: atkId, from: b.backstabFrom });
      });
      doomed.forEach(d => {
        if (st.inst[d.atk] && (zoneOf(st, d.atk) || '').endsWith('.avatar')) {
          addLog(st, 'S', `แทงหลัง ${nameOf(st, d.from)}: สีต่าง — ทำลาย ${nameOf(st, d.atk)}`);
          destroyCard(st, fx, d.atk);
        }
      });
    }
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
    offerAfterAttackCombat(st, fx, atkId);
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
    const mk = (c, faceUp, owner) => {
      const k = 'i' + (++n);
      inst[k] = { id: k, code: c.code, name: c.name, type: c.type, subtype: magicSubtype(c) || c.subtype || '', symbol: c.symbol || '', color: c.color || '', gemColor: c.gemColor || '', cost: c.cost, gem: c.gem, power: c.power, ex: c.ex || '', effect: c.effect || '—', img: c.imageUrl || '', faceUp: faceUp !== false, tapped: false, counters: 0, attachedTo: null };
      if (owner === 'A' || owner === 'B') inst[k].cardOwner = owner;
      return k;
    };
    ['A', 'B'].forEach(p => {
      PER_PLAYER_ZONES.forEach(z => zones[p + '.' + z] = []);
      const spec = decks[p];
      let mainCards = spec ? expand(spec.main) : [];
      let lifeCards = spec ? expand(spec.life) : [];
      if (!mainCards.length) mainCards = [...mainSD, ...mainSD];
      if (!lifeCards.length) lifeCards = lifeSD;
      const deck = mainCards.map(c => mk(c, false, p));
      // opts.noShuffle = โหมดซ้อมมือ (เรียงตามเด็ค ไม่สับ) · ปกติสับทั้งเด็คและ LIFE (Rule Book)
      if (!opts.noShuffle) {
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        for (let i = lifeCards.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lifeCards[i], lifeCards[j]] = [lifeCards[j], lifeCards[i]]; }
      }
      zones[p + '.deck'] = deck;
      lifeCards.forEach(c => zones[p + '.life'].push(mk(c, false, p)));
      for (let i = 0; i < 5 && zones[p + '.deck'].length; i++) {
        const hid = zones[p + '.deck'].pop();
        if (inst[hid]) inst[hid].faceUp = true;
        zones[p + '.hand'].push(hid);
      }
    });
    // ★ ทอยเหรียญหาผู้เริ่มก่อน (อัตโนมัติตอนเปิดโต๊ะ)
    //   ผู้เริ่มจั่วเพิ่ม 2 ใบหลังมือครบทั้งสองฝ่าย + แอนิเมชันเปิดศึก — ดู case 'beginDuel'
    const flip = (typeof rng === 'function' ? rng() : Math.random());
    const fp = flip < 0.5 ? 'A' : 'B';
    return {
      inst, zones, phase: 'Main', active: fp, turn: 1, turnSeq: 1, strict: opts.strict !== false, firstPlayer: fp, fpDrawn: false, scout: null,
      buffs: [], pending: null, prompts: [], scheduled: [], chain: [], chainPri: null, magicUsed: { A: {}, B: {} }, reactCleanup: null, pendingLethal: null, oncePerGame: {}, _tokSeq: 0, mulliganDone: {}, awaitBattleStart: false, attacksThisTurn: { A: 0, B: 0 },
      log: [
        { p: 'S', t: 'เปิดโต๊ะ — โหมดกติกาอัตโนมัติ: จั่วต้นเทิร์น · ปะทะ · จ่าย Cost · หงาย LIFE · เอฟเฟกต์การ์ดที่มีข้อมูล' },
        ...(opts.noShuffle ? [] : [{ p: 'S', t: '🔀 สับเด็ค + สับกอง LIFE ทั้งสองฝั่งเรียบร้อย' }]),
        { p: 'A', t: 'จั่วเปิด 5 ใบ' }, { p: 'B', t: 'จั่วเปิด 5 ใบ' },
        { p: 'S', t: `🪙 ทอยเหรียญ: ออก "${flip < 0.5 ? 'หัว' : 'ก้อย'}" — ผู้เล่น ${fp} เริ่มก่อน · เปลี่ยนมือให้ครบทั้งสองฝ่ายก่อน แล้วเปิดศึก ผู้เริ่มจะจั่วเพิ่ม 2 ใบ · เทิร์นแรกของ ${fp} โจมตีไม่ได้` },
      ],
    };
  }

  /* ผู้เริ่มจั่วเพิ่ม 2 ใบ (ครั้งเดียว) — เรียกหลังมือครบ + เปิดศึก */
  function fpBonusDraw(st, fx, p) {
    if (p !== (st.firstPlayer || 'A') || st.fpDrawn) return;
    st.fpDrawn = true;
    const got = takeFromDeckToHand(st, p, 2, fx);
    addLog(st, 'S', `🃏 ผู้เริ่ม (${p}) จั่วเพิ่ม ${got.length} ใบหลังเปิดศึก (เทิร์นแรกยังโจมตีไม่ได้)`);
  }
  function bothMulliganDone(st) {
    const d = st.mulliganDone || {};
    return !!(d.A && d.B);
  }

  function applyAction(st, a) {
    const fx = {};
    const strict = !!st.strict; // โหมดกติกาอัตโนมัติ (default เปิดตอนสร้างโต๊ะ)
    // lifeHit เดิม resolve ทันที → React (เจ้ากล้าดียังไง ฯลฯ) / โล่มนุษย์ ใช้ตอนตี LIFE ไม่ได้
    // ส่งเข้า declareAttack path เดียวกับตี Avatar (ตั้ง pending รอตอบ)
    if (a && a.type === 'lifeHit') a = Object.assign({}, a, { type: 'declareAttack' });
    const by = a.by;
    const isPlayer = by === 'A' || by === 'B';
    /* ★ คำสั่งที่ทำกับ "กองเด็ค" (จั่ว/สับ/ค้นหา/สอดแนม/เปิดกอง/ธรณีสูบ) — บังคับให้เป็นเด็คของคนที่กดเสมอ
       กันไม่ให้ฝั่งตรงข้ามไปสอดแนม/สูบเด็คเราตอนเทิร์นเรา (solo ส่ง by = p อยู่แล้ว จึงไม่กระทบ) */
    const deckSide = v => (isPlayer ? by : (v === 'B' ? 'B' : 'A'));
    const deny = m => { fx.deny = m; return fx; };
    const rng = mulberry32(a.seed);
    fx._rng = rng;
    st.buffs = st.buffs || []; st.prompts = st.prompts || []; st.scheduled = st.scheduled || []; st.chain = st.chain || []; if (st.chainPri === undefined) st.chainPri = null; st.magicUsed = st.magicUsed || { A: {}, B: {} };

    /* เฟสอัตโนมัติ: ลงการ์ด→Main · โจมตี→Battle · จบเทิร์น→จั่วต้นเทิร์นแล้วเข้า Main ทันที */
    const enterPhase = (phase) => {
      if (!phase || st.phase === phase) return;
      st.phase = phase;
      addLog(st, st.active, `เข้าเฟส ${phase}`);
      if (phase === 'Battle') {
        (st.zones[st.active + '.avatar'] || []).slice().forEach(k => {
          abil(st, k, 'battlePhaseStart').forEach(ab => runActions(st, fx, ab.actions, { src: k, owner: st.active, rng }));
        });
        const oppBp = other(st.active);
        const bpOpts = collectReactOptions(st, oppBp, 'oppBattlePhaseStart');
        if (bpOpts.length) {
          st._oppBattleStartWindow = true;
          st.prompts.unshift({
            kind: 'react', mode: 'runActions', src: null, options: bpOpts, chooser: oppBp,
            actions: [], reactTrigger: 'oppBattlePhaseStart', seconds: 10, optional: true,
            label: `เริ่ม Battle Phase ของฝ่าย ${st.active}`
          });
          addLog(st, oppBp, `รอ React (${bpOpts.length} ใบ): เริ่ม Battle Phase ของฝ่าย ${st.active} — พระคุ้มครอง / ไม่ใช้ / รอ 10 วิ`);
        }
      }
      if (phase === 'Main') {
        const due = st.scheduled.filter(s => s.player === st.active && (!s.when || s.when === 'nextOwnMainPhase'));
        st.scheduled = st.scheduled.filter(s => !(s.player === st.active && (!s.when || s.when === 'nextOwnMainPhase')));
        // จั่วที่นัดไว้ก่อน แล้วค่อยสอดแนม/เอฟเฟกต์อื่น — กันใบบนเด็คถูกจั่วยุ่งกลางสอดแนม
        const dueDraws = due.filter(s => s.op === 'draw');
        const dueRest = due.filter(s => s.op !== 'draw');
        [...dueDraws, ...dueRest].forEach(s => {
          if (s.op === 'runActions' && s.actions) {
            addLog(st, st.active, `ทำเอฟเฟกต์ที่นัดไว้ (Main Phase)`);
            runActions(st, fx, s.actions, { src: s.src, owner: st.active, rng });
          } else if (s.op === 'draw') {
            const got = takeFromDeckToHand(st, s.player, s.count || 1, fx).length;
            addLog(st, s.player, `เอฟเฟกต์ที่ค้างไว้: จั่ว ${got} ใบ`);
          }
        });
      }
    };
    const finishDrawPhaseStart = (player) => {
      (st.zones[player + '.avatar'] || []).slice().forEach(k => {
        abil(st, k, 'afterNormalDraw').forEach(ab => {
          runActions(st, fx, ab.actions || [], { src: k, owner: player, rng: rng });
        });
      });
      refillHand(st, fx, player);
      if (!st.over) checkInstantWinDraw(st, fx, player);
      (st.zones[player + '.avatar'] || []).slice().forEach(k => {
        abil(st, k, 'turnStart').forEach(ab => runActions(st, fx, ab.actions, { src: k, owner: player, rng: rng }));
      });
      if (!st.over) enterPhase('Main');
    };
    const ensureMain = () => { if (st.phase !== 'Main') enterPhase('Main'); };
    const ensureBattle = () => { if (st.phase !== 'Battle') enterPhase('Battle'); };

    /* ก่อนมือครบ/ก่อนเปิดศึก — ห้ามเล่นการ์ด (ยกเว้นมัลลิแกน / เปิดศึก / เลือกผู้เริ่ม) */
    if (isPlayer) {
      if (st.awaitBattleStart && a.type !== 'beginDuel')
        return deny('รอเปิดศึกก่อน');
      if (st.turn === 1 && !bothMulliganDone(st) && !st.awaitBattleStart
        && a.type !== 'mulligan' && a.type !== 'setFirstPlayer' && a.type !== 'setStrict')
        return deny('รอให้ทั้งสองฝ่ายตอบเรื่องมือเปิดก่อน');
    }

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
        // เมฟิสโต้ / ยายกบ ฯลฯ — ห้ามลากจากมือลงสนามเลี่ยงเงื่อนไข (แม้โต๊ะเสรี)
        if (from.endsWith('.hand') && (to.endsWith('.avatar') || to.endsWith('.construct'))) {
          const eMv = fxCard(c);
          if (eMv && (eMv.noPaidSummon || eMv.noHandSummon))
            return deny(`"${c.name}" ลงสนามแบบจ่าย GEM/ลากวางไม่ได้ — ต้องใช้ความสามารถตามเงื่อนไขบนการ์ด`);
        }
        if (from.endsWith('.deck') && to.endsWith('.avatar') && c.type === 'Avatar') {
          const blkDeck = deckSummonBlocked(st);
          if (blkDeck) return deny(`อัญเชิญ Avatar จากเด็คไม่ได้ — ${blkDeck} บล็อก`);
        }
        // Construct: ห้ามชื่อซ้ำเสมอ (แม้โต๊ะเสรี)
        if (to.endsWith('.construct')) {
          const qdCon = quotaDeny(st, to, c);
          if (qdCon) return deny(qdCon);
        }
        if (strict && isPlayer) {
          if (from !== 'land' && from[0] !== by) return deny('โหมดกติกา: ขยับการ์ดฝั่งตรงข้ามไม่ได้ (จำเป็นจริงๆ ให้สลับเป็นโต๊ะเสรี)');
          if (to !== 'land' && to[0] !== by) return deny('โหมดกติกา: วางการ์ดลงฝั่งตรงข้ามไม่ได้');
          if (from.endsWith('.hand') && (to.endsWith('.avatar') || to.endsWith('.construct')) && (+c.cost || 0) > 0)
            return deny(`"${c.name}" มี COST ${c.cost} — แตะเลือกการ์ดในมือให้ GEM รวมพอ แล้วลากลงสนามเพื่ออัญเชิญ`);
          if (!to.endsWith('.construct')) {
            const qd = quotaDeny(st, to, c); if (qd) return deny('โหมดกติกา: ' + qd);
          }
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
          if (!isLandMagic(c))
            return deny(`วางช่อง Land ได้เฉพาะ Magic ชนิด Land`);
          if (landPlayBlocked(st) && !(st.zones['land'] || []).includes(a.k))
            return deny(`ใช้ Land ไม่ได้ — "${landPlayBlockName(st)}" บล็อกการใช้ Land ของทุกฝ่าย`);
          clearLandZoneFor(st, fx, a.k);
          if (from[0] === 'A' || from[0] === 'B') c.controller = from[0];
        }
        doMove(st, a.k, to, a.pos, fx);
        if (to === 'land') armGlobalEndPhaseTimer(st, a.k);
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
          if (fxCard(c) && fxCard(c).noHellSummon)
            return deny(`"${c.name}" อัญเชิญจากนรกไม่ได้`);
          const blk = hellSummonBlocked(st);
          if (blk) return deny(`อัญเชิญจากนรกไม่ได้ — ${blk} บล็อก`);
        }
        if (c.type === 'Avatar' && from.endsWith('.deck')) {
          const blkDeck = deckSummonBlocked(st);
          if (blkDeck) return deny(`อัญเชิญ Avatar จากเด็คไม่ได้ — ${blkDeck} บล็อก`);
        }
        const eSum = fxCard(c);
        // ของขวัญ: อัญเชิญฟรีถ้ามีเจคและยังไม่มีของขวัญบนสนาม
        if (!a.free && freeSummonOk(st, a.k)) a = Object.assign({}, a, { free: true });
        // uniqueOnField (เจค) — ชื่อเดียวกันนับรวม reprint คนละรหัส
        if (eSum && eSum.uniqueOnField) {
          if ((st.zones[owner + '.avatar'] || []).some(id => {
            const o = st.inst[id]; if (!o) return false;
            return o.name === c.name || nameMatches(o, c.name);
          }))
            return deny(`ควบคุม "${c.name}" ได้เพียง 1 ใบ`);
        }
        // Construct: ห้ามก่อสร้างชื่อซ้ำเสมอ
        if (a.to && a.to.endsWith('.construct')) {
          const qdCon = quotaDeny(st, a.to, c);
          if (qdCon) return deny(qdCon);
        }
        // ยายกบ: อัญเชิญโดยส่งกบที่ +POWER ≥3 ครั้ง (ห้ามจ่าย Cost ปกติ)
        if (eSum && eSum.sacrificeSummon && !a.free) {
          if (strict) {
            if (isPlayer && owner !== by) return deny('อัญเชิญได้เฉพาะการ์ดในมือตัวเอง');
            if (isPlayer && st.active !== by) return deny('อัญเชิญได้เฉพาะในเทิร์นของคุณ');
          }
          const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: eSum.sacrificeSummon.filter, dest: 'sacSummon', summonTo: a.to, optional: false };
          if (!promptCandidates(st, p).length) return deny(`อัญเชิญ "${c.name}" ไม่ได้ — ไม่มี Avatar ตรงเงื่อนไขบนสนาม`);
          ensureMain();
          st.prompts.push(p);
          addLog(st, owner, `อัญเชิญ ${c.name}: เลือก Avatar ส่งลงนรกแทน Cost`);
          fx.snd = 'place';
          break;
        }
        // เมฟิสโต้ ฯลฯ — ห้ามทั้งจ่าย GEM และปุ่มอัญเชิญพิเศษ (ลงได้จากความสามารถการ์ดเท่านั้น)
        if (eSum && eSum.noPaidSummon)
          return deny(`"${c.name}" อัญเชิญแบบจ่าย GEM ไม่ได้ — ใช้สั่งใช้จากมือตามเงื่อนไขบนการ์ด`);
        if (eSum && eSum.noHandSummon)
          return deny(`"${c.name}" อัญเชิญจากมือไม่ได้ (ลงได้จากเอฟเฟกต์เท่านั้น)`);
        const cost = effCost(st, a.k);
        const payIds = (a.payIds || []).filter(k => k !== a.k && st.zones[owner + '.hand'].includes(k));
        // สีคอส = color ของอวตาร (ต้องจ่ายสีนี้) · สีเจม = gemColorOf(ใบจ่าย)
        // เจมขาว/ใสจ่ายได้ทุกสี · ไม่งั้นสีเจมต้องตรงสีคอส · อวตารไร้สี/allColors จ่ายสีอะไรก็ได้
        const eAll = fxCard(c);
        const avColor = avatarCostColors(c, eAll);
        // กรุงลงกา: ใช้ POWER ของยักษ์บนมือแทน GEM
        let powerAsGemSym = null;
        (st.zones['land'] || []).forEach(lid => {
          const le = fxId(st, lid);
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
          const g0 = +pc.gem || 0;
          const peGem = fxCard(pc);
          let g = g0, gc = gemColorOf(pc);
          // เดย์วัน: จ่ายเป็น Cost อัญเชิญ "ตำรวจ" → นับ GEM 5 ไร้สี
          if (peGem && peGem.gemAsCostForNameIncludes && nameMatches(c, peGem.gemAsCostForNameIncludes)) {
            g = peGem.gemAsCostValue != null ? peGem.gemAsCostValue : 5;
            gc = peGem.gemAsCostColor || 'ขาว';
          }
          gem += g; byColor[gc] = (byColor[gc] || 0) + g;
          if (gemPaysFor(gc, avColor)) usable += g;
        });
        if (strict) {
          if (isPlayer && owner !== by) return deny('อัญเชิญได้เฉพาะการ์ดในมือตัวเอง');
          if (isPlayer && st.active !== by) return deny('อัญเชิญได้เฉพาะในเทิร์นของคุณ');
          if (a.to !== 'land' && a.to[0] !== owner) return deny('ลงได้เฉพาะโซนฝั่งตัวเอง');
          const qd = quotaDeny(st, a.to, c); if (qd) return deny('โหมดกติกา: ' + qd);
          if (!a.free && eSum && eSum.exactGemPay && usable !== cost)
            return deny(`พอดี: ต้องจ่าย GEM พอดี ${cost} (ตอนนี้ ${usable}) — เกิน/ขาดไม่ได้`);
          if (!a.free && usable < cost) return deny(avColor
            ? `GEM สีที่จ่ายได้ไม่พอ: "${c.name}" (สี${avColor}) ต้องการ ${cost} — จ่ายด้วยเจมสี${avColor}หรือขาวเท่านั้น (ตอนนี้ใช้ได้ ${usable})`
            : `GEM ไม่พอ: "${c.name}" ต้องการ ${cost} แต่จ่ายได้ ${usable} — แตะการ์ดในมือเพื่อเลือกเพิ่ม`);
        }
        if (!strict && !a.free && cost > 0 && usable < cost) {
          return deny(`GEM ไม่พอ: "${c.name}" ต้องการ ${cost} แต่จ่ายได้ ${usable} — แตะการ์ดในมือให้ GEM พอ แล้วลากลงสนาม`);
        }
        if (!a.free && eSum && eSum.exactGemPay && usable !== cost) {
          return deny(`พอดี: ต้องจ่าย GEM พอดี ${cost} (ตอนนี้ ${usable})`);
        }
        if (!a.free && cost > 0) {
          const payDeny = gemPayDenyMsg(st, payIds, a.k, cost);
          if (payDeny) return deny(payDeny);
        }
        ensureMain();
        // เก็บเอฟเฟกต์ "ถูกใช้เป็น Cost" ก่อนย้ายลงนรก (วันชัย/กัญญา)
        const paidAsCostEffects = [];
        if (!a.free) {
          for (const pk of payIds) {
            const pc = st.inst[pk];
            if (!pc) continue;
            const pe = fxCard(pc);
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
        if (isNameLockedThisTurn(st, owner, c.name))
          return deny(`"${c.name}" อัญเชิญไม่ได้ในเทิร์นนี้ (โรงบาล)`);
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
        // รอขัดเวท/React อยู่ — เล่นจากมือ = เลือกใบใน prompt (รองรับอย่าให้มีครั้งที่ 2 หลังใช้ React ไปแล้ว)
        // ดักโจมตี: เก็บ prompt แล้วตกไปเส้นทาง counterAtk (มีค่าเซ่น / fromCounterAtk)
        {
          const pr0 = (st.prompts || [])[0];
          if (pr0 && pr0.kind === 'react' && pr0.chooser === owner
            && promptCandidates(st, pr0).includes(a.k)) {
            if (pr0.reactTrigger === 'enemyDeclareAttack' || pr0.reactTrigger === 'oppBattlePhaseStart' || pr0.reactTrigger === 'ownAvatarFights' || pr0.reactTrigger === 'ownAvatarLeftField') {
              st.prompts.shift();
              if (pr0.reactTrigger === 'oppBattlePhaseStart') delete st._oppBattleStartWindow;
            } else {
              const cont = applyAction(st, { type: 'chooseTarget', k: a.k, by: isPlayer ? by : owner, seed: a.seed });
              if (cont) Object.keys(cont).forEach(key => { fx[key] = cont[key]; });
              break;
            }
          }
        }
        // การ์ดสวน: ถ้าถูกโจมตีอยู่ + มี effect enemyDeclareAttack → รันผลอัตโนมัติ
        // (ยึด trigger ไม่ยึด subtype — SD06-014 ไปเลยมอนตี้ เคยติดป้าย Normal)
        const atkAbs = abilitiesOf(c.code, 'enemyDeclareAttack', c.name);
        const fightAbs = abilitiesOf(c.code, 'ownAvatarFights', c.name);
        const defFight = !!(st.pending && st.pending.target === owner && fightAbs.length);
        const atkFight = !!(st.pending && st.pending.by === owner && fightAbs.length);
        const counterAtk = !!(st.pending && ((st.pending.target === owner && (atkAbs.length || fightAbs.length)) || atkFight));
        if (counterAtk && st.pending.blockReact && st.pending.target === owner)
          return deny('ฝ่ายโจมตีห้ามใช้ React จนกว่าจะจบการต่อสู้ (นางอัปสร)');
        if (counterAtk && atkAbs.length) {
          const preDeny = enemyDeclareAttackDeny(st, owner, atkAbs, c.name);
          if (preDeny) return deny(preDeny);
        }
        const wouldAbs = abilitiesOf(c.code, 'avatarWouldBeDestroyed', c.name);
        if (wouldAbs.length && !st._wouldDestroyPending)
          return deny(`ใช้ "${c.name}" ได้เมื่อ Avatar จะถูกทำลาย`);
        {
          const onlyReactNegate = (
            /อย่าให้มีครั้งที่/.test(c.name || '')
            || abilitiesOf(c.code, 'enemyPlayReact', c.name).length
          ) && !abilitiesOf(c.code, 'enemyPlayMagic', c.name).length
            && !abilitiesOf(c.code, 'activated', c.name).length
            && !abilitiesOf(c.code, 'playMagic', c.name).length;
          if (onlyReactNegate) {
            const prN = (st.prompts || [])[0];
            const negTgt = prN && prN.kind === 'react' && (prN.magicNegate || prN.mode === 'negateMagic')
              ? prN.target : null;
            if (!negTgt || !magicCountsAsReact(st, negTgt) || !canNegateMagicCard(st, a.k, negTgt))
              return deny(`ใช้ "${c.name}" ได้เมื่อฝ่ายตรงข้ามใช้ React`);
          }
        }
        // ไปเลยมอนตี้ / เพื่อชาติ — ห้ามเล่นอิสระใน Main (ต้องเป็นหน้าต่างสวนโจมตี)
        if ((atkAbs.length && !(st.pending && st.pending.target === owner && atkAbs.length))
          || (fightAbs.length && !defFight && !atkFight)) {
          const actAb = abilitiesOf(c.code, 'activated', c.name)[0] || abilitiesOf(c.code, 'playMagic', c.name)[0];
          if (!actAb) return deny(`ใช้ "${c.name}" ได้เมื่อ Avatar ฝ่ายเราต่อสู้`);
        }
        // ตอบโต้บนเชน — เล่นเวทใส่เชนได้แม้ไม่ใช่เทิร์นตัวเอง ถ้าเป็นฝ่ายที่มีสิทธิ์ตอบโต้
        const chainResp = st.chain.length && owner === by && by === st.chainPri;
        // ฤๅษี ภฤคุ: ใช้เวทฤษี (Normal/Mod/Land) ในเทิร์นฝ่ายตรงข้ามได้
        const rishiOk = (() => {
          if (st.active === owner) return false;
          if (!['Normal', 'Modification', 'Land'].includes(c.subtype || 'Normal')) return false;
          if (c.symbol !== 'ฤษี') return false;
          return (st.zones[owner + '.avatar'] || []).some(id => {
            const e = fxId(st, id);
            return e && e.allowOppTurnMagic;
          });
        })();
        // React ยืดหยุ่น (ฮึบ / รหัสดำ / ไปคุยกับราก) — อย่าให้มีครั้งที่ 2 ไม่ใช่ใบนี้
        // ใบขัด React เล่นผ่านหน้าต่าง negateMagic ไม่ใช่เล่นอิสระตอนถูกโจมตี
        const reactAny = magicSubtype(c) === 'React' && (() => {
          const e = fxCard(c);
          const ab0 = abilitiesOf(c.code, 'activated')[0];
          return (e && e.reactAnyWindow) || (ab0 && ab0.reactAnyWindow)
            || abilitiesOf(c.code, 'enemyDrawFromDeckByEffect').length || abilitiesOf(c.code, 'avatarTapped').length
            || abilitiesOf(c.code, 'oppBattlePhaseStart').length;
        })();
        const leftFieldOk = !!(abilitiesOf(c.code, 'ownAvatarLeftField', c.name).length && st._ownAvatarLeftFieldWindow);
        if (strict && !counterAtk && !chainResp && !rishiOk && !(reactAny && st.active !== owner) && !leftFieldOk) {
          if (isPlayer && owner !== by) return deny('ใช้ได้เฉพาะการ์ดในมือตัวเอง');
          if (isPlayer && st.active !== by) return deny('ใช้เวทได้ในเทิร์นของคุณ (การ์ดสวน/ตอบโต้เชน/ฤษีภฤคุใช้นอกเทิร์นได้)');
        }
        if (!counterAtk && !chainResp && !rishiOk && !(reactAny && st.active !== owner) && !leftFieldOk) ensureMain();
        if (strict && counterAtk && isPlayer && owner !== by) return deny('ใช้การ์ดสวนของตัวเองเท่านั้น');
        {
          const abOnly = abilitiesOf(c.code, 'activated', c.name)[0] || abilitiesOf(c.code, 'playMagic', c.name)[0];
          const needle = (abOnly && abOnly.requireOnlyNameIncludes) || (fxCard(c) && fxCard(c).requireOnlyNameIncludes);
          if (needle) {
            const avs = st.zones[owner + '.avatar'] || [];
            if (!avs.length || avs.some(id => !nameMatches(st.inst[id], needle)))
              return deny(`ใช้ไม่ได้ — Avatar Zone ต้องมีเพียง "${needle}" เท่านั้น`);
          }
          if (abOnly && abOnly.requireOwnNameIncludes) {
            const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], abOnly.requireOwnNameIncludes));
            if (!ok) return deny(`ใช้ "${c.name}" ไม่ได้ — ต้องมี Avatar ชื่อมี "${abOnly.requireOwnNameIncludes}" บนสนาม`);
          }
        }
        {
          const bpOnly = abilitiesOf(c.code, 'oppBattlePhaseStart', c.name);
          if (bpOnly.length && !abilitiesOf(c.code, 'activated', c.name).length) {
            if (!(st.phase === 'Battle' && st.active !== owner))
              return deny(`ใช้ "${c.name}" ได้เมื่อเริ่ม Battle Phase ของฝ่ายตรงข้าม`);
          }
        }
        // กติกา: Magic ใช้ได้ประเภทละ 1 ครั้ง/เทิร์น (แม้เทิร์นอีกฝ่าย) · React บังคับเสมอ
        // อย่าให้มีครั้งที่ 2: ใช้เป็นครั้งที่ 2 ได้ แต่ถ้าใช้เป็นใบแรกกินโควต้า (บล็อก React อื่น)
        const mtype = (counterAtk && atkAbs.length) ? 'React' : magicSubtype(c);
        const enforceType = mtype === 'React' || !!strict;
        if (enforceType) {
          const typeDeny = claimMagicTypeOrDeny(st, owner, c, mtype, { allowWeaponExtra: true });
          if (typeDeny) return deny(typeDeny);
        }
        if (oncePerTurnCardBlocked(st, a.k, owner))
          return deny('ใช้ใบนี้ครบ 1 ครั้งแล้วในเทิร์นนี้');
        {
          const eOnce = fxCard(c);
          if (eOnce && eOnce.oncePerTurnCard) markOncePerTurnCard(st, owner, c.name || c.code);
        }
        if (counterAtk || magicSubtype(c) === 'React') {
          if (counterAtk) {
            const atkId = st.pending.atk;
            const defId = st.pending.def || null;
            const absAtk = atkAbs.length ? atkAbs : fightAbs;
            addLog(st, owner, `ใช้การ์ดสวน "${c.name}"!`);
            // จ่ายค่าเซ่นก่อน แล้วค่อยให้ขัดด้วยชายจากอนาคต / อย่าให้มีครั้งที่ 2 (คอสไม่คืน)
            const acts = [];
            let costList = null;
            absAtk.forEach(ab => {
              const cond = (ab.trigger && ab.trigger.if) || '';
              const mName = cond.match(/^targetNameIncludes:(.+)$/);
              if (mName && !(defId && st.inst[defId] && nameMatches(st.inst[defId], mName[1]))) return;
              if (ab.cost && ab.cost.length && !costList) costList = ab.cost;
              (ab.actions || []).forEach(ac => acts.push(ac));
            });
            doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
            if (costList && costList[0] && costList[0].op === 'mill') {
              const n = costList[0].count || 1;
              const who = costList[0].who === 'opp' ? other(owner) : owner;
              if ((st.zones[who + '.deck'] || []).length < n) {
                addLog(st, 'S', `ใช้ "${c.name}" ไม่ได้ — เด็คไม่พอธรณีสูบ ${n} ใบ`);
                doMove(st, a.k, owner + '.hell', null, fx);
                fx.snd = 'clash'; break;
              }
              mill(st, fx, who, n, rng, 0, a.k);
              addLog(st, owner, `การ์ดสวน "${c.name}": จ่ายค่าธรณีสูบ ${n} ใบ`);
            }
            if (costList && costList[0] && costList[0].op === 'sacrifice') {
              const p = {
                kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner,
                filter: costList[0].filter || {}, dest: 'sacrifice',
                actions: acts, optional: false, keepSrc: true,
                counterAtkCtx: { atk: atkId, def: defId }
              };
              if (!promptCandidates(st, p).length) {
                addLog(st, 'S', `ใช้ "${c.name}" ไม่ได้ — ไม่มีเป้าเซ่นไหว้ (ผลไม่เกิด)`);
                doMove(st, a.k, owner + '.hell', null, fx);
                fx.snd = 'clash'; break;
              }
              st.prompts.push(p);
              st.reactCleanup = { src: a.k, owner: owner, atk: atkId };
              addLog(st, owner, `การ์ดสวน "${c.name}": เลือก Avatar เซ่นไหว้`);
              fx.snd = 'place'; break;
            }
            if (offerMagicNegateReact(st, fx, owner, a.k)) {
              st._pendingMagic = {
                type: 'reactActions', src: a.k, owner,
                actions: acts, target: defId, triggerSource: atkId,
                attacker: atkId, mode: 'runActions', fromCounterAtk: true,
                costPaid: true
              };
              fx.snd = 'place';
              break;
            }
            // ไม่มีหน้าต่างขัด — รันผลทันที
            const before = st.prompts.length;
            const rctx = { owner: owner, src: a.k, rng: rng, attacker: atkId, target: defId };
            runActions(st, fx, acts, rctx);
            if (st.prompts.length > before) {
              st.reactCleanup = { src: a.k, owner: owner, atk: atkId, attackerKilled: !!rctx.attackerKilled };
              addLog(st, owner, `การ์ดสวน "${c.name}": เลือกเป้าให้ครบก่อน แล้วจึงสรุปผลการโจมตี`);
              fx.snd = 'clash'; break;
            }
            // ไม่สลายโจมตีเพราะ P0 (ไปเลยมอนตี้ ฯลฯ) — ให้ปะทะ: น้อยกว่า = ตาย / 0ชน0 = ไม่ตาย
            const atkGone = rctx.attackerKilled || !(st.inst[atkId] && (zoneOf(st, atkId) || '').endsWith('.avatar'));
            if (atkGone || rctx.cancelAttack) {
              st.pending = null;
            } else if (st.pending) {
              addLog(st, 'S', `การโจมตียังค้าง — ${nameOf(st, atkId)} เหลือ P${effPower(st, atkId)} (กดปะทะได้)`);
            }
            doMove(st, a.k, owner + '.hell', null, fx);
            fireOwnPlayMagic(st, fx, owner, rng, a.k);
            fx.snd = 'clash'; break;
          }
          // React ที่มี activated (เช่น ลดราคาล้นตลาด) → เล่นได้ตลอดเมื่อเงื่อนไขครบ
          {
            const actAb = abilitiesOf(c.code, 'activated')[0];
            const bpAbs = abilitiesOf(c.code, 'oppBattlePhaseStart', c.name);
            const leftAbs = abilitiesOf(c.code, 'ownAvatarLeftField', c.name);
            if (bpAbs.length && st.phase === 'Battle' && st.active !== owner) {
              const acts = [];
              let costList = null;
              bpAbs.forEach(abBp => {
                if (abBp.cost && abBp.cost.length && !costList) costList = abBp.cost;
                (abBp.actions || []).forEach(ac => acts.push(ac));
              });
              doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
              addLog(st, owner, `ใช้การ์ดสวน "${c.name}"!`);
              if (costList && costList[0] && costList[0].op === 'sacrifice') {
                const p = {
                  kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner,
                  filter: costList[0].filter || {}, dest: 'sacrifice',
                  actions: acts, optional: false, afterCostKind: 'magic'
                };
                if (!promptCandidates(st, p).length) {
                  addLog(st, 'S', `ใช้ "${c.name}" ไม่ได้ — ไม่มีเป้าเซ่นไหว้`);
                  doMove(st, a.k, owner + '.hell', null, fx);
                  fx.snd = 'clash'; break;
                }
                st.prompts.push(p);
                addLog(st, owner, `การ์ดสวน "${c.name}": เลือก Avatar ส่งนรก`);
                fx.snd = 'place'; break;
              }
              if (offerMagicNegateReact(st, fx, owner, a.k)) {
                st._pendingMagic = { type: 'reactActions', src: a.k, owner, actions: acts, costPaid: true, mode: 'runActions' };
                fx.snd = 'place'; break;
              }
              runActions(st, fx, acts, { src: a.k, owner, rng });
              if (magicHellAfterPlay(c) && zoneOf(st, a.k)) doMove(st, a.k, owner + '.hell', null, fx);
              fx.snd = 'clash'; break;
            } else if (leftAbs.length) {
              if (!st._ownAvatarLeftFieldWindow) return deny(`ใช้ "${c.name}" ได้เมื่อ Avatar ฝ่ายเราออกจาก Avatar Zone`);
              delete st._ownAvatarLeftFieldWindow;
              const actsL = [];
              leftAbs.forEach(abL => { (abL.actions || []).forEach(ac => actsL.push(ac)); });
              doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
              addLog(st, owner, `ใช้การ์ดสวน "${c.name}"!`);
              if (offerMagicNegateReact(st, fx, owner, a.k)) {
                st._pendingMagic = { type: 'reactActions', src: a.k, owner, actions: actsL, costPaid: true, mode: 'runActions' };
                fx.snd = 'place'; break;
              }
              runActions(st, fx, actsL, { src: a.k, owner, rng });
              if (magicHellAfterPlay(c) && zoneOf(st, a.k)) doMove(st, a.k, owner + '.hell', null, fx);
              fx.snd = 'clash'; break;
            } else if (actAb) {
              // ตกไปใช้เส้นทาง activated ด้านล่าง — อย่า break ตรงนี้
            } else if (abilitiesOf(c.code, 'enemyPlayReact', c.name).length
              || /อย่าให้มีครั้งที่/.test(c.name || '')) {
              return deny(`ใช้ "${c.name}" ได้เมื่อฝ่ายตรงข้ามใช้ React`);
            } else if (abilitiesOf(c.code, 'enemyPlayMagic', c.name).length
              || /ชายจากอนาคต/.test(c.name || '')) {
              return deny(`ใช้ "${c.name}" ได้เมื่อฝ่ายตรงข้ามใช้ Magic`);
            } else if (abilitiesOf(c.code, 'avatarSummoned', c.name).length) {
              return deny(`ใช้ "${c.name}" ได้เมื่อมี Avatar อัญเชิญลงสนาม`);
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
          if (landPlayBlocked(st))
            return deny(`ใช้ Land ไม่ได้ — "${landPlayBlockName(st)}" บล็อกการใช้ Land ของทุกฝ่าย`);
          doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
          addLog(st, owner, `ใช้ Land ${c.name}`);
          fx.snd = 'place';
          // ใช้ Land = แลนด์เดิมหลุดทันที (แม้ใบใหม่ยังรอชายจากอนาคต)
          clearLandZoneFor(st, fx, a.k);
          if (offerMagicNegateReact(st, fx, owner, a.k)) {
            st._pendingMagic = { type: 'playLand', src: a.k, owner };
            break;
          }
          doMove(st, a.k, 'land', null, fx); c.controller = owner;
          addLog(st, owner, `วาง Land ${c.name}`);
          armGlobalEndPhaseTimer(st, a.k);
          sweepDestroyPowerZero(st, fx);
          fireOwnPlayMagic(st, fx, owner, rng, a.k);
          fireEnemyActivate(st, fx, owner, rng);
          break;
        }
        // เลือกมันสำหรับพวกจน: เปิด UI เลือก นรก / เด็ค (หรือทำทั้งสองถ้าไลฟ์หงาย≥4 และมากกว่าศัตรู)
        {
          const modeAb = abilitiesOf(c.code, 'chooseMode')[0];
          const eCard = fxCard(c);
          if (modeAb && modeAb.options && modeAb.options.length && eCard && eCard.lifeBothModes) {
            doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
            addLog(st, owner, `ใช้เวท ${c.name}`);
            fx.snd = 'place';
            if (offerMagicNegateReact(st, fx, owner, a.k)) {
              st._pendingMagic = { type: 'poorModes', src: a.k, owner };
              break;
            }
            runActions(st, fx, [{ op: 'choosePoorModes' }], { src: a.k, owner, rng, toHellAfter: true });
            fireEnemyActivate(st, fx, owner, rng);
            break;
          }
        }
        // Modification: สั่งใช้ (activated) ใช้ตอนอยู่ Magic Zone หลังสวม — ห้ามรันตอนเล่นจากมือ
        //    (ปืนจักรวุทธ ฯลฯ: เล่นแล้วเด้งขึ้นมือเพราะ returnToHand ใน activated)
        // playMagic = alias ของ activated สำหรับเวท Normal (สัญญาเลือด / THE END ใน JSON เก่า)
        const ab = (c.subtype === 'Modification')
          ? (abilitiesOf(c.code, 'playMagic', c.name)[0] || null)
          : (abilitiesOf(c.code, 'activated')[0] || abilitiesOf(c.code, 'playMagic')[0]);
        if (!ab) {
          doMove(st, a.k, owner + '.magic', null, fx); c.faceUp = true;
          const hellAfter = magicHellAfterPlay(c);
          addLog(st, owner, `ใช้เวท ${c.name}${c.subtype === 'Modification' ? ' — ลากทับ Avatar / กด 🔗 เพื่อสวมใส่' : hellAfter ? ' — ใช้เสร็จลงนรก' : magicStaysOnMagicZone(c) ? ' — วางค้าง Magic Zone' : ' — อ่านผลจากการ์ดแล้วจัดการกันเอง'}`);
          fx.snd = 'place';
          if (c.subtype === 'Modification') fx.offerAttach = a.k;
          fireOwnPlayMagic(st, fx, owner, rng, a.k);
          // แม้ไม่มีเอฟเฟกต์อัตโนมัติ — ยังถามชายจากอนาคตได้ (ยกเลิกการใช้เวท)
          if (c.subtype !== 'Modification' && offerMagicNegateReact(st, fx, owner, a.k)) {
            st._pendingMagic = { type: 'placeOnly', src: a.k, owner, hellAfter };
            break;
          }
          if (hellAfter && zoneOf(st, a.k)) {
            doMove(st, a.k, owner + '.hell', null, fx);
            addLog(st, owner, `ใช้เวทเสร็จ — ${c.name} ลงนรก`);
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
        {
          const td = activatedTargetDeny(st, owner, ab, a.k);
          if (td) return deny(`ใช้ "${c.name}" ไม่ได้ — ${td}`);
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
              discardNeed: needDiscard, discardGot: 0, magicCostDiscard: true, afterCostKind: 'magic'
            });
          } else if (costOp.op === 'discardGemSum') {
            const hand = (st.zones[owner + '.hand'] || []).filter(x => x !== a.k);
            const total = hand.reduce((n, id) => n + (+(st.inst[id] && st.inst[id].gem) || 0), 0);
            const need = costOp.min || 3;
            if (total < need) return deny(`ใช้ "${c.name}" ไม่ได้ — GEM ในมือรวม ${total} < ${need}`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, costOp.exact
              ? `ใช้เวท ${c.name} — ทิ้งมือรวม GEM ให้พอดี ${need}`
              : `ใช้เวท ${c.name} — ทิ้งมือรวม GEM ≥ ${need}`);
            st.prompts.push({
              kind: 'chooseDiscard', src: a.k, chooser: owner, filter: { gemMin: 1 }, excludeIds: [],
              gemSumMin: need, gemSumExact: !!costOp.exact, gemGot: 0, actions: ab.actions, effectDiscard: true, afterCostKind: 'magic'
            });
          } else if (costOp.op === 'returnHandToDeck') {
            const legal = (st.zones[owner + '.hand'] || []).filter(x => x !== a.k && matchFilterEx(st, x, costOp.filter));
            if (!legal.length) return deny(`ใช้ "${c.name}" ไม่ได้ — ไม่มีการ์ดในมือคืนเด็ค`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, `ใช้เวท ${c.name} — เลือกการ์ดในมือคืนเด็ค`);
            st.prompts.push({ kind: 'chooseDiscard', src: a.k, chooser: owner, filter: costOp.filter, actions: ab.actions, toDeck: true, effectDiscard: true, afterCostKind: 'magic' });
          } else if (costOp.op === 'sacrifice') {
            const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: costOp.filter, dest: 'sacrifice', actions: ab.actions, optional: false, afterCostKind: 'magic' };
            if (!promptCandidates(st, p).length) return deny(`ใช้ "${c.name}" ไม่ได้ — ไม่มีการ์ดบนสนามให้เซ่นไหว้`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, `ใช้เวท ${c.name} — เลือกการ์ดเซ่นไหว้`);
            st.prompts.push(p);
          } else if (costOp.op === 'sacNamedUnique') {
            if (!sacNamedUniqueOk(st, owner, costOp))
              return deny(`ใช้ "${c.name}" ไม่ได้ — ต้องมี Super Air ชื่อไม่ซ้ำครบ ${costOp.totalUnique || 4} ใบ (รวมคุณเชิดชัยและเครื่องบิน)`);
            doMove(st, a.k, owner + '.magic', null, fx);
            addLog(st, owner, `ใช้เวท ${c.name} — เลือก Super Air ชื่อไม่ซ้ำ ${costOp.totalUnique || 4} ใบส่งนรก`);
            st.prompts.push(makeSacNamedUniquePrompt(st, a.k, owner, costOp, ab.actions));
          }
          fireEnemyActivate(st, fx, owner, rng); // ศัตรูใช้ความสามารถ (เวทมีค่าใช้จ่าย)
          fx.snd = 'place'; break;
        }
        doMove(st, a.k, owner + '.magic', null, fx);
        addLog(st, owner, `ใช้เวท ${c.name}`);
        fx.snd = 'place';
        if (offerMagicNegateReact(st, fx, owner, a.k)) {
          st._pendingMagic = { type: 'activated', src: a.k, owner, actions: ab.actions, toHellAfter: magicHellAfterPlay(c) };
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
        }
        ensureMain();
        {
          const ad = attachOnlyDeny(st, c.code, a.to, c.name);
          if (ad) return deny(`"${c.name}" ${ad}`);
        }
        {
          const he = fxCard(host);
          if (he && he.uniqueAttachedNames) {
            for (const id in st.inst) {
              const m = st.inst[id];
              if (!m || m.attachedTo !== a.to || id === a.k) continue;
              if ((m.name || '') === (c.name || '')) return deny(`"${host.name}" สวมชื่อซ้ำ "${c.name}" ไม่ได้`);
            }
          }
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
        // โดนธรณีสูบแล้วเลือกใช้ผล (แว่น / สัญญาเลือด / หอกแหลม)
        if (p.kind === 'milledOptional') {
          if (a.k !== p.src) return deny('แตะการ์ดที่โดนธรณีสูบ หรือกดข้าม');
          if (p.countsAsModification && isMagicTypeUsed(st, p.chooser, 'Modification'))
            return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว');
          st.prompts.shift();
          if (p.countsAsModification) {
            if (actionsAttachSelf(p.actions)) beginDeferredModUse(st, p.chooser, p.src);
            else markMagicTypeUsed(st, p.chooser, 'Modification');
          }
          runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
          if (st.inst[p.src] && st.inst[p.src].attachedTo) commitDeferredModUse(st, p.src);
          fx.snd = 'place';
          break;
        }
        if (!promptTargetOk(st, a.k)) return deny('เป้าหมายไม่ตรงเงื่อนไขเอฟเฟกต์');
        // React แบบเลือกใบ (อุบัติเหตุ / ชายจากอนาคต ฯลฯ) — แตะใบที่กะพริบ = เปิดใช้ใบนั้น
        if (p.kind === 'react') {
          // ดักโจมตี: เก็บ prompt แล้วเล่นเป็น playMagic เพื่อให้เส้นทาง counterAtk ครบ (ค่าเซ่น / ยกเลิกโจมตี)
          if (p.reactTrigger === 'enemyDeclareAttack' || p.reactTrigger === 'oppBattlePhaseStart' || p.reactTrigger === 'ownAvatarFights' || p.reactTrigger === 'ownAvatarLeftField') {
            if (!promptCandidates(st, p).includes(a.k)) return deny('แตะ React ที่กะพริบเขียวในมือเพื่อเลือกใช้ (หรือกดไม่ใช้)');
            st.prompts.shift();
            const cont = applyAction(st, { type: 'playMagic', k: a.k, by: isPlayer ? by : p.chooser, seed: a.seed });
            if (cont) Object.keys(cont).forEach(key => { fx[key] = cont[key]; });
            break;
          }
          if (!bindReactPromptCard(st, p, a.k)) return deny('ใช้ React ใบนี้ไม่ได้');
          a = Object.assign({}, a, { type: 'reactYes', k: a.k });
          // fall through intentionally — re-enter via nested apply would double post-hooks; run inline:
          {
            const m = st.inst[p.src];
            const mz = zoneOf(st, p.src) || '';
            if (!m || !(mz.endsWith('.magic') || mz.endsWith('.hand'))) { st.prompts.shift(); break; }
            /* รัททาทุย นินจา: Avatar จากมือ — ไม่ใช่ React Magic */
            if (p.avatarHandAbility) {
              const trig = p.reactTrigger || 'ownAvatarLeftField';
              const abLF = abilitiesOf(m.code, trig, m.name)[0];
              const acts = (abLF && abLF.actions) || p.actions || [];
              const costList = normalizeAbilityCost(abLF && abLF.cost) || (Array.isArray(abLF && abLF.cost) ? abLF.cost : []);
              st.prompts.shift();
              const why = trig === 'ownAvatarDestroyedByOpp' ? 'เมื่อยักษ์ถูกทำลายโดยฝ่ายตรงข้าม'
                : trig === 'ownAvatarLeftField' ? 'เมื่อ Avatar ออกจากสนาม'
                : (p.label || '');
              addLog(st, p.chooser, `สั่งใช้จากมือ ${m.name}${why ? ' (' + why + ')' : ''}`);
              if (costList.length) payCostAndRunActivated(st, fx, p.chooser, p.src, costList, acts, rng);
              else runActions(st, fx, acts, { src: p.src, owner: p.chooser, target: p.target, rng });
              fx.snd = 'place';
              break;
            }
            const mtype = magicSubtype(m) || 'React';
            const enforceType = mtype === 'React' || !!st.strict;
            if (enforceType) {
              const typeDeny = claimMagicTypeOrDeny(st, p.chooser, m, mtype);
              if (typeDeny) return deny(typeDeny);
            }
            {
              const eOnce = fxCard(m);
              if (eOnce && eOnce.oncePerTurnCard) markOncePerTurnCard(st, p.chooser, m.name || m.code);
            }
            const pendingSummon = p.pendingSummon || null;
            st.prompts.shift();
            if (mz.endsWith('.hand')) { doMove(st, p.src, p.chooser + '.magic', null, fx); }
            m.faceUp = true;
            addLog(st, p.chooser, `เปิด React "${m.name}"!`);
            if (p.magicNegate || p.mode === 'negateMagic') {
              // ซ้อนขัดเวท: ให้ฝ่ายตรงข้ามใช้ชายจากอนาคต / อย่าให้มีครั้งที่ 2 สวนได้ก่อนยกเลิก
              const origPend = st._pendingMagic;
              st._pendingMagic = {
                type: 'confirmNegate', src: p.src, owner: p.chooser,
                target: p.target, innerPending: origPend, pendingSummon
              };
              if (offerMagicNegateReact(st, fx, p.chooser, p.src)) {
                fx.snd = 'place';
                break;
              }
              const pend = st._pendingMagic; delete st._pendingMagic;
              resolvePendingMagic(st, fx, pend, rng);
              break;
            }
            if (p.abilityReact) {
              noteAbilityReactCancel(st, p.target);
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
                if (isImmuneOppMagicTarget(st, p.target) && p.chooser !== ownerOf(st, p.target)) {
                  addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ${nameOf(st, p.target)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม — ไม่ถูกทำลาย`);
                } else {
                  addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ส่ง ${nameOf(st, p.target)} ที่ประกาศโจมตีลงนรก`);
                  destroyCard(st, fx, p.target, destroyOptsFromMagic(st, p.src, p.target));
                }
              }
              if (st.pending && st.pending.atk === p.target && !(st.inst[p.target] && (zoneOf(st, p.target) || '').endsWith('.avatar'))) {
                st.pending = null; addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่แล้ว');
              }
            } else if (p.actions && p.actions.length) {
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
            } else {
              const tgt = st.inst[p.target];
              if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ทำลาย ${tgt.name} — ส่งนรกแล้ว`);
                destroyCard(st, fx, p.target);
              }
            }
            const stillPrompt = (st.prompts || []).some(pr => pr && pr.src === p.src);
            if (st.inst[p.src] && st.inst[p.src].attachedTo) {
              addLog(st, p.chooser, `${m.name} สวมใส่ค้างบนสนาม — ไม่ลงนรก`);
            } else if (stillPrompt) {
              (st.prompts || []).forEach(pr => { if (pr && pr.src === p.src) pr.srcToHell = true; });
            } else {
              doMove(st, p.src, p.chooser + '.hell', null, fx);
            }
            if (p.abilityReact) resumeAbilityReactIfNeeded(st, fx, rng);
            if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
            fx.snd = 'clash';
          }
          break;
        }
        if (p.kind === 'chooseBuff') {
          // มาติเนซ: รถถังโดนเวทเล็ง → บังคับทำลายมาติเนซ ยกเลิกเวท
          if (tryMartinezNegate(st, fx, a.k, p)) { st.prompts.shift(); break; }
          // ยักษ์หิน: ยักษ์โดนเวทเล็ง → เสนอให้นอนรับเป้าแทน
          if (offerMagicRedirect(st, fx, a.k, p)) break;
          st.prompts.shift();
          applyMagicPromptOnTarget(st, fx, p, a.k, rng);
        } else if (p.kind === 'chooseDiscard') {
          if (p.toDeck) {
            doMove(st, a.k, p.chooser + '.deck', p.toDeckBottom ? 'bottom' : null, fx);
            if (p.toDeckBottom) {
              addLog(st, p.chooser, `วาง ${nameOf(st, a.k)} ไว้ล่างสุดเด็ค`);
            } else {
              seededShuffle(st.zones[p.chooser + '.deck'], rng);
              syncHeimdall(st);
              addLog(st, p.chooser, `คืน ${nameOf(st, a.k)} เข้าเด็คแล้วสับ`);
            }
          } else {
            const gemAdd = +(st.inst[a.k].gem) || 0;
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            addLog(st, p.chooser, p.effectDiscard ? `ทิ้ง ${nameOf(st, a.k)}${p.gemSumMin != null ? ` (GEM +${gemAdd})` : ''}` : `ทิ้ง ${nameOf(st, a.k)} จ่ายค่าเวท`);
            if (p.gemSumMin != null) {
              p.gemGot = (p.gemGot || 0) + gemAdd;
              st.prompts.shift();
              if (p.gemSumExact) {
                if (p.gemGot > p.gemSumMin) {
                  addLog(st, 'S', `GEM รวม ${p.gemGot} เกิน ${p.gemSumMin} — ยกเลิกเอฟเฟกต์`);
                  fx.snd = 'tap';
                  break;
                }
                if (p.gemGot < p.gemSumMin) {
                  if (!promptCandidates(st, p).length) {
                    addLog(st, 'S', `GEM รวมได้ ${p.gemGot}/${p.gemSumMin} (ต้องพอดี) — มือไม่มีใบที่ต่อได้ ยกเลิกเอฟเฟกต์`);
                  } else {
                    st.prompts.unshift(p);
                    addLog(st, p.chooser, `GEM รวม ${p.gemGot}/${p.gemSumMin} (ต้องพอดี) — ทิ้งต่อ`);
                  }
                  fx.snd = 'tap';
                  break;
                }
                addLog(st, p.chooser, `GEM รวมพอดี ${p.gemGot}`);
              } else if (p.gemGot < p.gemSumMin) {
                if (!promptCandidates(st, p).length) {
                  addLog(st, 'S', `GEM รวมได้ ${p.gemGot}/${p.gemSumMin} — มือหมด ข้ามเอฟเฟกต์`);
                } else {
                  st.prompts.unshift(p);
                  addLog(st, p.chooser, `GEM รวม ${p.gemGot}/${p.gemSumMin} — ทิ้งต่อ`);
                }
                fx.snd = 'tap';
                break;
              } else {
                addLog(st, p.chooser, `GEM รวมครบ ${p.gemGot} ≥ ${p.gemSumMin}`);
              }
              if (finishPaidDiscard(st, fx, p, rng)) { fx.snd = 'tap'; break; }
              if (p.actions && p.actions.length) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, toHellAfter: magicHellAfterPlay(st.inst[p.src]), rng: rng });
              else if (magicHellAfterPlay(st.inst[p.src]) && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
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
              if (finishPaidDiscard(st, fx, p, rng)) { fx.snd = 'tap'; break; }
              if (p.actions && p.actions.length) {
                if (p.magicCostDiscard || p.effectDiscard) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, toHellAfter: magicHellAfterPlay(st.inst[p.src]), rng: rng });
                else enterChainOrResolve(st, fx, { src: p.src, owner: p.chooser, actions: p.actions });
              } else if (magicHellAfterPlay(st.inst[p.src]) && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
              fx.snd = 'tap';
              break;
            }
          }
          st.prompts.shift();
          if (finishPaidDiscard(st, fx, p, rng)) { fx.snd = 'tap'; break; }
          if (p.effectDiscard || p.toDeck) {
            const hellSpell = p.srcToHell != null ? !!p.srcToHell : magicHellAfterPlay(st.inst[p.src]);
            if (p.actions && p.actions.length) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, toHellAfter: hellSpell, rng: rng });
            else if (hellSpell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          } else {
            enterChainOrResolve(st, fx, { src: p.src, owner: p.chooser, actions: p.actions || [] });
          }
        } else if (p.kind === 'chooseDestroy') {
          if (tryMartinezNegate(st, fx, a.k, p)) { st.prompts.shift(); break; }
          if (offerMagicRedirect(st, fx, a.k, p)) break;
          st.prompts.shift();
          applyMagicPromptOnTarget(st, fx, p, a.k, rng);
        } else if (p.kind === 'pick') {
          st.prompts.shift();
          const pickedFromDeck = !!(st.zones[p.chooser + '.deck'] || []).includes(a.k);
          if (p.from === 'ids' && (p.autoHandIds || []).length) flushScoutAutoHand(st, fx, p);
          if (p.dest === 'sacrifice') {
            addLog(st, p.chooser, `เซ่นไหว้ ${nameOf(st, a.k)}`);
            const srcC = st.inst[p.src];
            const cont = {
              src: p.src, owner: p.chooser, actions: p.actions || [],
              keepSrc: !!p.keepSrc, counterAtkCtx: p.counterAtkCtx || null,
              whenAttacking: !!p.whenAttacking,
              isMagic: !!(srcC && srcC.type === 'Magic'),
              kind: p.afterCostKind || paidCostKind(st, p.src)
            };
            destroyCard(st, fx, a.k, Object.assign({}, destroyOptsFromSrc(st, p.src, a.k), { costContinue: cont }));
            if (st._wouldDestroyPending && st._wouldDestroyPending.k === a.k) {
              st._wouldDestroyPending.costContinue = cont;
              fx.snd = 'clash';
              break;
            }
            if (cardStillOnAvatarZone(st, a.k)) {
              abortUnpaidDestroyCost(st, fx, cont);
              fx.snd = 'clash';
              break;
            }
            continueAfterDestroyCost(st, fx, cont, rng);
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
            const sacInfo = sacC ? { symbol: sacC.symbol, name: sacC.name, power: +sacC.power || 0, k: a.k } : null;
            addLog(st, p.chooser, `เซ่นไหว้ ${nameOf(st, a.k)}`);
            destroyCard(st, fx, a.k);
            fx.snd = 'clash';
            if (p.then && p.then.length && sacInfo) {
              runActions(st, fx, p.then, { src: p.src, owner: p.chooser, sacrificed: sacInfo, rng: rng });
            }
          } else if (p.dest === 'payRemainSummon') {
            const sk = p.summonK;
            const failPay = (msg) => { st.prompts.unshift(p); return deny(msg); };
            if (!sk || !st.inst[sk] || a.k === sk) return failPay('แตะการ์ดในมือเพื่อจ่าย Cost ที่เหลือ (ไม่ใช่ใบที่จะอัญเชิญ)');
            if (!(st.zones[p.chooser + '.hand'] || []).includes(a.k)) return failPay('จ่ายได้เฉพาะการ์ดในมือ');
            const add = gemUsableTowardSummon(st, a.k, sk);
            if (add <= 0) return failPay('ใบนี้จ่าย Cost การ์ดที่เลือกไม่ได้ (สีไม่ตรงหรือไม่มี GEM)');
            const nextPay = (p.payIds || []).concat([a.k]);
            const payDeny = gemPayDenyMsg(st, nextPay, sk, p.need);
            if (payDeny) return failPay(payDeny);
            p.payIds = nextPay;
            p.got = (p.got || 0) + add;
            p.excludeIds = [sk].concat(p.payIds);
            addLog(st, p.chooser, `จ่าย ${nameOf(st, a.k)} (GEM ${add}) รวม ${p.got}/${p.need}`);
            if (p.got < p.need) {
              if (!promptCandidates(st, p).length) {
                addLog(st, 'S', `GEM รวม ${p.got}/${p.need} — มือไม่พอจ่ายต่อ ยกเลิกอัญเชิญ`);
                fx.snd = 'tap';
                break;
              }
              st.prompts.unshift(p);
              addLog(st, p.chooser, `ยังขาด ${p.need - p.got} — แตะใบถัดไป`);
              fx.snd = 'tap';
              break;
            }
            (p.payIds || []).forEach(id => {
              if (zoneOf(st, id)) doMove(st, id, p.chooser + '.hell', null, fx);
            });
            const qdPay = quotaDeny(st, p.chooser + '.avatar', st.inst[sk]);
            if (qdPay) {
              addLog(st, 'S', `ลงสนามไม่ได้ (${qdPay}) — ${nameOf(st, sk)} ยังอยู่ในมือ`);
              fx.snd = 'tap';
              break;
            }
            doMove(st, sk, p.chooser + '.avatar', null, fx);
            if ((p.costReduce || 0) && st.inst[sk]) {
              st.inst[sk].costDelta = (st.inst[sk].costDelta || 0) - p.costReduce;
              addLog(st, p.chooser, `${nameOf(st, sk)} Cost −${p.costReduce}`);
            }
            if (p.summonTapped && st.inst[sk]) st.inst[sk].tapped = true;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: อัญเชิญ ${nameOf(st, sk)} ลงสนาม (จ่าย Cost เหลือ ${p.need})`);
            if (p.grantSummoned && st.inst[sk]) {
              st.inst[sk].granted = (st.inst[sk].granted || []).concat(JSON.parse(JSON.stringify(p.grantSummoned)));
              addLog(st, p.chooser, `${nameOf(st, sk)} ได้รับความสามารถจาก ${nameOf(st, p.src)}`);
            }
            triggerSummon(st, fx, sk, p.chooser, { paidCost: true, summonedByAvatar: p.summonedByAvatar || null });
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, summoned: sk, rng: rng });
            fx.snd = 'place';
          } else if (p.dest === 'avatar') {
            const fromZ = zoneOf(st, a.k) || '';
            if (fromZ.endsWith('.hell')) {
              if (noHellSummonCard(st, a.k)) {
                addLog(st, 'S', `${nameOf(st, a.k)} อัญเชิญจากนรกไม่ได้`);
                break;
              }
              const blk = hellSummonBlocked(st);
              if (blk) { addLog(st, 'S', `อัญเชิญจากนรกไม่ได้ — ${blk} บล็อก`); break; }
            }
            if (fromZ.endsWith('.deck') && st.inst[a.k] && st.inst[a.k].type === 'Avatar') {
              const blkDeck = deckSummonBlocked(st);
              if (blkDeck) { addLog(st, 'S', `อัญเชิญ Avatar จากเด็คไม่ได้ — ${blkDeck} บล็อก`); break; }
            }
            const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[a.k]);
            if (qd) {
              if (p.restTo === 'hell') {
                addLog(st, 'S', `ลงสนามไม่ได้ (${qd}) — ${nameOf(st, a.k)} ลงนรก`);
                doMove(st, a.k, p.chooser + '.hell', null, fx);
              } else if (p.restTo === 'bottom') {
                addLog(st, 'S', `ลงสนามไม่ได้ (${qd}) — ${nameOf(st, a.k)} ลงใต้เด็ค`);
                doMove(st, a.k, p.chooser + '.deck', 'bottom', fx);
              } else {
                addLog(st, 'S', `ลงสนามไม่ได้ (${qd}) — ${nameOf(st, a.k)} ขึ้นมือแทน`);
                doMove(st, a.k, p.chooser + '.hand', null, fx);
              }
            } else {
              if (p.mustPayRemain) {
                const remain = Math.max(0, effCost(st, a.k) - (p.costReduce || 0));
                if (remain > 0) {
                  st.prompts.push({
                    kind: 'pick', from: 'ownHand', src: p.src, chooser: p.chooser,
                    dest: 'payRemainSummon', summonK: a.k, need: remain, got: 0, payIds: [],
                    costReduce: p.costReduce || 0, paidCost: true, mustPayRemain: true,
                    optional: true, excludeIds: [a.k],
                    then: p.then || null, grantSummoned: p.grantSummoned || null,
                    summonTapped: !!p.summonTapped,
                    summonUntappedIfLandNameIncludes: p.summonUntappedIfLandNameIncludes || null,
                    summonedByAvatar: p.summonedByAvatar || null
                  });
                  addLog(st, p.chooser, `เลือก ${nameOf(st, a.k)} Cost ${effCost(st, a.k)} −${p.costReduce || 0} เหลือ ${remain} — แตะการ์ดในมือจ่าย GEM ให้ครบก่อนลงสนาม`);
                  fx.snd = 'place';
                  break;
                }
              }
              const pickedCost = p.costSumMax != null ? (effCost(st, a.k) || 0) : 0;
              doMove(st, a.k, p.chooser + '.avatar', null, fx);
              if ((p.costReduce || 0) && st.inst[a.k]) {
                st.inst[a.k].costDelta = (st.inst[a.k].costDelta || 0) - p.costReduce;
                addLog(st, p.chooser, `${nameOf(st, a.k)} Cost −${p.costReduce}`);
              }
              let tap = !!p.summonTapped;
              if (p.summonUntappedIfLandNameIncludes) {
                const hasLand = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], p.summonUntappedIfLandNameIncludes));
                tap = !hasLand;
              }
              if (tap && st.inst[a.k]) st.inst[a.k].tapped = true;
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: อัญเชิญ ${nameOf(st, a.k)} ลงสนาม${tap ? ' (นอน)' : ''}`);
              if (p.grantSummoned && st.inst[a.k]) {
                st.inst[a.k].granted = (st.inst[a.k].granted || []).concat(JSON.parse(JSON.stringify(p.grantSummoned)));
                addLog(st, p.chooser, `${nameOf(st, a.k)} ได้รับความสามารถจาก ${nameOf(st, p.src)}`);
              }
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
              if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, summoned: a.k, rng });
              if (p.scheduleDestroyAfterOppTurn && st.inst[a.k]) {
                st.scheduled.push({
                  player: other(p.chooser), op: 'destroyCard', k: a.k, when: 'endPhase',
                  note: 'วิญญาณวีรชน'
                });
                addLog(st, 'S', `${nameOf(st, a.k)} จะถูกส่งนรกเมื่อจบเทิร์นถัดไปของฝ่ายตรงข้าม`);
              }
              if (p.multiMax) {
                p.multiGot = (p.multiGot || 0) + 1;
                if (p.costSumMax != null) p.costGot = (p.costGot || 0) + pickedCost;
                if (p.distinctNames && st.inst[a.k] && st.inst[a.k].name) {
                  p.pickedNames = p.pickedNames || [];
                  p.pickedNames.push(st.inst[a.k].name);
                }
                if (p.multiGot < p.multiMax && promptCandidates(st, p).length) {
                  if (p.paidCost) st.prompts.push(p);
                  else st.prompts.unshift(p);
                  const costNote = p.costSumMax != null ? ` · Cost รวม ${p.costGot}/${p.costSumMax}` : '';
                  addLog(st, p.chooser, `อัญเชิญเพิ่มได้ (${p.multiGot}/${p.multiMax}${costNote}) หรือข้าม`);
                }
              }
            }
          } else if (p.dest === 'hand' && p.multiMax) {
            doMove(st, a.k, p.chooser + '.hand', null, fx);
            p.multiGot = (p.multiGot || 0) + 1;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} ขึ้นมือ (${p.multiGot}/${p.multiMax})`);
            if (p.multiGot < p.multiMax && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
              addLog(st, p.chooser, `เลือกเพิ่มได้ หรือข้าม`);
            }
            fx.snd = 'draw';
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
            if (!isLandMagic(st.inst[a.k])) {
              addLog(st, 'S', `เล่น Land ไม่ได้ — ไม่ใช่ Magic ชนิด Land`);
            } else if (landPlayBlocked(st)) {
              addLog(st, 'S', `เล่น Land ไม่ได้ — "${landPlayBlockName(st)}" บล็อกการใช้ Land`);
            } else {
              clearLandZoneFor(st, fx, a.k);
              doMove(st, a.k, 'land', null, fx);
              st.inst[a.k].faceUp = true;
              st.inst[a.k].controller = p.chooser;
              addLog(st, p.chooser, `เล่น Land ${nameOf(st, a.k)} จากเด็ค`);
              armGlobalEndPhaseTimer(st, a.k);
              if (p.shuffleAfter) {
                const d = st.zones[p.chooser + '.deck'];
                for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
              }
              fx.snd = 'place';
              sweepDestroyPowerZero(st, fx);
            }
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
              if (p.afterCostKind) continueAfterPaidCost(st, fx, { src: p.src, owner: p.chooser, actions: p.actions || [], kind: p.afterCostKind, keepSrc: !!p.keepSrc }, rng);
              else runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
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
              if (p.afterCostKind) continueAfterPaidCost(st, fx, { src: p.src, owner: p.chooser, actions: p.actions || [], kind: p.afterCostKind, keepSrc: !!p.keepSrc }, rng);
              else runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
            } else {
              addLog(st, 'S', `เนรเทศไม่ครบ — ยกเลิก`);
            }
          } else if (p.dest === 'giveHandNegate') {
            const opp = other(p.chooser);
            doMove(st, a.k, opp + '.hand', null, fx);
            markMagicTypeUsed(st, p.chooser, 'React');
            claimOncePerTurn(st, p.src, 'richNegate');
            if (st._pendingAbility) {
              addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} — ยกเลิกจุติ/ความสามารถของ ${nameOf(st, p.target || st._pendingAbility.k || st._pendingAbility.src)}`);
              delete st._pendingAbility;
            } else if (st._pendingMagic) {
              st._pendingMagic.negated = true;
              addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} — ยกเลิกความสามารถ`);
              delete st._pendingMagic;
            } else if (st.chain && st.chain.length) {
              st.chain[st.chain.length - 1].negated = true;
              addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} — ยกเลิกบนเชน`);
            } else addLog(st, p.chooser, `คนรวย: ยื่น ${nameOf(st, a.k)} (ไม่มีจุติค้างให้ยกเลิก)`);
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
            } else if (p.srcToHell && zoneOf(st, p.src)) {
              doMove(st, p.src, p.chooser + '.hell', null, fx);
              addLog(st, p.chooser, `ใช้เวทเสร็จ — ${nameOf(st, p.src)} ลงนรก`);
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
            if (p.shuffleAfter || (p.shuffleAfterIfFromDeck && pickedFromDeck)) {
              seededShuffle(st.zones[p.chooser + '.deck'], rng);
              addLog(st, p.chooser, 'สับเด็ค');
              syncHeimdall(st);
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
            if (p.shuffleAfter) {
              seededShuffle(st.zones[p.chooser + '.deck'] || [], rng);
              addLog(st, p.chooser, 'สับเด็ค');
              syncHeimdall(st);
            }
          } else if (p.dest === 'magic') {
            const prevOwn = ownerOf(st, a.k);
            if (st.inst[a.k] && prevOwn && prevOwn !== p.chooser && !st.inst[a.k].originalOwner)
              st.inst[a.k].originalOwner = prevOwn;
            doMove(st, a.k, p.chooser + '.magic', null, fx);
            if (st.inst[a.k]) { st.inst[a.k].faceUp = true; st.inst[a.k].tapped = false; }
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: วาง ${nameOf(st, a.k)} บน Magic Zone`);
            if (p.distinctNames && st.inst[a.k] && st.inst[a.k].name) {
              p.pickedNames = p.pickedNames || [];
              p.pickedNames.push(st.inst[a.k].name);
            }
            if (p.thenIfExactName && p.thenIfFound && p.thenIfFound.length && st.inst[a.k] && (st.inst[a.k].name || '') === p.thenIfExactName) {
              runActions(st, fx, p.thenIfFound, { src: p.src, owner: p.chooser, rng });
            }
            if (p.multiMax) {
              p.multiGot = (p.multiGot || 0) + 1;
              if (p.multiGot < p.multiMax && promptCandidates(st, p).length) {
                st.prompts.unshift(p);
                addLog(st, p.chooser, `เลือกเพิ่มได้ (${p.multiGot}/${p.multiMax}) หรือข้าม`);
                p._skipPickTail = true;
              }
            }
            fx.snd = 'place';
          } else if (p.dest === 'magicToHellCost') {
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            p.got = (p.got || 0) + 1;
            addLog(st, p.chooser, `ส่ง ${nameOf(st, a.k)} จาก Magic Zone ลงนรก (${p.got}/${p.need})`);
            if (p.got < (p.need || 1) && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
            } else if (p.got >= (p.need || 1)) {
              if (p.afterCostKind) continueAfterPaidCost(st, fx, { src: p.src, owner: p.chooser, actions: p.actions || [], kind: p.afterCostKind, keepSrc: !!p.keepSrc }, rng);
              else runActions(st, fx, p.actions || [], { src: p.src, owner: p.chooser, rng });
            } else {
              addLog(st, 'S', `ส่งนรกไม่ครบ — ยกเลิก`);
            }
            fx.snd = 'place';
          } else if (p.dest === 'deckTop') {
            doMove(st, a.k, p.chooser + '.deck', null, fx); // push = บนสุด
            if (st.inst[a.k]) st.inst[a.k].faceUp = true;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: วาง ${nameOf(st, a.k)} บนสุดเด็ค`);
            syncHeimdall(st);
          } else if (p.dest === 'oppBottomPickTop') {
            const opp = p.scoutOpp || other(p.chooser);
            doMove(st, a.k, opp + '.deck', null, fx);
            (p.peekRest || []).forEach(id => {
              if (!st.inst[id]) return;
              st.inst[id].faceUp = false;
              delete st.inst[id].revealed;
            });
            if (st.inst[a.k]) { st.inst[a.k].faceUp = false; delete st.inst[a.k].revealed; }
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: วาง ${nameOf(st, a.k)} บนสุดเด็ค ${opp} (ใบล่างที่เหลือเรียงเดิม)`);
            syncHeimdall(st);
            fx.snd = 'place';
          } else if (p.dest === 'revealHandCard') {
            if (st.inst[a.k]) { st.inst[a.k].revealed = true; st.inst[a.k].faceUp = true; }
            addLog(st, 'S', `${p.chooser} แสดง "${nameOf(st, a.k)}" จากมือ`);
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
          } else if (p.dest === 'scoutOppHell') {
            const opp = p.scoutOpp || other(p.chooser);
            doMove(st, a.k, opp + '.hell', null, fx);
            addLog(st, p.chooser, `ทิ้ง "${nameOf(st, a.k)}" จากสอดแนมลงนรก`);
            const rest = (p.scoutRest || []).filter(id => id !== a.k && st.inst[id] && (zoneOf(st, id) || '').endsWith('.deck'));
            rest.slice().reverse().forEach(id => {
              const z = zoneOf(st, id);
              if (z) {
                st.zones[z] = st.zones[z].filter(x => x !== id);
                st.zones[opp + '.deck'].push(id);
              }
            });
            if (rest.length) addLog(st, 'S', `การ์ดที่เหลือ ${rest.length} ใบกลับไว้บนสุดเด็ค ${opp}`);
            syncHeimdall(st);
            fx.snd = 'clash';
          } else if (p.dest === 'forceDuelOwn') {
            st.prompts.unshift({
              kind: 'pick', from: 'ids', ids: p.foeIds || [], src: p.src, chooser: p.chooser,
              dest: 'forceDuelFoe', optional: false, allowAnyZone: true,
              duelOwn: a.k, blockReact: !!p.blockReact
            });
            addLog(st, p.chooser, `เลือกแล้ว ${nameOf(st, a.k)} — เลือก Avatar ศัตรูเพื่อดวล`);
          } else if (p.dest === 'forceDuelFoe') {
            const ownK = p.duelOwn, foeK = a.k;
            if (!st.inst[ownK] || !st.inst[foeK]) addLog(st, 'S', 'ดวลไม่ได้ — การ์ดไม่อยู่บนสนาม');
            else {
              const oa = ownerOf(st, ownK), ob = ownerOf(st, foeK);
              st.pending = { atk: ownK, def: foeK, life: null, by: oa, target: ob, held: false, blockReact: !!p.blockReact, noTapDuel: true };
              addLog(st, 'S', `ดวล: ${nameOf(st, ownK)} vs ${nameOf(st, foeK)} (ไม่นอน · ห้าม React)`);
              resolveCombat(st, fx, ownK, foeK, null);
              st.pending = null;
              clearCombatBuffs(st);
              fx.snd = 'clash';
            }
          } else if (p.dest === 'bounceTappedDeckDraw') {
            const own = ownerOf(st, a.k);
            const side = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'bounceTappedDeckDraw', k: a.k, side, chooser: p.chooser, src: p.src
              })) {
              fx.snd = 'place';
            } else {
              doMove(st, a.k, side + '.deck', null, fx);
              seededShuffle(st.zones[side + '.deck'], rng);
              syncHeimdall(st);
              takeFromDeckToHand(st, side, 1, fx);
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} กลับเด็ค ${side} สับ แล้ว ${side} จั่ว 1`);
              fx.snd = 'draw';
            }
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
                unlockScoutIds(st, p.ids || []);
                rest.forEach(x => {
                  st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
                  st.zones[p.chooser + '.deck'].unshift(x);
                });
              }
              if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); syncHeimdall(st); }
            }
            fx.snd = 'place';
          } else if (p.dest === 'replaceFirstDraw') {
            doMove(st, a.k, p.chooser + '.hand', null, fx);
            addLog(st, p.chooser, `Draw Phase แรก: นำ ${nameOf(st, a.k)} จากเด็คขึ้นมือแทนการจั่ว`);
            seededShuffle(st.zones[p.chooser + '.deck'], rng);
            addLog(st, p.chooser, 'สับเด็ค');
            syncHeimdall(st);
            finishDrawPhaseStart(p.chooser);
            p._skipPickTail = true;
            fx.drawn = a.k;
            fx.snd = 'draw';
          } else if (p.dest === 'takeControl') {
            const block = controlImmuneBlock(st, a.k, p.src);
            if (block) { addLog(st, 'S', block); }
            else {
              const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[a.k]);
              if (qd) addLog(st, 'S', `ยึดไม่ได้ (${qd})`);
              else {
                const fromOwner = ownerOf(st, a.k);
                if (st.inst[a.k].originalOwner == null) st.inst[a.k].originalOwner = fromOwner;
                doMove(st, a.k, p.chooser + '.avatar', null, fx);
                if (p.keepTapped !== false) st.inst[a.k].tapped = true;
                addLog(st, p.chooser, `⛓️ เอฟเฟกต์ ${nameOf(st, p.src)}: ยึดการควบคุม ${nameOf(st, a.k)} มาฝั่งเรา${p.keepTapped !== false ? ' (นอน)' : ''}`);
                if (p.thenAttachSrc && st.inst[p.src] && equipOnto(st, p.src, a.k))
                  addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ตัวเองให้ ${nameOf(st, a.k)}`);
                if ((p.until || 'endOfTurn') === 'endOfTurn') {
                  st.scheduled.push({
                    player: st.active, when: 'endPhase', op: 'returnControl',
                    k: a.k, toOwner: fromOwner
                  });
                }
              }
            }
          } else if (p.dest === 'destroy') {
            destroyCard(st, fx, a.k, destroyOptsFromSrc(st, p.src, a.k));
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ทำลาย ${nameOf(st, a.k)}`);
            fx.snd = 'clash';
            // นรสิง ฯลฯ — นัดเปลี่ยนร่างเฉพาะเมื่อทำลายสำเร็จ
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
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
          } else if (p.dest === 'scoutAllHandThenExile') {
            // เทพผดุงธรรม: รับใบสอดแนมทั้งหมดขึ้นมือ แล้วเลือกเนรเทศศัตรู
            finishScoutAllHandThenExile(st, fx, p);
          } else if (p.dest === 'dark') {
            const own = ownerOf(st, a.k);
            const darkSide = (own === 'A' || own === 'B') ? own : p.chooser;
            doMove(st, a.k, darkSide + '.dark', null, fx);
            if (st.inst[a.k]) st.inst[a.k].attachedTo = null;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: เนรเทศ ${nameOf(st, a.k)} ลงมิติมืดฝ่าย ${darkSide}`);
            if (p.from === 'ids' && p.restTo === 'bottom') {
              const rest = (p.ids || []).filter(x => x !== a.k && (st.zones[p.chooser + '.deck'] || []).includes(x));
              unlockScoutIds(st, p.ids || []);
              rest.forEach(x => {
                st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
                st.zones[p.chooser + '.deck'].unshift(x);
              });
              if (rest.length) addLog(st, p.chooser, `การ์ดที่เหลือจากสอดแนม ${rest.length} ใบ ลงใต้เด็ค`);
            }
            if (p.shuffleAfter || (p.shuffleAfterIfFromDeck && pickedFromDeck)) {
              seededShuffle(st.zones[p.chooser + '.deck'], rng);
              addLog(st, p.chooser, 'สับเด็ค');
              syncHeimdall(st);
            }
            if (p.afterCostKind) {
              continueAfterPaidCost(st, fx, { src: p.src, owner: p.chooser, actions: p.actions || [], kind: p.afterCostKind, keepSrc: !!p.keepSrc, onceTag: p.onceTag || null }, rng);
            } else if (p.actions && p.actions.length)
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, rng, onceTag: p.onceTag || null });
            p._skipPickTail = true;
            fx.snd = 'tap';
          } else if (p.dest === 'exileThenDarkAttach') {
            const exiledName = (st.inst[a.k] && st.inst[a.k].name) || '';
            const host = p.hostK;
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            if (st.inst[a.k]) st.inst[a.k].attachedTo = null;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: เนรเทศ ${exiledName} ลงมิติมืด`);
            if (p.onceTag) claimOncePerTurn(st, p.src, p.onceTag);
            const dp = {
              kind: 'pick', from: 'dark', src: p.src, chooser: p.chooser,
              filter: { nameIncludes: [p.nameIncludes || 'อาวุธนคร'].filter(Boolean), nameNotEquals: exiledName },
              dest: 'pickAttachHost', hostFilter: { nameIncludes: ['มือปืนนคร'] },
              preferHost: host, optional: false, thenUntap: !!p.thenUntap, allowAnyZone: true
            };
            if (promptCandidates(st, dp).length) {
              st.prompts.unshift(dp);
              addLog(st, p.chooser, `เลือก "${p.nameIncludes || 'อาวุธนคร'}" ที่ชื่อไม่ใช่ "${exiledName}" จากมิติมืดมาสวม`);
            } else addLog(st, 'S', `ไม่มีอาวุธนครชื่อต่างในมิติมืด`);
            fx.snd = 'tap';
          } else if (p.dest === 'tap' || p.dest === 'untap') {
            if (p.dest === 'untap') {
              if (tryUntap(st, a.k, p.src))
                addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ตื่น ${nameOf(st, a.k)}`);
            } else {
              if (cannotChangeState(st, a.k))
                addLog(st, 'S', `${nameOf(st, a.k)} ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
              else {
                st.inst[a.k].tapped = true;
                addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นอน ${nameOf(st, a.k)}`);
              }
            }
            if (p.multiExact) {
              p.multiGot = (p.multiGot || 0) + 1;
              if (p.multiGot < p.multiExact && promptCandidates(st, p).length) {
                st.prompts.unshift(p);
                addLog(st, p.chooser, `เลือกอีก ${p.multiExact - p.multiGot} ใบให้นอน`);
              } else if (p.multiGot >= p.multiExact && p.then && p.then.length) {
                runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng, toHellAfter: p.srcToHell });
              } else if (p.multiExact && p.multiGot < p.multiExact) {
                addLog(st, 'S', `ต้องการ ${p.multiExact} ใบ แต่เหลือเป้าไม่พอ — ข้ามผล`);
              }
            } else if (p.then && p.then.length) {
              runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng, toHellAfter: p.srcToHell });
            }
          } else if (p.dest === 'pickAttachHost') {
            // เลือกการ์ดมาสวมแล้ว → ถ้ามี preferHost ที่ยังอยู่และตรง filter ให้สวมเลย
            if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }
            let host = p.preferHost;
            if (!(host && st.inst[host] && (zoneOf(st, host) || '').endsWith('.avatar') && matchFilterEx(st, host, p.hostFilter)))
              host = null;
            if (host) {
              const ad = attachOnlyDeny(st, st.inst[a.k].code, host, st.inst[a.k].name);
              if (ad) addLog(st, 'S', `"${nameOf(st, a.k)}" ${ad}`);
              else if (equipOnto(st, a.k, host)) {
                addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ ${nameOf(st, a.k)} ให้ ${nameOf(st, host)}`);
                fireWeaponModAttached(st, fx, a.k, rng);
                if (p.countsAsModification) {
                  consumeCountsAsModification(st, p.chooser);
                  addLog(st, p.chooser, 'นับว่าใช้ Modification Magic แล้วในเทิร์นนี้');
                }
                if (p.thenBuffHost && p.thenBuffHost.amount && st.inst[host]) {
                  st.buffs.push({ k: host, amt: p.thenBuffHost.amount, until: p.thenBuffHost.duration === 'combat' ? 'combat' : 'endOfTurn', from: p.src });
                  addLog(st, p.chooser, `${nameOf(st, host)} POWER +${p.thenBuffHost.amount} จนจบเทิร์น`);
                }
                if (p.thenUntap && st.inst[host]) {
                  if (tryUntap(st, host, p.src || a.k)) addLog(st, p.chooser, `${nameOf(st, host)} ตื่น`);
                }
              }
            } else {
              const hp = { kind: 'pick', from: 'ownAvatars', src: p.src, chooser: p.chooser, filter: p.hostFilter, dest: 'attachTo', attachMod: a.k, optional: true, thenBuffHost: p.thenBuffHost || null, thenUntap: !!p.thenUntap, countsAsModification: !!p.countsAsModification, onceTag: p.onceTag || null };
              if (promptCandidates(st, hp).length) { st.prompts.unshift(hp); addLog(st, p.chooser, `เลือก Avatar ที่จะสวมใส่ ${nameOf(st, a.k)}`); }
              else {
                addLog(st, 'S', `ไม่มี Avatar ให้สวมใส่ — นับว่าใช้ไปแล้ว`);
                if (p.countsAsModification) consumeCountsAsModification(st, p.chooser);
              }
            }
          } else if (p.dest === 'hellMultiDeck') {
            doMove(st, a.k, p.chooser + '.deck', null, fx);
            p.returnedIds = p.returnedIds || [];
            p.returnedIds.push(a.k);
            p.multiGot = (p.multiGot || 0) + 1;
            if (st.inst[a.k] && st.inst[a.k].type === 'Magic') p.magicGot = (p.magicGot || 0) + 1;
            if (p.distinctNames && st.inst[a.k] && st.inst[a.k].name) {
              p.pickedNames = p.pickedNames || [];
              p.pickedNames.push(st.inst[a.k].name);
            }
            const need = p.multiExact != null ? p.multiExact : (p.multiMax || 4);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} จากนรกกลับเด็ค (${p.multiGot}/${need})`);
            if (p.multiGot < need && promptCandidates(st, p).length) {
              st.prompts.unshift(p);
            } else if (p.multiExact != null && p.multiGot < p.multiExact) {
              abortHellMulti(st, fx, p);
            } else {
              finishHellMulti(st, fx, p, rng);
            }
          } else if (p.dest === 'attachTo') {
            const mod = st.inst[p.attachMod];
            if (mod) {
              const ad = attachOnlyDeny(st, mod.code, a.k, mod.name);
              if (ad) return deny(`"${mod.name}" ${ad}`);
              if (equipOnto(st, p.attachMod, a.k)) {
                if (p.stackOnReattach) {
                  mod.equipHostChanges = (mod.equipHostChanges || 0) + 1;
                  addLog(st, p.chooser, `${mod.name}: เปลี่ยนโฮสต์ — POWER +1 เพิ่มเป็น +${1 + mod.equipHostChanges}`);
                }
                if (p.countsAsModification) {
                  consumeCountsAsModification(st, p.chooser);
                  addLog(st, p.chooser, 'นับว่าใช้ Modification Magic แล้วในเทิร์นนี้');
                } else commitDeferredModUse(st, p.attachMod);
                addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ ${mod.name} ให้ ${nameOf(st, a.k)}`);
                fireWeaponModAttached(st, fx, p.attachMod, rng);
                if (p.thenBuffHost && p.thenBuffHost.amount && st.inst[a.k]) {
                  st.buffs.push({ k: a.k, amt: p.thenBuffHost.amount, until: p.thenBuffHost.duration === 'combat' ? 'combat' : 'endOfTurn', from: p.src });
                  addLog(st, p.chooser, `${nameOf(st, a.k)} POWER +${p.thenBuffHost.amount} จนจบเทิร์น`);
                }
                if (p.thenUntap && st.inst[a.k]) {
                  if (tryUntap(st, a.k, p.src || p.attachMod)) addLog(st, p.chooser, `${nameOf(st, a.k)} ตื่น`);
                }
                // ยาแก้ไอน้ำดำ: คืน POWER ที่ถูกลดไว้
                if (fxCard(mod) && fxCard(mod).ignoreNegativePower) {
                  let neg = 0;
                  (st.buffs || []).forEach(b => { if (b.k === a.k && b.amt < 0) neg += b.amt; });
                  if (st.inst[a.k].curse && st.inst[a.k].curse.powerMod < 0) neg += st.inst[a.k].curse.powerMod;
                  if (neg < 0) {
                    st.buffs.push({ k: a.k, amt: -neg, until: 'permanent' });
                    addLog(st, 'S', `เอฟเฟกต์ ${mod.name}: คืน POWER ${-neg} ที่ถูกลดไว้`);
                  }
                }
                if (p.thenDestroyAttacker && st.inst[p.thenDestroyAttacker] && (zoneOf(st, p.thenDestroyAttacker) || '').endsWith('.avatar')) {
                  addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมสำเร็จ — ทำลายผู้โจมตี ${nameOf(st, p.thenDestroyAttacker)}`);
                  destroyCard(st, fx, p.thenDestroyAttacker);
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
          } else if (p.dest === 'grantCannotChangeState') {
            if (st.inst[a.k]) {
              st.inst[a.k].cannotChangeStateUntilEOT = true;
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
              if (st.pending && st.pending.atk === a.k) {
                addLog(st, 'S', `การโจมตีของ ${nameOf(st, a.k)} ยกเลิก — ไม่สามารถเปลี่ยนสภาพได้`);
                st.pending = null;
                clearCombatBuffs(st);
              }
            }
          } else if (p.dest === 'grantCombatImmune') {
            st.inst[a.k].combatImmuneUntilEOT = true;
            st.inst[a.k].protectUntilEndTurn = true;
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} ไม่ถูกทำลายจนจบเทิร์น`);
          } else if (p.dest === 'sacrificeNamesOneEach') {
            const cPick = st.inst[a.k];
            const hit = (p.needNames || []).find(n => nameMatches(cPick, n) && !(p.gotNames || {})[n]);
            if (!hit) return deny('ต้องเลือกชื่อที่ยังไม่ได้ส่ง');
            doMove(st, a.k, p.chooser + '.hell', null, fx);
            p.gotNames = p.gotNames || {};
            p.gotNames[hit] = true;
            addLog(st, p.chooser, `ส่ง ${nameOf(st, a.k)} ลงนรก (${Object.keys(p.gotNames).length}/${(p.needNames || []).length})`);
            const remain = (p.needNames || []).filter(n => !p.gotNames[n]);
            if (remain.length) {
              const ids = [];
              (st.zones[p.chooser + '.hand'] || []).concat(st.zones[p.chooser + '.avatar'] || []).forEach(id => {
                if (id === p.src) return;
                const x = st.inst[id]; if (!x) return;
                if (remain.some(n => nameMatches(x, n))) ids.push(id);
              });
              if (!ids.length) {
                addLog(st, 'S', `ไม่ครบชื่อที่เหลือ: ${remain.join(', ')} — ยกเลิกผล`);
              } else {
                st.prompts.unshift(Object.assign({}, p, { ids }));
                addLog(st, p.chooser, `เลือกส่งต่อ: ${remain.join(', ')}`);
              }
            } else {
              if (p.actions && p.actions.length) runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, rng, toHellAfter: !!p.srcToHell });
              else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
            }
            fx.snd = 'tap';
          } else if (p.dest === 'sacNamedUnique') {
            const nm = (st.inst[a.k] && st.inst[a.k].name) || '';
            p.gotNames = p.gotNames || {};
            p.got = p.got || [];
            if (p.gotNames[nm]) {
              addLog(st, 'S', `ชื่อ "${nm}" เลือกไปแล้ว — เลือกชื่ออื่น`);
              st.prompts.unshift(p);
              break;
            }
            p.gotNames[nm] = true;
            p.got.push(a.k);
            addLog(st, p.chooser, `ส่ง ${nm} ลงนรกเป็นค่า (${p.got.length}/${p.totalUnique || 4})`);
            sendCardToHell(st, fx, a.k, { ignoreProtect: true });
            if (p.got.length < (p.totalUnique || 4)) {
              const remain = (p.ids || []).filter(id => id !== a.k && st.inst[id] && zoneOf(st, id) && !p.gotNames[(st.inst[id] && st.inst[id].name) || '']);
              if (remain.length < ((p.totalUnique || 4) - p.got.length)) {
                addLog(st, 'S', `Super Air ชื่อไม่ซ้ำไม่พอ — ยกเลิกผล (ที่ส่งไปแล้วไม่คืน)`);
              } else {
                st.prompts.unshift(Object.assign({}, p, { ids: remain }));
                addLog(st, p.chooser, `เลือก Super Air ชื่ออื่นต่อ`);
              }
            } else {
              const need = p.needNames || [];
              const okNeed = need.every(nmNeed => Object.keys(p.gotNames).some(n => n === nmNeed || n.includes(nmNeed)));
              if (!okNeed) {
                addLog(st, 'S', `ต้องมี "${need.join('" และ "')}" ใน 4 ใบ — ผลไม่เกิด (ที่ส่งไปแล้วไม่คืน)`);
              } else {
                continueAfterPaidCost(st, fx, {
                  src: p.src, owner: p.chooser, actions: p.actions || [],
                  kind: p.afterCostKind || 'magic', keepSrc: false
                }, rng);
              }
            }
            fx.snd = 'clash';
            p._skipPickTail = true;
          } else if (p.dest === 'bothReturn') {
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'bothReturn', k: a.k, chooser: p.chooser, src: p.src, srcToHell: !!p.srcToHell
              })) {
              fx.snd = 'place';
            } else {
              doMove(st, a.k, p.chooser + '.deck', 'bottom', fx);
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} กลับใต้เด็ค`);
              const opp = other(p.chooser);
              const hp = { kind: 'pick', from: 'ownAvatars', src: p.src, chooser: opp, dest: 'deckBottom', optional: false, srcToHell: !!p.srcToHell };
              if (promptCandidates(st, hp).length) { st.prompts.unshift(hp); addLog(st, opp, `เลือก Avatar กลับใต้เด็ค`); }
              else if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
            }
          } else if (p.dest === 'deckBottom') {
            const own = ownerOf(st, a.k);
            const deckSide = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'move', to: deckSide + '.deck', pos: 'bottom', who: p.chooser, k: a.k
              })) {
              if (p.srcToHell && zoneOf(st, p.src) && p.src !== a.k) {
                const so = ownerOf(st, p.src);
                doMove(st, p.src, (so === 'S' ? p.chooser : so) + '.hell', null, fx);
              }
              fx.snd = 'place';
            } else {
              doMove(st, a.k, deckSide + '.deck', 'bottom', fx);
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: ${nameOf(st, a.k)} กลับใต้เด็ค`);
              if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
              else if (p.srcToHell && zoneOf(st, p.src)) {
                const so = ownerOf(st, p.src);
                doMove(st, p.src, (so === 'S' ? p.chooser : so) + '.hell', null, fx);
              }
            }
          } else if (p.dest === 'deck') {
            doMove(st, a.k, p.chooser + '.deck', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} กลับเข้าเด็ค`);
            if (p.shuffleAfter) {
              seededShuffle(st.zones[p.chooser + '.deck'], rng);
              syncHeimdall(st);
              addLog(st, p.chooser, 'สับเด็ค');
            }
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
            p._skipPickTail = true;
            fx.snd = 'draw';
          } else if (p.dest === 'attachSelf') {
            // มีมมิจัง: เอาจากเด็คมาสวมใส่ตัวเอง (src) — วางไว้ Magic Zone ให้เห็นบนจอ
            if (st.inst[a.k] && st.inst[p.src] && equipOnto(st, a.k, p.src)) {
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: สวมใส่ ${nameOf(st, a.k)} ให้ตัวเอง`);
              fireWeaponModAttached(st, fx, a.k, rng);
            }
          } else if (p.dest === 'attachHost') {
            const hp = {
              kind: 'pick', from: 'ownAvatars', src: p.src, chooser: p.chooser,
              filter: p.attachHostFilter || { nameIncludes: ['รถถัง'] },
              dest: 'attachTo', attachMod: a.k, optional: true,
              thenDestroyAttacker: p.thenDestroyAttackerIfAttached ? (p.attacker || null) : null
            };
            if (promptCandidates(st, hp).length) {
              st.prompts.unshift(hp);
              addLog(st, p.chooser, `เลือก Avatar ที่จะสวม ${nameOf(st, a.k)}`);
            } else {
              doMove(st, a.k, p.chooser + '.deck', 'bottom', fx);
              addLog(st, 'S', `ไม่มีโฮสต์ให้สวม — ${nameOf(st, a.k)} กลับใต้เด็ค`);
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
              clearCombatBuffs(st);
            } else addLog(st, p.chooser, `นอน ${nameOf(st, a.k)} แต่ไม่มีการโจมตีค้าง`);
            fx.snd = 'tap';
          } else if (p.dest === 'retargetAttack') {
            if (!st.pending || (p.src && st.pending.atk !== p.src)) {
              addLog(st, p.chooser, 'ไม่มีการโจมตีที่ต้องเลือกเป้าใหม่');
            } else {
              const badTgt = cannotSelectAttackTarget(st, a.k, st.pending.atk);
              if (badTgt) {
                st.prompts.unshift(p);
                return deny(badTgt);
              }
              const isCon = (zoneOf(st, a.k) || '').endsWith('.construct');
              st.pending.def = a.k;
              st.pending.life = null;
              st.pending.kind = isCon ? 'construct' : 'battle';
              addLog(st, p.chooser, `${nameOf(st, st.pending.atk)} เปลี่ยนเป้าโจมตีเป็น ${nameOf(st, a.k)} (เสียเตะไข่)`);
              if (!isCon) {
                refreshOnFightBuffs(st, st.pending.atk, a.k);
                const ot = ownerOf(st, a.k);
                abil(st, a.k, 'whenAttacked').forEach(ab => runActions(st, fx, ab.actions || [], { src: a.k, owner: ot, rng: rng }));
              } else {
                refreshOnFightBuffs(st, st.pending.atk, null);
              }
            }
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
            if (blockedByOppMagicImmune(st, p.chooser, a.k, p.src))
              return deny(`${nameOf(st, a.k)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม`);
            if (protectedFromOppLeave(st, a.k, p.chooser))
              return deny(`${nameOf(st, a.k)} ไม่ถูกนำออกจากสนามโดยความสามารถฝ่ายตรงข้าม`);
            const own = (st.inst[a.k] && st.inst[a.k].originalOwner) || ownerOf(st, a.k);
            const handOwner = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'move', to: handOwner + '.hand', who: handOwner, k: a.k
              })) {
              // ไพรมอลกันเด้ง — เวทต้นทางลงนรกได้ตาม srcToHell ด้านล่าง
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: เลือก ${nameOf(st, a.k)} ขึ้นมือ — รอกันออกสนาม`);
            } else {
              doMove(st, a.k, handOwner + '.hand', null, fx);
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} ขึ้นมือ`);
              if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
            }
          } else if (p.dest === 'storyEvolve') {
            const shown = a.k;
            const explorer = p.src;
            if (st.inst[shown]) st.inst[shown].revealed = true;
            addLog(st, p.chooser, `แสดง ${nameOf(st, shown)}`);
            const byAv = st.inst[explorer] ? st.inst[explorer] : null;
            if (st.inst[explorer] && (zoneOf(st, explorer) || '').endsWith('.avatar')) {
              doMove(st, explorer, p.chooser + '.dark', null, fx);
              addLog(st, p.chooser, `เนรเทศ ${nameOf(st, explorer)} จาก Avatar Zone`);
            }
            if (st.inst[shown] && (zoneOf(st, shown) || '').endsWith('.hand')) {
              const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[shown]);
              if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd}) — ${nameOf(st, shown)} ยังอยู่ในมือ`);
              else {
                doMove(st, shown, p.chooser + '.avatar', null, fx);
                if (st.inst[shown]) delete st.inst[shown].revealed;
                if ((p.powerBonus || 0) && st.inst[shown]) {
                  st.inst[shown].powerDelta = (st.inst[shown].powerDelta || 0) + p.powerBonus;
                  notePowerBuff(st, shown, p.powerBonus);
                  addLog(st, p.chooser, `${nameOf(st, shown)} POWER +${p.powerBonus}`);
                }
                addLog(st, p.chooser, `อัญเชิญ ${nameOf(st, shown)} ด้วยความสามารถของนักท่องเรื่องราว`);
                triggerSummon(st, fx, shown, p.chooser, { paidCost: false, summonedByAvatar: byAv });
                fx.snd = 'place';
              }
            }
          } else if (p.dest === 'ninjaBounceSummon') {
            const own = ownerOf(st, a.k);
            const handOwner = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'move', to: handOwner + '.hand', who: handOwner, k: a.k
              })) {
              addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: เลือก ${nameOf(st, a.k)} ขึ้นมือ — รอกันออกสนาม`);
            } else {
              doMove(st, a.k, handOwner + '.hand', null, fx);
              p.multiGot = (p.multiGot || 0) + 1;
              addLog(st, p.chooser, `นำ ${nameOf(st, a.k)} ขึ้นมือ (${p.multiGot}/${p.multiExact || 1})`);
              const left = (p.ids || []).filter(x => x !== a.k && (zoneOf(st, x) || '').endsWith('.avatar'));
              p.ids = left;
              if ((p.multiGot || 0) < (p.multiExact || 1) && left.length) {
                st.prompts.unshift(Object.assign({}, p, { optional: false }));
                addLog(st, p.chooser, `เลือก Avatar เพิ่มให้ครบ ${p.multiExact}`);
              } else {
                const form = p.src;
                if (st.inst[form] && (zoneOf(st, form) || '').endsWith('.hand')) {
                  const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[form]);
                  if (qd) addLog(st, 'S', `ลงสนามไม่ได้ (${qd})`);
                  else {
                    doMove(st, form, p.chooser + '.avatar', null, fx);
                    addLog(st, p.chooser, `อัญเชิญ ${nameOf(st, form)} จากมือ (สลับนินจา)`);
                    triggerSummon(st, fx, form, p.chooser, { paidCost: false, bySelfAbility: p.bySelfAbility !== false });
                    fx.snd = 'place';
                  }
                } else addLog(st, 'S', `อัญเชิญจากมือไม่ได้ — การ์ดไม่อยู่ในมือ`);
              }
            }
          } else if (p.dest === 'oppHellToHandThenDiscard') {
            doMove(st, a.k, p.chooser + '.hand', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} จากนรกฝ่ายตรงข้ามขึ้นมือ`);
            const need = p.thenDiscard != null ? p.thenDiscard : 1;
            if (need > 0) {
              const hand = (st.zones[p.chooser + '.hand'] || []).filter(id => id !== p.src);
              if (hand.length < need) addLog(st, 'S', `มือไม่พอทิ้ง ${need} ใบ`);
              else {
                st.prompts.unshift({
                  kind: 'chooseDiscard', src: p.src, chooser: p.chooser, filter: {},
                  excludeIds: [], discardNeed: need, discardGot: 0, actions: [], effectDiscard: true
                });
                addLog(st, p.chooser, `ทิ้งมือ ${need} ใบ`);
              }
            }
            fx.snd = 'draw';
          } else if (p.dest === 'exileThenReturnEnd') {
            const fled = !!(st.pending && st.pending.def === a.k);
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            addLog(st, p.chooser, `เนรเทศ ${nameOf(st, a.k)} ลงมิติมืด — จะกลับสนามช่วง End Phase`);
            st.scheduled.push({
              player: p.chooser, when: 'ownEndPhase',
              op: 'runActions', src: a.k,
              actions: [{ op: 'summonSelfFromDark', noJuti: true }]
            });
            if (fled) {
              addLog(st, 'S', `การโจมตียกเลิก — ${nameOf(st, a.k)} หนีเข้ามิติมืด`);
              st.pending = null;
              clearCombatBuffs(st);
            }
            fx.snd = 'tap';
          } else if (p.dest === 'handOrSummon') {
            p._handOrSummonCard = a.k;
            p._canSummon = effCost(st, a.k) <= (p.summonCostMax != null ? p.summonCostMax : 3);
          } else {
            doMove(st, a.k, p.chooser + '.hand', null, fx);
            addLog(st, p.chooser, `เอฟเฟกต์ ${nameOf(st, p.src)}: นำ ${nameOf(st, a.k)} ขึ้นมือ`);
            if (p.lockSummonAndAbility && st.inst[a.k] && st.inst[a.k].name)
              addLockSummonAndAbility(st, p.chooser, st.inst[a.k].name);
            if (p.thenIfFound && p.thenIfFound.length && matchFilterEx(st, a.k, p.filter)) {
              runActions(st, fx, p.thenIfFound, { src: p.src, owner: p.chooser, attacker: p.attacker, rng });
            }
          }
          // ที่เหลือจากสอดแนมลงใต้เด็ค (ตามลำดับที่แสดง)
          if (p.dest === 'multiAvatar') {
            // rest/shuffle จัดการในสาขา multiAvatar แล้ว
          } else if (p.from === 'ids' && (p.restTo === 'bottom' || p.restTo === 'hell')) {
            const rest = (p.ids || []).filter(x => x !== a.k && (st.zones[p.chooser + '.deck'] || []).includes(x));
            unlockScoutIds(st, p.ids || []);
            if (p.restTo === 'hell') {
              rest.forEach(x => doMove(st, x, p.chooser + '.hell', null, fx));
              if (rest.length) addLog(st, p.chooser, `การ์ดที่เหลือจากสอดแนม ${rest.length} ใบลงนรก`);
            } else {
              rest.forEach(x => {
                st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
                st.zones[p.chooser + '.deck'].unshift(x);
              });
              if (rest.length) addLog(st, p.chooser, `การ์ดที่เหลือจากสอดแนม ${rest.length} ใบ ลงใต้เด็ค`);
            }
          }
          if (p.shuffleAfter || (p.shuffleAfterIfFromDeck && pickedFromDeck)) {
            if (!p._skipPickTail) {
              seededShuffle(st.zones[p.chooser + '.deck'], rng);
              addLog(st, p.chooser, 'สับเด็ค');
              syncHeimdall(st);
            }
          }
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
          } else if (p.srcToHell && zoneOf(st, p.src) && !p._skipPickTail && !(st.inst[p.src] && st.inst[p.src].attachedTo)) doMove(st, p.src, p.chooser + '.hell', null, fx);
          fx.snd = 'place';
        }
        break;
      }

      case 'skipPrompt': {
        const p = st.prompts[0]; if (!p) break;
        if (p.kind === 'rps') return deny('ต้องเลือกเป่ายิ้งฉุบ (หรือรอหมดเวลา)');
        if (p.kind === 'react' && p.reactTrigger === 'avatarWouldBeDestroyed') {
          if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
          st.prompts.shift();
          addLog(st, p.chooser, 'ไม่ใช้ — Avatar ถูกทำลาย');
          resumeWouldDestroy(st, fx, false);
          fx.snd = 'clash';
          break;
        }
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
        if (p.kind === 'magicRedirect') {
          if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
          st.prompts.shift();
          delete st._magicRedirectPending;
          // ข้าม = ปล่อยให้ chooseBuff/chooseDestroy ทำงานกับเป้าเดิม
          const next = st.prompts[0];
          if (next && (next.kind === 'chooseBuff' || next.kind === 'chooseDestroy') && p.origTarget) {
            st._skipMagicRedirect = true;
            st.prompts.shift();
            applyMagicPromptOnTarget(st, fx, next, p.origTarget, rng);
            delete st._skipMagicRedirect;
          }
          fx.snd = 'tap';
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
        if (p.dest === 'payRemainSummon') {
          st.prompts.shift();
          addLog(st, p.chooser, `ข้ามจ่าย Cost — ไม่ได้อัญเชิญ ${nameOf(st, p.summonK)}`);
          fx.snd = 'tap';
          break;
        }
        if (p.dest === 'replaceFirstDraw') {
          st.prompts.shift();
          const got = takeFromDeckToHand(st, p.chooser, 1, fx);
          addLog(st, p.chooser, 'ข้าม — จั่วต้นเทิร์นปกติ 1 ใบ');
          if (got[0]) fx.drawn = got[0];
          finishDrawPhaseStart(p.chooser);
          fx.snd = 'draw';
          break;
        }
        // เลือกปฏิบัติ (ไม่ใช่ทายประเภท) — ข้ามได้ถ้า optional (นับเมื่อเลือกข้อแล้ว)
        if (p.kind === 'chooseMode' && !p.guessTypes) {
          const allDenied = (p.options || []).length && p.options.every(opt => !!chooseModeOptionDeny(st, p.src, p.chooser, opt));
          if (p.optional === false && !allDenied) return deny('ต้องเลือกปฏิบัติ');
          if (p.optional === false && p.srcToHell && zoneOf(st, p.src))
            doMove(st, p.src, p.chooser + '.hell', null, fx);
          st.prompts.shift();
          addLog(st, p.chooser, allDenied ? `ข้ามเลือกปฏิบัติ — ไม่มีตัวเลือกที่ใช้ได้` : `ข้ามเลือกปฏิบัติ`);
          fx.snd = 'tap';
          break;
        }
        if (p.kind === 'chooseMode' && (p.options || []).length) {
          const allDenied = p.options.every(opt => !!chooseModeOptionDeny(st, p.src, p.chooser, opt));
          if (allDenied) {
            st.prompts.shift();
            addLog(st, p.chooser, `ข้ามเลือกโหมด — ไม่มีตัวเลือกที่ใช้ได้`);
            fx.snd = 'tap';
            break;
          }
        }
        if (p.dest === 'hellMultiDeck' && p.multiExact != null && (p.multiGot || 0) < p.multiExact)
          return deny(`ต้องคืนนรกให้ครบ ${p.multiExact} ใบก่อน (ตอนนี้ ${p.multiGot || 0}) — ไม่ครบเก็บไม่ได้`);
        if (p.optional === false && p.kind !== 'peekTop' && p.dest !== 'hellMultiDeck') return deny('เอฟเฟกต์นี้ต้องเลือกเป้า (ยกเลิกไม่ได้)');
        if (p.multiExact && (p.multiGot || 0) < p.multiExact) return deny(`ต้องอัญเชิญให้ครบ ${p.multiExact} ใบ`);
        if (p.multiMin && (p.multiGot || 0) < p.multiMin) return deny(`ต้องอัญเชิญอย่างน้อย ${p.multiMin} ใบ`);
        if (p.countsAsModification) consumeCountsAsModification(st, p.chooser);
        else if (p.kind === 'milledOptional' || (p.dest === 'attachTo' && p.attachMod))
          clearDeferredModUse(st, p.attachMod || p.src);
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
        if (p.dest === 'scoutAllHandThenExile') {
          finishScoutAllHandThenExile(st, fx, p);
          break;
        }
        if (p.dest === 'hellMultiDeck') {
          if (p.multiExact != null && (p.multiGot || 0) < p.multiExact) abortHellMulti(st, fx, p);
          else finishHellMulti(st, fx, p, rng);
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
          if (p.srcToHell && zoneOf(st, p.src)) {
            doMove(st, p.src, p.chooser + '.hell', null, fx);
            addLog(st, p.chooser, `ใช้เวทเสร็จ — ${nameOf(st, p.src)} ลงนรก`);
          }
          break;
        }
        if (p.dest === 'alienReveal') {
          finishAlienReveal(st, fx, p);
          break;
        }
        if (p.dest === 'giveHandNegate') {
          addLog(st, p.chooser, `ข้าม — ไม่ใช้ ${nameOf(st, p.src)} ยกเลิกจุติ`);
          if (st._pendingAbility) {
            const pend = st._pendingAbility; delete st._pendingAbility;
            resumeJutiAfterRichNegate(st, fx, pend, rng);
          }
          fx.snd = 'tap';
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
        } else if (p.kind === 'pick' && p.from === 'ids' && (p.restTo === 'bottom' || p.restTo === 'hell')) {
          if ((p.autoHandIds || []).length) flushScoutAutoHand(st, fx, p);
          unlockScoutIds(st, p.ids || []);
          const rest = (p.ids || []).filter(x => (st.zones[p.chooser + '.deck'] || []).includes(x));
          if (p.restTo === 'hell') {
            rest.forEach(x => doMove(st, x, p.chooser + '.hell', null, fx));
            addLog(st, p.chooser, rest.length
              ? `ไม่หยิบจากสอดแนม — ที่เหลือ ${rest.length} ใบลงนรก`
              : `จบสอดแนม`);
          } else {
            rest.forEach(x => {
              st.zones[p.chooser + '.deck'] = st.zones[p.chooser + '.deck'].filter(y => y !== x);
              st.zones[p.chooser + '.deck'].unshift(x);
            });
            addLog(st, p.chooser, rest.length
              ? `ไม่หยิบจากสอดแนม — ที่เหลือ ${rest.length} ใบลงใต้เด็ค`
              : `จบสอดแนม`);
          }
        } else {
          addLog(st, p.chooser, `ข้ามการเลือกเป้าของ ${nameOf(st, p.src)}${(p.countsAsModification || p.onceTag) ? ' — นับว่าใช้ไปแล้วในเทิร์นนี้' : ''}`);
          if (p.kind === 'pick' && p.from === 'ids') unlockScoutIds(st, p.ids || []);
          if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }
          if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
        }
        if (p.srcToHell && zoneOf(st, p.src)) doMove(st, p.src, p.chooser + '.hell', null, fx);
        break;
      }

      case 'reactYes': {
        const p = st.prompts[0]; if (!p || p.kind !== 'react') break;
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ React ของคุณ');
        if (p.reactTrigger === 'enemyDeclareAttack' || p.reactTrigger === 'oppBattlePhaseStart' || p.reactTrigger === 'ownAvatarFights' || p.reactTrigger === 'ownAvatarLeftField') {
          const pick = a.k || p.src;
          if (!pick || (p.options && p.options.length && !p.options.includes(pick)))
            return deny('แตะ React ที่กะพริบเขียวในมือเพื่อเลือกใช้ (หรือกดไม่ใช้)');
          st.prompts.shift();
          if (p.reactTrigger === 'oppBattlePhaseStart') delete st._oppBattleStartWindow;
          const cont = applyAction(st, { type: 'playMagic', k: pick, by: isPlayer ? by : p.chooser, seed: a.seed });
          if (cont) Object.keys(cont).forEach(key => { fx[key] = cont[key]; });
          break;
        }
        // ต้องเลือกใบจาก options (แตะใบที่กะพริบ) — ปุ่มเปิดใช้เดี่ยวเลิกใช้แล้ว
        if (p.options && p.options.length) {
          const pick = a.k || p.src;
          if (!pick || !p.options.includes(pick))
            return deny('แตะ React ที่กะพริบเขียวในมือเพื่อเลือกใช้ (หรือกดไม่ใช้)');
          if ((p.magicNegate || p.mode === 'negateMagic') && !canNegateMagicCard(st, pick, p.target))
            return deny('ใบนี้ขัดเวทเป้าหมายนี้ไม่ได้ (อย่าให้มีครั้งที่ 2 ขัดได้เฉพาะ React)');
          if (oncePerTurnCardBlocked(st, pick, p.chooser))
            return deny('ใช้ใบนี้ครบ 1 ครั้งแล้วในเทิร์นนี้');
          if (!bindReactPromptCard(st, p, pick)) return deny('ใช้ React ใบนี้ไม่ได้');
        } else if (a.k) {
          if ((p.magicNegate || p.mode === 'negateMagic') && !canNegateMagicCard(st, a.k, p.target))
            return deny('ใบนี้ขัดเวทเป้าหมายนี้ไม่ได้');
          if (oncePerTurnCardBlocked(st, a.k, p.chooser))
            return deny('ใช้ใบนี้ครบ 1 ครั้งแล้วในเทิร์นนี้');
          if (!bindReactPromptCard(st, p, a.k)) return deny('ใช้ React ใบนี้ไม่ได้');
        }
        if (!p.src) return deny('เลือก React ที่จะใช้');
        const m = st.inst[p.src];
        const mz = zoneOf(st, p.src) || '';
        if (!m || !(mz.endsWith('.magic') || mz.endsWith('.hand'))) { st.prompts.shift(); break; }
        if (p.avatarHandAbility) {
          const trig = p.reactTrigger || 'ownAvatarLeftField';
          const abLF = abilitiesOf(m.code, trig, m.name)[0];
          const acts = (abLF && abLF.actions) || p.actions || [];
          const costList = normalizeAbilityCost(abLF && abLF.cost) || (Array.isArray(abLF && abLF.cost) ? abLF.cost : []);
          st.prompts.shift();
          const why = trig === 'ownAvatarDestroyedByOpp' ? 'เมื่อยักษ์ถูกทำลายโดยฝ่ายตรงข้าม'
            : trig === 'ownAvatarLeftField' ? 'เมื่อ Avatar ออกจากสนาม'
            : (p.label || '');
          addLog(st, p.chooser, `สั่งใช้จากมือ ${m.name}${why ? ' (' + why + ')' : ''}`);
          if (costList.length) payCostAndRunActivated(st, fx, p.chooser, p.src, costList, acts, rng);
          else runActions(st, fx, acts, { src: p.src, owner: p.chooser, target: p.target, rng });
          fx.snd = 'place';
          break;
        }
        // ประเภทละ 1 ครั้ง/เทิร์น — React นับเสมอ (แม้โต๊ะเสรี) · ประเภทอื่นนับในโหมดกติกา
        // นับทันทีที่เปิดใช้ (แม้ถูกชายจากอนาคตยกเลิกภายหลัง ก็ห้ามใช้ครั้งที่ 2)
        // อย่าให้มีครั้งที่ 2: ใช้เป็นครั้งที่ 2 ได้ แต่ถ้าใช้เป็นใบแรกกินโควต้า
        const mtype = magicSubtype(m) || 'React';
        const enforceType = mtype === 'React' || !!st.strict;
        if (enforceType) {
          const typeDeny = claimMagicTypeOrDeny(st, p.chooser, m, mtype);
          if (typeDeny) return deny(typeDeny);
        }
        {
          const eOnce = fxCard(m);
          if (eOnce && eOnce.oncePerTurnCard) markOncePerTurnCard(st, p.chooser, m.name || m.code);
        }
        const pendingSummon = p.pendingSummon || null;
        st.prompts.shift();
        if (mz.endsWith('.hand')) { doMove(st, p.src, p.chooser + '.magic', null, fx); }
        m.faceUp = true;
        addLog(st, p.chooser, `เปิด React "${m.name}"!`);
        if (p.magicNegate || p.mode === 'negateMagic') {
          // ชายจากอนาคต: ให้ฝ่ายตรงข้ามขัดเวทยกเลิกนี้ได้ก่อน (ซ้อนชายจากอนาคตได้)
          const origPend = st._pendingMagic;
          st._pendingMagic = {
            type: 'confirmNegate', src: p.src, owner: p.chooser,
            target: p.target, innerPending: origPend, pendingSummon
          };
          if (offerMagicNegateReact(st, fx, p.chooser, p.src)) {
            fx.snd = 'place';
            break;
          }
          const pend = st._pendingMagic; delete st._pendingMagic;
          resolvePendingMagic(st, fx, pend, rng);
          break;
        }
        if (p.abilityReact) {
          noteAbilityReactCancel(st, p.target);
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
            if (isImmuneOppMagicTarget(st, p.target) && p.chooser !== ownerOf(st, p.target)) {
              addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ${nameOf(st, p.target)} ไม่รับผลจาก Magic ฝ่ายตรงข้าม — ไม่ถูกทำลาย`);
            } else {
              addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ส่ง ${nameOf(st, p.target)} ที่ประกาศโจมตีลงนรก`);
              destroyCard(st, fx, p.target, destroyOptsFromMagic(st, p.src, p.target));
            }
          }
          if (st.pending && st.pending.atk === p.target && !(st.inst[p.target] && (zoneOf(st, p.target) || '').endsWith('.avatar'))) {
            st.pending = null; addLog(st, 'S', 'การโจมตียกเลิก — ผู้โจมตีไม่อยู่แล้ว');
          }
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
        if (p.abilityReact) resumeAbilityReactIfNeeded(st, fx, rng);
        // เทคจุติ: รันจุติต่อได้แม้ถูกอุบัติเหตุทำลาย (resume รองรับทั้งบนสนามและนรก)
        if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
        fx.snd = 'clash';
        break;
      }

      case 'reactTimeout':
      case 'reactNo': {
        const p = st.prompts[0]; if (!p || p.kind !== 'react') break;
        const timedOut = a.type === 'reactTimeout';
        if (timedOut && !p.seconds) break; // timeout เฉพาะหน้าต่างที่มีนาฬิกา
        if (!timedOut && isPlayer && by !== p.chooser) return deny('ไม่ใช่ React ของคุณ');
        const pendingSummon = p.pendingSummon || null;
        const tgtLabel = (p.target && st.inst[p.target]) ? nameOf(st, p.target) : '';
        st.prompts.shift();
        if (p.magicNegate || p.mode === 'negateMagic') {
          const msg = timedOut
            ? `หมดเวลา — ไม่ใช้ (ไม่ขัด${tgtLabel ? ' "' + tgtLabel + '"' : ''})`
            : `ไม่ใช้ — ไม่ขัด${tgtLabel ? ' "' + tgtLabel + '"' : ''}`;
          addLog(st, p.chooser, msg);
          fx.toast = `ฝ่าย ${p.chooser} ${timedOut ? 'หมดเวลา — ' : ''}ไม่ใช้`;
          const pend = st._pendingMagic; delete st._pendingMagic;
          resolvePendingMagic(st, fx, pend, rng);
          break;
        }
        addLog(st, p.chooser, timedOut ? 'หมดเวลา — ไม่ใช้' : 'ไม่ใช้');
        fx.toast = `ฝ่าย ${p.chooser} ${timedOut ? 'หมดเวลา — ' : ''}ไม่ใช้`;
        if (p.reactTrigger === 'oppBattlePhaseStart') delete st._oppBattleStartWindow;
        if (p.reactTrigger === 'ownAvatarLeftField') delete st._ownAvatarLeftFieldWindow;
        if (p.reactTrigger === 'avatarWouldBeDestroyed') {
          resumeWouldDestroy(st, fx, false);
          fx.snd = 'clash';
          break;
        }
        if (p.abilityReact && st._pendingAbility) {
          const pend = st._pendingAbility; delete st._pendingAbility;
          if (pend.cancelled) {
            addLog(st, 'S', `ความสามารถถูกยกเลิกแล้ว — ไม่ทำงาน`);
          } else if (pend.type === 'unity' || pend.type === 'humanShield' || pend.type === 'backstab'
            || pend.type === 'declareAtkAuto' || pend.type === 'whenAttackedAuto' || pend.type === 'defenderAtkAuto') {
            resumeAbilityReactPending(st, fx, pend, rng);
          } else if (pend.type === 'costPaidActivate') {
            if (pend.juti && offerRichNegateOnJuti(st, fx, pend.owner, pend.src, {
              type: 'costPaidActivate', k: pend.src, src: pend.src, owner: pend.owner,
              actions: pend.actions || [], keepSrc: true
            })) {
              /* รอคนรวย */
            } else {
              runPaidCostEffect(st, fx, {
                src: pend.src, owner: pend.owner, actions: pend.actions || [],
                keepSrc: pend.keepSrc !== false, counterAtkCtx: pend.counterAtkCtx || null,
                onceTag: pend.onceTag || null
              }, rng);
            }
          } else if (pend.type === 'activateFull') {
            payCostAndRunActivated(st, fx, pend.owner, pend.src, pend.costList || [], pend.actions || [], rng);
          } else if (pend.type === 'activate' && pend.actions) {
            // หลังข้าม React ในมือ — ให้คนรวยยกเลิกจุติได้ก่อนรันผล
            if (offerRichNegateOnJuti(st, fx, pend.owner, pend.src, {
              type: 'summonedJuti', k: pend.src, owner: pend.owner,
              actions: pend.actions, costList: pend.costList || []
            })) {
              /* รอคนรวย */
            } else if (pend.costList && pend.costList.length)
              payCostAndRunActivated(st, fx, pend.owner, pend.src, pend.costList, pend.actions, rng);
            else
              runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, rng });
          } else if (pend.type === 'summoned') {
            triggerSummon(st, fx, pend.k, pend.owner, Object.assign({}, pend.opts || {}, { _skipReact: true }));
          } else if (pend.type === 'declareAtk' && pend.actions) {
            runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, rng, attacker: pend.src });
            if (st._pendingDeclareBuff && st._pendingDeclareBuff.length) {
              st._pendingDeclareBuff.splice(0).forEach(pb => {
                if (pb.k === pend.src) applySelfPowerBuffsFromAb(st, pb.k, pb.ab, pb.label || 'โจมตี');
              });
            }
          } else if (pend.type === 'chooseMode' && pend.actions) {
            runActions(st, fx, pend.actions, { src: pend.src, owner: pend.owner, rng, onceTag: pend.onceTag || null });
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
      case 'magicRedirectYes': {
        const p = st.prompts[0]; if (!p || p.kind !== 'magicRedirect') return deny('ไม่ได้อยู่ในโหมดยักษ์หินรับเวท');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        delete st._magicRedirectPending;
        if (st.inst[p.shield]) st.inst[p.shield].tapped = true;
        addLog(st, p.chooser, `🛡️ ${nameOf(st, p.shield)} นอนลง — รับเป้าเวทแทน ${nameOf(st, p.origTarget)}`);
        const next = st.prompts[0];
        if (next && (next.kind === 'chooseBuff' || next.kind === 'chooseDestroy') && p.shield) {
          st._skipMagicRedirect = true;
          st.prompts.shift();
          applyMagicPromptOnTarget(st, fx, next, p.shield, rng);
          delete st._skipMagicRedirect;
        }
        fx.snd = 'clash';
        break;
      }
      case 'magicRedirectNo': {
        const p = st.prompts[0]; if (!p || p.kind !== 'magicRedirect') return deny('ไม่ได้อยู่ในโหมดยักษ์หินรับเวท');
        if (isPlayer && by !== p.chooser) return deny('ไม่ใช่ prompt ของคุณ');
        st.prompts.shift();
        delete st._magicRedirectPending;
        const next = st.prompts[0];
        if (next && (next.kind === 'chooseBuff' || next.kind === 'chooseDestroy') && p.origTarget) {
          st._skipMagicRedirect = true;
          st.prompts.shift();
          applyMagicPromptOnTarget(st, fx, next, p.origTarget, rng);
          delete st._skipMagicRedirect;
        }
        fx.snd = 'tap';
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
        if (!(st.zones[p + '.deck'] || []).length) { checkDeckEmptyLoss(st, fx, p); break; }
        const got = takeFromDeckToHand(st, p, 1, fx);
        addLog(st, p, 'จั่ว 1 ใบ'); break;
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
        noteDrawn(fx, s.p, a.k); break;
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
        mill(st, fx, p, n, rng, 0, null); // fx.milled → UI แอนิเมชัน + ป๊อปอัพ
        fx.snd = 'place'; break;
      }

      case 'toggleTap': {
        const c = st.inst[a.k]; if (!c) break;
        if (strict && isPlayer && ownerOf(st, a.k) !== by) return deny('โหมดกติกา: นอน/ตื่นได้เฉพาะการ์ดตัวเอง');
        if (cannotChangeState(st, a.k)) return deny(`"${c.name}" ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
        c.tapped = !c.tapped;
        addLog(st, ownerOf(st, a.k), `${c.name} ${c.tapped ? 'นอน (Tap)' : 'ตื่น'}`);
        fx.snd = 'tap'; break;
      }

      case 'toggleFace': {
        const c = st.inst[a.k]; if (!c) break;
        if (strict && isPlayer && ownerOf(st, a.k) !== by) return deny('โหมดกติกา: หงาย/คว่ำได้เฉพาะการ์ดตัวเอง');
        const isLife = (zoneOf(st, a.k) || '').endsWith('.life');
        const lifeOwner = isLife ? ownerOf(st, a.k) : null;
        if (isLife && c.faceUp && inCritical(st, lifeOwner))
          return deny('สถานะสาหัส: ฮีล LIFE ไม่ได้');
        if (isLife && c.faceUp && (st.zones['land'] || []).some(id => fxId(st, id) && fxId(st, id).blockLifeUnreveal))
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
        const resumeAtk = !!a._resumeAfterAtkAuto;
        const resumeDef = !!a._resumeAfterDefAuto;
        if (!resumeAtk && !resumeDef) {
        if (oa === ot || oa === 'S' || ot === 'S') break;
        if (st.pending) return deny('มีการโจมตีค้างอยู่ — ตัดสินให้จบก่อน');
        // ★ กฎเดียวที่ยังบังคับ: เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้
        if (st.turn === 1 && (isPlayer ? by : st.active) === (st.firstPlayer || 'A'))
          return deny('เทิร์นแรกของผู้เริ่มก่อน โจมตีไม่ได้');
        if (strict && isPlayer && oa !== by) return deny('โจมตีด้วย Avatar ฝั่งตัวเองเท่านั้น');
        if (strict && isPlayer && st.active !== by) return deny('โจมตีได้ในเทิร์นของคุณ');
        if (!(zoneOf(st, a.atk) || '').endsWith('.avatar')) return deny('โจมตีได้เฉพาะ Avatar บนสนาม');
        if (A.faceUp === false) return deny(`"${A.name}" คว่ำอยู่ — โจมตีไม่ได้`);
        if (A.tapped) return deny(`"${A.name}" นอนอยู่ — ประกาศโจมตีไม่ได้`);
        if (cannotChangeState(st, a.atk)) return deny(`"${A.name}" ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
        ensureBattle();
        // จีสัส: โจมตีได้เมื่อมือว่าง
        {
          const atkIf = attackIfDeny(st, a.atk, oa);
          if (atkIf) return deny(atkIf);
          const eAtk = fxCard(A);
          if (eAtk && eAtk.cannotAttack) return deny(`"${A.name}" โจมตีไม่ได้`);
          const bag = hostCannotAttackName(st, a.atk);
          if (bag) return deny(`"${A.name}" โจมตีไม่ได้ — สวม「${bag}」`);
          if (eAtk && eAtk.cannotAttackUnlessAttached) {
            const hasPass = Object.keys(st.inst).some(id => st.inst[id] && st.inst[id].attachedTo === a.atk);
            if (!hasPass) return deny(`"${A.name}" โจมตีไม่ได้ — ต้องมี Avatar สวมใส่`);
          }
        }
        if (A.cannotAttack) return deny(`"${A.name}" สั่งโจมตีไม่ได้ (เปลี่ยนการควบคุม)`);
        {
          const lim = landAttackLimitPerTurn(st);
          if (lim != null) {
            st.attacksThisTurn = st.attacksThisTurn || { A: 0, B: 0 };
            if ((st.attacksThisTurn[oa] || 0) >= lim)
              return deny(`โจมตีได้เทิร์นละ ${lim} ตัว (มวยทะเลลลลลล ฯลฯ)`);
          }
        }
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
            // เพนกวิ้น ฮัทในมือฝ่ายสาหัส — ทำงานทันที ไม่ถามอ้อนวอน
            const hatK = penguinHutReadyInHand(st, ot);
            if (hatK) {
              st.pendingLethal = { atk: a.atk, life: a.life, by: oa, target: ot, phase: 'plead' };
              addLog(st, 'S', `⚠️ ${A.name} ท่าปิดเกมใส่ฝ่าย ${ot} — เพนกวิ้น ฮัทในมือทำงานทันที`);
              const cont = applyAction(st, { type: 'activateAbility', k: hatK, by: ot });
              if (!cont || !cont.deny) {
                mergeFx(fx, cont);
                break;
              }
              st.pendingLethal = null;
            }
            addLog(st, 'S', `⚠️ ${A.name} ท่าปิดเกมใส่ฝ่าย ${ot} (สาหัส) — จบเกม`);
            declareBuffs(st, a.atk);
            declareEffects(st, fx, a.atk, null, rng);
            resolveCombat(st, fx, a.atk, null, a.life);
            fx.snd = 'clash';
            break;
          }
        }
        // โทมาโทจัง / ศาลพระภูมิ / ผู้โดยสาร ฯลฯ: ห้ามเลือกเป็นเป้าโจมตี
        if (!isLife && a.def) {
          const badTgt = cannotSelectAttackTarget(st, a.def, a.atk);
          if (badTgt) return deny(badTgt);
        }
        A.tapped = true;
        st.attacksThisTurn = st.attacksThisTurn || { A: 0, B: 0 };
        st.attacksThisTurn[oa] = (st.attacksThisTurn[oa] || 0) + 1;
        // อัตโนมัติตอนโจมตี — ถาม Hypersense/เชาว์ก่อนรันบัฟ และก่อนหน้าต่าง React ดักโจมตี
        if (!a._skipAbilityReact && abil(st, a.atk, 'declareAttack').length) {
          if (offerAbilityReact(st, fx, oa, a.atk, {
            type: 'declareAtkAuto', atkId: a.atk, owner: oa, def: a.def || null, life: a.life || null
          })) {
            fx.snd = 'tap';
            break;
          }
        }
        } // !resumeAtk && !resumeDef
        const declCtx = { _blockReact: !!a._blockReact };
        if (!resumeDef && !a._skipAtkBuffs) {
          declCtx._blockReact = runAttackerDeclareOncePerTurn(st, fx, a.atk, oa, rng, 'โจมตี', { allowReact: false }) || declCtx._blockReact;
          declareBuffs(st, a.atk);
        }
        const isConstructAtk = !isLife && a.def && (zoneOf(st, a.def) || '').endsWith('.construct');
        // CEO คุณจิระ / พ่อจีจ้า ฯลฯ: ถูกเป็นเป้าโจมตี → ธรณีสูบ (ถ้ามี) แล้ว +POWER
        let skipDefAuto = !!(resumeDef && a._skipDefBuffs);
        if (!isLife && a.def && !isConstructAtk && !resumeDef) {
          const hasDefAuto = abil(st, a.def, 'declaredAsAttackTarget').length || abil(st, a.def, 'whenAttacked').length;
          if (!a._skipAbilityReact && hasDefAuto
            && offerAbilityReact(st, fx, ot, a.def, {
              type: 'defenderAtkAuto', src: a.def, owner: ot,
              atkId: a.atk, def: a.def, life: a.life || null, atkOwner: oa, blockReact: declCtx._blockReact
            })) {
            fx.snd = 'tap';
            break;
          }
        }
        if (!isLife && a.def && !isConstructAtk && !skipDefAuto) {
          abil(st, a.def, 'declaredAsAttackTarget').forEach(ab => {
            const heavy = (ab.actions || []).filter(ac => ac.op !== 'modifyPower');
            const hasSelfBuff = (ab.actions || []).some(ac => ac.op === 'modifyPower' && ac.target && ac.target.select === 'self');
            if (ab.oncePerTurn && (heavy.length || hasSelfBuff)) {
              if (!claimOncePerTurn(st, a.def, ab.oncePerTurnTag || 'declaredAsAttackTarget')) return;
            }
            if (heavy.length) runActions(st, fx, heavy, { src: a.def, owner: ot, rng });
            if (ab.oncePerTurn) applySelfPowerBuffsFromAb(st, a.def, ab, 'เป็นเป้าโจมตี');
            else {
              (ab.actions || []).forEach(ac => {
                if (ac.op !== 'modifyPower' || !ac.target || ac.target.select !== 'self') return;
                let amt = ac.amount || 0;
                if (ac.amountPer === 'allTappedAvatars') {
                  amt = (ac.per || 1) * (
                    (st.zones['A.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length +
                    (st.zones['B.avatar'] || []).filter(x => st.inst[x] && st.inst[x].tapped).length
                  );
                }
                if (!amt) return;
                st.buffs.push({ k: a.def, amt, until: 'endOfTurn', from: a.def });
                addLog(st, 'S', `อัตโนมัติ ${nameOf(st, a.def)}: เป็นเป้าโจมตี → POWER +${amt} จนจบเทิร์น`);
              });
            }
          });
        }
        // พิภพรัททาทุย (Land): รัททาทุยที่โจมตี +2 จนจบการต่อสู้
        (st.zones['land'] || []).forEach(lid => {
          const le = fxId(st, lid);
          if (!le || !st.inst[lid].faceUp) return;
          abil(st, lid, 'declareAttack').forEach(ab => {
            (ab.actions || []).forEach(ac => {
              if (ac.op !== 'modifyPower') return;
              if (ac.ifAttackerSymbol) {
                if (A.symbol !== ac.ifAttackerSymbol) return;
              } else if (ac.ifAttackerNameIncludes) {
                if (!nameMatches(A, ac.ifAttackerNameIncludes)) return;
              } else return;
              st.buffs.push({ k: a.atk, amt: ac.amount || 0, until: ac.duration === 'combat' ? 'combat' : 'endOfTurn', from: lid });
              addLog(st, 'S', `เอฟเฟกต์ ${nameOf(st, lid)}: ${A.name} POWER +${ac.amount || 0} จนจบการต่อสู้`);
            });
          });
        });
        // พาหะ ฯลฯ: onFight ใส่ตอนประกาศ เพื่อให้ POWER บน UI ลดทันที (Avatar ปะทะเท่านั้น)
        if (!isLife && a.def && !isConstructAtk) applyOnFightBuffs(st, a.atk, a.def);
        if (declareEffects(st, fx, a.atk, isLife || isConstructAtk ? null : a.def, rng)) {
          addLog(st, 'S', `⚔️ ${A.name} ประกาศโจมตี — เป้าถูกทำลายจากเอฟเฟกต์ (ไม่ต้องปะทะ)`);
          fx.snd = 'clash'; break;
        }
        // กระบองแสง: โฮสต์โจมตี → บล็อก React จนจบการต่อสู้
        for (const id in st.inst) {
          const m = st.inst[id];
          if (!m || m.attachedTo !== a.atk) continue;
          const me = fxCard(m);
          if (me && me.hostBlockReactUntilCombatEnd) { declCtx._blockReact = true; break; }
        }
        st.pending = {
          kind: isLife ? 'life' : (isConstructAtk ? 'construct' : 'battle'),
          atk: a.atk, def: a.def || null, life: a.life || null, by: oa, target: ot, held: false, blockReact: !!declCtx._blockReact
        };
        if (declCtx._blockReact) addLog(st, 'S', `เอฟเฟกต์ ${A.name}: ฝ่ายรับใช้ React ไม่ได้จนกว่าจะจบการต่อสู้`);
        // whenAttacked (เช่น อู๊ดลูกเสือ) — Avatar เท่านั้น
        if (!isLife && a.def && !isConstructAtk && !skipDefAuto) {
          abil(st, a.def, 'whenAttacked').forEach(ab => runActions(st, fx, ab.actions, { src: a.def, owner: ot, rng: rng }));
        }
        // ไพรมอล: เสนอเซ่นแล้วตื่น หลังประกาศโจมตี (ก่อนปะทะ)
        offerWhenAttacking(st, a.atk);
        // ถามฝ่ายรับว่าจะใช้ React ไหม (เหมือนขัดเวท) — หลัง whenAttacking เพื่อให้เซ่นก่อน
        offerOwnFightReact(st, fx, oa, a.atk);
        if (!declCtx._blockReact) offerAttackReact(st, fx, oa, a.atk);
        // ฝ่ายรับสวนได้ไหม / มี prompt ค้าง (รวม whenAttacking / หน้าต่าง React) → อย่าปะทะทันที
        const defCanRespond = (() => {
          if ((st.prompts || []).length) return true;
          if (declCtx._blockReact) return false;
          if ((st.prompts || []).some(p => p.chooser === ot || p.kind === 'react')) return true;
          if (humanShieldOptions(st, ot).length) return true;
          return attackReactOptions(st, ot).length > 0;
        })();
        const paNow = effPower(st, a.atk);
        const tgtText = isLife
          ? `LIFE ใบที่ ${(st.zones[ot + '.life'] || []).indexOf(tgtId) + 1}`
          : (isConstructAtk ? `Construct ${T.name} (P${effPower(st, tgtId)})` : `${T.name} (P${effPower(st, tgtId)})`);
        fx.announce = {
          src: a.atk, tgt: tgtId, srcName: A.name,
          tgtName: isLife ? `LIFE ${ot}` : (isConstructAtk ? `Construct ${T.name}` : T.name),
          by: oa, kind: 'attack', pa: paNow,
          pd: isLife ? null : effPower(st, tgtId)
        };
        fx.atkLunge = { atk: a.atk, tgt: tgtId, life: !!isLife, construct: !!isConstructAtk };
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
        // ไพรมอล ฯลฯ: ต้องตอบเซ่นเมื่อโจมตีก่อนปะทะ — ห้ามกดปะทะแล้วค่อยถามหลังทำลาย
        if ((st.prompts || []).length) return deny('ตอบเอฟเฟกต์ที่ค้างก่อนปะทะ (เช่น เซ่นไหว้เมื่อโจมตี)');
        offerAttackRetargetIfNeeded(st, fx);
        if ((st.prompts || []).some(p => p.dest === 'retargetAttack'))
          return deny('เสียเตะไข่ — เลือกเป้าหมายโจมตีใหม่ก่อนปะทะ');
        if (!st.pending) break;
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

      /* ตำรวจ: หลังเปิดโชว์ท็อปเด็คแล้ว — กดดำเนินการ → ถูก=ทิ้งนรก+ผล / ผิด=ไว้ที่เดิม */
      case 'guessRevealContinue': {
        const p = st.prompts[0];
        if (!p || p.kind !== 'guessReveal') return deny('ไม่ได้อยู่ในโหมดสอดแนมทายประเภท');
        if (isPlayer && by !== p.chooser) return deny('ยังไม่ใช่ตาคุณ');
        st.prompts.shift();
        const card = p.card;
        const c = st.inst[card];
        if (c) delete c._guessReveal;
        if (p.hit) {
          addLog(st, p.chooser, `✓ เดาถูก "${p.cardName}" — ดำเนินการต่อ (ส่งนรกถ้ามีในผล)`);
          runActions(st, fx, p.onHit || [], {
            src: p.src, owner: p.chooser, rng, scouted: p.scouted || card, target: st.pending && st.pending.def, attacker: st.pending && st.pending.atk
          });
        } else {
          // ผิด — ไว้ที่เดิม (ท็อปเด็ค) · คว่ำกลับถ้าไม่ได้หงายจากฮามดัล/เดย์วัน
          addLog(st, p.chooser, `✗ เดาผิด "${p.cardName}" — ไว้ที่เดิมบนท็อปเด็ค`);
          if (c && zoneOf(st, card) && (zoneOf(st, card) || '').endsWith('.deck')) {
            syncHeimdall(st);
            if (!c._heimdallReveal) c.faceUp = false;
          }
          if ((p.onMiss || []).length) {
            runActions(st, fx, p.onMiss || [], {
              src: p.src, owner: p.chooser, rng, scouted: p.scouted || card
            });
          }
        }
        syncHeimdall(st);
        fx.snd = p.hit ? 'clash' : 'place';
        break;
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
          const ownP = pr0.chooser;
          const optDeny = chooseModeOptionDeny(st, a.k, ownP, optP);
          if (optDeny) {
            if (chooseModeOptionAlreadyUsed(st, a.k, optP)) return deny(optDeny);
            st.prompts.shift();
            consumeChooseModeOption(st, ownP, a.k, optP);
            addLog(st, ownP, `🎯 ${c.name} · ${optP && optP.label ? optP.label : 'ตัวเลือก'} ใช้ไม่ได้ (${optDeny}) — นับว่าใช้ไปแล้วในเทิร์นนี้`);
            fx.snd = 'tap';
            break;
          }
          claimChooseModeOption(st, a.k, optP);
          st.prompts.shift();
          addLog(st, ownP, `🎯 ${c.name} · เลือกปฏิบัติ → ข้อ ${idx + 1}${optP && optP.label ? ': ' + optP.label : ''}`);
          if (optP && optP.countsAsModification) beginDeferredModUse(st, ownP, a.k);
          if (optP && (optP.actions || []).length)
            runActions(st, fx, optP.actions, { src: a.k, owner: ownP, rng: rng, toHellAfter: !!pr0.srcToHell, onceTag: optP.oncePerTurnTag || null });
          else if (pr0.srcToHell && zoneOf(st, a.k)) doMove(st, a.k, ownP + '.hell', null, fx);
          fx.snd = fx.snd || 'place';
          break;
        }
        const ab = abilitiesOf(c.code, 'chooseMode')[0];
        if (ab && ab.oncePerTurn && !claimOncePerTurn(st, a.k, 'chooseMode'))
          return deny(`"${c.name}" เลือกปฏิบัติไปแล้วในเทิร์นนี้`);
        const opt = ab && ab.options && ab.options[idx];
        {
          const ownCheck = owner === 'S' ? landSharedUser(by, c.controller || 'A') : owner;
          const optDeny2 = chooseModeOptionDeny(st, a.k, ownCheck, opt);
          if (optDeny2) {
            if (chooseModeOptionAlreadyUsed(st, a.k, opt)) return deny(optDeny2);
            consumeChooseModeOption(st, ownCheck, a.k, opt);
            addLog(st, ownCheck, `🎯 ${c.name} · ${opt && opt.label ? opt.label : 'ตัวเลือก'} ใช้ไม่ได้ (${optDeny2}) — นับว่าใช้ไปแล้วในเทิร์นนี้`);
            fx.snd = 'tap';
            break;
          }
          claimChooseModeOption(st, a.k, opt);
        }
        if (opt && opt.requireNoModUsed && st.magicUsed && st.magicUsed[owner === 'S' ? landSharedUser(by, owner) : owner] && st.magicUsed[owner === 'S' ? landSharedUser(by, owner) : owner]['Modification'])
          return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว — เลือกข้อนี้ไม่ได้');
        const own = owner === 'S' ? landSharedUser(by, c.controller || 'A') : owner;
        const kz = zoneOf(st, a.k) || '';
        if (kz.endsWith('.avatar') && abilitiesNullified(st, a.k))
          return deny(overdoseLocksAbilities(st, a.k)
            ? `"${c.name}" ใช้ความสามารถไม่ได้ — มี Avatar Overdose บนสนามฝ่ายเรา`
            : `"${c.name}" สูญเสียความสามารถอยู่ (จนจบเทิร์น)`);
        addLog(st, own, `🎯 ${c.name} · เลือกปฏิบัติ → ข้อ ${idx + 1}${a.label ? ': ' + a.label : ''}${opt && opt.label ? ': ' + opt.label : ''}`);
        if (opt && opt.countsAsModification) beginDeferredModUse(st, own, a.k);
        if (opt && (opt.actions || []).length) {
          if (kz.endsWith('.avatar') && offerAbilityReact(st, fx, own, a.k, {
            type: 'chooseMode', src: a.k, owner: own, actions: opt.actions, onceTag: opt.oncePerTurnTag || null
          })) {
            fx.snd = 'tap';
            break;
          }
          runActions(st, fx, opt.actions, { src: a.k, owner: own, rng: rng, onceTag: opt.oncePerTurnTag || null });
        }
        fx.snd = fx.snd || 'place';
        break;
      }

      /* สั่งใช้ความสามารถ activated ของการ์ดบนสนาม / Land / จากมือ / จากนรก */
      case 'activateAbility': {
        const c = st.inst[a.k]; if (!c) break;
        const z = zoneOf(st, a.k) || '';
        // จากมือ (เมฟิสโต / เพนกวิ้น ฮัท ฯลฯ)
        if (z.endsWith('.hand')) {
          const abH = abilitiesOf(c.code, 'activatedFromHand', c.name)[0];
          if (!abH) return deny(`"${c.name}" ไม่มีสั่งใช้จากมือ`);
          const ownerH = z[0];
          if (strict && isPlayer && ownerH !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
          if (isNameLockedThisTurn(st, ownerH, c.name))
            return deny(`"${c.name}" ใช้ความสามารถไม่ได้ในเทิร์นนี้ (โรงบาล)`);
          const lethalOk = !!(abH.requirePendingLethal && st.pendingLethal && st.pendingLethal.target === ownerH);
          if (abH.requirePendingLethal && !lethalOk)
            return deny(`ใช้ "${c.name}" ได้เมื่อถูกประกาศท่าปิดเกมขณะสาหัสเท่านั้น`);
          const anyMain = !!abH.anyPlayerMainPhase;
          const faceUpLife = (st.zones[ownerH + '.life'] || []).filter(id => st.inst[id] && st.inst[id].faceUp).length;
          const battleOk = !!(abH.allowBattleIfFaceUpLifeMin != null
            && st.active === ownerH && st.phase === 'Battle'
            && faceUpLife >= (abH.allowBattleIfFaceUpLifeMin || 3));
          if (!lethalOk) {
            if (anyMain) {
              if (st.phase !== 'Main' && !battleOk) return deny('สั่งใช้ได้เฉพาะ Main Phase (ผู้เล่นใดก็ได้)');
            } else {
              if (st.active !== ownerH && !battleOk) return deny('สั่งใช้ได้ในเทิร์นของคุณเท่านั้น');
              if (st.phase !== 'Main' && !battleOk) {
                if (abH.allowBattleIfFaceUpLifeMin != null)
                  return deny(`Main Phase หรือ Battle Phase เมื่อ LIFE หงาย ≥ ${abH.allowBattleIfFaceUpLifeMin} (ตอนนี้ ${faceUpLife})`);
                return deny('สั่งใช้ได้เฉพาะ Main Phase');
              }
            }
          }
          {
            const tdH = activatedTargetDeny(st, ownerH, abH, a.k);
            if (tdH) return deny(`ใช้ไม่ได้ — ${tdH}`);
          }
          if (abH.oncePerTurn || abH.oncePerTurnByName) {
            const onceKey = abH.oncePerTurnByName
              ? ('name:' + abH.oncePerTurnByName)
              : a.k;
            if (!claimOncePerTurn(st, onceKey, 'activatedFromHand'))
              return deny(`"${c.name}" ใช้ความสามารถชื่อนี้ไปแล้วในเทิร์นนี้`);
          }
          if (abH.oncePerGame) {
            st.oncePerGame = st.oncePerGame || {};
            const ogKey = ownerH + ':' + c.code;
            if (st.oncePerGame[ogKey]) return deny(`"${c.name}" ใช้ได้เพียง 1 ครั้งต่อเกม`);
          }
          if (abH.requireUniqueHellSymbolNames) {
            const rq = abH.requireUniqueHellSymbolNames;
            const names = uniqueHellSymbolNames(st, ownerH, rq.symbol || 'นรก');
            if (names.size < (rq.min || 7))
              return deny(`ใช้ไม่ได้ — นรกต้องมี ${rq.symbol || 'นรก'} ชื่อไม่ซ้ำ ≥ ${rq.min || 7} (ตอนนี้ ${names.size})`);
          }
          const costsH = normalizeAbilityCost(abH.cost) || (Array.isArray(abH.cost) ? abH.cost : null);
          const markOnce = () => {
            if (!abH.oncePerGame) return;
            st.oncePerGame = st.oncePerGame || {};
            st.oncePerGame[ownerH + ':' + c.code] = true;
          };
          const runHand = () => runActions(st, fx, abH.actions || [], { src: a.k, owner: ownerH, rng });
          if (costsH && costsH[0] && costsH[0].op === 'exileSelf') {
            doMove(st, a.k, ownerH + '.dark', null, fx);
            addLog(st, ownerH, `⚡ สั่งใช้จากมือ ${c.name} (เนรเทศ) — "ขอเทิร์นนึง!"`);
            markOnce();
            runHand();
            fx.snd = 'place'; break;
          }
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
          markOnce();
          runHand();
          fx.snd = 'place'; break;
        }
        // จากนรก (THE END / ลุงไนท์ / หอกแหลม)
        {
          const abHellTrig = abilitiesOf(c.code, 'activatedFromHell', c.name)[0];
          const absAct0 = abilitiesOf(c.code, 'activated', c.name);
          const abFromHellFlag = absAct0.find(x => x.fromHell);
          if (z.endsWith('.hell') && (abHellTrig || abFromHellFlag)) {
            const ab = abHellTrig || abFromHellFlag;
            const ownerH = z[0];
            if (strict && isPlayer && ownerH !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
            if (st.active !== ownerH) return deny('สั่งใช้ได้ในเทิร์นของคุณเท่านั้น');
            if (st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะ Main Phase');
            if (ab.requireMilledThisTurn && !(c.milledThisTurn))
              return deny(`ใช้ "${c.name}" จากนรกได้เมื่อถูกธรณีสูบในเทิร์นนี้เท่านั้น`);
            if (ab.requireNoModUsed && isMagicTypeUsed(st, ownerH, 'Modification'))
              return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว');
            if (ab.requireSummonedNameIncludesThisTurn) {
              const needle = ab.requireSummonedNameIncludesThisTurn;
              const list = (st.summonedThisTurn && st.summonedThisTurn[ownerH]) || [];
              const ok = list.some(nm => (nm || '').includes(needle));
              if (!ok) return deny(`ใช้ไม่ได้ — เทิร์นนี้ยังไม่อัญเชิญ Avatar 「${needle}」`);
            }
            if (ab.requireNoOwnNameIncludes) {
              const has = (st.zones[ownerH + '.avatar'] || []).some(id => nameMatches(st.inst[id], ab.requireNoOwnNameIncludes));
              if (has) return deny(`ใช้ไม่ได้ — บน Avatar Zone มี 「${ab.requireNoOwnNameIncludes}」อยู่แล้ว`);
            }
            if (ab.requireOwnNameIncludes) {
              const need = ab.requireOwnCount || 1;
              const n = (st.zones[ownerH + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes)).length;
              if (n < need) return deny(`ใช้ไม่ได้ — ต้องมี "${ab.requireOwnNameIncludes}" ≥ ${need} (ตอนนี้ ${n})`);
            }
            if (ab.requireOwnNameIncludesAnyMin) {
              const spec = ab.requireOwnNameIncludesAnyMin;
              const names = spec.names || spec.nameIncludes || [];
              const min = spec.min != null ? spec.min : 1;
              const n = countOwnNameIncludesAnyMin(st, ownerH, spec);
              if (n < min) return deny(`ใช้ไม่ได้ — ต้องมี ${names.join(' / ')} รวมกัน ≥ ${min} ใบ (ตอนนี้ ${n})`);
            }
            {
              const tdHell = activatedTargetDeny(st, ownerH, ab, a.k);
              if (tdHell) return deny(`ใช้ไม่ได้ — ${tdHell}`);
            }
            if (ab.oncePerTurn && !claimOncePerTurn(st, a.k, 'activatedFromHell'))
              return deny(`"${c.name}" สั่งใช้จากนรกไปแล้วในเทิร์นนี้`);
            const costsX = normalizeAbilityCost(ab.cost) || (Array.isArray(ab.cost) ? ab.cost : null);
            const markOrDeferMod = () => {
              if (!ab.countsAsModification) return;
              if (actionsAttachSelf(ab.actions)) beginDeferredModUse(st, ownerH, a.k);
              else markMagicTypeUsed(st, ownerH, 'Modification');
            };
            if (costsX && costsX[0] && costsX[0].op === 'exileSelf') {
              doMove(st, a.k, ownerH + '.dark', null, fx);
              addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name} (เนรเทศตัวเอง)`);
              markOrDeferMod();
              runActions(st, fx, ab.actions || [], { src: a.k, owner: ownerH, rng });
              if (c.attachedTo) commitDeferredModUse(st, a.k);
              fx.snd = 'place'; break;
            }
            if (costsX && costsX[0] && costsX[0].op === 'discard') {
              if (!(st.zones[ownerH + '.hand'] || []).length) return deny('ไม่มีมือให้ทิ้ง');
              st.prompts.push({ kind: 'chooseDiscard', src: a.k, chooser: ownerH, filter: {}, actions: ab.actions, effectDiscard: true });
              addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name} — ทิ้งมือ 1 ใบ`);
              fx.snd = 'place'; break;
            }
            addLog(st, ownerH, `⚡ สั่งใช้จากนรก ${c.name}`);
            markOrDeferMod();
            runActions(st, fx, ab.actions || [], { src: a.k, owner: ownerH, rng });
            if (c.attachedTo) commitDeferredModUse(st, a.k);
            fx.snd = 'place'; break;
          }
        }
        // เลือกความสามารถที่ถูกจังหวะ: ตอนโจมตี → whenAttacking · นอกนั้น → สั่งใช้ปกติ (เช่น ไพรมอลเรียกหนู)
        const absAct = abilitiesOf(c.code, 'activated').concat(
          (c.granted || []).filter(x => x && x.trigger && x.trigger.on === 'activated')
        );
        const abAtk = absAct.find(x => x.whenAttacking);
        const abNorm = absAct.find(x => {
          if (x.whenAttacking || x.fromHell) return false;
          if (x.fromMagicZone) return z.endsWith('.magic');
          if (x.fromAvatarZone) return z.endsWith('.avatar');
          if (z.endsWith('.magic') && absAct.some(y => y.fromMagicZone)) return false;
          return true;
        });
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
          if (ab.requireOwnNameIncludesAnyMin) {
            const spec = ab.requireOwnNameIncludesAnyMin;
            const names = spec.names || spec.nameIncludes || [];
            const min = spec.min != null ? spec.min : 1;
            const n = countOwnNameIncludesAnyMin(st, ownerH, spec);
            if (n < min) return deny(`ใช้ไม่ได้ — ต้องมี ${names.join(' / ')} รวมกัน ≥ ${min} ใบ (ตอนนี้ ${n})`);
          }
          {
            const tdLegacy = activatedTargetDeny(st, ownerH, ab, a.k);
            if (tdLegacy) return deny(`ใช้ไม่ได้ — ${tdLegacy}`);
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
          return deny(overdoseLocksAbilities(st, a.k)
            ? `"${c.name}" ใช้ความสามารถไม่ได้ — มี Avatar Overdose บนสนามฝ่ายเรา`
            : `"${c.name}" สูญเสียความสามารถอยู่ (จนจบเทิร์น)`);
        // Normal/React one-shot: ผล "activated" ทำงานตอน playMagic เท่านั้น
        // กันบั๊กสั่งใช้ซ้ำจาก Magic Zone ช่วงรอขัดเวท (เช่น ความกล้าหาญ +4 หลายรอบ)
        if (c.type === 'Magic' && z.endsWith('.magic')) {
          if (st._pendingMagic && st._pendingMagic.src === a.k)
            return deny(`"${c.name}" กำลังรอขัดเวท/ทำงานอยู่ — สั่งใช้ซ้ำไม่ได้`);
          const sub = c.subtype || 'Normal';
          if ((sub === 'Normal' || sub === 'React') && !magicStaysOnMagicZone(c))
            return deny(`"${c.name}" ใช้ตอนเล่นจากมือเท่านั้น — ไม่สั่งใช้ซ้ำจาก Magic Zone`);
        }
        // Land กลางสนาม: สั่งใช้ได้ทั้งสองฝ่าย — คอส/ผลยึดฝ่ายที่กด (by) ไม่ใช่คนที่วาง
        const owner = z === 'land'
          ? ((by === 'A' || by === 'B') ? by : (c.controller || 'A'))
          : z[0];
        if (!owner || (owner !== 'A' && owner !== 'B')) return deny('ไม่ทราบเจ้าของ Land');
        if (strict && isPlayer && owner !== by) return deny('สั่งใช้ได้เฉพาะการ์ดฝั่งตัวเอง');
        // ไพรมอล: สั่งใช้ตอนโจมตี (เซ่นแล้วตื่น) — อนุญาตนอก Main ถ้า whenAttacking
        // สั่งใช้ปกติ (เรียกหนู / ระเบิดบอร์ดเมฟิสโต้ ฯลฯ) — เฉพาะ Main Phase ของเจ้าของเท่านั้น (ห้ามกระโดดเฟส)
        if (ab.requireAttached && !c.attachedTo)
          return deny(`"${c.name}" ใช้ได้เมื่อสวมใส่อยู่เท่านั้น`);
        if (ab.whenAttacking) {
          if (!st.pending || st.pending.atk !== a.k) return deny('ใช้ได้เมื่อ Avatar ใบนี้กำลังโจมตี');
        } else {
          if (st.active !== owner) return deny('สั่งใช้ได้ในเทิร์นของคุณเท่านั้น');
          if (st.phase !== 'Main') {
            if (!(ab.allowOwnBattlePhase && st.phase === 'Battle'))
              return deny('สั่งใช้ได้เฉพาะ Main Phase');
          }
        }
        if (ab.requireTurnsOnMagicMin != null) {
          const entered = c.magicEnteredTurnSeq;
          if (entered == null || (st.turnSeq || 0) <= entered)
            return deny(`"${c.name}" ต้องรอ 1 เทิร์นหลังจากวางบน Magic Zone`);
        }
        if (ab.requireOwnConstructNameIncludes) {
          if (!hasOwnConstructNameIncludes(st, owner, ab.requireOwnConstructNameIncludes))
            return deny(`ใช้ไม่ได้ — ต้องมี "${ab.requireOwnConstructNameIncludes}" บน Construct Zone`);
        }
        if (ab.countsAsModification && isMagicTypeUsed(st, owner, 'Modification'))
          return deny('เทิร์นนี้ใช้ Modification Magic ไปแล้ว');
        if (ab.requireLandNameIncludes) {
          const landsOk = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
          if (!landsOk) return deny(`ใช้ไม่ได้ — ต้องมี Land "${ab.requireLandNameIncludes}"`);
        }
        if (!abilityMagicReqOk(st, owner, ab)) {
          if (ab.requireOwnMagicNameIncludesMin) {
            const spec = ab.requireOwnMagicNameIncludesMin;
            const name = spec.nameIncludes || spec.name || 'การ์ด';
            const min = spec.min != null ? spec.min : 1;
            const n = countOwnMagicNameIncludes(st, owner, name);
            return deny(`ใช้ไม่ได้ — ต้องมี "${name}" บน Magic Zone ≥ ${min} (ตอนนี้ ${n})`);
          }
          return deny(`ใช้ไม่ได้ — ต้องมี "${ab.requireOwnMagicNameIncludes}" บน Magic Zone`);
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
        if (ab.requireOwnNamesAll) {
          const missing = (ab.requireOwnNamesAll || []).filter(nm => !(st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], nm)));
          if (missing.length) return deny(`ใช้ไม่ได้ — ต้องมี ${ab.requireOwnNamesAll.join(' + ')} บนสนาม (ขาด ${missing.join(', ')})`);
        }
        if (ab.requireBothHaveAvatar) {
          if (!(st.zones['A.avatar'] || []).length || !(st.zones['B.avatar'] || []).length)
            return deny('ใช้ไม่ได้ — ต้องมี Avatar ทั้งสองฝ่าย');
        }
        if (ab.requireFaceDownOwnLife) {
          const hasDown = (st.zones[owner + '.life'] || []).some(id => st.inst[id] && !st.inst[id].faceUp);
          if (!hasDown) return deny('ใช้ไม่ได้ — ไม่มี LIFE ที่คว่ำให้หงาย');
        }
        {
          const td = activatedTargetDeny(st, owner, ab, a.k);
          if (td) return deny(`ใช้ไม่ได้ — ${td}`);
        }
        if (ab.requireEnemyCostSumMax != null) {
          const opp = other(owner);
          const sum = (st.zones[opp + '.avatar'] || []).reduce((n, id) => n + effCost(st, id), 0);
          if (sum > ab.requireEnemyCostSumMax) return deny(`ใช้ไม่ได้ — Cost รวมศัตรู ${sum} > ${ab.requireEnemyCostSumMax}`);
        }
        {
          const hp = (ab.actions || []).find(x => x && x.op === 'hellPick' && x.optional === false);
          if (hp) {
            const cap = hellPickCapacity(st, owner, hp.magicMax != null ? hp.magicMax : null, hp.filter || {});
            if (cap < 1) return deny('ใช้ไม่ได้ — ในนรกไม่มีใบตรงเงื่อนไขให้คืนเด็ค');
          }
          const sac = (ab.actions || []).find(x => x && x.op === 'sacrifice');
          if (sac) {
            const filt = Object.assign({}, sac.filter || {}, { _srcK: a.k });
            const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: filt, dest: 'sacrificeOnly', optional: false, includeSelf: !!sac.includeSelf };
            if (!promptCandidates(st, p).length) return deny('ใช้ไม่ได้ — ไม่มี Avatar ให้เซ่นไหว้');
          }
        }
        if (ab.requireOwn) {
          const ro = ab.requireOwn;
          const ok = (st.zones[owner + '.avatar'] || []).some(id => {
            const x = st.inst[id]; if (!x) return false;
            if (ro.symbol && x.symbol !== ro.symbol) return false;
            if (ro.costMin != null && effCost(st, id) < ro.costMin) return false;
            if (ro.nameIncludes && !nameMatches(x, ro.nameIncludes)) return false;
            if (ro.effectIncludes && !(x.effect || '').includes(ro.effectIncludes)) return false;
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
            const total = (st.zones[owner + '.hand'] || []).filter(id => id !== a.k)
              .reduce((n, id) => n + (+(st.inst[id] && st.inst[id].gem) || 0), 0);
            if (total < (costOp.min || 3)) return deny(`GEM ในมือรวม ${total} < ${costOp.min || 3}`);
          } else if (costOp.op === 'paySelfCostMinus') {
            /* ลด Cost บนตัวเอง — ไม่ต้องมี GEM ในมือ */
          } else if (costOp.op === 'returnHandToDeck') {
            if (!(st.zones[owner + '.hand'] || []).some(x => matchFilterEx(st, x, costOp.filter)))
              return deny('ไม่มีมือให้คืนเด็ค');
          } else if (costOp.op === 'sacrifice') {
            const filt = Object.assign({}, costOp.filter || {}, { _srcK: a.k });
            const p = { kind: 'pick', from: 'ownAvatars', src: a.k, chooser: owner, filter: filt, dest: 'sacrifice', optional: false };
            if (!promptCandidates(st, p).length) return deny('ไม่มีเป้าเซ่นไหว้');
          } else if (costOp.op === 'sendMagicToHell') {
            const need = costOp.count || 1;
            const filt = Object.assign({}, costOp.filter || {}, { _srcK: a.k, excludeSelf: true });
            const p = { kind: 'pick', from: 'ownMagic', src: a.k, chooser: owner, filter: filt, dest: 'magicToHellCost', excludeIds: [a.k] };
            if (promptCandidates(st, p).length < need) return deny(`บน Magic Zone ไม่ครบ ${need} ใบให้ส่งนรก`);
          } else if (costOp.op === 'exileHell') {
            const hell = st.zones[owner + '.hell'] || [];
            if (hell.length < (costOp.count || 1)) return deny(`นรกไม่พอเนรเทศ ${costOp.count || 1} ใบ`);
          } else if (costOp.op === 'exileHellDistinctNames') {
            const hell = (st.zones[owner + '.hell'] || []).filter(id => nameMatches(st.inst[id], costOp.nameIncludes || ''));
            const uniq = new Set(hell.map(id => st.inst[id].name));
            if (uniq.size < (costOp.count || 3)) return deny(`นรกไม่มี "${costOp.nameIncludes}" ชื่อไม่ซ้ำครบ ${costOp.count || 3}`);
          } else if (costOp.op === 'exileSelf') {
            /* ok */
          } else if (costOp.op === 'exileDeckTop') {
            if (!(st.zones[owner + '.deck'] || []).length) return deny('เด็คว่าง — เนรเทศใบบนสุดไม่ได้');
          } else if (costOp.op === 'exileHand') {
            const need = costOp.count || 1;
            const filt = costOp.filter || {};
            const avail = (st.zones[owner + '.hand'] || []).filter(x => x !== a.k && matchFilterEx(st, x, filt));
            if (avail.length < need) return deny(need > 1 ? `ไม่มีมือตรงเงื่อนไขให้เนรเทศครบ ${need}` : 'ไม่มีมือตรงเงื่อนไขให้เนรเทศ');
          } else if (costOp.op === 'mill') {
            const n = costOp.count || 1;
            const who = costOp.who === 'opp' ? other(owner) : owner;
            if ((st.zones[who + '.deck'] || []).length < n)
              return deny(`เด็คไม่พอธรณีสูบ ${n} ใบ`);
          }
        }
        if (ab.oncePerTurn) {
          // Land: ล็อกต่อใบ (instance) ไม่ล็อกชื่อ/ทั้งเทิร์น
          // ใช้ของอีกฝ่ายแล้วลงใบตัวเอง → สั่งใช้ใบใหม่ได้ในเทิร์นเดียวกัน
          if (!claimOncePerTurn(st, a.k, z === 'land' ? ('landAct:' + owner) : 'activated'))
            return deny(`"${c.name}" ใช้ความสามารถไปแล้วในเทิร์นนี้`);
        }
        addLog(st, owner, `⚡ สั่งใช้ ${c.name}`);
        // จ่ายคอสก่อน แล้วค่อยให้เชาว์ปัญญาลิงขัด (คอสไม่คืน) — ไม่มีคอสจึงถามเชาว์ก่อนรันผล
        if (!(costList && costList.length) && z.endsWith('.avatar') && offerAbilityReact(st, fx, owner, a.k, {
          type: 'costPaidActivate', src: a.k, owner, costList, actions: ab.actions || []
        })) {
          fx.snd = 'tap';
          break;
        }
        if (ab.countsAsModification) consumeCountsAsModification(st, owner);
        payCostAndRunActivated(st, fx, owner, a.k, costList, ab.actions || [], rng,
          ab.oncePerTurn ? (z === 'land' ? ('landAct:' + owner) : 'activated') : null);
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
        const src = fxCard(c);
        const all = ((src && src.abilities) || []).concat(c.granted || []); // รวมสายที่สืบทอดต่อกันมา
        if (!all.length) return deny(`"${c.name}" ไม่มีความสามารถให้สืบทอด`);
        tgt.granted = (tgt.granted || []).concat(JSON.parse(JSON.stringify(all)));
        tgt.inheritedFrom = (tgt.inheritedFrom || []).concat(c.name);
        addLog(st, srcOwner, `🧬 สืบทอดคำสั่ง: ${tgt.name} รับความสามารถของ ${c.name} (${all.length} อย่าง)`);
        fx.snd = 'place';
        break;
      }

      /* สามัคคี — ฝ่ายที่ประกาศโจมตี นอน Avatar ตัวอื่นลง เพื่อเสริม POWER ให้ตัวโจมตีจนจบเทิร์น */
      /* ★ สามัคคี (แมนนวล): นอนการ์ด k แล้วยก POWER ของมันไปบวกให้ตัวที่เลือก (a.to) จนจบเทิร์น
         ยิง receivedUnity ก่อนวัดพลังผู้ให้ — พี่บูม +1 แก๊งขยะ ต้องติดเข้าพลังพี่ซี๊ดที่ส่งไปด้วย
         (ไม่มีอินาริ: ซี๊ดส่ง 1+1=2 → บูม 3+1+2=6 · มีอินาริ: ซี๊ดส่ง 1+1+1=3 → บูม 3+1+1+3=8) */
      case 'unity': {
        const c = st.inst[a.k]; if (!c) break;
        const tgt = st.inst[a.to]; if (!tgt) return deny('ต้องเลือกการ์ดที่จะรับพลังด้วย');
        const side = ownerOf(st, a.k);
        const tgtSide = ownerOf(st, a.to);
        if (strict && isPlayer && side !== by) return deny('สามัคคีได้เฉพาะการ์ดฝั่งตัวเอง');
        if (a.k === a.to) return deny('เลือกตัวอื่นเป็นผู้รับพลัง');
        if (!(zoneOf(st, a.k) || '').endsWith('.avatar')) return deny('ใช้ได้เฉพาะ Avatar บนสนาม');
        if (!(zoneOf(st, a.to) || '').endsWith('.avatar')) return deny('ผู้รับต้องเป็น Avatar บนสนาม');
        if (tgtSide !== side) return deny('สามัคคีให้ได้เฉพาะ Avatar ฝั่งตัวเอง');
        {
          const eGive = fxCard(c);
          if (eGive && eGive.unityOnlyNameIncludes && !nameMatches(tgt, eGive.unityOnlyNameIncludes))
            return deny(`"${c.name}" ใช้สามัคคีให้ได้เฉพาะ "${eGive.unityOnlyNameIncludes}"`);
        }
        if (c.tapped) return deny(`"${c.name}" นอนอยู่แล้ว ใช้สามัคคีไม่ได้`);
        if (cannotChangeState(st, a.k)) return deny(`"${c.name}" ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
        if (!a._skipAbilityReact && offerAbilityReact(st, fx, side, a.k, { type: 'unity', k: a.k, to: a.to, owner: side })) {
          fx.snd = 'tap';
          break;
        }
        c.tapped = true;
        // เมื่อได้รับสามัคคี (พี่บูม ฯลฯ) — ทำก่อน snapshot พลังผู้ให้
        abil(st, a.to, 'receivedUnity').forEach(ab => {
          if (ab.requireGiverNameIncludes && !nameMatches(c, ab.requireGiverNameIncludes)) return;
          runActions(st, fx, ab.actions || [], { src: a.to, owner: side, rng, unityGiver: a.k });
        });
        const add = effPower(st, a.k);
        st.buffs.push({ k: a.to, amt: add, until: 'endOfTurn', from: a.k, unity: true });
        addLog(st, side, `🤝 สามัคคี: ${c.name} นอนลง → เสริม POWER +${add} ให้ ${tgt.name} (ถึงจบเทิร์น)`);
        fx.announce = { src: a.k, tgt: a.to, srcName: c.name, tgtName: tgt.name, by: side, kind: 'unity', pa: add, pd: effPower(st, a.to) };
        fx.snd = 'tap'; break;
      }

      /* แทงหลัง — นอนตัวเอง เสริม POWER(+1) ให้ผู้โจมตีจนจบการต่อสู้ · สีต่าง → ทำลายผู้โจมตีหลังจบ */
      case 'backstab': {
        const c = st.inst[a.k]; if (!c) break;
        const tgt = st.inst[a.to]; if (!tgt) return deny('ต้องเลือก Avatar ที่สั่งโจมตี');
        const side = ownerOf(st, a.k);
        if (strict && isPlayer && side !== by) return deny('แทงหลังได้เฉพาะการ์ดฝั่งตัวเอง');
        if (a.k === a.to) return deny('เลือกตัวโจมตีคนละใบ');
        if (!(zoneOf(st, a.k) || '').endsWith('.avatar')) return deny('ใช้ได้เฉพาะ Avatar บนสนาม');
        if (!(zoneOf(st, a.to) || '').endsWith('.avatar')) return deny('เป้าต้องเป็น Avatar บนสนาม');
        if (c.tapped) return deny(`"${c.name}" นอนอยู่แล้ว ใช้แทงหลังไม่ได้`);
        if (cannotChangeState(st, a.k)) return deny(`"${c.name}" ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
        if (!hasKw(st, a.k, 'แทงหลัง')) return deny(`"${c.name}" ไม่มีแทงหลัง`);
        if (!a._skipAbilityReact && offerAbilityReact(st, fx, side, a.k, { type: 'backstab', k: a.k, to: a.to, owner: side })) {
          fx.snd = 'tap';
          break;
        }
        const add = effPower(st, a.k) + 1;
        c.tapped = true;
        st.buffs.push({
          k: a.to, amt: add, until: 'combat', from: a.k,
          backstabColor: c.color || '', backstabFrom: a.k
        });
        // ซุนเซ็ก: แทงหลังให้สีแดง → ตื่นกลับ
        {
          const e = fxCard(c);
          if (e && e.untapAfterBackstabColor && (tgt.color || '') === e.untapAfterBackstabColor) {
            if (claimOncePerTurn(st, a.k, 'backstabUntap')) {
              c.tapped = false;
              addLog(st, side, `เอฟเฟกต์ ${c.name}: แทงหลังให้สี${e.untapAfterBackstabColor} — ตื่นกลับ`);
            }
          }
        }
        addLog(st, side, `🗡️ แทงหลัง: ${c.name} นอนลง → เสริม POWER +${add} ให้ ${tgt.name} (จนจบการต่อสู้)`);
        fx.announce = { src: a.k, tgt: a.to, srcName: c.name, tgtName: tgt.name, by: side, kind: 'backstab', pa: add, pd: effPower(st, a.to) };
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
        if (cannotChangeState(st, a.k)) return deny(`"${c.name}" ไม่สามารถเปลี่ยนสภาพได้จนจบเทิร์น`);
        // ดาบศักดิ์สิทธิ์ ฯลฯ: ผู้โจมตีที่สวมโฮสต์บล็อกโล่มนุษย์
        {
          const atk = st.pending.atk;
          if (atk && st.inst[atk]) {
            for (const id in st.inst) {
              const m = st.inst[id];
              if (!m || m.attachedTo !== atk) continue;
              const me = fxCard(m);
              if (me && me.hostBlockHumanShield)
                return deny(`โล่มนุษย์ใช้ไม่ได้ — ${m.name} บนผู้โจมตีบล็อก`);
            }
          }
        }
        if (!a._skipAbilityReact && offerAbilityReact(st, fx, side, a.k, { type: 'humanShield', k: a.k, owner: side })) {
          fx.snd = 'tap';
          break;
        }
        c.tapped = true;
        st.pending.def = a.k; st.pending.life = null; st.pending.kind = 'battle';
        {
          const e = fxCard(c);
          if (e && e.powerOnHumanShield) {
            st.buffs.push({ k: a.k, amt: e.powerOnHumanShield, until: 'combat', from: a.k });
            addLog(st, side, `เอฟเฟกต์ ${c.name}: โล่มนุษย์ → POWER +${e.powerOnHumanShield} จนจบการต่อสู้`);
          }
        }
        refreshOnFightBuffs(st, st.pending.atk, a.k);
        addLog(st, side, `🛡️ โล่มนุษย์: ${c.name} นอนลง รับการโจมตีแทน`);
        // ใช้โล่แล้ว = ตอบหน้าต่าง React ดักโจมตีแล้ว ไม่ต้องถามซ้ำ
        if ((st.prompts || [])[0] && st.prompts[0].kind === 'react' && st.prompts[0].reactTrigger === 'enemyDeclareAttack'
          && st.prompts[0].chooser === side) {
          st.prompts.shift();
        }
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
        const defZb = zoneOf(st, a.def) || '';
        if (!defZb.endsWith('.avatar') && !defZb.endsWith('.construct'))
          return deny('เป้าหมายโจมตีต้องเป็น Avatar หรือ Construct');
        A.tapped = true;
        declareBuffs(st, a.atk);
        if (defZb.endsWith('.avatar')) {
          if (declareEffects(st, fx, a.atk, a.def, rng)) break;
          applyOnFightBuffs(st, a.atk, a.def);
        } else if (declareEffects(st, fx, a.atk, null, rng)) break;
        resolveCombat(st, fx, a.atk, a.def, null);
        break;
      }

      case 'lifeHit': {
        // alias ที่หัว applyAction → declareAttack แล้ว — คง case ไว้กัน action เก่า/สคริปต์
        break;
      }

      // ★ ท่าปิดเกม: plead = ฝ่ายสาหัสตอบอ้อนวอนไหม · grant = ฝ่ายโจมตีจะยอมไหม
      //   ok(plead)=true → รอฝ่ายโจมตียอม · ok(plead)=false / ok(grant)=false → จบเกม
      //   ok(grant)=true → ยกเลิกโจมตี + จบเทิร์นฝ่ายโจมตี · เพนกวิ้น ฮัทข้ามขั้น grant
      case 'lethalAnswer': {
        const pl = st.pendingLethal; if (!pl) break;
        const phase = pl.phase || 'plead';
        if (phase === 'plead') {
          if (isPlayer && by !== pl.target) return deny('เฉพาะฝั่งที่ถูกประกาศปิดเกมเท่านั้นที่ตอบได้');
          if (a.ok) {
            pl.phase = 'grant';
            addLog(st, pl.target, `🙏 ฝ่าย ${pl.target} อ้อนวอนขออีกเทิร์น — รอฝ่าย ${pl.by} ตอบว่าจะยอมไหม`);
            fx.snd = 'tap';
            break;
          }
          st.pendingLethal = null;
          addLog(st, pl.target, `ฝ่าย ${pl.target} ไม่อ้อนวอน — ท่าปิดเกมทำงาน จบเกม`);
          declareBuffs(st, pl.atk);
          declareEffects(st, fx, pl.atk, null, rng);
          resolveCombat(st, fx, pl.atk, null, pl.life);
          break;
        }
        // grant — ฝ่ายโจมตีตอบ
        if (isPlayer && by !== pl.by) return deny('เฉพาะฝ่ายผู้โจมตีที่ยอม/ไม่ยอมอ้อนวอนได้');
        if (a.ok) {
          finishLethalBegGranted(st, fx, pl, rng, 'grant');
          break;
        }
        st.pendingLethal = null;
        addLog(st, pl.by, `ฝ่าย ${pl.by} ไม่ยอมให้อ้อนวอน — ท่าปิดเกมทำงาน จบเกม`);
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
        enterPhase(a.phase);
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
        // จั่วเพิ่มของผู้เริ่ม = หลังมือครบทั้งสองฝ่าย + beginDuel (ไม่จั่วตอนมัลลิแกนแต่ละคน)
        const p = a.p || by;
        if (strict && isPlayer && p !== by) return deny('มัลลิแกนได้เฉพาะมือตัวเอง');
        if (st.turn !== 1) return deny('มัลลิแกนได้เฉพาะตอนเริ่มเกม (เทิร์น 1)');
        if (st.awaitBattleStart || st.fpDrawn) return deny('เปิดศึกไปแล้ว — มัลลิแกนไม่ได้');
        if (st.mulliganDone && st.mulliganDone[p]) return deny('มัลลิแกนได้ครั้งเดียวต่อเกม');
        st.mulliganDone = st.mulliganDone || {}; st.mulliganDone[p] = true;
        const hand = st.zones[p + '.hand'] || [];
        const ids = (a.ids || []).filter(k => hand.includes(k));
        if (!ids.length) {
          addLog(st, p, 'เก็บมือเดิม (ไม่เปลี่ยน)');
        } else {
          ids.forEach(k => { st.zones[p + '.hand'] = st.zones[p + '.hand'].filter(x => x !== k); st.inst[k].faceUp = false; st.zones[p + '.deck'].unshift(k); }); // ลงใต้ Deck (ไม่สับ)
          const drew = takeFromDeckToHand(st, p, ids.length, fx).length;
          addLog(st, p, `มัลลิแกน: เปลี่ยน ${ids.length} ใบ (เรียงใต้ Deck ไม่สับ) จั่วใหม่ ${drew} ใบ`);
          fx.snd = 'draw';
        }
        if (bothMulliganDone(st) && !st.fpDrawn) {
          st.awaitBattleStart = true;
          fx.battleIntro = { firstPlayer: st.firstPlayer || 'A' };
          addLog(st, 'S', 'มือเปิดครบทั้งสองฝ่าย — เตรียมเปิดศึก');
        }
        break;
      }

      case 'beginDuel': {
        // หลังแอนิเมชัน BATTLE — จั่วเพิ่มให้ผู้เริ่ม แล้วเข้าเล่นได้
        if (!st.awaitBattleStart) {
          if (st.fpDrawn) break; // ซ้ำจากอีกจอ — ไม่เป็นไร
          return deny('ยังไม่ถึงขั้นเปิดศึก');
        }
        st.awaitBattleStart = false;
        const fp = st.firstPlayer || 'A';
        addLog(st, 'S', '⚔️ BATTLE START!');
        fpBonusDraw(st, fx, fp);
        fx.snd = fx.snd || 'clash';
        fx.battleStarted = true;
        break;
      }

      case 'endTurn': {
        // resume = หลังเลือกอัญเชิญนารายกลับ (นรสิง) แล้วค่อยจบเทิร์นต่อ
        const resuming = !!(a._resume && st._endTurnResume);
        if (!resuming) {
          const forceEnd = !!a._forceFromEffect;
          if (!forceEnd) {
            if (st._endTurnResume) return deny('เลือกร่างพระนารายณ์จากนรกก่อน — แล้วระบบจะจบเทิร์นให้เอง');
            if (strict && isPlayer && by !== st.active) return deny('โหมดกติกา: จบเทิร์นได้เฉพาะผู้เล่นที่ถือเทิร์น');
            if (st.scout) return deny('กำลังสอดแนมอยู่ — เลือกไว้บนกอง/ใต้กองให้เสร็จก่อนจบเทิร์น');
            if (st.pendingLethal) return deny('มีท่าปิดเกมค้างอยู่ — รอฝั่งที่โดนตีตอบก่อน');
            if ((st.prompts || []).length) return deny('ยังมีเอฟเฟกต์ค้างเลือกอยู่ — จัดการให้จบก่อนจบเทิร์น');
            {
              const must = hostMustAttackPendingName(st, st.active);
              if (must) return deny(`"${must}" ต้องโจมตีถ้าทำได้ — จบเทิร์นไม่ได้`);
            }
            // กติกา: มือเกิน 7 ใบ ต้องทิ้งให้เหลือ 7 ก่อนจบเทิร์น
            if (strict) { const h = (st.zones[st.active + '.hand'] || []).length; if (h > 7) return deny(`มือเกิน 7 ใบ (มี ${h} ใบ) — ต้องทิ้งให้เหลือ 7 ก่อนจบเทิร์น (ลากการ์ดในมือลงนรก หรือเลือกแล้วกดทิ้ง)`); }
          } else {
            st.scout = null;
            st._endTurnResume = null;
            st.prompts = [];
          }
          enterPhase('End');
        }
        const ending = resuming ? st._endTurnResume.ending : st.active;
        if (!resuming) {
          // trigger ช่วงจบเทิร์นของฝ่ายที่กำลังจบ (แม่กบ counter+1 · น้ำชูกำลัง ตื่น host · แรงงานกลับเด็ค)
          (st.zones[ending + '.avatar'] || []).slice().forEach(k => {
            abil(st, k, 'ownTurnEnd').forEach(ab => {
              if (!abilityMagicReqOk(st, ending, ab)) return;
              const cond = (ab.trigger && ab.trigger.if) || '';
              if (cond === 'selfTapped' && !(st.inst[k] && st.inst[k].tapped)) return;
              runActions(st, fx, ab.actions, { src: k, owner: ending, rng });
            });
          });
          // อินาริ ฯลฯ: อัตโนมัติ End Phase จาก Magic Zone
          (st.zones[ending + '.magic'] || []).slice().forEach(k => {
            const c = st.inst[k]; if (!c || !c.faceUp) return;
            abil(st, k, 'ownTurnEnd').forEach(ab => {
              if (!(ab.fromMagicZone || (fxCard(c) && fxCard(c).abilitiesFromMagicZone))) return;
              runActions(st, fx, ab.actions, { src: k, owner: ending, rng });
            });
          });
          // อวตารนารายณ์: นัด End Phase (replaceSelfWithHellNarai) — ถ้าต้องเลือกการ์ด ให้พักจบเทิร์นไว้ก่อน
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
          // สวนกล้วยหนีภาษี ฯลฯ — นับ End Phase รวมทุกฝ่าย
          tickGlobalEndPhaseTimers(st, fx, ending);
          // ★ นรสิง: ถ้ามีหน้าต่างเลือกพระนารายณ์จากนรก — หยุดจบเทิร์นไว้ก่อน (อย่าเคลียร์ prompts)
          if ((st.prompts || []).length) {
            st._endTurnResume = { ending };
            addLog(st, ending, 'End Phase: เลือกเอฟเฟกต์ที่ค้างอยู่ก่อนจบเทิร์น');
            fx.snd = 'place';
            break;
          }
        }
        delete st._endTurnResume;
        // เคลียร์ keyword ชั่วคราว + cannotAttack ของโลกิหลังครบเทิร์นเจ้าของใหม่? เก็บ cannotAttack จนย้ายอีกครั้ง
        for (const id in st.inst) {
          const c = st.inst[id];
          if (!c) continue;
          if (c.attackAllEnemyUntilEOT) delete c.attackAllEnemyUntilEOT;
          if (c.battleDestroyLifeHitUntilEOT) delete c.battleDestroyLifeHitUntilEOT;
          if (c._allowLifeDespiteAvatars) delete c._allowLifeDespiteAvatars;
          if (c.milledThisTurn) delete c.milledThisTurn;
          if (c.cannotChangeStateUntilEOT) delete c.cannotChangeStateUntilEOT;
          if (!c.grantedKeywords) continue;
          c.grantedKeywords = c.grantedKeywords.filter(g => g.until === 'permanent');
          if (!c.grantedKeywords.length) delete c.grantedKeywords;
        }
        st.pending = null; st.prompts = [];
        if (st.chain.length) { resolveChain(st, fx, rng); } st.chainPri = null;
        // ทรายดูด: กวาด P0 ก่อนเคลียร์บัฟ endOfTurn (กันบัฟ -POWER หมดก่อนทำลาย)
        sweepDestroyPowerZero(st, fx);
        // เคลียร์บัฟจน End Phase ถัดไปของฝ่ายตรงข้าม (เมื่อฝ่ายนั้นจบเทิร์น)
        st.buffs = st.buffs.filter(b => {
          if (b.until === 'oppNextEnd' && b.opp === ending) return false;
          if (b.until === 'nextOwnDraw') return true;
          return b.until !== 'endOfTurn' && b.until !== 'combat';
        });
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
        if (st.lockSummonAndAbility && st.lockSummonAndAbility.owner === ending) delete st.lockSummonAndAbility;
        for (const id in st.inst) if (st.inst[id] && st.inst[id].nullifyUntilEOT) delete st.inst[id].nullifyUntilEOT;
        // เคลียร์ swap cost/power ชั่วคราว
        for (const id in st.inst) {
          if (st.inst[id] && st.inst[id]._swapCombat) {
            delete st.inst[id]._swapCombat;
          }
        }
        st.magicUsed = { A: {}, B: {} };
        st._extraSkillReactUsed = {};
        st._reactNamesUsed = {};
        st.active = st.active === 'A' ? 'B' : 'A';
        if (st.active === 'A') st.turn++;
        st.turnSeq = (st.turnSeq || 0) + 1; // นับทุกครั้งที่เปลี่ยนผู้เล่น (เทิร์นละครั้ง)
        st.attacksThisTurn = st.attacksThisTurn || { A: 0, B: 0 };
        st.attacksThisTurn[st.active] = 0;
        st.phase = 'Draw';
        st.buffs = (st.buffs || []).filter(b => {
          if (b.until !== 'nextOwnDraw') return true;
          const own = ownerOf(st, b.k);
          return own !== st.active;
        });
        ['avatar', 'magic', 'construct'].forEach(z => (st.zones[st.active + '.' + z] || []).forEach(k => {
          const c = st.inst[k]; if (!c) return;
          // น้ำซุปชาบู: ห้ามตื่นทุกกรณี จนจบ End Phase ถัดไปของเรา (ข้าม Draw รอบถัดไปด้วย)
          if (c.noUntapHard) {
            c.noUntapSkippedDraw = true;
            return;
          }
          if (cannotChangeState(st, k)) return;
          // ปืนจักรวุทธ: ห้ามตื่น ยกเว้นสั่งใช้ของใบนี้
          if (c.noUntapExceptName) {
            const still = Object.keys(st.inst).some(id => {
              const m = st.inst[id];
              return m && m.attachedTo === k && nameMatches(m, c.noUntapExceptName);
            });
            if (still) return;
            delete c.noUntapExceptName;
          }
          if (c.noUntapSetSeq != null && (st.turnSeq || 0) > c.noUntapSetSeq) return;
          c.tapped = false;
        }));
        // เคลียร์ธงห้ามตื่นเมื่อจบ End Phase ของเจ้าของ (หลังข้ามการตื่นรอบนั้นแล้ว)
        (st.zones[ending + '.avatar'] || []).forEach(k => {
          const c = st.inst[k];
          if (c && c.noUntapSetSeq != null && (st.turnSeq || 0) > c.noUntapSetSeq) {
            delete c.noUntapSetSeq;
            addLog(st, ending, `${nameOf(st, k)}: สิ้นสุดเอฟเฟกต์ห้ามตื่น`);
          }
          if (c && c.noUntapHard && c.noUntapSkippedDraw) {
            delete c.noUntapHard;
            delete c.noUntapSkippedDraw;
            addLog(st, ending, `${nameOf(st, k)}: สิ้นสุดเอฟเฟกต์ห้ามตื่นทุกกรณี`);
          }
        });
        if (st.hellReturnedThisTurn) delete st.hellReturnedThisTurn[ending];
        if (st.summonedThisTurn) delete st.summonedThisTurn[ending];
        if (st.handCostMods) st.handCostMods = (st.handCostMods || []).filter(m => m.owner !== ending && m.until === 'permanent');
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
        syncHeimdall(st);
        // พระไตรปิฎก ฯลฯ: ชนะทันทีช่วง Draw Phase — เช็คก่อนจั่ว/เด็คว่าง เพื่อไม่ให้แพ้เด็คว่างก่อนชนะ
        checkInstantWinDraw(st, fx, st.active);
        if (st.over) { fx.snd = 'draw'; break; }
        // จั่วต้นเทิร์น 1 ใบ (เทิร์นแรกของผู้เริ่มไม่ผ่านจุดนี้ — เริ่มเกมด้วยมือเปิดอยู่แล้ว)
        {
          const dd = st.zones[st.active + '.deck'];
          if (!dd.length) {
            checkDeckEmptyLoss(st, fx, st.active);
          } else {
            st.ownDrawCount = st.ownDrawCount || { A: 0, B: 0 };
            st.ownDrawCount[st.active] = (st.ownDrawCount[st.active] || 0) + 1;
            const firstDrawHits = st.ownDrawCount[st.active] === 1
              ? dd.filter(id => {
                const e = fxId(st, id);
                return !!(e && e.replaceFirstDrawWithSelf);
              })
              : [];
            if (firstDrawHits.length) {
              st.prompts.push({
                kind: 'pick', from: 'ids', ids: firstDrawHits, src: firstDrawHits[0],
                chooser: st.active, dest: 'replaceFirstDraw', optional: true,
                allowAnyZone: true, shuffleAfter: true
              });
              addLog(st, st.active, `Draw Phase แรก: สามารถนำ "${nameOf(st, firstDrawHits[0])}" จากเด็คขึ้นมือแทนการจั่ว (หรือข้ามเพื่อจั่วปกติ)`);
              fx.snd = 'draw';
              break;
            }
            const got = takeFromDeckToHand(st, st.active, 1, fx);
            addLog(st, st.active, 'จั่วต้นเทิร์น 1 ใบ');
            if (got[0]) fx.drawn = got[0];
          }
        }
        finishDrawPhaseStart(st.active);
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
          ensureBattle();
          s.tapped = true; // โจมตีแล้วนอนเอง
        } else {
          ensureMain();
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
      const e = fxCard(m);
      if (!e || !e.destroyHostIfPower0) continue;
      const host = m.attachedTo;
      if (st.inst[host] && (zoneOf(st, host) || '').endsWith('.avatar') && effPower(st, host) <= 0) {
        addLog(st, 'S', `เอฟเฟกต์ ${m.name}: ${nameOf(st, host)} POWER 0 — ทำลาย`);
        destroyCard(st, fx, host);
      }
    }
    // ทรายดูด: หลังทุก action (ลง Land / ลด POWER ฯลฯ) กวาด Avatar P0
    sweepDestroyPowerZero(st, fx);
    noteDroppedUnityAuras(st);
    if (!fx.deny) syncEnterLink(st, fx);
    offerAttackRetargetIfNeeded(st, fx);

    // เด็คว่าง (เห็นพื้น) = แพ้ทันที — กันกรณีย้ายใบออกเด็คนอก take/mill/doMove
    if (!st.over) checkAllDecksEmptyLoss(st, fx);

    // นรสิง: เลือกอัญเชิญนารายจากนรกครบแล้ว → ทำจบเทิร์นต่ออัตโนมัติ
    if (st._endTurnResume && !(st.prompts || []).length && a.type !== 'endTurn' && !fx.deny) {
      const who = st._endTurnResume.ending || st.active;
      const cont = applyAction(st, { type: 'endTurn', by: who, _resume: true }, rng);
      if (cont) {
        if (cont.snd) fx.snd = cont.snd;
        if (cont.over) fx.over = cont.over;
        if (cont.drawn) fx.drawn = cont.drawn;
        if (cont.deny) fx.deny = cont.deny;
      }
    }

    delete fx._rng;
    return fx;
  }

  return { buildInitialState, applyAction, zoneOf, ownerOf, zLabel, effPower, powerBreakdown, effCost, freeSummonOk, nameMatches, loadEffects, mergeEffects, loadSetReleases, keywordsOf, promptTargetOk, promptCandidates, counterOptions, attackReactOptions, humanShieldOptions, avatarCap, syncHeimdall, effectOf: (code, nameHint) => resolveEffect(code, nameHint) || EFFECTS[code] || null, hasKw, gemColorOf, gemPaysFor, gemPayDenyMsg, chooseModeOptionDeny, activatedTargetDeny, inOverdose };
});
