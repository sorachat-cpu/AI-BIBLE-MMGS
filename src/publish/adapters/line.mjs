// LINE Messaging API adapter -- broadcast to the OA's followers, and (since 2026-08-12)
// reply to individual incoming messages for the chat bot in line-bot-engine.mjs.
//
// This is the one destination whose credentials already exist in .env
// (LINE_CHANNEL_ACCESS_TOKEN, OA "ติดดินบินโดรน" @244raxjb), so it is what the rest of
// the publish path is proved against.
//
// LINE fetches media over https and will not accept an upload, so video/image messages
// need PUBLIC_MEDIA_BASE_URL. Text broadcasts work with no hosting at all.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.line.me/v2/bot";
// Rich menu *image* upload/download uses a separate data host -- everything else
// (definitions, the default-menu assignment) stays on the regular API host above.
const DATA_API = "https://api-data.line.me/v2/bot";

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

/**
 * Reply to one incoming message. Unlike broadcast(), this costs no message quota and
 * only works within the short window LINE keeps a replyToken valid for -- there is no
 * "send later" with this call, it has to happen inside the webhook handler.
 *
 * @param {Array<{label:string, text:string}>} [quickReply] tappable chips shown above the
 * keyboard, attached to the *last* message sent. Small by design -- for a big, clearly
 * visible card use `flex` instead.
 * @param {{altText:string, contents:object}} [flex] a LINE Flex Message (a real card with
 * full-width buttons) -- see buildListingCardFlex() in line-bot-engine.mjs for how one of
 * these gets built. Sent as its own message alongside `text`.
 */
export async function reply({ token, replyToken, text, quickReply, flex }) {
  const messages = [];
  if (text) messages.push({ type: "text", text: [...String(text)].slice(0, 5000).join("") });
  if (flex?.contents) {
    messages.push({ type: "flex", altText: [...String(flex.altText ?? "")].slice(0, 400).join(""), contents: flex.contents });
  }
  if (!messages.length) return;

  if (quickReply?.length) {
    messages[messages.length - 1].quickReply = {
      items: quickReply.slice(0, 13).map(({ label, text: buttonText }) => ({
        type: "action",
        action: { type: "message", label: [...String(label)].slice(0, 20).join(""), text: buttonText },
      })),
    };
  }
  await call("/message/reply", { token, body: { replyToken, messages: messages.slice(0, 5) } });
}

/**
 * Push a message to one specific LINE user id -- outside the reply-token window, so this
 * is the one that reaches the admin's *personal* LINE account (a push, not a reply to
 * whatever the customer just said) when the bot needs a human: an appointment just got
 * booked, or a customer asked something the bot has no tool to answer. Costs quota like
 * broadcast(), but targeted at exactly one recipient instead of every follower.
 *
 * `flex` takes the same {altText, contents} shape reply() does -- also used to push a
 * one-off sample card to an admin's own LINE for a visual check outside a live customer
 * conversation, since a Flex card can otherwise only be seen by triggering the bot for
 * real from a customer's account.
 */
export async function push({ token, to, text, flex }) {
  if (!to) throw lineError(400, { message: "push() needs a target LINE user id (ADMIN_LINE_USER_ID)" });
  const messages = [];
  if (text) messages.push({ type: "text", text: [...String(text)].slice(0, 5000).join("") });
  if (flex?.contents) {
    messages.push({ type: "flex", altText: [...String(flex.altText ?? "")].slice(0, 400).join(""), contents: flex.contents });
  }
  if (!messages.length) throw lineError(400, { message: "push() needs text or flex" });
  await call("/message/push", { token, body: { to, messages: messages.slice(0, 5) } });
}

/**
 * Verify that a webhook request actually came from LINE, not from anyone who guesses the
 * URL. LINE signs the raw request body with the channel secret (HMAC-SHA256, base64) and
 * sends it as `x-line-signature` -- this must run on the raw bytes before JSON.parse, or
 * a byte-for-byte identical re-stringify still fails the check.
 */
export function verifySignature({ channelSecret, rawBody, signatureHeader }) {
  if (!channelSecret || !signatureHeader) return false;
  // A Buffer is hashed as-is; a string is encoded first. Passing "utf8" alongside a Buffer
  // would be ignored anyway, but being explicit keeps the byte-exactness the HMAC needs.
  const expected = createHmac("sha256", channelSecret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8"))
    .digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signatureHeader), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- Rich Menu: the persistent tappable bar, distinct from any Flex Message ------------
// See src/lib/rich-menu.mjs for the image/area builder this consumes; setup happens once
// (or on redesign) via src/cli/setup-rich-menu.mjs, not per-request.

/** @param {{size, selected, name, chatBarText, areas}} definition */
export async function createRichMenu({ token, definition }) {
  const data = await call("/richmenu", { token, body: definition });
  return data.richMenuId;
}

/** Raw image bytes, not JSON -- goes to api-data.line.me, not api.line.me. */
export async function uploadRichMenuImage({ token, richMenuId, imageBuffer, contentType = "image/png" }) {
  const res = await fetch(`${DATA_API}/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: imageBuffer,
  });
  if (!res.ok) throw lineError(res.status, await res.json().catch(() => ({})));
}

/** Makes this the menu every follower sees by default (not per-user targeting). */
export async function setDefaultRichMenu({ token, richMenuId }) {
  await call(`/user/all/richmenu/${richMenuId}`, { token, method: "POST" });
}

export async function listRichMenus({ token }) {
  const data = await call("/richmenu/list", { token, method: "GET" });
  return data.richmenus ?? [];
}

export async function deleteRichMenu({ token, richMenuId }) {
  await call(`/richmenu/${richMenuId}`, { token, method: "DELETE" });
}
