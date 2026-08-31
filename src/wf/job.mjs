// One job = one property, carried across the Flow round trip.
//
// The generative half of WF1/WF2 happens in Google Flow, a web app with no API, so the
// operator has to leave and come back. Everything they typed before leaving is kept here so
// they never type it twice, and the clips they bring back are found by scanning rather than
// by asking them to copy filenames around. The only thing they are asked for is the one
// photo and the listing details.
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { OUTPUT_DIR } from "../lib/ffmpeg.mjs";

const FLOW_DIR = path.join(OUTPUT_DIR, "flow");
const JOBS_DIR = path.join(OUTPUT_DIR, "flow", "_jobs");

// Plates this repo wrote itself. They live in the same folder the operator drops Flow's
// output into, so they must never be mistaken for it.
const OURS = new Set([
  "WF1_START_satellite.png",
  "WF1_END_land.png",
  "WF2_START_land.png",
]);

const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;

export async function saveJob(job) {
  await mkdir(JOBS_DIR, { recursive: true });
  const file = path.join(JOBS_DIR, `${job.property_id}.json`);
  await writeFile(file, JSON.stringify(job, null, 2));
  return file;
}

export async function loadJob(property_id) {
  try {
    return JSON.parse(await readFile(path.join(JOBS_DIR, `${property_id}.json`), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Find what Flow produced, without asking the operator to name anything.
 *
 * Ordering is by modification time because that is the one signal that is always true --
 * WF1 is made before WF2. Filenames are used only to override it when they clearly say so,
 * since Flow's own downloads arrive with names like "Flow_2026-08-31_...mp4" that carry no
 * workflow number at all.
 *
 * @param {string} [dir]  the drop folder; overridable so this is testable against a fixture
 *                        directory rather than whatever the operator last left lying around.
 */
export async function scanFlowDir(dir = FLOW_DIR) {
  let entries = [];
  try {
    entries = await readdir(dir);
  } catch {
    return { clips: [], images: [], wf1_clip: null, wf2_clip: null, house_image: null };
  }

  const stamped = [];
  for (const name of entries) {
    if (OURS.has(name) || name.startsWith("_")) continue;
    const full = path.join(dir, name);
    try {
      const s = await stat(full);
      if (s.isFile()) stamped.push({ name, file: full, mtime: s.mtimeMs });
    } catch { /* vanished mid-scan */ }
  }
  stamped.sort((a, b) => a.mtime - b.mtime);

  const clips = stamped.filter((f) => VIDEO.test(f.name));
  const images = stamped.filter((f) => IMAGE.test(f.name));

  const named = (list, n) =>
    list.find((f) => new RegExp(`(^|[^0-9])wf?${n}([^0-9]|$)`, "i").test(f.name));

  const wf1 = named(clips, 1) ?? clips[0] ?? null;
  const wf2 = named(clips, 2) ?? clips.find((c) => c !== wf1) ?? null;
  // The finished-house plate is whatever image the operator added that we did not write.
  const house = images.at(-1) ?? null;

  return {
    clips: clips.map((c) => ({ name: c.name, file: c.file })),
    images: images.map((c) => ({ name: c.name, file: c.file })),
    wf1_clip: wf1?.file ?? null,
    wf2_clip: wf2?.file ?? null,
    house_image: house?.file ?? null,
    // Surfaced so the console can say what it picked and why, instead of guessing silently.
    picked: {
      wf1: wf1?.name ?? null,
      wf2: wf2?.name ?? null,
      house: house?.name ?? null,
    },
  };
}
