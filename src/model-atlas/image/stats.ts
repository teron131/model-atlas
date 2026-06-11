/** Stats pipeline helpers. */

/** Public image stats API: cache list payloads, rebuild from live sources when needed, and return failure-safe output. */
import {
	currentEpochSeconds,
	DEFAULT_OUTPUT_PATH,
	loadImageStatsFromCache,
	saveImageStatsToPath,
} from "./stats/cache";
import { buildFinalModels } from "./stats/final-stage";
import { buildMatchedRows } from "./stats/match-stage";
import { fetchSourceData } from "./stats/source-stage";
import type {
	ImageStatsModel,
	ImageStatsOptions,
	ImageStatsPayload,
} from "./stats/types";

export type { ImageStatsModel, ImageStatsOptions, ImageStatsPayload };

/** Return whether the request is for the cacheable list payload. */
function isListRequest(modelId: string | null | undefined): boolean {
	return modelId == null;
}

/** Save the image stats pipeline payload. */
export async function saveImageStats(
	payload: ImageStatsPayload,
	outputPath = DEFAULT_OUTPUT_PATH,
): Promise<void> {
	await saveImageStatsToPath(payload, outputPath);
}

/** Return the image stats pipeline payload. */
export async function getImageStats(
	options: ImageStatsOptions = {},
): Promise<ImageStatsPayload> {
	try {
		const modelId = options.id ?? null;

		if (isListRequest(modelId)) {
			const cachedPayload = await loadImageStatsFromCache(DEFAULT_OUTPUT_PATH);
			if (cachedPayload) {
				return cachedPayload;
			}
		}

		const sourceData = await fetchSourceData();
		const matchedRows = await buildMatchedRows(sourceData);
		const models = await buildFinalModels(matchedRows, modelId);
		const fetchedAt = currentEpochSeconds();

		if (!isListRequest(modelId)) {
			return {
				fetched_at_epoch_seconds: fetchedAt,
				models,
			};
		}

		const listPayload: ImageStatsPayload = {
			fetched_at_epoch_seconds: fetchedAt,
			models,
		};
		await saveImageStats(listPayload, DEFAULT_OUTPUT_PATH);
		return listPayload;
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			models: [],
		};
	}
}
