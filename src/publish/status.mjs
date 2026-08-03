// System status and pre-flight check.
//
// Answers one question the rest of the console does not: "is this safe to let run right
// now, and if not, what exactly do I fix first?" Everything here is read-only and makes
// at most one network call (the Facebook token probe), so it is cheap enough to hit on
// every page load and honest enough to trust before a 2am cron fires.
//
// Every finding is a `check` with the same shape, and checks are gathered from a list of
// independent producers. Adding a new engine to the folder later means appending one
// producer function -- no changes to the route, the page, or the summary logic.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { loadQueue, loadProfile } from "../content/queue.mjs";
import { loadScheduleConfig, buildSchedule, dueSlots } from "../content/calendar.mjs";
import { scanStock, stockSummary } from "../content/stock.mjs";
import { publishReadiness, getPlatform, itemMode, MANUAL_PLATFORMS } from "./platforms.mjs";
import { sanitizeCaption } from "./captions.mjs";
import { resolveMediaPath } from "../engines/publish-engine.mjs";

/** ok = nothing to do · warn = will still run, but degraded · fail = will not post. */
export const LEVELS = ["ok", "warn", "fail"];

const check = (level, id, title, detail, fix = null) => ({ level, id, title, detail, fix });

/**
 * Is the Facebook token real, the right type, and not about to die?
 *
 * This is the only networked check. It is worth the round trip: a token that expired
 * overnight is invisible in every local file, and it is the single failure that silently
 * stops the page from posting at all.
 */
async function checkFacebookToken(env) {
  const { FACEBOOK_PAGE_ID: pageId, FACEBOOK_PAGE_ACCESS_TOKEN: token } = env;
  const { FACEBOOK_APP_ID: appId, FACEBOOK_APP_SECRET: appSecret } = env;

  if (!pageId || !token) {
    return [
      check("fail", "fb_token", "Facebook ยังไม่ได้ต่อ", "ไม่มี FACEBOOK_PAGE_ID หรือ FACEBOOK_PAGE_ACCESS_TOKEN ใน .env",
        "npm run publish -- fb:setup"),
    ];
  }

  const G = "https://graph.facebook.com/v21.0";
  const get = async (p, params) => {
    const u = new URL(G + p);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await fetch(u);
    return r.json();
  };

  try {
    // `/me` on a Page token returns the page; on a User token it returns the person.
    // Comparing it to FACEBOOK_PAGE_ID is the cheapest way to catch the wrong token type,
    // which otherwise reads fine and only fails on the first write.
    const me = await get("/me", { access_token: token, fields: "id,name,fan_count" });
    if (me.error) {
      return [check("fail", "fb_token", "Facebook token ใช้ไม่ได้", me.error.message,
        "npm run publish -- fb:setup --user-token <TOKEN>")];
    }
    if (me.id !== pageId) {
      return [check("fail", "fb_token", "token ไม่ตรงกับเพจ",
        `token เป็นของ "${me.name}" (${me.id}) แต่ FACEBOOK_PAGE_ID คือ ${pageId} — ถ้าเป็นชื่อคนแปลว่าใส่ User Token ผิดช่อง`,
        "npm run publish -- fb:setup --user-token <TOKEN>")];
    }

    const out = [];
    let expiresAt = null;
    if (appId && appSecret) {
      const dbg = await get("/debug_token", { input_token: token, access_token: `${appId}|${appSecret}` });
      const d = dbg.data ?? {};
      expiresAt = d.expires_at ? new Date(d.expires_at * 1000) : null;
      const days = expiresAt ? Math.round((expiresAt - Date.now()) / 86400000) : null;

      if (!expiresAt) {
        out.push(check("ok", "fb_token", "Facebook token ถาวร", `${me.name} · ผู้ติดตาม ${me.fan_count ?? "-"} · ไม่มีวันหมดอายุ`));
      } else if (days <= 7) {
        out.push(check("fail", "fb_token", "Facebook token ใกล้หมดอายุ",
          `เหลืออีก ${days} วัน (${expiresAt.toISOString().slice(0, 10)}) — cron จะหยุดโพสต์เงียบๆ`,
          "npm run publish -- fb:setup --user-token <TOKEN ใหม่>"));
      } else {
        out.push(check("warn", "fb_token", "Facebook token ยังไม่ถาวร",
          `เหลืออีก ${days} วัน — ขอใหม่พร้อม App Secret จะได้แบบไม่หมดอายุ`,
          "npm run publish -- fb:setup --user-token <TOKEN ใหม่>"));
      }

      const need = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];
      const missing = need.filter((s) => !(d.scopes ?? []).includes(s));
      if (missing.length) {
        out.push(check("fail", "fb_scopes", "สิทธิ์ไม่ครบ", `ขาด ${missing.join(", ")}`,
          "ขอ token ใหม่พร้อมติ๊กสิทธิ์ให้ครบ"));
      }
    } else {
      out.push(check("warn", "fb_token", "Facebook ต่ออยู่ แต่ตรวจอายุไม่ได้",
        `${me.name} · ไม่มี FACEBOOK_APP_SECRET จึงดูวันหมดอายุไม่ได้`,
        "ใส่ FACEBOOK_APP_SECRET ใน .env"));
    }
    return out;
  } catch (err) {
    return [check("warn", "fb_token", "ตรวจ Facebook ไม่ได้", `ต่อเน็ตไม่ได้หรือ Graph ล่ม: ${err.message}`)];
  }
}

/** Destinations, split the way the console splits them. */
function checkDestinations(env) {
  const rows = publishReadiness(env);
  const auto = rows.filter((r) => r.mode === "auto");
  const ready = auto.filter((r) => r.ready);
  const notReady = auto.filter((r) => !r.ready);

  const out = [
    check(
      ready.length ? "ok" : "fail",
      "destinations",
      `ปลายทางอัตโนมัติพร้อม ${ready.length}/${auto.length} ช่อง`,
      ready.length ? ready.map((r) => r.platform).join(" · ") : "ยังไม่มีช่องไหนโพสต์เองได้เลย"
    ),
  ];
  for (const r of notReady) {
    out.push(check("warn", `dest_${r.platform}`, `${r.platform} ยังไม่ได้ตั้งค่า`, `ขาด ${r.missing_env.join(", ")}`));
  }
  return out;
}

/**
 * Enough material to keep posting, and for how long.
 *
 * Only the video stock is judged. Carousel slides are rendered on demand from topics
 * rather than drawn from the media library, so an empty image stock is the normal state
 * here and flagging it would train everyone to ignore this panel.
 */
function checkStock(summary) {
  const { videos = 0, vertical_videos: vertical = 0, days_of_video_runway: days = 0 } = summary ?? {};
  const out = [];

  if (videos === 0) {
    out.push(check("fail", "stock_video", "คลังคลิปว่าง", "ช่องคลิปทั้งหมดจะถูกข้าม",
      "ใส่ไฟล์ใน content/media แล้วรัน npm run publish -- stock"));
  } else if (days < 7) {
    out.push(check("warn", "stock_video", "คลังคลิปเหลือน้อย", `${videos} คลิป · หมุนได้อีกประมาณ ${days} วันก่อนเริ่มซ้ำ`,
      "เพิ่มคลิปใหม่เข้า content/media"));
  } else {
    out.push(check("ok", "stock_video", "คลังคลิปเพียงพอ", `${videos} คลิป · หมุนได้ประมาณ ${days} วันก่อนเริ่มซ้ำ`));
  }

  // A landscape clip in a 9:16 slot gets letterboxed, which looks worse than not posting.
  if (videos > 0 && vertical < videos) {
    out.push(check("warn", "stock_aspect", "มีคลิปที่ไม่ใช่แนวตั้ง",
      `แนวตั้ง ${vertical}/${videos} คลิป — ตัวที่เหลือไม่เหมาะกับ Reels/Shorts`));
  }
  return out;
}

/**
 * The queue itself: media that no longer exists, and captions that would embarrass the
 * page. Both are checked against the *stored* item, because that is what will actually
 * be posted -- regenerating first would hide exactly the drift being looked for.
 */
async function checkQueue(queue) {
  const pending = queue.items.filter((i) => ["DRAFT", "READY", "SCHEDULED"].includes(i.status));
  const out = [];

  const missingMedia = [];
  for (const it of pending) {
    const files = [it.video_file, ...(it.image_files ?? [])].filter(Boolean);
    for (const f of files) {
      const p = resolveMediaPath(f);
      try {
        await access(p, constants.R_OK);
      } catch {
        missingMedia.push(`${it.id} → ${f}`);
      }
    }
  }
  out.push(
    missingMedia.length
      ? check("fail", "queue_media", `ไฟล์สื่อหาย ${missingMedia.length} ไฟล์`, missingMedia.slice(0, 6).join(" · "),
          "เรนเดอร์ใหม่ หรือลบรายการนั้นออกจากคิว")
      : check("ok", "queue_media", "ไฟล์สื่อครบทุกรายการ", `ตรวจ ${pending.length} รายการที่รอโพสต์`)
  );

  const dirty = [];
  const tooLong = [];
  for (const it of pending) {
    if (!it.caption) continue;
    const { removed } = sanitizeCaption(it.caption, it.post ?? {});
    if (removed.length) dirty.push(`${it.id}: ${removed.join(", ")}`);
    for (const p of it.platforms ?? []) {
      const limit = getPlatform(p).captionLimit;
      if ([...it.caption].length > limit) tooLong.push(`${it.id} → ${p}`);
    }
  }
  out.push(
    dirty.length
      ? check("warn", "queue_captions", `แคปชั่นมีปัญหา ${dirty.length} รายการ`, dirty.slice(0, 4).join(" | "),
          "ระบบจะตัดให้เองตอนโพสต์ แต่ควรแก้ต้นทางด้วย")
      : check("ok", "queue_captions", "แคปชั่นสะอาดทุกรายการ", "ไม่มี hashtag ผิดจังหวัด อักษรแปลกปลอม หรือเคลมราคาลอยๆ")
  );
  if (tooLong.length) {
    out.push(check("ok", "queue_caption_len", `แคปชั่นยาวเกินเพดาน ${tooLong.length} จุด`,
      `${tooLong.slice(0, 4).join(" · ")} — ระบบย่อให้อัตโนมัติ ไม่ทำให้คิวหลุด`));
  }

  const failed = queue.items.filter((i) => (i.results ?? []).some((r) => r.error_code && r.error_code !== "ERR_PUB_03"));
  if (failed.length) {
    const last = failed[failed.length - 1];
    const err = (last.results ?? []).find((r) => r.error_code && r.error_code !== "ERR_PUB_03");
    out.push(check("warn", "recent_failures", `เคยโพสต์ไม่สำเร็จ ${failed.length} รายการ`,
      `ล่าสุด ${last.id}: ${err?.error_message ?? err?.error_code}`));
  }
  return out;
}

/** Slots in the near future with nothing in them yet. */
function checkCoverage(config, queue, days) {
  const byId = new Set(queue.items.map((i) => i.id));
  const slots = buildSchedule(config, { days }).flatMap((d) => d.slots);
  const empty = slots.filter((s) => !byId.has(s.slot_id));
  const auto = slots.filter((s) => itemMode(s.platforms) === "auto").length;
  const manual = slots.length - auto;

  return [
    empty.length
      ? check("warn", "coverage", `ยังไม่มีคอนเทนต์ ${empty.length}/${slots.length} ช่อง ใน ${days} วัน`,
          empty.slice(0, 5).map((s) => s.slot_id).join(" · "), "npm run publish -- plan")
      : check("ok", "coverage", `คิวเต็มครบ ${slots.length} ช่อง ใน ${days} วัน`, `หน้าเพจ ${auto} ช่อง · กลุ่ม ${manual} ช่อง`),
  ];
}

/**
 * Full status report.
 *
 * @param {object} [opts]
 * @param {object} [opts.env]   defaults to process.env
 * @param {number} [opts.days]  how far ahead coverage is judged
 * @param {boolean} [opts.probeNetwork] set false for an offline/instant report
 */
export async function systemStatus({ env = process.env, days = 7, probeNetwork = true } = {}) {
  const [config, profile, queue, stock] = await Promise.all([
    loadScheduleConfig(),
    loadProfile(),
    loadQueue(),
    scanStock(),
  ]);
  const summary = stockSummary(stock, config);

  const checks = [
    ...(probeNetwork ? await checkFacebookToken(env) : []),
    ...checkDestinations(env),
    ...checkStock(summary),
    ...(await checkQueue(queue)),
    ...checkCoverage(config, queue, days),
  ];

  // auto_publish is a state, not a fault: reported so nobody has to guess whether the
  // cron will actually post tonight, but never counted as a failure.
  checks.push(
    profile.auto_publish
      ? check("ok", "auto_publish", "โหมดโพสต์อัตโนมัติ: เปิด", "npm run daily จะโพสต์เองเมื่อถึงเวลา")
      : check("warn", "auto_publish", "โหมดโพสต์อัตโนมัติ: ปิด", "ระบบเตรียมของไว้ แต่จะไม่โพสต์จนกว่าจะกดเอง",
          "แก้ auto_publish ใน content/page.profile.json")
  );

  const counts = { ok: 0, warn: 0, fail: 0 };
  for (const c of checks) counts[c.level]++;

  const due = dueSlots(config).map((s) => s.slot_id);
  const posted = queue.items.filter((i) => i.status === "POSTED").length;

  return {
    generated_at: new Date().toISOString(),
    // Green only when nothing is broken; a single fail is enough to say do not run.
    verdict: counts.fail ? "fail" : counts.warn ? "warn" : "ok",
    counts,
    checks,
    facts: {
      page_name: profile.page_name ?? null,
      auto_publish: Boolean(profile.auto_publish),
      queue_total: queue.items.length,
      queue_posted: posted,
      queue_pending: queue.items.filter((i) => ["DRAFT", "READY", "SCHEDULED"].includes(i.status)).length,
      due_now: due,
      stock_summary: summary,
      destinations: publishReadiness(env),
      manual_platforms: MANUAL_PLATFORMS,
    },
  };
}
