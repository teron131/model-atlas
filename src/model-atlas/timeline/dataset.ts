/** Assemble published index releases alongside directly observed main-app benchmarks; constituent metadata never creates task evidence. */

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { BENCHMARK_CATALOG, INDEX_BENCHMARK_KEYS } from "../benchmarks/registry";
import { archivedEvidenceCount, iterateArchivedEvidence } from "../database/archive";
import { stableJson } from "../runtime";
import { historicalSourceModel } from "./index-sources";
import { resolveHistoricalModelIdentities, validHistoricalReleaseDate } from "./model-identity";
import type {
  HistoricalBenchmark,
  HistoricalDataset,
  HistoricalModel,
  HistoricalObservation,
  HistoricalPortfolio,
  HistoricalSourceRelease,
} from "./types";

/** Resolve corrections by publication time, reject same-release conflicts, and freeze current Model Atlas scores as dimension-specific calibration references. */
export function buildHistoricalDataset(
  db: DatabaseSync,
  referenceDb: DatabaseSync = db,
): HistoricalDataset {
  const records = iterateArchivedEvidence<HistoricalSourceRelease>(db, "index_components");
  let hasReleases = false;
  // A corrected parser can replace the selected interpretation of identical bytes without deleting any archived source artifact.
  const byArtifact = new Map<string, HistoricalSourceRelease>();
  for (const { record: release } of records) {
    hasReleases = true;
    // Superseded component backfills remain in the raw archive, outside the active index import.
    if (release.benchmarks.some((benchmark) => benchmark.kind === "task")) continue;
    byArtifact.set(release.artifacts[0]!.sha256, release);
  }
  if (!hasReleases)
    throw new Error(
      "No index component releases have been imported. Run pnpm timeline <checkpoint> --refresh-sources.",
    );
  if (!byArtifact.size)
    throw new Error(
      "Refresh the index releases with pnpm timeline <checkpoint> --refresh-sources before building the dataset.",
    );
  const benchmarksByModel = new Map<number, Record<string, unknown>[]>();
  const benchmarkRows = referenceDb
    .prepare(
      "SELECT model_row_index, benchmark_key, value, observed_at FROM model_benchmarks ORDER BY model_row_index, benchmark_key",
    )
    .iterate();
  for (const row of benchmarkRows) {
    const id = Number(row.model_row_index);
    const rows = benchmarksByModel.get(id) ?? [];
    rows.push(row);
    benchmarksByModel.set(id, rows);
  }
  const currentRows = referenceDb
    .prepare(
      "SELECT row_index, model_id, name, provider_id, reasoning_effort, release_date, intelligence_score, agentic_score, intelligence_confidence, agentic_confidence FROM models",
    )
    .all()
    .map((row) => ({
      ...row,
      benchmarkObservations: benchmarksByModel.get(Number(row.row_index)) ?? [],
    }));
  return historicalDatasetFromReleases(
    [...byArtifact.values()],
    currentRows,
    archivedEvidenceCount(db),
    new Date(
      Number(
        referenceDb.prepare("SELECT updated_at_epoch_seconds FROM snapshot_metadata LIMIT 1").get()
          ?.updated_at_epoch_seconds,
      ) * 1000,
    ).toISOString(),
  );
}

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
      const id = `atlas:benchmark:${referenceId}:${key}`;
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
