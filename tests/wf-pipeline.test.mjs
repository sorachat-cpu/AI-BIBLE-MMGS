// 3-WF pipeline handoffs. No paid API and no rendering: every case stops at input
// validation, which is where the spec's continuity rule is actually enforced.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { finishWf1, finishWf2, joinWorkflows, WfPipelineError } from "../src/wf/pipeline.mjs";

const bad = (err) => err instanceof WfPipelineError && err.code === "ERR_WF_INPUT";

test("WF1 rejects a malformed property id before rendering anything", async () => {
  await assert.rejects(
    () => finishWf1({ property_id: "nope", clip: "a.mp4", land_image: "b.png" }),
    bad
  );
});

// wf/WF1.md CRITICAL CONTINUITY RULE: the last frame must BE the input image, so the image
// is not optional -- without it there is nothing to hand WF2.
test("WF1 refuses to finish without the exact land image to freeze on", async () => {
  await assert.rejects(
    () => finishWf1({ property_id: "PROP-TH-09999", clip: "a.mp4" }),
    (err) => bad(err) && /EXACT TARGET IMAGE|รูปที่ดิน/.test(err.message)
  );
});

test("WF1 refuses to finish without a clip", async () => {
  await assert.rejects(
    () => finishWf1({ property_id: "PROP-TH-09999", land_image: "b.png" }),
    bad
  );
});

// FINAL FRAME WF2 = FIRST FRAME WF3, so WF2's own end image is equally mandatory.
test("WF2 refuses to finish without the finished-house image", async () => {
  await assert.rejects(
    () => finishWf2({ property_id: "PROP-TH-09999", clip: "a.mp4" }),
    (err) => bad(err) && /FIRST FRAME WF3|บ้านเสร็จ/.test(err.message)
  );
});

test("an unsupported aspect is rejected rather than silently reframed", async () => {
  await assert.rejects(
    () => finishWf1({ property_id: "PROP-TH-09999", clip: "a.mp4", land_image: "b.png", aspect: "4:3" }),
    bad
  );
});

test("joining needs at least two parts", async () => {
  await assert.rejects(
    () => joinWorkflows({ property_id: "PROP-TH-09999", clips: ["only.mp4"] }),
    bad
  );
  // Nulls from skipped workflows must not count toward the total.
  await assert.rejects(
    () => joinWorkflows({ property_id: "PROP-TH-09999", clips: ["a.mp4", null, undefined] }),
    bad
  );
});
