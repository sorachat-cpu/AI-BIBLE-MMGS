#!/usr/bin/env node
// Render CLI -- turn source material into a finished clip.
//
// Until now Render Engine could only be reached from the web console, which meant going
// through the earlier pipeline steps first. That made the footage already sitting in
// output/ unusable and left the last mile of the pipeline untested. This is the way in.
//
// Which clip you get depends on what you feed it, because the source decides the shot:
//   mapzoom  a plot with an address  -> satellite descent onto the parcel, ending on the pin
//   clips    footage already on disk -> joined, with voiceover and subtitles
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { runMapZoom, MapZoomError } from "../engines/mapzoom-engine.mjs";
import { runStory, StoryError } from "../engines/story-engine.mjs";
import { runRenderEngine, RenderEngineError } from "../engines/render-engine.mjs";
import { speakThai, toSentences, VoiceError, DEFAULT_VOICE } from "../lib/voice.mjs";
import { loadListings } from "../content/listings.mjs";
import { OUTPUT_DIR, ASPECTS } from "../lib/ffmpeg.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const has = (name) => args.includes(`--${name}`);

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function usage() {
  console.log(`
สร้างคลิปจากวัตถุดิบที่มี

  --mode story              คลิปเต็มเรื่อง: นอกโลก → หมุด → แปลง → สถานที่ใกล้เคียง → ดีเทล → ป้ายติดต่อ
  --mode mapzoom            เฉพาะท่อนหมุดแผนที่ซูมลงมาที่แปลง
  --mode clips              ต่อคลิปที่มีอยู่แล้วใส่เสียงกับซับ

ตัวเลือก
  --listing <LAND-xxxx>     ดึงข้อมูลแปลงจากชีท ใช้ทำสคริปต์พูดและการ์ดปิดท้าย
  --property <PROP-TH-xxx>  รหัสงาน (ค่าเริ่มต้น PROP-TH-01029)
  --address "<ที่อยู่>"      ระบุที่ตั้งเอง ถ้าไม่ได้ใช้ --listing
  --photo <ไฟล์รูป>          รูปแปลงที่ถ่ายมา (โหมด story) ใช้เป็นฉาก "ซูมมาที่แปลง"
  --clips a.mp4,b.mp4       ระบุไฟล์เอง · ไม่ใส่ = ใช้คลิปต้นทางใน output/ ที่ตรงอัตราส่วน
  --script <ไฟล์.txt>        บทพูด บรรทัดละประโยค · ไม่ใส่ = สร้างจากข้อมูลแปลง
  --aspect 9:16|16:9        ค่าเริ่มต้น 9:16
  --voice <ชื่อเสียง>        ค่าเริ่มต้น ${DEFAULT_VOICE} (เสียงไทยที่มากับ macOS)
  --construction            เพิ่มฉากก่อสร้าง (ที่ดินเปล่า → บ้านเสร็จ 5 ขั้น) ~$0.07 ต้องมีเครดิต Kling
  --no-voice                ไม่ใส่เสียงและซับ

ตัวอย่าง
  npm run render -- --mode mapzoom --listing LAND-52C14A8C
  npm run render -- --mode clips --script bot.txt
`);
}

/**
 * Turn a listing row into lines to speak.
 *
 * One sentence per line, because voice.mjs speaks and times each line separately -- the
 * line break is what the subtitle cue is built from, so it doubles as the reading rhythm.
 */
function scriptFromListing(listing) {
  const lines = [];
  if (listing.title) lines.push(listing.title);
  if (listing.location) lines.push(`ตั้งอยู่ที่ ${listing.location}`);
  if (listing.size_text) lines.push(`เนื้อที่ ${listing.size_text}`);
  for (const h of (listing.highlights ?? []).slice(0, 3)) lines.push(h);
  if (listing.price_text) lines.push(`ราคา ${listing.price_text}`);
  lines.push(listing.contact ? `สนใจติดต่อ ${listing.contact}` : "สนใจทักแชทเพจได้เลยครับ");
  return lines;
}

function endingCardFromListing(listing) {
  if (!listing) return undefined;
  return {
    badge: "เจ้าของขายเอง",
    title: listing.title ?? "",
    size_text: listing.size_text ?? "",
    price_text: listing.price_text ?? "สอบถามราคา",
    contact_phone: listing.contact ?? "",
    line_id: "@244raxjb",
  };
}

/**
 * Source footage for this aspect, oldest first.
 *
 * Anything this pipeline produced is excluded. Render Engine marks its own output with
 * `_render_`, and without that filter a second run would concatenate the first run's
 * finished clip -- subtitles and ending card already burned in -- and stack a new set on
 * top, growing longer and more layered every time it is run.
 */
async function clipsForAspect(aspect) {
  const tag = aspect.replace(":", "_");
  const files = await readdir(OUTPUT_DIR);
  return files
    .filter((f) => f.endsWith(`_${tag}.mp4`))
    .filter((f) => !f.includes("mapzoom") && !f.includes("_render_") && !f.startsWith("DEMO_"))
    .sort()
    .map((f) => path.join(OUTPUT_DIR, f));
}

async function main() {
  const mode = String(flag("mode", "") || "");
  if (!mode || has("help")) return usage();

  const aspect = String(flag("aspect", "9:16"));
  if (!ASPECTS[aspect]) throw new Error(`aspect ไม่รองรับ: ${aspect}`);
  const property_id = String(flag("property", "PROP-TH-01029"));

  let listing = null;
  const listingId = flag("listing");
  if (listingId && listingId !== true) {
    const { items } = await loadListings();
    listing = items.find((i) => i.listing_id === listingId);
    if (!listing) throw new Error(`ไม่พบแปลง ${listingId} ในชีท`);
    console.log(dim(`แปลง: ${listing.title ?? listing.listing_id}`));
  }

  // ---- voice + subtitles, shared by every mode ----
  let voice = null;
  if (!has("no-voice")) {
    const scriptFile = flag("script");
    let sentences;
    if (scriptFile && scriptFile !== true) {
      sentences = toSentences(await readFile(String(scriptFile), "utf8"));
    } else if (listing) {
      sentences = scriptFromListing(listing);
    } else {
      console.log(dim("ไม่มี --script และไม่มี --listing จึงข้ามเสียงและซับ"));
    }
    if (sentences?.length) {
      process.stdout.write(dim(`กำลังสร้างเสียงพูด ${sentences.length} ประโยค… `));
      voice = await speakThai(sentences, { voice: String(flag("voice", DEFAULT_VOICE)) });
      console.log(ok(`${voice.duration} วิ`));
    }
  }

  // ---- source footage ----
  let clips;
  let storyOwnsEndingCard = false;
  if (mode === "mapzoom") {
    if (!listing?.location && !flag("address")) {
      throw new Error("โหมด mapzoom ต้องมี --listing ที่มีที่ตั้ง หรือ --address");
    }
    // `listing` is null unless --listing was given, so the fallback has to be lazy --
    // reading listing.location eagerly crashes on the exact path the guard above allows.
    const address = String(flag("address") ?? listing?.location);
    process.stdout.write(dim(`กำลังสร้างคลิปซูมแผนที่จาก "${address}"… `));
    const mz = await runMapZoom({
      property_id,
      raw_address: address,
      geo: listing?.lat && listing?.lng ? { lat: listing.lat, lng: listing.lng } : undefined,
      aspect,
      // Picture must outlast the narration, or the closing sentences never play.
      minDuration: voice?.duration ?? 0,
    });
    console.log(ok(`${mz.duration} วิ · $${mz.cost_usd}`));
    if (mz.truncated_seconds > 0) {
      console.log(bad(`⚠ เสียงยาวกว่าภาพ ${mz.truncated_seconds} วิ — ยืดภาพได้ถึงเพดานแล้ว ประโยคท้ายจะถูกตัด`));
      console.log(dim("   แก้ได้โดยตัดบทให้สั้นลง หรือใส่คลิปเพิ่มด้วย --mode clips"));
    }
    clips = [{ file: mz.file }];
  } else if (mode === "story") {
    if (!listing) throw new Error("โหมด story ต้องมี --listing");
    process.stdout.write(dim("กำลังประกอบฉาก… "));
    const st = await runStory({
      property_id,
      listing,
      photo: flag("photo") && flag("photo") !== true ? String(flag("photo")) : undefined,
      aspect,
      minDuration: voice?.duration ?? 0,
      scenes: has("construction")
        ? ["space", "plot", "construction", "nearby", "detail", "contact"]
        : undefined,
    });
    console.log(ok(`${st.duration} วิ · $${st.cost_usd}`));
    for (const s of st.scenes) console.log(`   ${ok("•")} ${s.scene.padEnd(9)} ${s.seconds} วิ`);
    for (const s of st.skipped) console.log(`   ${dim("–")} ${dim(s.scene.padEnd(9) + " ข้าม: " + s.reason)}`);
    clips = [{ file: st.file }];
    // The story already ends on its own contact plate; an overlay here would stack a
    // second card on top of it.
    storyOwnsEndingCard = true;
  } else if (mode === "clips") {
    const given = flag("clips");
    const files = given && given !== true
      ? String(given).split(",").map((f) => path.resolve(f.trim()))
      : await clipsForAspect(aspect);
    if (!files.length) throw new Error(`ไม่พบคลิปอัตราส่วน ${aspect} ใน output/`);
    console.log(dim(`ใช้คลิป ${files.length} ไฟล์`));
    clips = files.map((file) => ({ file }));
  } else {
    throw new Error(`ไม่รู้จักโหมด "${mode}" — มี mapzoom กับ clips`);
  }

  // ---- final render ----
  const res = await runRenderEngine({
    property_id,
    clips,
    subtitles: voice?.cues ?? [],
    voiceover_file: voice?.file,
    ending_card: storyOwnsEndingCard ? undefined : endingCardFromListing(listing),
    aspects: [aspect],
  });

  for (const s of res.steps ?? []) {
    console.log(`${s.status === "ok" ? ok("✓") : bad("✗")} ${String(s.stage).padEnd(18)} ${s.detail ?? ""}`);
  }
  console.log();
  for (const o of res.outputs ?? []) {
    console.log(`${ok("เสร็จ")} ${o.aspect_ratio}  ${o.resolution}  ${o.duration_seconds} วิ  ${dim("output/" + o.file)}`);
  }
  if (voice) {
    console.log(dim(`ซับ ${voice.cues.length} บรรทัด ตรงกับเสียงพูดแต่ละประโยค`));
    // -shortest trims to the shorter stream, and the tail of the narration is the price
    // and the phone number. Silent truncation here is the failure worth shouting about.
    const shown = res.outputs?.[0]?.duration_seconds ?? 0;
    if (shown && voice.duration - shown > 0.5) {
      console.log(
        bad(`⚠ เสียงยาว ${voice.duration} วิ แต่คลิปยาว ${shown} วิ — ประโยคท้ายถูกตัดหายไป ${(voice.duration - shown).toFixed(1)} วิ`)
      );
    }
  }
  for (const o of res.outputs ?? []) {
    if (o.degraded) console.log(bad(`⚠ ${o.aspect_ratio} เรนเดอร์แบบลดคุณภาพ ตรวจไฟล์ก่อนใช้งาน`));
  }
}

main().catch((err) => {
  const known =
    err instanceof VoiceError || err instanceof MapZoomError ||
    err instanceof StoryError || err instanceof RenderEngineError;
  console.error(bad(`ผิดพลาด: ${err?.message ?? err}`));
  // A domain error already says what to do about it. Anything else is a bug here, and the
  // stack is the only thing that locates it.
  if (!known && err?.stack) console.error(dim(err.stack));
  process.exitCode = 1;
});
