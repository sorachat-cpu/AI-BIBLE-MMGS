// Pull the page's own history back in.
//
// Purpose is not analytics -- it is supply. The page already has posts that worked; the
// fastest source of tomorrow's content is last quarter's best post, re-captioned. This
// archives what the page published, ranks it by engagement, and turns a chosen row back
// into a draft in the queue.
import { fetchPagePosts, fetchPostInsights } from "../publish/adapters/facebook.mjs";
import { readJson, writeJson } from "./store.mjs";
import { toCsv } from "./sheet.mjs";

const ARCHIVE_FILE = "page-posts.json";

export const ARCHIVE_COLUMNS = [
  "post_id",
  "created_time",
  "media_type",
  "impressions",
  "engaged_users",
  "video_views",
  "permalink_url",
  "message",
];

/**
 * Fetch and merge into the archive. Merge rather than replace so metrics captured for
 * old posts survive after those posts fall out of the API's recent window.
 */
export async function ingestPagePosts({
  limit = 50,
  withInsights = true,
  env = process.env,
} = {}) {
  const pageId = env.FACEBOOK_PAGE_ID;
  const token = env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) {
    const err = new Error("ต้องตั้ง FACEBOOK_PAGE_ID และ FACEBOOK_PAGE_ACCESS_TOKEN ก่อนจึงจะดึงโพสต์จากเพจได้");
    err.code = "ERR_PUB_03";
    throw err;
  }

  const posts = await fetchPagePosts({ pageId, token, limit });

  if (withInsights) {
    // Sequential on purpose: insights is one call per post and Meta rate-limits a page
    // token aggressively. 50 parallel calls is the reliable way to get throttled.
    for (const p of posts) {
      const metrics = await fetchPostInsights({ postId: p.post_id, token });
      p.impressions = metrics.post_impressions ?? null;
      p.engaged_users = metrics.post_engaged_users ?? null;
      p.video_views = metrics.post_video_views ?? null;
    }
  }

  const archive = await readJson(ARCHIVE_FILE, { posts: {}, fetched_at: null });
  for (const p of posts) {
    archive.posts[p.post_id] = { ...(archive.posts[p.post_id] ?? {}), ...p };
  }
  archive.fetched_at = new Date().toISOString();
  await writeJson(ARCHIVE_FILE, archive);

  return { fetched: posts.length, total_archived: Object.keys(archive.posts).length, posts };
}

export async function loadArchive() {
  const archive = await readJson(ARCHIVE_FILE, { posts: {}, fetched_at: null });
  return {
    fetched_at: archive.fetched_at,
    posts: Object.values(archive.posts).sort((a, b) => String(b.created_time).localeCompare(String(a.created_time))),
  };
}

/** Best performers first -- the shortlist worth reposting. */
export async function topPosts({ limit = 20, metric = "engaged_users" } = {}) {
  const { posts } = await loadArchive();
  return posts
    .filter((p) => p[metric] != null)
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
    .slice(0, limit);
}

export async function archiveToCsv() {
  const { posts } = await loadArchive();
  return toCsv(posts, { columns: ARCHIVE_COLUMNS, bom: true });
}
