/** Benchmark source-row drafts keep live source snapshots and restored database rows on one health-check contract. */

import type { BenchmarkObservationRow } from "../../benchmarks/observation";
import {
  ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES,
  ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS,
  BENCHMARK_OBSERVATION_BINDINGS,
  type PublicBenchmarkRuntimeKeyFor,
  transformBenchmarkSourceValue,
} from "../../benchmarks/registry";
import { agentsLastExamBenchmarkScore } from "../../benchmarks/scrapers/agents-last-exam";
import { cursorBenchCanonicalModelName } from "../../benchmarks/scrapers/cursorbench";
import {
  benchmarkModelEffort,
  canonicalReasoningEffort,
  normalizeModelToken,
} from "../../identity/normalization";
import type { ModelAtlasSourceData } from "../../ingest/assembly";
import { asFiniteNumber, asRecord } from "../../runtime";
import { collapseModelVariants } from "../model-catalog";

export type BenchmarkSourceRow = {
  id: string | null;
  identity: string;
  label: string;
  provider: string | null;
  value: number;
};

export type BenchmarkRowsByKey = Readonly<Record<string, readonly BenchmarkSourceRow[]>>;

export type BenchmarkRowDraft = {
  key: string;
  id?: string | null;
  identity?: string | null;
  label: string | null;
  provider?: string | null;
  reasoningEffort?: unknown;
  value: unknown;
};

type AggregatableBenchmarkSourceRow = BenchmarkSourceRow & {
  reasoningEffort: unknown;
};

type ModelScoreDraftRow = {
  model_id: string;
  model: string;
  provider: string | null;
  reasoning_effort?: unknown;
  score: unknown;
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
  }));
}

/** Riemann rows share one effort-aware health identity across live and restored source data. */
export function riemannBenchmarkDraft(row: {
  model: string;
  provider: string | null;
  score: unknown;
}): BenchmarkRowDraft {
  const parsed = benchmarkModelEffort(row.model);
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
    return source.rows.map((row) => ({
      key: row.benchmark_key,
      id: row.model_id,
      identity: row.base_model,
      label: row.model,
      provider: row.model_creator,
      reasoningEffort: row.reasoning_effort,
      value: row.canonical_value,
    }));
  });
}

function addBenchmarkRowDraft(
  rowsByKey: Record<string, AggregatableBenchmarkSourceRow[]>,
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
  });
}

function aggregateBenchmarkSourceRows(
  key: string,
  rows: AggregatableBenchmarkSourceRow[],
): BenchmarkSourceRow[] {
  return collapseModelVariants(
    rows.map((row) => {
      const identity = normalizeModelToken(row.identity);
      return {
        id: identity,
        artificial_analysis_id: identity,
        artificial_analysis_slug: identity.split("/").at(-1),
        reasoning_effort: row.reasoningEffort,
        benchmarks: { [key]: row.value },
        benchmark_source_row: {
          id: row.id,
          identity: row.identity,
          label: row.label,
          provider: row.provider,
          value: row.value,
        } satisfies BenchmarkSourceRow,
      };
    }),
  ).map((row) => row.benchmark_source_row as BenchmarkSourceRow);
}

/** Only labeled finite benchmark evidence is allowed into update-health comparisons. */
export function finalizeBenchmarkRows(drafts: readonly BenchmarkRowDraft[]): BenchmarkRowsByKey {
  const rowsByKey: Record<string, AggregatableBenchmarkSourceRow[]> = {};
  for (const draft of drafts) {
    addBenchmarkRowDraft(rowsByKey, draft);
  }
  return Object.fromEntries(
    Object.entries(rowsByKey).map(([key, rows]) => [key, aggregateBenchmarkSourceRows(key, rows)]),
  );
}

function artificialAnalysisBenchmarkRowDrafts(
  sourceData: ModelAtlasSourceData,
): BenchmarkRowDraft[] {
  const contextDrafts = sourceData.artificialAnalysis.rows.flatMap((row) => {
    const record = asRecord(row);
    const modelId =
      typeof record.model_id === "string" && record.model_id.length > 0 ? record.model_id : null;
    const label = typeof record.name === "string" && record.name.length > 0 ? record.name : modelId;
    const benchmarks = asRecord(record.benchmarks);
    if (label == null) {
      return [];
    }
    return ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS.map((key) => ({
      key,
      id: modelId,
      identity: modelId,
      label,
      provider: null,
      reasoningEffort: record.reasoning_effort,
      value: benchmarks[key],
    }));
  });
  const resourceDrafts = ARTIFICIAL_ANALYSIS_BENCHMARK_RESOURCE_PAGES.flatMap(({ benchmarkKey }) =>
    benchmarkRowDrafts(
      benchmarkKey,
      sourceData.artificialAnalysisBenchmarkResources.rows.filter(
        (row) => row.benchmark_key === benchmarkKey,
      ),
      (row) => ({
        id: row.model_id,
        identity: row.model_id,
        label: row.model,
        provider: row.provider,
        reasoningEffort: row.reasoning_effort,
        value: transformBenchmarkSourceValue(benchmarkKey, row.score),
      }),
    ),
  );
  return [...contextDrafts, ...resourceDrafts];
}

type StandaloneBenchmarkAdapter = (sourceData: ModelAtlasSourceData) => BenchmarkRowDraft[];

/** Standalone benchmark adapters retain source-specific row rules behind one exhaustive registry. */
const STANDALONE_BENCHMARK_ADAPTERS = {
  agent_arena: (sourceData) =>
    benchmarkRowDrafts("agent_arena", sourceData.agentArena.rows, (row) => ({
      id: row.contender_name,
      identity: row.base_model,
      label: row.model,
      provider: row.organization,
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
  agents_last_exam: (sourceData) =>
    benchmarkRowDrafts("agents_last_exam", sourceData.agentsLastExam.rows, (row) => ({
      label: row.model,
      value: agentsLastExamBenchmarkScore(row),
    })),
  ale_bench: (sourceData) =>
    benchmarkRowDrafts("ale_bench", sourceData.aleBench.sourceDefaultRows, (row) => ({
      id: row.base_model,
      identity: row.base_model,
      label: row.base_model,
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
  blueprint_bench_2: (sourceData) =>
    benchmarkRowDrafts("blueprint_bench_2", sourceData.blueprintBench.rows, (row) => ({
      label: row.model,
      value: row.score,
    })),
  cursorbench: (sourceData) =>
    benchmarkRowDrafts("cursorbench", sourceData.cursorBench.rows, (row) => {
      const canonicalName = cursorBenchCanonicalModelName(row.base_model);
      return {
        identity: canonicalName,
        label: canonicalName,
        reasoningEffort: row.reasoning_effort,
        value: row.score,
      };
    }),
  deep_swe: (sourceData) =>
    benchmarkRowDrafts("deep_swe", sourceData.deepSWE.sourceDefaultRows, (row) => ({
      id: row.model,
      identity: row.model,
      label: row.model,
      reasoningEffort: row.reasoning_effort,
      value: row.pass_at_1,
    })),
  frontier_bench: (sourceData) =>
    benchmarkRowDrafts("frontier_bench", sourceData.frontierBench.rows, (row) => ({
      id: row.base_model,
      identity: row.base_model,
      label: row.model,
      reasoningEffort: row.reasoning_effort,
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
      }),
    ),
  vending_bench_2: (sourceData) =>
    benchmarkRowDrafts("vending_bench_2", sourceData.vendingBench2.rows, (row) => ({
      identity: row.base_model,
      label: row.model,
      reasoningEffort: row.reasoning_effort,
      value: row.final_balance_usd,
    })),
} satisfies Record<PublicBenchmarkRuntimeKeyFor<"standalone">, StandaloneBenchmarkAdapter>;

/** Live source data enters benchmark-update health through the same draft contract as database restorations. */
export function benchmarkRowsFromSourceData(sourceData: ModelAtlasSourceData): BenchmarkRowsByKey {
  return finalizeBenchmarkRows([
    ...benchmarkObservationSourceDrafts(sourceData),
    ...artificialAnalysisBenchmarkRowDrafts(sourceData),
    ...Object.values(STANDALONE_BENCHMARK_ADAPTERS).flatMap((adapter) => adapter(sourceData)),
    ...sourceData.riemannBench.rows.map(riemannBenchmarkDraft),
    ...modelScoreRowDrafts("harvey_lab", sourceData.harveyLab.rows),
    ...modelScoreRowDrafts("vals_index", sourceData.valsIndex.rows),
  ]);
}
