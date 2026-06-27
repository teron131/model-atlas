/** Fetch raw Model Atlas benchmark rows and build lookup maps. */

import {
	buildAgentsLastExamMap,
	getAgentsLastExamStats,
} from "../scrapers/agents-last-exam";
import { getArtificialAnalysisEvalsStats } from "../scrapers/artificial-analysis-evals";
import {
	buildAutomationBenchMap,
	getAutomationBenchStats,
} from "../scrapers/automation-bench";
import {
	buildBlueprintBenchMap,
	getBlueprintBenchStats,
} from "../scrapers/blueprint-bench";
import { buildBrowseCompMap, getBrowseCompStats } from "../scrapers/browsecomp";
import {
	buildCursorBenchMap,
	getCursorBenchStats,
} from "../scrapers/cursorbench";
import { buildDeepSWEMap, getDeepSWEStats } from "../scrapers/deep-swe";
import { buildGdpPdfMap, getGdpPdfStats } from "../scrapers/gdp-pdf";
import {
	getModelsDevSourceStats,
	processModelsDevPayload,
} from "../scrapers/models-dev";
import {
	buildRiemannBenchMap,
	getRiemannBenchStats,
} from "../scrapers/riemann-bench";
import {
	buildTerminalBenchMap,
	getTerminalBenchStats,
} from "../scrapers/terminal-bench";
import { buildToolathlonMap, getToolathlonStats } from "../scrapers/toolathlon";
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

/** Index preferred models.dev rows by canonical model id. */
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

/** Index Artificial Analysis rows by the model slug used for matching. */
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

/** Fetch source snapshots and precompute lookup maps used by matching and enrichment. */
export async function fetchSourceData(): Promise<LlmStatsSourceData> {
	const [
		artificialAnalysisStats,
		modelsDevStats,
		agentsLastExamStats,
		automationBenchStats,
		blueprintBenchStats,
		browseCompStats,
		cursorBenchStats,
		deepSWEStats,
		gdpPdfStats,
		riemannBenchStats,
		terminalBenchStats,
		toolathlonStats,
	] = await Promise.all([
		getArtificialAnalysisEvalsStats(),
		getModelsDevSourceStats(),
		getAgentsLastExamStats(),
		getAutomationBenchStats(),
		getBlueprintBenchStats(),
		getBrowseCompStats(),
		getCursorBenchStats(),
		getDeepSWEStats(),
		getGdpPdfStats(),
		getRiemannBenchStats(),
		getTerminalBenchStats(),
		getToolathlonStats(),
	]);
	const artificialAnalysisRows = artificialAnalysisStats.data;
	const agentsLastExamRows = agentsLastExamStats.data;
	const automationBenchRows = automationBenchStats.model_scores;
	const blueprintBenchRows = blueprintBenchStats.data;
	const browseCompRows = browseCompStats.data;
	const cursorBenchRows = cursorBenchStats.data;
	const deepSWERows = deepSWEStats.data;
	const gdpPdfRows = gdpPdfStats.data;
	const riemannBenchRows = riemannBenchStats.data;
	const terminalBenchRows = terminalBenchStats.data;
	const toolathlonRows = toolathlonStats.data;
	const retainKeys = buildArtificialAnalysisRetainKeys(artificialAnalysisRows);
	const modelsDevModels = processModelsDevPayload(
		modelsDevStats.payload,
		isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		retainKeys,
	);
	const preferredModelsDevModels = pickPreferredModelsDevRows(modelsDevModels);
	return {
		artificialAnalysisRows,
		preferredModelsDevModels,
		modelsDevById: buildModelsDevById(preferredModelsDevModels),
		artificialAnalysisBySlug: buildArtificialAnalysisBySlug(
			artificialAnalysisRows,
		),
		agentsLastExamModelScoreRows: agentsLastExamRows,
		agentsLastExamScoreByModelName: buildAgentsLastExamMap(agentsLastExamRows),
		automationBenchModelScoreRows: automationBenchRows,
		automationBenchScoreByModelName:
			buildAutomationBenchMap(automationBenchRows),
		blueprintBenchModelScoreRows: blueprintBenchRows,
		blueprintBenchScoreByModelName: buildBlueprintBenchMap(blueprintBenchRows),
		browseCompModelScoreRows: browseCompRows,
		browseCompScoreByModelName: buildBrowseCompMap(browseCompRows),
		cursorBenchModelScoreRows: cursorBenchRows,
		cursorBenchScoreByModelName: buildCursorBenchMap(cursorBenchRows),
		deepSWEModelScoreRows: deepSWERows,
		deepSWEScoreByModelName: buildDeepSWEMap(deepSWERows),
		gdpPdfModelScoreRows: gdpPdfRows,
		gdpPdfScoreByModelName: buildGdpPdfMap(gdpPdfRows),
		riemannBenchModelScoreRows: riemannBenchRows,
		riemannBenchScoreByModelName: buildRiemannBenchMap(riemannBenchRows),
		terminalBenchModelScoreRows: terminalBenchRows,
		terminalBenchAccuracyByModelName: buildTerminalBenchMap(terminalBenchRows),
		toolathlonModelScoreRows: toolathlonRows,
		toolathlonScoreByModelName: buildToolathlonMap(toolathlonRows),
	};
}
