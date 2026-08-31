// Google Veo 3.1 via fal.ai -- the first-and-last-frame endpoint.
//
// This is the only route found that satisfies the spec's master rule (FINAL FRAME = NEXT
// FIRST FRAME) *and* has an API. Google Flow can do it but is a browser app with no API, so
// it cannot be driven from here; Veo through the Higgsfield connector takes a start frame
// only, which breaks the handoff the whole 3-WF chain rests on. fal's
// `veo3.1/first-last-frame-to-video` takes both.
//
// Contract confirmed against fal's own docs rather than assumed:
//   POST   https://queue.fal.run/{model}                              -> { request_id, ... }
//   GET    https://queue.fal.run/{model}/requests/{id}/status         -> IN_QUEUE|IN_PROGRESS|COMPLETED
//   GET    https://queue.fal.run/{model}/requests/{id}                -> { video: { url } }
//   Authorization: Key <FAL_KEY>
// Inputs are `first_frame_url` / `last_frame_url`, and fal accepts data URIs there, so the
// local plates go inline -- no file-hosting step, and nothing of the customer's is left on a
// CDN. They are re-encoded to JPEG first because a data URI carries the whole payload in the
// request body and the PNG plates are megabytes.
import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { ffmpeg, ensureDirs, TEMP_DIR } from "../lib/ffmpeg.mjs";

const QUEUE = "https://queue.fal.run";
const MODEL = "fal-ai/veo3.1/first-last-frame-to-video";

// Veo 3.1 offers 4s, 6s or 8s -- there is no 10s. Asking for anything else is rejected, so
// the nearest allowed value is chosen and reported rather than passed through blindly.
const DURATIONS = [4, 6, 8];

const POLL_MS = Number(process.env.FAL_POLL_MS ?? 5_000);
const TIMEOUT_MS = Number(process.env.FAL_TIMEOUT_MS ?? 600_000);

// fal bills per second of output; 8s of Veo 3.1 at 720p is about this. Reported as an
// estimate -- the real charge shows up on the fal dashboard, not in the response.
const COST_PER_SECOND_USD = 0.05;

export class FalAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FalAdapterError";
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function nearestDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return 8;
  return DURATIONS.reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), DURATIONS[0]);
}

/**
 * Turn whatever the caller has -- a path, raw base64, or a data URI -- into a data URI small
 * enough to sit in a JSON body.
 */
async function toDataUri(src, label) {
  if (!src) throw new FalAdapterError("ERR_PROV_INPUT", `ไม่มีภาพสำหรับ ${label}`);
  if (/^https?:\/\//.test(src)) return src; // already hosted; fal fetches it itself

  await ensureDirs();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const srcFile = path.join(TEMP_DIR, `fal_${label}_${stamp}.in`);

  if (src.startsWith("data:image/")) {
    const b64 = src.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    await writeFile(srcFile, Buffer.from(b64, "base64"));
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(src) && src.length > 512) {
    await writeFile(srcFile, Buffer.from(src, "base64"));
  } else {
    // A filesystem path.
    await copyFile(src, srcFile);
  }

  const jpg = path.join(TEMP_DIR, `fal_${label}_${stamp}.jpg`);
  await ffmpeg(["-i", srcFile, "-q:v", "3", "-y", jpg]);
  return `data:image/jpeg;base64,${(await readFile(jpg)).toString("base64")}`;
}

export class FalVeoAdapter {
  constructor(config = {}) {
    this.providerName = "FAL_VEO31";
    this.apiKey = config.apiKey ?? process.env.FAL_KEY ?? process.env.FAL_API_KEY;
    this.model = config.model ?? MODEL;
    this.resolution = config.resolution ?? process.env.FAL_RESOLUTION ?? "1080p";
    this.aspectRatio = config.aspectRatio ?? "9:16";
  }

  #headers() {
    if (!this.apiKey) {
      throw new FalAdapterError(
        "ERR_PROV_NO_KEY",
        "ไม่มี FAL_KEY ใน .env — สมัครที่ fal.ai แล้วใส่ FAL_KEY=... (คนละตัวกับ Google AI Plus)"
      );
    }
    return { Authorization: `Key ${this.apiKey}`, "Content-Type": "application/json" };
  }

  async #request(url, init = {}) {
    const res = await fetch(url, { ...init, headers: { ...this.#headers(), ...(init.headers ?? {}) } });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new FalAdapterError("ERR_PROV_04", `fal ตอบกลับผิดรูปแบบ (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const detail = body?.detail ?? body?.error ?? JSON.stringify(body).slice(0, 200);
      throw new FalAdapterError(
        res.status === 401 || res.status === 403 ? "ERR_PROV_NO_KEY" : "ERR_PROV_04",
        `fal ปฏิเสธคำขอ (HTTP ${res.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      );
    }
    return body;
  }

  /**
   * Same shape the registry's other video engines expose, so this drops in behind
   * VIDEO_ENGINE without any caller knowing which vendor answered.
   *
   * `camera_motion` is accepted and ignored: Veo takes its direction from the prompt and the
   * two anchor frames, and the end frame already fixes where the camera finishes.
   */
  async imageToVideo({ image, image_tail, prompt, duration_seconds = 8 }) {
    if (!image_tail) {
      throw new FalAdapterError(
        "ERR_PROV_04",
        "endpoint นี้ต้องมีทั้งเฟรมแรกและเฟรมจบ — ถ้ามีเฟรมแรกอย่างเดียวให้ใช้ provider อื่น"
      );
    }
    // Before any file work: a missing key otherwise surfaces as an ENOENT from the image
    // conversion, which points at the wrong thing entirely.
    this.#headers();

    const startedAt = Date.now();
    const duration = nearestDuration(duration_seconds);

    const [first, last] = await Promise.all([
      toDataUri(image, "first"),
      toDataUri(image_tail, "last"),
    ]);

    const submitted = await this.#request(`${QUEUE}/${this.model}`, {
      method: "POST",
      body: JSON.stringify({
        prompt,
        first_frame_url: first,
        last_frame_url: last,
        aspect_ratio: this.aspectRatio,
        duration: `${duration}s`,
        resolution: this.resolution,
        // The film gets its own voiceover and music downstream; a model-invented soundtrack
        // would have to be stripped again.
        generate_audio: false,
      }),
    });

    const requestId = submitted?.request_id;
    if (!requestId) {
      throw new FalAdapterError("ERR_PROV_04", `fal ไม่ได้คืน request_id: ${JSON.stringify(submitted).slice(0, 200)}`);
    }

    const statusUrl = `${QUEUE}/${this.model}/requests/${requestId}/status`;
    const resultUrl = `${QUEUE}/${this.model}/requests/${requestId}`;
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_MS);
      const st = await this.#request(statusUrl, { method: "GET" });
      if (st.status === "COMPLETED") break;
      if (st.error || st.status === "FAILED") {
        throw new FalAdapterError("ERR_PROV_04", `fal ทำงานล้มเหลว: ${st.error ?? st.error_type ?? "ไม่ทราบสาเหตุ"}`);
      }
    }
    if (Date.now() >= deadline) {
      throw new FalAdapterError("ERR_PROV_TIMEOUT", `fal ไม่เสร็จภายใน ${TIMEOUT_MS / 1000} วินาที`);
    }

    const out = await this.#request(resultUrl, { method: "GET" });
    const url = out?.video?.url;
    if (!url) {
      throw new FalAdapterError("ERR_PROV_04", `fal ไม่ได้คืน video.url: ${JSON.stringify(out).slice(0, 200)}`);
    }

    return {
      provider_used: this.providerName,
      status: "SUCCESS",
      result: {
        video_url: url,
        duration_seconds: duration,
        fps: 30,
        resolution: this.resolution,
      },
      cost_is_estimate: true,
      cost_usd: Number((duration * COST_PER_SECOND_USD).toFixed(4)),
      duration_ms: Date.now() - startedAt,
      request_id: requestId,
    };
  }

  async generateImage() {
    throw new FalAdapterError(
      "ERR_PROV_04",
      "adapter นี้ทำได้เฉพาะวิดีโอ first+last frame — ใช้ image engine ตัวอื่นสำหรับสร้างภาพ"
    );
  }
}

export function falProvider(config = {}) {
  return new FalVeoAdapter(config);
}
