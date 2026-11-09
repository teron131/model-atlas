/** Benchmark health reports matching coverage, observed spread, effort inversions, and when rows last changed or could not be refreshed, as numbers, never freshness or capability verdicts from rank agreement. */

import { createHash } from "node:crypto";

import type { ScoringConfig } from "../../config/stage";
import {
  firstVariantCompatibleCandidate,
  type MatchCandidateInput,
  type MatcherConfig,
  rankMatchCandidates,
} from "../../identity";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  normalizeModelToken,
  parseModelEffort,
  reasoningEffortRank,
} from "../../identity/normalization";
import type { BenchmarkRowsByKey, BenchmarkSourceRow } from "../../pipeline/benchmark-rows";
import { benchmarkValue } from "../../pipeline/scores/resource-metrics";
import { benchmarkRawSources } from "../../sources/registry";
import type {
  ModelAtlasBenchmarkHealthLeader,
  ModelAtlasBenchmarkUpdateEntry,
  ModelAtlasBenchmarkUpdateHealth,
  ModelAtlasModel,
  ModelAtlasSourceHealth,
} from "../types";

const TOP_LIMIT = 5;
type HealthModel = Pick<
  ModelAtlasModel,
  "id" | "name" | "benchmarks" | "intelligence" | "reasoning_effort"
>;

/** What a refresh adds to its rows: when it ran, the health it replaces, and how each source's fetch went. */
export type BenchmarkHealthRefresh = {
  atEpochSeconds: number;
  previous: ModelAtlasBenchmarkUpdateHealth | undefined;
  sourceHealth: ModelAtlasSourceHealth;
};

/** Health covers the whole portfolio, baseline benchmarks included, because reviews revisit every class. */
export function benchmarkHealthKeys(scoringConfig: ScoringConfig): string[] {
  return Object.keys(scoringConfig.benchmarkPortfolio).sort();
}

/** Older rank-overlap summaries must never survive as current descriptive health evidence. */
export function isValidBenchmarkUpdateHealth(
  entry: ModelAtlasBenchmarkUpdateEntry | undefined,
): entry is ModelAtlasBenchmarkUpdateEntry {
  if (
    entry?.schema_version !== 3 ||
    entry.cohort !== "all_available_models" ||
    entry.representative !== "best_reported_per_model"
  )
    return false;
  const counts = [
    entry.observed_count,
    entry.distinct_model_count,
    entry.matched_model_count,
    entry.unmatched_model_count,
  ];
  if (
    !counts.every((value) => Number.isSafeInteger(value) && value >= 0) ||
    entry.observed_count < entry.distinct_model_count ||
    entry.matched_model_count + entry.unmatched_model_count !== entry.distinct_model_count
  )
    return false;
  if (
    entry.status !== matchingStatus(entry.distinct_model_count, entry.matched_model_count) ||
    !["source", "model_observations"].includes(entry.evidence_origin)
  )
    return false;
  if (
    !Array.isArray(entry.source_leaders) ||
    !Array.isArray(entry.matched_leaders) ||
    entry.source_leaders.length !==
      (entry.evidence_origin === "source" ? Math.min(TOP_LIMIT, entry.distinct_model_count) : 0) ||
    entry.matched_leaders.length !== Math.min(TOP_LIMIT, entry.matched_model_count)
  )
    return false;
  for (const leader of [...entry.source_leaders, ...entry.matched_leaders]) {
    if (
      leader == null ||
      typeof leader.source_id !== "string" ||
      (leader.model_id !== null && typeof leader.model_id !== "string") ||
      !validVariant(leader) ||
      !Array.isArray(leader.variants) ||
      leader.variants.length === 0 ||
      !leader.variants.every(validVariant)
    )
      return false;
  }
  const { spread, efforts } = entry;
  return (
    spread != null &&
    efforts != null &&
    (entry.rows_fingerprint === null || typeof entry.rows_fingerprint === "string") &&
    spread.top_count === Math.min(TOP_LIMIT, entry.distinct_model_count) &&
    [
      spread.full_range,
      spread.leader_gap,
      spread.top_range,
      spread.top_range_without_leader,
      spread.top_standard_error,
      efforts.largest_inversion,
      entry.rows_updated_at_epoch_seconds,
      entry.cached_rows_fetched_at_epoch_seconds,
    ].every((value) => value === null || (Number.isFinite(value) && value >= 0)) &&
    [efforts.pair_count, efforts.inverted_pair_count].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) &&
    efforts.inverted_pair_count <= efforts.pair_count
  );
}

function validVariant(value: ModelAtlasBenchmarkHealthLeader["variants"][number]): boolean {
  return (
    value != null &&
    typeof value.label === "string" &&
    Number.isFinite(value.value) &&
    (value.reasoning_effort === null || typeof value.reasoning_effort === "string")
  );
}

/** Group source observations only for descriptive statistics; preserve efforts and never modify scoring inputs. */
export function buildBenchmarkUpdateHealth(
  models: readonly HealthModel[],
  scoringConfig: ScoringConfig,
  sourceRowsByKey: BenchmarkRowsByKey = {},
  matcherConfig?: MatcherConfig,
  refresh?: BenchmarkHealthRefresh,
): ModelAtlasBenchmarkUpdateHealth {
  const canonicalIds = new Map(
    models
      .filter((model) => model.id != null)
      .map((model) => [model.id!, canonicalModelKey(model)]),
  );
  const keys = benchmarkHealthKeys(scoringConfig);
  const matchSource = sourceMatcher(models, matcherConfig);
  return Object.fromEntries(
    keys.map((key) => {
      const sourceRows = sourceRowsByKey[key];
      const rows = (sourceRows ?? modelObservations(models, key)).filter((row) =>
        Number.isFinite(row.value),
      );
      const groups = new Map<
        string,
        { leader: ModelAtlasBenchmarkHealthLeader; standardError: number | null }
      >();
      for (const row of [...rows].sort(
        (a, b) => b.value - a.value || a.label.localeCompare(b.label),
      )) {
        const modelId = sourceRows == null ? row.id : matchSource(row);
        const identity =
          modelId == null
            ? normalizeModelToken(row.identity)
            : (canonicalIds.get(modelId) ?? modelId);
        const variant = {
          label: row.label,
          value: row.value,
          reasoning_effort: row.reasoningEffort,
        };
        const existing = groups.get(identity)?.leader;
        if (existing != null) {
          if (
            !existing.variants.some(
              (item) =>
                item.label === variant.label &&
                item.reasoning_effort === variant.reasoning_effort &&
                item.value === variant.value,
            )
          )
            existing.variants.push(variant);
          continue;
        }
        groups.set(identity, {
          leader: {
            source_id: row.id ?? row.identity,
            model_id: modelId,
            ...variant,
            variants: [variant],
          },
          standardError: row.standardError,
        });
      }
      const grouped = [...groups.values()];
      const ranked = grouped.map((group) => group.leader);
      const matched = ranked.filter((row) => row.model_id != null);
      const leaders = ranked.slice(0, TOP_LIMIT);
      const entry: ModelAtlasBenchmarkUpdateEntry = {
        schema_version: 3,
        status: matchingStatus(ranked.length, matched.length),
        evidence_origin: sourceRows == null ? "model_observations" : "source",
        cohort: "all_available_models",
        representative: "best_reported_per_model",
        observed_count: rows.length,
        distinct_model_count: ranked.length,
        matched_model_count: matched.length,
        unmatched_model_count: ranked.length - matched.length,
        source_leaders: sourceRows == null ? [] : leaders,
        matched_leaders: matched.slice(0, TOP_LIMIT),
        spread: {
          full_range: range(ranked),
          leader_gap: leaders.length < 2 ? null : leaders[0]!.value - leaders[1]!.value,
          top_count: leaders.length,
          top_range: range(leaders),
          top_range_without_leader: range(leaders.slice(1)),
          top_standard_error: meanStandardError(
            grouped.slice(0, TOP_LIMIT).map((group) => group.standardError),
          ),
        },
        efforts: effortInversions(ranked),
        ...rowUpdates(rows, refresh, key),
        cached_rows_fetched_at_epoch_seconds:
          refresh == null ? null : cachedRowsFetchedAt(key, refresh.sourceHealth),
      };
      return [key, entry];
    }),
  );
}

function range(rows: readonly ModelAtlasBenchmarkHealthLeader[]): number | null {
  return rows.length < 2 ? null : rows[0]!.value - rows[rows.length - 1]!.value;
}

function meanStandardError(values: readonly (number | null)[]): number | null {
  const published = values.filter((value) => value != null);
  return values.length === 0 || published.length < values.length
    ? null
    : published.reduce((total, value) => total + value, 0) / published.length;
}

/** Unlabelled rows are left out, because the source's default effort is unknown. */
function effortInversions(
  models: readonly ModelAtlasBenchmarkHealthLeader[],
): ModelAtlasBenchmarkUpdateEntry["efforts"] {
  let pairCount = 0;
  let invertedPairCount = 0;
  let largestInversion: number | null = null;
  for (const model of models) {
    const bestByRank = new Map<number, number>();
    for (const variant of model.variants) {
      const rank =
        variant.reasoning_effort == null ? -1 : reasoningEffortRank(variant.reasoning_effort);
      if (rank < 0) continue;
      bestByRank.set(rank, Math.max(bestByRank.get(rank) ?? -Infinity, variant.value));
    }
    const ordered = [...bestByRank]
      .sort(([left], [right]) => left - right)
      .map(([, value]) => value);
    for (const [lowIndex, low] of ordered.entries()) {
      for (const high of ordered.slice(lowIndex + 1)) {
        pairCount += 1;
        if (low <= high) continue;
        invertedPairCount += 1;
        largestInversion = Math.max(largestInversion ?? 0, low - high);
      }
    }
  }
  return {
    pair_count: pairCount,
    inverted_pair_count: invertedPairCount,
    largest_inversion: largestInversion,
  };
}

/** A previous entry built outside a refresh has no fingerprint, so a refresh that cannot compare leaves the update time unknown rather than claiming a change. */
function rowUpdates(
  rows: readonly BenchmarkSourceRow[],
  refresh: BenchmarkHealthRefresh | undefined,
  key: string,
): Pick<ModelAtlasBenchmarkUpdateEntry, "rows_fingerprint" | "rows_updated_at_epoch_seconds"> {
  if (refresh == null) return { rows_fingerprint: null, rows_updated_at_epoch_seconds: null };
  const fingerprint = rowsFingerprint(rows);
  const previous = refresh.previous?.[key];
  if (!isValidBenchmarkUpdateHealth(previous) || previous.rows_fingerprint == null) {
    return { rows_fingerprint: fingerprint, rows_updated_at_epoch_seconds: null };
  }
  return {
    rows_fingerprint: fingerprint,
    rows_updated_at_epoch_seconds:
      previous.rows_fingerprint === fingerprint
        ? previous.rows_updated_at_epoch_seconds
        : refresh.atEpochSeconds,
  };
}

/** Order-independent, so a source reordering its rows is not an update. */
function rowsFingerprint(rows: readonly BenchmarkSourceRow[]): string {
  const lines = rows
    .map((row) =>
      JSON.stringify([
        row.identity,
        row.label,
        row.reasoningEffort,
        row.value,
        row.standardError,
        row.version,
      ]),
    )
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** A source serving cached rows always has a fetch time, because the rows record when they were fetched. */
function cachedRowsFetchedAt(key: string, sourceHealth: ModelAtlasSourceHealth): number | null {
  const fetchedAt = benchmarkRawSources(key).flatMap((source) => {
    const entry = sourceHealth.sources[source];
    return entry?.status === "using_cached_rows" && entry.last_fetch_epoch_seconds != null
      ? [entry.last_fetch_epoch_seconds]
      : [];
  });
  return fetchedAt.length === 0 ? null : Math.min(...fetchedAt);
}

/** Generation and persisted validation share availability semantics, independent of benchmark merit. */
function matchingStatus(total: number, matched: number): ModelAtlasBenchmarkUpdateEntry["status"] {
  if (total === 0) return "missing";
  if (matched === 0) return "unmatched";
  return matched === total ? "matched" : "partially_matched";
}

function modelObservations(models: readonly HealthModel[], key: string): BenchmarkSourceRow[] {
  return models.flatMap((model) => {
    const id = model.id ?? model.name;
    const value = benchmarkValue(model, key);
    if (id == null || value == null) return [];
    return [
      {
        id,
        identity: canonicalModelKey(model),
        label: model.name ?? id,
        provider: null,
        reasoningEffort: canonicalReasoningEffort(model.reasoning_effort),
        value,
        standardError: null,
        version: null,
      },
    ];
  });
}

/** Match each normalized source slug once per health build; the same model recurs across benchmarks and effort rows. */
function sourceMatcher(
  models: readonly HealthModel[],
  config: MatcherConfig | undefined,
): (row: BenchmarkSourceRow) => string | null {
  if (config == null) return () => null;
  // Efforts share matching identities; rank each id/name pair once without merging distinct catalog aliases.
  const candidatesByIdentity = new Map<string, MatchCandidateInput>();
  for (const model of models) {
    if (model.id == null) continue;
    candidatesByIdentity.set(JSON.stringify([model.id, model.name]), {
      model_id: model.id,
      provider_id: model.id.split("/")[0] ?? "",
      provider_name: "",
      model_name: model.name,
    });
  }
  const candidates = [...candidatesByIdentity.values()];
  const modelIdBySlug = new Map<string, string | null>();
  const matchName = (name: string): string | null => {
    const slug = normalizeModelToken(name);
    let modelId = modelIdBySlug.get(slug);
    if (modelId === undefined) {
      const ranked = rankMatchCandidates(slug, candidates, { requireSourceTokenCoverage: true });
      modelId = firstVariantCompatibleCandidate(slug, ranked, config)?.model_id ?? null;
      modelIdBySlug.set(slug, modelId);
    }
    return modelId;
  };
  // Base models can drop a creator brand that names the family, as Surge's "Grok" leaving "4.7"; the source's own name keeps it.
  return (row) =>
    matchName(row.identity.split("/").at(-1) || row.label) ??
    matchName(parseModelEffort(row.label).baseModel);
}
