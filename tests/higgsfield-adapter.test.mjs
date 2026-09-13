// Higgsfield / Gemini Omni Flash 1.1 adapter. It shells out to the official `higgsfield`
// CLI rather than calling a REST endpoint directly (see the file header comment in
// src/providers/higgsfield-adapter.mjs for why) -- so these tests fake the CLI binary
// itself: HIGGSFIELD_CLI_BIN points at a small stub script this file writes to a temp dir,
// and each test controls what that stub prints/exits with.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, chmod, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HiggsfieldOmniAdapter, HiggsfieldAdapterError } from "../src/providers/higgsfield-adapter.mjs";

/** Writes a stub `higgsfield` binary (a shell script) that records the args it was called
 * with into `recordPath` (JSON) and then behaves per `behavior`. Returns the stub's path. */
async function makeStub(behavior) {
  const dir = await mkdtemp(path.join(tmpdir(), "hf-stub-"));
  const recordPath = path.join(dir, "record.json");
  const stubPath = path.join(dir, "higgsfield");
  const script =
    "#!/bin/sh\n" +
    `node -e 'require("fs").writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(process.argv.slice(1)))' "$@"\n` +
    behavior +
    "\n";
  await writeFile(stubPath, script);
  await chmod(stubPath, 0o755);
  return { stubPath, recordPath, dir };
}

async function readRecord(recordPath) {
  return JSON.parse(await readFile(recordPath, "utf8"));
}

/** toLocalFile() fetches http(s) sources for real, so tests use a local dummy file instead
 * -- no network involved, and it exercises the same "already a local path" pass-through. */
async function dummyImage(name) {
  const dir = await mkdtemp(path.join(tmpdir(), "hf-img-"));
  const file = path.join(dir, name);
  await writeFile(file, "fake image bytes");
  return { file, dir };
}

test("start+end frame both submit with mode image-to-video and both media flags", async () => {
  const { stubPath, recordPath, dir: stubDir } = await makeStub(
    `echo '{"id":"j1","status":"completed","result":{"video_url":"https://x/out.mp4"}}'`
  );
  const { file: startImg, dir: imgDir } = await dummyImage("a.jpg");
  try {
    const a = new HiggsfieldOmniAdapter({ cliBin: stubPath });
    const res = await a.imageToVideo({
      image: startImg, image_tail: startImg, prompt: "p", duration_seconds: 8,
    });
    const args = await readRecord(recordPath);
    assert.equal(args[0], "generate");
    assert.equal(args[1], "create");
    assert.equal(args[2], "gemini_omni_flash_1_1");
    assert.match(args.join(" "), /--mode image-to-video/);
    assert.ok(args.includes("--start-image"));
    assert.ok(args.includes("--end-image"));
    assert.equal(res.result.video_url, "https://x/out.mp4");
    assert.equal(res.status, "SUCCESS");
  } finally {
    await rm(stubDir, { recursive: true, force: true });
    await rm(imgDir, { recursive: true, force: true });
  }
});

test("no end frame omits --end-image but still uses mode image-to-video", async () => {
  const { stubPath, recordPath, dir: stubDir } = await makeStub(
    `echo '{"id":"j2","result":{"video_url":"https://x/out2.mp4"}}'`
  );
  const { file: startImg, dir: imgDir } = await dummyImage("a.jpg");
  try {
    const a = new HiggsfieldOmniAdapter({ cliBin: stubPath });
    await a.imageToVideo({ image: startImg, prompt: "p", duration_seconds: 8 });
    const args = await readRecord(recordPath);
    assert.match(args.join(" "), /--mode image-to-video/);
    assert.ok(!args.includes("--end-image"));
  } finally {
    await rm(stubDir, { recursive: true, force: true });
    await rm(imgDir, { recursive: true, force: true });
  }
});

test("a request with no image at all is refused before touching the CLI", async () => {
  const a = new HiggsfieldOmniAdapter({ cliBin: "/nonexistent/should-not-run" });
  await assert.rejects(
    () => a.imageToVideo({ prompt: "x" }),
    (e) => e instanceof HiggsfieldAdapterError && e.code === "ERR_PROV_INPUT"
  );
});

test("a missing CLI binary is reported as ERR_PROV_NO_KEY, not a raw ENOENT", async () => {
  const { file: startImg, dir: imgDir } = await dummyImage("a.jpg");
  try {
    const a = new HiggsfieldOmniAdapter({ cliBin: "/definitely/not/a/real/binary/higgsfield" });
    await assert.rejects(
      () => a.imageToVideo({ image: startImg, prompt: "p" }),
      (e) => e instanceof HiggsfieldAdapterError && e.code === "ERR_PROV_NO_KEY"
    );
  } finally {
    await rm(imgDir, { recursive: true, force: true });
  }
});

test("a CLI exit reporting missing auth is reported as ERR_PROV_NO_KEY", async () => {
  const { stubPath, dir: stubDir } = await makeStub(`echo "not authenticated: run higgsfield auth login" >&2; exit 1`);
  const { file: startImg, dir: imgDir } = await dummyImage("a.jpg");
  try {
    const a = new HiggsfieldOmniAdapter({ cliBin: stubPath });
    await assert.rejects(
      () => a.imageToVideo({ image: startImg, prompt: "p" }),
      (e) => e instanceof HiggsfieldAdapterError && e.code === "ERR_PROV_NO_KEY"
    );
  } finally {
    await rm(stubDir, { recursive: true, force: true });
    await rm(imgDir, { recursive: true, force: true });
  }
});

test("a CLI exit reporting insufficient credit is reported as ERR_PROV_NO_CREDIT", async () => {
  const { stubPath, dir: stubDir } = await makeStub(`echo "insufficient credit for this job" >&2; exit 1`);
  const { file: startImg, dir: imgDir } = await dummyImage("a.jpg");
  try {
    const a = new HiggsfieldOmniAdapter({ cliBin: stubPath });
    await assert.rejects(
      () => a.imageToVideo({ image: startImg, prompt: "p" }),
      (e) => e instanceof HiggsfieldAdapterError && e.code === "ERR_PROV_NO_CREDIT"
    );
  } finally {
    await rm(stubDir, { recursive: true, force: true });
    await rm(imgDir, { recursive: true, force: true });
  }
});

test("output with no recognizable result url is a clear ERR_PROV_04, not a silent success", async () => {
  const { stubPath, dir: stubDir } = await makeStub(`echo '{"id":"j3","status":"completed"}'`);
  const { file: startImg, dir: imgDir } = await dummyImage("a.jpg");
  try {
    const a = new HiggsfieldOmniAdapter({ cliBin: stubPath });
    await assert.rejects(
      () => a.imageToVideo({ image: startImg, prompt: "p" }),
      (e) => e instanceof HiggsfieldAdapterError && e.code === "ERR_PROV_04"
    );
  } finally {
    await rm(stubDir, { recursive: true, force: true });
    await rm(imgDir, { recursive: true, force: true });
  }
});

test("this adapter does not pretend to make images", async () => {
  const a = new HiggsfieldOmniAdapter({ cliBin: "/nonexistent/should-not-run" });
  await assert.rejects(() => a.generateImage({ prompt: "x" }),
    (e) => e instanceof HiggsfieldAdapterError);
});
