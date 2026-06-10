"use client";

/** Shared SVG and hover primitives for Model Atlas charts. */

import Image from "next/image";
import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useState,
} from "react";

import type { ModelStatsSelectedModel } from "../../../src/model-atlas/llm/model-stats/types";
import { clamp } from "../../../src/model-atlas/math-utils";
import styles from "../charts.module.css";
import { fmtCompact } from "./format";
import { focusHover, modelName, pointHover, shortLabel } from "./models";
import type { HoverRow, HoverSetter, HoverState, Margin } from "./types";

export type CursorProjection = {
	x: number;
	y: number;
	xValue: number;
	yValue: number;
};

type ProjectionPoint = CursorProjection;

export type PlotBounds = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

type ProjectionConfig = {
	event: ReactPointerEvent<SVGSVGElement>;
	bounds: PlotBounds;
	xInvert: (position: number) => number;
	yInvert: (position: number) => number;
	points: ProjectionPoint[];
	snapDistance?: number;
};

type ProjectionTarget = Omit<ProjectionConfig, "event">;

const SVG_NUMBER_DECIMALS = 3;

// Keep SSR and hydration SVG attributes stable across runtimes.
export function stableSvgNumber(value: number) {
	return Number(value.toFixed(SVG_NUMBER_DECIMALS));
}

export function stableSvgScale(scale: (value: number) => number) {
	return (value: number) => stableSvgNumber(scale(value));
}

export function plotBoundsFor(
	width: number,
	height: number,
	margin: Margin,
): PlotBounds {
	return {
		left: margin.left,
		right: width - margin.right,
		top: margin.top,
		bottom: height - margin.bottom,
	};
}

function cursorProjectionFromPointer({
	event,
	bounds: plot,
	xInvert,
	yInvert,
	points,
	snapDistance = 16,
}: ProjectionConfig): CursorProjection | null {
	const svg = event.currentTarget;
	const bounds = svg.getBoundingClientRect();
	const viewBox = svg.viewBox.baseVal;
	const pointerX =
		((event.clientX - bounds.left) / bounds.width) * viewBox.width;
	const pointerY =
		((event.clientY - bounds.top) / bounds.height) * viewBox.height;

	if (
		pointerX < plot.left ||
		pointerX > plot.right ||
		pointerY < plot.top ||
		pointerY > plot.bottom
	) {
		return null;
	}

	let nearestPoint: ProjectionPoint | null = null;
	let nearestDistance = Infinity;
	for (const point of points) {
		const dx = point.x - pointerX;
		const dy = point.y - pointerY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestPoint = point;
		}
	}

	if (nearestPoint && nearestDistance <= snapDistance) {
		return {
			x: nearestPoint.x,
			y: nearestPoint.y,
			xValue: nearestPoint.xValue,
			yValue: nearestPoint.yValue,
		};
	}

	return {
		x: stableSvgNumber(pointerX),
		y: stableSvgNumber(pointerY),
		xValue: xInvert(pointerX),
		yValue: yInvert(pointerY),
	};
}

export function useCursorProjection() {
	const [cursorProjection, setCursorProjection] =
		useState<CursorProjection | null>(null);

	return {
		cursorProjection,
		cursorHandlers: ({
			bounds,
			xInvert,
			yInvert,
			points,
			snapDistance,
		}: ProjectionTarget) => ({
			onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
				setCursorProjection(
					cursorProjectionFromPointer({
						event,
						bounds,
						xInvert,
						yInvert,
						points,
						snapDistance,
					}),
				);
			},
			onPointerLeave: () => setCursorProjection(null),
		}),
	};
}

export function CursorCapture({ bounds }: { bounds: PlotBounds }) {
	return (
		<rect
			className={styles.cursorCapture}
			x={bounds.left}
			y={bounds.top}
			width={bounds.right - bounds.left}
			height={bounds.bottom - bounds.top}
		/>
	);
}

export function MedianCross({
	x,
	y,
	bounds,
	xLabel,
	yLabel,
}: {
	x: number;
	y: number;
	bounds: PlotBounds;
	xLabel: string;
	yLabel: string;
}) {
	return (
		<>
			<line
				className={styles.medianAxis}
				x1={x}
				x2={x}
				y1={bounds.top}
				y2={bounds.bottom}
			/>
			<line
				className={styles.medianAxis}
				x1={bounds.left}
				x2={bounds.right}
				y1={y}
				y2={y}
			/>
			<text
				className={styles.medianLabel}
				x={x}
				y={bounds.top - 8}
				textAnchor="middle"
			>
				{xLabel}
			</text>
			<text className={styles.medianLabel} x={bounds.right + 12} y={y + 5}>
				{yLabel}
			</text>
		</>
	);
}

export function CursorProjectionLayer({
	projection,
	bounds,
	xLabel,
	yLabel,
}: {
	projection: CursorProjection | null;
	bounds: PlotBounds;
	xLabel: string;
	yLabel: string;
}) {
	if (!projection) {
		return null;
	}

	return (
		<g className={styles.cursorProjection}>
			<line
				x1={projection.x}
				x2={projection.x}
				y1={bounds.top}
				y2={projection.y}
			/>
			<line
				x1={projection.x}
				x2={bounds.right}
				y1={projection.y}
				y2={projection.y}
			/>
			<circle cx={projection.x} cy={projection.y} r={3} />
			<text
				className={styles.cursorProjectionLabel}
				x={projection.x}
				y={bounds.top - 8}
				textAnchor="middle"
			>
				{xLabel}
			</text>
			<text
				className={styles.cursorProjectionLabel}
				x={bounds.right + 10}
				y={projection.y + 4}
				textAnchor="start"
			>
				{yLabel}
			</text>
		</g>
	);
}

export function XAxisTicks({
	ticks,
	xPoint,
	y,
	format,
	keyPrefix,
	tickLength = 7,
	labelOffset = 24,
	labelEvery = 1,
}: {
	ticks: number[];
	xPoint: (value: number) => number;
	y: number;
	format: (value: number) => string;
	keyPrefix: string;
	tickLength?: number;
	labelOffset?: number;
	labelEvery?: number;
}) {
	return ticks.map((tick, index) => (
		<g key={`${keyPrefix}-x-${tick}`}>
			<line
				className={styles.axisTick}
				x1={xPoint(tick)}
				x2={xPoint(tick)}
				y1={y}
				y2={y + tickLength}
			/>
			{index % labelEvery === 0 ? (
				<text
					className={styles.axisLabel}
					x={xPoint(tick)}
					y={y + labelOffset}
					textAnchor="middle"
				>
					{format(tick)}
				</text>
			) : null}
		</g>
	));
}

export function YAxisTicks({
	ticks,
	yPoint,
	x,
	format,
	keyPrefix,
	tickLength = 7,
	labelOffset = 15,
}: {
	ticks: number[];
	yPoint: (value: number) => number;
	x: number;
	format: (value: number) => string;
	keyPrefix: string;
	tickLength?: number;
	labelOffset?: number;
}) {
	return ticks.map((tick) => (
		<g key={`${keyPrefix}-y-${tick}`}>
			<line
				className={styles.axisTick}
				x1={x - tickLength}
				x2={x}
				y1={yPoint(tick)}
				y2={yPoint(tick)}
			/>
			<text
				className={styles.axisLabel}
				x={x - labelOffset}
				y={yPoint(tick) + 4}
				textAnchor="end"
			>
				{format(tick)}
			</text>
		</g>
	));
}

export function PlotFrame({
	width,
	height,
	margin,
}: {
	width: number;
	height: number;
	margin: Margin;
}) {
	return (
		<rect
			x={margin.left}
			y={margin.top}
			width={width - margin.left - margin.right}
			height={height - margin.top - margin.bottom}
			fill="rgba(255,255,255,0.015)"
		/>
	);
}

export function AxisTitles({
	width,
	height,
	margin,
	x,
	y,
	compact = false,
	xTitleOffset,
}: {
	width: number;
	height: number;
	margin: Margin;
	x: string;
	y: string;
	compact?: boolean;
	xTitleOffset?: number;
}) {
	const plotLeft = margin.left;
	const plotRight = width - margin.right;
	const plotBottom = height - margin.bottom;
	const plotMiddleY = margin.top + (height - margin.top - margin.bottom) / 2;
	const yTitleX = compact ? 14 : 18;
	const resolvedXTitleOffset = xTitleOffset ?? (compact ? 58 : 60);
	return (
		<>
			<text
				className={styles.axisTitle}
				x={plotLeft + (plotRight - plotLeft) / 2}
				y={plotBottom + resolvedXTitleOffset}
				textAnchor="middle"
			>
				{x}
			</text>
			<text
				className={styles.axisTitle}
				x={yTitleX}
				y={plotMiddleY}
				textAnchor="middle"
				transform={`rotate(-90 ${yTitleX} ${plotMiddleY})`}
			>
				{y}
			</text>
		</>
	);
}

export function PointHitTarget({
	cx,
	cy,
	model,
	rows,
	setHover,
	hoverTitle,
}: {
	cx: number;
	cy: number;
	model: ModelStatsSelectedModel;
	rows: HoverRow[];
	setHover: HoverSetter;
	hoverTitle?: string;
}) {
	const size = 28;
	const displayName = hoverTitle ?? modelName(model);
	return (
		<foreignObject
			x={cx - size / 2}
			y={cy - size / 2}
			width={size}
			height={size}
		>
			<button
				type="button"
				className={styles.pointButton}
				aria-label={`Show details for ${displayName}`}
				onPointerEnter={(event) =>
					setHover(pointHover(event, model, rows, displayName))
				}
				onFocus={(event) =>
					setHover(focusHover(event.currentTarget, model, rows, displayName))
				}
				onPointerMove={(event) =>
					setHover((hover) =>
						hover
							? {
									...hover,
									left: event.clientX,
									top: event.clientY,
								}
							: null,
					)
				}
				onPointerLeave={() => setHover(null)}
				onBlur={() => setHover(null)}
			/>
		</foreignObject>
	);
}

export function PointLabel({
	model,
	cx,
	cy,
	width,
	margin,
	height,
}: {
	model: ModelStatsSelectedModel;
	cx: number;
	cy: number;
	width: number;
	margin: Margin;
	height: number;
}) {
	const labelOnLeft = cx > width - margin.right - 120;
	const xOffset = 10;
	const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
	return (
		<text
			className={styles.pointLabel}
			x={labelOnLeft ? cx - xOffset : cx + xOffset}
			y={y}
			textAnchor={labelOnLeft ? "end" : "start"}
		>
			{shortLabel(model)}
		</text>
	);
}

export function DeepSWEPointLabel({
	label,
	cx,
	cy,
	width,
	margin,
	height,
	xOffset = 10,
}: {
	label: string;
	cx: number;
	cy: number;
	width: number;
	margin: Margin;
	height: number;
	xOffset?: number;
}) {
	const labelOnLeft = cx > width - margin.right - 135;
	const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
	return (
		<text
			className={styles.pointLabel}
			x={labelOnLeft ? cx - xOffset : cx + xOffset}
			y={y}
			textAnchor={labelOnLeft ? "end" : "start"}
		>
			{label}
		</text>
	);
}

export function HoverCard({ hover }: { hover: HoverState }) {
	const left = Math.min(Math.max(14, hover.left + 16), window.innerWidth - 280);
	const top = Math.min(Math.max(14, hover.top + 16), window.innerHeight - 210);
	return (
		<div
			className={styles.hoverCard}
			style={
				{
					"--hover-color": hover.color,
					transform: `translate3d(${left}px, ${top}px, 0)`,
				} as CSSProperties
			}
		>
			<div className={styles.hoverCardHead}>
				<span className={styles.hoverCardLogo}>
					{hover.logo ? (
						<Image
							src={hover.logo}
							alt=""
							width={26}
							height={26}
							loading="lazy"
							unoptimized
							onError={(event) => {
								event.currentTarget.hidden = true;
							}}
						/>
					) : null}
				</span>
				<div>
					<div className={styles.hoverCardTitle}>{hover.model}</div>
					<div className={styles.hoverCardProvider}>{hover.provider}</div>
				</div>
			</div>
			<div className={styles.hoverCardRows}>
				{hover.rows.map(([label, value]) => (
					<div key={label} className={styles.hoverCardRow}>
						<span>{label}</span>
						<span>{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

export function EmptyChart({
	message = "No models match the current filters.",
}: {
	message?: string;
}) {
	return <div className={styles.error}>{message}</div>;
}

export function FilterButton({
	active,
	color,
	label,
	count,
	onClick,
}: {
	active: boolean;
	color: string;
	label: string;
	count: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={styles.filterButton}
			aria-pressed={active}
			style={{ "--provider-color": color } as CSSProperties}
			onClick={onClick}
		>
			<span className={styles.filterSwatch} />
			<span>{label}</span>
			<span>{fmtCompact(count)}</span>
		</button>
	);
}

export function SummaryCard({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className={styles.summaryCard}>
			<div className={styles.summaryLabel}>{label}</div>
			<span className={styles.summaryValue}>{value}</span>
			<span className={styles.summaryDetail}>{detail}</span>
		</div>
	);
}
