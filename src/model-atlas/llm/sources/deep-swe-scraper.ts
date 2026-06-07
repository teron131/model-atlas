/** DeepSWE leaderboard scraper helpers. */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { asFiniteNumber, asRecord, normalizeModelToken } from "../shared";

const DEFAULT_LEADERBOARD_URL =
	"https://deepswe.datacurve.ai/artifacts/leaderboard-live.json";
const DEFAULT_TIMEOUT_MS = 30_000;

export type DeepSWEScraperOptions = {
	url?: string;
	timeoutMs?: number;
};

export type DeepSWELeaderboardRow = {
	model: string;
	pass_at_1: number;
	mean_cost_usd: number;
	mean_duration_seconds: number;
	mean_output_tokens: number;
};

export type DeepSWEModelScoreRow = DeepSWELeaderboardRow;

export type DeepSWEScoreByModelName = Map<string, DeepSWEModelScoreRow>;

export type DeepSWELeaderboardPayload = {
	fetched_at_epoch_seconds: number | null;
	data: DeepSWELeaderboardRow[];
};

/** Return a DeepSWE leaderboard row with only fields used by scoring. */
function asDeepSWELeaderboardRow(value: unknown): DeepSWELeaderboardRow | null {
	const row = asRecord(value);
	if (!row || typeof row.model !== "string" || row.model.length === 0) {
		return null;
	}
	const passAt1 = asFiniteNumber(row.pass_at_1);
	const meanCostUsd = asFiniteNumber(row.mean_cost_usd);
	const meanDurationSeconds = asFiniteNumber(row.mean_duration_seconds);
	const meanOutputTokens = asFiniteNumber(row.mean_output_tokens);
	if (
		passAt1 == null ||
		meanCostUsd == null ||
		meanDurationSeconds == null ||
		meanOutputTokens == null
	) {
		return null;
	}
	return {
		model: row.model,
		pass_at_1: passAt1,
		mean_cost_usd: meanCostUsd,
		mean_duration_seconds: meanDurationSeconds,
		mean_output_tokens: meanOutputTokens,
	};
}

/** Return one best DeepSWE configuration per model, ranked by pass@1. */
export function summarizeDeepSWEBestModelScores(
	rows: DeepSWELeaderboardRow[],
): DeepSWEModelScoreRow[] {
	const bestByModel = new Map<string, DeepSWEModelScoreRow>();
	for (const row of rows) {
		const existing = bestByModel.get(row.model);
		if (!existing || row.pass_at_1 > existing.pass_at_1) {
			bestByModel.set(row.model, row);
		}
	}
	return [...bestByModel.values()].sort(
		(left, right) => right.pass_at_1 - left.pass_at_1,
	);
}

/** Build DeepSWE best-score rows by normalized model name. */
export function buildDeepSWEScoreByModelName(
	rows: DeepSWEModelScoreRow[],
): DeepSWEScoreByModelName {
	const scoreByModelName: DeepSWEScoreByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		if (key.length > 0) {
			scoreByModelName.set(key, row);
		}
	}
	return scoreByModelName;
}

/** Find a DeepSWE score row from model labels that may differ by punctuation. */
export function findDeepSWEModelScore(
	candidateNames: unknown[],
	deepSWEScoreByModelName: DeepSWEScoreByModelName,
): DeepSWEModelScoreRow | null {
	for (const candidateName of candidateNames) {
		if (typeof candidateName !== "string" || candidateName.length === 0) {
			continue;
		}
		const row = deepSWEScoreByModelName.get(normalizeModelToken(candidateName));
		if (row) {
			return row;
		}
	}
	return null;
}

/** Fetch raw DeepSWE leaderboard rows from the public leaderboard artifact. */
export async function getDeepSWERawLeaderboardStats(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWELeaderboardPayload> {
	try {
		const url = options.url ?? DEFAULT_LEADERBOARD_URL;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const response = await fetchWithTimeout(url, {}, timeoutMs);
		if (!response.ok) {
			throw new Error(`DeepSWE scrape failed: ${response.status}`);
		}
		const payload = asRecord(await response.json());
		const rows = Array.isArray(payload.rows)
			? payload.rows
					.map((row) => asDeepSWELeaderboardRow(row))
					.filter((row): row is DeepSWELeaderboardRow => row != null)
			: [];
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: rows,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}

/** Fetch DeepSWE best model score rows from the public leaderboard artifact. */
export async function getDeepSWEModelScoreStats(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWELeaderboardPayload> {
	const payload = await getDeepSWERawLeaderboardStats(options);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		data: summarizeDeepSWEBestModelScores(payload.data),
	};
}
