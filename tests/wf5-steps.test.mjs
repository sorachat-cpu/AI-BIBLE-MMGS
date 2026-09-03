// Input-validation tests for step54_constructionSimulation / runStoryboard's construction
// beat. No paid API is touched: both cases stop at property_id validation before any
// provider is reached, whether or not a pre-supplied house_image_url is present.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { step54_constructionSimulation } from "../src/wf5/steps.mjs";
import { VideoEngineError } from "../src/engines/video-engine.mjs";
import { runStoryboard, StoryboardError } from "../src/engines/storyboard.mjs";

test("step54 rejects a malformed property_id before spending anything, even with a pre-supplied house image", async () => {
  await assert.rejects(
    () =>
      step54_constructionSimulation({
        property_id: "nope",
        land_image_url: "https://example.com/land.jpg",
        house_image_url: "https://example.com/house.jpg",
      }),
    (err) => err instanceof VideoEngineError && err.code === "ERR_VID_INPUT"
  );
});

test("storyboard rejects a malformed property_id before spending anything, even with a pre-supplied house image", async () => {
  await assert.rejects(
    () =>
      runStoryboard({
        property_id: "nope",
        land_image_url: "https://example.com/land.jpg",
        house_image_url: "https://example.com/house.jpg",
      }),
    (err) => err instanceof StoryboardError && err.code === "ERR_SB_INPUT"
  );
});

// 03_SYSTEM_RULES.md rule 4 / ERR_RULE_02: the estimate was computed and then ignored, so a
// default POST /api/construction spent whatever the stage list happened to cost. Growing the
// list from five stages to seven took that from $0.87 to $1.22 with nothing in the way.
test("the staged construction path refuses to run over the per-video budget cap", async () => {
  const { generateConstructionSequence, ConstructionError } = await import("../src/wf5/construction.mjs");
  await assert.rejects(
    () => generateConstructionSequence({
      property_id: "PROP-TH-09999", land_image_url: "https://example.com/a.jpg",
    }),
    (err) => err instanceof ConstructionError && err.code === "ERR_RULE_02"
  );
});

test("pricing it up front still works, and still says it is over", async () => {
  const { generateConstructionSequence } = await import("../src/wf5/construction.mjs");
  const d = await generateConstructionSequence({
    property_id: "PROP-TH-09999", land_image_url: "https://example.com/a.jpg", dry_run: true,
  });
  assert.equal(d.estimate.exceeds_budget_cap, true);
  assert.ok(d.estimate.total_usd > 0.3);
});

// Refusing by default must not become "refusing always" -- the caller can still opt in.
test("an explicit opt-in gets past the budget gate", async () => {
  const { generateConstructionSequence, ConstructionError } = await import("../src/wf5/construction.mjs");
  await assert.rejects(
    () => generateConstructionSequence({
      property_id: "PROP-TH-09999", land_image_url: "https://example.com/a.jpg",
      accept_over_budget: true,
    }),
    // Gets past the gate and fails later on the provider instead.
    (err) => err instanceof ConstructionError && err.code !== "ERR_RULE_02"
  );
});
