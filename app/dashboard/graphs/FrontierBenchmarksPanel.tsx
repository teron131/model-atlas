/** Frontier Benchmarks panel for the dashboard graph surface. */

import { useMemo, useState } from "react";
import type {
	LlmStatsModel,
	LlmStatsPayload,
} from "../../../src/model-atlas/stats/types";
import { captureFileToken } from "../capture/export-png";
import { modelVariantKey } from "../shared/modelDisplay";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import { BubbleScaleLegend, SummaryCard } from "./ChartComponents";
import { linearBubbleRadius, valueDistribution } from "./chartStats";
import { EfficiencyAxisChart } from "./EfficiencyAxisChart";
import { finite, fmtPercentScore } from "./format";
import {
	axisSummaryDetail,
	type FrontierBenchmarkAxisKey,
	type FrontierBenchmarkRow,
	frontierAxisDescription,
	frontierAxisMetricLabel,
	frontierBenchmarkAxisConfig,
	frontierBenchmarkAxisConfigFor,
	frontierBenchmarkAxisOptions,
	frontierBenchmarkCorrelationByBenchmark,
	frontierBenchmarkHoverRows,
	frontierBenchmarkOptions,
	frontierBenchmarkRows,
	frontierBenchmarkSummaryRows,
	frontierScoreAxisScale,
	frontierXAxisScale,
	meanFrontierBenchmarkRows,
	normalizedFrontierBenchmarkRows,
	positiveMetric,
	selectedFrontierBenchmarkAxisKey,
	speedValueBlendScore,
} from "./frontierBenchmarksModel";
import { GraphToggle } from "./GraphToggle";
import styles from "./graphs.module.css";
import { modelName, shortLabel } from "./models";
import { Panel } from "./Panel";
import type { HoverSetter } from "./types";

const FRONTIER_CHART_WIDTH = 760;

export function FrontierBenchmarksPanel({
	payload,
	models,
	setHover,
}: {
	payload: LlmStatsPayload;
	models: LlmStatsModel[];
	setHover: HoverSetter;
}) {
	const [axisKey, setAxisKey] =
		useState<FrontierBenchmarkAxisKey>("speedValue");
	const [benchmarkKey, setBenchmarkKey] = useState("all");
	const benchmarkRows = useMemo(
		() =>
			frontierBenchmarkRows(
				models,
				payload.metadata.scoring.benchmark_portfolio,
			),
		[models, payload.metadata.scoring.benchmark_portfolio],
	);
	const meanRows = useMemo(
		() =>
			meanFrontierBenchmarkRows(normalizedFrontierBenchmarkRows(benchmarkRows)),
		[benchmarkRows],
	);
	const benchmarkOptions = useMemo(
		() => frontierBenchmarkOptions(benchmarkRows),
		[benchmarkRows],
	);
	const correlationByBenchmark = useMemo(
		() => frontierBenchmarkCorrelationByBenchmark(benchmarkRows, meanRows),
		[benchmarkRows, meanRows],
	);
	const selectedBenchmarkKey =
		benchmarkKey !== "all" &&
		benchmarkOptions.some((option) => option.key === benchmarkKey)
			? benchmarkKey
			: "all";
	const selectedRows = useMemo(
		() =>
			selectedBenchmarkKey === "all"
				? meanRows
				: benchmarkRows.filter(
						(row) => row.benchmarkKey === selectedBenchmarkKey,
					),
		[benchmarkRows, meanRows, selectedBenchmarkKey],
	);
	const isAllBenchmark = selectedBenchmarkKey === "all";
	const axisOptions = useMemo(
		() => frontierBenchmarkAxisOptions(selectedRows, isAllBenchmark),
		[isAllBenchmark, selectedRows],
	);
	const selectedAxisKey = selectedFrontierBenchmarkAxisKey(
		axisKey,
		axisOptions,
	);
	const selectedBenchmarkLabel =
		selectedBenchmarkKey === "all"
			? "all"
			: (benchmarkOptions.find((option) => option.key === selectedBenchmarkKey)
					?.label ?? selectedBenchmarkKey);
	const captureFileName = [
		"model-atlas-frontier-benchmarks",
		captureFileToken(selectedBenchmarkLabel),
		captureFileToken(frontierBenchmarkAxisConfig[selectedAxisKey].shortLabel),
	].join("-");
	const axisConfig = frontierBenchmarkAxisConfigFor(
		selectedAxisKey,
		isAllBenchmark,
	);
	const chartRows = useMemo(
		() => selectedRows.filter((row) => positiveMetric(axisConfig.get(row))),
		[axisConfig, selectedRows],
	);
	const xMetricLabel = frontierAxisMetricLabel(
		axisConfig,
		isAllBenchmark,
		selectedRows,
	);
	const chartMetric = useMemo(
		() => ({
			label: xMetricLabel,
			get: (row: FrontierBenchmarkRow) => axisConfig.get(row) ?? 0,
			format: axisConfig.format,
			xHigherIsBetter: axisConfig.xHigherIsBetter,
		}),
		[axisConfig, xMetricLabel],
	);

	if (chartRows.length === 0) {
		return null;
	}

	const axisValues = chartRows.map(axisConfig.get).filter(finite);
	const xAxis = frontierXAxisScale(axisValues, selectedAxisKey, axisConfig);
	const scoreValues = chartRows.map((row) => row.score).filter(finite);
	const scoreAxis = frontierScoreAxisScale(scoreValues, isAllBenchmark);
	const bubbleValue = speedValueBlendScore;
	const bubbleRadius = linearBubbleRadius(chartRows.map(bubbleValue), 4, 13);
	const summaryRows = frontierBenchmarkSummaryRows(chartRows, axisConfig);
	if (summaryRows == null) {
		return null;
	}
	const { leader, highScoreAxisRow, medianScoreAxisRow, labeledRows } =
		summaryRows;
	const scoreDistribution = valueDistribution(
		chartRows.map((row) => row.score),
	);
	const plotRows = [...chartRows].sort(
		(left, right) => left.score - right.score,
	);
	const yAxisLabel = isAllBenchmark
		? "MEAN NORMALIZED benchmark score"
		: "Benchmark score";
	const summaryLabel = isAllBenchmark
		? "MEAN NORMALIZED benchmark score"
		: "Benchmark score";
	const axisDescription = frontierAxisDescription(
		selectedAxisKey,
		isAllBenchmark,
		chartRows[0],
	);
	const xMetricProseLabel = xMetricLabel.replace(/efficiency/gi, "EFFICIENCY");
	const panelCopy = isAllBenchmark
		? `Each point is one model: MEAN NORMALIZED frontier benchmark score against ${xMetricProseLabel}. ${axisDescription}`
		: `${leader.benchmarkLabel} score plotted against ${xMetricProseLabel}. ${axisDescription}`;
	const leaderDetail = axisSummaryDetail(leader, axisConfig);

	return (
		<Panel
			captureWidth={FRONTIER_CHART_WIDTH}
			captureFileName={captureFileName}
			title="Frontier Benchmarks"
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
					legend="Frontier benchmark"
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
					legend="Comparison axis"
					options={Object.entries(frontierBenchmarkAxisConfig).map(
						([key, config]) =>
							axisOptions.find((option) => option.key === key) ?? {
								key: key as FrontierBenchmarkAxisKey,
								label: config.shortLabel,
							},
					)}
					selectedKey={selectedAxisKey}
					onSelect={setAxisKey}
				/>
				<div className={styles.chartToolbarCaption}>
					<span className={styles.markerKey}>
						CORR = correlation to Intelligence score
					</span>
					<BubbleScaleLegend metric="Efficiency" />
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
				keyPrefix={`frontier-benchmarks-${selectedBenchmarkKey}-${selectedAxisKey}`}
				ariaLabel={`${axisConfig.label} frontier scatter plot`}
				bubbleValue={bubbleValue}
				bubbleRadius={bubbleRadius}
				getScore={(row) => row.score}
				getModel={(row) => row.model}
				getKey={(row) => `${row.benchmarkKey}-${modelVariantKey(row.model)}`}
				getHoverTitle={(row) => modelName(row.model)}
				getHoverRows={(row) => frontierBenchmarkHoverRows(row, axisConfig)}
				labelRows={labeledRows}
				getLabel={(row) => shortLabel(row.model)}
				setHover={setHover}
				width={FRONTIER_CHART_WIDTH}
				height={520}
			/>
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Leader"
					value={modelName(leader.model)}
					detail={leaderDetail}
				/>
				<SummaryCard
					label="Best near leader"
					value={modelName(highScoreAxisRow.model)}
					detail={axisSummaryDetail(highScoreAxisRow, axisConfig)}
				/>
				<SummaryCard
					label="Best above median"
					value={modelName(medianScoreAxisRow.model)}
					detail={axisSummaryDetail(medianScoreAxisRow, axisConfig)}
				/>
			</div>
		</Panel>
	);
}
