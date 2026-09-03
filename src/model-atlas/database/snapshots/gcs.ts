/** GCS publication uploads complete immutable artifacts and commits their manifest with compare-and-swap. */

import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGzip, gzip } from "node:zlib";

import { Storage } from "@google-cloud/storage";

import type { ModelAtlasPayload } from "../../stats/types";
import {
  decodeSnapshotBytes,
  decodeSnapshotPayload,
  parseSnapshotArtifacts,
  parseSnapshotManifest,
  parseSnapshotPayload,
  retainedSnapshotVersions,
  SNAPSHOT_MANIFEST_OBJECT,
  snapshotDataHash,
  snapshotHash,
  type SnapshotManifest,
  snapshotObject,
  type SnapshotVersion,
  snapshotVersions,
} from "./manifest";

export type CurrentSnapshot = {
  manifest: SnapshotManifest | null;
  generation: string | number;
};

const compress = promisify(gzip);

/** Bucket ownership, immutable uploads, and the one commit point stay behind this storage boundary. */
export class SnapshotStorage {
  private readonly publicBucket;
  private readonly checkpointBucket;

  constructor(
    publicBucket: string,
    checkpointBucket: string,
    storage = new Storage({
      timeout: 30_000,
      retryOptions: { maxRetries: 3, totalTimeout: 90 },
    }),
  ) {
    if (!checkpointBucket || publicBucket === checkpointBucket) {
      throw new Error(
        "MODEL_ATLAS_CHECKPOINT_BUCKET must be separate from the public snapshot bucket",
      );
    }
    this.publicBucket = storage.bucket(publicBucket);
    this.checkpointBucket = storage.bucket(checkpointBucket);
  }

  /** Pin the manifest generation so its content and the later publication precondition cannot race. */
  async current(): Promise<CurrentSnapshot> {
    const { value, generation } = await this.readManifest();
    return { manifest: generation === 0 ? null : parseSnapshotManifest(value), generation };
  }

  private async readManifest(): Promise<{ value: unknown; generation: string | number }> {
    const file = this.publicBucket.file(SNAPSHOT_MANIFEST_OBJECT);
    for (let attempt = 0; attempt < 3; attempt++) {
      let generation: string;
      try {
        const [metadata] = await file.getMetadata();
        if (!metadata.generation) throw new Error("GCS manifest has no generation");
        generation = String(metadata.generation);
      } catch (error) {
        if ((error as { code?: number }).code === 404) return { value: null, generation: 0 };
        throw error;
      }
      try {
        const [bytes] = await this.publicBucket
          .file(SNAPSHOT_MANIFEST_OBJECT, { generation })
          .download();
        return { value: JSON.parse(bytes.toString("utf8")), generation };
      } catch (error) {
        // An overwrite can remove the pinned generation between metadata and content reads.
        if ((error as { code?: number }).code !== 404 || attempt === 2) throw error;
      }
    }
    throw new Error("GCS manifest changed repeatedly while reading");
  }

  /** Explicitly upgrade an existing store after verifying both artifacts, without reinterpreting old manifests during normal reads. */
  async migrateRetention(): Promise<SnapshotManifest> {
    const { value, generation } = await this.readManifest();
    if (generation === 0) throw new Error("The snapshot store is empty; use --seed instead");
    if (value != null && typeof value === "object" && "previous" in value)
      return parseSnapshotManifest(value);
    const snapshot = parseSnapshotArtifacts(value);
    const [[dashboard], [checkpoint]] = await Promise.all([
      this.publicBucket.file(snapshotObject(snapshot.version, "payload")).download(),
      this.checkpointBucket.file(snapshotObject(snapshot.version, "checkpoint")).download(),
    ]);
    const payload = parseSnapshotPayload(
      await decodeSnapshotBytes(dashboard, snapshot.payload_sha256),
    );
    await decodeSnapshotBytes(checkpoint, snapshot.checkpoint_sha256);
    if (payload.fetched_at_epoch_seconds !== snapshot.fetched_at_epoch_seconds) {
      throw new Error("GCS snapshot timestamp does not match its manifest");
    }
    const manifest = { ...snapshot, data_sha256: snapshotDataHash(payload), previous: [] };
    await this.commitManifest(Buffer.from(JSON.stringify(manifest)), generation);
    return manifest;
  }

  async restore(manifest: SnapshotVersion, databasePath: string): Promise<ModelAtlasPayload> {
    const [[checkpoint], [dashboard]] = await Promise.all([
      this.checkpointBucket.file(snapshotObject(manifest.version, "checkpoint")).download(),
      this.publicBucket.file(snapshotObject(manifest.version, "payload")).download(),
    ]);
    const payload = await decodeSnapshotPayload(dashboard, manifest);
    await writeFile(
      databasePath,
      await decodeSnapshotBytes(checkpoint, manifest.checkpoint_sha256),
      { flag: "wx", mode: 0o600 },
    );
    return payload;
  }

  /** Re-publish a verified recovery pair under fresh artifact names so retired-object cleanup can never remove a restored current version. */
  async rollback(version: string, databasePath: string) {
    const current = await this.current();
    const selected = current.manifest?.previous.find((entry) => entry.version === version);
    if (!selected)
      throw new Error("Rollback requires a version listed in the current recovery history");
    const payload = await this.restore(selected, databasePath);
    return this.publish(databasePath, payload, current);
  }

  /** The manifest changes only after both verified uploads finish; stale publishers must rebuild from the new checkpoint. */
  async publish(
    databasePath: string,
    payload: ModelAtlasPayload,
    previous: CurrentSnapshot,
  ): Promise<{
    manifest: SnapshotManifest;
    bytes_uploaded: number;
    maintenance_warnings: string[];
  }> {
    if (payload.models.length === 0 || !payload.fetched_at_epoch_seconds) {
      throw new Error("Refusing to publish an empty Model Atlas snapshot");
    }
    const [checkpoint, dashboard] = await Promise.all([
      compressCheckpoint(databasePath),
      compress(JSON.stringify(payload)),
    ]);
    const dataHash = snapshotDataHash(payload);
    const manifest: SnapshotManifest = {
      version: randomUUID(),
      fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
      payload_sha256: snapshotHash(dashboard),
      checkpoint_sha256: snapshotHash(checkpoint),
      data_sha256: dataHash,
      previous: retainedSnapshotVersions(previous.manifest, dataHash),
    };
    const artifacts = [
      {
        file: this.checkpointBucket.file(snapshotObject(manifest.version, "checkpoint")),
        bytes: checkpoint,
        cacheControl: "private, no-store",
      },
      {
        file: this.publicBucket.file(snapshotObject(manifest.version, "payload")),
        bytes: dashboard,
        cacheControl: "public, max-age=31536000, immutable",
      },
    ];
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    try {
      const uploads = await Promise.allSettled(
        artifacts.map(({ file, bytes, cacheControl }) =>
          file.save(bytes, {
            resumable: false,
            validation: "crc32c",
            preconditionOpts: { ifGenerationMatch: 0 },
            metadata: { contentType: "application/gzip", cacheControl },
          }),
        ),
      );
      for (const upload of uploads) if (upload.status === "rejected") throw upload.reason;
      await this.commitManifest(manifestBytes, previous.generation);
    } catch (error) {
      // A lost response can follow a successful commit; never retire artifacts until the commit state is known.
      const observed = await this.current().catch(() => null);
      if (
        !observed?.manifest ||
        !snapshotVersions(observed.manifest).some((entry) => entry.version === manifest.version)
      ) {
        if (observed != null) {
          await Promise.allSettled(
            artifacts.map(({ file }) => file.setMetadata({ customTime: new Date().toISOString() })),
          );
        }
        throw new Error(
          observed == null
            ? "Unable to confirm snapshot publication; inspect current.json before retrying"
            : "Snapshot publication failed; this version is not current",
          { cause: error },
        );
      }
    }
    const warnings: string[] = [];
    if (previous.manifest) {
      const retained = new Set(manifest.previous.map((entry) => entry.version));
      const retiredAt = new Date().toISOString();
      const retired = await Promise.allSettled(
        snapshotVersions(previous.manifest)
          .filter((entry) => !retained.has(entry.version))
          .flatMap((entry) => [
            this.checkpointBucket
              .file(snapshotObject(entry.version, "checkpoint"))
              .setMetadata({ customTime: retiredAt }),
            this.publicBucket
              .file(snapshotObject(entry.version, "payload"))
              .setMetadata({ customTime: retiredAt }),
          ]),
      );
      for (const result of retired) {
        if (result.status === "rejected")
          warnings.push(
            `Published successfully, but could not schedule retired artifact cleanup: ${String(result.reason)}`,
          );
      }
    }
    return {
      manifest,
      bytes_uploaded: checkpoint.length + dashboard.length + manifestBytes.length,
      maintenance_warnings: warnings,
    };
  }

  private async commitManifest(bytes: Buffer, generation: string | number): Promise<void> {
    await this.publicBucket.file(SNAPSHOT_MANIFEST_OBJECT).save(bytes, {
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: generation },
      metadata: { contentType: "application/json", cacheControl: "no-store" },
    });
  }
}

/** Retain only compressed bytes for the retryable upload instead of buffering the entire SQLite checkpoint. */
async function compressCheckpoint(databasePath: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await pipeline(createReadStream(databasePath), createGzip(), async (source) => {
    for await (const chunk of source) chunks.push(chunk);
  });
  return Buffer.concat(chunks);
}
