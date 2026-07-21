/**
 * Legal Research Bench results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/legal_research
 */

import { createValsBenchmarkScraper } from "./common";

export const LEGAL_RESEARCH_URL =
	"https://www.vals.ai/benchmarks/legal_research";
export const {
	getStats: getLegalResearchStats,
	processPageHtml: processLegalResearchPageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "legal_research",
	canonicalTask: "overall",
	sourceUrl: LEGAL_RESEARCH_URL,
});
