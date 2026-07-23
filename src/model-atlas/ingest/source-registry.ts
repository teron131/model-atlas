/** Stable source identities, locations, cache policy, and persisted table bindings for ingestion. */

import {
	BENCHMARK_OBSERVATION_BINDINGS,
	BENCHMARK_OBSERVATION_KEYS,
	BENCHMARK_RUNTIME_KEYS,
	type BenchmarkObservationKey,
	type BenchmarkRuntimeKey,
} from "../benchmarks/registry";
import { OPENROUTER_MODELS_URL } from "../scrapers/openrouter";

export const RAW_SOURCE_CACHE_SECONDS = 24 * 60 * 60;

const CORE_RAW_SOURCE_NAMES = [
	"artificial_analysis",
	"artificial_analysis_evaluation_resources",
	"models_dev",
	"openrouter",
] as const;

export const RAW_SOURCE_NAMES = [
	...CORE_RAW_SOURCE_NAMES,
	...BENCHMARK_RUNTIME_KEYS,
	...BENCHMARK_OBSERVATION_KEYS,
] as const;

export type RawSourceName = (typeof RAW_SOURCE_NAMES)[number];

/** Catalog benchmark-observation sources share one physical table while retaining independent cache partitions. */
export function isBenchmarkObservationRawSource(
	source: RawSourceName,
): source is BenchmarkObservationKey {
	return (BENCHMARK_OBSERVATION_KEYS as readonly string[]).includes(source);
}

/** Raw source table names shared by cache freshness checks, snapshot writes, and D1 verification. */
const CORE_RAW_SOURCE_TABLES = {
	artificial_analysis: "artificial_analysis_raw_models",
	artificial_analysis_evaluation_resources:
		"artificial_analysis_evaluations_raw_rows",
	models_dev: "models_dev_raw_models",
	openrouter: "openrouter_raw_rows",
} as const satisfies Record<(typeof CORE_RAW_SOURCE_NAMES)[number], string>;

const BENCHMARK_RUNTIME_RAW_SOURCE_TABLES = Object.fromEntries(
	BENCHMARK_RUNTIME_KEYS.map((key) => [key, `${key}_raw_rows`]),
) as Record<BenchmarkRuntimeKey, `${BenchmarkRuntimeKey}_raw_rows`>;

const BENCHMARK_OBSERVATION_RAW_SOURCE_TABLES = Object.fromEntries(
	BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
		binding.rawSourceKey,
		binding.rawTable,
	]),
) as Record<(typeof BENCHMARK_OBSERVATION_KEYS)[number], string>;

export const RAW_SOURCE_TABLES = {
	...CORE_RAW_SOURCE_TABLES,
	...BENCHMARK_RUNTIME_RAW_SOURCE_TABLES,
	...BENCHMARK_OBSERVATION_RAW_SOURCE_TABLES,
} as const satisfies Record<RawSourceName, string>;

/** Tables owned by the local snapshot pipeline and rewritten as a completed run. */
export const SNAPSHOT_TABLES = {
	...RAW_SOURCE_TABLES,
	source_quarantines: "source_quarantines",
	source_health: "source_health",
	models: "models",
	model_evaluations: "model_evaluations",
	model_task_metrics: "model_task_metrics",
	model_match_debug: "model_match_debug",
} as const;

export type SnapshotTableName =
	(typeof SNAPSHOT_TABLES)[keyof typeof SNAPSHOT_TABLES];

export const SOURCE_URLS = {
	artificial_analysis: "https://artificialanalysis.ai/leaderboards/models",
	artificial_analysis_evaluation_resources:
		"https://artificialanalysis.ai/evaluations",
	models_dev: "https://models.dev/api.json",
	openrouter_models: OPENROUTER_MODELS_URL,
	openrouter_stats: "https://openrouter.ai/api/frontend/v1/stats/*",
	agent_arena: "https://arena.ai/leaderboard/agent",
	agents_last_exam: "https://agents-last-exam.org/leaderboard",
	ale_bench: "https://sakanaai.github.io/ALE-Bench-Leaderboard",
	blueprint_bench_2: "https://andonlabs.com/evals/blueprint-bench-2",
	cursorbench: "https://cursor.com/cursorbench",
	deep_swe: "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
	frontier_code: "https://cognition.com/frontiercode",
	gdp_pdf: "https://surgehq.ai/leaderboards/gdp-pdf",
	vals_harvey_lab: "https://www.vals.ai/benchmarks/hlab",
	mercor_apex_agents: "https://www.mercor.com/apex/apex-agents-leaderboard/",
	riemann_bench: "https://surgehq.ai/leaderboards/riemann-bench",
	vals_terminal_bench: "https://www.vals.ai/benchmarks/terminal-bench-2-1",
	vals_index: "https://www.vals.ai/benchmarks/vals_index",
	vending_bench_2: "https://andonlabs.com/evals/vending-bench-2",
} as const;
