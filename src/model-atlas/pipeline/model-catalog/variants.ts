/** Model catalog variant construction merges route aliases into effort-preserving or collapsed rows. */

import { claudeIdentityKey, parseClaudeIdentity } from "../../identity/claude";
import {
  canonicalReasoningEffort,
  modelSlugFromModelId,
  normalizeModelToken,
  normalizeProviderModelId,
  OPENROUTER_PROVIDER_ID,
  reasoningEffortRank,
} from "../../identity/normalization";
import {
  publicOpenRouterModelId,
  publicOpenRouterModelName,
  reasoningEffortSelectionPriority,
  stripCatalogAliasSuffixes,
} from "../../identity/openrouter";
import { asFiniteNumber, type JsonObject } from "../../runtime";
import type { ModelRow } from "../model-types";

const CATALOG_MERGED_OBJECT_FIELDS = ["cost", "limit", "modalities"] as const;
const ALIAS_MERGED_OBJECT_FIELDS = [
  ...CATALOG_MERGED_OBJECT_FIELDS,
  "benchmarks",
  "intelligence",
  "intelligence_index_cost",
  "scoring_sources",
] as const;
type MergedObjectField = (typeof ALIAS_MERGED_OBJECT_FIELDS)[number];

type VariantShape = "preserve" | "collapse";

function hasIntelligenceIndexCost(row: ModelRow): boolean {
  return asFiniteNumber(row.intelligence_index_cost?.cost_per_task) != null;
}

function hasBenchmarkSignal(row: ModelRow): boolean {
  return [...Object.values(row.intelligence ?? {}), ...Object.values(row.benchmarks ?? {})].some(
    (value) => asFiniteNumber(value) != null,
  );
}

/** Duplicate resolution favors benchmark-bearing rows first, then OpenRouter-backed rows with usable public scoring data. */
function rowPriority(row: ModelRow, dedupeKey: string): number {
  const artificialAnalysisIdentityBoost = row.artificial_analysis_id != null ? 4_000_000 : 0;
  const openRouterBoost = row.provider_id === OPENROUTER_PROVIDER_ID ? 1_000_000 : 0;
  const benchmarkBoost = hasBenchmarkSignal(row) ? 2_000_000 : 0;
  const intelligenceCostBoost = hasIntelligenceIndexCost(row) ? 1_000 : 0;
  const reasoningEffortBoost =
    reasoningEffortSelectionPriority(
      row.reasoning_effort,
      row.artificial_analysis_slug ?? null,
      canonicalSlugFromDedupeKey(dedupeKey),
    ) * 10_000_000;
  return (
    reasoningEffortBoost +
    artificialAnalysisIdentityBoost +
    benchmarkBoost +
    openRouterBoost +
    intelligenceCostBoost
  );
}

/** Ties go to the earliest row. */
function highestPriorityRow(rows: readonly ModelRow[], dedupeKey: string): ModelRow {
  return rows.reduce((winner, row) =>
    rowPriority(row, dedupeKey) > rowPriority(winner, dedupeKey) ? row : winner,
  );
}

function canonicalSlugFromDedupeKey(dedupeKey: string): string | null {
  return dedupeKey.startsWith("artificial_analysis:")
    ? dedupeKey.slice("artificial_analysis:".length)
    : modelSlugFromModelId(dedupeKey);
}

function dedupeKeyForRowId(modelId: string): string {
  const normalizedId = normalizeProviderModelId(modelId);
  if (!normalizedId.includes("/")) {
    return normalizedId;
  }
  const slashIndex = normalizedId.indexOf("/");
  const provider = normalizedId.slice(0, slashIndex);
  const slug = stripCatalogAliasSuffixes(normalizedId.slice(slashIndex + 1));
  return `${provider}/${slug}`;
}

function versionKeyForRow(row: ModelRow): string | null {
  const slug = row.artificial_analysis_slug ?? modelSlugFromModelId(row.id);
  if (slug == null) {
    return null;
  }
  const claudeIdentity = parseClaudeIdentity(slug);
  return claudeIdentity == null
    ? stripCatalogAliasSuffixes(normalizeModelToken(slug))
    : claudeIdentityKey(claudeIdentity);
}

/** Benchmark-version keys keep Artificial Analysis rows attached while provider suffixes collapse into one public route. */
function dedupeKeyForRow(
  row: ModelRow,
  benchmarkedVersionKeys: ReadonlySet<string>,
  alignedVersionKeyByRoute: ReadonlyMap<string, string>,
): string | null {
  if (row.id == null) {
    return null;
  }
  const versionKey = versionKeyForRow(row);
  if (versionKey != null && benchmarkedVersionKeys.has(versionKey)) {
    return `artificial_analysis:${alignedVersionKeyByRoute.get(dedupeKeyForRowId(row.id)) ?? versionKey}`;
  }
  return dedupeKeyForRowId(row.id);
}

function mergeObjectField(
  target: ModelRow,
  field: MergedObjectField,
  rows: readonly ModelRow[],
): void {
  const merged: JsonObject = { ...target[field] };
  for (const row of rows) {
    for (const [key, value] of Object.entries(row[field] ?? {})) {
      if (merged[key] == null && value != null) {
        merged[key] = value;
      }
    }
  }
  if (Object.keys(merged).length > 0) {
    target[field] = merged;
  }
}

function openRouterRouteIdForGroup(group: readonly ModelRow[]): string | null {
  for (const row of group) {
    if (row.provider_id !== OPENROUTER_PROVIDER_ID) {
      continue;
    }
    const openRouterId = row.openrouter_id ?? row.id;
    if (openRouterId) {
      return publicOpenRouterModelId(openRouterId);
    }
  }
  return null;
}

/** The route a catalog row stands for: a provider-qualified OpenRouter id, else the row id, else a bare OpenRouter id. */
export function catalogRowRouteId(row: ModelRow): string | null {
  const openRouterId = row.openrouter_id || null;
  if (openRouterId?.includes("/")) {
    return openRouterId;
  }
  return row.id || openRouterId;
}

/** The exact public catalog route owns the canonical name; alias routes must not rename it. */
function canonicalCatalogRouteName(
  group: readonly ModelRow[],
  publicRouteId: string,
): string | null {
  for (const row of group) {
    if (
      row.provider_id === OPENROUTER_PROVIDER_ID &&
      catalogRowRouteId(row) === publicRouteId &&
      row.name
    ) {
      return publicOpenRouterModelName(row.name, publicRouteId);
    }
  }
  return null;
}

function mergeDuplicateRows(
  winner: ModelRow,
  group: readonly ModelRow[],
  objectFields: readonly MergedObjectField[],
): ModelRow {
  const merged: ModelRow = { ...winner };
  for (const field of objectFields) {
    mergeObjectField(merged, field, group);
  }
  const openRouterId =
    openRouterRouteIdForGroup(group) ?? publicOpenRouterModelId(catalogRowRouteId(merged));
  if (openRouterId != null) {
    merged.id = openRouterId;
    merged.openrouter_id = openRouterId;
    merged.name = canonicalCatalogRouteName(group, openRouterId) ?? merged.name;
  }
  return merged;
}

function mergeCollapsedModelRows(winner: ModelRow, group: readonly ModelRow[]): ModelRow {
  const collapsedRow = mergeDuplicateRows(winner, group, CATALOG_MERGED_OBJECT_FIELDS);
  delete collapsedRow.reasoning_effort;
  return collapsedRow;
}

function isAlignedObservationRow(row: ModelRow, canonicalSlug: string | null): boolean {
  return (
    canonicalSlug != null &&
    reasoningEffortSelectionPriority(
      row.reasoning_effort,
      row.artificial_analysis_slug ?? null,
      canonicalSlug,
    ) > 0
  );
}

function isGenericReasoningObservationRow(row: ModelRow): boolean {
  return (
    canonicalReasoningEffort(row.reasoning_effort) == null &&
    row.artificial_analysis_slug != null &&
    /-(?:reasoning|thinking)$/.test(normalizeModelToken(row.artificial_analysis_slug))
  );
}

function preferredObservationRows(
  group: readonly ModelRow[],
  canonicalSlug: string | null,
): readonly ModelRow[] {
  const observationRows = group.filter((row) => row.artificial_analysis_id != null);
  const preferredRows = observationRows.filter(
    (row) => isAlignedObservationRow(row, canonicalSlug) || isGenericReasoningObservationRow(row),
  );
  if (preferredRows.length > 0) {
    return preferredRows;
  }
  return observationRows.length > 0 ? observationRows : group;
}

/** Preserve one Artificial Analysis observation per explicit effort while sharing route-owned catalog fields. */
function mergeRowsByReasoningEffort(group: readonly ModelRow[], dedupeKey: string): ModelRow[] {
  const canonicalSlug = canonicalSlugFromDedupeKey(dedupeKey);
  const rowsByEffort = new Map<string | null, ModelRow[]>();
  for (const row of preferredObservationRows(group, canonicalSlug)) {
    const effort = canonicalReasoningEffort(row.reasoning_effort);
    const effortRows = rowsByEffort.get(effort) ?? [];
    effortRows.push(row);
    rowsByEffort.set(effort, effortRows);
  }
  const unspecifiedEffortRows = rowsByEffort.get(null);
  const highestExplicitReasoningEffort = [...rowsByEffort.keys()]
    .filter((effort): effort is string => effort != null && effort !== "none")
    .sort((left, right) => reasoningEffortRank(right) - reasoningEffortRank(left))[0];
  if (unspecifiedEffortRows != null && highestExplicitReasoningEffort != null) {
    rowsByEffort.set(highestExplicitReasoningEffort, [
      ...(rowsByEffort.get(highestExplicitReasoningEffort) ?? []),
      ...unspecifiedEffortRows,
    ]);
    rowsByEffort.delete(null);
  }
  return [...rowsByEffort].map(([effort, effortRows]) => {
    const explicitEffortRows =
      effort == null
        ? effortRows
        : effortRows.filter((row) => canonicalReasoningEffort(row.reasoning_effort) === effort);
    const winner = highestPriorityRow(
      explicitEffortRows.length > 0 ? explicitEffortRows : effortRows,
      dedupeKey,
    );
    return {
      ...mergeDuplicateRows(winner, group, CATALOG_MERGED_OBJECT_FIELDS),
      reasoning_effort: effort,
    };
  });
}

function buildModelRows(rows: ModelRow[], variantShape: VariantShape): ModelRow[] {
  const rowsByDedupeKey = new Map<string, ModelRow[]>();
  const passthrough: ModelRow[] = [];
  const benchmarkedVersionKeys = new Set(
    rows
      .filter(hasBenchmarkSignal)
      .map(versionKeyForRow)
      .filter((key) => key != null),
  );
  const alignedVersionKeyByRoute = new Map<string, string>();
  for (const row of rows) {
    if (row.id == null) {
      continue;
    }
    const routeKey = dedupeKeyForRowId(row.id);
    const canonicalSlug = canonicalSlugFromDedupeKey(routeKey);
    const versionKey = versionKeyForRow(row);
    if (versionKey != null && isAlignedObservationRow(row, canonicalSlug)) {
      alignedVersionKeyByRoute.set(routeKey, versionKey);
    }
  }

  for (const row of rows) {
    const key = dedupeKeyForRow(row, benchmarkedVersionKeys, alignedVersionKeyByRoute);
    if (key == null) {
      passthrough.push(row);
      continue;
    }
    const group = rowsByDedupeKey.get(key) ?? [];
    group.push(row);
    rowsByDedupeKey.set(key, group);
  }

  const dedupedRows: ModelRow[] = [];
  for (const [dedupeKey, group] of rowsByDedupeKey.entries()) {
    if (dedupeKey.startsWith("artificial_analysis:")) {
      dedupedRows.push(
        ...(variantShape === "preserve"
          ? mergeRowsByReasoningEffort(group, dedupeKey)
          : [mergeCollapsedModelRows(highestPriorityRow(group, dedupeKey), group)]),
      );
      continue;
    }
    dedupedRows.push(
      mergeDuplicateRows(highestPriorityRow(group, dedupeKey), group, ALIAS_MERGED_OBJECT_FIELDS),
    );
  }

  return [...passthrough, ...dedupedRows];
}

/** Collapse route aliases while preserving Artificial Analysis reasoning variants as distinct model rows. */
export function buildModelVariants(rows: ModelRow[]): ModelRow[] {
  return buildModelRows(rows, "preserve");
}

/** Collapse route aliases and reasoning variants into one representative row per model. */
export function collapseModelVariants(rows: ModelRow[]): ModelRow[] {
  return buildModelRows(rows, "collapse");
}
