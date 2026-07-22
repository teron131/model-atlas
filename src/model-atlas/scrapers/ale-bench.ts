/**
 * ALE-Bench scraper preserves Sakana AI refinement rows and validates the shared Epoch contract.
 *
 * Page source: https://sakanaai.github.io/ALE-Bench-Leaderboard
 * JSON source: https://sakanaai.github.io/ALE-Bench-Leaderboard/data/results_summary.json
 */

import type { SourceCrosswalkDiagnostic } from "../benchmarks/source-crosswalk";
import { buildAdditiveSourceCrosswalk } from "../benchmarks/source-crosswalk";
import {
	benchmarkModelEffort,
	canonicalReasoningEffort,
} from "../identity/normalization";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../runtime";

import {
	ALE_BENCH_EPOCH_RESULTS_URL,
	type AleBenchEpochRow,
	processAleBenchEpochCsv,
} from "./epoch/ale-bench";

const ALE_BENCH_SAKANA_RESULTS_URL =
	"https://sakanaai.github.io/ALE-Bench-Leaderboard/data/results_summary.json";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SELF_REFINE_COUNT = 1;
const MIN_CROSSWALK_MODELS = 3;
const MAX_CROSSWALK_MEDIAN_ABSOLUTE_ERROR = 0.01;
const SPLITS = ["all", "short", "long"] as const;
const SLUG_EFFORT_SUFFIX_PATTERN =
	/^(.*)-(ultra|xhigh|extra-high|max|high|medium|low|minimal|none|adaptive)$/;

type AleBenchSummaryStatistics = {
	mean: number;
	median: number;
	min: number;
	max: number;
	stdev: number;
};

type AleBenchSplitStatistics = Record<
	(typeof SPLITS)[number],
	AleBenchSummaryStatistics
>;

type AleBenchTaskResult = {
	problem_id: string;
	code_language: string;
	overall_judge_result: string;
	overall_absolute_score: number;
	overall_relative_score: number;
	max_execution_time_ms: number;
	max_memory_usage_kib: number;
	rank: number;
	performance: number;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	cost: number;
};

export type AleBenchConfigurationRow = {
	model: string;
	detail_path: string;
	num_self_refine: number;
	rank: AleBenchSplitStatistics;
	performance: AleBenchSplitStatistics;
	input_tokens: AleBenchSplitStatistics;
	output_tokens: AleBenchSplitStatistics;
	total_tokens: AleBenchSplitStatistics;
	cost: AleBenchSplitStatistics;
	results: AleBenchTaskResult[];
};

export type AleBenchModelScoreRow = AleBenchConfigurationRow & {
	base_model: string;
	reasoning_effort: string | null;
	score: number;
	cost_per_task_usd: number;
	tokens_per_task: number;
	input_tokens_per_task: number;
	output_tokens_per_task: number;
};

export type AleBenchRowsByModelName = Map<string, AleBenchModelScoreRow>;

type AleBenchCrosswalkStatus = SourceCrosswalkDiagnostic & {
	epochRowCount: number;
	sakanaSourceDefaultRowCount: number;
	missingFromEpoch: string[];
};

type AleBenchPayload = {
	fetched_at_epoch_seconds: number | null;
	data: AleBenchConfigurationRow[];
	epoch_rows: AleBenchEpochRow[];
	crosswalk: AleBenchCrosswalkStatus | null;
};

type AleBenchScraperOptions = {
	sakanaUrl?: string;
	epochUrl?: string;
	timeoutMs?: number;
};

function summaryStatistics(value: unknown): AleBenchSummaryStatistics | null {
	const row = asRecord(value);
	const mean = asFiniteNumber(row.mean);
	const median = asFiniteNumber(row.median);
	const min = asFiniteNumber(row.min);
	const max = asFiniteNumber(row.max);
	const stdev = asFiniteNumber(row.stdev);
	return mean == null ||
		median == null ||
		min == null ||
		max == null ||
		stdev == null
		? null
		: { mean, median, min, max, stdev };
}

/** Parse ALE's slug-style effort suffixes without treating model-family tokens as reasoning labels. */
export function aleBenchModelEffort(model: string) {
	const slugMatch = SLUG_EFFORT_SUFFIX_PATTERN.exec(model);
	if (slugMatch != null) {
		const baseModel = slugMatch[1];
		const reasoningEffort = canonicalReasoningEffort(slugMatch[2]);
		if (baseModel != null && baseModel.length > 0 && reasoningEffort != null) {
			return { baseModel, reasoningEffort };
		}
	}
	return benchmarkModelEffort(model);
}

function splitStatistics(value: unknown): AleBenchSplitStatistics | null {
	const row = asRecord(value);
	const entries = SPLITS.map(
		(split) => [split, summaryStatistics(row[split])] as const,
	);
	return entries.some(([, statistics]) => statistics == null)
		? null
		: (Object.fromEntries(entries) as AleBenchSplitStatistics);
}

function taskResult(value: unknown): AleBenchTaskResult | null {
	const row = asRecord(value);
	if (
		typeof row.problem_id !== "string" ||
		typeof row.code_language !== "string" ||
		typeof row.overall_judge_result !== "string"
	) {
		return null;
	}
	const numericFields = [
		"overall_absolute_score",
		"overall_relative_score",
		"max_execution_time_ms",
		"max_memory_usage_kib",
		"rank",
		"performance",
		"input_tokens",
		"output_tokens",
		"total_tokens",
		"cost",
	] as const;
	const values = Object.fromEntries(
		numericFields.map((field) => [field, asFiniteNumber(row[field])]),
	) as Record<(typeof numericFields)[number], number | null>;
	if (numericFields.some((field) => values[field] == null)) {
		return null;
	}
	return {
		problem_id: row.problem_id,
		code_language: row.code_language,
		overall_judge_result: row.overall_judge_result,
		overall_absolute_score: values.overall_absolute_score as number,
		overall_relative_score: values.overall_relative_score as number,
		max_execution_time_ms: values.max_execution_time_ms as number,
		max_memory_usage_kib: values.max_memory_usage_kib as number,
		rank: values.rank as number,
		performance: values.performance as number,
		input_tokens: values.input_tokens as number,
		output_tokens: values.output_tokens as number,
		total_tokens: values.total_tokens as number,
		cost: values.cost as number,
	};
}

export function processAleBenchConfigurationRow(
	model: string,
	detailPath: string,
	value: unknown,
): AleBenchConfigurationRow | null {
	const row = asRecord(value);
	const numSelfRefine = asFiniteNumber(row.num_self_refine);
	const rank = splitStatistics(row.rank);
	const performance = splitStatistics(row.performance);
	const inputTokens = splitStatistics(row.input_tokens);
	const outputTokens = splitStatistics(row.output_tokens);
	const totalTokens = splitStatistics(row.total_tokens);
	const cost = splitStatistics(row.cost);
	const rawResults = Array.isArray(row.results) ? row.results : [];
	const results = rawResults
		.map(taskResult)
		.filter((result): result is AleBenchTaskResult => result != null);
	if (
		numSelfRefine == null ||
		!Number.isInteger(numSelfRefine) ||
		numSelfRefine < 1 ||
		rank == null ||
		performance == null ||
		inputTokens == null ||
		outputTokens == null ||
		totalTokens == null ||
		cost == null ||
		results.length === 0 ||
		results.length !== rawResults.length
	) {
		return null;
	}
	return {
		model,
		detail_path: detailPath,
		num_self_refine: numSelfRefine,
		rank,
		performance,
		input_tokens: inputTokens,
		output_tokens: outputTokens,
		total_tokens: totalTokens,
		cost,
		results,
	};
}

/** Parse every Sakana model/refinement configuration without collapsing its task evidence. */
export function processAleBenchSakanaPayload(
	value: unknown,
): AleBenchConfigurationRow[] {
	if (!Array.isArray(value)) return [];
	const rows: AleBenchConfigurationRow[] = [];
	for (const candidate of value) {
		const modelRow = asRecord(candidate);
		const model =
			typeof modelRow.model_name === "string"
				? modelRow.model_name.trim()
				: null;
		const detailPath =
			typeof modelRow.detail_path === "string"
				? modelRow.detail_path.trim()
				: null;
		if (
			model == null ||
			model.length === 0 ||
			detailPath == null ||
			detailPath.length === 0 ||
			!Array.isArray(modelRow.overall_results)
		) {
			continue;
		}
		for (const result of modelRow.overall_results) {
			const parsed = processAleBenchConfigurationRow(model, detailPath, result);
			if (parsed != null) rows.push(parsed);
		}
	}
	return rows.sort(
		(left, right) =>
			left.model.localeCompare(right.model) ||
			left.num_self_refine - right.num_self_refine,
	);
}

/** Select the no-feedback-loop row and expose its quality and mean per-task resource contract. */
export function summarizeAleBenchSourceDefaultRows(
	rows: readonly AleBenchConfigurationRow[],
): AleBenchModelScoreRow[] {
	return rows
		.filter((row) => row.num_self_refine === DEFAULT_SELF_REFINE_COUNT)
		.map((row) => {
			const effort = aleBenchModelEffort(row.model);
			return {
				...row,
				base_model: effort.baseModel,
				reasoning_effort: effort.reasoningEffort,
				score: row.performance.all.mean,
				cost_per_task_usd: row.cost.all.mean,
				tokens_per_task: row.total_tokens.all.mean,
				input_tokens_per_task: row.input_tokens.all.mean,
				output_tokens_per_task: row.output_tokens.all.mean,
			};
		});
}

/** Validate that Epoch's rounded mirror and Sakana's observed source-default rows share one numeric scale. */
export function buildAleBenchCrosswalkStatus(
	sakanaRows: readonly AleBenchConfigurationRow[],
	epochRows: readonly AleBenchEpochRow[],
): AleBenchCrosswalkStatus {
	const sourceDefaultRows = summarizeAleBenchSourceDefaultRows(sakanaRows);
	const epochByModel = new Map(epochRows.map((row) => [row.model, row]));
	const items = sourceDefaultRows.map((row) => ({
		id: row.model,
		name: row.model,
		sakanaPerformance: row.performance.all.mean,
		epochPerformance: epochByModel.get(row.model)?.performance ?? null,
	}));
	const crosswalk = buildAdditiveSourceCrosswalk(items, {
		primaryValue: (item) => item.epochPerformance,
		fallbackValue: (item) => item.sakanaPerformance,
		minimumEffectiveModels: MIN_CROSSWALK_MODELS,
		maximumMedianAbsoluteError: MAX_CROSSWALK_MEDIAN_ABSOLUTE_ERROR,
	});
	return {
		...crosswalk.diagnostic,
		epochRowCount: epochRows.length,
		sakanaSourceDefaultRowCount: sourceDefaultRows.length,
		missingFromEpoch: sourceDefaultRows
			.filter((row) => !epochByModel.has(row.model))
			.map((row) => row.model),
	};
}

/** Fetch Sakana observations and independently validate Epoch's overlapping rounded mirror. */
export async function getAleBenchStats(
	options: AleBenchScraperOptions = {},
): Promise<AleBenchPayload> {
	try {
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const sakanaResponse = await fetchWithTimeout(
			options.sakanaUrl ?? ALE_BENCH_SAKANA_RESULTS_URL,
			{},
			timeoutMs,
		);
		if (!sakanaResponse.ok) {
			throw new Error(
				`ALE-Bench Sakana scrape failed: ${sakanaResponse.status}`,
			);
		}
		const data = processAleBenchSakanaPayload(await sakanaResponse.json());
		if (data.length === 0)
			throw new Error("ALE-Bench Sakana scrape returned no rows");

		let epochRows: AleBenchEpochRow[] = [];
		try {
			const epochResponse = await fetchWithTimeout(
				options.epochUrl ?? ALE_BENCH_EPOCH_RESULTS_URL,
				{},
				timeoutMs,
			);
			if (epochResponse.ok)
				epochRows = processAleBenchEpochCsv(await epochResponse.text());
		} catch {
			// Epoch is validation-only and must not block the primary Sakana observation source.
		}
		const crosswalk =
			epochRows.length > 0
				? buildAleBenchCrosswalkStatus(data, epochRows)
				: null;
		if (crosswalk != null && !crosswalk.imputationAllowed) {
			throw new Error("ALE-Bench Epoch and Sakana score contracts diverged");
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data,
			epoch_rows: epochRows,
			crosswalk,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
			epoch_rows: [],
			crosswalk: null,
		};
	}
}
