/**
 * ZeroEval leaderboard data is normalized for catalog-configured benchmarks.
 *
 * Public pages:
 * - https://llm-stats.com/benchmarks/browsecomp
 * - https://llm-stats.com/benchmarks/toolathlon
 *
 * JSON sources:
 * - https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details
 * - https://api.zeroeval.com/leaderboard/benchmarks/toolathlon/details
 */

import {
	asFiniteNumber,
	asRecord,
	fetchWithTimeout,
	nowEpochSeconds,
} from "../runtime";

import type {
	BenchmarkScoreMetadata,
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "./benchmark-score";
import { stringValue } from "./parsing";

const DEFAULT_TIMEOUT_MS = 30_000;

export type ZeroEvalBenchmarkOptions = {
	benchmarkKey: string;
	sourceUrl: string;
	rankField?: string;
	observedAtField?: string;
};

type ZeroEvalFetchOptions = ZeroEvalBenchmarkOptions & {
	timeoutMs?: number;
};

type ZeroEvalModelScoreFields = {
	model: string;
	provider: string;
	providerName: string | null;
	score: number;
	reportedSourceUrl: string | null;
	analysisMethod: string | null;
	verified: boolean | null;
	selfReported: boolean | null;
};

function booleanValue(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

/** Accept source scores only when they are already on the shared zero-to-one scale. */
function unitScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	if (score == null || score < 0 || score > 1) {
		return null;
	}
	return Number(score.toFixed(6));
}

function zeroEvalModelScoreFields(
	value: unknown,
): ZeroEvalModelScoreFields | null {
	const row = asRecord(value);
	const model = stringValue(row?.model_name);
	const provider = stringValue(row?.organization_id);
	const score = unitScore(row?.normalized_score) ?? unitScore(row?.score);
	if (model == null || provider == null || score == null) {
		return null;
	}
	return {
		model,
		provider,
		providerName: stringValue(row?.organization_name),
		score,
		reportedSourceUrl: stringValue(row?.self_reported_source),
		analysisMethod: stringValue(row?.analysis_method),
		verified: booleanValue(row?.verified),
		selfReported: booleanValue(row?.self_reported),
	};
}

/** Normalize one ZeroEval payload according to its catalog-declared evidence fields. */
export function processZeroEvalDetailsJson(
	payload: unknown,
	options: ZeroEvalBenchmarkOptions,
): BenchmarkScoreRow[] {
	const root = asRecord(payload);
	const modelRows = Array.isArray(root?.models) ? root.models : [];
	return modelRows.flatMap((value) => {
		const sourceRow = asRecord(value);
		const fields = zeroEvalModelScoreFields(value);
		if (sourceRow == null || fields == null) {
			return [];
		}
		const observedAt =
			options.observedAtField == null
				? null
				: stringValue(sourceRow[options.observedAtField]);
		const metadata: BenchmarkScoreMetadata = {
			provider_name: fields.providerName,
			reported_source_url: fields.reportedSourceUrl,
			analysis_method: fields.analysisMethod,
			verified: fields.verified,
			self_reported: fields.selfReported,
		};
		if (options.observedAtField != null) {
			metadata[options.observedAtField] = observedAt;
		}
		return [
			{
				benchmark_key: options.benchmarkKey,
				source: "zeroeval",
				source_url: options.sourceUrl,
				model_id: null,
				model: fields.model,
				base_model: fields.model,
				reasoning_effort: null,
				provider: fields.provider,
				rank:
					options.rankField == null
						? null
						: asFiniteNumber(sourceRow[options.rankField]),
				score: fields.score,
				score_eligible: true,
				standard_error: null,
				confidence_low: null,
				confidence_high: null,
				observed_at: observedAt,
				metadata,
			},
		];
	});
}

/** Fetch one catalog-configured ZeroEval benchmark without exposing provider details to callers. */
export async function getZeroEvalStats(
	options: ZeroEvalFetchOptions,
): Promise<BenchmarkScorePayload> {
	try {
		const response = await fetchWithTimeout(
			options.sourceUrl,
			{},
			options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok) {
			throw new Error(
				`ZeroEval ${options.benchmarkKey} scrape failed: ${response.status}`,
			);
		}
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processZeroEvalDetailsJson(await response.json(), options),
		};
	} catch {
		return {
			fetched_at_epoch_seconds: null,
			data: [],
		};
	}
}
