/**
 * Benchmark-matched rows provide the evidence-backed catalog foundation.
 * Eligible models.dev rows extend that foundation so recent models can enter the catalog before benchmark coverage catches up.
 */

import {
	canonicalProviderModelId,
	normalizeProviderId,
	normalizeProviderModelId,
} from "../../identity/normalization";
import type { ModelAtlasSourceData } from "../../ingest/assembly";
import { asRecord } from "../../runtime";
import type { ModelsDevFlatModel } from "../../scrapers/models-dev";

function normalizedRowId(row: Record<string, unknown>): string | null {
	const id = typeof row.id === "string" ? row.id : null;
	return id == null ? null : normalizeProviderModelId(id);
}

function normalizedRowProvider(row: Record<string, unknown>): string | null {
	const normalizedId = normalizedRowId(row);
	const provider =
		normalizedId?.split("/")[0] ??
		(typeof row.provider_id === "string" ? row.provider_id : null);
	return provider == null ? null : normalizeProviderId(provider);
}

function normalizedRowFamily(row: Record<string, unknown>): string | null {
	if (typeof row.family !== "string" || row.family.length === 0) {
		return null;
	}
	return row.family
		.toLowerCase()
		.replace(/[._:\s]+/g, "-")
		.replace(/-+/g, "-");
}

function catalogFamilyKey(row: Record<string, unknown>): string | null {
	const provider = normalizedRowProvider(row);
	const family = normalizedRowFamily(row);
	return provider == null || family == null ? null : `${provider}/${family}`;
}

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

function rowHasExplicitTextOutput(row: Record<string, unknown>): boolean {
	const modalities = asRecord(row.modalities);
	return Array.isArray(modalities.output) && modalities.output.includes("text");
}

function hasObviousImageModelLabel(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id", "name", "family"]).includes(
		"image",
	);
}

function isTextModelCatalogRow(row: Record<string, unknown>): boolean {
	return rowHasExplicitTextOutput(row) && !hasObviousImageModelLabel(row);
}

function isLatestAliasRow(row: Record<string, unknown>): boolean {
	return rowText(row, ["id", "openrouter_id"]).includes("latest");
}

function isDatedAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-\d{8}$/.test(normalizedId);
}

function isFastAliasRow(row: Record<string, unknown>): boolean {
	const normalizedId = normalizedRowId(row);
	return normalizedId != null && /-fast$/.test(normalizedId);
}

function aliasInclusionRank(row: Record<string, unknown>): number {
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

function modelsDevCatalogRow(
	modelsDevModel: ModelsDevFlatModel,
): Record<string, unknown> | null {
	const modelFields = asRecord(modelsDevModel.model);
	const canonicalId = canonicalProviderModelId(
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
	return {
		id: canonicalId,
		provider_id: modelsDevModel.provider_id,
		openrouter_id: canonicalId,
		name:
			typeof modelsDevModel.model.name === "string"
				? modelsDevModel.model.name
				: modelsDevModel.model_id,
		artificial_analysis_id: null,
		family: matchedFamily,
		...modelMetadata,
	};
}

/** Build a text-model catalog from benchmark-matched rows and nonduplicate models.dev candidates. */
export function buildModelCatalogRows(
	sourceData: Pick<ModelAtlasSourceData, "modelsDev">,
	matchedRows: Record<string, unknown>[],
): Record<string, unknown>[] {
	const representedModelIds = new Set<string>();
	const representedConcreteFamilies = new Set<string>();
	const trackRepresentedRow = (row: Record<string, unknown>) => {
		for (const normalizedId of [row.id, row.openrouter_id]
			.filter((id): id is string => typeof id === "string" && id.length > 0)
			.map(normalizeProviderModelId)) {
			representedModelIds.add(normalizedId);
		}
		const familyKey = catalogFamilyKey(row);
		if (familyKey != null && !isLatestAliasRow(row)) {
			representedConcreteFamilies.add(familyKey);
		}
	};
	for (const row of matchedRows) {
		trackRepresentedRow(row);
	}
	const catalogRows = matchedRows.filter(isTextModelCatalogRow);
	const modelsDevCandidateRows = sourceData.modelsDev.rows
		.map((modelsDevModel) => modelsDevCatalogRow(modelsDevModel))
		.filter((row): row is Record<string, unknown> => row != null)
		.sort(
			(left, right) => aliasInclusionRank(left) - aliasInclusionRank(right),
		);
	for (const row of modelsDevCandidateRows) {
		const normalizedId = normalizedRowId(row);
		const latestFamilyKey = isLatestAliasRow(row)
			? catalogFamilyKey(row)
			: null;
		if (
			normalizedId == null ||
			!isTextModelCatalogRow(row) ||
			representedModelIds.has(normalizedId) ||
			(latestFamilyKey != null &&
				representedConcreteFamilies.has(latestFamilyKey))
		) {
			continue;
		}
		trackRepresentedRow(row);
		catalogRows.push(row);
	}
	return catalogRows;
}
