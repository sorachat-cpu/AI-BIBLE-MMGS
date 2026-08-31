// WF5 Media Generation Pipeline -- steps 5.1 through 5.8.
//
// WF5 §7 requires each step be a separate modular function so engines can be swapped and
// debugged one step at a time. Every step here reports its own readiness, so an operator
// can see exactly which stage is blocked and on what, rather than discovering it mid-run.
//
// Relationship to AI_BIBLE: WF5 is a different decomposition of the same pipeline.
//   5.1 Satellite Zoom       -> Google Engine (08) + Video Engine (11)
//   5.2 Drone Animation      -> Video Engine (11)
//   5.3 House Visualization  -> House Engine (10)
//   5.4 Construction Sim     -> House Engine (10) + Video Engine (11), start/end frame
//   5.5 Image to Video       -> Video Engine (11)
//   5.6 Subtitle             -> Render Engine (12)
//   5.7 BGM & Voice          -> Render Engine (12) + TTS provider
//   5.8 Final Render         -> Render Engine (12) + Overlay Engine (13)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { runGoogleEngine } from "../engines/google-engine.mjs";
import { runVideoEngine } from "../engines/video-engine.mjs";
import { runHouseEngine } from "../engines/house-engine.mjs";
import { runRenderEngine } from "../engines/render-engine.mjs";
import { describeEngines } from "../providers/registry.mjs";

const execFileAsync = promisify(execFile);

let ffmpegCache = null;
export async function hasFfmpeg() {
  if (ffmpegCache !== null) return ffmpegCache;
  try {
    // Probe the bundled ffmpeg-static binary, not the bare name -- nothing put ffmpeg
    // on PATH, so looking it up there reports "missing" while rendering works fine.
    await execFileAsync(ffmpegPath, ["-version"]);
    ffmpegCache = true;
  } catch {
    ffmpegCache = false;
  }
  return ffmpegCache;
}

/** 5.1 Satellite Zoom -- orbit down to the plot, built from the real satellite frame. */
export async function step51_satelliteZoom({ property_id, raw_address }, options = {}) {
  const geo = await runGoogleEngine({ property_id, raw_address }, options);
  // The static map URL carries our Google key. Fetch the bytes here so the key is never
  // handed to a third-party video vendor.
  const res = await fetch(geo.static_map_url);
  if (!res.ok) throw new Error(`ดึงภาพดาวเทียมไม่สำเร็จ (HTTP ${res.status})`);
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");

  const video = await runVideoEngine(
    {
      property_id,
      image_base64: `data:image/png;base64,${base64}`,
      template_id: "TPL_VID_007_v1",
      camera_motion: "DRONE_REVEAL",
    },
    options
  );
  return { geo, clip: video.b_roll_clips[0] };
}

/**
 * 5.2 Drone Animation -- motion over a real drone photo.
 * WF5 §7 is explicit that source imagery must be the property's own photo, never stock,
 * so this takes an uploaded image and has no built-in fallback picture.
 */
export async function step52_droneAnimation({ property_id, image_base64, image_url }, options = {}) {
  if (!image_base64 && !image_url) {
    throw new Error("5.2 ต้องใช้ภาพโดรนจริงของทรัพย์ (WF5 ห้ามใช้ภาพ stock)");
  }
  const video = await runVideoEngine(
    { property_id, image_base64, image_url, template_id: "TPL_VID_001_v1", camera_motion: "DRONE_REVEAL" },
    options
  );
  return { clip: video.b_roll_clips[0] };
}

/** 5.3 House Visualization -- AI-generated house still. */
export async function step53_houseVisualization(input, options = {}) {
  return runHouseEngine(input, options);
}

/**
 * 5.4 Construction Simulation -- bare plot to finished house.
 * Preferred path renders the house first and pins it as the closing frame so the result
 * is art-directed. If the image engine is unavailable the shot still runs, with the video
 * model improvising the building from the prompt.
 *
 * If the caller already has a finished-house image (House Engine's own reuse cache, a
 * seller-supplied photo, or one generated in an earlier call), pass it as
 * house_image_base64 / house_image_url to use it directly as the end frame and skip the
 * internal House Engine call -- no redundant spend, no dependency on House Engine's
 * current image-credit instability.
 */
export async function step54_constructionSimulation(
  { property_id, style_tag, land_image_base64, land_image_url, house_image_base64, house_image_url },
  options = {}
) {
  const housePreSupplied = Boolean(house_image_base64 || house_image_url);
  let endFrameBase64 = house_image_base64;
  let endFrameUrl = house_image_base64 ? undefined : house_image_url;
  let houseCost = 0;
  let degraded = null;

  if (!housePreSupplied) {
    try {
      const house = await runHouseEngine({ property_id, style_tag, land_image_base64, land_image_url }, options);
      endFrameUrl = house.house_image_url;
      houseCost = house.generation_metadata.cost_usd;
    } catch (err) {
      degraded = err.message;
    }
  }

  const video = await runVideoEngine(
    {
      property_id,
      image_base64: land_image_base64,
      image_url: land_image_base64 ? undefined : land_image_url,
      image_tail_base64: endFrameBase64,
      image_tail_url: endFrameUrl,
      template_id: "TPL_VID_008_v1",
      camera_motion: "DRONE_REVEAL",
    },
    options
  );
  return {
    clip: video.b_roll_clips[0],
    art_directed: Boolean(endFrameBase64 || endFrameUrl),
    degraded,
    house_cost_usd: houseCost,
  };
}

/** 5.5 Image to Video -- the generic still-to-motion step. */
export async function step55_imageToVideo(input, options = {}) {
  const video = await runVideoEngine(input, options);
  return { clip: video.b_roll_clips[0] };
}

/**
 * 5.6 Subtitle, 5.7 BGM & Voice, 5.8 Final Render.
 * All three are the same FFmpeg pass in Render Engine -- splitting them into three
 * separate encodes would re-compress the video twice for no benefit. They stay exposed
 * as three named entry points because WF5 §7 asks for per-step modularity.
 */
export async function step56_addSubtitle(input, options = {}) {
  return runRenderEngine({ ...input, ending_card: undefined }, options);
}
export async function step57_addAudio(input, options = {}) {
  return runRenderEngine(input, options);
}
export async function step58_finalRender(input, options = {}) {
  return runRenderEngine(input, options);
}

/** Machine-readable readiness for every WF5 step -- drives the status panel in the UI. */
export async function wf5Readiness() {
  const ffmpeg = await hasFfmpeg();
  const engines = describeEngines();
  const imageReady = engines.image.selected === "kling"; // implemented, but out of image credit
  return {
    engines,
    ffmpeg,
    steps: [
      { id: "5.1", name: "Satellite Zoom", ready: true, blocker: null },
      { id: "5.2", name: "Drone Animation", ready: true, blocker: "ต้องอัปโหลดภาพโดรนจริง (ห้าม stock)" },
      {
        id: "5.3",
        name: "House Visualization",
        ready: false,
        blocker: imageReady
          ? "โค้ดพร้อม แต่โควตารูปของ Kling หมด (resource package ครอบคลุมเฉพาะวิดีโอ)"
          : "ยังไม่ได้เขียน adapter ของ SDXL",
      },
      { id: "5.4", name: "Construction Simulation", ready: true, blocker: "ทำได้แบบ degraded (บ้านจะถูกจินตนาการเองจากพรอมต์) จนกว่า 5.3 จะใช้ได้ — หรือส่ง house_image_url/house_image_base64 มาเองเพื่อข้ามข้อจำกัดนี้ทันที" },
      { id: "5.5", name: "Image to Video", ready: true, blocker: null },
      { id: "5.6", name: "Add Subtitle", ready: ffmpeg, blocker: ffmpeg ? null : "ยังไม่ได้ติดตั้ง FFmpeg" },
      {
        id: "5.7",
        name: "Add BGM & Voice",
        ready: ffmpeg,
        blocker: !ffmpeg
          ? "ยังไม่ได้ติดตั้ง FFmpeg"
          : process.env.ELEVENLABS_API_KEY
            ? null
            : "ผสมเพลงประกอบได้แล้ว แต่ยังพากย์เสียงไม่ได้ (ยังไม่มี ELEVENLABS_API_KEY)",
      },
      { id: "5.8", name: "Final Render", ready: ffmpeg, blocker: ffmpeg ? null : "ยังไม่ได้ติดตั้ง FFmpeg" },
    ],
  };
}
