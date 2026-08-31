// Finish the 3-WF film from what Google Flow produced.
//
// Flow makes the generated motion for WF1 and WF2; everything after that is local and free.
// This wires the handoffs the spec depends on (FINAL FRAME = NEXT FIRST FRAME), composites
// WF1's location marker, builds the WF3 advertisement, and joins the three into one film.
//
//   node --env-file-if-exists=.env src/cli/wf-finish.mjs \
//     --wf1 output/flow/WF1_result.mp4 \
//     --wf2 output/flow/WF2_result.mp4 \
//     --land output/flow/WF1_END_land.png \
//     --house output/flow/WF2_END_house_night.png \
//     --price 1590000 --size "1 ไร่ 2 งาน" \
//     --title "บ้านสวนกลางธรรมชาติ" \
//     --location "ต.หนองน้ำแดง อ.ปากช่อง จ.นครราชสีมา" \
//     --contact "081-234-5678 · LINE @244raxjb" \
//     --features "บ้านสวนชั้นเดียว,สวนธรรมชาติ,โรงจอดรถ,บรรยากาศสงบ"
//
// Every stage is optional: supply only --wf1 to finish WF1 alone, only --house to build the
// advertisement alone. Whatever is present gets joined at the end.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { finishWf1, finishWf2, joinWorkflows, WfPipelineError } from "../wf/pipeline.mjs";
import { runWf3Ad, buildWf3Caption } from "../engines/wf3-ad.mjs";
import { OUTPUT_DIR } from "../lib/ffmpeg.mjs";

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const PROPERTY_ID = flag("property", "PROP-TH-09999");
const ASPECT = flag("aspect", "9:16");
const WF1_CLIP = flag("wf1");
const WF2_CLIP = flag("wf2");
const LAND = flag("land", "output/flow/WF1_END_land.png");
const HOUSE = flag("house", "output/flow/WF2_END_house_night.png");

async function main() {
  const results = {};
  const clips = [];

  // ---- WF1: marker + freeze on the exact land image ----
  if (WF1_CLIP) {
    console.log("[WF1] ปักหมุด + freeze เฟรมสุดท้ายเป็นรูปที่ดินจริง...");
    results.wf1 = await finishWf1(
      { property_id: PROPERTY_ID, clip: WF1_CLIP, land_image: LAND, aspect: ASPECT, pin: !has("no-pin") },
      {}
    );
    clips.push(results.wf1.file);
    console.log(`      ${results.wf1.file}  (${results.wf1.duration}s)`);
    console.log(`      FINAL FRAME = INPUT IMAGE -> ${results.wf1.final_frame}`);
  } else {
    console.log("[WF1] ข้าม (ไม่ได้ส่ง --wf1)");
  }

  // ---- WF2: freeze on the exact finished-house image ----
  if (WF2_CLIP) {
    console.log("[WF2] freeze เฟรมสุดท้ายเป็นภาพบ้านเสร็จ...");
    results.wf2 = await finishWf2(
      { property_id: PROPERTY_ID, clip: WF2_CLIP, house_image: HOUSE, aspect: ASPECT },
      {}
    );
    clips.push(results.wf2.file);
    console.log(`      ${results.wf2.file}  (${results.wf2.duration}s)`);
    console.log(`      FINAL FRAME WF2 = FIRST FRAME WF3 -> ${results.wf2.final_frame}`);
  } else {
    console.log("[WF2] ข้าม (ไม่ได้ส่ง --wf2)");
  }

  // ---- WF3: the advertisement, built locally from the finished-house frame ----
  // Deliberately not generative: wf/WF3.md forbids inventing a price, a size, a distance or
  // a selling point, and an ad frame is the one place a wrong number is a lie to a buyer.
  const heroFrame = results.wf2?.final_frame ?? HOUSE;
  const priceRaw = flag("price");
  const wf3Input = {
    property_id: PROPERTY_ID,
    house_image_file: heroFrame,
    aspect: ASPECT,
    title: flag("title"),
    price_thb: priceRaw ? Number(priceRaw) : undefined,
    size_text: flag("size"),
    features: (flag("features", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
    location: flag("location"),
    contact: flag("contact"),
    ...(flag("cta") ? { cta: flag("cta") } : {}),
  };

  if (has("no-wf3")) {
    console.log("[WF3] ข้าม (--no-wf3)");
  } else {
    console.log("[WF3] สร้างโฆษณา (ไม่ใช้ AI, $0)...");
    results.wf3 = await runWf3Ad(wf3Input, {});
    clips.push(results.wf3.file);
    console.log(`      ${results.wf3.file}  (${results.wf3.duration}s)`);
    if (results.wf3.data_omitted.length) {
      console.log(`      ไม่ได้ใส่เพราะไม่มีข้อมูล: ${results.wf3.data_omitted.join(", ")}`);
    }
    results.caption = buildWf3Caption({
      ...wf3Input,
      price_text: results.wf3.data_used.price_text,
      cta: wf3Input.cta ?? "สนใจรายละเอียด / นัดชมบ้าน ทักแชตได้เลย",
    });
  }

  // ---- join ----
  if (clips.length >= 2) {
    console.log(`[JOIN] ต่อ ${clips.length} ช่วงเป็นวิดีโอเดียว...`);
    results.full = await joinWorkflows({ property_id: PROPERTY_ID, clips, aspect: ASPECT }, {});
    console.log(`      ${results.full.file}  (${results.full.duration}s)`);
  }

  const summary = path.join(OUTPUT_DIR, `${PROPERTY_ID}_WF_summary_${Date.now()}.json`);
  await writeFile(summary, JSON.stringify(results, null, 2));

  console.log("\nเสร็จแล้ว:");
  if (results.full) console.log(`  วิดีโอเต็ม:   ${results.full.file}`);
  if (results.wf3) console.log(`  เฟรมโฆษณา:   ${results.wf3.final_frame}`);
  console.log(`  สรุป JSON:   ${summary}`);
  if (results.caption) console.log(`\n--- caption ---\n${results.caption}`);
}

main().catch((err) => {
  if (err instanceof WfPipelineError) console.error(`ล้มเหลว [${err.code}] ${err.message}`);
  else console.error("wf-finish ล้มเหลว:", err);
  process.exitCode = 1;
});
