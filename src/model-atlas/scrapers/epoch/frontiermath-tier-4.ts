/**
 * FrontierMath Tier 4 scraper owns Epoch AI private-task run filtering and score normalization.
 *
 * Page source: https://epoch.ai/benchmarks/frontiermath-tier-4-v2?tab=leaderboard
 * CSV source: https://epoch.ai/data/benchmarks.csv
 * Task filter: FrontierMath-Tier-4-v2-Private
 */

import type { BenchmarkScorePayload } from "../benchmark-score";
import {
	type EpochBenchmarkCsvRow,
	epochRunScoreRow,
	fetchEpochBenchmarkRows,
} from "./common";

const TASK = "FrontierMath-Tier-4-v2-Private";

export function epochFrontierMathTier4Rows(rows: EpochBenchmarkCsvRow[]) {
	return rows.flatMap((row) => {
		if (row.task !== TASK) return [];
		const scoreRow = epochRunScoreRow(row, "frontiermath_tier_4");
		return scoreRow == null ? [] : [scoreRow];
	});
}

export async function getEpochFrontierMathTier4Stats(): Promise<BenchmarkScorePayload> {
	const payload = await fetchEpochBenchmarkRows();
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		data: epochFrontierMathTier4Rows(payload.data),
	};
}
