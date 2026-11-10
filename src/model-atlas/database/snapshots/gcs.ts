/** GCS publication uploads complete immutable artifacts and commits their manifest with compare-and-swap. */

import { createHash, randomUUID } from "node:crypto";
import type { ReadStream } from "node:fs";
import { open, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip, createGzip, gzip } from "node:zlib";

import { type File, Storage } from "@google-cloud/storage";

import { packTimelineDataset } from "../../timeline/schemas";
import {
  artifactSha256,
  decodeChangeHistory,
  decodeCommunityRankings,
  decodeIntelligenceIndex,
  decodeSnapshotBytes,
  decodeSnapshotPayload,
  parseSnapshotArtifacts,
  parseSnapshotManifest,
  parseSnapshotPayload,
  retainedSnapshotVersions,
  SNAPSHOT_MANIFEST_OBJECT,
  type SnapshotData,
  snapshotDataHash,
  type SnapshotManifest,
  snapshotObject,
  type SnapshotVersion,
  snapshotVersions,
} from "./manifest";

export type CurrentSnapshot = {
  manifest: SnapshotManifest | null;
  generation: string | number;
};

export class SnapshotConflictError extends Error {}

const compress = promisify(gzip);
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 5 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

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
        const bytes = await downloadSnapshotObject(
          this.publicBucket.file(SNAPSHOT_MANIFEST_OBJECT, { generation }),
        );
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
    const [leaderboard, checkpoint] = await Promise.all([
      downloadSnapshotObject(this.publicBucket.file(snapshotObject(snapshot.version, "payload"))),
      downloadSnapshotObject(
        this.checkpointBucket.file(snapshotObject(snapshot.version, "checkpoint")),
      ),
    ]);
    const payload = parseSnapshotPayload(
      await decodeSnapshotBytes(leaderboard, snapshot.payload_sha256),
    );
    await decodeSnapshotBytes(checkpoint, snapshot.checkpoint_sha256);
    if (payload.fetched_at_epoch_seconds !== snapshot.fetched_at_epoch_seconds) {
      throw new Error("GCS snapshot timestamp does not match its manifest");
    }
    const manifest = {
      ...snapshot,
      data_sha256: snapshotDataHash({ payload, timeline: null, communityRankings: [] }),
      previous: [],
    };
    await this.commitManifest(Buffer.from(JSON.stringify(manifest)), generation);
    return manifest;
  }

  /** Verify the published data before the checkpoint is written, so a mismatched manifest never leaves a checkpoint behind. */
  async restore(manifest: SnapshotVersion, databasePath: string): Promise<SnapshotData> {
    const [leaderboard, index, rankings, history] = await Promise.all([
      downloadSnapshotObject(this.publicBucket.file(snapshotObject(manifest.version, "payload"))),
      manifest.intelligence_index_sha256
        ? downloadSnapshotObject(
            this.publicBucket.file(snapshotObject(manifest.version, "intelligence-index")),
          )
        : null,
      manifest.community_rankings_sha256
        ? downloadSnapshotObject(
            this.publicBucket.file(snapshotObject(manifest.version, "community-rankings")),
          )
        : null,
      manifest.change_history_sha256
        ? downloadSnapshotObject(
            this.publicBucket.file(snapshotObject(manifest.version, "change-history")),
          )
        : null,
    ]);
    const data: SnapshotData = {
      payload: await decodeSnapshotPayload(leaderboard, manifest),
      timeline: index
        ? await decodeIntelligenceIndex(index, manifest.intelligence_index_sha256!)
        : null,
      communityRankings: rankings
        ? await decodeCommunityRankings(rankings, manifest.community_rankings_sha256!)
        : [],
      changeHistory: history
        ? await decodeChangeHistory(history, manifest.change_history_sha256!)
        : [],
    };
    if (snapshotDataHash(data) !== manifest.data_sha256)
      throw new Error("GCS snapshot data fingerprint does not match its manifest");
    await restoreCheckpoint(
      this.checkpointBucket.file(snapshotObject(manifest.version, "checkpoint")),
      manifest.checkpoint_sha256,
      databasePath,
    );
    return data;
  }

  /** Re-publish a verified recovery pair under fresh artifact names so retired-object cleanup can never remove a restored current version. */
  async rollback(version: string, databasePath: string) {
    const current = await this.current();
    const selected = current.manifest?.previous.find((entry) => entry.version === version);
    if (!selected)
      throw new Error("Rollback requires a version listed in the current recovery history");
    return this.publish(databasePath, await this.restore(selected, databasePath), current);
  }

  /** The manifest changes only after every verified upload finishes; stale publishers must rebuild from the new checkpoint. A refresh passes the evidence it newly observed as JSON lines. */
  async publish(
    databasePath: string,
    data: SnapshotData,
    previous: CurrentSnapshot,
    evidence?: string,
  ): Promise<{
    manifest: SnapshotManifest;
    bytes_uploaded: number;
    maintenance_warnings: string[];
  }> {
    const { payload, timeline, communityRankings, changeHistory } = data;
    if (payload.models.length === 0 || !payload.fetched_at_epoch_seconds) {
      throw new Error("Refusing to publish an empty Model Atlas snapshot");
    }
    const leaderboardJson = JSON.stringify(payload);
    try {
      parseSnapshotPayload(Buffer.from(leaderboardJson));
    } catch (error) {
      // A payload its own readers reject would fail every display read and the next refresh's restore.
      throw new Error("Refusing to publish a Model Atlas snapshot that readers would reject", {
        cause: error,
      });
    }
    const [leaderboard, index, rankings, history, evidenceBytes] = await Promise.all([
      compress(leaderboardJson),
      timeline ? compress(JSON.stringify(packTimelineDataset(timeline))) : null,
      communityRankings.length ? compress(JSON.stringify(communityRankings)) : null,
      changeHistory.length ? compress(JSON.stringify(changeHistory)) : null,
      evidence ? compress(evidence) : null,
    ]);
    const dataHash = snapshotDataHash(data);
    const version = randomUUID();
    const checkpointFile = this.checkpointBucket.file(snapshotObject(version, "checkpoint"));
    const publicArtifacts = [
      {
        file: this.publicBucket.file(snapshotObject(version, "payload")),
        bytes: leaderboard,
      },
      ...(index
        ? [
            {
              file: this.publicBucket.file(snapshotObject(version, "intelligence-index")),
              bytes: index,
            },
          ]
        : []),
      ...(rankings
        ? [
            {
              file: this.publicBucket.file(snapshotObject(version, "community-rankings")),
              bytes: rankings,
            },
          ]
        : []),
      ...(history
        ? [
            {
              file: this.publicBucket.file(snapshotObject(version, "change-history")),
              bytes: history,
            },
          ]
        : []),
    ];
    const files = [checkpointFile, ...publicArtifacts.map(({ file }) => file)];
    const checkpointSource = (await open(databasePath, "r")).createReadStream();
    let publication: { manifest: SnapshotManifest; bytes: number } | null = null;
    try {
      const [checkpoint, ...uploads] = await Promise.allSettled([
        uploadCheckpoint(checkpointFile, checkpointSource),
        ...publicArtifacts.map(({ file, bytes }) =>
          saveArtifact(file, bytes, "public, max-age=31536000, immutable"),
        ),
        // Evidence lands before the commit so a current checkpoint never lacks its history; it is never retired, so a failed publication leaves a copy whose records the next refresh archives again.
        ...(evidenceBytes
          ? [
              saveArtifact(
                this.checkpointBucket.file(
                  evidenceObject(payload.fetched_at_epoch_seconds, version),
                ),
                evidenceBytes,
                "private, no-store",
              ),
            ]
          : []),
      ] as const);
      if (checkpoint.status === "rejected") throw checkpoint.reason;
      for (const upload of uploads) if (upload.status === "rejected") throw upload.reason;
      const manifest: SnapshotManifest = {
        version,
        fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
        payload_sha256: artifactSha256(leaderboard),
        checkpoint_sha256: checkpoint.value.sha256,
        intelligence_index_sha256: index ? artifactSha256(index) : null,
        community_rankings_sha256: rankings ? artifactSha256(rankings) : null,
        change_history_sha256: history ? artifactSha256(history) : null,
        data_sha256: dataHash,
        previous: retainedSnapshotVersions(previous.manifest, dataHash),
      };
      const manifestBytes = Buffer.from(JSON.stringify(manifest));
      publication = {
        manifest,
        bytes:
          checkpoint.value.bytes +
          leaderboard.length +
          (index?.length ?? 0) +
          (rankings?.length ?? 0) +
          (history?.length ?? 0) +
          (evidenceBytes?.length ?? 0) +
          manifestBytes.length,
      };
      await this.commitManifest(manifestBytes, previous.generation);
    } catch (error) {
      // A lost response can follow a successful commit; never retire artifacts until the commit state is known.
      const observed = await this.current().catch(() => null);
      if (
        publication == null ||
        !observed?.manifest ||
        !snapshotVersions(observed.manifest).some((entry) => entry.version === version)
      ) {
        if (observed != null) {
          await Promise.allSettled(
            files.map((file) => file.setMetadata({ customTime: new Date().toISOString() })),
          );
        }
        const PublicationError =
          observed != null && (error as { code?: number }).code === 412
            ? SnapshotConflictError
            : Error;
        throw new PublicationError(
          observed == null
            ? "Unable to confirm snapshot publication; inspect current.json before retrying"
            : "Snapshot publication failed; this version is not current",
          { cause: error },
        );
      }
    } finally {
      checkpointSource.destroy();
    }
    const { manifest, bytes } = publication;
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
            ...(entry.intelligence_index_sha256
              ? [
                  this.publicBucket
                    .file(snapshotObject(entry.version, "intelligence-index"))
                    .setMetadata({ customTime: retiredAt }),
                ]
              : []),
            ...(entry.community_rankings_sha256
              ? [
                  this.publicBucket
                    .file(snapshotObject(entry.version, "community-rankings"))
                    .setMetadata({ customTime: retiredAt }),
                ]
              : []),
            ...(entry.change_history_sha256
              ? [
                  this.publicBucket
                    .file(snapshotObject(entry.version, "change-history"))
                    .setMetadata({ customTime: retiredAt }),
                ]
              : []),
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
      bytes_uploaded: bytes,
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

function saveArtifact(file: File, bytes: Buffer, cacheControl: string) {
  const resumable = bytes.length > RESUMABLE_UPLOAD_THRESHOLD_BYTES;
  return file.save(bytes, {
    resumable,
    ...(resumable ? { chunkSize: UPLOAD_CHUNK_BYTES } : {}),
    validation: "crc32c",
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: "application/gzip", cacheControl },
  });
}

/** Evidence sits outside `snapshots/`, the only prefix retirement marks and lifecycle deletes, and sorts by capture time. */
function evidenceObject(capturedAtEpochSeconds: number, version: string): string {
  return `evidence/${new Date(capturedAtEpochSeconds * 1000).toISOString()}-${version}.jsonl.gz`;
}

/** Hash compressed bytes as they flow into a bounded resumable upload; only a completed upload can supply a manifest checksum. */
async function uploadCheckpoint(file: File, checkpoint: ReadStream) {
  const hash = createHash("sha256");
  let bytes = 0;
  await pipeline(
    checkpoint,
    createGzip(),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        bytes += chunk.length;
        yield chunk;
      }
    },
    file.createWriteStream({
      resumable: true,
      chunkSize: UPLOAD_CHUNK_BYTES,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "application/gzip", cacheControl: "private, no-store" },
    }),
  );
  return { sha256: hash.digest("hex"), bytes };
}

async function downloadSnapshotObject(file: File): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of snapshotReadStream(file)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Stream straight to disk, since buffering would hold the compressed and decompressed checkpoint in memory beside the file, which Cloud Run also keeps in memory. A checkpoint that fails verification is removed. */
async function restoreCheckpoint(file: File, expectedHash: string, databasePath: string) {
  const destination = await open(databasePath, "wx", 0o600);
  const hash = createHash("sha256");
  try {
    await pipeline(
      snapshotReadStream(file),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          yield chunk;
        }
      },
      createGunzip(),
      destination.createWriteStream(),
    );
    if (hash.digest("hex") !== expectedHash) throw new Error("GCS snapshot checksum mismatch");
  } catch (error) {
    await rm(databasePath, { force: true });
    // Bytes that match the published checksum always decompress, so a decompression failure is a checksum mismatch.
    if (String((error as { code?: unknown }).code).startsWith("Z_"))
      throw new Error("GCS snapshot checksum mismatch", { cause: error });
    throw error;
  }
}

/** GCS and teeny-request attach overlapping pipelines to each response; budget their bounded listeners without hiding warnings globally. */
function snapshotReadStream(file: File) {
  const stream = file.createReadStream();
  stream.on("response", (response: IncomingMessage) => {
    const currentLimit = response.getMaxListeners();
    if (currentLimit > 0 && currentLimit < 16) response.setMaxListeners(16);
  });
  return stream;
}
