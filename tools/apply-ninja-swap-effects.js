/* นินจา hand-swap loop — เติม engine ops + effects BT09/BT10/BT11 + rebuild effects-all */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function patchEngine(src) {
  let s = src.replace(/\r\n/g, '\n');
  if (s.includes('bounceOwnThenSummonSelf')) {
    console.log('skip already: engine already has ninja ops');
    return src;
  }
  const ins = (needle, insert, label) => {
    if (s.includes(insert.trim().slice(0, 40))) {
      console.log('skip already:', label);
      return;
    }
    if (!s.includes(needle)) throw new Error('needle missing: ' + label);
    s = s.replace(needle, needle + insert);
    console.log('patched:', label);
  };
  const repl = (from, to, label) => {
    if (!s.includes(from)) throw new Error('replace missing: ' + label + ' :: ' + JSON.stringify(from.slice(0, 80)));
    s = s.replace(from, to);
    console.log('replaced:', label);
  };

  // 1) bySelfAbility gate on summoned
  repl(
    `if (ab.trigger && ab.trigger.if === 'paidCost' && !opts.paidCost) return;\n      if (ab.trigger && ab.trigger.if === 'paidExact' && !opts.paidExact) return;`,
    `if (ab.trigger && ab.trigger.if === 'paidCost' && !opts.paidCost) return;\n      if (ab.trigger && ab.trigger.if === 'paidExact' && !opts.paidExact) return;\n      if (ab.trigger && ab.trigger.if === 'bySelfAbility' && !opts.bySelfAbility) return;`,
    'bySelfAbility gate'
  );

  // 2) summonSelfFromHandFree → pass bySelfAbility
  repl(
    `if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false });`,
    `if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false, bySelfAbility: !!ac.bySelfAbility });`,
    'summonSelfFromHandFree bySelfAbility'
  );

  // 3) bounceOwnThenSummonSelf + summonSelfFromDark + oppHellPick + grantSelfAbilities after summonSelfFromHandFree block
  const afterSummonFree = `            if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false, bySelfAbility: !!ac.bySelfAbility });
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'naraiFormSummon') {`;
  const newOps = `            if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false, bySelfAbility: !!ac.bySelfAbility });
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'bounceOwnThenSummonSelf') {
        /* นินจา: เด้ง Avatar ฝ่ายเรา N ใบขึ้นมือ แล้วอัญเชิญตัวเองจากมือ (bySelfAbility) */
        const need = ac.count || 1;
        const filter = Object.assign({ type: 'Avatar' }, ac.filter || {});
        const cands = (st.zones[ctx.owner + '.avatar'] || []).filter(id => matchFilterEx(st, id, filter));
        if (cands.length < need) {
          addLog(st, 'S', \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: ต้องมี Avatar ตรงเงื่อนไข ≥ \${need} ใบบนสนาม (มี \${cands.length})\`);
        } else {
          st.prompts.push({
            kind: 'pick', from: 'ids', ids: cands.slice(), src: ctx.src, chooser: ctx.owner,
            filter, dest: 'ninjaBounceSummon', multiExact: need, multiGot: 0,
            optional: false, allowAnyZone: true, bySelfAbility: true
          });
          prompted = true;
          addLog(st, ctx.owner, \`สั่งใช้จากมือ \${nameOf(st, ctx.src)}: เลือก Avatar \${need} ใบนำขึ้นมือ แล้วอัญเชิญตัวเอง\`);
        }
      } else if (ac.op === 'summonSelfFromDark') {
        const c = st.inst[ctx.src];
        const z = zoneOf(st, ctx.src) || '';
        if (!c || !z.endsWith('.dark')) addLog(st, 'S', \`อัญเชิญจากมิติมืดไม่ได้\`);
        else {
          const qd = quotaDeny(st, ctx.owner + '.avatar', c);
          if (qd) addLog(st, 'S', \`ลงสนามไม่ได้ (\${qd})\`);
          else {
            doMove(st, ctx.src, ctx.owner + '.avatar', null, fx);
            addLog(st, ctx.owner, \`อัญเชิญ \${c.name} จากมิติมืด\`);
            if (!ac.noJuti) triggerSummon(st, fx, ctx.src, ctx.owner, { paidCost: false, bySelfAbility: !!ac.bySelfAbility });
            fx.snd = 'place';
          }
        }
      } else if (ac.op === 'grantSelfAbilities') {
        const c = st.inst[ctx.src];
        if (c && (ac.abilities || []).length) {
          c.granted = (c.granted || []).concat(JSON.parse(JSON.stringify(ac.abilities)));
          addLog(st, ctx.owner, \`\${c.name} ได้รับความสามารถเพิ่ม\`);
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
          addLog(st, ctx.owner, \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: เลือก Magic/Modification จากนรกฝ่ายตรงข้ามขึ้นมือ\`);
        } else addLog(st, 'S', \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: ไม่มีการ์ดตรงเงื่อนไขในนรกฝ่ายตรงข้าม\`);
      } else if (ac.op === 'naraiFormSummon') {`;
  if (!s.includes("ac.op === 'bounceOwnThenSummonSelf'")) {
    if (!s.includes(afterSummonFree)) throw new Error('summonSelf block anchor missing');
    s = s.replace(afterSummonFree, newOps);
    console.log('patched: bounceOwnThenSummonSelf ops');
  } else console.log('skip already: bounceOwnThenSummonSelf ops');

  // 4) ninjaBounceSummon + oppHellToHandThenDiscard + exileThenReturnEnd dest handlers after bounceHand
  const bounceBlock = `          } else if (p.dest === 'bounceHand') {
            const own = ownerOf(st, a.k);
            const handOwner = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'move', to: handOwner + '.hand', who: handOwner, k: a.k
              })) {
              // ไพรมอลกันเด้ง — เวทต้นทางลงนรกได้ตาม srcToHell ด้านล่าง
              addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: เลือก \${nameOf(st, a.k)} ขึ้นมือ — รอกันออกสนาม\`);
            } else {
              doMove(st, a.k, handOwner + '.hand', null, fx);
              addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: นำ \${nameOf(st, a.k)} ขึ้นมือ\`);
            }
          } else if (p.dest === 'handOrSummon') {`;
  const bouncePlus = `          } else if (p.dest === 'bounceHand') {
            const own = ownerOf(st, a.k);
            const handOwner = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'move', to: handOwner + '.hand', who: handOwner, k: a.k
              })) {
              // ไพรมอลกันเด้ง — เวทต้นทางลงนรกได้ตาม srcToHell ด้านล่าง
              addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: เลือก \${nameOf(st, a.k)} ขึ้นมือ — รอกันออกสนาม\`);
            } else {
              doMove(st, a.k, handOwner + '.hand', null, fx);
              addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: นำ \${nameOf(st, a.k)} ขึ้นมือ\`);
              if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
            }
          } else if (p.dest === 'ninjaBounceSummon') {
            const own = ownerOf(st, a.k);
            const handOwner = own === 'S' ? p.chooser : own;
            if ((zoneOf(st, a.k) || '').endsWith('.avatar')
              && offerPreventLeave(st, fx, a.k, {
                type: 'move', to: handOwner + '.hand', who: handOwner, k: a.k
              })) {
              addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: เลือก \${nameOf(st, a.k)} ขึ้นมือ — รอกันออกสนาม\`);
            } else {
              doMove(st, a.k, handOwner + '.hand', null, fx);
              p.multiGot = (p.multiGot || 0) + 1;
              addLog(st, p.chooser, \`นำ \${nameOf(st, a.k)} ขึ้นมือ (\${p.multiGot}/\${p.multiExact || 1})\`);
              const left = (p.ids || []).filter(x => x !== a.k && (zoneOf(st, x) || '').endsWith('.avatar'));
              p.ids = left;
              if ((p.multiGot || 0) < (p.multiExact || 1) && left.length) {
                st.prompts.unshift(Object.assign({}, p, { optional: false }));
                addLog(st, p.chooser, \`เลือก Avatar เพิ่มให้ครบ \${p.multiExact}\`);
              } else {
                const form = p.src;
                if (st.inst[form] && (zoneOf(st, form) || '').endsWith('.hand')) {
                  const qd = quotaDeny(st, p.chooser + '.avatar', st.inst[form]);
                  if (qd) addLog(st, 'S', \`ลงสนามไม่ได้ (\${qd})\`);
                  else {
                    doMove(st, form, p.chooser + '.avatar', null, fx);
                    addLog(st, p.chooser, \`อัญเชิญ \${nameOf(st, form)} จากมือ (สลับนินจา)\`);
                    triggerSummon(st, fx, form, p.chooser, { paidCost: false, bySelfAbility: p.bySelfAbility !== false });
                    fx.snd = 'place';
                  }
                } else addLog(st, 'S', \`อัญเชิญจากมือไม่ได้ — การ์ดไม่อยู่ในมือ\`);
              }
            }
          } else if (p.dest === 'oppHellToHandThenDiscard') {
            doMove(st, a.k, p.chooser + '.hand', null, fx);
            addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: นำ \${nameOf(st, a.k)} จากนรกฝ่ายตรงข้ามขึ้นมือ\`);
            const need = p.thenDiscard != null ? p.thenDiscard : 1;
            if (need > 0) {
              const hand = (st.zones[p.chooser + '.hand'] || []).filter(id => id !== p.src);
              if (hand.length < need) addLog(st, 'S', \`มือไม่พอทิ้ง \${need} ใบ\`);
              else {
                st.prompts.unshift({
                  kind: 'chooseDiscard', src: p.src, chooser: p.chooser, filter: {},
                  excludeIds: [], discardNeed: need, discardGot: 0, actions: [], effectDiscard: true
                });
                addLog(st, p.chooser, \`ทิ้งมือ \${need} ใบ\`);
              }
            }
            fx.snd = 'draw';
          } else if (p.dest === 'exileThenReturnEnd') {
            const fled = !!(st.pending && st.pending.def === a.k);
            doMove(st, a.k, p.chooser + '.dark', null, fx);
            addLog(st, p.chooser, \`เนรเทศ \${nameOf(st, a.k)} ลงมิติมืด — จะกลับสนามช่วง End Phase\`);
            st.scheduled.push({
              player: p.chooser, when: 'ownEndPhase',
              op: 'runActions', src: a.k,
              actions: [{ op: 'summonSelfFromDark', noJuti: true }]
            });
            if (fled) {
              addLog(st, 'S', \`การโจมตียกเลิก — \${nameOf(st, a.k)} หนีเข้ามิติมืด\`);
              st.pending = null;
              clearCombatBuffs(st);
            }
            fx.snd = 'tap';
          } else if (p.dest === 'handOrSummon') {`;
  if (!s.includes("p.dest === 'ninjaBounceSummon'")) {
    if (!s.includes(bounceBlock)) throw new Error('bounceHand block missing');
    s = s.replace(bounceBlock, bouncePlus);
    console.log('patched: ninjaBounceSummon dest');
  } else console.log('skip already: ninjaBounceSummon dest');

  // 5) activatedFromHand: oncePerTurn + anyMain + battle if face-up life
  const oldHandGate = `          const lethalOk = !!(abH.requirePendingLethal && st.pendingLethal && st.pendingLethal.target === ownerH);
          if (abH.requirePendingLethal && !lethalOk)
            return deny(\`ใช้ "\${c.name}" ได้เมื่อถูกประกาศท่าปิดเกมขณะสาหัสเท่านั้น\`);
          if (!lethalOk) {
            if (st.active !== ownerH) return deny('สั่งใช้ได้ในเทิร์นของคุณเท่านั้น');
            if (st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะ Main Phase');
          }`;
  const newHandGate = `          const lethalOk = !!(abH.requirePendingLethal && st.pendingLethal && st.pendingLethal.target === ownerH);
          if (abH.requirePendingLethal && !lethalOk)
            return deny(\`ใช้ "\${c.name}" ได้เมื่อถูกประกาศท่าปิดเกมขณะสาหัสเท่านั้น\`);
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
                  return deny(\`Main Phase หรือ Battle Phase เมื่อ LIFE หงาย ≥ \${abH.allowBattleIfFaceUpLifeMin} (ตอนนี้ \${faceUpLife})\`);
                return deny('สั่งใช้ได้เฉพาะ Main Phase');
              }
            }
          }
          if (abH.oncePerTurn || abH.oncePerTurnByName) {
            const onceKey = abH.oncePerTurnByName
              ? ('name:' + abH.oncePerTurnByName)
              : a.k;
            if (!claimOncePerTurn(st, onceKey, 'activatedFromHand'))
              return deny(\`"\${c.name}" ใช้ความสามารถชื่อนี้ไปแล้วในเทิร์นนี้\`);
          }`;
  if (!s.includes('allowBattleIfFaceUpLifeMin')) {
    if (!s.includes(oldHandGate)) throw new Error('hand gate missing');
    s = s.replace(oldHandGate, newHandGate);
    console.log('patched: activatedFromHand gates');
  } else console.log('skip already: activatedFromHand gates');

  // 6) Fire attacker lifeRevealedByAttack (Goemon grant)
  const lifeReveal = `      abilitiesOf(L.code, 'lifeRevealedByAttack', L.name).forEach(ab => (ab.actions || []).forEach(ac => {`;
  const lifeReveal2 = `      // โกเอมอน ฯลฯ: ความสามารถของผู้โจมตีเมื่อหงาย LIFE
      abil(st, atkId, 'lifeRevealedByAttack').forEach(ab => {
        runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random, lifeCard: target });
      });
      abilitiesOf(L.code, 'lifeRevealedByAttack', L.name).forEach(ab => (ab.actions || []).forEach(ac => {`;
  if (!s.includes('โกเอมอน ฯลฯ: ความสามารถของผู้โจมตีเมื่อหงาย LIFE')) {
    if (!s.includes(lifeReveal)) throw new Error('life reveal anchor missing');
    s = s.replace(lifeReveal, lifeReveal2);
    console.log('patched: attacker lifeRevealedByAttack');
  } else console.log('skip already: attacker lifeRevealedByAttack');

  // 7) discardGemSum default gemMin:1
  repl(
    `} else if (costOp.op === 'discardGemSum') {
        st.prompts.push({ kind: 'chooseDiscard', src: srcK, chooser: owner, gemSumMin: costOp.min || 3, gemGot: 0, actions, effectDiscard: true });
        addLog(st, owner, \`ทิ้งมือรวม GEM ≥ \${costOp.min || 3}\`);`,
    `} else if (costOp.op === 'discardGemSum') {
        st.prompts.push({ kind: 'chooseDiscard', src: srcK, chooser: owner, filter: { gemMin: 1 }, excludeIds: [srcK], gemSumMin: costOp.min || 3, gemGot: 0, actions, effectDiscard: true });
        addLog(st, owner, \`ทิ้งมือรวม GEM ≥ \${costOp.min || 3} (ห้ามทิ้งใบไม่มี GEM)\`);`,
    'discardGemSum gemMin'
  );

  // 8) requireOnlyNameIncludes on playMagic (after oncePerTurnCard check)
  const playMagicOnce = `        if (oncePerTurnCardBlocked(st, a.k, owner))
          return deny('ใช้ใบนี้ครบ 1 ครั้งแล้วในเทิร์นนี้');
        {
          const eOnce = fxCard(c);
          if (eOnce && eOnce.oncePerTurnCard) markOncePerTurnCard(st, owner, c.name || c.code);
        }`;
  const playMagicOnly = `        if (oncePerTurnCardBlocked(st, a.k, owner))
          return deny('ใช้ใบนี้ครบ 1 ครั้งแล้วในเทิร์นนี้');
        {
          const eOnce = fxCard(c);
          if (eOnce && eOnce.oncePerTurnCard) markOncePerTurnCard(st, owner, c.name || c.code);
        }
        {
          const abOnly = abilitiesOf(c.code, 'activated', c.name)[0] || abilitiesOf(c.code, 'playMagic', c.name)[0];
          const needle = (abOnly && abOnly.requireOnlyNameIncludes) || (fxCard(c) && fxCard(c).requireOnlyNameIncludes);
          if (needle) {
            const avs = st.zones[owner + '.avatar'] || [];
            if (!avs.length || avs.some(id => !nameMatches(st.inst[id], needle)))
              return deny(\`ใช้ไม่ได้ — Avatar Zone ต้องมีเพียง "\${needle}" เท่านั้น\`);
          }
        }`;
  if (!s.includes('requireOnlyNameIncludes)')) {
    if (!s.includes(playMagicOnce)) throw new Error('playMagic once anchor missing');
    s = s.replace(playMagicOnce, playMagicOnly);
    console.log('patched: requireOnlyNameIncludes');
  } else console.log('skip already: requireOnlyNameIncludes');

  // 9) ownAvatarLeftField — fire from doMove when avatar leaves
  const doMoveFace = `    // หงายเมื่อเข้าโซนที่ต้องเห็นหน้า (มือ/สนาม/นรก/มืด) — เด็ค+LIFE คงสถานะคว่ำได้
    if (to.endsWith('.hand') || to.endsWith('.avatar') || to.endsWith('.magic')
      || to.endsWith('.construct') || to === 'land' || to.endsWith('.hell') || to.endsWith('.dark')) {
      st.inst[k].faceUp = true;
      delete st.inst[k]._heimdallReveal;`;
  const doMoveLeft = `    // รัททาทุย นินจา ฯลฯ: Avatar ฝ่ายเราออกจากสนาม → เสนอสั่งใช้จากมือ
    if (from.endsWith('.avatar') && !to.endsWith('.avatar') && (from[0] === 'A' || from[0] === 'B')) {
      try {
        offerOwnAvatarLeftField(st, fx || {}, k, from[0], st.inst[k]);
      } catch (e) { /* ignore if helper not ready mid-patch */ }
    }
    // หงายเมื่อเข้าโซนที่ต้องเห็นหน้า (มือ/สนาม/นรก/มืด) — เด็ค+LIFE คงสถานะคว่ำได้
    if (to.endsWith('.hand') || to.endsWith('.avatar') || to.endsWith('.magic')
      || to.endsWith('.construct') || to === 'land' || to.endsWith('.hell') || to.endsWith('.dark')) {
      st.inst[k].faceUp = true;
      delete st.inst[k]._heimdallReveal;`;
  if (!s.includes('offerOwnAvatarLeftField(st, fx')) {
    if (!s.includes(doMoveFace)) throw new Error('doMove face anchor missing');
    s = s.replace(doMoveFace, doMoveLeft);
    console.log('patched: doMove left-field hook');
  } else console.log('skip already: doMove left-field hook');

  // 10) Helper offerOwnAvatarLeftField near offerPreventLeave / after destroyCard helpers
  const helperAnchor = `  function offerPreventLeave(st, fx, k, resume) {`;
  const helper = `  function offerOwnAvatarLeftField(st, fx, leftK, side, leftCard) {
    if (!leftCard || st._suppressLeftField) return;
    const nm = leftCard.name || '';
    const isNinja = nameMatches(leftCard, 'นินจา') || nm.includes('นินจา');
    const syms = (() => { try { return cardSymbols(st, leftK); } catch (e) { return leftCard.symbol ? [leftCard.symbol] : []; } })();
    const isRatt = syms.includes('รัททาทุย') || nm.includes('รัททาทุย');
    if (!isNinja && !isRatt) return;
    const options = (st.zones[side + '.hand'] || []).filter(id => {
      if (id === leftK) return false;
      const c = st.inst[id]; if (!c) return false;
      return abilitiesOf(c.code, 'ownAvatarLeftField', c.name).length > 0;
    });
    if (!options.length) return;
    if ((st.prompts || []).some(p => p.kind === 'react' && p.reactTrigger === 'ownAvatarLeftField' && p.chooser === side)) return;
    const rab = abilitiesOf(st.inst[options[0]].code, 'ownAvatarLeftField', st.inst[options[0]].name)[0];
    st.prompts = st.prompts || [];
    st.prompts.push({
      kind: 'react', mode: 'runActions', src: null, options, chooser: side, target: leftK,
      actions: (rab && rab.actions) || [], reactTrigger: 'ownAvatarLeftField',
      label: \`\${nm} ออกจากสนาม\`, optional: true,
      costFromAbility: true
    });
    addLog(st, side, \`สั่งใช้พร้อม (\${options.length} ใบ): \${nm} ออกจากสนาม — เลือกใบหรือไม่ใช้\`);
  }
  function offerPreventLeave(st, fx, k, resume) {`;
  if (!s.includes('function offerOwnAvatarLeftField')) {
    if (!s.includes(helperAnchor)) throw new Error('offerPreventLeave anchor missing');
    s = s.replace(helperAnchor, helper);
    console.log('patched: offerOwnAvatarLeftField helper');
  } else console.log('skip already: offerOwnAvatarLeftField helper');

  // 11) When reacting to ownAvatarLeftField, pay cost then summon — handle in react choose like activatedFromHand
  // Patch react handler when mode runActions + reactTrigger ownAvatarLeftField to use ability cost
  const reactRun = `            } else if (p.actions && p.actions.length) {
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
            } else {
              const tgt = st.inst[p.target];
              if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', \`เอฟเฟกต์ \${m.name}: ทำลาย \${tgt.name} — ส่งนรกแล้ว\`);
                destroyCard(st, fx, p.target);
              }
            }
            doMove(st, p.src, p.chooser + '.hell', null, fx);`;
  const reactRun2 = `            } else if (p.reactTrigger === 'ownAvatarLeftField') {
              const abLF = abilitiesOf(m.code, 'ownAvatarLeftField', m.name)[0];
              const acts = (abLF && abLF.actions) || p.actions || [];
              const costList = normalizeAbilityCost(abLF && abLF.cost) || (Array.isArray(abLF && abLF.cost) ? abLF.cost : []);
              if (costList.length) payCostAndRunActivated(st, fx, p.chooser, p.src, costList, acts, rng);
              else runActions(st, fx, acts, { src: p.src, owner: p.chooser, target: p.target, rng });
              // ไม่ทิ้งลงนรก — อัญเชิญจากมือ
            } else if (p.actions && p.actions.length) {
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
              doMove(st, p.src, p.chooser + '.hell', null, fx);
            } else {
              const tgt = st.inst[p.target];
              if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', \`เอฟเฟกต์ \${m.name}: ทำลาย \${tgt.name} — ส่งนรกแล้ว\`);
                destroyCard(st, fx, p.target);
              }
              doMove(st, p.src, p.chooser + '.hell', null, fx);
            }
            if (p.reactTrigger !== 'ownAvatarLeftField' && false) doMove(st, p.src, p.chooser + '.hell', null, fx);`;
  // The react block structure is tricky - let me be more careful
  // Actually looking at the original - doMove to hell always happens after. For left field we must NOT move to hell.
  if (!s.includes("p.reactTrigger === 'ownAvatarLeftField'")) {
    // Find a safer unique string around the react completion
    const reactMarker = `            } else if (p.actions && p.actions.length) {
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
            } else {
              const tgt = st.inst[p.target];
              if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', \`เอฟเฟกต์ \${m.name}: ทำลาย \${tgt.name} — ส่งนรกแล้ว\`);
                destroyCard(st, fx, p.target);
              }
            }
            doMove(st, p.src, p.chooser + '.hell', null, fx);
            if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
            fx.snd = 'clash';`;
    const reactMarker2 = `            } else if (p.reactTrigger === 'ownAvatarLeftField') {
              const abLF = abilitiesOf(m.code, 'ownAvatarLeftField', m.name)[0];
              const acts = (abLF && abLF.actions) || p.actions || [];
              const costList = normalizeAbilityCost(abLF && abLF.cost) || (Array.isArray(abLF && abLF.cost) ? abLF.cost : []);
              addLog(st, p.chooser, \`สั่งใช้จากมือ \${m.name} (เมื่อ Avatar ออกจากสนาม)\`);
              if (costList.length) payCostAndRunActivated(st, fx, p.chooser, p.src, costList, acts, rng);
              else runActions(st, fx, acts, { src: p.src, owner: p.chooser, target: p.target, rng });
              fx.snd = 'place';
            } else if (p.actions && p.actions.length) {
              runActions(st, fx, p.actions, { src: p.src, owner: p.chooser, target: p.target, triggerSource: p.target, rng: rng });
              doMove(st, p.src, p.chooser + '.hell', null, fx);
              if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
              fx.snd = 'clash';
            } else {
              const tgt = st.inst[p.target];
              if (tgt && (zoneOf(st, p.target) || '').endsWith('.avatar')) {
                addLog(st, 'S', \`เอฟเฟกต์ \${m.name}: ทำลาย \${tgt.name} — ส่งนรกแล้ว\`);
                destroyCard(st, fx, p.target);
              }
              doMove(st, p.src, p.chooser + '.hell', null, fx);
              if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
              fx.snd = 'clash';
            }
            if (p.reactTrigger === 'ownAvatarLeftField') { /* stay in hand until summon */ }
            else if (false) {
            doMove(st, p.src, p.chooser + '.hell', null, fx);
            if (pendingSummon) resumePendingSummon(st, fx, pendingSummon);
            fx.snd = 'clash';
            }`;
    if (!s.includes(reactMarker)) throw new Error('react marker missing');
    s = s.replace(reactMarker, reactMarker2);
    console.log('patched: ownAvatarLeftField react pay');
  } else console.log('skip already: ownAvatarLeftField react');

  return s;
}

const GOEMON_GRANT = [{
  trigger: { on: 'lifeRevealedByAttack' },
  actions: [{
    op: 'oppHellPick',
    filter: { type: 'Magic', subtypes: ['Normal', 'Modification'] },
    optional: true,
    thenDiscard: 1
  }]
}];

const effects = {
  'BT10-004': {
    code: 'BT10-004',
    name: 'โกเอมอน นินจาจอมโจร',
    parseStatus: 'manual',
    abilities: [
      {
        trigger: { on: 'activatedFromHand' },
        oncePerTurnByName: 'โกเอมอน นินจาจอมโจร',
        allowBattleIfFaceUpLifeMin: 3,
        actions: [{
          op: 'bounceOwnThenSummonSelf',
          count: 2,
          filter: {
            type: 'Avatar',
            nameIncludes: ['นินจา'],
            nameNotEquals: 'โกเอมอน นินจาจอมโจร'
          }
        }]
      },
      {
        trigger: { on: 'summoned', if: 'bySelfAbility' },
        actions: [{ op: 'grantSelfAbilities', abilities: GOEMON_GRANT }]
      }
    ]
  },
  'BT10-005': {
    code: 'BT10-005',
    name: 'ฮันโซ นินจาในตำนาน',
    parseStatus: 'manual',
    abilities: [
      {
        keyword: 'จุติ',
        trigger: { on: 'summoned', if: 'paidCost' },
        actions: [{
          op: 'deckPick',
          filter: { nameIncludes: ['วิชานินจา'] },
          dest: 'hand',
          shuffleAfter: true
        }]
      },
      {
        trigger: { on: 'activatedFromHand' },
        oncePerTurnByName: 'ฮันโซ นินจาในตำนาน',
        actions: [{
          op: 'bounceOwnThenSummonSelf',
          count: 1,
          filter: {
            type: 'Avatar',
            nameIncludes: ['นินจา'],
            nameNotEquals: 'ฮันโซ นินจาในตำนาน'
          }
        }]
      },
      {
        trigger: { on: 'summoned', if: 'bySelfAbility' },
        actions: [{
          op: 'grantKeyword',
          keyword: 'เตะไข่',
          until: 'endOfTurn',
          filter: { type: 'Avatar', nameIncludes: ['นินจา'] }
        }]
      }
    ]
  },
  'BT10-006': {
    code: 'BT10-006',
    name: 'ชิโยเมะ นินจาสาว',
    parseStatus: 'manual',
    abilities: [
      {
        trigger: { on: 'activatedFromHand' },
        oncePerTurnByName: 'ชิโยเมะ นินจาสาว',
        anyPlayerMainPhase: true,
        actions: [{
          op: 'bounceOwnThenSummonSelf',
          count: 1,
          filter: {
            type: 'Avatar',
            nameIncludes: ['นินจา'],
            nameNotEquals: 'ชิโยเมะ นินจาสาว'
          }
        }]
      },
      {
        trigger: { on: 'summoned', if: 'bySelfAbility' },
        actions: [{
          op: 'modifyPower',
          amount: -3,
          duration: 'endOfTurn',
          layer: 4,
          target: { select: 'choose', type: 'Avatar', side: 'enemy', count: 1 }
        }]
      }
    ]
  },
  'BT10-065': {
    code: 'BT10-065',
    name: 'วิชานินจา รุกรับพลิกผัน',
    parseStatus: 'manual',
    reactAnyWindow: true,
    abilities: [
      {
        keyword: 'React',
        trigger: { on: 'activated' },
        requireOnlyNameIncludes: 'นินจา',
        actions: [{
          op: 'chooseMode',
          options: [
            {
              label: 'นินจาที่เลือกได้เตะไข่จนจบเทิร์น',
              actions: [{
                op: 'grantKeyword',
                keyword: 'เตะไข่',
                until: 'endOfTurn',
                filter: { type: 'Avatar', nameIncludes: ['นินจา'] }
              }]
            },
            {
              label: 'เนรเทศนินจาที่เลือก แล้วคืนช่วง End Phase',
              actions: [{
                op: 'pick',
                from: 'own',
                required: true,
                filter: { type: 'Avatar', nameIncludes: ['นินจา'] },
                dest: 'exileThenReturnEnd'
              }]
            }
          ]
        }]
      }
    ]
  },
  'BT11-010': {
    code: 'BT11-010',
    name: 'ฟูมะ นินจาแห่งสายลม',
    parseStatus: 'manual',
    abilities: [
      {
        trigger: { on: 'activatedFromHand' },
        oncePerTurnByName: 'ฟูมะ นินจาแห่งสายลม',
        actions: [{
          op: 'bounceOwnThenSummonSelf',
          count: 1,
          filter: {
            type: 'Avatar',
            nameIncludes: ['นินจา'],
            nameNotEquals: 'ฟูมะ นินจาแห่งสายลม'
          }
        }]
      },
      {
        trigger: { on: 'summoned', if: 'bySelfAbility' },
        actions: [
          {
            op: 'modifyPower',
            amount: 3,
            duration: 'permanent',
            target: { select: 'self' }
          },
          {
            op: 'schedule',
            when: 'ownEndPhase',
            actions: [
              { op: 'exileSelf' },
              {
                op: 'schedule',
                when: 'nextOwnMainPhase',
                actions: [{ op: 'summonSelfFromDark', noJuti: true }]
              }
            ]
          }
        ]
      }
    ]
  },
  'BT09-016': {
    code: 'BT09-016',
    name: 'รัททาทุย นินจา',
    parseStatus: 'manual',
    abilities: [
      {
        trigger: { on: 'ownAvatarLeftField' },
        cost: { discardGemSum: 3 },
        actions: [
          { op: 'summonSelfFromHandFree', noJuti: true, bySelfAbility: false }
        ]
      }
    ]
  }
};

function upsertCard(file, code, data) {
  const fp = path.join(ROOT, 'data', file);
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const list = j.cards || j;
  const i = list.findIndex(c => c.code === code);
  if (i < 0) throw new Error(code + ' not in ' + file);
  list[i] = Object.assign({}, list[i], data);
  fs.writeFileSync(fp, JSON.stringify(j, null, 2) + '\n');
  console.log('updated', file, code);
}

// Patch engine
const engPath = path.join(ROOT, 'js', 'engine.js');
let eng = fs.readFileSync(engPath, 'utf8');
eng = patchEngine(eng);
fs.writeFileSync(engPath, eng);
console.log('wrote js/engine.js', eng.length);

// Effects
upsertCard('effects-bt10.json', 'BT10-004', effects['BT10-004']);
upsertCard('effects-bt10.json', 'BT10-005', effects['BT10-005']);
upsertCard('effects-bt10.json', 'BT10-006', effects['BT10-006']);
upsertCard('effects-bt10.json', 'BT10-065', effects['BT10-065']);
upsertCard('effects-bt11.json', 'BT11-010', effects['BT11-010']);
upsertCard('effects-bt09.json', 'BT09-016', effects['BT09-016']);

// Rebuild effects-all (first wins per code from set files)
const sets = [
  'sd01','sd02','sd03','sd04','sd05','sd06','sd07','sd08',
  'kd01','kd02','kd03','kd04',
  'bt01','bt02','bt03','bt04','bt05','bt06','bt07','bt08','bt09','bt10','bt11',
  'cc01','cc02','sl02'
];
const seen = new Set();
const merged = [];
for (const ser of sets) {
  const fp = path.join(ROOT, 'data', 'effects-' + ser + '.json');
  if (!fs.existsSync(fp)) continue;
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  for (const c of (j.cards || [])) {
    if (seen.has(c.code)) continue;
    seen.add(c.code);
    merged.push(c);
  }
}
fs.writeFileSync(path.join(ROOT, 'data', 'effects-all.json'), JSON.stringify({ cards: merged }));
console.log('effects-all', merged.length);

// Sanity: load engine and check ops parse
try {
  const BoT = require(engPath);
  console.log('engine load ok', typeof BoT.loadEffects);
  BoT.loadEffects([{ cards: merged }]);
  for (const code of Object.keys(effects)) {
    const e = BoT.effectOf(code);
    console.log(code, 'abilities', (e && e.abilities && e.abilities.length) || 0);
  }
} catch (e) {
  console.error('engine sanity failed', e.message);
  process.exitCode = 1;
}
