// Minimal local web UI for engines that are wired up so far.
// No framework -- plain node:http, single static page + one JSON endpoint per engine.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPropertyEngine, PropertyEngineError } from "./engines/property-engine.mjs";
import { runGoogleEngine, GoogleEngineError } from "./engines/google-engine.mjs";
import { runVideoEngine, VideoEngineError } from "./engines/video-engine.mjs";
import { runHouseEngine, HouseEngineError } from "./engines/house-engine.mjs";
import { runStoryboard, StoryboardError } from "./engines/storyboard.mjs";
import { wf5Readiness } from "./wf5/steps.mjs";
import { generateConstructionSequence, ConstructionError, estimateConstructionCost } from "./wf5/construction.mjs";
import { runRenderEngine, RenderEngineError } from "./engines/render-engine.mjs";
import { runPublishEngine, PublishEngineError } from "./engines/publish-engine.mjs";
import { publishReadiness } from "./publish/platforms.mjs";
import { loadScheduleConfig, buildSchedule, dueSlots, saveScheduleConfig } from "./content/calendar.mjs";
import { scanStock, stockSummary, updateStockMeta } from "./content/stock.mjs";
import {
  planAhead,
  loadQueue,
  patchItem,
  publishItem,
  runDue,
  exportSheet,
  importSheet,
  loadProfile,
  saveProfile,
} from "./content/queue.mjs";
import { ingestPagePosts, loadArchive, topPosts } from "./content/page-archive.mjs";
import {
  importFromText,
  importFromPageArchive,
  enrichAll,
  loadListings,
  listingsToSheet,
  listingsFromSheet,
  patchListing,
} from "./content/listings.mjs";
import { renderCarousel } from "./engines/carousel-engine.mjs";
import { TOPICS } from "./content/topics.mjs";
import { listKits } from "./publish/adapters/manual-kit.mjs";
import { systemStatus } from "./publish/status.mjs";
import { OUTPUT_DIR } from "./lib/ffmpeg.mjs";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

// Base64 image uploads make request bodies large; cap them so a stray huge file
// cannot exhaust memory. ~12MB of base64 is roughly a 9MB source image, above
// Kling's own limit, so anything bigger would fail downstream anyway.
const MAX_BODY_BYTES = 12 * 1024 * 1024;

async function readBody(req) {
  let body = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      req.destroy();
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES / 1024 / 1024}MB limit`);
    }
    body += chunk;
  }
  return body;
}

async function handleEngine(req, res, { run, ErrorClass, buildArgs }) {
  const payload = JSON.parse((await readBody(req)) || "{}");
  try {
    const data = await run(...buildArgs(payload));
    sendJson(res, 200, { ok: true, data });
  } catch (err) {
    if (err instanceof ErrorClass) {
      sendJson(res, 400, { ok: false, code: err.code, message: err.message });
    } else {
      sendJson(res, 500, { ok: false, code: "ERR_UNKNOWN", message: String(err.message || err) });
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = await readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "POST" && req.url === "/api/property-engine") {
      await handleEngine(req, res, {
        run: runPropertyEngine,
        ErrorClass: PropertyEngineError,
        buildArgs: ({ raw_input_text }) => [raw_input_text],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/google-engine") {
      await handleEngine(req, res, {
        run: runGoogleEngine,
        ErrorClass: GoogleEngineError,
        buildArgs: ({ property_id, raw_address, include_nearby, nearby_radius_m }) => [
          { property_id, raw_address, include_nearby, nearby_radius_m },
        ],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/video-engine") {
      await handleEngine(req, res, {
        run: runVideoEngine,
        ErrorClass: VideoEngineError,
        buildArgs: (p) => [p],
      });
      return;
    }

    // Serve finished renders and carousel slides. Subfolders are allowed (carousels live
    // in output/carousels/<topic>/), so containment is checked by resolved path rather
    // than by basename().
    if (req.method === "GET" && req.url.startsWith("/output/")) {
      const rel = decodeURIComponent(req.url.slice("/output/".length).split("?")[0]);
      const file = path.resolve(OUTPUT_DIR, rel);
      if (!file.startsWith(OUTPUT_DIR + path.sep)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      const TYPES = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8" };
      try {
        const info = await stat(file);
        res.writeHead(200, {
          "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          "Content-Length": info.size,
          "Accept-Ranges": "bytes",
        });
        createReadStream(file).pipe(res);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/render-engine") {
      await handleEngine(req, res, {
        run: runRenderEngine,
        ErrorClass: RenderEngineError,
        buildArgs: (p) => [p],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/construction") {
      await handleEngine(req, res, {
        run: generateConstructionSequence,
        ErrorClass: ConstructionError,
        buildArgs: (p) => [p],
      });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/construction/estimate")) {
      const n = Number(new URL(req.url, "http://x").searchParams.get("stages") ?? 5);
      sendJson(res, 200, { ok: true, data: estimateConstructionCost(n) });
      return;
    }

    if (req.method === "GET" && req.url === "/api/wf5/readiness") {
      sendJson(res, 200, { ok: true, data: await wf5Readiness() });
      return;
    }

    if (req.method === "POST" && req.url === "/api/house-engine") {
      await handleEngine(req, res, {
        run: runHouseEngine,
        ErrorClass: HouseEngineError,
        buildArgs: ({ property_id, style_tag, land_image_base64, land_image_url }) => [
          { property_id, style_tag, land_image_base64, land_image_url },
        ],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/storyboard") {
      await handleEngine(req, res, {
        run: runStoryboard,
        ErrorClass: StoryboardError,
        buildArgs: (p) => [p],
      });
      return;
    }

    if (req.method === "GET" && req.url === "/nav.js") {
      const js = await readFile(path.join(PUBLIC_DIR, "nav.js"), "utf8");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      res.end(js);
      return;
    }

    // ---- publishing / daily schedule ----------------------------------------
    if (req.method === "GET" && (req.url === "/status" || req.url === "/status.html")) {
      const html = await readFile(path.join(PUBLIC_DIR, "status.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // Read-only health probe. Kept out of /api/publish/* because it is the one endpoint
    // safe to hit from a monitor, a cron pre-check, or another app in the folder.
    if (req.method === "GET" && req.url.startsWith("/api/status")) {
      const q = new URL(req.url, "http://x").searchParams;
      sendJson(res, 200, {
        ok: true,
        data: await systemStatus({
          days: Number(q.get("days") ?? 7),
          probeNetwork: q.get("offline") !== "1",
        }),
      });
      return;
    }

    if (req.method === "GET" && req.url === "/publish" ) {
      const html = await readFile(path.join(PUBLIC_DIR, "publish.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/publish/overview")) {
      const days = Number(new URL(req.url, "http://x").searchParams.get("days") ?? 7);
      const [config, profile, stock, queue, kits] = await Promise.all([
        loadScheduleConfig(),
        loadProfile(),
        scanStock(),
        loadQueue(),
        listKits(),
      ]);
      const byId = new Map(queue.items.map((i) => [i.id, i]));
      // Attach whatever the queue already decided to each calendar slot so the console
      // renders one table instead of asking the browser to join two lists.
      const calendar = buildSchedule(config, { days }).map((day) => ({
        ...day,
        slots: day.slots.map((s) => ({ ...s, item: byId.get(s.slot_id) ?? null })),
      }));
      sendJson(res, 200, {
        ok: true,
        data: {
          readiness: publishReadiness(),
          profile,
          calendar,
          due: dueSlots(config).map((s) => s.slot_id),
          stock,
          stock_summary: stockSummary(stock, config),
          queue: queue.items,
          kits,
          schedule_config: config,
        },
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/plan") {
      const p = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, { ok: true, data: await planAhead({ days: p.days ?? 7, refill: Boolean(p.refill) }) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/item") {
      const p = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, { ok: true, data: await patchItem(p.id, p.patch ?? {}) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/post") {
      const p = JSON.parse((await readBody(req)) || "{}");
      try {
        // live must be sent explicitly; a missing flag is always a rehearsal.
        sendJson(res, 200, { ok: true, data: await publishItem(p.id, { dry_run: p.live !== true }) });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: err.code ?? "ERR_PUB", message: err.message });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/run") {
      const p = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, { ok: true, data: await runDue({ dry_run: p.live === true ? false : true }) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/stock-meta") {
      const p = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, { ok: true, data: await updateStockMeta(p.id, p.patch ?? {}) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/schedule") {
      const p = JSON.parse((await readBody(req)) || "{}");
      await saveScheduleConfig(p.config);
      sendJson(res, 200, { ok: true, data: await loadScheduleConfig() });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/profile") {
      const p = JSON.parse((await readBody(req)) || "{}");
      await saveProfile(p.profile ?? {});
      sendJson(res, 200, { ok: true, data: await loadProfile() });
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/publish/sheet")) {
      const params = new URL(req.url, "http://x").searchParams;
      const format = params.get("format") === "tsv" ? "tsv" : "csv";
      const text = await exportSheet({ format, days: Number(params.get("days") ?? 14) });
      res.writeHead(200, {
        "Content-Type": format === "tsv" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mmgs-drafts.${format}"`,
      });
      res.end(text);
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/sheet-import") {
      const p = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, { ok: true, data: await importSheet(p.csv ?? "") });
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish/page-pull") {
      const p = JSON.parse((await readBody(req)) || "{}");
      try {
        sendJson(res, 200, { ok: true, data: await ingestPagePosts({ limit: p.limit ?? 50 }) });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: err.code ?? "ERR_PUB_03", message: err.message });
      }
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/publish/page-archive")) {
      const archive = await loadArchive();
      sendJson(res, 200, { ok: true, data: { ...archive, top: await topPosts({ limit: 10 }) } });
      return;
    }

    // ---- land listing sheet -------------------------------------------------
    if (req.method === "GET" && req.url.startsWith("/api/listings")) {
      const { items } = await loadListings();
      sendJson(res, 200, { ok: true, data: { items, topics: TOPICS.map((t) => ({ id: t.id, title: t.title.join(" "), points: t.points.length })) } });
      return;
    }

    if (req.method === "POST" && req.url === "/api/listings/import") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const profile = await loadProfile();
      try {
        const data = p.from_page
          ? await importFromPageArchive({ profile, enrich: p.enrich !== false, limit: p.limit ?? 200 })
          : await importFromText(p.text ?? "", { profile, enrich: p.enrich !== false });
        sendJson(res, 200, { ok: true, data });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: err.code ?? "ERR_LISTING", message: err.message });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/listings/enrich") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const profile = await loadProfile();
      sendJson(res, 200, { ok: true, data: await enrichAll({ profile, force: Boolean(p.force) }) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/listings/item") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const profile = await loadProfile();
      try {
        sendJson(res, 200, {
          ok: true,
          data: await patchListing(p.id, p.patch ?? {}, { profile, rebuildCaption: Boolean(p.rebuild_caption) }),
        });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: "ERR_LISTING", message: err.message });
      }
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/listings-sheet")) {
      const format = new URL(req.url, "http://x").searchParams.get("format") === "tsv" ? "tsv" : "csv";
      res.writeHead(200, {
        "Content-Type": format === "tsv" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mmgs-listings.${format}"`,
      });
      res.end(await listingsToSheet({ format }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/listings/sheet-import") {
      const p = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, { ok: true, data: await listingsFromSheet(p.csv ?? "", { profile: await loadProfile() }) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/carousel") {
      const p = JSON.parse((await readBody(req)) || "{}");
      try {
        sendJson(res, 200, {
          ok: true,
          data: await renderCarousel({ topic_id: p.topic_id, theme: p.theme, profile: await loadProfile() }),
        });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: err.code ?? "ERR_CAR", message: err.message });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/publish-engine") {
      await handleEngine(req, res, {
        run: runPublishEngine,
        ErrorClass: PublishEngineError,
        buildArgs: (p) => [p],
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    sendJson(res, 500, { ok: false, code: "ERR_SERVER", message: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`MMGS local UI running at http://localhost:${PORT}`);
});
