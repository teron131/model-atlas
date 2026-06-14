import { extent, median } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import type { CSSProperties } from "react";
import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";
import { clamp } from "../../../src/model-atlas/math-utils";
import { providerPaletteColor } from "../shared/providerTheme";
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
import { extremeLabelRows, intelligenceDistribution } from "./chartStats";
import { finiteValue, fmtTooltipScore } from "./format";
import styles from "./graphs.module.css";
import { interactionXAxisTicks } from "./interactionTicks";
import { calloutLabelPlacements } from "./labelPlacement";
import {
	correlationLabel,
	interactionConfigs,
	modelKey,
	positiveDomain,
	shortLabel,
} from "./models";
import { Panel } from "./Panel";
import type { HoverRow, HoverSetter, InteractionConfig, Point } from "./types";

export function InteractionMatrix({
	models,
	fullPayloadLoaded,
	setHover,
}: {
	models: LlmStatsModel[];
	fullPayloadLoaded: boolean;
	setHover: HoverSetter;
}) {
	const distribution = intelligenceDistribution(models);

	return (
		<Panel
			title="Intelligence interaction matrix"
			copy="Small multiples across price, speed, response time, context, task cost, and coding reliability."
			summary={
				<BoxWhiskerSummary
					label="Intelligence score"
					distribution={distribution}
					domainMax={100}
					showDomainEndpoints
				/>
			}
			wide
		>
			<div className={styles.interactionGrid}>
				{interactionConfigs.map((config) => (
					<InteractionPlot
						key={config.key}
						models={models}
						config={config}
						fullPayloadLoaded={fullPayloadLoaded}
						setHover={setHover}
					/>
				))}
			</div>
		</Panel>
	);
}

function InteractionPlot({
	models,
	config,
	fullPayloadLoaded,
	setHover,
}: {
	models: LlmStatsModel[];
	config: InteractionConfig;
	fullPayloadLoaded: boolean;
	setHover: HoverSetter;
}) {
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
	const data = models
		.map((model) => ({
			model,
			x: config.get(model),
			y: finiteValue(model.relative_scores?.intelligence_score),
			overall: finiteValue(model.relative_scores?.overall_score),
			agentic: finiteValue(model.relative_scores?.agentic_score),
		}))
		.filter(
			(point): point is Point =>
				point.x != null && point.y != null && (!config.log || point.x > 0),
		);

	if (data.length === 0) {
		if (!fullPayloadLoaded) {
			return null;
		}
		return (
			<div className={styles.interactionPlot}>
				<div className={styles.interactionPlotHead}>
					<div className={styles.interactionTitle}>{config.title}</div>
					<div className={styles.interactionBadge}>r --</div>
				</div>
				<EmptyChart />
			</div>
		);
	}

	const width = 430;
	const height = 315;
	const margin = { top: 22, right: 52, bottom: 64, left: 54 };
	const [rawMin, rawMax] = extent(data, (point) => point.x);
	const xMin = rawMin ?? 1;
	const xMax = rawMax ?? xMin * 2;
	const xSpan = xMax - xMin || Math.max(1, xMax);
	const xDomain: [number, number] = config.log
		? positiveDomain(data.map((point) => point.x))
		: [Math.min(0, xMin - xSpan * 0.05), xMax + xSpan * 0.05];
	const xTickDomain: [number, number] = xMin < xMax ? [xMin, xMax] : xDomain;
	const yValues = data.map((point) => point.y);
	const yDomain: [number, number] = [
		Math.min(0, Math.floor((Math.min(...yValues) - 6) / 10) * 10),
		Math.max(105, Math.ceil((Math.max(...yValues) + 6) / 10) * 10),
	];
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
	const labeledPoints = extremeLabelRows(
		plottedPoints,
		(point) => modelKey(point.model),
		(point) => point.x,
		(point) => point.y,
		{ xHigherBetter: !config.lowerBetter },
	);
	const pointRadius = (point: Point) => clamp((point.overall ?? 45) / 18, 3, 6);
	const interactionLabelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: plottedPoints.map((point) => ({
			cx: xPoint(point.x),
			cy: yPoint(point.y),
			radius: pointRadius(point),
		})),
		labels: plottedPoints
			.filter((point) => labeledPoints.has(point))
			.map((point, index) => ({
				key: modelKey(point.model),
				label: shortLabel(point.model),
				cx: xPoint(point.x),
				cy: yPoint(point.y),
				radius: pointRadius(point),
				priority: plottedPoints.length - index,
			})),
		fontSize: 9.5,
		charWidth: 5.8,
		lineHeight: 11,
		padding: 3,
	});

	return (
		<div className={styles.interactionPlot}>
			<div className={styles.interactionPlotHead}>
				<div className={styles.interactionTitle}>{config.title}</div>
				<div className={styles.interactionBadge}>{rLabel}</div>
			</div>
			<svg
				style={{ "--chart-max-width": `${width}px` } as CSSProperties}
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
					tickLength={6}
					labelOffset={20}
				/>
				<YAxisTicks
					ticks={[0, 20, 40, 60, 80, 100].filter(
						(tick) => tick >= yDomain[0] && tick <= yDomain[1],
					)}
					yPoint={yPoint}
					x={plot.left}
					format={(tick) => String(tick)}
					keyPrefix={config.key}
					tickLength={6}
					labelOffset={12}
				/>
				<AxisTitles
					width={width}
					height={height}
					margin={margin}
					x={config.xLabel}
					y="Intelligence score"
					compact
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
					const radius = clamp((point.overall ?? 45) / 18, 3, 6);
					const cx = xPoint(point.x);
					const cy = yPoint(point.y);
					const rows: HoverRow[] = [
						["Intelligence", fmtTooltipScore(point.y)],
						[config.xLabel, config.tooltipFormat(point.x)],
						["Overall", fmtTooltipScore(point.overall)],
						["Agentic", fmtTooltipScore(point.agentic)],
					];
					return (
						<g key={point.model.id ?? `${point.x}-${point.y}`}>
							<circle
								className={styles.datavizPoint}
								cx={cx}
								cy={cy}
								r={stableSvgNumber(radius)}
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
