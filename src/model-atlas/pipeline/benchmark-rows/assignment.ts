/** Benchmark assignment attaches exact-effort results to observations and model-level results to one default variant. */

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
import {
	agentsLastExamBenchmarkScore,
	findAgentsLastExamModelScore,
} from "../../benchmarks/scrapers/agents-last-exam";
import {
	type ArtificialAnalysisBenchmarkResourceLookup,
	type ArtificialAnalysisBenchmarkResourceRow,
	findArtificialAnalysisBenchmarkResourceRow,
} from "../../benchmarks/scrapers/artificial-analysis/results";
import { findBlueprintBenchScore } from "../../benchmarks/scrapers/blueprint-bench";
import { findGdpPdfScore } from "../../benchmarks/scrapers/surge/gdp-pdf";
import { findRiemannBenchScore } from "../../benchmarks/scrapers/surge/riemann-bench";
import { findValsIndexScore } from "../../benchmarks/scrapers/vals/index-benchmark";
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
import type { ModelAtlasSourceData } from "../../ingest/assembly";
import { asRecord } from "../../runtime";
import type { ModelAtlasScoringSources } from "../model-types";
import {
	findTerminalBenchAggregate,
	terminalBenchAggregateRow,
} from "./terminal-bench";

type BenchmarkObservationAssignmentLookups = {
	[Key in BenchmarkObservationDataKey]: Pick<
		ModelAtlasSourceData[Key],
		"rowsByModelName"
	>;
};

export type BenchmarkAssignmentLookups =
	BenchmarkObservationAssignmentLookups & {
		artificialAnalysisBenchmarkResources: Pick<
			ModelAtlasSourceData["artificialAnalysisBenchmarkResources"],
			"observationLookup" | "sourceDefaultLookup"
		>;
		agentArena: Pick<ModelAtlasSourceData["agentArena"], "rowsByModelName">;
		agentsLastExam: Pick<
			ModelAtlasSourceData["agentsLastExam"],
			"rowsByModelName"
		>;
		aleBench: Pick<ModelAtlasSourceData["aleBench"], "rowsByModelName">;
		blueprintBench: Pick<
			ModelAtlasSourceData["blueprintBench"],
			"rowsByModelName"
		>;
		cursorBench: Pick<ModelAtlasSourceData["cursorBench"], "rowsByModelName">;
		deepSWE: Pick<ModelAtlasSourceData["deepSWE"], "rowsByModelName">;
		frontierCode: Pick<ModelAtlasSourceData["frontierCode"], "rowsByModelName">;
		gdpPdf: Pick<ModelAtlasSourceData["gdpPdf"], "rowsByModelName">;
		harveyLab: Pick<ModelAtlasSourceData["harveyLab"], "rowsByModelName">;
		mercorApexAgents: Pick<
			ModelAtlasSourceData["mercorApexAgents"],
			"rowsByModelName"
		>;
		riemannBench: Pick<ModelAtlasSourceData["riemannBench"], "rowsByModelName">;
		terminalBench: Pick<
			ModelAtlasSourceData["terminalBench"],
			"rowsByModelName"
		>;
		valsIndex: Pick<ModelAtlasSourceData["valsIndex"], "rowsByModelName">;
		vendingBench2: Pick<
			ModelAtlasSourceData["vendingBench2"],
			"rowsByModelName"
		>;
	};

type AssignedBenchmarks = {
	benchmarks: Record<string, unknown>;
	scoringSources: NonNullable<ModelAtlasScoringSources>;
};

type SparseBenchmarkAssignmentContext = {
	assignedBenchmarks: AssignedBenchmarks;
	lookups: BenchmarkAssignmentLookups;
	modelNameCandidates: unknown[];
	targetReasoningEffort: unknown;
};

type SparseBenchmarkAssignmentOperation = (
	context: SparseBenchmarkAssignmentContext,
) => void;

type SparseBenchmarkAssignmentAdapter = {
	defaultVariant: SparseBenchmarkAssignmentOperation;
	observation?: SparseBenchmarkAssignmentOperation;
};

function benchmarkObservationLookup(
	lookups: BenchmarkAssignmentLookups,
	sourceDataKey: string,
): BenchmarkObservationLookup {
	const lookup = lookups[sourceDataKey as keyof BenchmarkAssignmentLookups] as
		| { rowsByModelName?: BenchmarkObservationLookup }
		| undefined;
	if (lookup?.rowsByModelName == null) {
		throw new Error(
			`Benchmark observation source-data lookup is missing: ${sourceDataKey}`,
		);
	}
	return lookup.rowsByModelName;
}

/** Fill model-level benchmark gaps while preserving exact variant observations and direct source rows. */
function mergeVariantBenchmarkFields(
	baseFields: Record<string, unknown>,
	defaultVariantFields: Record<string, unknown>,
	benchmarkSources: NonNullable<ModelAtlasScoringSources>,
): Record<string, unknown> {
	const fields = { ...defaultVariantFields, ...baseFields };
	for (const [key, sourceRow] of Object.entries(benchmarkSources)) {
		if (
			asRecord(sourceRow).benchmark_key === key &&
			key in defaultVariantFields
		) {
			fields[key] = defaultVariantFields[key];
		}
	}
	return fields;
}

type ArtificialAnalysisResourceQuery = {
	modelNameCandidates: unknown[];
	resourceLookup: ArtificialAnalysisBenchmarkResourceLookup;
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

function findBaseModelSourceRow<T>(
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
const addFrontierCode: SparseBenchmarkAssignmentOperation = ({
	assignedBenchmarks,
	lookups,
	modelNameCandidates,
	targetReasoningEffort,
}) => {
	const row = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.frontierCode.rowsByModelName,
	);
	if (row?.score_eligible !== true) {
		return;
	}
	assignedBenchmarks.benchmarks.frontier_code = row.score;
	assignedBenchmarks.scoringSources.frontier_code = row;
};

function addArtificialAnalysisResourceBenchmark(
	benchmarks: Record<string, unknown>,
	scoringSources: NonNullable<ModelAtlasScoringSources>,
	query: ArtificialAnalysisResourceQuery,
	key: string,
	score: (row: ArtificialAnalysisBenchmarkResourceRow) => unknown,
): void {
	const row = findArtificialAnalysisBenchmarkResourceRow(
		key,
		query.modelNameCandidates,
		query.resourceLookup,
	);
	if (row == null) {
		return;
	}
	benchmarks[key] = score(row);
	scoringSources[key] = row;
}

function buildArtificialAnalysisBenchmarks(
	modelNameCandidates: unknown[],
	resourceLookup: ArtificialAnalysisBenchmarkResourceLookup,
	baseBenchmarks: Record<string, unknown> = {},
): AssignedBenchmarks {
	const benchmarks: Record<string, unknown> = {};
	const scoringSources: NonNullable<ModelAtlasScoringSources> = {};
	const query = {
		modelNameCandidates,
		resourceLookup,
	};
	for (const key of Object.keys(baseBenchmarks)) {
		const resourceRow = findArtificialAnalysisBenchmarkResourceRow(
			key,
			modelNameCandidates,
			resourceLookup,
		);
		if (resourceRow != null) {
			scoringSources[key] = resourceRow;
		}
	}
	addArtificialAnalysisResourceBenchmark(
		benchmarks,
		scoringSources,
		query,
		"briefcase",
		(row) => transformBenchmarkSourceValue("briefcase", row.score),
	);
	const terminalBenchResourceRow = findArtificialAnalysisBenchmarkResourceRow(
		"terminalbench_v21",
		modelNameCandidates,
		resourceLookup,
	);
	const terminalBench = terminalBenchAggregateRow({
		artificialAnalysisScore: baseBenchmarks.terminalbench_v21,
		resourceRow: terminalBenchResourceRow,
	});
	if (terminalBench != null) {
		benchmarks.terminalbench_v21 = terminalBench.score;
		scoringSources.terminalbench_v21 = terminalBench;
	}
	addArtificialAnalysisResourceBenchmark(
		benchmarks,
		scoringSources,
		query,
		"automation_bench",
		(row) => row.score,
	);
	addArtificialAnalysisResourceBenchmark(
		benchmarks,
		scoringSources,
		query,
		"itbench_sre",
		(row) => row.score,
	);
	return { benchmarks, scoringSources };
}

const addAleBench: SparseBenchmarkAssignmentOperation = ({
	assignedBenchmarks,
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
		assignedBenchmarks.benchmarks.ale_bench = row.score;
		assignedBenchmarks.scoringSources.ale_bench = row;
	}
};

const addMercorApexAgents: SparseBenchmarkAssignmentOperation = ({
	assignedBenchmarks,
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
		assignedBenchmarks.scoringSources.apex_agents_mercor = row;
	}
};

/** Sparse assignment adapters keep benchmark-specific matching behind one exhaustive runtime registry. */
const SPARSE_BENCHMARK_ASSIGNMENT_ADAPTERS = {
	agent_arena: {
		defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
			const row = findBaseModelSourceRow(
				modelNameCandidates,
				lookups.agentArena.rowsByModelName,
			);
			if (row != null) {
				assignedBenchmarks.benchmarks.agent_arena = row.score;
				assignedBenchmarks.scoringSources.agent_arena = row;
			}
		},
	},
	agents_last_exam: {
		defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
			const row = findAgentsLastExamModelScore(
				modelNameCandidates,
				lookups.agentsLastExam.rowsByModelName,
			);
			if (row != null) {
				assignedBenchmarks.benchmarks.agents_last_exam =
					agentsLastExamBenchmarkScore(row);
				assignedBenchmarks.scoringSources.agents_last_exam = row;
			}
		},
	},
	ale_bench: {
		defaultVariant: addAleBench,
		observation: addAleBench,
	},
	blueprint_bench_2: {
		defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
			const score = findBlueprintBenchScore(
				modelNameCandidates,
				lookups.blueprintBench.rowsByModelName,
			);
			if (score != null) {
				assignedBenchmarks.benchmarks.blueprint_bench_2 = score;
			}
		},
	},
	cursorbench: {
		defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
			const row = findSourceRow(
				modelNameCandidates,
				lookups.cursorBench.rowsByModelName,
			);
			if (row != null) {
				assignedBenchmarks.benchmarks.cursorbench = row.score;
				assignedBenchmarks.scoringSources.cursorbench = row;
			}
		},
	},
	deep_swe: {
		defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
			const row = findSourceRow(
				modelNameCandidates,
				lookups.deepSWE.rowsByModelName,
			);
			if (row != null) {
				assignedBenchmarks.benchmarks.deep_swe = row.pass_at_1;
				assignedBenchmarks.scoringSources.deep_swe = row;
			}
		},
	},
	frontier_code: {
		defaultVariant: addFrontierCode,
		observation: addFrontierCode,
	},
	mercor_apex_agents: {
		defaultVariant: addMercorApexAgents,
		observation: addMercorApexAgents,
	},
	vending_bench_2: {
		defaultVariant: ({ assignedBenchmarks, lookups, modelNameCandidates }) => {
			const row = findBaseModelSourceRow(
				modelNameCandidates,
				lookups.vendingBench2.rowsByModelName,
			);
			if (row != null) {
				assignedBenchmarks.benchmarks.vending_bench_2 = row.final_balance_usd;
				assignedBenchmarks.scoringSources.vending_bench_2 = row;
			}
		},
	},
} satisfies Record<
	BenchmarkRuntimeKeyFor<"sparse">,
	SparseBenchmarkAssignmentAdapter
>;

function assignSparseBenchmarks(
	kind: keyof SparseBenchmarkAssignmentAdapter,
	context: SparseBenchmarkAssignmentContext,
): void {
	for (const adapter of Object.values(
		SPARSE_BENCHMARK_ASSIGNMENT_ADAPTERS,
	) as SparseBenchmarkAssignmentAdapter[]) {
		adapter[kind]?.(context);
	}
}

/** Builds benchmarks for one matched effort observation from effort-specific sources. */
export function buildObservationBenchmarks(
	modelNameCandidates: unknown[],
	lookups: BenchmarkAssignmentLookups,
	baseBenchmarks: Record<string, unknown> = {},
	targetReasoningEffort: unknown = null,
): AssignedBenchmarks {
	const assignedBenchmarks = buildArtificialAnalysisBenchmarks(
		modelNameCandidates,
		lookups.artificialAnalysisBenchmarkResources.observationLookup,
		baseBenchmarks,
	);
	assignSparseBenchmarks("observation", {
		assignedBenchmarks,
		lookups,
		modelNameCandidates,
		targetReasoningEffort,
	});
	return assignedBenchmarks;
}

/** Builds benchmarks for one default variant from source-default and effort-unspecified observations. */
export function buildDefaultVariantBenchmarks(
	modelNameCandidates: unknown[],
	lookups: BenchmarkAssignmentLookups,
	baseBenchmarks: Record<string, unknown> = {},
	targetReasoningEffort: unknown = null,
): AssignedBenchmarks {
	const assignedBenchmarks = buildArtificialAnalysisBenchmarks(
		modelNameCandidates,
		lookups.artificialAnalysisBenchmarkResources.sourceDefaultLookup,
		baseBenchmarks,
	);
	const { benchmarks, scoringSources } = assignedBenchmarks;
	for (const { benchmark, sourceDataKey } of BENCHMARK_OBSERVATION_BINDINGS) {
		const row = findBenchmarkObservation(
			modelNameCandidates,
			targetReasoningEffort,
			benchmarkObservationLookup(lookups, sourceDataKey),
		);
		if (row != null) {
			benchmarks[benchmark] = transformBenchmarkSourceValue(
				benchmark,
				row.canonical_value,
			);
			(scoringSources as Record<string, unknown>)[benchmark] = row;
		}
	}
	assignSparseBenchmarks("defaultVariant", {
		assignedBenchmarks,
		lookups,
		modelNameCandidates,
		targetReasoningEffort,
	});
	const gdpPdfScore = findGdpPdfScore(
		modelNameCandidates,
		lookups.gdpPdf.rowsByModelName,
	);
	if (gdpPdfScore != null) {
		benchmarks.gdp_pdf = gdpPdfScore;
	}
	const harveyLabRow = findEffortSourceRow(
		modelNameCandidates,
		targetReasoningEffort,
		lookups.harveyLab.rowsByModelName,
	);
	if (harveyLabRow != null) {
		benchmarks.harvey_lab = harveyLabRow.score;
		scoringSources.harvey_lab = harveyLabRow;
	}
	const riemannBenchScore = findRiemannBenchScore(
		modelNameCandidates,
		lookups.riemannBench.rowsByModelName,
	);
	if (riemannBenchScore != null) {
		benchmarks.riemann_bench = riemannBenchScore;
	}
	const terminalBench = findTerminalBenchAggregate(
		modelNameCandidates,
		{
			artificialAnalysisResourceLookup:
				lookups.artificialAnalysisBenchmarkResources.sourceDefaultLookup,
			harnessRowsByModel: lookups.terminalBench.rowsByModelName,
		},
		baseBenchmarks.terminalbench_v21,
	);
	if (terminalBench != null) {
		benchmarks.terminalbench_v21 = terminalBench.score;
		scoringSources.terminalbench_v21 = terminalBench;
	}
	const valsIndexScore = findValsIndexScore(
		modelNameCandidates,
		lookups.valsIndex.rowsByModelName,
	);
	if (valsIndexScore != null) {
		benchmarks.vals_index = valsIndexScore;
	}

	return {
		benchmarks,
		scoringSources,
	};
}

/** Assigns model-level benchmarks to one default variant without replacing exact variant observations. */
export function assignBenchmarksToVariants(
	rows: Record<string, unknown>[],
	lookups: BenchmarkAssignmentLookups,
): Record<string, unknown>[] {
	const defaultVariantByModel = new Map<string, Record<string, unknown>>();
	for (const row of rows) {
		const modelKey = canonicalModelKey(row);
		const currentDefaultVariant = defaultVariantByModel.get(modelKey);
		const hasMatchedObservation =
			typeof row.artificial_analysis_id === "string";
		const currentHasMatchedObservation =
			typeof currentDefaultVariant?.artificial_analysis_id === "string";
		if (
			currentDefaultVariant == null ||
			(hasMatchedObservation && !currentHasMatchedObservation) ||
			(hasMatchedObservation === currentHasMatchedObservation &&
				reasoningEffortRank(row.reasoning_effort) >
					reasoningEffortRank(currentDefaultVariant.reasoning_effort))
		) {
			defaultVariantByModel.set(modelKey, row);
		}
	}
	return rows.map((row) => {
		if (defaultVariantByModel.get(canonicalModelKey(row)) !== row) {
			return row;
		}
		const baseBenchmarks = asRecord(row.benchmarks);
		const hasMatchedObservation =
			typeof row.artificial_analysis_id === "string";
		const defaultVariantBenchmarks = buildDefaultVariantBenchmarks(
			hasMatchedObservation
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
			baseBenchmarks,
			row.reasoning_effort,
		);
		const benchmarks = mergeVariantBenchmarkFields(
			baseBenchmarks,
			defaultVariantBenchmarks.benchmarks,
			defaultVariantBenchmarks.scoringSources,
		);
		const scoringSources = mergeVariantBenchmarkFields(
			asRecord(row.scoring_sources),
			defaultVariantBenchmarks.scoringSources,
			defaultVariantBenchmarks.scoringSources,
		);
		return {
			...row,
			...(Object.keys(benchmarks).length === 0 ? {} : { benchmarks }),
			...(Object.keys(scoringSources).length === 0
				? {}
				: { scoring_sources: scoringSources }),
		};
	});
}
