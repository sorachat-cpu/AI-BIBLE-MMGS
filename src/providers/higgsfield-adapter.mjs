// Google Gemini Omni Flash 1.1 via the official `@higgsfield/cli` -- NOT a hand-rolled REST
// client, and NOT the Higgsfield MCP connector this session also has separate access to.
//
// Why a CLI wrapper instead of calling api.higgsfield.ai directly (what fal-adapter.mjs and
// kling-adapter.mjs both do): this model's real request/response contract turned out to be
// unreachable by guessing. HIGGSFIELD_KEY_ID/SECRET auth against api.higgsfield.ai returns a
// generic {"detail":"model_not_found"} for ANY unrecognized path segment -- roughly a dozen
// plausible endpoint paths were tried and all 404'd the same way, so the response can't even
// distinguish "wrong model slug" from "wrong route shape". Pulling the strings out of the
// CLI's own compiled binary found the real backend it talks to
// (https://fnf-api-gw.higgsfield.ai/fnf, routes like /developer/v2alpha/jobs and
// /developer/v2alpha/media) -- but that gateway requires an X-Fnf-Surface header whose valid
// values aren't in the CLI's help text or public docs, and rejects Key-pair auth outright in
// favor of the CLI's own OAuth session. In other words: this account's HIGGSFIELD_KEY_ID/
// SECRET pair (from cloud.higgsfield.ai) and the CLI's OAuth login are two different auth
// systems that don't appear to reach the same public entry point for this model.
//
// The CLI itself IS confirmed working end to end on this machine: `higgsfield auth login`,
// `higgsfield model get gemini_omni_flash_1_1 --json` (confirms mode/media param names and
// validation rules), and `higgsfield generate cost ... --start-image <real file>` (confirms
// the upload-and-validate path actually round-trips) all succeeded. So this adapter shells
// out to that CLI rather than pretending to know the raw HTTP contract.
//
// Practical requirement this creates: wherever this code runs needs the `higgsfield` binary
// on PATH (npm i -g @higgsfield/cli) AND an already-completed `higgsfield auth login` (its
// OAuth flow opens a browser -- there is no headless/API-key login mode found in the CLI).
// That's fine on a workstation; it is a real gap for an unattended Railway deploy, which has
// no browser to complete OAuth in. Until Higgsfield documents a service-account/API-key path
// into the same gateway, VIDEO_ENGINE=higgsfield only works where someone has run
// `higgsfield auth login` on that exact machine first.
//
// Why this model for WF1 specifically: WF1's own spec (wf/WF1.md) has one hard rule --
// "FRAME END ของ WF1 = FRAME START ของ WF2" -- the clip MUST land on the seller's exact real
// land photo, not something the model invented. Confirmed via `model get`: mode
// "image-to-video" "requires start_image, accepts an optional end_image" -- i.e. this model
// takes both anchors as hard frames, same shape as fal's veo3.1/first-last-frame-to-video.
// (mode "reference-to-video" is a different, unrelated concept -- it explicitly REJECTS
// start_image/end_image and wants image_references/video_references instead. Do not use it
// here even though the name sounds closer to "give it reference photos".)
//
// ⚠️ Credits: this account has 10 free-trial credits; `generate cost` reports this model
// needs 24 per generation. A real end-to-end call isn't affordable on this account as-is --
// code-level correctness here is as far as it's been possible to verify without a top-up.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDirs, TEMP_DIR } from "../lib/ffmpeg.mjs";

const execFileAsync = promisify(execFile);

const JOB_TYPE = "gemini_omni_flash_1_1";
const CLI_BIN = process.env.HIGGSFIELD_CLI_BIN ?? "higgsfield";
// Model's own enum per `model get`: 360p | 720p | 1080p | 4k (default 720p). 1080p matches
// every other video engine in this registry.
const RESOLUTION = process.env.HIGGSFIELD_RESOLUTION ?? "1080p";
const WAIT_TIMEOUT = process.env.HIGGSFIELD_WAIT_TIMEOUT ?? "10m";
const WAIT_INTERVAL = process.env.HIGGSFIELD_WAIT_INTERVAL ?? "5s";

export class HiggsfieldAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "HiggsfieldAdapterError";
    this.code = code;
  }
}

/**
 * The CLI's media flags take a UUID (an upload/job id) or a local file path -- paths are
 * auto-uploaded by the CLI itself. It does NOT accept a bare http(s) URL or an inline data
 * URI, so remote/inline sources have to be materialized to a local file first; a source
 * that's already a local path is returned untouched.
 */
async function toLocalFile(src, label) {
  if (!src) throw new HiggsfieldAdapterError("ERR_PROV_INPUT", `ไม่มีภาพสำหรับ ${label}`);

  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) {
      throw new HiggsfieldAdapterError(
        "ERR_PROV_INPUT", `โหลดภาพ ${label} ไม่สำเร็จ (HTTP ${res.status}): ${src}`
      );
    }
    return writeLocal(label, Buffer.from(await res.arrayBuffer()));
  }

  if (src.startsWith("data:image/")) {
    const b64 = src.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    return writeLocal(label, Buffer.from(b64, "base64"));
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(src) && src.length > 512) {
    return writeLocal(label, Buffer.from(src, "base64"));
  }

  return src; // already a local path
}

async function writeLocal(label, buffer) {
  await ensureDirs();
  const file = path.join(TEMP_DIR, `hf_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`);
  await writeFile(file, buffer);
  return file;
}

/** `--json` on a job that runs through `--wait` can print more than one JSON value (progress
 * updates, then the final job) -- parse the whole thing first, then fall back to the last
 * line that parses as JSON. */
function parseLastJson(text, cliBin) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through to line scan */ }
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch { /* keep scanning backward */ }
  }
  throw new HiggsfieldAdapterError(
    "ERR_PROV_04", `แยก JSON จาก ${cliBin} ไม่ได้: ${trimmed.slice(0, 500)}`
  );
}

/** Result field names for `generate create --wait --json` aren't confirmed (no past job to
 * sample -- see file header) -- search recursively for a plausible result field, then for
 * any URL that looks like a video file, rather than betting on one exact key. */
function findResultUrl(node, seen = new Set()) {
  if (!node || typeof node !== "object" || seen.has(node)) return null;
  seen.add(node);
  for (const key of ["video_url", "url", "output_url", "asset_url"]) {
    if (typeof node[key] === "string" && /^https?:\/\//.test(node[key])) return node[key];
  }
  for (const value of Object.values(node)) {
    if (typeof value === "string" && /^https?:\/\/\S+\.(mp4|mov|webm)(\?\S*)?$/i.test(value)) return value;
    if (value && typeof value === "object") {
      const found = findResultUrl(value, seen);
      if (found) return found;
    }
  }
  return null;
}

export class HiggsfieldOmniAdapter {
  constructor(config = {}) {
    this.providerName = "HIGGSFIELD_GEMINI_OMNI_FLASH_1_1";
    this.cliBin = config.cliBin ?? CLI_BIN;
    this.resolution = config.resolution ?? RESOLUTION;
    this.waitTimeout = config.waitTimeout ?? WAIT_TIMEOUT;
    this.waitInterval = config.waitInterval ?? WAIT_INTERVAL;
  }

  async #run(args) {
    try {
      const { stdout } = await execFileAsync(this.cliBin, args, { maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    } catch (err) {
      if (err?.code === "ENOENT") {
        throw new HiggsfieldAdapterError(
          "ERR_PROV_NO_KEY",
          `ไม่พบคำสั่ง "${this.cliBin}" — ติดตั้งด้วย npm i -g @higgsfield/cli แล้ว ` +
            `higgsfield auth login ก่อน (คนละ auth กับ HIGGSFIELD_KEY_ID/SECRET — ดูคอมเมนต์บนไฟล์นี้)`
        );
      }
      const out = `${err?.stdout ?? ""}${err?.stderr ?? ""}`;
      if (/not\s*authenticated|auth login|no.{0,10}token|unauthorized/i.test(out)) {
        throw new HiggsfieldAdapterError(
          "ERR_PROV_NO_KEY", `Higgsfield CLI ยังไม่ได้ login — รัน "higgsfield auth login": ${out.slice(0, 300)}`
        );
      }
      if (/insufficient.{0,20}credit|not enough credit/i.test(out)) {
        throw new HiggsfieldAdapterError(
          "ERR_PROV_NO_CREDIT", `เครดิต Higgsfield ไม่พอ (โมเดลนี้ใช้ 24 เครดิตต่อครั้ง): ${out.slice(0, 300)}`
        );
      }
      throw new HiggsfieldAdapterError(
        "ERR_PROV_04", `Higgsfield CLI ล้มเหลว: ${(out.slice(0, 500) || err?.message) ?? "ไม่ทราบสาเหตุ"}`
      );
    }
  }

  /** Same shape every other video engine in the registry exposes -- see fal-adapter.mjs. */
  async imageToVideo({ image, image_tail, prompt, duration_seconds = 8 }) {
    if (!image) throw new HiggsfieldAdapterError("ERR_PROV_INPUT", "ต้องมีเฟรมแรกอย่างน้อยหนึ่งภาพ");

    const startedAt = Date.now();
    const startPath = await toLocalFile(image, "start");
    const duration = Math.round(Number(duration_seconds) || 8);

    const args = [
      "generate", "create", JOB_TYPE,
      "--prompt", prompt ?? "",
      // "image-to-video": the mode that "requires start_image, accepts an optional
      // end_image" per `model get` -- NOT "reference-to-video", see file header.
      "--mode", "image-to-video",
      "--start-image", startPath,
      "--duration", String(duration),
      "--resolution", this.resolution,
      "--wait", "--wait-timeout", this.waitTimeout, "--wait-interval", this.waitInterval,
      "--json",
    ];
    if (image_tail) {
      args.push("--end-image", await toLocalFile(image_tail, "end"));
    }

    const stdout = await this.#run(args);
    const job = parseLastJson(stdout, this.cliBin);
    const url = findResultUrl(job);
    if (!url) {
      throw new HiggsfieldAdapterError(
        "ERR_PROV_04", `Higgsfield CLI ไม่คืน url ผลลัพธ์ในรูปแบบที่รู้จัก: ${stdout.slice(0, 500)}`
      );
    }

    return {
      provider_used: this.providerName,
      status: "SUCCESS",
      result: { video_url: url, duration_seconds: duration, fps: 30, resolution: this.resolution },
      model_used: JOB_TYPE,
      cost_is_estimate: true,
      cost_usd: null, // Higgsfield bills in credits, not published $/sec -- see `account status`
      duration_ms: Date.now() - startedAt,
      request_id: job?.id ?? job?.job_id ?? null,
    };
  }

  async generateImage() {
    throw new HiggsfieldAdapterError(
      "ERR_PROV_04", "adapter นี้ทำได้เฉพาะวิดีโอ — ใช้ image engine ตัวอื่นสำหรับสร้างภาพ"
    );
  }
}

export function higgsfieldOmniProvider(config = {}) {
  return new HiggsfieldOmniAdapter(config);
}
