ไฟล์ 18 สมบูรณ์ทั้งหมดเลยครับ รวมส่วนที่เคยส่งไปแล้วและส่วนที่ยังขาดอยู่

---

#📂 File: `AI_BIBLE/18_N8N_IMPLEMENTATION.md`

```markdown
# 18. n8n Implementation Guide

## 1. Purpose

เอกสารนี้กำหนดโครงสร้าง Workflow จริงบน n8n ทุก Node ทุก Connection
และทุก Branch Decisionของระบบ MMGS ตั้งแต่รับข้อมูลอสังหาฯดิบ
จนถึงโพสต์วิดีโอสำเร็จบน Social Media พร้อม Analytics Log

---

## 2. Workflow Overview

ระบบแบ่งออกเป็น 4 Workflow หลักที่ทำงานประสานกัน:

```text
WF-01: Property Intake Workflow
  รับข้อมูลดิบ → วิเคราะห์ → บันทึก DB → ส่งต่อ Pipeline

WF-02: Media Production Workflow
  Google Maps → Asset Check → House Gen → Video Gen

WF-03: Render & Publish Workflow
  TTS → Overlay → FFmpeg Render → Caption → Publish

WF-04: Analytics & Cost Workflow
  Logต้นทุน → เก็บ Metrics → สรุป Insight → แจ้งเตือน

WF-ERR-01: Transaction Recovery Workflow
  ตรวจจับ Transaction ค้าง → Resume จาก Last Known State
```

---

## 3. WF-01: Property Intake Workflow

### Trigger Options

```text
Option A: Webhook Trigger
  - รับ HTTP POST จาก Google Form / Line Bot / Web Form
  - Endpoint: POST /webhook/property-intake

Option B: Google Sheets Trigger
  - ดึงแถวใหม่จาก Google Sheets ทุก5 นาที
  - Sheet: "Property Submissions"

Option C: Manual Trigger
  - สำหรับทดสอบด้วยข้อมูลตัวอย่าง
```

### Node Map WF-01

```text
[1. Trigger Node]
     │
     ▼
[2. Input Validator Node]
     │
     ▼
[3. Duplicate Check Node]──► (Found)──► [Notify Duplicate & Stop]
     │ (Not Found)▼
[4. Load Prompt Template Node]
     │
     ▼
[5. Claude Entity Extraction Node]
     │
     ▼
[6. Parse & Validate Claude Response Node]──► (Invalid) ──► [Notify Admin & Stop]
     │ (Valid)
     ▼
[7. Generate Property ID Node]
     │
     ▼
[8. Save to DB Node]
     │
     ▼
[9. Save to Redis Cache Node]
     │
     ▼
[10. Log Cost Event Node]
     │
     ▼
[11. Trigger WF-02 Node]
```

### Node Detail WF-01

#### Node1 — Trigger

```json
{
  "type": "Webhook",
  "path": "property-intake",
  "method": "POST",
  "responseMode": "lastNode",
  "authentication": "headerAuth"
}
```

---

#### Node 2 — Input Validator

```javascript
// Function Node
const body = $input.first().json;

if (!body.raw_input_text || body.raw_input_text.trim().length < 20) {
  throw new Error("ERR_PROP_INPUT: raw_input_text is missing or too short");
}

if (body.raw_input_text.length > 5000) {
  throw new Error("ERR_PROP_INPUT: raw_input_text exceeds 5000 characters");
}

return [{ json: { raw_input_text: body.raw_input_text.trim() } }];
```

---

#### Node 3 — Duplicate Check

```sql
-- PostgreSQL Node
SELECT property_id, raw_title
FROM properties
WHERE raw_title ILIKE '%' || $1 || '%'
  AND created_at > NOW() - INTERVAL '30 days'
LIMIT 1
```

```javascript
// IF Node condition (after PostgreSQL)
// Route to "Stop" if rows returned > 0
{{ $json.rows.length > 0 }}
```

---

#### Node 4 — Load Prompt Template

```javascript
// Function Node
const TEMPLATE_TPL_PROP_001 = `
You are a Thai real estate data extraction specialist.
Extract structured information from the following property listing text.
Return ONLY a valid JSON object. Do not add any explanation.

Required fields:
- title: Clean property title (remove promotional language, phone numbers, Line IDs)
- price_thb: Price as integer only. No commas. No currency symbols.
  Convert: "5ล้าน" → 5000000| "5.5M" → 5500000 | "12.9ล้านบาท" → 12900000
- style_tag: Must be EXACTLY one of:MODERN_NORDIC | MINIMALIST | LUXURY_CLASSIC | CONTEMPORARY | LOFT
- raw_address: Address exactly as written. Do not geocode.
- highlight_features: Array of 3-5 key features. No pricing. No contact info.

Rules:
- If price cannot be determined → price_thb: null
- If style cannot be determined → style_tag: "CONTEMPORARY"
- Do NOT invent data not present in the text
- Do NOT include phone numbers or Line IDs anywhere

Input text:
${$json.raw_input_text}

Return valid JSON only. No markdown. No code block.
`;

return [{ json: { filled_prompt: TEMPLATE_TPL_PROP_001 } }];
```

---

#### Node 5 — Claude Entity Extraction

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $uuid }}",
    "operation_type": "ENTITY_EXTRACTION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.005,
    "payload": {
      "prompt": "={{ $json.filled_prompt }}",
      "max_tokens": 500
    }
  },
  "timeout": 30000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 6 — Parse & Validate Claude Response

```javascript
// Function Node
const raw = $input.first().json;

let parsed;
try {
  parsed = JSON.parse(raw.result.text);
} catch (e) {
  throw new Error("ERR_PROP_PARSE: Claude response is not valid JSON");
}

// Validate required fields
if (!parsed.title || parsed.title.trim() === "") {
  throw new Error("ERR_PROP_VAL_01: title is empty");
}

if (parsed.price_thb !== null && typeof parsed.price_thb !== "number") {
  throw new Error("ERR_PROP_VAL_02: price_thb must be a number or null");
}

const validStyles = ["MODERN_NORDIC", "MINIMALIST", "LUXURY_CLASSIC", "CONTEMPORARY", "LOFT"];
if (!validStyles.includes(parsed.style_tag)) {
  parsed.style_tag = "CONTEMPORARY"; // Safe default
}

if (!Array.isArray(parsed.highlight_features)) {
  parsed.highlight_features = [];
}

// Trim to max 5 features
parsed.highlight_features = parsed.highlight_features.slice(0, 5);

return [{ json: parsed }];
```

---

#### Node 7 — Generate Property ID

```javascript
// Function Node
//ดึง sequenceล่าสุดจาก DB แล้วเพิ่ม 1
const result = await $db.query(
  `SELECT COALESCE(MAX(CAST(SUBSTRING(property_id FROM 9) AS INTEGER)), 0) + 1 AS next_seq
   FROM properties
   WHERE property_id LIKE'PROP-TH-%'`
);

const seq = result.rows[0].next_seq;
const property_id = `PROP-TH-${String(seq).padStart(5, "0")}`;

return [{
  json: {
    ...$json,
    property_id,
    created_at: new Date().toISOString()
  }
}];
```

---

#### Node 8 — Save to DB

```sql
-- PostgreSQL Node
INSERT INTO properties(property_id, raw_title, raw_description, price_thb, property_style)
VALUES
  ($1, $2, $3, $4, $5)
ON CONFLICT (property_id) DO NOTHING
```

---

#### Node 9 — Save to Redis Cache

```javascript
// Function Node (Redis via HTTP or Redis Node)
const cacheKey = `prop_cache:${$json.property_id}`;
const cacheValue = JSON.stringify($json);
const ttl = 86400; // 24 hours

await $redis.set(cacheKey, cacheValue, "EX", ttl);

return [$input.first()];
```

---

#### Node 10 — Log Cost Event

```sql
-- PostgreSQL Node
INSERT INTO analytics_events
  (event_type, transaction_id, property_id, engine_name, provider_name, cost_usd, created_at)
VALUES
  ('COST_EVENT', $1, $2, 'PROPERTY_ENGINE', 'CLAUDE_HAIKU', $3, NOW())
```

---

#### Node 11 — Trigger WF-02

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.WF02_WEBHOOK_URL }}",
  "body": {
    "property_id": "={{ $json.property_id }}",
    "title": "={{ $json.title }}",
    "price_thb": "={{ $json.price_thb }}",
    "style_tag": "={{ $json.style_tag }}",
    "raw_address": "={{ $json.raw_address }}",
    "highlight_features": "={{ $json.highlight_features }}"
  }
}
```

---

## 4. WF-02: Media Production Workflow

### Node Map WF-02

```text
[1. Webhook Trigger]
     │
     ▼
[2. Budget Allocation Node]
     │
     ▼
[3. Google Cache Check Node]──► (HIT) ──────────────────────────┐
     │ (MISS)                                                    │
     ▼                │
[4. Google Geocoding Node]                                       │
     │                                                           │
     ▼                                                           │
[5. Google Static Maps Node]                                     │
     │                                                           │
     ▼                                                           │
[6. Save Google Cache Node]                                      │
     │                                                           │
     └──────────────────────────────────────────────────────────►▼[7. Log Google Cost Node]
                                                              │▼
                [8. Asset Upload Check Node]
                                                     │             (Has Images)    (No Images)
                                                     │             ▼             │
                                           [9. Safety Check Node]  │
                                                     │             │
                                                     ▼             │
                                [10. OCR Detection Node]││             │
                                                     ▼             │
                                           [11. Categorize Assets] │
                                                     └─────────────┘
                                                              │
                                                              ▼
                                                [12. House Library Search]│              │
                                            (FOUND: Reuse)(NOT FOUND)
                                                  │              │
                                                  │▼
                                                │[13. Load House Template]
                                                  │              │
                                                  │              ▼
                                                  │   [14. Generate House Image]
                                                  │              │
                                                  │              ▼
                                                  │   [14b. Save to House Library]
                                                  │              │
                                    [15. Increment Reuse Counter] │
                                                  │              │
                                                  └──────────────┘
                                                              │
                                                              ▼
                                                [16. Log House Cost Node]
                                                              │
                                                              ▼
                                                [17. Video Library Search]
                                                  │              │
                                            (FOUND: Reuse)  (NOT FOUND)
                                                  │              │
                                                  │              ▼
                                                  │   [18. Select Camera Motion]
                                                  │              │
                                                  │              ▼
                                                  │   [19. Generate Video]
                                                  │              │
                                                  │              ▼
                                                  │   [19b. Save to Video Library]
                                                  │              │[20. Increment Video Reuse]│
                                                  │              │
                                                  └──────────────┘
                                                              │
                                                              ▼
                                                  [21. Log Video Cost Node]
                                                              │
                                                              ▼[22. Compile MEDIA_OUT Payload]
                                                              │
                                                              ▼
                                                    [23. Trigger WF-03]
```

### Node Detail WF-02

#### Node 2 — Budget Allocation

```javascript
// Function Node
const BUDGET = {
  total_allocated: 0.30,
  google:0.015,
  asset:   0.010,
  house:   0.050,
  video:   0.200,
  buffer:  0.025
};

// สร้าง transaction_id ใหม่สำหรับ Workflow นี้
const transaction_id = $uuid();

return [{
  json: {
    ...$json,
    transaction_id,
    budget: BUDGET,
    accumulated_cost: 0.0
  }
}];
```

---

#### Node 3 — Google Cache Check

```sql
-- PostgreSQL Node
SELECT
  latitude,
  longitude,
  formatted_address,
  static_map_url,
  street_view_url
FROM google_maps_cache
WHERE property_id = $1
LIMIT 1
```

```javascript
// IF Node — Route condition
{{ $json.rows.length > 0 }}
// true→ Cache Hit path (ข้าม Node4-6)
// false → Cache Miss path
```

---

#### Node 4 — Google Geocoding

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "GEOCODING",
    "preferred_provider": "GOOGLE_GEOCODING",
    "fallback_providers": [],
    "budget_limit_usd": 0.005,
    "payload": {
      "address": "={{ $json.raw_address }}"
    }
  },
  "timeout": 10000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 5 — Google Static Maps

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "STATIC_MAP",
    "preferred_provider": "GOOGLE_STATIC_MAPS",
    "fallback_providers": [],
    "budget_limit_usd": 0.002,
    "payload": {
      "lat": "={{ $json.result.lat }}",
      "lng": "={{ $json.result.lng }}",
      "zoom": 16,
      "size": "1080x1080",
      "maptype": "satellite"
    }
  },
  "timeout": 15000
}
```

---

#### Node 6 — Save Google Cache

```sql
-- PostgreSQL Node
INSERT INTO google_maps_cache
  (property_id, latitude, longitude, formatted_address,
   static_map_url, street_view_url)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (property_id) DO UPDATE
  SET static_map_url = EXCLUDED.static_map_url,
      updated_at = NOW()
```

---

#### Node 13 — Load House Template

```javascript
// Function Node
const TEMPLATE_MAP = {
  MODERN_NORDIC:  "TPL_HOUSE_002_v1",
  LOFT:           "TPL_HOUSE_003_v1",
  LUXURY_CLASSIC: "TPL_HOUSE_004_v1",
  CONTEMPORARY:"TPL_HOUSE_005_v1",
  MINIMALIST:     "TPL_HOUSE_006_v1"
};

const PROMPTS = {
  TPL_HOUSE_002_v1: `Photorealistic exterior of a modern Nordic2-story single family house.
Light grey cement render facade with natural pine wood cladding accents.
Floor-to-ceiling glass windows, minimalist flat roof with subtle overhang.
Gravel garden pathway lined with ornamental grasses.
Surrounded by tall pine trees and silver birch, overcast Nordic sky.
Soft diffused daylight casting gentle shadows on the facade.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_003_v1: `Photorealistic exterior of a modern industrial loft style house.
Exposed dark raw concrete walls, weathered Corten steel beam accents.
Massive warehouse-style steel frame windows with black mullions.
Flat metal roof with rooftop terrace visible, raw brick accent wall on one side.
Urban setting, golden hour sunlight casting long dramatic shadows.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_004_v1: `Photorealistic exterior of a grand luxury classic mansion.
Symmetrical white facade with tall Corinthian columns at entrance portico.
Ornate cornices, decorative pediment, and detailed stone moldings throughout.
Manicured French-style topiary garden with boxwood hedges.
Circular driveway with pale stone pavers and central fountain.
Warm amber evening lighting illuminating the facade dramatically.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_005_v1: `Photorealistic exterior of a contemporary2-story house.
Mixed materials facade: white cement render panels, natural teak wood cladding,
and dark anodized aluminum window frames.
Open plan design with cantilevered upper floor extending over lower terrace.
Infinity edge swimming pool visible at lower terrace level.
Surrounded by mature tropical trees and manicured lawn.
Warm golden hour lighting, sharp focus, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_006_v1: `Photorealistic exterior of a pure minimalist house.
Stark matte white render cubic form, absolutely no ornamentation or decoration.
Ultra flat roof, no visible gutters, flush window frames.
Single narrow horizontal slit window band running the full width.
Dark grey fine gravel courtyard, single sculptural mature olive tree.
Overcast diffused lighting, Tadao Ando and John Pawson inspired.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`
};

const style = $json.style_tag || "CONTEMPORARY";
const templateId = TEMPLATE_MAP[style] || "TPL_HOUSE_005_v1";
const prompt = PROMPTS[templateId];

return [{ json: { ...$json, house_prompt: prompt, template_id: templateId } }];
```

---

#### Node 14 — Generate House Image

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $json.transaction_id }}",
    "operation_type": "IMAGE_GENERATION",
    "preferred_provider": "FLUX_1_DEV",
    "fallback_providers": ["FLUX_1_SCHNELL", "SDXL"],
    "budget_limit_usd": "={{ $json.budget.house }}",
    "payload": {
      "prompt": "={{ $json.house_prompt }}",
      "width": 1024,
      "height": 1024
    }
  },
  "timeout": 90000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 14b — Save to House Library

```sql
-- PostgreSQL Node
INSERT INTO house_library
  (style_tag, image_url, prompt_used, provider_name, generation_cost_usd)
VALUES ($1, $2, $3, $4, $5)
RETURNING house_id
```

---

#### Node 15 — Increment House Reuse Counter

```sql
-- PostgreSQL Node (Library Reuse Path เท่านั้น)
UPDATE house_library
SET times_reused = times_reused + 1
WHERE house_id = $1
RETURNING house_id, image_url
```

---

#### Node 18 — Select Camera Motion

```javascript
// Function Node
const MOTION_MAP = {
  LOFT:           "DRONE_REVEAL",
  MODERN_NORDIC:  "PAN_RIGHT",
  LUXURY_CLASSIC: "TILT_UP",
  CONTEMPORARY:   "ZOOM_IN",
  MINIMALIST:     "PAN_RIGHT"
};

const VIDEO_PROMPTS = {
  DRONE_REVEAL: `Slow cinematic drone rising reveal shot.
Camera starts very low near ground level, slowly ascends vertically
while simultaneously tilting upward to reveal the full property and its surroundings.
Ultra smooth motion, absolutely no camera shake.
Warm golden hour natural lighting throughout the shot.
No text, no overlays, no watermark, no subtitles.`,

  PAN_RIGHT: `Ultra smooth slow cinematic pan from left to right across the property facade.
Steady horizontal camera movement at consistent controlled speed.
Natural parallax depth effect on foreground elements.
Wide establishing shot framing, no camera shake.
No text, no watermark, no overlays.`,

  TILT_UP: `Cinematic tilt-up camera movement starting from the base of the building.
Camera begins at ground level then tilts smoothly upward
to reveal the full height of the structure against the open sky.
Smooth controlled tilt motion, no shake.
No text, no overlays, no watermark.`,

  ZOOM_IN: `Slow cinematic push-in dolly zoom toward the main entrance of the property.
Camera moves smoothly forward as if approaching the front door.
Gentle shallow depth of field with soft bokeh on foreground foliage.
Smooth continuous forward motion, no shake.
No text, no logos, no overlays, no watermark.`
};

const style = $json.style_tag || "CONTEMPORARY";
const motion = MOTION_MAP[style] || "PAN_RIGHT";
const video_prompt = VIDEO_PROMPTS[motion];

return [{ json: { ...$json, camera_motion: motion, video_prompt } }];
```

---

#### Node 19 — Generate Video

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $json.transaction_id }}",
    "operation_type": "IMAGE_TO_VIDEO",
    "preferred_provider": "MINIMAX_VIDEO",
    "fallback_providers": [
      "LUMA_DREAM",
      "KLING_V2",
      "HIGGSFIELD",
      "RUNWAY_GEN3"
    ],
    "budget_limit_usd": "={{ $json.budget.video }}",
    "payload": {
      "image_url": "={{ $json.house_image_url }}",
      "motion_description": "={{ $json.video_prompt }}",
      "camera_motion": "={{ $json.camera_motion }}",
      "duration":5,
      "aspect_ratio": "9:16"
    }
  },
  "timeout": 200000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 19b — Save to Video Library

```sql
-- PostgreSQL Node
INSERT INTO video_library
  (house_id, camera_motion, video_url, provider_name, generation_cost_usd)
VALUES ($1, $2, $3, $4, $5)
RETURNING video_id
```

---

#### Node 22 — Compile MEDIA_OUT Payload

```javascript
// Function Node
const mediaOut = {
  property_id:$json.property_id,
  transaction_id: $json.transaction_id,
  budget:         $json.budget,

  // Google Data
  geo_location: {
    lat:               $json.lat,
    lng:               $json.lng,
    formatted_address: $json.formatted_address
  },
  static_map_url: $json.static_map_url,

  // House Data
  house_image_url: $json.house_image_url,
  house_source_type: $json.house_source_type, // LIBRARY_REUSE or GENERATED_NEW
  style_tag:         $json.style_tag,

  // Video Data
  b_roll_clips: [
    {
      clip_id:          $json.video_id,
      video_url:        $json.video_url,
      duration_seconds: 5.0,
      camera_motion:    $json.camera_motion
    }
  ],

  // Property Data (for Render)
  title:              $json.title,
  price_thb:          $json.price_thb,
  highlight_features: $json.highlight_features,
  raw_address:        $json.raw_address
};

return [{ json: mediaOut }];
```

---

## 5. WF-03: Render & Publish Workflow

### Node Map WF-03

```text
[1. Webhook Trigger]
     │
     ▼
[2. Generate TTS Script Node]
     │
     ▼
[3. Convert Price to Spoken Thai Node]
     │
     ▼
[4. Generate Voiceover Node]
     │
     ▼
[5. Generate Price Badge Text Node]
     │
     ▼
[6. Generate QR Code Node]
     │
     ▼
[7. Download All Assets Node]──► (Fail)──► [Retry x3 → Abort]
     │
     ▼
[8. FFmpeg Render Node]──► (OOM ERR_RND_02) ──► [Retry at 720p]
     │
     ▼
[9. Upload Final Video to S3 Node]──► (Fail) ──► [Retry x3 → Abort]
     │
     ▼
[10. Log Render Cost Node]│
     ▼
[11. Generate Captions — Parallel Branch]
  ┌──────────────┬──────────────┬──────────────┐▼              ▼              ▼              ▼
[11a.TikTok] [11b.YouTube] [11c.Facebook] [11d.Instagram]
  └──────────────┴──────────────┴──────────────┘
                │
                      ▼[12. Merge Captions Node]
                      │
                      ▼[13. Queue for Publishing Node]
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    [14.TikTok] [15.YouTube] [16.Facebook]└───────────┼───────────┘
                      │
                      ▼[17. Collect Post IDs Node]
                      │
                      ▼
         [18. Save Publish Results Node]
                      │
                      ▼
        [19. Update Transaction Status Node]
                      │
                      ▼
            [20. Trigger WF-04 Node]
                      │
                      ▼
       [21. Send Completion Notification Node]
```

### Node Detail WF-03

#### Node 2 — Generate TTS Script
ไฟล์ 18 สมบูรณ์ทั้งหมดเลยครับ รวมส่วนที่เคยส่งไปแล้วและส่วนที่ยังขาดอยู่

---

#📂 File: `AI_BIBLE/18_N8N_IMPLEMENTATION.md`

```markdown
# 18. n8n Implementation Guide

## 1. Purpose

เอกสารนี้กำหนดโครงสร้าง Workflow จริงบน n8n ทุก Node ทุก Connection
และทุก Branch Decisionของระบบ MMGS ตั้งแต่รับข้อมูลอสังหาฯดิบ
จนถึงโพสต์วิดีโอสำเร็จบน Social Media พร้อม Analytics Log

---

## 2. Workflow Overview

ระบบแบ่งออกเป็น 4 Workflow หลักที่ทำงานประสานกัน:

```text
WF-01: Property Intake Workflow
  รับข้อมูลดิบ → วิเคราะห์ → บันทึก DB → ส่งต่อ Pipeline

WF-02: Media Production Workflow
  Google Maps → Asset Check → House Gen → Video Gen

WF-03: Render & Publish Workflow
  TTS → Overlay → FFmpeg Render → Caption → Publish

WF-04: Analytics & Cost Workflow
  Logต้นทุน → เก็บ Metrics → สรุป Insight → แจ้งเตือน

WF-ERR-01: Transaction Recovery Workflow
  ตรวจจับ Transaction ค้าง → Resume จาก Last Known State
```

---

## 3. WF-01: Property Intake Workflow

### Trigger Options

```text
Option A: Webhook Trigger
  - รับ HTTP POST จาก Google Form / Line Bot / Web Form
  - Endpoint: POST /webhook/property-intake

Option B: Google Sheets Trigger
  - ดึงแถวใหม่จาก Google Sheets ทุก5 นาที
  - Sheet: "Property Submissions"

Option C: Manual Trigger
  - สำหรับทดสอบด้วยข้อมูลตัวอย่าง
```

### Node Map WF-01

```text
[1. Trigger Node]
     │
     ▼
[2. Input Validator Node]
     │
     ▼
[3. Duplicate Check Node]──► (Found)──► [Notify Duplicate & Stop]
     │ (Not Found)▼
[4. Load Prompt Template Node]
     │
     ▼
[5. Claude Entity Extraction Node]
     │
     ▼
[6. Parse & Validate Claude Response Node]──► (Invalid) ──► [Notify Admin & Stop]
     │ (Valid)
     ▼
[7. Generate Property ID Node]
     │
     ▼
[8. Save to DB Node]
     │
     ▼
[9. Save to Redis Cache Node]
     │
     ▼
[10. Log Cost Event Node]
     │
     ▼
[11. Trigger WF-02 Node]
```

### Node Detail WF-01

#### Node1 — Trigger

```json
{
  "type": "Webhook",
  "path": "property-intake",
  "method": "POST",
  "responseMode": "lastNode",
  "authentication": "headerAuth"
}
```

---

#### Node 2 — Input Validator

```javascript
// Function Node
const body = $input.first().json;

if (!body.raw_input_text || body.raw_input_text.trim().length < 20) {
  throw new Error("ERR_PROP_INPUT: raw_input_text is missing or too short");
}

if (body.raw_input_text.length > 5000) {
  throw new Error("ERR_PROP_INPUT: raw_input_text exceeds 5000 characters");
}

return [{ json: { raw_input_text: body.raw_input_text.trim() } }];
```

---

#### Node 3 — Duplicate Check

```sql
-- PostgreSQL Node
SELECT property_id, raw_title
FROM properties
WHERE raw_title ILIKE '%' || $1 || '%'
  AND created_at > NOW() - INTERVAL '30 days'
LIMIT 1
```

```javascript
// IF Node condition (after PostgreSQL)
// Route to "Stop" if rows returned > 0
{{ $json.rows.length > 0 }}
```

---

#### Node 4 — Load Prompt Template

```javascript
// Function Node
const TEMPLATE_TPL_PROP_001 = `
You are a Thai real estate data extraction specialist.
Extract structured information from the following property listing text.
Return ONLY a valid JSON object. Do not add any explanation.

Required fields:
- title: Clean property title (remove promotional language, phone numbers, Line IDs)
- price_thb: Price as integer only. No commas. No currency symbols.
  Convert: "5ล้าน" → 5000000| "5.5M" → 5500000 | "12.9ล้านบาท" → 12900000
- style_tag: Must be EXACTLY one of:MODERN_NORDIC | MINIMALIST | LUXURY_CLASSIC | CONTEMPORARY | LOFT
- raw_address: Address exactly as written. Do not geocode.
- highlight_features: Array of 3-5 key features. No pricing. No contact info.

Rules:
- If price cannot be determined → price_thb: null
- If style cannot be determined → style_tag: "CONTEMPORARY"
- Do NOT invent data not present in the text
- Do NOT include phone numbers or Line IDs anywhere

Input text:
${$json.raw_input_text}

Return valid JSON only. No markdown. No code block.
`;

return [{ json: { filled_prompt: TEMPLATE_TPL_PROP_001 } }];
```

---

#### Node 5 — Claude Entity Extraction

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $uuid }}",
    "operation_type": "ENTITY_EXTRACTION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.005,
    "payload": {
      "prompt": "={{ $json.filled_prompt }}",
      "max_tokens": 500
    }
  },
  "timeout": 30000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 6 — Parse & Validate Claude Response

```javascript
// Function Node
const raw = $input.first().json;

let parsed;
try {
  parsed = JSON.parse(raw.result.text);
} catch (e) {
  throw new Error("ERR_PROP_PARSE: Claude response is not valid JSON");
}

// Validate required fields
if (!parsed.title || parsed.title.trim() === "") {
  throw new Error("ERR_PROP_VAL_01: title is empty");
}

if (parsed.price_thb !== null && typeof parsed.price_thb !== "number") {
  throw new Error("ERR_PROP_VAL_02: price_thb must be a number or null");
}

const validStyles = ["MODERN_NORDIC", "MINIMALIST", "LUXURY_CLASSIC", "CONTEMPORARY", "LOFT"];
if (!validStyles.includes(parsed.style_tag)) {
  parsed.style_tag = "CONTEMPORARY"; // Safe default
}

if (!Array.isArray(parsed.highlight_features)) {
  parsed.highlight_features = [];
}

// Trim to max 5 features
parsed.highlight_features = parsed.highlight_features.slice(0, 5);

return [{ json: parsed }];
```

---

#### Node 7 — Generate Property ID

```javascript
// Function Node
//ดึง sequenceล่าสุดจาก DB แล้วเพิ่ม 1
const result = await $db.query(
  `SELECT COALESCE(MAX(CAST(SUBSTRING(property_id FROM 9) AS INTEGER)), 0) + 1 AS next_seq
   FROM properties
   WHERE property_id LIKE'PROP-TH-%'`
);

const seq = result.rows[0].next_seq;
const property_id = `PROP-TH-${String(seq).padStart(5, "0")}`;

return [{
  json: {
    ...$json,
    property_id,
    created_at: new Date().toISOString()
  }
}];
```

---

#### Node 8 — Save to DB

```sql
-- PostgreSQL Node
INSERT INTO properties(property_id, raw_title, raw_description, price_thb, property_style)
VALUES
  ($1, $2, $3, $4, $5)
ON CONFLICT (property_id) DO NOTHING
```

---

#### Node 9 — Save to Redis Cache

```javascript
// Function Node (Redis via HTTP or Redis Node)
const cacheKey = `prop_cache:${$json.property_id}`;
const cacheValue = JSON.stringify($json);
const ttl = 86400; // 24 hours

await $redis.set(cacheKey, cacheValue, "EX", ttl);

return [$input.first()];
```

---

#### Node 10 — Log Cost Event

```sql
-- PostgreSQL Node
INSERT INTO analytics_events
  (event_type, transaction_id, property_id, engine_name, provider_name, cost_usd, created_at)
VALUES
  ('COST_EVENT', $1, $2, 'PROPERTY_ENGINE', 'CLAUDE_HAIKU', $3, NOW())
```

---

#### Node 11 — Trigger WF-02

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.WF02_WEBHOOK_URL }}",
  "body": {
    "property_id": "={{ $json.property_id }}",
    "title": "={{ $json.title }}",
    "price_thb": "={{ $json.price_thb }}",
    "style_tag": "={{ $json.style_tag }}",
    "raw_address": "={{ $json.raw_address }}",
    "highlight_features": "={{ $json.highlight_features }}"
  }
}
```

---

## 4. WF-02: Media Production Workflow

### Node Map WF-02

```text
[1. Webhook Trigger]
     │
     ▼
[2. Budget Allocation Node]
     │
     ▼
[3. Google Cache Check Node]──► (HIT) ──────────────────────────┐
     │ (MISS)                                                    │
     ▼                │
[4. Google Geocoding Node]                                       │
     │                                                           │
     ▼                                                           │
[5. Google Static Maps Node]                                     │
     │                                                           │
     ▼                                                           │
[6. Save Google Cache Node]                                      │
     │                                                           │
     └──────────────────────────────────────────────────────────►▼[7. Log Google Cost Node]
                                                              │▼
                [8. Asset Upload Check Node]
                                                     │             (Has Images)    (No Images)
                                                     │             ▼             │
                                           [9. Safety Check Node]  │
                                                     │             │
                                                     ▼             │
                                [10. OCR Detection Node]││             │
                                                     ▼             │
                                           [11. Categorize Assets] │
                                                     └─────────────┘
                                                              │
                                                              ▼
                                                [12. House Library Search]│              │
                                            (FOUND: Reuse)(NOT FOUND)
                                                  │              │
                                                  │▼
                                                │[13. Load House Template]
                                                  │              │
                                                  │              ▼
                                                  │   [14. Generate House Image]
                                                  │              │
                                                  │              ▼
                                                  │   [14b. Save to House Library]
                                                  │              │
                                    [15. Increment Reuse Counter] │
                                                  │              │
                                                  └──────────────┘
                                                              │
                                                              ▼
                                                [16. Log House Cost Node]
                                                              │
                                                              ▼
                                                [17. Video Library Search]
                                                  │              │
                                            (FOUND: Reuse)  (NOT FOUND)
                                                  │              │
                                                  │              ▼
                                                  │   [18. Select Camera Motion]
                                                  │              │
                                                  │              ▼
                                                  │   [19. Generate Video]
                                                  │              │
                                                  │              ▼
                                                  │   [19b. Save to Video Library]
                                                  │              │[20. Increment Video Reuse]│
                                                  │              │
                                                  └──────────────┘
                                                              │
                                                              ▼
                                                  [21. Log Video Cost Node]
                                                              │
                                                              ▼[22. Compile MEDIA_OUT Payload]
                                                              │
                                                              ▼
                                                    [23. Trigger WF-03]
```

### Node Detail WF-02

#### Node 2 — Budget Allocation

```javascript
// Function Node
const BUDGET = {
  total_allocated: 0.30,
  google:0.015,
  asset:   0.010,
  house:   0.050,
  video:   0.200,
  buffer:  0.025
};

// สร้าง transaction_id ใหม่สำหรับ Workflow นี้
const transaction_id = $uuid();

return [{
  json: {
    ...$json,
    transaction_id,
    budget: BUDGET,
    accumulated_cost: 0.0
  }
}];
```

---

#### Node 3 — Google Cache Check

```sql
-- PostgreSQL Node
SELECT
  latitude,
  longitude,
  formatted_address,
  static_map_url,
  street_view_url
FROM google_maps_cache
WHERE property_id = $1
LIMIT 1
```

```javascript
// IF Node — Route condition
{{ $json.rows.length > 0 }}
// true→ Cache Hit path (ข้าม Node4-6)
// false → Cache Miss path
```

---

#### Node 4 — Google Geocoding

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "GEOCODING",
    "preferred_provider": "GOOGLE_GEOCODING",
    "fallback_providers": [],
    "budget_limit_usd": 0.005,
    "payload": {
      "address": "={{ $json.raw_address }}"
    }
  },
  "timeout": 10000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 5 — Google Static Maps

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "STATIC_MAP",
    "preferred_provider": "GOOGLE_STATIC_MAPS",
    "fallback_providers": [],
    "budget_limit_usd": 0.002,
    "payload": {
      "lat": "={{ $json.result.lat }}",
      "lng": "={{ $json.result.lng }}",
      "zoom": 16,
      "size": "1080x1080",
      "maptype": "satellite"
    }
  },
  "timeout": 15000
}
```

---

#### Node 6 — Save Google Cache

```sql
-- PostgreSQL Node
INSERT INTO google_maps_cache
  (property_id, latitude, longitude, formatted_address,
   static_map_url, street_view_url)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (property_id) DO UPDATE
  SET static_map_url = EXCLUDED.static_map_url,
      updated_at = NOW()
```

---

#### Node 13 — Load House Template

```javascript
// Function Node
const TEMPLATE_MAP = {
  MODERN_NORDIC:  "TPL_HOUSE_002_v1",
  LOFT:           "TPL_HOUSE_003_v1",
  LUXURY_CLASSIC: "TPL_HOUSE_004_v1",
  CONTEMPORARY:"TPL_HOUSE_005_v1",
  MINIMALIST:     "TPL_HOUSE_006_v1"
};

const PROMPTS = {
  TPL_HOUSE_002_v1: `Photorealistic exterior of a modern Nordic2-story single family house.
Light grey cement render facade with natural pine wood cladding accents.
Floor-to-ceiling glass windows, minimalist flat roof with subtle overhang.
Gravel garden pathway lined with ornamental grasses.
Surrounded by tall pine trees and silver birch, overcast Nordic sky.
Soft diffused daylight casting gentle shadows on the facade.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_003_v1: `Photorealistic exterior of a modern industrial loft style house.
Exposed dark raw concrete walls, weathered Corten steel beam accents.
Massive warehouse-style steel frame windows with black mullions.
Flat metal roof with rooftop terrace visible, raw brick accent wall on one side.
Urban setting, golden hour sunlight casting long dramatic shadows.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_004_v1: `Photorealistic exterior of a grand luxury classic mansion.
Symmetrical white facade with tall Corinthian columns at entrance portico.
Ornate cornices, decorative pediment, and detailed stone moldings throughout.
Manicured French-style topiary garden with boxwood hedges.
Circular driveway with pale stone pavers and central fountain.
Warm amber evening lighting illuminating the facade dramatically.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_005_v1: `Photorealistic exterior of a contemporary2-story house.
Mixed materials facade: white cement render panels, natural teak wood cladding,
and dark anodized aluminum window frames.
Open plan design with cantilevered upper floor extending over lower terrace.
Infinity edge swimming pool visible at lower terrace level.
Surrounded by mature tropical trees and manicured lawn.
Warm golden hour lighting, sharp focus, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`,

  TPL_HOUSE_006_v1: `Photorealistic exterior of a pure minimalist house.
Stark matte white render cubic form, absolutely no ornamentation or decoration.
Ultra flat roof, no visible gutters, flush window frames.
Single narrow horizontal slit window band running the full width.
Dark grey fine gravel courtyard, single sculptural mature olive tree.
Overcast diffused lighting, Tadao Ando and John Pawson inspired.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.`
};

const style = $json.style_tag || "CONTEMPORARY";
const templateId = TEMPLATE_MAP[style] || "TPL_HOUSE_005_v1";
const prompt = PROMPTS[templateId];

return [{ json: { ...$json, house_prompt: prompt, template_id: templateId } }];
```

---

#### Node 14 — Generate House Image

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $json.transaction_id }}",
    "operation_type": "IMAGE_GENERATION",
    "preferred_provider": "FLUX_1_DEV",
    "fallback_providers": ["FLUX_1_SCHNELL", "SDXL"],
    "budget_limit_usd": "={{ $json.budget.house }}",
    "payload": {
      "prompt": "={{ $json.house_prompt }}",
      "width": 1024,
      "height": 1024
    }
  },
  "timeout": 90000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 14b — Save to House Library

```sql
-- PostgreSQL Node
INSERT INTO house_library
  (style_tag, image_url, prompt_used, provider_name, generation_cost_usd)
VALUES ($1, $2, $3, $4, $5)
RETURNING house_id
```

---

#### Node 15 — Increment House Reuse Counter

```sql
-- PostgreSQL Node (Library Reuse Path เท่านั้น)
UPDATE house_library
SET times_reused = times_reused + 1
WHERE house_id = $1
RETURNING house_id, image_url
```

---

#### Node 18 — Select Camera Motion

```javascript
// Function Node
const MOTION_MAP = {
  LOFT:           "DRONE_REVEAL",
  MODERN_NORDIC:  "PAN_RIGHT",
  LUXURY_CLASSIC: "TILT_UP",
  CONTEMPORARY:   "ZOOM_IN",
  MINIMALIST:     "PAN_RIGHT"
};

const VIDEO_PROMPTS = {
  DRONE_REVEAL: `Slow cinematic drone rising reveal shot.
Camera starts very low near ground level, slowly ascends vertically
while simultaneously tilting upward to reveal the full property and its surroundings.
Ultra smooth motion, absolutely no camera shake.
Warm golden hour natural lighting throughout the shot.
No text, no overlays, no watermark, no subtitles.`,

  PAN_RIGHT: `Ultra smooth slow cinematic pan from left to right across the property facade.
Steady horizontal camera movement at consistent controlled speed.
Natural parallax depth effect on foreground elements.
Wide establishing shot framing, no camera shake.
No text, no watermark, no overlays.`,

  TILT_UP: `Cinematic tilt-up camera movement starting from the base of the building.
Camera begins at ground level then tilts smoothly upward
to reveal the full height of the structure against the open sky.
Smooth controlled tilt motion, no shake.
No text, no overlays, no watermark.`,

  ZOOM_IN: `Slow cinematic push-in dolly zoom toward the main entrance of the property.
Camera moves smoothly forward as if approaching the front door.
Gentle shallow depth of field with soft bokeh on foreground foliage.
Smooth continuous forward motion, no shake.
No text, no logos, no overlays, no watermark.`
};

const style = $json.style_tag || "CONTEMPORARY";
const motion = MOTION_MAP[style] || "PAN_RIGHT";
const video_prompt = VIDEO_PROMPTS[motion];

return [{ json: { ...$json, camera_motion: motion, video_prompt } }];
```

---

#### Node 19 — Generate Video

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $json.transaction_id }}",
    "operation_type": "IMAGE_TO_VIDEO",
    "preferred_provider": "MINIMAX_VIDEO",
    "fallback_providers": [
      "LUMA_DREAM",
      "KLING_V2",
      "HIGGSFIELD",
      "RUNWAY_GEN3"
    ],
    "budget_limit_usd": "={{ $json.budget.video }}",
    "payload": {
      "image_url": "={{ $json.house_image_url }}",
      "motion_description": "={{ $json.video_prompt }}",
      "camera_motion": "={{ $json.camera_motion }}",
      "duration":5,
      "aspect_ratio": "9:16"
    }
  },
  "timeout": 200000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 19b — Save to Video Library

```sql
-- PostgreSQL Node
INSERT INTO video_library
  (house_id, camera_motion, video_url, provider_name, generation_cost_usd)
VALUES ($1, $2, $3, $4, $5)
RETURNING video_id
```

---

#### Node 22 — Compile MEDIA_OUT Payload

```javascript
// Function Node
const mediaOut = {
  property_id:$json.property_id,
  transaction_id: $json.transaction_id,
  budget:         $json.budget,

  // Google Data
  geo_location: {
    lat:               $json.lat,
    lng:               $json.lng,
    formatted_address: $json.formatted_address
  },
  static_map_url: $json.static_map_url,

  // House Data
  house_image_url: $json.house_image_url,
  house_source_type: $json.house_source_type, // LIBRARY_REUSE or GENERATED_NEW
  style_tag:         $json.style_tag,

  // Video Data
  b_roll_clips: [
    {
      clip_id:          $json.video_id,
      video_url:        $json.video_url,
      duration_seconds: 5.0,
      camera_motion:    $json.camera_motion
    }
  ],

  // Property Data (for Render)
  title:              $json.title,
  price_thb:          $json.price_thb,
  highlight_features: $json.highlight_features,
  raw_address:        $json.raw_address
};

return [{ json: mediaOut }];
```

---

## 5. WF-03: Render & Publish Workflow

### Node Map WF-03

```text
[1. Webhook Trigger]
     │
     ▼
[2. Generate TTS Script Node]
     │
     ▼
[3. Convert Price to Spoken Thai Node]
     │
     ▼
[4. Generate Voiceover Node]
     │
     ▼
[5. Generate Price Badge Text Node]
     │
     ▼
[6. Generate QR Code Node]
     │
     ▼
[7. Download All Assets Node]──► (Fail)──► [Retry x3 → Abort]
     │
     ▼
[8. FFmpeg Render Node]──► (OOM ERR_RND_02) ──► [Retry at 720p]
     │
     ▼
[9. Upload Final Video to S3 Node]──► (Fail) ──► [Retry x3 → Abort]
     │
     ▼
[10. Log Render Cost Node]│
     ▼
[11. Generate Captions — Parallel Branch]
  ┌──────────────┬──────────────┬──────────────┐▼              ▼              ▼              ▼
[11a.TikTok] [11b.YouTube] [11c.Facebook] [11d.Instagram]
  └──────────────┴──────────────┴──────────────┘
                │
                      ▼[12. Merge Captions Node]
                      │
                      ▼[13. Queue for Publishing Node]
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
    [14.TikTok] [15.YouTube] [16.Facebook]└───────────┼───────────┘
                      │
                      ▼[17. Collect Post IDs Node]
                      │
                      ▼
         [18. Save Publish Results Node]
                      │
                      ▼
        [19. Update Transaction Status Node]
                      │
                      ▼
            [20. Trigger WF-04 Node]
                      │
                      ▼
       [21. Send Completion Notification Node]
```

### Node Detail WF-03

#### Node 2 — Generate TTS Script

```javascript
// Function Node
const style = $json.style_tag;
const features = $json.highlight_features || [];

// เลือก Templateตาม Style
const isFormal = style === "LUXURY_CLASSIC";



---

```markdown
## 5. WF-03 Node Detail (ต่อจากที่ค้าง)

#### Node 2 — Generate TTS Script

```javascript
// Function Node
const style= $json.style_tag;
const features = ($json.highlight_features || []).filter(f => f && f.trim() !== "");
const isFormal = (style === "LUXURY_CLASSIC");

// แปลงราคาเป็นคำพูด
function priceToSpoken(thb) {
  if (!thb) return "ราคาพิเศษ";
  const millions = thb / 1000000;
  if (millions >= 1) {
    const rounded = Math.round(millions * 10) / 10;
    return `${rounded}ล้านบาท`;
  }
  return `${thb.toLocaleString("th-TH")}บาท`;
}

const price_spoken = priceToSpoken($json.price_thb);

let script = "";

if (isFormal) {
  // TPL_TTS_002_v1 — Formal Male Tone
  script = `ยินดีนำเสนอ ${$json.title}

อสังหาริมทรัพย์ระดับพรีเมียม ${$json.raw_address || ""}

${features[0] || ""}
${features[1] || ""}
${features[2] || ""}

มูลค่าการลงทุนเริ่มต้น ${price_spoken}

สำหรับท่านที่สนใจรายละเอียดเพิ่มเติม กรุณาติดต่อ ${$json.contact_method || ""}`.trim();
} else {
  // TPL_TTS_001_v1 — Standard Female Tone
  script = `${$json.title}

${features[0] || ""}
${features[1] || ""}
${features[2] || ""}

ราคาเพียง ${price_spoken} เท่านั้น

สนใจสอบถามข้อมูลเพิ่มเติมติดต่อได้ที่ ${$json.contact_method || ""}`.trim();
}

// ลบบรรทัดว่างซ้อน
script = script.replace(/\n{3,}/g, "\n\n");

return [{ json: { ...$json, tts_script: script, price_spoken } }];
```

---

#### Node 3 — Convert Price to Spoken Thai

```javascript
// Function Node
// (ใช้ผลลัพธ์จาก Node 2 ที่คำนวณ price_spoken ไปแล้ว)
// Node นี้ทำ Validation เพิ่มเติม

const spoken = $json.price_spoken;

if (!spoken || spoken.trim() === "") {
  return [{ json: { ...$json, price_spoken: "ราคาพิเศษ" } }];
}

// ตรวจสอบว่าไม่มีตัวเลขดิบหลุดผ่าน
const hasRawNumber = /\d{4,}/.test(spoken);
if (hasRawNumber) {
  // ยังมีตัวเลขดิบ แปลงใหม่
  const thb = $json.price_thb;
  const millions = thb / 1000000;
  const corrected = millions >= 1
    ? `${Math.round(millions * 10) / 10}ล้านบาท`
    : `${thb.toLocaleString("th-TH")}บาท`;
  return [{ json: { ...$json, price_spoken: corrected } }];
}

return[$input.first()];
```

---

#### Node 4 — Generate Voiceover

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "request_id": "={{ $uuid }}",
    "transaction_id": "={{ $json.transaction_id }}",
    "operation_type": "TEXT_TO_SPEECH",
    "preferred_provider": "FISH_AUDIO",
    "fallback_providers": ["ELEVENLABS_TURBO", "OPENAI_TTS"],
    "budget_limit_usd": 0.01,
    "payload": {
      "text": "={{ $json.tts_script }}",
      "voice_id": "thai_female_01",
      "speed": 0.95
    }
  },
  "timeout": 60000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 5 — Generate Price Badge Text

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "TEXT_COMPLETION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.001,
    "payload": {
      "prompt": "Convert this price to compact Thai display format (max 12 chars).\nRules: Use'X.X ล้าน' for millions. No prefix. Return string only.\nPrice in THB: {{ $json.price_thb }}",
      "max_tokens": 20
    }
  },
  "timeout": 10000
}
```

---

#### Node 6 — Generate QR Code

```json
{
  "type": "HTTP Request",
  "method": "GET",
  "url": "https://api.qrserver.com/v1/create-qr-code/",
  "queryParams": {
    "data": "={{ $json.contact_url }}",
    "size": "300x300",
    "color": "={{ $json.branding_color || '000000' }}",
    "bgcolor": "ffffff",
    "margin": "10",
    "format": "png"
  },
  "responseFormat": "file",
  "timeout": 10000
}
```

```javascript
// Function Node หลัง QR Code — Upload to S3
const qrBuffer= $binary.data;
const qrKey= `properties/${$json.property_id}/qr_code.png`;
const qrUrl     = await uploadToS3(qrBuffer, qrKey, "image/png");

return [{ json: { ...$json, qr_image_url: qrUrl } }];
```

---

#### Node 7 — Download & Verify All Assets

```javascript
// Function Node —ตรวจสอบว่า URLทุกตัวพร้อมใช้งาน
const requiredAssets = [
  { key: "video_url",url: $json.b_roll_clips?.[0]?.video_url },
  { key: "static_map_url", url: $json.static_map_url },
  { key: "voiceover_url",  url: $json.result?.audio_url },
  { key: "bg_music_url",   url: $env.DEFAULT_BG_MUSIC_URL }
];

const missing = requiredAssets.filter(a => !a.url || a.url.trim() === "");

if (missing.length > 0) {
  throw new Error(
    `ERR_RND_01: Missing assets: ${missing.map(a => a.key).join(", ")}`
  );
}

// Mapให้ง่ายต่อการใช้งานใน Node ถัดไป
return [{
  json: {
    ...$json,
    voiceover_url:  $json.result?.audio_url,
    bg_music_url:   $env.DEFAULT_BG_MUSIC_URL,
    price_badge:    $json.price_badge_text || $json.price_spoken,
    total_duration: 8.0// b-roll 5s + map 2s + outro 1s
  }
}];
```

---

#### Node 8 — FFmpeg Render

```javascript
// Execute Command Node
const cmd = `
ffmpeg \
  -i "${$json.b_roll_clips[0].video_url}" \
  -loop 1 -i "${$json.static_map_url}" \
  -i "${$json.voiceover_url}" \
  -i "${$json.bg_music_url}" \
  -filter_complex "
    [0:v]scale=1080:1920,setsar=1,fps=30[v0];
    [1:v]scale=1080:1920,setsar=1,fps=30[v1];
    [v0][v1]concat=n=2:v=1:a=0[v_concat];
    [v_concat]drawtext=
      fontfile=${$env.FONT_PATH_BOLD}:
      text='${$json.title.replace(/'/g,"\\'")}':
      fontcolor=white:fontsize=48:
      x=(w-text_w)/2:y=140:
      shadowcolor=black:shadowx=2:shadowy=2,drawtext=
      fontfile=${$env.FONT_PATH_MEDIUM}:
      text='${$json.price_badge}':
      fontcolor=#FFD700:fontsize=68:
      x=(w-text_w)/2:y=260:
      shadowcolor=black:shadowx=2:shadowy=2[v_text];
    [2:a][3:a]amix=inputs=2:duration=first:weights=1 0.3[a_mix]
  " \
  -map "[v_text]" \
  -map "[a_mix]" \
  -c:v libx264 -preset medium -crf 22 \
  -c:a aac -b:a 192k \
  -pix_fmt yuv420p \
  -t ${$json.total_duration} \
  -y /tmp/renders/${$json.property_id}_final.mp4
`.replace(/\n\s*/g, "").trim();

return [{ json: { ...$json, ffmpeg_command: cmd, output_path: `/tmp/renders/${$json.property_id}_final.mp4` } }];
```

```json
{
  "type": "Execute Command",
  "command": "={{ $json.ffmpeg_command }}",
  "onError": "continueErrorOutput"
}
```

```javascript
// Error Handler Node หลัง FFmpeg
// ถ้า FFmpeg ล้มเหลวด้วย OOM ให้ลดเป็น720p แล้วรันใหม่
const err = $json.error || "";
if (err.includes("Cannot allocate memory") || err.includes("out of memory")) {
  const cmd720 = $json.ffmpeg_command
    .replace("scale=1080:1920", "scale=720:1280")
    .replace("-crf 22", "-crf 24")
    .replace("_final.mp4", "_final_720p.mp4");

  return [{ json: { ...$json, ffmpeg_command: cmd720, is_fallback_resolution: true } }];
}
throw new Error(`ERR_RND_02: FFmpeg failed — ${err}`);
```

---

#### Node 9 — Upload Final Video to S3

```javascript
// Function Node
const localPath = $json.output_path;
const s3Key= `renders/${$json.property_id}/${$json.property_id}_final_9_16.mp4`;

// อัปโหลดด้วย AWS SDK
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

const client = new S3Client({ region: $env.S3_REGION });
const body= fs.readFileSync(localPath);

await client.send(new PutObjectCommand({
  Bucket:$env.S3_BUCKET,
  Key:         s3Key,
  Body:        body,
  ContentType: "video/mp4"
}));

// ลบไฟล์ temp หลังอัปโหลดเสร็จ
fs.unlinkSync(localPath);

const final_video_url = `${$env.CDN_BASE_URL}/${s3Key}`;

return [{ json: { ...$json, final_video_url } }];
```

---

#### Node 10 — Log Render Cost

```sql
-- PostgreSQL Node
INSERT INTO analytics_events
  (event_type, transaction_id, property_id, engine_name, provider_name, cost_usd, created_at)
VALUES
  ('COST_EVENT', $1, $2, 'RENDER_ENGINE', 'FFMPEG_LOCAL', $3, NOW())
-- cost_usd ประมาณ $0.002 สำหรับ Compute Time
```

---

#### Node 11a — Generate TikTok Caption

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "TEXT_COMPLETION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.002,
    "payload": {
      "prompt": "You are a Thai TikTok real estate copywriter.\nWrite a TikTok caption (150-300 chars, Thai, 6-8 hashtags).\nHook + location + selling point + CTA.\n\nTitle: {{ $json.title }}\nPrice: {{ $json.price_spoken }}\nLocation: {{ $json.raw_address }}\nFeatures: {{ $json.highlight_features.join(', ') }}\n\nReturn caption only.",
      "max_tokens": 300
    }
  }
}
```

---

#### Node 11b — Generate YouTube Caption

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "TEXT_COMPLETION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.001,
    "payload": {
      "prompt": "Write a YouTube Shorts description in Thai. Max 100 chars. Include location, price, CTA. Max 3 hashtags.\n\nTitle: {{ $json.title }}\nPrice: {{ $json.price_spoken }}\nLocation: {{ $json.raw_address }}\n\nReturn description only.",
      "max_tokens": 150
    }
  }
}
```

---

#### Node 11c — Generate Facebook Caption

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "TEXT_COMPLETION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.002,
    "payload": {
      "prompt": "Write a Facebook Reels caption in Thai (200-400 chars). Include title, location, price, 2-3 features, CTA,5-7 hashtags.\n\nTitle: {{ $json.title }}\nPrice: {{ $json.price_spoken }}\nLocation: {{ $json.raw_address }}\nFeatures: {{ $json.highlight_features.join(', ') }}\nContact: {{ $json.contact_method }}\n\nReturn caption only.",
      "max_tokens": 400
    }
  }
}
```

---

#### Node 11d — Generate Instagram Caption

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "TEXT_COMPLETION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.002,
    "payload": {
      "prompt": "Write an Instagram Reels caption (Thai/English mix, 150-250 chars, 10-15 hashtags, aspirational tone).\n\nTitle: {{ $json.title }}\nPrice: {{ $json.price_spoken }}\nLocation: {{ $json.raw_address }}\nStyle: {{ $json.style_tag }}\n\nReturn caption only.",
      "max_tokens": 300
    }
  }
}
```

---

#### Node 12 — Merge Captions

```javascript
// Merge Node (Wait for All4 Branches)
// n8n Merge Mode: "Combine All" / "Wait for All"

const items = $input.all();

const captions = {
  tiktok:items[0]?.json?.result?.text || "",
  youtube:   items[1]?.json?.result?.text || "",
  facebook:  items[2]?.json?.result?.text || "",
  instagram: items[3]?.json?.result?.text || ""
};

// Fallback หาก caption ว่าง
const defaultCaption = `${$json.title} | ${$json.price_spoken} | ${$json.raw_address}`;
Object.keys(captions).forEach(k => {
  if (!captions[k] || captions[k].trim() === "") {
    captions[k] = defaultCaption;
  }
});

return [{ json: { ...$json, captions } }];
```

---

#### Node 13 — Queue for Publishing

```javascript
// Function Node — Stagger publish times to avoid Rate Limits
const now = Date.now();

const queue = [
  {
    platform:"TIKTOK",
    caption:    $json.captions.tiktok,
    video_url:  $json.final_video_url,
    publish_at: now + (0* 60 * 1000)  // ทันที
  },
  {
    platform:   "YOUTUBE_SHORTS",
    caption:    $json.captions.youtube,
    video_url:  $json.final_video_url,
    publish_at: now + (2* 60 * 1000)  // หลัง 2 นาที
  },
  {
    platform:   "FACEBOOK_REELS",
    caption:    $json.captions.facebook,
    video_url:  $json.final_video_url,
    publish_at: now + (4  * 60 * 1000)  // หลัง 4 นาที
  },
  {
    platform:   "INSTAGRAM_REELS",
    caption:    $json.captions.instagram,
    video_url:  $json.final_video_url,
    publish_at: now + (6  * 60 * 1000)  // หลัง 6 นาที
  }
];

return queue.map(item => ({ json: { ...$json, ...item } }));
```

---

#### Node 14 — Publish to TikTok

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "https://open.tiktokapis.com/v2/post/publish/video/init/",
  "headers": {
    "Authorization": "Bearer ={{ $env.TIKTOK_ACCESS_TOKEN }}",
    "Content-Type": "application/json; charset=UTF-8"
  },
  "body": {
    "post_info": {
      "title": "={{ $json.captions.tiktok.substring(0, 150) }}",
      "privacy_level": "PUBLIC_TO_EVERYONE",
      "disable_duet": false,
      "disable_comment": false,
      "disable_stitch": false
    },
    "source_info": {
      "source": "PULL_FROM_URL",
      "video_url": "={{ $json.final_video_url }}"
    }
  },
  "timeout": 60000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 15 — Publish to YouTube Shorts

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
  "headers": {
    "Authorization": "Bearer ={{ $env.YOUTUBE_ACCESS_TOKEN }}",
    "Content-Type": "application/json"
  },
  "body": {
    "snippet": {
      "title": "={{ $json.title.substring(0, 100) }}",
      "description": "={{ $json.captions.youtube }}",
      "tags": ["อสังหาริมทรัพย์", "ขายบ้าน", "{{ $json.style_tag.toLowerCase() }}"],
      "categoryId": "22"
    },
    "status": {
      "privacyStatus": "public",
      "selfDeclaredMadeForKids": false
    }
  },
  "timeout": 120000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 16 — Publish to Facebook Reels

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "https://graph.facebook.com/v18.0/={{ $env.FACEBOOK_PAGE_ID }}/videos",
  "body": {
    "file_url":"={{ $json.final_video_url }}",
    "description": "={{ $json.captions.facebook }}",
    "published":   true,
    "access_token":"={{ $env.FACEBOOK_PAGE_ACCESS_TOKEN }}"
  },
  "timeout": 120000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 17 — Collect Post IDs

```javascript
// Function Node
const results = $input.all();

const published = results
  .filter(r => r.json.data?.video_id || r.json.id || r.json.share?.video_id)
  .map(r => {
    const platform = r.json.platform;
    let post_id    = "";
    let publish_url= "";

    if (platform === "TIKTOK") {
      post_id     = r.json.data?.publish_id || "";
      publish_url = `https://www.tiktok.com/@${$env.TIKTOK_USERNAME}/video/${post_id}`;
    } else if (platform === "YOUTUBE_SHORTS") {
      post_id     = r.json.id || "";
      publish_url = `https://youtube.com/shorts/${post_id}`;
    } else if (platform === "FACEBOOK_REELS") {
      post_id     = r.json.id || "";
      publish_url = `https://www.facebook.com/video/${post_id}`;
    }

    return { platform, post_id, publish_url, published_at: new Date().toISOString() };
  });

return [{ json: { ...$json, published_destinations: published } }];
```

---

#### Node 18 — Save Publish Results

```sql
-- PostgreSQL Node (รัน loop สำหรับแต่ละ platform)
INSERT INTO platform_performance
  (transaction_id, property_id, platform, post_id, publish_url, published_at)
VALUES
  ($1, $2, $3, $4, $5, $6)
ON CONFLICT (post_id) DO NOTHING
```

---

#### Node 19 — Update Transaction Status

```sql
-- PostgreSQL Node
UPDATE video_transactions
SET
  status       = 'COMPLETED',
  final_video_url = $2,
  updated_at   = NOW()
WHERE transaction_id = $1
```

---

#### Node 20 — Trigger WF-04

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.WF04_WEBHOOK_URL }}",
  "body": {
    "transaction_id":"={{ $json.transaction_id }}",
    "property_id":           "={{ $json.property_id }}",
    "published_destinations":"={{ JSON.stringify($json.published_destinations) }}"
  }
}
```

---

#### Node 21 — Send Completion Notification

```javascript
// Function Node — สร้าง Line Notify Message
const lines = $json.published_destinations || [];
const urls= lines.map(d => `${d.platform}: ${d.publish_url}`).join("\n");

const message = `
✅ วิดีโอเผยแพร่สำเร็จ!
📍 ${$json.title}
💰 ${$json.price_spoken}
🎬 ${lines.length} แพลตฟอร์ม

${urls}

💸ต้นทุนรวม: $${($json.accumulated_cost || 0).toFixed(4)} USD
`.trim();

return [{ json: { message } }];
```

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "https://notify-api.line.me/api/notify",
  "headers": {
    "Authorization": "Bearer ={{ $env.LINE_NOTIFY_TOKEN }}"
  },
  "body": {
    "message": "={{ $json.message }}"
  }
}
```

---

## 6. WF-04: Analytics & Cost Workflow

### Node Detail WF-04

#### Node 1 — Webhook Trigger

```json
{
  "type": "Webhook",
  "path": "analytics",
  "method": "POST"
}
```

---

#### Node 2 — Aggregate Transaction Cost

```sql
-- PostgreSQL Node
SELECT
  engine_name,
  provider_name,
  SUM(cost_usd)AS total_cost_usd,
  COUNT(*)       AS call_count,
  AVG(cost_usd)  AS avg_cost_usd
FROM analytics_events
WHERE transaction_id = $1AND event_type     = 'COST_EVENT'
GROUP BY engine_name, provider_name
ORDER BY total_cost_usd DESC
```

---

#### Node 3 — Calculate Total & Budget Status

```javascript
// Function Node
const rows= $json.rows || [];
const total        = rows.reduce((sum, r) => sum + parseFloat(r.total_cost_usd), 0);
const BUDGET_LIMIT = 0.30;

let cost_status = "UNDER_BUDGET";
if (total >= BUDGET_LIMIT)cost_status = "OVER_BUDGET";
else if (total >= BUDGET_LIMIT * 0.85)  cost_status = "NEAR_LIMIT";

const engine_breakdown= rows.map(r => ({ engine_name: r.engine_name,cost_usd: parseFloat(r.total_cost_usd) }));
const provider_breakdown = rows.map(r => ({ provider_name: r.provider_name, cost_usd: parseFloat(r.total_cost_usd) }));

return [{
  json: {
    ...$json,
    total_cost_usd: parseFloat(total.toFixed(6)),
    cost_status,
    engine_breakdown,
    provider_breakdown
  }
}];
```

---

#### Node 4 — Update Transaction Cost

```sql
-- PostgreSQL Node
UPDATE video_transactions
SET accumulated_cost_usd = $1
WHERE transaction_id     = $2
```

---

ต่อจากที่ค้างตรง Node 5 WF-04 เลยครับ

---

```markdown
#### Node 5 — Update Provider Scorecards (ต่อ)

```javascript
// Function Node
const rows = $json.rows || [];

const updates = rows.map(r => ({
  provider_name: r.provider_name,
  cost_usd:parseFloat(r.avg_cost_usd),
  call_count:    parseInt(r.call_count)
}));

//ส่งต่อเป็น Array เพื่อ loop ใน PostgreSQL Nodeถัดไป
return updates.map(u => ({ json: { ...$json, ...u } }));
```

```sql
-- PostgreSQL Node (รัน per item จาก SplitInBatches)
UPDATE provider_scorecards
SET
  average_cost_usd = ROUND(
    ((average_cost_usd * call_count + $1) / (call_count + $2))::numeric, 6
  ),
  updated_at = NOW()
WHERE provider_name = $3
```

---

#### Node 6 — Schedule Performance Collection

```javascript
// Function Node
const destinations = JSON.parse($json.published_destinations || "[]");

// บันทึกรายการที่ต้องเก็บ Metrics ลงตาราง pending
const pending = destinations.map(d => ({
  transaction_id: $json.transaction_id,
  property_id:    $json.property_id,
  platform:       d.platform,
  post_id:        d.post_id,
  collect_at_24h: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  collect_at_48h: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  collect_at_7d:  new Date(Date.now() + 7  * 24 * 60 * 60 * 1000).toISOString(),
  status:         "PENDING"
}));

return pending.map(p => ({ json: p }));
```

```sql
-- PostgreSQL Node
INSERT INTO pending_metric_collection
  (transaction_id, property_id, platform, post_id,
   collect_at_24h, collect_at_48h, collect_at_7d, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (post_id) DO NOTHING
```

---

#### Node 7 — Wait24 Hours

```json
{
  "type": "Wait",
  "unit": "hours",
  "amount": 24,
  "resumeWebhook": true
}
```

---

#### Node 8 — Collect TikTok Metrics

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "https://open.tiktokapis.com/v2/video/query/",
  "headers": {
    "Authorization": "Bearer ={{ $env.TIKTOK_ACCESS_TOKEN }}",
    "Content-Type": "application/json"
  },
  "body": {
    "filters": {
      "video_ids": ["={{ $json.tiktok_post_id }}"]
    },
    "fields": [
      "id", "view_count", "like_count",
      "comment_count", "share_count", "reach"
    ]
  },
  "timeout": 15000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 9 — Collect YouTube Metrics

```json
{
  "type": "HTTP Request",
  "method": "GET",
  "url": "https://www.googleapis.com/youtube/v3/videos",
  "queryParams": {
    "id":     "={{ $json.youtube_post_id }}",
    "part":   "statistics",
    "key":    "={{ $env.YOUTUBE_API_KEY }}"
  },
  "timeout": 15000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 10 — Collect Facebook Metrics

```json
{
  "type": "HTTP Request",
  "method": "GET",
  "url": "https://graph.facebook.com/v18.0/={{ $json.facebook_post_id }}",
  "queryParams": {
    "fields":"views,reactions.summary(true),comments.summary(true),shares",
    "access_token": "={{ $env.FACEBOOK_PAGE_ACCESS_TOKEN }}"
  },
  "timeout": 15000,
  "onError": "continueErrorOutput"
}
```

---

#### Node 11 — Calculate KPIs

```javascript
// Function Node
const tiktok= $json.tiktok_metrics|| {};
const youtube  = $json.youtube_metrics  || {};
const facebook = $json.facebook_metrics || {};

function calcEngagement(views, likes, comments, shares, saves = 0) {
  if (!views || views === 0) return 0;
  return parseFloat(((likes + comments + shares + saves) / views).toFixed(6));
}

function calcCostPerView(cost, views) {
  if (!views || views === 0) return 0;
  return parseFloat((cost / views).toFixed(8));
}

const total_cost = parseFloat($json.total_cost_usd || 0);

const kpis = {
  tiktok: {
    views:tiktok.view_count    || 0,
    likes:tiktok.like_count    || 0,
    comments:        tiktok.comment_count || 0,
    shares:          tiktok.share_count|| 0,
    engagement_rate: calcEngagement(
      tiktok.view_count,
      tiktok.like_count,
      tiktok.comment_count,
      tiktok.share_count
    ),
    cost_per_view: calcCostPerView(total_cost, tiktok.view_count)
  },
  youtube: {
    views:           parseInt(youtube.statistics?.viewCount    || 0),
    likes:           parseInt(youtube.statistics?.likeCount    || 0),
    comments:        parseInt(youtube.statistics?.commentCount || 0),
    shares:          0,
    engagement_rate: calcEngagement(
      parseInt(youtube.statistics?.viewCount    || 0),
      parseInt(youtube.statistics?.likeCount    || 0),
      parseInt(youtube.statistics?.commentCount || 0),
      0
    ),
    cost_per_view: calcCostPerView(
      total_cost,
      parseInt(youtube.statistics?.viewCount || 0)
    )
  },
  facebook: {
    views:           facebook.views|| 0,
    likes:           facebook.reactions?.summary?.total_count || 0,
    comments:        facebook.comments?.summary?.total_count  || 0,
    shares:          facebook.shares?.count|| 0,
    engagement_rate: calcEngagement(
      facebook.views,
      facebook.reactions?.summary?.total_count || 0,
      facebook.comments?.summary?.total_count  || 0,
      facebook.shares?.count || 0
    ),
    cost_per_view: calcCostPerView(total_cost, facebook.views)
  }
};

const total_views = kpis.tiktok.views + kpis.youtube.views + kpis.facebook.views;
const overall_cost_per_view = calcCostPerView(total_cost, total_views);

// หา Best Platform
const platforms = ["tiktok", "youtube", "facebook"];
const best_platform = platforms.reduce((best, p) =>
  kpis[p].engagement_rate > kpis[best].engagement_rate ? p : best
, "tiktok");

return [{
  json: {
    ...$json,
    kpis,
    total_views,
    overall_cost_per_view,
    best_platform
  }
}];
```

---

#### Node 12 — Save Performance Metrics

```sql
-- PostgreSQL Node (รัน per platform)
INSERT INTO platform_performance
  (transaction_id, property_id, platform, post_id,
   views, likes, comments, shares, saves,
   engagement_rate, cost_per_view, collected_at)
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
ON CONFLICT (post_id)
DO UPDATE SET
  views           = EXCLUDED.views,
  likes           = EXCLUDED.likes,
  comments        = EXCLUDED.comments,
  shares          = EXCLUDED.shares,
  engagement_rate = EXCLUDED.engagement_rate,
  cost_per_view   = EXCLUDED.cost_per_view,
  collected_at    = NOW()
```

---

#### Node 13 — Generate Insight Summary

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $env.PROVIDER_INTERFACE_URL }}/call",
  "body": {
    "operation_type": "TEXT_COMPLETION",
    "preferred_provider": "CLAUDE_HAIKU",
    "fallback_providers": ["GEMINI_FLASH"],
    "budget_limit_usd": 0.003,
    "payload": {
      "prompt": "You are a Thai real estate analytics specialist.\nWrite a concise Thai insight (max 200 chars) covering: best platform, engagement highlight, one actionable recommendation.\n\nTikTok views: {{ $json.kpis.tiktok.views }} |ER: {{ $json.kpis.tiktok.engagement_rate }}\nYouTube views: {{ $json.kpis.youtube.views }} | ER: {{ $json.kpis.youtube.engagement_rate }}\nFacebook views: {{ $json.kpis.facebook.views }} | ER: {{ $json.kpis.facebook.engagement_rate }}\nTotal cost: ${{ $json.total_cost_usd }} USD\nCost/view: ${{ $json.overall_cost_per_view }} USD\n\nReturn Thai text only.",
      "max_tokens": 250
    }
  }
}
```

---

#### Node 14 — Send Analytics Report

```javascript
// Function Node
const kpis = $json.kpis;
const best = $json.best_platform?.toUpperCase() || "TIKTOK";

const report = `
📊 รายงาน 24 ชั่วโมง
📍 ${$json.title}

👁ยอดวิวรวม: ${$json.total_views?.toLocaleString("th-TH") || 0}
🏆 แพลตฟอร์มดีสุด: ${best}
📈 Engagement: ${(($json.kpis[$json.best_platform]?.engagement_rate || 0) * 100).toFixed(2)}%
💸ต้นทุน/วิว: $${$json.overall_cost_per_view?.toFixed(6) || 0} USD

💡 ${$json.result?.text || "ไม่มีข้อมูลเพิ่มเติม"}
`.trim();

return [{ json: { report_message: report } }];
```

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "https://notify-api.line.me/api/notify",
  "headers": {
    "Authorization": "Bearer ={{ $env.LINE_NOTIFY_TOKEN }}"
  },
  "body": {
    "message": "={{ $json.report_message }}"
  }
}
```

---

## 7. WF-ERR-01: Transaction Recovery Workflow

### Purpose

ตรวจจับ Transactionที่ค้างอยู่นานเกิน2 ชั่วโมง แล้ว Resume จาก Last Known State

### Node Detail WF-ERR-01

#### Node 1 — Schedule Trigger (ทุก30 นาที)

```json
{
  "type": "Schedule Trigger",
  "rule": {
    "interval": [{ "field": "minutes", "minutesInterval": 30 }]
  }
}
```

---

#### Node 2 — Find Stalled Transactions

```sql
-- PostgreSQL Node
SELECT
  transaction_id,
  property_id,
  status,
  current_stage,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS stalled_minutes
FROM video_transactions
WHERE status = 'PROCESSING'
  AND updated_at < NOW() - INTERVAL '2 hours'
ORDER BY updated_at ASC
LIMIT 10
```

---

#### Node 3 — Check If Any Stalled

```javascript
// IF Node
{{ $json.rows && $json.rows.length > 0 }}
// true → มี Transactionค้าง → ดำเนินการ Resume
// false → ไม่มี → หยุด
```

---

#### Node 4 — Load Transaction State from Redis

```javascript
// Function Node
const rows = $json.rows || [];

const results = await Promise.all(rows.map(async (row) => {
  const cacheKey = `active_transaction:${row.transaction_id}`;
  const cached   = await $redis.get(cacheKey);
  const state    = cached ? JSON.parse(cached) : null;

  return {
    transaction_id: row.transaction_id,
    property_id:    row.property_id,
    current_stage:  row.current_stage,
    stalled_minutes:row.stalled_minutes,
    last_state:     state
  };
}));

return results.map(r => ({ json: r }));
```

---

#### Node 5 — Route to Resume Point

```javascript
// Switch Node
const stage = $json.current_stage;

// ตัดสินใจว่าจะ resume ที่ Workflow ไหน
const STAGE_TO_WEBHOOK = {
  "PROPERTY_ENGINE":  $env.WF01_WEBHOOK_URL,
  "GOOGLE_ENGINE":    $env.WF02_WEBHOOK_URL,
  "ASSET_ENGINE":     $env.WF02_WEBHOOK_URL,
  "HOUSE_ENGINE":     $env.WF02_WEBHOOK_URL,
  "VIDEO_ENGINE":     $env.WF02_WEBHOOK_URL,
  "RENDER_ENGINE":    $env.WF03_WEBHOOK_URL,
  "PUBLISH_ENGINE":   $env.WF03_WEBHOOK_URL,
  "ANALYTICS_ENGINE": $env.WF04_WEBHOOK_URL
};

const resume_url = STAGE_TO_WEBHOOK[stage] || $env.WF02_WEBHOOK_URL;

return [{ json: { ...$json, resume_url } }];
```

---

#### Node 6 — Mark as Retrying

```sql
-- PostgreSQL Node
UPDATE video_transactions
SET
  status     = 'RETRYING',
  retry_count= retry_count + 1,
  updated_at = NOW()
WHERE transaction_id = $1
```

---

#### Node 7 — Trigger Resume Webhook

```json
{
  "type": "HTTP Request",
  "method": "POST",
  "url": "={{ $json.resume_url }}",
  "body": {
    "property_id":"={{ $json.property_id }}",
    "transaction_id": "={{ $json.transaction_id }}",
    "is_recovery":    true,
    "last_state":     "={{ JSON.stringify($json.last_state) }}"
  }
}
```

---

#### Node 8 — Log Recovery Event

```sql
-- PostgreSQL Node
INSERT INTO analytics_events
  (event_type, transaction_id, property_id, engine_name, provider_name, created_at)
VALUES
  ('ERROR_EVENT', $1, $2, 'RECOVERY_WORKFLOW', 'SYSTEM', NOW())
```

---

#### Node 9 — Notify Admin

```javascript
// Function Node
const message = `
⚠️ Transaction Recovery
TX: ${$json.transaction_id}
Property: ${$json.property_id}
ค้างที่: ${$json.current_stage}
นาน: ${Math.round($json.stalled_minutes)} นาที
Action: กำลัง Resume จาก ${$json.resume_url}
`.trim();

return [{ json: { message } }];
```

---

## 8. Environment Variables Reference

```bash
# ============================================
# Provider Interface
# ============================================
PROVIDER_INTERFACE_URL=http://localhost:3001
INTERNAL_API_KEY=your_internal_key_here

# ============================================
# Workflow Webhook URLs
# ============================================
WF01_WEBHOOK_URL=http://n8n:5678/webhook/property-intake
WF02_WEBHOOK_URL=http://n8n:5678/webhook/media-production
WF03_WEBHOOK_URL=http://n8n:5678/webhook/render-publish
WF04_WEBHOOK_URL=http://n8n:5678/webhook/analytics

# ============================================
# Database
# ============================================
DATABASE_URL=postgresql://mmgs_user:password@localhost:5432/mmgs_db
REDIS_URL=redis://localhost:6379

# ============================================
# Cloud Storage
# ============================================
S3_BUCKET=mmgs-renders
S3_REGION=ap-southeast-1
S3_ACCESS_KEY_ID=your_aws_access_key
S3_SECRET_ACCESS_KEY=your_aws_secret_key
CDN_BASE_URL=https://cdn.mmgs.io

# ============================================
# Google APIs
# ============================================
GOOGLE_MAPS_API_KEY=AIzaSy...
GOOGLE_CLOUD_VISION_API_KEY=AIzaSy...
YOUTUBE_API_KEY=AIzaSy...
YOUTUBE_CLIENT_ID=xxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-...
YOUTUBE_ACCESS_TOKEN=ya29....

# ============================================
# Social Media APIs
# ============================================
TIKTOK_CLIENT_KEY=awxxxxxx
TIKTOK_CLIENT_SECRET=xxxxxxxxxx
TIKTOK_ACCESS_TOKEN=act.xxxxxxxxxx
TIKTOK_USERNAME=your_tiktok_handle

FACEBOOK_PAGE_ID=123456789
FACEBOOK_PAGE_ACCESS_TOKEN=EAAxxxxxxx

# ============================================
# Notification
# ============================================
LINE_NOTIFY_TOKEN=xxxxxxxxxxxxxxx

# ============================================
# Audio/Music
# ============================================
DEFAULT_BG_MUSIC_URL=https://cdn.mmgs.io/music/default_jazz_loop.mp3

# ============================================
# Font Paths for FFmpeg
# ============================================
FONT_PATH_BOLD=/app/fonts/Kanit-Bold.ttf
FONT_PATH_MEDIUM=/app/fonts/Kanit-Medium.ttf
FONT_PATH_LIGHT=/app/fonts/Kanit-Light.ttf
```

---

## 9. n8n Node Configuration Standards

### Standard HTTP Request to Provider Interface

```json
{
  "authentication": "headerAuth",
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      },
      {
        "name": "X-Internal-Key",
        "value": "={{ $env.INTERNAL_API_KEY }}"
      }
    ]
  },
  "timeout": 200000,
  "onError": "continueErrorOutput",
  "options": {
    "redirect": { "redirect": { "followRedirects": true } },
    "response": { "response": { "fullResponse": false } }
  }
}
```

---

### Standard Error Handler Pattern

```javascript
// หลังทุก HTTP Request Nodeที่สำคัญ
// ใช้ IF Node ตรวจสอบ error output

// IF Condition:
{{ $json.error !== undefined }}

// Error Path → Log Error Node → Notify Node → Stop/Fallback
// Success Path → ดำเนินการต่อ
```

---

### Standard Cost Log Pattern

```javascript
// Function Node ที่ต้องรันหลังทุก Provider Call
const event = {
  event_type:"COST_EVENT",
  transaction_id:  $json.transaction_id,
  property_id:     $json.property_id,
  engine_name:     "ENGINE_NAME_HERE",    // แก้ตาม Engine
  provider_name:   $json.provider_used || "UNKNOWN",
  cost_usd:        $json.cost_usd        || 0,
  duration_ms:     $json.duration_ms|| 0,
  status:          $json.status          || "SUCCESS",
  created_at:      new Date().toISOString()
};

return [{ json: event }];
// ส่งต่อไป PostgreSQL INSERT Node
```

---

### Standard Retry Pattern

```javascript
// สำหรับ Node ที่ต้อง Retry อัตโนมัติ (เช่น Upload, Publish)
const MAX_RETRIES = 3;
const retryCount= $json._retry_count || 0;

if ($json.error && retryCount < MAX_RETRIES) {
  // รอก่อน retry (Exponential backoff)
  await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 1000));

  return [{
    json: {
      ...$json,
      _retry_count: retryCount + 1,
      _should_retry: true
    }
  }];
}

if ($json.error && retryCount >= MAX_RETRIES) {
  throw new Error(`MAX_RETRIES_EXCEEDED: ${$json.error}`);
}

return [$input.first()];
```

---

## 10. Claude Rules for n8n Implementation

1. **ห้ามวาง API Keyใน n8n Node โดยตรง**ต้องใช้ `={{ $env.VARIABLE_NAME }}` เสมอ
2. **ทุก HTTP Request Node ต้องตั้ง `onError: continueErrorOutput`** เพื่อรองรับ Error Branch
3. **ทุก Node ที่เรียก Providerต้องมี Cost Log Nodeตามหลังเสมอ** ห้ามข้ามขั้นตอนนี้
4. **ห้ามรวม WF-01ถึง WF-04 ไว้ใน Workflow เดียวกัน** ให้รันแยกกันและสื่อสารผ่าน Webhook
5. **ห้ามใช้ Wait Node นานเกิน 7 วันใน Single Workflow** เพราะ n8n มี Memory Limit
6. **ต้องทดสอบด้วย Manual Trigger** ก่อน Activate Webhook ทุกครั้ง
7. **ห้ามเขียน Prompt ลงใน n8n Function Node โดยตรง** ต้องดึงจาก Prompt Library เสมอ
8. **ทุก PostgreSQL Node ต้องใช้ Parameterized Query** ห้ามสร้าง Query ด้วย String Concatenation
9. **ต้องลบไฟล์ `/tmp/renders/` ทุกครั้งหลัง Upload เสร็จ** เพื่อป้องกัน Disk Full
10. **WF-ERR-01 ต้อง Activeตลอดเวลา** ห้าม Deactivate โดยไม่มีระบบ Recovery อื่นทดแทน

---

## 11. Migration Guide

### Phase 1 — Setup Infrastructure (Week 1)

```text
1. ติดตั้ง n8n (Self-hosted Docker หรือ n8n Cloud)
2. ติดตั้ง PostgreSQL และสร้าง Schemaตาม 05_DATABASE.md
3. ติดตั้ง Redis สำหรับ Session Cache
4. ตั้งค่า Environment Variables ทั้งหมด
5.ติดตั้ง FFmpeg บน Server พร้อม Kanit Font
6. Deploy Provider Interface Service
```

---

### Phase 2 — Build & Test WF-01 (Week 1-2)

```text
1. สร้าง WF-01 ใน n8n ตาม Node Map
2. ทดสอบด้วย Manual Trigger กับข้อมูลตัวอย่าง 5 รายการ
3. ตรวจสอบว่า property_id ถูก generate ถูกต้อง
4. ตรวจสอบว่า Cost Event ถูก log ลง DB
5. ตรวจสอบว่า Duplicate Check ทำงาน
6. Activate Webhook
```

---

### Phase 3 — Build & Test WF-02 (Week 2-3)

```text
1. สร้าง WF-02 ใน n8n ตาม Node Map
2. ทดสอบ Google Cache Miss และ Cache Hit แยกกัน
3. ทดสอบ House Library Reuse Path
4. ทดสอบ Video Generation Fallback โดย mock MINIMAXให้ return 500
5. ตรวจสอบว่าไม่มีราคา/เบอร์โทรใน Image/Video Prompt
6. Activate Webhook
```

---

### Phase 4 — Build & Test WF-03 (Week 3-4)

```text
1. สร้าง WF-03 ใน n8n ตาม Node Map
2. ทดสอบ FFmpeg Render ด้วย Sample Assets
3. ทดสอบ OOM Fallback โดยจำกัด Memory
4. ทดสอบ Caption Generationทุก Platform
5. ทดสอบ Publish API ด้วย Test Accountก่อน
6. Activate Webhook
```

---

### Phase 5 — Build & Test WF-04 + WF-ERR-01 (Week 4)

```text
1. สร้าง WF-04 และ WF-ERR-01
2. ทดสอบ Metrics Collection จาก Social Media APIs
3. ทดสอบ Recovery โดยหยุด Transaction กลางคัน
4. ตั้งค่า Monitoring Dashboard
5. Go Live ด้วย Property แรก
```

---

### Phase 6 — Post-Launch Optimization (Week 5+)

```text
1. Monitor Analytics Dashboardทุกวัน
2. ปรับ Provider Scorecard ตามข้อมูลจริง
3. ขยาย House Library ให้ครบทุก Style
4. เพิ่ม Video Library Cache จาก Production Run
5. ปรับ Budget Allocation ตามต้นทุนจริง
```
```

---

ไฟล์ `18_N8N_IMPLEMENTATION.md` จบสมบูรณ์แล้วครับ

สรุปโครงสร้างทั้งหมด:
- **WF-01** Property Intake —11Nodes✅
- **WF-02** Media Production — 23 Nodes ✅
- **WF-03** Render & Publish — 21 Nodes ✅
- **WF-04** Analytics & Cost — 14 Nodes ✅
- **WF-ERR-01** Recovery — 9 Nodes ✅

