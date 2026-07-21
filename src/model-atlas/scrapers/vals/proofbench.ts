/**
 * ProofBench results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/proof_bench
 */

import { createValsBenchmarkScraper } from "./common";

export const PROOFBENCH_URL = "https://www.vals.ai/benchmarks/proof_bench";
export const {
	getStats: getProofBenchStats,
	processPageHtml: processProofBenchPageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "proofbench",
	canonicalTask: "overall",
	includeReasoningEffortInModel: false,
	isScoreEligible: (_task, modelId) =>
		modelId.toLowerCase() !== "aristotle/aristotle",
	sourceUrl: PROOFBENCH_URL,
});
