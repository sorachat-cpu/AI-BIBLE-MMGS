// Content stock -- everything the page can post today without generating anything new.
//
// Two sources: output/ (renders the pipeline already produced) and content/media/ (a
// drop folder for photos taken on site). Metadata that cannot be derived from the file
// -- how many times it has been posted, when, what it is about -- lives in
// content/stock.json keyed by filename, so re-scanning never loses posting history.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { OUTPUT_DIR, PROJECT_ROOT, probeDuration } from "../lib/ffmpeg.mjs";
import { readJson, writeJson } from "./store.mjs";

export const MEDIA_DIR = path.join(PROJECT_ROOT, "content", "media");
const STOCK_FILE = "stock.json";

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Renders are named PROP-TH-01029_<ts>_9_16.mp4 -- pull the id and aspect back out. */
function parseRenderName(file) {
  const m = file.match(/^(PROP-TH-\d{4,6})_(\d+)_(9_16|16_9)\./);
  if (!m) return {};
  return { property_id: m[1], rendered_at: Number(m[2]), aspect: m[3].replace("_", ":") };
}

async function listDir(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Index every usable asset. `probe` costs an ffmpeg pass per new video, so durations
 * are cached in stock.json and only computed for files not seen before.
 */
export async function scanStock({ probe = true } = {}) {
  const meta = await readJson(STOCK_FILE, { items: {} });
  const items = [];

  for (const [dir, origin] of [
    [OUTPUT_DIR, "render"],
    [MEDIA_DIR, "upload"],
  ]) {
    for (const name of await listDir(dir)) {
      const ext = path.extname(name).toLowerCase();
      const kind = VIDEO_EXT.has(ext) ? "video" : IMAGE_EXT.has(ext) ? "image" : null;
      if (!kind) continue;
      if (name.startsWith(".")) continue;

      const full = path.join(dir, name);
      const info = await stat(full);
      const saved = meta.items[name] ?? {};
      const parsed = parseRenderName(name);

      let duration = saved.duration_seconds ?? null;
      if (kind === "video" && duration == null && probe) {
        duration = await probeDuration(full);
      }

      items.push({
        id: name,
        file: name,
        dir: origin,
        path: full,
        kind,
        aspect: saved.aspect ?? parsed.aspect ?? (kind === "video" ? null : null),
        property_id: saved.property_id ?? parsed.property_id ?? null,
        duration_seconds: duration ?? null,
        size_bytes: info.size,
        mtime: info.mtime.toISOString(),
        title: saved.title ?? null,
        tags: saved.tags ?? [],
        posted_count: saved.posted_count ?? 0,
        last_posted_at: saved.last_posted_at ?? null,
        retired: Boolean(saved.retired),
        note: saved.note ?? null,
      });
    }
  }

  // Persist derived values so the next scan is a cheap stat-only pass.
  const nextMeta = { items: { ...meta.items } };
  for (const it of items) {
    nextMeta.items[it.id] = {
      ...(meta.items[it.id] ?? {}),
      aspect: it.aspect,
      property_id: it.property_id,
      duration_seconds: it.duration_seconds,
      posted_count: it.posted_count,
      last_posted_at: it.last_posted_at,
      title: it.title,
      tags: it.tags,
      retired: it.retired,
      note: it.note,
    };
  }
  await writeJson(STOCK_FILE, nextMeta);

  return items.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** Patch the human-editable side of an item (title, tags, retired, note). */
export async function updateStockMeta(id, patch) {
  const meta = await readJson(STOCK_FILE, { items: {} });
  meta.items[id] = { ...(meta.items[id] ?? {}), ...patch };
  await writeJson(STOCK_FILE, meta);
  return meta.items[id];
}

/** Record that an item went out, so rotation moves on to something else. */
export async function markPosted(id, when = new Date()) {
  const meta = await readJson(STOCK_FILE, { items: {} });
  const cur = meta.items[id] ?? {};
  meta.items[id] = {
    ...cur,
    posted_count: (cur.posted_count ?? 0) + 1,
    last_posted_at: when.toISOString(),
  };
  await writeJson(STOCK_FILE, meta);
  return meta.items[id];
}

/**
 * Choose what to post in a slot.
 *
 * Rotation rule: never-posted items first, then whatever was posted longest ago. The
 * cooldown stops the same clip reappearing within `cooldownDays`, because a page that
 * recycles one clip every other day reads as abandoned. When cooldown would leave
 * nothing at all, it is relaxed rather than skipping the day -- posting something
 * slightly repetitive beats posting nothing.
 *
 * @param {object} slot     from calendar.buildSchedule()
 * @param {Array} stock     from scanStock()
 * @param {object} options
 * @param {string[]} options.excludeIds ids already scheduled elsewhere in this run
 */
export function pickForSlot(slot, stock, { excludeIds = [], cooldownDays = 14, now = new Date() } = {}) {
  const wantKind = slot.content_type === "image" ? "image" : "video";
  const cutoff = new Date(now.getTime() - cooldownDays * 86_400_000).toISOString();

  const candidates = stock.filter((s) => {
    if (s.retired) return false;
    if (s.kind !== wantKind) return false;
    if (excludeIds.includes(s.id)) return false;
    // A 16:9 file in a 9:16 slot would be letterboxed by the platform; skip it.
    if (slot.aspect && s.aspect && s.aspect !== slot.aspect) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const rank = (a, b) => {
    if (a.posted_count !== b.posted_count) return a.posted_count - b.posted_count;
    const al = a.last_posted_at ?? "";
    const bl = b.last_posted_at ?? "";
    if (al !== bl) return al.localeCompare(bl);
    return b.mtime.localeCompare(a.mtime); // newest render wins the tie
  };

  const fresh = candidates.filter((s) => !s.last_posted_at || s.last_posted_at < cutoff);
  return (fresh.length ? fresh : candidates).sort(rank)[0];
}

/** Counts for the console header: how many days of content are actually in hand. */
export function stockSummary(stock, config) {
  const videos = stock.filter((s) => s.kind === "video" && !s.retired);
  const images = stock.filter((s) => s.kind === "image" && !s.retired);
  const perDay = (config?.slots ?? []).length || 1;
  const videoSlotsPerDay = (config?.slots ?? []).filter((s) => (s.content_type ?? "video") === "video").length || 1;
  return {
    videos: videos.length,
    images: images.length,
    vertical_videos: videos.filter((v) => v.aspect === "9:16").length,
    never_posted: stock.filter((s) => !s.retired && s.posted_count === 0).length,
    slots_per_day: perDay,
    // Rough runway: how many days before every video has been used once.
    days_of_video_runway: Math.floor(videos.length / videoSlotsPerDay),
  };
}
