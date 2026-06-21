import { median } from "d3-array";
import { useMemo, useState } from "react";
import { benchmarkResourcePolicy } from "../../../src/model-atlas/config/benchmark-portfolio";
import type {
	BenchmarkPortfolio,
	BenchmarkResourcePolicy,
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";
import { minMaxScale } from "../../../src/model-atlas/math-utils";
import { benchmarkLabels } from "../shared/constants";
import {
	linearAxisScale,
	scoreAxisScale,
	steppedLinearAxisScale,
} from "./axisScale";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { SummaryCard } from "./ChartComponents";
import { linearBubbleRadius, valueDistribution } from "./chartStats";
import { EfficiencyAxisChart } from "./EfficiencyAxisChart";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtDurationShort,
	fmtMoney,
	fmtPercentScore,
	percent,
} from "./format";
import { GraphToggle } from "./GraphToggle";
import styles from "./graphs.module.css";
import {
	correlationValue,
	formatCorrelation,
	modelKey,
	modelName,
	shortLabel,
} from "./models";
import { Panel } from "./Panel";
import type { HoverRow, HoverSetter } from "./types";

type FrontierEfficiencyAxisKey = "value" | "cost" | "time" | "tokens";
type FrontierEfficiencyResourceMetric = Exclude<
	FrontierEfficiencyAxisKey,
	"value"
>;

type FrontierEfficiencyRow = {
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

type FrontierEfficiencyAxisConfig = {
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

const frontierEfficiencyAxisConfig: Record<
	FrontierEfficiencyAxisKey,
	FrontierEfficiencyAxisConfig
> = {
	value: {
		label: "Value score",
		shortLabel: "Value",
		get: (row) => finiteValue(row.model.relative_scores?.value_score) ?? 0,
		selectionScore: (row) =>
			finiteValue(row.model.relative_scores?.value_score) ?? 0,
		format: (value) => value.toFixed(0),
		detailLabel: () => "Value score",
		normalizedLabel: "Value score",
		normalizedDetailLabel: "Value score",
		xHigherBetter: true,
	},
	cost: {
		label: "Resource cost",
		shortLabel: "Cost",
		get: (row) => row.cost,
		selectionScore: (row) => (row.cost == null ? null : row.score / row.cost),
		format: fmtMoney,
		detailLabel: (row) => resourceMetricLabel(row, "cost"),
		normalizedLabel: "Mean normalized cost score",
		normalizedDetailLabel: "Mean normalized cost score",
	},
	time: {
		label: "Resource time",
		shortLabel: "Time",
		get: (row) => row.seconds,
		selectionScore: (row) =>
			row.seconds == null ? null : row.score / (row.seconds / 86_400),
		format: fmtDurationShort,
		detailLabel: (row) => resourceMetricLabel(row, "time"),
		normalizedLabel: "Mean normalized time score",
		normalizedDetailLabel: "Mean normalized time score",
	},
	tokens: {
		label: "Resource tokens",
		shortLabel: "Tokens",
		get: (row) => row.totalTokens,
		selectionScore: (row) =>
			row.totalTokens == null
				? null
				: row.score / (row.totalTokens / 1_000_000),
		format: fmtCompact,
		detailLabel: (row) => resourceMetricLabel(row, "tokens"),
		normalizedLabel: "Mean normalized tokens score",
		normalizedDetailLabel: "Mean normalized tokens score",
	},
};

const FRONTIER_SCORE_AXIS_OPTIONS = {
	formatTick: (tick: number) => `${tick}%`,
};

const SELECTED_BENCHMARK_SCORE_AXIS_OPTIONS = {
	formatTick: (tick: number) => `${tick}%`,
	max: 100,
	minimumTicks: 5,
	steps: [10, 5, 2] as const,
};

function frontierEfficiencyRows(
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

function meanFrontierEfficiencyRows(
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

function normalizedFrontierEfficiencyRows(
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
	return resourcePolicy.source === "artificial_analysis"
		? taskMetrics.artificial_analysis
		: taskMetrics[benchmarkKey];
}

function frontierResourceTokens(
	resourcePolicy: BenchmarkResourcePolicy | null,
	inputTokens: number | null,
	outputTokens: number | null,
) {
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
) {
	if (value == null) {
		return;
	}
	const values = valuesByBenchmark.get(benchmarkKey) ?? [];
	values.push(value);
	valuesByBenchmark.set(benchmarkKey, values);
}

function positiveMetric(value: number | null): value is number {
	return value != null && value > 0;
}

export function FrontierEfficiencyPanel({
	payload,
	models,
	setHover,
}: {
	payload: LlmStatsPayload;
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const [axisKey, setAxisKey] = useState<FrontierEfficiencyAxisKey>("value");
	const [benchmarkKey, setBenchmarkKey] = useState("all");
	const allRows = useMemo(
		() =>
			frontierEfficiencyRows(
				models,
				payload.metadata.scoring.benchmark_portfolio,
			),
		[models, payload.metadata.scoring.benchmark_portfolio],
	);
	const meanRows = useMemo(
		() => meanFrontierEfficiencyRows(normalizedFrontierEfficiencyRows(allRows)),
		[allRows],
	);
	const benchmarkOptions = useMemo(
		() => frontierEfficiencyOptions(allRows),
		[allRows],
	);
	const correlationByBenchmark = useMemo(
		() => frontierEfficiencyCorrelationByBenchmark(allRows, meanRows),
		[allRows, meanRows],
	);
	const selectedBenchmarkKey =
		benchmarkKey !== "all" &&
		benchmarkOptions.some((option) => option.key === benchmarkKey)
			? benchmarkKey
			: "all";
	const sourceRows = useMemo(
		() =>
			selectedBenchmarkKey === "all"
				? meanRows
				: allRows.filter((row) => row.benchmarkKey === selectedBenchmarkKey),
		[allRows, meanRows, selectedBenchmarkKey],
	);
	const isAllBenchmark = selectedBenchmarkKey === "all";
	const axisOptions = useMemo(
		() =>
			Object.entries(frontierEfficiencyAxisConfig).map(([key, config]) => {
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
			}),
		[isAllBenchmark, sourceRows],
	);
	const selectedAxisKey = axisOptions.some(
		(option) => option.key === axisKey && !option.disabled,
	)
		? axisKey
		: (axisOptions.find((option) => option.key === "cost" && !option.disabled)
				?.key ??
			axisOptions.find((option) => !option.disabled)?.key ??
			axisKey);
	const axisConfig = frontierEfficiencyAxisConfigFor(
		selectedAxisKey,
		isAllBenchmark,
	);
	const rows = useMemo(
		() => sourceRows.filter((row) => positiveMetric(axisConfig.get(row))),
		[axisConfig, sourceRows],
	);
	const xMetricLabel = frontierAxisMetricLabel(
		axisConfig,
		isAllBenchmark,
		sourceRows,
	);
	const chartMetric = useMemo(
		() => ({
			label: xMetricLabel,
			get: (row: FrontierEfficiencyRow) => axisConfig.get(row) ?? 0,
			format: axisConfig.format,
			xHigherBetter: axisConfig.xHigherBetter,
		}),
		[axisConfig, xMetricLabel],
	);

	if (rows.length === 0) {
		return null;
	}

	const axisValues = rows.map(axisConfig.get).filter(finite);
	const xAxis = frontierXAxisScale(axisValues, selectedAxisKey, axisConfig);
	const scoreValues = rows.map((row) => row.score).filter(finite);
	const scoreAxis = frontierScoreAxisScale(scoreValues, isAllBenchmark);
	const bubbleValue = speedScore;
	const bubbleRadius = linearBubbleRadius(rows.map(bubbleValue), 4, 13);
	const leader = rows[0] as FrontierEfficiencyRow;
	const medianScore = median(rows.map((row) => row.score)) ?? leader.score;
	const paretoScoreFloor = leader.score * 0.8;
	const budgetRow = bestAxisRowAtOrAboveScore(
		rows,
		axisConfig,
		medianScore,
		leader,
	);
	const paretoRow = bestAxisRowAtOrAboveScore(
		rows,
		axisConfig,
		paretoScoreFloor,
		leader,
	);
	const labeledRows = new Set(
		[leader, paretoRow, budgetRow].filter(
			(row): row is FrontierEfficiencyRow => row != null,
		),
	);
	const scoreDistribution = valueDistribution(rows.map((row) => row.score));
	const plotRows = [...rows].sort((left, right) => left.score - right.score);
	const yAxisLabel = isAllBenchmark
		? "Normalized benchmark score"
		: "Benchmark score";
	const summaryLabel = isAllBenchmark
		? "Mean normalized frontier score"
		: "Benchmark score";
	const panelCopy = isAllBenchmark
		? `Each point is one model: mean normalized frontier benchmark score against ${xMetricLabel.toLowerCase()}.`
		: `${leader.benchmarkLabel} score plotted against ${xMetricLabel.toLowerCase()}.`;
	const leaderDetail = axisSummaryDetail(leader, axisConfig);

	return (
		<Panel
			title="Frontier Efficiency"
			copy={panelCopy}
			summary={
				<BoxWhiskerSummary
					label={summaryLabel}
					distribution={scoreDistribution}
					domainMax={100}
					formatValue={fmtPercentScore}
					showDomainEndpoints
				/>
			}
			wide
		>
			<div className={styles.chartToolbar}>
				<GraphToggle
					legend="Frontier Efficiency benchmark"
					options={[
						{
							key: "all",
							label: `All ${meanRows.length}`,
							detail: correlationByBenchmark.get("all") ?? "CORR --",
						},
						...benchmarkOptions.map((option) => ({
							key: option.key,
							label: `${option.label} ${option.count}`,
							detail: correlationByBenchmark.get(option.key) ?? "CORR --",
						})),
					]}
					selectedKey={selectedBenchmarkKey}
					onSelect={setBenchmarkKey}
					layout="stacked"
				/>
				<GraphToggle
					legend="Frontier Efficiency axis"
					options={Object.entries(frontierEfficiencyAxisConfig).map(
						([key, config]) =>
							axisOptions.find((option) => option.key === key) ?? {
								key: key as FrontierEfficiencyAxisKey,
								label: config.shortLabel,
							},
					)}
					selectedKey={selectedAxisKey}
					onSelect={setAxisKey}
				/>
				<div className={styles.chartToolbarCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = speed score
					</span>
				</div>
			</div>
			<EfficiencyAxisChart
				rows={plotRows}
				metric={chartMetric}
				xDomain={xAxis.domain}
				xTicks={xAxis.ticks}
				yDomain={scoreAxis.domain}
				yTicks={scoreAxis.ticks}
				yAxisLabel={yAxisLabel}
				keyPrefix={`frontier-efficiency-${selectedBenchmarkKey}-${selectedAxisKey}`}
				ariaLabel="Frontier Efficiency scatter plot"
				bubbleValue={bubbleValue}
				bubbleRadius={bubbleRadius}
				getScore={(row) => row.score}
				getModel={(row) => row.model}
				getKey={(row) => `${row.benchmarkKey}-${modelKey(row.model)}`}
				getHoverTitle={(row) => modelName(row.model)}
				getHoverRows={(row) => frontierEfficiencyHoverRows(row, axisConfig)}
				labelRows={labeledRows}
				getLabel={(row) => shortLabel(row.model)}
				setHover={setHover}
				height={520}
			/>
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={modelName(leader.model)}
					detail={leaderDetail}
				/>
				<SummaryCard
					label="Pareto (Scored > 80% of leader)"
					value={modelName(paretoRow.model)}
					detail={axisSummaryDetail(paretoRow, axisConfig)}
				/>
				<SummaryCard
					label="Budget (Scored > median)"
					value={modelName(budgetRow.model)}
					detail={axisSummaryDetail(budgetRow, axisConfig)}
				/>
			</div>
		</Panel>
	);
}

function bestAxisRowAtOrAboveScore(
	rows: FrontierEfficiencyRow[],
	axisConfig: FrontierEfficiencyAxisConfig,
	minScore: number,
	fallback: FrontierEfficiencyRow,
) {
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

function frontierAxisMetricLabel(
	axisConfig: FrontierEfficiencyAxisConfig,
	isAllBenchmark: boolean,
	rows: FrontierEfficiencyRow[],
) {
	if (isAllBenchmark) {
		return axisConfig.label;
	}
	const row = rows.find((candidate) =>
		positiveMetric(axisConfig.get(candidate)),
	);
	return row == null ? axisConfig.label : axisConfig.detailLabel(row);
}

function frontierEfficiencyAxisConfigFor(
	axisKey: FrontierEfficiencyAxisKey,
	isAllBenchmark: boolean,
): FrontierEfficiencyAxisConfig {
	const axisConfig = frontierEfficiencyAxisConfig[axisKey];
	if (!isAllBenchmark || axisKey === "value") {
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

function axisSummaryDetail(
	row: FrontierEfficiencyRow,
	axisConfig: FrontierEfficiencyAxisConfig,
) {
	return `${fmtPercentScore(row.score)} / ${axisConfig.detailLabel(row)} ${axisConfig.format(
		axisConfig.get(row) ?? 0,
	)}`;
}

function frontierEfficiencyOptions(rows: FrontierEfficiencyRow[]) {
	const counts = new Map<
		string,
		{ key: string; label: string; count: number }
	>();
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

function frontierEfficiencyCorrelationByBenchmark(
	allRows: FrontierEfficiencyRow[],
	meanRows: FrontierEfficiencyRow[],
) {
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

function frontierEfficiencyCorrelation(rows: FrontierEfficiencyRow[]) {
	return formatCorrelation(
		correlationValue(
			rows.flatMap((row) => {
				const intelligenceScore = finiteValue(
					row.model.relative_scores?.intelligence_score,
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

function frontierScoreAxisScale(values: number[], isAllBenchmark: boolean) {
	if (isAllBenchmark) {
		return scoreAxisScale(values, FRONTIER_SCORE_AXIS_OPTIONS);
	}
	return steppedLinearAxisScale(values, SELECTED_BENCHMARK_SCORE_AXIS_OPTIONS);
}

function groupRowsByBenchmark(rows: FrontierEfficiencyRow[]) {
	const rowsByBenchmark = new Map<string, FrontierEfficiencyRow[]>();
	for (const row of rows) {
		const current = rowsByBenchmark.get(row.benchmarkKey) ?? [];
		current.push(row);
		rowsByBenchmark.set(row.benchmarkKey, current);
	}
	return rowsByBenchmark;
}

function speedScore(row: FrontierEfficiencyRow) {
	return finiteValue(row.model.relative_scores?.speed_score) ?? 0;
}

function frontierXAxisScale(
	values: number[],
	axisKey: FrontierEfficiencyAxisKey,
	axisConfig: FrontierEfficiencyAxisConfig,
) {
	if (axisKey === "value") {
		return scoreAxisScale(values, {
			formatTick: axisConfig.format,
		});
	}
	return linearAxisScale(values, {
		formatTick: axisConfig.format,
		min: 0,
	});
}

function frontierEfficiencyHoverRows(
	row: FrontierEfficiencyRow,
	axisConfig: FrontierEfficiencyAxisConfig,
): HoverRow[] {
	const rows: HoverRow[] = [];
	rows.push(
		[
			row.benchmarkKey === "all"
				? "Normalized benchmark score"
				: "Benchmark score",
			fmtPercentScore(row.score),
		],
		[axisConfig.detailLabel(row), axisConfig.format(axisConfig.get(row) ?? 0)],
		["Speed score", speedScore(row).toFixed(1)],
	);
	return rows;
}

function resourceMetricLabel(
	row: FrontierEfficiencyRow,
	metric: FrontierEfficiencyResourceMetric,
) {
	if (row.benchmarkKey === "all") {
		return `Mean resource ${resourceMetricName(metric)}`;
	}
	const policy = row.resourcePolicy;
	if (policy == null) {
		return `Resource ${resourceMetricName(metric)}`;
	}
	const metricName = resourceMetricName(metric, policy);
	if (policy.unit === "total") {
		return `Total ${metricName}`;
	}
	const sourcePrefix =
		policy.source === "artificial_analysis" ? "AA" : "Benchmark";
	return `${sourcePrefix} ${metricName} per task`;
}

function resourceMetricName(
	metric: FrontierEfficiencyResourceMetric,
	policy?: BenchmarkResourcePolicy,
) {
	if (metric === "time") {
		return "time";
	}
	if (metric === "cost") {
		return "cost";
	}
	return policy?.tokenMeasure === "output_tokens" ? "output tokens" : "tokens";
}
