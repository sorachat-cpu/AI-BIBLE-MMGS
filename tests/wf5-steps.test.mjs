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
