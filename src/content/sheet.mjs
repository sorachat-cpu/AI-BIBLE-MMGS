// Google Sheet round-trip.
//
// The workflow this serves: the system fills a sheet with drafts, a human edits the
// caption column and flips status to READY, the system reads the sheet back and posts
// only the READY rows. So the CSV writer and reader must be exact inverses -- a caption
// containing a comma, a quote or a line break is normal in Thai property copy, and
// losing one would silently corrupt what gets posted.
//
// RFC 4180 quoting, CRLF-tolerant on read, LF on write.

export const DRAFT_COLUMNS = [
  "id",
  "date",
  "time",
  "slot",
  "status",
  "platforms",
  "content_type",
  "property_id",
  "title",
  "price_thb",
  "location",
  "video_file",
  "image_files",
  "caption",
  "post_url",
  "note",
];

function escapeField(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {Array<Record<string,any>>} rows */
export function toCsv(rows, { columns, bom = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = columns ?? [...new Set(list.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map(escapeField).join(",")];
  for (const row of list) lines.push(cols.map((c) => escapeField(row[c])).join(","));
  // Excel needs the BOM to read Thai as UTF-8; Google Sheets does not care either way.
  return (bom ? "﻿" : "") + lines.join("\n");
}

export function toTsv(rows, { columns } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = columns ?? [...new Set(list.flatMap((r) => Object.keys(r)))];
  // Tabs cannot be quoted when pasting into a sheet, so newlines and tabs inside a
  // value are flattened rather than escaped. TSV is for pasting; CSV is for round-trips.
  const flat = (v) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  return [cols.join("\t"), ...list.map((r) => cols.map((c) => flat(r[c])).join("\t"))].join("\n");
}

/** Parse CSV into objects keyed by the header row. */
export function fromCsv(text) {
  const input = String(text ?? "").replace(/^﻿/, "");
  if (!input.trim()) return [];

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // A file not ending in a newline still has one pending field.
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.some((cell) => cell !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** Sheet-shaped row from an internal queue item. */
export function queueItemToRow(item) {
  return {
    id: item.id,
    date: item.date ?? "",
    time: item.time ?? "",
    slot: item.slot_name ?? "",
    status: item.status ?? "DRAFT",
    platforms: (item.platforms ?? []).join("|"),
    content_type: item.content_type ?? "",
    property_id: item.property_id ?? "",
    title: item.post?.title ?? "",
    price_thb: item.post?.price_thb ?? "",
    location: item.post?.location ?? "",
    video_file: item.video_file ?? "",
    image_files: (item.image_files ?? []).join("|"),
    caption: item.caption ?? "",
    post_url: (item.results ?? []).map((r) => r.publish_url).filter(Boolean).join(" "),
    note: item.note ?? "",
  };
}

/** Inverse of queueItemToRow -- only the fields a human is expected to edit. */
export function rowToQueuePatch(row) {
  const patch = {};
  if (row.status) patch.status = String(row.status).trim().toUpperCase();
  if (row.caption !== undefined) patch.caption = row.caption;
  if (row.platforms) patch.platforms = String(row.platforms).split("|").map((s) => s.trim()).filter(Boolean);
  if (row.video_file !== undefined && row.video_file !== "") patch.video_file = row.video_file;
  if (row.image_files) patch.image_files = String(row.image_files).split("|").map((s) => s.trim()).filter(Boolean);
  if (row.note !== undefined) patch.note = row.note;
  return patch;
}
