// FFmpeg runner. Installed via the ffmpeg-static npm package rather than Homebrew
// because no sudo was available -- same binary, no system changes.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, rm, readdir, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
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
//
// The font is SHIPPED WITH THE REPO rather than looked up in the system. The previous
// value was an absolute macOS path (/System/Library/Fonts/.../Sathu.ttf) which simply
// does not exist on Linux, so every render on Railway was silently falling back to
// whatever libass could find -- usually a font with no Thai coverage, which is how you
// get tofu boxes in a finished clip nobody re-checked. A bundled family renders the same
// on a laptop and in a container.
export const FONT_DIR = path.join(PROJECT_ROOT, "assets", "fonts");
export const THAI_FONT_FILE = path.join(FONT_DIR, "Prompt-Regular.ttf");
export const THAI_FONT_NAME = "Prompt";
/** Weight -> bundled file, for callers that embed a specific face (SVG, @font-face). */
export const THAI_FONT_FILES = {
  regular: path.join(FONT_DIR, "Prompt-Regular.ttf"),
  medium: path.join(FONT_DIR, "Prompt-Medium.ttf"),
  semibold: path.join(FONT_DIR, "Prompt-SemiBold.ttf"),
  bold: path.join(FONT_DIR, "Prompt-Bold.ttf"),
};

/**
 * Make the bundled family visible to sharp's SVG renderer.
 *
 * libass takes a `fontsdir` and reads our .ttf straight from the repo, but sharp's
 * renderer resolves fonts by NAME through fontconfig and offers no equivalent: it ignores
 * FONTCONFIG_FILE/FONTCONFIG_PATH in this build, and it ignores an @font-face carrying
 * the font as a data URI (both checked). The only thing it honours is a font installed
 * where fontconfig already looks -- so the fonts are copied there once, on first render.
 *
 * Idempotent and non-fatal: a read-only home directory means the cards fall back down the
 * stack in svg-card.mjs rather than the whole render failing.
 */
let fontsReady = null;
export async function ensureFontsInstalled() {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    const dest = process.platform === "darwin"
      ? path.join(homedir(), "Library", "Fonts")
      : path.join(homedir(), ".local", "share", "fonts");
    try {
      await mkdir(dest, { recursive: true });
      const files = (await readdir(FONT_DIR)).filter((f) => f.endsWith(".ttf"));
      let copied = 0;
      for (const f of files) {
        const target = path.join(dest, f);
        try {
          await access(target);
        } catch {
          await copyFile(path.join(FONT_DIR, f), target);
          copied++;
        }
      }
      // fontconfig on Linux serves from a cache; a font dropped in after the cache was
      // built is invisible until it is refreshed.
      if (copied && process.platform !== "darwin") {
        await execFileAsync("fc-cache", ["-f", dest]).catch(() => {});
      }
      return { dest, copied, total: files.length };
    } catch (err) {
      return { dest, copied: 0, error: err.message };
    }
  })();
  return fontsReady;
}

export async function ensureDirs() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });
  await ensureFontsInstalled();
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
