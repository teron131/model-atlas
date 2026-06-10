/**
 * BrowseComp source helpers.
 *
 * Page source: https://llm-stats.com/benchmarks/browsecomp
 * JSON source: https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { asFiniteNumber, asRecord, normalizeModelToken } from "../shared";

const DEFAULT_DETAILS_URL =
	"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details";
const DEFAULT_TIMEOUT_MS = 30_000;

export type BrowseCompScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type BrowseCompModelScoreRow = {
	model: string;
	provider: string;
	provider_name?: string | null;
	score: number;
	source_url?: string | null;
	analysis_method?: string | null;
	verified?: boolean | null;
	self_reported?: boolean | null;
};

export type BrowseCompScoreByModelName = Map<string, BrowseCompModelScoreRow>;

export type BrowseCompModelScorePayload = {
	fetched_at_epoch_seconds: number | null;
	data: BrowseCompModelScoreRow[];
};

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

/** Return a fractional benchmark score from the source score fields. */
function normalizedScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	if (score == null || score < 0 || score > 1) {
		return null;
	}
	return Number(score.toFixed(6));
}

function browseCompModelScoreRow(
	value: unknown,
): BrowseCompModelScoreRow | null {
	const row = asRecord(value);
	const model = stringValue(row?.model_name);
	const provider = stringValue(row?.organization_id);
	const score =
		normalizedScore(row?.normalized_score) ?? normalizedScore(row?.score);
	if (model == null || provider == null || score == null) {
		return null;
	}
	return {
		model,
		provider,
		provider_name: stringValue(row?.organization_name),
		score,
		source_url: stringValue(row?.self_reported_source),
		analysis_method: stringValue(row?.analysis_method),
		verified: booleanValue(row?.verified),
		self_reported: booleanValue(row?.self_reported),
	};
}

/** Extract model/provider/score rows from the BrowseComp details JSON payload. */
export function processBrowseCompDetailsJson(
	payload: unknown,
): BrowseCompModelScoreRow[] {
	const root = asRecord(payload);
	const modelRows = Array.isArray(root?.models) ? root.models : [];
	const rows: BrowseCompModelScoreRow[] = [];
	for (const modelRow of modelRows) {
		const row = browseCompModelScoreRow(modelRow);
		if (row != null) {
			rows.push(row);
		}
	}
	return rows;
}

/** Build BrowseComp score rows by normalized model name. */
export function buildBrowseCompScoreByModelName(
	rows: BrowseCompModelScoreRow[],
): BrowseCompScoreByModelName {
	const scoreByModelName: BrowseCompScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a BrowseComp score from model labels that may differ by punctuation. */
export function findBrowseCompScore(
	candidateNames: unknown[],
	browseCompScoreByModelName: BrowseCompScoreByModelName,
): number | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = browseCompScoreByModelName.get(
			normalizeModelToken(candidateName),
		);
		if (row) {
			return row.score;
		}
	}
	return null;
}

/** Fetch BrowseComp model score rows from the JSON endpoint. */
export async function getBrowseCompModelScoreStats(
	options: BrowseCompScraperOptions = {},
): Promise<BrowseCompModelScorePayload> {
	try {
		const url = options.url ?? DEFAULT_DETAILS_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`BrowseComp scrape failed: ${response.status}`);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processBrowseCompDetailsJson(await response.json()),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
