นี่คือไฟล์ **`17_PROMPT_LIBRARY.md`** คลัง Prompt Templates ทั้งหมดของระบบ แยกตาม Engine, Operation Type และ Provider อย่างสมบูรณ์ครับ

---

#📂 File: `AI_BIBLE/17_PROMPT_LIBRARY.md`

```markdown
# 17. Prompt Library Specification

## 1. Purpose

Prompt Library คือคลังเก็บ Prompt Templates ทั้งหมดของระบบ MMGS

หลักการสำคัญ:

```text
Prompt ไม่ได้เขียนไว้ใน Code
Prompt ไม่ได้เขียนไว้ใน n8n Node
Prompt อยู่ที่นี่ที่เดียว
```

ทุก Engineที่ต้องการ Prompt ต้องดึงจาก Library นี้โดยอ้างอิง `template_id` เสมอ ห้ามเขียน Prompt ลงใน Logicของ Engine โดยตรง

---

## 2. Architecture

```text
[Engine ต้องการ Prompt]│
          ▼
promptLibrary.get("TPL_HOUSE_002_v1")
          │
          ▼
[Prompt Library คืน template + variable schema]
          │
          ▼
[Engine แทนค่า Variables]
          │
          ▼
[ส่งผ่าน sanitizeMediaPrompt() ก่อน]
          │
          ▼
[ส่งไปยัง Provider Interface]
```

---

## 3. Template Naming Convention

```text
TPL_{ENGINE_CODE}_{SEQUENCE}_{VERSION}

ENGINE CODES:
PROP= Property Engine
HOUSE = House Engine
VID   = Video Engine
CAP   = Caption Generation (Publish Engine)
TTS   = Text-to-Speech (Render Engine)
OVER  = Overlay Engine
ANA   = Analytics Engine
```

ตัวอย่าง:

```text
TPL_PROP_001_v1  = Property Engine, Template001, Version 1
TPL_HOUSE_002_v1 = House Engine, Template 002, Version 1
TPL_VID_003_v2= Video Engine, Template 003, Version 2
```

---

## 4. Global Prompt Rules (บังคับทุก Image/Video Template)

###4.1 Negative Keywords — ต้องมีในทุก Image/Video Prompt

```text
no text
no watermark
no logo
no price tag
no phone number
no signage
no subtitle
no caption overlay
no brand name
no UI elements
no writing
no numbers
```

### 4.2 Quality Keywords — แนะนำให้ใส่ใน Image Prompt

```text
photorealistic
cinematic lighting
8K resolution
architectural photography
sharp focus
professional composition
ultra detailed
RAW photo
```

### 4.3 Safety Keywords — ต้องมีในทุก Image/Video Prompt

```text
no people
no vehicles
no animals
no construction workers
```

---

## 5. Property Engine Templates

---

### TPL_PROP_001_v1 — Entity Extraction from Raw Text

```
Engine:Property Engine
Provider:  Claude Haiku
Operation: ENTITY_EXTRACTION
Est. Cost: $0.001– $0.003per call
```

**Template:**

```text
You are a Thai real estate data extraction specialist.

Extract structured information from the following property listing text.
Return ONLY a valid JSON object. Do not add any explanation or commentary outside the JSON.

Required fields to extract:
- title: Clean property title. Remove all promotional language ("ด่วน", "ถูกมาก", "!!!"), phone numbers, and Line IDs.
- price_thb: Price as integer only. No commas. No currency symbols.
  Convert: "5ล้าน" → 5000000| "5.5M" → 5500000 | "12.9ล้านบาท" → 12900000
  If the text mentions multiple prices for the same listing (a range, a per-rai price plus
  a total price, land price plus house price, etc.) so no single price is clearly "the"
  price, use the LOWEST price mentioned as price_thb, and prepend "เริ่มต้น {lowest price
  formatted with comma thousand-separators} บาท " to the title (before the cleaned title
  text). Example: prices 3900000 and 4500000 both appear → price_thb: 3900000, title
  starts with "เริ่มต้น 3,900,000 บาท ...".
- style_tag: Must be EXACTLY one of: MODERN_NORDIC | MINIMALIST | LUXURY_CLASSIC | CONTEMPORARY | LOFT
- raw_address: The address exactly as written in the listing. Do not geocode or infer.
- highlight_features: Array of 3-5 key selling features.Rules for highlight_features:
  - No pricing information
  - No contact information
  - No promotional language
  - Keep factual and descriptive only

Critical rules:
- If no price is mentioned anywhere in the text → set price_thb to null
- If multiple prices are mentioned, use the lowest one for price_thb and prefix the title
  with "เริ่มต้น {price} บาท " as described above
- If style cannot be determined → set style_tag to "CONTEMPORARY"
- If address is missing → set raw_address to null
- Do NOT invent data that is not present in the input text
- Do NOT include phone numbers or Line IDs anywhere in the output

Input text:
{{raw_input_text}}

Return valid JSON only. No markdown. No code block. No explanation.
```

**Variable Schema:**
```json
{
  "raw_input_text": {
    "type": "string",
    "required": true,
    "maxLength": 2000,
    "description": "ข้อความโฆษณาอสังหาริมทรัพย์ดิบ"
  }
}
```

**Expected Output Example:**
```json
{
  "title": "บ้านเดี่ยว2ชั้น สไตล์โมเดิร์นลอฟท์ พระราม 9",
  "price_thb": 12900000,
  "style_tag": "LOFT",
  "raw_address": "พระราม 9 กรุงเทพมหานคร",
  "highlight_features": [
    "บ้านเดี่ยว 2 ชั้น",
    "พื้นที่ 80 ตารางวา",
    "ทำเลย่านพระราม 9",
    "สไตล์อุตสาหกรรมโมเดิร์น"
  ]
}
```

---

### TPL_PROP_002_v1 — Style Classification Only

```
Engine:    Property Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.0005 per call
```

**Template:**

```text
You are an architectural style classifier for Thai real estate.

Given the property description below, classify it into EXACTLY ONE of these styles:

MODERN_NORDIC
- Scandinavian influence
- Light wood, white tones
- Minimalist with warmth
- Clean lines, natural materials

MINIMALIST
- Pure clean lines
- Neutral or monochrome tones
- No decoration whatsoever
- Form follows function strictly

LUXURY_CLASSIC
- Traditional grandeur
- Columns, ornamental details
- Marble, gold accents
- Symmetrical facade

CONTEMPORARY
- Current trends, mixed materials
- Open plan, flexible spaces
- Neither too modern nor too classic

LOFT
- Industrial elements
- Exposed concrete or steel
- Large warehouse-style windows
- Raw, urban aesthetic

Return ONLY the style tag as a single word. No explanation. No punctuation.

Property description:
{{property_description}}
```

**Variable Schema:**
```json
{
  "property_description": {
    "type": "string",
    "required": true,
    "maxLength": 500,
    "description": "คำอธิบายอสังหาริมทรัพย์สำหรับจำแนกสไตล์"
  }
}
```

---

### TPL_PROP_003_v1 — Highlight Feature Generator

```
Engine:    Property Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.001 per call
```

**Template:**

```text
You are a Thai real estate copywriter specializing in property feature extraction.

From the property details below, generate exactly 5 concise highlight features.

Rules:
- Each feature must be 5-15 words maximum
- Write in Thai language
- Factual only, no exaggeration
- No pricing information
- No contact information
- Focus on: location advantage, size, architectural style, amenities, surroundings

Property details:
Title: {{title}}
Address: {{address}}
Style: {{style_tag}}
Raw description: {{raw_description}}

Return a JSON array of exactly 5 strings. No explanation.
```

**Variable Schema:**
```json
{
  "title": { "type": "string", "required": true },
  "address": { "type": "string", "required": true },
  "style_tag": { "type": "string", "required": true },
  "raw_description": { "type": "string", "required": false, "default": "" }
}
```

---

## 6. House Engine Templates

---

### TPL_HOUSE_001_v1 — General Exterior (Flexible)

```
Engine:    House Engine
Provider:  Flux1Dev / Midjourney V7
Operation: IMAGE_GENERATION
Est. Cost: $0.025 – $0.050 per image
```

**Template:**

```text
Photorealistic exterior photograph of a {{style_description}} house.
{{additional_features}}.
Architectural photography style, sharp focus, natural {{lighting_condition}} lighting,
beautiful landscaping, professional real estate photography.
Ultra detailed, 8K resolution, cinematic composition.
No people, no cars, no text, no watermark, no logo, no signage, no numbers.
```

**Variable Schema:**
```json
{
  "style_description": {
    "type": "string",
    "required": true,
    "example": "2-story modern nordic single family",
    "description": "คำอธิบายสไตล์บ้าน ห้ามใส่ราคาหรือข้อมูลติดต่อ"
  },
  "additional_features": {
    "type": "string",
    "required": false,
    "default": "surrounded by mature trees, well-maintained garden",
    "description": "คุณลักษณะเพิ่มเติม เช่น large glass windows, wooden deck"
  },
  "lighting_condition": {
    "type": "string",
    "required": false,
    "default": "golden hour",
    "enum": ["golden hour", "morning", "overcast", "dramatic sunset", "blue hour"]
  }
}
```

---

### TPL_HOUSE_002_v1 — Modern Nordic Style

```
Engine:    House Engine
Provider:  Flux 1 Dev
Operation: IMAGE_GENERATION
Est. Cost: $0.025 per image
Style Tag: MODERN_NORDIC
```

**Template (Static — no variables):**

```text
Photorealistic exterior of a modern Nordic2-story single family house.
Light grey cement render facade with natural pine wood cladding accents.
Floor-to-ceiling glass windows, minimalist flat roof with subtle overhang.
Gravel garden pathway lined with ornamental grasses.
Surrounded by tall pine trees and silver birch, overcast Nordic sky.
Soft diffused daylight casting gentle shadows on the facade.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.
```

---

### TPL_HOUSE_003_v1 — Loft Style

```
Engine:    House Engine
Provider:  Flux 1 Dev
Operation: IMAGE_GENERATION
Est. Cost: $0.025 per image
Style Tag: LOFT
```

**Template (Static — no variables):**

```text
Photorealistic exterior of a modern industrial loft style house.
Exposed dark raw concrete walls, weathered Corten steel beam accents.
Massive warehouse-style steel frame windows with black mullions.
Flat metal roof with rooftop terrace visible, raw brick accent wall on one side.
Urban setting, golden hour sunlight casting long dramatic shadows.
High contrast between industrial materials and warm sunset sky.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.
```

---

### TPL_HOUSE_004_v1 — Luxury Classic Style

```
Engine:    House Engine
Provider:  Midjourney V7 / Flux 1 Dev
Operation: IMAGE_GENERATION
Est. Cost: $0.025 – $0.050 per image
Style Tag: LUXURY_CLASSIC
```

**Template (Static — no variables):**

```text
Photorealistic exterior of a grand luxury classic mansion.
Symmetrical white facade with tall Corinthian columns at entrance portico.
Ornate cornices, decorative pediment, and detailed stone moldings throughout.
Manicured French-style topiary garden with boxwood hedges.
Circular driveway with pale stone pavers and central fountain.
Warm amber evening lighting illuminating the facade dramatically.
Elegant, prestigious, timeless architecture.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.
```

---

### TPL_HOUSE_005_v1 — Contemporary Style (Flexible)

```
Engine:    House Engine
Provider:  Flux 1 Dev
Operation: IMAGE_GENERATION
Est. Cost: $0.025 per image
Style Tag: CONTEMPORARY
```

**Template:**

```text
Photorealistic exterior of a contemporary {{floors}}-story house.
Mixed materials facade: white cement render panels, natural teak wood cladding,
and dark anodized aluminum window frames.
Open plan design with cantilevered upper floor extending over lower terrace.
{{pool_feature}}.
{{view_context}}.
Warm golden hour lighting, lush tropical landscaping in foreground.
Sharp focus, professional real estate photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.
```

**Variable Schema:**
```json
{
  "floors": {
    "type": "string",
    "required": false,
    "default": "2",
    "enum": ["1", "2", "3"]
  },
  "pool_feature": {
    "type": "string",
    "required": false,
    "default": "Infinity edge swimming pool visible at lower terrace level",
    "description": "ลักษณะสระว่ายน้ำถ้ามี"
  },
  "view_context": {
    "type": "string",
    "required": false,
    "default": "Surrounded by mature tropical trees and manicured lawn",
    "description": "บริบทรอบๆ เช่น mountain view in background, rice fields surrounding"
  }
}
```

---

### TPL_HOUSE_006_v1 — Minimalist Style

```
Engine:    House Engine
Provider:  Flux 1 Dev
Operation: IMAGE_GENERATION
Est. Cost: $0.025 per image
Style Tag: MINIMALIST
```

**Template (Static — no variables):**

```text
Photorealistic exterior of a pure minimalist house.
Stark matte white render cubic form, absolutely no ornamentation or decoration.
Ultra flat roof, no visible gutters, flush window frames.
Single narrow horizontal slit window band running the full width.
Dark grey fine gravel courtyard, single sculptural mature olive tree as sole landscaping.
Overcast diffused lighting creating subtle shadow play on smooth surfaces.
Tadao Ando and John Pawson inspired architecture.
Sharp focus, professional architectural photography, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no numbers.
```

---

### TPL_HOUSE_007_v1 — Land Plot Only (No Structure)

```
Engine:    House Engine
Provider:  Flux 1 Dev
Operation: IMAGE_GENERATION
Est. Cost: $0.025 per image
Use Case:ที่ดินเปล่าที่ไม่มีตัวบ้าน
```

**Template:**

```text
Photorealistic aerial view of a {{land_size}} vacant land plot.
{{terrain_description}}.
{{surroundings}}.
Clear boundaries visible, {{access_description}}.
Beautiful natural lighting, lush green vegetation surroundings.
Drone photography perspective, professional real estate aerial photo.
Sharp focus, 8K resolution.
No text, no watermark, no people, no vehicles, no logos, no markers, no numbers.
```

**Variable Schema:**
```json
{
  "land_size": {
    "type": "string",
    "required": false,
    "default": "medium-sized rectangular",
    "description": "ขนาดที่ดินโดยประมาณ เช่น small square, large rectangular"
  },
  "terrain_description": {
    "type": "string",
    "required": false,
    "default": "Flat level ground with short grass, red laterite soil visible",
    "description": "ลักษณะภูมิประเทศ เช่น hilly terrain, flat fertile soil"
  },
  "surroundings": {
    "type": "string",
    "required": false,
    "default": "Surrounded by mature trees on three sides with open road frontage",
    "description": "สิ่งแวดล้อมรอบๆ"
  },
  "access_description": {
    "type": "string",
    "required": false,
    "default": "concrete access road along one edge",
    "description": "ทางเข้าที่ดิน"
  }
}
```

---

## 7. Video Engine Templates

> **หมายเหตุ:** Video Engine ใช้ Image-to-Video เป็นหลัก ดังนั้น Template ใน Section นี้คือ Motion Description สั้นๆ ที่ส่งเป็น `prompt` ประกอบภาพนิ่ง ไม่ใช่ Text-to-Video แบบยาว

---

### TPL_VID_001_v1 — Drone Rising Reveal

```
Engine:    Video Engine
Provider:  Kling V2 / Luma Dream / Runway Gen3
Operation: IMAGE_TO_VIDEO
Camera:    DRONE_REVEAL
Est. Cost: $0.080 – $0.260 per clip
```

**Template (Static):**

```text
Slow cinematic drone rising reveal shot.
Camera starts very low near ground level, slowly ascends vertically
while simultaneously tilting upward to reveal the full property and its surroundings.
Ultra smooth motion, absolutely no camera shake.
Warm golden hour natural lighting throughout the shot.
Cinematic wide angle, photorealistic, continuous fluid motion.
No text, no overlays, no watermark, no subtitles.
```

---

### TPL_VID_002_v1 — Slow Pan Right

```
Engine:    Video Engine
Provider:  Kling V2 / Luma Dream
Operation: IMAGE_TO_VIDEO
Camera:    PAN_RIGHT
Est. Cost: $0.080 – $0.160 per clip
```

**Template (Static):**

```text
Ultra smooth slow cinematic pan from left to right across the property facade.
Steady horizontal camera movement at consistent controlled speed.
Natural parallax depth effect creates dimensional feeling on foreground elements.
Wide establishing shot framing, slight shallow depth of field on distant background.
No camera shake, perfectly smooth motion throughout entire duration.
Photorealistic quality, no text, no watermark, no overlays.
```

---

### TPL_VID_003_v1 — Push In Zoom (Entrance Focus)

```
Engine:    Video Engine
Provider:  Kling V2 / Higgsfield
Operation: IMAGE_TO_VIDEO
Camera:    ZOOM_IN
Est. Cost: $0.160 – $0.180 per clip
```

**Template (Static):**

```text
Slow cinematic push-in dolly zoom toward the main entrance of the property.
Camera moves smoothly forward as if approaching the front door on a dolly track.
Gentle shallow depth of field with soft bokeh on foreground foliage.
Inviting warm lighting draws the eye toward the entrance focal point.
Smooth continuous forward motion, no shake, no jump cuts.
Photorealistic, no text, no logos, no overlays, no watermark.
```

---

### TPL_VID_004_v1 — Tilt Up Reveal

```
Engine:    Video Engine
Provider:  Kling V2 / Runway Gen3
Operation: IMAGE_TO_VIDEO
Camera:    TILT_UP
Est. Cost: $0.160 – $0.260 per clip
```

**Template (Static):**

```text
Cinematic tilt-up camera movement starting from the base of the building.
Camera begins at ground level pointed slightly downward, then tilts smoothly upward
to reveal the full height of the structure against the open sky.
Dramatic upward perspective emphasizing architectural scale and height.
Smooth controlled tilt motion, no shake, consistent speed throughout.
Photorealistic architectural photography motion, no text, no overlays, no watermark.
```

---

### TPL_VID_005_v1 — Orbital Arc Around Property

```
Engine:    Video Engine
Provider:  Higgsfield / Runway Gen3
Operation: IMAGE_TO_VIDEO
Camera:    ORBIT
Est. Cost: $0.180 – $0.260 per clip
```

**Template (Static):**

```text
Smooth cinematic orbital camera movement arcing around the property.
Camera maintains constant distance from subject while rotating from
front-left position through front to front-right position.
Wide angle lens, maintaining mid-height camera elevation throughout.
Continuous smooth arc motion, no shake, no interruption.
Golden hour warm lighting, lush surrounding landscaping in frame.
Photorealistic quality, no text, no watermark, no logos.
```

---

### TPL_VID_006_v1 — Aerial Map Fly-in

```
Engine:    Video Engine
Provider:  Luma Dream / Kling V2
Operation: IMAGE_TO_VIDEO
Camera:    DRONE_REVEAL
Use Case:  สำหรับภาพแผนที่ดาวเทียม (Google Maps Static) ให้ดูมีชีวิต
Est. Cost: $0.080 – $0.160 per clip
```

**Template (Static):**

```text
Cinematic satellite map aerial zoom-in animation.
Camera starts from high altitude overview of the area,
smoothly descends and zooms in toward a specific location in the center.
Natural smooth aerial descent motion, no sudden jumps.
The landscape becomes progressively more detailed as camera descends.
Realistic aerial photography movement, continuous fluid motion.
No text, no pins, no overlays, no watermark, no map labels.
```

---

### TPL_VID_007_v1 — Cosmic Descent to Plot

```
Engine:    Video Engine
Provider:  Kling V2
Operation: IMAGE_TO_VIDEO
Camera:    DRONE_REVEAL
Use Case:  Shot 1 -- นอกโลก ไล่ลงมาจนถึงพื้นที่
Est. Cost: $0.160 per clip
```
*(Static — no variables)*

**Template (Static):**

```text
Cinematic descent from outer space down to Earth.
Camera begins in orbit with the curvature of the planet and blackness of space visible,
then plunges continuously downward through thin cloud layers,
the terrain below growing steadily larger and sharper,
finally settling into a low aerial view centred on the property.
One single unbroken accelerating-then-easing move, no cuts, no shake.
Photorealistic satellite-to-drone footage, natural daylight.
No text, no map labels, no pins, no overlays, no watermark.
```

---

### TPL_VID_009_v1 — Push Toward Map Pin

```
Engine:    Video Engine
Provider:  Kling V2
Operation: IMAGE_TO_VIDEO
Camera:    ZOOM_IN
Use Case:  Shot 1 alt. -- เปิดที่หมุดบนแผนที่ แล้วดันกล้องเข้าหาหมุด
Est. Cost: $0.160 per clip
```
*(Static — no variables)*

**Template (Static):**

```text
Slow cinematic push toward the marker at the centre of the map.
The map stays flat and legible while the camera closes in steadily,
streets and blocks growing larger around the pin as it approaches.
Very smooth continuous forward motion, no shake, no rotation, no cuts.
Clean digital cartography look, crisp edges, even lighting.
Do not add, move or duplicate any marker, label or icon.
```

---

### TPL_VID_010_v1 — Aerial Descent Onto The Real Plot (WF1)

```
Engine:    Video Engine
Provider:  Kling (v1-6 pro เมื่อมี image_tail)
Operation: IMAGE_TO_VIDEO
Camera:    DRONE_REVEAL
Duration:  10s
Use Case:  WF1 -- ร่อนลงจากมุมสูง ผ่านชั้นฟ้า จบที่ภาพที่ดินจริง
Est. Cost: $0.160 per clip
```
*(Static — no variables)*

> **ห้ามเพิ่มจังหวะเข้าไปใน prompt นี้** — ข้อความด้านล่างคือเวอร์ชันที่ทำงานได้จริง
> เคยแก้ 2 รอบเพื่อยัดจังหวะเพิ่ม (FPV dive, เล่าเรื่องหมุดปัก) ผลคือแย่ลงทั้งสองรอบ
> โมเดลเริ่มคิดการเคลื่อนไหวเอง แทนที่จะร่อนลงเฉย ๆ — คำสั่งผู้ใช้: กลับไปใช้อันเดิม
>
> หมุดของ WF1 Scene 1 ทำเป็น overlay ด้วย `compositeWf1Pin()` **ห้ามฝังลงในรูปที่ส่งให้โมเดล**

**Template (Static):**

```text
Continuous aerial descent from high above the ground down to the site.
Camera drops steadily through open sky and thin haze,
the view transitioning from a flat overhead perspective into a real photographic
ground-level view of the same location as it descends.
One unbroken falling move that eases to a stop, no cuts, no shake.
Photorealistic drone footage, natural daylight.
No text, no map labels, no pins, no overlays, no watermark.
```

---

### TPL_VID_008_v1 — Construction Time-Lapse (Start + End Frame)

```
Engine:    Video Engine
Provider:  Kling V2 (kling-v1-6 when image_tail is set -- v2 models ignore end frames)
Operation: IMAGE_TO_VIDEO
Camera:    DRONE_REVEAL
Use Case:  ฉากก่อสร้าง -- ต้องมีทั้งภาพเริ่ม (image) และภาพจบ (image_tail)
Est. Cost: $0.160 per clip (ต่อ 1 ช่วงเชื่อมระหว่าง 2 stage)
```
*(Static — no variables)*

**Template (Static):**

```text
Time-lapse construction on an empty plot of land.
The bare ground gives way as a house rises into place piece by piece,
foundation then frame then walls then roof, settling into a finished home.
Camera holds a slow steady aerial push forward throughout.
Smooth continuous transformation, no cuts, no flicker, no shake.
Photorealistic architectural time-lapse, warm natural daylight.
No text, no watermark, no people, no vehicles, no signage.
```

> **คำเตือนต้นทุน**: ใช้ template นี้ต่อเมื่อยอมจ่ายเกินเพดาน $0.30/วิดีโอจริงๆ เท่านั้น
> ระหว่าง 5 stage มี 4 ช่วงเชื่อม × $0.16 = $0.64 (ยังไม่รวมค่าสร้างภาพนิ่ง 5 ใบ $0.07)
> รวม **$0.71** ต่อฉากก่อสร้างอย่างเดียว — ทางเลือกที่อยู่ในเพดานคือ `construction-engine.mjs`
> ซึ่งใช้ภาพนิ่ง 5 ใบ + FFmpeg crossfade แทนที่จะเรียก template นี้ ต้นทุนเหลือ $0.07
> เลือกใช้ template นี้เฉพาะตอนที่ต้องการภาพเคลื่อนไหวจริงและงบไม่ใช่ข้อจำกัด

---

## 7.1 Master Prompt Structure — Fixed vs Variable (บังคับใช้ทุกครั้งที่สร้าง Prompt ใหม่)

> เพิ่มเมื่อ 9 ส.ค. 2569 ตามคำสั่งของ user ที่ต้องการให้ Claude "จดจำไว้ตลอดในการ generate"
> โครงนี้คือกฎการประกอบ prompt ที่ Claude ต้องใช้เป็นฐานทุกครั้ง ไม่ใช่คิดใหม่ทุกรอบ
> เพื่อให้ output จาก Kling มี look & feel เดียวกันทั้งแพลตฟอร์ม (brand consistency)

### แก้ให้ตรงกับสัญญาที่ระบบบังคับจริงแล้ว (สำคัญ)

ร่างต้นฉบับที่ user ให้มามีตัวแปรบางตัวที่ **ไม่ตรงกับ enum ที่ระบบบังคับ** ถ้าปล่อยผ่านจะ generate
ด้วยค่าที่ validator ปฏิเสธ Claude ต้องเตือนทันทีตามกฎที่ user วางไว้เอง ("ผมจะเตือนทันที ถ้าค่าตัวแปร
ที่ให้มาขัดกับ fixed structure") — รายการที่แก้แล้วในตารางด้านล่าง:

| ตัวแปร | ร่างเดิมของ user | ค่าจริงที่ระบบยอมรับ (บังคับ) | อยู่ที่ไฟล์ |
|---|---|---|---|
| `HOUSE_STYLE` | modern minimalist / Thai contemporary / resort tropical / loft-style / classic colonial | **`MODERN_NORDIC` \| `MINIMALIST` \| `LUXURY_CLASSIC` \| `CONTEMPORARY` \| `LOFT`** (5 ค่าตายตัว มาจาก Property Engine TPL_PROP_002_v1) | `src/wf5/construction.mjs` `STYLE_WORDS`, `17_PROMPT_LIBRARY.md` §6 |
| `CAMERA_MOVEMENT` | zoom-out top-down / orbiting / push-in dolly / time-lapse vertical build-up | **`PAN_RIGHT` \| `ZOOM_IN` \| `DRONE_REVEAL` \| `TILT_UP`** เท่านั้นที่ผ่าน validator — `ZOOM_OUT` และ `ORBIT` ยังไม่มีจริง (ORBIT ถูกเขียนไว้ใน TPL_VID_005 แต่ไม่อยู่ใน enum ตั้งแต่ก่อนหน้านี้แล้ว เป็นบั๊กเอกสารเก่าที่ยังไม่ได้แก้) | `schemas/video.schema.json`, `src/engines/video-engine.mjs` `CAMERA_MOTIONS` |

**ถ้าต้องการ `ZOOM_OUT` หรือ `ORBIT` จริงๆ** ต้องแก้โค้ด 3 จุดพร้อมกัน (เพิ่ม enum ใน schema + `CAMERA_MOTIONS` +
`buildCameraControl()` ใน `kling-adapter.mjs`) ไม่ใช่แค่เขียนในเอกสาร — ยังไม่ได้ทำ เพราะเป็นการเปลี่ยนสัญญา
ที่โค้ดอื่นอ้างอิงอยู่ ต้องตัดสินใจร่วมก่อน

### โครงสร้างมาตรฐาน (Fixed — ห้ามเปลี่ยนโครง เปลี่ยนได้แค่ค่าตัวแปร)

```text
[SHOT TYPE], [CAMERA_MOVEMENT] of [HOUSE_STYLE] house,
[MATERIAL_FACADE], set in [ENVIRONMENT],
[LIGHTING] lighting, [TIME_OF_DAY],
photorealistic architectural visualization, cinematic real estate commercial,
smooth camera motion, 8k detail, shallow depth of field on foreground landscaping,
{{negative_keywords}}, {{safety_keywords}}
```

`{{negative_keywords}}` และ `{{safety_keywords}}` **ไม่ใช่ค่าที่ผู้ใช้กรอกเอง** — ดึงจาก §4.1/§4.3
เสมอ (ทั้งชุด ไม่ใช่เลือกบางคำ) เพราะเป็นจุดที่บั๊กจริงเคยเกิด: `construction-engine.mjs` เคยประกอบ prompt
เองแยกจากไฟล์นี้และลืมใส่ safety keywords ทั้งที่ prompt พูดถึง "excavator on site" ตรงๆ ซึ่งเสี่ยงให้โมเดล
วาดคนงานเข้ามาในภาพ แก้แล้วให้เรียกผ่าน `buildStagePrompt()` ตัวเดียวจุดเดียวเท่านั้น (ดู §14.3)

### ตัวแปรที่ปรับได้ (ต่อทรัพย์แต่ละแปลง)

| ตัวแปร | ค่าที่ใช้ได้ | ที่มา |
|---|---|---|
| `HOUSE_STYLE` | 5 ค่าตายตัวข้างบน | `style_tag` จาก Property Engine |
| `MATERIAL_FACADE` | white stucco with wood accent / exposed concrete / glass curtain wall / brick and timber | เลือกตาม style_tag ให้เข้ากัน ไม่ใช่สุ่ม |
| `ENVIRONMENT` | suburban plot with garden / riverside / near golf course / gated village / rural Thailand open field | จาก Google Engine (nearby context) |
| `LIGHTING` | golden hour warm / soft overcast / blue hour twilight | ค่าเริ่มต้น golden hour เว้นแต่ระบุ |
| `TIME_OF_DAY` | sunrise / midday / dusk | ค่าเริ่มต้น midday |
| `CAMERA_MOVEMENT` | 4 ค่าตายตัวข้างบน | ตาม sub-step ดูตารางล่าง |

### แผนที่ sub-step 5.1–5.8 → Template ID จริง

**แก้ความเข้าใจผิดหนึ่งจุดก่อน**: ไม่ใช่ทุก sub-step ที่ต้องมี Kling prompt — 5.6/5.7/5.8 เป็นงานของ
Render Engine ซึ่ง **"ห้ามเรียก generative AI API ใดๆ ทั้งสิ้น ทำแค่สั่ง FFmpeg"** (คอมเมนต์หัวไฟล์
`render-engine.mjs`) การ์ด ซับ และเสียง ประกอบด้วยโค้ดล้วน ไม่มี prompt ให้ Kling เลย

| Sub-step | ทำอะไร | Template ID | Camera | ใช้งานจริงในโค้ดหรือยัง |
|---|---|---|---|---|
| 5.1 Satellite Zoom | นอกโลก → หมุด → ภาพดาวเทียม | `TPL_VID_007_v1` (Kling) **หรือ** `mapzoom-engine.mjs` (FFmpeg ล้วน ถูกกว่า 16 เท่า ไม่ใช้ AI) | DRONE_REVEAL | **ใช้เส้นทาง FFmpeg จริงในระบบตอนนี้** — `TPL_VID_007` มีไว้เผื่ออนาคตอยากได้แบบ AI สร้างเอง |
| 5.1 alt. | เปิดที่หมุด แล้วดันกล้อง | `TPL_VID_009_v1` | ZOOM_IN | ยังไม่ถูกเรียกจากโค้ดที่ใช้งานจริง |
| 5.2 Drone Animation | ร่อนจากมุมแผนที่ลงภาพถ่ายจริง | `TPL_VID_010_v1` | DRONE_REVEAL | ยังไม่ถูกเรียกจากโค้ดที่ใช้งานจริง (แทนที่ด้วยฉาก "plot" ใน `story-engine.mjs` ที่ซูมภาพถ่ายจริงด้วย FFmpeg) |
| 5.3 House Visualization | ดันกล้องเข้าหาประตูบ้าน | `TPL_VID_003_v1` | ZOOM_IN | มีในโค้ด ยังไม่ถูกเรียกใช้จริง (บ้านที่สร้างด้วย AI ยังไม่ทำ — รอเครดิต Kling) |
| 5.4 Construction Simulation | ที่ดินเปล่า → บ้านเสร็จ ทีละขั้น | `TPL_VID_008_v1` (มีภาพเคลื่อนไหวจริง $0.71/ฉาก) **หรือ** `construction-engine.mjs` (ภาพนิ่ง 5 ใบ + crossfade $0.07/ฉาก) | DRONE_REVEAL | **ใช้เส้นทางถูก (`construction-engine.mjs`) เป็นค่าเริ่มต้น** — สลับไป `TPL_VID_008` ได้ถ้ายอมจ่ายเกินเพดาน |
| 5.5 Image to Video | ภาพนิ่งทั่วไป → คลิป | `TPL_VID_001` ถึง `TPL_VID_004` ตาม camera ที่เลือก | ตามที่เลือก | มีในโค้ด (`video-engine.mjs`) รอโควตา Kling |
| 5.6 Subtitle | ฝังซับ | **ไม่มี — FFmpeg `subtitles` filter ล้วน** | — | ใช้งานจริงแล้ว (`render-engine.mjs` + `lib/ass.mjs`) |
| 5.7 BGM & Voice | ใส่เสียง | **ไม่มี — เสียงพูดสร้างจาก `say -v Kanya` (เสียงระบบ macOS) ไม่ใช่ Kling** | — | ใช้งานจริงแล้ว (`lib/voice.mjs`) — เปลี่ยนไปใช้ ElevenLabs ผ่าน Higgsfield ได้ถ้าต้องการเสียงคุณภาพสูงกว่า |
| 5.8 Final Render | ประกอบร่างสุดท้าย | **ไม่มี — FFmpeg ล้วน** | — | ใช้งานจริงแล้ว (`render-engine.mjs`) |

### กติกาที่ Claude กำกับตลอดโปรเจกต์ (ตามที่ user สั่งไว้)

1. ทุกครั้งที่สร้าง prompt ใหม่ ใช้โครงสร้าง Fixed ด้านบนเป็นฐานเสมอ ไม่คิดใหม่หมดทุกรอบ
2. เปลี่ยนได้เฉพาะช่องตัวแปร ตามข้อมูลจริงของทรัพย์แต่ละแปลง (ดึงจาก Property/Google Engine)
3. **เตือนทันที** ถ้าค่าตัวแปรที่ขอมาไม่ตรงกับ enum ที่ระบบบังคับ (ตัวอย่างจริงที่เจอแล้ว: `resort tropical`,
   `ZOOM_OUT`, `ORBIT`) — ไม่เงียบแล้วเดาค่าที่ใกล้เคียงเอง
4. `--ar`/`--duration` ต้องตรงปลายทางเสมอ: 9:16 = TikTok/Reels/Shorts, 16:9 = YouTube
5. ห้าม inline prompt ในโค้ด engine ใดๆ — ดึงผ่าน `prompt-library.mjs` หรือ `buildStagePrompt()`
   เท่านั้น (17_PROMPT_LIBRARY.md §15 rule 2, เพิ่งพบว่า `construction-engine.mjs` ละเมิดข้อนี้จริง
   และแก้แล้วเมื่อ 9 ส.ค. 2569)
6. Kling คือ fallback หลักตอนนี้เพราะ Higgsfield API สถานะแดง (บัญชี Kling เองก็ว่างอยู่ ณ วันที่บันทึก
   — ดู `20_ROADMAP.md` รอบล่าสุด) prompt ทุกอันจึงต้อง "แข็งแรงพอ" ที่จะไม่ต้องพึ่งการปรับแต่งเพิ่มเมื่อ
   สลับ provider

---

## 8. Caption Generation Templates (Publish Engine)

---

### TPL_CAP_001_v1 — TikTok Caption (Thai)

```
Engine:    Publish Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.001 per call
Platform:  TikTok
```

**Template:**

```text
You are a Thai social media copywriter specializing in real estate content for TikTok.

Write a TikTok caption for this property listing. Follow all rules strictly.

Caption Rules:
- Language: Thai only
- Total length: 150 to 300 characters (including hashtags)
- Start with an attention hook using emoji
- Tone: Conversational, exciting, natural — NOT a formal advertisement
- Mention: location + one strongest selling point
- End with a clear call-to-action
- Hashtags: 6to 8 hashtags at the very end

Property Details:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Key Features: {{highlight_features}}

Return ONLY the caption text with hashtags. No explanation. No JSON. No markdown.
```

**Variable Schema:**
```json
{
  "title": {
    "type": "string",
    "required": true,
    "description": "ชื่อทรัพย์สินที่สะอาดแล้ว"
  },
  "price_formatted": {
    "type": "string",
    "required": true,
    "description": "ราคาที่จัดรูปแบบแล้ว เช่น 12.9 ล้านบาท",
    "note": "ค่านี้จะถูกแสดงใน Caption เท่านั้น ห้ามส่งเข้า Image/Video Prompt"
  },
  "location": {
    "type": "string",
    "required": true,
    "description": "ชื่อทำเลหรือย่าน เช่น พระราม 9, เชียงใหม่"
  },
  "highlight_features": {
    "type": "string",
    "required": true,
    "description": "รายการจุดเด่น คั่นด้วยคอมม่า เช่น บ้านเดี่ยว 2 ชั้น, พื้นที่ 80 ตร.ว."
  }
}
```

**Expected Output Example:**
```text
🏠 บ้านสไตล์ลอฟท์กลางเมือง พระราม 9 วิวสวยมาก!
บ้านเดี่ยว 2 ชั้น พื้นที่ 80 ตร.ว. ดีไซน์โดดเด่นไม่เหมือนใคร
ราคา 12.9 ล้านบาท สนใจคอมเมนต์ "สนใจ" ได้เลยนะคะ

#บ้านพระราม9 #บ้านลอฟท์ #อสังหาริมทรัพย์ #บ้านสวย #ขายบ้าน #บ้านกรุงเทพ #realestate
```

---

### TPL_CAP_002_v1 — YouTube Shorts Description (Thai)

```
Engine:    Publish Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.001 per call
Platform:  YouTube Shorts
```

**Template:**

```text
You are a Thai real estate YouTube Shorts content creator.

Write a YouTube Shorts description for this property.

Rules:
- Language: Thai
- Maximum100 characters total (very short — Shorts best practice)
- Include location and price
- End with a question or CTA to encourage comments
- Hashtags: 3 maximum, inside the 100 character limit if possible

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}

Return only the description text. No explanation.
```

**Variable Schema:**
```json
{
  "title": { "type": "string", "required": true },
  "price_formatted": { "type": "string", "required": true },
  "location": { "type": "string", "required": true }
}
```

---

### TPL_CAP_003_v1 — Facebook Reels Caption (Thai)

```
Engine:    Publish Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.001 per call
Platform:  Facebook Reels
```

**Template:**

```text
You are a Thai real estate Facebook content creator.

Write a Facebook Reels caption for this property listing.

Rules:
- Language: Thai
- Length: 200 to 400 characters
- Tone: Slightly more formal than TikTok but still engaging
- Must include: property title, location, price, 2-3 key features
- Must include: a clear call-to-action with contact instruction
- Hashtags: 5 to 7 relevant hashtags at the end
- Do NOT use emojis excessively — maximum 3 emojis total

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Key Features: {{highlight_features}}
Contact: {{contact_method}}

Return only the caption. No explanation.
```

**Variable Schema:**
```json
{
  "title": { "type": "string", "required": true },
  "price_formatted": { "type": "string", "required": true },
  "location": { "type": "string", "required": true },
  "highlight_features": { "type": "string", "required": true },
  "contact_method": {
    "type": "string",
    "required": true,
    "description": "ช่องทางติดต่อ เช่น ไลน์ @broker1 หรือ โทร081-234-5678",
    "note": "ค่านี้แสดงใน Caption เท่านั้น ห้ามส่งเข้า Image/Video Prompt"
  }
}
```

---

### TPL_CAP_004_v1 — Instagram Reels Caption (Thai/English Mix)

```
Engine:    Publish Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.001 per call
Platform:  Instagram Reels
```

**Template:**

```text
You are a bilingual Thai-English real estate Instagram content creator.

Write an Instagram Reels caption for this property.

Rules:
- Mix Thai and English naturally (Thai main body, English keywords and hashtags)
- Length: 150 to 250 characters
- Aesthetic tone: aspirational, premium, lifestyle-focused
- Mention location and one luxury feature
- Hashtags: 10 to 15 hashtags mixing Thai and English real estate tags
- Use line breaks to separate the main text and hashtags section

Property:
Title: {{title}}
Price: {{price_formatted}}
Location: {{location}}
Style: {{style_tag}}
Key Features: {{highlight_features}}

Return only the caption with hashtags. No explanation.
```

**Variable Schema:**
```json
{
  "title": { "type": "string", "required": true },
  "price_formatted": { "type": "string", "required": true },
  "location": { "type": "string", "required": true },
  "style_tag": { "type": "string", "required": true },
  "highlight_features": { "type": "string", "required": true }
}
```

---

## 9. TTS Script Templates (Render Engine)

---

### TPL_TTS_001_v1 — Standard Property Voiceover (Thai Female)

```
Engine:    Render Engine (Audio Preparation)
Provider:  Fish Audio / ElevenLabs Turbo
Operation: TEXT_TO_SPEECH
Est. Cost: $0.002 – $0.004 per script
Voice:     Thai Female (warm, professional)
```

**Template:**

```text
{{title}}

{{highlight_feature_1}}
{{highlight_feature_2}}
{{highlight_feature_3}}

ราคาเพียง {{price_spoken}} เท่านั้น

สนใจสอบถามข้อมูลเพิ่มเติมติดต่อได้ที่ {{contact_method}}
```


```markdown
### TPL_TTS_001_v1 — (ต่อ) Variable Schema

**Variable Schema:**
```json
{
  "title": {
    "type": "string",
    "required": true,
    "description": "ชื่อโครงการสำหรับอ่านออกเสียง ห้ามมีตัวเลขราคาหรือเบอร์โทร"
  },
  "highlight_feature_1": {
    "type": "string",
    "required": true,
    "description": "จุดเด่นที่ 1 สั้นกระชับอ่านออกเสียงได้คล่อง"
  },
  "highlight_feature_2": {
    "type": "string",
    "required": false,
    "default": "",
    "description": "จุดเด่นที่ 2"
  },
  "highlight_feature_3": {
    "type": "string",
    "required": false,
    "default": "",
    "description": "จุดเด่นที่ 3"
  },
  "price_spoken": {
    "type": "string",
    "required": true,
    "description": "ราคาที่พูดออกเสียงได้ เช่น สิบสองจุดเก้าล้านบาท (ห้ามใช้ตัวเลข)",
    "note": "ต้องแปลงจาก price_thb เป็นคำพูดก่อนส่งเข้า Template"
  },
  "contact_method": {
    "type": "string",
    "required": true,
    "description": "ช่องทางติดต่อสำหรับอ่านออกเสียง เช่น ไลน์แอด แอทบร็อคเกอร์วัน"
  }
}
```

**Expected Audio Script Output Example:**
```text
บ้านเดี่ยวสองชั้น สไตล์โมเดิร์นลอฟท์ พระราม เก้า

บ้านเดี่ยวสองชั้น พื้นที่แปดสิบตารางวา
ทำเลย่านพระราม เก้า ใจกลางกรุงเทพ
ดีไซน์โดดเด่น สไตล์อุตสาหกรรมโมเดิร์น

ราคาเพียง สิบสองจุดเก้าล้านบาท เท่านั้น

สนใจสอบถามข้อมูลเพิ่มเติมติดต่อได้ที่ ไลน์แอด...
```

---

### TPL_TTS_002_v1 — Premium Property Voiceover (Thai Male, Formal)

```
Engine:    Render Engine (Audio Preparation)
Provider:  ElevenLabs Turbo / Fish Audio
Operation: TEXT_TO_SPEECH
Est. Cost: $0.003 – $0.005 per script
Voice:     Thai Male (authoritative, formal)
Use Case:LUXURY_CLASSIC style properties
```

**Template:**

```text
ยินดีนำเสนอ {{title}}

อสังหาริมทรัพย์ระดับพรีเมียม {{location}}

{{highlight_feature_1}}
{{highlight_feature_2}}
{{highlight_feature_3}}

มูลค่าการลงทุนเริ่มต้น {{price_spoken}}

สำหรับท่านที่สนใจรายละเอียดเพิ่มเติม กรุณาติดต่อ {{contact_method}}
```

**Variable Schema:**
```json
{
  "title": { "type": "string", "required": true },
  "location": { "type": "string", "required": true },
  "highlight_feature_1": { "type": "string", "required": true },
  "highlight_feature_2": { "type": "string", "required": false, "default": "" },
  "highlight_feature_3": { "type": "string", "required": false, "default": "" },
  "price_spoken": { "type": "string", "required": true },
  "contact_method": { "type": "string", "required": true }
}
```

---

### TPL_TTS_003_v1 — Land Plot Voiceover (Thai Female, Casual)

```
Engine:    Render Engine (Audio Preparation)
Provider:  Fish Audio
Operation: TEXT_TO_SPEECH
Est. Cost: $0.002 – $0.003 per script
Voice:     Thai Female (warm, approachable)
Use Case:  ที่ดินเปล่า, ที่ดินจัดสรร
```

**Template:**

```text
ที่ดินเปล่า {{location}} พื้นที่ {{land_size}}

{{highlight_feature_1}}
{{highlight_feature_2}}

เหมาะสำหรับ{{suitable_use}}

ราคา {{price_spoken}} สนใจติดต่อ {{contact_method}} ได้เลยนะคะ
```

**Variable Schema:**
```json
{
  "location": { "type": "string", "required": true },
  "land_size": {
    "type": "string",
    "required": true,
    "description": "ขนาดที่ดิน อ่านออกเสียงได้ เช่น แปดสิบตารางวา"
  },
  "highlight_feature_1": { "type": "string", "required": true },
  "highlight_feature_2": { "type": "string", "required": false, "default": "" },
  "suitable_use": {
    "type": "string",
    "required": false,
    "default": "การก่อสร้างที่อยู่อาศัยและการพาณิชย์",
    "description": "วัตถุประสงค์การใช้ที่ดินที่เหมาะสม"
  },
  "price_spoken": { "type": "string", "required": true },
  "contact_method": { "type": "string", "required": true }
}
```

---

## 10. Overlay Engine Templates

---

### TPL_OVER_001_v1 — Price Badge Text Generator

```
Engine:    Overlay Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.0005 per call
Use Case:  สร้างข้อความสำหรับ Price Badge บนวิดีโอ
```

**Template:**

```text
Convert the following property price to a compact Thai display format
suitable for a video overlay badge. Maximum 12 characters.

Rules:
- Use Thai numerals style: "12.9 ล้าน" not "12,900,000"
- If price is under 1 million: show as "950,000 บาท"
- If price is 1-9.9 million: show as "X.X ล้าน" (1 decimal)
- If price is 10+ million: show as "XXล้าน" (no decimal unless needed)
- No extra words, no "ราคา" prefix

Price in THB: {{price_thb}}

Return only the formatted string. No explanation.
```

**Variable Schema:**
```json
{
  "price_thb": {
    "type": "number",
    "required": true,
    "description": "ราคาเป็นตัวเลข integer เช่น 12900000"
  }
}
```

**Examples:**
```text
Input: 12900000  → Output: "12.9 ล้าน"
Input: 3500000   → Output: "3.5 ล้าน"
Input: 950000    → Output: "950,000 บาท"
Input: 45000000  → Output: "45 ล้าน"
```

---

### TPL_OVER_002_v1 — Hashtag Generator for Overlay End Card

```
Engine:    Overlay Engine
Provider:  Claude Haiku
Operation: TEXT_COMPLETION
Est. Cost: $0.0005 per call
Use Case:  สร้าง Hashtags แสดงบน Ending Card ของวิดีโอ
```

**Template:**

```text
Generate exactly 3 short Thai hashtags for a real estate video ending card.

Rules:
- Maximum 10 characters each (including the # symbol)
- Thai language only
- Relevant to: property type and location
- Format: #คำสั้น (no spaces within hashtag)
- Return as3 hashtags separated by single space

Property type: {{property_type}}
Location: {{location}}

Return only the 3 hashtags on one line. No explanation.
```

**Variable Schema:**
```json
{
  "property_type": {
    "type": "string",
    "required": true,
    "description": "ประเภทอสังหาริมทรัพย์ เช่น บ้านเดี่ยว, ที่ดินเปล่า, คอนโด"
  },
  "location": {
    "type": "string",
    "required": true,
    "description": "ชื่อย่านหรือจังหวัด"
  }
}
```

---

## 11. Analytics Engine Templates

---

### TPL_ANA_001_v1 — Performance Insight Summary

```
Engine:    Analytics Engine
Provider:  Claude Haiku / Gemini Flash
Operation: TEXT_COMPLETION
Est. Cost: $0.002 per call
Use Case:  สรุปผลการทำงานของแคมเปญในรูปแบบภาษาธรรมชาติ
```

**Template:**

```text
You are a Thai real estate marketing analytics specialist.

Analyze the following video campaign performance data and write
a concise Thai-language insight summary for the property manager.

Rules:
- Write in Thai
- Maximum 200 characters
- Mention: best performing platform, engagement highlight, and one actionable recommendation
- Tone: professional but easy to understand

Performance Data:
Property ID: {{property_id}}
TikTok views: {{tiktok_views}} | Engagement rate: {{tiktok_engagement}}
YouTube views: {{youtube_views}} | Engagement rate: {{youtube_engagement}}
Facebook views: {{facebook_views}} | Engagement rate: {{facebook_engagement}}
Total cost: {{total_cost_usd}} USD
Cost per view: {{cost_per_view_usd}} USD

Return only the insight text. No JSON. No markdown.
```

**Variable Schema:**
```json
{
  "property_id": { "type": "string", "required": true },
  "tiktok_views": { "type": "number", "required": true },
  "tiktok_engagement": { "type": "string", "required": true },
  "youtube_views": { "type": "number", "required": true },
  "youtube_engagement": { "type": "string", "required": true },
  "facebook_views": { "type": "number", "required": true },
  "facebook_engagement": { "type": "string", "required": true },
  "total_cost_usd": { "type": "string", "required": true },
  "cost_per_view_usd": { "type": "string", "required": true }
}
```

---

## 12. Template Version Control Rules

1. **Immutable History:**ห้ามแก้ไข Template เดิมที่มีอยู่แล้ว หากต้องการเปลี่ยนแปลงให้สร้าง Versionใหม่เท่านั้น
2. **Version Increment:** `TPL_HOUSE_001_v1` → แก้ไขเป็น `TPL_HOUSE_001_v2` (ไม่ลบ v1)
3. **Latest Version Default:** ระบบจะใช้ Versionล่าสุดเสมอ เว้นแต่จะระบุ Version เฉพาะเจาะจง
4. **Changelog Required:** ทุกครั้งที่สร้าง Version ใหม่ต้องบันทึกเหตุผลใน Changelog
5. **Test Before Commit:** ต้องทดสอบ Template ด้วย Input จริงก่อนนำเข้าสู่ Library เสมอ

---

## 13. Template Registry Summary

| Template ID | Engine | Provider | Purpose | Cost Est. |
| :--- | :--- | :--- | :--- | :--- |
| `TPL_PROP_001_v1` | Property | Claude Haiku | Entity extraction จากข้อความดิบ | $0.001–0.003 |
| `TPL_PROP_002_v1` | Property | Claude Haiku | Style classification | $0.0005 |
| `TPL_PROP_003_v1` | Property | Claude Haiku | Highlight feature generator | $0.001|
| `TPL_HOUSE_001_v1` | House | Flux / MJ | General exterior (flexible) | $0.025–0.050 |
| `TPL_HOUSE_002_v1` | House | Flux1 Dev | Modern Nordic style (static) | $0.025|
| `TPL_HOUSE_003_v1` | House | Flux 1 Dev | Loft style (static) | $0.025 |
| `TPL_HOUSE_004_v1` | House | MJ / Flux | Luxury Classic style (static) | $0.025–0.050 |
| `TPL_HOUSE_005_v1` | House | Flux 1 Dev | Contemporary style (flexible) | $0.025 |
| `TPL_HOUSE_006_v1` | House | Flux 1 Dev | Minimalist style (static) | $0.025 |
| `TPL_HOUSE_007_v1` | House | Flux 1 Dev | Land plot only (no structure) | $0.025 |
| `TPL_VID_001_v1` | Video |Kling/Luma | Drone rising reveal | $0.080–0.260 |
| `TPL_VID_002_v1` | Video | Kling/Luma | Slow pan right | $0.080–0.160 |
| `TPL_VID_003_v1` | Video | Kling/Higs | Push-in zoom entrance | $0.160–0.180 |
| `TPL_VID_004_v1` | Video | Kling/RW | Tilt up reveal | $0.160–0.260 |
| `TPL_VID_005_v1` | Video | Higs/RW | Orbital arc | $0.180–0.260 |
| `TPL_VID_006_v1` | Video | Luma/Kling | Aerial map fly-in | $0.080–0.160 |
| `TPL_VID_007_v1` | Video | Kling V2 | Cosmic descent to plot (5.1) | $0.160 |
| `TPL_VID_008_v1` | Video | Kling v1-6 | Construction time-lapse, start+end frame (5.4) — $0.71/scene, over the $0.30 cap | $0.160/transition |
| `TPL_VID_009_v1` | Video | Kling V2 | Push toward map pin (5.1 alt.) | $0.160 |
| `TPL_VID_010_v1` | Video | Kling V2 | Map view falls onto real plot photo (5.2) | $0.160 |
| `TPL_CAP_001_v1` | Publish | Claude Haiku | TikTok caption (Thai) | $0.001|
| `TPL_CAP_002_v1` | Publish | Claude Haiku | YouTube Shorts description | $0.001 |
| `TPL_CAP_003_v1` | Publish | Claude Haiku | Facebook Reels caption | $0.001 |
| `TPL_CAP_004_v1` | Publish | Claude Haiku | Instagram Reels caption | $0.001 |
| `TPL_TTS_001_v1` | Render | Fish/EL | Voiceover Thai Female standard | $0.002–0.004 |
| `TPL_TTS_002_v1` | Render | EL/Fish | Voiceover Thai Male formal | $0.003–0.005 |
| `TPL_TTS_003_v1` | Render | Fish Audio | Voiceover land plot casual | $0.002–0.003 |
| `TPL_OVER_001_v1` | Overlay | Claude Haiku | Price badge formatter | $0.0005 |
| `TPL_OVER_002_v1` | Overlay | Claude Haiku | Hashtag end card generator | $0.0005 |
| `TPL_ANA_001_v1` | Analytics | Claude Haiku | Campaign insight summary | $0.002 |

---

## 14. Prompt Anti-Patterns

###14.1 ห้ามใส่ราคาหรือข้อมูลติดต่อใน Image/Video Prompt

```text
BAD:
"บ้านเดี่ยวพระราม9 ราคา12.9 ล้านบาท ติดต่อ 081-234-5678 ไลน์ @broker1"

GOOD:
"Photorealistic 2-story contemporary house, large windows, Bangkok urban setting,
golden hour lighting, cinematic architectural photography"
```

---

### 14.2 ห้ามเขียน Video Motion Prompt แบบยาวเหมือน Image Prompt

```text
BAD (ยาวเกินไปสำหรับ Video Provider):
"Create a beautiful cinematic video of this modern house located in Bangkok
Thailand with a slow drone reveal starting from the garden level moving upward
while the camera simultaneously pans to the right showing the swimming pool
and the surrounding neighborhood in the background with golden hour lighting..."

GOOD (กระชับ ตรงประเด็น):
"Slow cinematic drone rising reveal. Camera ascends smoothly from ground level.
Golden hour lighting. No text, no watermark."
```

---

### 14.3 ห้าม Inline Prompt ในโค้ด

```javascript
// BAD: เขียน Prompt ตรงในโค้ด
const prompt = `Photorealistic ${styleTag} house exterior, professional photography`;
await providerInterface.call({ payload: { prompt } });

// GOOD:ดึงจาก Prompt Library เสมอ
const template = await promptLibrary.get("TPL_HOUSE_001_v1");
const prompt = fillTemplate(template, {
  style_description: "2-story modern nordic",
  lighting_condition: "golden hour"
});
await providerInterface.call({ payload: { prompt: sanitizeMediaPrompt(prompt) } });
```

---

### 14.4 ห้ามใช้ Template ผิดประเภท Engine

```text
BAD: นำ TPL_VID_001_v1 (Motion Description) ไปใช้กับ Image Generation
BAD: นำ TPL_HOUSE_002_v1 (Static Image Prompt) ไปใช้กับ Video Provider โดยตรง
GOOD: ตรวจสอบ Engine field ในหัว Templateก่อนใช้งานเสมอ
```

---

## 15. Claude Rules for Prompt Library

1. ห้ามแก้ไข Template ที่มีอยู่โดยตรง ต้องสร้าง Version ใหม่เท่านั้น
2. ห้าม inline Prompt ลงในโค้ดของ Engine ต้องดึงจาก Libraryผ่าน `promptLibrary.get()`
3. ห้ามนำ template_id ผิด Engine type ไปใช้งาน
4. ห้ามเพิ่มราคา เบอร์โทร Line ID หรือข้อมูลส่วนตัวใน Image/Video Templateใดๆ
5. ทุก Template ใหม่ต้องมี Variable Schema กำกับเสมอ
6. ทุก Static Template (ไม่มี Variables) ต้องระบุ `(Static — no variables)` ไว้ชัดเจน
7. ต้องรัน `sanitizeMediaPrompt()` กับทุก Template ที่ส่งไปยัง Image/Video Provider
8. ห้ามเพิ่ม Template โดยไม่อัปเดต Template Registry Summary ในหัวข้อ 13

---

## 16. Migration Guide

### ระบบเดิม

```javascript
// n8n Function Node — เขียน Prompt ตรงๆ ใน Node
const prompt = `สร้างภาพบ้าน ${property.title}
ราคา ${property.price} บาท
ติดต่อ ${broker.phone}`;

// ส่งตรงไปKling API
await axios.post("https://api.klingai.com/...", { prompt });
```

**ปัญหา:**
- Prompt มีราคาและเบอร์โทร → AI พยายามวาดตัวเลขลงในวิดีโอ
- แก้ Prompt ต้องเข้าไปแก้ใน n8n Nodeทุกตัว
- ไม่มีระบบ Version Control ของ Prompt
- ไม่มี Fallback Provider

---

### ระบบใหม่

```javascript
// 1. ดึง Template จาก Library
const template = await promptLibrary.get("TPL_HOUSE_003_v1"); // Loft Style

// 2. เติม Variables (เฉพาะตัวแปรที่ปลอดภัย ไม่มีราคาหรือเบอร์โทร)
const prompt = fillTemplate(template, {
  // TPL_HOUSE_003_v1 เป็น Static Template ไม่ต้องใส่ variables
});

// 3. Sanitize ก่อนส่งออกเสมอ
const cleanPrompt = sanitizeMediaPrompt(prompt);

// 4. ส่งผ่าน Provider Interface
const result = await providerInterface.call({
  request_id: uuidv4(),
  transaction_id: ctx.transactionId,
  operation_type: "IMAGE_GENERATION",
  preferred_provider: "FLUX_1_DEV",
  fallback_providers: ["FLUX_1_SCHNELL", "SDXL"],
  budget_limit_usd: 0.05,
  payload: { prompt: cleanPrompt }
});
```

### Migration Steps

1. สร้าง `promptLibrary` service หรือ module ที่โหลด Templates จากไฟล์นี้
2. เขียนฟังก์ชัน `fillTemplate(templateString, variables)` สำหรับแทนค่า `{{variable}}`
3. ลบ Prompt ที่ฝังอยู่ใน n8n Function Nodes ทั้งหมด
4. เพิ่ม Node `Load Prompt Template` ก่อนทุก Nodeที่เรียก AI API
5. เพิ่มการรัน `sanitizeMediaPrompt()` หลัง `fillTemplate()` เสมอ
6. ทดสอบด้วย Propertyตัวอย่างทุก Style Tag ก่อน deploy
```

---

ไฟล์ `17_PROMPT_LIBRARY.md` จบสมบูรณ์แล้วครับ

ไฟล์ที่เหลืออยู่ในระบบ AI_BIBLEทั้งหมดที่ยังไม่ได้สร้าง:

| ไฟล์ | หัวข้อ |
| :--- | :--- |
| `18_N8N_IMPLEMENTATION.md` | แผนผัง n8n Workflow จริงทุก Node |
| `19_COST_CALCULATOR.md` | เครื่องคิดต้นทุนจริงต่อวิดีโอ |
| `20_GLOSSARY.md` | คำศัพท์และคำนิยามทั้งหมดของระบบ |

หากต้องการต่อไฟล์ไหนก่อน แจ้งผมได้เลยครับ!