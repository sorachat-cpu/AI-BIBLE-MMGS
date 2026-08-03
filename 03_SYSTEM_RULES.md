นี่คือไฟล์ **`03_SYSTEM_RULES.md`** ซึ่งเป็นกติกาและกฎเหล็กระดับโกลบอล (Global Guardrails) ที่ทุก Engine และ AI Agent ทุกตัวต้องปฏิบัติตามอย่างไม่มีข้อยกเว้น เพื่อรักษาความปลอดภัย ความถูกต้องของข้อมูล และป้องกันปัญหางบประมาณรั่วไหล

---

# 📂 File: `AI_BIBLE/03_SYSTEM_RULES.md`

```markdown
# 03. Global System Rules & Security Guardrails

## 1. Purpose
เอกสารฉบับนี้กำหนดกฎเหล็กและข้อจำกัดสากล (Global Guardrails) ที่ทุกโมดูล (Engines), API Integrations, และ AI Agents (รวมถึง Claude Code) ต้องปฏิบัติตามโดยไม่มีข้อยกเว้น กฎเหล่านี้ถูกตั้งขึ้นเพื่อป้องกันความผิดพลาดในการทำงาน ป้องกันค่าบริการ API ที่อาจสูงเกินควบคุม (Runaway Cost) และรับประกันว่าระบบจะสามารถแก้ไขข้อมูลและนำสินทรัพย์ (Assets) กลับมาใช้ซ้ำได้อย่างมีประสิทธิภาพสูงสุด

---

## 2. Architecture & Enforcement Point
กฎเกณฑ์ความปลอดภัยจะถูกบังคับใช้ผ่าน **Middleware/Gateway Layer** ของระบบกลาง (Orchestrator) และตรวจทานผ่าน Validation Schemas ในทุกจุดที่มีการส่งต่อ State Payload ระหว่างโมดูล

```text
  [Input Payload] ──► [ Schema Validation ] ──► [ Global Rules Checker ] ──► [ Engine Execution ]
                             │                            │
                             ▼ (Fail)                     ▼ (Fail)
                       [ REJECT: ERR_VAL ]          [ REJECT: ERR_RULE ]
```

---

## 3. Core System Guardrails (กฎเหล็ก 7 ข้อ)

### กฎข้อที่ 1: Absolute Media Neutrality (ความเป็นกลางของภาพและวิดีโอ)
* **ห้าม** ฝังข้อความ (Text), ตัวเลข (Numbers), ราคาทรัพย์สิน, เบอร์โทรศัพท์, โลโก้แบรนด์, หรือเครื่องหมายการค้าใดๆ ลงบนตัวเนื้อหาวิดีโอ (Video Stream) หรือรูปภาพที่ผลิตขึ้นจาก `House Engine` และ `Video Engine` อย่างเด็ดขาด
* **เหตุผล:** เพื่อป้องกันการสูญเสียต้นทุนโดยเปล่าประโยชน์เมื่อข้อมูลตัวเลขหรือรายละเอียดการติดต่อเปลี่ยนไป ทุกอย่างที่เป็นตัวอักษรและแบรนดิ้งต้องถูกประกอบขึ้นโดย `Render Engine` ผ่านระบบ Overlay ภายหลังเท่านั้น

### กฎข้อที่ 2: Library-First Search (ค้นหาคลังข้อมูลก่อนสร้างใหม่เสมอ)
* **ห้าม** ร้องขอการสร้างรูปภาพบ้าน (House Generation) หรือวิดีโอ (Video Generation) จากผู้ให้บริการภายนอก (Third-party APIs) หากไม่ได้ผ่านการตรวจสอบใน `House Library` หรือ `Video Library` แล้วว่าไม่มีข้อมูลที่สามารถนำมาใช้ซ้ำ (Reuse) ได้
* **เหตุผล:** ลดต้นทุน API ลงเหลือ $0.00 สำหรับที่ดินหรือทรัพย์สินที่มีทัศนียภาพหรือแบบสถาปัตยกรรมใกล้เคียงกัน

### กฎข้อที่ 3: Strict Schema Compliance (การบังคับใช้สัญญาข้อมูล)
* **ห้าม** ส่งต่อ Payload ในระบบในลักษณะเป็นข้อความอธิบายแบบไร้รูปแบบ (Unstructured Payload) ข้อมูลทุกประเภทที่ไหลข้ามโมดูลต้องเข้ากันได้กับไฟล์สกีมาที่ระบุไว้ในโฟลเดอร์ `/schemas/` เท่านั้น

### กฎข้อที่ 4: Hard Ceiling Cost Limit (การควบคุมงบประมาณต่อธุรกรรม)
* **ห้าม** ดำเนินการต่อใน Workflow หากค่าใช้จ่ายรวม ณ ปัจจุบันของธุรกรรมนั้น (Accumulated Transaction Cost) เกินกว่าขีดจำกัดสูงสุดที่ตั้งไว้ (Max Budget Limit) เช่น เกินกว่า $0.30 ต่อ 1 วิดีโอสำเร็จรูป
* **เหตุผล:** ป้องกันกรณีการวนลูปการทำงานที่ล้มเหลว (Infinite Loop Retry) ซึ่งนำไปสู่การสูญเสียเงินจำนวนมากในระยะเวลาอันสั้น

### กฎข้อที่ 5: Idempotency Identifier (คีย์ระบุตัวตนของการทำซ้ำ)
* ทุกการทำงานต้องสร้าง `idempotency_key` ที่อ้างอิงจาก `property_id` + `timestamp_round` หากระบบได้รับคำขอที่มีคีย์เดิมที่กำลังทำงานอยู่ ให้ส่งผลลัพธ์การทำงานของคีย์เดิมกลับไป ห้ามเริ่มการประมวลผลใหม่ซ้ำซ้อน

### กฎข้อที่ 6: Decoupled Logic for Prompt Templates
* **ห้าม** ทำการแก้ไขไฟล์คำสั่งสำเร็จรูป (`17_PROMPT_LIBRARY.md`) จากภายนอกโดยพลการ ระบบ AI หรือโค้ดตัวใดก็ตามที่ทำงานร่วมกับ AI Engine ต้องเรียกใช้ Template ID ที่ระบบกำหนดไว้เท่านั้น และห้ามนำ Dynamic Data ส่วนบุคคล (เช่น ชื่อจริงนายหน้า เบอร์โทร) ไปรวมไว้ในตัว Prompt Base

### กฎข้อที่ 7: Cache-First Policy for Google Maps & APIs
* ทุกข้อมูลที่ได้มาจาก `Google Engine` (พิกัด, Street View, แผนที่ดาวเทียม) ต้องบันทึกเข้าสู่ Cache Layer โดยตั้งค่า Time-to-Live (TTL) อย่างน้อย 30 วัน เพื่อหลีกเลี่ยงการถูกเรียกเก็บเงินจากกูเกิลซ้ำซาก

---

## 4. Responsibilities of Enforcement

* **Orchestrator Middleware:** รับผิดชอบการสแกน Payload ทุกตัวที่ผ่านเข้าออก หากตรวจพบว่ามีโครงสร้างคีย์ที่ผิดแปลกไปจาก Schema ให้ระงับกระบวนการทำงานทันที
* **AI Provider Gateway (Cost Engine):** รับผิดชอบในการหยุดยั้งคำขอสร้างสื่อ หากตรวจสอบพบว่า Token หรือราคาเรียกใช้ API ในขณะนั้นสูงกว่าปกติเกิน 50% ของราคาตลาดกลาง

---

## 5. JSON Contract: Guardrail Validation Payload

นี่คือหน้าตาของ Schema ที่ Middleware ใช้ตรวจสอบกฎของระบบก่อนเริ่มทำงานในแต่ละขั้นตอน:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Guardrail_Compliance_Request",
  "type": "object",
  "required": ["transaction_id", "budget_limit", "accumulated_cost", "payload_to_verify"],
  "properties": {
    "transaction_id": { "type": "string", "format": "uuid" },
    "budget_limit": { "type": "number", "minimum": 0.05 },
    "accumulated_cost": { "type": "number", "minimum": 0.0 },
    "payload_to_verify": {
      "type": "object",
      "required": ["step", "data"],
      "properties": {
        "step": { "type": "string" },
        "data": {
          "type": "object",
          "properties": {
            "contains_text": { "type": "boolean" },
            "contains_branding": { "type": "boolean" }
          }
        }
      }
    }
  }
}
```

---

## 6. State Machine: Guardrail Checking Flow

```text
[Engine Requests Action]
          │
          ▼
 [Validate JSON Schema] ──► FAIL ──► [REJECT: ERR_SCHEMA_INVALID]
          │ (PASS)
          ▼
[Check Current Budget]  ──► FAIL ──► [REJECT: ERR_BUDGET_EXCEEDED]
          │ (PASS)
          ▼
[Check Media Rules]     ──► FAIL ──► [REJECT: ERR_RULE_VIOLATION]
 (No text inside image)
          │ (PASS)
          ▼
  [EXECUTE ACTION]
```

---

## 7. Error Codes & Fallback Actions

| Error Code | Error Name | Cause | Immediate Recovery Action |
| :--- | :--- | :--- | :--- |
| `ERR_RULE_01` | `TEXT_INJECTION_DETECTED` | มีการส่งข้อความหรือข้อมูลติดต่อเข้าไปใน Prompt ของผู้ให้บริการสร้างภาพ | ตัดคำ (Strip) ข้อความเสี่ยงออกทันที แล้วป้อนเฉพาะ Descriptive Keywords |
| `ERR_RULE_02` | `BUDGET_OVERRUN` | ต้นทุนสะสมใน Transaction เกินกว่า $0.30 | หยุดทำงาน ส่ง Notification ไปหาผู้ควบคุมระบบ และปรับสถานะเป็น FAILED |
| `ERR_RULE_03` | `BYPASS_LIBRARY_ATTEMPT` | พยายามเรียก API ภายนอก โดยไม่ได้ตรวจสอบข้อมูล Cache | หยุดสั่งการทำงาน ดึงข้อมูลสืบค้นกลับเข้าสู่ Cache Matcher ก่อนขยับต่อ |

---

## 8. Best Practices

* **Audit Logging:** ทุกครั้งที่มีการปฏิเสธคำสั่งซื้อหรือการประมวลผลอันเนื่องมาจากทำผิดกฎ (Guardrail Violation) ให้เก็บ Logs ความผิดพลาดในรูปแบบ Structured Data ลง ElasticSearch หรือระบบเก็บข้อมูลกลางเพื่อทำ Analytics เสมอ
* **Auto-Sanitization:** เขียนฟังก์ชันล้างคำที่เป็นข้อความตัวเลข อัตราแลกเปลี่ยน (เช่น ฿, ล้าน, บาท, Million, THB) ออกจาก Prompt ที่ป้อนให้ AI โดยอัตโนมัติก่อนส่งไปประมวลผล

---

## 9. Anti-Patterns (แนวทางที่ผิดพลาด)

* **ความเชื่อใจ AI มากเกินไป:** ยอมให้ Claude เขียนหรือแก้ไข System Rules เองในตัวโค้ดที่รันอยู่เบื้องหลัง (Dynamic System Prompt modification) ซึ่งอาจสร้างความปั่นป่วนทางงบประมาณได้
* **การข้ามการตรวจสอบ Cache ในโหมดเร่งด่วน (Fast Mode Bypass):** อนุญาตให้ Developer เขียนคำสั่งลัดข้ามผ่านการตรวจสอบ House Library เพื่อความเร็ว ซึ่งส่งผลให้เสียเงินซ้ำซ้อน

---

## 10. Implementation Example

ตัวอย่างการกรองคำพูดก่อนส่ง Payload เข้าสู่ `House Engine`:

```json
// INPUT ที่ถูกป้อนเข้ามา (ผิดกฎระบบ: มีราคาและรายละเอียดช่องทางติดต่อ)
{
  "property_desc": "ขายด่วนที่ดินเปล่า 100 ตร.ว. ราคา 2.5 ล้านบาท ติดต่อไลน์ @landlord"
}

// OUTPUT หลังผ่านกระบวนการ Sanitize ของ System Rules (ล้างจุดเสี่ยงออกทั้งหมด)
{
  "property_desc": "ที่ดินเปล่า ขนาด 100 ตารางวา พื้นที่ราบเรียบ เหมาะกับการก่อสร้างที่อยู่อาศัย"
}
```

---

## 11. Claude Rules for Agent Development

* **Rule Compliance:** เมื่ออ่านคู่มือเล่มนี้แล้ว Claude Code และ AI Agents ทุกตัวต้องทำการตรวจสอบ input arguments เสมอว่าไม่มีข้อมูลที่เป็น Text หรือ Branding หลุดเข้าไปในจุดสร้างภาพ/วิดีโอ
* **Code Modification Check:** ห้ามทำการเขียนโค้ดเพื่อปลดล็อกฟังก์ชันความปลอดภัยทางด้านงบประมาณ หรือเพิ่มค่าขีดจำกัดสูงสุดของต้นทุน (Cost Ceiling) โดยไม่ได้รับอนุมัติจาก Admin

---

## 12. Migration Guide

1. **Step 1:** ตรวจสอบกระบวนการทำ Prompt บน n8n เดิม และลบตัวแปรที่เป็นชื่อนายหน้า, ราคา และเบอร์โทร ออกจาก Node สร้างภาพ/วิดีโอทั้งหมด
2. **Step 2:** พัฒนา Function Node สำหรับขจัดคำพูดที่ไม่พึงประสงค์ (Sanitization Module) ก่อนจะยิงคำขอออกไปยัง AI API
3. **Step 3:** เปิดใช้งาน JSON Schema validator เป็นด่านแรกสำหรับการรับส่งข้อมูลในแต่ละ Node (เช่น การใช้ JSON Schema validation node ใน n8n)
```
```

---

ไฟล์ `03_SYSTEM_RULES.md` เสร็จสมบูรณ์แล้วครับ ในขั้นตอนถัดไปผมจะจัดทำ **`04_WORKFLOW.md`** เพื่ออธิบายแผนผังการเดินข้อมูลของทั้งระบบอย่างละเอียดลออตั้งแต่ต้นจนจบแบบเป็นระบบคู่ขนาน

หากต้องการดำเนินการต่อ พิมพ์แจ้งผมได้เลยครับ!