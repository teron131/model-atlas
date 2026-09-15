/** One manifest binds independent leaderboard and Intelligence Index artifacts to their private recovery checkpoint. */

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

import { asRecord, stableJson } from "../../runtime";
import { isModelAtlasPayload } from "../../stats/payload/validation";
import type { ModelAtlasPayload } from "../../stats/types";
import { type HistoricalDataset, unpackTimelineDataset } from "../../timeline/schemas";

type SnapshotArtifacts = {
  version: string;
  fetched_at_epoch_seconds: number;
  payload_sha256: string;
  checkpoint_sha256: string;
  intelligence_index_sha256: string | null;
};

export type SnapshotVersion = SnapshotArtifacts & { data_sha256: string };
export type SnapshotManifest = SnapshotVersion & { previous: SnapshotVersion[] };

export const SNAPSHOT_MANIFEST_OBJECT = "current.json";
const RECOVERY_VERSION_COUNT = 3;
const decompress = promisify(gunzip);

export function snapshotBucket(): string {
  const bucket = process.env.MODEL_ATLAS_SNAPSHOT_BUCKET;
  if (!bucket || !/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/.test(bucket)) {
    throw new Error("MODEL_ATLAS_SNAPSHOT_BUCKET must name the public GCS snapshot bucket");
  }
  return bucket;
}

export function snapshotObject(
  version: string,
  kind: "payload" | "checkpoint" | "intelligence-index",
): string {
  const name = kind === "checkpoint" ? "database.sqlite.gz" : `${kind}.json.gz`;
  return `snapshots/${version}/${name}`;
}

export function snapshotUrl(bucket: string, object: string): string {
  return `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${object}`;
}

/** Validate immutable artifact references, including during the explicit manifest migration. */
export function parseSnapshotArtifacts(value: unknown): SnapshotArtifacts {
  const manifest = value as Partial<SnapshotArtifacts> | null;
  if (
    !manifest ||
    typeof manifest.version !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(manifest.version) ||
    !Number.isSafeInteger(manifest.fetched_at_epoch_seconds) ||
    (manifest.fetched_at_epoch_seconds ?? 0) <= 0 ||
    !isHash(manifest.payload_sha256) ||
    !isHash(manifest.checkpoint_sha256) ||
    (manifest.intelligence_index_sha256 !== null && !isHash(manifest.intelligence_index_sha256))
  ) {
    throw new Error("GCS contains an invalid snapshot manifest");
  }
  return {
    version: manifest.version,
    fetched_at_epoch_seconds: manifest.fetched_at_epoch_seconds!,
    payload_sha256: manifest.payload_sha256,
    checkpoint_sha256: manifest.checkpoint_sha256,
    intelligence_index_sha256: manifest.intelligence_index_sha256,
  };
}

/** A recovery manifest holds at most three predecessors, all distinct from each other and the current data. */
export function parseSnapshotManifest(value: unknown): SnapshotManifest {
  const manifest = asRecord(value);
  if (!Array.isArray(manifest.previous) || manifest.previous.length > RECOVERY_VERSION_COUNT) {
    throw new Error(
      "GCS contains an invalid recovery manifest; older stores require --migrate-retention",
    );
  }
  const versions = [manifest, ...manifest.previous].map((entry) => {
    const artifacts = parseSnapshotArtifacts(entry);
    const hash = asRecord(entry).data_sha256;
    if (!isHash(hash)) {
      throw new Error("GCS contains an invalid snapshot data fingerprint");
    }
    return { ...artifacts, data_sha256: hash };
  });
  if (
    new Set(versions.map((entry) => entry.version)).size !== versions.length ||
    new Set(versions.map((entry) => entry.data_sha256)).size !== versions.length
  ) {
    throw new Error("GCS recovery versions must contain distinct data and artifact references");
  }
  return { ...versions[0]!, previous: versions.slice(1) };
}

export function snapshotVersions(manifest: SnapshotManifest): SnapshotVersion[] {
  const { previous, ...current } = manifest;
  return [current, ...previous];
}

/** Keep the newest representative of each prior data state, without spending a slot on refreshed or returning content. */
export function retainedSnapshotVersions(
  manifest: SnapshotManifest | null,
  dataHash: string,
): SnapshotVersion[] {
  if (!manifest) return [];
  return snapshotVersions(manifest)
    .filter((entry) => entry.data_sha256 !== dataHash)
    .slice(0, RECOVERY_VERSION_COUNT);
}

/** Fingerprint model and benchmark values, not freshness, change-log records, artwork, or collection ordering. */
export function snapshotDataHash(payload: ModelAtlasPayload): string {
  const data = {
    models: payload.models.map(
      ({ logo: _logo, latest_change: _change, benchmark_dates: _dates, ...model }) => model,
    ),
    benchmark_observations: payload.benchmark_observations ?? {},
    ...(payload.timeline
      ? {
          capability_scale: payload.timeline.scale,
          capability_anchors: payload.timeline.displayAnchors,
        }
      : {}),
  };
  return createHash("sha256")
    .update(stableJson(canonicalSnapshotData(data)))
    .digest("hex");
}

function canonicalSnapshotData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalSnapshotData)
      .map((entry) => stableJson(entry))
      .sort();
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "observed_at")
        .map(([key, entry]) => [key, canonicalSnapshotData(entry)]),
    );
  }
  return value;
}

export function snapshotHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Verify the compressed artifact before decompression; corrupt snapshots never replace a cached good version. */
export async function decodeSnapshotBytes(bytes: Buffer, expectedHash: string): Promise<Buffer> {
  if (snapshotHash(bytes) !== expectedHash) {
    throw new Error("GCS snapshot checksum mismatch");
  }
  return decompress(bytes);
}

/** Runtime readers verify artifact bytes and timestamps; checkpoint recovery additionally verifies the combined data fingerprint. */
export async function decodeSnapshotPayload(
  bytes: Buffer,
  manifest: SnapshotVersion,
): Promise<ModelAtlasPayload> {
  const payload = parseSnapshotPayload(await decodeSnapshotBytes(bytes, manifest.payload_sha256));
  if (payload.fetched_at_epoch_seconds !== manifest.fetched_at_epoch_seconds) {
    throw new Error("GCS snapshot timestamp does not match its manifest");
  }
  return payload;
}

/** The index is fetched independently of the leaderboard and retains its own verified immutable artifact. */
export async function decodeIntelligenceIndex(
  bytes: Buffer,
  expectedHash: string,
): Promise<HistoricalDataset> {
  const data = JSON.parse((await decodeSnapshotBytes(bytes, expectedHash)).toString("utf8"));
  if (
    !data ||
    !Array.isArray(data.models) ||
    !Array.isArray(data.observations) ||
    !data.scale ||
    !data.displayAnchors ||
    !data.prepared?.calibrations?.intelligence
  )
    throw new Error("GCS contains an invalid Intelligence Index");
  return unpackTimelineDataset(data);
}

export function parseSnapshotPayload(bytes: Buffer): ModelAtlasPayload {
  const payload: unknown = JSON.parse(bytes.toString("utf8"));
  if (!isModelAtlasPayload(payload) || !Number.isSafeInteger(payload.fetched_at_epoch_seconds)) {
    throw new Error("GCS contains an invalid dashboard snapshot");
  }
  return payload;
}
