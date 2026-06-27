/** Build benchmark-keyed source rows for update-health checks. */

import { asFiniteNumber, asRecord } from "../../shared";
import type { LlmStatsSourceData } from "../types";

export const ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS = [
	"apex_agents",
	"critpt",
	"gdpval_normalized",
	"gpqa",
	"hle",
	"lcr",
	"mmmu_pro",
	"scicode",
	"tau_banking",
	"terminalbench_v21",
] as const;

export type BenchmarkSourceRow = {
	id: string | null;
	label: string;
	provider: string | null;
	value: number;
};

export type BenchmarkRowsByKey = Readonly<
	Record<string, readonly BenchmarkSourceRow[]>
>;

type SourceDraft = {
	label: string;
	provider?: string | null;
	value: number | null;
};

type SourceSpec = {
	key: string;
	rows: readonly SourceDraft[];
};

/** Define how one source row list maps into benchmark update rows. */
function sourceSpec<T>(
	key: string,
	rows: readonly T[],
	toDraft: (row: T) => SourceDraft,
): SourceSpec {
	return {
		key,
		rows: rows.map(toDraft),
	};
}

/** Appends one benchmark source row for benchmark update health. */
export function addBenchmarkRow(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	key: string,
	row: BenchmarkSourceRow,
): void {
	rowsByKey[key] ??= [];
	rowsByKey[key].push(row);
}

/** Add rows from one sparse benchmark source into the benchmark-keyed update map. */
function addSourceRows(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	source: SourceSpec,
): void {
	for (const draft of source.rows) {
		if (draft.value == null || !Number.isFinite(draft.value)) {
			continue;
		}
		addBenchmarkRow(rowsByKey, source.key, {
			id: null,
			label: draft.label,
			provider: draft.provider ?? null,
			value: draft.value,
		});
	}
}

/** Return one-benchmark source row mappings for sparse benchmark sources. */
function sparseBenchmarkSources(sourceData: LlmStatsSourceData): SourceSpec[] {
	return [
		sourceSpec("agents_last_exam", sourceData.agentsLastExam.rows, (row) => ({
			label: row.model,
			value: row.median_score,
		})),
		sourceSpec("automation_bench", sourceData.automationBench.rows, (row) => ({
			label: row.model,
			value: row.adjusted_score,
		})),
		sourceSpec("blueprint_bench_2", sourceData.blueprintBench.rows, (row) => ({
			label: row.model,
			value: row.score,
		})),
		sourceSpec("browsecomp", sourceData.browseComp.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		sourceSpec("cursorbench", sourceData.cursorBench.rows, (row) => ({
			label: row.model,
			value: row.score,
		})),
		sourceSpec("deep_swe", sourceData.deepSWE.rows, (row) => ({
			label: row.model,
			value: row.pass_at_1,
		})),
		sourceSpec("gdp_pdf", sourceData.gdpPdf.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		sourceSpec("riemann_bench", sourceData.riemannBench.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
		sourceSpec("terminal_bench_2", sourceData.terminalBench.rows, (row) => ({
			label: row.model,
			value: row.median_accuracy,
		})),
		sourceSpec("toolathlon", sourceData.toolathlon.rows, (row) => ({
			label: row.model,
			provider: row.provider,
			value: row.score,
		})),
	];
}

/** Add Artificial Analysis rows, which carry many benchmark keys in one payload. */
function addArtificialAnalysisRows(
	rowsByKey: Record<string, BenchmarkSourceRow[]>,
	sourceData: LlmStatsSourceData,
): void {
	for (const row of sourceData.artificialAnalysis.rows) {
		const record = asRecord(row);
		const modelId =
			typeof record.model_id === "string" && record.model_id.length > 0
				? record.model_id
				: null;
		const label =
			typeof record.name === "string" && record.name.length > 0
				? record.name
				: modelId;
		if (label == null) {
			continue;
		}
		const evaluations = asRecord(record.evaluations);
		for (const key of ARTIFICIAL_ANALYSIS_HEALTH_BENCHMARK_KEYS) {
			const value = asFiniteNumber(evaluations[key]);
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

/** Converts source benchmark rows into benchmark-keyed update rows. */
export function benchmarkRowsFromSourceData(
	sourceData: LlmStatsSourceData,
): BenchmarkRowsByKey {
	const rowsByKey: Record<string, BenchmarkSourceRow[]> = {};
	addArtificialAnalysisRows(rowsByKey, sourceData);
	for (const source of sparseBenchmarkSources(sourceData)) {
		addSourceRows(rowsByKey, source);
	}
	return rowsByKey;
}
