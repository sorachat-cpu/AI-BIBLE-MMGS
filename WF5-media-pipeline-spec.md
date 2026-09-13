# WF5 — Media Generation Pipeline Spec
## Real Estate AI Automation Platform | Master Document

**เวอร์ชัน:** 3.0 (ฉบับรวม — แทนที่ไฟล์เก่าทั้งหมด)
**ครอบคลุม:** Sub-step 5.1–5.8 ทั้งหมด
**Engine:** `VIDEO_ENGINE=kling` · `IMAGE_ENGINE=flux` (Higgsfield 🔴 pending credit)
**คู่กับ:** `WF5-overlay-system.md` (Layer การ์ดข้อมูล) · `WF8-photo-narration-voiceclone.md`

> **ไฟล์นี้แทนที่:** `WF5_Kling_Prompt_Template.md` (v1), `WF5_Kling_Prompt_Spec_v2.md`,
> และส่วนที่ 1 ของ `WF5-fix-construction-and-overlay.md` — ลบทั้ง 3 ไฟล์ได้

---

## 0. ข้อผิดพลาดที่เคยทำ — อย่าทำซ้ำ

| ข้อผิดพลาด | ทำไมถึงผิด | ที่ถูกคือ |
|---|---|---|
| ใส่ `--ar 9:16 --duration 5s` ในช่อง prompt | เป็น syntax ของ Midjourney — Kling รับเป็น API parameter แยก ถ้าพิมพ์ลงไปจะถูกอ่านเป็นข้อความธรรมดาไปกวน output | ตั้งใน `aspect_ratio` / `duration` ของ API payload |
| บรรยายลักษณะบ้าน/วัสดุ/สี ใน video prompt | WF5 เป็น image-to-video — ภาพ input บอกลักษณะไปแล้ว เขียนซ้ำ = โมเดลแย่งกันตีความ ภาพเพี้ยน | ลักษณะอยู่ที่ Image Layer เท่านั้น |
| ใส่ camera move หลายอันในคลิปเดียว | Kling ทำได้ดีแค่ 1 move/คลิป มากกว่านั้นภาพกระตุกและบิด | แยกคลิป แล้ว xfade ต่อ |
| ระบุ `duration=2.5` / `6s` / `8s` | Kling รองรับ **5s / 10s** เท่านั้น (บาง endpoint ยืดหยุ่นกว่า ต้องเช็ค) | generate 5s แล้วเร่งด้วย `setpts` |
| เปลี่ยนแสงระหว่าง construction stage (stage 1 = overcast, stage 5 = golden hour) | แสงกระโดดทำลายความต่อเนื่อง แม้ fix seed แล้วก็ตาม | ล็อกแสงเดียวทั้ง 6 ภาพ |
| `8k detail`, `photorealistic`, `cinematic` ใน video prompt | ไม่มีผลกับ motion model เป็นคำสำหรับ image model | ใส่ที่ Image Layer |
| ระบุ lighting ใน video prompt ทับภาพที่มีแสงอยู่แล้ว | โมเดลพยายามประนีประนอมสองอย่าง ผลลัพธ์เพี้ยน | ไม่พูดถึงแสงใน Motion Layer |

---

## 1. หลักการสถาปัตยกรรม: 3 Layer

```
┌───────────────────────────────────────────────────────────┐
│ LAYER 1 — IMAGE  (SDXL / Flux)                            │
│ ที่อยู่ของ "ตัวแปรปัจเจก" ทั้งหมด                              │
│ ทรงบ้าน · วัสดุ · สี · บริบท · แสง · มุมกล้อง · stage ก่อสร้าง  │
│ → เปลี่ยนได้อิสระตามแต่ละทรัพย์                                │
└───────────────────────────────────────────────────────────┘
                    ↓ ส่งภาพเป็น input
┌───────────────────────────────────────────────────────────┐
│ LAYER 2 — MOTION  (Kling)                                 │
│ ที่อยู่ของ "คำศัพท์การเคลื่อนไหว" ที่ตายตัว                      │
│ กล้องขยับยังไง + อะไรในเฟรมขยับ เท่านั้น                       │
│ → ห้ามบรรยายลักษณะซ้ำ ห้ามพูดถึงแสง                          │
└───────────────────────────────────────────────────────────┘
                    ↓ ส่งวิดีโอเป็น input
┌───────────────────────────────────────────────────────────┐
│ LAYER 3 — DATA OVERLAY  (HTML → PNG → FFmpeg)             │
│ การ์ดทำเล · การ์ดปิดท้าย · ซับไตเติล                          │
│ → ไม่ใช่ AI generation เลย ดูรายละเอียดใน                     │
│   WF5-overlay-system.md                                   │
└───────────────────────────────────────────────────────────┘
```

**กฎข้อเดียวที่ต้องจำ**
> คำนี้ตอบว่า **"หน้าตายังไง"** → Layer 1
> คำนี้ตอบว่า **"ขยับยังไง"** → Layer 2
> คำนี้เป็น **ข้อมูลจาก database** → Layer 3

---

## 2. LAYER 1 — Image Prompt Spec (SDXL / Flux)

### 2.1 โครงสร้าง Fixed

```
{SHOT_TYPE} of a {HOUSE_STYLE} house,
{MATERIAL_FACADE},
{ENVIRONMENT},
{LIGHTING}, {TIME_OF_DAY},
photorealistic architectural visualization, professional real estate photography,
sharp focus, high detail, natural color grading
```

### 2.2 Negative Prompt (Fixed — ใช้ทุกครั้ง)

```
cartoon, illustration, cgi render look, distorted perspective, warped windows,
text, watermark, logo, people, oversaturated, fisheye, tilted horizon,
extra floors, floating objects
```

### 2.3 ตัวแปรปัจเจก (เปลี่ยนได้ตามทรัพย์)

| ตัวแปร | ค่าที่ใช้ได้ |
|---|---|
| `SHOT_TYPE` | `Aerial top-down shot` · `Drone establishing shot` · `Front elevation shot` · `Three-quarter exterior view` |
| `HOUSE_STYLE` | `modern minimalist` · `Thai contemporary` · `tropical resort` · `Nordic style` · `loft industrial` · `classic colonial` · `Thai traditional gable roof` |
| `MATERIAL_FACADE` | `white stucco with teak wood accents` · `exposed concrete and glass` · `red brick and black steel` · `light grey render with large windows` |
| `ENVIRONMENT` | `on an open land plot with grass` · `in a gated village with paved road` · `surrounded by mature trees` · `near rice fields with mountain backdrop` |
| `LIGHTING` | `golden hour warm side lighting` · `soft overcast diffused light` · `bright midday sun` · `blue hour twilight with interior lights on` |
| `TIME_OF_DAY` | `sunrise` · `midday` · `late afternoon` · `dusk` |

> เก็บชุดค่าเหล่านี้เป็น `image-variables.json` แยกจากโค้ด เพื่อเพิ่มสไตล์บ้านใหม่ได้โดยไม่แก้ logic

---

## 3. Construction Staging (5.4) — Image Layer

### 3.1 ปัญหาที่กำลังแก้

ระบบเดิมส่ง prompt เดียว ("ที่ดินเปล่า → บ้านเสร็จ") ให้ video model ทำให้ AI ข้ามขั้นตอนกลางไปหมด ไม่มีภาพช่วงก่อสร้าง
**วิธีแก้:** generate ภาพนิ่งทีละ stage ก่อน แล้วค่อยเอาไปต่อเป็นวิดีโอ

### 3.2 Stage Definition (6 ภาพ)

| Stage | ชื่อ | ที่มา | Stage Descriptor |
|---|---|---|---|
| 0 | ที่ดินต้นฉบับ | รูปจริงที่ user อัปโหลด (ไม่ generate) | — |
| 1 | ฐานราก / เสาเข็ม | generate | `construction site, concrete pile foundation just poured, excavator on site, exposed rebar, bare dirt ground` |
| 2 | โครงสร้างเสา-คาน | generate | `concrete column and beam frame structure, no walls, exposed steel reinforcement` |
| 3 | ผนัง + หลังคา | generate | `brick walls partially built, roof truss installed, unpainted, scaffolding` |
| 4 | ตกแต่งภายนอก | generate | `exterior paint finished, driveway paved, landscaping in progress` |
| 5 | บ้านเสร็จสมบูรณ์ | generate | `fully completed house, painted, landscaped, fence installed` |

### 3.3 Consistency Control (จุดที่พังง่ายที่สุด)

```
✅ ต้องทำ:
- fix seed เดียวกันทั้ง 5 stage
- ใช้ภาพที่ดินจริง (stage 0) เป็น reference
  → img2img strength 0.35–0.50  หรือ  ControlNet Depth / Canny
- ใส่ base context ทุก stage:
  "same plot of land, identical camera position and angle as reference photo"
- ล็อก SHOT_TYPE / ENVIRONMENT / LIGHTING / TIME_OF_DAY ให้เหมือนกันทั้ง 6 ภาพ

❌ ห้ามทำ:
- เปลี่ยนแสงระหว่าง stage (เช่น stage 1 overcast → stage 5 golden hour)
  → แสงกระโดด ทำลายความต่อเนื่อง แม้ fix seed แล้ว
- เปลี่ยนมุมกล้องระหว่าง stage
- generate stage แบบขนาน (parallel) โดยไม่ล็อก seed
```

> **แสงสวยๆ ไปอยู่ที่ 5.3** — ภาพบ้านเสร็จสำหรับใช้ปิดท้าย generate แยกต่างหากด้วย golden hour ได้เต็มที่ ไม่ต้องยัดเข้า construction sequence

### 3.4 Prompt เต็มของ Stage (ตัวอย่าง Stage 3)

```
Front elevation shot of a modern minimalist house,
brick walls partially built, roof truss installed, unpainted, scaffolding,
on an open land plot with grass,
soft overcast diffused light, midday,
same plot of land, identical camera position and angle as reference photo,
photorealistic architectural visualization, professional real estate photography,
sharp focus, high detail, natural color grading

[negative: ตามข้อ 2.2]
[seed: 84213  ← ค่าเดียวกันทั้ง 6 ภาพ]
[reference: stage_0.jpg, strength 0.42]
```

---

## 4. LAYER 2 — Kling Motion Spec

### 4.1 โครงสร้าง Fixed (3 บรรทัดเท่านั้น)

```
บรรทัด 1 → การเคลื่อนไหวของกล้อง (1 move เท่านั้น)
บรรทัด 2 → ambient motion (บังคับมี ไม่งั้นภาพดูแข็งเหมือน AI)
บรรทัด 3 → pacing / คุณภาพการเคลื่อนไหว
```

### 4.2 Negative Prompt (Fixed — ทุกคลิป)

```
distorted architecture, warped windows, melting walls, morphing structure,
text, watermark, people appearing, flickering, jitter, rapid camera shake
```

### 4.3 API Parameters (ตั้งแยก — ห้ามพิมพ์ในช่อง prompt)

```json
{
  "mode": "pro",
  "aspect_ratio": "9:16",
  "duration": 5,
  "cfg_scale": 0.5,
  "negative_prompt": "<ตามข้อ 4.2>"
}
```

| Parameter | ค่า | หมายเหตุ |
|---|---|---|
| `aspect_ratio` | `9:16` TikTok/Reels/Shorts · `16:9` YouTube/Website · `1:1` Feed | **ต้องตรงกับสัดส่วนภาพ input** ไม่งั้นถูก crop เพี้ยน |
| `duration` | `5` หรือ `10` | ไม่มี 2.5 / 6 / 8 |
| `mode` | `std` = draft · `pro` = final | ใช้ std ตอน test เพื่อประหยัดเครดิต |
| `cfg_scale` | `0.3–0.5` | ต่ำ = อิสระมาก, สูง = ยึดภาพ input มาก |

### 4.4 Motion Vocabulary ตาม Sub-step (Copy ไปวางได้เลย)

#### 5.1 Satellite Zoom
```
Camera slowly pulls back and rises, revealing the surrounding area.
Thin clouds drift slowly across the frame, subtle atmospheric haze.
Steady, continuous motion at constant speed.
```
`duration: 5` · `cfg_scale: 0.5`

#### 5.2 Drone Animation
```
Camera orbits slowly to the right around the property at a fixed altitude.
Tree leaves sway gently in the breeze, clouds drift in the sky.
Smooth cinematic drone movement, no altitude change.
```
`duration: 5` · `cfg_scale: 0.4`
> อยากได้ทั้ง orbit และ descend → แยก 2 คลิป แล้ว xfade ต่อ

#### 5.3 House Visualization
```
Camera pushes in slowly toward the front entrance, locked level, steady dolly.
Foliage in the foreground sways slightly, light shifts subtly across the facade.
Slow, controlled forward motion.
```
`duration: 5` · `cfg_scale: 0.5`

#### 5.4 Construction Simulation — **Start Frame + End Frame Mode**
```
Time-lapse transition, camera holds completely still on a locked tripod.
The structure progressively builds up from the ground.
Clouds move quickly across the sky, shadows sweep across the ground.
```
`duration: 5` · `cfg_scale: 0.5`
**โหมด:** stage N = start frame, stage N+1 = end frame
**ทำ 5 คู่:** 0→1, 1→2, 2→3, 3→4, 4→5

#### 5.5 Image to Video (parallax ทั่วไป)
```
Slow parallax drift from left to right, camera locked level.
Grass and foliage move gently, subtle atmospheric haze in the distance.
Minimal, calm motion.
```
`duration: 5` · `cfg_scale: 0.4`

---

## 5. Timing Budget — ปัญหา 5s ขั้นต่ำ

Kling คืนคลิปสั้นสุด 5 วินาที แต่ construction ต้องการ stage ละ 1–2 วิ
5 คู่ × 5s = **25 วินาที ยาวเกินไปสำหรับ TikTok**

### 5.1 วิธีแก้: เร่งความเร็วด้วย FFmpeg

```bash
# 5s → 2.5s  (setpts = 0.5)
ffmpeg -y -i stage_clip_01.mp4 -filter:v "setpts=0.5*PTS" -an stage_fast_01.mp4

# 5s → 1.67s (setpts = 0.333) สำหรับ stage กลางที่ต้องการเร็วกว่า
ffmpeg -y -i stage_clip_02.mp4 -filter:v "setpts=0.333*PTS" -an stage_fast_02.mp4
```

> การเร่งไม่ทำให้ดูผิดธรรมชาติ เพราะ construction sequence ควรเป็น time-lapse อยู่แล้ว
> **ข้อยกเว้น:** คลิป 5.2 / 5.3 ที่เป็น drone/dolly **ห้ามเร่งเกิน ±10%** ไม่งั้นดูรีบและเวียนหัว

### 5.2 งบเวลาที่แนะนำ (คลิป 9:16 รวม ~35 วินาที)

| ช่วง | เนื้อหา | ความยาว | setpts |
|---|---|---|---|
| 0–5s | 5.1 Satellite Zoom | 5.0s | 1.0 |
| 5–10s | 5.2 Drone Animation | 5.0s | 1.0 |
| 10–20s | 5.4 Construction (5 คู่) | 10.0s | 0.4 (5s→2s ต่อคู่) |
| 20–25s | 5.3 House Visualization | 5.0s | 1.0 |
| 25–29s | Location Card overlay | 4.0s | — |
| 29–35s | Ending Card overlay | 6.0s | — |

---

## 6. Concat & Cross-fade

```bash
# ต่อทีละคู่ (offset = ความยาวคลิปแรก - duration ของ xfade)
ffmpeg -y -i clip_a.mp4 -i clip_b.mp4 \
  -filter_complex "[0][1]xfade=transition=fade:duration=0.4:offset=4.6" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p out.mp4
```

**สำหรับ construction sequence** ใช้ xfade สั้นกว่า (0.25s) เพราะคลิปสั้นและเป็น time-lapse
**ระวัง:** ทุกคลิปต้อง fps และ resolution เท่ากันก่อน xfade ไม่งั้น filter จะ error
```bash
# normalize ก่อนเสมอ
ffmpeg -y -i in.mp4 -vf "fps=30,scale=1080:1920:flags=lanczos" -c:v libx264 -crf 20 norm.mp4
```

---

## 7. Pipeline สรุป

```
5.1 Satellite Zoom          [Image? ใช้ภาพดาวเทียม → Kling motion]
      ↓
5.2 Drone Animation         [Kling motion จากภาพ 5.1]
      ↓
5.3 House Visualization     [Flux generate บ้านเสร็จ golden hour → Kling dolly]
      ↓
5.4 Construction Simulation
      → 5.4.1 Flux generate stage 1-5 (fix seed + reference + แสงเดียว)
      → 5.4.2 Kling start/end frame ทำ 5 คู่ (5s each)
      → 5.4.3 setpts เร่งเป็น 2s/คู่
      → 5.4.4 concat + xfade 0.25s
      ↓
5.5 Image to Video          [คลิปเสริมอื่นๆ]
      ↓
5.6 Add Subtitle            → ดู WF5-overlay-system.md
      ↓
   Overlay: Location Card   → ดู WF5-overlay-system.md
      ↓
5.7 Add BGM & Voice
      ↓
5.8 Final Render
      → Overlay: Ending Card
      → Export 9:16 + 16:9
```

---

## 8. โครงสร้างโค้ดที่แนะนำ

```
generateConstructionSequence(landPhoto, houseStyle, lockedLighting, seed):
  stages = [landPhoto]                          # stage 0 = ภาพจริง

  for stage in [1, 2, 3, 4, 5]:
    prompt = buildImagePrompt(
      shotType    = LOCKED.shotType,
      houseStyle  = houseStyle,
      descriptor  = STAGE_DESCRIPTORS[stage],
      environment = LOCKED.environment,
      lighting    = lockedLighting,             # ← ค่าเดียวทุก stage
      timeOfDay   = LOCKED.timeOfDay
    )
    img = imageEngine.generate(
      prompt, negative=IMAGE_NEGATIVE,
      seed=seed,                                # ← ค่าเดียวทุก stage
      reference=landPhoto, strength=0.42
    )
    stages.append(img)

  clips = []
  for i in range(len(stages) - 1):
    raw = videoEngine.imageToVideo(
      startFrame = stages[i],
      endFrame   = stages[i+1],
      prompt     = MOTION_VOCAB['5.4'],
      negative   = MOTION_NEGATIVE,
      duration   = 5,                           # ← Kling รับแค่ 5/10
      aspectRatio= config.aspectRatio,
      cfgScale   = 0.5
    )
    clips.append(ffmpeg.speedUp(raw, factor=0.4))   # 5s → 2s

  return ffmpeg.concatWithCrossfade(clips, xfade=0.25)
```

---

## 9. Environment Variables

```env
# Engine selection
VIDEO_ENGINE=kling
IMAGE_ENGINE=flux

# Kling
KLING_MODE=pro
KLING_DEFAULT_DURATION=5
KLING_CFG_SCALE=0.5
KLING_NEGATIVE_PROMPT="distorted architecture, warped windows, melting walls, morphing structure, text, watermark, people appearing, flickering, jitter, rapid camera shake"

# Image
IMAGE_NEGATIVE_PROMPT="cartoon, illustration, cgi render look, distorted perspective, warped windows, text, watermark, logo, people, oversaturated, fisheye, tilted horizon, extra floors, floating objects"
IMAGE_REF_STRENGTH=0.42

# Construction
CONSTRUCTION_STAGES=5
CONSTRUCTION_SPEED_FACTOR=0.4
CONSTRUCTION_XFADE=0.25

# Output
OUTPUT_PRIMARY_RATIO=9:16
OUTPUT_SECONDARY_RATIO=16:9
OUTPUT_FPS=30
```

**Config files ที่ต้องแยกจากโค้ด:**
```
config/
  motion-vocabulary.json     ← Kling motion prompt 5 ชุด
  image-variables.json       ← ตัวเลือก HOUSE_STYLE / MATERIAL / ENVIRONMENT
  stage-descriptors.json     ← descriptor ของ construction stage 1-5
  timing-budget.json         ← งบเวลาแต่ละช่วง
```

---

## 10. Pre-flight Checklist (ก่อนยิงเข้า Kling ทุกครั้ง)

- [ ] Prompt **ไม่มี** คำบรรยายลักษณะบ้าน/วัสดุ/สี/แสง
- [ ] Prompt มี **camera move เดียว**
- [ ] Prompt มี **ambient motion อย่างน้อย 1 อย่าง** (ใบไม้ · เมฆ · แสง · หมอก)
- [ ] **ไม่มี** `--ar` หรือ `--duration` ในช่อง prompt
- [ ] `aspect_ratio` ตรงกับสัดส่วนภาพ input
- [ ] `duration` = 5 หรือ 10 เท่านั้น
- [ ] `negative_prompt` ถูกส่งไปด้วย
- [ ] ภาพ input ด้านยาว ≥ 1024px
- [ ] Construction: ทุก stage ใช้ **seed เดียว + แสงเดียว + มุมกล้องเดียว**
- [ ] คลิปทั้งหมด normalize fps/resolution ก่อน xfade

---

## 11. Checklist สำหรับ Claude Code

- [ ] `generateConstructionSequence()` แยก 5 stage ไม่ generate ทีเดียวจบ
- [ ] ล็อก seed + reference image + lighting ให้เหมือนกันทุก stage
- [ ] `speedUp()` ใช้ `setpts` ปรับคลิป Kling 5s ให้ตรงงบเวลา
- [ ] `normalize()` ปรับ fps/resolution ก่อน xfade ทุกครั้ง
- [ ] Motion vocabulary อ่านจาก `motion-vocabulary.json` ไม่ hardcode
- [ ] Engine abstraction: `videoEngine.imageToVideo()` ต้องสลับ kling ↔ higgsfield ได้ด้วย env var เดียว
- [ ] Retry logic: Kling job fail → retry 1 ครั้ง → fallback เป็น Ken Burns (`zoompan`)
- [ ] ลบไฟล์ชั่วคราวหลังจบ job (VPS พื้นที่จำกัด)
- [ ] Log seed + prompt + job_id ทุกครั้ง เพื่อ reproduce ได้

---

## 12. Standing Instruction สำหรับ Claude

ทุกครั้งที่มีการขอ prompt สำหรับ WF5 Claude ต้อง:

1. **ระบุก่อนว่าเป็น Layer ไหน** (Image / Motion / Overlay) — ไม่ผสมกัน
2. ใช้ Motion Vocabulary จากข้อ 4.4 **ตรงตัว** ไม่คิดใหม่
3. รับตัวแปรปัจเจกเฉพาะที่ Layer 1
4. **เตือนทันที** ถ้าคำขอละเมิด Pre-flight Checklist ข้อใดข้อหนึ่ง
5. ถ้าขอ camera move > 1 → เสนอแยกคลิป ไม่ยัดรวม
6. ถ้าขอ duration ที่ไม่ใช่ 5/10 → เสนอ generate 5s + setpts
7. เมื่อ Higgsfield กลับมาใช้ได้ → map motion vocabulary ชุดเดิม ไม่เขียนใหม่

---

## 13. ต้องยืนยันก่อน Deploy

Kling เปลี่ยนเวอร์ชันและ API บ่อย (2.6 / 3.0 / O1 มี parameter ต่างกัน) ก่อน hardcode ให้เช็ค docs ของ endpoint ที่เรียกจริง:

- **ช่วง duration ที่รองรับ** — บาง endpoint ยืดหยุ่นกว่า 5/10 ถ้าใช่จะไม่ต้อง setpts
- **ชื่อ field ของ negative prompt** — `negative_prompt` vs `no`
- **รองรับ start/end frame หรือไม่** — จำเป็นมากสำหรับ 5.4 ถ้าไม่รองรับต้องเปลี่ยนวิธี
- **cfg_scale range** — บางเวอร์ชันเป็น 0–1 บางเวอร์ชันเป็น 0–10
