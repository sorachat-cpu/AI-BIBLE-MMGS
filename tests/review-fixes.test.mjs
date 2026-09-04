// Regressions found by code review on the 3-WF branch. Each test reproduces the failure the
// fix addresses, so it fails again if the fix is undone.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature } from "../src/publish/adapters/line.mjs";
import { buildKaraokeAss } from "../src/lib/ass.mjs";
import { KlingAdapter } from "../src/providers/kling-adapter.mjs";

// ---- LINE webhook signature over raw bytes -------------------------------------------
// The body used to be accumulated with `body += chunk`, decoding each Buffer separately.
// A Thai character straddling a chunk boundary became U+FFFD, the HMAC stopped matching the
// bytes LINE signed, and a legitimate Thai message was rejected 401 and retried forever.
const SECRET = "s3cr3t";
const THAI_BODY = '{"events":[{"message":{"text":"ที่ดินสวยมากครับ ราคาเท่าไหร่"}}]}';

function signed(buf) {
  return createHmac("sha256", SECRET).update(buf).digest("base64");
}

test("a Thai webhook body verifies when the raw bytes are kept intact", () => {
  const buf = Buffer.from(THAI_BODY, "utf8");
  assert.equal(
    verifySignature({ channelSecret: SECRET, rawBody: buf, signatureHeader: signed(buf) }),
    true
  );
});

test("chunked reads must be concatenated as bytes, not as decoded strings", () => {
  const buf = Buffer.from(THAI_BODY, "utf8");
  const sig = signed(buf);
  // Split inside a multi-byte character: the top two bits of a UTF-8 continuation byte are 10.
  const split = buf.findIndex((b, i) => i > 0 && (b & 0xc0) === 0x80);
  assert.ok(split > 0, "test needs a multi-byte character to split");

  const asStrings = buf.subarray(0, split).toString("utf8") + buf.subarray(split).toString("utf8");
  assert.notEqual(asStrings, THAI_BODY, "decoding each half separately corrupts the text");
  assert.equal(
    verifySignature({ channelSecret: SECRET, rawBody: asStrings, signatureHeader: sig }),
    false,
    "which is exactly why the old accumulator rejected real messages"
  );

  const asBytes = Buffer.concat([buf.subarray(0, split), buf.subarray(split)]);
  assert.equal(
    verifySignature({ channelSecret: SECRET, rawBody: asBytes, signatureHeader: sig }),
    true
  );
});

// ---- karaoke subtitles must not render a line nobody asked for ------------------------
// photo-narration swaps cue.text for a short caption while the word timings still describe
// the long spoken line. The renderer preferred words, so the spoken script got burned in --
// numbers spelled out, phone numbers digit by digit.
const dialogues = (ass) => ass.split("\n").filter((l) => l.startsWith("Dialogue")).length;

test("word timings drive the highlight only when they describe the displayed text", () => {
  const ass = buildKaraokeAss({
    width: 1080, height: 1920,
    cues: [{ start: 0, end: 2, text: "สวัสดี ครับ", words: [{ text: "สวัสดี", start: 0 }, { text: "ครับ", start: 1 }] }],
  });
  assert.ok(dialogues(ass) > 1, "matching words still animate word by word");
});

test("a swapped caption renders statically instead of the line the words came from", () => {
  const ass = buildKaraokeAss({
    width: 1080, height: 1920,
    cues: [{ start: 0, end: 2, text: "2.6 ล้าน", words: [{ text: "สองจุดหกล้านบาท", start: 0 }] }],
  });
  assert.equal(dialogues(ass), 1, "one static line, not a karaoke sweep");
  assert.match(ass, /2\.6/, "shows the caption");
  assert.doesNotMatch(ass, /สองจุดหก/, "and not the spoken script");
});

// ---- image generation is not dragged onto the video model's host ----------------------
// One adapter serves both engines. Picking the host from KLING_MODEL sent every House and
// Construction Engine call to the Turbo host, which does not serve /v1/images/generations.
test("image generation stays on the standard host whatever the video model is", async () => {
  const prevKey = process.env.KLING_API_KEY;
  process.env.KLING_API_KEY = "a:b";
  const realFetch = globalThis.fetch;
  try {
    for (const modelName of ["kling-3.0-turbo", "kling-v2-master"]) {
      const a = new KlingAdapter({ modelName });
      let hit = null;
      globalThis.fetch = async (url) => {
        hit ??= String(url);
        return { ok: false, status: 401, text: async () => "{}" };
      };
      await a.generateImage({ prompt: "x" }).catch(() => {});
      assert.match(hit, /^https:\/\/api\.klingai\.com\//, `${modelName} image host`);
    }
    assert.match(
      new KlingAdapter({ modelName: "kling-3.0-turbo" }).baseUrl,
      /api-singapore/,
      "while the video host still follows the model"
    );
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.KLING_API_KEY;
    else process.env.KLING_API_KEY = prevKey;
  }
});

// ---- the default video vendor ---------------------------------------------------------
// The 3-WF path named fal explicitly, but everything that did NOT name a vendor still got
// Kling, so the system disagreed with itself about which model it was using.
test("video defaults to Veo, and Kling is still selectable", async () => {
  const { getVideoEngine, getEndFrameVideoEngine, describeEngines } =
    await import("../src/providers/registry.mjs");
  const prev = process.env.VIDEO_ENGINE;
  delete process.env.VIDEO_ENGINE;
  try {
    assert.equal(getVideoEngine().providerName, "FAL_VEO31");
    assert.equal(getEndFrameVideoEngine().providerName, "FAL_VEO31");
    assert.equal(describeEngines().video.selected, "fal");

    process.env.VIDEO_ENGINE = "kling";
    assert.equal(getVideoEngine().providerName, "KLING_V2", "opting back out still works");
  } finally {
    if (prev === undefined) delete process.env.VIDEO_ENGINE;
    else process.env.VIDEO_ENGINE = prev;
  }
});

// fal's adapter is video-only, so images must not follow the video default.
test("image generation stays on a vendor that can actually make images", async () => {
  const { getImageEngine } = await import("../src/providers/registry.mjs");
  const prev = process.env.VIDEO_ENGINE;
  process.env.VIDEO_ENGINE = "fal";
  try {
    assert.equal(getImageEngine().providerName, "KLING_V2");
  } finally {
    if (prev === undefined) delete process.env.VIDEO_ENGINE;
    else process.env.VIDEO_ENGINE = prev;
  }
});

// ---- running out of credit is an account state, not a pipeline failure ----------------
// It surfaced as "fal ปฏิเสธคำขอ (HTTP 403) ... (no fallback provider implemented yet)",
// which reads like a missing feature and sends people looking through code for a billing
// state. No amount of failing over to another vendor fixes an empty balance.
test("an exhausted balance says so, and says what to do instead", async () => {
  const { FalVeoAdapter } = await import("../src/providers/fal-adapter.mjs");
  const a = new FalVeoAdapter({ apiKey: "k", pollMs: 1 });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 403,
    text: async () => JSON.stringify({ detail: "User is locked. Reason: Exhausted balance." }),
  });
  try {
    await assert.rejects(
      () => a.imageToVideo({ image: "https://x/a.jpg", prompt: "p" }),
      (e) => {
        assert.equal(e.code, "ERR_PROV_NO_CREDIT", "not a generic provider refusal");
        assert.match(e.message, /billing/, "points at the thing that fixes it");
        assert.match(e.message, /Flow/, "and at the route that needs no credit");
        return true;
      }
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("account-state errors are not dressed up as a missing fallback provider", async () => {
  const { runVideoEngine } = await import("../src/engines/video-engine.mjs");
  const { readFile } = await import("node:fs/promises");
  const prevKey = process.env.FAL_KEY;
  const prevEngine = process.env.VIDEO_ENGINE;
  process.env.FAL_KEY = "k";
  delete process.env.VIDEO_ENGINE;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 403,
    text: async () => JSON.stringify({ detail: "User is locked. Reason: Exhausted balance." }),
  });
  try {
    const b64 =
      "data:image/jpeg;base64," +
      (await readFile("content/media/LAND-06A8B922.jpg")).toString("base64");
    await assert.rejects(
      () => runVideoEngine({
        property_id: "PROP-TH-09999", image_base64: b64,
        template_id: "TPL_WF1_v1", camera_motion: "DRONE_REVEAL", duration_seconds: 8,
      }, {}),
      (e) => e.code === "ERR_PROV_NO_CREDIT" && !/no fallback/.test(e.message)
    );
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.FAL_KEY; else process.env.FAL_KEY = prevKey;
    if (prevEngine !== undefined) process.env.VIDEO_ENGINE = prevEngine;
  }
});
