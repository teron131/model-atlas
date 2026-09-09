/** Benchmark health reports matching coverage and observed spread, never freshness or capability verdicts from rank agreement. */

import type { ScoringConfig } from "../../config/stage";
import {
  firstVariantCompatibleCandidate,
  type MatcherConfig,
  rankMatchCandidates,
} from "../../identity";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  normalizeModelToken,
} from "../../identity/normalization";
import type { BenchmarkRowsByKey, BenchmarkSourceRow } from "../../pipeline/benchmark-rows";
import { benchmarkMetricValue } from "../../pipeline/scores/resource-metrics";
import type {
  ModelAtlasBenchmarkHealthLeader,
  ModelAtlasBenchmarkUpdateEntry,
  ModelAtlasBenchmarkUpdateHealth,
  ModelAtlasModel,
} from "../types";

const TOP_LIMIT = 5;
type HealthModel = Pick<
  ModelAtlasModel,
  "id" | "name" | "benchmarks" | "intelligence" | "reasoning_effort"
>;

/** Older rank-overlap summaries must never survive as current descriptive health evidence. */
export function isCurrentBenchmarkHealth(
  entry: ModelAtlasBenchmarkUpdateEntry | undefined,
): boolean {
  if (
    entry?.schema_version !== 2 ||
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
  const spread = entry.spread;
  return (
    spread != null &&
    spread.top_count === Math.min(TOP_LIMIT, entry.distinct_model_count) &&
    [spread.full_range, spread.leader_gap, spread.top_range, spread.top_range_without_leader].every(
      (value) => value === null || (Number.isFinite(value) && value >= 0),
    )
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
): ModelAtlasBenchmarkUpdateHealth {
  const candidates = models.flatMap((model) =>
    model.id == null
      ? []
      : [
          {
            model_id: model.id,
            provider_id: model.id.split("/")[0] ?? "",
            provider_name: "",
            model_name: model.name,
          },
        ],
  );
  const canonicalIds = new Map(
    models
      .filter((model) => model.id != null)
      .map((model) => [model.id!, canonicalModelKey(model)]),
  );
  const keys = [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ].sort();
  return Object.fromEntries(
    keys.map((key) => {
      const sourceRows = sourceRowsByKey[key];
      const rows = (sourceRows ?? modelObservations(models, key)).filter((row) =>
        Number.isFinite(row.value),
      );
      const groups = new Map<string, ModelAtlasBenchmarkHealthLeader>();
      for (const row of [...rows].sort(
        (a, b) => b.value - a.value || a.label.localeCompare(b.label),
      )) {
        const modelId = sourceRows == null ? row.id : matchSource(row, candidates, matcherConfig);
        const identity =
          modelId == null
            ? normalizeModelToken(row.identity)
            : (canonicalIds.get(modelId) ?? modelId);
        const variant = {
          label: row.label,
          value: row.value,
          reasoning_effort: row.reasoningEffort,
        };
        const existing = groups.get(identity);
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
          source_id: row.id ?? row.identity,
          model_id: modelId,
          ...variant,
          variants: [variant],
        });
      }
      const ranked = [...groups.values()];
      const matched = ranked.filter((row) => row.model_id != null);
      const leaders = ranked.slice(0, TOP_LIMIT);
      const entry: ModelAtlasBenchmarkUpdateEntry = {
        schema_version: 2,
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
        },
      };
      return [key, entry];
    }),
  );
}

function range(rows: readonly ModelAtlasBenchmarkHealthLeader[]): number | null {
  return rows.length < 2 ? null : rows[0]!.value - rows[rows.length - 1]!.value;
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
    const value = benchmarkMetricValue(model, key);
    if (id == null || value == null) return [];
    return [
      {
        id,
        identity: canonicalModelKey(model),
        label: model.name ?? id,
        provider: null,
        reasoningEffort: canonicalReasoningEffort(model.reasoning_effort),
        value,
      },
    ];
  });
}

function matchSource(
  row: BenchmarkSourceRow,
  candidates: {
    model_id: string;
    provider_id: string;
    provider_name: string;
    model_name: string | null;
  }[],
  config: MatcherConfig | undefined,
): string | null {
  if (config == null) return null;
  const slug = normalizeModelToken(row.identity.split("/").at(-1) || row.label);
  const ranked = rankMatchCandidates(slug, candidates, { requireSourceTokenCoverage: true });
  return firstVariantCompatibleCandidate(slug, ranked, config)?.model_id ?? null;
}
