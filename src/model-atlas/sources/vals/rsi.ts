/**
 * Scrapes RSI benchmark results from Vals.
 *
 * Page source: https://www.vals.ai/benchmarks/rsi_index
 */

import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { canonicalReasoningEffort } from "../../identity/normalization";
import { nowEpochSeconds } from "../../runtime";
import { findObjectEnd, htmlAttribute, percentToUnitScore } from "../parsing";
import { fetchSource } from "../request-scheduler";

const RSI_VERSION = "1.1";
const DEFAULT_TIMEOUT_MS = 30_000;
const TASKS = [
  "overall",
  "compression",
  "lm_training",
  "parameter_golf",
  "harness_engineering",
  "post_training",
] as const;

/** Resolve the page's hashed assets and load the published score with its task diagnostics. A missing or malformed asset returns no new evidence so the snapshot lifecycle can retain a valid cache. */
export async function getValsRsiStats(sourceUrl: string): Promise<BenchmarkObservationPayload> {
  try {
    const page = await fetchText(sourceUrl);
    const componentPath = page.match(
      /<astro-island\b(?=[^>]*component-url="\/_astro\/RsiBenchmarkView\.[^"]+\.js")[^>]*>/,
    )?.[0];
    const componentUrl =
      componentPath == null ? null : htmlAttribute(componentPath, "component-url");
    if (componentUrl == null) return { fetched_at_epoch_seconds: null, data: [] };
    const component = await fetchText(new URL(componentUrl, sourceUrl).href);
    const dataModulePath = component.match(
      /"\.\/(benchmark_view_rsi_index\.[A-Za-z0-9_-]+\.js)"/,
    )?.[1];
    if (dataModulePath == null) return { fetched_at_epoch_seconds: null, data: [] };
    const moduleSource = await fetchText(
      new URL(dataModulePath, new URL(componentUrl, sourceUrl)).href,
    );
    const data = processValsRsiModule(moduleSource, component, sourceUrl);
    return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
  } catch {
    return { fetched_at_epoch_seconds: null, data: [] };
  }
}

/** Extract declarative leaderboard literals without executing the publisher's JavaScript. Reject the whole refresh unless the declared version, all six task views, model counts, and harness assignments form one complete cohort. */
export function processValsRsiModule(
  moduleSource: string,
  componentSource: string,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const metadataStart = moduleSource.indexOf('{benchmark:"Vals RSI Index"');
  if (metadataStart < 0) return [];
  const metadataEnd = findObjectEnd(moduleSource, metadataStart);
  if (metadataEnd < 0) return [];
  const metadata = moduleSource.slice(metadataStart, metadataEnd + 1);
  const version = stringField(metadata, "version");
  const updated = stringField(metadata, "updated");
  const modelCount = numberField(metadata, "total_models");
  if (
    !metadata.includes('benchmark_id:"rsi_index"') ||
    version !== RSI_VERSION ||
    updated == null ||
    modelCount == null ||
    !Number.isInteger(modelCount) ||
    modelCount < 1
  )
    return [];

  const harnesses = harnessMap(componentSource);
  if (harnesses == null) return [];
  const rows = TASKS.flatMap((task) => {
    const taskRows = taskObservations(moduleSource, task, version, updated, harnesses, sourceUrl);
    return taskRows.length === modelCount ? taskRows : [];
  });
  return rows.length === TASKS.length * modelCount ? rows : [];
}

/** The cached suite must contain every task under the current source version and disclosed harness mapping. */
export function valsRsiCacheMatches(rows: readonly BenchmarkObservationRow[]): boolean {
  return (
    TASKS.every((task) => rows.some((row) => row.metadata.task === task)) &&
    rows.every(
      (row) =>
        row.metadata.benchmark_version === RSI_VERSION &&
        typeof row.metadata.harness === "string" &&
        row.metadata.metric ===
          (row.metadata.task === "overall"
            ? "five_task_reference_mean"
            : "reference_scaled_task_score") &&
        row.metadata.observation_role ===
          (row.metadata.task === "overall" ? undefined : "component"),
    )
  );
}

/** Treat non-success asset responses as fetch failures so a partial source load cannot advance its timestamp. */
async function fetchText(url: string): Promise<string> {
  return fetchSource(url, {}, DEFAULT_TIMEOUT_MS, async (response) => {
    if (!response.ok) throw new Error(`Vals RSI source failed: ${response.status}`);
    return response.text();
  });
}

/** Read the component's model-to-agent mapping so each score remains attributable to its disclosed scaffold. Accept only a string map containing both Claude Code and Codex to avoid mistaking another source literal for harness evidence. */
function harnessMap(componentSource: string): Record<string, string> | null {
  for (const match of componentSource.matchAll(/=\{"[^"]+":"Claude Code"/g)) {
    const start = (match.index ?? 0) + 1;
    const end = findObjectEnd(componentSource, start);
    if (end < 0) continue;
    try {
      const value: unknown = JSON.parse(componentSource.slice(start, end + 1));
      if (
        value != null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.values(value).every((harness) => typeof harness === "string") &&
        Object.values(value).includes("Codex")
      ) {
        return value as Record<string, string>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** Convert one task's results into model-plus-agent observations. The overall task remains scoring evidence, while the five subtasks are marked diagnostic and the caller rejects an incomplete task cohort. */
function taskObservations(
  moduleSource: string,
  task: (typeof TASKS)[number],
  version: string,
  updated: string,
  harnesses: Readonly<Record<string, string>>,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const taskPattern = new RegExp(`(?:\\{|,)${task}:\\{(?="[^"]+":\\{)`);
  const taskStart = taskPattern.exec(moduleSource);
  if (taskStart == null) return [];
  const start = taskStart.index + taskStart[0].lastIndexOf("{");
  const end = findObjectEnd(moduleSource, start);
  if (end < 0) return [];
  const taskBlock = moduleSource.slice(start, end + 1);
  const rows = [...taskBlock.matchAll(/"([^"]+)":\{/g)].flatMap((match) => {
    const modelId = match[1];
    if (modelId == null) return [];
    const rowStart = (match.index ?? 0) + match[0].lastIndexOf("{");
    const rowEnd = findObjectEnd(taskBlock, rowStart);
    if (rowEnd < 0) return [];
    const sourceRow = taskBlock.slice(rowStart, rowEnd + 1);
    const accuracy = numberField(sourceRow, "accuracy");
    const score = accuracy == null ? null : percentToUnitScore(String(accuracy));
    const provider = stringField(sourceRow, "provider");
    const harness = harnesses[modelId];
    if (score == null || provider == null || harness == null) return [];
    const baseModel = modelId.split("/").at(-1) ?? modelId;
    const reasoningEffort = canonicalReasoningEffort(
      stringField(sourceRow, "reasoning_effort") ?? stringField(sourceRow, "compute_effort"),
    );
    const metadata: BenchmarkObservationMetadata = {
      task,
      benchmark_version: version,
      metric: task === "overall" ? "five_task_reference_mean" : "reference_scaled_task_score",
      harness,
      ...(task === "overall" ? {} : { observation_role: "component" }),
    };
    return [
      {
        benchmark_key: "rsi_benchmark",
        source_url: sourceUrl,
        model_id: modelId,
        model: reasoningEffort == null ? baseModel : `${baseModel} (${reasoningEffort})`,
        base_model: baseModel,
        reasoning_effort: reasoningEffort,
        model_creator: provider,
        rank: null,
        canonical_value: score,
        observed_at: updated,
        metadata,
      } satisfies BenchmarkObservationRow,
    ];
  });
  return rows
    .sort(
      (left, right) =>
        right.canonical_value - left.canonical_value ||
        (left.model_id ?? "").localeCompare(right.model_id ?? ""),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function stringField(value: string, key: string): string | null {
  return value.match(new RegExp(`(?:^|[,{])${key}:"([^"]+)"`))?.[1] ?? null;
}

function numberField(value: string, key: string): number | null {
  const raw = value.match(new RegExp(`(?:^|[,{])${key}:([0-9.eE+-]+)`))?.[1];
  const parsed = Number(raw);
  return raw != null && Number.isFinite(parsed) ? parsed : null;
}
