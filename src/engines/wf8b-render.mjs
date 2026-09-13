// WF8b §3 + §5 -- turn the selected stills into clips, then join them with crossfades.
//
// One photo in, one 5s clip out, every time. The spec is explicit that several photos
// must never be handed to the video model together and asked for "a scene": doing that
// lets it interpolate a continuous space between two views that may be of different
// parts of the plot, which fabricates land.
//
// TWO MOTION STYLES, and the difference is editorial rather than technical:
//
//   preserve  (§3, default) -- moves the camera only in ways it could have moved from
//             where the photograph was taken. Weather, boundaries and everything else
//             stay as shot. Nothing off-frame is invented.
//   cinematic (added 2026-08-23 at the user's request) -- drone orbits, jib rises,
//             flythroughs, with lighting language. Showier, and two of its moves cannot
//             be honest about a still: see CINEMATIC_MOTIONS in wf8b/verified.mjs. The
//             caller is told which clips carry that risk rather than being left to
//             discover it in the output.
//
// Nothing here decides between the two. The style arrives as an argument because it is a
// judgement about how a listing is advertised, which belongs to the seller.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  ffmpeg, downloadTo, probeDuration, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { getVideoEngine } from "../providers/registry.mjs";
import { fillTemplate } from "../lib/prompt-library.mjs";
import { sanitizeMediaPrompt, containsSensitiveData } from "../lib/sanitize.mjs";
import { cinematicMotionFor } from "../wf8b/verified.mjs";

const CLIP_SECONDS = 5;      // §3 asks for 4-6s; Kling bills 5s as a unit
const CROSSFADE_SECONDS = 0.3; // §5: "transition แบบ dissolve หรือ fade 0.3 วินาที"
const CLIP_COST_USD = 0.16;

export class Wf8bRenderError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "Wf8bRenderError";
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * Build the per-photo prompt.
 *
 * `preserve` goes through TPL_VID_011_v1 in the prompt library, so the preservation
 * wording has one definition (17_PROMPT_LIBRARY.md §15 rule 2). `cinematic` uses the
 * motion text the user supplied verbatim -- rewriting it would defeat the point of them
 * having specified it -- plus the one clause that stays non-negotiable in both styles:
 * no text or watermark burned into the frame, which is 03_SYSTEM_RULES.md Rule 1 and not
 * a stylistic preference.
 */
export function buildClipPrompt(photo, style = "preserve") {
  if (style === "cinematic") {
    const motion = cinematicMotionFor(photo.viewpoint, photo.category, photo.cinematic_id);
    return {
      prompt: `${motion.text} No text, no captions, no logo, no watermark, no subtitles.`,
      motion_id: motion.id,
      motion_label: motion.label,
      risk: motion.risk,
    };
  }
  return {
    prompt: fillTemplate("TPL_VID_011_v1", { camera_motion: photo.camera_motion }),
    motion_id: "preserve",
    motion_label: photo.camera_motion,
    risk: null,
  };
}

/**
 * Price and describe a run without generating anything.
 *
 * Separate from the render on purpose: at $0.16 a clip a six-photo reel is ~$1, which is
 * worth showing someone before it is spent rather than after.
 */
export function planClips(selected = [], style = "preserve") {
  const clips = selected.map((photo, i) => {
    const { prompt, motion_id, motion_label, risk } = buildClipPrompt(photo, style);
    return {
      index: i + 1,
      name: photo.name,
      category: photo.category,
      viewpoint: photo.viewpoint ?? "ground",
      motion_id,
      motion_label,
      risk,
      prompt,
      seconds: CLIP_SECONDS,
    };
  });
  return {
    style,
    clips,
    // N clips overlapping by CROSSFADE_SECONDS at each of the N-1 joins.
    duration_seconds: Number(
      (clips.length * CLIP_SECONDS - Math.max(0, clips.length - 1) * CROSSFADE_SECONDS).toFixed(2)
    ),
    cost_usd: Number((clips.length * CLIP_COST_USD).toFixed(4)),
    risky: clips.filter((c) => c.risk),
  };
}

/**
 * Chain clips with dissolves.
 *
 * xfade takes exactly two inputs, so the sequence folds pairwise, and each offset is on
 * the ACCUMULATED timeline where every completed transition has already eaten
 * CROSSFADE_SECONDS. Forgetting that subtraction is what makes later clips appear to jump
 * -- the same arithmetic as construction-engine.mjs's xfadeGraph().
 */
function xfadeGraph(count, secondsEach, fade) {
  const parts = [];
  let label = "0:v";
  let elapsed = secondsEach;
  for (let i = 1; i < count; i++) {
    const out = `x${i}`;
    parts.push(
      `[${label}][${i}:v]xfade=transition=fade:duration=${fade}:offset=${(elapsed - fade).toFixed(3)}[${out}]`
    );
    label = out;
    elapsed += secondsEach - fade;
  }
  return { filter: parts.join(";"), label };
}

/**
 * WF8b §3 -- generate one clip per selected photo and join them.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {Array}  input.selected     classifier rows, each with a local `file`
 * @param {"preserve"|"cinematic"} [input.style]
 * @param {string} [input.aspect]
 * @param {(msg: object) => void} [options.onProgress]
 */
export async function renderWf8bClips(input, options = {}) {
  const { property_id, selected = [], style = "preserve", aspect = "9:16" } = input ?? {};
  if (!property_id) throw new Wf8bRenderError("ERR_W8R_INPUT", "ต้องมี property_id");
  if (!selected.length) throw new Wf8bRenderError("ERR_W8R_INPUT", "ยังไม่ได้เลือกรูป");
  const dims = ASPECTS[aspect];
  if (!dims) throw new Wf8bRenderError("ERR_W8R_INPUT", `aspect ไม่รองรับ: ${aspect}`);

  const plan = planClips(selected, style);
  const provider = getVideoEngine(options.providerConfig);

  // Prove the video pool can serve a request BEFORE generating anything. Kling bills
  // image and video credit from separate pools, and a run that dies on clip 4 of 6 has
  // already paid for three -- this exact ordering wasted money on the construction engine
  // twice before it was guarded there.
  await ensureDirs();
  const stamp = Date.now();
  const built = [];
  let spent = 0;
  let billedUnits = 0;
  let billedCash = 0;
  let billedCurrency = null;

  for (const [i, photo] of selected.entries()) {
    const step = plan.clips[i];
    options.onProgress?.({ stage: "clip", index: i + 1, total: selected.length, motion: step.motion_label });

    const prompt = sanitizeMediaPrompt(step.prompt);
    if (containsSensitiveData(prompt)) {
      throw new Wf8bRenderError("ERR_W8R_RULE_01", `TEXT_INJECTION_DETECTED ในคลิปที่ ${i + 1}`);
    }

    let result;
    try {
      const { readFile } = await import("node:fs/promises");
      result = await provider.imageToVideo({
        image: (await readFile(photo.file)).toString("base64"),
        prompt,
        camera_motion: "ZOOM_IN", // v2 models take motion from the prompt; see kling-adapter
        duration_seconds: CLIP_SECONDS,
      });
    } catch (err) {
      if (/balance not enough/i.test(err.message)) {
        throw new Wf8bRenderError(
          "ERR_W8R_CREDIT",
          `เครดิต Kling Video API หมด (สร้างไปแล้ว ${built.length} คลิป $${spent.toFixed(2)})\n` +
            "   Kling แยกกระเป๋า Image API กับ Video API -- ต้องเติมที่ Video API โดยเฉพาะ",
          { built: built.length, spent }
        );
      }
      throw new Wf8bRenderError("ERR_W8R_CLIP", `สร้างคลิปที่ ${i + 1} ไม่สำเร็จ: ${err.message}`);
    }
    spent += result.cost_usd ?? CLIP_COST_USD;
    // Kling reports the real deduction per task. Collect it so the run can end with what
    // was actually charged rather than a per-clip constant that nobody has verified --
    // "units" and "cash" are different currencies and are kept apart.
    if (result.billing) {
      billedUnits += result.billing.units ?? 0;
      billedCash += result.billing.cash ?? 0;
      billedCurrency = result.billing.currency ?? billedCurrency;
      options.onProgress?.({ stage: "billed", index: i + 1, billing: result.billing });
    }

    const raw = path.join(TEMP_DIR, `wf8b_${stamp}_${i}_raw.mp4`);
    await downloadTo(result.result.video_url, raw);

    // Normalise before joining: clips can vary in size and framerate, and the xfade
    // filter needs matching geometry or the join distorts rather than failing loudly.
    const norm = path.join(TEMP_DIR, `wf8b_${stamp}_${i}.mp4`);
    await ffmpeg([
      "-i", raw,
      "-vf", `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,` +
             `pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`,
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", norm,
    ]);
    built.push({ ...step, file: norm, video_url: result.result.video_url });
  }

  // ---- join with dissolves ------------------------------------------------
  options.onProgress?.({ stage: "join", total: built.length });
  const out = path.join(OUTPUT_DIR, `${property_id}_wf8b_${style}_${stamp}_${aspect.replace(":", "_")}.mp4`);

  if (built.length === 1) {
    await ffmpeg(["-i", built[0].file, "-c", "copy", out]);
  } else {
    const { filter, label } = xfadeGraph(built.length, CLIP_SECONDS, CROSSFADE_SECONDS);
    const args = [];
    for (const b of built) args.push("-i", b.file);
    args.push(
      "-filter_complex", filter,
      "-map", `[${label}]`,
      "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-r", "30",
      "-movflags", "+faststart", out
    );
    await ffmpeg(args, { timeoutMs: 900_000 });
  }

  // Measure the file that landed rather than trusting the plan's arithmetic.
  const duration = (await probeDuration(out)) ?? plan.duration_seconds;

  const summary = path.join(OUTPUT_DIR, `${property_id}_wf8b_${stamp}_plan.json`);
  await writeFile(summary, JSON.stringify({ style, clips: built.map(({ file, ...c }) => c) }, null, 2));

  return {
    file: out,
    plan_file: summary,
    style,
    aspect,
    clips: built.map(({ file, ...c }) => c),
    duration_seconds: Number(duration.toFixed(2)),
    cost_usd: Number(spent.toFixed(4)),
    // What Kling actually deducted, when it told us. Null means the API returned no
    // billing rows and `cost_usd` above is still only the built-in estimate.
    billed: billedUnits || billedCash
      ? { units: billedUnits || null, cash: billedCash || null, currency: billedCurrency }
      : null,
    cost_is_estimate: !(billedUnits || billedCash),
    risky: plan.risky,
  };
}
