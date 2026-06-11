/**
 * Riemann-bench leaderboard scraper helpers.
 *
 * Page source: https://surgehq.ai/leaderboards/riemann-bench
 * Paper source: https://cdn.prod.website-files.com/68dc970bd6e945ea3fb0f426/69c2d73f5d377a9428089ff7_048c62b8b526b0f06e87457bcca0e6fa_RiemannBench.pdf
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";

const DEFAULT_LEADERBOARD_URL = "https://surgehq.ai/leaderboards/riemann-bench";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_MARKER = 'lead-rank-table-title">Model Rankings';
const ROW_START_PATTERN =
	/<div role="listitem" class="lead-rank-corecraft-item[\s\S]*?(?=<div role="listitem" class="lead-rank-corecraft-item|<section|$)/g;

export type RiemannBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type RiemannBenchModelScoreRow = {
	provider: string | null;
	model: string;
	score: number;
	last_updated: string | null;
};

export type RiemannBenchScoreByModelName = Map<
	string,
	RiemannBenchModelScoreRow
>;

export type RiemannBenchModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: RiemannBenchModelScoreRow[];
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

function rowScorePercent(rowHtml: string): string | null {
	const attributeScore = stringAttribute(rowHtml, "data-score");
	if (attributeScore != null && attributeScore.length > 0) {
		return attributeScore;
	}
	const scoreMatch = rowHtml.match(
		/<div[^>]*data-score[^>]*>([\s\S]*?)<\/div>/i,
	);
	const score = scoreMatch == null ? null : stripTags(scoreMatch[1] ?? "");
	return score != null && score.length > 0 ? score : null;
}

function parseLeaderboardRow(
	rowHtml: string,
	lastUpdated: string | null,
): RiemannBenchModelScoreRow | null {
	const model = rowModelName(rowHtml);
	const score = scoreFromPercent(rowScorePercent(rowHtml));
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
	const nextSectionStart = pageHtml.indexOf("<section", start);
	return nextSectionStart === -1
		? pageHtml.slice(start)
		: pageHtml.slice(start, nextSectionStart);
}

/** Extract model score rows from the public Riemann-bench leaderboard page. */
export function processRiemannBenchPageHtml(
	pageHtml: string,
): RiemannBenchModelScoreRow[] {
	const segment = leaderboardSegment(pageHtml);
	const lastUpdated = lastUpdatedFromPage(segment);
	return [...segment.matchAll(ROW_START_PATTERN)]
		.map((match) => parseLeaderboardRow(match[0] ?? "", lastUpdated))
		.filter((row): row is RiemannBenchModelScoreRow => row != null);
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

/** Build Riemann-bench score rows by normalized model name. */
export function buildRiemannBenchScoreByModelName(
	rows: RiemannBenchModelScoreRow[],
): RiemannBenchScoreByModelName {
	const scoreByModelName: RiemannBenchScoreByModelName = new Map();
	for (const row of rows) {
		for (const key of modelKeyCandidates(row.model)) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a Riemann-bench score from display names. */
export function findRiemannBenchScore(
	candidateNames: unknown[],
	riemannBenchScoreByModelName: RiemannBenchScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		for (const key of modelKeyCandidates(candidateName)) {
			const row = riemannBenchScoreByModelName.get(key);
			if (row) {
				return row.score;
			}
		}
	}
	return null;
}

/** Fetch Riemann-bench model score rows from the public page. */
export async function getRiemannBenchModelScoreStats(
	options: RiemannBenchScraperOptions = {},
): Promise<RiemannBenchModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Riemann-bench scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processRiemannBenchPageHtml(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
