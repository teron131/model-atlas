/** Snapshot steps for the Artificial Analysis leaderboard and evaluation-page resources: when a stored cache is refetched despite a cache hit, how a refreshed row replaces a cached one, and which series a new version resets. */

import { asFiniteNumber, asNonEmptyString, asRecord, type JsonObject } from "../../runtime";
import { sourceRowKey } from "../snapshots/policy";
import { snapshotSourceRows } from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import {
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES,
  type ArtificialAnalysisBenchmarkResourceRow,
  getArtificialAnalysisBenchmarkResourceStats,
} from "./benchmark-resources";
import type {
  readArtificialAnalysisBenchmarkResourceRawCache,
  readArtificialAnalysisRawCache,
} from "./cache";
import {
  artificialAnalysisModelId,
  getArtificialAnalysisLeaderboardRawStats,
  processArtificialAnalysisLeaderboardRows,
  projectArtificialAnalysisLeaderboardRows,
} from "./leaderboard";

type ArtificialAnalysisSnapshot = {
  artificialAnalysisRawRows: SourceSnapshots["artificialAnalysisRawRows"];
  artificialAnalysisSelectedRows: SourceSnapshots["artificialAnalysisSelectedRows"];
  sourceStatus: SourceSnapshotStatus;
};

type ArtificialAnalysisBenchmarkResourceSnapshot = {
  artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
  sourceStatus: SourceSnapshotStatus;
};

const ACTIVE_BENCHMARK_RESOURCE_PAGE_URLS = new Map(
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.map((page) => [page.benchmark_key, page.url]),
);

const PINNED_BENCHMARK_RESOURCE_VERSIONS = new Map(
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.flatMap((page) =>
    page.version == null ? [] : [[page.benchmark_key, page.version] as const],
  ),
);

/** Replace available Artificial Analysis rows as one current score/resource observation; retain stronger evidence only for unavailable shells. */
export function mergeArtificialAnalysisRow(
  cachedRow: JsonObject,
  fetchedRow: JsonObject,
): JsonObject {
  if (
    isRowUnavailable(fetchedRow) &&
    asFiniteNumber(fetchedRow.intelligenceIndex) == null &&
    signalCount(cachedRow) > signalCount(fetchedRow)
  ) {
    return cachedRow;
  }
  return fetchedRow;
}

export async function artificialAnalysisSnapshot(
  cached: ReturnType<typeof readArtificialAnalysisRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<ArtificialAnalysisSnapshot> {
  const snapshot = await snapshotSourceRows({
    source: "artificial_analysis",
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getArtificialAnalysisLeaderboardRawStats,
    rowKey: artificialAnalysisModelId,
    rowLabel: (row) => asNonEmptyString(row.name),
    mergeRow: mergeArtificialAnalysisRow,
    // The page publishes one index version for every row, so a new version replaces the cached rows, including those kept for retired models.
    versions: { versionOf: (row) => row.intelligenceIndexVersion },
  });
  return {
    artificialAnalysisRawRows: snapshot.rows,
    artificialAnalysisSelectedRows: projectArtificialAnalysisLeaderboardRows(snapshot.rows),
    sourceStatus: {
      source: "artificial_analysis",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: "artificialAnalysis",
    },
  };
}

/** Loads Artificial Analysis benchmark resources keyed by benchmark, source model, and effort. */
export async function artificialAnalysisBenchmarkResourceSnapshot(
  cached: ReturnType<typeof readArtificialAnalysisBenchmarkResourceRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<ArtificialAnalysisBenchmarkResourceSnapshot> {
  // A benchmark that moved to another evaluation page is a new series; rows from its earlier page cannot be retained beside it.
  // A page that reports another version than its pin fetches no rows, so the version rule never sees a successor: rows cached under an earlier pin are dropped here instead.
  const current = cached && {
    ...cached,
    rows: cached.rows.filter(
      (row) =>
        (ACTIVE_BENCHMARK_RESOURCE_PAGE_URLS.get(row.benchmark_key) ?? row.source_url) ===
          row.source_url &&
        (PINNED_BENCHMARK_RESOURCE_VERSIONS.get(row.benchmark_key) ?? row.benchmark_version) ===
          row.benchmark_version,
    ),
  };
  const requiredPagesPresent = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.every((page) =>
    current?.rows.some((row) => row.benchmark_key === page.benchmark_key),
  );
  const snapshot = await snapshotSourceRows({
    source: "artificial_analysis_benchmark_resources",
    cached: current,
    status: requiredPagesPresent ? status : { ...status, cache_hit: false },
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows: getArtificialAnalysisBenchmarkResourceStats,
    rowKey: artificialAnalysisBenchmarkResourceRowKey,
    rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
    versions: { versionOf: (row) => row.benchmark_version, seriesOf: (row) => row.benchmark_key },
    seriesOf: (row) => row.benchmark_key,
  });
  const activeRows = snapshot.rows.filter((row) =>
    ACTIVE_BENCHMARK_RESOURCE_PAGE_URLS.has(row.benchmark_key),
  );
  const activeRowKeys = new Set(activeRows.map(artificialAnalysisBenchmarkResourceRowKey));
  return {
    artificialAnalysisBenchmarkResourceRows: snapshot.rows,
    sourceStatus: {
      source: "artificial_analysis_benchmark_resources",
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: activeRows.length,
      sourceRowStates: snapshot.sourceRowStates.filter((state) => activeRowKeys.has(state.row_key)),
      fetchedAtKey: "artificialAnalysisBenchmarkResources",
    },
  };
}

/** Builds a stable cache key that keeps benchmark reasoning-effort observations distinct. */
export function artificialAnalysisBenchmarkResourceRowKey(
  row: ArtificialAnalysisBenchmarkResourceRow,
): string {
  return sourceRowKey(row.benchmark_key, row.model_id, row.reasoning_effort);
}

function isRowUnavailable(row: JsonObject): boolean {
  const name = typeof row.name === "string" ? row.name.toLowerCase() : "";
  return (
    row.deprecated === true ||
    name.includes("not currently available") ||
    name.includes("unavailable")
  );
}

/** Counts the index and per-task values the leaderboard projection would publish from the row. */
function signalCount(row: JsonObject): number {
  const [projected] = processArtificialAnalysisLeaderboardRows(
    [row],
    ["intelligence", "intelligence_index_cost"],
  );
  return [
    ...Object.values(asRecord(projected?.intelligence)),
    ...Object.values(asRecord(projected?.intelligence_index_cost)),
  ].filter((value) => asFiniteNumber(value) != null).length;
}
