นี่คือไฟล์ **`12_RENDER_ENGINE.md`** ซึ่งเป็นโมดูลรวมชิ้นส่วนสุดท้าย (Composition Layer) ทำหน้าที่ผสานวิดีโอดิบ (B-Roll) โลโก้แบรนด์ ซับไตเติล ราคาทรัพย์สิน เพลงประกอบ และ Ending Card เข้าด้วยกันผ่านชุดคำสั่งแบบ Programmatic (เช่น FFmpeg หรือ Remotion) โดยปราศจากการใช้งาน AI API สร้างภาพ เพื่อลดต้นทุนและช่วยให้สามารถแก้ไขคำผิดได้ทันทีโดยไม่ต้องเรนเดอร์ภาพเคลื่อนไหวใหม่

---

# 📂 File: `AI_BIBLE/12_RENDER_ENGINE.md`

```markdown
# 12. Render Engine Specification

## 1. Purpose
Render Engine มีหน้าที่รวบรวมและประกอบ (Composite) ชิ้นส่วนดิบทั้งหมดที่ผ่านการเตรียมการเรียบร้อยแล้ว ได้แก่ วิดีโอ B-Roll เปล่า (จาก Video Engine), แผนที่พิกัด (จาก Google Engine), เลย์เอาต์กราฟิกพาดหน้าจอ (จาก Overlay Engine), เสียงพากย์/ดนตรีประกอบ (Audio Assets), และ QR Code ช่องทางติดต่อ เพื่อส่งออก (Export) เป็นไฟล์วิดีโอโฆษณาฉบับสมบูรณ์พร้อมเผยแพร่ โดยทำงานผ่านระบบคำสั่งโค้ด (เช่น FFmpeg, Remotion หรือคลาวด์เรนเดอร์) ทำให้สามารถประมวลผลได้รวดเร็วและประหยัดค่าใช้จ่าย

---

## 2. Architecture & Rendering Pipeline

โมดูลนี้ทำงานเป็นชุดคำสั่งแบบขนานและเรียงลำดับชั้น (Overlay Layers) โดยใช้วิธีเรนเดอร์ระดับโปรแกรม (Programmatic Rendering) เพื่อหลีกเลี่ยงการใช้ AI Generator ในส่วนของกราฟิกและตัวอักษร

```text
  [Video B-Roll 1] ──┐
  [Video B-Roll 2] ──┼──► [ Video Concatenation ] ──┐
  [Google Map View] ─┘                              │
                                                    ▼
  [Overlay Config]  ────► [ Graphic Overlay Engine ] ──► [ Layer Compositing (FFmpeg) ]
  [Logo & QR Code]  ────────────────────────────────┘           │
  [Music & TTS Audio] ──────────────────────────────────────────┼──► [ Audio Mixing ]
                                                                │
                                                                ▼
                                                          [ Export MP4 ] ──► [ RENDER_OUT ]
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Video Concatenation:** นำคลิปวิดีโอสั้น B-Roll หลายๆ ตัวและแผนที่ดาวเทียมมาต่อกันอย่างแนบเนียน พร้อมใส่ Transition (เช่น Fade-to-black, Cross-dissolve)
* **✓ Graphic Layer Compositing:** วางซ้อนภาพโลโก้แบรนด์, ป้ายราคา (Price Badge), และ Ending Card ปิดท้ายคลิปในตำแหน่งพิกัดหน้าจอที่ถูกต้อง
* **✓ Subtitle Rendering:** วาดซับไตเติล (Subtitles/Captions) ลงบนเนื้อวิดีโอตามช่วงเวลา (Timestamp) ที่สัมพันธ์กับเสียงบรรยาย
* **✓ Audio Mixing & Ducking:** รวมเสียงเพลงประกอบ (Background Music) และเสียงพากย์ AI (Text-to-Speech) โดยทำระบบลดเสียงดนตรีอัตโนมัติเมื่อมีเสียงพูด (Audio Ducking)
* **✓ Watermarking & QR Generation:** สร้างภาพรหัส QR Code จากลิงก์ติดต่อและนำไปแปะไว้บน Ending Card

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Image/Video Generative AI:** ห้ามเรียกใช้โมเดล AI เพื่อสร้างวิดีโอหรือภาพใหม่ในขั้นตอนนี้ (ต้องรันผ่าน Video/House Engine เท่านั้น)
* **✗ Content Optimization:** ห้ามแก้ไขคำสะกดหรือราคาที่ได้รับจากระบบ (หากพบว่าผิดพลาด ให้ส่งสัญญาระงับกลับไปแก้ไขข้อมูลตั้งแต่ Property Engine)
* **✗ Channel Publishing:** ห้ามอัปโหลดหรือโพสต์คลิปขึ้นสื่อโซเชียลด้วยตนเอง (หน้าที่ของ Publish Engine)

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลวิดีโอ B-Roll (`VIDEO_OUT`) + ข้อมูลรายละเอียดแผนที่ (`GOOGLE_OUT`) + ค่าเลย์เอาต์กราฟิก (`OVERLAY_OUT` / Configuration) + ข้อมูลอสังหาฯ สำหรับทำตัวอักษร (`PROPERTY_OUT`) + ไฟล์เสียง
* **Output:** JSON Payload ตามมาตรฐาน `RENDER_OUT` (ระบุใน `06_JSON_CONTRACT.md`)

---

## 5. JSON Contract

### Input JSON Structure (Payload from Orchestrator)
```json
{
  "property_id": "PROP-TH-00109",
  "b_roll_clips": [
    {
      "clip_id": "vid_d98f7c6b",
      "video_url": "https://cdn.mmgs.io/video_library/loft_drone_reveal_01.mp4",
      "duration_seconds": 4.0
    }
  ],
  "map_asset": {
    "image_url": "https://cdn.mmgs.io/google_cache/map_prop_00109.png",
    "duration_seconds": 2.0
  },
  "overlay_specs": {
    "title_text": "บ้านเดี่ยวสไตล์โมเดิร์นลอฟท์ พระราม 9",
    "price_text": "12.9 ล้านบาท",
    "contact_phone": "081-234-5678",
    "qr_url": "https://line.me/ti/p/@broker1",
    "theme_color": "#1A1A1A"
  },
  "audio_specs": {
    "voiceover_url": "https://cdn.mmgs.io/tts/prop_00109_vo.mp3",
    "music_url": "https://cdn.mmgs.io/music/jazz_elevator_loop.mp3"
  }
}
```

### Output JSON Structure (`RENDER_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "final_video_url": "https://cdn.mmgs.io/renders/PROP-TH-00109_final_9_16.mp4",
  "render_specs": {
    "resolution": "1080x1920",
    "fps": 30,
    "bitrate_kbps": 8000,
    "duration_seconds": 6.0
  }
}
```

---

## 6. State Machine

```text
[RENDER_INIT]
      │
      ▼
[PULLING_ASSETS]       ──► (ดาวน์โหลดไฟล์ภาพ/เสียง/วิดีโอล้มเหลว) ──► [RETRY_DOWNLOAD]
      │
      ▼
[GENERATING_GRAPHICS]  ──► (สร้างไฟล์ภาพ Overlay/QR ไม่ได้)       ──► [ERR_RND_GRAPHIC]
      │
      ▼
[FFMPEG_COMPOSITING]   ──► (FFmpeg ประมวลผลแครช/Out of memory) ──► [FALLBACK_SD_RENDER]
      │
      ▼
[UPLOADING_FINAL_MP4] ──► (อัปโหลดขึ้น Cloud Storage ล้มเหลว)    ──► [RETRY_UPLOAD]
      │
      ▼
[RENDER_COMPLETED]     ──► (ส่งต่อไปยัง Publish Engine)
```

---

## 7. Retry & Error Handling

* **Download Asset Failure (Error `ERR_RND_01`):** หากดาวน์โหลดคลิป B-Roll ต้นทางหรือไฟล์ภาพจาก CDN ไม่สำเร็จ ระบบจะทำการลองใหม่ (Retry) ทันทีสูงสุด 3 ครั้ง หากไม่สำเร็จจะปฏิเสธคำขอและรายงานไปยัง Orchestrator
* **FFmpeg Crash Fallback (Error `ERR_RND_02`):** หาก Server มี Memory ไม่เพียงพอต่อการเรนเดอร์วิดีโอระดับ 1080p แบบ 60fps ให้ปรับลดความละเอียดลงมาที่ 720p แบบ 30fps แล้วทำการรันเรนเดอร์ใหม่อีกครั้งโดยอัตโนมัติเพื่อคงสถานะการทำงานไว้

---

## 8. Best Practices

* **Font Loading:** เก็บไฟล์ฟอนต์ตัวอักษรภาษาไทย (.ttf) ที่เป็นลิขสิทธิ์ฟรีไว้บน Server ท้องถิ่นของโมดูล ห้ามทำการดาวน์โหลดจากภายนอกขณะทำการเรนเดอร์เพื่อความเสถียรและรวดเร็ว
* **Preset Configuration:** ใช้การเข้ารหัส (Encoding Preset) แบบ `preset=ultrafast` หรือ `superfast` ในคำสั่ง FFmpeg ในช่วงทดสอบงาน และใช้ `preset=medium` ในงานจริงเพื่อรักษาสมดุลความคมชัดและขนาดไฟล์

---

## 9. Anti-Patterns

* **การสร้างวิดีโอใหม่ตั้งแต่ศูนย์เมื่อราคาเปลี่ยน:** ห้ามป้อนคำสั่งย้อนกลับไปยัง Video Engine เพื่อเรนเดอร์ภาพเคลื่อนไหวใหม่เพียงเพราะผู้ใช้กรอกราคาอสังหาริมทรัพย์ผิด ให้ทำการเปลี่ยนตัวแปร `price_text` และสั่งคอมโพสิตผ่าน Render Engine ใหม่ทันที (ลดค่าใช้จ่ายจาก $0.16 เหลือ $0.01)

---

## 10. Implementation Example (FFmpeg Command CLI)

ตัวอย่างคำสั่ง FFmpeg ในการผสานคลิป B-Roll, วางภาพแผนที่ต่อท้าย, ใส่เสียงพูด, เสียงเพลง, และการวางตัวหนังสือพาดหน้าจอ:

```bash
ffmpeg -i input_broll.mp4 -i map_static.png -i voiceover.mp3 -i bg_music.mp3 \
-filter_complex \
"[0:v]scale=1080:1920,setsar=1[v0]; \
 [1:v]loop=loop=60:size=1:start=0,scale=1080:1920,setsar=1[v1]; \
 [v0][v1]concat=n=2:v=1:a=0[v_concat]; \
 [v_concat]drawtext=fontfile=/fonts/Kanit-Bold.ttf:text='บ้านเดี่ยวโมเดิร์นลอฟท์':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=200, \
           drawtext=fontfile=/fonts/Kanit-Medium.ttf:text='12.9 ล้านบาท':fontcolor=yellow:fontsize=80:x=(w-text_w)/2:y=320[v_out]; \
 [2:a][3:a]amix=inputs=2:duration=first[a_out]" \
-map "[v_out]" -map "[a_out]" -c:v libx264 -pix_fmt yuv420p -t 6.0 final_output.mp4
```

---

## 11. Claude Rules for Render Engine Development

* **No AI API Invocation:** เมื่อต้องทำการแก้ไขหรือสร้างซอร์สโค้ดใน Render Engine ห้ามเขียนฟังก์ชันที่มีการติดต่อไปยังผู้ให้บริการโมเดลจำลองภาพหรือวิดีโอ (ห้ามเรียก Kling, Runway, Flux)
* **Explicit Resource Cleanup:** เขียนฟังก์ชันล้างไฟล์ขยะ (Temporary Files) ในโฟลเดอร์รันงานของเซิร์ฟเวอร์หลังเรนเดอร์เสร็จสิ้นเสมอ เพื่อป้องกันปัญหาหน่วยความจำเก็บข้อมูลเต็ม (Disk Space Exhaustion)

---

## 12. Migration Guide

1. **ระบบเดิม:** ใช้ n8n สั่งการระบบ Luma/Midjourney ให้วาดตัวหนังสือลงในมีเดียโดยตรง
2. **ระบบใหม่:**
   * ลบคำแปลราคาทุกอย่างออกจาก Prompt ใน Node ก่อนหน้า
   * ติดตั้ง FFmpeg ลงบนเซิร์ฟเวอร์หลัก หรือเปิดการทำงานของระบบคลาวด์เช่น Remotion
   * นำผลลัพธ์จาก Video Engine และ Property Engine มารวมเข้ากับ Dynamic variables ใน Node ของ Render Module
   * บันทึกวิดีโอที่ได้ขึ้น Cloud Storage (S3/R2) แล้วส่งต่อ URLs ไปที่ Publish Engine
```
```

---

ไฟล์ `12_RENDER_ENGINE.md` สำหรับรวมชิ้นส่วนวิดีโอเสร็จเรียบร้อยครับ 
โมดูลถัดไปคือ **`13_OVERLAY_ENGINE.md`** ทำหน้าที่เป็นนักออกแบบเลย์เอาต์กราฟิก (Layout Generator) คอยจัดระบบ CSS/HTML หรือพิกัดตำแหน่งการวางสิ่งต่างๆ ของหน้าจอวิดีโอส่งให้ Render Engine นำไปปาดทับหน้าจอ 

หากต้องการไปต่อแจ้งได้เลยครับ!