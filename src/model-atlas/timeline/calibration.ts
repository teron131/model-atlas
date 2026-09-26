/** Project observed benchmark results through permanent cross-era calibration; display anchors and view filters never fit the scale. */

import { modelCalibrationWeights } from "../benchmarks/calibration-population";
import {
  excludesVariantIndex,
  indexPolicy,
  qualityIndexBreadths,
  residualIndexBreadth,
} from "../benchmarks/index-policy";
import { MAX_NORMALIZED_IMPUTATION_ERROR, STAGE_CONFIG } from "../config/stage";
import { effectiveSampleSize, weightedMeanOfFinite } from "../math-utils";
import { informativeBenchmark } from "./benchmark-evidence";
import { MINIMUM_TIMELINE_TASKS } from "./coverage";
import { timelineInformation, timelineNativeValue } from "./linking";
import { historicalVersionSeries } from "./model-identity";
import {
  type HistoricalCalibration,
  type HistoricalDataset,
  type HistoricalEstimate,
  type HistoricalModel,
  type TimelineAnchors,
  type TimelineBenchmarkCalibration,
  type TimelineDimension,
  type TimelineParameters,
  validateTimelineParameters,
} from "./schemas";

export const DEFAULT_TIMELINE_PARAMETERS: TimelineParameters = {
  saturationLow: 2,
  saturationHigh: 98,
  minModels: 4,
  maxError: MAX_NORMALIZED_IMPUTATION_ERROR,
};

export const DEFAULT_TIMELINE_ANCHORS: TimelineAnchors = {
  mode: "models",
  lowModelId: "name:gpt-4-mar-2023::unknown",
  highModelId: "name:claude-opus-4-5::unknown",
  lowScore: 100,
  highScore: 150,
  pointsPerDeviation: 20,
};

/** New observations can revise an estimate, but published benchmark curves and initial reference values remain fixed. */
export function calibrateTimeline(
  data: HistoricalDataset,
  dimension: TimelineDimension,
  parameters = DEFAULT_TIMELINE_PARAMETERS,
): HistoricalCalibration {
  validateTimelineParameters(parameters);
  const scale = data.scale;
  if (!scale || scale.qualityTransform !== "linear")
    throw new Error("Prepare the linear Timeline calibration before projecting scores.");
  const root = scale.rootBenchmarkIds[dimension];
  const graph = scale.dimensions[dimension];
  const active = data.activeBenchmarkIds ? new Set(data.activeBenchmarkIds) : null;
  const definitions = new Map(
    data.benchmarks
      .filter((b) => !active || active.has(b.id) || b.id === root)
      .map((b) => [b.id, b]),
  );
  const nodes = new Map(
    graph.nodes
      .filter((node) =>
        node.errors.every(
          (e) => e.models >= parameters.minModels && e.normalizedError <= parameters.maxError,
        ),
      )
      .map((node) => [node.benchmarkId, node]),
  );
  const references = new Map(
    scale.observations.filter((o) => o.benchmarkId === root).map((o) => [o.modelId, o]),
  );
  const byModel = new Map<string, HistoricalDataset["observations"]>();
  for (const observation of data.observations) {
    const rows = byModel.get(observation.modelId) ?? [];
    rows.push(observation);
    byModel.set(observation.modelId, rows);
  }
  const taskWeights = new Map<string, number>();
  for (const definition of definitions.values())
    if (definition.kind === "task" && nodes.has(definition.id))
      taskWeights.set(
        definition.key,
        Math.max(taskWeights.get(definition.key) ?? 0, definition.weights[dimension]),
      );
  const possibleWeight = [...taskWeights.values()].reduce((a, b) => a + b, 0);
  const estimates = data.models.map((model): HistoricalEstimate => {
    const observed = byModel.get(model.id) ?? [];
    // Model presentation chooses a representative after scoring; it cannot turn sibling observations into this configuration's measurements.
    const usable = observed.filter((o) => {
      const definition = definitions.get(o.benchmarkId);
      return (
        definition &&
        !excludesVariantIndex(
          { reasoning_effort: model.effort },
          definition.key.replace(/^atlas_benchmark_/, ""),
        ) &&
        !definition.key.startsWith("model_atlas_") &&
        definition.weights[dimension] > 0 &&
        nodes.has(definition.id) &&
        timelineNativeValue(definition, o.value) != null
      );
    });
    const available = new Set(usable.map((o) => o.benchmarkId));
    const candidates = usable
      .flatMap((o) => {
        const definition = definitions.get(o.benchmarkId)!;
        const node = nodes.get(o.benchmarkId);
        const native = timelineNativeValue(definition, o.value);
        if (
          !node ||
          native == null ||
          (definition.supersededBy && available.has(definition.supersededBy))
        )
          return [];
        const value = node.offset + node.slope * native;
        const indexKey = definition.key.replace(/^atlas_benchmark_/, "");
        return Number.isFinite(value)
          ? [
              {
                definition,
                node,
                value,
                observedAt: o.observedAt,
                weight: definition.weights[dimension],
                breadth: residualIndexBreadth(
                  indexKey,
                  [],
                  o.benchmarkCount ??
                    definition.representedBenchmarks ??
                    (indexPolicy(indexKey) ? null : definition.componentIds?.length),
                ),
                information: timelineInformation(definition, o.value),
                uncertainty: timelineTransferError(node, value),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.observedAt.localeCompare(a.observedAt) ||
          a.definition.id.localeCompare(b.definition.id),
      );
    // Select evidence by availability, never by its value, error budget, or the representation of its calibration path.
    const unique = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const key =
        candidate.definition.kind === "index"
          ? candidate.definition.key
              .replace(/^atlas_benchmark_/, "")
              .replace(/^aa_quality_index$/, "aa_intelligence_index")
          : candidate.definition.key;
      if (!unique.has(key)) unique.set(key, candidate);
    }
    const tasks = [...unique.values()].filter((p) => p.definition.kind === "task");
    const taskKeys = tasks.map((p) => p.definition.key.replace(/^atlas_benchmark_/, ""));
    const indexCandidates = [...unique.entries()].filter(([, p]) => p.definition.kind === "index");
    const indexBreadths = qualityIndexBreadths(
      indexCandidates.map(([key, part]) => ({
        key,
        reportedCount: part.breadth,
      })),
      taskKeys,
    );
    const indexes = indexCandidates
      .map(([key, p]) => ({
        ...p,
        weight: p.weight * (indexBreadths.get(key) ?? 0),
      }))
      .filter((p) => p.weight > 0);
    const useIndex = !tasks.length && indexes.length > 0;
    const taskCount = effectiveSampleSize(tasks.map((p) => p.weight));
    const observedWeight = tasks.reduce((sum, p) => sum + p.weight, 0);
    const direct = possibleWeight > 0 ? observedWeight / possibleWeight : 0;
    const parts = [
      ...(indexes.length || tasks.length >= MINIMUM_TIMELINE_TASKS ? tasks : []).map((part) => ({
        ...part,
        weight: part.weight * STAGE_CONFIG.scoring.directBenchmarkWeightMultiplier,
      })),
      ...indexes,
    ];
    const projection = summarizeParts(parts, weightedMeanOfFinite(parts));
    const supportRamp = taskCount / (taskCount + MINIMUM_TIMELINE_TASKS);
    const effective =
      possibleWeight > 0
        ? (supportRamp * tasks.reduce((sum, p) => sum + p.weight * p.information, 0)) /
          possibleWeight
        : 0;
    const benchmarkSupport = { observed: tasks.length, inferred: 0, direct, effective };
    const saturated = observed.filter((o) => {
      const definition = definitions.get(o.benchmarkId);
      return (
        definition &&
        definition.weights[dimension] > 0 &&
        !definition.key.startsWith("model_atlas_") &&
        !informativeBenchmark(definition, o.value, parameters)
      );
    }).length;
    const reference = references.get(model.id);
    if (reference && (reference.referenceConfidence ?? 0) >= scale.minimumReferenceConfidence)
      return {
        modelId: model.id,
        value: reference.value,
        evidence: 1,
        saturated,
        paths: [[root]],
        indexOnly: false,
        reference: true,
        source: "current",
        confidence: reference.referenceConfidence ?? 0,
        disagreement: null,
        uncertainty: null,
        benchmarkSupport,
      };
    const value = projection.value;
    const errors = parts.flatMap((p) => p.node.errors);
    return {
      modelId: model.id,
      value,
      evidence: parts.length,
      saturated,
      paths: parts.map((p) => p.node.path),
      indexOnly: useIndex,
      reference: false,
      source: !parts.length
        ? "unplaced"
        : useIndex
          ? "index"
          : indexes.length
            ? "blended"
            : "components",
      confidence: null,
      disagreement:
        parts.length > 1
          ? Math.max(...parts.map((p) => p.value)) - Math.min(...parts.map((p) => p.value))
          : null,
      uncertainty:
        value == null
          ? null
          : {
              transferError: projection.transferError!,
              steps: Math.max(...parts.map((p) => p.node.errors.length)),
              weakestModels: Math.min(...errors.map((e) => e.models)),
              outsideOverlap: parts.some((p) => p.uncertainty.outsideOverlap),
            },
      benchmarkSupport,
    };
  });
  return {
    estimates: reconcileVersions(data.models, estimates),
    predictors: graph.links.map((link) => ({
      id: link.id,
      inputs: [link.left],
      target: link.right,
      kind: definitions.get(link.left)?.kind === "index" ? "index" : "components",
      models: link.models,
      error: link.error,
      baselineError: link.baselineError,
      accepted: link.models >= parameters.minModels && link.error <= parameters.maxError,
    })),
    connectedBenchmarks: Math.max(0, nodes.size - 1),
    scaleId: scale.id,
  };
}

/** Apply the explicit nondecreasing prior only to confirmed dated versions; ambiguous generic records cannot move a dated estimate. */
function reconcileVersions(
  models: HistoricalModel[],
  estimates: HistoricalEstimate[],
): HistoricalEstimate[] {
  const result = new Map(estimates.map((e) => [e.modelId, e]));
  const series = new Map<string, { modelId: string; period: string | null }[]>();
  for (const model of models) {
    const identity = historicalVersionSeries(model);
    const entries = series.get(identity.key) ?? [];
    entries.push({ modelId: model.id, period: identity.period });
    series.set(identity.key, entries);
  }
  for (const entries of series.values()) {
    const periods = [...new Set(entries.flatMap((e) => (e.period ? [e.period] : [])))].sort();
    let predecessor: HistoricalEstimate | undefined;
    for (const period of periods) {
      // Same-month aliases do not establish a temporal ordering among themselves.
      const current = entries
        .filter((e) => e.period === period)
        .flatMap(({ modelId }) => {
          const estimate = result.get(modelId);
          return estimate?.value != null ? [estimate] : [];
        });
      for (const estimate of current) {
        if (
          !estimate.reference &&
          predecessor?.value != null &&
          estimate.value! < predecessor.value
        ) {
          const adjustment = predecessor.value - estimate.value!;
          result.set(estimate.modelId, {
            ...estimate,
            value: predecessor.value,
            versionAdjustment: {
              kind: "successor",
              modelIds: [predecessor.modelId],
              unadjustedValue: estimate.value!,
            },
            uncertainty: estimate.uncertainty
              ? {
                  ...estimate.uncertainty,
                  transferError: estimate.uncertainty.transferError + adjustment,
                }
              : estimate.uncertainty,
          });
        }
      }
      for (const estimate of current) {
        const adjusted = result.get(estimate.modelId)!;
        if (!predecessor || adjusted.value! > predecessor.value!) predecessor = adjusted;
      }
    }
  }
  return estimates.map((e) => result.get(e.modelId)!);
}

/** Fixed positive weights preserve monotonicity; disagreement enlarges the reported budget without changing the point estimate. */
function summarizeParts(
  parts: { value: number; weight: number; uncertainty: { error: number } }[],
  value: number | null,
) {
  if (value == null) return { value, transferError: null };
  const spread = Math.sqrt(
    weightedMeanOfFinite(parts.map((p) => ({ value: (p.value - value) ** 2, weight: p.weight })))!,
  );
  const transferError =
    weightedMeanOfFinite(parts.map((p) => ({ value: p.uncertainty.error, weight: p.weight })))! +
    spread;
  return { value, transferError };
}

/** Add bridge errors without an independence discount; leverage increases when overlap is narrow, sparse, or far from the query. */
export function timelineTransferError(
  node: TimelineBenchmarkCalibration,
  score: number,
): { error: number; outsideOverlap: boolean } {
  return {
    error:
      node.disagreement +
      node.errors.reduce(
        (sum, step) =>
          sum +
          step.error *
            Math.sqrt(
              1 + 1 / step.models + ((score - step.center) / step.deviation) ** 2 / step.models,
            ),
        0,
      ),
    outsideOverlap: node.errors.some((step) => score < step.min || score > step.max),
  };
}

/** Re-express the permanent coordinate using frozen reference scores or an explicitly saved historical estimate; neither trains benchmark links. */
export function anchorTimeline(
  calibration: HistoricalCalibration,
  data: HistoricalDataset,
  anchors: TimelineAnchors,
  dimension: TimelineDimension,
): Map<string, number> {
  const estimates = new Map(
    calibration.estimates.map((estimate) => [estimate.modelId, estimate.value]),
  );
  const referenceIds = new Set(
    calibration.estimates
      .filter((estimate) => estimate.reference && estimate.value != null)
      .map((estimate) => estimate.modelId),
  );
  const anchorIds = new Set(referenceIds);
  for (const frozen of anchors.frozenReferences ?? []) {
    if (
      anchors.lowModelId === frozen.modelId ||
      (anchors.mode === "models" && anchors.highModelId === frozen.modelId)
    ) {
      if (frozen.referenceId !== data.reference.id || !Number.isFinite(frozen.values[dimension]))
        throw new Error(
          "The saved display reference belongs to a different coordinate or lacks this dimension.",
        );
      estimates.set(frozen.modelId, frozen.values[dimension]);
      anchorIds.add(frozen.modelId);
    }
  }
  const low = estimates.get(anchors.lowModelId);
  const high = estimates.get(anchors.highModelId);
  if (
    !anchorIds.has(anchors.lowModelId) ||
    (anchors.mode === "models" && !anchorIds.has(anchors.highModelId))
  )
    throw new Error(
      "Choose frozen reference models or a saved historical display reference as anchors.",
    );
  if (low == null) throw new Error("Choose a lower anchor with a supported estimate.");
  if (!Number.isFinite(anchors.lowScore)) throw new Error("Anchor scores must be finite.");
  let unit: number;
  if (anchors.mode === "models") {
    if (high == null || high <= low)
      throw new Error("The upper anchor must have a higher calibrated capability.");
    if (!Number.isFinite(anchors.highScore) || anchors.highScore <= anchors.lowScore)
      throw new Error("The upper anchor score must exceed the lower score.");
    unit = (anchors.highScore - anchors.lowScore) / (high - low);
  } else {
    const referenceModels = data.models.filter(
      (model) => referenceIds.has(model.id) && estimates.get(model.id) != null,
    );
    const weights = modelCalibrationWeights(referenceModels.map((model) => model.family));
    const values = referenceModels.map((model, index) => ({
      value: estimates.get(model.id)!,
      weight: weights[index]!,
    }));
    const mean = weightedMeanOfFinite(values)!;
    const variance = weightedMeanOfFinite(
      values.map((part) => ({ value: (part.value - mean) ** 2, weight: part.weight })),
    )!;
    if (
      !(variance > 0) ||
      !(anchors.pointsPerDeviation > 0) ||
      !Number.isFinite(anchors.pointsPerDeviation)
    )
      throw new Error("A positive reference spread and points per deviation are required.");
    unit = anchors.pointsPerDeviation / Math.sqrt(variance);
  }
  return new Map(
    calibration.estimates.flatMap((estimate) =>
      estimate.value == null
        ? []
        : [[estimate.modelId, anchors.lowScore + (estimate.value - low) * unit]],
    ),
  );
}
