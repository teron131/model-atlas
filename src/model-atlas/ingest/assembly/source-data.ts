/** Source-data contracts and lookup assembly normalize raw provider rows for matching and scoring. */

import {
	type BenchmarkObservationLookup,
	type BenchmarkObservationRow,
	buildBenchmarkObservationLookup,
} from "../../benchmarks/observation";
import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkObservationBinding,
} from "../../benchmarks/registry";
import type {
	AgentArenaModelScoreRow,
	AgentArenaRowsByModelName,
} from "../../benchmarks/scrapers/agent-arena";
import {
	type AgentsLastExamModelScoreRow,
	type AgentsLastExamRowsByModelName,
	buildAgentsLastExamMap,
} from "../../benchmarks/scrapers/agents-last-exam";
import {
	type AleBenchConfigurationRow,
	type AleBenchModelScoreRow,
	type AleBenchRowsByModelName,
	summarizeAleBenchSourceDefaultRows,
} from "../../benchmarks/scrapers/ale-bench";
import {
	type ArtificialAnalysisEvaluationResourceByBenchmark,
	type ArtificialAnalysisEvaluationResourceRow,
	buildArtificialAnalysisDefaultEffortResourceMap,
	buildArtificialAnalysisObservationResourceMap,
} from "../../benchmarks/scrapers/artificial-analysis/results";
import {
	type BlueprintBenchModelScoreRow,
	type BlueprintBenchRowsByModelName,
	buildBlueprintBenchMap,
} from "../../benchmarks/scrapers/blueprint-bench";
import {
	buildCursorBenchMap,
	type CursorBenchModelScoreRow,
	type CursorBenchRowsByModelName,
} from "../../benchmarks/scrapers/cursorbench";
import {
	buildDeepSWEMap,
	type DeepSWELeaderboardRow,
	type DeepSWEModelScoreRow,
	type DeepSWERowsByModelName,
	summarizeDeepSWEDefaultEffortRows,
} from "../../benchmarks/scrapers/deep-swe";
import type {
	FrontierCodeModelEffortRow,
	FrontierCodeRowsByModelName,
} from "../../benchmarks/scrapers/frontier-code";
import type {
	MercorApexAgentsRow,
	MercorApexAgentsRowsByModelName,
} from "../../benchmarks/scrapers/mercor-apex-agents";
import {
	buildGdpPdfMap,
	type GdpPdfModelScoreRow,
	type GdpPdfRowsByModelName,
} from "../../benchmarks/scrapers/surge/gdp-pdf";
import {
	buildRiemannBenchMap,
	type RiemannBenchModelScoreRow,
	type RiemannBenchRowsByModelName,
} from "../../benchmarks/scrapers/surge/riemann-bench";
import {
	buildHarveyLabMap,
	type HarveyLabModelScoreRow,
	type HarveyLabRowsByModelName,
} from "../../benchmarks/scrapers/vals/harvey-lab";
import {
	buildValsIndexMap,
	type ValsIndexModelScoreRow,
	type ValsIndexRowsByModelName,
} from "../../benchmarks/scrapers/vals/index-benchmark";
import {
	buildTerminalBenchMap,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchRowsByModelName,
} from "../../benchmarks/scrapers/vals/terminal-bench";
import type {
	VendingBench2ModelScoreRow,
	VendingBench2RowsByModelName,
} from "../../benchmarks/scrapers/vending-bench-2";
import {
	buildBenchmarkModelMap,
	modelSlugFromModelId,
} from "../../identity/normalization";
import type { ModelsDevFlatModel } from "../../scrapers/models-dev";
import { pickPreferredModelsDevRows } from "./policy";

export type ArtificialAnalysisModel = {
	model_id?: unknown;
	name?: unknown;
	reasoning_effort?: unknown;
	logo?: unknown;
	median_speed?: unknown;
	median_time?: unknown;
	median_end_to_end_response_time?: unknown;
	evaluations?: unknown;
	intelligence?: unknown;
	intelligence_index_cost?: unknown;
};

type IndexedSourceRows<Row, Lookup> = {
	rows: Row[];
	rowsByModelName: Lookup;
};

type BenchmarkObservationData = {
	[Binding in BenchmarkObservationBinding as Binding["sourceDataKey"]]: IndexedSourceRows<
		BenchmarkObservationRow,
		BenchmarkObservationLookup
	>;
};

export type LlmStatsSourceData = BenchmarkObservationData & {
	artificialAnalysis: {
		rows: unknown[];
		bySlug: Map<string, ArtificialAnalysisModel>;
	};
	artificialAnalysisEvaluationResources: {
		rows: ArtificialAnalysisEvaluationResourceRow[];
		observationByModelName: ArtificialAnalysisEvaluationResourceByBenchmark;
		defaultEffortByModelName: ArtificialAnalysisEvaluationResourceByBenchmark;
	};
	modelsDev: {
		rows: ModelsDevFlatModel[];
		byId: Map<string, ModelsDevFlatModel>;
	};
	agentArena: IndexedSourceRows<
		AgentArenaModelScoreRow,
		AgentArenaRowsByModelName
	>;
	agentsLastExam: IndexedSourceRows<
		AgentsLastExamModelScoreRow,
		AgentsLastExamRowsByModelName
	>;
	aleBench: {
		configurationRows: AleBenchConfigurationRow[];
		sourceDefaultRows: AleBenchModelScoreRow[];
		rowsByModelName: AleBenchRowsByModelName;
	};
	blueprintBench: IndexedSourceRows<
		BlueprintBenchModelScoreRow,
		BlueprintBenchRowsByModelName
	>;
	cursorBench: IndexedSourceRows<
		CursorBenchModelScoreRow,
		CursorBenchRowsByModelName
	>;
	deepSWE: {
		effortRows: DeepSWELeaderboardRow[];
		defaultEffortRows: DeepSWEModelScoreRow[];
		rowsByModelName: DeepSWERowsByModelName;
	};
	frontierCode: IndexedSourceRows<
		FrontierCodeModelEffortRow,
		FrontierCodeRowsByModelName
	>;
	gdpPdf: IndexedSourceRows<GdpPdfModelScoreRow, GdpPdfRowsByModelName>;
	harveyLab: IndexedSourceRows<
		HarveyLabModelScoreRow,
		HarveyLabRowsByModelName
	>;
	mercorApexAgents: IndexedSourceRows<
		MercorApexAgentsRow,
		MercorApexAgentsRowsByModelName
	>;
	riemannBench: IndexedSourceRows<
		RiemannBenchModelScoreRow,
		RiemannBenchRowsByModelName
	>;
	terminalBench: IndexedSourceRows<
		TerminalBenchModelHarnessRow,
		TerminalBenchRowsByModelName
	>;
	valsIndex: IndexedSourceRows<
		ValsIndexModelScoreRow,
		ValsIndexRowsByModelName
	>;
	vendingBench2: IndexedSourceRows<
		VendingBench2ModelScoreRow,
		VendingBench2RowsByModelName
	>;
};

type BenchmarkObservationRows = {
	[Binding in BenchmarkObservationBinding as Binding["sourceRowsKey"]]: LlmStatsSourceData[Binding["sourceDataKey"]]["rows"];
};

export type LlmStatsSourceRows = BenchmarkObservationRows & {
	artificialAnalysisRows: LlmStatsSourceData["artificialAnalysis"]["rows"];
	artificialAnalysisEvaluationResourceRows: LlmStatsSourceData["artificialAnalysisEvaluationResources"]["rows"];
	modelsDevModels: LlmStatsSourceData["modelsDev"]["rows"];
	agentArenaRows: LlmStatsSourceData["agentArena"]["rows"];
	agentsLastExamRows: LlmStatsSourceData["agentsLastExam"]["rows"];
	aleBenchConfigurationRows: LlmStatsSourceData["aleBench"]["configurationRows"];
	blueprintBenchRows: LlmStatsSourceData["blueprintBench"]["rows"];
	cursorBenchRows: LlmStatsSourceData["cursorBench"]["rows"];
	deepSWEEffortRows: LlmStatsSourceData["deepSWE"]["effortRows"];
	frontierCodeRows: LlmStatsSourceData["frontierCode"]["rows"];
	gdpPdfRows: LlmStatsSourceData["gdpPdf"]["rows"];
	harveyLabRows: LlmStatsSourceData["harveyLab"]["rows"];
	mercorApexAgentsRows: MercorApexAgentsRow[];
	riemannBenchRows: LlmStatsSourceData["riemannBench"]["rows"];
	terminalBenchRows: LlmStatsSourceData["terminalBench"]["rows"];
	valsIndexRows: LlmStatsSourceData["valsIndex"]["rows"];
	vendingBench2Rows: LlmStatsSourceData["vendingBench2"]["rows"];
};

function buildArtificialAnalysisBySlug(
	rows: unknown[],
): Map<string, ArtificialAnalysisModel> {
	const bySlug = new Map<string, ArtificialAnalysisModel>();
	for (const row of rows) {
		const model = row as ArtificialAnalysisModel;
		const slug = modelSlugFromModelId(model.model_id);
		if (slug) {
			bySlug.set(slug, model);
		}
	}
	return bySlug;
}

function buildBenchmarkObservationData(
	rows: LlmStatsSourceRows,
): Partial<LlmStatsSourceData> {
	return Object.fromEntries(
		BENCHMARK_OBSERVATION_BINDINGS.map(({ sourceDataKey, sourceRowsKey }) => {
			const sourceRows = rows[sourceRowsKey as keyof LlmStatsSourceRows] as
				| readonly BenchmarkObservationRow[]
				| undefined;
			if (!Array.isArray(sourceRows)) {
				throw new Error(
					`Benchmark observation source rows are missing: ${sourceRowsKey}`,
				);
			}
			return [
				sourceDataKey,
				{
					rows: sourceRows,
					rowsByModelName: buildBenchmarkObservationLookup(sourceRows),
				},
			];
		}),
	) as Partial<LlmStatsSourceData>;
}

/** Both live fetches and persisted snapshots enter matching through this normalized lookup contract. */
export function buildSourceData(rows: LlmStatsSourceRows): LlmStatsSourceData {
	const preferredModelsDevModels = pickPreferredModelsDevRows(
		rows.modelsDevModels,
	);
	const deepSweDefaultEffortRows = summarizeDeepSWEDefaultEffortRows(
		rows.deepSWEEffortRows,
	);
	const aleBenchPersistenceDefaultRows = summarizeAleBenchSourceDefaultRows(
		rows.aleBenchConfigurationRows,
	);
	const benchmarkObservationData = buildBenchmarkObservationData(rows);
	return {
		artificialAnalysis: {
			rows: rows.artificialAnalysisRows,
			bySlug: buildArtificialAnalysisBySlug(rows.artificialAnalysisRows),
		},
		artificialAnalysisEvaluationResources: {
			rows: rows.artificialAnalysisEvaluationResourceRows,
			observationByModelName: buildArtificialAnalysisObservationResourceMap(
				rows.artificialAnalysisEvaluationResourceRows,
			),
			defaultEffortByModelName: buildArtificialAnalysisDefaultEffortResourceMap(
				rows.artificialAnalysisEvaluationResourceRows,
			),
		},
		modelsDev: {
			rows: preferredModelsDevModels,
			byId: new Map(
				preferredModelsDevModels.map((modelsDevModel) => [
					modelsDevModel.model_id,
					modelsDevModel,
				]),
			),
		},
		...benchmarkObservationData,
		agentArena: {
			rows: rows.agentArenaRows,
			rowsByModelName: buildBenchmarkModelMap(rows.agentArenaRows),
		},
		agentsLastExam: {
			rows: rows.agentsLastExamRows,
			rowsByModelName: buildAgentsLastExamMap(rows.agentsLastExamRows),
		},
		aleBench: {
			configurationRows: rows.aleBenchConfigurationRows,
			sourceDefaultRows: aleBenchPersistenceDefaultRows,
			rowsByModelName: buildBenchmarkModelMap(aleBenchPersistenceDefaultRows),
		},
		blueprintBench: {
			rows: rows.blueprintBenchRows,
			rowsByModelName: buildBlueprintBenchMap(rows.blueprintBenchRows),
		},
		cursorBench: {
			rows: rows.cursorBenchRows,
			rowsByModelName: buildCursorBenchMap(rows.cursorBenchRows),
		},
		deepSWE: {
			effortRows: rows.deepSWEEffortRows,
			defaultEffortRows: deepSweDefaultEffortRows,
			rowsByModelName: buildDeepSWEMap(deepSweDefaultEffortRows),
		},
		frontierCode: {
			rows: rows.frontierCodeRows,
			rowsByModelName: buildBenchmarkModelMap(rows.frontierCodeRows),
		},
		gdpPdf: {
			rows: rows.gdpPdfRows,
			rowsByModelName: buildGdpPdfMap(rows.gdpPdfRows),
		},
		harveyLab: {
			rows: rows.harveyLabRows,
			rowsByModelName: buildHarveyLabMap(rows.harveyLabRows),
		},
		mercorApexAgents: {
			rows: rows.mercorApexAgentsRows,
			rowsByModelName: buildBenchmarkModelMap(rows.mercorApexAgentsRows),
		},
		riemannBench: {
			rows: rows.riemannBenchRows,
			rowsByModelName: buildRiemannBenchMap(rows.riemannBenchRows),
		},
		terminalBench: {
			rows: rows.terminalBenchRows,
			rowsByModelName: buildTerminalBenchMap(rows.terminalBenchRows),
		},
		valsIndex: {
			rows: rows.valsIndexRows,
			rowsByModelName: buildValsIndexMap(rows.valsIndexRows),
		},
		vendingBench2: {
			rows: rows.vendingBench2Rows,
			rowsByModelName: buildBenchmarkModelMap(rows.vendingBench2Rows),
		},
	} as unknown as LlmStatsSourceData;
}
