// Prepare the inputs Google Flow needs for WF1 and WF2, and hand back the prompts.
//
// Flow is driven by hand in a browser, so this repo's job on the generative half is to
// produce exactly the two plates each workflow starts and ends on, and to be the single
// source of the prompt text. Keeping the prompts here rather than in a pasted note is what
// stops them drifting -- wf/WF1.md and wf/WF2.md are the spec, this is the wording that
// implements it, and the CLI and the web console both read it from this file.
//
// The start plate must be clean satellite photography. A labelled map -- roadmap or hybrid,
// POI glyphs, a red marker -- gets read by the video model as physical objects and animated
// as balloons drifting through the sky, and no "no pins, no text" in the prompt suppresses
// what is baked into the pixels. The WF1 marker is composited afterwards instead
// (compositeWf1Overlays), which is also why it is absent from the prompt below.
import path from "node:path";
import { writeFile, copyFile, mkdir } from "node:fs/promises";
import {
  ffmpeg, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { runGoogleEngine, satelliteZoomUrls } from "../engines/google-engine.mjs";

// Close enough that the parcel's surroundings are recognisable, far enough that the model
// still has somewhere to descend from. Verified on a real run.
const START_ZOOM = 16;

export class WfPrepareError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WfPrepareError";
    this.code = code;
  }
}

/** WF1 — wf/WF1.md. Active voice: Flow wants a clear motion vector, not a description. */
export const WF1_PROMPT = `A continuous aerial descent from high above the ground down to the site. The camera
drops steadily through open sky and plunges down through a layer of real white clouds
and thin haze. The ground gradually opens up below as the camera emerges under the
cloud base. The camera tilts forward as it descends, so the perspective deepens from a
high looking-down angle into a low forward-facing view, arriving at a real photographic
ground-level view of the same location. One unbroken accelerating flight that eases to
a stop. No cuts, no shake. Photorealistic drone footage, natural daylight, realistic
volumetric clouds, natural motion blur. No text, no map labels, no pins, no overlays,
no watermark.`;

/** WF2 end plate — wf/WF2.md. Generated first so the video has a fixed frame to land on. */
export const WF2_IMAGE_PROMPT = `Using the reference photo as the exact location, keep the land, terrain, road, tree line,
mountains and background composition unchanged. Place a single-storey cozy garden house
on this land. The house has a sloped roof, simple timeless design, warm earth-tone walls,
natural wood accents, a wooden front door, moderately sized glass windows, a covered front
porch with a sitting area, and wide eaves. A roofed carport for one or two cars stands
beside the house, built from matching natural materials and connected to the existing
driveway. A natural home garden surrounds it: lawn, mature trees, shrubs, flowering plants,
a stone footpath, potted plants and a quiet seating corner — a garden a homeowner tends
themselves, not a hotel landscape. It is early evening. The sky is a deep blue evening sky
and the mountains, tree line and road are still clearly visible, not lost in darkness.
Warm white and warm amber lights glow softly from the windows, the front door, the porch,
the living room, the kitchen and the carport, spilling gently onto the garden. Soft path
lights line the walkway and a lamp glows under the eaves. Photorealistic, cozy, homely and
natural — not luxurious, not a resort, not a modern box, not a two-storey building.`;

/** WF2 motion — wf/WF2.md. Every ABSOLUTE RULE the spec lists is stated explicitly. */
export const WF2_VIDEO_PROMPT = `A construction time-lapse on this exact plot of land. The camera holds the same viewpoint
throughout. The land itself never changes — the terrain, the road, the tree line, the
mountains and the shape of the plot stay exactly as they are. Only the house is built.

Workers clear and level the ground, then footings and a concrete foundation are poured.
The single-storey frame rises post by post, the sloped roof structure goes on and is
covered, walls are built and rendered in warm earth tones, wooden doors and windows are
fitted, the covered front porch takes shape, and a matching roofed carport is built beside
the house. Natural wood accents are added, then the garden fills in around it — lawn is
laid, mature trees and shrubs are planted, a stone footpath is set, potted plants and a
seating corner appear.

The light moves through the day as the house rises: late afternoon warms into golden hour,
golden hour cools into blue hour, and blue hour settles into early evening. The change is
gradual and continuous, never jumping from day to night.

As evening arrives, warm white and warm amber lights switch on one part of the house at a
time — windows, front door, porch, living room, kitchen, carport — glowing softly onto the
garden. Soft path lights come on along the walkway. The sky deepens to a rich blue evening
sky while the mountains, trees and road stay visible behind the house.

The camera pushes in very slowly with a gentle parallax, then eases back at the end to
reveal the finished house, the garden, the carport and the natural landscape behind them.

One continuous time-lapse. The house is built step by step and never appears instantly.
Photorealistic, cozy, homely, warm and natural. No text, no watermark, no overlays.`;

function stripDataUri(v) {
  return typeof v === "string" ? v.replace(/^data:image\/[a-zA-Z+]+;base64,/, "") : v;
}

const FLOW_DIR = path.join(OUTPUT_DIR, "flow");

/** Scale-to-cover then crop, so the plate is exactly the delivery aspect with no bars. */
async function toFrame(src, out, dims) {
  await ffmpeg([
    "-i", src,
    "-vf", `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}`,
    "-y", out,
  ]);
  return out;
}

/**
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} [input.raw_address]        needed for the WF1 start plate
 * @param {string} [input.land_image_base64]  the seller's real plot photo
 * @param {string} [input.land_image_url]
 * @param {string} [input.aspect]
 */
export async function prepareFlowInputs(input, options = {}) {
  const {
    property_id,
    raw_address,
    land_image_base64,
    land_image_url,
    aspect = "9:16",
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new WfPrepareError("ERR_WFPREP_INPUT", "property_id missing or malformed");
  }
  const dims = ASPECTS[aspect];
  if (!dims) throw new WfPrepareError("ERR_WFPREP_INPUT", `aspect ไม่รองรับ: ${aspect}`);
  if (!land_image_base64 && !land_image_url) {
    throw new WfPrepareError(
      "ERR_WFPREP_INPUT",
      "ต้องมีรูปที่ดินจริง — เป็นทั้งเฟรมจบของ WF1 และเฟรมแรกของ WF2"
    );
  }

  await ensureDirs();
  await mkdir(FLOW_DIR, { recursive: true });

  const stamp = Date.now();
  const steps = [];
  let geo = null;

  // ---- WF1 end plate / WF2 start plate: ONE file, because the spec's handoff is literal ----
  const landSrc = path.join(TEMP_DIR, `wfprep_land_${stamp}.png`);
  if (land_image_base64) {
    await writeFile(landSrc, Buffer.from(stripDataUri(land_image_base64), "base64"));
  } else {
    await downloadTo(land_image_url, landSrc);
  }
  const landFrame = path.join(FLOW_DIR, "WF1_END_land.png");
  await toFrame(landSrc, landFrame, dims);
  // Same bytes under WF2's name. Copying rather than re-encoding keeps them identical --
  // two separate renders of "the same" photo is exactly the drift the handoff forbids.
  const wf2Start = path.join(FLOW_DIR, "WF2_START_land.png");
  await copyFile(landFrame, wf2Start);
  steps.push({ stage: "land", status: "ok", detail: "เฟรมจบ WF1 = เฟรมแรก WF2 (ไฟล์เดียวกัน)" });

  // ---- WF1 start plate: clean satellite, attribution strip trimmed off ----
  let startFrame = null;
  const apiKey = (options.env ?? process.env).GOOGLE_MAPS_API_KEY;
  if (raw_address && apiKey) {
    try {
      geo = await runGoogleEngine(
        { property_id, raw_address, include_nearby: false },
        { ...options, googleMapsApiKey: apiKey }
      );
      const { url } = satelliteZoomUrls(geo.geo_location, apiKey, [START_ZOOM])[0];
      const raw = path.join(TEMP_DIR, `wfprep_sat_${stamp}.png`);
      await downloadTo(url, raw);
      const cropped = path.join(TEMP_DIR, `wfprep_sat_${stamp}_clean.png`);
      // Static Maps stamps its attribution across the bottom edge.
      await ffmpeg(["-i", raw, "-vf", "crop=iw:ih*0.94:0:0", "-y", cropped]);
      startFrame = path.join(FLOW_DIR, "WF1_START_satellite.png");
      await toFrame(cropped, startFrame, dims);
      steps.push({ stage: "satellite", status: "ok", detail: `ภาพดาวเทียมสะอาด zoom ${START_ZOOM}`, cost_usd: 0.005 });
    } catch (err) {
      steps.push({ stage: "satellite", status: "failed", detail: `สร้างเฟรมเริ่ม WF1 ไม่สำเร็จ: ${err.message}` });
    }
  } else {
    steps.push({
      stage: "satellite",
      status: "skipped",
      detail: raw_address ? "ไม่มี GOOGLE_MAPS_API_KEY" : "ไม่ได้ใส่ที่อยู่ — ข้ามเฟรมเริ่มของ WF1",
    });
  }

  const rel = (p) => (p ? `/output/flow/${path.basename(p)}` : null);
  return {
    property_id,
    aspect,
    geo: geo?.geo_location ?? null,
    frames: {
      wf1_start: startFrame,
      wf1_start_url: rel(startFrame),
      wf1_end: landFrame,
      wf1_end_url: rel(landFrame),
      wf2_start: wf2Start,
      wf2_start_url: rel(wf2Start),
    },
    prompts: {
      wf1: WF1_PROMPT,
      wf2_image: WF2_IMAGE_PROMPT,
      wf2_video: WF2_VIDEO_PROMPT,
    },
    steps,
    // Where Flow's output is expected back, so the finish step has a stable default.
    expects: {
      wf1_clip: "output/flow/WF1_result.mp4",
      wf2_clip: "output/flow/WF2_result.mp4",
      wf2_end_image: "output/flow/WF2_END_house_night.png",
    },
  };
}

/**
 * Step 1 for the console: prepare Flow's inputs AND remember the listing details.
 *
 * The operator types everything once, here. When they come back with clips, nothing is
 * asked of them again -- runWfContinue() reads it all back out of the job.
 */
export async function startWfJob(input, options = {}) {
  const { saveJob } = await import("./job.mjs");
  const prep = await prepareFlowInputs(input, options);
  const {
    title, price_thb, price_text, size_text, features = [], location, contact, cta,
    raw_address, aspect = "9:16",
  } = input ?? {};

  const job = {
    property_id: prep.property_id,
    created_at: new Date().toISOString(),
    aspect,
    raw_address: raw_address ?? null,
    geo: prep.geo,
    frames: {
      wf1_start: prep.frames.wf1_start,
      wf1_end: prep.frames.wf1_end,
      wf2_start: prep.frames.wf2_start,
    },
    listing: { title, price_thb, price_text, size_text, features, location, contact, cta },
  };
  await saveJob(job);
  return { ...prep, job_saved: true };
}

/**
 * Step 2 for the console: find what Flow produced and finish the whole film.
 *
 * Takes a property_id and nothing else. The clips are located by scanning the drop folder,
 * and the advertisement copy comes from the job saved in step 1 -- the operator does not
 * retype details or filenames just because they had to leave the app to run Flow.
 */
export async function continueWfJob(input, options = {}) {
  const { property_id, ...overrides } = input ?? {};
  const { loadJob, scanFlowDir } = await import("./job.mjs");
  const { runWfFinish } = await import("./pipeline.mjs");

  const job = await loadJob(property_id);
  if (!job) {
    throw new WfPrepareError(
      "ERR_WFPREP_NOJOB",
      `ไม่พบงานของ ${property_id} — ทำขั้นที่ 1 ก่อน (เตรียมไฟล์ให้ Flow)`
    );
  }

  const found = await scanFlowDir();
  if (!found.wf1_clip && !found.wf2_clip && !found.house_image) {
    throw new WfPrepareError(
      "ERR_WFPREP_NOCLIPS",
      "ยังไม่เจอไฟล์จาก Flow ในโฟลเดอร์ output/flow/ — เอาคลิปหรือภาพบ้านไปวางไว้ก่อน"
    );
  }

  const L = { ...job.listing, ...overrides };
  const results = await runWfFinish(
    {
      property_id,
      wf1_clip: found.wf1_clip ?? undefined,
      wf2_clip: found.wf2_clip ?? undefined,
      land_image: job.frames.wf1_end,
      house_image: found.house_image ?? undefined,
      aspect: job.aspect ?? "9:16",
      title: L.title, price_thb: L.price_thb, price_text: L.price_text,
      size_text: L.size_text, features: L.features, location: L.location,
      contact: L.contact, cta: L.cta,
    },
    options
  );
  return { ...results, picked: found.picked, job: { property_id, created_at: job.created_at } };
}
