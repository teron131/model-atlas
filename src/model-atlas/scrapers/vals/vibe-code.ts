/**
 * Vibe Code Bench results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/vibe-code
 */

import { createValsBenchmarkScraper } from "./common";

export const VIBE_CODE_URL = "https://www.vals.ai/benchmarks/vibe-code";
export const {
	getStats: getVibeCodeStats,
	processPageHtml: processVibeCodePageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "vibe_code",
	canonicalTask: "overall",
	sourceUrl: VIBE_CODE_URL,
});
