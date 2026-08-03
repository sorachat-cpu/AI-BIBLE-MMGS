// LINE Messaging API adapter -- broadcast to the OA's followers.
//
// This is the one destination whose credentials already exist in .env
// (LINE_CHANNEL_ACCESS_TOKEN, OA "ติดดินบินโดรน" @244raxjb), so it is what the rest of
// the publish path is proved against.
//
// LINE fetches media over https and will not accept an upload, so video/image messages
// need PUBLIC_MEDIA_BASE_URL. Text broadcasts work with no hosting at all.
const API = "https://api.line.me/v2/bot";

function lineError(status, body) {
  let errCode = "ERR_PUB_04";
  if (status === 401) errCode = "ERR_PUB_01";
  else if (status === 429) errCode = "ERR_PUB_02";
  const err = new Error(`LINE ${errCode}: ${body?.message || `HTTP ${status}`}`);
  err.code = errCode;
  return err;
}

async function call(pathname, { token, method = "POST", body }) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw lineError(res.status, json);
  return json;
}

/** Cheap liveness check that costs no message quota. */
export async function getBotInfo({ token }) {
  const data = await call("/info", { token, method: "GET" });
  return { display_name: data.displayName, basic_id: data.basicId, picture_url: data.pictureUrl ?? null };
}

export async function getQuota({ token }) {
  const [quota, consumption] = await Promise.all([
    call("/message/quota", { token, method: "GET" }),
    call("/message/quota/consumption", { token, method: "GET" }),
  ]);
  return {
    type: quota.type,
    limit: quota.value ?? null,
    used: consumption.totalUsage ?? 0,
  };
}

/**
 * Broadcast to every follower. Irreversible and quota-consuming, so callers must pass
 * dryRun:false deliberately -- there is no unsend for a broadcast.
 */
export async function broadcast({ token, caption, videoUrl, previewImageUrl, imageUrl, dryRun }) {
  const messages = [];
  if (caption) messages.push({ type: "text", text: [...caption].slice(0, 5000).join("") });
  if (videoUrl) {
    messages.push({
      type: "video",
      originalContentUrl: videoUrl,
      previewImageUrl: previewImageUrl || imageUrl || videoUrl.replace(/\.mp4$/i, ".jpg"),
    });
  } else if (imageUrl) {
    messages.push({ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  }
  if (messages.length === 0) throw lineError(400, { message: "nothing to broadcast" });

  if (dryRun) return { post_id: null, publish_url: null, dry_run: true, messages_preview: messages };

  // LINE returns 200 with an empty body; the request id header is the only handle.
  const res = await fetch(`${API}/message/broadcast`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw lineError(res.status, await res.json().catch(() => ({})));
  const requestId = res.headers.get("x-line-request-id");
  return { post_id: requestId, publish_url: null };
}
