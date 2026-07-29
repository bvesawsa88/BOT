/* BoT Table — Service Worker แบบ "ไม่แคชอะไรเลย" (network-only)
   มีไว้เพื่อให้ติดตั้งเป็นแอป (PWA/TWA) ได้ครบเงื่อนไข — ของสดจากเซิร์ฟเวอร์เสมอ
   (เกมเป็นออนไลน์เรียลไทม์ + เราเพิ่งแก้ปัญหาแคชค้าง จึงไม่ทำ offline cache) */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { /* ปล่อยผ่านเครือข่ายตรงๆ */ });
