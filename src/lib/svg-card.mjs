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
import { PROJECT_ROOT, TEMP_DIR, ensureDirs } from "./ffmpeg.mjs";

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
      <text x="${textX + iconSize * 1.6}" y="${y}" font-family="Sathu" font-size="${rowSize}"
            fill="#E4EDF4">${esc(p.name)}</text>
      <text x="${cardW - textX}" y="${y}" text-anchor="end" font-family="Sathu"
            font-size="${rowSize}" fill="#9FB2C1">${esc(p.distance_text ?? "")}</text>
    </g>`;
    })
    .join("\n");

  const template = await readFile(path.join(TEMPLATE_DIR, "location-card.svg"), "utf8");
  const svg = fill(template, {
    W: width, H: cardH + Math.round(u * 4), PAD: pad, TOP: 0,
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
  const cardH = contactY + contactH + Math.round(u * 6);

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
    CARD_W: cardW, CARD_H: cardH, RADIUS: Math.round(u * 2.4),
    ACCENT_BAR: Math.round(u * 1.2), TEXT_X: textX,
    BADGE_Y: badgeY, BADGE_W: badgeW, BADGE_H: badgeH,
    BADGE_SIZE: Math.round(u * 3.4),
    BADGE_TEXT_X: textX + Math.round(u * 3),
    BADGE_TEXT_Y: badgeY + Math.round(badgeH * 0.68),
    BADGE: esc(badge),
    TITLE: esc(title), TITLE_Y: titleY, TITLE_SIZE: Math.round(u * 5.0),
    SIZE_TEXT: esc(size_text), SIZE_Y: sizeY, SUB_SIZE: Math.round(u * 3.4),
    PRICE: esc(price_text), PRICE_Y: priceY, PRICE_SIZE: Math.round(u * 7.4),
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
