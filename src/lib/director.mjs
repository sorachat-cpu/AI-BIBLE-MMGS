// Creative Director -- the one-decision-per-property layer that was missing.
//
// Before this: every WF2 construction time-lapse used TPL_WF2_v1's hardcoded house (single
// -storey, earth-tone walls, wooden accents) regardless of the actual listing. A
// LUXURY_CLASSIC mansion and a MINIMALIST condo produced the identical build -- the pipeline
// swapped video vendors freely (src/providers/registry.mjs) but never adapted *what* it
// asked any of them to make. That is the gap that made this feel less "smart" than a
// creative-orchestration layer like fal Agent or Google Flow, which reason about the
// specific asset in front of them.
//
// This module asks Claude Haiku once per property to translate style_tag + real listing
// features into a WF2 style directive (TPL_WF2_v2's {{style_directive}}), and nothing else
// in the proven prompt skeleton -- continuity rule, time-lapse beats, negative list -- is
// touched. The caller (src/wf/prepare.mjs startWfJob) makes this decision exactly once and
// saves it on the job (src/wf/job.mjs), so continueWfJob and runWfAuto reuse the identical
// plan later rather than re-asking or silently drifting -- that persistence is the "context
// memory across steps" half of the request; this file is the "director" half.
//
// Degrades to a deterministic style_tag -> directive map when ANTHROPIC_API_KEY is missing
// or the call fails. Never throws -- a missing/failing Director must not block a video that
// would otherwise render fine on the proven default, matching every other engine's degraded-
// mode convention in this repo (see house-engine.mjs's fallback in wf5/steps.mjs).
import Anthropic from "@anthropic-ai/sdk";
import { fillTemplate } from "./prompt-library.mjs";

const STYLE_DIRECTIVES = {
  MODERN_NORDIC:
    "The frame rises as a single-storey Nordic-modern home: crisp white render walls with " +
    "light natural timber cladding accents, a low-pitched or flat roof, black-framed floor" +
    "-to-ceiling windows are fitted, and a minimal flush-timber front door takes shape.",
  MINIMALIST:
    "The frame rises as a single-storey minimalist home: a flat roof, smooth pale grey " +
    "render walls with no ornamentation, large plain glass sliding panels are fitted, and a " +
    "flush concealed front door takes shape with clean geometric massing throughout.",
  LUXURY_CLASSIC:
    "The frame rises as a two-storey luxury classic home: a symmetrical facade in light " +
    "stone cladding, a columned entrance portico takes shape, tall arched windows are " +
    "fitted, and a grand double front door is set beneath the portico.",
  CONTEMPORARY:
    "The frame rises as a single-storey contemporary home: mixed stone and timber cladding, " +
    "large glass sliding doors are fitted, a mono-pitch roof structure goes on, and clean " +
    "modern proportions take shape throughout.",
  LOFT:
    "The frame rises as a single-storey loft-style home: warm-toned exposed brick and board-" +
    "formed concrete walls, dark exposed steel-frame accents are fitted, oversized " +
    "industrial-style windows are set, and a minimal restrained front facade takes shape.",
};

export class DirectorError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fallbackPlan(property_id, style_tag) {
  return {
    property_id,
    style_tag: style_tag ?? "CONTEMPORARY",
    style_directive: STYLE_DIRECTIVES[style_tag] ?? STYLE_DIRECTIVES.CONTEMPORARY,
    source: "fallback",
  };
}

/**
 * One call per property. Callers should make this decision once (src/wf/prepare.mjs
 * startWfJob does) and persist the result on the job rather than calling this again per
 * step -- re-asking per step is what would let WF2's house drift from what WF3's copy
 * describes.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} [input.style_tag]  one of property.schema.json's STYLE_TAGS; CONTEMPORARY if absent
 * @param {string} [input.title]
 * @param {number} [input.price_thb]
 * @param {string} [input.size_text]
 * @param {string[]} [input.features]
 */
export async function planCreativeDirection(input, { anthropicApiKey } = {}) {
  const { property_id, style_tag, title, price_thb, size_text, features = [] } = input ?? {};
  const fallback = fallbackPlan(property_id, style_tag);

  const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const prompt = `You are directing a real-estate construction time-lapse video shot.

Given this Thai property listing, write ONE paragraph (55-90 words, present tense,
architectural-photography-direction style, in English) describing the specific house that
should rise on the plot during the time-lapse: its number of storeys, roofline, primary wall
material, window style, and one distinguishing exterior feature. Ground every choice in
style_tag; use features only to pick a believable distinguishing detail (e.g. a pool visible
in the yard, a two-car carport). Never mention price, contact details, or invent amenities
the features do not support.

style_tag: ${style_tag ?? "CONTEMPORARY"}
title: ${title ?? "(none)"}
price_thb: ${price_thb ?? "(unknown)"}
size_text: ${size_text ?? "(unknown)"}
features: ${features.length ? features.join(", ") : "(none)"}

Return ONLY the paragraph. No preamble, no markdown, no quotes, no bullet points.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text || text.length < 30) return { ...fallback, degraded: "empty/too-short response" };
    return { property_id, style_tag: style_tag ?? "CONTEMPORARY", style_directive: text, source: "director" };
  } catch (err) {
    // A Director outage must not block a video that renders fine on the style_tag default.
    return { ...fallback, degraded: err.message };
  }
}

/**
 * Turns a saved plan into the actual WF2 video prompt. TPL_WF2_v2 whenever a plan is
 * present (director-produced or fallback both fill the same placeholder); TPL_WF2_v1
 * verbatim only when there is no plan at all (older jobs saved before this existed).
 */
export function buildWf2Prompt(plan) {
  if (!plan?.style_directive) {
    return { template_id: "TPL_WF2_v1", text: fillTemplate("TPL_WF2_v1") };
  }
  return {
    template_id: "TPL_WF2_v2",
    text: fillTemplate("TPL_WF2_v2", { style_directive: plan.style_directive }),
  };
}
