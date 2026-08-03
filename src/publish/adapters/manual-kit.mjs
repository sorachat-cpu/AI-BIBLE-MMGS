// "Everything ready, you just press post" kit.
//
// This exists because Facebook Groups genuinely cannot be automated: Meta removed the
// publish_to_groups permission and the /{group-id}/feed publishing endpoint in 2020,
// and there is no replacement. Marketplace has no posting API either. So instead of
// pretending, the kit assembles the post offline -- clip, cover frame, stills, and the
// exact caption in a .txt ready to select-all-copy -- and the human pastes it once per
// group. That takes the per-post work down to a paste, without any automation that
// would risk the account.
import { mkdir, copyFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ffmpeg, OUTPUT_DIR } from "../../lib/ffmpeg.mjs";

export const KIT_ROOT = path.join(OUTPUT_DIR, "post-kits");

function slugify(text) {
  return (
    String(text ?? "")
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "post"
  );
}

/** Pull a still from the clip for use as the group-post cover / LINE preview image. */
async function extractCover(videoPath, destPath, atSeconds = 1) {
  try {
    await ffmpeg(["-y", "-ss", String(atSeconds), "-i", videoPath, "-frames:v", "1", "-q:v", "2", destPath], {
      timeoutMs: 60_000,
    });
    return destPath;
  } catch {
    return null; // a missing cover must not fail the whole kit
  }
}

/**
 * @returns {{ kit_dir: string, files: string[], caption_file: string }}
 */
export async function buildKit({
  slug,
  caption,
  captionsByPlatform = {},
  videoPath,
  imagePaths = [],
  photoUrl,
  post = {},
  targets = ["กลุ่ม Facebook"],
}) {
  const dir = path.join(KIT_ROOT, slugify(slug));
  await mkdir(dir, { recursive: true });

  const files = [];

  // Listings recovered from old page posts carry the photo of that exact plot. Fetching
  // it here is what makes a group post postable without going to find the picture again.
  if (photoUrl) {
    try {
      const res = await fetch(photoUrl);
      if (res.ok) {
        const dest = path.join(dir, "photo.jpg");
        await writeFile(dest, Buffer.from(await res.arrayBuffer()));
        files.push(dest);
      }
    } catch {
      // A missing photo is a smaller problem than a kit that failed to build.
    }
  }

  if (videoPath) {
    const dest = path.join(dir, "clip.mp4");
    await copyFile(videoPath, dest);
    files.push(dest);
    const cover = await extractCover(dest, path.join(dir, "cover.jpg"));
    if (cover) files.push(cover);
  }

  for (const [i, img] of imagePaths.entries()) {
    const dest = path.join(dir, `image-${String(i + 1).padStart(2, "0")}${path.extname(img) || ".jpg"}`);
    await copyFile(img, dest);
    files.push(dest);
  }

  // The plain .txt is the one the human actually uses -- no markdown, no headers, so
  // select-all-copy pastes clean into the Facebook composer.
  const captionFile = path.join(dir, "caption.txt");
  await writeFile(captionFile, `${caption}\n`, "utf8");
  files.push(captionFile);

  for (const [platform, text] of Object.entries(captionsByPlatform)) {
    if (platform === "MANUAL_KIT" || !text) continue;
    const f = path.join(dir, `caption-${platform.toLowerCase()}.txt`);
    await writeFile(f, `${text}\n`, "utf8");
    files.push(f);
  }

  const readme = [
    `# ชุดโพสต์: ${post.title || slug}`,
    "",
    `สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}`,
    `ใช้กับ: ${targets.join(", ")}`,
    "",
    "## วิธีใช้",
    "1. เปิด `caption.txt` แล้วกด Cmd+A, Cmd+C",
    "2. เปิดกลุ่มที่จะโพสต์ วางข้อความ",
    videoPath
      ? "3. แนบ `clip.mp4` (ถ้ากลุ่มไม่รับวิดีโอ ใช้ `cover.jpg` แทน)"
      : files.some((f) => f.endsWith(".jpg") || f.endsWith(".png"))
        ? "3. แนบรูปในโฟลเดอร์นี้"
        : "3. แนบรูปที่ดินแปลงนี้เอง (ชุดนี้มีแต่ข้อความ)",
    "4. กดโพสต์",
    "",
    "## ไฟล์ในชุดนี้",
    ...files.map((f) => `- ${path.basename(f)}`),
    "",
    "## ข้อมูลทรัพย์",
    `- ราคา: ${post.price_thb ?? "-"}`,
    `- ทำเล: ${post.location || post.raw_address || "-"}`,
    `- จุดเด่น: ${(post.highlight_features ?? []).join(", ") || "-"}`,
    post.maps_url ? `- แผนที่: ${post.maps_url}` : "",
  ].filter(Boolean).join("\n");
  const readmeFile = path.join(dir, "README.md");
  await writeFile(readmeFile, `${readme}\n`, "utf8");
  files.push(readmeFile);

  return { kit_dir: dir, files: files.map((f) => path.relative(OUTPUT_DIR, f)), caption_file: captionFile };
}

/** List kits already built, newest first, for the console. */
export async function listKits() {
  let entries;
  try {
    entries = await readdir(KIT_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }
  const kits = [];
  for (const e of entries.filter((x) => x.isDirectory())) {
    const dir = path.join(KIT_ROOT, e.name);
    const files = await readdir(dir).catch(() => []);
    kits.push({ slug: e.name, kit_dir: dir, files });
  }
  return kits.reverse();
}
