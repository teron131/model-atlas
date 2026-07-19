/**
 * Epoch Capabilities Index scraper owns Epoch AI score and confidence-interval normalization.
 *
 * Page source: https://epoch.ai/benchmarks/eci?tab=leaderboard
 * CSV source: https://epoch.ai/data/eci_scores.csv
 */

import { benchmarkModelEffort } from "../../shared";
import { asFiniteNumber, fetchWithTimeout, nowEpochSeconds } from "../../utils";
import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../benchmark-score";
import { parseCsvRecords } from "../csv-parser";

export const EPOCH_CAPABILITIES_INDEX_CSV_URL =
	"https://epoch.ai/data/eci_scores.csv";
const DEFAULT_TIMEOUT_MS = 30_000;

export function processEpochCapabilitiesIndexCsv(
	csv: string,
): BenchmarkScoreRow[] {
	return parseCsvRecords(csv).flatMap((row, index) => {
		const score = asFiniteNumber(row.eci);
		const model = row["Display name"] || row.Model || "";
		if (score == null || model.length === 0) return [];
		const parsed = benchmarkModelEffort(model);
		return [
			{
				benchmark_key: "epoch_capabilities_index" as const,
				source: "epoch" as const,
				source_url: EPOCH_CAPABILITIES_INDEX_CSV_URL,
				model_id: row.Model || null,
				model,
				base_model: parsed.baseModel,
				reasoning_effort: parsed.reasoningEffort,
				provider: row.Organization || null,
				rank: index + 1,
				score,
				score_eligible: true,
				standard_error: null,
				confidence_low: asFiniteNumber(row.eci_ci_low),
				confidence_high: asFiniteNumber(row.eci_ci_high),
				observed_at: row.date || null,
				metadata: {
					country: row["Country (of organization)"] || null,
					accessibility: row["Model accessibility"] || null,
					accessibility_group: row["Accessibility group"] || null,
					model_versions: row.model_versions || null,
				},
			},
		];
	});
}

export async function getEpochCapabilitiesIndexStats(): Promise<BenchmarkScorePayload> {
	try {
		const response = await fetchWithTimeout(
			EPOCH_CAPABILITIES_INDEX_CSV_URL,
			{},
			DEFAULT_TIMEOUT_MS,
		);
		if (!response.ok)
			throw new Error(
				`Epoch Capabilities Index scrape failed: ${response.status}`,
			);
		return {
			fetched_at_epoch_seconds: nowEpochSeconds(),
			data: processEpochCapabilitiesIndexCsv(await response.text()),
		};
	} catch {
		return { fetched_at_epoch_seconds: null, data: [] };
	}
}
