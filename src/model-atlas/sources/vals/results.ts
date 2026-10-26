/**
 * Benchmark leaderboard results from Vals AI.
 *
 * Page source: https://www.vals.ai/benchmarks
 */

import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { canonicalReasoningEffort } from "../../identity/normalization";
import { asFiniteNumber, nowEpochSeconds, stableJson, stringValue } from "../../runtime";
import { getValsBenchmarkView, parseValsBenchmarkView, type ValsBenchmarkView } from "./view";

const DEFAULT_TIMEOUT_MS = 30_000;

type ValsScraperOptions = {
  url?: string;
  timeoutMs?: number;
};

export type ValsBenchmarkDefinition = {
  benchmarkKey: string;
  canonicalTask: string;
  sourceUrl: string;
  /** Pins one edition where another source's suite must match; omitted, the page's current version is used. */
  version?: string;
};

/** Fetch one VALS source independently and fail quietly to an empty evidence payload. */
export async function getValsSourceStats(
  definition: ValsBenchmarkDefinition,
  options: ValsScraperOptions = {},
): Promise<BenchmarkObservationPayload> {
  try {
    const view = await getValsBenchmarkView(
      options.url ?? definition.sourceUrl,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const data = processValsBenchmarkView(view, definition);
    return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Emit only canonical, score-eligible Vals rows, each tagged with the page's published version. */
export function processValsBenchmarkView(
  value: unknown,
  definition: ValsBenchmarkDefinition,
): BenchmarkObservationRow[] {
  const view = parseValsBenchmarkView(value);
  if (
    view == null ||
    (definition.version != null && stringValue(view.metadata.version) !== definition.version)
  )
    return [];
  return Object.entries(view.tasks).flatMap(([task, models]) =>
    Object.entries(models)
      .flatMap(([modelId, value]) => {
        const row = scoreRow(definition, view, task, modelId, value);
        return row == null ? [] : [row];
      })
      .sort(
        (left, right) =>
          right.canonical_value - left.canonical_value ||
          (left.model_id ?? "").localeCompare(right.model_id ?? ""),
      )
      .map((row, index) => ({ ...row, rank: index + 1 })),
  );
}

/** A catalog task change invalidates cached Vals observations before they reach model assignment. */
export function valsBenchmarkCacheMatches(
  rows: readonly BenchmarkObservationRow[],
  canonicalTask: string,
): boolean {
  return rows.every((row) => row.metadata.task === canonicalTask);
}

function scoreRow(
  definition: ValsBenchmarkDefinition,
  view: ValsBenchmarkView,
  task: string,
  modelId: string,
  value: Record<string, unknown>,
): BenchmarkObservationRow | null {
  const canonicalValue = percentScore(value.accuracy);
  if (canonicalValue == null || modelId.length === 0 || task !== definition.canonicalTask) {
    return null;
  }
  const baseModel = modelId.split("/").at(-1) ?? modelId;
  const reasoningEffort = canonicalReasoningEffort(value.reasoning_effort ?? value.compute_effort);
  const metadata: BenchmarkObservationMetadata = { source_result_json: stableJson(value) };
  const costPerTask = asFiniteNumber(value.cost_per_test);
  const secondsPerTask = asFiniteNumber(value.latency);
  const outputTokensPerTask = asFiniteNumber(value.avg_output_tokens);
  if (secondsPerTask != null) metadata.seconds_per_task = secondsPerTask;
  if (outputTokensPerTask != null) metadata.output_tokens_per_task = outputTokensPerTask;
  for (const [key, metadataValue] of [
    ["task", task],
    ["benchmark_version", stringValue(view.metadata.version)],
    ["dataset_type", stringValue(view.metadata.dataset_type)],
    ["runner", stringValue(view.metadata.runner)],
    ["mode", stringValue(view.metadata.mode)],
    ["harness", stringValue(value.harness)],
  ] as const) {
    if (metadataValue != null) metadata[key] = metadataValue;
  }
  return {
    benchmark_key: definition.benchmarkKey,
    source_url: definition.sourceUrl,
    model_id: modelId,
    model: reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    model_creator: stringValue(value.provider),
    rank: null,
    canonical_value: canonicalValue,
    ...(costPerTask == null ? {} : { cost: costPerTask }),
    observed_at: stringValue(view.metadata.updated),
    metadata,
  };
}

function percentScore(value: unknown): number | null {
  const score = asFiniteNumber(value);
  return score != null && score >= 0 && score <= 100 ? Number((score / 100).toFixed(6)) : null;
}
