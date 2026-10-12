/**
 * Vals Index leaderboard results from Vals AI.
 *
 * Page source: https://www.vals.ai/benchmarks/vals_index
 */

import { INDEX_POLICIES } from "../../benchmarks/index-policy";
import type { BenchmarkObservationMetadata } from "../../benchmarks/observation";
import { normalizeModelToken } from "../../identity/normalization";
import { asFiniteNumber, asRecord, nowEpochSeconds, stableJson, stringValue } from "../../runtime";
import { getValsBenchmarkView, parseValsBenchmarkView } from "./view";

export const DEFAULT_LEADERBOARD_URL = "https://www.vals.ai/benchmarks/vals_index";

const DEFAULT_TIMEOUT_MS = 30_000;

const OVERALL_TASK_KEY = "overall";

type ValsIndexScraperOptions = {
  url?: string;
  timeoutMs?: number;
};

type ValsIndexMetadata = {
  benchmark: string | null;
  slug: string | null;
  version: string | null;
  updated: string | null;
  dataset_type: string | null;
  industry: string | null;
  task_labels: Record<string, string>;
  runner: string | null;
  mode: string | null;
};

export type ValsIndexTaskScoreRow = {
  task: string;
  task_label: string;
  model_id: string;
  model: string;
  provider: string | null;
  score: number;
  observed_at: string | null;
  metadata: BenchmarkObservationMetadata;
};

export type ValsIndexModelScoreRow = ValsIndexTaskScoreRow & {
  task: "overall";
};

export type ValsIndexRowsByModelName = Map<string, ValsIndexModelScoreRow>;

type ValsIndexResults = {
  metadata: ValsIndexMetadata | null;
  task_rows: ValsIndexTaskScoreRow[];
  model_scores: ValsIndexModelScoreRow[];
};

type ValsIndexPayload = ValsIndexResults & {
  fetched_at_epoch_seconds: number | null;
};

export async function getValsIndexStats(
  options: ValsIndexScraperOptions = {},
): Promise<ValsIndexPayload> {
  try {
    const view = await getValsBenchmarkView(
      options.url ?? DEFAULT_LEADERBOARD_URL,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const parsed = processValsIndexView(view);
    return {
      fetched_at_epoch_seconds: parsed.model_scores.length > 0 ? nowEpochSeconds() : null,
      ...parsed,
    };
  } catch {
    return {
      fetched_at_epoch_seconds: null,
      metadata: null,
      task_rows: [],
      model_scores: [],
    };
  }
}

/** Keep the declared edition's overall score and all component diagnostics under one persisted source contract. */
export function processValsIndexView(value: unknown): ValsIndexResults {
  const view = parseValsBenchmarkView(value);
  if (view == null) return { metadata: null, task_rows: [], model_scores: [] };
  const metadata = valsIndexMetadata(view.metadata);
  const componentTasks = Object.keys(metadata.task_labels).filter(
    (key) => key !== OVERALL_TASK_KEY,
  );
  if (
    metadata.version !== INDEX_POLICIES.vals_index.version ||
    componentTasks.length !== INDEX_POLICIES.vals_index.representedBenchmarks
  ) {
    return { metadata: null, task_rows: [], model_scores: [] };
  }
  const taskLabelsJson = stableJson(metadata.task_labels);
  const taskRows: ValsIndexTaskScoreRow[] = [];
  for (const [task, models] of Object.entries(view.tasks)) {
    for (const [modelId, row] of Object.entries(models)) {
      const score = percentToUnitScore(row.accuracy);
      if (score == null || modelId.length === 0) continue;
      taskRows.push({
        task,
        task_label: metadata.task_labels[task] ?? task,
        model_id: modelId,
        model: modelSlug(modelId),
        provider: stringValue(row.provider),
        score,
        observed_at: metadata.updated,
        metadata: {
          benchmark_version: metadata.version,
          benchmark_count: componentTasks.length,
          component_tasks: [...componentTasks],
          task_labels_json: taskLabelsJson,
          dataset_type: metadata.dataset_type,
          runner: metadata.runner,
          mode: metadata.mode,
          source_result_json: stableJson(row),
        },
      });
    }
  }
  taskRows.sort(
    (left, right) =>
      right.score - left.score ||
      left.task.localeCompare(right.task) ||
      left.model_id.localeCompare(right.model_id),
  );
  return {
    metadata,
    task_rows: taskRows,
    model_scores: taskRows.filter(
      (row): row is ValsIndexModelScoreRow => row.task === OVERALL_TASK_KEY,
    ),
  };
}

export function buildValsIndexMap(rows: ValsIndexModelScoreRow[]): ValsIndexRowsByModelName {
  const rowsByModelName: ValsIndexRowsByModelName = new Map();
  for (const row of rows) {
    for (const key of modelKeyCandidates(row)) {
      rowsByModelName.set(key, row);
    }
  }
  return rowsByModelName;
}

/** Return the matched observation intact so scoring retains its edition, breadth, and source date. */
export function findValsIndexRow(
  candidateNames: unknown[],
  valsIndexRowsByModelName: ValsIndexRowsByModelName,
): ValsIndexModelScoreRow | null {
  for (const candidateName of candidateNames) {
    if (typeof candidateName !== "string" || candidateName.length === 0) {
      continue;
    }
    const row = valsIndexRowsByModelName.get(normalizeModelToken(candidateName));
    if (row) {
      return row;
    }
  }
  return null;
}

/** Unversioned and prior-edition caches cannot supply the current index or receive its breadth. */
export function valsIndexCacheMatches(rows: readonly ValsIndexTaskScoreRow[]): boolean {
  return rows.every(
    (row) =>
      row.metadata.benchmark_version === INDEX_POLICIES.vals_index.version &&
      row.metadata.benchmark_count === INDEX_POLICIES.vals_index.representedBenchmarks &&
      Array.isArray(row.metadata.component_tasks) &&
      row.metadata.component_tasks.length === INDEX_POLICIES.vals_index.representedBenchmarks,
  );
}

function valsIndexMetadata(value: unknown): ValsIndexMetadata {
  const metadata = asRecord(value);
  return {
    benchmark: stringValue(metadata.benchmark),
    slug: stringValue(metadata.slug),
    version: stringValue(metadata.version),
    updated: stringValue(metadata.updated),
    dataset_type: stringValue(metadata.dataset_type),
    industry: stringValue(metadata.industry),
    task_labels: taskLabelsFromMetadata(metadata.tasks),
    runner: stringValue(metadata.runner),
    mode: stringValue(metadata.mode),
  };
}

function taskLabelsFromMetadata(metadata: unknown): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(asRecord(metadata))) {
    if (typeof value === "string" && value.length > 0) {
      labels[key] = value;
    }
  }
  return labels;
}

function percentToUnitScore(value: unknown): number | null {
  const percent = asFiniteNumber(value);
  if (percent == null || percent < 0 || percent > 100) {
    return null;
  }
  return Number((percent / 100).toFixed(6));
}

function modelSlug(modelId: string): string {
  return modelId.split("/").at(-1) ?? modelId;
}

function modelKeyCandidates(row: ValsIndexModelScoreRow): string[] {
  const slug = modelSlug(row.model_id);
  return [row.model_id, row.model, slug]
    .map(normalizeModelToken)
    .filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}
