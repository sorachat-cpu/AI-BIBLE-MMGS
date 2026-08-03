// Property Engine (07_PROPERTY_ENGINE.md) -- raw broker text -> validated PROPERTY_OUT.
// Rules enforced here (see .claude/agents/property-engine.md for the full spec):
//   - No Hallucination: never invent data absent from the source text.
//   - Exact Matching: style_tag must be exactly one of the fixed enum values.
//   - Strip promo language / phone numbers / Line IDs before this record leaves the engine.
import Anthropic from "@anthropic-ai/sdk";
import { validateAgainstSchema } from "../lib/validate.mjs";

const STYLE_TAGS = ["MODERN_NORDIC", "MINIMALIST", "LUXURY_CLASSIC", "CONTEMPORARY", "LOFT"];

// TPL_PROP_001_v1 from 17_PROMPT_LIBRARY.md, verbatim.
const TPL_PROP_001_v1 = `You are a Thai real estate data extraction specialist.

Extract structured information from the following property listing text.
Return ONLY a valid JSON object. Do not add any explanation or commentary outside the JSON.

Required fields to extract:
- title: Clean property title. Remove all promotional language ("ด่วน", "ถูกมาก", "!!!"), phone numbers, and Line IDs.
- price_thb: Price as integer only. No commas. No currency symbols.
  Convert: "5ล้าน" -> 5000000 | "5.5M" -> 5500000 | "12.9ล้านบาท" -> 12900000
- style_tag: Must be EXACTLY one of: MODERN_NORDIC | MINIMALIST | LUXURY_CLASSIC | CONTEMPORARY | LOFT
- raw_address: The address exactly as written in the listing. Do not geocode or infer.
- highlight_features: Array of 3-5 key selling features. Rules for highlight_features:
  - No pricing information
  - No contact information
  - No promotional language
  - Keep factual and descriptive only

Critical rules:
- If price cannot be determined -> set price_thb to null
- If style cannot be determined -> set style_tag to "CONTEMPORARY"
- If address is missing -> set raw_address to null
- Do NOT invent data that is not present in the input text
- Do NOT include phone numbers or Line IDs anywhere in the output

Input text:
{{raw_input_text}}

Return valid JSON only. No markdown. No code block. No explanation.`;

export class PropertyEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function nextPropertyId() {
  // No DB wired up yet (Phase 1) -- placeholder sequence until Postgres exists per 05_DATABASE.md.
  const n = Math.floor(Math.random() * 90000) + 10000;
  return `PROP-TH-${n}`;
}

function stripCodeFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function runPropertyEngine(rawInputText, { anthropicApiKey } = {}) {
  if (!rawInputText || rawInputText.trim().length < 10) {
    throw new PropertyEngineError("ERR_PROP_INPUT", "raw_input_text missing or too short");
  }
  if (rawInputText.length > 5000) {
    throw new PropertyEngineError("ERR_PROP_INPUT", "raw_input_text exceeds 5000 characters");
  }

  const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new PropertyEngineError(
      "ERR_PROP_NO_API_KEY",
      "ANTHROPIC_API_KEY is not set -- see .env.example"
    );
  }

  const client = new Anthropic({ apiKey });
  const prompt = TPL_PROP_001_v1.replace("{{raw_input_text}}", rawInputText);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const textOut = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  let extracted;
  try {
    extracted = JSON.parse(stripCodeFence(textOut));
  } catch {
    throw new PropertyEngineError("ERR_PROP_PARSE", `LLM response was not valid JSON: ${textOut}`);
  }

  if (!extracted.title || typeof extracted.title !== "string" || !extracted.title.trim()) {
    throw new PropertyEngineError("ERR_PROP_VAL_01", "title is empty");
  }
  if (extracted.price_thb !== null && typeof extracted.price_thb !== "number") {
    throw new PropertyEngineError("ERR_PROP_VAL_02", "price_thb is not a number or null");
  }
  if (!STYLE_TAGS.includes(extracted.style_tag)) {
    extracted.style_tag = "CONTEMPORARY"; // Exact Matching rule -- never invent a new style label.
  }
  if (!Array.isArray(extracted.highlight_features)) {
    extracted.highlight_features = [];
  }

  const propertyOut = {
    property_id: nextPropertyId(),
    title: extracted.title.trim(),
    price_thb: extracted.price_thb,
    style_tag: extracted.style_tag,
    raw_address: extracted.raw_address ?? null,
    highlight_features: extracted.highlight_features.slice(0, 5),
  };

  const { valid, errors } = await validateAgainstSchema("property.schema.json", propertyOut);
  if (!valid) {
    throw new PropertyEngineError(
      "ERR_PROP_SCHEMA",
      `Output failed schema validation: ${JSON.stringify(errors)}`
    );
  }

  return propertyOut;
}
