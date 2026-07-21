/**
 * EMB results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/emb
 */

import { createValsBenchmarkScraper } from "./common";

export const EMB_URL = "https://www.vals.ai/benchmarks/emb";
export const { getStats: getEmbStats, processPageHtml: processEmbPageHtml } =
	createValsBenchmarkScraper({
		benchmarkKey: "emb",
		canonicalTask: "overall",
		sourceUrl: EMB_URL,
	});
