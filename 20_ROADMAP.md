# 20. Roadmap & Progress Tracker

> Version: 1.0.0 (first populated — file was empty until this pass)
> Owner: Architecture & AI Engineering Team
> Purpose: แผนพัฒนาเป็นเฟสของระบบ MMGS และตารางติดตามความคืบหน้าที่ต้อง**อัปเดตทุกครั้ง**ที่มีความคืบหน้าใหม่ เพื่อให้ตัวแทน AI (Claude Code) หรือทีมงานที่กลับมาทำงานต่อในภายหลัง อ่านไฟล์นี้ไฟล์เดียวแล้วรู้ทันทีว่าระบบไปถึงไหนแล้ว

---

---

# 🔖 อ่านตรงนี้ก่อนเมื่อกลับมาทำต่อ (สรุป ณ 29 ก.ค. 2026)

> พักโปรเจกต์ไว้ตรงนี้ ทุกอย่างรันได้ปกติ ไม่มีอะไรค้างครึ่งๆ กลางๆ
> รายละเอียดเต็มอยู่ใน "5. Change Log" ด้านล่าง ส่วนนี้คือสรุปให้จับต้นชนปลายได้เร็ว

## ⏰ เรื่องด่วนที่สุด (เช็คก่อนอย่างอื่น)

**เครดิต Kling เหลือ 77 units และหมดอายุ 31 ก.ค. 2026** — ถ้าอ่านหลังจากนั้นแปลว่าหมดแล้ว ต้องซื้อใหม่
เช็คยอดล่าสุดได้ด้วย:
```bash
curl -sS "https://api.klingai.com/account/costs?start_time=<ms>&end_time=<ms>" \
  -H "Authorization: Bearer $KLING_API_KEY"
```

## สถานะจริง: อะไรใช้ได้ อะไรไม่ได้

| ส่วน | สถานะ | หมายเหตุ |
|---|---|---|
| Property Engine | ✅ ใช้ได้ | แยกข้อมูลจากประกาศดิบ กรองเบอร์โทร/คำโฆษณาออก |
| Google Engine | ✅ ใช้ได้ | รับลิงก์ Google Maps + ดึงสถานที่ใกล้เคียง 7 หมวด |
| Video Engine | ✅ ใช้ได้ | Kling · รองรับเฟรมเริ่ม-จบ |
| Render Engine | ✅ ใช้ได้ | ต่อคลิป + ซับไทย + การ์ด overlay + export 9:16 & 16:9 |
| Overlay Engine | ✅ ใช้ได้ | การ์ดทำเล + การ์ดปิดท้าย + QR |
| Storyboard 4 จังหวะ | ✅ ใช้ได้ | หมุดแผนที่ → ดิ่งลงที่ดิน → บ้านขึ้น → การ์ดข้อมูล |
| **House Engine** | ⛔ **ติด** | โค้ดครบ ทดสอบผ่าน validation แล้ว — **ติดที่ Kling ไม่มีโควตารูป** |
| **Construction 5 ขั้น** | ⛔ **ติด** | เหตุผลเดียวกัน + ราคา ~$0.87 เกินเพดาน $0.30 ที่สเปกตั้งไว้ |
| Publish Engine | ✅ เขียนเสร็จ | โพสต์หลายแพลตฟอร์มพร้อมกัน · ชุดโพสต์ลงกลุ่มใช้ได้เลย · ที่เหลือรอ token (ดู `21_PUBLISH_SETUP.md`) |
| **ชีทที่ดิน (โพสต์ลงกลุ่ม)** | ✅ ใช้ได้เลย | ดึงที่ดินจากโพสต์เก่า → ตารางพร้อมลิงก์แผนที่ + สถานที่ใกล้เคียง 3 อันดับ → แคปชั่นสั้นพร้อมกดโพสต์ · วางข้อความเองได้โดยไม่ต้องมี token |
| **คอนเทนต์ความรู้ (carousel)** | ✅ ใช้ได้เลย | 6 หัวข้อเรื่องที่ดิน เขียนมือ · สร้างสไลด์ PNG ฟรี ไม่ใช้ AI สร้างภาพ |
| ตารางโพสต์รายวัน + คิวดราฟต์ | ✅ ใช้ได้ | หน้า `/publish` · 2-3 โพสต์/วัน · **คลิปทุกวัน** สลับความรู้กับโพสต์ขาย · ส่งออก/นำเข้า Google Sheet |
| Asset / Analytics Engine | ⬜ ยังไม่เขียน | |
| Database / Redis | ⬜ ยังไม่มี | ทุกอย่างยังไม่ persist ปิดเครื่องแล้วหาย |

## ตัวบล็อกเดียวที่ค้างอยู่

**Kling มีแต่โควตาวิดีโอ ไม่มีโควตารูป** — แพ็กชื่อ `Trial-Video-100Units-5Con-1Months` (ซื้อไว้ 2 ก้อน ก้อนแรกหมดแล้ว)
พอเติมโควตา**รูป**เมื่อไหร่ House Engine กับ Construction จะทำงานทันที **ไม่ต้องแก้โค้ดเลย**

ทางเลือกอื่นที่คุยค้างไว้: Higgsfield สร้างรูปได้และสะดวกกว่า **แต่ที่เชื่อมอยู่เป็น MCP ซึ่งเซิร์ฟเวอร์เรียกเองไม่ได้**
ถ้าจะใช้กับระบบอัตโนมัติต้องเช็คก่อนว่า Higgsfield ขาย API key แยกไหม (ยังไม่ได้เช็ค)

## วิธีเปิดระบบขึ้นมาใหม่

```bash
cd "AI_BIBLE"
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"    # Node ติดตั้งผ่าน nvm ไม่ได้อยู่บน PATH
npm run web
# เปิด http://localhost:3000
```

## แผนที่ไฟล์ (โค้ดที่เขียนเองทั้งหมด)

```
src/engines/     property · google · house · video · render · overlay · storyboard · publish · carousel
src/wf5/         steps.mjs (5.1-5.8 + readiness)  ·  construction.mjs (ก่อสร้าง 5 ขั้น)
src/publish/     platforms.mjs (ปลายทาง+เพดาน caption) · captions.mjs · adapters/ (fb·tiktok·yt·line·manual-kit)
src/content/     stock (คลังคลิป) · listings (ชีทที่ดิน) · topics (หัวข้อความรู้)
                 calendar (ตารางเวลา) · queue (คิวดราฟต์) · sheet (CSV) · page-archive
src/providers/   registry.mjs (สลับเจ้าผ่าน .env)  ·  kling-adapter.mjs
src/lib/         ffmpeg · ass (ซับไทย) · svg-card (การ์ด) · places · geo · sanitize · prompt-library
src/cli/         publish.mjs (npm run publish / npm run daily)
templates/       location-card.svg · ending-card.svg   <- แก้ layout/สีได้ที่นี่ ไม่ต้องแตะโค้ด
public/index.html    ห้องควบคุมสายพานผลิตวิดีโอ
public/publish.html  ตารางลงคลิป + คิวโพสต์  (http://localhost:3000/publish)
schemas/         JSON Schema ที่ตรวจ output ทุก engine
tests/           npm test — รันออฟไลน์ ไม่เสียเครดิต
content/         ตาราง/คิว/คลัง (JSON) · media/ วางรูปเองได้ · ที่พักก่อนย้ายเข้า Postgres
output/          ไฟล์วิดีโอที่เรนเดอร์เสร็จ · post-kits/ ชุดโพสต์ลงกลุ่ม
```

## 🔐 ความปลอดภัย — ควรทำเมื่อกลับมา

คีย์ทั้งหมดอยู่ใน `.env` (ไม่ได้ commit) แต่ **ทุกคีย์เคยถูกพิมพ์ในแชท** ได้แก่
`ANTHROPIC_API_KEY`, `KLING_API_KEY`, `GOOGLE_MAPS_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`
→ **แนะนำให้หมุนคีย์ใหม่ทั้งหมดก่อนใช้งานจริง**

## ถ้าจะทำต่อ แนะนำเรียงลำดับนี้

1. **ขอ Page Access Token ของ Facebook** (~30 นาที ตาม `21_PUBLISH_SETUP.md` ข้อ A) → เพจโพสต์เองอัตโนมัติได้ทันที ไม่ต้องแก้โค้ด
2. ตั้ง `PUBLIC_MEDIA_BASE_URL` (ที่ฝากไฟล์) → ปลดล็อก Instagram + LINE **และแก้ปัญหา URL Kling หมดอายุ 30 วันไปพร้อมกัน**
3. เติมโควตา**รูป** (Kling หรือเจ้าอื่น) → ปลดล็อก House Engine + Construction ทันที
4. เรนเดอร์คลิปเพิ่ม — คลังตอนนี้พอลงราว 2 วันเท่านั้น
5. ต่อ PostgreSQL + Redis (Phase 1) → ถึงจะ reuse คลิปได้จริงตามที่ 01_VISION.md วางไว้ (`content/*.json` เป็นที่พักชั่วคราว ย้ายเข้า Postgres ได้ตรงๆ)

---

## 0. วิธีใช้ไฟล์นี้ (สำหรับ Claude / คนที่มาทำงานต่อ)

1. อ่านตาราง **"3. Status Tracker"** ก่อนเสมอ — คือแหล่งความจริงล่าสุดว่าอะไรเสร็จ อะไรกำลังทำ อะไรยังไม่แตะ
2. ก่อนเริ่มงานใน Engine ไหน ให้เปิด subagent ที่ตรงกันใน `.claude/agents/{engine}.md` — มีกฎและ input/output contract ของ Engine นั้นฝังไว้แล้ว
3. เมื่อทำงานเสร็จหนึ่งช่อง ให้แก้ **Status Tracker** และเพิ่มบรรทัดใน **"5. Change Log"** ทันที (วันที่ + สิ่งที่ทำ) ก่อนจบ session
4. ห้ามลบประวัติเก่าใน Change Log — ต่อท้ายอย่างเดียว (append-only เหมือนกฎ Immutable History ของ Prompt Library)

---

## 1. Known Data Issues (ต้องแก้ก่อนอ้างอิงไฟล์เหล่านี้ตรงๆ)

| ไฟล์ | ปัญหา | ผลกระทบ | สถานะ |
|---|---|---|---|
| `06_JSON_CONTRACT.md` | เนื้อหาซ้ำกับ `05_DATABASE.md` แบบ byte-ต่อ-byte | — | ✅ **แก้แล้ว 2026-07-29** เขียนใหม่จาก `schemas/*.schema.json` ที่ใช้งานจริง พร้อมระบุช่องว่างที่ยังขาด |
| `18_CLAUDE_RULES.md` | ชื่อไฟล์ไม่ตรงเนื้อหา | — | ✅ **แก้แล้ว** เปลี่ยนชื่อเป็น `18_N8N_IMPLEMENTATION.md` ตามที่ไฟล์ระบุตัวเอง |
| `19_N8N_GUIDE.md` | ชื่อไฟล์ไม่ตรงเนื้อหา | — | ✅ **แก้แล้ว** เปลี่ยนชื่อเป็น `19_COST_CALCULATOR.md` |

**ข้อเสนอ (Phase 0 ด้านล่าง):** สลับชื่อไฟล์ 18↔19 ให้ตรงเนื้อหา และ regenerate `06_JSON_CONTRACT.md` จริงโดยรวบรวม schema ที่กระจายอยู่ (มีต้นแบบพร้อมแล้วใน `schemas/*.schema.json` ที่สร้างในรอบนี้)

---

## 2. Phase Plan

### Phase 0 — Spec Cleanup (ยังไม่เริ่ม)
- แก้ปัญหาใน "1. Known Data Issues"
- ตัดสินใจ stack จริง: n8n (ตามที่ 18/19 ระบุ) หรือ custom backend (ตามที่ 02_ARCHITECTURE.md เกริ่นไว้ว่าเป็นได้ทั้งคู่)
- Regenerate `06_JSON_CONTRACT.md` ให้เป็นแหล่งอ้างอิงกลางจริง (รวม PROPERTY_OUT/GOOGLE_OUT/ASSET_OUT/HOUSE_OUT/VIDEO_OUT/RENDER_OUT/OVERLAY_OUT/PUBLISH_OUT ทั้งหมด)

### Phase 1 — Infra & Foundations (ยังไม่เริ่ม)
- ตั้ง PostgreSQL ตาม DDL ใน `05_DATABASE.md` (ตาราง properties, google_maps_cache, house_library, video_transactions, video_library, cost_logs)
- ตั้ง Redis สำหรับ cache layer (`prop_cache:*`, `goog_api_limit:*`, `active_transaction:*`)
- Deploy **Provider Interface Service** (`16_PROVIDER_INTERFACE.md`) — Router + Adapter (Kling/Flux/ElevenLabs เป็นต้นแบบที่มี code sample) + Circuit Breaker + Cost Logger
- ตั้งค่า env vars ทั้งหมดตามรายการใน `18_CLAUDE_RULES.md` (n8n guide จริง) section 8

### Phase 2 — Property Intake (WF-01 เทียบเท่า) (ยังไม่เริ่ม)
- Property Engine: extract entity ด้วย Claude Haiku + `TPL_PROP_001_v1`
- ทดสอบด้วยข้อมูลตัวอย่าง 5 รายการ, ยืนยัน `property_id` generation, Cost Event log, Duplicate Check

### Phase 3 — Media Production (WF-02 เทียบเท่า) (ยังไม่เริ่ม)
- Google Engine (geocode + cache) → Asset Engine (screen/classify) → House Engine (library-first gen) → Video Engine (image-to-video, no text)
- ทดสอบ cache hit/miss, House Library reuse, video provider fallback (mock MINIMAX 500)
- ยืนยันไม่มีราคา/เบอร์โทรหลุดเข้า prompt ของ image/video provider

### Phase 4 — Render & Publish (WF-03 เทียบเท่า) (ยังไม่เริ่ม)
- Overlay Engine (กราฟิก) → Render Engine (FFmpeg compose) → Publish Engine (TikTok/YouTube/Facebook)
- ทดสอบ OOM fallback (720p), caption generation ต่อแพลตฟอร์ม, publish กับ test account ก่อน

### Phase 5 — Analytics, Cost & Recovery (WF-04 + WF-ERR-01 เทียบเท่า) (ยังไม่เริ่ม)
- Analytics Engine: cost aggregation, provider scorecard, metrics collection (24h/48h/7d)
- Transaction Recovery workflow: monitor stalled transactions (>2 ชม.) ทุก 30 นาที
- ตั้ง monitoring dashboard, go live กับ property จริงตัวแรก

### Phase 6 — Post-Launch Optimization (ยังไม่เริ่ม)
- ปรับ provider scorecard จากข้อมูลจริง, ขยาย House/Video Library, ปรับ budget allocation ตามต้นทุนจริง
- เป้าหมายสเกล: 10,000 คลิป/เดือน

### Meta-layer (งานรอบนี้)
- อ่าน/วิเคราะห์เอกสารทั้งหมด ✅
- เติม roadmap นี้ ✅
- สร้าง Claude Code subagent ต่อ Engine (.claude/agents/) ✅
- สร้าง schema stub 6 ไฟล์ (schemas/) ✅
- สร้าง test payload ตัวอย่าง (contracts/test_payloads/) ✅
- สร้าง HTML progress dashboard ✅

---

## 3. Status Tracker

**อัปเดตล่าสุด: 2026-07-28**

| Layer / Engine | สถานะ | หมายเหตุ |
|---|---|---|
| Spec docs (00-19) | ✅ วิเคราะห์ครบแล้ว | มี known issues ตามข้อ 1 |
| 20_ROADMAP.md | ✅ เติมเนื้อหาแล้ว | ไฟล์นี้เอง |
| Claude Code subagents (.claude/agents/) | ✅ สร้างแล้ว 11 ตัว | Property/Google/Asset/House/Video/Render/Overlay/Publish/Analytics/Provider/Prompt |
| schemas/*.schema.json | ✅ สร้างแล้ว 6 ไฟล์ | ตามที่ 02_ARCHITECTURE.md ระบุ |
| contracts/test_payloads/ | ✅ สร้างแล้ว | ตัวอย่าง payload ปลายทางถึงปลายทาง |
| templates/ | ✅ สร้าง placeholder แล้ว | รอเนื้อหาจริงเมื่อเริ่ม Phase 4 |
| HTML Progress Dashboard | ✅ สร้างแล้ว | Artifact — ดูลิงก์ในข้อความล่าสุดของ Claude |
| Node.js runtime | ✅ ติดตั้งแล้ว (v24.18.0 LTS ผ่าน nvm) | เครื่องนี้ไม่มี Homebrew/Docker เดิม ติดตั้ง nvm แบบ user-scoped ไม่ใช้ sudo |
| package.json + deps | ✅ ติดตั้งแล้ว | `@anthropic-ai/sdk`, `ajv`, `ajv-formats` |
| Phase 0 — Spec Cleanup | ✅ เสร็จแล้ว | เขียน `06_JSON_CONTRACT.md` ใหม่ + เปลี่ยนชื่อ 18/19 ให้ตรงเนื้อหา · เลือก stack เป็น Node.js (ไม่ใช้ n8n) |
| Phase 1 — Infra & Foundations | 🔄 เริ่มบางส่วน | Node runtime พร้อมแล้ว; ยังไม่มี Postgres/Redis/Provider Interface service จริง |
| Phase 2 — Property Intake | 🔄 core extraction ทำงานจริงแล้ว | `src/engines/property-engine.mjs` รัน end-to-end สำเร็จด้วย `ANTHROPIC_API_KEY` จริง — ทดสอบด้วยข้อความโปรโมทเกินจริง+เบอร์โทร+Line ID แล้วถูกกรองออกหมด, ราคาแปลงถูกต้อง (12.5 ล้านบาท→12500000), style_tag ตรง enum, ผ่าน schema validation. ที่เหลือใน Phase 2: DB persistence, Duplicate Check, Cost Event log (ต้องรอ Phase 1 Postgres/Redis) |
| Phase 2 — Google Engine | ✅ ทำงานจริงแล้ว | `src/engines/google-engine.mjs` geocode + static map + street view URL สำเร็จด้วย `GOOGLE_MAPS_API_KEY` จริง ผ่าน schema (`schemas/google.schema.json`, เพิ่มใหม่ไม่ได้อยู่ใน 6 ไฟล์เดิม) — คีย์แรกที่ได้มาพลาด 2 จุด (ขาดตัว A / ยังไม่เปิด Geocoding API ใน key restrictions) แก้เป็นคีย์ที่สองจึงผ่าน |
| Phase 3 — Video Engine | ✅ ทำงานจริงแล้ว | สร้างวิดีโอจริงสำเร็จผ่าน Kling (task_id 911108384937222157, 5.041 วิ, หัก 10 หน่วยจาก resource package) คีย์แรกใช้ไม่ได้ (`code 1002`) คีย์ที่สองใช้ได้ทันทีด้วย Bearer token ธรรมดา — **ไม่ต้องใช้ JWT อย่างที่เข้าใจตอนแรก** |
| Phase 3 — House Engine | 🔄 โค้ดพร้อม รอเติมโควตารูป | `src/engines/house-engine.mjs` ใช้ **Kling `/v1/images/generations`** แทน Flux/Midjourney (ไม่ต้องเปิดบัญชีใหม่) — แต่ **resource package ที่ซื้อไว้ครอบคลุมแค่วิดีโอ ไม่รวมรูป** Kling ตอบ `1102 Account balance not enough` ต้องเติมโควตารูปแยก |
| Storyboard (ช็อตหลายตอน) | ✅ ช็อตอวกาศทำงานจริง | `src/engines/storyboard.mjs` ประกอบ Google→Video เป็นช็อต "ดิ่งจากอวกาศลงแปลงที่ดิน" สำเร็จจริง ($0.165) · ช็อต "บ้านผุดขึ้น" ใช้ `image_tail` ของ Kling (เฟรมเริ่ม=ที่ดินเปล่า เฟรมจบ=บ้าน) ทำงานได้แบบ degraded คือให้โมเดลจินตนาการบ้านเองเมื่อโควตารูปหมด |
| Phase 4 — Render Engine | ✅ ทำงานจริงแล้ว | `src/engines/render-engine.mjs` + `src/engines/overlay-engine.mjs` ต่อคลิป ใส่ซับไทย ผสมเสียง และการ์ดปิดท้ายพร้อม QR · export ทั้ง 9:16 และ 16:9 · ตรวจภาพนิ่งแล้วสระ/วรรณยุกต์ไทยถูกตำแหน่ง |
| Phase 4 — Publish Engine | ✅ โค้ดครบ · รอ token | `src/engines/publish-engine.mjs` + adapter 5 ตัว (Facebook Page/Reels · Instagram · TikTok · YouTube · LINE) + `MANUAL_KIT` · fan-out ขนานทุกปลายทางพร้อมกัน · `schemas/publish.schema.json` · เทสต์ 15 เคสผ่าน · **`MANUAL_KIT` ใช้งานได้จริงแล้ววันนี้** ที่เหลือรอ token ตาม `21_PUBLISH_SETUP.md` |
| Phase 4 — ตารางโพสต์รายวัน | ✅ ทำงานจริงแล้ว | `src/content/` — คลังคอนเทนต์ + ปฏิทินช่องเวลา + คิวดราฟต์ + CSV/TSV เข้าออก Google Sheet + ดึงโพสต์เก่าจากเพจ · หน้าเว็บ `/publish` · CLI `npm run publish` · cron `npm run daily` |
| Phase 5 — Analytics & Recovery | 🔄 เริ่มบางส่วน | `fetchPostInsights()` ดึง impressions/engagement รายโพสต์แล้ว (ใช้จัดอันดับโพสต์เก่าที่ควรเอากลับมาใช้) ที่เหลือยังไม่เริ่ม |
| Phase 6 — Post-Launch Optimization | ⬜ ยังไม่เริ่ม | |

Legend: ✅ เสร็จแล้ว · 🔄 กำลังทำ · ⬜ ยังไม่เริ่ม · ❌ ติดปัญหา

---

## 4. Cost Target Reference (จาก 01_VISION.md — เก็บไว้เทียบผลจริงตอน Phase 6)

| Step | Legacy | Target | Savings |
|---|---|---|---|
| Google Maps API | $0.000 | $0.001 | cache-controlled |
| AI Text Analysis | $0.015 | $0.003 | 80% |
| House Concept Art | $0.050 | $0.002 | 96% (90% reuse assumed) |
| AI Video Generation | $0.400 | $0.160 | 60% |
| Subtitle/Graphic Render | $0.000 | $0.010 | เพิ่ม flexibility, แก้คำผิดฟรี |
| **เฉลี่ยต่อวิดีโอ** | **$0.465** | **$0.176** | **62.1%** |

Hard budget ceiling per video (จาก `03_SYSTEM_RULES.md`): **$0.30**

---

## 5. Change Log

- **2026-07-28** — วิเคราะห์เอกสารทั้งหมด 20 ไฟล์ (พบปัญหาไฟล์ 06/18/19), เติม roadmap นี้เป็นครั้งแรก, สร้าง subagents 11 ตัว, schema stub 6 ไฟล์, test payload, templates placeholder, และ HTML progress dashboard
- **2026-07-28** — ลอง launch จริง: พบว่าเครื่องไม่มี Node/Docker/Postgres/Redis/Homebrew เลย (มีแค่ Python3) จึงติดตั้ง nvm + Node.js v24.18.0 LTS แบบ user-scoped (ไม่ใช้ sudo); ตรวจ MCP ที่เชื่อมอยู่จริง (Higgsfield: 10 credit ฟรี, ยังไม่ผูก TikTok / Zapier: เปิดใช้แค่ Sheets-Gmail-Calendar / Facebook Ads: เป็นเครื่องมือแคมเปญโฆษณา ใช้แทน publish organic ไม่ได้); user ยืนยันมี Kling credit จริง ~$30 จึงตั้งให้ Kling เป็น preferred provider แทน Higgsfield ใน provider-interface และ video-engine subagent; เขียน `package.json` + `src/engines/property-engine.mjs`
- **2026-07-28** — user ส่ง `ANTHROPIC_API_KEY` และ `KLING_API_KEY` จริงมาในแชท (บันทึกลง `.env` เท่านั้น ไม่ echo ซ้ำ — แนะนำให้หมุนเวียนคีย์ใหม่เพราะเคยแปะในแชท) รัน Property Engine end-to-end สำเร็จครั้งแรกด้วย input ภาษาไทยจริงที่มีคำโปรโมทเกินจริง+เบอร์โทร+Line ID แล้วถูกกรองออกถูกต้องทั้งหมด ผ่าน schema validation — **นี่คือ engine แรกที่ทำงานสมบูรณ์ end-to-end ของทั้งโปรเจกต์** `KLING_API_KEY` บันทึกไว้แล้ว รอเขียน House/Video Engine adapter ต่อ
- **2026-07-28** — เพิ่มหน้าเว็บ UI สำหรับกรอก input แทน CLI: `public/index.html` (ฟอร์มวางข้อความ + แสดงผล JSON) + `src/server.mjs` (Node `http` ธรรมดา ไม่ใช้ framework, endpoint `POST /api/property-engine`) รันด้วย `npm run web` แล้วเปิด http://localhost:3000 — ทดสอบผ่านทั้งหน้าเว็บและ API แล้ว ทำงานถูกต้อง
- **2026-07-28** — เขียน Google Engine จริง (`src/engines/google-engine.mjs` + `schemas/google.schema.json` + endpoint `/api/google-engine`) คีย์แรกที่ user ให้มามีปัญหา 2 ชั้น (พิมพ์ตกตัว A / ยังไม่เปิด Geocoding API ใน API restrictions ของคีย์ — เจอเพราะ Static Map ผ่านแต่ Geocoding ไม่ผ่าน วินิจฉัยแยกจุดได้ชัด) user สร้างคีย์ใหม่มาให้แทน ทดสอบผ่านสมบูรณ์ end-to-end (geocode ที่อยู่จริง, ได้ static map + street view URL, ผ่าน schema)
- **2026-07-28** — เขียน Video Engine ครบชุด: `src/lib/sanitize.mjs` (sanitizeMediaPrompt ตามสเปก), `src/lib/prompt-library.mjs` (TPL_VID_001-006 คัดลอกคำต่อคำจาก 17_PROMPT_LIBRARY.md), `src/providers/kling-adapter.mjs` (buildRequest/normalizeResponse + JWT signing + polling), `src/engines/video-engine.mjs`, endpoint `/api/video-engine`, และหน้าเว็บใหม่รวม 3 engine ในหน้าเดียว. **พบและแก้บั๊กจริงใน sanitizer**: regex เดิม `/\d{4,}/` กับ `/0[689]\d{8}/` จับเบอร์ที่มีขีดคั่นไม่ได้ ทำให้ `081-234-5678` เหลือเศษ `081-234-` ค้างและ `containsSensitiveData` ก็ไม่จับ — แก้เป็น pattern ที่รองรับตัวคั่น + เพิ่ม pattern ทศนิยม (ราคาแบบ "12.9") แต่ยังคงเก็บ "100 ตารางวา" ที่เป็นข้อมูลมีประโยชน์ไว้
- **2026-07-28** — พบข้อขัดแย้งในสเปก 2 จุดระหว่างเขียน Video Engine: (1) `TPL_VID_005_v1` ใน 17_PROMPT_LIBRARY.md ใช้ camera `ORBIT` แต่ enum `camera_motion` ใน video contract มีแค่ PAN_RIGHT/ZOOM_IN/DRONE_REVEAL/TILT_UP — template นี้จึงเรียกใช้ไม่ได้ผ่าน contract ปัจจุบัน (2) `normalizeResponse()` ตัวอย่างใน 16_PROVIDER_INTERFACE.md อ่าน `data.works[0].resource.resource` แต่ Kling API จริงคืน `data.task_result.videos[0].url` ผ่าน task_id + polling — โค้ดยึดตาม API จริง ควร reconcile ตอน Phase 0
- **2026-07-28** — **Video Engine สร้างวิดีโอจริงสำเร็จครั้งแรก** (Kling, 5.041 วิ, หัก 10 หน่วย, ใช้เวลา 295 วินาที) พร้อมพบปัญหาจากข้อมูลจริง 3 ข้อ:
  1. **Timeout ในสเปกสั้นเกินจริง** — `PROVIDER_TIMEOUTS_MS.IMAGE_TO_VIDEO = 180_000` ใน 16_PROVIDER_INTERFACE.md แต่งานจริงใช้ 295 วินาที แปลว่าสเปกเดิม**การันตีว่าจะ timeout ทุกครั้งทั้งที่จ่ายเงินไปแล้ว** แก้เป็น 600 วินาที (ปรับผ่าน `KLING_TIMEOUT_MS` ได้) ควรแก้ตาราง timeout ในสเปกตอน Phase 0
  2. **บั๊กหน่วยเวลาใน adapter** — Kling คืน `duration: "5.041"` เป็น**วินาที** แต่โค้ดเดิมหาร 1000 ทำให้ได้ 0.005 วินาที แล้วถูก clamp เป็น 3 วิ (ข้อมูลผิดแต่ผ่าน schema เงียบๆ) แก้แล้ว ยืนยันด้วย fixture จริงโดยไม่เสียเครดิตซ้ำ
  3. **URL วิดีโอมีวันหมดอายุ** — Kling คืน signed URL ที่หมดอายุ **30 วัน** (`Expires=1787845979` → 2026-08-27) นี่ขัดกับแนวคิด "Video Library reuse ตลอดไป" ใน 01_VISION.md โดยตรง: ถ้าเก็บแต่ URL ไว้ในตาราง `video_library` คลิปจะตายหมดใน 30 วัน **Phase 1 ต้องดาวน์โหลดไฟล์มาเก็บบน S3/R2 ของเราเองแล้วเก็บ URL นั้นแทน**
- **2026-07-28** — เพิ่มระบบอัปโหลดรูปจากเครื่องในหน้าเว็บ (ลากวาง/คลิกเลือก + preview + เช็คขนาดฝั่ง browser) **จุดสำคัญทางเทคนิค**: Kling ต้องดึงรูปจากอินเทอร์เน็ตได้ ดังนั้นไฟล์ที่อยู่บน localhost ใช้ URL ไม่ได้เลย — แก้โดยส่งเป็น **base64 ตรงเข้า Kling API** (รองรับ) ไม่ต้องมี public hosting หรือ S3 ในขั้นนี้ ทดสอบแล้วรูปถึง Kling จริง (ตอบ "Image pixel is invalid" กับรูป 1x1 พิสูจน์ว่าถอดรหัสได้) เพิ่ม body size cap 12MB ที่ server กันไฟล์ใหญ่ทำ memory หมด
- **2026-07-28** — ออกแบบหน้า console ใหม่ทั้งหมด (`public/index.html`): ธีมสีทองอำพัน "golden hour" ที่ดึงมาจากคำใน prompt template เอง, เรียง engine เป็นสายพานมีเลขขั้นและเส้นเชื่อม (สื่อลำดับจริง ไม่ใช่ตกแต่ง), **มาตรวัดงบเทียบเพดาน $0.30 ตาม BUDGET_THRESHOLDS ในสเปก** เปลี่ยนสีเขียว→เหลือง→แดงตามยอด, ตัวจับเวลาตอนรอวิดีโอ (จำเป็นเพราะรอ 5 นาทีโดยไม่มี feedback จะดูเหมือนค้าง), ปุ่มส่งผลจากขั้น 01 ไปเติมให้ขั้น 02 อัตโนมัติ, รองรับ dark/light mode และ `prefers-reduced-motion`
- **2026-07-28** — เก็บ response จริงของ Kling เป็น fixture ที่ `contracts/test_payloads/kling_image2video_response.json` (redact signed URL ออกแล้ว) ใช้ทดสอบ adapter ซ้ำได้ฟรีไม่ต้องยิง API
- **2026-07-28** — user ขอให้เช็ค LINE OA เก่าที่เคยสร้างไว้ว่ายังใช้ได้ไหม ขอ Channel Access Token มาทดสอบตรงกับ LINE Messaging API (`GET /v2/bot/info`) — **ยืนยันว่ายังใช้งานได้จริง**: ชื่อบัญชี "ติดดินบินโดรน", Basic ID `@244raxjb` เก็บ token ไว้เป็น `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env` แล้ว พร้อมต่อยอดเป็นช่องแจ้งเตือน/publish ในอนาคต (ยังไม่เขียนโค้ดเชื่อมต่อจริง)
- **2026-07-29** — ลูกค้าขอคอนเซปต์ใหม่: คลิปต้องเปิดด้วยการซูมจากนอกโลกลงมาที่แปลงที่ดิน แล้วมีบ้านก่อสร้างขึ้นบนที่ดินเปล่า → สร้าง `src/engines/storyboard.mjs` (ชั้น orchestration ไม่ใช่ engine ใหม่ ตามกฎใน 02_ARCHITECTURE.md) + template ใหม่ `TPL_VID_007_v1` (ดิ่งจากวงโคจร) และ `TPL_VID_008_v1` (ไทม์แลปส์ก่อสร้าง) **หมายเหตุ: ยังไม่ได้เพิ่มลง 17_PROMPT_LIBRARY.md ตาม Claude Rule #8 ต้องอัปเดต Template Registry ก่อนถือเป็นทางการ**
- **2026-07-29** — **ค้นพบสำคัญ: Kling สร้างรูปได้ด้วย** (`/v1/images/generations`) จึงใช้ทำ House Engine ได้เลยไม่ต้องซื้อคีย์ Flux/Midjourney — แต่ทดสอบแล้วพบว่า **resource package ครอบคลุมเฉพาะวิดีโอ** (วิดีโอรับงานปกติ / รูปตอบ `1102 Account balance not enough` ทั้ง kling-v1 และ v1-5) ออกแบบให้ระบบ degrade แทนที่จะพัง: ถ้าสร้างรูปบ้านไม่ได้ ก็ยังทำช็อตก่อสร้างต่อโดยให้โมเดลวิดีโอจินตนาการบ้านจาก prompt (คุมหน้าตาบ้านได้น้อยลง แต่ได้คลิป)
- **2026-07-29** — พบและปิดช่องโหว่ความปลอดภัย: `static_map_url` ของ Google มี API key ฝังอยู่ในลิงก์ ถ้าส่งลิงก์นั้นให้ Kling ดึงเอง = **คีย์รั่วไปยัง third party** แก้โดยดาวน์โหลดภาพมาที่ server ก่อนแล้วส่งเป็น base64 แทน
- **2026-07-29** — เพิ่มโหมด Storyboard บนหน้าเว็บ (เลือกช็อต, อัปโหลดรูปที่ดิน, เลือกสไตล์บ้าน) แสดงผลเป็น log ทีละขั้นพร้อมค่าใช้จ่ายรายขั้น และเล่นคลิปทุกช็อตในหน้าเดียว
- **2026-07-29** — ได้รับสเปกใหม่ `WF5-media-generation.md` (คนละชุดกับ AI_BIBLE เป็นการแบ่ง pipeline อีกแบบเป็น WF1–WF7) ทำตามข้อกำหนดหลักของเอกสาร:
  - **§7 ข้อ 1 + Policy §3.1(4) "ห้าม hardcode engine"** — เดิมโค้ดเรียก `KlingAdapter` ตรงๆ ซึ่งผิดข้อนี้ แก้เป็น `src/providers/registry.mjs` เลือก provider ผ่าน env (`VIDEO_ENGINE`, `IMAGE_ENGINE`) engine ไม่รู้จักชื่อ vendor อีกต่อไป สลับกลับไป Higgsfield ได้ด้วยการแก้ env อย่างเดียว ทดสอบแล้วสลับได้จริงและ error บอกชัดว่าติดอะไร
  - **§7 ข้อ 3 "ทุก step ต้องเป็น modular function"** — สร้าง `src/wf5/steps.mjs` แยกฟังก์ชัน 5.1–5.8 พร้อม endpoint `GET /api/wf5/readiness` รายงานสถานะพร้อม/ไม่พร้อมรายขั้น
  - **§7 ข้อ 5 "ห้ามใช้ภาพ stock"** — step 5.2 บังคับให้ต้องส่งภาพจริงเข้ามา ไม่มีภาพสำรองในระบบ (หมายเหตุ: ภาพ Unsplash ที่ใช้ตอนทดสอบวันที่ 28 เป็นการทดสอบระบบเท่านั้น ห้ามใช้ในงานจริง)
  - **แก้ข้อมูลผิดในเอกสาร §3.1** — ตารางระบุว่า "Kling ไม่ใช่ image generator ใช้แทนตรงนี้ไม่ได้" แต่ทดสอบจริงแล้ว Kling มี `/v1/images/generations` ใช้ทำ 5.3 ได้ ติดแค่โควตารูปหมด (คนละกระเป๋ากับวิดีโอ) ซึ่งเติมเงินง่ายกว่าเปิดบัญชี SDXL ใหม่ — จึงตั้ง default `IMAGE_ENGINE=kling` และเปิดทาง `sdxl` ไว้ตามเอกสารเดิม
  - **สถานะ WF5 ตามที่วัดได้จริง**: 5.1 ✅ · 5.2 ✅ (ต้องมีภาพจริง) · 5.3 ❌ โควตารูปหมด · 5.4 ⚠️ ทำได้แบบ degraded · 5.5 ✅ · 5.6/5.7/5.8 ❌ ยังไม่ได้ติดตั้ง FFmpeg (5.7 ขาด ELEVENLABS_API_KEY ด้วย)

---

## 6. สรุปรอบกลางคืน 2026-07-29 (ทำต่อระหว่าง user นอน)

**ติดตั้ง FFmpeg สำเร็จโดยไม่ต้องใช้รหัสผ่าน** — เครื่องไม่มี Homebrew และการติดตั้งต้องใช้ sudo ซึ่งขอไม่ได้ จึงใช้ npm package `ffmpeg-static` แทน ได้ FFmpeg 6.0 arm64 ที่มี libass ครบ (จำเป็นสำหรับภาษาไทย) โดยไม่แตะระบบเลย

**สร้าง Render Engine + Overlay Engine จบ** ปลดล็อก WF5 ขั้น 5.6/5.7/5.8 รวดเดียว:
- ต่อคลิปหลายช็อตเป็นไฟล์เดียว (normalize ทุกคลิปก่อน concat กัน codec ชนกัน)
- ซับไตเติลไทยผ่าน **libass ไม่ใช่ drawtext** — drawtext ไม่ทำ complex-script shaping ทำให้สระบนและวรรณยุกต์ไทยลอยผิดตำแหน่ง ตรวจภาพนิ่งยืนยันแล้วว่า libass วางถูก
- การ์ดปิดท้าย 6 วินาที พร้อม QR (สร้างด้วย `qrcode` แทน headless Chrome ที่สเปกระบุ — ประหยัด dependency 300MB โดยได้ผลเหมือนกัน)
- export ทั้ง 9:16 และ 16:9 ตาม WF5 5.8 พร้อม fallback ลด 720p ถ้าเรนเดอร์เต็มความละเอียดล้ม
- **นี่คือจุดเดียวในระบบที่ราคา/เบอร์โทร/LINE/QR ปรากฏได้** ตามกฎเหล็กข้อ 1 — แก้ราคาผิดจึงเสียแค่ค่าเรนเดอร์ ไม่ต้องสร้างวิดีโอ AI ใหม่

**ทำ Phase 0 จบ** — เขียน `06_JSON_CONTRACT.md` ใหม่ทั้งไฟล์จาก schema ที่ใช้งานจริง และเปลี่ยนชื่อ `18_CLAUDE_RULES.md` → `18_N8N_IMPLEMENTATION.md`, `19_N8N_GUIDE.md` → `19_COST_CALCULATOR.md` ให้ตรงเนื้อหา

**บั๊กที่เจอและแก้ระหว่างทาง**
1. `hasFfmpeg()` เช็คด้วยชื่อ `ffmpeg` เฉยๆ แต่ binary อยู่ใน node_modules ไม่ได้อยู่บน PATH → รายงานว่าไม่มี FFmpeg ทั้งที่เรนเดอร์ได้จริง
2. บรรทัดติดต่อบนการ์ดปิดท้ายถูก libass ตัดคำกลางคู่ ทำให้ `·` ไปขึ้นต้นบรรทัดใหม่ → เปลี่ยนเป็นขึ้นบรรทัดใหม่ตรงๆ แทนการใช้ตัวคั่น

**สถานะ WF5 ตอนนี้: พร้อมใช้ 7 จาก 8 ขั้น** เหลือ 5.3 (สร้างภาพบ้าน) ที่ติดโควตารูปของ Kling อย่างเดียว

- **2026-07-29** — **Google Engine รับลิงก์ Google Maps และดึงสถานที่ใกล้เคียง** (`src/lib/geo.mjs`, `src/lib/places.mjs`): รองรับลิงก์แผนที่ทุกแบบ (ลิงก์ยาว `@lat,lng`, `!3d!4d`, `?q=`, ลิงก์ย่อ goo.gl ที่ตามรีไดเรกต์ให้, พิกัดเปล่า) — **ถ้าวางเป็นพิกัดจะใช้ตรงๆ ไม่เรียก Geocoding API เลย แม่นกว่าและไม่เสียเงิน** · ดึง POI 7 หมวด (โรงพยาบาล วัด ตลาด แหล่งท่องเที่ยว โรงเรียน ห้าง ร้านสะดวกซื้อ) พร้อมระยะทางจริงคำนวณด้วย haversine และสร้าง `highlight_lines` เป็นประโยคขายสำเร็จรูปที่ปลอดภัยตามกฎ (ไม่มีราคา/เบอร์/คำโฆษณา)
  - ใช้ Places API **แบบเดิม (nearbysearch)** เพราะแบบใหม่ `places.googleapis.com` ถูกบล็อกบนคีย์นี้ (`API_KEY_SERVICE_BLOCKED`) — ไม่ต้องให้ user ไปเปิด API เพิ่ม
  - Places ล่ม → คืน `nearby` ว่างแต่พิกัด/แผนที่ยังใช้ได้ ไม่ทำให้ทั้งงานพัง
- **2026-07-29** — **ปรับสตอรี่บอร์ดเป็น 4 จังหวะตามที่ลูกค้าต้องการ**: (1) หมุดบนแผนที่ กล้องดันเข้า `TPL_VID_009_v1` (2) ดิ่งจากฟ้าลงสู่รูปที่ดินจริง `TPL_VID_010_v1` (3) บ้านก่อสร้างขึ้น `TPL_VID_008_v1` (4) การ์ดข้อมูลทรัพย์
  - จังหวะ 2 และ 3 ใช้ `image_tail` ให้**เฟรมจบของช็อตก่อนเป็นเฟรมเริ่มของช็อตถัดไป** ภาพจึงต่อเนื่องจริง ไม่ใช่ตัดกระโดดระหว่างรูปที่ไม่เกี่ยวกัน
  - เพิ่ม `pin_map_url` ใน GOOGLE_OUT — แผนที่แบบ roadmap ที่ปักหมุดสีแดงไว้ (ของเดิมเป็นภาพดาวเทียมไม่มีหมุด)
  - การ์ดปิดท้ายแสดง **ข้อมูลทำเลจริง** จาก Places (เช่น "ใกล้ตลาด 188 ม.") แทนคำโฆษณาลอยๆ

- **2026-07-29** — อ่าน `WF5-fix-construction-and-overlay.md` แล้วทำตาม ทั้งเอกสารวินิจฉัยถูกต้องทั้ง 2 ข้อ:
  - **§1 Construction Staging** — เดิมส่ง prompt เดียว ("ที่ดินเปล่า → บ้านเสร็จ") ทำให้โมเดลข้ามขั้นกลางไปเลยจริงตามที่เอกสารระบุ แก้เป็น `src/wf5/construction.mjs`: สร้างภาพนิ่งทีละ stage (ฐานราก → โครงสร้าง → ผนัง+หลังคา → ตกแต่ง → เสร็จ) โดยส่งรูปที่ดินจริงเป็น image reference ทุก stage เพื่อคุมมุมกล้อง แล้วให้ video model animate เฉพาะ**ระหว่าง 2 เฟรมที่รู้แน่นอน**
  - **⚠️ ขัดกับเพดานงบในสเปก**: 5 stage = 5 รูป + 5 คลิป ≈ **$0.87** ซึ่งเป็น **~3 เท่าของเพดาน $0.30/วิดีโอ** ใน `03_SYSTEM_RULES.md` จึงทำเป็น opt-in + มี endpoint `GET /api/construction/estimate` และ `dry_run` ให้ประเมินราคาก่อนจ่ายจริง
  - **§2 Data Overlay** — เดิมการ์ดปิดท้ายเป็น "คลิปนิ่งต่อท้าย" ไม่ใช่ overlay แก้เป็น **composite ทับวิดีโอที่กำลังเล่น** ด้วย `enable='between(t,a,b)'` ตามที่เอกสารระบุ · เพิ่มการ์ดทำเลกลางคลิป (§2.1) ที่ดึงข้อมูลจาก Places API ที่ทำไว้เมื่อวาน · การ์ดปิดท้าย (§2.2) มีป้าย "เจ้าของขายเอง" ขนาดที่ดิน ราคา กล่องติดต่อขาว และ QR ตาม layout อ้างอิง
  - **เบี่ยงจากเอกสาร 1 จุด (ตั้งใจ)**: เอกสารแนะนำ Puppeteer สำหรับ HTML→PNG แต่นั่นต้องโหลดเบราว์เซอร์ ~300MB มาวาดการ์ด 2 ใบ ใช้ `sharp` (~10MB) rasterize SVG แทน ซึ่ง librsvg/Pango ทำ complex-script shaping ได้ถูกต้อง (ตรวจภาพจริงแล้วสระ/วรรณยุกต์ไทยตรงตำแหน่ง) — **ข้อกำหนดที่สำคัญจริงยังอยู่ครบ**: layout อยู่ในไฟล์ `templates/*.svg` แก้ได้โดยไม่แตะโค้ด
- **2026-07-29** — บั๊กที่เจอระหว่างทำ WF5-fix:
  1. `probeDuration()` อ่านเวลาจาก stderr เฉพาะใน catch แต่ `ffmpeg -f null -` **สำเร็จปกติ** จึงคืน null ทุกไฟล์ที่ปกติดี → การ์ดขึ้นผิดจังหวะ (คลิป 20 วิ ถูกมองเป็น 5 วิ)
  2. `sharp` ที่ตั้ง `density` ทำให้ PNG ออกมาใหญ่กว่า viewBox ~3 เท่า → overlay กว้างเกินเฟรม แก้ด้วยการ resize กลับมาเท่าความกว้างวิดีโอ
  3. คอมเมนต์ใน SVG ห้ามมี `--` (XML ไม่อนุญาต) ทำให้ librsvg parse ไม่ผ่าน
  4. `<image href="file://...">` ถูก librsvg บล็อก → QR ไม่ขึ้น ต้องฝังเป็น data URI
  5. Kling image gen ที่มี reference ต้องส่ง `image_reference` ด้วย ไม่งั้น 1201 — **แก้แล้วผ่าน validation ไปถึงตัวบล็อกจริงคือโควตารูป**
  6. `server.mjs` ตัด `nearby_radius_m` ทิ้งใน buildArgs ทำให้ตัวเลือกรัศมีในหน้าเว็บไม่มีผลจริง

- **2026-08-01** — **เขียน Publish Engine + ระบบตารางโพสต์รายวันจบทั้งชุด** (Phase 4 ส่วนที่เหลือ)

  **Publish Engine** (`src/engines/publish-engine.mjs`, `src/publish/`)
  - fan-out **ขนานจริง** ทุกปลายทางพร้อมกัน — TikTok ติด rate limit ไม่ทำให้ Facebook ช้าตาม
  - adapter 5 ตัว: Facebook Page feed · Facebook Reels (อัปโหลด 3 เฟส) · Instagram Reels · TikTok (chunked FILE_UPLOAD) · YouTube (resumable) · LINE broadcast
  - `schemas/publish.schema.json` (ยังไม่เคยมี ตามที่ `.claude/agents/publish-engine.md` ระบุไว้)
  - คัดลอก `TPL_CAP_001-004_v1` ลง `src/lib/prompt-library.mjs` ตรงตัวจาก `17_PROMPT_LIBRARY.md` §8 และเพิ่ม **`TPL_CAP_005_v1`** (โพสต์ feed ของเพจ ซึ่ง §8 ไม่มี — เป็น id ใหม่ ไม่ได้แก้ของเดิม ตามกฎ immutable history) ⚠️ **ยังต้องไปลงทะเบียนใน `17_PROMPT_LIBRARY.md` §8 + ตาราง registry ให้เป็นทางการ**
  - เพดานความยาว caption บังคับ**ก่อน**ยิง API ทุกครั้ง และนับเป็น**ตัวอักษร ไม่ใช่ไบต์** — ภาษาไทย 1 ตัวคือ 3 ไบต์ ถ้านับไบต์จะตัดคำผิดตลอด
  - **เบี่ยงจากสเปก 2 จุด (ตั้งใจ)**: (1) `dry_run` **ดีฟอลต์เป็น true** — การโพสต์ย้อนกลับไม่ได้และเป็นสาธารณะ จึงให้ต้องสั่งโพสต์จริงเอง ไม่ใช่ต้องสั่งห้าม (2) `ERR_PUB_02` ไม่ได้ `sleep` 30 นาทีในโพรเซสตาม §7 แต่คืน `retry_after_seconds` ให้ตัวจัดคิวไปจัดการ — ตัวรันประจำวันที่ค้าง 30 นาทีจะดองคิวทั้งวัน

  **ตารางโพสต์รายวัน** (`src/content/`)
  - `stock.mjs` ทำดัชนีคลิปใน `output/` + รูปใน `content/media/` พร้อมกฎหมุนเวียน (ยังไม่เคยโพสต์มาก่อน → โพสต์นานสุด, cooldown 14 วัน แต่**ผ่อนได้ถ้าจะทำให้วันนั้นว่าง** เพราะโพสต์ซ้ำดีกว่าไม่โพสต์)
  - `calendar.mjs` ช่องเวลามาตรฐาน 3 ช่วง/วัน (08:00 ภาพ · 12:30 คลิป จ/พ/ศ · 19:00 คลิปแนวตั้งลงทุกแพลตฟอร์ม) + เสาร์ 10:00 ชุดโพสต์ลงกลุ่ม — แก้ได้ใน `content/schedule.config.json` ไม่ต้องแตะโค้ด
  - `queue.mjs` คิวคีย์ด้วย `slot_id` — **นี่คือสิ่งเดียวที่กันโพสต์ซ้ำ** cron ยิงซ้ำ/รันมือซ้ำ/เครื่องตื่นมาไล่ตามงาน ทั้งหมดเจอช่องที่เต็มแล้วและข้ามไป
  - ผ่อนผัน 3 ชม.: ถ้าเครื่องหลับตอน 19:00 ตื่น 20:30 ยังโพสต์ทัน เกินนั้นข้ามวันไปเลย ดีกว่าโพสต์ตอนตีสอง
  - `sheet.mjs` CSV/TSV เข้าออก Google Sheet — parser เขียนเองตาม RFC 4180 เพราะแคปชั่นอสังหาฯ ไทยมีทั้งคอมมา อัญประกาศ และขึ้นบรรทัดใหม่เป็นเรื่องปกติ ทดสอบ round-trip แล้วตรงกันทุกตัวอักษร
  - `page-archive.mjs` ดึงโพสต์เก่าจากเพจ + insights มาเก็บ เอาไว้จัดอันดับว่าโพสต์ไหนควรเอากลับมาใช้ (ดึง insights แบบ**เรียงทีละอัน ไม่ขนาน** — page token โดน Meta throttle ง่ายมาก)

  **`MANUAL_KIT` — ส่วนที่ใช้ได้จริงแล้ววันนี้โดยไม่ต้องมี token อะไรเลย**
  - **Meta ปิด API โพสต์ลงกลุ่มไปตั้งแต่ปี 2020** (`publish_to_groups` + `/{group-id}/feed`) และไม่มีตัวแทน · Marketplace ก็ไม่มี API · เครื่องมือที่อ้างว่าทำได้ล้วนปลอมเป็นเบราว์เซอร์ ซึ่งผิด TOS และโดนล็อกบัญชีได้ **จึงไม่ทำ**
  - แทนที่ด้วยการเตรียมโฟลเดอร์ให้ครบ: `clip.mp4` + `cover.jpg` (ดึงเฟรมด้วย ffmpeg) + `caption.txt` + `README.md` → เปิด กด Cmd+A Cmd+C วางในกลุ่ม แนบคลิป กดโพสต์
  - ทดสอบจริงแล้ว ได้ไฟล์ครบพร้อมแคปชั่นไทยจาก Haiku

  **หน้าเว็บ/CLI/เทสต์**
  - หน้า `/publish` (`public/publish.html`): แถบสถานะปลายทาง · สรุปคลัง+ประมาณว่าคอนเทนต์พอกี่วัน · ตารางรายวันที่แก้แคปชั่นได้ในหน้า · ปุ่มซ้อม/โพสต์จริงแยกกันชัดเจน (โพสต์จริงมี confirm)
  - CLI `npm run publish -- <คำสั่ง>` 18 คำสั่ง · `npm run daily` สำหรับ cron
  - `tests/publish.test.mjs` 15 เคส **ผ่านหมด รันออฟไลน์ ไม่เสียเครดิต ไม่แตะเน็ต**
  - `21_PUBLISH_SETUP.md` คู่มือขอ token ทุกแพลตฟอร์มพร้อมข้อจำกัดจริงของแต่ละเจ้า

  **ข้อจำกัดที่พบและบันทึกไว้ (เป็นของแพลตฟอร์ม ไม่ใช่ของระบบนี้)**
  1. กลุ่ม Facebook / Marketplace โพสต์อัตโนมัติไม่ได้เลย → `MANUAL_KIT`
  2. **Instagram กับ LINE รับแต่ URL อัปโหลดไฟล์ตรงไม่ได้** ต่างจาก Facebook/TikTok/YouTube ที่รับไฟล์จากเครื่องนี้ได้ → 2 เจ้านี้ติด `PUBLIC_MEDIA_BASE_URL` (ซึ่งแก้ปัญหา URL Kling หมดอายุ 30 วันไปพร้อมกันด้วย — ทำครั้งเดียวได้สองอย่าง)
  3. TikTok ก่อนผ่าน content review บังคับทุกโพสต์เป็น `SELF_ONLY` และ access token อายุ 24 ชม. → **ยังไม่ได้เขียน auto-refresh ให้ TikTok** ต้องทำก่อนเปิด `auto_publish` กับ TikTok
  4. คลังตอนนี้มีคลิป 7 ชิ้น (แนวตั้ง 6) **พอลงราว 2 วัน** และ**ไม่มีรูปเลย** ช่อง 08:00 ที่เป็นโพสต์ภาพจึงว่าง — วางไฟล์ไว้ใน `content/media/` ได้ทันที
  5. `auto_publish` ดีฟอลต์ **false** = เตรียมทุกอย่างไว้แล้วรอกดเอง เปลี่ยนเป็นโพสต์เองอัตโนมัติด้วย `npm run publish -- profile --set auto_publish=true`

- **2026-08-01 (รอบสอง)** — **ปรับใหม่ตาม feedback: เน้นชีทที่ดินสำหรับโพสต์ลงกลุ่ม + คอนเทนต์ความรู้แบบ carousel** รอบแรกทำตารางโพสต์คลิปเป็นหลัก ซึ่งไม่ตรงกับที่ต้องการจริง

  **ชีทที่ดิน** (`src/content/listings.mjs`) — ดึงที่ดินที่เคยลงเพจไปแล้วมาทำเป็นตารางเพื่อทยอยโพสต์ลงกลุ่มเอง
  - ทางเข้าข้อมูล 2 ทาง: จาก `page-posts.json` (ต้องมี token FB) และ **จากข้อความที่วางเอง (ใช้ได้เลยวันนี้)** คั่นแต่ละโพสต์ด้วย `---`
  - แยกข้อมูลด้วย Haiku ผ่าน `TPL_PROP_010_v1` (template ใหม่ ⚠️ ยังต้องลงทะเบียนใน `17_PROMPT_LIBRARY.md`) ได้ ขนาด · ราคา · ทำเล · จุดเด่น · เบอร์ติดต่อ
  - **ลิงก์แผนที่ดึงด้วย regex ไม่ใช่ให้โมเดลคัดลอก** — โมเดลเปลี่ยน URL ผิดตัวเดียว ลิงก์ก็ตายเงียบๆ regex จึง override คำตอบของโมเดลเสมอ
  - เติมสถานที่ใกล้เคียงจาก Places (ใช้ `geo.mjs`/`places.mjs` เดิม) **เอาแค่ 3 หมวดที่ใกล้สุด หมวดละ 1 แห่ง** — Places คืนได้ถึง 21 รายการ ซึ่งยาวเกินกว่าที่คนจะอ่านในโพสต์กลุ่ม
  - ทดสอบจริงแล้ว: โพสต์ไทยที่มีคำโฆษณา ("ทำเลทองมาก ห้ามพลาด!!") ถูกตัดออกจาก highlights, ลิงก์แผนที่ได้ครบ, Places คืนระยะจริง, และโพสต์ที่ไม่ใช่ประกาศขาย (โพสต์งานวัด) ถูกข้ามถูกต้อง
  - ออก/เข้า Google Sheet ได้ทั้ง CSV และ TSV · คอลัมน์ `maps_url` คือลิงก์แผนที่ · แก้ในชีทแล้วนำกลับเข้าระบบได้

  **แคปชั่นโพสต์กลุ่ม — สั้น เขียนเองไม่ใช้โมเดล**
  - `buildGroupCaption()` เป็นฟังก์ชันตายตัว ~8 บรรทัด: ขนาด+ทำเล / ราคา / bullet ไม่เกิน 4 / ลิงก์แผนที่ / ช่องทางติดต่อ
  - **จงใจไม่ใช้ LLM ตรงนี้**: โพสต์กลุ่มถูกสแกนด้วยตาไม่กี่วินาที ทุกประโยคที่เกินคือคนอ่านที่หายไป · โมเดลที่สั่งว่า "สั้นๆ" จะยาวขึ้นเรื่อยๆ เมื่อทำหลายสิบโพสต์ และอาจแต่งระยะทางขึ้นมาเอง ฟังก์ชันตายตัวทำไม่ได้ · แถมไม่เสียเงินต่อโพสต์
  - รูปในชุดโพสต์ใช้ **รูปของแปลงนั้นจากโพสต์เดิม** (`photo_url`) ไม่เอาคลิปแปลงอื่นมาใส่แทน เพราะนั่นคือการนำเสนอสินค้าผิดตัว

  **คอนเทนต์ความรู้แบบ carousel** (`src/engines/carousel-engine.mjs` + `src/content/topics.mjs`)
  - SVG → PNG ด้วย sharp/librsvg (ทางเดิมที่พิสูจน์แล้วว่าวางสระ/วรรณยุกต์ไทยถูก) ขนาด 1080x1350 (4:5 กินพื้นที่ฟีดมากสุดโดยไม่โดนครอป)
  - layout อยู่ใน `templates/carousel-{cover,point,cta}.svg` แก้สี/ตำแหน่งได้โดยไม่แตะโค้ด · ธีม amber / forest / paper
  - **6 หัวข้อเขียนมือ ไม่ให้ AI แต่ง**: เอกสารสิทธิ์ 5 แบบ · เช็ค 6 ข้อก่อนวางมัดจำ · ที่ดินตาบอด · ค่าใช้จ่ายวันโอน · ผังเมืองสี · ถมที่ดิน — เพราะเป็นข้อมูลที่เพจกำลังยืนยันกับคนซื้อ ถ้าโมเดลมั่วประเภทโฉนดผิดใบเดียว ความน่าเชื่อถือของเพจเสียกับกลุ่มคนที่พยายามจะได้มาพอดี · หัวข้อที่อัตราภาษี/ผังเมืองเปลี่ยนได้ มี disclaimer บนสไลด์ปิดท้าย
  - **ไม่ใช้ image model**: โมเดลสร้างภาพเขียนภาษาไทยให้อ่านออกไม่ได้ และโควตารูป Kling ก็หมดอยู่แล้ว
  - ไม่มีการตัดบรรทัดอัตโนมัติ (ภาษาไทยไม่มีช่องว่างระหว่างคำ ตัดมั่วไม่ได้) จึงเขียนทุกบรรทัดให้สั้นกว่า 40 ตัวอักษรแทน + มี test บังคับ

  **ตารางใหม่: 2-3 โพสต์/วัน และมีคลิปทุกวันแน่นอน**
  - 09:00 จ/พ/ศ — carousel ความรู้ → เพจ
  - 09:30 อ/พฤ/ส/อา — โพสต์ขายที่ดินจากชีท → ชุดโพสต์เอง (ลงกลุ่ม)
  - **19:00 ทุกวัน — คลิปสั้นแนวตั้ง** (`required: true`) ยิง FB Reels + TikTok + YouTube พร้อมกัน
  - 15:00 เสาร์ — ลงกลุ่มรอบสอง (ทราฟฟิกกลุ่มสูงสุดช่วงสุดสัปดาห์)
  - ช่องที่ `required` แล้วหาของไม่ได้ **รายงานเสียงดัง** ไม่ใช่ข้ามเงียบๆ — ทั้ง CLI และหน้าเว็บเตือนว่าวันไหนเพจจะไม่มีคลิปลง
  - คอนเทนต์ความรู้กับโพสต์ขายไม่ลงวันเดียวกัน (มี test คุม) เพื่อไม่ให้ฟีดเป็นการขายล้วน
  - `planAhead` รองรับ 3 แหล่ง: `stock` (คลิป/รูป) · `listing` (ชีทที่ดิน) · `carousel` (ความรู้)
  - **ที่ดินหมุนซ้ำได้ ต่างจากคลิป** — การขายที่ดิน 1 แปลงคือการโพสต์ลงหลายกลุ่มเป็นสัปดาห์ๆ การโพสต์ซ้ำจึงเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด (คลิปยังคง cooldown 14 วันเหมือนเดิม)

  **แก้ระหว่างทาง**
  1. `--` ในคอมเมนต์ SVG ทำให้ librsvg parse ไม่ผ่าน (บั๊กเดิมที่เคยเจอตอนทำ overlay card แล้วเจอซ้ำ) → เปลี่ยนเป็น en dash
  2. `resolveMediaPath()` ใช้ `basename()` ทำให้สไลด์ carousel ที่อยู่ใน `output/carousels/<topic>/` ใช้ไม่ได้ → เปลี่ยนเป็น resolve แล้วตรวจว่าไม่หลุดออกนอก `output/` (กัน path traversal)
  3. route `/output/` ก็ติดปัญหาเดียวกัน แก้พร้อมกัน + เพิ่ม Content-Type ของ png/jpg
  4. `publish.schema.json` ยังไม่รู้จัก `LAND-*` และ `TOPIC-*` ทำให้โพสต์ที่ดิน/ความรู้ตกทุกครั้ง → ขยาย pattern
  5. `pickListing` เดิมเลือกแปลงเดิมซ้ำๆ เมื่อทุกแปลงถูกจองหมด → เรียงตามจำนวนครั้งที่ถูกจองในรอบนั้นก่อน

  **เทสต์รวม 31 เคส ผ่านหมด รันออฟไลน์**

- **2026-08-01 (รอบสาม)** — **ค้นพบ: Ads Manager connector อ่านประกาศขายที่ดินของเพจได้ โดยไม่ต้องมี Page token**

  **⚠️ แก้ความผิดพลาดของรอบก่อน**: ข้อมูล "ที่ดินองครักษ์ 2 ไร่ 2.8 ล้าน" ที่ปรากฏใน Change Log รอบสอง
  **เป็นข้อความที่ Claude แต่งขึ้นเองเพื่อทดสอบว่า extractor ทำงานไหม ไม่ใช่ประกาศจริงของเพจ**
  ตอนนั้นยังไม่มีทางเข้าถึงข้อมูลจริงเลย ตอนนี้ลบออกจากชีทแล้วและแทนที่ด้วยของจริงทั้งหมด

  **ทางเข้าข้อมูลจริงที่ใช้ได้แล้ววันนี้**: โพสต์ขายที่ดินของเพจเคยถูกบูสต์เป็นโฆษณา
  `ads_get_creatives` จึงคืน `body` ซึ่งคือข้อความโพสต์เต็ม + `image_url` + `effective_object_story_id`
  (โยงกลับไปโพสต์บนเพจได้) — **แก้ปัญหาที่ก่อนหน้านี้คิดว่าต้องรอ Page token อย่างเดียว**
  - ad account `2296985067362327` · 35 creatives · **ได้ประกาศจริง 11 รายการ**
  - creative หลายตัวเป็นโพสต์เดียวกันที่บูสต์ซ้ำ/ทำ A/B copy จึง **dedupe ด้วยข้อความ ไม่ใช่ creative id**
  - **ข้อจำกัด: MCP เซิร์ฟเวอร์เรียกเองไม่ได้** จึงพักข้อมูลไว้ที่ `content/ads-creatives.json` เป็นจุดส่งต่อ แล้วนำเข้าด้วย `listings:from-ads` · มีประกาศใหม่ต้องขอให้ Claude ดึงอัปเดตไฟล์ หรือขอ Page token ซึ่งดึงเองได้อัตโนมัติ
  - **ไม่มีลิงก์แผนที่ในประกาศเดิมเลยสักอัน** — คอลัมน์ `maps_url` จึงว่างทั้ง 11 แปลง Places ยังทำงานไม่ได้จนกว่าจะเติมลิงก์เอง · **จงใจไม่ geocode จาก ต./อ./จ.** เพราะได้แค่จุดกึ่งกลางตำบล ถ้าเอาไปคำนวณ "ใกล้ตลาด 800 ม." จะเป็นข้อมูลเท็จในโพสต์ขาย

  **โพสต์ขายที่ดินลงกลุ่มทุกวัน + กติกา 24 ชม.**
  - ช่อง 09:30 เปลี่ยนเป็น **ทุกวัน** และตั้ง `required: true` (เดิม อ/พฤ/ส/อา) · carousel ย้ายไป 12:00 จ/พ/ศ
  - `pickListing()` เขียนใหม่: **กรอง 24 ชม. เป็นกฎแข็ง ไม่มีผ่อนผัน** ต่อให้ทำให้ช่องว่าง — ต่างจากคลิปที่ยอมซ้ำดีกว่าไม่โพสต์ เพราะที่ดินแปลงเดิมโผล่ซ้ำในวันเดียวกันในกลุ่มเดิมคือสิ่งที่ทำให้บัญชีโดนจำกัด
  - **round-robin แท้**: เรียงตามแปลงที่ห่างจากการลงกลุ่มครั้งล่าสุดนานสุด (ไม่เคยลง = มาก่อน) · ทดสอบแล้ววนครบ 11 แปลงใน 11 วันแล้ววนรอบใหม่ตามลำดับเดิม
  - `last_group_post` เปลี่ยนจากเก็บวันที่เป็น **timestamp เต็ม** เพราะกฎ 24 ชม. ต้องใช้ชั่วโมง (รองรับข้อมูลเก่ารูปแบบวันที่ด้วย)
  - planner ฉาย (project) การจองล่วงหน้า: วางแผน 7 วันรวดเดียวแล้ววันที่ 3 รู้ว่าวันที่ 2 ใช้แปลงไหนไปแล้ว

  **แก้ปัญหาความถูกต้องของข้อความ**
  - **`(เจ้าของขายเอง)` พิมพ์เฉพาะเมื่อประกาศต้นฉบับระบุไว้จริง** — เดิมใส่ให้ทุกแปลง ซึ่งกับรีสอร์ทที่ขายผ่านนายหน้าเป็นข้อความเท็จ และหลายกลุ่มรับเฉพาะโพสต์เจ้าของ ติดป้ายผิดคือทางลัดไปสู่การโดนลบออกจากกลุ่ม
  - ขยาย `TPL_PROP_010_v1` ให้รับบ้านและรีสอร์ทด้วย (เดิมรับเฉพาะที่ดิน ทำให้ประกาศบ้านปูนตกไป)

  **เทสต์รวม 35 เคส ผ่านหมด**

- **2026-08-01 (รอบสี่)** — **เพิ่มการสร้างโพสต์ตั้งเวลาในเพจ (= ดราฟต์ที่กดโพสต์เองได้)**

  ตอบคำถาม "Claude เข้าไปสร้างดราฟต์ให้เลยได้มั้ย" — เช็คเครื่องมือที่มีจริงแล้วสรุปได้ 3 ชั้น:
  1. **ในระบบนี้** ✅ ทำอยู่แล้ว (คิว + โฟลเดอร์ชุดโพสต์)
  2. **ในเพจ Facebook** ⏳ เขียนโค้ดเสร็จแล้ว รอ Page token — **Ads connector ทำแทนไม่ได้** ตรวจเครื่องมือทั้งชุดแล้วมีแต่ catalog / audience / ad creative ไม่มี endpoint โพสต์ organic เลย (`ads_create_creative` สร้างได้แค่ dark post ของฝั่งโฆษณา ซึ่งไม่โผล่ใน Business Suite และผูกกับการจ่ายเงิน)
  3. **ในกลุ่ม Facebook** ❌ ไม่มีทาง (เหมือนเดิม)

  **สิ่งสำคัญที่พบ: Graph API ไม่มี "ดราฟต์" ของโพสต์ organic เลย** — `published=false` เฉยๆ ได้ dark post
  ที่ใช้ได้แต่กับโฆษณา ไม่โผล่ใน Business Suite · สิ่งที่ใกล้เคียงดราฟต์ที่สุดคือ **scheduled post**
  (`published=false` + `scheduled_publish_time`) ซึ่งไปอยู่ใน Planner ให้แก้/กดโพสต์ก่อน/ลบได้ จึงใช้ทางนี้
  - `postToPage()` และ `postReel()` รับ `scheduleAt` แล้ว (Reels ใช้ `video_state: SCHEDULED`)
  - `toScheduledUnix()` เช็คกรอบ **10 นาที ถึง 6 เดือน** ของ Meta **ก่อน**อัปโหลด — ไม่งั้นจะอัปวิดีโอเสร็จแล้วค่อยโดนปฏิเสธ
  - สถานะใหม่ `SCHEDULED` แยกจาก `POSTED` และ `published_at` ยังเป็น null จนกว่าจะถึงเวลาจริง (ตั้งเวลาไว้ ≠ โพสต์แล้ว)
  - คำสั่ง `npm run publish -- schedule-fb --days 7 [--live]` ส่งทั้งสัปดาห์เข้า Planner รวดเดียว เฉพาะช่องที่ลงเพจ ไม่ยุ่งกับชุดโพสต์ลงกลุ่ม

  **เทสต์รวม 36 เคส ผ่านหมด**

- **2026-08-01 (รอบห้า)** — user หา App ID เจอแล้ว (`1718330986054662`, บันทึกลง `.env` — App ID ไม่ใช่ความลับ ติดไปกับทุก client-side SDK call อยู่แล้ว ต่างจาก App Secret)
  - เขียน `src/publish/fb-token-setup.mjs` + คำสั่ง `npm run publish -- fb:setup` ทำ 4 ขั้นตอนของการขอ Page token ให้จบในคำสั่งเดียว: ตรวจ token → แลกเป็นอายุยาว → ดึง page token → เขียนลง `.env`
  - **เหตุผลที่ไม่ให้พิมพ์ curl ตามคู่มือ**: ทุกคู่มือให้วาง token ลงใน URL ของ curl ซึ่งทำให้ **token ตกอยู่ใน shell history** ตัวช่วยนี้ทำใน process และไม่พิมพ์ token ออกหน้าจอเลย ตรงตามกฎ "ห้าม log token" ใน `14_PUBLISH_ENGINE.md` §10
  - รายงานปัญหาที่พบบ่อยให้ตรงจุด: สิทธิ์ขาดตัวไหน · เพจไหนที่บัญชีนี้ไม่มีสิทธิ์โพสต์ · และเตือนชัดเมื่อไม่ได้ใส่ App Secret ว่า **page token ที่ได้จาก user token อายุสั้นจะหมดอายุตามไปด้วย** ซึ่งเป็นสาเหตุอันดับหนึ่งของอาการ "เมื่อวานยังใช้ได้"

- **2026-08-01 (รอบหก)** — **เชื่อมเพจสำเร็จ อ่านได้จริงแล้ว 93 โพสต์ → ชีทที่ดิน 64 แปลง**

  user ส่ง token มาในแชท (⚠️ ถือว่าหลุด แนะนำ Invalidate) ตรวจแล้วพบ 3 อย่าง:
  1. **เป็น User Token ไม่ใช่ Page Token** — dropdown ใน Graph API Explorer ดีฟอลต์เป็น User Token คนจึงคัดลอกผิดตัวเป็นปกติ · แก้ `usePageToken()` ให้เช็ค `debug_token` แล้ว**ปฏิเสธถ้าเป็น USER** แทนที่จะเขียนลง `.env` (ของเดิมเขียนลงไปแล้ว ทำให้ `readiness` รายงานว่า "พร้อม" ทั้งที่โพสต์ไม่ได้ — ล้างออกแล้ว)
  2. **หมดอายุใน 4 ชม.** เพราะไม่มี App Secret มาแลกเป็นอายุยาว
  3. **ขาด `pages_manage_posts`** — มีแต่ `pages_show_list`, `pages_read_engagement`, `ads_*` → **อ่านได้ แต่โพสต์ไม่ได้**

  แต่ path `--user-token` แลกเป็น Page token ได้สำเร็จ (`type: PAGE`) และ `verify` ผ่าน:
  **ติดดินบินโดรน - ขายที่ดินนครนายก · ผู้ติดตาม 1,965**

  **ใช้ช่วงที่ token ยังไม่หมดอายุดึงข้อมูลจริงทันที**
  - `page:pull` ดึงโพสต์จริงจากเพจ **93 โพสต์**
  - `listings:from-page` แยกได้ **56 แปลงใหม่** (รวมกับที่นำเข้าจาก Ads เป็น 67) — dedupe ด้วย `source_post_id` ทำงานถูกต้อง โพสต์ที่มาจาก Ads แล้วถูกข้ามอัตโนมัติ
  - **`listings:from-page` กลายเป็นทางหลัก** แทน `ads-creatives.json` ซึ่งลดบทบาทเป็นทางสำรองตอนไม่มี token
  - เพิ่ม `listings:dupes [--fix]` เพราะเพจลงประกาศแปลงเดิมซ้ำหลายรอบข้ามเดือน — จับคู่ด้วย title+ขนาด+ราคา (อนุรักษ์นิยม: แปลงคนละแปลงแทบไม่มีทางตรงกันทั้งสามค่า) เก็บแถวล่าสุดไว้เพราะมีราคาและรูปที่อัปเดตที่สุด · พบ 3 กลุ่ม ซ่อนไป 3 แถว **เหลือใช้งานจริง 64 แปลง**
  - 60 จาก 67 แปลงมีรูปของแปลงนั้นติดมาด้วย ชุดโพสต์ลงกลุ่มจึงมีรูปพร้อม
  - **ลิงก์แผนที่ยังเป็น 0 ทั้งหมด** — ยืนยันแล้วว่าเพจไม่เคยแนบลิงก์แผนที่ในประกาศเลย ต้องเติมเองในชีท
  - คิวโพสต์ลงกลุ่มตอนนี้วนได้ **64 วันก่อนซ้ำแปลงเดิม** (เดิม 11 วัน)

- **2026-08-01 (รอบเจ็ด)** — **แก้ข้อมูลผิดเรื่อง permission ที่ค้างอยู่ในคู่มือและ CLI**

  user ท้วงว่า `publish_video` ไม่มีแล้ว ถูกต้อง และคำแนะนำของระบบยังบอกให้ไปหาอยู่ ซึ่งจะทำให้คนหาไม่เจอแล้วคิดว่าตัวเองทำผิด
  - ลบ `publish_video` ออกจาก **`src/cli/publish.mjs`** และ **`21_PUBLISH_SETUP.md`** เหลือ 3 ตัวที่ใช้จริง: `pages_manage_posts` · `pages_read_engagement` · `pages_show_list`
  - **ไม่มี permission แยกสำหรับวิดีโออีกแล้ว** — `pages_manage_posts` ครอบคลุมข้อความ รูป วิดีโอ ลิงก์ ทั้งหมด (`publish_actions` ตกไปตั้งแต่ v3.0/2018, `publish_pages`+`publish_video` ถูกยุบเป็น `pages_manage_posts` ที่ v7.0/2020)
  - **แก้คำพูดผิดของ Claude เอง**: เคยบอกว่า "Meta ยุบเข้า pages_manage_posts ตั้งแต่ v19" ซึ่งผิดเวอร์ชัน ที่ถูกคือ v7.0 (2020)
  - ตั้ง `REQUIRED_PAGE_PERMISSIONS` ไว้ที่ `adapters/facebook.mjs` แล้วให้ `fb-token-setup.mjs` import ไปใช้ เพื่อไม่ให้รายการสิทธิ์แตกเป็นสองที่แล้วเพี้ยนกันอีก
  - `scopeWarning()` บอกผลกระทบจริงแทนที่จะบอกแค่ว่าขาดอะไร: ขาด `pages_manage_posts` = **อ่านได้ แต่โพสต์ไม่ได้** พร้อมย้ำว่าไม่ต้องไปหา `publish_video`
  - เพิ่มคำเตือน "ต้องติ๊กเลือกเพจในหน้าต่างสิทธิ์" ลงคู่มือ — สาเหตุอันดับหนึ่งที่ `/me/accounts` คืนค่าว่าง
  - **ตรวจ endpoint แล้วถูกต้องอยู่แล้ว**: โค้ดใช้ `graph.facebook.com` ทั้งหมด ไม่มี `graph-video.facebook.com` ที่เลิกใช้แล้วโผล่ที่ไหนเลย ส่วน `rupload.facebook.com` ที่ใช้อยู่คือ host ปัจจุบันของ Reels upload phase ซึ่งคนละตัวกัน
  - บันทึกไว้ในคู่มือด้วยว่า **ไม่ต้องผ่าน App Review** ถ้าเป็นเพจที่ตัวเองเป็นแอดมิน

- **2026-08-01 (รอบแปด)** — **ต่อ Facebook Page token สำเร็จ โพสต์ได้จริงแล้ว**

  - Token ใหม่ผ่านครบ: `pages_manage_posts` · `pages_read_engagement` · `pages_show_list` (ได้มา 17 สิทธิ์ รวม `instagram_basic` + ชุด ads)
  - เพจที่ต่อได้: **ติดดินบินโดรน - ขายที่ดินนครนายก** (`1050500211482963`) ผู้ติดตาม 1,965 · สิทธิ์ในเพจครบทั้ง 6 tasks รวม `CREATE_CONTENT`
  - `readiness` ขึ้น **พร้อม** แล้ว 3 ช่อง: `FACEBOOK_PAGE` · `FACEBOOK_REELS` · `MANUAL_KIT`
  - **ข้อควรจำ — ID ที่คนสับสนบ่อย**: `122201228780762810` ไม่ใช่ page ID แต่เป็น **user ID ส่วนตัว** (Sorachat Jaiboon) ในรูปแบบใหม่ที่ขึ้นต้น `1222...` ซึ่งหน้าตาเหมือน page ID ยุคใหม่มาก · page ID จริงของเพจนี้คือ `1050500211482963` (เลข 16 หลักแบบเดิม) · ถ้าใส่ผิด `/me/accounts` จะไม่เจอแล้วขึ้น "ไม่พบเพจ ... ในบัญชีนี้"
  - **ยังไม่ถาวร**: token นี้หมดอายุ `2026-08-01T17:00:00Z` (เที่ยงคืนไทย) เพราะยังไม่ได้ใส่ `--app-secret` · ต้องรันซ้ำพร้อม App Secret เพื่อให้ได้ token ที่ไม่มีวันหมดอายุก่อนตั้ง cron
  - **ต้องเปลี่ยน token ชุดนี้**: ถูกวางไว้ในแชทแล้ว ถือว่าเปิดเผย

  **โพสต์จริงขึ้นเพจสำเร็จเป็นครั้งแรก** — carousel "เอกสารสิทธิ์ที่ดิน 5 แบบ ต่างกันยังไง 📄" 7 ภาพ
  - `https://www.facebook.com/122123974208736301/posts/122123982068736301` · `is_published: true` · ยืนยันย้อนกลับผ่าน Graph แล้วว่ารูปครบ 7 ภาพ
  - พิสูจน์ว่าเส้นทาง multi-photo post ของ `FACEBOOK_PAGE` ใช้งานได้จริงตั้งแต่ carousel-engine → adapter → Graph

  **caption ที่ยาวเกินเพดาน: เปลี่ยนจาก "ไม่โพสต์" เป็น "ย่อให้พอดี"**
  - ปัญหาเดิม: queue item เก็บ caption ไว้ **ชุดเดียว** แล้วใช้ซ้ำทุกปลายทาง ปลายทางที่เพดานต่ำสุดจึงล้นเกือบทุกสลอตวิดีโอ (Reels 300 ตัวอักษร ชน YouTube Shorts 100) แล้ว `publish-engine.mjs` โยน `ERR_PUB_05` ทิ้งทั้งสลอต — เสียคิวเพราะความยาวอย่างเดียว
  - เพิ่ม `condenseCaption()` ใน `captions.mjs`: ตัด hashtag ก่อน แล้วตัดทีละ**ประโยคเต็ม** จากท้าย แล้วเติม hashtag กลับถ้าเหลือที่ ต่างจาก `enforceLimit()` เดิมที่ตัดหางดื้อๆ จนเบอร์ติดต่อหาย
  - ภาษาไทยไม่มีจุดจบประโยค เลยใช้ **emoji เป็นตัวแบ่งประโยค** (`\p{Extended_Pictographic}`) ซึ่งตรงกับที่ template เขียน caption จริง
  - ถ้าย่อไม่ลงจริงๆ จะ**สร้าง caption ใหม่จากข้อมูลที่ดินที่มีโครงสร้าง** (`fallbackCaption`) แทนที่จะส่งประโยคขาดครึ่ง
  - ผลจริง: 300 → 99 ตัวอักษร ยังได้ทำเล + โฉนด + พร้อมโอน + 2 hashtag ครบ · ตอนนี้ YouTube Shorts เหลือติดแค่ยังไม่ได้ตั้งค่า credential ไม่ติดเรื่องความยาวแล้ว
  - 38/38 เทสต์ผ่าน (เพิ่ม 3 · แก้เทสต์เดิมที่ยืนยันพฤติกรรม "ปฏิเสธ" ให้ตรงกับพฤติกรรมใหม่)

  **ค้างไว้ — caption ที่ Haiku เขียนมามีข้อมูลผิด** (คนละเรื่องกับความยาว ยังไม่ได้แก้)
  - `#ที่ดินเชียงใหม่` ในโพสต์ที่ดิน**นครนายก** — ผิดจังหวัด
  - `#สินค้าอ動産` — มีอักษรญี่ปุ่นปนมา เป็นข้อความเสีย
  - "ราคาถูกและเชื่อถือได้" — เคลมราคาทั้งที่ `price_thb` เป็น `null` · `BANNED_CLAIMS` จับ "ถูกที่สุด" แต่ไม่จับ "ราคาถูก"

- **2026-08-01 (รอบเก้า)** — **ได้ Page token ถาวร + ธีมธรรมชาติสำหรับ carousel**

  **Token ถาวรแล้ว ไม่ต้องต่ออายุอีก**
  - ใส่ `FACEBOOK_APP_SECRET` ลง `.env` แล้วเดินครบสาย: user token สั้น → user token ยาว (60 วัน) → **Page token ที่ไม่มีวันหมดอายุ**
  - ก่อนหน้านี้ลองทางลัดด้วยการเอา *page token* ไปเข้า `fb_exchange_token` ตรงๆ ได้แค่ **60 วัน** ไม่ถาวร · **ตัวที่ทำให้ถาวรคือต้องผ่าน `/me/accounts` ด้วย user token ที่ยาวแล้วเท่านั้น** ทางลัดไม่พอ
  - `readiness` พร้อม 3 ช่อง · `verify` ผ่านทั้ง LINE และ Facebook

  **บทเรียนสำคัญ — ID ของเพจนี้มีสามเลขที่คนสับสนกันมาก**
  | เลข | คืออะไร | ใช้ตรงไหน |
  |---|---|---|
  | `1050500211482963` | **page ID จริง** (แบบเดิม 16 หลัก) | ใส่ `FACEBOOK_PAGE_ID` · เรียก Graph API |
  | `122123974208736301` | page ID แบบใหม่ | โผล่ใน permalink เท่านั้น |
  | `122201228780762810` | **user ID ส่วนตัว** (Sorachat Jaiboon) | ไม่ใช้กับระบบนี้เลย |
  - รอบนี้ `.env` ถูกใส่เป็น `1122201228780762810` = user ID **บวกเลข 1 นำหน้า** ทำให้ Graph ตอบ `error_subcode 33` ว่า object ไม่มีอยู่ ซึ่งอ่านแล้วนึกว่าสิทธิ์ไม่พอ ทั้งที่จริงคือ ID ผิด
  - ช่อง `FACEBOOK_PAGE_ACCESS_TOKEN` ก็ถูกใส่เป็น **user token** แทน page token · จับได้เพราะ `/me` คืนชื่อคน ไม่ใช่ชื่อเพจ — **นี่คือวิธีเช็คที่เร็วที่สุดว่า token เป็นชนิดไหน**
  - ยังไม่มีอะไรกัน `.env` ที่ค่าผิดชนิด ถ้าเจอซ้ำควรให้ `verify` เช็คว่า `/me` คืน page ID ที่ตรงกับ `FACEBOOK_PAGE_ID` จริง

  **ธีม `nature` — วาดฉากจริง ไม่ใช่แค่เปลี่ยนสี**
  - เพิ่มธีมที่ 4 ใน `carousel-engine.mjs`: พื้นเขียวป่า + accent ใบไม้ `#86d29b` + ดวงอาทิตย์โทนอุ่น `#e8c98a` แยกสีออกจากใบไม้ไม่ให้กลืนกัน
  - `natureDecor()` วาด **แสงแดดลอดใบ · สันเขา 3 ชั้น · ใบไม้ลอย** ด้วย path ล้วน ไม่มีไฟล์ภาพ ไม่มีค่าใช้จ่ายต่อครั้ง
  - วาง `{{decor}}` **ต่อจากพื้นหลังทันที** ในทั้ง 3 เทมเพลต ลายจึงอยู่ใต้ตัวหนังสือเสมอ ไม่มีทางบังข้อความ
  - สไลด์เนื้อหามีเลขข้อขนาด 210px มุมขวาบนอยู่แล้ว ถ้าวางดวงอาทิตย์ทับจะขุ่นทั้งคู่ → เลื่อนแสงลงมาช่วงว่างเหนือสันเขา และตัดวงอาทิตย์ทึบออก
  - เพิ่ม `RAW_SLOTS` กันไม่ให้ `fill()` escape markup ของ decor (ถ้า escape จะพังทั้งไฟล์) ทำเป็น allowlist ชัดเจนกันช่องอื่นกลายเป็นรูโหว่ในอนาคต
  - **กับดัก librsvg**: คอมเมนต์ใน SVG ห้ามมี `--` ติดกัน ไม่งั้น parser ตีกลับทั้งไฟล์ (`Double hyphen within comment`) เจอตอนเขียนคอมเมนต์อธิบาย
  - แก้ช่องโหว่เลย์เอาต์เดิมด้วย: หัวข้อที่มีบรรทัดเดียวทิ้งช่องว่าง 82px กลางสไลด์ ดูเหมือนงานยังไม่เสร็จ → เพิ่ม `body_shift` ดึงเนื้อหาขึ้นมาปิดช่อง
  - ตั้ง `nature` เป็นธีมเริ่มต้นของ `carousel` และ `carousel:all` · เรนเดอร์ใหม่ครบทั้ง 6 หัวข้อ

  **โพสต์จริงรอบสอง** — "6 ข้อต้องเช็คก่อนวางมัดจำที่ดิน ✅" 8 ภาพ ธีมธรรมชาติ
  - `https://www.facebook.com/122123974208736301/posts/122123986502736301` · ยืนยันผ่าน Graph แล้วว่า `is_published: true` และรูปครบ 8 ภาพ

- **2026-08-02 (รอบสิบ)** — **กัน caption ผิดข้อมูล · guard token ผิดชนิด · แยกแท็บเพจ/กลุ่ม**

  **`sanitizeCaption()` — ด่านสุดท้ายก่อนโพสต์ ตัด 3 อย่างที่แย่กว่าประโยคไม่สวย**
  1. **hashtag ผิดจังหวัด** อันตรายสุด เพราะผู้อ่านไม่ได้มองว่าเป็นคำผิด แต่มองว่าเป็น**ที่อยู่** แล้วตามไปผิดภาค · ใส่ชื่อจังหวัดครบทั้ง 77 จังหวัด เพราะถ้าใส่แค่บางส่วน จังหวัดที่ไม่ได้นึกถึงจะหลุดผ่านเงียบๆ
  2. **อักษรต่างประเทศปนมา** (Han/Hiragana/Katakana/Hangul) เช่น `#สินค้าอ動産` ซึ่งอ่านแล้วเหมือนเพจเสีย ไม่ใช่แค่ caption เสีย
  3. **เคลมราคาทั้งที่ไม่มีราคา** — ตัด "ราคาถูก/ราคาย่อมเยา/ราคาพิเศษ" เฉพาะตอน `price_thb` เป็น null · ถ้ามีราคาจริงถือเป็นสิทธิ์ผู้ขายที่จะบรรยาย
  - เลือก**ตัดออก ไม่ใช่ปฏิเสธทั้งโพสต์** เพราะที่เหลือมักใช้ได้ และโพสต์ที่สั้นลงนิดดีกว่าคิวที่ไม่ได้ออก
  - ล้างของเก่าในคิวแล้ว **4 รายการ** (มากกว่าที่รายงานไว้ตอนแรก 1 รายการ): `2026-08-01T19:00` · `2026-08-02T19:00` · `2026-08-04T19:00` · `2026-08-07T12:00`

  **`verifyPageToken()` เช็คชนิด token แล้ว**
  - เดิมแค่อ่านเพจได้ก็ผ่าน ซึ่ง**ไม่พอ**: user token ที่มี `pages_read_engagement` อ่านเพจได้สบาย แล้วไปพังตอนเขียนครั้งแรกตอนตี 2
  - เพิ่มการยิง `/me` แล้วเทียบว่า id ตรงกับ `FACEBOOK_PAGE_ID` ไหม — page token คืนชื่อเพจ ส่วน user token คืนชื่อคน เป็นวิธีแยกที่ถูกที่สุด
  - ข้อความ error บอกตรงๆ ว่า "ถ้าชื่อข้างบนเป็นชื่อคน แปลว่าใส่ผิดช่อง" พร้อมคำสั่งแก้

  **ลบโพสต์ทดสอบ 2 อัน แล้วคืนคิวเป็น DRAFT**
  - ไม่ได้ลบทิ้งเฉยๆ แต่คืน `status` เป็น `DRAFT` ล้าง `results`/`posted_at` ด้วย เพื่อให้ทั้งสองสลอตกลับไปโพสต์ตามวันจริง (3 และ 5 ส.ค.) ไม่ใช่หายไปจากตาราง

  **แยกแท็บ "หน้าเพจ" กับ "กลุ่ม" — เก็บความต่างไว้ที่ registry ไม่ใช่ที่ UI**
  - เพิ่ม `mode: "auto" | "manual"` ลง `platforms.mjs` พร้อม `AUTO_PLATFORMS` · `MANUAL_PLATFORMS` · `itemMode()`
  - **auto** (6 ช่อง): FACEBOOK_PAGE · FACEBOOK_REELS · INSTAGRAM_REELS · TIKTOK · YOUTUBE_SHORTS · LINE_OA — มี API โพสต์เองได้ตามเวลา
  - **manual** (1 ช่อง): MANUAL_KIT — **Meta ปิด API โพสต์ลงกลุ่มตั้งแต่ปี 2020 ไม่มี token ไหนโพสต์ลงกลุ่มได้** จึงเป็น manual เพราะข้อจำกัดจริง ไม่ใช่เพราะเลือกเอง
  - เหตุผลที่เก็บไว้ที่ registry: ถ้าเก็บที่ UI ตัวจัดตารางกับหน้าจอจะเข้าใจไม่ตรงกันได้
  - แท็บกลุ่ม**ไม่มีปุ่ม "โพสต์จริง"** เพราะปุ่มที่สัญญาสิ่งที่ทำไม่ได้คือการโกหก ใช้ปุ่ม "เตรียมชุดโพสต์" แทน
  - วันที่ไม่มีช่องในแท็บที่เลือกจะถูกซ่อน ไม่งั้นแท็บกลุ่มจะเหลือแต่หัววันเปล่าๆ ดูเหมือนระบบพัง
  - ตรวจกับ API จริงแล้ว: แท็บหน้าเพจ **10 ช่อง** · แท็บกลุ่ม **7 ช่อง** ใน 7 วัน
  - **ยูทูปในอนาคต**: `YOUTUBE_SHORTS` เป็น auto อยู่แล้ว พอใส่ credential ก็เข้าคิวเดิมได้เลยโดยไม่ต้องแก้โครงคิว

  43/43 เทสต์ผ่าน (เพิ่ม 5 เทสต์สำหรับ `sanitizeCaption`)

- **2026-08-02 (รอบสิบเอ็ด)** — **หน้าตรวจสถานะระบบ `/status` + `npm run publish -- status`**

  ตอบคำถามเดียวที่หน้าอื่นไม่ตอบ: *"ตอนนี้ปล่อยให้รันได้หรือยัง ถ้ายัง ต้องแก้อะไรก่อน"*

  - **`src/publish/status.mjs`** — ตัวรวมผลตรวจ อ่านอย่างเดียว ไม่เขียนไฟล์ ยิงเน็ตแค่ครั้งเดียว (probe token) จึงเรียกบ่อยได้
  - ทุกผลตรวจมีรูปแบบเดียวกัน `{level, id, title, detail, fix}` และมาจาก **producer function ที่แยกกันเป็นอิสระ** — เพิ่ม engine ใหม่ในโฟลเดอร์ทีหลังแค่เขียน producer เพิ่ม 1 ตัว ไม่ต้องแตะ route หน้าเว็บ หรือ logic สรุปผล (ข้อนี้คือที่เตรียมไว้ให้ต่อยอดเป็นระบบรวม)
  - 3 ระดับ: `ok` ไม่ต้องทำอะไร · `warn` ยังโพสต์ได้แต่ด้อยลง · `fail` โพสต์ไม่ออก · **verdict เขียวเมื่อไม่มี fail เลย**
  - สิ่งที่ตรวจ: token (ชนิด/อายุ/สิทธิ์/ตรงเพจไหม) · ปลายทางที่พร้อม · คลังคลิปและ runway · **ไฟล์สื่อในคิวยังอยู่จริงไหม** · แคปชั่นมีปัญหาไหม · ช่องที่ยังไม่มีคอนเทนต์ · โพสต์ที่เคยพลาด · สถานะ `auto_publish`
  - ตรวจแคปชั่นและไฟล์จาก**ของที่เก็บไว้จริง** ไม่ใช่เจนใหม่ก่อนตรวจ เพราะเจนใหม่จะกลบ drift ที่ต้องการหาพอดี
  - ไม่ตรวจคลังรูป เพราะ carousel เรนเดอร์สดจาก topics ไม่ได้ดึงจากคลัง ถ้าเตือนไว้จะกลายเป็นเตือนลอยที่ทุกคนเรียนรู้ที่จะมองข้าม
  - **`/api/status`** แยกออกจาก `/api/publish/*` ตั้งใจ เพราะเป็น endpoint เดียวที่ปลอดภัยให้ monitor หรือแอปอื่นในโฟลเดอร์ยิงได้ · รองรับ `?offline=1` ข้ามการยิงเน็ต และ `?days=`
  - **`npm run publish -- status`** ให้ผลชุดเดียวกัน และ **exit 1 เมื่อ verdict เป็น fail** เพื่อให้ cron เอาไปเป็นด่านกันได้ — token พังจะหยุดทั้งรอบ แทนที่จะไล่พังทีละโพสต์ 12 อัน
  - เรียงผลแบบ fail → warn → ok ให้อ่านจากบนลงล่างเป็นลิสต์งานที่ต้องทำ ไม่ใช่ลำดับที่บังเอิญรัน
  - ผลตรวจจริงตอนนี้: **verdict `warn`** · ผ่าน 6 · เตือน 7 · ต้องแก้ 0 — token ถาวร ไฟล์ครบ แคปชั่นสะอาด เตือนเรื่องปลายทางที่ยังไม่ตั้งค่ากับ `auto_publish` ที่ยังปิด
  - หน้าเดิม `claude-progress-dashboard.html` เป็นบอร์ดความคืบหน้าที่อัปเดตด้วยมือและค้างตั้งแต่ 28 ก.ค. — **คนละงานกัน** ไม่ได้แตะ

- **2026-08-02 (รอบสิบสอง)** — **รวม 3 หน้าเป็นแอปเดียวด้วยแท็บกลาง + เปิดไฟล์สเปก `23_PAGE_STUDIO.md`**

  **`public/nav.js` — แท็บกลางไฟล์เดียว**
  - เดิมมี 3 หน้าที่เชื่อมกันด้วยลิงก์กระจัดกระจาย ตอนนี้มีแถบแท็บเดียวกันทุกหน้า (ต่อยอดจากหน้าเดิม ไม่ได้เขียนใหม่)
  - **เก็บไว้ไฟล์เดียว ไม่ก๊อปมาร์กอัปใส่ 3 หน้า** เพราะถ้าแยกกัน แท็บจะเริ่มไม่ตรงกันตั้งแต่ครั้งแรกที่มีคนรีบ
  - inject CSS เองแต่อ้างเฉพาะ CSS variable ที่แต่ละหน้ามีอยู่แล้ว จึงรับธีมสว่าง/มืดของหน้านั้นๆ ไปเลย ไม่ต้องประกาศสีซ้ำ
  - เสิร์ฟผ่าน route `/nav.js` (เซิร์ฟเวอร์ไม่มี static serving ทั่วไป ต้องประกาศทีละไฟล์)
  - **แท็บที่ยังไม่เสร็จแสดงแต่กดไม่ได้** ติดป้าย "เร็วๆ นี้" — แท็บที่กดแล้วไม่ไปไหนทำให้คนเลิกเชื่อถือทั้งแถบ ส่วนแท็บที่บอกตรงๆ คือ roadmap ที่อ่านได้

  **`23_PAGE_STUDIO.md` — สเปกไว้ทำต่อ 3 เรื่อง**
  1. **คลังคอนเทนต์** — เลิกให้เพจมีแต่คลิป เสนอ 6 ชนิดคอนเทนต์ที่ต้นทุนเกือบศูนย์ (ก่อน/หลังถมที่ · ถาม-ตอบจากคอมเมนต์ · ราคารายตำบล · รีวิวเส้นทาง · อัปเดตโครงการรอบข้าง · เบื้องหลัง) พร้อมโครง `formats.mjs`
  2. **ตัดต่อขั้นต้น** — เดิมร่างไว้ว่าจะเชื่อมกับ CapCut สองทาง · **ยกเลิกแล้ว (2 ส.ค.) ตามที่ user ตัดสินใจ: ไม่ผูกกับ CapCut เลย** ทำแค่ 3 อย่างคือตัดช่วงว่างด้วย FFmpeg `silencedetect` · ใส่ซับ · **export ลงโฟลเดอร์แล้วจบ** คนไปเปิดใน CapCut เอง · ไม่มีอะไรให้พังตอน CapCut อัปเดต · จุดที่ต้องระวังคือ**เวลาซับต้องเลื่อนตามช่วงที่ถูกตัดออก** ไม่งั้นซับหลุดทั้งคลิป และต้องเก็บไฟล์ดิบไว้เผื่อตัดกินเนื้อหา
  3. **ตีเส้นแปลงบนภาพมุมสูง** — แยกชัดว่า **แบบ A (ภาพนิ่ง + เส้นวิ่ง)** ต่างจาก **แบบ B (planar tracking แบบ Mocha)** คนละระดับความยาก · แบบ A ให้ผลทางสายตาเกือบเท่าแบบ B สำหรับงานนี้ เพราะภาพโดรนมุมสูงส่วนใหญ่นิ่งหรือเคลื่อนช้า และเราคุมการถ่ายได้ · ใช้ `stroke-dasharray` + PNG โปร่งใส ซึ่งเป็นทางเดิมของ `overlay-engine.mjs` · มีตัวช่วย snap ขอบด้วย Sobel บน canvas ทำในเบราว์เซอร์ล้วน · **เก็บพิกัดจุดไว้ใน `content/parcels/` เพื่อกลับมาแก้ได้โดยไม่ต้องลากใหม่** เพราะแปลงเดิมถูกโพสต์ซ้ำหลายรอบ
  - ลำดับที่แนะนำ: ตีเส้นแปลง → คลังคอนเทนต์ → ตัดต่อขั้นต้น
  - **ยืนยันแล้วว่าอนิเมชันเส้นวิ่งรอบแปลงทำได้**: `stroke-dasharray`/`stroke-dashoffset` ไล่จาก `L` ลง `0` โดย `L` มาจาก `path.getTotalLength()` · แต่ตอน export เป็นวิดีโอ FFmpeg ไม่เล่น SMIL/CSS ให้ ต้อง**เรนเดอร์ทีละเฟรมเป็น PNG** แล้วต่อเป็น overlay ซึ่งตรงกับทางที่ `overlay-engine.mjs` ทำอยู่แล้ว ไม่ต้องมี headless browser
  - กติกาที่บันทึกไว้กันลืม: หน้าใหม่ทุกหน้าต้องเพิ่ม producer ใน `status.mjs` ด้วย · ของที่วาดเองได้ด้วย SVG อย่าไปเรียก AI สร้างภาพ

- **2026-08-02 (รอบสิบสาม)** — **รื้อดีไซน์ carousel ใหม่ทั้งชุด: ธีมสว่าง + เลย์เอาท์ที่หยุดนิ้ว**

  - **ลบ `output/carousels` ทิ้งทั้งหมด** ตามที่ user สั่ง · **เก็บ mp4 7 ตัวไว้** เพราะมาจาก Kling ที่โควตาหมด สร้างใหม่ไม่ได้ ต่างจาก carousel ที่เรนเดอร์ใหม่จาก `topics.mjs` ได้ตลอด — เขียนเตือนไว้ใน `00_README.md` แล้ว

  **ฟอนต์ — ต้นเหตุที่ "ไม่สวย"**
  - เดิมใช้ `Sathu` ซึ่งเป็นฟอนต์ macOS รุ่นเก่า เปลี่ยน font stack เป็น `Prompt → IBM Plex Sans Thai → Noto Sans Thai → Sukhumvit Set → Sathu`
  - Pango หยิบตัวแรกที่ติดตั้งจริง **ระบบจึงอัปเกรดตัวเองทันทีที่ลงฟอนต์ใหม่ ไม่ต้องแก้โค้ด** · ตอนนี้ได้ Sukhumvit Set ซึ่งดีกว่าเดิมมากแล้ว
  - เครื่องมีฟอนต์ไทยแค่ 5 ตัวและเก่าทั้งหมด → ทำ `assets/README.md` บอกวิธีลง Prompt (ต้องดับเบิลคลิกติดตั้งเข้าเครื่อง ไม่ใช่แค่วางในโฟลเดอร์ เพราะตัวเรนเดอร์อ่านจากระบบ)

  **ธีม `daylight` เป็นค่าเริ่มต้นแทน `nature`**
  - พื้นครีมอุ่น → เซจอ่อน แทนพื้นเขียวเข้ม · พื้นมืดชนะบนมือถือตอนตี 2 แต่แพ้ทุกที่อื่น และทำให้อ่านรวดเดียว 6 สไลด์แล้วล้า
  - ตรวจค่าคอนทราสต์จริง ไม่เดา: accent `#4a6b45` บน `#faf8f3` ประมาณ 5.5:1 ใช้กับตัวเล็กได้
  - ปรับ decor ตามพื้นสว่าง: **ตัดวงอาทิตย์ทึบออก** (บนพื้นมืดเป็นดวงอาทิตย์ บนพื้นสว่างกลายเป็นรอยเปื้อน) เหลือแสงนุ่ม · เพิ่มความเข้ม `muted_color` เพราะชื่อเพจไปทับสันเขาพอดี

  **เลย์เอาท์ใหม่ — แก้ที่ "จืดชืด" ตรงๆ**
  - วินิจฉัย: ของเดิมใช้สีเดียวทั้งสไลด์ **ไม่มีลำดับความสำคัญ ตาจึงไม่รู้จะไปไหนต่อ** ไม่ใช่เพราะสีอ่อนเกิน
  - เพิ่ม accent ที่สอง `warn_color` ดินเผา `#b4552d` ใช้เฉพาะ "กล่องผลเสียถ้าไม่รู้" — เป็นสิ่งเดียวที่โทนอุ่นบนสไลด์ สายตาจึงไปลงที่นั่นเป็นอันดับสอง **โดยไม่ต้องใช้คำเคลมเกินจริง** (`BANNED_CLAIMS` ยังห้าม "ห้ามพลาด/โอกาสสุดท้าย" อยู่)
  - ปก: แท็บพิลล์ทึบมาก่อนข้อความ · หัวเรื่อง 3 บรรทัดโดย**บรรทัดกลางเป็นสีเน้น** เพื่อบอกว่าคำไหนสำคัญ · กล่องผลเสียสีดินเผา · ปุ่มเลื่อนดูขนาดใหญ่ · จุดบอกความคืบหน้า · ตัวนับ `1 / 7` ให้รู้ว่าต้องดูกี่สไลด์
  - สไลด์เนื้อหา: เปลี่ยน**เลขผีขนาด 210px** เป็น**ป้ายเลขทึบ** อ่านเป็นความคืบหน้าได้ทันที · ใส่จุดนำหน้าแต่ละบรรทัด เพราะไม่มีการตัดคำ 4 บรรทัดชิดซ้ายจะอ่านรวมเป็นย่อหน้าเดียว
  - `textWidth()` ประมาณความกว้างข้อความไทยโดย**ไม่นับสระบน/ล่างและวรรณยุกต์** ที่ซ้อนบนพยัญชนะและไม่กินความกว้าง — ถ้านับด้วย ปุ่มจะกว้างเกินจนมีที่ว่างค้างข้างขวา
  - ปิดรูสองจุด: กล่องผลเสียบนปกกว้างตามข้อความจริง ไม่ใช่เต็มคอลัมน์ · กล่องสรุปในสไลด์เนื้อหาเลื่อนตามจำนวนบรรทัด ไม่ปักตายที่ y เดิม (เดิมข้อที่มี 3 บรรทัดเหลือรู 380px กลางสไลด์ ดูเหมือนเรนเดอร์พัง)
  - เติม fallback `warn_color`/`accent_soft` ให้ธีมเก่า 4 ตัว ไม่งั้น `fill=""` ซึ่ง librsvg วาดเป็นสีดำทึบ
  - 43/43 เทสต์ผ่าน · เรนเดอร์ใหม่ครบ 6 หัวข้อ

  **ภาพประกอบ — `src/lib/illustrations.mjs` (รอบสิบสี่ ต่อเนื่องวันเดียวกัน)**
  - user ท้วงว่า "เหมือนเดิมเป๊ะ มีแต่คำพูด" ถูกต้อง — ที่ทำมาทั้งหมดยังเป็นตัวหนังสือล้วน
  - **เช็คทาง API ก่อนแล้ว: Higgsfield เหลือ 10 เครดิต แผนฟรี ยิงสร้างรูปไม่ได้แม้แต่รูปเดียว** · Canva MCP ยังไม่ได้เชื่อมบัญชี · CapCut ไม่มี public API → เลือกวาด SVG เอง
  - และกรณีนี้วาดเองดีกว่าจริง 3 ข้อ: **สไตล์เหมือนกันทั้ง 42 สไลด์** (6 หัวข้อ × 7) · **โมเดลสร้างภาพวาดเอกสารราชการไทยกับตราครุฑผิดเกือบทุกครั้ง** ซึ่งบนเพจขายที่ดินจะถูกอ่านเป็นข้อเท็จจริง · **เรนเดอร์ซ้ำฟรีตลอด**
  - 13 ภาพ: `deed` `plot` `blocked` `road` `water` `pin` `money` `calendar` `warning` `ruler` `truck` `zone` `power` `check`
  - **ตราครุฑวาดแบบย่อเป็นปีกกางในวงกลม ไม่ใช่ตราแผ่นดินจริง** — ต้องอ่านออกว่าเป็น "ตราบนโฉนด" ที่ขนาด 200px บนมือถือ และต้องไม่ถูกเข้าใจผิดว่าเป็นตราราชการของจริง
  - **สีตราเปลี่ยนตามที่สไลด์เขียน**: โฉนด→แดง · น.ส.3ก→เขียว · น.ส.3→ดำ อ่านจากคำว่า "ตราครุฑสี..." ใน `note`
  - เลือกภาพอัตโนมัติจากคำในสไลด์ **ไล่ทีละฟิลด์ตามความเฉพาะเจาะจง (heading → note → lines) ไม่รวมเป็นก้อนเดียว** — รอบแรกรวมกันแล้วสไลด์ "โฉนด" ได้รูปธนบัตร เพราะไปเจอคำว่า "จำนอง" ในบรรทัดล่างก่อน
  - มี `art` ให้ระบุตรงๆ ได้เมื่อคำในสไลด์ไม่ตรงกับภาพที่ควรใช้ (ส.ป.ก. / ภ.บ.ท.5 หัวข้อบอกว่าเป็นเอกสาร แต่เนื้อหาคือคำเตือน → `art: "warning"`)
  - วางที่มุมขวาบนของสไลด์เนื้อหา ซึ่งเป็นบริเวณเดียวที่ข้อความไม่มีทางยาวไปถึง จึงไม่ต้องเขียนโค้ดกันชน

  **โลโก้แบรนด์ + สีประจำหัวข้อ (รอบสิบห้า)**
  - ติดตั้ง HeyGen HyperFrames 25 skills แล้ว แต่**ไม่ได้ใช้กับงานนี้** เพราะเป็นระบบทำวิดีโอ HTML→MP4 ส่วน carousel เป็น PNG นิ่ง — เก็บไว้ใช้ตอนทำสายวิดีโอ (ต้องลง `ffmpeg` ใน PATH ก่อน · ถอดเสียงทำซับใช้ Whisper ในเครื่อง ไม่ต้องมี API key)
  - **ความผิดพลาดที่ต้องจำ: มีโลโก้จริงอยู่ใน `assets/photos/` แล้ว แต่ Claude ไม่ได้เปิดดูโฟลเดอร์ก่อน แล้วไปวาดโลโก้ขึ้นมาเองแทน** · user ต้องท้วงถึงรู้ · **บทเรียน: ก่อนสร้าง asset ใดๆ ให้ `ls` โฟลเดอร์ที่เกี่ยวข้องก่อนเสมอ** โดยเฉพาะเมื่อ user เพิ่งบอกให้ "เอาไฟล์ในโฟลเดอร์ไปใช้"
  - โลโก้ที่วาดเองถูกลบทิ้งแล้ว ใช้ของจริงแทน: **ตราวงกลม โดรนเหนือคำว่า "ติดดิน บินโดรน" + LAND & DRONE SERVICES + ทุ่งนา** โทนน้ำตาลทอง
  - `assets/photos/20260416_111055000_iOS.jpg` → แปลงเป็น `assets/brand/logo.png` โดย**ทำพื้นขาวให้โปร่งใส** (แปลงเป็น alpha ตามค่าความสว่าง + ไล่ขอบกันหยัก) แล้วตัดขอบว่างออก 1408×768 → 624×639
  - ย่อเหลือ 220px เก็บเป็น `logo-mark.png` (65 KB) แล้ว **inline เป็น data URI** เพราะ librsvg ไม่ยอมอ้าง `file://` ภายนอก · อ่านครั้งเดียวแล้ว cache ไว้ ไม่งั้นรัน 6 หัวข้อจะอ่านไฟล์ซ้ำ 43 รอบ
  - **ตัดข้อความชื่อเพจข้างโลโก้ออก** เพราะโลโก้มีชื่ออยู่ในตัวแล้ว สองอย่างพูดชื่อเดียวกันคือ noise
  - ตำแหน่งโลโก้แยกตามชนิดสไลด์: **ปกอยู่ซ้ายล่าง** (เพราะภาพประกอบอยู่ขวาล่าง) · สไลด์เนื้อหากับปิดท้ายอยู่ขวาล่าง (ภาพประกอบอยู่ขวาบน) — ใช้ตำแหน่งเดียวกันทุกใบแล้วชนกับภาพ

  **จัดใหม่เป็นแกนกลาง + โลโก้เป็นลายน้ำ (รอบสิบหก)**
  - user บอกว่า "แต่ละองค์ประกอบไม่ได้เรื่องเลย" → รื้อทั้ง 3 เทมเพลตเป็น **centre-axis** ทุกอย่างแขวนบนเส้นกลางเส้นเดียว สายตาลงมาตรงๆ: แท็ก → ภาพ → หัวเรื่อง → ผลเสีย → ปุ่ม
  - **โลโก้เปลี่ยนจากตราเล็กมุมล่างเป็นลายน้ำเต็มใบ** ขนาด 900px opacity 0.04 กลางสไลด์ — ตราเล็กชนกับองค์ประกอบข้างๆ ตลอด ย้ายไปมุมไหนก็ชนอันใหม่ **ลายน้ำที่อยู่หลังทุกอย่างชนอะไรไม่ได้เลย** และแบรนด์ได้ทุกใบโดยไม่ต้องเสียมุมให้ตรา
  - ขยายตัวอักษร: หัวเรื่องปก 92px · หัวข้อสไลด์เนื้อหา 74px · เนื้อหา 46px (เดิม 43) · กล่องผลเสีย 46px (เดิม 42)
  - ตัดจุดนำหน้าบรรทัดออก เพราะจัดกึ่งกลางแล้วไม่ต้องใช้ และมันทำให้แกนกลางเสีย
  - **ระยะบรรทัดหัวเรื่องต้องใช้ 1.37 เท่า ไม่ใช่ 1.2 แบบภาษาอังกฤษ** — ภาษาไทยซ้อนสระบนแล้ววรรณยุกต์ทับอีกชั้น และมีสระล่างด้วย ระยะที่ดูโปร่งในภาษาอังกฤษจะชนกันในภาษาไทย เจอตอนหัวเรื่อง 3 บรรทัดของ `city-plan-colours` ชนกันจริง
  - กล่องผลเสีย · ปุ่ม · แท็ก · กล่องสรุป คำนวณความกว้างจากข้อความจริงแล้ววางกึ่งกลางเอง ไม่ได้ตรึงความกว้างไว้
  - ภาพประกอบย้ายขึ้นแกนกลางด้านบน ซึ่งเป็นแถบเดียวที่ไม่มีข้อความทุกสไลด์
  - **ลายน้ำย้ายลงมุมขวาล่าง ปล่อยล้นขอบ opacity 0.45** — ทดลอง 0.8 กลางสไลด์ตามที่ user ขอแล้วเห็นชัดว่า**ตัวหนังสือไทยทับตัวหนังสือไทย** ("ติดดิน" ในโลโก้ซ้อน "5 แบบ / ต่างกันยังไง") อ่านยากทั้งคู่ · ย้ายลงมุมล่างแล้วอยู่หลังแค่ปุ่มทึบกับพื้นว่าง จึงเข้มได้จริงโดยไม่กินหัวเรื่อง (user เลือกทางนี้เอง)
  - โลโก้คงสีน้ำตาลแบรนด์ไว้ ไม่เปลี่ยนตามสีหัวข้อ เพราะเป็นสีจริงของแบรนด์ และเป็นจุดอุ่นที่ยึดทุกธีมไว้ด้วยกัน
  - **สรุปสุดท้าย: user เลือกกลับไปวางกลางสไลด์ที่ opacity 0.30** (ลองมาแล้วทั้ง 0.04 · 0.20 · 0.80 กลางสไลด์ และ 0.45 มุมล่าง)

  **แก้ภาพแตก (รอบสิบเจ็ด)** — เจอ 2 สาเหตุ ไม่ใช่สาเหตุเดียว
  1. **โลโก้ถูกยืด 4.1 เท่า** — ฝังไฟล์ขนาด 220px แล้วสั่งแสดงที่ 900px · แก้โดยขยายล่วงหน้าด้วย lanczos3 + sharpen เป็น 1100px แล้วค่อยฝัง (ต้นฉบับ 624px จริงๆ เกิน ~1100 ก็ไม่ได้รายละเอียดเพิ่มแล้ว) · ลอง 1400px ก่อนแต่ไฟล์โต 1.4 MB ฝังใน 43 สไลด์ไม่คุ้ม จึง quantize เหลือ 249 KB ซึ่งที่ opacity 0.30 มองไม่ออกอยู่แล้ว
  2. **export ที่ 1080×1350 พอดีขนาดแสดงผล** — Facebook บีบอัดใหม่ทุกไฟล์ ถ้าให้พิกเซลเท่าที่แสดงพอดี ขอบตัวอักษรจะเละ · เพิ่มเป็น **1440×1800** ให้ FB มีต้นทางที่หนาแน่นกว่าไปบีบ
  - **บั๊กที่เกิดจากการแก้ข้อ 2**: เผลอเปลี่ยน `WIDTH`/`HEIGHT` ที่ใช้คำนวณตำแหน่งกึ่งกลางไปด้วย ทั้งที่พิกัดในเทมเพลตยังเป็น 1080 → ทุกอย่างเลื่อนไปขวาล่างหมด
  - แก้โดย**แยกสองความหมายออกจากกันชัดเจน**: `WIDTH`/`HEIGHT` = พื้นที่เลย์เอาท์ ต้องเท่ากับ viewBox เสมอ · `EXPORT_WIDTH`/`EXPORT_HEIGHT` = ขนาด raster ใช้แค่ตอน rasterise · **เปลี่ยนขนาด export ต้องไม่กระทบเลย์เอาท์เลย นั่นคือเหตุผลที่ต้องแยก**

  **บั๊กสำคัญ: ลิงก์โพสต์ที่ระบบให้มาไม่ใช่ลิงก์จริง (รอบสิบแปด)**
  - user รายงานว่า "เหมือนไม่มีใครกดดูได้เลยนอกจากเจ้าของ" และสงสัยว่า Facebook ปิดกั้น
  - ตรวจแล้ว **ไม่ใช่การปิดกั้น**: เพจ `is_published: true` · โพสต์ `is_hidden: false` · `privacy: สาธารณะ` · แอปไม่มี restriction เกิน 13+
  - ต้นเหตุจริงคือ adapter **ประกอบลิงก์เอง** เป็น `facebook.com/{pageid}_{postid}` ซึ่งหน้าตาเหมือน URL แต่ไม่ใช่ — ทดสอบแล้วได้ **HTTP 301 เด้งทิ้ง** ส่วนลิงก์จริงได้ **HTTP 200**
  - **ที่หลอกให้เข้าใจผิดว่าเป็นการปิดกั้น**: แอดมินที่ล็อกอินอยู่แล้วจะถูก redirect ไปหน้าที่ถูกต้องเงียบๆ ส่วนคนอื่นโดนทิ้ง → อาการออกมาเป็น "มีแต่เจ้าของที่เปิดได้"
  - แก้โดย**ถาม Graph เอา `permalink_url` หลังโพสต์เสร็จ แทนการเดา** · ลิงก์จริงใช้ page id รูปแบบใหม่ (`122123974208736301`) ไม่ใช่ id เดิม
  - ทดสอบลิงก์ใหม่แบบไม่ล็อกอินแล้วได้ **HTTP 200**

  **โพสต์จริงรอบสี่** — `https://www.facebook.com/122123974208736301/posts/122124132398736301` 7 ภาพ
  - ลบโพสต์รอบสามทิ้ง (ใช้ไฟล์ก่อนแก้ภาพแตก) แล้วโพสต์ใหม่ด้วยไฟล์ 1440×1800
  - เนื้อหาปรับตามที่ user ขอ: **ลายน้ำกลับเป็น 0.20** · **เนื้อหาเปลี่ยนจาก Regular เป็น Medium (500)** เพราะบางเกินไปเมื่อวางทับลายน้ำ · กล่องผลเสียบนปกเพิ่มเป็น 700

  **พื้นหลังนุ่มหลังข้อความ (รอบสิบเก้า)**
  - เพิ่ม `bodyPanel()` — สี่เหลี่ยมมนสีพื้นหลัง opacity 0.88 ผ่าน `feGaussianBlur stdDeviation=22` ให้ขอบฟุ้ง อ่านเป็นแสงนวลไม่ใช่กล่องการ์ด ซึ่งกล่องขอบคมจะตีกับเลย์เอาท์แกนกลาง
  - **ครั้งแรกคลุมแค่เนื้อหา หัวข้อเลยลอยอยู่บนโลโก้** และรอยต่อระหว่าง "อยู่บนแผ่น" กับ "อยู่บนลายน้ำ" กวนสายตากว่าอย่างใดอย่างหนึ่ง → ขยายให้คลุมทั้งบล็อก หัวข้อ+เนื้อหา เป็นแผ่นเดียว
  - ขนาดแผ่นคำนวณจากบรรทัดที่กว้างที่สุดในบล็อก (เทียบทั้งหัวข้อ 74px และเนื้อหา 46px) จึงพอดีกับข้อความจริงเสมอ ไม่กว้างค้าง

- **2026-08-03 (รอบยี่สิบ)** — **สายผลิตวิดีโอเดินได้แล้ว: หมุดแผนที่ → ซูมลงแปลง → เสียงพูดไทย → ซับ → คลิปเสร็จ**

  ที่ค้างมานานเพราะเข้าใจว่า "ต้องมีคลิปจาก AI ก่อน" ซึ่งผิด — **ขั้นที่แพงคือ 5.1–5.5 ส่วน Render Engine (5.6–5.8) เป็น FFmpeg ในเครื่องล้วน ต้นทุนศูนย์ รันได้มาตลอด** แค่ไม่มีทางเรียกใช้นอกจากผ่านหน้าเว็บ

  **`src/lib/voice.mjs` — เสียงพูดไทยและซับที่ผูกกัน**
  - ใช้เสียง `Kanya` (th_TH) ที่มากับ macOS **ฟรี ออฟไลน์ ไม่ต้องมี API key**
  - พูดทีละประโยค → วัดความยาวไฟล์นั้น → cue ยาวเท่าเสียงพอดี **ไม่มีการเดาเวลาเลย**
  - **จึงไม่ต้องใช้ Whisper**: เรารู้อยู่แล้วว่าพูดอะไรตอนไหน การถอดเสียงที่เราเพิ่งสร้างเองมีแต่จะเพิ่มโอกาสผิด · Whisper เก็บไว้ใช้กับคลิปที่ถ่ายมาพร้อมเสียงเท่านั้น
  - คืนไฟล์เสียงกับ cue จากฟังก์ชันเดียว ตั้งใจให้แยกกันไม่ได้ ไม่งั้นวันหนึ่งจะมีคนแก้อันเดียวแล้วหลุด sync

  **`src/engines/mapzoom-engine.mjs` — หมุดแผนที่ซูมลงแปลง โดยไม่ใช้ AI**
  - ข้อค้นพบ: การ "ซูมจากหมุดเข้าแปลง" คือ**การซูมบนภาพนิ่ง** ไม่ใช่การสร้างภาพเคลื่อนไหวใหม่
  - ดึงภาพดาวเทียม 4 ระดับซูม (6→11→15→18) + เฟรมปิดท้ายที่มีหมุด แล้วให้ FFmpeg ไล่ซูม
  - **$0.01/คลิป เทียบกับ $0.16 ถ้าใช้ AI — ถูกกว่า 16 เท่า ไม่ติดโควตา และเป็นภาพดาวเทียมจริงของแปลงนั้น**
  - ระดับซูมเว้นไม่เท่ากันตั้งใจ เพราะ zoom ของ Google เป็นลอการิทึม ถ้าไล่เท่ากันจะรู้สึกว่าเริ่มช้าแล้วดิ่งตอนท้าย

  **บั๊กที่เจอและแก้ระหว่างทาง — ทั้งหมดเป็นแบบที่เทสต์ผ่านแต่ผลลัพธ์ผิด**
  1. **`zoompan` ทำคลิปยาว 709 วิ แทนที่จะเป็น 11.8 วิ** — `d=` ขยาย *ทุกเฟรมที่เข้ามา* พอใช้คู่กับ `-loop 1 -t` เลยคูณกัน ต้องป้อนภาพเดียวเท่านั้น
  2. **zoompan ช้ากว่าที่ควร ~10 เท่า** — ผมให้มันเรนเดอร์ที่ 2160×3840 แล้วค่อยย่อ · zoompan สเกลใหม่ทุกเฟรม **ขนาดขาออกคือสิ่งที่แพง ไม่ใช่ขนาดขาเข้า** แก้เป็นให้ออกที่ขนาดจริงเลย
  3. **คลิปออกมาเงียบสนิท** — Render Engine เรียก `cleanTemp()` เป็นสิ่งแรก ซึ่งลบไฟล์เสียงที่เพิ่งสร้างใน `TEMP_DIR` ทิ้ง · error ซ่อนอยู่ใน stderr ของ FFmpeg แล้ว fallback ไปเรนเดอร์ต่อจนสำเร็จ **จึงดูเหมือนผ่าน** · ย้ายไฟล์เสียงไป `output/.voice/`
  4. **เสียงยาว 26 วิ แต่ภาพยาว 11.8 วิ ประโยคท้ายหาย** ซึ่งคือราคาและเบอร์ติดต่อพอดี · เพิ่ม `minDuration` ให้ยืดคลิปคลุมเสียง
  5. **ชื่อแปลงล้นขอบการ์ดปิดท้าย** · เพิ่ม `fitText()` ใน `svg-card.mjs` ตัดตามความกว้างจริง โดยไม่นับสระบน/ล่างและวรรณยุกต์ที่ไม่กินความกว้าง
  6. **อาลิอาสบั๊กใน `voice.mjs`** — `const parts = segments` แล้ว `parts.length = 0` ลบต้นฉบับไปด้วย

  **`src/cli/render.mjs` + `npm run render`** — เรียก Render Engine ได้จากบรรทัดคำสั่งครั้งแรก
  - `--mode mapzoom` หมุดแผนที่ · `--mode clips` ต่อคลิปที่มีอยู่
  - `--listing` ดึงข้อมูลแปลงมาทำบทพูดและการ์ดปิดท้ายอัตโนมัติ · `--script` เขียนบทเอง · `--no-voice`
  - `render-engine.mjs` รับ `voiceover_file` / `music_file` เพิ่มจาก `*_url` เดิม (ไม่ลบของเดิม เพราะ `06_JSON_CONTRACT.md` อ้างถึง)

  **ผลจริง**: `DEMO_mapzoom_LAND-9CDFA2FC_9_16.mp4` · 26.3 วิ · 1080×1920 · เสียง −20 dB (ไม่ใช่ −91 dB แบบคลิปเดิม) · ซับไทย 8 บรรทัดตรงกับเสียง · การ์ดปิดท้ายมีราคาและเบอร์ · **51/51 เทสต์ผ่าน**

  **ผลจาก `/code-review` — แก้ 11 จุด ส่วนใหญ่เป็นแบบ "เทสต์ผ่านแต่ผลลัพธ์ผิด"**
  1. **`--address` โดยไม่มี `--listing` พังทันที** — `flag("address", listing.location)` ประเมิน fallback ทันทีทั้งที่ `listing` เป็น null · พังหลังสร้างเสียงเสร็จแล้วด้วย เสียเวลาฟรี · แก้เป็น `flag("address") ?? listing?.location`
  2. **`--mode clips` กินไฟล์ผลลัพธ์ของตัวเอง** — Render Engine ตั้งชื่อผลลัพธ์รูปแบบเดียวกับคลิปต้นทางเป๊ะ (`${property_id}_${stamp}_${tag}.mp4`) รันซ้ำจึงเอาคลิปที่ฝังซับและการ์ดไปแล้วมาต่อ แล้วฝังทับอีกชั้น **ยาวขึ้นและซ้อนขึ้นทุกรอบ** · แก้โดยใส่ `_render_` ในชื่อไฟล์ผลลัพธ์แล้วกรองออก
  3. **ราคาบนการ์ดล้นขอบ 23 จาก 67 รายการ** — รอบก่อนใส่ `fitText()` ให้ชื่อกับขนาด แต่**ลืมราคาซึ่งเป็นตัวหนังสือใหญ่ที่สุดบนการ์ด** จึงล้นก่อนเพื่อน เช่น "ยกแปลง4ไร่ 4.8ล้านบาท" กว้าง 942px บนพื้นที่ 757px
  4. **fallback ตอนเรนเดอร์ไม่ผ่าน โกหกว่าสำเร็จ** — คำสั่งสำรองเข้ารหัสแค่คลิปที่ต่อแล้ว **ไม่มีซับ ไม่มีการ์ด ไม่มีเสียง** แต่กลับรายงาน `ok` และแจ้งความละเอียดเต็มทั้งที่ลดเหลือ 720p · ตอนนี้รายงาน `degraded` พร้อมบอกว่าหายอะไรบ้าง และแจ้งความละเอียดจริง
  5. **ไฟล์เสียงในเครื่องไม่ถูกตรวจว่ามีอยู่จริง** — path ผิดทำให้ encode หลักล้ม แล้วตกไป fallback ข้อ 4 พอดี กลายเป็นได้วิดีโอที่ไม่มีเนื้อหาอะไรเลยแต่ขึ้นว่าเสร็จ · เพิ่ม `access()` ให้ degrade แบบเดียวกับดาวน์โหลดพลาด
  6. **`options.env` ที่ฉีดเข้ามาไม่ถึง Google Engine** — ส่ง `options` ต่อทั้งก้อน แต่ปลายทางรับ `{ googleMapsApiKey }` คีย์จึงตกหล่นเงียบๆ แล้วไปหยิบ `process.env` แทน
  7. **เพดานยืดคลิป 4 เท่าพาการตัดกลับมา** — บทที่ยาวเกิน 47 วิ จะโดน `-shortest` ตัดท้ายเงียบๆ ซึ่งคือราคากับเบอร์ · เพิ่ม `truncated_seconds` และให้ CLI เตือนเสียงดัง · โหมด clips ก็เตือนเช่นกันโดยเทียบความยาวเสียงกับคลิปที่ได้
  8. **`zooms: []` ทำให้ URL เป็น `zoom=undefined`** แล้ว Google ตอบ 400 พร้อมข้อความสับสน · เพิ่มการตรวจ
  9. **บรรทัดบทที่ขึ้นต้นด้วย `-` ถูก `say` มองเป็น option** ซึ่งเป็นรูปแบบธรรมชาติของ bullet · เปลี่ยนไปส่งข้อความผ่านไฟล์ด้วย `-f`
  10. **`fitText()` ตัดกลางคลัสเตอร์ไทย** ทำให้วรรณยุกต์หลุดจากพยัญชนะ · ถอยกลับไปหาตัวฐานก่อนตัด
  11. คอมเมนต์บอกต้นทุน $0.008 (4 ภาพ) แต่โค้ดดึง 5 ภาพ = $0.01 · แก้ให้ตรง · และ `if/else` ใน CLI ที่สองสาขาเหมือนกันเป๊ะ ทำให้ stack ของ error ที่ไม่คาดคิดหายไป

  53/53 เทสต์ผ่าน (เพิ่มเทสต์กันถอยหลังสำหรับ `zooms` ว่าง และบรรทัดขึ้นต้นด้วยขีด)

  **`src/engines/story-engine.mjs` — ลำดับเรื่องทั้งคลิป (รอบยี่สิบเอ็ด)**

  user ระบุลำดับมาตรง: **นอกโลก → หมุด Google Maps → ภาพดาวเทียม → ซูมมาที่แปลง (รูป input) → ก่อสร้าง → สถานที่ใกล้เคียง → ข้อมูลดีเทล → ป้ายติดต่อกลับ** และ **เสียงอ่านตามแคปชั่น**

  - **หมุดที่ป้อนเข้ามาทำสองหน้าที่**: เป็นจุดที่กล้องร่อนลง และเป็นจุดที่ใช้ค้นสถานที่ใกล้เคียง · engine จึง **geocode ครั้งเดียวแล้วส่งต่อให้ทุกฉาก** ไม่งั้นเสียเงินสองรอบและมีโอกาสได้คำตอบไม่ตรงกัน
  - แยก `src/lib/kenburns.mjs` ออกมาใช้ร่วม (`pushIn` ภาพนิ่ง→คลิป · `cardOverImage` การ์ดทับภาพพื้นหลัง) ทั้งฟิล์มจึงมีภาษาการเคลื่อนไหวเดียวกัน
  - การ์ดวางทับ**ภาพดาวเทียมของแปลงนั้นเอง** ไม่ใช่พื้นสีทึบ ฟิล์มจึงอยู่บนพื้นที่เดิมตลอด ไม่กระโดดไปแผ่นป้ายลอยๆ · หรี่พื้นหลังลงเพราะการ์ดบนภาพดาวเทียมสว่างคืองานที่ตัวหนังสือแพ้
  - **ทุกฉากยกเว้นก่อสร้างสร้างจากภาพนิ่งที่จ่ายไปแล้ว** รวมทั้งคลิป **$0.015** · ก่อสร้างเป็นฉากเดียวที่ต้องใช้โมเดล จึงเป็น opt-in และรายงานเหตุผลที่ข้ามแทนที่จะเงียบ
  - `storyboard.mjs` เดิมมีลำดับ 3 ฉากอยู่แล้วแต่**ทุกฉากยิงผ่าน Kling** จึงใช้ไม่ได้ทั้งหมด ตัวใหม่แทนที่เฉพาะเส้นทางที่ไม่ต้องใช้โมเดล

  **บั๊กที่เจอตอนประกอบฉาก**
  1. **ฉากดีเทลกับป้ายติดต่อทับกัน** — Render Engine วางการ์ดปิดท้ายทับ 6 วิสุดท้าย ซึ่งคือฉากดีเทลพอดี การ์ดสองใบเลยซ้อนกัน · แยกป้ายติดต่อเป็นฉากของตัวเอง แล้วให้ CLI ไม่ส่ง `ending_card` ในโหมด story
  2. **การ์ดดีเทลมีกล่องขาวว่าง** ตรงที่ควรเป็นเบอร์ติดต่อ ทั้งที่ส่งค่าว่างมา · ซ่อนกล่องและ**ตัดความสูงที่จองไว้ทิ้งด้วย** ไม่งั้นเหลือช่องว่างตายอยู่ดี
  3. **เสียงยาวกว่าภาพ 1.4 วิ** — ผมให้ฉากซูมยืดตามสัดส่วนคงที่ ทั้งที่ฉากการ์ดกินเวลาไปแล้ว · เปลี่ยนเป็นให้ฉากซูมรับส่วนที่เหลือหลังหักฉากที่ความยาวคงที่ · **คำเตือนที่เพิ่มไว้ตอน code review จับได้จริง**

  **เสียงที่ดีกว่า macOS (user บอกว่าจะจ่ายให้)** — ตรวจราคาจริงแล้ว
  - **ElevenLabs ผ่าน Higgsfield: 0.3 เครดิต/ประโยค** ≈ $0.012 ที่แพ็ก PLUS รายปี · บทหนึ่งคลิป 8 ประโยค = 2.4 เครดิต ≈ **$0.09/คลิป**
  - เครดิตที่มีตอนนี้ 10 หน่วย ทดสอบได้ประมาณ 4 คลิป
  - รองรับการโคลนเสียง (`create_voice`) ถ้าอยากได้เสียงของเจ้าของเพจเอง
  - **โครงรองรับแล้ว**: เปลี่ยนแค่ข้างใน `speakThai()` ส่วนที่คืนออกมา (ไฟล์เสียง + cue) เหมือนเดิม การผูกซับกับเสียงจึงไม่พัง

  **`src/engines/construction-engine.mjs` — ฉากก่อสร้าง เขียนเสร็จแล้ว รอเติมเงินอย่างเดียว (รอบยี่สิบสอง)**

  **ต้นตอที่ทำให้เกินงบไม่ใช่ภาพ แต่เป็นคลิป AI ระหว่างขั้น**
  | | เดิม | ใหม่ |
  |---|---|---|
  | ภาพ 5 ขั้น | $0.07 | $0.07 |
  | เชื่อมระหว่างขั้น | คลิป AI 5 ตัว **$0.80** | FFmpeg เกลี่ยภาพ **$0** |
  | **รวม** | **$0.87 เกินเพดาน 3 เท่า** | **$0.07 อยู่ในเพดาน ✓** |

  - **เกลี่ยภาพยังได้ผลดีกว่าด้วย** — dissolve ช้าๆ บนกล้องนิ่งคือหน้าตาของ time-lapse ก่อสร้างจริง ส่วนโมเดล image-to-video จะแต่งมุมกล้องเองและวาดฉากใหม่ทุกครั้ง **บ้านเลยเปลี่ยนรูปทรงไปเรื่อยระหว่างขั้น**
  - ยึดทุกขั้นไว้กับ**รูปแปลงจริงของผู้ขาย** เป็นภาพอ้างอิง ไม่งั้นแต่ละขั้นกลายเป็นที่ดินคนละแปลง
  - `xfade` รับได้ทีละสองอินพุต ต้องพับทีละคู่ และ**ทุก transition ที่ผ่านไปแล้วกิน timeline ไปแล้ว** ถ้าลืมลบออกจาก offset ขั้นท้ายๆ จะกระโดด
  - ถ้าสร้างภาพไม่สำเร็จ **ข้ามเฉพาะฉากนี้แล้วบอกเหตุผล** ไม่ล้มทั้งคลิป เพราะฉากอื่นจ่ายไปแล้วและใช้งานได้

  **สิ่งเดียวที่ขวางอยู่: บัญชี Kling เงินหมด** — ทดสอบยิงจริงแล้วได้ `429/1102 Account balance not enough`
  - Kling ต่อไว้แล้วในระบบและถูกที่สุด ($0.014/ภาพ) · ทางเลือกอื่นคือ Higgsfield 1 เครดิต/ภาพ ≈ $0.039 **แพงกว่า 3 เท่าและยังไม่มี adapter** (registry เป็น stub อยู่)
  - ตรวจแล้วว่าโค้ดข้ามฉากอย่างสุภาพและรายงานเหตุผลจริงเมื่อเงินหมด

  **ยังทำไม่ได้ ติดที่งบกับโควตา ไม่ใช่โค้ด**
  - **เส้นทางปลูกบ้านจากภาพมุมสูง** — `CONSTRUCTION_STAGES` นิยาม 5 ขั้นเป็นไทยไว้ครบแล้ว แต่ **$0.87/คลิป เกินเพดาน $0.30 เกือบ 3 เท่า** และโควตา Kling หมด · ทางออก: ลดเหลือ 3 ขั้น หรือต่อ provider ภาพที่ถูกกว่า (สเปกระบุ Flux Schnell $0.003 ถูกกว่า Kling 5 เท่า แต่ registry ยังต่อแค่ kling)
  - **ตัดช่วงเงียบ + ซับจากเสียงจริง** — **ยังไม่มีคลิปที่มีเสียงพูดในระบบเลย ทั้ง 7 ตัววัดได้ −91 dB** ต้องรอไฟล์ถ่ายจริงก่อน

  **สรุปเรื่อง Facebook: พักไว้ก่อน (3 ส.ค.)**
  - โพสต์ผ่าน API ขึ้นเพจได้จริงและถูกต้องทุกฟิลด์ แต่**คนอื่นมองไม่เห็น** ขึ้นว่า "เฉพาะผู้เผยแพร่เท่านั้นที่จะมองเห็น"
  - ต่างจากโพสต์ที่ลงเองจุดเดียวคือฟิลด์ `application` → ชี้ไปที่**โหมด Development ของแอป**
  - **Meta ไม่เปิดให้อ่านโหมด Development/Live ผ่าน API** จึงยืนยันด้วยการวัดไม่ได้ เป็นการอนุมานจากอาการเท่านั้น
  - **ข้อผิดพลาดของ Claude ที่ต้องจำ**: (1) สรุปว่าเป็นแอปเกมจาก `object_store_urls.instant_game` และลิงก์ `facebook.com/games/` ทั้งที่เป็น**ค่าเริ่มต้นของแอปทั่วไป**ที่ไม่ได้ตั้ง platform (2) บอกตำแหน่งสวิตช์ Development/Live จากหน้าจอเวอร์ชันเก่า (3) บอกให้เลือกชนิดแอป "Business" ซึ่งหน้าจอปัจจุบันไม่มีแล้ว — **อย่าอธิบาย UI ของบริการภายนอกด้วยความมั่นใจโดยไม่เห็นหน้าจอจริง ให้ขอภาพหน้าจอ**
  - user ตัดสินใจ**พักเรื่องนี้ไว้ แล้วโพสต์เองแทน** · ตั้งค่าที่ทำไปแล้วไม่เสียเปล่า: `privacy_policy_url` และ `category` ตั้งครบ · หน้านโยบายอยู่ที่ `https://sites.google.com/view/tiddin-privacy` (ร่างเก็บไว้ที่ `assets/privacy-policy-th.md`)

  **โพสต์จริงรอบห้า (ปัจจุบัน)** — `https://www.facebook.com/122123974208736301/posts/122124136790736301`
  - ตรวจการเข้าถึงแบบไม่ล็อกอินแล้ว: เบราว์เซอร์ทั่วไป **HTTP 200** · `facebookexternalhit` (บอทที่ดึงตัวอย่างตอนแชร์) **HTTP 200** · `privacy: สาธารณะ` · 7 ภาพครบ
  - **สีประจำแต่ละหัวข้อ** กันโพสต์ 6 สัปดาห์ติดกันดูเหมือนโพสต์เดิมซ้ำ: `deed-types` เขียวเสจ · `before-you-buy` เขียวน้ำทะเล · `landlocked` โอ๊คเกอร์ · `transfer-costs` คราม · `city-plan-colours` ม่วงพลัม · `land-filling` เขียวมะกอก
  - **เลือกสีเอง ไม่ได้หมุน hue** เพราะการหมุนอัตโนมัติรับประกันคอนทราสต์บนพื้นครีมไม่ได้ ทุกค่าเช็คแล้วว่าเข้มพอ
  - สีเปลี่ยนทั้งใบพร้อมกัน — พิลล์ · หัวเรื่องบรรทัดกลาง · ภาพประกอบ · สันเขา · จุดบอกความคืบหน้า

  **`00_README.md` เพิ่มหัวข้อ "📍 อ่านตรงนี้ก่อน"** — flowchart 2 สาย (สายโพสต์ที่ใช้ได้จริง กับสายผลิตวิดีโอที่ยังค้าง โดยเส้นประคือจุดที่ยังไม่ต่อกัน) + ตารางสถานะรายส่วน เพื่อให้คนเปิดอ่านครั้งแรกเข้าใจว่าทำไมถึงมีแต่สายโพสต์ที่เสร็จ
