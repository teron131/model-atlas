/** Share manifest revalidation while loading leaderboard and Intelligence Index artifacts independently on demand. */

import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import type { ModelAtlasPayload } from "../stats/types";
import type { HistoricalDataset } from "../timeline/schemas";
import {
  decodeIntelligenceIndex,
  decodeSnapshotPayload,
  parseSnapshotManifest,
  SNAPSHOT_MANIFEST_OBJECT,
  snapshotBucket,
  type SnapshotManifest,
  snapshotObject,
  snapshotUrl,
} from "./snapshots/manifest";

type ArtifactCache<T> = {
  hash?: string;
  value?: T;
  pending?: { hash: string; promise: Promise<T> };
};
type SnapshotReadState = {
  bucket: string;
  manifest: SnapshotManifest | null;
  etag: string | null;
  cacheExpiresAt: number;
  readInFlight: Promise<SnapshotManifest> | null;
  payload: ArtifactCache<ModelAtlasPayload>;
  index: ArtifactCache<HistoricalDataset>;
};

const snapshotReadState = globalThis as typeof globalThis & {
  __modelAtlasArtifactReadState?: SnapshotReadState;
};
const DISPLAY_SNAPSHOT_CACHE_MS = 30_000;

/** Dashboard reads never fetch, decompress, or parse historical index evidence. */
export async function readDisplaySnapshotPayload(): Promise<ModelAtlasPayload> {
  const state = readState();
  const manifest = await readManifest(state);
  return readArtifact(state, manifest, "payload", state.payload, async (bytes) =>
    withCurrentMetadata(await decodeSnapshotPayload(bytes, manifest)),
  );
}

/** Only the historical view pays for the index artifact; its cache is independent of dashboard reads. */
export async function readIntelligenceIndex(): Promise<HistoricalDataset | null> {
  const state = readState();
  const manifest = await readManifest(state);
  if (!manifest.intelligence_index_sha256) return null;
  return readArtifact(state, manifest, "intelligence-index", state.index, (bytes) =>
    decodeIntelligenceIndex(bytes, manifest.intelligence_index_sha256!),
  );
}

function readState(): SnapshotReadState {
  const bucket = snapshotBucket();
  if (snapshotReadState.__modelAtlasArtifactReadState?.bucket !== bucket) {
    snapshotReadState.__modelAtlasArtifactReadState = {
      bucket,
      manifest: null,
      etag: null,
      cacheExpiresAt: 0,
      readInFlight: null,
      payload: {},
      index: {},
    };
  }
  return snapshotReadState.__modelAtlasArtifactReadState;
}

async function readManifest(state: SnapshotReadState): Promise<SnapshotManifest> {
  if (state.manifest && Date.now() < state.cacheExpiresAt) return state.manifest;
  state.readInFlight ??= fetchManifest(state).finally(() => {
    state.readInFlight = null;
  });
  return state.readInFlight;
}

async function fetchManifest(state: SnapshotReadState): Promise<SnapshotManifest> {
  const response = await fetch(snapshotUrl(state.bucket, SNAPSHOT_MANIFEST_OBJECT), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: state.etag ? { "If-None-Match": state.etag } : {},
  });
  if (response.status === 304 && state.manifest) {
    state.cacheExpiresAt = Date.now() + DISPLAY_SNAPSHOT_CACHE_MS;
    return state.manifest;
  }
  if (!response.ok)
    throw new Error(`Unable to fetch Model Atlas manifest: HTTP ${response.status}`);
  const manifest = parseSnapshotManifest(await response.json());
  state.manifest = manifest;
  state.etag = response.headers.get("etag");
  state.cacheExpiresAt = Date.now() + DISPLAY_SNAPSHOT_CACHE_MS;
  return manifest;
}

/** Collapse concurrent artifact reads; failures retain the last good value and force manifest revalidation before retry. */
async function readArtifact<T>(
  state: SnapshotReadState,
  manifest: SnapshotManifest,
  kind: "payload" | "intelligence-index",
  cache: ArtifactCache<T>,
  decode: (bytes: Buffer) => Promise<T>,
): Promise<T> {
  const hash = kind === "payload" ? manifest.payload_sha256 : manifest.intelligence_index_sha256!;
  if (cache.hash === hash && cache.value !== undefined) return cache.value;
  if (cache.pending?.hash === hash) return cache.pending.promise;
  const promise = (async () => {
    try {
      const response = await fetch(
        snapshotUrl(state.bucket, snapshotObject(manifest.version, kind)),
        {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!response.ok)
        throw new Error(`Unable to fetch Model Atlas ${kind}: HTTP ${response.status}`);
      const value = await decode(Buffer.from(await response.arrayBuffer()));
      if (state.manifest?.version === manifest.version) {
        cache.value = value;
        cache.hash = hash;
      }
      return value;
    } catch (error) {
      state.cacheExpiresAt = 0;
      state.etag = null;
      throw error;
    } finally {
      if (cache.pending?.hash === hash) cache.pending = undefined;
    }
  })();
  cache.pending = { hash, promise };
  return promise;
}

/** Keep snapshot rows, but apply the deployed code's current metadata policy. */
function withCurrentMetadata(payload: ModelAtlasPayload): ModelAtlasPayload {
  return {
    ...payload,
    metadata: buildCurrentModelAtlasMetadata({
      models: payload.models,
      healthModels: payload.models,
      availableMetrics: payload.metadata?.available_metrics,
      sourceHealth: payload.metadata?.source_health,
      benchmarkUpdateHealth: payload.metadata?.benchmark_update_health,
      availabilitySource: "metadata",
    }),
  };
}
