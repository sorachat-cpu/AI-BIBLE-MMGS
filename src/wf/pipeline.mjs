// 3-WF pipeline finisher -- wf/WF1.md, wf/WF2.md, wf/WF3.md.
//
// The generative half of WF1 and WF2 is produced outside this repo (Google Flow), because
// Flow's Frames-to-Video takes a start AND end frame, which is what the spec's continuity
// rule needs. What Flow cannot guarantee is the part the whole chain depends on:
//
//   FINAL FRAME = NEXT FIRST FRAME
//
// A video model only ever *approximates* the end frame it was given -- verified repeatedly:
// the composition matches but the pixels are softer, hazier, slightly redrawn. Approximate
// is not good enough for a handoff, because WF2 then starts from a picture that is no longer
// the seller's actual land. So this module stops hoping and enforces it: after the generated
// motion plays, the EXACT source image is appended and held, per WF1.md's
// "FINAL 0.5-1.0 SEC / EXACT TARGET IMAGE / FREEZE / HOLD".
//
// Nothing here fades or dissolves -- by standing instruction, joins are cuts or camera moves.
// The freeze lands on a frame the model was already converging toward, so it reads as the
// picture settling into focus rather than as a cut.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, probeDuration, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { FPS } from "../lib/kenburns.mjs";
import { compositeWf1Overlays } from "../engines/storyboard.mjs";

// WF1.md: "FINAL 0.5-1.0 SEC / EXACT TARGET IMAGE".
const FREEZE_SECONDS = 0.8;

export class WfPipelineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WfPipelineError";
    this.code = code;
  }
}

/** Re-encode to one common shape so segments concatenate without re-timing surprises. */
async function normalise(input, out, { w, h }, extraVf = "") {
  await ffmpeg([
    "-i", input,
    "-vf",
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
      `setsar=1,fps=${FPS}${extraVf}`,
    "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-y", out,
  ]);
  return out;
}

/** A still held for `seconds`, encoded identically to the clips it will sit beside. */
async function stillSegment(image, out, dims, seconds) {
  await ffmpeg([
    "-loop", "1", "-t", String(seconds), "-i", image,
    "-vf",
      `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,` +
      `crop=${dims.w}:${dims.h},setsar=1,fps=${FPS}`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-y", out,
  ]);
  return out;
}

async function concatSegments(segments, out, tag) {
  const listFile = path.join(TEMP_DIR, `wfjoin_${tag}.txt`);
  await writeFile(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-y", out]);
  return out;
}

/** Accepts a local path or a URL and returns a local path. */
async function localise(src, fallbackName) {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) {
    const dest = path.join(TEMP_DIR, fallbackName);
    return downloadTo(src, dest);
  }
  return src;
}

/**
 * Finish WF1: the Flow clip + the location marker + the exact land image frozen on the end.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} input.clip        WF1 video from Flow (path or URL)
 * @param {string} input.land_image  the EXACT image that must be the final frame, and which
 *                                   WF2 will start from -- the same file, not a lookalike
 * @param {string} [input.aspect]
 * @param {boolean} [input.pin]      composite the WF1 SCENE 1 location marker (default true)
 * @param {number} [input.freeze_seconds]
 */
export async function finishWf1(input, options = {}) {
  const {
    property_id,
    clip,
    land_image,
    aspect = "9:16",
    pin = true,
    freeze_seconds = FREEZE_SECONDS,
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new WfPipelineError("ERR_WF_INPUT", "property_id missing or malformed");
  }
  if (!clip) throw new WfPipelineError("ERR_WF_INPUT", "ต้องมีคลิป WF1 จาก Flow");
  if (!land_image) {
    throw new WfPipelineError(
      "ERR_WF_INPUT",
      "ต้องมีรูปที่ดินจริง (EXACT TARGET IMAGE) เพื่อ freeze เป็นเฟรมสุดท้าย — WF1.md CRITICAL CONTINUITY RULE"
    );
  }

  const dims = ASPECTS[aspect];
  if (!dims) throw new WfPipelineError("ERR_WF_INPUT", `aspect ไม่รองรับ: ${aspect}`);
  await ensureDirs();
  const stamp = Date.now();

  const srcClip = await localise(clip, `wf1_src_${stamp}.mp4`);
  const landFile = await localise(land_image, `wf1_land_${stamp}.png`);

  // Marker first, on the motion only -- it has no business appearing over the frozen tail.
  let motion = srcClip;
  if (pin) {
    motion = path.join(TEMP_DIR, `wf1_pinned_${stamp}.mp4`);
    await compositeWf1Overlays(srcClip, motion, dims);
  }

  const segMotion = await normalise(motion, path.join(TEMP_DIR, `wf1_m_${stamp}.mp4`), dims);
  const segFreeze = await stillSegment(
    landFile, path.join(TEMP_DIR, `wf1_f_${stamp}.mp4`), dims, freeze_seconds
  );

  const out = path.join(OUTPUT_DIR, `${property_id}_WF1_${stamp}_${aspect.replace(":", "_")}.mp4`);
  await concatSegments([segMotion, segFreeze], out, `wf1_${stamp}`);

  // The handoff artefact. WF2 must start from THIS file.
  const finalFrame = path.join(OUTPUT_DIR, `${property_id}_WF1_finalframe_${stamp}.png`);
  await ffmpeg([
    "-i", landFile,
    "-vf", `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}`,
    "-y", finalFrame,
  ]);

  return {
    workflow: "WF1",
    property_id,
    file: out,
    video_url: `/output/${path.basename(out)}`,
    duration: (await probeDuration(out)) ?? 0,
    aspect,
    final_frame: finalFrame,
    final_frame_url: `/output/${path.basename(finalFrame)}`,
    // Stated explicitly because WF1.md's OUTPUT section requires it.
    final_frame_is_input_image: true,
    pin_composited: pin,
    freeze_seconds,
    next: "WF2 ต้องใช้ final_frame นี้เป็น FIRST FRAME",
  };
}

/**
 * Finish WF2: the Flow timelapse + the exact finished-house image frozen on the end.
 * Same contract as WF1 -- FINAL FRAME WF2 = FIRST FRAME WF3 (wf/WF2.md).
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} input.clip         WF2 timelapse from Flow
 * @param {string} input.house_image  the EXACT finished-house-at-night image
 */
export async function finishWf2(input, options = {}) {
  const {
    property_id,
    clip,
    house_image,
    aspect = "9:16",
    freeze_seconds = FREEZE_SECONDS,
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new WfPipelineError("ERR_WF_INPUT", "property_id missing or malformed");
  }
  if (!clip) throw new WfPipelineError("ERR_WF_INPUT", "ต้องมีคลิป WF2 จาก Flow");
  if (!house_image) {
    throw new WfPipelineError(
      "ERR_WF_INPUT",
      "ต้องมีภาพบ้านเสร็จตอนค่ำ เพื่อ freeze เป็นเฟรมสุดท้าย — FINAL FRAME WF2 = FIRST FRAME WF3"
    );
  }

  const dims = ASPECTS[aspect];
  if (!dims) throw new WfPipelineError("ERR_WF_INPUT", `aspect ไม่รองรับ: ${aspect}`);
  await ensureDirs();
  const stamp = Date.now();

  const srcClip = await localise(clip, `wf2_src_${stamp}.mp4`);
  const houseFile = await localise(house_image, `wf2_house_${stamp}.png`);

  const segMotion = await normalise(srcClip, path.join(TEMP_DIR, `wf2_m_${stamp}.mp4`), dims);
  const segFreeze = await stillSegment(
    houseFile, path.join(TEMP_DIR, `wf2_f_${stamp}.mp4`), dims, freeze_seconds
  );

  const out = path.join(OUTPUT_DIR, `${property_id}_WF2_${stamp}_${aspect.replace(":", "_")}.mp4`);
  await concatSegments([segMotion, segFreeze], out, `wf2_${stamp}`);

  const finalFrame = path.join(OUTPUT_DIR, `${property_id}_WF2_finalframe_${stamp}.png`);
  await ffmpeg([
    "-i", houseFile,
    "-vf", `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}`,
    "-y", finalFrame,
  ]);

  return {
    workflow: "WF2",
    property_id,
    file: out,
    video_url: `/output/${path.basename(out)}`,
    duration: (await probeDuration(out)) ?? 0,
    aspect,
    final_frame: finalFrame,
    final_frame_url: `/output/${path.basename(finalFrame)}`,
    freeze_seconds,
    // wf/WF2.md VISUAL DISCLAIMER + GLOBAL RULE 4.
    ai_visualisation: "บ้าน สวน และโรงรถ เป็นภาพจำลอง (Concept Visualization) ไม่ใช่สิ่งปลูกสร้างจริงบนที่ดิน",
    next: "WF3 ต้องใช้ final_frame นี้เป็น hero image / FIRST FRAME",
  };
}

/**
 * Join the three finished workflows into one film.
 *
 * Each handoff is already a shared frame -- WF1 ends frozen on the land photo and WF2 opens on
 * that same photo; WF2 ends frozen on the house and WF3 opens on it. So a plain concat lands
 * on identical pixels either side of the join, which is what "ห้ามใช้ Hard Cut ระหว่าง WF"
 * actually asks for: no visible jump. Nothing is crossfaded.
 */
export async function joinWorkflows(input, options = {}) {
  const { property_id, clips = [], aspect = "9:16" } = input ?? {};
  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new WfPipelineError("ERR_WF_INPUT", "property_id missing or malformed");
  }
  const usable = clips.filter(Boolean);
  if (usable.length < 2) {
    throw new WfPipelineError("ERR_WF_INPUT", "ต้องมีคลิปอย่างน้อย 2 ตัวถึงจะต่อได้");
  }
  const dims = ASPECTS[aspect];
  if (!dims) throw new WfPipelineError("ERR_WF_INPUT", `aspect ไม่รองรับ: ${aspect}`);

  await ensureDirs();
  const stamp = Date.now();
  const segs = [];
  for (const [i, c] of usable.entries()) {
    const local = await localise(c, `wfjoin_src_${stamp}_${i}.mp4`);
    segs.push(await normalise(local, path.join(TEMP_DIR, `wfjoin_${stamp}_${i}.mp4`), dims));
  }

  const out = path.join(OUTPUT_DIR, `${property_id}_FULL_${stamp}_${aspect.replace(":", "_")}.mp4`);
  await concatSegments(segs, out, `full_${stamp}`);
  return {
    property_id,
    file: out,
    video_url: `/output/${path.basename(out)}`,
    duration: (await probeDuration(out)) ?? 0,
    aspect,
    parts: usable.length,
  };
}

/**
 * Run whatever stages the caller has material for, then join them.
 *
 * Shared by the CLI and the web console so the two cannot drift: the order of the handoffs,
 * and which image each stage freezes on, is the spec's continuity rule and belongs in one
 * place. Every stage is optional -- supplying only a WF1 clip finishes WF1 alone, supplying
 * only a house image builds the advertisement alone.
 */
export async function runWfFinish(input, options = {}) {
  const {
    property_id,
    wf1_clip,
    wf2_clip,
    land_image,
    house_image,
    aspect = "9:16",
    pin = true,
    skip_wf3 = false,
    // WF3 advertisement copy -- confirmed listing data only (wf/WF3.md).
    title, price_thb, price_text, size_text, features = [], location, contact, cta,
  } = input ?? {};

  const results = {};
  const clips = [];

  if (wf1_clip) {
    results.wf1 = await finishWf1(
      { property_id, clip: wf1_clip, land_image, aspect, pin }, options
    );
    clips.push(results.wf1.file);
  }

  if (wf2_clip) {
    results.wf2 = await finishWf2(
      { property_id, clip: wf2_clip, house_image, aspect }, options
    );
    clips.push(results.wf2.file);
  }

  // WF3's hero is WF2's frozen final frame when there is one, so the advertisement opens on
  // exactly the picture the timelapse ended on.
  const hero = results.wf2?.final_frame ?? house_image;
  if (!skip_wf3 && hero) {
    const { runWf3Ad, buildWf3Caption } = await import("../engines/wf3-ad.mjs");
    results.wf3 = await runWf3Ad(
      {
        property_id, house_image_file: hero, aspect,
        title, price_thb, price_text, size_text, features, location, contact,
        ...(cta ? { cta } : {}),
      },
      options
    );
    clips.push(results.wf3.file);
    results.caption = buildWf3Caption({
      title, size_text, features, location, contact,
      price_text: results.wf3.data_used.price_text,
      cta: cta ?? "สนใจรายละเอียด / นัดชมบ้าน ทักแชตได้เลย",
    });
  }

  if (clips.length >= 2) {
    results.full = await joinWorkflows({ property_id, clips, aspect }, options);
  }

  if (!clips.length) {
    throw new WfPipelineError(
      "ERR_WF_INPUT",
      "ไม่มีอะไรให้ทำ — ต้องมีคลิป WF1, คลิป WF2, หรือภาพบ้านสำหรับ WF3 อย่างน้อยหนึ่งอย่าง"
    );
  }
  return results;
}
