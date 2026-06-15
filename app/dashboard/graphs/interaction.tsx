import { extent, median } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { type CSSProperties, useMemo, useState } from "react";
import type {
	BenchmarkPortfolio,
	LlmStatsModel,
} from "../../../src/model-atlas/llm/stats/types";
import { providerPaletteColor } from "../shared/providerTheme";
import { linearAxisScale } from "./axisScale";
import { BoxWhiskerSummary } from "./BoxWhiskerSummary";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	EmptyChart,
	MedianCross,
	PlotFrame,
	PointHitTarget,
	PointLabel,
	plotBoundsFor,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./ChartComponents";
import { extremeLabelRows, valueDistribution } from "./chartStats";
import { finiteValue, fmtTooltipScore } from "./format";
import { GraphToggle } from "./GraphToggle";
import styles from "./graphs.module.css";
import { interactionXAxisTicks } from "./interactionTicks";
import { calloutLabelPlacements } from "./labelPlacement";
import {
	correlationLabel,
	correlationValue,
	formatCorrelation,
	frontierBenchmarkScoreByModel,
	interactionConfigs,
	modelKey,
	positiveDomain,
	shortLabel,
} from "./models";
import { Panel } from "./Panel";
import type {
	HoverRow,
	HoverSetter,
	InteractionConfig,
	InteractionContext,
	Point,
} from "./types";

const INTERACTION_CHART_WIDTH = 760;
const INTERACTION_CHART_HEIGHT = 460;
const INTERACTION_CHART_MARGIN = {
	top: 30,
	right: 64,
	bottom: 72,
	left: 66,
};
const INTERACTION_POINT_RADIUS = 4;
const INTERACTION_LABEL_METRICS = {
	fontSize: 11,
	charWidth: 6.5,
	lineHeight: 12,
	padding: 3,
};

export function InteractionMatrix({
	models,
	benchmarkPortfolio,
	fullPayloadLoaded,
	setHover,
}: {
	models: LlmStatsModel[];
	benchmarkPortfolio: BenchmarkPortfolio;
	fullPayloadLoaded: boolean;
	setHover: HoverSetter;
}) {
	const [selectedKey, setSelectedKey] = useState(
		interactionConfigs[0]?.key ?? "",
	);
	const selectedConfig =
		interactionConfigs.find((config) => config.key === selectedKey) ??
		interactionConfigs[0];
	const interactionContext = useMemo(
		() => ({
			frontierScoreByModel: frontierBenchmarkScoreByModel(
				models,
				benchmarkPortfolio,
			),
		}),
		[models, benchmarkPortfolio],
	);
	if (!selectedConfig) {
		return null;
	}

	const xDistribution = interactionXDistribution(
		models,
		selectedConfig,
		interactionContext,
	);

	return (
		<Panel
			title="Intelligence interaction matrix"
			copy="Switch between price, throughput, response time, context, AA task cost, and normalized frontier benchmark score."
			summary={
				<BoxWhiskerSummary
					label={`${selectedConfig.fieldLabel} spread`}
					distribution={xDistribution.distribution}
					domainMin={xDistribution.domainMin}
					domainMax={xDistribution.domainMax}
					formatValue={xDistribution.formatValue}
					showObservedLabels
				/>
			}
		>
			<div className={styles.interactionControls}>
				<GraphToggle
					legend="Interaction field"
					options={interactionConfigs.map((config) => ({
						key: config.key,
						label: config.fieldLabel,
						detail: interactionTabCorrelation(
							models,
							config,
							interactionContext,
						),
					}))}
					selectedKey={selectedConfig.key}
					onSelect={setSelectedKey}
					layout="stacked"
				/>
			</div>
			<div className={styles.interactionPlotBody}>
				<InteractionPlot
					models={models}
					config={selectedConfig}
					context={interactionContext}
					fullPayloadLoaded={fullPayloadLoaded}
					setHover={setHover}
				/>
			</div>
		</Panel>
	);
}

function interactionXDistribution(
	models: LlmStatsModel[],
	config: InteractionConfig,
	context: InteractionContext,
) {
	const formatValue = interactionSummaryFormat(config);
	const values = models
		.map((model) => config.get(model, context))
		.filter(
			(value): value is number =>
				value != null && Number.isFinite(value) && (!config.log || value > 0),
		);
	const distribution = valueDistribution(values);
	return {
		distribution,
		domainMax: distribution.max,
		domainMin: distribution.min,
		formatValue,
	};
}

function interactionSummaryFormat(config: InteractionConfig) {
	return config.key === "context" ? config.format : config.tooltipFormat;
}

function interactionTabCorrelation(
	models: LlmStatsModel[],
	config: InteractionConfig,
	context: InteractionContext,
) {
	const pairs = models.flatMap((model) => {
		const xValue = config.get(model, context);
		const yValue = finiteValue(model.relative_scores?.intelligence_score);
		if (xValue == null || yValue == null || (config.log && xValue <= 0)) {
			return [];
		}
		return [
			{
				x: config.log ? Math.log10(Math.max(xValue, 0.001)) : xValue,
				y: yValue,
			},
		];
	});
	return formatCorrelation(correlationValue(pairs));
}

function InteractionPlot({
	models,
	config,
	context,
	fullPayloadLoaded,
	setHover,
}: {
	models: LlmStatsModel[];
	config: InteractionConfig;
	context: InteractionContext;
	fullPayloadLoaded: boolean;
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
	const modelPoints = models.map((model) => ({
		model,
		x: config.get(model, context),
		y: finiteValue(model.relative_scores?.intelligence_score),
	}));
	const data = modelPoints.filter(
		(point): point is Point =>
			point.x != null && point.y != null && (!config.log || point.x > 0),
	);

	if (data.length === 0) {
		if (!fullPayloadLoaded) {
			return null;
		}
		return (
			<div className={`${styles.chartWrap} ${styles.interactionPlot}`}>
				<div className={styles.interactionPlotHead}>
					<div className={styles.interactionTitle}>{config.title}</div>
					<div className={styles.interactionBadge}>r --</div>
				</div>
				<EmptyChart />
			</div>
		);
	}

	const width = INTERACTION_CHART_WIDTH;
	const height = INTERACTION_CHART_HEIGHT;
	const margin = INTERACTION_CHART_MARGIN;
	const [rawMin, rawMax] = extent(data, (point) => point.x);
	const xMin = rawMin ?? 1;
	const xMax = rawMax ?? xMin * 2;
	const xAxis = config.log
		? null
		: linearAxisScale(
				data.map((point) => point.x),
				{
					paddingRatio: 0.06,
				},
			);
	const xDomain: [number, number] = config.log
		? positiveDomain(data.map((point) => point.x))
		: (xAxis?.domain ?? [0, 1]);
	const xTickDomain: [number, number] = xMin < xMax ? [xMin, xMax] : xDomain;
	const yValues = data.map((point) => point.y);
	const yAxis = linearAxisScale(yValues, {
		formatTick: (tick) => String(tick),
		max: 100,
		min: 0,
		minimumTicksWithoutExpansion: 4,
		paddingRatio: 0.06,
	});
	const yDomain = yAxis.domain;
	const yTicks = yAxis.ticks;
	const x = (config.log ? scaleLog() : scaleLinear())
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const xTicks = interactionXAxisTicks(config, xTickDomain);
	const y = scaleLinear()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const plot = plotBoundsFor(width, height, margin);
	const transformX = (value: number) =>
		config.log ? Math.log10(Math.max(value, 0.001)) : value;
	const rLabel = correlationLabel(data, transformX);
	// Keep lower-is-better axes visually conventional: cheaper/faster remains left, while a small arrow marks the better corner.
	const bestCornerIsRight = !config.lowerBetter;
	const plottedPoints = data.slice(0, 130);
	const medianXValue =
		median(plottedPoints.map((point) => point.x)) ?? xDomain[0];
	const medianYValue =
		median(plottedPoints.map((point) => point.y)) ?? yDomain[0];
	const projectionPoints = plottedPoints.map((point) => ({
		x: xPoint(point.x),
		y: yPoint(point.y),
		xValue: point.x,
		yValue: point.y,
	}));
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		points: projectionPoints,
	});
	const labeledPoints =
		config.key === "frontierScore"
			? topIntelligenceScoreRows(plottedPoints)
			: extremeLabelRows(
					plottedPoints,
					(point) => modelKey(point.model),
					(point) => point.x,
					(point) => point.y,
					{ xHigherBetter: !config.lowerBetter },
				);
	const interactionLabelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: plottedPoints.map((point) => ({
			cx: xPoint(point.x),
			cy: yPoint(point.y),
			radius: INTERACTION_POINT_RADIUS,
		})),
		labels: plottedPoints
			.filter((point) => labeledPoints.has(point))
			.map((point, index) => ({
				key: modelKey(point.model),
				label: shortLabel(point.model),
				cx: xPoint(point.x),
				cy: yPoint(point.y),
				radius: INTERACTION_POINT_RADIUS,
				priority: plottedPoints.length - index,
			})),
		...INTERACTION_LABEL_METRICS,
	});

	return (
		<div
			className={`${styles.chartWrap} ${styles.interactionPlot}`}
			style={{ "--chart-max-width": `${width}px` } as CSSProperties}
		>
			<div className={styles.interactionPlotHead}>
				<div className={styles.interactionTitle}>{config.title}</div>
				<div className={styles.interactionBadge}>{rLabel}</div>
			</div>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`${config.title} scatter plot`}
				{...cursorProjectionHandlers}
			>
				<PlotFrame width={width} height={height} margin={margin} />
				<CursorCapture bounds={plot} />
				<XAxisTicks
					ticks={xTicks}
					xPoint={xPoint}
					y={plot.bottom}
					format={config.format}
					keyPrefix={config.key}
				/>
				<YAxisTicks
					ticks={yTicks}
					yPoint={yPoint}
					x={plot.left}
					format={(tick) => String(tick)}
					keyPrefix={config.key}
				/>
				<AxisTitles
					width={width}
					height={height}
					margin={margin}
					x={config.xLabel}
					y="Intelligence score"
					xTitleOffset={50}
				/>
				<MedianCross
					x={xPoint(medianXValue)}
					y={yPoint(medianYValue)}
					bounds={plot}
					xLabel={config.format(medianXValue)}
					yLabel={medianYValue.toFixed(0)}
				/>
				<CursorProjectionLayer
					projection={cursorProjection}
					bounds={plot}
					xLabel={
						cursorProjection
							? config.tooltipFormat(cursorProjection.xValue)
							: ""
					}
					yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
				/>
				<CornerDirectionArrow
					bounds={plot}
					corner={bestCornerIsRight ? "upper-right" : "upper-left"}
				/>
				{plottedPoints.map((point) => {
					const cx = xPoint(point.x);
					const cy = yPoint(point.y);
					const rows: HoverRow[] = [
						["Intelligence score", fmtTooltipScore(point.y)],
						[config.hoverLabel ?? config.xLabel, config.tooltipFormat(point.x)],
					];
					return (
						<g key={point.model.id ?? `${point.x}-${point.y}`}>
							<circle
								className={styles.datavizPoint}
								cx={cx}
								cy={cy}
								r={stableSvgNumber(INTERACTION_POINT_RADIUS)}
								fill={providerPaletteColor(point.model.provider)}
								stroke="rgba(8,9,9,0.7)"
								strokeWidth={1}
								opacity={1}
							/>
							<PointHitTarget
								cx={cx}
								cy={cy}
								model={point.model}
								rows={rows}
								setHover={setHover}
								snapProjection={{
									x: cx,
									y: cy,
									xValue: point.x,
									yValue: point.y,
								}}
								setCursorProjection={setCursorProjection}
							/>
						</g>
					);
				})}
				{plottedPoints.map((point) =>
					labeledPoints.has(point) ? (
						<PointLabel
							key={`label-${point.model.id ?? `${point.x}-${point.y}`}`}
							model={point.model}
							cx={xPoint(point.x)}
							cy={yPoint(point.y)}
							width={width}
							margin={margin}
							height={height}
							placement={interactionLabelPlacements.get(modelKey(point.model))}
						/>
					) : null,
				)}
			</svg>
			<div className={styles.interactionRead}>{config.read}</div>
		</div>
	);
}

function topIntelligenceScoreRows(points: readonly Point[]) {
	return new Set(
		[...points]
			.sort((left, right) => right.y - left.y || right.x - left.x)
			.slice(0, 3),
	);
}
