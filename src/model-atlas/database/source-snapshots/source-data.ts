/** Converts persisted source snapshots into in-memory stats source data. */

import { buildAgentsLastExamMap } from "../../scrapers/agents-last-exam";
import { buildArtificialAnalysisEvaluationResourceMap } from "../../scrapers/artificial-analysis/evaluation-resources";
import { buildAutomationBenchMap } from "../../scrapers/automation-bench";
import { buildBlueprintBenchMap } from "../../scrapers/blueprint-bench";
import { buildBrowseCompMap } from "../../scrapers/browsecomp";
import { buildCursorBenchMap } from "../../scrapers/cursorbench";
import { buildDeepSWEMap } from "../../scrapers/deep-swe";
import { buildGdpPdfMap } from "../../scrapers/gdp-pdf";
import { buildRiemannBenchMap } from "../../scrapers/riemann-bench";
import { buildToolathlonMap } from "../../scrapers/toolathlon";
import { buildValsIndexMap } from "../../scrapers/vals/index-benchmark";
import { buildTerminalBenchMap } from "../../scrapers/vals/terminal-bench";
import { modelSlugFromModelId } from "../../shared";
import { pickPreferredModelsDevRows } from "../../stats/source-policy";
import type { LlmStatsSourceData } from "../../stats/types";
import type { SourceSnapshots } from "../types";

/** Builds the lookup maps expected by stats from persisted snapshot row groups. */
export function cachedSourceDataFromSnapshots(
	snapshots: SourceSnapshots,
): LlmStatsSourceData {
	const preferredModelsDevModels = pickPreferredModelsDevRows(
		snapshots.modelsDevModels,
	);
	return {
		artificialAnalysis: {
			rows: snapshots.artificialAnalysisSelectedRows,
			bySlug: new Map(
				snapshots.artificialAnalysisSelectedRows.flatMap((row) => {
					const modelId =
						typeof row.model_id === "string" ? row.model_id : null;
					const slug = modelSlugFromModelId(modelId);
					return slug == null ? [] : [[slug, row]];
				}),
			),
		},
		artificialAnalysisEvaluationResources: {
			rows: snapshots.artificialAnalysisEvaluationResourceRows,
			scoreByModelName: buildArtificialAnalysisEvaluationResourceMap(
				snapshots.artificialAnalysisEvaluationResourceRows,
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
		agentsLastExam: {
			rows: snapshots.agentsLastExamModelScores,
			scoreByModelName: buildAgentsLastExamMap(
				snapshots.agentsLastExamModelScores,
			),
		},
		automationBench: {
			rows: [],
			scoreByModelName: buildAutomationBenchMap([]),
		},
		blueprintBench: {
			rows: snapshots.blueprintBenchModelScoreRows,
			scoreByModelName: buildBlueprintBenchMap(
				snapshots.blueprintBenchModelScoreRows,
			),
		},
		browseComp: {
			rows: snapshots.browseCompModelScoreRows,
			scoreByModelName: buildBrowseCompMap(snapshots.browseCompModelScoreRows),
		},
		cursorBench: {
			rows: snapshots.cursorBenchModelScoreRows,
			scoreByModelName: buildCursorBenchMap(
				snapshots.cursorBenchModelScoreRows,
			),
		},
		deepSWE: {
			rows: snapshots.deepSWEModelScoreRows,
			scoreByModelName: buildDeepSWEMap(snapshots.deepSWEModelScoreRows),
		},
		gdpPdf: {
			rows: snapshots.gdpPdfModelScoreRows,
			scoreByModelName: buildGdpPdfMap(snapshots.gdpPdfModelScoreRows),
		},
		riemannBench: {
			rows: snapshots.riemannBenchModelScoreRows,
			scoreByModelName: buildRiemannBenchMap(
				snapshots.riemannBenchModelScoreRows,
			),
		},
		toolathlon: {
			rows: snapshots.toolathlonModelScoreRows,
			scoreByModelName: buildToolathlonMap(snapshots.toolathlonModelScoreRows),
		},
		valsIndex: {
			rows: snapshots.valsIndexModelScoreRows,
			scoreByModelName: buildValsIndexMap(snapshots.valsIndexModelScoreRows),
		},
		valsTerminalBench: {
			rows: snapshots.valsTerminalBenchModelScoreRows,
			scoreByModelName: buildTerminalBenchMap(
				snapshots.valsTerminalBenchModelScoreRows,
			),
		},
	};
}
