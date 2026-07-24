/** Benchmark source-row drafts keep live source snapshots and restored database rows on one health-check contract. */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import {
	ARTIFICIAL_ANALYSIS_BENCHMARK_KEYS,
	BENCHMARK_OBSERVATION_BINDINGS,
	type PublicBenchmarkRuntimeKeyFor,
	transformBenchmarkSourceValue,
} from "../../benchmarks/registry";
import { agentsLastExamBenchmarkScore } from "../../benchmarks/scrapers/agents-last-exam";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../../benchmarks/scrapers/artificial-analysis/results";
import { cursorBenchCanonicalModelName } from "../../benchmarks/scrapers/cursorbench";
import {
	canonicalReasoningEffort,
	normalizeModelToken,
} from "../../identity/normalization";
import type { ModelAtlasSourceData } from "../../ingest/assembly";
import { asFiniteNumber, asRecord } from "../../runtime";
import { collapseModelVariants } from "../model-catalog";

export type BenchmarkSourceRow = {
	id: string | null;
	label: string;
	provider: string | null;
	value: number;
};

export type BenchmarkRowsByKey = Readonly<
	Record<string, readonly BenchmarkSourceRow[]>
>;

export type BenchmarkRowDraft = {
	key: string;
	id?: string | null;
	identity?: string | null;
	label: string | null;
	provider?: string | null;
	reasoningEffort?: unknown;
	value: unknown;
};

type AggregatableBenchmarkSourceRow = BenchmarkSourceRow & {
	identity: string;
	reasoningEffort: unknown;
};

type ArtificialAnalysisModelDraftSource<Row> = {
	rows: readonly Row[];
	modelId: (row: Row) => string | null;
	label: (row: Row, modelId: string | null) => string | null;
	reasoningEffort: (row: Row) => unknown;
	value: (row: Row, key: string) => unknown;
};

type ModelScoreDraftRow = {
	model_id: string;
	model: string;
	provider: string | null;
	reasoning_effort?: unknown;
	score: unknown;
};

function benchmarkRowDrafts<T>(
	key: string,
	rows: readonly T[],
	toDraft: (row: T) => Omit<BenchmarkRowDraft, "key">,
): BenchmarkRowDraft[] {
	return rows.map((row) => ({
		key,
		...toDraft(row),
	}));
}

function modelScoreRowDrafts(
	key: string,
	rows: readonly ModelScoreDraftRow[],
): BenchmarkRowDraft[] {
	return benchmarkRowDrafts(key, rows, (row) => ({
		id: row.model_id,
		identity: row.model_id,
		label: row.model,
		provider: row.provider,
		reasoningEffort: row.reasoning_effort,
		value: row.score,
	}));
}

function benchmarkObservationDrafts(
	rows: readonly BenchmarkObservationRow[],
): BenchmarkRowDraft[] {
	return rows.flatMap((row) =>
		row.score_eligible
			? [
					{
						key: row.benchmark_key,
						id: row.model_id,
						identity: row.base_model,
						label: row.model,
						provider:
							row.model_creator ??
							row.model_creator_id ??
							row.inference_provider,
						reasoningEffort: row.reasoning_effort,
						value: row.canonical_value,
					},
				]
			: [],
	);
}

function surgeBenchmarkRowDrafts(
	sourceData: ModelAtlasSourceData,
): BenchmarkRowDraft[] {
	return [
		...benchmarkRowDrafts("gdp_pdf", sourceData.gdpPdf.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		...benchmarkRowDrafts(
			"riemann_bench",
			sourceData.riemannBench.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
	];
}

function benchmarkObservationSourceDrafts(
	sourceData: ModelAtlasSourceData,
): BenchmarkRowDraft[] {
	return BENCHMARK_OBSERVATION_BINDINGS.flatMap(({ sourceDataKey }) => {
		const source = sourceData[sourceDataKey as keyof ModelAtlasSourceData] as
			| { rows?: readonly BenchmarkObservationRow[] }
			| undefined;
		if (source?.rows == null) {
			throw new Error(
				`Benchmark observation source-data rows are missing: ${sourceDataKey}`,
			);
		}
		return benchmarkObservationDrafts(source.rows);
	});
}

function artificialAnalysisBenchmarkResourceDrafts(
	key: string,
	rows: readonly ArtificialAnalysisBenchmarkResourceRow[],
	value: (row: ArtificialAnalysisBenchmarkResourceRow) => unknown,
): BenchmarkRowDraft[] {
	return benchmarkRowDrafts(
		key,
		rows.filter((row) => row.benchmark_key === key),
		(row) => ({
			id: row.model_id,
			identity: row.model_id,
			label: row.model,
			provider: row.provider,
			reasoningEffort: row.reasoning_effort,
			value: value(row),
		}),
	);
}

function addBenchmarkRowDraft(
	rowsByKey: Record<string, AggregatableBenchmarkSourceRow[]>,
	draft: BenchmarkRowDraft,
): void {
	const value = asFiniteNumber(draft.value);
	if (draft.label == null || value == null) {
		return;
	}
	let rows = rowsByKey[draft.key];
	if (rows == null) {
		rows = [];
		rowsByKey[draft.key] = rows;
	}
	rows.push({
		id: draft.id ?? null,
		identity:
			draft.identity ??
			draft.id ??
			`${draft.provider ?? "benchmark"}/${draft.label}`,
		label: draft.label,
		provider: draft.provider ?? null,
		reasoningEffort: canonicalReasoningEffort(draft.reasoningEffort),
		value,
	});
}

function aggregateBenchmarkSourceRows(
	key: string,
	rows: AggregatableBenchmarkSourceRow[],
): BenchmarkSourceRow[] {
	return collapseModelVariants(
		rows.map((row) => {
			const identity = normalizeModelToken(row.identity);
			return {
				id: identity,
				artificial_analysis_id: identity,
				artificial_analysis_slug: identity.split("/").at(-1),
				reasoning_effort: row.reasoningEffort,
				benchmarks: { [key]: row.value },
				benchmark_source_row: {
					id: row.id,
					label: row.label,
					provider: row.provider,
					value: row.value,
				} satisfies BenchmarkSourceRow,
			};
		}),
	).map((row) => row.benchmark_source_row as BenchmarkSourceRow);
}

/** Only labeled finite benchmark evidence is allowed into update-health comparisons. */
export function finalizeBenchmarkRows(
	drafts: readonly BenchmarkRowDraft[],
): BenchmarkRowsByKey {
	const rowsByKey: Record<string, AggregatableBenchmarkSourceRow[]> = {};
	for (const draft of drafts) {
		addBenchmarkRowDraft(rowsByKey, draft);
	}
	return Object.fromEntries(
		Object.entries(rowsByKey).map(([key, rows]) => [
			key,
			aggregateBenchmarkSourceRows(key, rows),
		]),
	);
}

/** Artificial Analysis rows carry many benchmark keys, so each supported key becomes separate source evidence. */
export function artificialAnalysisModelRowDrafts<Row>({
	rows,
	modelId,
	label,
	reasoningEffort,
	value,
}: ArtificialAnalysisModelDraftSource<Row>): BenchmarkRowDraft[] {
	return rows.flatMap((row) => {
		const rowModelId = modelId(row);
		const rowLabel = label(row, rowModelId);
		if (rowLabel == null) {
			return [];
		}
		return ARTIFICIAL_ANALYSIS_BENCHMARK_KEYS.map((key) => ({
			key,
			id: rowModelId,
			identity: rowModelId,
			label: rowLabel,
			provider: null,
			reasoningEffort: reasoningEffort(row),
			value: value(row, key),
		}));
	});
}

function artificialAnalysisBenchmarkRowDrafts(
	sourceData: ModelAtlasSourceData,
): BenchmarkRowDraft[] {
	return [
		...artificialAnalysisModelRowDrafts({
			rows: sourceData.artificialAnalysis.rows,
			modelId: (row) => {
				const record = asRecord(row);
				return typeof record.model_id === "string" && record.model_id.length > 0
					? record.model_id
					: null;
			},
			label: (row, modelId) => {
				const record = asRecord(row);
				return typeof record.name === "string" && record.name.length > 0
					? record.name
					: modelId;
			},
			reasoningEffort: (row) => asRecord(row).reasoning_effort,
			value: (row, key) => asRecord(asRecord(row).benchmarks)[key],
		}),
		...artificialAnalysisBenchmarkResourceDrafts(
			"automation_bench",
			sourceData.artificialAnalysisBenchmarkResources.rows,
			(row) => row.score,
		),
		...artificialAnalysisBenchmarkResourceDrafts(
			"briefcase",
			sourceData.artificialAnalysisBenchmarkResources.rows,
			(row) => transformBenchmarkSourceValue("briefcase", row.score),
		),
	];
}

type SparseBenchmarkAdapter = (
	sourceData: ModelAtlasSourceData,
) => BenchmarkRowDraft[];

/** Sparse benchmark adapters retain source-specific row rules behind one exhaustive registry. */
const SPARSE_BENCHMARK_ADAPTERS = {
	agent_arena: (sourceData) =>
		benchmarkRowDrafts("agent_arena", sourceData.agentArena.rows, (row) => ({
			id: row.contender_name,
			identity: row.base_model,
			label: row.model,
			provider: row.organization,
			reasoningEffort: row.reasoning_effort,
			value: row.score,
		})),
	agents_last_exam: (sourceData) =>
		benchmarkRowDrafts(
			"agents_last_exam",
			sourceData.agentsLastExam.rows,
			(row) => ({
				label: row.model,
				value: agentsLastExamBenchmarkScore(row),
			}),
		),
	ale_bench: (sourceData) =>
		benchmarkRowDrafts(
			"ale_bench",
			sourceData.aleBench.sourceDefaultRows,
			(row) => ({
				id: row.base_model,
				identity: row.base_model,
				label: row.base_model,
				reasoningEffort: row.reasoning_effort,
				value: row.score,
			}),
		),
	blueprint_bench_2: (sourceData) =>
		benchmarkRowDrafts(
			"blueprint_bench_2",
			sourceData.blueprintBench.rows,
			(row) => ({
				label: row.model,
				value: row.score,
			}),
		),
	cursorbench: (sourceData) =>
		benchmarkRowDrafts("cursorbench", sourceData.cursorBench.rows, (row) => {
			const canonicalName = cursorBenchCanonicalModelName(row.base_model);
			return {
				identity: canonicalName,
				label: canonicalName,
				reasoningEffort: row.reasoning_effort,
				value: row.score,
			};
		}),
	deep_swe: (sourceData) =>
		benchmarkRowDrafts(
			"deep_swe",
			sourceData.deepSWE.sourceDefaultRows,
			(row) => ({
				id: row.model,
				identity: row.model,
				label: row.model,
				reasoningEffort: row.reasoning_effort,
				value: row.pass_at_1,
			}),
		),
	frontier_code: (sourceData) =>
		benchmarkRowDrafts(
			"frontier_code",
			sourceData.frontierCode.rows.filter((row) => row.score_eligible),
			(row) => ({
				id: row.base_model,
				identity: row.base_model,
				label: row.model,
				reasoningEffort: row.reasoning_effort,
				value: row.score,
			}),
		),
	vending_bench_2: (sourceData) =>
		benchmarkRowDrafts(
			"vending_bench_2",
			sourceData.vendingBench2.rows,
			(row) => ({
				identity: row.base_model,
				label: row.model,
				reasoningEffort: row.reasoning_effort,
				value: row.final_balance_usd,
			}),
		),
} satisfies Record<
	PublicBenchmarkRuntimeKeyFor<"sparse">,
	SparseBenchmarkAdapter
>;

function benchmarkDraftsFromSourceData(
	sourceData: ModelAtlasSourceData,
): BenchmarkRowDraft[] {
	return [
		...benchmarkObservationSourceDrafts(sourceData),
		...artificialAnalysisBenchmarkRowDrafts(sourceData),
		...Object.values(SPARSE_BENCHMARK_ADAPTERS).flatMap((adapter) =>
			adapter(sourceData),
		),
		...surgeBenchmarkRowDrafts(sourceData),
		...modelScoreRowDrafts("harvey_lab", sourceData.harveyLab.rows),
		...modelScoreRowDrafts("terminalbench_v21", sourceData.terminalBench.rows),
		...modelScoreRowDrafts("vals_index", sourceData.valsIndex.rows),
	];
}

/** Live source data enters benchmark-update health through the same draft contract as database restorations. */
export function benchmarkRowsFromSourceData(
	sourceData: ModelAtlasSourceData,
): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(benchmarkDraftsFromSourceData(sourceData));
}
