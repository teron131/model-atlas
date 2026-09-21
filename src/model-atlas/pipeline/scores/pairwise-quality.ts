/** Pairwise quality fits normalized benchmark margins through a model-balanced, matrix-free weighted graph Laplacian. */

import type { BenchmarkDimension } from "../../benchmarks/factory";
import { isAggregateIndex } from "../../benchmarks/index-policy";
import { benchmarkDimensionWeight } from "../../benchmarks/registry";
import type { ScoringConfig } from "../../config/stage";
import { canonicalModelKey } from "../../identity/normalization";
import { weightedQuantile, weightedQuantileRank } from "../../math-utils";
import type { ModelAtlasCandidate } from "../model-types";
import { coverageMultiplier, minMaxRange, minMaxScale } from "./normalization";
import { effortQualityKey } from "./quality-context";
import { type BenchmarkMetricModel, benchmarkMetricValue } from "./resource-metrics";

type PairwiseQualityModel = BenchmarkMetricModel & {
  id?: unknown;
  name?: unknown;
  reasoning_effort?: unknown;
};

type PairwiseObservation = {
  modelIndex: number;
  modelKey: string;
  score: number;
  referenceWeight: number;
};

type PairwiseEdge = {
  left: number;
  right: number;
  difference: number;
  weight: number;
};

export type PairwiseQualityResult = {
  scoresByVariant: ReadonlyMap<string, number>;
  ratingsByVariant: ReadonlyMap<string, number>;
  modelCount: number;
  benchmarkCount: number;
  comparisonCount: number;
  weightedRootMeanSquaredError: number | null;
};

/**
 * Fit observed cross-model benchmark differences for the largest connected component of exact variants.
 * Aggregate indexes and estimated observations are excluded; benchmark ranges come only from observed values.
 * Returns latent ratings and 0–100 percentile scores, with variants outside the component omitted.
 * The dimension selects benchmark weights only; this fit does not apply Agentic token adjustments.
 */
export function fitPairwiseQualityScores(
  models: readonly PairwiseQualityModel[],
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
): PairwiseQualityResult {
  const edges: PairwiseEdge[] = [];
  let benchmarkCount = 0;
  const keys = (
    dimension === "intelligence"
      ? scoringConfig.intelligenceBenchmarkKeys
      : scoringConfig.agenticBenchmarkKeys
  ).filter((key) => !isAggregateIndex(key));

  for (const key of keys) {
    const benchmarkWeight = benchmarkDimensionWeight(
      key,
      dimension,
      scoringConfig.benchmarkPortfolio,
    );
    if (!(benchmarkWeight > 0)) continue;
    const observations = benchmarkObservations(models, key);
    const baseModelCount = new Set(observations.map(({ modelKey }) => modelKey)).size;
    if (baseModelCount < 2) continue;
    benchmarkCount += 1;
    for (let leftIndex = 0; leftIndex < observations.length; leftIndex++) {
      const left = observations[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < observations.length; rightIndex++) {
        const right = observations[rightIndex]!;
        if (left.modelKey === right.modelKey) continue;
        edges.push({
          left: left.modelIndex,
          right: right.modelIndex,
          difference: left.score - right.score,
          weight:
            (benchmarkWeight * left.referenceWeight * right.referenceWeight) / (baseModelCount - 1),
        });
      }
    }
  }

  const component = largestConnectedComponent(models.length, edges);
  const componentEdges = edges.filter(
    (edge) => component.has(edge.left) && component.has(edge.right),
  );
  const ratings = fitGraphRatings(models.length, componentEdges);
  const referenceWeights = referenceWeightsForIndexes(models, [...component]);
  const ratingDistribution = [...component].map((modelIndex) => ({
    value: ratings[modelIndex]!,
    weight: referenceWeights.get(modelIndex)!,
  }));
  const scoresByVariant = new Map<string, number>();
  const ratingsByVariant = new Map<string, number>();
  for (const modelIndex of component) {
    const key = effortQualityKey(models[modelIndex]!, dimension);
    ratingsByVariant.set(key, ratings[modelIndex]!);
    const score = weightedQuantileRank(ratingDistribution, ratings[modelIndex]!);
    if (score != null) {
      scoresByVariant.set(key, score);
    }
  }
  return {
    scoresByVariant,
    ratingsByVariant,
    modelCount: component.size,
    benchmarkCount,
    comparisonCount: componentEdges.length,
    weightedRootMeanSquaredError: weightedRootMeanSquaredError(ratings, componentEdges),
  };
}

/**
 * Blend pairwise ordering into Intelligence using the ordinary score distribution as the output scale.
 * Remove the existing coverage retention before mapping percentiles, then restore it once after blending.
 * Variants without a usable ordinary score, coverage, or connected pairwise result retain their original score.
 * Agentic scores and evidence support are preserved.
 */
export function blendPairwiseQualityScores(
  models: ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
): ModelAtlasCandidate[] {
  if (!(scoringConfig.pairwiseIntelligenceWeight > 0)) return models;
  const pairwise = fitPairwiseQualityScores(models, "intelligence", scoringConfig);
  const entries = models.flatMap((model, modelIndex) => {
    const score = model.component_scores?.intelligence_score ?? null;
    const evidenceSupport = model.confidence.intelligence;
    const pairwisePercentile = pairwise.scoresByVariant.get(
      effortQualityKey(model, "intelligence"),
    );
    if (score == null || evidenceSupport == null || pairwisePercentile == null) return [];
    const retention =
      scoringConfig.qualityCoverageMinimumRetention +
      (1 - scoringConfig.qualityCoverageMinimumRetention) * coverageMultiplier(evidenceSupport, 1);
    return [{ modelIndex, score: score / retention, retention, pairwisePercentile }];
  });
  const weights = referenceWeightsForIndexes(
    models,
    entries.map(({ modelIndex }) => modelIndex),
  );
  const distribution = entries.map(({ modelIndex, score }) => ({
    value: score,
    weight: weights.get(modelIndex)!,
  }));
  const blended = new Map<number, number>();
  for (const entry of entries) {
    const mappedPairwiseScore = weightedQuantile(distribution, entry.pairwisePercentile / 100);
    if (mappedPairwiseScore == null) continue;
    blended.set(
      entry.modelIndex,
      entry.retention *
        ((1 - scoringConfig.pairwiseIntelligenceWeight) * entry.score +
          scoringConfig.pairwiseIntelligenceWeight * mappedPairwiseScore),
    );
  }
  return models.map((model, modelIndex) => {
    if (model.component_scores == null) return model;
    return {
      ...model,
      component_scores: {
        ...model.component_scores,
        intelligence_score: blended.get(modelIndex) ?? model.component_scores.intelligence_score,
      },
    };
  });
}

function referenceWeightsForIndexes(
  models: readonly PairwiseQualityModel[],
  indexes: readonly number[],
): Map<number, number> {
  const countsByModel = new Map<string, number>();
  for (const index of indexes) {
    const key = canonicalModelKey(models[index]!);
    countsByModel.set(key, (countsByModel.get(key) ?? 0) + 1);
  }
  return new Map(
    indexes.map((index) => {
      const key = canonicalModelKey(models[index]!);
      return [index, 1 / countsByModel.get(key)!];
    }),
  );
}

/** Preserve proportional observed score gaps; each base model shares one unit of reference mass across its measured efforts. */
function benchmarkObservations(
  models: readonly PairwiseQualityModel[],
  key: string,
): PairwiseObservation[] {
  const values = models.flatMap((model, modelIndex) => {
    const value = benchmarkMetricValue(model, key);
    return value == null || !Number.isFinite(value)
      ? []
      : [{ modelIndex, modelKey: canonicalModelKey(model), value }];
  });
  const weights = referenceWeightsForIndexes(
    models,
    values.map(({ modelIndex }) => modelIndex),
  );
  const range = minMaxRange(values.map(({ value }) => value));
  return values.flatMap(({ modelIndex, modelKey, value }) => {
    const score = minMaxScale(range, value);
    return score == null
      ? []
      : [{ modelIndex, modelKey, score, referenceWeight: weights.get(modelIndex)! }];
  });
}

function largestConnectedComponent(
  modelCount: number,
  edges: readonly PairwiseEdge[],
): Set<number> {
  const neighbors = Array.from({ length: modelCount }, () => [] as number[]);
  for (const edge of edges) {
    neighbors[edge.left]!.push(edge.right);
    neighbors[edge.right]!.push(edge.left);
  }
  let largest = new Set<number>();
  const visited = new Set<number>();
  for (let start = 0; start < modelCount; start++) {
    if (visited.has(start) || neighbors[start]!.length === 0) continue;
    const component = new Set<number>();
    const pending = [start];
    visited.add(start);
    while (pending.length > 0) {
      const modelIndex = pending.pop()!;
      component.add(modelIndex);
      for (const neighbor of neighbors[modelIndex]!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    if (component.size > largest.size) largest = component;
  }
  return largest;
}

/**
 * Fit one scalar rating per model from weighted pairwise score margins.
 *
 * Each edge states that `rating[left] - rating[right]` should approximate its observed `difference`, with disagreement penalized by `weight`.
 * The weighted least-squares normal equations are `(BᵀWB + εI)θ = BᵀWd`, where `BᵀWB` is the weighted graph Laplacian.
 * The solver applies that Laplacian directly from the edge list and uses conjugate gradient, avoiding allocation of a dense model-by-model matrix.
 * The small ridge term fixes the graph's otherwise arbitrary common offset and gives isolated model slots a zero rating.
 *
 * @param modelCount Number of model slots addressed by edge indexes.
 * @param edges Weighted observed margins in the connected comparison component being fitted.
 * @returns One latent rating per model slot; only relative differences are meaningful before percentile mapping.
 */
function fitGraphRatings(modelCount: number, edges: readonly PairwiseEdge[]): number[] {
  const ridge = 1e-8;
  const rightHandSide = Array(modelCount).fill(0) as number[];
  for (const edge of edges) {
    const amount = edge.weight * edge.difference;
    rightHandSide[edge.left] = rightHandSide[edge.left]! + amount;
    rightHandSide[edge.right] = rightHandSide[edge.right]! - amount;
  }
  const multiply = (values: readonly number[]) => {
    const result = values.map((value) => ridge * value);
    for (const edge of edges) {
      const difference = edge.weight * (values[edge.left]! - values[edge.right]!);
      result[edge.left] = result[edge.left]! + difference;
      result[edge.right] = result[edge.right]! - difference;
    }
    return result;
  };
  const ratings = Array(modelCount).fill(0) as number[];
  const residual = [...rightHandSide];
  const direction = [...residual];
  let squaredResidual = dot(residual, residual);
  for (let iteration = 0; iteration < 1_000 && squaredResidual > 1e-14; iteration++) {
    const projection = multiply(direction);
    const denominator = dot(direction, projection);
    if (!(denominator > 0)) break;
    const alpha = squaredResidual / denominator;
    for (let index = 0; index < modelCount; index++) {
      ratings[index] = ratings[index]! + alpha * direction[index]!;
      residual[index] = residual[index]! - alpha * projection[index]!;
    }
    const nextSquaredResidual = dot(residual, residual);
    const beta = nextSquaredResidual / squaredResidual;
    for (let index = 0; index < modelCount; index++) {
      direction[index] = residual[index]! + beta * direction[index]!;
    }
    squaredResidual = nextSquaredResidual;
  }
  return ratings;
}

function weightedRootMeanSquaredError(
  ratings: readonly number[],
  edges: readonly PairwiseEdge[],
): number | null {
  const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0);
  if (!(totalWeight > 0)) return null;
  const squaredError = edges.reduce((sum, edge) => {
    const residual = ratings[edge.left]! - ratings[edge.right]! - edge.difference;
    return sum + edge.weight * residual ** 2;
  }, 0);
  return Math.sqrt(squaredError / totalWeight);
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}
