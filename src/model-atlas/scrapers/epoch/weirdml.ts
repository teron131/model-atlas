/**
 * WeirdML scraper owns task-level accuracy preservation and aggregate ML-engineering score normalization.
 *
 * Page source: https://epoch.ai/benchmarks/weirdml?tab=leaderboard&metric=Accuracy
 * Benchmark source: https://htihle.github.io/weirdml.html
 * CSV source: https://htihle.github.io/data/weirdml_data.csv
 * Score field: avg_acc
 */

import { benchmarkModelEffort } from "../../shared";
import { asFiniteNumber, fetchWithTimeout, nowEpochSeconds } from "../../utils";
import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../benchmark-score";
import { parseCsvRecords } from "../csv-parser";

const WEIRDML_CSV_URL = "https://htihle.github.io/data/weirdml_data.csv";
const DEFAULT_TIMEOUT_MS = 30_000;
const TASK_COLUMNS = [
	"shapes_easy_acc",
	"shapes_hard_acc",
	"mnist_acc",
	"fashion_mnist_acc",
	"cifar10_acc",
	"cifar100_acc",
	"emnist_acc",
	"svhn_acc",
	"usps_acc",
	"iris_acc",
	"wine_acc",
	"breast_cancer_acc",
	"digits_acc",
	"blobs_acc",
	"moons_acc",
	"circles_acc",
	"number_patterns_acc",
] as const;

export function processWeirdMlCsv(csv: string): BenchmarkScoreRow[] {
	return parseCsvRecords(csv).flatMap((row, index) => {
		const score = asFiniteNumber(row.avg_acc);
		const model = row.display_name || row.internal_model_name || "";
		if (score == null || model.length === 0) return [];
		const parsed = benchmarkModelEffort(model);
		const taskScores = Object.fromEntries(
			TASK_COLUMNS.map((key) => [key, asFiniteNumber(row[key])]),
		);
		return [
			{
				benchmark_key: "weirdml",
				source: "weirdml" as const,
				source_url: WEIRDML_CSV_URL,
				model_id: row.model_slug || row.internal_model_name || null,
				model,
				base_model: parsed.baseModel,
				reasoning_effort: parsed.reasoningEffort,
				provider: row["API source"] || null,
				rank: index + 1,
				score,
				score_eligible: true,
				standard_error: asFiniteNumber(row.avg_acc_standard_error),
				confidence_low: null,
				confidence_high: null,
				observed_at: row.release_date || null,
				metadata: {
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

export async function getWeirdMlStats(): Promise<BenchmarkScorePayload> {
	try {
		const response = await fetchWithTimeout(
			WEIRDML_CSV_URL,
			{},
			DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok)
			throw new Error(`WeirdML scrape failed: ${response.status}`);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processWeirdMlCsv(await response.text()),
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
