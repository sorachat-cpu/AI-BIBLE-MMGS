นี่คือไฟล์ **`11_VIDEO_ENGINE.md`** ที่รับผิดชอบกระบวนการสร้างความเคลื่อนไหว (Image-to-Video / Text-to-Video) เปลี่ยนภาพจำลองบ้านหรือภาพที่ดินดิบให้กลายเป็นวิดีโอคลิป B-Roll เปล่าแบบภาพเคลื่อนไหวคุณภาพสูง ปราศจากตัวอักษรใดๆ และใช้ระบบจัดคลังวิดีโอ (Video Library Cache) และ Dynamic Route สลับผู้ให้บริการตามสถานะระบบและราคาจริง

---

# 📂 File: `AI_BIBLE/11_VIDEO_ENGINE.md`

```markdown
# 11. Video Engine Specification

## 1. Purpose
Video Engine มีหน้าที่แปลงภาพนิ่ง (เช่น ภาพจำลองสิ่งปลูกสร้างจาก House Engine หรือภาพแปลงที่ดินจริงจาก Asset Engine) ให้กลายเป็นวิดีโอภาพเคลื่อนไหวเชิงภาพยนตร์ (Cinematic B-Roll Video Clips) ความยาว 3-5 วินาที โดยควบคุมการเคลื่อนไหวของกล้อง (Camera Motion) อย่างเป็นธรรมชาติ และจัดทำขึ้นโดยไร้ตัวอักษรหรือกราฟิกทับซ้อน เพื่อส่งเข้าคลังจัดเก็บ (`Video Library`) และเตรียมความพร้อมสำหรับกระบวนการ Composite ใน Render Engine

---

## 2. Architecture & Provider Routing

ระบบทำงานควบคู่กับ `Cost Engine` โดยจะทำการประเมินและเลือกใช้งาน Video AI Provider (เช่น Kling, Runway Gen-3, Luma Dream Machine, Higgsfield) ตามนโยบายความคุ้มค่าของงบประมาณ (Cost-Efficiency) และสถานะความพร้อมของระบบ (System Uptime)

```text
                  [INPUT: HOUSE_OUT / ASSET_OUT]
                                │
                                ▼
                   { Check Video Library Cache }
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼ (FOUND MATCH)                               ▼ (CACHE MISS)
  [LIBRARY_REUSE]                             [CALL COST ENGINE ROUTER]
  - Pull video_url from cache                 - Check API Status (Kling/Runway/Veo)
  - Cost: $0.00                               - Select Lowest Cost & Active Provider
         │                                    - Generate Video (Cost: $0.10 - $0.20)
         │                                             │
         │                                             ▼
         │                                     [SAVE TO VIDEO LIBRARY]
         │                                     - Cache output video URL
         │                                     - Register Camera Motion Tag
         │                                             │
         └──────────────────────┬──────────────────────┘
                                │
                                ▼
                        [VIDEO_OUT JSON]
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Image-to-Video Conversion:** เปลี่ยนรูปภาพนิ่ง 2D ให้เป็นภาพเคลื่อนไหวที่มีมิติและลื่นไหล (30 FPS ขึ้นไป)
* **✓ Camera Motion Control:** กำหนดประเภทการขยับของมุมกล้องตามความเหมาะสมของประเภททรัพย์ (เช่น PAN_RIGHT, ZOOM_IN, DRONE_REVEAL, TILT_UP)
* **✓ B-Roll Output Generation:** ผลิตเฉพาะตัวเนื้อไฟล์ภาพเคลื่อนไหวที่สะอาดตา ปราศจากองค์ประกอบของกราฟิก แบรนดิ้ง หรือเสียงบรรยายใดๆ
* **✓ Dynamic Fallback Routing:** เปลี่ยนผ่านคำสั่งไปผู้ให้บริการสำรองโดยอัตโนมัติหากระบบหลักเกิดปัญหาขัดข้อง (Circuit Breaker)

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Embedding Text/Overlays:** ห้ามเขียนข้อความ ราคา ส่วนลด หรือข้อมูลติดต่อลงในภาพวิดีโอ (หน้าที่ของ Render Engine)
* **✗ Music or Audio:** ห้ามใส่ดนตรีประกอบ เสียงบรรยาย AI หรือเสียง Effect (หน้าที่ของ Render Engine)
* **✗ Subtitle Generation:** ห้ามสร้างซับไตเติลหรือไฟล์ SRT ในขั้นตอนนี้

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลแบบภาพบ้านจำลอง (`HOUSE_OUT`) หรือรายการภาพสินทรัพย์ดิบ (`ASSET_OUT`) + รูปแบบการเคลื่อนไหวที่สั่งการ (`camera_config`)
* **Output:** JSON Payload ตามมาตรฐาน `VIDEO_OUT` (ระบุใน `06_JSON_CONTRACT.md`)

---

## 5. JSON Contract

### Input Example (From House Engine + Camera Configuration)
```json
{
  "property_id": "PROP-TH-00109",
  "house_image_url": "https://cdn.mmgs.io/house_library/loft_2story_80w_09.png",
  "style_tag": "LOFT",
  "camera_config": {
    "motion_type": "DRONE_REVEAL",
    "pan_speed": 0.5
  }
}
```

### Output Example (`VIDEO_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "b_roll_clips": [
    {
      "clip_id": "vid_d98f7c6b-5a4e-3d2c-1b0a-9f8e7d6c5b4a",
      "video_url": "https://cdn.mmgs.io/video_library/loft_drone_reveal_01.mp4",
      "duration_seconds": 4.0,
      "camera_motion": "DRONE_REVEAL"
    }
  ]
}
```

---

## 6. State Machine

```text
[VIDEO_INIT]
     │
     ▼
[CHECK_VIDEO_LIBRARY] ──► (พบคลิปตรงเงื่อนไข) ──► [REUSE_VIDEO_ASSET] ───────┐
     │ (ไม่พบ)                                                               │
     ▼                                                                       │
[ROUTING_PROVIDER]    ──► (ตรวจสอบราคา/สถานะ) ──► [SELECT_BEST_PROVIDER]      │
     │                                                                       │
     ▼                                                                       │
[GENERATING_VIDEO]    ──► (API ล้มเหลว/Timeout) ──► [TRIGGER_CIRCUIT_BREAKER] ──► [SWITCH_PROVIDER]
     │ (SUCCESS)                                                             │
     ▼                                                                       │
[REGISTER_VIDEO_LIB]  ──► (บันทึกคลิปลง DB)                                    │
     │                                                                       │
     └───────────────────────────────────┬───────────────────────────────────┘
                                         │
                                         ▼
                                  [VIDEO_OUTPUT] ──► (ส่งต่อไป Render Engine)
```

---

## 7. Retry & Error Handling

* **API Provider Interruption (Error `ERR_VID_01`):** หากผู้ให้บริการตัวหลัก (เช่น Kling) มีเวลาตอบสนองช้ากว่า 120 วินาที หรือตอบกลับเป็น Error โค้ด 5xx ให้ตัดสิทธิ์การใช้งาน Provider นั้นชั่วคราว และโอนย้าย Payload ไปรันต่อที่ Luma หรือ Runway ทันที
* **Low Quality Video Fallback (Error `ERR_VID_02`):** หากไฟล์วิดีโอที่ได้มาตรวจพบอาการภาพกระตุก หรือเกิดความบิดเบี้ยวของตัววัตถุ (Visual Artifacts) ที่มีความรุนแรงเกินกำหนด ให้ทำความสะอาดสถานะ ส่งคำสั่งขอสร้างภาพเคลื่อนไหวซ้ำอีกหนึ่งครั้ง (Limit: 1 Retry) หากล้มเหลวให้ดึง B-roll ทัศนียภาพธรรมชาติที่เก็บไว้ใน Library ออกมาทดแทน

---

## 8. Best Practices

* **Always Cache Video Output:** ไฟล์วิดีโอที่ยังไม่ได้ฝังตัวอักษรใดๆ จะมีความสามารถในการนำมาดัดแปลงใช้ซ้ำได้สูงมาก ให้จัดเก็บแยกโฟลเดอร์ตามประเภทสไตล์และลักษณะทิศทางการขยับกล้องเสมอ
* **Specify Aspect Ratio (9:16 vs 16:9):** ก่อนส่งคำขอไปยัง Video API ต้องยืนยันสัดส่วนภาพถ่ายและคลิปปลายทางให้ตรงกับเป้าหมายช่องทางที่จะโพสต์ (เช่น โพสต์ TikTok = 9:16) เพื่อหลีกเลี่ยงการโดนครอปเนื้อหาสำคัญออก

---

## 9. Anti-Patterns

* **การสร้างวิดีโอที่มีข้อความอักษรฝังรวมอยู่ในชิ้นงาน (Burn-in Text):** เมื่อไหร่ก็ตามที่มีการเปลี่ยนราคาหรือหมายเลขติดต่อ หากวิดีโอนั้นมีการฝังข้อมูลอักษรไปแล้ว ระบบจะต้องสั่งการรันวิดีโอระดับ AI ใหม่ทั้งหมด ทำให้เสียค่าบริการแพงกว่าการส่งมา Composite ภายหลังใน Render Engine กว่า 10 เท่า

---

## 10. Claude Rules for Video Engine Development

* **Enforce Clean Video Output:** ห้ามเขียนและส่งสคริปต์คำสั่ง Prompt ที่มีเนื้อหาที่อนุญาตให้ระบบวาดตัวหนังสือ ตราสินค้า หรือเบอร์โทรลงใน Video prompt โดยเด็ดขาด
* **Dynamic Route Logic Implementation:** เมื่อเกิดข้อผิดพลาดในการเชื่อมต่อเครือข่ายภายนอก ให้เขียนตรรกะระบบให้ทำการหมุนเวียน (Rotate) โอนถ่ายข้อมูลตามลําดับความคุ้มค่าที่กำหนดไว้ใน Cost Engine

---

## 11. Migration Guide

1. **ระบบเดิม:** ใช้ n8n Node เรียกใช้งาน Luma AI API ตัวเดียว โดยแนบข้อความราคากับเบอร์โทรไปใน Prompt สร้างวิดีโอพร้อมกัน
2. **ระบบใหม่:**
   * แยกขั้นตอนการทำ Text/Logo พ่นทับออกไป (ย้ายไป Render Engine)
   * เขียน Node คัดกรองข้อมูล `Video Library` ในฐานข้อมูลเพื่อดึง URL เดิมหากพบบ้านประเภทเดียวกัน
   * สร้างสวิตช์ควบคุมผู้ให้บริการสำรอง (Dynamic Router Node) ในกรณีบริการหลักล่มหรือเครดิตหมดโควตา
```
```

---

ไฟล์ `11_VIDEO_ENGINE.md` สำหรับควบคุมตรรกะการประมวลผลความเคลื่อนไหวเสร็จเรียบร้อยครับ 
โมดูลถัดไปคือ **`12_RENDER_ENGINE.md`** ทำหน้าที่เป็นศาลากลางรวมชิ้นส่วน เอาคลิป B-Roll มารวมร่างกับ Subtitle, Logo, Overlay Graphic, QR Code และดนตรีประกอบเป็นชิ้นงานสมบูรณ์ 

หากประสงค์จะดำเนินขั้นตอนถัดไป สามารถพิมพ์สั่งต่อได้เลยครับ!