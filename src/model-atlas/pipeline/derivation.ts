/** Shared model derivation keeps live and persisted stats on one matching, variant, route-data, and scoring workflow. */

import { STAGE_CONFIG } from "../config";
import {
	buildMatchDiagnostics,
	type MatchDiagnosticsPayload,
} from "../identity";
import { publicOpenRouterModelId } from "../identity/openrouter";
import type { ModelAtlasSourceData } from "../ingest/assembly";
import type { OpenRouterRawScrapedPayload } from "../scrapers/openrouter";
import { assignBenchmarksToVariants } from "./benchmark-rows";
import { modelRowsFromMatchDiagnostics } from "./matched-rows";
import { buildModelCatalogRows, buildModelVariants } from "./model-catalog";
import type { ModelAtlasModel } from "./model-types";
import { prepareOpenRouterModelData } from "./openrouter-data";
import { buildFinalModels } from "./selection/builder";

type OpenRouterLoadResult = {
	rawPayload: OpenRouterRawScrapedPayload | null;
};

type ModelDerivationOptions = {
	modelId?: string | null;
};

type ModelDerivationLoaderOptions<LoadResult extends OpenRouterLoadResult> =
	ModelDerivationOptions & {
		loadOpenRouter: (modelIds: string[]) => Promise<LoadResult>;
	};

type ModelDerivationResult<LoadResult extends OpenRouterLoadResult | null> = {
	matchDiagnostics: MatchDiagnosticsPayload;
	modelRows: Record<string, unknown>[];
	models: ModelAtlasModel[];
	openRouterLoad: LoadResult;
};

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
	options:
		| ModelDerivationOptions
		| ModelDerivationLoaderOptions<LoadResult> = {},
): Promise<ModelDerivationResult<LoadResult | null>> {
	const matchDiagnostics = buildMatchDiagnostics({
		matcherConfig: STAGE_CONFIG.matcher,
		scrapedRows: sourceData.artificialAnalysis.rows,
		modelsDevModels: sourceData.modelsDev.rows,
	});
	const matchedRows = modelRowsFromMatchDiagnostics(
		sourceData,
		matchDiagnostics,
	);
	const catalogRows = buildModelCatalogRows(sourceData, matchedRows);
	const variantRows = buildModelVariants(catalogRows);
	const assignedVariantRows = assignBenchmarksToVariants(
		variantRows,
		sourceData,
	);
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
	);
	return {
		matchDiagnostics,
		modelRows: openRouterData.modelRows,
		models,
		openRouterLoad,
	};
}
