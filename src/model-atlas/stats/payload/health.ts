/** Operational health checks compare public rows against fresh benchmark source evidence. */

import type { ScoringConfig } from "../../config/stage";
import {
  firstVariantCompatibleCandidate,
  type MatcherConfig,
  rankMatchCandidates,
} from "../../identity";
import {
  canonicalModelKey,
  normalizeModelToken,
  normalizeProviderModelId,
} from "../../identity/normalization";
import type { NumberOrNull } from "../../numeric";
import type { BenchmarkRowsByKey, BenchmarkSourceRow } from "../../pipeline/benchmark-rows";
import { benchmarkMetricValue } from "../../pipeline/scores/resource-metrics";
import { strongestModelVariants } from "../../pipeline/selection/public-list";
import type {
  ModelAtlasBenchmarkUpdateEntry,
  ModelAtlasBenchmarkUpdateHealth,
  ModelAtlasCandidateScores,
  ModelAtlasModel,
} from "../types";

const BENCHMARK_TOP_LIMIT = 5;
const REFERENCE_TOP_LIMIT = 10;
type BenchmarkHealthModel = Pick<ModelAtlasModel, "id" | "name" | "benchmarks" | "intelligence"> & {
  scores?: ModelAtlasCandidateScores | null;
};

type RankedModel = {
  id: string;
  label: string;
  referenceRank: number | null;
  value: number;
};

type ReferenceRanks = {
  byModelId: ReadonlyMap<string, number>;
  count: number;
};

type IntelligenceScoredHealthModel = BenchmarkHealthModel & {
  scores: {
    intelligence_score: number;
  };
};

type HealthMatchCandidate = {
  model_id: string;
  provider_id: string;
  provider_name: string;
  model_name: string | null;
};

function finiteNumber(value: NumberOrNull | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function modelIdentity(model: Pick<ModelAtlasModel, "id" | "name">): string | null {
  return model.id ?? model.name ?? null;
}

function hasIntelligenceScore(model: BenchmarkHealthModel): model is IntelligenceScoredHealthModel {
  return finiteNumber(model.scores?.intelligence_score) != null;
}

/** Health follows the dashboard's highest-Intelligence representative before selecting its top ten. */
function referenceRankByModel(models: readonly BenchmarkHealthModel[]): ReferenceRanks {
  const ranked = strongestModelVariants(models.filter(hasIntelligenceScore))
    .flatMap((model) => {
      const id = modelIdentity(model);
      const score = finiteNumber(model.scores?.intelligence_score);
      return id == null || score == null
        ? []
        : [{ canonicalKey: canonicalModelKey(model), id, score }];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.canonicalKey.localeCompare(right.canonicalKey) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, REFERENCE_TOP_LIMIT);
  const rankByCanonicalKey = new Map(ranked.map((model, index) => [model.canonicalKey, index + 1]));
  const byModelId = new Map<string, number>();
  for (const model of models) {
    const id = modelIdentity(model);
    const rank = rankByCanonicalKey.get(canonicalModelKey(model));
    if (id != null && rank != null) {
      byModelId.set(id, rank);
    }
  }
  return { byModelId, count: ranked.length };
}

function sourceSlug(row: BenchmarkSourceRow): string {
  if (row.identity.length > 0) {
    const slug = row.identity.split("/").at(-1);
    if (slug != null) {
      return normalizeModelToken(slug);
    }
  }
  return normalizeModelToken(row.label);
}

function healthMatchCandidates(models: readonly BenchmarkHealthModel[]): HealthMatchCandidate[] {
  return models.flatMap((model) => {
    const id = modelIdentity(model);
    if (id == null) {
      return [];
    }
    return [
      {
        model_id: id,
        provider_id: id.split("/")[0] ?? "",
        provider_name: "",
        model_name: model.name,
      },
    ];
  });
}

function matchedSourceId(
  row: BenchmarkSourceRow,
  modelCandidates: readonly HealthMatchCandidate[],
  matcherConfig: MatcherConfig | undefined,
): string | null {
  if (matcherConfig == null) {
    return null;
  }
  const rowSlug = sourceSlug(row);
  const rankedCandidates = rankMatchCandidates(rowSlug, modelCandidates, {
    requireSourceTokenCoverage: true,
  });
  return (
    firstVariantCompatibleCandidate(rowSlug, rankedCandidates, matcherConfig)?.model_id ?? null
  );
}

function benchmarkRankedModels(
  models: readonly BenchmarkHealthModel[],
  key: string,
  referenceRanks: ReferenceRanks,
): RankedModel[] {
  return strongestModelVariants(models.filter(hasIntelligenceScore))
    .flatMap((model) => {
      const id = modelIdentity(model);
      const value = benchmarkMetricValue(model, key);
      return id == null || value == null
        ? []
        : [
            {
              id,
              label: model.name ?? id,
              referenceRank: referenceRanks.byModelId.get(id) ?? null,
              value,
            },
          ];
    })
    .sort((left, right) => right.value - left.value);
}

function sourceRankedModels(
  rows: readonly BenchmarkSourceRow[],
  candidates: readonly HealthMatchCandidate[],
  referenceRanks: ReferenceRanks,
  matcherConfig: MatcherConfig | undefined,
): RankedModel[] {
  const rankedModels: RankedModel[] = [];
  const seenModelIds = new Set<string>();
  const rankedRows = [...rows].sort((left, right) => right.value - left.value);
  for (const row of rankedRows) {
    const id = matchedSourceId(row, candidates, matcherConfig);
    if (id == null || seenModelIds.has(id)) {
      continue;
    }
    seenModelIds.add(id);
    rankedModels.push({
      id,
      label: row.label,
      referenceRank: referenceRanks.byModelId.get(id) ?? null,
      value: row.value,
    });
    if (rankedModels.length >= BENCHMARK_TOP_LIMIT) {
      break;
    }
  }
  return rankedModels;
}

function sourceTopRows(rows: readonly BenchmarkSourceRow[] | undefined): BenchmarkSourceRow[] {
  return [...(rows ?? [])]
    .sort((left, right) => right.value - left.value)
    .slice(0, BENCHMARK_TOP_LIMIT);
}

function sourceRowOutputId(row: BenchmarkSourceRow): string {
  if (row.id != null) {
    return row.id;
  }
  if (row.provider != null) {
    return normalizeProviderModelId(`${row.provider}/${normalizeModelToken(row.label)}`);
  }
  return normalizeModelToken(row.label);
}

function updateStatus({
  checkedTopCount,
  overlapCount,
  unrepresentedTopCount = 0,
}: {
  checkedTopCount: number;
  overlapCount: number;
  unrepresentedTopCount?: number;
}): ModelAtlasBenchmarkUpdateEntry["status"] {
  if (checkedTopCount === 0) {
    return "missing";
  }
  if (overlapCount >= requiredOverlap(checkedTopCount, unrepresentedTopCount)) {
    return "current";
  }
  return overlapCount > 0 ? "watch" : "stale_possible";
}

function requiredOverlap(checkedTopCount: number, unrepresentedTopCount: number): number {
  if (unrepresentedTopCount >= 2) {
    return 1;
  }
  return Math.max(1, Math.ceil(checkedTopCount / 2));
}

export function buildBenchmarkUpdateHealth(
  models: readonly BenchmarkHealthModel[],
  scoringConfig: ScoringConfig,
  sourceRowsByKey: BenchmarkRowsByKey = {},
  matcherConfig?: MatcherConfig,
): ModelAtlasBenchmarkUpdateHealth {
  const referenceRanks = referenceRankByModel(models);
  const candidates = healthMatchCandidates(models);
  const selectedBenchmarkKeys = [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ].sort((left, right) => left.localeCompare(right));
  return Object.fromEntries(
    selectedBenchmarkKeys.map((key) => {
      const sourceRows = sourceRowsByKey[key];
      const topSourceRows = sourceTopRows(sourceRows);
      const rankedModels =
        sourceRows == null
          ? benchmarkRankedModels(models, key, referenceRanks)
          : sourceRankedModels(sourceRows, candidates, referenceRanks, matcherConfig);
      const topModels = rankedModels.slice(0, BENCHMARK_TOP_LIMIT);
      const overlapModels = topModels.filter((model) => model.referenceRank != null);
      const unrepresentedTopSourceRows = topSourceRows.filter(
        (row) => matchedSourceId(row, candidates, matcherConfig) == null,
      );
      const entry: ModelAtlasBenchmarkUpdateEntry = {
        status: updateStatus({
          checkedTopCount: topModels.length,
          overlapCount: overlapModels.length,
          unrepresentedTopCount: unrepresentedTopSourceRows.length,
        }),
        observed_count: sourceRows?.length ?? rankedModels.length,
        checked_top_count: topModels.length,
        reference_top_count: referenceRanks.count,
        overlap_count: overlapModels.length,
        overlap_model_ids: overlapModels.map((model) => model.id),
        top_model_ids:
          topSourceRows.length > 0
            ? topSourceRows.map(sourceRowOutputId)
            : topModels.map((model) => model.id),
        checked_model_ids: topModels.map((model) => model.id),
        top_model_labels:
          topSourceRows.length > 0
            ? topSourceRows.map((model) => model.label)
            : topModels.map((model) => model.label),
        unrepresented_top_model_labels: unrepresentedTopSourceRows.map((row) => row.label),
        top_model_reference_rank: topModels[0]?.referenceRank ?? null,
        reference_metric: "intelligence_score",
      };
      return [key, entry];
    }),
  );
}
