#!/usr/bin/env node
// One-time (and re-runnable) migration: every listing's photo_url is currently a
// Facebook CDN link with a signed expiry -- typically a couple of weeks, per the `oe=`
// query param -- and by the time a LINE customer actually looked at a card, every single
// one of the 60 photo_url values in the sheet had already expired (403). This re-fetches
// a fresh URL for each listing straight from the source Facebook post (Graph API, our own
// page's post, so no extra permission needed beyond the page token already in use),
// downloads the bytes once, and rewrites photo_url to our own server's /media/ route
// (added in server.mjs) -- a URL that never expires because we're the one serving it. It
// also backfills listings that never got a photo_url at all, not only ones with a
// (now-expired) link -- see backfillPhotos() in content/listings.mjs for the actual logic,
// shared with the POST /api/listings/rehost-photos route so this can run against
// production too, wherever the real persistent content/ volume actually lives.
//
//   node --env-file-if-exists=.env src/cli/rehost-photos.mjs
import { backfillPhotos } from "../content/listings.mjs";

async function main() {
  const result = await backfillPhotos({
    onProgress: ({ index, total, id }) => process.stdout.write(`\r[${index}/${total}] ${id}...`),
  });
  process.stdout.write("\n");
  for (const r of result.results) {
    if (r.status === "ok") console.log(`✓ ${r.listing_id} (${r.source})`);
    else console.error(`✗ ${r.listing_id}: ${r.error}`);
  }
  console.log(
    `\nเสร็จ: rehosted=${result.rehosted} skipped(already)=${result.skippedAlready} ` +
    `skipped(no source)=${result.skippedNoSource} failed=${result.failed}`
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
