import { median } from "d3-array";
import { scaleLinear } from "d3-scale";
import type {
	CSSProperties,
	FocusEvent as ReactFocusEvent,
	PointerEvent as ReactPointerEvent,
} from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";
import {
	providerAssetLogo,
	providerFilterKey,
	providerName,
	providerPaletteColor,
} from "../shared/providerTheme";
import {
	AxisTitles,
	CornerDirectionArrow,
	CursorCapture,
	CursorProjectionLayer,
	DeepSWEPointLabel,
	EmptyChart,
	MedianCross,
	PlotFrame,
	plotBoundsFor,
	SummaryCard,
	stableSvgNumber,
	stableSvgScale,
	useCursorProjection,
	XAxisTicks,
	YAxisTicks,
} from "./ChartComponents";
import { linearBubbleRadius } from "./chartStats";
import { finiteValue, fmtCompact } from "./format";
import styles from "./graphs.module.css";
import { calloutLabelPlacements } from "./labelPlacement";
import { modelName } from "./models";
import type { HoverRow, HoverSetter, Margin } from "./types";

const QUALITY_INTELLIGENCE_WEIGHT = 0.65;
const QUALITY_AGENTIC_WEIGHT = 0.35;

type ProviderModelPoint = {
	model: LlmStatsModel;
	intelligence: number;
	quality: number;
	value: number;
};

export type ProviderEfficiencyRow = {
	key: string;
	label: string;
	color: string;
	logo: string;
	models: ProviderModelPoint[];
	quality: number;
	value: number;
	topIntelligenceModels: ProviderModelPoint[];
};

export function providerEfficiencyRows(
	models: LlmStatsModel[],
): ProviderEfficiencyRow[] {
	const grouped = new Map<string, ProviderModelPoint[]>();
	for (const model of models) {
		const intelligence = finiteValue(model.relative_scores?.intelligence_score);
		const agentic = finiteValue(model.relative_scores?.agentic_score);
		const value = finiteValue(model.relative_scores?.value_score);
		if (intelligence == null || agentic == null || value == null) {
			continue;
		}
		const quality = providerQualityScore(intelligence, agentic);
		const key = providerFilterKey(providerName(model.provider));
		const point = { model, intelligence, quality, value };
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
				value: median(providerModels.map((point) => point.value)) ?? 0,
				topIntelligenceModels,
			};
		})
		.sort(
			(left, right) => right.quality - left.quality || right.value - left.value,
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
			<EmptyChart message="No provider rows have quality and value scores in the current model set." />
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
					label="Best median value"
					value={summary.bestValue.label}
					detail={`${summary.bestValue.value.toFixed(1)} value`}
				/>
				<SummaryCard
					label="Best quality / value"
					value={summary.bestQualityPerValue.label}
					detail={`${providerQualityPerValue(summary.bestQualityPerValue).toFixed(2)} ratio`}
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
	let bestValue = first;
	let bestQualityPerValue = first;
	for (const row of rows) {
		if (row.quality > bestQuality.quality) {
			bestQuality = row;
		}
		if (row.value > bestValue.value) {
			bestValue = row;
		}
		if (
			providerQualityPerValue(row) >
			providerQualityPerValue(bestQualityPerValue)
		) {
			bestQualityPerValue = row;
		}
	}
	return {
		bestQuality,
		bestValue,
		bestQualityPerValue,
	};
}

function providerQualityPerValue({ quality, value }: ProviderEfficiencyRow) {
	return value > 0 ? quality / value : 0;
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
	const values = rows.map((row) => row.value);
	const qualities = rows.map((row) => row.quality);
	const medianValue = median(values) ?? 0;
	const medianQuality = median(qualities) ?? 0;
	const xDomain = scoreDomain(values);
	const yDomain = scoreDomain(qualities);
	const xTicks = scoreTicks(xDomain);
	const yTicks = scoreTicks(yDomain);
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
		x: xPoint(row.value),
		y: yPoint(row.quality),
		xValue: row.value,
		yValue: row.quality,
	}));
	const cursorProjectionHandlers = cursorHandlers({
		bounds: plot,
		points: projectionPoints,
	});
	const labelPlacements = calloutLabelPlacements({
		bounds: plot,
		obstacles: rows.map((row) => ({
			cx: xPoint(row.value),
			cy: yPoint(row.quality),
			radius: radius(row.models.length),
		})),
		labels: rows.map((row, index) => ({
			key: row.key,
			label: row.label,
			cx: xPoint(row.value),
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
				aria-label="Provider median quality by median value scatter plot"
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
					x="Median value score"
					y="Median quality score"
					xTitleOffset={52}
				/>
				<MedianCross
					x={xPoint(medianValue)}
					y={yPoint(medianQuality)}
					bounds={plot}
					xLabel={medianValue.toFixed(0)}
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
					const cx = xPoint(row.value);
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
								onEnvelope ? "rgba(255, 90, 70, 0.95)" : "rgba(8, 9, 9, 0.7)"
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
									xValue: row.value,
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
									xValue: row.value,
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
						cx={xPoint(row.value)}
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
		["Median quality", row.quality.toFixed(1)],
		["Median value", row.value.toFixed(1)],
		["Eligible models", fmtCompact(row.models.length)],
		["Top intelligence models", topModelNames || "--"],
	];
	return {
		model: row.label,
		provider: "Provider median",
		color: row.color,
		logo: row.logo,
		rows,
	};
}

function scoreDomain(values: number[]): [number, number] {
	const finiteValues = values.filter((value) => Number.isFinite(value));
	const low = Math.min(...finiteValues);
	const high = Math.max(...finiteValues);
	if (!Number.isFinite(low) || !Number.isFinite(high)) {
		return [0, 100];
	}
	if (low === high) {
		const pad = 5;
		return [Math.max(0, low - pad), Math.min(100, high + pad)];
	}
	const pad = Math.max(4, (high - low) * 0.12);
	return [
		Math.max(0, Math.floor((low - pad) / 5) * 5),
		Math.min(100, Math.ceil((high + pad) / 5) * 5),
	];
}

function scoreTicks([low, high]: [number, number]) {
	const span = high - low;
	const step = span <= 30 ? 5 : 10;
	const first = Math.ceil(low / step) * step;
	const ticks: number[] = [];
	for (let tick = first; tick <= high; tick += step) {
		ticks.push(tick);
	}
	return ticks.length > 0 ? ticks : [low, high];
}

function providerEnvelopeRows(
	rows: ProviderEfficiencyRow[],
): ProviderEfficiencyRow[] {
	const envelopeRows: ProviderEfficiencyRow[] = [];
	let bestQuality = -Infinity;
	for (const row of [...rows].sort((left, right) => right.value - left.value)) {
		if (row.quality > bestQuality) {
			envelopeRows.push(row);
			bestQuality = row.quality;
		}
	}
	return envelopeRows.reverse();
}

function providerEnvelopeStepPath(
	rows: ProviderEfficiencyRow[],
	x: (value: number) => number,
	y: (value: number) => number,
): string | null {
	return rows.reduce<string | null>((path, row, index) => {
		const nextX = x(row.value);
		const nextY = y(row.quality);
		if (index === 0) {
			return `M${nextX},${nextY}`;
		}
		return `${path} H${nextX} V${nextY}`;
	}, null);
}
