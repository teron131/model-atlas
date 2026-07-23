/** Dashboard model identity, variant, label, and filtering rules. */

import { canonicalModelKey } from "../../../src/model-atlas/identity/normalization";
import { strongestModelVariants } from "../../../src/model-atlas/pipeline/selection/public-list";
import type { ModelAtlasModel } from "../../../src/model-atlas/stats/types";

const searchTextByModel = new WeakMap<ModelAtlasModel, string>();

export function modelCount(models: ModelAtlasModel[]): number {
	return new Set(models.map(canonicalModelKey)).size;
}

/** Expand every reasoning variant when requested; otherwise retain the highest-scoring variant per model. */
export function modelsForVariantDisplay(
	models: ModelAtlasModel[],
	showVariants: boolean,
): ModelAtlasModel[] {
	const variantsByIdentity = new Map<string, ModelAtlasModel>();
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

export function modelDisplayName(model: ModelAtlasModel): string {
	const baseName = model.name ?? model.id ?? "Unknown model";
	return model.reasoning_effort == null
		? baseName
		: `${baseName} (${model.reasoning_effort})`;
}

/** Filter model-backed rows while normalizing the query and model text only once per stable input. */
export function filterByModelQuery<T>(
	items: readonly T[],
	getModel: (item: T) => ModelAtlasModel,
	filterQuery: string,
): T[] {
	const terms = filterQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) {
		return [...items];
	}
	return items.filter((item) => {
		const model = getModel(item);
		let searchable = searchTextByModel.get(model);
		if (searchable == null) {
			searchable = [modelDisplayName(model), model.id, model.provider]
				.join(" ")
				.toLowerCase();
			searchTextByModel.set(model, searchable);
		}
		return terms.every((term) => searchable.includes(term));
	});
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

export function modelVariantKey(model: ModelAtlasModel): string {
	return `${canonicalModelKey(model)}\u0000${model.reasoning_effort ?? ""}`;
}
