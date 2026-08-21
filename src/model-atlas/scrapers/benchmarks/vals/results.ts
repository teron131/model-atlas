/** Scrapes canonical scoring rows and method provenance from hydrated Vals benchmark pages. */

import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../../benchmarks/observation";
import { canonicalReasoningEffort } from "../../../identity/normalization";
import { asFiniteNumber, asRecord, fetchWithTimeout, nowEpochSeconds } from "../../../runtime";
import { htmlAttribute, stringValue } from "../../parsing";

const DEFAULT_TIMEOUT_MS = 30_000;

type ValsScraperOptions = {
  url?: string;
  timeoutMs?: number;
};

type ValsBenchmarkMetadata = {
  dataset_type: string | null;
  mode: string | null;
  runner: string | null;
  updated: string | null;
  version: string | null;
};

type ValsBenchmarkView = {
  metadata: ValsBenchmarkMetadata;
  tasks: Record<string, Record<string, Record<string, unknown>>>;
};

export type ValsBenchmarkDefinition = {
  benchmarkKey: string;
  canonicalTask: string;
  includeReasoningEffortInModel?: boolean;
  isScoreEligible?: (task: string, modelId: string) => boolean;
  sourceUrl: string;
};

function reviveAstroValue(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") {
    if (value[0] === 0) return reviveAstroValue(value[1]);
    if (value[0] === 1) {
      return Array.isArray(value[1]) ? value[1].map((item) => reviveAstroValue(item)) : [];
    }
  }
  if (Array.isArray(value)) return value.map((item) => reviveAstroValue(item));
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reviveAstroValue(item)]),
    );
  }
  return value;
}

function metadataFromValue(value: unknown): ValsBenchmarkMetadata {
  const metadata = asRecord(value);
  return {
    dataset_type: stringValue(metadata.dataset_type),
    mode: stringValue(metadata.mode),
    runner: stringValue(metadata.runner),
    updated: stringValue(metadata.updated),
    version: stringValue(metadata.version),
  };
}

/** Decode one VALS BenchmarkView island without letting malformed hydration abort a refresh. */
function parseValsBenchmarkView(pageHtml: string): ValsBenchmarkView | null {
  try {
    const island = pageHtml.match(
      /<astro-island\b(?=[^>]*component-url="\/_astro\/BenchmarkView[^"]*")[^>]*>/,
    )?.[0];
    const props = island == null ? null : htmlAttribute(island, "props");
    if (props == null) return null;
    const decoded = asRecord(reviveAstroValue(JSON.parse(props)));
    const view = asRecord(asRecord(decoded.benchmarkView).default);
    const metadataValue = asRecord(view.metadata);
    if (Object.keys(metadataValue).length === 0) return null;
    const tasks = Object.fromEntries(
      Object.entries(asRecord(view.tasks)).map(([task, taskValue]) => [
        task,
        Object.fromEntries(
          Object.entries(asRecord(taskValue)).map(([modelId, row]) => [modelId, asRecord(row)]),
        ),
      ]),
    );
    return { metadata: metadataFromValue(metadataValue), tasks };
  } catch {
    return null;
  }
}

function percentScore(value: unknown): number | null {
  const score = asFiniteNumber(value);
  return score != null && score >= 0 && score <= 100 ? Number((score / 100).toFixed(6)) : null;
}

function scoreRow(
  definition: ValsBenchmarkDefinition,
  view: ValsBenchmarkView,
  task: string,
  modelId: string,
  value: Record<string, unknown>,
): BenchmarkObservationRow | null {
  const canonicalValue = percentScore(value.accuracy);
  if (
    canonicalValue == null ||
    modelId.length === 0 ||
    task !== definition.canonicalTask ||
    definition.isScoreEligible?.(task, modelId) === false
  ) {
    return null;
  }
  const baseModel = modelId.split("/").at(-1) ?? modelId;
  const reasoningEffort = canonicalReasoningEffort(value.reasoning_effort ?? value.compute_effort);
  const metadata: BenchmarkObservationMetadata = {};
  for (const [key, metadataValue] of [
    ["benchmark_version", view.metadata.version],
    ["dataset_type", view.metadata.dataset_type],
    ["runner", view.metadata.runner],
    ["mode", view.metadata.mode],
    ["harness", stringValue(value.harness)],
  ] as const) {
    if (metadataValue != null) metadata[key] = metadataValue;
  }
  return {
    benchmark_key: definition.benchmarkKey,
    source_url: definition.sourceUrl,
    model_id: modelId,
    model:
      reasoningEffort == null || definition.includeReasoningEffortInModel === false
        ? baseModel
        : `${baseModel} (${reasoningEffort})`,
    base_model: baseModel,
    reasoning_effort: reasoningEffort,
    model_creator: stringValue(value.provider),
    rank: null,
    canonical_value: canonicalValue,
    observed_at: view.metadata.updated,
    metadata,
  };
}

/** Emit only canonical, score-eligible Vals rows. */
export function processValsBenchmarkPageHtml(
  pageHtml: string,
  definition: ValsBenchmarkDefinition,
): BenchmarkObservationRow[] {
  const view = parseValsBenchmarkView(pageHtml);
  if (view == null) return [];
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

/** Fetch one VALS source independently and fail quietly to an empty evidence payload. */
export async function getValsSourceStats(
  definition: ValsBenchmarkDefinition,
  options: ValsScraperOptions = {},
): Promise<BenchmarkObservationPayload> {
  try {
    const response = await fetchWithTimeout(
      options.url ?? definition.sourceUrl,
      {},
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!response.ok) return { fetched_at_epoch_seconds: null, data: [] };
    return {
      fetched_at_epoch_seconds: nowEpochSeconds(),
      data: processValsBenchmarkPageHtml(await response.text(), definition),
    };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}
