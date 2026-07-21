/** Persisted snapshot rows are adapted into the shared normalized source-data contract. */

import { preferredDeepSWELeaderboardRows } from "../../scrapers/deep-swe";
import { buildSourceData } from "../../stats/source-data";
import type { LlmStatsSourceData } from "../../stats/types";
import type { SourceSnapshots } from "../types";

/** Restored source rows rebuild lookup maps without refetching external benchmark pages. */
export function cachedSourceDataFromSnapshots(
	snapshots: SourceSnapshots,
): LlmStatsSourceData {
	return buildSourceData({
		artificialAnalysisRows: snapshots.artificialAnalysisSelectedRows,
		artificialAnalysisEvaluationResourceRows:
			snapshots.artificialAnalysisEvaluationResourceRows,
		modelsDevModels: snapshots.modelsDevModels,
		agentArenaRows: snapshots.agentArenaModelScoreRows,
		agentsLastExamRows: snapshots.agentsLastExamModelScores,
		aleBenchConfigurationRows: snapshots.aleBenchConfigurationRows,
		blueprintBenchRows: snapshots.blueprintBenchModelScoreRows,
		browseCompRows: snapshots.browseCompModelScoreRows,
		chartographyRows: snapshots.chartographyRows,
		chessPuzzleRows: snapshots.chessPuzzleRows,
		codeMigrationRows: snapshots.codeMigrationRows,
		cursorBenchRows: snapshots.cursorBenchModelScoreRows,
		cyberBenchRows: snapshots.cyberBenchRows,
		deepSWEEffortRows: preferredDeepSWELeaderboardRows(
			snapshots.deepSWERawRows,
		),
		ebrBenchRows: snapshots.ebrBenchRows,
		embRows: snapshots.embRows,
		enterpriseBenchCoreCraftRows: snapshots.enterpriseBenchCoreCraftRows,
		epochCapabilitiesIndexRows: snapshots.epochCapabilitiesIndexRows,
		financeAgentV2Rows: snapshots.financeAgentV2Rows,
		frontierCodeRows: snapshots.frontierCodeRows,
		frontierMathTier4Rows: snapshots.frontierMathTier4Rows,
		gdpPdfRows: snapshots.gdpPdfModelScoreRows,
		handbookMdRows: snapshots.handbookMdRows,
		harveyLabRows: snapshots.harveyLabModelScoreRows,
		legalResearchRows: snapshots.legalResearchRows,
		mercorApexAgentsRows: snapshots.mercorApexAgentsRows,
		medCodeRows: snapshots.medCodeRows,
		proofBenchRows: snapshots.proofBenchRows,
		programBenchRows: snapshots.programBenchRows,
		publicBenefitsBenchRows: snapshots.publicBenefitsBenchRows,
		riemannBenchRows: snapshots.riemannBenchModelScoreRows,
		terminalBenchRows: snapshots.terminalBenchModelScoreRows,
		toolathlonRows: snapshots.toolathlonModelScoreRows,
		valsIndexRows: snapshots.valsIndexModelScoreRows,
		vendingBench2Rows: snapshots.vendingBench2ModelScoreRows,
		vibeCodeRows: snapshots.vibeCodeRows,
		weirdMlRows: snapshots.weirdMlRows,
	});
}
