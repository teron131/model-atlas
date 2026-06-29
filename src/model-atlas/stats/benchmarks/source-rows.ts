/** Build benchmark-keyed source rows for update-health checks. */

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

export type BenchmarkSourceRowDraft = {
	key: string;
	id?: string | null;
	label: string | null;
	provider?: string | null;
	value: unknown;
};

type ArtificialAnalysisDraftSource<Row> = {
	rows: readonly Row[];
	modelId: (row: Row) => string | null;
	label: (row: Row, modelId: string | null) => string | null;
	value: (row: Row, key: string) => unknown;
};

function sparseBenchmarkDrafts<T>(
	key: string,
	rows: readonly T[],
	toDraft: (row: T) => Omit<BenchmarkSourceRowDraft, "key">,
): BenchmarkSourceRowDraft[] {
	return rows.map((row) => ({
		key,
		...toDraft(row),
	}));
}

function addBenchmarkDraft(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	draft: BenchmarkSourceRowDraft,
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

/** Groups normalized benchmark row drafts and drops rows without a label or finite value. */
export function benchmarkRowsFromDrafts(
	drafts: readonly BenchmarkSourceRowDraft[],
): BenchmarkRowsByKey {
	const rowsByKey: Record<string, BenchmarkSourceRow[]> = {};
	for (const draft of drafts) {
		addBenchmarkDraft(rowsByKey, draft);
	}
	return rowsByKey;
}

/** Expands Artificial Analysis rows into one draft per supported evaluation key. */
export function artificialAnalysisBenchmarkDrafts<Row>({
	rows,
	modelId,
	label,
	value,
}: ArtificialAnalysisDraftSource<Row>): BenchmarkSourceRowDraft[] {
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

/** Return benchmark update row drafts from in-memory source-data rows. */
function sourceDataBenchmarkDrafts(
	sourceData: LlmStatsSourceData,
): BenchmarkSourceRowDraft[] {
	return [
		...artificialAnalysisBenchmarkDrafts({
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
		...sparseBenchmarkDrafts(
			"agents_last_exam",
			sourceData.agentsLastExam.rows,
			(row) => ({
				label: row.model,
				value: row.median_score,
			}),
		),
		...sparseBenchmarkDrafts(
			"automation_bench",
			sourceData.automationBench.rows,
			(row) => ({
				label: row.model,
				value: row.adjusted_score,
			}),
		),
		...sparseBenchmarkDrafts(
			"blueprint_bench_2",
			sourceData.blueprintBench.rows,
			(row) => ({
				label: row.model,
				value: row.score,
			}),
		),
		...sparseBenchmarkDrafts(
			"browsecomp",
			sourceData.browseComp.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
		...sparseBenchmarkDrafts(
			"cursorbench",
			sourceData.cursorBench.rows,
			(row) => ({
				label: row.model,
				value: row.score,
			}),
		),
		...sparseBenchmarkDrafts("deep_swe", sourceData.deepSWE.rows, (row) => ({
			label: row.model,
			value: row.pass_at_1,
		})),
		...sparseBenchmarkDrafts("gdp_pdf", sourceData.gdpPdf.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		...sparseBenchmarkDrafts(
			"riemann_bench",
			sourceData.riemannBench.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
		...sparseBenchmarkDrafts(
			"terminal_bench_2",
			sourceData.terminalBench.rows,
			(row) => ({
				label: row.model,
				value: row.median_accuracy,
			}),
		),
		...sparseBenchmarkDrafts(
			"toolathlon",
			sourceData.toolathlon.rows,
			(row) => ({
				label: row.model,
				provider: row.provider,
				value: row.score,
			}),
		),
	];
}

/** Builds benchmark update rows from fresh source snapshots using the shared draft contract. */
export function benchmarkRowsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkRowsByKey {
	return benchmarkRowsFromDrafts(sourceDataBenchmarkDrafts(sourceData));
}
