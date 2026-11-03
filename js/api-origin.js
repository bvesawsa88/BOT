/* เลือกเซิร์ฟเวอร์ API/WebSocket ตามโดเมนที่เปิดเว็บ
   - เปิดจาก Firebase Hosting (*.web.app / *.firebaseapp.com) → หน้าเว็บเป็นไฟล์ static
     ส่วน API (/auth /api /admin /feedback /stat) และ WebSocket วิ่งไปที่ server.js บน Render
   - เปิดจาก Render / localhost / LAN → ใช้เซิร์ฟเวอร์เดียวกับหน้าเว็บเหมือนเดิม
   ต้องโหลดไฟล์นี้ "ก่อน" สคริปต์อื่นทุกตัว */
(function () {
  'use strict';
  var RENDER_ORIGIN = 'https://bot-5uph.onrender.com';
  var host = (location.hostname || '').toLowerCase();
  var onFirebaseHosting = /\.(web\.app|firebaseapp\.com)$/.test(host);
  var api = onFirebaseHosting ? RENDER_ORIGIN : '';

  window.BOT_API_ORIGIN = api;
  if (!api) return;
  window.BOT_WS_ORIGIN = api;

  var API_PATH = /^\/(auth|api|admin|feedback|stat)(\/|\?|$)/;
  function toApi(url) {
    return (typeof url === 'string' && API_PATH.test(url)) ? api + url : url;
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string') return nativeFetch(toApi(input), init);
    if (input && typeof input.url === 'string' && input.url.indexOf(location.origin + '/') === 0) {
      var rel = input.url.slice(location.origin.length);
      if (API_PATH.test(rel)) return nativeFetch(new Request(api + rel, input), init);
    }
    return nativeFetch(input, init);
  };
  window.BOT_API_URL = toApi;
})();
