/** Build benchmark-keyed source rows from persisted SQLite row groups. */

import { asFiniteNumber } from "../../shared";
import { ARTIFICIAL_ANALYSIS_EVALUATION_KEYS } from "./keys";
import {
	addBenchmarkRow,
	type BenchmarkRowsByKey,
	type BenchmarkSourceRow,
} from "./source-rows";

type DbBenchmarkRow = Record<string, unknown>;

type DbSourceSpec = {
	key: string;
	rows: readonly DbBenchmarkRow[];
	scoreColumn: string;
	providerColumn?: string;
	rowKind?: string;
};

export type BenchmarkDbRows = {
	artificialAnalysisRows: readonly DbBenchmarkRow[];
	agentsLastExamRows: readonly DbBenchmarkRow[];
	blueprintBenchRows: readonly DbBenchmarkRow[];
	browseCompRows: readonly DbBenchmarkRow[];
	cursorBenchRows: readonly DbBenchmarkRow[];
	deepSWERows: readonly DbBenchmarkRow[];
	gdpPdfRows: readonly DbBenchmarkRow[];
	riemannBenchRows: readonly DbBenchmarkRow[];
	terminalBenchRows: readonly DbBenchmarkRow[];
	toolathlonRows: readonly DbBenchmarkRow[];
};

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function dbSourceSpecs(rows: BenchmarkDbRows): DbSourceSpec[] {
	return [
		{
			key: "agents_last_exam",
			rows: rows.agentsLastExamRows,
			scoreColumn: "median_score",
			rowKind: "model_score",
		},
		{
			key: "blueprint_bench_2",
			rows: rows.blueprintBenchRows,
			scoreColumn: "score",
		},
		{
			key: "browsecomp",
			rows: rows.browseCompRows,
			scoreColumn: "score",
			providerColumn: "provider",
		},
		{
			key: "cursorbench",
			rows: rows.cursorBenchRows,
			scoreColumn: "score",
		},
		{
			key: "deep_swe",
			rows: rows.deepSWERows,
			scoreColumn: "pass_at_1",
		},
		{
			key: "gdp_pdf",
			rows: rows.gdpPdfRows,
			scoreColumn: "score",
			providerColumn: "provider",
		},
		{
			key: "riemann_bench",
			rows: rows.riemannBenchRows,
			scoreColumn: "score",
			providerColumn: "provider",
		},
		{
			key: "terminal_bench_2",
			rows: rows.terminalBenchRows,
			scoreColumn: "median_accuracy",
			rowKind: "model_score",
		},
		{
			key: "toolathlon",
			rows: rows.toolathlonRows,
			scoreColumn: "score",
			providerColumn: "provider",
		},
	];
}

/** Add one-benchmark SQLite source rows into the benchmark-keyed update map. */
function addDbSourceRows(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	sources: readonly DbSourceSpec[],
): void {
	for (const source of sources) {
		for (const row of source.rows) {
			addDbSourceRow(rowsByKey, source, row);
		}
	}
}

/** Add one SQLite source row when it has a usable model label and score. */
function addDbSourceRow(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	source: DbSourceSpec,
	row: DbBenchmarkRow,
): void {
	if (source.rowKind != null && stringValue(row.row_kind) !== source.rowKind) {
		return;
	}
	const label = stringValue(row.model);
	const value = asFiniteNumber(row[source.scoreColumn]);
	if (label == null || value == null) {
		return;
	}
	addBenchmarkRow(rowsByKey, source.key, {
		id: null,
		label,
		provider:
			source.providerColumn == null
				? null
				: stringValue(row[source.providerColumn]),
		value,
	});
}

/** Add Artificial Analysis rows, which carry many benchmark keys in one payload. */
function addArtificialAnalysisRows(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	rows: readonly DbBenchmarkRow[],
): void {
	for (const row of rows) {
		const modelId = stringValue(row.model_id);
		const label =
			stringValue(row.name) ?? stringValue(row.short_name) ?? modelId;
		if (label == null) {
			continue;
		}
		for (const key of ARTIFICIAL_ANALYSIS_EVALUATION_KEYS) {
			const value = asFiniteNumber(row[key]);
			if (value == null) {
				continue;
			}
			addBenchmarkRow(rowsByKey, key, {
				id: modelId,
				label,
				provider: null,
				value,
			});
		}
	}
}

/** Converts persisted benchmark source rows into benchmark-keyed update rows. */
export function benchmarkRowsFromDb(rows: BenchmarkDbRows): BenchmarkRowsByKey {
	const rowsByKey: Record<string, BenchmarkSourceRow[]> = {};
	addArtificialAnalysisRows(rowsByKey, rows.artificialAnalysisRows);
	addDbSourceRows(rowsByKey, dbSourceSpecs(rows));
	return rowsByKey;
}
