// Platform caption writer.
//
// Two paths on purpose: Claude Haiku when ANTHROPIC_API_KEY is present, and a
// deterministic template when it is not or when the call fails. The fallback is not a
// degraded afterthought -- the daily scheduler runs unattended, and a caption engine
// that can hard-fail would stop the page from posting at all. A slightly plainer
// caption always beats a missed day.
import Anthropic from "@anthropic-ai/sdk";
import { fillTemplate, getCaptionTemplateId } from "../lib/prompt-library.mjs";
import { getPlatform } from "./platforms.mjs";

const MODEL = "claude-haiku-4-5-20251001";
const COST_PER_CALL_USD = 0.001; // per 17_PROMPT_LIBRARY.md registry

// Words the listing must never claim. 03_SYSTEM_RULES.md bans them in extracted
// property data; a caption is the one place a model could reintroduce them.
const BANNED_CLAIMS = ["ดีที่สุด", "ถูกที่สุด", "รับรอง", "การันตี", "ห้ามพลาด", "โอกาสสุดท้าย"];

export function formatPriceThb(price) {
  if (price === null || price === undefined || Number.isNaN(Number(price))) return "สอบถามราคา";
  const n = Number(price);
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    // 12.9 ล้าน, not 12.90 ล้าน
    const text = millions.toFixed(millions % 1 === 0 ? 0 : 1).replace(/\.0$/, "");
    return `${text} ล้านบาท`;
  }
  return `${n.toLocaleString("th-TH")} บาท`;
}

/**
 * Trim to a hard character cap without cutting a hashtag or a Thai word in half.
 * Returns null when even the trimmed form would be nonsense (caller raises ERR_PUB_05).
 */
export function enforceLimit(text, limit) {
  const clean = String(text ?? "").trim();
  if ([...clean].length <= limit) return clean;

  // Prefer dropping whole trailing lines (usually the hashtag block) over mid-sentence cuts.
  const lines = clean.split("\n");
  while (lines.length > 1 && [...lines.join("\n").trim()].length > limit) lines.pop();
  let candidate = lines.join("\n").trim();

  if ([...candidate].length > limit) {
    const chars = [...candidate].slice(0, limit);
    // back off to the last space so we do not end mid-token
    const lastSpace = chars.lastIndexOf(" ");
    candidate = (lastSpace > limit * 0.6 ? chars.slice(0, lastSpace) : chars).join("").trim();
  }
  return candidate.length >= 10 ? candidate : null;
}

/**
 * Squeeze an over-long caption into a limit while keeping the points it makes.
 *
 * enforceLimit() lops the tail, which is the right move for a caption that runs a little
 * over. A caption stored on a queue item is a different case: it is written once and
 * reused for every destination, so it can arrive at three times the cap (a 300-char
 * Reels caption meeting YouTube's 100). Lopping the tail there throws away the contact
 * line and half the offer. So drop the padding instead of the content -- hashtags go
 * first, then whole trailing sentences, and hashtags come back if room is left over.
 *
 * Returns null when even the first sentence will not fit; the caller then rebuilds the
 * caption from the structured listing data rather than shipping a fragment.
 */
export function condenseCaption(text, limit) {
  const clean = String(text ?? "").trim();
  if ([...clean].length <= limit) return clean;

  const isTagOnly = (line) => line.split(/\s+/).every((w) => w.startsWith("#"));
  const tags = clean.split(/\s+/).filter((t) => t.startsWith("#"));
  const body = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isTagOnly(l))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Thai does not end sentences with a full stop, so a period-only split finds nothing.
  // Emoji are what actually terminate a thought in this kind of caption, and the writer
  // template puts one at the end of each -- so break on those as well.
  const sentences = body.split(/(?<=[.!?…]|\p{Extended_Pictographic})\s+/u).filter(Boolean);

  let out = "";
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence;
    if ([...next].length > limit) break;
    out = next;
  }
  // A single sentence longer than the whole limit still beats returning nothing.
  if (!out) out = enforceLimit(body, limit) ?? "";

  for (const tag of tags) {
    const next = `${out} ${tag}`;
    if ([...next].length > limit) break;
    out = next;
  }

  out = out.trim();
  return out.length >= 10 ? out : null;
}

export function containsBannedClaim(text) {
  return BANNED_CLAIMS.filter((w) => String(text ?? "").includes(w));
}

// All 77 provinces. Needed in full: the failure being guarded against is a caption that
// hashtags a province the listing is not in, and a short list would silently pass exactly
// the ones nobody thought to include.
const THAI_PROVINCES = (
  "กรุงเทพ กระบี่ กาญจนบุรี กาฬสินธุ์ กำแพงเพชร ขอนแก่น จันทบุรี ฉะเชิงเทรา ชลบุรี ชัยนาท ชัยภูมิ ชุมพร " +
  "เชียงราย เชียงใหม่ ตรัง ตราด ตาก นครนายก นครปฐม นครพนม นครราชสีมา นครศรีธรรมราช นครสวรรค์ นนทบุรี " +
  "นราธิวาส น่าน บึงกาฬ บุรีรัมย์ ปทุมธานี ประจวบคีรีขันธ์ ปราจีนบุรี ปัตตานี พระนครศรีอยุธยา พังงา พัทลุง " +
  "พิจิตร พิษณุโลก เพชรบุรี เพชรบูรณ์ แพร่ พะเยา ภูเก็ต มหาสารคาม มุกดาหาร แม่ฮ่องสอน ยโสธร ยะลา ร้อยเอ็ด " +
  "ระนอง ระยอง ราชบุรี ลพบุรี ลำปาง ลำพูน เลย ศรีสะเกษ สกลนคร สงขลา สตูล สมุทรปราการ สมุทรสงคราม สมุทรสาคร " +
  "สระแก้ว สระบุรี สิงห์บุรี สุโขทัย สุพรรณบุรี สุราษฎร์ธานี สุรินทร์ หนองคาย หนองบัวลำภู อ่างทอง อำนาจเจริญ " +
  "อุดรธานี อุตรดิตถ์ อุทัยธานี อุบลราชธานี"
).split(/\s+/);

// Han, Hiragana, Katakana, Hangul. A Thai property caption has no business containing
// any of them; when one appears it is a decoding accident, not a word someone chose.
const FOREIGN_SCRIPT = /[　-ヿ㐀-鿿豈-﫿가-힯]/;

/**
 * Last gate before a caption is posted. Strips the three things a language model gets
 * wrong here in ways that are worse than a clumsy sentence:
 *
 *  1. A hashtag naming the wrong province. This is the dangerous one -- it is not a typo
 *     to a reader, it is an address, and it routes buyers to the wrong part of Thailand.
 *  2. Foreign script bleeding into Thai text (seen: "#สินค้าอ動産"), which reads as a
 *     broken page rather than a broken caption.
 *  3. A price claim on a listing whose price is not actually known.
 *
 * Removes rather than rejects: the rest of the caption is usually fine, and a post that
 * goes out slightly shorter beats a slot that does not go out at all.
 *
 * @returns {{ caption: string, removed: string[] }}
 */
export function sanitizeCaption(text, post = {}) {
  const removed = [];
  const here = [post.location, post.raw_address, post.title].filter(Boolean).join(" ");
  const listed = THAI_PROVINCES.filter((p) => here.includes(p));

  const kept = String(text ?? "")
    .split(/(\s+)/)
    .filter((token) => {
      if (!token.startsWith("#")) return true;
      const wrongProvince = THAI_PROVINCES.find((p) => token.includes(p) && !listed.includes(p));
      if (wrongProvince && listed.length) {
        removed.push(`${token} (ที่ดินอยู่${listed.join("/")} ไม่ใช่${wrongProvince})`);
        return false;
      }
      if (FOREIGN_SCRIPT.test(token)) {
        removed.push(`${token} (มีอักษรต่างประเทศปนมา)`);
        return false;
      }
      return true;
    })
    .join("");

  let caption = kept.replace(/[ \t]{2,}/g, " ").replace(/ +$/gm, "");

  // A price claim is only a claim when there is no price to check it against.
  if (post.price_thb === null || post.price_thb === undefined) {
    for (const phrase of ["ราคาถูก", "ราคาย่อมเยา", "ราคาพิเศษ"]) {
      if (caption.includes(phrase)) {
        removed.push(`"${phrase}" (ยังไม่มีราคาในระบบ จึงเคลมไม่ได้)`);
        caption = caption.split(phrase).join("").replace(/[ \t]{2,}/g, " ");
      }
    }
  }

  return { caption: caption.replace(/\n{3,}/g, "\n\n").trim(), removed };
}

function joinFeatures(features) {
  if (!Array.isArray(features) || features.length === 0) return "-";
  return features.join(", ");
}

function hashtagsFor(post) {
  const base = ["#ที่ดินนครนายก", "#ขายที่ดิน", "#ที่ดินเจ้าของขายเอง", "#อสังหาริมทรัพย์", "#ที่ดินสวย"];
  const loc = post.location && post.location !== "-" ? `#${String(post.location).replace(/\s+/g, "")}` : null;
  return [...new Set([loc, ...base].filter(Boolean))].join(" ");
}

/** Deterministic caption. Used when Haiku is unavailable and as the DRY_RUN preview. */
export function fallbackCaption(platform, post) {
  const price = formatPriceThb(post.price_thb);
  const loc = post.location || post.raw_address || "";
  const feats = Array.isArray(post.highlight_features) ? post.highlight_features.slice(0, 4) : [];
  const contact = post.contact_method || "";

  if (platform === "YOUTUBE_SHORTS") {
    return enforceLimit(`ที่ดิน${loc} ${price} สนใจทักได้เลย #ที่ดิน #นครนายก`, 100) ?? "ที่ดินสวย ราคาน่าสนใจ";
  }
  if (platform === "TIKTOK" || platform === "INSTAGRAM_REELS") {
    return [
      `📍 ที่ดิน${loc} ${price}`,
      feats.length ? feats.join(" · ") : "",
      contact ? `สนใจทัก ${contact}` : "สนใจคอมเมนต์ได้เลย",
      "",
      hashtagsFor({ ...post, location: loc }),
    ]
      .filter(Boolean)
      .join("\n");
  }
  // Facebook page/reels, LINE, manual kit
  return [
    `📍 ที่ดิน${loc}`,
    "",
    ...feats.map((f) => `• ${f}`),
    `• ราคา ${price}`,
    post.nearby_summary ? `• ${post.nearby_summary}` : "",
    "",
    contact ? `สนใจสอบถามได้ที่ ${contact}` : "สนใจทักแชทได้เลยครับ",
    "",
    hashtagsFor({ ...post, location: loc }),
  ]
    .filter((line) => line !== "" || true)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Write one caption for one destination.
 * @returns {{ caption: string, template_id: string, source: "claude"|"fallback", cost_usd: number, warnings: string[] }}
 */
export async function writeCaption(platform, post, { apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  const spec = getPlatform(platform);
  const templateId = getCaptionTemplateId(platform);
  const warnings = [];

  const vars = {
    title: post.title || "ที่ดินเปล่า",
    price_formatted: formatPriceThb(post.price_thb),
    location: post.location || post.raw_address || "-",
    highlight_features: joinFeatures(post.highlight_features),
    style_tag: post.style_tag || "CONTEMPORARY",
    contact_method: post.contact_method || "ทักแชทเพจ",
    nearby_summary: post.nearby_summary || "-",
  };

  let caption = null;
  let source = "fallback";
  let cost = 0;

  if (apiKey) {
    try {
      const prompt = fillTemplate(templateId, vars);
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (text) {
        caption = text;
        source = "claude";
        cost = COST_PER_CALL_USD;
      }
    } catch (err) {
      warnings.push(`caption model unavailable, used template instead (${err.message})`);
    }
  } else {
    warnings.push("ANTHROPIC_API_KEY not set -- used deterministic template caption");
  }

  if (!caption) caption = fallbackCaption(platform, post);

  const banned = containsBannedClaim(caption);
  if (banned.length) {
    warnings.push(`removed banned claim(s): ${banned.join(", ")}`);
    for (const word of banned) caption = caption.split(word).join("").replace(/\s{2,}/g, " ");
  }

  const limited = enforceLimit(caption, spec.captionLimit);
  if (limited === null) {
    const err = new Error(`Caption for ${platform} could not be trimmed to ${spec.captionLimit} chars`);
    err.code = "ERR_PUB_05";
    throw err;
  }
  if (limited !== caption.trim()) {
    warnings.push(`caption trimmed to ${spec.captionLimit} char limit for ${platform}`);
  }

  return { caption: limited, template_id: templateId, source, cost_usd: cost, warnings };
}

/** Captions for many destinations at once, sharing nothing but the property data. */
export async function writeCaptions(platforms, post, opts) {
  const entries = await Promise.all(
    platforms.map(async (p) => {
      try {
        return [p, await writeCaption(p, post, opts)];
      } catch (err) {
        return [p, { error_code: err.code || "ERR_PUB_05", error_message: err.message }];
      }
    })
  );
  return Object.fromEntries(entries);
}
