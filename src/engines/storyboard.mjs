// Storyboard -- composes the engines into the four-beat opener the client asked for:
//
//   1  descent      ONE continuous Kling shot: real wide satellite view -> the real plot
//                    photo. Was two separately-generated clips (a "pin" push-in, then a
//                    "descent" morph) spliced together -- however well the two clips'
//                    anchor frames were matched, the splice between them still read as a
//                    cut, not continuous motion. There is no way to make two independently
//                    generated Kling clips feel like one camera move; the fix is to not
//                    generate two clips. A deterministic ffmpeg zoom over Google imagery
//                    (mapzoom-engine.mjs) was tried in between and rejected too -- each
//                    still is a different geographic tile, so the hard cuts between them
//                    read as random left-right jumps, not a descent.
//   2  construction the plot builds itself into a finished house, in 5 real stages
//   3  detail card  property details, price and contact (added by Render Engine)
//
// Beat 1's own template (TPL_VID_010_v1) was already the better-tested of the two old
// prompts -- it already reads as one continuous, uncut descent -- so it now carries the
// whole space-to-plot journey instead of splitting it across two clips/two templates.
//
// Beat 2 (construction) similarly moved off a single land->house Kling morph (which
// regularly ignored the input background and read as a fade) onto construction-engine.mjs's
// 5-stage stills, hard-cut (no dissolve) between them -- see runConstructionScene()'s own
// docs for why a locked background still can't be guaranteed with the image tools wired
// into this repo today, only reduced.
//
// This is orchestration only. Per 02_ARCHITECTURE.md the Orchestrator sequences engines
// and never does media work itself, so every frame here comes from an engine call.
import path from "node:path";
import { readFile } from "node:fs/promises";
import { ffmpeg, probeDuration, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS } from "../lib/ffmpeg.mjs";
import { runVideoEngine } from "./video-engine.mjs";
import { runGoogleEngine, satelliteZoomUrls, pinnedPlotUrl } from "./google-engine.mjs";
import { runConstructionScene, ConstructionSceneError } from "./construction-engine.mjs";
import { renderWf1Pin, renderWf1Clouds } from "../lib/svg-card.mjs";

export class StoryboardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Google image URLs embed our API key; never hand one to a third-party video vendor. */
async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดึงภาพไม่สำเร็จ (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Zoom level for WF1's opening frame. Close enough that the parcel's own surroundings are
// recognisable, far enough that the model still has somewhere to dive from -- verified on
// a real run: the flight reads as satellite -> atmosphere -> cloud break -> ground.
const SATELLITE_START_ZOOM = 16;

/**
 * WF1's start frame: real satellite photography with nothing drawn on top.
 *
 * This must never be a roadmap/hybrid tile or a pinned map. A labelled map carries POI
 * glyphs, Thai place labels and a red marker, and the video model treats those as physical
 * objects -- a verified run turned the pin into a balloon drifting across the sky, which no
 * amount of "no pins, no text" in the prompt suppresses, because it is baked into the input.
 * Google's own attribution strip is baked in too, so the bottom of the plate is cropped off
 * before it reaches the vendor (WF spec: no watermark in frame).
 */
async function cleanSatelliteFrame(geoLocation, apiKey) {
  const { url } = satelliteZoomUrls(geoLocation, apiKey, [SATELLITE_START_ZOOM])[0];
  await ensureDirs();
  const stamp = Date.now();
  const raw = path.join(TEMP_DIR, `wf1_sat_${stamp}.png`);
  const cropped = path.join(TEMP_DIR, `wf1_sat_${stamp}_clean.png`);
  await downloadTo(url, raw);
  // Static Maps stamps its attribution across the bottom edge; trim that band away.
  await ffmpeg(["-i", raw, "-vf", "crop=iw:ih*0.94:0:0", "-y", cropped]);
  return `data:image/png;base64,${(await readFile(cropped)).toString("base64")}`;
}

/**
 * WF1 SCENE 1: drop the location marker onto the opening of the flight.
 *
 * The marker is composited here rather than drawn into the frame sent to the video model,
 * because a baked-in marker gets animated as a physical object -- a verified run turned it
 * into a balloon drifting across the sky. As a vector overlay it stays a crisp marker.
 *
 * It holds still while the shot establishes the location, then accelerates down out of frame
 * as the camera dives past it. That exit is a move, not a dissolve: nothing in this pipeline
 * fades, by explicit instruction.
 *
 * @param {string} clipFile  the flight clip, already local
 * @param {string} outFile
 * @param {{w:number,h:number}} dims
 */
/**
 * A layer that sweeps down past the lens: parked off the top until `start`, then accelerating
 * downward until it has cleared the bottom. Pure motion -- nothing in WF1 fades.
 */
function sweepDown(startSeconds, travelSeconds, frameH, layerH) {
  const p = `(t-${startSeconds})/${travelSeconds}`;
  return `if(lt(t,${startSeconds}),${-layerH},${-layerH}+${frameH + layerH}*${p}*${p})`;
}

export async function compositeWf1Overlays(clipFile, outFile, dims, opts = {}) {
  const { holdSeconds = 1.3, exitSeconds = 0.85, clouds = true } = opts;
  const duration = (await probeDuration(clipFile)) ?? 10;

  const pin = await renderWf1Pin({ width: Math.round(dims.w * 0.2) });
  // Sit the marker's point on the middle of the frame, which is where the plot is.
  const baseY = Math.round(dims.h / 2 - pin.height * 0.78);
  const pp = `(t-${holdSeconds})/${exitSeconds}`;
  // Quadratic, so it starts moving gently and is gone quickly -- a linear exit reads as the
  // graphic being yanked off rather than the camera overtaking it.
  const pinY =
    `if(lt(t,${holdSeconds}),${baseY},` +
    `${baseY}+(${dims.h + pin.height - baseY})*${pp}*${pp})`;

  const inputs = ["-i", clipFile, "-i", pin.file];
  const chain = [
    `[0:v]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,` +
    `crop=${dims.w}:${dims.h},setsar=1[bg]`,
  ];
  let last = "bg";

  // WF1 SCENE 3. The model alone would not reliably put a cloud layer in the descent, so the
  // sky is composited here where it is controllable and identical on every run: a thin upper
  // deck first, then a denser bank that briefly washes the frame out, both sweeping down past
  // the camera as it falls. Placed proportionally, so it lands mid-descent whatever the clip
  // length, and always after the marker has gone.
  if (clouds) {
    const hi = await renderWf1Clouds({ width: dims.w, height: dims.h, layer: "high", seed: 7 });
    const lo = await renderWf1Clouds({ width: dims.w, height: dims.h, layer: "low", seed: 19 });
    inputs.push("-i", hi.file, "-i", lo.file);
    chain.push(
      `[${last}][2:v]overlay=x='(W-w)/2':y='${sweepDown(duration * 0.26, duration * 0.30, dims.h, hi.height)}'[c1]`
    );
    chain.push(
      `[c1][3:v]overlay=x='(W-w)/2':y='${sweepDown(duration * 0.34, duration * 0.26, dims.h, lo.height)}'[c2]`
    );
    last = "c2";
  }

  chain.push(`[${last}][1:v]overlay=x='(W-w)/2':y='${pinY}'[v]`);

  await ffmpeg([
    ...inputs,
    "-filter_complex", chain.join(";"),
    "-map", "[v]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", outFile,
  ], { timeoutMs: 600_000 });
  return outFile;
}

export async function runStoryboard(input, options = {}) {
  const {
    property_id,
    style_tag = "CONTEMPORARY",
    land_image_base64,
    land_image_url,
    house_image_base64,
    house_image_url,
    raw_address,
    aspect = "9:16",
    shots = ["pin", "descent", "construction"],
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new StoryboardError("ERR_SB_INPUT", "property_id missing or malformed");
  }
  const hasLand = Boolean(land_image_base64 || land_image_url);
  if (!hasLand && !raw_address) {
    throw new StoryboardError("ERR_SB_INPUT", "ต้องมีรูปที่ดิน หรือที่อยู่/ลิงก์แผนที่ อย่างน้อยหนึ่งอย่าง");
  }

  const steps = [];
  const clips = [];
  let totalCost = 0;
  const note = (stage, status, detail, cost = 0) => {
    totalCost += cost;
    steps.push({ stage, status, detail, cost_usd: cost });
  };

  // ---- locate the property once; both map beats reuse the result ----
  let geo = null;
  if (raw_address && (shots.includes("pin") || shots.includes("descent"))) {
    try {
      geo = await runGoogleEngine({ property_id, raw_address, nearby_radius_m: 3000 }, options);
      note("google", "ok", `${geo.geo_location.formatted_address.slice(0, 60)}`, 0.005);
    } catch (err) {
      note("google", "failed", `หาพิกัดไม่สำเร็จ: ${err.message}`);
    }
  }

  // ---- beat 1: one continuous shot -- real wide satellite view -> the real plot photo.
  // "pin" and "descent" used to be two separately-generated clips; they're now the same
  // single clip (triggered by either flag) so there is no splice between them to read as
  // a cut -- see file header. ----
  if (shots.includes("pin") || shots.includes("descent")) {
    const apiKey = (options.env ?? process.env).GOOGLE_MAPS_API_KEY;
    let startB64 = null;
    let tailB64 = null;
    let label = "ดิ่งลงจากฟ้า";

    if (geo && apiKey) {
      try {
        startB64 = await cleanSatelliteFrame(geo.geo_location, apiKey);
      } catch {
        startB64 = null;
      }
    }

    if (startB64 && hasLand) {
      // The full journey in one shot: space to the real plot, no intermediate splice.
      tailB64 = land_image_base64 ?? (await fetchAsBase64(land_image_url).catch(() => null));
      if (tailB64) label = "จากอวกาศดิ่งลงสู่ที่ดินจริง";
    } else if (startB64) {
      // No land photo yet -- land on the map pin instead.
      try {
        tailB64 = await fetchAsBase64(pinnedPlotUrl(geo.geo_location, apiKey, 18));
        label = "จากอวกาศดิ่งลงสู่หมุดบนแผนที่";
      } catch {
        tailB64 = null;
      }
    }

    if (!startB64 && hasLand) {
      // No address/coordinates at all -- fall back to descending straight onto the land
      // photo alone (the old no-address behaviour).
      startB64 = land_image_base64 ?? (await fetchAsBase64(land_image_url).catch(() => null));
    }

    if (!startB64) {
      note("descent", "skipped", "ไม่มีภาพตั้งต้นสำหรับช็อตดิ่งลงจากฟ้า");
    } else {
      try {
        const shot = await runVideoEngine(
          {
            property_id,
            image_base64: startB64,
            image_tail_base64: tailB64 ?? undefined,
            template_id: "TPL_VID_010_v1",
            camera_motion: "DRONE_REVEAL",
            // The full journey (pin -> fast zoom -> cloud layer -> land) needs the room: at
            // the old 5s ceiling the model simply dropped beats. But that only applies when
            // there are two anchors to travel between. Without an end frame this is a plain
            // move over one still, and asking for 10s there sends a std-mode request that
            // still carries camera_control -- a combination Kling's v1 models reject.
            duration_seconds: tailB64 ? 10 : 5,
          },
          options
        );
        const raw = shot.b_roll_clips[0];
        // WF1 Scene 1: the marker goes on here, over the finished flight, never into the
        // still that was sent to the model. Only meaningful when we actually located the
        // property -- with no coordinates there is nothing to mark.
        if (geo) {
          try {
            const dims = ASPECTS[aspect] ?? ASPECTS["9:16"];
            const local = path.join(TEMP_DIR, `wf1_raw_${Date.now()}.mp4`);
            await downloadTo(raw.video_url, local);
            const pinned = path.join(
              OUTPUT_DIR,
              `${property_id}_wf1_${Date.now()}_${aspect.replace(":", "_")}.mp4`
            );
            await compositeWf1Overlays(local, pinned, dims);
            clips.push({
              shot: "descent",
              label,
              ...raw,
              file: pinned,
              video_url: `/output/${path.basename(pinned)}`,
            });
            note("descent", "ok", "สร้างช็อตดิ่งลงจากฟ้า + ปักหมุดสำเร็จ", 0.16);
          } catch (err) {
            // The flight itself is the expensive part and it succeeded; ship it unmarked
            // rather than losing the shot over an overlay.
            clips.push({ shot: "descent", label, ...raw });
            note("descent", "degraded", `ได้คลิปแล้วแต่ปักหมุดไม่สำเร็จ: ${err.message}`, 0.16);
          }
        } else {
          clips.push({ shot: "descent", label, ...raw });
          note("descent", "ok", "สร้างช็อตดิ่งลงจากฟ้าสำเร็จ", 0.16);
        }
      } catch (err) {
        note("descent", "failed", `[${err.code}] ${err.message}`);
      }
    }
  }

  // ---- beat 3: the house rises on that same plot -- 5 real stages, hard-cut, no fades.
  // See construction-engine.mjs's own docs: imageFidelity reduces background drift between
  // stages, it does not guarantee a pixel-identical background -- no image tool wired into
  // this repo today can promise that (would need masked/region-constrained editing, which
  // is a separate, not-yet-built provider capability). ----
  if (shots.includes("construction")) {
    if (!hasLand) {
      note("construction", "skipped", "ต้องมีรูปที่ดินเปล่าเพื่อใช้เป็นเฟรมแรก");
    } else {
      try {
        const cons = await runConstructionScene(
          {
            property_id,
            landImageBase64: land_image_base64,
            landImageUrl: land_image_url,
            styleTag: style_tag,
            aspect,
            houseImageBase64: house_image_base64,
            houseImageUrl: house_image_url,
            imageFidelity: 0.9,
            join: "cut",
          },
          options
        );
        clips.push({
          shot: "construction",
          label: "บ้านก่อสร้างขึ้นบนที่ดิน",
          file: cons.file,
          video_url: `/output/${path.basename(cons.file)}`,
        });
        note("construction", "ok", "สร้างช็อตก่อสร้างสำเร็จ (5 สเตจ ไม่มีเฟด)", cons.cost_usd);
      } catch (err) {
        const code = err instanceof ConstructionSceneError ? err.code : "ERR_UNKNOWN";
        note("construction", "failed", `[${code}] ${err.message}`);
      }
    }
  }

  if (!clips.length) {
    throw new StoryboardError("ERR_SB_ALL_FAILED", steps.map((s) => `${s.stage}: ${s.detail}`).join(" | "));
  }

  return {
    property_id,
    clips,
    steps,
    // Handed to Render Engine for beat 4 so the closing card states real, checkable facts
    // about this property rather than generic marketing copy.
    detail_suggestions: {
      address: geo?.geo_location?.formatted_address ?? null,
      nearby_lines: geo?.nearby?.highlight_lines ?? [],
      // Nearest place per category, ready for the mid-clip location card (WF5-fix §2.1).
      nearby_places: (geo?.nearby?.groups ?? []).slice(0, 5).map((g) => ({
        name: g.places[0].name,
        category: g.category,
        distance_text: g.places[0].distance_text,
      })),
    },
    total_cost_usd: Number(totalCost.toFixed(4)),
    stitched: false,
  };
}
