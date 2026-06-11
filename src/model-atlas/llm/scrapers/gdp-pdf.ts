/**
 * GDP.pdf leaderboard scraper helpers.
 *
 * Page source: https://surgehq.ai/leaderboards/gdp-pdf
 * Dataset source: https://huggingface.co/datasets/surgeai/GDP.pdf
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";

const DEFAULT_LEADERBOARD_URL = "https://surgehq.ai/leaderboards/gdp-pdf";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_MARKER = 'lead-rank-table-title">Model Rankings';
const ROW_START_PATTERN =
	/<div role="listitem" class="lead-rank-corecraft-item[\s\S]*?(?=<div role="listitem" class="lead-rank-corecraft-item|<section id="newsletter"|$)/g;

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

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/g, " ")
		.replace(/&#xA0;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"');
}

function stripTags(value: string): string {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function stringAttribute(html: string, name: string): string | null {
	const match = html.match(new RegExp(`${name}="([^"]+)"`, "i"));
	return match == null ? null : decodeHtmlEntities(match[1] ?? "").trim();
}

function scoreFromPercent(value: string | null): number | null {
	if (value == null) {
		return null;
	}
	const score = Number(value);
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return null;
	}
	return Number((score / 100).toFixed(6));
}

function providerFromAlt(value: string | null): string | null {
	if (value == null) {
		return null;
	}
	const provider = value.replace(/\s+logo$/i, "").trim();
	return provider.length > 0 ? provider : null;
}

function lastUpdatedFromPage(pageHtml: string): string | null {
	const match = pageHtml.match(/Last updated\s+(\d{2}\/\d{2}\/\d{4})/i);
	return match?.[1] ?? null;
}

function rowModelName(rowHtml: string): string | null {
	const modelMatch = rowHtml.match(/corecraft-model[^>]*>([\s\S]*?)<\/div>/i);
	const model = modelMatch == null ? null : stripTags(modelMatch[1] ?? "");
	return model != null && model.length > 0 ? model : null;
}

function parseLeaderboardRow(
	rowHtml: string,
	lastUpdated: string | null,
): GdpPdfModelScoreRow | null {
	const model = rowModelName(rowHtml);
	const score = scoreFromPercent(stringAttribute(rowHtml, "data-score"));
	if (model == null || score == null) {
		return null;
	}
	return {
		provider: providerFromAlt(stringAttribute(rowHtml, "alt")),
		model,
		score,
		last_updated: lastUpdated,
	};
}

function leaderboardSegment(pageHtml: string): string {
	const start = pageHtml.indexOf(LEADERBOARD_MARKER);
	if (start === -1) {
		return "";
	}
	const newsletterStart = pageHtml.indexOf('<section id="newsletter"', start);
	return newsletterStart === -1
		? pageHtml.slice(start)
		: pageHtml.slice(start, newsletterStart);
}

/** Extract model score rows from the public GDP.pdf leaderboard page. */
export function processGdpPdfPageHtml(pageHtml: string): GdpPdfModelScoreRow[] {
	const segment = leaderboardSegment(pageHtml);
	const lastUpdated = lastUpdatedFromPage(segment);
	return [...segment.matchAll(ROW_START_PATTERN)]
		.map((match) => parseLeaderboardRow(match[0] ?? "", lastUpdated))
		.filter((row): row is GdpPdfModelScoreRow => row != null);
}

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
