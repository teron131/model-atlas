/**
 * CyberBench results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/cyber
 */

import { createValsBenchmarkScraper } from "./common";

export const CYBERBENCH_URL = "https://www.vals.ai/benchmarks/cyber";
export const {
	getStats: getCyberBenchStats,
	processPageHtml: processCyberBenchPageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "cyberbench",
	canonicalTask: "patch",
	sourceUrl: CYBERBENCH_URL,
});
