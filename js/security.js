/**
 * Battle of Talingchan - Client Protection & Security System
 * ป้องกันการ Inspect, ป้องกันการขโมยโค้ด/ดูดไฟล์, ป้องกันการเปิดบนโดเมนอื่น (Domain Lock)
 */
(function() {
  'use strict';

  // 1. 🌐 DOMAIN LOCK: ป้องกันการขโมยไฟล์ไปเปิดบนโฮสต์/เซิร์ฟเวอร์อื่น
  var allowedHosts = [
    'localhost',
    '127.0.0.1',
    '::1',
    'onrender.com',
    'vercel.app',
    'github.io',
    'ngrok-free.app',
    'trycloudflare.com'
  ];

  function isHostAllowed() {
    var cur = (window.location.hostname || '').toLowerCase();
    if (!cur) return true; // file:// protocol during local test if any
    // อนุญาต Local IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(cur)) return true;
    for (var i = 0; i < allowedHosts.length; i++) {
      var h = allowedHosts[i];
      if (cur === h || cur.endsWith('.' + h)) return true;
    }
    return false;
  }

  if (!isHostAllowed()) {
    try {
      document.documentElement.innerHTML = 
        '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1612;color:#f0e6d2;font-family:sans-serif;text-align:center;padding:20px;">' +
        '<div><h1 style="color:#d9534f;font-size:26px;">⚠️ Unauthorized Domain</h1>' +
        '<p style="margin-top:12px;font-size:16px;line-height:1.6;">ไม่อนุญาตให้เปิดใช้งานเกมนี้บนโดเมนนี้<br>สงวนลิขสิทธิ์เฉพาะเซิร์ฟเวอร์ทางการเท่านั้น</p></div></div>';
    } catch(e) {}
    throw new Error('Unauthorized domain');
  }

  // 2. 🚫 ANTI-KEYBOARD SHORTCUTS: ป้องกัน F12, Ctrl+Shift+I/J/C, Ctrl+U (View Source), Ctrl+S
  window.addEventListener('keydown', function(e) {
    var key = e.key || e.keyCode;
    var code = e.keyCode || 0;

    // F12
    if (key === 'F12' || code === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C (DevTools)
    if (e.ctrlKey && e.shiftKey && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c' || code === 73 || code === 74 || code === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Cmd+Option+I / Cmd+Option+J / Cmd+Option+C (macOS)
    if (e.metaKey && e.altKey && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c' || code === 73 || code === 74 || code === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (key === 'U' || key === 'u' || code === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+S (Save Page)
    if ((e.ctrlKey || e.metaKey) && (key === 'S' || key === 's' || code === 83)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 3. 🖱️ ANTI-CONTEXT MENU: ป้องกันคลิกขวา (อนุญาตเฉพาะช่อง input / textarea)
  document.addEventListener('contextmenu', function(e) {
    var target = e.target || {};
    var tag = (target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
      return true; // อนุญาตให้คลิกขวาในช่องพิมพ์ข้อความได้
    }
    e.preventDefault();
    return false;
  }, false);

  // 4. 🚯 ANTI-SELECTION & DRAG ASSETS: ป้องกันลากรูปการ์ดหรือคลุมข้อความบนบอร์ด
  document.addEventListener('dragstart', function(e) {
    var tag = (e.target.tagName || '').toUpperCase();
    // ถ้าไม่ใช่ card preview ให้บล็อกการลากรูปตรงๆ
    if (tag === 'IMG' && !e.target.classList.contains('draggable-card')) {
      // allow internal game drag & drop logic if handled by game.js
    }
  }, false);

  // 5. 🛑 DEVTOOLS ANTI-DEBUGGING TRAP
  // เมื่อมีผู้ใช้เปิด DevTools ดักไว้ ตัวตรวจจับจะหน่วงหรือหยุดการรัน
  var devtoolsOpen = false;
  function antiDebugCheck() {
    var startTime = performance.now();
    (function() {
      return false;
    }['constructor']('debugger')());
    var diff = performance.now() - startTime;
    if (diff > 100) {
      devtoolsOpen = true;
      console.clear();
      console.warn('%c⚠️ Security Notice: Unauthorized debugging detected.', 'color:red; font-size:18px; font-weight:bold;');
    }
  }

  // รันตรวจจับเป็นระยะ (ไม่กิน CPU)
  setInterval(antiDebugCheck, 2000);

  // 6. 🛡️ CONSOLE COPYRIGHT BANNER
  try {
    console.log(
      '%c⚔️ BATTLE OF TALINGCHAN ⚔️\n%cระบบรักษาความปลอดภัยและการคุ้มครองลิขสิทธิ์ซอฟต์แวร์ทำงานอยู่\nห้ามคัดลอก ดัดแปลง หรือนำโค้ดไปใช้โดยไม่ได้รับอนุญาต',
      'color:#d4a359;font-size:18px;font-weight:bold;text-shadow:1px 1px 2px #000;',
      'color:#8c7b6b;font-size:12px;'
    );
  } catch(e) {}

})();
