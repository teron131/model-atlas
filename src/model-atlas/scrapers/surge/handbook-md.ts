/**
 * HANDBOOK.md scraper owns Surge leaderboard extraction and long-context enterprise-agent score normalization.
 *
 * Page source: https://surgehq.ai/benchmarks/handbook
 * HTML source: https://surgehq.ai/benchmarks/handbook
 * Task source: https://github.com/surge-ai/handbook
 */

import type {
	BenchmarkScorePayload,
	BenchmarkScoreRow,
} from "../benchmark-score";
import {
	getSurgeLeaderboardStats,
	processSurgeBenchmarkPageHtml,
} from "./common";

export const HANDBOOK_MD_URL = "https://surgehq.ai/benchmarks/handbook";

export function processHandbookMdPageHtml(
	pageHtml: string,
): BenchmarkScoreRow[] {
	return processSurgeBenchmarkPageHtml(
		pageHtml,
		"handbook_md",
		HANDBOOK_MD_URL,
	);
}

export function getHandbookMdStats(): Promise<BenchmarkScorePayload> {
	return getSurgeLeaderboardStats("handbook_md", HANDBOOK_MD_URL);
}
