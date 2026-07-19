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
import { buildBenchmarkScoreMap } from "../scrapers/benchmark-score";
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
import { getEpochCapabilitiesIndexStats } from "../scrapers/epoch/capabilities-index";
import { getEpochChessPuzzleStats } from "../scrapers/epoch/chess-puzzles";
import { getEpochEbrBenchStats } from "../scrapers/epoch/ebr-bench";
import { getEpochFrontierMathTier4Stats } from "../scrapers/epoch/frontiermath-tier-4";
import { getWeirdMlStats } from "../scrapers/epoch/weirdml";
import {
	getMercorApexAgentsStats,
	type MercorApexAgentsRow,
} from "../scrapers/mercor-apex-agents";
import { getModelsDevSourceStats } from "../scrapers/models-dev";
import { getChartographyStats } from "../scrapers/surge/chartography";
import { getEnterpriseBenchCoreCraftStats } from "../scrapers/surge/enterprisebench-corecraft";
import { buildGdpPdfMap, getGdpPdfStats } from "../scrapers/surge/gdp-pdf";
import { getHandbookMdStats } from "../scrapers/surge/handbook-md";
import {
	buildRiemannBenchMap,
	getRiemannBenchStats,
} from "../scrapers/surge/riemann-bench";
import { buildToolathlonMap, getToolathlonStats } from "../scrapers/toolathlon";
import {
	buildValsIndexMap,
	getValsIndexStats,
} from "../scrapers/vals/index-benchmark";
import { getProofBenchStats } from "../scrapers/vals/proofbench";
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
	artificialAnalysisRows: LlmStatsSourceData["artificialAnalysis"]["rows"];
	artificialAnalysisEvaluationResourceRows: LlmStatsSourceData["artificialAnalysisEvaluationResources"]["rows"];
	modelsDevModels: LlmStatsSourceData["modelsDev"]["rows"];
	agentArenaRows: LlmStatsSourceData["agentArena"]["rows"];
	agentsLastExamRows: LlmStatsSourceData["agentsLastExam"]["rows"];
	blueprintBenchRows: LlmStatsSourceData["blueprintBench"]["rows"];
	browseCompRows: LlmStatsSourceData["browseComp"]["rows"];
	chartographyRows: LlmStatsSourceData["chartography"]["rows"];
	chessPuzzleRows: LlmStatsSourceData["chessPuzzles"]["rows"];
	cursorBenchRows: LlmStatsSourceData["cursorBench"]["rows"];
	deepSWEEffortRows: LlmStatsSourceData["deepSWE"]["effortRows"];
	ebrBenchRows: LlmStatsSourceData["ebrBench"]["rows"];
	enterpriseBenchCoreCraftRows: LlmStatsSourceData["enterpriseBenchCoreCraft"]["rows"];
	epochCapabilitiesIndexRows: LlmStatsSourceData["epochCapabilitiesIndex"]["rows"];
	frontierMathTier4Rows: LlmStatsSourceData["frontierMathTier4"]["rows"];
	gdpPdfRows: LlmStatsSourceData["gdpPdf"]["rows"];
	handbookMdRows: LlmStatsSourceData["handbookMd"]["rows"];
	mercorApexAgentsRows: MercorApexAgentsRow[];
	proofBenchRows: LlmStatsSourceData["proofBench"]["rows"];
	riemannBenchRows: LlmStatsSourceData["riemannBench"]["rows"];
	valsTerminalBenchRows: LlmStatsSourceData["valsTerminalBench"]["rows"];
	toolathlonRows: LlmStatsSourceData["toolathlon"]["rows"];
	valsIndexRows: LlmStatsSourceData["valsIndex"]["rows"];
	vendingBench2Rows: LlmStatsSourceData["vendingBench2"]["rows"];
	weirdMlRows: LlmStatsSourceData["weirdMl"]["rows"];
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
		agentArena: {
			rows: rows.agentArenaRows,
			scoreByModelName: buildBenchmarkModelMap(rows.agentArenaRows),
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
		chartography: {
			rows: rows.chartographyRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.chartographyRows),
		},
		chessPuzzles: {
			rows: rows.chessPuzzleRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.chessPuzzleRows),
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
		ebrBench: {
			rows: rows.ebrBenchRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.ebrBenchRows),
		},
		enterpriseBenchCoreCraft: {
			rows: rows.enterpriseBenchCoreCraftRows,
			scoreByModelName: buildBenchmarkScoreMap(
				rows.enterpriseBenchCoreCraftRows,
			),
		},
		epochCapabilitiesIndex: {
			rows: rows.epochCapabilitiesIndexRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.epochCapabilitiesIndexRows),
		},
		frontierMathTier4: {
			rows: rows.frontierMathTier4Rows,
			scoreByModelName: buildBenchmarkScoreMap(rows.frontierMathTier4Rows),
		},
		gdpPdf: {
			rows: rows.gdpPdfRows,
			scoreByModelName: buildGdpPdfMap(rows.gdpPdfRows),
		},
		handbookMd: {
			rows: rows.handbookMdRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.handbookMdRows),
		},
		mercorApexAgents: {
			rows: rows.mercorApexAgentsRows,
			scoreByModelName: buildBenchmarkModelMap(rows.mercorApexAgentsRows),
		},
		proofBench: {
			rows: rows.proofBenchRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.proofBenchRows),
		},
		riemannBench: {
			rows: rows.riemannBenchRows,
			scoreByModelName: buildRiemannBenchMap(rows.riemannBenchRows),
		},
		valsTerminalBench: {
			rows: rows.valsTerminalBenchRows,
			scoreByModelName: buildTerminalBenchMap(rows.valsTerminalBenchRows),
		},
		toolathlon: {
			rows: rows.toolathlonRows,
			scoreByModelName: buildToolathlonMap(rows.toolathlonRows),
		},
		valsIndex: {
			rows: rows.valsIndexRows,
			scoreByModelName: buildValsIndexMap(rows.valsIndexRows),
		},
		vendingBench2: {
			rows: rows.vendingBench2Rows,
			scoreByModelName: buildBenchmarkModelMap(rows.vendingBench2Rows),
		},
		weirdMl: {
			rows: rows.weirdMlRows,
			scoreByModelName: buildBenchmarkScoreMap(rows.weirdMlRows),
		},
	};
}

export async function fetchSourceData(): Promise<LlmStatsSourceData> {
	const [
		artificialAnalysisStats,
		artificialAnalysisEvaluationResourceStats,
		modelsDevStats,
		agentArenaStats,
		agentsLastExamStats,
		blueprintBenchStats,
		browseCompStats,
		chartographyStats,
		chessPuzzleStats,
		cursorBenchStats,
		deepSWEStats,
		ebrBenchStats,
		enterpriseBenchCoreCraftStats,
		epochCapabilitiesIndexStats,
		frontierMathTier4Stats,
		gdpPdfStats,
		handbookMdStats,
		mercorApexAgentsStats,
		proofBenchStats,
		riemannBenchStats,
		valsTerminalBenchStats,
		toolathlonStats,
		valsIndexStats,
		vendingBench2Stats,
		weirdMlStats,
	] = await Promise.all([
		getArtificialAnalysisLeaderboardStats(),
		getArtificialAnalysisEvaluationResourceStats(),
		getModelsDevSourceStats(),
		getAgentArenaStats(),
		getAgentsLastExamStats(),
		getBlueprintBenchStats(),
		getBrowseCompStats(),
		getChartographyStats(),
		getEpochChessPuzzleStats(),
		getCursorBenchStats(),
		getDeepSWELeaderboardStats(),
		getEpochEbrBenchStats(),
		getEnterpriseBenchCoreCraftStats(),
		getEpochCapabilitiesIndexStats(),
		getEpochFrontierMathTier4Stats(),
		getGdpPdfStats(),
		getHandbookMdStats(),
		getMercorApexAgentsStats(),
		getProofBenchStats(),
		getRiemannBenchStats(),
		getTerminalBenchStats(),
		getToolathlonStats(),
		getValsIndexStats(),
		getVendingBench2Stats(),
		getWeirdMlStats(),
	]);
	const artificialAnalysisRows = artificialAnalysisStats.data;
	const artificialAnalysisEvaluationResourceRows =
		artificialAnalysisEvaluationResourceStats.data;
	const agentArenaRows = agentArenaStats.data;
	const agentsLastExamRows = agentsLastExamStats.data;
	const blueprintBenchRows = blueprintBenchStats.data;
	const browseCompRows = browseCompStats.data;
	const chartographyRows = chartographyStats.data;
	const chessPuzzleRows = chessPuzzleStats.data;
	const cursorBenchRows = cursorBenchStats.data;
	const deepSWEEffortRows = deepSWEStats.data;
	const ebrBenchRows = ebrBenchStats.data;
	const enterpriseBenchCoreCraftRows = enterpriseBenchCoreCraftStats.data;
	const epochCapabilitiesIndexRows = epochCapabilitiesIndexStats.data;
	const frontierMathTier4Rows = frontierMathTier4Stats.data;
	const gdpPdfRows = gdpPdfStats.data;
	const handbookMdRows = handbookMdStats.data;
	const mercorApexAgentsRows = mercorApexAgentsStats.data;
	const proofBenchRows = proofBenchStats.data;
	const riemannBenchRows = riemannBenchStats.data;
	const valsTerminalBenchRows = valsTerminalBenchStats.model_scores;
	const toolathlonRows = toolathlonStats.data;
	const valsIndexRows = valsIndexStats.model_scores;
	const vendingBench2Rows = vendingBench2Stats.data;
	const weirdMlRows = weirdMlStats.data;
	const modelsDevModels = selectModelsDevRowsForArtificialAnalysis(
		modelsDevStats.payload,
		artificialAnalysisRows,
	);
	return buildSourceData({
		artificialAnalysisRows,
		artificialAnalysisEvaluationResourceRows,
		modelsDevModels,
		agentArenaRows,
		agentsLastExamRows,
		blueprintBenchRows,
		browseCompRows,
		chartographyRows,
		chessPuzzleRows,
		cursorBenchRows,
		deepSWEEffortRows,
		ebrBenchRows,
		enterpriseBenchCoreCraftRows,
		epochCapabilitiesIndexRows,
		frontierMathTier4Rows,
		gdpPdfRows,
		handbookMdRows,
		mercorApexAgentsRows,
		proofBenchRows,
		riemannBenchRows,
		valsTerminalBenchRows,
		toolathlonRows,
		valsIndexRows,
		vendingBench2Rows,
		weirdMlRows,
	});
}
