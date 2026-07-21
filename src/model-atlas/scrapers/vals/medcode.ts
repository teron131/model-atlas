/**
 * MedCode results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/medcode
 */

import { createValsBenchmarkScraper } from "./common";

export const MEDCODE_URL = "https://www.vals.ai/benchmarks/medcode";
export const {
	getStats: getMedCodeStats,
	processPageHtml: processMedCodePageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "medcode",
	canonicalTask: "overall",
	sourceUrl: MEDCODE_URL,
});
