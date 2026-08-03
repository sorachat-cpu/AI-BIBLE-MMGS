// Publish Engine -- 14_PUBLISH_ENGINE.md
//
// Takes a finished render, writes one caption per destination, and fans the upload out
// to every destination at once. Fan-out is genuinely parallel because the platforms are
// independent services: TikTok being rate limited must not delay the Facebook post.
//
// Two deliberate departures from the spec, both recorded in 20_ROADMAP.md:
//   1. dry_run defaults to TRUE. Publishing is irreversible and public; the caller opts
//      in to going live rather than opting out.
//   2. ERR_PUB_02 (rate limit) does not sleep 30 minutes inside the process as §7
//      describes -- it returns retry_after_seconds and the scheduler requeues. A daily
//      runner that blocks for half an hour would hold the whole day's queue hostage.
import path from "node:path";
import { access, constants } from "node:fs/promises";
import { OUTPUT_DIR } from "../lib/ffmpeg.mjs";
import { validateAgainstSchema } from "../lib/validate.mjs";
import { getPlatform, isReady, missingCredentials, PLATFORM_IDS } from "../publish/platforms.mjs";
import {
  writeCaption,
  condenseCaption,
  enforceLimit,
  fallbackCaption,
  sanitizeCaption,
} from "../publish/captions.mjs";
import * as facebook from "../publish/adapters/facebook.mjs";
import * as tiktok from "../publish/adapters/tiktok.mjs";
import * as youtube from "../publish/adapters/youtube.mjs";
import * as line from "../publish/adapters/line.mjs";
import { buildKit } from "../publish/adapters/manual-kit.mjs";

export class PublishEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PublishEngineError";
    this.code = code;
  }
}

const RATE_LIMIT_BACKOFF_SECONDS = 30 * 60; // spec §7 ERR_PUB_02

/**
 * Accepts a bare filename, a path relative to output/ (carousel slides live in
 * output/carousels/<topic>/01.png), a /output/ URL, or an absolute path.
 * Relative paths are confined to output/ so a crafted "../../.env" cannot be published.
 */
export function resolveMediaPath(file) {
  if (!file) return null;
  let name = String(file);
  if (name.startsWith("/output/")) name = name.slice("/output/".length);
  if (path.isAbsolute(name)) return name;

  const resolved = path.resolve(OUTPUT_DIR, name);
  if (resolved !== OUTPUT_DIR && !resolved.startsWith(OUTPUT_DIR + path.sep)) {
    throw new PublishEngineError("ERR_PUB_INPUT", `เส้นทางไฟล์ออกนอกโฟลเดอร์ output: ${file}`);
  }
  return resolved;
}

async function assertExists(p, label) {
  try {
    await access(p, constants.R_OK);
  } catch {
    throw new PublishEngineError("ERR_PUB_INPUT", `${label} ไม่พบไฟล์: ${p}`);
  }
}

function publicUrlFor(filePath, env) {
  const base = env.PUBLIC_MEDIA_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${path.basename(filePath)}`;
}

/** One destination's upload. Throws with .code set to an ERR_PUB_* value. */
async function dispatch(platform, ctx) {
  const { caption, videoPath, imagePaths, dryRun, env, input, post } = ctx;

  switch (platform) {
    case "FACEBOOK_PAGE":
      return facebook.postToPage({
        pageId: env.FACEBOOK_PAGE_ID,
        token: env.FACEBOOK_PAGE_ACCESS_TOKEN,
        caption,
        videoPath,
        imagePaths,
        scheduleAt: input.schedule_at,
        dryRun,
      });

    case "FACEBOOK_REELS":
      if (!videoPath) throw new PublishEngineError("ERR_PUB_INPUT", "Facebook Reels ต้องมีไฟล์วิดีโอ");
      return facebook.postReel({
        pageId: env.FACEBOOK_PAGE_ID,
        token: env.FACEBOOK_PAGE_ACCESS_TOKEN,
        caption,
        videoPath,
        scheduleAt: input.schedule_at,
        dryRun,
      });

    case "INSTAGRAM_REELS": {
      if (!videoPath) throw new PublishEngineError("ERR_PUB_INPUT", "Instagram Reels ต้องมีไฟล์วิดีโอ");
      const videoUrl = publicUrlFor(videoPath, env);
      if (!videoUrl && !dryRun) {
        throw new PublishEngineError("ERR_PUB_03", "Instagram ต้องมี PUBLIC_MEDIA_BASE_URL (ดึงไฟล์จากลิงก์เท่านั้น)");
      }
      return facebook.postInstagramReel({
        igUserId: env.INSTAGRAM_BUSINESS_ID,
        token: env.FACEBOOK_PAGE_ACCESS_TOKEN,
        caption,
        videoUrl,
        dryRun,
      });
    }

    case "TIKTOK":
      if (!videoPath) throw new PublishEngineError("ERR_PUB_INPUT", "TikTok ต้องมีไฟล์วิดีโอ");
      return tiktok.postVideo({
        token: env.TIKTOK_ACCESS_TOKEN,
        caption,
        videoPath,
        privacyLevel: input.tiktok?.privacy_level ?? env.TIKTOK_PRIVACY_LEVEL ?? "SELF_ONLY",
        dryRun,
      });

    case "YOUTUBE_SHORTS":
      if (!videoPath) throw new PublishEngineError("ERR_PUB_INPUT", "YouTube Shorts ต้องมีไฟล์วิดีโอ");
      return youtube.postVideo({
        clientId: env.YOUTUBE_CLIENT_ID,
        clientSecret: env.YOUTUBE_CLIENT_SECRET,
        refreshToken: env.YOUTUBE_REFRESH_TOKEN,
        title: post.title || caption.split("\n")[0],
        description: caption,
        tags: (post.highlight_features ?? []).slice(0, 5),
        privacyStatus: input.youtube?.privacy_status ?? env.YOUTUBE_PRIVACY_STATUS ?? "private",
        videoPath,
        dryRun,
      });

    case "LINE_OA": {
      const videoUrl = videoPath ? publicUrlFor(videoPath, env) : null;
      const imageUrl = imagePaths?.[0] ? publicUrlFor(imagePaths[0], env) : null;
      return line.broadcast({
        token: env.LINE_CHANNEL_ACCESS_TOKEN,
        caption,
        videoUrl,
        imageUrl,
        dryRun,
      });
    }

    case "MANUAL_KIT": {
      // Always really runs, even in dry_run: writing files locally is not publishing,
      // and the kit is what the human needs in order to decide whether to publish.
      const kit = await buildKit({
        slug: input.kit_slug || `${input.property_id}-${new Date().toISOString().slice(0, 10)}`,
        caption,
        captionsByPlatform: ctx.allCaptions,
        videoPath,
        imagePaths,
        photoUrl: input.photo_url ?? null,
        post,
        targets: input.manual_targets ?? ["กลุ่ม Facebook", "Marketplace"],
      });
      return { post_id: null, publish_url: null, kit_dir: kit.kit_dir };
    }

    default:
      throw new PublishEngineError("ERR_PUB_INPUT", `ไม่รู้จักปลายทาง ${platform}`);
  }
}

/**
 * @param {object} input
 * @param {string} input.property_id           PROP-TH-##### or STOCK-*
 * @param {string} [input.video_file]          basename in output/, /output/ URL, or abs path
 * @param {string[]} [input.image_files]
 * @param {object} [input.post]                property details used to write captions
 * @param {string[]} [input.target_platforms]  defaults to every configured destination
 * @param {boolean} [input.dry_run=true]       false actually publishes
 * @param {Record<string,string>} [input.captions] per-platform caption overrides
 */
export async function runPublishEngine(input = {}, { env = process.env } = {}) {
  const {
    property_id,
    video_file,
    image_files = [],
    post = {},
    dry_run = true,
    captions: captionOverrides = {},
  } = input;

  if (!property_id) throw new PublishEngineError("ERR_PUB_INPUT", "ต้องระบุ property_id");

  const videoPath = resolveMediaPath(video_file);
  if (videoPath) await assertExists(videoPath, "วิดีโอ");
  const imagePaths = [];
  for (const f of image_files) {
    const p = resolveMediaPath(f);
    await assertExists(p, "รูป");
    imagePaths.push(p);
  }
  if (!videoPath && imagePaths.length === 0 && !post.text_only) {
    throw new PublishEngineError("ERR_PUB_INPUT", "ต้องมีวิดีโอหรือรูปอย่างน้อย 1 ไฟล์ (หรือตั้ง post.text_only)");
  }

  // Default target set: everything that has credentials, plus the offline kit, which
  // needs none. Explicit target_platforms bypasses this and is validated instead.
  let targets = input.target_platforms;
  if (!targets || targets.length === 0) {
    targets = PLATFORM_IDS.filter((p) => isReady(p, { env, needsMedia: Boolean(videoPath) }));
  }
  const unknown = targets.filter((t) => !PLATFORM_IDS.includes(t));
  if (unknown.length) throw new PublishEngineError("ERR_PUB_INPUT", `ปลายทางไม่รู้จัก: ${unknown.join(", ")}`);

  // --- captions -------------------------------------------------------------
  let costUsd = 0;
  const warnings = [];
  const captionByPlatform = {};
  const captionErrors = {};

  await Promise.all(
    targets.map(async (platform) => {
      if (captionOverrides[platform]) {
        captionByPlatform[platform] = captionOverrides[platform];
        return;
      }
      if (captionOverrides.ALL) {
        captionByPlatform[platform] = captionOverrides.ALL;
        return;
      }
      try {
        const result = await writeCaption(platform === "MANUAL_KIT" ? "FACEBOOK_PAGE" : platform, post, {
          apiKey: env.ANTHROPIC_API_KEY,
        });
        captionByPlatform[platform] = result.caption;
        costUsd += result.cost_usd;
        warnings.push(...result.warnings.map((w) => `${platform}: ${w}`));
      } catch (err) {
        captionErrors[platform] = { code: err.code || "ERR_PUB_05", message: err.message };
      }
    })
  );

  // Content gate, before the length gate: a caption stored on a queue item was written
  // once, possibly weeks ago, and never re-checked. Wrong-province hashtags and stray
  // foreign script both survive happily in stored text, and both are worse in public
  // than a shorter caption would have been.
  for (const [platform, text] of Object.entries(captionByPlatform)) {
    const { caption: cleaned, removed } = sanitizeCaption(text, post);
    if (!removed.length) continue;
    captionByPlatform[platform] = cleaned;
    warnings.push(`${platform}: ตัดออกจาก caption -- ${removed.join(" · ")}`);
  }

  // Hard cap re-check. writeCaption already enforces it, but an override caption comes
  // straight from a human or a spreadsheet and has been through nothing.
  //
  // One caption is stored per queue item and reused for every destination, so the
  // platform with the tightest cap overflows on almost every video slot. Refusing to
  // post is the wrong trade: the slot is lost over length alone, while the caption still
  // says everything it needs to in fewer words. Condense, and only give up when even
  // the rebuilt-from-listing-data version will not fit.
  for (const [platform, text] of Object.entries(captionByPlatform)) {
    const limit = getPlatform(platform).captionLimit;
    if ([...text].length <= limit) continue;

    const shortened =
      condenseCaption(text, limit) ?? enforceLimit(fallbackCaption(platform, post), limit);

    if (shortened) {
      captionByPlatform[platform] = shortened;
      warnings.push(
        `${platform}: ย่อ caption จาก ${[...text].length} เหลือ ${[...shortened].length} ตัวอักษร (เพดาน ${limit})`
      );
    } else {
      captionErrors[platform] = {
        code: "ERR_PUB_05",
        message: `caption ยาว ${[...text].length} ตัวอักษร ย่อให้ถึงเพดาน ${limit} ของ ${platform} ไม่ได้`,
      };
      delete captionByPlatform[platform];
    }
  }

  // --- dispatch -------------------------------------------------------------
  const ctx = { videoPath, imagePaths, dryRun: dry_run, env, input, post, allCaptions: captionByPlatform };

  const results = await Promise.all(
    targets.map(async (platform) => {
      const base = {
        platform,
        ok: false,
        post_id: null,
        publish_url: null,
        published_at: null,
        scheduled_for: null,
        caption_used: captionByPlatform[platform] ?? null,
        caption_chars: captionByPlatform[platform] ? [...captionByPlatform[platform]].length : null,
        dry_run: platform === "MANUAL_KIT" ? false : dry_run,
        attempts: 0,
        error_code: null,
        error_message: null,
        kit_dir: null,
      };

      if (captionErrors[platform]) {
        return { ...base, error_code: captionErrors[platform].code, error_message: captionErrors[platform].message };
      }

      const missing = missingCredentials(platform, { env, needsMedia: Boolean(videoPath) });
      if (missing.length && !(platform === "MANUAL_KIT")) {
        // Not an execution failure -- the destination simply is not set up yet.
        return {
          ...base,
          error_code: "ERR_PUB_03",
          error_message: `ยังไม่ได้ตั้งค่า: ขาด ${missing.join(", ")}`,
        };
      }

      // One retry, and only for an expired token (spec §7 ERR_PUB_01). Rate limits are
      // handed back for the scheduler to requeue; retrying them in-process makes it worse.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const out = await dispatch(platform, { ...ctx, caption: captionByPlatform[platform] });
          return {
            ...base,
            ok: true,
            attempts: attempt,
            post_id: out.post_id ?? null,
            publish_url: out.publish_url ?? null,
            // A scheduled post has not published yet -- do not claim it has.
            published_at: out.scheduled_for ? null : new Date().toISOString(),
            scheduled_for: out.scheduled_for ?? null,
            kit_dir: out.kit_dir ?? null,
            dry_run: Boolean(out.dry_run) || base.dry_run,
          };
        } catch (err) {
          const code = err.code || "ERR_PUB_04";
          const isLastAttempt = attempt === 2 || code !== "ERR_PUB_01";
          if (isLastAttempt) {
            return {
              ...base,
              attempts: attempt,
              error_code: code,
              error_message: err.message,
              ...(code === "ERR_PUB_02" ? { retry_after_seconds: RATE_LIMIT_BACKOFF_SECONDS } : {}),
            };
          }
        }
      }
      return base;
    })
  );

  // retry_after_seconds is useful to the scheduler but is not part of PUBLISH_OUT;
  // strip it before validation and hand it back alongside.
  const retryAfter = {};
  const destinations = results.map((r) => {
    const { retry_after_seconds, ...rest } = r;
    if (retry_after_seconds) retryAfter[r.platform] = retry_after_seconds;
    return rest;
  });

  const succeeded = destinations.filter((d) => d.ok);
  const attempted = destinations.filter((d) => d.error_code !== "ERR_PUB_03");
  let status;
  if (dry_run) status = "DRY_RUN";
  else if (succeeded.length === 0) status = "FAILED";
  else if (succeeded.length < attempted.length) status = "PARTIAL";
  else status = "SUCCESS";

  const output = {
    property_id,
    status,
    published_destinations: destinations,
    video_path: videoPath ? path.basename(videoPath) : null,
    generated_at: new Date().toISOString(),
    cost_usd: Number(costUsd.toFixed(4)),
  };

  const { valid, errors } = await validateAgainstSchema("publish.schema.json", output);
  if (!valid) {
    throw new PublishEngineError("ERR_PUB_SCHEMA", `PUBLISH_OUT ไม่ผ่าน schema: ${JSON.stringify(errors)}`);
  }

  return { ...output, warnings, retry_after: retryAfter };
}
