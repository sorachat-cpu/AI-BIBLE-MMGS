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
const pathJoin = path.join;
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import {
  ffmpeg, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { runGoogleEngine, satelliteZoomUrls } from "../engines/google-engine.mjs";
import { get as getTemplate } from "../lib/prompt-library.mjs";

// Single source. 17_PROMPT_LIBRARY.md rule 2 forbids prompts living in engine code, and a
// second copy beside the console is exactly what let the page drift onto stale wording once
// already -- the console, the CLI and the auto runner all read these ids.
export const WF1_TEMPLATE_ID = "TPL_WF1_v1";
export const WF2_TEMPLATE_ID = "TPL_WF2_v1";
export const WF1_PROMPT = getTemplate(WF1_TEMPLATE_ID).text;
export const WF2_VIDEO_PROMPT = getTemplate(WF2_TEMPLATE_ID).text;

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

/**
 * Fully automatic run: generate WF1 and WF2 with Veo, then finish and join.
 *
 * This is the same film the Flow route produces, without the operator leaving the app --
 * possible only because fal's veo3.1 endpoint takes BOTH a first and a last frame, which is
 * what wf/'s FINAL FRAME = NEXT FIRST FRAME rule requires. Everything after generation is
 * the same local code path the manual route uses, so the two cannot diverge.
 *
 * WF2 does not need a picture of the finished house first. Veo's image-to-video endpoint
 * takes the land photo alone and builds the house during the time-lapse; the finished house
 * is then read off the generated clip's own final frame. That frame is what WF3 opens on, so
 * the handoff still holds -- it is discovered rather than supplied.
 *
 * (An earlier version demanded a house plate up front and skipped WF2 without one. That was
 * a limitation of the two-anchor endpoint being used for both shots, not of the workflow.)
 */
export async function runWfAuto(input, options = {}) {
  const { loadJob } = await import("./job.mjs");
  const { runWfFinish } = await import("./pipeline.mjs");
  const { runVideoEngine } = await import("../engines/video-engine.mjs");

  const { property_id, house_image, duration_seconds = 8, ...overrides } = input ?? {};
  const job = await loadJob(property_id);
  if (!job) {
    throw new WfPrepareError(
      "ERR_WFPREP_NOJOB",
      `ไม่พบงานของ ${property_id} — ทำขั้นที่ 1 ก่อน (ใส่รูปที่ดิน + รายละเอียด)`
    );
  }
  if (!job.frames?.wf1_start) {
    throw new WfPrepareError(
      "ERR_WFPREP_NOSTART",
      "ไม่มีเฟรมดาวเทียมสำหรับ WF1 — ตอนขั้นที่ 1 ต้องใส่ที่อยู่ และต้องมี GOOGLE_MAPS_API_KEY"
    );
  }

  const steps = [];
  // Ask for fal explicitly: this route exists because Veo there takes both anchor frames,
  // and falling back to whatever VIDEO_ENGINE happens to be would quietly produce a
  // different film -- or fail, as it did the first time this ran.
  const opts = {
    ...options,
    providerConfig: {
      ...(options.providerConfig ?? {}),
      engine: options.providerConfig?.engine ?? process.env.WF_AUTO_ENGINE ?? "fal",
      aspectRatio: job.aspect ?? "9:16",
    },
  };
  // Plates go in as data URIs, not paths: the field is called image_base64 and passing a
  // filesystem path through it only worked by accident.
  const asDataUri = async (file) =>
    `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
  const clip = async (label, imageFile, tailFile, templateId) => {
    const t0 = Date.now();
    if (!imageFile) {
      throw new WfPrepareError("ERR_WFPREP_NOSTART", `${label}: ไม่มีเฟรมแรก`);
    }
    // The end frame is genuinely optional -- WF2 runs without one so Veo can build the
    // house -- so a missing tail means "omit it", not "encode null".
    const [image, image_tail] = await Promise.all([
      asDataUri(imageFile),
      tailFile ? asDataUri(tailFile) : Promise.resolve(undefined),
    ]);
    const out = await runVideoEngine(
      {
        property_id,
        image_base64: image,
        image_tail_base64: image_tail,
        template_id: templateId,
        camera_motion: "DRONE_REVEAL",
        duration_seconds,
      },
      opts
    );
    const c = out.b_roll_clips[0];
    steps.push({
      stage: label, status: "ok",
      detail: `${c.duration_seconds}s ใน ${Math.round((Date.now() - t0) / 1000)} วินาที`,
    });
    return c.video_url;
  };

  // WF1: clean satellite plate -> the seller's real land photo.
  const wf1 = await clip("WF1", job.frames.wf1_start, job.frames.wf1_end, WF1_TEMPLATE_ID);

  // WF2: start on the same land photo WF1 ended on. A finished-house plate is optional --
  // supply one and the time-lapse is made to land on it, omit one and Veo builds the house
  // and we take the result from the clip's last frame.
  const houseTarget = house_image ?? job.frames.wf2_end ?? null;
  const wf2 = await clip("WF2", job.frames.wf2_start, houseTarget, WF2_TEMPLATE_ID);

  // The house WF3 advertises: whatever WF2 actually ended on, not a guess about it.
  let houseFrame = houseTarget;
  if (!houseFrame) {
    const { ffmpeg: ff, downloadTo: dl, TEMP_DIR: TMP } = await import("../lib/ffmpeg.mjs");
    const stamp = Date.now();
    const local = pathJoin(TMP, `wf2_out_${stamp}.mp4`);
    await dl(wf2, local);
    houseFrame = pathJoin(TMP, `wf2_house_${stamp}.png`);
    await ff(["-sseof", "-0.15", "-i", local, "-frames:v", "1", "-y", houseFrame]);
    steps.push({
      stage: "บ้านเสร็จ",
      status: "ok",
      detail: "ดึงจากเฟรมสุดท้ายของคลิป WF2 — ใช้เป็นภาพหลักของโฆษณา",
    });
  }

  const L = { ...job.listing, ...overrides };
  const results = await runWfFinish(
    {
      property_id, wf1_clip: wf1, wf2_clip: wf2,
      land_image: job.frames.wf1_end, house_image: houseFrame ?? undefined,
      aspect: job.aspect ?? "9:16",
      title: L.title, price_thb: L.price_thb, price_text: L.price_text,
      size_text: L.size_text, features: L.features, location: L.location,
      contact: L.contact, cta: L.cta,
    },
    options
  );
  return { ...results, generated: steps, auto: true };
}
