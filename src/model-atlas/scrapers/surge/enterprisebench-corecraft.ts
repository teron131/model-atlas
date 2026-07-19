/**
 * EnterpriseBench CoreCraft scraper owns Surge leaderboard extraction and enterprise-agent score normalization.
 *
 * Page source: https://surgehq.ai/benchmarks/enterprisebench-corecraft
 * HTML source: https://surgehq.ai/benchmarks/enterprisebench-corecraft
 * Paper source: https://arxiv.org/abs/2602.16179
 */

import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../benchmark-score";
import {
	getSurgeLeaderboardStats,
	processSurgeBenchmarkPageHtml,
} from "./common";

export const ENTERPRISEBENCH_CORECRAFT_URL =
	"https://surgehq.ai/benchmarks/enterprisebench-corecraft";

export function processEnterpriseBenchCoreCraftPageHtml(
	pageHtml: string,
): BenchmarkScoreRow[] {
	return processSurgeBenchmarkPageHtml(
		pageHtml,
		"enterprisebench_corecraft",
		ENTERPRISEBENCH_CORECRAFT_URL,
	);
}

export function getEnterpriseBenchCoreCraftStats(): Promise<BenchmarkScorePayload> {
	return getSurgeLeaderboardStats(
		"enterprisebench_corecraft",
		ENTERPRISEBENCH_CORECRAFT_URL,
	);
}
