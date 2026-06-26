/**
 * GDP.pdf leaderboard scraper helpers.
 *
 * Page source: https://surgehq.ai/leaderboards/gdp-pdf
 * Dataset source: https://huggingface.co/datasets/surgeai/GDP.pdf
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";
import { surgeLeaderboardScoreRows } from "./surge-leaderboard";

const DEFAULT_LEADERBOARD_URL = "https://surgehq.ai/leaderboards/gdp-pdf";
const DEFAULT_TIMEOUT_MS = 30_000;

export type GdpPdfScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type GdpPdfModelScoreRow = {
	provider: string | null;
	model: string;
	score: number;
	last_updated?: string | null;
};

export type GdpPdfScoreByModelName = Map<string, GdpPdfModelScoreRow>;

export type GdpPdfModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: GdpPdfModelScoreRow[];
};

/** Extract model score rows from the public GDP.pdf leaderboard page. */
export function processGdpPdfPageHtml(pageHtml: string): GdpPdfModelScoreRow[] {
	return surgeLeaderboardScoreRows(pageHtml);
}

/** Normalizes model key candidates from benchmark source data. */
function modelKeyCandidates(model: string): string[] {
	const withoutParenthetical = model.replace(/\s*\([^)]*\)/g, "").trim();
	const slashParts = withoutParenthetical
		.split("/")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	return [model, withoutParenthetical, ...slashParts]
		.map(normalizeModelToken)
		.filter(
			(key, index, keys) => key.length > 0 && keys.indexOf(key) === index,
		);
}

/** Build GDP.pdf score rows by normalized model name. */
export function buildGdpPdfScoreByModelName(
	rows: GdpPdfModelScoreRow[],
): GdpPdfScoreByModelName {
	const scoreByModelName: GdpPdfScoreByModelName = new Map();
	for (const row of rows) {
		for (const key of modelKeyCandidates(row.model)) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a GDP.pdf score from display names. */
export function findGdpPdfScore(
	candidateNames: unknown[],
	gdpPdfScoreByModelName: GdpPdfScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		for (const key of modelKeyCandidates(candidateName)) {
			const row = gdpPdfScoreByModelName.get(key);
			if (row) {
				return row.score;
			}
		}
	}
	return null;
}

/** Fetch GDP.pdf model score rows from the public page. */
export async function getGdpPdfModelScoreStats(
	options: GdpPdfScraperOptions = {},
): Promise<GdpPdfModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`GDP.pdf scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processGdpPdfPageHtml(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
