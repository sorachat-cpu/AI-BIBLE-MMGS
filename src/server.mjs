// Minimal local web UI for engines that are wired up so far.
// No framework -- plain node:http, single static page + one JSON endpoint per engine.
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPropertyEngine, PropertyEngineError } from "./engines/property-engine.mjs";
import { runGoogleEngine, GoogleEngineError } from "./engines/google-engine.mjs";
import { runVideoEngine, VideoEngineError } from "./engines/video-engine.mjs";
import { runHouseEngine, HouseEngineError } from "./engines/house-engine.mjs";
import { runStoryboard, StoryboardError } from "./engines/storyboard.mjs";
import { runWf3Ad, Wf3AdError } from "./engines/wf3-ad.mjs";
import { prepareFlowInputs, WfPrepareError } from "./wf/prepare.mjs";
import { runWfFinish, WfPipelineError } from "./wf/pipeline.mjs";
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
  hideDuplicates,
  buildGroupCaption,
  backfillPhotos,
} from "./content/listings.mjs";
import { renderCarousel } from "./engines/carousel-engine.mjs";
import {
  runLineBot,
  buildListingCardFlex,
  buildListingsCarouselFlex,
  buildCategoryMenuFlex,
  buildProvinceMenuFlex,
  buildAreaMenuFlex,
} from "./engines/line-bot-engine.mjs";
import { parseLocationTags } from "./lib/location-tags.mjs";
import {
  verifySignature as verifyLineSignature,
  reply as lineReply,
  push as linePush,
  broadcast as lineBroadcast,
} from "./publish/adapters/line.mjs";
import { TOPICS } from "./content/topics.mjs";
import { listKits } from "./publish/adapters/manual-kit.mjs";
import { systemStatus } from "./publish/status.mjs";
import { runPhotoNarration, PhotoNarrationError } from "./engines/photo-narration-engine.mjs";
import { classifyPhotos, ClassifierError } from "./engines/photo-classifier.mjs";
import { writeVerifiedScript } from "./engines/verified-script.mjs";
import { selectPhotosForVideo, CATEGORY_LABELS_TH } from "./wf8b/verified.mjs";
import { planClips, renderWf8bClips } from "./engines/wf8b-render.mjs";
import { cloneVoice, VoiceError, activeTtsBackend } from "./lib/voice.mjs";
import { OUTPUT_DIR, TEMP_DIR, ensureDirs } from "./lib/ffmpeg.mjs";
import { CONTENT_DIR } from "./content/store.mjs";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const MEDIA_DIR = path.join(CONTENT_DIR, "media");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

// Base64 image uploads make request bodies large; cap them so a stray huge file
// cannot exhaust memory. Single-image routes only need ~12MB (a 9MB source image,
// already above Kling's own limit), but WF8 posts up to 20 photos in one body, so the
// ceiling is sized for that set rather than for one picture.
const MAX_BODY_BYTES = 48 * 1024 * 1024;

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

// Runs after the webhook has already been ack'd (see the route below) -- LINE only cares
// that the POST got a fast 200, the actual reply to the customer goes out separately via
// the Reply API once Claude and the tool loop are done. A slow tool call here therefore
// cannot make LINE retry the webhook delivery.
async function handleLineEvents(rawBody) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return;
  }
  for (const event of payload.events ?? []) {
    try {
      if (event.type === "follow") {
        await lineReply({
          token,
          replyToken: event.replyToken,
          text: "สวัสดีค่ะ 🙏 ยินดีต้อนรับสู่ \"ติดดินบินโดรน\"",
          flex: buildCategoryMenuFlex(),
        });
        continue;
      }
      if (event.type !== "message" || event.message?.type !== "text") continue;

      // Not just for this one-time lookup (find ADMIN_LINE_USER_ID by reading it off a
      // real message) -- cheap and useful for ops going forward, since nothing else logs
      // which customer said what.
      console.log(`LINE message from ${event.source?.userId}: ${event.message.text.slice(0, 80)}`);

      // ---- tap-to-filter-by-location (เลือกทำเล) ------------------------------------
      //
      // Pure menu navigation, not a sales question, so it's handled here -- deterministic
      // and free -- instead of round-tripping through the Claude tool loop. Button text is
      // matched exactly against what buildProvinceMenuFlex/buildAreaMenuFlex actually put
      // on the buttons; a customer typing the same words by hand would just get the same
      // menu again, which is a harmless coincidence, not a bug.
      const tappedText = event.message.text.trim();
      // buildCategoryMenuFlex() otherwise only ever fires twice per customer -- once on
      // the one-time "follow" webhook event, once on their first real text turn
      // (runLineBot's isFirstTurn) -- so once someone has chatted at all, there was no way
      // back to that welcome card short of clearing their conversation history. This gives
      // everyone (a returning customer, or the admin re-testing the bot) a plain word that
      // always brings it back, handled deterministically here like the location-picker taps
      // below rather than round-tripping through the Claude tool loop.
      if (["เมนู", "เมนูหลัก", "หน้าหลัก"].includes(tappedText)) {
        await lineReply({
          token, replyToken: event.replyToken,
          text: "เลือกสิ่งที่ต้องการได้เลยค่ะ", flex: buildCategoryMenuFlex(),
        });
        continue;
      }
      if (tappedText === "เลือกทำเลที่ดิน") {
        const { items } = await loadListings();
        const active = items.filter((i) => i.status !== "HIDDEN");
        await lineReply({
          token, replyToken: event.replyToken,
          text: "เลือกจังหวัดที่สนใจได้เลยค่ะ", flex: buildProvinceMenuFlex(active),
        });
        continue;
      }
      const provinceTap = tappedText.match(/^ทำเลจังหวัด(.+)$/);
      if (provinceTap) {
        const { items } = await loadListings();
        const active = items.filter((i) => i.status !== "HIDDEN");
        await lineReply({
          token, replyToken: event.replyToken,
          text: `เลือกทำเลใน${provinceTap[1]}ได้เลยค่ะ`, flex: buildAreaMenuFlex(active, provinceTap[1]),
        });
        continue;
      }
      const areaTap = tappedText.match(/^ทำเลตำบล(.+)$/);
      if (areaTap) {
        const { items } = await loadListings();
        const active = items.filter((i) => i.status !== "HIDDEN");
        // Structured tag match, not a keyword search -- location-tags.mjs already folds
        // spelling variants ("พรหมณี"/"พรมมณี") into one canonical area name, so this
        // finds every listing the area button promised regardless of how the original
        // Facebook post spelled it.
        const matches = active.filter((i) => parseLocationTags(i.location).area === areaTap[1]);
        if (!matches.length) {
          await lineReply({
            token, replyToken: event.replyToken,
            text: `ตอนนี้ยังไม่มีแปลงในพื้นที่${areaTap[1]}ค่ะ ลองดูพื้นที่อื่นได้นะคะ`,
          });
        } else if (matches.length === 1) {
          await lineReply({
            token, replyToken: event.replyToken,
            text: `เจอ 1 แปลงในพื้นที่${areaTap[1]}ค่ะ`, flex: buildListingCardFlex(matches[0]),
          });
        } else {
          await lineReply({
            token, replyToken: event.replyToken,
            text: `เจอ ${matches.length} แปลงในพื้นที่${areaTap[1]}ค่ะ เลื่อนดูได้เลย`, flex: buildListingsCarouselFlex(matches),
          });
        }
        continue;
      }

      const { text: replyText, listingCard, listingsCarousel, isFirstTurn, adminNotifications } = await runLineBot({
        lineUserId: event.source?.userId,
        text: event.message.text,
        displayName: null,
      });
      // A committed single plot always wins over a browsing list -- see runLineBot's own
      // docstring for why these two are mutually exclusive. Falling all the way through
      // to the category menu on a first turn covers the very common real-world case the
      // one-time "follow" webhook event misses: a customer who added the OA days ago and
      // is only now typing their first message, long after follow already fired and went
      // nowhere -- this is that person's actual first look at the menu.
      const flex = listingCard
        ? buildListingCardFlex(listingCard)
        : listingsCarousel?.length
          ? buildListingsCarouselFlex(listingsCarousel)
          : isFirstTurn
            ? buildCategoryMenuFlex()
            : undefined;
      await lineReply({ token, replyToken: event.replyToken, text: replyText, flex });

      // Best-effort: an admin push failing (no ADMIN_LINE_USER_ID set yet, or a transient
      // LINE error) must never take down the reply the customer already got.
      if (adminNotifications?.length) {
        const adminId = process.env.ADMIN_LINE_USER_ID;
        if (adminId) {
          for (const text of adminNotifications) {
            await linePush({ token, to: adminId, text }).catch((err) =>
              console.error("Admin push notification failed:", err)
            );
          }
        } else {
          console.error("ADMIN_LINE_USER_ID not set -- dropped admin notification:", adminNotifications);
        }
      }
    } catch (err) {
      console.error("LINE event handling failed:", err);
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

    // Public host for re-hosted listing photos (src/cli/rehost-photos.mjs) -- Facebook's
    // own CDN URLs carry a signed expiry (~2 weeks) and every one of them had already died
    // by the time a customer looked at a LINE card, which is why this exists at all: LINE
    // needs a URL that never expires, and our own server is the simplest thing that is.
    if (req.method === "GET" && req.url.startsWith("/media/")) {
      const rel = decodeURIComponent(req.url.slice("/media/".length).split("?")[0]);
      const file = path.resolve(MEDIA_DIR, rel);
      if (!file.startsWith(MEDIA_DIR + path.sep)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
      try {
        const info = await stat(file);
        res.writeHead(200, {
          "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          "Content-Length": info.size,
          "Cache-Control": "public, max-age=31536000, immutable",
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

    // WF8 (WF8-photo-narration-voiceclone.md) -- photos + caption -> narrated clip.
    // Photos arrive as base64 because the browser has no path to hand over; the engine
    // works in file paths, so they are written to scratch first. Runs the whole WF8-lite
    // chain in one request (script -> voice -> Ken Burns -> render) rather than making
    // the page orchestrate it, since no step is independently useful to a user.
    if (req.method === "POST" && req.url === "/api/photo-narration") {
      try {
        const payload = JSON.parse((await readBody(req)) || "{}");
        const { property_id, photos = [], caption, aspect = "9:16", voice, voice_id, motion } = payload;
        if (!photos.length) throw new PhotoNarrationError("ERR_NARR_INPUT", "ต้องมีรูปอย่างน้อยหนึ่งรูป");

        await ensureDirs();
        const stamp = Date.now();
        const files = [];
        for (const [i, dataUri] of photos.entries()) {
          const b64 = String(dataUri).replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
          const file = path.join(TEMP_DIR, `wf8_${stamp}_${i}.jpg`);
          await writeFile(file, Buffer.from(b64, "base64"));
          files.push(file);
        }

        const pn = await runPhotoNarration({
          property_id, photos: files, caption, aspect, voice,
          voiceId: voice_id, motion,
        });
        const rendered = await runRenderEngine({
          property_id,
          clips: pn.clips,
          subtitles: pn.voice.cues,
          voiceover_file: pn.voice.file,
          aspects: [aspect],
        });
        sendJson(res, 200, {
          ok: true,
          data: {
            outputs: rendered.outputs,
            steps: rendered.steps,
            sentences: pn.sentences,
            subs: pn.subs,
            voice_seconds: pn.voice.duration,
            voice_backend: pn.voice.backend,
            voice_continuous: Boolean(pn.voice.continuous),
            cost_usd: pn.cost_usd,
          },
        });
      } catch (err) {
        sendJson(res, err.code ? 400 : 500, {
          ok: false,
          code: err.code ?? "ERR_SERVER",
          message: String(err.message || err),
        });
      }
      return;
    }

    // WF8 §8.2-8.4: upload a recording, get back a reusable voice id. Deliberately its own
    // endpoint rather than part of the render call -- a clone is worth doing once and
    // reusing for every later video, so the page holds onto the id it gets back.
    if (req.method === "POST" && req.url === "/api/voice-clone") {
      try {
        const p = JSON.parse((await readBody(req)) || "{}");
        if (!p.sample) throw new VoiceError("ต้องอัปโหลดไฟล์เสียงตัวอย่างก่อน");
        // Any media container works; cloneVoice() strips video and re-encodes.
        const b64 = String(p.sample).replace(/^data:[^;]+;base64,/, "");
        const result = await cloneVoice({
          sample: Buffer.from(b64, "base64"),
          filename: p.filename ?? "sample.mp3",
          name: p.name,
        });
        sendJson(res, 200, { ok: true, data: result });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: "ERR_VOICE_CLONE", message: String(err.message || err) });
      }
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

    // 3-WF console: prepare the plates + prompts Google Flow needs, then finish and join
    // what Flow produced. See wf/README.md.
    if (req.method === "POST" && req.url === "/api/wf/prepare") {
      await handleEngine(req, res, {
        run: prepareFlowInputs,
        ErrorClass: WfPrepareError,
        buildArgs: (p) => [p],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/wf/finish") {
      await handleEngine(req, res, {
        run: runWfFinish,
        ErrorClass: WfPipelineError,
        buildArgs: (p) => [p],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/wf3-ad") {
      await handleEngine(req, res, {
        run: runWf3Ad,
        ErrorClass: Wf3AdError,
        buildArgs: (p) => [p],
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

    if (req.method === "POST" && req.url === "/api/line/webhook") {
      const rawBody = await readBody(req);
      const ok = verifyLineSignature({
        channelSecret: process.env.LINE_CHANNEL_SECRET,
        rawBody,
        signatureHeader: req.headers["x-line-signature"],
      });
      if (!ok) {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("invalid signature");
        return;
      }
      // Ack first (see handleLineEvents for why), then run the bot without blocking the response.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      handleLineEvents(rawBody).catch((err) => console.error("LINE webhook handling failed:", err));
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

    if (req.method === "GET" && (req.url === "/narrate" || req.url === "/narrate.html")) {
      const html = await readFile(path.join(PUBLIC_DIR, "narrate.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && req.url === "/publish" ) {
      const html = await readFile(path.join(PUBLIC_DIR, "publish.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && (req.url === "/library" || req.url === "/library.html")) {
      const html = await readFile(path.join(PUBLIC_DIR, "library.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && (req.url === "/wf8b" || req.url === "/wf8b.html")) {
      const html = await readFile(path.join(PUBLIC_DIR, "wf8b.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // WF8b is deliberately TWO endpoints rather than one. §5 makes script approval a
    // gate, and a gate only exists if the machine stops there -- classify returns and
    // waits for a person to look at the table before anything writes a claim about the
    // land. Collapsing these into one call would make the approval step advisory.
    if (req.method === "POST" && req.url === "/api/wf8b/classify") {
      try {
        const p = JSON.parse((await readBody(req)) || "{}");
        const uploads = p.photos ?? [];
        if (!uploads.length) throw new ClassifierError("ERR_CLS_INPUT", "ต้องมีรูปอย่างน้อยหนึ่งรูป");

        await ensureDirs();
        const stamp = Date.now();
        const files = [];
        for (const [i, dataUri] of uploads.entries()) {
          const match = /^data:image\/([a-zA-Z+]+);base64,/.exec(String(dataUri));
          // The extension drives the media_type the classifier sends to the API, so it
          // comes from the declared MIME rather than from a client-supplied filename.
          const ext = match ? `.${match[1].replace("jpeg", "jpg")}` : ".jpg";
          const file = path.join(TEMP_DIR, `wf8b_${stamp}_${i}${ext}`);
          await writeFile(file, Buffer.from(String(dataUri).replace(/^data:[^;]+;base64,/, ""), "base64"));
          files.push(file);
        }

        const { classified, cost_usd, model } = await classifyPhotos(files);
        // Attach the browser's own ordering index so the page can show each result next
        // to the thumbnail the user actually uploaded, and the Thai label so the category
        // vocabulary has one definition rather than a copy in the page.
        const withIndex = classified.map((c, i) => ({
          ...c,
          upload_index: i,
          category_label: CATEGORY_LABELS_TH[c.category] ?? c.category,
        }));
        const { selected, dropped, warning } = selectPhotosForVideo(withIndex);
        sendJson(res, 200, {
          ok: true,
          data: { classified: withIndex, selected, dropped, warning, cost_usd, model },
        });
      } catch (err) {
        sendJson(res, err.code ? 400 : 500, {
          ok: false,
          code: err.code ?? "ERR_SERVER",
          message: String(err.message || err),
        });
      }
      return;
    }

    // Free: price the run and name the moves before any credit is spent. At $0.16 a clip
    // a six-photo reel is ~$1, which is worth showing someone in advance.
    if (req.method === "POST" && req.url === "/api/wf8b/plan") {
      try {
        const p = JSON.parse((await readBody(req)) || "{}");
        sendJson(res, 200, { ok: true, data: planClips(p.selected ?? [], p.style ?? "preserve") });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: "ERR_W8R_PLAN", message: String(err.message || err) });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/wf8b/render") {
      try {
        const p = JSON.parse((await readBody(req)) || "{}");
        // Unlike /script, this route DOES open each `file`, and `selected` round-trips
        // through the browser -- so a caller could name any path on disk and have its
        // bytes posted to a third-party video API. Confine reads to the scratch directory
        // the classify step wrote into.
        const selected = (p.selected ?? []).map((row) => {
          const file = path.resolve(String(row?.file ?? ""));
          if (!file.startsWith(TEMP_DIR + path.sep)) {
            throw Object.assign(new Error("ไฟล์รูปไม่ถูกต้อง -- ต้องมาจากขั้นตรวจรูป"), {
              code: "ERR_W8R_PATH",
            });
          }
          return { ...row, file };
        });

        const data = await renderWf8bClips({
          property_id: p.property_id || "PROP-TH-01029",
          selected,
          style: p.style ?? "preserve",
          aspect: p.aspect ?? "9:16",
        });
        sendJson(res, 200, {
          ok: true,
          data: { ...data, url: `/output/${path.basename(data.file)}` },
        });
      } catch (err) {
        sendJson(res, err.code ? 400 : 500, {
          ok: false,
          code: err.code ?? "ERR_SERVER",
          message: String(err.message || err),
          built: err.built ?? 0,
          spent: err.spent ?? 0,
        });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/api/wf8b/script") {
      try {
        const p = JSON.parse((await readBody(req)) || "{}");
        // `selected` comes back from the client, but nothing here opens a file from it --
        // writeVerifiedScript reads only name/category/visible/unverified -- so a tampered
        // path is inert rather than a traversal.
        const data = await writeVerifiedScript({
          verified: p.verified ?? {},
          caption: p.caption ?? "",
          selected: p.selected ?? [],
          politeness: p.politeness,
        });
        sendJson(res, 200, { ok: true, data });
      } catch (err) {
        sendJson(res, err.code ? 400 : 500, {
          ok: false,
          code: err.code ?? "ERR_SERVER",
          message: String(err.message || err),
          // The rejected lines are the useful part of a gate failure: they show what was
          // claimed and let the seller decide whether it belongs in the caption.
          violations: err.violations ?? [],
          sentences: err.sentences ?? [],
        });
      }
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
      // province/area are derived, not stored -- location-tags.mjs is the single place
      // that turns the free-text `location` sellers typed into two clean filter tags, so
      // the library page and the LINE province/area tap menu can never drift apart.
      const tagged = items.map((i) => ({ ...i, ...parseLocationTags(i.location) }));
      sendJson(res, 200, { ok: true, data: { items: tagged, topics: TOPICS.map((t) => ({ id: t.id, title: t.title.join(" "), points: t.points.length })) } });
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

    if (req.method === "POST" && req.url === "/api/listings/dedupe") {
      sendJson(res, 200, { ok: true, data: await hideDuplicates() });
      return;
    }

    // Fixes stale/missing listing photos in place. Runs against WHATEVER content/ this
    // process sees -- calling this on the deployed host is the point: production's
    // listings.json lives on its own persistent volume, never this machine's local copy,
    // so a local run of the equivalent CLI script (src/cli/rehost-photos.mjs) cannot touch
    // the photos real customers actually see. See backfillPhotos() in content/listings.mjs.
    if (req.method === "POST" && req.url === "/api/listings/rehost-photos") {
      try {
        sendJson(res, 200, { ok: true, data: await backfillPhotos() });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: "ERR_LISTING", message: err.message });
      }
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

    // Broadcast ONE chosen plot to the LINE OA's followers, outside the daily queue.
    // The queue rotates plots on a fixed cycle (22_DAILY_WORKFLOW.md); this is the
    // manual override for "push this specific one now" -- a price cut, a plot about to
    // close. Costs LINE message quota per follower, so it is never automatic.
    if (req.method === "POST" && req.url === "/api/listings/line-push") {
      const p = JSON.parse((await readBody(req)) || "{}");
      const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!token) {
        sendJson(res, 400, { ok: false, code: "ERR_PUB_03", message: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN" });
        return;
      }
      const { items } = await loadListings();
      const listing = items.find((i) => i.listing_id === p.id);
      if (!listing) {
        sendJson(res, 404, { ok: false, code: "ERR_LISTING", message: `ไม่พบแปลง ${p.id}` });
        return;
      }
      try {
        // LINE fetches media over https and rejects anything else, so a photo that was
        // never rehosted (still a dead Facebook CDN url) is dropped rather than sent --
        // a broken image would fail the whole message.
        const imageUrl = /^https:\/\//.test(listing.photo_url ?? "") ? listing.photo_url : undefined;
        const result = await lineBroadcast({
          token,
          caption: p.caption ?? listing.caption ?? buildGroupCaption(listing, { profile: await loadProfile() }),
          imageUrl,
        });
        await patchListing(listing.listing_id, { last_line_push: new Date().toISOString().slice(0, 10) }, {});
        sendJson(res, 200, { ok: true, data: { ...result, image_sent: Boolean(imageUrl) } });
      } catch (err) {
        sendJson(res, 400, { ok: false, code: err.code ?? "ERR_PUB_04", message: err.message });
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
