// Overlay card renderer: SVG template -> transparent PNG, composited onto the video by
// FFmpeg (WF5-fix §2.3).
//
// DEVIATION FROM WF5-fix, deliberate: the addendum suggests Puppeteer/Playwright for
// HTML->PNG. That pulls a ~300MB browser in to draw two cards. `sharp` rasterises SVG
// through librsvg/Pango instead -- ~10MB, and Pango does proper complex-script shaping,
// so Thai vowels and tone marks land correctly (verified against a rendered frame).
// The requirement that actually mattered is preserved: layout lives in editable template
// files under templates/, not in this code.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PROJECT_ROOT, TEMP_DIR, ensureDirs, THAI_FONT_NAME } from "./ffmpeg.mjs";

// Cards are rasterised by sharp, whose SVG renderer resolves fonts by NAME through
// fontconfig -- it does not read the .ttf we ship, and it ignores @font-face in the SVG
// (both verified against this exact sharp build). So the family has to be installed for
// the process to see it; ensureFontsInstalled() in ffmpeg.mjs does that from
// assets/fonts. The fallbacks after it are what renders if that ever fails, and every one
// of them carries Thai glyphs -- the previous single "Sathu" had no fallback at all, so a
// machine without it produced a card full of tofu boxes.
const FONT_STACK = `${THAI_FONT_NAME}, 'IBM Plex Sans Thai', 'Noto Sans Thai', 'Sukhumvit Set', Sathu, sans-serif`;

const TEMPLATE_DIR = path.join(PROJECT_ROOT, "templates");

// Minimal line icons drawn as paths -- no icon files to ship, no emoji font surprises
// when librsvg has no colour-emoji face available. viewBox is 0 0 24 24.
const ICONS = {
  hospital: "M12 4v16M4 12h16",
  // Thai temple: tiered roof with a finial, so it does not read as a plain house.
  temple: "M12 2v3M9 8l3-3 3 3zM6.5 12L12 7.5 17.5 12zM4 16.5L12 11l8 5.5zM6 17v4M18 17v4M3 21h18",
  market: "M4 8h16l-1.5 11h-13L4 8zM8 8V6a4 4 0 018 0v2",
  attraction: "M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9L12 3z",
  school: "M3 9l9-5 9 5-9 5-9-5zM7 12v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5",
  shopping: "M6 6h15l-2 9H8L6 6zM6 6L5 3H2M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z",
  convenience: "M4 8h16v11H4V8zM4 8l2-4h12l2 4M9 19v-6h6v6",
  train: "M6 4h12v11H6V4zM6 15l-2 5M18 15l2 5M9 8h6M9 19h6",
  default: "M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
};

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Thai vowels above/below and tone marks stack on the preceding consonant and take no
// horizontal space, so counting them overstates the width badly.
const ZERO_WIDTH_THAI = /[ัิ-ฺ็-๎]/;

/**
 * Cut a line to what will actually fit, because nothing here wraps.
 *
 * An over-long title does not push the card wider, it runs off the edge and out of frame,
 * and listing titles routinely carry the size and the sub-district as well as the name.
 * Estimating is enough: being a character conservative costs nothing, overflowing is
 * visible in the finished video.
 */
function fitText(text, maxWidthPx, fontSize) {
  const chars = [...String(text ?? "")];
  const advance = fontSize * 0.62;
  let width = 0;
  for (let i = 0; i < chars.length; i++) {
    if (!ZERO_WIDTH_THAI.test(chars[i])) width += advance;
    if (width > maxWidthPx) {
      // Back off to a base character. Cutting mid-cluster either strips a tone mark off
      // its consonant or leaves an orphaned mark sitting against the ellipsis.
      let end = Math.max(1, i - 1);
      while (end > 1 && ZERO_WIDTH_THAI.test(chars[end])) end--;
      return `${chars.slice(0, end).join("").trim()}…`;
    }
  }
  return String(text ?? "");
}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    values[key] === undefined ? "" : String(values[key])
  );
}

async function rasterise(svg, outFile, targetWidth) {
  await ensureDirs();
  // Render above target size so glyph edges stay clean, then scale back down to exactly
  // the video width. Without the resize the raster comes out at density/72 times larger
  // than the declared viewBox and the overlay would be wider than the frame.
  const buf = await sharp(Buffer.from(svg), { density: 200 })
    .resize({ width: targetWidth, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  await writeFile(outFile, buf);
  return outFile;
}

/**
 * Location card -- "what's around this property", shown mid-clip.
 * @param {object} opts
 * @param {number} opts.width @param {number} opts.height  video canvas
 * @param {Array<{name,distance_text,category}>} opts.places
 */
export async function renderLocationCard({
  width,
  height,
  places = [],
  headline = "ที่ดินทำเลดี",
  subheadline = "เดินทางสะดวก ใกล้แหล่งสำคัญ",
  footer = "ทำเลดี เหมาะสำหรับสร้างบ้าน หรือทำโครงการ",
}) {
  const rows = places.slice(0, 5);
  const u = width / 100;
  const cardW = Math.round(width * 0.86);
  const pad = Math.round((width - cardW) / 2);
  const rowH = Math.round(u * 7.4);
  const headSize = Math.round(u * 6.2);
  const subSize = Math.round(u * 3.4);
  const rowSize = Math.round(u * 3.8);
  const textX = Math.round(u * 9);
  const headY = Math.round(u * 11);
  const subY = headY + Math.round(u * 5.4);
  const rowsTop = subY + Math.round(u * 5.5);
  const cardH = rowsTop + rows.length * rowH + Math.round(u * 9);
  const iconSize = Math.round(rowSize * 1.15);

  const rowSvg = rows
    .map((p, i) => {
      const y = rowsTop + i * rowH;
      const d = ICONS[p.category] ?? ICONS.default;
      const scale = iconSize / 24;
      return `<g>
      <g transform="translate(${textX},${y - iconSize * 0.78}) scale(${scale.toFixed(3)})">
        <path d="${d}" fill="none" stroke="#E0A05C" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <text x="${textX + iconSize * 1.6}" y="${y}" font-family="${FONT_STACK}" font-size="${rowSize}"
            fill="#E4EDF4">${esc(p.name)}</text>
      <text x="${cardW - textX}" y="${y}" text-anchor="end" font-family="${FONT_STACK}"
            font-size="${rowSize}" fill="#9FB2C1">${esc(p.distance_text ?? "")}</text>
    </g>`;
    })
    .join("\n");

  const template = await readFile(path.join(TEMPLATE_DIR, "location-card.svg"), "utf8");
  const svg = fill(template, {
    W: width, H: cardH + Math.round(u * 4), PAD: pad, TOP: 0,
    FONT: FONT_STACK,
    CARD_W: cardW, CARD_H: cardH, RADIUS: Math.round(u * 2.4),
    ACCENT_BAR: Math.round(u * 1.1), TEXT_X: textX,
    HEAD_Y: headY, HEAD_SIZE: headSize, SUB_Y: subY, SUB_SIZE: subSize,
    HEADLINE: esc(headline), SUBHEADLINE: esc(subheadline),
    ROWS: rowSvg, FOOTER: esc(footer),
    FOOTER_Y: rowsTop + rows.length * rowH + Math.round(u * 4.5),
  });

  return rasterise(svg, path.join(TEMP_DIR, `location_card_${width}.png`), width);
}

/** Ending card -- badge, size, price, contact, optional QR. */
export async function renderEndingCard({
  width,
  height,
  badge = "เจ้าของขายเอง",
  title = "",
  size_text = "",
  price_text = "",
  phone = "",
  line_id = "",
  qrFile = null,
}) {
  const u = width / 100;
  const cardW = Math.round(width * 0.86);
  const pad = Math.round((width - cardW) / 2);
  const textX = Math.round(u * 8);
  const badgeH = Math.round(u * 6.4);
  const badgeW = Math.round(u * 30);
  const badgeY = Math.round(u * 7);
  const titleY = badgeY + badgeH + Math.round(u * 8);
  const sizeY = titleY + Math.round(u * 5.6);
  const priceY = sizeY + Math.round(u * 9.5);
  const contactY = priceY + Math.round(u * 5);
  const contactH = Math.round(u * 16);
  const qrSide = Math.round(u * 12);
  // Keep contact text clear of the QR block when one is present.
  const contactTextW = qrFile ? Math.round(u * 14) : 0;
  // Drop the reserved height too, otherwise the card keeps a block of dead space where
  // the contact panel would have been.
  const hasContact = Boolean(phone || line_id);
  const cardH = hasContact
    ? contactY + contactH + Math.round(u * 6)
    : priceY + Math.round(u * 5);

  // librsvg refuses to load external file:// references, so the QR has to be inlined as
  // a data URI -- a plain href silently renders nothing.
  let qrBlock = "";
  if (qrFile) {
    const b64 = (await readFile(qrFile)).toString("base64");
    qrBlock =
      `<image href="data:image/png;base64,${b64}" ` +
      `x="${cardW - textX - qrSide - Math.round(u * 2)}" ` +
      `y="${contactY + (contactH - qrSide) / 2}" ` +
      `width="${qrSide}" height="${qrSide}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const template = await readFile(path.join(TEMPLATE_DIR, "ending-card.svg"), "utf8");
  const svg = fill(template, {
    W: width, H: cardH + Math.round(u * 4), PAD: pad, TOP: 0,
    FONT: FONT_STACK,
    CARD_W: cardW, CARD_H: cardH, RADIUS: Math.round(u * 2.4),
    ACCENT_BAR: Math.round(u * 1.2), TEXT_X: textX,
    BADGE_Y: badgeY, BADGE_W: badgeW, BADGE_H: badgeH,
    BADGE_SIZE: Math.round(u * 3.4),
    BADGE_TEXT_X: textX + Math.round(u * 3),
    BADGE_TEXT_Y: badgeY + Math.round(badgeH * 0.68),
    BADGE: esc(badge),
    TITLE: esc(fitText(title, cardW - textX * 2, Math.round(u * 5.0))),
    TITLE_Y: titleY, TITLE_SIZE: Math.round(u * 5.0),
    SIZE_TEXT: esc(fitText(size_text, cardW - textX * 2, Math.round(u * 3.4))),
    SIZE_Y: sizeY, SUB_SIZE: Math.round(u * 3.4),
    // Largest type on the card, so it overflows first: 23 of 67 listings carry a price
    // string wider than the card at this size ("ยกแปลง4ไร่ 4.8ล้านบาท" and similar).
    PRICE: esc(fitText(price_text, cardW - textX * 2, Math.round(u * 7.4))),
    PRICE_Y: priceY, PRICE_SIZE: Math.round(u * 7.4),
    CONTACT_ON: phone || line_id ? 1 : 0,
    CONTACT_Y: contactY, CONTACT_W: cardW - textX * 2, CONTACT_H: contactH,
    CONTACT_R: Math.round(u * 1.8), CONTACT_SIZE: Math.round(u * 3.6),
    CONTACT_TEXT_X: textX + Math.round(u * 3.5),
    PHONE_Y: contactY + Math.round(contactH * 0.42),
    LINE_Y: contactY + Math.round(contactH * 0.74),
    PHONE: esc(phone), LINE_ID: esc(line_id ? `LINE ${line_id}` : ""),
    QR_BLOCK: qrBlock,
  });

  return rasterise(svg, path.join(TEMP_DIR, `ending_card_${width}.png`), width);
}

/**
 * WF3 advertisement panel -- WF-REALESTATE-3WF-SPEC.md "WF3 / PROPERTY ADVERTISEMENT".
 *
 * Rendered as a transparent-topped panel that sits over the lower part of the finished-house
 * shot and slides up into place as the camera pulls back (src/engines/wf3-ad.mjs drives the
 * motion). Every value here comes from confirmed listing data -- the spec forbids inventing
 * a price, a land size or a selling point, so anything the caller leaves out is simply left
 * off the card rather than filled in.
 *
 * Layout hierarchy is the spec's: image (the shot behind), price, land size, 3-5 selling
 * points, location, CTA.
 *
 * @param {object} opts
 * @param {number} opts.width          video canvas width (panel spans it)
 * @param {string} [opts.title]        headline
 * @param {string} [opts.price_text]   e.g. "1,590,000 บาท" -- pre-formatted, never rounded here
 * @param {string} [opts.size_text]    e.g. "2 ไร่ 1 งาน"
 * @param {string[]} [opts.features]   confirmed selling points; capped at 5 per spec
 * @param {string} [opts.location]     ตำบล/อำเภอ/จังหวัด
 * @param {string} [opts.cta]
 * @param {string} [opts.contact]
 * @param {string} [opts.disclaimer]   AI-visualisation disclosure
 */
export async function renderWf3AdCard({
  width,
  title,
  price_text,
  size_text,
  features = [],
  location,
  cta = "สนใจรายละเอียด / นัดชมบ้าน ทักแชตได้เลย",
  contact,
  disclaimer = "ภาพบ้านเป็นภาพจำลองเพื่อประกอบการนำเสนอ",
}) {
  const W = width;
  const PAD = Math.round(W * 0.067);
  const textW = W - PAD * 2;

  const TITLE_SIZE = Math.round(W * 0.043);
  const PRICE_SIZE = Math.round(W * 0.1);
  const SIZE_SIZE = Math.round(W * 0.043);
  const ROW_SIZE = Math.round(W * 0.039);
  const LOC_SIZE = Math.round(W * 0.037);
  let CTA_SIZE = Math.round(W * 0.042);
  const CONTACT_SIZE = Math.round(W * 0.046);
  const DISC_SIZE = Math.round(W * 0.023);

  const TITLE_Y = Math.round(W * 0.139);
  const PRICE_Y = TITLE_Y + Math.round(PRICE_SIZE * 1.22);
  const SIZE_Y = PRICE_Y + Math.round(SIZE_SIZE * 1.5);

  // 3-5 points per spec; more than that stops being a hierarchy and starts being a list.
  const points = features.filter((f) => String(f ?? "").trim()).slice(0, 5);
  const ROW_STEP = Math.round(ROW_SIZE * 1.55);
  const ROWS_Y = SIZE_Y + Math.round(ROW_SIZE * 1.9);
  const rows = points
    .map((f, i) => {
      const y = ROWS_Y + i * ROW_STEP;
      const dot = Math.round(ROW_SIZE * 0.17);
      return (
        `<g><circle cx="${PAD + dot}" cy="${y - Math.round(ROW_SIZE * 0.32)}" r="${dot}" fill="#E0A05C"/>` +
        `<text x="${PAD + Math.round(ROW_SIZE * 0.9)}" y="${y}" font-family="${FONT_STACK}" ` +
        `font-size="${ROW_SIZE}" font-weight="500" fill="#EFE7DC">` +
        `${esc(fitText(f, textW - ROW_SIZE, ROW_SIZE))}</text></g>`
      );
    })
    .join("\n  ");

  const rowsEnd = points.length ? ROWS_Y + (points.length - 1) * ROW_STEP : SIZE_Y;
  const LOC_Y = rowsEnd + Math.round(LOC_SIZE * 1.9);
  const CTA_Y = LOC_Y + Math.round(LOC_SIZE * 1.1);
  const CTA_H = Math.round(W * 0.096);
  // The pill grows to fit its label, and the label shrinks when even the full-width pill
  // cannot hold it. A call to action that stops mid-word is worse than no button at all,
  // and these run long in Thai ("สนใจรายละเอียด / นัดชมบ้าน ทักแชตได้เลย" overflows a
  // full-width pill at the default size). Growing first, then shrinking, keeps short CTAs
  // at full size instead of scaling everything down to the worst case.
  const ctaBaseChars = [...String(cta ?? "")].filter((c) => !ZERO_WIDTH_THAI.test(c)).length;
  const ctaWanted = Math.round(ctaBaseChars * CTA_SIZE * 0.62 + CTA_SIZE * 2);
  const CTA_W = Math.min(textW, Math.max(Math.round(W * 0.5), ctaWanted));
  if (ctaWanted > CTA_W) {
    CTA_SIZE = Math.max(
      Math.round(W * 0.028), // floor: below this the button stops being readable on a phone
      Math.floor((CTA_W - CTA_SIZE * 2) / (ctaBaseChars * 0.62))
    );
  }
  const CONTACT_Y = CTA_Y + CTA_H + Math.round(CONTACT_SIZE * 1.35);
  const DISC_Y = CONTACT_Y + Math.round(DISC_SIZE * 2.1);
  const H = DISC_Y + Math.round(W * 0.04);

  const template = await readFile(path.join(TEMPLATE_DIR, "wf3-ad-card.svg"), "utf8");
  const svg = fill(template, {
    W, H, PAD, FONT: FONT_STACK,
    TITLE: esc(fitText(title, textW, TITLE_SIZE)), TITLE_SIZE, TITLE_Y,
    PRICE: esc(fitText(price_text, textW, PRICE_SIZE)), PRICE_SIZE, PRICE_Y,
    SIZE: esc(fitText(size_text, textW, SIZE_SIZE)), SIZE_SIZE, SIZE_Y,
    ROWS: rows,
    LOCATION: esc(fitText(location, textW - LOC_SIZE * 1.2, LOC_SIZE)), LOC_SIZE, LOC_Y,
    CTA: esc(fitText(cta, CTA_W - CTA_SIZE, CTA_SIZE)), CTA_SIZE, CTA_Y,
    CTA_W, CTA_H, CTA_R: Math.round(CTA_H / 2),
    CTA_TX: Math.round(CTA_W / 2), CTA_TY: Math.round(CTA_H * 0.66),
    CONTACT: esc(fitText(contact, textW, CONTACT_SIZE)), CONTACT_SIZE, CONTACT_Y,
    DISCLAIMER: esc(fitText(disclaimer, textW, DISC_SIZE)), DISC_SIZE, DISC_Y,
  });

  const out = path.join(TEMP_DIR, `wf3_ad_card_${width}_${Date.now()}.png`);
  return { file: await rasterise(svg, out, W), height: H };
}

/**
 * WF1's location marker -- WF-REALESTATE-3WF-SPEC.md "SCENE 1 LOCATION PIN".
 *
 * Rendered as a standalone transparent PNG so FFmpeg can composite it over the opening of
 * the WF1 clip. It must never be drawn into the frame handed to the video model: a real run
 * proved the model treats a baked-in marker as a physical object and flies it around the sky
 * like a balloon, and no negative prompt suppresses that.
 *
 * @param {number} width  marker width in video pixels (height follows the 240x300 viewBox)
 */
export async function renderWf1Pin({ width }) {
  const W = Math.round(width);
  const H = Math.round((W * 300) / 240);
  const template = await readFile(path.join(TEMPLATE_DIR, "wf1-pin.svg"), "utf8");
  const svg = fill(template, { W, H, FONT: FONT_STACK });
  const out = path.join(TEMP_DIR, `wf1_pin_${W}_${Date.now()}.png`);
  return { file: await rasterise(svg, out, W), width: W, height: H };
}

/**
 * WF1 SCENE 3 cloud sheet -- WF-REALESTATE-3WF-SPEC.md "CLOUD TRANSITION".
 *
 * A band of procedural cloud, taller than the video frame, that FFmpeg sweeps downward past
 * the lens so the descent reads as passing through a cloud layer. Generated from turbulence
 * rather than shipped as an image: deterministic per seed, so the same listing renders the
 * same sky every time, and there is no binary asset to maintain.
 *
 * @param {number} width   video frame width (the sheet is drawn wider, to allow drift)
 * @param {number} height  video frame height (the sheet is drawn taller, to sweep through)
 * @param {number} [seed]
 * @param {"high"|"low"} [layer]  "high" is the thin upper deck the camera meets first;
 *                                "low" is the denser bank just above the ground
 */
export async function renderWf1Clouds({ width, height, seed = 7, layer = "high" }) {
  const W = Math.round(width * 1.35);
  const H = Math.round(height * (layer === "low" ? 1.5 : 1.15));
  const preset =
    layer === "low"
      // Bigger, heavier masses -- this is the deck that briefly whites out the view.
      ? { FREQ: "0.0035 0.0065", OCT: 6, GAIN: 2.1, BIAS: -0.62 }
      // Thin and wispy, so the first contact with cloud is soft rather than a wall.
      : { FREQ: "0.006 0.011", OCT: 5, GAIN: 1.5, BIAS: -0.55 };

  const template = await readFile(path.join(TEMPLATE_DIR, "wf1-clouds.svg"), "utf8");
  const svg = fill(template, { W, H, SEED: seed, ...preset });
  const out = path.join(TEMP_DIR, `wf1_cloud_${layer}_${seed}_${Date.now()}.png`);
  return { file: await rasterise(svg, out, W), width: W, height: H };
}
