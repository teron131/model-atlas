/** Converts persisted source snapshots into in-memory stats source data. */

import { buildAgentsLastExamMap } from "../../scrapers/agents-last-exam";
import { buildAutomationBenchMap } from "../../scrapers/automation-bench";
import { buildBlueprintBenchMap } from "../../scrapers/blueprint-bench";
import { buildBrowseCompMap } from "../../scrapers/browsecomp";
import { buildCursorBenchMap } from "../../scrapers/cursorbench";
import { buildDeepSWEMap } from "../../scrapers/deep-swe";
import { buildGdpPdfMap } from "../../scrapers/gdp-pdf";
import { buildRiemannBenchMap } from "../../scrapers/riemann-bench";
import { buildTerminalBenchMap } from "../../scrapers/terminal-bench";
import { buildToolathlonMap } from "../../scrapers/toolathlon";
import { modelSlugFromModelId } from "../../shared";
import { pickPreferredModelsDevRows } from "../../stats/source-policy";
import type { LlmStatsSourceData } from "../../stats/types";
import type { SourceSnapshots } from "../types";

/** Builds the lookup maps expected by stats from persisted snapshot row groups. */
export function sourceDataFromSnapshots(
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
		terminalBench: {
			rows: snapshots.terminalBenchModelScores,
			accuracyByModelName: buildTerminalBenchMap(
				snapshots.terminalBenchModelScores,
			),
		},
		toolathlon: {
			rows: snapshots.toolathlonModelScoreRows,
			scoreByModelName: buildToolathlonMap(snapshots.toolathlonModelScoreRows),
		},
	};
}
