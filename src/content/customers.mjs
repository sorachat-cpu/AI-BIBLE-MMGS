// Customer records collected from the LINE bot -- name, phone, plot of interest.
//
// Phase 1 of 20_ROADMAP.md calls for PostgreSQL; this is the same interim JSON-file
// pattern as listings.mjs/queue.mjs (see store.mjs) so it migrates as a straight row
// insert later instead of a rewrite.
//
// Keyed by LINE user id because that is the only stable identifier the bot has before a
// customer volunteers their name -- a person can message before ever telling us who they
// are, and we still need somewhere to attach the phone number once they do.
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./store.mjs";

const CUSTOMERS_FILE = "customers.json";

export async function loadCustomers() {
  return readJson(CUSTOMERS_FILE, { items: [] });
}

export async function saveCustomers(data) {
  return writeJson(CUSTOMERS_FILE, data);
}

export async function findCustomerByLineId(lineUserId) {
  const { items } = await loadCustomers();
  return items.find((c) => c.line_user_id === lineUserId) ?? null;
}

/**
 * Create or patch the record for one LINE user. Only overwrites fields that are
 * actually provided -- a message that mentions a plot but not a phone number must not
 * blank out a phone number given in an earlier message.
 */
export async function upsertCustomer(lineUserId, patch = {}) {
  const data = await loadCustomers();
  const now = new Date().toISOString();
  const idx = data.items.findIndex((c) => c.line_user_id === lineUserId);

  if (idx === -1) {
    const record = {
      customer_id: `CUST-${randomUUID().slice(0, 8).toUpperCase()}`,
      line_user_id: lineUserId,
      display_name: patch.display_name ?? null,
      phone: patch.phone ?? null,
      interested_listing_id: patch.interested_listing_id ?? null,
      note: patch.note ?? null,
      created_at: now,
      updated_at: now,
    };
    data.items.push(record);
    await saveCustomers(data);
    return record;
  }

  const existing = data.items[idx];
  const updated = {
    ...existing,
    display_name: patch.display_name ?? existing.display_name,
    phone: patch.phone ?? existing.phone,
    interested_listing_id: patch.interested_listing_id ?? existing.interested_listing_id,
    note: patch.note ?? existing.note,
    updated_at: now,
  };
  data.items[idx] = updated;
  await saveCustomers(data);
  return updated;
}
