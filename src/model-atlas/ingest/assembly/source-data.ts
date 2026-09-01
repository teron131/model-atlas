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
} from "../../scrapers/benchmarks/agent-arena";
import {
  type AgentsLastExamModelScoreRow,
  type AgentsLastExamRowsByModelName,
  buildAgentsLastExamMap,
} from "../../scrapers/benchmarks/agents-last-exam";
import {
  type AleBenchConfigurationRow,
  type AleBenchModelScoreRow,
  type AleBenchRowsByModelName,
  summarizeAleBenchSourceDefaultRows,
} from "../../scrapers/benchmarks/ale-bench";
import {
  type ArtificialAnalysisBenchmarkResourceLookup,
  type ArtificialAnalysisBenchmarkResourceRow,
  buildArtificialAnalysisResourceLookup,
  buildArtificialAnalysisSourceDefaultResourceLookup,
} from "../../scrapers/benchmarks/artificial-analysis/results";
import {
  type BlueprintBenchModelScoreRow,
  type BlueprintBenchRowsByModelName,
  buildBlueprintBenchMap,
} from "../../scrapers/benchmarks/blueprint-bench";
import {
  buildCursorBenchMap,
  type CursorBenchModelScoreRow,
  type CursorBenchRowsByModelName,
} from "../../scrapers/benchmarks/cursorbench";
import {
  buildDeepSWEMap,
  type DeepSWELeaderboardRow,
  type DeepSWEModelScoreRow,
  type DeepSWERowsByModelName,
  summarizeDeepSWESourceDefaultRows,
} from "../../scrapers/benchmarks/deep-swe";
import type {
  FrontierCodeModelEffortRow,
  FrontierCodeRowsByModelName,
} from "../../scrapers/benchmarks/frontier-code";
import type {
  MercorApexAgentsRow,
  MercorApexAgentsRowsByModelName,
} from "../../scrapers/benchmarks/mercor-apex-agents";
import {
  buildRiemannBenchMap,
  type RiemannBenchModelScoreRow,
  type RiemannBenchRowsByModelName,
} from "../../scrapers/benchmarks/surge/riemann-bench";
import {
  buildTerminalBench4Map,
  type TerminalBench4ModelAgentRow,
  type TerminalBench4RowsByModelName,
} from "../../scrapers/benchmarks/terminal-bench-4";
import {
  buildHarveyLabMap,
  type HarveyLabModelScoreRow,
  type HarveyLabRowsByModelName,
} from "../../scrapers/benchmarks/vals/harvey-lab";
import {
  buildValsIndexMap,
  type ValsIndexModelScoreRow,
  type ValsIndexRowsByModelName,
} from "../../scrapers/benchmarks/vals/index-benchmark";
import type {
  VendingBench2ModelScoreRow,
  VendingBench2RowsByModelName,
} from "../../scrapers/benchmarks/vending-bench-2";
import type { ModelsDevFlatModel } from "../../scrapers/models-dev";
import { pickPreferredModelsDevRows } from "./policy";

export type ArtificialAnalysisModel = {
  model_id?: unknown;
  name?: unknown;
  reasoning_effort?: unknown;
  logo?: unknown;
  median_speed?: unknown;
  median_time?: unknown;
  median_end_to_end_response_time?: unknown;
  benchmarks?: unknown;
  intelligence?: unknown;
  intelligence_index_cost?: unknown;
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
    sourceDefaultRows: DeepSWEModelScoreRow[];
    rowsByModelName: DeepSWERowsByModelName;
  };
  frontierCode: IndexedSourceRows<FrontierCodeModelEffortRow, FrontierCodeRowsByModelName>;
  harveyLab: IndexedSourceRows<HarveyLabModelScoreRow, HarveyLabRowsByModelName>;
  mercorApexAgents: IndexedSourceRows<MercorApexAgentsRow, MercorApexAgentsRowsByModelName>;
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
  harveyLabRows: ModelAtlasSourceData["harveyLab"]["rows"];
  mercorApexAgentsRows: MercorApexAgentsRow[];
  riemannBenchRows: ModelAtlasSourceData["riemannBench"]["rows"];
  terminalBench4Rows: ModelAtlasSourceData["terminalBench4"]["rows"];
  valsIndexRows: ModelAtlasSourceData["valsIndex"]["rows"];
  vendingBench2Rows: ModelAtlasSourceData["vendingBench2"]["rows"];
};

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

function buildBenchmarkObservationData(rows: ModelAtlasSourceRows): Partial<ModelAtlasSourceData> {
  return Object.fromEntries(
    BENCHMARK_OBSERVATION_BINDINGS.map(({ sourceDataKey, sourceRowsKey }) => {
      const sourceRows = rows[sourceRowsKey as keyof ModelAtlasSourceRows] as
        | readonly BenchmarkObservationRow[]
        | undefined;
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
  ) as Partial<ModelAtlasSourceData>;
}

/** Both live fetches and persisted snapshots enter matching through this normalized lookup contract. */
export function buildSourceData(rows: ModelAtlasSourceRows): ModelAtlasSourceData {
  const preferredModelsDevModels = pickPreferredModelsDevRows(rows.modelsDevModels);
  const deepSweSourceDefaultRows = summarizeDeepSWESourceDefaultRows(rows.deepSWEEffortRows);
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
      sourceDefaultRows: deepSweSourceDefaultRows,
      rowsByModelName: buildDeepSWEMap(deepSweSourceDefaultRows),
    },
    frontierCode: {
      rows: rows.frontierCodeRows,
      rowsByModelName: buildBenchmarkModelMap(rows.frontierCodeRows),
    },
    harveyLab: {
      rows: rows.harveyLabRows,
      rowsByModelName: buildHarveyLabMap(rows.harveyLabRows),
    },
    mercorApexAgents: {
      rows: rows.mercorApexAgentsRows,
      rowsByModelName: buildBenchmarkModelMap(rows.mercorApexAgentsRows),
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
  } as unknown as ModelAtlasSourceData;
}
