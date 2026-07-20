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
		cursorBenchRows: snapshots.cursorBenchModelScoreRows,
		deepSWEEffortRows: preferredDeepSWELeaderboardRows(
			snapshots.deepSWERawRows,
		),
		ebrBenchRows: snapshots.ebrBenchRows,
		enterpriseBenchCoreCraftRows: snapshots.enterpriseBenchCoreCraftRows,
		epochCapabilitiesIndexRows: snapshots.epochCapabilitiesIndexRows,
		frontierCodeRows: snapshots.frontierCodeRows,
		frontierMathTier4Rows: snapshots.frontierMathTier4Rows,
		gdpPdfRows: snapshots.gdpPdfModelScoreRows,
		handbookMdRows: snapshots.handbookMdRows,
		mercorApexAgentsRows: snapshots.mercorApexAgentsRows,
		proofBenchRows: snapshots.proofBenchRows,
		riemannBenchRows: snapshots.riemannBenchModelScoreRows,
		valsTerminalBenchRows: snapshots.valsTerminalBenchModelScoreRows,
		toolathlonRows: snapshots.toolathlonModelScoreRows,
		valsIndexRows: snapshots.valsIndexModelScoreRows,
		vendingBench2Rows: snapshots.vendingBench2ModelScoreRows,
		weirdMlRows: snapshots.weirdMlRows,
	});
}
