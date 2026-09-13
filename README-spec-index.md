# Real Estate AI Automation Platform — Spec Index

**อัปเดต:** 2026-08-19
**ใช้กับ:** Claude Code / NotebookLM / n8n implementation

---

## ไฟล์ปัจจุบัน (ใช้ชุดนี้)

| ไฟล์ | ครอบคลุม |
|---|---|
| `WF5-media-pipeline-spec.md` | **Layer 1–2** — Image prompt (SDXL/Flux), Kling motion vocabulary, construction staging, timing budget, concat/xfade, env vars |
| `WF5-overlay-system.md` | **Layer 3** — Location Card, Ending Card, HTML→PNG→FFmpeg compositing, WF2→WF5 data gap |
| `WF8-photo-narration-voiceclone.md` | **Workflow ใหม่** — หลายรูป → วิดีโอพร้อมเสียงบรรยายโคลนจากวิดีโอต้นฉบับ |

---

## ไฟล์เก่าที่ลบได้ทั้งหมด

| ไฟล์เก่า | ถูกแทนที่ด้วย |
|---|---|
| `WF5_Kling_Prompt_Template.md` (v1) | `WF5-media-pipeline-spec.md` ข้อ 2, 4 |
| `WF5_Kling_Prompt_Spec_v2.md` | `WF5-media-pipeline-spec.md` (ทั้งฉบับ) |
| `WF5-fix-construction-and-overlay.md` | ส่วนที่ 1 → `WF5-media-pipeline-spec.md` ข้อ 3, 5<br>ส่วนที่ 2 → `WF5-overlay-system.md` |

> `WF5-media-generation.md` (ไฟล์หลักเดิม) — **เก็บไว้** ถ้ามีเนื้อหา 5.1/5.2/5.6/5.7 ที่ยังไม่ถูกดูดเข้ามา
> แนะนำให้เช็คแล้วรวมเข้า `WF5-media-pipeline-spec.md` แล้วค่อยลบ

---

## ความสัมพันธ์ระหว่าง Workflow

```
WF1 รับข้อมูลทรัพย์
      ↓ property_id, lat/lng, size, price, contact
WF2 Google Maps enrichment
      ↓ nearby_places[]  ⚠️ ต้องเชื่อมเข้า WF5 (ยังไม่ได้ทำ)
WF3 AI Analysis
      ↓ property_score, ai_note
WF4 Content Generation
      ↓ caption, script, voice_script
      ├──────────────┬──────────────┐
      ↓              ↓              ↓
WF5 Media Gen    WF8 Photo→Video  (ทางเลือก)
 (AI generate)    (รูปจริง+เสียงโคลน)
      └──────────────┴──────────────┘
                     ↓
WF6 Queue & Rate Limit (10 clips/day)
                     ↓
WF7 Auto Publish (FB / IG / TikTok / LINE OA / YT Shorts)
```

**WF5 vs WF8 เลือกยังไง**

| | WF5 | WF8 |
|---|---|---|
| Input | รูปที่ดิน 1 รูป | รูปจริงหลายรูป |
| เนื้อหา | AI จินตนาการบ้าน + construction | รูปถ่ายจริง |
| เสียง | TTS มาตรฐาน | โคลนเสียงเจ้าของ |
| ต้นทุน | สูง (Kling credits) | ต่ำ (Ken Burns) |
| เหมาะกับ | ที่ดินเปล่า ขายฝัน | ทรัพย์ที่มีรูปเยอะแล้ว |

---

## สถานะปัจจุบัน

| รายการ | สถานะ |
|---|---|
| Kling API | 🟢 ใช้ได้ (default engine) |
| Higgsfield API | 🔴 รอเติมเครดิต |
| WF2 → WF5 data pipe | 🔴 ยังไม่เชื่อม |
| Construction staging | 🟡 spec เสร็จ รอ implement |
| Overlay system | 🟡 spec เสร็จ รอ implement |
| WF8 | 🟡 spec เสร็จ รอ implement |

---

## สิ่งที่ต้องทดสอบก่อน Deploy จริง

1. **Kling endpoint** — duration range, ชื่อ field negative prompt, รองรับ start/end frame หรือไม่ (จำเป็นสำหรับ construction)
2. **ฟอนต์ไทยใน Docker** — ทั้งซับไตเติล (FFmpeg) และการ์ด (Puppeteer) ถ้าไม่ติดตั้งจะเป็นสี่เหลี่ยมทั้งคู่
3. **Voice cloning ภาษาไทย** — วรรณยุกต์ คำทับศัพท์ ชื่อสถานที่ไทย ทดสอบด้วยบทจริงก่อน
4. **Seed consistency** — construction 5 stage ต้องได้มุมกล้องเดียวกันจริงๆ ทดสอบกับที่ดิน 3 แปลงที่ต่างกัน
5. **VPS load** — FFmpeg + Puppeteer + Chromium กินแรม ตั้ง queue concurrency = 1–2
