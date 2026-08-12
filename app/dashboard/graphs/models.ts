/** Shared graph projections and hover-state shaping. */

import type { PointerEvent } from "react";

import { minMaxScale } from "../../../src/model-atlas/pipeline/scores/normalization";
import type { BenchmarkPortfolio, ModelAtlasModel } from "../../../src/model-atlas/stats/types";
import { modelLogo, modelName, modelVariantKey } from "../shared/model-display";
import { providerChartColor, providerDisplayName } from "../shared/provider-theme";
import {
  finite,
  finiteValue,
  fmtCompact,
  fmtMoney,
  fmtPercentScore,
  fmtSeconds,
  fmtTooltipMoney,
  fmtTooltipNumber,
  toPercent,
} from "./format";
import type { HoverRow, HoverState, InteractionConfig } from "./types";

export const interactionConfigs: InteractionConfig[] = [
  {
    key: "price",
    title: "Intelligence vs blended price",
    fieldLabel: "Price",
    lowerIsBetter: true,
    logScale: true,
    ticks: [0.25, 0.5, 1, 2, 5, 10, 25],
    get: (model) => finiteValue(model.cost?.blended_price),
    format: fmtMoney,
    tooltipFormat: fmtTooltipMoney,
    xLabel: "Blended price per 1M tokens",
    hoverLabel: "Blended price",
    insight: "Shows whether higher Intelligence is associated with a higher effective token price.",
  },
  {
    key: "speed",
    title: "Intelligence vs throughput",
    fieldLabel: "Throughput",
    lowerIsBetter: false,
    logScale: true,
    ticks: [20, 50, 100, 250, 500, 1000, 2500],
    get: (model) => finiteValue(model.speed?.throughput_tokens_per_second_median),
    format: fmtCompact,
    tooltipFormat: (value) => `${fmtTooltipNumber(value)} t/s`,
    xLabel: "Output tokens per second (t/s)",
    hoverLabel: "Throughput",
    insight: "Shows whether faster output is associated with higher Intelligence.",
  },
  {
    key: "response",
    title: "Intelligence vs response time",
    fieldLabel: "Response",
    lowerIsBetter: true,
    logScale: true,
    ticks: [2.5, 5, 10, 20, 40, 80],
    get: (model) => finiteValue(model.speed?.e2e_latency_seconds_median),
    format: fmtSeconds,
    tooltipFormat: (value) => `${fmtTooltipNumber(value)}s`,
    xLabel: "End-to-end response time",
    insight: "Shows the tradeoff between Intelligence and end-to-end waiting time.",
  },
  {
    key: "context",
    title: "Intelligence vs context window",
    fieldLabel: "Context",
    lowerIsBetter: false,
    logScale: true,
    ticks: [32_000, 128_000, 256_000, 400_000, 1_000_000, 2_000_000, 10_000_000],
    get: (model) => finiteValue(model.context_window?.context),
    format: fmtCompact,
    tooltipFormat: fmtTooltipNumber,
    xLabel: "Context tokens",
    hoverLabel: "Context window",
    insight:
      "Shows whether a larger advertised context window is associated with higher Intelligence.",
  },
  {
    key: "artificialAnalysisCost",
    title: "Intelligence vs Artificial Analysis Task Cost",
    fieldLabel: "Artificial Analysis Cost",
    lowerIsBetter: true,
    logScale: true,
    ticks: [0.02, 0.05, 0.1, 0.25, 0.5, 1],
    get: (model) => finiteValue(model.task_metrics?.artificial_analysis?.cost),
    format: fmtMoney,
    tooltipFormat: fmtTooltipMoney,
    xLabel: "Artificial Analysis Task Cost",
    insight: "Compares Intelligence with the reported cost of one Artificial Analysis task.",
  },
  {
    key: "frontierScore",
    title: "Intelligence vs frontier benchmark score",
    fieldLabel: "Frontier",
    lowerIsBetter: false,
    logScale: false,
    ticks: [0, 20, 40, 60, 80, 100],
    get: (model, context) => context.frontierScoreByModel.get(modelVariantKey(model)) ?? null,
    format: (value) => `${value.toFixed(0)}%`,
    tooltipFormat: fmtPercentScore,
    xLabel: "Mean Normalized Frontier Benchmark Score",
    insight:
      "Shows how closely broad Intelligence tracks normalized frontier-benchmark performance.",
  },
];

export function frontierBenchmarkScoreByModel(
  models: ModelAtlasModel[],
  portfolio: BenchmarkPortfolio,
  referenceModels: ModelAtlasModel[] = models,
) {
  const frontierKeys = Object.entries(portfolio)
    .filter(([, entry]) => entry.group === "frontier")
    .map(([key]) => key);
  const scoresByBenchmark = new Map<string, number[]>();
  for (const key of frontierKeys) {
    const scores = referenceModels
      .map((model) => toPercent(model.benchmarks?.[key]))
      .filter(finite);
    if (scores.length > 0) {
      scoresByBenchmark.set(key, scores);
    }
  }

  const scoreByModel = new Map<string, number>();
  for (const model of models) {
    const normalizedScores = frontierKeys.flatMap((key) => {
      const score = toPercent(model.benchmarks?.[key]);
      const benchmarkScores = scoresByBenchmark.get(key);
      if (score == null || benchmarkScores == null) {
        return [];
      }
      return [minMaxScale(benchmarkScores, score) ?? score];
    });
    if (normalizedScores.length > 0) {
      scoreByModel.set(
        modelVariantKey(model),
        normalizedScores.reduce((sum, value) => sum + value, 0) / normalizedScores.length,
      );
    }
  }
  return scoreByModel;
}

export function pointHover(
  event: PointerEvent<Element>,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName = modelName(model),
): HoverState {
  return {
    left: event.clientX,
    top: event.clientY,
    model: displayName,
    provider: providerDisplayName(model),
    color: providerChartColor(model.provider),
    logo: modelLogo(model),
    rows,
  };
}

export function focusHover(
  target: Element,
  model: ModelAtlasModel,
  rows: HoverRow[],
  displayName = modelName(model),
): HoverState {
  const rect = target.getBoundingClientRect();
  return {
    left: rect.left + rect.width / 2,
    top: rect.top + rect.height / 2,
    model: displayName,
    provider: providerDisplayName(model),
    color: providerChartColor(model.provider),
    logo: modelLogo(model),
    rows,
  };
}
