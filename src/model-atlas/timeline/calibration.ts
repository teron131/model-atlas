/** Project observed benchmark results through permanent cross-era calibration; display anchors and view filters never fit the scale. */

import { modelCalibrationWeights } from "../benchmarks/calibration-population";
import {
  indexPolicy,
  qualityIndexBreadths,
  residualIndexBreadth,
} from "../benchmarks/index-policy";
import { MAX_NORMALIZED_IMPUTATION_ERROR, STAGE_CONFIG } from "../config/stage";
import { effectiveCount, weightedMeanOfFinite, weightedMedianOfFinite } from "../math-utils";
import { isInformativeValue } from "./benchmark-evidence";
import { MINIMUM_TIMELINE_TASKS } from "./coverage";
import { timelineNativeValue } from "./linking";
import { historicalVersionSeries } from "./model-identity";
import {
  catalogBenchmarkKey,
  type HistoricalBenchmark,
  type HistoricalCalibration,
  type HistoricalDataset,
  type HistoricalEstimate,
  type HistoricalModel,
  isReferenceBenchmark,
  measureKey,
  type TimelineAnchors,
  type TimelineCapability,
  type TimelineParameters,
  validateTimelineParameters,
} from "./schemas";

export const DEFAULT_TIMELINE_PARAMETERS: TimelineParameters = {
  saturationLow: 2,
  saturationHigh: 98,
  minModels: 4,
  maxError: MAX_NORMALIZED_IMPUTATION_ERROR,
};

/** New observations can revise any estimate, a supported reference's included, while published benchmark curves and the initial reference values that fit them remain fixed. */
export function calibrateTimeline(
  data: HistoricalDataset,
  capability: TimelineCapability,
  parameters = DEFAULT_TIMELINE_PARAMETERS,
): HistoricalCalibration {
  validateTimelineParameters(parameters);
  const scale = data.scale;
  if (!scale || scale.qualityTransform !== "linear")
    throw new Error("Prepare the linear Timeline calibration before projecting scores.");
  const root = scale.rootBenchmarkIds[capability];
  const graph = scale.dimensions[capability];
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
        Math.max(taskWeights.get(definition.key) ?? 0, definition.weights[capability]),
      );
  const possibleWeight = [...taskWeights.values()].reduce((a, b) => a + b, 0);
  const placements = data.models.map((model) => {
    const observed = byModel.get(model.id) ?? [];
    // Model presentation chooses a representative after scoring; it cannot turn sibling observations into this configuration's measurements.
    const usable = observed.filter((o) => {
      const definition = definitions.get(o.benchmarkId);
      return (
        definition &&
        !isReferenceBenchmark(definition) &&
        definition.weights[capability] > 0 &&
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
        const indexKey = catalogBenchmarkKey(definition.key);
        return Number.isFinite(value)
          ? [
              {
                definition,
                node,
                value,
                observedAt: o.observedAt,
                weight: definition.weights[capability],
                breadth: residualIndexBreadth(
                  indexKey,
                  [],
                  o.benchmarkCount ??
                    definition.representedBenchmarks ??
                    (indexPolicy(indexKey) ? null : definition.componentIds?.length),
                ),
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.observedAt.localeCompare(a.observedAt) ||
          a.definition.id.localeCompare(b.definition.id),
      );
    // Select evidence by availability, never by its value, typical miss, or the representation of its calibration path.
    const unique = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const key = measureKey(candidate.definition);
      if (!unique.has(key)) unique.set(key, candidate);
    }
    const tasks = [...unique.values()].filter((p) => p.definition.kind === "task");
    const taskKeys = tasks.map((p) => catalogBenchmarkKey(p.definition.key));
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
    const taskCount = effectiveCount(tasks.map((p) => p.weight));
    const observedWeight = tasks.reduce((sum, p) => sum + p.weight, 0);
    const direct = possibleWeight > 0 ? observedWeight / possibleWeight : 0;
    const parts = [
      ...(indexes.length || tasks.length >= MINIMUM_TIMELINE_TASKS ? tasks : []).map((part) => ({
        ...part,
        weight: part.weight * STAGE_CONFIG.scoring.directBenchmarkWeightMultiplier,
      })),
      ...indexes,
    ];
    // Fixed positive weights keep a better result from ever lowering the position.
    const value = weightedMeanOfFinite(parts);
    const supportRamp = taskCount / (taskCount + MINIMUM_TIMELINE_TASKS);
    const effective = possibleWeight > 0 ? (supportRamp * observedWeight) / possibleWeight : 0;
    const benchmarkSupport = { observed: tasks.length, inferred: 0, direct, effective };
    const saturated = observed.filter((o) => {
      const definition = definitions.get(o.benchmarkId);
      return (
        definition &&
        definition.weights[capability] > 0 &&
        !isReferenceBenchmark(definition) &&
        !isInformativeValue(definition, o.value, parameters)
      );
    }).length;
    const reference = references.get(model.id);
    const supportedReference =
      reference != null && (reference.referenceConfidence ?? 0) >= scale.minimumReferenceConfidence;
    // The snapshot score stands in only when the reference's own results cannot place it, so a model still being measured is not held at its starting score.
    if (supportedReference && value == null)
      return {
        parts,
        estimate: {
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
          benchmarkSupport,
        } satisfies Omit<HistoricalEstimate, "uncertainty">,
      };
    const estimate = {
      modelId: model.id,
      value,
      evidence: parts.length,
      saturated,
      paths: parts.map((p) => p.node.path),
      indexOnly: useIndex,
      reference: supportedReference,
      source: !parts.length
        ? "unplaced"
        : useIndex
          ? "index"
          : indexes.length
            ? "blended"
            : "components",
      confidence: supportedReference ? (reference.referenceConfidence ?? 0) : null,
      disagreement:
        parts.length > 1
          ? Math.max(...parts.map((p) => p.value)) - Math.min(...parts.map((p) => p.value))
          : null,
      benchmarkSupport,
    } satisfies Omit<HistoricalEstimate, "uncertainty">;
    return { parts, estimate };
  });
  // Each measure is checked by leaving it out of its model's position, so the check needs no reference score and reaches every era where models were measured on two benchmarks.
  const placedParts = placements.map(({ parts }) => parts);
  const families = data.models.map((model) => model.family);
  const checks = benchmarkChecks(placedParts, families, parameters.minModels);
  const pairs = heldOutPairs(placedParts, families, checks);
  const growth = missGrowth(pairs);
  // Sized so that half of the held-out benchmarks land within the range predicted for them: the reading "typically within" promises.
  const sizing = weightedMedianOfFinite(
    pairs.map((pair) => ({
      value: Math.abs(pair.residual) / predictedMiss(pair, growth),
      weight: pair.weight,
    })),
  );
  const estimates = placements.map(
    ({ estimate, parts }): HistoricalEstimate => ({
      ...estimate,
      uncertainty:
        estimate.source === "current" || estimate.value == null || sizing == null
          ? null
          : typicalMiss(parts, checks, growth, sizing),
    }),
  );
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

/** A benchmark result as placed on the reference scale, with its weight in the position. */
type PlacedPart = {
  definition: Pick<HistoricalBenchmark, "key" | "kind">;
  value: number;
  weight: number;
};

/** How one measure agrees with the models it measured once it is left out of their positions: its typical distance from the position their other benchmarks give, and the center, spread, and range of the values it was checked at. All records and versions of an index share one check. */
type BenchmarkCheck = {
  typicalMiss: number;
  center: number;
  deviation: number;
  min: number;
  max: number;
};

/** Each part's held-out residual: how far it lands from the weighted mean of the model's other parts. A model placed by one part has none, and an index compared only with other indexes gives none, because indexes averaging overlapping benchmarks agree partly by construction. */
function heldOut<T extends PlacedPart>(
  parts: readonly T[],
): { part: T; residual: number; restWeight: number }[] {
  if (parts.length < 2 || parts.every((part) => part.definition.kind === "index")) return [];
  return parts.map((part) => {
    let restWeight = 0;
    let weightedValue = 0;
    for (const other of parts) {
      if (other === part) continue;
      restWeight += other.weight;
      weightedValue += other.weight * other.value;
    }
    return { part, residual: part.value - weightedValue / restWeight, restWeight };
  });
}

/** Check every measure against the other benchmarks of the models it measured, each model family counting once; one held out in fewer than `minModels` families stays unchecked. */
function benchmarkChecks(
  models: readonly (readonly PlacedPart[])[],
  families: readonly string[],
  minModels: number,
): Map<string, BenchmarkCheck> {
  const held = new Map<string, { residual: number; value: number; family: string }[]>();
  models.forEach((parts, index) => {
    for (const { part, residual } of heldOut(parts)) {
      const measure = measureKey(part.definition);
      const rows = held.get(measure) ?? [];
      rows.push({ residual, value: part.value, family: families[index]! });
      held.set(measure, rows);
    }
  });
  return new Map(
    [...held].flatMap(([measure, rows]) => {
      if (new Set(rows.map((row) => row.family)).size < minModels) return [];
      const weights = modelCalibrationWeights(rows.map((row) => row.family));
      const values = rows.map((row) => row.value);
      const center = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1);
      return [
        [
          measure,
          {
            typicalMiss: weightedMedianOfFinite(
              rows.map((row, i) => ({ value: Math.abs(row.residual), weight: weights[i]! })),
            )!,
            center,
            deviation: Math.sqrt(variance),
            min: Math.min(...values),
            max: Math.max(...values),
          },
        ] as const,
      ];
    }),
  );
}

type CheckedPart = PlacedPart & { check: BenchmarkCheck };

/** All pairs for one model share the same checked parts. Its held-out part is excluded from the comparison mean. */
type HeldOutPair = {
  part: CheckedPart;
  checked: readonly CheckedPart[];
  restWeight: number;
  residual: number;
  weight: number;
};

/** Hold out each checked benchmark of every model placed by two or more of them, as `heldOut` admits it. */
function heldOutPairs(
  models: readonly (readonly PlacedPart[])[],
  families: readonly string[],
  checks: ReadonlyMap<string, BenchmarkCheck>,
): HeldOutPair[] {
  const pairs = models.flatMap((parts, index) => {
    const checked = parts.flatMap((part) => {
      const check = checks.get(measureKey(part.definition));
      return check ? [{ ...part, check }] : [];
    });
    return heldOut(checked).map((pair) => ({
      family: families[index]!,
      pair: { ...pair, checked },
    }));
  });
  const weights = modelCalibrationWeights(pairs.map(({ family }) => family));
  return pairs.map(({ pair }, i) => ({ ...pair, weight: weights[i]! }));
}

/** A part's typical miss before sizing: its benchmark's, widened as its value leaves the values the benchmark was checked at, at `growth` per squared standard deviation. */
function partMiss(part: PlacedPart, check: BenchmarkCheck, growth: number): number {
  return (
    check.typicalMiss * Math.sqrt(1 + growth * ((part.value - check.center) / check.deviation) ** 2)
  );
}

/** A held-out residual's typical size before sizing: it carries its own benchmark's miss and the miss of the mean it is compared with. */
function predictedMiss(pair: HeldOutPair, growth: number): number {
  let restMiss = 0;
  for (const part of pair.checked) {
    if (part !== pair.part) restMiss += (part.weight * partMiss(part, part.check, growth)) ** 2;
  }
  return Math.sqrt(
    partMiss(pair.part, pair.part.check, growth) ** 2 + restMiss / pair.restWeight ** 2,
  );
}

/** How fast a benchmark's misses grow with distance from the values it was checked at: the rate that best explains the held-out residuals, each read as Laplace-distributed around its predicted size with one shared scale. Searched between none and `MAXIMUM_MISS_GROWTH`. */
function missGrowth(pairs: readonly HeldOutPair[]): number {
  const total = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  const fit = (growth: number) => {
    let scaledResiduals = 0;
    let logSizes = 0;
    for (const pair of pairs) {
      const size = predictedMiss(pair, growth);
      scaledResiduals += (pair.weight * Math.abs(pair.residual)) / size;
      logSizes += pair.weight * Math.log(size);
    }
    return -logSizes - total * Math.log(scaledResiduals / total);
  };
  let [low, high] = [0, MAXIMUM_MISS_GROWTH];
  for (let step = 0; step < 40; step++) {
    const left = high - GOLDEN_SECTION * (high - low);
    const right = low + GOLDEN_SECTION * (high - low);
    if (fit(left) < fit(right)) low = left;
    else high = right;
  }
  return (low + high) / 2;
}

// Past this rate a benchmark one standard deviation from its checked values would already miss by over three times its typical miss, far beyond what the held-out residuals show.
const MAXIMUM_MISS_GROWTH = 10;
const GOLDEN_SECTION = (Math.sqrt(5) - 1) / 2;

/** A position's typical miss and how far it lies beyond every range its benchmarks were checked at; `null` when no checked benchmark places it. Averaging benchmarks shrinks their misses as independent ones: an error every benchmark of a model shares never shows when one is left out. */
function typicalMiss(
  parts: readonly PlacedPart[],
  checks: ReadonlyMap<string, BenchmarkCheck>,
  growth: number,
  sizing: number,
): NonNullable<HistoricalEstimate["uncertainty"]> | null {
  const checked = parts.flatMap((part) => {
    const check = checks.get(measureKey(part.definition));
    return check ? [{ part, check }] : [];
  });
  if (!checked.length) return null;
  const total = checked.reduce((sum, { part }) => sum + part.weight, 0);
  const spread = checked.reduce(
    (sum, { part, check }) => sum + (part.weight * partMiss(part, check, growth)) ** 2,
    0,
  );
  return {
    typicalMiss: (sizing * Math.sqrt(spread)) / total,
    beyondChecked: Math.min(
      ...checked.map(({ part, check }) =>
        Math.max(0, check.min - part.value, part.value - check.max),
      ),
    ),
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
                  typicalMiss: estimate.uncertainty.typicalMiss + adjustment,
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

/** Re-express the permanent coordinate using frozen reference scores or an explicitly saved historical estimate; neither trains benchmark links. */
export function anchorTimeline(
  calibration: HistoricalCalibration,
  data: HistoricalDataset,
  anchors: TimelineAnchors,
  capability: TimelineCapability,
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
      if (frozen.referenceId !== data.reference.id || !Number.isFinite(frozen.values[capability]))
        throw new Error(
          "The saved display reference belongs to a different coordinate or lacks this capability.",
        );
      estimates.set(frozen.modelId, frozen.values[capability]);
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
