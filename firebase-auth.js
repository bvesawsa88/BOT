/* ── ตรวจสอบ Firebase Auth ID token ฝั่งเซิร์ฟเวอร์ (ไม่ใช้ dependency ภายนอก) ──
   ตามเอกสาร "Verify ID tokens using a third-party JWT library":
   - header.alg = RS256, header.kid ต้องอยู่ในใบรับรองของ securetoken@system.gserviceaccount.com
   - aud = projectId, iss = https://securetoken.google.com/<projectId>
   - exp > now, iat <= now, auth_time <= now, sub ไม่ว่าง */
'use strict';

const https = require('https');
const crypto = require('crypto');

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW_S = 60;

let certCache = { certs: null, exp: 0 };

function fetchCerts() {
  if (certCache.certs && Date.now() < certCache.exp) return Promise.resolve(certCache.certs);
  return new Promise((resolve, reject) => {
    https.get(CERTS_URL, { timeout: 10000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('certs HTTP ' + res.statusCode);
          const certs = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const m = /max-age=(\d+)/.exec(res.headers['cache-control'] || '');
          certCache = { certs, exp: Date.now() + (m ? +m[1] : 3600) * 1000 };
          resolve(certs);
        } catch (e) { reject(e); }
      });
    }).on('timeout', function () { this.destroy(new Error('certs timeout')); }).on('error', reject);
  });
}

function b64json(s) {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

/** คืน payload ของ token ถ้าถูกต้อง ไม่งั้น throw */
async function verifyIdToken(idToken, projectId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('token ไม่ถูกรูปแบบ');
  let header, payload;
  try { header = b64json(parts[0]); payload = b64json(parts[1]); }
  catch (e) { throw new Error('token ไม่ถูกรูปแบบ'); }
  if (header.alg !== 'RS256') throw new Error('alg ไม่ถูกต้อง');

  const certs = await fetchCerts();
  const pem = certs[header.kid];
  if (!pem) throw new Error('kid ไม่รู้จัก');
  const ok = crypto.createVerify('RSA-SHA256')
    .update(parts[0] + '.' + parts[1])
    .verify(pem, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('ลายเซ็นไม่ถูกต้อง');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('aud ไม่ตรงโปรเจกต์');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('iss ไม่ถูกต้อง');
  if (!(payload.exp > now - CLOCK_SKEW_S)) throw new Error('token หมดอายุ');
  if (!(payload.iat <= now + CLOCK_SKEW_S)) throw new Error('iat ไม่ถูกต้อง');
  if (!(payload.auth_time <= now + CLOCK_SKEW_S)) throw new Error('auth_time ไม่ถูกต้อง');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new Error('sub ไม่ถูกต้อง');
  return payload;
}

module.exports = { verifyIdToken };
