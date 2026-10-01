"use client";

/** Summarize finite chart observations and render their responsive box-whisker distribution. */

import { quantile } from "d3-array";
import type { CSSProperties } from "react";

import { clamp } from "../../../src/model-atlas/math-utils";
import { finite } from "./format";

import styles from "./graphs.module.css";

/** Compute quartiles from finite observations, retaining the established zero-valued empty summary. */
export function BoxWhiskerSummary({
  label,
  values,
  domainMin,
  domainMax,
  formatValue = (value) => value.toFixed(0),
  countLabel = "models",
  showDomainEndpoints = false,
  showObservedLabels = false,
}: {
  label: string;
  values: number[];
  domainMin?: number;
  domainMax: number;
  formatValue?: (value: number) => string;
  countLabel?: string;
  showDomainEndpoints?: boolean;
  showObservedLabels?: boolean;
}) {
  const sortedValues = values.filter(finite).sort((left, right) => left - right);
  const distribution = {
    count: sortedValues.length,
    min: sortedValues[0] ?? 0,
    q1: quantile(sortedValues, 0.25) ?? 0,
    median: quantile(sortedValues, 0.5) ?? 0,
    q3: quantile(sortedValues, 0.75) ?? 0,
    max: sortedValues[sortedValues.length - 1] ?? 0,
  };
  const requestedMinValue = domainMin ?? (showDomainEndpoints ? 0 : distribution.min);
  const minValue = Math.min(requestedMinValue, distribution.min);
  const maxValue = Math.max(domainMax, distribution.max);
  const domainSpan = Math.max(maxValue - minValue, 1);
  const toPosition = (value: number) => {
    const ratio = clamp((value - minValue) / domainSpan, 0, 1);
    const inset = 28;
    const percent = stableCssNumber(ratio * 100);
    const offset = stableCssNumber(inset * (1 - ratio * 2));
    const operator = offset < 0 ? "-" : "+";
    return `calc(${percent}% ${operator} ${Math.abs(offset)}px)`;
  };
  const medianValue = formatValue(distribution.median);
  const q1Value = formatValue(distribution.q1);
  const q3Value = formatValue(distribution.q3);
  const minDisplayValue = formatValue(distribution.min);
  const maxDisplayValue = formatValue(distribution.max);
  const style = {
    "--whisker-domain-min": toPosition(minValue),
    "--whisker-min": toPosition(distribution.min),
    "--whisker-q1": toPosition(distribution.q1),
    "--whisker-median": toPosition(distribution.median),
    "--whisker-q3": toPosition(distribution.q3),
    "--whisker-max": toPosition(distribution.max),
    "--whisker-domain-max": toPosition(maxValue),
  } as CSSProperties;

  return (
    <div className={styles.boxWhiskerSummary} style={style}>
      <div className={styles.boxWhiskerTop}>
        <div className={styles.boxWhiskerTopMeta}>
          <span>{label}</span>
          <b>
            {distribution.count} {countLabel}
          </b>
        </div>
        <strong className={styles.boxWhiskerMedianReadout}>{medianValue}</strong>
      </div>
      <div
        className={styles.boxWhiskerPlot}
        aria-label={`${label} distribution from ${minDisplayValue} to ${maxDisplayValue}, first quartile ${q1Value}, median ${medianValue}, and third quartile ${q3Value}`}
        role="img"
      >
        {showDomainEndpoints ? <span className={styles.boxWhiskerDomainLine} /> : null}
        <span className={styles.boxWhiskerLine} />
        <span className={styles.boxWhiskerMin} />
        <span className={styles.boxWhiskerMax} />
        <span className={styles.boxWhiskerBox} />
        <span className={styles.boxWhiskerMedian} />
      </div>
      <div className={styles.boxWhiskerStats} aria-hidden="true">
        <span className={styles.boxWhiskerMinValue}>
          {showObservedLabels ? <b>MIN </b> : null}
          {minDisplayValue}
        </span>
        <span className={styles.boxWhiskerQuartileValues}>
          <b>Q1</b> {q1Value} · <b>Q3</b> {q3Value}
        </span>
        <span className={styles.boxWhiskerMaxValue}>
          {showObservedLabels ? <b>MAX </b> : null}
          {maxDisplayValue}
        </span>
      </div>
    </div>
  );
}

/** Keep server and browser style serialization identical at sub-pixel precision. */
function stableCssNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
