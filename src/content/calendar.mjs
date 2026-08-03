// Posting calendar -- "ทุกวันเพจต้องมีการเคลื่อนไหว".
//
// A slot is a standing commitment: this weekday, this time, these platforms, this kind
// of content. Expanding slots over a date range produces the schedule; each expansion
// carries a stable slot_id (`YYYY-MM-DDTHH:MM`) which is what the queue uses to
// guarantee a slot is filled exactly once, even if the runner fires twice.
//
// All times are Asia/Bangkok. Thailand has no DST, so date arithmetic on plain
// YYYY-MM-DD strings is exact -- no UTC round-tripping, no off-by-one at midnight.
import { readJson, writeJson } from "./store.mjs";

export const SCHEDULE_FILE = "schedule.config.json";
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const EVERY_DAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * 2-3 posts a day. Two of them run seven days a week and the calendar never leaves
 * either empty:
 *   09:30  โพสต์ขายที่ดินลงกลุ่ม -- one plot a day, cycling through the whole sheet,
 *          and never the same plot twice inside 24 hours
 *   19:00  คลิปสั้นแนวตั้ง -- the daily clip, fanned out to all three short-video apps
 *
 * The midday knowledge carousel runs three days a week so the feed is not all sales.
 * That makes Mon/Wed/Fri three posts and the rest two.
 *
 * `source` decides where the queue planner looks for content:
 *   stock    -> rendered clips in output/ and photos in content/media/
 *   listing  -> the land sheet (content/listings.json)
 *   carousel -> knowledge topics rendered by Carousel Engine
 */
export const DEFAULT_SCHEDULE = {
  timezone: "Asia/Bangkok",
  slots: [
    {
      name: "เช้า · โพสต์ขายที่ดินลงกลุ่ม (ทุกวัน)",
      time: "09:30",
      days: EVERY_DAY,
      platforms: ["MANUAL_KIT"],
      content_type: "listing",
      source: "listing",
      required: true,
    },
    {
      name: "เที่ยง · คอนเทนต์ความรู้ (carousel)",
      time: "12:00",
      days: ["MON", "WED", "FRI"],
      platforms: ["FACEBOOK_PAGE"],
      content_type: "carousel",
      source: "carousel",
    },
    {
      name: "เย็น · คลิปสั้นแนวตั้ง (ทุกวัน)",
      time: "19:00",
      days: EVERY_DAY,
      platforms: ["FACEBOOK_REELS", "TIKTOK", "YOUTUBE_SHORTS"],
      content_type: "video",
      aspect: "9:16",
      source: "stock",
      required: true,
    },
  ],
};

export async function loadScheduleConfig() {
  return readJson(SCHEDULE_FILE, DEFAULT_SCHEDULE);
}

export async function saveScheduleConfig(config) {
  return writeJson(SCHEDULE_FILE, config);
}

/** YYYY-MM-DD for a Date, evaluated in the given timezone. */
export function localDateString(date, timeZone = "Asia/Bangkok") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** HH:MM for a Date, evaluated in the given timezone. */
export function localTimeString(date, timeZone = "Asia/Bangkok") {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function addDays(dateString, n) {
  const [y, m, d] = dateString.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function weekdayOf(dateString) {
  const [y, m, d] = dateString.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Expand slots across a date range.
 * @returns {Array<{ date: string, weekday: string, slots: Array }>}
 */
export function buildSchedule(config = DEFAULT_SCHEDULE, { from, days = 7 } = {}) {
  const tz = config.timezone || "Asia/Bangkok";
  const start = from || localDateString(new Date(), tz);
  const out = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const weekday = weekdayOf(date);
    const slots = (config.slots ?? [])
      // A slot with no `days` runs every day -- the common case, so it stays optional.
      .filter((s) => !s.days || s.days.includes(weekday))
      .map((s) => ({
        slot_id: `${date}T${s.time}`,
        date,
        time: s.time,
        weekday,
        name: s.name ?? s.time,
        platforms: [...s.platforms],
        content_type: s.content_type ?? "video",
        aspect: s.aspect ?? null,
        source: s.source ?? "stock",
        // A required slot going unfilled is reported loudly rather than skipped quietly:
        // the whole point of the schedule is that the clip goes out every day.
        required: Boolean(s.required),
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
    out.push({ date, weekday, slots });
  }
  return out;
}

/**
 * Slots still ahead of `now`, flattened and in chronological order.
 * Used by the daily runner to decide what is due.
 */
export function nextSlots(config = DEFAULT_SCHEDULE, { now = new Date(), days = 2 } = {}) {
  const tz = config.timezone || "Asia/Bangkok";
  const today = localDateString(now, tz);
  const nowTime = localTimeString(now, tz);
  return buildSchedule(config, { from: today, days })
    .flatMap((d) => d.slots)
    .filter((s) => s.date > today || (s.date === today && s.time >= nowTime));
}

/**
 * Slots whose time has arrived but which have not been handled yet.
 * `graceMinutes` keeps a slot claimable when cron fires a little late or the machine
 * was asleep -- without it, a laptop closed at 19:00 would silently skip the day.
 */
export function dueSlots(config = DEFAULT_SCHEDULE, { now = new Date(), graceMinutes = 180 } = {}) {
  const tz = config.timezone || "Asia/Bangkok";
  const today = localDateString(now, tz);
  const yesterday = addDays(today, -1);
  const nowMinutes = (() => {
    const [h, m] = localTimeString(now, tz).split(":").map(Number);
    return h * 60 + m;
  })();

  return buildSchedule(config, { from: yesterday, days: 2 })
    .flatMap((d) => d.slots)
    .filter((s) => {
      const [h, m] = s.time.split(":").map(Number);
      const slotMinutes = h * 60 + m + (s.date === today ? 0 : -1440);
      const age = nowMinutes - slotMinutes;
      return age >= 0 && age <= graceMinutes;
    });
}
