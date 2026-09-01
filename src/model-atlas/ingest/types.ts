/** Ingest contracts for raw caches, source snapshots, and the handoff into storage writers and payload readers. */

import type { BenchmarkObservationRow } from "../benchmarks/observation";
import type { BENCHMARK_OBSERVATION_BINDINGS } from "../benchmarks/registry";
import type { JsonObject } from "../runtime";
import type { AgentArenaModelScoreRow } from "../scrapers/benchmarks/agent-arena";
import type {
  AgentsLastExamHarnessRow,
  AgentsLastExamModelScoreRow,
} from "../scrapers/benchmarks/agents-last-exam";
import type { AleBenchConfigurationRow } from "../scrapers/benchmarks/ale-bench";
import type { ArtificialAnalysisBenchmarkResourceRow } from "../scrapers/benchmarks/artificial-analysis/results";
import type { BlueprintBenchModelScoreRow } from "../scrapers/benchmarks/blueprint-bench";
import type { CursorBenchModelScoreRow } from "../scrapers/benchmarks/cursorbench";
import type { DeepSWERawLeaderboardRow } from "../scrapers/benchmarks/deep-swe";
import type { FrontierCodeModelEffortRow } from "../scrapers/benchmarks/frontier-code";
import type { MercorApexAgentsRow } from "../scrapers/benchmarks/mercor-apex-agents";
import type { RiemannBenchModelScoreRow } from "../scrapers/benchmarks/surge/riemann-bench";
import type { TerminalBench4ModelAgentRow } from "../scrapers/benchmarks/terminal-bench-4";
import type {
  HarveyLabModelScoreRow,
  HarveyLabTaskRow,
} from "../scrapers/benchmarks/vals/harvey-lab";
import type {
  ValsIndexModelScoreRow,
  ValsIndexTaskScoreRow,
} from "../scrapers/benchmarks/vals/index-benchmark";
import type { VendingBench2ModelScoreRow } from "../scrapers/benchmarks/vending-bench-2";
import type { ModelsDevFlatModel, ModelsDevPayload } from "../scrapers/models-dev";
import type { RawSourceName } from "./source-registry";

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

export type DatabaseBuildResult = {
  path: string;
  source_rows: Record<string, number>;
  source_cache: Record<RawSourceName, RawSourceCacheStatus>;
  source_health: ModelAtlasSourceHealth;
  final_model_count: number;
};

export type DatabaseBuildOptions = {
  replaceSourceRows?: boolean;
};

export type DebugTraceRow = {
  artificial_analysis_id: string | null;
  artificial_analysis_slug: string | null;
  artificial_analysis_name: string | null;
  artificial_analysis_raw_row_index: number | null;
  candidate_rank: number | null;
  candidate_model_id: string | null;
  candidate_provider_id: string | null;
  candidate_provider_name: string | null;
  candidate_name: string | null;
  candidate_score: number | null;
  selected: boolean;
  rejection_reason:
    | "selected"
    | "variant_conflict"
    | "lower_rank"
    | "not_selected"
    | "unmatched_or_voided";
  selected_model_id: string | null;
  models_dev_row_index: number | null;
  openrouter_model_id: string | null;
  openrouter_model_stats_row_index: number | null;
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
  harveyLabRows: HarveyLabTaskRow[];
  harveyLabModelScoreRows: HarveyLabModelScoreRow[];
  mercorApexAgentsRows: MercorApexAgentsRow[];
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
    harveyLab: number | null;
    mercorApexAgents: number | null;
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
