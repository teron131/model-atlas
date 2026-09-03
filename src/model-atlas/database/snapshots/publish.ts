/** Refresh the authoritative SQLite checkpoint in isolation, then publish a complete GCS snapshot. */

import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildDatabase } from "../build";
import { readDatabasePayload } from "../sqlite-payload";
import { SnapshotStorage } from "./gcs";
import { snapshotBucket } from "./manifest";

/** An explicit seed is accepted only for an empty store; normal runs always restore the current checkpoint. */
export async function publishSnapshot(seedPath?: string) {
  const publicBucket = snapshotBucket();
  const store = configuredSnapshotStorage(publicBucket);
  const current = await store.current();
  if (seedPath && current.manifest)
    throw new Error("The snapshot store is already initialized; --seed cannot replace its history");
  if (!seedPath && !current.manifest)
    throw new Error("The snapshot store is empty; initialize it with --seed <database.sqlite>");
  const startedAt = performance.now();
  return withCheckpointWorkspace(async (databasePath) => {
    const previousPayload = current.manifest
      ? await store.restore(current.manifest, databasePath)
      : null;
    if (!current.manifest && seedPath) await copyFile(resolve(seedPath), databasePath);
    const built = await buildDatabase(databasePath, {
      previousPayload,
      replaceSourceRows: process.env.MODEL_ATLAS_REPLACE_SOURCE_ROWS === "1",
    });
    const payload = readDatabasePayload(databasePath);
    const publication = await store.publish(databasePath, payload, current);
    return {
      bucket: publicBucket,
      version: publication.manifest.version,
      data_sha256: publication.manifest.data_sha256,
      recovery_versions: publication.manifest.previous.map((entry) => entry.version),
      published: true,
      model_count: payload.models.length,
      fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
      bytes_uploaded: publication.bytes_uploaded,
      source_cache: built.source_cache,
      maintenance_warnings: publication.maintenance_warnings,
      duration_ms: Math.round(performance.now() - startedAt),
    };
  });
}

/** Rollback uses the stored pair directly; refreshing sources here would defeat recovery of a known earlier state. */
export async function rollbackSnapshot(version: string) {
  const store = configuredSnapshotStorage();
  return withCheckpointWorkspace((databasePath) => store.rollback(version, databasePath));
}

export async function readSnapshotHistory() {
  return configuredSnapshotStorage().current();
}

export async function migrateSnapshotRetention() {
  return configuredSnapshotStorage().migrateRetention();
}

function configuredSnapshotStorage(publicBucket = snapshotBucket()): SnapshotStorage {
  return new SnapshotStorage(publicBucket, process.env.MODEL_ATLAS_CHECKPOINT_BUCKET ?? "");
}

async function withCheckpointWorkspace<T>(run: (databasePath: string) => Promise<T>): Promise<T> {
  const cacheRoot = resolve(".cache");
  await mkdir(cacheRoot, { recursive: true });
  const workspace = await mkdtemp(join(cacheRoot, "snapshot-publication-"));
  try {
    return await run(join(workspace, "database.sqlite"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
