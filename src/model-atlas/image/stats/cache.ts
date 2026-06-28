/** Cache helpers for selected image stats payloads. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
	isFreshEpochSeconds,
	nowEpochSeconds,
	writeJsonFile,
} from "../../utils";
import type { ImageStatsPayload } from "./types";

export const DEFAULT_OUTPUT_PATH = resolve(".cache/image_stats.json");
const CACHE_TTL_SECONDS = 60 * 60 * 24;

export function currentEpochSeconds(): number {
	return nowEpochSeconds();
}

export async function saveImageStatsToPath(
	payload: ImageStatsPayload,
	outputPath = DEFAULT_OUTPUT_PATH,
): Promise<void> {
	try {
		await writeJsonFile(outputPath, payload);
	} catch {
		// Intentionally swallow cache write errors: API remains in-memory first.
	}
}

export async function loadImageStatsFromCache(
	outputPath: string,
): Promise<ImageStatsPayload | null> {
	try {
		const content = await readFile(outputPath, "utf-8");
		const payload = JSON.parse(content) as ImageStatsPayload;
		if (!Array.isArray(payload.models)) {
			return null;
		}
		if (
			!isFreshEpochSeconds(payload.fetched_at_epoch_seconds, CACHE_TTL_SECONDS)
		) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}
