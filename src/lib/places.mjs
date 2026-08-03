// Nearby places lookup for the "what's around this property" section of a listing.
//
// Uses the legacy Places Nearby Search endpoint. The newer places.googleapis.com service
// is blocked on this key (API_KEY_SERVICE_BLOCKED), and the legacy one returns what we
// need, so there is no reason to make the operator enable another API.
import { distanceMeters, formatDistance } from "./geo.mjs";

const NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";

// Categories chosen for Thai property listings specifically -- these are the things a
// buyer actually asks about. `keyword` narrows Google's broad types (place_of_worship
// covers every religion; ตลาด is not a Google type at all).
export const PLACE_CATEGORIES = [
  { key: "hospital", label: "โรงพยาบาล", icon: "🏥", type: "hospital" },
  { key: "temple", label: "วัด", icon: "🛕", type: "place_of_worship", keyword: "วัด" },
  { key: "market", label: "ตลาด", icon: "🧺", keyword: "ตลาด" },
  { key: "attraction", label: "แหล่งท่องเที่ยว", icon: "🏞️", type: "tourist_attraction" },
  { key: "school", label: "โรงเรียน", icon: "🏫", type: "school" },
  { key: "shopping", label: "ห้าง/ซูเปอร์", icon: "🛒", type: "supermarket" },
  { key: "convenience", label: "ร้านสะดวกซื้อ", icon: "🏪", type: "convenience_store" },
];

async function searchOne({ lat, lng, radius, category, apiKey }) {
  const url = new URL(NEARBY_URL);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("language", "th");
  url.searchParams.set("key", apiKey);
  if (category.type) url.searchParams.set("type", category.type);
  if (category.keyword) url.searchParams.set("keyword", category.keyword);

  const res = await fetch(url);
  const body = await res.json();

  if (body.status === "REQUEST_DENIED") {
    throw new Error(`Places API ถูกปฏิเสธ: ${body.error_message ?? "ตรวจสอบว่าเปิด Places API แล้วหรือยัง"}`);
  }
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    throw new Error(`Places API ตอบ ${body.status}`);
  }

  return (body.results ?? []).map((r) => {
    const loc = r.geometry?.location;
    const metres = loc ? distanceMeters({ lat, lng }, { lat: loc.lat, lng: loc.lng }) : null;
    return {
      name: r.name,
      category: category.key,
      category_label: category.label,
      icon: category.icon,
      distance_m: metres,
      distance_text: metres == null ? null : formatDistance(metres),
      rating: r.rating ?? null,
      // Google's radius filter is a bounding circle on the search, not on results --
      // some come back further out, so the caller still filters by real distance.
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
    };
  });
}

/**
 * @param {object} opts
 * @param {number} opts.lat @param {number} opts.lng
 * @param {number} [opts.radius] metres, default 5000
 * @param {number} [opts.perCategory] how many to keep per category, default 3
 */
export async function findNearbyPlaces({ lat, lng, radius = 5000, perCategory = 3, apiKey }) {
  if (!apiKey) throw new Error("ไม่มี GOOGLE_MAPS_API_KEY");

  // One request per category, in parallel. A failure in one category must not lose the
  // others -- a listing with 6 of 7 categories is still useful.
  const settled = await Promise.allSettled(
    PLACE_CATEGORIES.map((category) => searchOne({ lat, lng, radius, category, apiKey }))
  );

  const groups = [];
  const errors = [];
  settled.forEach((result, i) => {
    const category = PLACE_CATEGORIES[i];
    if (result.status === "rejected") {
      errors.push({ category: category.key, message: String(result.reason.message ?? result.reason) });
      return;
    }
    const items = result.value
      .filter((p) => p.distance_m != null && p.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, perCategory);
    if (items.length) {
      groups.push({
        category: category.key,
        label: category.label,
        icon: category.icon,
        nearest_m: items[0].distance_m,
        places: items,
      });
    }
  });

  groups.sort((a, b) => a.nearest_m - b.nearest_m);
  return { groups, errors, radius_m: radius };
}

/**
 * Turns the groups into short selling lines a listing or subtitle can use directly,
 * e.g. "ใกล้โรงพยาบาล 1.2 กม." -- factual only, no promotional language, so it stays
 * within the Property Engine rules for highlight_features.
 */
export function toHighlightLines(groups, limit = 4) {
  return groups.slice(0, limit).map((g) => `ใกล้${g.label} ${formatDistance(g.nearest_m)}`);
}
