/** Benchmark score rows preserve source evidence while sharing conservative model-effort matching. */

import {
	benchmarkModelEffort,
	canonicalReasoningEffort,
	normalizeModelToken,
	reasoningEffortRank,
} from "../shared";

export type BenchmarkScoreSource = "epoch" | "surge" | "vals" | "weirdml";
export type BenchmarkScoreMetadata = Record<
	string,
	string | number | boolean | null | string[] | number[]
>;

export type BenchmarkScoreRow = {
	benchmark_key: string;
	source: BenchmarkScoreSource;
	source_url: string;
	model_id: string | null;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	provider: string | null;
	rank: number | null;
	score: number;
	score_eligible: boolean;
	standard_error: number | null;
	confidence_low: number | null;
	confidence_high: number | null;
	observed_at: string | null;
	metadata: BenchmarkScoreMetadata;
};

export type BenchmarkScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: BenchmarkScoreRow[];
};

export type BenchmarkScoreByModelName = Map<string, BenchmarkScoreRow>;

function isNewer(row: BenchmarkScoreRow, current: BenchmarkScoreRow): boolean {
	return (row.observed_at ?? "") > (current.observed_at ?? "");
}

/** Prefer an explicit highest effort over an unlabelled source row when both configurations exist. */
function defaultEffortRank(value: unknown): number {
	const effort = canonicalReasoningEffort(value);
	return effort == null ? -1 : reasoningEffortRank(effort);
}

function modelKeys(row: BenchmarkScoreRow): string[] {
	return [row.model_id, row.model, row.base_model]
		.flatMap((value) => {
			if (value == null) return [];
			return [value, value.split("/").at(-1) ?? value];
		})
		.map(normalizeModelToken)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

/** Index one benchmark's eligible rows with exact variants and a source-default base row. */
export function buildBenchmarkScoreMap(
	rows: readonly BenchmarkScoreRow[],
): BenchmarkScoreByModelName {
	const rowsByModel = new Map<string, BenchmarkScoreRow>();
	const defaultByBase = new Map<string, BenchmarkScoreRow>();
	for (const row of rows) {
		if (!row.score_eligible) continue;
		for (const key of modelKeys(row)) {
			const exactKey =
				row.reasoning_effort == null
					? key
					: `${key}--${normalizeModelToken(row.reasoning_effort)}`;
			const current = rowsByModel.get(exactKey);
			if (current == null || isNewer(row, current)) {
				rowsByModel.set(exactKey, row);
			}
		}
		const baseKey = normalizeModelToken(row.base_model);
		const currentDefault = defaultByBase.get(baseKey);
		if (
			currentDefault == null ||
			defaultEffortRank(row.reasoning_effort) >
				defaultEffortRank(currentDefault.reasoning_effort) ||
			(defaultEffortRank(row.reasoning_effort) ===
				defaultEffortRank(currentDefault.reasoning_effort) &&
				isNewer(row, currentDefault))
		) {
			defaultByBase.set(baseKey, row);
		}
	}
	for (const [baseKey, row] of defaultByBase) {
		rowsByModel.set(baseKey, row);
	}
	return rowsByModel;
}

/** Find one score without borrowing a different labelled effort variant. */
export function findBenchmarkScoreRow(
	candidateNames: unknown[],
	targetReasoningEffort: unknown,
	rowsByModel: ReadonlyMap<string, BenchmarkScoreRow>,
): BenchmarkScoreRow | null {
	const targetEffort =
		typeof targetReasoningEffort === "string"
			? normalizeModelToken(targetReasoningEffort)
			: null;
	for (const candidate of candidateNames) {
		if (typeof candidate !== "string" || candidate.length === 0) continue;
		const parsed = benchmarkModelEffort(candidate);
		const effort =
			parsed.reasoningEffort == null
				? targetEffort
				: normalizeModelToken(parsed.reasoningEffort);
		for (const value of [
			candidate,
			parsed.baseModel,
			candidate.split("/").at(-1),
		]) {
			if (value == null) continue;
			const key = normalizeModelToken(value);
			const exactRow =
				effort == null ? null : rowsByModel.get(`${key}--${effort}`);
			const defaultRow = rowsByModel.get(key);
			const row =
				effort == null || defaultRow?.reasoning_effort == null
					? (exactRow ?? defaultRow)
					: exactRow;
			if (row != null) return row;
		}
	}
	return null;
}
