/**
 * Scrapes RSI benchmark results from Vals.
 *
 * Page source: https://www.vals.ai/benchmarks/rsi_index
 */

import { BENCHMARK_STANDARD_SOURCES } from "../../benchmarks/catalog";
import type {
  BenchmarkObservationMetadata,
  BenchmarkObservationPayload,
  BenchmarkObservationRow,
} from "../../benchmarks/observation";
import { canonicalReasoningEffort, modelEffortLabel } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord, nowEpochSeconds } from "../../runtime";
import { findObjectEnd, htmlAttribute, percentToUnitScore } from "../parsing";
import { fetchSourceText } from "../request-scheduler";
import { valsModelSlug } from "./results";

const RSI_METRIC = BENCHMARK_STANDARD_SOURCES.rsi_benchmark.revision;
const RSI_TASKS = [
  "overall",
  "compression",
  "lm_training",
  "harness_engineering",
  "post_training",
] as const;

/**
 * Resolve the page's hashed assets and load the published score with its task diagnostics.
 * A page without the expected asset references or a malformed module returns no new evidence, and a failed request rejects; the snapshot lifecycle keeps a valid cache either way.
 */
export async function getValsRsiStats(sourceUrl: string): Promise<BenchmarkObservationPayload> {
  const page = await fetchSourceText(sourceUrl);
  // The RSI view's Astro island tag, hash and query allowed: `<astro-island uid="a" component-url="/_astro/RsiBenchmarkView.B2xY.js?v=1" props="{}">` → that whole tag.
  const islandTag = page.match(
    /<astro-island\b(?=[^>]*component-url="\/_astro\/RsiBenchmarkView\.[^"?]+\.js(?:\?[^"]*)?")[^>]*>/,
  )?.[0];
  const componentUrl = islandTag == null ? null : htmlAttribute(islandTag, "component-url");
  if (componentUrl == null) return { fetched_at_epoch_seconds: null, data: [] };
  const component = await fetchSourceText(new URL(componentUrl, sourceUrl).href);
  // The component imports its data module by relative path: `import a from "./benchmark_view_rsi_index.Cd3_x.js"` → `benchmark_view_rsi_index.Cd3_x.js`.
  const dataModulePath = component.match(
    /["'`]\.\/(benchmark_view_rsi_index\.[A-Za-z0-9_-]+\.js(?:\?[^"'`]*)?)["'`]/,
  )?.[1];
  if (dataModulePath == null) return { fetched_at_epoch_seconds: null, data: [] };
  const moduleSource = await fetchSourceText(
    new URL(dataModulePath, new URL(componentUrl, sourceUrl)).href,
  );
  const data = processValsRsiModule(moduleSource, component, sourceUrl);
  return { fetched_at_epoch_seconds: data.length > 0 ? nowEpochSeconds() : null, data };
}

/**
 * Read the metadata literal and the task results the module passes to `JSON.parse`, without executing the publisher's JavaScript.
 * Reject the whole refresh unless a declared version, the four-task composition, model counts, and harness assignments form one complete cohort.
 */
export function processValsRsiModule(
  moduleSource: string,
  componentSource: string,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const metadataStart = moduleSource.search(/\{benchmark:["`]Vals RSI Index["`]/);
  if (metadataStart < 0) return [];
  const metadataEnd = findObjectEnd(moduleSource, metadataStart);
  if (metadataEnd < 0) return [];
  const metadata = moduleSource.slice(metadataStart, metadataEnd + 1);
  const version = stringField(metadata, "version");
  const updated = stringField(metadata, "updated");
  const modelCount = numberField(metadata, "total_models");
  if (
    stringField(metadata, "benchmark_id") !== "rsi_index" ||
    version == null ||
    !hasCurrentTaskComposition(metadata) ||
    updated == null ||
    modelCount == null ||
    !Number.isInteger(modelCount) ||
    modelCount < 1
  )
    return [];

  const harnesses = harnessMap(componentSource);
  const results = taskResults(moduleSource.slice(metadataEnd + 1));
  if (harnesses == null || results == null) return [];
  const rows = RSI_TASKS.flatMap((task) => {
    const taskRows = taskObservations(results[task], task, version, updated, harnesses, sourceUrl);
    return taskRows.length === modelCount ? taskRows : [];
  });
  return rows.length === RSI_TASKS.length * modelCount ? rows : [];
}

/** The cached suite must contain every task under a declared source version and disclosed harness mapping. */
export function valsRsiCacheMatches(rows: readonly BenchmarkObservationRow[]): boolean {
  return (
    RSI_TASKS.every((task) => rows.some((row) => row.metadata.task === task)) &&
    rows.every(
      (row) =>
        RSI_TASKS.some((task) => row.metadata.task === task) &&
        typeof row.metadata.benchmark_version === "string" &&
        typeof row.metadata.harness === "string" &&
        row.metadata.metric ===
          (row.metadata.task === "overall" ? RSI_METRIC : "reference_scaled_task_score") &&
        row.metadata.observation_role ===
          (row.metadata.task === "overall" ? undefined : "component"),
    )
  );
}

/**
 * Read the component's model-to-agent mapping so each score remains attributable to its disclosed scaffold.
 * Accept only a string map containing both Claude Code and Codex to avoid mistaking another source literal for harness evidence.
 */
function harnessMap(componentSource: string): Record<string, string> | null {
  // Each candidate is a minified assignment whose first entry maps to Claude Code, and `start` skips its `=`: x={"anthropic/claude":`Claude Code`,…} matches at index 1.
  for (const match of componentSource.matchAll(/=\{"[^"]+":["`]Claude Code["`]/g)) {
    const start = (match.index ?? 0) + 1;
    const end = findObjectEnd(componentSource, start);
    if (end < 0) continue;
    try {
      const value: unknown = JSON.parse(
        componentSource
          .slice(start, end + 1)
          // Minified values may be template literals, which JSON rejects: {"a":`Claude Code`} → {"a":"Claude Code"}.
          .replace(/`([^`\\]*)`/g, (_, text: string) => JSON.stringify(text)),
      );
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

/** The task results are a JSON document inside the first template literal passed to `JSON.parse` after the metadata; the template's own escapes are undone before parsing: JSON.parse(`{"a\`b":1}`) → {"a`b":1}. */
function taskResults(moduleSource: string): Record<string, unknown> | null {
  const template = moduleSource.match(/JSON\.parse\(`((?:\\[\s\S]|[^`\\])*)`\)/)?.[1];
  if (template == null) return null;
  try {
    return asRecord(JSON.parse(template.replace(/\\([\\`$])/g, "$1")));
  } catch {
    return null;
  }
}

/**
 * Convert one task's results into model-plus-agent observations.
 * The overall task remains scoring evidence, while the four subtasks are marked diagnostic and the caller rejects an incomplete task cohort.
 */
function taskObservations(
  taskResult: unknown,
  task: (typeof RSI_TASKS)[number],
  version: string,
  updated: string,
  harnesses: Readonly<Record<string, string>>,
  sourceUrl: string,
): BenchmarkObservationRow[] {
  const rows = Object.entries(asRecord(taskResult)).flatMap(([modelId, value]) => {
    const sourceRow = asRecord(value);
    const score = percentToUnitScore(asFiniteNumber(sourceRow.accuracy));
    const provider = asNonEmptyString(sourceRow.provider);
    const harness = harnesses[modelId];
    if (score == null || provider == null || harness == null) return [];
    const baseModel = valsModelSlug(modelId);
    const reasoningEffort = canonicalReasoningEffort(
      asNonEmptyString(sourceRow.reasoning_effort) ?? asNonEmptyString(sourceRow.compute_effort),
    );
    const metadata: BenchmarkObservationMetadata = {
      task,
      benchmark_version: version,
      metric: task === "overall" ? RSI_METRIC : "reference_scaled_task_score",
      harness,
      ...(task === "overall" ? {} : { observation_role: "component" }),
    };
    return [
      {
        benchmark_key: "rsi_benchmark",
        source_url: sourceUrl,
        model_id: modelId,
        model: modelEffortLabel(baseModel, reasoningEffort),
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

/** The publisher reused version 1.1 after removing Parameter Golf, so the declared task set is part of the contract. */
function hasCurrentTaskComposition(metadata: string): boolean {
  const fieldStart = metadata.indexOf("tasks:{");
  if (fieldStart < 0) return false;
  const start = fieldStart + "tasks:".length;
  const end = findObjectEnd(metadata, start);
  if (end < 0) return false;
  // Task keys of the minified `tasks` object: {overall:"Overall",lm_training:`LM`} → overall, lm_training.
  const tasks = [...metadata.slice(start, end + 1).matchAll(/(?:^|[,{])([a-z_]+):["`]/g)].map(
    (match) => match[1],
  );
  return tasks.length === RSI_TASKS.length && RSI_TASKS.every((task) => tasks.includes(task));
}

/** Reads a quoted field from a minified object literal: `version` in {benchmark:"Vals RSI Index",version:`1.1`} → 1.1. */
function stringField(value: string, key: string): string | null {
  return value.match(new RegExp(`(?:^|[,{])${key}:["\`]([^"\`]+)["\`]`))?.[1] ?? null;
}

/** Reads a numeric field from a minified object literal: `total_models` in {total_models:42,version:"1"} → 42. */
function numberField(value: string, key: string): number | null {
  const raw = value.match(new RegExp(`(?:^|[,{])${key}:([0-9.eE+-]+)`))?.[1];
  const parsed = Number(raw);
  return raw != null && Number.isFinite(parsed) ? parsed : null;
}
