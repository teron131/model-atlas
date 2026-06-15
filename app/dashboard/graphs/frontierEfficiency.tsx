import { median } from "d3-array";
import { useMemo, useState } from "react";
import type {
	BenchmarkPortfolio,
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
	fmtTooltipMoney,
	fmtTooltipNumber,
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

type FrontierEfficiencyAxisConfig = {
	label: string;
	shortLabel: string;
	get: (row: FrontierEfficiencyRow) => number;
	selectionScore: (row: FrontierEfficiencyRow) => number;
	format: (value: number) => string;
	detailLabel: string;
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
		detailLabel: "value",
		xHigherBetter: true,
	},
	cost: {
		label: "Task cost",
		shortLabel: "Cost",
		get: (row) => row.cost,
		selectionScore: (row) => row.score / row.cost,
		format: fmtMoney,
		detailLabel: "cost",
	},
	time: {
		label: "Task time",
		shortLabel: "Time",
		get: (row) => row.seconds,
		selectionScore: (row) => row.score / (row.seconds / 86_400),
		format: fmtDurationShort,
		detailLabel: "time",
	},
	tokens: {
		label: "Task tokens",
		shortLabel: "Tokens",
		get: (row) => row.totalTokens,
		selectionScore: (row) => row.score / (row.totalTokens / 1_000_000),
		format: fmtCompact,
		detailLabel: "tokens",
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
	const rows = useMemo(
		() =>
			selectedBenchmarkKey === "all"
				? meanRows
				: allRows.filter((row) => row.benchmarkKey === selectedBenchmarkKey),
		[allRows, meanRows, selectedBenchmarkKey],
	);

	if (allRows.length === 0) {
		return null;
	}

	const isAllBenchmark = selectedBenchmarkKey === "all";
	const axisConfig = frontierEfficiencyAxisConfig[axisKey];
	const axisValues = rows.map(axisConfig.get).filter(finite);
	const xAxis = frontierXAxisScale(axisValues, axisKey, axisConfig);
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
	const yAxisLabel = isAllBenchmark ? "Normalized score" : "Benchmark score";
	const panelCopy = isAllBenchmark
		? `Each point is one model: normalized frontier score against ${axisConfig.label.toLowerCase()}.`
		: `${leader.benchmarkLabel} score plotted against ${axisConfig.label.toLowerCase()}.`;
	const leaderDetail = axisSummaryDetail(leader, axisConfig);

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
						([key, config]) => ({
							key: key as FrontierEfficiencyAxisKey,
							label: config.shortLabel,
						}),
					)}
					selectedKey={axisKey}
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
				metric={axisConfig}
				xDomain={xAxis.domain}
				xTicks={xAxis.ticks}
				yDomain={scoreAxis.domain}
				yTicks={scoreAxis.ticks}
				yAxisLabel={yAxisLabel}
				keyPrefix={`frontier-efficiency-${selectedBenchmarkKey}-${axisKey}`}
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
					axisConfig.selectionScore(right) - axisConfig.selectionScore(left),
			)[0] ?? fallback
	);
}

function axisSummaryDetail(
	row: FrontierEfficiencyRow,
	axisConfig: FrontierEfficiencyAxisConfig,
) {
	return `${row.score.toFixed(1)}% / ${axisConfig.detailLabel} ${axisConfig.format(
		axisConfig.get(row),
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

function frontierEfficiencyHoverRows(row: FrontierEfficiencyRow): HoverRow[] {
	const rows: HoverRow[] = [
		["Benchmark", row.benchmarkLabel],
		["Resource source", row.resourceSourceLabel],
		["Score", `${row.score.toFixed(1)}%`],
		["Speed score", speedScore(row).toFixed(1)],
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
