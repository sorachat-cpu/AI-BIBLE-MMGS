// Flat JSON files under content/ as the persistence layer.
//
// Phase 1 of 20_ROADMAP.md calls for PostgreSQL, and this is not a substitute for it.
// But the page needs to post every day starting now, and a schedule that lives only in
// memory forgets what it already published the moment the process exits -- which would
// mean duplicate posts. Files survive restarts, are readable and hand-editable, and
// migrate into Postgres as straight row inserts when Phase 1 lands.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../lib/ffmpeg.mjs";

export const CONTENT_DIR = path.join(PROJECT_ROOT, "content");

export async function ensureContentDir() {
  await mkdir(CONTENT_DIR, { recursive: true });
}

export async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(CONTENT_DIR, name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return structuredClone(fallback);
    throw err;
  }
}

/**
 * Write via temp file + rename. The scheduler may be killed mid-write (cron timeout,
 * laptop sleep); a half-written queue.json would lose the entire posting history.
 */
export async function writeJson(name, data) {
  await ensureContentDir();
  const target = path.join(CONTENT_DIR, name);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmp, target);
  return target;
}
