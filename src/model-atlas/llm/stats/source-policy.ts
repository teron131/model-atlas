/** Shared source-selection policy for Model Atlas stages. */

import type { ModelsDevFlatModel } from "../scrapers/models-dev";
import {
	FALLBACK_PROVIDER_IDS,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
	PRIMARY_PROVIDER_ID,
	providerPreferenceRank,
} from "../shared";

import type { ModelsDevModel } from "./types";

export const MODELS_DEV_LOOKBACK_DAYS = 365;

export type ArtificialAnalysisRetainKeys = {
	retainedModelIds: Set<string>;
	retainedModelNames: Set<string>;
};

export function isoDateDaysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
}

/** Build source-backed retain keys so older exact OpenRouter routes can still match benchmark rows. */
export function buildArtificialAnalysisRetainKeys(
	artificialAnalysisRows: readonly unknown[],
): ArtificialAnalysisRetainKeys {
	const retainedModelIds = new Set<string>();
	const retainedModelNames = new Set<string>();

	for (const artificialAnalysisRow of artificialAnalysisRows) {
		const artificialAnalysisModel = artificialAnalysisRow as {
			model_id?: unknown;
			name?: unknown;
		};
		if (typeof artificialAnalysisModel.model_id === "string") {
			retainedModelIds.add(
				normalizeProviderModelId(artificialAnalysisModel.model_id),
			);
			const sourceSlug = modelSlugFromModelId(artificialAnalysisModel.model_id);
			if (sourceSlug) {
				retainedModelNames.add(normalizeModelToken(sourceSlug));
			}
		}
		if (typeof artificialAnalysisModel.name === "string") {
			retainedModelNames.add(normalizeModelToken(artificialAnalysisModel.name));
		}
	}

	return { retainedModelIds, retainedModelNames };
}

/** Keep one preferred models.dev row per model id with OpenRouter first and trusted providers as fallback. */
export function pickPreferredModelsDevRows<
	Model extends ModelsDevModel | ModelsDevFlatModel,
>(modelsDevModels: readonly Model[]): Model[] {
	const preferredModels = modelsDevModels.filter(
		(modelsDevModel) =>
			modelsDevModel.provider_id === PRIMARY_PROVIDER_ID ||
			FALLBACK_PROVIDER_IDS.has(modelsDevModel.provider_id),
	);
	const byModelId = new Map<string, Model>();
	const withPriority = preferredModels.map((modelsDevModel) => ({
		modelsDevModel,
		priority:
			providerPreferenceRank(modelsDevModel.provider_id) ??
			Number.POSITIVE_INFINITY,
	}));
	withPriority.sort((left, right) => left.priority - right.priority);
	for (const { modelsDevModel } of withPriority) {
		byModelId.set(
			modelsDevModel.model_id,
			byModelId.get(modelsDevModel.model_id) ?? modelsDevModel,
		);
	}
	return [...byModelId.values()];
}
