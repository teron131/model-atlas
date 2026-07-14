/**
 * Models.dev scraper owns provider flattening plus Vercel overlay details for recent model rows.
 *
 * JSON source: https://models.dev/api.json
 * Overlay page source: https://vercel.com/ai-gateway/models
 */

import { claudeIdentityKey, parseClaudeIdentity } from "../claude-identity";
import { normalizeModelToken, normalizeProviderModelId } from "../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../utils";

const MODELS_DEV_URL = "https://models.dev/api.json";
const VERCEL_AI_GATEWAY_MODELS_URL = "https://vercel.com/ai-gateway/models";
const REQUEST_TIMEOUT_MS = 30_000;
const VERCEL_PROVIDER_ID = "vercel";
const VERCEL_PROVIDER_NAME = "Vercel AI Gateway";
const NON_GENERATIVE_MODEL_TOKENS = new Set([
	"embed",
	"embedding",
	"embeddings",
	"rerank",
	"reranker",
]);
const VERCEL_GATEWAY_MODEL_PATTERN =
	/\\"displayName\\":\\"([^\\"]*)\\",\\"creatorOrganization\\":\\"[^\\"]*\\",\\"copyString\\":\\"([^\\"]+)\\",[\s\S]*?\\"releaseDate\\":\\"([^\\"]*)\\"/g;

export type ModelsDevModelRecord = {
	id?: string;
	name?: string;
	family?: string;
	release_date?: string;
	last_updated?: string;
	open_weights?: boolean;
	reasoning?: boolean;
	tool_call?: boolean;
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
		output_audio?: number;
	};
	limit?: {
		context?: number;
		output?: number;
	};
	modalities?: {
		input?: string[];
		output?: string[];
	};
	[key: string]: unknown;
};

export type ModelsDevProviderRecord = {
	id?: string;
	name?: string;
	api?: string;
	models?: Record<string, ModelsDevModelRecord>;
	[key: string]: unknown;
};

export type ModelsDevPayload = Record<string, ModelsDevProviderRecord>;

export type ModelsDevFlatModel = {
	provider_id: string;
	provider_name: string;
	model_id: string;
	model: ModelsDevModelRecord;
};

export type ModelsDevSourcePayload = {
	fetched_at_epoch_seconds: number | null;
	status_code: number | null;
	payload: ModelsDevPayload;
	live_vercel_models: VercelGatewayModelRecord[];
};

export type VercelGatewayModelRecord = {
	display_name: string;
	model_id: string;
	release_date: string | null;
};

type ProcessModelsDevPayloadOptions = {
	retainedModelIds?: ReadonlySet<string>;
	retainedModelNames?: ReadonlySet<string>;
	retainedClaudeIdentityKeys?: ReadonlySet<string>;
};
function isRecentDate(
	isoDate: string | undefined,
	cutoffIsoDate: string,
): boolean {
	if (!isoDate) {
		return false;
	}
	return isoDate >= cutoffIsoDate;
}

function asFiniteNumber(value: unknown): number | null {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

/** Vercel serializes missing page fields as sentinel strings, not JSON null. */
function isSentinelString(value: string | null | undefined): boolean {
	return !value || value === "$undefined";
}

/** Vercel overlay rows prefer the live page name while preserving models.dev metadata fields. */
function buildVercelModelRecord(
	model: VercelGatewayModelRecord,
	fallbackModel: ModelsDevModelRecord | undefined,
): ModelsDevModelRecord {
	return {
		...fallbackModel,
		id: model.model_id,
		name: model.display_name || fallbackModel?.name || model.model_id,
		release_date: model.release_date ?? fallbackModel?.release_date,
		last_updated: model.release_date ?? fallbackModel?.last_updated,
	};
}

function extractVercelGatewayModels(html: string): VercelGatewayModelRecord[] {
	const matches = [...html.matchAll(VERCEL_GATEWAY_MODEL_PATTERN)];
	const byModelId = new Map<string, VercelGatewayModelRecord>();

	for (const match of matches) {
		const [, displayName, modelId, releaseDate] = match;
		if (!modelId) {
			continue;
		}
		byModelId.set(modelId, {
			display_name: displayName ?? modelId,
			model_id: modelId,
			release_date: isSentinelString(releaseDate)
				? null
				: (releaseDate ?? null),
		});
	}

	return [...byModelId.values()];
}

async function fetchVercelGatewayModels(): Promise<VercelGatewayModelRecord[]> {
	try {
		const response = await fetchWithTimeout(
			VERCEL_AI_GATEWAY_MODELS_URL,
			{},
			REQUEST_TIMEOUT_MS,
		);
		if (!response.ok) {
			throw new Error(`Vercel AI Gateway request failed: ${response.status}`);
		}
		return extractVercelGatewayModels(await response.text());
	} catch {
		return [];
	}
}

function mergeVercelProvider(
	payload: ModelsDevPayload,
	liveVercelModels: VercelGatewayModelRecord[],
): ModelsDevPayload {
	const existingVercelProvider = payload[VERCEL_PROVIDER_ID];
	const existingVercelModels = existingVercelProvider?.models ?? {};
	if (liveVercelModels.length === 0) {
		return payload;
	}

	const mergedVercelModels = Object.fromEntries(
		liveVercelModels.map((model) => [
			model.model_id,
			buildVercelModelRecord(model, existingVercelModels[model.model_id]),
		]),
	);

	return {
		...payload,
		[VERCEL_PROVIDER_ID]: {
			...existingVercelProvider,
			id: VERCEL_PROVIDER_ID,
			name: existingVercelProvider?.name ?? VERCEL_PROVIDER_NAME,
			models: mergedVercelModels,
		},
	};
}

async function fetchModelsDev(): Promise<ModelsDevSourcePayload> {
	const [response, liveVercelModels] = await Promise.all([
		fetchWithTimeout(MODELS_DEV_URL, {}, REQUEST_TIMEOUT_MS),
		fetchVercelGatewayModels(),
	]);

	if (!response.ok) {
		throw new Error(`models.dev request failed: ${response.status}`);
	}

	const payload = mergeVercelProvider(
		(await response.json()) as ModelsDevPayload,
		liveVercelModels,
	);
	return {
		fetched_at_epoch_seconds: nowEpochSeconds(),
		status_code: response.status,
		payload,
		live_vercel_models: liveVercelModels,
	};
}

function flattenModels(payload: ModelsDevPayload): ModelsDevFlatModel[] {
	const rows: ModelsDevFlatModel[] = [];
	for (const [providerId, provider] of Object.entries(payload)) {
		const providerName = provider.name ?? providerId;
		const models = provider.models ?? {};
		for (const [modelId, model] of Object.entries(models)) {
			rows.push({
				provider_id: providerId,
				provider_name: providerName,
				model_id: model.id ?? modelId,
				model,
			});
		}
	}
	return rows;
}

function shouldRetainModel(
	row: ModelsDevFlatModel,
	options: ProcessModelsDevPayloadOptions,
): boolean {
	const matchesRetainedClaudeIdentity = [row.model_id, row.model.name].some(
		(value) => {
			if (typeof value !== "string") {
				return false;
			}
			const identity = parseClaudeIdentity(value);
			return (
				identity != null &&
				options.retainedClaudeIdentityKeys?.has(claudeIdentityKey(identity)) ===
					true
			);
		},
	);
	return (
		options.retainedModelIds?.has(normalizeProviderModelId(row.model_id)) ===
			true ||
		(typeof row.model.name === "string" &&
			options.retainedModelNames?.has(normalizeModelToken(row.model.name)) ===
				true) ||
		matchesRetainedClaudeIdentity
	);
}

/** Excludes catalog task models while raw models.dev source rows remain preserved separately. */
function isGenerativeModel(row: ModelsDevFlatModel): boolean {
	return ![row.model_id, row.model.name].some(
		(value) =>
			typeof value === "string" &&
			normalizeModelToken(value)
				.split(/[-/]/)
				.some((token) => NON_GENERATIVE_MODEL_TOKENS.has(token)),
	);
}

function rankRecentModels(
	models: ModelsDevFlatModel[],
	cutoffIsoDate: string,
	options: ProcessModelsDevPayloadOptions = {},
): ModelsDevFlatModel[] {
	return models
		.filter(isGenerativeModel)
		.filter(
			(row) =>
				isRecentDate(row.model.release_date, cutoffIsoDate) ||
				shouldRetainModel(row, options),
		)
		.sort((left, right) => {
			const leftOutputCost =
				asFiniteNumber(left.model.cost?.output) ?? Number.POSITIVE_INFINITY;
			const rightOutputCost =
				asFiniteNumber(right.model.cost?.output) ?? Number.POSITIVE_INFINITY;
			if (leftOutputCost !== rightOutputCost) {
				return leftOutputCost - rightOutputCost;
			}
			return (right.model.release_date ?? "").localeCompare(
				left.model.release_date ?? "",
			);
		});
}

/** Flatten and rank a models.dev payload for a caller-provided date cutoff. */
export function processModelsDevPayload(
	payload: ModelsDevPayload,
	cutoffIsoDate: string,
	options: ProcessModelsDevPayloadOptions = {},
): ModelsDevFlatModel[] {
	return rankRecentModels(flattenModels(payload), cutoffIsoDate, options);
}

export async function getModelsDevSourceStats(): Promise<ModelsDevSourcePayload> {
	try {
		return await fetchModelsDev();
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			status_code: null,
			payload: {},
			live_vercel_models: [],
		};
	}
}
