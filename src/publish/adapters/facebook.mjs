// Meta Graph API adapter -- Facebook Page feed, Facebook Reels, Instagram Reels.
//
// Uploads send file bytes directly (openAsBlob / rupload) rather than handing Meta a
// URL, because the rendered clips live on this machine and there is no public CDN in
// front of them. Instagram is the exception: its Content Publishing API has no binary
// path at all, it only fetches a public video_url, so IG stays gated on
// PUBLIC_MEDIA_BASE_URL while Facebook does not.
import { openAsBlob } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";

const GRAPH_VERSION = "v21.0";
// Everything goes through the normal graph host. The old graph-video.facebook.com is
// retired -- video posts use /{page-id}/videos on graph.facebook.com like any other
// post, and Reels use the separate rupload host below for the binary phase only.
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;

// Posting any content to a Page -- text, photo, video, link -- needs exactly these.
// There is no video-specific permission any more: publish_video and publish_actions are
// both gone, folded into pages_manage_posts. Nothing here should ask for them.
export const REQUIRED_PAGE_PERMISSIONS = ["pages_manage_posts", "pages_read_engagement", "pages_show_list"];

/** Map a Graph error body onto the ERR_PUB_* codes in 14_PUBLISH_ENGINE.md §7. */
function graphError(status, body) {
  const e = body?.error ?? {};
  const code = e.code;
  let errCode = "ERR_PUB_04";
  if (code === 190 || status === 401) errCode = "ERR_PUB_01"; // token expired/invalid
  else if (status === 429 || [4, 17, 32, 613].includes(code)) errCode = "ERR_PUB_02"; // rate limited
  const err = new Error(`Facebook ${errCode}: ${e.message || `HTTP ${status}`}`);
  err.code = errCode;
  err.subcode = e.error_subcode ?? null;
  return err;
}

async function graph(pathname, { method = "GET", token, params = {}, body, headers } = {}) {
  const url = new URL(`${GRAPH}${pathname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  // Token goes in the header, never the query string -- query strings end up in logs.
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(headers ?? {}) },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw graphError(res.status, json);
  return json;
}

/**
 * Confirms the token works and reports which page it belongs to. Never logs the token.
 *
 * Reading the page is not enough on its own. A *user* token with pages_read_engagement
 * can read the page perfectly well and only fails later, at 2am, on the first write --
 * so this also asks the token who it is. `/me` answers with the page for a Page token
 * and with the person for a User token, which is the cheapest way to tell them apart.
 */
export async function verifyPageToken({ pageId, token }) {
  const data = await graph(`/${pageId}`, { token, params: { fields: "id,name,fan_count,link" } });

  const me = await graph("/me", { token, params: { fields: "id,name" } });
  if (me.id !== data.id) {
    throw new Error(
      `FACEBOOK_PAGE_ACCESS_TOKEN ไม่ใช่ Page Token ของเพจนี้\n` +
        `   token เป็นของ "${me.name}" (${me.id}) แต่ FACEBOOK_PAGE_ID คือ ${data.id}\n` +
        `   ถ้าชื่อข้างบนเป็นชื่อคน แปลว่าเอา User Token มาใส่ผิดช่อง -- อ่านได้แต่โพสต์ไม่ได้\n` +
        `   แก้: npm run publish -- fb:setup --user-token <USER_TOKEN>`
    );
  }

  return { page_id: data.id, page_name: data.name, followers: data.fan_count ?? null, url: data.link ?? null };
}

// Meta requires a scheduled time between 10 minutes and 6 months out. Anything closer is
// rejected, so the caller is told the real limit rather than getting a Graph error.
const MIN_SCHEDULE_LEAD_MS = 10 * 60_000;
const MAX_SCHEDULE_LEAD_MS = 180 * 24 * 3600_000;

/**
 * Turn an ISO time into the unix seconds Graph wants, validating Meta's window.
 * @returns {number|null} null when nothing was scheduled
 */
export function toScheduledUnix(scheduleAt) {
  if (!scheduleAt) return null;
  const when = new Date(scheduleAt);
  if (Number.isNaN(when.getTime())) {
    const err = new Error(`Facebook ERR_PUB_04: เวลาตั้งโพสต์ไม่ถูกต้อง (${scheduleAt})`);
    err.code = "ERR_PUB_04";
    throw err;
  }
  const lead = when.getTime() - Date.now();
  if (lead < MIN_SCHEDULE_LEAD_MS || lead > MAX_SCHEDULE_LEAD_MS) {
    const err = new Error(
      `Facebook ERR_PUB_04: Facebook รับตั้งเวลาได้ตั้งแต่ 10 นาที ถึง 6 เดือนล่วงหน้าเท่านั้น (ขอไว้ ${Math.round(lead / 60_000)} นาที)`
    );
    err.code = "ERR_PUB_04";
    throw err;
  }
  return Math.floor(when.getTime() / 1000);
}

/**
 * Page feed post: video, photo, or plain text depending on what is supplied.
 *
 * `scheduleAt` turns this into a scheduled post instead of a live one. That is the
 * closest thing Meta offers to a draft the page owner can review: it lands in Meta
 * Business Suite → Planner, where it can be edited, published early, or deleted before
 * its time. There is no organic "draft" endpoint on the Graph API at all -- `published:
 * false` creates an ads-only dark post, which never appears in Business Suite.
 */
export async function postToPage({
  pageId,
  token,
  caption,
  videoPath,
  imagePaths = [],
  linkUrl,
  scheduleAt,
  dryRun,
}) {
  const scheduled = toScheduledUnix(scheduleAt);
  if (dryRun) {
    return { post_id: null, publish_url: null, dry_run: true, scheduled_for: scheduleAt ?? null };
  }

  // Applied to whichever endpoint ends up carrying the post.
  const applySchedule = (form) => {
    if (scheduled) {
      form.set("published", "false");
      form.set("scheduled_publish_time", String(scheduled));
    }
    return form;
  };
  /**
   * Ask Graph for the real permalink instead of building one from the id.
   *
   * `facebook.com/{pageid}_{postid}` looks like a URL and is not one: it answers 301 and
   * drops the visitor, while an admin already signed in gets silently redirected to the
   * right place. That combination is why a broken link reads as "only the owner can see
   * the post". The permalink Graph returns uses the page's new-format id and answers 200
   * for everyone.
   */
  const result = async (id) => {
    let url = null;
    if (id) {
      url = await graph(`/${id}`, { token, params: { fields: "permalink_url" } })
        .then((d) => d.permalink_url ?? null)
        .catch(() => null);
    }
    return { post_id: id, publish_url: url, scheduled_for: scheduleAt ?? null };
  };

  if (videoPath) {
    const form = new FormData();
    form.set("description", caption);
    form.set("source", await openAsBlob(videoPath), path.basename(videoPath));
    const data = await graph(`/${pageId}/videos`, { method: "POST", token, body: applySchedule(form) });
    return await result(data.id);
  }

  if (imagePaths.length === 1) {
    const form = new FormData();
    form.set("caption", caption);
    form.set("source", await openAsBlob(imagePaths[0]), path.basename(imagePaths[0]));
    const data = await graph(`/${pageId}/photos`, { method: "POST", token, body: applySchedule(form) });
    return await result(data.post_id ?? data.id);
  }

  if (imagePaths.length > 1) {
    // Multi-photo (carousel) post: upload each unpublished, then attach the media_fbids
    // to one feed post. The per-photo `published:false` here is the upload mechanism,
    // unrelated to scheduling -- the schedule goes on the feed post itself.
    const fbids = [];
    for (const p of imagePaths) {
      const form = new FormData();
      form.set("published", "false");
      form.set("source", await openAsBlob(p), path.basename(p));
      const up = await graph(`/${pageId}/photos`, { method: "POST", token, body: form });
      fbids.push(up.id);
    }
    const form = new FormData();
    form.set("message", caption);
    fbids.forEach((id, i) => form.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
    const data = await graph(`/${pageId}/feed`, { method: "POST", token, body: applySchedule(form) });
    return await result(data.id);
  }

  const form = new FormData();
  form.set("message", caption);
  if (linkUrl) form.set("link", linkUrl);
  const data = await graph(`/${pageId}/feed`, { method: "POST", token, body: applySchedule(form) });
  return await result(data.id);
}

/** Scheduled posts waiting in the Planner -- what the page owner still has to review. */
export async function fetchScheduledPosts({ pageId, token }) {
  const data = await graph(`/${pageId}/scheduled_posts`, {
    token,
    params: { fields: "id,message,scheduled_publish_time,created_time" },
  });
  return (data.data ?? []).map((p) => ({
    post_id: p.id,
    message: p.message ?? "",
    scheduled_for: p.scheduled_publish_time
      ? new Date(p.scheduled_publish_time * 1000).toISOString()
      : null,
  }));
}

/** Facebook Reels: 3-phase resumable upload (start -> rupload binary -> finish). */
export async function postReel({ pageId, token, caption, videoPath, scheduleAt, dryRun }) {
  const scheduled = toScheduledUnix(scheduleAt);
  if (dryRun) return { post_id: null, publish_url: null, dry_run: true, scheduled_for: scheduleAt ?? null };

  const start = await graph(`/${pageId}/video_reels`, {
    method: "POST",
    token,
    params: { upload_phase: "start" },
  });
  const videoId = start.video_id;

  const info = await stat(videoPath);
  const bytes = await readFile(videoPath);
  const uploadRes = await fetch(`${RUPLOAD}/${videoId}`, {
    method: "POST",
    headers: {
      // rupload uses the OAuth scheme, not Bearer -- Bearer is rejected here.
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(info.size),
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw graphError(uploadRes.status, { error: { message: `reel upload failed: ${body.slice(0, 200)}` } });
  }

  const finish = await graph(`/${pageId}/video_reels`, {
    method: "POST",
    token,
    params: {
      upload_phase: "finish",
      video_id: videoId,
      // SCHEDULED holds the reel in the Planner until its time; PUBLISHED goes live now.
      video_state: scheduled ? "SCHEDULED" : "PUBLISHED",
      ...(scheduled ? { scheduled_publish_time: scheduled } : {}),
      description: caption,
    },
  });
  if (finish.success === false) throw graphError(400, { error: { message: "reel finish phase rejected" } });

  return {
    post_id: videoId,
    publish_url: `https://www.facebook.com/reel/${videoId}`,
    scheduled_for: scheduleAt ?? null,
  };
}

/**
 * Instagram Reels: create a media container from a public URL, poll until Meta has
 * finished fetching it, then publish. Requires PUBLIC_MEDIA_BASE_URL.
 */
export async function postInstagramReel({ igUserId, token, caption, videoUrl, coverUrl, dryRun }) {
  if (dryRun) return { post_id: null, publish_url: null, dry_run: true };

  const container = await graph(`/${igUserId}/media`, {
    method: "POST",
    token,
    params: { media_type: "REELS", video_url: videoUrl, caption, cover_url: coverUrl },
  });

  // Meta downloads the file asynchronously; publishing before it finishes returns an error.
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    const st = await graph(`/${container.id}`, { token, params: { fields: "status_code,status" } });
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") {
      throw graphError(400, { error: { message: `IG container ${st.status_code}: ${st.status ?? ""}` } });
    }
    if (Date.now() > deadline) {
      throw graphError(408, { error: { message: "IG container did not finish processing within 5 minutes" } });
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const published = await graph(`/${igUserId}/media_publish`, {
    method: "POST",
    token,
    params: { creation_id: container.id },
  });
  return { post_id: published.id, publish_url: `https://www.instagram.com/reel/${published.id}` };
}

/** Read back the page's own posts -- the source for the "pull page data into a sheet" flow. */
export async function fetchPagePosts({ pageId, token, limit = 50 }) {
  const data = await graph(`/${pageId}/posts`, {
    token,
    params: {
      limit,
      fields:
        "id,created_time,message,permalink_url,status_type,full_picture,attachments{media_type,url,title,description}",
    },
  });
  return (data.data ?? []).map((p) => ({
    post_id: p.id,
    created_time: p.created_time,
    message: p.message ?? "",
    permalink_url: p.permalink_url ?? null,
    status_type: p.status_type ?? null,
    picture: p.full_picture ?? null,
    media_type: p.attachments?.data?.[0]?.media_type ?? null,
  }));
}

/** Post-level metrics for the Analytics Engine and for ranking what to repost. */
export async function fetchPostInsights({ postId, token }) {
  try {
    const data = await graph(`/${postId}/insights`, {
      token,
      params: { metric: "post_impressions,post_engaged_users,post_video_views" },
    });
    return Object.fromEntries((data.data ?? []).map((m) => [m.name, m.values?.[0]?.value ?? 0]));
  } catch {
    // Insights need extra permissions and are missing on very new posts. Not fatal.
    return {};
  }
}
