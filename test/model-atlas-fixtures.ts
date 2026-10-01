/** Shared payload factories and an in-memory writer keep tests aligned with production contracts. */

import type { BenchmarkObservationsByKey } from "../src/model-atlas/benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationRowsKey,
} from "../src/model-atlas/benchmarks/registry";
import { QUALITY_COVERAGE } from "../src/model-atlas/config/stage";
import type {
  DatabaseStatement,
  DatabaseWriter,
  SqlValue,
} from "../src/model-atlas/database/writers/database";
import { SNAPSHOT_PRESERVATION_VERSION } from "../src/model-atlas/stats/payload/snapshot-preservation";
import type { ModelAtlasModel, ModelAtlasPayload } from "../src/model-atlas/stats/types";

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
