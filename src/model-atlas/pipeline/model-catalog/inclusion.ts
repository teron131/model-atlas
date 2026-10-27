/**
 * Benchmark-source rows provide the evidence-backed catalog foundation even before a public catalog lists them.
 * Eligible models.dev rows extend that foundation so recent models can enter the catalog before benchmark coverage catches up.
 */

import {
  normalizeProviderId,
  normalizeProviderModelId,
  qualifyModelId,
} from "../../identity/normalization";
import { asRecord } from "../../runtime";
import type { ModelAtlasSourceData } from "../../sources/assembly";
import type { ModelsDevFlatModel, ModelsDevModelRecord } from "../../sources/models-dev/catalog";
import type { ModelRow } from "../model-types";

/** The catalog facts a models.dev entry contributes to a model row; the payload is unvalidated, so each field is checked here. */
export function modelsDevRowFields(
  model: ModelsDevModelRecord | undefined,
): Pick<
  ModelRow,
  "family" | "release_date" | "reasoning" | "open_weights" | "modalities" | "cost" | "limit"
> {
  return {
    family: typeof model?.family === "string" ? model.family : null,
    release_date: typeof model?.release_date === "string" ? model.release_date : null,
    reasoning: typeof model?.reasoning === "boolean" ? model.reasoning : null,
    open_weights: typeof model?.open_weights === "boolean" ? model.open_weights : null,
    modalities: asRecord(model?.modalities),
    cost: asRecord(model?.cost),
    limit: asRecord(model?.limit),
  };
}

function normalizedRowId(row: ModelRow): string | null {
  return row.id == null ? null : normalizeProviderModelId(row.id);
}

function normalizedRowProvider(row: ModelRow): string | null {
  const provider = normalizedRowId(row)?.split("/")[0] ?? row.provider_id ?? null;
  return provider == null ? null : normalizeProviderId(provider);
}

function normalizedRowFamily(row: ModelRow): string | null {
  if (row.family == null || row.family.length === 0) {
    return null;
  }
  return row.family
    .toLowerCase()
    .replace(/[._:\s]+/g, "-")
    .replace(/-+/g, "-");
}

function catalogFamilyKey(row: ModelRow): string | null {
  const provider = normalizedRowProvider(row);
  const family = normalizedRowFamily(row);
  return provider == null || family == null ? null : `${provider}/${family}`;
}

function rowText(values: readonly (string | null | undefined)[]): string {
  return values
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

function rowHasExplicitTextOutput(row: ModelRow): boolean {
  const output = row.modalities?.output;
  return Array.isArray(output) && output.includes("text");
}

function hasObviousImageModelLabel(row: ModelRow): boolean {
  return rowText([row.id, row.openrouter_id, row.name, row.family]).includes("image");
}

function isTextModelCatalogRow(row: ModelRow): boolean {
  return rowHasExplicitTextOutput(row) && !hasObviousImageModelLabel(row);
}

function isLatestAliasRow(row: ModelRow): boolean {
  return rowText([row.id, row.openrouter_id]).includes("latest");
}

function isDatedAliasRow(row: ModelRow): boolean {
  const normalizedId = normalizedRowId(row);
  return normalizedId != null && /-\d{8}$/.test(normalizedId);
}

function isFastAliasRow(row: ModelRow): boolean {
  const normalizedId = normalizedRowId(row);
  return normalizedId != null && normalizedId.endsWith("-fast");
}

function aliasInclusionRank(row: ModelRow): number {
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

function modelsDevCatalogRow(modelsDevModel: ModelsDevFlatModel): ModelRow | null {
  const canonicalId = qualifyModelId(
    modelsDevModel.model.id ?? modelsDevModel.model_id,
    modelsDevModel.provider_id,
    modelsDevModel.model_id,
  );
  if (canonicalId == null) {
    return null;
  }
  return {
    id: canonicalId,
    provider_id: modelsDevModel.provider_id,
    openrouter_id: canonicalId,
    name:
      typeof modelsDevModel.model.name === "string"
        ? modelsDevModel.model.name
        : modelsDevModel.model_id,
    artificial_analysis_id: null,
    ...modelsDevRowFields(modelsDevModel.model),
  };
}

/** Build a text-model catalog from benchmark-matched rows and nonduplicate models.dev candidates. */
export function buildModelCatalogRows(
  sourceData: Pick<ModelAtlasSourceData, "modelsDev">,
  matchedRows: ModelRow[],
): ModelRow[] {
  const representedModelIds = new Set<string>();
  const representedConcreteFamilies = new Set<string>();
  const trackRepresentedRow = (row: ModelRow) => {
    for (const id of [row.id, row.openrouter_id]) {
      if (id) {
        representedModelIds.add(normalizeProviderModelId(id));
      }
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
    .filter((row) => row != null)
    .sort((left, right) => aliasInclusionRank(left) - aliasInclusionRank(right));
  for (const row of modelsDevCandidateRows) {
    const normalizedId = normalizedRowId(row);
    const latestFamilyKey = isLatestAliasRow(row) ? catalogFamilyKey(row) : null;
    if (
      normalizedId == null ||
      !isTextModelCatalogRow(row) ||
      representedModelIds.has(normalizedId) ||
      (latestFamilyKey != null && representedConcreteFamilies.has(latestFamilyKey))
    ) {
      continue;
    }
    trackRepresentedRow(row);
    catalogRows.push(row);
  }
  return catalogRows;
}
