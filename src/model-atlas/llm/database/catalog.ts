/** Models.dev catalog filtering for Model Atlas. */

import type { ModelsDevFlatModel } from "../scrapers/models-dev";
import {
	asRecord,
	modelSlugFromModelId,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../shared";
import { benchmarkEnrichment } from "../stats/benchmarks";
import type { LlmStatsSourceData } from "../stats/types";

/** Applies models.dev catalog filtering for canonical model ID. */
function canonicalModelId(
	modelId: unknown,
	providerId: unknown,
	fallbackModelId: unknown,
): string | null {
	if (typeof modelId === "string" && modelId.includes("/")) {
		return modelId;
	}
	if (typeof providerId === "string" && typeof modelId === "string") {
		return `${providerId}/${modelId}`;
	}
	if (typeof providerId === "string" && typeof fallbackModelId === "string") {
		return `${providerId}/${fallbackModelId}`;
	}
	return typeof modelId === "string" ? modelId : null;
}

/** Applies models.dev catalog filtering for normalized row ID. */
function normalizedRowId(row: Record<string, unknown>): string | null {
	const id = typeof row.id === "string" ? row.id : null;
	return id == null ? null : normalizeProviderModelId(id);
}

/** Applies models.dev catalog filtering for normalized row provider. */
function normalizedRowProvider(row: Record<string, unknown>): string | null {
	const normalizedId = normalizedRowId(row);
	const provider =
		normalizedId?.split("/")[0] ??
		(typeof row.provider_id === "string" ? row.provider_id : null);
	return provider == null ? null : normalizeProviderId(provider);
}

/** Applies models.dev catalog filtering for normalized row family. */
function normalizedRowFamily(row: Record<string, unknown>): string | null {
	if (typeof row.family !== "string" || row.family.length === 0) {
		return null;
	}
	return row.family
		.toLowerCase()
		.replace(/[._:\s]+/g, "-")
		.replace(/-+/g, "-");
}

/** Applies models.dev catalog filtering for catalog family key. */
function catalogFamilyKey(row: Record<string, unknown>): string | null {
	const provider = normalizedRowProvider(row);
	const family = normalizedRowFamily(row);
	return provider == null || family == null ? null : `${provider}/${family}`;
}

/** Applies models.dev catalog filtering for row text. */
function rowText(
	row: Record<string, unknown>,
	keys: readonly string[],
): string {
	return keys
		.map((key) => row[key])
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
}

/** Applies models.dev catalog filtering for row has explicit text output. */
function rowHasExplicitTextOutput(row: Record<string, unknown>): boolean {
	const modalities = asRecord(row.modalities);
	return Array.isArray(modalities.output) && modalities.output.includes("text");
}

/** Applies models.dev catalog filtering for has obvious image model label. */
function hasObviousImageModelLabel(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id", "name", "family"]).includes(
		"image",
	);
}

/** Checks whether text LLM catalog row for models.dev catalog filtering. */
function isTextLlmCatalogRow(row: Record<string, unknown>): boolean {
	return rowHasExplicitTextOutput(row) && !hasObviousImageModelLabel(row);
}

/** Checks whether latest alias row for models.dev catalog filtering. */
function isLatestAliasRow(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id"]).includes("latest");
}

/** Checks whether dated alias row for models.dev catalog filtering. */
function isDatedAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-\d{8}$/.test(normalizedId);
}

/** Checks whether fast alias row for models.dev catalog filtering. */
function isFastAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-fast$/.test(normalizedId);
}

/** Applies models.dev catalog filtering for catalog alias priority. */
function catalogAliasPriority(row: Record<string, unknown>): number {
	if (isLatestAliasRow(row)) {
		return 3;
	}
	if (isFastAliasRow(row)) {
		return 2;
	}
	if (isDatedAliasRow(row)) {
		return 1;
	}
	return 0;
}

/** Keep processed DB stages scoped to text-output LLM rows and exclude obvious image models. */
export function filterDatabaseTextLlmRows(
	rows: Record<string, unknown>[],
): Record<string, unknown>[] {
	return rows.filter(isTextLlmCatalogRow);
}

/** Applies models.dev catalog filtering for normalized catalog IDs. */
function normalizedCatalogIds(row: Record<string, unknown>): string[] {
	return [row.id, row.openrouter_id]
		.filter((id): id is string => typeof id === "string" && id.length > 0)
		.map(normalizeProviderModelId);
}

/** Applies models.dev catalog filtering for models.dev catalog row. */
function modelsDevCatalogRow(
	modelsDevModel: ModelsDevFlatModel,
	sourceData: LlmStatsSourceData,
): Record<string, unknown> | null {
	const modelFields = asRecord(modelsDevModel.model);
	const canonicalId = canonicalModelId(
		modelsDevModel.model.id ?? modelsDevModel.model_id,
		modelsDevModel.provider_id,
		modelsDevModel.model_id,
	);
	if (canonicalId == null) {
		return null;
	}
	const {
		id: _matchedId,
		name: _matchedName,
		family: matchedFamily,
		model_id: _matchedModelId,
		slug: _matchedSlug,
		...modelMetadata
	} = modelFields;
	const modelNameCandidates = [
		modelsDevModel.model.name,
		modelsDevModel.model_id,
		modelsDevModel.model.id,
		canonicalId,
		modelSlugFromModelId(canonicalId),
	];
	const benchmarkFields = benchmarkEnrichment(modelNameCandidates, sourceData);
	return {
		id: canonicalId,
		provider_id: modelsDevModel.provider_id,
		openrouter_id: modelsDevModel.model.id ?? modelsDevModel.model_id,
		name:
			typeof modelsDevModel.model.name === "string"
				? modelsDevModel.model.name
				: modelsDevModel.model_id,
		artificial_analysis_id: null,
		family: matchedFamily,
		...modelMetadata,
		...(Object.keys(benchmarkFields.scoringSources).length === 0
			? {}
			: {
					scoring_sources: benchmarkFields.scoringSources,
				}),
		...(Object.keys(benchmarkFields.evaluations).length === 0
			? {}
			: { evaluations: benchmarkFields.evaluations }),
	};
}

/** Add preferred recent models.dev catalog rows without an Artificial Analysis match. */
export function buildDatabaseCatalogRows(
	sourceData: LlmStatsSourceData,
	matchedRows: Record<string, unknown>[],
): Record<string, unknown>[] {
	const existingNormalizedIds = new Set<string>();
	const existingConcreteFamilyKeys = new Set<string>();
	/** Applies models.dev catalog filtering for remember catalog row. */
	const rememberCatalogRow = (row: Record<string, unknown>) => {
		for (const normalizedId of normalizedCatalogIds(row)) {
			existingNormalizedIds.add(normalizedId);
		}
		const familyKey = catalogFamilyKey(row);
		if (familyKey != null && !isLatestAliasRow(row)) {
			existingConcreteFamilyKeys.add(familyKey);
		}
	};
	for (const row of matchedRows) {
		rememberCatalogRow(row);
	}
	const catalogRows = filterDatabaseTextLlmRows(matchedRows);
	const modelsDevCatalogRows = sourceData.modelsDev.rows
		.map((modelsDevModel) => modelsDevCatalogRow(modelsDevModel, sourceData))
		.filter((row): row is Record<string, unknown> => row != null)
		.sort(
			(left, right) => catalogAliasPriority(left) - catalogAliasPriority(right),
		);
	for (const row of modelsDevCatalogRows) {
		const normalizedId = normalizedRowId(row);
		const latestFamilyKey = isLatestAliasRow(row)
			? catalogFamilyKey(row)
			: null;
		if (
			normalizedId == null ||
			!isTextLlmCatalogRow(row) ||
			existingNormalizedIds.has(normalizedId) ||
			(latestFamilyKey != null &&
				existingConcreteFamilyKeys.has(latestFamilyKey))
		) {
			continue;
		}
		rememberCatalogRow(row);
		catalogRows.push(row);
	}
	return catalogRows;
}
