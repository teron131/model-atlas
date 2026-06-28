/**
 * BrowseComp source helpers.
 *
 * Page source: https://llm-stats.com/benchmarks/browsecomp
 * JSON source: https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";
import { zeroEvalModelRows, zeroEvalModelScoreFields } from "./parsing";

const DEFAULT_DETAILS_URL =
	"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details";
const DEFAULT_TIMEOUT_MS = 30_000;

export type BrowseCompScraperOptions = {
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

export type BrowseCompScoreByModelName = Map<string, BrowseCompModelScoreRow>;

export type BrowseCompModelScorePayload = {
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
): BrowseCompScoreByModelName {
	const scoreByModelName: BrowseCompScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

export function findBrowseCompScore(
	candidateNames: unknown[],
	browseCompScoreByModelName: BrowseCompScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = browseCompScoreByModelName.get(
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
