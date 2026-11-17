/** Benchmark source crosswalks combine quality across exact efforts while keeping resource accounting source-specific unless amounts agree. */

import {
  calibrationObservations,
  distinctModelCount,
} from "../../benchmarks/calibration-population";
import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import { modelNameIdentityKey } from "../../identity";
import { reasoningEffortRank } from "../../identity/normalization";
import { clamp01, weightedMedianOfFinite } from "../../math-utils";

const RESOURCE_SOURCE_AGREEMENT_POLICY = {
  minimumModels: 10,
  minimumShare: 0.9,
  maximumRatio: 1.05,
} as const;

export type CrosswalkObservation = BenchmarkObservationRow & {
  seconds_per_task?: number | null;
  output_tokens_per_task?: number | null;
};

/** One model at one effort, holding each source's row in source order; `null` where a source has none. */
type SourceGroup = {
  name: string;
  effort: string | null;
  rows: (CrosswalkObservation | null)[];
};

/** Two source indexes, lower first; the pair's offset is the higher source's score minus the lower's. */
type SourcePair = readonly [number, number];

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

/**
 * Combine comparable quality series at equal weight.
 * Offsets are fitted on exact-effort overlap only, a missing source is filled only through validated pairwise crosswalks, and collapsed summaries select each source's highest reported effort without donating it to another variant.
 * Resources are compared between exactly two sources; with more, each keeps its source identity.
 */
export function crosswalkBenchmarkSources(
  inputs: readonly (readonly CrosswalkObservation[])[],
  {
    maximumScoreError = MAXIMUM_SCORE_ERROR,
    normalizeScore = clamp01,
    sourceLabels = inputs.map((_, source) => `Source ${sourceLetter(source).toUpperCase()}`),
    firstAloneWithoutOthers = false,
  }: {
    maximumScoreError?: number;
    normalizeScore?: (value: number) => number;
    /** One label per source, in source order. */
    sourceLabels?: readonly string[];
    /** While every other source has no rows at all, the first source's results stand unchanged as the benchmark's results instead of waiting for a crosswalk that cannot be fitted. */
    firstAloneWithoutOthers?: boolean;
  } = {},
): CrosswalkObservation[] {
  const sources = inputs.map(scoredConfigurations);
  const letters = sources.map((_, source) => sourceLetter(source));
  const pairs = sources.flatMap((_, lower) =>
    sources.slice(lower + 1).map((_, step): SourcePair => [lower, lower + 1 + step]),
  );
  // A single pair keeps the unqualified names: `crosswalk_offset` for two sources, `crosswalk_ab_offset` for the first pair of three.
  const pairNames = pairs.map(([lower, higher]) =>
    pairs.length === 1 ? "" : `${letters[lower]}${letters[higher]}_`,
  );
  const groups = groupObservations(sources);
  const firstAlone = firstAloneWithoutOthers && sources.slice(1).every((rows) => rows.length === 0);
  const fits = pairs.map((pair) => fitSourceOffset(groups, pair, maximumScoreError));
  const offsets = fits.map((fit) => (fit.accepted ? fit.offset : null));
  const observedRanges = pairs.map((pair) =>
    pair.map((source) => {
      const values = groups.flatMap((group) =>
        pair.every((member) => group.rows[member] != null)
          ? [group.rows[source]!.canonical_value]
          : [],
      );
      return { min: Math.min(...values), max: Math.max(...values) };
    }),
  );
  const validatedPatterns = validatedMissingPatterns(
    groups,
    sources.length,
    pairs,
    fits.map((fit) => fit.accepted),
    maximumScoreError,
  );
  const resourceAgreements =
    sources.length === 2
      ? new Map(RESOURCE_KEYS.map((key) => [key, resourceAgreement(groups, key)]))
      : null;
  const defaults = groupObservations(sources.map(sourceDefaults));
  return [
    ...groups.flatMap((group) => combineGroup(group, false)),
    ...defaults.flatMap((group) => combineGroup(group, true)),
  ];

  function combineGroup(group: SourceGroup, collapsed: boolean): CrosswalkObservation[] {
    const template = group.rows.find((row) => row != null);
    if (template == null) return [];
    const observed = group.rows.map((row) => row?.canonical_value ?? null);
    const crosswalkApplied = !firstAlone && observed.some((score) => score == null);
    const pattern = observed.reduce<number>(
      (mask, score, source) => mask | (score == null ? 0 : 1 << source),
      0,
    );
    if (crosswalkApplied && !validatedPatterns.has(pattern)) return [];
    const projection = firstAlone
      ? { projected: [template.canonical_value], predictors: [] }
      : projectScores(observed, offsets, pairs);
    if (projection == null) return [];
    const { projected, predictors } = projection;
    const score = projected.reduce((sum, value) => sum + value, 0) / projected.length;
    if (!Number.isFinite(score)) return [];
    const extrapolated =
      crosswalkApplied &&
      predictors.some(({ pair, source, value }) => {
        const range = observedRanges[pair]![pairs[pair]!.indexOf(source)]!;
        return value < range.min || value > range.max;
      });
    const metadata: CrosswalkObservation["metadata"] = {
      fusion: true,
      fusion_collapsed: collapsed,
      fusion_crosswalk_applied: crosswalkApplied,
      fusion_extrapolated: extrapolated,
      fusion_confidence: !crosswalkApplied
        ? 1
        : extrapolated
          ? 0.5
          : 0.5 + 0.5 * Math.min(...predictors.map(({ pair }) => fits[pair]!.confidence ?? 0)),
    };
    // Separate loops keep each field's keys together, which is the saved record's key order.
    for (const [source, letter] of letters.entries())
      metadata[`source_${letter}_url`] = group.rows[source]?.source_url ?? null;
    for (const [source, letter] of letters.entries())
      metadata[`source_${letter}_label`] = sourceLabels[source] ?? null;
    for (const [source, letter] of letters.entries())
      metadata[`source_${letter}_score`] = observed[source] ?? null;
    for (const [source, letter] of letters.entries()) {
      const row = group.rows[source];
      metadata[`source_${letter}_effort`] =
        row?.metadata.source_effort ?? row?.reasoning_effort ?? null;
    }
    for (const [pair, name] of pairNames.entries())
      metadata[`crosswalk_${name}offset`] = fits[pair]!.offset;
    for (const [pair, name] of pairNames.entries())
      metadata[`crosswalk_${name}error`] = fits[pair]!.validationMedianAbsoluteError;
    const combined: CrosswalkObservation = {
      benchmark_key: template.benchmark_key,
      source_url: template.source_url,
      model_id: null,
      model: collapsed ? template.base_model : template.model,
      base_model: template.base_model,
      reasoning_effort: collapsed ? null : group.effort,
      model_creator: template.model_creator,
      rank: null,
      canonical_value: normalizeScore(score),
      observed_at:
        group.rows
          .map((row) => row?.observed_at)
          .filter((date): date is string => date != null)
          .sort()
          .at(-1) ?? null,
      metadata,
    };
    for (const key of RESOURCE_KEYS) {
      const amounts = group.rows.map((row) => row?.[key] ?? null);
      const agreement = resourceAgreements?.get(key);
      // Sources that agree share one scale, so an amount only one of them reports stands as observed; a runtime still needs both, to confirm they time the same thing.
      let value: number | null = null;
      if (agreement?.comparable) {
        const [first, second] = amounts;
        if (first != null && second != null) {
          const [firstMeasure, secondMeasure] = group.rows.map((row) => row?.metadata.time_measure);
          if (
            key !== "seconds_per_task" ||
            (firstMeasure != null && firstMeasure === secondMeasure)
          )
            value = (first + second) / 2;
        } else if (key !== "seconds_per_task") value = first ?? second ?? null;
      }
      combined[key] = value;
      metadata[key] = value;
      for (const [source, letter] of letters.entries())
        metadata[`source_${letter}_${key}`] = amounts[source] ?? null;
      if (agreement == null) {
        metadata[`fusion_${key}_comparable`] = false;
        continue;
      }
      metadata[`fusion_${key}_accounting_compatible`] = agreement.accountingCompatible;
      metadata[`fusion_${key}_comparable`] = agreement.comparable;
      metadata[`fusion_${key}_paired_models`] = agreement.modelCount;
      metadata[`fusion_${key}_within_5_percent_share`] = agreement.withinToleranceShare;
    }
    return [combined];
  }
}

/** Source names in saved records are letters in source order: `0` → `"a"`, `2` → `"c"`. */
function sourceLetter(source: number): string {
  return String.fromCharCode(97 + source);
}

/**
 * The patterns of observed sources, as bit masks, from which the missing sources may be filled.
 * A pattern passes when the final equal-weight score, rebuilt from only those sources through accepted pairs with model-held-out offsets, stays within the error limit.
 * With a single pair, that pair's own held-out check is this same check, so it is not repeated.
 */
function validatedMissingPatterns(
  groups: readonly SourceGroup[],
  sourceCount: number,
  pairs: readonly SourcePair[],
  acceptedPairs: readonly boolean[],
  maximumScoreError: number,
): ReadonlySet<number> {
  const everySource = (1 << sourceCount) - 1;
  const patterns = Array.from({ length: everySource - 1 }, (_, index) => index + 1);
  if (pairs.length === 1) return new Set(acceptedPairs[0] ? patterns : []);
  const validated = new Set<number>();
  const complete = groups.filter((group) => group.rows.every((row) => row != null));
  if (distinctModelCount(calibrationObservations(complete, () => 0)) < MINIMUM_MODELS)
    return validated;
  for (const pattern of patterns) {
    const errors = calibrationObservations(complete, (heldOut) => {
      const training = groups.filter((group) => group.name !== heldOut.name);
      const offsets = pairs.map(([lower, higher], index) =>
        acceptedPairs[index]
          ? weightedMedianOfFinite(
              calibrationObservations(training, (group) => {
                const lowerScore = group.rows[lower]?.canonical_value;
                const higherScore = group.rows[higher]?.canonical_value;
                return lowerScore == null || higherScore == null ? null : higherScore - lowerScore;
              }),
            )
          : null,
      );
      const observed = heldOut.rows.map((row, source) =>
        pattern & (1 << source) ? row!.canonical_value : null,
      );
      const projection = projectScores(observed, offsets, pairs);
      if (projection == null) return null;
      const measured =
        heldOut.rows.reduce((sum, row) => sum + row!.canonical_value, 0) / sourceCount;
      const predicted = projection.projected.reduce((sum, score) => sum + score, 0) / sourceCount;
      return Math.abs(predicted - measured);
    });
    if (distinctModelCount(errors) < MINIMUM_MODELS) continue;
    const medianError = weightedMedianOfFinite(errors);
    if (medianError != null && medianError <= maximumScoreError) validated.add(pattern);
  }
  return validated;
}

/** Predict only missing sources from directly observed counterparts so a projected source never becomes its own evidence. */
function projectScores(
  observed: readonly (number | null)[],
  offsets: readonly (number | null)[],
  pairs: readonly SourcePair[],
): { projected: number[]; predictors: { pair: number; source: number; value: number }[] } | null {
  const projected: number[] = [];
  const predictors: { pair: number; source: number; value: number }[] = [];
  for (const [target, direct] of observed.entries()) {
    if (direct != null) {
      projected.push(direct);
      continue;
    }
    const predictions: number[] = [];
    for (const [pair, [lower, higher]] of pairs.entries()) {
      const offset = offsets[pair];
      if (offset == null) continue;
      const source = target === lower ? higher : target === higher ? lower : null;
      if (source == null || observed[source] == null) continue;
      const value = observed[source]!;
      predictions.push(value + (target === higher ? offset : -offset));
      predictors.push({ pair, source, value });
    }
    if (predictions.length === 0) return null;
    projected.push(
      predictions.reduce((sum, prediction) => sum + prediction, 0) / predictions.length,
    );
  }
  return { projected, predictors };
}

/** Raw resources can share a scale only when model-balanced matched amounts of the two sources agree before fitting or rescaling. */
function resourceAgreement(
  groups: readonly SourceGroup[],
  key: (typeof RESOURCE_KEYS)[number],
): ResourceAgreement {
  const positiveOverlap = groups.filter((group) =>
    group.rows.every((row) => {
      const amount = row?.[key];
      return amount != null && amount > 0;
    }),
  );
  const accountingCompatible =
    key !== "seconds_per_task" ||
    positiveOverlap.every(({ rows: [first, second] }) => {
      const measure = first?.metadata.time_measure;
      return measure != null && measure === second?.metadata.time_measure;
    });
  const byModel = new Map<string, SourceGroup[]>();
  for (const group of positiveOverlap) {
    const modelGroups = byModel.get(group.name) ?? [];
    modelGroups.push(group);
    byModel.set(group.name, modelGroups);
  }
  let agreeingWeight = 0;
  for (const modelGroups of byModel.values()) {
    const groupWeight = 1 / modelGroups.length;
    for (const { rows } of modelGroups) {
      const amounts = rows.map((row) => row![key]!);
      if (
        Math.max(...amounts) / Math.min(...amounts) <=
        RESOURCE_SOURCE_AGREEMENT_POLICY.maximumRatio
      ) {
        agreeingWeight += groupWeight;
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

/** Fit one pair's model-held-out additive offset; filling either source from the other moves the two-source mean by half the offset's error, which is what the limit bounds. */
function fitSourceOffset(
  groups: readonly SourceGroup[],
  [lower, higher]: SourcePair,
  maximumMedianAbsoluteError: number,
) {
  const differences = calibrationObservations(groups, (group) => {
    const lowerScore = group.rows[lower]?.canonical_value;
    const higherScore = group.rows[higher]?.canonical_value;
    return lowerScore == null || higherScore == null ? null : higherScore - lowerScore;
  });
  const overlapModelCount = distinctModelCount(differences);
  const offset = weightedMedianOfFinite(differences);
  const validationErrorByGroup = new Map<SourceGroup, number>();
  for (const difference of differences) {
    const heldOutOffset = weightedMedianOfFinite(
      differences.filter((candidate) => candidate.modelKey !== difference.modelKey),
    );
    if (heldOutOffset != null) {
      validationErrorByGroup.set(difference.item, Math.abs(difference.value - heldOutOffset) / 2);
    }
  }
  const validationErrors = calibrationObservations(
    groups,
    (group) => validationErrorByGroup.get(group) ?? null,
  );
  const validationModelCount = distinctModelCount(validationErrors);
  const validationMedianAbsoluteError = weightedMedianOfFinite(validationErrors);
  const accepted =
    maximumMedianAbsoluteError > 0 &&
    overlapModelCount >= MINIMUM_MODELS &&
    validationModelCount >= MINIMUM_MODELS &&
    offset != null &&
    validationMedianAbsoluteError != null &&
    validationMedianAbsoluteError <= maximumMedianAbsoluteError;
  return {
    offset,
    validationMedianAbsoluteError,
    accepted,
    confidence: accepted
      ? clamp01(1 - (validationMedianAbsoluteError ?? 0) / maximumMedianAbsoluteError)
      : null,
  };
}

/** Conflicting configurations of one model and effort are not scored, so none may be picked as that model's result or shape a fit. */
function scoredConfigurations(rows: readonly CrosswalkObservation[]): CrosswalkObservation[] {
  return rows.filter((row) => row.metadata.assignment_eligible !== false);
}

/** Model names reconcile through the shared provider-neutral identity vocabulary; efforts remain separate keys. */
function groupObservations(sources: readonly (readonly CrosswalkObservation[])[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const [source, rows] of sources.entries()) {
    for (const row of rows) {
      const name = modelNameIdentityKey(row.base_model);
      const key = `${name}/${row.reasoning_effort ?? ""}`;
      const group = groups.get(key) ?? {
        name,
        effort: row.reasoning_effort,
        rows: sources.map(() => null),
      };
      const current = group.rows[source];
      if (current == null || row.canonical_value > current.canonical_value)
        group.rows[source] = row;
      groups.set(key, group);
    }
  }
  return [...groups.values()];
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
