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
import { booleanFromSql, jsonValue } from "../sources/cache/rows";
import { readTerminalBench4RawCache } from "../sources/terminal-bench-4/runtime";
import {
  buildChangeHistory,
  CHANGE_HISTORY_SECONDS,
  type ChangeLog,
  type ModelChangeDetailRow,
  type ModelScoreChangeRow,
  recentChangeMarks,
} from "../stats/payload/changes";
import { buildCurrentModelAtlasMetadata } from "../stats/payload/metadata";
import type {
  ModelAtlasBenchmarkRankDriver,
  ModelAtlasBenchmarks,
  ModelAtlasBenchmarkUpdateHealth,
  ModelAtlasContextWindow,
  ModelAtlasCost,
  ModelAtlasInputChange,
  ModelAtlasIntelligence,
  ModelAtlasModalities,
  ModelAtlasModel,
  ModelAtlasPayload,
  ModelAtlasScoreChange,
  ModelAtlasScoreChangeCause,
  ModelAtlasScoredCandidate,
  ModelAtlasScoreDimension,
  ModelAtlasScoreMove,
  ModelAtlasSourceHealth,
  ModelAtlasSourceQuarantine,
  ModelAtlasTaskMetrics,
  ModelAtlasTaskMetricValues,
  ModelAtlasVariantChanges,
} from "../stats/types";
import { sqlStringLiteral } from "./schema-reconciliation";
import { SNAPSHOT_TABLES, type SnapshotTableName } from "./tables";

type DbRow = Record<string, unknown>;

export const SNAPSHOT_METADATA_SQL = "SELECT * FROM snapshot_metadata LIMIT 1";

const INTELLIGENCE_KEYS = [
  "intelligence_index",
  "omniscience_index",
  "omniscience_accuracy",
] as const satisfies readonly (keyof ModelAtlasIntelligence)[];

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
  payloadRowGroup("refreshRunRows", SNAPSHOT_TABLES.refresh_runs, "refresh_id"),
  changeLogRowGroup("scoreChangeRows", SNAPSHOT_TABLES.model_score_changes, false),
  changeLogRowGroup("changeDetailRows", SNAPSHOT_TABLES.model_change_details, true),
] as const;

/** Change-log rows are read only inside the change-history window before the newest refresh. */
function changeLogRowGroup<Key extends string>(
  key: Key,
  table: SnapshotTableName,
  optional: boolean,
) {
  return {
    key,
    sql: `SELECT * FROM ${table} WHERE refresh_id >= (SELECT MAX(refresh_id) FROM ${SNAPSHOT_TABLES.refresh_runs}) - ${CHANGE_HISTORY_SECONDS} ORDER BY refresh_id`,
    optional,
  };
}

export type PayloadRowGroup = (typeof PAYLOAD_ROW_GROUPS)[number];
type PayloadRowKey = PayloadRowGroup["key"];
type PayloadRows = {
  fetchedAt: number | null;
  snapshotPreservationVersion: number | null;
  benchmarkUpdateHealth: ModelAtlasBenchmarkUpdateHealth | undefined;
  benchmarkVersions: Readonly<Record<string, string>> | undefined;
} & Record<PayloadRowKey, DbRow[]>;

const SCORE_CHANGE_DIMENSIONS = new Set<ModelAtlasScoreDimension>([
  "intelligence",
  "agentic",
  "speed",
  "value",
]);
const SCORE_CHANGE_CAUSE_KINDS = new Set<ModelAtlasScoreChangeCause["kind"]>([
  "model",
  "evidence",
  "coverage",
  "methodology",
  "relative",
]);
const INPUT_CHANGE_KINDS = new Set<ModelAtlasInputChange["kind"]>([
  "result",
  "task_cost",
  "task_time",
  "task_tokens",
  "provider_price",
  "provider_speed",
  "provider_latency",
]);

/**
 * Decode persisted change JSON defensively, rejecting invalid required fields while discarding malformed optional causes, drivers, score moves, and inputs.
 * Events stored before update-level fields existed read as their headline move alone with inputs not recorded (null).
 */
function scoreChangeFromJson(value: unknown): ModelAtlasScoreChange | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  let change: DbRow;
  try {
    change = asRecord(JSON.parse(value));
  } catch {
    return null;
  }
  const refreshId = asFiniteNumber(change.refresh_id);
  const headline = scoreMoveFromJson(change);
  if (refreshId == null || headline == null) {
    return null;
  }
  const causes = causesFromJson(change.causes);
  return {
    ...headline,
    refresh_id: refreshId,
    causes,
    rank_drivers: rankDriversFromJson(change.rank_drivers),
    entry: entryFromJson(change.entry),
    methodology_changed:
      change.methodology_changed === true || causes.some(({ kind }) => kind === "methodology"),
    scores: Array.isArray(change.scores)
      ? change.scores.flatMap((value) => scoreMoveFromJson(asRecord(value)) ?? [])
      : [headline],
    inputs: Array.isArray(change.inputs) ? change.inputs.flatMap(inputChangeFromJson) : null,
  };
}

function causesFromJson(value: unknown): ModelAtlasScoreChangeCause[] {
  return Array.isArray(value)
    ? value
        .flatMap((entry) => {
          const cause = asRecord(entry);
          const kind = asNonEmptyString(cause.kind) as ModelAtlasScoreChangeCause["kind"] | null;
          const label = asNonEmptyString(cause.label);
          return kind == null || label == null || !SCORE_CHANGE_CAUSE_KINDS.has(kind)
            ? []
            : [{ kind, label }];
        })
        .slice(0, 3)
    : [];
}

function rankDriversFromJson(value: unknown): ModelAtlasBenchmarkRankDriver[] {
  return Array.isArray(value)
    ? value
        .flatMap((entry) => {
          const driver = asRecord(entry);
          const benchmarkKey = asNonEmptyString(driver.benchmark_key);
          const label = asNonEmptyString(driver.label);
          const benchmarkRank = asFiniteNumber(driver.benchmark_rank);
          const benchmarkModelCount = asFiniteNumber(driver.benchmark_model_count);
          const rankCorrelation = asFiniteNumber(driver.rank_correlation);
          return benchmarkKey == null ||
            label == null ||
            benchmarkRank == null ||
            benchmarkModelCount == null ||
            rankCorrelation == null
            ? []
            : [
                {
                  benchmark_key: benchmarkKey,
                  label,
                  benchmark_rank: benchmarkRank,
                  benchmark_model_count: benchmarkModelCount,
                  rank_correlation: rankCorrelation,
                } satisfies ModelAtlasBenchmarkRankDriver,
              ];
        })
        .slice(0, 3)
    : [];
}

function entryFromJson(value: unknown): ModelAtlasScoreChange["entry"] {
  return value === "model" || value === "variant" ? value : null;
}

function scoreMoveFromJson(move: DbRow): ModelAtlasScoreMove | null {
  const dimension = asNonEmptyString(move.dimension) as ModelAtlasScoreDimension | null;
  const scoreAfter = asFiniteNumber(move.score_after);
  if (dimension == null || !SCORE_CHANGE_DIMENSIONS.has(dimension) || scoreAfter == null) {
    return null;
  }
  return {
    dimension,
    score_before: asFiniteNumber(move.score_before),
    score_after: scoreAfter,
    score_delta: asFiniteNumber(move.score_delta),
    rank_before: asFiniteNumber(move.rank_before),
    rank_after: asFiniteNumber(move.rank_after),
    confidence_before: asFiniteNumber(move.confidence_before),
    confidence_after: asFiniteNumber(move.confidence_after),
  };
}

function inputChangeFromJson(value: unknown): ModelAtlasInputChange[] {
  const input = asRecord(value);
  const kind = asNonEmptyString(input.kind) as ModelAtlasInputChange["kind"] | null;
  const key = asNonEmptyString(input.key);
  const label = asNonEmptyString(input.label);
  return kind == null || key == null || label == null || !INPUT_CHANGE_KINDS.has(kind)
    ? []
    : [
        {
          kind,
          key,
          label,
          before: asFiniteNumber(input.before),
          after: asFiniteNumber(input.after),
        },
      ];
}

/** The change history of the variants a payload lists, as published beside it. */
export function listedChangeHistory(
  rows: PayloadRows,
  models: readonly ModelAtlasModel[],
): ModelAtlasVariantChanges[] {
  const listed = new Set(
    models.map(({ id, reasoning_effort }) => variantKey(id, reasoning_effort)),
  );
  return buildChangeHistory(changeLogFromRows(rows)).filter(({ model_id, reasoning_effort }) =>
    listed.has(variantKey(model_id, reasoning_effort)),
  );
}

function changeLogFromRows(rows: PayloadRows): ChangeLog {
  return {
    refreshRuns: rows.refreshRunRows.flatMap((row) => {
      const refreshId = asFiniteNumber(row.refresh_id);
      return refreshId == null
        ? []
        : [
            {
              refresh_id: refreshId,
              previous_refresh_id: asFiniteNumber(row.previous_refresh_id),
              methodology_changed: row.methodology_changed === 1,
            },
          ];
    }),
    scoreChanges: rows.scoreChangeRows.flatMap(scoreChangeRowFromDb),
    details: rows.changeDetailRows.flatMap(changeDetailRowFromDb),
  };
}

function scoreChangeRowFromDb(row: DbRow): ModelScoreChangeRow[] {
  const refreshId = asFiniteNumber(row.refresh_id);
  const modelId = asNonEmptyString(row.model_id);
  const move = scoreMoveFromJson({ ...row, dimension: row.score_key });
  return refreshId == null || modelId == null || move == null
    ? []
    : [
        {
          refresh_id: refreshId,
          ...move,
          causes: causesFromJson(jsonValue(row.causes_json)),
          rank_drivers: rankDriversFromJson(jsonValue(row.rank_drivers_json)),
          model_id: modelId,
          reasoning_effort: typeof row.reasoning_effort === "string" ? row.reasoning_effort : "",
        },
      ];
}

function changeDetailRowFromDb(row: DbRow): ModelChangeDetailRow[] {
  const refreshId = asFiniteNumber(row.refresh_id);
  const modelId = asNonEmptyString(row.model_id);
  const inputs = jsonValue(row.inputs_json);
  return refreshId == null || modelId == null || !Array.isArray(inputs)
    ? []
    : [
        {
          refresh_id: refreshId,
          model_id: modelId,
          reasoning_effort: typeof row.reasoning_effort === "string" ? row.reasoning_effort : "",
          entry: entryFromJson(row.entry),
          inputs: inputs.flatMap(inputChangeFromJson),
        },
      ];
}

function variantKey(modelId: string | null, reasoningEffort: string | null): string {
  return `${modelId}\u0000${reasoningEffort ?? ""}`;
}

function hasFields(record: object): boolean {
  return Object.keys(record).length > 0;
}

function assignNumber(target: Record<string, unknown>, key: string, value: unknown): void {
  const numericValue = asFiniteNumber(value);
  if (numericValue != null) {
    target[key] = numericValue;
  }
}

function numericObject<T extends object>(row: DbRow, keys: readonly string[]): T | null {
  const record: Record<string, number> = {};
  for (const key of keys) {
    assignNumber(record, key, row[key]);
  }
  return hasFields(record) ? (record as T) : null;
}

function buildModalities(row: DbRow): ModelAtlasModalities | null {
  const input = modalitiesFromJson(row.input_modalities_json);
  const output = modalitiesFromJson(row.output_modalities_json);
  return input == null && output == null
    ? null
    : { ...(input == null ? {} : { input }), ...(output == null ? {} : { output }) };
}

function modalitiesFromJson(value: unknown): string[] | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((item) => typeof item === "string")
    ? parsed
    : null;
}

function buildContextWindow(row: DbRow): ModelAtlasContextWindow {
  const contextWindow: NonNullable<ModelAtlasContextWindow> = {};
  assignNumber(contextWindow, "context", row.context);
  assignNumber(contextWindow, "input", row.context_input);
  assignNumber(contextWindow, "output", row.context_output);
  return hasFields(contextWindow) ? contextWindow : null;
}

function buildCost(row: DbRow): ModelAtlasCost {
  const cost: Record<string, unknown> = {};
  assignNumber(cost, "input", row.cost_input);
  assignNumber(cost, "output", row.cost_output);
  assignNumber(cost, "cache_read", row.cost_cache_read);
  assignNumber(cost, "cache_write", row.cost_cache_write);
  assignNumber(cost, "weighted_input", row.cost_weighted_input);
  assignNumber(cost, "weighted_output", row.cost_weighted_output);
  assignNumber(cost, "weighted_cache_read", row.cost_weighted_cache_read);
  assignNumber(cost, "blended_price", row.cost_blended_price);
  assignNumber(cost, "blended_price_long_sessions", row.cost_blended_price_long_sessions);
  assignNumber(cost, "blended_price_short_tasks", row.cost_blended_price_short_tasks);
  const contextOver200k: Record<string, number> = {};
  assignNumber(contextOver200k, "input", row.context_over_200k_input);
  assignNumber(contextOver200k, "output", row.context_over_200k_output);
  assignNumber(contextOver200k, "cache_read", row.context_over_200k_cache_read);
  assignNumber(contextOver200k, "cache_write", row.context_over_200k_cache_write);
  if (hasFields(contextOver200k)) {
    cost.context_over_200k = contextOver200k;
  }
  return hasFields(cost) ? (cost as NonNullable<ModelAtlasCost>) : null;
}

function scoredCandidateFromRow(
  row: DbRow,
  benchmarks: ModelAtlasBenchmarks | null,
  benchmarkDates: Record<string, string> | null,
  taskMetrics: ModelAtlasTaskMetrics,
): ModelAtlasScoredCandidate {
  const modelId = asNonEmptyString(row.model_id);
  const provider = asNonEmptyString(row.provider_id) ?? modelId?.split("/")[0] ?? null;
  return {
    id: modelId,
    name: asNonEmptyString(row.name),
    provider,
    logo: asNonEmptyString(row.logo) ?? "",
    reasoning: booleanFromSql(row.reasoning),
    reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
    release_date: asNonEmptyString(row.release_date),
    modalities: buildModalities(row),
    open_weights: booleanFromSql(row.open_weights),
    cost: buildCost(row),
    context_window: buildContextWindow(row),
    speed: {
      throughput_tokens_per_second_median:
        asFiniteNumber(row.throughput_tokens_per_second_median) ?? null,
      latency_seconds_median: asFiniteNumber(row.latency_seconds_median) ?? null,
      e2e_latency_seconds_median: asFiniteNumber(row.e2e_latency_seconds_median) ?? null,
    },
    intelligence: numericObject<ModelAtlasIntelligence>(row, INTELLIGENCE_KEYS),
    task_metrics: taskMetrics,
    benchmarks,
    benchmark_dates: benchmarkDates,
    confidence: {
      intelligence: asFiniteNumber(row.intelligence_confidence) ?? null,
      agentic: asFiniteNumber(row.agentic_confidence) ?? null,
      speed: asFiniteNumber(row.speed_confidence) ?? null,
      value: asFiniteNumber(row.value_confidence) ?? null,
    },
    latest_change: scoreChangeFromJson(row.latest_change_json),
    component_scores: {
      intelligence_score: asFiniteNumber(row.component_intelligence_score) ?? null,
      agentic_score: asFiniteNumber(row.component_agentic_score) ?? null,
    },
    scores: {
      intelligence_score: asFiniteNumber(row.intelligence_score) ?? null,
      agentic_score: asFiniteNumber(row.agentic_score) ?? null,
      speed_score: asFiniteNumber(row.speed_score) ?? null,
      value_score: asFiniteNumber(row.value_score) ?? null,
    },
  };
}

/** Keeps every storage adapter aligned on the row groups required by the public payload. */
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

function benchmarksByModelRow(rows: readonly DbRow[]): Map<number, ModelAtlasBenchmarks> {
  const benchmarksByModel = new Map<number, ModelAtlasBenchmarks>();
  for (const row of rows) {
    const modelRowIndex = asFiniteNumber(row.model_row_index);
    const benchmarkKey = asNonEmptyString(row.benchmark_key);
    const value = asFiniteNumber(row.value);
    if (modelRowIndex == null || benchmarkKey == null || value == null) {
      continue;
    }
    const benchmarks = benchmarksByModel.get(modelRowIndex) ?? {};
    benchmarks[benchmarkKey] = value;
    benchmarksByModel.set(modelRowIndex, benchmarks);
  }
  return benchmarksByModel;
}

function benchmarkDatesByModelRow(rows: readonly DbRow[]): Map<number, Record<string, string>> {
  const benchmarkDatesByModel = new Map<number, Record<string, string>>();
  for (const row of rows) {
    const modelRowIndex = asFiniteNumber(row.model_row_index);
    const benchmarkKey = asNonEmptyString(row.benchmark_key);
    const observedAt = asNonEmptyString(row.observed_at);
    if (modelRowIndex == null || benchmarkKey == null || observedAt == null) {
      continue;
    }
    const dates = benchmarkDatesByModel.get(modelRowIndex) ?? {};
    dates[benchmarkKey] = observedAt;
    benchmarkDatesByModel.set(modelRowIndex, dates);
  }
  return benchmarkDatesByModel;
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
    aleBenchConfigurationRows: readAleBenchRawCache(rows.aleBenchRows)?.rows ?? [],
    weirdMlRows: sourceRows("weirdml_v3", rows.weirdMlRows),
  });
  Object.assign(observations, fused);
  return observations;
}

function taskMetricsByModelRow(
  rows: readonly DbRow[],
): Map<number, NonNullable<ModelAtlasTaskMetrics>> {
  const taskMetricsByModel = new Map<number, NonNullable<ModelAtlasTaskMetrics>>();
  for (const row of rows) {
    const modelRowIndex = asFiniteNumber(row.model_row_index);
    const sourceKey = asNonEmptyString(row.source_key);
    if (modelRowIndex == null || sourceKey == null) {
      continue;
    }
    const metrics: ModelAtlasTaskMetricValues = {};
    assignNumber(metrics, "quality", row.quality);
    assignNumber(metrics, "cost", row.cost);
    assignNumber(metrics, "observed_cost", row.observed_cost);
    assignNumber(metrics, "seconds", row.seconds);
    assignNumber(metrics, "tokens", row.tokens);
    assignNumber(metrics, "input_tokens", row.input_tokens);
    assignNumber(metrics, "output_tokens", row.output_tokens);
    assignNumber(metrics, "cost_price_ratio", row.cost_price_ratio);
    const observedAt = asNonEmptyString(row.observed_at);
    if (observedAt != null) {
      metrics.observed_at = observedAt;
    }
    const taskMetrics = taskMetricsByModel.get(modelRowIndex) ?? {};
    taskMetrics[sourceKey] = metrics;
    taskMetricsByModel.set(modelRowIndex, taskMetrics);
  }
  return taskMetricsByModel;
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
    const updates = updatesByVariant.get(variantKey(model.id, model.reasoning_effort));
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
      healthModels: models,
      sourceHealth,
      benchmarkUpdateHealth: rows.benchmarkUpdateHealth,
      benchmarkVersions: rows.benchmarkVersions,
      snapshotPreservationVersion: rows.snapshotPreservationVersion,
    }),
    models,
    benchmark_observations: observationsFromPayloadRows(rows),
  };
}
