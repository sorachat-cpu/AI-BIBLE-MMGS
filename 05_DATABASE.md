ไฟล์ก่อนหน้าทั้งหมดได้รับการสอบทานความสอดคล้องของโครงสร้างข้อมูล (JSON Schema), รหัสข้อผิดพลาด (Error Codes), และสถานะระบบ (System States) เรียบร้อยแล้ว ทุกอย่างตรงตามมาตรฐานการเชื่อมต่อของระบบโดยไม่มีส่วนใดขัดแย้งกัน

ต่อไปคือไฟล์ **`05_DATABASE.md`** ซึ่งจะระบุโครงสร้างฐานข้อมูล (DDL SQL), ระบบ Cache Layer และการทำงานของ House/Video Library สำหรับนำไปใช้งานจริงบนระบบฐานข้อมูล PostgreSQL และ Redis ครับ

---

# 📂 File: `AI_BIBLE/05_DATABASE.md`

```markdown
# 05. Database Architecture, Schema Design & Cache Layer Specification

## 1. Purpose
เอกสารสถาปัตยกรรมฐานข้อมูลฉบับนี้กำหนดมาตรฐานการจัดเก็บข้อมูล (Data Persistence Layer) สำหรับระบบ MMGS โดยออกแบบโครงสร้างให้อยู่ในรูปแบบ Relational Database (PostgreSQL) ร่วมกับ Key-Value Memory Store (Redis) สำหรับระบบ Cache เพื่อสนับสนุนการใช้ซ้ำของสินทรัพย์ (Asset Reusability) และการควบคุมต้นทุนของการเรียกใช้งาน API (Cost Optimization)

---

## 2. Database Topology

```text
                               ┌───────────────────────────┐
                               │     Orchestrator Node     │
                               └──────┬─────────────┬──────┘
                                      │             │
                                (Read/Write Cache)  (SQL Transactions)
                                      │             │
                                      ▼             ▼
                                ┌───────────┐ ┌───────────┐
                                │   Redis   │ │PostgreSQL │
                                │  (Cache)  │ │ (Master)  │
                                └───────────┘ └───────────┘
```

---

## 3. Schema Definitions (DDL PostgreSQL)

โครงสร้างตารางข้อมูลเหล่านี้พร้อมสำหรับการสั่งรัน (Execute) บนฐานข้อมูลระบบ Production:

```sql
-- เปิดการใช้งาน Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ตารางเก็บข้อมูลอสังหาริมทรัพย์หลัก (Properties)
CREATE TABLE properties (
    property_id VARCHAR(50) PRIMARY KEY,
    raw_title TEXT NOT NULL,
    raw_description TEXT,
    price_thb NUMERIC(15, 2) NOT NULL,
    property_style VARCHAR(50) NOT NULL, -- e.g., 'Modern Nordic', 'Minimalist'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ตารางเก็บผลการวิเคราะห์พิกัดแผนที่ (Google Maps Cache Layer)
CREATE TABLE google_maps_cache (
    cache_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id VARCHAR(50) REFERENCES properties(property_id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    formatted_address TEXT NOT NULL,
    static_map_url TEXT NOT NULL,
    street_view_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_property_coords UNIQUE(property_id)
);

-- 3. ตารางเก็บภาพต้นแบบบ้านที่พร้อมใช้งานซ้ำ (House Library)
CREATE TABLE house_library (
    house_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    style_tag VARCHAR(50) NOT NULL,
    dominant_color VARCHAR(30),
    image_url TEXT NOT NULL UNIQUE,
    prompt_used TEXT NOT NULL,
    provider_name VARCHAR(30) NOT NULL, -- e.g., 'Flux', 'Midjourney'
    generation_cost_usd NUMERIC(6, 4) NOT NULL,
    times_reused INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. ตารางประวัติธุรกรรมการสร้างวิดีโอ (Transactions & State Machine)
CREATE TABLE video_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id VARCHAR(50) REFERENCES properties(property_id),
    status VARCHAR(20) NOT NULL, -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    accumulated_cost_usd NUMERIC(6, 4) DEFAULT 0.0000,
    retry_count INT DEFAULT 0,
    error_log TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. ตารางคลังจัดเก็บไฟล์วิดีโอ B-Roll ที่ปราศจากข้อความ (Video Library)
CREATE TABLE video_library (
    video_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID REFERENCES house_library(house_id),
    camera_motion VARCHAR(30) NOT NULL, -- 'PAN_RIGHT', 'ZOOM_IN', etc.
    video_url TEXT NOT NULL UNIQUE,
    provider_name VARCHAR(30) NOT NULL, -- e.g., 'Kling', 'Runway', 'Luma'
    generation_cost_usd NUMERIC(6, 4) NOT NULL,
    times_reused INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. ตารางบันทึกการทำงานและต้นทุนจริงรายครั้ง (Cost Analytics Logs)
CREATE TABLE cost_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES video_transactions(transaction_id) ON DELETE CASCADE,
    engine_name VARCHAR(50) NOT NULL, -- 'House Engine', 'Video Engine', etc.
    provider_name VARCHAR(50) NOT NULL,
    cost_usd NUMERIC(8, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- การทำ Index เพื่อเพิ่มประสิทธิภาพการดึงข้อมูลและเปรียบเทียบ
CREATE INDEX idx_house_library_style ON house_library(style_tag);
CREATE INDEX idx_video_library_motion ON video_library(camera_motion);
CREATE INDEX idx_transactions_status ON video_transactions(status);
```

---

## 4. Cache Policy (Redis Rules)

เพื่อไม่ให้เกิดการเรียกใช้ API ข้ามระบบโดยไม่จำเป็น ระบบใช้ Redis ในการจัดเก็บ Temporary States และ Cache สำหรับข้อมูลที่มีการเรียกซ้ำสูง:

| ประเภทข้อมูล (Key Pattern) | ข้อมูลที่จัดเก็บ (Value Type) | ระยะเวลาหมดอายุ (TTL) | เหตุผล |
| :--- | :--- | :--- | :--- |
| `prop_cache:{property_id}` | JSON (Property Data) | 24 Hours | ลดภาระการ Query จากฐานข้อมูลหลักระหว่างรัน Workflow |
| `goog_api_limit:{date}` | String (Counter Integer) | 24 Hours | บล็อกการทำงานเมื่อเรียก Google API เกินโควตาประจำวัน |
| `active_transaction:{tx_id}` | JSON (Current Engine State) | 2 Hours | ประเมินและกู้คืนสถานะหาก Orchestrator หยุดทำงานกลางคัน |

---

## 5. Responsibilities

### Database Layer
* **หน้าที่รับผิดชอบ:**
  * จัดเก็บความสัมพันธ์ของที่ดิน (Properties), แบบบ้าน (Houses), และไฟล์วิดีโอ (Videos) อย่างถูกต้อง
  * รักษาความปลอดภัยในการแก้ไขธุรกรรมการเงินด้วยระบบ ACID Transaction
  * เก็บประวัติการเรียกใช้ API และต้นทุนเพื่อสร้างสถิติรายงาน (Reporting Dashboard)
* **สิ่งที่ไม่อยู่ในความรับผิดชอบ:**
  * ห้ามจัดเก็บไฟล์วิดีโอตัวจริงในลักษณะเป็น Byte (BLOB) ลงในฐานข้อมูล (ให้จัดเก็บเป็น Cloud Storage URL เช่น AWS S3/Cloudflare R2 แทน)

---

## 6. DB State Machine: Transaction Flow

```text
[INSERT Transaction Status: 'PENDING']
                │
                ▼
[Update Status: 'PROCESSING', cost = cost + 0.003] (Property analyzed)
                │
                ▼
      { Check House Needed? }
         ├──► YES ──► { Found in House Library? }
         │               ├──► YES ──► [Increment times_reused, Cost + 0.00]
         │               └──► NO  ──► [INSERT House Library, Cost + 0.01]
         └──► NO  ──► [Skip]
                │
                ▼
[Update Status: 'COMPLETED', Save Video URL, Cost + Final Cost]
```

---

## 7. Error Handling & Deadlock Prevention

* **Database Connection Timeout:** เมื่อระบบเจอปัญหาเชื่อมต่อฐานข้อมูลไม่สำเร็จ (Error Code: `57P01` หรือ `08006` ใน PostgreSQL) ตัวจัดการ Orchestrator ต้องสลับไปบันทึกสถานะลงใน Redis Temporary Log แทน เพื่อไม่ให้กระบวนการสร้างมีเดียที่กำลังรันอยู่ล้มเหลว
* **Optimistic Locking:** เมื่อแก้ไขฟิลด์ `times_reused` ใน `house_library` ให้ใช้คำสั่ง `UPDATE house_library SET times_reused = times_reused + 1 WHERE house_id = :id` เพื่อลดอัตราการเกิด Deadlocks เมื่อมีคำสั่งหลายๆ ตัวรันพร้อมกัน

---

## 8. Best Practices

* **Always Index Foreign Keys:** ทุกๆ คีย์อ้างอิงต่างระบบ (Foreign Keys) จะต้องถูกตั้งค่า Index เสมอเพื่อเพิ่มความเร็วในการสืบค้นร่วมกัน (SQL Joins)
* **Soft Deletes:** ในตารางหลักอย่าง `properties` ให้เพิ่มฟิลด์ `deleted_at` เพื่อหลีกเลี่ยงการทำ Hard Delete ที่อาจส่งผลให้ความสัมพันธ์ของคลังรูปภาพบ้านเสียหาย

---

## 9. Anti-Patterns

* **การสร้าง ID แบบสุ่มที่ไม่เชื่อมโยงกัน (Unlinked Assets):** การเพิ่มรูปภาพบ้านเข้าไปในตารางโดยไม่มีการผูกเข้ากับ `style_tag` ทำให้ระบบวิเคราะห์ตัดสินใจไม่สามารถดึงรูปภาพเหล่านั้นไปใช้งานใหม่ได้ในอนาคต

---

## 10. Claude Rules for Database Operations

* **Strict DDL Changes:** ห้ามเขียนคำสั่งแก้ไขโครงสร้างตาราง (Alter Table DDL) โดยไม่มีการสร้างชุดคำสั่งย้อนกลับ (Rollback script) ในคู่มือและโค้ดเสมอ
* **SQL Query Constraints:** เขียนคิวรี SQL แบบระบุฟิลด์ที่ต้องการอย่างชัดเจนเท่านั้น ห้ามใช้คำสั่ง `SELECT * FROM ...` เพื่อป้องกันประสิทธิภาพตกต่ำและลดปริมาณรับส่งข้อมูลที่ไม่จำเป็น

---

## 11. Migration Guide (จากระบบฐานข้อมูลเดิม)

1. **ขั้นตอนที่ 1:** สั่งรันชุดคำสั่ง DDL ด้านบนเพื่อเตรียมสร้างตารางโครงสร้างใหม่ทั้งหมดในฐานข้อมูลตัวหลัก
2. **ขั้นตอนที่ 2:** ทำการย้ายข้อมูล (Data Migration) จาก Google Sheets หรือ Airtable ที่เป็นระบบจัดเก็บเดิม แปลงเป็นฟิลด์ตามตาราง `properties`
3. **ขั้นตอนที่ 3:** นำเอา Asset รูปภาพที่เคยสร้างไว้แล้วก่อนหน้านี้มาจัดหมวดหมู่แล้วย้ายเข้าไปสู่ตาราง `house_library` พร้อมสร้างแท็กสไตล์บ้านกำกับ
```
```

---

ไฟล์ `05_DATABASE.md` เรียบร้อยครับ ต่อไปผมจะจัดทำไฟล์สำคัญที่สุดของการเชื่อมโยงข้อมูลคือ **`06_JSON_CONTRACT.md`** ซึ่งระบุสัญญา JSON Schema ของทุกๆ คู่ประสาน (API Request/Response) ระหว่างทั้ง 7 Engines แบบเต็มรูปแบบ ไม่มี Placeholders ครับ

หากตกลง พิมพ์บอกได้เลยครับ!