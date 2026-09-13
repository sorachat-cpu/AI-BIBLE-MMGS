// Pure builder tests only -- no LINE API call (setup-rich-menu.mjs needs a real
// LINE_CHANNEL_ACCESS_TOKEN and actually deploys the menu, same reason line-bot.test.mjs
// doesn't call runLineBot). What matters here is that the SVG's drawn cell boundaries and
// the API's `bounds` array agree exactly, since a tap in the gap between them is silent
// and invisible until someone taps the "wrong" thing on a real phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRichMenuSvg, buildRichMenuAreas, RICH_MENU_WIDTH, RICH_MENU_HEIGHT } from "../src/lib/rich-menu.mjs";

const SIX_ZONES = Array.from({ length: 6 }, (_, i) => ({ icon: "land", label: `zone ${i}` }));
const SIX_ACTIONS = Array.from({ length: 6 }, (_, i) => ({ type: "message", label: `zone ${i}`, text: `text ${i}` }));

test("buildRichMenuSvg rejects a zone count other than 6", () => {
  assert.throws(() => buildRichMenuSvg(SIX_ZONES.slice(0, 5)));
  assert.throws(() => buildRichMenuSvg([...SIX_ZONES, { icon: "land", label: "extra" }]));
});

test("buildRichMenuAreas rejects an action count other than 6", () => {
  assert.throws(() => buildRichMenuAreas(SIX_ACTIONS.slice(0, 5)));
});

test("buildRichMenuAreas tiles the full canvas with no gaps and no overlaps", () => {
  const areas = buildRichMenuAreas(SIX_ACTIONS);
  assert.equal(areas.length, 6);

  // Row 0 spans the full width with no gaps; same for row 1.
  const row0 = areas.slice(0, 3).sort((a, b) => a.bounds.x - b.bounds.x);
  const row1 = areas.slice(3, 6).sort((a, b) => a.bounds.x - b.bounds.x);
  for (const row of [row0, row1]) {
    assert.equal(row[0].bounds.x, 0);
    assert.equal(row[0].bounds.x + row[0].bounds.width, row[1].bounds.x);
    assert.equal(row[1].bounds.x + row[1].bounds.width, row[2].bounds.x);
    assert.equal(row[2].bounds.x + row[2].bounds.width, RICH_MENU_WIDTH);
  }
  // Rows stack with no vertical gap and reach exactly the canvas height.
  assert.equal(row0[0].bounds.y, 0);
  assert.equal(row0[0].bounds.y + row0[0].bounds.height, row1[0].bounds.y);
  assert.equal(row1[0].bounds.y + row1[0].bounds.height, RICH_MENU_HEIGHT);
});

test("buildRichMenuAreas keeps the given action attached to the matching bounds", () => {
  const areas = buildRichMenuAreas(SIX_ACTIONS);
  areas.forEach((area, i) => assert.equal(area.action, SIX_ACTIONS[i]));
});

test("buildRichMenuSvg embeds every zone's label as SVG text", () => {
  const svg = buildRichMenuSvg(SIX_ZONES);
  for (const zone of SIX_ZONES) assert.ok(svg.includes(zone.label), `missing label: ${zone.label}`);
});

test("buildRichMenuSvg escapes text that could break the XML", () => {
  const svg = buildRichMenuSvg([
    { icon: "land", label: "A & B" },
    ...SIX_ZONES.slice(1),
  ]);
  assert.ok(svg.includes("A &amp; B"));
  assert.ok(!svg.includes("A & B<"));
});
