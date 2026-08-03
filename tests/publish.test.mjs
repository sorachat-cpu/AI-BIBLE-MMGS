// Offline tests for the publish path. No network, no API keys, no credits spent:
// captions fall back to the deterministic template when ANTHROPIC_API_KEY is absent,
// and every destination is either dry_run or unconfigured.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enforceLimit,
  condenseCaption,
  formatPriceThb,
  fallbackCaption,
  containsBannedClaim,
  sanitizeCaption,
} from "../src/publish/captions.mjs";
import { publishReadiness, missingCredentials } from "../src/publish/platforms.mjs";
import { runPublishEngine, resolveMediaPath } from "../src/engines/publish-engine.mjs";
import { buildSchedule, nextSlots, dueSlots } from "../src/content/calendar.mjs";
import { toCsv, fromCsv } from "../src/content/sheet.mjs";
import { toScheduledUnix } from "../src/publish/adapters/facebook.mjs";

const POST = {
  title: "ที่ดินเปล่า ถมแล้ว ติดถนน",
  price_thb: 2_500_000,
  location: "องครักษ์ นครนายก",
  highlight_features: ["ที่ดิน 1 ไร่", "ถมแล้ว", "ติดถนนคอนกรีต"],
  contact_method: "LINE @244raxjb",
};

const NO_KEYS = { PATH: process.env.PATH }; // an env with no credentials at all

test("formatPriceThb renders Thai millions without trailing zeros", () => {
  assert.equal(formatPriceThb(12_900_000), "12.9 ล้านบาท");
  assert.equal(formatPriceThb(2_000_000), "2 ล้านบาท");
  assert.equal(formatPriceThb(850_000), "850,000 บาท");
  assert.equal(formatPriceThb(null), "สอบถามราคา");
});

test("enforceLimit counts Thai characters, not UTF-8 bytes", () => {
  const thai = "ที่ดินสวยมากนครนายก";
  assert.equal([...thai].length, 19);
  assert.equal(enforceLimit(thai, 100), thai);
  // A byte-based limiter would have cut this; a codepoint-based one keeps it whole.
  assert.ok([...enforceLimit(thai, 19)].length <= 19);
});

test("enforceLimit drops the hashtag block before cutting the sentence", () => {
  const caption = "ที่ดินองครักษ์ ราคาดี\n\n#ที่ดิน #นครนายก #ขายที่ดิน";
  const trimmed = enforceLimit(caption, 25);
  assert.ok(!trimmed.includes("#"), "hashtags should go first");
  assert.ok(trimmed.startsWith("ที่ดิน"));
});

test("YouTube Shorts fallback caption respects the 100 char hard cap", () => {
  const caption = fallbackCaption("YOUTUBE_SHORTS", POST);
  assert.ok([...caption].length <= 100, `got ${[...caption].length} chars`);
});

test("banned promotional claims are detected", () => {
  assert.deepEqual(containsBannedClaim("ที่ดินดีที่สุดในนครนายก การันตี"), ["ดีที่สุด", "การันตี"]);
  assert.deepEqual(containsBannedClaim("ที่ดิน 1 ไร่ ถมแล้ว"), []);
});

test("readiness reports missing env instead of throwing", () => {
  const rows = publishReadiness(NO_KEYS);
  const kit = rows.find((r) => r.platform === "MANUAL_KIT");
  assert.equal(kit.ready, true, "manual kit needs no credentials");
  const fb = rows.find((r) => r.platform === "FACEBOOK_PAGE");
  assert.equal(fb.ready, false);
  assert.deepEqual(fb.missing_env, ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]);
});

test("LINE text-only broadcast does not require a media host", () => {
  const env = { LINE_CHANNEL_ACCESS_TOKEN: "x" };
  assert.deepEqual(missingCredentials("LINE_OA", { env, needsMedia: false }), []);
  assert.deepEqual(missingCredentials("LINE_OA", { env, needsMedia: true }), ["PUBLIC_MEDIA_BASE_URL"]);
});

test("resolveMediaPath accepts bare names, /output/ urls and absolute paths", () => {
  assert.ok(resolveMediaPath("a.mp4").endsWith("/output/a.mp4"));
  assert.ok(resolveMediaPath("/output/a.mp4").endsWith("/output/a.mp4"));
  assert.equal(resolveMediaPath("/tmp/a.mp4"), "/tmp/a.mp4");
  assert.equal(resolveMediaPath(null), null);
});

test("unconfigured destinations report ERR_PUB_03 rather than failing the run", async () => {
  const out = await runPublishEngine(
    {
      property_id: "PROP-TH-01029",
      post: { ...POST, text_only: true },
      target_platforms: ["FACEBOOK_PAGE", "TIKTOK", "YOUTUBE_SHORTS"],
      dry_run: true,
    },
    { env: NO_KEYS }
  );
  assert.equal(out.status, "DRY_RUN");
  assert.equal(out.published_destinations.length, 3);
  for (const d of out.published_destinations) {
    assert.equal(d.error_code, "ERR_PUB_03", `${d.platform}: ${d.error_message}`);
    assert.ok(d.caption_used, "a caption is still written so it can be reviewed");
  }
});

// The caption a queue item carries is written once and reused for every destination, so
// the tightest cap overflows on nearly every video slot. It gets condensed, not refused.
const LONG_OVERRIDE =
  "ที่ดินสวยทำเลดีที่นครนายก พร้อมโฉนดจดทะเบียน ปลอดภัยและพร้อมโอนได้ทันที 🏡 " +
  "เจ้าของขายเองตรงๆ ไม่มีคนกลาง\n\nสนใจติดต่อเพจนี้หรือ LINE @244raxjb มาดูพื้นที่ได้เลย 📲\n\n" +
  "#ที่ดินนครนายก #ขายที่ดิน #เจ้าของขายเอง #โฉนดพร้อมโอน #ลงทุนที่ดิน";

test("condenseCaption keeps whole sentences and drops the hashtags that do not fit", () => {
  const out = condenseCaption(LONG_OVERRIDE, 100);
  assert.ok([...out].length <= 100, `got ${[...out].length} chars`);
  assert.ok(out.startsWith("ที่ดินสวยทำเลดีที่นครนายก"), "the opening sentence survives intact");
  assert.ok(!out.includes("\n"), "condensed to a single line");
  assert.ok(!/#\S*$/.test(out) || out.includes("#ที่ดินนครนายก"), "any surviving hashtag is a whole one");
});

test("condenseCaption returns text untouched when it already fits", () => {
  assert.equal(condenseCaption(LONG_OVERRIDE, 5000), LONG_OVERRIDE.trim());
});

test("an over-long override caption is condensed per platform, not rejected", async () => {
  const out = await runPublishEngine(
    {
      property_id: "PROP-TH-01029",
      post: { ...POST, text_only: true },
      target_platforms: ["YOUTUBE_SHORTS", "FACEBOOK_PAGE"],
      captions: { ALL: LONG_OVERRIDE },
      dry_run: true,
    },
    { env: NO_KEYS }
  );
  const yt = out.published_destinations.find((d) => d.platform === "YOUTUBE_SHORTS");
  const fb = out.published_destinations.find((d) => d.platform === "FACEBOOK_PAGE");

  assert.notEqual(yt.error_code, "ERR_PUB_05", "length alone must not cost the slot");
  assert.ok(yt.caption_chars <= 100, `Shorts caption was ${yt.caption_chars} chars`);
  assert.ok(out.warnings.some((w) => w.includes("YOUTUBE_SHORTS") && w.includes("ย่อ caption")));

  assert.equal(fb.caption_used, LONG_OVERRIDE, "a page post is nowhere near its cap, so it is left alone");
  assert.equal(fb.error_code, "ERR_PUB_03", "only credentials are missing");
});

test("publish refuses a post with no media and no text_only flag", async () => {
  await assert.rejects(
    () => runPublishEngine({ property_id: "PROP-TH-01029", post: POST }, { env: NO_KEYS }),
    /ต้องมีวิดีโอหรือรูป/
  );
});

test("schedule builds one slot per configured time and never posts twice to a slot", () => {
  const config = {
    timezone: "Asia/Bangkok",
    slots: [
      { time: "08:00", platforms: ["FACEBOOK_PAGE"], content_type: "image" },
      { time: "19:00", platforms: ["FACEBOOK_REELS", "TIKTOK"], content_type: "video" },
    ],
  };
  const days = buildSchedule(config, { from: "2026-08-01", days: 3 });
  assert.equal(days.length, 3);
  assert.equal(days[0].slots.length, 2);
  assert.equal(days[0].slots[0].slot_id, "2026-08-01T08:00");
  assert.deepEqual(days[0].slots[1].platforms, ["FACEBOOK_REELS", "TIKTOK"]);
  const ids = days.flatMap((d) => d.slots.map((s) => s.slot_id));
  assert.equal(new Set(ids).size, ids.length, "slot ids must be unique");
});

test("nextSlots returns only slots at or after the reference time", () => {
  const config = { timezone: "Asia/Bangkok", slots: [{ time: "08:00", platforms: ["FACEBOOK_PAGE"] }, { time: "19:00", platforms: ["FACEBOOK_PAGE"] }] };
  const slots = nextSlots(config, { now: new Date("2026-08-01T12:00:00+07:00"), days: 1 });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].slot_id, "2026-08-01T19:00");
});

test("scheduled posts are validated against Meta's 10min-6month window", () => {
  const inMinutes = (n) => new Date(Date.now() + n * 60_000).toISOString();

  assert.equal(toScheduledUnix(null), null, "no schedule means publish now");
  assert.equal(
    toScheduledUnix(inMinutes(60)),
    Math.floor((Date.now() + 60 * 60_000) / 1000),
    "an hour out is fine"
  );
  // Meta rejects these outright; catching it here names the real limit instead of
  // surfacing an opaque Graph error after the video has already been uploaded.
  assert.throws(() => toScheduledUnix(inMinutes(5)), /10 นาที ถึง 6 เดือน/);
  assert.throws(() => toScheduledUnix(inMinutes(-60)), /10 นาที ถึง 6 เดือน/);
  assert.throws(() => toScheduledUnix(inMinutes(200 * 24 * 60)), /10 นาที ถึง 6 เดือน/);
  assert.throws(() => toScheduledUnix("ไม่ใช่วันที่"), /เวลาตั้งโพสต์ไม่ถูกต้อง/);
});

test("dueSlots claims a slot late but not forever", () => {
  const config = { timezone: "Asia/Bangkok", slots: [{ time: "19:00", platforms: ["FACEBOOK_PAGE"] }] };
  const at = (iso) => dueSlots(config, { now: new Date(iso), graceMinutes: 180 });

  assert.equal(at("2026-08-01T18:59:00+07:00").length, 0, "not yet due");
  assert.equal(at("2026-08-01T19:00:00+07:00")[0].slot_id, "2026-08-01T19:00", "due on the minute");
  assert.equal(at("2026-08-01T21:30:00+07:00")[0].slot_id, "2026-08-01T19:00", "still claimable inside grace");
  assert.equal(at("2026-08-01T23:30:00+07:00").length, 0, "past grace, the day is missed rather than posted at midnight");
  // Just after midnight the previous evening's slot is 5h old -- out of grace -- and
  // tonight's is 19h away. Neither should fire.
  assert.equal(at("2026-08-02T00:30:00+07:00").length, 0);
});

test("CSV round-trips captions containing commas, quotes and newlines", () => {
  const rows = [
    { id: "1", caption: 'ที่ดิน 1 ไร่, ถมแล้ว "พร้อมโอน"\nสนใจทัก LINE', platforms: "FACEBOOK_PAGE|TIKTOK", status: "DRAFT" },
  ];
  const back = fromCsv(toCsv(rows));
  assert.deepEqual(back, rows);
});

// A caption that names the wrong province is not a typo to a reader -- it is an address.
test("sanitizeCaption drops a hashtag for a province the listing is not in", () => {
  const { caption, removed } = sanitizeCaption(
    "ที่ดินสวย #ที่ดินนครนายก #ขายที่ดิน #ที่ดินเชียงใหม่",
    { location: "องครักษ์ นครนายก", price_thb: 1_000_000 }
  );
  assert.ok(!caption.includes("เชียงใหม่"), "the wrong province must go");
  assert.ok(caption.includes("#ที่ดินนครนายก"), "the right one must stay");
  assert.ok(caption.includes("#ขายที่ดิน"), "province-free hashtags are untouched");
  assert.equal(removed.length, 1);
});

test("sanitizeCaption strips foreign script that bled into Thai text", () => {
  const { caption, removed } = sanitizeCaption("ที่ดินสวย #สินค้าอ動産 #ขายที่ดิน", {
    location: "นครนายก",
    price_thb: 1,
  });
  assert.ok(!caption.includes("動"), caption);
  assert.ok(caption.includes("#ขายที่ดิน"));
  assert.equal(removed.length, 1);
});

test("sanitizeCaption removes a price claim only when no price is known", () => {
  const withPrice = sanitizeCaption("ที่ดินราคาถูก", { location: "นครนายก", price_thb: 900_000 });
  assert.ok(withPrice.caption.includes("ราคาถูก"), "a stated price is the seller's to describe");

  const noPrice = sanitizeCaption("ที่ดินราคาถูก", { location: "นครนายก", price_thb: null });
  assert.ok(!noPrice.caption.includes("ราคาถูก"), "nothing to back the claim");
  assert.equal(noPrice.removed.length, 1);
});

test("sanitizeCaption leaves a clean caption exactly as it was", () => {
  const text = "📍 ที่ดินนครนายก\n\n• โฉนดพร้อมโอน\n\n#ที่ดินนครนายก #ขายที่ดิน";
  const { caption, removed } = sanitizeCaption(text, { location: "นครนายก", price_thb: 1 });
  assert.equal(removed.length, 0);
  assert.equal(caption, text);
});

test("a stored caption with the wrong province is cleaned before it reaches a platform", async () => {
  const out = await runPublishEngine(
    {
      property_id: "PROP-TH-01029",
      post: { ...POST, text_only: true },
      target_platforms: ["FACEBOOK_PAGE"],
      captions: { ALL: "ที่ดินสวย #ที่ดินเชียงใหม่ #ขายที่ดิน" },
      dry_run: true,
    },
    { env: NO_KEYS }
  );
  const fb = out.published_destinations.find((d) => d.platform === "FACEBOOK_PAGE");
  assert.ok(!fb.caption_used.includes("เชียงใหม่"), fb.caption_used);
  assert.ok(out.warnings.some((w) => w.includes("ตัดออกจาก caption")));
});
