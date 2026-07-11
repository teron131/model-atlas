/** Normalized source-data assembly owns lookup maps while live loading supplies source rows. */

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
	getDeepSWERawLeaderboardStats,
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
import { modelSlugFromModelId } from "../shared";
import {
	pickPreferredModelsDevRows,
	selectModelsDevRowsForArtificialAnalysis,
} from "./source-policy";
import type { ArtificialAnalysisModel, LlmStatsSourceData } from "./types";

function buildArtificialAnalysisBySlug(
	artificialAnalysisRows: unknown[],
): Map<string, ArtificialAnalysisModel> {
	const artificialAnalysisBySlug = new Map<string, ArtificialAnalysisModel>();
	for (const artificialAnalysisRow of artificialAnalysisRows) {
		const artificialAnalysisModel =
			artificialAnalysisRow as ArtificialAnalysisModel;
		const artificialAnalysisSlug = modelSlugFromModelId(
			artificialAnalysisModel.model_id,
		);
		if (artificialAnalysisSlug) {
			artificialAnalysisBySlug.set(
				artificialAnalysisSlug,
				artificialAnalysisModel,
			);
		}
	}
	return artificialAnalysisBySlug;
}

export type LlmStatsSourceRows = {
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
	};
}

export async function fetchSourceData(): Promise<LlmStatsSourceData> {
	const [
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
	] = await Promise.all([
		getArtificialAnalysisLeaderboardStats(),
		getArtificialAnalysisEvaluationResourceStats(),
		getModelsDevSourceStats(),
		getAgentsLastExamStats(),
		getBlueprintBenchStats(),
		getBrowseCompStats(),
		getCursorBenchStats(),
		getDeepSWERawLeaderboardStats(),
		getGdpPdfStats(),
		getRiemannBenchStats(),
		getToolathlonStats(),
		getValsIndexStats(),
		getTerminalBenchStats(),
	]);
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
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDevStats.payload,
		artificialAnalysisRows,
	);
	return buildSourceData({
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
	});
}
