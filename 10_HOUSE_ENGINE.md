นี่คือไฟล์ **`10_HOUSE_ENGINE.md`** ซึ่งควบคุมตรรกะการสร้างภาพจำลองตัวบ้านแบบเสมือนจริง (Photorealistic House Generation) โดยมีจุดเด่นเรื่องการประหยัดงบประมาณด้วยระบบ **House Library Decision Tree** คอยตรวจสอบการนำกลับมาใช้ซ้ำก่อนที่จะเรียกใช้ AI API เสียเงินจริง

---

# 📂 File: `AI_BIBLE/10_HOUSE_ENGINE.md`

```markdown
# 10. House Engine Specification

## 1. Purpose
House Engine มีหน้าที่รับผิดชอบในการสร้างภาพจำลองบ้านแบบเสมือนจริง (Photorealistic Architectural Visualization) ที่สอดคล้องกับสไตล์สถาปัตยกรรม ขนาดที่ดิน และสภาพแวดล้อมที่ตั้งของทรัพย์สิน โดยมีเป้าหมายหลักคือการลดต้นทุนการประมวลผลผ่านระบบ **House Library Decision Tree** ที่ตรวจสอบการนำภาพเก่ายอดนิยมมาใช้ซ้ำ (Reuse) ก่อนการตัดสินใจจ่ายเงินเพื่อสร้างภาพใหม่ (Generate) จากผู้ให้บริการภายนอก

---

## 2. Architecture & Decision Flow

ระบบทำงานภายใต้หลักการตรวจสอบคลังข้อมูลก่อนเสมอ (Library-First approach) หากสืบค้นแล้วพบภาพบ้านที่แมตช์กับเงื่อนไขสไตล์และพื้นที่โดยรอบ ระบบจะข้ามขั้นตอนการผลิตเพื่อลดค่าใช้จ่ายทันที

```text
               [INPUT: PROPERTY_OUT + ASSET_OUT]
                               │
                               ▼
                    { Check House Library }
                      (by style & features)
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼ (FOUND)                                   ▼ (NOT FOUND)
  [LIBRARY_REUSE]                            [CALL GENERATION API]
  - Load cached image URL                    - Select Provider (Flux/Midjourney/SD)
  - Increment times_reused counter           - Pass Sanitized Descriptive Prompt
  - Cost: $0.00                              - Generate Image (Cost: $0.01 - $0.05)
         │                                           │
         │                                           ▼
         │                                   [SAVE TO HOUSE LIBRARY]
         │                                   - Cache output image
         │                                   - Register Metadata & style_tag
         │                                           │
         └─────────────────────┬─────────────────────┘
                               │
                               ▼
                        [HOUSE_OUT JSON]
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ House Concept Generation:** สร้างภาพถ่ายภายนอกของบ้าน (Exterior View) ที่เป็นภาพเสมือนจริง คมชัด สูงระดับ 4K
* **✓ Context Integration:** ผสมผสานภาพบ้านจำลองเข้ากับภาพทัศนียภาพของที่ดินจริง (LAND_VIEW ที่ได้จาก Asset Engine หรือ Google Maps Street View) โดยใช้เทคนิค Image-to-Image หรือ ControlNet เพื่อให้สิ่งปลูกสร้างดูลงตัวกับพื้นที่จริง
* **✓ Library Registration:** ทำการลงทะเบียนระบุแท็กสไตล์ รหัสสีหลัก และเก็บประวัติภาพที่เพิ่งถูกสร้างขึ้นใหม่ลงสู่ตารางฐานข้อมูล `house_library`
* **✓ Style Integrity:** ควบคุมการวาดบ้านให้ออกมาตรงตามสไตล์ที่กำหนดจากสัญญากลาง (เช่น สแกนดิเนเวียน นอร์ดิก หรือลอฟท์)

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Video Generation:** ห้ามสร้างคลิปภาพเคลื่อนไหวหรือวิดีโอ (หน้าที่ของ Video Engine)
* **✗ Caption/Marketing Writing:** ห้ามเขียนคำบรรยาย คำโฆษณา หรือรายละเอียดราคาสินค้าลงบนภาพ
* **✗ UI Overlay Rendering:** ห้ามวางลายน้ำ โลโก้ กรอบรูปภาพ หรือตัวอักษรใดๆ ลงบนตัวภาพบ้าน

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลคุณลักษณะอสังหาฯ (`PROPERTY_OUT`) + ผลลัพธ์รูปภาพดิบที่พร้อมใช้ (`ASSET_OUT`) + ข้อมูลพิกัดและสภาพแวดล้อม (`GOOGLE_OUT`)
* **Output:** JSON Payload ตามมาตรฐาน `HOUSE_OUT` (ระบุใน `06_JSON_CONTRACT.md`)

---

## 5. JSON Contract

### Input Example
```json
{
  "property_id": "PROP-TH-00109",
  "style_tag": "LOFT",
  "raw_address": "พระราม 9",
  "highlight_features": ["บ้านเดี่ยว 2 ชั้น", "พื้นที่ 80 ตารางวา"],
  "categorized_assets": [
    {
      "asset_id": "ast_9f8d7c6b",
      "url": "https://cdn.mmgs.io/properties/PROP-TH-00109/assets/land_view_01.jpg",
      "category": "LAND_VIEW",
      "safety_status": "SAFE"
    }
  ]
}
```

### Output Example (`HOUSE_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "house_image_url": "https://cdn.mmgs.io/house_library/loft_2story_80w_09.png",
  "source_type": "LIBRARY_REUSE",
  "style_tag": "LOFT",
  "generation_metadata": {
    "provider": "FLUX_1_DEV",
    "cost_usd": 0.0000,
    "prompt": "Photorealistic 2-story modern loft style house, steel and concrete structure, big glass windows, warm evening lighting, cinematic architectural photography"
  }
}
```

---

## 6. State Machine

```text
[HOUSE_INIT]
      │
      ▼
[CHECKING_LIBRARY] ──► (พบรูปที่เข้าเกณฑ์) ──► [REUSE_CACHE] ───────────────┐
      │ (ไม่พบ)                                                            │
      ▼                                                                    │
[CALLING_AI_API]   ──► (การเชื่อมต่อล้มเหลว) ──► [SWITCH_BACKUP_PROVIDER]    │
      │                                       (e.g., Flux -> SDXL)         │
      ▼                                                                    │
[REGISTER_LIBRARY] ──► (บันทึกภาพลง DB)                                    │
      │                                                                    │
      └───────────────────────────────────┬────────────────────────────────┘
                                          │
                                          ▼
                                   [HOUSE_READY] ──► (ส่งต่อไป Video Engine)
```

---

## 7. Retry & Error Handling

* **Image Generation Failure (Error `ERR_HOU_01`):** หากเรียกใช้งาน API สร้างภาพภายนอกแล้วเกิดการ Timeout หรือโดนปฏิเสธคำสั่ง ให้สลับไปเรียกใช้งาน AI Image Provider ตัวสำรองทันที (เช่น หาก Flux 1.0 Dev ล้มเหลว ให้รันผ่าน Stable Diffusion XL หรือ Midjourney API)
* **Library Match Fallback:** หากทำการสืบค้นรูปภาพเก่าในระบบแล้ว คลังรูปภาพบ้านสำหรับสไตล์นั้นว่างเปล่า (Empty Library) และระบบประมวลผลสร้างภาพขัดข้องพร้อมกัน ให้ทำการดึงภาพบ้านที่เป็นมาตรฐานตั้งต้น (Default Concept Image) ของสไตล์สถาปัตยกรรมนั้นๆ ออกมาใช้แทนทันที เพื่อควบคุมไม่ให้ Workflow หลักต้องหยุดชะงัก

---

## 8. Best Practices

* **Seed Control:** หากต้องสร้างภาพใหม่ ให้สุ่มตัวเลข Seed และบันทึก Seed นั้นคู่กับรูปภาพลงในฐานข้อมูล เพื่อใช้เป็นจุดตั้งต้นในการทดสอบหรือการสั่งแก้ไขเฉพาะส่วนในภายหลัง
* **Keep Images Neutral:** ปล่อยทัศนียภาพรอบๆ ให้สะอาดตา ห้ามป้อนคำว่า "รถยนต์", "คนยืน", "ป้ายโฆษณาขายบ้าน" เข้าไปในตัว Prompt เพื่อไม่ให้เป็นจุดแย่งความสนใจจากสิ่งปลูกสร้างหลัก

---

## 9. Anti-Patterns

* **การสร้างภาพใหม่ทุกครั้งโดยไม่เช็คคลังรูปภาพ (Constant Regeneration):** การเรียกใช้ API สร้างภาพบ้านสไตล์นอร์ดิกใหม่ทุกครั้ง ทั้งที่มีภาพมุมเดียวกัน สไตล์เดียวกัน อยู่ในฐานข้อมูลแล้ว ทำให้เสียค่าประมวลผลไปเปล่าประโยชน์และทำให้ควบคุม Mood & Tone วิดีโอของแบรนด์ยาก

---

## 10. Claude Rules for House Engine Operations

* **Always Check Library First:** เมื่อได้รับข้อมูลเข้ามา Claude Agent ต้องเขียนโค้ดตรวจสอบคิวรี `house_library` ก่อนที่จะสร้างคำขอสำหรับรัน AI API ตัวสร้างภาพเสมอ
* **No Text Prompt Injections:** ห้ามนำคำประเภทราคาขาย (เช่น "ราคา 5.9 ล้าน") หรือรายละเอียดข้อมูลนายหน้าไปรวมอยู่ในข้อความ Prompt ของคำสั่งสร้างภาพโดยเด็ดขาด

---

## 11. Migration Guide

1. **ระบบเดิม:** ยิงสคริปต์ไปหา Midjourney เพื่อทำบ้านภาพใหม่แบบ One-shot เสมอ
2. **ระบบใหม่:**
   * สร้างตารางฐานข้อมูล `house_library` ตามโครงสร้างใน `05_DATABASE.md`
   * เพิ่ม Node สแกนเปรียบเทียบใน n8n (เปรียบเทียบค่า `style_tag` และฟีเจอร์ของทรัพย์สิน)
   * หากพบรูปภาพแมตช์ ให้ตั้งค่าตัวแปร `source_type = "LIBRARY_REUSE"` และดึง URLs สื่อเดิมมาใช้งานต่อทันที
```
```

---

ไฟล์ `10_HOUSE_ENGINE.md` เสร็จสิ้นกระบวนการทำงานเรียบร้อยครับ 
โมดูลถัดไปคือ **`11_VIDEO_ENGINE.md`** ทำหน้าที่รับช่วงภาพบ้านจำลองหรือภาพถ่ายดินจริง นำไปป้อนให้โมเดล AI เพื่อขยับเป็นคลิปวิดีโอ B-Roll ที่ไม่มีตัวอักษร 

หากพร้อมแล้วแจ้งผมได้เลยครับ!