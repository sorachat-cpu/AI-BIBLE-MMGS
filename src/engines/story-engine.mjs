// Story Engine -- assembles the whole clip as an ordered set of scenes.
//
// The running order was specified directly:
//
//   นอกโลก -> หมุดบน Google Maps -> ภาพดาวเทียม -> ซูมมาที่แปลง (รูป input)
//     -> ก่อสร้าง -> สถานที่ใกล้เคียง -> ข้อมูลดีเทล -> ป้ายติดต่อกลับ
//
// The pin the caller supplies does double duty: it is where the descent lands, and it is
// what the nearby-places lookup is run against. One input, both jobs -- which is why this
// engine geocodes once and hands the result to every scene that needs it.
//
// Every scene except construction is built from stills already paid for (satellite plates
// from Static Maps, the property photo, cards drawn locally). Construction is the only
// beat that needs a generative model, so it is opt-in: the film is complete without it and
// costs about a cent.
import { writeFile, access } from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, probeDuration, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { pushIn, cardOverImage } from "../lib/kenburns.mjs";
import { runGoogleEngine } from "./google-engine.mjs";
import { runMapZoom } from "./mapzoom-engine.mjs";
import { renderLocationCard, renderEndingCard } from "../lib/svg-card.mjs";
import { runConstructionScene, estimateSceneCost, estimateSceneDuration } from "./construction-engine.mjs";
import { CONSTRUCTION_STAGES } from "../wf5/construction.mjs";

const PLOT_SECONDS = 4.5;    // the property photo -- the thing being sold
const NEARBY_SECONDS = 5.5;  // a list, so it needs reading time
const DETAIL_SECONDS = 5.0;
const CONTACT_SECONDS = 5.5; // the closing plate, held long enough to write a number down

export class StoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StoryError";
    this.code = code;
  }
}

/** Flatten the grouped Places result into the rows the location card draws. */
function nearbyRows(nearby, limit = 5) {
  const rows = [];
  for (const group of nearby?.groups ?? []) {
    for (const place of group.places ?? []) {
      rows.push({ name: place.name, distance_text: place.distance_text, category: group.category });
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

/**
 * Build the film.
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {object} input.listing        row from content/listings.json
 * @param {string} [input.photo]        path to the property photo (the "รูป input")
 * @param {string} [input.aspect]
 * @param {number} [input.minDuration]  narration length, so the picture outlasts it
 * @param {string[]} [input.scenes]     override the running order
 * @param {string} [input.constructionDetails]  free text for the construction scene's
 *                                               image prompt -- a scene description, not
 *                                               sales copy; listing.highlights is not used
 *                                               here (see caption / scriptFromListing instead)
 * @returns {{file, duration, aspect, scenes, geo, cost_usd, skipped}}
 */
export async function runStory(input, options = {}) {
  const {
    property_id,
    listing = {},
    photo,
    aspect = "9:16",
    minDuration = 0,
    scenes = ["space", "plot", "nearby", "detail", "contact"],
  } = input ?? {};

  const dims = ASPECTS[aspect];
  if (!dims) throw new StoryError("ERR_STORY_INPUT", `aspect ไม่รองรับ: ${aspect}`);
  if (!property_id) throw new StoryError("ERR_STORY_INPUT", "ต้องมี property_id");

  const address = listing.location ?? input.raw_address;
  if (!address) throw new StoryError("ERR_STORY_INPUT", "ต้องมีที่ตั้งของแปลง");

  await ensureDirs();
  const stamp = Date.now();
  const built = [];
  const skipped = [];
  let cost = 0;

  // Geocode once. The pin drives the descent AND the nearby lookup, so doing it twice
  // would be two charges for the same answer and a chance for them to disagree.
  const geoOut = await runGoogleEngine(
    { property_id, raw_address: address, nearby_radius_m: 5000 },
    { ...options, googleMapsApiKey: (options.env ?? process.env).GOOGLE_MAPS_API_KEY }
  );
  const geo = geoOut.geo_location;
  cost += 0.005;

  let plate = null; // closest satellite frame, reused as the backdrop for card scenes

  // The descent is the only scene that can stretch, so it absorbs whatever the fixed
  // scenes do not cover. Handing it a flat fraction of the narration leaves the film
  // short whenever the card scenes are present, and the render's final composite would
  // then cut the closing sentences -- the price and the phone number.
  //
  // construction has to be counted here too even though it runs later in this function:
  // it was left out before, so its ~12s was never part of the budget at all, and total
  // film length silently exceeded minDuration by exactly construction's duration on every
  // --construction run. That only looked harmless because render-engine used to have a
  // -shortest flag papering over it by truncating the tail instead -- which is what was
  // actually cutting the contact card. Now that -shortest is gone, an unbudgeted 12s here
  // just means 12s of extra silent tail after the narration ends, so it still has to be
  // counted for the space scene to size itself sensibly.
  const fixedSeconds =
    (scenes.includes("plot") && photo ? PLOT_SECONDS : 0) +
    (scenes.includes("construction") ? estimateSceneDuration(CONSTRUCTION_STAGES.length) : 0) +
    (scenes.includes("nearby") ? NEARBY_SECONDS : 0) +
    (scenes.includes("detail") ? DETAIL_SECONDS : 0) +
    (scenes.includes("contact") ? CONTACT_SECONDS : 0);
  const spaceNeeds = Math.max(0, minDuration - fixedSeconds);

  // ---- นอกโลก -> หมุด -> ภาพดาวเทียม -> แปลง ----
  if (scenes.includes("space")) {
    const mz = await runMapZoom(
      { property_id, geo, aspect, minDuration: spaceNeeds },
      options
    );
    built.push({ scene: "space", file: mz.file, seconds: mz.duration });
    plate = mz.closest_frame;
    cost += mz.cost_usd;
  }

  // ---- ซูมมาที่แปลง: the photo the seller actually supplied ----
  if (scenes.includes("plot")) {
    let usable = photo;
    if (usable) {
      try {
        await access(usable);
      } catch {
        usable = null;
      }
    }
    if (!usable) {
      // Never substitute stock imagery for the parcel being sold; the descent already
      // showed the real ground, so dropping this beat is honest and the film still works.
      skipped.push({ scene: "plot", reason: photo ? `ไม่พบไฟล์รูป ${photo}` : "ไม่ได้ส่งรูปแปลงมา" });
    } else {
      const out = path.join(TEMP_DIR, `sc_plot_${stamp}.mp4`);
      await pushIn(usable, out, dims, PLOT_SECONDS, { from: 1.0, to: 1.1 });
      built.push({ scene: "plot", file: out, seconds: PLOT_SECONDS });
    }
  }

  // ---- ก่อสร้าง: the only beat that needs a generative model ----
  //
  // Stills plus crossfades, not generated video -- see construction-engine.mjs for why.
  // A missing balance or a failed generation drops the beat and says so rather than
  // failing the whole film; everything around it is already paid for and usable.
  if (scenes.includes("construction")) {
    try {
      const cons = await runConstructionScene(
        {
          property_id,
          landImageBase64: input.landImageBase64,
          styleTag: listing.style_tag,
          // Explicit opt-in only -- listing.highlights ("ติดถนนลาดยาง" etc.) is sales
          // copy, not a scene description, and belongs in the caption / voiceover script
          // (scriptFromListing() in src/cli/render.mjs already speaks it), not stuffed
          // into the image prompt where it would just add noise the model can't act on.
          details: input.constructionDetails,
          aspect,
        },
        options
      );
      built.push({ scene: "construction", file: cons.file, seconds: cons.duration });
      cost += cons.cost_usd;
    } catch (err) {
      skipped.push({ scene: "construction", reason: err.message });
    }
  }

  // ---- สถานที่ใกล้เคียง ----
  const rows = nearbyRows(geoOut.nearby);
  if (scenes.includes("nearby")) {
    if (!rows.length || !plate) {
      skipped.push({ scene: "nearby", reason: rows.length ? "ไม่มีภาพพื้นหลัง" : "ไม่พบสถานที่ใกล้เคียง" });
    } else {
      const card = await renderLocationCard({
        width: dims.w, height: dims.h, places: rows,
        headline: "ทำเลรอบแปลง",
        subheadline: listing.location ?? "",
      });
      const out = path.join(TEMP_DIR, `sc_near_${stamp}.mp4`);
      await cardOverImage(plate, card, out, dims, NEARBY_SECONDS);
      built.push({ scene: "nearby", file: out, seconds: NEARBY_SECONDS });
    }
  }

  // ---- ข้อมูลดีเทล: the same card the film closes on, shown early without the phone ----
  if (scenes.includes("detail")) {
    if (!plate) {
      skipped.push({ scene: "detail", reason: "ไม่มีภาพพื้นหลัง" });
    } else {
      const card = await renderEndingCard({
        width: dims.w, height: dims.h,
        badge: "รายละเอียดแปลง",
        title: listing.title ?? "",
        size_text: listing.size_text ?? "",
        price_text: listing.price_text ?? "สอบถามราคา",
        phone: "",
        line_id: "",
      });
      const out = path.join(TEMP_DIR, `sc_detail_${stamp}.mp4`);
      await cardOverImage(plate, card, out, dims, DETAIL_SECONDS);
      built.push({ scene: "detail", file: out, seconds: DETAIL_SECONDS });
    }
  }

  // ---- ป้ายติดต่อกลับ: its own beat, not an overlay ----
  //
  // Render Engine can stamp an ending card over the last six seconds, but that lands on
  // top of the detail scene and the two cards stack. The running order asks for detail
  // and contact as separate beats, so the closing plate is built here and the caller
  // leaves ending_card unset.
  if (scenes.includes("contact")) {
    if (!plate) {
      skipped.push({ scene: "contact", reason: "ไม่มีภาพพื้นหลัง" });
    } else {
      const card = await renderEndingCard({
        width: dims.w, height: dims.h,
        badge: "เจ้าของขายเอง",
        title: listing.title ?? "",
        size_text: listing.size_text ?? "",
        price_text: listing.price_text ?? "สอบถามราคา",
        phone: listing.contact ?? "",
        line_id: input.line_id ?? "@244raxjb",
      });
      const out = path.join(TEMP_DIR, `sc_contact_${stamp}.mp4`);
      await cardOverImage(plate, card, out, dims, CONTACT_SECONDS, { dim: 0.55 });
      built.push({ scene: "contact", file: out, seconds: CONTACT_SECONDS });
    }
  }

  if (!built.length) {
    throw new StoryError("ERR_STORY_EMPTY", `ไม่มีฉากที่สร้างได้: ${skipped.map((s) => s.reason).join(" · ")}`);
  }

  // Scenes come from different sources, so normalise before concatenating -- the concat
  // demuxer copies streams and mismatched ones join into a file that plays wrong.
  const normalised = [];
  for (const [i, b] of built.entries()) {
    const n = path.join(TEMP_DIR, `sc_n_${stamp}_${i}.mp4`);
    await ffmpeg([
      "-i", b.file,
      "-vf", `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,` +
             `pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`,
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", n,
    ]);
    normalised.push(n);
  }

  const listFile = path.join(TEMP_DIR, `story_${stamp}.txt`);
  await writeFile(listFile, normalised.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));

  const out = path.join(OUTPUT_DIR, `${property_id}_story_${stamp}_${aspect.replace(":", "_")}.mp4`);
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);

  return {
    file: out,
    duration: (await probeDuration(out)) ?? 0,
    aspect,
    scenes: built.map((b) => ({ scene: b.scene, seconds: Number(b.seconds.toFixed(1)) })),
    skipped,
    nearby: geoOut.nearby?.highlight_lines ?? [],
    geo,
    cost_usd: Number(cost.toFixed(4)),
  };
}
