/** Dashboard model display rules own model identity, variant expansion, labels, and UI identity. */

import {
	modelIdentityKey,
	strongestModelVariants,
} from "../../../src/model-atlas/stats/selection/public-list";
import type { LlmStatsModel } from "../../../src/model-atlas/stats/types";

export function modelCount(models: LlmStatsModel[]): number {
	return new Set(models.map(modelIdentityKey)).size;
}

/** Expand every reasoning variant when requested; otherwise retain the highest-scoring variant per model. */
export function modelsForVariantDisplay(
	models: LlmStatsModel[],
	expandReasoningVariants: boolean,
): LlmStatsModel[] {
	if (expandReasoningVariants) {
		return models;
	}
	return strongestModelVariants(models).map((model) => ({
		...model,
		reasoning_effort: null,
	}));
}

export function modelBaseDisplayName(model: LlmStatsModel): string {
	return model.name ?? model.id ?? "Unknown model";
}

export function modelDisplayName(model: LlmStatsModel): string {
	const baseName = modelBaseDisplayName(model);
	return model.reasoning_effort == null
		? baseName
		: `${baseName} (${model.reasoning_effort})`;
}

export function modelVariantKey(model: LlmStatsModel): string {
	return `${model.id ?? model.name ?? ""}\u0000${model.reasoning_effort ?? ""}`;
}
