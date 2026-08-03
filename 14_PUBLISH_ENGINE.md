นี่คือไฟล์ **`14_PUBLISH_ENGINE.md`** ซึ่งเป็นจุดสิ้นสุดของท่อส่งข้อมูลหลัก (End of Pipeline) ทำหน้าที่รับไฟล์วิดีโอที่เรนเดอร์เสร็จสมบูรณ์จาก Render Engine มาเขียนคำบรรยาย (Captions) และแฮชแท็ก (Hashtags) ที่เหมาะสมกับแต่ละแพลตฟอร์ม แล้วทำการโพสต์ขึ้น TikTok, YouTube Shorts และ Facebook Reels แบบอัตโนมัติผ่าน API พร้อมเก็บสถิติรหัสโพสต์กลับมาบันทึกในฐานข้อมูล

---

# 📂 File: `AI_BIBLE/14_PUBLISH_ENGINE.md`

```markdown
# 14. Publish Engine Specification

## 1. Purpose
Publish Engine มีหน้าที่รับผิดชอบในส่วนปลายน้ำของระบบ ทำหน้าที่นำวิดีโอสำเร็จรูป (จาก Render Engine) เผยแพร่ (Publish/Distribute) ขึ้นสู่แพลตฟอร์ม Social Media หลัก (TikTok, YouTube Shorts, Facebook Reels) โดยอัตโนมัติ รวมถึงการสร้างข้อความคำบรรยายใต้ภาพ (Captions) และแฮชแท็ก (Hashtags) ที่เหมาะสมกับแพลตฟอร์มนั้นๆ และบันทึกรหัสอ้างอิงโพสต์ (Post ID / URL) กลับสู่ระบบฐานข้อมูลกลางเพื่อใช้ในการติดตามผลประเมิน

---

## 2. Architecture & Publishing Flow

โมดูลนี้ทำหน้าที่จัดการการเชื่อมต่อภายนอก (API Integrations) ผ่านระบบคิวงาน (Queue System) เพื่อป้องกันการบล็อกของเครือข่ายและรักษาระดับการส่งคำขอไม่ให้เกินที่แพลตฟอร์มกำหนด (Rate Limits)

```text
       [INPUT: RENDER_OUT]
                │
                ▼
   [ Platform Caption Writer ] ──► (สร้าง Caption & Hashtags เฉพาะของแต่ละแพลตฟอร์ม)
                │
                ▼
      [ Queue Controller ]    ──► (จำกัดลำดับการอัปโหลด ป้องกัน Rate Limit)
                │
         ┌──────┼──────┐
         ▼      ▼      ▼
      [TikTok] [YT] [Facebook] ──► (ยิงคำขออัปโหลดไฟล์วิดีโอผ่าน API)
         │      │      │
         └──────┼──────┘
                ▼
    [ Response Verifier Node ] ──► (ดึง Post IDs & URLs ลิงก์เผยแพร่จริง)
                │
                ▼
       [PUBLISH_OUT JSON]      ──► (บันทึกข้อมูลและสิ้นสุดท่อส่งงานหลัก)
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Platform Adaptation:** ปรับเปลี่ยนรูปแบบเนื้อหาคำบรรยายให้เข้ากับกฎเกณฑ์ของแต่ละแพลตฟอร์ม (เช่น TikTok ยาวไม่เกิน 2,200 ตัวอักษร, YouTube Shorts ไม่เกิน 100 ตัวอักษร)
* **✓ Automated Uploading:** ทำงานประสานงานกับ API ของ TikTok Content Posting API, YouTube Data API (v3), และ Meta Graph API เพื่อส่งผ่านไฟล์วิดีโอและโพสต์ทันทีหรือตั้งเวลาโพสต์ (Scheduling)
* **✓ Token & OAuth Management:** จัดการรีเฟรชสิทธิ์การเข้าถึง (Refresh Access Tokens) ของบัญชีโซเชียลมีเดียต่างๆ ให้พร้อมใช้งานเสมอ
* **✓ Publication Logging:** ตรวจสอบและบันทึก URL ของวิดีโอที่เผยแพร่สำเร็จ และรหัส Post ID ลงในระบบฐานข้อมูลกลาง

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Video Editing & Rendering:** ห้ามทำการแก้ไขหรือเรนเดอร์วิดีโอใหม่ (หน้าที่ของ Render Engine)
* **✗ Graphic Manipulation:** ห้ามแต่งภาพ หน้าปก หรือแทรกโลโก้เพิ่มเติม
* **✗ Real-time Comment Replying:** ห้ามตอบคอมเมนต์ลูกค้าใต้โพสต์โดยตรง (หน้าที่ของระบบ CRM / Chatbot ภายนอก)

---

## 4. Inputs & Outputs

* **Input:** ข้อมูลผลการเรนเดอร์วิดีโอ (`RENDER_OUT`) + รายละเอียดทรัพย์สินดิบ (`PROPERTY_OUT`) + ค่าการเลือกเป้าหมายแพลตฟอร์ม (Destination Platforms List)
* **Output:** JSON Payload ตามมาตรฐาน `PUBLISH_OUT` บันทึกลิงก์โพสต์จริงจากทุกสื่อสังคมออนไลน์

---

## 5. JSON Contract

### Input JSON Structure
```json
{
  "property_id": "PROP-TH-00109",
  "final_video_url": "https://cdn.mmgs.io/renders/PROP-TH-00109_final_9_16.mp4",
  "property_details": {
    "title": "บ้านเดี่ยว 2 ชั้น สไตล์โมเดิร์นลอฟท์ พระราม 9",
    "price_thb": 12900000,
    "raw_address": "พระราม 9",
    "highlight_features": ["บ้านเดี่ยว 2 ชั้น", "พื้นที่ 80 ตารางวา"]
  },
  "target_platforms": ["TIKTOK", "YOUTUBE_SHORTS", "FACEBOOK_REELS"]
}
```

### Output JSON Structure (`PUBLISH_OUT`)
```json
{
  "property_id": "PROP-TH-00109",
  "status": "SUCCESS",
  "published_destinations": [
    {
      "platform": "TIKTOK",
      "post_id": "7182938491029384",
      "publish_url": "https://www.tiktok.com/@broker/video/7182938491029384",
      "published_at": "2023-10-27T10:15:30Z"
    },
    {
      "platform": "YOUTUBE_SHORTS",
      "post_id": "yS82jD83kd",
      "publish_url": "https://youtube.com/shorts/yS82jD83kd",
      "published_at": "2023-10-27T10:16:02Z"
    }
  ]
}
```

---

## 6. State Machine

```text
[PUBLISH_INIT]
      │
      ▼
[GENERATE_CAPTIONS]   ──► (สร้างคำบรรยายล้มเหลว) ──► [FALLBACK: Use Standard Template]
      │
      ▼
[QUEUE_FOR_UPLOAD]    ──► (คิวยาว/ติด Rate Limit) ──► [WAIT_AND_RETRY]
      │
      ▼
[API_UPLOADING]       ──► (Token หมดอายุ 401)      ──► [REFRESH_OAUTH_TOKEN] ──► [RETRY]
      │
      ▼
[VERIFY_PUBLICATION]  ──► (วิดีโอโดนแบน/ลิขสิทธิ์)   ──► [MARK_FAILED_FLAG]
      │
      ▼
[PUBLISH_COMPLETED]
```

---

## 7. Retry & Error Handling

* **Expired OAuth Token (Error `ERR_PUB_01`):** หากการยิง API โพสต์ล้มเหลวเนื่องจาก Token หมดอายุ ระบบต้องจับ Exception นี้แล้วเรียกใช้ฟังก์ชัน Refresh Token ทันที จากนั้นจึงยิงคำขออัปโหลดใหม่อีกครั้ง
* **Platform Rate Limit (Error `ERR_PUB_02`):** หากแพลตฟอร์มตอบกลับมาด้วย HTTP Code 429 (Too Many Requests) ระบบ Queue Controller จะต้องเลื่อนการอัปโหลดของวิดีโอนี้ออกไป 30 นาที แล้วจึงลองประมวลผลใหม่

---

## 8. Best Practices

* **Asynchronous Chunked Upload:** สำหรับวิดีโอที่มีขนาดใหญ่ ให้ใช้ระบบอัปโหลดแบบแยกส่วน (Chunked Upload APIs) เพื่อความเสถียร หากการเชื่อมต่อขาดหายกลางคัน จะได้ไม่ต้องส่งไฟล์ใหม่ตั้งแต่ต้น
* **Hashtag Normalization:** ป้อนแฮชแท็กที่เป็นที่นิยมและตรงหมวดหมู่เสมอ เช่น `#บ้านเดี่ยวพระราม9 #บ้านลอฟท์ #อสังหาริมทรัพย์` เพื่อเพิ่มโอกาสการมองเห็น

---

## 9. Anti-Patterns

* **การโพสต์วิดีโอดิบที่เรนเดอร์ไม่เสร็จ (Publishing Raw Assets):** ห้ามทำตัวเลี่ยงคิวแล้วส่งไฟล์ B-roll จาก Video Engine ที่ไม่มีลายน้ำและข้อมูลติดต่อขึ้นช่องทางสาธารณะเป็นอันขาด

---

## 10. Claude Rules for Publish Engine Operations

* **Secure Credentials Handling:** ห้ามทำการ Print หรือ Log ค่า Access Tokens, Client Secrets, หรือ API keys ของบัญชีลงในหน้าประวัติ Console หรือ Error Logs เป็นอันขาด
* **Exact Platform Limits:** ตรวจสอบความยาว Caption และชนิดไฟล์วิดีโอก่อนยิง API ให้เป็นไปตามกฎเหล็กของแต่ละผู้ให้บริการเครือข่ายสังคมออนไลน์อย่างเคร่งครัด

---

## 11. Migration Guide

1. **ระบบเดิม:** นายหน้าดาวน์โหลดไฟล์วิดีโอผลลัพธ์จาก Google Drive/n8n ไปกดอัปโหลดผ่านมือถือเองทีละเครื่อง
2. **ระบบใหม่:**
   * ลงทะเบียนแอปพลิเคชันนักพัฒนา (Developer Apps) บน TikTok Developer, Google Cloud Console, และ Facebook Developer
   * เซ็ตระบบ OAuth 2.0 บนตัว Orchestrator (n8n/Backend API)
   * เขียน Node ดึงค่า `final_video_url` ส่งเข้า API Gateway ย่อยของ Publish Engine เพื่อกระจายงานขึ้น Social Media ทันทีแบบ Auto-Post
```
```

---

ไฟล์ `14_PUBLISH_ENGINE.md` เสร็จสมบูรณ์เรียบร้อยครับ 
โมดูลถัดไปคือ **`15_ANALYTICS_ENGINE.md`** ทำหน้าที่ติดตามผลงานหลังโพสต์ ประเมินยอดวิว การมีส่วนร่วม (Engagement) และคำนวณราคาค่าบริการทั้งหมด (Cost Engine) ที่เกิดขึ้นจริงในโปรเจกต์นี้

หากต้องการไปต่อ พิมพ์คำสั่ง "ต่อ" ได้เลยครับ!