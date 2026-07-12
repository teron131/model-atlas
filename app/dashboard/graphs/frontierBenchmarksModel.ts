/** Data model helpers for the Frontier Benchmarks dashboard panel. */

import { median } from "d3-array";
import { benchmarkResourcePolicy } from "../../../src/model-atlas/config/benchmark-portfolio";
import { minMaxScale } from "../../../src/model-atlas/math-utils";
import type {
	BenchmarkPortfolio,
	BenchmarkResourcePolicy,
	LlmStatsModel,
} from "../../../src/model-atlas/stats/types";
import { benchmarkLabels } from "../shared/constants";
import { modelVariantKey } from "../shared/modelDisplay";
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
import { correlationValue, formatCorrelation, groupBy } from "./models";
import type { HoverRow } from "./types";

export type FrontierBenchmarkAxisKey =
	| "speedValue"
	| "cost"
	| "time"
	| "tokens";
type FrontierBenchmarkResourceMetric = Exclude<
	FrontierBenchmarkAxisKey,
	"speedValue"
>;

export type FrontierBenchmarkRow = {
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

export type FrontierBenchmarkAxisConfig = {
	label: string;
	shortLabel: string;
	get: (row: FrontierBenchmarkRow) => number | null;
	selectionScore: (row: FrontierBenchmarkRow) => number | null;
	format: (value: number) => string;
	detailLabel: (row: FrontierBenchmarkRow) => string;
	normalizedLabel: string;
	normalizedDetailLabel: string;
	xHigherBetter?: boolean;
};

export type FrontierBenchmarkOption = {
	key: string;
	label: string;
	count: number;
};

export type FrontierBenchmarkAxisOption = {
	key: FrontierBenchmarkAxisKey;
	label: string;
	disabled?: boolean;
};

export type FrontierBenchmarkSummaryRows = {
	leader: FrontierBenchmarkRow;
	highScoreAxisRow: FrontierBenchmarkRow;
	medianScoreAxisRow: FrontierBenchmarkRow;
	labeledRows: Set<FrontierBenchmarkRow>;
};

export const frontierBenchmarkAxisConfig: Record<
	FrontierBenchmarkAxisKey,
	FrontierBenchmarkAxisConfig
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

export function frontierBenchmarkRows(
	models: LlmStatsModel[],
	portfolio: BenchmarkPortfolio,
): FrontierBenchmarkRow[] {
	const frontierKeys = Object.entries(portfolio)
		.filter(([, entry]) => entry.group === "frontier")
		.map(([key]) => key);
	return models
		.flatMap((model): FrontierBenchmarkRow[] => {
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

export function meanFrontierBenchmarkRows(
	rows: FrontierBenchmarkRow[],
): FrontierBenchmarkRow[] {
	return [...groupBy(rows, (row) => modelVariantKey(row.model)).values()]
		.map((modelRows): FrontierBenchmarkRow | null => {
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
		.filter((row): row is FrontierBenchmarkRow => row != null)
		.sort((left, right) => right.score - left.score);
}

export function normalizedFrontierBenchmarkRows(
	rows: FrontierBenchmarkRow[],
): FrontierBenchmarkRow[] {
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

export function frontierBenchmarkOptions(
	rows: FrontierBenchmarkRow[],
): FrontierBenchmarkOption[] {
	const counts = new Map<string, FrontierBenchmarkOption>();
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
			left.label.localeCompare(right.label, undefined, { numeric: true }) ||
			right.count - left.count,
	);
}

export function frontierBenchmarkCorrelationByBenchmark(
	allRows: FrontierBenchmarkRow[],
	meanRows: FrontierBenchmarkRow[],
): Map<string, string> {
	const correlations = new Map<string, string>([
		["all", frontierBenchmarkCorrelation(meanRows)],
	]);
	for (const [benchmarkKey, benchmarkRows] of groupBy(
		allRows,
		(row) => row.benchmarkKey,
	)) {
		correlations.set(benchmarkKey, frontierBenchmarkCorrelation(benchmarkRows));
	}
	return correlations;
}

export function frontierBenchmarkAxisOptions(
	sourceRows: FrontierBenchmarkRow[],
	isAllBenchmark: boolean,
): FrontierBenchmarkAxisOption[] {
	return Object.entries(frontierBenchmarkAxisConfig).map(([key, config]) => {
		const axisOptionKey = key as FrontierBenchmarkAxisKey;
		const axisOptionConfig = frontierBenchmarkAxisConfigFor(
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

export function selectedFrontierBenchmarkAxisKey(
	axisKey: FrontierBenchmarkAxisKey,
	axisOptions: FrontierBenchmarkAxisOption[],
): FrontierBenchmarkAxisKey {
	return axisOptions.some(
		(option) => option.key === axisKey && !option.disabled,
	)
		? axisKey
		: (firstAvailableAxis(axisOptions, "speedValue") ??
				firstAvailableAxis(axisOptions, "cost") ??
				axisOptions.find((option) => !option.disabled)?.key ??
				axisKey);
}

function firstAvailableAxis(
	axisOptions: FrontierBenchmarkAxisOption[],
	axisKey: FrontierBenchmarkAxisKey,
): FrontierBenchmarkAxisKey | null {
	const option = axisOptions.find((candidate) => candidate.key === axisKey);
	return option != null && !option.disabled ? option.key : null;
}

export function frontierBenchmarkAxisConfigFor(
	axisKey: FrontierBenchmarkAxisKey,
	isAllBenchmark: boolean,
): FrontierBenchmarkAxisConfig {
	const axisConfig = frontierBenchmarkAxisConfig[axisKey];
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

export function frontierAxisDescription(
	axisKey: FrontierBenchmarkAxisKey,
	isAllBenchmark: boolean,
	row?: FrontierBenchmarkRow,
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

export function frontierAxisMetricLabel(
	axisConfig: FrontierBenchmarkAxisConfig,
	isAllBenchmark: boolean,
	rows: FrontierBenchmarkRow[],
): string {
	if (isAllBenchmark) {
		return axisConfig.label;
	}
	const row = rows.find((candidate) =>
		positiveMetric(axisConfig.get(candidate)),
	);
	return row == null ? axisConfig.label : axisConfig.detailLabel(row);
}

export function frontierBenchmarkSummaryRows(
	rows: FrontierBenchmarkRow[],
	axisConfig: FrontierBenchmarkAxisConfig,
): FrontierBenchmarkSummaryRows | null {
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
			(row): row is FrontierBenchmarkRow => row != null,
		),
	);
	return {
		leader,
		highScoreAxisRow,
		medianScoreAxisRow,
		labeledRows,
	};
}

export function axisSummaryDetail(
	row: FrontierBenchmarkRow,
	axisConfig: FrontierBenchmarkAxisConfig,
): string {
	return `${fmtPercentScore(row.score)} / ${axisConfig.detailLabel(row)} ${axisConfig.format(
		axisConfig.get(row) ?? 0,
	)}`;
}

export function frontierScoreAxisScale(
	values: number[],
	isAllBenchmark: boolean,
): AxisScale {
	if (isAllBenchmark) {
		return scoreAxisScale(values, FRONTIER_SCORE_AXIS_OPTIONS);
	}
	return steppedLinearAxisScale(values, BENCHMARK_SCORE_AXIS_OPTIONS);
}

export function frontierXAxisScale(
	values: number[],
	axisKey: FrontierBenchmarkAxisKey,
	axisConfig: FrontierBenchmarkAxisConfig,
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

export function frontierBenchmarkHoverRows(
	row: FrontierBenchmarkRow,
	axisConfig: FrontierBenchmarkAxisConfig,
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

export function speedScore(row: FrontierBenchmarkRow): number {
	return finiteValue(row.model.scores?.speed_score) ?? 0;
}

export function valueScore(row: FrontierBenchmarkRow): number {
	return finiteValue(row.model.scores?.value_score) ?? 0;
}

export function speedValueBlendScore(row: FrontierBenchmarkRow): number {
	return (valueScore(row) + speedScore(row)) / 2;
}

export function isEfficiencyScoreAxis(
	axisKey: FrontierBenchmarkAxisKey,
): boolean {
	return axisKey === "speedValue";
}

export function positiveMetric(value: number | null): value is number {
	return value != null && value > 0;
}

function meanNumber(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanFiniteMetric(values: Array<number | null>): number | null {
	const finiteValues = values.filter(
		(value): value is number => value != null && Number.isFinite(value),
	);
	return finiteValues.length === 0 ? null : meanNumber(finiteValues);
}

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

function bestAxisRowAtOrAboveScore(
	rows: FrontierBenchmarkRow[],
	axisConfig: FrontierBenchmarkAxisConfig,
	minScore: number,
	fallback: FrontierBenchmarkRow,
): FrontierBenchmarkRow {
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

function frontierBenchmarkCorrelation(rows: FrontierBenchmarkRow[]): string {
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

function resourceMetricLabel(
	row: FrontierBenchmarkRow,
	metric: FrontierBenchmarkResourceMetric,
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

function resourceUnitPhrase(row?: FrontierBenchmarkRow): string {
	return row?.resourcePolicy?.unit === "total" ? "total" : "per-task";
}

function tokenUsePhrase(row?: FrontierBenchmarkRow): string {
	return row?.resourcePolicy?.tokenMeasure === "output_tokens"
		? "output-token use"
		: "token use";
}

function resourceMetricName(
	metric: FrontierBenchmarkResourceMetric,
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
