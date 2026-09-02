// fal / Veo 3.1 adapter. No network: every case fails before a request is sent.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { FalVeoAdapter, FalAdapterError } from "../src/providers/fal-adapter.mjs";

const withKey = () => new FalVeoAdapter({ apiKey: "test-key-not-used" });

// An end frame is a constraint, not a requirement. WF1 supplies one because it must land on
// the seller's real photo; WF2 omits one because nobody has a picture of the house yet, and
// the model is meant to build it. Each case has to reach a different Veo endpoint.
async function submittedBody(args) {
  const a = new FalVeoAdapter({ apiKey: "k", pollMs: 1 });
  let seen = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), body: JSON.parse(init.body) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ request_id: "r1" }) };
  };
  try {
    await a.imageToVideo(args);
  } catch { /* the stub never reports COMPLETED; only the submitted request matters here */ }
  finally { globalThis.fetch = realFetch; }
  return seen;
}

test("an end frame routes to the two-anchor endpoint and is sent as both frames", async () => {
  const s = await submittedBody({
    image: "https://x/a.jpg", image_tail: "https://x/b.jpg", prompt: "p", duration_seconds: 8,
  });
  assert.match(s.url, /first-last-frame-to-video/);
  assert.equal(s.body.first_frame_url, "https://x/a.jpg");
  assert.equal(s.body.last_frame_url, "https://x/b.jpg");
  assert.equal(s.body.image_url, undefined, "the single-image field must not also be set");
});

test("no end frame routes to image-to-video so the model can invent the ending", async () => {
  const s = await submittedBody({ image: "https://x/a.jpg", prompt: "p", duration_seconds: 8 });
  assert.match(s.url, /veo3\.1\/image-to-video/);
  assert.equal(s.body.image_url, "https://x/a.jpg");
  assert.equal(s.body.first_frame_url, undefined);
  assert.equal(s.body.last_frame_url, undefined);
});

// Delivery is a 9:16 phone video; 720p upscaled into a 1080x1920 frame is visibly soft on
// the one shot that has to sell the property. A cheaper setting left within reach is one
// that eventually ships to a customer, so neither config nor env can lower it.
test("resolution is 1080p and cannot be argued down", async () => {
  assert.equal(new FalVeoAdapter({ apiKey: "k" }).resolution, "1080p");
  assert.equal(new FalVeoAdapter({ apiKey: "k", resolution: "720p" }).resolution, "1080p");

  const prev = process.env.FAL_RESOLUTION;
  process.env.FAL_RESOLUTION = "720p";
  try {
    assert.equal(new FalVeoAdapter({ apiKey: "k" }).resolution, "1080p");
  } finally {
    if (prev === undefined) delete process.env.FAL_RESOLUTION;
    else process.env.FAL_RESOLUTION = prev;
  }

  const s = await submittedBody({ image: "https://x/a.jpg", prompt: "p" });
  assert.equal(s.body.resolution, "1080p", "and that is what actually reaches fal");
});

test("a request with no image at all is refused", async () => {
  await assert.rejects(
    () => withKey().imageToVideo({ prompt: "x" }),
    (e) => e instanceof FalAdapterError && e.code === "ERR_PROV_INPUT"
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
  // The pipeline's own default is 10s, which Veo rejects outright.
  const s = await submittedBody({
    image: "https://x/a.jpg", image_tail: "https://x/b.jpg", prompt: "p", duration_seconds: 10,
  });
  assert.equal(s.body.duration, "8s", "10s snaps to Veo's maximum");
  assert.equal(s.body.aspect_ratio, "9:16");
  assert.equal(s.body.generate_audio, false, "the film gets its own audio downstream");
});
