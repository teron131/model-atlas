"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

import type { ModelStatsSelectedModel } from "../../../src/model-atlas/llm/llm-stats/types";
import { clamp } from "../../../src/model-atlas/math-utils";
import styles from "../charts.module.css";
import { fmtCompact } from "./format";
import { focusHover, modelName, pointHover, shortLabel } from "./models";
import type { HoverRow, HoverSetter, HoverState, Margin } from "./types";

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
