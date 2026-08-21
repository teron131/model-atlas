/** Shared dashboard chart statistics and analytical summaries. */

import { quantile } from "d3-array";

import type { BoxWhiskerDistribution } from "./BoxWhiskerSummary";
import { finite } from "./format";
import type { Point } from "./types";

export function valueDistribution(values: number[]): BoxWhiskerDistribution {
  const sortedValues = values.filter(finite).sort((left, right) => left - right);

  return {
    count: sortedValues.length,
    min: sortedValues[0] ?? 0,
    q1: quantile(sortedValues, 0.25) ?? 0,
    median: quantile(sortedValues, 0.5) ?? 0,
    q3: quantile(sortedValues, 0.75) ?? 0,
    max: sortedValues[sortedValues.length - 1] ?? 0,
  };
}

export function bestByScore<T>(rows: readonly T[], score: (row: T) => number | null): T | null {
  let bestRow: T | null = null;
  let bestScore = -Infinity;
  for (const row of rows) {
    const rowScore = score(row) ?? -Infinity;
    if (bestRow == null || rowScore > bestScore) {
      bestRow = row;
      bestScore = rowScore;
    }
  }
  return bestRow;
}

export function correlationLabel(points: Point[], transformX: (value: number) => number) {
  const correlation = correlationValue(
    points.map((point) => ({
      x: transformX(point.x),
      y: point.y,
    })),
  );
  return formatCorrelation(correlation);
}

export function formatCorrelation(correlation: number | null) {
  if (correlation == null) {
    return "CORR --";
  }
  return `CORR ${correlation >= 0 ? "+" : ""}${correlation.toFixed(2)}`;
}

export function correlationValue(points: { x: number; y: number }[]) {
  if (points.length < 3) {
    return null;
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [index, xValue] of xs.entries()) {
    const dx = xValue - meanX;
    const dy = (ys[index] ?? meanY) - meanY;
    numerator += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  const denominator = Math.sqrt(varianceX * varianceY);
  return denominator === 0 ? null : numerator / denominator;
}

export function positiveDomain(values: number[]): [number, number] {
  const positive = values.filter((value) => finite(value) && value > 0);
  const low = Math.min(...positive);
  const high = Math.max(...positive);
  if (!finite(low) || !finite(high)) {
    return [0.001, 1];
  }
  if (low === high) {
    return [Math.max(low / 1.4, 0.001), high * 1.4];
  }
  const logLow = Math.log10(low);
  const logHigh = Math.log10(high);
  const logPad = (logHigh - logLow) * 0.05;
  return [Math.max(10 ** (logLow - logPad), 0.001), 10 ** (logHigh + logPad)];
}

export function extremeLabelRows<T>(
  rows: readonly T[],
  keyFor: (row: T) => string,
  xValue: (row: T) => number,
  yValue: (row: T) => number,
  { xHigherIsBetter = true }: { xHigherIsBetter?: boolean } = {},
) {
  const tradeoffScore = (row: T) => {
    const x = xValue(row);
    const y = yValue(row);
    if (!finite(x) || !finite(y)) {
      return null;
    }
    return xHigherIsBetter ? y * x : x > 0 ? y / x : null;
  };
  const selected: T[] = [];
  for (const row of [
    bestByScore(rows, yValue),
    bestByScore(rows, (candidate) => (xHigherIsBetter ? xValue(candidate) : -xValue(candidate))),
    bestByScore(rows, tradeoffScore),
  ]) {
    if (row != null && !selected.some((candidate) => keyFor(candidate) === keyFor(row))) {
      selected.push(row);
    }
  }
  return new Set(selected);
}
