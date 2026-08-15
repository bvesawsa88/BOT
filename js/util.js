/* BoT — helpers ร่วมทุกหน้า (เมนู / โต๊ะ / deck builder / gallery) */
(function (root) {
  'use strict';
  const byId = id => document.getElementById(id);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const _once = Object.create(null);

  /** โหลด <script> ครั้งเดียว แล้ว cache promise */
  function loadScript(src) {
    if (_once[src]) return _once[src];
    _once[src] = new Promise((resolve, reject) => {
      const exist = document.querySelector('script[data-bot-src="' + src + '"]');
      if (exist) {
        if (exist.dataset.loaded === '1') return resolve();
        exist.addEventListener('load', () => resolve());
        exist.addEventListener('error', () => reject(new Error('script ' + src)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.botSrc = src;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = () => reject(new Error('โหลดสคริปต์ไม่สำเร็จ: ' + src));
      document.head.appendChild(s);
    });
    return _once[src];
  }

  /** โหลด <link rel=stylesheet> ครั้งเดียว */
  function loadCss(href) {
    if (_once[href]) return _once[href];
    _once[href] = new Promise((resolve, reject) => {
      if (document.querySelector('link[data-bot-href="' + href + '"]')) return resolve();
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.dataset.botHref = href;
      l.onload = () => resolve();
      l.onerror = () => reject(new Error('โหลด CSS ไม่สำเร็จ: ' + href));
      document.head.appendChild(l);
    });
    return _once[href];
  }

  const V = '20260815d';
  function asset(path) {
    return path + (path.includes('?') ? '&' : '?') + 'v=' + V;
  }

  root.BotUtil = { byId, $, esc, loadScript, loadCss, asset, CACHE_V: V };
})(typeof self !== 'undefined' ? self : this);
