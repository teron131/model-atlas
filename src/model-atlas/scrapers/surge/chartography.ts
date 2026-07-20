/**
 * Chartography scraper owns Surge leaderboard extraction and professional chart-reasoning score normalization.
 *
 * Page source: https://surgehq.ai/benchmarks/chartography
 * HTML source: https://surgehq.ai/benchmarks/chartography
 * Dataset source: https://huggingface.co/datasets/surgeai/chartography
 */

import type { BenchmarkScorePayload } from "../benchmark-score";
import { getSurgeLeaderboardStats } from "./common";

const CHARTOGRAPHY_URL = "https://surgehq.ai/benchmarks/chartography";

export function getChartographyStats(): Promise<BenchmarkScorePayload> {
	return getSurgeLeaderboardStats("chartography", CHARTOGRAPHY_URL);
}
