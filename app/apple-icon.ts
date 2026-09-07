/** Render the Apple touch icon from the same SVG used by the header and browser tab. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

/** Generate the raster required by Apple devices without maintaining a second logo asset. */
export default async function AppleIcon() {
  const svg = await readFile(join(process.cwd(), "app/icon.svg"));
  const png = await sharp(svg).resize(size.width, size.height).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": contentType } });
}
