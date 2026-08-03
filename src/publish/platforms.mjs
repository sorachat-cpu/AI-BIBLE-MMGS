// Single source of truth for what a destination is, what it costs you to break its
// rules, and whether this machine currently has the credentials to reach it.
//
// Readiness is computed from env only -- no network call -- so the console can render
// a truthful "what works right now" panel instantly and the scheduler can skip
// unconfigured destinations without burning a retry budget on them.

export const PLATFORMS = {
  FACEBOOK_PAGE: {
    // Auto: the Graph API will post this unattended.
    mode: "auto",
    label: "Facebook Page (โพสต์ลงหน้าเพจ)",
    kind: "feed",
    captionLimit: 63206,
    accepts: ["video", "image", "text"],
    envRequired: ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"],
    docs: "Graph API /{page-id}/videos and /{page-id}/photos",
  },
  FACEBOOK_REELS: {
    mode: "auto",
    label: "Facebook Reels (คลิปสั้นแนวตั้ง)",
    kind: "reel",
    captionLimit: 2200,
    accepts: ["video"],
    aspect: "9:16",
    maxDurationSeconds: 90,
    envRequired: ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"],
    docs: "Graph API /{page-id}/video_reels, 3-phase resumable upload",
  },
  INSTAGRAM_REELS: {
    mode: "auto",
    label: "Instagram Reels",
    kind: "reel",
    captionLimit: 2200,
    accepts: ["video"],
    aspect: "9:16",
    maxDurationSeconds: 90,
    // IG Content Publishing has no binary upload path -- it only accepts a public
    // video_url that Meta's servers fetch. Hence the extra base-URL requirement.
    envRequired: ["INSTAGRAM_BUSINESS_ID", "FACEBOOK_PAGE_ACCESS_TOKEN", "PUBLIC_MEDIA_BASE_URL"],
    docs: "Graph API /{ig-user-id}/media then /media_publish",
  },
  TIKTOK: {
    mode: "auto",
    label: "TikTok",
    kind: "reel",
    captionLimit: 2200,
    accepts: ["video"],
    aspect: "9:16",
    maxDurationSeconds: 600,
    envRequired: ["TIKTOK_ACCESS_TOKEN"],
    docs: "Content Posting API /v2/post/publish/video/init/ with FILE_UPLOAD",
  },
  YOUTUBE_SHORTS: {
    mode: "auto",
    label: "YouTube Shorts",
    kind: "reel",
    captionLimit: 100, // description cap the spec pins; title is capped separately
    titleLimit: 100,
    accepts: ["video"],
    aspect: "9:16",
    maxDurationSeconds: 180,
    envRequired: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"],
    docs: "Data API v3 videos.insert, resumable upload",
  },
  LINE_OA: {
    mode: "auto",
    label: "LINE OA (broadcast หาผู้ติดตาม)",
    kind: "message",
    captionLimit: 5000,
    accepts: ["video", "image", "text"],
    // LINE will not accept binary either; it fetches originalContentUrl over https.
    envRequired: ["LINE_CHANNEL_ACCESS_TOKEN"],
    envRequiredForMedia: ["PUBLIC_MEDIA_BASE_URL"],
    docs: "Messaging API /v2/bot/message/broadcast",
  },
  MANUAL_KIT: {
    // Manual by necessity, not by preference: Meta removed Groups publishing from the
    // Graph API in 2020, so no token can post to a group. This destination writes a
    // ready-to-paste kit and stops; a human picks the group and presses post.
    mode: "manual",
    label: "ชุดโพสต์เอง (กลุ่ม Facebook / Marketplace)",
    kind: "offline",
    captionLimit: 63206,
    accepts: ["video", "image", "text"],
    envRequired: [], // always available -- it writes files, it does not call anything
    docs: "Meta removed Groups publishing from the Graph API in 2020; there is no API path.",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

/**
 * Destinations split by who presses the button.
 *
 * `auto` destinations have a publishing API and run unattended on the schedule.
 * `manual` ones do not, and never will by wishing -- the kit is prepared and a human
 * finishes the job. Keeping the split in the registry rather than in the UI means the
 * scheduler and the console can never disagree about which is which.
 */
export const AUTO_PLATFORMS = PLATFORM_IDS.filter((id) => PLATFORMS[id].mode === "auto");
export const MANUAL_PLATFORMS = PLATFORM_IDS.filter((id) => PLATFORMS[id].mode === "manual");

export function platformMode(id) {
  return getPlatform(id).mode;
}

/** The mode a whole queue item belongs to: manual if any destination needs a human. */
export function itemMode(platforms = []) {
  return platforms.some((p) => PLATFORMS[p]?.mode === "manual") ? "manual" : "auto";
}

export function getPlatform(id) {
  const p = PLATFORMS[id];
  if (!p) throw new Error(`Unknown platform "${id}" -- allowed: ${PLATFORM_IDS.join(", ")}`);
  return p;
}

/**
 * Which env vars a destination still needs. Empty array means ready to post.
 * `needsMedia` adds the media-hosting requirement for destinations that can only
 * fetch by URL (LINE), so a text-only broadcast is not blocked by a missing CDN.
 */
export function missingCredentials(platformId, { needsMedia = true, env = process.env } = {}) {
  const p = getPlatform(platformId);
  const required = [...p.envRequired, ...(needsMedia ? (p.envRequiredForMedia ?? []) : [])];
  return required.filter((key) => !env[key] || String(env[key]).trim() === "");
}

export function isReady(platformId, opts) {
  return missingCredentials(platformId, opts).length === 0;
}

/** Readiness of every destination, for the console panel and `readiness` CLI. */
export function publishReadiness(env = process.env) {
  return PLATFORM_IDS.map((id) => {
    const missing = missingCredentials(id, { env });
    return {
      platform: id,
      label: PLATFORMS[id].label,
      mode: PLATFORMS[id].mode,
      ready: missing.length === 0,
      missing_env: missing,
      caption_limit: PLATFORMS[id].captionLimit,
      accepts: PLATFORMS[id].accepts,
      note: PLATFORMS[id].docs,
    };
  });
}
