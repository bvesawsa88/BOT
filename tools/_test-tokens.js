/* Token วานร (SD09-026) / สัตว์ในตำนาน (BT12-076): รูป ค่าสถานะ และการ์ดที่สร้าง Token */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const BoT = require('../js/engine.js');
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cards.json'), 'utf8'));
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/effects-all.json'), 'utf8'));
BoT.loadEffects(effects);

function fresh(extra) {
  const zones = { land: [] };
  ['A', 'B'].forEach(p => ['deck', 'hand', 'avatar', 'magic', 'construct', 'hell', 'dark', 'life'].forEach(z => { zones[p + '.' + z] = []; }));
  return Object.assign({
    inst: {}, zones, phase: 'Main', active: 'A', turn: 3, turnSeq: 3, strict: false, firstPlayer: 'A', fpDrawn: true,
    buffs: [], pending: null, prompts: [], scheduled: [], chain: [], magicUsed: { A: {}, B: {} }, log: [],
    mulliganDone: { A: true, B: true }, awaitBattleStart: false, _tokSeq: 0, _mainPhaseSeq: 3, mainCount: { A: 2, B: 2 }
  }, extra || {});
}
let seq = 0;
function put(st, zone, code, extra) {
  const c = cards.find(x => x.code === code);
  const k = 't' + (++seq);
  st.inst[k] = Object.assign({
    id: k, code: c.code, name: c.name, type: c.type, subtype: c.subtype || '', symbol: c.symbol || '', color: c.color || '',
    gemColor: c.gemColor || '', cost: c.cost, gem: c.gem, power: c.power, effect: c.effect || '', ex: c.ex || '',
    img: c.imageUrl || '', faceUp: true, tapped: false, counters: 0, attachedTo: null
  }, extra || {});
  st.zones[zone].push(k);
  return k;
}
const act = (st, a) => BoT.applyAction(st, Object.assign({ by: 'A' }, a));
const passReacts = st => {
  for (let i = 0; i < 10 && st.prompts.length && st.prompts[0].kind === 'react'; i++) act(st, { type: 'reactNo', by: st.prompts[0].chooser });
};
const toks = st => st.zones['A.avatar'].map(k => st.inst[k]).filter(c => c.isToken);
// ค่าทุกช่องของ Token ในเกมต้องตรงกับการ์ดจริงในฐานข้อมูล
function same(tok, code) {
  const c = cards.find(x => x.code === code);
  assert.deepStrictEqual(
    [tok.code, tok.name, tok.color, tok.symbol, tok.cost, tok.gem, tok.power, tok.img],
    [c.code, c.name, c.color, c.symbol, c.cost, c.gem, c.power, c.imageUrl]);
}
const tests = {
  'SD09-005 มี Avatar วานร ในนรก 1 ใบ': () => {
    const st = fresh(); put(st, 'A.hell', 'SD09-011');
    const k = put(st, 'A.hand', 'SD09-005', { cost: 0 });
    act(st, { type: 'summon', k, to: 'A.avatar', payIds: [] }); passReacts(st);
    assert.strictEqual(toks(st).length, 1); same(toks(st)[0], 'SD09-026'); assert.strictEqual(st.prompts.length, 0);
  },
  'SD09-005 นรกไม่มี → แสดง Avatar วานร จากมือ': () => {
    const st = fresh(); put(st, 'A.hell', 'SD09-017'); // React ชื่อวานร ไม่ใช่ Avatar = ไม่นับ
    const h = put(st, 'A.hand', 'SD09-011'); const r = put(st, 'A.hand', 'SD09-017');
    const k = put(st, 'A.hand', 'SD09-005', { cost: 0 });
    act(st, { type: 'summon', k, to: 'A.avatar', payIds: [] }); passReacts(st);
    assert.strictEqual(toks(st).length, 0);
    const c = BoT.promptCandidates(st, st.prompts[0]);
    assert.ok(c.includes(h) && !c.includes(r));
    act(st, { type: 'chooseTarget', k: h });
    assert.strictEqual(toks(st).length, 1); assert.ok(st.zones['A.hand'].includes(h));
  },
  'SD09-005 ไม่มีทั้งนรกและมือ = ไม่สร้าง': () => {
    const st = fresh(); const k = put(st, 'A.hand', 'SD09-005', { cost: 0 });
    act(st, { type: 'summon', k, to: 'A.avatar', payIds: [] }); passReacts(st);
    assert.strictEqual(toks(st).length, 0); assert.strictEqual(st.prompts.length, 0);
  },
  'SD09-008 ไม่มีโล่มนุษย์': () => {
    const e = [].concat(effects.effects || effects.cards || effects).find(x => x.code === 'SD09-008') || effects['SD09-008'];
    assert.ok(!(e.keywords || []).includes('โล่มนุษย์')); assert.ok(e.abilities.length);
  },
  'SD09-007 จ่าย Cost ที่เหลือจากเอฟเฟกต์': () => {
    const st = fresh(); const p = put(st, 'A.hand', 'SD09-007'); const k = put(st, 'A.hand', 'SD09-010');
    st.prompts.push({ kind: 'pick', from: 'ownHand', src: k, chooser: 'A', dest: 'payRemainSummon', summonK: k, need: 4, got: 0, payIds: [], mustPayRemain: true, excludeIds: [k] });
    act(st, { type: 'chooseTarget', k: p }); passReacts(st);
    assert.ok(st.zones['A.avatar'].includes(k)); assert.strictEqual(toks(st).length, 1);
  },
  'SD09-006 คำสั่งเสีย': () => {
    const st = fresh(); for (let i = 0; i < 4; i++) put(st, 'A.hell', 'SD09-011');
    const d = put(st, 'A.avatar', 'SD09-006');
    const atk = put(st, 'B.avatar', 'SD09-004'); st.active = 'B'; st.phase = 'Battle';
    act(st, { type: 'declareAttack', atk, def: d, by: 'B' }); passReacts(st);
    if (st.pending) act(st, { type: 'resolveAttack', by: 'A' });
    passReacts(st);
    assert.ok(st.zones['A.hell'].includes(d), 'ต้องถูกทำลาย');
    assert.strictEqual(toks(st).length, 1); same(toks(st)[0], 'SD09-026');
  },
  'SD09-007 จ่ายเป็น Cost ให้วานร': () => {
    const st = fresh(); const p = put(st, 'A.hand', 'SD09-007');
    const k = put(st, 'A.hand', 'SD09-010');
    act(st, { type: 'summon', k, to: 'A.avatar', payIds: [p] }); passReacts(st);
    assert.ok(st.zones['A.avatar'].includes(k)); assert.strictEqual(toks(st).length, 1); same(toks(st)[0], 'SD09-026');
  },
  'SD09-007 จ่ายให้ตัวที่ไม่ใช่วานร = ไม่สร้าง': () => {
    const st = fresh(); const p = put(st, 'A.hand', 'SD09-007');
    const k = put(st, 'A.hand', 'SD09-012', { cost: 3 });
    act(st, { type: 'summon', k, to: 'A.avatar', payIds: [p] }); passReacts(st);
    assert.ok(st.zones['A.avatar'].includes(k)); assert.strictEqual(toks(st).length, 0);
  },
  'SD09-002 เข้า Link + POWER ต่อ Token': () => {
    const st = fresh(); const h = put(st, 'A.avatar', 'SD09-001');
    const k = put(st, 'A.avatar', 'SD09-002');
    act(st, { type: 'pair', k: h, to: k }); passReacts(st);
    assert.strictEqual(toks(st).length, 2); toks(st).forEach(t => same(t, 'SD09-026'));
    assert.strictEqual(BoT.effPower(st, k), 6);
    const t = toks(st)[0].id; act(st, { type: 'move', k: t, to: 'A.hell' });
    assert.ok(!st.inst[t], 'Token ออกจากสนาม = ออกจากเกม');
    assert.strictEqual(BoT.effPower(st, k), 5);
  },
  'BT12-045 บันบัน (กระต่าย)': () => {
    const st = fresh(); const k = put(st, 'A.hand', 'BT12-045', { cost: 0 });
    act(st, { type: 'summon', k, to: 'A.avatar', payIds: [] }); passReacts(st);
    assert.strictEqual(toks(st).length, 1); same(toks(st)[0], 'BT12-076');
  },
};
['SD09-023', 'SD09-024'].forEach(code => [[4, 4, 1], [3, 4, 1], [4, 3, 0]].forEach(([before, after, want]) => {
  tests[code + ' LIFE นรก ' + before + '→' + after + ' ใบ ได้ Token ' + want] = () => {
    const st = fresh({ active: 'B', phase: 'Battle' });
    for (let i = 0; i < before; i++) put(st, 'A.hell', 'SD09-011');
    ['A', 'B'].forEach(p => { for (let i = 0; i < 5; i++) put(st, p + '.deck', 'SD01-011'); });
    const life = put(st, 'A.life', code, { faceUp: false }); put(st, 'A.life', 'SD09-021', { faceUp: false });
    const atk = put(st, 'B.avatar', 'SD09-011');
    act(st, { type: 'declareAttack', atk, life, by: 'B' }); passReacts(st);
    if (st.pending) act(st, { type: 'resolveAttack', by: 'A' });
    passReacts(st);
    assert.strictEqual(toks(st).length, 0, 'ยังไม่ถึง Main');
    assert.ok(st.inst[life].faceUp, 'LIFE ต้องหงาย');
    while (st.zones['A.hell'].length < after) put(st, 'A.hell', 'SD09-011');
    while (st.zones['A.hell'].length > after) st.zones['A.hell'].pop();
    act(st, { type: 'endTurn', by: 'B' }); passReacts(st);
    if (st.phase !== 'Main') act(st, { type: 'setPhase', phase: 'Main' });
    assert.strictEqual(toks(st).length, want); toks(st).forEach(x => same(x, 'SD09-026'));
  };
}));
[['BT08-041', ['SD09-026', 'SD09-026'], 2], ['PRMO-151', ['SD09-011', 'SD09-026'], 2], ['BT08-041', ['PRMO-151', 'SD09-011'], 2],
  ['BT08-041', ['SD09-011'], 0], ['BT08-041', ['SD09-011', 'SD01-011'], 0]].forEach(([code, others, want]) => {
  tests[code + ' End Phase + ' + others.join(',') + ' จั่ว ' + want] = () => {
    const st = fresh();
    [code].concat(others).forEach(c => put(st, 'A.avatar', c, { isToken: c === 'SD09-026' }));
    ['A', 'B'].forEach(p => { for (let i = 0; i < 25; i++) put(st, p + '.deck', 'SD01-011'); });
    act(st, { type: 'endTurn' }); passReacts(st);
    assert.strictEqual(st.active, 'B'); assert.strictEqual(st.zones['A.hand'].length, want);
    const h0 = st.zones['A.hand'].length, b0 = st.zones['B.hand'].length; st.zones['A.hand'].push(...st.zones['A.deck'].splice(0, 5)); // มือ ≥3 กันจั่วเติม
    act(st, { type: 'endTurn', by: 'B' }); passReacts(st);
    assert.strictEqual(st.zones['A.hand'].length - h0 - 5, want + 1, 'End Phase อีกฝ่ายก็จั่ว (+1 จั่วต้นเทิร์น)');
    assert.strictEqual(st.zones['B.hand'].length, b0, 'อีกฝ่ายไม่ได้จั่ว');
    if (st.phase === 'Draw') act(st, { type: 'setPhase', phase: 'Main' });
    const before = st.zones['A.hand'].length;
    act(st, { type: 'endTurn' }); passReacts(st);
    assert.strictEqual(st.zones['A.hand'].length - before, want, 'เทิร์นถัดไปทำงานใหม่');
  };
});
// หนุมาน + นิลพัท
function linked(topCode, extra) {
  const st = fresh(Object.assign({}, extra, { active: 'A', phase: 'Main' }));
  const h = put(st, 'A.avatar', 'SD09-001'), n = put(st, 'A.avatar', 'SD09-002');
  ['A', 'B'].forEach(p => { for (let i = 0; i < 8; i++) put(st, p + '.deck', 'SD01-011'); });
  act(st, { type: 'pair', k: h, with: n, target: n, to: n }); passReacts(st);
  assert.strictEqual(st.inst[h].pairWith, n);
  Object.assign(st, extra || {});
  return { st, h, n, top: put(st, 'A.deck', topCode) };
}
function fight(st, atk, def) {
  act(st, { type: 'declareAttack', atk, def, by: 'B' }); passReacts(st);
  if (st.pending) act(st, { type: 'resolveAttack', by: 'A' });
  passReacts(st);
}
const battleB = { active: 'B', phase: 'Battle' };
[['SD09-011', true], ['SD01-011', false], ['SD09-017', false]].forEach(([code, live]) => {
  tests['SD09-001 Link ต่อสู้ ท็อป ' + code + (live ? ' รอด' : ' ตาย')] = () => {
    const { st, h, top } = linked(code, battleB);
    fight(st, put(st, 'B.avatar', 'SD09-011', { power: 20 }), h);
    assert.strictEqual(st.zones['A.avatar'].includes(h), live);
    assert.ok(st.zones['A.hell'].includes(top), 'ทิ้งใบที่สอดแนม');
  };
});
tests['SD09-001 กันได้เทิร์นละครั้ง'] = () => {
  const { st, h } = linked('SD09-011', battleB);
  fight(st, put(st, 'B.avatar', 'SD09-011', { power: 20 }), h);
  assert.ok(st.zones['A.avatar'].includes(h));
  put(st, 'A.deck', 'SD09-011');
  fight(st, put(st, 'B.avatar', 'SD09-011', { power: 20 }), h);
  assert.ok(!st.zones['A.avatar'].includes(h));
};
tests['SD09-001 ไม่ Link = ไม่สอดแนม'] = () => {
  const st = fresh(battleB); const h = put(st, 'A.avatar', 'SD09-001'); const top = put(st, 'A.deck', 'SD09-011');
  fight(st, put(st, 'B.avatar', 'SD09-011', { power: 20 }), h);
  assert.ok(st.zones['A.hell'].includes(h)); assert.ok(st.zones['A.deck'].includes(top));
};
['destroy', 'bounceHand', 'hell', 'dark', 'deckBottom', 'deckTop'].forEach(dest => ['SD09-011', 'SD01-011'].forEach(code => {
  tests['SD09-001 เอฟเฟกต์ศัตรู ' + dest + ' ท็อป ' + code] = () => {
    const { st, h, top } = linked(code, { active: 'B' });
    const src = put(st, 'B.avatar', 'SD01-011');
    st.prompts.push({ kind: 'pick', from: 'enemyAvatars', src, chooser: 'B', filter: {}, dest });
    act(st, { type: 'chooseTarget', k: h, by: 'B' }); passReacts(st);
    assert.strictEqual(st.zones['A.avatar'].includes(h), code === 'SD09-011');
    assert.ok(st.zones['A.hell'].includes(top)); assert.strictEqual(st.prompts.length, 0);
  };
}));
tests['SD09-001 ออกด้วยการ์ดเราเอง = ไม่สอดแนม'] = () => {
  const { st, h, top } = linked('SD09-011'); const src = put(st, 'A.avatar', 'SD01-011');
  st.prompts.push({ kind: 'pick', from: 'ownAvatars', src, chooser: 'A', filter: {}, dest: 'destroy' });
  act(st, { type: 'chooseTarget', k: h }); passReacts(st);
  assert.ok(!st.zones['A.avatar'].includes(h)); assert.ok(st.zones['A.deck'].includes(top));
};
tests['SD09-001 Link POWER+1 ตอนโดนตี'] = () => {
  const { st, h } = linked('SD09-011', battleB);
  const p0 = BoT.effPower(st, h);
  act(st, { type: 'declareAttack', atk: put(st, 'B.avatar', 'SD09-011', { power: 1 }), def: h, by: 'B' });
  assert.strictEqual(BoT.effPower(st, h), p0 + 1);
};
['SD09-001', 'SD09-002'].forEach(code => {
  tests[code + ' สั่งใช้จากมือ ทำลายวานร 2 ใบ'] = () => {
    const st = fresh({ strict: true }); const k = put(st, 'A.hand', code);
    const m1 = put(st, 'A.avatar', 'SD09-011'), m2 = put(st, 'A.avatar', 'SD09-026', { isToken: true, type: 'Avatar' }), x = put(st, 'A.avatar', 'SD01-011');
    act(st, { type: 'activateAbility', k }); passReacts(st);
    const c = BoT.promptCandidates(st, st.prompts[0]);
    assert.ok(c.includes(m1) && c.includes(m2) && !c.includes(x) && !c.includes(k));
    act(st, { type: 'chooseTarget', k: m1 });
    assert.ok(st.zones['A.avatar'].includes(m1), 'ยังไม่ทำลายจนเลือกครบ');
    act(st, { type: 'chooseTarget', k: m2 }); passReacts(st);
    assert.ok(st.zones['A.avatar'].includes(k)); assert.ok(!st.zones['A.avatar'].includes(m1) && !st.zones['A.avatar'].includes(m2));
    assert.strictEqual(st.prompts.length, 0);
  };
  tests[code + ' สั่งใช้จากมือ เลือกแล้วยกเลิก'] = () => {
    const st = fresh({ strict: true }); const k = put(st, 'A.hand', code);
    const m1 = put(st, 'A.avatar', 'SD09-011'); put(st, 'A.avatar', 'SD09-011');
    act(st, { type: 'activateAbility', k }); act(st, { type: 'chooseTarget', k: m1 }); act(st, { type: 'skipPrompt' });
    assert.strictEqual(st.prompts.length, 0); assert.strictEqual(st.zones['A.avatar'].length, 2); assert.ok(st.zones['A.hand'].includes(k));
  };
  tests[code + ' สั่งใช้จากมือ วานรไม่ครบ'] = () => {
    const st = fresh({ strict: true }); const k = put(st, 'A.hand', code); put(st, 'A.avatar', 'SD09-011');
    act(st, { type: 'activateAbility', k });
    assert.strictEqual(st.prompts.length, 0); assert.ok(st.zones['A.hand'].includes(k));
  };
});
[['LIFE', true], ['Avatar', true], ['ตัวเองเป็นเป้า', false], ['นอนอยู่', false]].forEach(([kind, want]) => {
  tests['SD09-001 โล่มนุษย์ ' + kind + (want ? ' ขึ้นถาม' : ' ไม่ถาม')] = () => {
    const st = fresh(Object.assign({ strict: true }, battleB));
    const h = put(st, 'A.avatar', 'SD09-001', { tapped: kind === 'นอนอยู่' }), x = put(st, 'A.avatar', 'SD01-011'), atk = put(st, 'B.avatar', 'SD09-011', { grantedKeywords: [{ kw: 'เตะไข่' }] });
    const life = put(st, 'A.life', 'SD09-021', { faceUp: false }); put(st, 'A.life', 'SD09-021', { faceUp: false });
    act(st, kind === 'LIFE' ? { type: 'declareAttack', atk, life, by: 'B' } : { type: 'declareAttack', atk, def: kind === 'ตัวเองเป็นเป้า' ? h : x, by: 'B' });
    const pr = st.prompts[0];
    assert.strictEqual(!!(pr && pr.kind === 'react' && pr.chooser === 'A'), want);
    if (!want) return;
    act(st, { type: 'humanShield', k: h, by: 'A' });
    assert.ok(st.inst[h].tapped); assert.strictEqual(st.pending.def, h); assert.strictEqual(st.prompts.length, 0);
    act(st, { type: 'resolveAttack', by: 'A' });
    assert.ok(!st.inst[life].faceUp); assert.ok(st.zones['A.avatar'].includes(x));
  };
});
let fail = 0;
for (const n in tests) {
  try { tests[n](); console.log('ok', n); } catch (e) { fail++; console.error('FAIL', n, e.message); }
}
process.exit(fail ? 1 : 0);
