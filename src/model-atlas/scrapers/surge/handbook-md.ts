/**
 * HANDBOOK.md scraper owns Surge leaderboard extraction and long-context enterprise-agent score normalization.
 *
 * Page source: https://surgehq.ai/benchmarks/handbook
 * HTML source: https://surgehq.ai/benchmarks/handbook
 * Task source: https://github.com/surge-ai/handbook
 */

import type { BenchmarkScorePayload } from "../benchmark-score";
import { getSurgeLeaderboardStats } from "./common";

const HANDBOOK_MD_URL = "https://surgehq.ai/benchmarks/handbook";

export function getHandbookMdStats(): Promise<BenchmarkScorePayload> {
	return getSurgeLeaderboardStats("handbook_md", HANDBOOK_MD_URL);
}
