/* Inject Isan/Police ops into js/engine.js */
const fs = require('fs');
const path = require('path');
const engPath = path.join(__dirname, '..', 'js', 'engine.js');
let s = fs.readFileSync(engPath, 'utf8');

if (s.includes("ac.op === 'guessOppTopType'")) {
  console.log('ops already injected');
} else {
  const marker = "} else if (ac.op === 'scoutOppTop') {";
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('scoutOppTop marker not found');

  const insert = `} else if (ac.op === 'guessOppTopType') {
        const types = ac.types || ['Avatar', 'Magic', 'Construct', 'Life'];
        const options = types.map(t => ({
          label: 'ประกาศ: ' + t,
          actions: [{ op: 'resolveGuessOppTop', declareType: t, onHit: ac.onHit || [], onMiss: ac.onMiss || [] }]
        }));
        st.prompts.push({ kind: 'chooseMode', src: ctx.src, chooser: ctx.owner, optional: false, options });
        prompted = true;
        addLog(st, ctx.owner, \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: ประกาศประเภทใบบนสุดเด็คฝ่ายตรงข้าม\`);
      } else if (ac.op === 'resolveGuessOppTop') {
        const opp = other(ctx.owner);
        const d = st.zones[opp + '.deck'] || [];
        if (!d.length) addLog(st, 'S', 'เด็คฝ่ายตรงข้ามว่าง — สอดแนมไม่ได้');
        else {
          const top = d[d.length - 1];
          const tc = st.inst[top];
          const hit = (tc.type || '') === ac.declareType;
          tc.faceUp = true;
          addLog(st, 'S', \`สอดแนม \${opp}: "\${tc.name}" (\${tc.type}) — ประกาศ \${ac.declareType} → \${hit ? '✓ ถูก' : '✗ ผิด'}\`);
          ctx.scouted = top;
          const next = hit ? (ac.onHit || []) : (ac.onMiss || []);
          if (next.length) runActions(st, fx, next, Object.assign({}, ctx, { scouted: top, rng: ctx.rng }));
          prompted = !!(st.prompts || []).length;
          syncHeimdall(st);
        }
      } else if (ac.op === 'millScouted') {
        const id = ctx.scouted;
        if (id && st.inst[id] && zoneOf(st, id)) {
          const own = ownerOf(st, id);
          const hell = (own === 'A' || own === 'B') ? own + '.hell' : other(ctx.owner) + '.hell';
          doMove(st, id, hell, null, fx);
          addLog(st, 'S', \`ส่งการ์ดที่สอดแนม "\${nameOf(st, id)}" ลงนรก\`);
          fx.snd = 'clash';
        } else addLog(st, 'S', 'ไม่มีใบสอดแนมให้ส่งนรก');
      } else if (ac.op === 'discardSelfFromHand') {
        const z = zoneOf(st, ctx.src) || '';
        if (z.endsWith('.hand')) {
          doMove(st, ctx.src, ctx.owner + '.hell', null, fx);
          addLog(st, ctx.owner, \`ทิ้ง \${nameOf(st, ctx.src)} จากมือลงนรก\`);
        } else addLog(st, 'S', 'ทิ้งจากมือไม่ได้ — ไม่อยู่ในมือ');
      } else if (ac.op === 'destroyAttackTarget') {
        const def = (st.pending && st.pending.def) || ctx.target;
        if (def && st.inst[def] && (zoneOf(st, def) || '').endsWith('.avatar')) {
          addLog(st, 'S', \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: ทำลาย \${nameOf(st, def)} ที่เป็นเป้าโจมตี\`);
          destroyCard(st, fx, def);
          if (st.pending && st.pending.def === def) { st.pending = null; clearCombatBuffs(st); }
          fx.snd = 'clash';
        } else addLog(st, 'S', 'ไม่มีเป้าโจมตีให้ทำลาย');
      } else if (ac.op === 'peekOppTopKeep') {
        const opp = other(ctx.owner);
        const d = st.zones[opp + '.deck'] || [];
        if (!d.length) addLog(st, 'S', 'เด็คฝ่ายตรงข้ามว่าง');
        else {
          const top = d[d.length - 1];
          st.inst[top].faceUp = true;
          addLog(st, ctx.owner, \`สอดแนมใบบนสุดเด็ค \${opp}: "\${nameOf(st, top)}" (\${st.inst[top].type}) — กลับไว้เดิม\`);
          syncHeimdall(st);
        }
      } else if (ac.op === 'oppHandToDeckTop') {
        const opp = other(ctx.owner);
        const hand = st.zones[opp + '.hand'] || [];
        if (!hand.length) addLog(st, 'S', 'ฝ่ายตรงข้ามไม่มีมือให้แสดง');
        else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: hand.slice(), src: ctx.src, chooser: opp, dest: 'deckTop', optional: false, allowAnyZone: true });
          prompted = true;
          addLog(st, opp, \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: เลือกการ์ดในมือ 1 ใบแสดง แล้ววางบนสุดเด็ค\`);
        }
      } else if (ac.op === 'revealOppLifeTop') {
        const opp = other(ctx.owner);
        const life = st.zones[opp + '.life'] || [];
        const top = life.length ? life[life.length - 1] : null;
        if (top && st.inst[top] && !st.inst[top].faceUp) {
          st.inst[top].faceUp = true;
          addLog(st, 'S', \`หงาย LIFE ใบบนสุดของ \${opp}: "\${nameOf(st, top)}"\`);
        } else addLog(st, 'S', 'หงาย LIFE ไม่ได้ (ว่างหรือหงายอยู่แล้ว)');
      } else if (ac.op === 'revealOwnHandNameIncludes') {
        const need = ac.nameIncludes || '';
        const hand = (st.zones[ctx.owner + '.hand'] || []).filter(id => nameMatches(st.inst[id], need));
        if (!hand.length) {
          addLog(st, 'S', \`จุติ \${nameOf(st, ctx.src)}: ไม่มี "\${need}" ในมือ\`);
          if (ac.required) ctx._skipRest = true;
        } else {
          st.prompts.push({ kind: 'pick', from: 'ids', ids: hand, src: ctx.src, chooser: ctx.owner, dest: 'revealHandCard', optional: !ac.required, allowAnyZone: true });
          prompted = true;
          addLog(st, ctx.owner, \`แสดงการ์ด "\${need}" จากมือ 1 ใบ\`);
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
            st.prompts.push({ kind: 'pick', from: 'ids', ids: ids.slice(), src: ctx.src, chooser: ctx.owner, dest: 'scoutOppHell', optional: false, allowAnyZone: true, scoutRest: ids.slice(), scoutOpp: opp });
            prompted = true;
            addLog(st, ctx.owner, \`สอดแนมเด็ค \${opp} \${ids.length} ใบ — เลือก 1 ใบทิ้งนรก ที่เหลือไว้บนสุด\`);
          }
        }
      } else if (ac.op === 'hostNoUntapUntilNextOwnEnd') {
        const hostK = (st.inst[ctx.src] && st.inst[ctx.src].attachedTo) || ctx.src;
        if (st.inst[hostK]) {
          st.inst[hostK].noUntapSetSeq = st.turnSeq != null ? st.turnSeq : 0;
          addLog(st, 'S', \`เอฟเฟกต์ \${nameOf(st, ctx.src)}: \${nameOf(st, hostK)} ห้ามตื่นจนจบ End Phase ถัดไปของเรา\`);
        }
      } else if (ac.op === 'grantSelfKeyword') {
        const c = st.inst[ctx.src];
        if (c) {
          c.grantedKeywords = c.grantedKeywords || [];
          c.grantedKeywords.push({ kw: ac.keyword || 'เตะไข่', until: ac.until || 'endOfTurn' });
          addLog(st, ctx.owner, \`\${c.name} ได้ "\${ac.keyword}" จนจบเทิร์น\`);
        }
      } else if (ac.op === 'forceDuelNoTap') {
        const needN = ac.requireHellReturnedThisTurnMin;
        const gotN = (st.hellReturnedThisTurn && st.hellReturnedThisTurn[ctx.owner]) || 0;
        if (needN != null && gotN < needN) {
          addLog(st, 'S', \`ใช้ไม่ได้ — คืนนรกในเทิร์นนี้ \${gotN} < \${needN}\`);
        } else {
          const ownNeed = ac.ownNameIncludes || 'อีสานสลิงเกอร์';
          const mine = (st.zones[ctx.owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ownNeed));
          const foes = (st.zones[other(ctx.owner) + '.avatar'] || []).slice();
          if (!mine.length || !foes.length) addLog(st, 'S', \`ดวลไม่ได้ — ต้องมี "\${ownNeed}" และ Avatar ศัตรู\`);
          else {
            st.prompts.push({ kind: 'pick', from: 'ids', ids: mine, src: ctx.src, chooser: ctx.owner, dest: 'forceDuelOwn', optional: false, allowAnyZone: true, foeIds: foes, blockReact: !!ac.blockReact });
            prompted = true;
            addLog(st, ctx.owner, 'เลือกอีสานสลิงเกอร์สำหรับดวล (ไม่นอน · ห้าม React)');
          }
        }
      } else if (ac.op === 'scoutOppTop') {`;

  s = s.slice(0, idx) + insert + s.slice(idx + marker.length);
  fs.writeFileSync(engPath, s);
  console.log('injected ops before scoutOppTop');
}

// Patch hellPickMulti for magicMax + trackHellReturn + requireOwnNameIncludes
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('magicMax: ac.magicMax')) {
  const old = `} else if (ac.op === 'hellPickMulti') {
        // ภูเวียง: เลือกจากนรกสูงสุด N ใบกลับเด็ค แล้วจั่ว + บัฟ
        const p = {
          kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'hellMultiDeck', optional: true, multiMax: ac.countMax || 4, multiGot: 0,
          thenDraw: ac.thenDraw || 0, buffPer: ac.buffPer || 0, shuffleAfter: true,
        };`;
  const neu = `} else if (ac.op === 'hellPickMulti') {
        // ภูเวียง / โคกอีสานนูน: เลือกจากนรกสูงสุด N ใบกลับเด็ค แล้วจั่ว + บัฟ
        if (ac.requireOwnNameIncludes) {
          const ok = (st.zones[ctx.owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ac.requireOwnNameIncludes));
          if (!ok) { addLog(st, 'S', \`ใช้ไม่ได้ — ต้องมี "\${ac.requireOwnNameIncludes}" บนสนาม\`); return; }
        }
        const p = {
          kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'hellMultiDeck', optional: true, multiMax: ac.countMax || 4, multiGot: 0,
          thenDraw: ac.thenDraw || 0, buffPer: ac.buffPer || 0, shuffleAfter: true,
          magicMax: ac.magicMax != null ? ac.magicMax : null, magicGot: 0,
          trackHellReturn: !!ac.trackHellReturn,
        };`;
  if (!s.includes(old)) throw new Error('hellPickMulti block not found');
  s = s.replace(old, neu);
  fs.writeFileSync(engPath, s);
  console.log('patched hellPickMulti');
} else console.log('hellPickMulti already patched');

// Patch finishHellMulti to track returns
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('hellReturnedThisTurn')) {
  const old = `function finishHellMulti(st, fx, p, rng) {
    const n = p.multiGot || 0;
    if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }`;
  const neu = `function finishHellMulti(st, fx, p, rng) {
    const n = p.multiGot || 0;
    if (p.trackHellReturn && n > 0) {
      st.hellReturnedThisTurn = st.hellReturnedThisTurn || {};
      st.hellReturnedThisTurn[p.chooser] = (st.hellReturnedThisTurn[p.chooser] || 0) + n;
      addLog(st, p.chooser, \`คืนนรกเข้าเด็ค \${n} ใบ (รวมเทิร์นนี้ \${st.hellReturnedThisTurn[p.chooser]})\`);
    }
    if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }`;
  if (!s.includes(old)) throw new Error('finishHellMulti not found');
  s = s.replace(old, neu);
  fs.writeFileSync(engPath, s);
  console.log('patched finishHellMulti');
} else console.log('finishHellMulti already has hellReturned');

// Prompt handlers: deckTop, revealHandCard, scoutOppHell, forceDuelOwn + magicMax filter
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes("p.dest === 'deckTop'")) {
  const anchor = `} else if (p.dest === 'avatar') {`;
  const idx = s.indexOf(anchor);
  if (idx < 0) throw new Error('dest avatar anchor not found');
  const block = `} else if (p.dest === 'deckTop') {
            doMove(st, a.k, p.chooser + '.deck', null, fx);
            if (st.inst[a.k]) st.inst[a.k].faceUp = true;
            addLog(st, p.chooser, \`แสดง "\${nameOf(st, a.k)}" แล้ววางบนสุดเด็ค\`);
            syncHeimdall(st);
          } else if (p.dest === 'revealHandCard') {
            if (st.inst[a.k]) { st.inst[a.k].revealed = true; st.inst[a.k].faceUp = true; }
            addLog(st, 'S', \`\${p.chooser} แสดง "\${nameOf(st, a.k)}" จากมือ\`);
            if (p.then && p.then.length) runActions(st, fx, p.then, { src: p.src, owner: p.chooser, rng });
          } else if (p.dest === 'scoutOppHell') {
            const opp = p.scoutOpp || other(p.chooser);
            doMove(st, a.k, opp + '.hell', null, fx);
            addLog(st, p.chooser, \`ทิ้ง "\${nameOf(st, a.k)}" จากสอดแนมลงนรก\`);
            const rest = (p.scoutRest || []).filter(id => id !== a.k && st.inst[id] && (zoneOf(st, id) || '').endsWith('.deck'));
            // ที่เหลือเรียงกลับบนสุด (เก็บลำดับเดิมโดย push ตามลำดับ rest กลับ)
            rest.slice().reverse().forEach(id => {
              const z = zoneOf(st, id);
              if (z) {
                st.zones[z] = st.zones[z].filter(x => x !== id);
                st.zones[opp + '.deck'].push(id);
              }
            });
            if (rest.length) addLog(st, 'S', \`การ์ดที่เหลือ \${rest.length} ใบกลับไว้บนสุดเด็ค \${opp}\`);
            syncHeimdall(st);
            fx.snd = 'clash';
          } else if (p.dest === 'forceDuelOwn') {
            st.prompts.unshift({
              kind: 'pick', from: 'ids', ids: p.foeIds || [], src: p.src, chooser: p.chooser,
              dest: 'forceDuelFoe', optional: false, allowAnyZone: true,
              duelOwn: a.k, blockReact: !!p.blockReact
            });
            addLog(st, p.chooser, \`เลือกแล้ว \${nameOf(st, a.k)} — เลือก Avatar ศัตรูเพื่อดวล\`);
          } else if (p.dest === 'forceDuelFoe') {
            const ownK = p.duelOwn, foeK = a.k;
            if (!st.inst[ownK] || !st.inst[foeK]) addLog(st, 'S', 'ดวลไม่ได้ — การ์ดไม่อยู่บนสนาม');
            else {
              // ไม่นอน · ห้าม React · resolve combat ทันที
              const oa = ownerOf(st, ownK), ob = ownerOf(st, foeK);
              st.pending = { atk: ownK, def: foeK, life: null, by: oa, target: ob, held: false, blockReact: !!p.blockReact, noTapDuel: true };
              addLog(st, 'S', \`ดวล: \${nameOf(st, ownK)} vs \${nameOf(st, foeK)} (ไม่นอน · ห้าม React)\`);
              if (p.blockReact) addLog(st, 'S', 'ผู้เล่นทั้งสองฝ่ายใช้ React ไม่ได้ระหว่างดวลนี้');
              resolveCombat(st, fx, ownK, foeK, null);
              st.pending = null;
              clearCombatBuffs(st);
              fx.snd = 'clash';
            }
          } else if (p.dest === 'avatar') {`;
  s = s.slice(0, idx) + block + s.slice(idx + anchor.length);
  fs.writeFileSync(engPath, s);
  console.log('injected prompt dest handlers');
} else console.log('prompt dest handlers exist');

// magicMax filter in hellMultiDeck pick continuation
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('magicMax') || !s.includes('magicGot')) {
  console.log('note: magicMax field set on prompt; filtering at pick time next');
}

// Filter magic in promptCandidates when p.magicMax
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('p.magicMax != null')) {
  const old = `return pool.filter(k => {
        if (!matchFilterEx(st, k, p.filter)) return false;
        if (p.requireUntapped && !(st.inst[k] && !st.inst[k].tapped)) return false;
        if (p.dest === 'attachTo' && p.attachMod && st.inst[p.attachMod]) {
          const mod = st.inst[p.attachMod];
          if (attachOnlyDeny(st, mod.code, k, mod.name)) return false;
        }
        return true;
      });`;
  const neu = `return pool.filter(k => {
        if (!matchFilterEx(st, k, p.filter)) return false;
        if (p.requireUntapped && !(st.inst[k] && !st.inst[k].tapped)) return false;
        if (p.magicMax != null && st.inst[k] && st.inst[k].type === 'Magic' && (p.magicGot || 0) >= p.magicMax) return false;
        if (p.dest === 'attachTo' && p.attachMod && st.inst[p.attachMod]) {
          const mod = st.inst[p.attachMod];
          if (attachOnlyDeny(st, mod.code, k, mod.name)) return false;
        }
        return true;
      });`;
  if (!s.includes(old)) throw new Error('promptCandidates filter not found');
  s = s.replace(old, neu);
  fs.writeFileSync(engPath, s);
  console.log('patched promptCandidates magicMax');
}

// Increment magicGot when picking hellMultiDeck
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('p.magicGot = (p.magicGot')) {
  const old = `addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: นำ \${nameOf(st, a.k)} จากนรกกลับเด็ค (\${p.multiGot}/\${p.multiMax})\`);
            if (p.multiGot < (p.multiMax || 4) && promptCandidates(st, p).length) {`;
  const neu = `if (st.inst[a.k] && st.inst[a.k].type === 'Magic') p.magicGot = (p.magicGot || 0) + 1;
            addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: นำ \${nameOf(st, a.k)} จากนรกกลับเด็ค (\${p.multiGot}/\${p.multiMax})\`);
            if (p.multiGot < (p.multiMax || 4) && promptCandidates(st, p).length) {`;
  if (!s.includes(old)) {
    console.log('WARN: hellMultiDeck log line not exact — search manually');
  } else {
    s = s.replace(old, neu);
    fs.writeFileSync(engPath, s);
    console.log('patched magicGot increment');
  }
}

// declareAttack if targetIsAvatar
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('targetIsAvatar')) {
  // Find runAttackerDeclareOncePerTurn / abil declareAttack loop
  const re = /abil\(st, atkId, 'declareAttack'\)\.forEach\(ab => \{/;
  const m = s.match(re);
  if (!m) {
    console.log('WARN: declareAttack forEach not found');
  } else {
    // Patch both occurrences carefully - add filter at start of callback
    s = s.replace(/abil\(st, atkId, 'declareAttack'\)\.forEach\(ab => \{/g,
      `abil(st, atkId, 'declareAttack').forEach(ab => {
        if (ab.trigger && ab.trigger.if === 'targetIsAvatar') {
          const def0 = st.pending && st.pending.def;
          if (!def0 || !(zoneOf(st, def0) || '').endsWith('.avatar')) return;
        }`);
    fs.writeFileSync(engPath, s);
    console.log('patched declareAttack targetIsAvatar');
  }
}

// requireLandNameIncludes + requireMainPhase on battleDestroy / activated
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes('ab.requireMainPhase')) {
  // battleDestroy already has requireLandNameIncludes - add requireMainPhase
  const old = `abil(st, atkId, 'battleDestroy').forEach(ab => {
          if (ab.requireLandNameIncludes) {
            const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!ok) return;
          }
          runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random });
        });`;
  const neu = `abil(st, atkId, 'battleDestroy').forEach(ab => {
          if (ab.requireLandNameIncludes) {
            const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!ok) return;
          }
          if (ab.requireMainPhase && st.phase !== 'Main') return;
          runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random });
        });`;
  if (s.includes(old)) {
    s = s.replace(old, neu);
    fs.writeFileSync(engPath, s);
    console.log('patched battleDestroy requireMainPhase');
  } else console.log('WARN: battleDestroy block not exact');
}

// requireLandNameIncludes on activateAbility
s = fs.readFileSync(engPath, 'utf8');
if (!s.includes("if (ab.requireLandNameIncludes)") || s.indexOf('สั่งใช้ได้เฉพาะ Main Phase') < 0) {
  /* already may exist elsewhere */
}
{
  const needle = `if (ab.requireOwnNameIncludes) {
          const need = ab.requireOwnCount || 1;
          const n = (st.zones[owner + '.avatar'] || []).filter(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes)).length;
          if (need > 1) {
            if (n < need) return deny(\`ใช้ไม่ได้ — ต้องมี "\${ab.requireOwnNameIncludes}" ≥ \${need}\`);
          } else {
            const ok = (st.zones[owner + '.avatar'] || []).some(id => nameMatches(st.inst[id], ab.requireOwnNameIncludes));
            if (!ok) return deny(\`ใช้ไม่ได้ — ต้องมี "\${ab.requireOwnNameIncludes}"\`);
          }
        }`;
  // Insert land check before requireOwnNameIncludes in activateAbility section - find the field one near Main Phase
  const mark = `if (st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะ Main Phase');
        }
        if (ab.requireUniqueHellSymbolNames)`;
  if (s.includes(mark) && !s.includes("if (ab.requireLandNameIncludes) {\n          const landsOk")) {
    const add = `if (st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะ Main Phase');
        }
        if (ab.requireLandNameIncludes) {
          const landsOk = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
          if (!landsOk) return deny(\`ใช้ไม่ได้ — ต้องมี Land "\${ab.requireLandNameIncludes}"\`);
        }
        if (ab.requireUniqueHellSymbolNames)`;
    s = s.replace(mark, add);
    fs.writeFileSync(engPath, s);
    console.log('patched activateAbility requireLandNameIncludes');
  } else console.log('activateAbility land check skip/exists');
}

console.log('done patching engine');
