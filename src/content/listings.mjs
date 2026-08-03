// The land listing sheet.
//
// One row per plot, recovered from posts the page already published, so the back
// catalogue becomes a queue you can post through group by group instead of scrolling
// the page hunting for what you wrote in March.
//
// Two intake paths, because waiting on a Facebook token should not block the work:
//   - importFromPageArchive()  reads content/page-posts.json (needs FACEBOOK_PAGE_*)
//   - importFromText()         reads posts pasted into a file or the console, works today
//
// Enrichment is deliberately thin. Google Places can return 21 results across 7
// categories; a Thai group post with 21 bullet points does not get read. Only the three
// nearest categories survive, one line each.
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { fillTemplate } from "../lib/prompt-library.mjs";
import { parseLocationInput, formatDistance } from "../lib/geo.mjs";
import { findNearbyPlaces } from "../lib/places.mjs";
import { readJson, writeJson } from "./store.mjs";
import { toCsv, toTsv, fromCsv } from "./sheet.mjs";
import { loadArchive } from "./page-archive.mjs";

const LISTINGS_FILE = "listings.json";
const MODEL = "claude-haiku-4-5-20251001";

/** How many nearby categories make it into a caption. Three is the readable limit. */
export const NEARBY_LIMIT = 3;

export const LISTING_COLUMNS = [
  "listing_id",
  "status",
  "title",
  "size_text",
  "price_text",
  "price_thb",
  "location",
  "maps_url",
  "coordinates",
  "nearby",
  "highlights",
  "contact",
  "caption",
  "source_post_url",
  "posted_date",
  "last_group_post",
  "note",
];

export const LISTING_STATUSES = ["NEW", "READY", "POSTED", "SOLD", "HIDDEN"];

export async function loadListings() {
  return readJson(LISTINGS_FILE, { items: [] });
}

export async function saveListings(data) {
  return writeJson(LISTINGS_FILE, data);
}

// --- extraction -------------------------------------------------------------

/** Maps links appear far more reliably by regex than by asking a model to copy a URL. */
export function findMapsUrl(text) {
  const m = String(text ?? "").match(
    /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps\S*|maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+)/i
  );
  return m ? m[0].replace(/[.,)\]]+$/, "") : null;
}

/**
 * Whether the source post claims the owner is selling directly.
 *
 * Many Facebook groups only allow owner posts and ban agents, so this badge decides
 * whether a post is welcome or gets the account removed. It is therefore read from what
 * the original post actually said, never assumed -- an unearned "เจ้าของขายเอง" is a
 * false claim about who is selling.
 */
export function claimsOwnerSale(text) {
  return /เจ้าของขายเอง|เจ้าของขาย|ขายเอง|owner\s*sale/i.test(String(text ?? ""));
}

/** Bare "14.123456, 101.123456" pairs, which people paste as often as links. */
export function findCoordinates(text) {
  const m = String(text ?? "").match(/(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/);
  return m ? `${m[1]},${m[2]}` : null;
}

function stripJsonFence(text) {
  return String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

/**
 * Pull structured listing data out of one post.
 * The regex results override the model for maps_url and coordinates -- a model that
 * paraphrases a URL by one character produces a link that silently goes nowhere.
 */
export async function extractListing(postText, { apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  if (!apiKey) throw new Error("ต้องมี ANTHROPIC_API_KEY เพื่อแยกข้อมูลจากโพสต์");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: fillTemplate("TPL_PROP_010_v1", { post_text: postText }) }],
  });

  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let data;
  try {
    data = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("โมเดลตอบกลับมาไม่ใช่ JSON ที่อ่านได้");
  }

  return {
    ...data,
    maps_url: findMapsUrl(postText) ?? data.maps_url ?? null,
    coordinates: findCoordinates(postText) ?? data.coordinates ?? null,
    owner_sale: claimsOwnerSale(postText),
    highlights: (data.highlights ?? []).slice(0, 3),
  };
}

// --- enrichment -------------------------------------------------------------

/**
 * Resolve the plot's coordinates and attach the three nearest categories.
 * Fails soft on every step: a listing with no coordinates is still a usable row, and
 * Places being unavailable must not lose the extraction work that already happened.
 */
export async function enrichListing(listing, { apiKey = process.env.GOOGLE_MAPS_API_KEY, radius = 5000 } = {}) {
  const source = listing.coordinates || listing.maps_url;
  if (!source) return { ...listing, nearby: listing.nearby ?? [], enrich_note: "ไม่มีลิงก์แผนที่หรือพิกัด" };
  if (!apiKey) return { ...listing, nearby: listing.nearby ?? [], enrich_note: "ไม่มี GOOGLE_MAPS_API_KEY" };

  let lat = null;
  let lng = null;
  try {
    const parsed = await parseLocationInput(source);
    if (parsed.kind === "coords") {
      lat = parsed.lat;
      lng = parsed.lng;
    } else {
      // A place name rather than coordinates. Geocoding is a separate paid call and the
      // listing is still useful without it, so record the gap instead of spending.
      return { ...listing, nearby: listing.nearby ?? [], enrich_note: `ลิงก์ไม่มีพิกัด (${parsed.address})` };
    }
  } catch (err) {
    return { ...listing, nearby: listing.nearby ?? [], enrich_note: `อ่านลิงก์ไม่ได้: ${err.message}` };
  }

  try {
    const { groups } = await findNearbyPlaces({ lat, lng, radius, perCategory: 1, apiKey });
    const nearby = groups.slice(0, NEARBY_LIMIT).map((g) => ({
      label: g.label,
      name: g.places[0]?.name ?? null,
      distance_text: formatDistance(g.nearest_m),
      line: `ใกล้${g.label} ${formatDistance(g.nearest_m)}`,
    }));
    return { ...listing, lat, lng, coordinates: `${lat},${lng}`, nearby, enrich_note: null };
  } catch (err) {
    return { ...listing, lat, lng, coordinates: `${lat},${lng}`, nearby: [], enrich_note: `Places ล้มเหลว: ${err.message}` };
  }
}

// --- short group caption ----------------------------------------------------

function formatPrice(listing) {
  if (listing.price_text) return listing.price_text;
  if (listing.price_thb == null) return "สอบถามราคา";
  const n = Number(listing.price_thb);
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m.toFixed(m % 1 === 0 ? 0 : 1).replace(/\.0$/, "")} ล้าน`;
  }
  return `${n.toLocaleString("th-TH")} บาท`;
}

/**
 * The caption that gets pasted into a group.
 *
 * Written by hand rather than by a model, on purpose. A group post is scanned in about
 * two seconds: what, how big, how much, where, how to contact. Every extra sentence
 * costs a reader. A model asked for "short" drifts long over a batch of fifty, and it
 * can quietly invent a distance; this cannot. Roughly 8 short lines, ~200 characters.
 */
export function buildGroupCaption(listing, { profile = {}, includeMap = true } = {}) {
  const lines = [];
  const size = listing.size_text ? ` ${listing.size_text}` : "";

  lines.push(`📍 ขายที่ดิน${size} ${listing.location ?? ""}`.trim());
  // The owner badge is only printed when the source listing actually claimed it.
  lines.push(`💰 ${formatPrice(listing)}${listing.owner_sale ? " (เจ้าของขายเอง)" : ""}`);

  const bullets = [
    ...(listing.highlights ?? []).slice(0, 2),
    ...(listing.nearby ?? []).slice(0, NEARBY_LIMIT).map((n) => n.line),
  ].slice(0, 4);
  if (bullets.length) {
    lines.push("");
    lines.push(...bullets.map((b) => `• ${b}`));
  }

  if (includeMap && listing.maps_url) {
    lines.push("");
    lines.push(`🗺️ แผนที่ ${listing.maps_url}`);
  }

  lines.push("");
  lines.push(`สนใจทัก ${listing.contact || profile.contact_method || "แชทเพจ"}`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --- import paths -----------------------------------------------------------

function newListing(fields) {
  return {
    listing_id: fields.listing_id ?? `LAND-${randomUUID().slice(0, 8).toUpperCase()}`,
    status: "NEW",
    title: null,
    price_thb: null,
    price_text: null,
    size_text: null,
    size_rai: null,
    location: null,
    maps_url: null,
    coordinates: null,
    lat: null,
    lng: null,
    nearby: [],
    highlights: [],
    contact: null,
    caption: "",
    // Photo of this exact plot from the original page post. The manual kit downloads it
    // so a group post ships with the right picture instead of a stand-in.
    photo_url: null,
    source_post_id: null,
    source_post_url: null,
    posted_date: null,
    last_group_post: null,
    note: "",
    created_at: new Date().toISOString(),
    ...fields,
  };
}

/** Split a pasted blob into individual posts. `---` on its own line is the separator. */
export function splitPosts(text) {
  return String(text ?? "")
    .split(/^\s*-{3,}\s*$/m)
    .map((t) => t.trim())
    .filter((t) => t.length > 20);
}

async function ingest(posts, { enrich, profile, apiKey, mapsKey, onProgress }) {
  const store = await loadListings();
  const seen = new Set(store.items.map((i) => i.source_post_id).filter(Boolean));
  const added = [];
  const skipped = [];

  for (const [i, post] of posts.entries()) {
    onProgress?.({ index: i + 1, total: posts.length });
    if (post.source_post_id && seen.has(post.source_post_id)) {
      skipped.push({ id: post.source_post_id, reason: "นำเข้าแล้ว" });
      continue;
    }

    let extracted;
    try {
      extracted = await extractListing(post.text, { apiKey });
    } catch (err) {
      skipped.push({ id: post.source_post_id ?? `#${i + 1}`, reason: err.message });
      continue;
    }
    if (extracted.is_listing === false) {
      skipped.push({ id: post.source_post_id ?? `#${i + 1}`, reason: "ไม่ใช่โพสต์ขายที่ดิน" });
      continue;
    }

    let item = newListing({
      title: extracted.title ?? null,
      price_thb: extracted.price_thb ?? null,
      price_text: extracted.price_text ?? null,
      size_text: extracted.size_text ?? null,
      size_rai: extracted.size_rai ?? null,
      location: extracted.location ?? null,
      maps_url: extracted.maps_url ?? null,
      coordinates: extracted.coordinates ?? null,
      highlights: extracted.highlights ?? [],
      owner_sale: Boolean(extracted.owner_sale),
      contact: extracted.contact ?? null,
      photo_url: post.photo_url ?? null,
      source_post_id: post.source_post_id ?? null,
      source_post_url: post.source_post_url ?? null,
      posted_date: post.posted_date ?? null,
    });

    if (enrich) item = await enrichListing(item, { apiKey: mapsKey });
    item.caption = buildGroupCaption(item, { profile });

    store.items.push(item);
    if (item.source_post_id) seen.add(item.source_post_id);
    added.push(item);
  }

  await saveListings(store);
  return { added, skipped, total: store.items.length };
}

/** Intake from the archived page posts (requires page:pull to have run first). */
export async function importFromPageArchive({ enrich = true, profile = {}, limit = 200, onProgress } = {}) {
  const { posts } = await loadArchive();
  const candidates = posts
    .filter((p) => (p.message ?? "").length > 40)
    .slice(0, limit)
    .map((p) => ({
      text: p.message,
      source_post_id: p.post_id,
      source_post_url: p.permalink_url,
      photo_url: p.picture ?? null,
      posted_date: (p.created_time ?? "").slice(0, 10),
    }));
  return ingest(candidates, {
    enrich,
    profile,
    apiKey: process.env.ANTHROPIC_API_KEY,
    mapsKey: process.env.GOOGLE_MAPS_API_KEY,
    onProgress,
  });
}

/**
 * Intake from a Facebook Ads Manager export (content/ads-creatives.json).
 *
 * This is the path that works for THIS page today. The organic Page API needs a token
 * that does not exist yet, but the boosted posts carry the same listing text, and the
 * Ads connector can read them. The connector is MCP, which the server cannot call
 * itself, so the file is the handoff: ask Claude to refresh it when new listings go up.
 *
 * Several creatives usually share one listing (the same post boosted repeatedly, or
 * A/B copy variants), so dedupe is on the body text rather than on the creative id.
 */
export async function importFromAdsExport(json, { enrich = true, profile = {}, onProgress } = {}) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  const creatives = data.creatives ?? data.ad_creatives ?? [];

  const seenBodies = new Set();
  const posts = [];
  for (const c of creatives) {
    const body = c.body ?? "";
    if (body.trim().length < 40) continue;
    // Normalising away whitespace and emoji variance keeps A/B copy variants of the
    // same plot from becoming two rows in the sheet.
    const fingerprint = body.replace(/\s+/g, "").slice(0, 120);
    if (seenBodies.has(fingerprint)) continue;
    seenBodies.add(fingerprint);

    posts.push({
      text: body,
      source_post_id: c.story_id ?? c.effective_object_story_id ?? c.id,
      source_post_url: (c.story_id ?? c.effective_object_story_id)
        ? `https://www.facebook.com/${(c.story_id ?? c.effective_object_story_id).replace("_", "/posts/")}`
        : null,
      photo_url: c.image_url ?? null,
      posted_date: c.date ?? null,
    });
  }

  return ingest(posts, {
    enrich,
    profile,
    apiKey: process.env.ANTHROPIC_API_KEY,
    mapsKey: process.env.GOOGLE_MAPS_API_KEY,
    onProgress,
  });
}

/** Intake from pasted text -- posts separated by a line of `---`. Works with no tokens. */
export async function importFromText(text, { enrich = true, profile = {}, onProgress } = {}) {
  const posts = splitPosts(text).map((t) => ({ text: t }));
  return ingest(posts, {
    enrich,
    profile,
    apiKey: process.env.ANTHROPIC_API_KEY,
    mapsKey: process.env.GOOGLE_MAPS_API_KEY,
    onProgress,
  });
}

// --- edit / sheet -----------------------------------------------------------

export async function patchListing(id, patch, { profile = {}, rebuildCaption = false } = {}) {
  const store = await loadListings();
  const idx = store.items.findIndex((i) => i.listing_id === id);
  if (idx === -1) throw new Error(`ไม่พบที่ดิน ${id}`);
  store.items[idx] = { ...store.items[idx], ...patch, updated_at: new Date().toISOString() };
  if (rebuildCaption) store.items[idx].caption = buildGroupCaption(store.items[idx], { profile });
  await saveListings(store);
  return store.items[idx];
}

/** Re-run Places for rows that have a map link but no nearby data yet. */
export async function enrichAll({ profile = {}, force = false, onProgress } = {}) {
  const store = await loadListings();
  const done = [];
  for (const [i, item] of store.items.entries()) {
    if (!force && item.nearby?.length) continue;
    if (!item.maps_url && !item.coordinates) continue;
    onProgress?.({ index: i + 1, total: store.items.length, id: item.listing_id });
    const enriched = await enrichListing(item);
    enriched.caption = buildGroupCaption(enriched, { profile });
    store.items[i] = enriched;
    done.push({ listing_id: enriched.listing_id, nearby: enriched.nearby.length, note: enriched.enrich_note });
  }
  await saveListings(store);
  return done;
}

function listingToRow(item) {
  return {
    listing_id: item.listing_id,
    status: item.status,
    title: item.title ?? "",
    size_text: item.size_text ?? "",
    price_text: item.price_text ?? "",
    price_thb: item.price_thb ?? "",
    location: item.location ?? "",
    maps_url: item.maps_url ?? "",
    coordinates: item.coordinates ?? "",
    nearby: (item.nearby ?? []).map((n) => n.line).join(" | "),
    highlights: (item.highlights ?? []).join(" | "),
    contact: item.contact ?? "",
    caption: item.caption ?? "",
    source_post_url: item.source_post_url ?? "",
    posted_date: item.posted_date ?? "",
    last_group_post: item.last_group_post ?? "",
    note: item.note ?? "",
  };
}

export async function listingsToSheet({ format = "csv" } = {}) {
  const { items } = await loadListings();
  const rows = items.map(listingToRow);
  return format === "tsv"
    ? toTsv(rows, { columns: LISTING_COLUMNS })
    : toCsv(rows, { columns: LISTING_COLUMNS, bom: true });
}

/**
 * Read the sheet back. Only existing rows are touched and only editable columns --
 * nearby/coordinates stay owned by the enrichment step so a stale paste cannot
 * overwrite real Places data with something hand-typed.
 */
export async function listingsFromSheet(csvText, { profile = {} } = {}) {
  const rows = fromCsv(csvText);
  const store = await loadListings();
  const applied = [];
  const ignored = [];

  for (const row of rows) {
    const idx = store.items.findIndex((i) => i.listing_id === row.listing_id);
    if (idx === -1) {
      ignored.push({ id: row.listing_id, reason: "ไม่มีรหัสนี้ในระบบ" });
      continue;
    }
    const patch = {};
    for (const key of ["title", "size_text", "price_text", "location", "maps_url", "contact", "caption", "note"]) {
      if (row[key] !== undefined) patch[key] = row[key];
    }
    if (row.price_thb) patch.price_thb = Number(row.price_thb) || null;
    if (row.status && LISTING_STATUSES.includes(row.status.trim().toUpperCase())) {
      patch.status = row.status.trim().toUpperCase();
    }
    if (row.highlights !== undefined) {
      patch.highlights = row.highlights.split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);
    }
    store.items[idx] = { ...store.items[idx], ...patch, updated_at: new Date().toISOString() };
    applied.push({ id: row.listing_id, changed: Object.keys(patch) });
  }

  await saveListings(store);
  return { applied, ignored, profile };
}

/**
 * Find plots that appear more than once because the page re-advertised them over
 * months. Matching is on title + size + price, which is conservative: two genuinely
 * different plots almost never agree on all three, while the same plot reposted keeps
 * them identical.
 *
 * @returns {Array<{ key, keep, hide }>} newest row kept, older ones proposed for hiding
 */
export function findDuplicates(items) {
  const groups = new Map();
  for (const i of items) {
    if (i.status === "HIDDEN") continue;
    const key = [
      String(i.title ?? "").replace(/\s+/g, "").slice(0, 24),
      String(i.size_text ?? "").replace(/\s+/g, ""),
      String(i.price_text ?? i.price_thb ?? "").replace(/\s+/g, ""),
    ].join("|");
    if (!key.replace(/\|/g, "")) continue; // nothing to match on
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      // Keep the most recently posted row: it carries the current price and photo.
      const sorted = [...rows].sort((a, b) => String(b.posted_date ?? "").localeCompare(String(a.posted_date ?? "")));
      return {
        key,
        title: sorted[0].title,
        keep: sorted[0].listing_id,
        hide: sorted.slice(1).map((r) => r.listing_id),
      };
    });
}

/** Mark the older copies HIDDEN so they drop out of the posting rotation. */
export async function hideDuplicates() {
  const store = await loadListings();
  const dupes = findDuplicates(store.items);
  const hidden = [];
  for (const d of dupes) {
    for (const id of d.hide) {
      const idx = store.items.findIndex((i) => i.listing_id === id);
      if (idx === -1) continue;
      store.items[idx] = { ...store.items[idx], status: "HIDDEN", note: `ซ้ำกับ ${d.keep}` };
      hidden.push(id);
    }
  }
  await saveListings(store);
  return { groups: dupes.length, hidden };
}

/** Minimum gap before the same plot may go into groups again. */
export const MIN_HOURS_BETWEEN_POSTS = 24;

/**
 * Next listing to push into a group.
 *
 * Two rules, in order:
 *  1. **A plot may not be posted twice inside 24 hours.** Hard filter, never relaxed --
 *     the same land appearing twice in a day across the same groups reads as spam and is
 *     what gets an account restricted.
 *  2. **Straight round-robin over everything else**: always the plot that has gone
 *     longest since its last group post, never-posted first. With N plots and one slot a
 *     day this cycles through the whole sheet before anything repeats.
 *
 * `postedAt` may be a map of listing_id -> ISO timestamp that overrides the stored
 * `last_group_post`. The planner uses it to project a week ahead, so day 3 already knows
 * what day 2 will have used.
 *
 * @returns {object|null} null means every plot is inside its cooldown
 */
export function pickListing(items, { excludeIds = [], now = new Date(), postedAt = {} } = {}) {
  const sellable = items.filter((i) => ["NEW", "READY", "POSTED"].includes(i.status));
  if (!sellable.length) return null;

  const lastPost = (i) => postedAt[i.listing_id] ?? i.last_group_post ?? null;
  const cutoff = new Date(new Date(now).getTime() - MIN_HOURS_BETWEEN_POSTS * 3_600_000).toISOString();

  const eligible = sellable.filter((i) => {
    const last = lastPost(i);
    if (!last) return true;
    // Older rows stored a bare YYYY-MM-DD; treat that as the start of that day.
    return (last.length === 10 ? `${last}T00:00:00.000Z` : last) <= cutoff;
  });
  if (!eligible.length) return null;

  // excludeIds is only a tie-breaker for variety within one planning run. The 24h rule
  // above is what actually protects against reposting too soon.
  const claims = excludeIds.reduce((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});

  return [...eligible].sort((a, b) => {
    const la = lastPost(a);
    const lb = lastPost(b);
    if (!la !== !lb) return la ? 1 : -1; // never posted goes first
    if (la && lb && la !== lb) return la.localeCompare(lb);
    const ca = claims[a.listing_id] ?? 0;
    const cb = claims[b.listing_id] ?? 0;
    if (ca !== cb) return ca - cb;
    // READY is an explicit "post this next" from the sheet, so it wins a true tie.
    if (a.status !== b.status) return a.status === "READY" ? -1 : b.status === "READY" ? 1 : 0;
    return String(a.listing_id).localeCompare(String(b.listing_id));
  })[0];
}
