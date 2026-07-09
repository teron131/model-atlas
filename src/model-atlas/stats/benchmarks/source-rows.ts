/** Benchmark source-row drafts keep live source snapshots and restored database rows on one health-check contract. */

import { normalizeElo } from "../../math-utils";
import type { ArtificialAnalysisEvaluationResourceRow } from "../../scrapers/artificial-analysis/evaluation-resources";
import { asFiniteNumber, asRecord } from "../../shared";
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
	label: string | null;
	provider?: string | null;
	value: unknown;
};

type ArtificialAnalysisBenchmarkDraftSource<Row> = {
	rows: readonly Row[];
	modelId: (row: Row) => string | null;
	label: (row: Row, modelId: string | null) => string | null;
	value: (row: Row, key: string) => unknown;
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
			label: row.model,
			provider: row.provider,
			value: value(row),
		}),
	);
}

function addBenchmarkRowDraft(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
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
		label: draft.label,
		provider: draft.provider ?? null,
		value,
	});
}

/** Only labeled finite benchmark evidence is allowed into update-health comparisons. */
export function finalizeBenchmarkRows(
	drafts: readonly BenchmarkRowDraft[],
): BenchmarkRowsByKey {
	const rowsByKey: Record<string, BenchmarkSourceRow[]> = {};
	for (const draft of drafts) {
		addBenchmarkRowDraft(rowsByKey, draft);
	}
	return rowsByKey;
}

/** Artificial Analysis rows carry many benchmark keys, so each supported key becomes separate source evidence. */
export function artificialAnalysisBenchmarkRowDrafts<Row>({
	rows,
	modelId,
	label,
	value,
}: ArtificialAnalysisBenchmarkDraftSource<Row>): BenchmarkRowDraft[] {
	return rows.flatMap((row) => {
		const rowModelId = modelId(row);
		const rowLabel = label(row, rowModelId);
		if (rowLabel == null) {
			return [];
		}
		return ARTIFICIAL_ANALYSIS_EVALUATION_KEYS.map((key) => ({
			key,
			id: rowModelId,
			label: rowLabel,
			provider: null,
			value: value(row, key),
		}));
	});
}

function sourceDataBenchmarkDrafts(
	sourceData: LlmStatsSourceData,
): BenchmarkRowDraft[] {
	return [
		...artificialAnalysisBenchmarkRowDrafts({
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
			value: (row, key) => asRecord(asRecord(row).evaluations)[key],
		}),
		...sparseBenchmarkRowDrafts(
			"agents_last_exam",
			sourceData.agentsLastExam.rows,
			(row) => ({
				label: row.model,
				value: row.median_score,
			}),
		),
		...artificialAnalysisEvaluationResourceDrafts(
			"automation_bench",
			sourceData.artificialAnalysisEvaluationResources.rows,
			(row) => row.score,
		),
		...sparseBenchmarkRowDrafts(
			"blueprint_bench_2",
			sourceData.blueprintBench.rows,
			(row) => ({
				label: row.model,
				value: row.score,
			}),
		),
		...artificialAnalysisEvaluationResourceDrafts(
			"briefcase",
			sourceData.artificialAnalysisEvaluationResources.rows,
			(row) => normalizeElo(row.score, 500, 2000),
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
		...sparseBenchmarkRowDrafts(
			"cursorbench",
			sourceData.cursorBench.rows,
			(row) => ({
				label: row.model,
				value: row.score,
			}),
		),
		...sparseBenchmarkRowDrafts("deep_swe", sourceData.deepSWE.rows, (row) => ({
			label: row.model,
			value: row.pass_at_1,
		})),
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
		...sparseBenchmarkRowDrafts(
			"terminalbench_v21",
			sourceData.valsTerminalBench.rows,
			(row) => ({
				id: row.model_id,
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
		...sparseBenchmarkRowDrafts(
			"toolathlon",
			sourceData.toolathlon.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
		...sparseBenchmarkRowDrafts(
			"vals_index",
			sourceData.valsIndex.rows,
			(row) => ({
				id: row.model_id,
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
	];
}

/** Live source data enters benchmark-update health through the same draft contract as database restorations. */
export function benchmarkRowsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(sourceDataBenchmarkDrafts(sourceData));
}
