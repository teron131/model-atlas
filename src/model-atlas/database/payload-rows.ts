/** Payload assembly turns normalized checkpoint rows into the public stats contract. */

import {
  type BenchmarkObservationEvidenceRow,
  type BenchmarkObservationsByKey,
  parseBenchmarkObservationMetadata,
} from "../benchmarks/observation";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../benchmarks/registry";
import { canonicalReasoningEffort } from "../identity/normalization";
import { publicModelFromCandidate } from "../pipeline/selection/public-list";
import { asFiniteNumber, asNonEmptyString, asRecord } from "../runtime";
import { readAleBenchRawCache } from "../sources/ale-bench/runtime";
import { artificialAnalysisBenchmarkResourceRawCacheFromRows } from "../sources/artificial-analysis/cache";
import { fusedBenchmarkObservations } from "../sources/assembly";
import { readTerminalBench4RawCache } from "../sources/terminal-bench-4/runtime";
import { type DbRow, jsonValue } from "../sqlite-utils";
import { buildChangeHistory, recentChangeMarks, variantKey } from "../stats/payload/changes";
import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import type {
  ModelAtlasBenchmarkUpdateHealth,
  ModelAtlasPayload,
  ModelAtlasSourceHealth,
  ModelAtlasSourceQuarantine,
} from "../stats/types";
import { CHANGE_LOG_ROW_GROUPS, changeLogFromRows } from "./change-log";
import {
  benchmarkDatesByModelRow,
  benchmarksByModelRow,
  scoredCandidateFromRow,
  taskMetricsByModelRow,
} from "./model-rows";
import { sqlStringLiteral } from "./schema-reconciliation";
import { SNAPSHOT_TABLES, type SnapshotTableName } from "./tables";

export const SNAPSHOT_METADATA_SQL = "SELECT * FROM snapshot_metadata LIMIT 1";

type PayloadRowGroupOptions = {
  columns?: readonly string[];
  optional?: boolean;
  sourceKey?: string | null;
};

/** Build one row-group entry so table identity and read SQL cannot drift. */
function payloadRowGroup<Key extends string>(
  key: Key,
  table: SnapshotTableName,
  orderBy: string,
  { columns = ["*"], optional = false, sourceKey = null }: PayloadRowGroupOptions = {},
) {
  const sourcePredicate =
    sourceKey == null ? "" : ` WHERE source_key = ${sqlStringLiteral(sourceKey)}`;
  return {
    key,
    sql: `SELECT ${columns.join(", ")} FROM ${table}${sourcePredicate} ORDER BY ${orderBy}`,
    optional,
  };
}

const BENCHMARK_OBSERVATION_PAYLOAD_COLUMNS = [
  "url",
  "model_id",
  "model",
  "base_model",
  "reasoning_effort",
  "model_creator",
  "canonical_value",
  "cost",
  "tokens_per_task",
  "task_run_count",
  "total_cost_usd",
  "total_tokens",
  "observed_at",
  "metadata_json",
] as const;

export const PAYLOAD_ROW_GROUPS = [
  payloadRowGroup(
    "artificialAnalysisBenchmarkResourceRows",
    SNAPSHOT_TABLES.artificial_analysis_benchmark_resources,
    "row_index",
    { optional: true },
  ),
  payloadRowGroup("modelRows", SNAPSHOT_TABLES.models, "row_index"),
  payloadRowGroup(
    "modelBenchmarkRows",
    SNAPSHOT_TABLES.model_benchmarks,
    "model_row_index, benchmark_key",
  ),
  payloadRowGroup(
    "modelTaskMetricRows",
    SNAPSHOT_TABLES.model_task_metrics,
    "model_row_index, source_key",
  ),
  payloadRowGroup("sourceHealthRows", SNAPSHOT_TABLES.source_health, "row_index", {
    optional: true,
  }),
  payloadRowGroup("sourceQuarantineRows", SNAPSHOT_TABLES.source_quarantines, "source, row_key", {
    columns: ["source", "row_key", "row_label", "missing_from_source_since_epoch_seconds"],
  }),
  // Fusion rebuilds these benchmarks' observations from their complete raw rows.
  payloadRowGroup("aleBenchRows", SNAPSHOT_TABLES.ale_bench, "row_index", { optional: true }),
  payloadRowGroup("terminalBench4Rows", SNAPSHOT_TABLES.terminal_bench_4, "row_index", {
    optional: true,
  }),
  ...BENCHMARK_OBSERVATION_BINDINGS.map((binding) =>
    payloadRowGroup(binding.sourceRowsKey, binding.rawTable, "row_index", {
      columns: BENCHMARK_OBSERVATION_PAYLOAD_COLUMNS,
      optional: true,
      sourceKey: binding.benchmark,
    }),
  ),
  ...CHANGE_LOG_ROW_GROUPS,
] as const;

export type PayloadRowGroup = (typeof PAYLOAD_ROW_GROUPS)[number];
type PayloadRowKey = PayloadRowGroup["key"];
type PayloadRows = {
  fetchedAt: number | null;
  snapshotPreservationVersion: number | null;
  benchmarkUpdateHealth: ModelAtlasBenchmarkUpdateHealth | undefined;
  benchmarkVersions: Readonly<Record<string, string>> | undefined;
} & Record<PayloadRowKey, DbRow[]>;

/** Row groups missing from `rowGroups` read as empty. */
export function buildPayloadRows(
  snapshotMetadata: unknown,
  rowGroups: ReadonlyArray<readonly [PayloadRowKey, DbRow[]]>,
): PayloadRows {
  const metadata = asRecord(snapshotMetadata);
  const rowsByKey = new Map(rowGroups);
  const rows = Object.fromEntries(
    PAYLOAD_ROW_GROUPS.map(({ key }) => [key, rowsByKey.get(key) ?? []]),
  ) as Record<PayloadRowKey, DbRow[]>;
  const benchmarkUpdateHealth = jsonValue(metadata.benchmark_update_health_json);
  const benchmarkVersions = jsonValue(metadata.benchmark_versions_json);
  return {
    fetchedAt: asFiniteNumber(metadata.updated_at_epoch_seconds),
    snapshotPreservationVersion: asFiniteNumber(metadata.snapshot_preservation_version),
    benchmarkUpdateHealth: isEntryRecord(benchmarkUpdateHealth) ? benchmarkUpdateHealth : undefined,
    benchmarkVersions: isStringRecord(benchmarkVersions) ? benchmarkVersions : undefined,
    ...rows,
  };
}

/** Stored health is checked here only as a record of entries; metadata assembly validates each entry before use, as it does for published payloads. */
function isEntryRecord(value: unknown): value is ModelAtlasBenchmarkUpdateHealth {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => entry != null && typeof entry === "object")
  );
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function observationsFromPayloadRows(rows: PayloadRows): BenchmarkObservationsByKey {
  const observations: BenchmarkObservationsByKey = {};
  for (const { benchmark, sourceRowsKey } of BENCHMARK_OBSERVATION_BINDINGS) {
    const benchmarkRows: BenchmarkObservationEvidenceRow[] = [];
    for (const row of rows[sourceRowsKey]) {
      const model = asNonEmptyString(row.model);
      const baseModel = asNonEmptyString(row.base_model);
      const canonicalValue = asFiniteNumber(row.canonical_value);
      if (model == null || baseModel == null || canonicalValue == null) {
        continue;
      }
      const cost = asFiniteNumber(row.cost);
      const tokensPerTask = asFiniteNumber(row.tokens_per_task);
      const taskRunCount = asFiniteNumber(row.task_run_count);
      const totalCostUsd = asFiniteNumber(row.total_cost_usd);
      const totalTokens = asFiniteNumber(row.total_tokens);
      const metadata = parseBenchmarkObservationMetadata(row.metadata_json);
      benchmarkRows.push({
        model_id: asNonEmptyString(row.model_id),
        model,
        base_model: baseModel,
        reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
        canonical_value: canonicalValue,
        ...(cost == null ? {} : { cost }),
        ...(tokensPerTask == null ? {} : { tokens_per_task: tokensPerTask }),
        ...(taskRunCount == null ? {} : { task_run_count: taskRunCount }),
        ...(totalCostUsd == null ? {} : { total_cost_usd: totalCostUsd }),
        ...(totalTokens == null ? {} : { total_tokens: totalTokens }),
        observed_at: asNonEmptyString(row.observed_at),
        ...(metadata?.observation_role == null &&
        metadata?.benchmark_count == null &&
        benchmark !== "terminal_bench_science"
          ? {}
          : { metadata: metadata ?? {} }),
      });
    }
    observations[benchmark] = benchmarkRows;
  }
  const sourceRows = (key: string, raw: DbRow[]) =>
    raw.map((row) => ({
      benchmark_key: key,
      source_url: asNonEmptyString(row.url) ?? "",
      model_id: asNonEmptyString(row.model_id),
      model: asNonEmptyString(row.model) ?? "",
      base_model: asNonEmptyString(row.base_model) ?? "",
      reasoning_effort: asNonEmptyString(row.reasoning_effort),
      model_creator: asNonEmptyString(row.model_creator),
      rank: asFiniteNumber(row.rank),
      canonical_value: asFiniteNumber(row.canonical_value) ?? 0,
      cost: asFiniteNumber(row.cost),
      tokens_per_task: asFiniteNumber(row.tokens_per_task),
      observed_at: asNonEmptyString(row.observed_at),
      metadata: parseBenchmarkObservationMetadata(row.metadata_json) ?? {},
    }));
  const fused = fusedBenchmarkObservations({
    terminalBench4Rows: readTerminalBench4RawCache(rows.terminalBench4Rows)?.rows ?? [],
    artificialAnalysisBenchmarkResourceRows:
      artificialAnalysisBenchmarkResourceRawCacheFromRows(
        rows.artificialAnalysisBenchmarkResourceRows,
      )?.rows ?? [],
    terminalBenchScienceRows: sourceRows("terminal_bench_science", rows.terminalBenchScienceRows),
    gdpPdfRows: sourceRows("gdp_pdf", rows.gdpPdfRows),
    aleBenchRows: readAleBenchRawCache(rows.aleBenchRows)?.rows ?? [],
    weirdMlRows: sourceRows("weirdml_v3", rows.weirdMlRows),
  });
  Object.assign(observations, fused);
  return observations;
}

function sourceHealthFromRows(
  rows: DbRow[],
  quarantineRows: DbRow[],
  generatedAt: number | null,
): ModelAtlasSourceHealth | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  const quarantinesBySource = new Map<string, ModelAtlasSourceQuarantine[]>();
  for (const row of quarantineRows) {
    const source = asNonEmptyString(row.source);
    const rowKey = asNonEmptyString(row.row_key);
    if (source == null || rowKey == null) {
      continue;
    }
    const quarantines = quarantinesBySource.get(source) ?? [];
    quarantines.push({
      row_key: rowKey,
      row_label: asNonEmptyString(row.row_label),
      missing_from_source_since_epoch_seconds: asFiniteNumber(
        row.missing_from_source_since_epoch_seconds,
      ),
    });
    quarantinesBySource.set(source, quarantines);
  }
  for (const quarantines of quarantinesBySource.values()) {
    quarantines.sort(
      (left, right) =>
        (left.missing_from_source_since_epoch_seconds ?? Number.MAX_SAFE_INTEGER) -
          (right.missing_from_source_since_epoch_seconds ?? Number.MAX_SAFE_INTEGER) ||
        left.row_key.localeCompare(right.row_key),
    );
  }
  return {
    generated_at_epoch_seconds: generatedAt,
    sources: Object.fromEntries(
      rows.flatMap((row) => {
        const source = asNonEmptyString(row.source);
        const status = asNonEmptyString(row.status);
        if (
          source == null ||
          (status !== "cache_hit" &&
            status !== "fresh" &&
            status !== "using_cached_rows" &&
            status !== "empty")
        ) {
          return [];
        }
        return [
          [
            source,
            {
              status,
              last_fetch_epoch_seconds: asFiniteNumber(row.last_fetch_epoch_seconds),
              source_input_count: asFiniteNumber(row.source_input_count) ?? 0,
              active_row_count: asFiniteNumber(row.active_row_count) ?? 0,
              quarantined_row_count: asFiniteNumber(row.quarantined_row_count) ?? 0,
              quarantined_rows: quarantinesBySource.get(source) ?? [],
            },
          ],
        ];
      }),
    ),
  };
}

export function buildPayloadFromRows(rows: PayloadRows): ModelAtlasPayload {
  const updatesByVariant = new Map(
    buildChangeHistory(changeLogFromRows(rows)).map(({ model_id, reasoning_effort, updates }) => [
      variantKey(model_id, reasoning_effort),
      updates,
    ]),
  );
  const benchmarksByModel = benchmarksByModelRow(rows.modelBenchmarkRows);
  const benchmarkDatesByModel = benchmarkDatesByModelRow(rows.modelBenchmarkRows);
  const taskMetricsByModel = taskMetricsByModelRow(rows.modelTaskMetricRows);
  const models = rows.modelRows.flatMap((row) => {
    const modelRowIndex = asFiniteNumber(row.row_index);
    const candidate = scoredCandidateFromRow(
      row,
      modelRowIndex == null ? null : (benchmarksByModel.get(modelRowIndex) ?? null),
      modelRowIndex == null ? null : (benchmarkDatesByModel.get(modelRowIndex) ?? null),
      modelRowIndex == null ? null : (taskMetricsByModel.get(modelRowIndex) ?? null),
    );
    const model = publicModelFromCandidate(candidate);
    if (model == null) {
      return [];
    }
    const updates =
      model.id == null
        ? undefined
        : updatesByVariant.get(variantKey(model.id, model.reasoning_effort));
    return [updates == null ? model : { ...model, recent_changes: recentChangeMarks(updates) }];
  });
  const sourceHealth = sourceHealthFromRows(
    rows.sourceHealthRows,
    rows.sourceQuarantineRows,
    rows.fetchedAt,
  );
  return {
    fetched_at_epoch_seconds: rows.fetchedAt,
    metadata: buildCurrentModelAtlasMetadata({
      models,
      sourceHealth,
      benchmarkUpdateHealth: rows.benchmarkUpdateHealth,
      benchmarkVersions: rows.benchmarkVersions,
      snapshotPreservationVersion: rows.snapshotPreservationVersion,
    }),
    models,
    benchmark_observations: observationsFromPayloadRows(rows),
  };
}
