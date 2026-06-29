/**
 * CursorBench leaderboard scraper helpers.
 *
 * Page source: https://cursor.com/cursorbench
 */

import { normalizeModelToken } from "../shared";
import { fetchWithTimeout, nowEpochSeconds } from "../utils";
import { htmlTextLines } from "./parsing";

const DEFAULT_LEADERBOARD_URL = "https://cursor.com/cursorbench";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_HEADER =
	"Model Score Cost Cost / task Tokens Tokens / task Steps Steps / task";
const COMPACT_ROW_PATTERN =
	/^(?<rank>\d+)\s+(?<model>.+?)\s+(?<score>\d+(?:\.\d+)?)%\s*\$?(?<cost>\d+(?:\.\d+)?)\s+(?<tokens>[\d,]+)\s+(?<steps>\d+)$/;
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
	"Ultra",
	"Max",
	"Adaptive",
	"Extra High",
	"High",
	"Medium",
	"Low",
	"Minimal",
	"Non Reasoning",
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

type ParsedCursorBenchCellRow = {
	row: CursorBenchModelScoreRow;
	consumedCells: number;
};

/** Stores an alias when it improves the score lookup for a model. */
function addScoreRowAlias(
	scoreByModelName: CursorBenchScoreByModelName,
	alias: string,
	row: CursorBenchModelScoreRow,
): void {
	const key = normalizeModelToken(alias);
	if (key.length === 0) {
		return;
	}
	const existing = scoreByModelName.get(key);
	if (existing == null || row.score > existing.score) {
		scoreByModelName.set(key, row);
	}
}

function cursorBenchModelAliases(row: CursorBenchModelScoreRow): string[] {
	const aliases = new Set([row.model, row.base_model]);
	if (/^(Fable|Opus|Sonnet)\s+\d/i.test(row.base_model)) {
		aliases.add(`Claude ${row.base_model}`);
	}
	const kimiVersion = row.base_model.match(/^Kimi\s+(\d(?:\.\d+)?)$/i)?.[1];
	if (kimiVersion != null) {
		aliases.add(`Kimi K${kimiVersion}`);
	}
	return [...aliases];
}

/** Finds the first leaderboard data row after either header shape. */
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
				(value, headerIndex) => value === LEADERBOARD_HEADER_CELLS[headerIndex],
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
	return effort == null ? model : model.slice(0, -effort.length).trim();
}

function isPrivateCursorModel(model: string): boolean {
	return PRIVATE_CURSOR_MODEL_PREFIX.test(baseModelName(model));
}

/** Converts CursorBench percentages onto the 0-1 scoring scale. */
function parsePercent(value: string): number {
	return Number((Number(value) / 100).toFixed(6));
}

function parseCount(value: string): number {
	return Number(value.replace(/,/g, ""));
}

function parseCursorBenchFields(
	rankValue: string | undefined,
	modelValue: string | undefined,
	scoreValue: string | undefined,
	costValue: string | undefined,
	tokensValue: string | undefined,
	stepsValue: string | undefined,
): CursorBenchModelScoreRow | null {
	const model = modelValue?.trim();
	const rank = Number(rankValue);
	const scoreText = scoreValue?.replace(/%$/, "") ?? "";
	const score = parsePercent(scoreText);
	const costPerTaskUsd = Number(costValue?.replace(/^\$/, ""));
	const tokensPerTask = parseCount(tokensValue ?? "");
	const stepsPerTask = Number(stepsValue);
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

function parseCompactCursorBenchRow(
	line: string,
): CursorBenchModelScoreRow | null {
	const match = line.match(COMPACT_ROW_PATTERN);
	return match?.groups == null
		? null
		: parseCursorBenchFields(
				match.groups.rank,
				match.groups.model,
				match.groups.score,
				match.groups.cost,
				match.groups.tokens,
				match.groups.steps,
			);
}

function parseCursorBenchCells(
	lines: string[],
	index: number,
): ParsedCursorBenchCellRow | null {
	const rank = lines[index];
	const model = lines[index + 1];
	if (rank == null || model == null || !/^\d+$/.test(rank)) {
		return null;
	}
	if (lines[index + 3] === "%" && lines[index + 4] === "$") {
		const row = parseCursorBenchFields(
			rank,
			model,
			lines[index + 2],
			lines[index + 5],
			lines[index + 6],
			lines[index + 7],
		);
		return row == null ? null : { row, consumedCells: 8 };
	}
	const row = parseCursorBenchFields(
		rank,
		model,
		lines[index + 2],
		lines[index + 3],
		lines[index + 4],
		lines[index + 5],
	);
	return row == null ? null : { row, consumedCells: 6 };
}

export function processCursorBenchPageHtml(
	pageHtml: string,
): CursorBenchModelScoreRow[] {
	const lines = htmlTextLines(pageHtml);
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
		const row = parseCompactCursorBenchRow(line);
		if (row != null) {
			rows.push(row);
			continue;
		}
		if (/^\d+$/.test(line)) {
			const cellRow = parseCursorBenchCells(lines, index);
			if (cellRow != null) {
				rows.push(cellRow.row);
				index += cellRow.consumedCells - 1;
			}
		}
	}
	return rows.sort((left, right) => left.rank - right.rank);
}

export function buildCursorBenchMap(
	rows: CursorBenchModelScoreRow[],
): CursorBenchScoreByModelName {
	const scoreByModelName: CursorBenchScoreByModelName = new Map();
	for (const row of rows) {
		for (const alias of cursorBenchModelAliases(row)) {
			addScoreRowAlias(scoreByModelName, alias, row);
		}
	}
	return scoreByModelName;
}

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

export async function getCursorBenchStats(
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
