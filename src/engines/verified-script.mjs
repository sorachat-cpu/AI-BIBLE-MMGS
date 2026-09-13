// WF8b §4 -- turn verified_details plus what the classifier actually saw into a Thai
// voiceover script, and refuse to ship one that claims anything else.
//
// The difference from `photo-narration-engine.mjs`'s script step is the input, not the
// prompt style: that one is handed a marketing caption and told to rewrite it freely.
// This one is handed a ranked set of sources and told the speakable facts are exactly
// their union -- nothing outside it.
//
// The ranking is deliberate and it puts the seller above the camera:
//
//   1. verified_details  - fields the seller filled in
//   2. caption           - the seller's own free text
//   3. what is in frame  - what the classifier could actually see
//
// Photographs under-report. A plot is rarely shot from every angle, and "not visible in
// any of the five uploaded photos" is not evidence of absence -- so a highlight the
// seller wrote down survives even when no picture backs it up, and on a conflict the
// seller wins, because they stood on the land and the camera only saw one side of it.
//
// What the gate still stops is the third source being promoted to the first: the model
// reasoning from a pole in frame to "the plot has power". That inference belongs to
// nobody -- not the seller, not the photograph -- and findForbiddenClaims() rejects it
// after generation. The prompt just makes passing that check the easy path.
import Anthropic from "@anthropic-ai/sdk";
import { findForbiddenClaims, verifiedFactsFor } from "../wf8b/verified.mjs";

const MODEL = process.env.VERIFIED_SCRIPT_MODEL ?? "claude-opus-5";

export class ScriptError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = "ScriptError";
    this.code = code;
    Object.assign(this, extra);
  }
}

const SYSTEM = `คุณเป็นนักเขียนบทพากย์วิดีโอขายที่ดินภาษาไทย

ลำดับความน่าเชื่อถือของข้อมูล (สำคัญที่สุด):
1. ข้อมูลที่ผู้ขายยืนยัน (verified_details) -- แม่นที่สุด ใช้ก่อนเสมอ
2. แคปชั่นของผู้ขาย -- เชื่อถือได้ ใช้เติมส่วนที่ verified_details ไม่มี
3. สิ่งที่เห็นในภาพ -- ใช้บรรยายบรรยากาศและรายละเอียดที่ตาเห็น

รูปถ่ายมักถ่ายมาไม่ครบทุกมุม สิ่งที่ไม่เห็นในภาพไม่ได้แปลว่าไม่มี
ถ้าแคปชั่นบอกไว้แต่ภาพไม่เห็น -> พูดตามแคปชั่นได้ ไม่ต้องตัดทิ้ง
ถ้าแคปชั่นกับภาพขัดกัน -> ยึดแคปชั่น (ผู้ขายอยู่หน้างาน กล้องไม่ได้เห็นทุกอย่าง)

กฎเหล็กข้อเดียวที่ห้ามฝ่าฝืน: ห้ามพูดสิ่งที่ "ไม่มีทั้งในแคปชั่นและไม่มีทั้งในภาพ"
ห้ามอนุมานเอาเองจากสิ่งที่เห็น เช่น
- เห็นเสาไฟในภาพ แต่แคปชั่นไม่ได้บอกเรื่องไฟฟ้า -> ห้ามพูดว่า "ไฟฟ้าเข้าถึงแล้ว"
  (บรรยายว่า "เห็นเสาไฟฟ้าอยู่ริมทาง" ได้)
- เห็นถนนในภาพ แต่แคปชั่นไม่ได้บอก -> ห้ามพูดว่า "ติดถนนสาธารณะ"
  (บรรยายว่า "เห็นถนนลาดยางด้านหน้า" ได้)
แต่ถ้าแคปชั่นบอกว่า "ติดถนนลาดยาง ไฟฟ้าเข้าถึง" -> พูดได้เลย เพราะผู้ขายยืนยันมาเอง

ห้ามใส่คำโฆษณาเกินจริงที่ไม่มีใครยืนยัน เช่น ทำเลทอง ห้ามพลาด ถูกที่สุด กำไรดี

วิธีพูด:
- สิ่งที่มาจากภาพ ขึ้นต้นว่า "จากภาพจะเห็น..." หรือ "บริเวณโดยรอบที่มองเห็น..."
- สิ่งที่มาจากแคปชั่นหรือข้อมูลผู้ขาย พูดตรงๆ ได้เลย ไม่ต้องอ้างภาพ

ใช้ ครับ หรือ ค่ะ ให้เหมือนกันทั้งคลิป เลือกอย่างใดอย่างหนึ่ง
ภาษาสุภาพ เป็นธรรมชาติ ไม่ต้องเร้าใจ`;

const SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clip_index: { type: "integer" },
          speak: { type: "string" },
        },
        required: ["clip_index", "speak"],
        additionalProperties: false,
      },
    },
    politeness: { type: "string", enum: ["ครับ", "ค่ะ"] },
  },
  required: ["lines", "politeness"],
  additionalProperties: false,
};

/**
 * WF8b §4 -- write the script.
 *
 * @param {object} input
 * @param {object} input.verified          verified_details as supplied by the seller
 * @param {Array}  input.selected          classifier rows for the chosen clips, in order
 * @param {string} [input.politeness]      "ครับ" | "ค่ะ"; the model picks if unset
 * @returns {{ lines, sentences, politeness, cost_usd, violations }}
 */
export async function writeVerifiedScript(input, options = {}) {
  const { verified = {}, selected = [], politeness, caption = "" } = input ?? {};
  if (!selected.length) throw new ScriptError("ERR_SCR_INPUT", "ยังไม่ได้เลือกรูปสำหรับทำคลิป");

  const apiKey = (options.env ?? process.env).ANTHROPIC_API_KEY;
  if (!apiKey) throw new ScriptError("ERR_SCR_ENV", "ไม่มี ANTHROPIC_API_KEY -- เขียนบทไม่ได้");

  const facts = verifiedFactsFor(verified);
  const cta = verified.contact_call_to_action?.trim()
    || "ทักข้อความเพื่อขอรายละเอียดและนัดดูที่ดิน";

  // Everything the model is allowed to draw on, stated as a closed list. Fields the
  // seller left blank simply do not appear -- WF8b §4 is explicit that a missing field is
  // deleted from the template, never filled with a plausible-sounding substitute.
  const factBlock = facts.length
    ? facts.map((f) => `- ${f.key}: ${f.value}`).join("\n")
    : "(ผู้ขายไม่ได้ยืนยันข้อมูลใดเลย -- ห้ามพูดถึงขนาด ราคา หรือทำเล)";

  const clipBlock = selected.map((c, i) => {
    const visible = c.visible?.length ? c.visible.map((v) => `    · ${v}`).join("\n") : "    · (ไม่มี)";
    const forbidden = c.unverified?.length ? c.unverified.join(" / ") : "(ไม่มี)";
    return `คลิปที่ ${i + 1} [${c.category}] ${c.name}\n  เห็นในภาพ:\n${visible}\n  ห้ามกล่าวอ้างจากรูปนี้: ${forbidden}`;
  }).join("\n\n");

  const captionText = String(caption ?? "").trim();
  const captionBlock = captionText
    ? `แคปชั่นของผู้ขาย (เชื่อถือได้ ใช้เติมส่วนที่ข้อมูลข้างบนไม่มี):\n"""\n${captionText}\n"""`
    : `แคปชั่นของผู้ขาย: (ไม่มี)`;

  const prompt = `ข้อมูลที่ผู้ขายยืนยันแล้ว (แม่นที่สุด ใช้ก่อน):
${factBlock}

${captionBlock}

ประโยคปิดท้ายที่ผู้ขายกำหนด (ต้องใช้ท่อนสุดท้าย):
${cta}

รูปที่เลือกมาทำคลิป ${selected.length} คลิป:

${clipBlock}

เขียนบทพากย์ ${selected.length} ท่อน ท่อนละ 1 คลิป ตามลำดับ
- รวมทั้งคลิปควรยาว 25-40 วินาที (ท่อนละประมาณ 5-8 วินาที)
- แต่ละท่อนอิงกับคลิปนั้นเป็นหลัก แต่สอดแทรกข้อมูลจากผู้ขาย/แคปชั่นได้ตามเหมาะสม
- จุดเด่นที่แคปชั่นบอกไว้แต่ไม่มีในรูปไหนเลย ให้ใส่ในท่อนที่เข้ากันที่สุด อย่าตัดทิ้ง
- ท่อนสุดท้ายต้องจบด้วยประโยคปิดท้ายข้างต้น
- อ่านตัวเลขเป็นคำเต็ม เช่น "2.6 ล้าน" -> "สองจุดหกล้านบาท"
- เบอร์โทรอ่านทีละหลัก เว้นวรรคทุกหลัก (0=ศูนย์ 1=หนึ่ง 2=สอง 3=สาม 4=สี่ 5=ห้า 6=หก 7=เจ็ด 8=แปด 9=เก้า)
${politeness ? `- ลงท้ายด้วย "${politeness}" ทุกท่อน` : ""}`;

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    if (/credit balance is too low/i.test(err.message)) {
      throw new ScriptError(
        "ERR_SCR_CREDIT",
        "เครดิต Anthropic API หมด -- เติมที่ console.anthropic.com > Plans & Billing แล้วลองใหม่"
      );
    }
    throw new ScriptError("ERR_SCR_API", `เรียกโมเดลเขียนบทไม่สำเร็จ: ${err.message}`);
  }

  if (response.stop_reason === "refusal") {
    throw new ScriptError("ERR_SCR_REFUSAL", "โมเดลปฏิเสธคำขอเขียนบทนี้");
  }

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ScriptError("ERR_SCR_PARSE", `อ่านบทที่โมเดลตอบไม่ได้: ${text.slice(0, 200)}`);
  }

  const rows = parsed?.lines;
  if (!Array.isArray(rows) || rows.length !== selected.length) {
    throw new ScriptError(
      "ERR_SCR_COUNT",
      `ได้บท ${rows?.length ?? 0} ท่อน แต่มี ${selected.length} คลิป`
    );
  }
  const sentences = selected.map((_, i) => {
    const row = rows.find((r) => Number(r?.clip_index) === i + 1) ?? rows[i];
    return String(row?.speak ?? "").trim();
  });
  if (sentences.some((s) => !s)) {
    throw new ScriptError("ERR_SCR_EMPTY", "มีท่อนที่โมเดลตอบมาว่าง");
  }

  // The gate. A script that asserts something nobody verified does not get returned with
  // a warning attached -- it is refused, because the caller's next step is to speak it
  // aloud over pictures of land someone is deciding whether to buy.
  const violations = findForbiddenClaims(sentences, verified, captionText);
  if (violations.length) {
    throw new ScriptError(
      "ERR_SCR_FORBIDDEN",
      `บทมีคำกล่าวอ้างที่ยืนยันไม่ได้ ${violations.length} จุด — ` +
        violations.map((v) => `"${v.why}"`).join(", "),
      { violations, sentences }
    );
  }

  const { input_tokens = 0, output_tokens = 0 } = response.usage ?? {};
  return {
    sentences,
    politeness: parsed.politeness ?? politeness ?? null,
    model: MODEL,
    violations: [],
    cost_usd: Number((input_tokens * 5e-6 + output_tokens * 25e-6).toFixed(4)),
  };
}
