(function () {
  const VISITOR_KEY = 'bot_visitor_id';
  const SESSION_KEY = 'bot_session_id';

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getVisitorId() {
    let vid = '';
    try { vid = localStorage.getItem(VISITOR_KEY); } catch (e) { }
    if (!vid) {
      vid = 'v_' + uuid();
      try { localStorage.setItem(VISITOR_KEY, vid); } catch (e) { }
    }
    return vid;
  }

  function getSessionId() {
    let sid = '';
    try { sid = sessionStorage.getItem(SESSION_KEY); } catch (e) { }
    if (!sid) {
      sid = 's_' + uuid();
      try { sessionStorage.setItem(SESSION_KEY, sid); } catch (e) { }
    }
    return sid;
  }

  function getDeviceType() {
    const ua = navigator.userAgent || '';
    if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getAuthToken() {
    try {
      const t = localStorage.getItem('bot_auth_token');
      if (t) return t;
    } catch (e) { }
    try {
      const m = document.cookie.match(/(?:^|;\s*)bot_auth_token=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) { }
    return '';
  }

  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const device = getDeviceType();

  function externalReferrer() {
    try {
      const ref = document.referrer || '';
      return ref && new URL(ref).host !== location.host ? ref.slice(0, 200) : '';
    } catch (e) { return ''; }
  }

  async function sendPing(action) {
    const payload = {
      visitorId,
      sessionId,
      device,
      token: getAuthToken(),
      url: window.location.pathname,
      referrer: externalReferrer(),
      action: action || null,
    };
    try {
      await fetch('/api/analytics/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (e) { }
  }

  // Initial page view event
  sendPing({ name: 'page_view', label: 'เข้าเว็บ' });

  // Heartbeat every 30 seconds — พับจอแล้วหยุด เพื่อให้ยอดออนไลน์/เวลาใช้งานตรงกับคนที่เปิดดูอยู่จริง
  setInterval(() => {
    if (!document.hidden) sendPing(null);
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sendPing(null);
  });

  // Expose global tracker
  window.BotAnalytics = {
    trackEvent: function (name, label, extra) {
      sendPing({ name: String(name || 'custom'), label: String(label || name || ''), extra: extra || null });
    }
  };
})();
