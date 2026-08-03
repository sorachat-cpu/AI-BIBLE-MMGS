ต่อครับ ไฟล์นี้สำคัญมาก เพราะจะรวมทั้ง **Analytics Engine + Cost Engine** เพื่อให้ระบบรู้ว่าแต่ละวิดีโอ “คุ้มไหม”, “แพงตรงไหน”, “Provider ไหนควรใช้”, และ “ควร reuse asset หรือ regenerate” อย่างเป็นระบบ

---

# 📂 File: `AI_BIBLE/15_ANALYTICS_ENGINE.md`

```markdown
# 15. Analytics Engine & Cost Engine Specification

## 1. Purpose

Analytics Engine มีหน้าที่ติดตาม วิเคราะห์ และสรุปผลการทำงานของระบบ MMGS หลังจากวิดีโอถูกสร้าง เรนเดอร์ และเผยแพร่แล้ว โดยครอบคลุมทั้ง 2 มิติหลัก:

1. **Performance Analytics**
   - ยอดวิว
   - ยอดไลก์
   - ยอดแชร์
   - ยอดคอมเมนต์
   - อัตราการดูจบ
   - Engagement Rate
   - Click-through Rate
   - Lead Conversion

2. **Cost Analytics / Cost Engine**
   - ต้นทุน Claude / LLM
   - ต้นทุน Google API
   - ต้นทุน House Generation
   - ต้นทุน Video Generation
   - ต้นทุน Render
   - ต้นทุน Voice / Audio
   - ต้นทุน Publish
   - ต้นทุนรวมต่อวิดีโอ
   - ต้นทุนเฉลี่ยต่อ Provider
   - ต้นทุนต่อยอดวิว
   - ต้นทุนต่อ Lead

Analytics Engine ไม่ใช่แค่ระบบรายงานผล แต่เป็นระบบตัดสินใจเชิงธุรกิจที่ใช้ข้อมูลจริงเพื่อปรับปรุง Workflow, ลดต้นทุน, เลือก Provider ที่เหมาะสม และเพิ่มผลลัพธ์ของแคมเปญอสังหาริมทรัพย์ในระยะยาว

---

## 2. Core Principle

หลักคิดของ Analytics Engine คือ:

```text
Every workflow execution must be measurable.
Every provider decision must be explainable.
Every generated asset must have cost history.
Every published video must have performance feedback.
```

หรือสรุปสั้น ๆ:

> ถ้าระบบสร้างอะไรขึ้นมา ต้องรู้ว่ามันใช้เงินเท่าไร  
> ถ้าระบบโพสต์อะไรออกไป ต้องรู้ว่ามันได้ผลแค่ไหน  
> ถ้าระบบเลือก Provider ใด ต้องรู้ว่าทำไมถึงเลือก

---

## 3. Architecture Overview

```text
                 ┌──────────────────────┐
                 │   Workflow Engines    │
                 │ Property/Google/Asset │
                 │ House/Video/Render    │
                 └──────────┬───────────┘
                            │
                            ▼
                    [ Cost Event Logs ]
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Analytics Engine                      │
│                                                        │
│  ┌──────────────────┐   ┌──────────────────────────┐   │
│  │ Cost Aggregator  │   │ Performance Collector    │   │
│  └────────┬─────────┘   └───────────┬──────────────┘   │
│           │                         │                  │
│           ▼                         ▼                  │
│  ┌──────────────────┐   ┌──────────────────────────┐   │
│  │ Provider Scorer  │   │ Campaign Insight Engine  │   │
│  └────────┬─────────┘   └───────────┬──────────────┘   │
│           │                         │                  │
│           └──────────────┬──────────┘                  │
│                          ▼                             │
│              [ Decision Feedback Layer ]               │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
               [Cost Engine / Provider Router]
```

---

## 4. Responsibilities

### Responsibilities

Analytics Engine รับผิดชอบ:

- เก็บต้นทุนของทุก Engine
- เก็บต้นทุนของทุก Provider
- สรุปต้นทุนต่อ Transaction
- สรุปต้นทุนต่อ Property
- สรุปต้นทุนต่อ Final Video
- สรุปต้นทุนต่อ Platform
- ดึงข้อมูล Performance จาก Social Platforms
- วิเคราะห์ว่า Provider ใดคุ้มค่าที่สุด
- วิเคราะห์ว่า Template ใดทำ Engagement ดีที่สุด
- วิเคราะห์ว่า Style Tag ใดทำผลลัพธ์ดีที่สุด
- ส่งข้อมูลกลับไปให้ Cost Engine ใช้ตัดสินใจในอนาคต

### Not Responsible

Analytics Engine ไม่รับผิดชอบ:

- ไม่สร้างวิดีโอ
- ไม่สร้างภาพบ้าน
- ไม่แก้ Prompt
- ไม่แก้ Caption แบบ real-time
- ไม่โพสต์ Social Media
- ไม่แก้ข้อมูล Property ต้นทาง
- ไม่ override การตัดสินใจของ Orchestrator โดยตรง

Analytics Engine ให้ข้อมูลประกอบการตัดสินใจ แต่ตัวที่ execute decision คือ Orchestrator หรือ Cost Engine Router

---

## 5. Inputs

Analytics Engine รับข้อมูลจากหลายแหล่ง:

### 5.1 Cost Events

จากทุก Engine:

```json
{
  "transaction_id": "8f83c8d3-578b-49ef-b328-3e47dc476902",
  "property_id": "PROP-TH-00109",
  "engine_name": "VIDEO_ENGINE",
  "provider_name": "KLING",
  "operation": "IMAGE_TO_VIDEO",
  "cost_usd": 0.1600,
  "duration_ms": 84000,
  "status": "SUCCESS",
  "created_at": "2026-07-02T10:30:00Z"
}
```

### 5.2 Publish Events

จาก Publish Engine:

```json
{
  "transaction_id": "8f83c8d3-578b-49ef-b328-3e47dc476902",
  "property_id": "PROP-TH-00109",
  "platform": "TIKTOK",
  "post_id": "7182938491029384",
  "publish_url": "https://www.tiktok.com/@broker/video/7182938491029384",
  "published_at": "2026-07-02T10:45:00Z"
}
```

### 5.3 Performance Metrics

จาก Social Media APIs:

```json
{
  "platform": "TIKTOK",
  "post_id": "7182938491029384",
  "views": 12834,
  "likes": 541,
  "comments": 23,
  "shares": 77,
  "saves": 91,
  "clicks": 34,
  "watch_time_seconds": 416203,
  "average_watch_seconds": 7.8,
  "collected_at": "2026-07-03T10:45:00Z"
}
```

---

## 6. Outputs

Analytics Engine ส่งออกข้อมูล 4 ประเภทหลัก:

1. Transaction Cost Summary
2. Provider Scorecard
3. Platform Performance Report
4. Recommendation Payload

---

## 7. JSON Contract

### 7.1 Analytics Input Contract

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AnalyticsEventInput",
  "type": "object",
  "required": [
    "event_id",
    "event_type",
    "transaction_id",
    "property_id",
    "created_at"
  ],
  "properties": {
    "event_id": {
      "type": "string"
    },
    "event_type": {
      "type": "string",
      "enum": [
        "COST_EVENT",
        "PUBLISH_EVENT",
        "PERFORMANCE_EVENT",
        "ERROR_EVENT"
      ]
    },
    "transaction_id": {
      "type": "string",
      "format": "uuid"
    },
    "property_id": {
      "type": "string"
    },
    "engine_name": {
      "type": "string"
    },
    "provider_name": {
      "type": "string"
    },
    "platform": {
      "type": "string",
      "enum": [
        "TIKTOK",
        "YOUTUBE_SHORTS",
        "FACEBOOK_REELS",
        "INSTAGRAM_REELS",
        "UNKNOWN"
      ]
    },
    "cost_usd": {
      "type": "number",
      "minimum": 0
    },
    "metrics": {
      "type": "object"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

---

### 7.2 Transaction Cost Summary Contract

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TransactionCostSummary",
  "type": "object",
  "required": [
    "transaction_id",
    "property_id",
    "total_cost_usd",
    "engine_breakdown",
    "provider_breakdown",
    "cost_status"
  ],
  "properties": {
    "transaction_id": {
      "type": "string",
      "format": "uuid"
    },
    "property_id": {
      "type": "string"
    },
    "total_cost_usd": {
      "type": "number"
    },
    "engine_breakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["engine_name", "cost_usd"],
        "properties": {
          "engine_name": {
            "type": "string"
          },
          "cost_usd": {
            "type": "number"
          }
        }
      }
    },
    "provider_breakdown": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["provider_name", "cost_usd"],
        "properties": {
          "provider_name": {
            "type": "string"
          },
          "cost_usd": {
            "type": "number"
          }
        }
      }
    },
    "cost_status": {
      "type": "string",
      "enum": [
        "UNDER_BUDGET",
        "NEAR_LIMIT",
        "OVER_BUDGET"
      ]
    }
  }
}
```

---

### 7.3 Provider Scorecard Contract

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProviderScorecard",
  "type": "object",
  "required": [
    "provider_name",
    "provider_type",
    "average_cost_usd",
    "success_rate",
    "average_latency_ms",
    "quality_score",
    "availability_status",
    "recommendation"
  ],
  "properties": {
    "provider_name": {
      "type": "string"
    },
    "provider_type": {
      "type": "string",
      "enum": [
        "LLM",
        "IMAGE_GENERATION",
        "VIDEO_GENERATION",
        "TTS",
        "MAPS",
        "RENDER"
      ]
    },
    "average_cost_usd": {
      "type": "number"
    },
    "success_rate": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "average_latency_ms": {
      "type": "number"
    },
    "quality_score": {
      "type": "number",
      "minimum": 0,
      "maximum": 100
    },
    "availability_status": {
      "type": "string",
      "enum": [
        "ONLINE",
        "DEGRADED",
        "OFFLINE",
        "QUOTA_EXCEEDED"
      ]
    },
    "recommendation": {
      "type": "string",
      "enum": [
        "PREFERRED",
        "ALLOW",
        "AVOID",
        "DISABLED"
      ]
    }
  }
}
```

---

### 7.4 Recommendation Payload Contract

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AnalyticsRecommendationPayload",
  "type": "object",
  "required": [
    "recommendation_id",
    "scope",
    "priority",
    "recommendation_type",
    "message",
    "suggested_action"
  ],
  "properties": {
    "recommendation_id": {
      "type": "string"
    },
    "scope": {
      "type": "string",
      "enum": [
        "PROVIDER",
        "WORKFLOW",
        "PROMPT",
        "TEMPLATE",
        "PLATFORM",
        "COST"
      ]
    },
    "priority": {
      "type": "string",
      "enum": [
        "LOW",
        "MEDIUM",
        "HIGH",
        "CRITICAL"
      ]
    },
    "recommendation_type": {
      "type": "string",
      "enum": [
        "SWITCH_PROVIDER",
        "DISABLE_PROVIDER",
        "REUSE_ASSET_MORE",
        "REDUCE_VIDEO_LENGTH",
        "CHANGE_PLATFORM_CAPTION",
        "CHANGE_TEMPLATE",
        "INVESTIGATE_FAILURE"
      ]
    },
    "message": {
      "type": "string"
    },
    "suggested_action": {
      "type": "object"
    }
  }
}
```

---

## 8. Cost Engine Model

Cost Engine เป็นส่วนย่อยสำคัญภายใน Analytics Engine และทำหน้าที่ช่วย Orchestrator ตัดสินใจเรื่องต้นทุนก่อนเรียก Provider ใด ๆ

### 8.1 Cost Components

ต้นทุนต่อวิดีโอหนึ่งรายการอาจประกอบด้วย:

```text
Property Engine       = LLM extraction cost
Google Engine         = Maps / Geocoding / Static API cost
Asset Engine          = OCR / Safety check cost
House Engine          = Image generation cost
Video Engine          = Image-to-video generation cost
Render Engine         = Compute/render cost
Overlay Engine        = QR + graphic render cost
Publish Engine        = API / upload processing cost
Analytics Engine      = metric collection cost
```

---

### 8.2 Example Cost Breakdown

```json
{
  "transaction_id": "8f83c8d3-578b-49ef-b328-3e47dc476902",
  "property_id": "PROP-TH-00109",
  "total_cost_usd": 0.176,
  "engine_breakdown": [
    {
      "engine_name": "PROPERTY_ENGINE",
      "cost_usd": 0.003
    },
    {
      "engine_name": "GOOGLE_ENGINE",
      "cost_usd": 0.001
    },
    {
      "engine_name": "HOUSE_ENGINE",
      "cost_usd": 0.010
    },
    {
      "engine_name": "VIDEO_ENGINE",
      "cost_usd": 0.160
    },
    {
      "engine_name": "RENDER_ENGINE",
      "cost_usd": 0.002
    }
  ],
  "provider_breakdown": [
    {
      "provider_name": "CLAUDE",
      "cost_usd": 0.003
    },
    {
      "provider_name": "GOOGLE_MAPS",
      "cost_usd": 0.001
    },
    {
      "provider_name": "FLUX",
      "cost_usd": 0.010
    },
    {
      "provider_name": "KLING",
      "cost_usd": 0.160
    }
  ],
  "cost_status": "UNDER_BUDGET"
}
```

---

## 9. Provider Selection Logic

Cost Engine ต้องเลือก Provider โดยใช้คะแนนรวม ไม่ใช่เลือกจากราคาถูกอย่างเดียว

### 9.1 Scoring Formula

```text
provider_score =
  (quality_score * 0.35)
+ (success_rate * 100 * 0.25)
+ (cost_score * 0.25)
+ (latency_score * 0.10)
+ (availability_score * 0.05)
```

### 9.2 Cost Score

```text
cost_score = 100 - ((provider_cost - lowest_cost) / lowest_cost * 100)
```

หาก `provider_cost` ต่ำสุด จะได้ cost_score = 100

### 9.3 Availability Score

```text
ONLINE         = 100
DEGRADED       = 60
QUOTA_EXCEEDED = 20
OFFLINE        = 0
```

### 9.4 Provider Routing Example

```json
{
  "requested_operation": "IMAGE_TO_VIDEO",
  "candidate_providers": [
    {
      "provider_name": "KLING",
      "estimated_cost_usd": 0.160,
      "quality_score": 82,
      "success_rate": 0.94,
      "average_latency_ms": 90000,
      "availability_status": "ONLINE"
    },
    {
      "provider_name": "RUNWAY",
      "estimated_cost_usd": 0.260,
      "quality_score": 90,
      "success_rate": 0.97,
      "average_latency_ms": 65000,
      "availability_status": "ONLINE"
    },
    {
      "provider_name": "VEO",
      "estimated_cost_usd": 0.220,
      "quality_score": 95,
      "success_rate": 0.91,
      "average_latency_ms": 120000,
      "availability_status": "QUOTA_EXCEEDED"
    }
  ],
  "selected_provider": "KLING",
  "selection_reason": "Best total score under budget; RUNWAY higher quality but exceeds preferred cost threshold; VEO quota exceeded."
}
```

---

## 10. State Machine

```text
[ANALYTICS_INIT]
        │
        ▼
[INGEST_COST_EVENTS]
        │
        ▼
[AGGREGATE_TRANSACTION_COST]
        │
        ▼
[COLLECT_PLATFORM_METRICS]
        │
        ▼
[CALCULATE_PERFORMANCE_KPI]
        │
        ▼
[UPDATE_PROVIDER_SCORECARD]
        │
        ▼
[GENERATE_RECOMMENDATIONS]
        │
        ▼
[ANALYTICS_READY]
```

---

## 11. KPI Definitions

### 11.1 Cost Per Video

```text
cost_per_video = total_cost_usd / number_of_final_videos
```

### 11.2 Cost Per View

```text
cost_per_view = total_cost_usd / total_views
```

### 11.3 Cost Per Lead

```text
cost_per_lead = total_cost_usd / total_leads
```

### 11.4 Engagement Rate

```text
engagement_rate =
  (likes + comments + shares + saves) / views
```

### 11.5 Watch Completion Proxy

ถ้าไม่มีค่า completion จาก platform ให้ใช้ proxy:

```text
watch_completion_proxy =
  average_watch_seconds / video_duration_seconds
```

---

## 12. Retry & Error Handling

### 12.1 Missing Cost Event

**Error Code:** `ERR_ANA_01`

หาก Engine ใดทำงานแล้วไม่ส่ง Cost Event กลับมา:

```text
1. Mark transaction as COST_INCOMPLETE
2. Estimate cost from provider default price table
3. Create warning log
4. Continue analytics process
```

ห้ามหยุด Workflow หลักเพียงเพราะ Analytics Event หาย แต่ต้อง mark ให้ตรวจสอบย้อนหลัง

---

### 12.2 Platform Metrics API Failure

**Error Code:** `ERR_ANA_02`

หากดึง metric จาก TikTok / YouTube / Facebook ไม่ได้:

```text
1. Retry after 15 minutes
2. Retry after 1 hour
3. Retry after 6 hours
4. Mark metric_status = UNAVAILABLE_TEMPORARY
```

---

### 12.3 Provider Score Outlier

**Error Code:** `ERR_ANA_03`

หาก Provider มี cost หรือ latency ผิดปกติ เช่น สูงกว่าค่าเฉลี่ย 5 เท่า:

```text
1. Mark sample as OUTLIER
2. Do not use it in average score immediately
3. Store for manual review
```

---

## 13. Database Tables

ควรเพิ่มตารางต่อไปนี้ในฐานข้อมูลหลัก

### 13.1 analytics_events

```sql
CREATE TABLE analytics_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    transaction_id UUID,
    property_id VARCHAR(50),
    engine_name VARCHAR(50),
    provider_name VARCHAR(50),
    platform VARCHAR(50),
    cost_usd NUMERIC(10, 6),
    metrics_json JSONB,
    status VARCHAR(30) DEFAULT 'RECORDED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_events_transaction_id
ON analytics_events(transaction_id);

CREATE INDEX idx_analytics_events_property_id
ON analytics_events(property_id);

CREATE INDEX idx_analytics_events_provider_name
ON analytics_events(provider_name);

CREATE INDEX idx_analytics_events_platform
ON analytics_events(platform);
```

---

### 13.2 provider_scorecards

```sql
CREATE TABLE provider_scorecards (
    provider_name VARCHAR(50) PRIMARY KEY,
    provider_type VARCHAR(50) NOT NULL,
    average_cost_usd NUMERIC(10, 6) DEFAULT 0,
    success_rate NUMERIC(5, 4) DEFAULT 0,
    average_latency_ms NUMERIC(12, 2) DEFAULT 0,
    quality_score NUMERIC(5, 2) DEFAULT 0,
    availability_status VARCHAR(30) DEFAULT 'ONLINE',
    recommendation VARCHAR(30) DEFAULT 'ALLOW',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_provider_scorecards_type
ON provider_scorecards(provider_type);

CREATE INDEX idx_provider_scorecards_recommendation
ON provider_scorecards(recommendation);
```

---

### 13.3 platform_performance

```sql
CREATE TABLE platform_performance (
    performance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID,
    property_id VARCHAR(50),
    platform VARCHAR(50) NOT NULL,
    post_id VARCHAR(100) NOT NULL,
    publish_url TEXT,
    views INT DEFAULT 0,
    likes INT DEFAULT 0,
    comments INT DEFAULT 0,
    shares INT DEFAULT 0,
    saves INT DEFAULT 0,
    clicks INT DEFAULT 0,
    average_watch_seconds NUMERIC(10, 2),
    video_duration_seconds NUMERIC(10, 2),
    engagement_rate NUMERIC(8, 6),
    cost_per_view NUMERIC(10, 8),
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_platform_performance_post_id
ON platform_performance(post_id);

CREATE INDEX idx_platform_performance_platform
ON platform_performance(platform);

CREATE INDEX idx_platform_performance_property_id
ON platform_performance(property_id);
```

---

## 14. Best Practices

### 14.1 Log Cost Immediately

ทุก Engine ต้องส่ง Cost Event ทันทีหลังทำงานเสร็จ ไม่ควรรอจบ Workflow ทั้งหมด

```text
Bad:
Video created -> wait until publish -> log total cost

Good:
Property analyzed -> log cost
Google called -> log cost
House generated/reused -> log cost
Video generated/reused -> log cost
Render completed -> log cost
Publish completed -> log cost
```

---

### 14.2 Separate Estimated Cost and Actual Cost

ระบบต้องแยก 2 ค่านี้:

```text
estimated_cost_usd = ราคาที่คาดว่าจะใช้ก่อนเรียก Provider
actual_cost_usd    = ราคาจริงหลัง Provider ตอบกลับ
```

ห้ามใช้ estimated cost เป็น actual cost โดยไม่มีการ mark

---

### 14.3 Keep Reuse Cost Visible

แม้การ reuse จะมี cost = 0 แต่ต้อง log event เสมอ

ตัวอย่าง:

```json
{
  "engine_name": "HOUSE_ENGINE",
  "operation": "LIBRARY_REUSE",
  "provider_name": "HOUSE_LIBRARY",
  "cost_usd": 0.0,
  "status": "SUCCESS"
}
```

เหตุผลคือ Analytics ต้องรู้ว่าเราประหยัดเงินจากการ reuse ไปเท่าไร

---

## 15. Anti-Patterns

### 15.1 No Cost Logging

การสร้างวิดีโอสำเร็จแต่ไม่รู้ว่าใช้เงินเท่าไร ถือว่า workflow ไม่ผ่านมาตรฐาน production

### 15.2 Cheapest Provider Always Wins

ห้ามเลือก Provider จากราคาถูกสุดเสมอ เพราะอาจได้คุณภาพแย่จนทำให้ต้อง generate ซ้ำและแพงกว่าเดิม

### 15.3 Ignoring Failed Jobs

งานที่ล้มเหลวต้องถูกนับใน Analytics เสมอ เพราะ failure rate คือหนึ่งในตัวชี้วัดสำคัญของ Provider

### 15.4 Mixing Render Cost With Video Generation Cost

Render Engine และ Video Engine ต้องแยกต้นทุนออกจากกัน เพราะ render เป็นต้นทุนต่ำและแก้ไขได้ง่าย ส่วน video generation เป็นต้นทุนสูง

---

## 16. Claude Rules for Analytics & Cost Engine

Claude Code และ AI Agent ต้องปฏิบัติตามกฎต่อไปนี้:

1. ห้ามเขียนโค้ดเรียก Provider โดยไม่สร้าง Cost Event
2. ห้ามเลือก Provider โดยไม่มีข้อมูล cost, status, success_rate หรือ fallback plan
3. ห้าม hardcode ราคา Provider ไว้ในหลายไฟล์ ให้เก็บไว้ใน Provider Config หรือ Provider Interface เท่านั้น
4. ห้ามรวมค่า reuse asset เป็น generation cost
5. ห้ามลบ failed event จาก analytics log
6. ห้าม override provider_scorecard ด้วย assumption ที่ไม่มีข้อมูล
7. ห้ามแก้ราคาต้นทุนย้อนหลังโดยไม่สร้าง audit log
8. ต้องแยก `estimated_cost_usd` และ `actual_cost_usd`
9. ต้อง mark outlier ก่อนนำไปคำนวณ average
10. ต้องให้ Orchestrator ตรวจ budget ก่อนเรียก Video Engine ทุกครั้ง

---

## 17. Implementation Example: Provider Selection Pseudocode

```javascript
function selectProvider(operation, candidates, budgetRemaining) {
  const available = candidates.filter(provider => {
    return (
      provider.availability_status !== "OFFLINE" &&
      provider.availability_status !== "QUOTA_EXCEEDED" &&
      provider.estimated_cost_usd <= budgetRemaining &&
      provider.recommendation !== "DISABLED"
    );
  });

  if (available.length === 0) {
    throw new Error("ERR_COST_NO_PROVIDER_AVAILABLE");
  }

  const lowestCost = Math.min(...available.map(p => p.estimated_cost_usd));

  const scored = available.map(provider => {
    const costScore = 100 - (((provider.estimated_cost_usd - lowestCost) / lowestCost) * 100);
    const latencyScore = Math.max(0, 100 - (provider.average_latency_ms / 2000));
    const availabilityScore =
      provider.availability_status === "ONLINE" ? 100 :
      provider.availability_status === "DEGRADED" ? 60 : 0;

    const totalScore =
      (provider.quality_score * 0.35) +
      (provider.success_rate * 100 * 0.25) +
      (costScore * 0.25) +
      (latencyScore * 0.10) +
      (availabilityScore * 0.05);

    return {
      ...provider,
      provider_score: totalScore
    };
  });

  scored.sort((a, b) => b.provider_score - a.provider_score);

  return scored[0];
}
```

---

## 18. Implementation Example: Cost Event

```javascript
async function logCostEvent({
  transactionId,
  propertyId,
  engineName,
  providerName,
  operation,
  estimatedCostUsd,
  actualCostUsd,
  status,
  durationMs
}) {
  const event = {
    event_type: "COST_EVENT",
    transaction_id: transactionId,
    property_id: propertyId,
    engine_name: engineName,
    provider_name: providerName,
    metrics: {
      operation,
      estimated_cost_usd: estimatedCostUsd,
      actual_cost_usd: actualCostUsd,
      duration_ms: durationMs,
      status
    },
    cost_usd: actualCostUsd,
    created_at: new Date().toISOString()
  };

  await db.insert("analytics_events", event);

  return event;
}
```

---

## 19. Migration Guide

### Current n8n

ระบบเดิมมักเป็นแบบ:

```text
Property
  ↓
Claude creates prompt
  ↓
Video provider
  ↓
Final output
```

ปัญหา:

- ไม่รู้ว่าขั้นตอนไหนแพง
- ไม่รู้ว่า provider ไหนล้มบ่อย
- ไม่รู้ว่าคลิปไหนทำยอดดี
- ไม่รู้ว่า asset ไหน reuse ได้เยอะ
- ไม่สามารถ optimize cost ได้จริง

---

### Target n8n

ระบบใหม่ต้องเพิ่ม Analytics Node หลังทุก Engine:

```text
Property Engine
  ↓
Log Cost Event
  ↓
Google Engine
  ↓
Log Cost Event
  ↓
Asset Engine
  ↓
Log Cost Event
  ↓
House Engine
  ↓
Log Cost Event
  ↓
Video Engine
  ↓
Log Cost Event
  ↓
Render Engine
  ↓
Log Cost Event
  ↓
Publish Engine
  ↓
Log Publish Event
  ↓
Analytics Collector
```

---

### Migration Steps

1. เพิ่มตาราง `analytics_events`
2. เพิ่มตาราง `provider_scorecards`
3. เพิ่มตาราง `platform_performance`
4. เพิ่ม Node `Log Cost Event` หลังทุก Engine ใน n8n
5. เพิ่ม Node `Provider Score Lookup` ก่อน Video Engine
6. เพิ่ม Budget Check ก่อนเรียก Provider ราคาแพง
7. เพิ่ม Scheduled Workflow สำหรับดึง Social Metrics ทุก 6 ชั่วโมง
8. เพิ่ม Dashboard สำหรับดู:
   - total cost per video
   - cost per provider
   - cost per platform
   - view per video
   - engagement rate
   - cost per lead
9. ปิดการเรียก Video Provider แบบตรงจาก Workflow เดิม
10. บังคับให้ทุก Provider Call ผ่าน Provider Interface เท่านั้น

---

## 20. Example Analytics Dashboard Metrics

Dashboard ควรมีข้อมูลอย่างน้อย:

```text
Today:
- Videos generated: 42
- Videos published: 39
- Total cost: $6.91
- Average cost/video: $0.177
- Reuse savings: $3.42
- Failed jobs: 3
- Most used video provider: Kling
- Best engagement platform: TikTok
- Highest cost provider: Runway
```

---

## 21. Success Criteria

Analytics Engine ถือว่าสำเร็จเมื่อ:

- 100% ของ Workflow มี Cost Log
- 100% ของ Provider Calls มี estimated และ actual cost
- ระบบสามารถบอกต้นทุนรวมต่อวิดีโอได้
- ระบบสามารถบอกต้นทุนเฉลี่ยต่อ Provider ได้
- ระบบสามารถ detect provider ล่มหรือแพงผิดปกติได้
- ระบบสามารถคำนวณ reuse savings ได้
- ระบบสามารถแนะนำ Provider ที่เหมาะสมได้
- ระบบสามารถบอกได้ว่าวิดีโอแบบไหนสร้างผลลัพธ์ดีที่สุด

---

## 22. Summary

Analytics Engine คือสมองด้านตัวเลขของระบบ MMGS

หากไม่มี Analytics Engine ระบบจะเป็นเพียงเครื่องผลิตวิดีโอ  
แต่เมื่อมี Analytics Engine ระบบจะกลายเป็นเครื่องจักรธุรกิจที่:

- รู้ต้นทุน
- รู้ผลลัพธ์
- รู้ Provider ที่คุ้มที่สุด
- รู้ Asset ที่ควร reuse
- รู้ Workflow ที่ควรปรับ
- รู้ว่าควรลงทุนเพิ่มตรงไหน
```

---

ไฟล์ `แ` เสร็จเรียบร้อยครับ

ไฟล์ถัดไปคือ **`16_PROVIDER_INTERFACE.md`** ซึ่งจะกำหนดมาตรฐานกลางในการเชื่อมต่อ Provider ทั้งหมด เช่น Claude, Google, Flux, Kling, Runway, Veo, TTS, Render Cloud โดยห้าม Workflow เรียก Provider ตรงเอง ต้องผ่าน Interface นี้เท่านั้นครับ