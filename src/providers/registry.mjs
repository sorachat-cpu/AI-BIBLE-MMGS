// Provider registry -- the engine-swap abstraction WF5 §7 and Policy §3.1(4) require.
//
// Engines must never name a vendor. They ask for a capability, the registry hands back
// whichever adapter the config selects:
//
//     VIDEO_ENGINE=kling|higgsfield|runway     (default: kling -- it has credit today)
//     IMAGE_ENGINE=kling|sdxl|higgsfield       (default: kling -- see note below)
//
// Switching back to Higgsfield once its credit is topped up is an env-var change, not a
// code change.
//
// CORRECTION TO WF5 §3.1: that table states "Kling ไม่ใช่ image generator ใช้แทนตรงนี้ไม่ได้"
// and routes 5.3 to SDXL. That premise is wrong -- Kling exposes /v1/images/generations and
// it is implemented here. It is only out of *image* credit (its resource packages cover
// video only), which is a top-up away rather than a new vendor account. Default is
// therefore kling; set IMAGE_ENGINE=sdxl to follow the doc's original routing.
import { KlingAdapter, KlingAdapterError } from "./kling-adapter.mjs";

export class ProviderNotConfiguredError extends Error {
  constructor(engine, capability, hint) {
    super(`Engine "${engine}" is not available for ${capability}. ${hint}`);
    this.code = "ERR_PROV_NOT_CONFIGURED";
  }
}

// Adapters not yet built. They fail loudly and name the exact blocker rather than
// pretending to work or silently falling through to a vendor the operator did not pick.
function stub(engine, capability, hint) {
  return {
    providerName: engine.toUpperCase(),
    async imageToVideo() { throw new ProviderNotConfiguredError(engine, capability, hint); },
    async generateImage() { throw new ProviderNotConfiguredError(engine, capability, hint); },
  };
}

function klingProvider(config) {
  const adapter = new KlingAdapter(config);
  return {
    providerName: adapter.providerName,
    imageToVideo: (payload) => adapter.call(payload),
    generateImage: (payload) => adapter.generateImage(payload),
  };
}

const VIDEO_ENGINES = {
  kling: klingProvider,
  higgsfield: () =>
    stub("higgsfield", "image-to-video", "ยังไม่ได้เขียน adapter และยังไม่ได้เติมเครดิต Higgsfield (ดู WF5 §3)"),
  runway: () =>
    stub("runway", "image-to-video", "ยังไม่ได้เขียน adapter ต้องมี RUNWAY_API_KEY"),
};

const IMAGE_ENGINES = {
  kling: klingProvider,
  sdxl: () =>
    stub("sdxl", "text-to-image", "ยังไม่ได้เขียน adapter ต้องมี REPLICATE_API_TOKEN หรือ SDXL_API_KEY"),
  higgsfield: () =>
    stub("higgsfield", "text-to-image", "ยังไม่ได้เขียน adapter และยังไม่ได้เติมเครดิต Higgsfield"),
};

function resolve(table, name, envVar, config) {
  const key = String(name || "").toLowerCase();
  const factory = table[key];
  if (!factory) {
    throw new ProviderNotConfiguredError(
      key || "(unset)",
      envVar,
      `รองรับเฉพาะ: ${Object.keys(table).join(", ")}`
    );
  }
  return factory(config);
}

export function getVideoEngine(config = {}) {
  return resolve(VIDEO_ENGINES, process.env.VIDEO_ENGINE ?? "kling", "VIDEO_ENGINE", config);
}

export function getImageEngine(config = {}) {
  return resolve(IMAGE_ENGINES, process.env.IMAGE_ENGINE ?? "kling", "IMAGE_ENGINE", config);
}

export function describeEngines() {
  return {
    video: { selected: process.env.VIDEO_ENGINE ?? "kling", available: Object.keys(VIDEO_ENGINES) },
    image: { selected: process.env.IMAGE_ENGINE ?? "kling", available: Object.keys(IMAGE_ENGINES) },
  };
}

export { KlingAdapterError };
