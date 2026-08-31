// Construction Engine -- "ที่ดินเปล่าวันนี้ กลายเป็นบ้านได้แบบนี้".
//
// Shows the same parcel progressing from bare ground to a finished house. Each stage is a
// generated still; the movement between them is a crossfade, not generated video.
//
// That choice is the whole reason this scene is affordable. The original WF5 path made a
// $0.16 image-to-video clip between every pair of stages -- five stages came to $0.87,
// nearly three times the $0.30 per-video cap, and the code carried its own
// `exceeds_budget_cap` flag admitting it. Dissolving between stills costs nothing and
// reads better anyway: a slow dissolve on a fixed camera is how time-lapse construction
// actually looks, whereas an image-to-video model invents camera moves and rebuilds the
// scene slightly differently each time, so the house drifts between stages.
//
//   5 stills  ~$0.07   fits the cap, one API per stage
//   5 clips    $0.80   over cap, and the plot changes shape as it builds
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, probeDuration, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { pushIn, FPS } from "../lib/kenburns.mjs";
import { getImageEngine } from "../providers/registry.mjs";
import { CONSTRUCTION_STAGES, buildStagePrompt } from "../wf5/construction.mjs";
import { sanitizeMediaPrompt, containsSensitiveData } from "../lib/sanitize.mjs";

const STAGE_SECONDS = 3.2;
const CROSSFADE_SECONDS = 0.9; // long enough to read as "time passing", not as a cut

export class ConstructionSceneError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConstructionSceneError";
    this.code = code;
  }
}

/** Rough per-image price, used for the pre-flight so nobody starts a run blind. */
export const IMAGE_COST_USD = 0.014;

export function estimateSceneCost(stageCount) {
  const total = stageCount * IMAGE_COST_USD;
  return {
    stages: stageCount,
    image_cost_usd: Number(total.toFixed(4)),
    video_cost_usd: 0, // crossfades are local
    total_usd: Number(total.toFixed(4)),
    exceeds_budget_cap: total > 0.3,
  };
}

/**
 * Real output length of the finished scene, before a single frame is generated -- callers
 * that need to budget total film length against a narration track (story-engine.mjs) have
 * to know this up front, since construction runs after the one stretchable scene has
 * already been sized. Matches xfadeGraph()'s math exactly: N stages minus (N-1) overlapping
 * transitions, each transition eating CROSSFADE_SECONDS out of the timeline once.
 */
export function estimateSceneDuration(stageCount) {
  return Number((stageCount * STAGE_SECONDS - Math.max(0, stageCount - 1) * CROSSFADE_SECONDS).toFixed(2));
}

/**
 * Chain N clips with dissolves.
 *
 * xfade takes exactly two inputs, so a sequence has to be folded pairwise. Each offset is
 * measured on the *accumulated* timeline, and every completed transition has already eaten
 * `CROSSFADE_SECONDS` of it -- forgetting that subtraction is what makes the later stages
 * appear to jump.
 */
function xfadeGraph(count, secondsEach, fade) {
  const parts = [];
  let label = "0:v";
  let elapsed = secondsEach;
  for (let i = 1; i < count; i++) {
    const out = `x${i}`;
    const offset = (elapsed - fade).toFixed(3);
    parts.push(`[${label}][${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset}[${out}]`);
    label = out;
    elapsed += secondsEach - fade;
  }
  return { filter: parts.join(";"), label, total: elapsed };
}

function stripDataUri(v) {
  return typeof v === "string" ? v.replace(/^data:image\/[a-zA-Z+]+;base64,/, "") : v;
}

/** Writes a caller-supplied image (data URI/base64, or a URL) to a local file. */
async function saveSuppliedImage({ base64, url }, filePath) {
  if (base64) {
    await writeFile(filePath, Buffer.from(stripDataUri(base64), "base64"));
  } else {
    await downloadTo(url, filePath);
  }
}

/**
 * Build the construction scene.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} [input.landImageBase64]  the real plot photo, used as the reference so
 *                                          every stage stays on the same piece of land
 * @param {string} [input.landImageUrl]     same, when only a URL is on hand
 * @param {string} [input.styleTag]
 * @param {string} [input.details]  free text folded into every stage prompt (e.g. a
 *                                  listing's own highlight_features) -- see
 *                                  buildStagePrompt() in wf5/construction.mjs
 * @param {string} [input.aspect]
 * @param {number[]} [input.stageIds]  which of the five stages to render
 * @param {number} [input.imageFidelity]  how strongly each stage sticks to landImage*
 *                                        (0.6 default; a caller wanting less background
 *                                        drift between stages can raise this toward 1.0 --
 *                                        it is a continuous influence weight, not a hard
 *                                        constraint, so it reduces drift, never guarantees
 *                                        a pixel-identical background)
 * @param {"crossfade"|"cut"} [input.join]  "crossfade" (default) dissolves between stages
 *                                          like today; "cut" hard-concats them instead --
 *                                          for a caller that wants zero fades
 * @param {string} [input.houseImageBase64] caller-supplied finished-house photo -- used
 *                                          directly as the "complete" stage instead of
 *                                          generating one (stages 1-4 still generate
 *                                          normally either way)
 * @param {string} [input.houseImageUrl]    same, when only a URL is on hand
 * @param {boolean} [input.dryRun]     price it without generating anything
 */
export async function runConstructionScene(input, options = {}) {
  const {
    property_id,
    landImageBase64,
    landImageUrl,
    styleTag = "CONTEMPORARY",
    details,
    aspect = "9:16",
    stageIds,
    imageFidelity = 0.6,
    join = "crossfade",
    houseImageBase64,
    houseImageUrl,
    dryRun = false,
  } = input ?? {};

  const dims = ASPECTS[aspect];
  if (!dims) throw new ConstructionSceneError("ERR_CONS_INPUT", `aspect ไม่รองรับ: ${aspect}`);

  const stages = stageIds?.length
    ? CONSTRUCTION_STAGES.filter((s) => stageIds.includes(s.id))
    : CONSTRUCTION_STAGES;
  if (!stages.length) throw new ConstructionSceneError("ERR_CONS_INPUT", "ไม่มีขั้นตอนให้สร้าง");

  const estimate = estimateSceneCost(stages.length);
  if (dryRun) return { dry_run: true, stages: stages.map((s) => s.label), ...estimate };

  const engine = getImageEngine();
  await ensureDirs();
  const stamp = Date.now();

  // ---- one still per stage ----
  const hasHouseOverride = Boolean(houseImageBase64 || houseImageUrl);
  const frames = [];
  let cost = 0;
  for (const [i, stage] of stages.entries()) {
    const useSuppliedHouse = hasHouseOverride && stage.key === "complete";
    const img = path.join(TEMP_DIR, `cons_${stamp}_${i}.png`);
    if (useSuppliedHouse) {
      // Caller already has a finished-house photo -- use it directly for the "complete"
      // stage instead of spending another generation call on it.
      await saveSuppliedImage({ base64: houseImageBase64, url: houseImageUrl }, img);
    } else {
      let url;
      try {
        // buildStagePrompt() is the same builder wf5/construction.mjs uses for its own
        // image-to-video path (17_PROMPT_LIBRARY.md §15 rule 2: one shared builder, never
        // an inline string per call site) -- it also carries the full negative + safety
        // keyword set, not a hand-picked subset. Sanitised and screened the same way every
        // prompt in the pipeline is before it reaches a paid provider (§15 rule 7).
        const prompt = sanitizeMediaPrompt(buildStagePrompt(stage, styleTag, details));
        if (containsSensitiveData(prompt)) {
          throw new ConstructionSceneError("ERR_CONS_RULE_01", `TEXT_INJECTION_DETECTED ในขั้น "${stage.label}"`);
        }
        const res = await engine.generateImage({
          prompt,
          // Anchoring every stage to the seller's own photo is what keeps it recognisably
          // the same parcel; without it each stage is a different piece of land. This is
          // an influence weight, not a hard constraint -- it reduces background drift
          // between stages, it does not guarantee a pixel-identical background.
          image: stripDataUri(landImageBase64) || landImageUrl,
          imageFidelity,
          aspectRatio: aspect,
        });
        url = res.image_url;
        cost += res.cost_usd ?? IMAGE_COST_USD;
      } catch (err) {
        throw new ConstructionSceneError(
          "ERR_CONS_IMAGE",
          `สร้างภาพขั้น "${stage.label}" ไม่สำเร็จ: ${err.message}`
        );
      }
      await downloadTo(url, img);
    }
    const seg = path.join(TEMP_DIR, `consseg_${stamp}_${i}.mp4`);
    // Alternate the drift so consecutive stages do not feel like one long push.
    await pushIn(img, seg, dims, STAGE_SECONDS, i % 2 ? { from: 1.08, to: 1.0 } : { from: 1.0, to: 1.08 });
    frames.push({ stage: stage.label, seg });
  }

  // ---- join stages: dissolve (default) or a hard cut with zero fades ----
  const out = path.join(OUTPUT_DIR, `construction_${stamp}.mp4`);
  if (frames.length === 1) {
    await ffmpeg(["-i", frames[0].seg, "-c", "copy", out]);
  } else if (join === "cut") {
    const listFile = path.join(TEMP_DIR, `cons_${stamp}.txt`);
    await writeFile(listFile, frames.map((f) => `file '${f.seg.replace(/'/g, "'\\''")}'`).join("\n"));
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);
  } else {
    const { filter, label } = xfadeGraph(frames.length, STAGE_SECONDS, CROSSFADE_SECONDS);
    const args = [];
    for (const f of frames) args.push("-i", f.seg);
    args.push(
      "-filter_complex", filter,
      "-map", `[${label}]`,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS),
      out
    );
    await ffmpeg(args, { timeoutMs: 600_000 });
  }

  return {
    file: out,
    duration: (await probeDuration(out)) ?? 0,
    aspect,
    stages: frames.map((f) => f.stage),
    cost_usd: Number(cost.toFixed(4)),
  };
}
