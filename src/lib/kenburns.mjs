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
 * Panorama sweep across a still -- the camera travels sideways instead of pushing in.
 *
 * This is the right move for land photos specifically: a plot is *wide*, and a push-in
 * throws away exactly the thing being sold (how far the land runs) to magnify the middle.
 * A sweep shows the full width and reads as a drone tracking shot rather than a zoom on
 * a photograph.
 *
 * Two things make it work rather than look mechanical:
 *
 *  - The source is scaled to overshoot the frame width by `overscan`, which is what
 *    creates somewhere to travel. `force_original_aspect_ratio=increase` against a box of
 *    (w*overscan) x h guarantees BOTH that there is horizontal travel and that the frame
 *    is covered, for portrait sources too -- a plain `scale=-2:h` would leave a portrait
 *    photo narrower than the frame and the crop would fail.
 *  - The travel is eased with a smoothstep (3p^2 - 2p^3) rather than linear. A constant-
 *    velocity pan starts and stops abruptly at the cut; easing in and out lets one clip
 *    hand over to the next without a visible jolt.
 *
 * Unlike pushIn this uses `-loop 1 -t`, which is correct here: the warning in pushIn is
 * specific to zoompan expanding every frame it receives. `crop` does no such expansion.
 *
 * @param {"right"|"left"} [opts.direction]  which way the camera travels
 * @param {number} [opts.overscan]   how much wider than the frame to scale (1.0 = no travel)
 * @param {number} [opts.drift]      extra slow zoom applied across the move, 0 = none
 */
export async function panAcross(image, out, { w, h }, seconds, opts = {}) {
  const { direction = "right", overscan = 1.45, drift = 0.06 } = opts;
  const dur = Math.max(0.1, seconds);
  const frames = Math.max(1, Math.round(dur * FPS));

  // zoompan, not crop: crop evaluates its width and height once at configuration time, so a
  // drift expressed there never varies with time -- which is why the sweep used to be
  // exactly as flat as the drift was added to avoid. zoompan re-evaluates z, x and y per
  // output frame, so the pan and the zoom can both move.
  //
  // `on` is the output frame index. p is normalised progress, eased so the sweep starts and
  // stops gently instead of snapping into constant velocity.
  const p = `min(1,on/${frames})`;
  const eased = `(3*pow(${p},2)-2*pow(${p},3))`;
  const travel = direction === "left" ? `(1-${eased})` : eased;
  // Starts a touch tighter and settles back to the frame, so the move has some depth.
  const z = `(1+${drift.toFixed(4)}*(1-${eased}))`;

  const plateW = Math.round(w * overscan);
  const plateH = Math.round(h);

  await ffmpeg([
    "-i", image,
    "-vf",
      // Work at 2x so the zoompan window has real pixels to crop from.
      `scale=${plateW * 2}:${plateH * 2}:force_original_aspect_ratio=increase,` +
      `crop=${plateW * 2}:${plateH * 2},` +
      `zoompan=z='${z}':d=${frames}:` +
      `x='(iw-iw/zoom)*${travel}':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${FPS},` +
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
