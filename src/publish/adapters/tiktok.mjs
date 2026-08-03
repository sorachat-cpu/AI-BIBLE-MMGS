// TikTok Content Posting API adapter.
//
// Uses FILE_UPLOAD rather than PULL_FROM_URL: PULL_FROM_URL requires a domain verified
// in the TikTok developer console, which local renders do not have.
//
// Note for whoever wires the credentials: until the app passes TikTok's content review,
// every post it creates is forced to SELF_ONLY (private) regardless of what is
// requested here. That is a TikTok account state, not a bug in this adapter.
import { stat, open } from "node:fs/promises";

const API = "https://open.tiktokapis.com/v2";
const CHUNK_SIZE = 10 * 1024 * 1024; // TikTok's documented minimum chunk is 5MB

function tiktokError(status, body) {
  const e = body?.error ?? {};
  const code = String(e.code ?? "");
  let errCode = "ERR_PUB_04";
  if (status === 401 || code === "access_token_invalid" || code === "scope_not_authorized") errCode = "ERR_PUB_01";
  else if (status === 429 || code === "rate_limit_exceeded" || code === "spam_risk_too_many_posts") errCode = "ERR_PUB_02";
  const err = new Error(`TikTok ${errCode}: ${e.message || code || `HTTP ${status}`}`);
  err.code = errCode;
  return err;
}

async function call(pathname, { token, body }) {
  const res = await fetch(`${API}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  // TikTok returns HTTP 200 with error.code "ok" on success -- a non-"ok" code is still
  // a failure even though the status line says otherwise.
  const apiCode = json?.error?.code;
  if (!res.ok || (apiCode && apiCode !== "ok")) throw tiktokError(res.status, json);
  return json;
}

export async function getCreatorInfo({ token }) {
  const json = await call("/post/publish/creator_info/query/", { token });
  const d = json.data ?? {};
  return {
    nickname: d.creator_nickname ?? null,
    username: d.creator_username ?? null,
    max_duration_seconds: d.max_video_post_duration_sec ?? null,
    privacy_options: d.privacy_level_options ?? [],
  };
}

/**
 * Upload and publish one video.
 * @param {object} opts
 * @param {string} opts.privacyLevel one of the values returned by getCreatorInfo
 */
export async function postVideo({ token, caption, videoPath, privacyLevel = "SELF_ONLY", dryRun }) {
  if (dryRun) return { post_id: null, publish_url: null, dry_run: true };

  const info = await stat(videoPath);
  const totalChunks = Math.max(1, Math.ceil(info.size / CHUNK_SIZE));
  // Single-chunk uploads must declare chunk_size === video_size, or init is rejected.
  const chunkSize = totalChunks === 1 ? info.size : CHUNK_SIZE;

  const init = await call("/post/publish/video/init/", {
    token,
    body: {
      post_info: {
        title: caption,
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: info.size,
        chunk_size: chunkSize,
        total_chunk_count: totalChunks,
      },
    },
  });

  const { publish_id: publishId, upload_url: uploadUrl } = init.data ?? {};
  if (!uploadUrl) throw tiktokError(500, { error: { message: "init returned no upload_url" } });

  const fh = await open(videoPath, "r");
  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, info.size) - 1;
      const length = end - start + 1;
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, start);
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(length),
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
        },
        body: buf,
      });
      if (!res.ok) {
        throw tiktokError(res.status, { error: { message: `chunk ${i + 1}/${totalChunks} upload failed` } });
      }
    }
  } finally {
    await fh.close();
  }

  // TikTok finishes processing asynchronously; the post id only exists once it does.
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const st = await call("/post/publish/status/fetch/", { token, body: { publish_id: publishId } });
    const status = st.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      const postId = st.data?.publicaly_available_post_id?.[0] ?? publishId;
      return { post_id: String(postId), publish_url: `https://www.tiktok.com/video/${postId}` };
    }
    if (status === "FAILED") {
      throw tiktokError(400, { error: { message: `publish failed: ${st.data?.fail_reason ?? "unknown"}` } });
    }
    if (Date.now() > deadline) {
      // Upload succeeded; only confirmation timed out. Report the publish_id so the
      // caller can reconcile later instead of re-uploading and double-posting.
      return { post_id: publishId, publish_url: null, pending: true };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
