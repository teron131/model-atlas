/** Rebuild the Glacier poster from the shipped video without modifying the video itself. */
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

const run = promisify(execFile);
const source = resolve("public/signatures/glacier/glacier-digital-flower.mp4");
const staging = resolve(".cache/glacier-build");
const destination = resolve("public/signatures/glacier");

await mkdir(staging, { recursive: true });
await mkdir(destination, { recursive: true });
try {
  const still = resolve(staging, "poster.png");
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-threads",
    "1",
    "-i",
    source,
    "-frames:v",
    "1",
    still,
  ]);
  await sharp(await readFile(still))
    .webp({ quality: 90 })
    .toFile(resolve(staging, "glacier-digital-flower-poster.webp"));
  const poster = resolve(destination, "glacier-digital-flower-poster.webp");
  await rename(resolve(staging, "glacier-digital-flower-poster.webp"), poster);
  console.log(`Glacier poster: ${(await stat(poster)).size} bytes`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
