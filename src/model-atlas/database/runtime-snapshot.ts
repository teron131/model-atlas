/** Local development reads its SQLite checkpoint; deployed display reads use GCS without credentials or refresh side effects. */

import { rankedModels } from "../pipeline/model-types";
import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import type { ModelAtlasPayload } from "../stats/types";
import {
  decodeSnapshotPayload,
  parseSnapshotManifest,
  SNAPSHOT_MANIFEST_OBJECT,
  snapshotBucket,
  snapshotObject,
  snapshotUrl,
} from "./snapshots/manifest";

type SnapshotReadState = {
  bucket: string;
  readInFlight: Promise<ModelAtlasPayload> | null;
  cachedPayload: ModelAtlasPayload | null;
  version: string | null;
  etag: string | null;
  cacheExpiresAt: number;
};

const snapshotReadState = globalThis as typeof globalThis & {
  __modelAtlasSnapshotReadState?: SnapshotReadState;
};
const DISPLAY_SNAPSHOT_CACHE_MS = 30_000;

/** Collapse concurrent reads and keep a short in-memory result for repeated server renders. */
export async function readDisplaySnapshotPayload(): Promise<ModelAtlasPayload> {
  if (process.env.NODE_ENV === "development" && process.env.VERCEL !== "1") {
    const { readCachedDatabasePayload } = await import("./sqlite-payload");
    return readCachedDatabasePayload();
  }
  const bucket = snapshotBucket();
  if (snapshotReadState.__modelAtlasSnapshotReadState?.bucket !== bucket) {
    snapshotReadState.__modelAtlasSnapshotReadState = {
      bucket,
      cachedPayload: null,
      version: null,
      etag: null,
      cacheExpiresAt: 0,
      readInFlight: null,
    };
  }
  const state = snapshotReadState.__modelAtlasSnapshotReadState;
  if (state.cachedPayload != null && Date.now() < state.cacheExpiresAt) {
    return state.cachedPayload;
  }
  state.readInFlight ??= readDisplayPayloadUncached(state).finally(() => {
    state.readInFlight = null;
  });
  return state.readInFlight;
}

/** Failed downloads leave the cached version and validator untouched so the next request retries. */
async function readDisplayPayloadUncached(state: SnapshotReadState): Promise<ModelAtlasPayload> {
  const response = await fetch(snapshotUrl(state.bucket, SNAPSHOT_MANIFEST_OBJECT), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: state.etag ? { "If-None-Match": state.etag } : {},
  });
  if (response.status === 304 && state.cachedPayload) {
    state.cacheExpiresAt = Date.now() + DISPLAY_SNAPSHOT_CACHE_MS;
    return state.cachedPayload;
  }
  if (!response.ok)
    throw new Error(`Unable to fetch Model Atlas manifest: HTTP ${response.status}`);
  const manifest = parseSnapshotManifest(await response.json());
  let payload = state.cachedPayload;
  if (!payload || state.version !== manifest.version) {
    const artifact = await fetch(
      snapshotUrl(state.bucket, snapshotObject(manifest.version, "payload")),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!artifact.ok)
      throw new Error(`Unable to fetch Model Atlas snapshot: HTTP ${artifact.status}`);
    payload = withCurrentMetadata(
      await decodeSnapshotPayload(Buffer.from(await artifact.arrayBuffer()), manifest),
    );
  }
  state.cachedPayload = payload;
  state.version = manifest.version;
  state.etag = response.headers.get("etag");
  state.cacheExpiresAt = Date.now() + DISPLAY_SNAPSHOT_CACHE_MS;
  return payload;
}

/** Keep cached payload rows, but rebuild metadata from current code-owned benchmark and scoring policy. */
function withCurrentMetadata(payload: ModelAtlasPayload): ModelAtlasPayload {
  const metadataModels = rankedModels(payload.models);
  return {
    ...payload,
    metadata: buildCurrentModelAtlasMetadata({
      models: metadataModels,
      healthModels: metadataModels,
      availableMetrics: payload.metadata?.available_metrics,
      sourceHealth: payload.metadata?.source_health,
      benchmarkUpdateHealth: payload.metadata?.benchmark_update_health,
      availabilitySource: "metadata",
    }),
  };
}
