"use client";

/** Shared scatter element for task-efficiency charts. */

import { LinePath } from "@visx/shape";
import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import type { CSSProperties } from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";
import { providerPaletteColor } from "../shared/providerTheme";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	DeepSWEPointLabel,
	MedianCross,
	PlotFrame,
	PointHitTarget,
	plotBoundsFor,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./ChartComponents";
import styles from "./graphs.module.css";
import { calloutLabelPlacements } from "./labelPlacement";
import type { HoverRow, HoverSetter, Margin } from "./types";

export type EfficiencyAxisMetric<Row> = {
	label: string;
	get: (row: Row) => number;
	format: (value: number) => string;
};

export type EfficiencyEffortLine<Row> = {
	key: string;
	rows: Row[];
	color: string;
};

export function EfficiencyAxisChart<Row>({
	rows,
	metric,
	xDomain,
	yDomain,
	yTicks,
	yAxisLabel,
	keyPrefix,
	ariaLabel,
	bubbleValue,
	bubbleRadius,
	getScore,
	getModel,
	getKey,
	getHoverRows,
	getHoverTitle,
	labelRows,
	getLabel,
	effortLines = [],
	setHover,
	width = 760,
	height = 490,
	margin = { top: 28, right: 34, bottom: 70, left: 62 },
}: {
	rows: Row[];
	metric: EfficiencyAxisMetric<Row>;
	xDomain: [number, number];
	yDomain: [number, number];
	yTicks: number[];
	yAxisLabel: string;
	keyPrefix: string;
	ariaLabel: string;
	bubbleValue: (row: Row) => number;
	bubbleRadius: (value: number) => number;
	getScore: (row: Row) => number;
	getModel: (row: Row) => LlmStatsModel;
	getKey: (row: Row) => string;
	getHoverRows: (row: Row) => HoverRow[];
	getHoverTitle?: (row: Row) => string;
	labelRows: Set<Row>;
	getLabel: (row: Row) => string;
	effortLines?: EfficiencyEffortLine<Row>[];
	setHover: HoverSetter;
	width?: number;
	height?: number;
	margin?: Margin;
}) {
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
	const metricValues = rows.map(metric.get);
	const xTicks =
		metric.label === "Value score"
			? roundedLinearTicks(xDomain, 10)
			: linearTicksForValues(metricValues, metric.format);
	const x = scaleLinear()
		.domain(xDomain)
		.range([margin.left, width - margin.right])
		.clamp(true);
	const y = scaleLinear()
		.domain(yDomain)
		.range([height - margin.bottom, margin.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const plot = plotBoundsFor(width, height, margin);
	const medianMetric = median(rows.map(metric.get)) ?? xDomain[0];
	const medianScore = median(rows.map(getScore)) ?? yDomain[0];
	const projectionPoints = rows.map((row) => {
		const xValue = metric.get(row);
		const yValue = getScore(row);
		return {
			x: xPoint(xValue),
			y: yPoint(yValue),
			xValue,
			yValue,
		};
	});
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		points: projectionPoints,
	});
	const labelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: rows.map((row) => ({
			cx: xPoint(metric.get(row)),
			cy: yPoint(getScore(row)),
			radius: bubbleRadius(bubbleValue(row)),
		})),
		labels: rows
			.filter((row) => labelRows.has(row))
			.map((row, index) => ({
				key: getKey(row),
				label: getLabel(row),
				cx: xPoint(metric.get(row)),
				cy: yPoint(getScore(row)),
				radius: bubbleRadius(bubbleValue(row)),
				priority: rows.length - index,
			})),
	});

	return (
		<div
			className={styles.chartWrap}
			style={{ "--chart-max-width": `${width}px` } as CSSProperties}
		>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={ariaLabel}
				{...cursorProjectionHandlers}
			>
				<PlotFrame width={width} height={height} margin={margin} />
				<CursorCapture bounds={plot} />
				<YAxisTicks
					ticks={yTicks}
					yPoint={yPoint}
					x={plot.left}
					format={(tick) => `${tick}%`}
					keyPrefix={keyPrefix}
				/>
				<XAxisTicks
					ticks={xTicks}
					xPoint={xPoint}
					y={plot.bottom}
					format={metric.format}
					keyPrefix={keyPrefix}
					labelMinGap={62}
				/>
				<AxisTitles
					width={width}
					height={height}
					margin={margin}
					x={metric.label}
					y={yAxisLabel}
					xTitleOffset={50}
				/>
				<MedianCross
					x={xPoint(medianMetric)}
					y={yPoint(medianScore)}
					bounds={plot}
					xLabel={metric.format(medianMetric)}
					yLabel={`${medianScore.toFixed(0)}%`}
				/>
				<CornerDirectionArrow bounds={plot} corner="upper-left" />
				<CursorProjectionLayer
					projection={cursorProjection}
					bounds={plot}
					xLabel={
						cursorProjection ? metric.format(cursorProjection.xValue) : ""
					}
					yLabel={
						cursorProjection ? `${cursorProjection.yValue.toFixed(1)}%` : ""
					}
				/>
				{effortLines.map((line) => (
					<LinePath<Row>
						key={line.key}
						className={styles.deepSweEffortLine}
						data={line.rows}
						x={(row) => xPoint(metric.get(row))}
						y={(row) => yPoint(getScore(row))}
						style={
							{
								"--line-color": line.color,
							} as CSSProperties
						}
					/>
				))}
				{rows.map((row) => {
					const axisValue = metric.get(row);
					const score = getScore(row);
					const cx = xPoint(axisValue);
					const cy = yPoint(score);
					const model = getModel(row);
					return (
						<g key={getKey(row)}>
							<circle
								className={styles.datavizPoint}
								cx={cx}
								cy={cy}
								r={stableSvgNumber(bubbleRadius(bubbleValue(row)))}
								fill={providerPaletteColor(model.provider)}
								stroke="rgba(8,9,9,0.7)"
								strokeWidth={1}
								opacity={1}
							/>
							<PointHitTarget
								cx={cx}
								cy={cy}
								model={model}
								rows={getHoverRows(row)}
								setHover={setHover}
								hoverTitle={getHoverTitle?.(row)}
								snapProjection={{
									x: cx,
									y: cy,
									xValue: axisValue,
									yValue: score,
								}}
								setCursorProjection={setCursorProjection}
							/>
						</g>
					);
				})}
				{rows.map((row) => {
					const axisValue = metric.get(row);
					const cx = xPoint(axisValue);
					const cy = yPoint(getScore(row));
					return labelRows.has(row) ? (
						<DeepSWEPointLabel
							key={`label-${getKey(row)}`}
							label={getLabel(row)}
							cx={cx}
							cy={cy}
							width={width}
							margin={margin}
							height={height}
							xOffset={bubbleRadius(bubbleValue(row)) + 8}
							placement={labelPlacements.get(getKey(row))}
						/>
					) : null;
				})}
			</svg>
		</div>
	);
}

function linearTicksForValues(
	values: number[],
	format: (value: number) => string,
) {
	const finiteValues = values.filter((value) => Number.isFinite(value));
	const low = Math.min(...finiteValues);
	const high = Math.max(...finiteValues);
	if (!Number.isFinite(low) || !Number.isFinite(high)) {
		return [];
	}
	if (low === high) {
		return [low];
	}
	const tickCount = 5;
	const ticks = Array.from(
		{ length: tickCount },
		(_, index) => low + ((high - low) * index) / (tickCount - 1),
	);
	const labels = new Set<string>();
	return ticks.filter((tick) => {
		const label = format(tick);
		if (labels.has(label)) {
			return false;
		}
		labels.add(label);
		return true;
	});
}

function roundedLinearTicks([low, high]: [number, number], step: number) {
	const first = Math.ceil(low / step) * step;
	const last = Math.floor(high / step) * step;
	if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) {
		return [];
	}
	return Array.from(
		{ length: Math.floor((last - first) / step) + 1 },
		(_, index) => first + index * step,
	);
}
