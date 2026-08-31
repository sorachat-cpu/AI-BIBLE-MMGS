// WF3 -- Finished House -> Advertisement Layout.
// WF-REALESTATE-3WF-SPEC.md, third and final workflow.
//
// Takes FINAL FRAME WF2 (the finished-house shot) as its FIRST FRAME, per the spec's master
// continuity rule, and turns it into the sell sheet: a slow cinematic pull-back on the house
// with the advertisement panel rising into place over it.
//
// No generative model is involved, deliberately. The spec's Data Accuracy rule forbids AI
// from producing a price, a land size, a distance or a selling point, and an ad frame is the
// one place where an invented number is an actual lie to a buyer. Everything here is drawn
// from the caller's confirmed data with sharp/FFmpeg, which also makes the whole workflow
// free and repeatable rather than $0.16 and different every run.
//
// The transition is a single continuous camera move, not a cut and not a fade: one still,
// one uninterrupted zoom-out, and the panel eases up from below the frame. The spec asks for
// "Cinematic Property Video -> Premium Real Estate Advertisement", and forbids a plain hard
// cut between them.
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, probeDuration, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { FPS } from "../lib/kenburns.mjs";
import { renderWf3AdCard } from "../lib/svg-card.mjs";

// Spec: "จบ Video ด้วย Advertisement Layout แบบนิ่งประมาณ 2–3 วินาที เพื่อให้ผู้ชมอ่านได้ทัน".
const REVEAL_SECONDS = 3.6; // cinematic reveal on the house before the panel arrives
const SLIDE_SECONDS = 0.9;  // the panel easing up into place
const HOLD_SECONDS = 3.2;   // static, readable

export class Wf3AdError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Wf3AdError";
    this.code = code;
  }
}

function stripDataUri(v) {
  return typeof v === "string" ? v.replace(/^data:image\/[a-zA-Z+]+;base64,/, "") : v;
}

/** Thai baht, grouped. Never rounds -- the spec forbids altering the number at all. */
export function formatPriceThb(price) {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return `${n.toLocaleString("en-US")} บาท`;
}

/**
 * Build the advertisement clip.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} [input.house_image_file]    FINAL FRAME WF2 as a local path (preferred)
 * @param {string} [input.house_image_base64]  ...or inline
 * @param {string} [input.house_image_url]     ...or remote
 * @param {string} [input.title]
 * @param {number} [input.price_thb]           formatted here; never rounded or invented
 * @param {string} [input.price_text]          pre-formatted alternative, used verbatim
 * @param {string} [input.size_text]
 * @param {string[]} [input.features]          confirmed selling points only (spec caps at 5)
 * @param {string} [input.location]
 * @param {string} [input.cta] @param {string} [input.contact]
 * @param {string} [input.aspect]              spec's Mobile First default is 9:16
 */
export async function runWf3Ad(input, options = {}) {
  const {
    property_id,
    house_image_file,
    house_image_base64,
    house_image_url,
    title,
    price_thb,
    price_text,
    size_text,
    features = [],
    location,
    cta,
    contact,
    disclaimer,
    aspect = "9:16",
    reveal_seconds = REVEAL_SECONDS,
    hold_seconds = HOLD_SECONDS,
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new Wf3AdError("ERR_WF3_INPUT", "property_id missing or malformed");
  }
  const dims = ASPECTS[aspect];
  if (!dims) throw new Wf3AdError("ERR_WF3_INPUT", `aspect ไม่รองรับ: ${aspect}`);
  if (!house_image_file && !house_image_base64 && !house_image_url) {
    throw new Wf3AdError(
      "ERR_WF3_INPUT",
      "ต้องมีภาพบ้านที่สร้างเสร็จ (FINAL FRAME WF2) เพื่อใช้เป็นเฟรมแรกของ WF3"
    );
  }

  await ensureDirs();
  const stamp = Date.now();

  // ---- FIRST FRAME WF3 = FINAL FRAME WF2 ----
  let hero = house_image_file;
  if (!hero) {
    hero = path.join(TEMP_DIR, `wf3_hero_${stamp}.png`);
    if (house_image_base64) {
      await writeFile(hero, Buffer.from(stripDataUri(house_image_base64), "base64"));
    } else {
      await downloadTo(house_image_url, hero);
    }
  }

  // ---- the panel, from confirmed data only ----
  const priceOut = price_text ?? formatPriceThb(price_thb);
  const points = features.filter((f) => String(f ?? "").trim()).slice(0, 5);
  const card = await renderWf3AdCard({
    width: dims.w,
    title,
    price_text: priceOut,
    size_text,
    features: points,
    location,
    ...(cta ? { cta } : {}),
    contact,
    ...(disclaimer ? { disclaimer } : {}),
  });

  // Spec's Data Accuracy rule works both ways: anything unconfirmed is left off the card,
  // and the caller is told what was left off rather than discovering a blank slot later.
  const omitted = [];
  if (!priceOut) omitted.push("ราคา");
  if (!size_text) omitted.push("เนื้อที่");
  if (!points.length) omitted.push("จุดเด่น");
  if (!location) omitted.push("ทำเล");
  if (!contact) omitted.push("ช่องทางติดต่อ");
  if (!title) omitted.push("หัวเรื่อง");

  // ---- one continuous move: pull back on the house, panel eases up over it ----
  const duration = Number((reveal_seconds + SLIDE_SECONDS + hold_seconds).toFixed(2));
  const frames = Math.max(1, Math.round(duration * FPS));
  const from = 1.16;
  const step = (1.0 - from) / frames;
  const cardH = Math.min(card.height, dims.h);
  const targetY = dims.h - cardH;
  const t0 = reveal_seconds;
  const t1 = reveal_seconds + SLIDE_SECONDS;
  // Ease-out so the panel decelerates into place instead of arriving at constant speed.
  const p = `(t-${t0})/${SLIDE_SECONDS}`;
  const slideY =
    `if(lt(t,${t0}),${dims.h},` +
    `if(lt(t,${t1}),${dims.h}-(${dims.h}-${targetY})*(1-(1-${p})*(1-${p})),${targetY}))`;

  const out = path.join(OUTPUT_DIR, `${property_id}_wf3_ad_${stamp}_${aspect.replace(":", "_")}.mp4`);
  await ffmpeg([
    "-i", hero,
    "-i", card.file,
    "-filter_complex",
      `[0:v]scale=${dims.w * 2}:${dims.h * 2}:force_original_aspect_ratio=increase,` +
      `crop=${dims.w * 2}:${dims.h * 2},` +
      `zoompan=z='${from}+${step}*on':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${dims.w}x${dims.h}:fps=${FPS},` +
      `setsar=1[bg];` +
      `[bg][1:v]overlay=x=0:y='${slideY}'[v]`,
    "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-r", String(FPS), out,
  ], { timeoutMs: 600_000 });

  // ---- FINAL FRAME WF3 / the static ad image (spec's OUTPUT items 2 and 3) ----
  const finalFrame = path.join(OUTPUT_DIR, `${property_id}_wf3_final_${stamp}.png`);
  await ffmpeg(["-sseof", "-0.2", "-i", out, "-frames:v", "1", "-y", finalFrame]);

  return {
    property_id,
    file: out,
    video_url: `/output/${path.basename(out)}`,
    final_frame: finalFrame,
    final_frame_url: `/output/${path.basename(finalFrame)}`,
    // The last frame IS the finished layout, so it doubles as the static ad image the spec
    // asks for -- rendering a second one separately could only ever drift from the video.
    static_ad_image: finalFrame,
    duration: (await probeDuration(out)) ?? duration,
    aspect,
    card_height: cardH,
    data_used: {
      title: title ?? null,
      price_text: priceOut ?? null,
      size_text: size_text ?? null,
      features: points,
      location: location ?? null,
      contact: contact ?? null,
    },
    data_omitted: omitted,
    cost_usd: 0, // no generative call -- FFmpeg and sharp only
  };
}

/**
 * Caption for the post (spec's OUTPUT item 4). Confirmed fields only, in the spec's own
 * priority order, so a listing missing a price simply has no price line.
 */
export function buildWf3Caption({ title, price_text, size_text, features = [], location, cta, contact }) {
  const lines = [];
  if (title) lines.push(title);
  if (price_text) lines.push(`ราคา ${price_text}`);
  if (size_text) lines.push(`เนื้อที่ ${size_text}`);
  for (const f of features.slice(0, 5)) lines.push(`• ${f}`);
  if (location) lines.push(`ทำเล ${location}`);
  if (cta) lines.push(cta);
  if (contact) lines.push(contact);
  return lines.join("\n");
}
