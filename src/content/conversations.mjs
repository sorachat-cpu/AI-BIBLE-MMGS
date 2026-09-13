// Short-term chat memory for the LINE bot, per LINE user id.
//
// Without this, every message would be answered with no memory of the one before it --
// a customer who says "แล้วแปลงนี้ล่ะ" (what about this plot) two messages after naming
// one would get a reply about nothing in particular. This is not a transcript archive:
// it is capped and trimmed so the file (and the tokens sent to Claude on every turn)
// stay bounded regardless of how long one person keeps chatting.
import { readJson, writeJson } from "./store.mjs";

const CONVERSATIONS_FILE = "conversations.json";

/** Turns kept per user. Trimmed, not just capped at read time, so the file never grows. */
export const MAX_TURNS_PER_USER = 20;

export async function loadConversations() {
  return readJson(CONVERSATIONS_FILE, { items: {} });
}

export async function saveConversations(data) {
  return writeJson(CONVERSATIONS_FILE, data);
}

export async function getHistory(lineUserId) {
  const data = await loadConversations();
  return data.items[lineUserId] ?? [];
}

/** @param {"user"|"assistant"} role */
export async function appendTurn(lineUserId, role, content) {
  const data = await loadConversations();
  const turns = data.items[lineUserId] ?? [];
  turns.push({ role, content, at: new Date().toISOString() });
  data.items[lineUserId] = turns.slice(-MAX_TURNS_PER_USER);
  await saveConversations(data);
  return data.items[lineUserId];
}
