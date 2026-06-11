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

export function BoxWhiskerSummary({
	label,
	distribution,
	domainMin,
	domainMax,
	formatValue = (value) => value.toFixed(0),
	showDomainEndpoints = false,
	showObservedLabels = false,
}: {
	label: string;
	distribution: BoxWhiskerDistribution;
	domainMin?: number;
	domainMax: number;
	formatValue?: (value: number) => string;
	showDomainEndpoints?: boolean;
	showObservedLabels?: boolean;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [medianOnTop, setMedianOnTop] = useState(false);
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
	const medianValue = formatValue(distribution.median);
	const domainMinValue = formatValue(minValue);
	const domainMaxValue = formatValue(maxValue);
	const minDisplayValue = formatValue(distribution.min);
	const maxDisplayValue = formatValue(distribution.max);
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

	useEffect(() => {
		const root = rootRef.current;
		if (root == null) {
			return;
		}
		const measure = () => {
			const min = root.querySelector(`.${styles.boxWhiskerMinValue}`);
			const median = root.querySelector(`.${styles.boxWhiskerMedianProbe}`);
			const max = root.querySelector(`.${styles.boxWhiskerMaxValue}`);
			if (min == null || median == null || max == null) {
				return;
			}
			const medianRect = median.getBoundingClientRect();
			const overlaps = (element: Element) => {
				const rect = element.getBoundingClientRect();
				return (
					medianRect.left < rect.right + 4 && medianRect.right > rect.left - 4
				);
			};
			const nextMedianOnTop = overlaps(min) || overlaps(max);
			setMedianOnTop((current) =>
				current === nextMedianOnTop ? current : nextMedianOnTop,
			);
		};
		measure();
		const resizeObserver = new ResizeObserver(measure);
		resizeObserver.observe(root);
		return () => resizeObserver.disconnect();
	});
	const observedValuesOnTop = showDomainEndpoints || showObservedLabels;

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
				<b>{distribution.count} models</b>
			</div>
			<div
				className={styles.boxWhiskerPlot}
				aria-label={`${label} distribution from ${formatValue(
					distribution.min,
				)} to ${formatValue(distribution.max)} with median ${formatValue(
					distribution.median,
				)}`}
				role="img"
			>
				{observedValuesOnTop ? (
					<span className={styles.boxWhiskerMinLabel}>MIN</span>
				) : null}
				{observedValuesOnTop || medianOnTop ? (
					<span className={styles.boxWhiskerMedianLabel}>
						{observedValuesOnTop ? "MED" : medianValue}
					</span>
				) : null}
				{observedValuesOnTop ? (
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
			<div className={styles.boxWhiskerStats}>
				{showDomainEndpoints ? (
					<span className={styles.boxWhiskerDomainMinValue}>
						{domainMinValue}
					</span>
				) : null}
				{hideMinValue ? null : (
					<span className={styles.boxWhiskerMinValue}>{minDisplayValue}</span>
				)}
				{observedValuesOnTop ? null : (
					<span className={styles.boxWhiskerMedianProbe} aria-hidden="true">
						{medianValue}
					</span>
				)}
				{medianOnTop && !observedValuesOnTop ? null : (
					<span className={styles.boxWhiskerMedianValue}>{medianValue}</span>
				)}
				{hideMaxValue ? null : (
					<span className={styles.boxWhiskerMaxValue}>{maxDisplayValue}</span>
				)}
				{showDomainEndpoints ? (
					<span className={styles.boxWhiskerDomainMaxValue}>
						{domainMaxValue}
					</span>
				) : null}
			</div>
		</div>
	);
}
