/** Shared model derivation keeps live and persisted stats on one matching, variant, route-data, and scoring workflow. */

import type { BenchmarkObservationsByKey } from "../benchmarks/observation";
import { BENCHMARK_OBSERVATION_BINDINGS } from "../benchmarks/registry";
import { STAGE_CONFIG } from "../config";
import { buildMatchDiagnostics, type MatchDiagnosticsPayload } from "../identity";
import { publicOpenRouterModelId } from "../identity/openrouter";
import type { ModelAtlasSourceData } from "../ingest/assembly";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import { assignBenchmarksToVariants } from "./benchmark-rows";
import { modelRowsFromMatchDiagnostics } from "./matched-rows";
import { buildModelCatalogRows, buildModelVariants } from "./model-catalog";
import type { ModelAtlasModel } from "./model-types";
import { prepareOpenRouterModelData } from "./openrouter-data";
import { buildFinalModels } from "./selection/builder";
import type { BenchmarkVersioningOptions } from "./selection/candidate";
import {
  buildVersionReplacementMatchSlugOverrides,
  prepareVersionReplacementMatchedRows,
} from "./selection/version-replacement";

type OpenRouterLoadResult = {
  rawPayload: OpenRouterRawScrapedPayload | null;
};

type ModelDerivationOptions = {
  modelId?: string | null;
  benchmarkVersioning?: BenchmarkVersioningOptions & {
    previousModels?: readonly ModelAtlasModel[];
  };
};

type ModelDerivationLoaderOptions<LoadResult extends OpenRouterLoadResult> =
  ModelDerivationOptions & {
    loadOpenRouter: (modelIds: string[]) => Promise<LoadResult>;
  };

type ModelDerivationResult<LoadResult extends OpenRouterLoadResult | null> = {
  matchDiagnostics: MatchDiagnosticsPayload;
  modelRows: Record<string, unknown>[];
  models: ModelAtlasModel[];
  benchmarkObservations: BenchmarkObservationsByKey;
  openRouterLoad: LoadResult;
};

function benchmarkObservations(sourceData: ModelAtlasSourceData): BenchmarkObservationsByKey {
  const observations: BenchmarkObservationsByKey = {};
  for (const { benchmark, sourceDataKey } of BENCHMARK_OBSERVATION_BINDINGS) {
    observations[benchmark] = sourceData[sourceDataKey].rows.map((row) => ({
      model_id: row.model_id,
      model: row.model,
      base_model: row.base_model,
      reasoning_effort: row.reasoning_effort,
      canonical_value: row.canonical_value,
      ...(row.cost == null ? {} : { cost: row.cost }),
      observed_at: row.observed_at,
    }));
  }
  return observations;
}

function openRouterModelIds(rows: Record<string, unknown>[]): string[] {
  return Array.from(
    new Set(
      rows
        .map((row) => row.openrouter_id ?? row.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .map((id) => publicOpenRouterModelId(id) ?? id),
    ),
  );
}

/**
 * Both live refresh and persisted snapshots cross this workflow so stage ordering cannot drift.
 * Supplying a loader preserves its full result type for storage-specific cache metadata.
 */
export function deriveModelStats<LoadResult extends OpenRouterLoadResult>(
  sourceData: ModelAtlasSourceData,
  options: ModelDerivationLoaderOptions<LoadResult>,
): Promise<ModelDerivationResult<LoadResult>>;
export function deriveModelStats(
  sourceData: ModelAtlasSourceData,
  options?: ModelDerivationOptions,
): Promise<ModelDerivationResult<null>>;
export async function deriveModelStats<LoadResult extends OpenRouterLoadResult>(
  sourceData: ModelAtlasSourceData,
  options: ModelDerivationOptions | ModelDerivationLoaderOptions<LoadResult> = {},
): Promise<ModelDerivationResult<LoadResult | null>> {
  const matchSlugOverridesBySourceId = buildVersionReplacementMatchSlugOverrides(sourceData);
  const matchDiagnostics = buildMatchDiagnostics({
    matcherConfig: STAGE_CONFIG.matcher,
    scrapedRows: sourceData.artificialAnalysis.rows,
    modelsDevModels: sourceData.modelsDev.rows,
    matchSlugOverridesBySourceId,
  });
  const matchedRows = prepareVersionReplacementMatchedRows(
    modelRowsFromMatchDiagnostics(sourceData, matchDiagnostics),
    matchDiagnostics,
    matchSlugOverridesBySourceId,
  );
  const catalogRows = buildModelCatalogRows(sourceData, matchedRows);
  const variantRows = buildModelVariants(catalogRows);
  const assignedVariantRows = assignBenchmarksToVariants(variantRows, sourceData);
  const observations = benchmarkObservations(sourceData);
  const openRouterLoad =
    "loadOpenRouter" in options
      ? await options.loadOpenRouter(openRouterModelIds(assignedVariantRows))
      : null;
  const openRouterData = await prepareOpenRouterModelData(
    assignedVariantRows,
    STAGE_CONFIG.openrouter,
    STAGE_CONFIG.scoring,
    openRouterLoad?.rawPayload,
  );
  const models = await buildFinalModels(
    openRouterData,
    options.modelId ?? null,
    STAGE_CONFIG.final,
    STAGE_CONFIG.scoring,
    options.benchmarkVersioning,
    options.benchmarkVersioning?.previousModels,
  );
  return {
    matchDiagnostics,
    modelRows: openRouterData.modelRows,
    models,
    benchmarkObservations: observations,
    openRouterLoad,
  };
}
