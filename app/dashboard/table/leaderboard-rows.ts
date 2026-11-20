/** Leaderboard rows built from a snapshot: each model's scaled benchmark meters, amount ratios, and resource ratios, plus the readers that pull a column's value from a model. */

import {
  INDEX_BENCHMARK_KEYS,
  indexPolicy,
} from "../../../src/model-atlas/benchmarks/index-policy";
import { benchmarkValue } from "../../../src/model-atlas/benchmarks/registry";
import { reasoningEffortRank } from "../../../src/model-atlas/identity/normalization";
import {
  linearScore,
  medianOfFinite,
  minMaxRange,
  positiveFiniteNumber,
} from "../../../src/model-atlas/math-utils";
import { clampScore } from "../../../src/model-atlas/pipeline/scores/normalization";
import {
  intelligenceRanks,
  modelsForVariantDisplay,
} from "../../../src/model-atlas/stats/model-variants";
import {
  displayResourceRatios,
  type ResourceRatioReferenceSets,
  resourceRatioReferenceSets,
  type ResourceRatios,
} from "../../../src/model-atlas/stats/resource-ratios";
import {
  type ModelAtlasModel,
  type ModelAtlasPayload,
  type ModelAtlasTaskEstimate,
} from "../../../src/model-atlas/stats/types";
import {
  type BenchmarkMetricColumn,
  benchmarkMetricColumns,
  costMetricColumns,
  type DashboardMetricColumn,
  dashboardMetricColumns,
  isAmountColumn,
  type ProfileMetricColumn,
  speedMetricColumns,
  type TableColumnKey,
} from "./column-registry";

const inputModalityScores = [
  ["text", 8],
  ["image", 4],
  ["audio", 2],
  ["video", 1],
] as const;

const scaledBenchmarkMetricColumns = benchmarkMetricColumns.filter(
  (column) => column.format !== "currency",
);

export type TableRow = {
  model: ModelAtlasModel;
  intelligenceRank: number;
  originalIndex: number;
  benchmarkDisplayScores: Partial<Record<BenchmarkMetricColumn["key"], number | null>>;
  /** Estimated results' 0–100 positions on the same measured ranges, kept apart from `benchmarkDisplayScores` so charts and comparisons read measured results only. */
  benchmarkEstimateScores: Partial<Record<BenchmarkMetricColumn["key"], number | null>>;
  /** Each shown amount (price, speed, context, benchmark resources), measured or estimated, relative to its column's median of measured amounts across the incoming population. */
  metricRatios: Partial<Record<TableColumnKey, number | null>>;
  resourceRatios: ResourceRatios;
};

/** A row before its resource ratios, which are measured once the whole display population is known. */
type DisplayRow = Omit<TableRow, "resourceRatios">;

const amountColumns: {
  key: TableColumnKey;
  get: (model: ModelAtlasModel) => unknown;
  estimate: (model: ModelAtlasModel) => number | null;
}[] = [
  { key: "context", get: contextWindowValue, estimate: () => null },
  ...[...costMetricColumns, ...speedMetricColumns, ...dashboardMetricColumns]
    .filter(isAmountColumn)
    .map((column) => ({
      key: column.key,
      get: (model: ModelAtlasModel) => dashboardMetricValue(model, column),
      estimate: (model: ModelAtlasModel) => estimatedMetricValue(model, column),
    })),
];

// Scoring keeps an index's estimates under the index's key, while its measured amounts sit under the index's resource source.
const indexKeyByResourceSource = new Map(
  INDEX_BENCHMARK_KEYS.flatMap((key) => {
    const resources = indexPolicy(key)?.resources;
    return resources == null ? [] : [[resources.key, key] as const];
  }),
);

/** One snapshot's reference medians and the two row displays measured against them, each display shaped when first read. */
type RowDisplays = {
  references: ResourceRatioReferenceSets;
  models?: TableRow[];
  variants?: TableRow[];
};

// The leaderboard and the model sheet read the same snapshot, so they share its rows instead of rebuilding both displays on every sheet open.
const rowDisplaysByPayload = new WeakMap<ModelAtlasPayload, RowDisplays>();

/**
 * Shape one variant display of the payload into leaderboard rows with their resource ratios.
 *
 * Each display is shaped once per snapshot and the same rows are returned to every reader, so a caller that reorders them must copy first.
 */
export function leaderboardRows(
  payload: ModelAtlasPayload | null,
  showVariants: boolean,
): readonly TableRow[] {
  if (payload == null) return [];
  let displays = rowDisplaysByPayload.get(payload);
  if (displays == null) {
    displays = {
      references: resourceRatioReferenceSets(
        payload.models,
        payload.metadata.scoring.benchmark_portfolio,
      ),
    };
    rowDisplaysByPayload.set(payload, displays);
  }
  const display = showVariants ? "variants" : "models";
  displays[display] ??= buildLeaderboardRows(payload, showVariants, displays.references);
  return displays[display];
}

function buildLeaderboardRows(
  payload: ModelAtlasPayload,
  showVariants: boolean,
  references: ResourceRatioReferenceSets,
): TableRow[] {
  const rows = scaledDisplayRows(
    modelsForVariantDisplay(payload.models, showVariants, payload.benchmark_observations),
  );
  const ratios = displayResourceRatios(
    rows.map((row) => row.model),
    payload.metadata.scoring.benchmark_portfolio,
    references,
  );
  return rows.map((row, index) => ({ ...row, resourceRatios: ratios[index]! }));
}

/** Scale benchmark meters and amount ratios against the full incoming population before filtering or limiting rows. */
export function scaledDisplayRows(models: ModelAtlasModel[]): DisplayRow[] {
  const ranges = new Map(
    scaledBenchmarkMetricColumns.map((column) => [
      column.key,
      minMaxRange(models.map((model) => benchmarkMetricValue(model, column))),
    ]),
  );
  const amountScales = amountColumns.map(({ key, get, estimate }) => {
    // Zero or missing amounts have no position on a ratio's log scale.
    const amounts = models.map((model) => positiveFiniteNumber(get(model)));
    const median = medianOfFinite(amounts);
    return {
      key,
      ratios: models.map((model, index) => {
        const amount = amounts[index] ?? positiveFiniteNumber(estimate(model));
        return amount == null || !median ? null : amount / median;
      }),
    };
  });
  const ranks = intelligenceRanks(models);
  return models.map((model, originalIndex) => ({
    model,
    intelligenceRank: ranks[originalIndex]!,
    originalIndex,
    benchmarkDisplayScores: Object.fromEntries(
      scaledBenchmarkMetricColumns.map((column) => {
        const value = benchmarkMetricValue(model, column);
        const normalized = linearScore(ranges.get(column.key) ?? null, value);
        return [column.key, normalized == null ? null : clampScore(normalized)];
      }),
    ),
    benchmarkEstimateScores: Object.fromEntries(
      scaledBenchmarkMetricColumns.flatMap((column) => {
        const estimate = estimatedMetricValue(model, column);
        if (estimate == null) return [];
        const normalized = linearScore(ranges.get(column.key) ?? null, estimate);
        return [[column.key, normalized == null ? null : clampScore(normalized)]];
      }),
    ),
    metricRatios: Object.fromEntries(
      amountScales.map(({ key, ratios }) => [key, ratios[originalIndex]]),
    ),
  }));
}

function benchmarkMetricValue(model: ModelAtlasModel, column: BenchmarkMetricColumn) {
  return benchmarkValue(model, column.benchmark);
}

/** Return a benchmark's normalized display score when its source scale is not directly comparable. */
export function benchmarkDisplayValue(
  row: Pick<TableRow, "model" | "benchmarkDisplayScores">,
  column: BenchmarkMetricColumn,
) {
  return column.format === "score"
    ? row.benchmarkDisplayScores[column.key]
    : benchmarkMetricValue(row.model, column);
}

/** A benchmark's 0–100 meter position across the display population, separate from the value its cell prints. */
export function benchmarkMeterValue(
  row: Pick<TableRow, "benchmarkDisplayScores">,
  column: BenchmarkMetricColumn,
) {
  return row.benchmarkDisplayScores[column.key] ?? null;
}

/** The result a table cell shows, in the column's display form with its meter position: the measured result the row shows, else scoring's estimate; null when there is neither. */
export function benchmarkCellResult(
  row: Pick<TableRow, "model" | "benchmarkDisplayScores" | "benchmarkEstimateScores">,
  column: BenchmarkMetricColumn,
): { value: number; meter: number | null; estimated: boolean } | null {
  const shown = benchmarkDisplayValue(row, column);
  if (shown != null)
    return { value: shown, meter: benchmarkMeterValue(row, column), estimated: false };
  const estimate = estimatedMetricValue(row.model, column);
  if (estimate == null) return null;
  const meter = row.benchmarkEstimateScores[column.key] ?? null;
  const value = column.format === "score" ? meter : estimate;
  return value == null ? null : { value, meter, estimated: true };
}

export type EffortChoice = { key: string; count: number };

/** The efforts among reasoning-variant rows and how many rows each holds, in effort order. */
export function effortChoices(rows: readonly TableRow[]): EffortChoice[] {
  const counts = new Map<string, number>();
  for (const { model } of rows) {
    if (model.reasoning_effort == null) continue;
    counts.set(model.reasoning_effort, (counts.get(model.reasoning_effort) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => reasoningEffortRank(left.key) - reasoningEffortRank(right.key));
}

export function contextWindowValue(model: ModelAtlasModel) {
  return model.context_window?.context;
}

/** Scoring's estimate, in the column's own units, for a per-task amount or benchmark result the model did not measure; null where it measured one and for every other column. */
export function estimatedMetricValue(
  model: ModelAtlasModel,
  column: DashboardMetricColumn,
): number | null {
  if (dashboardMetricValue(model, column) != null) return null;
  if ("benchmark" in column) return model.estimated_benchmarks?.[column.benchmark] ?? null;
  if (!("source" in column)) return null;
  const key = indexKeyByResourceSource.get(column.source) ?? column.source;
  // Read by any metric name: scoring estimates no input tokens, so those columns find none.
  const estimates: Partial<Record<string, ModelAtlasTaskEstimate>> | undefined =
    model.estimated_task_metrics?.[key];
  return estimates?.[column.metric]?.amount ?? null;
}

export function dashboardMetricValue(model: ModelAtlasModel, column: DashboardMetricColumn) {
  if ("source" in column) {
    return model.task_metrics?.[column.source]?.[column.metric];
  }
  if ("benchmark" in column) {
    return benchmarkMetricValue(model, column);
  }
  if (column.group === "costs") {
    return model.cost?.[column.field];
  }
  if (column.group === "speed") {
    return model.speed?.[column.field];
  }
  if (column.group === "community") {
    // Sorts by best place; the cell shows the range.
    return model.community_indexes?.[column.field]?.best ?? null;
  }
  return profileMetricValue(model, column);
}

function profileMetricValue(model: ModelAtlasModel, column: ProfileMetricColumn) {
  if (column.field === "release") {
    return model.release_date;
  }
  if (column.field === "modalities") {
    return inputModalityRank(model);
  }
  const value = model[column.field];
  if (value == null) {
    return null;
  }
  return value ? 1 : 0;
}

function inputModalityRank(model: ModelAtlasModel) {
  const input = new Set((model.modalities?.input ?? []).map((value) => value.toLowerCase()));
  if (input.size === 0) {
    return null;
  }
  return inputModalityScores.reduce(
    (total, [modality, score]) => total + (input.has(modality) ? score : 0),
    0,
  );
}
