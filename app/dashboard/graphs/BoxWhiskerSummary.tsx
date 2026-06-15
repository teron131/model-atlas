"use client";

/** Responsive box-whisker summary for graph overview cards. */

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { clamp } from "../../../src/model-atlas/math-utils";
import styles from "./graphs.module.css";

export type BoxWhiskerDistribution = {
	count: number;
	min: number;
	q1: number;
	median: number;
	q3: number;
	max: number;
};

const TOP_LABEL_COLLISION_RATIO = 0.12;

type TopLabelMode = "spread" | "stagger" | null;

export function BoxWhiskerSummary({
	label,
	distribution,
	displayDistribution,
	domainMin,
	domainMax,
	formatValue = (value) => value.toFixed(0),
	countLabel = "models",
	showDomainEndpoints = false,
	showDomainEndpointLabels = false,
	showObservedLabels = false,
}: {
	label: string;
	distribution: BoxWhiskerDistribution;
	displayDistribution?: BoxWhiskerDistribution;
	domainMin?: number;
	domainMax: number;
	formatValue?: (value: number) => string;
	countLabel?: string;
	showDomainEndpoints?: boolean;
	showDomainEndpointLabels?: boolean;
	showObservedLabels?: boolean;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [medianOnTop, setMedianOnTop] = useState(false);
	const [staggerTopMedian, setStaggerTopMedian] = useState(false);
	const requestedMinValue =
		domainMin ?? (showDomainEndpoints ? 0 : distribution.min);
	const minValue = Math.min(requestedMinValue, distribution.min);
	const maxValue = Math.max(domainMax, distribution.max);
	const domainSpan = Math.max(maxValue - minValue, 1);
	const toPosition = (value: number) => {
		const ratio = clamp((value - minValue) / domainSpan, 0, 1);
		const inset = 28;
		const percent = ratio * 100;
		const offset = inset * (1 - ratio * 2);
		const operator = offset < 0 ? "-" : "+";
		return `calc(${percent}% ${operator} ${Math.abs(offset)}px)`;
	};
	const displayValues = displayDistribution ?? distribution;
	const displayMedianValue = formatValue(displayValues.median);
	const domainMinValue = formatValue(minValue);
	const domainMaxValue = formatValue(maxValue);
	const minDisplayValue = formatValue(displayValues.min);
	const maxDisplayValue = formatValue(displayValues.max);
	const hideMinValue =
		showDomainEndpoints && minDisplayValue === domainMinValue;
	const hideMaxValue =
		showDomainEndpoints && maxDisplayValue === domainMaxValue;
	const style = {
		"--whisker-domain-min": toPosition(minValue),
		"--whisker-min": toPosition(distribution.min),
		"--whisker-q1": toPosition(distribution.q1),
		"--whisker-median": toPosition(distribution.median),
		"--whisker-q3": toPosition(distribution.q3),
		"--whisker-max": toPosition(distribution.max),
		"--whisker-domain-max": toPosition(maxValue),
	} as CSSProperties;
	const usesObservedTopLabels = showDomainEndpoints || showObservedLabels;
	const nearestObservedLabelRatio =
		Math.min(
			Math.abs(distribution.median - distribution.min),
			Math.abs(distribution.max - distribution.median),
		) / domainSpan;
	const observedRangeRatio =
		Math.abs(distribution.max - distribution.min) / domainSpan;
	const topLabelMode = boxWhiskerTopLabelMode({
		nearestObservedLabelRatio,
		observedRangeRatio,
		staggerTopMedian,
		usesObservedTopLabels,
	});
	const topLabelClassName =
		topLabelMode === "spread"
			? `${styles.boxWhiskerTopLabelsSeparated} ${styles.boxWhiskerTopLabelsSpread}`
			: topLabelMode === "stagger"
				? `${styles.boxWhiskerTopLabelsSeparated} ${styles.boxWhiskerTopLabelsStaggered}`
				: "";

	useEffect(() => {
		const root = rootRef.current;
		if (root == null) {
			return;
		}
		const measure = () => {
			const min = root.querySelector(`.${styles.boxWhiskerMinValue}`);
			const medianProbe = root.querySelector(
				`.${styles.boxWhiskerMedianProbe}`,
			);
			const max = root.querySelector(`.${styles.boxWhiskerMaxValue}`);
			const topMin = root.querySelector(`.${styles.boxWhiskerMinLabel}`);
			const topMedian = root.querySelector(`.${styles.boxWhiskerMedianLabel}`);
			const topMax = root.querySelector(`.${styles.boxWhiskerMaxLabel}`);
			if (min != null && medianProbe != null && max != null) {
				const medianRect = medianProbe.getBoundingClientRect();
				const nextMedianOnTop =
					hasHorizontalOverlap(medianRect, min) ||
					hasHorizontalOverlap(medianRect, max);
				setMedianOnTop((current) =>
					current === nextMedianOnTop ? current : nextMedianOnTop,
				);
			}
			const shouldStaggerTopMedian =
				usesObservedTopLabels &&
				topMin != null &&
				topMedian != null &&
				topMax != null &&
				(hasHorizontalOverlap(topMedian.getBoundingClientRect(), topMin) ||
					hasHorizontalOverlap(topMedian.getBoundingClientRect(), topMax));
			setStaggerTopMedian((current) =>
				current === shouldStaggerTopMedian ? current : shouldStaggerTopMedian,
			);
		};
		measure();
		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(root);
		return () => resizeObserver.disconnect();
	}, [usesObservedTopLabels]);

	return (
		<div
			ref={rootRef}
			className={`${styles.boxWhiskerSummary} ${
				showDomainEndpoints ? styles.boxWhiskerFixedDomain : ""
			}`}
			style={style}
		>
			<div className={styles.boxWhiskerTop}>
				<span>{label}</span>
				<b>
					{distribution.count} {countLabel}
				</b>
			</div>
			<div
				className={`${styles.boxWhiskerPlot} ${topLabelClassName}`}
				aria-label={`${label} distribution from ${formatValue(
					displayValues.min,
				)} to ${formatValue(displayValues.max)} with median ${formatValue(
					displayValues.median,
				)}`}
				role="img"
			>
				{usesObservedTopLabels ? (
					<span className={styles.boxWhiskerMinLabel}>MIN</span>
				) : null}
				{usesObservedTopLabels || medianOnTop ? (
					<span className={styles.boxWhiskerMedianLabel}>
						{usesObservedTopLabels ? "MED" : displayMedianValue}
					</span>
				) : null}
				{usesObservedTopLabels ? (
					<span className={styles.boxWhiskerMaxLabel}>MAX</span>
				) : null}
				{showDomainEndpoints ? (
					<span className={styles.boxWhiskerDomainLine} />
				) : null}
				<span className={styles.boxWhiskerLine} />
				<span className={styles.boxWhiskerMin} />
				<span className={styles.boxWhiskerMax} />
				<span className={styles.boxWhiskerBox} />
				<span className={styles.boxWhiskerMedian} />
			</div>
			<div
				className={`${styles.boxWhiskerStats} ${
					usesObservedTopLabels ? styles.boxWhiskerStatsStripLayout : ""
				}`}
			>
				{showDomainEndpoints && showDomainEndpointLabels ? (
					<span className={styles.boxWhiskerDomainMinValue}>
						{domainMinValue}
					</span>
				) : null}
				{usesObservedTopLabels ? (
					<span className={styles.boxWhiskerObservedStrip}>
						<span>
							<b>MIN</b> {minDisplayValue}
						</span>
						<span>
							<b>MED</b> {displayMedianValue}
						</span>
						<span>
							<b>MAX</b> {maxDisplayValue}
						</span>
					</span>
				) : (
					<>
						{hideMinValue ? null : (
							<span className={styles.boxWhiskerMinValue}>
								{minDisplayValue}
							</span>
						)}
						<span className={styles.boxWhiskerMedianProbe} aria-hidden="true">
							{displayMedianValue}
						</span>
						{medianOnTop ? null : (
							<span className={styles.boxWhiskerMedianValue}>
								{displayMedianValue}
							</span>
						)}
						{hideMaxValue ? null : (
							<span className={styles.boxWhiskerMaxValue}>
								{maxDisplayValue}
							</span>
						)}
					</>
				)}
				{showDomainEndpoints && showDomainEndpointLabels ? (
					<span className={styles.boxWhiskerDomainMaxValue}>
						{domainMaxValue}
					</span>
				) : null}
			</div>
		</div>
	);
}

function boxWhiskerTopLabelMode({
	nearestObservedLabelRatio,
	observedRangeRatio,
	staggerTopMedian,
	usesObservedTopLabels,
}: {
	nearestObservedLabelRatio: number;
	observedRangeRatio: number;
	staggerTopMedian: boolean;
	usesObservedTopLabels: boolean;
}): TopLabelMode {
	if (!usesObservedTopLabels) {
		return null;
	}
	if (observedRangeRatio < TOP_LABEL_COLLISION_RATIO) {
		return "spread";
	}
	if (
		staggerTopMedian &&
		nearestObservedLabelRatio < TOP_LABEL_COLLISION_RATIO
	) {
		return "stagger";
	}
	return null;
}

function hasHorizontalOverlap(
	referenceRect: DOMRect,
	element: Element,
	padding = 4,
) {
	const rect = element.getBoundingClientRect();
	return (
		referenceRect.left < rect.right + padding &&
		referenceRect.right > rect.left - padding
	);
}
