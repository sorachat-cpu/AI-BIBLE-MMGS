#!/usr/bin/env node
// Publish/scheduling CLI. This is what cron calls and what you use to inspect the
// queue without opening the web console.
//
//   npm run publish -- <command> [options]
//
// Every command that could post is dry-run unless you pass --live.
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { publishReadiness } from "../publish/platforms.mjs";
import { scanStock, stockSummary, updateStockMeta } from "../content/stock.mjs";
import { loadScheduleConfig, buildSchedule, dueSlots, saveScheduleConfig, DEFAULT_SCHEDULE } from "../content/calendar.mjs";
import {
  planAhead,
  loadQueue,
  publishItem,
  runDue,
  exportSheet,
  importSheet,
  loadProfile,
  saveProfile,
  patchItem,
} from "../content/queue.mjs";
import { ingestPagePosts, topPosts, archiveToCsv } from "../content/page-archive.mjs";
import {
  importFromPageArchive,
  importFromText,
  importFromAdsExport,
  saveListings,
  enrichAll,
  loadListings,
  listingsToSheet,
  listingsFromSheet,
  patchListing,
  findDuplicates,
  hideDuplicates,
} from "../content/listings.mjs";
import { renderCarousel, renderAllCarousels } from "../engines/carousel-engine.mjs";
import { TOPICS } from "../content/topics.mjs";
import { listKits } from "../publish/adapters/manual-kit.mjs";
import { getBotInfo, getQuota } from "../publish/adapters/line.mjs";
import { verifyPageToken } from "../publish/adapters/facebook.mjs";
import { setupPageToken, usePageToken } from "../publish/fb-token-setup.mjs";
import { systemStatus } from "../publish/status.mjs";
import { CONTENT_DIR } from "../content/store.mjs";

const args = process.argv.slice(2);
const command = args[0];
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
ระบบโพสต์อัตโนมัติ MMGS

  fb:setup               ตั้งค่า Page token ของ Facebook ให้อัตโนมัติ (รันเปล่าๆ เพื่อดูวิธีหา token)
  status [--offline]     ตรวจสุขภาพระบบทั้งหมดก่อนโพสต์ (ออก exit 1 ถ้าไม่ควรรัน)
  readiness              เช็คว่าปลายทางไหนพร้อมโพสต์แล้วบ้าง
  verify                 ยิงเช็ค token จริงกับ LINE / Facebook (read-only)
  stock                  ดูคลังคลิป/รูปที่โพสต์ได้
  stock:tag <file> --title "..." --tags "a,b"    ใส่ข้อมูลให้ไฟล์ในคลัง
  stock:retire <file>    เลิกใช้ไฟล์นี้ในการหมุนเวียน
— ชีทที่ดิน (สำหรับโพสต์ขายในกลุ่ม) —
  listings               ดูที่ดินทั้งหมดในชีท
  listings:import <ไฟล์>  อ่านโพสต์เก่าจากไฟล์ข้อความ (คั่นแต่ละโพสต์ด้วยบรรทัด ---)
  listings:from-ads      นำเข้าจาก content/ads-creatives.json (ที่ Claude ดึงจาก Ads Manager ให้)
  listings:from-page     ดึงจากโพสต์เพจที่ page:pull เก็บไว้ แล้วแยกข้อมูลที่ดิน
  listings:clear --yes   ล้างชีททั้งหมด
  listings:enrich        เติมสถานที่ใกล้เคียงจาก Google Places (เอาแค่ 3 อันดับแรก)
  listings:sheet [--tsv] ออกชีทที่ดินเป็นไฟล์ (มีคอลัมน์ลิงก์แผนที่)
  listings:read <ไฟล์>    อ่านชีทกลับเข้าระบบหลังแก้
  listings:dupes [--fix]  หาแปลงที่ลงซ้ำหลายรอบ แล้วซ่อนแถวเก่า
  listings:ready <รหัส>   ทำเครื่องหมายว่าแปลงนี้พร้อมโพสต์

— คอนเทนต์ความรู้ (carousel) —
  topics                 ดูหัวข้อความรู้ที่มี
  carousel <หัวข้อ>       สร้างสไลด์หัวข้อเดียว
  carousel:all           สร้างสไลด์ทุกหัวข้อใหม่ (ใช้หลังแก้ template)

— ตารางและคิว —
  calendar [--days 7]    ดูตารางลงคลิป
  plan [--days 7]        สร้างดราฟต์ให้ทุกช่องที่ยังว่าง
  list [--date YYYY-MM-DD]   ดูคิวที่เตรียมไว้
  ready <slot_id>        ทำเครื่องหมายว่าดราฟต์นี้พร้อมโพสต์
  post <slot_id> [--live]    โพสต์รายการเดียว
  schedule-fb [--days 7] [--live]   ส่งเข้า Planner ของเพจเป็นโพสต์ตั้งเวลา (= ดราฟต์ที่กดโพสต์ก่อนได้)
  run [--live]           ตัวรันประจำวัน (ใส่ใน cron) เตรียม+โพสต์ช่องที่ถึงเวลา
  sheet:export [--tsv] [--out ไฟล์]   ออกไฟล์ไปเปิดใน Google Sheet
  sheet:import <ไฟล์>    อ่านกลับเข้าคิวหลังแก้ในชีต
  page:pull [--limit 50] ดึงโพสต์เก่าจากเพจมาเก็บไว้
  page:top [--limit 20]  โพสต์เก่าที่คนมีส่วนร่วมมากสุด
  page:csv               ออกคลังโพสต์เก่าเป็น CSV
  kits                   ดูชุดโพสต์เอง (สำหรับลงกลุ่ม) ที่สร้างไว้แล้ว
  profile                ดู/ตั้งค่าข้อมูลเพจ  (--set key=value)
  schedule:init          เขียนตารางเริ่มต้นลง content/schedule.config.json

ไม่ใส่ --live = ซ้อมอย่างเดียว ไม่มีอะไรถูกโพสต์จริง
`);
}

async function main() {
  switch (command) {
    case "status": {
      // Same report the /status page renders. Exit code is the useful part: a cron can
      // gate on it, so a broken token stops the run instead of failing 12 posts one by one.
      const s = await systemStatus({ days: Number(flag("days", 7)), probeNetwork: !has("offline") });
      const mark = { ok: ok("PASS"), warn: bad("WARN"), fail: bad("FAIL") };
      const order = { fail: 0, warn: 1, ok: 2 };
      for (const c of [...s.checks].sort((a, b) => order[a.level] - order[b.level])) {
        console.log(`${mark[c.level]}  ${c.title}`);
        console.log(dim(`      ${c.detail}`));
        if (c.fix) console.log(dim(`      แก้: ${c.fix}`));
      }
      const line = `ผ่าน ${s.counts.ok} · เตือน ${s.counts.warn} · ต้องแก้ ${s.counts.fail}`;
      console.log(`\n${s.verdict === "fail" ? bad("ยังไม่ควรปล่อยให้โพสต์") : ok("ระบบพร้อมโพสต์")}  ${dim(line)}`);
      if (s.verdict === "fail") process.exitCode = 1;
      break;
    }

    case "readiness": {
      const rows = publishReadiness();
      for (const r of rows) {
        const mark = r.ready ? ok("พร้อม  ") : bad("ยังไม่ได้ตั้งค่า");
        console.log(`${mark}  ${r.platform.padEnd(17)} ${r.label}`);
        if (!r.ready) console.log(dim(`          ต้องมี: ${r.missing_env.join(", ")}`));
      }
      break;
    }

    case "fb:setup": {
      // A Page token straight from the Explorer dropdown is the short path; it just
      // usually expires in about an hour, which the report calls out.
      const pageToken = String(flag("page-token", "") || "");
      if (pageToken) {
        const res = await usePageToken({ pageToken });
        for (const s of res.steps) {
          console.log(`${s.ok ? ok("✓") : dim("–")} ${s.step.padEnd(18)} ${s.detail}`);
          if (s.warning) console.log(bad(`    ⚠ ${s.warning}`));
        }
        console.log(`\n${ok("เสร็จแล้ว")} เพจ: ${res.page_name} (${res.page_id})` +
          (res.followers != null ? dim(` · ผู้ติดตาม ${res.followers}`) : ""));
        console.log(dim("\nขั้นต่อไป:  npm run publish -- readiness"));
        break;
      }

      const userToken = String(flag("user-token", "") || "");
      const appId = String(flag("app-id", process.env.FACEBOOK_APP_ID ?? "") || "");
      const appSecret = String(flag("app-secret", process.env.FACEBOOK_APP_SECRET ?? "") || "");

      if (!userToken || !appId) {
        console.log(`
ตั้งค่า Page token ให้อัตโนมัติ

  npm run publish -- fb:setup --app-id <APP_ID> --user-token <USER_TOKEN> [--app-secret <SECRET>]

วิธีหา USER_TOKEN (ใช้เวลา ~2 นาที):
  1. เปิด https://developers.facebook.com/tools/explorer/
  2. มุมขวาบน เลือกแอปของคุณ (App ID ${appId || "<ของคุณ>"})
  3. ปุ่ม "Add a Permission" ใส่ครบ 3 อัน (ไม่มีสิทธิ์แยกสำหรับวิดีโอแล้ว
     pages_manage_posts ครอบคลุมทั้งข้อความ รูป และวิดีโอ):
     pages_manage_posts · pages_read_engagement · pages_show_list
  4. กด "Generate Access Token"
     ⚠ หน้าต่างสิทธิ์จะเด้งมา ต้อง "ติ๊กเลือกเพจ" ด้วย ถ้ากดผ่านจะไม่เห็นเพจเลย
  5. คัดลอกช่อง "Access Token" ยาวๆ มาใส่ --user-token

วิธีหา APP_SECRET (ถ้าไม่ใส่ token จะหมดอายุใน 1 ชม.):
  App Dashboard > App settings > Basic > App secret > กด Show

โทเคนจะถูกเขียนลง .env ให้เลย และไม่ถูกแสดงบนหน้าจอหรือใน log`);
        break;
      }

      if (!appSecret) console.log(dim("ไม่ได้ใส่ --app-secret : token ที่ได้จะหมดอายุใน ~1 ชม. (ทดสอบได้ ตั้ง cron ไม่ได้)"));

      const res = await setupPageToken({
        userToken,
        appId,
        appSecret: appSecret || undefined,
        pageId: flag("page-id") ? String(flag("page-id")) : undefined,
      });

      for (const s of res.steps) {
        console.log(`${s.ok ? ok("✓") : dim("–")} ${s.step.padEnd(24)} ${s.detail}`);
        if (s.warning) console.log(bad(`    ⚠ ${s.warning}`));
      }
      console.log(`\n${ok("เสร็จแล้ว")} เพจ: ${res.page_name} (${res.page_id})`);
      console.log(res.permanent ? ok("token นี้ไม่มีวันหมดอายุ") : bad("token นี้จะหมดอายุ -- รันซ้ำพร้อม --app-secret เมื่อพร้อม"));
      if (res.other_pages.length) {
        console.log(dim(`เพจอื่นที่เห็น: ${res.other_pages.map((p) => `${p.name} (${p.id})`).join(", ")}`));
        console.log(dim("ถ้าเลือกผิดเพจ รันใหม่พร้อม --page-id <id>"));
      }
      console.log(dim("\nขั้นต่อไป:  npm run publish -- verify"));
      break;
    }

    case "verify": {
      const env = process.env;
      if (env.LINE_CHANNEL_ACCESS_TOKEN) {
        try {
          const info = await getBotInfo({ token: env.LINE_CHANNEL_ACCESS_TOKEN });
          const quota = await getQuota({ token: env.LINE_CHANNEL_ACCESS_TOKEN }).catch(() => null);
          console.log(ok("LINE OK"), `${info.display_name} (${info.basic_id})`,
            quota ? dim(`โควตา ${quota.used}/${quota.limit ?? "ไม่จำกัด"}`) : "");
        } catch (e) {
          console.log(bad("LINE ล้มเหลว"), e.message);
        }
      } else console.log(dim("LINE: ไม่มี token"));

      if (env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_ACCESS_TOKEN) {
        try {
          const page = await verifyPageToken({ pageId: env.FACEBOOK_PAGE_ID, token: env.FACEBOOK_PAGE_ACCESS_TOKEN });
          console.log(ok("Facebook OK"), `${page.page_name} · ผู้ติดตาม ${page.followers ?? "-"}`);
        } catch (e) {
          console.log(bad("Facebook ล้มเหลว"), e.message);
        }
      } else console.log(dim("Facebook: ยังไม่มี FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN"));
      break;
    }

    case "stock": {
      const stock = await scanStock();
      const config = await loadScheduleConfig();
      const s = stockSummary(stock, config);
      console.log(
        `คลัง: วิดีโอ ${s.videos} (แนวตั้ง ${s.vertical_videos}) · รูป ${s.images} · ยังไม่เคยโพสต์ ${s.never_posted}`
      );
      console.log(dim(`ช่องต่อวัน ${s.slots_per_day} · คลิปพอใช้ราว ${s.days_of_video_runway} วัน`));
      console.log();
      for (const it of stock) {
        const used = it.posted_count ? `โพสต์แล้ว ${it.posted_count}x` : dim("ยังไม่เคยโพสต์");
        console.log(
          `${it.retired ? bad("[เลิกใช้]") : "        "} ${it.kind.padEnd(5)} ${(it.aspect ?? "-").padEnd(5)} ` +
            `${String(it.duration_seconds ? `${it.duration_seconds.toFixed(1)}s` : "-").padEnd(7)} ${it.file}  ${used}`
        );
      }
      break;
    }

    case "stock:tag": {
      const file = args[1];
      if (!file) throw new Error("ต้องระบุชื่อไฟล์");
      const patch = {};
      if (flag("title")) patch.title = String(flag("title"));
      if (flag("tags")) patch.tags = String(flag("tags")).split(",").map((s) => s.trim()).filter(Boolean);
      if (flag("price")) patch.price_thb = Number(flag("price"));
      console.log(await updateStockMeta(file, patch));
      break;
    }

    case "stock:retire":
      console.log(await updateStockMeta(args[1], { retired: true }));
      break;

    case "listings": {
      const { items } = await loadListings();
      if (!items.length) {
        console.log(dim("ชีทยังว่าง — นำเข้าด้วย listings:import <ไฟล์> หรือ listings:from-page"));
        break;
      }
      for (const it of items) {
        const colour = it.status === "POSTED" ? dim : it.status === "SOLD" ? bad : (s) => s;
        console.log(`${colour(it.status.padEnd(7))} ${it.listing_id}  ${it.title ?? "-"}`);
        console.log(
          dim(
            `        ${it.size_text ?? "-"} · ${it.price_text ?? it.price_thb ?? "-"} · ${it.location ?? "-"}` +
              `\n        แผนที่: ${it.maps_url ? ok("มี") : bad("ไม่มี")}  ใกล้เคียง: ${(it.nearby ?? []).length} รายการ` +
              (it.enrich_note ? `  (${it.enrich_note})` : "")
          )
        );
      }
      console.log(dim(`\nรวม ${items.length} แปลง`));
      break;
    }

    case "listings:import": {
      const file = args[1];
      if (!file) throw new Error("ต้องระบุไฟล์ข้อความที่มีโพสต์เก่า (คั่นแต่ละโพสต์ด้วยบรรทัด ---)");
      const profile = await loadProfile();
      const res = await importFromText(await readFile(file, "utf8"), {
        profile,
        enrich: !has("no-enrich"),
        onProgress: ({ index, total }) => process.stdout.write(`\rกำลังอ่าน ${index}/${total}...`),
      });
      console.log(`\n${ok(`เพิ่ม ${res.added.length} แปลง`)} · รวมในชีท ${res.total}`);
      for (const s of res.skipped) console.log(dim(`  ข้าม ${s.id}: ${s.reason}`));
      break;
    }

    case "listings:from-ads": {
      const file = flag("file", path.join(CONTENT_DIR, "ads-creatives.json"));
      const profile = await loadProfile();
      const res = await importFromAdsExport(await readFile(file, "utf8"), {
        profile,
        enrich: !has("no-enrich"),
        onProgress: ({ index, total }) => process.stdout.write(`\rกำลังอ่าน ${index}/${total}...`),
      });
      console.log(`\n${ok(`เพิ่ม ${res.added.length} แปลง`)} · รวมในชีท ${res.total}`);
      for (const s of res.skipped) console.log(dim(`  ข้าม ${s.id}: ${s.reason}`));
      break;
    }

    case "listings:clear": {
      if (!has("yes")) {
        console.log(bad("คำสั่งนี้ลบที่ดินทั้งหมดในชีท ใส่ --yes เพื่อยืนยัน"));
        break;
      }
      const before = (await loadListings()).items.length;
      await saveListings({ items: [] });
      console.log(ok(`ลบแล้ว ${before} แปลง`));
      break;
    }

    case "listings:from-page": {
      const profile = await loadProfile();
      const res = await importFromPageArchive({
        profile,
        enrich: !has("no-enrich"),
        limit: Number(flag("limit", 200)),
        onProgress: ({ index, total }) => process.stdout.write(`\rกำลังอ่าน ${index}/${total}...`),
      });
      console.log(`\n${ok(`เพิ่ม ${res.added.length} แปลง`)} · รวมในชีท ${res.total}`);
      for (const s of res.skipped.slice(0, 20)) console.log(dim(`  ข้าม ${s.id}: ${s.reason}`));
      break;
    }

    case "listings:enrich": {
      const profile = await loadProfile();
      const done = await enrichAll({
        profile,
        force: has("force"),
        onProgress: ({ index, total, id }) => process.stdout.write(`\rกำลังเติม ${index}/${total} ${id}...`),
      });
      console.log(`\n${ok(`เติมข้อมูลแล้ว ${done.length} แปลง`)}`);
      for (const d of done) {
        console.log(`  ${d.listing_id}  ใกล้เคียง ${d.nearby} รายการ${d.note ? dim(`  (${d.note})`) : ""}`);
      }
      break;
    }

    case "listings:sheet": {
      const format = has("tsv") ? "tsv" : "csv";
      const out = flag("out", path.join(CONTENT_DIR, `listings.${format}`));
      await writeFile(out, await listingsToSheet({ format }), "utf8");
      console.log(ok(`เขียนแล้ว: ${out}`));
      console.log(dim("อัปโหลดเข้า Google Sheet ได้เลย · คอลัมน์ maps_url คือลิงก์แผนที่"));
      break;
    }

    case "listings:read": {
      const file = args[1];
      if (!file) throw new Error("ต้องระบุไฟล์ CSV ที่ดาวน์โหลดจากชีท");
      const res = await listingsFromSheet(await readFile(file, "utf8"), { profile: await loadProfile() });
      console.log(ok(`อัปเดต ${res.applied.length} แปลง`));
      for (const i of res.ignored) console.log(dim(`  ข้าม ${i.id}: ${i.reason}`));
      break;
    }

    case "listings:dupes": {
      const { items } = await loadListings();
      const dupes = findDuplicates(items);
      if (!dupes.length) {
        console.log(ok("ไม่พบแปลงซ้ำ"));
        break;
      }
      for (const d of dupes) console.log(`x${d.hide.length + 1}  ${d.title ?? "-"}\n${dim(`     เก็บ ${d.keep} · ซ่อน ${d.hide.join(", ")}`)}`);
      if (has("fix")) {
        const res = await hideDuplicates();
        console.log(ok(`\nซ่อนแล้ว ${res.hidden.length} แถว จาก ${res.groups} กลุ่ม`));
      } else {
        console.log(dim(`\nพบ ${dupes.length} กลุ่ม -- ใส่ --fix เพื่อซ่อนแถวเก่า เก็บแถวล่าสุดไว้`));
      }
      break;
    }

    case "listings:ready":
      console.log(await patchListing(args[1], { status: "READY" }, { rebuildCaption: has("rebuild") }));
      break;

    case "topics": {
      for (const t of TOPICS) {
        console.log(`${t.id.padEnd(20)} ${t.title.join(" ")}  ${dim(`${t.points.length} ข้อ`)}`);
      }
      break;
    }

    case "carousel": {
      const id = args[1];
      if (!id) throw new Error(`ต้องระบุหัวข้อ — มี: ${TOPICS.map((t) => t.id).join(", ")}`);
      const res = await renderCarousel({
        topic_id: id,
        theme: String(flag("theme", "daylight")),
        profile: await loadProfile(),
      });
      console.log(ok(`สร้าง ${res.slide_count} สไลด์`), dim(res.dir));
      for (const w of res.warnings) console.log(bad(`  ⚠ ${w}`));
      break;
    }

    case "carousel:all": {
      const all = await renderAllCarousels({ theme: String(flag("theme", "daylight")), profile: await loadProfile() });
      for (const r of all) {
        console.log(`${r.topic_id.padEnd(20)} ${r.slide_count} สไลด์${r.warnings.length ? bad(`  ⚠ ${r.warnings.length}`) : ""}`);
      }
      break;
    }

    case "calendar": {
      const config = await loadScheduleConfig();
      const days = Number(flag("days", 7));
      for (const day of buildSchedule(config, { days })) {
        console.log(`\n${day.date} (${day.weekday})`);
        for (const s of day.slots) {
          console.log(`  ${s.time}  ${s.name.padEnd(34)} ${s.platforms.join(", ")}`);
        }
      }
      console.log(`\nถึงเวลาแล้วตอนนี้: ${dueSlots(config).map((s) => s.slot_id).join(", ") || "-"}`);
      break;
    }

    case "plan": {
      const res = await planAhead({ days: Number(flag("days", 7)), refill: has("refill") });
      console.log(ok(`สร้างดราฟต์ใหม่ ${res.created.length} รายการ`));
      for (const i of res.created) {
        const what = i.video_file ?? (i.image_files?.length ? `${i.image_files.length} รูป` : i.listing_id ?? "-");
        console.log(`  ${i.id}  ${String(i.source).padEnd(9)} ${what}`);
      }
      const unfilled = res.skipped.filter((s) => !s.reason.startsWith("มีอยู่แล้ว"));
      if (unfilled.length) {
        console.log(`\nช่องที่ยังไม่มีของ ${unfilled.length}:`);
        for (const s of unfilled) console.log(`  ${s.slot_id}  ${s.reason}`);
      }
      if (res.missing_required.length) {
        console.log(bad(`\n⚠ ช่องคลิปประจำวันว่าง ${res.missing_required.length} วัน — เพจจะไม่มีคลิปลงวันนั้น`));
        for (const m of res.missing_required) console.log(bad(`  ${m.slot_id}  ${m.reason}`));
      }
      break;
    }

    case "list": {
      const q = await loadQueue();
      const date = flag("date");
      const items = date ? q.items.filter((i) => i.date === date) : q.items;
      for (const i of items) {
        const colour = i.status === "POSTED" ? ok : i.status === "FAILED" ? bad : (s) => s;
        console.log(`${colour(i.status.padEnd(7))} ${i.id}  ${i.platforms.join(",")}`);
        console.log(dim(`        ${i.video_file ?? i.image_files?.[0] ?? "-"}  |  ${(i.caption || "").split("\n")[0].slice(0, 70)}`));
      }
      console.log(dim(`\nรวม ${items.length} รายการ · ไฟล์คิว: ${path.join(CONTENT_DIR, "queue.json")}`));
      break;
    }

    case "ready":
      console.log(await patchItem(args[1], { status: "READY" }));
      break;

    case "post": {
      const id = args[1];
      if (!id) throw new Error("ต้องระบุ slot_id เช่น 2026-08-01T19:00");
      const live = has("live");
      if (!live) console.log(dim("โหมดซ้อม (ไม่ใส่ --live) จะไม่มีอะไรถูกโพสต์จริง"));
      const res = await publishItem(id, { dry_run: !live });
      if (res.skipped) {
        console.log(dim(res.reason));
        break;
      }
      console.log(`สถานะ: ${res.publish.status}`);
      for (const d of res.publish.published_destinations) {
        const mark = d.ok ? ok("✓") : bad("✗");
        console.log(`  ${mark} ${d.platform.padEnd(17)} ${d.publish_url ?? d.kit_dir ?? d.error_message ?? ""}`);
      }
      break;
    }

    case "schedule-fb": {
      // Push queued items into Meta's Planner as scheduled posts. Only destinations
      // Meta can schedule are touched; the group kits are unaffected.
      const live = has("live");
      const days = Number(flag("days", 7));
      const q = await loadQueue();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
      const candidates = q.items.filter(
        (i) =>
          i.date >= today &&
          i.date <= new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10) &&
          ["DRAFT", "READY"].includes(i.status) &&
          i.platforms.some((p) => p === "FACEBOOK_PAGE" || p === "FACEBOOK_REELS")
      );

      if (!candidates.length) {
        console.log(dim("ไม่มีรายการที่ตั้งเวลาลงเพจได้ในช่วงนี้ (ลอง plan ก่อน)"));
        break;
      }
      if (!live) console.log(dim("โหมดซ้อม (ไม่ใส่ --live) ยังไม่มีอะไรถูกส่งเข้าเพจ"));

      for (const item of candidates) {
        const res = await publishItem(item.id, { dry_run: !live, schedule: true });
        if (res.skipped) {
          console.log(dim(`  ${item.id}  ${res.reason}`));
          continue;
        }
        for (const d of res.publish.published_destinations) {
          if (!["FACEBOOK_PAGE", "FACEBOOK_REELS"].includes(d.platform)) continue;
          const mark = d.ok ? ok("✓") : bad("✗");
          console.log(`  ${mark} ${item.id}  ${d.platform.padEnd(15)} ${d.scheduled_for ?? d.error_message ?? ""}`);
        }
      }
      console.log(dim("\nดู/แก้/กดโพสต์ก่อนเวลาได้ที่ Meta Business Suite > Planner"));
      break;
    }

    case "run": {
      // --live forces posting, --draft forces rehearsal, neither defers to
      // auto_publish in content/page.profile.json.
      const res = await runDue({ dry_run: has("live") ? false : has("draft") ? true : null });
      console.log(`รันเมื่อ ${res.date} · โหมด ${res.auto_publish ? ok("โพสต์จริง") : dim("เตรียมไว้เฉยๆ")}`);
      console.log(`เตรียมดราฟต์ใหม่ ${res.planned} · ช่องที่ถึงเวลา ${res.due}`);
      for (const h of res.handled) {
        console.log(`  ${h.slot_id}  ${h.action}${h.detail ? ` — ${h.detail}` : ""}`);
        for (const d of h.destinations ?? []) {
          console.log(`      ${d.ok ? ok("✓") : bad("✗")} ${d.platform} ${d.url ?? d.error ?? ""}`);
        }
      }
      if (!res.auto_publish) console.log(dim("\nจะให้โพสต์เองอัตโนมัติ ตั้ง auto_publish = true ใน content/page.profile.json"));
      break;
    }

    case "sheet:export": {
      const text = await exportSheet({ format: has("tsv") ? "tsv" : "csv", days: Number(flag("days", 14)) });
      const out = flag("out", path.join(CONTENT_DIR, has("tsv") ? "drafts.tsv" : "drafts.csv"));
      await writeFile(out, text, "utf8");
      console.log(ok(`เขียนแล้ว: ${out}`));
      console.log(dim("เปิด Google Sheet > File > Import > Upload ไฟล์นี้ แก้ช่อง caption/status แล้วดาวน์โหลดกลับเป็น CSV"));
      break;
    }

    case "sheet:import": {
      const file = args[1];
      if (!file) throw new Error("ต้องระบุไฟล์ CSV ที่ดาวน์โหลดจากชีต");
      const res = await importSheet(await readFile(file, "utf8"));
      console.log(ok(`อัปเดต ${res.applied.length} รายการ`));
      for (const a of res.applied) console.log(`  ${a.id}  ${a.changed.join(", ")}`);
      for (const i of res.ignored) console.log(dim(`  ข้าม ${i.id}: ${i.reason}`));
      break;
    }

    case "page:pull": {
      const res = await ingestPagePosts({ limit: Number(flag("limit", 50)) });
      console.log(ok(`ดึงมา ${res.fetched} โพสต์ · เก็บสะสมรวม ${res.total_archived}`));
      break;
    }

    case "page:top": {
      for (const p of await topPosts({ limit: Number(flag("limit", 20)) })) {
        console.log(`${String(p.engaged_users ?? 0).padStart(6)} คน  ${p.created_time?.slice(0, 10)}  ${(p.message || "").split("\n")[0].slice(0, 60)}`);
      }
      break;
    }

    case "page:csv": {
      const out = flag("out", path.join(CONTENT_DIR, "page-posts.csv"));
      await writeFile(out, await archiveToCsv(), "utf8");
      console.log(ok(`เขียนแล้ว: ${out}`));
      break;
    }

    case "kits": {
      const kits = await listKits();
      if (!kits.length) console.log(dim("ยังไม่มีชุดโพสต์ — สร้างด้วย `post <slot_id>` ที่มี MANUAL_KIT เป็นปลายทาง"));
      for (const k of kits) console.log(`${k.slug}\n${dim(`  ${k.kit_dir}\n  ${k.files.join(", ")}`)}`);
      break;
    }

    case "profile": {
      const setIdx = args.indexOf("--set");
      if (setIdx !== -1) {
        const profile = await loadProfile();
        for (const pair of args.slice(setIdx + 1).filter((a) => a.includes("="))) {
          const [k, ...rest] = pair.split("=");
          const v = rest.join("=");
          profile[k] = v === "true" ? true : v === "false" ? false : v;
        }
        await saveProfile(profile);
      }
      console.log(await loadProfile());
      break;
    }

    case "schedule:init": {
      const file = await saveScheduleConfig(DEFAULT_SCHEDULE);
      console.log(ok(`เขียนตารางเริ่มต้นแล้ว: ${file}`));
      console.log(dim("แก้เวลา/แพลตฟอร์มได้ในไฟล์นี้โดยตรง ไม่ต้องแตะโค้ด"));
      break;
    }

    default:
      usage();
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((err) => {
  console.error(bad(`ผิดพลาด: ${err.message}`));
  process.exitCode = 1;
});
