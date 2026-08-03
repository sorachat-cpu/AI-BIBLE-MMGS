นี่คือไฟล์ **`04_WORKFLOW.md`** ที่จะลงลึกถึงท่อส่งข้อมูล (Data Pipeline) จากต้นน้ำถึงปลายน้ำ แสดงขั้นตอนการทำงานร่วมกันแบบละเอียดของทั้ง 7 โมดูลหลัก และแผนผังการไหลของข้อมูล (Data Flow) ที่ควบคุมโดย Orchestrator ครับ

---

# 📂 File: `AI_BIBLE/04_WORKFLOW.md`

```markdown
# 04. Data Pipeline & System Workflow Specification

## 1. Purpose
เอกสารฉบับนี้กำหนดมาตรฐานขั้นตอนการทำงาน (Workflow Specification) ตั้งแต่ข้อมูลอสังหาริมทรัพย์เริ่มต้น (Raw Property Input) ไหลผ่านการวิเคราะห์ การจัดหาสินทรัพย์ การสร้างเนื้อหาเคลื่อนไหว ไปจนถึงขั้นตอนสุดท้ายคือการเรนเดอร์และเผยแพร่ (Publish) โดยเปลี่ยนท่อส่งข้อมูลจากระบบเดิมแบบขั้นตอนเดียว (Linear Pipeline) ไปสู่ระบบแยกส่วนการทำงานเชิงลึก (Multi-stage Decoupled Workflow)

---

## 2. Decoupled Data Pipeline Architecture

 workflow ทำการส่งต่อข้อมูลแบบเรียงลำดับผ่าน 7 โมดูลหลัก โดยมีรายละเอียดดังต่อไปนี้:

```text
  [07_PROPERTY] ──(Clean JSON)──► [08_GOOGLE] ──(Map/StreetView)──► [09_ASSET] ──(Labels/Metadata)──┐
                                                                                                    │
  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┘
  │
  ▼
[10_HOUSE] ──(House Concept Art)──► [11_VIDEO] ──(B-Roll Clip)──► [12_RENDER] ──(Overlay/Audio)──► [14_PUBLISH]
```

---

## 3. Workflow Steps & Responsibilities

### Step 1: Property Parsing (`07_PROPERTY_ENGINE`)
* **หน้าที่:** รับข้อมูลดิบ (Unstructured Text/Sheet) มาวิเคราะห์สไตล์บ้าน, พิกัด, ราคา และจุดเด่น เพื่อจัดโครงสร้างให้เป็นมาตรฐานเดียวกัน
* **การตัดสินใจ:** สกัดคีย์ข้อมูลเพื่อใช้เป็น ID ประจำตัวของแปลงที่ดิน

### Step 2: Google Enrichment (`08_GOOGLE_ENGINE`)
* **หน้าที่:** ดึงพิกัดที่แท้จริงจาก Google Maps API จัดเก็บภาพถ่ายดาวเทียม (Static Sat Maps) และภาพ Street View คาดการณ์วิวโดยรอบ
* **การลดต้นทุน:** หากพิกัดนี้มีข้อมูลที่เคยจัดเก็บไว้แล้วใน Cache ให้ข้ามขั้นตอนการเรียก API เพื่อลดค่าบริการ

### Step 3: Asset Classification (`09_ASSET_ENGINE`)
* **หน้าที่:** จำแนกประเภทรูปภาพที่ผู้ใช้อัปโหลดเข้ามา (เช่น สภาพที่ดิน, ทางเข้าโครงการ, วิวรอบๆ) สแกนหาคำที่ผิดกฎหมาย หรือคำต้องห้าม

### Step 4: House Generation (`10_HOUSE_ENGINE`)
* **หน้าที่:** สร้างรูปภาพจำลองของบ้านสไตล์ที่เหมาะสมหากยังไม่มีโครงสร้างบ้านอยู่จริงในที่ดิน
* **การตัดสินใจ:** ดำเนินการค้นหาใน `House Library` เพื่อนำรูปภาพของบ้านที่มีสไตล์เดียวกันในทำเลที่คล้ายกันกลับมาใช้งานก่อน

### Step 5: B-Roll Video Generation (`11_VIDEO_ENGINE`)
* **หน้าที่:** แปลงรูปภาพนิ่งที่มีสิทธิ์ใช้งานให้กลายเป็นวิดีโอสั้น B-Roll (ความยาว 3-5 วินาที) ที่มีทิศทางการเคลื่อนกล้องคมชัด
* **กฎสำคัญ:** วิดีโอที่ได้ต้องไร้การตกแต่งคำพูดหรือแบรนดิ้งใดๆ

### Step 6: Layout Composition (`12_RENDER_ENGINE`)
* **หน้าที่:** นำเอา B-Roll วิดีโอ มารวมกับโลโก้แบรนด์, คิวอาร์โค้ด, ราคา, รายละเอียดช่องทางการติดต่อของนายหน้า และไฟล์เสียงบรรยาย/ดนตรีประกอบ

### Step 7: Publishing (`14_PUBLISH_ENGINE`)
* **หน้าที่:** จัดส่งวิดีโอที่เรนเดอร์เสร็จสมบูรณ์พร้อมคำบรรยายภาพ (Captions/Hashtags) ส่งขึ้นแพลตฟอร์มปลายทางอัตโนมัติ

---

## 4. Input & Output Contract (Workflow Transition State)

ในการส่งต่อจากขั้นตอน **House Engine (Step 4)** ไปยัง **Video Engine (Step 5)** โครงสร้างข้อมูล JSON จะต้องมีลักษณะดังนี้:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Workflow_Step_House_to_Video_Payload",
  "type": "object",
  "required": ["transaction_id", "property_id", "house_assets", "camera_config"],
  "properties": {
    "transaction_id": { "type": "string", "format": "uuid" },
    "property_id": { "type": "string" },
    "house_assets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["asset_id", "image_url", "style_tag"],
        "properties": {
          "asset_id": { "type": "string" },
          "image_url": { "type": "string", "format": "uri" },
          "style_tag": { "type": "string" }
        }
      }
    },
    "camera_config": {
      "type": "object",
      "required": ["motion_type", "pan_speed"],
      "properties": {
        "motion_type": { "type": "string", "enum": ["ZOOM_IN", "PAN_RIGHT", "TILT_UP", "DRONE_REVEAL"] },
        "pan_speed": { "type": "number", "minimum": 0.1, "maximum": 1.0 }
      }
    }
  }
}
```

---

## 5. Workflow State Machine & Logic Control

```text
[Step 01: Property Raw]
        │
        ▼
   (Validate OK?)
     ├──► YES ──► [Step 02: Google Enrichment] ──► (Cache Hit?)
     │                                               ├──► YES ──► [Read Cache Maps] ────┐
     │                                               └──► NO  ──► [Call Google API] ────┼──┐
     └──► NO  ──► [TERMINATE: Raw Data Error]                                           │  │
                                                                                        │  │
 ┌──────────────────────────────────────────────────────────────────────────────────────┘  │
 │                                                                                         │
 ▼                                                                                         │
[Step 03: Asset Analyze] ◄─────────────────────────────────────────────────────────────────┘
        │
        ▼
[Step 04: House Library Search] ──► (Found Match?)
                                      ├──► YES ──► [Inject House URL] ──────────────────┐
                                      └──► NO  ──► [Call House Engine API] ──► [Save] ──┼──┐
                                                                                        │  │
 ┌──────────────────────────────────────────────────────────────────────────────────────┘  │
 │                                                                                         │
 ▼                                                                                         │
[Step 05: Video Engine] ◄──────────────────────────────────────────────────────────────────┘
        │
        ▼
[Step 06: Render Composite]
        │
        ▼
[Step 07: Auto Publish]
```

---

## 6. Retry & Recovery Protocols

* **Network Timeout Fallback:** หากเกิดข้อผิดพลาดในการโอนย้ายไฟล์ภาพขนาดใหญ่ระหว่างขั้นตอน (เช่น จาก Storage ไปยัง Video API) ระบบจะทำการตั้งเวลาลองใหม่ (Auto-retry) ทุกๆ 15, 30, และ 60 วินาที
* **Mid-Workflow Interruption Recovery:** หากระบบ Backend ขัดข้องระหว่างการ Gen วิดีโอในขั้นที่ 5 ตัวควบคุม (Orchestrator) จะบันทึกไฟล์ชั่วคราวไว้ และสามารถส่งคำสั่งต่อเนื่องไปสู่กระบวนการที่ 6 (Render) ได้ทันทีเมื่อระบบกู้คืนสภาพสำเร็จ โดยอ้างอิงจาก `transaction_id` เดิม

---

## 7. Best Practices

* **Asynchronous Execution:** ขั้นตอนที่ 4 (House Gen) และขั้นตอนที่ 5 (Video Gen) เป็นกระบวนการที่ใช้เวลาประมวลผลนาน (Long-running Tasks) ห้ามบังคับให้ Client รอรับการเชื่อมต่อแบบ Synchronous (HTTP Blocking) ให้ใช้ระบบ Webhook Callback เพื่อแจ้งเตือนผลลัพธ์การสร้างสื่อเมื่อสำเร็จ
* **Uniform File Naming:** เก็บไฟล์รูปภาพและวิดีโอทั้งหมดโดยใช้รูปแบบโครงสร้าง: `/properties/{property_id}/{transaction_id}/{engine_name}_{sequence}.mp4` เพื่อความเป็นระเบียบในการจัดสรรสิทธิ์

---

## 8. Anti-Patterns

* **The Linear Retry Block:** การที่ workflow พยายามย้อนกลับไปวิเคราะห์รูปที่ดินใหม่ทั้งหมดตั้งแต่สเต็ปที่ 1 เพียงเพราะว่าเกิดปัญหาในการส่งวิดีโอไปยัง TikTok ในสเต็ปที่ 7 (ควรดึงวิดีโอสุดท้ายที่เรนเดอร์สำเร็จแล้วในสเต็ปที่ 6 มาสั่งโพสต์ใหม่โดยเฉพาะ)

---

## 9. Implementation Example: n8n Logical Branching Code

โครงสร้างโค้ด JavaScript ที่ใช้เขียนใน Node ของ n8n (Function Node) เพื่อตัดสินใจเลือกระหว่างการนำภาพบ้านเก่ามาใช้ใหม่หรือส่งสั่งสร้างภาพใหม่:

```javascript
// Input data from House Library Search Node
const houseLibraryResult = items[0].json.house_library_search;
const transactionId = items[0].json.transaction_id;
const propertyId = items[0].json.property_id;

if (houseLibraryResult.found === true) {
  // นำผลลัพธ์เก่ามาประยุกต์ใช้งานทันที
  return [{
    json: {
      transaction_id: transactionId,
      property_id: propertyId,
      action: "REUSE_HOUSE_ASSET",
      house_image_url: houseLibraryResult.cached_image_url,
      cost_incurred: 0.00
    }
  }];
} else {
  // ส่งคำขอสร้างแบบแปลนบ้านใหม่
  return [{
    json: {
      transaction_id: transactionId,
      property_id: propertyId,
      action: "GENERATE_NEW_HOUSE",
      style_prompt: houseLibraryResult.recommended_style,
      cost_incurred: 0.01
    }
  }];
}
```

---

## 10. Claude Rules for Workflow Management

* เมื่อได้รับภารกิจในการปรับแต่งแผนผัง (Workflow) หรือแก้ไขโค้ดการไหลของข้อมูล คุณต้องรักษาโครงสร้างความต่อเนื่อง 7 สเต็ปนี้ไว้เสมอ
* ห้ามเขียนสคริปต์ที่กระโดดข้ามขั้นตอนสำคัญ เช่น การนำ Property Data ไปโยนเข้า Render Engine โดยไม่ได้ผ่านกระบวนการคัดกรองคำจาก Asset Engine ก่อน

---

## 11. Migration Guide (การย้ายจากระบบเดิม)

```text
[ระบบเดิม: 1-Node Linear Workflow] ──► [ทำการลบ Node การวิเคราะห์และสร้างรูปแบบรวบตึง]
                                                       │
                                                       ▼
[ระบบใหม่: 7-Node Isolated Step Workflows] ◄───────────┘
```

1. **ขั้นตอนที่ 1:** ปลดฟังก์ชันการประมวลผลด้วย Prompt ออกจาก n8n API call Node เดิม
2. **ขั้นตอนที่ 2:** สร้าง Webhook Receive Node สำหรับแต่ละขั้นตอนย่อย เพื่อสร้าง Event-Driven Flow บน n8n
3. **ขั้นตอนที่ 3:** ย้ายคีย์เก็บข้อมูลประวัติ (Histories) ไปไว้ใน Redis/Postgres กลางของโครงการเพื่อให้ท่อส่งข้อมูลดึงค่าอ้างอิงได้อย่างถูกต้อง
```
```

---

ไฟล์ `04_WORKFLOW.md` เรียบร้อยครับ ลำดับต่อไปคือ **`05_DATABASE.md`** ที่จะลงรายละเอียดเกี่ยวกับการออกแบบฐานข้อมูลสำหรับเก็บข้อมูลอสังหาริมทรัพย์, Asset Cache และการจัดการคลังจัดเก็บภาพบ้าน (House Library) ของโครงการ

เมื่อพร้อมแล้ว บอกให้ผมเขียนต่อได้เลยนะครับ!