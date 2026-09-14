/** Persist observed calibration evidence and append benchmark units without rebasing the initial cross-era coordinate. */
import { createHash } from "node:crypto";

import { excludesVariantIndex } from "../benchmarks/index-policy";
import { stableJson } from "../runtime";
import { informativeBenchmark } from "./benchmark-evidence";
import { validateTimelineParameters } from "./calibration";
import { historicalReleaseId } from "./dataset";
import { extendTimelineGraph, fitTimelineLink, timelineNativeValue } from "./linking";
import { resolveHistoricalModelIdentities } from "./model-identity";
import type {
  HistoricalDataset,
  HistoricalObservation,
  TimelineDimension,
  TimelineLink,
  TimelineParameters,
  TimelineScale,
} from "./types";

// Reference evidence support is an admission rule for fitting, not a probability or a multiplier on capability.
const MINIMUM_REFERENCE_CONFIDENCE = 0.6;

/** Reuse published seed scores and calibration nodes, retaining retired observations so a later benchmark can connect through intermediate generations. */
export function prepareTimelineRelease(
  incoming: HistoricalDataset,
  parameters: TimelineParameters,
  previous: TimelineScale | undefined = incoming.scale,
): HistoricalDataset {
  validateTimelineParameters(parameters);
  if (
    previous &&
    (previous.minimumReferenceConfidence !== MINIMUM_REFERENCE_CONFIDENCE ||
      stableJson(previous.parameters) !== stableJson(parameters))
  )
    throw new Error(
      "The saved calibration uses a different fit policy; use a separate scale file for a new experiment.",
    );
  const reference = previous?.reference ?? incoming.reference;
  const rootBenchmarkIds = previous?.rootBenchmarkIds ?? incoming.rootBenchmarkIds;
  const roots = new Set(Object.values(rootBenchmarkIds));
  const incomingRoots = new Set(
    incoming.benchmarks.filter((b) => b.key.startsWith("model_atlas_")).map((b) => b.id),
  );
  const models = new Map((previous?.models ?? []).map((m) => [m.id, { ...m, current: false }]));
  for (const model of incoming.models) models.set(model.id, model);
  const benchmarks = new Map((previous?.benchmarks ?? []).map((b) => [b.id, b]));
  for (const definition of incoming.benchmarks) {
    if (previous && incomingRoots.has(definition.id)) continue;
    const existing = benchmarks.get(definition.id);
    if (
      existing &&
      (existing.key !== definition.key ||
        existing.scale !== definition.scale ||
        existing.normalization !== definition.normalization ||
        stableJson(existing.weights) !== stableJson(definition.weights))
    )
      throw new Error(
        `Benchmark ${definition.id} changed its measurement definition; give the changed edition a distinct identity.`,
      );
    benchmarks.set(definition.id, definition);
  }
  const observations = new Map<string, HistoricalObservation>();
  for (const observation of previous?.observations ?? [])
    observations.set(observationKey(observation), observation);
  for (const observation of incoming.observations) {
    if (previous && incomingRoots.has(observation.benchmarkId)) continue;
    const key = observationKey(observation);
    const existing = observations.get(key);
    if (existing && observation.observedAt < existing.observedAt) continue;
    if (
      existing &&
      observation.observedAt === existing.observedAt &&
      observation.value !== existing.value
    )
      throw new Error(
        `Conflicting retained observation for ${observation.modelId} on ${observation.benchmarkId}.`,
      );
    observations.set(key, observation);
  }
  for (const root of roots)
    if (![...observations.values()].some((o) => o.benchmarkId === root))
      throw new Error(
        "Each capability dimension needs observed initial reference scores before its unit can be frozen.",
      );
  const resolved = resolveHistoricalModelIdentities(
    [...models.values()],
    [...observations.values()],
  );
  const families = new Map(resolved.models.map((model) => [model.id, model.family]));
  const data: HistoricalDataset = {
    ...incoming,
    reference,
    rootBenchmarkIds,
    models: resolved.models,
    benchmarks: [...benchmarks.values()].sort((a, b) => a.id.localeCompare(b.id)),
    observations: resolved.observations,
  };
  delete data.prepared;
  delete data.scale;
  data.releaseId = historicalReleaseId(data);
  const byBenchmark = new Map<string, Map<string, number>>();
  const modelEfforts = new Map(data.models.map((model) => [model.id, model.effort]));
  for (const observation of data.observations) {
    // Retain every checkpoint label for audit; only supported references define units or override an evidence-based estimate.
    if (
      roots.has(observation.benchmarkId) &&
      !((observation.referenceConfidence ?? 0) >= MINIMUM_REFERENCE_CONFIDENCE)
    )
      continue;
    const definition = benchmarks.get(observation.benchmarkId);
    if (!definition || !informativeBenchmark(definition, observation.value, parameters)) continue;
    if (
      excludesVariantIndex(
        { reasoning_effort: modelEfforts.get(observation.modelId) },
        definition.key.replace(/^atlas_benchmark_/, ""),
      )
    )
      continue;
    const value = timelineNativeValue(definition, observation.value);
    if (value == null) continue;
    const values = byBenchmark.get(definition.id) ?? new Map<string, number>();
    values.set(observation.modelId, value);
    byBenchmark.set(definition.id, values);
  }
  const fitted = new Map<string, TimelineLink | null>();
  const fitDimension = (dimension: TimelineDimension) => {
    const definitions = data.benchmarks.filter(
      (b) =>
        b.weights[dimension] > 0 &&
        !b.id.includes(":unresolved-edition") &&
        (!b.key.startsWith("model_atlas_") || b.id === rootBenchmarkIds[dimension]),
    );
    const links = new Map(
      (previous?.dimensions[dimension].links ?? []).map((link) => [link.id, link]),
    );
    for (let i = 0; i < definitions.length; i++) {
      const left = definitions[i]!;
      const leftValues = byBenchmark.get(left.id);
      if (!leftValues) continue;
      for (const right of definitions.slice(i + 1)) {
        const id = JSON.stringify([left.id, right.id]);
        if (links.has(id)) continue;
        if (!fitted.has(id)) {
          const rightValues = byBenchmark.get(right.id);
          const pairs = rightValues
            ? [...leftValues].flatMap(([modelId, value]) => {
                const peer = rightValues.get(modelId);
                return peer == null
                  ? []
                  : [{ family: families.get(modelId)!, left: value, right: peer }];
              })
            : [];
          fitted.set(id, fitTimelineLink(left.id, right.id, pairs, parameters));
        }
        const link = fitted.get(id);
        if (link) links.set(id, link);
      }
    }
    const orderedLinks = [...links.values()].sort((a, b) => a.id.localeCompare(b.id));
    const nodes = [
      ...extendTimelineGraph(
        orderedLinks,
        previous?.dimensions[dimension].nodes ?? [
          {
            benchmarkId: rootBenchmarkIds[dimension],
            slope: 1,
            offset: 0,
            path: [rootBenchmarkIds[dimension]],
            errors: [],
            disagreement: 0,
          },
        ],
      ),
    ].sort((a, b) => a.benchmarkId.localeCompare(b.benchmarkId));
    return { nodes, links: orderedLinks };
  };
  const scale: TimelineScale = {
    id: "",
    parentId: previous?.id ?? null,
    parameters,
    minimumReferenceConfidence: MINIMUM_REFERENCE_CONFIDENCE,
    reference,
    rootBenchmarkIds,
    models: data.models,
    benchmarks: data.benchmarks,
    observations: data.observations,
    dimensions: { intelligence: fitDimension("intelligence"), agentic: fitDimension("agentic") },
  };
  scale.id = createHash("sha256")
    .update(
      stableJson({
        parameters,
        minimumReferenceConfidence: scale.minimumReferenceConfidence,
        releaseId: data.releaseId,
        dimensions: scale.dimensions,
      }),
    )
    .digest("hex");
  data.scale = previous?.id === scale.id ? previous : scale;
  return data;
}

function observationKey(observation: HistoricalObservation): string {
  return `${observation.modelId}\u0000${observation.benchmarkId}`;
}
