/** Source-data contracts and lookup assembly normalize raw provider rows for matching and scoring. */

import {
	BENCHMARK_SCORE_SOURCE_BINDINGS,
	type BenchmarkScoreSourceBinding,
} from "../../benchmarks/registry";
import {
	buildBenchmarkModelMap,
	modelSlugFromModelId,
} from "../../identity/normalization";
import type {
	AgentArenaModelScoreRow,
	AgentArenaRowsByModelName,
} from "../../scrapers/agent-arena";
import {
	type AgentsLastExamModelScoreRow,
	type AgentsLastExamRowsByModelName,
	buildAgentsLastExamMap,
} from "../../scrapers/agents-last-exam";
import {
	type AleBenchConfigurationRow,
	type AleBenchModelScoreRow,
	type AleBenchRowsByModelName,
	summarizeAleBenchSourceDefaultRows,
} from "../../scrapers/ale-bench";
import {
	type ArtificialAnalysisEvaluationResourceByBenchmark,
	type ArtificialAnalysisEvaluationResourceRow,
	buildArtificialAnalysisDefaultEffortResourceMap,
	buildArtificialAnalysisObservationResourceMap,
} from "../../scrapers/artificial-analysis/benchmark-resources";
import {
	type BenchmarkRowsByModelName,
	type BenchmarkScoreRow,
	buildBenchmarkScoreMap,
} from "../../scrapers/benchmark-score";
import {
	type BlueprintBenchModelScoreRow,
	type BlueprintBenchRowsByModelName,
	buildBlueprintBenchMap,
} from "../../scrapers/blueprint-bench";
import {
	buildCursorBenchMap,
	type CursorBenchModelScoreRow,
	type CursorBenchRowsByModelName,
} from "../../scrapers/cursorbench";
import {
	buildDeepSWEMap,
	type DeepSWELeaderboardRow,
	type DeepSWEModelScoreRow,
	type DeepSWERowsByModelName,
	summarizeDeepSWEDefaultEffortRows,
} from "../../scrapers/deep-swe";
import type {
	FrontierCodeModelEffortRow,
	FrontierCodeRowsByModelName,
} from "../../scrapers/frontier-code";
import type {
	MercorApexAgentsRow,
	MercorApexAgentsRowsByModelName,
} from "../../scrapers/mercor-apex-agents";
import type { ModelsDevFlatModel } from "../../scrapers/models-dev";
import {
	buildGdpPdfMap,
	type GdpPdfModelScoreRow,
	type GdpPdfRowsByModelName,
} from "../../scrapers/surge/gdp-pdf";
import {
	buildRiemannBenchMap,
	type RiemannBenchModelScoreRow,
	type RiemannBenchRowsByModelName,
} from "../../scrapers/surge/riemann-bench";
import {
	buildHarveyLabMap,
	type HarveyLabModelScoreRow,
	type HarveyLabRowsByModelName,
} from "../../scrapers/vals/harvey-lab";
import {
	buildValsIndexMap,
	type ValsIndexModelScoreRow,
	type ValsIndexRowsByModelName,
} from "../../scrapers/vals/index-benchmark";
import {
	buildTerminalBenchMap,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchRowsByModelName,
} from "../../scrapers/vals/terminal-bench";
import type {
	VendingBench2ModelScoreRow,
	VendingBench2RowsByModelName,
} from "../../scrapers/vending-bench-2";
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

type LlmStatsIndexedSourceRows<Row, Lookup> = {
	rows: Row[];
	rowsByModelName: Lookup;
};

type BenchmarkScoreSourceData = {
	[Binding in BenchmarkScoreSourceBinding as Binding["sourceDataKey"]]: LlmStatsIndexedSourceRows<
		BenchmarkScoreRow,
		BenchmarkRowsByModelName
	>;
};

export type LlmStatsSourceData = BenchmarkScoreSourceData & {
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
	agentArena: LlmStatsIndexedSourceRows<
		AgentArenaModelScoreRow,
		AgentArenaRowsByModelName
	>;
	agentsLastExam: LlmStatsIndexedSourceRows<
		AgentsLastExamModelScoreRow,
		AgentsLastExamRowsByModelName
	>;
	aleBench: {
		configurationRows: AleBenchConfigurationRow[];
		sourceDefaultRows: AleBenchModelScoreRow[];
		rowsByModelName: AleBenchRowsByModelName;
	};
	blueprintBench: LlmStatsIndexedSourceRows<
		BlueprintBenchModelScoreRow,
		BlueprintBenchRowsByModelName
	>;
	cursorBench: LlmStatsIndexedSourceRows<
		CursorBenchModelScoreRow,
		CursorBenchRowsByModelName
	>;
	deepSWE: {
		effortRows: DeepSWELeaderboardRow[];
		defaultEffortRows: DeepSWEModelScoreRow[];
		rowsByModelName: DeepSWERowsByModelName;
	};
	frontierCode: LlmStatsIndexedSourceRows<
		FrontierCodeModelEffortRow,
		FrontierCodeRowsByModelName
	>;
	gdpPdf: LlmStatsIndexedSourceRows<GdpPdfModelScoreRow, GdpPdfRowsByModelName>;
	harveyLab: LlmStatsIndexedSourceRows<
		HarveyLabModelScoreRow,
		HarveyLabRowsByModelName
	>;
	mercorApexAgents: LlmStatsIndexedSourceRows<
		MercorApexAgentsRow,
		MercorApexAgentsRowsByModelName
	>;
	riemannBench: LlmStatsIndexedSourceRows<
		RiemannBenchModelScoreRow,
		RiemannBenchRowsByModelName
	>;
	terminalBench: LlmStatsIndexedSourceRows<
		TerminalBenchModelHarnessRow,
		TerminalBenchRowsByModelName
	>;
	valsIndex: LlmStatsIndexedSourceRows<
		ValsIndexModelScoreRow,
		ValsIndexRowsByModelName
	>;
	vendingBench2: LlmStatsIndexedSourceRows<
		VendingBench2ModelScoreRow,
		VendingBench2RowsByModelName
	>;
};

type BenchmarkScoreSourceRows = {
	[Binding in BenchmarkScoreSourceBinding as Binding["sourceRowsKey"]]: LlmStatsSourceData[Binding["sourceDataKey"]]["rows"];
};

export type LlmStatsSourceRows = BenchmarkScoreSourceRows & {
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

function buildBenchmarkScoreSources(
	rows: LlmStatsSourceRows,
): Partial<LlmStatsSourceData> {
	return Object.fromEntries(
		BENCHMARK_SCORE_SOURCE_BINDINGS.map(({ sourceDataKey, sourceRowsKey }) => {
			const sourceRows = rows[sourceRowsKey as keyof LlmStatsSourceRows] as
				| readonly BenchmarkScoreRow[]
				| undefined;
			if (!Array.isArray(sourceRows)) {
				throw new Error(
					`Benchmark score source rows are missing: ${sourceRowsKey}`,
				);
			}
			return [
				sourceDataKey,
				{
					rows: sourceRows,
					rowsByModelName: buildBenchmarkScoreMap(sourceRows),
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
	const aleBenchSourceDefaultRows = summarizeAleBenchSourceDefaultRows(
		rows.aleBenchConfigurationRows,
	);
	const benchmarkScoreSources = buildBenchmarkScoreSources(rows);
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
		...benchmarkScoreSources,
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
			sourceDefaultRows: aleBenchSourceDefaultRows,
			rowsByModelName: buildBenchmarkModelMap(aleBenchSourceDefaultRows),
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
