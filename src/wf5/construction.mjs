// WF5 5.4 Construction Simulation, rebuilt per WF5-fix §1.
//
// The old approach handed one prompt to the video model ("empty plot becomes finished
// house") and the model skipped straight to the finished building -- no foundation, no
// frame, no walls. The fix is to stop asking the video model to invent the middle:
// generate a still for each construction stage first, then let the video model only
// animate BETWEEN two known frames. Each clip is a short, well-defined transition.
//
// Camera consistency across stages comes from passing the original land photo as the
// image reference on every stage (WF5-fix §5.4.2's warning about jumpy angles).
//
// COST WARNING, and it is a real conflict with the spec:
// a full 5-stage run costs 5 images + 5 transition clips. At Kling's rates that is
// roughly 5 x $0.014 + 5 x $0.16 = about $0.87, which is ~3x the $0.30-per-video hard
// ceiling in 03_SYSTEM_RULES.md. Callers must opt in via `stages`, and the estimate is
// returned up front so the Orchestrator can refuse before spending anything.
import { getImageEngine } from "../providers/registry.mjs";
import { runVideoEngine } from "../engines/video-engine.mjs";
import { sanitizeMediaPrompt, containsSensitiveData } from "../lib/sanitize.mjs";

// Stage definitions copied from WF5-fix §5.4.1/§5.4.2. Stage 0 is the customer's own
// photo and is never generated.
export const CONSTRUCTION_STAGES = [
  {
    id: 1,
    key: "foundation",
    label: "ตอกเสาเข็ม / ฐานราก",
    prompt:
      "construction site, concrete pile foundation just poured, excavator on site, " +
      "exposed rebar, dirt ground, overcast site photo",
  },
  {
    id: 2,
    key: "structure",
    label: "โครงสร้างเสา-คาน",
    prompt:
      "concrete column and beam structure, no walls yet, exposed steel reinforcement, " +
      "construction in progress",
  },
  {
    id: 3,
    key: "walls",
    label: "ผนัง + หลังคา",
    prompt: "brick walls being built, roof frame installed, unpainted, scaffolding visible",
  },
  {
    id: 4,
    key: "finishing",
    label: "ตกแต่งภายนอก",
    prompt: "exterior painting finished, driveway paved, landscaping in progress, nearly complete",
  },
  {
    id: 5,
    key: "complete",
    label: "บ้านเสร็จสมบูรณ์",
    prompt:
      "completed house, painted, landscaped, golden hour lighting, " +
      "professional real estate photography",
  },
];

const STYLE_WORDS = {
  MODERN_NORDIC: "modern Nordic",
  MINIMALIST: "minimalist",
  LUXURY_CLASSIC: "luxury classical",
  CONTEMPORARY: "contemporary",
  LOFT: "loft-style",
};

const IMAGE_COST = 0.014;
const CLIP_COST = 0.16;

export class ConstructionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Base context is prepended to every stage so the plot and camera angle stay put. */
// Global Prompt Rules, 17_PROMPT_LIBRARY.md §4. Every image/video prompt in the system
// must carry these three blocks -- this is the one place construction stages assembled
// their own partial copy instead of the canonical set, which is how "excavator on site"
// (stage 1's own wording) went out without "no construction workers" to block a person
// being drawn operating it.
const NEGATIVE_KEYWORDS =
  "no text, no watermark, no logo, no price tag, no phone number, no signage, " +
  "no subtitle, no caption overlay, no brand name, no UI elements, no writing, no numbers";
const SAFETY_KEYWORDS = "no people, no vehicles, no animals, no construction workers";

/**
 * Per-stage image prompt. Exported so construction-engine.mjs (the crossfade-based scene
 * builder) uses the exact same wording as this file's own image-to-video path rather than
 * assembling a second, drifting copy -- 17_PROMPT_LIBRARY.md §15 rule 2 forbids prompts
 * being inlined anywhere outside a single shared builder.
 */
export function buildStagePrompt(stage, styleTag) {
  const style = STYLE_WORDS[styleTag] ?? "contemporary";
  const base =
    `same plot of land, same camera angle as original photo, ${style} house, ` +
    `photorealistic, real estate marketing photo`;
  return `${base}, ${stage.prompt}. ${NEGATIVE_KEYWORDS}, ${SAFETY_KEYWORDS}.`;
}

export function estimateConstructionCost(stageCount) {
  const images = stageCount * IMAGE_COST;
  const clips = stageCount * CLIP_COST; // stage 0->1, 1->2, ... N-1->N
  return {
    stages: stageCount,
    image_cost_usd: Number(images.toFixed(4)),
    video_cost_usd: Number(clips.toFixed(4)),
    total_usd: Number((images + clips).toFixed(4)),
    exceeds_budget_cap: images + clips > 0.3,
  };
}

function stripDataUri(v) {
  return typeof v === "string" ? v.replace(/^data:image\/[a-zA-Z+]+;base64,/, "") : v;
}

/**
 * Builds the staged construction sequence.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} input.style_tag
 * @param {string} [input.land_image_base64] / [input.land_image_url]  stage 0
 * @param {number[]} [input.stages]  which stage ids to generate, default all five
 * @param {boolean} [input.dry_run]  cost only, generate nothing
 */
export async function generateConstructionSequence(input, options = {}) {
  const {
    property_id,
    style_tag = "CONTEMPORARY",
    land_image_base64,
    land_image_url,
    stages = [1, 2, 3, 4, 5],
    dry_run = false,
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new ConstructionError("ERR_CON_INPUT", "property_id missing or malformed");
  }
  if (!land_image_base64 && !land_image_url) {
    throw new ConstructionError("ERR_CON_INPUT", "ต้องมีรูปที่ดินจริงเป็น stage 0 (WF5 ห้ามใช้ภาพ stock)");
  }

  const selected = CONSTRUCTION_STAGES.filter((s) => stages.includes(s.id));
  if (!selected.length) throw new ConstructionError("ERR_CON_INPUT", "ต้องเลือกอย่างน้อยหนึ่ง stage");

  const estimate = estimateConstructionCost(selected.length);
  if (dry_run) return { property_id, estimate, stages: selected.map((s) => ({ id: s.id, label: s.label })) };

  const reference = stripDataUri(land_image_base64) || land_image_url;
  const imageEngine = getImageEngine(options.providerConfig);
  const steps = [];
  const frames = [{ id: 0, label: "ที่ดินต้นฉบับ", base64: land_image_base64, url: land_image_url }];

  // ---- 1) still image per stage ----
  for (const stage of selected) {
    const prompt = sanitizeMediaPrompt(buildStagePrompt(stage, style_tag));
    if (containsSensitiveData(prompt)) {
      throw new ConstructionError("ERR_RULE_01", `TEXT_INJECTION_DETECTED ใน stage ${stage.id}`);
    }
    try {
      const img = await imageEngine.generateImage({
        prompt,
        image: reference,      // keeps the plot and camera angle consistent
        imageFidelity: 0.55,
      });
      frames.push({ id: stage.id, label: stage.label, url: img.image_url });
      steps.push({ stage: `5.4.1 stage ${stage.id}`, status: "ok", detail: stage.label, cost_usd: img.cost_usd });
    } catch (err) {
      steps.push({ stage: `5.4.1 stage ${stage.id}`, status: "failed", detail: `${stage.label}: ${err.message}` });
    }
  }

  if (frames.length < 2) {
    throw new ConstructionError(
      "ERR_CON_NO_STAGES",
      `สร้างภาพ stage ไม่สำเร็จเลย — ${steps.filter((s) => s.status === "failed")[0]?.detail ?? "ไม่ทราบสาเหตุ"}`
    );
  }

  // ---- 2) animate between consecutive stages ----
  const clips = [];
  for (let i = 0; i < frames.length - 1; i++) {
    const from = frames[i];
    const to = frames[i + 1];
    try {
      const video = await runVideoEngine(
        {
          property_id,
          image_base64: from.base64,
          image_url: from.base64 ? undefined : from.url,
          image_tail_url: to.url,
          template_id: "TPL_VID_008_v1",
          camera_motion: "DRONE_REVEAL",
          duration_seconds: 5,
        },
        options
      );
      clips.push({
        shot: `construction_${from.id}_${to.id}`,
        label: `${from.label} → ${to.label}`,
        ...video.b_roll_clips[0],
      });
      steps.push({ stage: `5.4.2 ${from.id}→${to.id}`, status: "ok", detail: `${from.label} → ${to.label}`, cost_usd: CLIP_COST });
    } catch (err) {
      steps.push({ stage: `5.4.2 ${from.id}→${to.id}`, status: "failed", detail: `[${err.code}] ${err.message}` });
    }
  }

  if (!clips.length) {
    throw new ConstructionError("ERR_CON_NO_CLIPS", "ต่อภาพ stage เป็นวิดีโอไม่สำเร็จเลย");
  }

  return {
    property_id,
    frames: frames.map((f) => ({ id: f.id, label: f.label, url: f.url ?? null })),
    clips,
    steps,
    estimate,
    actual_cost_usd: Number(steps.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0).toFixed(4)),
  };
}
