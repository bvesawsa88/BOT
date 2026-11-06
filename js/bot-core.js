/* BotCore — ผู้เล่นบอทตัวจริงที่ใช้ทั้งในเกมและในการทดสอบ (ไม่แตะ DOM)
   createPlayer(host) คืนผู้เล่นหนึ่งฝั่ง · host = { side, level(), state(), send(action), schedule() }
   playMatch(cards, decks, opts) ให้บอทตัวจริงสู้กันเองบน BoTEngine
   การให้คะแนนอยู่ใน bot-ai.js / bot-universal.js ไฟล์นี้เป็นส่วนตัดสินใจลงมือในแต่ละจังหวะ */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BotCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';
  if (typeof require === 'function') {
    if (!root.BoTEngine) root.BoTEngine = require('./engine.js');
    if (!root.BotAI) require('./bot-ai.js');
    if (!root.BotUniversal) root.BotUniversal = require('./bot-universal.js');
  }
  const E = root.BoTEngine;
  const AI = root.BotAI;
  const U = root.BotUniversal;

  function createPlayer(host) {
    const me = host.side || 'B';
    const foe = me === 'A' ? 'B' : 'A';
    const level = () => host.level();
    const isHard = () => { const lv = level(); return lv === 'hard' || lv === 'nightmare'; };
    const hasActivated = k => E.hasActivatedAbility(st, k);
    let st = null;

    const eff = k => E.effPower(st, k);
    const ACTIVATE_REPEAT_LIMIT = 6;
    let botFailKeys = new Set();
    let botFailTurn = -1;
    let botActivateCounts = new Map();
    let botLifeHitTurn = -1;
    let botLifeHits = 0;
    function botCloneSt(s) {
      try { return JSON.parse(JSON.stringify(s)); } catch (e) { return null; }
    }
    function botWithSt(next, fn) {
      const prev = st;
      st = next;
      try { return fn(); } finally { st = prev; }
    }
    /** ตัวเลือกของพรอมป์ต์ ไม่รวมชื่อที่เลือกไปแล้ว (เลือกซ้ำแล้วพรอมป์ต์ไม่จบ) */
    function botPromptCands(s, pr) {
      const seen = pr.seenNames || {};
      return (E.promptCandidates(s, pr) || []).filter(k => !(s.inst[k] && seen[s.inst[k].name]));
    }
    function botSimPromptAct(sim, pr) {
      const chooser = pr.chooser;
      if (chooser !== me) {
        if (pr.kind === 'react') return { type: 'reactNo', by: chooser };
        if (pr.optional !== false) return { type: 'skipPrompt', by: chooser };
        const cands = (E.promptCandidates(sim, pr)) || [];
        if (cands[0]) return { type: 'chooseTarget', k: cands[0], by: chooser };
        return { type: 'skipPrompt', by: chooser };
      }
      return botWithSt(sim, () => {
        if (pr.kind === 'chooseMode' && pr.options && pr.options.length) {
          const denyFn = opt => botModeOptionDeny(pr.src, opt);
          let opt = AI.pickChooseModeIndex(sim, me, pr, denyFn);
          const order = [opt];
          for (let i = 0; i < pr.options.length; i++) if (i !== opt) order.push(i);
          for (const i of order) {
            if (denyFn(pr.options[i])) continue;
            return {
              type: 'chooseMode', k: pr.src, opt: i,
              label: (pr.options[i] && pr.options[i].label) || '', by: me,
            };
          }
          return { type: 'skipPrompt', by: me };
        }
        if (pr.kind === 'react') return { type: 'reactNo', by: me };
        if (pr.kind === 'peekTop') return { type: 'peekTopPlace', where: 'top', by: me };
        if (pr.kind === 'handOrSummon') {
          const c = pr.card && sim.inst[pr.card];
          const where = (c && c.type === 'Avatar' && (+c.power || 0) >= 3 && !U.summonLockNeedle(c)) ? 'avatar' : 'hand';
          return { type: 'handOrSummonPick', where, by: me };
        }
        if (pr.kind === 'guessReveal') return { type: 'guessRevealContinue', by: me };
        if (pr.kind === 'magicRedirect') return { type: 'magicRedirectYes', by: me };
        if (pr.kind === 'combatSurvive') return { type: 'combatSurviveYes', by: me };
        if (pr.kind === 'passengerReplace') return { type: 'passengerReplaceYes', by: me };
        if (pr.kind === 'preventLeaveExile') return { type: 'preventLeaveYes', by: me };
        if (pr.kind === 'pickSymbol') {
          const opts = pr.symbols || pr.options || [];
          const symbol = (typeof opts[0] === 'string' ? opts[0] : (opts[0] && (opts[0].symbol || opts[0].label))) || 'สัตว์';
          return { type: 'pickSymbol', symbol, by: me };
        }
        const cands = botPromptCands(sim, pr);
        const pick = botPickTarget(pr, cands);
        if (pick) return { type: 'chooseTarget', k: pick, by: me };
        if (pr.optional !== false) return { type: 'skipPrompt', by: me };
        if (cands[0]) return { type: 'chooseTarget', k: cands[0], by: me };
        return { type: 'skipPrompt', by: me };
      });
    }
    /** จำลอง 1 ตาบนสำเนากระดาน (ไม่แตะเกมจริง) — ระดับยากใช้เทียบว่าตาไหนกระดานดีกว่า */
    function botSimAction(action) {
      const s = botCloneSt(st);
      if (!s || !action) return null;
      let seed = 7;
      const step = a => E.applyAction(s, Object.assign({ seed: seed++ }, a));
      let fx = step(Object.assign({}, action, { by: action.by || me }));
      if (!fx || fx.deny) return null;
      let guard = 0;
      while (guard++ < 14) {
        if (s.over) break;
        const pr = (s.prompts || [])[0];
        if (pr) {
          const na = botSimPromptAct(s, pr);
          fx = step(Object.assign({}, na, { by: na.by || pr.chooser }));
          if (fx && fx.deny) {
            if (pr.optional !== false) {
              fx = step({ type: 'skipPrompt', by: pr.chooser });
              if (fx && fx.deny) break;
            } else break;
          }
          continue;
        }
        if (s.scout && s.scout.p === me) {
          fx = step({ type: 'scoutEnd', where: 'top', by: me });
          if (fx && fx.deny) break;
          continue;
        }
        if (s.pending && s.pending.by === me && s.pending.target === foe) {
          fx = step({ type: 'resolveAttack', by: foe });
          if (fx && fx.deny) break;
          continue;
        }
        break;
      }
      return s;
    }
    function botEval(s) {
      return AI.evalPosition(s, me);
    }
    function botLookaheadPick(cands) {
      if (!cands.length) return {};
      const hard = isHard();
      return U.chooseAction(st, me, cands, {
        sim: hard ? botSimAction : null,
        evalPos: hard ? botEval : null,
        level: level(),
        beam: hard ? 12 : 8,
      });
    }
    function botArch() {
      return AI.detectArchetype(st, me);
    }
    function botLifeInfo(side) {
      const lives = st.zones[side + '.life'] || [];
      const down = lives.filter(k => st.inst[k] && !st.inst[k].faceUp);
      return {
        n: lives.length,
        down: down.length,
        critical: lives.length > 0 && down.length === 0,
        target: down[0] || lives.find(k => st.inst[k]) || null,
      };
    }
    function botHasEgg(k) {
      return !!E.hasKw(st, k, 'เตะไข่') || !!(st.inst[k] && st.inst[k]._allowLifeDespiteAvatars);
    }
    function botThreatScore(k) {
      const c = st.inst[k]; if (!c) return 0;
      let s = eff(k) * 5;
      if (botHasEgg(k)) s += 45;
      if (E.hasKw(st, k, 'สามัคคี')) s += 10;
      if (E.hasKw(st, k, 'ลูกฮึด')) s += 18;
      if (E.hasKw(st, k, 'โล่มนุษย์')) s += 8;
      if (E.hasKw(st, k, 'แทงหลัง')) s += 12;
      return s;
    }
    function botSkipCombatReact(k) {
      const c = st.inst[k];
      return !!(c && /อย่าให้มีครั้งที่/.test(c.name || ''));
    }
    function botRankCombatReacts(opts) {
      return (opts || []).slice().filter(k => !botSkipCombatReact(k)).sort((a, b) => {
        const sa = AI.reactStopScore(st.inst[a]);
        const sb = AI.reactStopScore(st.inst[b]);
        if (sb !== sa) return sb - sa;
        return botCardVal(a) - botCardVal(b);
      });
    }
    function botTankWipeWorth(pend) {
      const tanks = (st.zones[me + '.avatar'] || []).filter(k => /รถถัง/.test((st.inst[k] && st.inst[k].name) || ''));
      if (!tanks.length) return false;
      const has = (st.zones[me + '.hand'] || []).some(k => /เพื่อชาติ/.test((st.inst[k] && st.inst[k].name) || ''));
      if (!has) return false;
      const enemyN = (st.zones[foe + '.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar').length;
      if (enemyN >= 2) return true;
      if (pend && pend.life && enemyN >= 1) return true;
      if (pend && pend.def && tanks.includes(pend.def) && pend.atk && eff(pend.atk) >= eff(pend.def)) return true;
      if (pend && pend.atk && botThreatScore(pend.atk) >= 50 && enemyN >= 1) return true;
      return false;
    }
    function botShouldCombatReact(pend) {
      const lv = level();
      if (!pend) return false;
      if (lv !== 'easy' && botTankWipeWorth(pend)) return true;
      const atkP = pend.atk ? eff(pend.atk) : 0;
      const defP = pend.def ? eff(pend.def) : 0;
      const lifeAtk = !!pend.life;
      const myL = botLifeInfo(me);
      if (lifeAtk && atkP <= 0) return false;
      if (lv === 'easy') return !!(lifeAtk && myL.critical);
      if (lifeAtk) {
        if (myL.critical || myL.down <= 1) return true;
        return isHard() ? myL.down <= 3 : myL.down <= 2;
      }
      if (!pend.def) return false;
      if (atkP < defP) return false;
      const lost = botThreatScore(pend.def);
      const atkTh = botThreatScore(pend.atk);
      if (isHard()) return lost >= 28 || atkTh >= 55 || (atkP > defP && lost >= 18);
      return lost >= 32 || atkP > defP;
    }
    function botKey(a) {
      try { return JSON.stringify(a); } catch (e) { return String(a && a.type); }
    }
    function botSend(a) {
      if (!a) return false;
      if (botFailTurn !== st.turn) { botFailKeys = new Set(); botActivateCounts = new Map(); botFailTurn = st.turn; }
      const key = botKey(a);
      if (botFailKeys.has(key)) return false;
      // สั่งใช้ซ้ำได้โดยกระดานไม่เปลี่ยน — หยุดไว้ก่อนบอทวนลูปจนค้าง
      if (a.type === 'activateAbility') {
        const n = (botActivateCounts.get(key) || 0) + 1;
        if (n > ACTIVATE_REPEAT_LIMIT) return false;
        botActivateCounts.set(key, n);
      }
      const fx = host.send(a);
      if (fx && fx.deny) {
        // ปฏิเสธตอนยังไม่เปิดศึก อย่าจำเป็น fail-key ทั้งเทิร์น 1 — บอทเริ่มก่อนจะตัน
        if (!/รอเปิดศึก|มือเปิดก่อน/.test(String(fx.deny || ''))) botFailKeys.add(key);
        host.schedule();
        return false;
      }
      botFailKeys.clear();
      return true;
    }
    function botModeOptionDeny(k, opt) {
      return E.chooseModeOptionDeny(st, k, me, opt);
    }
    function botBaseCardVal(k) {
      const c = st.inst[k]; if (!c) return 0;
      let v = U.cardValue(st, me, c) + AI.comboHoldScore(st, me, c);
      if (AI.isWantedLandCard(c, botArch())) v += 8;
      return v;
    }
    function botCardVal(k) {
      return botBaseCardVal(k) + (U.evolvePlan(st, me).keep.has(k) ? 200 : 0);
    }
    function botMagicTypeFree(mtype) {
      return !(st.magicUsed && st.magicUsed[me] && st.magicUsed[me][mtype]);
    }
    function botBuildPay(summonK, cost) {
      const c0 = st.inst[summonK]; if (!c0) return null;
      if (cost <= 0) return [];
      const eAll = E.effectOf(c0.code, c0.name);
      const avColor = E.avatarCostColors(c0, eAll);
      const hand = (st.zones[me + '.hand'] || []).filter(x => x !== summonK);
      const evolveKeep = U.evolvePlan(st, me, summonK).keep;
      const usable = [];
      for (const o of hand) {
        const info = E.payGemInfo(st.inst[o], c0);
        const ok = E.gemPaysFor(info.gc, avColor);
        if (E.costOnlyDeny(st.inst[o], c0)) continue;
        // เก็บแลนด์/เอนเอเบลอร์เด็คไว้จ่ายทีหลัง
        let keep = botBaseCardVal(o);
        if (evolveKeep.has(o)) keep += 300;
        const arch = botArch();
        if (AI.isWantedLandCard(st.inst[o], arch)) keep += 80;
        if (AI.cardIsKeyEnabler(st.inst[o], arch)) keep += 50;
        if (st.inst[o].subtype === 'React') keep += 25;
        keep += AI.comboHoldScore(st, me, st.inst[o]);
        if (AI.holdForNationTrap(st.inst[o])) keep += 400;
        if (AI.isGemBattery(st.inst[o])) keep -= 40;
        if (AI.paidAsCostMatches(st.inst[o], c0)) keep -= 55;
        if (/วีรชนชีวภาพ/.test((st.inst[o].name || '')) && c0.color === 'เขียว') keep -= 160;
        if (/มะขาม/.test((c0.name || '')) && /ภูติผลไม้/.test((st.inst[o].name || ''))) {
          if (/แตงกวา|มะม่วง/.test(st.inst[o].name || '')) keep += 90;
          else keep -= 55;
        }
        if (AI.isDeckKeyCard(st.inst[o])) keep += 70;
        if (AI.isBodyguardCard(st.inst[o])) keep += 40;
        if (/มะขาม/.test((st.inst[o].name || '')) && AI.hasLandNamed(st, AI.LAND.FOREST)
          && (st.zones[me + '.avatar'] || []).length >= 2) keep += 90;
        if (ok && info.g > 0) usable.push({ k: o, g: info.g, keep });
      }
      usable.sort((a, b) => a.keep - b.keep || b.g - a.g);
      let gem = 0; const pay = [];
      for (const o of usable) {
        if (gem >= cost) break;
        pay.push(o.k);
        gem += o.g;
      }
      if (gem < cost) return null;
      const gOf = k => E.payGemInfo(st.inst[k], c0).g;
      for (;;) {
        const total = pay.reduce((s, k) => s + gOf(k), 0);
        if (total < cost) return null;
        const drop = pay.findIndex(k => total - gOf(k) >= cost);
        if (drop < 0) break;
        pay.splice(drop, 1);
      }
      gem = pay.reduce((s, k) => s + gOf(k), 0);
      if (eAll && eAll.exactGemPay && gem !== cost) {
        while (pay.length && gem > cost) {
          const last = pay[pay.length - 1];
          const g = E.payGemInfo(st.inst[last], c0).g;
          if (gem - g >= cost) { pay.pop(); gem -= g; }
          else break;
        }
        if (gem !== cost) return null;
      }
      return pay;
    }
    function botSummonScore(k) {
      const c = st.inst[k]; if (!c) return -1;
      const cost = E.effCost(st, k);
      const free = !!(E.freeSummonOk(st, k));
      const p = +c.power || 0;
      let s = p * 12 - cost * 3;
      if (free) s += 80;
      if (c.type === 'Avatar') s += 20;
      if (c.type === 'Construct') s += 8;
      if (c.type === 'Avatar' && p <= 0 && (+c.gem || 0) >= 3) s -= 140;
      if (U.isEvolver(c) && U.evolvePlan(st, me, k).targets.length) s += 45;
      const enemies = (st.zones[foe + '.avatar'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar');
      if (enemies.length && enemies.every(e => eff(e) < p)) s += 15;
      s += AI.summonSynergyBonus(st, me, k, botArch());
      const myL = botLifeInfo(me);
      const oppN = (st.zones[foe + '.avatar'] || []).length;
      const myN = (st.zones[me + '.avatar'] || []).length;
      if (c.type === 'Avatar') {
        if (myN <= 1 && oppN >= 2) s += 16 + Math.max(0, 5 - cost) * 3;
        if (myL.critical && (st.zones[foe + '.avatar'] || []).some(id => botHasEgg(id)))
          s += 22 + Math.max(0, 6 - cost) * 4;
      }
      return s;
    }
    function botCollectSummonCands() {
      const lv = level();
      const hand = st.zones[me + '.hand'] || [];
      const zone = st.zones[me + '.avatar'] || [];
      const conZone = st.zones[me + '.construct'] || [];
      const avCount = zone.filter(k => st.inst[k] && st.inst[k].type === 'Avatar').length;
      const cap = (E.avatarCap(st, me)) || 4;
      const avLimit = lv === 'easy' ? 2 : isHard() ? Math.min(4, cap) : Math.min(3, cap);
      const candidates = [];
      const locked = [];
      const plan = U.evolvePlan(st, me);
      for (const k of hand) {
        const c = st.inst[k]; if (!c) continue;
        if (c.type !== 'Avatar' && c.type !== 'Construct') continue;
        if (lv === 'easy' && c.type === 'Construct') continue;
        if (c.type === 'Avatar' && avCount >= avLimit) continue;
        if (c.type === 'Construct' && conZone.length >= 3) continue;
        if (c.type === 'Construct' && conZone.some(id => st.inst[id] && st.inst[id].name === c.name)) continue;
        if (zone.length + conZone.length >= 8) continue;
        const eBot = E.effectOf(c.code, c.name);
        if (eBot && (eBot.noPaidSummon || eBot.noHandSummon)) continue;
        if (eBot && eBot.sacrificeSummon) continue;
        if (c.type === 'Avatar' && (+c.power || 0) <= 0 && (+c.gem || 0) >= 3) {
          if (AI.isGemBattery(c)) continue;
        }
        const free = !!(E.freeSummonOk(st, k));
        const cost = free ? 0 : E.effCost(st, k);
        if (lv === 'easy' && cost > 4 && !free) continue;
        const pay = free ? [] : botBuildPay(k, cost);
        if (pay == null) continue;
        const score = botSummonScore(k);
        const spendsCombo = pay.some(o => plan.keep.has(o)) && !(U.isEvolver(c) && !plan.fieldEv.length);
        const a = { type: 'summon', k, to: c.type === 'Construct' ? me + '.construct' : me + '.avatar', payIds: pay, by: me };
        if (free) a.free = true;
        if (U.summonLockNeedle(c)) locked.push({ a, heur: score, free, power: +c.power || 0 });
        else candidates.push({ a, heur: spendsCombo ? score - 60 : score, spendsCombo });
      }
      // จ่ายชิ้นคอมโบได้เฉพาะตอนบอร์ดว่างและไม่มีตัวอื่นให้ลง
      if (!zone.length && !candidates.some(x => !x.spendsCombo && x.a.to === me + '.avatar')) {
        candidates.forEach(x => { if (x.spendsCombo) x.heur += 60; });
      }
      // ตัวที่ต้องรอแปลงร่าง: ลงเองเป็นตัวเปล่า — ลงเมื่อฟรี หรือบอร์ดว่างโดนกดและไม่มีทางแปลงร่าง
      const noEvolver = !plan.fieldEv.length && !plan.handEv.length;
      const pressed = !zone.length && (st.zones[foe + '.avatar'] || []).length > 0
        && !candidates.some(x => x.a.to === me + '.avatar');
      locked.forEach(x => {
        if (x.power > 0 && noEvolver && (x.free || pressed)) candidates.push(x);
      });
      candidates.sort((x, y) => y.heur - x.heur);
      return candidates;
    }
    function botTrySummon() {
      const candidates = botCollectSummonCands();
      for (const cand of candidates) {
        if (cand.heur < -20 && level() !== 'easy') continue; // เงื่อนไขไม่พร้อม — รอ
        if (botSend(cand.a)) return true;
      }
      return false;
    }
    function botCollectAttachCands() {
      const mods = (st.zones[me + '.magic'] || []).filter(k => {
        const c = st.inst[k];
        return c && c.subtype === 'Modification' && !c.attachedTo;
      });
      if (!mods.length) return [];
      const hosts = (st.zones[me + '.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
      if (!hosts.length) return [];
      const enemyN = (st.zones[foe + '.avatar'] || []).length;
      mods.sort((a, b) => {
        const ca = st.inst[a], cb = st.inst[b];
        const eggA = AI.modGrantsKickEgg(ca);
        const eggB = AI.modGrantsKickEgg(cb);
        if (eggA !== eggB) return eggA ? -1 : 1;
        return botCardVal(b) - botCardVal(a);
      });
      const out = [];
      for (const mod of mods) {
        const c = st.inst[mod];
        const grantsEgg = AI.modGrantsKickEgg(c);
        const rankedHosts = hosts.slice().sort((a, b) => {
          if (grantsEgg) {
            const eggA = !!E.hasKw(st, a, 'เตะไข่');
            const eggB = !!E.hasKw(st, b, 'เตะไข่');
            // ให้มอดเตะไข่กับตัวที่ยังไม่มี — สำคัญเมื่อศัตรูมีบล็อกเกอร์
            if (eggA !== eggB) return eggA ? 1 : -1;
            if (enemyN) return eff(b) - eff(a);
          }
          return eff(b) - eff(a);
        });
        rankedHosts.forEach((host, i) => {
          out.push({ a: { type: 'attach', k: mod, to: host, by: me }, heur: 40 + botCardVal(mod) - i * 4 + (grantsEgg ? 25 : 0) });
        });
      }
      return out;
    }
    function botTryAttach() {
      for (const it of botCollectAttachCands()) {
        if (botSend(it.a)) return true;
      }
      return false;
    }
    function botCollectMagicCands() {
      const hand = st.zones[me + '.hand'] || [];
      const arch = botArch();
      const ranked = [];
      for (const k of hand) {
        const c = st.inst[k]; if (!c || c.type !== 'Magic') continue;
        const mtype = c.subtype || 'Normal';
        if (mtype === 'React') continue;
        const ePlay = E.effectOf(c.code, c.name);
        const absPlay = (ePlay && ePlay.abilities) || [];
        if (absPlay.some(ab => ab.trigger && ab.trigger.on === 'enemyDeclareAttack')) continue;
        if (!botMagicTypeFree(mtype)) continue;
        const score = AI.magicPlayScore(st, me, k, arch, botMagicTypeFree);
        ranked.push({ a: { type: 'playMagic', k, by: me }, heur: score });
      }
      ranked.sort((x, y) => y.heur - x.heur);
      return ranked;
    }
    function botTryPlayMagic() {
      for (const it of botCollectMagicCands()) {
        if (it.heur < 0) continue;
        if (botSend(it.a)) return true;
      }
      return false;
    }
    function botMatches(zone, filter) {
      const ids = st.zones[zone] || [];
      return E.promptCandidates(st, { kind: 'pick', from: 'ids', ids, filter: filter || {}, chooser: me, allowAnyZone: true });
    }
    /** เสียของแล้วไม่ได้อะไร: จ่าย cost ค้นการ์ดที่เด็คไม่มี · ทำลายตัวเองทั้งที่ไม่มีตัวให้อัญเชิญ */
    function botPaysForNothing(ab) {
      const acts = ab.actions || [];
      const first = acts[0];
      if (!first) return false;
      if (ab.cost && first.op === 'deckPick') return !botMatches(me + '.deck', first.filter).length;
      const summon = acts.find(x => x.op === 'handSummon');
      if (!summon || first.op !== 'destroy' || (first.target || {}).select !== 'self') return false;
      return !botMatches(me + '.hand', summon.filter).some(h =>
        botBuildPay(h, Math.max(0, E.effCost(st, h) - (summon.costReduce || 0))) != null);
    }
    function botCollectActivateCands() {
      const arch = botArch();
      const evolveKeep = U.evolvePlan(st, me).keep;
      const handCards = st.zones[me + '.hand'] || [];
      const pools = [
        ...(st.zones[me + '.avatar'] || []),
        ...(st.zones[me + '.construct'] || []),
        ...(st.zones[me + '.magic'] || []),
        ...(st.zones['land'] || []),
        ...(st.zones[me + '.hand'] || []).filter(k => {
          const c = st.inst[k]; if (!c) return false;
          const e = E.effectOf(c.code, c.name);
          return e && (e.abilities || []).some(ab => ab.trigger && ab.trigger.on === 'activatedFromHand');
        }),
        // สั่งใช้จากนรก (ถ้าการ์ดรองรับ)
        ...(st.zones[me + '.hell'] || []).filter(k => hasActivated(k)),
        // สั่งใช้จากมิติมืด (ถ้าการ์ดรองรับ เช่น ไวรัส)
        ...(st.zones[me + '.dark'] || []).filter(k => hasActivated(k)),
      ];
      // แปลงร่างรอ Battle Phase: ตีด้วยร่างเดิมก่อน แล้วร่างใหม่ตื่นมาตีได้อีกครั้ง
      const holdEvolve = k => level() !== 'easy' && st.phase === 'Main' && U.isEvolver(st.inst[k]);
      return pools.filter(k => !holdEvolve(k)).map(k => {
        const c = st.inst[k];
        const e = E.effectOf(c.code, c.name);
        const actAb = (e && e.abilities || []).find(ab => ab.trigger && (ab.trigger.on === 'activated' || ab.trigger.on === 'activatedFromField' || ab.trigger.on === 'activatedAnyTurn' || ab.trigger.on === 'activatedFromHand' || ab.trigger.on === 'activatedFromHell' || ab.trigger.on === 'activatedFromDarkDimension' || ab.fromHell));
        const discardsCombo = actAb && [].concat(actAb.cost || []).some(x => x && x.op === 'discard')
          && handCards.every(h => h === k || evolveKeep.has(h));
        const zoneAb = c.type === 'Magic' && E.zoneOf(st, k) === me + '.magic'
          && ((e && e.abilities) || []).find(ab => ab.fromMagicZone);
        const isDenied = discardsCombo || botPaysForNothing(zoneAb || actAb || {})
          || (actAb && E.activatedTargetDeny(st, me, actAb, k));
        return {
          a: { type: 'activateAbility', k, by: me },
          heur: isDenied ? -999 : (AI.activateScore(st, me, k, arch)),
        };
      }).filter(it => it.heur >= -50 && hasActivated(it.a.k))
        .sort((a, b) => b.heur - a.heur);
    }
    function botTryActivate() {
      for (const it of botCollectActivateCands()) {
        if (botSend(it.a)) return true;
      }
      return false;
    }
    /** แปลงร่างหลังโจมตีครบ — ตัวที่นอนแล้วก่อน ร่างใหม่จะได้ตื่นมาตีต่อ */
    function botTryEvolve() {
      if (level() === 'easy') return false;
      const plan = U.evolvePlan(st, me);
      if (!plan.fieldEv.length || !plan.targets.length) return false;
      const best = U.pickEvolveTarget(st, me, plan.targets);
      if (U.evolvedPower(st, me, st.inst[best]) < 2) return false;
      const order = plan.fieldEv.slice().sort((a, b) => (st.inst[b].tapped ? 1 : 0) - (st.inst[a].tapped ? 1 : 0));
      for (const k of order) {
        if (hasActivated(k) && botSend({ type: 'activateAbility', k, by: me })) return true;
      }
      return false;
    }
    function botNationTrapHold() {
      return level() !== 'easy' && AI.nationTrapArmed(st, me);
    }
    function botTryNationTrapSummon() {
      if (level() === 'easy' || !AI.nationTrapSetup(st, me)) return false;
      const bait = AI.cheapestTankInHand(st, me);
      if (!bait || !st.inst[bait]) return false;
      const c = st.inst[bait];
      const free = !!(E.freeSummonOk(st, bait));
      const cost = free ? 0 : E.effCost(st, bait);
      const pay = free ? [] : botBuildPay(bait, cost);
      if (pay == null) return false;
      if (pay.some(k => AI.holdForNationTrap(st.inst[k]))) return false;
      const a = { type: 'summon', k: bait, to: me + '.avatar', payIds: pay, by: me };
      if (free) a.free = true;
      return botSend(a);
    }
    function botFinishParts() {
      return AI.finishComboParts(st, me);
    }
    function botTryFinishCombo() {
      if (level() === 'easy') return false;
      if (!AI.finishComboReady(st, me)) return false;
      const p = botFinishParts();
      const host = p.greenField;
      if (p.scratchPend && host) {
        if (botSend({ type: 'attach', k: p.scratchPend, to: host, by: me })) return true;
      }
      if (p.scratchHand && host && botMagicTypeFree('Modification')) {
        if (botSend({ type: 'playMagic', k: p.scratchHand, by: me })) return true;
      }
      if (!host && p.greenHand) {
        const c = st.inst[p.greenHand];
        const free = !!(E.freeSummonOk(st, p.greenHand));
        const cost = free ? 0 : E.effCost(st, p.greenHand);
        const pay = free ? [] : botBuildPay(p.greenHand, cost);
        if (pay != null) {
          const a = { type: 'summon', k: p.greenHand, to: me + '.avatar', payIds: pay, by: me };
          if (free) a.free = true;
          if (botSend(a)) return true;
        }
      }
      return false;
    }
    function botTryLosingLine() {
      if (level() === 'easy') return false;
      if (!AI.boardLosing(st, me)) return false;
      const p = botFinishParts();
      if (p.scratchPend && p.greenField) {
        if (botSend({ type: 'attach', k: p.scratchPend, to: p.greenField, by: me })) return true;
      }
      if (p.scratchHand && (p.greenField || p.starfruitHand) && botMagicTypeFree('Modification')) {
        if (p.greenField && botSend({ type: 'playMagic', k: p.scratchHand, by: me })) return true;
      }
      if (AI.wantedLandNeedle) {
        const need = AI.wantedLandNeedle(botArch());
        if (need && !AI.hasLandNamed(st, need) && botTryPlayMagic()) return true;
      }
      if (p.starfruitHand) {
        const c = st.inst[p.starfruitHand];
        const zone = st.zones[me + '.avatar'] || [];
        const cap = (E.avatarCap(st, me)) || 4;
        const avCount = zone.filter(k => st.inst[k] && st.inst[k].type === 'Avatar').length;
        if (c && avCount < cap) {
          const free = !!(E.freeSummonOk(st, p.starfruitHand));
          const cost = free ? 0 : E.effCost(st, p.starfruitHand);
          const pay = free ? [] : botBuildPay(p.starfruitHand, cost);
          if (pay != null) {
            const a = { type: 'summon', k: p.starfruitHand, to: me + '.avatar', payIds: pay, by: me };
            if (free) a.free = true;
            if (botSend(a)) return true;
          }
        }
      }
      return false;
    }
    function botTryMain() {
      const lv = level();
      const arch = botArch();
      // มีมอดรอสวม (ไม้เกาหลัง ฯลฯ) — สวมก่อนเพื่อให้เตะไข่ติดก่อนเข้า Battle
      const pendingMod = (st.zones[me + '.magic'] || []).some(k => {
        const c = st.inst[k];
        return c && c.subtype === 'Modification' && !c.attachedTo;
      });
      if (pendingMod && (st.zones[me + '.avatar'] || []).some(k => st.inst[k] && st.inst[k].type === 'Avatar')) {
        if (!botNationTrapHold() && botTryAttach()) return true;
      }
      // กับดักเพื่อชาติ: ลงรถถังเหยื่อ (A003) แล้วพาส — รอจั่ว / รออีกฝ่ายตี
      if (botNationTrapHold()) return false;
      if (botTryNationTrapSummon()) return true;
      // วีรชนชีวภาพ + ไม้เกาหลัง + Avatar เขียว — ลงแล้วสวมเตะไข่ปิดเกม
      if (botTryFinishCombo()) return true;
      // สู้บอร์ดไม่ได้ — ลงมะเฟืองเตะไข่ทีละ 1
      if (botTryLosingLine()) return true;
      if (lv !== 'easy' && AI.boardLosing(st, me)) {
        const hasEggBoard = (st.zones[me + '.avatar'] || []).some(k => botHasEgg(k) || /มะเฟือง/.test((st.inst[k] && st.inst[k].name) || ''));
        if (hasEggBoard && !(AI.finishComboReady(st, me)))
          return false;
      }
      // แลนด์เป้าหมายยังไม่อยู่บนสนาม — วางก่อนลงอย่างอื่น
      if (lv !== 'easy' && AI.wantedLandNeedle) {
        const need = AI.wantedLandNeedle(arch);
        if (need && !AI.hasLandNamed(st, need)) {
          if (botTryPlayMagic()) return true;
        }
      }
      // ระดับปานกลางขึ้นไป: ให้ Universal เลือกจากหลาย Candidate (ยาก = จำลองตา)
      if (lv !== 'easy') {
        const bag = [];
        botCollectMagicCands().forEach(it => { if (it.heur >= 0) bag.push(it); });
        botCollectSummonCands().forEach(it => { if (it.heur >= -20) bag.push(it); });
        botCollectActivateCands().forEach(it => bag.push(it));
        botCollectAttachCands().forEach(it => bag.push(it));
        const pick = botLookaheadPick(bag);
        if (pick && pick.a && botSend(pick.a)) return true;
      }
      const steps = (AI.mainPriority(arch, lv)) || ['attach', 'magic', 'activate', 'summon'];
      // ถ้าพร้อมเปิดเทค/เรียกจากนรก — แทรก activate ขึ้นก่อน
      if (lv !== 'easy' && AI.shouldActivateBeforeSummon(st, me, arch)) {
        if (botTryActivate()) return true;
      }
      for (const step of steps) {
        if (step === 'magic' && botTryPlayMagic()) return true;
        if (step === 'summon' && botTrySummon()) return true;
        if (step === 'activate' && botTryActivate()) return true;
        if (step === 'attach' && botTryAttach()) return true;
      }
      if (isHard() && botTryActivate()) return true;
      return false;
    }
    /** สามัคคี — นอนผู้ให้ที่เล็กที่สุด ให้ผู้รับชนะเป้าแค่ +1–2 อย่าบวกเกินจำเป็น */
    function botTryUnity() {
      const lv = level();
      if (lv === 'easy' && Math.random() < 0.55) return false;
      const mine = (st.zones[me + '.avatar'] || []).filter(k => {
        const c = st.inst[k];
        return c && c.type === 'Avatar' && c.faceUp !== false && !c.tapped && !c.cannotChangeStateUntilEOT;
      });
      if (mine.length < 2) return false;
      const donors = mine.filter(k => {
        if (!E.hasKw(st, k, 'สามัคคี')) return false;
        if (lv !== 'easy' && AI.isBodyguardCard(st.inst[k])) return false;
        return true;
      });
      if (!donors.length) return false;
      const enemies = (st.zones[foe + '.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
      const enemyCons = lv === 'easy' ? [] : (st.zones[foe + '.construct'] || []).slice();
      const oppL = botLifeInfo(foe);
      if (oppL.critical && oppL.n > 0) {
        const canFinish = mine.some(k => {
          if (eff(k) <= 0) return false;
          return enemies.length === 0 || botHasEgg(k);
        });
        if (canFinish) return false;
      }
      const defs = enemies.concat(enemyCons);
      if (!defs.length) return false;
      const pairs = [];
      for (const recv of mine) {
        const rp = eff(recv);
        for (const e of defs) {
          const dp = eff(e);
          if (rp > dp) continue;
          const cands = donors.filter(g => g !== recv).slice().sort((a, b) => eff(a) - eff(b) || botThreatScore(a) - botThreatScore(b));
          let best = null;
          for (const giver of cands) {
            const gp = eff(giver);
            const boosted = rp + gp;
            const over = boosted - dp;
            if (over < 1) continue;
            let score = 80 + botThreatScore(e) - Math.abs(over - 1.5) * 18;
            if (over <= 2) score += 45;
            else if (over <= 4) score += 8;
            else score -= 20 + (over - 4) * 8;
            if (mine.filter(k => k !== giver).length < 1) score -= 100;
            if (enemyCons.includes(e)) score -= 15;
            if (!best || over < best.over || (over === best.over && gp < best.gp))
              best = { giver, recv, score, over, gp };
            if (over <= 2) break;
          }
          if (best && best.score > 25) pairs.push(best);
        }
      }
      pairs.sort((a, b) => b.score - a.score);
      for (const p of pairs) {
        if (botSend({ type: 'unity', k: p.giver, to: p.recv, by: me })) return true;
      }
      return false;
    }
    function botTryAttack() {
      const lv = level();
      const mine = (st.zones[me + '.avatar'] || []).filter(k => {
        const c = st.inst[k];
        return c && !c.tapped && c.faceUp !== false && c.type === 'Avatar' && eff(k) > 0;
      });
      const enemies = (st.zones[foe + '.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
      const enemyCons = (st.zones[foe + '.construct'] || []).slice();
      const myL = botLifeInfo(me);
      const oppL = botLifeInfo(foe);
      const racing = oppL.down <= myL.down;
      const lethal = oppL.critical && oppL.n > 0;
      const life = oppL.target;
      if (!mine.length) return false;
      const losing = lv !== 'easy' && AI.boardLosing(st, me);
      if (botLifeHitTurn !== st.turn) { botLifeHitTurn = st.turn; botLifeHits = 0; }
      const forceLife = lv !== 'easy' && AI.canForceLifeWin
        && AI.canForceLifeWin(st, me, { lifeHitsThisTurn: botLifeHits });
      const allowLife = lv === 'easy' || forceLife || AI.shouldLifeAttack(st, me, {
        lethal, losing, lifeHitsThisTurn: botLifeHits,
      });
      // มะม่วง / ยักษ์หิน = โล่มนุษย์ กันคีย์ (ทศกัณฑ์ แตงกวา) — ห้ามบุก
      const strikers = lv === 'easy' ? mine : mine.filter(k => !AI.bodyguardStaysHome(st, me, k));
      const atkMine = (lethal && !strikers.length) ? mine : strikers;
      if (!atkMine.length) return false;

      const sortedAtk = atkMine.slice().sort((a, b) => eff(a) - eff(b) || botThreatScore(a) - botThreatScore(b));
      const sortedEn = enemies.slice().sort((a, b) => botThreatScore(b) - botThreatScore(a));
      const used = new Set();
      const assigned = new Map();
      for (const e of sortedEn) {
        const killer = sortedAtk.find(a => {
          if (used.has(a)) return false;
          const ap = eff(a), dp = eff(e);
          if (ap > dp) return true;
          if (lv !== 'easy' && ap === dp && botThreatScore(e) >= botThreatScore(a) - 5) return true;
          return false;
        });
        if (killer) { used.add(killer); assigned.set(e, killer); }
      }
      const leftover = atkMine.filter(a => !used.has(a));
      const cleared = assigned.size === enemies.length;
      const faceNow = enemies.length === 0 ? atkMine : atkMine.filter(botHasEgg);
      const canLethalNow = lethal && faceNow.length > 0;

      const plans = [];
      for (const atk of atkMine) {
        const ap = eff(atk);
        const egg = botHasEgg(atk);
        const myTh = botThreatScore(atk);
        for (const e of enemies) {
          const dp = eff(e);
          const th = botThreatScore(e);
          const isAssigned = assigned.get(e) === atk;
          if (ap > dp) {
            let score = 70 + th - ap * 0.2;
            if (isAssigned) score += 28;
            if (cleared && leftover.length && !egg) score += 32;
            if (egg && (lethal || forceLife || (racing && oppL.down <= 2))) score -= 60;
            if (losing && !myL.critical) score -= 90;
            if (myL.critical && mine.length <= 2 && !lethal && !(th > myTh + 15 || botHasEgg(e)))
              score -= 70;
            plans.push({ atk, def: e, score });
          } else if (ap === dp && lv !== 'easy') {
            let score = th - myTh + 8;
            if (th > myTh + 8) score += 35;
            if (mine.length > enemies.length + 1) score += 12;
            if (myL.critical) score -= 55;
            if (egg && (lethal || forceLife || racing)) score -= 80;
            if (score > 15) plans.push({ atk, def: e, score });
          } else if (isHard() && ap + 1 >= dp && mine.length >= 3 && enemies.length >= 2 && th > myTh + 20) {
            plans.push({ atk, def: e, score: 18 + th - myTh });
          }
        }
        if (lv !== 'easy') {
          for (const e of enemyCons) {
            const dp = eff(e);
            if (ap > dp) {
              let score = 42 + dp;
              if (egg && (lethal || forceLife || racing)) score -= 40;
              plans.push({ atk, def: e, score });
            }
          }
        }
        if (life && (enemies.length === 0 || egg) && ap > 0 && allowLife) {
          let lifeScore = 88 + Math.min(ap, 10);
          if (lethal) lifeScore = 2500 + ap;
          else if (forceLife) lifeScore = 2000 + ap;
          else {
            if (racing) lifeScore += 45;
            if (oppL.down <= 2) lifeScore += 55;
            if (oppL.down <= 1) lifeScore += 90;
            if (cleared && leftover.length > 1 && !egg) lifeScore -= 12;
            if (isHard()) lifeScore += 8;
            if (losing) lifeScore += 40;
          }
          plans.push({ atk, life, score: lifeScore });
        }
      }
      if (lv === 'easy' && !lethal && plans.some(p => p.life) && Math.random() < 0.25) {
        if (plans.every(p => p.life)) return false;
      }
      if (!plans.length) return false;
      plans.sort((a, b) => b.score - a.score);
      if (isHard() && plans.length > 1) {
        const top = plans.slice(0, 8);
        top.forEach(p => {
          const act = p.life
            ? { type: 'declareAttack', atk: p.atk, life: p.life, by: me }
            : { type: 'declareAttack', atk: p.atk, def: p.def, by: me };
          const after = botSimAction(act);
          if (after) p.score += botEval(after) * 0.28;
        });
        plans.sort((a, b) => b.score - a.score);
      }
      const ordered = (canLethalNow || forceLife)
        ? plans.filter(p => p.life).concat(plans.filter(p => !p.life))
        : plans;
      for (const p of ordered) {
        if (p.life) {
          if (botSend({ type: 'declareAttack', atk: p.atk, life: p.life, by: me })) {
            botLifeHits++;
            return true;
          }
        } else if (botSend({ type: 'declareAttack', atk: p.atk, def: p.def, by: me })) return true;
      }
      return false;
    }
    function botPickTarget(pr, cands) {
      if (!cands.length) return null;
      if (pr.thenIfExactName) {
        const hit = cands.find(k => st.inst[k] && st.inst[k].name === pr.thenIfExactName);
        if (hit) return hit;
      }
      if (!(pr.filter && pr.filter.excludeOnly)) {
        const onlyHit = cands.find(k => {
          const c = st.inst[k];
          return c && (/Only/i.test(String(c.ex || '')) || (E.effectOf && (E.effectOf(c.code, c.name) || {}).only));
        });
        if (onlyHit && (pr.autoPickOnly || pr.from === 'deckOrHell' || pr.from === 'deckOrHand' || pr.dest === 'magic')) return onlyHit;
      }
      const dest = pr.dest || '';
      const from = pr.from || '';
      const enemySide = k => E.ownerOf(st, k) === foe;
      const ownSide = k => E.ownerOf(st, k) === me;
      const arch = botArch();

      if (dest === 'storyEvolve') return U.pickEvolveTarget(st, me, cands);
      if (dest === 'hand') {
        const piece = U.evolveSearchPick(st, me, cands);
        if (piece) return piece;
      }
      if (dest === 'retargetAttack' || pr.kind === 'chooseDestroy' || dest === 'destroy' || (dest === 'hell' && from === 'enemyAvatars')
        || from === 'enemyAvatars' || (pr.side === 'enemy' && pr.kind !== 'chooseBuff')) {
        const enemies = cands.filter(enemySide).sort((a, b) => botThreatScore(b) - botThreatScore(a) || eff(b) - eff(a));
        if (enemies[0]) return enemies[0];
        // ไม่มีเป้าฝั่งศัตรู — ข้าม อย่าทำลายของตัวเอง ถ้าบังคับเลือกก็เสียใบถูกสุด
        if (pr.kind === 'chooseDestroy' && pr.side !== 'own') {
          if (pr.optional !== false) return null;
          return cands.slice().sort((a, b) => botCardVal(a) - botCardVal(b))[0];
        }
      }
      if (pr.kind === 'chooseDiscard' || dest === 'discard' || dest === 'giveHandNegate' || dest === 'giveToOpp' || from === 'ownHand') {
        return cands.slice().sort((a, b) => botCardVal(a) - botCardVal(b))[0];
      }
      if (dest === 'trojanBuffVirus') {
        return cands.filter(ownSide).sort((a, b) => eff(b) - eff(a))[0] || cands[0];
      }
      if (dest === 'sacrifice' || dest === 'sacSummon' || dest === 'bothReturn' || from === 'ownAvatars') {
        if (dest === 'attachTo' || dest === 'avatar') {
          return cands.filter(ownSide).sort((a, b) => eff(b) - eff(a))[0] || cands[0];
        }
        const srcC = pr.src && st.inst[pr.src];
        if (srcC && /มณโฑ/.test(srcC.name || '')) {
          const hellPhibek = (st.zones[me + '.hell'] || []).some(id => /พิเภก/.test((st.inst[id] && st.inst[id].name) || ''));
          if (hellPhibek && cands.includes(pr.src)) return pr.src;
        }
        return cands.filter(ownSide).sort((a, b) => {
          const ka = AI.isDeckKeyCard(st.inst[a]) ? 80 : 0;
          const kb = AI.isDeckKeyCard(st.inst[b]) ? 80 : 0;
          return (eff(a) + ka) - (eff(b) + kb) || botCardVal(a) - botCardVal(b);
        })[0] || cands[0];
      }
      // อัญเชิญ / ขึ้นมือ / คืนเด็ค — เลือกตามอาร์คไทป์
      if (dest === 'avatar' || dest === 'hand' || dest === 'scoutOtaHost' || dest === 'deck' || from === 'ownHell'
        || pr.kind === 'hellPick' || /hell/i.test(dest + from + (pr.kind || ''))) {
        if (level() === 'nightmare') {
          const sit = AI.pickBestFromIds(st, me, cands);
          if (sit) return sit;
        }
        const pick = AI.pickSummonTarget(st, me, cands, arch, dest || pr.kind);
        if (pick) return pick;
        return cands.slice().sort((a, b) => {
          const ca = st.inst[a], cb = st.inst[b];
          const pa = (ca && ca.type === 'Avatar') ? (+ca.power || 0) : -1;
          const pb = (cb && cb.type === 'Avatar') ? (+cb.power || 0) : -1;
          return pb - pa || botCardVal(b) - botCardVal(a);
        })[0];
      }
      if (pr.kind === 'chooseBuff') {
        if (pr.amt >= 0) {
          const own = cands.filter(ownSide);
          const amt = +pr.amt || 0;
          const oppAv = (st.zones[foe + '.avatar'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar');
          own.sort((a, b) => {
            const gain = k => {
              const p = eff(k);
              let g = p + amt;
              oppAv.forEach(e => {
                if (p <= eff(e) && p + amt > eff(e)) g += 55 + botThreatScore(e);
              });
              if (botHasEgg(k) || !oppAv.length) g += 22;
              return g;
            };
            return gain(b) - gain(a);
          });
          return own[0] || cands[0];
        }
        return cands.filter(enemySide).sort((a, b) => botThreatScore(b) - botThreatScore(a))[0] || cands[0];
      }
      const en = cands.filter(enemySide).sort((a, b) => eff(b) - eff(a));
      if (en[0]) return en[0];
      return cands.slice().sort((a, b) => botCardVal(b) - botCardVal(a))[0];
    }
    function botHandlePrompt(pr) {
      const cands = botPromptCands(st, pr);
      if (pr.kind === 'chooseMode' && pr.options && pr.options.length) {
        const denyFn = opt => botModeOptionDeny(pr.src, opt);
        const opt = AI.pickChooseModeIndex(st, me, pr, denyFn);
        // ลองทีละตัวเลือกที่ใช้ได้ — กันค้างเมื่อเทค 1 ใช้ไปแล้ว
        const order = [opt];
        for (let i = 0; i < pr.options.length; i++) if (i !== opt) order.push(i);
        for (const i of order) {
          if (denyFn(pr.options[i])) continue;
          if (botSend({
            type: 'chooseMode', k: pr.src, opt: i,
            label: (pr.options[i] && pr.options[i].label) || '', by: me,
          })) return;
        }
        // ทุกทางใช้ไม่ได้ — ข้ามเพื่อไม่ค้างโต๊ะ (แม้ optional=false บาง dest ยอมข้าม)
        if (!botSend({ type: 'skipPrompt', by: me })) {
          // กันลูป: มาร์คว่า prompt นี้ลองแล้ว แล้วไปต่อไม่ได้ก็รอ tick ถัดไปหลัง fail key
          botFailKeys.add('chooseMode:stuck:' + (pr.src || ''));
        }
        return;
      }
      if (pr.kind === 'react') {
        if (pr.mode === 'negateMagic' || pr.magicNegate) {
          const opts = (pr.options || []).slice();
          if (!opts.length) { botSend({ type: 'reactNo', by: me }); return; }
          const tgt = pr.target && st.inst[pr.target];
          let threat = AI.magicNegateThreat(tgt);
          if (tgt && tgt.subtype === 'React') threat += 20;
          const nationId = (st._pendingMagic && st._pendingMagic.target)
            || (st._pendingMagic && st._pendingMagic.innerPending && st._pendingMagic.innerPending.src)
            || (st._pendingMagic && st._pendingMagic.src);
          const nationC = nationId && st.inst[nationId];
          if (nationC && /เพื่อชาติ/.test(nationC.name || '')) threat += 220;
          if (tgt && /เพื่อชาติ/.test(tgt.name || '')) threat += 220;
          const lv = level();
          const need = lv === 'easy' ? 90 : isHard() ? 32 : 48;
          if (threat < need) { botSend({ type: 'reactNo', by: me }); return; }
          const tgtReact = !!(tgt && tgt.subtype === 'React');
          opts.sort((a, b) => {
            const na = /อย่าให้มีครั้งที่/.test((st.inst[a] && st.inst[a].name) || '');
            const nb = /อย่าให้มีครั้งที่/.test((st.inst[b] && st.inst[b].name) || '');
            if (tgtReact && na !== nb) return na ? -1 : 1;
            if (!tgtReact && na !== nb) return na ? 1 : -1;
            return botCardVal(a) - botCardVal(b);
          });
          for (const k of opts) {
            if (botSend({ type: 'chooseTarget', k, by: me })) return;
          }
          botSend({ type: 'reactNo', by: me });
          return;
        }
        if (pr.reactTrigger === 'enemyDeclareAttack' && st.pending && st.pending.target === me) {
          const opts = botRankCombatReacts(pr.options || []);
          if (botShouldCombatReact(st.pending) && opts.length) {
            for (const k of opts) {
              if (botSend({ type: 'chooseTarget', k, by: me })) return;
            }
          }
          botSend({ type: 'reactNo', by: me });
          return;
        }
        const pick = (pr.options && pr.options[0]) || pr.src;
        if (pick) {
          if (!botSend({ type: 'chooseTarget', k: pick, by: me }))
            botSend({ type: 'reactNo', by: me });
        } else botSend({ type: 'reactNo', by: me });
        return;
      }
      if (pr.kind === 'magicRedirect') { botSend({ type: 'magicRedirectYes', by: me }); return; }
      if (pr.kind === 'combatSurvive' || pr.kind === 'passengerReplace') {
        botSend({ type: pr.kind === 'combatSurvive' ? 'combatSurviveYes' : 'passengerReplaceYes', by: me });
        return;
      }
      if (pr.kind === 'preventLeaveExile') {
        botSend({ type: 'preventLeaveYes', by: me });
        return;
      }
      if (pr.kind === 'naraiHandForm' || pr.kind === 'milledOptional') {
        const pick = botPickTarget(pr, cands) || cands[0];
        if (pick) botSend({ type: 'chooseTarget', k: pick, by: me });
        else botSend({ type: 'skipPrompt', by: me });
        return;
      }
      if (pr.kind === 'guessReveal') {
        // ตำรวจสอดแนม: หลังเปิดโชว์ท็อปเด็ค — กดดำเนินการต่อ (ถูก=นรก+ผล / ผิด=ไว้เดิม)
        botSend({ type: 'guessRevealContinue', by: me });
        return;
      }
      if (pr.kind === 'peekTop') {
        const card = pr.card;
        const val = card ? botCardVal(card) : 0;
        const arch = botArch();
        let where = (pr.allowHell && val < 15) ? 'hell' : (val < 20 ? 'bottom' : 'top');
        // เก็บแลนด์/เอนเอเบลอร์ไว้บน
        if (card && (AI.isWantedLandCard(st.inst[card], arch) || AI.cardIsKeyEnabler(st.inst[card], arch)))
          where = 'top';
        botSend({ type: 'peekTopPlace', where, by: me });
        return;
      }
      if (pr.kind === 'handOrSummon') {
        const cid = pr.card;
        const c = cid && st.inst[cid];
        let where = (c && c.type === 'Avatar' && (+c.power || 0) >= 3) ? 'avatar' : 'hand';
        if (c && AI.cardIsKeyEnabler(c, botArch()) && c.type === 'Avatar') where = 'avatar';
        if (c && U.summonLockNeedle(c)) where = 'hand';
        botSend({ type: 'handOrSummonPick', where, by: me });
        return;
      }
      if (pr.kind === 'pickSymbol') {
        const opts = pr.symbols || pr.options || [];
        const symbol = (typeof opts[0] === 'string' ? opts[0] : (opts[0] && (opts[0].symbol || opts[0].label))) || 'สัตว์';
        botSend({ type: 'pickSymbol', symbol, by: me });
        return;
      }
      if (pr.dest === 'payRemainSummon') {
        const ranked = cands.slice().sort((a, b) => botCardVal(a) - botCardVal(b));
        const pick = ranked[0];
        if (pick) botSend({ type: 'chooseTarget', k: pick, by: me });
        else botSend({ type: 'skipPrompt', by: me });
        return;
      }
      if (pr.dest === 'sigurdReturnHell') {
        const got = pr.multiGot || 0;
        if (got >= (pr.multiMax || 3) || (got >= 1 && !cands.length)) {
          botSend({ type: 'skipPrompt', by: me });
          return;
        }
        const pick = cands[0];
        if (pick) botSend({ type: 'chooseTarget', k: pick, by: me });
        else botSend({ type: 'skipPrompt', by: me });
        return;
      }
      if (pr.dest === 'sigurdDestroyEnemy') {
        const ranked = cands.slice().sort((a, b) => eff(b) - eff(a));
        const pick = ranked[0];
        if (pick) botSend({ type: 'chooseTarget', k: pick, by: me });
        else botSend({ type: 'skipPrompt', by: me });
        return;
      }
      // โคกอีสานนูน เทค 1 ฯลฯ — คืนนรกทีละใบจนครบ (exact) / หรือข้ามเมื่อพอใจ
      if (pr.dest === 'hellMultiDeck') {
        const got = pr.multiGot || 0;
        const max = pr.multiExact != null ? pr.multiExact : (pr.multiMax || 4);
        const magicMax = pr.magicMax;
        const magicGot = pr.magicGot || 0;
        if (got >= max) {
          botSend({ type: 'skipPrompt', by: me });
          return;
        }
        const filtered = cands.filter(k => {
          const c = st.inst[k];
          if (!c) return false;
          if (magicMax != null && c.type === 'Magic' && magicGot >= magicMax) return false;
          return true;
        });
        if (!filtered.length) {
          // ครบ exact ไม่ได้ — ข้ามไม่ได้ถ้า exact (engine จะ abort / deny)
          if (pr.multiExact == null) botSend({ type: 'skipPrompt', by: me });
          else host.schedule();
          return;
        }
        // คืนใบมูลค่าต่ำก่อน · เก็บเอนเอเบลอร์/แลนด์ไว้ในนรกถ้ายังไม่จำเป็น
        const arch = botArch();
        const ranked = filtered.slice().sort((a, b) => {
          let sa = botCardVal(a), sb = botCardVal(b);
          if (AI.cardIsKeyEnabler(st.inst[a], arch) || AI.isWantedLandCard(st.inst[a], arch)) sa += 60;
          if (AI.cardIsKeyEnabler(st.inst[b], arch) || AI.isWantedLandCard(st.inst[b], arch)) sb += 60;
          return sa - sb;
        });
        if (botSend({ type: 'chooseTarget', k: ranked[0], by: me })) return;
        if (pr.multiExact == null) botSend({ type: 'skipPrompt', by: me });
        else host.schedule();
        return;
      }
      const pick = botPickTarget(pr, cands);
      if (pick) {
        if (!botSend({ type: 'chooseTarget', k: pick, by: me })) {
          // เป้าแรก fail — ลองใบอื่นก่อนค้าง
          for (const k of cands) {
            if (k === pick) continue;
            if (botSend({ type: 'chooseTarget', k, by: me })) return;
          }
          if (pr.optional !== false) botSend({ type: 'skipPrompt', by: me });
          else host.schedule();
        }
        return;
      }
      if (pr.optional !== false) botSend({ type: 'skipPrompt', by: me });
      else if (cands[0]) botSend({ type: 'chooseTarget', k: cands[0], by: me });
      else botSend({ type: 'skipPrompt', by: me });
    }
    function botMulliganIds() {
      if (level() === 'nightmare') return [];
      if (level() === 'easy') return [];
      const ids = U.mulliganIds(st, me, k => {
        const c = st.inst[k];
        if (!c || c.type !== 'Avatar') return false;
        return !!botBuildPay(k, E.effCost(st, k));
      });
      if (ids && ids.length) return ids;
      const hand = (st.zones[me + '.hand'] || []).slice();
      if (hand.length < 5) return [];
      const arch = botArch();
      const avatars = hand.filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
      const playable = avatars.filter(k => {
        const cost = E.effCost(st, k);
        return !!botBuildPay(k, cost);
      });
      const hasKey = hand.some(k => (AI.isWantedLandCard(st.inst[k], arch) || AI.cardIsKeyEnabler(st.inst[k], arch)));
      if (playable.length >= 1 && (avatars.length >= 1 || hasKey)) {
        if (isHard() && playable.length === 1 && avatars.length >= 3) {
          return hand.filter(k => avatars.includes(k) && !playable.includes(k) && (+st.inst[k].cost || 0) >= 5)
            .sort((a, b) => {
              const sa = AI.mulliganKeepScore(st, me, a, arch, false);
              const sb = AI.mulliganKeepScore(st, me, b, arch, false);
              return sa - sb;
            }).slice(0, 2);
        }
        return [];
      }
      const drop = hand.filter(k => {
        const c = st.inst[k]; if (!c) return false;
        if ((AI.isWantedLandCard(c, arch) || AI.cardIsKeyEnabler(c, arch))) return false;
        if (c.type === 'Avatar' && (+c.cost || 0) >= 6 && !playable.includes(k)) return true;
        if (c.type === 'Magic' && c.subtype === 'Modification' && !avatars.length) return true;
        if (AI.mulliganKeepScore(st, me, k, arch, playable.includes(k)) < 0) return true;
        return false;
      }).sort((a, b) => botCardVal(a) - botCardVal(b));
      return drop.slice(0, Math.min(isHard() ? 4 : 3, drop.length));
    }
    function botHandleScout() {
      const sc = st.scout;
      if (!sc || sc.p !== me) return false;
      const rest = (sc.ids || []).filter(k => st.inst[k] && !(sc.taken || []).includes(k));
      const arch = botArch();
      const keepTop = rest.some(k => (AI.isWantedLandCard(st.inst[k], arch) || AI.cardIsKeyEnabler(st.inst[k], arch)));
      if (keepTop) return botSend({ type: 'scoutEnd', where: 'top', by: me });
      const avg = rest.reduce((s, k) => s + botCardVal(k), 0) / (rest.length || 1);
      const bury = rest.length && rest.every(k => botCardVal(k) < avg * 0.7);
      return botSend({ type: 'scoutEnd', where: bury ? 'bottom' : 'top', by: me });
    }
    function botDefend() {
      const lv = level();
      const pend = st.pending;
      if (!pend || pend.target !== me) return false;
      if ((st.prompts || []).some(p => p.chooser === pend.by)) return true;
      const atkP = pend.atk ? eff(pend.atk) : 0;
      const defP = pend.def ? eff(pend.def) : 0;
      const opts = botRankCombatReacts(
        (E.attackReactOptions(st, me))
        || (E.counterOptions(st, me))
        || []
      );
      if (opts.length && botShouldCombatReact(pend)) {
        for (const k of opts) {
          if (botSend({ type: 'playMagic', k, by: me })) return true;
        }
      }
      const shields = (E.humanShieldOptions(st, me)) || [];
      const threatened = !!pend.life || (pend.def && atkP >= defP);
      if (lv !== 'easy' && shields.length && threatened && pend.def) {
        const weAlreadyWin = atkP < defP;
        if (!weAlreadyWin) {
          const defVal = botThreatScore(pend.def);
          const ranked = shields.slice().map(k => {
            const p = eff(k);
            const wins = p > atkP;
            const s = wins ? 100 + p : (18 - botThreatScore(k));
            return { k, s, wins };
          }).sort((a, b) => b.s - a.s);
          const best = ranked[0];
          if (best && (best.wins || (defVal >= 40 && botThreatScore(best.k) < defVal - 8))) {
            if (botSend({ type: 'humanShield', k: best.k, by: me })) return true;
          }
        }
      }
      return botSend({ type: 'resolveAttack', by: me });
    }
    function botTickInner() {
      if (st.turn === 1 && !st.fpDrawn && !st.awaitBattleStart) {
        const done = st.mulliganDone || {};
        if (!done[me]) {
          const fp0 = st.firstPlayer || 'A';
          if (fp0 === me || done[foe]) {
            botSend({ type: 'mulligan', p: me, ids: botMulliganIds() });
            return;
          }
        }
        // รอมือเปิดครบ — ห้ามลงการ์ดตอนนี้ (deny จะไปติด fail-key ทั้งเทิร์น 1)
        return;
      }
      if (st.awaitBattleStart || (st.turn === 1 && !st.fpDrawn)) return;
      if (st.scout && st.scout.p === me) { botHandleScout(); return; }
      if ((st.chain || []).length && st.chainPri === me) {
        botSend({ type: 'chainPass', by: me });
        return;
      }
      const pr = (st.prompts || [])[0];
      if (pr && pr.chooser === me) return botHandlePrompt(pr);
      if (pr || st._pendingMagic) return;
      if (st.pending && st.pending.target === me) { botDefend(); return; }
      if (st.pending && st.pending.by === me) return;
      if (st.active !== me) return;
      if (st.phase === 'Main') {
        if (botTryMain()) return;
        botSend({ type: 'setPhase', phase: 'Battle', by: me });
        return;
      }
      if (st.phase === 'Battle') {
        // กับดักเพื่อชาติ — อย่าบุก/สามัคคีด้วยรถถังเหยื่อ จบเทิร์นรอจั่ว
        if (botNationTrapHold()) {
          const bh = st.zones[me + '.hand'] || [];
          if (bh.length > 7) {
            const drop = bh.slice().sort((a, b) => {
              const ha = AI.holdForNationTrap(st.inst[a]) ? 500 : 0;
              const hb = AI.holdForNationTrap(st.inst[b]) ? 500 : 0;
              return (botCardVal(a) + ha) - (botCardVal(b) + hb);
            })[0];
            botSend({ type: 'move', k: drop, to: me + '.hell', by: me });
            return;
          }
          botSend({ type: 'endTurn', by: me });
          return;
        }
        // สามัคคีก่อน แล้วค่อยโจมตี (รวมตี LIFE ด้วยเตะไข่จากไม้เกาหลัง ฯลฯ)
        if (botTryUnity()) return;
        if (botTryAttack()) return;
        if (botTryEvolve()) return;
        const bh = st.zones[me + '.hand'] || [];
        if (bh.length > 7) {
          const drop = bh.slice().sort((a, b) => botCardVal(a) - botCardVal(b))[0];
          botSend({ type: 'move', k: drop, to: me + '.hell', by: me });
          return;
        }
        botSend({ type: 'endTurn', by: me });
        return;
      }
      botSend({ type: st.phase === 'End' ? 'endTurn' : 'setPhase', phase: 'Main', by: me });
    }


    return {
      tick() {
        st = host.state();
        U.useSide(me);
        botTickInner();
      },
      /** ล้างรายการ action ที่เพิ่งถูกปฏิเสธ (เริ่มเกมใหม่ / เปิดศึก / รีเซ็ตโต๊ะ) */
      reset() {
        botFailKeys = new Set();
        botFailTurn = -1;
      },
    };
  }

  function whoActs(st) {
    const pr = (st.prompts || [])[0];
    if (pr) return pr.chooser;
    if (st.scout) return st.scout.p;
    if ((st.chain || []).length) return st.chainPri;
    if (st.pending && st.pending.target) return st.pending.target;
    if (st.turn === 1 && !st.fpDrawn) {
      const first = st.firstPlayer || 'A';
      const second = first === 'A' ? 'B' : 'A';
      const done = st.mulliganDone || {};
      if (!done[first]) return first;
      if (!done[second]) return second;
    }
    return st.active;
  }

  /** บอทตัวจริงสองฝั่งเล่นกันจนจบ · opts: seed, maxSteps, maxTurns, level, levels: { A, B } */
  function playMatch(cards, decks, opts) {
    opts = opts || {};
    let seed = opts.seed != null ? opts.seed : 1;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const st = E.buildInitialState(cards, rng, decks, { strict: true });
    st.skipLethalPlead = true;
    U.beginMatch(st, { botSide: 'A' });
    U.useSide('B');
    U.beginMatch(st, { botSide: 'B' });

    const levels = opts.levels || { A: opts.level || 'normal', B: opts.level || 'normal' };
    let actionSeed = 7, denies = 0, stalls = 0, progressed = false;
    const apply = a => {
      const fx = E.applyAction(st, Object.assign({ seed: actionSeed++ }, a));
      if (fx && fx.deny) denies++;
      else progressed = true;
      return fx;
    };
    const player = side => createPlayer({
      side, level: () => levels[side], state: () => st, send: apply, schedule() { },
    });
    const players = { A: player('A'), B: player('B') };

    const maxSteps = opts.maxSteps || 900;
    const maxTurns = opts.maxTurns || 36;
    let steps = 0, idle = 0;
    while (!st.over && steps < maxSteps && (st.turn || 1) <= maxTurns) {
      steps++;
      progressed = false;
      if (st.awaitBattleStart) apply({ type: 'beginDuel', by: st.firstPlayer || 'A' });
      else players[whoActs(st)].tick();
      if (progressed) { idle = 0; continue; }
      if (++idle < 3) continue;
      /* บอทไปต่อไม่ได้ (ในเกมจริงจะค้าง) — นับไว้แล้วบังคับข้าม */
      stalls++;
      idle = 0;
      const side = whoActs(st);
      if ((st.prompts || [])[0]) apply({ type: 'skipPrompt', by: side });
      if (!progressed && st.phase === 'Main') apply({ type: 'setPhase', phase: 'Battle', by: st.active });
      if (!progressed) apply({ type: 'endTurn', by: st.active });
      if (!progressed) break;
      players.A.reset();
      players.B.reset();
    }
    const winner = (st.over && st.over.winner) || (st.over === true ? null : st.over) || null;
    return { st, winner, steps, turns: st.turn, over: !!st.over, denies, stalls };
  }

  return { createPlayer, playMatch };
});
