"use client";

/** Shared SVG and hover primitives for Model Atlas charts. */

import { Boxes } from "lucide-react";
import Image from "next/image";
import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useState,
} from "react";

import type { LlmStatsModel } from "../../../src/model-atlas/llm/stats/types";
import { clamp } from "../../../src/model-atlas/math-utils";
import { fmtCompact } from "./format";
import styles from "./graphs.module.css";
import type { PointLabelPlacement } from "./labelPlacement";
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
	points,
	snapDistance = 24,
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

	return nearestPoint && nearestDistance <= snapDistance ? nearestPoint : null;
}

export function useCursorProjection() {
	const [cursorProjection, setCursorProjection] =
		useState<CursorProjection | null>(null);

	return {
		cursorProjection,
		cursorHandlers: ({ bounds, points, snapDistance }: ProjectionTarget) => ({
			onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
				setCursorProjection(
					cursorProjectionFromPointer({
						event,
						bounds,
						points,
						snapDistance,
					}),
				);
			},
			onPointerLeave: () => setCursorProjection(null),
		}),
		setCursorProjection,
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
	labelMinGap = 0,
}: {
	ticks: number[];
	xPoint: (value: number) => number;
	y: number;
	format: (value: number) => string;
	keyPrefix: string;
	tickLength?: number;
	labelOffset?: number;
	labelEvery?: number;
	labelMinGap?: number;
}) {
	let lastLabelX = Number.NEGATIVE_INFINITY;
	const labelVisible = ticks.map((tick, index) => {
		if (index % labelEvery !== 0) {
			return false;
		}
		const x = xPoint(tick);
		if (x - lastLabelX < labelMinGap) {
			return false;
		}
		lastLabelX = x;
		return true;
	});
	return ticks.map((tick, index) => (
		<g key={`${keyPrefix}-x-${tick}`}>
			<line
				className={styles.axisTick}
				x1={xPoint(tick)}
				x2={xPoint(tick)}
				y1={y}
				y2={y + tickLength}
			/>
			{labelVisible[index] ? (
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

export function CornerDirectionArrow({
	bounds: plot,
	corner,
}: {
	bounds: PlotBounds;
	corner: "upper-left" | "upper-right";
}) {
	const direction = corner === "upper-right" ? 1 : -1;
	const tipX = corner === "upper-right" ? plot.right - 4 : plot.left + 4;
	const tipY = plot.top + 4;
	const unit = 1 / Math.SQRT2;
	const axis: [number, number] = [direction * unit, -unit];
	const normal: [number, number] = [unit, direction * unit];
	const length = 19;
	const headLength = 8.8;
	const tailWidth = 6.2;
	const headWidth = 13.8;
	const point = (
		axisOffset: number,
		normalOffset: number,
	): [number, number] => [
		tipX - axis[0] * axisOffset + normal[0] * normalOffset,
		tipY - axis[1] * axisOffset + normal[1] * normalOffset,
	];
	const pointCoordinates: [number, number][] = [
		point(length, tailWidth / 2),
		point(headLength, tailWidth / 2),
		point(headLength, headWidth / 2),
		[tipX, tipY],
		point(headLength, -headWidth / 2),
		point(headLength, -tailWidth / 2),
		point(length, -tailWidth / 2),
	];
	const points = pointCoordinates
		.map(([px, py]) => `${stableSvgNumber(px)},${stableSvgNumber(py)}`)
		.join(" ");

	return (
		<g className={styles.cornerDirection}>
			<polygon className={styles.cornerDirectionGlyph} points={points} />
		</g>
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
	snapProjection,
	setCursorProjection,
}: {
	cx: number;
	cy: number;
	model: LlmStatsModel;
	rows: HoverRow[];
	setHover: HoverSetter;
	hoverTitle?: string;
	snapProjection?: CursorProjection;
	setCursorProjection?: (projection: CursorProjection | null) => void;
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
				onPointerEnter={(event) => {
					if (snapProjection) {
						setCursorProjection?.(snapProjection);
					}
					setHover(pointHover(event, model, rows, displayName));
				}}
				onFocus={(event) => {
					if (snapProjection) {
						setCursorProjection?.(snapProjection);
					}
					setHover(focusHover(event.currentTarget, model, rows, displayName));
				}}
				onPointerMove={(event) =>
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
					)
				}
				onPointerLeave={() => {
					if (snapProjection) {
						setCursorProjection?.(null);
					}
					setHover(null);
				}}
				onBlur={() => {
					if (snapProjection) {
						setCursorProjection?.(null);
					}
					setHover(null);
				}}
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
	placement,
}: {
	model: LlmStatsModel;
	cx: number;
	cy: number;
	width: number;
	margin: Margin;
	height: number;
	placement?: PointLabelPlacement;
}) {
	const labelOnLeft = cx > width - margin.right - 120;
	const xOffset = 10;
	const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
	const textX = placement?.x ?? (labelOnLeft ? cx - xOffset : cx + xOffset);
	const textY = placement?.y ?? y;
	const textAnchor = placement?.textAnchor ?? (labelOnLeft ? "end" : "start");
	return (
		<g>
			{placement?.line ? (
				<line
					className={styles.pointLabelLine}
					x1={stableSvgNumber(placement.line.x1)}
					y1={stableSvgNumber(placement.line.y1)}
					x2={stableSvgNumber(placement.line.x2)}
					y2={stableSvgNumber(placement.line.y2)}
				/>
			) : null}
			<text
				className={styles.pointLabel}
				x={stableSvgNumber(textX)}
				y={stableSvgNumber(textY)}
				textAnchor={textAnchor}
			>
				{shortLabel(model)}
			</text>
		</g>
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
	placement,
}: {
	label: string;
	cx: number;
	cy: number;
	width: number;
	margin: Margin;
	height: number;
	xOffset?: number;
	placement?: PointLabelPlacement;
}) {
	const labelOnLeft = cx > width - margin.right - 135;
	const y = clamp(cy - 8, margin.top + 12, height - margin.bottom - 6);
	const textX = placement?.x ?? (labelOnLeft ? cx - xOffset : cx + xOffset);
	const textY = placement?.y ?? y;
	const textAnchor = placement?.textAnchor ?? (labelOnLeft ? "end" : "start");
	return (
		<g>
			{placement?.line ? (
				<line
					className={styles.pointLabelLine}
					x1={stableSvgNumber(placement.line.x1)}
					y1={stableSvgNumber(placement.line.y1)}
					x2={stableSvgNumber(placement.line.x2)}
					y2={stableSvgNumber(placement.line.y2)}
				/>
			) : null}
			<text
				className={styles.pointLabel}
				x={stableSvgNumber(textX)}
				y={stableSvgNumber(textY)}
				textAnchor={textAnchor}
			>
				{label}
			</text>
		</g>
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
	logo,
	label,
	count,
	onClick,
}: {
	active: boolean;
	color: string;
	logo?: string;
	label: string;
	count: number;
	onClick: () => void;
}) {
	const [failedLogo, setFailedLogo] = useState<string | null>(null);
	const showLogo = logo && failedLogo !== logo;

	return (
		<button
			type="button"
			className={styles.filterButton}
			aria-pressed={active}
			style={{ "--provider-color": color } as CSSProperties}
			onClick={onClick}
		>
			<span className={styles.filterIcon} aria-hidden="true">
				{showLogo ? (
					<Image
						className={styles.filterLogo}
						src={logo}
						alt=""
						width={16}
						height={16}
						loading="lazy"
						unoptimized
						onError={() => {
							setFailedLogo(logo);
						}}
					/>
				) : logo ? (
					<span className={styles.filterIconFallback}>{label.slice(0, 1)}</span>
				) : (
					<Boxes className={styles.filterAllIcon} strokeWidth={2.1} />
				)}
			</span>
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
