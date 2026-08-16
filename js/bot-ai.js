/* BotAI — กลยุทธ์บอทตามแมคคานิคเด็ค (ใช้คู่กับ heuristic ใน game.js)
   โฟกัส: เงื่อนไขแลนด์ · ลำดับเทค · อาร์คไทป์อีสาน / ป่าพงไพร · คะแนน synergy
   + โจมตี/เตะไข่ตามจังหวะ LIFE · สวน React เมื่อถูกคุกคาม · ขัดเวทตามความคุ้ม */
(function (root) {
  'use strict';

  const LAND = {
    ISAN: 'โคกอีสานนูน',
    FOREST: 'ป่าพงไพร',
    SWAMP: 'บึงทมิฬ',
  };
  const ARCH = {
    ISAN: 'isan',
    FOREST: 'forest',
    SWAMP: 'swamp',
    GENERIC: 'generic',
  };

  function eng() { return root.BoTEngine; }
  function nm(c, needle) {
    if (!c || !needle) return false;
    const E = eng();
    if (E && E.nameMatches) return E.nameMatches(c, needle);
    return (c.name || '').includes(needle);
  }
  function effectOf(c) {
    if (!c) return null;
    const E = eng();
    return (E && E.effectOf && E.effectOf(c.code, c.name)) || null;
  }
  function nameOf(c) { return (c && c.name) || ''; }
  function otherSide(side) { return side === 'A' ? 'B' : 'A'; }

  /** มอด/การ์ดนี้ให้เตะไข่ไหม (ไม้เกาหลัง ฯลฯ) */
  function modGrantsKickEgg(c) {
    if (!c) return false;
    const E = eng();
    if (E && E.keywordsOf && E.keywordsOf(c.code, c.name).includes('เตะไข่')) return true;
    const txt = (c.effect || '') + ' ' + nameOf(c);
    return /เตะไข่|ไม้เกาหลัง/.test(txt);
  }

  function zoneIds(st, z) { return (st && st.zones && st.zones[z]) || []; }
  function landCards(st) {
    return zoneIds(st, 'land').map(k => st.inst[k]).filter(Boolean);
  }
  function landOnBoard(st) {
    return landCards(st).find(c => c.faceUp !== false) || landCards(st)[0] || null;
  }
  function landControlledBy(st, side) {
    return landCards(st).some(c => c && c.controller === side);
  }
  function pendingOwnLand(st, side) {
    return zoneIds(st, side + '.magic').some(k => {
      const x = st.inst[k];
      return x && x.subtype === 'Land';
    });
  }
  function hasLandNamed(st, needle) {
    return landCards(st).some(c => c.faceUp !== false && nm(c, needle));
  }
  function hellReturned(st, side) {
    return (st.hellReturnedThisTurn && st.hellReturnedThisTurn[side]) || 0;
  }
  function ownNameOnField(st, side, needle) {
    return zoneIds(st, side + '.avatar').some(k => nm(st.inst[k], needle));
  }
  function countNameOnField(st, side, needle) {
    return zoneIds(st, side + '.avatar').filter(k => nm(st.inst[k], needle)).length;
  }

  /* เก็บ requireLand จากความสามารถ + ออร่า static */
  function landNeedlesOfCard(c) {
    const out = [];
    const e = effectOf(c);
    if (!e) return out;
    if (e.landNameIncludes) out.push(e.landNameIncludes);
    (e.abilities || []).forEach(ab => {
      if (ab.requireLandNameIncludes) out.push(ab.requireLandNameIncludes);
      (ab.actions || []).forEach(ac => {
        if (ac.requireLandNameIncludes) out.push(ac.requireLandNameIncludes);
        (ac.options || []).forEach(opt => {
          if (opt.requireLandNameIncludes) out.push(opt.requireLandNameIncludes);
        });
      });
    });
    if (e.grantKeywordAura && e.grantKeywordAura.landNameIncludes)
      out.push(e.grantKeywordAura.landNameIncludes);
    return out;
  }

  function scanSideNames(st, side) {
    const bags = [
      ...zoneIds(st, side + '.hand'),
      ...zoneIds(st, side + '.avatar'),
      ...zoneIds(st, side + '.magic'),
      ...zoneIds(st, side + '.construct'),
      ...zoneIds(st, side + '.hell'),
      ...zoneIds(st, side + '.deck').slice(0, 12),
      ...zoneIds(st, 'land').filter(k => st.inst[k] && st.inst[k].controller === side),
    ];
    const names = [];
    bags.forEach(k => { const c = st.inst[k]; if (c && c.name) names.push(c.name); });
    return names;
  }

  function detectArchetype(st, side) {
    const names = scanSideNames(st, side);
    let isan = 0, forest = 0, swamp = 0;
    names.forEach(n => {
      if (/โคกอีสานนูน|อีสานสลิงเกอร์/.test(n)) isan++;
      if (/ป่าพงไพร|ภูติผลไม้/.test(n)) forest++;
      if (/บึงทมิฬ/.test(n)) swamp++;
    });
    if (isan >= 2 && isan >= forest) return ARCH.ISAN;
    if (forest >= 2 && forest >= isan) return ARCH.FOREST;
    if (swamp >= 2) return ARCH.SWAMP;
    if (isan) return ARCH.ISAN;
    if (forest) return ARCH.FOREST;
    if (swamp) return ARCH.SWAMP;
    return ARCH.GENERIC;
  }

  function wantedLandNeedle(arch) {
    if (arch === ARCH.ISAN) return LAND.ISAN;
    if (arch === ARCH.FOREST) return LAND.FOREST;
    if (arch === ARCH.SWAMP) return LAND.SWAMP;
    return null;
  }

  /** แลนด์บนสนามช่วยเด็คเราอยู่แล้วไหม (ไม่ควรทับ) */
  function landHelpsArchetype(st, arch) {
    const need = wantedLandNeedle(arch);
    if (!need) return !!landOnBoard(st);
    return hasLandNamed(st, need);
  }

  /** ใบนี้เป็นแลนด์เป้าหมายของอาร์คไทป์ไหม */
  function isWantedLandCard(c, arch) {
    const need = wantedLandNeedle(arch);
    if (!need) return !!(c && c.subtype === 'Land');
    return !!(c && c.subtype === 'Land' && nm(c, need));
  }

  /** ใบ POWER 0 แต่ GEM สูง — เก็บไว้จ่าย Cost (วีรชนชีวภาพ ฯลฯ) อย่าลงสนาม */
  function isGemBattery(c) {
    if (!c || c.type !== 'Avatar') return false;
    if ((+c.power || 0) > 0) return false;
    if ((+c.gem || 0) < 3) return false;
    const e = effectOf(c);
    if (e && e.keywords && e.keywords.length) return false;
    const abs = (e && e.abilities) || [];
    const hasFieldAb = abs.some(ab => {
      const on = ab && ab.trigger && ab.trigger.on;
      return on && on !== 'paidAsCost';
    });
    if (hasFieldAb) return false;
    return true;
  }

  /** จ่ายเป็น Cost แล้วมีผลพิเศษเข้ากับใบที่กำลังอัญเชิญ (วีรชน → สีเขียว) */
  function paidAsCostMatches(payC, summonC) {
    if (!payC || !summonC) return false;
    const e = effectOf(payC);
    return ((e && e.abilities) || []).some(ab => {
      if (!(ab && ab.trigger && ab.trigger.on === 'paidAsCost')) return false;
      const iff = String((ab.trigger && ab.trigger.if) || '');
      if (/summonColor:/.test(iff)) {
        const col = iff.replace(/^.*summonColor:/, '').split(/\s/)[0];
        return !!(col && summonC.color && summonC.color === col);
      }
      if (/summonSymbol:/.test(iff)) {
        const sym = iff.replace(/^.*summonSymbol:/, '').split(/\s/)[0];
        return !!(sym && summonC.symbol && summonC.symbol === sym);
      }
      return true;
    });
  }

  function cardIsKeyEnabler(c, arch) {
    if (!c) return false;
    const n = nameOf(c);
    if (arch === ARCH.ISAN) {
      return /อีสานสลิงเกอร์/.test(n) || /โคกอีสานนูน/.test(n);
    }
    if (arch === ARCH.FOREST) {
      return /ภูติผลไม้/.test(n) || /ป่าพงไพร/.test(n);
    }
    if (arch === ARCH.SWAMP) return /บึงทมิฬ/.test(n);
    return false;
  }

  function cardIsFinisherLine(c, arch) {
    if (!c) return false;
    if (arch === ARCH.ISAN) return /โคกอีสานนูน/.test(nameOf(c));
    if (arch === ARCH.FOREST) return /ป่าพงไพร/.test(nameOf(c));
    return false;
  }

  function collectOps(c) {
    const e = effectOf(c);
    const ops = [];
    ((e && e.abilities) || []).forEach(ab => {
      (ab.actions || []).forEach(ac => {
        if (ac && ac.op) ops.push(ac.op);
        (ac.options || []).forEach(opt => {
          ((opt && opt.actions) || []).forEach(a2 => { if (a2 && a2.op) ops.push(a2.op); });
        });
      });
    });
    return ops;
  }

  /** คะแนนผลของเวท/สั่งใช้ — จั่ว เสิร์ช ทำลาย เด้ง ตามบอร์ดจริง */
  function effectOpsBonus(st, side, c) {
    if (!c) return 0;
    const ops = collectOps(c);
    const enemyN = zoneIds(st, otherSide(side) + '.avatar').length;
    const ownN = zoneIds(st, side + '.avatar').length;
    let b = 0;
    const seen = Object.create(null);
    ops.forEach(op => {
      if (!op || seen[op]) return;
      seen[op] = 1;
      if (op === 'draw' || op === 'drawThenDiscard') b += 16;
      else if (op === 'scout' || op === 'deckPick' || op === 'deckPickMulti') b += 22;
      else if (op === 'hellPick' || op === 'returnFromHell' || op === 'summonFromHell') b += 26;
      else if (op === 'chooseDestroy' || op === 'destroy' || op === 'destroyTarget' || op === 'destroyAllEnemyAvatars')
        b += enemyN ? 40 : -35;
      else if (op === 'bounce' || op === 'returnToHand') b += enemyN ? 34 : -18;
      else if (op === 'mill') b += 8;
      else if (op === 'modifyPower') b += ownN ? 14 : 4;
      else if (op === 'grantKeyword') b += 18;
      else if (op === 'untap') b += 14;
      else if (op === 'tap') b += enemyN ? 16 : 0;
      else if (op === 'cancelAttack' || op === 'destroyAttacker' || op === 'sendAttackerToHell') b += 8;
    });
    return b;
  }

  /** React ใบนี้หยุด/ลดการโจมตีได้แค่ไหน (สูง = ควรใช้เมื่อถูกคุกคาม) */
  function reactStopScore(c) {
    if (!c) return 0;
    const n = nameOf(c);
    if (/อย่าให้มีครั้งที่/.test(n)) return -800; // ขัดเวท ไม่ใช่สวนโจมตี
    const ops = collectOps(c);
    let s = 8;
    ops.forEach(op => {
      if (op === 'cancelAttack' || op === 'destroyAttacker' || op === 'sendAttackerToHell') s += 90;
      else if (op === 'bounce' || op === 'returnToHand') s += 70;
      else if (op === 'negate') s += 50;
      else if (op === 'destroyAllEnemyAvatars' || op === 'chooseDestroy') s += 55;
      else if (op === 'weakenAttacker' || op === 'swapCostPowerCombat' || op === 'modifyPower') s += 45;
      else if (op === 'preventDestroy' || op === 'grantCombatImmuneAllOwn') s += 60;
      else if (op === 'grantKeyword') s += 20;
      else if (op === 'draw' || op === 'scout') s += 14;
      else if (/sacrifice/.test(op)) s -= 22;
    });
    if (/เพื่อชาติ/.test(n)) s += 50; // กวาดบอร์ดด้วยรถถัง — เก็บไว้ใช้คู่
    return s;
  }

  function nameHasTank(c) {
    return !!(c && /รถถัง/.test(nameOf(c)));
  }

  function ownTankCount(st, side) {
    const bags = [
      ...zoneIds(st, side + '.avatar'),
      ...zoneIds(st, side + '.hand'),
    ];
    return bags.filter(k => nameHasTank(st.inst[k])).length;
  }

  /** React ที่ต้องมีรถถัง (เพื่อชาติ เซ่นรถถังแล้วกวาดบอร์ด ฯลฯ) */
  function holdsForTankCombo(c) {
    if (!c) return false;
    if (/เพื่อชาติ/.test(nameOf(c))) return true;
    const e = effectOf(c);
    let hit = false;
    ((e && e.abilities) || []).forEach(ab => {
      if (ab.requireOwnNameIncludes && /รถถัง/.test(String(ab.requireOwnNameIncludes))) hit = true;
      (ab.cost || []).forEach(ac => {
        const n = ac && ac.filter && ac.filter.nameIncludes;
        const arr = Array.isArray(n) ? n : n ? [n] : [];
        if (arr.some(x => /รถถัง/.test(String(x)))) hit = true;
      });
    });
    return hit;
  }

  /** คะแนนเก็บใบคอมโบรถถัง — อย่าจ่าย GEM / ทิ้งมือ */
  function comboHoldScore(st, side, c) {
    if (!holdsForTankCombo(c)) return 0;
    const tanks = ownTankCount(st, side);
    if (tanks > 0) return 90;
    if (zoneIds(st, side + '.deck').some(k => nameHasTank(st.inst[k]))) return 55;
    return 25;
  }

  /** เวทฝั่งตรงข้ามคุ้มขัดไหม */
  function magicNegateThreat(c) {
    if (!c) return 0;
    let s = 18;
    if (c.subtype === 'Land') s += 36;
    if (c.subtype === 'React') s += 58;
    if (c.subtype === 'Modification') s += 22;
    const ops = collectOps(c);
    ops.forEach(op => {
      if (/destroy|chooseDestroy|destroyAll/.test(op)) s += 48;
      if (/bounce|returnToHand/.test(op)) s += 36;
      if (/cancelAttack|negate|destroyAttacker/.test(op)) s += 55;
      if (/draw|scout|hellPick|deckPick/.test(op)) s += 22;
      if (op === 'modifyPower') s += 16;
      if (op === 'grantKeyword') s += 18;
    });
    if (cardIsKeyEnabler(c, ARCH.ISAN) || cardIsKeyEnabler(c, ARCH.FOREST) || cardIsFinisherLine(c, ARCH.ISAN)
      || cardIsFinisherLine(c, ARCH.FOREST)) s += 45;
    return s;
  }

  /** คะแนนอัญเชิญตาม synergy */
  function summonSynergyBonus(st, side, k, arch) {
    const c = st.inst[k]; if (!c) return 0;
    let bonus = 0;
    const needs = landNeedlesOfCard(c);
    needs.forEach(need => {
      if (hasLandNamed(st, need)) bonus += 55;
      else bonus -= 35; // ยังไม่มีแลนด์ที่ล็อก — ลงทีหลัง
    });
    if (cardIsKeyEnabler(c, arch)) {
      bonus += 40;
      if (arch === ARCH.ISAN && /อีสานสลิงเกอร์/.test(nameOf(c))) {
        // ลงสลิงเกอร์ก่อนเปิดเทค
        if (!ownNameOnField(st, side, 'อีสานสลิงเกอร์')) bonus += 35;
        if (hasLandNamed(st, LAND.ISAN)) bonus += 20;
      }
      if (arch === ARCH.FOREST && /ภูติผลไม้/.test(nameOf(c))) {
        if (hasLandNamed(st, LAND.FOREST)) bonus += 45;
        else bonus -= 15;
        if (/มะขาม/.test(nameOf(c))) {
          if (!hasLandNamed(st, LAND.FOREST)) bonus += 50; // เสิร์ชป่า
          else if (zoneIds(st, side + '.avatar').length >= 2)
            bonus -= 280; // มีแลนด์+บอร์ดแล้ว — เก็บมะขามไว้ตอนแลนด์หาย
        }
      }
    }
    // กันบอร์ดเต็มด้วยใบไร้ synergy ถ้ายังไม่มี enabler
    if (arch !== ARCH.GENERIC && !cardIsKeyEnabler(c, arch) && !needs.length) {
      const hasEnabler = zoneIds(st, side + '.avatar').some(id => cardIsKeyEnabler(st.inst[id], arch));
      if (!hasEnabler && zoneIds(st, side + '.hand').some(id => cardIsKeyEnabler(st.inst[id], arch)))
        bonus -= 12;
    }
    if (nameHasTank(c) && zoneIds(st, side + '.hand').some(id => holdsForTankCombo(st.inst[id])))
      bonus += 28;
    if (isGemBattery(c)) bonus -= 160;
    return bonus;
  }

  /** คะแนนเล่นเวท / แลนด์ */
  function magicPlayScore(st, side, k, arch, magicTypeFree) {
    const c = st.inst[k]; if (!c || c.type !== 'Magic') return -999;
    const mtype = c.subtype || 'Normal';
    if (mtype === 'React') return -999;
    if (magicTypeFree && !magicTypeFree(mtype)) return -999;

    const land = landOnBoard(st);
    const helps = landHelpsArchetype(st, arch);
    let score = 10;

    if (mtype === 'Land') {
      // มีแลนด์ตัวเองแล้ว (หรือรอขัดเวทอยู่) — ห้ามวางซ้ำทับใบตัวเอง
      if (landControlledBy(st, side) || pendingOwnLand(st, side)) {
        if (isWantedLandCard(c, arch) && !helps) score = 80; // อัปเกรดใบผิดเป็นแลนด์เด็ค
        else score = -999;
        return score;
      }
      if (isWantedLandCard(c, arch)) {
        if (!helps) score = 120;          // ว่าง / ทับแลนด์ศัตรูที่ไม่ช่วยเรา
        else if (land && nm(land, wantedLandNeedle(arch) || '')) score = -40; // ออร่าตรงแล้ว ไม่ทับ
        else score = 70;                  // ทับแลนด์ศัตรูที่ไม่ใช่ของเรา
      } else if (!land) {
        score = arch === ARCH.GENERIC ? 55 : 25; // ว่าง — วางได้ แต่ไม่ใช่เป้าหมาย
      } else if (helps) {
        score = -60; // มีแลนด์ดีแล้ว อย่าทับด้วยใบอื่น
      } else {
        score = 15; // ทับแลนด์ศัตรูที่ไม่ช่วยเรา
      }
      return score;
    }

    if (mtype === 'Modification') {
      const hosts = zoneIds(st, side + '.avatar').length;
      if (!hosts) return -999;
      score = 32;
      if (arch === ARCH.ISAN || arch === ARCH.FOREST) score += 5;
      // ไม้เกาหลัง / มอดให้เตะไข่ — สำคัญเมื่อศัตรูมีบล็อกเกอร์
      if (modGrantsKickEgg(c)) {
        const enemyN = zoneIds(st, otherSide(side) + '.avatar').length;
        score += enemyN ? 55 : 15;
        if (/ไม้เกาหลัง/.test(nameOf(c))) score += 10;
      }
      return score;
    }

    const e = effectOf(c);
    const abs = (e && e.abilities) || [];
    // ไปเลยมอนตี้ / เพื่อชาติ ฯลฯ — ใช้ได้เฉพาะหน้าต่างสวนโจมตี ไม่ใช่ Main ของตัวเอง
    if (abs.some(ab => ab.trigger && ab.trigger.on === 'enemyDeclareAttack')) return -999;
    if (abs.some(ab => ab.react && ab.trigger && ab.trigger.on !== 'activated' && ab.trigger.on !== 'playMagic'))
      return -999;
    if (abs.some(ab => ab.trigger && (ab.trigger.on === 'activated' || ab.trigger.on === 'playMagic')))
      score = 30;
    if (cardIsKeyEnabler(c, arch) || cardIsFinisherLine(c, arch)) score += 40;
    // เวทที่ล็อกแลนด์
    landNeedlesOfCard(c).forEach(need => {
      if (hasLandNamed(st, need)) score += 40;
      else score -= 50;
    });
    abs.forEach(ab => {
      (ab.actions || []).forEach(ac => {
        if (!ac) return;
        if (ac.op === 'unrevealOwnLife') {
          const hasUp = zoneIds(st, side + '.life').some(id => st.inst[id] && st.inst[id].faceUp);
          if (!hasUp) score = -999;
        }
        if ((ac.op === 'bounce' || ac.op === 'returnToHand') && ac.from !== 'own' && ac.from !== 'any' && ac.target !== 'self') {
          if (!zoneIds(st, otherSide(side) + '.avatar').length) score = -999;
        }
        // ความกล้าหาญ ฯลฯ — ต้องมี Avatar บนสนามฝ่ายเราให้บัฟ
        if (ac.op === 'modifyPower' && ac.target && ac.target.select === 'choose' && !ac.optional) {
          const tside = ac.target.side || 'any';
          const ownN = zoneIds(st, side + '.avatar').length;
          const enemyN = zoneIds(st, otherSide(side) + '.avatar').length;
          if (tside === 'own' && !ownN) score = -999;
          else if (tside === 'enemy' && !enemyN) score = -999;
          else if (tside === 'any' && !ownN && !enemyN) score = -999;
        }
      });
    });
    if (score > -900) score += effectOpsBonus(st, side, c);
    return score;
  }

  /** คะแนนสั่งใช้ — แลนด์/เทคก่อน */
  function activateScore(st, side, k, arch) {
    const c = st.inst[k]; if (!c) return -999;
    const z = eng() && eng().zoneOf ? eng().zoneOf(st, k) : '';
    let score = 10 + (+c.power || 0);

    if (z === 'land' || (c.subtype === 'Land')) {
      score += 50;
      if (arch === ARCH.ISAN && nm(c, LAND.ISAN)) {
        score += 80;
        if (!ownNameOnField(st, side, 'อีสานสลิงเกอร์')) score -= 200; // ยังไม่มีสลิงเกอร์ — รอ
        else if (hellReturned(st, side) >= 6) score += 40; // พร้อมเทค 2
        else score += 30; // ทำเทค 1
        // ทั้งสองเทคใช้ไปแล้วในเทิร์น — อย่าสั่งซ้ำจนค้าง
        const e = effectOf(c);
        const modeOpts = ((((e && e.abilities) || []).find(ab => ab.trigger && ab.trigger.on === 'activated') || {}).actions || [])
          .find(ac => ac.op === 'chooseMode');
        if (modeOpts && modeOpts.options && st._onceTurn) {
          const seq = st.turnSeq != null ? st.turnSeq : st.turn;
          const allUsed = modeOpts.options.every(opt => {
            if (!opt.oncePerTurn) return false;
            const tag = opt.oncePerTurnTag || ('mode:' + (opt.label || ''));
            return !!st._onceTurn[k + ':' + seq + ':' + tag];
          });
          if (allUsed) score -= 300;
        }
      }
      if (arch === ARCH.FOREST && nm(c, LAND.FOREST)) {
        const hellHasFruit = zoneIds(st, side + '.hell').some(id => /ภูติผลไม้/.test(nameOf(st.inst[id])));
        if (!hellHasFruit) return -999; // อย่าเนรเทศเด็ค ถ้าไม่มีภูติในนรก
        score += 120;
      }
    }

    if (arch === ARCH.ISAN && /อีสานสลิงเกอร์/.test(nameOf(c))) score += 25;
    if (arch === ARCH.FOREST && /ภูติผลไม้/.test(nameOf(c))) {
      if (hasLandNamed(st, LAND.FOREST)) score += 35;
      else score -= 25;
    }
    if (/พิเภก/.test(nameOf(c))) {
      const hellYakP3 = zoneIds(st, side + '.hell').some(id => {
        const x = st.inst[id];
        return x && x.symbol === 'ยักษ์' && +x.power === 3;
      });
      score += hellYakP3 ? 45 : -90;
    }
    if (/มณโฑ/.test(nameOf(c))) {
      const fieldYak = zoneIds(st, side + '.avatar').some(id => {
        const x = st.inst[id];
        return x && (x.symbol === 'ยักษ์' || /มณโฑ/.test(nameOf(x)));
      });
      const hellYak = zoneIds(st, side + '.hell').some(id => {
        const x = st.inst[id];
        return x && x.symbol === 'ยักษ์';
      });
      if (fieldYak && hellYak) score += 50;
      else score -= 80;
    }

    const e = effectOf(c);
    (e && e.abilities || []).forEach(ab => {
      if (ab.requireLandNameIncludes && !hasLandNamed(st, ab.requireLandNameIncludes))
        score -= 80;
      if (ab.requireOwnNameIncludes && !ownNameOnField(st, side, ab.requireOwnNameIncludes))
        score -= 80;
      (ab.actions || []).forEach(ac => {
        if (!ac) return;
        if (ac.op === 'unrevealOwnLife') {
          const hasUp = zoneIds(st, side + '.life').some(id => st.inst[id] && st.inst[id].faceUp);
          if (!hasUp) score -= 200;
        }
        if ((ac.op === 'bounce' || ac.op === 'returnToHand') && ac.from !== 'own' && ac.from !== 'any' && ac.target !== 'self') {
          if (!zoneIds(st, otherSide(side) + '.avatar').length) score -= 200;
        }
        if (ac.op === 'hellPick' || ac.op === 'summonFromHell' || ac.op === 'returnFromHell') {
          const hell = zoneIds(st, side + '.hell');
          const filter = ac.filter || {};
          const needles = filter.nameIncludes
            ? (Array.isArray(filter.nameIncludes) ? filter.nameIncludes : [filter.nameIncludes])
            : [];
          const has = hell.some(id => {
            const x = st.inst[id]; if (!x) return false;
            if (filter.type && x.type !== filter.type) return false;
            if (needles.length && !needles.some(n => nm(x, n))) return false;
            return true;
          });
          if (!has) score = -999;
        }
      });
      if (score > -150) {
        const Eng = eng();
        if (Eng && Eng.activatedTargetDeny && Eng.activatedTargetDeny(st, side, ab, k))
          score = -999;
      }
    });

    if (score > -150) score += effectOpsBonus(st, side, c);
    return score;
  }

  /** ลำดับ Main ตามอาร์คไทป์ */
  function mainPriority(arch, lv) {
    if (lv === 'easy') return ['summon'];
    // land/magic ก่อน เพื่อปลดล็อก · activate เท็ค · summon enabler · เติมบอร์ด
    if (arch === ARCH.ISAN)
      return ['magic', 'summon', 'activate', 'attach', 'summon', 'activate', 'magic'];
    if (arch === ARCH.FOREST)
      return ['magic', 'summon', 'activate', 'attach', 'summon', 'activate'];
    if (lv === 'hard')
      return ['magic', 'activate', 'summon', 'attach', 'magic', 'summon', 'activate'];
    return ['magic', 'attach', 'activate', 'summon', 'magic', 'summon', 'attach'];
  }

  /**
   * เลือก chooseMode ที่ใช้ได้ — เทค 2 เมื่อคืนนรกครบ, ไม่เช่นนั้นเทค 1
   * optionsDeny(opt) → string|null
   */
  function pickChooseModeIndex(st, side, pr, optionsDeny) {
    const opts = (pr && pr.options) || [];
    if (!opts.length) return 0;

    if (pr.guessTypes) {
      const av = opts.findIndex(o => /อวตาร|Avatar/i.test((o && (o.label || o.name)) || ''));
      if (av >= 0 && !(optionsDeny && optionsDeny(opts[av]))) return av;
    }

    const scored = opts.map((opt, i) => {
      const label = (opt && (opt.label || opt.name)) || '';
      let s = 10 - i;
      const deny = optionsDeny ? optionsDeny(opt) : null;
      if (deny) return { i, s: -999, deny };

      if (/เทค\s*2|tech\s*2/i.test(label) || (opt.requireHellReturnedThisTurnMin != null && /ดวล|duel/i.test(label))) {
        const need = opt.requireHellReturnedThisTurnMin || 6;
        if (hellReturned(st, side) >= need) s = 200;
        else s = -100;
      } else if (/เทค\s*1|tech\s*1|คืนนรก/i.test(label)) {
        s = hellReturned(st, side) >= 6 ? 40 : 150;
      }
      // ชอบโหมดที่ปลดล็อก / จั่ว / คืนทรัพยากรก่อนจบเกม
      if (/จั่ว|คืน|เสิร์ช|ค้น|อัญเชิญ/.test(label)) s += 20;
      if (/ทำลาย|ลด|นอน/.test(label)) s += 8;
      return { i, s, deny: null };
    });

    scored.sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s > -900) return scored[0].i;
    // fallback: อันแรกที่ไม่ deny
    for (let i = 0; i < opts.length; i++) {
      if (!(optionsDeny && optionsDeny(opts[i]))) return i;
    }
    return 0;
  }

  /** เป้าอัญเชิญจากนรก/เด็ค */
  function pickSummonTarget(st, side, cands, arch) {
    if (!cands || !cands.length) return null;
    const ranked = cands.slice().map(k => {
      const c = st.inst[k];
      let s = 0;
      if (c && c.type === 'Avatar') s += 20 + (+c.power || 0) * 12;
      if (cardIsKeyEnabler(c, arch)) s += 60;
      if (arch === ARCH.FOREST && c && /ภูติผลไม้/.test(nameOf(c))) s += 80;
      if (arch === ARCH.ISAN && c && /อีสานสลิงเกอร์/.test(nameOf(c))) s += 80;
      if (arch === ARCH.FOREST && c && /ป่าพงไพร/.test(nameOf(c))) s += 100;
      if (arch === ARCH.ISAN && c && /โคกอีสานนูน/.test(nameOf(c))) s += 100;
      return { k, s };
    });
    ranked.sort((a, b) => b.s - a.s);
    return ranked[0].k;
  }

  /** มัลลิแกน — เก็บ enabler / แลนด์เด็ค / เคิร์ฟเล่นได้ */
  function mulliganKeepScore(st, side, k, arch, canPlay) {
    const c = st.inst[k]; if (!c) return 0;
    let s = 5;
    if (isWantedLandCard(c, arch)) s += 50;
    if (cardIsKeyEnabler(c, arch)) s += 40;
    if (c.type === 'Avatar' && canPlay) s += 25 + Math.max(0, 6 - (+c.cost || 0)) * 3;
    if (c.type === 'Avatar' && !canPlay && (+c.cost || 0) >= 6) s -= 30;
    if (isGemBattery(c)) s += 8;
    if (c.subtype === 'React') s += 12;
    if (holdsForTankCombo(c)) s += 40;
    if (nameHasTank(c)) s += 18;
    if (c.subtype === 'Modification' && !zoneIds(st, side + '.hand').some(id => st.inst[id] && st.inst[id].type === 'Avatar'))
      s -= 20;
    return s;
  }

  function shouldActivateBeforeSummon(st, side, arch) {
    if (arch === ARCH.ISAN) {
      return hasLandNamed(st, LAND.ISAN) && ownNameOnField(st, side, 'อีสานสลิงเกอร์');
    }
    if (arch === ARCH.FOREST) {
      return hasLandNamed(st, LAND.FOREST) &&
        zoneIds(st, side + '.hell').some(id => /ภูติผลไม้/.test(nameOf(st.inst[id])));
    }
    return false;
  }

  /**
   * คะแนนตำแหน่งทั้งกระดาน — ใช้กับ look-ahead ระดับยาก
   * (จำลองตาแล้วเทียบ ไม่ใช้ LLM ตอนเล่น — กติกาซับซ้อน LLM เล่นผิด/ช้า)
   */
  function evalPosition(st, side) {
    if (!st) return 0;
    const opp = otherSide(side);
    if (st.over) {
      const w = (st.over && st.over.winner) || st.over;
      if (w === side) return 80000;
      if (w === opp) return -80000;
      return 0;
    }
    const E = eng();
    const pwr = k => {
      const c = st.inst[k];
      if (!c) return 0;
      try { return (E && E.effPower) ? E.effPower(st, k) : (+c.power || 0); }
      catch (e) { return +c.power || 0; }
    };
    const hasEgg = k => {
      try { return !!(E && E.hasKw && E.hasKw(st, k, 'เตะไข่')); }
      catch (e) { return false; }
    };
    const lifeIds = s => zoneIds(st, s + '.life');
    const lifeN = s => lifeIds(s).length;
    const lifeDown = s => lifeIds(s).filter(k => st.inst[k] && !st.inst[k].faceUp).length;
    let v = 0;
    v += lifeN(side) * 95 + lifeDown(side) * 58;
    v -= lifeN(opp) * 95 + lifeDown(opp) * 58;
    if (lifeN(side) && !lifeDown(side)) v -= 85;
    if (lifeN(opp) && !lifeDown(opp)) v += 110;

    zoneIds(st, side + '.avatar').forEach(k => {
      const c = st.inst[k]; if (!c) return;
      v += 24 + pwr(k) * 10;
      if (hasEgg(k)) v += 18;
      if (c.tapped) v -= 6;
    });
    zoneIds(st, opp + '.avatar').forEach(k => {
      const c = st.inst[k]; if (!c) return;
      v -= 24 + pwr(k) * 10;
      if (hasEgg(k)) v -= 20;
    });
    zoneIds(st, side + '.construct').forEach(k => { v += 10 + pwr(k) * 4; });
    zoneIds(st, opp + '.construct').forEach(k => { v -= 10 + pwr(k) * 4; });

    v += zoneIds(st, side + '.hand').length * 7;
    v -= zoneIds(st, opp + '.hand').length * 5;
    v += Math.min(8, zoneIds(st, side + '.deck').length) * 1.5;

    const arch = detectArchetype(st, side);
    if (landHelpsArchetype(st, arch)) v += 48;
    else if (wantedLandNeedle(arch) && zoneIds(st, side + '.hand').some(k => isWantedLandCard(st.inst[k], arch)))
      v += 8;
    if (arch === ARCH.FOREST) {
      v += zoneIds(st, side + '.hell').filter(id => /ภูติผลไม้/.test(nameOf(st.inst[id]))).length * 9;
    }
    if (arch === ARCH.ISAN) {
      if (ownNameOnField(st, side, 'อีสานสลิงเกอร์')) v += 22;
      v += Math.min(8, hellReturned(st, side)) * 3;
    }
    if ((st.prompts || []).length) v -= 12;
    return v;
  }

  root.BotAI = {
    LAND, ARCH,
    detectArchetype,
    landOnBoard,
    hasLandNamed,
    landHelpsArchetype,
    isWantedLandCard,
    cardIsKeyEnabler,
    isGemBattery,
    paidAsCostMatches,
    landNeedlesOfCard,
    summonSynergyBonus,
    magicPlayScore,
    activateScore,
    mainPriority,
    pickChooseModeIndex,
    pickSummonTarget,
    mulliganKeepScore,
    shouldActivateBeforeSummon,
    evalPosition,
    hellReturned,
    ownNameOnField,
    wantedLandNeedle,
    modGrantsKickEgg,
    effectOpsBonus,
    reactStopScore,
    magicNegateThreat,
    holdsForTankCombo,
    comboHoldScore,
    ownTankCount,
    nameHasTank,
  };
})(typeof window !== 'undefined' ? window : globalThis);
