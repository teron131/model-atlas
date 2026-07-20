/** models.dev cache reconstruction from persisted provider and model rows. */

import type { DatabaseSync } from "node:sqlite";

import type {
	ModelsDevModelRecord,
	ModelsDevPayload,
} from "../../scrapers/models-dev";
import { asFiniteNumber } from "../../shared";
import {
	assignIfBoolean,
	assignIfNumber,
	assignIfString,
	type CacheDbRow,
	firstEpochSecond,
	modalityList,
	queryCacheRows,
	stringValue,
} from "./rows";

function modelCost(row: CacheDbRow): ModelsDevModelRecord["cost"] | undefined {
	const cost: NonNullable<ModelsDevModelRecord["cost"]> = {};
	assignIfNumber(cost, "input", row.cost_input);
	assignIfNumber(cost, "output", row.cost_output);
	assignIfNumber(cost, "cache_read", row.cost_cache_read);
	assignIfNumber(cost, "cache_write", row.cost_cache_write);
	assignIfNumber(cost, "output_audio", row.cost_output_audio);
	return Object.keys(cost).length > 0 ? cost : undefined;
}

function modelLimit(
	row: CacheDbRow,
): ModelsDevModelRecord["limit"] | undefined {
	const limit: NonNullable<ModelsDevModelRecord["limit"]> = {};
	assignIfNumber(limit, "context", row.limit_context);
	assignIfNumber(limit, "output", row.limit_output);
	return Object.keys(limit).length > 0 ? limit : undefined;
}

function modelModalities(
	row: CacheDbRow,
): ModelsDevModelRecord["modalities"] | undefined {
	const input = modalityList(row, "input_modality", [
		"text",
		"image",
		"audio",
		"video",
		"pdf",
	]);
	const output = modalityList(row, "output_modality", [
		"text",
		"image",
		"audio",
		"video",
	]);
	const modalities: NonNullable<ModelsDevModelRecord["modalities"]> = {};
	if (input.length > 0) {
		modalities.input = input;
	}
	if (output.length > 0) {
		modalities.output = output;
	}
	return Object.keys(modalities).length > 0 ? modalities : undefined;
}

function modelsDevModelRecord(row: CacheDbRow): ModelsDevModelRecord {
	const model: ModelsDevModelRecord = {};
	assignIfString(model, "id", row.model_id);
	assignIfString(model, "name", row.name);
	assignIfString(model, "family", row.family);
	assignIfString(model, "release_date", row.release_date);
	assignIfString(model, "last_updated", row.last_updated);
	assignIfBoolean(model, "open_weights", row.open_weights);
	assignIfBoolean(model, "reasoning", row.reasoning);
	assignIfBoolean(model, "tool_call", row.tool_call);
	const cost = modelCost(row);
	const limit = modelLimit(row);
	const modalities = modelModalities(row);
	if (cost != null) {
		model.cost = cost;
	}
	if (limit != null) {
		model.limit = limit;
	}
	if (modalities != null) {
		model.modalities = modalities;
	}
	return model;
}

export function modelsDevRawCacheFromRows(cacheRows: CacheDbRow[]): {
	payload: ModelsDevPayload;
	fetchedAt: number | null;
	statusCode: number | null;
} | null {
	if (cacheRows.length === 0) {
		return null;
	}
	const payload: ModelsDevPayload = {};
	for (const row of cacheRows) {
		const providerId = stringValue(row.provider_id);
		const modelId = stringValue(row.model_id);
		if (providerId == null || modelId == null) {
			continue;
		}
		const provider = payload[providerId] ?? {
			id: providerId,
			name: stringValue(row.provider_name) ?? providerId,
			api: stringValue(row.provider_api) ?? undefined,
			models: {},
		};
		provider.models ??= {};
		provider.models[modelId] = modelsDevModelRecord(row);
		payload[providerId] = provider;
	}
	return {
		payload,
		fetchedAt: firstEpochSecond(cacheRows),
		statusCode: asFiniteNumber(cacheRows[0]?.status_code),
	};
}

export function readModelsDevRawCache(db: DatabaseSync) {
	return modelsDevRawCacheFromRows(
		queryCacheRows(
			db,
			"SELECT * FROM models_dev_raw_models ORDER BY row_index",
		),
	);
}
