// Thai voiceover, and the subtitle cues that go with it.
//
// The two are produced by one function on purpose. Subtitles that "look about right"
// against a voice track are the most common way a finished clip goes out wrong, and the
// failure is invisible until someone watches it. Here the cue timings are not estimated
// at all -- each sentence is spoken to its own file, that file is measured, and the cue
// is exactly as long as the audio. They cannot drift because nothing is guessed.
//
// This is also why there is no transcription step: we already know what was said and
// when, so running Whisper over audio we just generated would only add a way to be wrong.
// Transcription is for footage that arrives with sound already on it.
//
// macOS ships a Thai voice ("Kanya"), so this costs nothing and works offline. Swapping
// in a better TTS later means changing speak() alone -- the return shape stays.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ffmpeg, probeDuration, TEMP_DIR, OUTPUT_DIR, ensureDirs } from "./ffmpeg.mjs";

const execFileAsync = promisify(execFile);

// The finished track lives outside TEMP_DIR on purpose. Render Engine calls cleanTemp()
// as its first act, so anything left in the scratch directory is deleted between being
// generated here and being read there -- the clip then renders silently, with no error
// beyond a buried "No such file" in FFmpeg's stderr. Per-sentence intermediates can stay
// in scratch; they are consumed before the render starts.
const VOICE_DIR = path.join(OUTPUT_DIR, ".voice");

export const DEFAULT_VOICE = "Kanya"; // th_TH, ships with macOS
const SILENCE_BETWEEN_SENTENCES = 0.35;

// Everything is normalised to one PCM format before concatenation. `say` picks its own
// sample rate, and the concat demuxer joins streams byte-wise -- mismatched inputs give a
// file that plays at the wrong speed instead of failing loudly.
const PCM = ["-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le"];

export class VoiceError extends Error {
  constructor(message) {
    super(message);
    this.name = "VoiceError";
  }
}

/** Is the requested system voice actually installed? */
export async function hasVoice(voice = DEFAULT_VOICE) {
  try {
    const { stdout } = await execFileAsync("say", ["-v", "?"]);
    return stdout.split("\n").some((line) => line.trim().startsWith(voice));
  } catch {
    return false;
  }
}

/**
 * Split a script into sentences to speak one at a time.
 *
 * Thai does not put spaces between words but does use them between clauses, and writers
 * here separate thoughts with line breaks. Splitting on line breaks keeps the author in
 * control of pacing rather than having an algorithm guess where a sentence ends.
 */
export function toSentences(script) {
  return String(script ?? "")
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Speak each sentence, measure it, and return the track plus cues that match it.
 *
 * @param {string[]} sentences
 * @param {object} [opts]
 * @param {string} [opts.voice]        macOS voice name
 * @param {number} [opts.gapSeconds]   pause inserted between sentences
 * @param {number} [opts.rate]         words per minute; omit for the voice default
 * @returns {{ file: string, duration: number, cues: Array<{start,end,text}> }}
 */
export async function speakThai(sentences, opts = {}) {
  const { voice = DEFAULT_VOICE, gapSeconds = SILENCE_BETWEEN_SENTENCES, rate } = opts;
  const lines = (sentences ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!lines.length) throw new VoiceError("ไม่มีข้อความให้พูด");

  if (!(await hasVoice(voice))) {
    throw new VoiceError(
      `ไม่พบเสียง "${voice}" ในเครื่อง\n` +
        `   ดูรายชื่อเสียงที่มี: say -v '?'\n` +
        `   เสียงไทยของ macOS ติดตั้งเพิ่มได้ที่ System Settings > Accessibility > Spoken Content`
    );
  }

  await ensureDirs();
  await mkdir(VOICE_DIR, { recursive: true });
  const stamp = Date.now();
  const segments = [];
  const cues = [];
  let clock = 0;

  for (const [i, text] of lines.entries()) {
    const aiff = path.join(TEMP_DIR, `say_${stamp}_${i}.aiff`);
    // The line is handed over as a file rather than an argument. A script written with
    // dash bullets is natural here (the listing highlights read that way), and as an
    // argument `say` would parse the leading "-" as an option and reject the line.
    const src = path.join(TEMP_DIR, `say_${stamp}_${i}.txt`);
    await writeFile(src, text, "utf8");
    const args = ["-v", voice, "-o", aiff, "-f", src];
    if (rate) args.push("-r", String(rate));
    try {
      // execFile, never a shell: the text is Thai copy that may contain quotes.
      await execFileAsync("say", args);
    } catch (err) {
      throw new VoiceError(`สร้างเสียงประโยคที่ ${i + 1} ไม่สำเร็จ: ${err.message}`);
    }

    const wav = path.join(TEMP_DIR, `seg_${stamp}_${i}.wav`);
    await ffmpeg(["-i", aiff, ...PCM, wav]);

    const duration = await probeDuration(wav);
    if (!duration) throw new VoiceError(`วัดความยาวเสียงประโยคที่ ${i + 1} ไม่ได้`);

    cues.push({ start: round(clock), end: round(clock + duration), text });
    segments.push(wav);
    clock += duration;

    // The gap belongs between sentences only; trailing silence would push the clip
    // length past the last spoken word for no reason.
    if (i < lines.length - 1) clock += gapSeconds;
  }

  // Interleave a silence file between segments. Built as a new array rather than by
  // clearing and refilling `segments` -- that aliases the same array and wipes the
  // sources before they are read back.
  const parts = [];
  let silence = null;
  if (gapSeconds > 0 && segments.length > 1) {
    silence = path.join(TEMP_DIR, `gap_${stamp}.wav`);
    await ffmpeg([
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t", String(gapSeconds), ...PCM, silence,
    ]);
  }
  segments.forEach((seg, i) => {
    parts.push(seg);
    if (silence && i < segments.length - 1) parts.push(silence);
  });

  const listFile = path.join(TEMP_DIR, `voice_${stamp}.txt`);
  await writeFile(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

  const out = path.join(VOICE_DIR, `voice_${stamp}.m4a`);
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "aac", "-b:a", "160k", out]);

  const duration = (await probeDuration(out)) ?? clock;
  return { file: out, duration: round(duration), cues };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
