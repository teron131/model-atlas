/**
 * WeirdML scraper owns creator-primary parsing and the explicit Epoch mirror crosswalk and merge.
 *
 * Benchmark source: https://htihle.github.io/weirdml.html
 * Creator CSV source: https://htihle.github.io/data/weirdml_data.csv
 * Epoch page source: https://epoch.ai/benchmarks/weirdml?tab=leaderboard&metric=Accuracy
 * Epoch CSV source: https://epoch.ai/data/external_benchmarks/weirdml.csv
 * Score fields: avg_acc (creator), Accuracy (Epoch)
 */

import {
	benchmarkModelEffort,
	normalizeModelToken,
} from "../identity/normalization";
import { asFiniteNumber, fetchWithTimeout, nowEpochSeconds } from "../runtime";

import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "./benchmark-score";
import {
	processEpochWeirdMlCsv,
	WEIRDML_EPOCH_CSV_URL,
	type WeirdMlEpochRow,
} from "./epoch/weirdml";
import { parseCsvRecords } from "./parsing";

export const WEIRDML_CREATOR_CSV_URL =
	"https://htihle.github.io/data/weirdml_data.csv";

const DEFAULT_TIMEOUT_MS = 30_000;
const MINIMUM_CROSSWALK_ROWS = 3;
const MINIMUM_CROSSWALK_COVERAGE = 0.5;
const CANDIDATE_ACCURACY_TOLERANCE = 0.001;
const CANDIDATE_COST_TOLERANCE_USD = 0.01;
const CANDIDATE_CODE_LENGTH_TOLERANCE = 1;
const ACCURACY_TOLERANCE = 0.0006;
const COST_TOLERANCE_USD = 0.00002;
const CODE_LENGTH_TOLERANCE = 0.01;
const STANDARD_ERROR_TOLERANCE = 1e-9;
const TASK_COLUMNS = [
	"shapes_easy_acc",
	"shapes_hard_acc",
	"digits_unsup_acc",
	"chess_winners_acc",
	"kolmo_shuffle_acc",
	"classify_sentences_acc",
	"classify_shuffled_acc",
	"insert_patches_acc",
	"blunders_easy_acc",
	"blunders_hard_acc",
	"digits_generalize_acc",
	"shapes_variable_acc",
	"xor_easy_acc",
	"xor_hard_acc",
	"splash_easy_acc",
	"splash_hard_acc",
	"number_patterns_acc",
] as const;

type WeirdMlCrosswalkMethod = "identity" | "shared_evidence";

type WeirdMlCrosswalkMatch = {
	primaryIndex: number;
	epochIndex: number;
	method: WeirdMlCrosswalkMethod;
};

type WeirdMlMatchResolution = {
	matches: WeirdMlCrosswalkMatch[];
	conflicting: Set<number>;
	ambiguous: Set<number>;
};

export type WeirdMlCrosswalkStatus = {
	accepted: boolean;
	primaryRowCount: number;
	epochRowCount: number;
	matchedRowCount: number;
	identityMatchCount: number;
	sharedEvidenceMatchCount: number;
	coverage: number;
	conflictingEpochModels: string[];
	ambiguousEpochModels: string[];
	epochOnlyRowCount: number;
	addedEpochRowCount: number;
};

type WeirdMlMergePlan = {
	status: WeirdMlCrosswalkStatus;
	matches: WeirdMlCrosswalkMatch[];
	addedEpochIndices: number[];
};

type WeirdMlPayload = BenchmarkScorePayload & {
	crosswalk: WeirdMlCrosswalkStatus | null;
};

type WeirdMlScraperOptions = {
	creatorUrl?: string;
	epochUrl?: string;
	timeoutMs?: number;
};

function configurationKey(row: {
	base_model: string;
	reasoning_effort: string | null;
}): string {
	const baseModel = normalizeModelToken(row.base_model);
	const effort = normalizeModelToken(row.reasoning_effort ?? "default");
	return baseModel.length === 0 ? "" : `${baseModel}--${effort}`;
}

function identityAliases(values: readonly unknown[]) {
	return [
		...new Set(
			values.flatMap((value) => {
				if (typeof value !== "string" || value.length === 0) return [];
				const normalized = normalizeModelToken(value);
				const undated = normalized.replace(/-20\d{6}(?=-|$)/g, "");
				const canonical = (alias: string) =>
					alias
						.replace(/^claude-opus-(\d(?:-\d+)?)(?=-|$)/, "claude-$1-opus")
						.replace(/-16k-thinking(?=-|$)/g, "-thinking-16k");
				return [normalized, undated, canonical(normalized), canonical(undated)];
			}),
		),
	];
}

function primaryIdentityAliases(row: BenchmarkScoreRow): string[] {
	return identityAliases([
		row.metadata.internal_model_name,
		row.model_id,
		row.model,
		configurationKey(row),
	]);
}

function withinTolerance(
	left: number | null,
	right: number | null,
	tolerance: number,
): boolean {
	return left != null && right != null && Math.abs(left - right) <= tolerance;
}

/** Find possible mirror aliases broadly enough that source rounding cannot make them look Epoch-only. */
function candidateEvidenceMatches(
	primary: BenchmarkScoreRow,
	epoch: WeirdMlEpochRow,
): boolean {
	return (
		withinTolerance(
			primary.score,
			epoch.accuracy,
			CANDIDATE_ACCURACY_TOLERANCE,
		) &&
		withinTolerance(
			asFiniteNumber(primary.metadata.cost_per_run_usd),
			epoch.cost_per_run_usd,
			CANDIDATE_COST_TOLERANCE_USD,
		) &&
		withinTolerance(
			asFiniteNumber(primary.metadata.code_len_p50),
			epoch.code_len_p50,
			CANDIDATE_CODE_LENGTH_TOLERANCE,
		)
	);
}

/** Check every shared WeirdML observation field after Epoch's documented unit conversion. */
function sharedEvidenceMatches(
	primary: BenchmarkScoreRow,
	epoch: WeirdMlEpochRow,
): boolean {
	if (
		!withinTolerance(primary.score, epoch.accuracy, ACCURACY_TOLERANCE) ||
		!withinTolerance(
			asFiniteNumber(primary.metadata.cost_per_run_usd),
			epoch.cost_per_run_usd,
			COST_TOLERANCE_USD,
		) ||
		!withinTolerance(
			asFiniteNumber(primary.metadata.code_len_p50),
			epoch.code_len_p50,
			CODE_LENGTH_TOLERANCE,
		)
	) {
		return false;
	}
	if (
		primary.observed_at != null &&
		epoch.observed_at != null &&
		primary.observed_at !== epoch.observed_at
	) {
		return false;
	}
	return (
		primary.standard_error == null ||
		epoch.standard_error == null ||
		withinTolerance(
			primary.standard_error,
			epoch.standard_error,
			STANDARD_ERROR_TOLERANCE,
		)
	);
}

/** Resolve one-to-one candidates, treating aliases of an already claimed primary row as ambiguous duplicates. */
function resolveCandidateMatches(
	primaryRows: readonly BenchmarkScoreRow[],
	epochRows: readonly WeirdMlEpochRow[],
	candidates: readonly (readonly number[])[],
	method: WeirdMlCrosswalkMethod,
	claimedPrimary: ReadonlySet<number> = new Set(),
): WeirdMlMatchResolution {
	const ambiguous = new Set<number>();
	const conflicting = new Set<number>();
	const availableCandidates = candidates.map(
		(primaryCandidates, epochIndex) => {
			const claimedCandidates = primaryCandidates.filter((index) =>
				claimedPrimary.has(index),
			);
			if (claimedCandidates.length > 0) {
				const claimedIndex = claimedCandidates[0] as number;
				if (
					primaryCandidates.length === 1 &&
					!sharedEvidenceMatches(
						primaryRows[claimedIndex] as BenchmarkScoreRow,
						epochRows[epochIndex] as WeirdMlEpochRow,
					)
				) {
					conflicting.add(epochIndex);
				} else {
					ambiguous.add(epochIndex);
				}
				return [];
			}
			if (primaryCandidates.length > 1) {
				ambiguous.add(epochIndex);
				return [];
			}
			return primaryCandidates;
		},
	);
	const primaryClaims = new Map<number, number[]>();
	for (const [epochIndex, primaryCandidates] of availableCandidates.entries()) {
		if (primaryCandidates.length !== 1) continue;
		const primaryIndex = primaryCandidates[0] as number;
		const claims = primaryClaims.get(primaryIndex) ?? [];
		claims.push(epochIndex);
		primaryClaims.set(primaryIndex, claims);
	}
	const matches: WeirdMlCrosswalkMatch[] = [];
	for (const [epochIndex, primaryCandidates] of availableCandidates.entries()) {
		if (primaryCandidates.length !== 1) continue;
		const primaryIndex = primaryCandidates[0] as number;
		if ((primaryClaims.get(primaryIndex)?.length ?? 0) !== 1) {
			ambiguous.add(epochIndex);
			continue;
		}
		if (
			!sharedEvidenceMatches(
				primaryRows[primaryIndex] as BenchmarkScoreRow,
				epochRows[epochIndex] as WeirdMlEpochRow,
			)
		) {
			conflicting.add(epochIndex);
			continue;
		}
		matches.push({ primaryIndex, epochIndex, method });
	}
	return { matches, conflicting, ambiguous };
}

/** Build the creator/Epoch crosswalk without assuming same-looking model rows are equivalent. */
function buildWeirdMlCrosswalk(
	primaryRows: readonly BenchmarkScoreRow[],
	epochRows: readonly WeirdMlEpochRow[],
): WeirdMlMergePlan {
	const primaryAliases = primaryRows.map(primaryIdentityAliases);
	const identityCandidates = epochRows.map((row) => {
		const aliases = identityAliases([...row.aliases, configurationKey(row)]);
		return primaryAliases.flatMap((primary, primaryIndex) =>
			aliases.some((alias) => primary.includes(alias)) ? [primaryIndex] : [],
		);
	});
	const identity = resolveCandidateMatches(
		primaryRows,
		epochRows,
		identityCandidates,
		"identity",
	);
	const claimedPrimary = new Set(
		identity.matches.map((match) => match.primaryIndex),
	);
	const claimedEpoch = new Set([
		...identity.matches.map((match) => match.epochIndex),
		...identity.conflicting,
		...identity.ambiguous,
	]);
	const evidenceCandidates = epochRows.map((epoch, epochIndex) =>
		claimedEpoch.has(epochIndex)
			? []
			: primaryRows.flatMap((primary, primaryIndex) =>
					candidateEvidenceMatches(primary, epoch) ? [primaryIndex] : [],
				),
	);
	const evidence = resolveCandidateMatches(
		primaryRows,
		epochRows,
		evidenceCandidates,
		"shared_evidence",
		claimedPrimary,
	);
	const matches = [...identity.matches, ...evidence.matches];
	const ambiguous = new Set([...identity.ambiguous, ...evidence.ambiguous]);
	const conflicting = new Set([
		...identity.conflicting,
		...evidence.conflicting,
	]);
	const matchedEpoch = new Set(matches.map((match) => match.epochIndex));
	const epochOnlyIndices = epochRows.flatMap((_, index) =>
		matchedEpoch.has(index) || conflicting.has(index) || ambiguous.has(index)
			? []
			: [index],
	);
	const primaryConfigurationKeys = new Set(
		primaryRows.map(configurationKey).filter((key) => key.length > 0),
	);
	const epochConfigurationCounts = new Map<string, number>();
	for (const index of epochOnlyIndices) {
		const key = configurationKey(epochRows[index] as WeirdMlEpochRow);
		if (key.length > 0) {
			epochConfigurationCounts.set(
				key,
				(epochConfigurationCounts.get(key) ?? 0) + 1,
			);
		}
	}
	const addedEpochIndices = epochOnlyIndices.filter((index) => {
		const key = configurationKey(epochRows[index] as WeirdMlEpochRow);
		return (
			key.length > 0 &&
			!primaryConfigurationKeys.has(key) &&
			epochConfigurationCounts.get(key) === 1
		);
	});
	const denominator = Math.min(primaryRows.length, epochRows.length);
	const coverage = denominator === 0 ? 0 : matches.length / denominator;
	const accepted =
		matches.length >= MINIMUM_CROSSWALK_ROWS &&
		coverage >= MINIMUM_CROSSWALK_COVERAGE;
	return {
		matches,
		addedEpochIndices: accepted ? addedEpochIndices : [],
		status: {
			accepted,
			primaryRowCount: primaryRows.length,
			epochRowCount: epochRows.length,
			matchedRowCount: matches.length,
			identityMatchCount: identity.matches.length,
			sharedEvidenceMatchCount: evidence.matches.length,
			coverage,
			conflictingEpochModels: [...conflicting].map(
				(index) => (epochRows[index] as WeirdMlEpochRow).model_version,
			),
			ambiguousEpochModels: [...ambiguous].map(
				(index) => (epochRows[index] as WeirdMlEpochRow).model_version,
			),
			epochOnlyRowCount: epochOnlyIndices.length,
			addedEpochRowCount: accepted ? addedEpochIndices.length : 0,
		},
	};
}

/** Parse WeirdML's current 17-task creator schema and preserve task-level evidence. */
export function processWeirdMlCsv(csv: string): BenchmarkScoreRow[] {
	const records = parseCsvRecords(csv);
	const firstRecord = records[0];
	if (
		firstRecord == null ||
		TASK_COLUMNS.some((column) => !Object.hasOwn(firstRecord, column))
	) {
		return [];
	}
	return records.flatMap((row, index) => {
		const score = asFiniteNumber(row.avg_acc);
		const model = row.display_name?.trim() || row.internal_model_name?.trim();
		if (score == null || model == null || model.length === 0) return [];
		const parsed = benchmarkModelEffort(model);
		const taskScores = Object.fromEntries(
			TASK_COLUMNS.map((key) => [key, asFiniteNumber(row[key])]),
		);
		return [
			{
				benchmark_key: "weirdml",
				source: "weirdml" as const,
				source_url: WEIRDML_CREATOR_CSV_URL,
				model_id:
					row.model_slug?.trim() || row.internal_model_name?.trim() || null,
				model,
				base_model: parsed.baseModel,
				reasoning_effort: parsed.reasoningEffort,
				provider: row["API source"]?.trim() || null,
				rank: index + 1,
				score,
				score_eligible: true,
				standard_error: asFiniteNumber(row.avg_acc_standard_error),
				confidence_low: null,
				confidence_high: null,
				observed_at: row.release_date?.trim() || null,
				metadata: {
					weirdml_origin: "creator",
					internal_model_name: row.internal_model_name?.trim() || null,
					...taskScores,
					cost_per_run_usd: asFiniteNumber(row.cost_per_run_usd),
					mean_total_output_tokens: asFiniteNumber(
						row.mean_total_output_tokens,
					),
					code_len_p10: asFiniteNumber(row.code_len_p10),
					code_len_p50: asFiniteNumber(row.code_len_p50),
					code_len_p90: asFiniteNumber(row.code_len_p90),
					exec_time_median_s: asFiniteNumber(row.exec_time_median_s),
				},
			},
		];
	});
}

function epochBenchmarkRow(row: WeirdMlEpochRow): BenchmarkScoreRow {
	return {
		benchmark_key: "weirdml",
		source: "weirdml",
		source_url: WEIRDML_EPOCH_CSV_URL,
		model_id: row.model_version,
		model: row.name,
		base_model: row.base_model,
		reasoning_effort: row.reasoning_effort,
		provider: row.provider,
		rank: null,
		score: row.accuracy,
		score_eligible: true,
		standard_error: row.standard_error,
		confidence_low: null,
		confidence_high: null,
		observed_at: row.observed_at,
		metadata: {
			weirdml_origin: "epoch",
			epoch_model_version: row.model_version,
			cost_per_run_usd: row.cost_per_run_usd,
			code_len_p50: row.code_len_p50,
		},
	};
}

/** Merge only a validated crosswalk, keeping creator observations authoritative on every overlap. */
export function mergeWeirdMlRows(
	primaryRows: readonly BenchmarkScoreRow[],
	epochRows: readonly WeirdMlEpochRow[],
): { data: BenchmarkScoreRow[]; crosswalk: WeirdMlCrosswalkStatus } {
	const plan = buildWeirdMlCrosswalk(primaryRows, epochRows);
	if (!plan.status.accepted) {
		return { data: [...primaryRows], crosswalk: plan.status };
	}
	const matchByPrimary = new Map(
		plan.matches.map((match) => [match.primaryIndex, match]),
	);
	const creatorRows = primaryRows.map((row, index) => {
		const match = matchByPrimary.get(index);
		if (match == null) return row;
		const epoch = epochRows[match.epochIndex] as WeirdMlEpochRow;
		return {
			...row,
			metadata: {
				...row.metadata,
				weirdml_epoch_crosswalk: match.method,
				weirdml_epoch_model_version: epoch.model_version,
			},
		};
	});
	const merged = [
		...creatorRows,
		...plan.addedEpochIndices.map((index) =>
			epochBenchmarkRow(epochRows[index] as WeirdMlEpochRow),
		),
	]
		.sort(
			(left, right) =>
				right.score - left.score || left.model.localeCompare(right.model),
		)
		.map((row, index) => ({ ...row, rank: index + 1 }));
	return { data: merged, crosswalk: plan.status };
}

/** Fetch the creator dataset and merge Epoch-only history only after the mirror crosswalk passes. */
export async function getWeirdMlStats(
	options: WeirdMlScraperOptions = {},
): Promise<WeirdMlPayload> {
	try {
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const epochRequest = fetchWithTimeout(
			options.epochUrl ?? WEIRDML_EPOCH_CSV_URL,
			{},
			timeoutMs,
		).catch(() => null);
		const creatorResponse = await fetchWithTimeout(
			options.creatorUrl ?? WEIRDML_CREATOR_CSV_URL,
			{},
			timeoutMs,
		);
		if (!creatorResponse.ok) {
			throw new Error(
				`WeirdML creator scrape failed: ${creatorResponse.status}`,
			);
		}
		const primaryRows = processWeirdMlCsv(await creatorResponse.text());
		if (primaryRows.length === 0) {
			throw new Error("WeirdML creator scrape returned no current-schema rows");
		}
		const epochResponse = await epochRequest;
		const epochRows = epochResponse?.ok
			? processEpochWeirdMlCsv(await epochResponse.text())
			: [];
		if (epochRows.length === 0) {
			return {
				fetched_at_epoch_seconds: nowEpochSeconds(),
				data: primaryRows,
				crosswalk: null,
			};
		}
		const merged = mergeWeirdMlRows(primaryRows, epochRows);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			...merged,
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
			crosswalk: null,
		};
	}
}
