/** Translate persisted SQLite row groups into benchmark update source rows. */

import { agentsLastExamBenchmarkScore } from "../../scrapers/agents-last-exam";
import { cursorBenchCanonicalModelName } from "../../scrapers/cursorbench";
import {
	asDeepSWERawLeaderboardRow,
	preferredDeepSWELeaderboardRows,
} from "../../scrapers/deep-swe";
import { asFiniteNumber } from "../../shared";
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
	value: (row: DbBenchmarkRow) => unknown;
	providerColumn?: string;
	rowKind?: string;
};

export type BenchmarkDbRows = {
	agentArenaRows: readonly DbBenchmarkRow[];
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
	vendingBench2Rows: readonly DbBenchmarkRow[];
};

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Persisted ALE health rows use the same median-or-mean rule as scoring. */
function agentsLastExamDbScore(row: DbBenchmarkRow): number | null {
	const medianScore = asFiniteNumber(row.median_score);
	const meanScore = asFiniteNumber(row.mean_score);
	return medianScore == null || meanScore == null
		? null
		: agentsLastExamBenchmarkScore({
				median_score: medianScore,
				mean_score: meanScore,
			});
}

function dbSourceSpecs(rows: BenchmarkDbRows): DbSourceSpec[] {
	return [
		{
			key: "agents_last_exam",
			rows: rows.agentsLastExamRows,
			value: agentsLastExamDbScore,
			rowKind: "model_score",
		},
		{
			key: "blueprint_bench_2",
			rows: rows.blueprintBenchRows,
			value: (row) => row.score,
		},
		{
			key: "browsecomp",
			rows: rows.browseCompRows,
			value: (row) => row.score,
			providerColumn: "provider",
		},
		{
			key: "gdp_pdf",
			rows: rows.gdpPdfRows,
			value: (row) => row.score,
			providerColumn: "provider",
		},
		{
			key: "riemann_bench",
			rows: rows.riemannBenchRows,
			value: (row) => row.score,
			providerColumn: "provider",
		},
		{
			key: "terminalbench_v21",
			rows: rows.valsTerminalBenchRows,
			value: (row) => row.score,
			providerColumn: "provider",
			rowKind: "overall",
		},
		{
			key: "toolathlon",
			rows: rows.toolathlonRows,
			value: (row) => row.score,
			providerColumn: "provider",
		},
		{
			key: "vals_index",
			rows: rows.valsIndexRows,
			value: (row) => row.score,
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
		value: source.value(row),
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
		...rows.agentArenaRows.map((row) => ({
			key: "agent_arena",
			id: stringValue(row.contender_name),
			identity: stringValue(row.base_model),
			label: stringValue(row.model),
			provider: stringValue(row.organization),
			reasoningEffort: row.reasoning_effort,
			value: row.score,
		})),
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
		...rows.vendingBench2Rows.map((row) => ({
			key: "vending_bench_2",
			identity: stringValue(row.base_model),
			label: stringValue(row.model),
			reasoningEffort: row.reasoning_effort,
			value: row.final_balance_usd,
		})),
	];
}

/** Persisted benchmark rows enter update-health checks through the same benchmark-keyed contract as live rows. */
export function benchmarkRowsFromDb(rows: BenchmarkDbRows): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(dbBenchmarkDrafts(rows));
}
