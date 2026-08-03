เขียนใหม่สมบูรณ์เลยครับ

---

#📂 File: `AI_BIBLE/16_PROVIDER_INTERFACE.md`

```markdown
# 16. Provider Interface Specification

## 1. Purpose

Provider Interface มีหน้าที่เป็น Abstraction Layer กลางระหว่าง Engines ของระบบ MMGS กับ External AI Providers ทั้งหมด

แนวคิดหลักคือ:

```text
Engine ไม่รู้จัก Provider โดยตรง
Engine รู้จักเพียง Interface
Interface รู้จัก Provider
```

ดังนั้น:

```text
House Engine│
    calls: generateImage(payload)
    │
    ▼
Provider Interface
    │
    routes to: Flux / Midjourney / SDXL
    │
    ▼
Normalized Response กลับไปยัง House Engine
```

ระบบสามารถเปลี่ยน Provider ได้โดยไม่ต้องแก้โค้ดของ Engine แม้แต่บรรทัดเดียว

---

## 2. Architecture Overview

```text
┌────────────────────────────────────────────────────────────┐
│                   Provider Interface                        │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Provider Registry│    │
│  │  (ชื่อ / ประเภท / Config / Status / Pricing)       │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         ││
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │         Router + Cost Engine Scorer│    │
│  │  (เลือก Provider ที่ดีที่สุดตาม score)              │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │              Adapter Layer                          │    │
│  │  (แปลง Payload ให้ตรงกับ API formatของ Provider)   │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │              Circuit Breaker                        │    │
│  │  (ตรวจจับ Provider ล่ม / Error Threshold)           │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │              Response Normalizer                    │    │
│  │  (แปลง Response ให้เป็น Standard Format เดียวกัน)   │    │
│  └──────────────────────┬─────────────────────────────┘    │
│                         │                                   │
│  ┌──────────────────────▼─────────────────────────────┐    │
│  │              Cost Event Logger│    │
│  │  (บันทึกต้นทุนจริงลง Analytics Engineทุก Call)     │    │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────┘
                │
     ┌────────────────────┼────────────────────┐
     ▼                    ▼                    ▼
[LLM Providers]  [Image Providers]   [Video Providers]
 Claude Haiku     Flux1DevKling V2
 Claude Sonnet    Flux 1 Schnell      Runway Gen3Gemini Flash     Midjourney V7Luma DreamSDXL                Higgsfield      Minimax Video                      Veo2▼                    ▼
[TTS Providers]  [Map Providers]
 ElevenLabs       Google Geocoding
 Fish Audio        Google Static Maps
 OpenAI TTS       Google Street View
```

---

## 3. Responsibilities

### Responsibilities (หน้าที่รับผิดชอบ)
* **✓ Request Routing:** รับคำสั่งจาก Engine และเลือก Provider ที่เหมาะสมที่สุดตาม score
* **✓ Payload Adaptation:** แปลง Standard Request ของระบบ ให้ตรงกับ API format ของแต่ละ Provider
* **✓ Authentication Management:** จัดการ API Keys และ OAuth Tokens ของทุก Provider
* **✓ Circuit Breaking:** ตรวจสอบ Provider ที่ล้มเหลวซ้ำๆ แล้วระงับการใช้งานชั่วคราวอัตโนมัติ
* **✓ Response Normalization:** แปลงผลลัพธ์จากทุก Provider ให้กลับมาเป็น Standard Format เดียวกัน
* **✓ Cost Logging:** บันทึก Cost Event ทุกครั้งหลังเรียกใช้ Provider

### Not Responsible (สิ่งที่ไม่อยู่ในความรับผิดชอบ)
* **✗ Business Logic:** ไม่ตัดสินใจเรื่อง Engine Logic
* **✗ Prompt Engineering:** ไม่แก้ไขหรือสร้าง Prompt
* **✗ Asset Storage:** ไม่จัดเก็บรูปภาพหรือวิดีโอ
* **✗ Cross-Engine Routing:** ไม่ส่งผลลัพธ์ไปยัง Engine อื่นโดยตรง

---

## 4. Provider Registry

### 4.1 LLM Providers

| Provider Name | Model | Use Case | Cost/1K tokens |
| :--- | :--- | :--- | :--- |
| `CLAUDE_HAIKU` | claude-haiku-4-5| Entity Extraction, Property Parsing | $0.00025 |
| `CLAUDE_SONNET` | claude-sonnet-4-5 | Complex Analysis, Quality Checks | $0.003 |
| `GEMINI_FLASH` | gemini-2.5-flash | Fallback LLM, Caption Generation | $0.00015 |

---

### 4.2 Image Generation Providers

| Provider Name | Model | Use Case | Cost/Image |
| :--- | :--- | :--- | :--- |
| `FLUX_1_DEV` | flux-1-dev | House Generation (High Quality) | $0.025 |
| `FLUX_1_SCHNELL` | flux-1-schnell | House Generation (Fast/Cheap) | $0.003 |
| `MIDJOURNEY_V7` | midjourney-v7 | Premium House Generation | $0.050 |
| `SDXL` | stable-diffusion-xl | Fallback / Local | $0.002 |

---

### 4.3 Video Generation Providers

| Provider Name | Model | Use Case | Cost/Clip |
| :--- | :--- | :--- | :--- |
| `KLING_V2` | kling-v2-master | Primary Video Generation | $0.160 |
| `LUMA_DREAM` | luma-dream-machine | Fast Video Generation | $0.140 |
| `MINIMAX_VIDEO` | minimax-video-01 | Budget Video Generation | $0.080 |
| `HIGGSFIELD` | higgsfield-1 | Cinematic Camera Motion | $0.180 |
| `RUNWAY_GEN3` | runway-gen3-alpha-turbo | High Quality Video | $0.260 |
| `VEO_2` | veo-2 | Google Premium Quality | $0.220 |

**Provider Priority Order (Default):**
```text
1. MINIMAX_VIDEO  ($0.080) —ราคาถูกที่สุดใช้เป็น default
2. LUMA_DREAM     ($0.140) — fallback ลำดับ1
3. KLING_V2       ($0.160) — fallback ลำดับ 2
4. HIGGSFIELD     ($0.180) — fallback ลำดับ 3
5. VEO_2          ($0.220) — fallback ลำดับ 4
6. RUNWAY_GEN3    ($0.260) — fallback สุดท้าย (ราคาแพง แต่คุณภาพสูงสุด)
```

---

### 4.4 TTS Providers

| Provider Name | Model | Use Case | Cost/1K chars |
| :--- | :--- | :--- | :--- |
| `FISH_AUDIO` | fish-audio-v2 | Thai / Multilingual (Primary) | $0.0025 |
| `ELEVENLABS_TURBO` | eleven-turbo-v2-5 | High Quality Thai TTS (Secondary) | $0.0033 |
| `OPENAI_TTS` | tts-1-hd | English TTS Fallback | $0.0300 |

---

### 4.5 Map / Geocoding Providers

| Provider Name | Service | Use Case | Cost/Call |
| :--- | :--- | :--- | :--- |
| `GOOGLE_GEOCODING` | Maps Geocoding API | Address → Coordinates | $0.005 |
| `GOOGLE_STATIC_MAPS` | Static Maps API | Satellite Thumbnail | $0.002 |
| `GOOGLE_STREET_VIEW` | Street View Static API | Street Level Image | $0.007 |

---

## 5. JSON Contract

### 5.1 Standard Provider Request

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProviderRequest",
  "type": "object",
  "required": [
    "request_id",
    "transaction_id",
    "operation_type",
    "payload"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "format": "uuid"
    },
    "transaction_id": {
      "type": "string",
      "format": "uuid"
    },
    "operation_type": {
      "type": "string",
      "enum": [
        "TEXT_COMPLETION",
        "ENTITY_EXTRACTION",
        "IMAGE_GENERATION",
        "IMAGE_TO_VIDEO",
        "TEXT_TO_SPEECH",
        "GEOCODING",
        "STATIC_MAP",
        "STREET_VIEW"
      ]
    },
    "preferred_provider": {
      "type": "string",
      "description": "ระบุ Provider ที่ต้องการถ้ามีถ้าไม่ระบุ Router จะเลือกให้"
    },
    "fallback_providers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "รายชื่อ Provider สำรองตามลำดับ ห้ามส่ง arrayว่าง"
    },
    "budget_limit_usd": {
      "type": "number",
      "description": "งบประมาณสูงสุดที่ยอมให้ใช้สำหรับ call นี้"
    },
    "payload": {
      "type": "object",
      "description": "ข้อมูลเฉพาะของ operation_type นั้นๆ"
    }
  }
}
```

---

### 5.2 Standard Provider Response

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProviderResponse",
  "type": "object",
  "required": [
    "request_id",
    "transaction_id",
    "provider_used",
    "status",
    "result",
    "cost_usd",
    "duration_ms"
  ],
  "properties": {
    "request_id": {
      "type": "string",
      "format": "uuid"
    },
    "transaction_id": {
      "type": "string",
      "format": "uuid"
    },
    "provider_used": {
      "type": "string",
      "description": "ชื่อ Provider ที่ใช้จริง (อาจไม่ตรงกับ preferred_provider)"
    },
    "status": {
      "type": "string",
      "enum": ["SUCCESS", "FAILED", "FALLBACK_USED", "TIMEOUT"]
    },
    "result": {
      "type": "object",
      "description": "ผลลัพธ์ที่ Normalize แล้ว ตรงตาม operation_type"
    },
    "cost_usd": {
      "type": "number"
    },
    "duration_ms": {
      "type": "number"
    },
    "fallback_reason": {
      "type": "string",
      "description": "เหตุผลที่ต้องใช้ Fallback Provider (ถ้ามี)"
    }
  }
}
```

---

### 5.3 Normalized Result Schemas by Operation Type

#### TEXT_COMPLETION / ENTITY_EXTRACTION

```json
{
  "result": {
    "text": "ผลลัพธ์ข้อความจาก LLM",
    "tokens_used": {
      "input": 342,
      "output": 128
    }
  }
}
```

#### IMAGE_GENERATION

```json
{
  "result": {
    "image_url": "https://cdn.mmgs.io/house_library/output_uuid.png",
    "width": 1024,
    "height": 1024,
    "seed": 4892384,
    "prompt_used": "Photorealistic 2-story modern loft house..."
  }
}
```

#### IMAGE_TO_VIDEO

```json
{
  "result": {
    "video_url": "https://cdn.mmgs.io/video_library/output_uuid.mp4",
    "duration_seconds": 4.0,
    "fps": 24,
    "resolution": "1080x1920"
  }
}
```

#### TEXT_TO_SPEECH

```json
{
  "result": {
    "audio_url": "https://cdn.mmgs.io/tts/output_uuid.mp3",
    "duration_seconds": 12.5,
    "voice_id": "thai_female_01",
    "characters_used": 342
  }
}
```

#### GEOCODING

```json
{
  "result": {
    "lat": 13.758412,
    "lng": 100.584319,
    "formatted_address": "123 พระราม 9 บางกะปิ กรุงเทพมหานคร 10310",
    "confidence": 0.94
  }
}
```

#### STATIC_MAP / STREET_VIEW

```json
{
  "result": {
    "image_url": "https://cdn.mmgs.io/google_cache/map_uuid.png",
    "width": 1080,
    "height": 1080,
    "map_type": "satellite"
  }
}
```

---

## 6. Adapter Layer Design

แต่ละ Provider มี API format ต่างกัน Adapter มีหน้าที่แปลง Standard Request ให้ตรงกับ Provider นั้นๆ และแปลง Response กลับมาเป็น Standard Format

### 6.1 Kling Adapter

```javascript
class KlingAdapter {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.klingai.com/v1";
    this.providerName = "KLING_V2";
    this.estimatedCostUsd = 0.160;
  }

  buildRequest(standardPayload) {
    return {
      model: "kling-v2-master",
      image: standardPayload.image_url,
      prompt: standardPayload.motion_description || "",
      negative_prompt: "text, watermark, logo, blurry, distorted, subtitle",
      duration: 5,
      aspect_ratio: standardPayload.aspect_ratio || "9:16",
      cfg_scale: 0.5,
      camera_control: {
        type: this.mapCameraMotion(standardPayload.camera_motion)
      }
    };
  }

  mapCameraMotion(motion) {
    const map = {
      "DRONE_REVEAL": "AERIAL_UP",
      "PAN_RIGHT":"PAN_RIGHT",
      "ZOOM_IN":      "PUSH_IN",
      "TILT_UP":      "TILT_UP",
      "ORBIT":        "ORBIT"
    };
    return map[motion] || "DEFAULT";
  }

  normalizeResponse(klingResponse, durationMs) {
    return {
      provider_used: this.providerName,
      status: "SUCCESS",
      result: {
        video_url: klingResponse.data.works[0].resource.resource,
        duration_seconds: klingResponse.data.works[0].duration,
        fps: 24,
        resolution: "1080x1920"
      },
      cost_usd: this.estimatedCostUsd,
      duration_ms: durationMs
    };
  }
}
```

---

### 6.2 Flux Adapter

```javascript
class FluxAdapter {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.bfl.ml";
    this.providerName = "FLUX_1_DEV";
    this.estimatedCostUsd = 0.025;
  }

  buildRequest(standardPayload) {
    // กรองคำต้องห้ามออกก่อนส่ง
    const sanitizedPrompt = this.sanitizePrompt(standardPayload.prompt);

    return {
      prompt: sanitizedPrompt,
      width: standardPayload.width || 1024,
      height: standardPayload.height || 1024,
      steps: 28,
      guidance:3.5,
      seed: standardPayload.seed || Math.floor(Math.random() * 9999999)
    };
  }

  sanitizePrompt(prompt) {
    return prompt
      .replace(/\d{7,}/g, "")
      .replace(/ราคา|บาท|ล้าน|THB|USD|\$|฿/gi, "")
      .replace(/0[689]\d{8}/g, "")
      .replace(/line|ไลน์|@\w+/gi, "")
      .replace(/โทร|tel|phone/gi, "")
      .trim();
  }

  normalizeResponse(fluxResponse, durationMs) {
    return {
      provider_used: this.providerName,
      status: "SUCCESS",
      result: {
        image_url: fluxResponse.sample,
        width: 1024,
        height: 1024,
        seed: fluxResponse.seed,
        prompt_used: fluxResponse.prompt
      },
      cost_usd: this.estimatedCostUsd,
      duration_ms: durationMs
    };
  }
}
```

---

### 6.3 ElevenLabs Adapter

```javascript
class ElevenLabsAdapter {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.elevenlabs.io/v1";
    this.providerName = "ELEVENLABS_TURBO";
    this.voiceIdThaiFemale = "21m00Tcm4TlvDq8ikWAM";
  }

  buildRequest(standardPayload) {
    return {
      text: standardPayload.text,
      model_id: "eleven_turbo_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.0,
        use_speaker_boost: true
      }
    };
  }

  estimateCost(text) {
    return (text.length / 1000) * 0.0033;
  }

  normalizeResponse(audioBuffer, text, durationMs) {
    const audioUrl = uploadToStorage(audioBuffer);
    return {
      provider_used: this.providerName,
      status: "SUCCESS",
      result: {
        audio_url: audioUrl,
        characters_used: text.length,
        voice_id: this.voiceIdThaiFemale
      },
      cost_usd: this.estimateCost(text),
      duration_ms: durationMs
    };
  }
}
```

---

## 7. Router Logic

Router ทำหน้าที่เลือก Provider ที่ดีที่สุดโดยใช้ข้อมูลจาก `provider_scorecards` ใน Analytics Engine

```javascript
classProviderRouter {
  constructor(scorecard, circuitBreaker) {
    this.scorecard = scorecard;
    this.circuitBreaker = circuitBreaker;
  }

  async route(operationType, budgetLimitUsd, preferredProvider = null) {

    // 1. ถ้าระบุ preferred provider ให้ตรวจสอบก่อน
    if (preferredProvider) {
      const healthy = await this.circuitBreaker.isHealthy(preferredProvider);
      const score = this.scorecard.get(preferredProvider);
      if (healthy && score && score.estimated_cost_usd <= budgetLimitUsd) {
        return preferredProvider;
      }
    }

    // 2. ดึงรายชื่อ Provider ทั้งหมดที่รองรับ operation นี้
    const candidates = this.scorecard
      .getAllByOperationType(operationType)
      .filter(p =>
        p.recommendation !== "DISABLED" &&
        p.recommendation !== "AVOID" &&
        p.estimated_cost_usd <= budgetLimitUsd
      );

    if (candidates.length === 0) {
      throw new Error("ERR_ROUTER_NO_CANDIDATE: No providers within budget");
    }

    // 3. กรองเฉพาะที่ Circuit Breaker อนุญาต
    const healthChecks = await Promise.all(
      candidates.map(async p => ({
        ...p,
        isHealthy: await this.circuitBreaker.isHealthy(p.provider_name)
      }))
    );
    const available = healthChecks.filter(p => p.isHealthy);

    if (available.length === 0) {
      throw new Error("ERR_ROUTER_ALL_UNAVAILABLE: All providers are down");
    }

    // 4. คำนวณ score แล้วเลือกตัวสูงสุด
    const lowestCost = Math.min(...available.map(p => p.estimated_cost_usd));

    const scored = available.map(p => {
      const costScore = lowestCost === 0 ? 100 :Math.max(0, 100 - (((p.estimated_cost_usd - lowestCost) / lowestCost) * 100));

      const latencyScore = Math.max(0, 100 - (p.average_latency_ms / 2000));

      const availabilityScore =
        p.availability_status === "ONLINE"? 100 :
        p.availability_status === "DEGRADED"  ? 60: 0;

      const totalScore =
        (p.quality_score       * 0.35) +
        (p.success_rate * 100* 0.25) +
        (costScore             * 0.25) +
        (latencyScore          * 0.10) +
        (availabilityScore     * 0.05);

      return { ...p, total_score: totalScore };
    });

    scored.sort((a, b) => b.total_score - a.total_score);

    return scored[0].provider_name;
  }
}
```

---

## 8. Circuit Breaker

### States

```text
CLOSED    =ปกติ ส่งคำขอได้
OPEN      = ระงับ ห้ามส่งคำขอ (ใช้ Fallback)
HALF_OPEN = ทดสอบ ส่งคำขอน้อยๆ เพื่อตรวจว่ากลับมาปกติหรือยัง
```

### State Transitions

```text[CLOSED]
            │
            │ (error count >= 5)
            ▼
          [OPEN]──────────────► (wait15 minutes)
                │
                                        ▼
                                  [HALF_OPEN]
                                        │
                ┌─────────────┴─────────────┐
                SUCCESS       FAIL          │                            │
                          ▼                ▼
                       [CLOSED]                     [OPEN]
```

### Implementation

```javascript
class CircuitBreaker {
  constructor() {
    this.states = new Map();
    this.ERROR_THRESHOLD  = 5;
    this.OPEN_TIMEOUT_MS  = 15 * 60 * 1000; // 15 minutes}

  _getState(providerName) {
    if (!this.states.has(providerName)) {
      this.states.set(providerName, {
        state:"CLOSED",
        errorCount:  0,
        lastErrorAt: null,
        openedAt:    null
      });
    }
    return this.states.get(providerName);
  }

  async isHealthy(providerName) {
    const s = this._getState(providerName);

    if (s.state === "CLOSED") return true;

    if (s.state === "OPEN") {
      const elapsed = Date.now() - s.openedAt;
      if (elapsed >= this.OPEN_TIMEOUT_MS) {
        s.state      = "HALF_OPEN";
        s.errorCount = 0;
        return true;
      }
      return false;
    }

    if (s.state === "HALF_OPEN") return true;

    return false;
  }

  recordSuccess(providerName) {
    const s = this._getState(providerName);
    s.state= "CLOSED";
    s.errorCount = 0;}

  recordFailure(providerName) {
    const s = this._getState(providerName);
    s.errorCount   += 1;
    s.lastErrorAt   = Date.now();

    if (s.errorCount >= this.ERROR_THRESHOLD || s.state === "HALF_OPEN") {
      s.state    = "OPEN";
      s.openedAt = Date.now();
    }
  }
}
```

---

## 9. State Machine (Per Request)

```text
[REQUEST_RECEIVED]
        │
        ▼
[ROUTE_PROVIDER]    ──► (ไม่มี Provider ว่าง)──► [ERR_ROUTER_NO_CANDIDATE]
        │
        ▼
[ADAPT_PAYLOAD]     ──► (Adapter ไม่รองรับ)──► [ERR_ADAPTER_UNSUPPORTED]
        │
        ▼
[CALL_PROVIDER_API] ──► (Timeout /5xx Error)    ──► [CIRCUIT_BREAKER.recordFailure]
        │                │
        │ (SUCCESS)                                             ▼
        │                                          [SWITCH_FALLBACK_PROVIDER]
        ▼                                                       │
[NORMALIZE_RESPONSE]▼
        │                                          [ADAPT_PAYLOAD_FALLBACK]
        ▼                                                       │
[LOG_COST_EVENT]                                               ▼
        │                                          [CALL_FALLBACK_API]
        ▼                                                       │
[RETURN_TO_ENGINE]◄────────────────────────────── [NORMALIZE_FALLBACK_RESPONSE]
```

---

## 10. Provider Timeout Configuration

```javascript
const PROVIDER_TIMEOUTS_MS = {
  TEXT_COMPLETION:30000,   //30 seconds
  ENTITY_EXTRACTION:  30000,   //  30 seconds
  IMAGE_GENERATION:90000,   //  90 seconds
  IMAGE_TO_VIDEO:    180000,   // 180 seconds (3 minutes)
  TEXT_TO_SPEECH:     60000,   //  60 seconds
  GEOCODING:          10000,   //  10 seconds
  STATIC_MAP:         15000,   //  15 seconds
  STREET_VIEW:        15000    //  15 seconds
};
```

---

## 11. Error Handling

| Error Code | Cause | Action |

| `ERR_PROV_01` | API Key หมดอายุหรือไม่ถูกต้อง (401) | แจ้งเตือน Admin ทันที หยุด Workflow |
| `ERR_PROV_02` | Rate Limit เกิน (429) | Wait ตาม `Retry-After` Header แล้วลองใหม่ สูงสุด 3 ครั้ง |
| `ERR_PROV_03` | Content Policy Violation | Log เหตุผล sanitize prompt แล้วลองอีก1 ครั้ง ถ้ายังไม่ผ่านให้ใช้ Template Default |
| `ERR_PROV_04` | Response formatผิดปกติ ไม่ตรงกับ Normalizer | Mark providerว่า DEGRADED แล้ว fallback ทันที |
| `ERR_PROV_05` | Timeout เกินกว่าที่กำหนดใน `PROVIDER_TIMEOUTS_MS` | Record failure ใน Circuit Breaker แล้ว fallback |
| `ERR_PROV_06` | Providerส่ง Empty Result กลับมา | Retry1 ครั้ง ถ้ายัง emptyให้ fallback |
| `ERR_ROUTER_01` | ไม่มี Provider ว่างเลย ทุกตัว OPEN หรือเกิน budget | หยุด Workflow ส่ง Alert ไปยัง Admin |
| `ERR_ROUTER_02` | operation_typeที่ร้องขอไม่มี Provider รองรับ | Reject request ทันที Log ว่า operationไม่รองรับ |
| `ERR_ADAPT_01` | Adapter ไม่สามารถ map payload ได้ | Log error รายละเอียด throw ERR_ADAPTER_UNSUPPORTED |

---

## 12. Best Practices

### 12.1 Never Hardcode API Keys

```javascript
// BAD
const apiKey = "sk-kling-abc123xyz456";

// GOOD
const apiKey = process.env.KLING_API_KEY;
if (!apiKey) throw new Error("KLING_API_KEY is not set in environment");

ต่อจากที่ค้างไว้ตรง Section 11 Error Handling เลยครับ จนจบไฟล์ 16 สมบูรณ์

---

```markdown
## 11. Error Handling (ต่อ)

| Error Code | Cause | Action |
| :--- | :--- | :--- |
| `ERR_PROV_01` | API Key หมดอายุหรือไม่ถูกต้อง (401) | แจ้งเตือน Admin ทันที หยุด Workflow |
| `ERR_PROV_02` | Rate Limit เกิน (429) | Wait ตาม `Retry-After` Header แล้วลองใหม่ สูงสุด 3 ครั้ง |
| `ERR_PROV_03` | Content Policy Violation | Log เหตุผล sanitize prompt แล้วลองอีก1 ครั้ง ถ้ายังไม่ผ่านให้ใช้ Template Default |
| `ERR_PROV_04` | Response formatผิดปกติ ไม่ตรงกับ Normalizer | Mark providerว่า DEGRADED แล้ว fallback ทันที |
| `ERR_PROV_05` | Timeout เกินกว่าที่กำหนดใน `PROVIDER_TIMEOUTS_MS` | Record failure ใน Circuit Breaker แล้ว fallback |
| `ERR_PROV_06` | Providerส่ง Empty Result กลับมา | Retry1 ครั้ง ถ้ายัง emptyให้ fallback |
| `ERR_ROUTER_01` | ไม่มี Provider ว่างเลย ทุกตัว OPEN หรือเกิน budget | หยุด Workflow ส่ง Alert ไปยัง Admin |
| `ERR_ROUTER_02` | operation_typeที่ร้องขอไม่มี Provider รองรับ | Reject request ทันที Log ว่า operationไม่รองรับ |
| `ERR_ADAPT_01` | Adapter ไม่สามารถ map payload ได้ | Log error รายละเอียด throw ERR_ADAPTER_UNSUPPORTED |

---

## 12. Best Practices

### 12.1 Never Hardcode API Keys

```javascript
// BAD
const apiKey = "sk-kling-abc123xyz456";

// GOOD
const apiKey = process.env.KLING_API_KEY;
if (!apiKey) throw new Error("KLING_API_KEY is not set in environment");
```
---

### 12.2 Always Log Provider Used

Engine ต้องไม่รู้ว่าใช้ Provider ไหน แต่ Log ต้องรู้เสมอ:

```javascript
const response = await providerInterface.call(request);

// response.provider_used จะบอกว่าใช้ตัวไหนจริงๆ
await logCostEvent({
  transactionId: request.transaction_id,
  engineName: "VIDEO_ENGINE",
  providerName: response.provider_used,
  costUsd: response.cost_usd,
  durationMs: response.duration_ms,
  status: response.status
});
```
---

### 12.3 Always Define Fallback Providers

```javascript
// BAD
const request = {
  operation_type: "IMAGE_TO_VIDEO",
  preferred_provider: "KLING_V2",
  fallback_providers: []// ห้าม empty array เด็ดขาด
};

// GOOD
const request = {
  operation_type: "IMAGE_TO_VIDEO",
  preferred_provider: "KLING_V2",
  fallback_providers: ["LUMA_DREAM", "MINIMAX_VIDEO", "RUNWAY_GEN3"]
};
```

---

### 12.4 Respect Budget Limit Per Call

```javascript
// คำนวณ budget ที่เหลืออยู่ก่อนเรียก Provider เสมอ
const budgetRemaining = transaction.allocated_budget - transaction.accumulated_cost;

if (budgetRemaining< MINIMUM_VIDEO_COST) {
  throw new Error("ERR_BUDGET_INSUFFICIENT: Cannot call Video Provider");
}

const request = {
  operation_type: "IMAGE_TO_VIDEO",
  budget_limit_usd: budgetRemaining,
  payload: videoPayload
};
```

---

### 12.5 Sanitize All Image and Video Prompts

```javascript
// Sanitizer ต้องรันก่อนส่ง Prompt ไปยัง Image/Video Provider เสมอ
function sanitizeMediaPrompt(prompt) {
  return prompt
    //ลบตัวเลขราคา
    .replace(/\d{4,}/g, "")
    .replace(/ราคา|บาท|ล้าน|THB|USD|\$|฿/gi, "")
    // ลบเบอร์โทรศัพท์
    .replace(/0[689]\d{8}/g, "")
    .replace(/\+66\d{9}/g, "")
    // ลบข้อมูลติดต่อ
    .replace(/line|ไลน์|@\w+/gi, "")
    .replace(/โทร|tel|phone|contact/gi, "")
    // ลบ URL
    .replace(/https?:\/\/\S+/gi, "")
    // ล้าง whitespace ซ้ำ
    .replace(/\s{2,}/g, " ")
    .trim();
}
```

---

### 12.6 Cache Provider Scorecard

อย่า Query `provider_scorecards` จากฐานข้อมูลทุกครั้งที่เรียก Router ให้ใช้ Memory Cache ที่มี TTL 5 นาที:

```javascript
class ScorecardCache {
  constructor(db) {
    this.db = db;
    this.cache = new Map();this.TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  async getAll() {
    const cached = this.cache.get("all");
    if (cached && Date.now() - cached.timestamp < this.TTL_MS) {
      return cached.data;
    }

    const data = await this.db.query("SELECT * FROM provider_scorecards");
    this.cache.set("all", { data, timestamp: Date.now() });
    return data;
  }

  invalidate() {
    this.cache.clear();
  }
}
```

---

## 13. Anti-Patterns

### 13.1 Direct Provider Call from Engine (ห้ามเด็ดขาด)

```javascript
// BAD: House Engine เรียก Flux API โดยตรง
async function generateHouseImage(prompt) {
  const response = await axios.post("https://api.bfl.ml/flux/generate", {
    prompt,
    apiKey: process.env.FLUX_KEY
  });
  return response.data.image_url;
}

// GOOD: ผ่าน Provider Interface เสมอ
async function generateHouseImage(prompt, transactionId) {
  const response = await providerInterface.call({
    request_id: uuidv4(),
    transaction_id: transactionId,
    operation_type: "IMAGE_GENERATION",
    preferred_provider: "FLUX_1_DEV",
    fallback_providers: ["FLUX_1_SCHNELL", "SDXL"],
    budget_limit_usd: 0.05,
    payload: { prompt: sanitizeMediaPrompt(prompt) }
  });
  return response.result.image_url;
}
```

---

### 13.2 Ignoring Fallback Chain

```javascript
// BAD: ไม่มี fallback เมื่อKlingล่ม Workflow หยุดทั้งหมด
{
  preferred_provider: "KLING_V2",
  fallback_providers: []
}

// GOOD: มี fallback chain ครบ
{
  preferred_provider: "KLING_V2",
  fallback_providers: [
    "LUMA_DREAM",
    "MINIMAX_VIDEO",
    "HIGGSFIELD",
    "RUNWAY_GEN3"
  ]
}
```

---

### 13.3 Passing Unfiltered Prompt to Media Provider

```javascript
// BAD: ส่ง prompt ดิบที่มีราคาและข้อมูลติดต่อ
{
  payload: {
    prompt: "บ้านเดี่ยวพระราม9 ราคา12.9 ล้านบาทติดต่อ 081-234-5678 ไลน์ @broker1"
  }
}

// GOOD: ผ่าน sanitizer แล้ว + ใช้ Descriptive Keywords เท่านั้น
{
  payload: {
    prompt: "Photorealistic 2-story modern loft house, exposed concrete facade, large steel frame windows, urban Bangkok setting, golden hour lighting, cinematic architectural photography, no text, no watermark"
  }
}
```

---

### 13.4 Treating All Providers as Interchangeable

```javascript
// BAD: สลับ SDXL มาแทน Midjourney โดยไม่ลด quality expectation
// SDXL ราคา $0.002 ต่อภาพ vs Midjourney $0.050
// คุณภาพต่างกันมาก อย่าสลับแบบไม่มีเงื่อนไข

// GOOD: Router จะคำนึงถึง quality_score ใน scorecard
// และเลือก provider ตาม scoring formula
// ไม่ใช่แค่ราคาถูกสุดเท่านั้น
const selected = await router.route("IMAGE_GENERATION", budgetRemaining);
```

---

### 13.5 Not Logging Fallback Events

```javascript
// BAD: ใช้ fallback แล้วไม่ log ว่าทำไม
const response = await callFallbackProvider(payload);

// GOOD: log ทุกครั้งที่เกิด fallback พร้อมเหตุผล
const response = await callFallbackProvider(payload);
await logCostEvent({
  ...response,
  status: "FALLBACK_USED",
  fallback_reason: "ERR_PROV_05: KLING_V2 timeout after 180000ms"
});
```

---

## 14. Claude Rules for Provider Interface

Claude Code และ AI Agent ต้องปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:

1. **ห้ามเขียนโค้ดที่เรียก External Provider API โดยตรงจาก Engine**ต้องผ่าน `ProviderInterface` เท่านั้น
2. **ห้าม hardcode API Keysลงในโค้ด** ให้ใช้ `process.env.PROVIDER_API_KEY` เสมอ
3. **ห้ามส่ง Prompt ที่มีราคา เบอร์โทร Line ID ลงใน Image/Video Provider** โดยไม่ผ่าน `sanitizeMediaPrompt()`
4. **ห้ามส่ง `fallback_providers: []`** ต้องระบุ fallback chain ทุกครั้ง
5. **ทุก Adapter ต้องมีทั้ง `buildRequest()` และ `normalizeResponse()`** ห้ามเขียน Adapter ไม่ครบ
6. **ต้องกำหนด Timeout ทุก Provider Call** ตามค่าใน `PROVIDER_TIMEOUTS_MS`
7. **ห้ามแก้ไข Circuit Breaker threshold** โดยไม่ผ่านการ review จาก Admin
8. **ทุก Response ต้องผ่าน Normalizer ก่อน return** ห้าม return raw API response
9. **ทุก Provider Call ต้องมี Cost Event Log** ห้ามเรียก Provider แล้วไม่บันทึกต้นทุน
10. **ห้าม override Provider Scorecard ด้วยค่า assumption** ต้องใช้ข้อมูลจริงจากฐานข้อมูลเท่านั้น

---

## 15. Migration Guide

### ระบบเดิม (n8n Direct HTTP Nodes)

```text
n8n Workflow มี HTTP Request Node ชี้ตรงไปหา:
- Kling API: https://api.klingai.com/v1/videos/...
- Luma API: https://lumalabs.ai/api/...
- Flux API: https://api.bfl.ml/...

API Keys กระจายอยู่ใน n8n Credentials แต่ละ Node แยกกัน
ไม่มี Fallback หาก Provider หลักล่ม
ไม่มีการ Log ต้นทุน
```

### ระบบใหม่ (Centralized Provider Interface)

```text
n8n Workflow มีเพียง 1 HTTP Request Node ต่อ operation type
ชี้ไปที่ Provider Interface Service กลาง

Provider Interface Service รับผิดชอบ:
- เลือก Provider ที่ดีที่สุด
- จัดการ API Keys ทั้งหมด
- Fallback อัตโนมัติ
- Log ต้นทุนทุก call
```

### Migration Steps

1. **สร้าง Provider Interface Service** เป็น Express.js / FastAPI Microservice
2. **ย้าย API Keys** จาก n8n Credentials ไปเก็บใน `.env` หรือ Secret Manager
3. **เขียน Adapter** สำหรับทุก Provider ที่ใช้อยู่ (Kling, Flux, ElevenLabs, Google Maps)
4. **ตั้งค่า Circuit Breaker** สำหรับทุก Provider
5. **สร้าง Provider Scorecard** เริ่มต้นในฐานข้อมูล พร้อมค่า Default
6. **เปลี่ยน HTTP Request Node** ใน n8n ให้ชี้ไปที่ Provider Interface แทน
7. **ทดสอบ Fallback** โดย mock Provider หลักให้ return Error500
8. **ตรวจสอบ Cost Log** ว่าบันทึก `provider_used` ถูกต้องทุก Transaction
9. **ปิด Direct API Access** บน n8n และ revoke credentials เดิม
10. **Monitor Circuit Breaker** Dashboard อย่างน้อย48 ชั่วโมงหลัง migration
```
---

ไฟล์ 16 จบสมบูรณ์แล้วครับ ต่อไปคือ **`17_PROMPT_LIBRARY.md`** เลยได้เลย แจ้งผมครับ!