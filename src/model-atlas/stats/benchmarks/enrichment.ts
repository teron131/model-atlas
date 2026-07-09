/** Benchmark enrichment is the single bridge from source lookup maps to evaluation and scoring-source fields. */

import { normalizeElo } from "../../math-utils";
import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../../scrapers/agents-last-exam";
import {
	type ArtificialAnalysisEvaluationResourceByBenchmark,
	type ArtificialAnalysisEvaluationResourceRow,
	findArtificialAnalysisEvaluationResourceRow,
} from "../../scrapers/artificial-analysis/evaluation-resources";
import { findBlueprintBenchScore } from "../../scrapers/blueprint-bench";
import { findBrowseCompScore } from "../../scrapers/browsecomp";
import { findDeepSWEModelScore } from "../../scrapers/deep-swe";
import { findGdpPdfScore } from "../../scrapers/gdp-pdf";
import { findRiemannBenchScore } from "../../scrapers/riemann-bench";
import { findToolathlonScore } from "../../scrapers/toolathlon";
import { findValsIndexScore } from "../../scrapers/vals/index-benchmark";
import { normalizeModelToken } from "../../shared";
import type { LlmStatsScoringSources, LlmStatsSourceData } from "../types";
import { findTerminalBenchAggregate } from "./terminal-bench";

export type BenchmarkEnrichmentLookups = {
	agentsLastExam: Pick<
		LlmStatsSourceData["agentsLastExam"],
		"scoreByModelName"
	>;
	artificialAnalysisEvaluationResources: Pick<
		LlmStatsSourceData["artificialAnalysisEvaluationResources"],
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
	toolathlon: Pick<LlmStatsSourceData["toolathlon"], "scoreByModelName">;
	valsIndex: Pick<LlmStatsSourceData["valsIndex"], "scoreByModelName">;
	valsTerminalBench: Pick<
		LlmStatsSourceData["valsTerminalBench"],
		"scoreByModelName"
	>;
};

export type BenchmarkEnrichment = {
	evaluations: Record<string, unknown>;
	scoringSources: NonNullable<LlmStatsScoringSources>;
};

type ArtificialAnalysisResourceLookup = {
	modelNameCandidates: unknown[];
	rowsByBenchmark: ArtificialAnalysisEvaluationResourceByBenchmark;
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

function addArtificialAnalysisResourceEvaluation(
	evaluations: Record<string, unknown>,
	scoringSources: NonNullable<LlmStatsScoringSources>,
	lookup: ArtificialAnalysisResourceLookup,
	key: string,
	score: (row: ArtificialAnalysisEvaluationResourceRow) => unknown,
): void {
	const row = findArtificialAnalysisEvaluationResourceRow(
		key,
		lookup.modelNameCandidates,
		lookup.rowsByBenchmark,
	);
	if (row == null) {
		return;
	}
	evaluations[key] = score(row);
	scoringSources[key] = row;
}

export function benchmarkEnrichment(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
	baseEvaluations: Record<string, unknown> = {},
): BenchmarkEnrichment {
	const evaluations: Record<string, unknown> = {};
	const scoringSources: NonNullable<LlmStatsScoringSources> = {};
	const artificialAnalysisResourceLookup = {
		modelNameCandidates,
		rowsByBenchmark:
			lookups.artificialAnalysisEvaluationResources.scoreByModelName,
	};
	for (const key of Object.keys(baseEvaluations)) {
		const resourceRow = findArtificialAnalysisEvaluationResourceRow(
			key,
			modelNameCandidates,
			lookups.artificialAnalysisEvaluationResources.scoreByModelName,
		);
		if (resourceRow != null) {
			scoringSources[key] = resourceRow;
		}
	}
	addArtificialAnalysisResourceEvaluation(
		evaluations,
		scoringSources,
		artificialAnalysisResourceLookup,
		"briefcase",
		(row) => normalizeElo(row.score, 500, 2000),
	);
	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		lookups.agentsLastExam.scoreByModelName,
	);
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
		scoringSources.agents_last_exam = agentsLastExamScore;
	}

	const terminalBench = findTerminalBenchAggregate(
		modelNameCandidates,
		{
			artificialAnalysisRowsByBenchmark:
				lookups.artificialAnalysisEvaluationResources.scoreByModelName,
			harnessRowsByModel: lookups.valsTerminalBench.scoreByModelName,
		},
		baseEvaluations.terminalbench_v21,
	);
	if (terminalBench != null) {
		evaluations.terminalbench_v21 = terminalBench.score;
		scoringSources.terminalbench_v21 = terminalBench;
	}

	addArtificialAnalysisResourceEvaluation(
		evaluations,
		scoringSources,
		artificialAnalysisResourceLookup,
		"automation_bench",
		(row) => row.score,
	);
	addArtificialAnalysisResourceEvaluation(
		evaluations,
		scoringSources,
		artificialAnalysisResourceLookup,
		"harvey_lab",
		(row) => row.score,
	);

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

	const valsIndexScore = findValsIndexScore(
		modelNameCandidates,
		lookups.valsIndex.scoreByModelName,
	);
	if (valsIndexScore != null) {
		evaluations.vals_index = valsIndexScore;
	}

	return {
		evaluations,
		scoringSources,
	};
}
