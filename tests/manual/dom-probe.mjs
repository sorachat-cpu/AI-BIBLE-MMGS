// รัน JS ของหน้าเว็บจริงใน DOM จำลอง: getElementById คืนค่าเฉพาะ id ที่มีอยู่ใน HTML จริง
// เหมือน browser -- ถ้าโค้ดอ้าง id ที่ไม่มี จะได้ null แล้ว .addEventListener จะพัง แบบเดียวกับที่ผู้ใช้เจอ
import { readFile } from "node:fs/promises";
const html = await readFile("public/index.html", "utf8");
const realIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const listeners = {};
const nodes = new Map();
const mk = (id) => ({
  id, value: "", innerHTML: "", textContent: "", className: "", dataset: {}, style: {}, files: [],
  classList: { add(){}, remove(){}, toggle(){} },
  addEventListener(ev){ (listeners[id] ??= new Set()).add(ev); },
  appendChild(){}, querySelector(){ return mk("_q"); }, querySelectorAll(){ return []; },
  scrollIntoView(){}, click(){}, setAttribute(){}, getAttribute(){ return null; },
  get children(){ return { length: 0 }; },
});
globalThis.document = {
  getElementById: (id) => realIds.has(id) ? (nodes.get(id) ?? (nodes.set(id, mk(id)), nodes.get(id))) : null,
  querySelectorAll: () => [],
  createElement: (t) => mk("_new_" + t),
};
globalThis.window = globalThis;
globalThis.fetch = async () => ({ json: async () => ({ ok: true, data: {} }) });
globalThis.FileReader = class { readAsDataURL(){} };
globalThis.Image = class {};
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText(){} } }, configurable: true });
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
globalThis.setTimeout = () => 0;

try {
  new Function(js)();
  console.log("✅ สคริปต์รันจบโดยไม่ throw");
} catch (e) {
  console.log("❌ สคริปต์พังตอนโหลด:", e.message);
  process.exit(1);
}

const want = {
  "wf-drop": ["click", "keydown", "dragover", "dragleave", "drop"],
  "wf-file": ["change"],
  "wf-clear": ["click"],
  "wf-prepare": ["click"],
  "wf-finish": ["click"],
};
let bad = 0;
for (const [id, evs] of Object.entries(want)) {
  const got = listeners[id] ?? new Set();
  const missing = evs.filter(e => !got.has(e));
  console.log(missing.length ? `❌ ${id}: ขาด ${missing.join(",")}` : `✅ ${id}: ${[...got].join(", ")}`);
  bad += missing.length;
}
process.exit(bad ? 1 : 0);
