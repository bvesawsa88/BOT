---
name: card-data
description: >-
  Keeps Battle of Talingchan card data consistent for frame color, gem color,
  and abilities. Use when editing cards.json, gemColor, syncing from bottcg,
  fixing reprints, rebuilding abilities, or when the user mentions สีการ์ด,
  เจมสี, gemColor, ความสามารถ, or ข้อมูลการ์ด.
---

# ข้อมูลการ์ด — สี / เจม / ความสามารถ

เวลาแตะข้อมูลการ์ด ต้องให้ **สีกรอบ (`color`)** · **สีเพชร (`gemColor`)** · **ความสามารถ** ตรงกับที่พิมพ์บนการ์ด และตรงกับไฟล์ที่เอ็นจินอ่าน

## ทริกเกอร์

ใช้เมื่ออย่างใดอย่างหนึ่ง:

- แก้ `data/cards.json` / sync จาก bottcg / รีปริ้น
- พูดถึง สีการ์ด, เจมสี, `gemColor`, ความสามารถ, ข้อมูลการ์ด
- ย้าย/แก้ abilities ตามสี หรือรัน `rebuild-abilities`

## ฟิลด์สำคัญใน `cards.json`

| ฟิลด์ | ความหมาย | ค่าที่ใช้ |
|---|---|---|
| `color` | สีกรอบ = สีคอสที่ต้องจ่ายตอนอัญเชิญ | `แดง` `ฟ้า` `ม่วง` `เขียว` `ไร้สี` หรือว่าง |
| `gem` | จำนวนเจมบนการ์ด | ตัวเลข |
| `gemColor` | สีเพชรบนการ์ด (คนละอย่างกับสีกรอบ) | `แดง` `ฟ้า` `ม่วง` `เขียว` `ขาว` หรือว่าง |
| `effect` | ข้อความเอฟเฟกต์ดิบ | แหล่งความจริงของกติกาใบ |
| `keywords` / abilities | ความสามารถที่เล่นได้ | อยู่ใน `data/effects-*.json` → `data/abilities/*` |

## กติกาสี vs เจม (อย่าสับสน)

1. **สีคอส** = `color` ของใบที่ถูกอัญเชิญ  
2. **สีเจมของใบที่จ่าย** = `gemColorOf(ใบจ่าย)` ไม่ใช่สีกรอบโดยตรง  
3. **`gemColor` ว่าง** → เอ็นจิน fallback เป็น **สีการ์ด** (ไม่ถือเป็นขาว)  
4. **`ขาว` / `ใส` / `ไร้สี`** ใน `gemColor` → wild จ่ายได้ทุกสี  
5. **อย่าเดาว่าเพชรสีเดียวกับกรอบ** — หลายใบกรอบสีแต่เพชรใส (เช่น จ่ามะนาว) หรือกรอบสีหนึ่งเพชรอีกสี (เช่น เจค)

อ้างอิง runtime: `gemColorOf` / `gemPaysFor` ใน `js/engine.js` · แสดงผล UI: `gemPrintColor` ใน `js/util.js` (ขาว→แสดงว่า «ใส»)

## Checklist ก่อนแก้ / หลังแก้

คัดลอกแล้วติ๊ก:

```
- [ ] อ่านรหัส + ชื่อจาก cards.json ก่อนแตะ
- [ ] color ตรงกรอบบนการ์ด (ดูรูป CDN ถ้าไม่แน่ใจ)
- [ ] gem จำนวนตรงเพชรบนการ์ด
- [ ] gemColor ตรงสีเพชร — ใส→ขาว · เพชรสี→สีนั้น · ไม่รู้แน่=ว่างอย่าเดาเป็นขาว
- [ ] รีปริ้นชื่อเดียวกัน: Only #1 / customLimit / สีเจมที่พิมพ์เหมือนกันให้สอดคล้อง (ยกเว้นพิมพ์คนละแบบจริง เช่น KD ไร้สี)
- [ ] ความสามารถอยู่ในไฟล์หมวดถูกสี/ชนิด
- [ ] หลังเปลี่ยน color ของ Avatar/Construct → รัน rebuild-abilities
- [ ] อย่าเขียน abilities ลง cards.json โดยตรง
```

## ความสามารถต้องอยู่ไฟล์ถูกหมวด

`tools/rebuild-abilities.js` จัดตาม `type` + `color`:

| ประเภท | ไฟล์ |
|---|---|
| Avatar | `data/abilities/avatar-{red\|blue\|purple\|green\|colorless}.json` |
| Construct | `data/abilities/construct-{red\|blue\|purple\|green\|colorless}.json` |
| Magic | `data/abilities/magic-{Normal\|React\|Modification\|Land}.json` |
| Life | `data/abilities/life.json` |

แมปสี: `แดง→red` `ฟ้า→blue` `ม่วง→purple` `เขียว→green` `ไร้สี/ว่าง→colorless`

กฎเพิ่ม:

- ชื่อเดียวกันใช้ชุด abilities เดียวกัน (rebuild รวมเข้า `effects-all.json`)
- เขียนเอฟเฟกต์ลง `data/effects-{set}.json` แล้วรัน `node tools/rebuild-abilities.js`
- คีย์เวิร์ดเทคสี (สั่งใช้ / จุติ / พอดี / อัตโนมัติ ฯลฯ) ต้องสะท้อนใน `keywords` ของเอฟเฟกต์ให้ตรงข้อความบนการ์ด

## วิธีแก้สีเจมที่รู้แน่

1. ดูรูป `https://cdn.bangbon.app/cards/{CODE}.png`  
2. ใส่ค่าใน `tools/fix-gem-colors.js` (`BY_CODE` หรือ `BY_NAME_WHITE`)  
3. รัน `node tools/fix-gem-colors.js`  
4. อย่า bulk ตั้ง `gemColor: ขาว` ทั้งฐาน — เฉพาะใบที่เพชรใส/wild จริง

## Sync จาก bottcg

`tools/sync-cards-from-bottcg.js` ดึงตัวเลขหลัก (cost/gem/power/color จากไซต์)  
**ไม่แทนที่** ความรู้เรื่องสีเพชรที่แก้เอง — หลัง sync ให้รัน `fix-gem-colors.js` อีกรอบถ้ามี override

## สิ่งที่ห้าม

- สันนิษฐาน `gemColor === color`
- ใส่ `ขาว` เพราะไม่รู้ค่า (ว่างไว้ให้ fallback สีการ์ด ดีกว่าเดาผิดเป็น wild)
- ย้ายสี Avatar แล้วไม่ rebuild abilities (ใบจะค้างไฟล์สีเก่า)
- แก้แค่พิมพ์เดียวของรีปริ้นถ้าทุกพิมพ์หน้าการ์ดเหมือนกัน
