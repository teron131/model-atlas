/** Translate persisted SQLite row groups into benchmark update source rows. */

import { cursorBenchCanonicalModelName } from "../../scrapers/cursorbench";
import {
	asDeepSWERawLeaderboardRow,
	preferredDeepSWELeaderboardRows,
} from "../../scrapers/deep-swe";
import {
	artificialAnalysisBenchmarkRowDrafts,
	type BenchmarkRowDraft,
	type BenchmarkRowsByKey,
	finalizeBenchmarkRows,
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
	toolathlonRows: readonly DbBenchmarkRow[];
	valsIndexRows: readonly DbBenchmarkRow[];
	valsTerminalBenchRows: readonly DbBenchmarkRow[];
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
			key: "terminalbench_v21",
			rows: rows.valsTerminalBenchRows,
			scoreColumn: "score",
			providerColumn: "provider",
			rowKind: "overall",
		},
		{
			key: "toolathlon",
			rows: rows.toolathlonRows,
			scoreColumn: "score",
			providerColumn: "provider",
		},
		{
			key: "vals_index",
			rows: rows.valsIndexRows,
			scoreColumn: "score",
			providerColumn: "provider",
			rowKind: "overall",
		},
	];
}

function dbSourceRowDraft(
	source: DbSourceSpec,
	row: DbBenchmarkRow,
): BenchmarkRowDraft | null {
	if (source.rowKind != null && stringValue(row.row_kind) !== source.rowKind) {
		return null;
	}
	return {
		key: source.key,
		id: stringValue(row.model_id),
		label: stringValue(row.model),
		provider:
			source.providerColumn == null
				? null
				: stringValue(row[source.providerColumn]),
		value: row[source.scoreColumn],
	};
}

function dbBenchmarkDrafts(rows: BenchmarkDbRows): BenchmarkRowDraft[] {
	const deepSWERows = preferredDeepSWELeaderboardRows(
		rows.deepSWERows.flatMap((row) => {
			const parsed = asDeepSWERawLeaderboardRow(row);
			return parsed == null ? [] : [parsed];
		}),
	);
	return [
		...artificialAnalysisBenchmarkRowDrafts({
			rows: rows.artificialAnalysisRows,
			modelId: (row) => stringValue(row.model_id),
			label: (row, modelId) =>
				stringValue(row.name) ?? stringValue(row.short_name) ?? modelId,
			reasoningEffort: (row) => row.reasoning_effort,
			value: (row, key) => row[key],
		}),
		...dbSourceSpecs(rows).flatMap((source) =>
			source.rows.flatMap((row) => dbSourceRowDraft(source, row) ?? []),
		),
		...rows.cursorBenchRows.flatMap((row) => {
			const baseModel = stringValue(row.base_model);
			if (baseModel == null) {
				return [];
			}
			const canonicalName = cursorBenchCanonicalModelName(baseModel);
			return [
				{
					key: "cursorbench",
					identity: canonicalName,
					label: canonicalName,
					reasoningEffort: row.reasoning_effort,
					value: row.score,
				},
			];
		}),
		...deepSWERows.map((row) => ({
			key: "deep_swe",
			id: row.model,
			identity: row.model,
			label: row.model,
			reasoningEffort: row.reasoning_effort,
			value: row.pass_at_1,
		})),
	];
}

/** Persisted benchmark rows enter update-health checks through the same benchmark-keyed contract as live rows. */
export function benchmarkRowsFromDb(rows: BenchmarkDbRows): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(dbBenchmarkDrafts(rows));
}
