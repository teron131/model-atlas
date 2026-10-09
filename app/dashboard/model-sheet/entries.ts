/** The sheet's models and the populations they are read against: the opened model and an optional pinned one, each with its leaderboard row, its family's reasoning variants, and those variants' effort curve. */

import { useMemo } from "react";

import {
  canonicalModelKey,
  reasoningEffortRank,
} from "../../../src/model-atlas/identity/normalization";
import type {
  BenchmarkPortfolio,
  ModelAtlasModel,
  ModelAtlasPayload,
} from "../../../src/model-atlas/stats/types";
import {
  automaticResourceKeys,
  type FrontierBenchmarkRow,
  frontierBenchmarkRows,
  performanceComparisonRows,
} from "../graphs/pareto/analysis";
import { sharedFrontierBenchmarkComparison } from "../graphs/pareto/common-evidence";
import { modelName } from "../shared/model-display";
import { leaderboardRows, resourceRatioReferenceSets, type TableRow } from "../table/models";
import { isModelSheetModel, type ModelSheetSlot } from "./open";

/** One reasoning effort on its family's curve: Intelligence against median-relative cost on the family's shared benchmarks. */
export type EffortPoint = {
  effort: string;
  model: ModelAtlasModel;
  cost: number;
  intelligence: number;
};

/** One model in the sheet, measured against the same population as the leaderboard: collapsed models for a model, every reasoning variant for a variant. */
export type SheetEntry = {
  slot: ModelSheetSlot;
  effort: string | null;
  row: TableRow;
  /** The display population its ranks and frontier position are read against. */
  rows: readonly TableRow[];
  /** Its family's labelled reasoning variants in effort order, each with its own resource ratios. */
  variants: readonly TableRow[];
  /**
   * Its efforts placed as the Pareto chart places variants: every effort's cost comes from the benchmarks all compared efforts share, so a step between efforts compares like with like.
   * A variant's own Cost× covers whichever benchmarks measured that effort, so its ratios can reverse between efforts that were measured on different benchmarks.
   */
  efforts: { points: readonly EffortPoint[]; benchmarkCount: number };
};

type CostEvidence = {
  portfolio: BenchmarkPortfolio;
  referenceRows: FrontierBenchmarkRow[];
  keys: string[];
};

/**
 * Resolve the opened (`model`, `effort`) and pinned (`compare`, `compare-effort`) URL names once per payload.
 * A name the snapshot lacks resolves to `null`; both populations and the cost evidence are built only while the sheet is open.
 */
export function useSheetEntries(
  payload: ModelAtlasPayload | null,
  modelKey: string | null,
  effort: string | null,
  compareKey: string | null,
  compareEffort: string | null,
): { opened: SheetEntry | null; pinned: SheetEntry | null } {
  const open = payload != null && modelKey != null;
  const populations = useMemo(() => {
    if (!open) return null;
    const referenceSets = resourceRatioReferenceSets(payload);
    const portfolio = payload.metadata.scoring.benchmark_portfolio;
    // The Pareto chart's full-population cost rows set the references and resource keys its effort curves use.
    const referenceRows = frontierBenchmarkRows(payload.models, portfolio, "cost");
    return {
      collapsed: leaderboardRows(payload, false, referenceSets),
      variants: leaderboardRows(payload, true, referenceSets),
      cost: { portfolio, referenceRows, keys: automaticResourceKeys(referenceRows, "cost") },
    };
  }, [open, payload]);
  return useMemo(() => {
    const entry = (
      slot: ModelSheetSlot,
      key: string | null,
      entryEffort: string | null,
    ): SheetEntry | null => {
      if (populations == null || key == null) return null;
      const rows = entryEffort == null ? populations.collapsed : populations.variants;
      const row = rows.find((candidate) => isModelSheetModel(candidate.model, key, entryEffort));
      if (row == null) return null;
      const family = canonicalModelKey(row.model);
      const variants = populations.variants
        .filter(
          (variant) =>
            variant.model.reasoning_effort != null && canonicalModelKey(variant.model) === family,
        )
        .sort(
          (left, right) =>
            reasoningEffortRank(left.model.reasoning_effort) -
            reasoningEffortRank(right.model.reasoning_effort),
        );
      const efforts = effortCurve(
        variants.map((variant) => variant.model),
        populations.cost,
      );
      return { slot, effort: entryEffort, row, rows, variants, efforts };
    };
    return {
      opened: entry("model", modelKey, effort),
      pinned: entry("compare", compareKey, compareEffort),
    };
  }, [populations, modelKey, effort, compareKey, compareEffort]);
}

/** A sheet model's family name, without the effort it shows; the sheet states the effort beside it. */
export function familyName(entry: SheetEntry): string {
  return modelName({ ...entry.row.model, reasoning_effort: null });
}

/** Place a family's efforts exactly as the Pareto chart does with variants shown, against Intelligence on its default cost axis. */
function effortCurve(
  models: ModelAtlasModel[],
  { portfolio, referenceRows, keys }: CostEvidence,
): SheetEntry["efforts"] {
  if (models.length < 2) return { points: [], benchmarkCount: 0 };
  const comparison = sharedFrontierBenchmarkComparison(
    frontierBenchmarkRows(models, portfolio, "cost"),
    referenceRows,
    keys,
    "cost",
  );
  const rows = performanceComparisonRows(models, comparison.rows, "intelligence", "cost");
  const points = rows
    .flatMap((row): EffortPoint[] =>
      row.model.reasoning_effort != null && row.cost != null && row.cost > 0
        ? [
            {
              effort: row.model.reasoning_effort,
              model: row.model,
              cost: row.cost,
              intelligence: row.score,
            },
          ]
        : [],
    )
    .sort((left, right) => reasoningEffortRank(left.effort) - reasoningEffortRank(right.effort));
  return { points, benchmarkCount: rows[0]?.resourceCount ?? 0 };
}
