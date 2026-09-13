// src/lib/alert.mjs
// ITEM 2 — one-way LINE alert to the admin when the MMGS pipeline fails.
// Uses the existing push() adapter + ADMIN_LINE_USER_ID / LINE_CHANNEL_ACCESS_TOKEN
// (both already present in .env). Never throws: an alert failure must not break
// the job it is reporting on.
//
// Anti-spam (doc §2.4): dedup identical (stage+message) within 6h, hard cap
// ~10 alerts/day. State kept in a plain JSON file next to the repo root.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { push } from "../publish/adapters/line.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.resolve(__dirname, "../../.alert-state.json");

const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h
const DAILY_CAP = 10;

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { day: "", count: 0, seen: {} };
  }
}

async function saveState(s) {
  try {
    await writeFile(STATE_FILE, JSON.stringify(s), "utf8");
  } catch {
    /* state write failure must not break anything */
  }
}

function todayTH() {
  return new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
}

/**
 * Send a failure alert to the admin's LINE. Returns true if a message was sent,
 * false if suppressed (dedup/cap/no-config) — never throws.
 */
export async function alertAdmin(stage, err, ctx = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.ADMIN_LINE_USER_ID;
  if (!token || !to) return false; // no config = no send, don't crash

  const msg = String(err?.message ?? err).slice(0, 300);
  const key = `${stage}::${msg}`;
  const now = Date.now();

  const state = await loadState();
  const day = todayTH();
  if (state.day !== day) {
    state.day = day;
    state.count = 0;
    state.seen = {};
  }

  // dedup within window
  const first = state.seen[key];
  if (first && now - first.ts < DEDUP_WINDOW_MS) {
    first.n = (first.n ?? 1) + 1;
    await saveState(state);
    return false;
  }
  // daily cap
  if (state.count >= DAILY_CAP) {
    await saveState(state);
    return false;
  }

  const repeats = first?.n && first.n > 1 ? `\n🔁 ก่อนหน้านี้เกิด ${first.n} ครั้ง` : "";
  const text =
    `🚨 MMGS ล้มเหลว\n` +
    `📍 ขั้นตอน: ${stage}\n` +
    `🆔 ${ctx.id ?? "-"}\n` +
    `❌ ${msg}${repeats}\n` +
    `🕐 ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;

  state.seen[key] = { ts: now, n: 1 };
  state.count += 1;
  await saveState(state);

  try {
    await push({ token, to, text });
    return true;
  } catch {
    return false; // alert failing must never break the pipeline
  }
}

/**
 * Send an end-of-run summary (doc §2.3 item 2): one message, not one per item.
 * results: [{ id, ok, error }]. Sent only if there is at least one failure.
 */
export async function alertRunSummary(label, results) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.ADMIN_LINE_USER_ID;
  if (!token || !to) return false;
  if (!Array.isArray(results) || results.length === 0) return false;

  const fails = results.filter((r) => !r.ok);
  if (fails.length === 0) return false; // all good = stay quiet

  const ok = results.length - fails.length;
  const lines = [
    `📊 MMGS ${label} ${todayTH()}`,
    `✅ สำเร็จ ${ok} / ${results.length}`,
    ...fails.slice(0, 20).map((f) => `❌ ${f.id ?? "-"} — ${String(f.error ?? "").slice(0, 120)}`),
  ];
  try {
    await push({ token, to, text: lines.join("\n") });
    return true;
  } catch {
    return false;
  }
}
