// WF8b (verified listing video) -- the parts that can be tested without spending money.
//
// The model-facing steps (vision classification, script writing) cost real tokens and are
// exercised by hand; what is tested here is the machinery that decides what the model is
// ALLOWED to produce, because that is where a regression would quietly let a false claim
// through rather than fail loudly.
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectPhotosForVideo,
  findForbiddenClaims,
  verifiedFactsFor,
  motionForCategory,
  cinematicMotionFor,
  CAMERA_MOTIONS,
  CINEMATIC_MOTIONS,
  MIN_CLIPS,
  MAX_CLIPS,
} from "../src/wf8b/verified.mjs";
import { planClips, buildClipPrompt } from "../src/engines/wf8b-render.mjs";

const photo = (name, category) => ({ file: `/tmp/${name}`, name, category });

test("a misleading photo is dropped, not merely ranked last", () => {
  const { selected, dropped } = selectPhotosForVideo([
    photo("a.jpg", "wide_land_view"),
    photo("bad.jpg", "unclear_or_not_for_video"),
    photo("b.jpg", "access_road"),
  ]);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].name, "bad.jpg");
  assert.ok(!selected.some((s) => s.name === "bad.jpg"));
});

test("the running order opens on the entrance and closes on a wide shot", () => {
  const { selected } = selectPhotosForVideo([
    photo("wide.jpg", "wide_land_view"),
    photo("detail.jpg", "land_detail"),
    photo("gate.jpg", "entrance_or_frontage"),
    photo("road.jpg", "access_road"),
  ]);
  assert.equal(selected[0].category, "entrance_or_frontage");
  assert.equal(selected.at(-1).category, "wide_land_view");
});

test("selection never exceeds the spec's clip ceiling", () => {
  const many = Array.from({ length: 20 }, (_, i) => photo(`p${i}.jpg`, "land_detail"));
  const { selected } = selectPhotosForVideo(many);
  assert.ok(selected.length <= MAX_CLIPS, `got ${selected.length}`);
});

test("too few usable photos warns instead of silently producing a stub", () => {
  const { selected, warning } = selectPhotosForVideo([
    photo("a.jpg", "wide_land_view"),
    photo("b.jpg", "access_road"),
  ]);
  assert.ok(selected.length < MIN_CLIPS);
  assert.match(warning, /\d/);
});

test("no usable photos at all yields an empty selection, not a throw", () => {
  const { selected, dropped } = selectPhotosForVideo([
    photo("x.jpg", "unclear_or_not_for_video"),
  ]);
  assert.equal(selected.length, 0);
  assert.equal(dropped.length, 1);
});

// --- the anti-hallucination gate -------------------------------------------

test("infrastructure and legal claims are refused", () => {
  const bad = [
    "ที่ดินแปลงนี้ติดถนนสาธารณะครับ",
    "ไฟฟ้าเข้าถึงที่ดินแล้ว",
    "น้ำประปาพร้อมใช้งาน",
    "โฉนดพร้อมโอน",
    "ที่นี่ไม่มีน้ำท่วมแน่นอน",
    "เหมาะสำหรับการลงทุนมาก",
    "ราคาถูกที่สุดในย่านนี้",
    "ห่างจากตัวเมืองเพียง 10 นาที",
  ];
  for (const line of bad) {
    assert.equal(findForbiddenClaims([line], {}).length, 1, `ควรจับได้: ${line}`);
  }
});

test("describing what is visible is allowed", () => {
  const ok = [
    "จากภาพจะเห็นถนนดินอยู่ด้านซ้ายของภาพ",
    "จากภาพจะเห็นเสาไฟฟ้าคอนกรีตพร้อมสายไฟอยู่ริมทาง",
    "บริเวณโดยรอบที่มองเห็นมีแนวภูเขาเป็นฉากหลัง",
    "ที่ดินเนื้อที่หนึ่งไร่สองงาน",
  ];
  assert.deepEqual(findForbiddenClaims(ok, {}), []);
});

test("seeing a power pole is not claiming the plot has power", () => {
  // The distinction the whole workflow rests on: the same object in frame, described
  // two ways, one of which is a claim the photograph cannot support.
  assert.equal(findForbiddenClaims(["จากภาพจะเห็นเสาไฟฟ้าอยู่ไกลออกไป"], {}).length, 0);
  assert.equal(findForbiddenClaims(["ไฟฟ้าเข้าถึงที่ดินแล้ว"], {}).length, 1);
});

test('"พร้อม" meaning "together with" is description, not a utility claim', () => {
  // Regression: the first version matched ไฟฟ้า+พร้อม anywhere and rejected a plain
  // description of a pole with wires on it, which is exactly what §1 asks the classifier
  // to produce. The sense of พร้อม is decided by what follows it.
  const describing = [
    "จากภาพจะเห็นเสาไฟฟ้าพร้อมสายไฟพาดอยู่ริมทาง",
    "เห็นเสาไฟฟ้าพร้อมหม้อแปลงอยู่ปลายทาง",
  ];
  assert.deepEqual(findForbiddenClaims(describing, {}), []);

  const claiming = ["ไฟฟ้าพร้อมใช้งานแล้ว", "น้ำประปาพร้อมแล้ว", "ไฟฟ้าต่อแล้ว"];
  for (const line of claiming) {
    assert.equal(findForbiddenClaims([line], {}).length, 1, `ควรจับได้: ${line}`);
  }
});

test("a claim the seller themselves confirmed is theirs to make", () => {
  const verified = { confirmed_highlights: ["ไฟฟ้าเข้าถึงแล้ว ผู้ขายยืนยัน"] };
  assert.deepEqual(findForbiddenClaims(["ไฟฟ้าเข้าถึงที่ดินแล้วครับ"], verified), []);
  // ...but only that claim; an unrelated one is still refused.
  assert.equal(findForbiddenClaims(["ที่ดินติดถนนสาธารณะ"], verified).length, 1);
});

test("the seller's caption licenses the claims it makes", () => {
  // Photos under-report; the caption is the seller's own words and outranks the camera.
  const caption = "ขายที่ดิน 2 ไร่ ถมแล้ว ติดถนนลาดยาง ไฟฟ้าเข้าถึงแล้ว";
  assert.deepEqual(
    findForbiddenClaims(["ที่ดินติดถนนลาดยาง และไฟฟ้าเข้าถึงแล้วครับ"], {}, caption),
    []
  );
});

test("the caption licenses only what it actually says", () => {
  const caption = "ขายที่ดิน 2 ไร่ ถมแล้ว ติดถนนลาดยาง";
  // Mentioned in the caption -> speakable.
  assert.deepEqual(findForbiddenClaims(["ติดถนนลาดยางครับ"], {}, caption), []);
  // Not mentioned anywhere -> still refused, caption or no caption.
  assert.equal(findForbiddenClaims(["ที่นี่ไม่มีน้ำท่วม"], {}, caption).length, 1);
  assert.equal(findForbiddenClaims(["โฉนดพร้อมโอน"], {}, caption).length, 1);
});

test("an empty caption changes nothing", () => {
  assert.equal(findForbiddenClaims(["ไฟฟ้าเข้าถึงที่ดินแล้ว"], {}, "").length, 1);
  assert.equal(findForbiddenClaims(["ไฟฟ้าเข้าถึงที่ดินแล้ว"], {}).length, 1);
});

// --- verified_details ------------------------------------------------------

test("blank fields are omitted rather than defaulted", () => {
  const facts = verifiedFactsFor({ location: "ปากพลี", land_size: "  ", asking_price: "" });
  assert.deepEqual(facts.map((f) => f.key), ["location"]);
});

test("every confirmed highlight becomes its own speakable fact", () => {
  const facts = verifiedFactsFor({ confirmed_highlights: ["ติดคลอง", "ถมแล้ว", ""] });
  assert.equal(facts.filter((f) => f.key === "confirmed_highlight").length, 2);
});

// --- camera motion ---------------------------------------------------------

test("camera motion always resolves to one of the five allowed moves", () => {
  const cases = [
    ["access_road", undefined],
    ["wide_land_view", "orbit around the property"], // not in the enum
    ["surrounding_view", CAMERA_MOTIONS[1]],
    ["totally_unknown_category", undefined],
  ];
  for (const [category, requested] of cases) {
    assert.ok(CAMERA_MOTIONS.includes(motionForCategory(category, requested)));
  }
});

test("an invented camera move is replaced, not passed through", () => {
  const motion = motionForCategory("wide_land_view", "aerial flythrough over the plot");
  assert.ok(!/aerial|flythrough/.test(motion));
});

// --- cinematic style (added 2026-08-23) ------------------------------------

test("cinematic moves are chosen by whether the photo was airborne", () => {
  // An orbit or a jib only makes sense from a shot that was already in the air.
  const ground = cinematicMotionFor("ground", "wide_land_view");
  const aerial = cinematicMotionFor("aerial", "wide_land_view");
  assert.ok(CINEMATIC_MOTIONS.ground.some((m) => m.id === ground.id));
  assert.ok(CINEMATIC_MOTIONS.aerial.some((m) => m.id === aerial.id));
});

test("the orbit is never the automatic choice", () => {
  // It fabricates the far side of the plot, so it has to be asked for by name rather
  // than arriving because someone picked the cinematic style.
  for (const category of ["wide_land_view", "land_detail", "entrance_or_frontage", "surrounding_view"]) {
    assert.notEqual(cinematicMotionFor("aerial", category).id, "orbit", `auto-picked orbit for ${category}`);
  }
  assert.equal(cinematicMotionFor("aerial", "wide_land_view", "orbit").id, "orbit");
});

test("every risky cinematic move explains its own risk", () => {
  for (const pool of Object.values(CINEMATIC_MOTIONS)) {
    for (const m of pool) {
      assert.ok(m.id && m.label && m.text, `${m.id} incomplete`);
      // `risk` is either null or a sentence a person can act on -- never `true`.
      if (m.risk !== null) assert.equal(typeof m.risk, "string");
    }
  }
  assert.ok(CINEMATIC_MOTIONS.aerial.find((m) => m.id === "orbit").risk);
});

test("no cinematic prompt asks the model to draw property boundaries", () => {
  // A model-drawn boundary line reads as the real parcel edge, and land boundaries are
  // a legal claim -- the most consequential thing this pipeline could invent.
  for (const pool of Object.values(CINEMATIC_MOTIONS)) {
    for (const m of pool) {
      assert.ok(!/boundar/i.test(m.text), `${m.id} mentions boundaries: ${m.text}`);
    }
  }
});

test("a road shot tracks along the road rather than sweeping past it", () => {
  assert.equal(cinematicMotionFor("ground", "access_road").id, "tracking");
});

test("clip planning prices the run and surfaces risky clips up front", () => {
  const selected = [
    { name: "a.jpg", category: "wide_land_view", viewpoint: "aerial", cinematic_id: "orbit" },
    { name: "b.jpg", category: "access_road", viewpoint: "ground" },
  ];
  const plan = planClips(selected, "cinematic");
  assert.equal(plan.clips.length, 2);
  assert.ok(plan.cost_usd > 0);
  // Two 5s clips overlapping 0.3s once.
  assert.equal(plan.duration_seconds, 9.7);
  assert.equal(plan.risky.length, 1);
  assert.equal(plan.risky[0].motion_id, "orbit");
});

test("both styles keep the no-burned-in-text rule", () => {
  // Rule 1 of 03_SYSTEM_RULES.md is not a stylistic preference — a price or phone number
  // baked into the pixels cannot be corrected without paying to regenerate.
  const photo = { viewpoint: "aerial", category: "wide_land_view", camera_motion: CAMERA_MOTIONS[1] };
  for (const style of ["preserve", "cinematic"]) {
    assert.match(buildClipPrompt(photo, style).prompt, /no text/i);
    assert.match(buildClipPrompt(photo, style).prompt, /watermark/i);
  }
});
