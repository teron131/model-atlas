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
import { canonicalReasoningEffort, modelEffortLabel } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, nowEpochSeconds, stableJson } from "../../runtime";
import { percentToUnitScore } from "../parsing";
import { getValsBenchmarkView, parseValsBenchmarkView, type ValsBenchmarkView } from "./view";

/** Thinking Machines models take a numeric effort, which Vals records verbatim; these are its named presets. */
const THINKING_MACHINES_EFFORT_PRESETS: Readonly<Record<string, string>> = {
  "0": "none",
  "0.1": "minimal",
  "0.2": "low",
  "0.7": "medium",
  "0.9": "high",
  "0.99": "xhigh",
};

type ValsBenchmarkDefinition = {
  benchmarkKey: string;
  canonicalTask: string;
  sourceUrl: string;
  /** Pins one version where another source's suite must match; omitted, the page's current version is used. */
  version?: string;
};

/** Fetch one Vals source independently; a page without usable rows yields an empty payload. */
export async function getValsBenchmarkStats(
  definition: ValsBenchmarkDefinition,
): Promise<BenchmarkObservationPayload> {
  const view = await getValsBenchmarkView(definition.sourceUrl);
  const data = processValsBenchmarkView(view, definition);
  return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
}

/** Emit only canonical, score-eligible Vals rows, each tagged with the page's published version. */
export function processValsBenchmarkView(
  value: unknown,
  definition: ValsBenchmarkDefinition,
): BenchmarkObservationRow[] {
  const view = parseValsBenchmarkView(value);
  if (
    view == null ||
    (definition.version != null && asNonEmptyString(view.metadata.version) !== definition.version)
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
  const canonicalValue = percentToUnitScore(value.accuracy);
  if (canonicalValue == null || modelId.length === 0 || task !== definition.canonicalTask) {
    return null;
  }
  const baseModel = modelId.split("/").at(-1) ?? modelId;
  const reasoningEffort = valsReasoningEffort(modelId, value);
  const metadata: BenchmarkObservationMetadata = { source_result_json: stableJson(value) };
  const costPerTask = asFiniteNumber(value.cost_per_test);
  const secondsPerTask = asFiniteNumber(value.latency);
  const outputTokensPerTask = asFiniteNumber(value.avg_output_tokens);
  if (secondsPerTask != null) metadata.seconds_per_task = secondsPerTask;
  if (outputTokensPerTask != null) metadata.output_tokens_per_task = outputTokensPerTask;
  for (const [key, metadataValue] of [
    ["task", task],
    ["benchmark_version", asNonEmptyString(view.metadata.version)],
    ["dataset_type", asNonEmptyString(view.metadata.dataset_type)],
    ["runner", asNonEmptyString(view.metadata.runner)],
    ["mode", asNonEmptyString(view.metadata.mode)],
    ["harness", asNonEmptyString(value.harness)],
  ] as const) {
    if (metadataValue != null) metadata[key] = metadataValue;
  }
  return {
    benchmark_key: definition.benchmarkKey,
    source_url: definition.sourceUrl,
    model_id: modelId,
    model: modelEffortLabel(baseModel, reasoningEffort),
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    model_creator: asNonEmptyString(value.provider),
    rank: null,
    canonical_value: canonicalValue,
    ...(costPerTask == null ? {} : { cost: costPerTask }),
    observed_at: asNonEmptyString(view.metadata.updated),
    metadata,
  };
}

/** Vals reports a run's effort as `reasoning_effort`, or `compute_effort` for models that take a compute setting. */
export function valsReasoningEffort(
  modelId: string,
  result: Record<string, unknown>,
): string | null {
  const value = result.reasoning_effort ?? result.compute_effort;
  const preset =
    modelId.startsWith("thinkingmachines/") && typeof value === "string"
      ? THINKING_MACHINES_EFFORT_PRESETS[value]
      : undefined;
  return preset ?? canonicalReasoningEffort(value);
}
