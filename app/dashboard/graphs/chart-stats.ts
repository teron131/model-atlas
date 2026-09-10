/** Shared dashboard chart statistics and analytical summaries. */

import { quantile } from "d3-array";

import type { BoxWhiskerDistribution } from "./BoxWhiskerSummary";
import { finite } from "./format";

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
