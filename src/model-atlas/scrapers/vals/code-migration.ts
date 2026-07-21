/**
 * Code Migration results are scraped from VALS.
 *
 * Page source: https://www.vals.ai/benchmarks/code-migration
 */

import { createValsBenchmarkScraper } from "./common";

export const CODE_MIGRATION_URL =
	"https://www.vals.ai/benchmarks/code-migration";
export const {
	getStats: getCodeMigrationStats,
	processPageHtml: processCodeMigrationPageHtml,
} = createValsBenchmarkScraper({
	benchmarkKey: "code_migration",
	canonicalTask: "overall",
	sourceUrl: CODE_MIGRATION_URL,
});
