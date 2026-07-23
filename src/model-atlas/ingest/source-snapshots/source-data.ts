/** Persisted snapshot rows are adapted into the shared normalized source-data contract. */

import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkRuntimeKey,
	type BenchmarkRuntimeKeyFor,
} from "../../benchmarks/registry";
import { preferredDeepSWELeaderboardRows } from "../../benchmarks/scrapers/deep-swe";
import type { LlmStatsSourceData } from "../assembly";
import { buildSourceData, type LlmStatsSourceRows } from "../assembly";
import type { SourceSnapshots } from "../types";

type SourceRowProjection<Key extends keyof LlmStatsSourceRows> = {
	sourceRowsKey: Key;
	rows: (snapshots: SourceSnapshots) => LlmStatsSourceRows[Key];
};

function sourceRowProjection<const Key extends keyof LlmStatsSourceRows>(
	sourceRowsKey: Key,
	rows: (snapshots: SourceSnapshots) => LlmStatsSourceRows[Key],
): SourceRowProjection<Key> {
	return { sourceRowsKey, rows };
}

const SURGE_SOURCE_ROW_PROJECTIONS = {
	gdp_pdf: sourceRowProjection(
		"gdpPdfRows",
		(snapshots) => snapshots.gdpPdfModelScoreRows,
	),
	riemann_bench: sourceRowProjection(
		"riemannBenchRows",
		(snapshots) => snapshots.riemannBenchModelScoreRows,
	),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_SOURCE_ROW_PROJECTIONS = {
	vals_harvey_lab: sourceRowProjection(
		"harveyLabRows",
		(snapshots) => snapshots.harveyLabModelScoreRows,
	),
	vals_terminal_bench: sourceRowProjection(
		"terminalBenchRows",
		(snapshots) => snapshots.terminalBenchModelScoreRows,
	),
	vals_index: sourceRowProjection(
		"valsIndexRows",
		(snapshots) => snapshots.valsIndexModelScoreRows,
	),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"vals">, object>;

const SPARSE_SOURCE_ROW_PROJECTIONS = {
	agent_arena: sourceRowProjection(
		"agentArenaRows",
		(snapshots) => snapshots.agentArenaModelScoreRows,
	),
	agents_last_exam: sourceRowProjection(
		"agentsLastExamRows",
		(snapshots) => snapshots.agentsLastExamModelScores,
	),
	ale_bench: sourceRowProjection(
		"aleBenchConfigurationRows",
		(snapshots) => snapshots.aleBenchConfigurationRows,
	),
	blueprint_bench_2: sourceRowProjection(
		"blueprintBenchRows",
		(snapshots) => snapshots.blueprintBenchModelScoreRows,
	),
	cursorbench: sourceRowProjection(
		"cursorBenchRows",
		(snapshots) => snapshots.cursorBenchModelScoreRows,
	),
	deep_swe: sourceRowProjection("deepSWEEffortRows", (snapshots) =>
		preferredDeepSWELeaderboardRows(snapshots.deepSWERawRows),
	),
	frontier_code: sourceRowProjection(
		"frontierCodeRows",
		(snapshots) => snapshots.frontierCodeRows,
	),
	mercor_apex_agents: sourceRowProjection(
		"mercorApexAgentsRows",
		(snapshots) => snapshots.mercorApexAgentsRows,
	),
	vending_bench_2: sourceRowProjection(
		"vendingBench2Rows",
		(snapshots) => snapshots.vendingBench2ModelScoreRows,
	),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"sparse">, object>;

const BENCHMARK_SOURCE_ROW_PROJECTIONS = {
	...SURGE_SOURCE_ROW_PROJECTIONS,
	...VALS_SOURCE_ROW_PROJECTIONS,
	...SPARSE_SOURCE_ROW_PROJECTIONS,
} as const satisfies Record<BenchmarkRuntimeKey, object>;

type BenchmarkSourceRowsKey =
	(typeof BENCHMARK_SOURCE_ROW_PROJECTIONS)[BenchmarkRuntimeKey]["sourceRowsKey"];

function benchmarkSourceRowsFromSnapshots(
	snapshots: SourceSnapshots,
): Pick<LlmStatsSourceRows, BenchmarkSourceRowsKey> {
	return Object.fromEntries(
		Object.values(BENCHMARK_SOURCE_ROW_PROJECTIONS).map((projection) => [
			projection.sourceRowsKey,
			projection.rows(snapshots),
		]),
	) as Pick<LlmStatsSourceRows, BenchmarkSourceRowsKey>;
}

/** Restored source rows rebuild lookup maps without refetching external benchmark pages. */
export function cachedSourceDataFromSnapshots(
	snapshots: SourceSnapshots,
): LlmStatsSourceData {
	type BenchmarkObservationRowsKey =
		(typeof BENCHMARK_OBSERVATION_BINDINGS)[number]["sourceRowsKey"];
	const benchmarkObservationRows = Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map((binding) => [
			binding.sourceRowsKey,
			snapshots[binding.sourceRowsKey],
		]),
	) as Pick<SourceSnapshots, BenchmarkObservationRowsKey>;
	return buildSourceData({
		artificialAnalysisRows: snapshots.artificialAnalysisSelectedRows,
		artificialAnalysisEvaluationResourceRows:
			snapshots.artificialAnalysisEvaluationResourceRows,
		modelsDevModels: snapshots.modelsDevModels,
		...benchmarkSourceRowsFromSnapshots(snapshots),
		...benchmarkObservationRows,
	});
}
