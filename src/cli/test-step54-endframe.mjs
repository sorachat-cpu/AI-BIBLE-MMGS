// One-off smoke test for WF5 step 5.4 (src/wf5/steps.mjs step54_constructionSimulation)
// with a PRE-SUPPLIED finished-house end frame -- proves the house_image_base64/
// house_image_url skip-House-Engine path actually works against a real Kling call, and
// lets you watch whether Kling's image_tail mode produces a genuine construction
// progression (not a jump-cut) between the two supplied frames.
//
// NOT part of `npm test`: this spends real Kling credit (~$0.16-0.18, one image2video
// call, zero House Engine calls) every time it runs. Run it by hand:
//
//   node --env-file-if-exists=.env src/cli/test-step54-endframe.mjs --house <path-or-url> [--land <path-or-url>] [--property PROP-TH-XXXXX]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { step54_constructionSimulation } from "../wf5/steps.mjs";
import { downloadTo, ensureDirs, OUTPUT_DIR } from "../lib/ffmpeg.mjs";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PROPERTY_ID = flag("property", "PROP-TH-09999"); // fake id, clearly not a real listing
const LAND = flag("land", path.join(OUTPUT_DIR, "..", "content", "media", "LAND-051A3687.jpg"));
const HOUSE = flag("house");
const STAMP = Date.now();

const isUrl = (s) => /^https?:\/\//.test(s);

async function toImageInput(source, label) {
  if (isUrl(source)) return { url: source };
  console.log(`      อ่านไฟล์รูป${label}: ${source}`);
  const buf = await readFile(source);
  const ext = path.extname(source).slice(1) || "jpeg";
  return { base64: `data:image/${ext};base64,${buf.toString("base64")}` };
}

async function main() {
  if (!HOUSE) {
    console.error(
      "ต้องระบุรูปบ้านที่สร้างเสร็จด้วย --house <path-or-url>\n" +
      "  (repo นี้มีแต่รูปที่ดินเปล่าใน content/media/ ไม่มีรูปบ้านเสร็จให้ใช้ default)\n\n" +
      "ตัวอย่าง:\n" +
      "  node --env-file-if-exists=.env src/cli/test-step54-endframe.mjs --house ./my-house.jpg"
    );
    process.exitCode = 1;
    return;
  }

  await ensureDirs();

  console.log("[1/3] เตรียมเฟรมแรก (ที่ดิน) และเฟรมจบ (บ้านเสร็จ)...");
  const land = await toImageInput(LAND, "ที่ดิน");
  const house = await toImageInput(HOUSE, "บ้านเสร็จ");

  console.log(
    "[2/3] รันจริง (เสียเงินจริงกับ Kling ตอนนี้ ~$0.16-0.18 · ไม่เรียก House Engine)..."
  );
  const result = await step54_constructionSimulation(
    {
      property_id: PROPERTY_ID,
      style_tag: "CONTEMPORARY",
      land_image_base64: land.base64,
      land_image_url: land.base64 ? undefined : land.url,
      house_image_base64: house.base64,
      house_image_url: house.base64 ? undefined : house.url,
    },
    {}
  );

  console.log(`      art_directed: ${result.art_directed} (ควรเป็น true)`);
  console.log(`      degraded: ${result.degraded ?? "null"} (ควรเป็น null)`);
  console.log(`      house_cost_usd: $${result.house_cost_usd} (ควรเป็น $0 -- ไม่เรียก House Engine)`);

  console.log("[3/3] ดาวน์โหลดคลิป...");
  const out = path.join(OUTPUT_DIR, `TEST_step54_endframe_${STAMP}.mp4`);
  await downloadTo(result.clip.video_url, out);

  const summary = path.join(OUTPUT_DIR, `TEST_step54_endframe_${STAMP}.json`);
  await writeFile(summary, JSON.stringify(result, null, 2));

  console.log("\nเสร็จแล้ว:");
  console.log(`  วิดีโอ: ${out}`);
  console.log(`  รายละเอียดดิบ: ${summary}`);
}

main().catch((err) => {
  console.error("test-step54-endframe ล้มเหลว:", err);
  process.exitCode = 1;
});
