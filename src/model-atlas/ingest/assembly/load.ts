/** Source loading owns provider dispatch and produces the complete raw-row contract for stats assembly. */

import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkRuntimeKey,
	type BenchmarkRuntimeKeyFor,
} from "../../benchmarks/registry";
import { getAgentArenaStats } from "../../scrapers/agent-arena";
import { getAgentsLastExamStats } from "../../scrapers/agents-last-exam";
import { getAleBenchStats } from "../../scrapers/ale-bench";
import { getArtificialAnalysisEvaluationResourceStats } from "../../scrapers/artificial-analysis/benchmark-resources";
import { getArtificialAnalysisLeaderboardStats } from "../../scrapers/artificial-analysis/leaderboard";
import { getBlueprintBenchStats } from "../../scrapers/blueprint-bench";
import { getCursorBenchStats } from "../../scrapers/cursorbench";
import { getDeepSWELeaderboardStats } from "../../scrapers/deep-swe";
import { getEpochCapabilitiesIndexStats } from "../../scrapers/epoch/capabilities-index";
import { getEpochBenchmarkStats } from "../../scrapers/epoch/common";
import { getFrontierCodeStats } from "../../scrapers/frontier-code";
import { getMercorApexAgentsStats } from "../../scrapers/mercor-apex-agents";
import { getModelsDevSourceStats } from "../../scrapers/models-dev";
import { getSurgeLeaderboardStats } from "../../scrapers/surge/common";
import { getGdpPdfStats } from "../../scrapers/surge/gdp-pdf";
import { getRiemannBenchStats } from "../../scrapers/surge/riemann-bench";
import { getValsSourceStats } from "../../scrapers/vals/common";
import { getHarveyLabStats } from "../../scrapers/vals/harvey-lab";
import { getValsIndexStats } from "../../scrapers/vals/index-benchmark";
import { getTerminalBenchStats } from "../../scrapers/vals/terminal-bench";
import { getVendingBench2Stats } from "../../scrapers/vending-bench-2";
import { getWeirdMlStats } from "../../scrapers/weirdml";
import { getZeroEvalStats } from "../../scrapers/zeroeval";
import {
	buildSourceData,
	type LlmStatsSourceData,
	type LlmStatsSourceRows,
} from "./data";
import { selectModelsDevRowsForArtificialAnalysis } from "./policy";

const BENCHMARK_OBSERVATION_SOURCE_FETCHERS = {
	epochCapabilitiesIndex: getEpochCapabilitiesIndexStats,
	weirdMl: getWeirdMlStats,
} as const;

/** Resolve the executable loader paired with one catalog-declared benchmark-observation source. */
export function benchmarkObservationSourceFetcher(
	binding: (typeof BENCHMARK_OBSERVATION_BINDINGS)[number],
) {
	const loader = binding.loader;
	if (loader.kind === "surge") {
		return () => getSurgeLeaderboardStats(binding.benchmark, loader.sourceUrl);
	}
	if (loader.kind === "vals") {
		return () =>
			getValsSourceStats({
				benchmarkKey: binding.benchmark,
				canonicalTask: loader.canonicalTask,
				includeReasoningEffortInModel:
					"includeReasoningEffortInModel" in loader
						? loader.includeReasoningEffortInModel
						: undefined,
				isScoreEligible:
					"eligibility" in loader && loader.eligibility === "exclude_aristotle"
						? (_task, modelId) =>
								modelId.toLowerCase() !== "aristotle/aristotle"
						: undefined,
				sourceUrl: loader.sourceUrl,
			});
	}
	if (loader.kind === "epoch_runs") {
		return () => getEpochBenchmarkStats(binding.benchmark, loader.task);
	}
	if (loader.kind === "zeroeval") {
		return () =>
			getZeroEvalStats({
				benchmarkKey: binding.benchmark,
				sourceUrl: loader.sourceUrl,
				rankField: "rankField" in loader ? loader.rankField : undefined,
				observedAtField:
					"observedAtField" in loader ? loader.observedAtField : undefined,
			});
	}
	const fetcher =
		BENCHMARK_OBSERVATION_SOURCE_FETCHERS[
			binding.sourceDataKey as keyof typeof BENCHMARK_OBSERVATION_SOURCE_FETCHERS
		];
	if (fetcher != null) return fetcher;
	throw new Error(
		`Missing benchmark-observation fetcher for ${binding.sourceDataKey}`,
	);
}

type BenchmarkSourceLoader<Key extends keyof LlmStatsSourceRows> = {
	sourceRowsKey: Key;
	load: () => Promise<LlmStatsSourceRows[Key]>;
};

function benchmarkSourceLoader<const Key extends keyof LlmStatsSourceRows>(
	sourceRowsKey: Key,
	load: () => Promise<LlmStatsSourceRows[Key]>,
): BenchmarkSourceLoader<Key> {
	return { sourceRowsKey, load };
}

const SURGE_SOURCE_LOADERS = {
	gdp_pdf: benchmarkSourceLoader(
		"gdpPdfRows",
		async () => (await getGdpPdfStats()).data,
	),
	riemann_bench: benchmarkSourceLoader(
		"riemannBenchRows",
		async () => (await getRiemannBenchStats()).data,
	),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"surge">, object>;

const VALS_SOURCE_LOADERS = {
	vals_harvey_lab: benchmarkSourceLoader(
		"harveyLabRows",
		async () => (await getHarveyLabStats()).model_scores,
	),
	vals_terminal_bench: benchmarkSourceLoader(
		"terminalBenchRows",
		async () => (await getTerminalBenchStats()).model_scores,
	),
	vals_index: benchmarkSourceLoader(
		"valsIndexRows",
		async () => (await getValsIndexStats()).model_scores,
	),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"vals">, object>;

const SPARSE_SOURCE_LOADERS = {
	agent_arena: benchmarkSourceLoader(
		"agentArenaRows",
		async () => (await getAgentArenaStats()).data,
	),
	agents_last_exam: benchmarkSourceLoader(
		"agentsLastExamRows",
		async () => (await getAgentsLastExamStats()).data,
	),
	ale_bench: benchmarkSourceLoader(
		"aleBenchConfigurationRows",
		async () => (await getAleBenchStats()).data,
	),
	blueprint_bench_2: benchmarkSourceLoader(
		"blueprintBenchRows",
		async () => (await getBlueprintBenchStats()).data,
	),
	cursorbench: benchmarkSourceLoader(
		"cursorBenchRows",
		async () => (await getCursorBenchStats()).data,
	),
	deep_swe: benchmarkSourceLoader(
		"deepSWEEffortRows",
		async () => (await getDeepSWELeaderboardStats()).data,
	),
	frontier_code: benchmarkSourceLoader(
		"frontierCodeRows",
		async () => (await getFrontierCodeStats()).data,
	),
	mercor_apex_agents: benchmarkSourceLoader(
		"mercorApexAgentsRows",
		async () => (await getMercorApexAgentsStats()).data,
	),
	vending_bench_2: benchmarkSourceLoader(
		"vendingBench2Rows",
		async () => (await getVendingBench2Stats()).data,
	),
} as const satisfies Record<BenchmarkRuntimeKeyFor<"sparse">, object>;

const BENCHMARK_SOURCE_LOADERS = {
	...SURGE_SOURCE_LOADERS,
	...VALS_SOURCE_LOADERS,
	...SPARSE_SOURCE_LOADERS,
} as const satisfies Record<BenchmarkRuntimeKey, object>;

type BenchmarkSourceRowsKey =
	(typeof BENCHMARK_SOURCE_LOADERS)[BenchmarkRuntimeKey]["sourceRowsKey"];
type BenchmarkSourceRows = Pick<LlmStatsSourceRows, BenchmarkSourceRowsKey>;

/** Fetch custom benchmark rows while preserving each source-specific output contract. */
async function fetchBenchmarkSourceRows(): Promise<BenchmarkSourceRows> {
	const entries = await Promise.all(
		Object.values(BENCHMARK_SOURCE_LOADERS).map(async (loader) => [
			loader.sourceRowsKey,
			await loader.load(),
		]),
	);
	return Object.fromEntries(entries) as BenchmarkSourceRows;
}

/** Fetch every external source into the raw-row contract consumed by stats assembly. */
async function fetchSourceRows(): Promise<LlmStatsSourceRows> {
	const [
		artificialAnalysisStats,
		artificialAnalysisEvaluationResourceStats,
		modelsDevStats,
		benchmarkRows,
		benchmarkObservationStats,
	] = await Promise.all([
		getArtificialAnalysisLeaderboardStats(),
		getArtificialAnalysisEvaluationResourceStats(),
		getModelsDevSourceStats(),
		fetchBenchmarkSourceRows(),
		Promise.all(
			BENCHMARK_OBSERVATION_BINDINGS.map(async (binding) => ({
				binding,
				payload: await benchmarkObservationSourceFetcher(binding)(),
			})),
		),
	]);
	const artificialAnalysisRows = artificialAnalysisStats.data;
	const artificialAnalysisEvaluationResourceRows =
		artificialAnalysisEvaluationResourceStats.data;
	type BenchmarkObservationRowsKey =
		(typeof BENCHMARK_OBSERVATION_BINDINGS)[number]["sourceRowsKey"];
	const benchmarkObservationRows = Object.fromEntries(
		benchmarkObservationStats.map(({ binding, payload }) => [
			binding.sourceRowsKey,
			payload.data,
		]),
	) as Pick<LlmStatsSourceRows, BenchmarkObservationRowsKey>;
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDevStats.payload,
		artificialAnalysisRows,
	);
	return {
		artificialAnalysisRows,
		artificialAnalysisEvaluationResourceRows,
		modelsDevModels,
		...benchmarkRows,
		...benchmarkObservationRows,
	};
}

/** Fetch and normalize every configured stats source through the same assembly boundary. */
export async function fetchSourceData(): Promise<LlmStatsSourceData> {
	return buildSourceData(await fetchSourceRows());
}
