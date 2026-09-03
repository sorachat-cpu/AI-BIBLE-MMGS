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

// WF2 stage definitions, per WF-REALESTATE-3WF-SPEC.md "WF2 SCENES".
// Stage 0 is the customer's own photo (= FINAL FRAME WF1) and is never generated.
//
// The spec asks for the progression to read as a real time-lapse, not an instant AI
// transformation, which is why the middle is broken into this many steps: site prep and
// roof used to be missing entirely, so the sequence jumped bare ground -> foundation and
// walls -> finished, which is exactly the "โผล่ขึ้นมา" the spec forbids.
export const CONSTRUCTION_STAGES = [
  {
    id: 1,
    key: "site_prep",
    label: "เตรียมพื้นที่",
    prompt:
      "site preparation, ground cleared and levelled, foundation footprint marked out " +
      "with string lines and stakes, bare graded earth, no structure yet",
  },
  {
    id: 2,
    key: "foundation",
    label: "ฐานราก / ตอม่อ",
    prompt:
      "concrete pile foundation poured, footings and stub columns cast, exposed rebar, " +
      "ground floor slab forming, dirt ground around it",
  },
  {
    id: 3,
    key: "structure",
    label: "โครงสร้างเสา-คาน",
    prompt:
      "concrete column and beam frame standing, floor slabs cast, no walls yet, " +
      "exposed steel reinforcement, structural skeleton only",
  },
  {
    id: 4,
    key: "roof",
    label: "โครงหลังคา + หลังคา",
    prompt:
      "roof truss frame erected over the structural frame, roof sheeting and tiles going on, " +
      "eaves formed, still no walls, scaffolding visible",
  },
  {
    id: 5,
    key: "walls",
    label: "ผนัง + ประตูหน้าต่าง",
    prompt:
      "brick and block walls built between the columns, window and door openings framed and " +
      "glazed, facade taking shape, exterior render and paint being applied",
  },
  {
    id: 6,
    key: "landscape",
    label: "งานภายนอก + Landscape",
    prompt:
      "exterior finished and painted, driveway and walkways paved, lawn laid, garden trees " +
      "and shrubs planted, parking area formed, fencing complete",
  },
  {
    id: 7,
    key: "complete",
    label: "บ้านเสร็จสมบูรณ์",
    prompt:
      "completed finished house with mature landscaping, clean and fully built, " +
      "professional real estate photography, warm natural daylight",
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
 *
 * @param {object} stage
 * @param {string} styleTag  closed enum (STYLE_WORDS) -- falls back to "contemporary" and
 *                            warns rather than failing, since a typo'd tag shouldn't abort
 *                            a whole render, but silently swallowing it hides the mismatch.
 * @param {string} [details]  free text describing what the caller actually wants in frame
 *                            (e.g. a listing's own highlight_features) -- without this the
 *                            builder only ever had the 5 fixed stage strings below, so a
 *                            property's own selling points never reached the image model.
 */
export function buildStagePrompt(stage, styleTag, details) {
  const style = STYLE_WORDS[styleTag];
  if (styleTag && !style) {
    console.warn(`[construction] unknown style_tag "${styleTag}" -- falling back to "contemporary"`);
  }
  // WF-REALESTATE-3WF-SPEC.md "CRITICAL RULE — PRESERVE LAND": the house is built ONTO the
  // seller's actual plot. The land itself -- its shape, the road, the hills behind it, the
  // significant trees, the ground level -- must survive every stage unchanged, and the
  // camera must not wander off the framing the first frame established.
  const base =
    `same plot of land as the original photo, identical camera angle, identical composition, ` +
    `identical background, keep the existing terrain, road, hills, skyline and major trees ` +
    `exactly as they are, only the building changes, ${style ?? "contemporary"} house, ` +
    `photorealistic, real estate marketing photo`;
  const detailClause = details && String(details).trim() ? `, featuring ${String(details).trim()}` : "";
  return `${base}${detailClause}, ${stage.prompt}. ${NEGATIVE_KEYWORDS}, ${SAFETY_KEYWORDS}.`;
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
 * @param {string} [input.details]  free text folded into every stage prompt, see
 *                                  buildStagePrompt()'s own docstring for why this exists
 * @param {boolean} [input.dry_run]  cost only, generate nothing
 * @param {boolean} [input.accept_over_budget]  proceed even though the run exceeds the
 *                                  $0.30-per-video ceiling in 03_SYSTEM_RULES.md rule 4
 */
export async function generateConstructionSequence(input, options = {}) {
  const {
    property_id,
    style_tag = "CONTEMPORARY",
    land_image_base64,
    land_image_url,
    stages = CONSTRUCTION_STAGES.map((s) => s.id),
    details,
    dry_run = false,
    accept_over_budget = false,
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

  // 03_SYSTEM_RULES.md rule 4 / ERR_RULE_02: stop rather than spend past the per-video
  // ceiling. The estimate was already being computed and then ignored, so a plain
  // POST /api/construction spent whatever the default stage list happened to cost -- and
  // when that list grew from five stages to seven it silently went from $0.87 to $1.22.
  // Refusing by default puts the decision back with the caller, who can still opt in.
  if (estimate.exceeds_budget_cap && !accept_over_budget) {
    throw new ConstructionError(
      "ERR_RULE_02",
      `BUDGET_OVERRUN: ${selected.length} สเตจ = $${estimate.total_usd} เกินเพดาน $0.30 ต่อวิดีโอ — ` +
        "ลดจำนวน stage, ใช้ construction-engine.mjs (ภาพนิ่ง ~$0.10) หรือส่ง accept_over_budget: true ถ้าตั้งใจจ่าย"
    );
  }

  const reference = stripDataUri(land_image_base64) || land_image_url;
  const imageEngine = getImageEngine(options.providerConfig);
  const steps = [];
  const frames = [{ id: 0, label: "ที่ดินต้นฉบับ", base64: land_image_base64, url: land_image_url }];

  // ---- 1) still image per stage ----
  for (const stage of selected) {
    const prompt = sanitizeMediaPrompt(buildStagePrompt(stage, style_tag, details));
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
