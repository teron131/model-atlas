/**
 * DeepSWE scraper owns versioned artifact fallback and resource-row normalization.
 *
 * JSON source: https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json
 * Fallback: https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json
 */

import {
	canonicalReasoningEffort,
	normalizeModelToken,
	reasoningEffortRank,
} from "../../identity/normalization";
import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	mapWithConcurrency,
	nowEpochSeconds,
} from "../../runtime";

export const DEEP_SWE_V1_1_LEADERBOARD_URL =
	"https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";
export const DEEP_SWE_V1_LEADERBOARD_URL =
	"https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json";
export const DEEP_SWE_PREFERRED_SOURCE_VERSION = "v1.1" as const;
const DEFAULT_LEADERBOARD_URLS = [
	DEEP_SWE_V1_1_LEADERBOARD_URL,
	DEEP_SWE_V1_LEADERBOARD_URL,
] as const;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 2;

type DeepSWEScraperOptions = {
	url?: string;
	urls?: readonly string[];
	timeoutMs?: number;
	concurrency?: number;
};

export type DeepSWESourceVersion =
	| typeof DEEP_SWE_PREFERRED_SOURCE_VERSION
	| "v1";

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
	mean_duration_seconds: number | null;
	mean_output_tokens: number;
};

export type DeepSWERawLeaderboardRow = DeepSWELeaderboardRow & {
	source_version: DeepSWESourceVersion | null;
};

export type DeepSWEModelScoreRow = DeepSWELeaderboardRow;

export type DeepSWERowsByModelName = Map<string, DeepSWEModelScoreRow>;

type DeepSWELeaderboardPayload = {
	fetched_at_epoch_seconds: number | null;
	source_version: DeepSWESourceVersion | null;
	data: DeepSWELeaderboardRow[];
};

type DeepSWERawLeaderboardPayload = {
	fetched_at_epoch_seconds: number | null;
	data: DeepSWERawLeaderboardRow[];
};

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
		meanOutputTokens == null
	) {
		return null;
	}
	return {
		model: row.model,
		reasoning_effort: canonicalReasoningEffort(row.reasoning_effort),
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

/** Restore a raw DeepSWE leaderboard row from persisted source columns. */
export function asDeepSWERawLeaderboardRow(
	value: unknown,
): DeepSWERawLeaderboardRow | null {
	const row = asRecord(value);
	const leaderboardRow = asDeepSWELeaderboardRow(row);
	if (leaderboardRow == null) {
		return null;
	}
	return {
		...leaderboardRow,
		source_version:
			row.source_version === "v1.1" || row.source_version === "v1"
				? row.source_version
				: null,
	};
}

/** Selects each model's source-default observation while preserving every raw effort row. */
export function summarizeDeepSWESourceDefaultRows(
	rows: DeepSWELeaderboardRow[],
): DeepSWEModelScoreRow[] {
	const defaultByModel = new Map<string, DeepSWEModelScoreRow>();
	for (const row of rows) {
		const existing = defaultByModel.get(row.model);
		if (
			existing == null ||
			reasoningEffortRank(row.reasoning_effort) >
				reasoningEffortRank(existing.reasoning_effort)
		) {
			defaultByModel.set(row.model, row);
		}
	}
	return [...defaultByModel.values()].sort(
		(left, right) => right.pass_at_1 - left.pass_at_1,
	);
}

/** Strip raw-source provenance from DeepSWE rows before public/scoring use. */
function stripDeepSWESourceVersion(
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

export function preferredDeepSWELeaderboardRows(
	rows: DeepSWERawLeaderboardRow[],
): DeepSWELeaderboardRow[] {
	const v11Rows = rows.filter((row) => row.source_version === "v1.1");
	const v11RowKeys = new Set(v11Rows.map(deepSwePreferenceKey));
	const v1OnlyRows = rows.filter(
		(row) =>
			row.source_version !== "v1.1" &&
			!v11RowKeys.has(deepSwePreferenceKey(row)),
	);
	const preferredRows = v11Rows.length > 0 ? [...v11Rows, ...v1OnlyRows] : rows;
	return preferredRows.map(stripDeepSWESourceVersion);
}

function deepSwePreferenceKey(row: DeepSWERawLeaderboardRow): string {
	return [
		normalizeModelToken(row.model),
		row.reasoning_effort ?? "",
		row.config ?? "",
	].join("\0");
}

/** Fetch one DeepSWE artifact without letting a stale version block fresher rows. */
async function getDeepSWERawRowsForUrl(
	url: string,
	timeoutMs: number,
): Promise<DeepSWERawLeaderboardRow[]> {
	const response = await fetchWithTimeout(url, {}, timeoutMs);
	if (!response.ok) {
		return [];
	}
	const payload = asRecord(await response.json());
	const rows = Array.isArray(payload.rows)
		? payload.rows
				.map((row) => asDeepSWELeaderboardRow(row))
				.filter((row): row is DeepSWELeaderboardRow => row != null)
		: [];
	const sourceVersion = sourceVersionForUrl(url);
	return rows.map((row) => ({
		...row,
		source_version: sourceVersion,
	}));
}

/** Indexes normalized source labels while retaining the default highest-effort row on collisions. */
export function buildDeepSWEMap(
	rows: DeepSWEModelScoreRow[],
): DeepSWERowsByModelName {
	const rowsByModelName: DeepSWERowsByModelName = new Map();
	for (const row of rows) {
		const key = normalizeModelToken(row.model);
		const existing = rowsByModelName.get(key);
		if (
			key.length > 0 &&
			(existing == null ||
				reasoningEffortRank(row.reasoning_effort) >
					reasoningEffortRank(existing.reasoning_effort))
		) {
			rowsByModelName.set(key, row);
		}
	}
	return rowsByModelName;
}

/** DeepSWE fetches configured artifact versions through a bounded worker pool so custom URL lists cannot burst. */
export async function getDeepSWERawLeaderboardSourceRows(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWERawLeaderboardPayload> {
	const urls =
		options.url != null
			? [options.url]
			: (options.urls ?? DEFAULT_LEADERBOARD_URLS);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
	const batches = await mapWithConcurrency(urls, concurrency, async (url) => {
		try {
			return await getDeepSWERawRowsForUrl(url, timeoutMs);
		} catch {
			return [];
		}
	});
	const rows = batches.flat();
	return {
		fetched_at_epoch_seconds: rows.length > 0 ? nowEpochSeconds() : null,
		data: rows,
	};
}

export async function getDeepSWELeaderboardStats(
	options: DeepSWEScraperOptions = {},
): Promise<DeepSWELeaderboardPayload> {
	const payload = await getDeepSWERawLeaderboardSourceRows(options);
	const preferredRows = preferredDeepSWELeaderboardRows(payload.data);
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		source_version: deepSWESourceVersionForRows(payload.data),
		data: preferredRows,
	};
}

export function deepSWEUrlForSourceVersion(
	version: DeepSWESourceVersion | null,
): string {
	return version === "v1"
		? DEEP_SWE_V1_LEADERBOARD_URL
		: DEEP_SWE_V1_1_LEADERBOARD_URL;
}

/** Infers the DeepSWE source version from a leaderboard URL. */
function sourceVersionForUrl(url: string): DeepSWESourceVersion | null {
	if (url.includes("/artifacts/v1.1/")) {
		return "v1.1";
	}
	if (url.includes("/artifacts/v1/")) {
		return "v1";
	}
	return null;
}

export function deepSWESourceVersionForRows(
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
