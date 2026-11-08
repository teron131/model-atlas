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
import type { CrosswalkObservation } from "../../benchmarks/sources-crosswalk";
import {
  type ArtificialAnalysisBenchmarkResourceLookup,
  type ArtificialAnalysisBenchmarkResourceRow,
  buildArtificialAnalysisResourceLookup,
  buildArtificialAnalysisSourceDefaultResourceLookup,
} from "../artificial-analysis/benchmark-resources";
import {
  type BenchmarkSourceData,
  type BenchmarkSourceRows,
  buildBenchmarkSourceData,
} from "../benchmarks";
import type { ModelsDevFlatModel } from "../models-dev/catalog";
import { fusedBenchmarkObservations } from "./fusion";
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

export type ModelAtlasSourceData = BenchmarkObservationData &
  BenchmarkSourceData & {
    fusedBenchmarks: Record<
      string,
      IndexedSourceRows<CrosswalkObservation, BenchmarkObservationLookup<CrosswalkObservation>>
    >;
    artificialAnalysis: {
      rows: unknown[];
      byId: Map<string, ArtificialAnalysisModel>;
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
  };

type BenchmarkObservationRows = {
  [Binding in BenchmarkObservationBinding as Binding["sourceRowsKey"]]: ModelAtlasSourceData[Binding["sourceDataKey"]]["rows"];
};

export type ModelAtlasSourceRows = BenchmarkObservationRows &
  BenchmarkSourceRows & {
    artificialAnalysisRows: ModelAtlasSourceData["artificialAnalysis"]["rows"];
    artificialAnalysisBenchmarkResourceRows: ModelAtlasSourceData["artificialAnalysisBenchmarkResources"]["rows"];
    modelsDevModels: ModelAtlasSourceData["modelsDev"]["rows"];
  };

/** Both live fetches and persisted snapshots enter matching through this normalized lookup contract. */
export function buildSourceData(rows: ModelAtlasSourceRows): ModelAtlasSourceData {
  const preferredModelsDevModels = pickPreferredModelsDevRows(rows.modelsDevModels);
  const benchmarkObservationData = buildBenchmarkObservationData(rows);
  return {
    fusedBenchmarks: Object.fromEntries(
      Object.entries(fusedBenchmarkObservations(rows)).map(([key, observations]) => [
        key,
        {
          rows: observations,
          rowsByModelName: buildBenchmarkObservationLookup(
            observations.filter((row) => row.metadata.fusion_collapsed !== true),
          ),
        },
      ]),
    ),
    artificialAnalysis: {
      rows: rows.artificialAnalysisRows,
      byId: buildArtificialAnalysisById(rows.artificialAnalysisRows),
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
    ...buildBenchmarkSourceData(rows),
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

/** Provider-qualified source IDs prevent aliases sharing one slug from replacing each other's observations. */
function buildArtificialAnalysisById(rows: unknown[]): Map<string, ArtificialAnalysisModel> {
  const byId = new Map<string, ArtificialAnalysisModel>();
  for (const row of rows) {
    const model = row as ArtificialAnalysisModel;
    if (typeof model.model_id === "string" && model.model_id.length > 0) {
      byId.set(model.model_id, model);
    }
  }
  return byId;
}
