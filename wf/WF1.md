# WF1 — Location Pin → Fast Zoom → ผ่านชั้นเมฆ → เข้าสู่ภาพที่ดินจริง

> สเปคฉบับผู้ใช้ · ห้ามแก้ไขเนื้อหา · แก้ได้เฉพาะเจ้าของสเปค
> ต่อจากนี้: [WF2.md](WF2.md) → [WF3.md](WF3.md)

## FLOW

```text
INPUT
├── Location / GPS
└── TARGET END FRAME = รูปที่ดินจริง

        ↓

SCENE 1
Satellite / Map

        ↓

SCENE 2
Fast Zoom to Location

        ↓

SCENE 3
Descend through clouds

        ↓

SCENE 4
Approach target image

        ↓

FINAL TRANSITION
Generated aerial view
        ↓
Camera angle matches target
        ↓
Perspective matches target
        ↓
Position matches target
        ↓
Blend into target
        ↓

FINAL 0.5–1.0 SEC
EXACT TARGET IMAGE
        ↓
FREEZE / HOLD

        ↓

OUTPUT
WF1 VIDEO
+
EXACT ORIGINAL IMAGE
```

## หน้าที่ของ WF

สร้าง Video Opening สำหรับโฆษณาที่ดิน โดยเริ่มจากมุมมองระดับโลก/พื้นที่กว้าง แล้วเดินทางเข้าหาตำแหน่งที่ดินอย่างรวดเร็ว ก่อน Transition ผ่านชั้นเมฆและจบลงที่ "ภาพที่ดินต้นฉบับ" ซึ่งจะถูกใช้เป็น First Frame สำหรับ WF2

ลำดับภาพต้องให้ความรู้สึกว่า:

> "นี่คือตำแหน่งของที่ดิน → เรากำลังเดินทางเข้าไป → ผ่านชั้นบรรยากาศ → ลงมาถึงที่ดินจริง"

## INPUT

**ข้อมูล Location**
* พิกัด GPS ของแปลง
* ชื่อจังหวัด / อำเภอ / ตำบล
* ชื่อสถานที่สำคัญใกล้เคียง ถ้ามี

**ภาพต้นฉบับ**
* ภาพที่ดินจริง 1 ภาพ
* ภาพต้องเป็นภาพปลายทางของ Video
* ภาพนี้จะต้องถูกนำไปใช้เป็น First Frame ของ WF2

**ข้อมูลเสริม**
* ขนาดที่ดิน / ถนน / จุดเด่น / สถานที่ใกล้เคียง

ข้อมูลที่ไม่ได้ให้มา **ห้ามสร้างขึ้นเอง**

## SCENE 1 — LOCATION PIN

**ระยะเวลา** ประมาณ 1–2 วินาที

เริ่มจากมุมมองแผนที่ / Satellite View จากระดับสูง แสดงตำแหน่งพื้นที่อย่างชัดเจน

ให้มี Location Pin หรือ Marker ปรากฏขึ้นตรงตำแหน่งของทรัพย์สิน — Marker ต้องเป็นจุดนำสายตาหลักของ Scene

**Motion** เริ่มด้วยภาพนิ่งหรือการเคลื่อนที่ช้ามาก จากนั้นให้ Location Pin ปรากฏขึ้น หลังจาก Pin ปรากฏ: เริ่ม Fast Zoom ทันที

## SCENE 2 — EXTREME FAST ZOOM

**ระยะเวลา** ประมาณ 1–2 วินาที

กล้องต้องพุ่งเข้าหาตำแหน่ง Location Pin อย่างรวดเร็ว

ลักษณะ Motion:
* Fast Push In
* Accelerating Zoom
* Smooth Camera Dive
* Perspective เพิ่มขึ้นตามความเร็ว
* Motion Blur แบบสมจริง

ต้องให้ความรู้สึกเหมือนกล้องกำลัง **"บินจากมุมสูงลงมายังพื้นที่จริง"**

## SCENE 3 — CLOUD TRANSITION

เมื่อกล้อง Zoom ลงมาใกล้พื้นที่ ให้เข้าสู่ชั้นเมฆ
กล้องต้องเคลื่อนผ่านเมฆ **ไม่ใช่ตัดภาพแบบ Hard Cut**

```text
Satellite → Atmosphere → Clouds → ผ่านเมฆ → พื้นที่จริง
```

**Cloud Effect** — เมฆต้องมีลักษณะสมจริง ไม่ใช้เมฆแฟนตาซี

กล้องสามารถ: เคลื่อนผ่านเมฆ · มีหมอกบาง ๆ · มี Light Diffusion · มีการเปลี่ยน Exposure · มี Motion Blur

เมื่อผ่านชั้นเมฆ ให้ค่อย ๆ เห็นพื้นดินด้านล่าง

## SCENE 4 — TRANSITION INTO INPUT IMAGE

นี่คือ Scene ที่สำคัญที่สุดของ WF1
หลังกล้องผ่านเมฆ ต้องค่อย ๆ เปลี่ยนเข้าสู่ **ภาพที่ดินต้นฉบับ**

ห้ามสร้างภาพใหม่ที่แตกต่างจาก Input แล้วตัดเข้าภาพจริงแบบกระทันหัน

```text
Generated Aerial Scene → Match Camera Angle → Match Ground → Match Lighting → Blend → Input Image
```

กล้องต้องมีทิศทางการเคลื่อนที่ที่ต่อเนื่องกับภาพปลายทาง

## FINAL FRAME

เฟรมสุดท้ายของ WF1 ต้องเป็น **ภาพที่ดินต้นฉบับ**

และต้องรักษา: Composition · Perspective · Camera Angle · ตำแหน่งพื้นที่ · สิ่งปลูกสร้าง · ต้นไม้ · ถนน · สภาพแวดล้อม · Lighting — ให้ตรงกับ Input มากที่สุด

**FINAL 0.5–1.0 SEC = EXACT TARGET IMAGE → FREEZE / HOLD**

## CRITICAL CONTINUITY RULE

ห้ามให้เฟรมสุดท้ายของ WF1 เป็นภาพที่ AI สร้างขึ้นมาใหม่
เฟรมสุดท้ายต้อง Match กับ Input Image โดยตรง

เพราะ:

> **FRAME END ของ WF1 = FRAME START ของ WF2**

ดังนั้นต้องสร้างจุดเชื่อมต่อที่สมบูรณ์แบบ

## TEXT

WF1 ไม่ควรมีข้อความเยอะ — มีได้เพียง Location / ชื่อพื้นที่ / Hook สั้น ๆ แต่ต้องไม่บดบังภาพ

## OUTPUT

* Video WF1
* Final Frame ของ WF1
* Final Frame ที่มีความละเอียดสูง
* Metadata สำหรับส่งต่อ WF2

โดยระบุชัดเจนว่า: **FINAL FRAME = INPUT IMAGE**
และให้ Final Frame นี้ถูกใช้เป็น First Frame ของ WF2
