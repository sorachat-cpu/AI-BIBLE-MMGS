// sanitizeMediaPrompt -- required by 16_PROVIDER_INTERFACE.md Claude Rule #3 and
// 17_PROMPT_LIBRARY.md Claude Rule #7: every prompt sent to an Image/Video provider
// must pass through this first. Backstops the "Absolute Media Neutrality" guardrail
// (03_SYSTEM_RULES.md Rule 1) so price/contact data can never reach a media model.
// Matches any run of 4+ digits even when broken up by spaces, dots, or hyphens --
// "12500000", "081-234-5678" and "081 234 5678" all match as a single unit. The
// naive /\d{4,}/ misses separated phone numbers and leaves fragments like "081-234-"
// behind, which is exactly the leak this guardrail exists to prevent.
const DIGIT_RUN = /\d(?:[\s.\-]?\d){3,}/g;

// Decimal numbers ("12.9", "5.5") are prices in this domain -- land sizes are whole
// numbers. Stripped separately because the spec's 4+ digit rule alone lets them through
// once the surrounding "ล้านบาท" is removed.
const DECIMAL = /\d+\.\d+/g;

const STRIP_PATTERNS = [
  DIGIT_RUN,                                   // prices and phone numbers, separated or not
  DECIMAL,                                     // decimal prices left behind by DIGIT_RUN
  /ราคา|บาท|ล้าน|THB|USD|\$|฿/gi,              // price words / currency symbols
  /\+?66[\s.\-]?\d(?:[\s.\-]?\d){7,}/g,        // Thai mobile, international form
  /line|ไลน์|@[\w.]+/gi,                        // Line IDs and @handles
  /โทร|tel|phone|contact|ติดต่อ/gi,             // contact-intent words
  /https?:\/\/\S+/gi,                          // URLs
];

export function sanitizeMediaPrompt(prompt) {
  if (typeof prompt !== "string") return "";
  let clean = prompt;
  for (const pattern of STRIP_PATTERNS) clean = clean.replace(pattern, " ");
  return clean.replace(/\s+/g, " ").trim();
}

// Returns true when the prompt still carries anything that must never reach a media
// provider. Used as an assertion after sanitizing, so a regex gap fails loudly
// instead of silently shipping a price into a video.
export function containsSensitiveData(prompt) {
  if (!prompt) return false;
  return new RegExp(DIGIT_RUN.source).test(prompt) || /ราคา|บาท|ล้าน|THB|฿/i.test(prompt);
}
