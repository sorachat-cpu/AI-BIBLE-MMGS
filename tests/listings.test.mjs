// Offline tests for the land sheet, the short group caption, and the content mix.
// No network, no API keys: extraction (which needs Haiku) is exercised end to end by
// `npm run publish -- listings:import`, while everything deterministic is pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findMapsUrl,
  findCoordinates,
  splitPosts,
  buildGroupCaption,
  pickListing,
  claimsOwnerSale,
  NEARBY_LIMIT,
} from "../src/content/listings.mjs";
import { DEFAULT_SCHEDULE, buildSchedule } from "../src/content/calendar.mjs";
import { TOPICS, pickTopic, getTopic } from "../src/content/topics.mjs";

const LISTING = {
  listing_id: "LAND-0001",
  title: "ที่ดิน 2 ไร่ องครักษ์",
  size_text: "2 ไร่ 1 งาน",
  price_thb: 2_800_000,
  location: "องครักษ์ นครนายก",
  maps_url: "https://maps.app.goo.gl/abc123",
  highlights: ["ถมแล้ว", "ติดถนนลาดยาง", "ไฟฟ้าถึงที่"],
  nearby: [
    { label: "ตลาด", line: "ใกล้ตลาด 800 ม." },
    { label: "โรงเรียน", line: "ใกล้โรงเรียน 1.2 กม." },
    { label: "โรงพยาบาล", line: "ใกล้โรงพยาบาล 3.4 กม." },
  ],
  contact: "LINE @244raxjb",
  owner_sale: true,
  status: "NEW",
};

test("findMapsUrl recognises every link shape people actually paste", () => {
  assert.equal(
    findMapsUrl("แผนที่ https://maps.app.goo.gl/aBcD1234 ครับ"),
    "https://maps.app.goo.gl/aBcD1234"
  );
  assert.equal(
    findMapsUrl("https://www.google.com/maps/@14.1035,101.0700,17z"),
    "https://www.google.com/maps/@14.1035,101.0700,17z"
  );
  // Trailing Thai sentence punctuation must not end up inside the URL.
  assert.equal(findMapsUrl("ดูที่ https://goo.gl/maps/xyz789."), "https://goo.gl/maps/xyz789");
  assert.equal(findMapsUrl("ไม่มีลิงก์ในโพสต์นี้"), null);
});

test("findCoordinates picks up a bare lat,lng pair", () => {
  assert.equal(findCoordinates("พิกัด 14.103500, 101.070000"), "14.103500,101.070000");
  // A price is not a coordinate pair: too few decimals to match.
  assert.equal(findCoordinates("ราคา 2.8 ล้าน, ลด 0.1"), null);
});

test("splitPosts separates on --- and drops fragments", () => {
  const posts = splitPosts(`ขายที่ดินแปลงแรก ถมแล้ว ติดถนน ราคาคุยกันได้ครับ
---
ขายที่ดินแปลงสอง ใกล้ตลาด เหมาะปลูกบ้าน สนใจทักได้
---
สั้นไป`);
  assert.equal(posts.length, 2);
  assert.ok(posts[0].startsWith("ขายที่ดินแปลงแรก"));
});

test("group caption stays short and leads with price and size", () => {
  const caption = buildGroupCaption(LISTING, { profile: {} });
  const lines = caption.split("\n").filter(Boolean);

  assert.ok([...caption].length < 320, `caption is ${[...caption].length} chars -- too long for a group post`);
  assert.ok(lines.length <= 9, `${lines.length} lines is more than a group post should be`);
  assert.ok(lines[0].includes("2 ไร่ 1 งาน") && lines[0].includes("องครักษ์"));
  assert.ok(lines[1].includes("2.8 ล้าน"));
  assert.ok(caption.includes("https://maps.app.goo.gl/abc123"), "the map link is the whole point");
  assert.ok(caption.includes("@244raxjb"));
});

test("group caption caps the bullet block at four lines", () => {
  // 3 highlights + 3 nearby = 6 candidates, but a Thai group post that long stops being read.
  const bullets = buildGroupCaption(LISTING, { profile: {} })
    .split("\n")
    .filter((l) => l.startsWith("• "));
  assert.equal(bullets.length, 4);
});

test("group caption degrades cleanly with almost no data", () => {
  const caption = buildGroupCaption(
    { listing_id: "LAND-9", location: "ปากพลี นครนายก" },
    { profile: { contact_method: "แชทเพจ" } }
  );
  assert.ok(caption.includes("สอบถามราคา"), "no price must not render as null or NaN");
  assert.ok(!caption.includes("undefined") && !caption.includes("null"));
  assert.ok(caption.includes("แชทเพจ"));
});

test('"เจ้าของขายเอง" is only printed when the source post claimed it', () => {
  // Many groups ban agent posts, so an unearned owner badge is both a false claim about
  // who is selling and a fast way to get removed from the group.
  assert.equal(claimsOwnerSale("ลดเหลือ 3.9 ล้าน ต่อรองกับเจ้าของได้ขายเองจ้า"), true);
  assert.equal(claimsOwnerSale("ขายกิจการรีสอร์ท ติดต่อ 094-887-4343 (คุณพลอย)"), false);

  assert.ok(buildGroupCaption(LISTING, {}).includes("(เจ้าของขายเอง)"));
  assert.ok(!buildGroupCaption({ ...LISTING, owner_sale: false }, {}).includes("เจ้าของขายเอง"));
});

test("nearby enrichment is capped at three categories", () => {
  assert.equal(NEARBY_LIMIT, 3);
  const many = { ...LISTING, nearby: Array.from({ length: 7 }, (_, i) => ({ line: `ใกล้ที่ ${i}` })) };
  const bullets = buildGroupCaption({ ...many, highlights: [] }, { profile: {} })
    .split("\n")
    .filter((l) => l.startsWith("• "));
  assert.ok(bullets.length <= NEARBY_LIMIT + 1);
});

test("pickListing takes the longest unposted first", () => {
  const now = new Date("2026-08-10T09:30:00+07:00");
  const items = [
    { listing_id: "A", status: "POSTED", last_group_post: "2026-08-05T09:30:00.000Z" },
    { listing_id: "B", status: "READY", last_group_post: "2026-07-01T09:30:00.000Z" },
    { listing_id: "C", status: "READY", last_group_post: null },
    { listing_id: "D", status: "SOLD", last_group_post: null },
  ];
  assert.equal(pickListing(items, { now }).listing_id, "C", "never posted beats posted-long-ago");
  // excludeIds is only a tie-breaker; "never posted" still outranks it. Skipping a plot
  // for real is the job of postedAt, which the planner keeps as it books each slot.
  assert.equal(pickListing(items, { now, postedAt: { C: now.toISOString() } }).listing_id, "B");
  // SOLD is never offered, even when it is the only thing left.
  assert.equal(pickListing([items[3]], { now }), null);
});

test("a plot cannot go out twice inside 24 hours", () => {
  const items = [{ listing_id: "A", status: "READY", last_group_post: "2026-08-10T02:30:00.000Z" }];
  const at = (iso) => pickListing(items, { now: new Date(iso) });

  assert.equal(at("2026-08-10T20:00:00Z"), null, "17h later is still inside the cooldown");
  assert.equal(at("2026-08-11T02:29:00Z"), null, "one minute short still counts");
  assert.equal(at("2026-08-11T02:31:00Z").listing_id, "A", "past 24h it is eligible again");
});

test("the 24h rule is never relaxed, even when it leaves the slot empty", () => {
  // Unlike the clip rotation -- which repeats rather than skip a day -- reposting the
  // same land inside a day across the same groups is what gets an account restricted.
  const items = [{ listing_id: "A", status: "READY", last_group_post: "2026-08-10T09:00:00.000Z" }];
  assert.equal(pickListing(items, { now: new Date("2026-08-10T18:00:00Z"), excludeIds: [] }), null);
});

test("pickListing cycles through every plot before repeating any", () => {
  const items = ["A", "B", "C"].map((id) => ({ listing_id: id, status: "NEW", last_group_post: null }));
  const postedAt = {};
  const order = [];

  // One slot a day for six days, exactly how the planner drives it.
  for (let day = 1; day <= 6; day++) {
    const now = new Date(`2026-08-${String(day).padStart(2, "0")}T09:30:00+07:00`);
    const pick = pickListing(items, { now, postedAt });
    assert.ok(pick, `day ${day} found no eligible plot`);
    postedAt[pick.listing_id] = now.toISOString();
    order.push(pick.listing_id);
  }

  assert.deepEqual(new Set(order.slice(0, 3)), new Set(["A", "B", "C"]), "first pass covers every plot");
  assert.deepEqual(order.slice(0, 3), order.slice(3), "then the cycle repeats in the same order");
});

test("postedAt projections override what the sheet recorded", () => {
  const items = [
    { listing_id: "A", status: "READY", last_group_post: null },
    { listing_id: "B", status: "READY", last_group_post: null },
  ];
  const now = new Date("2026-08-10T09:30:00+07:00");
  // A is booked for earlier today by an earlier slot in the same planning run.
  const pick = pickListing(items, { now, postedAt: { A: "2026-08-10T01:00:00.000Z" } });
  assert.equal(pick.listing_id, "B");
});

test("every single day gets one clip and one land post", () => {
  for (const day of buildSchedule(DEFAULT_SCHEDULE, { from: "2026-08-01", days: 14 })) {
    const clips = day.slots.filter((s) => s.source === "stock" && s.required);
    const sales = day.slots.filter((s) => s.source === "listing");
    assert.equal(clips.length, 1, `${day.date} (${day.weekday}) has ${clips.length} clip slots`);
    assert.equal(clips[0].aspect, "9:16", "the daily clip is the vertical short-form one");
    assert.equal(sales.length, 1, `${day.date} (${day.weekday}) has ${sales.length} land post slots`);
    assert.deepEqual(sales[0].platforms, ["MANUAL_KIT"], "land posts go out as a paste-it-yourself kit");
  }
});

test("every day carries 2-3 posts, never more", () => {
  for (const day of buildSchedule(DEFAULT_SCHEDULE, { from: "2026-08-01", days: 14 })) {
    assert.ok(
      day.slots.length >= 2 && day.slots.length <= 3,
      `${day.date} has ${day.slots.length} posts`
    );
  }
});

test("knowledge carousels run three times a week so the feed is not all sales", () => {
  const week = buildSchedule(DEFAULT_SCHEDULE, { from: "2026-08-03", days: 7 }); // a full Mon-Sun
  const carouselDays = week.filter((d) => d.slots.some((s) => s.source === "carousel"));
  assert.equal(carouselDays.length, 3);
  assert.deepEqual(carouselDays.map((d) => d.weekday), ["MON", "WED", "FRI"]);
});

test("the two everyday slots are far enough apart not to collide", () => {
  const [day] = buildSchedule(DEFAULT_SCHEDULE, { from: "2026-08-01", days: 1 });
  const times = day.slots.map((s) => s.time);
  assert.equal(new Set(times).size, times.length, "two posts must never share a slot time");
  assert.deepEqual([...times].sort(), times, "slots come back in chronological order");
});

test("every topic fits the slide layout it will be rendered into", () => {
  for (const topic of TOPICS) {
    assert.ok(topic.title.length <= 3, `${topic.id}: cover fits 3 title lines`);
    assert.ok(topic.points.length >= 4, `${topic.id}: too thin to be worth a carousel`);
    for (const [i, p] of topic.points.entries()) {
      assert.ok(p.heading.length <= 2, `${topic.id} point ${i + 1}: heading fits 2 lines`);
      assert.ok(p.lines.length <= 4, `${topic.id} point ${i + 1}: body fits 4 lines`);
      // Nothing wraps in the SVG, so an over-long line runs off the canvas.
      for (const line of p.lines) {
        assert.ok([...line].length <= 40, `${topic.id} point ${i + 1}: "${line}" is ${[...line].length} chars`);
      }
    }
    assert.ok(topic.cta?.headline?.length, `${topic.id}: needs a closing slide`);
    assert.ok(topic.caption?.length, `${topic.id}: needs a post caption`);
  }
});

test("topic rotation returns the least recently used", () => {
  const usage = Object.fromEntries(TOPICS.map((t, i) => [t.id, `2026-07-${String(10 + i).padStart(2, "0")}`]));
  assert.equal(pickTopic(usage).id, TOPICS[0].id);
  assert.equal(pickTopic(usage, { excludeIds: [TOPICS[0].id] }).id, TOPICS[1].id);
  // An unused topic sorts before every used one.
  assert.equal(pickTopic({ ...usage, [TOPICS[3].id]: undefined }).id, TOPICS[3].id);
});

test("getTopic names the valid options when asked for one that does not exist", () => {
  assert.throws(() => getTopic("nope"), /ไม่รู้จักหัวข้อ/);
});
