// The posting queue: one entry per calendar slot, moving DRAFT -> READY -> POSTED.
//
// The queue is keyed by slot_id, which is what makes the daily runner safe to fire more
// than once. Cron firing twice, a manual re-run, a laptop waking up and catching up --
// all of them find the slot already filled and leave it alone. Nothing else in this
// design prevents double-posting to a live page, so this key is load-bearing.
import { readJson, writeJson } from "./store.mjs";
import { loadScheduleConfig, buildSchedule, dueSlots, localDateString } from "./calendar.mjs";
import { scanStock, pickForSlot, markPosted } from "./stock.mjs";
import {
  loadListings,
  pickListing,
  patchListing,
  buildGroupCaption,
  MIN_HOURS_BETWEEN_POSTS,
} from "./listings.mjs";
import { pickTopic } from "./topics.mjs";
import { renderCarousel } from "../engines/carousel-engine.mjs";
import { runPublishEngine } from "../engines/publish-engine.mjs";
import { writeCaption } from "../publish/captions.mjs";
import { DRAFT_COLUMNS, toCsv, toTsv, fromCsv, queueItemToRow, rowToQueuePatch } from "./sheet.mjs";

const QUEUE_FILE = "queue.json";
const PROFILE_FILE = "page.profile.json";

export const STATUSES = ["DRAFT", "READY", "SCHEDULED", "POSTED", "FAILED", "SKIPPED"];

/**
 * Page-level defaults that every caption needs and no individual clip carries.
 * Kept in a file so contact details change in one place, not across every draft.
 */
export const DEFAULT_PROFILE = {
  page_name: "ติดดินบินโดรน - ขายที่ดินนครนายก",
  default_location: "นครนายก",
  contact_method: "ทักแชทเพจ หรือ LINE @244raxjb",
  default_title: "ที่ดินสวย ทำเลดี",
  default_highlight_features: ["เจ้าของขายเอง", "โฉนดพร้อมโอน"],
  // false = prepare everything and stop, you press post. true = the runner posts by itself.
  auto_publish: false,
};

export async function loadProfile() {
  return { ...DEFAULT_PROFILE, ...(await readJson(PROFILE_FILE, {})) };
}

export async function saveProfile(profile) {
  return writeJson(PROFILE_FILE, { ...DEFAULT_PROFILE, ...profile });
}

export async function loadQueue() {
  return readJson(QUEUE_FILE, { items: [] });
}

export async function saveQueue(queue) {
  return writeJson(QUEUE_FILE, queue);
}

export async function getItem(id) {
  const q = await loadQueue();
  return q.items.find((i) => i.id === id) ?? null;
}

export async function patchItem(id, patch) {
  const q = await loadQueue();
  const idx = q.items.findIndex((i) => i.id === id);
  if (idx === -1) throw new Error(`ไม่พบรายการ ${id}`);
  q.items[idx] = { ...q.items[idx], ...patch, updated_at: new Date().toISOString() };
  await saveQueue(q);
  return q.items[idx];
}

function postFromStockItem(stockItem, profile) {
  return {
    title: stockItem?.title || profile.default_title,
    price_thb: stockItem?.price_thb ?? null,
    location: profile.default_location,
    highlight_features: stockItem?.tags?.length ? stockItem.tags : profile.default_highlight_features,
    contact_method: profile.contact_method,
    style_tag: "CONTEMPORARY",
  };
}

/** Slot filled from the rendered-clip / photo library. */
async function fillFromStock(slot, { stock, profile, claimed, writeCaptions }) {
  const pick = pickForSlot(slot, stock, { excludeIds: claimed.stock });
  if (!pick) {
    return { error: `ไม่มีสต็อก${slot.content_type === "image" ? "รูป" : "คลิป"}ที่ใช้ได้` };
  }
  claimed.stock.push(pick.id);

  const post = postFromStockItem(pick, profile);
  let caption = "";
  if (writeCaptions) {
    // One caption at plan time, on the primary platform, so the human has something
    // concrete to edit in the sheet. Per-platform captions are written at post time.
    const primary = slot.platforms[0] === "MANUAL_KIT" ? "FACEBOOK_PAGE" : slot.platforms[0];
    caption = (await writeCaption(primary, post).catch(() => null))?.caption ?? "";
  }

  return {
    property_id: pick.property_id ?? `STOCK-${pick.id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40)}`,
    video_file: pick.kind === "video" ? pick.file : null,
    image_files: pick.kind === "image" ? [pick.file] : [],
    stock_id: pick.id,
    aspect: slot.aspect ?? pick.aspect ?? null,
    post,
    caption,
  };
}

/** Slot filled from the land sheet -- a specific plot, going out to groups. */
async function fillFromListing(slot, { listings, profile, claimed, listingPostedAt }) {
  if (!listings.length) return { error: "ยังไม่มีที่ดินในชีต (นำเข้าด้วย listings:import ก่อน)" };

  // Evaluate the 24h rule against the slot's own time, not against now, so planning a
  // week ahead respects the gap the same way the live schedule will.
  const slotTime = new Date(`${slot.date}T${slot.time}:00+07:00`);
  const pick = pickListing(listings, {
    excludeIds: claimed.listings,
    now: slotTime,
    postedAt: listingPostedAt,
  });
  if (!pick) {
    return {
      error: `ทุกแปลงเพิ่งลงกลุ่มไปภายใน ${MIN_HOURS_BETWEEN_POSTS} ชม. (มี ${listings.length} แปลง เพิ่มแปลงในชีตจะวนได้ถี่ขึ้น)`,
    };
  }
  claimed.listings.push(pick.listing_id);
  // Book the slot against this plot so the following days see it as just-posted.
  listingPostedAt[pick.listing_id] = slotTime.toISOString();

  return {
    property_id: pick.listing_id,
    listing_id: pick.listing_id,
    video_file: null,
    image_files: [],
    // The plot's own photo from the original page post, if the import captured one.
    // Never a clip of a different plot -- that would misrepresent what is for sale.
    photo_url: pick.photo_url ?? null,
    post: {
      title: pick.title,
      price_thb: pick.price_thb,
      location: pick.location,
      highlight_features: [...(pick.highlights ?? []), ...(pick.nearby ?? []).map((n) => n.line)].slice(0, 4),
      contact_method: pick.contact || profile.contact_method,
      maps_url: pick.maps_url,
      text_only: true,
    },
    // Already short and factual by construction -- do not spend a model call rewriting
    // it into something longer.
    caption: pick.caption || buildGroupCaption(pick, { profile }),
  };
}

/** Slot filled with a knowledge carousel, rendering the slides if not already on disk. */
async function fillFromCarousel(slot, { profile, claimed, carouselUsage }) {
  const topic = pickTopic(carouselUsage, { excludeIds: claimed.topics });
  if (!topic) return { error: "ไม่มีหัวข้อความรู้เหลือ" };
  claimed.topics.push(topic.id);

  let rendered;
  try {
    rendered = await renderCarousel({ topic_id: topic.id, theme: profile.carousel_theme ?? "amber", profile });
  } catch (err) {
    return { error: `สร้างสไลด์ไม่สำเร็จ: ${err.message}` };
  }

  return {
    property_id: `TOPIC-${topic.id.toUpperCase().replace(/[^A-Z0-9-]/g, "-")}`,
    topic_id: topic.id,
    video_file: null,
    image_files: rendered.slides,
    post: { title: topic.title.join(" "), highlight_features: [], contact_method: profile.contact_method },
    caption: rendered.caption,
    warnings: rendered.warnings,
  };
}

const FILLERS = { stock: fillFromStock, listing: fillFromListing, carousel: fillFromCarousel };

/**
 * Fill every unfilled slot in the next `days` days with a draft.
 * Idempotent: existing entries are never overwritten unless `refill` is set.
 *
 * @returns {{ created, skipped, missing_required, items }}
 */
export async function planAhead({ days = 7, from, refill = false, writeCaptions = true } = {}) {
  const [config, profile, queue, stock, listingStore] = await Promise.all([
    loadScheduleConfig(),
    loadProfile(),
    loadQueue(),
    scanStock(),
    loadListings(),
  ]);

  const schedule = buildSchedule(config, { from, days });
  const existing = new Map(queue.items.map((i) => [i.id, i]));
  const created = [];
  const skipped = [];
  const missingRequired = [];

  // Anything already spoken for -- in the existing queue or earlier in this same run --
  // is off the table, otherwise every slot in the week picks the identical
  // "least recently used" item and the week becomes seven copies of one post.
  const live = queue.items.filter((i) => i.status !== "SKIPPED");
  const claimed = {
    stock: live.map((i) => i.stock_id).filter(Boolean),
    listings: live.map((i) => i.listing_id).filter(Boolean),
    topics: live.map((i) => i.topic_id).filter(Boolean),
  };

  // Carousel rotation reads straight off the queue rather than a separate usage file,
  // so there is one history to keep consistent instead of two.
  const carouselUsage = {};
  for (const i of live) {
    if (i.topic_id && (!carouselUsage[i.topic_id] || i.date > carouselUsage[i.topic_id])) {
      carouselUsage[i.topic_id] = i.date;
    }
  }

  // Projected "last posted to a group" per plot: what the sheet already records, plus
  // whatever slots this run books. The 24h rule is evaluated against this.
  const listingPostedAt = {};
  for (const l of listingStore.items) {
    if (l.last_group_post) listingPostedAt[l.listing_id] = l.last_group_post;
  }
  for (const i of live) {
    if (!i.listing_id) continue;
    const at = new Date(`${i.date}T${i.time}:00+07:00`).toISOString();
    if (!listingPostedAt[i.listing_id] || at > listingPostedAt[i.listing_id]) {
      listingPostedAt[i.listing_id] = at;
    }
  }

  for (const day of schedule) {
    for (const slot of day.slots) {
      const prior = existing.get(slot.slot_id);
      if (prior && !(refill && prior.status === "DRAFT")) {
        skipped.push({ slot_id: slot.slot_id, reason: `มีอยู่แล้ว (${prior.status})` });
        continue;
      }

      const filler = FILLERS[slot.source];
      if (!filler) {
        skipped.push({ slot_id: slot.slot_id, reason: `ไม่รู้จักแหล่งคอนเทนต์ "${slot.source}"` });
        continue;
      }

      const filled = await filler(slot, {
        stock,
        listings: listingStore.items,
        profile,
        claimed,
        carouselUsage,
        listingPostedAt,
        writeCaptions,
      });

      if (filled.error) {
        skipped.push({ slot_id: slot.slot_id, reason: filled.error, required: slot.required });
        // A missed clip day is the one failure worth surfacing rather than logging.
        if (slot.required) missingRequired.push({ slot_id: slot.slot_id, reason: filled.error });
        continue;
      }
      if (filled.topic_id) carouselUsage[filled.topic_id] = slot.date;

      const { error, warnings, ...content } = filled;
      const item = {
        id: slot.slot_id,
        slot_id: slot.slot_id,
        date: slot.date,
        time: slot.time,
        slot_name: slot.name,
        platforms: slot.platforms,
        content_type: slot.content_type,
        source: slot.source,
        status: "DRAFT",
        results: [],
        note: warnings?.length ? warnings.join(" · ") : "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        posted_at: null,
        ...content,
      };

      if (prior) {
        queue.items[queue.items.findIndex((i) => i.id === prior.id)] = item;
      } else {
        queue.items.push(item);
      }
      existing.set(item.id, item);
      created.push(item);
    }
  }

  queue.items.sort((a, b) => a.id.localeCompare(b.id));
  await saveQueue(queue);
  return { created, skipped, missing_required: missingRequired, items: queue.items };
}

/**
 * Publish one queue entry.
 * `dry_run` defaults to true here too -- the only way to go live is to say so.
 *
 * `schedule` queues the post in Meta's Planner at the slot's own time rather than
 * publishing now. That is what "make me a draft I can then post" means on Facebook:
 * the Graph API has no organic draft endpoint, and a scheduled post is the only server-
 * created object the page owner can review, edit, publish early, or delete beforehand.
 */
export async function publishItem(id, { dry_run = true, schedule = false, env = process.env } = {}) {
  const item = await getItem(id);
  if (!item) throw new Error(`ไม่พบรายการ ${id}`);
  if (item.status === "POSTED") {
    return { skipped: true, reason: "โพสต์ไปแล้ว", item };
  }
  if (item.status === "SCHEDULED" && schedule) {
    return { skipped: true, reason: "ตั้งเวลาไว้แล้วในเพจ", item };
  }

  const scheduleAt = schedule ? new Date(`${item.date}T${item.time}:00+07:00`).toISOString() : null;

  const result = await runPublishEngine(
    {
      property_id: item.property_id,
      video_file: item.video_file,
      image_files: item.image_files ?? [],
      post: { ...item.post, text_only: !item.video_file && !(item.image_files ?? []).length },
      target_platforms: item.platforms,
      // A caption edited in the sheet is authoritative -- do not regenerate over it.
      captions: item.caption ? { ALL: item.caption } : {},
      kit_slug: `${item.date}-${item.property_id}`,
      photo_url: item.photo_url ?? null,
      manual_targets: item.source === "listing" ? ["กลุ่ม Facebook", "Marketplace"] : undefined,
      schedule_at: scheduleAt,
      dry_run,
    },
    { env }
  );

  const anyLive = result.published_destinations.some((d) => d.ok && !d.dry_run);
  const anyScheduled = result.published_destinations.some((d) => d.ok && d.scheduled_for);
  const patch = {
    results: result.published_destinations,
    last_publish_status: result.status,
    updated_at: new Date().toISOString(),
  };
  if (!dry_run) {
    // SCHEDULED is not POSTED: it sits in the Planner until its time, and the daily
    // runner must not treat the slot as already served.
    patch.status = result.status === "FAILED" ? "FAILED" : anyScheduled ? "SCHEDULED" : "POSTED";
    if (!anyScheduled) patch.posted_at = new Date().toISOString();
    if (anyScheduled) patch.scheduled_at = scheduleAt;
  }
  const updated = await patchItem(id, patch);

  // Only count it against the rotation if something actually went out. A kit built for
  // a group post counts too -- the folder is the deliverable there, and if it did not
  // advance the rotation the same plot would be prepared again tomorrow.
  const kitBuilt = result.published_destinations.some((d) => d.platform === "MANUAL_KIT" && d.ok);
  if ((anyLive || kitBuilt) && item.stock_id) await markPosted(item.stock_id);
  if ((anyLive || kitBuilt) && item.listing_id) {
    // Full timestamp, not just a date -- the 24h cooldown needs the hour.
    await patchListing(item.listing_id, {
      last_group_post: new Date().toISOString(),
      status: "POSTED",
    }).catch(() => {});
  }

  return { skipped: false, item: updated, publish: result };
}

/**
 * The cron entry point. Tops up the calendar, then handles every slot whose time has
 * come. With auto_publish off it stops at "prepared", which is the "เตรียมไว้ให้พร้อม
 * กดโพสต์อย่างเดียว" mode; with it on, the same path publishes.
 */
export async function runDue({ now = new Date(), dry_run = null, planDays = 7, env = process.env } = {}) {
  const profile = await loadProfile();
  const config = await loadScheduleConfig();
  const live = dry_run === null ? Boolean(profile.auto_publish) : !dry_run;

  const plan = await planAhead({ days: planDays });
  const due = dueSlots(config, { now });
  const queue = await loadQueue();

  const handled = [];
  for (const slot of due) {
    const item = queue.items.find((i) => i.id === slot.slot_id);
    if (!item) {
      handled.push({ slot_id: slot.slot_id, action: "no_content", detail: "ไม่มีรายการในคิว (สต็อกหมด?)" });
      continue;
    }
    if (item.status === "POSTED") {
      handled.push({ slot_id: slot.slot_id, action: "already_posted" });
      continue;
    }
    if (item.status === "SKIPPED") {
      handled.push({ slot_id: slot.slot_id, action: "skipped_by_user" });
      continue;
    }
    if (!live && item.status !== "READY") {
      handled.push({ slot_id: slot.slot_id, action: "prepared", detail: "รอกดโพสต์เอง (auto_publish = false)" });
      continue;
    }

    const out = await publishItem(slot.slot_id, { dry_run: !live, env });
    handled.push({
      slot_id: slot.slot_id,
      action: live ? "published" : "dry_run",
      status: out.publish?.status,
      destinations: out.publish?.published_destinations?.map((d) => ({
        platform: d.platform,
        ok: d.ok,
        url: d.publish_url,
        error: d.error_code,
      })),
    });
  }

  return {
    ran_at: now.toISOString(),
    date: localDateString(now, config.timezone),
    auto_publish: live,
    planned: plan.created.length,
    plan_skipped: plan.skipped,
    due: due.length,
    handled,
  };
}

// --- Google Sheet round-trip ------------------------------------------------

export async function exportSheet({ format = "csv", days = 14, from } = {}) {
  const queue = await loadQueue();
  const start = from ?? localDateString(new Date());
  const end = (() => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();
  const rows = queue.items.filter((i) => i.date >= start && i.date <= end).map(queueItemToRow);
  return format === "tsv"
    ? toTsv(rows, { columns: DRAFT_COLUMNS })
    : toCsv(rows, { columns: DRAFT_COLUMNS, bom: true });
}

/**
 * Read the sheet back. Only rows that already exist in the queue are touched, and only
 * the human-editable columns -- a stale sheet cannot resurrect or invent posts.
 */
export async function importSheet(csvText) {
  const rows = fromCsv(csvText);
  const queue = await loadQueue();
  const applied = [];
  const ignored = [];

  for (const row of rows) {
    const idx = queue.items.findIndex((i) => i.id === row.id);
    if (idx === -1) {
      ignored.push({ id: row.id, reason: "ไม่มีรายการนี้ในคิว" });
      continue;
    }
    if (queue.items[idx].status === "POSTED") {
      ignored.push({ id: row.id, reason: "โพสต์ไปแล้ว แก้ไม่ได้" });
      continue;
    }
    const patch = rowToQueuePatch(row);
    if (patch.status && !STATUSES.includes(patch.status)) {
      ignored.push({ id: row.id, reason: `status "${patch.status}" ไม่ถูกต้อง` });
      delete patch.status;
    }
    queue.items[idx] = { ...queue.items[idx], ...patch, updated_at: new Date().toISOString() };
    applied.push({ id: row.id, changed: Object.keys(patch) });
  }

  await saveQueue(queue);
  return { applied, ignored };
}
