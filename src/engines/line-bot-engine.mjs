// LINE OA conversational bot -- the "ถามตอบ + tool" system from 23_PAGE_STUDIO.md §3.6.
//
// Claude runs a tool-use loop per incoming message: it can look up real listings, run
// the land-tax calculator, save a customer's contact details, or log a viewing request.
// Nothing here invents a price, a plot, or legal advice -- every number the customer sees
// either comes straight out of content/listings.json or out of calculateTransferCosts().
//
// Conversation memory is short-term and per LINE user id (conversations.mjs). Only the
// final text of each turn is persisted, not the tool_use/tool_result blocks in between --
// those are local to one Claude round-trip and would bloat the saved history for no
// benefit next turn.
import Anthropic from "@anthropic-ai/sdk";
import { calculateTransferCosts } from "../lib/land-tax.mjs";
import { checkLocation } from "./google-engine.mjs";
import { loadListings } from "../content/listings.mjs";
import { tallyProvinces, tallyAreas, stripAdminPrefixes } from "../lib/location-tags.mjs";
import { upsertCustomer } from "../content/customers.mjs";
import { createAppointment } from "../content/appointments.mjs";
import { getHistory, appendTurn } from "../content/conversations.mjs";

const MODEL = process.env.LINE_BOT_MODEL ?? "claude-haiku-4-5-20251001";
const MAX_TOOL_ROUNDS = 6;
// LINE's own carousel hard cap is 12 bubbles; this stays a little under that. Search
// results and the carousel builder share this one number on purpose -- a search capped
// lower than what the carousel can show is just throwing away real matches the library
// actually had, which is what was happening at 5 with a 72-listing library.
const SEARCH_RESULT_LIMIT = 10;

const OFFICIAL_CONTACT = "094-887-4343 (คุณพลอย) หรือ 096-321-6888 (คุณซุง)";
// Verified permalink -- see 20_ROADMAP.md's notes on the numeric-page-id switch (the old
// id 301-suffix pattern 404s for anyone not logged in as the page admin; this one is the
// one confirmed to return HTTP 200 logged out).
export const FACEBOOK_PAGE_URL = "https://www.facebook.com/122123974208736301";

// Built fresh per call, not a static string: a model has no innate sense of "today", and
// a test run surfaced exactly what goes wrong without this -- asked to book "20 สิงหาคม
// นี้" (August 20 this year) on 2026-08-12, it wrote back 2024-08-20. For a feature whose
// whole point is a viewing appointment landing on the right day, a silently-wrong year is
// worse than no calendar integration at all.
function buildSystemPrompt() {
  const today = new Date().toLocaleDateString("th-TH-u-ca-gregory", {
    year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Bangkok",
  });
  const isoToday = new Date().toISOString().slice(0, 10);
  return `คุณคือหัวหน้าเซลตัวจริงของเพจ "ติดดินบินโดรน" ขายที่ดินโซนนครนายก/ปราจีนบุรี ตอบผ่าน LINE OA เก่ง ใจเย็น จริงใจ และมองหาทางออกให้ลูกค้าเสมอ — ไม่ปล่อยให้ลูกค้าจบการสนทนาแบบมือเปล่าถ้ายังพอมีทางไปต่อได้

วันนี้คือ ${today} (${isoToday}) — ใช้วันนี้เป็นฐานเสมอเวลาลูกค้าพูดถึงวันแบบอ้างอิง เช่น "พรุ่งนี้" "เสาร์นี้" "20 สิงหาคมนี้" ห้ามเดาปี ห้ามใช้ปีจากความจำ ให้คำนวณจากวันนี้เท่านั้น แล้วส่ง date ให้ tool เป็นรูปแบบ YYYY-MM-DD ที่ตรงปีจริง

หน้าที่ของคุณ:
1. ตอบคำถามทั่วไปเรื่องที่ดิน/ทำเล/ขั้นตอนซื้อขาย ด้วยความรู้ทั่วไป ไม่เดาข้อมูลแปลงที่ไม่มีจริง
2. "เลือกชมที่" — ถ้าลูกค้าบอกงบ/ทำเล/จุดเด่นที่สนใจ ใช้ search_listings ค้นจากคลังจริงเท่านั้น ห้ามแต่งแปลงขึ้นมาเอง แยกแต่ละเงื่อนไขเป็นสมาชิกของ keywords (ห้ามยัดรวมเป็นข้อความยาวข้อเดียว) — ใส่แค่ชื่อสถานที่ล้วนๆ เช่น "หินตั้ง" ไม่ต้องเติมคำนำหน้า "ตำบล/อำเภอ/จังหวัด" ไปด้วยก็ได้ ระบบ match ให้เองไม่ว่าจะใส่คำนำหน้ามาหรือไม่ ผลที่ได้เรียงตรงเงื่อนไขมากสุดก่อนแต่ไม่ต้องตรงครบทุกข้อ — ถ้าเจอผลลัพธ์ (แม้ตรงแค่บางเงื่อนไข) ให้บอกว่าเจอกี่แปลงแล้วบอกด้วยว่าแปลงไหนตรงเงื่อนไขไหนบ้างสั้นๆ เผื่อลูกค้าจะได้รู้ว่าทำไมถึงแนะนำมา — ถ้าค้นครั้งแรกไม่เจอเลยสักแปลง ให้ลองผ่อนเงื่อนไขแล้วค้นซ้ำอีกครั้งก่อนสรุป เช่น ตัดคำที่เจาะจงเกินไปออกหนึ่งคำ หรือขยายงบขึ้น/ลง แล้วชวนลูกค้าเลือกทางเลือกใกล้เคียงที่สุดที่มีจริงพร้อมบอกตรงๆ ว่าไม่ตรงเป๊ะกับที่ขอ ต่อเมื่อลองแล้วยังไม่เจอจริงๆ ถึงจะบอกตรงๆ ว่าตอนนี้ยังไม่มีแปลงตรงเงื่อนไข พร้อมชวนแนวทางถัดไปเสมอ (เช่น ปรับงบ/ทำเล หรือฝากเบอร์ไว้ให้ทีมหาให้เพิ่ม) — ห้ามตอบจบด้วยคำว่า "ไม่มี" ลอยๆ โดยไม่เสนอทางต่อ — ผลลัพธ์จะโชว์เป็นการ์ดรูปเลื่อนดูได้ให้ลูกค้าอยู่แล้วโดยอัตโนมัติ **ห้ามพิมพ์รายชื่อ/รายละเอียดแปลงซ้ำเป็นข้อความยาวๆ** แค่ตอบสั้นๆ แล้วให้เลื่อนดูการ์ดต่อได้เลย
3. "คำนวณค่าโอน/ภาษี" — ใช้ calculate_transfer_cost ทุกครั้งที่ลูกค้าถามเรื่องนี้ ห้ามคำนวณเองในหัว ตอบพร้อมย้ำเสมอว่าเป็นประมาณการ ไม่ใช่คำแนะนำทางกฎหมาย ให้ยืนยันกับสำนักงานที่ดินอีกครั้ง
4. "ฝากขาย" (ลูกค้าอยากฝากขายที่ดินของตัวเอง) และ "ขายฝาก" (ลูกค้าถามเรื่องขายฝาก/มีเรื่องขายฝาก) — รับฟังรายละเอียดคร่าวๆ แล้วเก็บชื่อ-เบอร์ด้วย save_customer_info เสมอ พร้อมบอกว่าทีมจะติดต่อกลับ อย่าลงรายละเอียดสัญญาขายฝากเชิงกฎหมายเอง เพราะมีเงื่อนไขเฉพาะรายที่ต้องคุยกับทีมจริง
5. ทุกครั้งที่ลูกค้าสนใจแปลงใดแปลงหนึ่งจริงจัง หรือขอให้ติดต่อกลับ ให้ถามชื่อกับเบอร์โทร แล้วบันทึกด้วย save_customer_info ทันที (ห้ามลืม ไม่งั้นทีมติดต่อกลับไม่ได้)
6. ทันทีที่ลูกค้าให้วันที่ (ไม่ว่าจะเจาะจงแปลงหรือไม่) สำหรับนัดชมพื้นที่ ต้องเรียก request_appointment เสมอ ห้ามแค่จดวันนัดไว้ในโน้ตของ save_customer_info เพราะจะไม่เข้าตารางนัดหมายจริง ถ้ายังไม่รู้เวลาให้ถามก่อน แต่ถ้ารู้วันที่แล้วเรียกได้เลยแม้เวลายังไม่ชัด แล้วบอกลูกค้าว่าทีมจะโทรยืนยันอีกครั้ง (ระบบยังไม่ผูกปฏิทินอัตโนมัติ)
7. "เช็คทำเล" — ถ้าลูกค้าส่งที่อยู่ ลิงก์ Google Maps หรือพิกัดมา (ของแปลงที่เราขาย หรือทำเลอื่นที่ลูกค้าอยากเทียบ) ใช้ check_location เพื่อดึงพิกัดจริงและสถานที่ใกล้เคียงจริง ห้ามเดาว่าใกล้อะไร
8. ถ้าลูกค้าอยากคุยกับคนจริงทันที (ลูกค้าขอเองตรงๆ ไม่ใช่เพราะคุณตอบไม่ได้) ให้เบอร์ ${OFFICIAL_CONTACT}
9. "โชว์การ์ดแปลง" — ทันทีที่ลูกค้าโฟกัสอยู่ที่แปลงเดียวจริงๆ (เลือกจากผลค้นหาแล้ว, พิมพ์รหัส/ชื่อแปลงที่สนใจ, หรือบอกว่าสนใจ/เอาแปลงที่เพิ่งแนะนำไป แม้ search_listings จะคืนมาแค่แปลงเดียวก็ตาม) ให้เรียก show_listing_card ด้วย listing_id ของแปลงนั้นหนึ่งครั้ง เพื่อให้ลูกค้าเห็นรายละเอียดพร้อมปุ่มกดชัดๆ ห้ามเรียกก่อนลูกค้าเลือกแปลง เช่น ตอนแค่ถามข้อมูลทั่วไปหรือกำลังดูหลายแปลงเทียบกัน และห้ามเรียกเกินหนึ่งครั้งต่อคำตอบเดียว
10. ถ้าลูกค้าถามสิ่งที่คุณตอบไม่ได้จริงๆ ด้วยความรู้ทั่วไปหรือ tool ที่มี (เช่น ต่อรองราคา/เงื่อนไขผ่อนนอกเหนือจากที่ประกาศ, เงื่อนไขสัญญาเฉพาะเจาะจง, คำถามกฎหมาย/สำรวจที่ดินที่ซับซ้อนเกินไป) **ต้องเรียก escalate_to_admin เสมอ** เพื่อแจ้งเตือนแอดมินตัวจริงทันที ห้ามแค่ให้เบอร์ติดต่อแล้วจบโดยไม่เรียก tool นี้ เพราะแอดมินจะไม่รู้เลยว่ามีลูกค้าติดค้างเรื่องอะไรอยู่ — จะให้เบอร์ติดต่อเสริมไปด้วยก็ได้ แต่ escalate_to_admin ต้องเรียกเสมอในกรณีนี้ ห้ามเดาคำตอบเอง

กติกาการตอบ: ใช้ภาษาไทย โทนเป็นกันเองสุภาพเหมือนแอดมินเพจที่ใส่ใจลูกค้าจริงๆ ไม่ใช่บอทตอบขอไปที — ตอบสั้นกระชับแบบแชท (ไม่ยาวเป็นพารากราฟ ไม่ใส่ markdown หนา/หัวข้อ เพราะ LINE ไม่แสดงผล) แต่ "สั้น" ต้องไม่ใช่ "ห้วน": ทุกคำตอบควรจบด้วยการชวนคุยต่อหรือเสนอทางที่ไปต่อได้ (คำถามกลับ/ตัวเลือกถัดไป/ชวนดูการ์ด) ไม่ใช่ทิ้งประโยคลอยๆ ให้ลูกค้าเงียบไปเอง`;
}

const TOOLS = [
  {
    name: "search_listings",
    description: "ค้นหาที่ดินที่มีขายจริงตอนนี้ จากงบประมาณ/ทำเล/จุดเด่น คืนสูงสุด 10 แปลง เรียงแปลงที่ตรงเงื่อนไขมากที่สุดขึ้นก่อน — ไม่ต้องตรงทุกข้อ ถ้าลูกค้าให้มาหลายอย่าง (เช่น ทำเล + จุดเด่น) แปลงที่ตรงแค่บางข้อก็ยังคืนมาให้เห็น ไม่ใช่คืนว่างเปล่าเพราะไม่ตรงครบ",
    input_schema: {
      type: "object",
      properties: {
        max_budget_thb: { type: "number", description: "งบสูงสุด (บาท) ถ้าลูกค้าให้มา — ข้อนี้เข้มงวด ไม่คืนแปลงที่เกินงบ" },
        min_budget_thb: { type: "number", description: "งบต่ำสุด (บาท) ถ้าลูกค้าให้มา" },
        keywords: {
          type: "array", items: { type: "string" },
          description: "ทำเล/ชื่อตำบล/จุดเด่นแยกเป็นข้อๆ เช่น ลูกค้าพูด 'อยากได้ติดน้ำ ใกล้เขาใหญ่ ไม่เกิน 2 ล้าน' ให้ส่ง [\"ติดน้ำ\", \"เขาใหญ่\"] (งบใส่ใน max_budget_thb แยกต่างหาก) อย่ารวมทุกอย่างเป็นสตริงเดียว เพราะจะไม่ match อะไรเลย",
        },
      },
    },
  },
  {
    name: "calculate_transfer_cost",
    description: "คำนวณค่าใช้จ่ายวันโอนที่ดิน (ค่าโอน/จำนอง/อากรแสตมป์-ภาษีธุรกิจเฉพาะ/ภาษีหัก ณ ที่จ่าย)",
    input_schema: {
      type: "object",
      properties: {
        appraised_value: { type: "number", description: "ราคาประเมินราชการ หรือราคาซื้อขายถ้าไม่รู้ราคาประเมิน" },
        sale_price: { type: "number", description: "ราคาซื้อขายจริง ถ้าสูงกว่าราคาประเมิน" },
        years_held: { type: "number", description: "จำนวนปีที่ผู้ขายถือครองที่ดินมา" },
        has_structure: { type: "boolean", description: "มีบ้าน/สิ่งปลูกสร้างบนที่ดินไหม (ที่ดินเปล่า = false)" },
      },
      required: ["appraised_value", "years_held"],
    },
  },
  {
    name: "save_customer_info",
    description: "บันทึกชื่อ/เบอร์โทร/แปลงที่สนใจของลูกค้า เพื่อให้ทีมติดต่อกลับ",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        interested_listing_id: { type: "string", description: "listing_id จาก search_listings ถ้ามี" },
        note: { type: "string", description: "รายละเอียดเพิ่มเติม เช่น รายละเอียดที่ดินที่จะฝากขาย" },
      },
    },
  },
  {
    name: "check_location",
    description: "เช็คทำเลจริงจากที่อยู่/ลิงก์ Google Maps/พิกัด คืนพิกัดจริงและสถานที่ใกล้เคียงจริง (โรงพยาบาล ตลาด โรงเรียน ฯลฯ)",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "ที่อยู่ ลิงก์ Google Maps หรือพิกัด lat,lng ที่ลูกค้าส่งมา" },
      },
      required: ["location"],
    },
  },
  {
    name: "show_listing_card",
    description: "แสดงการ์ดรายละเอียดแปลงพร้อมปุ่มกด (นัดชม/คำนวณค่าโอน/คุยแอดมิน) ให้ลูกค้าเห็นชัดๆ ใช้เมื่อลูกค้าเลือกแล้วว่าสนใจแปลงไหนแปลงหนึ่งจริงๆ เท่านั้น ห้ามใช้ตอนลูกค้ายังเลือกไม่ได้หรือกำลังเทียบหลายแปลง",
    input_schema: {
      type: "object",
      properties: {
        listing_id: { type: "string", description: "listing_id จาก search_listings ที่ลูกค้าเลือก" },
      },
      required: ["listing_id"],
    },
  },
  {
    name: "request_appointment",
    description: "บันทึกคำขอนัดชมพื้นที่ วันที่และเวลาที่ลูกค้าสะดวก ถ้าลูกค้าบอกชื่อ/เบอร์มาพร้อมกันในข้อความเดียวกัน ให้ใส่ name/phone มาด้วยเลย ไม่ต้องรอเรียก save_customer_info แยก",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "วันที่นัด รูปแบบ YYYY-MM-DD" },
        time: { type: "string", description: "ช่วงเวลาที่สะดวก เช่น 'บ่าย 2 โมง'" },
        listing_id: { type: "string" },
        name: { type: "string", description: "ชื่อลูกค้า ถ้าให้มาในข้อความเดียวกับการนัด" },
        phone: { type: "string", description: "เบอร์โทรลูกค้า ถ้าให้มาในข้อความเดียวกับการนัด" },
        note: { type: "string" },
      },
      required: ["date"],
    },
  },
  {
    name: "escalate_to_admin",
    description: "แจ้งแอดมินตัวจริงทันทีเมื่อลูกค้าถามสิ่งที่คุณตอบไม่ได้จริงๆ ด้วยข้อมูล/tool ที่มีอยู่ (เช่น ต่อรองราคานอกเหนือประกาศ, เงื่อนไขสัญญาเฉพาะเจาะจง, คำถามกฎหมาย/สำรวจที่ดินที่ซับซ้อน) ไม่ใช่ทางลัดแทนการค้นด้วย search_listings/calculate_transfer_cost/check_location",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "คำถามหรือสิ่งที่ลูกค้าต้องการ สรุปสั้นๆ" },
        note: { type: "string", description: "บริบทเพิ่มเติมที่แอดมินควรรู้ก่อนตอบ" },
      },
      required: ["question"],
    },
  },
];

/** Pure filter/shape step, split out from the I/O so it can be unit tested without disk access. */
/**
 * Budget stays a hard filter (recommending something 3x over what someone can spend isn't
 * useful), but feature/location terms are OR'd and ranked, not AND'd. A customer giving
 * three specs at once ("ติดน้ำ ใกล้เขาใหญ่ งบ 2 ล้าน") and getting zero results back
 * because no single listing has all three is a worse outcome than seeing the plots that
 * match at least one, ranked by how many they match -- "ตอบมั่ว" (the model improvising
 * when the strict search came up empty) is the actual failure mode this replaces.
 */
export function filterListings(items, { max_budget_thb, min_budget_thb, keyword, keywords } = {}) {
  // Normalized with stripAdminPrefixes on both sides: a customer's own words ("ตำบลหินตั้ง")
  // and the raw post text ("หินตั้ง เมือง นครนายก", no "ตำบล" in it) must meet in the middle,
  // or a real in-stock plot silently fails a plain substring match on the customer's exact
  // search term -- this is what "หาตำบลหินตั้งไม่เจอ" turned out to be.
  const terms = (keywords?.length ? keywords : keyword ? [keyword] : [])
    .map((k) => stripAdminPrefixes(String(k ?? "")).toLowerCase())
    .filter(Boolean);

  const scored = [];
  for (const l of items) {
    if (["SOLD", "HIDDEN"].includes(l.status)) continue;
    if (max_budget_thb && l.price_thb > max_budget_thb) continue;
    if (min_budget_thb && l.price_thb < min_budget_thb) continue;

    if (terms.length === 0) {
      scored.push({ listing: l, score: 0 });
      continue;
    }
    const haystack = stripAdminPrefixes(`${l.title ?? ""} ${l.location ?? ""} ${(l.highlights ?? []).join(" ")}`).toLowerCase();
    const score = terms.filter((t) => haystack.includes(t)).length;
    if (score > 0) scored.push({ listing: l, score });
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, SEARCH_RESULT_LIMIT).map(({ listing: l }) => ({
    listing_id: l.listing_id,
    title: l.title,
    price_text: l.price_text,
    price_thb: l.price_thb,
    location: l.location,
    highlights: (l.highlights ?? []).slice(0, 3),
    maps_url: l.maps_url ?? null,
  }));
}

async function toolSearchListings(ctx, filters = {}) {
  const { items } = await loadListings();
  const results = filterListings(items, filters);
  // Browsing itself (unlike show_listing_card, which needs an explicit customer commitment
  // to one plot) is safe to surface immediately -- the carousel IS the "what do I pick
  // from" surface the search exists to answer. Enriched with photo_url/source_post_url
  // here rather than in filterListings(), which stays the lean, model-facing shape.
  if (results.length) {
    const byId = new Map(items.map((l) => [l.listing_id, l]));
    ctx.presentedListings = results.map((r) => ({
      ...r,
      photo_url: byId.get(r.listing_id)?.photo_url ?? null,
      source_post_url: byId.get(r.listing_id)?.source_post_url ?? null,
    }));
  }
  return results;
}

// A single white-and-gold palette -- the day/night auto-switch this replaced tested fine
// but read wrong in practice ("คู่สีไม่เวิร์ค"), so this drops the switching entirely
// rather than tuning it further. White ground, the same brand gold used everywhere else
// (templates/ending-card.svg, location-card.svg) as the one accent -- consistent with the
// rest of the brand without needing a second palette to keep in sync.
const PALETTE = {
  cardBg: "#FFFFFF",
  title: "#241A0F",
  accent: "#E0A05C",
  muted: "#6B5D4A",
  mutedSoft: "#8A7A63",
  separator: "#EEE3D3",
  buttonBorder: "#D8C7A8",
};

/**
 * Pure Flex Message builder -- no I/O, so it's unit-testable the same way filterListings
 * is. Renders as a full-width card with real buttons (LINE's Flex Message), not the tiny
 * Quick Reply chips -- that's the whole point of this over the old always-on button row.
 */
export function buildListingCardFlex(listing) {
  const palette = PALETTE;
  const priceText = listing.price_text
    ?? (listing.price_thb != null ? `${Number(listing.price_thb).toLocaleString("th-TH")} บาท` : "สอบถามราคา");
  const highlights = (listing.highlights ?? []).slice(0, 3);

  const bodyContents = [
    { type: "text", text: listing.title ?? "ที่ดิน", weight: "bold", size: "lg", wrap: true, color: palette.title },
    { type: "text", text: priceText, weight: "bold", size: "xl", color: palette.accent },
  ];
  if (listing.location) {
    bodyContents.push({ type: "text", text: listing.location, size: "sm", color: palette.muted, wrap: true });
  }
  if (highlights.length) {
    bodyContents.push({ type: "separator", margin: "md", color: palette.separator });
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: highlights.map((h) => ({ type: "text", text: `• ${h}`, size: "xs", color: palette.mutedSoft, wrap: true })),
    });
  }

  const contents = {
    type: "bubble",
    ...(listing.photo_url ? { hero: { type: "image", url: listing.photo_url, aspectRatio: "20:13", aspectMode: "cover" } } : {}),
    body: { type: "box", layout: "vertical", paddingAll: "lg", spacing: "sm", backgroundColor: palette.cardBg, contents: bodyContents },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "lg",
      paddingTop: "sm",
      backgroundColor: palette.cardBg,
      contents: [
        {
          type: "button", style: "primary", height: "sm", color: palette.accent,
          action: { type: "message", label: "📅 นัดชมแปลงนี้", text: `อยากนัดชมแปลง ${listing.listing_id}` },
        },
        {
          type: "button", style: "secondary", height: "sm", color: palette.buttonBorder,
          action: { type: "message", label: "💰 คำนวณค่าโอน", text: `คำนวณค่าโอนแปลง ${listing.listing_id}` },
        },
        {
          type: "button", style: "link", height: "sm", color: palette.muted,
          action: { type: "message", label: "📞 คุยกับแอดมิน", text: "อยากคุยกับแอดมินตัวจริงเรื่องแปลงนี้" },
        },
      ],
    },
  };

  const altTextRaw = `แปลง: ${listing.title ?? ""} • ${priceText}${listing.location ? " • " + listing.location : ""}`;
  return { altText: [...altTextRaw].slice(0, 400).join(""), contents };
}

/**
 * The actual browsing surface: a swipeable row of real plot photos, so "what would the
 * customer pick from" (their words) has an answer. One bubble per listing, each with its
 * own photo, price, and two buttons -- "สนใจแปลงนี้" routes back into the same tool-use
 * loop (triggers show_listing_card next turn, same as picking a plot by name), and
 * "ดูโพสต์ต้นฉบับ" is a plain external link to the Facebook post it came from, when one
 * exists. Pure builder, no I/O, same as buildListingCardFlex.
 */
export function buildListingsCarouselFlex(listings) {
  const palette = PALETTE;
  const items = listings.slice(0, SEARCH_RESULT_LIMIT);

  const bubbles = items.map((listing) => {
    const priceText = listing.price_text
      ?? (listing.price_thb != null ? `${Number(listing.price_thb).toLocaleString("th-TH")} บาท` : "สอบถามราคา");

    const footerButtons = [
      {
        type: "button", style: "primary", height: "sm", color: palette.accent,
        action: { type: "message", label: "สนใจแปลงนี้", text: `สนใจแปลง ${listing.listing_id} ขอดูรายละเอียด` },
      },
    ];
    if (listing.source_post_url) {
      footerButtons.push({
        type: "button", style: "link", height: "sm", color: palette.muted,
        action: { type: "uri", label: "ดูโพสต์ต้นฉบับ", uri: listing.source_post_url },
      });
    }

    return {
      type: "bubble",
      size: "micro",
      ...(listing.photo_url ? { hero: { type: "image", url: listing.photo_url, size: "full", aspectRatio: "20:13", aspectMode: "cover" } } : {}),
      body: {
        type: "box", layout: "vertical", paddingAll: "md", spacing: "xs", backgroundColor: palette.cardBg,
        contents: [
          { type: "text", text: listing.title ?? "ที่ดิน", weight: "bold", size: "sm", wrap: true, color: palette.title, maxLines: 2 },
          { type: "text", text: priceText, weight: "bold", size: "md", color: palette.accent },
          ...(listing.location ? [{ type: "text", text: listing.location, size: "xs", color: palette.muted, wrap: true }] : []),
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "xs", paddingAll: "md", paddingTop: "xs",
        backgroundColor: palette.cardBg, contents: footerButtons,
      },
    };
  });

  return {
    altText: `พบที่ดิน ${items.length} แปลง เลื่อนดูได้เลยค่ะ`,
    contents: { type: "carousel", contents: bubbles },
  };
}

/**
 * The first-contact menu -- a real card with big buttons instead of the old always-on
 * Quick Reply row, per the same "buttons I can just press, clearly" request that produced
 * buildListingCardFlex. Static content, no listing data needed.
 */
export function buildCategoryMenuFlex() {
  const palette = PALETTE;
  const buttons = [
    { label: "🏞️ ดูที่ดินทั้งหมด", text: "อยากดูที่ดินทั้งหมดที่มีขายตอนนี้" },
    { label: "💰 งบไม่เกิน 1 ล้าน", text: "อยากดูที่ดินงบไม่เกิน 1,000,000 บาท" },
    { label: "💰 งบ 1-3 ล้าน", text: "อยากดูที่ดินงบ 1,000,000-3,000,000 บาท" },
    { label: "📍 เลือกทำเล", text: "เลือกทำเลที่ดิน" },
    { label: "🤝 ฝากขาย / ขายฝาก", text: "อยากฝากขายหรือสอบถามขายฝาก" },
    { label: "📞 ติดต่อเราโดยตรง", text: "อยากคุยกับแอดมินตัวจริง" },
  ];
  return {
    altText: "เลือกสิ่งที่ต้องการได้เลยค่ะ",
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", paddingAll: "lg", spacing: "md", backgroundColor: palette.cardBg,
        contents: [
          { type: "text", text: "ติดดินบินโดรน", weight: "bold", size: "lg", color: palette.title },
          { type: "text", text: "เลือกสิ่งที่ต้องการได้เลยค่ะ 😊", size: "sm", color: palette.muted, wrap: true },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg", paddingTop: "sm", backgroundColor: palette.cardBg,
        contents: [
          ...buttons.map((b, i) => ({
            type: "button", style: i === 0 ? "primary" : "secondary", height: "sm",
            color: i === 0 ? palette.accent : palette.buttonBorder,
            action: { type: "message", label: b.label, text: b.text },
          })),
          {
            type: "button", style: "link", height: "sm", color: palette.muted,
            action: { type: "uri", label: "ดูเพิ่มเติมที่เพจ", uri: FACEBOOK_PAGE_URL },
          },
        ],
      },
    },
  };
}

/** LINE's MessageAction.label cap, applied to labels built from real place names below --
 * static labels elsewhere in this file are hand-written short enough to never need it. */
function truncateLabel(s, max = 20) {
  return [...String(s ?? "")].slice(0, max).join("");
}

/**
 * Step 1 of the tap-to-filter-by-location flow ("เลือกทำเล" in the category menu): pick a
 * province. Server.mjs intercepts the button's reply text deterministically -- this is
 * navigation, not a sales question, so it never goes through the Claude tool loop.
 */
export function buildProvinceMenuFlex(listings) {
  const palette = PALETTE;
  const provinces = tallyProvinces(listings);
  return {
    altText: "เลือกจังหวัดที่สนใจได้เลยค่ะ",
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", paddingAll: "lg", spacing: "md", backgroundColor: palette.cardBg,
        contents: [
          { type: "text", text: "เลือกทำเล", weight: "bold", size: "lg", color: palette.title },
          { type: "text", text: "อยากดูที่ดินแถวจังหวัดไหนคะ", size: "sm", color: palette.muted, wrap: true },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg", paddingTop: "sm", backgroundColor: palette.cardBg,
        contents: provinces.map((p, i) => ({
          type: "button", style: i === 0 ? "primary" : "secondary", height: "sm",
          color: i === 0 ? palette.accent : palette.buttonBorder,
          action: { type: "message", label: truncateLabel(`${p.name} (${p.count})`), text: `ทำเลจังหวัด${p.name}` },
        })),
      },
    },
  };
}

/**
 * Step 2: pick an area (subdistrict/district) within the chosen province. Tapping an area
 * button is handled the same deterministic way in server.mjs -- it filters listings by
 * the structured tag from location-tags.mjs (not a keyword search), so "พรหมณี" and
 * "พรมมณี" typo variants in the source posts still land on the same button.
 */
export function buildAreaMenuFlex(listings, province) {
  const palette = PALETTE;
  const areas = tallyAreas(listings, province);
  return {
    altText: `เลือกทำเลใน${province}ได้เลยค่ะ`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", paddingAll: "lg", spacing: "md", backgroundColor: palette.cardBg,
        contents: [
          { type: "text", text: province, weight: "bold", size: "lg", color: palette.title },
          { type: "text", text: "อยากดูที่ดินแถวไหนคะ", size: "sm", color: palette.muted, wrap: true },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "lg", paddingTop: "sm", backgroundColor: palette.cardBg,
        contents: areas.map((a, i) => ({
          type: "button", style: i === 0 ? "primary" : "secondary", height: "sm",
          color: i === 0 ? palette.accent : palette.buttonBorder,
          action: { type: "message", label: truncateLabel(`${a.name} (${a.count})`), text: `ทำเลตำบล${a.name}` },
        })),
      },
    },
  };
}

async function toolCheckLocation(input = {}) {
  const result = await checkLocation(input.location);
  return {
    formatted_address: result.formatted_address,
    lat: result.lat,
    lng: result.lng,
    nearby_highlights: result.nearby.highlight_lines.slice(0, 5),
  };
}

function toolCalculateTransferCost(input = {}) {
  return calculateTransferCosts({
    appraisedValue: input.appraised_value,
    salePrice: input.sale_price,
    yearsHeld: input.years_held,
    hasStructure: Boolean(input.has_structure),
  });
}

async function toolSaveCustomerInfo(lineUserId, input = {}) {
  const record = await upsertCustomer(lineUserId, {
    display_name: input.name,
    phone: input.phone,
    interested_listing_id: input.interested_listing_id,
    note: input.note,
  });
  return { saved: true, customer_id: record.customer_id };
}

async function toolShowListingCard(ctx, input = {}) {
  if (ctx.presentedListing) {
    return { shown: false, reason: "already_shown_this_turn", listing_id: ctx.presentedListing.listing_id };
  }
  const { items } = await loadListings();
  const listing = items.find((l) => l.listing_id === input.listing_id);
  if (!listing) throw new Error(`ไม่พบแปลง ${input.listing_id} ในระบบ`);

  ctx.presentedListing = {
    listing_id: listing.listing_id,
    title: listing.title,
    price_text: listing.price_text,
    price_thb: listing.price_thb,
    location: listing.location,
    highlights: (listing.highlights ?? []).slice(0, 3),
    photo_url: listing.photo_url ?? null,
  };
  return { shown: true, listing_id: listing.listing_id };
}

async function toolRequestAppointment(ctx, input = {}) {
  // Always upsert, never just find-or-bare-create -- upsertCustomer only overwrites
  // fields it's actually given, so this is safe whether or not the model separately
  // called save_customer_info. A real test turn surfaced exactly what goes wrong
  // without this: customer gave name+phone in the SAME message as the appointment
  // request, the model only called request_appointment, and the admin notification
  // went out saying "ไม่ทราบชื่อ/เบอร์" -- with a customer sitting right there in the
  // conversation history who'd already said both.
  const customer = await upsertCustomer(ctx.lineUserId, {
    display_name: input.name ?? ctx.displayName,
    phone: input.phone,
  });
  const appt = await createAppointment({
    customer_id: customer.customer_id,
    listing_id: input.listing_id,
    date: input.date,
    time: input.time,
    note: input.note,
  });
  // Automatic, not something the model has to remember to also ask for -- a booked
  // appointment with nobody told about it is worse than no appointment feature at all.
  const who = customer.display_name ? `${customer.display_name} (${customer.phone ?? "ไม่มีเบอร์"})` : (customer.phone ?? "ไม่ทราบชื่อ/เบอร์");
  ctx.adminNotifications.push(
    `📅 มีลูกค้านัดชมที่ดิน\n${who}\nวันที่ ${appt.date}${appt.time ? ` เวลา ${appt.time}` : ""}` +
    (input.listing_id ? `\nแปลง: ${input.listing_id}` : "") +
    (appt.note ? `\nโน้ต: ${appt.note}` : "") +
    `\nรหัสนัดหมาย: ${appt.appointment_id}`
  );
  return { saved: true, appointment_id: appt.appointment_id, status: appt.status };
}

async function toolEscalateToAdmin(ctx, input = {}) {
  ctx.adminNotifications.push(
    `⚠️ บอทตอบลูกค้าไม่ได้ ต้องการคนช่วย\nคำถาม: ${input.question ?? "-"}` +
    (input.note ? `\nบริบทเพิ่มเติม: ${input.note}` : "") +
    `\nlineUserId: ${ctx.lineUserId}`
  );
  return { notified: true };
}

async function runTool(name, input, ctx) {
  switch (name) {
    case "search_listings":
      return toolSearchListings(ctx, input);
    case "calculate_transfer_cost":
      return toolCalculateTransferCost(input);
    case "check_location":
      return toolCheckLocation(input);
    case "save_customer_info":
      return toolSaveCustomerInfo(ctx.lineUserId, input);
    case "request_appointment":
      return toolRequestAppointment(ctx, input);
    case "show_listing_card":
      return toolShowListingCard(ctx, input);
    case "escalate_to_admin":
      return toolEscalateToAdmin(ctx, input);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

/**
 * Answer one incoming LINE text message. Loads this user's recent turns, runs the tool
 * loop against Claude, persists the new turn, and returns the reply text plus whichever
 * Flex payload this turn earned: a single detail card if show_listing_card fired (the
 * customer committed to one plot), or a browsing carousel if search_listings found
 * results (a single-card commitment always takes precedence when both happen -- picking
 * one plot means the browsing surface is no longer what's being shown).
 *
 * @param {object} input
 * @param {string} input.lineUserId
 * @param {string} input.text
 * @param {string} [input.displayName]
 * @returns {Promise<{text: string, listingCard: object|null, listingsCarousel: object[]|null, isFirstTurn: boolean, adminNotifications: string[]}>}
 */
export async function runLineBot({ lineUserId, text, displayName }, { apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
  if (!apiKey) throw new Error("ต้องมี ANTHROPIC_API_KEY เพื่อรันบอท LINE");
  if (!lineUserId) throw new Error("ต้องมี lineUserId");
  if (!text) throw new Error("ต้องมีข้อความ");

  const client = new Anthropic({ apiKey });
  const history = await getHistory(lineUserId);
  // LINE's "follow" webhook event fires exactly once, the moment someone adds the OA as
  // a friend -- plenty of real customers do that and only actually type something days
  // later, by which point follow has long since fired and gone. This is the signal the
  // menu card actually needs: this person's first real turn in the conversation, however
  // long after they added the friend that happens to be.
  const isFirstTurn = history.length === 0;
  const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: text }];
  // Hoisted once per turn, not per tool-call -- show_listing_card writes to this so the
  // choice survives across tool calls/rounds within the same reply.
  const ctx = { lineUserId, displayName, presentedListing: null, presentedListings: null, adminNotifications: [] };

  let response;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const result = await runTool(block.name, block.input, ctx);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: String(err.message ?? err) }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  const replyText = (response?.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim() || "ขอโทษค่ะ ตอนนี้ระบบตอบไม่ได้ รบกวนติดต่อ " + OFFICIAL_CONTACT;

  await appendTurn(lineUserId, "user", text);
  await appendTurn(lineUserId, "assistant", replyText);

  return {
    text: replyText,
    listingCard: ctx.presentedListing,
    listingsCarousel: ctx.presentedListing ? null : ctx.presentedListings,
    isFirstTurn,
    adminNotifications: ctx.adminNotifications,
  };
}
