/** Read the local checkpoint or published benchmark artifacts, then apply the active TMB and Slop graphs together for display. */

import { statSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyCommunityIndexes,
  type CommunityRanking,
  isValidRankedAt,
} from "../community/rankings";
import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import type { ModelAtlasPayload } from "../stats/types";
import type { HistoricalDataset } from "../timeline/schemas";
import {
  decodeCommunityRankings,
  decodeIntelligenceIndex,
  decodeSnapshotPayload,
  parseSnapshotManifest,
  publicSnapshotBucket,
  SNAPSHOT_MANIFEST_OBJECT,
  type SnapshotManifest,
  snapshotObject,
  snapshotUrl,
} from "./snapshots/manifest";

type ArtifactCache<T> = {
  hash?: string;
  value?: T;
  pending?: { hash: string; promise: Promise<T> };
};
type ArtifactReadState = {
  bucket: string;
  manifest: SnapshotManifest | null;
  etag: string | null;
  cacheExpiresAtMs: number;
  readInFlight: Promise<SnapshotManifest> | null;
  payload: ArtifactCache<ModelAtlasPayload>;
  index: ArtifactCache<HistoricalDataset>;
  rankings: ArtifactCache<CommunityRanking[]>;
};

const globalCaches = globalThis as typeof globalThis & {
  __modelAtlasArtifactReadState?: ArtifactReadState;
  __modelAtlasLocalReadState?: { fingerprint: string; payload: ModelAtlasPayload };
  __modelAtlasCommunityOverlay?: {
    base: ModelAtlasPayload;
    rankedAt: string | null;
    value: ModelAtlasPayload;
  };
};
const MANIFEST_CACHE_MS = 30_000;

/** Both indexes share one dated record, so a cached display never mixes graphs from different research runs. */
export async function readDisplayPayload(): Promise<ModelAtlasPayload> {
  let payload: ModelAtlasPayload;
  let rankings: CommunityRanking[];
  if (process.env.MODEL_ATLAS_LOCAL_DATABASE === "1") {
    payload = await readPublishedPayload();
    rankings = payload.community_rankings ?? [];
  } else {
    const state = artifactReadState();
    const manifest = await readManifest(state);
    [payload, rankings] = await Promise.all([
      readBenchmarkPayload(state, manifest),
      readRankingArtifact(state, manifest),
    ]);
  }
  const ranking = rankings.at(-1) ?? null;
  const rankedAt = ranking?.ranked_at ?? null;
  const cached = globalCaches.__modelAtlasCommunityOverlay;
  if (cached?.base === payload && cached.rankedAt === rankedAt) return cached.value;
  const { community_rankings, ...benchmarkPayload } = payload;
  const value = applyCommunityIndexes(community_rankings ? benchmarkPayload : payload, ranking);
  globalCaches.__modelAtlasCommunityOverlay = { base: payload, rankedAt, value };
  return value;
}

/** The unadjusted payload: the SQLite checkpoint under an explicit local override, otherwise the published artifact. */
export async function readPublishedPayload(): Promise<ModelAtlasPayload> {
  if (process.env.MODEL_ATLAS_LOCAL_DATABASE === "1") {
    const { readDatabasePayload } = await import("./sqlite-payload");
    const { DEFAULT_DATABASE_PATH } = await import("./schema");
    const path = resolve(DEFAULT_DATABASE_PATH);
    const fingerprint = localCheckpointFingerprint(path);
    const cached = globalCaches.__modelAtlasLocalReadState;
    if (cached?.fingerprint === fingerprint) return cached.payload;
    const payload = withCurrentMetadata(readDatabasePayload(path));
    globalCaches.__modelAtlasLocalReadState = { fingerprint, payload };
    return payload;
  }
  const state = artifactReadState();
  const manifest = await readManifest(state);
  return readBenchmarkPayload(state, manifest);
}

/** Prerendered pages read the manifest through Next's revalidating data cache, because the display reader's uncached manifest poll would make them dynamic. */
export async function readRevalidatedPayload(
  revalidateSeconds: number,
): Promise<ModelAtlasPayload> {
  if (process.env.MODEL_ATLAS_LOCAL_DATABASE === "1") return readPublishedPayload();
  const state = artifactReadState();
  const response = await fetch(snapshotUrl(state.bucket, SNAPSHOT_MANIFEST_OBJECT), {
    next: { revalidate: revalidateSeconds },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Unable to fetch Model Atlas manifest: HTTP ${response.status}`);
  return readBenchmarkPayload(state, parseSnapshotManifest(await response.json()));
}

function readBenchmarkPayload(state: ArtifactReadState, manifest: SnapshotManifest) {
  return readArtifact(state, manifest, "payload", state.payload, async (bytes) =>
    withCurrentMetadata(await decodeSnapshotPayload(bytes, manifest)),
  );
}

export async function readCommunityRanking(
  rankedAt: string,
): Promise<{ ranking: CommunityRanking; active: boolean } | null> {
  if (rankedAt !== "current" && !isValidRankedAt(rankedAt)) return null;
  let records: CommunityRanking[];
  if (process.env.MODEL_ATLAS_LOCAL_DATABASE === "1") {
    records = (await readPublishedPayload()).community_rankings ?? [];
  } else {
    const state = artifactReadState();
    // Submission read-back must observe a just-published version without waiting for the dashboard cache.
    state.cacheExpiresAtMs = 0;
    records = await readRankingArtifact(state, await readManifest(state));
  }
  const latest = records.at(-1);
  const ranking =
    rankedAt === "current" ? latest : records.find((record) => record.ranked_at === rankedAt);
  return ranking ? { ranking, active: ranking.ranked_at === latest?.ranked_at } : null;
}

function readRankingArtifact(state: ArtifactReadState, manifest: SnapshotManifest) {
  if (!manifest.community_rankings_sha256) return Promise.resolve([]);
  return readArtifact(state, manifest, "community-rankings", state.rankings, (bytes) =>
    decodeCommunityRankings(bytes, manifest.community_rankings_sha256!),
  );
}

/** Only the historical view pays for the index artifact; its cache is independent of dashboard reads. */
export async function readIntelligenceIndex(): Promise<HistoricalDataset | null> {
  if (process.env.MODEL_ATLAS_LOCAL_DATABASE === "1") {
    return (await readPublishedPayload()).timeline ?? null;
  }
  const state = artifactReadState();
  const manifest = await readManifest(state);
  if (!manifest.intelligence_index_sha256) return null;
  return readArtifact(state, manifest, "intelligence-index", state.index, (bytes) =>
    decodeIntelligenceIndex(bytes, manifest.intelligence_index_sha256!),
  );
}

/** Invalidate on atomic replacement, in-place writes, and committed WAL changes while keeping tooling reads uncached. */
function localCheckpointFingerprint(path: string): string {
  const files = [
    statSync(path, { bigint: true }),
    statSync(`${path}-wal`, { bigint: true, throwIfNoEntry: false }),
  ];
  // SQLite readers can change WAL permissions and ctime without changing its contents.
  return [
    path,
    ...files.map((stat) => (stat ? [stat.dev, stat.ino, stat.size, stat.mtimeNs].join(":") : "")),
  ].join(";");
}

function artifactReadState(): ArtifactReadState {
  const bucket = publicSnapshotBucket();
  if (globalCaches.__modelAtlasArtifactReadState?.bucket !== bucket) {
    globalCaches.__modelAtlasArtifactReadState = {
      bucket,
      manifest: null,
      etag: null,
      cacheExpiresAtMs: 0,
      readInFlight: null,
      payload: {},
      index: {},
      rankings: {},
    };
  }
  return globalCaches.__modelAtlasArtifactReadState;
}

async function readManifest(state: ArtifactReadState): Promise<SnapshotManifest> {
  if (state.manifest && Date.now() < state.cacheExpiresAtMs) return state.manifest;
  state.readInFlight ??= fetchManifest(state).finally(() => {
    state.readInFlight = null;
  });
  return state.readInFlight;
}

async function fetchManifest(state: ArtifactReadState): Promise<SnapshotManifest> {
  const response = await fetch(snapshotUrl(state.bucket, SNAPSHOT_MANIFEST_OBJECT), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: state.etag ? { "If-None-Match": state.etag } : {},
  });
  if (response.status === 304 && state.manifest) {
    state.cacheExpiresAtMs = Date.now() + MANIFEST_CACHE_MS;
    return state.manifest;
  }
  if (!response.ok)
    throw new Error(`Unable to fetch Model Atlas manifest: HTTP ${response.status}`);
  const manifest = parseSnapshotManifest(await response.json());
  state.manifest = manifest;
  state.etag = response.headers.get("etag");
  state.cacheExpiresAtMs = Date.now() + MANIFEST_CACHE_MS;
  return manifest;
}

/** Collapse concurrent artifact reads; failures retain the last good value and force manifest revalidation before retry. */
async function readArtifact<T>(
  state: ArtifactReadState,
  manifest: SnapshotManifest,
  kind: "payload" | "intelligence-index" | "community-rankings",
  cache: ArtifactCache<T>,
  decode: (bytes: Buffer) => Promise<T>,
): Promise<T> {
  const hash = {
    payload: manifest.payload_sha256,
    "intelligence-index": manifest.intelligence_index_sha256!,
    "community-rankings": manifest.community_rankings_sha256!,
  }[kind];
  if (cache.hash === hash && cache.value !== undefined) return cache.value;
  if (cache.pending?.hash === hash) return cache.pending.promise;
  const promise = (async () => {
    try {
      const response = await fetch(
        snapshotUrl(state.bucket, snapshotObject(manifest.version, kind)),
        {
          // Versioned artifacts are immutable; Next's persistent cache avoids downloading them again in every cold function instance.
          cache: "force-cache",
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
      state.cacheExpiresAtMs = 0;
      state.etag = null;
      throw error;
    } finally {
      if (cache.pending?.hash === hash) cache.pending = undefined;
    }
  })();
  cache.pending = { hash, promise };
  return promise;
}

/** Refresh display metadata while retaining the preservation version that produced the saved model rows. */
function withCurrentMetadata(payload: ModelAtlasPayload): ModelAtlasPayload {
  return {
    ...payload,
    metadata: buildCurrentModelAtlasMetadata({
      models: payload.models,
      healthModels: payload.models,
      availableMetrics: payload.metadata?.available_metrics,
      sourceHealth: payload.metadata?.source_health,
      benchmarkUpdateHealth: payload.metadata?.benchmark_update_health,
      benchmarkVersions: payload.metadata?.benchmark_versions,
      availabilitySource: "metadata",
      snapshotPreservationVersion: payload.metadata.scoring.snapshot_preservation_version ?? null,
    }),
  };
}
