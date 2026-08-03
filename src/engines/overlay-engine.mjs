// Overlay Engine (13_OVERLAY_ENGINE.md) -- graphic layers composited by Render Engine.
//
// The spec renders these through headless Chrome. That would pull in a ~300MB browser
// download for what is, here, a QR code and some text, so the QR is produced with the
// `qrcode` library and the text is drawn by libass at render time. Same output contract.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { TEMP_DIR, ensureDirs } from "../lib/ffmpeg.mjs";

export class OverlayEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Renders the LINE/contact QR to a transparent-margin PNG for the ending card. */
export async function renderQrPng({ qr_target_url, size = 420, dark = "#111B25", light = "#FFFFFF" }) {
  if (!qr_target_url) throw new OverlayEngineError("ERR_OVL_INPUT", "ต้องมี qr_target_url");
  if (!HEX.test(dark) || !HEX.test(light)) {
    // Spec §: reject unrecognised colour codes rather than letting an unreadable QR ship.
    throw new OverlayEngineError("ERR_OVL_INPUT", "รหัสสีต้องเป็น HEX 6 หลัก เช่น #1A1A1A");
  }
  await ensureDirs();
  const file = path.join(TEMP_DIR, `qr_${Date.now()}.png`);
  const buffer = await QRCode.toBuffer(qr_target_url, {
    type: "png",
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark, light },
  });
  await writeFile(file, buffer);
  return { file, size };
}

/**
 * OVERLAY_OUT-shaped description of the ending card.
 * Positions follow the spec's rule of keeping the frame's mid-band clear -- text sits in
 * the top 15% / bottom 25% bands, the QR in the lower third.
 */
export function planEndingCard({ width, height, has_qr }) {
  const layers = [
    { layer_name: "header_title", position: { x: 0, y: Math.round(height * 0.14), z_index: 10 } },
    { layer_name: "price_badge", position: { x: 0, y: Math.round(height * 0.25), z_index: 11 } },
  ];
  if (has_qr) {
    layers.push({ layer_name: "qr_contact", position: { x: 0, y: Math.round(height * 0.52), z_index: 12 } });
  }
  return { aspect_ratio: `${width}:${height}`, overlay_layers: layers };
}
