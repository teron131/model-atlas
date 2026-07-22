/**
 * Riemann-bench scraper owns Surge leaderboard normalization for math-proof scores.
 *
 * Page source: https://surgehq.ai/leaderboards/riemann-bench
 * Paper source: https://cdn.prod.website-files.com/68dc970bd6e945ea3fb0f426/69c2d73f5d377a9428089ff7_048c62b8b526b0f06e87457bcca0e6fa_RiemannBench.pdf
 */

import { normalizeModelToken } from "../../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../../runtime";
import { surgeLeaderboardScoreRows } from "./leaderboard";

export const RIEMANN_BENCH_LEADERBOARD_URL =
	"https://surgehq.ai/leaderboards/riemann-bench";
const DEFAULT_TIMEOUT_MS = 30_000;

type RiemannBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type RiemannBenchModelScoreRow = {
	provider: string | null;
	model: string;
	score: number;
	last_updated: string | null;
};

export type RiemannBenchRowsByModelName = Map<
	string,
	RiemannBenchModelScoreRow
>;

type RiemannBenchModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	source_url: string;
	data: RiemannBenchModelScoreRow[];
};

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
): RiemannBenchRowsByModelName {
	const rowsByModelName: RiemannBenchRowsByModelName = new Map();
	for (const row of rows) {
		for (const key of modelKeyCandidates(row.model)) {
			rowsByModelName.set(key, row);
		}
	}
	return rowsByModelName;
}

export function findRiemannBenchScore(
	candidateNames: unknown[],
	riemannBenchRowsByModelName: RiemannBenchRowsByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		for (const key of modelKeyCandidates(candidateName)) {
			const row = riemannBenchRowsByModelName.get(key);
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
	const sourceUrl = options.url ?? RIEMANN_BENCH_LEADERBOARD_URL;
	try {
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(sourceUrl, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Riemann-bench scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			source_url: sourceUrl,
			data: surgeLeaderboardScoreRows(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			source_url: sourceUrl,
			data: [],
		};
	}
}
