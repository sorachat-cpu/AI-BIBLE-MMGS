// WF3 advertisement layout. No paid API is touched: the price/caption cases are pure
// functions and the input case stops at validation before any rendering.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPriceThb, buildWf3Caption, runWf3Ad, Wf3AdError } from "../src/engines/wf3-ad.mjs";

// WF-REALESTATE-3WF-SPEC.md WF3: "ห้าม แก้ตัวเลข / ปัดราคา / สร้างราคาเอง".
test("price is grouped for reading but never rounded", () => {
  assert.equal(formatPriceThb(1590000), "1,590,000 บาท");
  assert.equal(formatPriceThb(1590500), "1,590,500 บาท");
  assert.equal(formatPriceThb(390000), "390,000 บาท");
});

test("an unknown price yields nothing rather than a guess", () => {
  for (const v of [null, undefined, "", "ติดต่อสอบถาม", NaN, -1]) {
    assert.equal(formatPriceThb(v), null, `${String(v)} should not produce a price`);
  }
});

test("the caption carries only the fields that were actually confirmed", () => {
  const caption = buildWf3Caption({
    title: "ที่ดินวิวเขา",
    price_text: "1,590,000 บาท",
    features: ["ติดถนนลาดยาง", "ถมแล้ว"],
    contact: "081-234-5678",
  });
  assert.match(caption, /ที่ดินวิวเขา/);
  assert.match(caption, /ราคา 1,590,000 บาท/);
  assert.match(caption, /• ติดถนนลาดยาง/);
  // Nothing was supplied for these, so no empty label may appear.
  assert.doesNotMatch(caption, /เนื้อที่/);
  assert.doesNotMatch(caption, /ทำเล/);
});

// Spec caps the selling points at 3-5; past that it stops being a hierarchy.
test("the caption keeps at most five selling points", () => {
  const caption = buildWf3Caption({ features: ["ก", "ข", "ค", "ง", "จ", "ฉ", "ช"] });
  assert.equal(caption.split("\n").filter((l) => l.startsWith("•")).length, 5);
  assert.doesNotMatch(caption, /ฉ|ช/);
});

test("WF3 rejects a malformed property id before rendering anything", async () => {
  await assert.rejects(
    () => runWf3Ad({ property_id: "nope", house_image_url: "https://example.com/h.jpg" }),
    (err) => err instanceof Wf3AdError && err.code === "ERR_WF3_INPUT"
  );
});

// FINAL FRAME WF2 = FIRST FRAME WF3 is the spec's master continuity rule, so WF3 cannot
// invent an opening image when none was handed over.
test("WF3 refuses to run without the finished-house frame from WF2", async () => {
  await assert.rejects(
    () => runWf3Ad({ property_id: "PROP-TH-09999", price_thb: 1590000 }),
    (err) => err instanceof Wf3AdError && err.code === "ERR_WF3_INPUT"
  );
});
