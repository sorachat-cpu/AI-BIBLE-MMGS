// WF8b end to end from the terminal: classify -> select -> script.
//
// Stops before the voice/render step on purpose. WF8b §5 makes script approval a gate,
// not a formality -- the script is the thing that makes claims about someone's land, and
// once it is spoken over pictures and posted it is very hard to walk back. So this prints
// it and stops; feeding the approved lines into the existing voice + render pipeline is
// the caller's next command, not something that happens because a script parsed.
//
//   node --env-file-if-exists=.env src/cli/wf8b.mjs \
//     --photos content/media/LAND-06A8B922.jpg,content/media/LAND-0930677E.jpg \
//     --caption "ขายที่ดิน 2 ไร่ ปากพลี ไร่ละ 2.6 ล้าน ติดถนนลาดยาง ไฟฟ้าเข้าถึงแล้ว" \
//     --location "ปากพลี นครนายก" --size "2 ไร่" --contact "สนใจทักไลน์ได้เลย"
//
//   --listing LAND-XXXX   pull caption/location/size/price straight from the sheet
//   --json                machine-readable output instead of the report
import path from "node:path";
import { classifyPhotos } from "../engines/photo-classifier.mjs";
import { writeVerifiedScript } from "../engines/verified-script.mjs";
import { selectPhotosForVideo, CATEGORY_LABELS_TH } from "../wf8b/verified.mjs";
import { loadListings } from "../content/listings.mjs";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const str = (name, fallback = "") => {
  const v = flag(name);
  return v && v !== true ? String(v) : fallback;
};

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;

function usage() {
  console.log(`
${bold("WF8b — วิดีโอประกาศขายที่ดิน (ยึดข้อมูลจริง ไม่แต่งเอง)")}

  --photos a.jpg,b.jpg     รูปที่จะใช้ (จำเป็น)
  --listing LAND-XXXX      ดึงแคปชั่น/ทำเล/ขนาด/ราคา จากชีทที่ดิน
  --caption "..."          แคปชั่นของผู้ขาย (ทับค่าจาก --listing)
  --location "..."         ทำเล
  --size "..."             ขนาดที่ดิน
  --price "..."            ราคา
  --highlight "a" --highlight "b"   จุดเด่นที่ผู้ขายยืนยัน (ใส่ซ้ำได้)
  --contact "..."          ประโยคปิดท้าย
  --json                   ตอบเป็น JSON

ตัวอย่าง:
  node --env-file-if-exists=.env src/cli/wf8b.mjs --listing LAND-52C14A8C \\
    --photos content/media/LAND-06A8B922.jpg,content/media/LAND-0930677E.jpg
`);
}

async function main() {
  if (!args.length || flag("help")) return usage();

  const photoArg = str("photos");
  if (!photoArg) {
    console.error(bad("ต้องมี --photos"));
    usage();
    process.exitCode = 1;
    return;
  }
  const photos = photoArg.split(",").map((f) => path.resolve(f.trim())).filter(Boolean);

  // A listing row already holds everything verified_details wants, so pulling from the
  // sheet is both less typing and less chance of a mismatch between what the video says
  // and what the post says.
  let fromSheet = {};
  const listingId = str("listing");
  if (listingId) {
    const { items } = await loadListings();
    const row = items.find((i) => i.listing_id === listingId);
    if (!row) {
      console.error(bad(`ไม่พบแปลง ${listingId} ในชีท`));
      process.exitCode = 1;
      return;
    }
    // A closed plot is not a hallucination problem, it is a money problem: nothing here
    // would flag it, the caption would faithfully announce the sale, and the run would
    // spend real credit rendering an advert for land that cannot be sold. Caught by
    // actually running this against a listing someone had just marked SOLD.
    if (row.status === "SOLD" || row.status === "HIDDEN") {
      console.error(
        bad(`\nแปลง ${listingId} มีสถานะ ${row.status} — ปิดการขาย/ซ่อนไว้แล้ว`) +
        dim("\n  ทำคลิปโปรโมทต่อไปก็ขายไม่ได้ และเสียค่าเรนเดอร์ฟรี" +
            "\n  ถ้าตั้งใจทำจริง (เช่น ทำคลิปรีวิวย้อนหลัง) ใส่ --allow-sold\n")
      );
      if (!flag("allow-sold")) {
        process.exitCode = 1;
        return;
      }
      console.error(warn("  ข้ามคำเตือนตาม --allow-sold\n"));
    }

    fromSheet = {
      caption: row.caption ?? "",
      location: row.location ?? "",
      land_size: row.size_text ?? "",
      asking_price: row.price_text ?? "",
      confirmed_highlights: row.highlights ?? [],
      contact: row.contact ? `สนใจติดต่อ ${row.contact}` : "",
    };
    console.log(dim(`ดึงข้อมูลจากชีท: ${row.title ?? listingId} (${row.status})`));
  }

  const highlights = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--highlight" && args[i + 1] && !args[i + 1].startsWith("--")) {
      highlights.push(args[i + 1]);
    }
  }

  const caption = str("caption", fromSheet.caption ?? "");
  const verified = {
    location: str("location", fromSheet.location ?? ""),
    land_size: str("size", fromSheet.land_size ?? ""),
    asking_price: str("price", fromSheet.asking_price ?? ""),
    confirmed_highlights: highlights.length ? highlights : (fromSheet.confirmed_highlights ?? []),
    contact_call_to_action: str("contact", fromSheet.contact || "ทักข้อความเพื่อขอรายละเอียดและนัดดูที่ดิน"),
  };

  // ---- §1 classify -------------------------------------------------------
  process.stdout.write(dim(`[1/3] ตรวจรูป ${photos.length} ใบด้วย vision… `));
  const cls = await classifyPhotos(photos);
  console.log(ok(`เสร็จ ($${cls.cost_usd})`));

  for (const c of cls.classified) {
    const mark = c.usable ? ok("✓") : bad("✗");
    console.log(`\n  ${mark} ${bold(c.name)}  ${dim(CATEGORY_LABELS_TH[c.category] ?? c.category)}`);
    for (const v of c.visible.slice(0, 4)) console.log(`      ${dim("เห็น:")} ${v}`);
    for (const u of c.unverified.slice(0, 3)) console.log(`      ${warn("ห้ามอ้าง:")} ${u}`);
    if (!c.usable && c.note) console.log(`      ${bad("ตัดออก:")} ${c.note}`);
  }

  // ---- §2 select ---------------------------------------------------------
  const { selected, dropped, warning } = selectPhotosForVideo(cls.classified);
  console.log(`\n${dim("[2/3] คัดรูป")} — ใช้ ${selected.length} ตัดออก ${dropped.length}`);
  console.log(`  ลำดับ: ${selected.map((s) => CATEGORY_LABELS_TH[s.category] ?? s.category).join(" → ")}`);
  if (warning) console.log(`  ${warn("⚠ " + warning)}`);
  if (!selected.length) {
    console.error(bad("\nไม่มีรูปที่ใช้ได้เลย — ลองอัปโหลดรูปที่ชัดกว่านี้"));
    process.exitCode = 1;
    return;
  }

  // ---- §4 script ---------------------------------------------------------
  process.stdout.write(dim("[3/3] เขียนบทพากย์… "));
  let scr;
  try {
    scr = await writeVerifiedScript({ verified, selected, caption });
  } catch (err) {
    console.log(bad("ไม่ผ่าน"));
    if (err.code === "ERR_SCR_FORBIDDEN") {
      // The gate did its job. Show what was rejected and why, so the fix is obvious --
      // usually "the seller does actually know this, put it in the caption".
      console.error(bad(`\nบทถูกปฏิเสธ: มีคำกล่าวอ้างที่ไม่มีใครยืนยัน ${err.violations.length} จุด\n`));
      for (const v of err.violations) {
        console.error(`  ${bad("✗")} ${v.why}`);
        console.error(`    ${dim(v.line)}`);
      }
      console.error(dim("\nถ้าข้อมูลนี้ถูกต้องจริง ให้ใส่ไว้ในแคปชั่นหรือ --highlight แล้วรันใหม่"));
    } else {
      console.error(bad(`\n[${err.code}] ${err.message}`));
    }
    process.exitCode = 1;
    return;
  }
  console.log(ok(`ผ่านการตรวจคำอ้างต้องห้าม ($${scr.cost_usd})`));

  if (flag("json")) {
    console.log(JSON.stringify({ classified: cls.classified, selected, script: scr }, null, 2));
    return;
  }

  console.log(`\n${bold("บทพากย์")} ${dim(`(ลงท้าย ${scr.politeness ?? "-"})`)}`);
  scr.sentences.forEach((s, i) => {
    console.log(`\n  ${bold(String(i + 1) + ".")} ${dim(selected[i].name)}`);
    console.log(`     ${s}`);
    console.log(`     ${dim("กล้อง: " + selected[i].camera_motion)}`);
  });

  console.log(`\n${dim("รวมค่าใช้จ่าย")} $${(cls.cost_usd + scr.cost_usd).toFixed(4)}`);
  console.log(warn("\nยังไม่ได้พากย์เสียงและเรนเดอร์ — WF8b §5 ให้คนอ่านบทอนุมัติก่อน"));
}

main().catch((err) => {
  console.error(bad(`wf8b ล้มเหลว: ${err.message}`));
  process.exitCode = 1;
});
