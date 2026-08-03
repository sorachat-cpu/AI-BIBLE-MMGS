นี่คือไฟล์ **`07_PROPERTY_ENGINE.md`** ซึ่งเป็นด่านแรกของท่อส่งข้อมูล (Data Pipeline) ทำหน้าที่กรอง ทำความสะอาด และแปลงข้อมูลดิบของอสังหาริมทรัพย์ให้อยู่ในรูปแบบโครงสร้าง JSON ที่เสถียรตามข้อตกลงของระบบ

---

# 📂 File: `AI_BIBLE/07_PROPERTY_ENGINE.md`

```markdown
# 07. Property Engine Specification

## 1. Purpose
Property Engine เป็นโมดูลเริ่มต้นของระบบ มีหน้าที่รับข้อมูลอสังหาริมทรัพย์ดิบ (Raw Unstructured Data) เช่น ข้อความโพสต์จากนายหน้า รายละเอียดจากแผ่นงาน (Google Sheets) หรือข้อความบรรยายภาษาธรรมชาติ แล้วประมวลผลวิเคราะห์เพื่อสกัดข้อมูล จัดระเบียบ ทำความสะอาด และแปลงให้อยู่ในรูปแบบ JSON Contract ที่กำหนดไว้ เพื่อส่งต่อไปยังโมดูลถัดไป

---

## 2. Architecture & Flow

โมดูลนี้ทำงานร่วมกันระหว่าง Parser Module (ใช้ Regex หรือ Rule-based Parser สำหรับฟิลด์คงที่) และ LLM Entity Extractor (ใช้ Claude Haiku หรือโมเดลขนาดเล็กที่มีการวิเคราะห์ที่แม่นยำและราคาประหยัด)

```text
[Raw Property Input]
         │
         ▼
[LLM Entity Extractor] ──► (วิเคราะห์โครงสร้างภาษา / สกัดคุณลักษณะเด่น / กำหนดแท็กสไตล์)
         │
         ▼
 [Validator Engine]    ──► (ตรวจสอบความถูกต้องของฟิลด์ตัวเลขและชนิดข้อมูล)
         │
         ▼
  [PROPERTY_OUT]       ──► (ส่งต่อข้อมูลไปยัง Google Engine)
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Cleaning & Sanitization:** ลบอักขระพิเศษ คำโฆษณาชวนเชื่อที่เกินจริง (เช่น "ด่วนที่สุด!!!", "ถูกที่สุดในสามโลก") และข้อมูลที่เป็นช่องทางติดต่อส่วนบุคคลออกจากข้อความบรรยายที่จะใช้อธิบายลักษณะบ้าน
* **✓ Entity Extraction:** สกัดคีย์สำคัญ เช่น ราคาสินค้า (แปลง "10 ล้าน", "10.5M" ให้เป็นตัวเลข `10500000` เท่านั้น), ขนาดที่ดิน, สไตล์ของบ้าน
* **✓ Architectural Style Classification:** จัดกลุ่มสไตล์สถาปัตยกรรมให้อยู่ในกลุ่มที่ระบบกำหนด (MODERN_NORDIC, MINIMALIST, LUXURY_CLASSIC, CONTEMPORARY, LOFT)
* **✓ Unique Key Generation:** ออกรหัสอ้างอิง `property_id` ที่เป็นเอกลักษณ์ตามรูปแบบมาตรฐาน (เช่น `PROP-TH-1002`)

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Google Geo-location Lookup:** ห้ามทำการค้นหาพิกัด ละติจูด ลองจิจูด เอง (หน้าที่ของ Google Engine)
* **✗ Image or Video Management:** ห้ามทำการประมวลผล ตรวจสอบ หรือวิเคราะห์รูปภาพใดๆ (หน้าที่ของ Asset Engine)
* **✗ Visual Overlay Design:** ห้ามกำหนดสีสัน หน้าตา Layout หรือออกแบบแบนเนอร์ (หน้าที่ของ Overlay Engine)

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลอสังหาริมทรัพย์ดิบในรูปแบบข้อความเสรี (Unstructured Text) หรือข้อมูลกึ่งโครงสร้างจาก API
* **Output:** JSON Payload ตามมาตรฐาน `PROPERTY_OUT` (ระบุใน `06_JSON_CONTRACT.md`)

---

## 5. JSON Contract

### Input JSON Structure
```json
{
  "raw_input_text": "ขายด่วนจ้า!! บ้านเดี่ยว 2 ชั้น สไตล์โมเดิร์นลอฟท์ โครงการหรูย่านพระราม 9 เนื้อที่ 80 ตร.ว. ราคาดีมากๆ แค่ 12.9 ล้านบาท สนใจติดต่อ 081-234-5678 ไลน์ไอดี @broker1"
}
```

### Output JSON Structure (`PROPERTY_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "title": "บ้านเดี่ยว 2 ชั้น สไตล์โมเดิร์นลอฟท์ พระราม 9",
  "price_thb": 12900000,
  "style_tag": "LOFT",
  "raw_address": "พระราม 9",
  "highlight_features": [
    "บ้านเดี่ยว 2 ชั้น",
    "พื้นที่ 80 ตารางวา",
    "ย่านพระราม 9"
  ]
}
```

---

## 6. State Machine

```text
[INPUT_RECEIVED]
       │
       ▼
[EXTRACTING_ENTITIES] ──► (เกิดข้อผิดพลาดในการแปลงราคา) ──► [FALLBACK: Price Parse Error]
       │
       ▼
[VALIDATING_SCHEMA]   ──► (รูปแบบ ID ไม่ถูกต้อง)        ──► [REJECT: Schema Invalidation]
       │
       ▼
[PROPERTY_RESOLVED]   ──► (ส่งต่อไปยัง Google Engine)
```

---

## 7. Retry & Error Handling

* **Price Parsing Fallback:** หาก LLM หรือ Parser ไม่สามารถแปลงราคาสินค้าให้เป็นตัวเลขทศนิยมได้ ระบบจะหยุดขั้นตอนการประมวลผลทันที และตั้งสถานะเป็น `FAILED` ด้วยรหัส `ERR_PROP_01` (Invalid Price Format) เพื่อเรียกผู้ควบคุมระบบ (Human-in-the-loop) เข้ามาจัดการ
* **Style Classification Default:** หากโครงสร้างคำอธิบายอสังหาริมทรัพย์ไม่ได้ระบุสไตล์เด่นชัด ให้โมดูลเลือกตั้งค่าตั้งต้นเป็น `CONTEMPORARY` เสมอ เพื่อให้ขั้นตอนการดึงรูปภาพของ House Engine ทำงานต่อไปได้

---

## 8. Best Practices

* **Keep Description Clean:** ในขั้นการส่งมอบข้อมูล ให้เก็บรายละเอียดคำบรรยายจุดขายเป็นรายการสั้น (Array of Strings ใน `highlight_features`) ความยาวรายการไม่เกิน 3-5 รายการ เพื่อให้ระบบเรนเดอร์จัดระเบียบตัวหนังสือได้ง่าย
* **Always Normalize Numeric Value:** ค่าเงินบาทจะต้องถูกแปลงให้อยู่ในประเภทข้อมูล Number ที่ไม่มีจุลภาคคั่น (Comma) เสมอ

---

## 9. Anti-Patterns

* **การยอมให้เบอร์โทรศัพท์ของนายหน้าผ่านกระบวนการนี้:** หากปล่อยให้เบอร์โทรศัพท์หลุดเข้าไปอยู่ใน `title` หรือคำอธิบายบ้าน อาจส่งผลให้ AI นำข้อมูลส่วนบุคคลนี้ไปใส่ลงใน Prompt ส่งผลให้ AI วิดีโอบางตัวพยายามวาดตัวเลขเบอร์โทรยึกยือลงในเนื้อคลิป ซึ่งละเมิดกฎเหล็กของระบบ

---

## 10. Claude Rules for Property Processing

* **No Hallucination:** เมื่อใช้ Claude ในการแกะข้อความ (Extract text) ห้ามจินตนาการข้อมูลเพิ่มเติม เช่น หากลูกค้าไม่ได้แจ้งขนาดที่ดิน ห้ามเขียนระบุขนาดที่ดินขึ้นมาเองเด็ดขาด
* **Exact Matching:** จับคู่สไตล์ของอสังหาริมทรัพย์ตาม enum ที่กำหนดไว้ใน schema เท่านั้น ห้ามตอบชื่อสไตล์อื่นที่ไม่มีอยู่ในรายการ (เช่น ห้ามใช้ "Luxury Modern" หากไม่มีระบุไว้ใน Enum)

---

## 11. Migration Guide

1. **ระบบเดิม:** ดึงข้อมูลดิบจากชีตแล้วส่งต่อไปสร้าง Prompt วิดีโอทันทีโดยตรง
2. **ระบบใหม่:** ให้สร้าง n8n Function Node หรือ Microservice ที่เรียกใช้โมเดล Claude Haiku
3. ป้อนคำสั่ง Prompt Template ตามที่ระบุไว้ใน `17_PROMPT_LIBRARY.md` เพื่อแปลงข้อมูลดิบให้กลายเป็น Payload `PROPERTY_OUT` เสียก่อน
4. ส่งผลลัพธ์ที่แปลงได้รันผ่าน JSON Schema Validator Node เพื่อตรวจสอบโครงสร้างข้อมูลก่อนส่งต่อไปทำงานขั้นตอนถัดไป
```
```

---

ไฟล์ `07_PROPERTY_ENGINE.md` เสร็จสมบูรณ์แล้วครับ 
โมดูลถัดไปคือ **`08_GOOGLE_ENGINE.md`** ทำหน้าที่รับช่วงต่อพิกัด หาภาพดาวเทียม และ Street View มาเพิ่มข้อมูลให้ดินแดนนั้นๆ

หากต้องการดำเนินการต่อ พิมพ์บอกได้เลยครับ!