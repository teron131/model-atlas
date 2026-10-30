/** Benchmark source-row drafts keep live source snapshots and restored database rows on one health-check contract. */

import {
  type BenchmarkObservationRow,
  isAssignableBenchmarkObservation,
} from "../../benchmarks/observation";
import {
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES,
  BENCHMARK_OBSERVATION_BINDINGS,
  type PublicBenchmarkRuntimeKeyFor,
  transformBenchmarkSourceValue,
} from "../../benchmarks/registry";
import { canonicalReasoningEffort, parseModelEffort } from "../../identity/normalization";
import { asFiniteNumber, asNonEmptyString, asRecord } from "../../runtime";
import { agentsLastExamBenchmarkScore } from "../../sources/agents-last-exam/leaderboard";
import { aleBenchModelEffort } from "../../sources/ale-bench/leaderboard";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../../sources/artificial-analysis/benchmark-resources";
import type { ModelAtlasSourceData } from "../../sources/assembly";
import { frontierCodeVersion } from "../../sources/frontier-code/leaderboard";

export type BenchmarkSourceRow = {
  id: string | null;
  identity: string;
  label: string;
  provider: string | null;
  reasoningEffort: string | null;
  value: number;
  /** The source-published version this row belongs to; null where the source publishes none. */
  version: string | null;
};

export type BenchmarkRowsByKey = Readonly<Record<string, readonly BenchmarkSourceRow[]>>;

/** Publish a benchmark's version only when all of its current rows report the same one. */
export function observedBenchmarkVersions(rowsByKey: BenchmarkRowsByKey): Record<string, string> {
  return Object.fromEntries(
    Object.entries(rowsByKey).flatMap(([key, rows]) => {
      const [version, ...others] = new Set(rows.flatMap((row) => row.version ?? []));
      return version != null && others.length === 0 ? [[key, version]] : [];
    }),
  );
}

export type BenchmarkRowDraft = {
  key: string;
  id?: string | null;
  identity?: string | null;
  label: string | null;
  provider?: string | null;
  reasoningEffort?: unknown;
  value: unknown;
  version?: unknown;
};

type ModelScoreDraftRow = {
  model_id: string;
  model: string;
  provider: string | null;
  reasoning_effort?: unknown;
  score: unknown;
  metadata: Readonly<Record<string, unknown>>;
};

function benchmarkRowDrafts<T>(
  key: string,
  rows: readonly T[],
  toDraft: (row: T) => Omit<BenchmarkRowDraft, "key">,
): BenchmarkRowDraft[] {
  return rows.map((row) => ({
    key,
    ...toDraft(row),
  }));
}

function modelScoreRowDrafts(
  key: string,
  rows: readonly ModelScoreDraftRow[],
): BenchmarkRowDraft[] {
  return benchmarkRowDrafts(key, rows, (row) => ({
    id: row.model_id,
    identity: row.model_id,
    label: row.model,
    provider: row.provider,
    reasoningEffort: row.reasoning_effort,
    value: row.score,
    version: row.metadata.benchmark_version,
  }));
}

/** Riemann rows share one effort-aware health identity across live and restored source data. */
export function riemannBenchmarkDraft(row: {
  model: string;
  provider: string | null;
  score: unknown;
}): BenchmarkRowDraft {
  const parsed = parseModelEffort(row.model);
  return {
    key: "riemann_bench",
    identity: parsed.baseModel,
    label: row.model,
    provider: row.provider,
    reasoningEffort: parsed.reasoningEffort,
    value: row.score,
  };
}

function benchmarkObservationSourceDrafts(sourceData: ModelAtlasSourceData): BenchmarkRowDraft[] {
  return BENCHMARK_OBSERVATION_BINDINGS.flatMap(({ sourceDataKey }) => {
    const source = sourceData[sourceDataKey as keyof ModelAtlasSourceData] as
      | { rows?: readonly BenchmarkObservationRow[] }
      | undefined;
    if (source?.rows == null) {
      throw new Error(`Benchmark observation source-data rows are missing: ${sourceDataKey}`);
    }
    return source.rows
      .filter(
        (row) => isAssignableBenchmarkObservation(row) || row.metadata.source_series === "vals",
      )
      .map((row) => ({
        key: row.benchmark_key,
        id: row.model_id,
        identity: row.base_model,
        label: row.model,
        provider: row.model_creator,
        reasoningEffort: row.reasoning_effort,
        value: row.canonical_value,
        version: row.metadata.benchmark_version,
      }));
  });
}

function addBenchmarkRowDraft(
  rowsByKey: Record<string, BenchmarkSourceRow[]>,
  draft: BenchmarkRowDraft,
): void {
  const value = asFiniteNumber(draft.value);
  if (draft.label == null || value == null) {
    return;
  }
  let rows = rowsByKey[draft.key];
  if (rows == null) {
    rows = [];
    rowsByKey[draft.key] = rows;
  }
  rows.push({
    id: draft.id ?? null,
    identity: draft.identity ?? draft.id ?? `${draft.provider ?? "benchmark"}/${draft.label}`,
    label: draft.label,
    provider: draft.provider ?? null,
    reasoningEffort: canonicalReasoningEffort(draft.reasoningEffort),
    value,
    version: asNonEmptyString(draft.version),
  });
}

/** Only labeled finite benchmark evidence is allowed into update-health comparisons. */
export function finalizeBenchmarkRows(drafts: readonly BenchmarkRowDraft[]): BenchmarkRowsByKey {
  const rowsByKey: Record<string, BenchmarkSourceRow[]> = {};
  for (const draft of drafts) {
    addBenchmarkRowDraft(rowsByKey, draft);
  }
  return rowsByKey;
}

function artificialAnalysisBenchmarkRowDrafts(
  sourceData: ModelAtlasSourceData,
): BenchmarkRowDraft[] {
  const indexDrafts = sourceData.artificialAnalysis.rows.flatMap((row) => {
    const record = asRecord(row);
    const modelId =
      typeof record.model_id === "string" && record.model_id.length > 0 ? record.model_id : null;
    const label = typeof record.name === "string" && record.name.length > 0 ? record.name : modelId;
    if (label == null) {
      return [];
    }
    return [
      {
        key: "aa_intelligence_index",
        id: modelId,
        identity: modelId,
        label,
        provider: null,
        reasoningEffort: record.reasoning_effort,
        value: asRecord(record.intelligence).intelligence_index,
        version: record.intelligence_index_version,
      },
    ];
  });
  return [
    ...indexDrafts,
    ...artificialAnalysisResourceDrafts(sourceData.artificialAnalysisBenchmarkResources.rows),
  ];
}

/** Evaluation-page rows enter health checks under their page's benchmark on the scoring scale. */
export function artificialAnalysisResourceDrafts(
  rows: readonly ArtificialAnalysisBenchmarkResourceRow[],
): BenchmarkRowDraft[] {
  return ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.flatMap(({ benchmarkKey }) =>
    benchmarkRowDrafts(
      benchmarkKey,
      rows.filter((row) => row.benchmark_key === benchmarkKey),
      (row) => ({
        id: row.model_id,
        identity: row.model_id,
        label: row.model,
        provider: row.provider,
        reasoningEffort: row.reasoning_effort,
        value: transformBenchmarkSourceValue(benchmarkKey, row.score),
        version: row.benchmark_version,
      }),
    ),
  );
}

type StandaloneSourceRowAdapter = (sourceData: ModelAtlasSourceData) => BenchmarkRowDraft[];

const STANDALONE_SOURCE_ROW_ADAPTERS = {
  agents_last_exam: (sourceData) =>
    benchmarkRowDrafts("agents_last_exam", sourceData.agentsLastExam.rows, (row) => ({
      label: row.model,
      value: agentsLastExamBenchmarkScore(row),
    })),
  ale_bench: (sourceData) => [
    ...benchmarkRowDrafts("ale_bench", sourceData.aleBench.sourceDefaultRows, (row) => ({
      id: row.base_model,
      identity: row.base_model,
      label: row.base_model,
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
    ...sourceData.aleBench.rows.flatMap((row): BenchmarkRowDraft[] => {
      if (!("epoch" in row)) return [];
      const effort = aleBenchModelEffort(row.model);
      return [
        {
          key: "ale_bench",
          id: effort.baseModel,
          identity: effort.baseModel,
          label: effort.baseModel,
          reasoningEffort: effort.reasoningEffort,
          value: row.epoch.performance,
        },
      ];
    }),
  ],
  arena_agent: (sourceData) =>
    benchmarkRowDrafts("arena_agent", sourceData.arenaAgent.rows, (row) => ({
      id: row.contender_name,
      identity: row.base_model,
      label: row.model,
      provider: row.organization,
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
  blueprint_bench_2: (sourceData) =>
    benchmarkRowDrafts("blueprint_bench_2", sourceData.blueprintBench.rows, (row) => ({
      label: row.model,
      value: row.score,
    })),
  frontier_code: (sourceData) =>
    benchmarkRowDrafts(
      "frontier_code",
      sourceData.frontierCode.rows.filter((row) => row.score_eligible),
      (row) => ({
        id: row.base_model,
        identity: row.base_model,
        label: row.model,
        reasoningEffort: row.reasoning_effort,
        value: row.score,
        version: frontierCodeVersion(row.revision),
      }),
    ),
  terminal_bench_4: (sourceData) =>
    benchmarkRowDrafts("terminal_bench_4", sourceData.terminalBench4.rows, (row) => ({
      id: row.base_model,
      identity: row.base_model,
      label: row.model,
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
  vending_bench_2: (sourceData) =>
    benchmarkRowDrafts("vending_bench_2", sourceData.vendingBench2.rows, (row) => ({
      identity: row.base_model,
      label: row.model,
      reasoningEffort: row.reasoning_effort,
      value: row.final_balance_usd,
    })),
} satisfies Record<PublicBenchmarkRuntimeKeyFor<"standalone">, StandaloneSourceRowAdapter>;

/** Live source data enters benchmark-update health through the same draft contract as database restorations. */
export function benchmarkRowsFromSourceData(sourceData: ModelAtlasSourceData): BenchmarkRowsByKey {
  return finalizeBenchmarkRows([
    ...benchmarkObservationSourceDrafts(sourceData),
    ...artificialAnalysisBenchmarkRowDrafts(sourceData),
    ...Object.values(STANDALONE_SOURCE_ROW_ADAPTERS).flatMap((adapter) => adapter(sourceData)),
    ...sourceData.riemannBench.rows.map(riemannBenchmarkDraft),
    ...modelScoreRowDrafts("vals_index", sourceData.valsIndex.rows),
  ]);
}
