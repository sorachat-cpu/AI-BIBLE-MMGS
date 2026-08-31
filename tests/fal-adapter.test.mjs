// fal / Veo 3.1 adapter. No network: every case fails before a request is sent.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { FalVeoAdapter, FalAdapterError } from "../src/providers/fal-adapter.mjs";

const withKey = () => new FalVeoAdapter({ apiKey: "test-key-not-used" });

// The whole reason this adapter exists is the two-frame endpoint; a caller that forgot the
// end frame is asking for a different product, not a degraded version of this one.
test("a request without an end frame is refused, not silently downgraded", async () => {
  await assert.rejects(
    () => withKey().imageToVideo({ image: "a.png", prompt: "x" }),
    (e) => e instanceof FalAdapterError && e.code === "ERR_PROV_04"
  );
});

// A missing key used to surface as ENOENT from the image conversion, which points at the
// wrong thing entirely.
test("a missing key is reported as a missing key, before any file work", async () => {
  const noKey = new FalVeoAdapter({ apiKey: null });
  const prev = { FAL_KEY: process.env.FAL_KEY, FAL_API_KEY: process.env.FAL_API_KEY };
  delete process.env.FAL_KEY; delete process.env.FAL_API_KEY;
  try {
    await assert.rejects(
      () => new FalVeoAdapter().imageToVideo({ image: "/nope/a.png", image_tail: "/nope/b.png", prompt: "x" }),
      (e) => e instanceof FalAdapterError && e.code === "ERR_PROV_NO_KEY"
    );
  } finally {
    if (prev.FAL_KEY) process.env.FAL_KEY = prev.FAL_KEY;
    if (prev.FAL_API_KEY) process.env.FAL_API_KEY = prev.FAL_API_KEY;
  }
  assert.ok(noKey);
});

test("this adapter does not pretend to make images", async () => {
  await assert.rejects(() => withKey().generateImage({ prompt: "x" }),
    (e) => e instanceof FalAdapterError);
});

// Veo 3.1 takes 4s, 6s or 8s. The pipeline's own default is 10, which the API rejects, so
// the nearest allowed value has to be chosen rather than passed through.
test("an unsupported duration snaps to the nearest one Veo accepts", async () => {
  const { default: mod } = await import("../src/providers/fal-adapter.mjs").then((m) => ({ default: m }));
  assert.ok(mod.FalVeoAdapter, "adapter is exported");
  // Exercised through the public path: 10s must not reach the API verbatim.
  const a = new FalVeoAdapter({ apiKey: "k" });
  let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, status: 200, text: async () => JSON.stringify({ request_id: "r1" }) };
  };
  try {
    await a.imageToVideo({ image: "https://x/a.jpg", image_tail: "https://x/b.jpg", prompt: "p", duration_seconds: 10 });
  } catch { /* the stub never reports COMPLETED, so this times out on the first poll;
       only the body that was submitted matters here */ }
  assert.equal(sent.duration, "8s", "10s snaps to Veo's maximum");
  assert.equal(sent.aspect_ratio, "9:16");
  assert.equal(sent.generate_audio, false, "the film gets its own audio downstream");
});
