/**
 * Aggregate model indexes and resource measurements from Artificial Analysis.
 *
 * Page source: https://artificialanalysis.ai/leaderboards/models
 */

import {
  ARTIFICIAL_ANALYSIS_AGENTIC_INDEX_KEYS,
  ARTIFICIAL_ANALYSIS_INTELLIGENCE_INDEX_KEYS,
} from "../../benchmarks/field-keys";
import { type ScoringConfig, selectedBenchmarkKeys } from "../../config/stage";
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
  ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS,
  artificialAnalysisModelId,
  getArtificialAnalysisLeaderboardRawStats,
  processArtificialAnalysisLeaderboardRows,
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

const RESOURCE_SIGNAL_KEYS = [
  "cost_per_task",
  "seconds_per_task",
  "output_tokens_per_task",
] as const;

const ACTIVE_BENCHMARK_RESOURCE_PAGE_URLS = new Map(
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.map((page) => [page.benchmark_key, page.url]),
);

/** Replace available Artificial Analysis rows as one current score/resource observation; retain stronger evidence only for unavailable shells. */
export function mergeArtificialAnalysisRow(
  cachedRow: JsonObject,
  fetchedRow: JsonObject,
  scoringConfig: ScoringConfig,
): JsonObject {
  if (
    isRowUnavailable(fetchedRow) &&
    asFiniteNumber(fetchedRow.intelligenceIndex ?? fetchedRow.intelligence_index) == null &&
    signalCount(cachedRow, scoringConfig) > signalCount(fetchedRow, scoringConfig)
  ) {
    return cachedRow;
  }
  return fetchedRow;
}

export async function artificialAnalysisSnapshot(
  cached: ReturnType<typeof readArtificialAnalysisRawCache>,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  scoringConfig: ScoringConfig,
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
    mergeRow: (cachedRow, fetchedRow) =>
      mergeArtificialAnalysisRow(cachedRow, fetchedRow, scoringConfig),
  });
  return {
    artificialAnalysisRawRows: snapshot.rows,
    artificialAnalysisSelectedRows: projectLeaderboardRows(snapshot.rows),
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
  const current = cached && {
    ...cached,
    rows: cached.rows.filter(
      (row) =>
        (ACTIVE_BENCHMARK_RESOURCE_PAGE_URLS.get(row.benchmark_key) ?? row.source_url) ===
        row.source_url,
    ),
  };
  const requiredPagesPresent = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.every((page) =>
    current?.rows.some(
      (row) =>
        row.benchmark_key === page.benchmark_key && row.task_run_count === page.task_run_count,
    ),
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
    mergeRow: (_cachedRow, fetchedRow) => fetchedRow,
    editions: { editionOf: (row) => row.benchmark_version, seriesOf: (row) => row.benchmark_key },
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

function signalCount(row: JsonObject, scoringConfig: ScoringConfig): number {
  const intelligence = asRecord(row.intelligence);
  const benchmarks = asRecord(row.benchmarks);
  const cost = asRecord(row.intelligence_index_cost);
  const keys = signalKeys(scoringConfig);
  return [...keys].filter(
    (key) =>
      asFiniteNumber(row[key]) != null ||
      asFiniteNumber(intelligence[key]) != null ||
      asFiniteNumber(benchmarks[key]) != null ||
      asFiniteNumber(cost[key]) != null,
  ).length;
}

function signalKeys(scoringConfig: ScoringConfig): Set<string> {
  const keys = new Set<string>(RESOURCE_SIGNAL_KEYS);
  for (const key of [
    ...ARTIFICIAL_ANALYSIS_INTELLIGENCE_INDEX_KEYS,
    ...ARTIFICIAL_ANALYSIS_AGENTIC_INDEX_KEYS,
    ...selectedBenchmarkKeys(scoringConfig),
  ]) {
    keys.add(key);
    keys.add(camelMetricKey(key));
  }
  return keys;
}

function camelMetricKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function projectLeaderboardRows(
  rows: SourceSnapshots["artificialAnalysisRawRows"],
): SourceSnapshots["artificialAnalysisSelectedRows"] {
  return processArtificialAnalysisLeaderboardRows(rows, {
    selectedColumns: [...ARTIFICIAL_ANALYSIS_LEADERBOARD_COLUMNS],
  });
}
