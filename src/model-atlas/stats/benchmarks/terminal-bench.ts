/**
 * Terminal-Bench aggregate policy over score/resource and harness source rows.
 *
 * The Artificial Analysis main leaderboard is the broad score table; benchmark-specific pages such as Terminal-Bench add per-task cost, time, and token resources that the main table does not carry.
 */

import { finiteScoreValues, medianOfFinite } from "../../math-utils";
import {
	type ArtificialAnalysisEvaluationResourceByBenchmark,
	type ArtificialAnalysisEvaluationResourceRow,
	findArtificialAnalysisEvaluationResourceRow,
} from "../../scrapers/artificial-analysis/evaluation-resources";
import {
	findTerminalBenchRows,
	type TerminalBenchModelHarnessRow,
	type TerminalBenchRowsByModelName,
} from "../../scrapers/vals/terminal-bench";
import { asFiniteNumber } from "../../shared";

type Observation = {
	source: "artificial_analysis" | "vals";
	model_id: string;
	model: string;
	provider: string | null;
	harness: string | null;
	score: number | null;
	cost_per_task_usd: number | null;
	seconds_per_task: number | null;
	tokens_per_task: number | null;
	input_tokens_per_task: number | null;
	output_tokens_per_task: number | null;
};

export type TerminalBenchAggregateRow = {
	model_id: string;
	model: string;
	provider: string | null;
	harness: string | null;
	sources: string[];
	source_count: number;
	score: number;
	cost_per_task_usd: number | null;
	seconds_per_task: number | null;
	tokens_per_task: number | null;
	input_tokens_per_task: number | null;
	output_tokens_per_task: number | null;
};

type AggregateInput = {
	artificialAnalysisScore?: unknown;
	resourceRow?: ArtificialAnalysisEvaluationResourceRow | null;
	harnessRows?: readonly TerminalBenchModelHarnessRow[] | null;
};

type SourceLookups = {
	artificialAnalysisRowsByBenchmark: ArtificialAnalysisEvaluationResourceByBenchmark;
	harnessRowsByModel: TerminalBenchRowsByModelName;
};

const ARTIFICIAL_ANALYSIS_HARNESS = "Terminus 2";

function stringIdentity(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteUnitScore(value: unknown): number | null {
	const score = asFiniteNumber(value);
	return score != null && score >= 0 && score <= 1 ? score : null;
}

function nonNegativeNumber(value: unknown): number | null {
	const number = asFiniteNumber(value);
	return number != null && number >= 0 ? number : null;
}

function resourceObservation(
	score: unknown,
	row: ArtificialAnalysisEvaluationResourceRow | null | undefined,
): Observation | null {
	const parsedScore = finiteUnitScore(score) ?? finiteUnitScore(row?.score);
	if (parsedScore == null && row == null) {
		return null;
	}
	const modelId = stringIdentity(row?.model_id);
	const model = stringIdentity(row?.model) ?? modelId;
	if (modelId == null || model == null) {
		return null;
	}
	return {
		source: "artificial_analysis",
		model_id: modelId,
		model,
		provider: row?.provider ?? null,
		harness: ARTIFICIAL_ANALYSIS_HARNESS,
		score: parsedScore,
		cost_per_task_usd: nonNegativeNumber(row?.cost_per_task_usd),
		seconds_per_task: nonNegativeNumber(row?.seconds_per_task),
		tokens_per_task: nonNegativeNumber(row?.tokens_per_task),
		input_tokens_per_task: nonNegativeNumber(row?.input_tokens_per_task),
		output_tokens_per_task: nonNegativeNumber(row?.output_tokens_per_task),
	};
}

function harnessObservation(
	row: TerminalBenchModelHarnessRow | null | undefined,
): Observation | null {
	if (row == null) {
		return null;
	}
	return {
		source: "vals",
		model_id: row.model_id,
		model: row.model,
		provider: row.provider,
		harness: row.harness,
		score: row.score,
		cost_per_task_usd: row.cost_per_task_usd,
		seconds_per_task: row.seconds_per_task,
		tokens_per_task: null,
		input_tokens_per_task: null,
		output_tokens_per_task: null,
	};
}

function firstString(values: readonly (string | null)[]): string | null {
	return values.find((value) => value != null && value.length > 0) ?? null;
}

function uniqueStrings(values: readonly (string | null)[]): string[] {
	return values.filter(
		(value, index, items): value is string =>
			value != null && value.length > 0 && items.indexOf(value) === index,
	);
}

function sharedHarness(observations: readonly Observation[]): string | null {
	const firstHarness = observations[0]?.harness ?? null;
	return observations.every((row) => row.harness === firstHarness)
		? firstHarness
		: null;
}

/** Rewards harness coverage lightly by scoring the best observed execution path. */
function aggregateScore(values: readonly (number | null)[]): number | null {
	const scores = finiteScoreValues(values);
	return scores.length === 0 ? null : Math.max(...scores);
}

export function terminalBenchAggregateRow(
	input: AggregateInput,
): TerminalBenchAggregateRow | null {
	const observations = [
		resourceObservation(input.artificialAnalysisScore, input.resourceRow),
		...(input.harnessRows ?? []).map(harnessObservation),
	].filter((row): row is Observation => row != null);
	const score = aggregateScore(observations.map((row) => row.score));
	if (observations.length === 0 || score == null) {
		return null;
	}
	return {
		model_id: firstString(observations.map((row) => row.model_id)) ?? "",
		model: firstString(observations.map((row) => row.model)) ?? "",
		provider: firstString(observations.map((row) => row.provider)),
		harness: sharedHarness(observations),
		sources: uniqueStrings(observations.map((row) => row.source)),
		source_count: observations.length,
		score: Number(score.toFixed(6)),
		cost_per_task_usd: medianOfFinite(
			observations.map((row) => row.cost_per_task_usd),
		),
		seconds_per_task: medianOfFinite(
			observations.map((row) => row.seconds_per_task),
		),
		tokens_per_task: medianOfFinite(
			observations.map((row) => row.tokens_per_task),
		),
		input_tokens_per_task: medianOfFinite(
			observations.map((row) => row.input_tokens_per_task),
		),
		output_tokens_per_task: medianOfFinite(
			observations.map((row) => row.output_tokens_per_task),
		),
	};
}

export function findTerminalBenchAggregate(
	candidateNames: unknown[],
	lookups: SourceLookups,
	artificialAnalysisScore?: unknown,
): TerminalBenchAggregateRow | null {
	const resourceRow = findArtificialAnalysisEvaluationResourceRow(
		"terminalbench_v21",
		candidateNames,
		lookups.artificialAnalysisRowsByBenchmark,
	);
	const harnessRows = findTerminalBenchRows(
		candidateNames,
		lookups.harnessRowsByModel,
	);
	return terminalBenchAggregateRow({
		artificialAnalysisScore,
		resourceRow,
		harnessRows,
	});
}
