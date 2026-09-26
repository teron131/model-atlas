/** Observed common-model links align benchmark units; graph constraints never treat projected model scores as new measurements. */
import { modelCalibrationWeights } from "../benchmarks/calibration-population";
import { weightedMeanOfFinite, weightedMedianOfFinite } from "../math-utils";
import type {
  HistoricalBenchmark,
  TimelineBenchmarkCalibration,
  TimelineLink,
  TimelineParameters,
} from "./schemas";

export type PairedTimelineObservation = { family: string; left: number; right: number };

/** All benchmark coordinates retain their reported gaps; probability labels constrain valid inputs only. */
export function timelineNativeValue(
  benchmark: Pick<HistoricalBenchmark, "scale">,
  value: number,
): number | null {
  if (!Number.isFinite(value)) return null;
  if (benchmark.scale === "linear") return value;
  return value >= 0 && value <= 1 ? value : null;
}

/** Valid measurements receive equal information weight on the shared linear policy. */
export function timelineInformation(
  benchmark: Pick<HistoricalBenchmark, "scale">,
  value: number,
): number {
  return timelineNativeValue(benchmark, value) == null ? 0 : 1;
}

/** Symmetric mean/standard-deviation equating is reversible and unit-equivariant; both directions must beat a held-out median baseline. */
export function fitTimelineLink(
  left: string,
  right: string,
  pairs: PairedTimelineObservation[],
  parameters: TimelineParameters,
): TimelineLink | null {
  const families = [...new Set(pairs.map((p) => p.family))];
  if (families.length < parameters.minModels) return null;
  const fit = pairedMoments(pairs);
  if (!fit || fit.correlation <= 0) return null;
  const errors: {
    family: string;
    left: number;
    right: number;
    normalizedLeft: number;
    normalizedRight: number;
    baselineLeft: number;
    baselineRight: number;
  }[] = [];
  for (const family of families) {
    const training = pairs.filter((p) => p.family !== family);
    const held = pairedMoments(training);
    if (!held || held.correlation <= 0) return null;
    const weighted = modelCalibrationWeights(training.map((pair) => pair.family));
    const leftMedian = weightedMedianOfFinite(
      training.map((p, i) => ({ value: p.left, weight: weighted[i]! })),
    )!;
    const rightMedian = weightedMedianOfFinite(
      training.map((p, i) => ({ value: p.right, weight: weighted[i]! })),
    )!;
    for (const pair of pairs.filter((p) => p.family === family)) {
      const leftError = Math.abs(
        held.leftMean +
          ((pair.right - held.rightMean) * held.leftDeviation) / held.rightDeviation -
          pair.left,
      );
      const rightError = Math.abs(
        held.rightMean +
          ((pair.left - held.leftMean) * held.rightDeviation) / held.leftDeviation -
          pair.right,
      );
      errors.push({
        family,
        left: leftError,
        right: rightError,
        normalizedLeft: (100 * leftError) / (held.leftMax - held.leftMin),
        normalizedRight: (100 * rightError) / (held.rightMax - held.rightMin),
        baselineLeft: (100 * Math.abs(leftMedian - pair.left)) / (held.leftMax - held.leftMin),
        baselineRight: (100 * Math.abs(rightMedian - pair.right)) / (held.rightMax - held.rightMin),
      });
    }
  }
  const weights = modelCalibrationWeights(errors.map((error) => error.family));
  const median = (key: "normalizedLeft" | "normalizedRight" | "baselineLeft" | "baselineRight") =>
    weightedMedianOfFinite(errors.map((e, i) => ({ value: e[key], weight: weights[i]! })))!;
  const error = Math.max(median("normalizedLeft"), median("normalizedRight"));
  const baselineError = Math.min(median("baselineLeft"), median("baselineRight"));
  if (error > parameters.maxError || error >= baselineError - 1e-9) return null;
  return {
    id: JSON.stringify([left, right]),
    left,
    right,
    models: families.length,
    correlation: fit.correlation,
    error,
    baselineError,
    leftMean: fit.leftMean,
    rightMean: fit.rightMean,
    leftDeviation: fit.leftDeviation,
    rightDeviation: fit.rightDeviation,
    leftError: Math.sqrt(
      weightedMeanOfFinite(errors.map((e, i) => ({ value: e.left ** 2, weight: weights[i]! })))!,
    ),
    rightError: Math.sqrt(
      weightedMeanOfFinite(errors.map((e, i) => ({ value: e.right ** 2, weight: weights[i]! })))!,
    ),
    leftMin: fit.leftMin,
    leftMax: fit.leftMax,
    rightMin: fit.rightMin,
    rightMax: fit.rightMax,
    weight: families.length * fit.correlation ** 2,
  };
}

function pairedMoments(pairs: PairedTimelineObservation[]) {
  const weights = modelCalibrationWeights(pairs.map((pair) => pair.family));
  const mean = (side: "left" | "right") =>
    weightedMeanOfFinite(pairs.map((p, i) => ({ value: p[side], weight: weights[i]! })))!;
  const leftMean = mean("left"),
    rightMean = mean("right");
  const leftVariance = weightedMeanOfFinite(
    pairs.map((p, i) => ({ value: (p.left - leftMean) ** 2, weight: weights[i]! })),
  )!;
  const rightVariance = weightedMeanOfFinite(
    pairs.map((p, i) => ({ value: (p.right - rightMean) ** 2, weight: weights[i]! })),
  )!;
  if (!(leftVariance > 0) || !(rightVariance > 0)) return null;
  const covariance = weightedMeanOfFinite(
    pairs.map((p, i) => ({
      value: (p.left - leftMean) * (p.right - rightMean),
      weight: weights[i]!,
    })),
  )!;
  return {
    leftMean,
    rightMean,
    leftDeviation: Math.sqrt(leftVariance),
    rightDeviation: Math.sqrt(rightVariance),
    correlation: Math.max(-1, Math.min(1, covariance / Math.sqrt(leftVariance * rightVariance))),
    leftMin: Math.min(...pairs.map((p) => p.left)),
    leftMax: Math.max(...pairs.map((p) => p.left)),
    rightMin: Math.min(...pairs.map((p) => p.right)),
    rightMax: Math.max(...pairs.map((p) => p.right)),
  };
}

/** Solve all connected new units jointly, pinning every published node; disconnected components receive no invented origin. */
export function extendTimelineGraph(
  links: TimelineLink[],
  fixed: TimelineBenchmarkCalibration[],
): TimelineBenchmarkCalibration[] {
  const fixedById = new Map(fixed.map((node) => [node.benchmarkId, node]));
  const connected = new Set(fixedById.keys());
  for (let changed = true; changed;) {
    changed = false;
    for (const link of links) {
      if (connected.has(link.left) === connected.has(link.right)) continue;
      connected.add(link.left);
      connected.add(link.right);
      changed = true;
    }
  }
  const active = links.filter((link) => connected.has(link.left) && connected.has(link.right));
  const unknown = [...connected].filter((id) => !fixedById.has(id)).sort();
  if (!unknown.length) return fixed;
  const logSlopes = solveConstraints(
    unknown,
    new Map(fixed.map((node) => [node.benchmarkId, Math.log(node.slope)])),
    active.map((link) => ({
      left: link.left,
      right: link.right,
      delta: Math.log(link.leftDeviation / link.rightDeviation),
      weight: link.weight,
    })),
  );
  const slopes = new Map([...logSlopes].map(([id, value]) => [id, Math.exp(value)]));
  if ([...slopes.values()].some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error("Benchmark links do not yield finite positive scale units.");
  const offsets = solveConstraints(
    unknown,
    new Map(fixed.map((node) => [node.benchmarkId, node.offset])),
    active.map((link) => ({
      left: link.left,
      right: link.right,
      delta: slopes.get(link.left)! * link.leftMean - slopes.get(link.right)! * link.rightMean,
      weight: link.weight,
    })),
  );
  const nodes = new Map<string, TimelineBenchmarkCalibration>(fixedById);
  const inconsistency = (id: string) =>
    Math.max(
      0,
      ...active
        .filter((l) => l.left === id || l.right === id)
        .map(
          (l) =>
            Math.abs(
              slopes.get(l.left)! * l.leftMean +
                offsets.get(l.left)! -
                slopes.get(l.right)! * l.rightMean -
                offsets.get(l.right)!,
            ) +
            Math.abs(
              slopes.get(l.left)! * l.leftDeviation - slopes.get(l.right)! * l.rightDeviation,
            ),
        ),
    );
  const costs = new Map(
    fixed.map((node) => [
      node.benchmarkId,
      node.errors.reduce((sum, e) => sum + e.error, 0) + node.disagreement,
    ]),
  );
  const pending = new Set(connected);
  // A minimum-error path supplies provenance and an additive error budget, not independent votes from every graph route.
  while (pending.size) {
    const id = [...pending]
      .filter((key) => costs.has(key))
      .sort((a, b) => costs.get(a)! - costs.get(b)! || a.localeCompare(b))[0];
    if (!id) break;
    pending.delete(id);
    const parent = nodes.get(id)!;
    for (const link of active.filter((l) => l.left === id || l.right === id)) {
      const next = link.left === id ? link.right : link.left;
      if (!pending.has(next) || fixedById.has(next)) continue;
      const isLeft = next === link.left;
      const slope = slopes.get(next)!,
        offset = offsets.get(next)!;
      const error = Math.max(
        slopes.get(link.left)! * link.leftError,
        slopes.get(link.right)! * link.rightError,
      );
      const disagreement = inconsistency(next);
      const cost = costs.get(id)! + error + disagreement;
      const previousCost = costs.get(next) ?? Infinity;
      if (cost >= previousCost && nodes.has(next)) continue;
      costs.set(next, cost);
      nodes.set(next, {
        benchmarkId: next,
        slope,
        offset,
        path: [next, ...parent.path],
        errors: [
          {
            linkId: link.id,
            center: offset + slope * (isLeft ? link.leftMean : link.rightMean),
            deviation: slope * (isLeft ? link.leftDeviation : link.rightDeviation),
            min: offset + slope * (isLeft ? link.leftMin : link.rightMin),
            max: offset + slope * (isLeft ? link.leftMax : link.rightMax),
            error,
            models: link.models,
            normalizedError: link.error,
          },
          ...parent.errors,
        ],
        disagreement: disagreement + parent.disagreement,
      });
    }
  }
  if (unknown.some((id) => !nodes.has(id)))
    throw new Error("A connected benchmark lacks a calibration path.");
  return [...nodes.values()];
}

type Constraint = { left: string; right: string; delta: number; weight: number };

/** Solve the anchored graph Laplacian for right-minus-left differences using positive-definite Cholesky elimination. */
function solveConstraints(
  unknown: string[],
  fixed: Map<string, number>,
  constraints: Constraint[],
): Map<string, number> {
  const index = new Map(unknown.map((id, i) => [id, i]));
  const n = unknown.length;
  const matrix = Array.from({ length: n }, () => new Float64Array(n));
  const rhs = new Float64Array(n);
  for (const { left, right, delta, weight } of constraints) {
    for (const [id, peer, sign] of [
      [left, right, -1],
      [right, left, 1],
    ] as const) {
      const i = index.get(id);
      if (i == null) continue;
      matrix[i]![i]! += weight;
      rhs[i]! += weight * sign * delta;
      const j = index.get(peer);
      if (j == null) rhs[i]! += weight * fixed.get(peer)!;
      else matrix[i]![j]! -= weight;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let value = matrix[i]![j]!;
      for (let k = 0; k < j; k++) value -= matrix[i]![k]! * matrix[j]![k]!;
      if (i === j && !(value > 0))
        throw new Error("Benchmark links do not identify a stable anchored scale.");
      matrix[i]![j] = i === j ? Math.sqrt(value) : value / matrix[j]![j]!;
    }
  }
  const solution = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let value = rhs[i]!;
    for (let j = 0; j < i; j++) value -= matrix[i]![j]! * solution[j]!;
    solution[i] = value / matrix[i]![i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let value = solution[i]!;
    for (let j = i + 1; j < n; j++) value -= matrix[j]![i]! * solution[j]!;
    solution[i] = value / matrix[i]![i]!;
    if (!Number.isFinite(solution[i]))
      throw new Error("Benchmark calibration produced a non-finite coordinate.");
  }
  return new Map([...fixed, ...unknown.map((id, i) => [id, solution[i]!] as const)]);
}
