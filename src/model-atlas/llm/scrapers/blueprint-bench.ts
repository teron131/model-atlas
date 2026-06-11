/**
 * Blueprint-Bench 2 leaderboard scraper helpers.
 *
 * Page source: https://andonlabs.com/evals/blueprint-bench-2
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";

const DEFAULT_LEADERBOARD_URL = "https://andonlabs.com/evals/blueprint-bench-2";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_START = "Leaderboard";
const LEADERBOARD_END = "The eval";
const LEADERBOARD_ROW_RANK_PATTERN = /^\d+$/;

export type BlueprintBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type BlueprintBenchModelScoreRow = {
	model: string;
	score: number;
};

export type BlueprintBenchScoreByModelName = Map<
	string,
	BlueprintBenchModelScoreRow
>;

export type BlueprintBenchModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: BlueprintBenchModelScoreRow[];
};

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&nbsp;/g, " ")
		.replace(/&#xA0;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"');
}

function pageLines(pageHtml: string): string[] {
	return decodeHtmlEntities(
		pageHtml
			.replace(/<script[\s\S]*?<\/script>/g, " ")
			.replace(/<style[\s\S]*?<\/style>/g, " ")
			.replace(/<[^>]+>/g, "\n"),
	)
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => line.length > 0);
}

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

/** Extract model and normalized score rows from the public Blueprint-Bench 2 page. */
export function processBlueprintBenchPageHtml(
	pageHtml: string,
): BlueprintBenchModelScoreRow[] {
	const lines = pageLines(pageHtml);
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

/** Build Blueprint-Bench 2 score rows by normalized model name. */
export function buildBlueprintBenchScoreByModelName(
	rows: BlueprintBenchModelScoreRow[],
): BlueprintBenchScoreByModelName {
	const scoreByModelName: BlueprintBenchScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a Blueprint-Bench 2 score from display names. */
export function findBlueprintBenchScore(
	candidateNames: unknown[],
	blueprintBenchScoreByModelName: BlueprintBenchScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = blueprintBenchScoreByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

/** Fetch Blueprint-Bench 2 model score rows from the public page. */
export async function getBlueprintBenchModelScoreStats(
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
