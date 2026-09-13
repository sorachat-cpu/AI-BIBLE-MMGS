// WF8b §1 -- look at each uploaded photo and say what is actually visible in it.
//
// This is the step the old WF8 never had, and its absence is why that workflow could not
// honour a no-hallucination rule: `photo-narration-engine.mjs` writes its script from the
// caption alone and has never seen a single pixel. A model asked to describe a plot it
// cannot see has nothing to describe it FROM, so anything specific it says is invented.
//
// So the classifier's output is deliberately split in two, and the split is the whole
// point:
//
//   visible[]   - things a person could point at in the frame. These may be spoken.
//   unverified[] - things the picture hints at but does not establish (a road that runs
//                  off-frame, a pole in the distance, a boundary that is not marked).
//                  These may NOT be spoken, and are surfaced so the seller can confirm
//                  or deny them rather than having the system guess.
//
// WF8b's own examples are exactly this distinction: "เห็นถนนดินอยู่ด้านซ้ายของภาพ" is
// visible; "ที่ดินติดถนนสาธารณะ" is a legal claim the photograph cannot support.
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PHOTO_CATEGORIES, CAMERA_MOTIONS, motionForCategory } from "../wf8b/verified.mjs";

// Vision + a hard "do not infer" rule is the intelligence-sensitive part of this pipeline:
// the failure mode is not a clumsy sentence, it is a false claim about land someone is
// about to buy. Overridable for cost, but the default is the capable model on purpose.
const MODEL = process.env.PHOTO_CLASSIFIER_MODEL ?? "claude-opus-5";

const MEDIA_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export class ClassifierError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ClassifierError";
    this.code = code;
  }
}

const SYSTEM = `คุณเป็นผู้ช่วยตรวจรูปถ่ายที่ดินสำหรับทำวิดีโอขายอสังหาริมทรัพย์

กฎเหล็กที่สำคัญที่สุด: บรรยายเฉพาะสิ่งที่ "มองเห็นได้จริงในภาพ" เท่านั้น
ห้ามอนุมาน ห้ามเดา ห้ามสรุปสถานะทางกฎหมายหรือสาธารณูปโภคจากสิ่งที่เห็น

ตัวอย่างที่ถูกและผิด:
- เห็นถนนดินอยู่ด้านซ้ายของภาพ  ← ถูก (บรรยายสิ่งที่เห็น)
- ที่ดินติดถนนสาธารณะ            ← ผิด (อ้างสถานะทางกฎหมาย)
- เห็นเสาไฟฟ้าอยู่ไกลออกไป        ← ถูก
- ไฟฟ้าเข้าถึงที่ดินแล้ว          ← ผิด (อ้างสาธารณูปโภค)
- เห็นแนวภูเขาอยู่ฉากหลัง          ← ถูก
- ที่ดินมีวิวภูเขา                ← ผิด (ตีความว่าเป็นจุดขาย)

สิ่งที่เห็นไม่ชัด อ่านไม่ออก หรือเป็นการตีความ ให้ใส่ใน unverified ไม่ใช่ visible
รูปเบลอ ซ้ำ ไม่เกี่ยวข้อง หรืออาจทำให้คนดูเข้าใจผิดว่าเป็นพื้นที่ที่กำลังขาย
ให้จัดเป็น unclear_or_not_for_video`;

const SCHEMA = {
  type: "object",
  properties: {
    photos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          category: { type: "string", enum: PHOTO_CATEGORIES },
          viewpoint: {
            type: "string",
            enum: ["aerial", "ground"],
            description: "aerial = ถ่ายจากโดรน/มุมสูง, ground = ถ่ายระดับสายตา",
          },
          visible: {
            type: "array",
            items: { type: "string" },
            description: "สิ่งที่เห็นชัดในภาพ ภาษาไทย ขึ้นต้นด้วย 'เห็น'",
          },
          unverified: {
            type: "array",
            items: { type: "string" },
            description: "สิ่งที่ไม่ชัดหรือห้ามกล่าวอ้าง ภาษาไทย",
          },
          usable: { type: "boolean" },
          camera_motion: { type: "string", enum: CAMERA_MOTIONS },
          note: { type: "string" },
        },
        required: ["index", "category", "viewpoint", "visible", "unverified", "usable", "camera_motion", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["photos"],
  additionalProperties: false,
};

async function imageBlock(file) {
  const ext = path.extname(file).toLowerCase();
  const media_type = MEDIA_TYPES[ext];
  if (!media_type) {
    throw new ClassifierError("ERR_CLS_TYPE", `ไฟล์รูปชนิด ${ext || "(ไม่มีนามสกุล)"} ไม่รองรับ`);
  }
  const data = (await readFile(file)).toString("base64");
  return { type: "image", source: { type: "base64", media_type, data } };
}

/**
 * WF8b §1 -- classify every uploaded photo before any script is written.
 *
 * All photos go in ONE request rather than one request each. That is not only cheaper:
 * the spec's `unclear_or_not_for_video` class includes "ซ้ำ" (duplicate), and a model
 * looking at one photo in isolation cannot tell that it duplicates another.
 *
 * @param {string[]} photos  local file paths, in upload order
 * @returns {{ classified: Array, cost_usd: number }}
 */
export async function classifyPhotos(photos = [], options = {}) {
  if (!photos.length) throw new ClassifierError("ERR_CLS_INPUT", "ต้องมีรูปอย่างน้อยหนึ่งรูป");
  const apiKey = (options.env ?? process.env).ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClassifierError("ERR_CLS_ENV", "ไม่มี ANTHROPIC_API_KEY -- ตรวจรูปไม่ได้");

  const content = [];
  for (const [i, file] of photos.entries()) {
    // Label each image before its bytes: without an explicit index the model has to infer
    // ordering from position, and a mis-indexed result silently attaches one photo's
    // findings to a different photo.
    content.push({ type: "text", text: `รูปที่ ${i + 1} (${path.basename(file)}):` });
    content.push(await imageBlock(file));
  }
  content.push({
    type: "text",
    text:
      `ตรวจรูปทั้ง ${photos.length} รูปข้างต้น ตอบให้ครบทุกรูปตามลำดับ (index เริ่มที่ 1)\n` +
      `- category: เลือกจากรายการที่กำหนด\n` +
      `- viewpoint: aerial ถ้าถ่ายจากมุมสูง/โดรน, ground ถ้าถ่ายระดับสายตาหรือบนพื้น\n` +
      `- visible: สิ่งที่เห็นชัดจริงๆ (ถ้าไม่มีอะไรชัดเลยให้เป็น [])\n` +
      `- unverified: สิ่งที่ห้ามกล่าวอ้างจากรูปนี้\n` +
      `- usable: รูปนี้เอาไปทำวิดีโอได้ไหม (false ถ้าเบลอ ซ้ำ หรืออาจทำให้เข้าใจผิด)\n` +
      `- camera_motion: การเคลื่อนกล้องที่เหมาะกับรูปนี้ เลือกจากรายการที่กำหนด\n` +
      `- note: เหตุผลสั้นๆ ว่าทำไมจัดประเภทนี้`,
  });

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      // Structured outputs, so a malformed answer is impossible rather than parsed
      // defensively -- the old engine hand-stripped ```json fences off haiku's replies.
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    // An exhausted balance is the single most likely failure here and its raw form is an
    // English JSON blob about billing. Say what to do about it instead.
    if (/credit balance is too low/i.test(err.message)) {
      throw new ClassifierError(
        "ERR_CLS_CREDIT",
        "เครดิต Anthropic API หมด -- เติมที่ console.anthropic.com > Plans & Billing แล้วลองใหม่"
      );
    }
    throw new ClassifierError("ERR_CLS_API", `เรียกโมเดลตรวจรูปไม่สำเร็จ: ${err.message}`);
  }

  if (response.stop_reason === "refusal") {
    throw new ClassifierError("ERR_CLS_REFUSAL", "โมเดลปฏิเสธคำขอตรวจรูปนี้");
  }

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClassifierError("ERR_CLS_PARSE", `อ่านผลตรวจรูปไม่ได้: ${text.slice(0, 200)}`);
  }

  const rows = parsed?.photos;
  if (!Array.isArray(rows) || rows.length !== photos.length) {
    throw new ClassifierError(
      "ERR_CLS_COUNT",
      `ตรวจได้ ${rows?.length ?? 0} รูป แต่ส่งไป ${photos.length} รูป`
    );
  }

  const classified = photos.map((file, i) => {
    // Match on the model's own index rather than array position, and fall back to
    // position only if it is missing -- see the labelling note above.
    const row = rows.find((r) => Number(r?.index) === i + 1) ?? rows[i];
    const category = PHOTO_CATEGORIES.includes(row?.category) ? row.category : "unclear_or_not_for_video";
    return {
      file,
      name: path.basename(file),
      category,
      // A photo the model marked unusable is forced into the drop class regardless of
      // what category it also guessed, so downstream selection has one thing to check.
      usable: category !== "unclear_or_not_for_video" && row?.usable !== false,
      visible: Array.isArray(row?.visible) ? row.visible.filter(Boolean) : [],
      unverified: Array.isArray(row?.unverified) ? row.unverified.filter(Boolean) : [],
      // The viewpoint decides which cinematic move can honestly be applied later: an
      // orbit or a jib only makes sense from a photo that was already airborne.
      viewpoint: row?.viewpoint === "aerial" ? "aerial" : "ground",
      camera_motion: motionForCategory(category, row?.camera_motion),
      note: String(row?.note ?? ""),
    };
  });

  // Re-mark forced drops so `category` and `usable` can never disagree.
  for (const c of classified) {
    if (!c.usable) c.category = "unclear_or_not_for_video";
  }

  const { input_tokens = 0, output_tokens = 0 } = response.usage ?? {};
  return {
    classified,
    model: MODEL,
    cost_usd: Number((input_tokens * 5e-6 + output_tokens * 25e-6).toFixed(4)),
  };
}
