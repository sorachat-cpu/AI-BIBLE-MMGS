// WF8b -- the verified-listing workflow's shared vocabulary and its two gates.
//
// See WF8b-verified-listing-video.md. The load-bearing idea of that spec is that a
// property video makes CLAIMS about something a person is about to spend millions of baht
// on, so anything the system cannot point at -- a field the seller filled in, or something
// visibly in the photograph -- must not be said at all.
//
// This file holds the closed enums and the checks. It deliberately contains no prompt
// text: the Kling prompt lives in prompt-library.mjs as TPL_VID_011_v1 (§15 rule 2), and
// the classification/script prompts live with the engine that calls the model.

/** WF8b §1. `unclear_or_not_for_video` is a real outcome, not a failure. */
export const PHOTO_CATEGORIES = [
  "entrance_or_frontage",
  "access_road",
  "wide_land_view",
  "land_detail",
  "existing_structure",
  "surrounding_view",
  "map_or_document",
  "unclear_or_not_for_video",
];

export const CATEGORY_LABELS_TH = {
  entrance_or_frontage: "ทางเข้า / หน้าที่ดิน",
  access_road: "ถนน / ทางเข้า",
  wide_land_view: "ภาพมุมกว้าง",
  land_detail: "รายละเอียดพื้นที่",
  existing_structure: "สิ่งปลูกสร้างที่มีอยู่",
  surrounding_view: "สภาพแวดล้อมโดยรอบ",
  map_or_document: "แผนที่ / เอกสาร",
  unclear_or_not_for_video: "ไม่เหมาะทำวิดีโอ",
};

/**
 * WF8b §3's original motion list -- the `preserve` style. Closed on purpose: every entry
 * describes a move a real estate videographer could physically make with the camera on
 * the actual plot, from roughly where the photo was taken. Nothing here requires the
 * model to invent geometry it was never shown.
 */
export const CAMERA_MOTIONS = [
  "slow centered dolly-in at eye level",
  "very slow pan from left to right with a subtle push-in",
  "smooth slow forward tracking movement along the existing visible road",
  "gentle slow pull-back, keeping the original perspective and boundaries unchanged",
  "stable cinematic hold with subtle natural environmental movement",
];

/**
 * The `cinematic` style, added 2026-08-23 at the user's request -- showier drone moves,
 * chosen by whether the source photo is aerial or from the ground.
 *
 * These are a DELIBERATE, USER-ACCEPTED relaxation of §3, not an oversight. Two of them
 * cannot be honest about a still photograph and the caller is told so before use:
 *
 *  - `orbit` swings the camera around the plot, so the far side -- which the photograph
 *    never saw -- is generated. That is invented land, in a video advertising real land.
 *  - the lighting words ("bright sunny day", "golden hour") override whatever weather was
 *    actually in frame, which advertises conditions the buyer will not necessarily find.
 *
 * `risk` is carried per entry so the UI and CLI can mark them rather than presenting all
 * five as equivalent. Boundary-drawing language is deliberately NOT included in any of
 * these: land boundaries are a legal claim, and a model-drawn line implying one is the
 * single most consequential thing this pipeline could get wrong.
 */
export const CINEMATIC_MOTIONS = {
  aerial: [
    {
      id: "orbit",
      label: "หมุนวนรอบที่ดิน 360°",
      text: "A slow, cinematic 360-degree drone orbit shot around the property. Smooth camera rotation revealing the surrounding landscape. Ultra-detailed, 4k.",
      risk: "หมุนรอบด้าน — AI ต้องสร้างด้านที่กล้องไม่เคยเห็นขึ้นมาเอง",
    },
    {
      id: "flythrough",
      label: "บินพุ่งไปข้างหน้า",
      text: "A gentle aerial drone fly-through moving forward over the plot of land. The camera tilts down slightly to show the topography, then tilts up to reveal the horizon. Professional real estate video.",
      risk: null,
    },
    {
      id: "jib",
      label: "บินสูงขึ้นเผยพาโนรามา",
      text: "The camera slowly rises straight up into the air from a low view of the land, revealing a panoramic view of the property and its surroundings. Majestic feel.",
      risk: null,
    },
  ],
  ground: [
    {
      id: "tracking",
      label: "เดินหน้าส่องพื้นที่",
      text: "A slow, smooth tracking shot gliding forward through the centre of the plot of land. Natural grass, warm afternoon sunlight, photorealistic.",
      risk: null,
    },
    {
      id: "pan",
      label: "กวาดซ้ายไปขวา",
      text: "A slow cinematic camera pan from left to right across the property. Showcasing the terrain, surrounding trees, and any visible access road. High quality.",
      risk: null,
    },
  ],
};

/** Which cinematic move suits a photo, given its viewpoint and category. */
export function cinematicMotionFor(viewpoint, category, requestedId) {
  const pool = CINEMATIC_MOTIONS[viewpoint === "aerial" ? "aerial" : "ground"];
  if (requestedId) {
    const hit = pool.find((m) => m.id === requestedId);
    if (hit) return hit;
  }
  // A road shot tracks along the road; a wide shot sweeps. Otherwise take the pool's
  // first non-risky entry so the showy-but-inventing orbit is never a silent default.
  if (category === "access_road") return pool.find((m) => m.id === "tracking") ?? pool.find((m) => !m.risk) ?? pool[0];
  if (category === "wide_land_view") return pool.find((m) => m.id === "jib" || m.id === "pan") ?? pool[0];
  return pool.find((m) => !m.risk) ?? pool[0];
}

/** Which move suits which kind of shot, when the classifier does not name one. */
const DEFAULT_MOTION_BY_CATEGORY = {
  entrance_or_frontage: CAMERA_MOTIONS[0],
  access_road: CAMERA_MOTIONS[2],
  wide_land_view: CAMERA_MOTIONS[1],
  land_detail: CAMERA_MOTIONS[0],
  existing_structure: CAMERA_MOTIONS[3],
  surrounding_view: CAMERA_MOTIONS[1],
  map_or_document: CAMERA_MOTIONS[4],
};

export function motionForCategory(category, requested) {
  if (requested && CAMERA_MOTIONS.includes(requested)) return requested;
  return DEFAULT_MOTION_BY_CATEGORY[category] ?? CAMERA_MOTIONS[4];
}

/** WF8b §2 running order: what a viewer needs to see, in the order they need it. */
const SELECTION_ORDER = [
  "entrance_or_frontage",
  "wide_land_view",
  "access_road",
  "land_detail",
  "existing_structure",
  "surrounding_view",
  "map_or_document",
];

export const MIN_CLIPS = 5;
export const MAX_CLIPS = 7;

export class VerifiedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerifiedError";
    this.code = code;
  }
}

/**
 * WF8b §2 -- pick 5-7 usable photos in the spec's running order.
 *
 * Photos classed `unclear_or_not_for_video` are dropped outright rather than used last:
 * the spec's reason for that class is that the picture could mislead, and a misleading
 * frame at the end of a reel misleads exactly as much as one at the start.
 *
 * @param {Array<{file, category, ...}>} classified
 * @returns {{ selected: Array, dropped: Array, warning: string|null }}
 */
export function selectPhotosForVideo(classified) {
  const usable = classified.filter((p) => p.category !== "unclear_or_not_for_video");
  const dropped = classified.filter((p) => p.category === "unclear_or_not_for_video");

  // One per category first, in the spec's running order, so the reel shows different
  // things before it shows two of the same thing.
  const selected = [];
  const taken = new Set();
  for (const category of SELECTION_ORDER) {
    if (selected.length >= MAX_CLIPS) break;
    const idx = usable.findIndex((p, i) => !taken.has(i) && p.category === category);
    if (idx === -1) continue;
    taken.add(idx);
    selected.push(usable[idx]);
  }
  // Then top up with whatever is left, still skipping the misleading ones.
  for (const [i, p] of usable.entries()) {
    if (selected.length >= MAX_CLIPS) break;
    if (taken.has(i)) continue;
    taken.add(i);
    selected.push(p);
  }

  // Close on the widest shot available -- §2 step 6 -- but only by reordering what was
  // already chosen, never by pulling in a photo that did not qualify.
  const wideIdx = selected.findIndex((p) => p.category === "wide_land_view");
  if (wideIdx > -1 && wideIdx !== selected.length - 1 && selected.length > 1) {
    selected.push(selected.splice(wideIdx, 1)[0]);
  }

  const warning = selected.length < MIN_CLIPS
    ? `มีรูปที่ใช้ได้แค่ ${selected.length} รูป (สเปกต้องการ ${MIN_CLIPS}-${MAX_CLIPS}) — คลิปจะสั้นกว่าปกติ`
    : null;

  return { selected, dropped, warning };
}

/**
 * The claims WF8b forbids the system from making on its own. Each entry is matched
 * against generated Thai script text; a hit means the model asserted something it was
 * not given, which is a hard stop rather than a warning.
 *
 * These are deliberately about UNVERIFIABLE INFRASTRUCTURE AND LEGAL STATUS, not about
 * wording. A phrase only lands here if believing it could cost the buyer money.
 */
const FORBIDDEN_CLAIM_PATTERNS = [
  { re: /ติดถนน(สาธารณะ|หลวง)/, why: "อ้างว่าติดถนนสาธารณะ" },
  { re: /ทางเข้า(ถูกกฎหมาย|สาธารณะ)/, why: "อ้างสถานะทางเข้าตามกฎหมาย" },
  { re: /ภาระจำยอม/, why: "อ้างเรื่องภาระจำยอม" },
  // "พร้อม" carries two unrelated senses in Thai and only one of them is a claim:
  // "ไฟฟ้าพร้อมใช้งาน" (ready for use) asserts a utility connection, while
  // "เสาไฟฟ้าพร้อมสายไฟ" (a pole *together with* wires) is a plain description of what is
  // in frame. Matching the bare word rejected legitimate visual description, so the sense
  // has to be pinned by what follows it -- and a pole is excluded as a subject outright,
  // since seeing one says nothing about whether the plot is connected.
  {
    re: /(?<!เสา)(ไฟฟ้า|น้ำประปา|ประปา|อินเทอร์เน็ต)\s*(เข้าถึง|ถึงที่|มีแล้ว|พร้อมใช้|พร้อมแล้ว|ต่อแล้ว)/,
    why: "อ้างเรื่องสาธารณูปโภค",
  },
  { re: /(ไม่|ไม่เคย)\s*(มี)?น้ำท่วม/, why: "อ้างว่าไม่มีน้ำท่วม" },
  { re: /(โฉนด|นส\.?\s*3|น\.ส\.\s*3)(พร้อม|ครบ|ถูกต้อง|สมบูรณ์)/, why: "อ้างสถานะโฉนด" },
  { re: /(สร้างบ้าน|ปลูกสร้าง|ก่อสร้าง)ได้/, why: "อ้างว่าขออนุญาตก่อสร้างได้" },
  { re: /ผังเมือง(สี)?/, why: "อ้างเรื่องผังเมือง" },
  { re: /เหมาะ(สำหรับการ)?(ลงทุน|ทำกำไร)/, why: "อ้างว่าเหมาะลงทุน" },
  { re: /(กำไร|ผลตอบแทน)(ดี|งาม|สูง)/, why: "อ้างผลตอบแทน" },
  { re: /(ถูกที่สุด|ราคาถูกมาก|คุ้มที่สุด|สวยที่สุด|ดีที่สุด)/, why: "คำโฆษณาเกินจริง" },
  { re: /ห่างจาก.{0,20}(กิโล|กม\.|นาที)/, why: "อ้างระยะทาง/เวลาเดินทาง" },
];

/**
 * WF8b's pre-post checklist, as a function rather than a habit.
 *
 * Returns the violations instead of throwing so a caller can show all of them at once --
 * fixing one claim at a time through five rejections is how people start ignoring the
 * check entirely.
 *
 * **What this gate is actually protecting against.** Not the seller making claims about
 * their own land -- that is their listing and their liability. It is the SYSTEM inventing
 * claims that appear in neither the seller's own words nor the photographs: the model
 * reasoning "there is a power pole in frame, so the plot must have power" and saying so.
 * Anything the seller wrote is therefore exempt, whether it arrived as a structured
 * `verified_details` field or as free text in the caption.
 *
 * @param {string[]} lines       the generated script
 * @param {object} verified      verified_details as supplied
 * @param {string} [caption]     the seller's own caption text, when it is trusted
 * @returns {Array<{line, why}>}
 */
export function findForbiddenClaims(lines, verified = {}, caption = "") {
  const violations = [];
  const sellerText = [
    verified.location, verified.land_size, verified.asking_price,
    ...(verified.confirmed_highlights ?? []),
    ...(verified.intended_use ?? []),
    caption,
  ].filter(Boolean).join(" ");

  for (const line of lines) {
    for (const { re, why } of FORBIDDEN_CLAIM_PATTERNS) {
      if (!re.test(line)) continue;
      if (re.test(sellerText)) continue; // the seller asserted it themselves
      violations.push({ line, why });
    }
  }
  return violations;
}

/**
 * WF8b §4 -- which fields may be spoken at all. Anything absent is simply not mentioned;
 * the spec is explicit that a missing field is deleted, never replaced with a guess.
 */
export function verifiedFactsFor(verified = {}) {
  const facts = [];
  if (verified.location?.trim()) facts.push({ key: "location", value: verified.location.trim() });
  if (verified.land_size?.trim()) facts.push({ key: "land_size", value: verified.land_size.trim() });
  if (verified.asking_price?.trim()) facts.push({ key: "asking_price", value: verified.asking_price.trim() });
  for (const h of verified.confirmed_highlights ?? []) {
    if (String(h).trim()) facts.push({ key: "confirmed_highlight", value: String(h).trim() });
  }
  for (const u of verified.intended_use ?? []) {
    if (String(u).trim()) facts.push({ key: "intended_use", value: String(u).trim() });
  }
  return facts;
}
