// Tests for the clip-building path. No paid API is touched: the map zoom cases stop at
// input validation, and the voice cases use the macOS system voice, which is local.
//
//   node --test tests/
import { test, skip } from "node:test";
import assert from "node:assert/strict";
import { toSentences, speakThai, hasVoice, DEFAULT_VOICE } from "../src/lib/voice.mjs";
import { runMapZoom, MapZoomError } from "../src/engines/mapzoom-engine.mjs";
import { satelliteZoomUrls, pinnedPlotUrl } from "../src/engines/google-engine.mjs";
import { probeDuration } from "../src/lib/ffmpeg.mjs";

test("toSentences splits on line breaks and drops blanks", () => {
  const script = "ที่ดินสวย\n\n  เนื้อที่ 200 ตร.วา  \n\nราคา 7 แสน\n";
  assert.deepEqual(toSentences(script), ["ที่ดินสวย", "เนื้อที่ 200 ตร.วา", "ราคา 7 แสน"]);
  assert.deepEqual(toSentences(""), []);
  assert.deepEqual(toSentences(null), []);
});

test("satellite zoom urls go wide to close and carry no marker", () => {
  const urls = satelliteZoomUrls({ lat: 14.21, lng: 101.27 }, "KEY");
  assert.equal(urls.length, 4);
  assert.deepEqual(urls.map((u) => u.zoom), [6, 11, 15, 18]);
  for (const u of urls) {
    assert.ok(u.url.includes("maptype=satellite"));
    // A marker at zoom 6 covers a whole province, so the pin is a separate final frame.
    assert.ok(!u.url.includes("markers"), `zoom ${u.zoom} should have no marker`);
  }
});

test("the pinned frame is the only one with a marker on it", () => {
  const url = pinnedPlotUrl({ lat: 14.21, lng: 101.27 }, "KEY");
  assert.ok(url.includes("markers"));
  assert.ok(url.includes("zoom=18"));
});

test("map zoom rejects a malformed property id before spending anything", async () => {
  await assert.rejects(
    () => runMapZoom({ property_id: "nope", raw_address: "นครนายก" }),
    (err) => err instanceof MapZoomError && err.code === "ERR_MAPZOOM_INPUT"
  );
});

test("map zoom rejects an unsupported aspect", async () => {
  await assert.rejects(
    () => runMapZoom({ property_id: "PROP-TH-01029", raw_address: "นครนายก", aspect: "4:3" }),
    (err) => err instanceof MapZoomError && err.code === "ERR_MAPZOOM_INPUT"
  );
});

test("map zoom refuses to run without an address or coordinates", async () => {
  await assert.rejects(
    () => runMapZoom({ property_id: "PROP-TH-01029" }, { env: { GOOGLE_MAPS_API_KEY: "KEY" } }),
    (err) => err instanceof MapZoomError && err.code === "ERR_MAPZOOM_INPUT"
  );
});

test("voice rejects an empty script", async () => {
  await assert.rejects(() => speakThai([]), /ไม่มีข้อความให้พูด/);
});

// The whole point of generating the voice ourselves is that cue timing is measured, not
// estimated. If this drifts, subtitles run ahead of or behind the speech in every clip,
// and nothing else in the pipeline would catch it.
test("subtitle cues line up with the voice track they were built from", async (t) => {
  if (!(await hasVoice(DEFAULT_VOICE))) {
    return t.skip(`ไม่มีเสียง ${DEFAULT_VOICE} ในเครื่องนี้`);
  }
  const sentences = ["ที่ดินสวย ทำเลดี", "เนื้อที่ สองร้อย ตารางวา", "สนใจทักได้เลย"];
  const { file, duration, cues } = await speakThai(sentences, { gapSeconds: 0.3 });

  assert.equal(cues.length, sentences.length);
  cues.forEach((c, i) => assert.equal(c.text, sentences[i]));

  // Cues must advance, never overlap.
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].end > cues[i].start, `cue ${i} has no length`);
    if (i > 0) assert.ok(cues[i].start >= cues[i - 1].end, `cue ${i} overlaps the one before`);
  }

  // The last cue should end when the audio does. AAC padding moves this by a few
  // milliseconds, so allow a small tolerance rather than demanding equality.
  const measured = await probeDuration(file);
  assert.ok(measured, "could not measure the rendered voice track");
  assert.ok(
    Math.abs(measured - cues.at(-1).end) < 0.25,
    `last cue ends at ${cues.at(-1).end}s but the audio runs ${measured}s`
  );
  assert.ok(Math.abs(measured - duration) < 0.25);
});

test("zoom levels cannot be empty", async () => {
  await assert.rejects(
    () => runMapZoom({ property_id: "PROP-TH-01029", raw_address: "นครนายก", zooms: [] }),
    (err) => err instanceof MapZoomError && err.code === "ERR_MAPZOOM_INPUT"
  );
});

// A leading dash is natural in a hand-written script (the listing highlights read that
// way), and passing it as an argument makes `say` treat it as an option.
test("a script line starting with a dash is still spoken", async (t) => {
  if (!(await hasVoice(DEFAULT_VOICE))) return t.skip(`ไม่มีเสียง ${DEFAULT_VOICE}`);
  const { cues } = await speakThai(["- ติดถนนลาดยาง", "- น้ำไฟพร้อม"]);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, "- ติดถนนลาดยาง");
  assert.ok(cues[0].end > cues[0].start);
});
