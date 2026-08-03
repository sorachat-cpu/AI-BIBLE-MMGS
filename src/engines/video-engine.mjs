// Video Engine (11_VIDEO_ENGINE.md) -- still image -> short text-free B-roll clip.
//
// The load-bearing rule of this engine (03_SYSTEM_RULES.md Rule 1, "Absolute Media
// Neutrality"): nothing that can change -- price, phone, Line ID, branding -- may ever
// be burned into the video. If it were, a price typo would force a full regeneration at
// >10x the cost of recompositing in Render Engine.
import { getVideoEngine } from "../providers/registry.mjs";
import { getByCameraMotion, get as getTemplate } from "../lib/prompt-library.mjs";
import { sanitizeMediaPrompt, containsSensitiveData } from "../lib/sanitize.mjs";
import { validateAgainstSchema } from "../lib/validate.mjs";

const CAMERA_MOTIONS = ["PAN_RIGHT", "ZOOM_IN", "DRONE_REVEAL", "TILT_UP"];

export class VideoEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function clipId() {
  return `vid_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// Library-First Search (03_SYSTEM_RULES.md Rule 2) requires checking video_library
// before paying a provider. The table lives in Postgres, which is Phase 1 work and
// does not exist yet -- so this always misses. Known gap, not a design decision:
// every call currently costs money that a warm cache would have saved.
async function checkVideoLibrary() {
  return null;
}

// Kling wants raw base64 -- a browser FileReader hands us "data:image/jpeg;base64,AAA…",
// so strip the data-URI prefix before it ever reaches the provider.
function stripDataUri(value) {
  return typeof value === "string" ? value.replace(/^data:image\/[a-zA-Z+]+;base64,/, "") : value;
}

export async function runVideoEngine(input, options = {}) {
  const {
    property_id,
    image_url,
    image_base64,
    image_tail_url,
    image_tail_base64,
    template_id,
    camera_motion = "PAN_RIGHT",
    duration_seconds = 5,
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new VideoEngineError("ERR_VID_INPUT", "property_id missing or malformed");
  }

  // An uploaded file (base64) wins over a URL when both are supplied.
  const base64 = stripDataUri(image_base64);
  const image = base64 || image_url;
  if (!image) {
    throw new VideoEngineError("ERR_VID_INPUT", "Provide an uploaded image or an image_url");
  }
  if (!base64 && !/^https?:\/\//.test(image_url)) {
    throw new VideoEngineError("ERR_VID_INPUT", "image_url must be an http(s) URL reachable from the internet");
  }
  if (!CAMERA_MOTIONS.includes(camera_motion)) {
    throw new VideoEngineError(
      "ERR_VID_INPUT",
      `camera_motion must be one of ${CAMERA_MOTIONS.join(", ")} (schemas/video.schema.json)`
    );
  }
  if (duration_seconds < 3 || duration_seconds > 5) {
    throw new VideoEngineError("ERR_VID_INPUT", "duration_seconds must be between 3 and 5");
  }

  // An end frame turns the clip into a morph (empty plot -> finished house) rather
  // than a camera move over one still.
  const imageTail = stripDataUri(image_tail_base64) || image_tail_url;

  const cached = await checkVideoLibrary(property_id, camera_motion);
  if (cached) return cached;

  // An explicit template_id wins, so storyboard shots can request a specific look
  // (cosmic descent, construction reveal) instead of the default motion mapping.
  const template = template_id ? { template_id, ...getTemplate(template_id) } : getByCameraMotion(camera_motion);
  const prompt = sanitizeMediaPrompt(template.text);

  // Fail loudly rather than shipping a price or phone number into a paid render.
  if (containsSensitiveData(prompt)) {
    throw new VideoEngineError(
      "ERR_RULE_01",
      "TEXT_INJECTION_DETECTED -- prompt still contains price/contact data after sanitizing"
    );
  }

  // Vendor is chosen by config (VIDEO_ENGINE), never named here -- WF5 §7 requires the
  // engine be swappable without touching this file.
  const provider = getVideoEngine(options.providerConfig);
  let normalized;
  try {
    normalized = await provider.imageToVideo({
      image,
      image_tail: imageTail,
      prompt,
      camera_motion,
      duration_seconds,
    });
  } catch (err) {
    if (err.code) {
      // Per 11_VIDEO_ENGINE.md ERR_VID_01 the router should now fall back to the next
      // provider in the priority table. Only one video adapter exists so far, so the
      // failure propagates instead of silently degrading.
      throw new VideoEngineError(err.code, `${err.message} (no fallback provider implemented yet)`);
    }
    throw err;
  }

  const videoOut = {
    property_id,
    camera_config: { motion_type: camera_motion, pan_speed: 0.5 },
    b_roll_clips: [
      {
        clip_id: clipId(),
        video_url: normalized.result.video_url,
        duration_seconds: Math.min(5, Math.max(3, normalized.result.duration_seconds)),
        camera_motion,
      },
    ],
  };

  const { valid, errors } = await validateAgainstSchema("video.schema.json", videoOut);
  if (!valid) {
    throw new VideoEngineError("ERR_VID_SCHEMA", `Output failed schema validation: ${JSON.stringify(errors)}`);
  }

  return { ...videoOut, _cost_usd: normalized.cost_usd, _template_id: template.template_id };
}
