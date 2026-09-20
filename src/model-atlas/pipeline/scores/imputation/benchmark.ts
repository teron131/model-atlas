/** Benchmark imputation learns and validates contextual predictions from direct evidence while retaining separate evidence-factor and observation maps. */

import {
  calibrationObservations,
  distinctModelCount,
} from "../../../benchmarks/calibration-population";
import type { BenchmarkDimension } from "../../../benchmarks/factory";
import { BENCHMARK_CATALOG, benchmarkDimensionWeight } from "../../../benchmarks/registry";
import { MAX_NORMALIZED_IMPUTATION_ERROR, type ScoringConfig } from "../../../config/stage";
import { canonicalModelKey, canonicalReasoningEffort } from "../../../identity/normalization";
import {
  clamp01,
  weightedFinitePartCount,
  weightedMeanOfFinite,
  weightedMedianOfFinite,
  weightedQuantile,
  weightedQuantileRank,
} from "../../../math-utils";
import type { JsonObject } from "../../../runtime";
import { type MinMaxRange, minMaxScale } from "../normalization";
import {
  buildQualityScoringContext,
  normalizedMetricValue,
  observedRangesByBenchmark,
  type QualityScoringContext,
} from "../quality-context";
import { benchmarkFusionEstimate, benchmarkMetricValue } from "../resource-metrics";

export type BenchmarkImputationByModel = ReadonlyMap<JsonObject, ReadonlyMap<string, number>>;

export type BenchmarkImputationFactorsByModel = ReadonlyMap<
  JsonObject,
  ReadonlyMap<string, number>
>;

type BenchmarkImputationDiagnostic = {
  validationSampleCount: number;
  distinctModelCount: number;
  normalizedMedianAbsoluteError: number | null;
  normalizedBaselineMedianAbsoluteError: number | null;
  imputationAllowed: boolean;
};

type BenchmarkScoringModelIdentity = {
  id?: unknown;
  name?: unknown;
  reasoning_effort?: unknown;
};

type BenchmarkScoringModel = BenchmarkScoringModelIdentity & {
  benchmarks?: unknown;
  intelligence?: unknown;
};

export type BenchmarkScoringPreparation = {
  imputationByModel: BenchmarkImputationByModel;
  imputationFactorsByModel: BenchmarkImputationFactorsByModel;
  imputationByVariant: ReadonlyMap<string, ReadonlyMap<string, number>>;
  imputationFactorsByVariant: ReadonlyMap<string, ReadonlyMap<string, number>>;
  qualityContext: QualityScoringContext;
};

type MutableImputationMaps = {
  imputationByModel: Map<JsonObject, Map<string, number>>;
  imputationFactorsByModel: Map<JsonObject, Map<string, number>>;
};

type ImputationPreparation = MutableImputationMaps & {
  imputationDiagnosticsByKey: Map<string, BenchmarkImputationDiagnostic>;
};

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_MODELS = 3;
const MIN_IMPUTATION_VALIDATION_MODELS = 4;
const IMPUTATION_DIMENSIONS = ["intelligence", "agentic"] as const;

function scoringVariantKey(model: BenchmarkScoringModelIdentity): string {
  return `${canonicalModelKey(model)}\u0000${canonicalReasoningEffort(model.reasoning_effort) ?? ""}`;
}

/** Resolve prepared benchmark values after candidate and public-model projection replace row identity. */
export function benchmarkImputationValues(
  preparation: BenchmarkScoringPreparation,
  model: BenchmarkScoringModelIdentity,
): ReadonlyMap<string, number> | undefined {
  return (
    preparation.imputationByModel.get(model as JsonObject) ??
    preparation.imputationByVariant.get(scoringVariantKey(model))
  );
}

/** Resolve prepared benchmark evidence factors after candidate and public-model projection replace row identity. */
export function benchmarkImputationFactors(
  preparation: BenchmarkScoringPreparation,
  model: BenchmarkScoringModelIdentity,
): ReadonlyMap<string, number> | undefined {
  return (
    preparation.imputationFactorsByModel.get(model as JsonObject) ??
    preparation.imputationFactorsByVariant.get(scoringVariantKey(model))
  );
}

/** Remove generic benchmark estimates for rows whose direct evidence must stand on its own. */
export function withoutBenchmarkImputationForModels(
  preparation: BenchmarkScoringPreparation,
  models: readonly BenchmarkScoringModelIdentity[],
): BenchmarkScoringPreparation {
  const modelSet = new Set(models as readonly JsonObject[]);
  const variantKeys = new Set(models.map(scoringVariantKey));
  return {
    ...preparation,
    imputationByModel: new Map(
      [...preparation.imputationByModel].filter(([model]) => !modelSet.has(model)),
    ),
    imputationFactorsByModel: new Map(
      [...preparation.imputationFactorsByModel].filter(([model]) => !modelSet.has(model)),
    ),
    imputationByVariant: new Map(
      [...preparation.imputationByVariant].filter(([key]) => !variantKeys.has(key)),
    ),
    imputationFactorsByVariant: new Map(
      [...preparation.imputationFactorsByVariant].filter(([key]) => !variantKeys.has(key)),
    ),
  };
}

/** Resolve direct or prepared benchmark quality together with its scoring evidence weight. */
export function benchmarkQualityEvidence(
  model: BenchmarkScoringModel,
  key: string,
  preparation?: BenchmarkScoringPreparation,
): { evidenceFactor: number; value: number } | null {
  const direct = benchmarkMetricValue(model, key);
  if (direct != null) {
    return { evidenceFactor: 1, value: direct };
  }
  const fusion = benchmarkFusionEstimate(model, key);
  if (fusion != null) return fusion;
  if (preparation == null) {
    return null;
  }
  const value = benchmarkImputationValues(preparation, model)?.get(key) ?? null;
  const evidenceFactor = benchmarkImputationFactors(preparation, model)?.get(key) ?? null;
  return value == null || evidenceFactor == null || evidenceFactor <= 0
    ? null
    : { evidenceFactor: clamp01(evidenceFactor), value };
}

type DimensionBenchmarkContext = {
  benchmarkKeys: readonly string[];
  benchmarkWeights: ReadonlyMap<string, number>;
};

function observedEvidenceSupport(
  model: JsonObject,
  benchmarkKeys: readonly string[],
  benchmarkWeights: ReadonlyMap<string, number>,
  excludedBenchmarkKey: string | null,
): number {
  let observedWeight = 0;
  let possibleWeight = 0;
  for (const key of benchmarkKeys) {
    if (key === excludedBenchmarkKey) {
      continue;
    }
    const weight = benchmarkWeights.get(key) ?? 0;
    if (!(weight > 0)) {
      continue;
    }
    possibleWeight += weight;
    if (benchmarkMetricValue(model, key) != null) {
      observedWeight += weight;
    }
  }
  return possibleWeight > 0 ? observedWeight / possibleWeight : 0;
}

function observedNormalizedEvidenceScore(
  model: JsonObject,
  benchmarkKeys: readonly string[],
  benchmarkWeights: ReadonlyMap<string, number>,
  excludedBenchmarkKey: string | null,
  rangesByKey: ReadonlyMap<string, MinMaxRange | null>,
  minimumEvidenceValues = MIN_IMPUTATION_EVIDENCE_VALUES,
): number | null {
  const parts = benchmarkKeys
    .filter((key) => key !== excludedBenchmarkKey)
    .map((key) => ({
      value: normalizedMetricValue(rangesByKey, key, benchmarkMetricValue(model, key)),
      weight: benchmarkWeights.get(key) ?? 0,
    }));
  return weightedFinitePartCount(parts) >= minimumEvidenceValues
    ? weightedMeanOfFinite(parts)
    : null;
}

/** Resolve one dimension's selected benchmarks and effective weights for imputation context. */
function dimensionBenchmarkContext(
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
): DimensionBenchmarkContext {
  const benchmarkKeys =
    dimension === "intelligence"
      ? scoringConfig.intelligenceBenchmarkKeys
      : scoringConfig.agenticBenchmarkKeys;
  return {
    benchmarkKeys,
    benchmarkWeights: new Map(
      benchmarkKeys.map(
        (key) =>
          [
            key,
            benchmarkDimensionWeight(key, dimension, scoringConfig.benchmarkPortfolio),
          ] as const,
      ),
    ),
  };
}

/** Convert held-out normalized error into partial evidence credit for a validated prediction. */
function imputationEvidenceFactor(diagnostic: BenchmarkImputationDiagnostic): number {
  const normalizedError = diagnostic.normalizedMedianAbsoluteError;
  if (!diagnostic.imputationAllowed || normalizedError == null) {
    return 0;
  }
  return clamp01(1 - normalizedError / MAX_NORMALIZED_IMPUTATION_ERROR);
}

type ContextualPrediction = {
  contextSupport: number;
  value: number;
};

/** Build one dimension-specific predictor from observed context and target values only. */
function buildDimensionPredictor(
  models: JsonObject[],
  targetBenchmarkKey: string,
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
  rangesByKey: ReadonlyMap<string, MinMaxRange | null>,
  minimumEvidenceValues: number,
): ((model: JsonObject) => ContextualPrediction | null) | null {
  const { benchmarkKeys, benchmarkWeights } = dimensionBenchmarkContext(dimension, scoringConfig);
  const referenceContextScores = calibrationObservations(models, (model) => {
    if (benchmarkMetricValue(model, targetBenchmarkKey) == null) {
      return null;
    }
    return observedNormalizedEvidenceScore(
      model,
      benchmarkKeys,
      benchmarkWeights,
      targetBenchmarkKey,
      rangesByKey,
      minimumEvidenceValues,
    );
  });
  const targetObservations = referenceContextScores.map((observation) => ({
    ...observation,
    value: benchmarkMetricValue(observation.item, targetBenchmarkKey) as number,
  }));
  if (distinctModelCount(referenceContextScores) < MIN_IMPUTATION_REFERENCE_MODELS) {
    return null;
  }
  return (model) => {
    const contextScore = observedNormalizedEvidenceScore(
      model,
      benchmarkKeys,
      benchmarkWeights,
      targetBenchmarkKey,
      rangesByKey,
      minimumEvidenceValues,
    );
    if (contextScore == null) {
      return null;
    }
    const percentile = weightedQuantileRank(referenceContextScores, contextScore);
    const value =
      percentile == null ? null : weightedQuantile(targetObservations, percentile / 100);
    return value == null
      ? null
      : {
          contextSupport: observedEvidenceSupport(
            model,
            benchmarkKeys,
            benchmarkWeights,
            targetBenchmarkKey,
          ),
          value,
        };
  };
}

type WeightedBenchmarkPredictor = {
  predict: ((model: JsonObject) => ContextualPrediction | null) | null;
  weight: number;
};

function buildWeightedPredictors(
  models: JsonObject[],
  targetBenchmarkKey: string,
  scoringConfig: ScoringConfig,
  rangesByKey: ReadonlyMap<string, MinMaxRange | null>,
  minimumEvidenceValues: number,
): WeightedBenchmarkPredictor[] {
  const portfolioEntry = scoringConfig.benchmarkPortfolio[targetBenchmarkKey];
  if (portfolioEntry == null) {
    return [];
  }
  return IMPUTATION_DIMENSIONS.map((dimension) => ({
    predict:
      portfolioEntry.dimensionLoadings[dimension] > 0
        ? buildDimensionPredictor(
            models,
            targetBenchmarkKey,
            dimension,
            scoringConfig,
            rangesByKey,
            minimumEvidenceValues,
          )
        : null,
    weight: portfolioEntry.dimensionLoadings[dimension],
  }));
}

function predictedBenchmarkValue(
  model: JsonObject,
  predictors: readonly WeightedBenchmarkPredictor[],
): ContextualPrediction | null {
  const predictions = predictors.map(({ predict, weight }) => ({
    prediction: predict?.(model) ?? null,
    weight,
  }));
  const value = weightedMeanOfFinite(
    predictions.map(({ prediction, weight }) => ({
      value: prediction?.value ?? null,
      weight,
    })),
  );
  const contextSupport = weightedMeanOfFinite(
    predictions.map(({ prediction, weight }) => ({
      value: prediction?.contextSupport ?? null,
      weight,
    })),
  );
  return value == null || contextSupport == null ? null : { contextSupport, value };
}

/** Validate one benchmark's imputer while withholding every variant of the observed model. */
function imputationDiagnostic(
  models: JsonObject[],
  benchmarkKeys: readonly string[],
  targetBenchmarkKey: string,
  scoringConfig: ScoringConfig,
  minimumEvidenceValues: number,
): BenchmarkImputationDiagnostic {
  const normalizedAbsoluteErrorByModel = new Map<JsonObject, number>();
  const baselineErrorByModel = new Map<JsonObject, number>();
  const modelKeyByModel = new Map(
    models.map((model) => [model, canonicalModelKey(model)] as const),
  );
  const calibrationByHeldOutModel = new Map<
    string,
    {
      predictors: WeightedBenchmarkPredictor[];
      targetRange: MinMaxRange | null;
      baseline: number | null;
    }
  >();
  for (const heldOutModel of models) {
    const actualValue = benchmarkMetricValue(heldOutModel, targetBenchmarkKey);
    if (actualValue == null) {
      continue;
    }
    const heldOutModelKey = modelKeyByModel.get(heldOutModel)!;
    let calibration = calibrationByHeldOutModel.get(heldOutModelKey);
    if (calibration == null) {
      const trainingModels = models.filter(
        (model) => modelKeyByModel.get(model) !== heldOutModelKey,
      );
      const trainingRangesByKey = observedRangesByBenchmark(trainingModels, benchmarkKeys);
      calibration = {
        predictors: buildWeightedPredictors(
          trainingModels,
          targetBenchmarkKey,
          scoringConfig,
          trainingRangesByKey,
          minimumEvidenceValues,
        ),
        targetRange: trainingRangesByKey.get(targetBenchmarkKey) ?? null,
        baseline: weightedMedianOfFinite(
          calibrationObservations(trainingModels, (model) =>
            benchmarkMetricValue(model, targetBenchmarkKey),
          ),
        ),
      };
      calibrationByHeldOutModel.set(heldOutModelKey, calibration);
    }
    const prediction = predictedBenchmarkValue(heldOutModel, calibration.predictors);
    const normalizedPrediction = minMaxScale(calibration.targetRange, prediction?.value ?? null);
    const normalizedActual = minMaxScale(calibration.targetRange, actualValue);
    if (normalizedPrediction == null || normalizedActual == null) {
      continue;
    }
    normalizedAbsoluteErrorByModel.set(
      heldOutModel,
      Math.abs(normalizedPrediction - normalizedActual),
    );
    const normalizedBaseline = minMaxScale(calibration.targetRange, calibration.baseline);
    if (normalizedBaseline != null)
      baselineErrorByModel.set(heldOutModel, Math.abs(normalizedBaseline - normalizedActual));
  }
  const validationErrors = calibrationObservations(
    models,
    (model) => normalizedAbsoluteErrorByModel.get(model) ?? null,
  );
  const normalizedMedianAbsoluteError = weightedMedianOfFinite(validationErrors);
  const validationModelCount = distinctModelCount(validationErrors);
  return {
    validationSampleCount: validationErrors.length,
    distinctModelCount: validationModelCount,
    normalizedMedianAbsoluteError,
    normalizedBaselineMedianAbsoluteError: weightedMedianOfFinite(
      calibrationObservations(models, (model) => baselineErrorByModel.get(model) ?? null),
    ),
    imputationAllowed:
      validationModelCount >= MIN_IMPUTATION_VALIDATION_MODELS &&
      normalizedMedianAbsoluteError != null &&
      normalizedMedianAbsoluteError <= MAX_NORMALIZED_IMPUTATION_ERROR,
  };
}

/** Calibrate selected targets from observed peer evidence with family-held-out validation; an explicit query cohort is projected without changing training ranges or validation. */
export function prepareBenchmarkImputation(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
  targetKeys?: readonly string[],
  minimumEvidenceValues = MIN_IMPUTATION_EVIDENCE_VALUES,
  queryModels = models,
): ImputationPreparation {
  const benchmarkKeys = [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ];
  const imputationByModel = new Map<JsonObject, Map<string, number>>();
  const imputationFactorsByModel = new Map<JsonObject, Map<string, number>>();
  const diagnosticsByKey = new Map<string, BenchmarkImputationDiagnostic>();
  const rangesByKey = observedRangesByBenchmark(models, benchmarkKeys);
  for (const key of targetKeys ?? benchmarkKeys) {
    const portfolioEntry = scoringConfig.benchmarkPortfolio[key];
    if (portfolioEntry == null) {
      continue;
    }
    const imputationPolicy =
      BENCHMARK_CATALOG[key as keyof typeof BENCHMARK_CATALOG]?.scoring.imputation;
    if (imputationPolicy != null && imputationPolicy.kind !== "contextual") {
      continue;
    }
    const diagnostic = imputationDiagnostic(
      models,
      benchmarkKeys,
      key,
      scoringConfig,
      minimumEvidenceValues,
    );
    diagnosticsByKey.set(key, diagnostic);
    if (!diagnostic.imputationAllowed) {
      continue;
    }
    const predictors = buildWeightedPredictors(
      models,
      key,
      scoringConfig,
      rangesByKey,
      minimumEvidenceValues,
    );
    for (const model of queryModels) {
      if (benchmarkMetricValue(model, key) != null || imputationByModel.get(model)?.has(key)) {
        continue;
      }
      const prediction = predictedBenchmarkValue(model, predictors);
      if (prediction == null) {
        continue;
      }
      if (!Number.isFinite(prediction.value)) {
        continue;
      }
      const imputedValuesByKey = imputationByModel.get(model) ?? new Map<string, number>();
      imputedValuesByKey.set(key, prediction.value);
      imputationByModel.set(model, imputedValuesByKey);
      const factorsByKey = imputationFactorsByModel.get(model) ?? new Map<string, number>();
      factorsByKey.set(key, imputationEvidenceFactor(diagnostic) * prediction.contextSupport);
      imputationFactorsByModel.set(model, factorsByKey);
    }
  }
  return {
    imputationByModel,
    imputationFactorsByModel,
    imputationDiagnosticsByKey: diagnosticsByKey,
  };
}

/** Precompute one benchmark-owned imputation from observed evidence only; source fields stay nullable. */
export function buildBenchmarkImputationByModel(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
  return prepareBenchmarkImputation(models, scoringConfig).imputationByModel;
}

/** Report leave-one-model-out reliability evidence for every selected benchmark imputer. */
export function buildBenchmarkImputationDiagnosticsByKey(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): Map<string, BenchmarkImputationDiagnostic> {
  return prepareBenchmarkImputation(models, scoringConfig).imputationDiagnosticsByKey;
}

/** Prepare benchmark imputations and quality normalization context in dependency order. */
export function prepareBenchmarkScoring(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): BenchmarkScoringPreparation {
  const { imputationByModel, imputationFactorsByModel } = prepareBenchmarkImputation(
    models,
    scoringConfig,
  );
  const qualityContext = buildQualityScoringContext(models, scoringConfig);
  const imputationByVariant = new Map<string, ReadonlyMap<string, number>>();
  const imputationFactorsByVariant = new Map<string, ReadonlyMap<string, number>>();
  for (const model of models) {
    const key = scoringVariantKey(model);
    const values = imputationByModel.get(model);
    const factorsByKey = imputationFactorsByModel.get(model);
    if (values != null) {
      imputationByVariant.set(key, values);
    }
    if (factorsByKey != null) {
      imputationFactorsByVariant.set(key, factorsByKey);
    }
  }
  return {
    imputationByModel,
    imputationFactorsByModel,
    imputationByVariant,
    imputationFactorsByVariant,
    qualityContext,
  };
}
