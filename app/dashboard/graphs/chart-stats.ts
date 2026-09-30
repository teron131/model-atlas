/** Shared dashboard chart statistics and analytical summaries. */

import { quantile } from "d3-array";

import { pearsonCorrelation } from "../../../src/model-atlas/math-utils";
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

/** Require three chart observations before presenting the shared Pearson calculation. */
export function correlationValue(points: { x: number; y: number }[]) {
  if (points.length < 3) {
    return null;
  }
  return pearsonCorrelation(
    points.map((point) => point.x),
    points.map((point) => point.y),
  );
}
