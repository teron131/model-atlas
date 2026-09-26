/** Benchmark source crosswalks combine quality across exact efforts while keeping resource accounting source-specific unless amounts agree. */

import { modelNameIdentityKey } from "../identity";
import { reasoningEffortRank } from "../identity/normalization";
import { clamp01, weightedMedianOfFinite } from "../math-utils";
import { calibrationObservations, distinctModelCount } from "./calibration-population";
import type { BenchmarkObservationRow } from "./observation";
import { RESOURCE_SOURCE_AGREEMENT_POLICY } from "./resource-sources";
import { buildAdditiveSourceCrosswalk } from "./source-crosswalk";

export type CrosswalkObservation = BenchmarkObservationRow & {
  seconds_per_task?: number | null;
  output_tokens_per_task?: number | null;
};

type Pair = {
  name: string;
  effort: string | null;
  a: CrosswalkObservation | null;
  b: CrosswalkObservation | null;
};

type Triple = {
  name: string;
  effort: string | null;
  rows: [CrosswalkObservation | null, CrosswalkObservation | null, CrosswalkObservation | null];
};

type SourceLabels = {
  a: string;
  b: string;
};

type ResourceAgreement = {
  accountingCompatible: boolean;
  comparable: boolean;
  modelCount: number;
  withinToleranceShare: number;
};

// These gates apply to the combined score's held-out prediction error on the unit score scale.
const MINIMUM_MODELS = 6;
const MAXIMUM_SCORE_ERROR = 0.025;
const RESOURCE_KEYS = [
  "cost",
  "seconds_per_task",
  "tokens_per_task",
  "output_tokens_per_task",
] as const;

/** Fit on exact-effort overlap only; collapsed summaries select each source's highest reported effort without donating it to another variant. */
export function crosswalkBenchmarkSources(
  a: readonly CrosswalkObservation[],
  b: readonly CrosswalkObservation[],
  {
    maximumScoreError = MAXIMUM_SCORE_ERROR,
    normalizeScore = clamp01,
    sourceLabels = { a: "Source A", b: "Source B" },
  }: {
    maximumScoreError?: number;
    normalizeScore?: (value: number) => number;
    sourceLabels?: SourceLabels;
  } = {},
): CrosswalkObservation[] {
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
    ...pairs.flatMap((pair) => crosswalkPair(pair, false)),
    ...defaults.flatMap((pair) => crosswalkPair(pair, true)),
  ];

  function crosswalkPair(pair: Pair, collapsed: boolean): CrosswalkObservation[] {
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
      fusion_crosswalk_applied: !both,
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
    const fused: CrosswalkObservation = {
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

/** Combine three comparable quality series at equal weight; missing counterparts require validated exact-effort pairwise crosswalks, and resources retain their source identity. */
export function crosswalkThreeBenchmarkSources(
  a: readonly CrosswalkObservation[],
  b: readonly CrosswalkObservation[],
  c: readonly CrosswalkObservation[],
  {
    maximumScoreError = MAXIMUM_SCORE_ERROR,
    normalizeScore = clamp01,
    sourceLabels = { a: "Source A", b: "Source B", c: "Source C" },
  }: {
    maximumScoreError?: number;
    normalizeScore?: (value: number) => number;
    sourceLabels?: SourceLabels & { c: string };
  } = {},
): CrosswalkObservation[] {
  const sources = [a, b, c] as const;
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  const fits = pairs.map(([left, right]) =>
    crosswalk(
      pairObservations(sources[left]!, sources[right]!),
      (row) => row.canonical_value,
      maximumScoreError,
    ),
  );
  const acceptedPairs = fits.map((fit) => fit.diagnostic.imputationAllowed);
  const offsets = fits.map((fit, index) => (acceptedPairs[index] ? fit.diagnostic.delta : null));
  const strict = tripleObservations(a, b, c);
  const observedRanges = pairs.map(([left, right]) =>
    [left, right].map((side) => {
      const values = strict.flatMap((triple) => {
        const value = triple.rows[side]?.canonical_value;
        return value != null && triple.rows[left] != null && triple.rows[right] != null
          ? [value]
          : [];
      });
      return { min: Math.min(...values), max: Math.max(...values) };
    }),
  );
  const validatedPatterns = validateThreeSourceCrosswalk(
    strict,
    pairs,
    acceptedPairs,
    maximumScoreError,
  );
  const defaults = tripleObservations(sourceDefaults(a), sourceDefaults(b), sourceDefaults(c));
  return [
    ...strict.flatMap((triple) => crosswalkTriple(triple, false)),
    ...defaults.flatMap((triple) => crosswalkTriple(triple, true)),
  ];

  function crosswalkTriple(triple: Triple, collapsed: boolean): CrosswalkObservation[] {
    const template = triple.rows.find((row) => row != null);
    if (template == null) return [];
    const observed = triple.rows.map((row) => row?.canonical_value ?? null);
    const estimated = observed.some((value) => value == null);
    const pattern = observed.reduce<number>(
      (mask, score, side) => mask | (score == null ? 0 : 1 << side),
      0,
    );
    if (estimated && !validatedPatterns.has(pattern)) return [];
    const projection = projectThreeScores(observed, offsets, pairs);
    if (projection == null) return [];
    const { projected, predictors } = projection;
    const extrapolated =
      estimated &&
      predictors.some(({ pair, side, value }) => {
        const [left] = pairs[pair]!;
        const range = observedRanges[pair]![side === left ? 0 : 1]!;
        return value < range.min || value > range.max;
      });
    const value = normalizeScore(projected.reduce((sum, score) => sum + score, 0) / 3);
    if (!Number.isFinite(value)) return [];
    const [sourceA, sourceB, sourceC] = triple.rows;
    const metadata: CrosswalkObservation["metadata"] = {
      fusion: true,
      fusion_collapsed: collapsed,
      fusion_crosswalk_applied: estimated,
      fusion_extrapolated: extrapolated,
      fusion_confidence: estimated
        ? extrapolated
          ? 0.5
          : 0.5 + 0.5 * Math.min(...predictors.map(({ pair }) => fits[pair]!.confidence ?? 0))
        : 1,
      source_a_url: sourceA?.source_url ?? null,
      source_b_url: sourceB?.source_url ?? null,
      source_c_url: sourceC?.source_url ?? null,
      source_a_label: sourceLabels.a,
      source_b_label: sourceLabels.b,
      source_c_label: sourceLabels.c,
      source_a_score: observed[0] ?? null,
      source_b_score: observed[1] ?? null,
      source_c_score: observed[2] ?? null,
      source_a_effort: sourceA?.metadata.source_effort ?? sourceA?.reasoning_effort ?? null,
      source_b_effort: sourceB?.metadata.source_effort ?? sourceB?.reasoning_effort ?? null,
      source_c_effort: sourceC?.metadata.source_effort ?? sourceC?.reasoning_effort ?? null,
      crosswalk_ab_offset: fits[0]!.diagnostic.delta,
      crosswalk_ac_offset: fits[1]!.diagnostic.delta,
      crosswalk_bc_offset: fits[2]!.diagnostic.delta,
      crosswalk_ab_error: fits[0]!.diagnostic.validationMedianAbsoluteError,
      crosswalk_ac_error: fits[1]!.diagnostic.validationMedianAbsoluteError,
      crosswalk_bc_error: fits[2]!.diagnostic.validationMedianAbsoluteError,
    };
    const fused: CrosswalkObservation = {
      benchmark_key: template.benchmark_key,
      source_url: template.source_url,
      model_id: null,
      model: collapsed ? template.base_model : template.model,
      base_model: template.base_model,
      reasoning_effort: collapsed ? null : triple.effort,
      model_creator: template.model_creator,
      rank: null,
      canonical_value: value,
      observed_at:
        triple.rows
          .map((row) => row?.observed_at)
          .filter((date): date is string => date != null)
          .sort()
          .at(-1) ?? null,
      metadata,
    };
    for (const key of RESOURCE_KEYS) {
      fused[key] = null;
      metadata[key] = null;
      metadata[`source_a_${key}`] = sourceA?.[key] ?? null;
      metadata[`source_b_${key}`] = sourceB?.[key] ?? null;
      metadata[`source_c_${key}`] = sourceC?.[key] ?? null;
      metadata[`fusion_${key}_comparable`] = false;
      metadata[`fusion_${key}_estimated`] = false;
      metadata[`fusion_${key}_confidence`] = 0;
    }
    return [fused];
  }
}

/** Check the final equal-thirds score under every supported missing-source pattern using only accepted routes and model-family-held-out offsets. */
function validateThreeSourceCrosswalk(
  triples: readonly Triple[],
  pairs: readonly [number, number][],
  acceptedPairs: readonly boolean[],
  maximumScoreError: number,
): ReadonlySet<number> {
  const validated = new Set<number>();
  const complete = triples.filter((triple) => triple.rows.every((row) => row != null));
  if (distinctModelCount(calibrationObservations(complete, () => 0)) < MINIMUM_MODELS)
    return validated;
  for (const observedSides of [[0], [1], [2], [0, 1], [0, 2], [1, 2]]) {
    const errors = calibrationObservations(complete, (heldOut) => {
      const training = triples.filter((triple) => triple.name !== heldOut.name);
      const offsets = pairs.map(([left, right], index) =>
        acceptedPairs[index]
          ? weightedMedianOfFinite(
              calibrationObservations(training, (triple) => {
                const a = triple.rows[left]?.canonical_value;
                const b = triple.rows[right]?.canonical_value;
                return a == null || b == null ? null : b - a;
              }),
            )
          : null,
      );
      const observed = heldOut.rows.map((row, side) =>
        observedSides.includes(side) ? row!.canonical_value : null,
      );
      const projection = projectThreeScores(observed, offsets, pairs);
      if (projection == null) return null;
      const measured = heldOut.rows.reduce((sum, row) => sum + row!.canonical_value, 0) / 3;
      const predicted = projection.projected.reduce((sum, score) => sum + score, 0) / 3;
      return Math.abs(predicted - measured);
    });
    if (distinctModelCount(errors) < MINIMUM_MODELS) continue;
    const medianError = weightedMedianOfFinite(errors);
    if (medianError != null && medianError <= maximumScoreError)
      validated.add(observedSides.reduce((mask, side) => mask | (1 << side), 0));
  }
  return validated;
}

/** Predict only missing sources from directly observed counterparts so a projected source never becomes its own evidence. */
function projectThreeScores(
  observed: readonly (number | null)[],
  offsets: readonly (number | null)[],
  pairs: readonly [number, number][],
): { projected: number[]; predictors: { pair: number; side: number; value: number }[] } | null {
  const projected: number[] = [];
  const predictors: { pair: number; side: number; value: number }[] = [];
  for (let target = 0; target < 3; target += 1) {
    const direct = observed[target];
    if (direct != null) {
      projected.push(direct);
      continue;
    }
    const predictions: number[] = [];
    for (let pair = 0; pair < pairs.length; pair += 1) {
      const [left, right] = pairs[pair]!;
      const offset = offsets[pair];
      if (offset == null) continue;
      const side = target === left ? right : target === right ? left : null;
      if (side == null || observed[side] == null) continue;
      const value = observed[side]!;
      predictions.push(value + (target === right ? offset : -offset));
      predictors.push({ pair, side, value });
    }
    if (predictions.length === 0) return null;
    projected.push(
      predictions.reduce((sum, prediction) => sum + prediction, 0) / predictions.length,
    );
  }
  return { projected, predictors };
}

function tripleObservations(
  a: readonly CrosswalkObservation[],
  b: readonly CrosswalkObservation[],
  c: readonly CrosswalkObservation[],
): Triple[] {
  const triples = new Map<string, Triple>();
  for (const [side, rows] of [
    [0, a],
    [1, b],
    [2, c],
  ] as const) {
    for (const row of rows) {
      const name = modelNameIdentityKey(row.base_model);
      const key = `${name}/${row.reasoning_effort ?? ""}`;
      const triple = triples.get(key) ?? {
        name,
        effort: row.reasoning_effort,
        rows: [null, null, null],
      };
      const current = triple.rows[side];
      if (current == null || row.canonical_value > current.canonical_value) triple.rows[side] = row;
      triples.set(key, triple);
    }
  }
  return [...triples.values()];
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
  value: (row: CrosswalkObservation) => number | null,
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
  a: readonly CrosswalkObservation[],
  b: readonly CrosswalkObservation[],
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

function sourceDefaults(rows: readonly CrosswalkObservation[]): CrosswalkObservation[] {
  const defaults = new Map<string, CrosswalkObservation>();
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
