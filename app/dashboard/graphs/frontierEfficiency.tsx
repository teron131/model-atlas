import { max } from "d3-array";
import { useMemo, useState } from "react";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";
import { minMaxScale } from "../../../src/model-atlas/math-utils";
import { benchmarkLabels } from "../shared/constants";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { EmptyChart, SummaryCard } from "./ChartComponents";
import { inverseLogBubbleRadius, valueDistribution } from "./chartStats";
import { EfficiencyAxisChart } from "./EfficiencyAxisChart";
import {
	finite,
	finiteValue,
	fmtCompact,
	fmtDurationShort,
	fmtMoney,
	fmtTooltipMoney,
	fmtTooltipNumber,
	percent,
} from "./format";
import styles from "./graphs.module.css";
import { modelKey, modelName, shortLabel } from "./models";
import { Panel } from "./Panel";
import type { HoverRow, HoverSetter } from "./types";

type FrontierEfficiencyMetricKey = "cost" | "time" | "tokens";
type FrontierEfficiencyFilterKey = "all" | string;

type FrontierEfficiencyRow = {
	benchmarkKey: string;
	benchmarkLabel: string;
	resourceSourceLabel: string;
	benchmarkCount: number;
	model: LlmStatsModel;
	score: number;
	cost: number;
	seconds: number;
	inputTokens: number | null;
	outputTokens: number | null;
	totalTokens: number;
};

type FrontierEfficiencyMetricConfig = {
	label: string;
	shortLabel: string;
	get: (row: FrontierEfficiencyRow) => number;
	efficiencyLabel: string;
	efficiencyScore: (row: FrontierEfficiencyRow) => number;
	formatEfficiency: (value: number) => string;
	format: (value: number) => string;
};

const frontierEfficiencyMetricConfig: Record<
	FrontierEfficiencyMetricKey,
	FrontierEfficiencyMetricConfig
> = {
	cost: {
		label: "Task cost",
		shortLabel: "Cost",
		get: (row) => row.cost,
		efficiencyLabel: "Best score per dollar",
		efficiencyScore: (row) => row.score / row.cost,
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtMoney,
	},
	time: {
		label: "Task time",
		shortLabel: "Time",
		get: (row) => row.seconds,
		efficiencyLabel: "Best score per day",
		efficiencyScore: (row) => row.score / (row.seconds / 86_400),
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtDurationShort,
	},
	tokens: {
		label: "Task tokens",
		shortLabel: "Tokens",
		get: (row) => row.totalTokens,
		efficiencyLabel: "Best score per 1M tokens",
		efficiencyScore: (row) => row.score / (row.totalTokens / 1_000_000),
		formatEfficiency: (value) => value.toFixed(2),
		format: fmtCompact,
	},
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
				const directTask = taskMetrics[benchmarkKey];
				const task = directTask ?? taskMetrics.artificial_analysis;
				const cost = finiteValue(task?.cost);
				const seconds = finiteValue(task?.seconds);
				const inputTokens = finiteValue(task?.input_tokens);
				const outputTokens = finiteValue(task?.output_tokens);
				const totalTokens =
					inputTokens != null && inputTokens > 0
						? inputTokens + Math.max(outputTokens ?? 0, 0)
						: outputTokens != null && outputTokens > 0
							? outputTokens
							: null;
				if (
					score == null ||
					cost == null ||
					cost <= 0 ||
					seconds == null ||
					seconds <= 0 ||
					totalTokens == null ||
					totalTokens <= 0
				) {
					return [];
				}
				return [
					{
						benchmarkKey,
						benchmarkLabel: benchmarkLabels[benchmarkKey] ?? benchmarkKey,
						resourceSourceLabel:
							directTask != null ? "Benchmark source" : "Artificial Analysis",
						benchmarkCount: 1,
						model,
						score,
						cost,
						seconds,
						inputTokens,
						outputTokens,
						totalTokens,
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
		.map((modelRows) => {
			const first = modelRows[0];
			if (first == null) {
				return null;
			}
			return {
				benchmarkKey: "all",
				benchmarkLabel: "Frontier mean",
				resourceSourceLabel: `Mean of ${modelRows.length} benchmarks`,
				benchmarkCount: modelRows.length,
				model: first.model,
				score: meanNumber(modelRows.map((row) => row.score)),
				cost: meanNumber(modelRows.map((row) => row.cost)),
				seconds: meanNumber(modelRows.map((row) => row.seconds)),
				inputTokens: nullableMeanNumber(
					modelRows.map((row) => row.inputTokens),
				),
				outputTokens: nullableMeanNumber(
					modelRows.map((row) => row.outputTokens),
				),
				totalTokens: meanNumber(modelRows.map((row) => row.totalTokens)),
			};
		})
		.filter((row): row is FrontierEfficiencyRow => row != null)
		.sort((left, right) => right.score - left.score);
}

function normalizedFrontierEfficiencyRows(
	rows: FrontierEfficiencyRow[],
): FrontierEfficiencyRow[] {
	const scoresByBenchmark = new Map<string, number[]>();
	for (const row of rows) {
		const scores = scoresByBenchmark.get(row.benchmarkKey) ?? [];
		scores.push(row.score);
		scoresByBenchmark.set(row.benchmarkKey, scores);
	}
	return rows.map((row) => ({
		...row,
		score:
			minMaxScale(scoresByBenchmark.get(row.benchmarkKey) ?? [], row.score) ??
			row.score,
	}));
}

function meanNumber(values: number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function nullableMeanNumber(values: Array<number | null>): number | null {
	const finiteValues = values.filter(finite);
	return finiteValues.length > 0 ? meanNumber(finiteValues) : null;
}

function frontierEfficiencyProduct(
	row: FrontierEfficiencyRow,
	selectedMetric: FrontierEfficiencyMetricKey | "all",
) {
	return (
		Object.keys(frontierEfficiencyMetricConfig) as FrontierEfficiencyMetricKey[]
	)
		.filter((key) => selectedMetric === "all" || key !== selectedMetric)
		.map((key) => frontierEfficiencyMetricConfig[key].get(row))
		.filter((value) => finite(value) && value > 0)
		.reduce((product, value) => product * value, 1);
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
	const [metricKey, setMetricKey] =
		useState<FrontierEfficiencyMetricKey>("cost");
	const [benchmarkFilter, setBenchmarkFilter] =
		useState<FrontierEfficiencyFilterKey>("all");
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
	const selectedFilter =
		benchmarkFilter !== "all" &&
		benchmarkOptions.some((option) => option.key === benchmarkFilter)
			? benchmarkFilter
			: "all";
	const rows = useMemo(
		() =>
			selectedFilter === "all"
				? meanRows
				: allRows.filter((row) => row.benchmarkKey === selectedFilter),
		[allRows, meanRows, selectedFilter],
	);

	if (allRows.length === 0) {
		return (
			<Panel
				title="Frontier Efficiency"
				copy="Frontier benchmark resource rows appear when selected frontier benchmarks include score, cost, time, and token metrics."
			>
				<EmptyChart message="No frontier resource rows match the current filters." />
			</Panel>
		);
	}

	const isAllFilter = selectedFilter === "all";
	const resourceMetric = frontierEfficiencyMetricConfig[metricKey];
	const axisMetric = isAllFilter
		? {
				label: "Value score",
				get: (row: FrontierEfficiencyRow) =>
					finiteValue(row.model.relative_scores?.value_score) ?? 0,
				format: (value: number) => value.toFixed(0),
			}
		: resourceMetric;
	const metricValues = rows.map(axisMetric.get).filter(finite);
	const xDomain = linearResourceDomain(metricValues);
	const scoreMax = max(rows, (row) => row.score) ?? 50;
	const yDomainTop = Math.max(
		50,
		Math.min(105, Math.ceil((scoreMax + 4) / 10) * 10),
	);
	const yTicks = percentageTicks(yDomainTop);
	const bubbleValue = (row: FrontierEfficiencyRow) =>
		frontierEfficiencyProduct(row, isAllFilter ? "all" : metricKey);
	const bubbleRadius = inverseLogBubbleRadius(rows.map(bubbleValue), 13);
	const leader = rows[0] as FrontierEfficiencyRow;
	const bestAxis = isAllFilter
		? ([...rows].sort(
				(left, right) => axisMetric.get(right) - axisMetric.get(left),
			)[0] ?? leader)
		: ([...rows].sort(
				(left, right) =>
					resourceMetric.efficiencyScore(right) -
					resourceMetric.efficiencyScore(left),
			)[0] ?? leader);
	const leanAboveFloor =
		[...rows]
			.filter((row) => row.score >= 10)
			.sort((left, right) => axisMetric.get(left) - axisMetric.get(right))[0] ??
		bestAxis;
	const valueAbove80 = bestValueRowAboveScore(rows, axisMetric.get, 80, leader);
	const valueAbove20 = bestValueRowAboveScore(rows, axisMetric.get, 20, leader);
	const labeledRows = new Set(
		isAllFilter
			? [leader, valueAbove80, valueAbove20]
			: [leader, bestAxis, leanAboveFloor],
	);
	const scoreDistribution = valueDistribution(rows.map((row) => row.score));
	const plotRows = [...rows].sort((left, right) => left.score - right.score);
	const yAxisLabel = isAllFilter ? "Normalized score" : "Benchmark score";
	const panelCopy = isAllFilter
		? "Each point is one model: normalized frontier score against value score."
		: `${leader.benchmarkLabel} score plotted against available task cost, time, or tokens.`;
	const leaderDetail = isAllFilter
		? `${leader.score.toFixed(1)}% / value ${axisMetric.format(
				axisMetric.get(leader),
			)}`
		: `${leader.score.toFixed(1)}% / ${fmtMoney(leader.cost)}`;

	return (
		<Panel
			title="Frontier Efficiency"
			copy={panelCopy}
			summary={
				<BoxWhiskerSummary
					label="Benchmark score"
					distribution={scoreDistribution}
					domainMax={100}
					formatValue={(value) => `${value.toFixed(0)}%`}
					showDomainEndpoints
				/>
			}
			wide
		>
			<div className={styles.resourceToolbar}>
				<fieldset
					className={`${styles.metricToggle} ${styles.benchmarkToggle}`}
				>
					<legend className={styles.visuallyHidden}>
						Frontier Efficiency benchmark
					</legend>
					<button
						type="button"
						aria-pressed={selectedFilter === "all"}
						onClick={() => setBenchmarkFilter("all")}
					>
						All <span>{meanRows.length}</span>
					</button>
					{benchmarkOptions.map((option) => (
						<button
							key={option.key}
							type="button"
							aria-pressed={selectedFilter === option.key}
							onClick={() => setBenchmarkFilter(option.key)}
						>
							{option.label} <span>{option.count}</span>
						</button>
					))}
				</fieldset>
				{isAllFilter ? null : (
					<fieldset className={styles.metricToggle}>
						<legend className={styles.visuallyHidden}>
							Frontier Efficiency axis
						</legend>
						{Object.entries(frontierEfficiencyMetricConfig).map(
							([key, config]) => (
								<button
									key={key}
									type="button"
									aria-pressed={key === metricKey}
									onClick={() =>
										setMetricKey(key as FrontierEfficiencyMetricKey)
									}
								>
									{config.shortLabel}
								</button>
							),
						)}
					</fieldset>
				)}
				<div className={styles.resourceCaption}>
					<span className={styles.markerKey}>
						<span className={styles.bubbleMarkerKey} />
						Bubble size = efficiency
					</span>
				</div>
			</div>
			<EfficiencyAxisChart
				rows={plotRows}
				metric={axisMetric}
				xDomain={xDomain}
				yDomain={[0, yDomainTop]}
				yTicks={yTicks}
				yAxisLabel={yAxisLabel}
				keyPrefix={`frontier-efficiency-${selectedFilter}-${isAllFilter ? "value" : metricKey}`}
				ariaLabel="Frontier Efficiency scatter plot"
				bubbleValue={bubbleValue}
				bubbleRadius={bubbleRadius}
				getScore={(row) => row.score}
				getModel={(row) => row.model}
				getKey={(row) => `${row.benchmarkKey}-${modelKey(row.model)}`}
				getHoverTitle={(row) =>
					`${modelName(row.model)} / ${row.benchmarkLabel}`
				}
				getHoverRows={(row) => frontierEfficiencyHoverRows(row)}
				labelRows={labeledRows}
				getLabel={(row) => shortLabel(row.model)}
				setHover={setHover}
				height={520}
			/>
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={`${modelName(leader.model)} - ${leader.benchmarkLabel}`}
					detail={leaderDetail}
				/>
				{isAllFilter ? (
					<>
						<SummaryCard
							label="Best value above 80%"
							value={`${modelName(valueAbove80.model)} - ${valueAbove80.benchmarkLabel}`}
							detail={`${valueAbove80.score.toFixed(1)}% / value ${axisMetric
								.get(valueAbove80)
								.toFixed(0)}`}
						/>
						<SummaryCard
							label="Best value above 20%"
							value={`${modelName(valueAbove20.model)} - ${valueAbove20.benchmarkLabel}`}
							detail={`${valueAbove20.score.toFixed(1)}% / value ${axisMetric
								.get(valueAbove20)
								.toFixed(0)}`}
						/>
					</>
				) : (
					<>
						<SummaryCard
							label={resourceMetric.efficiencyLabel}
							value={`${modelName(bestAxis.model)} - ${bestAxis.benchmarkLabel}`}
							detail={resourceMetric.formatEfficiency(
								resourceMetric.efficiencyScore(bestAxis),
							)}
						/>
						<SummaryCard
							label="Leanest above 10%"
							value={`${modelName(leanAboveFloor.model)} - ${leanAboveFloor.benchmarkLabel}`}
							detail={axisMetric.format(axisMetric.get(leanAboveFloor))}
						/>
					</>
				)}
			</div>
		</Panel>
	);
}

function bestValueRowAboveScore(
	rows: FrontierEfficiencyRow[],
	valueScore: (row: FrontierEfficiencyRow) => number,
	minScore: number,
	fallback: FrontierEfficiencyRow,
) {
	return (
		[...rows]
			.filter((row) => row.score >= minScore)
			.sort((left, right) => valueScore(right) - valueScore(left))[0] ??
		fallback
	);
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

function percentageTicks(domainTop: number) {
	const step = domainTop <= 60 ? 10 : 20;
	return Array.from(
		{ length: Math.floor(domainTop / step) + 1 },
		(_, index) => index * step,
	);
}

function linearResourceDomain(values: number[]): [number, number] {
	const low = Math.min(...values);
	const high = Math.max(...values);
	if (!finite(low) || !finite(high)) {
		return [0, 1];
	}
	if (low === high) {
		const pad = Math.max(Math.abs(low) * 0.1, 1);
		return [Math.max(0, low - pad), high + pad];
	}
	const span = high - low;
	return [Math.max(0, low - span * 0.05), high + span * 0.05];
}

function frontierEfficiencyHoverRows(row: FrontierEfficiencyRow): HoverRow[] {
	const rows: HoverRow[] = [
		["Benchmark", row.benchmarkLabel],
		["Resource source", row.resourceSourceLabel],
		["Score", `${row.score.toFixed(1)}%`],
		["Cost", fmtTooltipMoney(row.cost)],
		["Time", fmtDurationShort(row.seconds)],
		["Task tokens", fmtTooltipNumber(row.totalTokens)],
	];
	if (row.inputTokens != null) {
		rows.push(["Input tokens", fmtTooltipNumber(row.inputTokens)]);
	}
	if (row.outputTokens != null) {
		rows.push(["Output tokens", fmtTooltipNumber(row.outputTokens)]);
	}
	return rows;
}
