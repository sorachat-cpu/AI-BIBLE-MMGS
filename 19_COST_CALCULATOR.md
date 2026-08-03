# 19. Cost Calculator Specification

## 1. Purpose

Cost Calculator มีหน้าที่คำนวณต้นทุนจริงและต้นทุนประมาณการณ์
สำหรับทุก Transaction ในระบบ MMGSทั้งในรูปแบบ:

- **Pre-flight Estimate:** ประมาณการณ์ก่อนรัน Workflow
- **Post-run Actual:** ต้นทุนจริงหลังรันเสร็จสมบูรณ์
- **Savings Report:** รายงานเงินที่ประหยัดได้จากระบบ Reuse

---

## 2. Cost Components Reference Table

| Engine | Provider | Operation | Cost (USD) | Cost Type |
| :--- | :--- | :--- | :--- | :--- |
| Property Engine | Claude Haiku | Entity Extraction | $0.001–0.003 | Per Call |
| Property Engine | Gemini Flash | Entity Extraction (Fallback) | $0.0005–0.001 | Per Call |
| Google Engine | Google Geocoding | Address → Coordinates | $0.005| Per Call |
| Google Engine | Google Static Maps | Satellite Image 1080x1080 | $0.002 | Per Image |
| Google Engine | Google Street View | Street Level Image | $0.007 | Per Image |
| Google Engine | Google Cache | Reuse Existing | $0.000| Free |
| Asset Engine | Google Vision | Safety Check + OCR | $0.003 | Per Image |
| House Engine | Flux1 Dev | Image Generation | $0.025 | Per Image |
| House Engine | Flux 1 Schnell | Image Generation (Fast) | $0.003 | Per Image |
| House Engine | Midjourney V7 | Image Generation (Premium) | $0.050 | Per Image |
| House Engine | SDXL | Image Generation (Fallback) | $0.002 | Per Image |
| House Engine | House Library | Reuse Existing | $0.000 | Free |
| Video Engine | Minimax Video | Image-to-Video (Primary) | $0.080 | Per Clip |
| Video Engine | Luma Dream | Image-to-Video | $0.140 | Per Clip |
| Video Engine | Kling V2 | Image-to-Video | $0.160 | Per Clip |
| Video Engine | Higgsfield | Image-to-Video (Cinematic) | $0.180 | Per Clip |
| Video Engine | Veo2 | Image-to-Video (Premium) | $0.220 | Per Clip |
| Video Engine | Runway Gen3 | Image-to-Video (High Quality) | $0.260 | Per Clip |
| Video Engine | Video Library | Reuse Existing | $0.000 | Free |
| Render Engine | FFmpeg Local | Video Compositing | $0.002 | Per Render |
| Overlay Engine | Claude Haiku | Price Badge + QR Text | $0.001 | Per Call |
| Render Engine | Fish Audio | Text-to-Speech (Primary) | $0.002–0.004 | Per Script |
| Render Engine | ElevenLabs Turbo | Text-to-Speech | $0.003–0.005 | Per Script |
| Publish Engine | TikTok API | Upload + Publish | $0.000| Free |
| Publish Engine | YouTube API | Upload + Publish | $0.000 | Free |
| Publish Engine | Facebook API | Upload + Publish | $0.000 | Free |
| Analytics Engine | Claude Haiku | Insight Summary | $0.002 | Per Report |
| Analytics Engine | Social APIs | Metrics Collection | $0.000 | Free |

---

## 3. Standard Cost Scenarios

### Scenario A — Full New Generation (ไม่มี Reuse เลย)

```text
ทุกอย่างต้อง Generate ใหม่ทั้งหมด

Component          ProviderCost
─────────────────────────────────────────────────────────
Property Extraction                Claude Haiku     $0.003
Google Geocoding                   Google Maps      $0.005
Google Static Map                  Google Maps      $0.002
Asset Safety Check (3images)      Google Vision    $0.009
House Image Generation             Flux 1 Dev       $0.025
Video Generation                   Minimax Video    $0.080
FFmpeg Render                      Local$0.002
TTS Voiceover                      Fish Audio       $0.003
Price Badge + QR Text              Claude Haiku     $0.001
Caption Generation (4 platforms)   Claude Haiku     $0.005
Analytics Insight  Claude Haiku     $0.002
─────────────────────────────────────────────────────────
TOTAL                $0.137
Scenario B — Partial Reuse (House Library Hit, Video Miss)
text
Copy
ดึง House Image จาก Library แต่ต้อง Generate Videoใหม่

Component                          Provider         Cost
─────────────────────────────────────────────────────────
Property Extraction                Claude Haiku     $0.003
Google Geocoding                   CACHE HIT        $0.000
Google Static Map                  CACHE HIT        $0.000
Asset Safety Check (3 images)      Google Vision    $0.009
House Image                LIBRARY REUSE    $0.000  ← ประหยัด $0.025
Video Generation                   Minimax Video    $0.080
FFmpeg Render                      Local            $0.002
TTS Voiceover                      Fish Audio       $0.003
Price Badge + QR Text              Claude Haiku     $0.001
Caption Generation (4 platforms)   Claude Haiku     $0.005
Analytics Insight                  Claude Haiku     $0.002
─────────────────────────────────────────────────────────
TOTAL                                               $0.105
SAVINGS vs Scenario A                              -$0.032
Scenario C — Full Reuse (House + Video Library Hit)
text
Copy
ดึงทั้ง House Image และ Video จาก Library ได้ทั้งคู่

Component                          Provider         Cost
─────────────────────────────────────────────────────────
Property Extraction                Claude Haiku     $0.003
Google Geocoding                   CACHE HIT        $0.000
Google Static Map                  CACHE HIT        $0.000
Asset Safety Check (3 images)      Google Vision    $0.009
House Image                        LIBRARY REUSE    $0.000  ← ประหยัด $0.025
Video                              LIBRARY REUSE    $0.000  ← ประหยัด $0.080
FFmpeg Render                      Local            $0.002
TTS Voiceover                      Fish Audio       $0.003
Price Badge + QR Text              Claude Haiku     $0.001
Caption Generation (4 platforms)   Claude Haiku     $0.005
Analytics Insight                  Claude Haiku     $0.002
─────────────────────────────────────────────────────────
TOTAL                                               $0.025
SAVINGS vs Scenario A                              -$0.112
Scenario D — Premium Generation (ใช้ Providerระดับสูงสุด)
text
Copy
ใช้ Midjourney + Runway + ElevenLabs ทั้งหมด

Component                          Provider         Cost
─────────────────────────────────────────────────────────
Property Extraction                Claude Sonnet    $0.008
Google Geocoding                   Google Maps      $0.005
Google Static Map                  Google Maps      $0.002
Google Street View                 Google Maps      $0.007
Asset Safety Check (5 images)      Google Vision    $0.015
House Image Generation             Midjourney V7    $0.050
Video Generation                   Runway Gen3      $0.260
FFmpeg Render                      Local            $0.002
TTS Voiceover                      ElevenLabs       $0.005
Price Badge + QR Text              Claude Haiku     $0.001
Caption Generation (4 platforms)   Claude Haiku     $0.005
Analytics Insight                  Claude Haiku     $0.002
─────────────────────────────────────────────────────────
TOTAL                                               $0.362
4. Cost Estimation Formula
###4.1 Pre-flight Estimate

javascript
Copy
function estimateTransactionCost(params) {
  const {
    hasImages = false,
    imageCount = 0,
    googleCacheHit = false,
    houseCacheHit = false,
    videoCacheHit = false,
    videoProvider = "MINIMAX_VIDEO",
    imageProvider = "FLUX_1_DEV",
    ttsProvider = "FISH_AUDIO",
    llmProvider = "CLAUDE_HAIKU",
    platformCount = 4
  } = params;

  // Provider Price Tables
  const VIDEO_PRICES = {
    MINIMAX_VIDEO: 0.080,
    LUMA_DREAM:    0.140,
    KLING_V2:      0.160,
    HIGGSFIELD:    0.180,
    VEO_2:         0.220,
    RUNWAY_GEN3:   0.260
  };

  const IMAGE_PRICES = {
    SDXL:            0.002,
    FLUX_1_SCHNELL:  0.003,
    FLUX_1_DEV:      0.025,
    MIDJOURNEY_V7:   0.050
  };

  const TTS_PRICES = {
    FISH_AUDIO:       0.003,
    ELEVENLABS_TURBO: 0.005,
    OPENAI_TTS:       0.015
  };

  const LLM_PRICES = {
    CLAUDE_HAIKU:  0.003,
    CLAUDE_SONNET: 0.008,
    GEMINI_FLASH:  0.001
  };

  let estimate = 0;

  // Property Engine
  estimate += LLM_PRICES[llmProvider] || 0.003;

  // Google Engine
  if (!googleCacheHit) {
    estimate += 0.005; // Geocoding
    estimate += 0.002; // Static Map
  }

  // Asset Engine
  if (hasImages && imageCount > 0) {
    estimate += imageCount * 0.003; // Vision API per image
  }

  // House Engine
  if (!houseCacheHit) {
    estimate += IMAGE_PRICES[imageProvider] || 0.025;
  }

  // Video Engine
  if (!videoCacheHit) {
    estimate += VIDEO_PRICES[videoProvider] || 0.080;
  }

  // Render Engine
  estimate += 0.002; // FFmpeg
  estimate += TTS_PRICES[ttsProvider] || 0.003;

  // Overlay Engine
  estimate += 0.001; // Price badge + QR text

  // Publish Engine — Caption
  estimate += 0.001* platformCount;

  // Analytics Engine
  estimate += 0.002;

  return {
    estimated_cost_usd: parseFloat(estimate.toFixed(6)),
    breakdown: {
      property_engine: LLM_PRICES[llmProvider] || 0.003,
      google_engine:   googleCacheHit ? 0 : 0.007,
      asset_engine:    hasImages ? imageCount * 0.003 : 0,
      house_engine:    houseCacheHit ? 0 : (IMAGE_PRICES[imageProvider] || 0.025),
      video_engine:    videoCacheHit ? 0 : (VIDEO_PRICES[videoProvider] || 0.080),
      render_engine:   0.002+ (TTS_PRICES[ttsProvider] || 0.003),
      overlay_engine:  0.001,
      publish_engine:  0.001 * platformCount,
      analytics_engine:0.002
    }
  };
}
4.2 Monthly Cost Projection
javascript
Copy
function projectMonthlyCost(dailyVolume, reuseRate = 0.4) {
  // reuseRate = สัดส่วนของวิดีโอที่ใช้ Library Reuse
  // เช่น 0.4 = 40% ของวิดีโอที่สร้างทุกวัน reuse House หรือ Video

  const FULL_GEN_COST= 0.137; // Scenario A
  const FULL_REUSE_COST  = 0.025; // Scenario C
  const PARTIAL_REUSE    = 0.105; // Scenario B

  // คำนวณ Weighted Average Cost
  const reusePct= reuseRate;
  const newGenPct   = 1 - reuseRate;

  const avgCostPerVideo =
    (reusePct * FULL_REUSE_COST) +
    (newGenPct * FULL_GEN_COST);

  const dailyCost= dailyVolume * avgCostPerVideo;
  const monthlyCost = dailyCost *30;

  // คำนวณ Savings จาก Reuse
  const costWithoutReuse = dailyVolume * FULL_GEN_COST *30;
  const savings = costWithoutReuse - monthlyCost;

  return {
    daily_volume:         dailyVolume,
    reuse_rate_pct:       (reuseRate * 100).toFixed(1) + "%",
    avg_cost_per_video:   `$${avgCostPerVideo.toFixed(4)}`,
    daily_cost_usd:       `$${dailyCost.toFixed(2)}`,
    monthly_cost_usd:     `$${monthlyCost.toFixed(2)}`,
    monthly_savings_usd:  `$${savings.toFixed(2)}`,
    cost_without_reuse:   `$${costWithoutReuse.toFixed(2)}`
  };
}
4.3 Monthly Projection Examples
text
Copy
─────────────────────────────────────
Volume/Day    Reuse Rate    Avg Cost/Video    Monthly Cost    Savings
─────────────────────────────────────────────────────────────────────5           20%            $0.115$17.25$2.85
     5           40%            $0.092           $13.80        $6.30
     5           60%            $0.070           $10.50        $9.6010           20%            $0.115           $34.50        $5.70
    10           40%            $0.092           $27.60$12.60
    10           60%            $0.070           $21.00       $19.20
    20           20%            $0.115           $69.00       $11.40
    20           40%            $0.092           $55.20       $25.20
    20           60%            $0.070           $42.00       $38.40
    50           40%            $0.092          $138.00       $63.00
   100           40%            $0.092          $276.00      $126.00
─────────────────────────────────────
5. Budget Alert Thresholds
javascript
Copy
const BUDGET_THRESHOLDS = {
  per_video: {
    GREEN:  0.20,  // ต้นทุนปกติ ไม่ต้องทำอะไร
    YELLOW: 0.25,  // ใกล้เกินงบ ให้ระวัง
    RED:    0.30// เกินงบ ต้องหยุดและตรวจสอบ
  },
  per_day: {
    GREEN:  5.00,  // สำหรับ Volume 30-40 videos/day
    YELLOW: 8.00,
    RED:   10.00
  },
  per_month: {
    GREEN:  100.00,
    YELLOW: 150.00,
    RED:   200.00
  }
};

function checkBudgetStatus(cost, type = "per_video") {
  const thresholds = BUDGET_THRESHOLDS[type];
  if (cost >= thresholds.RED)return { status: "OVER_BUDGET",alert: true};
  if (cost >= thresholds.YELLOW) return { status: "NEAR_LIMIT",   alert: true  };
  return{ status: "UNDER_BUDGET", alert: false };
}
6. Reuse Savings Dashboard Queries
6.1 Total Reuse Savings (All Time)
sql
Copy
SELECT
  COUNT(*) FILTER (WHERE provider_name = 'HOUSE_LIBRARY')AS house_reuses,
  COUNT(*) FILTER (WHERE provider_name = 'VIDEO_LIBRARY')
    AS video_reuses,
  COUNT(*) FILTER (WHERE provider_name = 'GOOGLE_CACHE')
    AS google_reuses,

  -- คำนวณเงินที่ประหยัดได้
  COUNT(*) FILTER (WHERE provider_name = 'HOUSE_LIBRARY') * 0.025
    AS house_savings_usd,
  COUNT(*) FILTER (WHERE provider_name = 'VIDEO_LIBRARY') * 0.080
    AS video_savings_usd,
  COUNT(*) FILTER (WHERE provider_name = 'GOOGLE_CACHE')* 0.007
    AS google_savings_usd,

  (
    COUNT(*) FILTER (WHERE provider_name = 'HOUSE_LIBRARY') * 0.025 +
    COUNT(*) FILTER (WHERE provider_name = 'VIDEO_LIBRARY') * 0.080 +
    COUNT(*) FILTER (WHERE provider_name = 'GOOGLE_CACHE')  * 0.007
  ) AS total_savings_usd

FROM analytics_events
WHERE event_type = 'COST_EVENT'
  AND cost_usd   = 0.0;
6.2 Cost Per Provider (Last 30 Days)
sql
Copy
SELECT
  provider_name,
  COUNT(*)    AS call_count,
  SUM(cost_usd)               AS total_cost_usd,
  AVG(cost_usd)               AS avg_cost_usd,
  MIN(cost_usd)               AS min_cost_usd,
  MAX(cost_usd)               AS max_cost_usd,
  ROUND(AVG(
    (metrics_json->>'duration_ms')::numeric
  ), 0)                       AS avg_latency_ms
FROM analytics_events
WHERE event_type  = 'COST_EVENT'
  AND cost_usd    > 0
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY provider_name
ORDER BY total_cost_usd DESC;
6.3 Daily Cost Trend
sql
Copy
SELECT
  DATE(created_at)              AS date,
  COUNT(DISTINCT transaction_id)                AS video_count,
  SUM(cost_usd)                                 AS total_cost_usd,
  ROUND(SUM(cost_usd) / COUNT(DISTINCT transaction_id), 4)                                AS avg_cost_per_video,
  SUM(cost_usd) FILTER (WHERE provider_name IN ('HOUSE_LIBRARY','VIDEO_LIBRARY','GOOGLE_CACHE'))
                                                AS reuse_savings_usd
FROM analytics_events
WHERE event_type  = 'COST_EVENT'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
6.4 Most Expensive Transactions
sql
Copy
SELECT
  t.transaction_id,
  t.property_id,
  p.raw_title,
  SUM(ae.cost_usd)          AS total_cost_usd,
  t.created_at
FROM video_transactions t
JOIN analytics_events aeON t.transaction_id = ae.transaction_id
LEFT JOIN properties p
  ON t.property_id = p.property_id
WHERE ae.event_type = 'COST_EVENT'
  AND t.created_at >= NOW() - INTERVAL '7 days'
GROUP BY t.transaction_id, t.property_id, p.raw_title, t.created_at
ORDER BY total_cost_usd DESC
LIMIT 10;
7. Cost Optimization Recommendations
7.1 Quick Wins (ลดต้นทุนได้ทันที)
text
Copy
1. เปลี่ยน Primary Video Provider จาก KLING_V2 → MINIMAX_VIDEOประหยัด: $0.080 ต่อวิดีโอ (50% ลดลง)

2. เปลี่ยน Primary TTS จาก ELEVENLABS → FISH_AUDIO
   ประหยัด: $0.002 ต่อวิดีโอ

3. เพิ่ม House Library ให้ครอบคลุมทุก Style Tagครบ 20ภาพ/Style
   ประหยัด: $0.025 ต่อวิดีโอที่ reuse ได้

4. เพิ่ม Video Library Cache
   ประหยัด: $0.080 ต่อวิดีโอที่ reuse ได้
7.2 Medium-term Optimization
text
Copy
5. ติดตั้ง Local Stable Diffusion XL สำหรับ House Generation
   ประหยัด: $0.025 ต่อภาพ (ต้นทุน GPU เท่านั้น)

6. ลด Caption Platforms จาก 4 → 2 (TikTok + Facebook เท่านั้น)
   ประหยัด: $0.002 ต่อวิดีโอ

7. ใช้ Gemini Flash แทน Claude Haiku สำหรับ Caption Generation
   ประหยัด: $0.001–0.002 ต่อวิดีโอ
7.3 Cost Guardrails (กฎที่ต้องมี)
javascript
Copy
// ต้องตรวจสอบก่อนเรียก Video Engine ทุกครั้ง
function preFlight_VideoEngineCheck(transaction) {
  const accumulated = transaction.accumulated_cost;
  const videoEstimate = 0.080; // MINIMAX_VIDEO min cost
  const renderEstimate = 0.007; // Render + TTS + Captions

  const projectedTotal = accumulated + videoEstimate + renderEstimate;

  if (projectedTotal > 0.30) {
    throw new Error(
      `ERR_BUDGET: Projected cost $${projectedTotal.toFixed(4)} exceeds budget $0.30`
    );
  }

  return true;
}
8. Claude Rules for Cost Calculator
ห้าม hardcode ราคา Providerในหลายที่ ให้อ้างอิงจาก Cost Components Table นี้เท่านั้น
ต้องแยก estimated_cost_usd และ actual_cost_usd เสมอ ห้ามใช้ค่าเดียวกัน
ต้อง log cost =0 สำหรับ Reuse Event ด้วยเสมอ เพื่อให้คำนวณ Savings ได้
ต้องรัน Pre-flight Check ก่อนเรียก Video Engine ทุกครั้ง
ราคา Provider เปลี่ยนได้ตลอด ต้องตรวจสอบและอัปเดต Table นี้เป็นประจำทุกเดือน
9. Migration Guide
ระบบเดิม
text
Copy
ไม่มีการติดตาม Costใดๆ
ไม่รู้ว่า Transaction ไหนแพงที่สุด
ไม่รู้ว่า Provider ไหนคุ้มค่าที่สุด
ไม่รู้ว่าประหยัดเงินไปได้เท่าไรจาก Reuse
ระบบใหม่
text
Copy
1. ทุก Engine บันทึก Cost Event ทันทีหลังทำงาน
2. Analytics Engine รวม Cost ต่อ Transaction
3. Dashboard แสดง Cost Trend รายวัน รายเดือน
4. Budget Alert แจ้งเตือนเมื่อใกล้เกินงบ
5. Savings Report แสดงเงินที่ประหยัดจาก Reuse
6. Provider Scorecard ใช้ข้อมูล Cost จริงในการเลือก Provider