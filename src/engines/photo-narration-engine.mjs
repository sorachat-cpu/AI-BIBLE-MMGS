// Photo Narration Engine (WF8) -- a set of photos plus a caption becomes a narrated,
// moving clip, following WF8-photo-narration-voiceclone.md's shape.
//
// Voice comes from voice.mjs, which picks its own backend: ElevenLabs when a key exists
// (§8.4/8.6 -- one continuous take with character-level timestamps, and optionally the
// owner's cloned voice via `voiceId`), otherwise the macOS system voice. Everything here
// reads only {file, duration, cues} and does not care which produced it.
//
// Two texts come out of the script step and they are NOT the same string: `speak` is
// written to be read aloud, `sub` is written to be read at a glance. Keeping them
// separate is why the on-screen caption is short while the narration still sounds
// natural -- see generateNarrationScript().
import path from "node:path";
import { access, mkdir } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { ensureDirs, OUTPUT_DIR, ASPECTS } from "../lib/ffmpeg.mjs";
import { pushIn, panAcross } from "../lib/kenburns.mjs";
import { speakThai } from "../lib/voice.mjs";

const MODEL = process.env.PHOTO_NARRATION_MODEL ?? "claude-haiku-4-5-20251001";
const COST_PER_SCRIPT_USD = 0.01; // rough haiku-scale text call; no video model involved

// NOT TEMP_DIR: Render Engine calls cleanTemp() as its first act (see voice.mjs's own
// note on this), so a clip written to scratch here would be deleted before Render Engine
// ever reads the `clips` array it was handed in. Same reasoning as voice.mjs's VOICE_DIR.
const CLIPS_DIR = path.join(OUTPUT_DIR, ".photo-narration");

export class PhotoNarrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PhotoNarrationError";
    this.code = code;
  }
}

/**
 * WF8 §8.5: a raw caption (hashtags, emoji, shorthand numbers and all) becomes N spoken
 * segments, one per photo, in the register a narrator actually reads aloud.
 *
 * @param {object} opts
 * @param {string} opts.caption
 * @param {number} opts.photoCount
 * @param {string} [opts.apiKey]
 * @returns {{ sentences: string[], cost_usd: number }}
 */
export async function generateNarrationScript({ caption, photoCount, apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  if (!caption || !String(caption).trim()) {
    throw new PhotoNarrationError("ERR_NARR_INPUT", "ต้องมีแคปชั่นหรือข้อมูลแปลงสำหรับเขียนบท");
  }
  if (!photoCount || photoCount < 1) {
    throw new PhotoNarrationError("ERR_NARR_INPUT", "ต้องมีจำนวนรูปอย่างน้อย 1 รูป");
  }
  if (!apiKey) {
    throw new PhotoNarrationError("ERR_NARR_ENV", "ไม่มี ANTHROPIC_API_KEY -- เขียนบทพากย์เองไม่ได้");
  }

  const prompt = `คุณเป็นนักเขียนบทวิดีโอขายที่ดินภาษาไทย
แปลงแคปชั่นต่อไปนี้เป็น ${photoCount} ท่อน (ต้องได้ ${photoCount} ท่อนพอดี ห้ามมากหรือน้อยกว่านี้)

แต่ละท่อนต้องให้มา 2 แบบ:

1) "speak" = บทสำหรับอ่านออกเสียง
- พูดจบใน 4-7 วินาที (ประมาณ 10-18 คำ)
- อ่านตัวเลขเป็นคำเต็ม เช่น "2.6 ล้าน" -> "สองจุดหกล้านบาท", "100 ตร.ว." -> "หนึ่งร้อยตารางวา"
- ขยายตัวย่อเป็นคำเต็มเสมอ เช่น ตร.ว. รร. รพ.
- **เบอร์โทรศัพท์ต้องอ่านทีละหลัก** ห้ามอ่านรวบเป็นจำนวน และห้ามข้ามหลัก
  ตารางหลัก: 0=ศูนย์ 1=หนึ่ง 2=สอง 3=สาม 4=สี่ 5=ห้า 6=หก 7=เจ็ด 8=แปด 9=เก้า
  เว้นวรรคระหว่างทุกหลัก และต้องมีจำนวนหลักเท่ากับเบอร์ต้นฉบับเป๊ะ
  ตัวอย่าง: "094-887-4343" -> "ศูนย์ เก้า สี่ แปด แปด เจ็ด สี่ สาม สี่ สาม" (10 หลัก)
- ใส่ช่องว่าง (space) คั่นวลี เพื่อช่วยจังหวะการอ่าน -- ห้ามใช้เครื่องหมาย / หรือ | หรือ -
- ภาษาพูดธรรมชาติ เป็นมิตร

2) "sub" = ข้อความซับที่ขึ้นบนจอ
- สั้นที่สุดเท่าที่จะสื่อได้ ไม่เกิน 30 ตัวอักษร และต้องอยู่บรรทัดเดียว
- เป็นวลีสั้นๆ ไม่ใช่ประโยคเต็ม ตัดคำเชื่อมและคำฟุ่มเฟือยออกให้หมด
- ใช้ตัวเลขอารบิกได้ตามปกติ (เช่น "2.6 ล้าน/ไร่") เพราะคนอ่านด้วยตา ไม่ได้ฟัง
- ห้ามมี hashtag emoji หรือ URL
- ตัวอย่างที่ดี: "1 ไร่ 2 งาน ปากพลี" / "ไร่ละ 2.6 ล้าน" / "ติดคลอง 100 เมตร" / "โทร 094-887-4343"

ท่อนสุดท้ายต้องเป็น call to action (ทักไลน์ / โทรสอบถาม) ทั้งใน speak และ sub

แคปชั่นต้นฉบับ:
"""
${caption}
"""

ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น ไม่มี markdown code fence:
{"segments": [{"index": 1, "speak": "...", "sub": "..."}, ...]}`;

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    throw new PhotoNarrationError("ERR_NARR_API", `เรียกโมเดลเขียนบทไม่สำเร็จ: ${err.message}`);
  }

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  let parsed;
  try {
    // Asked for JSON only, but a code fence is stripped defensively -- haiku sometimes
    // wraps the answer in ```json even when told not to.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new PhotoNarrationError("ERR_NARR_PARSE", `โมเดลไม่ได้ตอบเป็น JSON: ${text.slice(0, 200)}`);
  }

  const segments = parsed?.segments;
  if (!Array.isArray(segments) || segments.length !== photoCount) {
    throw new PhotoNarrationError(
      "ERR_NARR_COUNT",
      `ได้บท ${segments?.length ?? 0} ท่อน แต่ต้องการ ${photoCount} ท่อนให้ตรงกับจำนวนรูป`
    );
  }
  // `speak` is what the voice reads; `sub` is what appears on screen. They are deliberately
  // different text: the spoken line carries pacing spaces and numbers written out as words
  // ("สองจุดหกล้านบาท"), neither of which belongs in a caption someone reads at a glance.
  // Older responses only had `text` -- fall back to it so a stale prompt cannot break the run.
  const sentences = segments.map((s) => String(s?.speak ?? s?.text ?? "").trim());
  if (sentences.some((s) => !s)) {
    throw new PhotoNarrationError("ERR_NARR_EMPTY", "โมเดลตอบท่อนที่ไม่มีข้อความมาด้วย");
  }
  // A missing sub degrades to the spoken line rather than showing nothing; stray pacing
  // marks are stripped because they are read as punctuation on screen.
  const subs = segments.map((s, i) =>
    String(s?.sub ?? "").trim().replace(/\s*[/|]\s*/g, " ").replace(/\s{2,}/g, " ")
    || sentences[i].replace(/\s*[/|]\s*/g, " ")
  );

  return { sentences, subs, cost_usd: COST_PER_SCRIPT_USD };
}

/**
 * N photos + a caption -> Ken Burns clips sized to a measured voice track, ready to hand
 * to Render Engine as `clips` (subtitles come from the same voice track's `cues`).
 *
 * @param {object} input
 * @param {string} input.property_id
 * @param {string[]} input.photos   local file paths, one scene each, in the order shown
 * @param {string} input.caption    raw caption / listing text to turn into a script
 * @param {string} [input.aspect]
 * @param {string} [input.voice]    macOS voice name, forwarded to voice.mjs
 * @param {string} [input.voiceId]  ElevenLabs voice id, e.g. one returned by cloneVoice()
 * @param {"pan"|"zoom"} [input.motion]  camera move per photo; "pan" (default) sweeps
 *                                       sideways, "zoom" is the older push-in
 * @returns {{ clips, voice, sentences, subs, aspect, cost_usd }}
 */
export async function runPhotoNarration(input, options = {}) {
  const {
    property_id, photos = [], caption, aspect = "9:16",
    voice: voiceName, voiceId, motion = "pan",
  } = input ?? {};

  if (!property_id) throw new PhotoNarrationError("ERR_NARR_INPUT", "ต้องมี property_id");
  if (!photos.length) throw new PhotoNarrationError("ERR_NARR_INPUT", "ต้องมีรูปอย่างน้อยหนึ่งรูป");
  const dims = ASPECTS[aspect];
  if (!dims) throw new PhotoNarrationError("ERR_NARR_INPUT", `aspect ไม่รองรับ: ${aspect}`);

  for (const [i, p] of photos.entries()) {
    try {
      await access(p);
    } catch {
      throw new PhotoNarrationError("ERR_NARR_PHOTO", `ไม่พบไฟล์รูปที่ ${i + 1}: ${p}`);
    }
  }

  await ensureDirs();
  await mkdir(CLIPS_DIR, { recursive: true });
  const apiKey = (options.env ?? process.env).ANTHROPIC_API_KEY;
  const { sentences, subs, cost_usd } = await generateNarrationScript({
    caption,
    photoCount: photos.length,
    apiKey,
  });

  const spoken = await speakThai(sentences, {
    ...(voiceName ? { voice: voiceName } : {}),
    ...(voiceId ? { voiceId } : {}),
  });
  // The cue TIMING must stay exactly as measured from the generated audio -- that is the
  // whole reason voice.mjs speaks sentence by sentence. Only the display text is swapped,
  // so the on-screen caption inherits the spoken line's real start/end instead of being
  // timed by a second, guessable estimate.
  const voiceTrack = {
    ...spoken,
    // `words` carries per-word timings measured on the SPOKEN line. Once the display text
    // is swapped for the short caption they describe a different string, and the karaoke
    // renderer prefers words over text -- which burned the spoken script into the video
    // ("สองจุดหกล้านบาท" instead of "2.6 ล้าน"). Drop them with the text they belonged to;
    // the caption renders as a static line, which is what a re-worded caption can be.
    cues: spoken.cues.map((cue, i) => {
      const sub = subs[i];
      if (!sub || sub === cue.text) return { ...cue };
      const { words, ...rest } = cue;
      return { ...rest, text: sub };
    }),
  };
  const { cues, duration: voiceDuration } = voiceTrack;

  // Each clip spans from its own cue's start to the NEXT cue's start (or the end of the
  // track, for the last photo) -- not just cue.end-cue.start. That folds the silence gap
  // speakThai() inserts between sentences into the photo that was already on screen,
  // rather than leaving picture and audio to drift apart by one gap per sentence once
  // concatenated back-to-back.
  const stamp = Date.now();
  const clips = [];
  for (const [i, photo] of photos.entries()) {
    const segStart = cues[i].start;
    const segEnd = i < cues.length - 1 ? cues[i + 1].start : voiceDuration;
    const out = path.join(CLIPS_DIR, `pn_${stamp}_${i}.mp4`);
    // Alternate the direction so a run of similar plot photos doesn't all move the same
    // way -- WF8 §8.8 calls this out ("สลับทิศทางการซูมสลับรูป").
    const flip = i % 2 === 1;
    if (motion === "pan") {
      // Land is wide, and a sweep shows how far it runs; a push-in magnifies the middle
      // and throws that away. See panAcross() for why this is the default here.
      await panAcross(photo, out, dims, segEnd - segStart, { direction: flip ? "left" : "right" });
    } else {
      await pushIn(photo, out, dims, segEnd - segStart, flip ? { from: 1.12, to: 1.0 } : { from: 1.0, to: 1.12 });
    }
    clips.push({ file: out });
  }

  return { clips, voice: voiceTrack, sentences, subs, aspect, motion, cost_usd: Number(cost_usd.toFixed(4)) };
}
