/** Model-version replacement policy owns prior identity, benchmark freshness, and authority weighting. */

import {
  BENCHMARK_CATALOG,
  BENCHMARK_KEYS,
  type BenchmarkKey,
  benchmarkValueLocation,
} from "../../benchmarks/registry";
import { type ScoringConfig, selectedBenchmarkKeys } from "../../config/stage";
import { artificialAnalysisMatchSlug, type MatchDiagnosticsPayload } from "../../identity";
import {
  canonicalReasoningEffort,
  modelSlugFromModelId,
  normalizeModelToken,
  parseModelEffort,
} from "../../identity/normalization";
import { asRecord } from "../../runtime";
import type { ModelAtlasSourceData } from "../../sources/assembly";
import type { ModelAtlasModel, ModelRow } from "../model-types";
import { benchmarkValue } from "../scores/resource-metrics";

const FRESHNESS_AUTHORITY_SOURCE_GROUPS = new Set(["artificial_analysis", "vals"]);
const FRESHNESS_AUTHORITY_HOSTNAMES = ["artificialanalysis.ai", "vals.ai"];
const FRESHNESS_AUTHORITY_WEIGHT = 2;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isDatedReleaseSuffix(tokens: readonly string[]): boolean {
  if (tokens.length === 1) {
    const token = tokens[0] as string;
    if (/^\d{8}$/.test(token)) {
      return isValidCalendarDate(
        Number(token.slice(0, 4)),
        Number(token.slice(4, 6)),
        Number(token.slice(6, 8)),
      );
    }
    if (/^\d{4}$/.test(token)) {
      const monthOrYear = Number(token.slice(0, 2));
      const dayOrMonth = Number(token.slice(2, 4));
      return (
        isValidCalendarDate(2000, monthOrYear, dayOrMonth) || (dayOrMonth >= 1 && dayOrMonth <= 12)
      );
    }
    return false;
  }
  return (
    tokens.length === 3 &&
    /^\d{4}$/.test(tokens[0] ?? "") &&
    /^\d{1,2}$/.test(tokens[1] ?? "") &&
    /^\d{1,2}$/.test(tokens[2] ?? "") &&
    isValidCalendarDate(Number(tokens[0]), Number(tokens[1]), Number(tokens[2]))
  );
}

function datedReleaseExtension(baseSlug: string, candidateSlug: string): string | null {
  const baseTokens = normalizeModelToken(baseSlug).split("-");
  const candidateTokens = normalizeModelToken(candidateSlug).split("-");
  const suffixTokens = candidateTokens.slice(baseTokens.length);
  return candidateTokens.length > baseTokens.length &&
    baseTokens.every((token, index) => candidateTokens[index] === token) &&
    isDatedReleaseSuffix(suffixTokens)
    ? candidateTokens.join("-")
    : null;
}

function artificialAnalysisSourceFamily(modelId: string): string | null {
  const sourceSlug = modelSlugFromModelId(modelId);
  return sourceSlug == null ? null : artificialAnalysisMatchSlug(normalizeModelToken(sourceSlug));
}

function addVersionEvidence(
  evidenceByFamily: Map<string, Set<string>>,
  family: string,
  matchSlug: string,
): void {
  const evidence = evidenceByFamily.get(family) ?? new Set<string>();
  evidence.add(matchSlug);
  evidenceByFamily.set(family, evidence);
}

/** Use catalog plus a dated source label or Vals agreement to resolve an undated source route to its current release. */
export function buildVersionReplacementMatchSlugOverrides(
  sourceData: ModelAtlasSourceData,
): ReadonlyMap<string, string> {
  const artificialAnalysisIdByFamily = new Map<string, string>();
  const artificialAnalysisLabelEvidenceByFamily = new Map<string, Set<string>>();
  for (const row of sourceData.artificialAnalysis.rows) {
    const record = asRecord(row);
    const sourceId = record.model_id;
    if (typeof sourceId !== "string") {
      continue;
    }
    const sourceSlug = modelSlugFromModelId(sourceId);
    const family = artificialAnalysisSourceFamily(sourceId);
    if (sourceSlug != null && family === normalizeModelToken(sourceSlug)) {
      artificialAnalysisIdByFamily.set(family, sourceId);
      const matchSlug =
        typeof record.name === "string" ? datedReleaseExtension(family, record.name) : null;
      if (matchSlug != null) {
        addVersionEvidence(artificialAnalysisLabelEvidenceByFamily, family, matchSlug);
      }
    }
  }

  const catalogEvidenceByFamily = new Map<string, Set<string>>();
  const valsEvidenceByFamily = new Map<string, Set<string>>();
  for (const row of sourceData.modelsDev.rows) {
    const candidateSlug = modelSlugFromModelId(row.model_id) ?? row.model_id;
    for (const family of artificialAnalysisIdByFamily.keys()) {
      const matchSlug = datedReleaseExtension(family, candidateSlug);
      if (matchSlug != null) {
        addVersionEvidence(catalogEvidenceByFamily, family, matchSlug);
      }
    }
  }
  for (const row of sourceData.valsIndex.rows) {
    const candidateSlug = modelSlugFromModelId(row.model_id) ?? row.model;
    for (const family of artificialAnalysisIdByFamily.keys()) {
      const matchSlug = datedReleaseExtension(family, candidateSlug);
      if (matchSlug != null) {
        addVersionEvidence(valsEvidenceByFamily, family, matchSlug);
      }
    }
  }
  const overridesBySourceId = new Map<string, string>();
  for (const [family, catalogEvidence] of catalogEvidenceByFamily) {
    const sourceId = artificialAnalysisIdByFamily.get(family);
    const corroboratingEvidence = new Set([
      ...(artificialAnalysisLabelEvidenceByFamily.get(family) ?? []),
      ...(valsEvidenceByFamily.get(family) ?? []),
    ]);
    if (sourceId == null || catalogEvidence.size !== 1 || corroboratingEvidence.size !== 1) {
      continue;
    }
    const [matchSlug] = catalogEvidence;
    if (matchSlug != null && corroboratingEvidence.has(matchSlug)) {
      overridesBySourceId.set(sourceId, matchSlug);
    }
  }
  return overridesBySourceId;
}

function routeMatchesVersionEvidence(routeId: string, matchSlug: string): boolean {
  const routeSlug = modelSlugFromModelId(routeId);
  return routeSlug != null && normalizeModelToken(routeSlug) === matchSlug;
}

/** A version-evidenced current route supersedes sibling source rows that still resolve to an older route. */
function supersededArtificialAnalysisIds(
  matchDiagnostics: MatchDiagnosticsPayload,
  matchSlugOverridesBySourceId: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const evidenceSourceIds = new Set(matchSlugOverridesBySourceId.keys());
  const currentRoutesByFamily = new Map<string, Set<string>>();
  for (const matchedModel of matchDiagnostics.models) {
    const sourceId = matchedModel.artificial_analysis_id;
    const currentRouteId = matchedModel.best_match?.model_id;
    const matchSlug = sourceId == null ? null : matchSlugOverridesBySourceId.get(sourceId);
    if (
      sourceId == null ||
      currentRouteId == null ||
      matchSlug == null ||
      !routeMatchesVersionEvidence(currentRouteId, matchSlug)
    ) {
      continue;
    }
    const family = artificialAnalysisSourceFamily(sourceId);
    if (family == null) {
      continue;
    }
    const routes = currentRoutesByFamily.get(family) ?? new Set<string>();
    routes.add(currentRouteId);
    currentRoutesByFamily.set(family, routes);
  }

  const superseded = new Set<string>();
  for (const matchedModel of matchDiagnostics.models) {
    const sourceId = matchedModel.artificial_analysis_id;
    if (sourceId == null || evidenceSourceIds.has(sourceId)) {
      continue;
    }
    const family = artificialAnalysisSourceFamily(sourceId);
    const currentRoutes = family == null ? null : currentRoutesByFamily.get(family);
    if (currentRoutes?.size === 1 && !currentRoutes.has(matchedModel.best_match?.model_id ?? "")) {
      superseded.add(sourceId);
    }
  }
  return superseded;
}

/** Mark confirmed replacement rows and discard sibling observations tied to the superseded route. */
export function markVersionReplacementRows(
  rows: readonly ModelRow[],
  matchDiagnostics: MatchDiagnosticsPayload,
  matchSlugOverridesBySourceId: ReadonlyMap<string, string>,
): ModelRow[] {
  const supersededSourceIds = supersededArtificialAnalysisIds(
    matchDiagnostics,
    matchSlugOverridesBySourceId,
  );
  const preparedRows: ModelRow[] = [];
  for (const row of rows) {
    const sourceId = row.artificial_analysis_id;
    if (sourceId == null) {
      preparedRows.push(row);
      continue;
    }
    if (supersededSourceIds.has(sourceId)) {
      continue;
    }
    const matchSlug = matchSlugOverridesBySourceId.get(sourceId);
    preparedRows.push(
      row.id != null && matchSlug != null && routeMatchesVersionEvidence(row.id, matchSlug)
        ? { ...row, version_replacement_source_id: sourceId }
        : row,
    );
  }
  return preparedRows;
}

function modelIdEffortKey(modelId: unknown, reasoningEffort: unknown): string {
  return `${typeof modelId === "string" ? modelId : ""}\u0000${canonicalReasoningEffort(reasoningEffort) ?? ""}`;
}

/** Resolve the prior published identity while a replacement route is being established. */
export function buildPreviousModelLookup(
  previousModels: readonly ModelAtlasModel[],
): (row: ModelRow) => ModelAtlasModel | null {
  const previousByVariant = new Map(
    previousModels.map((model) => [modelIdEffortKey(model.id, model.reasoning_effort), model]),
  );
  return (row) =>
    previousByVariant.get(
      modelIdEffortKey(row.version_replacement_source_id, row.reasoning_effort),
    ) ??
    previousByVariant.get(modelIdEffortKey(row.id, row.reasoning_effort)) ??
    null;
}

export function isVersionReplacementRow(row: ModelRow): boolean {
  return row.version_replacement_source_id != null;
}

function isObservationSource(source: { roles: readonly string[] }): boolean {
  return source.roles.includes("observation");
}

function isFreshnessAuthorityHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^www\./, "");
  return FRESHNESS_AUTHORITY_HOSTNAMES.some(
    (authority) => normalized === authority || normalized.endsWith(`.${authority}`),
  );
}

function benchmarkUsesFreshnessAuthority(row: ModelRow, key: string): boolean {
  const definition = BENCHMARK_CATALOG[key as BenchmarkKey];
  const observationSources = definition?.source.inputs.filter(isObservationSource) ?? [];
  if (
    observationSources.length > 0 &&
    observationSources.every((source) => FRESHNESS_AUTHORITY_SOURCE_GROUPS.has(source.group))
  ) {
    return true;
  }

  const sourceUrl = asRecord(row.scoring_sources?.[key]).source_url;
  if (typeof sourceUrl !== "string") {
    return false;
  }
  try {
    return isFreshnessAuthorityHostname(new URL(sourceUrl).hostname);
  } catch {
    return false;
  }
}

function sourceModelSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const baseModel = parseModelEffort(value).baseModel;
  return normalizeModelToken(modelSlugFromModelId(baseModel) ?? baseModel);
}

function benchmarkSourceIdentifiesCurrentVersion(row: ModelRow, key: string): boolean {
  const currentSlug = sourceModelSlug(row.id);
  if (currentSlug == null) {
    return false;
  }
  const replacementSourceSlug = sourceModelSlug(row.version_replacement_source_id);
  const source = asRecord(row.scoring_sources?.[key]);
  const sourceSlugs = [
    source.model_id,
    source.model,
    source.base_model,
    source.identity,
    source.label,
  ].map(sourceModelSlug);
  if (sourceSlugs.includes(currentSlug)) {
    return true;
  }
  if (replacementSourceSlug == null || !benchmarkUsesFreshnessAuthority(row, key)) {
    return false;
  }
  const attributedSourceSlugs = sourceSlugs.filter((slug) => slug != null);
  return (
    attributedSourceSlugs.length === 0 || attributedSourceSlugs.includes(replacementSourceSlug)
  );
}

function calendarDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function benchmarkSourceIsNewer(
  row: ModelRow,
  previous: ModelAtlasModel | null | undefined,
  key: string,
): boolean {
  const sourceDate = calendarDate(asRecord(row.scoring_sources?.[key]).observed_at);
  const releaseDate = calendarDate(row.release_date);
  const previousDate = calendarDate(previous?.benchmark_dates?.[key]);
  return (
    sourceDate != null &&
    releaseDate != null &&
    sourceDate >= releaseDate &&
    (previousDate == null || sourceDate > previousDate)
  );
}

function omitBenchmarkValues(row: ModelRow, keys: readonly string[]): ModelRow {
  const benchmarks = { ...row.benchmarks };
  const intelligence = { ...row.intelligence };
  const scoringSources = { ...row.scoring_sources };
  for (const key of keys) {
    const location = benchmarkValueLocation(key);
    if (location?.kind === "intelligence") {
      delete intelligence[location.field];
    }
    delete benchmarks[key];
    delete scoringSources[key];
  }
  return {
    ...row,
    benchmarks,
    intelligence,
    scoring_sources: scoringSources,
  };
}

/**
 * Retain changed replacement observations.
 * Retain observations identified by the new route or confirmed stable authority alias.
 * Retain observations newly observed for or already accepted for the replacement.
 * Give freshness authorities extra weight after filtering.
 * Authority alone does not make an unnamed observation current-version evidence.
 */
export function dropStaleReplacementBenchmarks(
  rows: readonly ModelRow[],
  previousModels: readonly ModelAtlasModel[],
  scoringConfig: ScoringConfig,
): ModelRow[] {
  const previousModelForRow = buildPreviousModelLookup(previousModels);
  const selectedKeys = new Set(selectedBenchmarkKeys(scoringConfig));
  return rows.map((row) => {
    if (!isVersionReplacementRow(row)) {
      return row;
    }
    const previous = previousModelForRow(row);
    const staleKeys = BENCHMARK_KEYS.filter((key) => {
      const currentValue = benchmarkValue(row, key);
      if (!selectedKeys.has(key) || currentValue == null) {
        return false;
      }
      const previousValue = previous == null ? null : benchmarkValue(previous, key);
      const changed = previousValue != null && previousValue !== currentValue;
      const previouslyAccepted = previous?.id === row.id && previousValue != null;
      return (
        !changed &&
        !previouslyAccepted &&
        !benchmarkSourceIdentifiesCurrentVersion(row, key) &&
        !benchmarkSourceIsNewer(row, previous, key)
      );
    });
    return staleKeys.length === 0 ? row : omitBenchmarkValues(row, staleKeys);
  });
}

/** Give designated freshness authorities extra influence only while a replacement row is active. */
export function versionReplacementBenchmarkWeights(
  row: ModelRow,
  scoringConfig: ScoringConfig,
): ReadonlyMap<string, number> | undefined {
  if (!isVersionReplacementRow(row)) {
    return undefined;
  }
  return new Map(
    selectedBenchmarkKeys(scoringConfig)
      .filter((key) => benchmarkUsesFreshnessAuthority(row, key))
      .map((key) => [key, FRESHNESS_AUTHORITY_WEIGHT]),
  );
}
