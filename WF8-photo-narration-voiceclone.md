# WF8 — Photo Sequence → Narrated Video (Voice Clone)
## Real Estate AI Automation Platform | Workflow เพิ่มเติม

**เวอร์ชัน:** 1.0
**ตำแหน่งในระบบ:** ขนานกับ WF5 (ใช้ WF6 Queue และ WF7 Publish ร่วมกันได้)
**เขียนสำหรับ:** Claude Code implementation

---

## 1. โจทย์

> รับ **รูปหลายรูป** + **แคปชั่น** + **วิดีโอต้นฉบับ (สำหรับโคลนเสียง)**
> → ต่อเป็นวิดีโอเดียวพร้อมเสียงบรรยายภาษาไทย ที่พูดตามแคปชั่น ด้วย **เสียงของเจ้าของเอง**
> → คืนเป็นไฟล์ให้ดาวน์โหลด

**Input**
| ช่อง | ชนิด | บังคับ | หมายเหตุ |
|---|---|---|---|
| `images[]` | JPG/PNG | ✅ | 3–20 รูป, ด้านยาว ≥ 1080px |
| `caption` | text (ไทย) | ✅ | บทที่จะให้พูด |
| `reference_media` | MP4/MOV/M4A/MP3 | ✅ | ระบบดึงเสียงออกมาเอง |
| `aspect_ratio` | enum | ⬜ | default `9:16` |
| `bgm_track` | string | ⬜ | default `soft_corporate_01` |
| `motion_style` | enum | ⬜ | `kenburns` (default) / `kling` |

**Output**
```json
{
  "video_url": "https://.../wf8_{job_id}_9x16.mp4",
  "video_16x9_url": "https://.../wf8_{job_id}_16x9.mp4",
  "srt_url": "https://.../wf8_{job_id}.srt",
  "voice_id": "el_xxxxx",
  "duration_sec": 42.8
}
```

---

## 2. Pipeline Overview

```
8.1  Intake & Validate
      ↓
8.2  Extract Audio from Reference Video   (FFmpeg)
      ↓
8.3  Speech Isolation + Quality Gate      (ElevenLabs Audio Isolation)
      ↓
8.4  Voice Clone → voice_id  [CACHED]     (ElevenLabs IVC)
      ↓
8.5  Script Generation from Caption       (Claude / GPT — ไทย)
      ↓
8.6  TTS with Timestamps → narration.mp3  (ElevenLabs)
      ↓
8.7  Segment ↔ Image Mapping (auto-timing)
      ↓
8.8  Per-image Motion (Ken Burns หรือ Kling)
      ↓
8.9  Assemble: concat + xfade + subtitle + BGM ducking
      ↓
8.10 Dual Export (9:16 / 16:9) → Upload → Return URL
```

---

## 3. รายละเอียดแต่ละ Step

### 8.1 Intake & Validate

```
validate:
  - images.length ระหว่าง 3–20
  - ทุกรูป: ด้านยาว ≥ 1080px, ไม่ใช่ไฟล์เสีย
  - caption: 20–1200 ตัวอักษร
  - reference_media: ความยาว ≥ 45 วินาที
  - อัตราส่วนรูป: ถ้าไม่ตรงกับ aspect_ratio ปลายทาง → crop แบบ center-safe
```

**⚠️ Consent Gate (บังคับ — ห้ามข้าม)**
ก่อนโคลนเสียง ระบบต้องได้รับการยืนยันจากผู้ใช้ว่าเสียงในไฟล์เป็นเสียงของตัวเอง หรือได้รับอนุญาตจากเจ้าของเสียงแล้ว
- ใน LINE: ส่ง quick reply `[ยืนยันว่าเป็นเสียงของฉัน]` / `[ยกเลิก]`
- เก็บ log: `{user_id, timestamp, consent: true, media_hash}`
- ถ้าไม่ยืนยัน → ตกไปใช้ stock voice แทน ไม่ clone

---

### 8.2 Extract Audio (FFmpeg)

```bash
ffmpeg -y -i reference.mp4 \
  -vn -ac 1 -ar 44100 -c:a pcm_s16le \
  -af "loudnorm=I=-18:TP=-2:LRA=11" \
  ref_raw.wav
```

ตัดช่วงเงียบออกเพื่อให้เหลือแต่ช่วงพูด:
```bash
ffmpeg -y -i ref_raw.wav \
  -af "silenceremove=start_periods=1:start_duration=0.3:start_threshold=-40dB:\
detection=peak,areverse,\
silenceremove=start_periods=1:start_duration=0.3:start_threshold=-40dB,areverse" \
  ref_trimmed.wav
```

---

### 8.3 Speech Isolation + Quality Gate

ส่ง `ref_trimmed.wav` เข้า ElevenLabs Audio Isolation เพื่อลบ BGM / เสียงลม / เสียงรถ
→ ได้ `ref_clean.wav`

**Quality Gate — ต้องผ่านทุกข้อ:**

| เกณฑ์ | ค่า | ถ้าไม่ผ่าน |
|---|---|---|
| ความยาวเสียงพูดสุทธิ | ≥ 40 วินาที | แจ้ง user ขอไฟล์ยาวขึ้น |
| จำนวนผู้พูด | 1 คน | แจ้งว่ามีหลายเสียง ขอไฟล์ใหม่ |
| Clipping | < 1% ของ sample | แจ้ง user อัดใหม่ |
| ระดับเสียง (RMS) | ≥ -30 dBFS | แจ้ง user อัดใกล้ไมค์ขึ้น |

> ตรวจ 1 คน: ใช้ speaker diarization (pyannote) หรือเช็คง่ายๆ ด้วย pitch variance ถ้าไม่อยากพึ่ง lib หนัก

---

### 8.4 Voice Clone (มี Cache — สำคัญมาก)

```
key = sha256(user_id + media_hash)

if voiceCache.has(key):
    voice_id = voiceCache.get(key)      # ไม่ clone ซ้ำ ประหยัดโควต้า
else:
    voice_id = elevenlabs.createInstantVoiceClone(
        name = f"wf8_{user_id}",
        files = [ref_clean.wav],
        labels = { "lang": "th", "source": "wf8" }
    )
    voiceCache.set(key, voice_id, ttl=90d)
```

**ข้อควรระวัง**
- ElevenLabs มี **ลิมิตจำนวน custom voice ต่อ account** — ต้องมี eviction policy (ลบ voice ที่ไม่ถูกใช้ > 90 วัน)
- Instant Voice Cloning ให้ผลดีสุดที่ตัวอย่าง 1–3 นาที เสียงสะอาด พูดต่อเนื่อง
- ถ้า user เดิมส่งไฟล์ใหม่ → ให้ถามว่าจะใช้เสียงเดิมหรือ clone ใหม่

---

### 8.5 Script Generation (Claude / GPT)

แคปชั่นดิบมักไม่เหมาะพูดตรงๆ (มี hashtag, อีโมจิ, ตัวเลขย่อ) ต้องแปลงก่อน

**System prompt:**
```
คุณเป็นนักเขียนบทวิดีโอขายที่ดินภาษาไทย
แปลงแคปชั่นต่อไปนี้เป็นบทพูดสำหรับเสียงบรรยาย โดย:
- แบ่งเป็น {N} ท่อน ท่อนละ 1-2 ประโยค (N = จำนวนรูป)
- แต่ละท่อนพูดจบใน 4-7 วินาที
- ตัด hashtag / emoji / URL ออกทั้งหมด
- อ่านตัวเลขเป็นคำเต็ม: "8.5 ล้าน" → "แปดจุดห้าล้านบาท", "100 ตร.ว." → "หนึ่งร้อยตารางวา"
- ภาษาพูดธรรมชาติ ไม่เป็นทางการเกินไป โทนเป็นมิตร
- ท่อนสุดท้ายต้องมี call to action (ทักไลน์ / โทรสอบถาม)

ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
{"segments": [{"index": 1, "text": "..."}, ...]}
```

**⚠️ ปัญหาไทยที่ต้องดักไว้:**
- ภาษาไทยไม่มีเว้นวรรคระหว่างคำ → TTS อาจแบ่งวรรคผิด ให้ใส่ช่องว่างคั่นวลีในบทที่ส่งเข้า TTS
- คำทับศัพท์ (เช่น "ไพรม์แอเรีย") ถ้าอ่านเพี้ยน ให้เขียนแบบสะกดตามเสียง
- ตัวย่อ ตร.ว. / รร. / รพ. ต้องขยายเป็นคำเต็มเสมอ

---

### 8.6 TTS with Timestamps

เรียก endpoint แบบ **with-timestamps** เพื่อให้ได้เวลาระดับตัวอักษรกลับมา — จำเป็นสำหรับทั้ง sync รูป และสร้าง SRT

```
POST /v1/text-to-speech/{voice_id}/with-timestamps
{
  "text": "<บททั้งหมด ต่อกันด้วยตัวคั่น segment>",
  "model_id": "<multilingual model ที่รองรับภาษาไทย>",
  "voice_settings": {
    "stability": 0.45,
    "similarity_boost": 0.80,
    "style": 0.25,
    "use_speaker_boost": true
  }
}
```

**ค่าที่แนะนำสำหรับงานอสังหาฯ ไทย:**
| setting | ค่า | เหตุผล |
|---|---|---|
| `stability` | 0.40–0.50 | ต่ำไปเสียงสั่น สูงไปแบนไม่มีอารมณ์ |
| `similarity_boost` | 0.75–0.85 | สูงกว่านี้จะดึง artifact จากไฟล์ต้นฉบับมาด้วย |
| `style` | 0.20–0.30 | เกิน 0.4 มักทำให้จังหวะเพี้ยนในภาษาไทย |

Output: `narration.mp3` + `alignment[]` (character → start_time, end_time)

---

### 8.7 Segment ↔ Image Mapping

```
segment_times = groupAlignmentBySegment(alignment, segments)
# ได้ [{index:1, start:0.0, end:5.2}, {index:2, start:5.2, end:11.4}, ...]

for i, image in enumerate(images):
    image.start    = segment_times[i].start
    image.duration = segment_times[i].end - segment_times[i].start
```

**กติกา timing**
- จำนวนรูป **ควรเท่ากับ** จำนวน segment
- ถ้ารูป > segment → รูปส่วนเกินแบ่งเวลาของ segment สุดท้าย
- ถ้ารูป < segment → รวม segment ที่ติดกันเข้าด้วยกัน
- รูปแรกให้มี lead-in 0.5s ก่อนเสียงเริ่ม
- รูปสุดท้ายให้มี tail 1.5s หลังเสียงจบ (สำหรับ ending card)

---

### 8.8 Per-image Motion

**โหมด A: `kenburns` (default — เร็ว, ฟรี, deterministic)**

```bash
# ต่อ 1 รูป, duration = D วินาที, fps = 30
ffmpeg -y -loop 1 -i img_01.jpg -t {D} \
  -vf "scale=2160:3840:force_original_aspect_ratio=increase,\
crop=2160:3840,\
zoompan=z='min(zoom+0.0012,1.15)':d={D*30}:\
x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,\
format=yuv420p" \
  -c:v libx264 -preset medium -crf 20 clip_01.mp4
```

> สลับทิศทางการซูมสลับรูป (zoom-in / zoom-out / pan-left / pan-right) เพื่อไม่ให้ดูซ้ำ — เก็บเป็น `kenburns-patterns.json`

**โหมด B: `kling` (สวยกว่า, ใช้เครดิต)**

ส่งแต่ละรูปเข้า Kling image-to-video โดยใช้ **Motion Vocabulary จาก `WF5_Kling_Prompt_Spec_v2.md` ข้อ 4** เท่านั้น — ห้ามเขียน prompt ใหม่

ข้อจำกัด: Kling คืนคลิป 5s หรือ 10s เท่านั้น ถ้า segment ยาว 6.3s ให้
1. generate 10s
2. ตัดด้วย FFmpeg `-t 6.3`
หรือปรับความเร็วเล็กน้อย (`setpts`) ไม่เกิน ±10%

---

### 8.9 Assemble

**Concat พร้อม cross-fade 0.4s**
```bash
ffmpeg -y -i clip_01.mp4 -i clip_02.mp4 \
  -filter_complex "[0][1]xfade=transition=fade:duration=0.4:offset={D1-0.4}" \
  -c:v libx264 -crf 20 concat_tmp.mp4
```
(ทำแบบ chain ต่อเนื่อง หรือ build filter_complex ทีเดียวทุกคลิป)

**สร้าง SRT จาก alignment**
```
buildSRT(segment_times) → subtitle.srt
```

**เผาซับ + BGM ducking + narration**
```bash
ffmpeg -y -i concat.mp4 -i narration.mp3 -i bgm.mp3 \
  -filter_complex "\
[2:a]volume=0.18[bgm];\
[bgm][1:a]sidechaincompress=threshold=0.03:ratio=12:attack=20:release=350[duck];\
[duck][1:a]amix=inputs=2:duration=first:dropout_transition=0[aout];\
[0:v]subtitles=subtitle.srt:force_style='FontName=Noto Sans Thai,FontSize=17,\
PrimaryColour=&H00FFFFFF,OutlineColour=&H90000000,BorderStyle=3,\
Outline=2,Shadow=0,MarginV=110,Alignment=2'[vout]" \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 192k -shortest \
  final_9x16.mp4
```

**⚠️ Font ภาษาไทย:** container ต้องติดตั้ง `fonts-noto-thai` ไม่งั้นซับจะเป็นสี่เหลี่ยม
```dockerfile
RUN apt-get update && apt-get install -y fonts-noto fonts-noto-cjk fonts-thai-tlwg && fc-cache -fv
```

---

### 8.10 Dual Export & Delivery

```bash
# 16:9 จากมาสเตอร์ 9:16 — อย่า crop ตรงๆ ใช้ blurred padding
ffmpeg -y -i final_9x16.mp4 -filter_complex "\
[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,\
pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black[fg];\
[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,\
gblur=sigma=30[bg];[bg][fg]overlay[v]" \
  -map "[v]" -map 0:a -c:v libx264 -crf 20 -c:a copy final_16x9.mp4
```

Upload → Google Cloud Storage → คืน signed URL (TTL 7 วัน) → ส่งกลับทาง LINE เป็น video message + ลิงก์ดาวน์โหลด

---

## 4. n8n Node Structure

```
[Webhook /wf8]
   → [Function: validate]
   → [IF: consent granted?] ──no──→ [Set: use_stock_voice] ─┐
   → [Execute Command: ffmpeg extract]                       │
   → [HTTP: ElevenLabs audio-isolation]                      │
   → [Function: quality gate]                                │
   → [IF: cached voice?] ──no──→ [HTTP: ElevenLabs IVC]      │
   → [Set: voice_id] ←───────────────────────────────────────┘
   → [HTTP: LLM script generation]
   → [HTTP: ElevenLabs TTS with-timestamps]
   → [Function: map segments to images]
   → [Switch: motion_style] ─┬─ kenburns → [Execute Command: ffmpeg zoompan]
                             └─ kling    → [HTTP: Kling i2v] → [Wait/Poll]
   → [Execute Command: ffmpeg assemble]
   → [Execute Command: ffmpeg export 16:9]
   → [HTTP: upload GCS]
   → [HTTP: LINE reply with video + link]
   → [Postgres: log job]
```

**Queue:** ใช้ WF6 ร่วมกัน — WF8 กินเวลา CPU สูง (FFmpeg) ให้ตั้ง concurrency = 1–2 บน VPS

---

## 5. Error Handling

| เคส | การจัดการ |
|---|---|
| เสียงต้นฉบับสั้นเกิน / มีเสียงรบกวน | ตอบกลับ LINE พร้อมคำแนะนำ: "อัดเสียงพูดต่อเนื่อง 1 นาที ในที่เงียบ" + ปุ่ม `[ใช้เสียงมาตรฐานแทน]` |
| Voice clone quota เต็ม | evict voice เก่าสุดที่ไม่ถูกใช้ แล้ว retry 1 ครั้ง |
| TTS ยาวกว่าที่คาด | ปรับ `duration` ของรูปตามจริง ไม่ตัดเสียง |
| Kling job fail / timeout | fallback เป็น `kenburns` อัตโนมัติ แล้ว log ไว้ |
| FFmpeg exit != 0 | เก็บ stderr เต็มลง log, retry 1 ครั้ง, ถ้ายังพังแจ้ง user |
| รูปอัตราส่วนผิดมาก (panorama) | center-crop + แจ้งเตือนใน response ว่ารูปที่ N ถูกครอบตัด |

---

## 6. Checklist สำหรับ Claude Code

- [ ] Consent gate ก่อน voice clone — เก็บ log ทุกครั้ง
- [ ] `extractAudio()` + `isolateSpeech()` + `qualityGate()` แยกเป็น 3 ฟังก์ชัน
- [ ] Voice cache แบบ hash-based พร้อม TTL และ eviction policy
- [ ] `generateNarrationScript()` บังคับ output เป็น JSON, มี retry ถ้า parse ไม่ผ่าน
- [ ] ใช้ TTS **with-timestamps** เท่านั้น — อย่าเดา timing เอง
- [ ] `mapSegmentsToImages()` รองรับกรณีจำนวนรูป ≠ จำนวน segment
- [ ] Ken Burns pattern เก็บใน config แยก สลับทิศทางไม่ให้ซ้ำ
- [ ] โหมด Kling ต้องเรียก motion vocabulary จาก `WF5_Kling_Prompt_Spec_v2.md` ไม่เขียน prompt ใหม่
- [ ] ติดตั้งฟอนต์ไทยใน Docker image
- [ ] BGM ducking ด้วย `sidechaincompress` ไม่ใช่ลดเสียงแบบคงที่
- [ ] Export ทั้ง 9:16 และ 16:9 จากมาสเตอร์เดียว
- [ ] ทุกไฟล์ชั่วคราวลบหลังจบ job (VPS พื้นที่จำกัด)

---

## 7. ข้อควรยืนยันก่อน Deploy

- **ภาษาไทยกับ voice cloning**: ต้องทดสอบจริงว่า model ที่เลือกรองรับไทยได้ดีแค่ไหน — โดยเฉพาะวรรณยุกต์และคำทับศัพท์ ให้ทดสอบด้วยบทตัวอย่างที่มีชื่อสถานที่ไทย ตัวเลข และคำอังกฤษปน ก่อนใช้งานจริง
- **ElevenLabs endpoint และชื่อ field** เปลี่ยนตามเวอร์ชัน — เช็ค docs ปัจจุบันก่อน hardcode
- **Kling duration** รองรับกี่ค่าใน endpoint ที่ใช้จริง (มีผลกับ 8.8 โหมด B)
- **ลิขสิทธิ์ BGM** — ต้องใช้เพลง royalty-free หรือมีสัญญา ไม่งั้นโดน takedown ตอนโพสต์ผ่าน WF7
