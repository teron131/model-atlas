/** Benchmark-observation runtime owns cache reconstruction, catalog-driven snapshots, and raw-row serialization. */

import { BENCHMARK_RESOURCE_PROFILES } from "../../benchmarks/catalog/portfolio";
import type { EpochRunEligibility } from "../../benchmarks/factory";
import {
  type BenchmarkObservationPayload,
  type BenchmarkObservationRow,
  parseBenchmarkObservationMetadata,
  resourcePerTaskRun,
} from "../../benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_RAW_TABLE,
  type BenchmarkObservationBinding,
} from "../../benchmarks/registry";
import { benchmarkModelEffort, normalizeModelToken } from "../../identity/normalization";
import { asFiniteNumber } from "../../runtime";
import { benchmarkObservationSourceFetcher } from "../../scrapers/benchmarks/observation-source";
import { type CacheRowSource, firstEpochSecond, queryCacheRows, stringValue } from "../cache/rows";
import type { RawSourceName } from "../source-registry";
import {
  benchmarkObservationRowKey,
  mergeBenchmarkObservationRow,
  snapshotSourceRows,
} from "../source-snapshots/row-snapshot";
import type {
  DatabaseBuildOptions,
  RawSourceCacheStatus,
  SourceSnapshots,
  SourceSnapshotStatus,
} from "../types";
import type { DatabaseWriter } from "../writers/database";

function readBenchmarkObservationRows(
  cache: CacheRowSource,
  table: string,
  benchmarkKey: string,
  expectedUrl?: string,
): {
  rows: BenchmarkObservationRow[];
  fetchedAt: number | null;
} | null {
  const cacheRows = Array.isArray(cache)
    ? cache.filter((row) => stringValue(row.source_key) === benchmarkKey)
    : queryCacheRows(cache, `SELECT * FROM ${table} WHERE source_key = ? ORDER BY row_index`, [
        benchmarkKey,
      ]);
  if (cacheRows.length === 0) return null;
  const rows = cacheRows.flatMap((row) => {
    const rowBenchmarkKey = stringValue(row.benchmark_key);
    const sourceUrl = stringValue(row.url);
    const model = stringValue(row.model);
    const baseModel = stringValue(row.base_model);
    const canonicalValue = asFiniteNumber(row.canonical_value);
    const cost = asFiniteNumber(row.cost);
    const tokensPerTask = asFiniteNumber(row.tokens_per_task);
    const taskRunCount = asFiniteNumber(row.task_run_count);
    const totalCostUsd = asFiniteNumber(row.total_cost_usd);
    const totalTokens = asFiniteNumber(row.total_tokens);
    const metadata = parseBenchmarkObservationMetadata(row.metadata_json);
    const reasoningEffort = stringValue(row.reasoning_effort);
    if (
      rowBenchmarkKey !== benchmarkKey ||
      sourceUrl == null ||
      (expectedUrl != null && sourceUrl !== expectedUrl) ||
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
    const parsedModel = benchmarkModelEffort(model);
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
        model_id: stringValue(row.model_id),
        model,
        base_model:
          parsedModel.reasoningEffort === reasoningEffort && storedBaseWasParserDerived
            ? parsedModel.baseModel
            : baseModel,
        reasoning_effort: reasoningEffort,
        model_creator: stringValue(row.model_creator),
        rank: asFiniteNumber(row.rank),
        canonical_value: canonicalValue,
        ...(cost == null ? {} : { cost }),
        ...(tokensPerTask == null ? {} : { tokens_per_task: tokensPerTask }),
        ...(taskRunCount == null ? {} : { task_run_count: taskRunCount }),
        ...(totalCostUsd == null ? {} : { total_cost_usd: totalCostUsd }),
        ...(totalTokens == null ? {} : { total_tokens: totalTokens }),
        observed_at: stringValue(row.observed_at),
        metadata,
      },
    ];
  });
  return rows.length === 0 ? null : { rows, fetchedAt: firstEpochSecond(cacheRows) };
}

function rowsMatchLoader(
  rows: readonly BenchmarkObservationRow[],
  binding: BenchmarkObservationBinding,
): boolean {
  const loader = binding.loader;
  if (loader.kind === "epoch_runs") {
    const eligibility: EpochRunEligibility =
      "eligibility" in loader ? (loader.eligibility ?? {}) : {};
    const excludedModelIds = new Set(eligibility.excludedModelIds ?? []);
    return rows.every(
      (row) =>
        row.metadata.task === loader.task &&
        (eligibility.taskVersion == null ||
          row.metadata.task_version === eligibility.taskVersion) &&
        (eligibility.originalTaskName == null ||
          row.metadata.original_task_name === eligibility.originalTaskName) &&
        (eligibility.runIdPrefix == null ||
          (typeof row.metadata.run_id === "string" &&
            row.metadata.run_id.startsWith(eligibility.runIdPrefix))) &&
        (row.model_id == null || !excludedModelIds.has(row.model_id)),
    );
  }
  if (loader.kind === "vals") {
    return rows.every((row) => row.metadata.task === loader.canonicalTask);
  }
  if (loader.kind === "automation_bench") {
    return rows.every((row) => row.metadata.metric === "task_completed_correctly");
  }
  return true;
}

function arcAgi3HarnessCount(row: BenchmarkObservationRow): number | null {
  if (row.metadata.observation_role === "component") {
    return row.metadata.harness === "standard" || row.metadata.harness === "provider_adapter"
      ? 1
      : null;
  }
  if (row.metadata.observation_role !== "canonical") return null;
  const harnesses = row.metadata.harnesses;
  const validHarnesses = Array.isArray(harnesses)
    ? harnesses.filter(
        (harness): harness is "standard" | "provider_adapter" =>
          harness === "standard" || harness === "provider_adapter",
      )
    : [];
  if (
    !Array.isArray(harnesses) ||
    validHarnesses.length === 0 ||
    validHarnesses.length !== harnesses.length ||
    new Set(validHarnesses).size !== validHarnesses.length
  ) {
    return null;
  }
  return validHarnesses.length;
}

function arcAgi3ResourcesAreCurrent(rows: readonly BenchmarkObservationRow[]): boolean {
  return rows.every((row) => {
    const harnessCount = arcAgi3HarnessCount(row);
    if (
      harnessCount == null ||
      row.task_run_count !== BENCHMARK_RESOURCE_PROFILES.arc_agi_3.taskRunCount * harnessCount
    ) {
      return false;
    }
    if (row.cost == null) return row.total_cost_usd == null;
    return (
      row.cost >= 0 &&
      row.total_cost_usd != null &&
      row.total_cost_usd >= 0 &&
      row.cost === resourcePerTaskRun(row.total_cost_usd, row.task_run_count)
    );
  });
}

/** Reconstruct one catalog-declared benchmark-observation source from SQLite or collected rows. */
export function readBenchmarkObservationRawCache(
  cache: CacheRowSource,
  binding: BenchmarkObservationBinding,
) {
  const expectedUrl = "sourceUrl" in binding.loader ? binding.loader.sourceUrl : undefined;
  const cached = readBenchmarkObservationRows(
    cache,
    binding.rawTable,
    binding.benchmark,
    expectedUrl,
  );
  if (cached == null) return null;
  if (!rowsMatchLoader(cached.rows, binding)) return null;
  if (binding.loader.kind === "terminal_bench_science") {
    const resourcesAreCurrent = cached.rows.every((row) => {
      return (
        row.metadata.source_revision === "v0-1-eval" &&
        row.cost != null &&
        row.cost >= 0 &&
        row.tokens_per_task != null &&
        row.tokens_per_task >= 0 &&
        row.task_run_count === BENCHMARK_RESOURCE_PROFILES.terminal_bench_science.taskRunCount &&
        row.total_cost_usd != null &&
        row.total_cost_usd >= 0 &&
        row.total_tokens != null &&
        row.total_tokens >= 0
      );
    });
    return resourcesAreCurrent ? cached : null;
  }
  if (binding.loader.kind === "arc_prize" && binding.benchmark === "arc_agi_3") {
    return arcAgi3ResourcesAreCurrent(cached.rows) ? cached : null;
  }
  return cached;
}

type BenchmarkObservationSnapshot = {
  rows: BenchmarkObservationRow[];
  sourceStatus: SourceSnapshotStatus;
};

async function benchmarkObservationSnapshot(
  cached: { rows: BenchmarkObservationRow[]; fetchedAt: number | null } | null,
  status: RawSourceCacheStatus,
  options: DatabaseBuildOptions,
  previousMissingSince: ReadonlyMap<string, number>,
  nowEpochSeconds: number,
  source: RawSourceName,
  fetchedAtKey: keyof SourceSnapshots["fetchedAt"],
  fetchRows: () => Promise<BenchmarkObservationPayload>,
): Promise<BenchmarkObservationSnapshot> {
  const snapshot = await snapshotSourceRows({
    source,
    cached,
    status,
    options,
    previousMissingSince,
    nowEpochSeconds,
    fetchRows,
    rowKey: benchmarkObservationRowKey,
    rowLabel: (row) => `${row.benchmark_key}: ${row.model}`,
    mergeRow: mergeBenchmarkObservationRow,
  });
  return {
    rows: snapshot.rows,
    sourceStatus: {
      source,
      fetchedAt: snapshot.fetchedAt,
      sourceInputCount: snapshot.rows.length,
      sourceRowStates: snapshot.sourceRowStates,
      fetchedAtKey,
    },
  };
}

/** Refresh every direct benchmark-observation source declared by the benchmark catalog. */
export async function benchmarkObservationSnapshots(
  caches: Readonly<Record<string, ReturnType<typeof readBenchmarkObservationRawCache> | undefined>>,
  statuses: Record<RawSourceName, RawSourceCacheStatus>,
  options: DatabaseBuildOptions,
  previousMissingSince: Record<RawSourceName, ReadonlyMap<string, number>>,
  nowEpochSeconds: number,
) {
  return Promise.all(
    BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => {
      const source = binding.benchmark;
      const fetchRows = benchmarkObservationSourceFetcher(binding);
      return {
        binding,
        snapshot: await benchmarkObservationSnapshot(
          caches[binding.sourceDataKey] ?? null,
          statuses[source],
          options,
          previousMissingSince[source],
          nowEpochSeconds,
          source,
          binding.sourceDataKey,
          fetchRows,
        ),
      };
    }),
  );
}

/** Insert a catalog-declared benchmark-observation snapshot through its shared row contract. */
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
