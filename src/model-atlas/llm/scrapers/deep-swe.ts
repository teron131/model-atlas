/**
 * DeepSWE leaderboard scraper helpers.
 *
 * JSON source: https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json
 * Fallback: https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json
 */
import { fetchWithTimeout, nowEpochSeconds } from "../../utils";
import { asFiniteNumber, asRecord, normalizeModelToken } from "../shared";

export const DEEP_SWE_V1_1_LEADERBOARD_URL =
	"https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";
export const DEEP_SWE_V1_LEADERBOARD_URL =
	"https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json";
const DEFAULT_LEADERBOARD_URLS = [
	DEEP_SWE_V1_1_LEADERBOARD_URL,
	DEEP_SWE_V1_LEADERBOARD_URL,
] as const;
const DEFAULT_TIMEOUT_MS = 30_000;

export type DeepSWEScraperOptions = {
	url?: string;
	urls?: readonly string[];
	timeoutMs?: number;
};

export type DeepSWESourceVersion = "v1.1" | "v1";

export type DeepSWELeaderboardRow = {
	model: string;
	reasoning_effort: string | null;
	config: string | null;
	pass_at_1: number;
	ci_lo: number | null;
	ci_hi: number | null;
	ci_half: number | null;
	n_tasks_attempted: number;
	mean_cost_usd: number;
	mean_duration_seconds: number;
	mean_output_tokens: number;
};

export type DeepSWERawLeaderboardRow = DeepSWELeaderboardRow & {
	source_version: DeepSWESourceVersion | null;
};

export type DeepSWEModelScoreRow = DeepSWELeaderboardRow;

export type DeepSWEScoreByModelName = Map<string, DeepSWEModelScoreRow>;

export type DeepSWELeaderboardPayload = {
	fetched_at_epoch_seconds: number | null;
	source_version: DeepSWESourceVersion | null;
	data: DeepSWELeaderboardRow[];
};

export type DeepSWERawLeaderboardPayload = {
	fetched_at_epoch_seconds: number | null;
	data: DeepSWERawLeaderboardRow[];
};

/** Return a DeepSWE leaderboard row with only fields used by scoring. */
function asDeepSWELeaderboardRow(value: unknown): DeepSWELeaderboardRow | null {
	const row = asRecord(value);
	if (!row || typeof row.model !== "string" || row.model.length === 0) {
		return null;
	}
	const passAt1 = asFiniteNumber(row.pass_at_1);
	const tasksAttempted = asFiniteNumber(row.n_tasks_attempted);
	const meanCostUsd = asFiniteNumber(row.mean_cost_usd);
	const meanDurationSeconds = asFiniteNumber(row.mean_duration_seconds);
	const meanOutputTokens = asFiniteNumber(row.mean_output_tokens);
	if (
		passAt1 == null ||
		tasksAttempted == null ||
		tasksAttempted <= 0 ||
		meanCostUsd == null ||
		meanDurationSeconds == null ||
		meanOutputTokens == null
	) {
		return null;
	}
	return {
		model: row.model,
		reasoning_effort:
			typeof row.reasoning_effort === "string" &&
			row.reasoning_effort.length > 0
				? row.reasoning_effort
				: null,
		config:
			typeof row.config === "string" && row.config.length > 0
				? row.config
				: null,
		pass_at_1: passAt1,
		ci_lo: asFiniteNumber(row.ci_lo),
		ci_hi: asFiniteNumber(row.ci_hi),
		ci_half: asFiniteNumber(row.ci_half),
		n_tasks_attempted: tasksAttempted,
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

/** Return the quiet default score row per model, preferring xhigh when available. */
export function summarizeDeepSWEDefaultModelScores(
	rows: DeepSWELeaderboardRow[],
): DeepSWEModelScoreRow[] {
	const rowsByModel = new Map<string, DeepSWELeaderboardRow[]>();
	for (const row of rows) {
		const existing = rowsByModel.get(row.model) ?? [];
		existing.push(row);
		rowsByModel.set(row.model, existing);
	}
	return [...rowsByModel.values()]
		.map((modelRows) => {
			return (
				modelRows.find((row) => row.reasoning_effort === "xhigh") ??
				[...modelRows].sort(
					(left, right) => right.pass_at_1 - left.pass_at_1,
				)[0]
			);
		})
		.filter((row): row is DeepSWEModelScoreRow => row != null)
		.sort((left, right) => right.pass_at_1 - left.pass_at_1);
}

/** Strip raw-source provenance from DeepSWE rows before public/scoring use. */
export function stripDeepSWESourceVersion(
	row: DeepSWERawLeaderboardRow,
): DeepSWELeaderboardRow {
	return {
		model: row.model,
		reasoning_effort: row.reasoning_effort,
		config: row.config,
		pass_at_1: row.pass_at_1,
		ci_lo: row.ci_lo,
		ci_hi: row.ci_hi,
		ci_half: row.ci_half,
		n_tasks_attempted: row.n_tasks_attempted,
		mean_cost_usd: row.mean_cost_usd,
		mean_duration_seconds: row.mean_duration_seconds,
		mean_output_tokens: row.mean_output_tokens,
	};
}

/** Prefer the latest DeepSWE artifact for scoring/display, falling back to v1. */
export function preferredDeepSWELeaderboardRows(
	rows: DeepSWERawLeaderboardRow[],
): DeepSWELeaderboardRow[] {
	const v11Rows = rows.filter((row) => row.source_version === "v1.1");
	const preferredRows = v11Rows.length > 0 ? v11Rows : rows;
	return preferredRows.map(stripDeepSWESourceVersion);
}

/** Build DeepSWE selected-score rows by normalized model name. */
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

/** Fetch raw DeepSWE source rows from all configured public artifacts. */
export async function getDeepSWERawLeaderboardSourceRows(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWERawLeaderboardPayload> {
	const urls =
		options.url != null
			? [options.url]
			: (options.urls ?? DEFAULT_LEADERBOARD_URLS);
	const data: DeepSWERawLeaderboardRow[] = [];
	let fetchedAtEpochSeconds: number | null = null;
	for (const url of urls) {
		try {
			const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const response = await fetchWithTimeout(url, {}, timeoutMs);
			if (!response.ok) {
				continue;
			}
			const payload = asRecord(await response.json());
			const rows = Array.isArray(payload.rows)
				? payload.rows
						.map((row) => asDeepSWELeaderboardRow(row))
						.filter((row): row is DeepSWELeaderboardRow => row != null)
				: [];
			const sourceVersion = deepSWESourceVersionForUrl(url);
			data.push(
				...rows.map((row) => ({
					...row,
					source_version: sourceVersion,
				})),
			);
			if (rows.length > 0 && fetchedAtEpochSeconds == null) {
				fetchedAtEpochSeconds = nowEpochSeconds();
			}
		} catch {}
	}
	return {
		fetched_at_epoch_seconds: data.length > 0 ? fetchedAtEpochSeconds : null,
		data,
	};
}

/** Fetch preferred DeepSWE leaderboard rows for public scoring/display. */
export async function getDeepSWERawLeaderboardStats(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWELeaderboardPayload> {
	const payload = await getDeepSWERawLeaderboardSourceRows(options);
	const data = preferredDeepSWELeaderboardRows(payload.data);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		source_version: deepSWESourceVersionForRows(payload.data),
		data,
	};
}

/** Returns the leaderboard URL for a DeepSWE source version. */
export function deepSWEUrlForSourceVersion(
	version: DeepSWESourceVersion | null,
): string {
	return version === "v1"
		? DEEP_SWE_V1_LEADERBOARD_URL
		: DEEP_SWE_V1_1_LEADERBOARD_URL;
}

/** Infers the DeepSWE source version from a leaderboard URL. */
function deepSWESourceVersionForUrl(url: string): DeepSWESourceVersion | null {
	if (url.includes("/artifacts/v1.1/")) {
		return "v1.1";
	}
	if (url.includes("/artifacts/v1/")) {
		return "v1";
	}
	return null;
}

/** Chooses the DeepSWE source version represented by scraped rows. */
function deepSWESourceVersionForRows(
	rows: DeepSWERawLeaderboardRow[],
): DeepSWESourceVersion | null {
	if (rows.some((row) => row.source_version === "v1.1")) {
		return "v1.1";
	}
	if (rows.some((row) => row.source_version === "v1")) {
		return "v1";
	}
	return null;
}

/** Fetch DeepSWE default model score rows from the public leaderboard artifact. */
export async function getDeepSWEModelScoreStats(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWELeaderboardPayload> {
	const payload = await getDeepSWERawLeaderboardStats(options);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		source_version: payload.source_version,
		data: summarizeDeepSWEDefaultModelScores(payload.data),
	};
}
