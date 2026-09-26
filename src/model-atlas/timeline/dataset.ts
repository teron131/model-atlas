/** Assemble published index releases alongside directly observed main-app benchmarks; constituent metadata never creates task evidence. */

import { createHash } from "node:crypto";

import { indexPolicy } from "../benchmarks/index-policy";
import { BENCHMARK_CATALOG, INDEX_BENCHMARK_KEYS } from "../benchmarks/registry";
import { stableJson } from "../runtime";
import {
  historicalSourceModel,
  resolveHistoricalModelIdentities,
  validHistoricalReleaseDate,
} from "./model-identity";
import type {
  HistoricalBenchmark,
  HistoricalDataset,
  HistoricalModel,
  HistoricalObservation,
  HistoricalPortfolio,
  HistoricalSourceRelease,
} from "./schemas";

/** Source releases remain immutable; the selected view excludes conflicts instead of choosing an arbitrary alias or ingestion order. */
export function historicalDatasetFromReleases(
  releases: HistoricalSourceRelease[],
  currentRows: Record<string, unknown>[] = [],
  archiveEntries = 0,
  referenceCapturedAt = "",
): HistoricalDataset {
  const models = new Map<string, HistoricalModel>();
  const benchmarks = new Map<string, HistoricalBenchmark>();
  const observations = new Map<string, HistoricalObservation>();
  const conflicts = new Map<string, string>();
  const portfolios = new Map<string, HistoricalPortfolio>();
  const ordered = [...releases].sort(
    (a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id),
  );
  for (const release of ordered) {
    for (const model of release.models) {
      const previous = models.get(model.id);
      models.set(model.id, {
        ...model,
        releaseDate:
          (previous ? validHistoricalReleaseDate(previous) : null) ??
          validHistoricalReleaseDate(model),
      });
    }
    for (const definition of release.benchmarks) benchmarks.set(definition.id, definition);
    for (const portfolio of release.portfolios) portfolios.set(portfolio.id, portfolio);
    for (const observation of release.observations) {
      const key = `${observation.modelId}\0${observation.benchmarkId}`;
      const conflictAt = conflicts.get(key);
      if (conflictAt && conflictAt >= observation.observedAt) continue;
      const previous = observations.get(key);
      if (previous && previous.observedAt > observation.observedAt) continue;
      if (
        previous &&
        previous.observedAt === observation.observedAt &&
        Math.abs(previous.value - observation.value) > 1e-9
      ) {
        observations.delete(key);
        conflicts.set(key, observation.observedAt);
        continue;
      }
      conflicts.delete(key);
      observations.set(key, observation);
    }
  }
  const identityCounts = new Map<string, number>();
  for (const row of currentRows) {
    const identity = historicalSourceModel(
      String(row.name),
      String(row.provider_id ?? "Unknown"),
      typeof row.reasoning_effort === "string" ? row.reasoning_effort : null,
      row.release_date,
    ).id;
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);
  }
  const referenceRows = currentRows
    .map((row) => ({
      sourceId: String(row.model_id ?? row.name),
      benchmarkObservations: (row.benchmarkObservations ?? []) as {
        benchmark_key: string;
        value: number;
        observed_at: string;
      }[],
      confidence: {
        intelligence:
          typeof row.intelligence_confidence === "number" ? row.intelligence_confidence : 0,
        agentic: typeof row.agentic_confidence === "number" ? row.agentic_confidence : 0,
      },
      model: historicalSourceModel(
        String(row.name),
        String(row.provider_id ?? "Unknown"),
        typeof row.reasoning_effort === "string" ? row.reasoning_effort : null,
        row.release_date,
      ),
      intelligence:
        typeof row.intelligence_score === "number" && Number.isFinite(row.intelligence_score)
          ? row.intelligence_score
          : null,
      agentic:
        typeof row.agentic_score === "number" && Number.isFinite(row.agentic_score)
          ? row.agentic_score
          : null,
    }))
    .map((row) => ({
      ...row,
      model:
        identityCounts.get(row.model.id)! > 1
          ? { ...row.model, id: `atlas-model:${row.sourceId}::${row.model.effort ?? "unknown"}` }
          : row.model,
    }))
    .filter((row) => row.intelligence != null || row.agentic != null)
    .sort((a, b) => a.model.id.localeCompare(b.model.id));
  const referenceId = createHash("sha256")
    .update(JSON.stringify({ referenceCapturedAt, referenceRows }))
    .digest("hex");
  // Checkpoint benchmarks retain their exact stored units and source identity; external editions are separate evidence, not aliases.
  for (const row of referenceRows) {
    for (const observation of row.benchmarkObservations) {
      const key = observation.benchmark_key;
      const definition = BENCHMARK_CATALOG[key as keyof typeof BENCHMARK_CATALOG];
      if (!definition || !Number.isFinite(observation.value)) continue;
      const id = checkpointBenchmarkId(key);
      const weights = definition.scoring.dimensionLoadings;
      benchmarks.set(id, {
        id,
        key: `atlas_benchmark_${key}`,
        label: `${definition.presentation.label} (Model Atlas)`,
        kind: (INDEX_BENCHMARK_KEYS as readonly string[]).includes(key) ? "index" : "task",
        scale: definition.presentation.column.format === "percent" ? "probability" : "linear",
        weights: {
          intelligence: weights.intelligence * definition.scoring.benchmarkImportance,
          agentic: weights.agentic * definition.scoring.benchmarkImportance,
        },
        primary: true,
        representedBenchmarks: indexPolicy(key)?.representedBenchmarks,
      });
      observations.set(`${row.model.id}\0${id}`, {
        modelId: row.model.id,
        benchmarkId: id,
        value: observation.value,
        observedAt: observation.observed_at,
        source: "Model Atlas frozen checkpoint",
      });
    }
  }
  const rootBenchmarkIds = {
    intelligence: `atlas:intelligence:${referenceId}`,
    agentic: `atlas:agentic:${referenceId}`,
  };
  for (const dimension of ["intelligence", "agentic"] as const) {
    const rootId = rootBenchmarkIds[dimension];
    benchmarks.set(rootId, {
      id: rootId,
      key: `model_atlas_${dimension}`,
      label: `Model Atlas ${dimension} reference`,
      kind: "index",
      scale: "linear",
      weights: {
        intelligence: dimension === "intelligence" ? 1 : 0,
        agentic: dimension === "agentic" ? 1 : 0,
      },
      componentIds: [...benchmarks.values()]
        .filter((b) => b.primary && b.weights[dimension] > 0)
        .map((b) => b.id),
    });
    for (const row of referenceRows) {
      const value = row[dimension];
      const existing = models.get(row.model.id);
      models.set(row.model.id, {
        ...row.model,
        releaseDate: row.model.releaseDate ?? existing?.releaseDate ?? null,
        current: true,
      });
      if (value == null) continue;
      const key = `${row.model.id}\0${rootId}`;
      const previous = observations.get(key);
      if (previous && previous.value !== value)
        throw new Error(`Conflicting current reference for ${row.model.name} (${dimension})`);
      observations.set(key, {
        modelId: row.model.id,
        benchmarkId: rootId,
        value,
        observedAt: referenceCapturedAt,
        source: "Model Atlas frozen checkpoint",
        referenceConfidence: row.confidence[dimension],
      });
    }
  }
  const resolved = resolveHistoricalModelIdentities(
    [...models.values()],
    [...observations.values()],
  );
  const observedModels = new Set(resolved.observations.map((row) => row.modelId));
  const dataset: HistoricalDataset = {
    releaseId: "",
    capturedAt: ordered.at(-1)!.capturedAt,
    rootBenchmarkIds,
    reference: {
      id: referenceId,
      capturedAt: referenceCapturedAt,
      models: new Set(referenceRows.map((row) => row.model.id)).size,
    },
    models: resolved.models
      .filter((model) => observedModels.has(model.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    benchmarks: [...benchmarks.values()],
    observations: resolved.observations,
    archiveEntries,
    portfolios: [...portfolios.values()],
    sourceReleases: ordered.map(({ id, capturedAt, artifacts }) => ({ id, capturedAt, artifacts })),
    conflicts: conflicts.size,
  };
  dataset.releaseId = historicalReleaseId(dataset);
  return dataset;
}

/** Capture provenance never defines a benchmark edition; only the declared measurement and source-crosswalk contract does. */
export function checkpointBenchmarkId(key: string): string {
  const definition = BENCHMARK_CATALOG[key as keyof typeof BENCHMARK_CATALOG];
  if (!definition) throw new Error(`Unknown checkpoint benchmark: ${key}`);
  const contract = {
    key,
    source: definition.source,
    processing: definition.processing,
    location: definition.persistence.location,
    format: definition.presentation.column.format,
    indexBreadth:
      key === "aa_intelligence_index" ? indexPolicy(key)?.representedBenchmarks : undefined,
  };
  return `atlas:benchmark:${key}:${createHash("sha256").update(stableJson(contract)).digest("hex").slice(0, 20)}`;
}

/** Fingerprint the measured release and its method, excluding query parameters, display anchors, and reconstructed cells. */
export function historicalReleaseId(data: HistoricalDataset): string {
  return createHash("sha256")
    .update(
      stableJson({
        referenceId: data.reference.id,
        models: [...data.models].sort((a, b) => a.id.localeCompare(b.id)),
        benchmarks: [...data.benchmarks].sort((a, b) => a.id.localeCompare(b.id)),
        observations: [...data.observations].sort(
          (a, b) =>
            a.modelId.localeCompare(b.modelId) || a.benchmarkId.localeCompare(b.benchmarkId),
        ),
      }),
    )
    .digest("hex");
}
