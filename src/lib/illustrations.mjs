// Line-art illustrations for carousel slides.
//
// Drawn here rather than fetched or generated, for three reasons that all matter more
// than they sound:
//
//  1. Consistency. Six topics x seven slides is 42 images. Anything sourced per-image
//     drifts in style; these share one stroke width and one palette hook, so the deck
//     reads as one deck.
//  2. Subject accuracy. The subjects are Thai land documents, zoning colours and parcel
//     shapes. Image models render Thai officialdom badly and invent details that would be
//     read as fact on a page that sells land.
//  3. Cost. They re-render for free, forever, at any size.
//
// The seal here is a deliberately simplified spread-wing mark, not a reproduction of the
// official Garuda emblem: it has to read as "the seal on the deed" at 200px on a phone,
// and it should not be mistakable for the real state emblem.
//
// Every drawing is authored in a 0..100 box and scaled by the caller, so positions in the
// templates never have to change when a drawing is swapped.

/**
 * @param {object} c  colours: { line, fill, soft, warn }
 * @returns {Record<string, (c: object) => string>} inner SVG for a 100x100 viewBox
 */
const ART = {
  /** Title deed: sheet, text ruling, and the coloured seal that identifies its type. */
  deed: (c) => `
    <rect x="20" y="8" width="60" height="84" rx="5" fill="${c.soft}" stroke="${c.line}" stroke-width="3.5"/>
    <circle cx="50" cy="34" r="14" fill="none" stroke="${c.seal ?? c.line}" stroke-width="3"/>
    <path d="M38 34 Q50 24 62 34 Q52 31 50 46 Q48 31 38 34 Z" fill="${c.seal ?? c.line}"/>
    <path d="M32 60 H68 M32 71 H68 M32 82 H56" stroke="${c.line}" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>`,

  /** A surveyed parcel: closed boundary with corner pegs. */
  plot: (c) => `
    <path d="M14 34 L54 14 L88 38 L70 84 L24 78 Z" fill="${c.soft}" stroke="${c.line}"
          stroke-width="3.5" stroke-linejoin="round"/>
    <g fill="${c.line}">
      <circle cx="14" cy="34" r="5"/><circle cx="54" cy="14" r="5"/><circle cx="88" cy="38" r="5"/>
      <circle cx="70" cy="84" r="5"/><circle cx="24" cy="78" r="5"/>
    </g>`,

  /** Parcel with no road frontage -- the shape of the landlocked problem. */
  blocked: (c) => `
    <rect x="8" y="14" width="34" height="34" rx="4" fill="none" stroke="${c.line}" stroke-width="3" opacity="0.4"/>
    <rect x="58" y="14" width="34" height="34" rx="4" fill="none" stroke="${c.line}" stroke-width="3" opacity="0.4"/>
    <rect x="8" y="56" width="34" height="32" rx="4" fill="none" stroke="${c.line}" stroke-width="3" opacity="0.4"/>
    <rect x="58" y="56" width="34" height="32" rx="4" fill="none" stroke="${c.line}" stroke-width="3" opacity="0.4"/>
    <rect x="34" y="36" width="32" height="30" rx="4" fill="${c.soft}" stroke="${c.warn ?? c.line}" stroke-width="4"/>
    <path d="M40 44 L60 58 M60 44 L40 58" stroke="${c.warn ?? c.line}" stroke-width="4" stroke-linecap="round"/>`,

  /** Road frontage. */
  road: (c) => `
    <path d="M26 92 L40 8" stroke="${c.line}" stroke-width="4" stroke-linecap="round"/>
    <path d="M78 92 L60 8" stroke="${c.line}" stroke-width="4" stroke-linecap="round"/>
    <path d="M52 84 V72 M52 60 V48 M52 36 V24" stroke="${c.line}" stroke-width="4"
          stroke-linecap="round" opacity="0.5"/>`,

  /** Water: canal or flood risk. */
  water: (c) => `
    <path d="M8 36 Q28 22 50 36 T92 36" fill="none" stroke="${c.line}" stroke-width="4" stroke-linecap="round"/>
    <path d="M8 56 Q28 42 50 56 T92 56" fill="none" stroke="${c.line}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <path d="M8 76 Q28 62 50 76 T92 76" fill="none" stroke="${c.line}" stroke-width="4" stroke-linecap="round" opacity="0.45"/>`,

  /** Location / access. */
  pin: (c) => `
    <path d="M50 92 C50 92 78 62 78 42 A28 28 0 1 0 22 42 C22 62 50 92 50 92 Z"
          fill="${c.soft}" stroke="${c.line}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="50" cy="41" r="11" fill="none" stroke="${c.line}" stroke-width="3.5"/>`,

  /** Money: price, fees, transfer costs. */
  money: (c) => `
    <rect x="10" y="26" width="80" height="48" rx="6" fill="${c.soft}" stroke="${c.line}" stroke-width="3.5"/>
    <circle cx="50" cy="50" r="13" fill="none" stroke="${c.line}" stroke-width="3.5"/>
    <path d="M50 41 V59 M45 46 H55 M45 54 H55" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/>
    <path d="M20 38 V62 M80 38 V62" stroke="${c.line}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`,

  /** Dates and waiting periods. */
  calendar: (c) => `
    <rect x="14" y="20" width="72" height="70" rx="7" fill="${c.soft}" stroke="${c.line}" stroke-width="3.5"/>
    <path d="M14 40 H86" stroke="${c.line}" stroke-width="3.5"/>
    <path d="M34 10 V26 M66 10 V26" stroke="${c.line}" stroke-width="4.5" stroke-linecap="round"/>
    <g fill="${c.line}" opacity="0.55">
      <rect x="28" y="52" width="10" height="10" rx="2.5"/>
      <rect x="45" y="52" width="10" height="10" rx="2.5"/>
      <rect x="62" y="52" width="10" height="10" rx="2.5"/>
      <rect x="28" y="69" width="10" height="10" rx="2.5"/>
    </g>
    <rect x="45" y="69" width="10" height="10" rx="2.5" fill="${c.warn ?? c.line}"/>`,

  /** Risk, scams, things to refuse. */
  warning: (c) => `
    <path d="M50 12 L92 84 H8 Z" fill="${c.soft}" stroke="${c.warn ?? c.line}"
          stroke-width="4" stroke-linejoin="round"/>
    <path d="M50 40 V60" stroke="${c.warn ?? c.line}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="50" cy="72" r="4" fill="${c.warn ?? c.line}"/>`,

  /** Survey and measurement. */
  ruler: (c) => `
    <rect x="6" y="38" width="88" height="26" rx="5" fill="${c.soft}" stroke="${c.line}"
          stroke-width="3.5" transform="rotate(-18 50 51)"/>
    <g stroke="${c.line}" stroke-width="3" stroke-linecap="round" transform="rotate(-18 50 51)">
      <path d="M20 38 V50"/><path d="M35 38 V46"/><path d="M50 38 V50"/>
      <path d="M65 38 V46"/><path d="M80 38 V50"/>
    </g>`,

  /** Earthworks: filling a plot. */
  truck: (c) => `
    <path d="M10 44 L44 44 L52 24 L16 24 Z" fill="${c.soft}" stroke="${c.line}"
          stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M8 52 H62 L74 40 H86 L92 52 V66 H8 Z" fill="none" stroke="${c.line}"
          stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="28" cy="72" r="9" fill="none" stroke="${c.line}" stroke-width="3.5"/>
    <circle cx="74" cy="72" r="9" fill="none" stroke="${c.line}" stroke-width="3.5"/>`,

  /** City plan colour zones. */
  zone: (c) => `
    <rect x="10" y="14" width="36" height="34" rx="5" fill="${c.line}" opacity="0.75"/>
    <rect x="54" y="14" width="36" height="34" rx="5" fill="${c.warn ?? c.line}" opacity="0.75"/>
    <rect x="10" y="56" width="36" height="32" rx="5" fill="${c.line}" opacity="0.35"/>
    <rect x="54" y="56" width="36" height="32" rx="5" fill="${c.line}" opacity="0.55"/>`,

  /** Utilities: power, meter, supply to the plot. */
  power: (c) => `
    <path d="M54 6 L26 54 H48 L44 94 L74 44 H52 Z" fill="${c.soft}" stroke="${c.line}"
          stroke-width="3.5" stroke-linejoin="round"/>`,

  /** Generic checklist, used when nothing more specific matches. */
  check: (c) => `
    <rect x="16" y="10" width="68" height="80" rx="7" fill="${c.soft}" stroke="${c.line}" stroke-width="3.5"/>
    <path d="M30 34 l7 7 l14 -14" fill="none" stroke="${c.line}" stroke-width="4.5"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M30 60 l7 7 l14 -14" fill="none" stroke="${c.line}" stroke-width="4.5"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M60 38 H72 M60 64 H72" stroke="${c.line}" stroke-width="3.5"
          stroke-linecap="round" opacity="0.5"/>`,
};

export const ART_NAMES = Object.keys(ART);

// Matched against the slide's own words, longest-specific first. Authors get illustrated
// slides without annotating six topic files by hand, and a topic that wants something
// specific can still set `art` explicitly on the point.
const KEYWORDS = [
  ["blocked", ["ตาบอด", "ไม่มีทางเข้า", "ทางออก", "ล้อมรอบ"]],
  ["truck", ["ถมที่", "ถมดิน", "คิวดิน", "รถดิน", "ปรับพื้นที่"]],
  ["power", ["ไฟฟ้า", "มิเตอร์", "เสาไฟ", "การไฟฟ้า"]],
  ["zone", ["ผังเมือง", "สีผัง", "โซน", "สร้างอะไรได้", "สีเหลือง", "สีส้ม", "สีแดง",
            "สีเขียว", "สีม่วง", "สีน้ำเงิน", "สีขาว"]],
  ["money", ["ราคา", "ค่าโอน", "ค่าธรรมเนียม", "ภาษี", "มัดจำ", "เงิน", "จำนอง", "บาท"]],
  ["calendar", ["วัน", "ประกาศ 30", "ระยะเวลา", "นัด", "กำหนด"]],
  ["ruler", ["รังวัด", "วัดที่", "ขอบเขต", "ระวาง", "เนื้อที่", "ตารางวา", "ไร่"]],
  ["road", ["ถนน", "ทางเข้า", "ทางออก", "ทางจำเป็น", "ทางภาระจำยอม", "หน้ากว้าง", "ติดถนน"]],
  ["water", ["น้ำ", "คลอง", "ท่วม", "ชลประทาน", "ประปา"]],
  ["warning", ["ระวัง", "เสี่ยง", "หลอก", "ไม่ใช่เอกสารสิทธิ์", "ซื้อขายไม่ได้", "ความเสี่ยง"]],
  ["deed", ["โฉนด", "น.ส.", "ส.ป.ก", "ภ.บ.ท", "ครุฑ", "เอกสารสิทธิ์", "กรรมสิทธิ์"]],
  ["pin", ["ทำเล", "ที่ตั้ง", "ใกล้", "เดินทาง", "แผนที่"]],
];

/** Seal colours named in the copy, so the deed drawing matches what the slide says. */
const SEAL_COLOURS = [
  ["แดง", "#c0392b"],
  ["เขียว", "#2f7d4f"],
  ["ดำ", "#2c2c2c"],
  ["น้ำเงิน", "#1f5fa8"],
];

/**
 * Pick a drawing from whatever the slide says, unless the author named one.
 *
 * Fields are searched in order of how much they say about the subject, not merged into
 * one blob. A slide headed "โฉนด" whose body happens to mention จำนอง is about deeds, not
 * about money, and a single flat search returns whichever keyword sits higher in the
 * list -- which is how the first version put a banknote on the title-deed slide.
 */
export function chooseArt(point = {}) {
  if (point.art && ART[point.art]) return point.art;

  const fields = [
    [point.heading].flat().filter(Boolean).join(" "),
    String(point.note ?? ""),
    [point.lines].flat().filter(Boolean).join(" "),
  ];

  for (const text of fields) {
    if (!text) continue;
    for (const [name, words] of KEYWORDS) {
      if (words.some((w) => text.includes(w))) return name;
    }
  }
  return "check";
}

function sealFor(point = {}) {
  const text = [point.note, point.heading].flat().filter(Boolean).join(" ");
  if (!text.includes("ครุฑ")) return null;
  return SEAL_COLOURS.find(([word]) => text.includes(word))?.[1] ?? null;
}

/**
 * Render one illustration as a positioned SVG group.
 *
 * @param {string} name    key in ART
 * @param {object} colours { line, soft, warn }
 * @param {object} at      { x, y, size }
 * @param {object} [point] the slide, used to tint the deed seal
 */
export function illustration(name, colours, { x, y, size }, point) {
  const draw = ART[name] ?? ART.check;
  const scale = (size / 100).toFixed(4);
  const seal = sealFor(point);
  return `<g transform="translate(${x},${y}) scale(${scale})">${draw({ ...colours, seal })}</g>`;
}

/**
 * Per-topic accent, so six decks posted over six weeks do not look like one deck posted
 * six times. Hand-picked rather than hue-rotated: every value is dark enough on the cream
 * background to stay above ~5:1, which a naive rotation cannot promise.
 */
const TOPIC_ACCENTS = {
  "deed-types": "#4a6b45",
  "before-you-buy": "#3f6b73",
  landlocked: "#7a5a2e",
  "transfer-costs": "#4d5f8a",
  "city-plan-colours": "#6b4a6b",
  "land-filling": "#5f5a35",
};

export function accentForTopic(topicId, fallback) {
  return TOPIC_ACCENTS[topicId] ?? fallback;
}
