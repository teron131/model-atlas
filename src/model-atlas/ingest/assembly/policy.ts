/** Source-selection policy keeps benchmark-retained catalog rows and provider preference in one stage boundary. */

import { claudeIdentityKey, parseClaudeIdentity } from "../../identity/claude";
import {
	FALLBACK_PROVIDER_IDS,
	modelSlugFromModelId,
	normalizeModelToken,
	normalizeProviderModelId,
	PRIMARY_PROVIDER_ID,
	providerPreferenceRank,
} from "../../identity/normalization";
import {
	type ModelsDevFlatModel,
	type ModelsDevPayload,
	processModelsDevPayload,
} from "../../scrapers/models-dev";

const MODELS_DEV_LOOKBACK_DAYS = 365;

type ArtificialAnalysisRetentionKeys = {
	retainedModelIds: Set<string>;
	retainedModelNames: Set<string>;
	retainedClaudeIdentityKeys: Set<string>;
};

function isoDateDaysAgo(days: number): string {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);
}

/** Artificial Analysis identities retain older catalog rows that still carry current benchmark evidence. */
function buildArtificialAnalysisRetentionKeys(
	artificialAnalysisRows: readonly unknown[],
): ArtificialAnalysisRetentionKeys {
	const retainedModelIds = new Set<string>();
	const retainedModelNames = new Set<string>();
	const retainedClaudeIdentityKeys = new Set<string>();
	const addClaudeIdentityKey = (value: string) => {
		const identity = parseClaudeIdentity(value);
		if (identity != null) {
			retainedClaudeIdentityKeys.add(claudeIdentityKey(identity));
		}
	};

	for (const artificialAnalysisRow of artificialAnalysisRows) {
		const artificialAnalysisModel = artificialAnalysisRow as {
			model_id?: unknown;
			name?: unknown;
		};
		if (typeof artificialAnalysisModel.model_id === "string") {
			addClaudeIdentityKey(artificialAnalysisModel.model_id);
			retainedModelIds.add(
				normalizeProviderModelId(artificialAnalysisModel.model_id),
			);
			const sourceSlug = modelSlugFromModelId(artificialAnalysisModel.model_id);
			if (sourceSlug) {
				retainedModelNames.add(normalizeModelToken(sourceSlug));
			}
		}
		if (typeof artificialAnalysisModel.name === "string") {
			addClaudeIdentityKey(artificialAnalysisModel.name);
			retainedModelNames.add(normalizeModelToken(artificialAnalysisModel.name));
		}
	}

	return {
		retainedModelIds,
		retainedModelNames,
		retainedClaudeIdentityKeys,
	};
}

/** Apply the shared lookback and Artificial Analysis retention policy to a raw models.dev payload. */
export function selectModelsDevRowsForArtificialAnalysis(
	modelsDevPayload: ModelsDevPayload,
	artificialAnalysisRows: readonly unknown[],
): ModelsDevFlatModel[] {
	return processModelsDevPayload(
		modelsDevPayload,
		isoDateDaysAgo(MODELS_DEV_LOOKBACK_DAYS),
		buildArtificialAnalysisRetentionKeys(artificialAnalysisRows),
	);
}

/** Provider preference collapses duplicate catalog rows before matching so callers do not rank providers themselves. */
export function pickPreferredModelsDevRows<Model extends ModelsDevFlatModel>(
	modelsDevModels: readonly Model[],
): Model[] {
	const preferredModels = modelsDevModels.filter(
		(modelsDevModel) =>
			modelsDevModel.provider_id === PRIMARY_PROVIDER_ID ||
			FALLBACK_PROVIDER_IDS.has(modelsDevModel.provider_id),
	);
	const byModelId = new Map<string, Model>();
	const prioritizedModels = preferredModels.map((modelsDevModel) => ({
		modelsDevModel,
		priority:
			providerPreferenceRank(modelsDevModel.provider_id) ??
			Number.POSITIVE_INFINITY,
	}));
	prioritizedModels.sort((left, right) => left.priority - right.priority);
	for (const { modelsDevModel } of prioritizedModels) {
		byModelId.set(
			modelsDevModel.model_id,
			byModelId.get(modelsDevModel.model_id) ?? modelsDevModel,
		);
	}
	return [...byModelId.values()];
}
