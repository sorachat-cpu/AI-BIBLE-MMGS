// Render Engine (12_RENDER_ENGINE.md) -- WF5 steps 5.6, 5.7, 5.8 plus the overlay cards
// added by WF5-fix §2.
//
// This is the only stage allowed to put words, prices, phone numbers or branding on
// screen. Everything upstream stays deliberately text-free so that correcting a typo or
// a price costs one re-composite here (~$0.01) instead of regenerating AI video (~$0.16+).
//
// WF5-fix §2 changed how the cards work: they are now COMPOSITED OVER the running video
// with enable='between(t,a,b)', not appended as separate still segments. The footage keeps
// playing behind the card, which is what the reference clip does.
//
// Hard rule from the spec, enforced by construction: this file never calls a generative
// AI API. It only shells out to FFmpeg.
import { writeFile, access } from "node:fs/promises";
import path from "node:path";
import {
  ffmpeg, downloadTo, ensureDirs, cleanTemp, escapeFilterPath, probeDuration,
  OUTPUT_DIR, TEMP_DIR, ASPECTS,
} from "../lib/ffmpeg.mjs";
import { buildSubtitleAss } from "../lib/ass.mjs";
import { renderLocationCard, renderEndingCard } from "../lib/svg-card.mjs";
import { renderQrPng } from "./overlay-engine.mjs";

export class RenderEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FPS = 30;
const ENDING_CARD_SECONDS = 6;   // WF5 5.8 asks for 5-8 seconds
const LOCATION_CARD_SECONDS = 5; // WF5-fix §2.1: mid-clip

async function normaliseClip(input, output, { w, h }) {
  await ffmpeg([
    "-i", input,
    "-f", "lavfi", "-t", "60", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-shortest",
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    output,
  ]);
  return output;
}

/**
 * @param {object} input
 * @param {Array<{video_url?:string, file?:string}>} input.clips
 * @param {Array<{start,end,text}>} [input.subtitles]      step 5.6
 * @param {string} [input.music_url] [input.voiceover_url] step 5.7, fetched over HTTP
 * @param {string} [input.music_file] [input.voiceover_file] same, already on disk
 * @param {object} [input.location_card]  {places, headline, ...}   WF5-fix §2.1
 * @param {object} [input.ending_card]    {badge, price_text, ...}  WF5-fix §2.2
 * @param {string[]} [input.aspects]
 */
export async function runRenderEngine(input, _options = {}) {
  const {
    property_id,
    clips = [],
    subtitles = [],
    music_file,
    voiceover_file,
    music_url,
    voiceover_url,
    location_card,
    ending_card,
    aspects = ["9:16", "16:9"],
  } = input ?? {};

  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new RenderEngineError("ERR_RND_INPUT", "property_id missing or malformed");
  }
  if (!clips.length) throw new RenderEngineError("ERR_RND_INPUT", "ต้องมีอย่างน้อยหนึ่งคลิป");
  for (const a of aspects) {
    if (!ASPECTS[a]) throw new RenderEngineError("ERR_RND_INPUT", `aspect ไม่รองรับ: ${a}`);
  }

  await ensureDirs();
  await cleanTemp();
  const stamp = Date.now();
  const steps = [];
  const outputs = [];

  // ---- pull every source local first ----
  const localClips = [];
  for (const [i, clip] of clips.entries()) {
    try {
      if (clip.file) localClips.push(clip.file);
      else localClips.push(await downloadTo(clip.video_url, path.join(TEMP_DIR, `src_${i}.mp4`)));
    } catch (err) {
      throw new RenderEngineError("ERR_RND_01", `ดาวน์โหลดคลิปที่ ${i + 1} ไม่สำเร็จ: ${err.message}`);
    }
  }
  steps.push({ stage: "5.5 pull clips", status: "ok", detail: `ดึงคลิปมาแล้ว ${localClips.length} ไฟล์` });

  // Audio can arrive either as a URL to fetch or as a file already on disk. The local
  // form exists because the voiceover is generated here (src/lib/voice.mjs) and there is
  // nowhere to serve it from; downloadTo() is an HTTP fetch and cannot open a path.
  // A path that does not exist must degrade the same way a failed download does. Passed
  // straight to FFmpeg it kills the main encode instead, and the fallback below then
  // produces a video stripped of subtitles and cards while still reporting success.
  const usable = async (file) => {
    if (!file) return null;
    try {
      await access(file);
      return file;
    } catch {
      steps.push({ stage: "5.7 audio", status: "degraded", detail: `ไม่พบไฟล์เสียง ${file} — เรนเดอร์ต่อโดยไม่มีเสียง` });
      return null;
    }
  };
  const musicFile = (await usable(music_file)) ?? (music_url
    ? await downloadTo(music_url, path.join(TEMP_DIR, "bgm.mp3")).catch(() => null)
    : null);
  const voiceFile = (await usable(voiceover_file)) ?? (voiceover_url
    ? await downloadTo(voiceover_url, path.join(TEMP_DIR, "vo.mp3")).catch(() => null)
    : null);

  for (const aspect of aspects) {
    const dims = ASPECTS[aspect];
    const tag = aspect.replace(":", "_");

    const segments = [];
    for (const [i, src] of localClips.entries()) {
      segments.push(await normaliseClip(src, path.join(TEMP_DIR, `n_${tag}_${i}.mp4`), dims));
    }

    const listFile = path.join(TEMP_DIR, `list_${tag}.txt`);
    await writeFile(listFile, segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
    const joined = path.join(TEMP_DIR, `joined_${tag}.mp4`);
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined]);

    // Card timing depends on how long the footage actually is, so measure it.
    const duration = (await probeDuration(joined)) ?? segments.length * 5;

    // ---- build the overlay PNGs for this canvas size ----
    const overlayInputs = [];
    const overlayPlan = [];

    if (location_card?.places?.length) {
      const png = await renderLocationCard({
        width: dims.w, height: dims.h,
        places: location_card.places,
        headline: location_card.headline,
        subheadline: location_card.subheadline,
        footer: location_card.footer,
      });
      // Sits after the property has been established but before the closing card.
      const start = Math.max(1, duration * 0.35);
      overlayInputs.push(png);
      overlayPlan.push({ y: `(H-h)/2`, start, end: Math.min(start + LOCATION_CARD_SECONDS, duration - ENDING_CARD_SECONDS - 0.2) });
    }

    if (ending_card) {
      let qrFile = null;
      if (ending_card.qr_url) {
        qrFile = (await renderQrPng({ qr_target_url: ending_card.qr_url, size: 400 })).file;
      }
      const png = await renderEndingCard({
        width: dims.w, height: dims.h,
        badge: ending_card.badge,
        title: ending_card.title,
        size_text: ending_card.size_text,
        price_text: ending_card.price_text,
        phone: ending_card.contact_phone,
        line_id: ending_card.line_id,
        qrFile,
      });
      overlayInputs.push(png);
      overlayPlan.push({ y: `(H-h)/2`, start: Math.max(0, duration - ENDING_CARD_SECONDS), end: duration });
    }

    // ---- final pass: subtitles + card overlays + audio, one encode ----
    const args = ["-i", joined];
    for (const png of overlayInputs) args.push("-i", png);
    const audioIdxBase = 1 + overlayInputs.length;
    if (voiceFile) args.push("-i", voiceFile);
    if (musicFile) args.push("-i", musicFile);

    const filters = [];
    let vLabel = "0:v";

    if (subtitles.length) {
      const assPath = path.join(TEMP_DIR, `subs_${tag}.ass`);
      await writeFile(assPath, buildSubtitleAss({ width: dims.w, height: dims.h, cues: subtitles }));
      filters.push(`[${vLabel}]subtitles='${escapeFilterPath(assPath)}'[vs]`);
      vLabel = "vs";
    }

    overlayPlan.forEach((plan, i) => {
      const out = `vo${i}`;
      filters.push(
        `[${vLabel}][${i + 1}:v]overlay=(W-w)/2:${plan.y}:` +
          `enable='between(t,${plan.start.toFixed(2)},${plan.end.toFixed(2)})'[${out}]`
      );
      vLabel = out;
    });

    let aLabel = "0:a";
    if (voiceFile && musicFile) {
      // WF5 5.7: voice must sit clearly above the bed.
      filters.push(
        `[${audioIdxBase + 1}:a]volume=0.18[bgm]`,
        `[${audioIdxBase}:a]volume=1.0[vo]`,
        `[vo][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`
      );
      aLabel = "a";
    } else if (voiceFile) {
      filters.push(`[${audioIdxBase}:a]volume=1.0[a]`);
      aLabel = "a";
    } else if (musicFile) {
      filters.push(`[${audioIdxBase}:a]volume=0.25[a]`);
      aLabel = "a";
    }

    if (filters.length) args.push("-filter_complex", filters.join(";"));
    args.push("-map", vLabel === "0:v" ? "0:v" : `[${vLabel}]`, "-map", aLabel === "0:a" ? "0:a" : `[${aLabel}]`);

    // `_render_` marks this as pipeline output. Source footage from Video Engine uses the
    // same property_id/stamp/aspect shape, so without a marker a later run cannot tell
    // its own finished clips apart from raw material and re-renders them into itself.
    const outFile = path.join(OUTPUT_DIR, `${property_id}_${stamp}_render_${tag}.mp4`);
    args.push(
      "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest",
      outFile
    );

    let outW = dims.w;
    let outH = dims.h;
    let degraded = null;

    try {
      await ffmpeg(args, { timeoutMs: 600_000 });
    } catch (err) {
      // ERR_RND_02: a bare re-encode of the joined footage, so a failed composite still
      // yields a usable file. It carries NO subtitles, NO cards and NO audio -- the
      // fallback command references none of them -- so this is reported as a loss, not as
      // a smaller success. Claiming "ok" here hands back a plausible video with the whole
      // message missing, which is worse than failing.
      outW = aspect === "9:16" ? 720 : 1280;
      outH = aspect === "9:16" ? 1280 : 720;
      const lost = [
        subtitles.length ? "ซับ" : null,
        overlayPlan.length ? "การ์ด" : null,
        voiceFile || musicFile ? "เสียง" : null,
      ].filter(Boolean);
      degraded =
        `เรนเดอร์เต็มความละเอียดไม่ผ่าน ลดเหลือ ${outW}x${outH}` +
        (lost.length ? ` และ**หาย ${lost.join(" / ")}**` : "") +
        `: ${err.message}`;
      await ffmpeg([
        "-i", joined, "-vf", `scale=${outW}:${outH}`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outFile,
      ], { timeoutMs: 600_000 });
    }

    outputs.push({
      aspect_ratio: aspect,
      label: dims.label,
      file: path.basename(outFile),
      url: `/output/${path.basename(outFile)}`,
      // The real size, not the requested one -- the fallback changes it.
      resolution: `${outW}x${outH}`,
      degraded: Boolean(degraded),
      duration_seconds: Number(duration.toFixed(2)),
    });
    steps.push({
      stage: `render ${aspect}`,
      status: degraded ? "degraded" : "ok",
      detail: degraded
        ?? `${outW}x${outH} · ${segments.length} คลิป · ${overlayPlan.length} การ์ด · ${duration.toFixed(1)} วิ`,
    });
  }

  // Spec: always clean up temp files after a render job so the disk cannot fill.
  await cleanTemp();

  return {
    property_id,
    outputs,
    steps,
    render_specs: {
      fps: FPS,
      location_card_seconds: location_card?.places?.length ? LOCATION_CARD_SECONDS : 0,
      ending_card_seconds: ending_card ? ENDING_CARD_SECONDS : 0,
    },
  };
}
