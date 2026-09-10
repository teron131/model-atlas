/** Price-efficiency chart data reconstruction and summaries. */

import {
  canonicalModelKey,
  reasoningEffortRank,
} from "../../../../src/model-atlas/identity/normalization";
import { log10OnePlusPositive, meanOfFinite } from "../../../../src/model-atlas/math-utils";
import { coverageConfidence } from "../../../../src/model-atlas/pipeline/scores/normalization";
import {
  benchmarkResourceEfficiencyScores,
  modelBalancedMinMaxScores,
} from "../../../../src/model-atlas/pipeline/scores/resource-efficiency";
import { benchmarkTaskMetrics } from "../../../../src/model-atlas/pipeline/scores/resource-metrics";
import {
  type BenchmarkPortfolio,
  type ModelAtlasPublishedModel,
} from "../../../../src/model-atlas/stats/types";
import { isGraphEligible, modelVariantKey } from "../../shared/model-display";
import { finiteValue, fmtMoney, fmtTooltipMoney, fmtTooltipScore } from "../format";
import type { HoverRow } from "../types";

export type PriceEfficiencyRow = {
  model: ModelAtlasPublishedModel;
  priceScore: number;
  costEfficiencyScore: number;
  qualityScore: number;
  blendedPrice: number;
  deltaScore: number;
};

type PriceEfficiencyDraft = {
  model: ModelAtlasPublishedModel;
  qualityScore: number;
  blendedPrice: number;
  priceScore: number;
  costEfficiencyScore: number;
};

/** Rebuild the scored absolute-price and benchmark-only task-cost signals for chart comparison. */
export function priceEfficiencyRows(
  visibleModels: ModelAtlasPublishedModel[],
  referenceModels: ModelAtlasPublishedModel[],
  portfolio: BenchmarkPortfolio,
  showVariants: boolean,
): PriceEfficiencyRow[] {
  const eligibleModels = referenceModels.filter(isPriceEligibleModel);
  const priceScores = modelBalancedMinMaxScores(
    eligibleModels,
    eligibleModels.map((model) => log10OnePlusPositive(finiteValue(model.cost?.blended_price))),
    "lower",
  );
  const costEfficiencyScores = costEfficiencyByModel(eligibleModels, portfolio);
  const drafts = eligibleModels.flatMap((model, index): PriceEfficiencyDraft[] => {
    const blendedPrice = finiteValue(model.cost?.blended_price);
    const logCost = log10OnePlusPositive(blendedPrice);
    const qualityScore = meanOfFinite([
      finiteValue(model.scores?.intelligence_score),
      finiteValue(model.scores?.agentic_score),
    ]);
    const costEfficiencyScore = costEfficiencyScores[index] ?? null;
    const priceScore = priceScores[index] ?? null;
    if (
      blendedPrice == null ||
      logCost == null ||
      qualityScore == null ||
      costEfficiencyScore == null ||
      priceScore == null
    ) {
      return [];
    }
    return [
      {
        model,
        qualityScore,
        blendedPrice,
        costEfficiencyScore,
        priceScore,
      },
    ];
  });
  const strongestByKey = new Map<string, ModelAtlasPublishedModel>();
  for (const model of eligibleModels) {
    if (!isGraphEligible(model)) continue;
    const key = comparisonKey(model, showVariants);
    const existing = strongestByKey.get(key);
    if (
      existing == null ||
      Number(model.scores.intelligence_score) > Number(existing.scores.intelligence_score)
    ) {
      strongestByKey.set(key, model);
    }
  }
  const draftByModel = new Map(drafts.map((draft) => [draft.model, draft]));
  return visibleModels
    .flatMap((model): PriceEfficiencyRow[] => {
      const reference = strongestByKey.get(comparisonKey(model, showVariants));
      const draft = reference == null ? null : draftByModel.get(reference);
      if (draft == null) {
        return [];
      }
      return [
        {
          model: draft.model,
          priceScore: draft.priceScore,
          costEfficiencyScore: draft.costEfficiencyScore,
          qualityScore: draft.qualityScore,
          blendedPrice: draft.blendedPrice,
          deltaScore: draft.costEfficiencyScore - draft.priceScore,
        },
      ];
    })
    .sort((left, right) => right.costEfficiencyScore - left.costEfficiencyScore);
}

function comparisonKey(model: ModelAtlasPublishedModel, showVariants: boolean): string {
  return showVariants ? modelVariantKey(model) : canonicalModelKey(model);
}

function isPriceEligibleModel(model: ModelAtlasPublishedModel): boolean {
  const blendedPrice = finiteValue(model.cost?.blended_price);
  const qualityScore = meanOfFinite([
    finiteValue(model.scores?.intelligence_score),
    finiteValue(model.scores?.agentic_score),
  ]);
  return log10OnePlusPositive(blendedPrice) != null && qualityScore != null;
}

export function priceEfficiencyHoverRows(row: PriceEfficiencyRow): HoverRow[] {
  return [
    ["Price score", fmtTooltipScore(row.priceScore)],
    ["Cost efficiency score", fmtTooltipScore(row.costEfficiencyScore)],
    ["Benchmark lift", signedScore(row.deltaScore)],
    ["Blended price", fmtTooltipMoney(row.blendedPrice)],
    ["Quality score", fmtTooltipScore(row.qualityScore)],
  ];
}

export function priceEfficiencySummaryDetail(row: PriceEfficiencyRow): string {
  return `${row.costEfficiencyScore.toFixed(1)} efficiency / ${row.priceScore.toFixed(
    1,
  )} price / ${fmtMoney(row.blendedPrice)}`;
}

export function priceEfficiencyDeltaDetail(row: PriceEfficiencyRow): string {
  return `${signedScore(row.deltaScore)} vs price score`;
}

function costEfficiencyByModel(
  models: ModelAtlasPublishedModel[],
  portfolio: BenchmarkPortfolio,
): Array<number | null> {
  const benchmarks = Object.entries(portfolio)
    .flatMap(([key, entry]) => {
      const qualityCoordinate = entry.resourcePolicy?.qualityCoordinate;
      return qualityCoordinate != null &&
        models.some((model) => benchmarkScore(model, key) != null && taskCost(model, key) != null)
        ? [{ key, qualityCoordinate }]
        : [];
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  const scoresByModel = models.map(() => [] as number[]);
  for (const { key, qualityCoordinate } of benchmarks) {
    const scores = benchmarkResourceEfficiencyScores(
      models,
      models.map((model) => benchmarkScore(model, key)),
      models.map((model) => {
        const cost = taskCost(model, key);
        return cost == null ? null : Math.log(cost);
      }),
      qualityCoordinate,
    );
    for (const [modelIndex, score] of scores.entries()) {
      if (score != null) {
        scoresByModel[modelIndex]?.push(score);
      }
    }
  }
  // Efforts share the source-default effort's coverage, as in final resource scoring.
  const defaultIndexByModel = new Map<string, number>();
  for (const [index, model] of models.entries()) {
    const key = canonicalModelKey(model);
    const previous = defaultIndexByModel.get(key);
    if (
      previous == null ||
      reasoningEffortRank(model.reasoning_effort) >
        reasoningEffortRank(models[previous]?.reasoning_effort)
    )
      defaultIndexByModel.set(key, index);
  }
  return scoresByModel.map((scores, index) => {
    const meanScore = meanOfFinite(scores);
    const model = models[index]!;
    const defaultIndex = defaultIndexByModel.get(canonicalModelKey(model)) ?? index;
    const coverageCount = scoresByModel[defaultIndex]?.length ?? 0;
    return meanScore == null
      ? null
      : meanScore * coverageConfidence(coverageCount, benchmarks.length);
  });
}

function benchmarkScore(model: ModelAtlasPublishedModel, benchmarkKey: string): number | null {
  return (
    finiteValue(model.intelligence?.[benchmarkKey]) ?? finiteValue(model.benchmarks?.[benchmarkKey])
  );
}

function taskCost(model: ModelAtlasPublishedModel, benchmarkKey: string): number | null {
  const cost = finiteValue(benchmarkTaskMetrics(model, benchmarkKey)?.cost);
  return cost != null && cost > 0 ? cost : null;
}

function signedScore(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}
