# WF5 — Data Overlay System
## Real Estate AI Automation Platform | Layer 3 Spec

**เวอร์ชัน:** 2.0 (ฉบับรวม — แทนที่ส่วนที่ 2 ของ `WF5-fix-construction-and-overlay.md`)
**คู่กับ:** `WF5-media-pipeline-spec.md` (Layer 1–2)
**อ้างอิงภาพต้นแบบ:** IG `nick.psky` / แบรนด์ P-SKY

---

## 0. หลักการที่ต้องเข้าใจก่อน

> **การ์ดข้อมูลไม่ใช่สิ่งที่ AI video model สร้างให้**
> Kling / Higgsfield เป็นแค่ image/video generator — ไม่มีความรู้เรื่อง property database ของเรา
> ราคา · ขนาดที่ดิน · เบอร์โทร · ระยะทางไปห้าง — ทั้งหมดเป็น **data-driven graphic overlay**
> ที่ต้อง composite ทับวิดีโอทีหลังด้วย FFmpeg

**ทำไมต้อง HTML → PNG → FFmpeg ไม่ใช่ `drawtext` ตรงๆ**

| | HTML → PNG | FFmpeg drawtext |
|---|---|---|
| ภาษาไทย (สระบน-ล่าง วรรณยุกต์) | ✅ เบราว์เซอร์จัดการให้ | ❌ ฝันร้าย สระลอย |
| Layout ซับซ้อน (icon + ตาราง + badge) | ✅ CSS ปกติ | ❌ ต้องคำนวณ x,y เอง |
| แก้สีแบรนด์ทีหลัง | ✅ แก้ CSS | ❌ แก้โค้ด |
| ตัดคำไทยขึ้นบรรทัดใหม่ | ✅ | ❌ |
| ความเร็ว | ช้ากว่า (~1-2s/การ์ด) | เร็ว |

ข้อเสียเดียวคือช้ากว่า ซึ่งไม่สำคัญเพราะ render แค่ 2 การ์ดต่อคลิป

---

## 1. ช่องว่างที่ต้องปิด: WF2 → WF5

**ปัญหาปัจจุบัน:** WF2 ดึงข้อมูลสถานที่ใกล้เคียงจาก Google Maps มาแล้ว แต่ **ไม่ได้ pass ต่อเข้า WF5** ทำให้ WF5 ไม่มีข้อมูลจะทำ overlay

```
WF1 (รับข้อมูลทรัพย์)
   ↓ property_id, lat, lng, size, price, contact
WF2 (Google Maps enrichment)
   ↓ nearby_places[] ← ❌ ตรงนี้ขาด ไม่ได้ส่งต่อ
WF3 (AI Analysis)
   ↓ property_score, ai_note
WF4 (Content Generation)
   ↓ caption, script
WF5 (Media Generation)  ← ✅ ต้องรับ nearby_places + property data ครบ
```

**แก้โดย:** WF5 อ่านจาก `property_enrichment` table โดยตรง (ที่ WF2 เขียนไว้แล้ว) ไม่ต้องเรียก Google Maps API ซ้ำ — ประหยัดโควต้าและเร็วกว่า

```sql
SELECT p.size_sqw, p.price_thb, p.line_id, p.phone,
       p.district, p.province, p.hero_photo_url,
       e.nearby_places, e.ai_note
FROM property p
JOIN property_enrichment e ON e.property_id = p.id
WHERE p.id = $1;
```

ถ้า `nearby_places` เป็น null → ข้าม Location Card ไปเลย ไม่ต้องเรียก API ใหม่กลางคัน (จะทำให้ job ช้าและ error ยาก debug) แล้ว log ว่า enrichment ยังไม่เสร็จ

---

## 2. การ์ดที่ 1 — Location Info Card

**ตำแหน่ง:** ช่วงกลางคลิป หลัง House Visualization ก่อน Ending Card
**ความยาว:** 4–5 วินาที

### 2.1 Data Schema

```json
{
  "headline": "ที่ดินทำเลดี",
  "subheadline": "เดินทางสะดวก ใกล้แหล่งสำคัญ",
  "nearby_places": [
    { "name": "Central Plaza",                  "icon": "mall",     "distance_m": 6000 },
    { "name": "Central Eastville",              "icon": "mall",     "distance_m": 3500 },
    { "name": "รถไฟฟ้าสายสีเหลือง สถานีภาวนา",     "icon": "train",    "distance_m": 1700 },
    { "name": "โรงพยาบาลเปาโล โชคชัยสี่",          "icon": "hospital", "distance_m": 900  },
    { "name": "วัดลาดพร้าว",                      "icon": "temple",   "distance_m": 800  }
  ],
  "footer_note": "ทำเลดี เหมาะสำหรับสร้างบ้าน หรือทำโครงการ"
}
```

### 2.2 กติกาการแสดงผล

- เก็บระยะทางเป็น **เมตร (integer)** ใน DB แล้ว format ตอน render — ไม่เก็บเป็น string
  ```
  < 1000 m  → "800 เมตร"
  ≥ 1000 m  → "3.5 กิโลเมตร"  (ทศนิยม 1 ตำแหน่ง, ตัด .0 ทิ้ง)
  ```
- แสดง **สูงสุด 5 รายการ** เรียงจากใกล้ไปไกล
- ชื่อยาวเกิน 28 ตัวอักษร → ตัดด้วย ellipsis (ระวังตัดกลางสระไทย ใช้ `Intl.Segmenter` หรือ CSS `text-overflow`)
- ถ้ามีน้อยกว่า 3 รายการ → ข้ามการ์ดนี้ (ดูแล้วโล่งเกินไป)
- `footer_note` มาจาก WF4 (AI generated) ถ้าไม่มีให้ใช้ default

### 2.3 Icon Set (เตรียมล่วงหน้า reuse ได้ทุกทรัพย์)

```
templates/overlay-icons/
  mall.svg  train.svg  hospital.svg  temple.svg
  school.svg  gas.svg  market.svg  airport.svg  pin.svg
```
Mapping จาก Google Places `types` → icon key เก็บใน `place-icon-map.json`
ถ้าไม่ match → ใช้ `pin.svg`

---

## 3. การ์ดที่ 2 — Ending Card "เจ้าของขายเอง"

**ตำแหน่ง:** 5–8 วินาทีสุดท้าย
**Layout:** แถบสีแบรนด์ด้านซ้าย + กล่องข้อมูลติดต่อสีขาวด้านล่าง ทับบนภาพที่ดิน/บ้าน

### 3.1 Data Schema

```json
{
  "badge": "เจ้าของขายเอง",
  "title": "ที่ดินแปลงสวย",
  "size_sqw": 100,
  "price_thb": 2500000,
  "location_line": "บ้านสร้าง / ตำบล / อำเภอ / จังหวัด",
  "features": [
    "ถมแล้ว ติดถนนคอนกรีต",
    "น้ำ ไฟ พร้อม",
    "ใกล้โรงเรียน ตลาด โรงพยาบาล",
    "เหมาะสร้างบ้าน รีสอร์ท คาเฟ่"
  ],
  "contact": { "phone": "081-234-5678", "line_id": "@yourline" },
  "qr_url": "https://line.me/R/ti/p/@yourline",
  "background_photo": "url_to_hero_photo",
  "footer": "สนใจนัดชมที่ดิน / สอบถามรายละเอียดเพิ่มเติม"
}
```

### 3.2 กติกาการแสดงผล

- ราคาเก็บเป็น **integer บาท** format ตอน render
  ```
  2500000  → "2,500,000 บาท"
  8500000  → "8,500,000 บาท"   (หรือ "8.5 ล้านบาท" ตาม config)
  ```
- `features` แสดงสูงสุด 4 ข้อ พร้อม checkmark
- QR code generate runtime จาก `qr_url` (ใช้ `qrcode` npm) — ไม่เก็บเป็นไฟล์ภาพ
- ถ้า `phone` ว่าง → ซ่อนทั้งแถว ไม่แสดงช่องว่าง

---

## 4. Template Structure

```
templates/
  location-card.html        ← รับ JSON, render ด้วย Puppeteer/Playwright
  ending-card.html
  brand.css                 ← สี / ฟอนต์ / spacing ทั้งหมดอยู่ที่นี่
  overlay-icons/
  fonts/
    NotoSansThai-Regular.ttf
    NotoSansThai-Bold.ttf
config/
  brand-tokens.json         ← { primary: "#C8102E", ... } inject เข้า CSS variable
  place-icon-map.json
  overlay-timing.json
```

### 4.1 กติกาสำคัญของ Template

```
✅ ขนาด canvas ต้องเท่าวิดีโอเป๊ะ (1080×1920 สำหรับ 9:16)
   → overlay จะได้วางที่ 0,0 ไม่ต้องคำนวณตำแหน่ง
✅ พื้นหลังโปร่งใส: body { background: transparent }
   → Puppeteer ต้องตั้ง omitBackground: true
✅ ฟอนต์ต้อง embed ใน HTML (@font-face + local path)
   → ห้ามพึ่งฟอนต์ระบบ ไม่งั้นบน container จะเป็นสี่เหลี่ยม
✅ ทุกสีอ่านจาก CSS variable ที่ inject จาก brand-tokens.json
   → เปลี่ยนสีแบรนด์ได้โดยไม่แก้ HTML
❌ ห้าม hardcode ข้อความไทยใน HTML — ต้องมาจาก data ทั้งหมด
```

### 4.2 Render Function

```javascript
async function renderCardToPNG(templateName, data, { width, height }) {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage']   // จำเป็นบน Docker
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const html = renderTemplate(templateName, {
    ...data,
    brand: loadBrandTokens()
  });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluateHandle('document.fonts.ready');    // ⚠️ รอฟอนต์โหลดเสร็จ

  const buffer = await page.screenshot({
    type: 'png',
    omitBackground: true                                 // ⚠️ ได้ alpha channel
  });
  await browser.close();
  return buffer;
}
```

> **`document.fonts.ready` สำคัญมาก** — ถ้าไม่รอ ฟอนต์ไทยจะยังไม่โหลดตอน screenshot ได้ภาพว่างหรือฟอนต์ fallback

### 4.3 Docker Dependencies

```dockerfile
RUN apt-get update && apt-get install -y \
    chromium fonts-noto fonts-thai-tlwg fontconfig \
    && fc-cache -fv && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

---

## 5. FFmpeg Compositing

### 5.1 กติกา Timing — ต้อง Data-Driven ห้าม Hardcode

❌ **อย่าทำแบบนี้:**
```bash
overlay=enable='between(t,12,17)'    # hardcode — พังทันทีที่คลิปยาวเปลี่ยน
```

✅ **ทำแบบนี้:** คำนวณจากความยาวจริงของวิดีโอ

```javascript
function computeOverlayTiming(videoDuration, config) {
  const endingDur  = config.endingCardDuration  || 6.0;   // วิ
  const locationDur = config.locationCardDuration || 4.5;
  const gap = 0.5;

  const endingStart   = videoDuration - endingDur;
  const locationEnd   = endingStart - gap;
  const locationStart = locationEnd - locationDur;

  if (locationStart < 3.0) {
    // คลิปสั้นเกินไป ใส่ทั้ง 2 การ์ดไม่ได้ → ตัด location card ทิ้ง
    return { location: null, ending: { start: endingStart, end: videoDuration } };
  }
  return {
    location: { start: locationStart, end: locationEnd },
    ending:   { start: endingStart,   end: videoDuration }
  };
}
```

ดึงความยาวจริงก่อนเสมอ:
```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 base_video.mp4
```

### 5.2 Composite Command (พร้อม fade in/out)

```bash
ffmpeg -y -i base_video.mp4 -i location_card.png -i ending_card.png \
  -filter_complex "\
[1:v]format=rgba,\
fade=t=in:st=${LOC_START}:d=0.4:alpha=1,\
fade=t=out:st=$((LOC_END-0.4)):d=0.4:alpha=1[loc];\
[2:v]format=rgba,\
fade=t=in:st=${END_START}:d=0.5:alpha=1[end];\
[0:v][loc]overlay=0:0:enable='between(t,${LOC_START},${LOC_END})'[v1];\
[v1][end]overlay=0:0:enable='between(t,${END_START},${END_TOTAL})'[vout]" \
  -map "[vout]" -map 0:a? \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a copy final.mp4
```

**จุดที่พลาดบ่อย**
- `format=rgba` ต้องมี ไม่งั้น alpha หาย พื้นหลังการ์ดจะเป็นสีดำทึบ
- `fade` ต้องมี `:alpha=1` ไม่งั้นมันจะ fade เป็นสีดำแทนที่จะโปร่งใส
- `overlay=0:0` ใช้ได้เพราะ PNG ขนาดเท่าวิดีโอพอดี (ตามข้อ 4.1)
- `-map 0:a?` เครื่องหมาย `?` กันพังกรณีวิดีโอยังไม่มีเสียง
- Ending Card ไม่ต้อง fade out เพราะจบพร้อมคลิป

### 5.3 ลำดับการ Composite

```
base video (5.1–5.5 concat แล้ว)
   ↓ 5.6 burn subtitle          ← ทำก่อน overlay การ์ด
   ↓ overlay Location Card
   ↓ 5.7 add BGM + voice
   ↓ 5.8 overlay Ending Card
   ↓ export 9:16 + 16:9
```

> **ซับต้องเผาก่อนการ์ด** ไม่งั้นซับจะทับอยู่บนการ์ดข้อมูล อ่านไม่ออก
> หรืออีกทาง: ตั้ง `enable` ของซับให้หยุดแสดงช่วงที่การ์ดขึ้น

---

## 6. Export 16:9 จากมาสเตอร์ 9:16

การ์ดถูกออกแบบสำหรับ 9:16 — ถ้า crop ตรงๆ เป็น 16:9 ข้อมูลจะหาย

**2 ทางเลือก:**

**A. Blurred padding (ง่าย ใช้การ์ดชุดเดิม)**
```bash
ffmpeg -y -i final_9x16.mp4 -filter_complex "\
[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,\
pad=1920:1080:(ow-iw)/2:(oh-ih)/2[fg];\
[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,\
gblur=sigma=30[bg];[bg][fg]overlay[v]" \
  -map "[v]" -map 0:a -c:v libx264 -crf 20 -c:a copy final_16x9.mp4
```

**B. Render การ์ดสองชุด (สวยกว่า แนะนำถ้าจะทำ SaaS)**
สร้าง `location-card-16x9.html` / `ending-card-16x9.html` แยก แล้ว composite ทับ base video ที่ export 16:9 มาตั้งแต่แรก

---

## 7. Checklist สำหรับ Claude Code

- [ ] เชื่อม `property_enrichment.nearby_places` จาก WF2 เข้า WF5 — **ตอนนี้ยังไม่ได้เชื่อม**
- [ ] `renderCardToPNG()` ใช้ Puppeteer + `omitBackground: true` + รอ `document.fonts.ready`
- [ ] Embed ฟอนต์ไทยใน template ด้วย `@font-face` ไม่พึ่งฟอนต์ระบบ
- [ ] ติดตั้ง `chromium` + `fonts-thai-tlwg` ใน Docker image
- [ ] Canvas PNG ขนาดเท่าวิดีโอเป๊ะ (1080×1920)
- [ ] `computeOverlayTiming()` คำนวณจาก `ffprobe` duration จริง — ห้าม hardcode
- [ ] Guard: คลิปสั้นเกินไป → ตัด Location Card ทิ้ง ไม่ให้ overlay ซ้อนกัน
- [ ] Guard: `nearby_places` < 3 รายการ → ข้ามการ์ด
- [ ] `format=rgba` + `alpha=1` ใน fade filter ทุกครั้ง
- [ ] เผาซับก่อน overlay การ์ด
- [ ] `brand-tokens.json` แยกจากโค้ด — เปลี่ยนสีแบรนด์ได้โดยไม่แก้ template
- [ ] Format ระยะทาง/ราคาตอน render ไม่เก็บเป็น string ใน DB
- [ ] QR code generate runtime ไม่เก็บเป็นไฟล์

---

## 8. เผื่อไว้สำหรับ SaaS (ขายให้โบรกเกอร์รายอื่น)

การแยก `brand-tokens.json` ออกจาก template ทำให้รองรับ multi-tenant ได้ทันที:

```json
{
  "tenant_id": "psky",
  "primary": "#C8102E",
  "secondary": "#1A1A1A",
  "accent": "#FFD700",
  "font_family": "Noto Sans Thai",
  "logo_url": "...",
  "badge_text": "เจ้าของขายเอง",
  "card_style": "bold-left-bar"
}
```

โบรกเกอร์แต่ละรายมี token ของตัวเอง → การ์ดออกมาเป็นแบรนด์ตัวเอง โดยใช้ template และโค้ดชุดเดียวกัน นี่คือจุดที่ทำให้ระบบขายได้จริง ไม่ใช่แค่ automation ส่วนตัว
