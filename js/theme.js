/* โหมดมืด/สว่าง (ธีม 8-bit) — โหลดใน <head> แบบ sync เพื่อไม่ให้จอกะพริบสีผิดตอนเปิด
   ลำดับ: ค่าที่ผู้ใช้เลือกไว้ (localStorage) → ค่าเริ่มต้น "dark" */
(function () {
  var KEY = 'bot.theme';
  var root = document.documentElement;
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) { } }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#5ca8f0' : '#0b0b22');
    var b = document.getElementById('btnTheme');
    if (b) {
      var toLight = t !== 'light';
      b.innerHTML = '<span class="t-ico" aria-hidden="true">' + (toLight ? '☀' : '☾') + '</span>';
      b.title = toLight ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด';
      b.setAttribute('aria-label', b.title);
    }
  }
  var t = read() === 'light' ? 'light' : 'dark';
  apply(t);
  window.BoTTheme = {
    get: function () { return root.getAttribute('data-theme') || 'dark'; },
    set: function (v) { v = v === 'light' ? 'light' : 'dark'; save(v); apply(v); },
    toggle: function () { this.set(this.get() === 'light' ? 'dark' : 'light'); }
  };
  document.addEventListener('DOMContentLoaded', function () {
    apply(window.BoTTheme.get());
    var b = document.getElementById('btnTheme');
    if (b) b.addEventListener('click', function () { window.BoTTheme.toggle(); });
  });
})();
