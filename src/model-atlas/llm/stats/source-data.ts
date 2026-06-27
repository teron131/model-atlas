/** Fetch raw Model Atlas benchmark rows and build lookup maps. */

import {
	buildAgentsLastExamScoreByModelName,
	getAgentsLastExamModelScoreStats,
} from "../scrapers/agents-last-exam";
import { getArtificialAnalysisScrapedEvalsOnlyStats } from "../scrapers/artificial-analysis-evals";
import {
	buildAutomationBenchScoreByModelName,
	getAutomationBenchLeaderboardStats,
} from "../scrapers/automation-bench";
import {
	buildBlueprintBenchScoreByModelName,
	getBlueprintBenchModelScoreStats,
} from "../scrapers/blueprint-bench";
import {
	buildBrowseCompScoreByModelName,
	getBrowseCompModelScoreStats,
} from "../scrapers/browsecomp";
import {
	buildCursorBenchScoreByModelName,
	getCursorBenchModelScoreStats,
} from "../scrapers/cursorbench";
import {
	buildDeepSWEScoreByModelName,
	getDeepSWEModelScoreStats,
} from "../scrapers/deep-swe";
import {
	buildGdpPdfScoreByModelName,
	getGdpPdfModelScoreStats,
} from "../scrapers/gdp-pdf";
import {
	getModelsDevSourceStats,
	processModelsDevPayload,
} from "../scrapers/models-dev";
import {
	buildRiemannBenchScoreByModelName,
	getRiemannBenchModelScoreStats,
} from "../scrapers/riemann-bench";
import {
	buildTerminalBenchAccuracyByModelName,
	getTerminalBenchModelMedianAccuracyStats,
} from "../scrapers/terminal-bench";
import {
	buildToolathlonScoreByModelName,
	getToolathlonModelScoreStats,
} from "../scrapers/toolathlon";
import { modelSlugFromModelId } from "../shared";
import {
	buildAaRetainKeys,
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
function buildAaBySlug(
	aaRows: unknown[],
): Map<string, ArtificialAnalysisModel> {
	const aaBySlug = new Map<string, ArtificialAnalysisModel>();
	for (const aaRow of aaRows) {
		const aaModel = aaRow as ArtificialAnalysisModel;
		const aaSlug = modelSlugFromModelId(aaModel.model_id);
		if (aaSlug) {
			aaBySlug.set(aaSlug, aaModel);
		}
	}
	return aaBySlug;
}

/** Fetch source snapshots and precompute lookup maps used by matching and enrichment. */
export async function fetchSourceData(): Promise<LlmStatsSourceData> {
	const [
		aaStats,
		modelsDevSourceStats,
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
		getArtificialAnalysisScrapedEvalsOnlyStats(),
		getModelsDevSourceStats(),
		getAgentsLastExamModelScoreStats(),
		getAutomationBenchLeaderboardStats(),
		getBlueprintBenchModelScoreStats(),
		getBrowseCompModelScoreStats(),
		getCursorBenchModelScoreStats(),
		getDeepSWEModelScoreStats(),
		getGdpPdfModelScoreStats(),
		getRiemannBenchModelScoreStats(),
		getTerminalBenchModelMedianAccuracyStats(),
		getToolathlonModelScoreStats(),
	]);
	const retainKeys = buildAaRetainKeys(aaStats.data);
	const modelsDevModels = processModelsDevPayload(
		modelsDevSourceStats.payload,
		isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		retainKeys,
	);
	const preferredModelsDevModels = pickPreferredModelsDevRows(modelsDevModels);
	return {
		artificialAnalysisRows: aaStats.data,
		preferredModelsDevModels,
		modelsDevById: buildModelsDevById(preferredModelsDevModels),
		artificialAnalysisBySlug: buildAaBySlug(aaStats.data),
		agentsLastExamModelScoreRows: agentsLastExamStats.data,
		agentsLastExamScoreByModelName: buildAgentsLastExamScoreByModelName(
			agentsLastExamStats.data,
		),
		automationBenchModelScoreRows: automationBenchStats.model_scores,
		automationBenchScoreByModelName: buildAutomationBenchScoreByModelName(
			automationBenchStats.model_scores,
		),
		blueprintBenchModelScoreRows: blueprintBenchStats.data,
		blueprintBenchScoreByModelName: buildBlueprintBenchScoreByModelName(
			blueprintBenchStats.data,
		),
		browseCompModelScoreRows: browseCompStats.data,
		browseCompScoreByModelName: buildBrowseCompScoreByModelName(
			browseCompStats.data,
		),
		cursorBenchModelScoreRows: cursorBenchStats.data,
		cursorBenchScoreByModelName: buildCursorBenchScoreByModelName(
			cursorBenchStats.data,
		),
		deepSWEModelScoreRows: deepSWEStats.data,
		deepSWEScoreByModelName: buildDeepSWEScoreByModelName(deepSWEStats.data),
		gdpPdfModelScoreRows: gdpPdfStats.data,
		gdpPdfScoreByModelName: buildGdpPdfScoreByModelName(gdpPdfStats.data),
		riemannBenchModelScoreRows: riemannBenchStats.data,
		riemannBenchScoreByModelName: buildRiemannBenchScoreByModelName(
			riemannBenchStats.data,
		),
		terminalBenchModelScoreRows: terminalBenchStats.data,
		terminalBenchAccuracyByModelName: buildTerminalBenchAccuracyByModelName(
			terminalBenchStats.data,
		),
		toolathlonModelScoreRows: toolathlonStats.data,
		toolathlonScoreByModelName: buildToolathlonScoreByModelName(
			toolathlonStats.data,
		),
	};
}
