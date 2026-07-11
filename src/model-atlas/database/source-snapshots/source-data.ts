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
		agentsLastExamRows: snapshots.agentsLastExamModelScores,
		blueprintBenchRows: snapshots.blueprintBenchModelScoreRows,
		browseCompRows: snapshots.browseCompModelScoreRows,
		cursorBenchRows: snapshots.cursorBenchModelScoreRows,
		deepSWEEffortRows: preferredDeepSWELeaderboardRows(
			snapshots.deepSWERawRows,
		),
		gdpPdfRows: snapshots.gdpPdfModelScoreRows,
		riemannBenchRows: snapshots.riemannBenchModelScoreRows,
		toolathlonRows: snapshots.toolathlonModelScoreRows,
		valsIndexRows: snapshots.valsIndexModelScoreRows,
		valsTerminalBenchRows: snapshots.valsTerminalBenchModelScoreRows,
	});
}
