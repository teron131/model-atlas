/** Source stage for Model Atlas: fetch Artificial Analysis scraper rows and build lookup maps. */

import { modelSlugFromModelId } from "../shared";
import {
	buildAgentsLastExamScoreByModelName,
	getAgentsLastExamModelScoreStats,
} from "../sources/agents-last-exam-scraper";
import { getArtificialAnalysisScrapedEvalsOnlyStats } from "../sources/artificial-analysis-scraper";
import {
	buildDeepSWEScoreByModelName,
	getDeepSWEModelScoreStats,
} from "../sources/deep-swe-scraper";
import {
	getModelsDevSourceStats,
	processModelsDevPayload,
} from "../sources/models-dev";
import {
	buildTerminalBenchAccuracyByModelName,
	getTerminalBenchModelMedianAccuracyStats,
} from "../sources/terminal-bench-scraper";
import {
	buildAaRetainKeys,
	isoDateDaysAgo,
	MODELS_DEV_LOOKBACK_DAYS,
	pickPreferredModelsDevRows,
} from "./source-policy";
import type {
	ArtificialAnalysisModel,
	ModelsDevModel,
	SourceData,
} from "./types";

/** Build the models dev by id. */
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

/** Build the AA rows by slug. */
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

/** Fetch the source snapshots and precompute the slug/id maps used by later stages. */
export async function fetchSourceData(): Promise<SourceData> {
	const [
		aaStats,
		modelsDevSourceStats,
		deepSWEStats,
		terminalBenchStats,
		agentsLastExamStats,
	] = await Promise.all([
		getArtificialAnalysisScrapedEvalsOnlyStats(),
		getModelsDevSourceStats(),
		getDeepSWEModelScoreStats(),
		getTerminalBenchModelMedianAccuracyStats(),
		getAgentsLastExamModelScoreStats(),
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
	};
}
