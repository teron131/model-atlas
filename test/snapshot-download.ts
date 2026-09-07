/** Exercise real GCS download pipelines locally, including large responses, checksum failures, and bounded listener warnings. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { CRC32C, Storage } from "@google-cloud/storage";

import { SnapshotStorage } from "../src/model-atlas/database/snapshots/gcs";
import {
  snapshotDataHash,
  snapshotHash,
  snapshotObject,
} from "../src/model-atlas/database/snapshots/manifest";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

const checkpoint = randomBytes(2 * 1024 * 1024);
const payload = minimalModelAtlasPayload({
  fetchedAt: 1,
  models: [minimalModelAtlasModel({ id: "test/download", name: "Download" })],
});
const compressedCheckpoint = gzipSync(checkpoint);
const compressedPayload = gzipSync(JSON.stringify(payload));
const manifest = {
  version: "test-version",
  data_sha256: snapshotDataHash(payload),
  fetched_at_epoch_seconds: 1,
  payload_sha256: snapshotHash(compressedPayload),
  checkpoint_sha256: snapshotHash(compressedCheckpoint),
};
const objects = new Map([
  [snapshotObject(manifest.version, "checkpoint"), compressedCheckpoint],
  [snapshotObject(manifest.version, "payload"), compressedPayload],
]);
let corruptChecksum = false;
const server = createServer((request, response) => {
  const url = new URL(request.url!, "http://127.0.0.1");
  const key = decodeURIComponent(url.pathname.split("/o/")[1] ?? "");
  const bytes = objects.get(key);
  if (!bytes) {
    response.writeHead(404);
    response.end();
    return;
  }
  const crc = new CRC32C();
  crc.update(bytes);
  response.writeHead(200, {
    "x-goog-hash": `crc32c=${corruptChecksum ? "AAAAAA==" : crc.toString()}`,
    "x-goog-stored-content-encoding": "identity",
    "content-length": bytes.length,
  });
  response.end(bytes);
});
const warnings: Error[] = [];
const onWarning = (warning: Error) => {
  if (warning.name === "MaxListenersExceededWarning") warnings.push(warning);
};
process.on("warning", onWarning);
const cacheRoot = resolve(".cache");
await mkdir(cacheRoot, { recursive: true });
const workspace = await mkdtemp(join(cacheRoot, "snapshot-download-test-"));
try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const storage = new Storage({
    projectId: "local-test",
    apiEndpoint: `http://127.0.0.1:${address.port}`,
    useAuthWithCustomEndpoint: false,
  });
  const snapshots = new SnapshotStorage("local-public", "local-private", storage);
  for (let i = 0; i < 3; i++) {
    const destination = join(workspace, `${i}.sqlite`);
    assert.deepEqual(await snapshots.restore(manifest, destination), payload);
    assert.deepEqual(await readFile(destination), checkpoint);
  }
  corruptChecksum = true;
  await assert.rejects(snapshots.restore(manifest, join(workspace, "corrupt.sqlite")), {
    code: "CONTENT_DOWNLOAD_MISMATCH",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(
    warnings.length,
    0,
    "Large downloads must not exceed the response-specific listener budget",
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.removeListener("warning", onWarning);
  await rm(workspace, { recursive: true, force: true });
}
