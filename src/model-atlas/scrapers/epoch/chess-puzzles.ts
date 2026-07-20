/**
 * Chess Puzzles scraper owns Epoch AI leaderboard filtering and exact-move score normalization.
 *
 * Page source: https://epoch.ai/benchmarks/chess-puzzles?tab=leaderboard
 * CSV source: https://epoch.ai/data/benchmarks.csv
 * Task filter: Chess Puzzles
 */

import type { BenchmarkScorePayload } from "../benchmark-score";
import {
	type EpochBenchmarkCsvRow,
	epochRunScoreRow,
	fetchEpochBenchmarkRows,
} from "./common";

function epochChessPuzzleRows(rows: EpochBenchmarkCsvRow[]) {
	return rows.flatMap((row) => {
		if (row.task !== "Chess Puzzles") return [];
		const scoreRow = epochRunScoreRow(row, "chess_puzzles");
		return scoreRow == null ? [] : [scoreRow];
	});
}

export async function getEpochChessPuzzleStats(): Promise<BenchmarkScorePayload> {
	const payload = await fetchEpochBenchmarkRows();
	return {
		fetched_at_epoch_seconds: payload.fetched_at_epoch_seconds,
		data: epochChessPuzzleRows(payload.data),
	};
}
