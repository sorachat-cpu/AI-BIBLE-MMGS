// Google Engine (08_GOOGLE_ENGINE.md) -- geocode a raw address, build Static Map / Street View URLs.
// Rules enforced here (see .claude/agents/google-engine.md for the full spec):
//   - Never hallucinate lat/lng -- only ever return what the Geocoding API actually returned.
//   - Cache-first (Rule 7, 03_SYSTEM_RULES.md): Phase 1 Postgres/Redis isn't built yet, so
//     cache_hit is hardcoded false for now -- this is a known gap, not a design choice.
import { validateAgainstSchema } from "../lib/validate.mjs";
import { parseLocationInput } from "../lib/geo.mjs";
import { findNearbyPlaces, toHighlightLines } from "../lib/places.mjs";

const REVERSE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
const STREET_VIEW_URL = "https://maps.googleapis.com/maps/api/streetview";
const IMAGE_SIZE = "1080x1080";

/**
 * Satellite frames at several zoom levels, wide first, for a fly-down to the plot.
 *
 * The descent is a zoom across still frames, not generated motion, so it needs no video
 * model: four static-map images cost about $0.008 against $0.16 for one AI clip, and the
 * imagery is the real satellite view of that exact parcel rather than an invention.
 *
 * Levels are spaced unevenly on purpose. Google's zoom is logarithmic, so an even step
 * reads as a slow start and a sudden drop; these land closer to a constant descent.
 *
 * @param {{lat:number, lng:number}} at
 * @param {string} apiKey
 * @param {number[]} [zooms]
 * @returns {Array<{zoom:number, url:string}>}
 */
export function satelliteZoomUrls({ lat, lng }, apiKey, zooms = [6, 11, 15, 18]) {
  return zooms.map((zoom) => {
    const u = new URL(STATIC_MAP_URL);
    u.searchParams.set("center", `${lat},${lng}`);
    u.searchParams.set("zoom", String(zoom));
    u.searchParams.set("size", IMAGE_SIZE);
    u.searchParams.set("scale", "2");
    u.searchParams.set("maptype", "satellite");
    u.searchParams.set("key", apiKey);
    return { zoom, url: u.toString() };
  });
}

/** The closest frame, with the marker drawn, to hold on at the end of the descent. */
export function pinnedPlotUrl({ lat, lng }, apiKey, zoom = 18) {
  const u = new URL(STATIC_MAP_URL);
  u.searchParams.set("center", `${lat},${lng}`);
  u.searchParams.set("zoom", String(zoom));
  u.searchParams.set("size", IMAGE_SIZE);
  u.searchParams.set("scale", "2");
  u.searchParams.set("maptype", "hybrid"); // satellite plus road labels, so it is readable
  u.searchParams.set("language", "th");
  u.searchParams.set("markers", `color:red|size:mid|${lat},${lng}`);
  u.searchParams.set("key", apiKey);
  return u.toString();
}

export class GoogleEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isPlausibleCoordinate(lat, lng) {
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

function coarsenAddress(address) {
  // Drop the most specific (leftmost, comma-separated) segment and retry, per the spec's
  // "retry with coarser input" fallback for ERR_GOOG_01.
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(", ") : null;
}

async function callGeocodingApi(address, apiKey) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  const body = await res.json();

  if (body.status === "OK" && body.results?.length > 0) {
    const result = body.results[0];
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formatted_address: result.formatted_address,
    };
  }
  if (body.status === "ZERO_RESULTS") {
    return null;
  }
  if (body.status === "OVER_QUERY_LIMIT" || body.status === "REQUEST_DENIED") {
    throw new GoogleEngineError("ERR_GOOG_02", `Google API rejected the request: ${body.status} ${body.error_message ?? ""}`.trim());
  }
  throw new GoogleEngineError("ERR_GOOG_01", `Unexpected geocoding status: ${body.status} ${body.error_message ?? ""}`.trim());
}

/** Turns coordinates back into a readable address so the output still names the place. */
async function reverseGeocode(lat, lng, apiKey) {
  const url = new URL(REVERSE_GEOCODE_URL);
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("language", "th");
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  const body = await res.json();
  return body.status === "OK" && body.results?.length
    ? body.results[0].formatted_address
    : `${lat}, ${lng}`;
}

/**
 * Geocode + retry-with-coarser-input + bounds check, shared by runGoogleEngine() and the
 * property_id-free checkLocation() below -- both need exactly this, neither should
 * duplicate the retry logic.
 */
async function resolveGeocode(rawAddress, apiKey) {
  const parsed = await parseLocationInput(rawAddress);
  let geocoded;

  if (parsed.kind === "coords") {
    geocoded = {
      lat: parsed.lat,
      lng: parsed.lng,
      formatted_address: await reverseGeocode(parsed.lat, parsed.lng, apiKey),
    };
  } else {
    geocoded = await callGeocodingApi(parsed.address, apiKey);
    if (!geocoded) {
      const coarser = coarsenAddress(parsed.address);
      if (coarser) geocoded = await callGeocodingApi(coarser, apiKey);
    }
    if (!geocoded) {
      throw new GoogleEngineError("ERR_GOOG_01", `Could not geocode address after retry: "${parsed.address}"`);
    }
  }

  if (!isPlausibleCoordinate(geocoded.lat, geocoded.lng)) {
    throw new GoogleEngineError("ERR_GOOG_01", `Geocoded coordinates out of bounds: ${geocoded.lat},${geocoded.lng}`);
  }
  return { ...geocoded, input_kind: parsed.kind };
}

/**
 * @param {object} input
 * @param {string} input.property_id
 * @param {string} [input.raw_address]  address, coordinates, or a Google Maps link
 * @param {boolean} [input.include_nearby=true]
 * @param {number} [input.nearby_radius_m=5000]
 */
export async function runGoogleEngine(
  { property_id, raw_address, include_nearby = true, nearby_radius_m = 5000 },
  { googleMapsApiKey } = {}
) {
  if (!property_id || !/^PROP-TH-\d{4,6}$/.test(property_id)) {
    throw new GoogleEngineError("ERR_GOOG_INPUT", "property_id missing or malformed");
  }
  if (!raw_address || !raw_address.trim()) {
    throw new GoogleEngineError("ERR_GOOG_INPUT", "raw_address missing -- cannot geocode");
  }

  const apiKey = googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new GoogleEngineError("ERR_GOOG_NO_API_KEY", "GOOGLE_MAPS_API_KEY is not set -- see .env.example");
  }

  // A pasted map link or coordinate pair already carries the exact pin. Using it directly
  // is both free and more accurate than geocoding a text address, which can land on the
  // wrong side of a road or on the district centroid.
  //
  // No "default coordinates per province" table exists yet (needs Phase 1 DB) -- resolveGeocode
  // fails loudly instead of hallucinating a location, per the No Hallucination rule.
  const geocoded = await resolveGeocode(raw_address, apiKey);
  const input_kind = geocoded.input_kind;
  const { lat, lng } = geocoded;
  // TODO(Phase 0/1): sign these URLs once a GOOGLE_MAPS_URL_SIGNING_SECRET is configured --
  // the spec requires signed static map URLs before they're used publicly.
  const staticMapUrl = new URL(STATIC_MAP_URL);
  staticMapUrl.searchParams.set("center", `${lat},${lng}`);
  staticMapUrl.searchParams.set("zoom", "16");
  staticMapUrl.searchParams.set("size", IMAGE_SIZE);
  staticMapUrl.searchParams.set("maptype", "satellite");
  staticMapUrl.searchParams.set("key", apiKey);

  const streetViewUrl = new URL(STREET_VIEW_URL);
  streetViewUrl.searchParams.set("size", IMAGE_SIZE);
  streetViewUrl.searchParams.set("location", `${lat},${lng}`);
  streetViewUrl.searchParams.set("key", apiKey);

  // Same view but with the marker drawn and on the standard (non-satellite) map, so the
  // opening shot reads as "here it is on the map" the way a pin screenshot does.
  const pinMapUrl = new URL(STATIC_MAP_URL);
  pinMapUrl.searchParams.set("center", `${lat},${lng}`);
  pinMapUrl.searchParams.set("zoom", "15");
  pinMapUrl.searchParams.set("size", IMAGE_SIZE);
  pinMapUrl.searchParams.set("scale", "2");
  pinMapUrl.searchParams.set("maptype", "roadmap");
  pinMapUrl.searchParams.set("language", "th");
  pinMapUrl.searchParams.set("markers", `color:red|size:mid|${lat},${lng}`);
  pinMapUrl.searchParams.set("key", apiKey);

  const googleOut = {
    property_id,
    geo_location: { lat, lng, formatted_address: geocoded.formatted_address },
    static_map_url: staticMapUrl.toString(),
    street_view_url: streetViewUrl.toString(),
    pin_map_url: pinMapUrl.toString(),
    cache_hit: false,
    input_kind,
  };

  // Nearby places are a selling point, not a hard dependency -- if Places fails the
  // location result is still valid and the pipeline continues without it.
  if (include_nearby) {
    try {
      const nearby = await findNearbyPlaces({ lat, lng, radius: nearby_radius_m, apiKey });
      googleOut.nearby = {
        radius_m: nearby.radius_m,
        groups: nearby.groups,
        highlight_lines: toHighlightLines(nearby.groups),
        errors: nearby.errors,
      };
    } catch (err) {
      googleOut.nearby = { radius_m: nearby_radius_m, groups: [], highlight_lines: [], errors: [{ category: "all", message: err.message }] };
    }
  }

  const { valid, errors } = await validateAgainstSchema("google.schema.json", googleOut);
  if (!valid) {
    throw new GoogleEngineError("ERR_GOOG_SCHEMA", `Output failed schema validation: ${JSON.stringify(errors)}`);
  }

  return googleOut;
}

/**
 * Free-form "check this location" lookup for the LINE bot (23_PAGE_STUDIO.md §3.6) -- no
 * property_id, no schema validation against the full PROPERTY_OUT-adjacent contract,
 * just geocode + nearby highlights for whatever address, map link, or coordinate pair a
 * customer pastes into chat. runGoogleEngine() stays the one used by the video pipeline,
 * where a property_id always exists; this is the one path in the system that legitimately
 * doesn't have one.
 *
 * @param {string} rawInput  address, coordinates, or a Google Maps link
 */
export async function checkLocation(rawInput, { googleMapsApiKey, radius_m = 5000 } = {}) {
  if (!rawInput || !rawInput.trim()) {
    throw new GoogleEngineError("ERR_GOOG_INPUT", "ต้องระบุที่อยู่ ลิงก์แผนที่ หรือพิกัด");
  }
  const apiKey = googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new GoogleEngineError("ERR_GOOG_NO_API_KEY", "GOOGLE_MAPS_API_KEY is not set -- see .env.example");
  }

  const { lat, lng, formatted_address, input_kind } = await resolveGeocode(rawInput, apiKey);

  let nearby = { radius_m, groups: [], highlight_lines: [], errors: [] };
  try {
    const found = await findNearbyPlaces({ lat, lng, radius: radius_m, apiKey });
    nearby = {
      radius_m: found.radius_m,
      groups: found.groups,
      highlight_lines: toHighlightLines(found.groups),
      errors: found.errors,
    };
  } catch (err) {
    nearby.errors = [{ category: "all", message: err.message }];
  }

  return { lat, lng, formatted_address, input_kind, nearby };
}
