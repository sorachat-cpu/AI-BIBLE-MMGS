// Flow drop-folder detection. Filesystem only -- no API, no rendering.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanFlowDir, saveJob, loadJob } from "../src/wf/job.mjs";

// A fixture directory, not the real drop folder: these assertions are about what the
// scanner picks, and whatever the operator last left in output/flow/ would decide them.
async function fixture() {
  return mkdtemp(path.join(tmpdir(), "wfscan-"));
}
async function drop(dir, name, gapMs = 0) {
  if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
  const f = path.join(dir, name);
  await writeFile(f, "x");
  return f;
}

test("clips are ordered by when they were made, not by filename", async (t) => {
  const dir = await fixture();
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Flow's own downloads carry no workflow number, so mtime is the only reliable signal.
  await drop(dir, "zzz_first.mp4");
  await drop(dir, "aaa_second.mp4", 15);

  const r = await scanFlowDir(dir);
  assert.equal(path.basename(r.wf1_clip), "zzz_first.mp4", "older file is WF1");
  assert.equal(path.basename(r.wf2_clip), "aaa_second.mp4", "newer file is WF2");
});

test("a filename that names its workflow overrides the ordering", async (t) => {
  const dir = await fixture();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await drop(dir, "wf2_made_first.mp4");
  await drop(dir, "wf1_made_second.mp4", 15);

  const r = await scanFlowDir(dir);
  assert.match(path.basename(r.wf1_clip), /wf1/);
  assert.match(path.basename(r.wf2_clip), /wf2/);
});

// The plates this repo writes live in the same folder the operator drops Flow output into.
test("our own plates are never mistaken for Flow output", async (t) => {
  const dir = await fixture();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await drop(dir, "WF1_END_land.png");
  await drop(dir, "WF1_START_satellite.png");
  await drop(dir, "WF2_START_land.png");

  const r = await scanFlowDir(dir);
  assert.equal(r.house_image, null, "no operator-supplied house image was dropped");
  assert.equal(r.images.length, 0);
});

test("a job round-trips the listing details", async () => {
  const id = "PROP-TH-09998";
  await saveJob({ property_id: id, listing: { title: "ที่ดินทดสอบ", price_thb: 1234567 } });
  const back = await loadJob(id);
  assert.equal(back.listing.title, "ที่ดินทดสอบ");
  assert.equal(back.listing.price_thb, 1234567);
  assert.equal(await loadJob("PROP-TH-00000"), null, "a missing job is null, not a throw");
});

// The auto route's guards, which run before anything is generated or charged for.
test("auto refuses a property with no saved job", async () => {
  const { runWfAuto, WfPrepareError } = await import("../src/wf/prepare.mjs");
  await assert.rejects(
    () => runWfAuto({ property_id: "PROP-TH-00001" }),
    (e) => e instanceof WfPrepareError && e.code === "ERR_WFPREP_NOJOB"
  );
});

// A job saved without an address has no satellite plate, so WF1 has nothing to start from.
// Caught up front rather than as an fs error partway through a paid run.
test("auto refuses a job that has no WF1 start plate", async () => {
  const { runWfAuto, WfPrepareError } = await import("../src/wf/prepare.mjs");
  const id = "PROP-TH-09997";
  await saveJob({ property_id: id, aspect: "9:16", frames: { wf1_start: null, wf1_end: "/x.png" }, listing: {} });
  await assert.rejects(
    () => runWfAuto({ property_id: id }),
    (e) => e instanceof WfPrepareError && e.code === "ERR_WFPREP_NOSTART"
  );
});
