// House Engine (10_HOUSE_ENGINE.md) -- generate a photorealistic house image.
//
// DEVIATION FROM SPEC, deliberate: the spec lists FLUX_1_DEV / MIDJOURNEY_V7 / SDXL as
// the image providers. None of those accounts exist here, but Kling's own
// /v1/images/generations endpoint does the same job on credit we already have, so it is
// wired as the provider. schemas/house.schema.json restricts generation_metadata.provider
// to the four spec'd names, so KLING_IMAGE is added there rather than faked as "FLUX_1_DEV".
//
// Image-to-image is the important mode for this project: passing the real land photo as
// a reference makes the generated house sit on the customer's actual plot instead of an
// invented one.
import { getImageEngine } from "../providers/registry.mjs";
import { fillTemplate } from "../lib/prompt-library.mjs";
import { sanitizeMediaPrompt, containsSensitiveData } from "../lib/sanitize.mjs";
import { validateAgainstSchema } from "../lib/validate.mjs";

const STYLE_DESCRIPTIONS = {
  MODERN_NORDIC: "2-story modern Nordic single family, light grey render facade with pine wood cladding, flat roof",
  MINIMALIST: "2-story minimalist single family, clean white rendered walls, flat roof, uninterrupted geometry",
  LUXURY_CLASSIC: "2-story luxury classical single family, symmetrical facade, tall columns, pitched tile roof",
  CONTEMPORARY: "2-story contemporary single family, mixed stone and render facade, large glazing, low-pitch roof",
  LOFT: "2-story loft-style single family, exposed brick and black steel frame, industrial glazing, flat roof",
};

export class HouseEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function stripDataUri(value) {
  return typeof value === "string" ? value.replace(/^data:image\/[a-zA-Z+]+;base64,/, "") : value;
}

// Library-First Search (03_SYSTEM_RULES.md Rule 2). The house_library table is Phase 1
// work, so this always misses and every call costs money a warm cache would have saved.
async function checkHouseLibrary() {
  return null;
}

export async function runHouseEngine(input, options = {}) {
  const {
    property_id,
    style_tag = "CONTEMPORARY",
    land_image_base64,
    land_image_url,
    image_fidelity = 0.5,
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new HouseEngineError("ERR_HOU_INPUT", "property_id missing or malformed");
  }
  if (!STYLE_DESCRIPTIONS[style_tag]) {
    throw new HouseEngineError(
      "ERR_HOU_INPUT",
      `style_tag must be one of ${Object.keys(STYLE_DESCRIPTIONS).join(", ")}`
    );
  }

  const cached = await checkHouseLibrary(property_id, style_tag);
  if (cached) return cached;

  const prompt = sanitizeMediaPrompt(
    fillTemplate("TPL_HOUSE_001_v1", { style_description: STYLE_DESCRIPTIONS[style_tag] })
  );
  if (containsSensitiveData(prompt)) {
    throw new HouseEngineError(
      "ERR_RULE_01",
      "TEXT_INJECTION_DETECTED -- prompt still contains price/contact data after sanitizing"
    );
  }

  const reference = stripDataUri(land_image_base64) || land_image_url;

  // Vendor chosen by config (IMAGE_ENGINE) -- see src/providers/registry.mjs.
  const provider = getImageEngine(options.providerConfig);
  let generated;
  try {
    generated = await provider.generateImage({
      prompt,
      image: reference,
      imageFidelity: image_fidelity,
    });
  } catch (err) {
    if (err.code) {
      // ERR_HOU_01 says fall back to a backup image provider. Only one image adapter is
      // implemented, so this surfaces instead of degrading silently.
      throw new HouseEngineError(err.code, `${err.message} (no backup image provider configured)`);
    }
    throw err;
  }

  const houseOut = {
    property_id,
    house_image_url: generated.image_url,
    source_type: "AI_GENERATED",
    style_tag,
    generation_metadata: {
      provider: "KLING_IMAGE",
      cost_usd: generated.cost_usd,
      prompt,
    },
  };

  const { valid, errors } = await validateAgainstSchema("house.schema.json", houseOut);
  if (!valid) {
    throw new HouseEngineError("ERR_HOU_SCHEMA", `Output failed schema validation: ${JSON.stringify(errors)}`);
  }
  return houseOut;
}
