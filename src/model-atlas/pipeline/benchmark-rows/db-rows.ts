/** Translate persisted SQLite row groups into benchmark update source rows. */

import {
	BENCHMARK_OBSERVATION_BINDINGS,
	type BenchmarkObservationRowsKey,
	type PublicBenchmarkRuntimeKeyFor,
} from "../../benchmarks/registry";
import { asFiniteNumber } from "../../runtime";
import { agentsLastExamBenchmarkScore } from "../../scrapers/agents-last-exam";
import { cursorBenchCanonicalModelName } from "../../scrapers/cursorbench";
import {
	asDeepSWERawLeaderboardRow,
	preferredDeepSWELeaderboardRows,
} from "../../scrapers/deep-swe";
import {
	artificialAnalysisModelRowDrafts,
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

type BenchmarkObservationDbRows = {
	[Key in BenchmarkObservationRowsKey]: readonly DbBenchmarkRow[];
};

type BenchmarkDbRows = BenchmarkObservationDbRows & {
	artificialAnalysisRows: readonly DbBenchmarkRow[];
	agentArenaRows: readonly DbBenchmarkRow[];
	agentsLastExamRows: readonly DbBenchmarkRow[];
	aleBenchRows: readonly DbBenchmarkRow[];
	blueprintBenchRows: readonly DbBenchmarkRow[];
	cursorBenchRows: readonly DbBenchmarkRow[];
	deepSWERows: readonly DbBenchmarkRow[];
	frontierCodeRows: readonly DbBenchmarkRow[];
	gdpPdfRows: readonly DbBenchmarkRow[];
	harveyLabRows: readonly DbBenchmarkRow[];
	riemannBenchRows: readonly DbBenchmarkRow[];
	terminalBenchRows: readonly DbBenchmarkRow[];
	valsIndexRows: readonly DbBenchmarkRow[];
	vendingBench2Rows: readonly DbBenchmarkRow[];
};

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function benchmarkObservationDrafts(
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
				provider:
					stringValue(row.model_creator) ??
					stringValue(row.model_creator_id) ??
					stringValue(row.inference_provider),
				reasoningEffort: row.reasoning_effort,
				value: row.canonical_value,
			},
		];
	});
}

function benchmarkObservationDbDrafts(
	rows: BenchmarkDbRows,
): BenchmarkRowDraft[] {
	return BENCHMARK_OBSERVATION_BINDINGS.flatMap(({ sourceRowsKey }) => {
		const sourceRows = rows[sourceRowsKey];
		if (!Array.isArray(sourceRows)) {
			throw new Error(
				`Persisted benchmark observation rows are missing: ${sourceRowsKey}`,
			);
		}
		return benchmarkObservationDrafts(sourceRows);
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

type SparseBenchmarkDbRowAdapter = (
	rows: BenchmarkDbRows,
) => BenchmarkRowDraft[];

/** Persisted sparse row adapters mirror the live sparse registry without sharing row schemas. */
const SPARSE_BENCHMARK_DB_ROW_ADAPTERS = {
	agent_arena: (rows) =>
		rows.agentArenaRows.map((row) => ({
			key: "agent_arena",
			id: stringValue(row.contender_name),
			identity: stringValue(row.base_model),
			label: stringValue(row.model),
			provider: stringValue(row.organization),
			reasoningEffort: row.reasoning_effort,
			value: row.score,
		})),
	agents_last_exam: (rows) =>
		dbSourceDrafts({
			key: "agents_last_exam",
			rows: rows.agentsLastExamRows,
			value: agentsLastExamDbScore,
			rowKind: "model_score",
		}),
	ale_bench: (rows) =>
		rows.aleBenchRows.flatMap((row) =>
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
	blueprint_bench_2: (rows) =>
		dbSourceDrafts({
			key: "blueprint_bench_2",
			rows: rows.blueprintBenchRows,
			value: (row) => row.score,
		}),
	cursorbench: (rows) =>
		rows.cursorBenchRows.flatMap((row) => {
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
	deep_swe: (rows) =>
		preferredDeepSWELeaderboardRows(
			rows.deepSWERows.flatMap((row) => {
				const parsed = asDeepSWERawLeaderboardRow(row);
				return parsed == null ? [] : [parsed];
			}),
		).map((row) => ({
			key: "deep_swe",
			id: row.model,
			identity: row.model,
			label: row.model,
			reasoningEffort: row.reasoning_effort,
			value: row.pass_at_1,
		})),
	frontier_code: (rows) =>
		rows.frontierCodeRows.flatMap((row) =>
			row.score_eligible === 1
				? [
						{
							key: "frontier_code",
							id: stringValue(row.base_model),
							identity: stringValue(row.base_model),
							label: stringValue(row.model),
							reasoningEffort: row.reasoning_effort,
							value: row.main_score,
						},
					]
				: [],
		),
	vending_bench_2: (rows) =>
		rows.vendingBench2Rows.map((row) => ({
			key: "vending_bench_2",
			identity: stringValue(row.base_model),
			label: stringValue(row.model),
			reasoningEffort: row.reasoning_effort,
			value: row.final_balance_usd,
		})),
} satisfies Record<
	PublicBenchmarkRuntimeKeyFor<"sparse">,
	SparseBenchmarkDbRowAdapter
>;

function dbBenchmarkDrafts(rows: BenchmarkDbRows): BenchmarkRowDraft[] {
	return [
		...benchmarkObservationDbDrafts(rows),
		...artificialAnalysisModelRowDrafts({
			rows: rows.artificialAnalysisRows,
			modelId: (row) => stringValue(row.model_id),
			label: (row, modelId) =>
				stringValue(row.name) ?? stringValue(row.short_name) ?? modelId,
			reasoningEffort: (row) => row.reasoning_effort,
			value: (row, key) => row[key],
		}),
		...Object.values(SPARSE_BENCHMARK_DB_ROW_ADAPTERS).flatMap((adapter) =>
			adapter(rows),
		),
		...dbSourceDrafts({
			key: "gdp_pdf",
			rows: rows.gdpPdfRows,
			value: (row) => row.score,
			providerColumn: "provider",
		}),
		...dbSourceDrafts({
			key: "harvey_lab",
			rows: rows.harveyLabRows,
			value: (row) => row.score,
			providerColumn: "provider",
			rowKind: "overall",
		}),
		...dbSourceDrafts({
			key: "riemann_bench",
			rows: rows.riemannBenchRows,
			value: (row) => row.score,
			providerColumn: "provider",
		}),
		...dbSourceDrafts({
			key: "terminalbench_v21",
			rows: rows.terminalBenchRows,
			value: (row) => row.score,
			providerColumn: "provider",
			rowKind: "overall",
		}),
		...dbSourceDrafts({
			key: "vals_index",
			rows: rows.valsIndexRows,
			value: (row) => row.score,
			providerColumn: "provider",
			rowKind: "overall",
		}),
	];
}

/** Persisted benchmark rows enter update-health checks through the same benchmark-keyed contract as live rows. */
export function benchmarkRowsFromDb(rows: BenchmarkDbRows): BenchmarkRowsByKey {
	return finalizeBenchmarkRows(dbBenchmarkDrafts(rows));
}
