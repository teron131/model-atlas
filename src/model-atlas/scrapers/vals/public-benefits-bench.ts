/**
 * Public Benefits Bench results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/public-benefits-bench
 */

import { createValsBenchmarkScraper } from "./common";

export const PUBLIC_BENEFITS_BENCH_URL =
	"https://www.vals.ai/benchmarks/public-benefits-bench";
export const {
	getStats: getPublicBenefitsBenchStats,
	processPageHtml: processPublicBenefitsBenchPageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "public_benefits_bench",
	canonicalTask: "overall",
	sourceUrl: PUBLIC_BENEFITS_BENCH_URL,
});
