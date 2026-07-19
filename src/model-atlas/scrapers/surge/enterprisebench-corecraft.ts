/**
 * EnterpriseBench CoreCraft scraper owns Surge leaderboard extraction and enterprise-agent score normalization.
 *
 * Page source: https://surgehq.ai/benchmarks/enterprisebench-corecraft
 * HTML source: https://surgehq.ai/benchmarks/enterprisebench-corecraft
 * Paper source: https://arxiv.org/abs/2602.16179
 */

import type { BenchmarkScorePayload } from "../benchmark-score";
import { getSurgeLeaderboardStats } from "./common";

export const ENTERPRISEBENCH_CORECRAFT_URL =
	"https://surgehq.ai/benchmarks/enterprisebench-corecraft";

export function getEnterpriseBenchCoreCraftStats(): Promise<BenchmarkScorePayload> {
	return getSurgeLeaderboardStats(
		"enterprisebench_corecraft",
		ENTERPRISEBENCH_CORECRAFT_URL,
	);
}
