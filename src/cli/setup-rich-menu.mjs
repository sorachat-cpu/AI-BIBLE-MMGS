#!/usr/bin/env node
// Deploys the LINE Rich Menu -- the persistent tappable bar under the chat, always
// visible regardless of whether the bot has said anything (23_PAGE_STUDIO.md §3.6,
// "ไม่ต้องให้บอทตอบตลอดเวลา"). This is a one-time setup step (re-run after a redesign),
// not something that runs per-request -- see src/lib/rich-menu.mjs for the image/area
// builder and src/publish/adapters/line.mjs for the API calls this orchestrates.
//
//   node --env-file-if-exists=.env src/cli/setup-rich-menu.mjs
//
// Idempotent: deletes any previous rich menu this script created (matched by name)
// before creating the new one, so re-running after a redesign doesn't pile up orphaned
// menus eating into LINE's 1000-rich-menu-per-channel ceiling.
import { renderRichMenuImage, buildRichMenuAreas } from "../lib/rich-menu.mjs";
import {
  createRichMenu, uploadRichMenuImage, setDefaultRichMenu, listRichMenus, deleteRichMenu,
} from "../publish/adapters/line.mjs";
import { FACEBOOK_PAGE_URL } from "../engines/line-bot-engine.mjs";

const MENU_NAME = "ติดดินบินโดรน - เมนูหลัก";

const ZONES = [
  { icon: "land", label: "ดูที่ดินทั้งหมด" },
  { icon: "money", label: "คำนวณค่าโอน" },
  { icon: "pin", label: "เช็คทำเล" },
  { icon: "handshake", label: "ฝากขาย/ขายฝาก" },
  { icon: "phone", label: "ติดต่อเราโดยตรง" },
  { icon: "facebook", label: "ดูเพจ Facebook" },
];

// message actions still go through the bot (they need real data -- search_listings,
// calculate_transfer_cost -- there's no such thing as a native app that skips the fetch
// for those either); only the Facebook link is a true bypass, opening directly with no
// webhook round-trip at all.
const ACTIONS = [
  { type: "message", label: "ดูที่ดินทั้งหมด", text: "อยากดูที่ดินทั้งหมดที่มีขายตอนนี้" },
  { type: "message", label: "คำนวณค่าโอน", text: "อยากคำนวณค่าโอนที่ดิน" },
  { type: "message", label: "เช็คทำเล", text: "อยากเช็คทำเล" },
  { type: "message", label: "ฝากขาย/ขายฝาก", text: "อยากฝากขายหรือสอบถามขายฝาก" },
  { type: "message", label: "ติดต่อเราโดยตรง", text: "อยากคุยกับแอดมินตัวจริง" },
  { type: "uri", label: "ดูเพจ Facebook", uri: FACEBOOK_PAGE_URL },
];

async function main() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("ต้องมี LINE_CHANNEL_ACCESS_TOKEN");

  console.log("กำลังสร้างภาพเมนู...");
  const image = await renderRichMenuImage(ZONES);
  console.log(`  ${(image.length / 1024).toFixed(0)} KB`);

  console.log("ลบเมนูเดิม (ถ้ามี)...");
  const existing = await listRichMenus({ token });
  for (const menu of existing) {
    if (menu.name === MENU_NAME) {
      await deleteRichMenu({ token, richMenuId: menu.richMenuId });
      console.log(`  ลบ ${menu.richMenuId}`);
    }
  }

  console.log("สร้างเมนูใหม่...");
  const richMenuId = await createRichMenu({
    token,
    definition: {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: MENU_NAME,
      chatBarText: "เมนู",
      areas: buildRichMenuAreas(ACTIONS),
    },
  });
  console.log(`  richMenuId: ${richMenuId}`);

  console.log("อัปโหลดภาพ...");
  await uploadRichMenuImage({ token, richMenuId, imageBuffer: image });

  console.log("ตั้งเป็นเมนูเริ่มต้นของทุกคน...");
  await setDefaultRichMenu({ token, richMenuId });

  console.log("\nเสร็จ — เมนูจะขึ้นให้ทุกคนที่แอดเพื่อน OA ไว้แล้วทันที ไม่ต้องรอ event ใหม่");
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
