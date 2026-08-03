// FFmpeg runner. Installed via the ffmpeg-static npm package rather than Homebrew
// because no sudo was available -- same binary, no system changes.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, "../..");
export const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
export const TEMP_DIR = path.join(PROJECT_ROOT, "output", ".tmp");

// Thai needs a font with proper complex-script shaping. drawtext renders combining
// vowels and tone marks in the wrong place because it does no shaping, so all text in
// this pipeline goes through libass (the `subtitles` filter) instead.
export const THAI_FONT_FILE = "/System/Library/Fonts/Supplemental/Sathu.ttf";
export const THAI_FONT_NAME = "Sathu";

export async function ensureDirs() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });
}

export async function ffmpeg(args, { timeoutMs = 300_000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(ffmpegPath, ["-hide_banner", "-y", ...args], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 20,
    });
    return { stdout, stderr };
  } catch (err) {
    // FFmpeg puts the useful diagnosis in the last few stderr lines; the rest is noise.
    const tail = String(err.stderr || err.message).trim().split("\n").slice(-6).join("\n");
    throw new Error(`FFmpeg failed: ${tail}`);
  }
}

export async function probeDuration(file) {
  // ffprobe is not bundled with ffmpeg-static, so read the duration off ffmpeg's own
  // stderr report instead of adding another dependency. Note that `-f null -` normally
  // SUCCEEDS, so the duration has to be parsed from the success path as well -- reading
  // it only in catch() silently returns null for every healthy file.
  const parse = (text) => {
    const m = String(text ?? "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  };
  try {
    const { stderr } = await execFileAsync(
      ffmpegPath,
      ["-hide_banner", "-i", file, "-f", "null", "-"],
      { maxBuffer: 1024 * 1024 * 10 }
    );
    return parse(stderr);
  } catch (err) {
    return parse(err.stderr);
  }
}

export async function downloadTo(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ดาวน์โหลดไฟล์ไม่สำเร็จ (HTTP ${res.status})`);
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}

export async function cleanTemp() {
  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(TEMP_DIR, { recursive: true });
}

/** Escape a value for use inside an FFmpeg filtergraph argument. */
export function escapeFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export const ASPECTS = {
  "9:16": { w: 1080, h: 1920, label: "แนวตั้ง (Reels/TikTok/Shorts)" },
  "16:9": { w: 1920, h: 1080, label: "แนวนอน (Facebook/YouTube)" },
};
