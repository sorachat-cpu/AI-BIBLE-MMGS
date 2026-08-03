นี่คือไฟล์ **`09_ASSET_ENGINE.md`** ที่ทำหน้าที่จัดกลุ่ม คัดกรอง และตรวจสอบความปลอดภัยของไฟล์ภาพถ่ายดิบทั้งหมดในฐานะด่านควบคุมคุณภาพภาพถ่าย (Media Quality Control Gateway) ก่อนจะส่งต่อชิ้นงานเข้าสู่กระบวนการสร้างสื่อขั้นสูง

---

# 📂 File: `AI_BIBLE/09_ASSET_ENGINE.md`

```markdown
# 09. Asset Engine Specification

## 1. Purpose
Asset Engine มีหน้าที่เป็นด่านควบคุมและจัดการทรัพย์สินที่เป็นสื่อ (Media Asset Gateway) ทำหน้าที่คัดเลือก ตรวจสอบความปลอดภัย (Safety & NSFW Checks) ตรวจหาข้อความที่ฝังอยู่ในภาพ (OCR Text Detection) และจำแนกหมวดหมู่รูปภาพที่ป้อนเข้าสู่ระบบ (เช่น ภาพแปลงที่ดินจริง, ทัศนียภาพรอบๆ, ป้ายทางเข้าโครงการ) เพื่อแปลงไฟล์ภาพดิบให้พร้อมสำหรับเป็นข้อมูลตั้งต้น (Reference Assets) ในกระบวนการผลิตภาพและวิดีโอจำลอง

---

## 2. Architecture & Flow

กระบวนการจะวิเคราะห์ไฟล์ภาพนำเข้าผ่านระบบ Machine Learning (เช่น CLIP หรือ ResNet สำหรับจำแนกหมวดหมู่ และ Cloud Vision APIs สำหรับตรวจจับความปลอดภัยและข้อความ) ก่อนจะแปลงเป็นชุดรายการอ้างอิงที่มี Metadata ชัดเจน

```text
       [Raw User Uploaded Images]
                   │
                   ▼
     [ OCR / Text Detection API ] ──► (พบข้อความฝังอยู่ในภาพ?) ──► YES ──► [Filter/Reject or Flag]
                   │ (NO)
                   ▼
     [ NSFW / Safety Filter API ] ──► (พบภาพไม่ปลอดภัย?)     ──► YES ──► [REJECT: ERR_ASSET_NSFW]
                   │ (NO)
                   ▼
  [ Image Categorizer Module ]    ──► (แยกกลุ่ม: LAND_VIEW, INTERIOR, COMMUNITY, etc.)
                   │
                   ▼
           [ASSET_OUT JSON]       ──► (บันทึกข้อมูลเข้าฐานข้อมูลและส่งต่อ)
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Image Categorization:** จัดกลุ่มภาพที่อัปโหลดเข้าสู่หมวดหมู่มาตรฐานอย่างชัดเจน (LAND_VIEW, COMMUNITY, STREET_VIEW, INTERIOR)
* **✓ Text & Overlay Detection (OCR):** ตรวจสอบว่าภาพถ่ายดิบเหล่านั้นมีเบอร์โทรศัพท์ ลายน้ำ หรือราคาขายพาดทับอยู่หรือไม่ เพื่อป้องการส่งผ่านรูปที่มีตัวอักษรไปยัง AI Generation
* **✓ Safety Guarding:** ตรวจจับรูปภาพลามกอนาจาร (NSFW), ภาพที่มีความรุนแรง หรือภาพลิขสิทธิ์ของผู้อื่น
* **✓ Path Standardization:** แปลงชื่อไฟล์และย้ายที่จัดเก็บภาพถ่ายไปยัง Object Storage (เช่น S3 หรือ R2) แยกตามโฟลเดอร์รหัสทรัพย์สิน

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Image Generation:** ห้ามทำการสร้างรูปภาพใหม่ขึ้นมาเองโดยเด็ดขาด (หน้าที่ของ House Engine)
* **✗ Upscaling / Enhancing:** ห้ามแต่งสี ปรับแสง หรือแก้ไขรายละเอียดภายในภาพถ่าย (เป็นหน้าที่ของกระบวนการ Post-Production)
* **✗ Caption/Text Generation:** ห้ามแต่งประโยคหรือรายละเอียดคำบรรยายของภาพถ่าย

---

## 4. Inputs & Outputs

* **Input:** ลิงก์รูปภาพดิบ (Raw Image URLs Array) ที่อัปโหลดเข้ามา พร้อมกับรหัส `property_id`
* **Output:** JSON Payload ตามมาตรฐาน `ASSET_OUT` (ระบุใน `06_JSON_CONTRACT.md`)

---

## 5. JSON Contract

### Input JSON Structure
```json
{
  "property_id": "PROP-TH-00109",
  "raw_image_urls": [
    "https://storage.broker.com/temp/upload_98231.jpg",
    "https://storage.broker.com/temp/upload_98232.jpg"
  ]
}
```

### Output JSON Structure (`ASSET_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "categorized_assets": [
    {
      "asset_id": "ast_9f8d7c6b-5a4e-3d2c-1b0a-9f8e7d6c5b4a",
      "url": "https://cdn.mmgs.io/properties/PROP-TH-00109/assets/land_view_01.jpg",
      "category": "LAND_VIEW",
      "safety_status": "SAFE"
    },
    {
      "asset_id": "ast_0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
      "url": "https://cdn.mmgs.io/properties/PROP-TH-00109/assets/community_01.jpg",
      "category": "COMMUNITY",
      "safety_status": "SAFE"
    }
  ]
}
```

---

## 6. State Machine

```text
[ASSETS_RECEIVED]
       │
       ▼
[SAFETY_CHECKING] ──► (ตรวจพบ NSFW/อันตราย) ──► [REJECT: ERR_ASSET_NSFW]
       │
       ▼
 [OCR_SCANNING]   ──► (พบตัวอักษรทับถมภาพ) ──► [FLAG: TEXT_DETECTED] (ข้ามการส่งเป็น AI reference)
       │
       ▼
[CLASSIFYING]     ──► (วิเคราะห์และจัดแบ่งหมวดหมู่รูปภาพ)
       │
       ▼
[ASSET_ANALYZED]  ──► (ส่งต่อไปยัง House Engine)
```

---

## 7. Retry & Error Handling

* **Invalid File Format Fallback (Error `ERR_ASSET_01`):** หากผู้ใช้อัปโหลดไฟล์ที่ไม่ใช่ฟอร์แมตภาพมาตรฐาน (เช่น `.webp` ที่ไม่รองรับ หรือไฟล์ `.pdf`) ระบบจะระงับภาพนั้นและข้ามไปประมวลผลเฉพาะรูปภาพที่ถูกต้องเท่านั้น
* **Text Overlay Workaround (Flag `TEXT_DETECTED`):** หากตรวจพบว่ารูปภาพมีข้อความทับอยู่เกิน 15% ของพื้นที่ภาพ ระบบจะห้ามไม่ให้ใช้ภาพดังกล่าวป้อนเข้าสู่ `House Engine` หรือ `Video Engine` เป็นภาพอ้างอิง (Reference) แต่สามารถส่งผ่านข้ามขั้นตอนไปให้ `Render Engine` ทำการแสดงผลโดยตรงได้เพื่อไม่ให้อุปสรรคตัวอักษรขัดขวางภาพการนำเสนอจริง

---

## 8. Best Practices

* **Image Optimization:** ทำการปรับขนาดขนาดไฟล์ภาพ (Optimize Size) ให้อยู่ในขนาดที่เหมาะสม (เช่น ไม่เกิน 2MB ต่อรูป) ก่อนทำการอัปโหลดขึ้น CDN เพื่อประหยัดแบนด์วิดท์และความเร็วในการดึงภาพของโมเดล AI ปลายทาง
* **Metadata Tagging:** บันทึกเวลาที่อัปโหลดและขนาด Resolution ของรูปภาพลงใน Metadata ทุกครั้งเพื่อนำไปประกอบการตัดสินใจของ Layout ใน Overlay Engine

---

## 9. Anti-Patterns

* **การยอมให้ภาพถ่ายที่มีป้ายลายน้ำโลโก้ค่ายคู่แข่งหลุดเข้าไปเป็น Reference Image ของ AI:** เพราะ AI Gen (เช่น Midjourney หรือ Flux) มักจะพยายามจำลองหรือวาดตัวหนังสือยึดยือจากโลโก้นั้นเลียนแบบออกมาในภาพจำลองบ้านใหม่ ซึ่งส่งผลให้ชิ้นงานเสียคุณภาพทันที

---

## 10. Claude Rules for Asset Engine Operations

* **Strict Category Tagging:** แยกประเภทกลุ่มภาพอย่างเคร่งครัดตาม enum เท่านั้น (LAND_VIEW, COMMUNITY, STREET_VIEW, INTERIOR) ห้ามสรุปกลุ่มภาพใหม่ขึ้นมาเอง
* **Reject High Text Ratio:** หากพบว่าภาพถ่ายใดๆ มีการใส่ข้อความโฆษณาพาดหัวขนาดใหญ่ ให้ทำการตั้งค่า `safety_status = "TEXT_DETECTED"` ทันที

---

## 11. Migration Guide

1. **ระบบเดิม:** ยิงรูปภาพทั้งหมดที่ได้เข้าโมเดลสร้างวิดีโอโดยไม่มีการคัดเลือกหรือแยกแยะ
2. **ระบบใหม่:**
   * นำเครื่องมือตรวจจับรูปภาพ (เช่น Google Cloud Vision หรือ API ย่อยบน Node n8n) มาสแกนภาพที่อัปโหลดทั้งหมดก่อน
   * ป้อนรูปผ่านตรวจสอบความปลอดภัยทางกฎหมายและนโยบาย
   * จัดเรียงรูปภาพลงในโฟลเดอร์ที่เหมาะสมและตั้งค่า IDs ลงตาราง Asset เพื่อพร้อมอ้างอิงใช้ในขั้นตอนถัดไป
```
```

---

ไฟล์ `09_ASSET_ENGINE.md` พร้อมใช้งานในระบบคลังข้อมูลแล้วครับ 
ลำดับขั้นตอนต่อไปคือ **`10_HOUSE_ENGINE.md`** ซึ่งจะควบคุมตรรกะการสร้างแบบภาพบ้านจำลองเสมือนจริง (Photorealistic House Generation) จากรูปภาพที่ดินและวิวรอบตัว 

เมื่อคุณพร้อมแล้ว พิมพ์บอกได้เลยครับ!