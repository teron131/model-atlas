/** Build benchmark evaluation and scoring-source fields from source lookup maps. */

import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../../scrapers/agents-last-exam";
import { findAutomationBenchScoreRow } from "../../scrapers/automation-bench";
import { findBlueprintBenchScore } from "../../scrapers/blueprint-bench";
import { findBrowseCompScore } from "../../scrapers/browsecomp";
import { findDeepSWEModelScore } from "../../scrapers/deep-swe";
import { findGdpPdfScore } from "../../scrapers/gdp-pdf";
import { findRiemannBenchScore } from "../../scrapers/riemann-bench";
import { findToolathlonScore } from "../../scrapers/toolathlon";
import { normalizeModelToken } from "../../shared";
import type { LlmStatsScoringSources, LlmStatsSourceData } from "../types";

export type BenchmarkEnrichmentLookups = {
	agentsLastExam: Pick<
		LlmStatsSourceData["agentsLastExam"],
		"scoreByModelName"
	>;
	automationBench: Pick<
		LlmStatsSourceData["automationBench"],
		"scoreByModelName"
	>;
	blueprintBench: Pick<
		LlmStatsSourceData["blueprintBench"],
		"scoreByModelName"
	>;
	browseComp: Pick<LlmStatsSourceData["browseComp"], "scoreByModelName">;
	cursorBench: Pick<LlmStatsSourceData["cursorBench"], "scoreByModelName">;
	deepSWE: Pick<LlmStatsSourceData["deepSWE"], "scoreByModelName">;
	gdpPdf: Pick<LlmStatsSourceData["gdpPdf"], "scoreByModelName">;
	riemannBench: Pick<LlmStatsSourceData["riemannBench"], "scoreByModelName">;
	terminalBench: Pick<
		LlmStatsSourceData["terminalBench"],
		"accuracyByModelName"
	>;
	toolathlon: Pick<LlmStatsSourceData["toolathlon"], "scoreByModelName">;
};

export type BenchmarkEnrichment = {
	evaluations: Record<string, unknown>;
	scoringSources: NonNullable<LlmStatsScoringSources>;
};

function findSourceRow<T>(
	candidateNames: unknown[],
	scoreByModelName: ReadonlyMap<string, T>,
): T | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = scoreByModelName.get(normalizeModelToken(candidateName));
		if (row != null) {
			return row;
		}
	}
	return null;
}

export function benchmarkEnrichment(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
): BenchmarkEnrichment {
	const evaluations: Record<string, unknown> = {};
	const scoringSources: NonNullable<LlmStatsScoringSources> = {};
	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		lookups.agentsLastExam.scoreByModelName,
	);
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
		scoringSources.agents_last_exam = agentsLastExamScore;
	}

	const automationBenchScore = findAutomationBenchScoreRow(
		modelNameCandidates,
		lookups.automationBench.scoreByModelName,
	);
	if (automationBenchScore != null) {
		evaluations.automation_bench = automationBenchScore.adjusted_score;
		scoringSources.automation_bench = automationBenchScore;
	}

	const blueprintBenchScore = findBlueprintBenchScore(
		modelNameCandidates,
		lookups.blueprintBench.scoreByModelName,
	);
	if (blueprintBenchScore != null) {
		evaluations.blueprint_bench_2 = blueprintBenchScore;
	}

	const browseCompScore = findBrowseCompScore(
		modelNameCandidates,
		lookups.browseComp.scoreByModelName,
	);
	if (browseCompScore != null) {
		evaluations.browsecomp = browseCompScore;
	}

	const cursorBenchRow = findSourceRow(
		modelNameCandidates,
		lookups.cursorBench.scoreByModelName,
	);
	if (cursorBenchRow != null) {
		evaluations.cursorbench = cursorBenchRow.score;
		scoringSources.cursorbench = cursorBenchRow;
	}

	const deepSWEScore = findDeepSWEModelScore(
		modelNameCandidates,
		lookups.deepSWE.scoreByModelName,
	);
	if (deepSWEScore != null) {
		evaluations.deep_swe = deepSWEScore.pass_at_1;
		scoringSources.deep_swe = deepSWEScore;
	}

	const gdpPdfScore = findGdpPdfScore(
		modelNameCandidates,
		lookups.gdpPdf.scoreByModelName,
	);
	if (gdpPdfScore != null) {
		evaluations.gdp_pdf = gdpPdfScore;
	}

	const riemannBenchScore = findRiemannBenchScore(
		modelNameCandidates,
		lookups.riemannBench.scoreByModelName,
	);
	if (riemannBenchScore != null) {
		evaluations.riemann_bench = riemannBenchScore;
	}

	const toolathlonScore = findToolathlonScore(
		modelNameCandidates,
		lookups.toolathlon.scoreByModelName,
	);
	if (toolathlonScore != null) {
		evaluations.toolathlon = toolathlonScore;
	}

	return {
		evaluations,
		scoringSources,
	};
}
