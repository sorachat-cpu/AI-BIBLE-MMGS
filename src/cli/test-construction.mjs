// One-off smoke test for the *staged* construction progression (wf5/construction.mjs,
// exposed at POST /api/construction) -- the 5-step "ฐานราก → โครงสร้าง → ผนัง+หลังคา →
// ตกแต่ง → เสร็จ" sequence with real Kling image-to-video motion between each stage.
//
// NOT part of `npm test`: this spends real Kling credit (~$0.87 for all 5 stages) every
// time it runs, unlike the rest of the suite which is free. Run it by hand:
//
//   node --env-file-if-exists=.env src/cli/test-construction.mjs
//
// It downloads every generated frame + clip locally and stitches the clips into one
// playable file so the progression can actually be watched, not just inspected as JSON.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateConstructionSequence } from "../wf5/construction.mjs";
import { ffmpeg, downloadTo, ensureDirs, TEMP_DIR, OUTPUT_DIR, ASPECTS } from "../lib/ffmpeg.mjs";

// Any real plot photo works; this one just needs to exist in the repo already so the
// script has no extra setup step.
const LAND_PHOTO = path.join(OUTPUT_DIR, "..", "content", "media", "LAND-051A3687.jpg");
const PROPERTY_ID = "PROP-TH-09999"; // fake id, clearly not a real listing
const STAMP = Date.now();

async function main() {
  await ensureDirs();

  console.log(`[1/5] อ่านรูปที่ดินอ้างอิง: ${LAND_PHOTO}`);
  const landBuf = await readFile(LAND_PHOTO);
  const land_image_base64 = `data:image/jpeg;base64,${landBuf.toString("base64")}`;

  console.log("[2/5] เรียก generateConstructionSequence (dry_run ก่อน เช็คราคา/สเตจ)...");
  const estimate = await generateConstructionSequence(
    { property_id: PROPERTY_ID, style_tag: "CONTEMPORARY", land_image_base64, dry_run: true },
    {}
  );
  console.log(`      ประเมิน: ${estimate.estimate.stages} สเตจ · $${estimate.estimate.total_usd} รวม`);

  // Kling bills image and video credit from SEPARATE pools, and the run below spends the
  // image pool first. Twice now a run has paid for all 5 stills and then failed on the
  // very first video call because the video pool was empty -- money spent for nothing.
  // So: prove the video pool can actually serve a request BEFORE touching the image pool.
  // A rejected request is not charged, which is what makes this check free.
  process.stdout.write("[3/5] เช็คเครดิตวิดีโอก่อนจ่ายค่าภาพ... ");
  const { getVideoEngine } = await import("../providers/registry.mjs");
  try {
    await getVideoEngine().imageToVideo({
      image: landBuf.toString("base64"),
      prompt: "slow cinematic drone reveal",
      camera_motion: "ZOOM_IN",
      duration_seconds: 5,
    });
    console.log("ผ่าน");
  } catch (err) {
    if (/balance not enough/i.test(err.message)) {
      console.error(
        "\nหยุดก่อน: เครดิต 'Video API' ของ Kling ไม่พอ\n" +
        "   ยังไม่ได้จ่ายค่าภาพไปแม้แต่บาทเดียว (รอบก่อนๆ เสียฟรีไป $0.07 สองรอบตรงนี้)\n" +
        "   Kling แยกกระเป๋า Image API กับ Video API -- ต้องเติมที่ Video API โดยเฉพาะ\n" +
        "   ฉากก่อสร้างใช้ 5 คลิป ($0.16 x 5 = $0.80) เครดิตต้องพอทั้ง 5 ก้อน"
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  console.log("[4/5] รันจริง (เสียเงินจริงกับ Kling ตอนนี้)...");
  const result = await generateConstructionSequence(
    { property_id: PROPERTY_ID, style_tag: "CONTEMPORARY", land_image_base64, dry_run: false },
    {}
  );

  for (const step of result.steps) {
    const cost = step.cost_usd ? ` ($${step.cost_usd})` : "";
    console.log(`      [${step.status}] ${step.stage} -- ${step.detail}${cost}`);
  }
  console.log(`      ต้นทุนจริง: $${result.actual_cost_usd}`);

  if (!result.clips.length) {
    console.error("ไม่มีคลิปสำเร็จเลยสักตัว -- ดู steps ด้านบนว่าล้มที่ขั้นไหน");
    process.exitCode = 1;
    return;
  }

  console.log(`[5/5] ดาวน์โหลด ${result.clips.length} คลิป แล้วต่อเป็นไฟล์เดียว...`);
  const dims = ASPECTS["9:16"];
  const normalised = [];
  for (const [i, clip] of result.clips.entries()) {
    const raw = path.join(TEMP_DIR, `testcons_${STAMP}_${i}_raw.mp4`);
    await downloadTo(clip.video_url, raw);
    // Kling's own clips can vary slightly in size/framerate stage to stage; normalise the
    // same way story-engine.mjs does before concatenating, or the concat demuxer produces
    // a file that plays at the wrong speed instead of failing loudly.
    const norm = path.join(TEMP_DIR, `testcons_${STAMP}_${i}_norm.mp4`);
    await ffmpeg([
      "-i", raw,
      "-vf", `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,` +
             `pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30`,
      "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", norm,
    ]);
    normalised.push(norm);
    console.log(`      คลิป ${i + 1}/${result.clips.length}: ${clip.label}`);
  }

  const listFile = path.join(TEMP_DIR, `testcons_${STAMP}.txt`);
  await writeFile(listFile, normalised.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));

  const out = path.join(OUTPUT_DIR, `TEST_construction_progression_${STAMP}.mp4`);
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);

  const summary = path.join(OUTPUT_DIR, `TEST_construction_progression_${STAMP}.json`);
  await writeFile(summary, JSON.stringify(result, null, 2));

  console.log("\nเสร็จแล้ว:");
  console.log(`  วิดีโอ progression: ${out}`);
  console.log(`  รายละเอียดดิบ (frames/clips/steps): ${summary}`);
  console.log(`  ต้นทุนรวมจริง: $${result.actual_cost_usd}`);
}

main().catch((err) => {
  console.error("test-construction ล้มเหลว:", err);
  process.exitCode = 1;
});
