/**
 * EBR-Bench scraper owns Epoch AI leaderboard filtering and long-horizon agent score normalization.
 *
 * Page source: https://epoch.ai/benchmarks/ebr-bench?tab=leaderboard
 * CSV source: https://epoch.ai/data/benchmarks.csv
 * Task filter: EBR-bench
 */

import type { BenchmarkScorePayload } from "../benchmark-score";
import {
	type EpochBenchmarkCsvRow,
	epochRunScoreRow,
	fetchEpochBenchmarkRows,
} from "./common";

function epochEbrBenchRows(rows: EpochBenchmarkCsvRow[]) {
	return rows.flatMap((row) => {
		if (row.task !== "EBR-bench") return [];
		const scoreRow = epochRunScoreRow(row, "ebr_bench");
		return scoreRow == null ? [] : [scoreRow];
	});
}

export async function getEpochEbrBenchStats(): Promise<BenchmarkScorePayload> {
	const payload = await fetchEpochBenchmarkRows();
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		data: epochEbrBenchRows(payload.data),
	};
}
