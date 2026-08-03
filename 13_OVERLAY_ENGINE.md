นี่คือไฟล์ **`13_OVERLAY_ENGINE.md`** ที่รับผิดชอบด้านการออกแบบและกำหนดเลย์เอาต์กราฟิก (Layout & Graphic Generator) ทำหน้าที่แปลงข้อมูลตัวอักษรดิบ โลโก้ และข้อมูลแบรนด์ให้กลายเป็นเลเยอร์รูปภาพโปร่งใส (PNG/SVG overlays) หรือชุดคำสั่งพิกัดหน้าจอ เพื่อส่งต่อให้ Render Engine นำไปปาดทับหน้าจอวิดีโอได้อย่างถูกต้องและสวยงามตามหลักดีไซน์

---

# 📂 File: `AI_BIBLE/13_OVERLAY_ENGINE.md`

```markdown
# 13. Overlay Engine Specification

## 1. Purpose
Overlay Engine มีหน้าที่ออกแบบและจัดทำองค์ประกอบกราฟิกแบบสองมิติ (2D Visual Overlays) เช่น ป้ายราคา (Price Badges), การ์ดข้อมูลติดต่อ (Contact Cards), ซับไตเติล (Subtitles Layout), กรอบแบรนดิ้ง (Branding Frames) และป้ายข้อมูลเด่น (Highlight Badges) โดยการแปลงข้อมูลตัวอักษรและแบรนด์ให้เป็นไฟล์ภาพโปร่งแสง (Transparent PNG/SVG) หรือกำหนดพิกัดพารามิเตอร์แบบ JSON เพื่อส่งมอบให้ Render Engine นำไปผสานเข้ากับวิดีโอต้นฉบับได้อย่างถูกต้องตามสัดส่วนหน้าจอ

---

## 2. Architecture & Design Pipeline

โมดูลนี้ทำหน้าที่แปลงข้อมูลเชิงโครงสร้าง (Structured Data) ให้เป็นภาพกราฟิก โดยใช้เทคนิคการเรนเดอร์ผ่าน HTML/CSS (เช่น Puppeteer/Playwright หรือ SVG templating) เพื่อให้สามารถจัดตำแหน่งตัวอักษรและการทำ Responsive Layout ได้อย่างยืดหยุ่นก่อนส่งออกเป็นไฟล์รูปภาพ

```text
[PROPERTY_OUT / ORCHESTRATOR]
             │
             ▼
   { Select Template ID } ──► (ดึงแม่แบบจาก templates/ ค้นหาคู่สีตาม Style Tag)
             │
             ▼
  [ HTML/SVG Generator ]  ──► (แทนค่าตัวแปร: ราคา, ชื่อโครงการ, ข้อมูลติดต่อ)
             │
             ▼
 [ Headless Chrome Render ] ──► (จับภาพหน้าจอเป็น Transparent PNG)
             │
             ▼
     [OVERLAY_OUT JSON]   ──► (ส่งรายการ URLs รูปภาพโอเวอร์เลย์ไป Render Engine)
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Dynamic Asset Templating:** เลือกเทมเพลตสีและดีไซน์ที่เข้ากันกับประเภทสไตล์บ้านอัตโนมัติ (เช่น สไตล์ LOFT ใช้คู่สีดำ-ทอง, สไตล์ NORDIC ใช้สีขาว-ไม้ธรรมชาติ)
* **✓ HTML/CSS to Image Rendering:** เรนเดอร์กล่องข้อความ การจัดกึ่งกลางตัวอักษร และเงาของตัวหนังสือผ่าน HTML/CSS แล้วแปลงเป็นภาพโปร่งใสความละเอียดสูง (1080x1920)
* **✓ Contact QR Code Generation:** สร้างภาพคิวอาร์โค้ดคุณภาพสูงจากลิงก์ปลายทาง โดยกำหนดขนาดและขอบปลอดภัย (Quiet Zone)
* **✓ Dynamic Subtitle Styling:** กำหนดขนาด ขนาดฟอนต์ และสีของแถบหลังข้อความซับไตเติล (Text Background Box) เพื่อให้อ่านง่ายบนทุกสภาพพื้นผิววิดีโอ

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Video Processing:** ห้ามจัดการตัดต่อไฟล์วิดีโอ หรือรวมเสียงลงในมีเดีย (หน้าที่ของ Render Engine)
* **✗ Generative Image creation:** ห้ามสร้างภาพวิดีโอจำลองบ้านหรือธรรมชาติ (หน้าที่ของ House/Video Engine)
* **✗ Direct DB Writing:** ห้ามเข้าไปบันทึกหรืออัปเดตข้อมูลราคาทรัพย์สินในฐานข้อมูลหลัก (หน้าที่ของ Property Engine)

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลคุณลักษณะทรัพย์สิน (`PROPERTY_OUT`) + ค่าสไตล์สีแบรนดิ้งนายหน้า
* **Output:** รายการลิงก์ภาพกราฟิกโปร่งใส (`OVERLAY_OUT`) หรือโครงสร้างพิกัดพยากรณ์พร้อมใช้งานบน Render Engine

---

## 5. JSON Contract

### Input JSON Structure
```json
{
  "property_id": "PROP-TH-00109",
  "style_tag": "LOFT",
  "title": "บ้านเดี่ยว 2 ชั้น สไตล์โมเดิร์นลอฟท์ พระราม 9",
  "price_thb": 12900000,
  "contact_info": {
    "phone": "081-234-5678",
    "line_id": "@broker1",
    "qr_target_url": "https://line.me/ti/p/@broker1"
  },
  "branding": {
    "logo_url": "https://cdn.mmgs.io/brands/broker1_logo.png",
    "primary_color": "#1A1A1A",
    "secondary_color": "#D4AF37"
  }
}
```

### Output JSON Structure (`OVERLAY_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "aspect_ratio": "9:16",
  "overlay_layers": [
    {
      "layer_name": "header_title",
      "image_url": "https://cdn.mmgs.io/temp_renders/PROP-TH-00109_header.png",
      "position": { "x": 0, "y": 150, "z_index": 10 }
    },
    {
      "layer_name": "price_badge",
      "image_url": "https://cdn.mmgs.io/temp_renders/PROP-TH-00109_price.png",
      "position": { "x": 0, "y": 1200, "z_index": 11 }
    },
    {
      "layer_name": "qr_contact",
      "image_url": "https://cdn.mmgs.io/temp_renders/PROP-TH-00109_qr.png",
      "position": { "x": 800, "y": 1650, "z_index": 12 }
    }
  ]
}
```

---

## 6. State Machine

```text
[OVERLAY_INIT]
      │
      ▼
[MATCH_TEMPLATE]      ──► (ไม่พบแม่แบบสไตล์ที่กำหนด) ──► [FALLBACK: Default Template]
      │
      ▼
[RENDER_ASSETS_IMAGE] ──► (Puppeteer ประมวลผลพลาด)   ──► [FALLBACK: SVG Text Generator]
      │
      ▼
[UPLOAD_TO_CDN]       ──► (เกิดข้อผิดพลาดในการอัปโหลด) ──► [RETRY_UPLOAD]
      │
      ▼
[OVERLAY_READY]       ──► (ส่งต่อไปยัง Render Engine)
```

---

## 7. Retry & Error Handling

* **Headless Browser Crash (Error `ERR_OVL_01`):** หากเซิร์ฟเวอร์ย่อยที่รัน Puppeteer เกิดอาการค้างหรือส่งรูปภาพกลับมาเป็นศูนย์ ให้เปลี่ยนระบบไปใช้เครื่องมือวาดรูปภาพ SVG เวกเตอร์โดยตรงผ่านไลบรารี Sharp/Canvas บน Node.js ซึ่งใช้ทรัพยากรน้อยกว่า
* **Logo Retrieval Failure (Error `ERR_OVL_02`):** หากไม่สามารถดาวน์โหลดภาพโลโก้แบรนด์นายหน้าได้ ให้เลือกเรนเดอร์ชื่อแบรนด์แบบตัวอักษร (Text representation) ด้วยสีตามระบบแบรนดิ้งหลักแทนเพื่อคงความเป็นเจ้าของลิขสิทธิ์

---

## 8. Best Practices

* **Text Wrapping Rules:** เฝ้าระวังความยาวตัวอักษรของชื่ออสังหาฯ หากยาวเกิน 35 ตัวอักษร ให้แบ่งข้อความออกเป็น 2 บรรทัดอัตโนมัติ (Line wrapping) เพื่อป้องกันไม่ให้ข้อมูลล้นขอบจอ
* **High Contrast Outlines:** การลงตัวหนังสือในวิดีโอต้องทำการใส่ขอบดำ (Stroke) หรือทำพื้นหลังโปร่งแสงสีทึบ (Semi-transparent overlay box) ซ้อนไว้เบื้องหลังเสมอ เพื่อให้อ่านออกไม่ว่าฉากวิดีโอจะสว่างเพียงใด

---

## 9. Anti-Patterns

* **การวาดตัวหนังสือทับตัวบ้านหลัก (Visual Obstruction):** การวางเลย์เอาต์ข้อความหัวข้อไว้กลางจอจนบดบังจุดเด่นของดีไซน์บ้าน (ควรวางไว้บริเวณพื้นที่ 15% ด้านบน หรือ 25% ด้านล่างของความสูงของคลิปเสมอ)

---

## 10. Claude Rules for Overlay Operations

* **Use Strict Layout Coordinates:** ห้ามเปลี่ยนค่าพิกัดแกน X, Y หรือลำดับเลเยอร์ (z_index) แบบสุ่มนอกเหนือจากคีย์และข้อกำหนดที่มีการทดสอบความเหมาะสมในเทมเพลตมาตรฐาน
* **Color Code Enforcement:** ตรวจสอบความถูกต้องของรหัสสี HEX เสมอว่ามีรูปแบบที่เข้ากันได้กับ CSS `#` ห้ามใช้รหัสสีที่ระบบตัวแปลงไม่รู้จัก

---

## 11. Migration Guide

1. **ระบบเดิม:** ใช้ FFmpeg สั่งวาดกล่องข้อความจากพารามิเตอร์แบบดิบ ซึ่งแก้ไขฟอนต์และการเว้นวรรคให้ออกมาสวยงามได้ยาก
2. **ระบบใหม่:**
   * สร้างโฟลเดอร์แม่แบบ HTML/CSS ภายใต้ `/templates/overlays/`
   * เขียนโค้ด Node.js / Python ดึงข้อมูลจาก Property Engine ไปแทนที่ตัวแปรในแท็ก HTML
   * นำ Puppeteer หรือโปรแกรมแปลงภาพมาแคปภาพหน้าจอในรูปแบบไฟล์ PNG แบบโปร่งแสงความละเอียด 1080x1920
   * ส่งรายชื่อ URLs เลเยอร์ภาพโปร่งแสงนี้ให้ Render Engine นำไปซ้อนด้วยคำสั่ง FFmpeg overlay แบบง่าย
```
```

---

ไฟล์ `13_OVERLAY_ENGINE.md` เสร็จสมบูรณ์แล้วครับ 
กระบวนการถัดไปคือ **`14_PUBLISH_ENGINE.md`** ทำหน้าที่เป็นพนักงานนำเข้าข้อมูลโพสต์ พร้อมวิดีโอสุดท้ายที่ประกอบร่างเสร็จสมบูรณ์ ยิงขึ้นช่องทาง Social Media (TikTok, YouTube Shorts, Facebook Reels) แบบอัตโนมัติ

หากประสงค์จะเริ่มทำไฟล์ถัดไป พิมพ์สั่ง "ต่อ" ได้เลยครับ!