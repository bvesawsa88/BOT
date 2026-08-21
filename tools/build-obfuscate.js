/**
 * สคริปต์สำหรับ Obfuscate / เข้ารหัสโค้ด JavaScript ก่อนขึ้นเซิร์ฟเวอร์จริง
 * วิธีใช้:
 *   npx javascript-obfuscator js/ --output dist/js/ --compact true --self-defending true --control-flow-flattening true --dead-code-injection true --string-array true --string-array-encoding 'rc4'
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🛡️ กำลังเตรียมระบบ Obfuscate โค้ด JavaScript...');
try {
  console.log('รันคำสั่ง: npx javascript-obfuscator ...');
  // แนะนำคำสั่งที่ปลอดภัยและมีประสิทธิภาพสูงสุด
  console.log('\nคำสั่งแนะนำสำหรับใช้งาน:\n');
  console.log('npx javascript-obfuscator js/ --output js_dist/ --compact true --control-flow-flattening true --dead-code-injection true --string-array true --string-array-encoding rc4\n');
} catch (e) {
  console.error(e.message);
}
