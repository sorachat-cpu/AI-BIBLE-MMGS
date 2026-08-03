// Location input parsing + distance maths.
//
// Brokers paste whatever Google Maps gave them -- a share link, a long place URL, or a
// pair of coordinates copied off the app. All of those should work without a round trip
// to the Geocoding API, which is both slower and billable.

const COORD = "(-?\\d{1,3}\\.\\d+)";

const URL_PATTERNS = [
  new RegExp(`@${COORD},${COORD}`),          // /maps/@14.70,101.41,15z
  new RegExp(`!3d${COORD}!4d${COORD}`),      // place URLs embed the true pin here
  new RegExp(`[?&]q=${COORD},\\s*${COORD}`), // ?q=14.70,101.41
  new RegExp(`[?&]ll=${COORD},\\s*${COORD}`),
  new RegExp(`[?&]center=${COORD},\\s*${COORD}`),
  new RegExp(`^\\s*${COORD}\\s*,\\s*${COORD}\\s*$`), // bare "14.70, 101.41"
];

function isPlausible(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function matchCoords(text) {
  for (const pattern of URL_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isPlausible(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

/**
 * Works out what the user pasted.
 * @returns {Promise<{kind:'coords', lat, lng} | {kind:'address', address:string}>}
 */
export async function parseLocationInput(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("ยังไม่ได้ใส่ตำแหน่ง");

  const direct = matchCoords(text);
  if (direct) return { kind: "coords", ...direct };

  // Short links carry no coordinates until they are resolved, so follow the redirect
  // and re-parse whatever the expanded URL contains.
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text)) {
    try {
      const res = await fetch(text, { redirect: "follow" });
      const expanded = matchCoords(res.url);
      if (expanded) return { kind: "coords", ...expanded };
      const body = await res.text();
      const inBody = matchCoords(body);
      if (inBody) return { kind: "coords", ...inBody };
    } catch {
      // fall through -- treat it as an address and let geocoding try
    }
  }

  // A long maps URL with a place name but no usable coordinates: pull the readable
  // place name out of the path and geocode that rather than the whole URL.
  const placeName = text.match(/\/maps\/place\/([^/@]+)/);
  if (placeName) {
    return { kind: "address", address: decodeURIComponent(placeName[1].replace(/\+/g, " ")) };
  }

  return { kind: "address", address: text };
}

/** Great-circle distance in metres. */
export function distanceMeters(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(metres) {
  return metres < 1000 ? `${metres} ม.` : `${(metres / 1000).toFixed(1)} กม.`;
}
