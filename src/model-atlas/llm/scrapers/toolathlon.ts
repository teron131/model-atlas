/**
 * Toolathlon source helpers.
 *
 * Page source: https://llm-stats.com/benchmarks/toolathlon
 * JSON source: https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { asFiniteNumber, asRecord, normalizeModelToken } from "../shared";
import {
	stringValue,
	zeroEvalModelRows,
	zeroEvalModelScoreFields,
} from "./parsing";

const DEFAULT_DETAILS_URL =
	"https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details";
const DEFAULT_TIMEOUT_MS = 30_000;

export type ToolathlonScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type ToolathlonModelScoreRow = {
	rank: number | null;
	model: string;
	provider: string;
	provider_name?: string | null;
	score: number;
	source_url?: string | null;
	analysis_method?: string | null;
	verified?: boolean | null;
	self_reported?: boolean | null;
	announcement_date?: string | null;
};

export type ToolathlonScoreByModelName = Map<string, ToolathlonModelScoreRow>;

export type ToolathlonModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: ToolathlonModelScoreRow[];
};

function toolathlonModelScoreRow(
	value: unknown,
): ToolathlonModelScoreRow | null {
	const row = asRecord(value);
	const fields = zeroEvalModelScoreFields(value);
	if (fields == null) {
		return null;
	}
	return {
		rank: asFiniteNumber(row?.rank),
		...fields,
		announcement_date: stringValue(row?.announcement_date),
	};
}

/** Extract model/provider/score rows from the Toolathlon details JSON payload. */
export function processToolathlonDetailsJson(
	payload: unknown,
): ToolathlonModelScoreRow[] {
	return zeroEvalModelRows(payload, toolathlonModelScoreRow);
}

/** Build Toolathlon score rows by normalized model name. */
export function buildToolathlonScoreByModelName(
	rows: ToolathlonModelScoreRow[],
): ToolathlonScoreByModelName {
	const scoreByModelName: ToolathlonScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a Toolathlon score from model labels that may differ by punctuation. */
export function findToolathlonScore(
	candidateNames: unknown[],
	toolathlonScoreByModelName: ToolathlonScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = toolathlonScoreByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

/** Fetch Toolathlon model score rows from the JSON endpoint. */
export async function getToolathlonModelScoreStats(
	options: ToolathlonScraperOptions = {},
): Promise<ToolathlonModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_DETAILS_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`Toolathlon scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processToolathlonDetailsJson(await response.json()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
