// YouTube Data API v3 adapter (Shorts = a normal upload that happens to be <=3min, 9:16).
//
// Auth is refresh-token based so the daily scheduler can run unattended: the one-time
// browser consent produces a refresh token, and this exchanges it for a short-lived
// access token on every run. Nothing is cached to disk.
import { stat, readFile } from "node:fs/promises";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

function ytError(status, body) {
  const e = body?.error ?? {};
  let errCode = "ERR_PUB_04";
  if (status === 401) errCode = "ERR_PUB_01";
  else if (status === 429 || status === 403) {
    // 403 is overloaded: quotaExceeded/rateLimitExceeded are retryable, the rest are not.
    const reason = e.errors?.[0]?.reason ?? "";
    errCode = ["quotaExceeded", "rateLimitExceeded", "userRateLimitExceeded"].includes(reason)
      ? "ERR_PUB_02"
      : "ERR_PUB_04";
  }
  const err = new Error(`YouTube ${errCode}: ${e.message || `HTTP ${status}`}`);
  err.code = errCode;
  return err;
}

export async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`YouTube ERR_PUB_01: token refresh failed (${json.error_description || json.error || res.status})`);
    err.code = "ERR_PUB_01";
    throw err;
  }
  return json.access_token;
}

/**
 * Resumable upload. Title and description are capped separately -- YouTube rejects a
 * title over 100 chars outright, and the spec pins Shorts descriptions at 100 too.
 */
export async function postVideo({
  clientId,
  clientSecret,
  refreshToken,
  title,
  description,
  tags = [],
  privacyStatus = "private",
  videoPath,
  dryRun,
}) {
  if (dryRun) return { post_id: null, publish_url: null, dry_run: true };

  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  const info = await stat(videoPath);

  const metadata = {
    snippet: {
      title: [...String(title)].slice(0, 100).join(""),
      description,
      tags,
      categoryId: "22", // People & Blogs
    },
    status: { privacyStatus, selfDeclaredMadeForKids: false },
  };

  const startRes = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(info.size),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!startRes.ok) throw ytError(startRes.status, await startRes.json().catch(() => ({})));

  const sessionUrl = startRes.headers.get("location");
  if (!sessionUrl) throw ytError(500, { error: { message: "no resumable session URL returned" } });

  const bytes = await readFile(videoPath);
  const uploadRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(info.size) },
    body: bytes,
  });
  const json = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw ytError(uploadRes.status, json);

  return { post_id: json.id, publish_url: `https://youtube.com/shorts/${json.id}` };
}
