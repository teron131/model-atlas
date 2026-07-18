/** Normalized source-data assembly owns lookup maps while live loading supplies source rows. */

import { getAgentArenaStats } from "../scrapers/agent-arena";
import {
	buildAgentsLastExamMap,
	getAgentsLastExamStats,
} from "../scrapers/agents-last-exam";
import {
	buildArtificialAnalysisDefaultEffortResourceMap,
	buildArtificialAnalysisObservationResourceMap,
	getArtificialAnalysisEvaluationResourceStats,
} from "../scrapers/artificial-analysis/benchmark-resources";
import { getArtificialAnalysisLeaderboardStats } from "../scrapers/artificial-analysis/leaderboard";
import {
	buildBlueprintBenchMap,
	getBlueprintBenchStats,
} from "../scrapers/blueprint-bench";
import { buildBrowseCompMap, getBrowseCompStats } from "../scrapers/browsecomp";
import {
	buildCursorBenchMap,
	getCursorBenchStats,
} from "../scrapers/cursorbench";
import {
	buildDeepSWEMap,
	getDeepSWELeaderboardStats,
	summarizeDeepSWEDefaultEffortRows,
} from "../scrapers/deep-swe";
import { buildGdpPdfMap, getGdpPdfStats } from "../scrapers/gdp-pdf";
import { getModelsDevSourceStats } from "../scrapers/models-dev";
import {
	buildRiemannBenchMap,
	getRiemannBenchStats,
} from "../scrapers/riemann-bench";
import { buildToolathlonMap, getToolathlonStats } from "../scrapers/toolathlon";
import {
	buildValsIndexMap,
	getValsIndexStats,
} from "../scrapers/vals/index-benchmark";
import {
	buildTerminalBenchMap,
	getTerminalBenchStats,
} from "../scrapers/vals/terminal-bench";
import { getVendingBench2Stats } from "../scrapers/vending-bench-2";
import { buildBenchmarkModelMap, modelSlugFromModelId } from "../shared";
import {
	pickPreferredModelsDevRows,
	selectModelsDevRowsForArtificialAnalysis,
} from "./source-policy";
import type { ArtificialAnalysisModel, LlmStatsSourceData } from "./types";

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

export type LlmStatsSourceRows = {
	agentArenaRows: LlmStatsSourceData["agentArena"]["rows"];
	artificialAnalysisRows: LlmStatsSourceData["artificialAnalysis"]["rows"];
	artificialAnalysisEvaluationResourceRows: LlmStatsSourceData["artificialAnalysisEvaluationResources"]["rows"];
	modelsDevModels: LlmStatsSourceData["modelsDev"]["rows"];
	agentsLastExamRows: LlmStatsSourceData["agentsLastExam"]["rows"];
	blueprintBenchRows: LlmStatsSourceData["blueprintBench"]["rows"];
	browseCompRows: LlmStatsSourceData["browseComp"]["rows"];
	cursorBenchRows: LlmStatsSourceData["cursorBench"]["rows"];
	deepSWEEffortRows: LlmStatsSourceData["deepSWE"]["effortRows"];
	gdpPdfRows: LlmStatsSourceData["gdpPdf"]["rows"];
	riemannBenchRows: LlmStatsSourceData["riemannBench"]["rows"];
	toolathlonRows: LlmStatsSourceData["toolathlon"]["rows"];
	valsIndexRows: LlmStatsSourceData["valsIndex"]["rows"];
	valsTerminalBenchRows: LlmStatsSourceData["valsTerminalBench"]["rows"];
	vendingBench2Rows: LlmStatsSourceData["vendingBench2"]["rows"];
};

/** Both live fetches and persisted snapshots enter matching through this normalized lookup contract. */
export function buildSourceData(rows: LlmStatsSourceRows): LlmStatsSourceData {
	const preferredModelsDevModels = pickPreferredModelsDevRows(
		rows.modelsDevModels,
	);
	const deepSWEDefaultEffortRows = summarizeDeepSWEDefaultEffortRows(
		rows.deepSWEEffortRows,
	);
	return {
		agentArena: {
			rows: rows.agentArenaRows,
			scoreByModelName: buildBenchmarkModelMap(rows.agentArenaRows),
		},
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
		agentsLastExam: {
			rows: rows.agentsLastExamRows,
			scoreByModelName: buildAgentsLastExamMap(rows.agentsLastExamRows),
		},
		blueprintBench: {
			rows: rows.blueprintBenchRows,
			scoreByModelName: buildBlueprintBenchMap(rows.blueprintBenchRows),
		},
		browseComp: {
			rows: rows.browseCompRows,
			scoreByModelName: buildBrowseCompMap(rows.browseCompRows),
		},
		cursorBench: {
			rows: rows.cursorBenchRows,
			scoreByModelName: buildCursorBenchMap(rows.cursorBenchRows),
		},
		deepSWE: {
			effortRows: rows.deepSWEEffortRows,
			defaultEffortRows: deepSWEDefaultEffortRows,
			scoreByModelName: buildDeepSWEMap(deepSWEDefaultEffortRows),
		},
		gdpPdf: {
			rows: rows.gdpPdfRows,
			scoreByModelName: buildGdpPdfMap(rows.gdpPdfRows),
		},
		riemannBench: {
			rows: rows.riemannBenchRows,
			scoreByModelName: buildRiemannBenchMap(rows.riemannBenchRows),
		},
		toolathlon: {
			rows: rows.toolathlonRows,
			scoreByModelName: buildToolathlonMap(rows.toolathlonRows),
		},
		valsIndex: {
			rows: rows.valsIndexRows,
			scoreByModelName: buildValsIndexMap(rows.valsIndexRows),
		},
		valsTerminalBench: {
			rows: rows.valsTerminalBenchRows,
			scoreByModelName: buildTerminalBenchMap(rows.valsTerminalBenchRows),
		},
		vendingBench2: {
			rows: rows.vendingBench2Rows,
			scoreByModelName: buildBenchmarkModelMap(rows.vendingBench2Rows),
		},
	};
}

export async function fetchSourceData(): Promise<LlmStatsSourceData> {
	const [
		agentArenaStats,
		artificialAnalysisStats,
		artificialAnalysisEvaluationResourceStats,
		modelsDevStats,
		agentsLastExamStats,
		blueprintBenchStats,
		browseCompStats,
		cursorBenchStats,
		deepSWEStats,
		gdpPdfStats,
		riemannBenchStats,
		toolathlonStats,
		valsIndexStats,
		valsTerminalBenchStats,
		vendingBench2Stats,
	] = await Promise.all([
		getAgentArenaStats(),
		getArtificialAnalysisLeaderboardStats(),
		getArtificialAnalysisEvaluationResourceStats(),
		getModelsDevSourceStats(),
		getAgentsLastExamStats(),
		getBlueprintBenchStats(),
		getBrowseCompStats(),
		getCursorBenchStats(),
		getDeepSWELeaderboardStats(),
		getGdpPdfStats(),
		getRiemannBenchStats(),
		getToolathlonStats(),
		getValsIndexStats(),
		getTerminalBenchStats(),
		getVendingBench2Stats(),
	]);
	const agentArenaRows = agentArenaStats.data;
	const artificialAnalysisRows = artificialAnalysisStats.data;
	const artificialAnalysisEvaluationResourceRows =
		artificialAnalysisEvaluationResourceStats.data;
	const agentsLastExamRows = agentsLastExamStats.data;
	const blueprintBenchRows = blueprintBenchStats.data;
	const browseCompRows = browseCompStats.data;
	const cursorBenchRows = cursorBenchStats.data;
	const deepSWEEffortRows = deepSWEStats.data;
	const gdpPdfRows = gdpPdfStats.data;
	const riemannBenchRows = riemannBenchStats.data;
	const toolathlonRows = toolathlonStats.data;
	const valsIndexRows = valsIndexStats.model_scores;
	const valsTerminalBenchRows = valsTerminalBenchStats.model_scores;
	const vendingBench2Rows = vendingBench2Stats.data;
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDevStats.payload,
		artificialAnalysisRows,
	);
	return buildSourceData({
		agentArenaRows,
		artificialAnalysisRows,
		artificialAnalysisEvaluationResourceRows,
		modelsDevModels,
		agentsLastExamRows,
		blueprintBenchRows,
		browseCompRows,
		cursorBenchRows,
		deepSWEEffortRows,
		gdpPdfRows,
		riemannBenchRows,
		toolathlonRows,
		valsIndexRows,
		valsTerminalBenchRows,
		vendingBench2Rows,
	});
}
