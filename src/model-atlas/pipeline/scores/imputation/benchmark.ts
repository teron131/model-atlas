/** Benchmark imputation and quality normalization context for Model Atlas scoring. */

import {
  calibrationObservations,
  effectiveModelCount,
} from "../../../benchmarks/calibration-population";
import type { BenchmarkDimension } from "../../../benchmarks/factory";
import {
  BENCHMARK_CATALOG,
  benchmarkDimensionWeight,
  INDEX_BENCHMARK_KEYS,
} from "../../../benchmarks/registry";
import { buildAdditiveSourceCrosswalk } from "../../../benchmarks/source-crosswalk";
import { MAX_NORMALIZED_IMPUTATION_ERROR, type ScoringConfig } from "../../../config/stage";
import {
  canonicalModelKey,
  canonicalReasoningEffort,
  reasoningEffortRank,
} from "../../../identity/normalization";
import {
  clamp,
  clamp01,
  mapFiniteNumbers,
  weightedFinitePartCount,
  weightedMeanOfFinite,
  weightedMedianOfFinite,
  weightedQuantile,
  weightedQuantileRank,
} from "../../../numeric";
import { asFiniteNumber, asRecord, type JsonObject } from "../../../runtime";
import { clampScore, minMaxScale } from "../normalization";
import { benchmarkMetricValue } from "../resource-metrics";

export type BenchmarkImputationByModel = ReadonlyMap<JsonObject, ReadonlyMap<string, number>>;

export type BenchmarkImputationConfidenceByModel = ReadonlyMap<
  JsonObject,
  ReadonlyMap<string, number>
>;

export type QualityIndexAnchor = {
  score: number;
  confidence: number;
};

type ModelQualityIndexAnchor = QualityIndexAnchor & {
  representativeVariantKey: string;
};

type BenchmarkImputationDiagnostic = {
  validationSampleCount: number;
  effectiveModelCount: number;
  normalizedMedianAbsoluteError: number | null;
  imputationAllowed: boolean;
};

export type QualityScoringContext = {
  benchmarkValuesByKey: ReadonlyMap<string, readonly number[]>;
  indexAnchorsByModel: ReadonlyMap<
    string,
    Readonly<Partial<Record<BenchmarkDimension, ModelQualityIndexAnchor>>>
  >;
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
  imputationConfidenceByModel: BenchmarkImputationConfidenceByModel;
  imputationByVariant: ReadonlyMap<string, ReadonlyMap<string, number>>;
  imputationConfidenceByVariant: ReadonlyMap<string, ReadonlyMap<string, number>>;
  qualityContext: QualityScoringContext;
};

type MutableImputationMaps = {
  imputationByModel: Map<JsonObject, Map<string, number>>;
  imputationConfidenceByModel: Map<JsonObject, Map<string, number>>;
};

type ImputationPreparation = MutableImputationMaps & {
  imputationDiagnosticsByKey: Map<string, BenchmarkImputationDiagnostic>;
};

const MIN_IMPUTATION_EVIDENCE_VALUES = 3;
const MIN_IMPUTATION_REFERENCE_MODELS = 3;
const MIN_IMPUTATION_VALIDATION_MODELS = 4;
const IMPUTATION_DIMENSIONS = ["intelligence", "agentic"] as const;
const INDEX_BENCHMARK_KEY_SET = new Set<string>(INDEX_BENCHMARK_KEYS);
const APEX_AGENTS_KEY = "apex_agents";
const apexImputationPolicy = (() => {
  const policy = BENCHMARK_CATALOG.apex_agents.scoring.imputation;
  if (policy.kind !== "additive_crosswalk") {
    throw new Error("APEX Agents requires additive crosswalk configuration");
  }
  return policy;
})();

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

/** Resolve prepared benchmark confidence after candidate and public-model projection replace row identity. */
export function benchmarkImputationConfidence(
  preparation: BenchmarkScoringPreparation,
  model: BenchmarkScoringModelIdentity,
): ReadonlyMap<string, number> | undefined {
  return (
    preparation.imputationConfidenceByModel.get(model as JsonObject) ??
    preparation.imputationConfidenceByVariant.get(scoringVariantKey(model))
  );
}

/** Resolve a validated aggregate-index anchor that may reduce sparse quality regularization. */
export function qualityIndexAnchor(
  context: QualityScoringContext,
  model: BenchmarkScoringModelIdentity,
  dimension: BenchmarkDimension,
): QualityIndexAnchor | null {
  const anchor = context.indexAnchorsByModel.get(canonicalModelKey(model))?.[dimension];
  return anchor?.representativeVariantKey === scoringVariantKey(model) ? anchor : null;
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
    imputationConfidenceByModel: new Map(
      [...preparation.imputationConfidenceByModel].filter(([model]) => !modelSet.has(model)),
    ),
    imputationByVariant: new Map(
      [...preparation.imputationByVariant].filter(([key]) => !variantKeys.has(key)),
    ),
    imputationConfidenceByVariant: new Map(
      [...preparation.imputationConfidenceByVariant].filter(([key]) => !variantKeys.has(key)),
    ),
  };
}

/** Resolve direct or prepared benchmark quality together with its scoring evidence weight. */
export function benchmarkQualityEvidence(
  model: BenchmarkScoringModel,
  key: string,
  preparation?: BenchmarkScoringPreparation,
): { confidence: number; value: number } | null {
  const direct = benchmarkMetricValue(model, key);
  if (direct != null) {
    return { confidence: 1, value: direct };
  }
  if (preparation == null) {
    return null;
  }
  const value = benchmarkImputationValues(preparation, model)?.get(key) ?? null;
  const confidence = benchmarkImputationConfidence(preparation, model)?.get(key) ?? null;
  return value == null || confidence == null || confidence <= 0
    ? null
    : { confidence: clamp01(confidence), value };
}

type DimensionBenchmarkContext = {
  benchmarkKeys: readonly string[];
  benchmarkWeights: ReadonlyMap<string, number>;
};

type TaskQualityContext = {
  benchmarkKeys: readonly string[];
  benchmarkWeights: ReadonlyMap<string, number>;
  minimumObservedWeight: number;
  valuesByKey: ReadonlyMap<string, readonly number[]>;
};

function buildMercorApexImputation(models: JsonObject[]): MutableImputationMaps {
  const projectionClamp = apexImputationPolicy.clamp;
  const crosswalk = buildAdditiveSourceCrosswalk(models, {
    primaryValue: (model) => benchmarkMetricValue(model, APEX_AGENTS_KEY),
    fallbackValue: (model) =>
      asFiniteNumber(
        asRecord(asRecord(model.scoring_sources)[apexImputationPolicy.fallbackEvidenceKey]).score,
      ),
    minimumEffectiveModels: apexImputationPolicy.minimumModels,
    maximumMedianAbsoluteError: apexImputationPolicy.maximumMedianAbsoluteError,
    ...(projectionClamp == null
      ? {}
      : {
          normalizeProjection: (value: number) =>
            clamp(value, projectionClamp[0], projectionClamp[1]),
        }),
  });
  const imputationByModel = new Map<JsonObject, Map<string, number>>();
  const imputationConfidenceByModel = new Map<JsonObject, Map<string, number>>();
  if (crosswalk.confidence != null) {
    for (const [model, projection] of crosswalk.projectionByItem) {
      imputationByModel.set(model, new Map([[APEX_AGENTS_KEY, projection]]));
      imputationConfidenceByModel.set(model, new Map([[APEX_AGENTS_KEY, crosswalk.confidence]]));
    }
  }
  return {
    imputationByModel,
    imputationConfidenceByModel,
  };
}

export function normalizedMetricValue(
  valuesByKey: ReadonlyMap<string, readonly number[]>,
  key: string,
  value: number | null,
): number | null {
  const normalized = minMaxScale(valuesByKey.get(key) ?? [], value);
  return normalized == null ? null : clampScore(normalized);
}

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
  valuesByKey: ReadonlyMap<string, readonly number[]>,
): number | null {
  const parts = benchmarkKeys
    .filter((key) => key !== excludedBenchmarkKey)
    .map((key) => ({
      value: normalizedMetricValue(valuesByKey, key, benchmarkMetricValue(model, key)),
      weight: benchmarkWeights.get(key) ?? 0,
    }));
  return weightedFinitePartCount(parts) >= MIN_IMPUTATION_EVIDENCE_VALUES
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

function taskQualityContext(
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
  valuesByKey: ReadonlyMap<string, readonly number[]>,
): TaskQualityContext {
  const { benchmarkKeys, benchmarkWeights } = dimensionBenchmarkContext(dimension, scoringConfig);
  return {
    benchmarkKeys: benchmarkKeys.filter((key) => !INDEX_BENCHMARK_KEY_SET.has(key)),
    benchmarkWeights,
    minimumObservedWeight: scoringConfig.qualityCoverage[dimension].full,
    valuesByKey,
  };
}

/** Build a broadly observed task-benchmark score without using aggregate indexes as its own target. */
function observedTaskQualityScore(model: JsonObject, context: TaskQualityContext): number | null {
  const observedWeight = context.benchmarkKeys.reduce(
    (total, key) =>
      total +
      (benchmarkMetricValue(model, key) == null ? 0 : (context.benchmarkWeights.get(key) ?? 0)),
    0,
  );
  if (observedWeight < context.minimumObservedWeight) {
    return null;
  }
  return weightedMeanOfFinite(
    context.benchmarkKeys.map((key) => ({
      value: normalizedMetricValue(context.valuesByKey, key, benchmarkMetricValue(model, key)),
      weight: context.benchmarkWeights.get(key) ?? 0,
    })),
  );
}

/** Convert held-out normalized error into partial evidence credit for a validated prediction. */
function imputationConfidence(diagnostic: BenchmarkImputationDiagnostic): number {
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
  valuesByKey: ReadonlyMap<string, readonly number[]>,
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
      valuesByKey,
    );
  });
  const targetObservations = referenceContextScores.map((observation) => ({
    ...observation,
    value: benchmarkMetricValue(observation.item, targetBenchmarkKey) as number,
  }));
  if (effectiveModelCount(referenceContextScores) < MIN_IMPUTATION_REFERENCE_MODELS) {
    return null;
  }
  return (model) => {
    const contextScore = observedNormalizedEvidenceScore(
      model,
      benchmarkKeys,
      benchmarkWeights,
      targetBenchmarkKey,
      valuesByKey,
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

function selectedBenchmarkKeys(scoringConfig: ScoringConfig): string[] {
  return [
    ...new Set([...scoringConfig.intelligenceBenchmarkKeys, ...scoringConfig.agenticBenchmarkKeys]),
  ];
}

function observedValuesByBenchmark(
  models: JsonObject[],
  benchmarkKeys: readonly string[],
): Map<string, number[]> {
  return new Map(
    benchmarkKeys.map(
      (key) =>
        [key, mapFiniteNumbers(models, (model) => benchmarkMetricValue(model, key))] as const,
    ),
  );
}

function buildWeightedPredictors(
  models: JsonObject[],
  targetBenchmarkKey: string,
  scoringConfig: ScoringConfig,
  valuesByKey: ReadonlyMap<string, readonly number[]>,
): WeightedBenchmarkPredictor[] {
  const portfolioEntry = scoringConfig.benchmarkPortfolio[targetBenchmarkKey];
  if (portfolioEntry == null) {
    return [];
  }
  return IMPUTATION_DIMENSIONS.map((dimension) => ({
    predict:
      portfolioEntry.dimensionLoadings[dimension] > 0
        ? buildDimensionPredictor(models, targetBenchmarkKey, dimension, scoringConfig, valuesByKey)
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

type QualityAnchorPredictor = {
  confidence: number;
  predict: (model: JsonObject) => number | null;
};

type QualityAnchorParts = {
  parts: Array<{ score: number; confidence: number; weight: number }>;
  representativeVariantKey: string;
};

type QualityAnchorPartsByDimension = Partial<Record<BenchmarkDimension, QualityAnchorParts>>;

/** Choose one evidence-leading representative per model family for model-level index anchoring. */
function qualityAnchorRepresentatives(
  models: JsonObject[],
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
): JsonObject[] {
  const { benchmarkKeys, benchmarkWeights } = dimensionBenchmarkContext(dimension, scoringConfig);
  const representativesByModel = new Map<string, { model: JsonObject; observedWeight: number }>();
  for (const model of models) {
    const observedWeight = benchmarkKeys.reduce(
      (total, key) =>
        total + (benchmarkMetricValue(model, key) == null ? 0 : (benchmarkWeights.get(key) ?? 0)),
      0,
    );
    const modelKey = canonicalModelKey(model);
    const current = representativesByModel.get(modelKey);
    if (
      current == null ||
      observedWeight > current.observedWeight ||
      (observedWeight === current.observedWeight &&
        reasoningEffortRank(model.reasoning_effort) >
          reasoningEffortRank(current.model.reasoning_effort))
    ) {
      representativesByModel.set(modelKey, { model, observedWeight });
    }
  }
  return Array.from(representativesByModel.values(), ({ model }) => model);
}

/** Fit a monotonic mapping from one aggregate index to broadly observed task-benchmark quality. */
function buildQualityAnchorMapping(
  models: JsonObject[],
  indexKey: string,
  qualityContext: TaskQualityContext,
): ((model: JsonObject) => number | null) | null {
  const qualityScoresByModel = new Map<JsonObject, number>();
  const indexObservations = calibrationObservations(models, (model) => {
    const qualityScore = observedTaskQualityScore(model, qualityContext);
    if (qualityScore != null) {
      qualityScoresByModel.set(model, qualityScore);
    }
    return qualityScore == null ? null : benchmarkMetricValue(model, indexKey);
  });
  if (effectiveModelCount(indexObservations) < MIN_IMPUTATION_REFERENCE_MODELS) {
    return null;
  }
  const qualityObservations = indexObservations.flatMap((observation) => {
    const value = qualityScoresByModel.get(observation.item);
    return value == null ? [] : [{ ...observation, value }];
  });
  return (model) => {
    const indexValue = benchmarkMetricValue(model, indexKey);
    const percentile = weightedQuantileRank(indexObservations, indexValue);
    return percentile == null ? null : weightedQuantile(qualityObservations, percentile / 100);
  };
}

/** Accept an index anchor only when model-held-out predictions remain reliable on the 0-100 quality scale. */
function buildQualityAnchorPredictor(
  models: JsonObject[],
  indexKey: string,
  dimension: BenchmarkDimension,
  scoringConfig: ScoringConfig,
  valuesByKey: ReadonlyMap<string, readonly number[]>,
): QualityAnchorPredictor | null {
  const validationErrorByModel = new Map<JsonObject, number>();
  const benchmarkKeys = selectedBenchmarkKeys(scoringConfig);
  const modelKeyByModel = new Map(
    models.map((model) => [model, canonicalModelKey(model)] as const),
  );
  for (const heldOutModel of models) {
    if (benchmarkMetricValue(heldOutModel, indexKey) == null) {
      continue;
    }
    const heldOutModelKey = modelKeyByModel.get(heldOutModel)!;
    const trainingModels = models.filter((model) => modelKeyByModel.get(model) !== heldOutModelKey);
    const trainingValuesByKey = observedValuesByBenchmark(trainingModels, benchmarkKeys);
    const trainingQualityContext = taskQualityContext(
      dimension,
      scoringConfig,
      trainingValuesByKey,
    );
    const actualScore = observedTaskQualityScore(heldOutModel, trainingQualityContext);
    if (actualScore == null) {
      continue;
    }
    const mapping = buildQualityAnchorMapping(trainingModels, indexKey, trainingQualityContext);
    const predictedScore = mapping?.(heldOutModel) ?? null;
    if (predictedScore != null) {
      validationErrorByModel.set(heldOutModel, Math.abs(predictedScore - actualScore));
    }
  }
  const validationErrors = calibrationObservations(
    models,
    (model) => validationErrorByModel.get(model) ?? null,
  );
  const validationModelCount = effectiveModelCount(validationErrors);
  const medianAbsoluteError = weightedMedianOfFinite(validationErrors);
  if (
    validationModelCount < MIN_IMPUTATION_VALIDATION_MODELS ||
    medianAbsoluteError == null ||
    medianAbsoluteError > MAX_NORMALIZED_IMPUTATION_ERROR
  ) {
    return null;
  }
  const mapping = buildQualityAnchorMapping(
    models,
    indexKey,
    taskQualityContext(dimension, scoringConfig, valuesByKey),
  );
  return mapping == null
    ? null
    : {
        confidence: clamp01(1 - medianAbsoluteError / MAX_NORMALIZED_IMPUTATION_ERROR),
        predict: mapping,
      };
}

/** Combine every validated aggregate index at its normal portfolio weight into sparse-score anchors. */
function buildQualityIndexAnchors(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
  valuesByKey: ReadonlyMap<string, readonly number[]>,
): Map<string, Partial<Record<BenchmarkDimension, ModelQualityIndexAnchor>>> {
  const anchorPartsByModel = new Map<string, QualityAnchorPartsByDimension>();
  for (const dimension of IMPUTATION_DIMENSIONS) {
    const representatives = qualityAnchorRepresentatives(models, dimension, scoringConfig);
    for (const indexKey of INDEX_BENCHMARK_KEYS) {
      const weight = benchmarkDimensionWeight(
        indexKey,
        dimension,
        scoringConfig.benchmarkPortfolio,
      );
      if (!(weight > 0)) {
        continue;
      }
      const predictor = buildQualityAnchorPredictor(
        representatives,
        indexKey,
        dimension,
        scoringConfig,
        valuesByKey,
      );
      if (predictor == null || !(predictor.confidence > 0)) {
        continue;
      }
      for (const model of representatives) {
        const score = predictor.predict(model);
        if (score == null) {
          continue;
        }
        const modelKey = canonicalModelKey(model);
        const byDimension = anchorPartsByModel.get(modelKey) ?? {};
        const anchor = byDimension[dimension] ?? {
          parts: [],
          representativeVariantKey: scoringVariantKey(model),
        };
        anchor.parts.push({ score, confidence: predictor.confidence, weight });
        byDimension[dimension] = anchor;
        anchorPartsByModel.set(modelKey, byDimension);
      }
    }
  }
  const anchorsByModel = new Map<
    string,
    Partial<Record<BenchmarkDimension, ModelQualityIndexAnchor>>
  >();
  for (const [modelKey, partsByDimension] of anchorPartsByModel) {
    const anchors: Partial<Record<BenchmarkDimension, ModelQualityIndexAnchor>> = {};
    for (const dimension of IMPUTATION_DIMENSIONS) {
      const anchor = partsByDimension[dimension];
      const parts = anchor?.parts ?? [];
      const score = weightedMeanOfFinite(
        parts.map((part) => ({ value: part.score, weight: part.weight * part.confidence })),
      );
      const confidence = weightedMeanOfFinite(
        parts.map((part) => ({ value: part.confidence, weight: part.weight })),
      );
      if (anchor != null && score != null && confidence != null) {
        anchors[dimension] = {
          score,
          confidence,
          representativeVariantKey: anchor.representativeVariantKey,
        };
      }
    }
    anchorsByModel.set(modelKey, anchors);
  }
  return anchorsByModel;
}

/** Validate one benchmark's imputer while withholding every variant of the observed model. */
function imputationDiagnostic(
  models: JsonObject[],
  benchmarkKeys: readonly string[],
  targetBenchmarkKey: string,
  scoringConfig: ScoringConfig,
): BenchmarkImputationDiagnostic {
  const normalizedAbsoluteErrorByModel = new Map<JsonObject, number>();
  const modelKeyByModel = new Map(
    models.map((model) => [model, canonicalModelKey(model)] as const),
  );
  const calibrationByHeldOutModel = new Map<
    string,
    {
      predictors: WeightedBenchmarkPredictor[];
      targetValues: readonly number[];
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
      const trainingValuesByKey = observedValuesByBenchmark(trainingModels, benchmarkKeys);
      calibration = {
        predictors: buildWeightedPredictors(
          trainingModels,
          targetBenchmarkKey,
          scoringConfig,
          trainingValuesByKey,
        ),
        targetValues: trainingValuesByKey.get(targetBenchmarkKey) ?? [],
      };
      calibrationByHeldOutModel.set(heldOutModelKey, calibration);
    }
    const prediction = predictedBenchmarkValue(heldOutModel, calibration.predictors);
    const normalizedPrediction = minMaxScale(calibration.targetValues, prediction?.value ?? null);
    const normalizedActual = minMaxScale(calibration.targetValues, actualValue);
    if (normalizedPrediction == null || normalizedActual == null) {
      continue;
    }
    normalizedAbsoluteErrorByModel.set(
      heldOutModel,
      Math.abs(normalizedPrediction - normalizedActual),
    );
  }
  const validationErrors = calibrationObservations(
    models,
    (model) => normalizedAbsoluteErrorByModel.get(model) ?? null,
  );
  const normalizedMedianAbsoluteError = weightedMedianOfFinite(validationErrors);
  const validationModelCount = effectiveModelCount(validationErrors);
  return {
    validationSampleCount: validationErrors.length,
    effectiveModelCount: validationModelCount,
    normalizedMedianAbsoluteError,
    imputationAllowed:
      validationModelCount >= MIN_IMPUTATION_VALIDATION_MODELS &&
      normalizedMedianAbsoluteError != null &&
      normalizedMedianAbsoluteError <= MAX_NORMALIZED_IMPUTATION_ERROR,
  };
}

/** Calibrate contextual benchmark imputers from observed peer evidence and enable only predictors whose validation error and support meet policy. */
function prepareImputation(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): ImputationPreparation {
  const benchmarkKeys = selectedBenchmarkKeys(scoringConfig);
  const mercorApexImputation: MutableImputationMaps = benchmarkKeys.includes(APEX_AGENTS_KEY)
    ? buildMercorApexImputation(models)
    : {
        imputationByModel: new Map(),
        imputationConfidenceByModel: new Map(),
      };
  const imputationByModel = mercorApexImputation.imputationByModel;
  const imputationConfidenceByModel = mercorApexImputation.imputationConfidenceByModel;
  const diagnosticsByKey = new Map<string, BenchmarkImputationDiagnostic>();
  const valuesByKey = observedValuesByBenchmark(models, benchmarkKeys);
  for (const key of benchmarkKeys) {
    const portfolioEntry = scoringConfig.benchmarkPortfolio[key];
    if (portfolioEntry == null) {
      continue;
    }
    const imputationPolicy =
      BENCHMARK_CATALOG[key as keyof typeof BENCHMARK_CATALOG]?.scoring.imputation;
    if (
      imputationPolicy != null &&
      imputationPolicy.kind !== "contextual" &&
      (imputationPolicy.kind !== "additive_crosswalk" || imputationPolicy.fallback !== "contextual")
    ) {
      continue;
    }
    const diagnostic = imputationDiagnostic(models, benchmarkKeys, key, scoringConfig);
    diagnosticsByKey.set(key, diagnostic);
    if (!diagnostic.imputationAllowed) {
      continue;
    }
    const predictors = buildWeightedPredictors(models, key, scoringConfig, valuesByKey);
    for (const model of models) {
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
      const confidenceByKey = imputationConfidenceByModel.get(model) ?? new Map<string, number>();
      confidenceByKey.set(key, imputationConfidence(diagnostic) * prediction.contextSupport);
      imputationConfidenceByModel.set(model, confidenceByKey);
    }
  }
  return {
    imputationByModel,
    imputationConfidenceByModel,
    imputationDiagnosticsByKey: diagnosticsByKey,
  };
}

/** Precompute one benchmark-owned imputation from observed evidence only; source fields stay nullable. */
export function buildBenchmarkImputationByModel(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): Map<JsonObject, Map<string, number>> {
  return prepareImputation(models, scoringConfig).imputationByModel;
}

/** Report leave-one-model-out reliability evidence for every selected benchmark imputer. */
export function buildBenchmarkImputationDiagnosticsByKey(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): Map<string, BenchmarkImputationDiagnostic> {
  return prepareImputation(models, scoringConfig).imputationDiagnosticsByKey;
}

/** Precompute raw comparison distributions used to normalize quality fields before averaging. */
export function buildQualityScoringContext(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): QualityScoringContext {
  const benchmarkKeys = [
    ...new Set([
      ...selectedBenchmarkKeys(scoringConfig),
      ...scoringConfig.previewAdditionalIntelligenceBenchmarkKeys,
    ]),
  ];
  const benchmarkValuesByKey = observedValuesByBenchmark(models, benchmarkKeys);
  const indexAnchorsByModel = buildQualityIndexAnchors(models, scoringConfig, benchmarkValuesByKey);
  return { benchmarkValuesByKey, indexAnchorsByModel };
}

/** Prepare benchmark imputations and quality normalization context in dependency order. */
export function prepareBenchmarkScoring(
  models: JsonObject[],
  scoringConfig: ScoringConfig,
): BenchmarkScoringPreparation {
  const { imputationByModel, imputationConfidenceByModel } = prepareImputation(
    models,
    scoringConfig,
  );
  const qualityContext = buildQualityScoringContext(models, scoringConfig);
  const imputationByVariant = new Map<string, ReadonlyMap<string, number>>();
  const imputationConfidenceByVariant = new Map<string, ReadonlyMap<string, number>>();
  for (const model of models) {
    const key = scoringVariantKey(model);
    const values = imputationByModel.get(model);
    const confidence = imputationConfidenceByModel.get(model);
    if (values != null) {
      imputationByVariant.set(key, values);
    }
    if (confidence != null) {
      imputationConfidenceByVariant.set(key, confidence);
    }
  }
  return {
    imputationByModel,
    imputationConfidenceByModel,
    imputationByVariant,
    imputationConfidenceByVariant,
    qualityContext,
  };
}
