/** Benchmark-observation runtime owns cache reconstruction, catalog-driven snapshots, and raw-row serialization. */

import {
  type BenchmarkObservationRow,
  parseBenchmarkObservationMetadata,
} from "../../benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkObservationBinding,
} from "../../benchmarks/registry";
import type { DatabaseWriter } from "../../database/writers/database";
import { normalizeModelToken, parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import { type CacheRowSource, firstFetchedAt, queryCacheRows } from "../cache/rows";
import type { RawSourceName } from "../registry";
import {
  benchmarkObservationRowKey,
  mergeBenchmarkObservationRow,
  snapshotSourceRows,
} from "../snapshots/row-snapshot";
import type {
  RawSourceCacheStatus,
  SourceRefreshOptions,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import { benchmarkObservationSource } from "./load";

type BenchmarkObservationSnapshot = {
  rows: BenchmarkObservationRow[];
  sourceStatus: SourceSnapshotStatus;
};

export async function benchmarkObservationSnapshots(
  caches: Readonly<Record<string, ReturnType<typeof readBenchmarkObservationRawCache> | undefined>>,
  statuses: Record<RawSourceName, RawSourceCacheStatus>,
  options: SourceRefreshOptions,
  previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
  nowEpochSeconds: number,
) {
  return Promise.all(
    BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => {
      const benchmarkKey = binding.benchmark;
      return {
        binding,
        snapshot: await benchmarkObservationSnapshot(
          binding,
          caches[binding.sourceDataKey] ?? null,
          statuses[benchmarkKey],
          options,
          previousMissingSince[benchmarkKey],
          nowEpochSeconds,
        ),
      };
    }),
  );
}

export function readBenchmarkObservationRawCache(
  cache: CacheRowSource,
  binding: BenchmarkObservationBinding,
) {
  const source = benchmarkObservationSource(binding);
  const expectedUrls =
    source.sourceUrls ?? ("sourceUrl" in binding.loader ? [binding.loader.sourceUrl] : undefined);
  const cached = readBenchmarkObservationRows(
    cache,
    binding.rawTable,
    binding.benchmark,
    expectedUrls,
  );
  if (cached == null) return null;
  if (source.acceptsCache?.(cached.rows) === false) return null;
  return cached;
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
    const rows = snapshots[binding.sourceRowsKey] as readonly BenchmarkObservationRow[];
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

/** Resolve fetch and merge policy from the binding while retaining cached evidence and missing-row tracking. */
async function benchmarkObservationSnapshot(
  binding: BenchmarkObservationBinding,
  cached: { rows: BenchmarkObservationRow[]; fetchedAt: number | null } | null,
  status: RawSourceCacheStatus,
  options: SourceRefreshOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
): Promise<BenchmarkObservationSnapshot> {
  const {
    fetchRows,
    acceptsRefresh,
    replaceRowsOnRefresh,
    mergeRow = mergeBenchmarkObservationRow,
  } = benchmarkObservationSource(binding);
  const snapshot = await snapshotSourceRows({
    source: binding.benchmark,
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows,
    acceptsRefresh,
    replaceRowsOnRefresh,
    rowKey: benchmarkObservationRowKey,
    rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
    editions: { editionOf: (row) => row.metadata.benchmark_version },
    mergeRow,
  });
  return {
    rows: snapshot.rows,
    sourceStatus: {
      source: binding.benchmark,
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey: binding.sourceDataKey,
    },
  };
}

function readBenchmarkObservationRows(
  cache: CacheRowSource,
  table: string,
  benchmarkKey: string,
  expectedUrls?: readonly string[],
): {
  rows: BenchmarkObservationRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = Array.isArray(cache)
    ? cache.filter((row) => asNonEmptyString(row.source_key) === benchmarkKey)
    : queryCacheRows(cache, `SELECT * FROM ${table} WHERE source_key = ? ORDER BY row_index`, [
        benchmarkKey,
      ]);
  if (cacheRows.length === 0) return null;
  const rows = cacheRows.flatMap((row) => {
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
      (expectedUrls != null && !expectedUrls.includes(sourceUrl)) ||
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
  return rows.length === 0 ? null : { rows, fetchedAt: firstFetchedAt(cacheRows) };
}
