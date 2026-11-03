/* Firebase Web SDK (npm: firebase) — โปรเจกต์ bot-by-wsm-3f447 · web app "battle-of-talingchan-web"
   ไฟล์ต้นฉบับ → bundle ด้วย `npm run build` เป็น js/firebase-init.js (index.html โหลดไฟล์นั้น)
   - Authentication: Google Sign-in → ส่ง ID token ให้ server.js ตรวจ แล้วออก session ของเกม
   - Analytics: Google Analytics for Firebase (ถ้าเบราว์เซอร์รองรับ)
   หมายเหตุ: firebaseConfig ไม่ใช่ความลับ (apiKey ของ web app เปิดเผยได้ตามปกติ) */
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as analyticsSupported } from 'firebase/analytics';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDNrfOvuc4FvQ2Opo4Jdsk0RnGzP342C94',
  authDomain: 'bot-by-wsm-3f447.firebaseapp.com',
  projectId: 'bot-by-wsm-3f447',
  storageBucket: 'bot-by-wsm-3f447.firebasestorage.app',
  messagingSenderId: '805111874628',
  appId: '1:805111874628:web:ea7573eec743679b9ae811',
  measurementId: 'G-TB3GXHJP55',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.useDeviceLanguage();

let analytics = null;
analyticsSupported().then((ok) => { if (ok) analytics = getAnalytics(app); }).catch(() => { });

function provider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

/** เปิด popup Google → คืน Firebase ID token (popup ถูกบล็อก → redirect แทน) */
async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider());
    return await result.user.getIdToken();
  } catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, provider());
      return null; // หน้าจะ redirect ไป Google แล้วกลับมา → ดู consumeRedirect()
    }
    throw e;
  }
}

/** หลังกลับจาก redirect: คืน ID token ถ้ามี */
async function consumeRedirect() {
  const result = await getRedirectResult(auth);
  return result && result.user ? result.user.getIdToken() : null;
}

/** ออกจากระบบ Firebase (session ของเกมจัดการแยก) */
function signOutFirebase() {
  return signOut(auth).catch(() => { });
}

function errorMessage(e) {
  const code = (e && e.code) || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/unauthorized-domain') return 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase (Authentication › Settings › Authorized domains)';
  if (code === 'auth/network-request-failed') return 'เชื่อมต่อเครือข่ายไม่ได้';
  return 'เข้าสู่ระบบ Google ไม่สำเร็จ' + (code ? ' (' + code + ')' : '');
}

window.BotFirebase = {
  app, auth, signInWithGoogle, consumeRedirect, signOut: signOutFirebase, errorMessage,
  get analytics() { return analytics; },
};
window.dispatchEvent(new Event('botfirebase:ready'));
