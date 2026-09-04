/** Proves atomic publication, private checkpoint recovery, and cloud-only display reads even in local development. */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Storage } from "@google-cloud/storage";

import { GET } from "../app/api/llm-stats/route";
import { readDisplaySnapshotPayload } from "../src/model-atlas/database/runtime-snapshot";
import { SnapshotStorage } from "../src/model-atlas/database/snapshots/gcs";
import {
  parseSnapshotManifest,
  snapshotDataHash,
  snapshotObject,
  snapshotVersions,
} from "../src/model-atlas/database/snapshots/manifest";
import { minimalModelAtlasModel, minimalModelAtlasPayload } from "./model-atlas-fixtures";

type StoredObject = { bytes: Buffer; generation: string; metadata: Record<string, unknown> };
const objects = new Map<string, StoredObject>();
let generation = 0;
let failUpload = false;
let loseCommitResponse = false;
let failRetirement = false;
let publishBeforeLostResponse: (() => Promise<void>) | null = null;
const storage = {
  bucket(bucket: string) {
    return {
      file(name: string, options?: { generation: string }) {
        const key = `${bucket}/${name}`;
        const get = () => {
          const object = objects.get(key);
          if (!object || (options?.generation && options.generation !== object.generation)) {
            throw Object.assign(new Error("Not found"), { code: 404 });
          }
          return object;
        };
        return {
          async getMetadata() {
            return [{ generation: get().generation }];
          },
          async download() {
            return [get().bytes];
          },
          async save(
            bytes: Buffer,
            options: {
              preconditionOpts: { ifGenerationMatch: string | number };
              metadata: Record<string, unknown>;
            },
          ) {
            if (failUpload && name.endsWith("payload.json.gz"))
              throw new Error("Interrupted upload");
            if (name.endsWith("payload.json.gz")) assert.equal(bucket, "public-bucket");
            if (name.endsWith("database.sqlite.gz")) assert.equal(bucket, "private-bucket");
            const expected = String(options.preconditionOpts.ifGenerationMatch);
            if (expected !== (objects.get(key)?.generation ?? "0")) {
              throw Object.assign(new Error("Precondition failed"), { code: 412 });
            }
            objects.set(key, {
              bytes,
              generation: String(++generation),
              metadata: options.metadata,
            });
            if (name === "current.json" && publishBeforeLostResponse) {
              const publish = publishBeforeLostResponse;
              publishBeforeLostResponse = null;
              await publish();
              throw new Error("Lost commit response after a newer publication");
            }
            if (loseCommitResponse && name === "current.json")
              throw new Error("Lost commit response");
          },
          async setMetadata(metadata: Record<string, unknown>) {
            if (failRetirement) throw new Error("Retirement unavailable");
            Object.assign(get().metadata, metadata);
          },
        };
      },
    };
  },
} as unknown as Storage;

await mkdir(".cache", { recursive: true });
const workspace = await mkdtemp(".cache/snapshot-test-");
const originalFetch = globalThis.fetch;
const originalBucket = process.env.MODEL_ATLAS_SNAPSHOT_BUCKET;
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
};
const originalNow = Date.now;
try {
  const checkpoint = join(workspace, "database.sqlite");
  const checkpointBytes = Buffer.alloc(256 * 1024);
  for (let index = 0; index < checkpointBytes.length; index++) checkpointBytes[index] = index % 251;
  await writeFile(checkpoint, checkpointBytes);
  const payload = minimalModelAtlasPayload({
    fetchedAt: 100,
    models: [minimalModelAtlasModel({ id: "test/model", name: "Test model" })],
  });
  const store = new SnapshotStorage("public-bucket", "private-bucket", storage);
  assert.throws(() => new SnapshotStorage("same", "same", storage), /separate/);
  assert.throws(() => parseSnapshotManifest({ version: "../private" }), /invalid/);
  const empty = await store.current();
  assert.deepEqual(empty, { manifest: null, generation: 0 });
  await assert.rejects(store.publish(checkpoint, { ...payload, models: [] }, empty), /empty/);
  await assert.rejects(store.publish(join(workspace, "missing.sqlite"), payload, empty), /ENOENT/);
  assert.equal(objects.size, 0, "Failed streaming reads must not start publication");
  const first = await store.publish(checkpoint, payload, empty);
  const committed = await store.current();
  assert.equal(committed.manifest?.version, first.manifest.version);
  assert.equal(
    objects.has(`public-bucket/${snapshotObject(first.manifest.version, "checkpoint")}`),
    false,
  );
  const restored = join(workspace, "restored.sqlite");
  assert.deepEqual(await store.restore(first.manifest, restored), payload);
  assert.deepEqual(
    await readFile(restored),
    checkpointBytes,
    "Multi-chunk compression restores every byte",
  );
  await assert.rejects(store.restore(first.manifest, restored), /EEXIST/);

  failUpload = true;
  await assert.rejects(store.publish(checkpoint, payload, committed), /publication failed/);
  assert.equal((await store.current()).manifest?.version, first.manifest.version);
  assert.equal(
    objects.get(`private-bucket/${snapshotObject(first.manifest.version, "checkpoint")}`)?.metadata
      .customTime,
    undefined,
  );
  failUpload = false;

  const competing = await Promise.allSettled([
    store.publish(checkpoint, payload, committed),
    store.publish(checkpoint, payload, committed),
  ]);
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
  assert.ok(
    objects.get(`private-bucket/${snapshotObject(first.manifest.version, "checkpoint")}`)?.metadata
      .customTime,
  );
  loseCommitResponse = true;
  const recoveredCommit = await store.publish(checkpoint, payload, await store.current());
  assert.equal((await store.current()).manifest?.version, recoveredCommit.manifest.version);
  loseCommitResponse = false;
  failRetirement = true;
  const warned = await store.publish(checkpoint, payload, await store.current());
  assert.equal(warned.maintenance_warnings.length, 2);
  assert.equal((await store.current()).manifest?.version, warned.manifest.version);
  failRetirement = false;

  Object.assign(process.env, { NODE_ENV: "development", VERCEL: "0" });
  delete process.env.MODEL_ATLAS_SNAPSHOT_BUCKET;
  await assert.rejects(readDisplaySnapshotPayload(), /MODEL_ATLAS_SNAPSHOT_BUCKET/);
  process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = "public-bucket";
  let clock = 1000;
  Date.now = () => clock;
  let manifestReads = 0;
  let payloadReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const object = objects.get(url.pathname.slice(1));
    assert.ok(object, `Unexpected object request: ${url.pathname}`);
    if (url.pathname.endsWith("current.json")) {
      manifestReads++;
      if (new Headers(init?.headers).get("if-none-match") === object.generation)
        return new Response(null, { status: 304 });
    } else payloadReads++;
    return new Response(new Uint8Array(object.bytes), { headers: { etag: object.generation } });
  };
  const [read, concurrent] = await Promise.all([
    readDisplaySnapshotPayload(),
    readDisplaySnapshotPayload(),
  ]);
  assert.equal(read, concurrent);
  assert.deepEqual(read.models, payload.models, "Local development must read the GCS snapshot");
  assert.equal(manifestReads, 1);
  assert.equal(payloadReads, 1);
  await readDisplaySnapshotPayload();
  assert.equal(manifestReads, 1);

  const url = "http://localhost/api/llm-stats?view=dashboard";
  const firstResponse = await GET(new Request(url));
  assert.equal(firstResponse.status, 200);
  assert.deepEqual(await firstResponse.json(), read);
  const etag = firstResponse.headers.get("etag")!;
  assert.ok(etag.startsWith('W/"'));
  assert.equal(firstResponse.headers.get("vary"), "x-model-atlas-view");
  assert.equal(firstResponse.headers.get("cache-control"), "public, max-age=60");
  for (const validator of [etag, etag.slice(2), `"other", ${etag}`, "*"]) {
    const response = await GET(new Request(url, { headers: { "If-None-Match": validator } }));
    assert.equal(response.status, 304);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("etag"), etag);
  }
  const scoreResponse = await GET(
    new Request("http://localhost/api/llm-stats", {
      headers: { "If-None-Match": etag },
    }),
  );
  assert.equal(
    scoreResponse.status,
    200,
    "An ETag for a different view must not suppress the body",
  );
  const scoreEtag = scoreResponse.headers.get("etag")!;
  const unknownView = await GET(
    new Request("http://localhost/api/llm-stats?view=unknown", {
      headers: { "If-None-Match": scoreEtag },
    }),
  );
  assert.equal(unknownView.status, 304, "Unknown views share the default representation");
  const allResponse = await GET(new Request("http://localhost/api/llm-stats?view=all"));
  const fullResponse = await GET(
    new Request("http://localhost/api/llm-stats", {
      headers: { "x-model-atlas-view": "full", "If-None-Match": allResponse.headers.get("etag")! },
    }),
  );
  assert.equal(fullResponse.status, 304, "Alias and header-selected views use the same validator");
  assert.equal(manifestReads, 1, "API revalidation reuses the existing snapshot freshness window");
  clock += 31_000;
  await readDisplaySnapshotPayload();
  assert.equal(manifestReads, 2);
  assert.equal(payloadReads, 1, "304 revalidation must not redownload the payload");

  const next = await store.publish(
    checkpoint,
    { ...payload, fetched_at_epoch_seconds: 200 },
    await store.current(),
  );
  clock += 31_000;
  const nextManifestObject = objects.get("public-bucket/current.json")!;
  const validManifestBytes = nextManifestObject.bytes;
  const invalidCheckpoint = join(workspace, "invalid-manifest.sqlite");
  for (const [manifest, error] of [
    [{ ...next.manifest, fetched_at_epoch_seconds: 201 }, /timestamp/],
    [{ ...next.manifest, data_sha256: "0".repeat(64) }, /fingerprint/],
  ] as const) {
    nextManifestObject.bytes = Buffer.from(JSON.stringify(manifest));
    await assert.rejects(readDisplaySnapshotPayload(), error);
    await assert.rejects(store.restore(manifest, invalidCheckpoint), error);
    await assert.rejects(readFile(invalidCheckpoint), { code: "ENOENT" });
  }
  nextManifestObject.bytes = validManifestBytes;
  const artifact = objects.get(
    `public-bucket/${snapshotObject(next.manifest.version, "payload")}`,
  )!;
  const goodBytes = artifact.bytes;
  artifact.bytes = Buffer.from("corrupted");
  clock += 31_000;
  await assert.rejects(readDisplaySnapshotPayload(), /checksum/);
  const failedResponse = await GET(new Request(url, { headers: { "If-None-Match": etag } }));
  assert.equal(
    failedResponse.status,
    500,
    "Failed snapshot validation must not return a stale 304",
  );
  assert.equal(failedResponse.headers.get("cache-control"), "no-store");
  artifact.bytes = goodBytes;
  assert.equal(
    (await readDisplaySnapshotPayload()).fetched_at_epoch_seconds,
    200,
    "failed reads must not cache the new ETag",
  );
  const changedResponse = await GET(new Request(url, { headers: { "If-None-Match": etag } }));
  assert.equal(changedResponse.status, 200);
  assert.notEqual(changedResponse.headers.get("etag"), etag);
  assert.equal((await changedResponse.json()).fetched_at_epoch_seconds, 200);

  const variant = minimalModelAtlasModel({ id: "test/other", name: "Other model" });
  const ordered = { ...payload, models: [...payload.models, variant] };
  const reordered = structuredClone(ordered);
  reordered.fetched_at_epoch_seconds = 500;
  reordered.models.reverse();
  reordered.models[0]!.benchmark_dates = { gpqa: "2026-09-03" };
  reordered.models[0]!.logo = "updated artwork";
  reordered.metadata.scoring.snapshot_preservation_version++;
  assert.equal(
    snapshotDataHash(ordered),
    snapshotDataHash(reordered),
    "Refresh metadata, artwork, and row ordering do not create data versions",
  );
  const observed = {
    ...ordered,
    benchmark_observations: {
      probe: [
        {
          model_id: "test/model",
          model: "Test model",
          base_model: "Test model",
          reasoning_effort: null,
          canonical_value: 0.5,
          observed_at: "2026-09-01",
        },
      ],
    },
  };
  const reobserved = structuredClone(observed);
  reobserved.benchmark_observations.probe[0]!.observed_at = "2026-09-02";
  assert.equal(snapshotDataHash(observed), snapshotDataHash(reobserved));
  reobserved.benchmark_observations.probe[0]!.canonical_value = 0.500001;
  assert.notEqual(
    snapshotDataHash(observed),
    snapshotDataHash(reobserved),
    "Real data changes have no arbitrary magnitude threshold",
  );
  for (const change of [
    { cost: { blended_price: 1.25 } },
    { speed: { ...variant.speed, e2e_latency_seconds_median: 5 } },
    { benchmarks: { gpqa: 0.75 } },
    { release_date: "2026-09-03" },
  ]) {
    const modified = { ...ordered, models: [{ ...variant, ...change }, ...payload.models] };
    assert.notEqual(snapshotDataHash(ordered), snapshotDataHash(modified));
  }

  const dataVersion = (score: number) => {
    const version = structuredClone(payload);
    version.fetched_at_epoch_seconds = 300 + score;
    for (const model of version.models) model.scores.speed_score = score;
    return version;
  };
  const a = (await store.current()).manifest!;
  await writeFile(checkpoint, "checkpoint B");
  const b = await store.publish(checkpoint, dataVersion(21), await store.current());
  assert.deepEqual(
    b.manifest.previous.map((entry) => entry.version),
    [a.version],
  );
  let refreshed = b;
  for (let run = 0; run < 4; run++) {
    await writeFile(checkpoint, `checkpoint B refresh ${run}`);
    refreshed = await store.publish(
      checkpoint,
      { ...dataVersion(21), fetched_at_epoch_seconds: 400 + run },
      await store.current(),
    );
    assert.deepEqual(
      refreshed.manifest.previous,
      b.manifest.previous,
      "Repeated identical data cannot displace a distinct recovery point",
    );
    assert.equal(refreshed.manifest.data_sha256, b.manifest.data_sha256);
  }
  const latestCheckpoint = join(workspace, "latest-bookkeeping.sqlite");
  await store.restore(refreshed.manifest, latestCheckpoint);
  assert.equal(await readFile(latestCheckpoint, "utf8"), "checkpoint B refresh 3");
  assert.equal(refreshed.manifest.fetched_at_epoch_seconds, 403);

  const c = await store.publish(checkpoint, dataVersion(22), await store.current());
  const d = await store.publish(checkpoint, dataVersion(23), await store.current());
  assert.deepEqual(
    d.manifest.previous.map((entry) => entry.version),
    [c.manifest.version, refreshed.manifest.version, a.version],
  );
  const e = await store.publish(checkpoint, dataVersion(24), await store.current());
  assert.deepEqual(
    e.manifest.previous.map((entry) => entry.version),
    [d.manifest.version, c.manifest.version, refreshed.manifest.version],
  );
  for (const entry of snapshotVersions(e.manifest)) {
    for (const [bucket, kind] of [
      ["public-bucket", "payload"],
      ["private-bucket", "checkpoint"],
    ] as const) {
      assert.equal(
        objects.get(`${bucket}/${snapshotObject(entry.version, kind)}`)!.metadata.customTime,
        undefined,
        "Current and three recovery versions are not eligible for timed cleanup",
      );
    }
  }
  assert.ok(
    objects.get(`public-bucket/${snapshotObject(a.version, "payload")}`)!.metadata.customTime,
    "Displaced data starts archive cleanup only after the new manifest commits",
  );
  assert.throws(() => parseSnapshotManifest({ ...e.manifest, previous: [e.manifest] }), /distinct/);

  const returned = await store.publish(checkpoint, dataVersion(22), await store.current());
  assert.equal(returned.manifest.previous.length, 3);
  assert.deepEqual(
    returned.manifest.previous.map((entry) => entry.version),
    [e.manifest.version, d.manifest.version, refreshed.manifest.version],
  );
  assert.equal(
    new Set(snapshotVersions(returned.manifest).map((entry) => entry.data_sha256)).size,
    4,
    "Returning to an older state cannot keep duplicate data in recovery slots",
  );

  const rollbackTarget = returned.manifest.previous[2]!;
  await assert.rejects(
    store.rollback("not-retained", join(workspace, "unknown.sqlite")),
    /recovery history/,
  );
  const rollbackArtifact = objects.get(
    `private-bucket/${snapshotObject(rollbackTarget.version, "checkpoint")}`,
  )!;
  const intact = rollbackArtifact.bytes;
  rollbackArtifact.bytes = Buffer.from("corrupt checkpoint");
  await assert.rejects(
    store.rollback(rollbackTarget.version, join(workspace, "corrupt-rollback.sqlite")),
    /checksum/,
  );
  assert.equal((await store.current()).manifest!.version, returned.manifest.version);
  rollbackArtifact.bytes = intact;
  const rollbackPath = join(workspace, "rollback.sqlite");
  const rollback = await store.rollback(rollbackTarget.version, rollbackPath);
  assert.equal(await readFile(rollbackPath, "utf8"), "checkpoint B refresh 3");
  assert.equal(rollback.manifest.data_sha256, rollbackTarget.data_sha256);
  assert.notEqual(rollback.manifest.version, rollbackTarget.version);
  assert.equal(rollback.manifest.previous[0]!.version, returned.manifest.version);
  assert.equal(
    snapshotVersions(rollback.manifest).some((entry) => entry.version === rollbackTarget.version),
    false,
  );

  publishBeforeLostResponse = async () => {
    await store.publish(checkpoint, dataVersion(31), await store.current());
  };
  const overtaken = await store.publish(checkpoint, dataVersion(30), await store.current());
  const newest = (await store.current()).manifest!;
  assert.equal(newest.previous[0]!.version, overtaken.manifest.version);
  assert.equal(
    objects.get(`public-bucket/${snapshotObject(overtaken.manifest.version, "payload")}`)!.metadata
      .customTime,
    undefined,
    "Lost responses must not retire a publication retained by its successor",
  );
  assert.deepEqual(
    await store.migrateRetention(),
    newest,
    "Migration must leave an existing populated recovery history intact",
  );

  const currentObject = objects.get("public-bucket/current.json")!;
  currentObject.bytes = Buffer.from("null");
  await assert.rejects(
    store.current(),
    /invalid/,
    "A corrupt manifest must not be treated as an empty store eligible for seeding",
  );
  const { data_sha256: _hash, previous: _previous, ...oldManifest } = newest;
  currentObject.bytes = Buffer.from(JSON.stringify(oldManifest));
  await assert.rejects(store.current(), /migrate-retention/);
  const objectCount = objects.size;
  const migrated = await store.migrateRetention();
  assert.equal(migrated.version, newest.version);
  assert.equal(migrated.data_sha256, newest.data_sha256);
  assert.deepEqual(migrated.previous, []);
  assert.equal(objects.size, objectCount, "Manifest migration must not rewrite data artifacts");
  assert.deepEqual(
    await store.migrateRetention(),
    migrated,
    "Repeated migration must not discard initialized retention history",
  );
  console.log("Snapshot publication, recovery, concurrency, and read caching checks passed");
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalBucket === undefined) delete process.env.MODEL_ATLAS_SNAPSHOT_BUCKET;
  else process.env.MODEL_ATLAS_SNAPSHOT_BUCKET = originalBucket;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(workspace, { recursive: true, force: true });
}
