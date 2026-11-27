/** Storage side of the benchmark-observation sources, which share one raw table in the SQLite checkpoint: rebuild each catalog binding's cached rows from it, run each binding through the shared snapshot recipe, and write the rows back. */

import type { DatabaseSync } from "node:sqlite";

import {
  type BenchmarkObservationRow,
  parseBenchmarkObservationMetadata,
} from "../../benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkObservationBinding,
} from "../../benchmarks/registry";
import { normalizeModelToken, parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import type { DatabaseWriter } from "../../sqlite-utils";
import { type CacheRowSource, firstFetchedAt, queryCacheRows } from "../cache/rows";
import type { RawSourceName } from "../registry";
import { snapshotSourceRows, sourceSnapshotStatus } from "../snapshots/row-snapshot";
import type {
  BenchmarkObservationRows,
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import { benchmarkObservationRowKeyFor, benchmarkObservationSource } from "./load";

export function readBenchmarkObservationCaches(db: DatabaseSync) {
  return BENCHMARK_OBSERVATION_BINDINGS.map((binding) => ({
    binding,
    cached: readBenchmarkObservationRawCache(db, binding),
  }));
}

export async function benchmarkObservationSnapshots(
  caches: ReturnType<typeof readBenchmarkObservationCaches>,
  statuses: Record<RawSourceName, RawSourceCacheStatus>,
  options: SourceRefreshOptions,
  previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
  nowEpochSeconds: number,
): Promise<{
  rows: BenchmarkObservationRows;
  sourceStatuses: SourceSnapshotStatus[];
}> {
  const snapshots = await Promise.all(
    caches.map(async ({ binding, cached }) => {
      const { fetchRows, acceptsRefresh, replaceRowsOnRefresh } =
        benchmarkObservationSource(binding);
      const snapshot = await snapshotSourceRows({
        source: binding.benchmark,
        cached,
        status: statuses[binding.benchmark],
        options,
        previousMissingSince: previousMissingSince[binding.benchmark],
        nowEpochSeconds,
        fetchRows,
        acceptsRefresh,
        replaceRowsOnRefresh,
        rowKeyFor: benchmarkObservationRowKeyFor,
        rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
        versions: { versionOf: (row) => row.metadata.benchmark_version },
        seriesOf: (row) => row.source_url,
      });
      return {
        sourceRowsKey: binding.sourceRowsKey,
        rows: snapshot.rows,
        sourceStatus: {
          ...sourceSnapshotStatus(binding.benchmark, snapshot),
          fetchedAtKey: binding.sourceDataKey,
        },
      };
    }),
  );
  return {
    rows: Object.fromEntries(
      snapshots.map(({ sourceRowsKey, rows }) => [sourceRowsKey, rows]),
    ) as BenchmarkObservationRows,
    sourceStatuses: snapshots.map(({ sourceStatus }) => sourceStatus),
  };
}

export function insertBenchmarkObservationRows(
  db: DatabaseWriter,
  snapshots: SourceSnapshots,
): void {
  const statement = db.prepare(`
		INSERT INTO ${BENCHMARK_OBSERVATION_RAW_TABLE} (
			source_key, row_index, fetched_at_epoch_seconds, benchmark_key, url,
			model_id, model, base_model, reasoning_effort, model_creator, rank,
			canonical_value, cost, tokens_per_task, task_run_count, total_cost_usd,
			total_tokens, observed_at, metadata_json
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
  for (const binding of BENCHMARK_OBSERVATION_BINDINGS) {
    const rows = snapshots[binding.sourceRowsKey];
    const fetchedAt = snapshots.fetchedAt[binding.sourceDataKey];
    for (const [index, row] of rows.entries()) {
      statement.run(
        binding.benchmark,
        index,
        fetchedAt,
        row.benchmark_key,
        row.source_url,
        row.model_id,
        row.model,
        row.base_model,
        row.reasoning_effort,
        row.model_creator,
        row.rank,
        row.canonical_value,
        row.cost ?? null,
        row.tokens_per_task ?? null,
        row.task_run_count ?? null,
        row.total_cost_usd ?? null,
        row.total_tokens ?? null,
        row.observed_at,
        JSON.stringify(row.metadata),
      );
    }
  }
}

/** Null when no stored row parses or the source's `acceptsCache` rejects the rows, which makes the snapshot refetch even under a cache hit. */
export function readBenchmarkObservationRawCache(
  cache: CacheRowSource,
  binding: BenchmarkObservationBinding,
) {
  const { sourceUrls, acceptsCache } = benchmarkObservationSource(binding);
  const { benchmark: benchmarkKey, rawTable } = binding;
  const cacheRows = Array.isArray(cache)
    ? cache.filter((row) => asNonEmptyString(row.source_key) === benchmarkKey)
    : queryCacheRows(cache, `SELECT * FROM ${rawTable} WHERE source_key = ? ORDER BY row_index`, [
        benchmarkKey,
      ]);
  const rows = cacheRows.flatMap((row): BenchmarkObservationRow[] => {
    const rowBenchmarkKey = asNonEmptyString(row.benchmark_key);
    const sourceUrl = asNonEmptyString(row.url);
    const model = asNonEmptyString(row.model);
    const baseModel = asNonEmptyString(row.base_model);
    const canonicalValue = asFiniteNumber(row.canonical_value);
    const cost = asFiniteNumber(row.cost);
    const tokensPerTask = asFiniteNumber(row.tokens_per_task);
    const taskRunCount = asFiniteNumber(row.task_run_count);
    const totalCostUsd = asFiniteNumber(row.total_cost_usd);
    const totalTokens = asFiniteNumber(row.total_tokens);
    const metadata = parseBenchmarkObservationMetadata(row.metadata_json);
    const reasoningEffort = asNonEmptyString(row.reasoning_effort);
    if (
      rowBenchmarkKey !== benchmarkKey ||
      sourceUrl == null ||
      (sourceUrls != null && !sourceUrls.includes(sourceUrl)) ||
      model == null ||
      baseModel == null ||
      canonicalValue == null ||
      metadata == null
    )
      return [];
    if (
      (taskRunCount != null && (!Number.isInteger(taskRunCount) || taskRunCount <= 0)) ||
      (totalCostUsd != null && totalCostUsd < 0) ||
      (totalTokens != null && (!Number.isInteger(totalTokens) || totalTokens < 0))
    ) {
      return [];
    }
    const parsedModel = parseModelEffort(model);
    const storedBaseKey = normalizeModelToken(baseModel);
    const parsedBaseKey = normalizeModelToken(parsedModel.baseModel);
    const normalizedDisplay = model.toLowerCase();
    const normalizedStoredBase = baseModel.toLowerCase();
    const storedBaseIsDisplayStem =
      normalizedDisplay.startsWith(`${normalizedStoredBase} (`) ||
      normalizedDisplay.startsWith(`${normalizedStoredBase} - `);
    // Reparse generic display-stem bases without replacing source-owned aliases such as Kimi's `K3`.
    const storedBaseWasParserDerived = parsedBaseKey === storedBaseKey || storedBaseIsDisplayStem;
    return [
      {
        benchmark_key: benchmarkKey,
        source_url: sourceUrl,
        model_id: asNonEmptyString(row.model_id),
        model,
        base_model:
          parsedModel.reasoningEffort === reasoningEffort && storedBaseWasParserDerived
            ? parsedModel.baseModel
            : baseModel,
        reasoning_effort: reasoningEffort,
        model_creator: asNonEmptyString(row.model_creator),
        rank: asFiniteNumber(row.rank),
        canonical_value: canonicalValue,
        ...(cost == null ? {} : { cost }),
        ...(tokensPerTask == null ? {} : { tokens_per_task: tokensPerTask }),
        ...(taskRunCount == null ? {} : { task_run_count: taskRunCount }),
        ...(totalCostUsd == null ? {} : { total_cost_usd: totalCostUsd }),
        ...(totalTokens == null ? {} : { total_tokens: totalTokens }),
        observed_at: asNonEmptyString(row.observed_at),
        metadata,
      },
    ];
  });
  if (rows.length === 0 || acceptsCache?.(rows) === false) return null;
  return { rows, fetchedAt: firstFetchedAt(cacheRows) };
}
