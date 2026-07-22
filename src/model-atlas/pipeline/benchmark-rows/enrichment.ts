/** Benchmark enrichment is the single bridge from source lookup maps to evaluation and scoring-source fields. */

import {
	type BenchmarkObservationLookup,
	findBenchmarkObservation,
} from "../../benchmarks/observation";
import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkObservationDataKey,
	type BenchmarkRuntimeKeyFor,
	transformBenchmarkSourceValue,
} from "../../benchmarks/registry";
import { modelNameIdentityKey } from "../../identity";
import {
	type BenchmarkModelRow,
	benchmarkModelEffort,
	canonicalModelKey,
	canonicalReasoningEffort,
	modelSlugFromModelId,
	normalizeModelToken,
	reasoningEffortRank,
} from "../../identity/normalization";
import type { LlmStatsSourceData } from "../../ingest/assembly";
import { asRecord } from "../../runtime";
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
import { findGdpPdfScore } from "../../scrapers/surge/gdp-pdf";
import { findRiemannBenchScore } from "../../scrapers/surge/riemann-bench";
import { findValsIndexScore } from "../../scrapers/vals/index-benchmark";
import type { LlmStatsScoringSources } from "../model-types";
import {
	findTerminalBenchAggregate,
	terminalBenchAggregateRow,
} from "./terminal-bench";

type BenchmarkObservationEnrichmentLookups = {
	[Key in BenchmarkObservationDataKey]: Pick<
		LlmStatsSourceData[Key],
		"rowsByModelName"
	>;
};

export type BenchmarkEnrichmentLookups =
	BenchmarkObservationEnrichmentLookups & {
		artificialAnalysisEvaluationResources: Pick<
			LlmStatsSourceData["artificialAnalysisEvaluationResources"],
			"observationByModelName" | "defaultEffortByModelName"
		>;
		agentArena: Pick<LlmStatsSourceData["agentArena"], "rowsByModelName">;
		agentsLastExam: Pick<
			LlmStatsSourceData["agentsLastExam"],
			"rowsByModelName"
		>;
		aleBench: Pick<LlmStatsSourceData["aleBench"], "rowsByModelName">;
		blueprintBench: Pick<
			LlmStatsSourceData["blueprintBench"],
			"rowsByModelName"
		>;
		cursorBench: Pick<LlmStatsSourceData["cursorBench"], "rowsByModelName">;
		deepSWE: Pick<LlmStatsSourceData["deepSWE"], "rowsByModelName">;
		frontierCode: Pick<LlmStatsSourceData["frontierCode"], "rowsByModelName">;
		gdpPdf: Pick<LlmStatsSourceData["gdpPdf"], "rowsByModelName">;
		harveyLab: Pick<LlmStatsSourceData["harveyLab"], "rowsByModelName">;
		mercorApexAgents: Pick<
			LlmStatsSourceData["mercorApexAgents"],
			"rowsByModelName"
		>;
		riemannBench: Pick<LlmStatsSourceData["riemannBench"], "rowsByModelName">;
		terminalBench: Pick<LlmStatsSourceData["terminalBench"], "rowsByModelName">;
		valsIndex: Pick<LlmStatsSourceData["valsIndex"], "rowsByModelName">;
		vendingBench2: Pick<LlmStatsSourceData["vendingBench2"], "rowsByModelName">;
	};

type BenchmarkEnrichment = {
	evaluations: Record<string, unknown>;
	scoringSources: NonNullable<LlmStatsScoringSources>;
};

type SparseBenchmarkEnrichmentContext = {
	enrichment: BenchmarkEnrichment;
	lookups: BenchmarkEnrichmentLookups;
	modelNameCandidates: unknown[];
	targetReasoningEffort: unknown;
};

type SparseBenchmarkEnrichmentOperation = (
	context: SparseBenchmarkEnrichmentContext,
) => void;

type SparseBenchmarkEnrichmentAdapter = {
	aggregate: SparseBenchmarkEnrichmentOperation;
	observation?: SparseBenchmarkEnrichmentOperation;
};

function benchmarkObservationLookup(
	lookups: BenchmarkEnrichmentLookups,
	sourceDataKey: string,
): BenchmarkObservationLookup {
	const lookup = lookups[sourceDataKey as keyof BenchmarkEnrichmentLookups] as
		| { rowsByModelName?: BenchmarkObservationLookup }
		| undefined;
	if (lookup?.rowsByModelName == null) {
		throw new Error(
			`Benchmark observation source-data lookup is missing: ${sourceDataKey}`,
		);
	}
	return lookup.rowsByModelName;
}

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
		(row) => transformBenchmarkSourceValue("briefcase", row.score),
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
		"itbench_sre",
		(row) => row.score,
	);
	return { evaluations, scoringSources };
}

const enrichAleBench: SparseBenchmarkEnrichmentOperation = ({
	enrichment,
	lookups,
	modelNameCandidates,
	targetReasoningEffort,
}) => {
	const row = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.aleBench.rowsByModelName,
	);
	if (row != null) {
		enrichment.evaluations.ale_bench = row.score;
		enrichment.scoringSources.ale_bench = row;
	}
};

const enrichFrontierCode: SparseBenchmarkEnrichmentOperation = ({
	enrichment,
	lookups,
	modelNameCandidates,
	targetReasoningEffort,
}) =>
	addFrontierCodeScore(
		enrichment,
		modelNameCandidates,
		targetReasoningEffort,
		lookups.frontierCode,
	);

const enrichMercorApexAgents: SparseBenchmarkEnrichmentOperation = ({
	enrichment,
	lookups,
	modelNameCandidates,
	targetReasoningEffort,
}) => {
	const row = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.mercorApexAgents.rowsByModelName,
	);
	if (row != null) {
		enrichment.scoringSources.apex_agents_mercor = row;
	}
};

/** Sparse enrichment adapters keep benchmark-specific matching behind one exhaustive runtime registry. */
const SPARSE_BENCHMARK_ENRICHMENT_ADAPTERS = {
	agent_arena: {
		aggregate: ({ enrichment, lookups, modelNameCandidates }) => {
			const row = findAggregateSourceRow(
				modelNameCandidates,
				lookups.agentArena.rowsByModelName,
			);
			if (row != null) {
				enrichment.evaluations.agent_arena = row.score;
				enrichment.scoringSources.agent_arena = row;
			}
		},
	},
	agents_last_exam: {
		aggregate: ({ enrichment, lookups, modelNameCandidates }) => {
			const row = findAgentsLastExamModelScore(
				modelNameCandidates,
				lookups.agentsLastExam.rowsByModelName,
			);
			if (row != null) {
				enrichment.evaluations.agents_last_exam =
					agentsLastExamBenchmarkScore(row);
				enrichment.scoringSources.agents_last_exam = row;
			}
		},
	},
	ale_bench: {
		aggregate: enrichAleBench,
		observation: enrichAleBench,
	},
	blueprint_bench_2: {
		aggregate: ({ enrichment, lookups, modelNameCandidates }) => {
			const score = findBlueprintBenchScore(
				modelNameCandidates,
				lookups.blueprintBench.rowsByModelName,
			);
			if (score != null) {
				enrichment.evaluations.blueprint_bench_2 = score;
			}
		},
	},
	cursorbench: {
		aggregate: ({ enrichment, lookups, modelNameCandidates }) => {
			const row = findSourceRow(
				modelNameCandidates,
				lookups.cursorBench.rowsByModelName,
			);
			if (row != null) {
				enrichment.evaluations.cursorbench = row.score;
				enrichment.scoringSources.cursorbench = row;
			}
		},
	},
	deep_swe: {
		aggregate: ({ enrichment, lookups, modelNameCandidates }) => {
			const row = findSourceRow(
				modelNameCandidates,
				lookups.deepSWE.rowsByModelName,
			);
			if (row != null) {
				enrichment.evaluations.deep_swe = row.pass_at_1;
				enrichment.scoringSources.deep_swe = row;
			}
		},
	},
	frontier_code: {
		aggregate: enrichFrontierCode,
		observation: enrichFrontierCode,
	},
	mercor_apex_agents: {
		aggregate: enrichMercorApexAgents,
		observation: enrichMercorApexAgents,
	},
	vending_bench_2: {
		aggregate: ({ enrichment, lookups, modelNameCandidates }) => {
			const row = findAggregateSourceRow(
				modelNameCandidates,
				lookups.vendingBench2.rowsByModelName,
			);
			if (row != null) {
				enrichment.evaluations.vending_bench_2 = row.final_balance_usd;
				enrichment.scoringSources.vending_bench_2 = row;
			}
		},
	},
} satisfies Record<
	BenchmarkRuntimeKeyFor<"sparse">,
	SparseBenchmarkEnrichmentAdapter
>;

function runSparseBenchmarkEnrichment(
	kind: keyof SparseBenchmarkEnrichmentAdapter,
	context: SparseBenchmarkEnrichmentContext,
): void {
	for (const adapter of Object.values(
		SPARSE_BENCHMARK_ENRICHMENT_ADAPTERS,
	) as SparseBenchmarkEnrichmentAdapter[]) {
		adapter[kind]?.(context);
	}
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
	runSparseBenchmarkEnrichment("observation", {
		enrichment,
		lookups,
		modelNameCandidates,
		targetReasoningEffort,
	});
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
	for (const { benchmark, sourceDataKey } of BENCHMARK_OBSERVATION_BINDINGS) {
		const row = findBenchmarkObservation(
			modelNameCandidates,
			targetReasoningEffort,
			benchmarkObservationLookup(lookups, sourceDataKey),
		);
		if (row != null) {
			evaluations[benchmark] = transformBenchmarkSourceValue(
				benchmark,
				row.canonical_value,
			);
			(scoringSources as Record<string, unknown>)[benchmark] = row;
		}
	}
	runSparseBenchmarkEnrichment("aggregate", {
		enrichment: { evaluations, scoringSources },
		lookups,
		modelNameCandidates,
		targetReasoningEffort,
	});
	const gdpPdfScore = findGdpPdfScore(
		modelNameCandidates,
		lookups.gdpPdf.rowsByModelName,
	);
	if (gdpPdfScore != null) {
		evaluations.gdp_pdf = gdpPdfScore;
	}
	const harveyLabRow = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.harveyLab.rowsByModelName,
	);
	if (harveyLabRow != null) {
		evaluations.harvey_lab = harveyLabRow.score;
		scoringSources.harvey_lab = harveyLabRow;
	}
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
			harnessRowsByModel: lookups.terminalBench.rowsByModelName,
		},
		baseEvaluations.terminalbench_v21,
	);
	if (terminalBench != null) {
		evaluations.terminalbench_v21 = terminalBench.score;
		scoringSources.terminalbench_v21 = terminalBench;
	}
	const valsIndexScore = findValsIndexScore(
		modelNameCandidates,
		lookups.valsIndex.rowsByModelName,
	);
	if (valsIndexScore != null) {
		evaluations.vals_index = valsIndexScore;
	}

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
