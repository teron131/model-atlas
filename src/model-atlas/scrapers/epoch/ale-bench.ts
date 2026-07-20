/**
 * ALE-Bench Epoch scraper owns Epoch AI's rounded source-default mirror parsing.
 *
 * Page source: https://epoch.ai/benchmarks/ale-bench?tab=leaderboard&metric=Performance
 * CSV source: https://epoch.ai/data/external_benchmarks/ale_bench.csv
 */

import { asFiniteNumber } from "../../shared";
import { parseCsvRecords } from "../csv-parser";

export const ALE_BENCH_EPOCH_RESULTS_URL =
	"https://epoch.ai/data/external_benchmarks/ale_bench.csv";

export type AleBenchEpochRow = {
	model: string;
	model_version: string;
	performance: number;
	rank: number;
	cost: number;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
};

/** Parse Epoch's rounded source-default mirror for identity and score-contract validation. */
export function processAleBenchEpochCsv(csv: string): AleBenchEpochRow[] {
	return parseCsvRecords(csv).flatMap((record) => {
		const model = record.Name?.trim();
		const modelVersion = record["Model version"]?.trim();
		const performance = asFiniteNumber(record.Performance);
		const rank = asFiniteNumber(record.Rank);
		const cost = asFiniteNumber(record.Cost);
		const inputTokens = asFiniteNumber(record["Input tokens (K)"]);
		const outputTokens = asFiniteNumber(record["Output tokens (K)"]);
		const totalTokens = asFiniteNumber(record["Total tokens (K)"]);
		return model &&
			modelVersion &&
			performance != null &&
			rank != null &&
			cost != null &&
			inputTokens != null &&
			outputTokens != null &&
			totalTokens != null
			? [
					{
						model,
						model_version: modelVersion,
						performance,
						rank,
						cost,
						input_tokens: inputTokens * 1_000,
						output_tokens: outputTokens * 1_000,
						total_tokens: totalTokens * 1_000,
					},
				]
			: [];
	});
}
