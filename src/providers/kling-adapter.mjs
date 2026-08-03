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
const PROVIDER_NAME = "KLING_V2";
const ESTIMATED_COST_USD = 0.16;
// 16_PROVIDER_INTERFACE.md §12 sets PROVIDER_TIMEOUTS_MS.IMAGE_TO_VIDEO = 180_000, but
// measured against the real API that is too short: a 5s kling-v2-master clip was still
// "processing" at 182s, so the spec value guarantees a timeout on a job that was already
// paid for. Raised to 10 min; the spec table should be corrected in Phase 0.
const TIMEOUT_MS = Number(process.env.KLING_TIMEOUT_MS ?? 600_000);
const POLL_INTERVAL_MS = 15_000;

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
    this.baseUrl = config.baseUrl ?? process.env.KLING_BASE_URL ?? DEFAULT_BASE_URL;
    this.modelName = config.modelName ?? process.env.KLING_MODEL ?? "kling-v2-master";
    this.providerName = PROVIDER_NAME;
    this.estimatedCostUsd = ESTIMATED_COST_USD;
    this.config = config;
  }

  // Standard payload -> Kling-specific request body.
  // `image` accepts either a publicly reachable URL or a raw base64 string (no data:
  // URI prefix). Base64 is what makes locally-uploaded photos work at all -- Kling's
  // servers cannot reach a file sitting on localhost.
  buildRequest(standardPayload) {
    const { image, image_tail, prompt, camera_motion, duration_seconds = 5 } = standardPayload;
    const body = {
      // An end frame (image_tail) is only honoured by v1-family models, so switch to
      // one automatically rather than silently ignoring the caller's end frame.
      model_name: image_tail ? "kling-v1-6" : this.modelName,
      image,
      prompt,
      negative_prompt: NEGATIVE_PROMPT,
      cfg_scale: 0.5,
      mode: "std",
      duration: String(Math.round(duration_seconds)),
    };
    if (image_tail) body.image_tail = image_tail;
    // camera_control and image_tail are mutually exclusive -- the end frame already
    // dictates where the camera ends up.
    const cameraControl = image_tail ? undefined : buildCameraControl(camera_motion, body.model_name);
    if (cameraControl) body.camera_control = cameraControl;
    return body;
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
      cost_usd: this.estimatedCostUsd,
      duration_ms: durationMs,
    };
  }

  async #request(path, options) {
    const res = await fetch(`${this.baseUrl}${path}`, {
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

    const submitted = await this.#request("/v1/images/generations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const taskId = submitted?.data?.task_id;
    if (!taskId) throw new KlingAdapterError("ERR_PROV_04", "Kling did not return a task_id for image generation");

    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 5_000));
      const polled = await this.#request(`/v1/images/generations/${taskId}`, { method: "GET" });
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
}
