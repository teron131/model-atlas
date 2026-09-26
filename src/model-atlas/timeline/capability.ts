/** Own fixed capability publication: retain the published ruler, and append supported model positions without rewriting earlier scores. */

import { createHash } from "node:crypto";

import { indexPolicy, reportedIndexBenchmarkCount } from "../benchmarks/index-policy";
import { BENCHMARK_CATALOG, INDEX_BENCHMARK_KEYS } from "../benchmarks/registry";
import { canonicalReasoningEffort } from "../identity/normalization";
import { publicOpenRouterModelId } from "../identity/openrouter";
import { providerIdentityKey } from "../identity/provider";
import type { ModelAtlasCandidate } from "../pipeline/model-types";
import { benchmarkMetricValue } from "../pipeline/scores/resource-metrics";
import { stableJson } from "../runtime";
import { prepareTimelineBenchmarkEvidence } from "./benchmark-evidence";
import { calibrateTimeline } from "./calibration";
import { checkpointBenchmarkId } from "./dataset";
import { historicalNameKey, historicalSourceModel } from "./model-identity";
import { prepareTimelineRelease } from "./scale";
import type {
  HistoricalBenchmark,
  HistoricalCalibration,
  HistoricalDataset,
  HistoricalModel,
  HistoricalObservation,
  TimelineAnchors,
  TimelineDimension,
} from "./schemas";

type ModelInput = Pick<
  ModelAtlasCandidate,
  "id" | "name" | "provider" | "reasoning_effort" | "release_date" | "benchmarks" | "intelligence"
>;
export type CapabilityPosition = {
  modelId: string;
  coordinates: Partial<Record<TimelineDimension, number>>;
  publishedAt: string;
  policyId: string;
};
export type CapabilityState = {
  version: 2;
  initializedAt: string;
  dataset: HistoricalDataset;
  anchors: TimelineAnchors;
  positions: Record<string, CapabilityPosition>;
  policies: Record<
    string,
    { benchmarkIds: string[]; weights: Record<string, HistoricalBenchmark["weights"]> }
  >;
};

/** Catalog identity and exact reasoning effort own a published position; display names and provider routes never supply another configuration's score. */
export function capabilityModelId(model: Pick<ModelInput, "id" | "reasoning_effort">): string {
  if (!model.id) throw new Error("A capability position requires a catalog model ID.");
  return `atlas-model:${publicOpenRouterModelId(model.id)}::${canonicalReasoningEffort(model.reasoning_effort) ?? "unknown"}`;
}

/** Retain archived evidence for linking, apply the current portfolio to new estimates, and never replace a published model/dimension position. */
export function advanceCapabilities(
  previous: CapabilityState,
  models: readonly ModelInput[],
  observedAt: string,
): CapabilityState {
  const evidence = currentEvidence(models, observedAt);
  const externalIds = previous.dataset.benchmarks
    .filter((benchmark) => !benchmark.primary && !benchmark.key.startsWith("model_atlas_"))
    .map((benchmark) => benchmark.id);
  const dataset = prepareTimelineRelease(
    {
      ...previous.dataset,
      models: evidence.models,
      benchmarks: evidence.benchmarks,
      observations: evidence.observations,
      activeBenchmarkIds: [...externalIds, ...evidence.benchmarks.map((benchmark) => benchmark.id)],
    },
    previous.dataset.scale!.parameters,
    previous.dataset.scale,
  );
  const policy = portfolio(evidence.benchmarks);
  const calibration = calibrateTimeline(dataset, "intelligence");
  const next = appendPositions(
    {
      ...previous,
      dataset,
      positions: retainRoutePositions(previous, evidence.models),
      policies: { ...previous.policies, [policy.id]: policy.value },
    },
    calibration,
    observedAt,
    policy.id,
  );
  return { ...next, dataset: publishedDataset(next, calibration) };
}

/** A catalog route can change without a new model release; only an unambiguous matching name, provider, effort, and release date may carry the published coordinate. */
function retainRoutePositions(previous: CapabilityState, models: HistoricalModel[]) {
  const key = (model: HistoricalModel) =>
    JSON.stringify([
      providerIdentityKey(model.provider),
      historicalNameKey(model.name),
      model.effort,
      model.releaseDate,
    ]);
  const known = new Map<string, CapabilityPosition[]>();
  for (const model of previous.dataset.models) {
    const position = previous.positions[model.id];
    if (!position) continue;
    const id = key(model);
    known.set(id, [...(known.get(id) ?? []), position]);
  }
  const positions = { ...previous.positions };
  for (const model of models) {
    if (positions[model.id]) continue;
    const matches = known.get(key(model)) ?? [];
    if (
      !matches.length ||
      new Set(matches.map((position) => stableJson(position.coordinates))).size !== 1
    )
      continue;
    positions[model.id] = { ...matches[0]!, modelId: model.id };
  }
  return positions;
}

/** Convert the existing fixed coordinate to published units; there is no population rescaling or upper bound. */
export function capabilityIndex(
  value: number | null | undefined,
  dimension: TimelineDimension,
  anchors: TimelineAnchors,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const low = anchors.frozenReferences!.find((row) => row.modelId === anchors.lowModelId)!.values[
    dimension
  ];
  const high = anchors.frozenReferences!.find((row) => row.modelId === anchors.highModelId)!.values[
    dimension
  ];
  return anchors.lowScore + ((anchors.highScore - anchors.lowScore) * (value - low)) / (high - low);
}

/** Publish the separate Intelligence Index through Timeline; leaderboard relative scores never read these saved positions. */
export function capabilityDataset(state: CapabilityState): HistoricalDataset {
  if (state.dataset.prepared) return state.dataset;
  return publishedDataset(state, calibrateTimeline(state.dataset, "intelligence"));
}

/** Reuse the projection that placed new models instead of recalibrating it during persistence. */
function publishedDataset(
  state: CapabilityState,
  calibration: HistoricalCalibration,
): HistoricalDataset {
  const calibrations = {
    intelligence: {
      ...calibration,
      estimates: calibration.estimates.map((estimate) => ({
        ...estimate,
        value: state.positions[estimate.modelId]?.coordinates.intelligence ?? estimate.value,
      })),
    },
  };
  return {
    ...state.dataset,
    displayAnchors: state.anchors,
    prepared: {
      parameters: state.dataset.scale!.parameters,
      calibrations,
      evidence: prepareTimelineBenchmarkEvidence(state.dataset, state.dataset.scale!.parameters),
    },
  };
}

function appendPositions(
  state: CapabilityState,
  calibration: HistoricalCalibration,
  observedAt: string,
  policyId: string,
): CapabilityState {
  const positions = { ...state.positions };
  for (const estimate of calibration.estimates) {
    if (estimate.value == null || positions[estimate.modelId]?.coordinates.intelligence != null)
      continue;
    const previous = positions[estimate.modelId];
    positions[estimate.modelId] = {
      modelId: estimate.modelId,
      coordinates: { ...previous?.coordinates, intelligence: estimate.value },
      publishedAt: previous?.publishedAt ?? observedAt,
      policyId: previous?.policyId ?? policyId,
    };
  }
  return { ...state, positions };
}

function currentEvidence(models: readonly ModelInput[], observedAt: string) {
  const definitions = new Map<string, HistoricalBenchmark>();
  const observations: HistoricalObservation[] = [];
  const identities: HistoricalModel[] = [];
  for (const model of models) {
    if (!model.id || !model.name) continue;
    const identity = {
      ...historicalSourceModel(
        model.name,
        model.provider ?? "Unknown",
        model.reasoning_effort,
        model.release_date,
      ),
      id: capabilityModelId(model),
      current: true,
    };
    identities.push(identity);
    for (const [key, definition] of Object.entries(BENCHMARK_CATALOG)) {
      const value = benchmarkMetricValue(model, key);
      if (value == null || !Number.isFinite(value)) continue;
      const id = checkpointBenchmarkId(key);
      definitions.set(id, {
        id,
        key: `atlas_benchmark_${key}`,
        label: definition.presentation.label,
        kind: (INDEX_BENCHMARK_KEYS as readonly string[]).includes(key) ? "index" : "task",
        scale: definition.presentation.column.format === "percent" ? "probability" : "linear",
        weights: {
          intelligence:
            definition.scoring.benchmarkImportance *
            definition.scoring.dimensionLoadings.intelligence,
          agentic:
            definition.scoring.benchmarkImportance * definition.scoring.dimensionLoadings.agentic,
        },
        representedBenchmarks: indexPolicy(key)?.representedBenchmarks,
        primary: true,
      });
      observations.push({
        modelId: identity.id,
        benchmarkId: id,
        value,
        observedAt,
        source: "Model Atlas observed portfolio",
        benchmarkCount: reportedIndexBenchmarkCount(model, key) ?? undefined,
      });
    }
  }
  // Duplicate routes may report conflicting values for one configuration; omit that pair rather than make ingestion order decide the measurement.
  const selected = new Map<string, HistoricalObservation>();
  const conflicts = new Set<string>();
  for (const observation of observations) {
    const key = `${observation.modelId}\0${observation.benchmarkId}`;
    const existing = selected.get(key);
    if (existing && existing.value !== observation.value) conflicts.add(key);
    selected.set(key, observation);
  }
  return {
    models: [...new Map(identities.map((model) => [model.id, model])).values()],
    benchmarks: [...definitions.values()],
    observations: [...selected]
      .filter(([key]) => !conflicts.has(key))
      .map(([, observation]) => observation),
  };
}

function portfolio(benchmarks: HistoricalBenchmark[]) {
  const value = {
    benchmarkIds: benchmarks.map((benchmark) => benchmark.id).sort(),
    weights: Object.fromEntries(benchmarks.map((benchmark) => [benchmark.id, benchmark.weights])),
  };
  return { id: createHash("sha256").update(stableJson(value)).digest("hex"), value };
}
