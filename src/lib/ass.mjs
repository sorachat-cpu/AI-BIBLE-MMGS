// ASS subtitle builder.
//
// Everything textual in the render goes through libass rather than FFmpeg's drawtext.
// drawtext performs no complex-script shaping, so Thai combining vowels and tone marks
// land in the wrong position; libass shapes correctly.
import { THAI_FONT_NAME } from "./ffmpeg.mjs";

function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// ASS colours are &HAABBGGRR -- alpha first, then BGR, the reverse of CSS hex.
function toAssColour(hex, alpha = "00") {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function escapeText(text) {
  return String(text).replace(/\n/g, "\\N").replace(/\{/g, "(").replace(/\}/g, ")");
}

/**
 * Subtitle track for the body of the video.
 * `cues` is [{ start, end, text }] in seconds.
 */
export function buildSubtitleAss({ width, height, cues, fontSize, accent = "#FFFFFF" }) {
  const size = fontSize ?? Math.round(height * 0.038);
  // Alignment 2 = bottom-centre. MarginV keeps text clear of platform UI chrome.
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Body,${THAI_FONT_NAME},${size},${toAssColour(accent)},&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(size * 0.09))},2,2,${Math.round(width * 0.07)},${Math.round(width * 0.07)},${Math.round(height * 0.13)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues
    .map((c) => `Dialogue: 0,${toAssTime(c.start)},${toAssTime(c.end)},Body,,0,0,0,,${escapeText(c.text)}`)
    .join("\n");
  return header + events + "\n";
}

/**
 * Ending card text. This is the only place in the whole pipeline where price and
 * contact details are allowed to appear -- 03_SYSTEM_RULES.md Rule 1 keeps them out of
 * every AI-generated frame so a price change never forces a re-render.
 */
export function buildEndingCardAss({
  width,
  height,
  title,
  price_text,
  features = [],
  contact_phone,
  line_id,
  duration,
  accent = "#E0A05C",
}) {
  const unit = height / 100;
  const titleSize = Math.round(unit * 4.0);
  const priceSize = Math.round(unit * 5.6);
  const featureSize = Math.round(unit * 2.7);
  const contactSize = Math.round(unit * 3.0);

  // align 8 = top-centre (headline rows), 7 = top-left (the bullet list, so the bullets
  // stack in a straight column instead of a ragged centred wedge).
  const style = (name, size, colour, marginV, bold = 0, align = 8, marginL = width * 0.08) =>
    `Style: ${name},${THAI_FONT_NAME},${size},${toAssColour(colour)},&H000000FF,&H00000000,&H00000000,${bold},0,0,0,100,100,0,0,1,0,0,${align},${Math.round(marginL)},${Math.round(width * 0.08)},${marginV},1`;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style("CardTitle", titleSize, "#FFFFFF", Math.round(unit * 10))}
${style("CardPrice", priceSize, accent, Math.round(unit * 19), 1)}
${style("CardFeature", featureSize, "#C4D2DE", Math.round(unit * 30), 0, 7, width * 0.22)}
${style("CardContact", contactSize, "#D8E2EA", Math.round(unit * 45))}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const end = toAssTime(duration);
  const lines = [];
  if (title) lines.push(`Dialogue: 0,0:00:00.00,${end},CardTitle,,0,0,0,,${escapeText(title)}`);
  if (price_text) lines.push(`Dialogue: 0,0:00:00.00,${end},CardPrice,,0,0,0,,${escapeText(price_text)}`);

  // Property detail lines -- size, features, what is nearby. Each on its own row,
  // capped so the card never overruns the QR block below it.
  const shown = features.filter(Boolean).slice(0, 4);
  if (shown.length) {
    lines.push(
      `Dialogue: 0,0:00:00.00,${end},CardFeature,,0,0,0,,${escapeText(shown.map((f) => `• ${f}`).join("\n"))}`
    );
  }

  // One contact per line. Joining them with a separator lets libass wrap mid-pair and
  // strand the separator at the start of the second line.
  const contactBits = [];
  if (contact_phone) contactBits.push(`โทร ${contact_phone}`);
  if (line_id) contactBits.push(`LINE ${line_id}`);
  if (contactBits.length) {
    lines.push(`Dialogue: 0,0:00:00.00,${end},CardContact,,0,0,0,,${escapeText(contactBits.join("\n"))}`);
  }

  return header + lines.join("\n") + "\n";
}
