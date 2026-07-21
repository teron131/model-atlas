/** Normalized source-data assembly owns lookup maps while live loading supplies source rows. */

import { getAgentArenaStats } from "../scrapers/agent-arena";
import {
	buildAgentsLastExamMap,
	getAgentsLastExamStats,
} from "../scrapers/agents-last-exam";
import {
	getAleBenchStats,
	summarizeAleBenchSourceDefaultRows,
} from "../scrapers/ale-bench";
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
import { getFrontierCodeStats } from "../scrapers/frontier-code";
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
import { getCodeMigrationStats } from "../scrapers/vals/code-migration";
import { getCyberBenchStats } from "../scrapers/vals/cyberbench";
import { getEmbStats } from "../scrapers/vals/emb";
import { getFinanceAgentV2Stats } from "../scrapers/vals/finance-agent-v2";
import {
	buildHarveyLabMap,
	getHarveyLabStats,
} from "../scrapers/vals/harvey-lab";
import {
	buildValsIndexMap,
	getValsIndexStats,
} from "../scrapers/vals/index-benchmark";
import { getLegalResearchStats } from "../scrapers/vals/legal-research";
import { getMedCodeStats } from "../scrapers/vals/medcode";
import { getProgramBenchStats } from "../scrapers/vals/programbench";
import { getProofBenchStats } from "../scrapers/vals/proofbench";
import { getPublicBenefitsBenchStats } from "../scrapers/vals/public-benefits-bench";
import {
	buildTerminalBenchMap,
	getTerminalBenchStats,
} from "../scrapers/vals/terminal-bench";
import { getVibeCodeStats } from "../scrapers/vals/vibe-code";
import { getVendingBench2Stats } from "../scrapers/vending-bench-2";
import { getWeirdMlStats } from "../scrapers/weirdml";
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
	aleBenchConfigurationRows: LlmStatsSourceData["aleBench"]["configurationRows"];
	blueprintBenchRows: LlmStatsSourceData["blueprintBench"]["rows"];
	browseCompRows: LlmStatsSourceData["browseComp"]["rows"];
	chartographyRows: LlmStatsSourceData["chartography"]["rows"];
	chessPuzzleRows: LlmStatsSourceData["chessPuzzles"]["rows"];
	codeMigrationRows: LlmStatsSourceData["codeMigration"]["rows"];
	cursorBenchRows: LlmStatsSourceData["cursorBench"]["rows"];
	cyberBenchRows: LlmStatsSourceData["cyberBench"]["rows"];
	deepSWEEffortRows: LlmStatsSourceData["deepSWE"]["effortRows"];
	ebrBenchRows: LlmStatsSourceData["ebrBench"]["rows"];
	embRows: LlmStatsSourceData["emb"]["rows"];
	enterpriseBenchCoreCraftRows: LlmStatsSourceData["enterpriseBenchCoreCraft"]["rows"];
	epochCapabilitiesIndexRows: LlmStatsSourceData["epochCapabilitiesIndex"]["rows"];
	financeAgentV2Rows: LlmStatsSourceData["financeAgentV2"]["rows"];
	frontierCodeRows: LlmStatsSourceData["frontierCode"]["rows"];
	frontierMathTier4Rows: LlmStatsSourceData["frontierMathTier4"]["rows"];
	gdpPdfRows: LlmStatsSourceData["gdpPdf"]["rows"];
	handbookMdRows: LlmStatsSourceData["handbookMd"]["rows"];
	harveyLabRows: LlmStatsSourceData["harveyLab"]["rows"];
	legalResearchRows: LlmStatsSourceData["legalResearch"]["rows"];
	medCodeRows: LlmStatsSourceData["medCode"]["rows"];
	mercorApexAgentsRows: MercorApexAgentsRow[];
	programBenchRows: LlmStatsSourceData["programBench"]["rows"];
	proofBenchRows: LlmStatsSourceData["proofBench"]["rows"];
	publicBenefitsBenchRows: LlmStatsSourceData["publicBenefitsBench"]["rows"];
	riemannBenchRows: LlmStatsSourceData["riemannBench"]["rows"];
	terminalBenchRows: LlmStatsSourceData["terminalBench"]["rows"];
	toolathlonRows: LlmStatsSourceData["toolathlon"]["rows"];
	valsIndexRows: LlmStatsSourceData["valsIndex"]["rows"];
	vendingBench2Rows: LlmStatsSourceData["vendingBench2"]["rows"];
	vibeCodeRows: LlmStatsSourceData["vibeCode"]["rows"];
	weirdMlRows: LlmStatsSourceData["weirdMl"]["rows"];
};

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
		browseComp: {
			rows: rows.browseCompRows,
			rowsByModelName: buildBrowseCompMap(rows.browseCompRows),
		},
		chartography: {
			rows: rows.chartographyRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.chartographyRows),
		},
		chessPuzzles: {
			rows: rows.chessPuzzleRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.chessPuzzleRows),
		},
		codeMigration: {
			rows: rows.codeMigrationRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.codeMigrationRows),
		},
		cursorBench: {
			rows: rows.cursorBenchRows,
			rowsByModelName: buildCursorBenchMap(rows.cursorBenchRows),
		},
		cyberBench: {
			rows: rows.cyberBenchRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.cyberBenchRows),
		},
		deepSWE: {
			effortRows: rows.deepSWEEffortRows,
			defaultEffortRows: deepSweDefaultEffortRows,
			rowsByModelName: buildDeepSWEMap(deepSweDefaultEffortRows),
		},
		ebrBench: {
			rows: rows.ebrBenchRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.ebrBenchRows),
		},
		emb: {
			rows: rows.embRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.embRows),
		},
		enterpriseBenchCoreCraft: {
			rows: rows.enterpriseBenchCoreCraftRows,
			rowsByModelName: buildBenchmarkScoreMap(
				rows.enterpriseBenchCoreCraftRows,
			),
		},
		epochCapabilitiesIndex: {
			rows: rows.epochCapabilitiesIndexRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.epochCapabilitiesIndexRows),
		},
		financeAgentV2: {
			rows: rows.financeAgentV2Rows,
			rowsByModelName: buildBenchmarkScoreMap(rows.financeAgentV2Rows),
		},
		frontierCode: {
			rows: rows.frontierCodeRows,
			rowsByModelName: buildBenchmarkModelMap(rows.frontierCodeRows),
		},
		frontierMathTier4: {
			rows: rows.frontierMathTier4Rows,
			rowsByModelName: buildBenchmarkScoreMap(rows.frontierMathTier4Rows),
		},
		gdpPdf: {
			rows: rows.gdpPdfRows,
			rowsByModelName: buildGdpPdfMap(rows.gdpPdfRows),
		},
		handbookMd: {
			rows: rows.handbookMdRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.handbookMdRows),
		},
		harveyLab: {
			rows: rows.harveyLabRows,
			rowsByModelName: buildHarveyLabMap(rows.harveyLabRows),
		},
		legalResearch: {
			rows: rows.legalResearchRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.legalResearchRows),
		},
		medCode: {
			rows: rows.medCodeRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.medCodeRows),
		},
		mercorApexAgents: {
			rows: rows.mercorApexAgentsRows,
			rowsByModelName: buildBenchmarkModelMap(rows.mercorApexAgentsRows),
		},
		programBench: {
			rows: rows.programBenchRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.programBenchRows),
		},
		proofBench: {
			rows: rows.proofBenchRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.proofBenchRows),
		},
		publicBenefitsBench: {
			rows: rows.publicBenefitsBenchRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.publicBenefitsBenchRows),
		},
		riemannBench: {
			rows: rows.riemannBenchRows,
			rowsByModelName: buildRiemannBenchMap(rows.riemannBenchRows),
		},
		terminalBench: {
			rows: rows.terminalBenchRows,
			rowsByModelName: buildTerminalBenchMap(rows.terminalBenchRows),
		},
		toolathlon: {
			rows: rows.toolathlonRows,
			rowsByModelName: buildToolathlonMap(rows.toolathlonRows),
		},
		valsIndex: {
			rows: rows.valsIndexRows,
			rowsByModelName: buildValsIndexMap(rows.valsIndexRows),
		},
		vendingBench2: {
			rows: rows.vendingBench2Rows,
			rowsByModelName: buildBenchmarkModelMap(rows.vendingBench2Rows),
		},
		vibeCode: {
			rows: rows.vibeCodeRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.vibeCodeRows),
		},
		weirdMl: {
			rows: rows.weirdMlRows,
			rowsByModelName: buildBenchmarkScoreMap(rows.weirdMlRows),
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
		aleBenchStats,
		blueprintBenchStats,
		browseCompStats,
		chartographyStats,
		chessPuzzleStats,
		codeMigrationStats,
		cursorBenchStats,
		cyberBenchStats,
		deepSweStats,
		ebrBenchStats,
		embStats,
		enterpriseBenchCoreCraftStats,
		epochCapabilitiesIndexStats,
		financeAgentV2Stats,
		frontierCodeStats,
		frontierMathTier4Stats,
		gdpPdfStats,
		handbookMdStats,
		harveyLabStats,
		legalResearchStats,
		medCodeStats,
		mercorApexAgentsStats,
		programBenchStats,
		proofBenchStats,
		publicBenefitsBenchStats,
		riemannBenchStats,
		terminalBenchStats,
		toolathlonStats,
		valsIndexStats,
		vendingBench2Stats,
		vibeCodeStats,
		weirdMlStats,
	] = await Promise.all([
		getArtificialAnalysisLeaderboardStats(),
		getArtificialAnalysisEvaluationResourceStats(),
		getModelsDevSourceStats(),
		getAgentArenaStats(),
		getAgentsLastExamStats(),
		getAleBenchStats(),
		getBlueprintBenchStats(),
		getBrowseCompStats(),
		getChartographyStats(),
		getEpochChessPuzzleStats(),
		getCodeMigrationStats(),
		getCursorBenchStats(),
		getCyberBenchStats(),
		getDeepSWELeaderboardStats(),
		getEpochEbrBenchStats(),
		getEmbStats(),
		getEnterpriseBenchCoreCraftStats(),
		getEpochCapabilitiesIndexStats(),
		getFinanceAgentV2Stats(),
		getFrontierCodeStats(),
		getEpochFrontierMathTier4Stats(),
		getGdpPdfStats(),
		getHandbookMdStats(),
		getHarveyLabStats(),
		getLegalResearchStats(),
		getMedCodeStats(),
		getMercorApexAgentsStats(),
		getProgramBenchStats(),
		getProofBenchStats(),
		getPublicBenefitsBenchStats(),
		getRiemannBenchStats(),
		getTerminalBenchStats(),
		getToolathlonStats(),
		getValsIndexStats(),
		getVendingBench2Stats(),
		getVibeCodeStats(),
		getWeirdMlStats(),
	]);
	const artificialAnalysisRows = artificialAnalysisStats.data;
	const artificialAnalysisEvaluationResourceRows =
		artificialAnalysisEvaluationResourceStats.data;
	const agentArenaRows = agentArenaStats.data;
	const agentsLastExamRows = agentsLastExamStats.data;
	const aleBenchConfigurationRows = aleBenchStats.data;
	const blueprintBenchRows = blueprintBenchStats.data;
	const browseCompRows = browseCompStats.data;
	const chartographyRows = chartographyStats.data;
	const chessPuzzleRows = chessPuzzleStats.data;
	const cursorBenchRows = cursorBenchStats.data;
	const deepSweEffortRows = deepSweStats.data;
	const ebrBenchRows = ebrBenchStats.data;
	const enterpriseBenchCoreCraftRows = enterpriseBenchCoreCraftStats.data;
	const epochCapabilitiesIndexRows = epochCapabilitiesIndexStats.data;
	const frontierCodeRows = frontierCodeStats.data;
	const frontierMathTier4Rows = frontierMathTier4Stats.data;
	const gdpPdfRows = gdpPdfStats.data;
	const handbookMdRows = handbookMdStats.data;
	const harveyLabRows = harveyLabStats.model_scores;
	const mercorApexAgentsRows = mercorApexAgentsStats.data;
	const proofBenchRows = proofBenchStats.data;
	const riemannBenchRows = riemannBenchStats.data;
	const terminalBenchRows = terminalBenchStats.model_scores;
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
		aleBenchConfigurationRows,
		blueprintBenchRows,
		browseCompRows,
		chartographyRows,
		chessPuzzleRows,
		codeMigrationRows: codeMigrationStats.data,
		cursorBenchRows,
		cyberBenchRows: cyberBenchStats.data,
		deepSWEEffortRows: deepSweEffortRows,
		ebrBenchRows,
		embRows: embStats.data,
		enterpriseBenchCoreCraftRows,
		epochCapabilitiesIndexRows,
		financeAgentV2Rows: financeAgentV2Stats.data,
		frontierCodeRows,
		frontierMathTier4Rows,
		gdpPdfRows,
		handbookMdRows,
		harveyLabRows,
		legalResearchRows: legalResearchStats.data,
		medCodeRows: medCodeStats.data,
		mercorApexAgentsRows,
		programBenchRows: programBenchStats.data,
		proofBenchRows,
		publicBenefitsBenchRows: publicBenefitsBenchStats.data,
		riemannBenchRows,
		terminalBenchRows,
		toolathlonRows,
		valsIndexRows,
		vendingBench2Rows,
		vibeCodeRows: vibeCodeStats.data,
		weirdMlRows,
	});
}
