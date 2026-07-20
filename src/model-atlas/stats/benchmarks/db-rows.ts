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
	artificialAnalysisRows: readonly DbBenchmarkRow[];
	agentArenaRows: readonly DbBenchmarkRow[];
	agentsLastExamRows: readonly DbBenchmarkRow[];
	aleBenchRows: readonly DbBenchmarkRow[];
	blueprintBenchRows: readonly DbBenchmarkRow[];
	browseCompRows: readonly DbBenchmarkRow[];
	chartographyRows: readonly DbBenchmarkRow[];
	chessPuzzleRows: readonly DbBenchmarkRow[];
	cursorBenchRows: readonly DbBenchmarkRow[];
	deepSWERows: readonly DbBenchmarkRow[];
	ebrBenchRows: readonly DbBenchmarkRow[];
	enterpriseBenchCoreCraftRows: readonly DbBenchmarkRow[];
	epochCapabilitiesIndexRows: readonly DbBenchmarkRow[];
	frontierMathTier4Rows: readonly DbBenchmarkRow[];
	gdpPdfRows: readonly DbBenchmarkRow[];
	handbookMdRows: readonly DbBenchmarkRow[];
	proofBenchRows: readonly DbBenchmarkRow[];
	riemannBenchRows: readonly DbBenchmarkRow[];
	valsTerminalBenchRows: readonly DbBenchmarkRow[];
	toolathlonRows: readonly DbBenchmarkRow[];
	valsIndexRows: readonly DbBenchmarkRow[];
	vendingBench2Rows: readonly DbBenchmarkRow[];
	weirdMlRows: readonly DbBenchmarkRow[];
};

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function benchmarkScoreDrafts(
	rows: readonly DbBenchmarkRow[],
): BenchmarkRowDraft[] {
	return rows.flatMap((row) => {
		if (row.score_eligible !== 1) return [];
		const key = stringValue(row.benchmark_key);
		if (key == null) return [];
		return [
			{
				key,
				id: stringValue(row.model_id),
				identity: stringValue(row.base_model),
				label: stringValue(row.model),
				provider: stringValue(row.provider),
				reasoningEffort: row.reasoning_effort,
				value: row.score,
			},
		];
	});
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

function dbSourceDrafts(source: DbSourceSpec): BenchmarkRowDraft[] {
	return source.rows.flatMap((row) => dbSourceRowDraft(source, row) ?? []);
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
		...rows.agentArenaRows.map((row) => ({
			key: "agent_arena",
			id: stringValue(row.contender_name),
			identity: stringValue(row.base_model),
			label: stringValue(row.model),
			provider: stringValue(row.organization),
			reasoningEffort: row.reasoning_effort,
			value: row.score,
		})),
		...dbSourceDrafts({
			key: "agents_last_exam",
			rows: rows.agentsLastExamRows,
			value: agentsLastExamDbScore,
			rowKind: "model_score",
		}),
		...rows.aleBenchRows.flatMap((row) =>
			asFiniteNumber(row.num_self_refine) === 1
				? [
						{
							key: "ale_bench",
							id: stringValue(row.base_model),
							identity: stringValue(row.base_model),
							label: stringValue(row.base_model),
							reasoningEffort: row.reasoning_effort,
							value: row.performance_mean,
						},
					]
				: [],
		),
		...dbSourceDrafts({
			key: "blueprint_bench_2",
			rows: rows.blueprintBenchRows,
			value: (row) => row.score,
		}),
		...dbSourceDrafts({
			key: "browsecomp",
			rows: rows.browseCompRows,
			value: (row) => row.score,
			providerColumn: "provider",
		}),
		...benchmarkScoreDrafts(rows.chartographyRows),
		...benchmarkScoreDrafts(rows.chessPuzzleRows),
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
		...benchmarkScoreDrafts(rows.ebrBenchRows),
		...benchmarkScoreDrafts(rows.enterpriseBenchCoreCraftRows),
		...benchmarkScoreDrafts(rows.epochCapabilitiesIndexRows),
		...benchmarkScoreDrafts(rows.frontierMathTier4Rows),
		...dbSourceDrafts({
			key: "gdp_pdf",
			rows: rows.gdpPdfRows,
			value: (row) => row.score,
			providerColumn: "provider",
		}),
		...benchmarkScoreDrafts(rows.handbookMdRows),
		...benchmarkScoreDrafts(rows.proofBenchRows),
		...dbSourceDrafts({
			key: "riemann_bench",
			rows: rows.riemannBenchRows,
			value: (row) => row.score,
			providerColumn: "provider",
		}),
		...dbSourceDrafts({
			key: "terminalbench_v21",
			rows: rows.valsTerminalBenchRows,
			value: (row) => row.score,
			providerColumn: "provider",
			rowKind: "overall",
		}),
		...dbSourceDrafts({
			key: "toolathlon",
			rows: rows.toolathlonRows,
			value: (row) => row.score,
			providerColumn: "provider",
		}),
		...dbSourceDrafts({
			key: "vals_index",
			rows: rows.valsIndexRows,
			value: (row) => row.score,
			providerColumn: "provider",
			rowKind: "overall",
		}),
		...rows.vendingBench2Rows.map((row) => ({
			key: "vending_bench_2",
			identity: stringValue(row.base_model),
			label: stringValue(row.model),
			reasoningEffort: row.reasoning_effort,
			value: row.final_balance_usd,
		})),
		...benchmarkScoreDrafts(rows.weirdMlRows),
	];
}

/** Persisted benchmark rows enter update-health checks through the same benchmark-keyed contract as live rows. */
export function benchmarkRowsFromDb(rows: BenchmarkDbRows): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(dbBenchmarkDrafts(rows));
}
