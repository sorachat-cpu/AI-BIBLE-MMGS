// LINE Rich Menu -- the persistent tappable bar attached to the chat itself, not a
// message in the conversation. This is a different surface from buildCategoryMenuFlex()
// in line-bot-engine.mjs (a Flex card that appears once, as a reply): a rich menu is
// always there, whether or not the bot has said anything, which is the whole point of
// building one -- "ไม่ต้องให้บอทตอบตลอดเวลา" (browsing shouldn't require waiting on the
// bot every time).
//
// LINE requires an exact PNG/JPEG at 2500x1686 or 2500x843, under 1MB, with area bounds
// matching the image pixel-for-pixel -- get the two out of sync and taps land on the
// wrong zone. The SVG below is authored at those exact pixel dimensions (no density
// upscale-then-downscale trick like svg-card.mjs uses for video overlays; this is a flat
// UI asset, not something composited into footage) so the areas array below can reference
// the same numbers used to draw the zones.
import sharp from "sharp";

export const RICH_MENU_WIDTH = 2500;
export const RICH_MENU_HEIGHT = 1686;

const COLS = 3;
const ROWS = 2;

// Boundaries computed once, cumulatively, so cell widths never drift apart from rounding
// error (2500/3 is not an integer) -- the SVG drawing and the LINE API's `bounds` MUST
// agree on the exact same pixels, or a tap lands in the gap between what's drawn and
// what's registered.
const COL_X = Array.from({ length: COLS + 1 }, (_, i) => Math.round((i * RICH_MENU_WIDTH) / COLS));
const ROW_Y = Array.from({ length: ROWS + 1 }, (_, i) => Math.round((i * RICH_MENU_HEIGHT) / ROWS));

function cellBounds(i) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = COL_X[col], y = ROW_Y[row];
  return { x, y, width: COL_X[col + 1] - x, height: ROW_Y[row + 1] - y };
}

// Same white-gold palette as the Flex cards (line-bot-engine.mjs's PALETTE) -- one brand,
// whether the customer is looking at a chat bubble or the persistent menu underneath it.
const BG = "#FFFFFF";
const INK = "#241A0F";
const GOLD = "#E0A05C";
const DIVIDER = "#EEE3D3";

// Simple line icons, viewBox 0 0 48 48, same minimalist stroke style as svg-card.mjs's
// ICONS table -- no icon files to ship, no emoji-font surprises when librsvg has no
// colour-emoji face available on the render host.
const ICONS = {
  land: "M6 40h36M10 40V20l14-11 14 11v20M18 40V26h12v14",
  money: "M24 10v28M16 16c0-3 3.6-4 8-4s8 1 8 4-3.6 4-8 4-8 1-8 4 3.6 4 8 4 8 1 8 4-3.6 4-8 4-8-1-8-4",
  pin: "M24 42s14-12.6 14-22a14 14 0 10-28 0c0 9.4 14 22 14 22zM24 24a4 4 0 100-8 4 4 0 000 8z",
  handshake: "M12 4h18l10 10v30H12V4zM28 4v10h10M17 26h14M17 33h14",
  phone: "M13.2 21.6c2.8 5.6 7.6 10.2 13.2 13.2l4.4-4.4c.6-.6 1.4-.8 2-.4 2.2.8 4.6 1.2 7.2 1.2 1.2 0 2 .8 2 2V40c0 1.2-.8 2-2 2C22.8 42 6 25.2 6 8c0-1.2.8-2 2-2h7c1.2 0 2 .8 2 2 0 2.6.4 5 1.2 7.2.2.8 0 1.6-.4 2.2l-4.6 4.2z",
  facebook: "M30 6h-4a8 8 0 00-8 8v6H12v8h6v14h8V28h6l2-8h-8v-6a2 2 0 012-2h6V6z",
};

function icon(path, cx, cy, size, color) {
  const s = size / 48;
  return `<g transform="translate(${cx - size / 2},${cy - size / 2}) scale(${s})">
    <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function esc(text) {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * @param {Array<{icon: keyof typeof ICONS, label: string}>} zones exactly 6, reading
 * left-to-right, top-to-bottom (matches buildRichMenuAreas()'s bounds order)
 */
export function buildRichMenuSvg(zones) {
  if (zones.length !== ROWS * COLS) throw new Error(`buildRichMenuSvg needs exactly ${ROWS * COLS} zones, got ${zones.length}`);

  const cells = zones.map((zone, i) => {
    const { x, y, width: w, height: h } = cellBounds(i);
    const col = i % COLS, row = Math.floor(i / COLS);
    const cx = x + w / 2;
    const iconCy = y + h * 0.38;
    const labelY = y + h * 0.72;

    const dividers = [
      col > 0 ? `<line x1="${x}" y1="${y + 40}" x2="${x}" y2="${y + h - 40}" stroke="${DIVIDER}" stroke-width="2"/>` : "",
      row > 0 ? `<line x1="${x + 40}" y1="${y}" x2="${x + w - 40}" y2="${y}" stroke="${DIVIDER}" stroke-width="2"/>` : "",
    ].join("");

    return `${dividers}
      ${icon(ICONS[zone.icon] ?? ICONS.land, cx, iconCy, 150, GOLD)}
      <text x="${cx}" y="${labelY}" text-anchor="middle" font-family="Prompt, 'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif" font-size="58" font-weight="600" fill="${INK}">${esc(zone.label)}</text>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RICH_MENU_WIDTH}" height="${RICH_MENU_HEIGHT}" viewBox="0 0 ${RICH_MENU_WIDTH} ${RICH_MENU_HEIGHT}">
    <rect width="${RICH_MENU_WIDTH}" height="${RICH_MENU_HEIGHT}" fill="${BG}"/>
    <line x1="0" y1="${ROW_Y[1]}" x2="${RICH_MENU_WIDTH}" y2="${ROW_Y[1]}" stroke="${DIVIDER}" stroke-width="3"/>
    ${cells}
  </svg>`;
}

export async function renderRichMenuImage(zones) {
  const svg = buildRichMenuSvg(zones);
  // density chosen so 42px SVG text rasterises crisp at the exact 2500x1686 output --
  // no upscale/downscale needed since the viewBox already equals the target pixels 1:1.
  return sharp(Buffer.from(svg), { density: 144 })
    .resize({ width: RICH_MENU_WIDTH, height: RICH_MENU_HEIGHT, fit: "fill" })
    .png()
    .toBuffer();
}

/** Pixel bounds for each of the 6 zones, in the same reading order buildRichMenuSvg() draws them. */
export function buildRichMenuAreas(actions) {
  if (actions.length !== ROWS * COLS) throw new Error(`buildRichMenuAreas needs exactly ${ROWS * COLS} actions, got ${actions.length}`);
  return actions.map((action, i) => ({ bounds: cellBounds(i), action }));
}
