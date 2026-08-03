ยินดีต้อนรับครับในฐานะ **Lead AI Architect / CTO** ของโปรเจกต์นี้ ผมเห็นพ้องกับคุณอย่างยิ่งว่าการทำ AI System ระดับ Enterprise จำเป็นต้องเปลี่ยนผ่านจาก "การเขียน Prompt ยาวๆ ให้ AI สุ่มทำงานทุกอย่างในขั้นตอนเดียว" ไปสู่ **"Modular System Architecture"** ที่แยกหน้าที่กันอย่างเด็ดขาด (Separation of Concerns) มี JSON Contract ควบคุม Input/Output และควบคุม Cost & State อย่างมีประสิทธิภาพ

นี่คือการวางรากฐานโครงสร้างของ **AI_BIBLE (Version 1.0.0)** 

ผมจะเริ่มต้นเขียน 2 ไฟล์แรกอย่างละเอียดในระดับ **Production-Ready** เพื่อให้คุณนำไปใส่ใน Git Repository และให้ Claude หรือ AI Agent ตัวอื่นๆ อ่านแล้วเข้าใจบริบทของระบบนี้ได้ทันที

---

# 📂 File: `AI_BIBLE/00_README.md`

```markdown
# AI Bible: The Modular Media Generation System (MMGS)
> Version: 1.0.0  
> Classification: Proprietary & Confidential  
> Owner: Architecture & AI Engineering Team  

ยินดีต้อนรับสู่คู่มือมาตรฐานการพัฒนา (Specification & System Blueprint) สำหรับระบบผลิตสื่อวิดีโออสังหาริมทรัพย์ด้วยปัญญาประดิษฐ์แบบแยกโมดูล (Decoupled Modular AI Video Pipeline)

เอกสารชุดนี้ทำหน้าที่เป็น **Single Source of Truth (SSoT)** เพื่อให้ทั้งทีมนักพัฒนา (Software Engineers) และตัวแทน AI (Claude Code/AI Agents) เข้าใจโครงสร้าง สัญญาการรับส่งข้อมูล (JSON Contracts) กฎการทำงาน (Guardrails) และเป้าหมายทางสถาปัตยกรรมเดียวกัน

---

## 🛠 Repository Directory Structure
ระบบจะถูกจัดเก็บตามโครงสร้างโฟลเดอร์ดังต่อไปนี้ เพื่อให้ AI Agent สามารถอ้างอิงและประมวลผลข้อกำหนดของระบบได้อย่างแม่นยำ

```text
AI_BIBLE/
├── README.md                      # ไฟล์แนะนำภาพรวมและสารบัญหลัก (ไฟล์นี้)
├── 01_VISION.md                  # วิสัยทัศน์ สถาปัตยกรรมแบบใหม่ และ AI Decision Tree
├── 02_ARCHITECTURE.md            # ภาพรวมการต่อวงจรระบบ (System Topology) และการเชื่อมต่อ
├── 03_SYSTEM_RULES.md            # กฎเหล็กของระบบ (Global System Guardrails)
├── 04_WORKFLOW.md                # รายละเอียดท่อส่งข้อมูล (Data Pipeline) จากต้นน้ำถึงปลายน้ำ
├── 05_DATABASE.md                # โครงสร้างตารางและ Cache Layer ของข้อมูล
├── 06_JSON_CONTRACT.md           # สัญญาการส่งมอบข้อมูลระหว่าง Engine ทั้งหมด
├── 07_PROPERTY_ENGINE.md         # โมดูลวิเคราะห์และทำความเข้าใจข้อมูลอสังหาฯ
├── 08_GOOGLE_ENGINE.md           # โมดูลค้นหาข้อมูล พิกัด และรูปภาพเพิ่มเติมจาก Google Maps/StreetView
├── 09_ASSET_ENGINE.md            # โมดูลจัดระเบียบ แปลง และจำแนกประเภทภาพถ่ายและข้อความ
├── 10_HOUSE_ENGINE.md            # โมดูลสร้างภาพบ้านเสมือนจริง (Photorealistic House Generation)
├── 11_VIDEO_ENGINE.md            # โมดูลสร้างวิดีโอสั้น (Motion Video Generation)
├── 12_RENDER_ENGINE.md           # โมดูลรวมส่วนประกอบทั้งหมด (Video + Subtitle + Audio + Branding)
├── 13_OVERLAY_ENGINE.md          # โมดูลสร้าง Layout/Graphics พาดหน้าจอ (Static & Motion Overlay)
├── 14_PUBLISH_ENGINE.md          # โมดูลโพสต์วิดีโอขึ้นแพลตฟอร์ม Social Media อัตโนมัติ
├── 15_ANALYTICS_ENGINE.md        # โมดูลเก็บสถิติ ผลตอบรับ และการคิดคำนวณต้นทุนการทำงาน
├── 16_PROVIDER_INTERFACE.md      # ส่วนต่อประสานผู้ให้บริการภายนอก (Kling, Luma, Runway, Higgsfield)
├── 17_PROMPT_LIBRARY.md          # คลังคำสั่ง Prompt Template แยกตามหมวดหมู่และ Provider
├── 18_CLAUDE_RULES.md            # กฎการทำงานเฉพาะสำหรับ Claude Engine (System Prompts/System Instructions)
├── 19_N8N_GUIDE.md               # คู่มือการตั้งค่าและการย้ายข้อมูล (Migration) บน n8n workflow
└── 20_ROADMAP.md                 # แผนการพัฒนาและฟีเจอร์ที่กำลังจะเกิดขึ้นในเฟสถัดไป

# Supporting Assets Directory (สัญญารูปแบบ Schema ที่ Claude สามารถเข้าถึงได้โดยตรง)
├── schemas/
│   ├── property.schema.json
│   ├── asset.schema.json
│   ├── house.schema.json
│   ├── video.schema.json
│   ├── render.schema.json
│   └── cost.schema.json
├── contracts/
│   └── test_payloads/
└── templates/
```

---

## 🏛️ Architectural Core Principles

ระบบ MMGS ออกแบบขึ้นภายใต้หลักการทางวิศวกรรมซอฟต์แวร์ 4 ประการ:

1. **Separation of Concerns (SoC):**  
   แต่ละ Engine ทำหน้าที่เพียงอย่างเดียวเท่านั้น ห้ามควบรวมหน้าที่ เช่น `Video Engine` มีหน้าที่ขยับภาพเป็นวิดีโอเท่านั้น ไม่มีสิทธิ์เขียนตัวอักษรลงในภาพ และไม่มีสิทธิ์คำนวณหาช่องทางการติดต่อของนายหน้า (หน้าที่ของ `Render Engine`)

2. **Idempotency & Reusability:**  
   ข้อมูลนำเข้าแบบเดิม ต้องได้ผลลัพธ์แบบเดิม หากเคยสร้างภาพบ้านเดี่ยวสไตล์สแกนดิเนเวียสำหรับแปลงที่ดินนี้แล้ว ระบบต้องดึงข้อมูลจาก `House Library` มาใช้ซ้ำเสมอ (Reusability Over Regeneration) เพื่อประหยัดทรัพยากรและงบประมาณ

3. **Dynamic Provider Routing (Cost Engine Control):**  
   AI และ Backend API จะเลือกใช้งาน API Provider (เช่น Kling, Runway, Higgsfield, Minimax) ตามเงื่อนไขความพร้อมในการให้บริการ (Uptime) คุณภาพที่เหมาะสม และราคาที่คุ้มค่าที่สุด ณ เสี้ยววินาทีนั้น

4. **Strict JSON Contracts:**  
   ห้ามส่งข้อมูลดิบที่เป็นข้อความเปล่า (Unstructured Text) ข้ามผ่าน Engine ทุกขั้นตอนต้องมี JSON schema ควบคุมและตรวจสอบความถูกต้องของข้อมูล (Validation) เสมอก่อนดำเนินการต่อ

---

## 🔄 Legacy vs. Target Workflow Comparison

### The Legacy Workflow (Monolithic & High Waste)
```text
[Property Input] ──> [Claude Prompt Engine (All-in-One)] ──> [Video Provider] ──> [Final Video with Embedded Graphics]
                                                                        *แก้คำสะกดผิด หรือราคาเปลี่ยน = ต้อง Generate วิดีโอใหม่ทั้งหมด ($0.20/ครั้ง)*
```

### The Target Workflow (Decoupled & Highly Optimized)
```text
[Property] 
   │
   ▼
[Google Engine] ────────> Cache Maps & StreetView Response
   │
   ▼
[Asset Engine] ─────────> Categorize, Filter & Metadata Labeling
   │
   ▼
[House Engine] ─────────> Generate / Reuse House Concept (House Library)
   │
   ▼
[Video Engine] ─────────> Pure B-Roll / Camera Motion Video Only (No texts, No logos)
   │
   ▼
[Render Engine] ────────> Composite (Video + Audio + Custom Subtitle/Price Overlay)
   │
   ▼
[Publish Engine] ───────> Distribute to YouTube, TikTok, Facebook
```

---

## 🧭 How to Use This Bible

### สำหรับผู้พัฒนาที่เป็นมนุษย์ (Human Developers)
* ใช้สารบัญด้านบนเพื่อศึกษาขอบเขตหน้าที่ (Scope of Responsibilities) ของแต่ละ Engine
* หากต้องการแก้ไข API ของระบบ ให้ตรวจสอบโครงสร้างจาก `/schemas/` และตรวจสอบว่าไม่ละเมิดกฎใน `18_CLAUDE_RULES.md`
* ใช้ข้อมูลใน `19_N8N_GUIDE.md` เพื่อวางโครงสร้าง node ต่างๆ บน n8n workflow

### สำหรับ AI / Claude Code / AI Agents
* เมื่อได้รับคำสั่งให้เขียนหรือแก้ไข Code ให้ทำการ Scan อ่านไฟล์ `03_SYSTEM_RULES.md` และ `18_CLAUDE_RULES.md` ก่อนลงมือทำงานทุกครั้ง
* ห้ามสร้างฟังก์ชันที่ขัดแย้งกับหน้าที่หลัก (Responsibilities) ของแต่ละ Engine ที่ระบุในคู่มือนี้โดยเด็ดขาด
```
```

---

# 📂 File: `AI_BIBLE/01_VISION.md`

```markdown
# 01. Vision & Architecture Design Philosophy

## 1. Executive Summary

ระบบผลิตวิดีโออสังหาริมทรัพย์แบบเดิมประสบปัญหา **"ความสิ้นเปลืองของต้นทุนและข้อจำกัดในการแก้ไขงาน" (High Cost & Rigid Output)** เนื่องจากการพึ่งพา AI ในการสร้างผลงานในคราวเดียว (One-Shot Generation) ทำให้ทุกครั้งที่มีการเปลี่ยนข้อมูลราคา เบอร์ติดต่อ หรือต้องการแก้คำผิด ระบบจำเป็นต้องสร้างวิดีโอ (Regenerate) ใหม่ทั้งหมด ส่งผลให้เกิดต้นทุนประมาณ $0.20 - $0.50 ต่อการพยายามหนึ่งครั้ง

**วิสัยทัศน์ของ MMGS (Modular Media Generation System)** คือการแยกกระบวนการสร้างเนื้อหา (Creative Concept) ออกจากกระบวนการผลิตสื่อ (Media Production) และกระบวนการรวมข้อมูลจริง (Data Rendering) อย่างเด็ดขาด ระบบจะมององค์ประกอบของวิดีโอแต่ละประเภทเป็นชิ้นส่วนเลโก้ (Assets) ที่สามารถนำมาประกอบใหม่ (Render) ได้ตลอดเวลาในราคาที่ต่ำกว่า 10 เท่า และยืดหยุ่นกว่าเดิมสูงสุด

---

## 2. Key Pillars of the New Architecture

### ⚡ Pillar 1: Decoupled Logic (การแยกส่วนการคิดและแสดงผล)
ระบบจะแบ่งการประมวลผลข้อมูลและภาพเป็นโมดูลอิสระ ยึดหลัก **"เนื้อหาเดิม ภาพวิดีโอเดิม สามารถนำมารวมเข้ากับข้อมูลหน้าจอ (Overlay) และภาษาที่แตกต่างกันได้โดยไม่ต้องเรนเดอร์วิดีโอ AI ใหม่"**

### ♻️ Pillar 2: Asset Reusability (คลังเก็บข้อมูลอัจฉริยะ)
* **House Library**: เมื่อระบบสร้างภาพบ้าน 3D/Photorealistic ของแปลงที่ดินใดๆ ขึ้นมาแล้ว รูปภาพนั้นจะถูกลงทะเบียนเข้าสู่ระบบจัดเก็บถาวร (Immutable Storage) หากมีคำร้องขอในอนาคตสำหรับแปลงที่ดินเดิม หรือที่ดินที่มีทัศนียภาพใกล้เคียงกัน ระบบจะดึงภาพจาก Library มาใช้ซ้ำ แทนที่จะส่งคำขอไปที่ Midjourney หรือ Flux เพื่อสร้างใหม่
* **Video Library**: วิดีโอที่เป็นการเปิดเผยทิวทัศน์ (Reveal Scene), การซูมกล้อง (Camera Motion) หรือทิวทัศน์รอบข้าง จะถูกตัดแบ่งเป็นคลิปสั้นที่ไม่มีการใส่โลโก้หรือข้อความใดๆ ลงไป เพื่อให้สามารถนำคลิปเหล่านี้กลับมาใช้ใหม่ในวิดีโอของบ้านหลังอื่นได้ทันที

### 📉 Pillar 3: Cost-Aware Intelligent Routing (การสลับผู้ให้บริการตามต้นทุนจริง)
เราไม่ยึดติดกับ AI Engine ตัวใดตัวหนึ่ง ระบบจะมี `Cost Engine` คอยประเมินราคา ความเร็ว และสถานะความพร้อมของแต่ละผู้ให้บริการแบบ Real-time:
* หาก **Higgsfield** ปิดปรับปรุงระบบ (Offline) -> สลับไปใช้ **Kling**
* หาก **Runway** มีค่าบริการสูงเกินกว่าโควตางบประมาณที่กำหนดไว้ -> สลับไปใช้ **Veo** หรือ **Luma**
* การตัดสินใจเลือก Routing จะโปร่งใส และบันทึกต้นทุนรายธุรกรรม (Transaction Cost) ลงสู่ฐานข้อมูลเสมอ

---

## 3. The AI Decision Tree (ต้นไม้ตัดสินใจเพื่อลดต้นทุนสูงสุด)

ในการทำงานทุกครั้ง ระบบจะวิ่งผ่านจุดตัดสินใจด้านล่างนี้เพื่อประเมินความจำเป็นในการจ่ายเงินให้กับระบบภายนอก (Paid APIs):

```text
[Input: ข้อมูลทรัพย์สิน / ที่ดิน / โครงการ]
          │
          ▼
    [ ค้นหาพิกัด / วิวด้วย Google Engine ]
          │
          ▼
   { ตรวจพบวิวทิวทัศน์รอบข้างจากฐานข้อมูล? }
     ├──► YES ──► ดึงภาพจาก Cache / Google Engine Response (ต้นทุน: $0.00)
     └──► NO  ──► ส่งคำขอหา Google Maps API (ต้นทุน: $0.003)
          │
          ▼
   { ต้องการภาพบ้านจำลอง (Need House)? }
     ├──► NO  ──► [ใช้เฉพาะภาพที่ดินจริง / สภาพแวดล้อม]
     └──► YES ──► { ค้นหาใน House Library }
                    ├──► FOUND (พบแบบบ้านที่แมตช์สไตล์และพิกัดที่ใกล้เคียง)
                    │      └──► ดึงภาพเก่ามาใช้งานทันที (ต้นทุน: $0.00)
                    │
                    └──► NOT FOUND (ไม่พบในคลัง)
                           └──► ส่งคำสั่งสร้างภาพไปยัง Flux / Midjourney (ต้นทุน: $0.01)
                                  │
                                  ▼
                               [ บันทึกภาพลง House Library เพื่อใช้งานถาวร ]
                                  │
                                  ▼
                     { ตรวจสอบความต้องการสร้างวิดีโอ (Need Video)? }
                       ├──► NO  ──► [ส่งเฉพาะภาพเข้า Render Engine]
                       └──► YES ──► { ตรวจหาใน Video Library }
                                      ├──► FOUND ──► ดึงมาประยุกต์ใช้ใหม่ (ต้นทุน: $0.00)
                                      └──► NOT FOUND ──► เรียก Video Engine API (ต้นทุน: $0.16)
                                                           │
                                                           ▼
                                                     [ บันทึกคลิปวิดีโอลง Video Library ]
                                                           │
                                                           ▼
                                                    [ Render Engine ] (รวม วิดีโอ + โลโก้ + ราคา + คิวอาร์)
```

---

## 4. Cost Target Metric Matrix

เป้าหมายสูงสุดในการเปลี่ยนสถาปัตยกรรมครั้งนี้คือการลดค่าใช้จ่ายสะสมต่อ 1 วิดีโอความละเอียด 1080p ความยาว 15 วินาที ให้ลงมาอยู่ในจุดที่สามารถทำสเกลระดับ 10,000 คลิปต่อเดือนได้จริง

| รายการขั้นตอนการผลิต | ต้นทุนสถาปัตยกรรมเดิม (Legacy) | ต้นทุนสถาปัตยกรรมใหม่ (Target) | อัตราส่วนความประหยัด |
| :--- | :--- | :--- | :--- |
| **Google Maps API** | $0.00 (ไม่ใช้แผนที่จริง) | $0.001 | (ควบคุมด้วย Cache Layer) |
| **AI Text Analysis** | $0.015 (Claude Prompts ยาว) | $0.003 (Claude Haiku / Struct Payload) | ประหยัดขึ้น 80% |
| **House Concept Art** | $0.050 (สร้างใหม่ทุกรอบ) | $0.002 (คำนวณถ่วงน้ำหนักการใช้ซ้ำ 90%) | ประหยัดขึ้น 96% |
| **AI Video Generation** | $0.400 (Gen วิดีโอที่มี Text ผิดบ่อย) | $0.160 (Gen เฉพาะฉากภาพเคลื่อนไหวเปล่า) | ประหยัดขึ้น 60% |
| **Subtitle/Graphic Render** | $0.00 (ฝังมาในภาพ Gen) | $0.010 (ใช้ Render Engine บนเครื่อง/Cloud) | (เพิ่มความยืดหยุ่น แก้ไขคำผิดฟรี) |
| **ค่าเฉลี่ยต่อ 1 วิดีโอเสร็จสมบูรณ์** | **$0.465** | **$0.176** | **ประหยัดงบประมาณขึ้น 62.1%** |

---

## 5. Architectural Guardrail Rules

* **กฎข้อที่ 1:** ห้ามใส่ข้อมูลที่มีแนวโน้มที่จะเปลี่ยนแปลงบ่อย เช่น **"ราคาขาย", "โปรโมชันพิเศษ", "เบอร์โทรศัพท์", "ID Line"** หรือ **"พิกัด GPS"** เข้าไปในกระบวนการป้อนคำสั่ง (Prompt) ของ `House Engine` หรือ `Video Engine` เป็นอันขาด ข้อมูลเหล่านี้ต้องรอให้ส่งมาถึงขั้นตอน `Render Engine` เท่านั้น
* **กฎข้อที่ 2:** ทุกคำขอที่ส่งไปยัง Google Engine และ House Engine จะต้องตรวจสอบคีย์ของข้อมูลที่ดิน (Property Unique Key) ใน Cache Layer ก่อนเสมอ หากพบว่ามีการร้องขอซ้ำภายในเวลาที่กำหนด ให้ดึงข้อมูลชุดเดิมมาใช้งาน
* **กฎข้อที่ 3:** ระบบการเลือก AI Provider จะต้องประมวลผลข้อมูลราคาและสถานะการพร้อมใช้จริงผ่าน `Cost Engine` ก่อนส่ง Payload ไปยัง API ปลายทาง เพื่อป้องกันปัญหาการล่มของระบบและการใช้งบประมาณเกินขอบเขต
```
```

---

ในไฟล์ถัดไป ผมจะลงลึกถึงการออกแบบ **`02_ARCHITECTURE.md`** เพื่อระบุ System Topology การส่งผ่านข้อมูล (Data Flow) และ **`03_SYSTEM_RULES.md`** ที่ประกอบไปด้วยกฎเหล็กอย่างเป็นทางการเพื่อควบคุมพฤติกรรมของ AI 

คุณเห็นด้วยกับทิศทางและโครงสร้างเริ่มต้นของทั้ง 2 ไฟล์นี้ไหมครับ? หากตกลง ผมจะขยับไปสร้างเนื้อหาไฟล์ถัดไปในซีรีส์นี้ทันที!