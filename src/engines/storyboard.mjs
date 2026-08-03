// Storyboard -- composes the engines into the four-beat opener the client asked for:
//
//   1  pin          the pinned map, camera pushing toward the marker
//   2  descent      falls out of the sky, map view resolving into the real plot photo
//   3  construction the plot builds itself into a finished house
//   4  detail card  property details, price and contact (added by Render Engine)
//
// Beats 2 and 3 use Kling's start/end frame support so the cut points actually connect:
// beat 2 ends on the customer's own land photo, which is exactly where beat 3 begins.
// Without that the sequence would jump between three unrelated images.
//
// This is orchestration only. Per 02_ARCHITECTURE.md the Orchestrator sequences engines
// and never does media work itself, so every frame here comes from an engine call.
import { runHouseEngine } from "./house-engine.mjs";
import { runVideoEngine } from "./video-engine.mjs";
import { runGoogleEngine } from "./google-engine.mjs";

export class StoryboardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Google image URLs embed our API key; never hand one to a third-party video vendor. */
async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดึงภาพไม่สำเร็จ (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export async function runStoryboard(input, options = {}) {
  const {
    property_id,
    style_tag = "CONTEMPORARY",
    land_image_base64,
    land_image_url,
    raw_address,
    shots = ["pin", "descent", "construction"],
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new StoryboardError("ERR_SB_INPUT", "property_id missing or malformed");
  }
  const hasLand = Boolean(land_image_base64 || land_image_url);
  if (!hasLand && !raw_address) {
    throw new StoryboardError("ERR_SB_INPUT", "ต้องมีรูปที่ดิน หรือที่อยู่/ลิงก์แผนที่ อย่างน้อยหนึ่งอย่าง");
  }

  const steps = [];
  const clips = [];
  let totalCost = 0;
  const note = (stage, status, detail, cost = 0) => {
    totalCost += cost;
    steps.push({ stage, status, detail, cost_usd: cost });
  };

  // ---- locate the property once; both map beats reuse the result ----
  let geo = null;
  let pinFrame = null;
  if (raw_address && (shots.includes("pin") || shots.includes("descent"))) {
    try {
      geo = await runGoogleEngine({ property_id, raw_address, nearby_radius_m: 3000 }, options);
      pinFrame = await fetchAsBase64(geo.pin_map_url);
      note("google", "ok", `${geo.geo_location.formatted_address.slice(0, 60)}`, 0.005);
    } catch (err) {
      note("google", "failed", `หาพิกัดไม่สำเร็จ: ${err.message}`);
    }
  }

  // ---- beat 1: push in on the pinned map ----
  if (shots.includes("pin")) {
    if (!pinFrame) {
      note("pin", "skipped", "ไม่มีภาพแผนที่ (ต้องมีที่อยู่หรือลิงก์แผนที่)");
    } else {
      try {
        const shot = await runVideoEngine(
          { property_id, image_base64: pinFrame, template_id: "TPL_VID_009_v1", camera_motion: "ZOOM_IN" },
          options
        );
        clips.push({ shot: "pin", label: "หมุดบนแผนที่", ...shot.b_roll_clips[0] });
        note("pin", "ok", "สร้างช็อตหมุดบนแผนที่สำเร็จ", 0.16);
      } catch (err) {
        note("pin", "failed", `[${err.code}] ${err.message}`);
      }
    }
  }

  // ---- beat 2: sky descent, map view landing on the real plot photo ----
  if (shots.includes("descent")) {
    const start = pinFrame ?? land_image_base64;
    if (!start && !land_image_url) {
      note("descent", "skipped", "ไม่มีภาพตั้งต้นสำหรับช็อตดิ่งลงจากฟ้า");
    } else {
      try {
        const shot = await runVideoEngine(
          {
            property_id,
            image_base64: start,
            image_url: start ? undefined : land_image_url,
            // Landing on the customer's own land photo is what makes this read as a
            // descent onto THIS plot rather than generic stock aerial footage.
            image_tail_base64: pinFrame ? land_image_base64 : undefined,
            image_tail_url: pinFrame && !land_image_base64 ? land_image_url : undefined,
            template_id: "TPL_VID_010_v1",
            camera_motion: "DRONE_REVEAL",
          },
          options
        );
        clips.push({
          shot: "descent",
          label: hasLand && pinFrame ? "ดิ่งจากฟ้าลงสู่ที่ดินจริง" : "ดิ่งลงจากฟ้า",
          ...shot.b_roll_clips[0],
        });
        note("descent", "ok", "สร้างช็อตดิ่งลงจากฟ้าสำเร็จ", 0.16);
      } catch (err) {
        note("descent", "failed", `[${err.code}] ${err.message}`);
      }
    }
  }

  // ---- beat 3: the house rises on that same plot ----
  if (shots.includes("construction")) {
    if (!hasLand) {
      note("construction", "skipped", "ต้องมีรูปที่ดินเปล่าเพื่อใช้เป็นเฟรมแรก");
    } else {
      // Preferred path renders the house first and pins it as the closing frame, so the
      // finished building is art-directed. Kling bills image and video credit separately,
      // so when the image call is refused the shot still runs -- the video model
      // improvises the building from the prompt instead.
      let endFrameUrl;
      try {
        const house = await runHouseEngine({ property_id, style_tag, land_image_base64, land_image_url }, options);
        endFrameUrl = house.house_image_url;
        note("house", "ok", `สร้างภาพบ้านสไตล์ ${style_tag} เพื่อใช้เป็นเฟรมสุดท้าย`, house.generation_metadata.cost_usd);
      } catch (err) {
        note(
          "house",
          "degraded",
          /balance not enough/i.test(err.message)
            ? "โควตาสร้างรูปของ Kling หมด — ให้โมเดลวิดีโอจินตนาการบ้านจาก prompt แทน (คุมหน้าตาบ้านได้น้อยลง)"
            : `สร้างภาพบ้านไม่สำเร็จ: [${err.code}] ${err.message}`
        );
      }

      try {
        const shot = await runVideoEngine(
          {
            property_id,
            image_base64: land_image_base64,
            image_url: land_image_base64 ? undefined : land_image_url,
            image_tail_url: endFrameUrl,
            template_id: "TPL_VID_008_v1",
            camera_motion: "DRONE_REVEAL",
          },
          options
        );
        clips.push({
          shot: "construction",
          label: endFrameUrl ? "บ้านก่อสร้างขึ้นบนที่ดิน" : "บ้านก่อสร้างขึ้น (โมเดลจินตนาการเอง)",
          ...shot.b_roll_clips[0],
        });
        note("construction", "ok", "สร้างช็อตก่อสร้างสำเร็จ", 0.16);
      } catch (err) {
        note("construction", "failed", `[${err.code}] ${err.message}`);
      }
    }
  }

  if (!clips.length) {
    throw new StoryboardError("ERR_SB_ALL_FAILED", steps.map((s) => `${s.stage}: ${s.detail}`).join(" | "));
  }

  return {
    property_id,
    clips,
    steps,
    // Handed to Render Engine for beat 4 so the closing card states real, checkable facts
    // about this property rather than generic marketing copy.
    detail_suggestions: {
      address: geo?.geo_location?.formatted_address ?? null,
      nearby_lines: geo?.nearby?.highlight_lines ?? [],
      // Nearest place per category, ready for the mid-clip location card (WF5-fix §2.1).
      nearby_places: (geo?.nearby?.groups ?? []).slice(0, 5).map((g) => ({
        name: g.places[0].name,
        category: g.category,
        distance_text: g.places[0].distance_text,
      })),
    },
    total_cost_usd: Number(totalCost.toFixed(4)),
    stitched: false,
  };
}
