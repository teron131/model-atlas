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
		agentArenaRows: snapshots.agentArenaModelScoreRows,
		artificialAnalysisRows: snapshots.artificialAnalysisSelectedRows,
		artificialAnalysisEvaluationResourceRows:
			snapshots.artificialAnalysisEvaluationResourceRows,
		modelsDevModels: snapshots.modelsDevModels,
		agentsLastExamRows: snapshots.agentsLastExamModelScores,
		blueprintBenchRows: snapshots.blueprintBenchModelScoreRows,
		browseCompRows: snapshots.browseCompModelScoreRows,
		cursorBenchRows: snapshots.cursorBenchModelScoreRows,
		deepSWEEffortRows: preferredDeepSWELeaderboardRows(
			snapshots.deepSWERawRows,
		),
		gdpPdfRows: snapshots.gdpPdfModelScoreRows,
		mercorApexAgentsRows: snapshots.mercorApexAgentsRows,
		riemannBenchRows: snapshots.riemannBenchModelScoreRows,
		toolathlonRows: snapshots.toolathlonModelScoreRows,
		valsIndexRows: snapshots.valsIndexModelScoreRows,
		valsTerminalBenchRows: snapshots.valsTerminalBenchModelScoreRows,
		vendingBench2Rows: snapshots.vendingBench2ModelScoreRows,
	});
}
