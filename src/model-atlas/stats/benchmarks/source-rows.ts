/** Benchmark source-row drafts keep live source snapshots and restored database rows on one health-check contract. */

import { normalizeElo } from "../../math-utils";
import { agentsLastExamBenchmarkScore } from "../../scrapers/agents-last-exam";
import type { ArtificialAnalysisEvaluationResourceRow } from "../../scrapers/artificial-analysis/benchmark-resources";
import type { BenchmarkScoreRow } from "../../scrapers/benchmark-score";
import { cursorBenchCanonicalModelName } from "../../scrapers/cursorbench";
import {
	asFiniteNumber,
	asRecord,
	canonicalReasoningEffort,
	normalizeModelToken,
} from "../../shared";
import { aggregateCollapsedModelRows } from "../openrouter-enrichment";
import type { LlmStatsSourceData } from "../types";
import { ARTIFICIAL_ANALYSIS_EVALUATION_KEYS } from "./keys";

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

function sparseBenchmarkRowDrafts<T>(
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
	return sparseBenchmarkRowDrafts(key, rows, (row) => ({
		id: row.model_id,
		identity: row.model_id,
		label: row.model,
		provider: row.provider,
		reasoningEffort: row.reasoning_effort,
		value: row.score,
	}));
}

function benchmarkScoreRowDrafts(
	rows: readonly BenchmarkScoreRow[],
): BenchmarkRowDraft[] {
	return rows.flatMap((row) =>
		row.score_eligible
			? [
					{
						key: row.benchmark_key,
						id: row.model_id,
						identity: row.base_model,
						label: row.model,
						provider: row.provider,
						reasoningEffort: row.reasoning_effort,
						value: row.score,
					},
				]
			: [],
	);
}

function epochBenchmarkRowDrafts(
	sourceData: LlmStatsSourceData,
): BenchmarkRowDraft[] {
	return benchmarkScoreRowDrafts([
		...sourceData.chessPuzzles.rows,
		...sourceData.ebrBench.rows,
		...sourceData.epochCapabilitiesIndex.rows,
		...sourceData.frontierMathTier4.rows,
	]);
}

function surgeBenchmarkRowDrafts(
	sourceData: LlmStatsSourceData,
): BenchmarkRowDraft[] {
	return [
		...benchmarkScoreRowDrafts([
			...sourceData.chartography.rows,
			...sourceData.enterpriseBenchCoreCraft.rows,
			...sourceData.handbookMd.rows,
		]),
		...sparseBenchmarkRowDrafts("gdp_pdf", sourceData.gdpPdf.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		...sparseBenchmarkRowDrafts(
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

function artificialAnalysisEvaluationResourceDrafts(
	key: string,
	rows: readonly ArtificialAnalysisEvaluationResourceRow[],
	value: (row: ArtificialAnalysisEvaluationResourceRow) => unknown,
): BenchmarkRowDraft[] {
	return sparseBenchmarkRowDrafts(
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
	return aggregateCollapsedModelRows(
		rows.map((row) => {
			const identity = normalizeModelToken(row.identity);
			return {
				id: identity,
				artificial_analysis_id: identity,
				artificial_analysis_slug: identity.split("/").at(-1),
				reasoning_effort: row.reasoningEffort,
				evaluations: { [key]: row.value },
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
		return ARTIFICIAL_ANALYSIS_EVALUATION_KEYS.map((key) => ({
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
	sourceData: LlmStatsSourceData,
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
			value: (row, key) => asRecord(asRecord(row).evaluations)[key],
		}),
		...artificialAnalysisEvaluationResourceDrafts(
			"automation_bench",
			sourceData.artificialAnalysisEvaluationResources.rows,
			(row) => row.score,
		),
		...artificialAnalysisEvaluationResourceDrafts(
			"briefcase",
			sourceData.artificialAnalysisEvaluationResources.rows,
			(row) => normalizeElo(row.score, 500, 2000),
		),
	];
}

function benchmarkDraftsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkRowDraft[] {
	return [
		...sparseBenchmarkRowDrafts(
			"agent_arena",
			sourceData.agentArena.rows,
			(row) => ({
				id: row.contender_name,
				identity: row.base_model,
				label: row.model,
				provider: row.organization,
				reasoningEffort: row.reasoning_effort,
				value: row.score,
			}),
		),
		...artificialAnalysisBenchmarkRowDrafts(sourceData),
		...sparseBenchmarkRowDrafts(
			"agents_last_exam",
			sourceData.agentsLastExam.rows,
			(row) => ({
				label: row.model,
				value: agentsLastExamBenchmarkScore(row),
			}),
		),
		...sparseBenchmarkRowDrafts(
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
		...sparseBenchmarkRowDrafts(
			"blueprint_bench_2",
			sourceData.blueprintBench.rows,
			(row) => ({
				label: row.model,
				value: row.score,
			}),
		),
		...sparseBenchmarkRowDrafts(
			"browsecomp",
			sourceData.browseComp.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
		...benchmarkScoreRowDrafts(sourceData.codeMigration.rows),
		...sparseBenchmarkRowDrafts(
			"cursorbench",
			sourceData.cursorBench.rows,
			(row) => {
				const canonicalName = cursorBenchCanonicalModelName(row.base_model);
				return {
					identity: canonicalName,
					label: canonicalName,
					reasoningEffort: row.reasoning_effort,
					value: row.score,
				};
			},
		),
		...benchmarkScoreRowDrafts(sourceData.cyberBench.rows),
		...sparseBenchmarkRowDrafts(
			"deep_swe",
			sourceData.deepSWE.defaultEffortRows,
			(row) => ({
				id: row.model,
				identity: row.model,
				label: row.model,
				reasoningEffort: row.reasoning_effort,
				value: row.pass_at_1,
			}),
		),
		...epochBenchmarkRowDrafts(sourceData),
		...benchmarkScoreRowDrafts(sourceData.emb.rows),
		...benchmarkScoreRowDrafts(sourceData.financeAgentV2.rows),
		...sparseBenchmarkRowDrafts(
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
		...surgeBenchmarkRowDrafts(sourceData),
		...modelScoreRowDrafts("harvey_lab", sourceData.harveyLab.rows),
		...benchmarkScoreRowDrafts(sourceData.legalResearch.rows),
		...benchmarkScoreRowDrafts(sourceData.medCode.rows),
		...benchmarkScoreRowDrafts(sourceData.programBench.rows),
		...benchmarkScoreRowDrafts(sourceData.proofBench.rows),
		...benchmarkScoreRowDrafts(sourceData.publicBenefitsBench.rows),
		...modelScoreRowDrafts("terminalbench_v21", sourceData.terminalBench.rows),
		...sparseBenchmarkRowDrafts(
			"toolathlon",
			sourceData.toolathlon.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
		...modelScoreRowDrafts("vals_index", sourceData.valsIndex.rows),
		...sparseBenchmarkRowDrafts(
			"vending_bench_2",
			sourceData.vendingBench2.rows,
			(row) => ({
				identity: row.base_model,
				label: row.model,
				reasoningEffort: row.reasoning_effort,
				value: row.final_balance_usd,
			}),
		),
		...benchmarkScoreRowDrafts(sourceData.vibeCode.rows),
	];
}

/** Live source data enters benchmark-update health through the same draft contract as database restorations. */
export function benchmarkRowsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(benchmarkDraftsFromSourceData(sourceData));
}
