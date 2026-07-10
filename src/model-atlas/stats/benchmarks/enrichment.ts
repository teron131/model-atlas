/** Benchmark enrichment is the single bridge from source lookup maps to evaluation and scoring-source fields. */

import { modelNameIdentityKey } from "../../matcher/name-tokens";
import { normalizeElo } from "../../math-utils";
import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../../scrapers/agents-last-exam";
import {
	type ArtificialAnalysisEvaluationResourceByBenchmark,
	type ArtificialAnalysisEvaluationResourceRow,
	findArtificialAnalysisEvaluationResourceRow,
} from "../../scrapers/artificial-analysis/benchmark-resources";
import { findBlueprintBenchScore } from "../../scrapers/blueprint-bench";
import { findBrowseCompScore } from "../../scrapers/browsecomp";
import { findGdpPdfScore } from "../../scrapers/gdp-pdf";
import { findRiemannBenchScore } from "../../scrapers/riemann-bench";
import { findToolathlonScore } from "../../scrapers/toolathlon";
import { findValsIndexScore } from "../../scrapers/vals/index-benchmark";
import {
	asRecord,
	modelSlugFromModelId,
	normalizeModelToken,
} from "../../shared";
import type { LlmStatsScoringSources, LlmStatsSourceData } from "../types";
import {
	findTerminalBenchAggregate,
	terminalBenchAggregateRow,
} from "./terminal-bench";

export type BenchmarkEnrichmentLookups = {
	agentsLastExam: Pick<
		LlmStatsSourceData["agentsLastExam"],
		"scoreByModelName"
	>;
	artificialAnalysisEvaluationResources: Pick<
		LlmStatsSourceData["artificialAnalysisEvaluationResources"],
		"observationByModelName" | "defaultEffortByModelName"
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
	const identityKeys = new Set<string>();
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = scoreByModelName.get(normalizeModelToken(candidateName));
		if (row != null) {
			return row;
		}
		const identityKey = modelNameIdentityKey(candidateName);
		if (identityKey.length > 0) {
			identityKeys.add(identityKey);
		}
	}
	for (const [sourceName, row] of scoreByModelName) {
		const identityKey = modelNameIdentityKey(sourceName);
		if (identityKey.length > 0 && identityKeys.has(identityKey)) {
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

function artificialAnalysisResourceEnrichment(
	modelNameCandidates: unknown[],
	rowsByBenchmark: ArtificialAnalysisEvaluationResourceByBenchmark,
	baseEvaluations: Record<string, unknown> = {},
): BenchmarkEnrichment {
	const evaluations: Record<string, unknown> = {};
	const scoringSources: NonNullable<LlmStatsScoringSources> = {};
	const artificialAnalysisResourceLookup = {
		modelNameCandidates,
		rowsByBenchmark,
	};
	for (const key of Object.keys(baseEvaluations)) {
		const resourceRow = findArtificialAnalysisEvaluationResourceRow(
			key,
			modelNameCandidates,
			rowsByBenchmark,
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
	const terminalBenchResourceRow = findArtificialAnalysisEvaluationResourceRow(
		"terminalbench_v21",
		modelNameCandidates,
		rowsByBenchmark,
	);
	const terminalBench = terminalBenchAggregateRow({
		artificialAnalysisScore: baseEvaluations.terminalbench_v21,
		resourceRow: terminalBenchResourceRow,
	});
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
	return { evaluations, scoringSources };
}

/** Enriches one matched effort observation only with effort-specific AA resource rows. */
export function benchmarkObservationEnrichment(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
	baseEvaluations: Record<string, unknown> = {},
): BenchmarkEnrichment {
	return artificialAnalysisResourceEnrichment(
		modelNameCandidates,
		lookups.artificialAnalysisEvaluationResources.observationByModelName,
		baseEvaluations,
	);
}

/** Enriches one aggregate row with default-effort and effort-unspecified benchmark sources. */
export function benchmarkAggregateEnrichment(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
	baseEvaluations: Record<string, unknown> = {},
): BenchmarkEnrichment {
	const { evaluations, scoringSources } = artificialAnalysisResourceEnrichment(
		modelNameCandidates,
		lookups.artificialAnalysisEvaluationResources.defaultEffortByModelName,
		baseEvaluations,
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
				lookups.artificialAnalysisEvaluationResources.defaultEffortByModelName,
			harnessRowsByModel: lookups.valsTerminalBench.scoreByModelName,
		},
		baseEvaluations.terminalbench_v21,
	);
	if (terminalBench != null) {
		evaluations.terminalbench_v21 = terminalBench.score;
		scoringSources.terminalbench_v21 = terminalBench;
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

	const deepSWEScore = findSourceRow(
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

/** Attaches supplemental benchmark aggregates only after effort observations have collapsed. */
export function enrichAggregatedModelRowsWithBenchmarks(
	rows: Record<string, unknown>[],
	lookups: BenchmarkEnrichmentLookups,
): Record<string, unknown>[] {
	return rows.map((row) => {
		const baseEvaluations = asRecord(row.evaluations);
		const benchmarkFields = benchmarkAggregateEnrichment(
			[
				row.id,
				row.openrouter_id,
				modelSlugFromModelId(row.id),
				row.name,
				row.artificial_analysis_id,
				row.artificial_analysis_slug,
			],
			lookups,
			baseEvaluations,
		);
		const evaluations = {
			...baseEvaluations,
			...benchmarkFields.evaluations,
		};
		const scoringSources = {
			...asRecord(row.scoring_sources),
			...benchmarkFields.scoringSources,
		};
		return {
			...row,
			...(Object.keys(evaluations).length === 0 ? {} : { evaluations }),
			...(Object.keys(scoringSources).length === 0
				? {}
				: { scoring_sources: scoringSources }),
		};
	});
}
