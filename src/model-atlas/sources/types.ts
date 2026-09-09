/** Ingest contracts for raw caches, source snapshots, and the handoff into storage writers and payload readers. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import type { BENCHMARK_OBSERVATION_BINDINGS } from "../benchmarks/registry";
import type { JsonObject } from "../runtime";
import type { AgentArenaModelScoreRow } from "./agent-arena/leaderboard";
import type {
  AgentsLastExamHarnessRow,
  AgentsLastExamModelScoreRow,
} from "./agents-last-exam/leaderboard";
import type { AleBenchConfigurationRow } from "./ale-bench/leaderboard";
import type { ArtificialAnalysisBenchmarkResourceRow } from "./artificial-analysis/benchmark-resources";
import type { BlueprintBenchModelScoreRow } from "./blueprint-bench/leaderboard";
import type { CursorBenchModelScoreRow } from "./cursorbench/leaderboard";
import type { DeepSWERawLeaderboardRow } from "./deep-swe/leaderboard";
import type { FrontierCodeModelEffortRow } from "./frontier-code/leaderboard";
import type { ModelsDevFlatModel, ModelsDevPayload } from "./models-dev/catalog";
import type { RawSourceName } from "./registry";
import type { RiemannBenchModelScoreRow } from "./surge/riemann-bench";
import type { TerminalBench4ModelAgentRow } from "./terminal-bench-4/leaderboard";
import type { ValsIndexModelScoreRow, ValsIndexTaskScoreRow } from "./vals/index-benchmark";
import type { VendingBench2ModelScoreRow } from "./vending-bench-2/leaderboard";

export type ModelAtlasSourceHealthStatus = "cache_hit" | "fresh" | "using_cached_rows" | "empty";

export type ModelAtlasSourceQuarantine = {
  row_key: string;
  row_label: string | null;
  missing_from_source_since_epoch_seconds: number | null;
};

export type ModelAtlasSourceHealthEntry = {
  status: ModelAtlasSourceHealthStatus;
  last_fetch_epoch_seconds: number | null;
  source_input_count: number;
  active_row_count: number;
  quarantined_row_count: number;
  quarantined_rows: ModelAtlasSourceQuarantine[];
};

export type ModelAtlasSourceHealth = {
  generated_at_epoch_seconds: number | null;
  sources: Record<string, ModelAtlasSourceHealthEntry>;
};

export type SourceRefreshOptions = {
  replaceSourceRows?: boolean;
};

export type RawSourceCacheStatus = {
  last_fetch_epoch_seconds: number | null;
  source_input_count: number;
  cache_hit: boolean;
  refreshed: boolean;
};

export type SourceRowStatus = "active" | "quarantined_missing_from_source";

export type SourceRowState = {
  source: RawSourceName;
  row_key: string;
  row_label: string | null;
  status: SourceRowStatus;
  missing_from_source_since_epoch_seconds: number | null;
};

type BenchmarkObservationSnapshotRows = {
  [Binding in (typeof BENCHMARK_OBSERVATION_BINDINGS)[number] as Binding["sourceRowsKey"]]: BenchmarkObservationRow[];
};

type BenchmarkObservationFetchedAt = {
  [Binding in (typeof BENCHMARK_OBSERVATION_BINDINGS)[number] as Binding["sourceDataKey"]]:
    | number
    | null;
};

export type SourceSnapshots = BenchmarkObservationSnapshotRows & {
  artificialAnalysisRawRows: JsonObject[];
  artificialAnalysisSelectedRows: JsonObject[];
  artificialAnalysisBenchmarkResourceRows: ArtificialAnalysisBenchmarkResourceRow[];
  modelsDevPayload: ModelsDevPayload;
  modelsDevModels: ModelsDevFlatModel[];
  modelsDevFetchedAt: number | null;
  modelsDevStatusCode: number | null;
  agentArenaModelScoreRows: AgentArenaModelScoreRow[];
  agentsLastExamRows: AgentsLastExamHarnessRow[];
  agentsLastExamModelScores: AgentsLastExamModelScoreRow[];
  aleBenchConfigurationRows: AleBenchConfigurationRow[];
  blueprintBenchModelScoreRows: BlueprintBenchModelScoreRow[];
  cursorBenchModelScoreRows: CursorBenchModelScoreRow[];
  deepSWERawRows: DeepSWERawLeaderboardRow[];
  frontierCodeRows: FrontierCodeModelEffortRow[];
  riemannBenchModelScoreRows: RiemannBenchModelScoreRow[];
  riemannBenchSourceUrl: string;
  terminalBench4Rows: TerminalBench4ModelAgentRow[];
  valsIndexRows: ValsIndexTaskScoreRow[];
  valsIndexModelScoreRows: ValsIndexModelScoreRow[];
  vendingBench2ModelScoreRows: VendingBench2ModelScoreRow[];
  vendingBench2DataUrl: string | null;
  sourceRowStates: SourceRowState[];
  fetchedAt: BenchmarkObservationFetchedAt & {
    artificialAnalysis: number | null;
    artificialAnalysisBenchmarkResources: number | null;
    agentArena: number | null;
    agentsLastExam: number | null;
    aleBench: number | null;
    blueprintBench: number | null;
    cursorBench: number | null;
    deepSWE: number | null;
    frontierCode: number | null;
    riemannBench: number | null;
    terminalBench4: number | null;
    valsIndex: number | null;
    vendingBench2: number | null;
  };
};

export type SourceSnapshotStatus = {
  source: RawSourceName;
  fetchedAt: number | null;
  sourceInputCount: number;
  sourceRowStates: SourceRowState[];
  fetchedAtKey?: keyof SourceSnapshots["fetchedAt"];
};
