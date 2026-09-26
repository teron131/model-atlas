/** Pairwise quality fits normalized benchmark margins through a model-balanced, matrix-free weighted graph Laplacian. */

import type { BenchmarkDimension, BenchmarkGroup } from "../../benchmarks/factory";
import { isAggregateIndex } from "../../benchmarks/index-policy";
import { benchmarkDimensionWeight } from "../../benchmarks/registry";
import type { ScoringConfig } from "../../config/stage";
import { canonicalModelKey } from "../../identity/normalization";
import { weightedQuantile, weightedQuantileRank } from "../../math-utils";
import type { ModelAtlasCandidate } from "../model-types";
import { type MinMaxRange, minMaxScale } from "./normalization";
import { effortQualityKey, observedRangesByBenchmark } from "./quality-context";
import { type BenchmarkMetricModel, benchmarkMetricValue } from "./resource-metrics";
import type { IntelligenceScoreParts } from "./score-builders";

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
  group?: BenchmarkGroup,
): PairwiseQualityResult {
  const ranges = observedRangesByBenchmark(models, [
    ...scoringConfig.intelligenceBenchmarkKeys,
    ...scoringConfig.agenticBenchmarkKeys,
  ]);
  const edges: PairwiseEdge[] = [];
  let benchmarkCount = 0;
  const keys = (
    dimension === "intelligence"
      ? scoringConfig.intelligenceBenchmarkKeys
      : scoringConfig.agenticBenchmarkKeys
  ).filter(
    (key) =>
      !isAggregateIndex(key) &&
      (dimension !== "intelligence" ||
        scoringConfig.intelligenceGroupWeights[
          scoringConfig.benchmarkPortfolio[key]?.group ?? "baseline"
        ] > 0) &&
      (group == null || scoringConfig.benchmarkPortfolio[key]?.group === group),
  );

  for (const key of keys) {
    const benchmarkWeight = benchmarkDimensionWeight(
      key,
      dimension,
      scoringConfig.benchmarkPortfolio,
    );
    if (!(benchmarkWeight > 0)) continue;
    const observations = benchmarkObservations(models, key, ranges.get(key) ?? null);
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
 * Map each group's pairwise percentile through that group's ordinary score distribution.
 * The fixed task-group budget and independent index union share apply after pairwise blending; evidence retention applies once at the end.
 * Variants outside a group's comparison graph keep that group's ordinary score.
 */
export function blendPairwiseQualityScores(
  models: ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  intelligenceParts: readonly (IntelligenceScoreParts | null)[],
): ModelAtlasCandidate[] {
  if (!(scoringConfig.pairwiseIntelligenceWeight > 0)) return models;
  const frontier =
    scoringConfig.intelligenceGroupWeights.frontier > 0
      ? blendGroupPairwiseScores(models, scoringConfig, intelligenceParts, "frontier")
      : new Map<number, number>();
  const baseline =
    scoringConfig.intelligenceGroupWeights.baseline > 0
      ? blendGroupPairwiseScores(models, scoringConfig, intelligenceParts, "baseline")
      : new Map<number, number>();
  return models.map((model, modelIndex) => {
    const parts = intelligenceParts[modelIndex];
    if (
      model.component_scores == null ||
      parts == null ||
      (scoringConfig.intelligenceGroupWeights.frontier > 0 && parts.frontier == null) ||
      (scoringConfig.intelligenceGroupWeights.baseline > 0 && parts.baseline == null)
    ) {
      return model;
    }
    const taskScore =
      scoringConfig.intelligenceGroupWeights.frontier *
        (frontier.get(modelIndex) ?? parts.frontier ?? 0) +
      scoringConfig.intelligenceGroupWeights.baseline *
        (baseline.get(modelIndex) ?? parts.baseline ?? 0);
    return {
      ...model,
      component_scores: {
        ...model.component_scores,
        intelligence_score:
          parts.retention *
          ((1 - parts.indexShare) * taskScore + parts.indexShare * (parts.indexScore ?? 0)),
      },
    };
  });
}

function blendGroupPairwiseScores(
  models: readonly ModelAtlasCandidate[],
  scoringConfig: ScoringConfig,
  intelligenceParts: readonly (IntelligenceScoreParts | null)[],
  group: BenchmarkGroup,
): Map<number, number> {
  const pairwise = fitPairwiseQualityScores(models, "intelligence", scoringConfig, group);
  const entries = models.flatMap((model, modelIndex) => {
    const ordinary = intelligenceParts[modelIndex]?.[group] ?? null;
    const percentile = pairwise.scoresByVariant.get(effortQualityKey(model, "intelligence"));
    return ordinary == null || percentile == null ? [] : [{ modelIndex, ordinary, percentile }];
  });
  const weights = referenceWeightsForIndexes(
    models,
    entries.map(({ modelIndex }) => modelIndex),
  );
  const distribution = entries.map(({ modelIndex, ordinary }) => ({
    value: ordinary,
    weight: weights.get(modelIndex)!,
  }));
  const blended = new Map<number, number>();
  for (const { modelIndex, ordinary, percentile } of entries) {
    const mapped = weightedQuantile(distribution, percentile / 100);
    if (mapped == null) continue;
    blended.set(
      modelIndex,
      (1 - scoringConfig.pairwiseIntelligenceWeight) * ordinary +
        scoringConfig.pairwiseIntelligenceWeight * mapped,
    );
  }
  return blended;
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
  range: MinMaxRange | null,
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
