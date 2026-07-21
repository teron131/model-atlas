/**
 * Finance Agent v2 results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/fabv2
 */

import { createValsBenchmarkScraper } from "./common";

export const FINANCE_AGENT_V2_URL = "https://www.vals.ai/benchmarks/fabv2";
export const {
	getStats: getFinanceAgentV2Stats,
	processPageHtml: processFinanceAgentV2PageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "finance_agent_v2",
	canonicalTask: "all_pass",
	sourceUrl: FINANCE_AGENT_V2_URL,
});
