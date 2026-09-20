/** Fixed-shrinkage resource fallback narrows global evidence through lab, release proximity, and same-model observations. */

import { indexPolicy } from "../../../benchmarks/index-policy";
import type { ScoringConfig } from "../../../config/stage";
import { canonicalModelKey, canonicalReasoningEffort } from "../../../identity/normalization";
import {
  clamp01,
  medianOfFinite,
  positiveFiniteNumber,
  weightedMedianOfFinite,
} from "../../../math-utils";
import type { ModelAtlasCandidate } from "../../model-types";
import {
  benchmarkMetricValue,
  benchmarkTaskMetrics,
  directBenchmarkTokens,
} from "../resource-metrics";
import {
  type ImputedTaskResource,
  resourceImputationKeys,
  type TaskResourceKind,
} from "./resource-evidence";

const LAB_SHRINKAGE = 16;
const LOCAL_SHRINKAGE = 4;
const MINIMUM_REFERENCE_MODELS = 2;
const RELEASE_PROXIMITY_DAYS = 60;
const MILLISECONDS_PER_DAY = 86_400_000;

type ReferenceModel = {
  modelKey: string;
  lab: string | null;
  releaseTime: number | null;
  ratios: Map<string, number>;
};
type Prior = {
  global: Map<string, number>;
  referenceModels: ReferenceModel[];
  residuals: { lab: string | null; releaseTime: number | null; value: number }[];
};

/** Prepare reusable external priors; every target model is excluded from its own reference population. */
export function prepareBroaderResourceEstimator(
  models: readonly ModelAtlasCandidate[],
  config: ScoringConfig,
  kind: TaskResourceKind,
): (
  target: ModelAtlasCandidate,
  source: ModelAtlasCandidate,
  key: string,
) => ImputedTaskResource | null {
  const keys = resourceImputationKeys(config, kind);
  const variantsByModel = new Map<string, Map<string, ModelAtlasCandidate>>();
  for (const model of models) {
    const effort = canonicalReasoningEffort(model.reasoning_effort);
    if (effort == null) continue;
    const modelKey = canonicalModelKey(model);
    const variants = variantsByModel.get(modelKey) ?? new Map<string, ModelAtlasCandidate>();
    if (!variants.has(effort)) variants.set(effort, model);
    variantsByModel.set(modelKey, variants);
  }
  const priors = new Map<string, Prior>();
  return (target, source, key) => {
    const modelKey = canonicalModelKey(target);
    const targetEffort = canonicalReasoningEffort(target.reasoning_effort);
    const sourceEffort = canonicalReasoningEffort(source.reasoning_effort);
    const sourceAmount = observedResource(source, key, kind);
    if (
      !keys.includes(key) ||
      modelKey !== canonicalModelKey(source) ||
      targetEffort == null ||
      sourceEffort == null ||
      targetEffort === sourceEffort ||
      sourceAmount == null
    )
      return null;
    const cacheKey = JSON.stringify([modelKey, targetEffort, sourceEffort]);
    let prior = priors.get(cacheKey);
    if (prior == null) {
      prior = buildPrior(variantsByModel, modelKey, targetEffort, sourceEffort, keys, kind);
      priors.set(cacheKey, prior);
    }
    const global = prior.global.get(key);
    if (global == null) return null;
    const lab =
      target.provider == null
        ? []
        : prior.residuals.filter((referenceModel) => referenceModel.lab === target.provider);
    const labDelta = shrink(
      lab.map((referenceModel) => referenceModel.value),
      0,
      LAB_SHRINKAGE,
    );
    const releaseTime = parsedReleaseTime(target.release_date);
    const neighbors = lab.flatMap((referenceModel) => {
      if (releaseTime == null || referenceModel.releaseTime == null) return [];
      const days = (referenceModel.releaseTime - releaseTime) / MILLISECONDS_PER_DAY;
      return [
        {
          value: referenceModel.value,
          weight: Math.exp(-0.5 * (days / RELEASE_PROXIMITY_DAYS) ** 2),
        },
      ];
    });
    const support = neighbors.reduce((sum, referenceModel) => sum + referenceModel.weight, 0);
    const nearbyMedian = weightedMedianOfFinite(neighbors);
    const releaseDelta =
      nearbyMedian == null
        ? labDelta
        : labDelta + (support / (support + LOCAL_SHRINKAGE)) * (nearbyMedian - labDelta);
    const own = keys.flatMap((otherKey) => {
      if (otherKey === key) return [];
      const targetAmount = observedResource(target, otherKey, kind);
      const anchorAmount = observedResource(source, otherKey, kind);
      const baseline = prior.global.get(otherKey);
      return targetAmount == null || anchorAmount == null || baseline == null
        ? []
        : [Math.log(targetAmount / anchorAmount) - baseline];
    });
    const logRatio = global + shrink(own, releaseDelta, LOCAL_SHRINKAGE);
    const ratios = prior.referenceModels.flatMap((referenceModel) => {
      const ratio = referenceModel.ratios.get(key);
      return ratio == null ? [] : [ratio];
    });
    const disagreement = medianOfFinite(ratios.map((ratio) => Math.abs(ratio - logRatio)));
    const evidenceFactor =
      disagreement == null
        ? 0
        : (ratios.length / (ratios.length + LOCAL_SHRINKAGE)) *
          clamp01(1 - disagreement / Math.LN2);
    const amount = positiveFiniteNumber(sourceAmount * Math.exp(logRatio));
    return amount == null || evidenceFactor <= 0 ? null : { amount, evidenceFactor };
  };
}

/** Each model contributes one transition ratio per benchmark and one median residual to its lab and release neighborhood. */
function buildPrior(
  variantsByModel: Map<string, Map<string, ModelAtlasCandidate>>,
  excluded: string,
  targetEffort: string,
  sourceEffort: string,
  keys: string[],
  kind: TaskResourceKind,
): Prior {
  const referenceModels: ReferenceModel[] = [];
  for (const [modelKey, variants] of variantsByModel) {
    if (modelKey === excluded) continue;
    const target = variants.get(targetEffort);
    const source = variants.get(sourceEffort);
    if (target == null || source == null) continue;
    const ratios = new Map<string, number>();
    for (const key of keys) {
      const a = observedResource(target, key, kind);
      const b = observedResource(source, key, kind);
      if (a != null && b != null) ratios.set(key, Math.log(a / b));
    }
    if (ratios.size)
      referenceModels.push({
        modelKey,
        lab: target.provider,
        releaseTime: parsedReleaseTime(target.release_date),
        ratios,
      });
  }
  const global = new Map<string, number>();
  for (const key of keys) {
    const values = referenceModels.flatMap((referenceModel) =>
      referenceModel.ratios.has(key) ? [referenceModel.ratios.get(key)!] : [],
    );
    if (values.length >= MINIMUM_REFERENCE_MODELS) global.set(key, medianOfFinite(values)!);
  }
  const residuals = referenceModels.flatMap((referenceModel) => {
    const values = [...referenceModel.ratios].flatMap(([key, ratio]) => {
      const peers = referenceModels.flatMap((peer) =>
        peer.modelKey !== referenceModel.modelKey && peer.ratios.has(key)
          ? [peer.ratios.get(key)!]
          : [],
      );
      return peers.length >= MINIMUM_REFERENCE_MODELS ? [ratio - medianOfFinite(peers)!] : [];
    });
    const value = medianOfFinite(values);
    return value == null
      ? []
      : [{ lab: referenceModel.lab, releaseTime: referenceModel.releaseTime, value }];
  });
  return { global, referenceModels, residuals };
}

/** External priors require measured quality and measured resources; throughput-derived time is confined to within-model ratios. */
function observedResource(
  model: ModelAtlasCandidate,
  key: string,
  kind: TaskResourceKind,
): number | null {
  if (kind === "tokens" || kind === "output_tokens")
    return benchmarkMetricValue(model, key) == null
      ? null
      : directBenchmarkTokens(model, indexPolicy(key)?.resources?.key ?? key, kind);
  return benchmarkMetricValue(model, key) == null
    ? null
    : positiveFiniteNumber(
        benchmarkTaskMetrics(model, key)?.[kind === "cost" ? "cost" : "seconds"],
      );
}

function shrink(values: number[], prior: number, strength: number): number {
  const center = medianOfFinite(values);
  return center == null
    ? prior
    : prior + (values.length / (values.length + strength)) * (center - prior);
}

/** Missing or invalid dates cannot support a release-neighborhood correction. */
function parsedReleaseTime(value: string | null): number | null {
  if (value == null) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
