// Map Zoom Engine -- the "drop out of the sky onto this plot" opener.
//
// Input is a single address or a plot that already has coordinates; output is a clip that
// starts on a wide satellite frame and descends to the parcel with the pin on it.
//
// Deliberately NOT a video-model job. The shot is a camera move across still imagery, so
// generating it costs four static-map requests (about $0.008) instead of $0.16 for a
// clip, needs no Kling quota, and shows the genuine satellite view of that parcel rather
// than something a model imagined. Nothing an image-to-video model adds here is worth
// twenty times the price and a loss of accuracy about where the land actually is.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, probeDuration, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { runGoogleEngine, satelliteZoomUrls, pinnedPlotUrl } from "./google-engine.mjs";
import { pushIn } from "../lib/kenburns.mjs";

// Per frame. Short enough that four of them plus the hold stay inside a Reel, long
// enough that the eye registers each altitude before the next one arrives.
const SECONDS_PER_FRAME = 2.2;
const HOLD_SECONDS = 3.0; // the pinned frame at the end, where the viewer actually reads
// Past this the descent crawls and reads as a stall, so the picture stops following the
// narration. Anything beyond is reported rather than silently cut by -shortest.
const MAX_STRETCH = 4;

export class MapZoomError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MapZoomError";
    this.code = code;
  }
}

/**
 * Build the descent clip.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} [input.raw_address]  geocoded when lat/lng are absent
 * @param {{lat:number,lng:number}} [input.geo]  skip geocoding when already known
 * @param {string} [input.aspect]  "9:16" (default) or "16:9"
 * @param {number[]} [input.zooms]
 * @param {number} [input.minDuration]  stretch the descent to cover a narration track
 * @param {{from:number,to:number}} [input.pinnedZoom]  zoom range for the final pinned
 *                                  hold (default {from:1.0,to:1.03}). A caller that hands
 *                                  `closest_frame` to a downstream clip as its own start
 *                                  anchor (e.g. storyboard.mjs) can pass {from:1.0,to:1.0}
 *                                  so that clip's cut lands on the exact same framing this
 *                                  one ends on, instead of a slightly zoomed-in version of it.
 * @returns {{file, duration, aspect, frames, closest_frame, geo, truncated_seconds, cost_usd}}
 */
export async function runMapZoom(input, options = {}) {
  const {
    property_id,
    raw_address,
    geo: knownGeo,
    aspect = "9:16",
    zooms = [6, 11, 15, 18],
    minDuration = 0,
    pinnedZoom = { from: 1.0, to: 1.03 },
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new MapZoomError("ERR_MAPZOOM_INPUT", "property_id ไม่ถูกต้อง");
  }
  const dims = ASPECTS[aspect];
  if (!dims) throw new MapZoomError("ERR_MAPZOOM_INPUT", `aspect ไม่รองรับ: ${aspect}`);
  if (!Array.isArray(zooms) || !zooms.length) {
    throw new MapZoomError("ERR_MAPZOOM_INPUT", "ต้องมีระดับซูมอย่างน้อยหนึ่งระดับ");
  }

  const apiKey = (options.env ?? process.env).GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new MapZoomError("ERR_MAPZOOM_ENV", "ไม่มี GOOGLE_MAPS_API_KEY ใน .env");

  let geo = knownGeo;
  if (!geo?.lat || !geo?.lng) {
    if (!raw_address) {
      throw new MapZoomError("ERR_MAPZOOM_INPUT", "ต้องมี raw_address หรือพิกัด lat/lng");
    }
    // runGoogleEngine takes { googleMapsApiKey }, not { env } -- forwarding `options`
    // verbatim silently drops an injected key and falls back to process.env.
    const g = await runGoogleEngine(
      { property_id, raw_address, include_nearby: false },
      { ...options, googleMapsApiKey: apiKey }
    );
    geo = g.geo_location;
  }

  await ensureDirs();
  const stamp = Date.now();

  // Wide to close, then the pinned frame. The pin is a separate request rather than a
  // marker on every frame because a marker at zoom 6 covers a whole province.
  const sources = [
    ...satelliteZoomUrls(geo, apiKey, zooms),
    { zoom: zooms.at(-1), url: pinnedPlotUrl(geo, apiKey, zooms.at(-1)), pinned: true },
  ];

  // Stretch to cover the narration when one is supplied. A voice track that outlasts the
  // picture is silently truncated by the render, and the sentences that go missing are
  // the closing ones -- price and contact. Scaling every frame keeps the descent evenly
  // paced rather than dumping the surplus onto a single motionless hold.
  const baseDuration = zooms.length * SECONDS_PER_FRAME + HOLD_SECONDS;
  const wanted = minDuration > baseDuration ? minDuration / baseDuration : 1;
  const stretch = Math.min(wanted, MAX_STRETCH);
  const truncatedBy = wanted > MAX_STRETCH
    ? Number((minDuration - baseDuration * MAX_STRETCH).toFixed(1))
    : 0;

  const segments = [];
  const frameFiles = [];
  for (const [i, src] of sources.entries()) {
    const img = path.join(TEMP_DIR, `mz_${stamp}_${i}.png`);
    try {
      await downloadTo(src.url, img);
    } catch (err) {
      throw new MapZoomError("ERR_MAPZOOM_FETCH", `ดึงภาพแผนที่ zoom ${src.zoom} ไม่สำเร็จ: ${err.message}`);
    }
    const seg = path.join(TEMP_DIR, `mzseg_${stamp}_${i}.mp4`);
    await pushIn(
      img,
      seg,
      dims,
      (src.pinned ? HOLD_SECONDS : SECONDS_PER_FRAME) * stretch,
      // The last frame is where the viewer reads the location, so it barely moves.
      src.pinned ? pinnedZoom : undefined
    );
    segments.push(seg);
    frameFiles.push(img);
  }

  const listFile = path.join(TEMP_DIR, `mz_${stamp}.txt`);
  await writeFile(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));

  const out = path.join(OUTPUT_DIR, `${property_id}_mapzoom_${stamp}_${aspect.replace(":", "_")}.mp4`);
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);

  return {
    file: out,
    duration: (await probeDuration(out)) ?? 0,
    aspect,
    frames: sources.length,
    // The closest satellite plate, reused as the backdrop for later scenes so the film
    // stays over the same ground instead of cutting to a flat panel.
    closest_frame: frameFiles.at(-1) ?? null,
    geo,
    // Non-zero means the narration outruns the picture by this many seconds and the
    // render will cut the tail -- which is where the price and the phone number live.
    truncated_seconds: truncatedBy,
    // Static Maps billing, per 19_COST_CALCULATOR.md. No video model is involved.
    cost_usd: Number((sources.length * 0.002).toFixed(4)),
  };
}
