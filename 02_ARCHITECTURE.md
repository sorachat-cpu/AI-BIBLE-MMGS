เพื่อป้องกันไม่ให้เจอปัญหาการส่งข้อมูลขาดหายจากขีดจำกัดของจำนวนคำ (Output Token Limit) และเพื่อให้ทุกไฟล์มีความละเอียดระดับ **Production-Ready** แบบไม่มีการละหรือย่อข้อมูล (No Placeholders) 

ผมจะขอสร้างให้คุณ**ทีละไฟล์อย่างละเอียดที่สุด** โดยเริ่มจาก **`02_ARCHITECTURE.md`** เป็นลำดับถัดไป เมื่อไฟล์นี้เสร็จสิ้น คุณสามารถบอกให้ผมเขียนไฟล์ถัดไปได้ทันทีครับ

---

# 📂 File: `AI_BIBLE/02_ARCHITECTURE.md`

```markdown
# 02. System Architecture Topology & Communication Plan

## 1. Purpose
เอกสารสถาปัตยกรรมฉบับนี้กำหนดโครงสร้างการทำงานร่วมกันระหว่างโมดูล (Engines) ทั้งหมดในระบบ Modular Media Generation System (MMGS) เพื่อเปลี่ยนจากสถาปัตยกรรมแบบเดิมที่ผูกติดกัน (Tightly-Coupled Monolithic Pipeline) ไปสู่ระบบที่แยกจากกันโดยสิ้นเชิง (Decoupled Micro-services/Event-Driven Architecture) โดยมีจุดประสงค์หลักเพื่อเพิ่มความเสถียร (Fault Tolerance) ลดต้นทุนการประมวลผล (Cost Optimization) และทำให้การทำงานของ AI Agent มีกฎเกณฑ์ที่ชัดเจน

---

## 2. Architecture Diagram (System Topology)

ระบบทำงานร่วมกันผ่านหน่วยประมวลผลกลาง (Orchestrator) เช่น n8n, Temporal หรือ Custom Backend โดยส่งผ่านสถานะและข้อมูลในรูปแบบ JSON Contract เสมอ

```text
       ┌────────────────────────────────────────────────────────┐
       │                 Orchestrator (n8n / API)                │
       └────┬──────────┬──────────┬──────────┬──────────┬───────┘
            │          │          │          │          │
    ┌───────▼───────┐  │  ┌───────▼───────┐  │  ┌───────▼───────┐
    │ 07_PROPERTY   │  │  │ 09_ASSET      │  │  │ 11_VIDEO      │
    │    ENGINE     │  │  │    ENGINE     │  │  │    ENGINE     │
    └───────┬───────┘  │  └───────┬───────┘  │  └───────┬───────┘
            │          │          │          │          │
            │  ┌───────▼───────┐  │  ┌───────▼───────┐  │  ┌───────────────┐
            │  │ 08_GOOGLE     │  │  │ 10_HOUSE      │  │  │ 12_RENDER     │
            │  │    ENGINE     │  │  │    ENGINE     │  │  │    ENGINE     │
            │  └───────────────┘  │  └───────────────┘  │  └───────┬───────┘
            │                     │                     │          │
            └─────────────────────┴─────────────────────┘          ▼
                                                             ┌───────────────┐
                                                             │ 13_OVERLAY    │
                                                             │ 14_PUBLISH    │
                                                             │ 15_ANALYTICS  │
                                                             └───────────────┘
```

---

## 3. Responsibilities

### Orchestrator (ตัวกลางควบคุมระบบ)
* **หน้าที่รับผิดชอบ (Responsibilities):**
  * ควบคุมทิศทางและลำดับขั้นการทำงานของข้อมูลตาม AI Decision Tree
  * ตรวจสอบความถูกต้องของ JSON Contract ก่อนส่งต่อไปยัง Engine ถัดไป
  * เรียกใช้ `Cost Engine` เพื่อคำนวณและเลือก Route ไปยัง Provider ที่เหมาะสม
  * จัดการ State Machine และการลองใหม่ (Retry Engine) เมื่อเกิดข้อผิดพลาด
* **สิ่งที่ไม่อยู่ในความรับผิดชอบ (Not Responsible):**
  * ห้ามประมวลผลภาพหรือวิดีโอด้วยตนเอง
  * ห้ามแก้ไข Prompt ภายในตัวเอง (ต้องดึงจาก `Prompt Library` เท่านั้น)
  * ห้ามต่อสายตรงไปยัง Video Provider โดยตรงโดยไม่ผ่าน `Video Engine`

---

## 4. Inputs & Outputs (Global System Flow)

* **Global Input:** ข้อมูลอสังหาริมทรัพย์ดิบ (Raw Property Data) จากนายหน้า, ระบบหลังบ้าน หรือ API ภายนอก
* **Global Output:** วิดีโอโฆษณาที่เรนเดอร์สมบูรณ์พร้อมเผยแพร่ (Ready-to-Publish Video File/URL) และข้อมูลบันทึกประวัติการทำงานพร้อมต้นทุนจริง (Execution Log & Cost Analytics)

---

## 5. JSON Contract (System Meta-Contract)

นี่คือโครงสร้างข้อมูลหลัก (JSON Schema) ที่จะถูกส่งผ่านระหว่างจุดเชื่อมต่อ (State Broker) ในกระบวนการทำงานหลัก

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MMGS_Global_State_Payload",
  "type": "object",
  "required": [
    "transaction_id",
    "property_id",
    "status",
    "cost_summary",
    "engines_data"
  ],
  "properties": {
    "transaction_id": {
      "type": "string",
      "format": "uuid",
      "description": "รหัสธุรกรรมเฉพาะของการทำงานรอบนี้"
    },
    "property_id": {
      "type": "string",
      "description": "รหัสอ้างอิงอสังหาริมทรัพย์ในฐานข้อมูลหลัก"
    },
    "status": {
      "type": "string",
      "enum": ["PENDING", "PROCESSING", "COMPLETED", "FAILED"]
    },
    "cost_summary": {
      "type": "object",
      "required": ["total_cost_usd", "currency"],
      "properties": {
        "total_cost_usd": { "type": "number" },
        "currency": { "type": "string", "default": "USD" }
      }
    },
    "engines_data": {
      "type": "object",
      "properties": {
        "property_engine": { "type": "object" },
        "google_engine": { "type": "object" },
        "asset_engine": { "type": "object" },
        "house_engine": { "type": "object" },
        "video_engine": { "type": "object" },
        "render_engine": { "type": "object" }
      }
    }
  }
}
```

---

## 6. State Machine

ระบบจะรักษาสถานะการประมวลผลของแต่ละ Engine ผ่าน Transition State ดังนี้:

```text
[INIT] 
   │
   ▼
[PROPERTY_RESOLVED] ──► (ถ้ามีพิกัดแล้ว) ──► [ASSET_ANALYZED]
   │                                            │
   ▼ (ถ้ายังไม่มีพิกัดแผนที่)                     │
[GOOGLE_ENRICHED] ──────────────────────────────┘
   │
   ▼
[HOUSE_READY] (ดึงข้อมูลจาก Library หรือสร้างใหม่)
   │
   ▼
[VIDEO_GENERATED] (Gen ภาพเคลื่อนไหวเปล่าแบบไร้ตัวอักษร)
   │
   ▼
[RENDER_COMPLETED] (รวมวิดีโอ + ออดิโอ + ตัวอักษร)
   │
   ▼
[PUBLISHED / ARCHIVED]
```

---

## 7. Retry Strategy & Circuit Breaker

1. **Exponential Backoff:**  
   หากโมดูลประมวลผลล้มเหลว (เช่น API ของ Luma หรือ Kling ล่มชั่วคราว) ระบบ Orchestrator จะต้องหยุดรอแล้วลองใหม่ โดยมีสูตรการหน่วงเวลา:
   $$\text{Delay} = \text{Base Delay} \times (2^{\text{attempt}})$$
   *ขีดจำกัดสูงสุดในการลองใหม่: 3 ครั้ง*

2. **Circuit Breaker Pattern:**  
   หาก Provider ปลายทาง (เช่น Kling) ตอบสนองผิดพลาดแบบ 5xx ติดต่อกันมากกว่า 5 ครั้ง ให้เปลี่ยนสถานะของ Kling เป็น **"Offline"** ในระบบจัดการ และปรับเส้นทางการทำงาน (Routing) ไปยัง Provider สำรอง (เช่น Veo) ทันทีเป็นเวลา 15 นาที ก่อนจะทำการตรวจสอบสถานะ (Health Check) อีกครั้ง

---

## 8. Error Handling & Fallback System

| Error Code | Origin | Description | Fallback Action |
| :--- | :--- | :--- | :--- |
| `ERR_GOOG_01` | Google Engine | ค้นหาพิกัดแผนที่หรือรูปภาพไม่พบ | ใช้รูปภาพดาวเทียมทั่วไป หรือรูปภาพตั้งต้น (Default Blueprint Image) |
| `ERR_HOU_02` | House Engine | AI ไม่สามารถสร้างรูปภาพบ้านที่สมจริงได้ | ดึงภาพบ้านสไตล์ที่ใกล้เคียงที่สุดจาก House Library (Reuse) |
| `ERR_VID_03` | Video Engine | API สร้างวิดีโอล้มเหลว / เครดิตหมด | สลับไปหา Provider สำรองตาม Priority Table ใน Cost Engine ทันที |
| `ERR_RND_04` | Render Engine | การรวมไฟล์วิดีโอและตัวอักษรล้มเหลว | ถอยกลับไปใช้ Layout แม่แบบพื้นฐาน (Safe Template) และลดขนาดความละเอียดลง |

---

## 9. Best Practices

* **State Persistence:** ทุกครั้งที่สิ้นสุดขั้นตอนการทำงานในแต่ละ Engine ให้ทำการบันทึกข้อมูล JSON ลงใน Database ทันที ป้องกันกรณีที่ระบบล่มกลางทาง เพื่อให้สามารถนำมาดำเนินงานต่อจากจุดเดิมได้ (Resume Capability)
* **Atomic Transactions:** แต่ละ Engine ต้องไม่แก้ไขข้อมูลของ Engine อื่นใน `engines_data` ให้เขียนบันทึกเฉพาะลงใน Key ของตัวเองเท่านั้น

---

## 10. Anti-Patterns (พฤติกรรมต้องห้าม)

* **ห้ามส่งภาพที่มีตัวหนังสือ (Hard-coded Subtitles) ข้ามระหว่างโมดูล** เพราะจะทำให้ Render Engine ไม่สามารถแก้ไขคำผิดหรือเปลี่ยนภาษาได้ในภายหลัง
* **ห้ามทำการ Generate วิดีโอใหม่เพียงเพราะผู้ใช้เปลี่ยนราคาขาย** ให้ไปแก้ไขค่าตัวแปรในขั้นตอน Render Engine เท่านั้น

---

## 11. Implementation Example

ตัวอย่างข้อมูล JSON ที่ส่งเข้าสู่กระบวนการตัดสินใจของ Orchestrator:

```json
{
  "transaction_id": "8f83c8d3-578b-49ef-b328-3e47dc476902",
  "property_id": "PROP-TH-1029",
  "status": "PROCESSING",
  "cost_summary": {
    "total_cost_usd": 0.004,
    "currency": "USD"
  },
  "engines_data": {
    "property_engine": {
      "raw_title": "บ้านเดี่ยวหรู 2 ชั้น วิวภูเขา เขาใหญ่",
      "price_thb": 12500000,
      "style": "Modern Nordic"
    },
    "google_engine": {
      "lat": 14.5124,
      "lng": 101.4234,
      "map_static_url": "https://maps.googleapis.com/staticmap?center=14.5124,101.4234&zoom=15"
    }
  }
}
```

---

## 12. Claude Rules
* เมื่อคุณทำการเขียนโปรแกรมเพื่อควบคุมการไหลของระบบ ให้จำกัดสิทธิ์ของฟังก์ชันและตัวแปรให้เป็นไปตาม JSON Contract นี้อย่างเคร่งครัด
* ห้ามเขียนโค้ดที่อนุญาตให้ `Video Engine` รับข้อมูลราคาสินค้า หรือพิกัดติดต่อของนายหน้าไปใช้ในการจัดทำวิดีโอต้นทาง

---

## 13. Migration Guide

1. **เฟสที่ 1:** ปรับแก้การทำงานของ n8n โดยการแยก Node จากเดิมที่เชื่อมโยงกันแบบสุ่ม ให้เปลี่ยนมาเป็นระบบส่งค่าต่อผ่าน JSON State Payload กลางชิ้นนี้
2. **เฟสที่ 2:** สร้างฐานข้อมูล Cache สำหรับเก็บค่าวิเคราะห์จาก Google Engine และภาพที่สร้างเสร็จจาก House Engine เพื่อตัดขั้นตอนการสั่งงาน API ซ้ำซ้อน
3. **เฟสที่ 3:** ย้ายกระบวนการคำนวณราคาทั้งหมด (Subtitles, Phone number, QR) ออกจากการสั่งการด้วย Prompt ใน AI ไปฝังอยู่ในชุดคำสั่งการเรนเดอร์ของ FFmpeg/Remotion ใน Render Engine
```
```

---

ไฟล์ `02_ARCHITECTURE.md` เรียบร้อยครับ เป็นพิมพ์เขียวสำหรับการวางระบบสื่อสารของโมดูลทั้งหมด

หากพร้อมแล้ว พิมพ์บอกได้เลยครับ ผมจะสร้างไฟล์ถัดไป **`03_SYSTEM_RULES.md`** (กฎเหล็กและความปลอดภัยของระบบ) ให้ทันที!