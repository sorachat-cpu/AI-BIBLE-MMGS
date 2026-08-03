# 06. JSON Contract — สัญญาการส่งมอบข้อมูลระหว่าง Engine

> **หมายเหตุการกู้คืนไฟล์ (2026-07-29):** ไฟล์นี้เดิมมีเนื้อหาซ้ำกับ `05_DATABASE.md` แบบทุกตัวอักษร (checksum ตรงกัน) ทำให้ระบบไม่มีสัญญากลางระหว่าง Engine เลย
> ฉบับนี้ประกอบขึ้นใหม่จาก **โครงสร้างที่ใช้งานจริงในโค้ด** (`schemas/*.schema.json` ซึ่งถูกตรวจด้วย AJV ทุกครั้งที่ engine ทำงาน) บวกกับ field ตัวอย่างที่กระจายอยู่ใน `03_SYSTEM_RULES.md`, `04_WORKFLOW.md` และไฟล์ engine 07–15
> **แหล่งความจริงคือไฟล์ใน `schemas/`** เอกสารนี้เป็นคำอธิบายประกอบ ถ้าสองที่ขัดกัน ให้ยึด schema

---

## 1. หลักการ

1. **ห้ามส่งข้อความดิบข้าม Engine** — ทุก payload ต้องผ่าน JSON Schema ก่อนส่งต่อ (กฎเหล็กข้อ 3)
2. **`property_id` คือกุญแจเชื่อมทุก Engine** — รูปแบบ `PROP-TH-#####`
3. **Atomic Transactions** — แต่ละ Engine เขียนเฉพาะ key ของตัวเองใน `engines_data` ห้ามแก้ของ Engine อื่น
4. **ราคา / เบอร์โทร / LINE / QR ปรากฏได้ที่ Render Engine เท่านั้น** — payload ที่วิ่งเข้า House/Video Engine ต้องไม่มีข้อมูลเหล่านี้เด็ดขาด

---

## 2. ตารางสัญญาทั้งหมด

| Contract | ผู้ผลิต | ผู้บริโภค | ไฟล์ schema |
|---|---|---|---|
| `PROPERTY_OUT` | 07 Property Engine | 08, 10, 12 | `schemas/property.schema.json` |
| `GOOGLE_OUT` | 08 Google Engine | 10, 12 | `schemas/google.schema.json` |
| `ASSET_OUT` | 09 Asset Engine | 10, 12 | `schemas/asset.schema.json` |
| `HOUSE_OUT` | 10 House Engine | 11, 12 | `schemas/house.schema.json` |
| `VIDEO_OUT` | 11 Video Engine | 12 | `schemas/video.schema.json` |
| `RENDER_OUT` | 12 Render Engine | 14 | `schemas/render.schema.json` |
| `OVERLAY_OUT` | 13 Overlay Engine | 12 | *(ยังไม่มีไฟล์ — ดูข้อ 4)* |
| `PUBLISH_OUT` | 14 Publish Engine | 15 | *(ยังไม่มีไฟล์ — ดูข้อ 4)* |
| `AnalyticsEventInput` | ทุก Engine | 15 | `schemas/cost.schema.json` |

---

## 3. โครงสร้างแต่ละสัญญา (ย่อ — รายละเอียดเต็มอยู่ในไฟล์ schema)

### PROPERTY_OUT
```json
{
  "property_id": "PROP-TH-01029",
  "title": "บ้านเดี่ยวหรู 2 ชั้น วิวภูเขา เขาใหญ่",
  "price_thb": 12500000,
  "style_tag": "MODERN_NORDIC",
  "raw_address": "ตำบลหมูสี อำเภอปากช่อง จังหวัดนครราชสีมา",
  "highlight_features": ["บ้านเดี่ยว 2 ชั้น", "วิวภูเขา", "พื้นที่ 100 ตารางวา"]
}
```
`style_tag` ต้องเป็นหนึ่งใน `MODERN_NORDIC | MINIMALIST | LUXURY_CLASSIC | CONTEMPORARY | LOFT` เท่านั้น · `price_thb` เป็นตัวเลขล้วนหรือ `null` (ห้ามเดา)

### GOOGLE_OUT
```json
{
  "property_id": "PROP-TH-01029",
  "geo_location": { "lat": 14.7088617, "lng": 101.4196991, "formatted_address": "..." },
  "static_map_url": "https://maps.googleapis.com/maps/api/staticmap?...",
  "street_view_url": "https://maps.googleapis.com/maps/api/streetview?...",
  "cache_hit": false
}
```
⚠️ **`static_map_url` มี API key ฝังอยู่ในลิงก์** ห้ามส่ง URL นี้ให้ provider ภายนอกดึงเอง ต้องดาวน์โหลดมาที่ server แล้วส่งเป็น base64 แทน (พบปัญหานี้จริงตอนต่อ Kling — แก้แล้วใน `src/engines/storyboard.mjs`)

### ASSET_OUT
```json
{
  "property_id": "PROP-TH-01029",
  "categorized_assets": [
    { "asset_id": "ast_7a1c9e2f", "url": "https://cdn.mmgs.io/...", "category": "LAND_VIEW", "safety_status": "SAFE" }
  ]
}
```
`category`: `LAND_VIEW | COMMUNITY | STREET_VIEW | INTERIOR` · `safety_status`: `SAFE | TEXT_DETECTED`

### HOUSE_OUT
```json
{
  "property_id": "PROP-TH-01029",
  "house_image_url": "https://...",
  "source_type": "AI_GENERATED",
  "style_tag": "MODERN_NORDIC",
  "generation_metadata": { "provider": "KLING_IMAGE", "cost_usd": 0.014, "prompt": "...", "seed": 12345 }
}
```
`source_type`: `LIBRARY_REUSE | AI_GENERATED` · `provider` เพิ่มค่า `KLING_IMAGE` เข้ามาเพราะใช้งานจริงแล้ว (registry ใน `16_PROVIDER_INTERFACE.md` ยังไม่ได้อัปเดตตาม)

### VIDEO_OUT
```json
{
  "property_id": "PROP-TH-01029",
  "camera_config": { "motion_type": "PAN_RIGHT", "pan_speed": 0.5 },
  "b_roll_clips": [
    { "clip_id": "vid_d98f7c6b", "video_url": "https://...", "duration_seconds": 5, "camera_motion": "PAN_RIGHT" }
  ]
}
```
`camera_motion`: `PAN_RIGHT | ZOOM_IN | DRONE_REVEAL | TILT_UP`
⚠️ **`video_url` ของ Kling หมดอายุใน 30 วัน** — ถ้าจะเก็บลง `video_library` เพื่อ reuse ตามแผนใน `01_VISION.md` ต้องดาวน์โหลดไฟล์มาเก็บบน storage ของเราเองก่อน ไม่งั้นคลิปในคลังจะตายทั้งหมดใน 30 วัน

### RENDER_OUT
```json
{
  "property_id": "PROP-TH-01029",
  "outputs": [
    { "aspect_ratio": "9:16", "url": "/output/PROP-TH-01029_..._9_16.mp4", "resolution": "1080x1920" },
    { "aspect_ratio": "16:9", "url": "/output/PROP-TH-01029_..._16_9.mp4", "resolution": "1920x1080" }
  ],
  "render_specs": { "fps": 30, "ending_card_seconds": 6 }
}
```
หมายเหตุ: โครงสร้างที่ implement จริงคืน `outputs[]` หลาย aspect ratio ตามที่ WF5 ข้อ 5.8 ต้องการ ต่างจากตัวอย่างเดิมใน `12_RENDER_ENGINE.md` ที่คืน `final_video_url` เดี่ยว

### AnalyticsEventInput
ดู `schemas/cost.schema.json` — `event_type`: `COST_EVENT | PUBLISH_EVENT | PERFORMANCE_EVENT | ERROR_EVENT`
เพดานงบต่อวิดีโอ **$0.30** (RED) · เตือนที่ $0.25 (YELLOW) · ปลอดภัยต่ำกว่า $0.20 (GREEN)

---

## 4. ช่องว่างที่ยังต้องเติม

| สิ่งที่ขาด | ผลกระทบ |
|---|---|
| `schemas/overlay.schema.json` | `OVERLAY_OUT` ยังไม่มี schema ตรวจ — ปัจจุบัน Overlay Engine คืน `overlay_layers[]` ตามตัวอย่างใน `13_OVERLAY_ENGINE.md` |
| `schemas/publish.schema.json` | `PUBLISH_OUT` ยังไม่มี schema ตรวจ (Publish Engine ยังไม่ได้เขียนโค้ด) |
| Meta-contract ระดับ transaction | `02_ARCHITECTURE.md` นิยาม `MMGS_Global_State_Payload` ไว้ แต่ยังไม่มีไฟล์ schema และยังไม่มีโค้ดที่ใช้จริง (รอ Phase 1 ที่มี DB) |

---

## 5. Claude Rules

* ห้ามเพิ่ม field ใหม่เข้า payload โดยไม่แก้ไฟล์ schema ที่คู่กัน — validation จะไม่จับ และ Engine ปลายทางจะพังแบบเงียบๆ
* ห้ามใช้ `additionalProperties: true` เพื่อเลี่ยง validation
* ทุกครั้งที่แก้ contract ต้องอัปเดตทั้ง (ก) ไฟล์ `schemas/*.json` (ข) เอกสารนี้ (ค) `20_ROADMAP.md` Change Log
