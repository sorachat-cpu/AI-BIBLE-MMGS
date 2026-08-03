// One-time Facebook Page token setup.
//
// Getting a non-expiring Page token is four Graph calls chained together, and every
// guide writes them as curl commands with the token pasted inline -- which puts the
// token into shell history. This does the chain in-process and writes the result
// straight to .env; nothing is ever printed or logged.
//
// The chain:
//   short-lived user token  --(app id + secret)-->  long-lived user token
//   long-lived user token   --(/me/accounts)---->   page token that never expires
//
// The last step only yields a permanent token if the user token going in is long-lived.
// A page token derived from a short-lived user token expires with it, which is the
// single most common reason "my token stopped working after an hour".
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROJECT_ROOT } from "../lib/ffmpeg.mjs";

const GRAPH = "https://graph.facebook.com/v21.0";
const ENV_FILE = path.join(PROJECT_ROOT, ".env");

// One source of truth, shared with the adapter that actually posts.
import { REQUIRED_PAGE_PERMISSIONS as REQUIRED_SCOPES } from "./adapters/facebook.mjs";

/** Turn a missing-scope list into advice that says what still will and will not work. */
function scopeWarning(missing) {
  if (!missing.length) return null;
  const cannotPost = missing.includes("pages_manage_posts");
  return (
    `ขาดสิทธิ์: ${missing.join(", ")}` +
    (cannotPost
      ? "\n      -> อ่านข้อมูลเพจได้ แต่โพสต์ไม่ได้ ต้องเพิ่ม pages_manage_posts แล้วขอ token ใหม่" +
        "\n      -> หมายเหตุ: ไม่มี publish_video แล้ว pages_manage_posts ครอบคลุมวิดีโอด้วย"
      : "")
  );
}

async function graph(pathname, params) {
  const url = new URL(`${GRAPH}${pathname}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    // Message only -- the URL carries the token and must never reach a log.
    throw new Error(e.message || `Graph HTTP ${res.status}`);
  }
  return json;
}

/** What a token actually is: type, which app, when it dies, what it can do. */
export async function inspectToken({ token, appId, appSecret }) {
  // debug_token needs an app token; app_id|app_secret is the documented form.
  const appToken = appSecret ? `${appId}|${appSecret}` : token;
  const { data } = await graph("/debug_token", { input_token: token, access_token: appToken });
  return {
    type: data.type,
    app_id: data.app_id,
    valid: Boolean(data.is_valid),
    expires_at: data.expires_at ? new Date(data.expires_at * 1000).toISOString() : "ไม่หมดอายุ",
    scopes: data.scopes ?? [],
    missing_scopes: REQUIRED_SCOPES.filter((s) => !(data.scopes ?? []).includes(s)),
  };
}

/** Short-lived user token -> long-lived (about 60 days). Needs the app secret. */
export async function extendUserToken({ token, appId, appSecret }) {
  const json = await graph("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: token,
  });
  return json.access_token;
}

/** Pages the user administers, each with its own token. */
export async function listPageTokens({ userToken }) {
  const json = await graph("/me/accounts", { access_token: userToken, fields: "id,name,access_token,tasks" });
  return (json.data ?? []).map((p) => ({
    page_id: p.id,
    page_name: p.name,
    token: p.access_token,
    can_post: (p.tasks ?? []).includes("CREATE_CONTENT"),
  }));
}

/** Upsert keys in .env without disturbing anything else in the file. */
export async function writeEnv(values) {
  let text = "";
  try {
    text = await readFile(ENV_FILE, "utf8");
  } catch {
    /* first run, file will be created */
  }
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
  }
  await writeFile(ENV_FILE, text, "utf8");
  return Object.keys(values);
}

/**
 * Accept a Page token directly, skipping the user-token chain.
 *
 * The Graph API Explorer can hand out a Page token straight from its dropdown, so this
 * is the shortest path. The catch: that token inherits the lifetime of the user token it
 * came from, and the Explorer's is short-lived -- so it typically dies in about an hour.
 * The report says so plainly rather than letting it fail silently at 2am in cron.
 */
export async function usePageToken({ pageToken, save = true }) {
  const steps = [];

  // /me on a Page token returns the Page itself, which both identifies it and proves it
  // works. Only id and name are asked for: fan_count needs extra permissions and its
  // absence would fail the whole call over a number nothing depends on.
  const me = await graph("/me", { access_token: pageToken, fields: "id,name" });

  // The Explorer's dropdown defaults to "User Token", so pasting the first long string
  // on screen usually hands over a user token by mistake. Saving that as the page token
  // makes readiness report "พร้อม" for a destination that can never post, so refuse it.
  const kind = await graph("/debug_token", { input_token: pageToken, access_token: pageToken })
    .then((r) => r.data?.type)
    .catch(() => null);
  if (kind === "USER") {
    throw new Error(
      `นี่คือ User Token ของ "${me.name}" ไม่ใช่ Page Token\n` +
        `   ใน Graph API Explorer ให้กดเปลี่ยน dropdown จาก "User Token" เป็น "Page Token" แล้วเลือกเพจ\n` +
        `   หรือส่ง user token มาที่ --user-token แทน แล้วระบบจะไปดึง page token ให้เอง`
    );
  }
  steps.push({ step: "ตรวจ token", ok: true, detail: `${me.name} (${me.id})` });

  const followers = await graph("/me", { access_token: pageToken, fields: "fan_count" })
    .then((r) => r.fan_count ?? null)
    .catch(() => null);

  let expires = "ไม่ทราบ";
  let permanent = false;
  try {
    const { data } = await graph("/debug_token", { input_token: pageToken, access_token: pageToken });
    expires = data.expires_at ? new Date(data.expires_at * 1000).toISOString() : "ไม่หมดอายุ";
    permanent = !data.expires_at;
    steps.push({
      step: "ชนิดและอายุ",
      ok: true,
      detail: `${data.type ?? "PAGE"} · หมดอายุ ${expires}`,
      warning: permanent
        ? null
        : "token นี้มีวันหมดอายุ -- ใช้ทดสอบได้ แต่ตั้ง cron ไม่ได้ ต้องทำแบบ user token + app secret",
    });
    const missing = REQUIRED_SCOPES.filter((s) => !(data.scopes ?? []).includes(s));
    if (missing.length) {
      steps.push({ step: "สิทธิ์", ok: false, detail: "", warning: scopeWarning(missing) });
    } else {
      steps.push({ step: "สิทธิ์", ok: true, detail: (data.scopes ?? []).join(", ") });
    }
  } catch {
    // debug_token normally needs an app token; not being able to introspect is not fatal.
    steps.push({ step: "ชนิดและอายุ", ok: false, detail: "ตรวจไม่ได้ (ต้องใช้ app token)" });
  }

  if (save) {
    await writeEnv({ FACEBOOK_PAGE_ID: me.id, FACEBOOK_PAGE_ACCESS_TOKEN: pageToken });
    steps.push({ step: "บันทึกลง .env", ok: true, detail: "FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN" });
  }

  return {
    page_id: me.id,
    page_name: me.name,
    followers,
    permanent,
    expires,
    other_pages: [],
    steps,
  };
}

/**
 * Full setup. Returns a report safe to print -- it deliberately contains no token.
 *
 * @param {object} opts
 * @param {string} opts.userToken  from the Graph API Explorer
 * @param {string} opts.appId
 * @param {string} [opts.appSecret] omit to skip the exchange (token will expire in ~1h)
 * @param {string} [opts.pageId]    pick a specific page when the account admins several
 */
export async function setupPageToken({ userToken, appId, appSecret, pageId, save = true }) {
  const steps = [];

  const before = await inspectToken({ token: userToken, appId, appSecret });
  steps.push({
    step: "ตรวจ token ที่ให้มา",
    ok: before.valid,
    detail: `ชนิด ${before.type} · หมดอายุ ${before.expires_at}`,
    warning: scopeWarning(before.missing_scopes),
  });
  if (!before.valid) throw new Error("token ที่ให้มาใช้ไม่ได้ (หมดอายุแล้วหรือคัดลอกมาไม่ครบ)");

  let longLived = userToken;
  if (appSecret) {
    longLived = await extendUserToken({ token: userToken, appId, appSecret });
    const after = await inspectToken({ token: longLived, appId, appSecret });
    steps.push({ step: "แลกเป็น token อายุยาว", ok: true, detail: `หมดอายุ ${after.expires_at}` });
  } else {
    steps.push({
      step: "แลกเป็น token อายุยาว",
      ok: false,
      detail: "ข้ามเพราะไม่มี App Secret",
      warning: "Page token ที่ได้จะหมดอายุใน ~1 ชม. ใช้ทดสอบได้ แต่ยังตั้ง cron ไม่ได้",
    });
  }

  const pages = await listPageTokens({ userToken: longLived });
  if (!pages.length) {
    // pages_show_list being granted is not enough on its own: the consent dialog also
    // asks which Pages to opt in, and clicking straight through opts in to none. That
    // is what an empty /me/accounts almost always means.
    throw new Error(
      "token นี้มองไม่เห็นเพจเลย (/me/accounts ว่าง)\n" +
        "   สาเหตุที่พบบ่อย: ตอนกด Generate Access Token มีหน้าต่างให้ 'เลือกเพจ' แล้วกดผ่านไปโดยไม่ได้ติ๊กเพจ\n" +
        "   ทำใหม่: Graph API Explorer > Generate Access Token > หน้าต่างสิทธิ์ > เลือก 'ติดดินบินโดรน' > ติ๊กสิทธิ์ทุกข้อ > Done"
    );
  }
  const page = pageId ? pages.find((p) => p.page_id === pageId) : pages[0];
  if (!page) throw new Error(`ไม่พบเพจ ${pageId} ในบัญชีนี้ (เห็น: ${pages.map((p) => p.page_id).join(", ")})`);

  steps.push({
    step: "ดึง Page token",
    ok: true,
    detail: `${page.page_name} (${page.page_id})`,
    warning: page.can_post ? null : "บัญชีนี้ไม่มีสิทธิ์โพสต์ในเพจนี้ (ต้องเป็นแอดมินหรือมี CREATE_CONTENT)",
  });

  const pageCheck = await inspectToken({ token: page.token, appId, appSecret });
  steps.push({ step: "ตรวจ Page token", ok: pageCheck.valid, detail: `หมดอายุ ${pageCheck.expires_at}` });

  if (save) {
    await writeEnv({ FACEBOOK_PAGE_ID: page.page_id, FACEBOOK_PAGE_ACCESS_TOKEN: page.token });
    steps.push({ step: "บันทึกลง .env", ok: true, detail: "FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN" });
  }

  return {
    page_id: page.page_id,
    page_name: page.page_name,
    permanent: Boolean(appSecret) && pageCheck.expires_at === "ไม่หมดอายุ",
    other_pages: pages.filter((p) => p.page_id !== page.page_id).map((p) => ({ id: p.page_id, name: p.page_name })),
    steps,
  };
}
