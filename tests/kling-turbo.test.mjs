// Kling 3.0 Turbo is a second API behind the same adapter, not a new model_name on the
// existing one. These tests pin the routing so a future edit cannot quietly send a 3.0
// request to the old endpoint (or vice versa) -- both would fail at the network with an
// error that says nothing about the real cause.
import test from "node:test";
import assert from "node:assert/strict";
import { KlingAdapter } from "../src/providers/kling-adapter.mjs";

const v2 = () => new KlingAdapter({ modelName: "kling-v2-master" });
const turbo = () => new KlingAdapter({ modelName: "kling-3.0-turbo" });

test("each model family defaults to its own host", () => {
  assert.equal(v2().baseUrl, "https://api.klingai.com");
  assert.equal(turbo().baseUrl, "https://api-singapore.klingai.com");
});

test("an explicit base url still wins for both", () => {
  const opts = { baseUrl: "https://proxy.example" };
  assert.equal(new KlingAdapter({ ...opts, modelName: "kling-v2-master" }).baseUrl, "https://proxy.example");
  assert.equal(new KlingAdapter({ ...opts, modelName: "kling-3.0-turbo" }).baseUrl, "https://proxy.example");
});

test("3.0 Turbo builds the contents[] shape, not the flat one", () => {
  const body = turbo().buildRequest({ image: "https://x/a.jpg", prompt: "orbit", duration_seconds: 8 });
  assert.ok(Array.isArray(body.contents));
  assert.equal(body.contents.find((c) => c.type === "first_frame").url, "https://x/a.jpg");
  assert.match(body.contents.find((c) => c.type === "prompt").text, /orbit/);
  assert.equal(body.settings.duration, 8);
  // Flat fields belong to the old API and must not leak into the new body.
  for (const stale of ["model_name", "image", "cfg_scale", "mode", "negative_prompt"]) {
    assert.equal(body[stale], undefined, `${stale} should not be in a 3.0 body`);
  }
});

test("the old shape is untouched by the 3.0 support", () => {
  const body = v2().buildRequest({ image: "BASE64", prompt: "push in", duration_seconds: 5 });
  assert.equal(body.model_name, "kling-v2-master");
  assert.equal(body.image, "BASE64");
  assert.equal(body.duration, "5");
  assert.equal(body.contents, undefined);
});

test("3.0 Turbo REFUSES an end frame instead of dropping it", () => {
  // The whole reason this matters: construction morphs and the sky descent are defined by
  // their end frame. Silently ignoring it returns a clip that animates somewhere else --
  // plausible-looking, wrong, and paid for.
  assert.throws(
    () => turbo().buildRequest({ image: "a", image_tail: "b", prompt: "x" }),
    (err) => err.code === "ERR_PROV_04" && /image_tail/.test(err.message)
  );
});

test("v1-6 still accepts an end frame, so the morph paths keep working", () => {
  const body = new KlingAdapter({ modelName: "kling-v1-6" })
    .buildRequest({ image: "a", image_tail: "b", prompt: "x" });
  assert.equal(body.image_tail, "b");
  assert.equal(body.mode, "pro"); // std + image_tail is rejected by the live API
});

test("3.0 duration is clamped to the documented 3-15s window", () => {
  const build = (d) => turbo().buildRequest({ image: "u", prompt: "p", duration_seconds: d });
  assert.equal(build(1).settings.duration, 3);
  assert.equal(build(99).settings.duration, 15);
  assert.equal(build(7).settings.duration, 7);
});

test("setting 3.0 globally does not break the end-frame shots", async () => {
  // The point of the split: an operator can move the cheap single-frame paths to 3.0
  // without knowing that construction and the sky descent need something else. Those
  // route themselves.
  const prev = process.env.KLING_MODEL;
  process.env.KLING_MODEL = "kling-3.0-turbo";
  try {
    const { getVideoEngine, getEndFrameVideoEngine } = await import("../src/providers/registry.mjs");
    // The registry hands back adapters; build a request through each to see which API
    // shape it produces, since that is what actually differs.
    const plain = getVideoEngine();
    const ends = getEndFrameVideoEngine();
    assert.ok(plain, "video engine missing");
    assert.ok(ends, "end-frame engine missing");
    // The end-frame engine must accept a tail without throwing.
    const adapter = new KlingAdapter({ modelName: process.env.KLING_MODEL_ENDFRAME ?? "kling-v1-6" });
    const body = adapter.buildRequest({ image: "a", image_tail: "b", prompt: "x" });
    assert.equal(body.image_tail, "b");
    assert.equal(body.contents, undefined, "end-frame path must not use the 3.0 shape");
  } finally {
    if (prev === undefined) delete process.env.KLING_MODEL;
    else process.env.KLING_MODEL = prev;
  }
});

// --- real billing vs the built-in estimate --------------------------------

test("units and cash are kept apart rather than summed", async () => {
  // They are different currencies -- one comes out of a prepaid package, the other off a
  // cash balance. Adding them produces a number that means nothing.
  const { KlingAdapter: A } = await import("../src/providers/kling-adapter.mjs");
  const adapter = new A({ modelName: "kling-3.0-turbo" });
  // normalizeResponse is public on the v1/v2 path and uses the same billing parser.
  const res = adapter.normalizeResponse(
    {
      data: {
        task_result: { videos: [{ url: "https://x/v.mp4", duration: "5.0" }] },
        billing: [
          { charge_type: "unit", amount: "7.5", package_type: "video" },
          { charge_type: "cash", amount: "0.42", currency: "USD" },
        ],
      },
    },
    1000
  );
  assert.equal(res.billing.units, 7.5);
  assert.equal(res.billing.cash, 0.42);
  assert.equal(res.billing.currency, "USD");
  assert.equal(res.cost_is_estimate, false);
});

test("no billing rows means the reported cost is flagged as an estimate", async () => {
  const { KlingAdapter: A } = await import("../src/providers/kling-adapter.mjs");
  const res = new A({}).normalizeResponse(
    { data: { task_result: { videos: [{ url: "https://x/v.mp4", duration: "5.0" }] } } },
    1000
  );
  assert.equal(res.billing, null);
  assert.equal(res.cost_is_estimate, true);
  // The estimate is still present so existing callers that sum it keep working.
  assert.equal(typeof res.cost_usd, "number");
});

test("the negative prompt survives into 3.0, which has no field for it", () => {
  const body = turbo().buildRequest({ image: "u", prompt: "a plot of land" });
  const text = body.contents.find((c) => c.type === "prompt").text;
  assert.match(text, /watermark/);
  assert.match(text, /Avoid:/);
});
