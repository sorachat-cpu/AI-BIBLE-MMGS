// Turn a listing's free-text `location` ("ต.พรหมณี อ.เมือง จ.นครนายก", "สาริกา เมืองนครนายก",
// "พรมมณี เมือง นครนายก" -- three spellings of the same subdistrict across real posts) into
// two clean tags: province and area (subdistrict/district). There is no structured
// province/subdistrict field anywhere upstream -- sellers type the location by hand into
// the Facebook post, Claude copies it into `location` as-is in extractListing() -- so this
// is pattern matching against what the real data actually contains, not a general Thai
// address parser. The known-place lists below were built by listing every distinct
// `location` string in the current sheet and reading them by hand; a genuinely new
// province/area just falls into the "ไม่ระบุ" bucket instead of guessing wrong.
const PREFIX_STRIP = /(ต\.|ตำบล|อ\.|อำเภอ|จ\.|จังหวัด)/g;

// Longest-match-first: "เมืองปราจีนบุรี" must not be caught by a bare "เมือง" check.
const PROVINCES = ["นครนายก", "นครราชสีมา", "ปราจีนบุรี"];

// Spelling variants seen in real posts -> the one canonical form, so the filter menu
// doesn't show "พรหมณี" and "พรมมณี" as two different places.
const AREA_ALIASES = {
  "พรหมณี": "พรหมมณี",
  "พรมมณี": "พรหมมณี",
};

/**
 * Strip administrative-prefix words and collapse whitespace. Shared with the search
 * matcher in line-bot-engine.mjs -- a customer's search term "ตำบลหินตั้ง" must still match
 * a raw post location like "หินตั้ง เมือง นครนายก", which never actually contains the word
 * "ตำบล" (sellers just type the place name). Without normalizing both sides the same way,
 * that customer's own words fail a plain substring search against real, in-stock listings.
 */
export function stripAdminPrefixes(text) {
  return String(text ?? "").replace(PREFIX_STRIP, " ").replace(/\s+/g, " ").trim();
}

/** @returns {{province: string, area: string}} */
export function parseLocationTags(location) {
  const raw = String(location ?? "").trim();
  if (!raw) return { province: "ไม่ระบุ", area: "ไม่ระบุ" };

  const province = PROVINCES.find((p) => raw.includes(p)) ?? "อื่นๆ";

  // Strip prefixes, the province name, and an "เมือง<province>" fusion (อำเภอเมือง
  // written glued to the province, e.g. "เมืองนครนายก") that would otherwise survive
  // as a leftover token once the bare province name is removed.
  let rest = stripAdminPrefixes(raw);
  if (province !== "อื่นๆ" && province !== "ไม่ระบุ") {
    rest = rest.replace(new RegExp(`เมือง${province}`, "g"), " ").replace(new RegExp(province, "g"), " ");
  }

  const tokens = rest.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  // "เมือง" alone (no subdistrict named) means the seller just meant "in town" -- keep it
  // as its own area rather than discarding it, or that plot silently loses its filter tag.
  const first = tokens.find((t) => t !== "เมือง") ?? tokens[0] ?? "เมือง";
  const area = AREA_ALIASES[first] ?? first;

  return { province, area };
}

/** Distinct provinces present, most-listings-first, for a top-level tap menu. */
export function tallyProvinces(listings) {
  const counts = new Map();
  for (const l of listings) {
    const { province } = parseLocationTags(l.location);
    counts.set(province, (counts.get(province) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Distinct areas within one province, most-listings-first. */
export function tallyAreas(listings, province) {
  const counts = new Map();
  for (const l of listings) {
    const tags = parseLocationTags(l.location);
    if (tags.province !== province) continue;
    counts.set(tags.area, (counts.get(tags.area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
