/**
 * BrowseComp scraper owns ZeroEval payload normalization for the BrowseComp benchmark.
 *
 * Page source: https://llm-stats.com/benchmarks/browsecomp
 * JSON source: https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details
 */

import { normalizeModelToken } from "../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../utils";
import { zeroEvalModelRows, zeroEvalModelScoreFields } from "./parsing";

const DEFAULT_DETAILS_URL =
	"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details";
const DEFAULT_TIMEOUT_MS = 30_000;

type BrowseCompScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type BrowseCompModelScoreRow = {
	model: string;
	provider: string;
	provider_name?: string | null;
	score: number;
	source_url?: string | null;
	analysis_method?: string | null;
	verified?: boolean | null;
	self_reported?: boolean | null;
};

export type BrowseCompRowsByModelName = Map<string, BrowseCompModelScoreRow>;

type BrowseCompModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: BrowseCompModelScoreRow[];
};

export function processBrowseCompDetailsJson(
	payload: unknown,
): BrowseCompModelScoreRow[] {
	return zeroEvalModelRows<BrowseCompModelScoreRow>(
		payload,
		zeroEvalModelScoreFields,
	);
}

export function buildBrowseCompMap(
	rows: BrowseCompModelScoreRow[],
): BrowseCompRowsByModelName {
	const rowsByModelName: BrowseCompRowsByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			rowsByModelName.set(key, row);
		}
	}
	return rowsByModelName;
}

export function findBrowseCompScore(
	candidateNames: unknown[],
	browseCompRowsByModelName: BrowseCompRowsByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = browseCompRowsByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

export async function getBrowseCompStats(
	options: BrowseCompScraperOptions = {},
): Promise<BrowseCompModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_DETAILS_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`BrowseComp scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processBrowseCompDetailsJson(await response.json()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
