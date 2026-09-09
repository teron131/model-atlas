/** Source-data contracts and lookup assembly normalize raw provider rows for matching and scoring. */

import {
  type BenchmarkObservationLookup,
  type BenchmarkObservationRow,
  buildBenchmarkObservationLookup,
} from "../../benchmarks/observation";
import {
  BENCHMARK_OBSERVATION_BINDINGS,
  type BenchmarkObservationBinding,
} from "../../benchmarks/registry";
import { buildBenchmarkModelMap, modelSlugFromModelId } from "../../identity/normalization";
import type {
  AgentArenaModelScoreRow,
  AgentArenaRowsByModelName,
} from "../agent-arena/leaderboard";
import {
  type AgentsLastExamModelScoreRow,
  type AgentsLastExamRowsByModelName,
  buildAgentsLastExamMap,
} from "../agents-last-exam/leaderboard";
import {
  type AleBenchConfigurationRow,
  type AleBenchModelScoreRow,
  type AleBenchRowsByModelName,
  summarizeAleBenchSourceDefaultRows,
} from "../ale-bench/leaderboard";
import {
  type ArtificialAnalysisBenchmarkResourceLookup,
  type ArtificialAnalysisBenchmarkResourceRow,
  buildArtificialAnalysisResourceLookup,
  buildArtificialAnalysisSourceDefaultResourceLookup,
} from "../artificial-analysis/benchmark-resources";
import {
  type BlueprintBenchModelScoreRow,
  type BlueprintBenchRowsByModelName,
  buildBlueprintBenchMap,
} from "../blueprint-bench/leaderboard";
import {
  buildCursorBenchMap,
  type CursorBenchModelScoreRow,
  type CursorBenchRowsByModelName,
} from "../cursorbench/leaderboard";
import {
  buildDeepSWEMap,
  type DeepSWELeaderboardRow,
  type DeepSWERowsByModelName,
} from "../deep-swe/leaderboard";
import type {
  FrontierCodeModelEffortRow,
  FrontierCodeRowsByModelName,
} from "../frontier-code/leaderboard";
import type { ModelsDevFlatModel } from "../models-dev/catalog";
import {
  buildRiemannBenchMap,
  type RiemannBenchModelScoreRow,
  type RiemannBenchRowsByModelName,
} from "../surge/riemann-bench";
import {
  buildTerminalBench4Map,
  type TerminalBench4ModelAgentRow,
  type TerminalBench4RowsByModelName,
} from "../terminal-bench-4/leaderboard";
import {
  buildValsIndexMap,
  type ValsIndexModelScoreRow,
  type ValsIndexRowsByModelName,
} from "../vals/index-benchmark";
import type {
  VendingBench2ModelScoreRow,
  VendingBench2RowsByModelName,
} from "../vending-bench-2/leaderboard";
import { pickPreferredModelsDevRows } from "./policy";

export type ArtificialAnalysisModel = {
  model_id?: unknown;
  name?: unknown;
  provider?: unknown;
  logo?: unknown;
  release_date?: unknown;
  input_modalities?: unknown;
  output_modalities?: unknown;
  reasoning?: unknown;
  reasoning_effort?: unknown;
  cost?: unknown;
  median_speed?: unknown;
  median_time?: unknown;
  median_end_to_end_response_time?: unknown;
  intelligence?: unknown;
  intelligence_index_cost?: unknown;
  benchmarks?: unknown;
};

type IndexedSourceRows<Row, Lookup> = {
  rows: Row[];
  rowsByModelName: Lookup;
};

type BenchmarkObservationData = {
  [Binding in BenchmarkObservationBinding as Binding["sourceDataKey"]]: IndexedSourceRows<
    BenchmarkObservationRow,
    BenchmarkObservationLookup
  >;
};

export type ModelAtlasSourceData = BenchmarkObservationData & {
  artificialAnalysis: {
    rows: unknown[];
    bySlug: Map<string, ArtificialAnalysisModel>;
  };
  artificialAnalysisBenchmarkResources: {
    rows: ArtificialAnalysisBenchmarkResourceRow[];
    observationLookup: ArtificialAnalysisBenchmarkResourceLookup;
    sourceDefaultLookup: ArtificialAnalysisBenchmarkResourceLookup;
  };
  modelsDev: {
    rows: ModelsDevFlatModel[];
    byId: Map<string, ModelsDevFlatModel>;
  };
  agentArena: IndexedSourceRows<AgentArenaModelScoreRow, AgentArenaRowsByModelName>;
  agentsLastExam: IndexedSourceRows<AgentsLastExamModelScoreRow, AgentsLastExamRowsByModelName>;
  aleBench: {
    sourceDefaultRows: AleBenchModelScoreRow[];
    rowsByModelName: AleBenchRowsByModelName;
  };
  blueprintBench: IndexedSourceRows<BlueprintBenchModelScoreRow, BlueprintBenchRowsByModelName>;
  cursorBench: IndexedSourceRows<CursorBenchModelScoreRow, CursorBenchRowsByModelName>;
  deepSWE: {
    rows: DeepSWELeaderboardRow[];
    rowsByModelName: DeepSWERowsByModelName;
  };
  frontierCode: IndexedSourceRows<FrontierCodeModelEffortRow, FrontierCodeRowsByModelName>;
  riemannBench: IndexedSourceRows<RiemannBenchModelScoreRow, RiemannBenchRowsByModelName>;
  terminalBench4: IndexedSourceRows<TerminalBench4ModelAgentRow, TerminalBench4RowsByModelName>;
  valsIndex: IndexedSourceRows<ValsIndexModelScoreRow, ValsIndexRowsByModelName>;
  vendingBench2: IndexedSourceRows<VendingBench2ModelScoreRow, VendingBench2RowsByModelName>;
};

type BenchmarkObservationRows = {
  [Binding in BenchmarkObservationBinding as Binding["sourceRowsKey"]]: ModelAtlasSourceData[Binding["sourceDataKey"]]["rows"];
};

export type ModelAtlasSourceRows = BenchmarkObservationRows & {
  artificialAnalysisRows: ModelAtlasSourceData["artificialAnalysis"]["rows"];
  artificialAnalysisBenchmarkResourceRows: ModelAtlasSourceData["artificialAnalysisBenchmarkResources"]["rows"];
  modelsDevModels: ModelAtlasSourceData["modelsDev"]["rows"];
  agentArenaRows: ModelAtlasSourceData["agentArena"]["rows"];
  agentsLastExamRows: ModelAtlasSourceData["agentsLastExam"]["rows"];
  aleBenchConfigurationRows: AleBenchConfigurationRow[];
  blueprintBenchRows: ModelAtlasSourceData["blueprintBench"]["rows"];
  cursorBenchRows: ModelAtlasSourceData["cursorBench"]["rows"];
  deepSWEEffortRows: DeepSWELeaderboardRow[];
  frontierCodeRows: ModelAtlasSourceData["frontierCode"]["rows"];
  riemannBenchRows: ModelAtlasSourceData["riemannBench"]["rows"];
  terminalBench4Rows: ModelAtlasSourceData["terminalBench4"]["rows"];
  valsIndexRows: ModelAtlasSourceData["valsIndex"]["rows"];
  vendingBench2Rows: ModelAtlasSourceData["vendingBench2"]["rows"];
};

/** Both live fetches and persisted snapshots enter matching through this normalized lookup contract. */
export function buildSourceData(rows: ModelAtlasSourceRows): ModelAtlasSourceData {
  const preferredModelsDevModels = pickPreferredModelsDevRows(rows.modelsDevModels);
  const aleBenchSourceDefaultRows = summarizeAleBenchSourceDefaultRows(
    rows.aleBenchConfigurationRows,
  );
  const benchmarkObservationData = buildBenchmarkObservationData(rows);
  return {
    artificialAnalysis: {
      rows: rows.artificialAnalysisRows,
      bySlug: buildArtificialAnalysisBySlug(rows.artificialAnalysisRows),
    },
    artificialAnalysisBenchmarkResources: {
      rows: rows.artificialAnalysisBenchmarkResourceRows,
      observationLookup: buildArtificialAnalysisResourceLookup(
        rows.artificialAnalysisBenchmarkResourceRows,
      ),
      sourceDefaultLookup: buildArtificialAnalysisSourceDefaultResourceLookup(
        rows.artificialAnalysisBenchmarkResourceRows,
      ),
    },
    modelsDev: {
      rows: preferredModelsDevModels,
      byId: new Map(
        preferredModelsDevModels.map((modelsDevModel) => [modelsDevModel.model_id, modelsDevModel]),
      ),
    },
    ...benchmarkObservationData,
    agentArena: {
      rows: rows.agentArenaRows,
      rowsByModelName: buildBenchmarkModelMap(rows.agentArenaRows),
    },
    agentsLastExam: {
      rows: rows.agentsLastExamRows,
      rowsByModelName: buildAgentsLastExamMap(rows.agentsLastExamRows),
    },
    aleBench: {
      sourceDefaultRows: aleBenchSourceDefaultRows,
      rowsByModelName: buildBenchmarkModelMap(aleBenchSourceDefaultRows),
    },
    blueprintBench: {
      rows: rows.blueprintBenchRows,
      rowsByModelName: buildBlueprintBenchMap(rows.blueprintBenchRows),
    },
    cursorBench: {
      rows: rows.cursorBenchRows,
      rowsByModelName: buildCursorBenchMap(rows.cursorBenchRows),
    },
    deepSWE: {
      rows: rows.deepSWEEffortRows,
      rowsByModelName: buildDeepSWEMap(rows.deepSWEEffortRows),
    },
    frontierCode: {
      rows: rows.frontierCodeRows,
      rowsByModelName: buildBenchmarkModelMap(rows.frontierCodeRows),
    },
    riemannBench: {
      rows: rows.riemannBenchRows,
      rowsByModelName: buildRiemannBenchMap(rows.riemannBenchRows),
    },
    terminalBench4: {
      rows: rows.terminalBench4Rows,
      rowsByModelName: buildTerminalBench4Map(rows.terminalBench4Rows),
    },
    valsIndex: {
      rows: rows.valsIndexRows,
      rowsByModelName: buildValsIndexMap(rows.valsIndexRows),
    },
    vendingBench2: {
      rows: rows.vendingBench2Rows,
      rowsByModelName: buildBenchmarkModelMap(rows.vendingBench2Rows),
    },
  };
}

function buildBenchmarkObservationData(rows: ModelAtlasSourceRows): BenchmarkObservationData {
  return Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map(({ sourceDataKey, sourceRowsKey }) => {
      const sourceRows = rows[sourceRowsKey];
      if (!Array.isArray(sourceRows)) {
        throw new Error(`Benchmark observation source rows are missing: ${sourceRowsKey}`);
      }
      return [
        sourceDataKey,
        {
          rows: sourceRows,
          rowsByModelName: buildBenchmarkObservationLookup(sourceRows),
        },
      ];
    }),
  ) as BenchmarkObservationData;
}

function buildArtificialAnalysisBySlug(rows: unknown[]): Map<string, ArtificialAnalysisModel> {
  const bySlug = new Map<string, ArtificialAnalysisModel>();
  for (const row of rows) {
    const model = row as ArtificialAnalysisModel;
    const slug = modelSlugFromModelId(model.model_id);
    if (slug) {
      bySlug.set(slug, model);
    }
  }
  return bySlug;
}
