/**
 * ProgramBench results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/programbench
 */

import { createValsBenchmarkScraper } from "./common";

export const PROGRAMBENCH_URL = "https://www.vals.ai/benchmarks/programbench";
export const {
	getStats: getProgramBenchStats,
	processPageHtml: processProgramBenchPageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "programbench",
	canonicalTask: "partial",
	sourceUrl: PROGRAMBENCH_URL,
});
