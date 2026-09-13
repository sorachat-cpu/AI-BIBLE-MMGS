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
import { writeFile, readFile, mkdir } from "node:fs/promises";
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

// ---- TTS backends ---------------------------------------------------------
// Two ways to turn one sentence into one audio file. Which one runs is decided by
// whether ELEVENLABS_API_KEY exists, not by a flag the caller passes -- the deciding
// factor is the deployment, not the request: macOS `say` does not exist on Linux, so a
// container has exactly one working option and picking it automatically is what lets the
// same code path serve both the laptop and Railway.
//
// Both return a PCM wav at the same sample rate, because everything downstream
// (concatenation, cue timing) measures real audio and must not care which produced it.
// eleven_multilingual_v2 covers 29 languages and THAI IS NOT ONE OF THEM. It does not
// reject Thai text -- it approximates it with phonemes from languages it does know, which
// is why the output was reported as sounding like Khmer rather than Thai. turbo_v2_5 is
// the 32-language model whose additions include Thai, so that is the default now.
//
// Note the API returns 200 for every model regardless of the language, so "the request
// worked" is not evidence the pronunciation is right; only listening is.
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5";
// Thai is tonal and dense; at full rate the model runs syllables together and the tones
// stop being distinguishable. Slower is materially more intelligible here, so the default
// is below 1.0 rather than at it.
const ELEVEN_SPEED = Number(process.env.ELEVENLABS_SPEED ?? 0.85);
// Rachel, the account-agnostic default: multilingual v2 speaks Thai on any voice id, so
// this works without needing voices_read permission to look one up. A cloned voice id
// passed per-call overrides it -- that is how the owner's own voice reaches a render
// without changing any config.
const DEFAULT_ELEVEN_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
function elevenVoiceId(voiceId) {
  return voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVEN_VOICE_ID;
}

export function activeTtsBackend() {
  return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "say";
}

/**
 * Instant Voice Cloning -- turn a sample recording into a voice id usable by speakThai().
 *
 * WF8 §8.2/§8.4 wants the owner's own voice reading the listing. The sample can be any
 * media with speech on it; a video is handed to FFmpeg first because ElevenLabs wants
 * audio, and asking the user to extract the track themselves is a step they should not
 * have to know about.
 *
 * The returned voice_id is stable and reusable -- cloning the same person twice is a
 * wasted call, so callers should store it (WF8 marks this step [CACHED]).
 *
 * @param {Buffer} sample     raw bytes of the uploaded recording
 * @param {string} filename   original name; only its extension matters, for FFmpeg
 */
export async function cloneVoice({ sample, filename = "sample.mp3", name }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new VoiceError("ต้องมี ELEVENLABS_API_KEY ก่อนจึงจะโคลนเสียงได้");
  if (!sample?.length) throw new VoiceError("ไม่มีไฟล์เสียงตัวอย่าง");

  await ensureDirs();
  const stamp = Date.now();
  const ext = (path.extname(filename) || ".mp3").toLowerCase();
  const raw = path.join(TEMP_DIR, `clone_${stamp}${ext}`);
  await writeFile(raw, sample);

  // Normalise whatever arrived into a mono 44.1k mp3: this both strips the video track
  // when the upload was an .mp4 and keeps the payload small enough to post.
  const audio = path.join(TEMP_DIR, `clone_${stamp}.mp3`);
  try {
    await ffmpeg(["-i", raw, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", audio]);
  } catch (err) {
    throw new VoiceError(`อ่านไฟล์เสียงตัวอย่างไม่ได้: ${err.message}`);
  }

  const duration = (await probeDuration(audio)) ?? 0;
  // ElevenLabs accepts short samples but the clone is noticeably worse below ~30s, and a
  // few seconds of audio produces a voice that does not resemble the speaker at all.
  if (duration < 10) {
    throw new VoiceError(
      `ไฟล์เสียงสั้นเกินไป (${duration.toFixed(1)} วินาที) -- ควรมีเสียงพูดต่อเนื่องอย่างน้อย 30 วินาที เพื่อให้โคลนออกมาเหมือน`
    );
  }

  const form = new FormData();
  form.append("name", name || `MMGS clone ${new Date().toISOString().slice(0, 10)}`);
  form.append("files", new Blob([await readFile(audio)], { type: "audio/mpeg" }), "sample.mp3");

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (/create_instant_voice_clone/.test(detail)) {
      throw new VoiceError(
        "API key นี้ยังไม่ได้เปิดสิทธิ์โคลนเสียง\n" +
          "   เข้า ElevenLabs > Developers > API Keys > แก้ key นี้\n" +
          "   แล้วติ๊กสิทธิ์ Voices: Read + Instant Voice Cloning (หรือสร้าง key ใหม่แบบ full access)"
      );
    }
    throw new VoiceError(`โคลนเสียงไม่สำเร็จ (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  if (!body.voice_id) throw new VoiceError("ElevenLabs ไม่ได้ส่ง voice_id กลับมา");
  return { voice_id: body.voice_id, sample_seconds: round(duration) };
}

async function synthWithSay({ text, voice, rate, aiff, wav }) {
  // The line is handed over as a file rather than an argument. A script written with
  // dash bullets is natural here (the listing highlights read that way), and as an
  // argument `say` would parse the leading "-" as an option and reject the line.
  const src = `${aiff}.txt`;
  await writeFile(src, text, "utf8");
  const args = ["-v", voice, "-o", aiff, "-f", src];
  if (rate) args.push("-r", String(rate));
  // execFile, never a shell: the text is Thai copy that may contain quotes.
  await execFileAsync("say", args);
  await ffmpeg(["-i", aiff, ...PCM, wav]);
}

// Expressive-but-stable defaults. Stability below ~0.35 starts inventing emphasis that
// drifts between runs; above ~0.6 it flattens into the reading-a-list cadence this whole
// function exists to avoid. Style adds intonation range; speaker_boost keeps the timbre
// consistent across a long take.
const ELEVEN_VOICE_SETTINGS = {
  // Raised from 0.42: low stability makes the model improvise emphasis, and on a
  // language it is less confident in that improvisation comes out as slurring rather
  // than expression. Clarity beats liveliness when the listener is being told a price.
  stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.6),
  similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY ?? 0.75),
  // Style also trades articulation for expressiveness -- dialled back for the same reason.
  style: Number(process.env.ELEVENLABS_STYLE ?? 0.15),
  use_speaker_boost: true,
  speed: ELEVEN_SPEED,
};

/**
 * Speak the WHOLE script in one request and slice the cues out of the returned
 * character-level alignment.
 *
 * This is what makes the delivery sound human rather than assembled. Speaking sentence by
 * sentence and gluing the pieces together with a fixed silence gives every sentence the
 * same falling final intonation and the same pause length -- the giveaway that a machine
 * read a list. In one request the model carries emphasis and breath across the whole
 * paragraph, so a sentence can lean into the next one the way a person does.
 *
 * The cue timing stays measured rather than estimated: ElevenLabs returns the start/end
 * time of every character, so a sentence boundary is a lookup, not a guess. That preserves
 * the property the per-sentence path was written for in the first place.
 *
 * Returns null (rather than throwing) if the alignment cannot be mapped back onto the
 * input, so the caller can fall back to the per-sentence path instead of failing.
 */
/**
 * Slice one line into space-separated tokens with real start/end times.
 *
 * `lineStart` is the line's offset into the joined text, so the character indices line up
 * with the alignment arrays returned for the WHOLE request. Getting that offset wrong is
 * silent: the words still render, just against another sentence's audio.
 */
function wordSpans(line, lineStart, starts, ends) {
  const spans = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const from = lineStart + m.index;
    const to = from + m[0].length - 1;
    if (to >= starts.length) break;
    spans.push({ text: m[0], start: round(starts[from]), end: round(ends[to]) });
  }
  return spans;
}

async function speakContinuousElevenLabs(lines, { wav, mp3, voiceId }) {
  // A newline is what ElevenLabs reads as a beat between thoughts; a space would run the
  // sentences together, and punctuation would be spoken as part of the line.
  const SEP = "\n";
  const text = lines.join(SEP);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId(voiceId)}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        voice_settings: ELEVEN_VOICE_SETTINGS,
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new VoiceError(`ElevenLabs ปฏิเสธ (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }

  const body = await res.json();
  const align = body.alignment ?? body.normalized_alignment;
  const starts = align?.character_start_times_seconds;
  const ends = align?.character_end_times_seconds;
  // The index arithmetic below is only valid if the returned character stream is the text
  // we sent. Normalisation can rewrite it (numerals into words, for one), and a silently
  // shifted index would put every subtitle on the wrong line.
  if (!align || align.characters.length !== text.length || !starts || !ends) return null;

  await writeFile(mp3, Buffer.from(body.audio_base64, "base64"));
  await ffmpeg(["-i", mp3, ...PCM, wav]);

  const cues = [];
  let pos = 0;
  for (const line of lines) {
    const from = pos;
    const to = pos + line.length - 1;
    if (to >= starts.length) return null;
    cues.push({
      start: round(starts[from]),
      end: round(ends[to]),
      text: line,
      // Per-word timings for karaoke captions, taken from the same character alignment
      // rather than estimated by dividing the line's duration. Thai does not put spaces
      // between words, so a space-separated token here is a PHRASE -- which is what the
      // script prompt asks the model to produce for reading rhythm, and what a caption
      // should highlight as one unit anyway.
      words: wordSpans(line, from, starts, ends),
    });
    pos += line.length + SEP.length;
  }
  return { cues };
}

async function synthWithElevenLabs({ text, mp3, wav, voiceId }) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      // The per-sentence fallback path was sending no voice_settings at all, so it ignored
      // the speed and clarity tuning the continuous path uses -- same voice, two different
      // deliveries depending on which branch ran.
      body: JSON.stringify({ text, model_id: ELEVEN_MODEL, voice_settings: ELEVEN_VOICE_SETTINGS }),
    }
  );
  if (!res.ok) {
    // ElevenLabs returns its reason as JSON; surfacing it verbatim is the difference
    // between "voice failed" and "you are on a free plan / out of quota".
    const detail = await res.text().catch(() => "");
    throw new VoiceError(`ElevenLabs ปฏิเสธ (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  await writeFile(mp3, Buffer.from(await res.arrayBuffer()));
  await ffmpeg(["-i", mp3, ...PCM, wav]);
}

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
 * @param {string} [opts.voice]        macOS voice name (ignored by the ElevenLabs backend)
 * @param {number} [opts.gapSeconds]   pause inserted between sentences
 * @param {number} [opts.rate]         words per minute; omit for the voice default
 * @returns {{ file, duration, cues, backend }}
 */
export async function speakThai(sentences, opts = {}) {
  const { voice = DEFAULT_VOICE, gapSeconds = SILENCE_BETWEEN_SENTENCES, rate, voiceId } = opts;
  const lines = (sentences ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!lines.length) throw new VoiceError("ไม่มีข้อความให้พูด");

  const backend = activeTtsBackend();
  // Only the macOS backend can be missing a voice; ElevenLabs is reachable or it is not,
  // and that shows up as an HTTP error with a reason attached instead.
  if (backend === "say" && !(await hasVoice(voice))) {
    throw new VoiceError(
      `ไม่พบเสียง "${voice}" ในเครื่อง\n` +
        `   ดูรายชื่อเสียงที่มี: say -v '?'\n` +
        `   เสียงไทยของ macOS ติดตั้งเพิ่มได้ที่ System Settings > Accessibility > Spoken Content\n` +
        `   หรือตั้ง ELEVENLABS_API_KEY เพื่อใช้เสียงจาก ElevenLabs แทน (ใช้ได้ทุกระบบปฏิบัติการ)`
    );
  }

  await ensureDirs();
  await mkdir(VOICE_DIR, { recursive: true });
  const stamp = Date.now();

  // Preferred path: one take for the whole script, cues sliced from the returned
  // alignment. Falls through to the per-sentence path below if the alignment cannot be
  // trusted, so a change in how ElevenLabs normalises text degrades the delivery instead
  // of shipping subtitles that sit on the wrong sentence.
  if (backend === "elevenlabs") {
    const out = path.join(VOICE_DIR, `voice_${stamp}.m4a`);
    const wav = path.join(TEMP_DIR, `voice_${stamp}_full.wav`);
    const continuous = await speakContinuousElevenLabs(lines, {
      wav,
      mp3: path.join(TEMP_DIR, `voice_${stamp}_full.mp3`),
      voiceId,
    });
    if (continuous) {
      await ffmpeg(["-i", wav, "-c:a", "aac", "-b:a", "160k", out]);
      const duration = (await probeDuration(out)) ?? continuous.cues.at(-1).end;
      return { file: out, duration: round(duration), cues: continuous.cues, backend, continuous: true };
    }
  }

  const segments = [];
  const cues = [];
  let clock = 0;

  for (const [i, text] of lines.entries()) {
    const wav = path.join(TEMP_DIR, `seg_${stamp}_${i}.wav`);
    try {
      if (backend === "elevenlabs") {
        await synthWithElevenLabs({ text, mp3: path.join(TEMP_DIR, `el_${stamp}_${i}.mp3`), wav, voiceId });
      } else {
        await synthWithSay({ text, voice, rate, aiff: path.join(TEMP_DIR, `say_${stamp}_${i}.aiff`), wav });
      }
    } catch (err) {
      if (err instanceof VoiceError) throw err;
      throw new VoiceError(`สร้างเสียงประโยคที่ ${i + 1} ไม่สำเร็จ: ${err.message}`);
    }

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
  return { file: out, duration: round(duration), cues, backend };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
