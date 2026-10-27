/** Translate persisted SQLite row groups into benchmark update source rows. */

import {
  isAssignableBenchmarkObservation,
  parseBenchmarkObservationMetadata,
} from "../../benchmarks/observation";
import {
  ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS,
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationRowsKey,
  type PublicBenchmarkRuntimeKeyFor,
} from "../../benchmarks/registry";
import { asFiniteNumber, asNonEmptyString } from "../../runtime";
import { agentsLastExamBenchmarkScore } from "../../sources/agents-last-exam/leaderboard";
import { artificialAnalysisBenchmarkResourceRawCacheFromRows } from "../../sources/artificial-analysis/cache";
import {
  asDeepSWERawLeaderboardRow,
  preferredDeepSWELeaderboardRows,
} from "../../sources/deep-swe/leaderboard";
import { frontierCodeVersion } from "../../sources/frontier-code/leaderboard";
import {
  artificialAnalysisResourceDrafts,
  type BenchmarkRowDraft,
  type BenchmarkRowsByKey,
  finalizeBenchmarkRows,
  riemannBenchmarkDraft,
} from "./source-rows";

type DbBenchmarkRow = Record<string, unknown>;

type DbSourceSpec = {
  key: string;
  rows: readonly DbBenchmarkRow[];
  value: (row: DbBenchmarkRow) => unknown;
  providerColumn?: string;
  rowKind?: string;
  edition?: (row: DbBenchmarkRow) => unknown;
};

type BenchmarkObservationDbRows = {
  [Key in BenchmarkObservationRowsKey]: readonly DbBenchmarkRow[];
};

type BenchmarkDbRows = BenchmarkObservationDbRows & {
  artificialAnalysisRows: readonly DbBenchmarkRow[];
  artificialAnalysisBenchmarkResourceRows: readonly DbBenchmarkRow[];
  arenaAgentRows: readonly DbBenchmarkRow[];
  agentsLastExamRows: readonly DbBenchmarkRow[];
  aleBenchRows: readonly DbBenchmarkRow[];
  blueprintBenchRows: readonly DbBenchmarkRow[];
  deepSWERows: readonly DbBenchmarkRow[];
  frontierCodeRows: readonly DbBenchmarkRow[];
  riemannBenchRows: readonly DbBenchmarkRow[];
  terminalBench4Rows: readonly DbBenchmarkRow[];
  valsIndexTaskScoreRows: readonly DbBenchmarkRow[];
  vendingBench2Rows: readonly DbBenchmarkRow[];
};

function isAssignableBenchmarkObservationDbRow(row: DbBenchmarkRow): boolean {
  const metadata = parseBenchmarkObservationMetadata(row.metadata_json);
  return metadata == null || isAssignableBenchmarkObservation({ metadata });
}

function benchmarkObservationDbDrafts(rows: BenchmarkDbRows): BenchmarkRowDraft[] {
  return BENCHMARK_OBSERVATION_BINDINGS.flatMap(({ benchmark, sourceRowsKey }) => {
    const sourceRows = rows[sourceRowsKey];
    if (!Array.isArray(sourceRows)) {
      throw new Error(`Persisted benchmark observation rows are missing: ${sourceRowsKey}`);
    }
    return sourceRows.filter(isAssignableBenchmarkObservationDbRow).flatMap((row) => {
      return [
        {
          key: benchmark,
          id: asNonEmptyString(row.model_id),
          identity: asNonEmptyString(row.base_model),
          label: asNonEmptyString(row.model),
          provider: asNonEmptyString(row.model_creator),
          reasoningEffort: row.reasoning_effort,
          value: row.canonical_value,
          edition: parseBenchmarkObservationMetadata(row.metadata_json)?.benchmark_version,
        },
      ];
    });
  });
}

/** Persisted Agents' Last Exam health rows use the same median-or-mean rule as scoring. */
function agentsLastExamDbScore(row: DbBenchmarkRow): number | null {
  const medianScore = asFiniteNumber(row.median_score);
  const meanScore = asFiniteNumber(row.mean_score);
  return medianScore == null || meanScore == null
    ? null
    : agentsLastExamBenchmarkScore({
        median_score: medianScore,
        mean_score: meanScore,
      });
}

function dbSourceDrafts(source: DbSourceSpec): BenchmarkRowDraft[] {
  return source.rows.flatMap((row) => {
    if (source.rowKind != null && asNonEmptyString(row.row_kind) !== source.rowKind) return [];
    return [
      {
        key: source.key,
        id: asNonEmptyString(row.model_id),
        label: asNonEmptyString(row.model),
        provider:
          source.providerColumn == null ? null : asNonEmptyString(row[source.providerColumn]),
        value: source.value(row),
        edition: source.edition?.(row),
      },
    ];
  });
}

type StandaloneDbRowAdapter = (rows: BenchmarkDbRows) => BenchmarkRowDraft[];

const STANDALONE_DB_ROW_ADAPTERS = {
  agents_last_exam: (rows) =>
    dbSourceDrafts({
      key: "agents_last_exam",
      rows: rows.agentsLastExamRows,
      value: agentsLastExamDbScore,
      rowKind: "model_score",
    }),
  ale_bench: (rows) =>
    rows.aleBenchRows.flatMap((row) =>
      asFiniteNumber(row.num_self_refine) === 1
        ? [
            {
              key: "ale_bench",
              id: asNonEmptyString(row.base_model),
              identity: asNonEmptyString(row.base_model),
              label: asNonEmptyString(row.base_model),
              reasoningEffort: row.reasoning_effort,
              value: row.performance_mean,
            },
          ]
        : [],
    ),
  arena_agent: (rows) =>
    rows.arenaAgentRows.map((row) => ({
      key: "arena_agent",
      id: asNonEmptyString(row.contender_name),
      identity: asNonEmptyString(row.base_model),
      label: asNonEmptyString(row.model),
      provider: asNonEmptyString(row.organization),
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
  blueprint_bench_2: (rows) =>
    dbSourceDrafts({
      key: "blueprint_bench_2",
      rows: rows.blueprintBenchRows,
      value: (row) => row.score,
    }),
  deep_swe: (rows) =>
    preferredDeepSWELeaderboardRows(
      rows.deepSWERows.flatMap((row) => {
        const parsed = asDeepSWERawLeaderboardRow(row);
        return parsed == null ? [] : [parsed];
      }),
    ).map((row) => ({
      key: "deep_swe",
      id: row.model,
      identity: row.model,
      label: row.model,
      reasoningEffort: row.reasoning_effort,
      value: row.pass_at_1,
    })),
  frontier_code: (rows) =>
    rows.frontierCodeRows.flatMap((row) => {
      const revision = asNonEmptyString(row.revision);
      return row.score_eligible === 1
        ? [
            {
              key: "frontier_code",
              id: asNonEmptyString(row.base_model),
              identity: asNonEmptyString(row.base_model),
              label: asNonEmptyString(row.model),
              reasoningEffort: row.reasoning_effort,
              value: row.main_score,
              edition: revision == null ? null : frontierCodeVersion(revision),
            },
          ]
        : [];
    }),
  terminal_bench_4: (rows) =>
    rows.terminalBench4Rows.map((row) => ({
      key: "terminal_bench_4",
      id: asNonEmptyString(row.base_model),
      identity: asNonEmptyString(row.base_model),
      label: asNonEmptyString(row.model),
      reasoningEffort: row.reasoning_effort,
      value: row.score,
    })),
  vending_bench_2: (rows) =>
    rows.vendingBench2Rows.map((row) => ({
      key: "vending_bench_2",
      identity: asNonEmptyString(row.base_model),
      label: asNonEmptyString(row.model),
      reasoningEffort: row.reasoning_effort,
      value: row.final_balance_usd,
    })),
} satisfies Record<PublicBenchmarkRuntimeKeyFor<"standalone">, StandaloneDbRowAdapter>;

/** Persisted benchmark rows enter update-health checks through the same benchmark-keyed contract as live rows. */
export function benchmarkRowsFromDb(rows: BenchmarkDbRows): BenchmarkRowsByKey {
  return finalizeBenchmarkRows([
    ...benchmarkObservationDbDrafts(rows),
    ...rows.artificialAnalysisRows.flatMap((row) => {
      const modelId = asNonEmptyString(row.model_id);
      const label = asNonEmptyString(row.name) ?? asNonEmptyString(row.short_name) ?? modelId;
      return label == null
        ? []
        : ARTIFICIAL_ANALYSIS_CONTEXT_BENCHMARK_KEYS.map((key) => ({
            key,
            id: modelId,
            identity: modelId,
            label,
            provider: null,
            reasoningEffort: row.reasoning_effort,
            value: row[key],
          }));
    }),
    ...artificialAnalysisResourceDrafts(
      artificialAnalysisBenchmarkResourceRawCacheFromRows([
        ...rows.artificialAnalysisBenchmarkResourceRows,
      ])?.rows ?? [],
    ),
    ...Object.values(STANDALONE_DB_ROW_ADAPTERS).flatMap((adapter) => adapter(rows)),
    ...rows.riemannBenchRows.flatMap((row) => {
      const model = asNonEmptyString(row.model);
      return model == null
        ? []
        : [
            riemannBenchmarkDraft({
              model,
              provider: asNonEmptyString(row.provider),
              score: row.score,
            }),
          ];
    }),
    ...dbSourceDrafts({
      key: "vals_index",
      rows: rows.valsIndexTaskScoreRows,
      value: (row) => row.score,
      providerColumn: "provider",
      rowKind: "overall",
      edition: (row) => parseBenchmarkObservationMetadata(row.metadata_json)?.benchmark_version,
    }),
  ]);
}
