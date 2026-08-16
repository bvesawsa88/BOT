/* BoT Online — client (js/game.js)
   เมนูหลัก → ล็อบบี้ → ห้องรอ → โต๊ะเล่น → จบเกม/รีแมตช์
   โหมด: online (WS หรือ LAN/P2P) / solo (คุมทั้งสองฝั่งบนเครื่องเดียว)
   พึ่งพา: BotUtil · CardDB · BoTEngine · BotLAN (โหลดตอนเล่น — ไม่ดึงตอนเปิดเมนู) */
(function () {
  'use strict';
  const { $, byId, esc, loadScript, loadCss, asset } = BotUtil;

  /* ── โหลดหนักเฉพาะตอนต้องใช้ (เมนูเบา / เข้าเกมค่อยดึง) ── */
  let playReady = null;
  let STARTERS = null;
  function ensurePlayReady() {
    if (playReady) return playReady;
    playReady = loadScript(asset('js/engine.js'))
      .then(() => loadScript(asset('js/bot-ai.js')))
      .then(() =>
      Promise.all([
        fetch(asset('data/effects-all.json')).then(r => r.json()).catch(() => null),
        fetch(asset('data/starters.json')).then(r => r.json()).catch(() => null),
        fetch(asset('data/custom-decks.json')).then(r => r.json()).catch(() => null),
        fetch('/api/effects-db').then(r => r.json()).catch(() => ({ cards: [] })),
        fetch(asset('data/cards.json')).then(r => r.json()).catch(() => null),
        fetch(asset('data/set-releases.json')).then(r => r.json()).catch(() => null),
      ]).then(([base, starters, customDecks, dbData, cardsData, setRel]) => {
        STARTERS = Object.assign({}, starters || {}, customDecks || {});
        if (setRel) BoTEngine.loadSetReleases(setRel);
        if (base) BoTEngine.loadEffects([base]);
        else {
          // fallback: ไฟล์แยกรายชุด (กรณียังไม่ build effects-all)
          const urls = ['sd01', 'sd02', 'sd03', 'sd04', 'sd05', 'sd06', 'sd07', 'sd08',
            'kd01', 'kd02', 'kd03', 'kd04',
            'bt01', 'bt02', 'bt03', 'bt04', 'bt05', 'bt06', 'bt07', 'bt08', 'bt09', 'bt10', 'bt11', 'cc01']
            .map(s => 'data/effects-' + s + '.json');
          return Promise.all(urls.map(u => fetch(asset(u)).then(r => r.json()).catch(() => null)))
            .then(list => {
              BoTEngine.loadEffects(list.filter(Boolean));
              if (dbData && dbData.cards) BoTEngine.mergeEffects(dbData.cards);
              // stub ชื่อจาก cards.json — reprint ใช้เอฟเฟกต์ชุดที่จำหน่ายทีหลังสุด
              const cl = Array.isArray(cardsData) ? cardsData : (cardsData && cardsData.cards) || [];
              if (cl.length) BoTEngine.mergeEffects(cl.map(c => ({ code: c.code, name: c.name })));
            });
        }
        if (dbData && dbData.cards) BoTEngine.mergeEffects(dbData.cards);
        // stub ชื่อจาก cards.json — reprint ใช้เอฟเฟกต์ชุดที่จำหน่ายทีหลังสุด
        const cardList = Array.isArray(cardsData) ? cardsData : (cardsData && cardsData.cards) || [];
        if (cardList.length) BoTEngine.mergeEffects(cardList.map(c => ({ code: c.code, name: c.name })));
      })
    ).catch(err => {
      playReady = null;
      toast('โหลดเอนจินไม่สำเร็จ — ลองใหม่');
      throw err;
    });
    return playReady;
  }

  function starterDeck(series) {
    const s = (STARTERS && STARTERS[series]) || null;
    if (!s) return null;
    return { name: s.name || (series + ' Starter'), spec: { main: s.main || {}, life: s.life || {} } };
  }
  function resolveDeckChoice(val) {
    if (!val) return starterDeck('SD01');
    if (val.indexOf('starter:') === 0) return starterDeck(val.slice(8)) || starterDeck('SD01');
    try {
      const sv = CardDB.savedDecks();
      if (sv[val]) return { name: val, spec: sv[val] };
    } catch (e) { }
    return starterDeck('SD01');
  }

  let toolsReady = null;
  function ensureTools() {
    if (toolsReady) return toolsReady;
    toolsReady = Promise.all([
      loadCss(asset('css/tools.css')),
      loadScript(asset('js/deck-builder.js')),
      loadScript(asset('js/gallery.js')),
    ]).catch(err => { toolsReady = null; toast('โหลดเครื่องมือไม่สำเร็จ'); throw err; });
    return toolsReady;
  }

  let howtoReady = null;
  function ensureHowto() {
    if (howtoReady) return howtoReady;
    howtoReady = loadCss(asset('css/howto.css')).catch(err => { howtoReady = null; throw err; });
    return howtoReady;
  }

  // พรีโหลดเงียบๆ หลังเมนูนิ่ง — เข้าเล่น/จัดเด็คจะเร็วขึ้น
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
  idle(() => { ensurePlayReady().catch(() => { }); ensureTools().catch(() => { }); }, { timeout: 4000 });

  let mode = null;          // 'online' | 'solo'
  let netKind = null;       // 'ws' | 'lan' | null — online แยกช่องทาง
  let lanSession = null;    // { send, destroy, connected, code } จาก BotLAN
  let lanIsHost = false;
  let lanDecks = { A: null, B: null };
  let lanDeckNames = { A: '', B: '' };
  let lanExpectClose = false;   // true = ปิดเอง (leave/reconnect) ไม่โชว์ dialog
  let lanPeerLeftOk = false;    // แขกส่ง leave มาแล้ว — อย่ารอ reconnect
  let lanDropMode = null;       // 'wait' | 'reconnect' | null
  let lanDropWaiting = false;   // ยืนยันรอแล้ว (นับถอยหลัง)
  let lanDropDeadline = 0;
  let lanDropTick = null;
  let lanReconnecting = false;
  const LAN_WAIT_MS = 3 * 60 * 1000;
  /* LAN presence (เห็นใครออน → ท้าสู้) */
  let presenceWs = null;
  let presenceWanted = false;
  let presenceId = null;
  let presencePeers = [];
  let presenceReconT = null;
  let outgoingChallenge = null;   // { id, nick }
  let incomingChallenge = null;   // { id, nick }
  let lanMatchDeckKey = null;     // ค่า select เด็คตอนท้า/รับ
  let lanAutoMatch = false;       // แมตช์จากคำท้า — พร้อมอัตโนมัติแล้วเริ่ม
  let lanReturnToHall = false;    // ออกจากแมตช์แล้วกลับล็อบบี้ LAN
  // 📺 บานสนาม = หน้าต่างแสดงสนามอย่างเดียวสำหรับแชร์จอ (ดูบล็อกท้ายไฟล์)
  const STREAM = new URLSearchParams(location.search).get('stream') === '1';
  let streamSide = 'A';   // ฝั่งที่บานสนามถือว่าเป็น "ของเรา" (มาจากที่นั่งของหน้าต่างหลัก)
  let realMode = false;   // 🎴 โหมดการ์ดจริง — solo แต่คุมฝั่งเดียว (อีกฝั่งเป็นการ์ดจริงบนโต๊ะ)
  let ws = null, wsWanted = false;
  let seat = 'A', my = 'A', opp = 'B', room = '', seqNum = 0;
  let nick = '';
  let st = null;            // สถานะเกมจาก engine
  let roomSt = null;        // สถานะห้องรอจาก server {phase, A:{nick,ready,online}, B:{...}, specs}
  let myReady = false;
  let gameStart = 0;
  let soloCards = null;
  let soloBot = false;  // true = โหมดเล่นกับบอท (ฝั่ง B เป็น AI) · false = ซ้อมมือคุมสองฝั่ง
  let botLevel = 'normal'; // easy | normal | hard — ระดับฝีมือบอท
  try { botLevel = localStorage.getItem('bot_level') || 'normal'; } catch (e) { }
  function getBotLevel() {
    const el = byId('selBotLevel');
    const v = (el && el.value) || botLevel || 'normal';
    return (v === 'easy' || v === 'hard') ? v : 'normal';
  }
  function setBotLevel(lv) {
    botLevel = (lv === 'easy' || lv === 'hard') ? lv : 'normal';
    try { localStorage.setItem('bot_level', botLevel); } catch (e) { }
    const el = byId('selBotLevel');
    if (el) el.value = botLevel;
  }
  let lastPhaseShown = null, phaseFlashT = null;
  let coinOvT = null, diceOvT = null;
  let announceSrc = null, annGlow = null, annT = null; // ประกาศใช้การ์ด (ชี้เป้า) + ไฮไลต์เป้า
  let announceKind = 'use'; // 'use' = ⚡ ประกาศใช้ · 'attack' = ⚔️ โจมตี (นอนตัวโจมตีให้อัตโนมัติ)
  let magicDropTarget = null; // ลากเมจิกจากมือทับการ์ด → ร่ายแล้วพยายามเลือกเป้านี้
  let rpsTimerId = null, rpsDeadline = 0;
  let reactTimerId = null, reactDeadline = 0, reactTimerKey = '';

  /* นาฬิกาหน้าต่างขัดเวท / React ที่มี seconds — หมดเวลา = ส่ง reactTimeout → ไม่ใช้ */
  function syncReactTimer(pr) {
    const timerEl = byId('promptTimer');
    const key = pr && pr.kind === 'react' && pr.seconds
      ? `${pr.mode || ''}|${pr.target || ''}|${pr.chooser || ''}|${(pr.options || []).join(',')}`
      : '';
    if (!key) {
      if (reactTimerId) { clearInterval(reactTimerId); reactTimerId = null; }
      reactDeadline = 0; reactTimerKey = '';
      if (timerEl) { timerEl.classList.add('hidden'); timerEl.textContent = ''; }
      return;
    }
    if (reactTimerKey !== key) {
      if (reactTimerId) { clearInterval(reactTimerId); reactTimerId = null; }
      reactDeadline = Date.now() + (pr.seconds || 10) * 1000;
      reactTimerKey = key;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((reactDeadline - Date.now()) / 1000));
      if (timerEl) {
        timerEl.classList.remove('hidden');
        timerEl.textContent = left + ' วิ';
        timerEl.classList.toggle('urgent', left <= 3);
      }
      if (left <= 0) {
        clearInterval(reactTimerId); reactTimerId = null;
        const cur = st && (st.prompts || [])[0];
        if (cur && cur.kind === 'react' && cur.seconds) {
          sendAction({ type: 'reactTimeout', by: mode === 'solo' ? (cur.chooser || 'A') : (seat === 'S' ? 'A' : my) });
        }
      }
    };
    if (!reactTimerId) { tick(); reactTimerId = setInterval(tick, 250); }
    else tick();
  }

  function syncRpsModal(pr) {
    const modal = byId('rpsModal');
    if (!modal) return;
    if (!pr || pr.kind !== 'rps') {
      modal.classList.add('hidden');
      if (rpsTimerId) { clearInterval(rpsTimerId); rpsTimerId = null; }
      rpsDeadline = 0;
      return;
    }
    modal.classList.remove('hidden');
    const srcN = st.inst[pr.src] ? st.inst[pr.src].name : 'ฉุบสั่งตาย';
    byId('rpsCardName').textContent = srcN;
    const picks = pr.picks || {};
    // online: โชว์แถวของฝั่งตัวเอง (solo โชว์ทั้งคู่)
    const showA = mode === 'solo' || seat === 'A' || seat === 'S';
    const showB = mode === 'solo' || seat === 'B' || seat === 'S';
    byId('rpsA').style.display = showA ? '' : 'none';
    byId('rpsB').style.display = showB ? '' : 'none';
    modal.querySelectorAll('[data-rps]').forEach(btn => {
      const pl = btn.getAttribute('data-rps');
      const done = !!picks[pl];
      btn.disabled = done;
      btn.classList.toggle('btn-primary', done && picks[pl] === btn.getAttribute('data-v'));
    });
    byId('rpsHint').textContent = (picks.A && picks.B) ? 'รอสรุปผล…'
      : (picks.A || picks.B) ? 'รออีกฝ่ายเลือก…' : 'เลือกค้อน / กระดาษ / กรรไกร';
    if (!rpsDeadline) rpsDeadline = Date.now() + (pr.seconds || 10) * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((rpsDeadline - Date.now()) / 1000));
      byId('rpsTimer').textContent = left + ' วินาที';
      if (left <= 0) {
        clearInterval(rpsTimerId); rpsTimerId = null;
        const cur = st && (st.prompts || [])[0];
        if (cur && cur.kind === 'rps' && !(cur.picks.A && cur.picks.B)) {
          sendAction({ type: 'rpsTimeout', by: mode === 'solo' ? 'A' : (seat === 'S' ? 'A' : my) });
        }
      }
    };
    if (!rpsTimerId) { tick(); rpsTimerId = setInterval(tick, 250); }
  }
  function flashPhase(phase, active) {
    const PH = { Draw: '🃏 เฟสจั่ว (Draw)', Main: '⭐ เฟสเมน (Main)', Battle: '⚔️ เฟสสู้รบ (Battle)', End: '🏁 จบเทิร์น (End)' };
    const el = byId('phaseFlash'); if (!el) return;
    el.textContent = `ผู้เล่น ${active} · ${PH[phase] || phase}`;
    el.className = 'ph-flash ph-' + phase; // reset + trigger animation
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(phaseFlashT); phaseFlashT = setTimeout(() => el.classList.remove('show'), 1100);
    // ช่องเฟสกลางสนาม — กระพริบสั้น ๆ ตอนเปลี่ยนเฟส
    const ps = byId('phaseSlot');
    if (ps) { ps.classList.remove('pulse'); void ps.offsetWidth; ps.classList.add('pulse'); }
  }

  /* แอนิเมชันเปิดศึกหลังมัลลิแกนครบ → ค่อย beginDuel (จั่วเพิ่มผู้เริ่ม) */
  let battleIntroPlaying = false;
  let battleIntroKey = '';
  function nickOf(p) {
    if (mode === 'online' && roomSt && roomSt[p] && roomSt[p].nick) return roomSt[p].nick;
    return 'ผู้เล่น ' + p;
  }
  function playBattleIntroThenStart(fp) {
    if (!st || !st.awaitBattleStart) return;
    const key = (st.turnSeq || st.turn) + ':' + (st.firstPlayer || 'A');
    if (battleIntroPlaying || battleIntroKey === key) return;
    battleIntroPlaying = true;
    battleIntroKey = key;
    const ov = byId('battleOv');
    const sub = byId('battleSub');
    if (sub) {
      const a = nickOf('A'), b = nickOf('B');
      const first = nickOf(fp || st.firstPlayer || 'A');
      sub.textContent = `${a}  VS  ${b}  ·  ${first} เริ่มก่อน`;
    }
    if (ov) {
      ov.classList.remove('hidden', 'out', 'play', 'show');
      void ov.offsetWidth;
      ov.classList.add('show', 'play');
      ov.setAttribute('aria-hidden', 'false');
    }
    try { snd('clash'); } catch (e) { }
    setTimeout(() => { try { snd('flip'); } catch (e) { } }, 500);
    setTimeout(() => {
      if (ov) { ov.classList.add('out'); }
      setTimeout(() => {
        if (ov) {
          ov.classList.add('hidden');
          ov.classList.remove('show', 'play', 'out');
          ov.setAttribute('aria-hidden', 'true');
        }
        battleIntroPlaying = false;
        if (st && st.awaitBattleStart) {
          const who = mode === 'solo' ? (st.firstPlayer || 'A') : (seat === 'A' || seat === 'B' ? seat : undefined);
          sendAction({ type: 'beginDuel', by: who });
        }
      }, 380);
    }, 2200);
  }

  const PHASE_SLOT = {
    Draw:   { en: 'DRAW PHASE',   short: 'DRAW',   th: 'เฟสจั่ว' },
    Main:   { en: 'MAIN PHASE',   short: 'MAIN',   th: 'เฟสเมน' },
    Battle: { en: 'BATTLE PHASE', short: 'BATTLE', th: 'เฟสสู้รบ' },
    End:    { en: 'END PHASE',    short: 'END',    th: 'จบเทิร์น' }
  };
  /* เด็คกะพริบเขียว: เฟสจั่ว / มีเอฟเฟกต์นัดจั่วรอ / แฟลชตอนเพิ่งจั่ว */
  function deckShouldDrawHint(side) {
    if (!st || st.over || (side !== 'A' && side !== 'B')) return false;
    if (deckFlashSide === side) return true;
    // เฟสจั่วของฝ่ายที่ถือเทิร์น = แตะเด็คได้
    if (st.phase === 'Draw' && st.active === side) return true;
    // มีเอฟเฟกต์นัดจั่วค้าง (เช่น LIFE → จั่ว Main เทิร์นหน้า)
    if ((st.scheduled || []).some(s => s.player === side && s.op === 'draw')) return true;
    return false;
  }
  /* จั่วจากแตะเด็ค: เทิร์นตัวเอง + เฟสจั่ว = จั่วเลย · นอกนั้นถามยืนยัน */
  function isNormalDrawWindow(side) {
    return !!(st && side && st.active === side && st.phase === 'Draw');
  }
  function requestManualDraw(side) {
    if (!st || st.over || (side !== 'A' && side !== 'B')) return;
    if (!isNormalDrawWindow(side)) {
      const why = st.active !== side
        ? `ไม่ใช่เทิร์นของฝ่าย ${side} (ตา ${st.active})`
        : `ไม่ใช่เฟสจั่ว (ตอนนี้อยู่เฟส${(PHASE_SLOT[st.phase] && PHASE_SLOT[st.phase].th) || st.phase})`;
      if (!confirm(`${why}\n\nจะจั่วหรอ?`)) return;
    }
    sendAction({ type: 'draw', p: side });
  }
  function syncDeckDrawHint() {
    const md = byId('myDeck'), od = byId('oppDeck');
    if (md) md.classList.toggle('deck-draw', deckShouldDrawHint(my));
    if (od) od.classList.toggle('deck-draw', deckShouldDrawHint(opp));
  }
  function pulseDeckDraw(side) {
    if (side !== 'A' && side !== 'B') return;
    deckFlashSide = side;
    clearTimeout(deckFlashT);
    syncDeckDrawHint();
    deckFlashT = setTimeout(() => {
      deckFlashSide = null;
      syncDeckDrawHint();
    }, 1800);
  }

  function syncPhaseSlot() {
    const ps = byId('phaseSlot'), lab = byId('phaseSlotLabel'), sub = byId('phaseSlotSub');
    if (!ps || !lab || !st) return;
    const meta = PHASE_SLOT[st.phase] || { en: st.phase, short: st.phase, th: st.phase };
    const mobile = window.matchMedia('(max-width:920px)').matches;
    const portrait = window.matchMedia('(max-width:920px) and (orientation:portrait)').matches;
    lab.textContent = portrait ? meta.short : meta.en;
    const mine = canEndTurnNow();
    if (sub) {
      if (!mine) sub.textContent = `${meta.th} · ตาฝั่ง ${st.active}`;
      else if (mobile) sub.textContent = 'แตะ = จบเทิร์น';
      else sub.textContent = `${meta.th} · Enter จบเทิร์น`;
    }
    ps.className = 'phase-slot ph-' + st.phase + (mine ? '' : ' wait');
    ps.title = mine ? 'แตะเพื่อจบเทิร์น' : ('รอตาฝั่ง ' + st.active);
    ps.setAttribute('aria-disabled', mine ? 'false' : 'true');
    const etPh = byId('etPhase'), etSub = byId('etSub'), etFabPh = document.querySelector('.et-phase-fab');
    if (etPh) etPh.textContent = meta.en;
    if (etFabPh) etFabPh.textContent = meta.short;
    if (etSub) etSub.textContent = mine ? 'กด Enter' : ('ตาฝั่ง ' + st.active);
    const desk = byId('btnEndTurn');
    if (desk) {
      desk.classList.toggle('wait', !mine);
      desk.classList.remove('ph-Draw', 'ph-Main', 'ph-Battle', 'ph-End');
      desk.classList.add('ph-' + st.phase);
    }
    syncEndTurnUi();
  }
  function canEndTurnNow() {
    if (!st || st.over) return false;
    if (st.awaitBattleStart) return false;
    if (mullP) return false;
    if (STREAM) return false;
    if (mode === 'online' && seat === 'S') return false;
    if (mode === 'online' && seat !== st.active) return false;
    // มัลลิแกนยังไม่จบ
    if (st.turn === 1 && !st.fpDrawn) {
      const done = st.mulliganDone || {};
      if (!done.A || !done.B) return false;
    }
    return true;
  }
  function syncEndTurnUi() {
    const ok = canEndTurnNow();
    const fab = byId('btnEndTurnFab');
    const mb = byId('mbEnd');
    const desk = byId('btnEndTurn');
    const onTable = !byId('table').classList.contains('hidden');
    const mobile = window.matchMedia('(max-width:920px)').matches;
    const landscapeMobile = window.matchMedia('(max-width:1100px) and (orientation:landscape), (max-height:520px) and (orientation:landscape)').matches;
    const drawerOpen = !byId('logPane').classList.contains('hidden');
    const pvOpen = byId('previewPane').classList.contains('open');
    if (fab) {
      const show = onTable && !landscapeMobile && st && !st.over && !mullP
        && !(mobile && (drawerOpen || pvOpen));
      fab.classList.toggle('hidden', !show);
      fab.classList.toggle('wait', !ok);
      fab.disabled = !ok;
      if (show) syncEndTurnFabPos();
    }
    if (mb) mb.classList.toggle('wait', !ok);
    if (desk) {
      desk.disabled = !ok;
      desk.classList.toggle('wait', !ok);
    }
  }
  function syncEndTurnFabPos() {
    const fab = byId('btnEndTurnFab');
    const hell = byId('myHell');
    if (!fab || !hell || fab.classList.contains('hidden')) return;
    const r = hell.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const fw = fab.offsetWidth || 108;
    const fh = fab.offsetHeight || 48;
    const left = Math.round(r.left + (r.width - fw) / 2);
    const top = Math.round(r.top - fh - 4);
    fab.style.left = Math.max(6, Math.min(left, window.innerWidth - fw - 6)) + 'px';
    fab.style.top = Math.max(6, top) + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }
  /* แถบจะขัด/พรอมต์ — วางที่เมจิกโซนฝั่งบน ไม่ให้ทับปุ่มบ้าน/เมนู */
  function syncFloatBarsPos() {
    const bars = byId('floatBars');
    if (!bars) return;
    const has = [...bars.children].some(el => !el.classList.contains('hidden'));
    if (!has) return;
    const table = byId('table');
    const one = table && (table.classList.contains('one-side') || document.body.classList.contains('one-board'));
    const zone = (!one && byId('oppMagicZone')) || null;
    const r = zone ? zone.getBoundingClientRect() : null;
    const pad = 8;
    const chromeRight = 96;
    if (r && r.width >= 24 && r.height >= 12) {
      const maxW = Math.min(Math.max(r.width, 200), window.innerWidth - pad - chromeRight);
      let cx = r.left + r.width / 2;
      const rightLimit = window.innerWidth - chromeRight;
      if (cx + maxW / 2 > rightLimit) cx = rightLimit - maxW / 2;
      if (cx - maxW / 2 < pad) cx = pad + maxW / 2;
      bars.style.width = maxW + 'px';
      bars.style.maxWidth = maxW + 'px';
      bars.style.left = cx + 'px';
      bars.style.top = Math.max(48, Math.round(r.top + 4)) + 'px';
      bars.style.transform = 'translateX(-50%)';
      return;
    }
    bars.style.left = '50%';
    bars.style.top = '52px';
    bars.style.width = '';
    bars.style.maxWidth = '';
    bars.style.transform = 'translateX(-50%)';
  }
  function doEndTurn() {
    if (!st) return;
    if (!canEndTurnNow()) {
      if (mode === 'online' && seat !== st.active) toast('ยังไม่ใช่ตาคุณ');
      else toast('ตอนนี้จบเทิร์นยังไม่ได้');
      return;
    }
    const flash = el => {
      if (!el || el.classList.contains('hidden')) return;
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    };
    flash(byId('btnEndTurnFab'));
    flash(byId('btnEndTurn'));
    sendAction({ type: 'endTurn' });
  }

  /* มุมสุดท้ายของลูกเต๋าให้หน้า v หันเข้ากล้อง (df1–df6)
     ผังหน้า: 1 หน้า · 6 หลัง · 3 ขวา · 4 ซ้าย · 2 บน · 5 ล่าง
     ค่าเริ่มต้นของลูกบาศก์ = เอียงโชว์หลายหน้า (−22, 32) จึงชดเชยตอนหยุด */
  const DICE_IDLE = { x: -22, y: 32 };
  const DICE_FACE_ROT = {
    1: { x: 0, y: 0 },
    2: { x: -90, y: 0 },
    3: { x: 0, y: -90 },
    4: { x: 0, y: 90 },
    5: { x: 90, y: 0 },
    6: { x: 0, y: 180 }
  };
  let coinAnim = null, coinShAnim = null, diceShAnim = null;

  function hideCoinOv(instant) {
    const ov = byId('coinOv'), disc = byId('coinDisc'), lab = byId('coinLabel');
    clearTimeout(coinOvT);
    if (coinAnim) { try { coinAnim.cancel(); } catch (_) {} coinAnim = null; }
    if (coinShAnim) { try { coinShAnim.cancel(); } catch (_) {} coinShAnim = null; }
    if (!ov) return;
    ov.classList.remove('show');
    if (instant) {
      ov.classList.add('hidden');
      if (disc) disc.style.transform = '';
      if (lab) { lab.classList.remove('show'); lab.textContent = ''; }
    }
  }

  function hideDiceOv(instant) {
    const ov = byId('diceOv'), cube = byId('diceCube'), lab = byId('diceLabel');
    clearTimeout(diceOvT);
    if (diceShAnim) { try { diceShAnim.cancel(); } catch (_) {} diceShAnim = null; }
    if (!ov) return;
    ov.classList.remove('show');
    if (instant) {
      ov.classList.add('hidden');
      if (cube) {
        cube.style.transition = 'none';
        cube.style.transform = `rotateX(${DICE_IDLE.x}deg) rotateY(${DICE_IDLE.y}deg)`;
        cube.className = 'dice-cube';
      }
      if (lab) { lab.classList.remove('show'); lab.textContent = ''; }
    }
  }

  /* 🪙 โยนเหรียญ — กลิ้งหมุนหลายตลบ แล้วหยุดที่หัว/ก้อยจริง */
  function showCoinFlip(result) {
    const ov = byId('coinOv'), disc = byId('coinDisc'), lab = byId('coinLabel');
    const shadow = ov && ov.querySelector('.coin-shadow');
    if (!ov || !disc) return;
    hideDiceOv(true);
    hideCoinOv(true);
    const heads = result === 'หัว';
    const spins = 5 + Math.floor(Math.random() * 3); // 5–7 รอบ
    const endY = spins * 360 + (heads ? 0 : 180);
    const dur = 1800;
    clearTimeout(coinOvT);
    lab.classList.remove('show');
    lab.textContent = '';
    disc.style.transform = '';
    ov.classList.remove('hidden');
    requestAnimationFrame(() => ov.classList.add('show'));

    const ease = 'cubic-bezier(0.22, 0.7, 0.28, 1)';
    coinAnim = disc.animate([
      { transform: 'translateY(48px) rotateY(0deg) rotateX(18deg) rotateZ(-12deg) scale(.82)' },
      { transform: `translateY(-130px) rotateY(${endY * .28}deg) rotateX(55deg) rotateZ(18deg) scale(1.08)`, offset: .28 },
      { transform: `translateY(-70px) rotateY(${endY * .55}deg) rotateX(-25deg) rotateZ(-22deg) scale(1.02)`, offset: .52 },
      { transform: `translateY(-8px) rotateY(${endY * .82}deg) rotateX(14deg) rotateZ(10deg) scale(1)`, offset: .78 },
      { transform: `translateY(10px) rotateY(${endY * .94}deg) rotateX(-4deg) rotateZ(-4deg) scale(1)`, offset: .9 },
      { transform: `translateY(0) rotateY(${endY}deg) rotateX(0deg) rotateZ(0deg) scale(1)` }
    ], { duration: dur, easing: ease, fill: 'forwards' });

    if (shadow) {
      coinShAnim = shadow.animate([
        { transform: 'scaleX(.5)', opacity: .2, bottom: '26px' },
        { transform: 'scaleX(.28)', opacity: .12, bottom: '6px', offset: .28 },
        { transform: 'scaleX(1)', opacity: .55, bottom: '42px' }
      ], { duration: dur, easing: ease, fill: 'forwards' });
    }

    setTimeout(() => {
      lab.innerHTML = `ออก <b>${esc(result)}</b>`;
      lab.classList.add('show');
    }, dur - 120);
    coinOvT = setTimeout(() => {
      ov.classList.remove('show');
      setTimeout(() => hideCoinOv(true), 220);
    }, dur + 1100);
  }

  /* 🎲 ทอยเต๋า — CSS 3D หมุนหลายรอบแล้วหยุดที่หน้าผล */
  function showDiceRoll(n) {
    const ov = byId('diceOv'), cube = byId('diceCube'), lab = byId('diceLabel');
    const shadow = ov && ov.querySelector('.dice-shadow');
    if (!ov || !cube) return;
    const v = Math.max(1, Math.min(6, Number(n) || 1));
    hideCoinOv(true);
    hideDiceOv(true);
    const face = DICE_FACE_ROT[v];
    // หมุน 3–5 รอบต่อแกน · สุ่มทิศ แล้วหยุดที่หน้าเลขหันกล้อง
    const spin = () => (3 + Math.floor(Math.random() * 3)) * 360 * (Math.random() < .5 ? 1 : -1);
    const endX = spin() + face.x;
    const endY = spin() + face.y;
    const dur = 1600;
    clearTimeout(diceOvT);
    lab.classList.remove('show');
    lab.textContent = '';
    cube.className = 'dice-cube';
    // เริ่มจากมุมเอียง (เห็นหลายหน้า) · ไม่มี transition ก่อน ไม่งั้นทอยซ้ำไม่เล่น
    cube.style.transition = 'none';
    cube.style.transform = `rotateX(${DICE_IDLE.x}deg) rotateY(${DICE_IDLE.y}deg)`;
    ov.classList.remove('hidden');
    void cube.offsetWidth;
    requestAnimationFrame(() => {
      ov.classList.add('show');
      requestAnimationFrame(() => {
        cube.style.transition = `transform ${dur}ms cubic-bezier(0.18, 0.7, 0.22, 1)`;
        cube.style.transform = `rotateX(${endX}deg) rotateY(${endY}deg)`;
      });
    });

    if (shadow) {
      diceShAnim = shadow.animate([
        { transform: 'scaleX(.55)', opacity: .22 },
        { transform: 'scaleX(.35)', opacity: .14, offset: .35 },
        { transform: 'scaleX(1)', opacity: .5 }
      ], { duration: dur, easing: 'cubic-bezier(0.18, 0.7, 0.22, 1)', fill: 'forwards' });
    }

    setTimeout(() => {
      cube.classList.add('landed');
      lab.innerHTML = `ออก <b>${v}</b>`;
      lab.classList.add('show');
    }, dur);
    diceOvT = setTimeout(() => {
      ov.classList.remove('show');
      setTimeout(() => hideDiceOv(true), 220);
    }, dur + 1100);
  }
  let botT = null;
  let autoResolveAtkT = null;
  let autoResolveAtkKey = null;
  let selMap = {};          // การ์ดในมือที่เลือกนับ GEM (ใช้ร่วมกับโหมดมัลลิแกน)
  let mullMode = false;     // (เลิกใช้) โหมดเลือกการ์ดเปลี่ยนมัลลิแกน
  let mullP = null;         // ผู้เล่นที่กำลังถูกถาม "เปลี่ยนมือไหม?" ตอนเริ่มเกม (null = ตอบครบแล้ว)
  const GEM_EMOJI = { 'แดง': '🔴', 'ฟ้า': '🔵', 'ม่วง': '🟣', 'เขียว': '🟢', 'ขาว': '⚪' }; // สีเจม/สีคอส
  /* สีเจม: ตาม gemColor · ว่างใช้สีการ์ด · ขาว/ใส = wild (อย่า default ว่างเป็นขาว — เจมม่วงจะลงฟ้าได้ผิด) */
  const gemColorOf = c => (BoTEngine.gemColorOf ? BoTEngine.gemColorOf(c) : (c.gemColor || c.color || 'ขาว'));
  const costColorOf = c => c.color || '';        // สีคอส = สีที่ต้องจ่ายเพื่ออัญเชิญ ('' = ไร้สี จ่ายได้ทุกสี)
  /* เดย์วัน ฯลฯ: จ่ายเป็น Cost อัญเชิญชื่อที่ตรง → นับ GEM พิเศษ (ค่าพิมพ์ยังเป็น 1) */
  function payGemInfo(payC, summonC) {
    const printed = +payC.gem || 0;
    const gc0 = gemColorOf(payC);
    const e = BoTEngine.effectOf && BoTEngine.effectOf(payC.code, payC.name);
    if (e && e.gemAsCostForNameIncludes && summonC
      && (summonC.name || '').includes(e.gemAsCostForNameIncludes)) {
      return {
        g: e.gemAsCostValue != null ? e.gemAsCostValue : 5,
        gc: e.gemAsCostColor || 'ขาว',
        printed,
        boosted: true,
        forName: e.gemAsCostForNameIncludes
      };
    }
    return { g: printed, gc: gc0, printed, boosted: false, forName: e && e.gemAsCostForNameIncludes || '' };
  }
  function payGemHint(c) {
    const e = BoTEngine.effectOf && BoTEngine.effectOf(c.code, c.name);
    if (!e || !e.gemAsCostForNameIncludes) return null;
    const v = e.gemAsCostValue != null ? e.gemAsCostValue : 5;
    return { v, col: e.gemAsCostColor || 'ขาว', name: e.gemAsCostForNameIncludes, printed: +c.gem || 0 };
  }
  let previewId = null, lastDrawn = null, lastFlip = null;
  let dealT = null, flipT = null, clashT = null, reconT = null;
  let deckFlashSide = null, deckFlashT = null; // เด็คกะพริบเขียวตอนจั่ว/เริ่มเทิร์น
  const pendingReveal = new Set(); // การ์ดขึ้นมือที่ยังซ่อนรอแอนิเมชันลากเปิด
  let vfxBusy = Promise.resolve(); // คิวแอนิเมชันไม่ให้ทับกัน

  /* ── สลับจอ ── */
  const SCREENS = ['menu', 'lobby', 'lanHall', 'room', 'decks', 'deckbuilder', 'gallery', 'howto'];
  const SS_UI = 'bot_ui_v1';
  let curScreen = 'menu';
  let persistT = null;

  function persistUI(force) {
    if (STREAM) return;
    const run = () => {
      try {
        const payload = {
          screen: curScreen,
          mode: mode || null,
          netKind: netKind || null,
          seat, room: room || '',
          realMode: !!realMode,
          soloBot: !!soloBot,
          gameStart: gameStart || 0,
          seqNum: seqNum || 0,
          myReady: !!myReady,
          // โต๊ะซ้อม/การ์ดจริง — เก็บ state ทั้งก้อนเพื่อรีเฟรชแล้วยังเล่นต่อได้
          st: (mode === 'solo' && st) ? st : null,
          ts: Date.now()
        };
        sessionStorage.setItem(SS_UI, JSON.stringify(payload));
      } catch (e) { /* quota / private mode */ }
    };
    if (force) { clearTimeout(persistT); run(); }
    else { clearTimeout(persistT); persistT = setTimeout(run, 200); }
  }

  function clearPersistedTable() {
    try {
      const raw = sessionStorage.getItem(SS_UI);
      if (!raw) return;
      const d = JSON.parse(raw);
      d.st = null;
      if (d.screen === 'table') d.screen = 'menu';
      d.mode = null; d.room = '';
      sessionStorage.setItem(SS_UI, JSON.stringify(d));
    } catch (e) { }
  }

  function syncUrlForScreen(name) {
    if (STREAM) return;
    const q = new URLSearchParams(location.search);
    if (q.get('room') || q.get('stream')) return; // ออนไลน์/บานสนามใช้ query อยู่แล้ว
    try {
      if (name === 'menu') history.replaceState(null, '', location.pathname);
      else if (name === 'table' && mode === 'solo') history.replaceState(null, '', location.pathname + '#table');
      else if (name === 'room' && room) history.replaceState(null, '', '/?room=' + room);
      else if (['lobby', 'lanHall', 'decks', 'deckbuilder', 'gallery', 'howto'].includes(name))
        history.replaceState(null, '', location.pathname + '#' + name);
    } catch (e) { }
  }

  function applyScreen(name) {
    curScreen = name;
    SCREENS.forEach(s => byId(s).classList.toggle('hidden', s !== name));
    byId('table').classList.toggle('hidden', name !== 'table');
    if (name !== 'table') {
      byId('endOv').classList.add('hidden'); byId('endAsk').classList.add('hidden');
      byId('rematchAsk').classList.add('hidden');
      pileView = null; byId('pileView').classList.add('hidden');
    }
    if (name === 'menu') {
      try { showMenuHome(true); } catch (e) { }
    }
    syncUrlForScreen(name);
    persistUI(true);
    syncHomeBtn();
  }

  function showScreen(name) {
    applyScreen(name);
  }
  window.BOT = { showScreen, _st: () => st, _seat: () => seat, _mode: () => mode }; // showScreen ให้ deck-builder/gallery · debug helpers

  /* ── เสียงสังเคราะห์ ── */
  let AC = null;
  function snd(kind) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const f = { draw: [520, 760], place: [300, 220], tap: [660, 660], dice: [420, 560], flip: [480, 700], clash: [180, 90] }[kind] || [440, 440];
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = kind === 'clash' ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(f[0], AC.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(f[1], 1), AC.currentTime + .12);
      g.gain.setValueAtTime(.08, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + (kind === 'clash' ? .35 : .15));
      o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + .4);
    } catch (e) { }
  }

  /* ── VFX: ลากเปิดทีละใบ / ธรณีสูบ / สอดแนมหน้าต่าง / โจมตีวิ่งชน ── */
  function vfxLayer() { return byId('vfxLayer'); }
  function vfxSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function vfxReduced() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function vfxRect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  function vfxZone(side, kind) {
    const mine = side === my;
    if (kind === 'deck') return byId(mine ? 'myDeck' : 'oppDeck');
    if (kind === 'hell') return byId(mine ? 'myHell' : 'oppHell');
    if (kind === 'hand') return byId(mine ? 'myHandRow' : 'oppHandRow');
    return null;
  }
  function vfxCardEl(k) {
    return k ? document.querySelector(`#board [data-cid="${k}"]`) : null;
  }
  function vfxHandTarget(side, cardId) {
    return vfxCardEl(cardId) || vfxZone(side, 'hand');
  }
  function vfxFlash(text, cls, ms) {
    const layer = vfxLayer(); if (!layer || !text) return;
    const el = document.createElement('div');
    el.className = 'vfx-flash' + (cls ? ' ' + cls : '');
    el.textContent = text;
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 280); }, ms || 1100);
  }
  function vfxSpawnSlash(atEl) {
    const layer = vfxLayer(); const r = vfxRect(atEl); if (!layer || !r) return;
    const el = document.createElement('div');
    el.className = 'vfx-slash';
    el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 620);
  }
  function vfxShake(el, ms) {
    if (!el) return;
    el.classList.remove('vfx-shake');
    void el.offsetWidth;
    el.classList.add('vfx-shake');
    setTimeout(() => el.classList.remove('vfx-shake'), ms || 480);
  }
  /**
   * ลากการ์ดจาก from → to
   * flip: เริ่มหลังการ์ด แล้วพลิกหงายกลางทาง (จั่ว/ธรณีสูบ)
   */
  function vfxFlyReveal(opts) {
    return new Promise(resolve => {
      const layer = vfxLayer();
      const fr = vfxRect(opts.from), tr = vfxRect(opts.to);
      if (!layer || !fr || !tr) { resolve(); return; }
      const dur = opts.dur || 720;
      const w = opts.w || Math.max(44, Math.min(fr.w || 58, 88));
      const h = w * (716 / 512);
      const g = document.createElement('div');
      g.className = 'vfx-card' + (opts.cls ? ' ' + opts.cls : '');
      g.style.width = w + 'px';
      g.style.height = h + 'px';
      g.style.left = (fr.x - w / 2) + 'px';
      g.style.top = (fr.y - h / 2) + 'px';
      const faceStyle = opts.img ? `background-image:url('${esc(opts.img)}')` : '';
      g.innerHTML = `<div class="vfx-flip${opts.startFaceUp ? ' is-up' : ''}">`
        + `<div class="vfx-back"></div>`
        + `<div class="vfx-face" style="${faceStyle}"></div>`
        + `</div>`;
      layer.appendChild(g);
      const dx = tr.x - fr.x, dy = tr.y - fr.y;
      const endScale = opts.endScale != null ? opts.endScale : 1;
      const endOp = opts.endOpacity != null ? opts.endOpacity : 1;
      const spin = opts.spin != null ? opts.spin : 0;
      void g.offsetWidth;
      const flipEl = g.querySelector('.vfx-flip');
      if (opts.flip && flipEl && !opts.startFaceUp) {
        setTimeout(() => flipEl.classList.add('is-up'), Math.floor(dur * (opts.flipAt != null ? opts.flipAt : 0.38)));
      }
      const anim = g.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.45}px,${dy * 0.4 - 18}px) rotate(${spin * 0.5}deg) scale(1.04)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px,${dy}px) rotate(${spin}deg) scale(${endScale})`, opacity: endOp, offset: 1 }
      ], { duration: dur, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' });
      const finish = () => { try { g.remove(); } catch (e) { } resolve(); };
      anim.onfinish = finish;
      setTimeout(finish, dur + 80);
    });
  }
  function vfxHidePending(ids) {
    ids.forEach(k => {
      pendingReveal.add(k);
      const el = document.querySelector(`[data-cid="${k}"]`);
      if (el) el.classList.add('vfx-hide');
    });
  }
  function vfxShowLanded(k) {
    pendingReveal.delete(k);
    const el = document.querySelector(`[data-cid="${k}"]`);
    if (!el) return;
    el.classList.remove('vfx-hide', 'deal', 'deal-land');
    void el.offsetWidth;
    // จั่วขึ้นมือ = ตั้งตรง (dealIn) — ห้ามใช้ deal-land ที่หมุน 90° ของแลนด์บนสนาม
    el.classList.add('deal');
    setTimeout(() => el.classList.remove('deal'), 600);
  }
  /** จั่ว / ขึ้นมือ: ลากเปิดจากเด็คทีละใบ */
  async function vfxPlayDrawSeq(items) {
    if (!items || !items.length) return;
    const ids = items.map(it => it.k);
    vfxHidePending(ids);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const side = it.p || (st && BoTEngine.ownerOf(st, it.k));
      const from = vfxZone(side, 'deck');
      const to = vfxHandTarget(side, it.k);
      const c = st && st.inst[it.k];
      const showFace = !!(c && (side === my || mode === 'solo' || c.faceUp || c.revealed));
      await vfxFlyReveal({
        from, to, img: c ? c.img : '', flip: showFace, startFaceUp: false,
        cls: 'vfx-draw', dur: 780, spin: side === my ? -6 : 6,
        endScale: 1, endOpacity: 0.05, flipAt: 0.42
      });
      vfxShowLanded(it.k);
      if (from) {
        from.classList.remove('vfx-deck-nudge');
        void from.offsetWidth;
        from.classList.add('vfx-deck-nudge');
        setTimeout(() => from.classList.remove('vfx-deck-nudge'), 280);
      }
      if (i < items.length - 1) await vfxSleep(160);
    }
    ids.forEach(k => pendingReveal.delete(k));
  }
  /** ธรณีสูบ: ค่อยๆ พลิกเปิดแล้วเลื่อนลงนรกทีละใบ */
  async function vfxPlayMillSeq(items) {
    if (!items || !items.length) return;
    vfxFlash('🌊 ธรณีสูบ', 'vfx-mill-flash', 1000);
    await vfxSleep(220);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const from = vfxZone(it.p, 'deck');
      const to = vfxZone(it.p, 'hell');
      const c = st && st.inst[it.k];
      await vfxFlyReveal({
        from, to, img: c ? c.img : '', flip: true, startFaceUp: false,
        cls: 'vfx-mill', dur: 860, spin: 10, endScale: 0.62, endOpacity: 0.2, flipAt: 0.35
      });
      if (to) {
        to.classList.remove('vfx-hell-pulse');
        void to.offsetWidth;
        to.classList.add('vfx-hell-pulse');
        setTimeout(() => to.classList.remove('vfx-hell-pulse'), 650);
      }
      if (it.name) {
        const tip = document.createElement('div');
        tip.className = 'vfx-mill-name';
        tip.textContent = it.name;
        const layer = vfxLayer();
        const hr = vfxRect(to);
        if (layer && hr) {
          tip.style.left = hr.x + 'px';
          tip.style.top = (hr.y - 36) + 'px';
          layer.appendChild(tip);
          requestAnimationFrame(() => tip.classList.add('show'));
          setTimeout(() => { tip.classList.remove('show'); setTimeout(() => tip.remove(), 250); }, 700);
        }
      }
      if (i < items.length - 1) await vfxSleep(220);
    }
  }
  /** สอดแนม: เปิดหน้าต่างให้ทั้งสองฝั่งเห็น + การ์ดโผล่ทีละใบในหน้าต่าง */
  async function vfxPlayScoutWindow(side, ids) {
    vfxFlash('👁 สอดแนม — ทั้งสองฝั่งเห็น', 'vfx-scout-flash', 1300);
    const ov = byId('pileView');
    if (ov) {
      ov.classList.add('scout-reveal');
      setTimeout(() => ov.classList.remove('scout-reveal'), 900);
    }
    const deck = vfxZone(side, 'deck');
    if (deck) {
      deck.classList.remove('vfx-scout-deck');
      void deck.offsetWidth;
      deck.classList.add('vfx-scout-deck');
      setTimeout(() => deck.classList.remove('vfx-scout-deck'), 1000);
    }
    // การ์ดในหน้าต่างโผล่ทีละใบ
    const slots = ov ? ov.querySelectorAll('#pileGrid .sc-slot, #pileGrid .card') : [];
    slots.forEach((el, i) => {
      el.classList.add('scout-deal');
      el.style.animationDelay = (80 + i * 140) + 'ms';
    });
    await vfxSleep(180 + Math.min(slots.length, 6) * 140);
  }
  /** โจมตี: การ์ดวิ่งไปชนเป้า */
  async function vfxPlayAttackCollide(atk, tgt) {
    const aEl = vfxCardEl(atk);
    let tEl = vfxCardEl(tgt);
    if (!tEl && st) {
      const z = BoTEngine.zoneOf(st, tgt);
      if (z && z.endsWith('.life')) tEl = byId(z[0] === my ? 'myLifeZone' : 'oppLifeZone');
    }
    if (!aEl || !tEl) return;
    const layer = vfxLayer();
    const fr = vfxRect(aEl), tr = vfxRect(tEl);
    if (!layer || !fr || !tr) return;
    const img = st.inst[atk] ? st.inst[atk].img : '';
    aEl.classList.add('atk-strike');
    setTimeout(() => aEl.classList.remove('atk-strike'), 800);
    const w = 78, h = w * (716 / 512);
    const g = document.createElement('div');
    g.className = 'vfx-card vfx-lunge';
    g.style.width = w + 'px'; g.style.height = h + 'px';
    g.style.left = (fr.x - w / 2) + 'px'; g.style.top = (fr.y - h / 2) + 'px';
    g.innerHTML = `<div class="vfx-flip is-up"><div class="vfx-back"></div><div class="vfx-face" style="background-image:url('${esc(img)}')"></div></div>`;
    layer.appendChild(g);
    const dx = tr.x - fr.x, dy = tr.y - fr.y;
    void g.offsetWidth;
    const anim = g.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.5 - 24}px) scale(1.08) rotate(-4deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy}px) scale(1.18) rotate(2deg)`, opacity: 1, offset: 0.82 },
      { transform: `translate(${dx}px,${dy}px) scale(1.05) rotate(0deg)`, opacity: 0, offset: 1 }
    ], { duration: 780, easing: 'cubic-bezier(.18,.7,.2,1)', fill: 'forwards' });
    await vfxSleep(620);
    vfxSpawnSlash(tEl);
    vfxShake(byId('board'), 480);
    tEl.classList.remove('atk-hit');
    void tEl.offsetWidth;
    tEl.classList.add('atk-hit');
    setTimeout(() => tEl.classList.remove('atk-hit'), 750);
    await new Promise(r => { anim.onfinish = r; setTimeout(r, 820); });
    try { g.remove(); } catch (e) { }
  }
  function playFxAnims(fx) {
    if (!fx || vfxReduced()) return;
    const job = async () => {
      try {
        const draws = (fx.drawnList && fx.drawnList.length)
          ? fx.drawnList.slice()
          : (fx.drawn ? [{ p: BoTEngine.ownerOf(st, fx.drawn), k: fx.drawn }] : []);
        if (draws.length) await vfxPlayDrawSeq(draws);
        if (fx.milled && fx.milled.length) await vfxPlayMillSeq(fx.milled);
        if (fx.scoutView) {
          const side = (st && st.scout && st.scout.p) || fx.scoutView.p;
          const ids = (st && st.scout && st.scout.ids)
            || ((st.prompts || [])[0] && (st.prompts[0].ids || []))
            || [];
          await vfxPlayScoutWindow(side, ids);
        }
        if (fx.atkLunge && fx.atkLunge.atk) await vfxPlayAttackCollide(fx.atkLunge.atk, fx.atkLunge.tgt);
      } catch (e) { /* ignore VFX errors */ }
    };
    vfxBusy = vfxBusy.then(job, job);
  }

  function toast(msg, ms) {
    const t = byId('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms || 2600);
  }
  function inviteURL() {
    if (netKind === 'lan' && typeof BotLAN !== 'undefined') return BotLAN.inviteURL(room);
    return location.origin + location.pathname.replace(/\/?$/, '/') + '?room=' + room;
  }
  function copyInvite() {
    const url = inviteURL();
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
      () => toast('คัดลอกลิงก์แล้ว — ส่งให้เพื่อนเปิดได้เลย: ' + url, 4000),
      () => toast('ลิงก์เชิญ: ' + url, 6000));
  }
  function updateRoomShareUI() {
    const hint = byId('roomShareHint');
    const qr = byId('roomQr');
    if (hint) {
      hint.textContent = netKind === 'lan'
        ? 'ห้อง LAN — ส่งรหัส/QR ให้เพื่อน · ใช้ Wi‑Fi หรือฮอตสปอตเดียวกัน (ตอนจับคู่ต้องมีเน็ต)'
        : 'แชร์รหัสนี้ให้เพื่อน';
    }
    if (qr) {
      if (netKind === 'lan' && room && typeof BotLAN !== 'undefined') {
        qr.src = BotLAN.qrDataUrl(inviteURL(), 160);
        qr.classList.remove('hidden');
      } else {
        qr.removeAttribute('src');
        qr.classList.add('hidden');
      }
    }
  }

  /* ── WebSocket ── */
  function wsURL() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
  function wsSend(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  function connect(onOpen) {
    wsWanted = true;
    netKind = 'ws';
    lanIsHost = false;
    ws = new WebSocket(wsURL());
    ws.onopen = () => { clearTimeout(reconT); if (onOpen) onOpen(); };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'joined') {
        mode = 'online'; room = m.room; seat = m.seat; seqNum = m.seq;
        history.replaceState(null, '', '/?room=' + room);
        if (m.phase === 'play' && m.state) {
          ensurePlayReady().then(() => {
            st = m.state; startTable();
            if (seat === 'S') toast('เกมกำลังดำเนินอยู่ — คุณเข้าชมในฐานะผู้ชม');
          });
        }
        else { myReady = false; fillDeckSelect(); showScreen('room'); renderRoom(); }
        return;
      }
      if (m.t === 'room') {
        roomSt = m;
        if (seat !== 'S') myReady = !!m[seat].ready;
        if (m.phase === 'wait' && !byId('table').classList.contains('hidden')) { st = null; fillDeckSelect(); showScreen('room'); } // รีแมตช์
        renderRoom(); if (st) render();
        return;
      }
      if (m.t === 'start') {
        ensurePlayReady().then(() => {
          st = m.state; seqNum = m.seq; gameStart = Date.now(); selMap = {}; startTable();
        });
        return;
      }
      if (m.t === 'end') { showEnd(m.winner, m.nick); return; }
      if (m.t === 'action') {
        if (!st) return;
        if (m.seq !== seqNum + 1) { wsSend({ t: 'sync' }); return; }
        seqNum = m.seq; applyA(m.a); return;
      }
      if (m.t === 'snapshot') { st = m.state; seqNum = m.seq; render(); return; }
      if (m.t === 'deny') { toast('🚫 ' + m.m, 3200); return; }
      if (m.t === 'error') { byId('lobbyMsg').textContent = m.m; toast(m.m); return; }
    };
    ws.onclose = () => {
      if (!wsWanted) return;
      if (mode === 'online' && room) {
        toast('หลุดการเชื่อมต่อ — กำลังต่อใหม่…');
        reconT = setTimeout(() => connect(() => wsSend({ t: 'join', room, nick })), 2500);
      }
    };
  }
  function leaveOnline() {
    clearLanDropUi();
    hideLanChallengeModal();
    lanExpectClose = true;
    wsWanted = false; clearTimeout(reconT);
    if (ws) { try { wsSend({ t: 'leave' }); ws.close(); } catch (e) { } ws = null; }
    if (lanSession) {
      try { lanSession.send({ t: 'leave' }); } catch (e) { }
      try { lanSession.destroy(); } catch (e2) { }
      lanSession = null;
    }
    mode = null; netKind = null; lanIsHost = false; room = ''; st = null; roomSt = null; myReady = false;
    lanDecks = { A: null, B: null }; lanDeckNames = { A: '', B: '' };
    lanPeerLeftOk = false; lanReconnecting = false;
    lanAutoMatch = false; lanMatchDeckKey = null;
    history.replaceState(null, '', location.pathname || '/');
    clearPersistedTable();
    updateRoomShareUI();
    const backHall = lanReturnToHall;
    lanReturnToHall = false;
    if (backHall) {
      presenceSetStatus('idle');
      openLanHall();
    } else {
      stopPresence();
      showScreen('menu');
    }
  }

  /* ── LAN หลุด: รอเพื่อน / เชื่อมต่อใหม่ ── */
  function clearLanDropUi() {
    if (lanDropTick) { clearInterval(lanDropTick); lanDropTick = null; }
    lanDropMode = null; lanDropWaiting = false; lanDropDeadline = 0;
    const modal = byId('lanDropModal');
    if (modal) modal.classList.add('hidden');
  }
  function fmtLanWait(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }
  function refreshLanDropTimer() {
    const timerEl = byId('lanDropTimer');
    const msgEl = byId('lanDropMsg');
    if (!lanDropDeadline) {
      if (timerEl) timerEl.textContent = '';
      return;
    }
    const left = lanDropDeadline - Date.now();
    if (timerEl) timerEl.textContent = fmtLanWait(left);
    if (msgEl && lanDropMode === 'wait' && lanDropWaiting) {
      msgEl.textContent = left > 0 ? 'รอคู่ต่อสู้เชื่อมต่อกลับ…' : 'หมดเวลารอ';
    }
    if (msgEl && lanDropMode === 'reconnect' && lanDropWaiting) {
      msgEl.textContent = left > 0 ? 'กด「เชื่อมต่อใหม่」ได้ตลอดจนกว่าจะหมดเวลา' : 'หมดเวลาเชื่อมต่อ';
    }
    if (left <= 0) onLanDropTimeout();
  }
  function startLanDropCountdown() {
    lanDropWaiting = true;
    lanDropDeadline = Date.now() + LAN_WAIT_MS;
    if (lanDropTick) clearInterval(lanDropTick);
    refreshLanDropTimer();
    lanDropTick = setInterval(refreshLanDropTimer, 250);
    const act = byId('lanDropAction');
    if (lanDropMode === 'wait' && act) {
      act.textContent = 'รออยู่…';
      act.disabled = true;
    }
  }
  function showLanDropModal(mode) {
    lanDropMode = mode;
    lanDropWaiting = false;
    lanDropDeadline = 0;
    if (lanDropTick) { clearInterval(lanDropTick); lanDropTick = null; }
    const modal = byId('lanDropModal');
    const title = byId('lanDropTitle');
    const sub = byId('lanDropSub');
    const timer = byId('lanDropTimer');
    const msg = byId('lanDropMsg');
    const act = byId('lanDropAction');
    const leave = byId('lanDropLeave');
    if (!modal) return;
    if (timer) timer.textContent = '';
    if (act) { act.disabled = false; act.classList.remove('hidden'); }
    if (mode === 'wait') {
      if (title) title.textContent = 'คู่ต่อสู้หลุดการเชื่อมต่อ';
      if (sub) sub.textContent = 'รอให้เขากลับมาไหม? สูงสุด 3 นาที — เกมยังไม่จบจนกว่าจะเลิกรอหรือหมดเวลา';
      if (msg) msg.textContent = 'มือถือมักหลุดตอนสลับแอปหรือ Wi‑Fi อ่อน';
      if (act) act.textContent = 'รอ 3 นาที';
      if (leave) leave.textContent = 'ออกเลย';
    } else {
      if (title) title.textContent = 'หลุดจากห้อง LAN';
      if (sub) sub.textContent = 'ต้องการเชื่อมต่อใหม่ไหม? มีเวลาประมาณ 3 นาทีก่อนออกจากห้อง';
      if (msg) msg.textContent = 'โฮสต์ต้องเปิดห้องค้างไว้ และอยู่ Wi‑Fi / ฮอตสปอตเดียวกัน';
      if (act) act.textContent = 'เชื่อมต่อใหม่';
      if (leave) leave.textContent = 'ออกเมนู';
    }
    modal.classList.remove('hidden');
  }
  function beginLanDropWait() {
    if (lanDropMode === 'wait' && byId('lanDropModal') && !byId('lanDropModal').classList.contains('hidden')) return;
    showLanDropModal('wait');
  }
  function beginLanDropReconnect() {
    if (lanReconnecting) return;
    showLanDropModal('reconnect');
    startLanDropCountdown(); // ฝั่งที่หลุดเริ่มนับเลย แล้วกดเชื่อมต่อเมื่อพร้อม
  }
  function onLanDropTimeout() {
    if (lanDropTick) { clearInterval(lanDropTick); lanDropTick = null; }
    if (lanDropMode === 'wait') {
      toast('หมดเวลารอ — คู่ต่อสู้ไม่กลับมา');
      finishLanPeerGone();
    } else if (lanDropMode === 'reconnect') {
      toast('หมดเวลาเชื่อมต่อ — กลับเมนู');
      clearLanDropUi();
      leaveOnline();
    }
  }
  function finishLanPeerGone() {
    clearLanDropUi();
    if (!roomSt) return;
    const oppSeat = lanIsHost ? 'B' : 'A';
    roomSt[oppSeat] = { nick: '', ready: false, online: false, deckName: '' };
    if (oppSeat === 'B') lanDecks.B = null;
    else lanDecks.A = null;
    if (st) {
      st = null;
      fillDeckSelect();
      showScreen('room');
    }
    if (lanIsHost) lanBroadcastRoom();
    renderRoom();
  }
  function onLanPeerRestored() {
    if (lanDropMode === 'wait' || lanDropMode === 'reconnect') {
      clearLanDropUi();
      toast('เชื่อมต่อกลับแล้ว', 2500);
    }
  }
  function tryLanReconnect() {
    if (typeof BotLAN === 'undefined') { toast('โหลดระบบ LAN ไม่สำเร็จ'); return; }
    if (!room || lanIsHost) return;
    if (lanReconnecting) return;
    lanReconnecting = true;
    const act = byId('lanDropAction');
    const msg = byId('lanDropMsg');
    if (act) { act.disabled = true; act.textContent = 'กำลังเชื่อม…'; }
    if (msg) msg.textContent = 'กำลังเชื่อมต่อโฮสต์ใหม่…';
    const code = room;
    lanExpectClose = true;
    const old = lanSession;
    lanSession = null;
    try { if (old) old.destroy(); } catch (e) { }
    BotLAN.join(code, {
      onMessage: onLanMessage,
      onClose: () => {
        if (lanExpectClose || lanReconnecting) return;
        beginLanDropReconnect();
      },
      onError: (err) => toast((err && err.message) || 'LAN error'),
    }).then(api => {
      lanExpectClose = false;
      lanReconnecting = false;
      lanSession = api;
      lanIsHost = false;
      netKind = 'lan';
      mode = 'online';
      lanSend({ t: 'hello', nick: myNick() || 'ผู้เล่น B', uid: myUid(), skins: mySkinPayload() });
      if (st) lanSend({ t: 'sync' });
      onLanPeerRestored();
      if (myReady) {
        const d = selectedDeck();
        lanSend({ t: 'ready', ready: true, deck: d ? d.spec : null, deckName: d ? d.name : '', skins: mySkinPayload() });
      }
    }).catch(err => {
      lanReconnecting = false;
      lanExpectClose = false;
      if (act) { act.disabled = false; act.textContent = 'เชื่อมต่อใหม่'; }
      if (msg) msg.textContent = (err && err.message) || 'เชื่อมไม่สำเร็จ — ลองอีกครั้ง';
      toast(msg ? msg.textContent : 'เชื่อมต่อไม่สำเร็จ', 4000);
      if (!lanDropMode) beginLanDropReconnect();
    });
  }

  function lanSend(msg) {
    return !!(lanSession && lanSession.send && lanSession.send(msg));
  }
  function mySkinPayload() {
    return window.BotSkins ? BotSkins.exportIds() : null;
  }
  function rememberSkins(who, skins) {
    if (!roomSt || !roomSt[who] || !skins) return;
    roomSt[who].skins = skins;
  }
  function lanBroadcastRoom() {
    if (!lanIsHost || !roomSt) return;
    lanSend({
      t: 'room', phase: roomSt.phase,
      A: roomSt.A, B: roomSt.B, specs: 0,
    });
  }
  function lanEmptyRoom(hostNick) {
    return {
      phase: 'wait',
      A: { nick: hostNick || 'โฮสต์', ready: false, online: true, deckName: '' },
      B: { nick: '', ready: false, online: false, deckName: '' },
      specs: 0,
    };
  }
  function lanPrepareAction(a, fromSeat) {
    const out = Object.assign({}, a);
    if (!out.by) out.by = fromSeat === 'S' ? 'S' : fromSeat;
    if (out.seed == null) out.seed = (Math.random() * 0xffffffff) >>> 0;
    if (out.type === 'dice' && out.v == null) out.v = 1 + Math.floor(Math.random() * 6);
    if (out.type === 'coin' && out.v == null) out.v = Math.random() < .5 ? 'หัว' : 'ก้อย';
    if (out.type === 'shuffle' && !out.perm && st) {
      const p = out.by === 'A' || out.by === 'B' ? out.by : (out.p === 'B' ? 'B' : 'A');
      const len = (st.zones[p + '.deck'] || []).length;
      out.perm = Array.from({ length: len }, (_, i) => i);
      for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out.perm[i]; out.perm[i] = out.perm[j]; out.perm[j] = tmp;
      }
    }
    if (out.type === 'shuffleHand' && !out.perm && st) {
      const p = out.by === 'A' || out.by === 'B' ? out.by : (out.p === 'B' ? 'B' : 'A');
      const len = (st.zones[p + '.hand'] || []).length;
      out.perm = Array.from({ length: len }, (_, i) => i);
      for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out.perm[i]; out.perm[i] = out.perm[j]; out.perm[j] = tmp;
      }
    }
    return out;
  }
  function lanHostHandleAction(a, fromSeat) {
    if (!st) return;
    if (fromSeat === 'S' && a.type !== 'chat') {
      lanSend({ t: 'deny', m: 'ผู้ชมดูได้อย่างเดียว' });
      return;
    }
    const prepared = lanPrepareAction(a, fromSeat);
    const fx = applyA(prepared);
    if (fx && fx.deny) {
      if (fromSeat !== seat) lanSend({ t: 'deny', m: fx.deny });
      return;
    }
    seqNum += 1;
    lanSend({ t: 'action', a: prepared, seq: seqNum });
  }
  function lanHostStartGame() {
    if (!lanIsHost || !roomSt) return;
    if (!(roomSt.A.online && roomSt.B.online && roomSt.A.ready && roomSt.B.ready)) {
      toast('รอให้ครบ 2 คนและกดพร้อมทั้งคู่');
      return;
    }
    Promise.all([ensurePlayReady(), CardDB.load()]).then(([, db]) => {
      const dA = lanDecks.A || (starterDeck('SD01') || {}).spec;
      const dB = lanDecks.B || (starterDeck('SD01') || {}).spec;
      st = BoTEngine.buildInitialState(db.all, Math.random, { A: dA, B: dB });
      seqNum = 0;
      gameStart = Date.now();
      selMap = {};
      roomSt.phase = 'play';
      lanSend({ t: 'start', state: st, seq: 0 });
      reportTable('lan');
      startTable();
    }).catch(() => toast('โหลดข้อมูลการ์ดไม่สำเร็จ'));
  }
  function lanHostRematch() {
    if (!lanIsHost) return;
    st = null; seqNum = 0; myReady = false; selMap = {};
    lanDecks = { A: null, B: null };
    if (roomSt) {
      roomSt.phase = 'wait';
      roomSt.A.ready = false; roomSt.B.ready = false;
      roomSt.A.deckName = ''; roomSt.B.deckName = '';
    }
    lanBroadcastRoom();
    fillDeckSelect();
    showScreen('room');
    renderRoom();
    toast('รีแมตช์ — กดพร้อมใหม่ทั้งคู่');
  }
  function onLanMessage(m) {
    if (!m || !m.t) return;
    if (lanIsHost) {
      if (m.t === 'hello') {
        const wasOffline = !(roomSt && roomSt.B && roomSt.B.online);
        const keepNick = (roomSt && roomSt.B && roomSt.B.nick) || '';
        roomSt.B.online = true;
        roomSt.B.nick = (m.nick || keepNick || 'ผู้เล่น B').slice(0, 24);
        if (m.skins) rememberSkins('B', m.skins);
        if (!st) {
          roomSt.B.ready = false;
          roomSt.B.deckName = '';
          lanDecks.B = null;
        }
        lanPeerLeftOk = false;
        lanBroadcastRoom();
        renderRoom();
        if (st) lanSend({ t: 'snapshot', state: st, seq: seqNum });
        onLanPeerRestored();
        if (!lanAutoMatch) toast(wasOffline && st ? 'คู่ต่อสู้กลับมาแล้ว — ซิงก์กระดาน' : 'คู่ต่อสู้เข้าห้องแล้ว');
        maybeLanAutoReady();
        return;
      }
      if (m.t === 'ready') {
        roomSt.B.ready = !!m.ready;
        roomSt.B.deckName = m.deckName || roomSt.B.deckName || '';
        if (m.skins) rememberSkins('B', m.skins);
        if (m.ready && m.deck) lanDecks.B = m.deck;
        if (!m.ready) lanDecks.B = null;
        lanBroadcastRoom();
        renderRoom();
        maybeLanAutoStart();
        return;
      }
      if (m.t === 'start') { lanHostStartGame(); return; }
      if (m.t === 'action') { lanHostHandleAction(m.a || {}, 'B'); return; }
      if (m.t === 'rematch') { lanHostRematch(); return; }
      if (m.t === 'end') {
        const w = m.winner;
        const nickW = (roomSt && roomSt[w] && roomSt[w].nick) || '';
        lanSend({ t: 'end', winner: w, nick: nickW });
        showEnd(w, nickW);
        return;
      }
      if (m.t === 'leave') {
        lanPeerLeftOk = true;
        clearLanDropUi();
        roomSt.B = { nick: '', ready: false, online: false, deckName: '' };
        lanDecks.B = null;
        if (st) { st = null; fillDeckSelect(); showScreen('room'); }
        lanBroadcastRoom();
        renderRoom();
        toast('คู่ต่อสู้ออกจากห้อง');
        return;
      }
      if (m.t === 'sync' && st) {
        lanSend({ t: 'snapshot', state: st, seq: seqNum });
        return;
      }
      return;
    }
    // แขก
    if (m.t === 'room') {
      roomSt = m;
      if (seat !== 'S') myReady = !!m[seat].ready;
      if (m.phase === 'wait' && !byId('table').classList.contains('hidden')) {
        st = null; fillDeckSelect(); showScreen('room');
      }
      renderRoom();
      if (st) render();
      if (m.A && m.A.online) onLanPeerRestored();
      maybeLanAutoReady();
      return;
    }
    if (m.t === 'start') {
      ensurePlayReady().then(() => {
        st = m.state; seqNum = m.seq || 0; gameStart = Date.now(); selMap = {};
        lanAutoMatch = false;
        presenceSetStatus('busy');
        startTable();
      });
      return;
    }
    if (m.t === 'action') {
      if (!st) return;
      if (m.seq !== seqNum + 1) { lanSend({ t: 'sync' }); return; }
      seqNum = m.seq; applyA(m.a); return;
    }
    if (m.t === 'snapshot') {
      st = m.state; seqNum = m.seq;
      onLanPeerRestored();
      if (st && byId('table').classList.contains('hidden')) startTable();
      else render();
      return;
    }
    if (m.t === 'end') { showEnd(m.winner, m.nick); return; }
    if (m.t === 'deny') { toast('🚫 ' + m.m, 3200); return; }
    if (m.t === 'error') { toast(m.m || 'ห้อง LAN ปฏิเสธการเข้า'); leaveOnline(); return; }
  }

  /* ── LAN presence: เห็นใครออน → ท้าสู้ ── */
  function presenceUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/lan';
  }
  function presenceSend(msg) {
    if (!presenceWs || presenceWs.readyState !== 1) return false;
    try { presenceWs.send(JSON.stringify(msg)); return true; } catch (e) { return false; }
  }
  function presenceSetStatus(status) {
    presenceSend({ t: 'status', status: status === 'busy' ? 'busy' : 'idle' });
  }
  function lanHallNick() {
    const el = byId('inpLanNick');
    let n = el ? el.value.trim() : '';
    if (!n) n = myNick() || '';
    if (!n) n = 'ผู้เล่น';
    try {
      localStorage.setItem('bot_nick', n);
      if (byId('inpNick') && !byId('inpNick').value.trim()) byId('inpNick').value = n;
    } catch (e) { }
    if (el) el.value = n;
    return n.slice(0, 24);
  }
  function fillLanDeckSelects() {
    const keys = ['selLanDeck', 'selLanChallengeDeck'];
    let saved = {};
    try { saved = CardDB.savedDecks(); } catch (e) { }
    const names = Object.keys(saved);
    const savedOpts = (names.length ? `<option disabled>── เด็คที่บันทึก ──</option>` : '') +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const opts = starterOptionHtml('') + savedOpts;
    let act = 'starter:SD01';
    try { act = localStorage.getItem('bot_active_deck') || 'starter:SD01'; } catch (e) { }
    const ok = v => v && (v.indexOf('starter:') === 0 || saved[v]);
    keys.forEach(id => {
      const el = byId(id);
      if (!el) return;
      const prev = el.value;
      el.innerHTML = opts;
      el.value = ok(prev) ? prev : (ok(act) ? act : 'starter:SD01');
    });
  }
  function selectedLanDeckKey() {
    const el = byId('selLanDeck');
    return el && el.value ? el.value : 'starter:SD01';
  }
  function setLanHallStatus(text, kind) {
    const el = byId('lanHallStatus');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', kind === 'ok');
    el.classList.toggle('err', kind === 'err');
  }
  function renderLanPeerList() {
    const box = byId('lanPeerList');
    if (!box) return;
    const others = presencePeers.filter(p => p.id !== presenceId);
    if (!others.length) {
      box.innerHTML = '<div class="lan-peer-empty">ยังไม่มีใครอื่นในวง — รอเพื่อนเปิดหน้านี้<br><span style="font-size:11px">ให้เพื่อนเปิด URL เดียวกับที่คุณใช้อยู่</span></div>';
      return;
    }
    const challenging = outgoingChallenge && outgoingChallenge.id;
    box.innerHTML = others.map(p => {
      const busy = p.status === 'busy';
      const meta = busy
        ? '<span class="busy">● กำลังเล่น</span>'
        : '<span class="on">● พร้อมท้า</span>';
      let btn;
      if (challenging === p.id) {
        btn = `<button type="button" class="btn-dark" data-cancel-challenge="${p.id}">ยกเลิกคำท้า</button>`;
      } else if (busy || challenging) {
        btn = `<button type="button" class="btn-primary" disabled>ท้าสู้</button>`;
      } else {
        btn = `<button type="button" class="btn-primary" data-challenge="${p.id}" data-nick="${esc(p.nick || 'ผู้เล่น')}">ท้าสู้</button>`;
      }
      return `<div class="lan-peer">
        <div class="lan-peer-info">
          <div class="lan-peer-name">${esc(p.nick || 'ผู้เล่น')}</div>
          <div class="lan-peer-meta">${meta}</div>
        </div>${btn}</div>`;
    }).join('');
  }
  function hideLanChallengeModal() {
    incomingChallenge = null;
    const modal = byId('lanChallengeModal');
    if (modal) modal.classList.add('hidden');
  }
  function showLanChallengeModal(fromId, nick) {
    incomingChallenge = { id: fromId, nick: nick || 'ผู้เล่น' };
    fillLanDeckSelects();
    const title = byId('lanChallengeTitle');
    const sub = byId('lanChallengeSub');
    if (title) title.textContent = 'มีคำท้า!';
    if (sub) sub.textContent = (nick || 'ผู้เล่น') + ' ท้าคุณแข่ง — เลือกเด็คแล้วกดรับคำท้า';
    const modal = byId('lanChallengeModal');
    if (modal) modal.classList.remove('hidden');
  }
  function onPresenceMessage(m) {
    if (!m || !m.t) return;
    if (m.t === 'welcome') {
      presenceId = m.you;
      return;
    }
    if (m.t === 'peers') {
      if (m.you != null) presenceId = m.you;
      presencePeers = Array.isArray(m.list) ? m.list : [];
      setLanHallStatus('ออนไลน์ในล็อบบี้ · ' + Math.max(0, presencePeers.length) + ' คน', 'ok');
      renderLanPeerList();
      return;
    }
    if (m.t === 'challenged') {
      showLanChallengeModal(m.from, m.nick);
      toast((m.nick || 'ผู้เล่น') + ' ท้าคุณ!', 3500);
      return;
    }
    if (m.t === 'challengeSent') {
      outgoingChallenge = { id: m.to, nick: m.nick || 'ผู้เล่น' };
      setLanHallStatus('รอ ' + (m.nick || 'ผู้เล่น') + ' ตอบคำท้า…');
      renderLanPeerList();
      return;
    }
    if (m.t === 'challengeGone') {
      if (incomingChallenge && incomingChallenge.id === m.from) {
        hideLanChallengeModal();
        toast('คู่ท้ายกเลิกคำท้า');
      }
      return;
    }
    if (m.t === 'challengeResult') {
      outgoingChallenge = null;
      renderLanPeerList();
      if (!m.accept) {
        setLanHallStatus(m.reason === 'offline' ? 'คู่ท้าออฟไลน์แล้ว' : 'คำท้าถูกปฏิเสธ', 'err');
        toast(m.reason === 'offline' ? 'คู่ท้าออฟไลน์แล้ว' : (m.nick || 'คู่ท้า') + ' ปฏิเสธคำท้า');
        return;
      }
      // เราเป็นโฮสต์ (คนท้า)
      lanMatchDeckKey = selectedLanDeckKey();
      lanAutoMatch = true;
      lanReturnToHall = true;
      setLanHallStatus('รับคำท้าแล้ว — กำลังเปิดห้อง…', 'ok');
      toast('เริ่มแมตช์กับ ' + (m.oppNick || m.nick || 'คู่ท้า'));
      startLanHost().then(() => {
        if (lanSession && m.oppId) presenceSend({ t: 'matchCode', to: m.oppId, code: room });
      });
      return;
    }
    if (m.t === 'matchReady') {
      // เรารับคำท้า — รอรหัสห้องจากโฮสต์
      lanAutoMatch = true;
      lanReturnToHall = true;
      setLanHallStatus('กำลังรอรหัสห้องจาก ' + (m.oppNick || 'โฮสต์') + '…', 'ok');
      return;
    }
    if (m.t === 'matchCode') {
      hideLanChallengeModal();
      setLanHallStatus('กำลังเข้าห้อง…', 'ok');
      joinLanRoom(m.code);
      return;
    }
    if (m.t === 'error') {
      toast(m.m || 'ล็อบบี้ LAN ผิดพลาด');
      setLanHallStatus(m.m || 'ผิดพลาด', 'err');
      outgoingChallenge = null;
      renderLanPeerList();
    }
  }
  function stopPresence() {
    presenceWanted = false;
    clearTimeout(presenceReconT);
    outgoingChallenge = null;
    hideLanChallengeModal();
    if (presenceWs) {
      try { presenceSend({ t: 'leave' }); } catch (e) { }
      try { presenceWs.close(); } catch (e2) { }
      presenceWs = null;
    }
    presenceId = null;
    presencePeers = [];
  }
  function connectPresence() {
    presenceWanted = true;
    clearTimeout(presenceReconT);
    if (presenceWs && (presenceWs.readyState === 0 || presenceWs.readyState === 1)) return;
    setLanHallStatus('กำลังเชื่อมล็อบบี้…');
    let sock;
    try { sock = new WebSocket(presenceUrl()); }
    catch (e) {
      setLanHallStatus('เชื่อมล็อบบี้ไม่ได้ — รัน node server.js แล้วเปิดผ่าน IP โฮสต์', 'err');
      return;
    }
    presenceWs = sock;
    sock.onopen = () => {
      presenceSend({ t: 'hello', nick: lanHallNick(), uid: myUid() });
      setLanHallStatus('เชื่อมล็อบบี้แล้ว', 'ok');
    };
    sock.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      onPresenceMessage(m);
    };
    sock.onclose = () => {
      if (presenceWs === sock) presenceWs = null;
      presenceId = null;
      presencePeers = [];
      renderLanPeerList();
      if (!presenceWanted) return;
      setLanHallStatus('หลุดจากล็อบบี้ — กำลังต่อใหม่…', 'err');
      presenceReconT = setTimeout(connectPresence, 2000);
    };
    sock.onerror = () => {
      setLanHallStatus('เชื่อมล็อบบี้ไม่ได้ — ต้องรัน node server.js (ไม่ใช่แค่ Apache/XAMPP)', 'err');
    };
  }
  function openLanHall(instant) {
    presenceWanted = true;
    try {
      const nickEl = byId('inpLanNick');
      if (nickEl && !nickEl.value) nickEl.value = localStorage.getItem('bot_nick') || '';
    } catch (e) { }
    ensurePlayReady().then(() => fillLanDeckSelects()).catch(() => fillLanDeckSelects());
    showScreen('lanHall', instant);
    connectPresence();
    renderLanPeerList();
  }
  function tryChallengePeer(id, nick) {
    if (!presenceWs || presenceWs.readyState !== 1) {
      toast('ยังไม่เชื่อมล็อบบี้');
      return;
    }
    const deckKey = selectedLanDeckKey();
    const deck = resolveDeckChoice(deckKey);
    if (!deck || !deck.spec) { toast('เลือกเด็คก่อนท้าสู้'); return; }
    const name = lanHallNick();
    if (!name) { toast('ใส่ชื่อเล่นก่อน'); return; }
    try { localStorage.setItem('bot_active_deck', deckKey); } catch (e) { }
    lanMatchDeckKey = deckKey;
    presenceSend({ t: 'nick', nick: name });
    presenceSend({ t: 'challenge', to: id });
    setLanHallStatus('กำลังท้า ' + (nick || 'ผู้เล่น') + '…');
  }
  function acceptLanChallenge() {
    if (!incomingChallenge) return;
    const deckEl = byId('selLanChallengeDeck');
    const deckKey = deckEl && deckEl.value ? deckEl.value : selectedLanDeckKey();
    const deck = resolveDeckChoice(deckKey);
    if (!deck || !deck.spec) { toast('เลือกเด็คก่อนรับคำท้า'); return; }
    try { localStorage.setItem('bot_active_deck', deckKey); } catch (e) { }
    lanMatchDeckKey = deckKey;
    const hallDeck = byId('selLanDeck');
    if (hallDeck) hallDeck.value = deckKey;
    presenceSend({ t: 'nick', nick: lanHallNick() });
    presenceSend({ t: 'challengeResp', accept: true });
    hideLanChallengeModal();
    setLanHallStatus('รับคำท้าแล้ว — รอโฮสต์เปิดห้อง…', 'ok');
  }
  function declineLanChallenge() {
    if (!incomingChallenge) { hideLanChallengeModal(); return; }
    presenceSend({ t: 'challengeResp', accept: false });
    hideLanChallengeModal();
    toast('ปฏิเสธคำท้าแล้ว');
  }
  function maybeLanAutoReady() {
    if (!lanAutoMatch || netKind !== 'lan' || !roomSt) return;
    const deck = resolveDeckChoice(lanMatchDeckKey || selectedLanDeckKey());
    if (!deck) return;
    try {
      const key = lanMatchDeckKey || selectedLanDeckKey();
      localStorage.setItem('bot_active_deck', key);
      const sel = byId('selDeck');
      if (sel) {
        fillDeckSelect();
        if ([...sel.options].some(o => o.value === key)) sel.value = key;
      }
    } catch (e) { }
    if (myReady) {
      maybeLanAutoStart();
      return;
    }
    myReady = true;
    if (lanIsHost) {
      roomSt.A.ready = true;
      roomSt.A.deckName = deck.name || '';
      roomSt.A.nick = myNick() || lanHallNick() || roomSt.A.nick;
      rememberSkins('A', mySkinPayload());
      lanDecks.A = deck.spec;
      lanBroadcastRoom();
      renderRoom();
      maybeLanAutoStart();
    } else {
      lanSend({ t: 'ready', ready: true, deck: deck.spec, deckName: deck.name || '', skins: mySkinPayload() });
      renderRoom();
    }
  }
  function maybeLanAutoStart() {
    if (!lanAutoMatch || !lanIsHost || !roomSt) return;
    if (roomSt.A.online && roomSt.B.online && roomSt.A.ready && roomSt.B.ready) {
      lanAutoMatch = false;
      presenceSetStatus('busy');
      lanHostStartGame();
    }
  }

  function startLanHost() {
    if (typeof BotLAN === 'undefined') { toast('โหลดระบบ LAN ไม่สำเร็จ'); return Promise.reject(new Error('no BotLAN')); }
    const lobbyMsg = byId('lobbyMsg');
    if (lobbyMsg) lobbyMsg.textContent = 'กำลังสร้างห้อง LAN…';
    realMode = false;
    lanExpectClose = false;
    lanPeerLeftOk = false;
    return BotLAN.host({
      onMessage: onLanMessage,
      onPeerConnect: () => {
        if (lanDropMode === 'wait') {
          const msg = byId('lanDropMsg');
          if (msg) msg.textContent = 'พบการเชื่อมต่อใหม่ — กำลังซิงก์…';
        }
      },
      onPeerClose: () => {
        if (lanExpectClose) { lanExpectClose = false; return; }
        if (lanPeerLeftOk) { lanPeerLeftOk = false; return; }
        if (!roomSt) return;
        if (roomSt.B) {
          roomSt.B.online = false;
          roomSt.B.ready = false;
        }
        renderRoom();
        beginLanDropWait();
        toast('การเชื่อมต่อคู่ต่อสู้หลุด');
      },
      onError: (err) => toast((err && err.message) || 'LAN error'),
    }).then(api => {
      lanSession = api;
      lanIsHost = true;
      netKind = 'lan';
      mode = 'online';
      room = api.code;
      seat = 'A';
      myReady = false;
      lanDecks = { A: null, B: null };
      lanDeckNames = { A: '', B: '' };
      const hostNick = (lanAutoMatch ? lanHallNick() : myNick()) || 'โฮสต์';
      roomSt = lanEmptyRoom(hostNick);
      rememberSkins('A', mySkinPayload());
      history.replaceState(null, '', '?lan=' + room);
      fillDeckSelect();
      if (lanMatchDeckKey) {
        try {
          const sel = byId('selDeck');
          if (sel && [...sel.options].some(o => o.value === lanMatchDeckKey)) sel.value = lanMatchDeckKey;
        } catch (e) { }
      }
      showScreen('room');
      renderRoom();
      updateRoomShareUI();
      if (lobbyMsg) lobbyMsg.textContent = '';
      if (lanAutoMatch) toast('รอคู่ท้าเข้าห้อง…', 2500);
      else toast('สร้างห้อง LAN ' + room + ' แล้ว — ส่งรหัสให้เพื่อน', 4000);
      return api;
    }).catch(err => {
      if (lobbyMsg) lobbyMsg.textContent = (err && err.message) || 'สร้างห้อง LAN ไม่สำเร็จ';
      toast((err && err.message) || 'สร้างห้อง LAN ไม่สำเร็จ');
      lanAutoMatch = false;
      throw err;
    });
  }
  function joinLanRoom(code) {
    if (typeof BotLAN === 'undefined') { toast('โหลดระบบ LAN ไม่สำเร็จ'); return; }
    const clean = BotLAN.parseCode(code || (byId('inpRoom') && byId('inpRoom').value));
    const lobbyMsg = byId('lobbyMsg');
    if (clean.length !== 6) {
      if (lobbyMsg) lobbyMsg.textContent = 'รหัสห้องต้องมี 6 ตัวอักษร';
      toast('รหัสห้องต้องมี 6 ตัวอักษร');
      return;
    }
    if (lobbyMsg) lobbyMsg.textContent = 'กำลังเข้าห้อง LAN…';
    realMode = false;
    lanExpectClose = false;
    BotLAN.join(clean, {
      onMessage: onLanMessage,
      onClose: () => {
        if (lanExpectClose || lanReconnecting) return;
        if (!(mode === 'online' && netKind === 'lan')) return;
        beginLanDropReconnect();
        toast('หลุดจากโฮสต์ LAN');
      },
      onError: (err) => toast((err && err.message) || 'LAN error'),
    }).then(api => {
      lanSession = api;
      lanIsHost = false;
      netKind = 'lan';
      mode = 'online';
      room = clean;
      seat = 'B';
      myReady = false;
      history.replaceState(null, '', '?lan=' + room);
      const guestNick = (lanAutoMatch ? lanHallNick() : myNick()) || 'ผู้เล่น B';
      lanSend({ t: 'hello', nick: guestNick, uid: myUid(), skins: mySkinPayload() });
      fillDeckSelect();
      if (lanMatchDeckKey) {
        try {
          const sel = byId('selDeck');
          if (sel && [...sel.options].some(o => o.value === lanMatchDeckKey)) sel.value = lanMatchDeckKey;
        } catch (e) { }
      }
      roomSt = lanEmptyRoom('โฮสต์');
      roomSt.B = { nick: guestNick, ready: false, online: true, deckName: '' };
      showScreen('room');
      renderRoom();
      updateRoomShareUI();
      if (lobbyMsg) lobbyMsg.textContent = '';
      toast(lanAutoMatch ? 'เข้าแมตช์แล้ว — กำลังเตรียมเด็ค…' : 'เข้าห้อง LAN แล้ว', 2500);
      maybeLanAutoReady();
    }).catch(err => {
      if (lobbyMsg) lobbyMsg.textContent = (err && err.message) || 'เข้าห้อง LAN ไม่สำเร็จ';
      toast((err && err.message) || 'เข้าห้อง LAN ไม่สำเร็จ', 4500);
      lanAutoMatch = false;
    });
  }

  /* ── ห้องรอ ── */
  const STARTER_KEYS = ['SD01', 'SD02', 'SD03', 'SD04', 'SD05', 'SD06', 'SD07', 'SD08', 'KD01', 'KD02', 'KD03', 'KD04'];
  const HARD_BOT_DECK_KEY = 'ป่าพงไพร';
  function hardBotDeckVal() { return 'starter:' + HARD_BOT_DECK_KEY; }
  function presetDeckKeys() {
    return Object.keys(STARTERS || {}).filter(k => STARTER_KEYS.indexOf(k) < 0);
  }
  function starterOptionHtml(prefix) {
    const starters = STARTER_KEYS.map(k => {
      const s = STARTERS && STARTERS[k];
      const label = (s && s.label) || (k + ' Starter');
      return `<option value="starter:${k}">${prefix ? esc(prefix) : ''}${esc(label)}</option>`;
    }).join('');
    const presets = presetDeckKeys();
    const extra = presets.length
      ? `<option disabled>── เด็คพิเศษ ──</option>` +
        presets.map(k => {
          const s = STARTERS[k];
          const label = (s && (s.label || s.name)) || k;
          return `<option value="starter:${esc(k)}">${prefix ? esc(prefix) : ''}${esc(label)}</option>`;
        }).join('')
      : '';
    return starters + extra;
  }
  function fillDeckSelect() {
    const sel = byId('selDeck');
    let saved = {};
    try { saved = CardDB.savedDecks(); } catch (e) { }
    const names = Object.keys(saved);
    sel.innerHTML = starterOptionHtml('') +
      (names.length ? `<option disabled>── เด็คที่บันทึก ──</option>` : '') +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    try {
      const act = localStorage.getItem('bot_active_deck');
      if (act && (act.indexOf('starter:') === 0 || saved[act])) sel.value = act;
      else sel.value = 'starter:SD01';
    } catch (e) { sel.value = 'starter:SD01'; }
  }
  /* คะแนนว่าบอทเล่นเด็คนี้ได้ดีแค่ไหน (สีเดียว / curve / มีแลนด์ชัด / อาร์คไทป์ที่ BotAI รู้จัก) */
  function scoreDeckForBot(key, deck) {
    const spec = deck && deck.spec;
    if (!spec || !spec.main) return { key, name: (deck && deck.name) || key, score: -1, why: '' };
    const db = (soloCards || (typeof CardDB !== 'undefined' && CardDB._all) || []);
    const byCode = {};
    (Array.isArray(db) ? db : []).forEach(c => { if (c && c.code) byCode[c.code] = c; });
    let avatars = 0, costs = 0, powers = 0, colors = {}, land = 0, react = 0, mod = 0, activated = 0, noPaid = 0, complex = 0, n = 0;
    let isan = 0, forest = 0, swamp = 0;
    for (const [code, cnt] of Object.entries(spec.main)) {
      const c = byCode[code]; if (!c) continue;
      const e = (BoTEngine.effectOf && BoTEngine.effectOf(code, c.name)) || {};
      const abs = e.abilities || [];
      const nm = c.name || '';
      for (let i = 0; i < (+cnt || 0); i++) {
        n++;
        if (c.type === 'Avatar') {
          avatars++;
          costs += +c.cost || 0;
          powers += +c.power || 0;
          const col = c.color || 'ไร้สี';
          colors[col] = (colors[col] || 0) + 1;
        }
        if (c.type === 'Magic') {
          if (c.subtype === 'Land') land++;
          else if (c.subtype === 'React') react++;
          else if (c.subtype === 'Modification') mod++;
        }
        if (/โคกอีสานนูน|อีสานสลิงเกอร์/.test(nm)) isan++;
        if (/ป่าพงไพร|ภูติผลไม้/.test(nm)) forest++;
        if (/บึงทมิฬ/.test(nm)) swamp++;
        if (e.noPaidSummon || e.noHandSummon) noPaid++;
        if (abs.some(ab => ab.trigger && (ab.trigger.on === 'activated' || ab.trigger.on === 'playMagic'))) activated++;
        if (abs.some(ab => ab.trigger && ab.trigger.on === 'chooseMode') || abs.length > 3) complex++;
      }
    }
    const avgC = avatars ? costs / avatars : 9;
    const avgP = avatars ? powers / avatars : 0;
    const top = Object.values(colors).sort((a, b) => b - a)[0] || 0;
    const mono = avatars ? top / avatars : 0;
    const archBonus = Math.max(isan, forest, swamp) >= 4 ? 28 : Math.max(isan, forest, swamp) >= 2 ? 14 : 0;
    let score = Math.min(avatars, 28) * 2.2
      + Math.max(0, 12 - Math.abs(avgC - 3.5)) * 4
      + avgP * 3
      + mono * 40
      + land * 6
      + Math.min(react, 8) * 3.5
      + mod * 3
      + Math.min(activated, 12) * 3
      + archBonus
      - noPaid * 8
      - complex * 1.5;
    const colLabel = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c, v]) => c + v).join('/');
    let archTag = '';
    if (isan >= forest && isan >= swamp && isan >= 2) archTag = ' · อีสาน';
    else if (forest >= isan && forest >= swamp && forest >= 2) archTag = ' · ป่าพงไพร';
    else if (swamp >= 2) archTag = ' · บึงทมิฬ';
    const why = `สี${Math.round(mono * 100)}% · curve ${avgC.toFixed(1)} · P${avgP.toFixed(1)} · ${colLabel || '—'}${archTag}`;
    return { key, name: deck.name || key, score, why, mono, avatars };
  }
  function rankDecksForBot() {
    const rows = [];
    let saved = {};
    try { saved = CardDB.savedDecks(); } catch (e) { }
    Object.keys(saved).forEach(n => rows.push(scoreDeckForBot(n, { name: n, spec: saved[n] })));
    STARTER_KEYS.forEach(k => {
      const d = starterDeck(k);
      if (d) rows.push(scoreDeckForBot('starter:' + k, d));
    });
    presetDeckKeys().forEach(k => {
      const d = starterDeck(k);
      if (d) rows.push(scoreDeckForBot('starter:' + k, d));
    });
    return rows.filter(r => r.score >= 0).sort((a, b) => b.score - a.score);
  }
  function updateBotDeckHint() { }
  function applyBestBotDeck() {
    const botBot = byId('selBotDeckBot');
    if (getBotLevel() === 'hard' && STARTERS && STARTERS[HARD_BOT_DECK_KEY] && botBot) {
      botBot.value = hardBotDeckVal();
      try { localStorage.setItem('bot_opp_deck', hardBotDeckVal()); } catch (e) { }
      toast('🤖 ตั้งเด็คบอทเป็น「ป่าพงไพร (บอทยาก)」แล้ว', 2800);
      return;
    }
    ensurePlayReady().then(() => CardDB.load()).then(db => {
      soloCards = db.cards || db.all;
      const ranked = rankDecksForBot();
      const pick = ranked.find(r => r.key.indexOf('starter:') !== 0) || ranked[0];
      if (!pick) return toast('ยังไม่มีเด็คให้แนะนำ');
      const botBot = byId('selBotDeckBot');
      if (botBot) {
        botBot.value = pick.key;
        try { localStorage.setItem('bot_opp_deck', pick.key); } catch (e) { }
      }
      toast(`🤖 ตั้งเด็คบอทเป็น「${pick.name}」แล้ว`, 2800);
    }).catch(() => toast('โหลดข้อมูลการ์ดไม่สำเร็จ'));
  }

  function fillMenuDeckSelects() {
    const a = byId('selMenuDeck');
    const b = byId('selMenuDeckB');
    const real = byId('selRealDeck');
    const botYou = byId('selBotDeckYou');
    const botBot = byId('selBotDeckBot');
    let saved = {};
    try { saved = CardDB.savedDecks(); } catch (e) { }
    const names = Object.keys(saved);
    const savedOpts = (names.length ? `<option disabled>── เด็คที่บันทึก ──</option>` : '') +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const opts = starterOptionHtml('') + savedOpts;
    const ok = v => v && (v.indexOf('starter:') === 0 || saved[v]);
    let act = 'starter:SD01', opp = 'starter:SD01';
    try {
      act = localStorage.getItem('bot_active_deck') || 'starter:SD01';
      opp = localStorage.getItem('bot_opp_deck') || 'starter:SD01';
    } catch (e) { }
    if (a && b) {
      a.innerHTML = opts;
      b.innerHTML = opts;
      a.value = ok(act) ? act : 'starter:SD01';
      b.value = ok(opp) ? opp : 'starter:SD01';
    }
    if (botYou && botBot) {
      botYou.innerHTML = opts;
      botBot.innerHTML = opts;
      botYou.value = ok(act) ? act : 'starter:SD01';
      const lvEl = byId('selBotLevel');
      if (lvEl) {
        try { lvEl.value = localStorage.getItem('bot_level') || 'normal'; } catch (e) { lvEl.value = 'normal'; }
      }
      const hardDefault = STARTERS && STARTERS[HARD_BOT_DECK_KEY] && hardBotDeckVal();
      if (getBotLevel() === 'hard' && hardDefault) botBot.value = hardDefault;
      else botBot.value = ok(opp) ? opp : (hardDefault || 'starter:SD01');
      updateBotDeckHint();
    }
    if (real) {
      real.innerHTML = opts;
      real.value = ok(act) ? act : 'starter:SD01';
    }
  }
  function selectedDeck() {
    return resolveDeckChoice(byId('selDeck').value);
  }
  function menuDeckA() {
    const el = byId('selMenuDeck');
    return resolveDeckChoice(el ? el.value : null) || starterDeck('SD01');
  }
  function menuDeckB() {
    const el = byId('selMenuDeckB');
    return resolveDeckChoice(el ? el.value : null) || starterDeck('SD01');
  }
  function menuRealDeck() {
    const el = byId('selRealDeck');
    return resolveDeckChoice(el ? el.value : null) || starterDeck('SD01');
  }
  function renderRoom() {
    if (!roomSt) return;
    byId('roomCode').textContent = room || '——————';
    const meP = seat === 'S' ? null : roomSt[seat];
    byId('rmMyName').innerHTML = seat === 'S'
      ? `ผู้ชม <span class="you">(คุณ)</span>`
      : `${esc(meP.nick || 'ผู้เล่น ' + seat)} <span class="you">(คุณ · ${seat})</span>`;
    byId('btnReady').classList.toggle('hidden', seat === 'S');
    byId('selDeck').disabled = seat === 'S';
    const rb = byId('btnReady');
    rb.textContent = myReady ? 'พร้อมแล้ว ✓ (กดยกเลิก)' : 'กดเมื่อพร้อม';
    rb.classList.toggle('btn-ready-on', myReady);
    // ฝั่งตรงข้าม
    const oppSeat = seat === 'B' ? 'A' : 'B';
    const o = roomSt[oppSeat];
    if (o.online) {
      byId('rmOppBody').className = '';
      byId('rmOppBody').innerHTML =
        `<div class="player-name">${esc(o.nick || 'ผู้เล่น ' + oppSeat)} <span class="on">● ออนไลน์ · ${oppSeat}</span></div>
         <div class="opp-deck-line">เด็ค: ${esc(o.ready ? (o.deckName || 'Starter') : 'กำลังเลือก…')}</div>
         <div class="${o.ready ? 'ready-yes' : 'ready-no'}">${o.ready ? 'พร้อมแล้ว ✓' : 'ยังไม่พร้อม…'}</div>`;
    } else if (o.nick && (lanDropMode === 'wait' || lanDropWaiting)) {
      byId('rmOppBody').className = 'opp-waiting';
      byId('rmOppBody').innerHTML =
        `<div class="player-name">${esc(o.nick)} <span class="ready-no">● หลุดชั่วคราว</span></div>
         <div style="font-size:11px;margin-top:4px">รอเชื่อมต่อกลับ…</div>`;
    } else {
      byId('rmOppBody').className = 'opp-waiting';
      byId('rmOppBody').innerHTML = 'รอผู้เล่นอีกคน…<br><span style="font-size:11px">กด "คัดลอกลิงก์เชิญ" แล้วส่งให้เพื่อนได้เลย</span>';
    }
    byId('rmSpecs').textContent = roomSt.specs ? `ผู้ชมในห้อง: ${roomSt.specs}` : '';
    const canStart = roomSt.A.online && roomSt.B.online && roomSt.A.ready && roomSt.B.ready;
    byId('btnStart').classList.toggle('hidden', !(canStart && seat !== 'S'));
    byId('rmHint').textContent = seat === 'S' ? 'รอผู้เล่นเริ่มเกม…'
      : canStart ? '' : 'เกมเริ่มได้เมื่อผู้เล่นครบ 2 คนและกดพร้อมทั้งคู่';
  }

  /* 📊 สถิติหลังบ้าน — uid = เลขสุ่มในเครื่อง ไม่ผูกตัวตน ใช้แค่นับ "ผู้เล่นไม่ซ้ำต่อวัน" */
  function myUid() {
    try {
      let u = localStorage.getItem('bot_uid');
      if (!u) { u = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('bot_uid', u); }
      return u;
    } catch (e) { return ''; }
  }
  // โหมดซ้อมมือ/การ์ดจริงรันในเครื่องล้วน ไม่ต่อ WebSocket → ต้องแจ้งเองไม่งั้นหลังบ้านมองไม่เห็น
  let lastReport = 0;
  function reportTable(kind) {
    const now = Date.now();
    if (now - lastReport < 15000) return;   // กันนับซ้ำจากการวาดจอ/รีคอนเนกต์ แต่ยังนับรีแมตช์เป็นโต๊ะใหม่
    lastReport = now;
    try { fetch('/stat/table', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: myUid(), mode: kind }) }).catch(() => { }); } catch (e) { }
  }

  /* ── ส่ง action ── */
  function sendAction(a) {
    if (!st) return;
    if (mode === 'solo') {
      if (a.type === 'shuffle') {
        const len = st.zones[a.p + '.deck'].length;
        a.perm = Array.from({ length: len }, (_, i) => i);
        for (let i = len - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a.perm[i], a.perm[j]] = [a.perm[j], a.perm[i]]; }
      }
      if (a.type === 'dice') a.v = 1 + Math.floor(Math.random() * 6);
      if (a.type === 'coin') a.v = Math.random() < .5 ? 'หัว' : 'ก้อย';
      a.seed = (Math.random() * 0xffffffff) >>> 0;
      // solo คุมทั้งสองฝั่ง: by = เจ้าของการ์ด/เด็คที่เกี่ยว เพื่อให้ผ่านเช็กความเป็นเจ้าของ แต่กฎเฟส/เทิร์นยังทำงาน
      if (!a.by) {
        if (a.k) a.by = BoTEngine.ownerOf(st, a.k);
        else if (a.atk) a.by = BoTEngine.ownerOf(st, a.atk);
        else if (a.p) a.by = a.p;
        else a.by = st.active;
        if (a.by === 'S') a.by = st.active;
      }
      return applyA(a);
    }
    if (seat === 'S' && a.type !== 'chat') { toast('ผู้ชมดูได้อย่างเดียว'); return; }
    if (netKind === 'lan') {
      if (lanIsHost) lanHostHandleAction(a, seat);
      else if (!lanSend({ t: 'action', a })) toast('ยังไม่เชื่อมต่อโฮสต์ — รอสักครู่…');
      return;
    }
    // เต๋า/เหรียญ: สุ่มฝั่งผู้กด แล้วส่งค่าไปด้วย เพื่อให้ทุกจอเห็นผลเดียวกัน + แอนิเมชันตรงกัน
    if (a.type === 'dice' && a.v == null) a.v = 1 + Math.floor(Math.random() * 6);
    if (a.type === 'coin' && a.v == null) a.v = Math.random() < .5 ? 'หัว' : 'ก้อย';
    if (ws && ws.readyState === 1) wsSend({ t: 'action', a });
    else toast('ยังไม่เชื่อมต่อ — รอสักครู่…');
  }

  /* ลากเมจิกจากมือทับการ์ด: หลังร่าย ถ้ามีหน้าต่างเลือกเป้าและใบนั้นใช้ได้ → เลือกให้อัตโนมัติ */
  function tryConsumeMagicDropTarget() {
    if (!magicDropTarget || !st) return;
    const tk = magicDropTarget;
    const pr = (st.prompts || [])[0];
    if (!pr) {
      // ร่ายจบแล้วไม่มีเป้าให้เลือก (หรือยังรอหลังขัดเวท) — อย่าค้างเป้าไปปน prompt อื่น
      if (!st._pendingMagic) magicDropTarget = null;
      return;
    }
    if (pr.kind === 'react') return; // รอขัดเวท — ค้างเป้าไว้หลัง resolve
    if (!(mode === 'solo' || seat === pr.chooser)) { magicDropTarget = null; return; }
    if (!BoTEngine.promptTargetOk(st, tk)) {
      magicDropTarget = null;
      return;
    }
    magicDropTarget = null;
    sendAction({ type: 'chooseTarget', k: tk, by: mode === 'solo' ? pr.chooser : undefined });
  }

  function applyA(a) {
    const fx = BoTEngine.applyAction(st, a);
    if (fx.deny) {
      if (a.type === 'playMagic') magicDropTarget = null;
      // บอทลองหลายทางแล้ว fail เป็นเรื่องปกติ — อย่าสแปม toast
      if (!(mode === 'solo' && soloBot && a.by === 'B')) toast('🚫 ' + fx.deny, 3200);
      return fx;
    }
    if (a.type === 'summon') { (a.payIds || []).forEach(k => delete selMap[k]); delete selMap[a.k]; }
    if (fx.snd) snd(fx.snd);
    if (fx.drawn || (fx.drawnList && fx.drawnList.length)) {
      const list = (fx.drawnList && fx.drawnList.length) ? fx.drawnList : [{ k: fx.drawn }];
      lastDrawn = list[list.length - 1].k;
      // ซ่อนใบที่เพิ่งขึ้นมือไว้ก่อน — รอแอนิเมชันลากเปิดทีละใบ
      list.forEach(it => { if (it.k) pendingReveal.add(it.k); });
      const hold = 900 + list.length * 900;
      clearTimeout(dealT); dealT = setTimeout(() => {
        lastDrawn = null;
        list.forEach(it => pendingReveal.delete(it.k));
        render();
      }, hold);
      const drawSide = BoTEngine.ownerOf(st, lastDrawn);
      if (drawSide === 'A' || drawSide === 'B') pulseDeckDraw(drawSide);
    } else if (fx.snd === 'draw') {
      pulseDeckDraw(st.active);
    }
    if (fx.flip) { lastFlip = fx.flip; clearTimeout(flipT); flipT = setTimeout(() => { lastFlip = null; render(); }, 700); }
    if (fx.clash) {
      const c = byId('clash'); c.textContent = fx.clash; c.classList.remove('hidden');
      c.style.animation = 'none'; void c.offsetWidth; c.style.animation = 'clashPop 1.2s ease-out forwards';
      clearTimeout(clashT); clashT = setTimeout(() => c.classList.add('hidden'), 1250);
    }
    if (fx.tool) byId('toolResult').textContent = fx.tool;
    if (fx.coin) showCoinFlip(fx.coin);
    if (fx.dice != null) showDiceRoll(fx.dice);
    if (fx.deckView) { // 🔍 ข้อมูลเปิด: ใครค้นเด็ค/ดูท็อป ทุกจอเปิด overlay ชุดเดียวกัน (อีกฝั่งเห็นการ์ดด้วย)
      pileView = { zone: fx.deckView.p + '.deck', mode: fx.deckView.n > 0 ? 'peek' : 'search', n: fx.deckView.n || 0 };
    }
    if (fx.deckViewEnd && pileView && pileView.zone === fx.deckViewEnd.p + '.deck') {
      pileView = null; byId('pileView').classList.add('hidden');
    }
    if (fx.toss) { // 🗑️ โชว์ว่าทิ้งใบไหนบ้าง (จ่าย Cost แบบ manual) — ป๊อปอัพให้อีกฝั่งเห็น
      const who = (mode === 'online' && roomSt && roomSt[fx.toss.by] && roomSt[fx.toss.by].nick) ? roomSt[fx.toss.by].nick : 'ผู้เล่น ' + fx.toss.by;
      const el2 = byId('annFlash');
      if (el2) {
        el2.innerHTML = `🗑️ ${esc(who)} ทิ้ง ${fx.toss.names.map(n => `<b>「${esc(n)}」</b>`).join(' ')}`;
        el2.classList.remove('show'); void el2.offsetWidth; el2.classList.add('show');
        clearTimeout(annT); annT = setTimeout(() => el2.classList.remove('show'), 2800);
      }
    }
    if (fx.announce) { // ⚡ แถบประกาศบนจอ + เรืองแสงการ์ดต้นทาง/เป้า
      const an = fx.announce;
      const who = (mode === 'online' && roomSt && roomSt[an.by] && roomSt[an.by].nick) ? roomSt[an.by].nick : 'ผู้เล่น ' + an.by;
      const el = byId('annFlash');
      if (el) {
        if (an.kind === 'attack')
          el.innerHTML = `⚔️ ${esc(who)} โจมตี <b>「${esc(an.srcName)}」P${an.pa}</b>${an.tgtName ? ` ➜ <b>「${esc(an.tgtName)}」${an.pd != null ? 'P' + an.pd : ''}</b>` : ''}`;
        else if (an.kind === 'attach')
          el.innerHTML = `🔗 ${esc(who)} สวมใส่ <b>「${esc(an.srcName)}」</b> ➜ <b>「${esc(an.tgtName)}」</b>${an.pa != null && an.pd != null && an.pa !== an.pd ? ` · POWER ${an.pa}→${an.pd}` : ''}`;
        else if (an.kind === 'unity')
          el.innerHTML = `🤝 ${esc(who)} สามัคคี <b>「${esc(an.srcName)}」</b> → <b>「${esc(an.tgtName)}」</b>${an.pa != null ? ` +${an.pa}` : ''}`;
        else
          el.innerHTML = `⚡ ${esc(who)} ใช้ <b>「${esc(an.srcName)}」</b>${an.tgtName ? ` ➜ <b>「${esc(an.tgtName)}」</b>` : ''}`;
        el.classList.toggle('atk', an.kind === 'attack');
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        clearTimeout(annT); annT = setTimeout(() => el.classList.remove('show'), an.kind === 'attack' ? 1600 : 2200);
      }
      annGlow = { src: an.src, tgt: an.tgt, until: Date.now() + (an.kind === 'attack' ? 1800 : 2400) };
      setTimeout(() => { annGlow = null; render(); }, an.kind === 'attack' ? 1900 : 2500);
      snd('flip');
    }
    if (fx.offerAttach && st.inst[fx.offerAttach] && canControl(fx.offerAttach)) {
      const modK = fx.offerAttach;
      setTimeout(() => {
        if (!st || !st.inst[modK] || !(BoTEngine.zoneOf(st, modK) || '').endsWith('.magic')) return;
        startAnnounce(modK, 'attach');
        toast('🔗 แตะหรือลากทับ Avatar เพื่อสวมใส่', 3200);
      }, 80);
    }
    if (fx.attach && fx.attach.pBefore != null && fx.attach.pAfter != null && fx.attach.pBefore !== fx.attach.pAfter) {
      toast(`🔗 สวมแล้ว — POWER ${fx.attach.pBefore} → ${fx.attach.pAfter}`, 2500);
    }
    if (fx.battleIntro) playBattleIntroThenStart(fx.battleIntro.firstPlayer || (st && st.firstPlayer) || 'A');
    if (fx.battleStarted) {
      flashPhase('Main', st.active);
      toast(`⚔️ เปิดศึก — ผู้เริ่ม ${st.firstPlayer || 'A'} จั่วเพิ่มแล้ว`, 2800);
    }
    if (fx.toast) toast(fx.toast, 2800);
    // ธรณีสูบ: สรุปชื่อหลังแอนิเมชันทีละใบจบ (ไม่แย่งสายตากลางทาง)
    if (fx.milled && fx.milled.length) {
      const milledCopy = fx.milled.slice();
      const wait = 400 + milledCopy.length * 1100;
      setTimeout(() => {
        const bySide = {};
        milledCopy.forEach(m => { (bySide[m.p] = bySide[m.p] || []).push(m.name); });
        const bits = Object.keys(bySide).map(p => {
          const nick = (mode === 'online' && roomSt && roomSt[p] && roomSt[p].nick) ? roomSt[p].nick : 'ผู้เล่น ' + p;
          return `${esc(nick)} ${bySide[p].map(n => `<b>「${esc(n)}」</b>`).join(' ')}`;
        });
        const el2 = byId('annFlash');
        if (el2) {
          el2.innerHTML = `🌊 ธรณีสูบ<br>${bits.join('<br>')}`;
          el2.classList.remove('atk', 'show'); void el2.offsetWidth; el2.classList.add('show');
          clearTimeout(annT); annT = setTimeout(() => el2.classList.remove('show'), 2800);
        }
      }, wait);
    }
    render();
    playFxAnims(fx);
    tryConsumeMagicDropTarget();
    if (fx.critical) {
      toast(`🩸 ฝ่าย ${fx.critical} เข้าสู่สถานะสาหัส! ต้องโดนโจมตี LIFE อีก 1 ครั้งจึงจะแพ้`, 4500);
    }
    if (fx.over) { // ชนะแล้ว (รวมโจมตีตอนสาหัส)
      const nick = (mode === 'online' && roomSt && roomSt[fx.over]) ? roomSt[fx.over].nick : '';
      showEnd(fx.over, nick);
    }
    // แจ้งเมื่อมี React / หน้าต่างขัดเวท — กันพลาดแถบ prompt
    {
      const pr0 = (st.prompts || [])[0];
      if (pr0 && pr0.kind === 'react') {
        const mineR = mode === 'solo' ? (soloBot ? pr0.chooser === my : true) : seat === pr0.chooser;
        if (mineR) {
          const n = (pr0.options && pr0.options.length) || 0;
          const why = pr0.label || (pr0.mode === 'negateMagic' ? 'ขัด Magic' : 'ตอบโต้');
          if (pr0.magicNegate || pr0.mode === 'negateMagic') {
            toast(n
              ? `💚 จะขัดไหม? (${why}) — มี React ${n} ใบ · กดไม่ใช้หรือรอ ${pr0.seconds || 10} วิ`
              : `⏳ จะขัดไหม? (${why}) — กด「ไม่ใช้」หรือรอ ${pr0.seconds || 10} วิ`, 4500);
          } else if (pr0.reactTrigger === 'enemyDeclareAttack') {
            toast(n
              ? `💚 จะใช้ React ไหม? (${why}) — มี ${n} ใบ · กดไม่ใช้หรือรอ ${pr0.seconds || 10} วิ`
              : `⏳ จะตอบโต้ไหม? (${why}) — กด「ไม่ใช้」หรือรอ ${pr0.seconds || 10} วิ`, 4500);
          } else if (pr0.reactTrigger === 'avatarWouldBeDestroyed') {
            toast(n
              ? `💚 ${why} — มีหมอมาแล้วววว ${n} ใบ · แตะใบเขียวเพื่อกันทำลาย หรือกดไม่ใช้`
              : `⏳ ${why} — กด「ไม่ใช้」หรือรอ ${pr0.seconds || 10} วิ`, 4500);
          } else {
            toast(`💚 React ${n || 1} ใบพร้อมใช้ (${why}) — แตะใบที่กะพริบเขียว หรือกดไม่ใช้`, 4500);
          }
        } else if (pr0.magicNegate || pr0.mode === 'negateMagic') {
          const tgtN = pr0.target && st.inst[pr0.target] ? st.inst[pr0.target].name : 'เวท';
          toast(`⏳ รอฝ่าย ${pr0.chooser} ตอบว่าจะขัด "${tgtN}" ไหม (${pr0.seconds || 10} วิ)`, 3500);
        } else if (pr0.reactTrigger === 'enemyDeclareAttack') {
          toast(`⏳ รอฝ่าย ${pr0.chooser} ตอบว่าจะใช้ React ไหม (${pr0.seconds || 10} วิ)`, 3500);
        } else if (pr0.reactTrigger === 'avatarWouldBeDestroyed') {
          toast(`⏳ รอฝ่าย ${pr0.chooser} ตอบว่าจะกันทำลายไหม (${pr0.seconds || 10} วิ)`, 3500);
        }
      }
      if (pr0 && (pr0.dest === 'preventLeavePick' || pr0.kind === 'preventLeaveExile')) {
        const mineP = mode === 'solo' ? (soloBot ? pr0.chooser === my : true) : seat === pr0.chooser;
        if (mineP) {
          const nm = st.inst[pr0.stayK || pr0.k] ? st.inst[pr0.stayK || pr0.k].name : (st.inst[pr0.src] ? st.inst[pr0.src].name : 'Avatar');
          const need = pr0.need || 5;
          const got = pr0.got || 0;
          toast(pr0.dest === 'preventLeavePick'
            ? `🛡️ 「${nm}」เลือกเนรเทศรัททาทุยจากนรก (${got}/${need}) — แตะการ์ดในหน้าต่างที่เปิด`
            : `🛡️ 「${nm}」จะออกจากสนาม — เนรเทศรัททาทุยในนรก ${need} ใบเพื่อรอดได้`, 5000);
        }
      }
    }
    scheduleBot();
    if (mode === 'solo') persistUI();
    return fx;
  }

  /* ── บอทฝั่ง B — heuristic + BotAI (อาร์คไทป์ / เงื่อนไขแลนด์ / ลำดับเทค) ── */
  function botActive() { return mode === 'solo' && soloBot && st && !st.over && !byId('table').classList.contains('hidden'); }
  function botDelayMs() {
    const lv = getBotLevel();
    return lv === 'easy' ? 900 : lv === 'hard' ? 420 : 650;
  }
  function scheduleBot() { if (!botActive()) return; clearTimeout(botT); botT = setTimeout(botTick, botDelayMs()); }
  const eff = k => BoTEngine.effPower(st, k);
  let botFailKeys = new Set();
  let botFailTurn = -1;
  function botAI() { return (typeof BotAI !== 'undefined' && BotAI) ? BotAI : null; }
  function botArch() {
    const AI = botAI();
    return AI ? AI.detectArchetype(st, 'B') : 'generic';
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
    return !!BoTEngine.hasKw(st, k, 'เตะไข่') || !!(st.inst[k] && st.inst[k]._allowLifeDespiteAvatars);
  }
  function botThreatScore(k) {
    const c = st.inst[k]; if (!c) return 0;
    let s = eff(k) * 5;
    if (botHasEgg(k)) s += 45;
    if (cardHasUnityKw(k)) s += 10;
    if (BoTEngine.hasKw && BoTEngine.hasKw(st, k, 'ลูกฮึด')) s += 18;
    if (BoTEngine.hasKw && BoTEngine.hasKw(st, k, 'โล่มนุษย์')) s += 8;
    if (BoTEngine.hasKw && BoTEngine.hasKw(st, k, 'แทงหลัง')) s += 12;
    return s;
  }
  function botSkipCombatReact(k) {
    const c = st.inst[k];
    return !!(c && /อย่าให้มีครั้งที่/.test(c.name || ''));
  }
  function botRankCombatReacts(opts) {
    const AI = botAI();
    return (opts || []).slice().filter(k => !botSkipCombatReact(k)).sort((a, b) => {
      const sa = AI && AI.reactStopScore ? AI.reactStopScore(st.inst[a]) : 0;
      const sb = AI && AI.reactStopScore ? AI.reactStopScore(st.inst[b]) : 0;
      if (sb !== sa) return sb - sa;
      return botCardVal(a) - botCardVal(b);
    });
  }
  function botTankWipeWorth(pend) {
    const tanks = (st.zones['B.avatar'] || []).filter(k => /รถถัง/.test((st.inst[k] && st.inst[k].name) || ''));
    if (!tanks.length) return false;
    const has = (st.zones['B.hand'] || []).some(k => /เพื่อชาติ/.test((st.inst[k] && st.inst[k].name) || ''));
    if (!has) return false;
    const enemyN = (st.zones['A.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar').length;
    if (enemyN >= 2) return true;
    if (pend && pend.life && enemyN >= 1) return true;
    if (pend && pend.def && tanks.includes(pend.def) && pend.atk && eff(pend.atk) >= eff(pend.def)) return true;
    if (pend && pend.atk && botThreatScore(pend.atk) >= 50 && enemyN >= 1) return true;
    return false;
  }
  function botShouldCombatReact(pend) {
    const lv = getBotLevel();
    if (!pend) return false;
    if (lv !== 'easy' && botTankWipeWorth(pend)) return true;
    const atkP = pend.atk ? eff(pend.atk) : 0;
    const defP = pend.def ? eff(pend.def) : 0;
    const lifeAtk = !!pend.life;
    const myL = botLifeInfo('B');
    if (lifeAtk && atkP <= 0) return false;
    if (lv === 'easy') return !!(lifeAtk && myL.critical);
    if (lifeAtk) {
      if (myL.critical || myL.down <= 1) return true;
      return lv === 'hard' ? myL.down <= 3 : myL.down <= 2;
    }
    if (!pend.def) return false;
    if (atkP < defP) return false;
    const lost = botThreatScore(pend.def);
    const atkTh = botThreatScore(pend.atk);
    if (lv === 'hard') return lost >= 22 || atkTh >= 48 || atkP >= defP;
    return lost >= 32 || atkP > defP;
  }
  function botKey(a) {
    try { return JSON.stringify(a); } catch (e) { return String(a && a.type); }
  }
  function botSend(a) {
    if (!a) return false;
    if (botFailTurn !== st.turn) { botFailKeys = new Set(); botFailTurn = st.turn; }
    const key = botKey(a);
    if (botFailKeys.has(key)) return false;
    const fx = sendAction(a);
    if (fx && fx.deny) {
      botFailKeys.add(key);
      scheduleBot();
      return false;
    }
    botFailKeys.clear();
    return true;
  }
  function botModeOptionDeny(k, opt) {
    if (BoTEngine.chooseModeOptionDeny)
      return BoTEngine.chooseModeOptionDeny(st, k, 'B', opt);
    if (!opt) return 'ไม่มีตัวเลือก';
    if (opt.requireHellReturnedThisTurnMin != null) {
      const got = (st.hellReturnedThisTurn && st.hellReturnedThisTurn.B) || 0;
      if (got < opt.requireHellReturnedThisTurnMin)
        return `ต้องคืนนรก ≥ ${opt.requireHellReturnedThisTurnMin} ก่อน`;
    }
    if (opt.requireOwnNameIncludes) {
      const ok = (st.zones['B.avatar'] || []).some(id => BoTEngine.nameMatches(st.inst[id], opt.requireOwnNameIncludes));
      if (!ok) return `ต้องมี "${opt.requireOwnNameIncludes}"`;
    }
    return null;
  }
  function botCardVal(k) {
    const c = st.inst[k]; if (!c) return 0;
    const AI = botAI();
    const arch = botArch();
    const p = +c.power || 0, cost = +c.cost || 0, gem = +c.gem || 0;
    let v = gem;
    if (c.type === 'Avatar') v = 40 + p * 12 - cost * 2;
    else if (c.type === 'Construct') v = 25 + p * 8;
    else if (c.type === 'Magic') {
      if (c.subtype === 'Land') v = 35;
      else if (c.subtype === 'React') v = 28;
      else if (c.subtype === 'Modification') v = 22 + gem;
      else v = 18 + gem;
    }
    if (AI && AI.isGemBattery && AI.isGemBattery(c)) v = gem * 3;
    if (AI) {
      if (AI.isWantedLandCard(c, arch)) v += 40;
      if (AI.cardIsKeyEnabler(c, arch)) v += 30;
      if (AI.comboHoldScore) v += AI.comboHoldScore(st, 'B', c);
    }
    return v;
  }
  function botMagicTypeFree(mtype) {
    return !(st.magicUsed && st.magicUsed.B && st.magicUsed.B[mtype]);
  }
  function botBuildPay(summonK, cost) {
    const c0 = st.inst[summonK]; if (!c0) return null;
    if (cost <= 0) return [];
    const eAll = BoTEngine.effectOf && BoTEngine.effectOf(c0.code, c0.name);
    const avColor = (eAll && eAll.allColors) ? '' : (c0.color || '');
    const hand = (st.zones['B.hand'] || []).filter(x => x !== summonK);
    const usable = [];
    for (const o of hand) {
      const info = payGemInfo(st.inst[o], c0);
      const ok = BoTEngine.gemPaysFor ? BoTEngine.gemPaysFor(info.gc, avColor) : (!avColor || info.gc === 'ขาว' || info.gc === avColor);
      const pe = BoTEngine.effectOf && BoTEngine.effectOf(st.inst[o].code, st.inst[o].name);
      if (pe && pe.costOnlyForNameIncludes && !(c0.name || '').includes(pe.costOnlyForNameIncludes)) continue;
      if (pe && pe.costOnlyForSymbol && c0.symbol !== pe.costOnlyForSymbol) continue;
      // เก็บแลนด์/เอนเอเบลอร์เด็คไว้จ่ายทีหลัง
      let keep = botCardVal(o);
      const AI = botAI();
      if (AI) {
        const arch = botArch();
        if (AI.isWantedLandCard(st.inst[o], arch)) keep += 80;
        if (AI.cardIsKeyEnabler(st.inst[o], arch)) keep += 50;
        if (st.inst[o].subtype === 'React') keep += 25;
        if (AI.comboHoldScore) keep += AI.comboHoldScore(st, 'B', st.inst[o]);
        if (AI.isGemBattery && AI.isGemBattery(st.inst[o])) keep -= 40;
        if (AI.paidAsCostMatches && AI.paidAsCostMatches(st.inst[o], c0)) keep -= 55;
        if (/มะขาม/.test((st.inst[o].name || '')) && AI.hasLandNamed(st, AI.LAND.FOREST)
          && (st.zones['B.avatar'] || []).length >= 2) keep += 90;
      }
      if (ok) usable.push({ k: o, g: info.g, keep });
    }
    usable.sort((a, b) => a.keep - b.keep || b.g - a.g);
    let gem = 0; const pay = [];
    for (const o of usable) {
      if (gem >= cost) break;
      pay.push(o.k);
      gem += o.g;
    }
    if (gem < cost) return null;
    if (eAll && eAll.exactGemPay && gem !== cost) {
      while (pay.length && gem > cost) {
        const last = pay[pay.length - 1];
        const g = payGemInfo(st.inst[last], c0).g;
        if (gem - g >= cost) { pay.pop(); gem -= g; }
        else break;
      }
      if (gem !== cost) return null;
    }
    return pay;
  }
  function botSummonScore(k) {
    const c = st.inst[k]; if (!c) return -1;
    const cost = BoTEngine.effCost ? BoTEngine.effCost(st, k) : (+c.cost || 0);
    const free = !!(BoTEngine.freeSummonOk && BoTEngine.freeSummonOk(st, k));
    const p = +c.power || 0;
    let s = p * 12 - cost * 3;
    if (free) s += 80;
    if (c.type === 'Avatar') s += 20;
    if (c.type === 'Construct') s += 8;
    if (c.type === 'Avatar' && p <= 0 && (+c.gem || 0) >= 3) s -= 140;
    const enemies = (st.zones['A.avatar'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar');
    if (enemies.length && enemies.every(e => eff(e) < p)) s += 15;
    const AI = botAI();
    if (AI) s += AI.summonSynergyBonus(st, 'B', k, botArch());
    const myL = botLifeInfo('B');
    const oppN = (st.zones['A.avatar'] || []).length;
    const myN = (st.zones['B.avatar'] || []).length;
    if (c.type === 'Avatar') {
      if (myN <= 1 && oppN >= 2) s += 16 + Math.max(0, 5 - cost) * 3;
      if (myL.critical && (st.zones['A.avatar'] || []).some(id => botHasEgg(id)))
        s += 22 + Math.max(0, 6 - cost) * 4;
    }
    return s;
  }
  function botTrySummon() {
    const lv = getBotLevel();
    const hand = st.zones['B.hand'] || [];
    const zone = st.zones['B.avatar'] || [];
    const conZone = st.zones['B.construct'] || [];
    const avCount = zone.filter(k => st.inst[k] && st.inst[k].type === 'Avatar').length;
    const cap = (BoTEngine.avatarCap && BoTEngine.avatarCap(st, 'B')) || 4;
    const avLimit = lv === 'easy' ? 2 : lv === 'hard' ? Math.min(4, cap) : Math.min(3, cap);
    const candidates = [];
    for (const k of hand) {
      const c = st.inst[k]; if (!c) continue;
      if (c.type !== 'Avatar' && c.type !== 'Construct') continue;
      if (lv === 'easy' && c.type === 'Construct') continue;
      if (c.type === 'Avatar' && avCount >= avLimit) continue;
      if (c.type === 'Construct' && conZone.length >= 3) continue;
      if (c.type === 'Construct' && conZone.some(id => st.inst[id] && st.inst[id].name === c.name)) continue;
      if (zone.length + conZone.length >= 8) continue;
      const eBot = BoTEngine.effectOf && BoTEngine.effectOf(c.code, c.name);
      if (eBot && (eBot.noPaidSummon || eBot.noHandSummon)) continue;
      if (eBot && eBot.sacrificeSummon) continue;
      if (c.type === 'Avatar' && (+c.power || 0) <= 0 && (+c.gem || 0) >= 3) {
        const AI0 = botAI();
        if (!AI0 || !AI0.isGemBattery || AI0.isGemBattery(c)) continue;
      }
      const free = !!(BoTEngine.freeSummonOk && BoTEngine.freeSummonOk(st, k));
      const cost = free ? 0 : (BoTEngine.effCost ? BoTEngine.effCost(st, k) : (+c.cost || 0));
      if (lv === 'easy' && cost > 4 && !free) continue;
      const pay = free ? [] : botBuildPay(k, cost);
      if (pay == null) continue;
      candidates.push({ k, to: c.type === 'Construct' ? 'B.construct' : 'B.avatar', pay, free, score: botSummonScore(k) });
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const cand of candidates) {
      if (cand.score < -20 && getBotLevel() !== 'easy') continue; // เงื่อนไขไม่พร้อม — รอ
      const a = { type: 'summon', k: cand.k, to: cand.to, payIds: cand.pay, by: 'B' };
      if (cand.free) a.free = true;
      if (botSend(a)) return true;
    }
    return false;
  }
  function botTryAttach() {
    const AI = botAI();
    const mods = (st.zones['B.magic'] || []).filter(k => {
      const c = st.inst[k];
      return c && c.subtype === 'Modification' && !c.attachedTo;
    });
    if (!mods.length) return false;
    const hosts = (st.zones['B.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
    if (!hosts.length) return false;
    const enemyN = (st.zones['A.avatar'] || []).length;
    mods.sort((a, b) => {
      const ca = st.inst[a], cb = st.inst[b];
      const eggA = AI && AI.modGrantsKickEgg ? AI.modGrantsKickEgg(ca) : /ไม้เกาหลัง|เตะไข่/.test((ca && (ca.name || '') + (ca.effect || '')) || '');
      const eggB = AI && AI.modGrantsKickEgg ? AI.modGrantsKickEgg(cb) : /ไม้เกาหลัง|เตะไข่/.test((cb && (cb.name || '') + (cb.effect || '')) || '');
      if (eggA !== eggB) return eggA ? -1 : 1;
      return botCardVal(b) - botCardVal(a);
    });
    for (const mod of mods) {
      const c = st.inst[mod];
      const grantsEgg = AI && AI.modGrantsKickEgg ? AI.modGrantsKickEgg(c) : /ไม้เกาหลัง|เตะไข่/.test((c && (c.name || '') + (c.effect || '')) || '');
      const rankedHosts = hosts.slice().sort((a, b) => {
        if (grantsEgg) {
          const eggA = !!BoTEngine.hasKw(st, a, 'เตะไข่');
          const eggB = !!BoTEngine.hasKw(st, b, 'เตะไข่');
          // ให้มอดเตะไข่กับตัวที่ยังไม่มี — สำคัญเมื่อศัตรูมีบล็อกเกอร์
          if (eggA !== eggB) return eggA ? 1 : -1;
          if (enemyN) return eff(b) - eff(a);
        }
        return eff(b) - eff(a);
      });
      for (const host of rankedHosts) {
        if (botSend({ type: 'attach', k: mod, to: host, by: 'B' })) return true;
      }
    }
    return false;
  }
  function botTryPlayMagic() {
    const hand = st.zones['B.hand'] || [];
    const AI = botAI();
    const arch = botArch();
    const ranked = [];
    for (const k of hand) {
      const c = st.inst[k]; if (!c || c.type !== 'Magic') continue;
      const mtype = c.subtype || 'Normal';
      if (mtype === 'React') continue;
      const ePlay = BoTEngine.effectOf && BoTEngine.effectOf(c.code, c.name);
      const absPlay = (ePlay && ePlay.abilities) || [];
      if (absPlay.some(ab => ab.trigger && ab.trigger.on === 'enemyDeclareAttack')) continue;
      if (!botMagicTypeFree(mtype)) continue;
      let score;
      if (AI) score = AI.magicPlayScore(st, 'B', k, arch, botMagicTypeFree);
      else {
        const land = (st.zones['land'] || []).length;
        score = mtype === 'Land' ? (land ? -5 : 50) : (mtype === 'Modification' ? 30 : 18);
        if (mtype === 'Modification' && !(st.zones['B.avatar'] || []).length) continue;
      }
      ranked.push({ k, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    for (const it of ranked) {
      if (it.score < 0) continue;
      if (botSend({ type: 'playMagic', k: it.k, by: 'B' })) return true;
    }
    return false;
  }
  function botTryActivate() {
    const AI = botAI();
    const arch = botArch();
    const pools = [
      ...(st.zones['B.avatar'] || []),
      ...(st.zones['B.construct'] || []),
      ...(st.zones['B.magic'] || []),
      ...(st.zones['land'] || []).filter(k => st.inst[k] && st.inst[k].controller === 'B'),
      ...(st.zones['B.hand'] || []).filter(k => {
        const c = st.inst[k]; if (!c) return false;
        const e = BoTEngine.effectOf && BoTEngine.effectOf(c.code, c.name);
        return e && (e.abilities || []).some(ab => ab.trigger && ab.trigger.on === 'activatedFromHand');
      }),
      // สั่งใช้จากนรก (ถ้าการ์ดรองรับ)
      ...(st.zones['B.hell'] || []).filter(k => cardHasActivatedAbility(k)),
    ];
    const ranked = pools.slice().map(k => ({
      k,
      score: AI ? AI.activateScore(st, 'B', k, arch) : botCardVal(k),
    })).sort((a, b) => b.score - a.score);
    for (const it of ranked) {
      if (it.score < -50) continue;
      if (!cardHasActivatedAbility(it.k)) continue;
      if (botSend({ type: 'activateAbility', k: it.k, by: 'B' })) return true;
    }
    return false;
  }
  function botTryMain() {
    const lv = getBotLevel();
    const AI = botAI();
    const arch = botArch();
    // มีมอดรอสวม (ไม้เกาหลัง ฯลฯ) — สวมก่อนเพื่อให้เตะไข่ติดก่อนเข้า Battle
    const pendingMod = (st.zones['B.magic'] || []).some(k => {
      const c = st.inst[k];
      return c && c.subtype === 'Modification' && !c.attachedTo;
    });
    if (pendingMod && (st.zones['B.avatar'] || []).some(k => st.inst[k] && st.inst[k].type === 'Avatar')) {
      if (botTryAttach()) return true;
    }
    const steps = (AI && AI.mainPriority(arch, lv)) || ['attach', 'magic', 'activate', 'summon'];
    // แลนด์เป้าหมายยังไม่อยู่บนสนาม — วางก่อนลงอย่างอื่น
    if (AI && lv !== 'easy' && AI.wantedLandNeedle) {
      const need = AI.wantedLandNeedle(arch);
      if (need && !AI.hasLandNamed(st, need)) {
        if (botTryPlayMagic()) return true;
      }
    }
    // ถ้าพร้อมเปิดเทค/เรียกจากนรก — แทรก activate ขึ้นก่อน
    if (AI && lv !== 'easy' && AI.shouldActivateBeforeSummon(st, 'B', arch)) {
      if (botTryActivate()) return true;
    }
    for (const step of steps) {
      if (step === 'magic' && botTryPlayMagic()) return true;
      if (step === 'summon' && botTrySummon()) return true;
      if (step === 'activate' && botTryActivate()) return true;
      if (step === 'attach' && botTryAttach()) return true;
    }
    if (lv === 'hard' && botTryActivate()) return true;
    return false;
  }
  /** สามัคคี — นอนผู้ให้ที่เล็กที่สุด ให้ผู้รับชนะเป้าแค่ +1–2 อย่าบวกเกินจำเป็น */
  function botTryUnity() {
    const lv = getBotLevel();
    if (lv === 'easy' && Math.random() < 0.55) return false;
    const mine = (st.zones['B.avatar'] || []).filter(k => {
      const c = st.inst[k];
      return c && c.type === 'Avatar' && c.faceUp !== false && !c.tapped && !c.cannotChangeStateUntilEOT;
    });
    if (mine.length < 2) return false;
    const donors = mine.filter(k => cardHasUnityKw(k));
    if (!donors.length) return false;
    const enemies = (st.zones['A.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
    const enemyCons = lv === 'easy' ? [] : (st.zones['A.construct'] || []).slice();
    const oppL = botLifeInfo('A');
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
      if (botSend({ type: 'unity', k: p.giver, to: p.recv, by: 'B' })) return true;
    }
    return false;
  }
  function botTryAttack() {
    const lv = getBotLevel();
    const mine = (st.zones['B.avatar'] || []).filter(k => {
      const c = st.inst[k];
      return c && !c.tapped && c.faceUp !== false && c.type === 'Avatar' && eff(k) > 0;
    });
    const enemies = (st.zones['A.avatar'] || []).filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
    const enemyCons = (st.zones['A.construct'] || []).slice();
    const myL = botLifeInfo('B');
    const oppL = botLifeInfo('A');
    const racing = oppL.down <= myL.down;
    const lethal = oppL.critical && oppL.n > 0;
    const life = oppL.target;
    if (!mine.length) return false;

    const sortedAtk = mine.slice().sort((a, b) => eff(a) - eff(b) || botThreatScore(a) - botThreatScore(b));
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
    const leftover = mine.filter(a => !used.has(a));
    const cleared = assigned.size === enemies.length;
    const faceNow = enemies.length === 0 ? mine : mine.filter(botHasEgg);
    const canLethalNow = lethal && faceNow.length > 0;

    const plans = [];
    for (const atk of mine) {
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
          if (egg && (lethal || (racing && oppL.down <= 2))) score -= 60;
          if (myL.critical && mine.length <= 2 && !lethal && !(th > myTh + 15 || botHasEgg(e)))
            score -= 70;
          plans.push({ atk, def: e, score });
        } else if (ap === dp && lv !== 'easy') {
          let score = th - myTh + 8;
          if (th > myTh + 8) score += 35;
          if (mine.length > enemies.length + 1) score += 12;
          if (myL.critical) score -= 55;
          if (egg && (lethal || racing)) score -= 80;
          if (score > 15) plans.push({ atk, def: e, score });
        } else if (lv === 'hard' && ap + 1 >= dp && mine.length >= 3 && enemies.length >= 2 && th > myTh + 20) {
          plans.push({ atk, def: e, score: 18 + th - myTh });
        }
      }
      if (lv !== 'easy') {
        for (const e of enemyCons) {
          const dp = eff(e);
          if (ap > dp) {
            let score = 42 + dp;
            if (egg && (lethal || racing)) score -= 40;
            plans.push({ atk, def: e, score });
          }
        }
      }
      if (life && (enemies.length === 0 || egg) && ap > 0) {
        let lifeScore = 88 + Math.min(ap, 10);
        if (lethal) lifeScore = 2500 + ap;
        else {
          if (racing) lifeScore += 45;
          if (oppL.down <= 2) lifeScore += 55;
          if (oppL.down <= 1) lifeScore += 90;
          if (cleared && leftover.length > 1 && !egg) lifeScore -= 12;
          if (lv === 'hard') lifeScore += 8;
        }
        plans.push({ atk, life, score: lifeScore });
      }
    }
    if (lv === 'easy' && !lethal && plans.some(p => p.life) && Math.random() < 0.25) {
      if (plans.every(p => p.life)) return false;
    }
    if (!plans.length) return false;
    plans.sort((a, b) => b.score - a.score);
    const ordered = canLethalNow ? plans.filter(p => p.life).concat(plans.filter(p => !p.life)) : plans;
    for (const p of ordered) {
      if (p.life) {
        if (botSend({ type: 'declareAttack', atk: p.atk, life: p.life, by: 'B' })) return true;
      } else if (botSend({ type: 'declareAttack', atk: p.atk, def: p.def, by: 'B' })) return true;
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
        return c && (/Only/i.test(String(c.ex || '')) || (BoTEngine.effectOf && (BoTEngine.effectOf(c.code, c.name) || {}).only));
      });
      if (onlyHit && (pr.autoPickOnly || pr.from === 'deckOrHell' || pr.dest === 'magic')) return onlyHit;
    }
    const dest = pr.dest || '';
    const from = pr.from || '';
    const enemySide = k => BoTEngine.ownerOf(st, k) === 'A';
    const ownSide = k => BoTEngine.ownerOf(st, k) === 'B';
    const AI = botAI();
    const arch = botArch();

    if (dest === 'retargetAttack' || pr.kind === 'chooseDestroy' || dest === 'destroy' || (dest === 'hell' && from === 'enemyAvatars')
      || from === 'enemyAvatars' || (pr.side === 'enemy' && pr.kind !== 'chooseBuff')) {
      const enemies = cands.filter(enemySide).sort((a, b) => botThreatScore(b) - botThreatScore(a) || eff(b) - eff(a));
      if (enemies[0]) return enemies[0];
    }
    if (pr.kind === 'chooseDiscard' || dest === 'discard' || dest === 'giveHandNegate' || dest === 'giveToOpp' || from === 'ownHand') {
      return cands.slice().sort((a, b) => botCardVal(a) - botCardVal(b))[0];
    }
    if (dest === 'sacrifice' || dest === 'sacSummon' || dest === 'bothReturn' || from === 'ownAvatars') {
      if (dest === 'attachTo' || dest === 'avatar') {
        return cands.filter(ownSide).sort((a, b) => eff(b) - eff(a))[0] || cands[0];
      }
      return cands.filter(ownSide).sort((a, b) => eff(a) - eff(b) || botCardVal(a) - botCardVal(b))[0] || cands[0];
    }
    // อัญเชิญ / ขึ้นมือ / คืนเด็ค — เลือกตามอาร์คไทป์
    if (dest === 'avatar' || dest === 'hand' || dest === 'scoutOtaHost' || dest === 'deck' || from === 'ownHell'
      || pr.kind === 'hellPick' || /hell/i.test(dest + from + (pr.kind || ''))) {
      if (AI) {
        const pick = AI.pickSummonTarget(st, 'B', cands, arch);
        if (pick) return pick;
      }
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
        const oppAv = (st.zones['A.avatar'] || []).filter(id => st.inst[id] && st.inst[id].type === 'Avatar');
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
    const cands = BoTEngine.promptCandidates(st, pr);
    if (pr.kind === 'chooseMode' && pr.options && pr.options.length) {
      const AI = botAI();
      const denyFn = opt => botModeOptionDeny(pr.src, opt);
      let opt = AI
        ? AI.pickChooseModeIndex(st, 'B', pr, denyFn)
        : 0;
      // ลองทีละตัวเลือกที่ใช้ได้ — กันค้างเมื่อเทค 1 ใช้ไปแล้ว
      const order = [opt];
      for (let i = 0; i < pr.options.length; i++) if (i !== opt) order.push(i);
      for (const i of order) {
        if (denyFn(pr.options[i])) continue;
        if (botSend({
          type: 'chooseMode', k: pr.src, opt: i,
          label: (pr.options[i] && pr.options[i].label) || '', by: 'B',
        })) return;
      }
      // ทุกทางใช้ไม่ได้ — ข้ามเพื่อไม่ค้างโต๊ะ (แม้ optional=false บาง dest ยอมข้าม)
      if (!botSend({ type: 'skipPrompt', by: 'B' })) {
        // กันลูป: มาร์คว่า prompt นี้ลองแล้ว แล้วไปต่อไม่ได้ก็รอ tick ถัดไปหลัง fail key
        botFailKeys.add('chooseMode:stuck:' + (pr.src || ''));
      }
      return;
    }
    if (pr.kind === 'react') {
      if (pr.mode === 'negateMagic' || pr.magicNegate) {
        const opts = (pr.options || []).slice();
        if (!opts.length) { botSend({ type: 'reactNo', by: 'B' }); return; }
        const tgt = pr.target && st.inst[pr.target];
        const AI = botAI();
        let threat = AI && AI.magicNegateThreat ? AI.magicNegateThreat(tgt) : 40;
        if (tgt && tgt.subtype === 'React') threat += 20;
        const lv = getBotLevel();
        const need = lv === 'easy' ? 90 : lv === 'hard' ? 32 : 48;
        if (threat < need) { botSend({ type: 'reactNo', by: 'B' }); return; }
        const tgtReact = !!(tgt && tgt.subtype === 'React');
        opts.sort((a, b) => {
          const na = /อย่าให้มีครั้งที่/.test((st.inst[a] && st.inst[a].name) || '');
          const nb = /อย่าให้มีครั้งที่/.test((st.inst[b] && st.inst[b].name) || '');
          if (tgtReact && na !== nb) return na ? -1 : 1;
          if (!tgtReact && na !== nb) return na ? 1 : -1;
          return botCardVal(a) - botCardVal(b);
        });
        for (const k of opts) {
          if (botSend({ type: 'chooseTarget', k, by: 'B' })) return;
        }
        botSend({ type: 'reactNo', by: 'B' });
        return;
      }
      if (pr.reactTrigger === 'enemyDeclareAttack' && st.pending && st.pending.target === 'B') {
        const opts = botRankCombatReacts(pr.options || []);
        if (botShouldCombatReact(st.pending) && opts.length) {
          for (const k of opts) {
            if (botSend({ type: 'chooseTarget', k, by: 'B' })) return;
          }
        }
        botSend({ type: 'reactNo', by: 'B' });
        return;
      }
      const pick = (pr.options && pr.options[0]) || pr.src;
      if (pick) {
        if (!botSend({ type: 'chooseTarget', k: pick, by: 'B' }))
          botSend({ type: 'reactNo', by: 'B' });
      } else botSend({ type: 'reactNo', by: 'B' });
      return;
    }
    if (pr.kind === 'magicRedirect') { botSend({ type: 'magicRedirectYes', by: 'B' }); return; }
    if (pr.kind === 'combatSurvive' || pr.kind === 'passengerReplace') {
      botSend({ type: pr.kind === 'combatSurvive' ? 'combatSurviveYes' : 'passengerReplaceYes', by: 'B' });
      return;
    }
    if (pr.kind === 'preventLeaveExile') {
      botSend({ type: 'preventLeaveYes', by: 'B' });
      return;
    }
    if (pr.kind === 'naraiHandForm' || pr.kind === 'milledOptional') {
      const pick = botPickTarget(pr, cands) || cands[0];
      if (pick) botSend({ type: 'chooseTarget', k: pick, by: 'B' });
      else botSend({ type: 'skipPrompt', by: 'B' });
      return;
    }
    if (pr.kind === 'guessReveal') {
      // ตำรวจสอดแนม: หลังเปิดโชว์ท็อปเด็ค — กดดำเนินการต่อ (ถูก=นรก+ผล / ผิด=ไว้เดิม)
      botSend({ type: 'guessRevealContinue', by: 'B' });
      return;
    }
    if (pr.kind === 'peekTop') {
      const card = pr.card;
      const val = card ? botCardVal(card) : 0;
      const AI = botAI();
      const arch = botArch();
      let where = (pr.allowHell && val < 15) ? 'hell' : (val < 20 ? 'bottom' : 'top');
      // เก็บแลนด์/เอนเอเบลอร์ไว้บน
      if (card && AI && (AI.isWantedLandCard(st.inst[card], arch) || AI.cardIsKeyEnabler(st.inst[card], arch)))
        where = 'top';
      botSend({ type: 'peekTopPlace', where, by: 'B' });
      return;
    }
    if (pr.kind === 'handOrSummon') {
      const cid = pr.card;
      const c = cid && st.inst[cid];
      const AI = botAI();
      let where = (c && c.type === 'Avatar' && (+c.power || 0) >= 3) ? 'avatar' : 'hand';
      if (c && AI && AI.cardIsKeyEnabler(c, botArch()) && c.type === 'Avatar') where = 'avatar';
      botSend({ type: 'handOrSummonPick', where, by: 'B' });
      return;
    }
    if (pr.kind === 'pickSymbol') {
      const opts = pr.symbols || pr.options || [];
      const symbol = (typeof opts[0] === 'string' ? opts[0] : (opts[0] && (opts[0].symbol || opts[0].label))) || 'สัตว์';
      botSend({ type: 'pickSymbol', symbol, by: 'B' });
      return;
    }
    if (pr.dest === 'payRemainSummon') {
      const ranked = cands.slice().sort((a, b) => botCardVal(a) - botCardVal(b));
      const pick = ranked[0];
      if (pick) botSend({ type: 'chooseTarget', k: pick, by: 'B' });
      else botSend({ type: 'skipPrompt', by: 'B' });
      return;
    }
    // โคกอีสานนูน เทค 1 ฯลฯ — คืนนรกทีละใบจนครบ (exact) / หรือข้ามเมื่อพอใจ
    if (pr.dest === 'hellMultiDeck') {
      const got = pr.multiGot || 0;
      const max = pr.multiExact != null ? pr.multiExact : (pr.multiMax || 4);
      const magicMax = pr.magicMax;
      const magicGot = pr.magicGot || 0;
      if (got >= max) {
        botSend({ type: 'skipPrompt', by: 'B' });
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
        if (pr.multiExact == null) botSend({ type: 'skipPrompt', by: 'B' });
        else scheduleBot();
        return;
      }
      // คืนใบมูลค่าต่ำก่อน · เก็บเอนเอเบลอร์/แลนด์ไว้ในนรกถ้ายังไม่จำเป็น
      const AI = botAI();
      const arch = botArch();
      const ranked = filtered.slice().sort((a, b) => {
        let sa = botCardVal(a), sb = botCardVal(b);
        if (AI) {
          if (AI.cardIsKeyEnabler(st.inst[a], arch) || AI.isWantedLandCard(st.inst[a], arch)) sa += 60;
          if (AI.cardIsKeyEnabler(st.inst[b], arch) || AI.isWantedLandCard(st.inst[b], arch)) sb += 60;
        }
        return sa - sb;
      });
      if (botSend({ type: 'chooseTarget', k: ranked[0], by: 'B' })) return;
      if (pr.multiExact == null) botSend({ type: 'skipPrompt', by: 'B' });
      else scheduleBot();
      return;
    }
    const pick = botPickTarget(pr, cands);
    if (pick) {
      if (!botSend({ type: 'chooseTarget', k: pick, by: 'B' })) {
        // เป้าแรก fail — ลองใบอื่นก่อนค้าง
        for (const k of cands) {
          if (k === pick) continue;
          if (botSend({ type: 'chooseTarget', k, by: 'B' })) return;
        }
        if (pr.optional !== false) botSend({ type: 'skipPrompt', by: 'B' });
        else scheduleBot();
      }
      return;
    }
    if (pr.optional !== false) botSend({ type: 'skipPrompt', by: 'B' });
    else if (cands[0]) botSend({ type: 'chooseTarget', k: cands[0], by: 'B' });
    else botSend({ type: 'skipPrompt', by: 'B' });
  }
  function botMulliganIds() {
    if (getBotLevel() === 'easy') return [];
    const hand = (st.zones['B.hand'] || []).slice();
    if (hand.length < 5) return [];
    const AI = botAI();
    const arch = botArch();
    const avatars = hand.filter(k => st.inst[k] && st.inst[k].type === 'Avatar');
    const playable = avatars.filter(k => {
      const cost = BoTEngine.effCost ? BoTEngine.effCost(st, k) : (+st.inst[k].cost || 0);
      return !!botBuildPay(k, cost);
    });
    const hasKey = hand.some(k => AI && (AI.isWantedLandCard(st.inst[k], arch) || AI.cardIsKeyEnabler(st.inst[k], arch)));
    if (playable.length >= 1 && (avatars.length >= 1 || hasKey)) {
      if (getBotLevel() === 'hard' && playable.length === 1 && avatars.length >= 3) {
        return hand.filter(k => avatars.includes(k) && !playable.includes(k) && (+st.inst[k].cost || 0) >= 5)
          .sort((a, b) => {
            const sa = AI ? AI.mulliganKeepScore(st, 'B', a, arch, false) : botCardVal(a);
            const sb = AI ? AI.mulliganKeepScore(st, 'B', b, arch, false) : botCardVal(b);
            return sa - sb;
          }).slice(0, 2);
      }
      return [];
    }
    const drop = hand.filter(k => {
      const c = st.inst[k]; if (!c) return false;
      if (AI && (AI.isWantedLandCard(c, arch) || AI.cardIsKeyEnabler(c, arch))) return false;
      if (c.type === 'Avatar' && (+c.cost || 0) >= 6 && !playable.includes(k)) return true;
      if (c.type === 'Magic' && c.subtype === 'Modification' && !avatars.length) return true;
      if (AI && AI.mulliganKeepScore(st, 'B', k, arch, playable.includes(k)) < 0) return true;
      return false;
    }).sort((a, b) => botCardVal(a) - botCardVal(b));
    return drop.slice(0, Math.min(getBotLevel() === 'hard' ? 4 : 3, drop.length));
  }
  function botHandleScout() {
    const sc = st.scout;
    if (!sc || sc.p !== 'B') return false;
    const rest = (sc.ids || []).filter(k => st.inst[k] && !(sc.taken || []).includes(k));
    const AI = botAI();
    const arch = botArch();
    const keepTop = rest.some(k => AI && (AI.isWantedLandCard(st.inst[k], arch) || AI.cardIsKeyEnabler(st.inst[k], arch)));
    if (keepTop) return botSend({ type: 'scoutEnd', where: 'top', by: 'B' });
    const avg = rest.reduce((s, k) => s + botCardVal(k), 0) / (rest.length || 1);
    const bury = rest.length && rest.every(k => botCardVal(k) < avg * 0.7);
    return botSend({ type: 'scoutEnd', where: bury ? 'bottom' : 'top', by: 'B' });
  }
  function botDefend() {
    const lv = getBotLevel();
    const pend = st.pending;
    if (!pend || pend.target !== 'B') return false;
    if ((st.prompts || []).some(p => p.chooser === pend.by)) return true;
    const atkP = pend.atk ? eff(pend.atk) : 0;
    const defP = pend.def ? eff(pend.def) : 0;
    const opts = botRankCombatReacts(
      (BoTEngine.attackReactOptions && BoTEngine.attackReactOptions(st, 'B'))
      || (BoTEngine.counterOptions && BoTEngine.counterOptions(st, 'B'))
      || []
    );
    if (opts.length && botShouldCombatReact(pend)) {
      for (const k of opts) {
        if (botSend({ type: 'playMagic', k, by: 'B' })) return true;
      }
    }
    const shields = (BoTEngine.humanShieldOptions && BoTEngine.humanShieldOptions(st, 'B')) || [];
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
          if (botSend({ type: 'humanShield', k: best.k, by: 'B' })) return true;
        }
      }
    }
    return botSend({ type: 'resolveAttack', by: 'B' });
  }
  /* แบนเนอร์โจมตีถอดแล้ว — ฝ่ายรับแตะ React/โล่ที่กะพริบได้ แล้วปะทะอัตโนมัติ */
  function clearAutoResolveAtk() {
    if (autoResolveAtkT) { clearTimeout(autoResolveAtkT); autoResolveAtkT = null; }
    autoResolveAtkKey = null;
  }
  function scheduleAutoResolveAtk() {
    if (!st || !st.pending || !st.inst[st.pending.atk]) { clearAutoResolveAtk(); return; }
    const pnd = st.pending;
    // บอทฝั่งรับ — botDefend / หน้าต่าง React จัดการเอง
    if (mode === 'solo' && soloBot && pnd.target !== my) { clearAutoResolveAtk(); return; }
    const iAmDef = mode === 'solo' ? (soloBot ? pnd.target === my : true) : seat === pnd.target;
    if (!iAmDef) { clearAutoResolveAtk(); return; }
    // มี prompt ค้าง (เซ่นเมื่อโจมตี / ถาม React ฝ่ายรับ) — อย่าปะทะทับ
    if ((st.prompts || []).length) { clearAutoResolveAtk(); return; }
    const key = `${pnd.atk}|${pnd.def || pnd.life || ''}|${pnd.target}`;
    if (autoResolveAtkKey === key && autoResolveAtkT) return; // อย่ารีเซ็ตเวลาทุกรอบ render
    clearAutoResolveAtk();
    autoResolveAtkKey = key;
    const opts = (BoTEngine.counterOptions && BoTEngine.counterOptions(st, pnd.target)) || [];
    const shields = (BoTEngine.humanShieldOptions && BoTEngine.humanShieldOptions(st, pnd.target)) || [];
    const delay = (opts.length || shields.length) ? 1800 : 120;
    const atkKey = pnd.atk;
    const defSide = pnd.target;
    autoResolveAtkT = setTimeout(() => {
      autoResolveAtkT = null;
      autoResolveAtkKey = null;
      if (!st || !st.pending || st.pending.atk !== atkKey || st.pending.target !== defSide) return;
      if ((st.prompts || []).length) return;
      sendAction({ type: 'resolveAttack', by: mode === 'solo' ? defSide : undefined });
    }, delay);
  }
  function botTick() {
    if (!botActive()) return;
    if (st.turn === 1 && !st.fpDrawn && !st.awaitBattleStart) {
      const done = st.mulliganDone || {};
      if (!done.B) {
        const fp0 = st.firstPlayer || 'A';
        if (fp0 === 'B' || done.A) {
          botSend({ type: 'mulligan', p: 'B', ids: botMulliganIds() });
          return;
        }
      }
    }
    if (st.scout && st.scout.p === 'B') { botHandleScout(); return; }
    if ((st.chain || []).length && st.chainPri === 'B') {
      botSend({ type: 'chainPass', by: 'B' });
      return;
    }
    const pr = (st.prompts || [])[0];
    if (pr && pr.chooser === 'B') return botHandlePrompt(pr);
    if (pr || st._pendingMagic) return;
    if (st.pending && st.pending.target === 'B') { botDefend(); return; }
    if (st.pending && st.pending.by === 'B') return;
    if (st.active !== 'B') return;
    if (st.phase === 'Main') {
      if (botTryMain()) return;
      botSend({ type: 'setPhase', phase: 'Battle', by: 'B' });
      return;
    }
    if (st.phase === 'Battle') {
      // สามัคคีก่อน แล้วค่อยโจมตี (รวมตี LIFE ด้วยเตะไข่จากไม้เกาหลัง ฯลฯ)
      if (botTryUnity()) return;
      if (botTryAttack()) return;
      const bh = st.zones['B.hand'] || [];
      if (bh.length > 7) {
        const drop = bh.slice().sort((a, b) => botCardVal(a) - botCardVal(b))[0];
        botSend({ type: 'move', k: drop, to: 'B.hell', by: 'B' });
        return;
      }
      botSend({ type: 'endTurn', by: 'B' });
      return;
    }
    botSend({ type: st.phase === 'End' ? 'endTurn' : 'setPhase', phase: 'Main', by: 'B' });
  }

  /* ── มุมมองฝั่งบนโต๊ะ (มือด้านล่าง = my) ── */
  function applyPerspective() {
    const dropMap = {
      myAvatarZone: my + '.avatar', myMagicZone: my + '.magic', myConstructZone: my + '.construct',
      myHell: my + '.hell', myDark: my + '.dark', myDeck: my + '.deck', myHandRow: my + '.hand',
      oppAvatarZone: opp + '.avatar', oppMagicZone: opp + '.magic', oppConstructZone: opp + '.construct',
      oppHell: opp + '.hell', oppDark: opp + '.dark', oppDeck: opp + '.deck',
    };
    for (const id in dropMap) { const el = byId(id); if (el) el.dataset.drop = dropMap[id]; }
    byId('myDeck').dataset.deck = my; byId('oppDeck').dataset.deck = opp;
    byId('myHell').dataset.pile = my + '.hell'; byId('oppHell').dataset.pile = opp + '.hell';
    byId('myDark').dataset.pile = my + '.dark'; byId('oppDark').dataset.pile = opp + '.dark';
    const lifeWho = byId('oppLifeWho'); if (lifeWho) lifeWho.textContent = opp;
  }
  function canSwapSoloSide() {
    return mode === 'solo' && !soloBot && !realMode && !STREAM && !!st && !st.over;
  }
  function swapSoloSide() {
    if (!canSwapSoloSide()) return;
    const was = my;
    my = opp; opp = was;
    selMap = {};
    closeMenu();
    applyPerspective();
    toast(`กำลังเล่นฝั่ง ${my} — มือด้านล่างคือฝั่ง ${my}`, 2500);
    render();
  }
  function syncSwapSideBtns() {
    const show = canSwapSoloSide();
    const need = show && st && st.active !== my;
    const target = need ? st.active : opp;
    const title = need
      ? `ตาฝั่ง ${st.active} แล้ว — กดเพื่อย้ายมือฝั่ง ${st.active} มาด้านล่าง`
      : `สลับมุมมอง — มือฝั่ง ${opp} จะมาอยู่ด้านล่าง`;
    const top = byId('btnSwapSide');
    if (top) {
      top.textContent = `⇄${target}`;
      top.title = title;
      top.classList.toggle('need', !!need);
      top.classList.toggle('hidden', !show);
    }
    const ctrl = byId('btnSwapSideCtrl');
    if (ctrl) {
      ctrl.textContent = need ? `⇄ สลับมาเล่นฝั่ง ${st.active}` : `⇄ สลับฝั่งผู้เล่น (ตอนนี้ล่าง = ${my})`;
      ctrl.title = title;
      ctrl.classList.toggle('need', !!need);
    }
    const row = byId('swapSideRow'); if (row) row.classList.toggle('hidden', !show);
  }

  /* ── เริ่มโต๊ะ ── */
  function startTable(instant) {
    // 📺 บานสนาม: ฝั่ง "ของเรา" มาจากที่นั่งของหน้าต่างหลัก (ไม่ใช่ A ตายตัว) เพื่อโชว์บอร์ดฝั่งถูก
    my = STREAM ? streamSide : (seat === 'S' ? 'A' : seat); opp = my === 'A' ? 'B' : 'A';
    // ★ ผู้ชม: ใส่คลาสให้ CSS ทำสองฝั่งเท่ากัน (ไม่มีฝั่งไหนเป็น "ของเรา")
    byId('table').classList.toggle('spectate', mode === 'online' && seat === 'S');
    showScreen('table', instant);
    byId('endOv').classList.add('hidden');
    battleIntroPlaying = false;
    battleIntroKey = '';
    const bov = byId('battleOv');
    if (bov) { bov.classList.add('hidden'); bov.classList.remove('show', 'play', 'out'); }
    applyPerspective();
    pileView = null; byId('pileView').classList.add('hidden');
    byId('btnInvite').classList.toggle('hidden', mode !== 'online');
    if (window.BotSkins) {
      const oppSkins = (mode === 'online' && roomSt && roomSt[opp]) ? roomSt[opp].skins : null;
      BotSkins.applyMatch(null, oppSkins);
    }
    if (!STREAM) applyOneSide();   // ⬍ ตั้งสนามฝั่งเดียว/สองฝั่งตามโหมด ก่อนวัดขนาดใน onResize
    if (!gameStart) gameStart = Date.now();
    if (mode === 'solo' && !STREAM) reportTable(realMode ? 'real' : 'solo');   // 📊
    try { if (!localStorage.getItem('bot_tut_seen')) byId('tut').classList.remove('hidden'); } catch (e) { }
    onResize();
    render();
    scheduleBot();
  }

  /* ── จบเกม ── */
  function fmtTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function showEnd(winner, winNick) {
    if (!st) return;
    byId('endAsk').classList.add('hidden');
    let title;
    if (winner === 'draw') title = 'เสมอ!';
    else if (mode === 'solo' && soloBot) title = winner === 'A' ? 'คุณชนะ! 🎉' : '🤖 บอทชนะ';
    else if (mode === 'solo') title = (winner === 'A' ? 'ฝั่ง A' : 'ฝั่ง B') + ' ชนะ!';
    else title = `${esc(winNick || 'ผู้เล่น ' + winner)} ชนะ!`;
    byId('endTitle').innerHTML = title;
    byId('stTurns').textContent = st.turn;
    byId('stTime').textContent = fmtTime(Date.now() - gameStart);
    const hellAv = ['A', 'B'].reduce((n, p) => n + (st.zones[p + '.hell'] || []).filter(k => st.inst[k].type === 'Avatar').length, 0);
    byId('stHell').textContent = hellAv;
    const lifeUp = (st.zones[my + '.life'] || []).filter(k => st.inst[k].faceUp).length;
    byId('stLife').textContent = lifeUp + '/' + (st.zones[my + '.life'] || []).length;
    byId('btnRematch').classList.toggle('hidden', mode === 'online' && seat === 'S');
    byId('endOv').classList.remove('hidden');
  }

  /* ── render โต๊ะ ── */
  function tagCls(p) { return p === 'A' ? 'A' : p === 'B' ? 'B' : 'S'; }
  // สถานะคู่หู (Link) — Avatar ที่ระบุ [คู่หู/Link - ชื่อพันธมิตร] และพันธมิตรอยู่บน Avatar Zone ฝั่งเดียวกัน
  const normName = s => (s || '').replace(/[่-๋]/g, '').replace(/ี/g, 'ิ').replace(/ื/g, 'ึ').replace(/ู/g, 'ุ').replace(/["“”']/g, '').replace(/\s+/g, '').toLowerCase();
  function buddyPartnerName(effect) {
    const e = effect || '';
    let m = e.match(/\[\s*(?:Link|คู่หู)\s*[-–—]?\s*([^\]\n]+?)\s*\]/);
    if (m) return m[1].trim().replace(/^["“”]|["“”]$/g, '');
    m = e.match(/(?:^|\n)\s*คู่หู\s*[-–—]\s*["“”]?([^"“”\n\[]+)["“”]?/);
    return m ? m[1].trim() : null;
  }
  function hasBuddyAbility(c) {
    if (!c) return false;
    const e = c.effect || '';
    return /\[\s*(?:Link|คู่หู)\b/.test(e) || /(?:^|\n)\s*คู่หู\s*[-–—]/.test(e);
  }
  function buddyNamesMatch(a, b) {
    const na = normName(a), nb = normName(b);
    return !!(na && nb && (na.includes(nb) || nb.includes(na)));
  }
  function canBuddyPairWith(c1, c2) {
    if (!c1 || !c2) return false;
    if (!hasBuddyAbility(c1) && !hasBuddyAbility(c2)) return false;
    const p1 = buddyPartnerName(c1.effect);
    const p2 = buddyPartnerName(c2.effect);
    if (p1 && buddyNamesMatch(p1, c2.name)) return true;
    if (p2 && buddyNamesMatch(p2, c1.name)) return true;
    return false;
  }
  function inBuddyStatus(st, k) {
    const c = st.inst[k]; if (!c || c.type !== 'Avatar' || !c.faceUp) return false;
    const partner = buddyPartnerName(c.effect); if (!partner) return false;
    const side = (BoTEngine.zoneOf(st, k) || '')[0]; if (side !== 'A' && side !== 'B') return false;
    return (st.zones[side + '.avatar'] || []).some(x => {
      if (x === k) return false; const o = st.inst[x]; if (!o || !o.faceUp) return false;
      return buddyNamesMatch(partner, o.name);
    });
  }
  function cardHTML(k, cls, opts) {
    const c = st.inst[k]; if (!c) return '';
    opts = opts || {};
    const classes = ['card', cls];
    if (c.tapped && !opts.noTap) classes.push('tapped');
    if (k === lastDrawn) classes.push('deal');
    if (pendingReveal.has(k)) classes.push('vfx-hide');
    if (k === lastFlip) classes.push('flipping');
    if (selMap[k]) classes.push('sel');
    let inner;
    const fb = `<div class="fb"><div class="fb-name">${esc(c.name)}</div>${(c.power !== '' && c.power != null) ? `<div class="fb-pow">P${c.power}</div>` : ''}</div>`;
    if (c.faceUp || opts.forceUp) inner = `<div class="face">${fb}<div class="img" style="background-image:url('${esc(c.img)}')"></div></div>`;
    else inner = `<div class="back"></div>`;
    const ctr = c.counters !== 0 ? `<div class="ctr">${c.counters > 0 ? '+' : ''}${c.counters}</div>` : '';
    const gem = (() => {
      if (!selMap[k]) return '';
      const h = payGemHint(c);
      if (h) return `<div class="gem" title="เป็น Cost อัญเชิญ「${h.name}」→ GEM ${h.v}">${GEM_EMOJI[h.col] || ''} GEM ${h.printed}→${h.v}</div>`;
      return `<div class="gem">${GEM_EMOJI[gemColorOf(c)] || ''} GEM ${+c.gem || 0}</div>`;
    })();
    // POWER จริง (รวม aura/บัฟ) บนการ์ด Avatar และ Construct ในสนาม — โชว์เสมอ + tooltip แหล่งเพิ่ม/ลด
    let pw = '';
    if ((cls === 'avatar' || cls === 'construct') && c.faceUp && c.power !== '' && c.power != null) {
      const bd = BoTEngine.powerBreakdown ? BoTEngine.powerBreakdown(st, k) : null;
      const eff = bd ? bd.total : BoTEngine.effPower(st, k);
      const base = +c.power || 0;
      const tip = bd && bd.lines && bd.lines.length
        ? bd.lines.map(l => `${l.amt > 0 ? '+' : ''}${l.amt} ${l.label}`).join('\n') + `\n= P${eff}`
        : `P${eff}`;
      const clsPw = eff > base ? ' up' : eff < base ? ' down' : '';
      pw = `<div class="pw${clsPw}" title="${esc(tip)}">P${eff}</div>`;
    }
    const order = opts.order ? `<div class="pile-order">${opts.order}</div>` : '';
    const scoutBadge = opts.badge ? `<div class="scout-badge">${opts.badge}</div>` : '';
    if (opts.extraClass) String(opts.extraClass).split(/\s+/).filter(Boolean).forEach(c => classes.push(c));
    // ไฮไลต์เป้าที่เลือกได้ของ prompt + React ที่เปิดใช้ได้ (เขียว)
    const pr0 = (st.prompts || [])[0];
    if (pr0 && (mode === 'solo' || seat === pr0.chooser) && BoTEngine.promptTargetOk(st, k)) {
      classes.push(pr0.kind === 'react' ? 'react-pick' : 'targetable');
      if (pr0.from === 'ownMagic') classes.push('pick-ok');
    }
    // สวนกลับตอนถูกโจมตี — ใบ React ในมือกะพริบเขียวด้วย
    if (st.pending && (mode === 'solo' || seat === st.pending.target) && BoTEngine.counterOptions) {
      const cops = BoTEngine.counterOptions(st, st.pending.target) || [];
      if (cops.includes(k)) classes.push('react-pick');
    }
    // โล่มนุษย์ — Avatar ที่รับแทนได้กะพริบ
    if (st.pending && (mode === 'solo' || seat === st.pending.target) && BoTEngine.humanShieldOptions) {
      const sh = BoTEngine.humanShieldOptions(st, st.pending.target) || [];
      if (sh.includes(k)) classes.push('react-pick');
    }
    // 🔗 สวมใส่ — การ์ดยังอยู่ใน Magic Zone (ลากเส้นเชื่อมใน drawLinks) · ป้ายบอกชื่อบนตัว Avatar
    const atts = Object.values(st.inst).filter(x => x.attachedTo === k);
    // สวมได้ไม่จำกัดใบ — ใบเดียวโชว์ชื่อ · หลายใบโชว์จำนวน (ชี้เมาส์ดูรายชื่อครบ)
    let att = '';
    if (atts.length) {
      const names = atts.map(x => x.name).join(' · ');
      att = `<div class="att" title="สวมใส่อยู่: ${esc(names)}">🔗 ${atts.length > 1 ? `สวมอยู่ ${atts.length} ใบ` : esc(names)}</div>`;
    }
    if (c.attachedTo && st.inst[c.attachedTo]) { classes.push('is-att'); att += `<div class="att src">🔗 สวมให้ ${esc(st.inst[c.attachedTo].name)}</div>`; }
    // สถานะคู่หู — กรอบพิเศษ + ป้าย 🤝
    let buddy = '';
    if (c.pairWith && st.inst[c.pairWith]) { // คู่หูที่จับเอง — กรอบสีเดียวกันทั้งคู่ + ป้ายบอกชื่อคู่
      classes.push('paired', 'pair-' + (c.pairId || 1));
      buddy = `<div class="buddy-badge pair" title="คู่หูกับ ${esc(st.inst[c.pairWith].name)}">🤝</div>`;
    } else if (cls === 'avatar' && c.faceUp && inBuddyStatus(st, k)) { classes.push('buddy'); buddy = `<div class="buddy-badge" title="เข้าสถานะคู่หู (ตามข้อความการ์ด)">🤝</div>`; }
    let od = '';
    if (cls === 'avatar' && c.faceUp && BoTEngine.inOverdose && BoTEngine.inOverdose(st, k)) {
      classes.push('overdose');
      od = `<div class="od-badge" title="สถานะ Overdose — LIFE หงาย ≥ 3">OD</div>`;
    }
    // สืบทอดคำสั่ง — ป้าย 🧬 บนผู้รับ + ไฮไลต์เป้าตอนเลือกผู้รับ
    let inh = '';
    if (c.inheritedFrom && c.inheritedFrom.length) { classes.push('inherited'); inh = `<div class="inh-badge" title="รับสืบทอด: ${esc(c.inheritedFrom.join(', '))}">🧬</div>`; }
    if (inheritSrc && cls === 'avatar' && k !== inheritSrc) {
      const side = mode === 'solo' ? my : seat;
      if (BoTEngine.ownerOf(st, k) === side) classes.push('inherit-target');
    }
    // Token — ตัวแทน Avatar (ออกจาก Avatar Zone = นำออกจากเกม) · กรอบประ + ป้าย ⧉
    let tok = '';
    if (c.isToken) { classes.push('token'); tok = `<div class="token-badge" title="Token — ตัวแทน Avatar (ออกจากโซนแล้วนำออกจากเกม ไม่ลงนรก)">⧉ Token</div>`; }
    if (c.revealed) { classes.push('revealed'); tok += `<div class="rev-badge" title="เปิดให้อีกฝั่งดูอยู่">👁</div>`; }
    // สวนกล้วยหนีภาษี ฯลฯ — เหลือกี่ End Phase (นับทุกฝ่าย)
    if (c._globalEndLeft != null && c._globalEndLeft > 0) {
      tok += `<div class="rev-badge" title="End Phase รวมทุกฝ่าย · เหลือ ${c._globalEndLeft} ครั้งจะลงนรก">⏳${c._globalEndLeft}</div>`;
    }
    if (cls === 'magic' && c.faceUp && !opts.forceUp && c.name) {
      tok += `<div class="mz-name" title="${esc(c.name)}">${esc(c.name)}</div>`;
    }
    // ปุ่มลัดลอยบนการ์ด — สนาม: โผล่ตอนชี้เมาส์ · มือ/นรกที่มีสั่งใช้: โชว์ ⚡ ตลอด · คลิกขวา = สั่งใช้
    let qa = '';
    const qz = ['avatar', 'magic', 'construct', 'land'].includes(cls);
    const kz0 = BoTEngine.zoneOf(st, k) || '';
    const abs0 = (BoTEngine.effectOf && ((BoTEngine.effectOf(c.code, c.name) || {}).abilities || [])) || [];
    const hasHandAct = cls === 'hand' && kz0.endsWith('.hand') && abs0.some(ab => ab.trigger && ab.trigger.on === 'activatedFromHand');
    const handActOk = hasHandAct && canControl(k) && !mullP && !st.awaitBattleStart;
    const hasHellAct = kz0.endsWith('.hell') && abs0.some(ab => {
      const on = ab.trigger && ab.trigger.on;
      return on === 'activatedFromHell' || ab.fromHell;
    });
    const hellActOk = hasHellAct && canControl(k) && !mullP && !st.awaitBattleStart;
    if (handActOk) {
      classes.push('hand-act');
      qa = `<div class="qa qa-hand"><button class="qa-b" data-qa="act" data-k="${k}" title="⚡ สั่งใช้จากมือ (หรือคลิกขวา)">⚡</button></div>`;
    } else if (hellActOk) {
      classes.push('hell-act');
      qa = `<div class="qa qa-hand"><button class="qa-b" data-qa="act" data-k="${k}" title="⚡ สั่งใช้จากนรก (หรือคลิกขวา)">⚡</button></div>`;
    } else if (qz && !opts.forceUp && !opts.noTap && canControl(k)) {
      const canUnityBtn = cls === 'avatar' && canUseUnity(k);
      const canModAtt = cls === 'magic' && canAttachFromMagic(k);
      // มีความสามารถสั่งใช้ (activated) เท่านั้นถึงโชว์ ⚡ — กดแล้วถ้ามีเลือกปฏิบัติจะขึ้นกล่อง 2 เทค
      const hasAct = abs0.some(ab => {
        const on = ab.trigger && ab.trigger.on;
        if (on === 'activated') return true;
        if ((on === 'activatedFromHell' || ab.fromHell) && kz0.endsWith('.hell')) return true;
        return false;
      });
      const parts = []
        .concat(canUnityBtn ? `<button class="qa-b qa-unity" data-qa="unity" data-k="${k}" title="🤝 สามัคคี — กดแล้วแตะ/ลากทับผู้รับ">🤝</button>` : [])
        .concat(canModAtt ? `<button class="qa-b qa-attach" data-qa="attach" data-k="${k}" title="🔗 สวมใส่ — กดแล้วแตะ/ลากทับ Avatar">🔗</button>` : [])
        .concat(hasAct ? `<button class="qa-b" data-qa="act" data-k="${k}" title="⚡ สั่งใช้ — ถ้ามีหลายเทคจะขึ้นกล่องให้เลือก">⚡</button>` : []);
      if (parts.length) qa = `<div class="qa">${parts.join('')}</div>`;
    }
    return `<div class="${classes.join(' ')}" data-cid="${k}">${inner}${ctr}${gem}${pw}${att}${buddy}${od}${inh}${tok}${order}${scoutBadge}${qa}</div>`;
  }
  const zoneHTML = (z, cls) => (st.zones[z] || []).map(k => cardHTML(k, cls)).join('');
  const topHTML = id => { const a = st.zones[id] || []; return a.length ? `<div class="pile-top" data-cid="${a[a.length - 1]}" style="background-image:url('${esc(st.inst[a[a.length - 1]].img)}')"></div>` : ''; };

  function render() {
    if (!st) return;
    if (STREAM) {
      byId('roomInfo').textContent = '📺 บานสนาม (ถ่ายทอด)' + (room ? ' · ห้อง #' + room : '') + ' — ไม่แสดงการ์ดในมือ';
    } else if (mode === 'online') {
      const oppOn = roomSt ? roomSt[opp].online : true;
      byId('roomInfo').textContent = `ห้อง #${room} · คุณ = ${seat === 'S' ? 'ผู้ชม' : 'ผู้เล่น ' + seat} · อีกฝั่ง: ${oppOn ? 'อยู่ในห้อง' : 'หลุด/ยังไม่เข้า'}${roomSt && roomSt.specs ? ' · ผู้ชม ' + roomSt.specs : ''}`;
    } else byId('roomInfo').textContent = soloBot ? '🤖 โหมดเล่นกับบอท' : 'โหมดเล่นคนเดียว (คุมทั้งสองฝั่ง)';
    const cm = byId('chipMe'), co = byId('chipOpp');
    const nn = p => (mode === 'online' && roomSt && roomSt[p].nick) ? roomSt[p].nick : 'ผู้เล่น ' + p;
    cm.textContent = mode === 'solo' && !realMode
      ? (soloBot ? 'คุณ' : `ฝั่ง ${my} (ล่าง)`)
      : `${nn(my)}${seat === 'S' ? '' : ' (คุณ)'}`;
    co.textContent = mode === 'solo' && !realMode
      ? (soloBot ? '🤖 บอท' : `ฝั่ง ${opp} (บน)`)
      : nn(opp);
    cm.className = 'chip' + (my === 'B' ? ' blue' : '') + (st.active === my ? ' active' : '');
    co.className = 'chip' + (opp === 'B' ? ' blue' : '') + (st.active === opp ? ' active' : '');
    const PH_TH = { Draw: 'จั่ว', Main: 'เมน', Battle: 'สู้รบ', End: 'จบเทิร์น' };
    // มือถือแนวตั้ง: แถบบนเหลือแค่เทิร์น+เฟส · เดสก์ท็อปโชว์เต็ม
    const portraitUI = window.matchMedia('(max-width:920px) and (orientation:portrait)').matches;
    byId('turnText').innerHTML = portraitUI
      ? `<span class="tt-turn">T${st.turn}</span> · <b class="ph-tag ph-${st.phase}">${PH_TH[st.phase] || st.phase}</b>${mode === 'solo' && !realMode ? ` · <span class="tt-side">${my}</span>` : ''}`
      : `เทิร์น ${st.turn} · <b class="ph-tag ph-${st.phase}">เฟส ${PH_TH[st.phase] || st.phase}</b>`;
    syncPhaseSlot();
    syncSwapSideBtns();
    syncTableNav();
    if (lastPhaseShown !== st.phase + '|' + st.turn + '|' + st.active) {
      const prevActive = (lastPhaseShown || '').split('|')[2];
      lastPhaseShown = st.phase + '|' + st.turn + '|' + st.active;
      flashPhase(st.phase, st.active);
      // solo: เตือนเมื่อเทิร์น/ฝ่ายเปลี่ยนไปคนละฝั่งกับมุมมองปัจจุบัน
      if (canSwapSoloSide() && prevActive && prevActive !== st.active && st.active !== my)
        toast(`ตาฝั่ง ${st.active} — กด ⇄ สลับฝั่ง เพื่อย้ายมือมาด้านล่าง`, 4000);
    }
    // ปุ่มกติกาถูกถอดออก — แมนนวล 100% ถาวร
    byId('btnRematchTop').classList.toggle('hidden', seat === 'S');
    byId('btnBot').classList.add('hidden'); // ถอดบอทออก — solo คุมสองฝั่งเอง

    // แถบเชน — ฝ่ายที่มีสิทธิ์ตอบโต้เห็นปุ่ม, อีกฝ่ายเห็นสถานะรอ
    const cb = byId('chainBar');
    if ((st.chain || []).length && st.chainPri) {
      cb.classList.remove('hidden');
      const links = st.chain.map((l, i) => `${i + 1}.${st.inst[l.src] ? st.inst[l.src].name : '?'}${l.negated ? ' (ยกเลิก)' : ''}`).join('  →  ');
      const mineChain = mode === 'solo' ? (soloBot ? st.chainPri === my : true) : seat === st.chainPri;
      byId('chainText').textContent = `⛓️ เชน: ${links}  ·  ${mineChain ? 'ตาคุณตอบโต้ (ลากเวทลง Magic Zone / ยกเลิก / ผ่าน)' : 'รอฝ่าย ' + st.chainPri + ' ตอบโต้…'}`;
      byId('btnChainNegate').classList.toggle('hidden', !mineChain);
      byId('btnChainPass').classList.toggle('hidden', !mineChain);
    } else cb.classList.add('hidden');

    // แถบ prompt เอฟเฟกต์ (เลือกเป้า / ทิ้งจ่ายค่า / React)
    const pr = (st.prompts || [])[0];
    const pb = byId('promptBar');
    if (pr) {
      pb.classList.remove('hidden');
      const mine = mode === 'solo' ? (soloBot ? pr.chooser === my : true) : seat === pr.chooser;
      let txt = '⏳ รออีกฝ่ายตัดสินใจเอฟเฟกต์…';
      if (!mine && pr.kind === 'react' && (pr.magicNegate || pr.mode === 'negateMagic')) {
        const tgtN = pr.target && st.inst[pr.target] ? st.inst[pr.target].name : 'เวท';
        txt = `⏳ รอฝ่าย ${pr.chooser} ตอบว่าจะขัด "${tgtN}" ไหม…`;
      } else if (!mine && pr.kind === 'react' && pr.reactTrigger === 'enemyDeclareAttack') {
        txt = `⏳ รอฝ่าย ${pr.chooser} ตอบว่าจะใช้ React ไหม…`;
      } else if (!mine && pr.kind === 'react' && pr.reactTrigger === 'avatarWouldBeDestroyed') {
        txt = `⏳ รอฝ่าย ${pr.chooser} ตอบว่าจะกันทำลายไหม…`;
      }
      if (mine) {
        const srcN = st.inst[pr.src] ? st.inst[pr.src].name : '';
        if (pr.kind === 'chooseBuff') txt = `✨ ${srcN}: เลือก Avatar เป้าหมาย (POWER ${pr.amt > 0 ? '+' : ''}${pr.amt}) — แตะการ์ดที่กะพริบ`;
        if (pr.kind === 'chooseDestroy') txt = pr.ignoreProtect
          ? `💥 ${srcN}: ผู้ชนะเลือกทำลาย Avatar ใดก็ได้ (กันเวทไม่ช่วย) — แตะเป้า`
          : `💥 ${srcN}: แตะการ์ดบนสนามที่จะทำลาย${pr.optional ? ' (หรือข้าม)' : ''}`;
        if (pr.kind === 'pick') {
          if (pr.dest === 'payRemainSummon') {
            const nm = st.inst[pr.summonK] ? st.inst[pr.summonK].name : 'Avatar';
            txt = `💎 ${srcN || 'อัญเชิญ'}: 「${nm}」Cost เหลือ ${pr.need} (จ่ายแล้ว ${pr.got || 0}) — แตะการ์ดในมือเป็น GEM ให้ครบก่อนลงสนาม`;
          } else if (pr.dest === 'coinDestroy') txt = `🪙 ${srcN}: เลือก Avatar ฝ่ายตรงข้าม แล้วทอยเหรียญ`;
          else if (pr.from === 'ownMagic' && pr.dest === 'magicToHellCost')
            txt = `✨ ${srcN}: ส่งการ์ดบน Magic Zone ลงนรก (${pr.got || 0}/${pr.need || 1}) — แตะใบที่กะพริบในหน้าต่าง`;
          else if (pr.from === 'ownMagic' && pr.dest === 'avatar')
            txt = `✨ ${srcN}: เลือกการ์ดบน Magic Zone อัญเชิญลงสนาม — แตะใบที่กะพริบในหน้าต่าง`;
          else if (pr.from === 'ownMagic')
            txt = `✨ ${srcN}: เลือกการ์ดบน Magic Zone — แตะใบที่กะพริบในหน้าต่าง`;
          else if (pr.dest === 'naraiSacSummon') txt = `🕉️ ${srcN}: เลือกพระนารายณ์บนสนามส่งนรก เพื่ออัญเชิญอวตาร`;
          else if (pr.dest === 'avatar' && pr.naraiReturn) txt = `🕉️ จบเทิร์น: เลือกพระนารายณ์จากนรกอัญเชิญกลับขึ้นสนาม`;
          else if (pr.dest === 'destroy') txt = `💥 ${srcN}: เลือก Avatar ศัตรูที่จะทำลาย${pr.optional ? ' (หรือข้าม — จะไม่เปลี่ยนร่างตอนจบเทิร์น)' : ''}`;
          else if (pr.dest === 'attachSelf') txt = `✨ ${srcN}: เลือกการ์ดจากเด็คมาสวมใส่ตัวเอง`;
          else if (pr.dest === 'attachTo') txt = `🔗 ${srcN}: แตะ Avatar ที่จะสวมใส่ให้${pr.optional ? ' (หรือข้าม)' : ''}`;
          else if (pr.dest === 'sacrifice' && pr.keepSrc && pr.whenAttacking) {
            const need = (pr.filter && (pr.filter.symbol || (pr.filter.nameIncludes && (Array.isArray(pr.filter.nameIncludes) ? pr.filter.nameIncludes[0] : pr.filter.nameIncludes)))) || 'Avatar';
            txt = `☀️ ${srcN}: เมื่อโจมตี — เซ่นไหว้「${need}」1 ใบเพื่อตื่น แล้วค่อยปะทะ — แตะเป้า${pr.optional ? ' (หรือข้าม)' : ''}`;
          } else if (pr.dest === 'sacrifice' || (pr.from === 'ownAvatars' && pr.dest === 'sacrifice')) {
            const need = (pr.filter && (pr.filter.symbol || (pr.filter.nameIncludes && (Array.isArray(pr.filter.nameIncludes) ? pr.filter.nameIncludes[0] : pr.filter.nameIncludes)))) || 'Avatar';
            txt = `🔥 ${srcN}: เซ่นไหว้「${need}」— แตะ Avatar บนสนามที่จะสังเวย`;
          }
          else if (pr.from === 'ownAvatars' && pr.dest === 'attachTo')
            txt = `🔗 ${srcN}: แตะ Avatar ที่จะสวมใส่ให้${pr.optional ? ' (หรือข้าม)' : ''}`;
          else if (pr.from === 'ownAvatars') txt = `✨ ${srcN}: แตะ Avatar บนสนามฝั่งเรา`;
          else if (pr.dest === 'preventLeavePick') txt = `🛡️ เนรเทศรัททาทุยจากนรก (${pr.got || 0}/${pr.need || 5}) — แตะการ์ดในหน้าต่าง · ข้าม = ออกสนาม`;
          else if (pr.dest === 'retargetAttack') txt = `⚔️ เสียเตะไข่ — เลือกเป้าหมายโจมตีใหม่ (แตะ Avatar / Construct ศัตรูที่กะพริบ)`;
          else if (pr.from === 'deckOrHell') txt = `✨ ${srcN}: เลือกการ์ดจากเด็คหรือนรก`;
          else if (pr.from === 'anyHell') txt = pr.costSumMax != null
            ? `✨ ${srcN}: อัญเชิญจากนรกใครก็ได้ Cost รวม≤${pr.costSumMax} (ตอนนี้ ${pr.costGot || 0}) — แตะใบที่กะพริบ`
            : `✨ ${srcN}: เลือกจุติ Avatar จากนรกใครก็ได้`;
          else if (pr.from === 'hell') txt = `✨ ${srcN}: เลือกการ์ดจากนรก`;
          else if (pr.from === 'dark') txt = `🌀 ${srcN}: เลือกอาวุธนครจากมิติมืด — แตะใบที่กะพริบในหน้าต่าง`;
          else if (pr.from === 'ownHand') txt = `✋ ${srcN}: เลือกการ์ดจากมือ — แตะใบที่กะพริบในหน้าต่าง`;
          else txt = `✨ ${srcN}: เลือกการ์ดจากหน้าต่างที่เปิดอยู่`;
        }
        if (pr.kind === 'rps') txt = `✊ ${srcN}: เป่ายิ้งฉุบ! เลือกภายใน ${pr.seconds || 10} วินาที`;
        if (pr.kind === 'peekTop') txt = `👁 ${srcN}: สอดแนม "${st.inst[pr.card] ? st.inst[pr.card].name : '?'}" — เลือกไว้บนหรือใต้เด็ค`;
        if (pr.kind === 'handOrSummon') txt = `✨ ${srcN}: "${st.inst[pr.card] ? st.inst[pr.card].name : '?'}" Cost≤3 — ขึ้นมือ หรืออัญเชิญ (ไม่ได้จุติ)`;
        if (pr.kind === 'combatSurvive') txt = `🛡️ ${st.inst[pr.k] ? st.inst[pr.k].name : '?'}: จะถูกทำลายจากการต่อสู้ — สั่งใช้ POWER ${pr.amt || -1} เพื่อรอดไหม? (เทิร์นละครั้ง)`;
        if (pr.kind === 'passengerReplace') txt = `🛡️ ผู้โดยสาร: ${st.inst[pr.plane] ? st.inst[pr.plane].name : 'เครื่องบิน'} จะถูกทำลาย — ทำลายผู้โดยสารแทนไหม?`;
        if (pr.kind === 'magicRedirect') {
          const sh = st.inst[pr.shield] ? st.inst[pr.shield].name : 'ยักษ์หิน';
          const ot = st.inst[pr.origTarget] ? st.inst[pr.origTarget].name : 'ยักษ์';
          const mg = st.inst[pr.magicSrc] ? st.inst[pr.magicSrc].name : 'Magic';
          txt = `🛡️ ${sh}: "${ot}" ถูกเวท "${mg}" เล็ง — นอนรับเป้าแทนไหม?`;
        }
        if (pr.kind === 'preventLeaveExile') txt = `🛡️ ${st.inst[pr.k] ? st.inst[pr.k].name : '?'}: จะออกจากสนาม — เนรเทศรัททาทุยในนรก ${pr.need || 5} ใบเพื่อรอดไหม? (เทิร์นละครั้ง)`;
        if (pr.kind === 'pickSymbol') txt = `📢 ${srcN}: เลือก Symbol แล้วสุ่มมือศัตรู`;
        if (pr.kind === 'chooseDiscard' && pr.gemSumMin != null)
          txt = `💎 ${srcN}: ทิ้งมือรวม GEM ≥ ${pr.gemSumMin} (ตอนนี้ ${pr.gemGot || 0}) — แตะการ์ดในมือ`;
        else if (pr.kind === 'chooseDiscard' && pr.magicCostDiscard) {
          const filt = pr.filter || {};
          const bits = [];
          if (filt.type) bits.push(filt.type);
          if (filt.symbol) bits.push('symbol ' + filt.symbol);
          const need = pr.discardNeed || 1;
          const got = pr.discardGot || 0;
          txt = `🔥 ${srcN}: ทิ้ง${bits.length ? ' ' + bits.join(' ') : ' การ์ด'} ${need} ใบเป็นค่าเวท${need > 1 ? ` (${got}/${need})` : ''} แล้วจั่ว/ทำผล — แตะใบในมือที่กะพริบ (ตัวเวทลงนรกเอง ไม่นับเป็นใบทิ้ง)`;
        }
        else if (pr.kind === 'chooseDiscard') txt = `🔥 ${srcN}: แตะการ์ดในมือที่จะทิ้ง`;
        if (pr.kind === 'react') {
          const nOpt = (pr.options && pr.options.length) || 0;
          const tgtN = pr.target && st.inst[pr.target] ? st.inst[pr.target].name : '';
          const why = pr.label || (pr.mode === 'negateMagic' ? `ขัด Magic "${tgtN}"` : tgtN ? `ตอบโต้ "${tgtN}"` : 'ตอบโต้');
          if (pr.magicNegate || pr.mode === 'negateMagic') {
            txt = nOpt
              ? `💚 จะขัดไหม? ${why} — มี React ${nOpt} ใบ · แตะใบเขียว / กด「ไม่ใช้」 / รอ ${pr.seconds || 10} วิ`
              : `⏳ จะขัดไหม? ${why} — กด「ไม่ใช้」หรือรอ ${pr.seconds || 10} วิ`;
          } else if (pr.reactTrigger === 'enemyDeclareAttack') {
            txt = nOpt
              ? `💚 จะใช้ React ไหม? ${why} — มี ${nOpt} ใบ · แตะใบเขียว / โล่มนุษย์ / กด「ไม่ใช้」 / รอ ${pr.seconds || 10} วิ`
              : `⏳ จะตอบโต้ไหม? ${why} — โล่มนุษย์ / กด「ไม่ใช้」หรือรอ ${pr.seconds || 10} วิ`;
          } else if (pr.reactTrigger === 'avatarWouldBeDestroyed') {
            txt = nOpt
              ? `💚 ${why} — มี ${nOpt} ใบ · แตะใบเขียวเพื่อกันทำลาย หรือกด「ไม่ใช้」`
              : `⏳ ${why} — กด「ไม่ใช้」หรือรอ ${pr.seconds || 10} วิ`;
          } else if (pr.avatarHandAbility) {
            txt = nOpt
              ? `⚡ สั่งใช้จากมือ (${why}) — มี ${nOpt} ใบ · แตะใบที่กะพริบเขียว หรือกด「ไม่ใช้」`
              : `⚡ สั่งใช้จากมือ (${why}) — กด「ไม่ใช้」`;
          } else {
            txt = `💚 React พร้อมใช้ ${nOpt || (pr.src ? 1 : 0)} ใบ (${why}) — แตะใบที่กะพริบเขียวเพื่อใช้ หรือกด「ไม่ใช้」`;
          }
        }
        if (pr.kind === 'chooseMode') txt = pr.guessTypes
          ? `👁 ${srcN}: ประกาศประเภทใบบนสุดเด็คฝ่ายตรงข้าม — อวตาร / เมจิก / คอนสตรัค`
          : `🎯 ${srcN}: เลือกเทคในหน้าต่าง`;
        if (pr.kind === 'guessReveal') {
          const mark = pr.hit ? '✓ ถูก' : '✗ ผิด';
          txt = `👁 สอดแนมท็อปเด็ค: 「${pr.cardName || '?'}」(${pr.realLabel || pr.realType || '?'}) · ประกาศ ${pr.declareLabel || pr.declareType || '?'} → ${mark} — กด「ดำเนินการต่อ」${pr.hit ? 'เพื่อส่งนรก/ทำผล' : ' (ไว้ที่เดิม)'}`;
          if (pr.card) setPreview(pr.card);
        }
        if (pr.kind === 'naraiHandForm') txt = `🕉️ อวตารนารายณ์: เลือกใบจากมือที่กะพริบเพื่อสั่งใช้ (หรือข้าม)`;
        if (pr.kind === 'milledOptional') {
          const millNm = st.inst[pr.src] ? st.inst[pr.src].name : '?';
          txt = pr.countsAsModification
            ? `💀 ${millNm}: โดนธรณีสูบ — กด「ใช้ผลพิเศษ」แล้วแตะ Avatar {symbol นรก} เพื่อสวม · ข้ามได้`
            : `💀 ${millNm}: โดนธรณีสูบ — กด「ใช้ผลพิเศษ」หรือแตะใบในหน้าต่าง · ข้ามได้`;
        }
      }
      byId('promptText').textContent = txt;
      byId('btnReactYes').classList.add('hidden'); // เลิกถามใช่/ไม่ — แตะใบที่กะพริบแทน
      byId('btnReactNo').classList.toggle('hidden', !(mine && pr.kind === 'react'));
      if (mine && pr.kind === 'react') {
        byId('btnReactNo').textContent = pr.reactTrigger === 'avatarWouldBeDestroyed' ? 'ไม่ใช้ — ถูกทำลาย' : 'ไม่ใช้';
      }
      syncReactTimer(pr);
      const millRow = byId('milledOptionalRow');
      if (millRow) millRow.classList.toggle('hidden', !(mine && pr.kind === 'milledOptional'));
      // เลือกเทคหลังกด ⚡ — หน้าต่างกลางจอ กล่อง 2 ข้อ (แบบเลือกจน) ไม่ใช้ปุ่มสายฟ้าบนแถบ
      // ★ ทายประเภทตำรวจ (guessTypes) = ใช้ปุ่มบนแถบเท่านั้น ห้ามเปิด modal ทับ/ดันเมจิกโซน
      const modeRow = byId('chooseModeRow');
      if (modeRow) { modeRow.classList.add('hidden'); modeRow.innerHTML = ''; }
      const showChoiceBoxes = !!(mine && pr.kind === 'chooseMode' && pr.options && pr.options.length && !pr.guessTypes);
      if (showChoiceBoxes) {
        pb.classList.add('hidden');
        const modal = byId('choiceModal');
        const already = !!(choiceCtx && choiceCtx.k === pr.src && choiceCtx.fromPrompt
          && modal && !modal.classList.contains('hidden'));
        if (!already) openChoiceFromEffects(pr.src, pr.options, { fromPrompt: true });
      } else if (choiceCtx && choiceCtx.fromPrompt && !(pr.kind === 'chooseMode' && !pr.guessTypes && pr.src === choiceCtx.k)) {
        closeChoicePopup(true);
      }
      const peekRow = byId('peekTopRow');
      if (peekRow) {
        peekRow.classList.toggle('hidden', !(mine && pr.kind === 'peekTop'));
        const hellBtn = byId('btnPeekHell');
        if (hellBtn) hellBtn.classList.toggle('hidden', !(mine && pr.kind === 'peekTop' && pr.allowHell));
      }
      const guessRow = byId('guessRevealRow');
      if (guessRow) guessRow.classList.toggle('hidden', !(mine && pr.kind === 'guessReveal'));
      const guessTypeRow = byId('guessTypeRow');
      if (guessTypeRow) guessTypeRow.classList.toggle('hidden', !(mine && pr.kind === 'chooseMode' && pr.guessTypes));
      // ทายประเภทค้าง — ปิด modal ถ้าเผลอเปิดไว้ (กันบังสนาม)
      if (pr.kind === 'chooseMode' && pr.guessTypes) {
        const modal = byId('choiceModal');
        if (modal && !modal.classList.contains('hidden') && choiceCtx && choiceCtx.k === pr.src)
          closeChoicePopup(true);
      }
      const hosRow = byId('handOrSummonRow');
      if (hosRow) {
        hosRow.classList.toggle('hidden', !(mine && pr.kind === 'handOrSummon'));
      }
      const survRow = byId('combatSurviveRow');
      if (survRow) {
        const showSurv = !!(mine && (pr.kind === 'combatSurvive' || pr.kind === 'passengerReplace' || pr.kind === 'magicRedirect' || pr.kind === 'preventLeaveExile'));
        survRow.classList.toggle('hidden', !showSurv);
        if (showSurv) {
          const y = byId('btnSurviveYes'), n = byId('btnSurviveNo');
          if (pr.kind === 'preventLeaveExile') {
            if (y) y.textContent = `เนรเทศ ${pr.need || 5} ใบ — รอด`;
            if (n) n.textContent = 'ไม่ใช้ — ออกสนาม';
          } else if (pr.kind === 'passengerReplace') {
            if (y) y.textContent = 'ทำลายผู้โดยสารแทน';
            if (n) n.textContent = 'ไม่ใช้ — ตาย';
          } else if (pr.kind === 'magicRedirect') {
            if (y) y.textContent = 'นอนรับเป้าเวทแทน';
            if (n) n.textContent = 'ไม่ใช้';
          } else {
            if (y) y.textContent = 'ใช้! POWER−1 รอด';
            if (n) n.textContent = 'ไม่ใช้ — ตาย';
          }
        }
      }
      const symRow = byId('pickSymbolRow');
      if (symRow) {
        const showSym = !!(mine && pr.kind === 'pickSymbol');
        symRow.classList.toggle('hidden', !showSym);
        if (showSym) {
          const sel = byId('pickSymbolSelect');
          const syms = ['ผี', 'คน', 'เทพ', 'ยักษ์', 'แมลง', 'สัตว์', 'กะปอม', 'หุ่นยนต์', 'ไอดอล', 'เปรต', 'รัททาทุย'];
          if (sel && sel.options.length !== syms.length) {
            sel.innerHTML = syms.map(s => `<option value="${s}">${s}</option>`).join('');
          }
        }
      }
      byId('btnPromptSkip').classList.toggle('hidden', !(mine && pr.kind !== 'react' && pr.kind !== 'rps' && pr.kind !== 'peekTop' && pr.kind !== 'guessReveal' && pr.kind !== 'pickSymbol' && pr.kind !== 'handOrSummon' && pr.kind !== 'combatSurvive' && pr.kind !== 'passengerReplace' && pr.kind !== 'magicRedirect' && pr.kind !== 'preventLeaveExile' && (pr.optional !== false || pr.kind === 'milledOptional' || (pr.dest === 'hellMultiDeck' && pr.multiExact == null) || pr.dest === 'multiAvatar' || pr.dest === 'alienReveal' || pr.dest === 'discardSumCostSummon' || pr.dest === 'exileDistinctHell' || pr.dest === 'hellBuildConstruct' || pr.afterAlienGive)));
      if (mine && pr.dest === 'hellMultiDeck') {
        const need = pr.multiExact != null ? pr.multiExact : (pr.multiMax || 4);
        byId('promptText').textContent = pr.multiExact != null
          ? `✨ ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: คืนนรกให้ครบ ${need} ใบ (${pr.multiGot || 0}/${need}) — ไม่ครบเก็บไม่ได้`
          : `✨ ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: เลือกจากนรกกลับเด็ค (${pr.multiGot || 0}/${need}) — กดข้ามเมื่อพอใจ`;
      }
      if (mine && pr.dest === 'discardSumCostSummon') {
        byId('promptText').textContent = `✨ ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: ทิ้งรัททาทุย (${pr.multiGot || 0} ใบ · รวม Cost ${pr.costSum || 0}) — แตะเพิ่ม หรือข้ามเพื่ออัญเชิญ`;
      }
      if (mine && pr.dest === 'buildConstructFree') {
        byId('promptText').textContent = `✨ ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: แสดง Construct จากมือแล้วก่อสร้าง (ไม่จ่าย Cost)`;
      }
      if (mine && pr.dest === 'preventLeavePick') {
        byId('promptText').textContent = `🛡️ เนรเทศรัททาทุยจากนรก (${pr.got || 0}/${pr.need || 5}) — แตะการ์ดในนรก`;
      }
      if (mine && pr.dest === 'multiAvatar' && (pr.multiMin != null || pr.multiMax != null)) {
        byId('promptText').textContent = `✨ ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: อัญเชิญจากเด็ค (${pr.multiGot || 0}${pr.multiMax != null ? '/' + pr.multiMax : ''}${pr.multiMin ? ' · อย่างน้อย ' + pr.multiMin : ''})`;
      }
      if (mine && pr.dest === 'alienReveal') {
        const n = (pr.revealed || []).length;
        const sum = (pr.revealed || []).reduce((s, id) => s + (BoTEngine.effCost ? BoTEngine.effCost(st, id) : (+(st.inst[id] && st.inst[id].cost) || 0)), 0);
        byId('promptText').textContent = `👁 ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: แสดง Avatar ในมือ (${n} ใบ · รวม Cost ${sum}) — แตะเพิ่ม หรือกดข้ามเมื่อพอใจ`;
      }
      if (mine && pr.dest === 'giveToOpp') {
        byId('promptText').textContent = `🎁 ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: เลือกการ์ดในมือ 1 ใบ ให้ฝ่ายตรงข้าม`;
      }
      if (mine && pr.dest === 'giveHandNegate') {
        const tgtN = pr.target && st.inst[pr.target] ? st.inst[pr.target].name : 'จุติ';
        byId('promptText').textContent = `💰 ${st.inst[pr.src] ? st.inst[pr.src].name : 'คนรวย'}: ยื่นมือ 1 ใบเพื่อยกเลิกจุติ「${tgtN}」(นับ React · หรือข้าม)`;
      }
      if (mine && pr.dest === 'whoCoolShow') {
        byId('promptText').textContent = `😎 ใครเจ๋งกว่า: เลือกการ์ดที่มี Cost จากมือ (ซ่อนจนกว่าอีกฝ่ายเลือกครบ)`;
      }
      if (mine && pr.dest === 'saleModPick') {
        byId('promptText').textContent = `💸 ลดราคาล้นตลาด: เลือก Mod สวมฝ่ายละ 1 ใบส่งนรก`;
      }
      if (mine && pr.kind === 'chooseDestroy' && pr.afterAlienGive) {
        const peq = pr.filter && pr.filter.powerEquals;
        byId('promptText').textContent = `💥 ${st.inst[pr.src] ? st.inst[pr.src].name : ''}: ทำลาย Avatar ศัตรูที่ POWER = ${peq} (หรือข้าม)`;
      }
    } else {
      pb.classList.add('hidden');
      syncReactTimer(null);
      const millRow = byId('milledOptionalRow');
      if (millRow) millRow.classList.add('hidden');
      const gt = byId('guessTypeRow'); if (gt) gt.classList.add('hidden');
      const cm = byId('chooseModeRow'); if (cm) { cm.classList.add('hidden'); cm.innerHTML = ''; }
      if (choiceCtx && choiceCtx.fromPrompt) closeChoicePopup(true);
      const gr = byId('guessRevealRow'); if (gr) gr.classList.add('hidden');
    }

    syncRpsModal(pr);

    // โจมตีค้าง — ไม่โชว์แบนเนอร์ · ฝ่ายรับแตะ React/โล่ที่กะพริบได้ · แล้วปะทะอัตโนมัติ
    scheduleAutoResolveAtk();

    renderPileView();
    byId('phaseBar').innerHTML = ['Draw', 'Main', 'Battle', 'End'].map(p =>
      `<span class="phase-pip${st.phase === p ? ' on' : ''}" data-phase="${p}">${p}</span>`).join('');
    syncDopPeekBtn();

    // โหมดกติกา — โชว์โควตาเวทประเภทละ 1 ครั้ง/เทิร์น
    const mu = (st.magicUsed && st.magicUsed[my]) || {};
    const mc = byId('magicCounter');
    if (st.strict) {
      mc.classList.remove('hidden');
      mc.textContent = `เวทเทิร์นนี้: Normal ${mu.Normal ? '✓' : '–'} · React ${mu.React ? '✓' : '–'} · Mod ${mu.Modification ? '✓' : '–'} · Land ${mu.Land ? '✓' : '–'}`;
    } else mc.classList.add('hidden');

    // มือฝั่งตรงข้าม — solo คุมสองฝั่งเห็นหน้า, solo บอท/ออนไลน์เห็นแต่หลังการ์ด
    const oh = st.zones[opp + '.hand'] || [];
    const showOppFaces = mode === 'solo' && !soloBot;
    const oppHandEl = byId('oppHandRow');
    oppHandEl.classList.toggle('hand-faces', !!showOppFaces);
    if (showOppFaces) oppHandEl.innerHTML = `<span class="tool-result" style="margin-right:8px">มือ ${opp} · ${oh.length} ใบ</span>` + oh.map(k => cardHTML(k, 'hand', { forceUp: true, noTap: true })).join('');
    else {
      // ★ ใบที่อีกฝั่ง "เปิดให้ดู" (revealed) = โชว์หน้าจริง · ที่เหลือเป็นหลังการ์ด
      const nRev = oh.filter(k => st.inst[k].revealed).length;
      oppHandEl.innerHTML = `<span class="tool-result" style="margin-right:8px">มือ ${mode === 'solo' ? '🤖 บอท' : esc(nn(opp))} · ${oh.length} ใบ${nRev ? ` · 👁 เปิดให้ดู ${nRev}` : ''}</span>`
        + oh.map(k => st.inst[k].revealed
          ? cardHTML(k, 'hand', { forceUp: true, noTap: true })
          : `<div class="card oppback"></div>`).join('');
    }

    // โซนสนาม
    byId('oppAvatar').innerHTML = zoneHTML(opp + '.avatar', 'avatar');
    byId('oppMagic').innerHTML = zoneHTML(opp + '.magic', 'magic');
    byId('oppConstruct').innerHTML = zoneHTML(opp + '.construct', 'construct');
    // ป้ายจำนวน Avatar สูงสุด (ขยายเป็น 6 เมื่อเงื่อนไข พิภพรัททาทุย ครบ)
    if (BoTEngine.avatarCap) {
      const capMy = BoTEngine.avatarCap(st, my, 'รัททาทุย'), capOpp = BoTEngine.avatarCap(st, opp, 'รัททาทุย');
      const tagMy = byId('myAvatarTag'), tagOpp = byId('oppAvatarTag');
      if (tagMy) tagMy.textContent = `Avatar Zone` + (capMy > 4 ? ' ✨6' : '');
      if (tagOpp) tagOpp.textContent = `Avatar Zone` + (capOpp > 4 ? ' ✨6' : '');
    }
    byId('myAvatar').innerHTML = zoneHTML(my + '.avatar', 'avatar');
    byId('myMagic').innerHTML = zoneHTML(my + '.magic', 'magic');
    byId('myConstruct').innerHTML = zoneHTML(my + '.construct', 'construct');
    byId('land').innerHTML = zoneHTML('land', 'land');
    byId('oppLife').innerHTML = zoneHTML(opp + '.life', 'life');
    byId('myLife').innerHTML = zoneHTML(my + '.life', 'life');
    const crit = p => { const l = st.zones[p + '.life'] || []; return l.length && l.every(k => st.inst[k].faceUp) ? '· สาหัส!' : ''; };
    byId('oppCrit').textContent = crit(opp); byId('myCrit').textContent = crit(my);

    // กอง — ใส่ class .has เมื่อยังมีการ์ด (CSS วางรูปหลังการ์ดบนช่อง Deck)
    const nOD = (st.zones[opp + '.deck'] || []).length, nMD = (st.zones[my + '.deck'] || []).length;
    byId('oppDeckCount').textContent = nOD;
    byId('myDeckCount').textContent = nMD;
    byId('oppDeck').classList.toggle('has', nOD > 0);
    byId('myDeck').classList.toggle('has', nMD > 0);
    syncDeckTopFace('oppDeck', opp + '.deck');
    syncDeckTopFace('myDeck', my + '.deck');
    syncDeckDrawHint();
    byId('oppHellCount').textContent = (st.zones[opp + '.hell'] || []).length;
    byId('myHellCount').textContent = (st.zones[my + '.hell'] || []).length;
    byId('oppDarkCount').textContent = (st.zones[opp + '.dark'] || []).length;
    byId('myDarkCount').textContent = (st.zones[my + '.dark'] || []).length;
    setPileTop('oppHell', opp + '.hell'); setPileTop('myHell', my + '.hell');
    setPileTop('oppDark', opp + '.dark'); setPileTop('myDark', my + '.dark');

    // มือเรา
    const mh = st.zones[my + '.hand'] || [];
    // ★ ผู้ชม = ไม่มีฝั่ง "ของเรา" → แสดงมือทั้งสองฝั่งขนาดเท่ากัน (เล็กเท่ากัน) ให้ดูเป็นกลาง
    if (seat === 'S') byId('myHandRow').innerHTML = `<span class="tool-result" style="margin-right:8px">มือ ${esc(nn(my))} · ${mh.length} ใบ</span>`
      + mh.map(k => st.inst[k].revealed ? cardHTML(k, 'magic', { forceUp: true, noTap: true }) : `<div class="card oppback"></div>`).join('');
    // forceUp: มือตัวเองต้องเห็นหน้าเสมอ (กันใบที่เคยคว่ำในเด็คหลังมัลลิแกน/ฮามดัล)
    else byId('myHandRow').innerHTML = mh.map(k => cardHTML(k, 'hand', { noTap: true, forceUp: true })).join('');

    // เลือกผู้เริ่มก่อน (solo · ก่อนเริ่มเล่นจริง)
    const played = ['A.avatar', 'B.avatar', 'A.construct', 'B.construct', 'A.magic', 'B.magic'].some(z => (st.zones[z] || []).length);
    const firstpAvail = mode === 'solo' && st.turn === 1 && !played;
    byId('firstpRow').classList.toggle('hidden', !firstpAvail);
    if (firstpAvail) byId('btnFirstP').textContent = `🎲 สลับผู้เริ่มก่อน (ตอนนี้: ${st.firstPlayer || 'A'})`;
    const menuBtn = byId('btnTableMenu');
    if (menuBtn) menuBtn.classList.toggle('need', !!(firstpAvail || (canSwapSoloSide() && st.active !== my)));
    // มัลลิแกน — ถามทีละคนให้ครบก่อน · จั่วเพิ่มผู้เริ่มทำหลังแอนิเมชันเปิดศึก (beginDuel)
    const amSpec = mode === 'online' && seat === 'S';
    const done = st.mulliganDone || {};
    const fp0 = st.firstPlayer || 'A', op0 = fp0 === 'A' ? 'B' : 'A';
    mullP = null;
    const waitMullOpp = !!(mode === 'online' && !amSpec && st.turn === 1 && !st.over
      && !st.awaitBattleStart && !st.fpDrawn && done[my] && !done[opp]);
    if (st.turn === 1 && !st.over && !st.awaitBattleStart && !st.fpDrawn) {
      if (mode === 'solo') mullP = !done[fp0] ? fp0 : (!done[op0] ? op0 : null);
      else if (!amSpec && !done[my]) mullP = my;
    }
    byId('mullRow').classList.add('hidden'); // ปุ่มมัลลิแกนแยกไม่ใช้แล้ว — แถบถามอัตโนมัติแทน
    const mullHand = mullP ? (st.zones[mullP + '.hand'] || []) : mh;
    const selIds = Object.keys(selMap).filter(k => mullHand.includes(k));
    byId('mullBar').classList.toggle('hidden', !(mullP || waitMullOpp) || (soloBot && mullP === 'B'));
    if (waitMullOpp) {
      byId('mullText').textContent = '⏳ รออีกฝ่ายตอบเรื่องมือเปิด… แล้วจะเปิดศึก';
      byId('btnMullGo').classList.add('hidden');
      byId('btnMullKeep').classList.add('hidden');
    } else if (mullP && !(soloBot && mullP === 'B')) {
      byId('btnMullKeep').classList.remove('hidden');
      byId('mullText').textContent =
        `🔄 ผู้เล่น ${mullP}${mullP === fp0 ? ' (ผู้เริ่ม)' : ''}: เปลี่ยนมือเปิดไหม? แตะการ์ดที่จะเปลี่ยน (เลือกแล้ว ${selIds.length} ใบ) · จั่วเพิ่มหลังเปิดศึก`;
      byId('btnMullGo').textContent = `เปลี่ยน ${selIds.length} ใบ ▸`;
      byId('btnMullGo').classList.toggle('hidden', !selIds.length);
    }
    // ถ้า state ค้างรอเปิดศึก (รีเฟรช/พลาด fx) — เล่นแอนิเมชันแล้ว beginDuel
    if (st.awaitBattleStart && !battleIntroPlaying) playBattleIntroThenStart(st.firstPlayer || 'A');

    // log ระบบ + แชท แยกช่อง (แชท = ข้อความขึ้นต้น "แชท:")
    const isChat = l => /^แชท:/.test(l.t);
    const line = (l, txt) => `<div class="log-line ${tagCls(l.p)}"><span class="log-tag ${tagCls(l.p)}">${l.p === 'S' ? 'ระบบ' : l.p}</span> <span>${esc(txt)}</span></div>`;
    byId('logBody').innerHTML = st.log.filter(l => !isChat(l)).map(l => line(l, l.t)).join('');
    byId('logBody').scrollTop = byId('logBody').scrollHeight;
    const chatEl = byId('chatBody');
    if (chatEl) {
      const chats = st.log.filter(isChat);
      chatEl.innerHTML = chats.length ? chats.map(l => line(l, l.t.replace(/^แชท:\s*/, ''))).join('') : '<div class="chat-empty">ยังไม่มีข้อความ</div>';
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    // ⚔️/⚡ กำลังเลือกเป้า — ไฮไลต์ต้นทาง + เป้าที่เลือกได้
    if (announceSrc) {
      const sEl0 = document.querySelector(`[data-cid="${announceSrc}"]`);
      if (sEl0) sEl0.classList.add('ann-src');
      const mySide = BoTEngine.ownerOf(st, announceSrc);
      if (announceKind === 'attack') { // เป้า = Avatar / Construct ฝั่งตรงข้าม (LIFE ลากแยก / กติกาเตะไข่)
        ['A', 'B'].filter(p => p !== mySide).forEach(p => {
          (st.zones[p + '.avatar'] || []).forEach(t => {
            const e2 = document.querySelector(`[data-cid="${t}"]`); if (e2) e2.classList.add('atk-pick');
          });
          (st.zones[p + '.construct'] || []).forEach(t => {
            const e2 = document.querySelector(`[data-cid="${t}"]`); if (e2) e2.classList.add('atk-pick');
          });
        });
      } else if (announceKind === 'unity') { // เป้า = Avatar ฝั่งเรา (ใบอื่น)
        (st.zones[mySide + '.avatar'] || []).filter(t => t !== announceSrc).forEach(t => {
          const e2 = document.querySelector(`[data-cid="${t}"]`); if (e2) e2.classList.add('pick-ok');
        });
      } else if (announceKind === 'backstab') { // เป้า = Avatar ที่สั่งโจมตี (ฝั่งเราเป็นหลัก)
        (st.zones[mySide + '.avatar'] || []).filter(t => t !== announceSrc).forEach(t => {
          const e2 = document.querySelector(`[data-cid="${t}"]`); if (e2) e2.classList.add('pick-ok');
        });
      } else if (announceKind === 'attach') { // เป้า = Avatar บนสนาม ทั้งสองฝั่ง
        ['A', 'B'].forEach(p => (st.zones[p + '.avatar'] || []).forEach(t => {
          const e2 = document.querySelector(`[data-cid="${t}"]`); if (e2) e2.classList.add('pick-ok');
        }));
      } else if (announceKind === 'pair') { // เป้า = คู่หูที่ระบุบนการ์ดเท่านั้น
        const srcC = st.inst[announceSrc];
        (st.zones[mySide + '.avatar'] || []).filter(t => t !== announceSrc).forEach(t => {
          if (srcC && canBuddyPairWith(srcC, st.inst[t])) {
            const e2 = document.querySelector(`[data-cid="${t}"]`); if (e2) e2.classList.add('pick-ok');
          }
        });
      }
    }
    // ⚡ เรืองแสงการ์ดที่เพิ่งประกาศใช้/ถูกชี้เป้า (render ล้าง DOM ทุกครั้ง — ทาใหม่ถ้ายังอยู่ในช่วงโชว์)
    if (annGlow && Date.now() < annGlow.until) {
      const sEl = document.querySelector(`[data-cid="${annGlow.src}"]`); if (sEl) sEl.classList.add('ann-src');
      if (annGlow.tgt) { const tEl = document.querySelector(`[data-cid="${annGlow.tgt}"]`); if (tEl) tEl.classList.add('ann-tgt'); }
    }

    layoutMyHand();
    layoutMagicZones();
    drawLinks();
    renderPreview();
    if (typeof mbSync === 'function') mbSync();
    syncOneSide();  // ⬍ ความสูงเสื่ออาจเปลี่ยนถ้าแถวมือสูงขึ้น/ลง
    syncFieldCardScale(); // 3D: ชดเชยสเกลการ์ดให้สูงบนจอเท่ากัน
    streamPush();   // 📺 ส่งสนามให้บานสนาม (ถ้าเปิดอยู่)
    requestAnimationFrame(syncFloatBarsPos);
  }

  /* เลิกชดเชยสเกลรายใบ — ใช้สัดส่วน 8 ส่วนทั้งกระดานแทน */
  function syncFieldCardScale() {
    syncBoardParts();
  }

  /** มือ+สนาม = 8 ส่วน
   *  มือบน 0.5 · สนามฝั่งตรงข้าม 3 · สนามเรา 3 · มือล่าง 1.5
   *  ฝั่งเดียว: สนาม 3 + มือล่าง 1.5 (=4.5) */
  function syncBoardParts() {
    const bd = byId('board');
    const table = byId('table');
    if (!bd || !table || table.classList.contains('hidden')) return;
    const one = table.classList.contains('one-side') || document.body.classList.contains('one-board');
    const h = bd.clientHeight;
    if (h < 80) return;
    const parts = one ? 4.5 : 8;
    const u = h / parts;
    const rowOpp = u * 0.5;
    const rowMy = u * 1.5;
    bd.style.setProperty('--u', u.toFixed(2) + 'px');
    bd.style.setProperty('--hand-row-opp', rowOpp.toFixed(2) + 'px');
    bd.style.setProperty('--hand-row-my', rowMy.toFixed(2) + 'px');
    /* ปุ่มจบเทิร์นลอยอยู่นอก #board — ต้องได้ความสูงมือด้วย */
    table.style.setProperty('--hand-row-my', rowMy.toFixed(2) + 'px');
    const myCardH = rowMy * 0.94;
    const oppCardH = rowOpp * 0.92;
    const fieldH = u * 0.78;
    bd.style.setProperty('--hand-card-h', myCardH.toFixed(2) + 'px');
    bd.style.setProperty('--hand-card-w', (myCardH * 512 / 716).toFixed(2) + 'px');
    bd.style.setProperty('--opp-hand-card-h', oppCardH.toFixed(2) + 'px');
    bd.style.setProperty('--opp-hand-card-w', (oppCardH * 512 / 716).toFixed(2) + 'px');
    bd.style.setProperty('--field-card-h', fieldH.toFixed(2) + 'px');
    bd.style.setProperty('--field-card-w', (fieldH * 512 / 716).toFixed(2) + 'px');
    const tilt = byId('fieldTilt');
    const matW = tilt ? tilt.clientWidth : 0;
    if (matW > 40) {
      const pileW = Math.min(matW * (1.5 / 8) * 0.92, fieldH * (512 / 716) * 1.35, u * 0.95);
      bd.style.setProperty('--pile-card-w', pileW.toFixed(2) + 'px');
      bd.style.setProperty('--pile-card-h', (pileW * 716 / 512).toFixed(2) + 'px');
    }
    const oppH = byId('oppHandRow');
    const myH = byId('myHandRow');
    if (oppH) {
      if (one) {
        oppH.style.height = '0px';
        oppH.style.minHeight = '0';
        oppH.style.padding = '0';
        oppH.style.overflow = 'hidden';
      } else {
        oppH.style.height = rowOpp.toFixed(2) + 'px';
        oppH.style.minHeight = '';
        oppH.style.padding = '';
        oppH.style.overflow = '';
      }
    }
    if (myH) {
      myH.style.height = rowMy.toFixed(2) + 'px';
      myH.style.minHeight = '';
    }
    syncEndTurnFabPos();
    syncFloatBarsPos();
  }

  /* มือถือ: ใช้เต็มความกว้างแถวมือ · ใบน้อยจัดกลุ่มตรงกลาง · ใบเยอะเหลื่อมเต็มแถว */
  function layoutMyHand() {
    const row = byId('myHandRow');
    if (!row) return;
    const cards = [...row.querySelectorAll(':scope > .card.hand')];
    const clearInline = () => {
      cards.forEach(el => {
        el.style.position = el.style.left = el.style.bottom = el.style.zIndex = '';
        el.style.width = el.style.height = el.style.margin = el.style.marginLeft = el.style.marginRight = '';
      });
      row.classList.remove('hand-spread');
      row.style.overflow = row.style.overflowX = row.style.overflowY = '';
    };
    if (seat === 'S' || !cards.length) { clearInline(); return; }
    const narrow = window.matchMedia('(max-width:1100px), (max-width:920px)').matches
      || window.matchMedia('(hover:none) and (max-width:1200px)').matches;
    if (!narrow) { clearInline(); return; }

    row.classList.add('hand-spread');
    const pad = 2;
    const W = Math.max(0, row.clientWidth - pad * 2);
    if (W < 48) {
      requestAnimationFrame(() => { if (st) layoutMyHand(); });
      return;
    }
    const n = cards.length;
    const portrait = window.matchMedia('(orientation:portrait)').matches;
    let cw = portrait ? 86 : (window.innerHeight <= 520 ? 60 : 64);
    // ขยายตามความสูงแถวได้เต็มที่ — ไม่ตัดด้วยเพดานแคบ ๆ
    const maxByRow = Math.max(cw, Math.floor((Math.max(row.clientHeight, 96) - 14) * 512 / 716));
    if (n === 1) cw = Math.min(W, Math.max(cw, maxByRow));
    else {
      const gapTry = 8;
      const fit = Math.floor((W - gapTry * (n - 1)) / n);
      if (fit > cw) cw = Math.min(maxByRow, fit);
    }
    let ch = Math.round(cw * (716 / 512));
    const gapIdeal = n <= 1 ? 0 : 8;
    let start = pad;
    let step = 0;
    if (n === 1) {
      start = pad + (W - cw) / 2;
    } else {
      const natural = n * cw + (n - 1) * gapIdeal;
      if (natural <= W) {
        // ใบน้อย: กองตรงกลาง ไม่ดึงไปชิดขอบ
        start = pad + (W - natural) / 2;
        step = cw + gapIdeal;
      } else {
        // ใบเยอะ: เหลื่อมให้พอดีความกว้างแถว
        step = (W - cw) / (n - 1);
      }
    }
    /* visible ทั้งสองแกน — ถ้าแกน X เป็น hidden/auto เบราว์เซอร์จะบังคับ Y เป็น auto
       ทำให้ใบที่ยกขึ้นโดนตัดแล้วดูเหมือนเสื่อบังมือ */
    row.style.overflow = 'visible';
    row.style.overflowX = 'visible';
    row.style.overflowY = 'visible';
    cards.forEach((el, i) => {
      const sel = el.classList.contains('sel');
      el.style.position = 'absolute';
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      el.style.left = (start + i * step) + 'px';
      el.style.bottom = '6px';
      el.style.margin = '0';
      el.style.zIndex = sel ? String(200 + i) : String(i + 1);
    });
  }

  /* Magic Zone ใบเยอะ: เหลื่อมกันให้อยู่ในช่อง · ชี้เมาส์ยกขึ้นหน้า · เลือกมะม่วงใช้หน้าต่าง overlay */
  function layoutMagicZones() {
    ['myMagic', 'oppMagic'].forEach(layoutMagicRow);
  }
  function layoutMagicRow(id) {
    const row = byId(id);
    if (!row) return;
    const cards = [...row.querySelectorAll(':scope > .card')];
    const clear = () => {
      cards.forEach(el => {
        el.style.marginLeft = el.style.position = el.style.left = el.style.zIndex = '';
      });
      row.classList.remove('mz-crowded');
    };
    if (cards.length < 2) { clear(); return; }
    const W = row.clientWidth;
    if (W < 24) {
      requestAnimationFrame(() => { if (st) layoutMagicRow(id); });
      return;
    }
    const cw = cards[0].offsetWidth || 56;
    const gap = 6;
    const n = cards.length;
    const natural = n * cw + (n - 1) * gap;
    if (natural <= W + 1) { clear(); return; }
    row.classList.add('mz-crowded');
    const overlap = (natural - W) / (n - 1);
    cards.forEach((el, i) => {
      el.style.marginLeft = i === 0 ? '0px' : (-overlap) + 'px';
      el.style.zIndex = String(i + 1);
    });
  }

  /* 🔗 ลากเส้นเชื่อม "การ์ดที่สวมใส่ (Magic Zone) → Avatar ที่สวมให้" ทับบนกระดาน
     Avatar 1 ตัวสวมได้ไม่จำกัด — หลายเส้นจะโค้งกระจายออกจากกัน ไม่ทับกัน */
  function drawLinks() {
    const svg = byId('linkLayer'); if (!svg || !st) return;
    const board = byId('board').getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${Math.round(board.width)} ${Math.round(board.height)}`);
    const byHost = {};
    Object.values(st.inst).forEach(c => {
      if (!c.attachedTo || !st.inst[c.attachedTo]) return;
      (byHost[c.attachedTo] = byHost[c.attachedTo] || []).push(c.id);
    });
    const seg = [];
    Object.keys(byHost).forEach(host => {
      const list = byHost[host];
      const b = document.querySelector(`[data-cid="${host}"]`); if (!b) return;
      const rb = b.getBoundingClientRect();
      const x2 = rb.left + rb.width / 2 - board.left, y2 = rb.top + rb.height / 2 - board.top;
      list.forEach((id, i) => {
        const a = document.querySelector(`[data-cid="${id}"]`); if (!a) return;
        const ra = a.getBoundingClientRect();
        const x1 = ra.left + ra.width / 2 - board.left, y1 = ra.top + ra.height / 2 - board.top;
        // โค้งกระจาย: เลื่อนจุดควบคุมตั้งฉากกับเส้น ตามลำดับใบที่สวม
        const spread = (i - (list.length - 1) / 2) * 34;
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const cx = (x1 + x2) / 2 - dy / len * spread, cy = (y1 + y2) / 2 + dx / len * spread;
        seg.push(`<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" class="lk-line"/>`
          + `<circle cx="${x1}" cy="${y1}" r="3.5" class="lk-dot"/>`);
      });
      seg.push(`<circle cx="${x2}" cy="${y2}" r="5.5" class="lk-dot host"/>`);
    });
    svg.innerHTML = seg.join('');
    svg.classList.toggle('hidden', !seg.length);
  }

  function setPileTop(id, zone) {
    const el = byId(id);
    el.querySelectorAll('.pile-top').forEach(n => n.remove());
    const a = st.zones[zone] || [];
    if (a.length) el.insertAdjacentHTML('afterbegin', topHTML(zone));
  }
  /* ฮามดัล / สอดแนมทายประเภท: โชว์หน้าใบบนสุดเด็คแทนหลังการ์ด
     ใช้เฉพาะธงหงายพิเศษ — ไม่ใช้ faceUp ทั่วไป (ใบในเด็คเคย faceUp ค้างแล้วโชว์ COST ผิด) */
  function syncDeckTopFace(elId, zone) {
    const el = byId(elId);
    if (!el) return;
    el.querySelectorAll('.pile-top').forEach(n => n.remove());
    const a = st.zones[zone] || [];
    const top = a.length ? a[a.length - 1] : null;
    const c = top && st.inst[top];
    const show = !!(c && (c._guessReveal || c._heimdallReveal));
    el.classList.toggle('revealed', show);
    el.classList.toggle('guess-reveal', !!(c && c._guessReveal));
    if (show) el.insertAdjacentHTML('afterbegin', topHTML(zone));
  }

  function renderPreview() {
    const body = byId('pvBody');
    const c = previewId && st && st.inst[previewId];
    if (!c) { body.innerHTML = `<div class="pv-empty">ชี้เมาส์หรือแตะการ์ดใบไหนก็ได้<br>เพื่อดูภาพเต็ม + ความสามารถ</div>`; return; }
    const pill = col => col
      ? `<span class="cpill">${GEM_EMOJI[col] || ''} ${esc(col)}</span>`
      : `<span class="cpill none">ไร้สี</span>`;
    const rows = [];
    if (c.cost !== '' && c.cost != null) {
      const onFieldCost = previewId && st && ['.avatar', '.construct'].some(z => (BoTEngine.zoneOf(st, previewId) || '').endsWith(z));
      const eff = onFieldCost && BoTEngine.effCost ? BoTEngine.effCost(st, previewId) : +c.cost;
      const costDisp = eff !== +c.cost ? `${c.cost} → ${eff}` : String(c.cost);
      rows.push(`<div class="pv-row"><span class="pv-lbl">คอส (จ่ายสี)</span><b>${costDisp}</b> ${pill(costColorOf(c))}</div>`);
    }
    if (c.gem !== '' && c.gem != null) {
      const h = payGemHint(c);
      if (h) {
        rows.push(`<div class="pv-row"><span class="pv-lbl">ให้เจม (สี)</span><b>${h.printed}</b> ${pill(gemColorOf(c))}</div>`);
        rows.push(`<div class="pv-row"><span class="pv-lbl">เป็น Cost 「${esc(h.name)}」</span><b>GEM ${h.v}</b> ${pill(h.col)}</div>`);
      } else {
        rows.push(`<div class="pv-row"><span class="pv-lbl">ให้เจม (สี)</span><b>${+c.gem || 0}</b> ${pill(gemColorOf(c))}</div>`);
      }
    }
    if (c.power !== '' && c.power != null) {
      const onField = previewId && st && ['.avatar', '.construct'].some(z => (BoTEngine.zoneOf(st, previewId) || '').endsWith(z));
      if (onField && c.faceUp && BoTEngine.powerBreakdown) {
        const bd = BoTEngine.powerBreakdown(st, previewId);
        const delta = bd.total - bd.base;
        const head = delta === 0
          ? `<b>P${bd.total}</b>`
          : `<b class="${delta > 0 ? 'pv-up' : 'pv-down'}">P${bd.total}</b> <span class="pv-dim">(ตั้งต้น ${bd.base})</span>`;
        rows.push(`<div class="pv-row"><span class="pv-lbl">POWER ล่าสุด</span>${head}</div>`);
        if (bd.lines && bd.lines.length > 1) {
          rows.push(`<div class="pv-break">${bd.lines.map(l => {
            const sign = l.amt > 0 ? '+' : '';
            const cls = l.amt > 0 ? 'pv-up' : l.amt < 0 ? 'pv-down' : '';
            return `<div class="pv-break-line"><span class="pv-break-amt ${cls}">${sign}${l.amt}</span><span>${esc(l.label)}</span></div>`;
          }).join('')}</div>`);
        }
      } else {
        rows.push(`<div class="pv-row"><span class="pv-lbl">POWER</span><b>${c.power}</b></div>`);
      }
    }
    body.innerHTML = `<div class="pv-img" style="background-image:url('${esc(c.img)}')"></div>
      <div class="pv-name">${esc(c.name)}</div>
      <div class="pv-type">${esc(c.type)}${c.subtype ? ' · ' + esc(c.subtype) : ''}</div>
      <div class="pv-stats">${rows.join('')}</div>
      <div class="pv-effect">${esc(c.effect)}</div>`;
  }

  function canPeek(k) {
    const c = st.inst[k]; if (!c) return false;
    const z = BoTEngine.zoneOf(st, k) || '';
    if (z.endsWith('.life') && !c.faceUp) return false;
    if (c.faceUp) return true;
    if (mode === 'solo' && !soloBot) return true;
    if (c.revealed) return true;
    if (mode === 'solo' && soloBot && (z[0] === my || z === 'land')) return true;
    if (seat !== 'S' && z[0] === seat) return true;
    return false;
  }
  function setPreview(k) { if (k && canPeek(k)) { if (previewId !== k) { previewId = k; renderPreview(); } } }
  function isTouchUI() {
    return window.matchMedia('(hover:none), (max-width:920px)').matches;
  }
  /* มือถือ: เปิดแผ่นอ่านการ์ดเต็ม (ภาพ + ความสามารถ) */
  function openCardFull(k) {
    if (!k || !canPeek(k)) { toast('ดูการ์ดใบนี้ไม่ได้', 2000); return false; }
    setPreview(k);
    const lg = byId('logPane'), pv = byId('previewPane');
    if (lg) lg.classList.add('hidden');
    if (pv) pv.classList.add('open');
    if (typeof mbSync === 'function') mbSync();
    try { navigator.vibrate && navigator.vibrate(25); } catch (_) { }
    return true;
  }
  // การ์ดใบนี้เราสั่งได้ไหม (solo = คุมทั้งสองฝั่ง · ออนไลน์ = เฉพาะฝั่งตัวเอง + Land กลาง)
  function canControl(k) {
    if (!st || !st.inst[k]) return false;
    if (mode === 'solo') {
      if (!soloBot) return true;
      const z = BoTEngine.zoneOf(st, k) || '';
      return z === 'land' || z[0] === my;
    }
    if (seat === 'S') return false;
    const z = BoTEngine.zoneOf(st, k) || '';
    return z === 'land' || z[0] === seat;
  }
  /* มีสั่งใช้ที่ตรงโซนตอนนี้ไหม (สนาม / มือ / นรก / Land) */
  function cardHasActivatedAbility(k) {
    const c = st && st.inst[k]; if (!c) return false;
    const kz = BoTEngine.zoneOf(st, k) || '';
    const abs = (BoTEngine.effectOf && ((BoTEngine.effectOf(c.code, c.name) || {}).abilities || [])) || [];
    const onField = ['.avatar', '.magic', '.construct'].some(z => kz.endsWith(z)) || kz === 'land';
    // Normal/React one-shot บน Magic Zone = ใช้ตอน playMagic แล้ว ไม่โชว์ปุ่มสั่งใช้ซ้ำ
    if (c.type === 'Magic' && kz.endsWith('.magic')) {
      const sub = c.subtype || 'Normal';
      if ((sub === 'Normal' || sub === 'React') && !(BoTEngine.effectOf(c.code, c.name) || {}).stayOnMagic
        && !(BoTEngine.effectOf(c.code, c.name) || {}).remainOnMagic)
        return false;
    }
    return abs.some(ab => {
      const on = ab.trigger && ab.trigger.on;
      if (on === 'activated' && onField) return true;
      if (on === 'activatedFromHand' && kz.endsWith('.hand')) return true;
      if ((on === 'activatedFromHell' || ab.fromHell) && kz.endsWith('.hell')) return true;
      return false;
    });
  }
  function tryActivateAbility(k) {
    if (!st || !st.inst[k] || !canControl(k)) return false;
    if (!cardHasActivatedAbility(k)) return false;
    const own = BoTEngine.ownerOf(st, k);
    sendAction({ type: 'activateAbility', k, by: mode === 'solo' ? (own === 'S' ? my : own) : undefined });
    return true;
  }
  function cardHasUnityKw(k) {
    if (!st || !st.inst[k]) return false;
    if (BoTEngine.hasKw) return !!BoTEngine.hasKw(st, k, 'สามัคคี');
    const c = st.inst[k];
    return BoTEngine.keywordsOf(c.code).includes('สามัคคี')
      || (c.grantedKeywords || []).some(g => g.kw === 'สามัคคี');
  }
  /* สามัคคีใช้ได้: ตื่น + มี keyword · มอดสวม: อยู่ใน Magic Zone */
  function canUseUnity(k) {
    if (!canControl(k)) return false;
    const c = st.inst[k];
    if (!c || c.tapped || !c.faceUp || c.cannotChangeStateUntilEOT) return false;
    return (BoTEngine.zoneOf(st, k) || '').endsWith('.avatar') && cardHasUnityKw(k);
  }
  function canAttachFromMagic(k) {
    if (!canControl(k)) return false;
    const c = st.inst[k];
    if (!c || c.subtype !== 'Modification') return false;
    return (BoTEngine.zoneOf(st, k) || '').endsWith('.magic');
  }

  /* ── เมนูคำสั่งการ์ด (คลิกเดี่ยวบนสนาม / ใน pile view) ── */
  function showMenu(title, entries, x, y) {
    const menu = byId('ctxMenu');
    // entry ที่มี .row = แถวปุ่มไอคอน (ยุบหลายคำสั่งให้เหลือแถวเดียว)
    menu.innerHTML = `<div class="ctx-title">${esc(title)}</div>` +
      entries.map((it, i) => it.row
        ? `<div class="ctx-row">` + it.row.map((r, j) =>
          `<button class="ctx-ico" data-i="${i}" data-j="${j}" title="${esc(r.title || '')}">${esc(r.icon)}</button>`).join('') + `</div>`
        : `<button class="ctx-item" data-i="${i}">${esc(it.label)}</button>`).join('');
    menu._entries = entries;
    menu.classList.remove('hidden');
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
  }
  function openMenu(k, x, y) {
    const c = st.inst[k]; if (!c) return;
    const owner0 = BoTEngine.ownerOf(st, k);
    const own = owner0 === 'S' ? my : owner0;
    const onField = ['.avatar', '.magic', '.construct'].some(z => (BoTEngine.zoneOf(st, k) || '').endsWith(z));
    const kzMenu = BoTEngine.zoneOf(st, k) || '';
    const hasActivated = !!(BoTEngine.effectOf && ((BoTEngine.effectOf(c.code, c.name) || {}).abilities || [])
      .concat(c.granted || []).some(ab => {
        const on = ab.trigger && ab.trigger.on;
        if (on === 'activated' && (onField || kzMenu === 'land')) return true;
        if (on === 'activatedFromHand' && kzMenu.endsWith('.hand')) return true;
        if ((on === 'activatedFromHell' || ab.fromHell) && kzMenu.endsWith('.hell')) return true;
        return false;
      }));
    // เหลือเฉพาะสั่งใช้ + ความสามารถของการ์ด (สามัคคี / แทงหลัง / โล่มนุษย์ / สวมใส่ / คู่หู) — ไม่มีแมนนวล
    const entries = [
      ...(hasActivated
        ? [{ label: '⚡ สั่งใช้ความสามารถ', act: { type: 'activateAbility', k, by: mode === 'solo' ? own : undefined } }]
        : []),
      ...(canUseUnity(k)
        ? [{ label: '🤝 สามัคคี — นอนแล้วยก POWER ให้… (หรือลากทับผู้รับ)', fn: () => startAnnounce(k, 'unity') }] : []),
      ...((BoTEngine.zoneOf(st, k) || '').endsWith('.avatar') && !c.tapped && c.faceUp && !c.cannotChangeStateUntilEOT && BoTEngine.hasKw && BoTEngine.hasKw(st, k, 'แทงหลัง')
        ? [{ label: '🗡️ แทงหลัง — นอนแล้วเสริมผู้โจมตี…', fn: () => startAnnounce(k, 'backstab') }] : []),
      ...((() => {
        const pnd = st.pending;
        const kz0 = BoTEngine.zoneOf(st, k) || '';
        if (!pnd || !kz0.endsWith('.avatar') || c.tapped || !c.faceUp || c.cannotChangeStateUntilEOT) return [];
        const side = BoTEngine.ownerOf(st, k);
        if (side !== pnd.target) return [];
        const hasShield = BoTEngine.hasKw
          ? BoTEngine.hasKw(st, k, 'โล่มนุษย์')
          : (BoTEngine.keywordsOf(c.code).includes('โล่มนุษย์')
            || Object.values(st.inst).some(x => x.attachedTo === k && BoTEngine.keywordsOf(x.code).includes('โล่มนุษย์')));
        return hasShield ? [{ label: '🛡️ โล่มนุษย์ — รับการโจมตีแทน', act: { type: 'humanShield', k, by: side } }] : [];
      })()),
      ...(canAttachFromMagic(k)
        ? [{ label: '🔗 สวมใส่ → เลือก Avatar (หรือลากทับ)', fn: () => startAnnounce(k, 'attach') }] : []),
      ...((onField && (BoTEngine.zoneOf(st, k) || '').endsWith('.avatar') && hasBuddyAbility(c))
        ? [c.pairWith && st.inst[c.pairWith]
          ? { label: `💔 เลิกคู่กับ "${st.inst[c.pairWith].name}"`, act: { type: 'pair', k, by: mode === 'solo' ? own : undefined } }
          : { label: `🤝 จับคู่หู${buddyPartnerName(c.effect) ? ' → ' + buddyPartnerName(c.effect) : ''}…`, fn: () => startAnnounce(k, 'pair') }]
        : []),
      ...((() => {
        const e = BoTEngine.effectOf && BoTEngine.effectOf(c.code, c.name);
        const abs = (e && e.abilities) || [];
        const modes = abs.filter(ab => ab.trigger && ab.trigger.on === 'chooseMode' && ab.options && ab.options.length);
        return (modes.length && !hasActivated)
          ? [{ label: '🎯 เลือกปฏิบัติ…', fn: () => openChoiceFromEffects(k, modes[0].options) }]
          : [];
      })()),
    ];
    {
      const eMenu = BoTEngine.effectOf && BoTEngine.effectOf(c.code, c.name);
      const blockHandSpecial = kzMenu.endsWith('.hand') && eMenu && (eMenu.noPaidSummon || eMenu.noHandSummon);
      const giftFree = kzMenu.endsWith('.hand') && BoTEngine.freeSummonOk && BoTEngine.freeSummonOk(st, k);
      if (giftFree && !blockHandSpecial && (c.type === 'Avatar' || c.type === 'Construct') &&
        (mode === 'solo' || (seat !== 'S' && kzMenu[0] === seat))) {
        const destZone = kzMenu[0] + (c.type === 'Construct' ? '.construct' : '.avatar');
        entries.unshift({ label: '✨ อัญเชิญฟรี (เงื่อนไขการ์ด) → สนาม', act: { type: 'summon', k, to: destZone, free: true, by: kzMenu[0] } });
      }
    }
    if (!entries.length) {
      toast('ใบนี้ไม่มีคำสั่งใช้ — ลากเพื่ออัญเชิญ / โจมตี / ย้ายโซน', 2800);
      return;
    }
    showMenu(canPeek(k) ? c.name : 'การ์ดคว่ำ', entries, x, y);
  }
  // ⚡/⚔️ โหมดชี้เป้า: เลือกการ์ดต้นทางแล้ว → แตะเป้าหมาย (Esc/แตะพื้นว่าง = ยกเลิก · แตะซ้ำใบเดิม = ไม่ชี้เป้า)
  const PICK_HINT = {
    attack: '⚔️ แตะเป้าหมายโจมตี (Avatar หรือ Construct) · ตัวโจมตีจะนอนให้อัตโนมัติ · Esc = ยกเลิก',
    unity: '🤝 แตะหรือลากทับ Avatar ฝั่งเรา "ตัวที่จะรับพลัง" · ตัวที่กดจะนอนแล้วยก POWER ไปให้ · Esc = ยกเลิก',
    backstab: '🗡️ แตะ Avatar ที่สั่งโจมตี · ตัวที่กดจะนอนแล้วเสริม POWER(+1) จนจบการต่อสู้ · สีต่าง = ทำลายผู้โจมตี · Esc = ยกเลิก',
    pair: '🤝 แตะคู่หูที่ระบุบนการ์ด (เฉพาะใบที่มีความสามารถคู่หู/Link) · Esc = ยกเลิก',
    attach: '🔗 แตะหรือลากทับ Avatar ที่จะสวมใส่ให้ (ได้ทั้งสองฝั่ง) · Esc = ยกเลิก',
    use: '⚡ แตะการ์ด "เป้าหมาย" ที่จะใช้ใส่ · แตะใบเดิมซ้ำ = ประกาศเฉยๆ · Esc = ยกเลิก',
  };
  function startAnnounce(k, kind) {
    const kind0 = kind || 'use';
    if (kind0 === 'attack') {
      const c0 = st.inst[k];
      if (!c0 || c0.tapped) {
        toast(`😴 "${(c0 && c0.name) || 'การ์ด'}" นอนอยู่ — ประกาศโจมตีไม่ได้`, 3200);
        return;
      }
      if (c0.faceUp === false) {
        toast(`คว่ำอยู่ — โจมตีไม่ได้`, 2800);
        return;
      }
    }
    announceSrc = k; announceKind = kind0; closeMenu();
    toast(PICK_HINT[announceKind] || PICK_HINT.use, 4200);
    render(); // ไฮไลต์เป้าที่เลือกได้
  }
  function sendAnnounce(tgt) {
    const srcSide = BoTEngine.ownerOf(st, announceSrc);
    const by = mode === 'solo' ? (srcSide === 'S' ? my : srcSide) : undefined;
    if (announceKind === 'unity') {
      if (!tgt) { toast('ต้องเลือกตัวที่จะรับพลัง'); return; }
      if (BoTEngine.ownerOf(st, tgt) !== srcSide) { toast('สามัคคีให้ได้เฉพาะ Avatar ฝั่งตัวเอง'); return; }
      sendAction({ type: 'unity', k: announceSrc, to: tgt, by });
    } else if (announceKind === 'backstab') {
      if (!tgt) { toast('ต้องเลือก Avatar ที่สั่งโจมตี'); return; }
      sendAction({ type: 'backstab', k: announceSrc, to: tgt, by });
    } else if (announceKind === 'pair') {
      if (!tgt) { toast('ต้องเลือกการ์ดใบที่สอง'); return; }
      sendAction({ type: 'pair', k: announceSrc, to: tgt, by });
    } else if (announceKind === 'attach') {
      if (!tgt) { toast('ต้องเลือก Avatar ที่จะสวมใส่ให้'); return; }
      sendAction({ type: 'attach', k: announceSrc, to: tgt, by });
    } else if (announceKind === 'attack') {
      if (!tgt) { toast('ต้องเลือกเป้าโจมตี'); return; }
      const atkC = st.inst[announceSrc];
      if (!atkC || atkC.tapped) {
        toast(`😴 "${(atkC && atkC.name) || 'การ์ด'}" นอนอยู่ — ประกาศโจมตีไม่ได้`, 3200);
        announceSrc = null; announceKind = 'use';
        return;
      }
      const tz = BoTEngine.zoneOf(st, tgt) || '';
      if (tz.endsWith('.life')) sendAction({ type: 'declareAttack', atk: announceSrc, life: tgt, by });
      else sendAction({ type: 'declareAttack', atk: announceSrc, def: tgt, by });
    } else {
      sendAction({ type: 'announce', src: announceSrc, tgt: tgt || undefined, kind: announceKind, by });
    }
    announceSrc = null; announceKind = 'use';
  }
  /* กองเด็คบนเสื่อ = "แตะเพื่อจั่ว" อย่างเดียว — คำสั่งเด็คทั้งหมด (จั่ว/สับ/ค้นหา/สอดแนม/ท็อป/สูบ)
     อยู่ที่เมนูโต๊ะ ☰ → แผง 🃏 เด็ค */
  function closeMenu() { byId('ctxMenu').classList.add('hidden'); }

  /* ── เลือกปฏิบัติ (เลือก 1 ใน N ข้อ) ── */
  let choiceCtx = null; // { k, opts, sel }
  let choiceOpenedAt = 0;
  const CHOICE_GHOST_MS = 500;
  function choiceGhostClick() {
    return Date.now() - choiceOpenedAt < CHOICE_GHOST_MS;
  }
  function showChoiceModal() {
    choiceOpenedAt = Date.now();
    byId('choiceModal').classList.remove('hidden');
  }
  function parseChoiceOptions(effect) {
    const lines = (effect || '').replace(/\r/g, '').split('\n');
    const opts = []; let cur = null;
    for (const ln of lines) {
      const m = ln.match(/^\s*([1-9])\)\s*(.*)/);
      if (m) { if (cur != null) opts.push(cur); cur = m[2].trim(); }
      else if (cur != null) {
        if (/^\s*(ถ้า|#|เมื่อ|คำสั่งเสีย|หาก)/.test(ln)) { opts.push(cur); cur = null; }
        else cur += ' ' + ln.trim();
      }
    }
    if (cur != null) opts.push(cur);
    return opts.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  function openChoicePopup(k) {
    closeMenu();
    const c = st.inst[k]; if (!c) return;
    const opts = parseChoiceOptions(c.effect);
    if (!opts.length) { toast('การ์ดนี้ไม่พบตัวเลือก เลือกปฏิบัติ ที่อ่านได้'); return; }
    choiceCtx = { k, opts, sel: 0 };
    byId('choiceCardName').textContent = c.name;
    renderChoiceOpts();
    showChoiceModal();
  }
  function openChoiceFromEffects(k, options, extra) {
    closeMenu();
    const c = st.inst[k]; if (!c) return;
    const pr0 = st && (st.prompts || [])[0];
    // ทายประเภทตำรวจ — ใช้ปุ่มบนแถบ ไม่เปิด modal ทับสนาม
    if (pr0 && pr0.kind === 'chooseMode' && pr0.guessTypes && pr0.src === k) return;
    const opts = (options || []).map(o => o.label || 'ตัวเลือก');
    if (!opts.length) { toast('ไม่พบตัวเลือก'); return; }
    const keepSel = (choiceCtx && choiceCtx.k === k && extra && extra.fromPrompt) ? choiceCtx.sel : 0;
    choiceCtx = { k, opts, sel: keepSel || 0, fromPrompt: !!(extra && extra.fromPrompt) };
    byId('choiceCardName').textContent = c.name;
    const title = document.querySelector('#choiceModal .dc-title');
    const note = document.querySelector('#choiceModal .dc-note');
    if (title) title.textContent = '🎯 เลือกปฏิบัติ';
    if (note) note.innerHTML = 'เลือกเทคแล้วกดยืนยัน · <b>ยกเลิก</b>ได้ก่อนเลือกข้อ · ถ้าเลือกแล้วใช้ไม่ได้หรือข้ามเป้า จะนับว่าใช้ไปแล้วในเทิร์นนี้';
    renderChoiceOpts();
    showChoiceModal();
  }
  function renderChoiceOpts() {
    if (!choiceCtx) return;
    byId('choiceOptions').innerHTML = choiceCtx.opts.map((t, i) =>
      `<label class="choice-opt${choiceCtx.sel === i ? ' sel' : ''}" data-opt="${i}">
        <input type="radio" name="choiceRadio" ${choiceCtx.sel === i ? 'checked' : ''}>
        <span class="co-txt"><span class="co-num">${i + 1})</span>${esc(t)}</span>
      </label>`).join('');
  }
  function closeChoicePopup(force) {
    if (force && typeof force === 'object') force = false; // onclick ส่ง event มา — ไม่ใช่ force
    // ทิ้งมือจ่ายค่าแล้ว modal เลือกเทคเด้งทับนิ้ว → click ค้างไปโดนพื้นหลัง/ยกเลิก ระบบข้ามเทค
    if (!force && choiceGhostClick() && choiceCtx && choiceCtx.fromPrompt) {
      byId('choiceModal').classList.remove('hidden');
      return;
    }
    // ทายประเภท — ห้ามปิดทิ้ง ไม่งั้นเด็ค/เกมค้าง
    const pr0 = st && (st.prompts || [])[0];
    if (!force && pr0 && pr0.kind === 'chooseMode' && pr0.guessTypes && choiceCtx && choiceCtx.k === pr0.src) {
      toast('ต้องประกาศประเภทท็อปเด็คก่อน — กด อวตาร / เมจิก / คอนสตรัค บนแถบด้านล่างได้');
      byId('choiceModal').classList.remove('hidden');
      return;
    }
    if (!force && pr0 && pr0.kind === 'chooseMode' && pr0.optional === false && choiceCtx && choiceCtx.k === pr0.src) {
      toast('ต้องเลือกปฏิบัติให้ครบก่อน');
      byId('choiceModal').classList.remove('hidden');
      return;
    }
    // ยกเลิกหน้าต่างเลือกเทค — ยังไม่นับว่าใช้ (นับเมื่อเลือกข้อแล้ว แม้ใช้ไม่ได้หรือข้ามเป้า)
    if (!force && pr0 && pr0.kind === 'chooseMode' && !pr0.guessTypes && choiceCtx && choiceCtx.k === pr0.src) {
      byId('choiceModal').classList.add('hidden');
      choiceCtx = null;
      sendAction({ type: 'skipPrompt', by: mode === 'solo' ? pr0.chooser : undefined });
      return;
    }
    byId('choiceModal').classList.add('hidden');
    choiceCtx = null;
    const title = document.querySelector('#choiceModal .dc-title');
    const note = document.querySelector('#choiceModal .dc-note');
    if (title) title.textContent = '🎯 เลือกปฏิบัติ';
    if (note) note.innerHTML = 'เลือกจาก <b>นรก</b> หรือ <b>เด็ค</b> แล้วกดยืนยัน — ระบบจะเปิดการ์ดที่เลือกได้ให้แตะต่อ';
  }

  /* ── สืบทอดคำสั่ง (Inheritance Chain): เลือกการ์ดต้นทาง แล้วแตะ Avatar ฝั่งเราเป็นผู้รับ ── */
  let inheritSrc = null;
  function startInheritPick(k) {
    closeMenu();
    inheritSrc = k;
    toast('🧬 แตะ Avatar ฝั่งคุณ (ใบที่กะพริบ) เพื่อรับสืบทอดความสามารถ · แตะที่ว่างเพื่อยกเลิก', 4000);
    render();
  }
  function clearInheritPick() { inheritSrc = null; render(); }

  /* ── overlay ดูกองการ์ด: นรก/มิติมืด (สาธารณะ) · ค้นเด็ค/ดูท็อป (เจ้าของเท่านั้น) ── */
  let pileView = null; // {zone, mode:'pile'|'search'|'peek', n}
  function openPileView(zone, viewMode, n) {
    // 🔒 ค้นหาเด็ค = ข้อมูลปิด — เปิด overlay เฉพาะจอเรา (อีกฝั่งเห็นแค่ log ว่ากำลังค้น + ชื่อใบที่หยิบขึ้นมือ)
    if (viewMode === 'search') {
      sendAction({ type: 'peekDeck', p: zone[0], n: 0, priv: true });
      pileView = { zone, mode: 'search', n: 0 };
      renderPileView();
      return;
    }
    // 🔍 เปิดท็อป/สอดแนม = ข้อมูลเปิด — fx.deckView เปิด overlay พร้อมกัน "ทุกจอ"
    if (viewMode === 'peek') {
      sendAction({ type: 'peekDeck', p: zone[0], n });
      return;
    }
    pileView = { zone, mode: viewMode, n: n || 0 };
    renderPileView();
  }
  function closePileView() {
    const pv = pileView; pileView = null;
    byId('pileView').classList.add('hidden');
    if (!pv) return;
    const isDeckView = pv.mode === 'search' || pv.mode === 'peek';
    const owner = pv.zone[0];
    const iOwn = mode === 'solo' || (seat !== 'S' && owner === seat);
    if (isDeckView && iOwn) {
      if (pv.mode === 'search') sendAction({ type: 'shuffle', p: owner }); // ค้นเสร็จสับอัตโนมัติ
      sendAction({ type: 'peekEnd', p: owner }); // แจ้งอีกฝั่งปิด overlay ตาม
    }
  }
  function renderPileView() {
    const ov = byId('pileView');
    // โหมดเลือกจากเอฟเฟกต์ (สอดแนม/ค้นเด็ค/เลือกจากนรก) — เปิดค้างจนกว่าจะเลือกหรือข้าม
    const pp = st && (st.prompts || [])[0];
    // ธรณีสูบแล้วมีผลพิเศษ (แว่น ฯลฯ) — การ์ดอยู่ในนรก มองไม่เห็นบนสนาม → เปิดหน้าต่างโชว์ใบนั้น
    if (pp && pp.kind === 'milledOptional' && (mode === 'solo' || seat === pp.chooser)) {
      const k = pp.src;
      const nm = st.inst[k] ? st.inst[k].name : '?';
      byId('pileTitle').textContent = `💀 ${nm} โดนธรณีสูบ — แตะการ์ดนี้เพื่อใช้ผลพิเศษ (หรือกดปุ่มด้านบน)`;
      byId('pileGrid').innerHTML = k && st.inst[k]
        ? cardHTML(k, 'magic', { forceUp: true, noTap: true })
        : '<div class="pile-empty">ไม่พบการ์ด</div>';
      ov.dataset.prompt = '1';
      const skipBtn = byId('btnPileClose');
      skipBtn.classList.remove('hidden');
      skipBtn.textContent = 'ข้าม — ไม่ใช้ผลพิเศษ';
      byId('btnPileShuffle').classList.add('hidden');
      ov.classList.remove('hidden');
      return;
    }
    // สอดแนมเปิด (revealAllScout) = ข้อมูลเปิด → ทั้งสองฝั่งเห็นหน้าต่าง / อื่นๆ เฉพาะคนเลือก
    const iAmChooser = !!(pp && (mode === 'solo' || seat === pp.chooser));
    const openScoutBoth = !!(pp && pp.kind === 'pick' && pp.from === 'ids' && pp.revealAllScout);
    if (pp && pp.kind === 'pick' && ['ids', 'deckAll', 'hell', 'anyHell', 'deckOrHell', 'ownMagic', 'dark', 'ownHand'].includes(pp.from) && (iAmChooser || openScoutBoth)) {
      // สอดแนม (ids): โชว์ทุกใบที่เปิดเจอ · ใบที่เลือกได้กะพริบ · เมฟิสโต้ฯ ติดป้ายขึ้นมืออัตโนมัติ
      // นรก showAllHell: โชว์ทั้งกอง · ใบตรงเงื่อนไขกะพริบ (ไม่นะโดม / อู๊ด / มณโท)
      const showAllScout = pp.from === 'ids' && !!pp.revealAllScout;
      const showAllHell = (pp.from === 'hell' || pp.from === 'anyHell') && !!pp.showAllHell;
      const showAnyHell = pp.from === 'anyHell';
      const showAllMagic = pp.from === 'ownMagic';
      const showAllDark = pp.from === 'dark';
      const showAllHand = pp.from === 'ownHand';
      const selectable = iAmChooser ? BoTEngine.promptCandidates(st, pp) : [];
      const autoHand = new Set((pp.autoHandIds || []).filter(k => (st.zones[pp.chooser + '.deck'] || []).includes(k)));
      // ids อาจอยู่เด็คฝ่ายตรงข้าม (สอดแนมตำรวจ) — อย่ากรองเฉพาะเด็คของ chooser
      const disp = showAllScout
        ? (pp.ids || []).filter(k => !!st.inst[k])
        : showAnyHell
          ? (st.zones['A.hell'] || []).concat(st.zones['B.hell'] || []).filter(k => k !== pp.src)
          : showAllHell
          ? (st.zones[pp.chooser + '.hell'] || []).filter(k => k !== pp.src)
          : showAllMagic
            ? (st.zones[pp.chooser + '.magic'] || []).filter(k => k !== pp.src)
            : showAllDark
              ? (st.zones[pp.chooser + '.dark'] || []).filter(k => k !== pp.src)
              : showAllHand
                ? (st.zones[pp.chooser + '.hand'] || []).filter(k => !(pp.excludeIds || []).includes(k))
                : selectable;
      const canPick = new Set(selectable);
      const showAllPick = showAllScout || showAllHell || showAnyHell || showAllMagic || showAllDark || showAllHand;
      let title;
      if (pp.dest === 'preventLeavePick')
        title = `🛡️ เนรเทศรัททาทุยจากนรก (${pp.got || 0}/${pp.need || 5}) — แตะการ์ดเพื่อเนรเทศ`;
      else if (pp.dest === 'retargetAttack')
        title = `⚔️ เสียเตะไข่ — เลือกเป้าโจมตีใหม่`;
      else if (pp.dest === 'naraiSacSummon')
        title = `🕉️ เลือกพระนารายณ์บนสนามส่งนรก — เพื่ออัญเชิญอวตาร`;
      else if (pp.from === 'ownMagic' && pp.dest === 'magicToHellCost')
        title = `✨ ส่งจาก Magic Zone ลงนรก (${pp.got || 0}/${pp.need || 1}) — แตะใบที่กะพริบ`;
      else if (pp.from === 'ownMagic' && pp.dest === 'avatar')
        title = `✨ เลือกจาก Magic Zone อัญเชิญลงสนาม — แตะใบที่กะพริบ`;
      else if (pp.from === 'ownMagic')
        title = `✨ เลือกการ์ดบน Magic Zone — แตะใบที่กะพริบ`;
      else if (pp.dest === 'destroy')
        title = `💥 เลือก Avatar ที่จะทำลาย`;
      else if (pp.dest === 'avatar' && pp.naraiReturn)
        title = `🕉️ จบเทิร์น — เลือกพระนารายณ์จากนรกอัญเชิญกลับขึ้นสนาม`;
      else if (pp.from === 'anyHell')
        title = iAmChooser
          ? (pp.costSumMax != null
            ? `✨ นรกใครก็ได้ — อัญเชิญจุติ Avatar Cost รวม≤${pp.costSumMax} (ตอนนี้ ${pp.costGot || 0}) — แตะใบที่กะพริบ (${selectable.length})`
            : `✨ นรกใครก็ได้ — อัญเชิญจุติ Avatar — แตะใบที่กะพริบ (${selectable.length})`)
            + (!selectable.length ? ' — ไม่มีใบตรงเงื่อนไข (กดข้าม)' : '')
          : `👁 นรกทั้งสองฝั่ง — ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (pp.dest === 'avatar' && showAllHell)
        title = iAmChooser
          ? `✨ เปิดนรก ${disp.length} ใบ — อัญเชิญใบที่กะพริบ (${selectable.length})`
            + (!selectable.length ? ' — ไม่มีใบตรงเงื่อนไข (กดข้าม)' : '')
          : `👁 นรกของผู้เล่น ${pp.chooser} — ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (pp.dest === 'avatar')
        title = `✨ เลือกการ์ดอัญเชิญลงสนาม`;
      else if (pp.from === 'dark' && (pp.dest === 'pickAttachHost' || pp.dest === 'attachTo' || pp.dest === 'attachSelf'))
        title = iAmChooser
          ? `🌀 มิติมืด ${disp.length} ใบ — แตะอาวุธนครที่กะพริบเพื่อสวม (${selectable.length})`
            + (!selectable.length ? ' — ไม่มีใบตรงเงื่อนไข (กดข้าม)' : '')
          : `👁 มิติมืดของผู้เล่น ${pp.chooser} — ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (pp.from === 'dark')
        title = iAmChooser
          ? `🌀 เลือกการ์ดจากมิติมืด — แตะใบที่กะพริบ (${selectable.length})`
            + (!selectable.length ? ' — ไม่มีใบตรงเงื่อนไข (กดข้าม)' : '')
          : `👁 มิติมืดของผู้เล่น ${pp.chooser} — ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (pp.from === 'ownHand')
        title = `✋ เลือกการ์ดจากมือ — แตะใบที่กะพริบ`;
      else if (pp.dest === 'dark')
        title = `🌀 เลือกเป้าเนรเทศมิติมืด`;
      else if (pp.dest === 'scoutAllHandThenExile')
        title = iAmChooser
          ? `✨ สอดแนมเจอ ${disp.length} ใบ (รวม Cost ${pp.scoutCostSum != null ? pp.scoutCostSum : '?'}) — กดรับขึ้นมือ แล้วเลือกเนรเทศศัตรู`
          : `👁 สอดแนมของผู้เล่น ${pp.chooser} — เจอ ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (showAllHell)
        title = iAmChooser
          ? `✨ เปิดนรก ${disp.length} ใบ — แตะใบที่กะพริบเพื่อเลือก (${selectable.length})`
            + (!selectable.length ? ' — ไม่มีใบตรงเงื่อนไข (กดข้าม)' : '')
          : `👁 นรกของผู้เล่น ${pp.chooser} — ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (pp.from === 'deckOrHell')
        title = `✨ ค้นเด็คหรือนรก — แตะการ์ดที่กะพริบเพื่อเลือกขึ้นมือ`;
      else if (pp.from === 'hell')
        title = `✨ เลือกการ์ดจากนรก`;
      else if (pp.from === 'deckAll')
        title = `✨ ค้นเด็คด้วยเอฟเฟกต์ — แตะการ์ดที่กะพริบเพื่อเลือก`;
      else if (pp.dest === 'scoutOppHell')
        title = iAmChooser
          ? `👁 สอดแนมเด็คศัตรู ${disp.length} ใบ — แตะ 1 ใบทิ้งนรก ที่เหลือกลับบนสุด`
          : `👁 สอดแนมของผู้เล่น ${pp.chooser} — เจอ ${disp.length} ใบ (ดูอย่างเดียว)`;
      else if (pp.from === 'ids' && pp.allowAnyZone && !showAllScout)
        title = `✨ เลือกการ์ดที่กะพริบ`;
      else if (showAllScout) {
        const nAuto = autoHand.size;
        const nPick = selectable.length;
        if (!iAmChooser)
          title = `👁 สอดแนมของผู้เล่น ${pp.chooser} — เจอ ${disp.length} ใบ (ดูอย่างเดียว)`;
        else {
          title = `✨ สอดแนมเจอ ${disp.length} ใบ`
            + (nPick ? ` — แตะใบที่กะพริบเพื่อเลือกขึ้นมือ (${nPick})` : '')
            + (nAuto ? ` · ${nAuto} ใบจะขึ้นมืออัตโนมัติหลังจบ` : (!nPick ? ' — ไม่มีใบตรงเงื่อนไข (กดข้าม)' : ''));
        }
      } else
        title = `✨ สอดแนม — แตะการ์ดที่กะพริบเพื่อเลือก (ขึ้นมือ)`;
      byId('pileTitle').textContent = title;
      byId('pileHint').textContent = iAmChooser
        ? (pp.from === 'ownMagic'
          ? 'โชว์ทั้ง Magic Zone เป็นใบใหญ่ · ใบที่กะพริบเลือกได้ · ไม่ต้องเลื่อนหรือคลิกใบที่ทับกันบนสนาม'
          : (pp.from === 'anyHell'
            ? 'โชว์นรกทั้งสองฝั่ง · แตะใบที่กะพริบเพื่ออัญเชิญลง Avatar Zone ฝ่ายเรา'
            : (pp.from === 'deckOrHell'
            ? 'แสดงใบที่ตรงเงื่อนไขจากเด็คและนรก · ถ้าหยิบจากเด็คจะสับเด็ค'
            : (pp.from === 'dark'
              ? 'โชว์ทั้งมิติมืด · แตะใบที่กะพริบเพื่อเลือกอาวุธนครมาสวม'
              : (showAllPick ? 'เปิดให้ดูทั้งกอง · แตะใบที่กะพริบเพื่อเลือก' : 'แตะการ์ดที่กะพริบเพื่อเลือก')))))
        : 'อีกฝั่งกำลังเลือก — ดูอย่างเดียว';
      byId('pileGrid').innerHTML = disp.length
        ? disp.map((k, i) => {
          const isAuto = autoHand.has(k);
          const isPick = canPick.has(k);
          const opts = {
            forceUp: true, noTap: true,
            order: (pp.from === 'ids' && !pp.allowAnyZone) ? i + 1 : 0
          };
          if (showAllScout && isAuto) {
            opts.extraClass = 'scout-auto-hand';
            opts.badge = 'ขึ้นมืออัตโนมัติ';
          } else if (showAllPick && !isPick) {
            opts.extraClass = 'scout-reveal-dim';
            if (pp.from === 'anyHell')
              opts.badge = (st.zones[pp.chooser + '.hell'] || []).includes(k) ? 'นรกเรา' : 'นรกศัตรู';
          } else if (pp.from === 'anyHell') {
            if ((st.zones[pp.chooser + '.hell'] || []).includes(k)) opts.badge = 'นรกเรา';
            else opts.badge = 'นรกศัตรู';
          } else if (pp.from === 'deckOrHell') {
            if ((st.zones[pp.chooser + '.hell'] || []).includes(k)) opts.badge = 'นรก';
            else if ((st.zones[pp.chooser + '.deck'] || []).includes(k)) opts.badge = 'เด็ค';
          }
          return cardHTML(k, 'magic', opts);
        }).join('')
        : `<div class="pile-empty">${pp.from === 'ownMagic' ? 'ไม่มีใบบน Magic Zone' : (pp.from === 'dark' ? 'ไม่มีใบบนมิติมืด' : (pp.from === 'ownHand' ? 'ไม่มีใบในมือ' : 'ไม่มีการ์ดในนรก / ให้เลือก'))}</div>`;
      ov.dataset.prompt = iAmChooser ? '1' : 'view';
      const skipBtn = byId('btnPileClose');
      if (!iAmChooser) {
        // ฝั่งดู: ปิดปุ่มเลือก/ข้าม — หน้าต่างปิดเองเมื่อเจ้าของจบ
        skipBtn.classList.add('hidden');
        byId('btnPileShuffle').classList.add('hidden');
        ov.classList.remove('hidden');
        return;
      }
      const mustPick = pp.optional === false && pp.dest !== 'preventLeavePick';
      skipBtn.classList.toggle('hidden', mustPick && pp.dest !== 'naraiSacSummon');
      // naraiSacSummon บังคับเลือก — ซ่อนข้าม / อื่นๆ ตาม optional
      if (pp.dest === 'naraiSacSummon' || (pp.dest === 'avatar' && pp.naraiReturn)) {
        skipBtn.classList.add('hidden'); // บังคับเลือกพระนารายณ์
      } else if (pp.dest === 'preventLeavePick') {
        skipBtn.classList.remove('hidden');
        skipBtn.textContent = 'ไม่ใช้ — ออกสนาม';
      } else if (pp.dest === 'scoutAllHandThenExile') {
        skipBtn.classList.remove('hidden');
        skipBtn.textContent = 'รับขึ้นมือทั้งหมด → เลือกเนรเทศ';
      } else if (pp.from === 'ids' && !pp.allowAnyZone) {
        skipBtn.classList.remove('hidden');
        skipBtn.textContent = autoHand.size && !selectable.length
          ? 'รับขึ้นมืออัตโนมัติ / ปิด'
          : 'ข้าม (ไม่หยิบ → ใต้เด็ค)';
      } else {
        skipBtn.classList.toggle('hidden', pp.optional === false);
        skipBtn.textContent = 'ข้าม';
      }
      // ปุ่มสับ = เฉพาะสอดแนมจากเด็คจริงๆ
      byId('btnPileShuffle').classList.toggle('hidden', !(pp.from === 'ids' && !pp.allowAnyZone));
      ov.classList.remove('hidden');
      return;
    }
    ov.dataset.prompt = '';
    byId('btnPileShuffle').classList.add('hidden');
    byId('btnPileClose').classList.remove('hidden');
    byId('btnPileClose').textContent = 'ปิด';
    // ★ โหมดสอดแนม/เปิดท็อป (st.scout) — เปิดค้างทั้งสองจอจนกว่าเจ้าของจะเลือก บน/ใต้กอง
    const sc = st && st.scout;
    if (sc) {
      const iOwn = mode === 'solo' || (seat !== 'S' && seat === sc.p);
      const left = sc.ids.filter(k => (st.zones[sc.p + '.deck'] || []).includes(k));
      const fromTxt = sc.from === 'bottom' ? 'จากล่างกอง (ก้นเด็คก่อน)' : 'จากบนกอง';
      byId('pileTitle').textContent = `🔍 ${sc.label} ของผู้เล่น ${sc.p} ${fromTxt} — เปิด ${left.length + sc.taken.length} ใบ · ขึ้นมือแล้ว ${sc.taken.length}`;
      byId('pileHint').textContent = iOwn
        ? 'แตะการ์ด = เอาขึ้นมือ · ลากการ์ดไปวางตำแหน่งใหม่ = จัดลำดับ (หรือกดปุ่ม ◀ ▶)'
        : 'อีกฝั่งกำลังสอดแนม (ดูอย่างเดียว)';
      // แต่ละใบมีปุ่มเลื่อนลำดับ ◀ ▶ (เฉพาะเจ้าของ) — ซ้ายสุด = ใบที่จะอยู่บนสุด (จั่วได้ก่อน)
      const lastI = left.length - 1;
      // ★ ทิศลำดับตามที่มา: บนกอง → ซ้ายสุด = บนสุด · กฏร้าน (ล่างกอง) → ซ้ายสุด = ล่างสุด (ใบแรกที่เปิด)
      const fromBot = sc.from === 'bottom';
      const src = fromBot
        ? `<div class="sc-src">🔽 กฏร้าน: เปิดจากก้นเด็ค — ใบแรก (ซ้ายสุด) คือใบที่อยู่ก้นสุด</div>` : '';
      const gLeft = fromBot ? 'ซ้ายสุด = จะอยู่ล่างสุด ⬇' : '⬆ ซ้ายสุด = จะอยู่บนสุด (จั่วได้ก่อน)';
      const gRight = fromBot ? '⬆ ขวาสุด = จะอยู่บนสุด (จั่วได้ก่อน)' : 'ขวาสุด = จะอยู่ล่างสุด ⬇';
      byId('pileGrid').innerHTML = left.length
        ? src
        + `<div class="sc-guide${fromBot ? ' rev' : ''}"><span class="sc-g-lbl">จัดลำดับก่อนวางกลับ:</span>`
        + `<span class="${fromBot ? 'sc-g-bot' : 'sc-g-top'}">${gLeft}</span>`
        + `<span class="sc-g-arrow"></span>`
        + `<span class="${fromBot ? 'sc-g-top' : 'sc-g-bot'}">${gRight}</span></div>`
        + left.map((k, i) => {
          const isTopEnd = fromBot ? i === lastI : i === 0;      // ใบที่จะไปอยู่บนสุด
          const isBotEnd = fromBot ? i === 0 : i === lastI;      // ใบที่จะไปอยู่ล่างสุด
          const tag = isTopEnd ? `${i + 1} · จะอยู่บนสุด` : isBotEnd ? `${i + 1} · จะอยู่ล่างสุด` : `${i + 1}`;
          const cls = isTopEnd ? ' sc-first' : isBotEnd ? ' sc-last' : '';
          return `<div class="sc-slot${cls}" data-sc-slot="${i}" data-sc-id="${k}">${cardHTML(k, 'magic', { forceUp: true, noTap: true, order: tag })}`
            + (iOwn && left.length > 1 ? `<div class="sc-ord">`
              + `<button class="sc-b" data-sc-move="-1" data-k="${k}" ${i === 0 ? 'disabled' : ''} title="เลื่อนขึ้นไปทางบนสุดของกอง">◀</button>`
              + `<button class="sc-b" data-sc-move="1" data-k="${k}" ${i === lastI ? 'disabled' : ''} title="เลื่อนลงไปทางล่างสุดของกอง">▶</button>`
              + `</div>` : '') + `</div>`;
        }).join('')
        : '<div class="pile-empty">หยิบขึ้นมือหมดแล้ว</div>';
      byId('scoutBar').classList.toggle('hidden', !iOwn);
      byId('scoutText').textContent = `เลือกขึ้นมือแล้ว ${sc.taken.length} ใบ · เหลือ ${left.length} ใบ — จะไว้ตรงไหน?`;
      byId('btnPileClose').classList.add('hidden'); // ปิดเองไม่ได้ ต้องเลือกบน/ใต้กอง
      ov.classList.remove('hidden');
      return;
    }
    byId('scoutBar').classList.add('hidden');
    if (!pileView || !st) { ov.classList.add('hidden'); return; }
    const { zone, mode: vm, n } = pileView;
    let ids = (st.zones[zone] || []).slice();
    let title;
    const foreignView = (vm === 'search' || vm === 'peek') && mode === 'online' && seat !== zone[0]; // ดูของอีกฝ่าย
    if (vm === 'peek') {
      ids = ids.slice(-n).reverse();
      title = foreignView
        ? `🔍 ผู้เล่น ${zone[0]} เปิดดูท็อปเด็ค — ${ids.length} ใบ (ดูอย่างเดียว)`
        : `ท็อปเด็ค ${zone[0]} — ${ids.length} ใบ (เรียงจากบนสุด) `
        + `<button class="btn-mini" data-peek-adj="-1">−</button> <button class="btn-mini" data-peek-adj="1">+ เปิดเพิ่ม</button>`;
      byId('pileTitle').innerHTML = title;
    }
    else if (vm === 'search') {
      ids.sort((a, b) => st.inst[a].name.localeCompare(st.inst[b].name, 'th'));
      byId('pileTitle').textContent = `🔒 ค้นหาในเด็ค ${zone[0]} — ${ids.length} ใบ (อีกฝั่งไม่เห็น · ใบที่หยิบขึ้นมือจะแจ้งชื่อ · ปิดแล้วสับให้)`;
    }
    else byId('pileTitle').textContent = `${BoTEngine.zLabel(zone)} ${zone === 'land' ? '' : zone[0]} — ${ids.length} ใบ`;
    const hellPile = (zone || '').endsWith('.hell');
    byId('pileGrid').innerHTML = ids.length
      ? ids.map((k, i) => cardHTML(k, 'magic', {
          forceUp: true,
          noTap: true,
          order: vm === 'peek' ? i + 1 : 0
        })).join('')
      : `<div class="pile-empty">กองนี้ว่างเปล่า</div>`;
    ov.classList.remove('hidden');
  }
  byId('btnPileClose').onclick = () => {
    const pp = st && (st.prompts || [])[0];
    if (byId('pileView').dataset.prompt === '1' && pp) { // โหมดเลือกจากเอฟเฟกต์ → ปุ่มนี้คือ "ข้าม"
      sendAction({ type: 'skipPrompt', by: mode === 'solo' ? pp.chooser : undefined });
      return;
    }
    closePileView();
  };
  /* ── 🃏 แผงคำสั่งเด็ค (แถบขวา) — ค้นหา / บนกอง · จำนวนติดลบ = ธรณีสูบ ── */
  const dopNRaw = () => {
    const v = +byId('dopN').value;
    return Number.isFinite(v) ? v : 5;
  };
  const clampDopN = (v) => {
    let n = Math.max(-30, Math.min(30, v | 0));
    if (n === 0) n = v < 0 ? -1 : 1; // ข้าม 0
    return n;
  };
  const dopN = () => clampDopN(dopNRaw());
  const dopWho = () => (mode === 'solo' && !realMode ? (st ? st.active : my) : my);
  function syncDopPeekBtn() {
    const btn = byId('btnDeckPeekTop'), inp = byId('dopN');
    if (!btn || !inp) return;
    const n = dopN();
    inp.value = String(n);
    const mill = n < 0;
    btn.classList.toggle('dop-mill', mill);
    btn.textContent = mill ? `🌊 ธรณีสูบ ${Math.abs(n)}` : '👁 บนกอง';
    btn.title = mill
      ? `ธรณีสูบ ${Math.abs(n)} ใบบนสุดลงนรก (จำนวนติดลบในช่องเด็ค)`
      : `เปิดจากบนกอง ${n} ใบ — ทั้งสองฝั่งเห็น เลือกขึ้นมือได้ แล้วจัดที่เหลือบน/ใต้กอง`;
  }
  byId('deckOps').addEventListener('click', e => {
    const adj = e.target.closest('[data-dop-adj]'); if (!adj) return;
    byId('dopN').value = String(clampDopN(dopN() + (+adj.dataset.dopAdj)));
    syncDopPeekBtn();
  });
  byId('dopN').addEventListener('input', syncDopPeekBtn);
  byId('dopN').addEventListener('change', syncDopPeekBtn);
  byId('btnDeckSearch').onclick = () => { if (st) openPileView(dopWho() + '.deck', 'search'); };
  byId('btnDeckPeekTop').onclick = () => {
    if (!st) return;
    const n = dopN();
    if (n < 0) sendAction({ type: 'millDeck', p: dopWho(), n: Math.abs(n) });
    else sendAction({ type: 'scout', p: dopWho(), n, label: 'เปิดบนกอง' });
  };
  byId('btnScoutTop').onclick = () => { const sc = st && st.scout; if (sc) sendAction({ type: 'scoutEnd', where: 'top', by: mode === 'solo' ? sc.p : undefined }); };
  byId('btnScoutBottom').onclick = () => { const sc = st && st.scout; if (sc) sendAction({ type: 'scoutEnd', where: 'bottom', by: mode === 'solo' ? sc.p : undefined }); };
  syncDopPeekBtn();

  // สอดแนม: ไม่หยิบการ์ด + สับเด็คทันที (ตามคำขอผู้เล่น)
  byId('btnPileShuffle').onclick = () => {
    const pp = st && (st.prompts || [])[0]; if (!pp) return;
    const who = pp.chooser;
    sendAction({ type: 'skipPrompt', by: mode === 'solo' ? who : undefined });
    sendAction({ type: 'shuffle', p: who });
  };
  // ◀ ▶ จัดลำดับการ์ดที่กำลังสอดแนม (ส่งเป็น action ให้อีกฝั่งเห็นลำดับเดียวกัน)
  byId('pileView').addEventListener('click', e => {
    const mv = e.target.closest('[data-sc-move]'); if (!mv) return;
    e.preventDefault(); e.stopPropagation();
    const sc = st && st.scout; if (!sc) return;
    sendAction({ type: 'scoutMove', k: mv.dataset.k, d: +mv.dataset.scMove, by: mode === 'solo' ? sc.p : undefined });
  }, true);

  /* ── 🖐️ ลากจัดลำดับการ์ดตอนสอดแนม/กฏร้าน (เมาส์ + นิ้ว) ── */
  let scDrag = null;
  function scSlotAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-sc-slot]') : null;
  }
  byId('pileGrid').addEventListener('pointerdown', e => {
    const sc = st && st.scout; if (!sc) return;
    const iOwn = mode === 'solo' || (seat !== 'S' && seat === sc.p); if (!iOwn) return;
    if (e.target.closest('[data-sc-move]')) return;             // กดปุ่ม ◀ ▶ ไม่ใช่ลาก
    const slot = e.target.closest('[data-sc-slot]'); if (!slot) return;
    scDrag = { id: slot.dataset.scId, from: +slot.dataset.scSlot, x0: e.clientX, y0: e.clientY, moved: false, el: slot };
  });
  document.addEventListener('pointermove', e => {
    if (!scDrag) return;
    if (!scDrag.moved && Math.hypot(e.clientX - scDrag.x0, e.clientY - scDrag.y0) > 8) {
      scDrag.moved = true; scDrag.el.classList.add('sc-dragging');
    }
    if (!scDrag.moved) return;
    const over = scSlotAt(e.clientX, e.clientY);
    document.querySelectorAll('.sc-drop').forEach(n => n.classList.remove('sc-drop'));
    if (over && over !== scDrag.el) over.classList.add('sc-drop');
  });
  document.addEventListener('pointerup', e => {
    if (!scDrag) return;
    const d = scDrag; scDrag = null;
    d.el.classList.remove('sc-dragging');
    document.querySelectorAll('.sc-drop').forEach(n => n.classList.remove('sc-drop'));
    if (!d.moved) return;                                        // แตะเฉยๆ = ปล่อยให้ตัวจัดการเดิม (หยิบขึ้นมือ)
    const over = scSlotAt(e.clientX, e.clientY);
    const sc = st && st.scout; if (!sc || !over) return;
    const to = +over.dataset.scSlot;
    if (to === d.from) return;
    sendAction({ type: 'scoutMove', k: d.id, to, by: mode === 'solo' ? sc.p : undefined });
  });
  // ปรับจำนวนเปิดท็อปเด็คจากในหน้าต่าง (− / + เปิดเพิ่ม)
  byId('pileView').addEventListener('click', e => {
    const adj = e.target.closest('[data-peek-adj]');
    if (!adj || !pileView || pileView.mode !== 'peek' || !st) return;
    if (mode === 'online' && seat !== pileView.zone[0]) return; // ปรับจำนวนได้เฉพาะเจ้าของเด็ค
    const max = (st.zones[pileView.zone] || []).length;
    const next = Math.max(1, Math.min(max, pileView.n + (+adj.dataset.peekAdj)));
    if (next === pileView.n) return;
    pileView.n = next;
    sendAction({ type: 'peekDeck', p: pileView.zone[0], n: next }); // log แจ้งอีกฝั่งตามจำนวนจริง
    renderPileView();
  });

  /* ── drag ด้วย pointer events (เมาส์ + นิ้ว) ── */
  let drag = null;
  let lastClick = { k: null, t: 0 };

  function makeGhost(k, x, y) {
    const c = st.inst[k];
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    g.innerHTML = c.faceUp || mode === 'solo'
      ? `<div class="face"><div class="fb"><div class="fb-name">${esc(c.name)}</div></div><div class="img" style="background-image:url('${esc(c.img)}')"></div></div>`
      : `<div class="back"></div>`;
    document.body.appendChild(g);
    moveGhost(g, x, y);
    return g;
  }
  function moveGhost(g, x, y) { g.style.left = (x - 35) + 'px'; g.style.top = (y - 49) + 'px'; }

  document.addEventListener('pointerdown', e => {
    const menu = byId('ctxMenu');
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) closeMenu();
    if (!st || byId('table').classList.contains('hidden')) return;
    if (e.button != null && e.button !== 0) return; // คลิกขวา/กลาง ไม่ใช้ — เมนูเปิดจากคลิกเดี่ยวเท่านั้น
    // ⚡➕➖ ปุ่มลัดบนการ์ด — จัดการที่ click แยก ไม่ให้ไปเริ่มลากการ์ด
    if (e.target.closest('[data-qa],[data-sc-move],[data-peek-adj]')) { drag = null; return; }
    if (inheritSrc && !e.target.closest('[data-cid]')) { clearInheritPick(); toast('ยกเลิกการสืบทอด'); return; }
    if (announceSrc && !e.target.closest('[data-cid]')) { announceSrc = null; announceKind = 'use'; render(); toast('ยกเลิกการชี้เป้า'); return; }
    const cardEl = e.target.closest('[data-cid]');
    const deckEl = e.target.closest('[data-deck]');
    if (cardEl) {
      const k = cardEl.dataset.cid;
      setPreview(k);
      drag = { k, x0: e.clientX, y0: e.clientY, moved: false, ghost: null, suppress: false, viewer: !!e.target.closest('#pileView') };
      // มือถือ: กดค้าง = เปิดหน้าเต็มอ่านการ์ด (เดสก์ท็อปใช้คลิกเดี่ยวเปิดเมนู)
      if (isTouchUI()) {
        drag.longT = setTimeout(() => {
          if (!drag || drag.moved) return;
          drag.suppress = true;
          openCardFull(k);
        }, 450);
      }
    } else if (deckEl) {
      drag = { deck: deckEl.dataset.deck, x0: e.clientX, y0: e.clientY, moved: false, suppress: false };
      // กองเด็ค: แตะ = จั่ว · คำสั่งอื่นอยู่ที่เมนูโต๊ะ ☰
    } else {
      const pileEl = e.target.closest('[data-pile]');
      if (pileEl) drag = { pile: pileEl.dataset.pile, x0: e.clientX, y0: e.clientY, moved: false, suppress: false };
    }
  }, { passive: true });

  // ปุ่มลัดบนการ์ด (โผล่ตอนชี้เมาส์) — สามัคคี / สวมใส่ / สั่งใช้
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-qa]'); if (!b || !st) return;
    e.preventDefault(); e.stopPropagation();
    const k = b.dataset.k; if (!st.inst[k]) return;
    if (b.dataset.qa === 'unity') startAnnounce(k, 'unity');
    else if (b.dataset.qa === 'attach') startAnnounce(k, 'attach');
    else if (b.dataset.qa === 'ann') startAnnounce(k);
    else if (b.dataset.qa === 'act') tryActivateAbility(k);
  }, true);

  // คลิกขวา = สั่งใช้ความสามารถ (มี activated ตามโซน) · ไม่มี → เปิดเมนูคำสั่ง
  document.addEventListener('contextmenu', e => {
    if (!st || byId('table').classList.contains('hidden')) return;
    const cardEl = e.target.closest('[data-cid]');
    if (!cardEl) return;
    e.preventDefault();
    const k = cardEl.dataset.cid;
    if (!st.inst[k] || !canControl(k)) return;
    closeMenu();
    setPreview(k);
    if (tryActivateAbility(k)) return;
    openMenu(k, e.clientX, e.clientY);
  });

  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 9) {
      drag.moved = true; clearTimeout(drag.longT);
      document.body.classList.add('dragging'); // ปิด hover-zoom ระหว่างลาก กันบังเป้า
      if (drag.k && !drag.viewer) drag.ghost = makeGhost(drag.k, e.clientX, e.clientY);
      // ระหว่างลากสามัคคี/มอด — ไฮไลต์เป้าที่วางได้
      if (drag.k && st && st.inst[drag.k]) {
        const src = st.inst[drag.k];
        const srcZ = BoTEngine.zoneOf(st, drag.k) || '';
        const srcSide = BoTEngine.ownerOf(st, drag.k);
        document.querySelectorAll('.card.drag-drop-ok').forEach(n => n.classList.remove('drag-drop-ok'));
        if (canUseUnity(drag.k)) {
          (st.zones[srcSide + '.avatar'] || []).filter(t => t !== drag.k).forEach(t => {
            const el2 = document.querySelector(`[data-cid="${t}"]`); if (el2) el2.classList.add('drag-drop-ok');
          });
        } else if (src.subtype === 'Modification' && srcZ.endsWith('.magic')) {
          ['A', 'B'].forEach(p => (st.zones[p + '.avatar'] || []).forEach(t => {
            const el2 = document.querySelector(`[data-cid="${t}"]`); if (el2) el2.classList.add('drag-drop-ok');
          }));
        }
      }
    }
    if (drag.ghost) moveGhost(drag.ghost, e.clientX, e.clientY);
  });

  document.addEventListener('pointerup', e => {
    document.body.classList.remove('dragging');
    document.querySelectorAll('.card.drag-drop-ok').forEach(n => n.classList.remove('drag-drop-ok'));
    if (!drag) return;
    clearTimeout(drag.longT);
    const d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.suppress) return;

    if (d.deck) {
      if (!d.moved) requestManualDraw(d.deck); // แตะกองเด็ค = จั่ว 1 (นอกเทิร์น/นอกเฟสจั่วถามก่อน)
      return;
    }
    if (d.pile) { // แตะกองนรก/มิติมืด = เปิดดูทั้งกอง
      if (!d.moved) openPileView(d.pile, 'pile');
      return;
    }
    if (!d.k) return;

    if (d.viewer) { // คลิกการ์ดใน overlay
      if (!d.moved) {
        const ppv = (st.prompts || [])[0];
        if (ppv && (ppv.kind === 'pick' || ppv.kind === 'milledOptional') && (mode === 'solo' || seat === ppv.chooser)) {
          if (BoTEngine.promptTargetOk(st, d.k)) sendAction({ type: 'chooseTarget', k: d.k, by: mode === 'solo' ? ppv.chooser : undefined });
          else toast(ppv.kind === 'milledOptional' ? 'แตะการ์ดที่โดนธรณีสูบ หรือกดใช้ผลพิเศษ' : 'ใบนี้ไม่ตรงเงื่อนไขเอฟเฟกต์ — เลือกใบที่กะพริบ');
          return;
        }
        // 🔍 โหมดสอดแนม — แตะการ์ด = เอาขึ้นมือ (เฉพาะเจ้าของ)
        const sc0 = st.scout;
        if (sc0) {
          if (mode === 'solo' || seat === sc0.p) sendAction({ type: 'scoutTake', k: d.k, by: mode === 'solo' ? sc0.p : undefined });
          else toast('อีกฝั่งกำลังสอดแนม — ดูได้อย่างเดียว');
          return;
        }
        // 🔍 ดูการค้นเด็คของอีกฝ่าย = ดูอย่างเดียว (แตะได้แค่พรีวิว)
        if (pileView && (pileView.mode === 'search' || pileView.mode === 'peek') &&
          mode === 'online' && seat !== pileView.zone[0]) return;
        openMenu(d.k, e.clientX, e.clientY);
      }
      return;
    }

    if (d.moved) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const tCard = el.closest('[data-cid]');
      if (tCard && tCard.dataset.cid !== d.k) {
        const tk = tCard.dataset.cid, tz = BoTEngine.zoneOf(st, tk);
        const dc = st.inst[d.k];
        const fromZ = BoTEngine.zoneOf(st, d.k) || '';
        // ★ Magic จากมือลากทับการ์ดใดๆ = ร่ายเวท (ไม่ใช่โจมตี) · เป้าที่ทับไว้ใช้ตอนเลือกเป้าเอฟเฟกต์
        if (dc && dc.type === 'Magic' && fromZ.endsWith('.hand')) {
          magicDropTarget = tk;
          sendAction({ type: 'playMagic', k: d.k, by: mode === 'solo' ? fromZ[0] : undefined });
          return;
        }
        // ลาก Modification ทับ Avatar = สวมใส่ (ต้องอยู่ใน Magic Zone แล้วเท่านั้น)
        if (dc && dc.type === 'Magic' && dc.subtype === 'Modification' && tz && tz.endsWith('.avatar')) {
          if (fromZ.endsWith('.magic')) {
            announceSrc = null; announceKind = 'use';
            return sendAction({ type: 'attach', k: d.k, to: tk });
          }
          toast('สวมใส่: ลากใบมอดลง Magic Zone ก่อน แล้วค่อยลากทับ Avatar (หรือกด 🔗)');
          return;
        }
        // ลาก Avatar ที่มีสามัคคี ทับพันธมิตร = สามัคคี
        if (tz && tz.endsWith('.avatar') && canUseUnity(d.k)
          && BoTEngine.ownerOf(st, tk) === BoTEngine.ownerOf(st, d.k)) {
          announceSrc = null; announceKind = 'use';
          return sendAction({ type: 'unity', k: d.k, to: tk });
        }
        // โจมตีได้เฉพาะ Avatar บนสนามที่ตื่น — ห้ามตัวนอน / เมจิก / มือ
        const atkOk = dc && dc.type === 'Avatar' && fromZ.endsWith('.avatar') && !dc.tapped && dc.faceUp !== false && !dc.cannotChangeStateUntilEOT;
        if (atkOk && tz && tz.endsWith('.life')) {
          return sendAction({ type: 'declareAttack', atk: d.k, life: tk });
        }
        if (atkOk && tz && (tz.endsWith('.avatar') || tz.endsWith('.construct'))
          && BoTEngine.ownerOf(st, tk) !== BoTEngine.ownerOf(st, d.k)) {
          return sendAction({ type: 'declareAttack', atk: d.k, def: tk });
        }
        if (dc && dc.type === 'Avatar' && fromZ.endsWith('.avatar') && dc.tapped
          && tz && (tz.endsWith('.life') || tz.endsWith('.avatar') || tz.endsWith('.construct'))) {
          toast(`😴 "${dc.name}" นอนอยู่ — ประกาศโจมตีไม่ได้`, 3200);
          return;
        }
      }
      const zEl = el.closest('[data-drop]');
      if (zEl && zEl.dataset.drop) {
        const to = zEl.dataset.drop;
        const from = BoTEngine.zoneOf(st, d.k) || '';
        if (from === to) return;
        const c0 = st.inst[d.k];
        // ★ Magic จากมือ → ลากวางสนามฝั่งเรา (Magic / Land / Avatar / Construct) หรือโซนเวท = ใช้เวท
        if (from.endsWith('.hand') && c0 && c0.type === 'Magic') {
          const ownSide = from[0];
          if (to === ownSide + '.hand') return;
          const playHere = to === 'land' || to.endsWith('.magic')
            || to === ownSide + '.avatar' || to === ownSide + '.construct';
          if (playHere) {
            sendAction({ type: 'playMagic', k: d.k, by: mode === 'solo' ? ownSide : undefined });
            return;
          }
        }
        // ลากจากมือลง Avatar/Construct = อัญเชิญ (จ่าย GEM จากใบที่แตะเลือกในมือ) — ไม่ใช่ Magic
        if (from.endsWith('.hand') && (to.endsWith('.avatar') || to.endsWith('.construct'))) {
          const eDrag = BoTEngine.effectOf && BoTEngine.effectOf(c0.code, c0.name);
          if (eDrag && (eDrag.noPaidSummon || eDrag.noHandSummon)) {
            toast(`🚫 "${c0.name}" ลงแบบจ่าย GEM ไม่ได้ — ใช้สั่งใช้จากมือตามเงื่อนไขบนการ์ด`, 4200);
            return;
          }
          let cost = BoTEngine.effCost ? BoTEngine.effCost(st, d.k) : (+c0.cost || 0);
          // ของขวัญ ฯลฯ — อัญเชิญฟรีตามเงื่อนไข (effCost ควรเป็น 0 แล้ว แต่ส่ง free ให้ชัด)
          const isFree = !!(BoTEngine.freeSummonOk && BoTEngine.freeSummonOk(st, d.k));
          if (isFree) cost = 0;
          const owner = from[0];
          const hand = st.zones[owner + '.hand'] || [];
          const payIds = Object.keys(selMap).filter(k => k !== d.k && hand.includes(k));
          const eAll = BoTEngine.effectOf && BoTEngine.effectOf(c0.code, c0.name);
          const avColor = (eAll && eAll.allColors) ? '' : (c0.color || '');
          let usable = 0;
          payIds.forEach(k => {
            const info = payGemInfo(st.inst[k], c0);
            if (BoTEngine.gemPaysFor ? BoTEngine.gemPaysFor(info.gc, avColor) : (!avColor || info.gc === 'ขาว' || info.gc === avColor)) usable += info.g;
          });
          if (cost > 0 && usable < cost) {
            toast(`GEM ไม่พอ: "${c0.name}" ต้องการ ${cost} (ใช้ได้ ${usable}) — แตะการ์ดในมือให้ GEM พอ แล้วลากลงสนาม`, 4500);
            return;
          }
          sendAction({ type: 'summon', k: d.k, to, payIds: isFree ? [] : payIds, free: isFree || undefined });
          return;
        }
        if (to === 'land') {
          const dropC = st.inst[d.k];
          if (!(dropC && dropC.type === 'Magic' && dropC.subtype === 'Land')) {
            toast('ช่อง Land วางได้เฉพาะ Magic ชนิด Land');
            return;
          }
        }
        sendAction({ type: 'move', k: d.k, to });
      } else {
        // ลาก Magic จากมือไปวางบนเสื่อฝั่งเรา (แม้ไม่โดนช่องโซนพอดี) = ใช้เวท
        const from = BoTEngine.zoneOf(st, d.k) || '';
        const c0 = st.inst[d.k];
        if (from.endsWith('.hand') && c0 && c0.type === 'Magic') {
          const onMyMat = el.closest('.mat-my') || el.closest('#myLandZone') || el.closest('#board');
          if (onMyMat) {
            sendAction({ type: 'playMagic', k: d.k, by: mode === 'solo' ? from[0] : undefined });
            return;
          }
        }
      }
      return;
    }

    // ⚡ โหมดประกาศใช้ — แตะการ์ดเป้าหมาย (ใบเดิม = ประกาศแบบไม่มีเป้า)
    if (announceSrc) {
      if (d.k === announceSrc) sendAnnounce(null);
      else sendAnnounce(d.k);
      return;
    }

    // โหมดเลือกผู้รับสืบทอด — แตะ Avatar ฝั่งเราเพื่อรับความสามารถของการ์ดต้นทาง
    if (inheritSrc) {
      const tz = BoTEngine.zoneOf(st, d.k) || '';
      const tSide = BoTEngine.ownerOf(st, d.k);
      if (d.k !== inheritSrc && tz.endsWith('.avatar') && (mode === 'solo' || tSide === seat)) {
        const srcSide = BoTEngine.ownerOf(st, inheritSrc);
        sendAction({ type: 'inherit', k: inheritSrc, to: d.k, by: mode === 'solo' ? (srcSide === 'S' ? my : srcSide) : undefined });
        clearInheritPick();
      } else { toast('เลือก Avatar ฝั่งคุณเป็นผู้รับ (ใบที่กะพริบ)'); }
      return;
    }

    // คลิก/แตะเฉยๆ — ถ้ามี prompt เลือกเป้าค้างอยู่และการ์ดนี้เป็นเป้าที่ถูกต้อง = เลือกเลย
    const prClick = (st.prompts || [])[0];
    if (prClick && (mode === 'solo' || seat === prClick.chooser) && BoTEngine.promptTargetOk(st, d.k)) {
      sendAction({ type: 'chooseTarget', k: d.k, by: mode === 'solo' ? prClick.chooser : undefined });
      return;
    }
    // สวนโจมตี: แตะ React ที่กะพริบเขียวในมือ = ใช้เลย (ดักโจมตี + React ยืดหยุ่น)
    if (st.pending && BoTEngine.counterOptions) {
      const defSide = st.pending.target;
      if ((mode === 'solo' || seat === defSide)) {
        const cops = BoTEngine.counterOptions(st, defSide) || [];
        const prAtk = (st.prompts || [])[0];
        const fromPrompt = prAtk && prAtk.kind === 'react' && prAtk.reactTrigger === 'enemyDeclareAttack'
          && (prAtk.options || []).includes(d.k);
        if (cops.includes(d.k) || fromPrompt) {
          sendAction({ type: 'playMagic', k: d.k, by: mode === 'solo' ? defSide : undefined });
          return;
        }
      }
    }
    // โล่มนุษย์: แตะ Avatar ที่กะพริบ = รับการโจมตีแทน
    if (st.pending && BoTEngine.humanShieldOptions) {
      const defSide = st.pending.target;
      if ((mode === 'solo' || seat === defSide) && (BoTEngine.humanShieldOptions(st, defSide) || []).includes(d.k)) {
        sendAction({ type: 'humanShield', k: d.k, by: mode === 'solo' ? defSide : undefined });
        return;
      }
    }
    const z = BoTEngine.zoneOf(st, d.k) || '';
    const now = Date.now();
    const dbl = lastClick.k === d.k && (now - lastClick.t) < 350;
    lastClick = { k: d.k, t: now };
    if (z.endsWith('.hell') || z.endsWith('.dark')) { openPileView(z, 'pile'); return; }
    if (z.endsWith('.life')) { sendAction({ type: 'toggleFace', k: d.k }); return; }
    if (z.endsWith('.hand')) {
      const canSel = mode === 'solo' ? true : (z === my + '.hand' && seat !== 'S');
      // ดับเบิลคลิกใบที่มีสั่งใช้จากมือ = สั่งใช้ (คลิกเดี่ยวยังเลือกนับ GEM / มัลลิแกน · คลิกขวาก็สั่งใช้ได้)
      if (dbl && canSel && !mullP && !st.awaitBattleStart) {
        if (tryActivateAbility(d.k)) {
          lastClick = { k: null, t: 0 };
          return;
        }
      }
      if (canSel) { if (selMap[d.k]) delete selMap[d.k]; else selMap[d.k] = true; render(); }
      return;
    }
    // การ์ดบนสนามฝั่งเรา (หรือ Land ร่วม) — คลิกเดี่ยว = เมนูสั่งใช้ · ดับเบิลคลิก = สั่งใช้
    const fSide = BoTEngine.ownerOf(st, d.k);
    const isField = z.endsWith('.avatar') || z.endsWith('.magic') || z.endsWith('.construct') || z === 'land';
    if (isField && (mode === 'solo' || fSide === my || fSide === 'S')) {
      if (dbl) { lastClick = { k: null, t: 0 }; closeMenu(); tryActivateAbility(d.k); return; }
      const cEl = document.querySelector(`[data-cid="${d.k}"]`);
      if (cEl) { const r = cEl.getBoundingClientRect(); openMenu(d.k, r.left + r.width / 2, r.top + r.height * 0.45); }
      return;
    }
  });

  byId('ctxMenu').addEventListener('click', e => {
    const ico = e.target.closest('.ctx-ico');
    if (ico) {
      const it = byId('ctxMenu')._entries[+ico.dataset.i];
      const r = it && it.row && it.row[+ico.dataset.j]; if (!r) return;
      if (!r.keep) closeMenu();
      if (r.fn) r.fn(); else if (r.act) sendAction(r.act);
      return;
    }
    const b = e.target.closest('.ctx-item'); if (!b) return;
    const entry = byId('ctxMenu')._entries[+b.dataset.i];
    closeMenu();
    if (!entry) return;
    if (entry.fn) entry.fn(); else if (entry.act) sendAction(entry.act);
  });

  document.addEventListener('pointerover', e => {
    const cardEl = e.target.closest('[data-cid]');
    if (cardEl && st) setPreview(cardEl.dataset.cid);
  });

  /* ── ปุ่มบนโต๊ะ ── */
  byId('btnEndTurn').onclick = () => doEndTurn();
  const btnEndFab = byId('btnEndTurnFab');
  if (btnEndFab) btnEndFab.onclick = () => doEndTurn();
  const phaseSlotEl = byId('phaseSlot');
  if (phaseSlotEl) {
    phaseSlotEl.addEventListener('click', () => {
      if (!window.matchMedia('(max-width:920px)').matches) return; // เดสก์ท็อปใช้ Enter / ปุ่มขวา
      doEndTurn();
    });
    phaseSlotEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doEndTurn(); }
    });
  }
  function closeTableMenu() {
    const m = byId('tableMenu'), b = byId('btnTableMenu');
    if (m) m.classList.add('hidden');
    if (b) { b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); }
  }
  function toggleTableMenu() {
    const m = byId('tableMenu'), b = byId('btnTableMenu');
    if (!m) return;
    const open = m.classList.contains('hidden');
    m.classList.toggle('hidden', !open);
    if (b) { b.classList.toggle('on', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  }
  const btnTableMenu = byId('btnTableMenu');
  if (btnTableMenu) btnTableMenu.onclick = e => { e.stopPropagation(); toggleTableMenu(); };
  const tableMenuEl = byId('tableMenu');
  if (tableMenuEl) {
    tableMenuEl.addEventListener('click', e => {
      if (e.target.closest('#deckOps, #dopN, .dop-step, #firstpRow, #swapSideRow, #inpChat')) return;
      if (e.target.closest('.tm-grid button, #btnEnd')) closeTableMenu();
    });
  }
  document.addEventListener('pointerdown', e => {
    const m = byId('tableMenu');
    if (!m || m.classList.contains('hidden')) return;
    if (m.contains(e.target) || (btnTableMenu && btnTableMenu.contains(e.target))) return;
    closeTableMenu();
  });
  window.addEventListener('resize', () => { if (st) syncEndTurnUi(); });
  window.addEventListener('orientationchange', () => { setTimeout(() => { if (st) { syncPhaseSlot(); syncEndTurnUi(); } }, 200); });
  // btnStrict ถูกถอดออกจากหน้า (แมนนวล 100%)
  byId('btnBot').onclick = () => { soloBot = !soloBot; toast(soloBot ? '🤖 เปิดบอท — B เล่นเอง' : 'ปิดบอท — คุณคุมทั้งสองฝั่ง'); render(); scheduleBot(); };
  byId('btnChainPass').onclick = () => { if (st && st.chain && st.chain.length) sendAction({ type: 'chainPass', by: mode === 'solo' ? st.chainPri : undefined }); };
  byId('btnChainNegate').onclick = () => { if (st && st.chain && st.chain.length) sendAction({ type: 'chainNegate', by: mode === 'solo' ? st.chainPri : undefined }); };
  const promptBy = () => { const p = st && (st.prompts || [])[0]; return (p && mode === 'solo') ? p.chooser : undefined; };
  byId('btnReactYes').onclick = () => { if (st && (st.prompts || [])[0]) sendAction({ type: 'reactYes', by: promptBy() }); };
  byId('btnReactNo').onclick = () => { if (st && (st.prompts || [])[0]) sendAction({ type: 'reactNo', by: promptBy() }); };
  byId('btnPromptSkip').onclick = () => { if (st && (st.prompts || [])[0]) sendAction({ type: 'skipPrompt', by: promptBy() }); };
  if (byId('btnMillOptYes')) byId('btnMillOptYes').onclick = () => {
    const pr = st && (st.prompts || [])[0];
    if (!pr || pr.kind !== 'milledOptional' || !pr.src) return;
    sendAction({ type: 'chooseTarget', k: pr.src, by: promptBy() });
  };
  const peekPlace = where => {
    const pr = st && (st.prompts || [])[0];
    if (!pr || pr.kind !== 'peekTop') return;
    sendAction({ type: 'peekTopPlace', where, by: promptBy() });
  };
  if (byId('btnPeekTop')) byId('btnPeekTop').onclick = () => peekPlace('top');
  if (byId('btnPeekBottom')) byId('btnPeekBottom').onclick = () => peekPlace('bottom');
  if (byId('btnPeekHell')) byId('btnPeekHell').onclick = () => peekPlace('hell');
  if (byId('btnGuessContinue')) byId('btnGuessContinue').onclick = () => {
    const pr = st && (st.prompts || [])[0];
    if (!pr || pr.kind !== 'guessReveal') return;
    sendAction({ type: 'guessRevealContinue', by: promptBy() });
  };
  const guessTypeRowEl = byId('guessTypeRow');
  if (guessTypeRowEl) guessTypeRowEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-guess-type]');
    if (!btn || !st) return;
    const pr = (st.prompts || [])[0];
    if (!pr || pr.kind !== 'chooseMode' || !pr.guessTypes) return;
    const idx = +btn.getAttribute('data-guess-type');
    if (!pr.options || !pr.options[idx]) return;
    const opt = pr.options[idx];
    sendAction({
      type: 'chooseMode',
      k: pr.src,
      opt: idx,
      label: opt.label || undefined,
      by: promptBy()
    });
    closeChoicePopup(true);
  });
  const chooseModeRowEl = byId('chooseModeRow');
  if (chooseModeRowEl) chooseModeRowEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-choose-mode]');
    if (!btn || btn.disabled || !st) return;
    const pr = (st.prompts || [])[0];
    if (!pr || pr.kind !== 'chooseMode' || pr.guessTypes) return;
    const idx = +btn.getAttribute('data-choose-mode');
    if (!pr.options || !pr.options[idx]) return;
    const opt = pr.options[idx];
    sendAction({
      type: 'chooseMode',
      k: pr.src,
      opt: idx,
      label: opt.label || undefined,
      by: promptBy()
    });
  });
  const hosPick = where => {
    const pr = st && (st.prompts || [])[0];
    if (!pr || pr.kind !== 'handOrSummon') return;
    sendAction({ type: 'handOrSummonPick', where, by: promptBy() });
  };
  if (byId('btnHosHand')) byId('btnHosHand').onclick = () => hosPick('hand');
  if (byId('btnHosSummon')) byId('btnHosSummon').onclick = () => hosPick('avatar');
  if (byId('btnSurviveYes')) byId('btnSurviveYes').onclick = () => {
    const pr = st && (st.prompts || [])[0];
    if (!pr) return;
    if (pr.kind === 'combatSurvive') sendAction({ type: 'combatSurviveYes', by: promptBy() });
    else if (pr.kind === 'passengerReplace') sendAction({ type: 'passengerReplaceYes', by: promptBy() });
    else if (pr.kind === 'magicRedirect') sendAction({ type: 'magicRedirectYes', by: promptBy() });
    else if (pr.kind === 'preventLeaveExile') sendAction({ type: 'preventLeaveYes', by: promptBy() });
  };
  if (byId('btnSurviveNo')) byId('btnSurviveNo').onclick = () => {
    const pr = st && (st.prompts || [])[0];
    if (!pr) return;
    if (pr.kind === 'combatSurvive') sendAction({ type: 'combatSurviveNo', by: promptBy() });
    else if (pr.kind === 'passengerReplace') sendAction({ type: 'passengerReplaceNo', by: promptBy() });
    else if (pr.kind === 'magicRedirect') sendAction({ type: 'magicRedirectNo', by: promptBy() });
    else if (pr.kind === 'preventLeaveExile') sendAction({ type: 'preventLeaveNo', by: promptBy() });
  };
  if (byId('btnPickSymbol')) byId('btnPickSymbol').onclick = () => {
    const pr = st && (st.prompts || [])[0];
    if (!pr || pr.kind !== 'pickSymbol') return;
    const sel = byId('pickSymbolSelect');
    const symbol = sel ? sel.value : '';
    if (!symbol) { toast('เลือก Symbol ก่อน'); return; }
    sendAction({ type: 'pickSymbol', symbol, by: promptBy() });
  };
  const rpsModal = byId('rpsModal');
  if (rpsModal) rpsModal.addEventListener('click', e => {
    const b = e.target.closest('[data-rps]'); if (!b || b.disabled) return;
    const pl = b.getAttribute('data-rps');
    const v = b.getAttribute('data-v');
    const pr = st && (st.prompts || [])[0];
    if (!pr || pr.kind !== 'rps') return;
    if (mode !== 'solo' && seat !== 'S' && pl !== my) { toast('เลือกได้เฉพาะฝั่งตัวเอง'); return; }
    sendAction({ type: 'rpsPick', v, by: pl, p: pl });
  });
  byId('btnRematchTop').onclick = () => { if (st) byId('rematchAsk').classList.remove('hidden'); };
  // btnUntap ถูกถอดออก — engine ตื่นทุกใบตอนเริ่มเทิร์นให้อยู่แล้ว
  byId('rmNo').onclick = () => byId('rematchAsk').classList.add('hidden');
  byId('rmYes').onclick = () => {
    byId('rematchAsk').classList.add('hidden');
    if (mode === 'solo') {
      rematchSolo();
    } else if (netKind === 'lan') {
      if (lanIsHost) lanHostRematch();
      else lanSend({ t: 'rematch' });
    } else {
      if (ws && ws.readyState === 1) wsSend({ t: 'rematch' });
      else toast('ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้', 3500);
    }
  };
  byId('btnDice').onclick = () => sendAction({ type: 'dice' });
  byId('btnCoin').onclick = () => sendAction({ type: 'coin' });
  // ── เลือกผู้เริ่มก่อน (สลับ A↔B) ──
  byId('btnFirstP').onclick = () => { if (!st) return; const nxt = (st.firstPlayer || 'A') === 'A' ? 'B' : 'A'; sendAction({ type: 'setFirstPlayer', p: nxt }); };
  // ── มัลลิแกน ──
  byId('btnMulligan').onclick = () => { mullMode = true; selMap = {}; render(); toast('แตะการ์ดในมือที่จะเปลี่ยน แล้วกดยืนยัน (เปลี่ยนกี่ใบก็ได้ · ลงใต้ Deck ไม่สับ)', 4000); };
  byId('btnMullGo').onclick = () => {
    const P = mullP || my;
    const ph = st.zones[P + '.hand'] || [];
    const ids = Object.keys(selMap).filter(k => ph.includes(k));
    selMap = {};
    sendAction({ type: 'mulligan', p: P, ids });
  };
  byId('btnMullKeep').onclick = () => { const P = mullP || my; selMap = {}; sendAction({ type: 'mulligan', p: P, ids: [] }); };
  function sendChat() {
    const inp = byId('inpChat'); const t = inp.value.trim(); if (!t) return;
    inp.value = '';
    sendAction({ type: 'chat', text: t, by: seat === 'S' ? 'S' : my });
  }
  byId('btnChat').onclick = sendChat;
  byId('inpChat').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  byId('btnInvite').onclick = copyInvite;
  byId('btnTutClose').onclick = () => { try { localStorage.setItem('bot_tut_seen', '1'); } catch (e) { } byId('tut').classList.add('hidden'); };
  byId('btnLogToggle').onclick = () => { closeTableMenu(); byId('logPane').classList.toggle('hidden'); };
  byId('btnLogClose').onclick = () => byId('logPane').classList.add('hidden');
  function closeCardPeek() {
    const pv = byId('previewPane');
    if (pv) pv.classList.remove('open');
    if (typeof mbSync === 'function') mbSync();
  }
  const btnPvClose = byId('btnPvClose');
  if (btnPvClose) btnPvClose.onclick = closeCardPeek;
  byId('btnSwapSide').onclick = swapSoloSide;
  byId('btnSwapSideCtrl').onclick = swapSoloSide;

  /* ── 📱 แถบปุ่มล่างจอ (มือถือ) — เข้าถึงทุกอย่างได้โดยไม่ต้องเปิดลิ้นชักก่อน ── */
  function mbSync() {
    const pv = byId('previewPane'), lg = byId('logPane');
    const bC = byId('mbCard'), bL = byId('mbLog'), bD = byId('mbDeck');
    if (bC) bC.classList.toggle('on', pv.classList.contains('open'));
    const drawerOpen = !lg.classList.contains('hidden');
    if (bL) bL.classList.toggle('on', drawerOpen);
    if (bD) bD.classList.toggle('on', !!(byId('tableMenu') && !byId('tableMenu').classList.contains('hidden')));
    syncEndTurnUi();
  }
  const openTableDeck = () => {
    byId('previewPane').classList.remove('open');
    byId('logPane').classList.add('hidden');
    const m = byId('tableMenu');
    if (m) m.classList.remove('hidden');
    const b = byId('btnTableMenu');
    if (b) { b.classList.add('on'); b.setAttribute('aria-expanded', 'true'); }
    setTimeout(() => { const d = byId('deckOps'); if (d) d.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 30);
    mbSync();
  };
  const openDrawer = (scrollToDeck) => {
    byId('previewPane').classList.remove('open');
    closeTableMenu();
    byId('logPane').classList.remove('hidden');
    if (scrollToDeck) openTableDeck();
    else mbSync();
  };
  function toggleCardPeek() { // พรีวิวการ์ดที่แตะล่าสุด
    const pv = byId('previewPane');
    if (!pv.classList.contains('open') && !previewId) { toast('แตะการ์ดใบไหนก็ได้ก่อน แล้วกดปุ่มการ์ดเพื่อดูภาพเต็ม + ความสามารถ', 3000); return; }
    byId('logPane').classList.add('hidden');
    pv.classList.toggle('open'); mbSync();
  }
  byId('mbCard').onclick = toggleCardPeek;
  const btnCardPeek = byId('btnCardPeek');
  if (btnCardPeek) btnCardPeek.onclick = toggleCardPeek;
  byId('mbEnd').onclick = () => doEndTurn();
  byId('mbDeck').onclick = () => {
    const m = byId('tableMenu');
    if (m && !m.classList.contains('hidden')) { closeTableMenu(); mbSync(); }
    else openTableDeck();
  };
  byId('mbLog').onclick = () => { const lg = byId('logPane'); lg.classList.contains('hidden') ? openDrawer(false) : (lg.classList.add('hidden'), mbSync()); };
  // แนะนำหมุนจอ (มือถือแนวตั้ง) — กดข้ามแล้วจำไว้
  try { if (localStorage.getItem('bot_rot_skip')) byId('rotateHint').classList.add('off'); } catch (e) { }
  byId('btnRotateSkip').onclick = () => {
    byId('rotateHint').classList.add('off');
    try { localStorage.setItem('bot_rot_skip', '1'); } catch (e) { }
  };

  // ── เต็มจอ + คีย์ลัด (เดสก์ท็อป) ──
  function toggleFull() { try { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); } catch (e) { } }
  byId('btnFull').onclick = toggleFull;
  function toggleClean() {
    closeTableMenu();
    const on = byId('table').classList.toggle('clean');
    byId('btnClean').textContent = on ? '🖼 แสดง UI' : '🖼 ซ่อน UI';
  }
  byId('btnClean').onclick = toggleClean;
  document.addEventListener('keydown', e => {
    if (byId('table').classList.contains('hidden')) return;                 // เฉพาะตอนอยู่หน้าโต๊ะ
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; // ไม่ชนช่องพิมพ์แชท
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!st) return;
    const map = {
      'enter': () => doEndTurn(),
      'd': () => byId('btnDice').click(),
      'c': () => byId('btnCoin').click(),
      'l': () => { closeTableMenu(); byId('logPane').classList.toggle('hidden'); },
      'f': toggleFull,
      'h': toggleClean,
      'escape': () => {
        const pv = byId('previewPane');
        if (pv && pv.classList.contains('open')) { closeCardPeek(); return; }
        if (announceSrc) { announceSrc = null; announceKind = 'use'; render(); toast('ยกเลิกการชี้เป้า'); return; }
        const sk = byId('btnPromptSkip');
        if (!sk.classList.contains('hidden')) sk.click();
        else if (Object.keys(selMap).length) { selMap = {}; render(); }
      },
    };
    const fn = map[e.key.toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  });

  /* ── ออกจากโต๊ะ / กลับเมนู (solo = เคลียร์เกม · online = ออกจากห้อง) ── */
  function goHomeFromTable() {
    if (st && !st.over) {
      const msg = mode === 'online'
        ? 'ออกจากห้องและกลับเมนูหลัก? (เกมของอีกฝั่งอาจหยุด)'
        : 'กลับเมนูหลัก? กระดานปัจจุบันจะหาย';
      if (!confirm(msg)) return;
    }
    if (mode === 'online') leaveOnline();
    else { mode = null; st = null; realMode = false; soloBot = false; clearPersistedTable(); showScreen('menu'); }
  }
  function syncTableNav() {
    const homeTitle = mode === 'online' ? 'ออกจากห้องกลับเมนูหลัก' : 'กลับเมนูหลัก';
    const topHome = byId('btnHomeTop');
    if (topHome) topHome.title = homeTitle;
    const spec = mode === 'online' && seat === 'S';
    const endTop = byId('btnEnd');
    if (endTop) endTop.classList.toggle('hidden', spec);
  }

  function deckSpecSafe(getter) {
    let d = null;
    try { d = typeof getter === 'function' ? getter() : getter; } catch (e) { d = null; }
    if (d && d.spec && typeof d.spec === 'object') return d;
    if (d && (d.main || d.life)) return { name: d.name || 'เด็ค', spec: { main: d.main || {}, life: d.life || {} } };
    const fb = starterDeck('SD01') || starterDeck('SD04') || starterDeck('KD04');
    if (fb && fb.spec) return fb;
    return { name: 'สำรอง', spec: { main: {}, life: {} } };
  }
  /* รีแมตช์โหมดซ้อม/บอท — ซ่อนจอจบก่อน แล้วสร้างกระดานใหม่ผ่าน startTable */
  function rematchSolo() {
    byId('endOv').classList.add('hidden');
    byId('endAsk').classList.add('hidden');
    byId('rematchAsk').classList.add('hidden');
    clearTimeout(botT); botT = null;
    if (typeof clearAutoResolveAtk === 'function') clearAutoResolveAtk();
    botFailKeys = new Set();
    const finish = (cards) => {
      try {
        if (cards && cards.length) soloCards = cards;
        if (!soloCards || !soloCards.length)
          throw new Error('ยังโหลดข้อมูลการ์ดไม่ครบ');
        const act = deckSpecSafe(activeDeckSpec);
        const oppD = deckSpecSafe(oppDeckSpec);
        seat = 'A';
        my = 'A'; opp = 'B';
        st = BoTEngine.buildInitialState(soloCards, Math.random, { A: act.spec, B: oppD.spec });
        if (soloBot) st.skipLethalPlead = true;
        selMap = {};
        mullMode = false;
        gameStart = Date.now();
        startTable();
        persistUI(true);
        toast('รีแมตช์ — เริ่มเกมใหม่');
      } catch (err) {
        console.error('rematchSolo', err);
        toast('รีแมตช์ไม่สำเร็จ — ' + ((err && err.message) || 'ลองกลับเมนูแล้วเริ่มใหม่'), 4500);
        if (st && st.over) byId('endOv').classList.remove('hidden');
      }
    };
    if (soloCards && soloCards.length) {
      finish(soloCards);
      return;
    }
    Promise.all([ensurePlayReady(), CardDB.load()])
      .then(([, db]) => finish((db && (db.all || db.cards)) || []))
      .catch(() => {
        toast('โหลดการ์ดไม่สำเร็จ — กลับเมนูแล้วเริ่มใหม่', 4000);
        if (st && st.over) byId('endOv').classList.remove('hidden');
      });
  }

  /* ── จบเกม / รีแมตช์ ── */
  byId('btnEnd').onclick = () => {
    if (!st) return;
    if (seat === 'S') { toast('ผู้ชมประกาศจบเกมไม่ได้'); return; }
    byId('endAsk').classList.remove('hidden');
  };
  byId('btnHomeTop').onclick = goHomeFromTable;
  byId('askCancel').onclick = () => byId('endAsk').classList.add('hidden');
  function declareEnd(winner) {
    byId('endAsk').classList.add('hidden');
    if (mode === 'solo') showEnd(winner, '');
    else if (netKind === 'lan') {
      if (lanIsHost) {
        const nickW = (roomSt && roomSt[winner] && roomSt[winner].nick) || '';
        lanSend({ t: 'end', winner, nick: nickW });
        showEnd(winner, nickW);
      } else lanSend({ t: 'end', winner });
    } else wsSend({ t: 'end', winner });
  }
  byId('askMeWin').onclick = () => declareEnd(mode === 'solo' ? 'A' : my);
  byId('askOppWin').onclick = () => declareEnd(mode === 'solo' ? 'B' : opp);
  byId('askDraw').onclick = () => declareEnd('draw');
  byId('btnRematch').onclick = () => {
    if (mode === 'solo') {
      rematchSolo();
    } else if (netKind === 'lan') {
      byId('endOv').classList.add('hidden');
      if (lanIsHost) lanHostRematch();
      else lanSend({ t: 'rematch' });
    } else {
      byId('endOv').classList.add('hidden');
      if (ws && ws.readyState === 1) wsSend({ t: 'rematch' });
      else {
        toast('ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — กลับห้อง/เมนูแล้วเริ่มใหม่', 4000);
        byId('endOv').classList.remove('hidden');
      }
    }
  };
  byId('btnEndMenu').onclick = goHomeFromTable;

  /* ── เมนูหลัก + ล็อบบี้ + ห้องรอ ── */
  try { byId('inpNick').value = localStorage.getItem('bot_nick') || ''; } catch (e) { }
  function myNick() {
    nick = byId('inpNick').value.trim();
    try { if (nick) localStorage.setItem('bot_nick', nick); } catch (e) { }
    return nick;
  }
  // ถ้าโลโก้โหลดไม่ได้ → กลับไปโชว์ตัวหนังสือชื่อเกม
  (function () {
    const logo = byId('menuLogo'); if (!logo) return;
    logo.addEventListener('error', () => { logo.style.display = 'none'; byId('menuTitleFallback').style.display = 'block'; });
    if (logo.complete && logo.naturalWidth === 0) logo.dispatchEvent(new Event('error'));
  })();

  /* ── ล็อกอิน / สมัครสมาชิก ── */
  let authMode = 'login';
  const authToken = () => { try { return localStorage.getItem('bot_auth_token') || ''; } catch (e) { return ''; } };
  function setAuthUI(username) {
    const on = !!username;
    byId('btnLogin').classList.toggle('hidden', on);
    byId('userChip').classList.toggle('hidden', !on);
    if (on) { byId('userName').textContent = username; try { localStorage.setItem('bot_user', username); } catch (e) { } if (byId('inpNick') && !byId('inpNick').value) byId('inpNick').value = username; }
    if (window.BotSkins) BotSkins.setLoggedIn(on);
  }
  async function checkAuth() {
    const t = authToken(); if (!t) return setAuthUI(null);
    try { const r = await fetch('/auth/me', { headers: { Authorization: 'Bearer ' + t } }); const j = await r.json(); setAuthUI(j.ok ? j.username : null); if (!j.ok) localStorage.removeItem('bot_auth_token'); }
    catch (e) { setAuthUI(null); }
  }
  function setAuthTab() {
    const reg = authMode === 'register';
    byId('tabLogin').classList.toggle('on', !reg); byId('tabRegister').classList.toggle('on', reg);
    byId('authTitle').textContent = reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
    byId('authSubmit').textContent = reg ? 'สมัคร' : 'เข้าสู่ระบบ';
    byId('authPass').autocomplete = reg ? 'new-password' : 'current-password';
  }
  function openAuth(m) { authMode = m || 'login'; setAuthTab(); byId('authMsg').textContent = ''; byId('authUser').value = ''; byId('authPass').value = ''; byId('authModal').classList.remove('hidden'); setTimeout(() => byId('authUser').focus(), 60); }
  const closeAuth = () => byId('authModal').classList.add('hidden');
  async function submitAuth() {
    const u = byId('authUser').value.trim(), pw = byId('authPass').value;
    if (!u || !pw) { byId('authMsg').textContent = 'กรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
    byId('authSubmit').disabled = true;
    try {
      const r = await fetch('/auth/' + (authMode === 'register' ? 'register' : 'login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
      const j = await r.json();
      if (j.ok) { try { localStorage.setItem('bot_auth_token', j.token); } catch (e) { } setAuthUI(j.username); closeAuth(); toast('👤 สวัสดี ' + j.username); }
      else byId('authMsg').textContent = j.error || 'ไม่สำเร็จ';
    } catch (e) { byId('authMsg').textContent = 'เชื่อมต่อไม่ได้'; }
    byId('authSubmit').disabled = false;
  }
  byId('btnLogin').onclick = () => openAuth('login');
  byId('btnLogout').onclick = () => { try { localStorage.removeItem('bot_auth_token'); localStorage.removeItem('bot_user'); } catch (e) { } setAuthUI(null); toast('ออกจากระบบแล้ว'); };
  if (window.BotSkins) {
    BotSkins.setOnNeedLogin(() => { toast('ล็อกอินก่อนจึงนำเข้าสกินได้'); openAuth('login'); });
    BotSkins.setLoggedIn(!!authToken());
  }
  byId('tabLogin').onclick = () => { authMode = 'login'; setAuthTab(); };
  byId('tabRegister').onclick = () => { authMode = 'register'; setAuthTab(); };
  byId('authSubmit').onclick = submitAuth;
  byId('authClose').onclick = closeAuth;
  byId('authCancel').onclick = closeAuth;
  byId('authModal').addEventListener('click', e => { if (e.target.id === 'authModal') closeAuth(); });
  byId('authPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  checkAuth();
  // เลือกปฏิบัติ modal
  byId('choiceX').onclick = () => closeChoicePopup();
  byId('choiceCancel').onclick = () => closeChoicePopup();
  byId('choiceModal').addEventListener('click', e => {
    if (e.target.id !== 'choiceModal') return;
    if (choiceGhostClick() && choiceCtx && choiceCtx.fromPrompt) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    closeChoicePopup();
  });
  byId('choiceOptions').addEventListener('click', e => {
    const l = e.target.closest('[data-opt]'); if (!l || !choiceCtx) return;
    choiceCtx.sel = +l.getAttribute('data-opt'); renderChoiceOpts();
  });
  byId('choiceConfirm').onclick = () => {
    if (!choiceCtx) return;
    const { k, sel, opts } = choiceCtx;
    const owner = BoTEngine.ownerOf(st, k);
    sendAction({ type: 'chooseMode', k, opt: sel, label: opts[sel], by: mode === 'solo' ? (owner === 'S' ? my : owner) : undefined });
    closeChoicePopup(true);
  };

  function syncHomeBtn() {
    const home = byId('btnHome');
    const back = byId('btnBack');
    const play = byId('menuPlay');
    const onNotebook = curScreen === 'menu' || curScreen === 'lobby' || curScreen === 'lanHall' || curScreen === 'room';
    const onMenuHome = curScreen === 'menu' && (!play || play.classList.contains('hidden'));
    const showChrome = onNotebook && !onMenuHome;
    if (home) home.classList.toggle('hidden', !showChrome);
    if (back) back.classList.toggle('hidden', !showChrome);
    document.body.classList.toggle('has-back', showChrome);
  }
  function goHomeNotebook() {
    if (curScreen === 'table') { goHomeFromTable(); return; }
    if (curScreen === 'room') { leaveOnline(); return; }
    try { stopPresence(); } catch (e) { }
    showScreen('menu');
  }
  function goBackNotebook() {
    if (curScreen === 'menu') {
      const bot = byId('menuBotSetup');
      const solo = byId('menuSoloSetup');
      const real = byId('menuRealSetup');
      if ((bot && !bot.classList.contains('hidden')) ||
          (solo && !solo.classList.contains('hidden')) ||
          (real && !real.classList.contains('hidden'))) {
        showMenuPlayModes();
        return;
      }
      showMenuHome();
      return;
    }
    if (curScreen === 'room') { leaveOnline(); return; }
    if (curScreen === 'lobby' || curScreen === 'lanHall') {
      try { stopPresence(); } catch (e) { }
      showScreen('menu');
      return;
    }
    if (curScreen === 'deckbuilder') {
      showScreen('decks');
      try { if (window.openDeckList) window.openDeckList(); } catch (e) { }
      return;
    }
    if (curScreen === 'table') { goHomeFromTable(); return; }
    showScreen('menu');
  }

  function showMenuHome() {
    byId('menuHome').classList.remove('hidden');
    byId('menuPlay').classList.add('hidden');
    syncHomeBtn();
  }
  function showMenuPlayModes() {
    const modes = byId('menuPlayModes');
    const solo = byId('menuSoloSetup');
    const bot = byId('menuBotSetup');
    const real = byId('menuRealSetup');
    if (modes) modes.classList.remove('hidden');
    if (solo) solo.classList.add('hidden');
    if (bot) bot.classList.add('hidden');
    if (real) real.classList.add('hidden');
    syncHomeBtn();
  }
  function showMenuPlay() {
    byId('menuHome').classList.add('hidden');
    byId('menuPlay').classList.remove('hidden');
    showMenuPlayModes();
    syncHomeBtn();
    ensurePlayReady().then(() => fillMenuDeckSelects()).catch(() => fillMenuDeckSelects());
  }
  byId('mnuPlay').onclick = () => showMenuPlay();
  byId('btnHome').onclick = goHomeNotebook;
  byId('btnBack').onclick = goBackNotebook;
  // โหมดออนไลน์ — ปุ่มถูกคอมเมนต์ใน HTML ไว้ก่อน (อย่าลบ handler)
  const mnuOnline = byId('mnuOnline');
  if (mnuOnline) mnuOnline.onclick = () => { ensurePlayReady().catch(() => { }); showScreen('lobby'); };
  byId('mnuLan').onclick = () => {
    // เข้าโหมด LAN → เลือกเด็คในล็อบบี้ แล้วค่อยท้า/จับคู่
    ensurePlayReady().catch(() => { });
    openLanHall();
  };
  byId('btnLanHallBack').onclick = () => {
    stopPresence();
    showScreen('menu');
  };
  byId('btnLanByCode').onclick = () => {
    // คง presence ไว้ได้ แต่ไปหน้าสร้าง/เข้าด้วยรหัส
    ensurePlayReady().catch(() => { });
    showScreen('lobby');
    const msg = byId('lobbyMsg');
    if (msg) msg.textContent = 'โหมด LAN ด้วยรหัส — กด "สร้างห้อง LAN" หรือใส่รหัสแล้วกด "เข้า LAN"';
  };
  const lanPeerList = byId('lanPeerList');
  if (lanPeerList) lanPeerList.addEventListener('click', (e) => {
    const challenge = e.target.closest('[data-challenge]');
    if (challenge) {
      tryChallengePeer(+challenge.getAttribute('data-challenge'), challenge.getAttribute('data-nick') || '');
      return;
    }
    const cancel = e.target.closest('[data-cancel-challenge]');
    if (cancel) {
      presenceSend({ t: 'challengeCancel' });
      outgoingChallenge = null;
      setLanHallStatus('ยกเลิกคำท้าแล้ว');
      renderLanPeerList();
    }
  });
  const selLanDeck = byId('selLanDeck');
  if (selLanDeck) selLanDeck.onchange = () => {
    try { localStorage.setItem('bot_active_deck', selLanDeck.value); } catch (e) { }
  };
  const inpLanNick = byId('inpLanNick');
  if (inpLanNick) {
    inpLanNick.addEventListener('change', () => {
      const n = lanHallNick();
      presenceSend({ t: 'nick', nick: n });
    });
    inpLanNick.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = lanHallNick();
        presenceSend({ t: 'nick', nick: n });
      }
    });
  }
  const lanChallengeAccept = byId('lanChallengeAccept');
  const lanChallengeDecline = byId('lanChallengeDecline');
  if (lanChallengeAccept) lanChallengeAccept.onclick = acceptLanChallenge;
  if (lanChallengeDecline) lanChallengeDecline.onclick = declineLanChallenge;
  const lanChallengeModal = byId('lanChallengeModal');
  if (lanChallengeModal) lanChallengeModal.addEventListener('click', (e) => {
    if (e.target.id === 'lanChallengeModal') declineLanChallenge();
  });
  byId('mnuDeck').onclick = () => {
    ensureTools().then(() => { showScreen('decks'); window.openDeckList(); });
  };
  byId('mnuGallery').onclick = () => {
    ensureTools().then(() => { showScreen('gallery'); window.openGallery(); });
  };
  byId('mnuHowTo').onclick = () => {
    ensureHowto().then(() => { showScreen('howto'); byId('howto').scrollTop = 0; });
  };
  byId('hwBack').onclick = () => showScreen('menu');
  // บนโต๊ะเปิดคู่มือเป็นแท็บใหม่ จะได้ไม่ทิ้งเกมที่เล่นค้างอยู่
  byId('btnHowToTop').onclick = () => window.open(location.pathname + '#howto', '_blank');
  function activeDeckSpec() { // เด็คหลักที่เซฟไว้ / starter ที่เลือก
    try {
      const name = localStorage.getItem('bot_active_deck');
      if (name) return resolveDeckChoice(name);
    } catch (e) { }
    return starterDeck('SD01');
  }
  function oppDeckSpec() {
    try {
      const name = localStorage.getItem('bot_opp_deck');
      if (name) return resolveDeckChoice(name);
    } catch (e) { }
    return starterDeck('SD01');
  }
  function startSoloMatch() {
    Promise.all([ensurePlayReady(), CardDB.load()]).then(([, db]) => {
      soloCards = db.all;
      const act = menuDeckA();
      const opp = menuDeckB();
      try {
        localStorage.setItem('bot_active_deck', byId('selMenuDeck').value);
        localStorage.setItem('bot_opp_deck', byId('selMenuDeckB').value);
      } catch (e) { }
      mode = 'solo'; seat = 'A'; realMode = false; soloBot = false;
      st = BoTEngine.buildInitialState(db.all, Math.random, {
        A: act.spec,
        B: opp.spec
      });
      toast(`ฝั่ง A: ${act.name} · ฝั่ง B: ${opp.name}`);
      gameStart = Date.now(); selMap = {};
      startTable();
    }).catch(() => toast('โหลดข้อมูลการ์ดไม่สำเร็จ'));
  }
  function startBotMatch() {
    Promise.all([ensurePlayReady(), CardDB.load()]).then(([, db]) => {
      soloCards = db.cards || db.all;
      setBotLevel(getBotLevel());
      const you = resolveDeckChoice(byId('selBotDeckYou').value) || starterDeck('SD01');
      const botD = resolveDeckChoice(byId('selBotDeckBot').value) || starterDeck('SD01');
      try {
        localStorage.setItem('bot_active_deck', byId('selBotDeckYou').value);
        localStorage.setItem('bot_opp_deck', byId('selBotDeckBot').value);
      } catch (e) { }
      mode = 'solo'; seat = 'A'; realMode = false; soloBot = true;
      st = BoTEngine.buildInitialState(db.all, Math.random, {
        A: you.spec,
        B: botD.spec
      });
      st.skipLethalPlead = true;
      botFailKeys = new Set();
      botFailTurn = -1;
      const lvLabel = botLevel === 'easy' ? 'ง่าย' : botLevel === 'hard' ? 'ยาก' : 'ปานกลาง';
      toast(`🤖 คุณ: ${you.name} · บอท(${lvLabel}): ${botD.name}`);
      gameStart = Date.now(); selMap = {};
      startTable();
    }).catch(() => toast('โหลดข้อมูลการ์ดไม่สำเร็จ'));
  }
  function openPlaySetup(which) {
    byId('menuPlayModes').classList.add('hidden');
    byId('menuBotSetup').classList.toggle('hidden', which !== 'bot');
    byId('menuSoloSetup').classList.toggle('hidden', which !== 'solo');
    byId('menuRealSetup').classList.toggle('hidden', which !== 'real');
    syncHomeBtn();
    ensurePlayReady().then(() => fillMenuDeckSelects()).catch(() => fillMenuDeckSelects());
  }
  byId('mnuBot').onclick = () => openPlaySetup('bot');
  byId('btnBotStart').onclick = () => startBotMatch();
  const btnBotPick = byId('btnBotPickDeck');
  if (btnBotPick) btnBotPick.onclick = () => applyBestBotDeck();
  const selBotLv = byId('selBotLevel');
  if (selBotLv) selBotLv.onchange = () => {
    setBotLevel(selBotLv.value);
    if (getBotLevel() === 'hard') {
      const botBot = byId('selBotDeckBot');
      if (botBot && STARTERS && STARTERS[HARD_BOT_DECK_KEY]) {
        botBot.value = hardBotDeckVal();
        try { localStorage.setItem('bot_opp_deck', hardBotDeckVal()); } catch (e) { }
      }
    }
  };
  byId('mnuSolo').onclick = () => openPlaySetup('solo');
  byId('btnSoloStart').onclick = () => startSoloMatch();
  /* 🎴 เล่นกับคนที่ใช้การ์ดจริง — ใช้เอนจินเดียวกับซ้อมมือ (ไม่มีกติกาใหม่)
     ต่างกันแค่ preset: สนามฝั่งเดียวเปิดให้เลย + บอกวิธีแชร์จอ เพื่อไม่ต้องมานั่งกดปุ่มเอง */
  function startRealMatch() {
    Promise.all([ensurePlayReady(), CardDB.load()]).then(([, db]) => {
      soloCards = db.all;
      const act = menuRealDeck();
      try { localStorage.setItem('bot_active_deck', byId('selRealDeck').value); } catch (e) { }
      mode = 'solo'; seat = 'A';
      st = BoTEngine.buildInitialState(db.all, Math.random, { A: act.spec, B: starterDeck('SD01').spec });
      gameStart = Date.now(); selMap = {};
      realMode = true; soloBot = false;
      startTable();
      toast(`🎴 โหมดการ์ดจริง · ใช้เด็ค "${act.name}" — กด 📺 บานสนาม แล้วแชร์เฉพาะหน้าต่างนั้นใน Discord`, 11000);
    }).catch(() => toast('โหลดข้อมูลการ์ดไม่สำเร็จ'));
  }
  byId('mnuReal').onclick = () => openPlaySetup('real');
  byId('btnRealStart').onclick = () => startRealMatch();
  byId('btnLobbyBack').onclick = () => {
    stopPresence();
    showScreen('menu');
  };
  byId('btnCreate').onclick = () => { byId('lobbyMsg').textContent = 'กำลังสร้างห้อง…'; realMode = false; connect(() => wsSend({ t: 'create', nick: myNick(), uid: myUid() })); };
  byId('btnCreateLan').onclick = () => startLanHost();
  function joinRoom(as) {
    const code = byId('inpRoom').value.trim().toUpperCase();
    if (code.length !== 6) { byId('lobbyMsg').textContent = 'รหัสห้องต้องมี 6 ตัวอักษร'; return; }
    byId('lobbyMsg').textContent = 'กำลังเข้าห้อง…'; realMode = false;
    connect(() => wsSend({ t: 'join', room: code, nick: myNick(), as, uid: myUid() }));
  }
  byId('btnJoin').onclick = () => joinRoom('player');
  byId('btnJoinLan').onclick = () => joinLanRoom(byId('inpRoom').value);
  byId('btnSpec').onclick = () => joinRoom('spec');
  byId('btnInviteRoom').onclick = copyInvite;
  byId('selDeck').onchange = () => {
    try { localStorage.setItem('bot_active_deck', byId('selDeck').value); } catch (e) { }
    if (myReady) {
      myReady = false;
      if (netKind === 'lan') {
        if (lanIsHost) {
          roomSt.A.ready = false; lanDecks.A = null; lanBroadcastRoom();
        } else lanSend({ t: 'ready', ready: false });
      } else wsSend({ t: 'ready', ready: false });
      renderRoom();
    }
  };
  const selMenuA = byId('selMenuDeck');
  const selMenuB = byId('selMenuDeckB');
  const selRealDeck = byId('selRealDeck');
  if (selMenuA) selMenuA.onchange = () => {
    try { localStorage.setItem('bot_active_deck', selMenuA.value); } catch (e) { }
  };
  if (selMenuB) selMenuB.onchange = () => {
    try { localStorage.setItem('bot_opp_deck', selMenuB.value); } catch (e) { }
  };
  if (selRealDeck) selRealDeck.onchange = () => {
    try { localStorage.setItem('bot_active_deck', selRealDeck.value); } catch (e) { }
  };
  byId('btnReady').onclick = () => {
    myReady = !myReady; renderRoom();
    const d = selectedDeck();
    if (netKind === 'lan') {
      if (lanIsHost) {
        roomSt.A.ready = myReady;
        roomSt.A.deckName = d ? d.name : '';
        roomSt.A.nick = myNick() || roomSt.A.nick;
        if (myReady) rememberSkins('A', mySkinPayload());
        lanDecks.A = myReady && d ? d.spec : null;
        lanBroadcastRoom();
        renderRoom();
      } else {
        lanSend({ t: 'ready', ready: myReady, deck: d ? d.spec : null, deckName: d ? d.name : '', skins: mySkinPayload() });
      }
    } else {
      wsSend({ t: 'ready', ready: myReady, deck: d ? d.spec : null, deckName: d ? d.name : '', skins: mySkinPayload() });
    }
  };
  byId('btnStart').onclick = () => {
    if (netKind === 'lan') {
      if (lanIsHost) lanHostStartGame();
      else lanSend({ t: 'start' });
    } else wsSend({ t: 'start' });
  };
  byId('btnLeaveRoom').onclick = leaveOnline;

  const lanDropLeaveBtn = byId('lanDropLeave');
  const lanDropActionBtn = byId('lanDropAction');
  if (lanDropLeaveBtn) lanDropLeaveBtn.onclick = () => {
    if (lanDropMode === 'reconnect') leaveOnline();
    else finishLanPeerGone();
  };
  if (lanDropActionBtn) lanDropActionBtn.onclick = () => {
    if (lanDropMode === 'reconnect') tryLanReconnect();
    else if (lanDropMode === 'wait' && !lanDropWaiting) startLanDropCountdown();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (lanDropMode === 'reconnect' && !lanReconnecting && room && !lanIsHost) tryLanReconnect();
  });

  /* ── ⬍ สนามฝั่งเดียว: ซ่อนเสื่อฝั่งตรงข้าม เหลือสนามเราใบเดียว ──
     หน้านี้ต่างจากบานสนาม: มันถูกจำกัดด้วย "ความสูง" (มีแผงพรีวิว+log ขนาบข้าง)
     เลยคำนวณความสูงเสื่อจากพื้นที่จริงของ #board ไม่ใช่สูตร vw/vh ที่เดาความกว้างแผง
     เพดานอัตราส่วน 2.2:1 (จริง 3.24:1) — ยืดเกินนี้ลายเสื่อเริ่มเพี้ยนชัดและการ์ดไม่โตตามแล้ว */
  let oneSidePref = false;   // ค่าที่ผู้ใช้กดปุ่มเลือกไว้เอง (จำข้ามเกม)
  let oneSide = false;       // ค่าที่ใช้จริงตอนนี้ (realMode บังคับเปิด · ประกาศไว้บนสุดของไฟล์)
  try { oneSidePref = localStorage.getItem('bot_one_side') === '1'; } catch (e) { }
  oneSide = oneSidePref;
  const MAT_MIN_RATIO = 2.2;
  function syncOneSide() {
    const bd = byId('board');
    // ใช้ร่วมกันทั้งหน้าเล่น (#table.one-side) และบานสนาม (body.one-board)
    const on = byId('table').classList.contains('one-side') || document.body.classList.contains('one-board');
    if (!on) { bd.style.removeProperty('--matH'); syncBoardParts(); return; }
    // ★ วัดจาก #board จริง ไม่ใช่ 100vw — หน้าต่างมี zoom อยู่ สูตร vw จะคลาดกับพื้นที่จริง
    syncBoardParts();
    const handH = byId('myHandRow') ? byId('myHandRow').offsetHeight : 0;
    const availH = bd.clientHeight - handH - 6;
    const wide = bd.clientWidth - 10;
    if (availH < 60 || wide < 60) return;
    const minRatio = STREAM ? 2.7 : MAT_MIN_RATIO;   // บานสนามกว้างเต็มจอ ยืดน้อยกว่าก็พอ
    bd.style.setProperty('--matH', Math.max(170, Math.min(availH, Math.round(wide / minRatio))) + 'px');
  }
  function applyOneSide() {
    oneSide = realMode || oneSidePref;   // โหมดการ์ดจริงบังคับเปิด · โหมดอื่นตามที่ผู้ใช้ตั้ง
    byId('table').classList.toggle('one-side', oneSide);
    byId('btnOneSide').textContent = oneSide ? '⬍ สนามสองฝั่ง' : '⬍ สนามฝั่งเดียว';
    syncOneSide();
  }

  /* ── ปรับสเกลตามจอ ── */
  function onResize() {
    const table = byId('table');
    if (table.classList.contains('hidden')) return;
    const narrow = window.innerWidth <= 920;
    const portrait = narrow && window.innerHeight > window.innerWidth;
    if (narrow) byId('logPane').classList.add('hidden'); else byId('logPane').classList.remove('hidden');
    // แนวตั้ง = เลย์เอาต์ Duel Links เต็มจอ ไม่ซูมย่อ · แนวนอน/เดสก์ท็อปใช้สเกลเดิม
    if (portrait) {
      table.style.zoom = '';
      table.style.width = '';
      table.style.height = '';
    } else {
      const basis = narrow ? 700 : 1240;
      const z = Math.min(1, Math.max(.45, window.innerWidth / basis));
      table.style.zoom = z;
      table.style.width = z < 1 ? (100 / z) + 'vw' : '';
      table.style.height = z < 1 ? (100 / z) + 'vh' : '';
    }
    syncOneSide();
    layoutMyHand();
    layoutMagicZones();
    syncFieldCardScale();
    syncEndTurnFabPos();
    syncFloatBarsPos();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(() => { onResize(); if (st) { layoutMyHand(); layoutMagicZones(); } }, 120));

  /* ── 📺 บานสนาม (หน้าต่างแยกสำหรับแชร์จอใน Discord — ไม่มีมือใครโผล่) ──
     หน้าต่างหลัก = เราเล่น เห็นมือตัวเอง (ห้ามแชร์)
     บานสนาม     = สนามอย่างเดียว มือเป็นหลังการ์ด → เอาไปแชร์ใน Discord
     ซิงก์ผ่าน BroadcastChannel ในเครื่องเดียวกัน (ใช้ได้ทั้งโหมดออนไลน์และซ้อมมือ)
     ★ const STREAM ประกาศไว้บนสุดของไฟล์ เพราะ render() ใช้ด้วย */
  let bcCh;
  function bc() {
    if (bcCh === undefined) { try { bcCh = new BroadcastChannel('bot-stream'); } catch (e) { bcCh = null; } }
    return bcCh;
  }
  // ★ ลบตัวตนการ์ดในมือทิ้งก่อนส่ง — บานสนามไม่มีข้อมูลมืออยู่ในหน้าต่างเลย
  //   (กันพลาดระดับข้อมูล ไม่ใช่แค่ซ่อนด้วย CSS) · การ์ดที่กด 👁 เปิดให้ดูแล้วยังส่งตามปกติ
  function stripHands(s) {
    const c = JSON.parse(JSON.stringify(s));
    ['A', 'B'].forEach(p => (c.zones[p + '.hand'] || []).forEach(k => {
      const x = c.inst[k];
      if (x && !x.revealed) c.inst[k] = { name: '', code: '', img: '', power: '', counters: 0, faceUp: false, tapped: false };
    }));
    return c;
  }
  let streamOn = false;   // ★ ยังไม่เปิดบานสนาม = ไม่ทำอะไรเลย (ไม่ copy state ทิ้งทุกเฟรม)
  function streamPush() {
    if (!streamOn || STREAM || !st) return;
    const ch = bc(); if (!ch) return;
    try { ch.postMessage({ t: 'st', st: stripHands(st), roomSt, room, seat }); } catch (e) { }
  }

  if (STREAM) {
    document.body.classList.add('stream-win');
    document.title = 'บานสนาม — Battle of Talingchan';
    mode = 'online'; seat = 'S'; my = 'A'; opp = 'B';   // เข้าเหมือนผู้ชม → มือเป็นหลังการ์ดทั้งสองฝั่ง
    ensurePlayReady().catch(() => { });
    // 🔍 บอร์ดเดียว (ค่าเริ่มต้น) = โชว์เฉพาะสนามฝั่งเรา เต็มความกว้าง — เหมาะกับคู่ต่อสู้ที่ใช้การ์ดจริง
    let oneBoard = true;
    try { oneBoard = localStorage.getItem('bot_stream_two') !== '1'; } catch (e) { }
    const applyBoards = () => {
      document.body.classList.toggle('one-board', oneBoard);
      byId('btnStreamBoth').textContent = oneBoard ? '⬍ โชว์ 2 บอร์ด' : '⬍ โชว์บอร์ดเดียว';
      onResize();
    };
    byId('btnStreamBoth').onclick = () => {
      oneBoard = !oneBoard;
      try { localStorage.setItem('bot_stream_two', oneBoard ? '0' : '1'); } catch (e) { }
      applyBoards(); if (st) render();
    };
    applyBoards();
    const ch = bc();
    if (ch) {
      ch.onmessage = e => {
        const m = e.data || {};
        if (m.t !== 'st') return;
        const first = !st;
        ensurePlayReady().then(() => {
          st = m.st; roomSt = m.roomSt; room = m.room || '';
          if (m.seat === 'A' || m.seat === 'B') streamSide = m.seat;
          if (first) startTable(); else render();
        });
      };
      ch.postMessage({ t: 'hello' });   // ขอสนามล่าสุดจากหน้าต่างหลัก
    }
    byId('menu').innerHTML = '<div class="panel" style="margin:60px auto;max-width:520px;text-align:center">'
      + '<h2>📺 บานสนาม</h2><p class="panel-note">รอสนามจากหน้าต่างหลัก…<br>'
      + 'เปิดหน้าต่างนี้ทิ้งไว้ แล้วเลือกแชร์ <b>เฉพาะหน้าต่างนี้</b> ใน Discord</p></div>';
  } else {
    byId('btnOneSide').onclick = () => {
      oneSidePref = !oneSide; realMode = false;   // กดปุ่มเอง = เลิก override ของโหมด ผู้ใช้คุมเอง
      try { localStorage.setItem('bot_one_side', oneSidePref ? '1' : '0'); } catch (e) { }
      applyOneSide();
      if (st) render();
      toast(oneSide ? '⬍ เหลือสนามฝั่งเราใบเดียว — ฝั่งตรงข้ามซ่อนอยู่ (กดปุ่มเดิมเพื่อเอากลับ)' : '⬍ กลับมาโชว์สนามสองฝั่ง', 3500);
    };
    applyOneSide();
    const ch = bc();
    if (ch) ch.onmessage = e => { if (e.data && e.data.t === 'hello') { streamOn = true; streamPush(); } };
    byId('btnStream').onclick = () => {
      const url = location.origin + location.pathname + '?stream=1';
      const w = window.open(url, 'botStream', 'width=1280,height=800,noopener=no');
      if (!w) {   // ★ popup ถูกบล็อก — ห้ามพาหน้าต่างนี้ไปไหน ไม่งั้นเกมที่เล่นค้างหายทั้งกระดาน
        toast('⚠️ เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up ให้เว็บนี้ แล้วกดอีกครั้ง (หรือเปิดแท็บใหม่เองที่ ' + url + ')', 9000);
        return;
      }
      streamOn = true; streamPush();
      toast('📺 เปิดบานสนามแล้ว — ใน Discord กด Share Screen → แท็บ "Window" → เลือก บานสนาม (อย่าแชร์ทั้งจอ)', 8000);
    };
  }

  // เปิดหน้าคู่มือตรงจากลิงก์ — ต้องอยู่ก่อน auto-join เพราะ ?room= จะพาไปล็อบบี้แทน
  if (location.hash === '#howto' || new URLSearchParams(location.search).get('howto') === '1') {
    ensureHowto().then(() => showScreen('howto', true));
  }

  function restoreSoloTable(data) {
    return Promise.all([ensurePlayReady(), CardDB.load()]).then(([, db]) => {
      soloCards = db.all;
      mode = 'solo';
      seat = data.seat || 'A';
      realMode = !!data.realMode;
      soloBot = !!data.soloBot;
      st = data.st;
      if (soloBot && st) st.skipLethalPlead = true;
      gameStart = data.gameStart || Date.now();
      selMap = {};
      startTable(true);
      toast(soloBot ? '🤖 กู้โต๊ะเล่นกับบอทต่อจากก่อนรีเฟรช' : (realMode ? '🎴 กู้โต๊ะโหมดการ์ดจริงต่อจากก่อนรีเฟรช' : 'กู้โต๊ะซ้อมต่อจากก่อนรีเฟรช'), 2800);
    }).catch(() => { clearPersistedTable(); showScreen('menu', true); });
  }

  /* ── กู้หน้าจอ/โต๊ะหลังรีเฟรช (sessionStorage) ── */
  function restoreAfterReload() {
    if (STREAM) return false;
    const q0 = new URLSearchParams(location.search);
    const qRoom0 = q0.get('room');
    const qLan0 = q0.get('lan');
    if ((qRoom0 && qRoom0.length === 6) || (qLan0 && String(qLan0).length === 6)) {
      ensurePlayReady().catch(() => { });
      return false; // ให้ auto-join ทำงานเอง
    }
    const hash = (location.hash || '').replace(/^#/, '');
    if (['decks', 'deckbuilder', 'gallery', 'howto', 'lobby', 'lanHall'].includes(hash)) {
      if (hash === 'howto') ensureHowto().then(() => showScreen('howto', true));
      else if (hash === 'lanHall') openLanHall(true);
      else if (hash === 'decks' || hash === 'deckbuilder' || hash === 'gallery') {
        ensureTools().then(() => {
          showScreen(hash, true);
          if (hash === 'decks') window.openDeckList();
          if (hash === 'deckbuilder') window.openDeckBuilder();
          if (hash === 'gallery') window.openGallery();
        });
      } else showScreen(hash, true);
      return true;
    }
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem(SS_UI) || 'null'); } catch (e) { return false; }
    if (!data || !data.screen) return false;
    // โต๊ะซ้อม / โหมดการ์ดจริง
    if (data.screen === 'table' && data.mode === 'solo' && data.st) {
      restoreSoloTable(data);
      return true;
    }
    // ห้องออนไลน์ / LAN — เข้าใหม่ด้วยรหัสเดิม
    if ((data.screen === 'room' || data.screen === 'table') && data.mode === 'online' && data.room && data.room.length === 6) {
      ensurePlayReady().catch(() => { });
      showScreen('lobby', true);
      byId('inpRoom').value = data.room.toUpperCase();
      if (data.netKind === 'lan') {
        // โฮสต์รีเฟรช = ต้องสร้างห้องใหม่ (Peer ID เดิมใช้ต่อไม่ได้ชัวร์)
        byId('lobbyMsg').textContent = 'ห้อง LAN หลุดหลังรีเฟรช — สร้างห้องใหม่หรือเข้าด้วยรหัสโฮสต์';
        return true;
      }
      byId('lobbyMsg').textContent = 'กำลังกลับเข้าห้อง ' + data.room.toUpperCase() + '…';
      connect(() => wsSend({ t: 'join', room: data.room, nick: myNick(), as: 'player', uid: myUid() }));
      return true;
    }
    if (['lobby', 'decks', 'deckbuilder', 'gallery', 'howto'].includes(data.screen)) {
      if (data.screen === 'howto') ensureHowto().then(() => showScreen('howto', true));
      else if (data.screen === 'decks' || data.screen === 'deckbuilder' || data.screen === 'gallery') {
        ensureTools().then(() => {
          showScreen(data.screen, true);
          if (data.screen === 'decks') window.openDeckList();
          if (data.screen === 'deckbuilder') window.openDeckBuilder();
          if (data.screen === 'gallery') window.openGallery();
        });
      } else showScreen(data.screen, true);
      return true;
    }
    // hash #table แต่ session ยังมีโต๊ะ (เผื่อ screen ใน session ไม่ตรง)
    if (hash === 'table' && data.mode === 'solo' && data.st) {
      restoreSoloTable(data);
      return true;
    }
    return false;
  }

  const restored = restoreAfterReload();

  /* ── auto-join จากลิงก์เชิญ ── */
  const qParams = new URLSearchParams(location.search);
  const qLan = qParams.get('lan');
  const qRoom = qParams.get('room');
  if (!restored && qLan && String(qLan).length === 6) {
    showScreen('lobby', true);
    byId('inpRoom').value = String(qLan).toUpperCase();
    byId('lobbyMsg').textContent = 'กำลังเข้าห้อง LAN ' + String(qLan).toUpperCase() + '…';
    ensurePlayReady().then(() => joinLanRoom(qLan)).catch(() => joinLanRoom(qLan));
  } else if (!restored && qRoom && qRoom.length === 6) {
    showScreen('lobby', true);
    byId('inpRoom').value = qRoom.toUpperCase();
    byId('lobbyMsg').textContent = 'กำลังเข้าห้อง ' + qRoom.toUpperCase() + '…';
    connect(() => wsSend({ t: 'join', room: qRoom, nick: myNick(), as: 'player', uid: myUid() }));
  }

  // บันทึกก่อนปิดแท็บ/รีเฟรช
  window.addEventListener('beforeunload', () => persistUI(true));
})();
