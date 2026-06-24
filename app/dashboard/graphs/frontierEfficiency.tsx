/** Frontier Efficiency panel presentation for the dashboard graph surface. */

import { useMemo, useState } from "react";
import type {
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/llm/stats/types";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { SummaryCard } from "./ChartComponents";
import { linearBubbleRadius, valueDistribution } from "./chartStats";
import { EfficiencyAxisChart } from "./EfficiencyAxisChart";
import { finite, fmtPercentScore } from "./format";
import {
	axisSummaryDetail,
	type FrontierEfficiencyAxisKey,
	type FrontierEfficiencyRow,
	frontierAxisMetricLabel,
	frontierEfficiencyAxisConfig,
	frontierEfficiencyAxisConfigFor,
	frontierEfficiencyAxisOptions,
	frontierEfficiencyCorrelationByBenchmark,
	frontierEfficiencyHoverRows,
	frontierEfficiencyOptions,
	frontierEfficiencyRows,
	frontierEfficiencySummaryRows,
	frontierScoreAxisScale,
	frontierXAxisScale,
	meanFrontierEfficiencyRows,
	normalizedFrontierEfficiencyRows,
	positiveMetric,
	selectedFrontierEfficiencyAxisKey,
	speedScore,
} from "./frontierEfficiencyModel";
import { GraphToggle } from "./GraphToggle";
import styles from "./graphs.module.css";
import { modelKey, modelName, shortLabel } from "./models";
import { Panel } from "./Panel";
import type { HoverSetter } from "./types";

/** Render the Frontier Efficiency scatter plot and its chart controls. */
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
		() => frontierEfficiencyAxisOptions(sourceRows, isAllBenchmark),
		[isAllBenchmark, sourceRows],
	);
	const selectedAxisKey = selectedFrontierEfficiencyAxisKey(
		axisKey,
		axisOptions,
	);
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
	const summaryRows = frontierEfficiencySummaryRows(rows, axisConfig);
	if (summaryRows == null) {
		return null;
	}
	const { leader, paretoRow, budgetRow, labeledRows } = summaryRows;
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
