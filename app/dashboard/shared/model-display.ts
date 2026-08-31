/** Dashboard model identity, labels, variants, and shared filtering controls. */

import type { BenchmarkObservationsByKey } from "../../../src/model-atlas/benchmarks/observation";
import {
  canonicalModelKey,
  reasoningEffortRank,
} from "../../../src/model-atlas/identity/normalization";
import { compactModelVariants } from "../../../src/model-atlas/pipeline/selection/public-list";
import {
  isPreviewModel,
  type ModelAtlasModel,
  type ModelAtlasPreviewModel,
  type ModelAtlasPublishedModel,
  rankedModels,
} from "../../../src/model-atlas/stats/types";
import {
  providerChartColor,
  providerDisplayName,
  providerFilterKey,
  providerLogo,
} from "./provider-theme";

const searchTextByModel = new WeakMap<ModelAtlasPublishedModel, string>();
const PROVIDER_FILTER_LIMIT = 14;
const PROVIDER_ORDER_TOP_SCORE_COUNT = 3;

export type ModelLimit = 30 | 60 | "all";
export type CostFilter = "all" | number;
export type ProviderFilters = string[];
export type ProviderOption = {
  slug: string;
  label: string;
  count: number;
  color: string;
  logo: string;
};

type ModelControlFilters = {
  providers: ProviderFilters;
  maxCost: CostFilter;
};

export const costFilterOptions: CostFilter[] = ["all", 1, 2, 5, 10, 25];
export const modelLimitOptions: ModelLimit[] = [30, 60, "all"];

export function modelCount(models: ModelAtlasPublishedModel[]): number {
  return new Set(models.map(canonicalModelKey)).size;
}

/** Expand every reasoning variant when requested; otherwise retain the highest-scoring variant per model. */
export function modelsForVariantDisplay(
  models: ModelAtlasModel[],
  showVariants: boolean,
  benchmarkObservations?: BenchmarkObservationsByKey,
): ModelAtlasModel[];
export function modelsForVariantDisplay(
  models: ModelAtlasPublishedModel[],
  showVariants: boolean,
  benchmarkObservations?: BenchmarkObservationsByKey,
): ModelAtlasPublishedModel[];
export function modelsForVariantDisplay(
  models: ModelAtlasPublishedModel[],
  showVariants: boolean,
  benchmarkObservations: BenchmarkObservationsByKey = {},
): ModelAtlasPublishedModel[] {
  const variantsByIdentity = new Map<string, ModelAtlasPublishedModel>();
  for (const model of models) {
    const key = modelVariantKey(model);
    const existing = variantsByIdentity.get(key);
    if (existing == null || compareIntelligence(model, existing) < 0) {
      variantsByIdentity.set(key, model);
    }
  }
  const modelVariants = [...variantsByIdentity.values()];
  const rankedVariants = rankedModels(modelVariants);
  const previewModels = modelVariants.filter(isPreviewModel);
  if (showVariants) {
    return [...rankedVariants, ...previewModels];
  }
  const compactRankedModels = compactModelVariants(rankedVariants, benchmarkObservations).map(
    (model) => ({ ...model, reasoning_effort: null }),
  );
  const previewByModel = new Map<string, ModelAtlasPreviewModel>();
  for (const model of previewModels) {
    const key = canonicalModelKey(model);
    const existing = previewByModel.get(key);
    if (existing == null || compareIntelligence(model, existing) < 0) {
      previewByModel.set(key, model);
    }
  }
  return [
    ...compactRankedModels,
    ...[...previewByModel.values()].map((model) => ({ ...model, reasoning_effort: null })),
  ];
}

export function modelDisplayName(model: ModelAtlasPublishedModel): string {
  const baseName = model.name ?? model.id ?? "Unknown model";
  return model.reasoning_effort == null ? baseName : `${baseName} (${model.reasoning_effort})`;
}

export function modelName(model: ModelAtlasPublishedModel) {
  return modelDisplayName(model)
    .replace(/\bGPT\s+(?=\d)/g, "GPT-")
    .replace(/\bFable\s+(?=\d)/g, prefixBareFableModelName);
}

export function shortLabel(model: ModelAtlasPublishedModel) {
  return modelName(model).replace(" Preview", "");
}

export function modelLogo(model: ModelAtlasPublishedModel) {
  const logo = providerLogo(model.provider);
  if (logo.length > 0) {
    return logo;
  }
  return typeof model.logo === "string" ? model.logo : "";
}

/** Filter model-backed rows with case-insensitive ANDed terms and `*` glob wildcards. */
export function filterByModelQuery<T>(
  items: readonly T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
  filterQuery: string,
): T[] {
  const terms = filterQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [...items];
  }
  const patterns = terms.map((term) => new RegExp(term.split("*").map(escapeRegExp).join(".*")));
  return items.filter((item) => {
    const model = getModel(item);
    let searchable = searchTextByModel.get(model);
    if (searchable == null) {
      searchable = [modelDisplayName(model), model.id, model.provider].join(" ").toLowerCase();
      searchTextByModel.set(model, searchable);
    }
    return patterns.every((pattern) => pattern.test(searchable));
  });
}

export function providerOptions(models: ModelAtlasPublishedModel[]): ProviderOption[] {
  type ProviderOptionDraft = ProviderOption & {
    modelKeys: Set<string>;
    bestScoreByModel: Map<string, number>;
  };

  const optionsBySlug = new Map<string, ProviderOptionDraft>();
  for (const model of models) {
    const slug = providerFilterKey(model.provider);
    const intelligenceScore = finiteNumber(model.scores?.intelligence_score);
    const option = optionsBySlug.get(slug) ?? {
      slug,
      label: providerDisplayName(model),
      count: 0,
      color: providerChartColor(model.provider),
      logo: modelLogo(model),
      modelKeys: new Set(),
      bestScoreByModel: new Map(),
    };
    const modelKey = canonicalModelKey(model);
    option.modelKeys.add(modelKey);
    if (intelligenceScore != null) {
      option.bestScoreByModel.set(
        modelKey,
        Math.max(
          option.bestScoreByModel.get(modelKey) ?? Number.NEGATIVE_INFINITY,
          intelligenceScore,
        ),
      );
    }
    option.count = option.modelKeys.size;
    optionsBySlug.set(slug, option);
  }
  const providerShortlist = [...optionsBySlug.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, PROVIDER_FILTER_LIMIT);

  return providerShortlist
    .map((option) => ({
      ...option,
      orderScore: meanTopProviderScore([...option.bestScoreByModel.values()]),
    }))
    .sort(
      (left, right) =>
        right.orderScore - left.orderScore ||
        right.count - left.count ||
        left.label.localeCompare(right.label),
    )
    .map((option) => ({
      slug: option.slug,
      label: option.label,
      count: option.count,
      color: option.color,
      logo: option.logo,
    }));
}

export function filterByModelControls<T>(
  items: T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
  filters: ModelControlFilters,
) {
  const providerKeys = filters.providers.length === 0 ? null : new Set(filters.providers);
  return items.filter((item) =>
    modelMatchesControls(getModel(item), filters.maxCost, providerKeys),
  );
}

export function limitByIntelligenceScore<T>(
  items: T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
  limit: ModelLimit,
) {
  if (limit === "all") {
    return items;
  }
  const bestScoreByModel = new Map<string, number>();
  for (const item of items) {
    const model = getModel(item);
    const modelKey = canonicalModelKey(model);
    bestScoreByModel.set(
      modelKey,
      Math.max(
        bestScoreByModel.get(modelKey) ?? Number.NEGATIVE_INFINITY,
        finiteNumber(model.scores?.intelligence_score) ?? Number.NEGATIVE_INFINITY,
      ),
    );
  }
  const selectedModels = new Set(
    [...bestScoreByModel]
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit)
      .map(([modelKey]) => modelKey),
  );
  return items.filter((item) => selectedModels.has(canonicalModelKey(getModel(item))));
}

/** Toggle one provider while an empty selection continues to represent All. */
export function toggleProviderFilter(selectedProviders: string[], provider: string): string[] {
  return selectedProviders.includes(provider)
    ? selectedProviders.filter((selected) => selected !== provider)
    : [...selectedProviders, provider];
}

export function modelVariantKey(model: ModelAtlasPublishedModel): string {
  return `${canonicalModelKey(model)}\u0000${model.reasoning_effort ?? ""}`;
}

/** Group visible model variants by family in ascending effort order, including an unlabeled sibling. */
export function reasoningVariantGroups<T>(
  items: readonly T[],
  getModel: (item: T) => ModelAtlasPublishedModel,
) {
  const variantsByModel = new Map<string, T[]>();
  for (const item of items) {
    const model = getModel(item);
    const key = canonicalModelKey(model);
    const variants = variantsByModel.get(key) ?? [];
    variants.push(item);
    variantsByModel.set(key, variants);
  }
  return [...variantsByModel]
    .map(([key, variants]) => ({
      key,
      variants: variants.sort((left, right) => {
        const leftEffort = getModel(left).reasoning_effort;
        const rightEffort = getModel(right).reasoning_effort;
        return (
          reasoningEffortRank(leftEffort) - reasoningEffortRank(rightEffort) ||
          String(leftEffort).localeCompare(String(rightEffort))
        );
      }),
    }))
    .filter((group) => group.variants.length > 1);
}

function modelMatchesControls(
  model: ModelAtlasPublishedModel,
  maxCost: CostFilter,
  providerKeys: ReadonlySet<string> | null,
) {
  if (providerKeys != null && !providerKeys.has(providerFilterKey(model.provider))) {
    return false;
  }
  if (maxCost === "all") {
    return true;
  }
  const blendedPrice = finiteNumber(model.cost?.blended_price);
  return blendedPrice != null && blendedPrice <= maxCost;
}

function meanTopProviderScore(scores: number[]) {
  const topScores = [...scores]
    .sort((left, right) => right - left)
    .slice(0, PROVIDER_ORDER_TOP_SCORE_COUNT);
  return topScores.length > 0
    ? topScores.reduce((total, score) => total + score, 0) / topScores.length
    : Number.NEGATIVE_INFINITY;
}

function prefixBareFableModelName(match: string, offset: number, name: string) {
  const previousToken = name.slice(Math.max(0, offset - "Claude ".length), offset);
  return previousToken === "Claude " ? match : `Claude ${match}`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compareIntelligence(
  left: ModelAtlasPublishedModel,
  right: ModelAtlasPublishedModel,
): number {
  const leftScore = finiteNumber(left.scores.intelligence_score);
  const rightScore = finiteNumber(right.scores.intelligence_score);
  if (leftScore == null || rightScore == null) {
    return leftScore == null ? (rightScore == null ? 0 : 1) : -1;
  }
  return rightScore - leftScore;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
