# WF 3-WF — บันทึกการทำจริง (Implementation Notes)

> **ไฟล์นี้ไม่ใช่สเปค** สเปคอยู่ที่ `WF-REALESTATE-3WF-SPEC.md` ซึ่ง**ห้ามแก้ไข**
> ไฟล์นี้เก็บเฉพาะสิ่งที่ทดสอบจริงแล้ว: ข้อจำกัดที่เจอ ค่าที่ใช้ได้ และของที่ทำเสร็จแล้ว
> อัปเดตล่าสุด 2026-08-25

---

## 1. ข้อจำกัดที่พิสูจน์จากการรันจริง

ทั้งหมดนี้ยิง Kling `kling-v1-6` mode=pro ผ่าน `runVideoEngine()` จริง แล้วดึงเฟรมออกมาตรวจด้วยตา

### ✅ `FINAL FRAME = INPUT IMAGE` ทำได้จริง
ส่งรูปที่ดินเป็น `image_tail` → เฟรมสุดท้ายที่ได้ตรงกับ input แทบทุกอย่าง
(ทดสอบ 2 รอบ: รอบแรกอาคาร/ป้าย/น้ำพุ/เส้นจอดรถตรงกันหมด รอบสองต้นไม้ใหญ่/ภูเขา/เสาส่งสัญญาณตรงกันหมด)
→ **MASTER CONTINUITY RULE ของสเปคใช้ได้กับสถาปัตยกรรมปัจจุบัน ไม่ต้องเปลี่ยน provider**

### ❌ ห้ามป้อนภาพแผนที่ที่มี label/หมุด เข้า video model
`pinnedPlotUrl()` คืน `maptype=hybrid` + marker → รูปเต็มไปด้วยตัวหนังสือไทย, ไอคอน POI,
หมุดแดง, ลายน้ำ Google

**โมเดลตีความหมุดและไอคอนเป็นวัตถุจริง แล้วอนิเมตเป็นบอลลูนลอยกลางฟ้า**
prompt เขียน "no pins, no text" ไม่ช่วย เพราะมันติดมากับรูป input แล้ว

→ ต้องใช้ `satelliteZoomUrls()` (`maptype=satellite`, ไม่มี marker) เป็นเฟรมเริ่ม
→ **Location Pin (SCENE 1) ต้องทำเป็น overlay ทับด้วย FFmpeg ไม่ใช่ฝังในรูปที่ส่งให้ AI**

### ❌ duration เคยถูกล็อกไว้ 5 วิ (แก้แล้ว → 10 วิ)
`video-engine.mjs` + `schemas/video.schema.json` เคยจำกัด 3–5 วิ
WF1 มี 4 scene (pin → zoom → clouds → land) ยัดใน 5 วิไม่พอ โมเดลข้าม scene
Kling v1-family รองรับ 10 วิ — ยืนยันแล้วว่าใช้ได้จริง

### ⚠️ Kling บังคับ output เป็นจัตุรัส 1:1 เสมอ
ฝั่งวิดีโอ**ไม่มี param aspect ratio ให้ตั้งเลย** input 16:9 (1280×720) → output 1440×1440
สเปคต้องการ 9:16 → `render-engine.mjs` เดิมใช้ `pad` ทำให้เกิดแถบดำบนล่างข้างละ 420px (44% ของเฟรม)
→ แก้เป็น crop-to-fill (`force_original_aspect_ratio=increase` + `crop`)

### ⚠️ รูปทดสอบ default ไม่ใช่ที่ดินเปล่า
`content/media/LAND-051A3687.jpg` เป็น**อาคารสร้างเสร็จแล้ว** ใช้ทดสอบ WF2 ไม่ได้
→ ใช้ `content/media/LAND-06A8B922.jpg` (ทุ่งโล่ง มีภูเขาหลัง) แทน

---

## 2. 🔒 TPL_VID_010_v1 — ห้ามแก้เพิ่มจังหวะ

**คำสั่งผู้ใช้ (2026-08-25):** prompt ของ WF1 ถูกแก้ไป 2 รอบเพื่อยัดจังหวะเพิ่ม
(FPV dive / เล่าเรื่องหมุดปัก) **แย่ลงทั้งสองรอบ** — โมเดลเริ่มคิดการเคลื่อนไหวเอง
แทนที่จะร่อนลงเฉย ๆ → **ย้อนกลับไปใช้ข้อความเดิม** ซึ่งเป็นมุมกล้องที่ผู้ใช้ยืนยันว่าใกล้ใช้ได้แล้ว

ข้อความที่ใช้อยู่ (ห้ามแก้):
```text
Continuous aerial descent from high above the ground down to the site.
Camera drops steadily through open sky and thin haze,
the view transitioning from a flat overhead perspective into a real photographic
ground-level view of the same location as it descends.
One unbroken falling move that eases to a stop, no cuts, no shake.
Photorealistic drone footage, natural daylight.
No text, no map labels, no pins, no overlays, no watermark.
```

**กฎ**: อยากได้จังหวะเพิ่ม (หมุด, เมฆ, ความเร็ว) → ทำที่ชั้น composite/overlay หรือที่เฟรม anchor
**ห้ามยัดเข้าไปใน prompt** เพราะยิ่งบอกโมเดลหลายจังหวะ มันยิ่งแต่งเอง

---

## 3. ค่าที่ใช้ได้จริง (WF1)

| | |
|---|---|
| เฟรมเริ่ม | `satelliteZoomUrls(geo, key, [16])` + ครอปล่างออก 6% (ตัดลายน้ำ Google) |
| เฟรมจบ | รูปที่ดินจริง ส่งเป็น `image_tail` |
| Template | `TPL_VID_010_v1` (ห้ามแก้) |
| Duration | `10` วินาที |
| Camera | `DRONE_REVEAL` (ถูก Kling ทิ้งเมื่อมี `image_tail` — ไม่มีผล แต่คงไว้ตาม schema) |
| ต้นทุน | $0.16/คลิป |

ลำดับที่ได้จริง ตรงกับ SCENE 3 ของสเปคทุกขั้น:
`ดาวเทียมจริง → ถอยเห็นความโค้งโลก → ผ่านชั้นบรรยากาศ → ทะลุชั้นเมฆ → เริ่มเห็นพื้นดิน+ภูเขา → บินต่ำ motion blur → หยุดที่ทุ่งโล่ง`

---

## 4. สถานะการทำแต่ละ WF

### WF1 — ทำแล้ว (ยังไม่ยิงจริงด้วย prompt เดิม + 10 วิ)
- `src/engines/storyboard.mjs` beat "descent"
- `cleanSatelliteFrame()` — ดาวเทียมสะอาด + ครอปลายน้ำ
- `compositeWf1Pin()` + `templates/wf1-pin.svg` + `renderWf1Pin()`
  หมุดค้างนิ่ง 1.3 วิ → เร่งพุ่งลงพ้นเฟรมแบบ quadratic ใน 0.85 วิ **ไม่มี fade**
  composite ทับ**หลัง**คลิปออกจาก Kling — ทดสอบกับคลิปจริงแล้ว หมุดคมชัด ไม่บิดเบี้ยว
  ถ้า composite ล้ม → ส่งคลิปแบบไม่มีหมุด (สถานะ `degraded`) ไม่ทิ้งคลิปที่จ่ายเงินไปแล้ว

### WF2 — ทำแล้ว (ยังไม่เคยยิงจริง — โควตารูป Kling หมด)
- `src/engines/construction-engine.mjs` `runConstructionScene()`
- **7 ขั้นตามสเปค**: เตรียมพื้นที่ → ฐานราก → โครงสร้าง → หลังคา → ผนัง+ประตูหน้าต่าง → Landscape → เสร็จ
  (เดิมมี 5 ขั้น ขาด "เตรียมพื้นที่" กับ "หลังคา" เลยกระโดดแบบที่สเปคห้าม)
- กฎ **PRESERVE LAND** ใส่ลง `buildStagePrompt()` ทุกขั้น (ห้ามเปลี่ยนภูเขา/ถนน/ต้นไม้/วิว)
- `join: "cut"` — ตัดตรงไม่มี dissolve, `imageFidelity: 0.9` ลด background drift
- ต้นทุน ~$0.098 (7 รูป)

### WF3 — ทำแล้ว ทดสอบแล้ว ใช้งานได้
- `src/engines/wf3-ad.mjs` + `templates/wf3-ad-card.svg` + `renderWf3AdCard()`
- **ไม่ใช้ AI เลย ต้นทุน $0/ครั้ง** — สเปคห้าม AI สร้างราคา/เนื้อที่/ระยะทาง/จุดเด่นอยู่แล้ว
  เฟรมโฆษณาเป็นที่เดียวที่ตัวเลขมั่วคือการโกหกผู้ซื้อจริง → ใช้ sharp + FFmpeg ล้วน ซ้ำได้เป๊ะทุกครั้ง
- Transition ตามสเปค: ภาพนิ่งใบเดียว zoom-out ต่อเนื่อง + การ์ดไถลขึ้นจากขอบล่างแบบ ease-out
  **ไม่มี cut ไม่มี fade**
- จังหวะ: reveal 3.6 วิ → การ์ดไถลขึ้น 0.9 วิ → ค้างนิ่ง 3.2 วิ (สเปคขอ 2–3 วิ) รวม 7.7 วิ · 1080×1920
- Output ครบ: video, final frame, static ad image, caption, `data_used`, `data_omitted`
- API: `POST /api/wf3-ad`

---

## 5. งานที่เหลือ

1. **ยิง WF1 จริงด้วย prompt เดิม + 10 วิ** ($0.16) — ยังไม่เคยรันคู่นี้ เคยรัน prompt เดิมแค่ตอน 5 วิ
2. **ตัวเชื่อม final frame อัตโนมัติ WF1→WF2→WF3** — หัวใจของสเปค ตอนนี้ยังต้องส่งรูประหว่าง WF เอง
   (พิสูจน์แล้วว่า `image_tail` ให้เฟรมสุดท้ายตรง input เป๊ะ เหลือแค่ต่อท่อ)
3. **WF2 ยิงจริง 7 ขั้น** — ต้องเติมโควตารูป Kling ก่อน
4. **ปุ่ม WF3 ในหน้าเว็บ** — มี API แล้วแต่ยังไม่มี UI
5. **พื้นหลังล็อก 100% ใน WF2** — ต้องใช้ masked inpainting ซึ่งยังไม่มี provider ไหนใน repo รองรับ
   (`imageFidelity` เป็นน้ำหนักอิทธิพล ไม่ใช่การล็อก — ลด drift ได้ แต่ไม่การันตี)
