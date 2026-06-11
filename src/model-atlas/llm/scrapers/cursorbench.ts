/**
 * CursorBench leaderboard scraper helpers.
 *
 * Page source: https://cursor.com/cursorbench
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { normalizeModelToken } from "../shared";

const DEFAULT_LEADERBOARD_URL = "https://cursor.com/cursorbench";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_HEADER =
	"Model Score Cost Cost / task Tokens Tokens / task Steps Steps / task";
const LEADERBOARD_HEADER_CELLS = [
	"Model",
	"Score",
	"Cost",
	"Cost / task",
	"Tokens",
	"Tokens / task",
	"Steps",
	"Steps / task",
] as const;
const LEADERBOARD_END = "Changelog";
const PRIVATE_CURSOR_MODEL_PREFIX = /^composer\b/i;
const REASONING_EFFORTS = [
	"Extra High",
	"Max",
	"High",
	"Medium",
	"Low",
] as const;

export type CursorBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type CursorBenchModelScoreRow = {
	rank: number;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	score: number;
	cost_per_task_usd: number;
	tokens_per_task: number;
	steps_per_task: number;
};

export type CursorBenchScoreByModelName = Map<string, CursorBenchModelScoreRow>;

export type CursorBenchModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: CursorBenchModelScoreRow[];
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

function findLeaderboardBodyStart(lines: string[]): number {
	const combinedHeaderIndex = lines.indexOf(LEADERBOARD_HEADER);
	if (combinedHeaderIndex !== -1) {
		return combinedHeaderIndex + 1;
	}
	for (let index = 0; index < lines.length; index += 1) {
		const possibleHeader = lines.slice(
			index,
			index + LEADERBOARD_HEADER_CELLS.length,
		);
		if (
			possibleHeader.length === LEADERBOARD_HEADER_CELLS.length &&
			possibleHeader.every(
				(value, headerIndex) =>
					value === LEADERBOARD_HEADER_CELLS[headerIndex],
			)
		) {
			return index + LEADERBOARD_HEADER_CELLS.length;
		}
	}
	return -1;
}

function parseReasoningEffort(model: string): string | null {
	for (const effort of REASONING_EFFORTS) {
		if (model.endsWith(` ${effort}`)) {
			return effort;
		}
	}
	return null;
}

function baseModelName(model: string): string {
	const effort = parseReasoningEffort(model);
	return effort == null
		? model
		: model.slice(0, -effort.length).trim();
}

function isPrivateCursorModel(model: string): boolean {
	return PRIVATE_CURSOR_MODEL_PREFIX.test(baseModelName(model));
}

function parsePercent(value: string): number {
	return Number((Number(value) / 100).toFixed(6));
}

function parseCount(value: string): number {
	return Number(value.replace(/,/g, ""));
}

function parseCursorBenchRow(line: string): CursorBenchModelScoreRow | null {
	const match = line.match(
		/^(?<rank>\d+)\s+(?<model>.+?)\s+(?<score>\d+(?:\.\d+)?)%\$?(?<cost>\d+(?:\.\d+)?)\s+(?<tokens>[\d,]+)\s+(?<steps>\d+)$/,
	);
	if (match?.groups == null) {
		return null;
	}
	const model = match.groups.model?.trim();
	const rank = Number(match.groups.rank);
	const score = parsePercent(match.groups.score ?? "");
	const costPerTaskUsd = Number(match.groups.cost);
	const tokensPerTask = parseCount(match.groups.tokens ?? "");
	const stepsPerTask = Number(match.groups.steps);
	if (
		model == null ||
		model.length === 0 ||
		!Number.isInteger(rank) ||
		!Number.isFinite(score) ||
		!Number.isFinite(costPerTaskUsd) ||
		!Number.isFinite(tokensPerTask) ||
		!Number.isFinite(stepsPerTask) ||
		isPrivateCursorModel(model)
	) {
		return null;
	}
	return {
		rank,
		model,
		base_model: baseModelName(model),
		reasoning_effort: parseReasoningEffort(model),
		score,
		cost_per_task_usd: Number(costPerTaskUsd.toFixed(6)),
		tokens_per_task: tokensPerTask,
		steps_per_task: stepsPerTask,
	};
}

/** Extract public CursorBench model score rows from the leaderboard page HTML. */
export function processCursorBenchPageHtml(
	pageHtml: string,
): CursorBenchModelScoreRow[] {
	const lines = pageLines(pageHtml);
	const bodyStart = findLeaderboardBodyStart(lines);
	if (bodyStart === -1) {
		return [];
	}
	const rows: CursorBenchModelScoreRow[] = [];
	for (let index = bodyStart; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line === LEADERBOARD_END) {
			break;
		}
		const row = parseCursorBenchRow(line);
		if (row != null) {
			rows.push(row);
			continue;
		}
		if (/^\d+$/.test(line)) {
			const cellRow = parseCursorBenchRow(
				[
					line,
					lines[index + 1],
					`${lines[index + 2] ?? ""}${lines[index + 3] ?? ""}`,
					lines[index + 4],
					lines[index + 5],
				]
					.filter((value): value is string => typeof value === "string")
					.join(" "),
			);
			if (cellRow != null) {
				rows.push(cellRow);
				index += 5;
			}
		}
	}
	return rows.sort((left, right) => left.rank - right.rank);
}

/** Build CursorBench score rows by normalized full model label. */
export function buildCursorBenchScoreByModelName(
	rows: CursorBenchModelScoreRow[],
): CursorBenchScoreByModelName {
	const scoreByModelName: CursorBenchScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a CursorBench score from exact model labels that may differ by punctuation. */
export function findCursorBenchScore(
	candidateNames: unknown[],
	cursorBenchScoreByModelName: CursorBenchScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = cursorBenchScoreByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

/** Fetch CursorBench model score rows from the public leaderboard page. */
export async function getCursorBenchModelScoreStats(
	options: CursorBenchScraperOptions = {},
): Promise<CursorBenchModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`CursorBench scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processCursorBenchPageHtml(await response.text()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
