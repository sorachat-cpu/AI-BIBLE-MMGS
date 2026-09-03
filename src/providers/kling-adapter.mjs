// KlingAdapter -- Provider Interface adapter for KLING_V2 (16_PROVIDER_INTERFACE.md §6).
// Contract per that doc: every adapter implements exactly buildRequest() and
// normalizeResponse(). No Engine may call this API directly -- it goes through here.
//
// DIVERGENCE FROM SPEC (worth reconciling in Phase 0): 16_PROVIDER_INTERFACE.md shows
// normalizeResponse() reading `klingResponse.data.works[0].resource.resource`. The
// currently documented Kling API returns `data.task_result.videos[0].url` behind an
// async task_id + polling flow. This adapter implements the real, current API shape.
import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://api.klingai.com";
// Kling 3.0 Turbo is a different API, not a new model_name on the old one: its own host,
// its own request shape (`contents[]` instead of flat fields), its own polling endpoint
// (`/tasks` instead of a per-product path), and plain bearer auth instead of the signed
// JWT. It is selected by KLING_MODEL and routed separately throughout this file.
const TURBO_BASE_URL = "https://api-singapore.klingai.com";
const TURBO_MODEL = "kling-3.0-turbo";
const isTurbo = (modelName) => String(modelName ?? "").startsWith("kling-3.0");
const PROVIDER_NAME = "KLING_V2";
const ESTIMATED_COST_USD = 0.16;
// 16_PROVIDER_INTERFACE.md §12 sets PROVIDER_TIMEOUTS_MS.IMAGE_TO_VIDEO = 180_000, but
// measured against the real API that is too short: a 5s kling-v2-master clip was still
// "processing" at 182s, so the spec value guarantees a timeout on a job that was already
// paid for. Raised to 10 min; the spec table should be corrected in Phase 0.
const TIMEOUT_MS = Number(process.env.KLING_TIMEOUT_MS ?? 600_000);
const POLL_INTERVAL_MS = 15_000;

/**
 * Read what Kling says a task actually cost, instead of reporting the estimate.
 *
 * Every task record carries a `billing[]` array naming the real deduction: `charge_type`
 * is "unit" when it came out of a prepaid resource package and "cash" when it came off a
 * balance, so the two are different currencies and must not be added together or
 * presented as one number.
 *
 * This matters because ESTIMATED_COST_USD below is a guess that predates any measurement,
 * and it is the number every engine has been summing and showing to the user. Where the
 * API tells us the truth, report the truth and mark the estimate as an estimate.
 */
function readBilling(task) {
  const rows = Array.isArray(task?.billing) ? task.billing : [];
  if (!rows.length) return null;

  let units = 0;
  let cash = 0;
  let currency = null;
  for (const row of rows) {
    const amount = Number(row?.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.charge_type === "unit") units += amount;
    else if (row.charge_type === "cash") {
      cash += amount;
      currency = row.currency ?? currency;
    }
  }
  return {
    units: units || null,
    cash: cash || null,
    currency,
    raw: rows,
  };
}

const NEGATIVE_PROMPT =
  "text, watermark, logo, subtitles, captions, signage, numbers, letters, brand name, UI elements, people, vehicles";

export class KlingAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

// Kling official auth is a short-lived HS256 JWT signed with the account's
// Access Key / Secret Key -- NOT a raw bearer token. Passing a plain key yields
// {"code":1002,"message":"api key is disabled"}.
function signJwt(accessKey, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }));
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function resolveAuthHeader(config) {
  const accessKey = config.accessKey ?? process.env.KLING_ACCESS_KEY;
  const secretKey = config.secretKey ?? process.env.KLING_SECRET_KEY;
  if (accessKey && secretKey) return `Bearer ${signJwt(accessKey, secretKey)}`;

  // Fallback for resold/proxied Kling endpoints that accept a plain bearer key.
  const apiKey = config.apiKey ?? process.env.KLING_API_KEY;
  if (apiKey) return `Bearer ${apiKey}`;

  throw new KlingAdapterError(
    "ERR_PROV_01",
    "No Kling credentials. Set KLING_ACCESS_KEY + KLING_SECRET_KEY (official JWT auth), or KLING_API_KEY for a proxy endpoint."
  );
}

// Kling exposes camera_control only on kling-v1-family models (std mode, 5s).
// v2 models ignore it, so motion is carried by the prompt text instead.
function buildCameraControl(cameraMotion, modelName) {
  if (!modelName.startsWith("kling-v1")) return undefined;
  switch (cameraMotion) {
    case "PAN_RIGHT":
      return { type: "simple", config: { horizontal: 5 } };
    case "ZOOM_IN":
      return { type: "simple", config: { zoom: 5 } };
    case "TILT_UP":
      return { type: "simple", config: { tilt: 5 } };
    case "DRONE_REVEAL":
      return { type: "forward_up" };
    default:
      return undefined;
  }
}

export class KlingAdapter {
  constructor(config = {}) {
    // 3.0 Turbo lives on its own host, so the default follows the selected model rather
    // than being one constant -- an explicit KLING_BASE_URL still wins for both.
    const model = config.modelName ?? process.env.KLING_MODEL ?? "kling-v2-master";
    this.baseUrl =
      config.baseUrl ??
      process.env.KLING_BASE_URL ??
      (isTurbo(model) ? TURBO_BASE_URL : DEFAULT_BASE_URL);
    this.modelName = model;
    this.providerName = PROVIDER_NAME;
    this.estimatedCostUsd = ESTIMATED_COST_USD;
    this.config = config;
  }

  // Standard payload -> Kling-specific request body.
  // `image` accepts either a publicly reachable URL or a raw base64 string (no data:
  // URI prefix). Base64 is what makes locally-uploaded photos work at all -- Kling's
  // servers cannot reach a file sitting on localhost.
  buildRequest(standardPayload) {
    if (isTurbo(this.modelName)) return this.#buildTurboRequest(standardPayload);
    const { image, image_tail, prompt, camera_motion, duration_seconds = 5 } = standardPayload;
    const body = {
      // An end frame (image_tail) is only honoured by v1-family models, so switch to
      // one automatically rather than silently ignoring the caller's end frame.
      model_name: image_tail ? "kling-v1-6" : this.modelName,
      image,
      prompt,
      negative_prompt: NEGATIVE_PROMPT,
      cfg_scale: 0.5,
      // kling-v1-6 rejects image_tail-only requests in "std" mode outright: 400 "model/
      // mode/duration(kling-v1-6/std/5) is not supported with only image_tail" (confirmed
      // against the live API). WF5-media-pipeline-spec.md §4.3 already spec'd "pro" as the
      // real value and "std" as draft-only -- this just makes the code match that for the
      // one combination Kling won't accept in std at all.
      mode: image_tail ? "pro" : "std",
      duration: String(Math.round(duration_seconds)),
    };
    if (image_tail) body.image_tail = image_tail;
    // camera_control and image_tail are mutually exclusive -- the end frame already
    // dictates where the camera ends up.
    const cameraControl = image_tail ? undefined : buildCameraControl(camera_motion, body.model_name);
    if (cameraControl) body.camera_control = cameraControl;
    return body;
  }

  /**
   * Kling 3.0 Turbo's request shape: materials go in `contents[]` keyed by type, output
   * settings in `settings`, and the negative prompt is folded into the prompt text
   * because there is no separate field for it.
   *
   * THE END FRAME IS GONE. The 3.0 Turbo docs state plainly that only First Frame is
   * supported -- "First Frame + Last Frame and Last Frame-only are not supported yet".
   * That is not a cosmetic difference here: the construction sequence and the storyboard
   * descent are both built on morphing from a start frame to a specified end frame, and
   * silently dropping `image_tail` would return a plausible clip that animates away from
   * the plot instead of toward the finished house -- wrong output, no error, money spent.
   * So it throws, and the caller keeps a v1-family model for those shots.
   */
  #buildTurboRequest({ image, image_tail, prompt, duration_seconds = 5 }) {
    if (image_tail) {
      throw new KlingAdapterError(
        "ERR_PROV_04",
        `${this.modelName} ไม่รองรับภาพเฟรมจบ (image_tail) -- รองรับเฉพาะเฟรมแรก\n` +
          "   ฉากก่อสร้างและช็อตดิ่งลงจากฟ้าต้องใช้ KLING_MODEL=kling-v1-6 ต่อไป"
      );
    }
    return {
      contents: [
        // The old API had a `negative_prompt` field; 3.0 Turbo has no equivalent, so the
        // same exclusions ride in the prompt text -- the docs note it "can include both
        // positive and negative descriptions".
        { type: "prompt", text: `${prompt}\n\nAvoid: ${NEGATIVE_PROMPT}.` },
        { type: "first_frame", url: image },
      ],
      settings: {
        resolution: process.env.KLING_RESOLUTION ?? "1080p",
        // 3.0 Turbo takes any whole second from 3 to 15, unlike the old 5-or-10 choice.
        duration: Math.min(15, Math.max(3, Math.round(duration_seconds))),
      },
      options: {
        watermark_info: { enabled: false },
      },
    };
  }

  /** 3.0 Turbo returns outputs as a typed array under a task record, not `task_result`. */
  #normalizeTurboResponse(task, durationMs) {
    const video = (task?.outputs ?? []).find((o) => o.type === "video");
    if (!video?.url) {
      throw new KlingAdapterError(
        "ERR_PROV_04",
        `Malformed Kling 3.0 response: ${JSON.stringify(task).slice(0, 300)}`
      );
    }
    const seconds = Number(video.duration);
    return {
      provider_used: `${PROVIDER_NAME}_TURBO`,
      status: "SUCCESS",
      result: {
        video_url: video.url,
        duration_seconds: Number.isFinite(seconds) ? seconds : 5,
        fps: 30,
        resolution: process.env.KLING_RESOLUTION ?? "1080p",
      },
      // `cost_usd` stays for every existing caller that sums it, but it is only ever an
      // estimate -- `billing` is what Kling actually charged, and `cost_is_estimate` says
      // which one you are looking at.
      cost_usd: this.estimatedCostUsd,
      cost_is_estimate: !readBilling(task),
      billing: readBilling(task),
      duration_ms: durationMs,
    };
  }

  // Kling response -> the normalized IMAGE_TO_VIDEO result shape every Engine sees.
  normalizeResponse(klingResponse, durationMs) {
    const video = klingResponse?.data?.task_result?.videos?.[0];
    if (!video?.url) {
      throw new KlingAdapterError(
        "ERR_PROV_04",
        `Malformed Kling response: ${JSON.stringify(klingResponse).slice(0, 300)}`
      );
    }
    // Kling reports duration in SECONDS as a string ("5.041"), not milliseconds --
    // verified against a real response (contracts/test_payloads/kling_image2video_response.json).
    const durationSeconds = Number(video.duration);
    return {
      provider_used: this.providerName,
      status: "SUCCESS",
      result: {
        video_url: video.url,
        duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : 5,
        fps: 30,
        resolution: "unknown",
      },
      // Same as the 3.0 path: report what was really charged when the API says so.
      cost_is_estimate: !readBilling(klingResponse?.data),
      billing: readBilling(klingResponse?.data),
      cost_usd: this.estimatedCostUsd,
      duration_ms: durationMs,
    };
  }

  async #request(path, options, baseUrl = this.baseUrl) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: resolveAuthHeader(this.config),
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body.code !== 0 && body.code !== undefined)) {
      const message = body.message ?? res.statusText;
      const code = res.status === 401 || body.code === 1002 ? "ERR_PROV_01" : "ERR_PROV_04";
      throw new KlingAdapterError(code, `Kling API error (${res.status}/${body.code}): ${message}`);
    }
    return body;
  }

  // IMAGE_GENERATION. Kling can generate stills as well as video, which is what lets
  // House Engine run without a separate Flux/Midjourney account.
  // `image` here is an optional reference for image-to-image (e.g. the real land photo),
  // and image_fidelity controls how closely the result follows it.
  /**
   * Image generation lives on the standard host regardless of which VIDEO model is selected.
   *
   * The same adapter serves both engines (registry.mjs maps kling into VIDEO_ENGINES and
   * IMAGE_ENGINES alike), and the constructor picks its host from the video model -- so
   * KLING_MODEL=kling-3.0-turbo silently pointed every House Engine and Construction Engine
   * call at the Turbo host, which does not serve /v1/images/generations. The image side has
   * its own model (KLING_IMAGE_MODEL) and belongs on its own host.
   */
  #imageBaseUrl() {
    return this.config.baseUrl ?? process.env.KLING_IMAGE_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async generateImage({ prompt, image, imageFidelity = 0.5, aspectRatio = "16:9" }) {
    const startedAt = Date.now();
    const body = {
      model_name: process.env.KLING_IMAGE_MODEL ?? "kling-v1-5",
      prompt,
      negative_prompt: NEGATIVE_PROMPT,
      n: 1,
      aspect_ratio: aspectRatio,
    };
    if (image) {
      body.image = image;
      body.image_fidelity = imageFidelity;
      // kling-v1-5 rejects a reference image unless image_reference says how to use it
      // ("subject" keeps the scene/composition, "face" is for portraits). Omitting it
      // fails with 1201 "must set image_reference".
      body.image_reference = process.env.KLING_IMAGE_REFERENCE ?? "subject";
    }

    const imageHost = this.#imageBaseUrl();
    const submitted = await this.#request("/v1/images/generations", {
      method: "POST",
      body: JSON.stringify(body),
    }, imageHost);
    const taskId = submitted?.data?.task_id;
    if (!taskId) throw new KlingAdapterError("ERR_PROV_04", "Kling did not return a task_id for image generation");

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 5_000));
      const polled = await this.#request(`/v1/images/generations/${taskId}`, { method: "GET" }, imageHost);
      const status = polled?.data?.task_status;
      if (status === "succeed") {
        const url = polled?.data?.task_result?.images?.[0]?.url;
        if (!url) throw new KlingAdapterError("ERR_PROV_04", "Kling image task succeeded but returned no URL");
        return { image_url: url, cost_usd: 0.014, duration_ms: Date.now() - startedAt };
      }
      if (status === "failed") {
        throw new KlingAdapterError("ERR_HOU_01", `Kling image generation failed: ${polled?.data?.task_status_msg ?? "unknown"}`);
      }
    }
    throw new KlingAdapterError("ERR_PROV_05", `Kling image generation timed out -- task_id: ${taskId}`);
  }

  async call(standardPayload) {
    if (isTurbo(this.modelName)) return this.#callTurbo(standardPayload);
    const startedAt = Date.now();
    const submitted = await this.#request("/v1/videos/image2video", {
      method: "POST",
      body: JSON.stringify(this.buildRequest(standardPayload)),
    });

    const taskId = submitted?.data?.task_id;
    if (!taskId) {
      throw new KlingAdapterError("ERR_PROV_04", "Kling did not return a task_id");
    }

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const polled = await this.#request(`/v1/videos/image2video/${taskId}`, { method: "GET" });
      const status = polled?.data?.task_status;

      if (status === "succeed") return this.normalizeResponse(polled, Date.now() - startedAt);
      if (status === "failed") {
        throw new KlingAdapterError(
          "ERR_VID_02",
          `Kling generation failed: ${polled?.data?.task_status_msg ?? "unknown reason"}`
        );
      }
    }

    // Do not silently drop a paid job -- surface the task_id so it can be recovered.
    throw new KlingAdapterError(
      "ERR_PROV_05",
      `Kling timed out after ${TIMEOUT_MS / 1000}s. Job may still finish -- task_id: ${taskId}`
    );
  }

  /**
   * The 3.0 Turbo flow. Same submit-then-poll shape as above, but every piece of it is
   * at a different address: POST /image-to-video/{model}, and polling through the shared
   * GET /tasks?task_ids= endpoint whose payload is a LIST of task records rather than a
   * single `data` object.
   */
  async #callTurbo(standardPayload) {
    const startedAt = Date.now();
    const submitted = await this.#request(`/image-to-video/${this.modelName}`, {
      method: "POST",
      body: JSON.stringify(this.buildRequest(standardPayload)),
    });

    const taskId = submitted?.data?.id;
    if (!taskId) {
      throw new KlingAdapterError("ERR_PROV_04", "Kling 3.0 did not return a task id");
    }

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const polled = await this.#request(`/tasks?task_ids=${encodeURIComponent(taskId)}`, { method: "GET" });
      // `data` is an array here even for a single id -- indexing it as an object is the
      // easy mistake when porting from the old endpoint.
      const task = Array.isArray(polled?.data) ? polled.data[0] : polled?.data;

      if (task?.status === "succeeded") return this.#normalizeTurboResponse(task, Date.now() - startedAt);
      if (task?.status === "failed") {
        throw new KlingAdapterError(
          "ERR_VID_02",
          `Kling 3.0 generation failed: ${task?.message ?? "unknown reason"}`
        );
      }
    }

    throw new KlingAdapterError(
      "ERR_PROV_05",
      `Kling 3.0 timed out after ${TIMEOUT_MS / 1000}s. Job may still finish -- task id: ${taskId}`
    );
  }
}
