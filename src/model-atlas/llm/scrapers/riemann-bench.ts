/**
 * Riemann-bench leaderboard scraper helpers.
 *
 * Page source: https://surgehq.ai/leaderboards/riemann-bench
 * Paper source: https://cdn.prod.website-files.com/68dc970bd6e945ea3fb0f426/69c2d73f5d377a9428089ff7_048c62b8b526b0f06e87457bcca0e6fa_RiemannBench.pdf
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";
import { surgeLeaderboardScoreRows } from "./surge-leaderboard";

const DEFAULT_LEADERBOARD_URL = "https://surgehq.ai/leaderboards/riemann-bench";
const DEFAULT_TIMEOUT_MS = 30_000;

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

export function processRiemannBenchPageHtml(
	pageHtml: string,
): RiemannBenchModelScoreRow[] {
	return surgeLeaderboardScoreRows(pageHtml);
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

export function buildRiemannBenchMap(
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

export async function getRiemannBenchStats(
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
