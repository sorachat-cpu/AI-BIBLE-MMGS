// Carousel Engine -- knowledge slides as PNG images, no generative AI involved.
//
// Sits in the same place as Overlay Engine architecturally: SVG template -> sharp
// (librsvg/Pango) -> PNG. That path is already proven to shape Thai vowels and tone
// marks correctly in this repo, and it costs nothing per render, which matters when the
// page needs a fresh carousel several times a week.
//
// Deliberately NOT an image-generation job. A slide about deed types has to be legible
// and factually exact; an image model cannot render Thai text reliably at all, and the
// Kling image quota is exhausted anyway (see 20_ROADMAP.md).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PROJECT_ROOT, OUTPUT_DIR } from "../lib/ffmpeg.mjs";
import { getTopic } from "../content/topics.mjs";
import { chooseArt, illustration, accentForTopic } from "../lib/illustrations.mjs";

const TEMPLATE_DIR = path.join(PROJECT_ROOT, "templates");
const BRAND_MARK = path.join(PROJECT_ROOT, "assets", "brand", "logo-mark.png");
export const CAROUSEL_DIR = path.join(OUTPUT_DIR, "carousels");

// 4:5 is the tallest ratio Facebook and Instagram both show uncropped, so it buys the
// most vertical space in the feed per post.
//
// Exported at 1440x1800 rather than the nominal 1080x1350. Facebook re-encodes every
// upload; handing it more pixels than it will display means its compression works from a
// denser source, and the text edges survive instead of turning to mush. The layout is
// unchanged -- the SVG viewBox is still 1080x1350, this is only the raster size.
// Layout space. Every coordinate in the templates and every centring calculation is in
// these units, and they must stay equal to the SVG viewBox.
const WIDTH = 1080;
const HEIGHT = 1350;

// Raster size, deliberately larger than the layout space. Facebook re-encodes every
// upload; handing it more pixels than it displays means its compression starts from a
// denser source and the text edges survive instead of turning to mush. Changing these
// two must never change the layout -- that is the whole point of keeping them separate.
const EXPORT_WIDTH = 1440;
const EXPORT_HEIGHT = 1800;

// Nothing in the templates wraps, so an over-long line runs off the canvas silently.
// Authors get a warning instead of a broken slide they only notice after posting.
const MAX_LINE_CHARS = 40;
const MAX_HEADING_CHARS = 22;

export const THEMES = {
  amber: {
    bg_from: "#1b1206",
    bg_to: "#0d0a06",
    accent: "#dda062",
    title_color: "#f6ede1",
    body_color: "#c9bdad",
    muted_color: "#7d7263",
  },
  forest: {
    bg_from: "#0c1a12",
    bg_to: "#070f0a",
    accent: "#6cc492",
    title_color: "#e8f3ec",
    body_color: "#b3c8bb",
    muted_color: "#6c8377",
  },
  paper: {
    bg_from: "#faf5ec",
    bg_to: "#f3ece0",
    accent: "#a9661f",
    title_color: "#241a0f",
    body_color: "#4f4436",
    muted_color: "#9c8f7c",
  },
  // The page sells land in Nakhon Nayok -- hills, waterfalls, green. This theme draws
  // that as actual scenery rather than only recolouring text, which is what separates it
  // from `forest` above. `decor: true` switches on the ornament layer below.
  nature: {
    bg_from: "#12261a",
    bg_to: "#060f0a",
    accent: "#86d29b",
    title_color: "#eef7f0",
    body_color: "#b9d0c0",
    muted_color: "#7d9a88",
    decor: true,
    // A second, warmer hue so the sun does not read as more leaf-green.
    sun: "#e8c98a",
  },
  /**
   * Default. Daylight version of `nature`: same scenery, read on paper instead of at
   * night. A dark slide wins on a phone at 2am and loses everywhere else -- it reads as
   * a tech product, not as land, and it is the first thing that made the old slides feel
   * heavy. Warm off-white and sage keep it calm enough to read six slides in a row.
   *
   * Contrast is checked, not guessed: accent #4a6b45 on #faf8f3 is about 5.5:1, so it is
   * safe for the small kicker text and not only for fills.
   */
  daylight: {
    bg_from: "#faf8f3",
    bg_to: "#eef1e8",
    accent: "#4a6b45",
    title_color: "#2b322b",
    body_color: "#57604f",
    // Dark enough to stay legible where it overlaps the nearest ridgeline, which is
    // exactly where the brand line sits.
    muted_color: "#79826f",
    decor: true,
    sun: "#c8912f",
    light: true,
    // Second accent, used only for the consequence line ("what it costs you to not know
    // this"). Terracotta rather than red: it still belongs to a landscape palette, but it
    // is the one warm thing on the slide, so the eye lands on it after the headline.
    // This is the whole reason the old version read as flat -- everything was one hue,
    // so nothing was ranked and the eye had nowhere to go second.
    warn_color: "#b4552d",
    warn_soft: "#f6e7de",
    accent_soft: "#e3ebe0",
  },
};

// Font stack, best first. Pango picks the first family actually installed, so this
// upgrades itself the moment a better face is added to ~/Library/Fonts -- no code change.
//
// Prompt is the target: geometric, light-feeling, and the face Thai property marketing
// actually uses. Sathu (the previous choice) ships with macOS but reads as dated, which
// is what made the old slides look cheap. Sukhumvit Set is the best installed fallback.
// See assets/fonts/README.md for what to install.
const FONT = "Prompt, IBM Plex Sans Thai, Noto Sans Thai, Sukhumvit Set, Sathu, sans-serif";
const PREFERRED_FONT = "Prompt";

/**
 * The real brand logo, inlined.
 *
 * It is the page's actual mark (assets/photos/), white-matted to alpha and trimmed by
 * scripts/build-brand-mark.mjs -- not something drawn here. librsvg refuses external
 * file:// references, so it has to travel as a data URI; read once and cached, because
 * a six-topic run renders 43 slides and would otherwise re-read it 43 times.
 */
let brandMarkCache = null;
async function brandMarkImage({ x, y, size, opacity = 1 }) {
  if (brandMarkCache === null) {
    try {
      brandMarkCache = (await readFile(BRAND_MARK)).toString("base64");
    } catch {
      brandMarkCache = ""; // logo not built yet: slides still render, just unbranded
    }
  }
  if (!brandMarkCache) return "";
  return `<image href="data:image/png;base64,${brandMarkCache}" x="${x}" y="${y}"
      width="${size}" height="${size}" opacity="${opacity}"
      preserveAspectRatio="xMidYMid meet"/>`;
}

export class CarouselError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CarouselError";
    this.code = code;
  }
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Every slot is escaped, because all of them carry author-written Thai copy that may
// legitimately contain & or < -- except this one, which carries generated SVG markup and
// would be destroyed by escaping. Kept as an explicit allowlist so no future slot becomes
// an injection point by accident.
const RAW_SLOTS = new Set(["decor", "dots", "art", "brand_mark", "body_panel"]);

// Thai vowels above/below and tone marks stack on the preceding consonant and take no
// horizontal space. Counting them would make every pill far too wide, which is why the
// naive `text.length` approach produces buttons with a lake of empty space on the right.
const ZERO_WIDTH_THAI = /[ัิ-ฺ็-๎]/;

/**
 * Rough advance width of a string. Deliberately an estimate: measuring properly needs a
 * shaping pass, and everything it sizes here is a pill drawn *around* text, where being a
 * few pixels generous costs nothing and being short would clip a glyph.
 */
function textWidth(text, size) {
  const base = [...String(text ?? "")].filter((c) => !ZERO_WIDTH_THAI.test(c)).length;
  return Math.round(base * size * 0.62);
}

/** Progress dots. Shows there is more to swipe without asking anyone to read a number. */
/**
 * Wash behind the whole text block: heading and body together, not body alone.
 *
 * Covering only the body left the heading floating on the logo, and the join between
 * "on the panel" and "on the watermark" was more distracting than either state. One panel
 * sized to whichever line is widest keeps the centre axis and gives every word the same
 * background.
 */
function bodyPanel(point, palette) {
  const lines = (point.lines ?? []).filter(Boolean);
  const heads = [point.heading].flat().filter(Boolean);
  if (!lines.length && !heads.length) return "";

  const widest = Math.max(
    ...lines.map((l) => textWidth(l, 46)),
    ...heads.map((h) => textWidth(h, 74)),
    0
  );
  const w = Math.min(1010, widest + 110);

  const shift = heads[1] ? 0 : -90;
  const top = 500;                                   // clear of the heading ascenders
  const lastBaseline = 786 + Math.max(0, lines.length - 1) * 76 + shift;
  const h = lastBaseline + 46 - top;

  return `<rect x="${Math.round((WIDTH - w) / 2)}" y="${top}" width="${w}" height="${h}"
      rx="40" fill="${palette.bg_from}" opacity="0.88" filter="url(#soften)"/>`;
}

/** Takeaway box, sized to its own text so it never floats as an empty tinted bar. */
function noteW(point) {
  return Math.min(940, textWidth(point.note ?? "", 38) + 96);
}

function progressDots(total, current, accent) {
  const w = 26;
  const gap = 10;
  const span = total * w + (total - 1) * gap;
  const startX = Math.round((WIDTH - span) / 2);
  const cells = Array.from({ length: total }, (_, i) => {
    const on = i + 1 === current;
    return `<rect x="${startX + i * (w + gap)}" y="1178" width="${w}" height="8" rx="4"
      fill="${accent}" opacity="${on ? 1 : 0.22}"/>`;
  }).join("");
  return `<g>${cells}</g>`;
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    if (value === undefined || value === null) return "";
    return RAW_SLOTS.has(key) ? String(value) : esc(value);
  });
}

/**
 * Background scenery for the `nature` theme: sun glow, layered hills, drifting leaves.
 *
 * Drawn behind everything else -- the templates place {{decor}} immediately after the
 * background rect -- so no ornament can ever land on top of text and cost legibility.
 * Every shape is a plain path: no image files to ship, and it rescales with the canvas.
 *
 * @param {object} palette  the theme entry
 * @param {"cover"|"point"|"cta"} variant  how busy the slide already is
 */
function natureDecor(palette, variant) {
  if (!palette.decor) return "";
  const { accent, sun } = palette;
  // Point slides carry the oversized index number and four body lines, so they get the
  // quietest treatment; the cover has the most empty space and can take the most.
  const density = variant === "point" ? 0.55 : 1;
  const uid = `nd${variant}`;

  const leaf = (x, y, rot, scale, opacity) =>
    `<g transform="translate(${x},${y}) rotate(${rot}) scale(${scale})" opacity="${(opacity * density).toFixed(3)}">
      <path d="M0 0 C 26 -34, 74 -34, 100 0 C 74 34, 26 34, 0 0 Z" fill="${accent}"/>
      <path d="M4 0 H 96" stroke="${palette.bg_to}" stroke-width="3" opacity="0.5"/>
    </g>`;

  return `<g>
    <defs>
      <radialGradient id="${uid}Sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stop-color="${sun}" stop-opacity="0.34"/>
        <stop offset="55%" stop-color="${sun}" stop-opacity="0.09"/>
        <stop offset="100%" stop-color="${sun}" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Sun through the canopy. Upper right on cover and CTA, where the text column is
         left-aligned and that corner is empty. Point slides already put a 210px index
         number there and the two stacked read as a smudge, so on those the glow moves
         down to the genuinely empty band above the ridgeline, and the solid disc is
         dropped rather than left to compete with the number.
         (No double hyphen anywhere in this comment: librsvg rejects the whole file.) -->
    ${
      variant === "point"
        ? `<circle cx="884" cy="1000" r="330" fill="url(#${uid}Sun)"/>`
        : `<circle cx="900" cy="176" r="400" fill="url(#${uid}Sun)"/>` +
          // The solid disc reads as a sun against a night sky and as a smudge against
          // paper -- on the light theme the soft glow alone carries it.
          (palette.light
            ? ""
            : `<circle cx="900" cy="176" r="58" fill="${sun}" opacity="${(0.16 * density).toFixed(3)}"/>`)
    }

    <!-- three ridgelines, far to near: the horizon Nakhon Nayok actually has -->
    <path d="M0 1176 Q 200 1088 420 1156 T 806 1132 T 1080 1180 L1080 1350 L0 1350 Z"
          fill="${accent}" opacity="${(0.09 * density).toFixed(3)}"/>
    <path d="M0 1232 Q 260 1150 500 1218 T 900 1196 T 1080 1236 L1080 1350 L0 1350 Z"
          fill="${accent}" opacity="${(0.13 * density).toFixed(3)}"/>
    <path d="M0 1290 Q 300 1224 610 1282 T 1080 1272 L1080 1350 L0 1350 Z"
          fill="${accent}" opacity="${(0.2 * density).toFixed(3)}"/>

    ${leaf(-18, 470, -26, 1.5, 0.07)}
    ${leaf(922, 742, 34, 1.25, 0.06)}
    ${leaf(838, 980, -14, 0.9, 0.05)}
  </g>`;
}

/** Spread an array into numbered slots (line1..lineN) the templates expect. */
function slots(prefix, list, count) {
  const out = {};
  for (let i = 0; i < count; i++) out[`${prefix}${i + 1}`] = list?.[i] ?? "";
  return out;
}

async function rasterise(svg, outFile) {
  // Render at higher density for clean glyph edges, then force the exact canvas size --
  // without the resize, sharp emits density/72 times the declared viewBox.
  const buf = await sharp(Buffer.from(svg), { density: 200 })
    .resize({ width: EXPORT_WIDTH, height: EXPORT_HEIGHT, fit: "fill" })
    .png()
    .toBuffer();
  await writeFile(outFile, buf);
  return outFile;
}

function checkLengths(topic) {
  const warnings = [];
  const check = (text, limit, where) => {
    if (text && [...text].length > limit) {
      warnings.push(`${where}: ยาว ${[...text].length} ตัวอักษร (เกิน ${limit}) อาจล้นขอบสไลด์`);
    }
  };
  topic.title?.forEach((t, i) => check(t, MAX_HEADING_CHARS, `หัวเรื่องบรรทัด ${i + 1}`));
  topic.points?.forEach((p, pi) => {
    p.heading?.forEach((h, i) => check(h, MAX_HEADING_CHARS, `ข้อ ${pi + 1} หัวข้อบรรทัด ${i + 1}`));
    p.lines?.forEach((l, i) => check(l, MAX_LINE_CHARS, `ข้อ ${pi + 1} บรรทัด ${i + 1}`));
  });
  return warnings;
}

/**
 * Render one topic into a folder of numbered PNGs.
 *
 * @param {object} opts
 * @param {string} opts.topic_id  id from src/content/topics.mjs
 * @param {string} [opts.theme]   amber | forest | paper
 * @param {object} [opts.profile] page profile -- supplies brand and contact
 * @returns {{ topic_id, dir, slides: string[], caption: string, warnings: string[] }}
 */
export async function renderCarousel({ topic_id, theme = "amber", profile = {}, maxPoints = 6 } = {}) {
  let topic;
  try {
    topic = getTopic(topic_id);
  } catch (err) {
    throw new CarouselError("ERR_CAR_TOPIC", err.message);
  }

  const themeBase = THEMES[theme];
  if (!themeBase) {
    throw new CarouselError("ERR_CAR_THEME", `ไม่รู้จักธีม "${theme}" -- มี: ${Object.keys(THEMES).join(", ")}`);
  }
  // Each topic gets its own accent so consecutive posts do not look interchangeable.
  const palette = { ...themeBase, accent: accentForTopic(topic.id, themeBase.accent) };

  const brand = profile.page_name ?? "ติดดินบินโดรน";
  // `decor` is a switch, not a slot value -- spreading it straight in would print the
  // word "true" onto every slide. Each render below supplies the real markup instead.
  const { decor: _decorFlag, light: _lightFlag, ...paletteVars } = palette;
  // Older themes predate the second accent. Falling back to the primary keeps them
  // rendering instead of emitting fill="" , which librsvg draws as solid black.
  // Watermark: centred, nearly frame-wide, behind everything.
  //
  // 0.20 is the chosen balance. It does sit behind the headline, so the two sets of Thai
  // lettering overlap; that was accepted deliberately for the stronger brand presence
  // after seeing 0.20 and 0.80 side by side. Do not raise it much further without
  // re-checking the headline: legibility falls off fast above this.
  const watermark = await brandMarkImage({ x: 90, y: 300, size: 900, opacity: 0.2 });
  const base = {
    ...paletteVars,
    warn_color: palette.warn_color ?? palette.accent,
    warn_soft: palette.warn_soft ?? palette.bg_from,
    accent_soft: palette.accent_soft ?? palette.bg_from,
    font: FONT,
    brand,
  };
  // Illustrations use the theme's own hues so they never look pasted on.
  const artColours = {
    line: palette.accent,
    soft: palette.accent_soft ?? palette.bg_from,
    warn: palette.warn_color ?? palette.accent,
  };
  const warnings = checkLengths(topic);

  const [coverTpl, pointTpl, ctaTpl] = await Promise.all([
    readFile(path.join(TEMPLATE_DIR, "carousel-cover.svg"), "utf8"),
    readFile(path.join(TEMPLATE_DIR, "carousel-point.svg"), "utf8"),
    readFile(path.join(TEMPLATE_DIR, "carousel-cta.svg"), "utf8"),
  ]);

  const dir = path.join(CAROUSEL_DIR, topic.id);
  await mkdir(dir, { recursive: true });

  const points = topic.points.slice(0, maxPoints);
  const slides = [];
  let n = 0;
  const nextFile = () => path.join(dir, `${String(++n).padStart(2, "0")}.png`);

  // Cover + one per point + closing slide. Shown on the cover so the reader knows the
  // size of the commitment before starting; an unbounded carousel is easy to abandon.
  const slideCount = points.length + 2;
  const kicker = topic.kicker ?? "";
  const kickerW = Math.max(220, textWidth(kicker, 29) + 68);
  const hookW = Math.min(940, Math.max(...(topic.subtitle ?? [""]).map((t) => textWidth(t, 46))) + 110);
  const ctaText = `เลื่อนดูทั้ง ${points.length} ข้อ  →`;
  const ctaW = textWidth(ctaText, 38) + 100;
  const ctaKicker = "สนใจแปลงไหน ทักได้เลย";
  const ctaKickerW = Math.max(220, textWidth(ctaKicker, 29) + 68);

  slides.push(
    await rasterise(
      fill(coverTpl, {
        ...base,
        decor: natureDecor(palette, "cover"),
        brand_mark: watermark,
        kicker,
        kicker_w: kickerW,
        kicker_x: Math.round((WIDTH - kickerW) / 2),
        kicker_mid: Math.round(kickerW / 2),
        total: slideCount,
        cta_text: ctaText,
        cta_w: ctaW,
        cta_x: Math.round((WIDTH - ctaW) / 2),
        cta_mid: Math.round(ctaW / 2),
        // Sized to the copy, not to the column. A full-width tint behind two short lines
        // reads as an empty panel; hugging the text makes it read as a highlight.
        hook_w: hookW,
        hook_x: Math.round((WIDTH - hookW) / 2),
        hook_mid: Math.round(hookW / 2),
        dots: progressDots(slideCount, 1, palette.accent),
        // The cover borrows the first point's subject: it is the most representative one
        // available without asking every topic file to nominate a cover drawing.
        art: illustration(
          chooseArt(points[0] ?? {}),
          artColours,
          { x: 485, y: 190, size: 112 },
          points[0]
        ),
        ...slots("title", topic.title, 3),
        ...slots("subtitle", topic.subtitle, 2),
      }),
      nextFile()
    )
  );

  for (const [i, point] of points.entries()) {
    slides.push(
      await rasterise(
        fill(pointTpl, {
          ...base,
          decor: natureDecor(palette, "point"),
          brand_mark: watermark,
          index: i + 1,
          total: points.length,
          dots: progressDots(slideCount, i + 2, palette.accent),
          art: illustration(chooseArt(point), artColours, { x: 450, y: 120, size: 180 }, point),
          // One heading line means one unused 82px row above the body; pull it back up.
          body_shift: point.heading?.[1] ? 0 : -90,
          // The takeaway follows the copy instead of sitting at a fixed y. Pinned low, a
          // point with three lines instead of four left a 380px hole mid-slide, which
          // reads as a rendering fault rather than as whitespace.
          note_y:
            786 +
            Math.max(0, (point.lines?.filter(Boolean).length ?? 1) - 1) * 76 +
            (point.heading?.[1] ? 0 : -90) +
            90,
          // Markers and the note box have to disappear with the text they belong to,
          // otherwise an unused slot leaves a floating square or an empty tinted bar.
          dot1: point.lines?.[0] ? 1 : 0,
          dot2: point.lines?.[1] ? 1 : 0,
          dot3: point.lines?.[2] ? 1 : 0,
          dot4: point.lines?.[3] ? 1 : 0,
          note_on: point.note ? 1 : 0,
          body_panel: bodyPanel(point, palette),
          note_w: noteW(point),
          note_x: Math.round((WIDTH - noteW(point)) / 2),
          note_mid: Math.round(noteW(point) / 2),
          ...slots("heading", point.heading, 2),
          ...slots("line", point.lines, 4),
          note: point.note ?? "",
        }),
        nextFile()
      )
    );
  }

  slides.push(
    await rasterise(
      fill(ctaTpl, {
        ...base,
        decor: natureDecor(palette, "cta"),
        brand_mark: watermark,
        kicker: ctaKicker,
        kicker_w: ctaKickerW,
        kicker_x: Math.round((WIDTH - ctaKickerW) / 2),
        kicker_mid: Math.round(ctaKickerW / 2),
        dots: progressDots(slideCount, slideCount, palette.accent),
        art: "",
        ...slots("headline", topic.cta?.headline, 2),
        ...slots("body", topic.cta?.body, 2),
        contact_label: "สนใจที่ดินนครนายก ทักได้เลย",
        contact: profile.contact_method ?? "แชทเพจ",
        disclaimer: topic.disclaimer ?? "",
      }),
      nextFile()
    )
  );

  const caption = [topic.caption, "", profile.carousel_hashtags ?? "#ที่ดินนครนายก #ซื้อที่ดิน #ความรู้ที่ดิน #ที่ดินเจ้าของขายเอง"]
    .join("\n")
    .trim();

  await writeFile(
    path.join(dir, "caption.txt"),
    `${caption}\n`,
    "utf8"
  );

  return {
    topic_id: topic.id,
    dir,
    slides: slides.map((s) => path.relative(OUTPUT_DIR, s)),
    slide_count: slides.length,
    caption,
    warnings,
  };
}

/** Render every topic -- used once to fill the library, and after editing templates. */
export async function renderAllCarousels({ theme = "amber", profile = {} } = {}) {
  const { TOPICS } = await import("../content/topics.mjs");
  const out = [];
  for (const topic of TOPICS) {
    out.push(await renderCarousel({ topic_id: topic.id, theme, profile }));
  }
  return out;
}
