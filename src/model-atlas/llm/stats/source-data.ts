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
	getModelsDevSourceStats,
	processModelsDevPayload,
} from "../scrapers/models-dev";
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
		deepSWEStats,
		terminalBenchStats,
		agentsLastExamStats,
		automationBenchStats,
		browseCompStats,
		toolathlonStats,
		cursorBenchStats,
	] = await Promise.all([
		getArtificialAnalysisScrapedEvalsOnlyStats(),
		getModelsDevSourceStats(),
		getDeepSWEModelScoreStats(),
		getTerminalBenchModelMedianAccuracyStats(),
		getAgentsLastExamModelScoreStats(),
		getAutomationBenchLeaderboardStats(),
		getBrowseCompModelScoreStats(),
		getToolathlonModelScoreStats(),
		getCursorBenchModelScoreStats(),
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
		deepSWEModelScoreRows: deepSWEStats.data,
		deepSWEScoreByModelName: buildDeepSWEScoreByModelName(deepSWEStats.data),
		terminalBenchAccuracyByModelName: buildTerminalBenchAccuracyByModelName(
			terminalBenchStats.data,
		),
		agentsLastExamModelScoreRows: agentsLastExamStats.data,
		agentsLastExamScoreByModelName: buildAgentsLastExamScoreByModelName(
			agentsLastExamStats.data,
		),
		automationBenchModelScoreRows: automationBenchStats.model_scores,
		automationBenchScoreByModelName: buildAutomationBenchScoreByModelName(
			automationBenchStats.model_scores,
		),
		browseCompModelScoreRows: browseCompStats.data,
		browseCompScoreByModelName: buildBrowseCompScoreByModelName(
			browseCompStats.data,
		),
		toolathlonModelScoreRows: toolathlonStats.data,
		toolathlonScoreByModelName: buildToolathlonScoreByModelName(
			toolathlonStats.data,
		),
		cursorBenchModelScoreRows: cursorBenchStats.data,
		cursorBenchScoreByModelName: buildCursorBenchScoreByModelName(
			cursorBenchStats.data,
		),
	};
}
