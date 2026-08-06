/* Finish remaining Isan/Police engine patches (CRLF-aware) */
const fs = require('fs');
const path = require('path');
const engPath = path.join(__dirname, '..', 'js', 'engine.js');
let s = fs.readFileSync(engPath, 'utf8');
const NL = s.includes('\r\n') ? '\r\n' : '\n';

function mustReplace(old, neu, label) {
  const o = old.split('\n').join(NL);
  const n = neu.split('\n').join(NL);
  if (!s.includes(o)) throw new Error('NOT FOUND: ' + label);
  s = s.split(o).join(n);
  console.log('OK', label);
}

function tryReplace(old, neu, label) {
  const o = old.split('\n').join(NL);
  const n = neu.split('\n').join(NL);
  if (!s.includes(o)) { console.log('SKIP', label); return false; }
  s = s.split(o).join(n);
  console.log('OK', label);
  return true;
}

if (!s.includes('trackHellReturn: !!ac.trackHellReturn')) {
  mustReplace(
`} else if (ac.op === 'hellPickMulti') {
        // ภูเวียง: เลือกจากนรกสูงสุด N ใบกลับเด็ค แล้วจั่ว + บัฟ
        const p = {
          kind: 'pick', from: 'hell', src: ctx.src, chooser: ctx.owner, filter: ac.filter,
          dest: 'hellMultiDeck', optional: true, multiMax: ac.countMax || 4, multiGot: 0,
          thenDraw: ac.thenDraw || 0, buffPer: ac.buffPer || 0, shuffleAfter: true,
        };`,
`} else if (ac.op === 'hellPickMulti') {
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
        };`,
    'hellPickMulti');
}

if (!s.includes('if (p.trackHellReturn && n > 0)')) {
  mustReplace(
`function finishHellMulti(st, fx, p, rng) {
    const n = p.multiGot || 0;
    if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }`,
`function finishHellMulti(st, fx, p, rng) {
    const n = p.multiGot || 0;
    if (p.trackHellReturn && n > 0) {
      st.hellReturnedThisTurn = st.hellReturnedThisTurn || {};
      st.hellReturnedThisTurn[p.chooser] = (st.hellReturnedThisTurn[p.chooser] || 0) + n;
      addLog(st, p.chooser, \`คืนนรกเข้าเด็ค \${n} ใบ (รวมเทิร์นนี้ \${st.hellReturnedThisTurn[p.chooser]})\`);
    }
    if (p.shuffleAfter) { seededShuffle(st.zones[p.chooser + '.deck'], rng); addLog(st, p.chooser, 'สับเด็ค'); }`,
    'finishHellMulti');
}

if (!s.includes('p.magicMax != null && st.inst[k]')) {
  mustReplace(
`return pool.filter(k => {
        if (!matchFilterEx(st, k, p.filter)) return false;
        if (p.requireUntapped && !(st.inst[k] && !st.inst[k].tapped)) return false;
        if (p.dest === 'attachTo' && p.attachMod && st.inst[p.attachMod]) {
          const mod = st.inst[p.attachMod];
          if (attachOnlyDeny(st, mod.code, k, mod.name)) return false;
        }
        return true;
      });`,
`return pool.filter(k => {
        if (!matchFilterEx(st, k, p.filter)) return false;
        if (p.requireUntapped && !(st.inst[k] && !st.inst[k].tapped)) return false;
        if (p.magicMax != null && st.inst[k] && st.inst[k].type === 'Magic' && (p.magicGot || 0) >= p.magicMax) return false;
        if (p.dest === 'attachTo' && p.attachMod && st.inst[p.attachMod]) {
          const mod = st.inst[p.attachMod];
          if (attachOnlyDeny(st, mod.code, k, mod.name)) return false;
        }
        return true;
      });`,
    'promptCandidates magicMax');
}

{
  const old = `addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: นำ \${nameOf(st, a.k)} จากนรกกลับเด็ค (\${p.multiGot}/\${p.multiMax})\`);`;
  const o = old.split('\n').join(NL);
  if (s.includes('p.magicGot = (p.magicGot')) console.log('SKIP magicGot');
  else if (s.includes(o)) {
    s = s.split(o).join(`if (st.inst[a.k] && st.inst[a.k].type === 'Magic') p.magicGot = (p.magicGot || 0) + 1;${NL}            ` + o);
    console.log('OK magicGot');
  } else console.log('WARN magicGot');
}

if (!s.includes("p.dest === 'scoutOppHell'")) {
  mustReplace(
`          } else if (p.dest === 'deckTop') {
            doMove(st, a.k, p.chooser + '.deck', null, fx); // push = บนสุด
            addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: วาง \${nameOf(st, a.k)} บนสุดเด็ค\`);
          } else if (p.dest === 'bounceTappedDeckDraw') {`,
`          } else if (p.dest === 'deckTop') {
            doMove(st, a.k, p.chooser + '.deck', null, fx); // push = บนสุด
            if (st.inst[a.k]) st.inst[a.k].faceUp = true;
            addLog(st, p.chooser, \`เอฟเฟกต์ \${nameOf(st, p.src)}: วาง \${nameOf(st, a.k)} บนสุดเด็ค\`);
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
              const oa = ownerOf(st, ownK), ob = ownerOf(st, foeK);
              st.pending = { atk: ownK, def: foeK, life: null, by: oa, target: ob, held: false, blockReact: !!p.blockReact, noTapDuel: true };
              addLog(st, 'S', \`ดวล: \${nameOf(st, ownK)} vs \${nameOf(st, foeK)} (ไม่นอน · ห้าม React)\`);
              resolveCombat(st, fx, ownK, foeK, null);
              st.pending = null;
              clearCombatBuffs(st);
              fx.snd = 'clash';
            }
          } else if (p.dest === 'bounceTappedDeckDraw') {`,
    'prompt dests');
}

tryReplace(
`abil(st, atkId, 'battleDestroy').forEach(ab => {
          if (ab.requireLandNameIncludes) {
            const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!ok) return;
          }
          runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random });
        });`,
`abil(st, atkId, 'battleDestroy').forEach(ab => {
          if (ab.requireLandNameIncludes) {
            const ok = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
            if (!ok) return;
          }
          if (ab.requireMainPhase && st.phase !== 'Main') return;
          runActions(st, fx, ab.actions || [], { src: atkId, owner: oa, rng: fx._rng || Math.random });
        });`,
'battleDestroy mainPhase');

if (!s.includes('targetIsAvatar')) {
  let n = 0;
  const needle = "abil(st, atkId, 'declareAttack').forEach(ab => {";
  const insert = `abil(st, atkId, 'declareAttack').forEach(ab => {
        if (ab.trigger && ab.trigger.if === 'targetIsAvatar') {
          const def0 = st.pending && st.pending.def;
          if (!def0 || !(zoneOf(st, def0) || '').endsWith('.avatar')) return;
        }`;
  while (s.includes(needle)) {
    s = s.replace(needle, insert);
    n++;
    if (n > 10) break;
  }
  console.log('OK targetIsAvatar x' + n);
}

{
  const mark = `if (st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะ Main Phase');
        }
        if (ab.requireUniqueHellSymbolNames)`;
  const o = mark.split('\n').join(NL);
  if (s.includes('ต้องมี Land "')) console.log('SKIP activate land');
  else if (s.includes(o)) {
    const add = `if (st.phase !== 'Main') return deny('สั่งใช้ได้เฉพาะ Main Phase');
        }
        if (ab.requireLandNameIncludes) {
          const landsOk = (st.zones['land'] || []).some(id => st.inst[id] && st.inst[id].faceUp && nameMatches(st.inst[id], ab.requireLandNameIncludes));
          if (!landsOk) return deny(\`ใช้ไม่ได้ — ต้องมี Land "\${ab.requireLandNameIncludes}"\`);
        }
        if (ab.requireUniqueHellSymbolNames)`;
    s = s.split(o).join(add.split('\n').join(NL));
    console.log('OK activate land');
  } else console.log('WARN activate land');
}

{
  const old = `if (ac.op === 'draw') {
        const players = ac.who === 'both' ? ['A', 'B'] : ac.who === 'opp' ? [other(ctx.owner)] : [ctx.owner];`;
  const neu = `if (ac.op === 'draw') {
        const who = ac.who || (ac.player === 'opp' ? 'opp' : ac.player === 'both' ? 'both' : null);
        const players = who === 'both' ? ['A', 'B'] : who === 'opp' ? [other(ctx.owner)] : [ctx.owner];`;
  tryReplace(old, neu, 'draw player alias');
}

// Pass then from revealOwnHandNameIncludes into prompt
if (!s.includes("dest: 'revealHandCard', optional: !ac.required, allowAnyZone: true, then: ac.then")) {
  tryReplace(
`st.prompts.push({ kind: 'pick', from: 'ids', ids: hand, src: ctx.src, chooser: ctx.owner, dest: 'revealHandCard', optional: !ac.required, allowAnyZone: true });`,
`st.prompts.push({ kind: 'pick', from: 'ids', ids: hand, src: ctx.src, chooser: ctx.owner, dest: 'revealHandCard', optional: !ac.required, allowAnyZone: true, then: ac.then || null });`,
'reveal then');
}

fs.writeFileSync(engPath, s);
console.log('saved engine');

// re-apply effects + rebuild
require('./apply-isan-police-effects.js');
