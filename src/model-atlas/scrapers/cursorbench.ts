/**
 * CursorBench scraper owns page-text extraction and percent normalization for CursorBench scores.
 *
 * Page source: https://cursor.com/cursorbench
 */

import {
	normalizeModelToken,
	reasoningEffortRank,
} from "../identity/normalization";
import { fetchWithTimeout, nowEpochSeconds } from "../runtime";
import { htmlTextLines } from "./parsing";

const DEFAULT_LEADERBOARD_URL = "https://cursor.com/cursorbench";
const DEFAULT_TIMEOUT_MS = 30_000;
const LEADERBOARD_HEADER =
	"Model Score Cost Cost / task Tokens Tokens / task Steps Steps / task";
const COMPACT_ROW_PATTERN =
	/^(?<rank>\d+)\s+(?<model>.+?)(?:(?<scoreCaveat>\*)|\s+)\s*(?<score>\d+(?:\.\d+)?)%\s*\$?(?<cost>\d+(?:\.\d+)?)\s+(?<tokens>[\d,]+)\s+(?<steps>\d+)$/;
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

type CursorBenchScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type CursorBenchModelScoreRow = {
	rank: number;
	model: string;
	base_model: string;
	reasoning_effort: string | null;
	score_eligible: boolean;
	score: number;
	cost_per_task_usd: number;
	tokens_per_task: number;
	steps_per_task: number;
};

export type CursorBenchRowsByModelName = Map<string, CursorBenchModelScoreRow>;

type CursorBenchModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: CursorBenchModelScoreRow[];
};

type ParsedCursorBenchCellRow = {
	row: CursorBenchModelScoreRow;
	consumedCells: number;
};

/** Stores the source-default or highest-effort row under each model alias. */
function addDefaultEffortRowAlias(
	rowsByModelName: CursorBenchRowsByModelName,
	alias: string,
	row: CursorBenchModelScoreRow,
): void {
	const key = normalizeModelToken(alias);
	if (key.length === 0) {
		return;
	}
	const existing = rowsByModelName.get(key);
	if (
		existing == null ||
		reasoningEffortRank(row.reasoning_effort) >
			reasoningEffortRank(existing.reasoning_effort)
	) {
		rowsByModelName.set(key, row);
	}
}

export function cursorBenchCanonicalModelName(baseModel: string): string {
	if (/^(Fable|Opus|Sonnet)\s+\d/i.test(baseModel)) {
		return `Claude ${baseModel}`;
	}
	const kimiVersion = baseModel.match(/^Kimi\s+(\d(?:\.\d+)?)$/i)?.[1];
	if (kimiVersion != null) {
		return `Kimi K${kimiVersion}`;
	}
	return baseModel;
}

function cursorBenchModelAliases(row: CursorBenchModelScoreRow): string[] {
	const aliases = new Set([
		row.model,
		row.base_model,
		cursorBenchCanonicalModelName(row.base_model),
	]);
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

/** CursorBench percentages enter scoring on the same 0-1 scale as other benchmark sources. */
function parsePercent(value: string): number {
	return Number((Number(value) / 100).toFixed(6));
}

function parseCount(value: string): number {
	return Number(value.replace(/,/g, ""));
}

/** Preserve source-caveated rows while normalizing inline or separate footnote markers into score eligibility. */
function parseCursorBenchFields(
	rankValue: string | undefined,
	modelValue: string | undefined,
	scoreValue: string | undefined,
	costValue: string | undefined,
	tokensValue: string | undefined,
	stepsValue: string | undefined,
	hasSeparateScoreCaveat = false,
): CursorBenchModelScoreRow | null {
	const rawModel = modelValue?.trim();
	const hasInlineScoreCaveat = rawModel?.endsWith("*") === true;
	const model = hasInlineScoreCaveat ? rawModel?.slice(0, -1).trim() : rawModel;
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
		score_eligible: !hasSeparateScoreCaveat && !hasInlineScoreCaveat,
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
				match.groups.scoreCaveat === "*",
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
	const hasSeparateScoreCaveat = lines[index + 2] === "*";
	const scoreIndex = index + (hasSeparateScoreCaveat ? 3 : 2);
	if (lines[scoreIndex + 1] === "%" && lines[scoreIndex + 2] === "$") {
		const row = parseCursorBenchFields(
			rank,
			model,
			lines[scoreIndex],
			lines[scoreIndex + 3],
			lines[scoreIndex + 4],
			lines[scoreIndex + 5],
			hasSeparateScoreCaveat,
		);
		return row == null ? null : { row, consumedCells: scoreIndex - index + 6 };
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

/** Build the scoring lookup from eligible rows while leaving caveated rows available as raw evidence. */
export function buildCursorBenchMap(
	rows: CursorBenchModelScoreRow[],
): CursorBenchRowsByModelName {
	const rowsByModelName: CursorBenchRowsByModelName = new Map();
	for (const row of rows) {
		if (!row.score_eligible) {
			continue;
		}
		for (const alias of cursorBenchModelAliases(row)) {
			addDefaultEffortRowAlias(rowsByModelName, alias, row);
		}
	}
	return rowsByModelName;
}

export function findCursorBenchScore(
	candidateNames: unknown[],
	cursorBenchRowsByModelName: CursorBenchRowsByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = cursorBenchRowsByModelName.get(
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
