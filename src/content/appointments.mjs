// Viewing appointments requested through the LINE bot.
//
// Google Calendar sync is not wired yet (needs its own OAuth credential, separate from
// the Maps API key -- see 23_PAGE_STUDIO.md §3.6). This store exists so an appointment
// a customer asks for today is not lost while that credential is still pending: it is
// saved with calendar_synced:false and a real sync step can walk every unsynced row once
// the credential exists, instead of needing the conversation to have happened again.
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./store.mjs";

const APPOINTMENTS_FILE = "appointments.json";

export const APPOINTMENT_STATUSES = ["REQUESTED", "CONFIRMED", "CANCELLED"];

export async function loadAppointments() {
  return readJson(APPOINTMENTS_FILE, { items: [] });
}

export async function saveAppointments(data) {
  return writeJson(APPOINTMENTS_FILE, data);
}

/**
 * @param {object} input
 * @param {string} input.customer_id
 * @param {string} [input.listing_id]
 * @param {string} input.date        ISO date, e.g. "2026-08-20"
 * @param {string} [input.time]      free-text time the customer gave, e.g. "บ่าย 2 โมง"
 * @param {string} [input.note]
 */
export async function createAppointment(input) {
  if (!input?.customer_id) throw new Error("ต้องมี customer_id ก่อนสร้างนัดหมาย");
  if (!input?.date) throw new Error("ต้องระบุวันที่นัด");

  // A caller (a model resolving "20 สิงหาคมนี้" without knowing what year "this" is)
  // can silently produce a date in the past. Thrown here rather than just logged, so a
  // tool-calling loop sees it as an error and can re-ask instead of quietly booking a
  // viewing that already happened.
  const parsed = new Date(`${input.date}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`วันที่ "${input.date}" อ่านไม่ออก ต้องเป็นรูปแบบ YYYY-MM-DD`);
  }
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (parsed < yesterday) {
    throw new Error(`วันที่ "${input.date}" อยู่ในอดีตไปแล้ว ตรวจปี/เดือน/วันอีกครั้งเทียบกับวันนี้`);
  }

  const data = await loadAppointments();
  const now = new Date().toISOString();
  const record = {
    appointment_id: `APPT-${randomUUID().slice(0, 8).toUpperCase()}`,
    customer_id: input.customer_id,
    listing_id: input.listing_id ?? null,
    date: input.date,
    time: input.time ?? null,
    note: input.note ?? null,
    status: "REQUESTED",
    calendar_synced: false,
    calendar_event_id: null,
    created_at: now,
    updated_at: now,
  };
  data.items.push(record);
  await saveAppointments(data);
  return record;
}
