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
	type BenchmarkRowsByModelName,
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
	agentArena: Pick<LlmStatsSourceData["agentArena"], "rowsByModelName">;
	agentsLastExam: Pick<LlmStatsSourceData["agentsLastExam"], "rowsByModelName">;
	aleBench: Pick<LlmStatsSourceData["aleBench"], "rowsByModelName">;
	blueprintBench: Pick<LlmStatsSourceData["blueprintBench"], "rowsByModelName">;
	browseComp: Pick<LlmStatsSourceData["browseComp"], "rowsByModelName">;
	chartography: Pick<LlmStatsSourceData["chartography"], "rowsByModelName">;
	chessPuzzles: Pick<LlmStatsSourceData["chessPuzzles"], "rowsByModelName">;
	cursorBench: Pick<LlmStatsSourceData["cursorBench"], "rowsByModelName">;
	deepSWE: Pick<LlmStatsSourceData["deepSWE"], "rowsByModelName">;
	ebrBench: Pick<LlmStatsSourceData["ebrBench"], "rowsByModelName">;
	enterpriseBenchCoreCraft: Pick<
		LlmStatsSourceData["enterpriseBenchCoreCraft"],
		"rowsByModelName"
	>;
	epochCapabilitiesIndex: Pick<
		LlmStatsSourceData["epochCapabilitiesIndex"],
		"rowsByModelName"
	>;
	frontierCode: Pick<LlmStatsSourceData["frontierCode"], "rowsByModelName">;
	frontierMathTier4: Pick<
		LlmStatsSourceData["frontierMathTier4"],
		"rowsByModelName"
	>;
	gdpPdf: Pick<LlmStatsSourceData["gdpPdf"], "rowsByModelName">;
	handbookMd: Pick<LlmStatsSourceData["handbookMd"], "rowsByModelName">;
	mercorApexAgents: Pick<
		LlmStatsSourceData["mercorApexAgents"],
		"rowsByModelName"
	>;
	proofBench: Pick<LlmStatsSourceData["proofBench"], "rowsByModelName">;
	riemannBench: Pick<LlmStatsSourceData["riemannBench"], "rowsByModelName">;
	valsTerminalBench: Pick<
		LlmStatsSourceData["valsTerminalBench"],
		"rowsByModelName"
	>;
	toolathlon: Pick<LlmStatsSourceData["toolathlon"], "rowsByModelName">;
	valsIndex: Pick<LlmStatsSourceData["valsIndex"], "rowsByModelName">;
	vendingBench2: Pick<LlmStatsSourceData["vendingBench2"], "rowsByModelName">;
	weirdMl: Pick<LlmStatsSourceData["weirdMl"], "rowsByModelName">;
};

type BenchmarkEnrichment = {
	evaluations: Record<string, unknown>;
	scoringSources: NonNullable<LlmStatsScoringSources>;
};

/** Direct benchmark source rows override duplicate catalog fields without a benchmark-specific registry. */
function mergeAggregateFields(
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
	rowsByModelName: ReadonlyMap<string, T>,
): T | null {
	const identityKeys = new Set<string>();
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = rowsByModelName.get(normalizeModelToken(candidateName));
		if (row != null) {
			return row;
		}
		const identityKey = modelNameIdentityKey(candidateName);
		if (identityKey.length > 0) {
			identityKeys.add(identityKey);
		}
	}
	for (const [sourceName, row] of rowsByModelName) {
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
	rowsByModel: BenchmarkRowsByModelName,
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

function findAggregateSourceRow<T>(
	candidateNames: unknown[],
	rowsByModelName: ReadonlyMap<string, T>,
): T | null {
	const baseModelCandidates = candidateNames.map((candidateName) =>
		typeof candidateName === "string"
			? benchmarkModelEffort(candidateName).baseModel
			: candidateName,
	);
	return findSourceRow(baseModelCandidates, rowsByModelName);
}

function findEffortSourceRow<T extends BenchmarkModelRow>(
	candidateNames: unknown[],
	targetReasoningEffort: unknown,
	rowsByModelName: ReadonlyMap<string, T>,
): T | null {
	const effort = canonicalReasoningEffort(targetReasoningEffort);
	if (effort == null) {
		return findSourceRow(candidateNames, rowsByModelName);
	}
	const effortCandidates = candidateNames.flatMap((candidateName) => {
		if (typeof candidateName !== "string") {
			return [];
		}
		const baseModel = benchmarkModelEffort(candidateName).baseModel;
		return [`${baseModel} (${effort})`];
	});
	const row = findSourceRow(effortCandidates, rowsByModelName);
	return row?.reasoning_effort === effort ? row : null;
}

/** Adds FrontierCode only when the effort-matched source row is eligible for general-model scoring. */
function addFrontierCodeScore(
	enrichment: BenchmarkEnrichment,
	modelNameCandidates: unknown[],
	targetReasoningEffort: unknown,
	lookup: BenchmarkEnrichmentLookups["frontierCode"],
): void {
	const row = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookup.rowsByModelName,
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
	const lookup = {
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
		lookup,
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
		lookup,
		"automation_bench",
		(row) => row.score,
	);
	addArtificialAnalysisResourceEvaluation(
		evaluations,
		scoringSources,
		lookup,
		"harvey_lab",
		(row) => row.score,
	);
	addArtificialAnalysisResourceEvaluation(
		evaluations,
		scoringSources,
		lookup,
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
	const mercorRow = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.mercorApexAgents.rowsByModelName,
	);
	if (mercorRow != null) {
		enrichment.scoringSources.apex_agents_mercor = mercorRow;
	}
	const aleBenchRow = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.aleBench.rowsByModelName,
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
	const agentArenaRow = findAggregateSourceRow(
		modelNameCandidates,
		lookups.agentArena.rowsByModelName,
	);
	if (agentArenaRow != null) {
		evaluations.agent_arena = agentArenaRow.score;
		scoringSources.agent_arena = agentArenaRow;
	}
	const agentsLastExamScore = findAgentsLastExamModelScore(
		modelNameCandidates,
		lookups.agentsLastExam.rowsByModelName,
	);
	if (agentsLastExamScore != null) {
		evaluations.agents_last_exam =
			agentsLastExamBenchmarkScore(agentsLastExamScore);
		scoringSources.agents_last_exam = agentsLastExamScore;
	}
	const aleBenchRow = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.aleBench.rowsByModelName,
	);
	if (aleBenchRow != null) {
		evaluations.ale_bench = aleBenchRow.score;
		scoringSources.ale_bench = aleBenchRow;
	}
	const blueprintBenchScore = findBlueprintBenchScore(
		modelNameCandidates,
		lookups.blueprintBench.rowsByModelName,
	);
	if (blueprintBenchScore != null) {
		evaluations.blueprint_bench_2 = blueprintBenchScore;
	}

	const browseCompScore = findBrowseCompScore(
		modelNameCandidates,
		lookups.browseComp.rowsByModelName,
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
		lookups.chartography.rowsByModelName,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"chess_puzzles",
		lookups.chessPuzzles.rowsByModelName,
	);
	const cursorBenchRow = findSourceRow(
		modelNameCandidates,
		lookups.cursorBench.rowsByModelName,
	);
	if (cursorBenchRow != null) {
		evaluations.cursorbench = cursorBenchRow.score;
		scoringSources.cursorbench = cursorBenchRow;
	}

	const deepSweRow = findSourceRow(
		modelNameCandidates,
		lookups.deepSWE.rowsByModelName,
	);
	if (deepSweRow != null) {
		evaluations.deep_swe = deepSweRow.pass_at_1;
		scoringSources.deep_swe = deepSweRow;
	}
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"ebr_bench",
		lookups.ebrBench.rowsByModelName,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"enterprisebench_corecraft",
		lookups.enterpriseBenchCoreCraft.rowsByModelName,
	);
	addBenchmarkScore(
		evaluations,
		scoringSources,
		modelNameCandidates,
		targetReasoningEffort,
		"epoch_capabilities_index",
		lookups.epochCapabilitiesIndex.rowsByModelName,
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
		lookups.frontierMathTier4.rowsByModelName,
	);
	const gdpPdfScore = findGdpPdfScore(
		modelNameCandidates,
		lookups.gdpPdf.rowsByModelName,
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
		lookups.handbookMd.rowsByModelName,
	);
	const mercorRow = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.mercorApexAgents.rowsByModelName,
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
		lookups.proofBench.rowsByModelName,
	);
	const riemannBenchScore = findRiemannBenchScore(
		modelNameCandidates,
		lookups.riemannBench.rowsByModelName,
	);
	if (riemannBenchScore != null) {
		evaluations.riemann_bench = riemannBenchScore;
	}
	const terminalBench = findTerminalBenchAggregate(
		modelNameCandidates,
		{
			artificialAnalysisRowsByBenchmark:
				lookups.artificialAnalysisEvaluationResources.defaultEffortByModelName,
			harnessRowsByModel: lookups.valsTerminalBench.rowsByModelName,
		},
		baseEvaluations.terminalbench_v21,
	);
	if (terminalBench != null) {
		evaluations.terminalbench_v21 = terminalBench.score;
		scoringSources.terminalbench_v21 = terminalBench;
	}
	const toolathlonScore = findToolathlonScore(
		modelNameCandidates,
		lookups.toolathlon.rowsByModelName,
	);
	if (toolathlonScore != null) {
		evaluations.toolathlon = toolathlonScore;
	}

	const valsIndexScore = findValsIndexScore(
		modelNameCandidates,
		lookups.valsIndex.rowsByModelName,
	);
	if (valsIndexScore != null) {
		evaluations.vals_index = valsIndexScore;
	}
	const vendingBench2Row = findAggregateSourceRow(
		modelNameCandidates,
		lookups.vendingBench2.rowsByModelName,
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
		lookups.weirdMl.rowsByModelName,
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
		const evaluations = mergeAggregateFields(
			baseEvaluations,
			benchmarkEnrichment.evaluations,
			benchmarkEnrichment.scoringSources,
		);
		const scoringSources = mergeAggregateFields(
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
