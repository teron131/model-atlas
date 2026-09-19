/** Equal-source benchmark fusion preserves exact efforts and quality crosswalks while admitting raw resource fusion only after absolute-scale agreement. */

import { modelNameIdentityKey } from "../identity";
import { reasoningEffortRank } from "../identity/normalization";
import { clamp01 } from "../math-utils";
import type { BenchmarkObservationRow } from "./observation";
import { RESOURCE_SOURCE_AGREEMENT_POLICY } from "./resource-sources";
import { buildAdditiveSourceCrosswalk } from "./source-crosswalk";

export type FusionObservation = BenchmarkObservationRow & {
  seconds_per_task?: number | null;
  output_tokens_per_task?: number | null;
};

type Pair = {
  name: string;
  effort: string | null;
  a: FusionObservation | null;
  b: FusionObservation | null;
};

type FusionSourceLabels = {
  a: string;
  b: string;
};

type ResourceAgreement = {
  accountingCompatible: boolean;
  comparable: boolean;
  modelCount: number;
  withinToleranceShare: number;
};

// These gates apply to midpoint prediction error on the unit score scale, not full-source error.
const MINIMUM_MODELS = 6;
const MAXIMUM_SCORE_ERROR = 0.025;
const RESOURCE_KEYS = [
  "cost",
  "seconds_per_task",
  "tokens_per_task",
  "output_tokens_per_task",
] as const;

/** Fit on exact-effort overlap only; collapsed summaries select each source's highest reported effort without donating it to another variant. */
export function fuseBenchmarkSources(
  a: readonly FusionObservation[],
  b: readonly FusionObservation[],
  {
    maximumScoreError = MAXIMUM_SCORE_ERROR,
    normalizeScore = clamp01,
    sourceLabels = { a: "Source A", b: "Source B" },
  }: {
    maximumScoreError?: number;
    normalizeScore?: (value: number) => number;
    sourceLabels?: FusionSourceLabels;
  } = {},
): FusionObservation[] {
  const pairs = pairObservations(a, b);
  const quality = crosswalk(pairs, (row) => row.canonical_value, maximumScoreError);
  const overlap = pairs.filter((pair) => pair.a != null && pair.b != null);
  const observedRanges = {
    a: {
      min: Math.min(...overlap.map((pair) => pair.a!.canonical_value)),
      max: Math.max(...overlap.map((pair) => pair.a!.canonical_value)),
    },
    b: {
      min: Math.min(...overlap.map((pair) => pair.b!.canonical_value)),
      max: Math.max(...overlap.map((pair) => pair.b!.canonical_value)),
    },
  };
  const resources = new Map(
    RESOURCE_KEYS.map((key) => [
      key,
      crosswalk(
        pairs,
        (row) => {
          const value = row[key];
          return value != null && value > 0 ? Math.log(value) : null;
        },
        Math.log(2),
        0,
      ),
    ]),
  );
  const resourceAgreements = new Map(
    RESOURCE_KEYS.map((key) => [key, resourceAgreement(pairs, key)]),
  );
  const defaults = pairObservations(sourceDefaults(a), sourceDefaults(b));
  return [
    ...pairs.flatMap((pair) => fusePair(pair, false)),
    ...defaults.flatMap((pair) => fusePair(pair, true)),
  ];

  function fusePair(pair: Pair, collapsed: boolean): FusionObservation[] {
    const template = pair.a ?? pair.b;
    if (template == null) return [];
    const both = pair.a != null && pair.b != null;
    const { delta } = quality.diagnostic;
    const score = quality.project(pair.a?.canonical_value ?? null, pair.b?.canonical_value ?? null);
    if (score == null) return [];
    const extrapolated =
      !both &&
      (["a", "b"] as const).some((side) => {
        const value = pair[side]?.canonical_value;
        if (value == null) return false;
        const range = observedRanges[side];
        return value < range.min || value > range.max;
      });
    const metadata = {
      fusion: true,
      fusion_collapsed: collapsed,
      fusion_estimated: !both,
      fusion_extrapolated: extrapolated,
      fusion_confidence: both ? 1 : extrapolated ? 0.5 : 0.5 + 0.5 * (quality.confidence ?? 0),
      source_a_url: pair.a?.source_url ?? null,
      source_b_url: pair.b?.source_url ?? null,
      source_a_label: sourceLabels.a,
      source_b_label: sourceLabels.b,
      source_a_score: pair.a?.canonical_value ?? null,
      source_b_score: pair.b?.canonical_value ?? null,
      source_a_effort: pair.a?.metadata.source_effort ?? pair.a?.reasoning_effort ?? null,
      source_b_effort: pair.b?.metadata.source_effort ?? pair.b?.reasoning_effort ?? null,
      crosswalk_offset: delta,
      crosswalk_error: quality.diagnostic.validationMedianAbsoluteError,
    };
    const fused: FusionObservation = {
      benchmark_key: template.benchmark_key,
      source_url: template.source_url,
      model_id: null,
      model: collapsed ? template.base_model : template.model,
      base_model: template.base_model,
      reasoning_effort: collapsed ? null : pair.effort,
      model_creator: template.model_creator,
      rank: null,
      canonical_value: normalizeScore(score),
      observed_at:
        [pair.a?.observed_at, pair.b?.observed_at]
          .filter((v): v is string => v != null)
          .sort()
          .at(-1) ?? null,
      metadata,
    };
    for (const key of RESOURCE_KEYS) {
      const av = pair.a?.[key] ?? null;
      const bv = pair.b?.[key] ?? null;
      const fit = resources.get(key)!;
      const agreement = resourceAgreements.get(key)!;
      const timeCompatible =
        key !== "seconds_per_task" ||
        (pair.a?.metadata.time_measure === pair.b?.metadata.time_measure &&
          pair.a?.metadata.time_measure != null);
      let value: number | null = null;
      let estimated = false;
      if (agreement.comparable && timeCompatible && av != null && bv != null) value = (av + bv) / 2;
      else if (
        agreement.comparable &&
        key !== "seconds_per_task" &&
        fit.diagnostic.imputationAllowed &&
        fit.diagnostic.delta != null
      ) {
        const ratio = Math.exp(fit.diagnostic.delta);
        if (av != null) value = (av + av * ratio) / 2;
        else if (bv != null) value = (bv / ratio + bv) / 2;
        estimated = value != null;
      }
      fused[key] = value;
      fused.metadata[key] = value;
      fused.metadata[`source_a_${key}`] = av;
      fused.metadata[`source_b_${key}`] = bv;
      fused.metadata[`fusion_${key}_accounting_compatible`] = agreement.accountingCompatible;
      fused.metadata[`fusion_${key}_comparable`] = agreement.comparable;
      fused.metadata[`fusion_${key}_paired_models`] = agreement.modelCount;
      fused.metadata[`fusion_${key}_within_5_percent_share`] = agreement.withinToleranceShare;
      fused.metadata[`fusion_${key}_estimated`] = estimated;
      fused.metadata[`fusion_${key}_confidence`] = estimated
        ? 0.5 + 0.5 * (fit.confidence ?? 0)
        : value == null
          ? 0
          : 1;
    }
    return [fused];
  }
}

/** Raw resources can share a scale only when model-balanced matched amounts agree before fitting or rescaling. */
function resourceAgreement(
  pairs: readonly Pair[],
  key: (typeof RESOURCE_KEYS)[number],
): ResourceAgreement {
  const positiveOverlap = pairs.filter((pair) => {
    const av = pair.a?.[key];
    const bv = pair.b?.[key];
    return av != null && av > 0 && bv != null && bv > 0;
  });
  const accountingCompatible =
    key !== "seconds_per_task" ||
    positiveOverlap.every(
      (pair) =>
        pair.a?.metadata.time_measure != null &&
        pair.a.metadata.time_measure === pair.b?.metadata.time_measure,
    );
  const byModel = new Map<string, Pair[]>();
  for (const pair of positiveOverlap) {
    const rows = byModel.get(pair.name) ?? [];
    rows.push(pair);
    byModel.set(pair.name, rows);
  }
  let agreeingWeight = 0;
  for (const rows of byModel.values()) {
    const pairWeight = 1 / rows.length;
    for (const pair of rows) {
      const av = pair.a![key]!;
      const bv = pair.b![key]!;
      if (Math.max(av, bv) / Math.min(av, bv) <= RESOURCE_SOURCE_AGREEMENT_POLICY.maximumRatio) {
        agreeingWeight += pairWeight;
      }
    }
  }
  const modelCount = byModel.size;
  const withinToleranceShare = modelCount === 0 ? 0 : agreeingWeight / modelCount;
  return {
    accountingCompatible,
    comparable:
      accountingCompatible &&
      modelCount >= RESOURCE_SOURCE_AGREEMENT_POLICY.minimumModels &&
      withinToleranceShare >= RESOURCE_SOURCE_AGREEMENT_POLICY.minimumShare,
    modelCount,
    withinToleranceShare,
  };
}

function crosswalk(
  pairs: Pair[],
  value: (row: FusionObservation) => number | null,
  maximumMedianAbsoluteError: number,
  sourceBWeight = 0.5,
) {
  return buildAdditiveSourceCrosswalk(pairs, {
    sourceAValue: (pair) => (pair.a == null ? null : value(pair.a)),
    sourceBValue: (pair) => (pair.b == null ? null : value(pair.b)),
    minimumEffectiveModels: MINIMUM_MODELS,
    maximumMedianAbsoluteError,
    sourceBWeight,
  });
}

/** Model-name reconciliation follows the existing provider-neutral identity vocabulary; efforts remain separate keys. */
function pairObservations(
  a: readonly FusionObservation[],
  b: readonly FusionObservation[],
): Pair[] {
  const pairs = new Map<string, Pair>();
  for (const [side, rows] of [
    ["a", a],
    ["b", b],
  ] as const) {
    for (const row of rows) {
      const name = modelNameIdentityKey(row.base_model);
      const key = `${name}/${row.reasoning_effort ?? ""}`;
      const pair = pairs.get(key) ?? { name, effort: row.reasoning_effort, a: null, b: null };
      const current = pair[side];
      if (current == null || row.canonical_value > current.canonical_value) pair[side] = row;
      pairs.set(key, pair);
    }
  }
  return [...pairs.values()];
}

function sourceDefaults(rows: readonly FusionObservation[]): FusionObservation[] {
  const defaults = new Map<string, FusionObservation>();
  for (const row of rows) {
    const key = modelNameIdentityKey(row.base_model);
    const current = defaults.get(key);
    if (
      current == null ||
      reasoningEffortRank(row.reasoning_effort) > reasoningEffortRank(current.reasoning_effort)
    )
      defaults.set(key, row);
  }
  // The original efforts remain in provenance while null allows source defaults with different efforts to pair.
  return [...defaults.values()].map((row) => ({
    ...row,
    metadata: { ...row.metadata, source_effort: row.reasoning_effort },
    reasoning_effort: null,
  }));
}
