/** Live source-data loading owns parallel scraper fetches and the lookup maps used by matching and scoring. */

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
import {
	getModelsDevSourceStats,
	processModelsDevPayload,
} from "../scrapers/models-dev";
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
	buildArtificialAnalysisRetainKeys,
	isoDateDaysAgo,
	MODELS_DEV_LOOKBACK_DAYS,
	pickPreferredModelsDevRows,
} from "./source-policy";
import type {
	ArtificialAnalysisModel,
	LlmStatsSourceData,
	ModelsDevModel,
} from "./types";

function buildModelsDevById(
	modelsDevModels: ModelsDevModel[],
): Map<string, ModelsDevModel> {
	return new Map(
		modelsDevModels.map((modelsDevModel) => [
			modelsDevModel.model_id,
			modelsDevModel,
		]),
	);
}

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
	const deepSWEDefaultEffortRows =
		summarizeDeepSWEDefaultEffortRows(deepSWEEffortRows);
	const gdpPdfRows = gdpPdfStats.data;
	const riemannBenchRows = riemannBenchStats.data;
	const toolathlonRows = toolathlonStats.data;
	const valsIndexRows = valsIndexStats.model_scores;
	const valsTerminalBenchRows = valsTerminalBenchStats.model_scores;
	const retainKeys = buildArtificialAnalysisRetainKeys(artificialAnalysisRows);
	const modelsDevModels = processModelsDevPayload(
		modelsDevStats.payload,
		isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		retainKeys,
	);
	const preferredModelsDevModels = pickPreferredModelsDevRows(modelsDevModels);
	return {
		artificialAnalysis: {
			rows: artificialAnalysisRows,
			bySlug: buildArtificialAnalysisBySlug(artificialAnalysisRows),
		},
		artificialAnalysisEvaluationResources: {
			rows: artificialAnalysisEvaluationResourceRows,
			observationByModelName: buildArtificialAnalysisObservationResourceMap(
				artificialAnalysisEvaluationResourceRows,
			),
			defaultEffortByModelName: buildArtificialAnalysisDefaultEffortResourceMap(
				artificialAnalysisEvaluationResourceRows,
			),
		},
		modelsDev: {
			rows: preferredModelsDevModels,
			byId: buildModelsDevById(preferredModelsDevModels),
		},
		agentsLastExam: {
			rows: agentsLastExamRows,
			scoreByModelName: buildAgentsLastExamMap(agentsLastExamRows),
		},
		blueprintBench: {
			rows: blueprintBenchRows,
			scoreByModelName: buildBlueprintBenchMap(blueprintBenchRows),
		},
		browseComp: {
			rows: browseCompRows,
			scoreByModelName: buildBrowseCompMap(browseCompRows),
		},
		cursorBench: {
			rows: cursorBenchRows,
			scoreByModelName: buildCursorBenchMap(cursorBenchRows),
		},
		deepSWE: {
			effortRows: deepSWEEffortRows,
			defaultEffortRows: deepSWEDefaultEffortRows,
			scoreByModelName: buildDeepSWEMap(deepSWEDefaultEffortRows),
		},
		gdpPdf: {
			rows: gdpPdfRows,
			scoreByModelName: buildGdpPdfMap(gdpPdfRows),
		},
		riemannBench: {
			rows: riemannBenchRows,
			scoreByModelName: buildRiemannBenchMap(riemannBenchRows),
		},
		toolathlon: {
			rows: toolathlonRows,
			scoreByModelName: buildToolathlonMap(toolathlonRows),
		},
		valsIndex: {
			rows: valsIndexRows,
			scoreByModelName: buildValsIndexMap(valsIndexRows),
		},
		valsTerminalBench: {
			rows: valsTerminalBenchRows,
			scoreByModelName: buildTerminalBenchMap(valsTerminalBenchRows),
		},
	};
}
