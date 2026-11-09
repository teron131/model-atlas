/** Stable source identities, locations, cache policy, and persisted table bindings for ingestion. */

import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  BENCHMARK_OBSERVATION_KEYS,
  BENCHMARK_RUNTIME_KEYS,
  type BenchmarkKey,
  type BenchmarkObservationKey,
  type BenchmarkRuntimeKey,
} from "../benchmarks/registry";
import { OPENROUTER_MODELS_URL } from "./openrouter";

const SCHEDULED_SOURCE_CACHE_SECONDS = 3.5 * 60 * 60;

const OPENROUTER_CACHE_SECONDS = 24 * 60 * 60;

const CORE_RAW_SOURCE_NAMES = [
  "artificial_analysis",
  "artificial_analysis_benchmark_resources",
  "models_dev",
  "openrouter",
] as const;

export const RAW_SOURCE_NAMES = [
  ...CORE_RAW_SOURCE_NAMES,
  ...BENCHMARK_RUNTIME_KEYS,
  ...BENCHMARK_OBSERVATION_KEYS,
] as const;

export type RawSourceName = (typeof RAW_SOURCE_NAMES)[number];

const CORE_RAW_SOURCE_TABLES = {
  artificial_analysis: "artificial_analysis_raw_models",
  artificial_analysis_benchmark_resources: "artificial_analysis_benchmarks_raw_rows",
  models_dev: "models_dev_raw_models",
  openrouter: "openrouter_raw_rows",
} as const satisfies Record<(typeof CORE_RAW_SOURCE_NAMES)[number], string>;

const BENCHMARK_RUNTIME_RAW_SOURCE_TABLES = Object.fromEntries(
  BENCHMARK_RUNTIME_KEYS.map((key) => [key, `${key}_raw_rows`]),
) as Record<BenchmarkRuntimeKey, `${BenchmarkRuntimeKey}_raw_rows`>;

const BENCHMARK_OBSERVATION_RAW_SOURCE_TABLES = Object.fromEntries(
  BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [binding.benchmark, binding.rawTable]),
) as Record<(typeof BENCHMARK_OBSERVATION_KEYS)[number], string>;

export const RAW_SOURCE_TABLES = {
  ...CORE_RAW_SOURCE_TABLES,
  ...BENCHMARK_RUNTIME_RAW_SOURCE_TABLES,
  ...BENCHMARK_OBSERVATION_RAW_SOURCE_TABLES,
} as const satisfies Record<RawSourceName, string>;

export const SOURCE_URLS = {
  artificial_analysis: "https://artificialanalysis.ai/leaderboards/models",
  artificial_analysis_benchmark_resources: "https://artificialanalysis.ai/evaluations",
  models_dev: "https://models.dev/api.json",
  openrouter_models: OPENROUTER_MODELS_URL,
  openrouter_stats: "https://openrouter.ai/api/frontend/v1/stats/*",
} as const;

/** High-volume OpenRouter telemetry refreshes daily while newly requested model IDs still bypass its populated cache. */
export function rawSourceCacheSeconds(source: RawSourceName): number {
  return source === "openrouter" ? OPENROUTER_CACHE_SECONDS : SCHEDULED_SOURCE_CACHE_SECONDS;
}

/** The raw sources a benchmark's rows are fetched through; an input without its own loader or adapter arrives through one of these. */
export function benchmarkRawSources(key: string): RawSourceName[] {
  const inputs = BENCHMARK_CATALOG[key as BenchmarkKey]?.source.inputs ?? [];
  const sources = inputs.flatMap((input): RawSourceName[] => {
    const runtime = BENCHMARK_RUNTIME_KEYS.find((runtimeKey) => runtimeKey === input.runtime?.key);
    if (runtime != null) return [runtime];
    if (input.id !== "artificial_analysis") return [];
    if (input.adapters == null) return ["artificial_analysis"];
    return input.adapters.some((adapter) => adapter.kind === "artificial_analysis_resource_page")
      ? ["artificial_analysis_benchmark_resources"]
      : [];
  });
  return isBenchmarkObservationRawSource(key) ? [key, ...sources] : sources;
}

/** Catalog benchmark-observation sources share one physical table while retaining independent cache partitions. */
export function isBenchmarkObservationRawSource(source: string): source is BenchmarkObservationKey {
  return (BENCHMARK_OBSERVATION_KEYS as readonly string[]).includes(source);
}
