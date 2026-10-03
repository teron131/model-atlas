/** Payload and historical-release fixtures plus an in-memory writer keep tests aligned with production contracts. */

import { createHash } from "node:crypto";

import { indexPolicy } from "../src/model-atlas/benchmarks/index-policy";
import type { BenchmarkObservationsByKey } from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_CATALOG,
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationRowsKey,
  INDEX_BENCHMARK_KEYS,
} from "../src/model-atlas/benchmarks/registry";
import { QUALITY_COVERAGE } from "../src/model-atlas/config/stage";
import type {
  DatabaseStatement,
  DatabaseWriter,
  SqlValue,
} from "../src/model-atlas/database/writers/database";
import { SNAPSHOT_PRESERVATION_VERSION } from "../src/model-atlas/stats/payload/snapshot-preservation";
import type { ModelAtlasModel, ModelAtlasPayload } from "../src/model-atlas/stats/types";
import { checkpointBenchmarkId } from "../src/model-atlas/timeline/capability";
import {
  historicalSourceModel,
  resolveHistoricalModelIdentities,
  validHistoricalReleaseDate,
} from "../src/model-atlas/timeline/model-identity";
import { historicalReleaseId } from "../src/model-atlas/timeline/scale";
import type {
  HistoricalBenchmark,
  HistoricalDataset,
  HistoricalModel,
  HistoricalObservation,
  HistoricalPortfolio,
} from "../src/model-atlas/timeline/schemas";

type CollectedTableRows = {
  columns: string[];
  rows: SqlValue[][];
};

/** Capture trusted INSERT writer calls for checking persisted rows without disk I/O. */
export class SnapshotRowCollector implements DatabaseWriter {
  readonly tables = new Map<string, CollectedTableRows>();

  prepare(sql: string): DatabaseStatement {
    const match = /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i.exec(sql);
    if (match?.[1] == null || match[2] == null) {
      throw new Error("Snapshot row collector only accepts INSERT statements");
    }
    const table = match[1];
    const columns = match[2].split(",").map((column) => column.trim());
    const collected = this.tables.get(table) ?? { columns, rows: [] };
    if (collected.columns.join("|") !== columns.join("|")) {
      throw new Error(`Inconsistent collected columns for ${table}`);
    }
    this.tables.set(table, collected);
    return {
      run: (...values) => {
        if (values.length !== columns.length) {
          throw new Error(
            `Collected ${values.length} values for ${table}; expected ${columns.length}`,
          );
        }
        collected.rows.push(values);
        return {};
      },
    };
  }

  records(table: string): Record<string, SqlValue>[] {
    const collected = this.tables.get(table);
    if (collected == null) {
      return [];
    }
    return collected.rows.map((values) =>
      Object.fromEntries(collected.columns.map((column, index) => [column, values[index] ?? null])),
    );
  }
}

/** Build every benchmark-observation row group, defaulting unspecified sources to empty. */
export function benchmarkObservationRowGroups<Row>(
  overrides: Partial<Record<BenchmarkObservationRowsKey, Row[]>> = {},
): Record<BenchmarkObservationRowsKey, Row[]> {
  return Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map(({ sourceRowsKey }) => [
      sourceRowsKey,
      overrides[sourceRowsKey] ?? [],
    ]),
  ) as Record<BenchmarkObservationRowsKey, Row[]>;
}

export function minimalModelAtlasPayload({
  fetchedAt,
  models = [],
  benchmarkObservations,
}: {
  fetchedAt: number;
  models?: ModelAtlasModel[];
  benchmarkObservations?: BenchmarkObservationsByKey;
}): ModelAtlasPayload {
  return {
    fetched_at_epoch_seconds: fetchedAt,
    metadata: {
      available_metrics: {
        benchmark_keys: [],
      },
      scoring: {
        intelligence_benchmark_keys: [],
        intelligence_benchmark_display_keys: [],
        missing_intelligence_benchmark_keys: [],
        agentic_benchmark_keys: [],
        agentic_benchmark_display_keys: [],
        missing_agentic_benchmark_keys: [],
        selected_benchmark_keys: [],
        benchmark_portfolio: {},
        quality_coverage: QUALITY_COVERAGE,
        agentic_token_modifier_cap: 0.15,
        column_tooltips: {},
        snapshot_preservation_version: SNAPSHOT_PRESERVATION_VERSION,
      },
    },
    models,
    ...(benchmarkObservations == null ? {} : { benchmark_observations: benchmarkObservations }),
  };
}

export function minimalModelAtlasModel({
  id,
  name,
}: {
  id: string;
  name: string;
}): ModelAtlasModel {
  return {
    id,
    name,
    provider: null,
    logo: "",
    reasoning: null,
    reasoning_effort: null,
    release_date: null,
    modalities: null,
    open_weights: null,
    cost: null,
    context_window: null,
    speed: {
      throughput_tokens_per_second_median: null,
      latency_seconds_median: null,
      e2e_latency_seconds_median: null,
    },
    intelligence: null,
    task_metrics: null,
    benchmarks: null,
    benchmark_dates: null,
    confidence: {
      intelligence: 1,
      agentic: 1,
      speed: 1,
      value: 1,
    },
    component_scores: {
      intelligence_score: 0,
      agentic_score: 0,
      speed_score: 0,
    },
    scores: {
      intelligence_score: 0,
      agentic_score: 0,
      speed_score: 0,
      value_score: null,
    },
  };
}

export type HistoricalSourceRelease = {
  id: string;
  capturedAt: string;
  artifacts: { url: string; sha256: string }[];
  models: HistoricalModel[];
  benchmarks: HistoricalBenchmark[];
  observations: HistoricalObservation[];
  portfolios: HistoricalPortfolio[];
};

/** Assemble retained-release fixtures without depending on removed live collectors; same-date conflicts remain excluded. */
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
