// Pure parsing, no I/O -- see location-tags.mjs's own header for why this is pattern
// matching against the real data rather than a general Thai address parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLocationTags, tallyProvinces, tallyAreas } from "../src/lib/location-tags.mjs";

test("parseLocationTags reads the province regardless of prefix style", () => {
  assert.equal(parseLocationTags("ต.พรหมมณี อ.เมืองนครนายก จ.นครนายก").province, "นครนายก");
  assert.equal(parseLocationTags("เนินหอม ปราจีนบุรี").province, "ปราจีนบุรี");
  assert.equal(parseLocationTags("คลองม่วง ปากช่อง นครราชสีมา").province, "นครราชสีมา");
});

test("parseLocationTags folds real spelling variants of the same subdistrict together", () => {
  // All three appear verbatim in the actual sheet for the same real place.
  assert.equal(parseLocationTags("ต.พรหมณี อ.เมือง จ.นครนายก").area, "พรหมมณี");
  assert.equal(parseLocationTags("พรมมณี เมือง นครนายก").area, "พรหมมณี");
  assert.equal(parseLocationTags("ต.พรหมมณี อ.เมืองนครนายก จ.นครนายก").area, "พรหมมณี");
});

test("parseLocationTags keeps a bare 'เมือง' as its own area instead of discarding it", () => {
  assert.deepEqual(parseLocationTags("เมือง นครนายก"), { province: "นครนายก", area: "เมือง" });
  assert.deepEqual(parseLocationTags("เมืองนครนายก นครนายก"), { province: "นครนายก", area: "เมือง" });
});

test("parseLocationTags falls back honestly when no known province matches", () => {
  const { province, area } = parseLocationTags("เขาใหญ่");
  assert.equal(province, "อื่นๆ");
  assert.equal(area, "เขาใหญ่");
});

test("parseLocationTags never throws on empty or missing input", () => {
  assert.deepEqual(parseLocationTags(""), { province: "ไม่ระบุ", area: "ไม่ระบุ" });
  assert.deepEqual(parseLocationTags(undefined), { province: "ไม่ระบุ", area: "ไม่ระบุ" });
});

const SAMPLE = [
  { location: "สาริกา เมือง นครนายก" },
  { location: "สาริกา เมืองนครนายก" }, // same area, different spacing
  { location: "ศรีนาวา เมือง นครนายก" },
  { location: "เนินหอม ปราจีนบุรี" },
];

test("tallyProvinces counts every listing once, most-listings-first", () => {
  const result = tallyProvinces(SAMPLE);
  assert.deepEqual(result, [
    { name: "นครนายก", count: 3 },
    { name: "ปราจีนบุรี", count: 1 },
  ]);
});

test("tallyAreas only counts listings within the requested province", () => {
  const result = tallyAreas(SAMPLE, "นครนายก");
  assert.deepEqual(result, [
    { name: "สาริกา", count: 2 },
    { name: "ศรีนาวา", count: 1 },
  ]);
  assert.deepEqual(tallyAreas(SAMPLE, "ปราจีนบุรี"), [{ name: "เนินหอม", count: 1 }]);
});
