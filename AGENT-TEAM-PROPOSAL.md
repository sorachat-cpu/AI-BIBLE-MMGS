# 🤖 AI Agent Team — ระบบจัดสรรงาน Real Estate Automation Platform

**วันที่:** 2026-09-02  
**จากการวิเคราะห์:** AI_BIBLE codebase ทั้งหมด (MMGS + LINE OA Bot)

---

## 📊 สรุประบบปัจจุบัน

โปรเจกต์นี้คือ **Real Estate AI Automation Platform** ที่ทำงานผ่าน 8 Workflow:

| WF | หน้าที่ | สถานะ |
|---|---|---|
| WF1 | รับข้อมูลทรัพย์ (Property Engine) | ✅ ใช้งานได้ |
| WF2 | Google Maps enrichment (nearby places) | ✅ ใช้งานได้ |
| WF3 | AI Analysis + Ad Card | ✅ ใช้งานได้ |
| WF4 | Content Generation (caption, script) | ✅ ใช้งานได้ |
| WF5 | AI Video Generation (Kling/Flux) | ✅ ใช้งานได้ |
| WF6 | Queue & Rate Limit | ✅ ใช้งานได้ |
| WF7 | Auto Publish (FB/IG/TikTok/LINE/YT) | ✅ ใช้งานได้ |
| WF8 | Photo→Narrated Video (voice clone) | ✅ ใช้งานได้ |

**Sub-systems:**
- **LINE OA Bot** — ถามตอบ + tool-use + Rich Menu + auto-reply + lead capture
- **Story Engine** — วิดีโอ cinematic (satellite zoom → plot → construction → contact)
- **Carousel Engine** — knowledge slides (SVG → PNG)
- **Map Zoom Engine** — drone-view zoom animation
- **Content Queue** — calendar-based posting schedule
- **Listings DB** — flat JSON → future PostgreSQL
- **lineao/** — LINE OA standalone Express server (ad images, broadcast, properties)

---

## 🏗️ Agent Team Architecture

### แนวคิด: **Hub & Spoke Model**

```
                    ┌─────────────────────┐
                    │   🧠 ORCHESTRATOR   │
                    │   (Master Agent)     │
                    │  รับ task → จ่ายงาน    │
                    └──────────┬──────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        │          │           │           │          │
   ┌────▼────┐ ┌───▼───┐ ┌────▼────┐ ┌────▼───┐ ┌───▼────┐
   │ INTAKE  │ │ MEDIA │ │ CONTENT │ │ PUBLISH│ │  CRM   │
   │ Agent   │ │ Agent │ │ Agent   │ │ Agent  │ │ Agent  │
   └─────────┘ └───────┘ └─────────┘ └────────┘ └────────┘
```

---

## 👥 Agent Definitions

### 1. 🧠 Orchestrator Agent (หัวหน้าทีม)

**หน้าที่:** รับคำสั่งจากเจ้าของ → วิเคราะห์ → จ่ายงานให้ Agent ที่เหมาะสม → ติดตามผล

**ทำอะไร:**
- รับ input ได้ทุกรูปแบบ (ข้อความ, รูป, ลิงก์, ไฟล์)
- ตัดสินใจว่าต้องใช้ Agent ตัวไหน (หรือหลายตัวพร้อมกัน)
- ติดตามสถานะงานทุกตัว
- สรุปรายงานประจำวัน/สัปดาห์
- จัดการ error — ถ้า Agent ตัวไหนล้ม ส่งงานให้ตัวอื่นหรือแจ้งเจ้าของ

**เทคโนโลยี:** Claude Opus/Sonnet + tool-use loop  
**Maps to:** `src/server.mjs` (current entrypoint)

---

### 2. 📥 Intake Agent (รับทรัพย์เข้าระบบ)

**หน้าที่:** รับข้อมูลทรัพย์ดิบ → สกัด → validate → enrichment

**ทำอะไร:**
- รับโพสต์จาก Facebook Group / LINE / paste text
- สกัดข้อมูล (Property Engine — Claude Haiku)
- Geocode + Google Maps enrichment (nearby places)
- จำแนกรูปถ่าย (Photo Classifier)
- สร้าง listing ใน DB
- ตัดสินใจ: ทรัพย์นี้ควรไป WF5 (AI video) หรือ WF8 (photo narration)?

**เทคโนโลยี:** Claude Haiku + Google Maps API + Sharp  
**Maps to:**
- `src/engines/property-engine.mjs`
- `src/engines/google-engine.mjs`
- `src/engines/photo-classifier.mjs`
- `src/content/listings.mjs`

---

### 3. 🎬 Media Agent (สร้างสื่อ)

**หน้าที่:** สร้างวิดีโอ / รูป / carousel ทุกรูปแบบ

**Sub-agents:**

| Sub-Agent | ทำอะไร | Engine |
|---|---|---|
| 🏗️ **Construction** | ที่ดินเปล่า → บ้านเสร็จ 5 stages | `construction-engine.mjs` |
| 🗺️ **MapZoom** | Satellite zoom → property | `mapzoom-engine.mjs` |
| 📸 **PhotoNarration** | รูปหลายรูป + voice clone → video | `photo-narration-engine.mjs` |
| 🎞️ **Story** | Full cinematic clip (ทุก scene รวมกัน) | `story-engine.mjs` |
| 🖼️ **Carousel** | Knowledge slides | `carousel-engine.mjs` |
| 🏠 **House** | AI generate บ้าน (Kling image) | `house-engine.mjs` |
| 🎥 **Video** | Still → motion clip (Kling video) | `video-engine.mjs` |
| 🔲 **Overlay** | Location card + Ending card + QR | `overlay-engine.mjs` + `svg-card.mjs` |
| 🎨 **Render** | FFmpeg composite ทุกอย่างรวมกัน | `render-engine.mjs` |

**เทคโนโลยี:** Kling API + Flux + FFmpeg + Sharp + ElevenLabs  
**Maps to:** `src/engines/*.mjs` ทั้งหมด

---

### 4. ✍️ Content Agent (สร้างเนื้อหา)

**หน้าที่:** เขียน caption, script, voice script, hashtag

**ทำอะไร:**
- เขียน caption ให้แต่ละแพลตฟอร์ม (FB/IG/TikTok/LINE/YT) — ปรับ tone & ความยาวตามแพลตฟอร์ม
- เขียน voice script สำหรับ narration
- สร้าง hashtag ที่เกี่ยวข้อง
- เขียน group post caption (สำหรับ manual kit)
- สร้างเนื้อหา knowledge carousel topics
- คำนวณค่าโอน (land-tax calculator) สำหรับใส่ใน content

**เทคโนโลยี:** Claude Haiku/Sonnet  
**Maps to:**
- `src/publish/captions.mjs`
- `src/content/topics.mjs`
- `src/lib/prompt-library.mjs`
- `src/lib/land-tax.mjs`

---

### 5. 📢 Publish Agent (เผยแพร่)

**หน้าที่:** จัดคิว + โพสต์ทุกแพลตฟอร์ม

**ทำอะไร:**
- จัดการ posting calendar (ทุกวัน ทุกเวลา ทุกแพลตฟอร์ม)
- Fan-out publish ไปทุกช่องทางพร้อมกัน
- จัดการ rate limit (10 clips/day)
- สร้าง manual kit สำหรับ Facebook Group (ไม่มี API)
- จัดคิว repost ของโพสต์ที่ดีที่สุด
- Track สถานะโพสต์ (DRAFT → READY → POSTED)

**เทคโนโลยี:** Facebook Graph API + TikTok API + YouTube API + LINE Messaging API  
**Maps to:**
- `src/engines/publish-engine.mjs`
- `src/publish/adapters/*.mjs`
- `src/content/queue.mjs`
- `src/content/calendar.mjs`
- `src/content/stock.mjs`

---

### 6. 💬 CRM Agent (ดูแลลูกค้า)

**หน้าที่:** ตอบแชท LINE + จัดการ lead + นัดหมาย

**ทำอะไร:**
- ตอบคำถามลูกค้าผ่าน LINE OA (tool-use loop)
- ค้นหาทรัพย์ตามที่ลูกค้าถาม
- คำนวณค่าโอนให้ลูกค้า
- บันทึก lead + ข้อมูลการติดต่อ
- นัดดูที่ดิน
- ส่ง listing card / carousel flex message
- Auto-reply + broadcast

**เทคโนโลยี:** Claude Sonnet + LINE Messaging API  
**Maps to:**
- `src/engines/line-bot-engine.mjs`
- `src/content/conversations.mjs`
- `src/content/customers.mjs`
- `src/content/appointments.mjs`
- `lineao/` (standalone LINE server)

---

## 🆕 ไอเดียเพิ่มเติม — Agent ใหม่ที่ยังไม่มี

### 7. 📊 Analytics Agent (วิเคราะห์ผลงาน)

**ทำอะไร:**
- ดึง engagement data จากทุกแพลตฟอร์ม (views, likes, shares, comments, saves)
- วิเคราะห์ว่า content แบบไหน ดีกับแพลตฟอร์มไหน
- แนะนำ: ควรโพสต์อะไร เมื่อไหร่ แพลตฟอร์มไหน
- A/B test: caption สไตล์ A vs B ตัวไหนดีกว่า
- สรุปรายงานประจำสัปดาห์ส่ง LINE ให้เจ้าของ
- Track ROI: ค่าใช้จ่าย AI (Kling credits, API calls) vs engagement ที่ได้

**ทำไมต้องมี:** ตอนนี้ระบบโพสต์ได้แต่ไม่รู้ว่าอะไร work — เหมือนยิงลูกธนูในที่มืด

---

### 8. 🏘️ Market Agent (วิเคราะห์ตลาด)

**ทำอะไร:**
- Monitor ราคาที่ดินรอบๆ พื้นที่เป้าหมาย
- Scrape โพสต์คู่แข่งจาก Facebook Group ดูว่าเขาขายอะไร ราคาเท่าไหร่
- แจ้งเตือนเมื่อมีที่ดินราคาต่ำกว่าตลาดเข้ามา (โอกาสซื้อ)
- เปรียบเทียบราคา/ตร.วา ของแต่ละพื้นที่
- สร้าง market report ให้ลูกค้าดู (เป็น carousel หรือ infographic)

**ทำไมต้องมี:** ข้อมูลตลาดทำให้ content น่าเชื่อถือขึ้น + ช่วยตั้งราคาถูก

---

### 9. 🔄 Reengagement Agent (ดึงลูกค้ากลับมา)

**ทำอะไร:**
- ติดตาม lead ที่เงียบไป (ไม่ตอบ LINE มา 3 วัน, 7 วัน, 30 วัน)
- ส่ง follow-up message อัตโนมัติ (ไม่ spam — มีเหตุผล เช่น "มีแปลงใหม่ใกล้ที่คุณสนใจ")
- สร้าง personalized content ตามความสนใจของ lead (ดูแปลงไหนบ่อย, ถามอะไร)
- แจ้งเตือนเมื่อราคาแปลงที่ lead สนใจลดลง
- Birthday/ปีใหม่ greeting (สร้าง rapport)

**ทำไมต้องมี:** Lead ที่มีแล้วแพงกว่าหา lead ใหม่เสมอ — ดึงกลับมาคุ้มกว่า

---

### 10. 📝 Legal & Docs Agent (เอกสารและกฎหมาย)

**ทำอะไร:**
- สร้างเอกสารเบื้องต้น: สัญญาจะซื้อจะขาย, ใบจอง, หนังสือมอบอำนาจ
- คำนวณภาษีและค่าธรรมเนียมโอน (ขยายจาก land-tax.mjs)
- ตรวจสอบข้อมูลโฉนด (ที่ดินทับซ้อน, ภาระจำยอม)
- แจ้งเตือน deadline สำคัญ (วันครบกำหนดสัญญาจะซื้อจะขาย)
- ตอบคำถามกฎหมายเบื้องต้น (FAQ — ไม่ใช่คำปรึกษากฎหมาย)

**ทำไมต้องมี:** ค่าโอนผิด 1 ครั้ง = เสียลูกค้า. ระบบปัจจุบันมีแค่ calculator อย่างเดียว

---

### 11. 🌍 Multi-language Agent (ขยายตลาดต่างชาติ)

**ทำอะไร:**
- แปล content เป็น EN/CN/JP/KR สำหรับ expat/นักลงทุนต่างชาติ
- สร้าง caption เฉพาะแพลตฟอร์มต่างชาติ (Xiaohongshu, WeChat, LINE Japan)
- Voice narration หลายภาษา
- ปรับ selling point ตามวัฒนธรรม (จีนสนใจ feng shui, ญี่ปุ่นสนใจ convenience)

**ทำไมต้องมี:** ที่ดินนครนายก ใกล้ BKK ราคาถูก — expat สนใจ

---

## 🗓️ แผนดำเนินการ (Priority Order)

### Phase 1 — ทันที (ใช้ codebase ปัจจุบันได้เลย)
| # | Agent | เหตุผล |
|---|---|---|
| 1 | **Orchestrator** | เป็น hub — ไม่มีตัวนี้ Agent อื่นทำงานไม่ได้ |
| 2 | **Intake** | อยู่แล้ว แค่ wrap เป็น agent pattern |
| 3 | **Media** | อยู่แล้ว แค่ wrap เป็น agent pattern |
| 4 | **Content** | อยู่แล้ว แค่ wrap เป็น agent pattern |
| 5 | **Publish** | อยู่แล้ว แค่ wrap เป็น agent pattern |
| 6 | **CRM** | อยู่แล้ว (line-bot-engine) แค่ wrap |

### Phase 2 — เดือนหน้า (ROI สูงสุด)
| # | Agent | เหตุผล |
|---|---|---|
| 7 | **Analytics** | รู้ว่าอะไร work → ปรับทุกอย่างดีขึ้น |
| 8 | **Reengagement** | Lead มีอยู่แล้ว แค่ต้องดึงกลับ |

### Phase 3 — 2-3 เดือน (ขยายตลาด)
| # | Agent | เหตุผล |
|---|---|---|
| 9 | **Market** | ข้อมูลตลาดเพิ่ม credibility |
| 10 | **Legal & Docs** | ลดงาน manual + ลดข้อผิดพลาด |
| 11 | **Multi-language** | เปิดตลาดใหม่ |

---

## 🔧 Technical Implementation

### Agent Communication Pattern

```javascript
// agent-orchestrator.mjs
export class Orchestrator {
  constructor() {
    this.agents = {
      intake:    new IntakeAgent(),
      media:     new MediaAgent(),
      content:   new ContentAgent(),
      publish:   new PublishAgent(),
      crm:       new CRMAgent(),
      analytics: new AnalyticsAgent(),
    };
    this.jobQueue = new JobQueue();  // persistent queue (content/jobs.json → Postgres)
  }

  async dispatch(task) {
    const plan = await this.plan(task);       // Claude decides which agents
    const jobs = plan.steps.map(step => ({
      agent: step.agent,
      input: step.input,
      depends_on: step.depends_on,            // DAG execution
    }));
    return this.jobQueue.enqueue(jobs);
  }

  async plan(task) {
    // Claude tool-use: analyze task → return execution plan
    // Example: "โพสต์ทรัพย์ใหม่ PROP-TH-12345"
    // → intake.validate → media.story + content.caption (parallel) → publish.fanout
  }
}
```

### Job State Machine

```
QUEUED → RUNNING → COMPLETED
                 → FAILED → RETRY (max 3) → DEAD_LETTER
```

### Agent Base Class

```javascript
// agents/base.mjs
export class BaseAgent {
  constructor(name, tools) {
    this.name = name;
    this.tools = tools;        // engine functions this agent can call
    this.status = 'idle';
  }

  async execute(job) {
    this.status = 'running';
    try {
      const result = await this.run(job.input);
      this.status = 'idle';
      return { success: true, output: result };
    } catch (err) {
      this.status = 'error';
      return { success: false, error: err.message, code: err.code };
    }
  }

  // Subclass implements this
  async run(input) { throw new Error('not implemented'); }
}
```

---

## 📈 Expected Impact

| Metric | ปัจจุบัน (manual) | หลังใช้ Agent Team |
|---|---|---|
| ทรัพย์ใหม่ → โพสต์พร้อม | 2-4 ชม. | 5-15 นาที |
| โพสต์/วัน | 1-2 | 4-6 (multi-platform) |
| Lead follow-up | ลืมบ่อย | 100% automated |
| ข้อผิดพลาด caption/ราคา | สัปดาห์ละ 1-2 ครั้ง | ~0 (validation) |
| ต้นทุน/โพสต์ | ~฿15 (AI gen) | ~฿8 (smart routing WF5 vs WF8) |
| ภาษาที่รองรับ | ไทยเท่านั้น | ไทย + EN + CN (Phase 3) |

---

## 💡 Quick Win ที่ทำได้เลยวันนี้

1. **Hermes Cron Job → Daily Publisher Agent**  
   ตั้ง cron ให้ `npm run daily` ทำงานทุกเช้า — ดึง queue → render → publish อัตโนมัติ

2. **Hermes Cron Job → Lead Follow-up**  
   ทุก 6 ชม. เช็คลูกค้าที่เงียบไป → ส่ง LINE follow-up

3. **Hermes Cron Job → Stock Scanner**  
   ทุกเที่ยงคืน scan content/media/ → สร้าง draft posts สำหรับวันรุ่งขึ้น

4. **Wrap เป็น Hermes Skill**  
   สร้าง skill สำหรับแต่ละ agent → เรียกใช้ผ่าน Hermes ได้ทันที
