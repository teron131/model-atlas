import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import type {
	CSSProperties,
	FocusEvent as ReactFocusEvent,
	PointerEvent as ReactPointerEvent,
} from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";
import {
	providerAssetLogo,
	providerFilterKey,
	providerName,
	providerPaletteColor,
} from "../shared/providerTheme";
import { scoreAxisScale } from "./axisScale";
import { EmptyChart, SummaryCard } from "./ChartComponents";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	DeepSWEPointLabel,
	MedianCross,
	PlotFrame,
	plotBoundsFor,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./chartPrimitives";
import { linearBubbleRadius } from "./chartStats";
import { finiteValue, fmtCompact } from "./format";
import styles from "./graphs.module.css";
import { calloutLabelPlacements } from "./labelPlacement";
import { modelName } from "./models";
import type { HoverRow, HoverSetter, Margin } from "./types";

const QUALITY_INTELLIGENCE_WEIGHT = 0.65;
const QUALITY_AGENTIC_WEIGHT = 0.35;
const PROVIDER_SCORE_AXIS_OPTIONS = {
	paddingRatio: 0.12,
	singleValuePadding: 5,
};

type ProviderModelPoint = {
	model: LlmStatsModel;
	intelligence: number;
	quality: number;
	costEfficiency: number;
};

export type ProviderEfficiencyRow = {
	key: string;
	label: string;
	color: string;
	logo: string;
	models: ProviderModelPoint[];
	quality: number;
	costEfficiency: number;
	topIntelligenceModels: ProviderModelPoint[];
};

export function providerEfficiencyRows(
	models: LlmStatsModel[],
): ProviderEfficiencyRow[] {
	const grouped = new Map<string, ProviderModelPoint[]>();
	for (const model of models) {
		const intelligence = finiteValue(model.relative_scores?.intelligence_score);
		const agentic = finiteValue(model.relative_scores?.agentic_score);
		const costEfficiency = finiteValue(
			model.relative_scores?.cost_efficiency_score,
		);
		if (intelligence == null || agentic == null || costEfficiency == null) {
			continue;
		}
		const quality = providerQualityScore(intelligence, agentic);
		const key = providerFilterKey(providerName(model.provider));
		const point = { model, intelligence, quality, costEfficiency };
		const current = grouped.get(key);
		if (current == null) {
			grouped.set(key, [point]);
		} else {
			current.push(point);
		}
	}

	return [...grouped.entries()]
		.map(([key, providerModels]) => {
			const provider = providerModels[0]?.model.provider ?? key;
			const topIntelligenceModels = [...providerModels]
				.sort(
					(left, right) =>
						right.intelligence - left.intelligence ||
						right.quality - left.quality,
				)
				.slice(0, 3);
			return {
				key,
				label: providerName(provider),
				color: providerPaletteColor(provider),
				logo: providerAssetLogo(provider),
				models: providerModels,
				quality: median(providerModels.map((point) => point.quality)) ?? 0,
				costEfficiency:
					median(providerModels.map((point) => point.costEfficiency)) ?? 0,
				topIntelligenceModels,
			};
		})
		.sort(
			(left, right) =>
				right.quality - left.quality ||
				right.costEfficiency - left.costEfficiency,
		);
}

function providerQualityScore(intelligence: number, agentic: number) {
	return (
		intelligence * QUALITY_INTELLIGENCE_WEIGHT +
		agentic * QUALITY_AGENTIC_WEIGHT
	);
}

export function ProviderEfficiencyView({
	rows,
	setHover,
}: {
	rows: ProviderEfficiencyRow[];
	setHover: HoverSetter;
}) {
	if (rows.length === 0) {
		return (
			<EmptyChart message="No provider rows have quality and COST EFFICIENCY scores in the current model set." />
		);
	}

	const summary = providerEfficiencySummary(rows);
	return (
		<>
			<ProviderEfficiencyChart rows={rows} setHover={setHover} />
			<div className={styles.chartSummary}>
				<SummaryCard
					label="Best median quality"
					value={summary.bestQuality.label}
					detail={`${summary.bestQuality.quality.toFixed(1)} quality`}
				/>
				<SummaryCard
					label="Best median Cost Efficiency"
					value={summary.bestCost.label}
					detail={`${summary.bestCost.costEfficiency.toFixed(1)} COST EFFICIENCY`}
				/>
				<SummaryCard
					label="Best quality / Cost Efficiency"
					value={summary.bestQualityPerCost.label}
					detail={`${providerQualityPerCost(summary.bestQualityPerCost).toFixed(2)} ratio`}
				/>
			</div>
		</>
	);
}

function providerEfficiencySummary(rows: ProviderEfficiencyRow[]) {
	const first = rows[0];
	if (first == null) {
		throw new Error("Provider efficiency summary requires at least one row.");
	}
	let bestQuality = first;
	let bestCost = first;
	let bestQualityPerCost = first;
	for (const row of rows) {
		if (row.quality > bestQuality.quality) {
			bestQuality = row;
		}
		if (row.costEfficiency > bestCost.costEfficiency) {
			bestCost = row;
		}
		if (
			providerQualityPerCost(row) > providerQualityPerCost(bestQualityPerCost)
		) {
			bestQualityPerCost = row;
		}
	}
	return {
		bestQuality,
		bestCost,
		bestQualityPerCost,
	};
}

function providerQualityPerCost({
	quality,
	costEfficiency,
}: ProviderEfficiencyRow) {
	return costEfficiency > 0 ? quality / costEfficiency : 0;
}

function ProviderEfficiencyChart({
	rows,
	setHover,
	width = 760,
	height = 520,
	margin = { top: 30, right: 42, bottom: 72, left: 62 },
}: {
	rows: ProviderEfficiencyRow[];
	setHover: HoverSetter;
	width?: number;
	height?: number;
	margin?: Margin;
}) {
	const { cursorProjection, cursorHandlers, setCursorProjection } =
		useCursorProjection();
	const plot = plotBoundsFor(width, height, margin);
	const costScores = rows.map((row) => row.costEfficiency);
	const qualities = rows.map((row) => row.quality);
	const medianCost = median(costScores) ?? 0;
	const medianQuality = median(qualities) ?? 0;
	const costAxis = scoreAxisScale(costScores, PROVIDER_SCORE_AXIS_OPTIONS);
	const qualityAxis = scoreAxisScale(qualities, PROVIDER_SCORE_AXIS_OPTIONS);
	const xDomain = costAxis.domain;
	const yDomain = qualityAxis.domain;
	const xTicks = costAxis.ticks;
	const yTicks = qualityAxis.ticks;
	const x = scaleLinear()
		.domain(xDomain)
		.range([plot.left, plot.right])
		.clamp(true);
	const y = scaleLinear()
		.domain(yDomain)
		.range([plot.bottom, plot.top])
		.clamp(true);
	const xPoint = stableSvgScale(x);
	const yPoint = stableSvgScale(y);
	const radius = linearBubbleRadius(
		rows.map((row) => row.models.length),
		6,
		17,
	);
	const envelopeRows = providerEnvelopeRows(rows);
	const envelopeKeys = new Set(envelopeRows.map((row) => row.key));
	const envelopePath = providerEnvelopeStepPath(envelopeRows, xPoint, yPoint);
	const projectionPoints = rows.map((row) => ({
		x: xPoint(row.costEfficiency),
		y: yPoint(row.quality),
		xValue: row.costEfficiency,
		yValue: row.quality,
	}));
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		points: projectionPoints,
	});
	const labelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: rows.map((row) => ({
			cx: xPoint(row.costEfficiency),
			cy: yPoint(row.quality),
			radius: radius(row.models.length),
		})),
		labels: rows.map((row, index) => ({
			key: row.key,
			label: row.label,
			cx: xPoint(row.costEfficiency),
			cy: yPoint(row.quality),
			radius: radius(row.models.length),
			priority: rows.length - index,
		})),
		fontSize: 11,
		charWidth: 6.8,
	});

	return (
		<div
			className={styles.chartWrap}
			style={{ "--chart-max-width": `${width}px` } as CSSProperties}
		>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label="Provider median quality by median Cost Efficiency scatter plot"
				{...cursorProjectionHandlers}
			>
				<PlotFrame width={width} height={height} margin={margin} />
				<CursorCapture bounds={plot} />
				<YAxisTicks
					ticks={yTicks}
					yPoint={yPoint}
					x={plot.left}
					format={(tick) => tick.toFixed(0)}
					keyPrefix="provider-efficiency"
				/>
				<XAxisTicks
					ticks={xTicks}
					xPoint={xPoint}
					y={plot.bottom}
					format={(tick) => tick.toFixed(0)}
					keyPrefix="provider-efficiency"
					labelMinGap={48}
				/>
				<AxisTitles
					width={width}
					height={height}
					margin={margin}
					x="Median Cost Efficiency score"
					y="Median quality score"
					xTitleOffset={52}
				/>
				<MedianCross
					x={xPoint(medianCost)}
					y={yPoint(medianQuality)}
					bounds={plot}
					xLabel={medianCost.toFixed(0)}
					yLabel={medianQuality.toFixed(0)}
				/>
				<CornerDirectionArrow bounds={plot} corner="upper-right" />
				<CursorProjectionLayer
					projection={cursorProjection}
					bounds={plot}
					xLabel={cursorProjection ? cursorProjection.xValue.toFixed(1) : ""}
					yLabel={cursorProjection ? cursorProjection.yValue.toFixed(1) : ""}
				/>
				{envelopePath != null ? (
					<g>
						<path className={styles.providerEnvelopeHalo} d={envelopePath} />
						<path className={styles.providerEnvelopeLine} d={envelopePath} />
					</g>
				) : null}
				{rows.map((row) => {
					const cx = xPoint(row.costEfficiency);
					const cy = yPoint(row.quality);
					const r = radius(row.models.length);
					const onEnvelope = envelopeKeys.has(row.key);
					return (
						// biome-ignore lint/a11y/useSemanticElements: SVG chart points cannot be replaced with HTML buttons inside the scatter plot.
						<circle
							key={row.key}
							className={`${styles.datavizPoint} ${styles.providerEfficiencyPoint}`}
							cx={cx}
							cy={cy}
							r={stableSvgNumber(r)}
							fill={row.color}
							stroke={
								onEnvelope
									? "var(--chart-frontier-point-stroke)"
									: "var(--chart-point-stroke)"
							}
							strokeWidth={onEnvelope ? 2.1 : 1}
							opacity={1}
							role="button"
							tabIndex={0}
							aria-label={`Show details for ${row.label}`}
							onPointerEnter={(event) => {
								setCursorProjection({
									x: cx,
									y: cy,
									xValue: row.costEfficiency,
									yValue: row.quality,
								});
								setProviderHover(event, row, setHover);
							}}
							onPointerMove={(event) => updateProviderHover(event, setHover)}
							onPointerLeave={() => {
								setCursorProjection(null);
								setHover(null);
							}}
							onFocus={(event) => {
								setCursorProjection({
									x: cx,
									y: cy,
									xValue: row.costEfficiency,
									yValue: row.quality,
								});
								setProviderFocusHover(event, row, setHover);
							}}
							onBlur={() => {
								setCursorProjection(null);
								setHover(null);
							}}
						/>
					);
				})}
				{rows.map((row) => (
					<DeepSWEPointLabel
						key={`provider-label-${row.key}`}
						label={row.label}
						cx={xPoint(row.costEfficiency)}
						cy={yPoint(row.quality)}
						width={width}
						margin={margin}
						height={height}
						xOffset={radius(row.models.length) + 8}
						placement={labelPlacements.get(row.key)}
					/>
				))}
			</svg>
		</div>
	);
}

function setProviderHover(
	event: ReactPointerEvent,
	row: ProviderEfficiencyRow,
	setHover: HoverSetter,
) {
	setHover({
		left: event.clientX,
		top: event.clientY,
		...providerHoverState(row),
	});
}

function updateProviderHover(event: ReactPointerEvent, setHover: HoverSetter) {
	setHover((hover) =>
		hover == null ||
		(Math.abs(hover.left - event.clientX) < 6 &&
			Math.abs(hover.top - event.clientY) < 6)
			? hover
			: {
					...hover,
					left: event.clientX,
					top: event.clientY,
				},
	);
}

function setProviderFocusHover(
	event: ReactFocusEvent<SVGCircleElement>,
	row: ProviderEfficiencyRow,
	setHover: HoverSetter,
) {
	const bounds = event.currentTarget.getBoundingClientRect();
	setHover({
		left: bounds.left + bounds.width / 2,
		top: bounds.top + bounds.height / 2,
		...providerHoverState(row),
	});
}

function providerHoverState(row: ProviderEfficiencyRow) {
	const topModelNames = row.topIntelligenceModels
		.map((point) => modelName(point.model))
		.join(", ");
	const rows: HoverRow[] = [
		["Median quality score", row.quality.toFixed(1)],
		["Median Cost Efficiency score", row.costEfficiency.toFixed(1)],
		["Eligible models", fmtCompact(row.models.length)],
		["Top INTELLIGENCE models", topModelNames || "--"],
	];
	return {
		model: row.label,
		provider: "Provider median",
		color: row.color,
		logo: row.logo,
		rows,
	};
}

function providerEnvelopeRows(
	rows: ProviderEfficiencyRow[],
): ProviderEfficiencyRow[] {
	const envelopeRows: ProviderEfficiencyRow[] = [];
	let bestQuality = -Infinity;
	for (const row of [...rows].sort(
		(left, right) => right.costEfficiency - left.costEfficiency,
	)) {
		if (row.quality > bestQuality) {
			envelopeRows.push(row);
			bestQuality = row.quality;
		}
	}
	return envelopeRows.reverse();
}

function providerEnvelopeStepPath(
	rows: ProviderEfficiencyRow[],
	x: (costEfficiency: number) => number,
	y: (costEfficiency: number) => number,
): string | null {
	return rows.reduce<string | null>((path, row, index) => {
		const nextX = x(row.costEfficiency);
		const nextY = y(row.quality);
		if (index === 0) {
			return `M${nextX},${nextY}`;
		}
		return `${path} H${nextX} V${nextY}`;
	}, null);
}
