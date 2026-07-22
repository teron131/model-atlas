/** Dashboard model identity, variant, label, and filtering rules. */

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { strongestModelVariants } from "../../../src/model-atlas/pipeline/selection/public-list";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";

export function modelCount(models: LlmStatsModel[]): number {
	return new Set(models.map(canonicalModelKey)).size;
}

/** Expand every reasoning variant when requested; otherwise retain the highest-scoring variant per model. */
export function modelsForVariantDisplay(
	models: LlmStatsModel[],
	showVariants: boolean,
): LlmStatsModel[] {
	const variantsByIdentity = new Map<string, LlmStatsModel>();
	for (const model of models) {
		const key = modelVariantKey(model);
		const existing = variantsByIdentity.get(key);
		if (
			existing == null ||
			model.scores.intelligence_score > existing.scores.intelligence_score
		) {
			variantsByIdentity.set(key, model);
		}
	}
	const modelVariants = [...variantsByIdentity.values()];
	if (showVariants) {
		return modelVariants;
	}
	return strongestModelVariants(modelVariants).map((model) => ({
		...model,
		reasoning_effort: null,
	}));
}

export function modelDisplayName(model: LlmStatsModel): string {
	const baseName = model.name ?? model.id ?? "Unknown model";
	return model.reasoning_effort == null
		? baseName
		: `${baseName} (${model.reasoning_effort})`;
}

/** Match the model identity fields exposed by dashboard search controls. */
export function modelMatchesQuery(
	model: LlmStatsModel,
	filterQuery: string,
): boolean {
	const query = filterQuery.trim().toLowerCase();
	if (!query) {
		return true;
	}
	const searchable = [modelDisplayName(model), model.id, model.provider]
		.join(" ")
		.toLowerCase();
	return query.split(/\s+/).every((term) => searchable.includes(term));
}

/** Toggle one provider while an empty selection continues to represent All. */
export function toggleProviderFilter(
	selectedProviders: string[],
	provider: string,
): string[] {
	return selectedProviders.includes(provider)
		? selectedProviders.filter((selected) => selected !== provider)
		: [...selectedProviders, provider];
}

export function modelVariantKey(model: LlmStatsModel): string {
	return `${canonicalModelKey(model)}\u0000${model.reasoning_effort ?? ""}`;
}
