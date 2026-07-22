/**
 * Blueprint-Bench 2 scraper owns text-page parsing for one normalized model-score map.
 *
 * Page source: https://andonlabs.com/evals/blueprint-bench-2
 */

import { normalizeModelToken } from "../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../runtime";
import { htmlTextLines } from "./parsing";

const DEFAULT_LEADERBOARD_URL = "https://andonlabs.com/evals/blueprint-bench-2";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_START = "Leaderboard";
const LEADERBOARD_END = "The eval";
const LEADERBOARD_ROW_RANK_PATTERN = /^\d+$/;

type BlueprintBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type BlueprintBenchModelScoreRow = {
	model: string;
	score: number;
};

export type BlueprintBenchRowsByModelName = Map<
	string,
	BlueprintBenchModelScoreRow
>;

type BlueprintBenchModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: BlueprintBenchModelScoreRow[];
};

function parseScore(value: string | undefined): number | null {
	if (value == null) {
		return null;
	}
	const score = Number(value.replace(/\*+$/, ""));
	return Number.isFinite(score) && score >= 0 && score <= 1
		? Number(score.toFixed(6))
		: null;
}

function parseLeaderboardCells(lines: string[]): BlueprintBenchModelScoreRow[] {
	const rows: BlueprintBenchModelScoreRow[] = [];
	for (let index = 0; index < lines.length - 2; index += 1) {
		const rank = lines[index];
		if (rank == null || !LEADERBOARD_ROW_RANK_PATTERN.test(rank)) {
			continue;
		}
		const model = lines[index + 1];
		const score = parseScore(lines[index + 2]);
		if (model == null || score == null) {
			continue;
		}
		if (model.toLowerCase().startsWith("human")) {
			index += 2;
			continue;
		}
		rows.push({ model, score });
		index += 2;
	}
	return rows;
}

export function processBlueprintBenchPageHtml(
	pageHtml: string,
): BlueprintBenchModelScoreRow[] {
	const lines = htmlTextLines(pageHtml);
	const start = lines.indexOf(LEADERBOARD_START);
	if (start === -1) {
		return [];
	}
	const bodyStart = start + 1;
	const end = lines.indexOf(LEADERBOARD_END, bodyStart);
	const leaderboardLines =
		end === -1 ? lines.slice(bodyStart) : lines.slice(bodyStart, end);
	const headerIndex = leaderboardLines.findIndex((line, index) => {
		return line === "Model" && leaderboardLines[index + 1] === "Score";
	});
	if (headerIndex === -1) {
		return [];
	}
	return parseLeaderboardCells(leaderboardLines.slice(headerIndex + 2));
}

export function buildBlueprintBenchMap(
	rows: BlueprintBenchModelScoreRow[],
): BlueprintBenchRowsByModelName {
	const rowsByModelName: BlueprintBenchRowsByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			rowsByModelName.set(key, row);
		}
	}
	return rowsByModelName;
}

export function findBlueprintBenchScore(
	candidateNames: unknown[],
	blueprintBenchRowsByModelName: BlueprintBenchRowsByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = blueprintBenchRowsByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

export async function getBlueprintBenchStats(
	options: BlueprintBenchScraperOptions = {},
): Promise<BlueprintBenchModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Blueprint-Bench 2 scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processBlueprintBenchPageHtml(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
