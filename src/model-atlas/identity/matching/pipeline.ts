/** Internal matcher pipeline: scope provider pools, collect candidates, and apply the final void threshold. */

import { minMaxRange } from "../../math-utils";
import { asRecord } from "../../runtime";
import {
  FALLBACK_PROVIDER_IDS,
  modelSlugFromModelId,
  OPENROUTER_PROVIDER_ID,
  parseSlugEffort,
} from "../normalization";
import { modelProviderIdentity, providerIdentityKey } from "../provider";
import { isSameRelease, releaseLabelPeriod, versionDate } from "../releases";
import { modelNameIdentityKey } from "./name-tokens";
import { compareCandidates, firstVariantCompatibleCandidate, rankMatchCandidates } from "./scoring";
import type {
  MatchCandidate,
  MatchDiagnosticsOptions,
  MatchDiagnosticsPayload,
  MatcherConfig,
  MatcherRunOutput,
  MatcherSourceModel,
  MatchResult,
  ModelsDevModel,
  PreferredProviderPools,
} from "./types";

const DEFAULT_MAX_CANDIDATES = 5;
const VOID_THRESHOLD_RANGE_RATIO = 0.35;

function sourceProviderIdentity(source: MatcherSourceModel): string | null {
  return source.sourceProvider
    ? providerIdentityKey(source.sourceProvider)
    : modelProviderIdentity(source.sourceId ?? "");
}

/**
 * The slug without a leading word naming its own provider, as Tencent's `"tencent-hy4"` → `"hy4"`; null when there is no such word or nothing would remain.
 * Callers try it only after the full slug finds no candidate, so a name whose catalog id also carries the provider word (`deepseek-v3`, `mistral-large`) never reaches it.
 */
function withoutProviderPrefix(slug: string, provider: string | null): string | null {
  const [first, ...rest] = slug.split("-");
  return provider != null && rest.length > 0 && providerIdentityKey(first) === provider
    ? rest.join("-")
    : null;
}

/** The source's candidates under its own slug or, when that finds none, under the slug without a leading word naming its provider, with the slug they were found under. */
function sourceCandidates(
  source: MatcherSourceModel,
  providerPools: PreferredProviderPools,
  maxCandidates: number,
): { matchSlug: string; candidates: MatchCandidate[] } {
  const slug = parseSlugEffort(source.matchSlugOverride ?? source.sourceSlug).baseModel;
  const candidates = rankedCandidates(slug, source, providerPools, maxCandidates);
  const unprefixed =
    candidates.length === 0 ? withoutProviderPrefix(slug, sourceProviderIdentity(source)) : null;
  return unprefixed == null
    ? { matchSlug: slug, candidates }
    : {
        matchSlug: unprefixed,
        candidates: rankedCandidates(unprefixed, source, providerPools, maxCandidates),
      };
}

function rankedCandidates(
  matchSlug: string,
  source: MatcherSourceModel,
  providerPools: PreferredProviderPools,
  maxCandidates: number,
): MatchCandidate[] {
  const openRouterCandidates = collectCandidatesForSourceSlug(
    matchSlug,
    source,
    providerPools.openRouter,
  );
  const fallbackCandidates = collectCandidatesForSourceSlug(
    matchSlug,
    source,
    providerPools.fallback,
  );
  return (
    openRouterCandidates.length === 0
      ? fallbackCandidates
      : [...openRouterCandidates, ...fallbackCandidates].sort(compareCandidates)
  ).slice(0, maxCandidates);
}

/** Resolve source identity once per pool, excluding publisher and release conflicts before ranking candidates. */
function collectCandidatesForSourceSlug(
  sourceSlug: string,
  source: MatcherSourceModel,
  modelsDevModels: ModelsDevModel[],
): MatchCandidate[] {
  const sourceProvider = sourceProviderIdentity(source);
  // Generic launch dates do not identify an evaluated snapshot.
  const sourcePeriod =
    versionDate(source.matchSlugOverride ?? source.sourceSlug) ??
    releaseLabelPeriod(source.sourceName ?? "");
  return rankMatchCandidates(
    sourceSlug,
    modelsDevModels
      .filter((candidate) => {
        const provider = modelProviderIdentity(candidate.model_id, candidate.provider_id);
        if (sourceProvider && provider && sourceProvider !== provider) return false;
        if (!sourcePeriod) return true;
        const period =
          versionDate(candidate.model_id) ??
          releaseLabelPeriod(candidate.model.name ?? "") ??
          (typeof candidate.model.release_date === "string"
            ? versionDate(candidate.model.release_date)
            : null);
        return period != null && isSameRelease(sourcePeriod, period);
      })
      .map((modelsDevModel) => {
        const modelsDevModelName =
          typeof modelsDevModel.model.name === "string" ? modelsDevModel.model.name : "";
        return {
          model_id: modelsDevModel.model_id,
          provider_id: modelsDevModel.provider_id,
          provider_name: modelsDevModel.provider_name,
          model_name: modelsDevModelName || null,
        };
      }),
  );
}

function isExactIdentityMatch(sourceSlug: string, candidate: MatchCandidate): boolean {
  const sourceIdentity = modelNameIdentityKey(sourceSlug);
  return [candidate.model_id, candidate.model_name].some(
    (value) => value != null && modelNameIdentityKey(value) === sourceIdentity,
  );
}

function applyMaxMinRangeVoid(
  models: Array<{ best_match: MatchResult; candidates: MatchCandidate[] }>,
  sourceSlugs: readonly string[],
): { threshold: number | null; voided: number } {
  const range = minMaxRange(models.map((model) => model.best_match?.score ?? null));
  if (range == null) {
    return { threshold: null, voided: 0 };
  }

  const threshold = range.min + (range.max - range.min) * VOID_THRESHOLD_RANGE_RATIO;
  let voided = 0;
  for (const [index, model] of models.entries()) {
    const match = model.best_match;
    if (
      match != null &&
      match.score < threshold &&
      !isExactIdentityMatch(sourceSlugs[index] ?? "", match)
    ) {
      model.best_match = null;
      model.candidates = [];
      voided += 1;
    }
  }
  return { threshold, voided };
}

/** Summary counts are taken after the void threshold. */
export function runMatcher(
  sourceModels: MatcherSourceModel[],
  providerPools: PreferredProviderPools,
  maxCandidates: number,
  matcherConfig: MatcherConfig,
): MatcherRunOutput {
  const matched = sourceModels.map((sourceModel) => {
    const { matchSlug, candidates } = sourceCandidates(sourceModel, providerPools, maxCandidates);
    return {
      matchSlug,
      model: {
        artificial_analysis_id: sourceModel.sourceId,
        artificial_analysis_slug: sourceModel.sourceSlug,
        artificial_analysis_name: sourceModel.sourceName,
        artificial_analysis_release_date: sourceModel.sourceReleaseDate,
        best_match: firstVariantCompatibleCandidate(matchSlug, candidates, matcherConfig),
        candidates,
      },
    };
  });
  const models = matched.map(({ model }) => model);

  const preVoidMatchedCount = models.filter((model) => model.best_match != null).length;
  const preVoidUnmatchedCount = models.length - preVoidMatchedCount;
  const voidStats = applyMaxMinRangeVoid(
    models,
    matched.map(({ matchSlug }) => matchSlug),
  );
  const matchedCount = models.filter((model) => model.best_match != null).length;
  const unmatchedCount = models.length - matchedCount;

  return {
    models,
    voidThreshold: voidStats.threshold,
    voidedCount: voidStats.voided,
    preVoidMatchedCount,
    preVoidUnmatchedCount,
    matchedCount,
    unmatchedCount,
  };
}

/** Build deterministic diagnostics from caller-supplied normalized rows without fetching sources. */
export function buildMatchDiagnostics(options: MatchDiagnosticsOptions): MatchDiagnosticsPayload {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const providerPools = {
    openRouter: options.modelsDevModels.filter(
      (modelsDevModel) => modelsDevModel.provider_id === OPENROUTER_PROVIDER_ID,
    ),
    fallback: options.modelsDevModels.filter((modelsDevModel) =>
      FALLBACK_PROVIDER_IDS.has(modelsDevModel.provider_id),
    ),
  };
  const totalScopedModels = new Set(
    [...providerPools.openRouter, ...providerPools.fallback].map(
      (modelsDevModel) => modelsDevModel.model_id,
    ),
  ).size;
  const sourceModels = options.artificialAnalysisRows.map((artificialAnalysisRow) => {
    const record = asRecord(artificialAnalysisRow);
    const modelId = typeof record.model_id === "string" ? record.model_id : null;
    const sourceSlug = modelSlugFromModelId(modelId) ?? "";
    return {
      sourceId: modelId,
      sourceSlug,
      sourceProvider: modelProviderIdentity(modelId ?? ""),
      matchSlugOverride:
        modelId == null ? undefined : options.matchSlugOverridesBySourceId?.get(modelId),
      sourceName: typeof record.name === "string" ? record.name : null,
      sourceReleaseDate: typeof record.release_date === "string" ? record.release_date : null,
    };
  });
  const matcherOutput = runMatcher(
    sourceModels,
    providerPools,
    maxCandidates,
    options.matcherConfig,
  );

  return {
    total_scraped_models: options.artificialAnalysisRows.length,
    total_models_dev_models: totalScopedModels,
    max_candidates: maxCandidates,
    pre_void_matched_count: matcherOutput.preVoidMatchedCount,
    pre_void_unmatched_count: matcherOutput.preVoidUnmatchedCount,
    void_mode: "maxmin_range",
    void_threshold: matcherOutput.voidThreshold,
    voided_count: matcherOutput.voidedCount,
    matched_count: matcherOutput.matchedCount,
    unmatched_count: matcherOutput.unmatchedCount,
    models: matcherOutput.models,
  };
}
