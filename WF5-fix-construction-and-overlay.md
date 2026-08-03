# WF5 Addendum: แก้ 2 จุดที่ขาด (Construction Staging + Data Overlay)

> ไฟล์นี้เป็นส่วนเสริมของ `WF5-media-generation.md`
> อ้างอิงจากการวิเคราะห์คลิปตัวอย่าง: IG `nick.psky` (แบรนด์ P-SKY) — "จากภาพที่ดินแค่ 1 รูป ให้ AI ช่วยทำวีดีโอแบบมืออาชีพ"
>
> **ปัญหาที่พบ**: ระบบตอนนี้ generate วิดีโอทีเดียวจบ (รูปที่ดิน → บ้านเสร็จ) ทำให้ขาด 2 อย่างที่คลิปต้นแบบมี:
> 1. ไม่มีขั้นตอนการก่อสร้าง (construction progression)
> 2. ไม่มีการ์ดข้อมูล/ทำเลโผล่ขึ้นมาหลังสร้างเสร็จ
>
> **Root cause**: ทั้งสองอย่างนี้ **ไม่ใช่สิ่งที่ AI video model (Kling/Higgsfield) สร้างให้เอง** มันเป็นคนละ layer ที่ต้อง compose เพิ่มทีหลัง

---

## ส่วนที่ 1: Construction Staging (แก้ 5.4 Construction Simulation)

### ปัญหาปัจจุบัน
ระบบส่ง prompt เดียวเข้า image-to-video engine (เช่น "ที่ดินเปล่า กลายเป็นบ้านสร้างเสร็จ") ทำให้ AI ข้ามขั้นตอนกลางไปเลย ไม่มีภาพช่วงก่อสร้าง

### วิธีแก้: สร้างเป็น Multi-Stage Image Sequence ก่อน แล้วค่อยต่อเป็นวิดีโอ

**อย่า generate วิดีโอทีเดียว ให้ generate ภาพนิ่งทีละ stage ก่อน (ด้วย SDXL/Flux) แล้วค่อยเอาลำดับภาพไปเข้า image-to-video (Kling)**

#### 5.4.1 Stage Definition (ต้องมีอย่างน้อย 5 stage)

| Stage | ชื่อ | รายละเอียดภาพที่ต้อง generate | สัดส่วนความยาวในคลิป |
|---|---|---|---|
| 0 | ที่ดินต้นฉบับ | รูปจริงที่ user อัปโหลด (ไม่ generate) | 1-2 วิ |
| 1 | เคลียร์พื้นที่ / ตอกเสาเข็ม | พื้นที่เปล่า มีเสาเข็ม/ฐานราก โผล่จากพื้น มีรถขุด/ปั้นจั่นอยู่ในภาพ | 1-2 วิ |
| 2 | โครงสร้างเสา-คาน | โครงสร้างคอนกรีตเสา-คาน ยังไม่มีผนัง เห็นเหล็กเสริม | 1-2 วิ |
| 3 | ผนัง + หลังคา | มีผนังก่ออิฐ/มีหลังคาโครงแล้ว ยังไม่ทาสี | 1-2 วิ |
| 4 | ตกแต่งภายนอก | ทาสี ปูพื้น ทำสวน รั้ว ใกล้เสร็จ | 1-2 วิ |
| 5 | บ้านเสร็จสมบูรณ์ | บ้านสมบูรณ์ 100% แสงสวย (golden hour) | 2-3 วิ |

#### 5.4.2 Prompt Template สำหรับแต่ละ Stage (ใช้กับ SDXL/Flux)

```
Base context (ใส่ทุก prompt เพื่อคุม consistency):
"same plot of land, same camera angle as original photo,
[STYLE] house, photorealistic, real estate marketing photo"

Stage 1 (ฐานราก): "...construction site, concrete pile foundation
just poured, excavator on site, exposed rebar, dirt ground,
overcast site photo"

Stage 2 (โครงสร้าง): "...concrete column and beam structure,
no walls yet, exposed steel reinforcement, construction in progress"

Stage 3 (ผนัง+หลังคา): "...brick walls being built, roof frame
installed, unpainted, scaffolding visible"

Stage 4 (ตกแต่ง): "...exterior painting finished, driveway paved,
landscaping in progress, nearly complete"

Stage 5 (เสร็จ): "...completed [STYLE] house, painted, landscaped,
golden hour lighting, professional real estate photography"
```

> ⚠️ **สำคัญ**: ต้อง fix seed หรือใช้ ControlNet/image-reference จากภาพต้นฉบับ เพื่อให้มุมกล้อง/ตำแหน่งที่ดินเหมือนกันทุก stage ไม่งั้นภาพจะกระโดดไม่ต่อเนื่อง

#### 5.4.3 ต่อภาพเป็นวิดีโอ (5.5 Image to Video)
- นำภาพ Stage 0-5 (6 ภาพ) เรียงเป็น sequence
- ใช้ Kling ทำ transition/motion ระหว่างแต่ละคู่ภาพ (stage N → stage N+1) แยกเป็นคลิปสั้น 2-3 วิ ต่อคู่
- ต่อคลิปทั้งหมดด้วย FFMPEG พร้อม cross-fade ระหว่าง stage (0.3-0.5 วิ)

#### 5.4.4 โครงสร้างโค้ดที่แนะนำ
```
generateConstructionSequence(landPhoto, houseStyle):
  stages = []
  for stage in [1, 2, 3, 4, 5]:
    prompt = buildStagePrompt(stage, houseStyle, landPhoto)
    image = imageEngine.generate(prompt, referenceImage=landPhoto)
    stages.append(image)

  clips = []
  for i in range(len(stages) - 1):
    clip = videoEngine.imageToVideo(stages[i], stages[i+1], duration=2.5)
    clips.append(clip)

  return ffmpeg.concatWithCrossfade(clips)
```

---

## ส่วนที่ 2: Data Overlay System (แก้ 5.6/5.8 — การ์ดข้อมูลที่หายไป)

### ปัญหาปัจจุบัน
ระบบคาดหวังให้ AI video model "รู้" ข้อมูลทำเล/ราคา/เบอร์โทร แล้วใส่ลงในวิดีโอเอง — **เป็นไปไม่ได้** เพราะ Kling/Higgsfield เป็นแค่ image/video generator ไม่มีความรู้เกี่ยวกับ property database ของคุณ

### วิธีแก้: สร้างเป็น Overlay Layer แยกต่างหาก แล้ว compose ทับวิดีโอด้วย FFMPEG (เหมือนคลิปต้นแบบ P-SKY)

ต้องมี **2 การ์ดหลัก** ตามที่เห็นในคลิปตัวอย่าง:

### 2.1 การ์ด "ทำเลดี" (Location Info Card)

**ปรากฏช่วงกลางคลิป** (หลัง house visualization เสร็จ, ก่อนราคา)

**ข้อมูลที่ต้องดึงจาก DB/API:**
```json
{
  "headline": "ที่ดินทำเลดี",
  "subheadline": "เดินทางสะดวก ใกล้แหล่งสำคัญ",
  "nearby_places": [
    {"name": "Central Plaza", "icon": "mall", "distance": "6 กิโลเมตร"},
    {"name": "Central Eastville", "icon": "mall", "distance": "3.5 กิโลเมตร"},
    {"name": "รถไฟฟ้าสายสีเหลือง สถานีภาวนา", "icon": "train", "distance": "1.7 กิโลเมตร"},
    {"name": "โรงพยาบาลเปาโล โชคชัยสี่", "icon": "hospital", "distance": "900 เมตร"},
    {"name": "วัดลาดพร้าว", "icon": "temple", "distance": "800 เมตร"}
  ],
  "footer_note": "ทำเลดี เหมาะสำหรับสร้างบ้าน หรือทำโครงการ"
}
```

**Source ของข้อมูลนี้**: ต้องมาจาก **Workflow 2 (ดึงข้อมูลสถานที่)** ที่ใช้ Google Maps Places API / Nearby Search + Directions API (คำนวณระยะทาง) — เป็นข้อมูลที่ WF2 ควรจะมีอยู่แล้ว แต่ยังไม่ได้ pass ต่อเข้ามาที่ WF5 ให้ทำ overlay

**Icon ที่ต้องเตรียมไว้ล่วงหน้า** (SVG/PNG ชุดเดียว reuse ได้): ห้าง, รถไฟฟ้า/BTS/MRT, โรงพยาบาล, วัด, โรงเรียน, ปั๊มน้ำมัน, ตลาด

### 2.2 การ์ดปิดท้าย "เจ้าของขายเอง" (Ending Card)

**ปรากฏ 5-8 วินาทีสุดท้าย** (ตามที่ระบุใน WF5 หลักอยู่แล้ว ข้อ 5.8 — แต่ยังไม่ได้ implement)

**ข้อมูลที่ต้องดึงจาก DB:**
```json
{
  "badge": "เจ้าของขายเอง",
  "size": "100 ตร.ว.",
  "price": "8.5 ล้านบาท",
  "contact": {
    "line_id": "PSKY_Sample",
    "phone": "XXX-XXXX-XXXX"
  },
  "original_listing_photo": "url_to_original_photo_with_sign"
}
```

**Layout**: แถบสีแดงด้านซ้าย + กล่องข้อมูลติดต่อสีขาวด้านล่าง ทับบนภาพที่ดิน/บ้าน

### 2.3 โครงสร้างไฟล์ Template ที่แนะนำ

ทำเป็น **HTML/CSS template แล้ว render เป็นภาพ PNG โปร่งใส (transparent overlay)** ก่อน แล้วค่อยเอาไป composite ทับวิดีโอด้วย FFMPEG — ง่ายกว่าเขียน FFmpeg drawtext ตรงๆ มาก และแก้ layout ได้ง่าย

```
templates/
  location-card.html      ← รับ JSON data, render ด้วย headless browser (Puppeteer)
  ending-card.html         ← เช่นกัน
  overlay-icons/           ← icon SVG ชุด mall, train, hospital, temple, school

pipeline:
  1. renderHTMLtoPNG(location-card.html, propertyData) → location_card.png (มี alpha channel)
  2. renderHTMLtoPNG(ending-card.html, propertyData) → ending_card.png
  3. ffmpeg -i base_video.mp4 -i location_card.png -i ending_card.png
     -filter_complex "[0][1]overlay=enable='between(t,12,17)'[v1];
                       [v1][2]overlay=enable='between(t,23,28)'[out]"
     -map "[out]" final.mp4
```

### 2.4 โครงสร้างโค้ดที่แนะนำ (รวมทั้ง 2 การ์ด)

```
generateOverlays(propertyData):
  nearbyPlaces = googleMapsAPI.getNearbyPlaces(propertyData.lat, propertyData.lng)
  # ควรมาจาก cache ของ WF2 อยู่แล้ว ไม่ต้อง call ใหม่

  locationCardPNG = renderTemplate('location-card.html', {
    nearbyPlaces: nearbyPlaces,
    note: aiGeneratedNote  # จาก WF4
  })

  endingCardPNG = renderTemplate('ending-card.html', {
    size: propertyData.size,
    price: propertyData.price,
    lineId: propertyData.contact.line,
    phone: propertyData.contact.phone
  })

  return { locationCardPNG, endingCardPNG }

composeOverlays(baseVideo, overlays, timing):
  return ffmpeg.overlay(baseVideo, [
    { image: overlays.locationCardPNG, start: timing.locationStart, end: timing.locationEnd },
    { image: overlays.endingCardPNG, start: videoDuration - 6, end: videoDuration }
  ])
```

---

## สรุป: WF5 Pipeline ที่แก้ไขแล้ว (เพิ่มจากเดิม)

```
5.1 Satellite Zoom
      ↓
5.2 Drone Animation
      ↓
5.3 House Visualization (AI Generate ภาพนิ่ง "เสร็จสมบูรณ์" — เก็บไว้ใช้ท้าย sequence)
      ↓
5.4 Construction Simulation  ⭐ แก้ใหม่
      → 5.4.1 Generate 5 stage images (SDXL/Flux, fix reference/seed)
      → 5.4.2 Image-to-video ต่อระหว่าง stage (Kling)
      → 5.4.3 Concat + cross-fade (FFMPEG)
      ↓
5.5 Image to Video (ส่วนอื่นๆ ที่ไม่ใช่ construction เช่น drone fly-over)
      ↓
5.6 Add Subtitle
      ↓
   ⭐ NEW: Overlay Location Card (compose ทับช่วงกลางคลิป)
      ↓
5.7 Add BGM & Voice
      ↓
5.8 Final Render
      → ⭐ NEW: Overlay Ending Card (compose ทับ 5-8 วิสุดท้าย)
      → รวมทุกคลิป + Export 9:16 / 16:9
```

## Checklist สำหรับ Claude Code

- [ ] เขียนฟังก์ชัน `generateConstructionSequence()` แยก 5 stage ไม่ generate ทีเดียวจบ
- [ ] ใช้ reference image / fix seed เพื่อคุมความต่อเนื่องของมุมกล้องระหว่าง stage
- [ ] สร้าง HTML template 2 ไฟล์: `location-card.html`, `ending-card.html`
- [ ] เขียนฟังก์ชัน render HTML → PNG โปร่งใส (แนะนำ Puppeteer หรือ Playwright)
- [ ] เชื่อมข้อมูล nearby places จาก WF2 (Google Maps cache) เข้ามาที่ WF5 — ตอนนี้ WF5 ยังไม่ได้รับข้อมูลนี้
- [ ] เขียนฟังก์ชัน FFMPEG overlay ที่ compose การ์ดทับวิดีโอ ณ ช่วงเวลาที่กำหนด
- [ ] เก็บ template เป็น config แยกจากโค้ด เพื่อให้ปรับ layout/สีแบรนด์ได้ทีหลังโดยไม่แก้โค้ด
