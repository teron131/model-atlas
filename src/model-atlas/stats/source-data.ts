/** Fetch raw Model Atlas benchmark rows and build lookup maps. */

import {
	buildAgentsLastExamMap,
	getAgentsLastExamStats,
} from "../scrapers/agents-last-exam";
import { getArtificialAnalysisEvalsStats } from "../scrapers/artificial-analysis/evals";
import {
	buildArtificialAnalysisEvaluationResourceMap,
	getArtificialAnalysisEvaluationResourceStats,
} from "../scrapers/artificial-analysis/evaluation-resources";
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
import { buildToolathlonMap, getToolathlonStats } from "../scrapers/toolathlon";
import {
	buildValsIndexMap,
	getValsIndexStats,
} from "../scrapers/vals/index-benchmark";
import {
	buildTerminalBenchValsMap,
	getTerminalBenchValsStats,
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
		automationBenchStats,
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
		getArtificialAnalysisEvalsStats(),
		getArtificialAnalysisEvaluationResourceStats(),
		getModelsDevSourceStats(),
		getAgentsLastExamStats(),
		getAutomationBenchStats(),
		getBlueprintBenchStats(),
		getBrowseCompStats(),
		getCursorBenchStats(),
		getDeepSWEStats(),
		getGdpPdfStats(),
		getRiemannBenchStats(),
		getToolathlonStats(),
		getValsIndexStats(),
		getTerminalBenchValsStats(),
	]);
	const artificialAnalysisRows = artificialAnalysisStats.data;
	const artificialAnalysisEvaluationResourceRows =
		artificialAnalysisEvaluationResourceStats.data;
	const agentsLastExamRows = agentsLastExamStats.data;
	const automationBenchRows = automationBenchStats.model_scores;
	const blueprintBenchRows = blueprintBenchStats.data;
	const browseCompRows = browseCompStats.data;
	const cursorBenchRows = cursorBenchStats.data;
	const deepSWERows = deepSWEStats.data;
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
			scoreByModelName: buildArtificialAnalysisEvaluationResourceMap(
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
		automationBench: {
			rows: automationBenchRows,
			scoreByModelName: buildAutomationBenchMap(automationBenchRows),
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
			rows: deepSWERows,
			scoreByModelName: buildDeepSWEMap(deepSWERows),
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
			scoreByModelName: buildTerminalBenchValsMap(valsTerminalBenchRows),
		},
	};
}
