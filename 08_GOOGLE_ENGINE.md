นี่คือไฟล์ **`08_GOOGLE_ENGINE.md`** ซึ่งรับผิดชอบขั้นตอนที่สองของท่อส่งข้อมูล ทำหน้าที่ค้นหาพิกัด ละติจูด ลองจิจูด ยืนยันที่อยู่ ดึงรูปภาพดาวเทียม และ Street View จาก Google Maps API โดยมีกลไก Cache Layer คอยควบคุมเพื่อไม่ให้เกิดการเรียกใช้ API ซ้ำซ้อนและประหยัดค่าใช้จ่าย

---

# 📂 File: `AI_BIBLE/08_GOOGLE_ENGINE.md`

```markdown
# 08. Google Engine Specification

## 1. Purpose
Google Engine มีหน้าที่ระบุพิกัดทางภูมิศาสตร์ที่ถูกต้อง (Geocoding) ของอสังหาริมทรัพย์ ตรวจสอบความถูกต้องของที่อยู่ และจัดหาทรัพยากรภาพถ่ายแผนที่ดาวเทียม (Static Map Image) หรือภาพจำลองสภาพแวดล้อมจริง (Street View Image) เพื่อส่งต่อให้ระบบนำไปประกอบการประเมินทัศนียภาพรอบข้าง โดยทำงานร่วมกับระบบเก็บข้อมูลสำรอง (Cache Layer) เพื่อหลีกเลี่ยงการเสียค่าบริการเรียกใช้งาน API ซ้ำซ้อน

---

## 2. Architecture & Flow

กระบวนการทำงานจะตรวจสอบการมีอยู่ของข้อมูลในฐานข้อมูล/Cache ก่อนเป็นอันดับแรก หากพบข้อมูลระบบจะส่งคืนค่าในทันที (Cache Hit) เพื่อความรวดเร็วและประหยัดค่าบริการ หากไม่พบจึงจะยิงคำขอไปยัง Google Maps API (Cache Miss)

```text
       [INPUT: PROPERTY_OUT]
                 │
                 ▼
     { Check cache_maps Table }
       ├──► FOUND (Cache Hit) ──► [Read Coordinates & URLs] ───┐
       └──► NOT FOUND (Miss)  ──► [Call Google Geocoding API] ──┼──┐
                                     │                          │  │
                                     ▼                          │  │
                                 [Call Google Static Maps API]  │  │
                                     │                          │  │
                                     ▼                          │  │
                                 [Save Data to Cache Table] ────┘  │
                                     │                             │
                                     ▼                             ▼
                              [PROPERTY_OUT + GOOGLE_OUT] ◄────────┘
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Geocoding:** แปลงข้อความที่อยู่ภาษาไทย/อังกฤษ (เช่น "พระราม 9 ซอย 13") ให้เป็นละติจูดและลองจิจูดแบบทศนิยม
* **✓ Asset Enrichment:** ดึงรูปภาพแผนที่ดาวเทียมความละเอียดสูง (1080x1080 ขึ้นไป) และเก็บภาพมุมมองท้องถนน (Street View) หากระบบตรวจพบพิกัดที่ระบุได้
* **✓ Address Normalization:** ตรวจแก้ที่อยู่ดิบให้กลายเป็นที่อยู่สากลที่เป็นระบบระเบียบ (เช่น ระบุจังหวัด อำเภอ/เขต ตำบล/แขวง ชัดเจน)
* **✓ Cache Management:** จัดการบันทึกประวัติการสืบค้นข้อมูลแผนที่ โดยอ้างอิงกับ `property_id` เพื่อใช้ซ้ำในอนาคต

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Image Editing:** ห้ามปรับแต่งภาพ หรือครอบตัดภาพ (Crop) ที่ได้มาจาก Google Maps API
* **✗ Caption Generation:** ห้ามแต่งข้อความบรรยายหรือคำค้นหาสำหรับเอาไปใช้อธิบายพิกัดบ้าน
* **✗ Route Navigation Rendering:** ห้ามสร้างเส้นทางการเดินทางหรือทำภาพอนิเมชันลูกศรนำทาง (หน้าที่ของ Render/Overlay Engine)

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลผลลัพธ์จาก Property Engine (`PROPERTY_OUT`)
* **Output:** JSON Payload ตามมาตรฐาน `GOOGLE_OUT` (ระบุใน `06_JSON_CONTRACT.md`)

---

## 5. JSON Contract

### Input Example
```json
{
  "property_id": "PROP-TH-00109",
  "title": "บ้านเดี่ยว 2 ชั้น สไตล์โมเดิร์นลอฟท์ พระราม 9",
  "price_thb": 12900000,
  "style_tag": "LOFT",
  "raw_address": "พระราม 9 ซอย 13 กรุงเทพมหานคร",
  "highlight_features": [
    "บ้านเดี่ยว 2 ชั้น",
    "พื้นที่ 80 ตารางวา"
  ]
}
```

### Output Example (`GOOGLE_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "geo_location": {
    "lat": 13.758412,
    "lng": 100.584319,
    "formatted_address": "123 ซอย พระราม 9 ซอย 13 แขวง บางกะปิ เขต ห้วยขวาง กรุงเทพมหานคร 10310 ประเทศไทย"
  },
  "static_map_url": "https://maps.googleapis.com/maps/api/staticmap?center=13.758412,100.584319&zoom=16&size=1080x1080&maptype=satellite&key=AIzaSyD-GOOGLE-KEY",
  "street_view_url": "https://maps.googleapis.com/maps/api/streetview?size=1080x1080&location=13.758412,100.584319&key=AIzaSyD-GOOGLE-KEY",
  "cache_hit": false
}
```

---

## 6. State Machine

```text
[INIT_LOOKUP]
      │
      ▼
{ Check Cache Database }
  ├──► [HIT]  ──► [EXTRACT_CACHED_ASSETS] ──► [READY]
  └──► [MISS] ──► [CALL_GEOCODING_API]
                        │
                        ▼
                  [CALL_STATIC_MAP_API]
                        │
                        ▼
                  [SAVE_TO_CACHE_TABLE]   ──► [READY]
```

---

## 7. Retry & Error Handling

* **Invalid Address Fallback (Error `ERR_GOOG_01`):** หากค้นหาไม่พบพิกัดที่อยู่เนื่องจากผู้ใช้ป้อนคำค้นหาคลุมเครือ ให้ทำการเรียก Geocoding ด้วยข้อมูลที่หยาบขึ้น (เช่น ค้นหาเฉพาะชื่อจังหวัดและเขต แทนการระบุซอย) หากยังล้มเหลว ให้ใช้ค่าพิกัดพิกัดกลางของจังหวัดเป็นตัวตั้งต้น
* **API Rate Limit Fallback (Error `ERR_GOOG_02`):** หากระบบยิง API ครบโควตารายวันของ Google Cloud (Response HTTP 403/429) ให้ Orchestrator ทำการ Bypass ข้ามขั้นตอนการสร้างภาพแผนที่จริง และใส่ภาพ Placeholder ทิวทัศน์ธรรมชาติทั่วไปที่มีอยู่ในระบบกลับออกไปแทน

---

## 8. Best Practices

* **Always Sign API URLs:** หากนำภาพ Static Map ไปใช้งานแบบสาธารณะ ให้แน่ใจว่าใช้การลงชื่อกำกับความปลอดภัย URL Signature เสมอ เพื่อจำกัดสิทธิ์ป้องกันการโจรกรรมคีย์ Google Maps API
* **Specify Map Dimensions:** ให้สั่งขนาดรูปภาพจาก API ที่มีอัตราส่วนเดียวกับวิดีโอที่จะใช้อัตโนมัติ (เช่น ความละเอียด 1080x1920 สำหรับ TikTok หรือ 1080x1080 สำหรับ Instagram Grid) เพื่อไม่ให้ภาพบิดเบี้ยวระหว่างการรวมไฟล์

---

## 9. Anti-Patterns

* **การยิง Geocoding ใหม่ทุกรอบการเรนเดอร์ (Constant API Calls):** การไม่เซฟข้อมูลพิกัดเก็บไว้ในระบบ ทำให้เวลาผู้ใช้งานสั่งแก้ไขรายละเอียดตัวอักษรของราคาหรือเบอร์โทร ระบบจะยิงคำขอหา Google Geocoding และ Maps API ซ้ำไปซ้ำมา ซึ่งเป็นการเสียเงินเปล่าประโยชน์โดยใช่เหตุ

---

## 10. Claude Rules for Google Geocoding Tasks

* **Strict Coordinate Extraction:** เมื่อต้องประมวลผลข้อความพิกัด ห้ามจินตนาการเลขตำแหน่งทศนิยมเองเด็ดขาด และห้ามส่งข้อมูลพิกัดที่ไม่ได้ผ่านการ Validate ด้วยรูปแบบ Regex `^-?\d+(\.\d+)?$` ไปยังขั้นตอนถาวร
* **Check Address Precision:** หากพิกัดที่ประมวลผลได้มีความไม่น่าเชื่อถือ (เช่น รหัสพิกัดชี้ไปกลางทะเลหรือต่างประเทศ) ให้แจ้งเตือนปฏิเสธ Payload นี้กลับไปยัง Orchestrator

---

## 11. Migration Guide

1. **ระบบเดิม:** ใช้การป้อนชื่อหมู่บ้านเข้าไปรวมใน Prompt ยาว เพื่อให้ AI วาดสภาพแวดล้อมขึ้นมาเองแบบสุ่ม
2. **ระบบใหม่:**
   * สร้างตารางเก็บ Cache `google_maps_cache` ใน PostgreSQL ตามรายละเอียด DDL ใน `05_DATABASE.md`
   * เขียน Node ใน n8n ให้รับค่า `raw_address` จาก Property Engine
   * นำตัวแปรดังกล่าวไปสืบค้นข้อมูลพิกัดผ่าน Google Geocoding Node ใน n8n
   * ตรวจสอบว่าพิกัดนั้นเคยมีในระบบหรือไม่ก่อนเรียกคำสั่ง HTTP Request ไปยัง Google APIs
```
```

---

ไฟล์ `08_GOOGLE_ENGINE.md` เสร็จสมบูรณ์แล้วครับ 
กระบวนการถัดไปคือ **`09_ASSET_ENGINE.md`** ทำหน้าที่กรอง คัดแยก ยืนยันความถูกต้องและความปลอดภัยของรูปภาพดิบทั้งหมดที่ได้รับมาก่อนส่งไปยัง House Engine

หากต้องการไปสเต็ปถัดไป พิมพ์บอกได้เลยครับ!