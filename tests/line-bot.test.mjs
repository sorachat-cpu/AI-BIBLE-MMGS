// Tests for the LINE bot's pure/deterministic parts only. No Claude call, no disk I/O:
// the tool loop itself (line-bot-engine.mjs's runLineBot) needs ANTHROPIC_API_KEY and a
// real round-trip, same reason property-engine.mjs has no test file either.
//
//   node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature } from "../src/publish/adapters/line.mjs";
import {
  filterListings, buildListingCardFlex,
  buildListingsCarouselFlex, buildCategoryMenuFlex,
  buildProvinceMenuFlex, buildAreaMenuFlex,
} from "../src/engines/line-bot-engine.mjs";

/** Every button label in a Flex JSON tree, wherever it's nested (bubble or carousel). */
function collectButtonLabels(node, out = []) {
  if (Array.isArray(node)) {
    for (const n of node) collectButtonLabels(n, out);
  } else if (node && typeof node === "object") {
    if (node.type === "button" && node.action?.label) out.push(node.action.label);
    for (const v of Object.values(node)) collectButtonLabels(v, out);
  }
  return out;
}

function sign(secret, body) {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

test("verifySignature accepts a correctly signed body", () => {
  const secret = "test-secret";
  const body = '{"events":[]}';
  assert.equal(
    verifySignature({ channelSecret: secret, rawBody: body, signatureHeader: sign(secret, body) }),
    true
  );
});

test("verifySignature rejects a body that does not match the signature", () => {
  const secret = "test-secret";
  const signedFor = '{"events":[]}';
  const tampered = '{"events":[{"evil":true}]}';
  assert.equal(
    verifySignature({ channelSecret: secret, rawBody: tampered, signatureHeader: sign(secret, signedFor) }),
    false
  );
});

test("verifySignature rejects when the channel secret is missing", () => {
  const body = '{"events":[]}';
  assert.equal(
    verifySignature({ channelSecret: undefined, rawBody: body, signatureHeader: sign("whatever", body) }),
    false
  );
});

test("verifySignature rejects a differently-signed request without throwing on length mismatch", () => {
  assert.equal(
    verifySignature({ channelSecret: "test-secret", rawBody: "{}", signatureHeader: "short" }),
    false
  );
});

const SAMPLE_LISTINGS = [
  { listing_id: "LAND-1", status: "NEW", title: "ที่ดินนครนายก ติดเขา", price_thb: 700_000, location: "นครนายก", highlights: ["ติดถนน"] },
  { listing_id: "LAND-2", status: "READY", title: "ที่ดินปราจีนบุรี", price_thb: 2_500_000, location: "ปราจีนบุรี", highlights: [] },
  { listing_id: "LAND-3", status: "SOLD", title: "ที่ดินนครนายก ขายแล้ว", price_thb: 500_000, location: "นครนายก", highlights: [] },
  { listing_id: "LAND-4", status: "HIDDEN", title: "ที่ดินซ่อนไว้", price_thb: 300_000, location: "นครนายก", highlights: [] },
];

test("filterListings drops SOLD and HIDDEN regardless of other filters", () => {
  const result = filterListings(SAMPLE_LISTINGS, {});
  assert.deepEqual(result.map((r) => r.listing_id), ["LAND-1", "LAND-2"]);
});

test("filterListings applies a budget ceiling", () => {
  const result = filterListings(SAMPLE_LISTINGS, { max_budget_thb: 1_000_000 });
  assert.deepEqual(result.map((r) => r.listing_id), ["LAND-1"]);
});

test("filterListings matches a keyword against title, location and highlights", () => {
  const result = filterListings(SAMPLE_LISTINGS, { keyword: "ติดเขา" });
  assert.deepEqual(result.map((r) => r.listing_id), ["LAND-1"]);
});

test("filterListings returns a listing matching only one of several keywords, not zero", () => {
  // LAND-1 matches "ติดเขา" but not "ริมคลอง"; LAND-2 matches neither. Requiring ALL terms
  // would return nothing for either -- this is exactly the "ตอบมั่ว" failure mode a real
  // customer hit: three specs given, no listing satisfies every one, strict AND matching
  // returned empty, and the model had to improvise. OR matching means LAND-1 still shows.
  const result = filterListings(SAMPLE_LISTINGS, { keywords: ["ติดเขา", "ริมคลอง"] });
  assert.deepEqual(result.map((r) => r.listing_id), ["LAND-1"]);
});

test("filterListings ranks a listing matching more keywords above one matching fewer", () => {
  const listings = [
    { listing_id: "ONE-MATCH", status: "NEW", title: "ที่ดินติดถนน", price_thb: 1, location: "นครนายก", highlights: [] },
    { listing_id: "TWO-MATCH", status: "NEW", title: "ที่ดินติดถนน ติดคลอง", price_thb: 1, location: "นครนายก", highlights: [] },
  ];
  const result = filterListings(listings, { keywords: ["ติดถนน", "ติดคลอง"] });
  assert.deepEqual(result.map((r) => r.listing_id), ["TWO-MATCH", "ONE-MATCH"]);
});

test("filterListings matches a 'ตำบล<place>' search term against a raw location with no 'ตำบล' in it", () => {
  // The real bug report: a customer's own search term "ตำบลหินตั้ง" against a real, in-stock
  // listing whose location field is just "หินตั้ง เมือง นครนายก" -- as every actual post in
  // content/listings.json is, since sellers never type the word "ตำบล" themselves. A naive
  // substring match fails this exact case; stripAdminPrefixes on both sides is the fix.
  const listings = [
    { listing_id: "LAND-HINTANG", status: "NEW", title: "ที่ดินติดแม่น้ำนครนายก", price_thb: 1_000_000, location: "หินตั้ง เมือง นครนายก", highlights: [] },
  ];
  const result = filterListings(listings, { keywords: ["ตำบลหินตั้ง"] });
  assert.deepEqual(result.map((r) => r.listing_id), ["LAND-HINTANG"]);
});

test("filterListings still enforces the budget ceiling as a hard filter alongside keywords", () => {
  const result = filterListings(SAMPLE_LISTINGS, { max_budget_thb: 1_000_000, keywords: ["ปราจีนบุรี"] });
  // LAND-2 matches the keyword but is over budget; nothing else matches the keyword at all.
  assert.deepEqual(result, []);
});

test("filterListings caps results at ten (matches the carousel's own cap, not lower)", () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    listing_id: `LAND-${i}`,
    status: "NEW",
    title: "แปลง",
    price_thb: 1,
    location: "",
    highlights: [],
  }));
  assert.equal(filterListings(many, {}).length, 10);
});

const SAMPLE_CARD_LISTING = {
  listing_id: "LAND-1",
  title: "ที่ดินนครนายก ติดเขา",
  price_text: "7 แสนบาท",
  price_thb: 700_000,
  location: "นครนายก",
  highlights: ["ติดถนน", "น้ำไฟพร้อม"],
  photo_url: "https://example.com/photo.jpg",
};

test("buildListingCardFlex includes a hero image when photo_url is set", () => {
  const { contents } = buildListingCardFlex(SAMPLE_CARD_LISTING);
  assert.equal(contents.type, "bubble");
  assert.equal(contents.hero.type, "image");
  assert.equal(contents.hero.url, SAMPLE_CARD_LISTING.photo_url);
});

test("buildListingCardFlex omits hero entirely when photo_url is null", () => {
  const { contents } = buildListingCardFlex({ ...SAMPLE_CARD_LISTING, photo_url: null });
  assert.equal("hero" in contents, false);
});

test("buildListingCardFlex button labels stay within LINE's 20-codepoint cap", () => {
  const { contents } = buildListingCardFlex(SAMPLE_CARD_LISTING);
  for (const button of contents.footer.contents) {
    assert.ok([...button.action.label].length <= 20, `label too long: ${button.action.label}`);
  }
});

test("buildListingCardFlex button text payloads carry the real listing_id", () => {
  const { contents } = buildListingCardFlex(SAMPLE_CARD_LISTING);
  for (const button of contents.footer.contents) {
    assert.ok(
      button.action.text.includes("LAND-1") || button.action.text.includes("แอดมิน"),
      `unexpected button text: ${button.action.text}`
    );
  }
});

test("buildListingCardFlex caps altText at 400 characters even with a very long title", () => {
  const { altText } = buildListingCardFlex({ ...SAMPLE_CARD_LISTING, title: "ก".repeat(500) });
  assert.ok([...altText].length <= 400);
});

test("buildListingCardFlex degrades cleanly with no highlights", () => {
  const { contents } = buildListingCardFlex({ ...SAMPLE_CARD_LISTING, highlights: [] });
  const hasSeparator = contents.body.contents.some((c) => c.type === "separator");
  assert.equal(hasSeparator, false);
});

test("buildListingCardFlex uses the single white-gold palette (day/night switching was dropped)", () => {
  const { contents } = buildListingCardFlex(SAMPLE_CARD_LISTING);
  const priceNode = contents.body.contents.find((c) => c.text === SAMPLE_CARD_LISTING.price_text);
  assert.equal(priceNode.color, "#E0A05C");
  assert.equal(contents.body.backgroundColor, "#FFFFFF");
});

const SAMPLE_CAROUSEL_LISTINGS = [
  { ...SAMPLE_CARD_LISTING, listing_id: "LAND-1", source_post_url: "https://www.facebook.com/1050500211482963/posts/1" },
  { ...SAMPLE_CARD_LISTING, listing_id: "LAND-2", photo_url: null, source_post_url: null },
];

test("buildListingsCarouselFlex builds one bubble per listing, in a carousel container", () => {
  const { contents } = buildListingsCarouselFlex(SAMPLE_CAROUSEL_LISTINGS);
  assert.equal(contents.type, "carousel");
  assert.equal(contents.contents.length, 2);
  assert.ok(contents.contents.every((b) => b.type === "bubble"));
});

test("buildListingsCarouselFlex caps bubbles even when given more listings than LINE allows", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ ...SAMPLE_CARD_LISTING, listing_id: `LAND-${i}` }));
  const { contents } = buildListingsCarouselFlex(many);
  assert.ok(contents.contents.length <= 12, `carousel exceeded LINE's 12-bubble cap: ${contents.contents.length}`);
});

test("buildListingsCarouselFlex includes an external link button only when source_post_url exists", () => {
  const { contents } = buildListingsCarouselFlex(SAMPLE_CAROUSEL_LISTINGS);
  const [withUrl, withoutUrl] = contents.contents;
  const linkButtons = (bubble) => bubble.footer.contents.filter((b) => b.action.type === "uri");
  assert.equal(linkButtons(withUrl).length, 1);
  assert.equal(linkButtons(withUrl)[0].action.uri, SAMPLE_CAROUSEL_LISTINGS[0].source_post_url);
  assert.equal(linkButtons(withoutUrl).length, 0);
});

test("buildListingsCarouselFlex omits hero for a listing with no photo", () => {
  const { contents } = buildListingsCarouselFlex(SAMPLE_CAROUSEL_LISTINGS);
  assert.ok("hero" in contents.contents[0]);
  assert.ok(!("hero" in contents.contents[1]));
});

test("buildListingsCarouselFlex button labels stay within LINE's 20-codepoint cap", () => {
  const flex = buildListingsCarouselFlex(SAMPLE_CAROUSEL_LISTINGS);
  for (const label of collectButtonLabels(flex.contents)) {
    assert.ok([...label].length <= 20, `label too long: ${label}`);
  }
});

test("buildCategoryMenuFlex returns a single bubble with a stack of buttons", () => {
  const { contents } = buildCategoryMenuFlex();
  assert.equal(contents.type, "bubble");
  assert.ok(contents.footer.contents.length >= 4);
  assert.ok(contents.footer.contents.every((b) => b.type === "button"));
});

test("buildCategoryMenuFlex button labels stay within LINE's 20-codepoint cap", () => {
  const flex = buildCategoryMenuFlex();
  for (const label of collectButtonLabels(flex.contents)) {
    assert.ok([...label].length <= 20, `label too long: ${label}`);
  }
});

test("buildCategoryMenuFlex uses the white-gold palette", () => {
  const { contents } = buildCategoryMenuFlex();
  assert.equal(contents.body.backgroundColor, "#FFFFFF");
});

test("buildCategoryMenuFlex includes a uri button linking to the real Facebook page", () => {
  const { contents } = buildCategoryMenuFlex();
  const pageLinkButton = contents.footer.contents.find((b) => b.action.type === "uri");
  assert.ok(pageLinkButton, "expected a uri-action button linking to the page");
  assert.equal(pageLinkButton.action.uri, "https://www.facebook.com/122123974208736301");
});

const LOCATION_SAMPLE = [
  { location: "สาริกา เมือง นครนายก" },
  { location: "สาริกา เมืองนครนายก" },
  { location: "ศรีนาวา เมือง นครนายก" },
  { location: "เนินหอม ปราจีนบุรี" },
];

test("buildProvinceMenuFlex puts one button per distinct province, busiest first", () => {
  const { contents } = buildProvinceMenuFlex(LOCATION_SAMPLE);
  const labels = collectButtonLabels(contents);
  assert.equal(labels.length, 2);
  assert.match(labels[0], /^นครนายก/);
  assert.match(labels[1], /^ปราจีนบุรี/);
});

test("buildProvinceMenuFlex button text is the exact deterministic trigger server.mjs matches", () => {
  const { contents } = buildProvinceMenuFlex(LOCATION_SAMPLE);
  const actionTexts = contents.footer.contents.map((b) => b.action.text);
  assert.ok(actionTexts.includes("ทำเลจังหวัดนครนายก"));
});

test("buildAreaMenuFlex only lists areas within the requested province", () => {
  const { contents } = buildAreaMenuFlex(LOCATION_SAMPLE, "นครนายก");
  const actionTexts = contents.footer.contents.map((b) => b.action.text);
  assert.deepEqual(actionTexts.sort(), ["ทำเลตำบลศรีนาวา", "ทำเลตำบลสาริกา"]);
});

test("buildProvinceMenuFlex and buildAreaMenuFlex button labels stay within LINE's 20-codepoint cap", () => {
  for (const flex of [buildProvinceMenuFlex(LOCATION_SAMPLE), buildAreaMenuFlex(LOCATION_SAMPLE, "นครนายก")]) {
    for (const label of collectButtonLabels(flex.contents)) {
      assert.ok([...label].length <= 20, `label too long: ${label}`);
    }
  }
});
