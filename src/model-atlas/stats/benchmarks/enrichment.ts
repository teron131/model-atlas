/** Benchmark enrichment is the single bridge from source lookup maps to evaluation and scoring-source fields. */

import { modelNameIdentityKey } from "../../matcher";
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
import {
	type BenchmarkScoreByModelName,
	findBenchmarkScoreRow,
} from "../../scrapers/benchmark-score";
import { findBlueprintBenchScore } from "../../scrapers/blueprint-bench";
import { findBrowseCompScore } from "../../scrapers/browsecomp";
import { findGdpPdfScore } from "../../scrapers/surge/gdp-pdf";
import { findRiemannBenchScore } from "../../scrapers/surge/riemann-bench";
import { findToolathlonScore } from "../../scrapers/toolathlon";
import { findValsIndexScore } from "../../scrapers/vals/index-benchmark";
import {
	asRecord,
	type BenchmarkModelRow,
	benchmarkModelEffort,
	canonicalModelKey,
	canonicalReasoningEffort,
	modelSlugFromModelId,
	normalizeModelToken,
	reasoningEffortRank,
} from "../../shared";
import type { LlmStatsScoringSources, LlmStatsSourceData } from "../types";
import {
	findTerminalBenchAggregate,
	terminalBenchAggregateRow,
} from "./terminal-bench";

export type BenchmarkEnrichmentLookups = {
	artificialAnalysisEvaluationResources: Pick<
		LlmStatsSourceData["artificialAnalysisEvaluationResources"],
		"observationByModelName" | "defaultEffortByModelName"
	>;
	agentArena: Pick<LlmStatsSourceData["agentArena"], "scoreByModelName">;
	agentsLastExam: Pick<
		LlmStatsSourceData["agentsLastExam"],
		"scoreByModelName"
	>;
	aleBench: Pick<LlmStatsSourceData["aleBench"], "scoreByModelName">;
	blueprintBench: Pick<
		LlmStatsSourceData["blueprintBench"],
		"scoreByModelName"
	>;
	browseComp: Pick<LlmStatsSourceData["browseComp"], "scoreByModelName">;
	chartography: Pick<LlmStatsSourceData["chartography"], "scoreByModelName">;
	chessPuzzles: Pick<LlmStatsSourceData["chessPuzzles"], "scoreByModelName">;
	cursorBench: Pick<LlmStatsSourceData["cursorBench"], "scoreByModelName">;
	deepSWE: Pick<LlmStatsSourceData["deepSWE"], "scoreByModelName">;
	ebrBench: Pick<LlmStatsSourceData["ebrBench"], "scoreByModelName">;
	enterpriseBenchCoreCraft: Pick<
		LlmStatsSourceData["enterpriseBenchCoreCraft"],
		"scoreByModelName"
	>;
	epochCapabilitiesIndex: Pick<
		LlmStatsSourceData["epochCapabilitiesIndex"],
		"scoreByModelName"
	>;
	frontierCode: Pick<LlmStatsSourceData["frontierCode"], "scoreByModelName">;
	frontierMathTier4: Pick<
		LlmStatsSourceData["frontierMathTier4"],
		"scoreByModelName"
	>;
	gdpPdf: Pick<LlmStatsSourceData["gdpPdf"], "scoreByModelName">;
	handbookMd: Pick<LlmStatsSourceData["handbookMd"], "scoreByModelName">;
	mercorApexAgents: Pick<
		LlmStatsSourceData["mercorApexAgents"],
		"scoreByModelName"
	>;
	proofBench: Pick<LlmStatsSourceData["proofBench"], "scoreByModelName">;
	riemannBench: Pick<LlmStatsSourceData["riemannBench"], "scoreByModelName">;
	valsTerminalBench: Pick<
		LlmStatsSourceData["valsTerminalBench"],
		"scoreByModelName"
	>;
	toolathlon: Pick<LlmStatsSourceData["toolathlon"], "scoreByModelName">;
	valsIndex: Pick<LlmStatsSourceData["valsIndex"], "scoreByModelName">;
	vendingBench2: Pick<LlmStatsSourceData["vendingBench2"], "scoreByModelName">;
	weirdMl: Pick<LlmStatsSourceData["weirdMl"], "scoreByModelName">;
};

export type BenchmarkEnrichment = {
	evaluations: Record<string, unknown>;
	scoringSources: NonNullable<LlmStatsScoringSources>;
};

/** Direct benchmark source rows override duplicate catalog fields without a benchmark-specific registry. */
function mergeAggregateBenchmarkFields(
	baseFields: Record<string, unknown>,
	aggregateFields: Record<string, unknown>,
	benchmarkSources: NonNullable<LlmStatsScoringSources>,
): Record<string, unknown> {
	const fields = { ...aggregateFields, ...baseFields };
	for (const [key, sourceRow] of Object.entries(benchmarkSources)) {
		if (asRecord(sourceRow).benchmark_key === key && key in aggregateFields) {
			fields[key] = aggregateFields[key];
		}
	}
	return fields;
}

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

function addBenchmarkScore(
	evaluations: Record<string, unknown>,
	scoringSources: NonNullable<LlmStatsScoringSources>,
	modelNameCandidates: unknown[],
	targetReasoningEffort: unknown,
	benchmarkKey: string,
	rowsByModel: BenchmarkScoreByModelName,
): void {
	const row = findBenchmarkScoreRow(
		modelNameCandidates,
		targetReasoningEffort,
		rowsByModel,
	);
	if (row != null) {
		evaluations[benchmarkKey] = row.score;
		scoringSources[benchmarkKey] = row;
	}
}

function findAggregateBenchmarkSourceRow<T>(
	candidateNames: unknown[],
	scoreByModelName: ReadonlyMap<string, T>,
): T | null {
	const baseModelCandidates = candidateNames.map((candidateName) =>
		typeof candidateName === "string"
			? benchmarkModelEffort(candidateName).baseModel
			: candidateName,
	);
	return findSourceRow(baseModelCandidates, scoreByModelName);
}

function findEffortBenchmarkSourceRow<T extends BenchmarkModelRow>(
	candidateNames: unknown[],
	targetReasoningEffort: unknown,
	scoreByModelName: ReadonlyMap<string, T>,
): T | null {
	const effort = canonicalReasoningEffort(targetReasoningEffort);
	if (effort == null) {
		return findSourceRow(candidateNames, scoreByModelName);
	}
	const effortCandidates = candidateNames.flatMap((candidateName) => {
		if (typeof candidateName !== "string") {
			return [];
		}
		const baseModel = benchmarkModelEffort(candidateName).baseModel;
		return [`${baseModel} (${effort})`];
	});
	const row = findSourceRow(effortCandidates, scoreByModelName);
	return row?.reasoning_effort === effort ? row : null;
}

/** Adds FrontierCode only when the effort-matched source row is eligible for general-model scoring. */
function addFrontierCodeScore(
	enrichment: BenchmarkEnrichment,
	modelNameCandidates: unknown[],
	targetReasoningEffort: unknown,
	lookup: BenchmarkEnrichmentLookups["frontierCode"],
): void {
	const row = findEffortBenchmarkSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookup.scoreByModelName,
	);
	if (row?.score_eligible !== true) {
		return;
	}
	enrichment.evaluations.frontier_code = row.score;
	enrichment.scoringSources.frontier_code = row;
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

function enrichArtificialAnalysisResources(
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
	addArtificialAnalysisResourceEvaluation(
		evaluations,
		scoringSources,
		artificialAnalysisResourceLookup,
		"itbench_sre",
		(row) => row.score,
	);
	return { evaluations, scoringSources };
}

/** Enriches one matched effort observation only with effort-specific AA resource rows. */
export function enrichBenchmarkObservation(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
	baseEvaluations: Record<string, unknown> = {},
	targetReasoningEffort: unknown = null,
): BenchmarkEnrichment {
	const enrichment = enrichArtificialAnalysisResources(
		modelNameCandidates,
		lookups.artificialAnalysisEvaluationResources.observationByModelName,
		baseEvaluations,
	);
	const mercorRow = findEffortBenchmarkSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.mercorApexAgents.scoreByModelName,
	);
	if (mercorRow != null) {
		enrichment.scoringSources.apex_agents_mercor = mercorRow;
	}
	const aleBenchRow = findEffortBenchmarkSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.aleBench.scoreByModelName,
	);
	if (aleBenchRow != null) {
		enrichment.evaluations.ale_bench = aleBenchRow.score;
		enrichment.scoringSources.ale_bench = aleBenchRow;
	}
	addFrontierCodeScore(
		enrichment,
		modelNameCandidates,
		targetReasoningEffort,
		lookups.frontierCode,
	);
	return enrichment;
}

/** Enriches one aggregate row with default-effort and effort-unspecified benchmark sources. */
export function enrichBenchmarkAggregate(
	modelNameCandidates: unknown[],
	lookups: BenchmarkEnrichmentLookups,
	baseEvaluations: Record<string, unknown> = {},
	targetReasoningEffort: unknown = null,
): BenchmarkEnrichment {
	const { evaluations, scoringSources } = enrichArtificialAnalysisResources(
		modelNameCandidates,
		lookups.artificialAnalysisEvaluationResources.defaultEffortByModelName,
		baseEvaluations,
	);
	const agentArenaRow = findAggregateBenchmarkSourceRow(
		modelNameCandidates,
		lookups.agentArena.scoreByModelName,
	);
	if (agentArenaRow != null) {
		evaluations.agent_arena = agentArenaRow.score;
		scoringSources.agent_arena = agentArenaRow;
	}
	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		lookups.agentsLastExam.scoreByModelName,
	);
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
		scoringSources.agents_last_exam = agentsLastExamScore;
	}
	const aleBenchRow = findEffortBenchmarkSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.aleBench.scoreByModelName,
	);
	if (aleBenchRow != null) {
		evaluations.ale_bench = aleBenchRow.score;
		scoringSources.ale_bench = aleBenchRow;
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
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"chartography",
		lookups.chartography.scoreByModelName,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"chess_puzzles",
		lookups.chessPuzzles.scoreByModelName,
	);
	const cursorBenchRow = findSourceRow(
		modelNameCandidates,
		lookups.cursorBench.scoreByModelName,
	);
	if (cursorBenchRow != null) {
		evaluations.cursorbench = cursorBenchRow.score;
		scoringSources.cursorbench = cursorBenchRow;
	}

	const deepSWERow = findSourceRow(
		modelNameCandidates,
		lookups.deepSWE.scoreByModelName,
	);
	if (deepSWERow != null) {
		evaluations.deep_swe = deepSWERow.pass_at_1;
		scoringSources.deep_swe = deepSWERow;
	}
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"ebr_bench",
		lookups.ebrBench.scoreByModelName,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"enterprisebench_corecraft",
		lookups.enterpriseBenchCoreCraft.scoreByModelName,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"epoch_capabilities_index",
		lookups.epochCapabilitiesIndex.scoreByModelName,
	);
	addFrontierCodeScore(
		{ evaluations, scoringSources },
		modelNameCandidates,
		targetReasoningEffort,
		lookups.frontierCode,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"frontiermath_tier_4",
		lookups.frontierMathTier4.scoreByModelName,
	);
	const gdpPdfScore = findGdpPdfScore(
		modelNameCandidates,
		lookups.gdpPdf.scoreByModelName,
	);
	if (gdpPdfScore != null) {
		evaluations.gdp_pdf = gdpPdfScore;
	}
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"handbook_md",
		lookups.handbookMd.scoreByModelName,
	);
	const mercorRow = findEffortBenchmarkSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.mercorApexAgents.scoreByModelName,
	);
	if (mercorRow != null) {
		scoringSources.apex_agents_mercor = mercorRow;
	}
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"proofbench",
		lookups.proofBench.scoreByModelName,
	);
	const riemannBenchScore = findRiemannBenchScore(
		modelNameCandidates,
		lookups.riemannBench.scoreByModelName,
	);
	if (riemannBenchScore != null) {
		evaluations.riemann_bench = riemannBenchScore;
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
	const vendingBench2Row = findAggregateBenchmarkSourceRow(
		modelNameCandidates,
		lookups.vendingBench2.scoreByModelName,
	);
	if (vendingBench2Row != null) {
		evaluations.vending_bench_2 = vendingBench2Row.final_balance_usd;
		scoringSources.vending_bench_2 = vendingBench2Row;
	}
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"weirdml",
		lookups.weirdMl.scoreByModelName,
	);

	return {
		evaluations,
		scoringSources,
	};
}

/** Fill missing benchmark evidence without replacing observation-level values or resources. */
export function enrichModelRowsWithBenchmarks(
	rows: Record<string, unknown>[],
	lookups: BenchmarkEnrichmentLookups,
): Record<string, unknown>[] {
	const defaultRowByModel = new Map<string, Record<string, unknown>>();
	for (const row of rows) {
		const modelKey = canonicalModelKey(row);
		const currentDefault = defaultRowByModel.get(modelKey);
		const hasMatchedObservation =
			typeof row.artificial_analysis_id === "string";
		const currentHasMatchedObservation =
			typeof currentDefault?.artificial_analysis_id === "string";
		if (
			currentDefault == null ||
			(hasMatchedObservation && !currentHasMatchedObservation) ||
			(hasMatchedObservation === currentHasMatchedObservation &&
				reasoningEffortRank(row.reasoning_effort) >
					reasoningEffortRank(currentDefault.reasoning_effort))
		) {
			defaultRowByModel.set(modelKey, row);
		}
	}
	return rows.map((row) => {
		if (defaultRowByModel.get(canonicalModelKey(row)) !== row) {
			return row;
		}
		const baseEvaluations = asRecord(row.evaluations);
		const hasVariantObservation =
			typeof row.artificial_analysis_id === "string";
		const benchmarkEnrichment = enrichBenchmarkAggregate(
			hasVariantObservation
				? [
						row.id,
						row.openrouter_id,
						modelSlugFromModelId(row.id),
						row.name,
						row.artificial_analysis_id,
						row.artificial_analysis_slug,
					]
				: [row.name],
			lookups,
			baseEvaluations,
			row.reasoning_effort,
		);
		const evaluations = mergeAggregateBenchmarkFields(
			baseEvaluations,
			benchmarkEnrichment.evaluations,
			benchmarkEnrichment.scoringSources,
		);
		const scoringSources = mergeAggregateBenchmarkFields(
			asRecord(row.scoring_sources),
			benchmarkEnrichment.scoringSources,
			benchmarkEnrichment.scoringSources,
		);
		return {
			...row,
			...(Object.keys(evaluations).length === 0 ? {} : { evaluations }),
			...(Object.keys(scoringSources).length === 0
				? {}
				: { scoring_sources: scoringSources }),
		};
	});
}
