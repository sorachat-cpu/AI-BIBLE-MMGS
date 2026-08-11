// Still image -> a clip that moves. Shared by every scene built from a photograph or a
// rendered card, so the whole film has one motion language instead of each engine
// inventing its own drift.
import { ffmpeg } from "./ffmpeg.mjs";

export const FPS = 30;

/**
 * Push in (or pull back) on a still.
 *
 * Two details matter and are easy to get wrong:
 *
 *  - Exactly one input frame. zoompan's `d` expands *each* frame it receives, so pairing
 *    it with `-loop 1 -t` multiplies the two: asking for 2.2s yields minutes of video.
 *  - zoompan renders straight to the final size. Letting it output at 2x and scaling down
 *    afterwards is the obvious arrangement and is about ten times slower, because zoompan
 *    rescales on every frame -- its output size is what costs, not its input size.
 *
 * The source is still oversampled first so there is real detail to move into.
 */
export async function pushIn(image, out, { w, h }, seconds, { from = 1.0, to = 1.12 } = {}) {
  const frames = Math.max(1, Math.round(seconds * FPS));
  const step = (to - from) / frames;
  await ffmpeg([
    "-i", image,
    "-vf",
      `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,` +
      `crop=${w * 2}:${h * 2},` +
      `zoompan=z='${from}+${step}*on':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${FPS},` +
      `setsar=1`,
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), out,
  ]);
  return out;
}

/**
 * A card laid over a background photo, then pushed in.
 *
 * Cards are rendered at their own height, not the full frame, so they cannot be used as a
 * scene on their own. Compositing them over the scene's own imagery keeps the film in the
 * same place rather than cutting to a flat panel.
 */
export async function cardOverImage(background, cardPng, out, { w, h }, seconds, opts = {}) {
  const { dim = 0.45, from = 1.0, to = 1.06 } = opts;
  const frames = Math.max(1, Math.round(seconds * FPS));
  const step = (to - from) / frames;
  await ffmpeg([
    "-i", background,
    "-i", cardPng,
    "-filter_complex",
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
      // Darken the plate so the card reads; a card on bright satellite imagery is a
      // contrast fight the text loses.
      `colorlevels=rimax=${1 - dim}:gimax=${1 - dim}:bimax=${1 - dim}[bg];` +
      `[bg][1:v]overlay=(W-w)/2:(H-h)/2[c];` +
      `[c]zoompan=z='${from}+${step}*on':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${FPS},setsar=1[v]`,
    "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), out,
  ]);
  return out;
}
