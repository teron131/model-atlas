/** Build benchmark evaluation and scoring-source fields from source lookup maps. */

import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../scrapers/agents-last-exam";
import { findAutomationBenchScoreRow } from "../scrapers/automation-bench";
import { findBlueprintBenchScore } from "../scrapers/blueprint-bench";
import { findBrowseCompScore } from "../scrapers/browsecomp";
import { findCursorBenchScore } from "../scrapers/cursorbench";
import { findDeepSWEModelScore } from "../scrapers/deep-swe";
import { findGdpPdfScore } from "../scrapers/gdp-pdf";
import { findRiemannBenchScore } from "../scrapers/riemann-bench";
import { findTerminalBenchMedianAccuracy } from "../scrapers/terminal-bench";
import { findToolathlonScore } from "../scrapers/toolathlon";
import type { LlmStatsScoringSources, LlmStatsSourceData } from "./types";

export type BenchmarkEnrichmentLookups = Pick<
	LlmStatsSourceData,
	| "deepSWEScoreByModelName"
	| "terminalBenchAccuracyByModelName"
	| "agentsLastExamScoreByModelName"
	| "automationBenchScoreByModelName"
	| "blueprintBenchScoreByModelName"
	| "gdpPdfScoreByModelName"
	| "riemannBenchScoreByModelName"
	| "browseCompScoreByModelName"
	| "toolathlonScoreByModelName"
	| "cursorBenchScoreByModelName"
>;

export type BenchmarkEnrichment = {
	evaluations: Record<string, unknown>;
	scoringSources: NonNullable<LlmStatsScoringSources>;
};

/** Return benchmark evaluations and scoring sources found for one model candidate set. */
export function benchmarkEnrichment(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
): BenchmarkEnrichment {
	const evaluations: Record<string, unknown> = {};
	const scoringSources: NonNullable<LlmStatsScoringSources> = {};
	const deepSWEScore = findDeepSWEModelScore(
		modelNameCandidates,
		lookups.deepSWEScoreByModelName,
	);
	if (deepSWEScore != null) {
		evaluations.deep_swe = deepSWEScore.pass_at_1;
		scoringSources.deep_swe = deepSWEScore;
	}

	const terminalBenchAccuracy = findTerminalBenchMedianAccuracy(
		modelNameCandidates,
		lookups.terminalBenchAccuracyByModelName,
	);
	if (terminalBenchAccuracy != null) {
		evaluations.terminal_bench_2 = terminalBenchAccuracy;
	}

	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		lookups.agentsLastExamScoreByModelName,
	);
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
		scoringSources.agents_last_exam = agentsLastExamScore;
	}

	const automationBenchScore = findAutomationBenchScoreRow(
		modelNameCandidates,
		lookups.automationBenchScoreByModelName,
	);
	if (automationBenchScore != null) {
		evaluations.automation_bench = automationBenchScore.adjusted_score;
		scoringSources.automation_bench = automationBenchScore;
	}

	const blueprintBenchScore = findBlueprintBenchScore(
		modelNameCandidates,
		lookups.blueprintBenchScoreByModelName,
	);
	if (blueprintBenchScore != null) {
		evaluations.blueprint_bench_2 = blueprintBenchScore;
	}

	const gdpPdfScore = findGdpPdfScore(
		modelNameCandidates,
		lookups.gdpPdfScoreByModelName,
	);
	if (gdpPdfScore != null) {
		evaluations.gdp_pdf = gdpPdfScore;
	}

	const riemannBenchScore = findRiemannBenchScore(
		modelNameCandidates,
		lookups.riemannBenchScoreByModelName,
	);
	if (riemannBenchScore != null) {
		evaluations.riemann_bench = riemannBenchScore;
	}

	const browseCompScore = findBrowseCompScore(
		modelNameCandidates,
		lookups.browseCompScoreByModelName,
	);
	if (browseCompScore != null) {
		evaluations.browsecomp = browseCompScore;
	}

	const toolathlonScore = findToolathlonScore(
		modelNameCandidates,
		lookups.toolathlonScoreByModelName,
	);
	if (toolathlonScore != null) {
		evaluations.toolathlon = toolathlonScore;
	}

	const cursorBenchScore = findCursorBenchScore(
		modelNameCandidates,
		lookups.cursorBenchScoreByModelName,
	);
	if (cursorBenchScore != null) {
		evaluations.cursorbench = cursorBenchScore;
	}

	return {
		evaluations,
		scoringSources,
	};
}
