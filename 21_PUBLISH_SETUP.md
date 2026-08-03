# 21. คู่มือเปิดใช้งาน Publish Engine (ต่อ token แต่ละแพลตฟอร์ม)

> Version: 1.0.0 · เขียน 2026-08-01
> ระบบโพสต์เขียนเสร็จและทดสอบแล้ว **สิ่งเดียวที่ยังขาดคือ token** ของแต่ละแพลตฟอร์ม
> ไฟล์นี้บอกว่าแต่ละอันขอที่ไหน ใช้เวลานานแค่ไหน และมีข้อจำกัดอะไรที่ต้องรู้ก่อนเริ่ม

---

## สรุปสั้นที่สุด

| ปลายทาง | ใช้ได้ตอนนี้ | ต้องทำอะไร | ใช้เวลา |
|---|---|---|---|
| **ชุดโพสต์เอง (กลุ่ม FB)** | ✅ **ใช้ได้เลย** | ไม่ต้องทำอะไร | - |
| **Facebook Page + Reels** | ⬜ | ขอ Page Access Token แบบไม่มีวันหมดอายุ | ~30 นาที |
| **LINE OA** | 🔶 ครึ่งเดียว | มี token แล้ว แต่ต้องมีที่ฝากไฟล์ (`PUBLIC_MEDIA_BASE_URL`) ถ้าจะส่งคลิป | ~20 นาที |
| **Instagram Reels** | ⬜ | ผูก IG เป็น Business account กับเพจ + ต้องมีที่ฝากไฟล์ | ~20 นาที (หลังทำ FB) |
| **TikTok** | ⬜ | สมัคร developer + รอ TikTok ตรวจ **ก่อนตรวจผ่านโพสต์ได้แค่แบบส่วนตัว** | 2-14 วัน |
| **YouTube Shorts** | ⬜ | Google Cloud OAuth + ขอ refresh token ครั้งเดียว | ~40 นาที |

**เริ่มจาก Facebook ก่อน** — เป็นเพจหลักที่อยากให้เคลื่อนไหวทุกวัน และได้ทั้ง Page feed + Reels จาก token เดียวกัน

---

## ⚠️ เรื่องที่ต้องรู้ก่อน (ไม่ใช่ข้อจำกัดของระบบนี้ แต่เป็นของแพลตฟอร์ม)

### 1. กลุ่ม Facebook โพสต์อัตโนมัติไม่ได้ — ไม่มีทางเลย
Meta ปิด `publish_to_groups` และ endpoint `/{group-id}/feed` ตั้งแต่ปี 2020 และไม่มีตัวแทน
เครื่องมือที่โฆษณาว่า "โพสต์ลงกลุ่มอัตโนมัติ" ทุกตัวใช้วิธีปลอมเป็นเบราว์เซอร์ ซึ่งผิด TOS และโดนล็อกบัญชีได้

**ทางออกที่ทำไว้ให้แล้ว**: `MANUAL_KIT` — ระบบเตรียมโฟลเดอร์ให้ครบ (คลิป + ภาพปก + `caption.txt`)
เปิดไฟล์ กด Cmd+A Cmd+C วางในกลุ่ม แนบคลิป กดโพสต์ เหลืองานแค่เท่านี้จริงๆ
**ส่วนนี้ใช้ได้แล้วตั้งแต่ตอนนี้ ไม่ต้องรอ token อะไรเลย**

### 2. Marketplace ก็ไม่มี API เหมือนกัน — ใช้ `MANUAL_KIT` เช่นกัน

### 3. TikTok ก่อนผ่านการตรวจ โพสต์ได้แต่แบบ private
แอปที่ยังไม่ผ่าน content review ของ TikTok จะถูกบังคับให้ทุกโพสต์เป็น `SELF_ONLY`
ไม่ใช่บั๊ก — ตั้ง `TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE` ได้หลังผ่านการตรวจแล้วเท่านั้น

### 4. Instagram กับ LINE ดึงไฟล์จากลิงก์เท่านั้น อัปโหลดตรงไม่ได้
Facebook / TikTok / YouTube รับไฟล์จากเครื่องนี้ตรงๆ ได้ **แต่ IG กับ LINE ไม่รับ**
ทั้งสองเจ้าจะเข้ามาโหลดไฟล์จาก URL สาธารณะเอง จึงต้องมีที่ฝากไฟล์ก่อน (ดูหัวข้อ `PUBLIC_MEDIA_BASE_URL`)

---

## A. Facebook Page + Facebook Reels

เพจ: **ติดดินบินโดรน - ขายที่ดินนครนายก** (`page_id` = `1050500211482963`)
App ID: `1718330986054662` — บันทึกไว้ใน `.env` แล้ว

### มีตัวช่วยทำให้อัตโนมัติ

ต้องเก็บมาแค่ **2 อย่าง** ที่เหลือคำสั่งเดียวจบ:

**(1) User Token** — ~2 นาที
1. เปิด https://developers.facebook.com/tools/explorer/
2. มุมขวาบน เลือกแอป (App ID `1718330986054662`)
3. กด **Add a Permission** ใส่ครบ **3 อัน**:

   | permission | ทำอะไร |
   |---|---|
   | `pages_manage_posts` | โพสต์ทุกชนิดลงเพจ — ข้อความ รูป **วิดีโอ** ลิงก์ |
   | `pages_read_engagement` | ตัวที่ต้องมีคู่กัน (dependency ของตัวบน) |
   | `pages_show_list` | ให้แอปเห็นรายการเพจที่เป็นแอดมิน |

   > **ไม่มี `publish_video` แล้ว** — ถูกยกเลิกไปพร้อม `publish_actions`/`publish_pages`
   > ตอนนี้ไม่มีสิทธิ์แยกสำหรับวิดีโอ ใช้ `pages_manage_posts` ตัวเดียวครอบคลุมหมด
   > ถ้าหาไม่เจอในรายการ ไม่ใช่เพราะหาไม่เป็น แต่เพราะมันไม่มีอยู่จริงแล้ว

4. กด **Generate Access Token**
   ⚠️ **หน้าต่างสิทธิ์จะเด้งมา ต้อง "ติ๊กเลือกเพจ" ด้วย** — ถ้ากดผ่านไป `/me/accounts` จะว่างเปล่า
   ซึ่งเป็นสาเหตุอันดับหนึ่งของอาการ "ให้สิทธิ์แล้วแต่ระบบไม่เห็นเพจ"
5. คัดลอกค่าในช่อง **Access Token** (ยาวมาก ขึ้นต้นด้วย `EAA...`)

> **ต้องผ่าน App Review ไหม?** — ไม่ต้อง ถ้าเป็นเพจที่ตัวเองเป็นแอดมินอยู่แล้ว
> ทดสอบผ่าน Graph API Explorer ได้เลย · App Review จำเป็นเมื่อจะให้แอปใช้กับเพจของคนอื่น

**(2) App Secret** — ~30 วินาที
App Dashboard → **App settings** → **Basic** → ช่อง **App secret** → กด **Show**

### แล้วรันคำสั่งเดียว

```bash
npm run publish -- fb:setup \
  --app-id 1718330986054662 \
  --user-token <USER_TOKEN> \
  --app-secret <APP_SECRET>
```

ตัวช่วยจะ:
1. ตรวจว่า token ใช้ได้ และสิทธิ์ครบไหม (ขาดอันไหนบอกชัด)
2. แลกเป็น token อายุยาวให้
3. ดึง **Page token ที่ไม่มีวันหมดอายุ**
4. เขียน `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` ลง `.env` ให้เลย

> **โทเคนไม่ถูกแสดงบนหน้าจอและไม่เข้า shell history** — ต่างจากการพิมพ์ curl เอง
> ถ้าดูแลหลายเพจ ระบบจะบอกว่าเห็นเพจไหนบ้าง เลือกด้วย `--page-id <id>`
> ยังไม่มี App Secret ก็รันได้ (ข้าม `--app-secret`) แต่ token จะหมดอายุใน ~1 ชม. ใช้ทดสอบเท่านั้น

### ตรวจว่าใช้ได้จริง (ไม่โพสต์อะไร แค่อ่านชื่อเพจ)

```bash
npm run publish -- verify
npm run publish -- readiness
```

> **ต้องเป็นแอปที่ผ่าน App Review หรือเปล่า?** ไม่ต้อง ตราบใดที่บัญชีที่ขอ token
> เป็นแอดมินของเพจนั้นเอง — Meta อนุญาตให้ใช้ในโหมด Development ได้

---

## B. LINE OA (มี token แล้ว)

`LINE_CHANNEL_ACCESS_TOKEN` อยู่ใน `.env` แล้ว ยืนยันแล้วว่าใช้ได้ (บัญชี "ติดดินบินโดรน" `@244raxjb`)

**ข้อความอย่างเดียว broadcast ได้เลย** ส่วนคลิปต้องมี `PUBLIC_MEDIA_BASE_URL` ก่อน

> ⚠️ `broadcast` ส่งหาผู้ติดตาม**ทุกคน** และ**ยกเลิกไม่ได้** ระบบจึงบังคับให้ต้องใส่ `--live` เอง
> เช็คโควตาก่อนได้ด้วย `npm run publish -- verify`

---

## C. `PUBLIC_MEDIA_BASE_URL` (ที่ฝากไฟล์ — จำเป็นสำหรับ IG และ LINE)

ต้องเป็น URL สาธารณะที่ชี้ไปยังไฟล์ในโฟลเดอร์ `output/` ตัวเลือกเรียงจากง่ายไปยาก:

1. **Cloudflare R2 / Backblaze B2** — ฟรีระดับที่ใช้จริงเพียงพอ ตั้ง public bucket
2. **Cloudflare Tunnel** — เปิดเครื่องนี้ออกเน็ตชั่วคราว (`cloudflared tunnel --url http://localhost:3000`)
   เหมาะกับทดลอง ไม่เหมาะกับใช้จริงเพราะต้องเปิดเครื่องทิ้งไว้
3. **VPS + nginx** — ถ้าจะย้ายทั้งระบบขึ้นเซิร์ฟเวอร์อยู่แล้ว

```
PUBLIC_MEDIA_BASE_URL=https://media.your-domain.com/output
```

> เกี่ยวกับ Phase 1 ของ `20_ROADMAP.md` โดยตรง: URL วิดีโอของ Kling หมดอายุใน 30 วัน
> การมีที่ฝากไฟล์ของตัวเองแก้ทั้งสองปัญหาพร้อมกัน — ทำครั้งเดียวได้สองอย่าง

---

## D. Instagram Reels

ทำหลังจาก Facebook เสร็จแล้ว ใช้ token ตัวเดียวกัน

1. IG ต้องเป็น **Professional account** และผูกกับเพจ Facebook ข้างต้น
2. หา IG user id:

```bash
curl -s "https://graph.facebook.com/v21.0/<PAGE_ID>?fields=instagram_business_account\
&access_token=<PAGE_TOKEN>"
```

3. `.env`:

```
INSTAGRAM_BUSINESS_ID=<ค่า instagram_business_account.id>
```

เพิ่ม permission `instagram_basic`, `instagram_content_publish` ตอนขอ token ด้วย

---

## E. TikTok

1. https://developers.tiktok.com → Create App
2. เปิด product **Content Posting API** และขอ scope `video.publish`, `video.upload`
3. ทำ OAuth flow เพื่อให้ได้ user access token (อายุ 24 ชม. + refresh token 365 วัน)
4. `.env`:

```
TIKTOK_ACCESS_TOKEN=<access token>
TIKTOK_PRIVACY_LEVEL=SELF_ONLY     # เปลี่ยนเป็น PUBLIC_TO_EVERYONE ได้หลังผ่าน review
```

> access token อายุ 24 ชม. ทำให้โพสต์อัตโนมัติทุกวันด้วย token ตรงๆ ไม่ยั่งยืน
> ยังไม่ได้เขียน auto-refresh ให้ (ต่างจาก YouTube ที่ refresh ทุกครั้งอยู่แล้ว) —
> เป็นงานที่ควรทำก่อนเปิดโหมด `auto_publish` กับ TikTok

---

## F. YouTube Shorts

1. https://console.cloud.google.com → สร้างโปรเจกต์ → เปิด **YouTube Data API v3**
2. **OAuth consent screen** → External → เพิ่มอีเมลตัวเองเป็น Test user
3. **Credentials** → Create OAuth client ID → **Desktop app** → ได้ client id + secret
4. ขอ refresh token ครั้งเดียว (scope `https://www.googleapis.com/auth/youtube.upload`)
5. `.env`:

```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_PRIVACY_STATUS=private     # เปลี่ยนเป็น public เมื่อพร้อม
```

> refresh token ถูกแลกเป็น access token ใหม่ทุกครั้งที่โพสต์ จึงไม่หมดอายุระหว่างทาง
> (ยกเว้นแอปยังอยู่สถานะ Testing — Google จะหมดอายุ refresh token ทุก 7 วัน
> แก้ด้วยการกด Publish app ใน consent screen)

---

## ตรวจสอบว่าพร้อมแล้ว

```bash
npm run publish -- readiness    # ดูรายชื่อ ปลายทางไหนพร้อม / ขาด env ตัวไหน
npm run publish -- verify       # ยิงเช็ค token จริงกับ LINE / Facebook (ไม่โพสต์อะไร)
```

---

## เปิดโหมดโพสต์อัตโนมัติทุกวัน

1. ทดสอบแบบซ้อมก่อน — ไม่มีอะไรถูกโพสต์จริง:

```bash
npm run publish -- plan --days 7
npm run publish -- post 2026-08-02T19:00        # ไม่มี --live = ซ้อม
```

2. ลองโพสต์จริงทีละอันก่อน:

```bash
npm run publish -- post 2026-08-02T19:00 --live
```

3. พอใจแล้วค่อยเปิดอัตโนมัติ:

```bash
npm run publish -- profile --set auto_publish=true
```

4. ตั้ง cron ให้เช็คทุกชั่วโมง (ระบบจะโพสต์เฉพาะช่องที่ถึงเวลาแล้วเท่านั้น):

```bash
crontab -e
# เพิ่มบรรทัดนี้ (แก้ path ให้ตรงเครื่อง)
0 * * * * cd "$HOME/Library/CloudStorage/OneDrive-ส่วนบุคคล/AI_BIBLE" && \
  /bin/zsh -lc 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; npm run daily' \
  >> /tmp/mmgs-daily.log 2>&1
```

> **ทำไมต้องรายชั่วโมง ไม่ใช่ตั้งเวลาตรงๆ**: คิวใช้ `slot_id` เป็นกุญแจ ช่องเดิมถูกหยิบซ้ำไม่ได้
> รันบ่อยจึงปลอดภัย และถ้าเครื่องหลับตอน 19:00 ตื่นมา 20:30 ก็ยังโพสต์ทัน (ผ่อนผัน 3 ชม.)
> เกินจากนั้นระบบจะข้ามวันนั้นไป ดีกว่าโพสต์ตอนตีสองซึ่งไม่มีคนเห็น

---

## เมื่อคีย์รั่ว / ต้องเปลี่ยน

`03_SYSTEM_RULES.md` ห้าม log token และโค้ดทุกจุดทำตามนั้น (token อยู่ใน header เท่านั้น
ไม่เคยอยู่ใน query string ที่จะติดไปกับ log ของ proxy)

แต่ตามที่ `20_ROADMAP.md` เตือนไว้ — `ANTHROPIC_API_KEY`, `KLING_API_KEY`,
`GOOGLE_MAPS_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN` **เคยถูกพิมพ์ในแชทมาก่อน**
ควรหมุนใหม่ทั้งหมดก่อนเปิดโหมดอัตโนมัติจริง
