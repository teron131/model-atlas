/** Data model helpers for the Frontier Efficiency dashboard panel. */

import { median } from "d3-array";
import { benchmarkResourcePolicy } from "../../../src/model-atlas/config/benchmark-portfolio";
import { minMaxScale } from "../../../src/model-atlas/math-utils";
import type {
	BenchmarkPortfolio,
	BenchmarkResourcePolicy,
	LlmStatsModel,
} from "../../../src/model-atlas/stats/types";
import { benchmarkLabels } from "../shared/constants";
import type { AxisScale } from "./axisScale";
import {
	linearAxisScale,
	scoreAxisScale,
	steppedLinearAxisScale,
} from "./axisScale";
import {
	finiteValue,
	fmtCompact,
	fmtDurationShort,
	fmtMoney,
	fmtPercentScore,
	percent,
} from "./format";
import { correlationValue, formatCorrelation, modelKey } from "./models";
import type { HoverRow } from "./types";

export type FrontierEfficiencyAxisKey =
	| "speedValue"
	| "cost"
	| "time"
	| "tokens";
type FrontierEfficiencyResourceMetric = Exclude<
	FrontierEfficiencyAxisKey,
	"speedValue"
>;

export type FrontierEfficiencyRow = {
	benchmarkKey: string;
	benchmarkLabel: string;
	resourcePolicy: BenchmarkResourcePolicy | null;
	benchmarkCount: number;
	model: LlmStatsModel;
	score: number;
	cost: number | null;
	seconds: number | null;
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number | null;
};

export type FrontierEfficiencyAxisConfig = {
	label: string;
	shortLabel: string;
	get: (row: FrontierEfficiencyRow) => number | null;
	selectionScore: (row: FrontierEfficiencyRow) => number | null;
	format: (value: number) => string;
	detailLabel: (row: FrontierEfficiencyRow) => string;
	normalizedLabel: string;
	normalizedDetailLabel: string;
	xHigherBetter?: boolean;
};

export type FrontierEfficiencyOption = {
	key: string;
	label: string;
	count: number;
};

export type FrontierEfficiencyAxisOption = {
	key: FrontierEfficiencyAxisKey;
	label: string;
	disabled?: boolean;
};

export type FrontierEfficiencySummaryRows = {
	leader: FrontierEfficiencyRow;
	highScoreAxisRow: FrontierEfficiencyRow;
	medianScoreAxisRow: FrontierEfficiencyRow;
	labeledRows: Set<FrontierEfficiencyRow>;
};

export const frontierEfficiencyAxisConfig: Record<
	FrontierEfficiencyAxisKey,
	FrontierEfficiencyAxisConfig
> = {
	speedValue: {
		label: "Speed and Value scores",
		shortLabel: "Efficiency",
		get: speedValueBlendScore,
		selectionScore: speedValueBlendScore,
		format: (value) => value.toFixed(0),
		detailLabel: () => "Speed and Value scores",
		normalizedLabel: "Speed and Value scores",
		normalizedDetailLabel: "Speed and Value scores",
		xHigherBetter: true,
	},
	cost: {
		label: "Task Cost ↓",
		shortLabel: "Task Cost ↓",
		get: (row) => row.cost,
		selectionScore: (row) => (row.cost == null ? null : row.score / row.cost),
		format: fmtMoney,
		detailLabel: (row) => resourceMetricLabel(row, "cost"),
		normalizedLabel: "MEAN NORMALIZED cost ↓ (per task/total)",
		normalizedDetailLabel: "MEAN NORMALIZED cost ↓ (per task/total)",
	},
	time: {
		label: "Task Time ↓",
		shortLabel: "Task Time ↓",
		get: (row) => row.seconds,
		selectionScore: (row) =>
			row.seconds == null ? null : row.score / (row.seconds / 86_400),
		format: fmtDurationShort,
		detailLabel: (row) => resourceMetricLabel(row, "time"),
		normalizedLabel: "MEAN NORMALIZED time ↓ (per task/total)",
		normalizedDetailLabel: "MEAN NORMALIZED time ↓ (per task/total)",
	},
	tokens: {
		label: "Task Tokens ↓",
		shortLabel: "Task Tokens ↓",
		get: (row) => row.totalTokens,
		selectionScore: (row) =>
			row.totalTokens == null
				? null
				: row.score / (row.totalTokens / 1_000_000),
		format: fmtCompact,
		detailLabel: (row) => resourceMetricLabel(row, "tokens"),
		normalizedLabel: "MEAN NORMALIZED tokens ↓ (per task/total)",
		normalizedDetailLabel: "MEAN NORMALIZED tokens ↓ (per task/total)",
	},
};

const FRONTIER_SCORE_AXIS_OPTIONS = {
	formatTick: (tick: number) => `${tick}%`,
};

const BENCHMARK_SCORE_AXIS_OPTIONS = {
	formatTick: (tick: number) => `${tick}%`,
	max: 100,
	minimumTicks: 5,
	steps: [10, 5, 2] as const,
};

/** Build one benchmark-resource row per model and frontier benchmark score. */
export function frontierEfficiencyRows(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): FrontierEfficiencyRow[] {
	const frontierKeys = Object.entries(portfolio)
		.filter(([, entry]) => entry.group === "frontier")
		.map(([key]) => key);
	return models
		.flatMap((model): FrontierEfficiencyRow[] => {
			const evaluations = model.evaluations ?? {};
			const taskMetrics = model.task_metrics ?? {};
			return frontierKeys.flatMap((benchmarkKey) => {
				const score = percent(evaluations[benchmarkKey]);
				const resourcePolicy =
					benchmarkResourcePolicy(benchmarkKey, portfolio) ??
					benchmarkResourcePolicy(benchmarkKey);
				const task = frontierResourceTaskMetrics(
					resourcePolicy,
					benchmarkKey,
					taskMetrics,
				);
				const cost = finiteValue(task?.cost);
				const seconds = finiteValue(task?.seconds);
				const inputTokens = finiteValue(task?.input_tokens);
				const outputTokens = finiteValue(task?.output_tokens);
				const totalTokens = frontierResourceTokens(
					resourcePolicy,
					inputTokens,
					outputTokens,
				);
				if (score == null) {
					return [];
				}
				return [
					{
						benchmarkKey,
						benchmarkLabel: benchmarkLabels[benchmarkKey] ?? benchmarkKey,
						resourcePolicy,
						benchmarkCount: 1,
						model,
						score,
						cost: positiveMetric(cost) ? cost : null,
						seconds: positiveMetric(seconds) ? seconds : null,
						inputTokens,
						outputTokens,
						totalTokens: positiveMetric(totalTokens) ? totalTokens : null,
					},
				];
			});
		})
		.sort((left, right) => right.score - left.score);
}

/** Average normalized frontier rows into one aggregate row per model. */
export function meanFrontierEfficiencyRows(
	rows: FrontierEfficiencyRow[],
): FrontierEfficiencyRow[] {
	const rowsByModel = new Map<string, FrontierEfficiencyRow[]>();
	for (const row of rows) {
		const key = modelKey(row.model);
		const current = rowsByModel.get(key) ?? [];
		current.push(row);
		rowsByModel.set(key, current);
	}
	return [...rowsByModel.values()]
		.map((modelRows): FrontierEfficiencyRow | null => {
			const first = modelRows[0];
			if (first == null) {
				return null;
			}
			return {
				benchmarkKey: "all",
				benchmarkLabel: "Normalized frontier score",
				resourcePolicy: null,
				benchmarkCount: modelRows.length,
				model: first.model,
				score: meanNumber(modelRows.map((row) => row.score)),
				cost: meanFiniteMetric(modelRows.map((row) => row.cost)),
				seconds: meanFiniteMetric(modelRows.map((row) => row.seconds)),
				inputTokens: null,
				outputTokens: null,
				totalTokens: meanFiniteMetric(modelRows.map((row) => row.totalTokens)),
			};
		})
		.filter((row): row is FrontierEfficiencyRow => row != null)
		.sort((left, right) => right.score - left.score);
}

/** Normalize each frontier benchmark before building aggregate model means. */
export function normalizedFrontierEfficiencyRows(
	rows: FrontierEfficiencyRow[],
): FrontierEfficiencyRow[] {
	const scoresByBenchmark = new Map<string, number[]>();
	const costsByBenchmark = new Map<string, number[]>();
	const secondsByBenchmark = new Map<string, number[]>();
	const tokensByBenchmark = new Map<string, number[]>();
	for (const row of rows) {
		const scores = scoresByBenchmark.get(row.benchmarkKey) ?? [];
		scores.push(row.score);
		scoresByBenchmark.set(row.benchmarkKey, scores);
		pushBenchmarkValue(costsByBenchmark, row.benchmarkKey, row.cost);
		pushBenchmarkValue(secondsByBenchmark, row.benchmarkKey, row.seconds);
		pushBenchmarkValue(tokensByBenchmark, row.benchmarkKey, row.totalTokens);
	}
	return rows.map((row) => ({
		...row,
		score:
			minMaxScale(scoresByBenchmark.get(row.benchmarkKey) ?? [], row.score) ??
			row.score,
		cost:
			minMaxScale(costsByBenchmark.get(row.benchmarkKey) ?? [], row.cost) ??
			row.cost,
		seconds:
			minMaxScale(
				secondsByBenchmark.get(row.benchmarkKey) ?? [],
				row.seconds,
			) ?? row.seconds,
		totalTokens:
			minMaxScale(
				tokensByBenchmark.get(row.benchmarkKey) ?? [],
				row.totalTokens,
			) ?? row.totalTokens,
	}));
}

/** Build available benchmark toggle options ordered by row count and label. */
export function frontierEfficiencyOptions(
	rows: FrontierEfficiencyRow[],
): FrontierEfficiencyOption[] {
	const counts = new Map<string, FrontierEfficiencyOption>();
	for (const row of rows) {
		const current = counts.get(row.benchmarkKey) ?? {
			key: row.benchmarkKey,
			label: row.benchmarkLabel,
			count: 0,
		};
		current.count += 1;
		counts.set(row.benchmarkKey, current);
	}
	return [...counts.values()].sort(
		(left, right) =>
			right.count - left.count || left.label.localeCompare(right.label),
	);
}

/** Build correlation labels for the aggregate and each frontier benchmark. */
export function frontierEfficiencyCorrelationByBenchmark(
	allRows: FrontierEfficiencyRow[],
	meanRows: FrontierEfficiencyRow[],
): Map<string, string> {
	const correlations = new Map<string, string>([
		["all", frontierEfficiencyCorrelation(meanRows)],
	]);
	for (const [benchmarkKey, benchmarkRows] of groupRowsByBenchmark(allRows)) {
		correlations.set(
			benchmarkKey,
			frontierEfficiencyCorrelation(benchmarkRows),
		);
	}
	return correlations;
}

/** Choose axis toggle options and disable unavailable resource metrics. */
export function frontierEfficiencyAxisOptions(
	sourceRows: FrontierEfficiencyRow[],
	isAllBenchmark: boolean,
): FrontierEfficiencyAxisOption[] {
	return Object.entries(frontierEfficiencyAxisConfig).map(([key, config]) => {
		const axisOptionKey = key as FrontierEfficiencyAxisKey;
		const axisOptionConfig = frontierEfficiencyAxisConfigFor(
			axisOptionKey,
			isAllBenchmark,
		);
		return {
			key: axisOptionKey,
			label: config.shortLabel,
			disabled: !sourceRows.some((row) =>
				positiveMetric(axisOptionConfig.get(row)),
			),
		};
	});
}

/** Pick the requested axis or fall back to the first useful resource axis. */
export function selectedFrontierEfficiencyAxisKey(
	axisKey: FrontierEfficiencyAxisKey,
	axisOptions: FrontierEfficiencyAxisOption[],
): FrontierEfficiencyAxisKey {
	return axisOptions.some(
		(option) => option.key === axisKey && !option.disabled,
	)
		? axisKey
		: (firstAvailableAxis(axisOptions, "speedValue") ??
				firstAvailableAxis(axisOptions, "cost") ??
				axisOptions.find((option) => !option.disabled)?.key ??
				axisKey);
}

/** Return the requested axis when it can be selected in the current row set. */
function firstAvailableAxis(
	axisOptions: FrontierEfficiencyAxisOption[],
	axisKey: FrontierEfficiencyAxisKey,
): FrontierEfficiencyAxisKey | null {
	const option = axisOptions.find((candidate) => candidate.key === axisKey);
	return option != null && !option.disabled ? option.key : null;
}

/** Adapt axis config for aggregate normalized benchmark rows. */
export function frontierEfficiencyAxisConfigFor(
	axisKey: FrontierEfficiencyAxisKey,
	isAllBenchmark: boolean,
): FrontierEfficiencyAxisConfig {
	const axisConfig = frontierEfficiencyAxisConfig[axisKey];
	if (!isAllBenchmark || isEfficiencyScoreAxis(axisKey)) {
		return axisConfig;
	}
	return {
		...axisConfig,
		label: axisConfig.normalizedLabel,
		selectionScore: (row) => {
			const value = axisConfig.get(row);
			return value == null ? null : row.score / Math.max(value, 1);
		},
		format: (value) => value.toFixed(0),
		detailLabel: () => axisConfig.normalizedDetailLabel,
	};
}

/** Describe what the selected Frontier Efficiency x-axis means. */
export function frontierAxisDescription(
	axisKey: FrontierEfficiencyAxisKey,
	isAllBenchmark: boolean,
	row?: FrontierEfficiencyRow,
): string {
	if (axisKey === "speedValue") {
		return "Efficiency combines public Speed and Value scores with equal weight.";
	}
	if (axisKey === "cost") {
		return isAllBenchmark
			? "Task Cost is MEAN NORMALIZED cost across each frontier benchmark's own per-task or total resource policy."
			: `Task Cost is the observed ${resourceUnitPhrase(row)} dollars for the selected benchmark.`;
	}
	if (axisKey === "time") {
		return isAllBenchmark
			? "Task Time is MEAN NORMALIZED runtime across each frontier benchmark's own per-task or total resource policy."
			: `Task Time is the observed ${resourceUnitPhrase(row)} runtime for the selected benchmark.`;
	}
	return isAllBenchmark
		? "Task Tokens is MEAN NORMALIZED token use across each frontier benchmark's own per-task or total resource policy."
		: `Task Tokens is the observed ${resourceUnitPhrase(row)} ${tokenUsePhrase(row)} for the selected benchmark.`;
}

/** Return the visible x-axis label for the selected benchmark and metric. */
export function frontierAxisMetricLabel(
	axisConfig: FrontierEfficiencyAxisConfig,
	isAllBenchmark: boolean,
	rows: FrontierEfficiencyRow[],
): string {
	if (isAllBenchmark) {
		return axisConfig.label;
	}
	const row = rows.find((candidate) =>
		positiveMetric(axisConfig.get(candidate)),
	);
	return row == null ? axisConfig.label : axisConfig.detailLabel(row);
}

/** Summarize leader, cost-efficiency, and budget rows for the panel cards and labels. */
export function frontierEfficiencySummaryRows(
	rows: FrontierEfficiencyRow[],
	axisConfig: FrontierEfficiencyAxisConfig,
): FrontierEfficiencySummaryRows | null {
	const leader = rows[0];
	if (leader == null) {
		return null;
	}
	const medianScore = median(rows.map((row) => row.score)) ?? leader.score;
	const highScoreFloor = leader.score * 0.8;
	const medianScoreAxisRow = bestAxisRowAtOrAboveScore(
		rows,
		axisConfig,
		medianScore,
		leader,
	);
	const highScoreAxisRow = bestAxisRowAtOrAboveScore(
		rows,
		axisConfig,
		highScoreFloor,
		leader,
	);
	const labeledRows = new Set(
		[leader, highScoreAxisRow, medianScoreAxisRow].filter(
			(row): row is FrontierEfficiencyRow => row != null,
		),
	);
	return {
		leader,
		highScoreAxisRow,
		medianScoreAxisRow,
		labeledRows,
	};
}

/** Format the score and resource metric detail for a summary card. */
export function axisSummaryDetail(
	row: FrontierEfficiencyRow,
	axisConfig: FrontierEfficiencyAxisConfig,
): string {
	return `${fmtPercentScore(row.score)} / ${axisConfig.detailLabel(row)} ${axisConfig.format(
		axisConfig.get(row) ?? 0,
	)}`;
}

/** Compute the y-axis scale for aggregate or selected benchmark scores. */
export function frontierScoreAxisScale(
	values: number[],
	isAllBenchmark: boolean,
): AxisScale {
	if (isAllBenchmark) {
		return scoreAxisScale(values, FRONTIER_SCORE_AXIS_OPTIONS);
	}
	return steppedLinearAxisScale(values, BENCHMARK_SCORE_AXIS_OPTIONS);
}

/** Compute the x-axis scale for the selected resource metric. */
export function frontierXAxisScale(
	values: number[],
	axisKey: FrontierEfficiencyAxisKey,
	axisConfig: FrontierEfficiencyAxisConfig,
): AxisScale {
	if (isEfficiencyScoreAxis(axisKey)) {
		return scoreAxisScale(values, {
			formatTick: axisConfig.format,
		});
	}
	return linearAxisScale(values, {
		formatTick: axisConfig.format,
		min: 0,
	});
}

/** Build hover table rows for a Frontier Efficiency point. */
export function frontierEfficiencyHoverRows(
	row: FrontierEfficiencyRow,
	axisConfig: FrontierEfficiencyAxisConfig,
): HoverRow[] {
	const rows: HoverRow[] = [];
	rows.push(
		[
			row.benchmarkKey === "all"
				? "MEAN NORMALIZED benchmark score"
				: "Benchmark score",
			fmtPercentScore(row.score),
		],
		[axisConfig.detailLabel(row), axisConfig.format(axisConfig.get(row) ?? 0)],
	);
	if (axisConfig.get !== speedValueBlendScore) {
		rows.push(["Speed and Value scores", speedValueBlendScore(row).toFixed(1)]);
	}
	return rows;
}

/** Return the public speed side of the bubble blend. */
export function speedScore(row: FrontierEfficiencyRow): number {
	return finiteValue(row.model.scores?.speed_score) ?? 0;
}

/** Return the value side of the bubble blend. */
export function valueScore(row: FrontierEfficiencyRow): number {
	return finiteValue(row.model.scores?.value_score) ?? 0;
}

/** Return the 50/50 speed-value blend used for Frontier Efficiency bubble size. */
export function speedValueBlendScore(row: FrontierEfficiencyRow): number {
	return (valueScore(row) + speedScore(row)) / 2;
}

/** Check whether the selected x-axis is a normalized efficiency score. */
export function isEfficiencyScoreAxis(
	axisKey: FrontierEfficiencyAxisKey,
): boolean {
	return axisKey === "speedValue";
}

/** Check that a resource metric can be plotted on a lower-is-better axis. */
export function positiveMetric(value: number | null): value is number {
	return value != null && value > 0;
}

/** Calculate the arithmetic mean for non-empty numeric values. */
function meanNumber(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Calculate the arithmetic mean while ignoring missing metrics. */
function meanFiniteMetric(values: Array<number | null>): number | null {
	const finiteValues = values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	return finiteValues.length === 0 ? null : meanNumber(finiteValues);
}

/** Return the task metric object selected by a benchmark resource policy. */
function frontierResourceTaskMetrics(
	resourcePolicy: BenchmarkResourcePolicy | null,
	benchmarkKey: string,
	taskMetrics: NonNullable<LlmStatsModel["task_metrics"]>,
) {
	if (resourcePolicy == null) {
		return null;
	}
	return taskMetrics[benchmarkKey];
}

/** Calculate the token metric selected by the benchmark resource policy. */
function frontierResourceTokens(
	resourcePolicy: BenchmarkResourcePolicy | null,
	inputTokens: number | null,
	outputTokens: number | null,
): number | null {
	if (resourcePolicy == null) {
		return null;
	}
	if (resourcePolicy.tokenMeasure === "output_tokens") {
		return outputTokens != null && outputTokens > 0 ? outputTokens : null;
	}
	return inputTokens != null && inputTokens > 0
		? inputTokens + Math.max(outputTokens ?? 0, 0)
		: outputTokens != null && outputTokens > 0
			? outputTokens
			: null;
}

/** Append present benchmark values into their per-benchmark bucket. */
function pushBenchmarkValue(
	valuesByBenchmark: Map<string, number[]>,
	benchmarkKey: string,
	value: number | null,
): void {
	if (value == null) {
		return;
	}
	const values = valuesByBenchmark.get(benchmarkKey) ?? [];
	values.push(value);
	valuesByBenchmark.set(benchmarkKey, values);
}

/** Return the best resource-efficiency row above the requested score. */
function bestAxisRowAtOrAboveScore(
	rows: FrontierEfficiencyRow[],
	axisConfig: FrontierEfficiencyAxisConfig,
	minScore: number,
	fallback: FrontierEfficiencyRow,
): FrontierEfficiencyRow {
	return (
		[...rows]
			.filter((row) => row.score >= minScore)
			.sort(
				(left, right) =>
					(axisConfig.selectionScore(right) ?? Number.NEGATIVE_INFINITY) -
					(axisConfig.selectionScore(left) ?? Number.NEGATIVE_INFINITY),
			)[0] ?? fallback
	);
}

/** Format the intelligence-score correlation label for chart rows. */
function frontierEfficiencyCorrelation(rows: FrontierEfficiencyRow[]): string {
	return formatCorrelation(
		correlationValue(
			rows.flatMap((row) => {
				const intelligenceScore = finiteValue(
					row.model.scores?.intelligence_score,
				);
				if (intelligenceScore == null) {
					return [];
				}
				return [
					{
						x: row.score,
						y: intelligenceScore,
					},
				];
			}),
		),
	);
}

/** Group rows by the benchmark key that produced them. */
function groupRowsByBenchmark(
	rows: FrontierEfficiencyRow[],
): Map<string, FrontierEfficiencyRow[]> {
	const rowsByBenchmark = new Map<string, FrontierEfficiencyRow[]>();
	for (const row of rows) {
		const current = rowsByBenchmark.get(row.benchmarkKey) ?? [];
		current.push(row);
		rowsByBenchmark.set(row.benchmarkKey, current);
	}
	return rowsByBenchmark;
}

/** Format the metric label shown for the selected resource policy. */
function resourceMetricLabel(
	row: FrontierEfficiencyRow,
	metric: FrontierEfficiencyResourceMetric,
): string {
	if (row.benchmarkKey === "all") {
		return `MEAN NORMALIZED ${resourceMetricName(metric)} (per task/total)`;
	}
	const policy = row.resourcePolicy;
	if (policy == null) {
		return `${row.benchmarkLabel} ${resourceMetricName(metric)}`;
	}
	const metricName = resourceMetricName(metric, policy);
	if (policy.unit === "total") {
		return `${row.benchmarkLabel} total ${metricName}`;
	}
	return `${row.benchmarkLabel} ${metricName} per task`;
}

/** Return the selected benchmark resource unit as prose. */
function resourceUnitPhrase(row?: FrontierEfficiencyRow): string {
	return row?.resourcePolicy?.unit === "total" ? "total" : "per-task";
}

/** Return the token unit selected by the benchmark policy. */
function tokenUsePhrase(row?: FrontierEfficiencyRow): string {
	return row?.resourcePolicy?.tokenMeasure === "output_tokens"
		? "output-token use"
		: "token use";
}

/** Return the human resource metric name for a policy and metric key. */
function resourceMetricName(
	metric: FrontierEfficiencyResourceMetric,
	policy?: BenchmarkResourcePolicy,
): string {
	if (metric === "time") {
		return "time";
	}
	if (metric === "cost") {
		return "cost";
	}
	return policy?.tokenMeasure === "output_tokens" ? "output tokens" : "tokens";
}
