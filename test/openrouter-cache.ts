import assert from "node:assert/strict";

import { readOpenRouterRawCache } from "../src/model-atlas/database/cache";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import { insertOpenRouterRawRows } from "../src/model-atlas/database/writers/openrouter";

const databasePath = ".cache/test-openrouter-cache.sqlite";

await removeDatabaseFiles(databasePath);

try {
	const db = await openDatabase(databasePath);
	try {
		insertOpenRouterRawRows(db, 1, {
			fetched_at_epoch_seconds: 1_800_000_000,
			directory: [
				{
					slug: "anthropic/claude-fable-5",
					permaslug: "anthropic/claude-5-fable-20260609",
				},
			],
			models: [
				{
					id: "anthropic/claude-fable-5",
					selected_permaslug: "anthropic/claude-5-fable-20260609",
					candidate_permaslugs: ["anthropic/claude-5-fable-20260609"],
					performance: {
						summary: {
							throughput_tokens_per_second_median: 47.25,
							latency_seconds_median: 5.4,
							e2e_latency_seconds_median: 16.22,
						},
						latency_e2e: {
							data: [
								{
									x: "2026-06-17",
									y: {
										p50: 16_220,
									},
								},
							],
						},
						series_token_weights: {
							p50: 123,
						},
					},
					pricing: {
						data: {
							weightedInputPrice: 10,
							weightedOutputPrice: 50,
						},
					},
				},
			],
		});

		const estimateRows = db
			.prepare(
				`SELECT metric, series, value
				FROM openrouter_raw_rows
				WHERE row_kind = 'performance_estimate'
				ORDER BY row_index`,
			)
			.all();
		assert.equal(
			estimateRows.length,
			12,
			"OpenRouter raw rows should retain estimate variants for DB inspection",
		);
		assert.equal(estimateRows.at(-1)?.metric, "latency_e2e");
		assert.equal(estimateRows.at(-1)?.series, "final");
		assert.equal(estimateRows.at(-1)?.value, 16.22);

		const cached = readOpenRouterRawCache(db);
		assert.equal(
			cached?.models[0]?.performance.summary?.e2e_latency_seconds_median,
			16.22,
			"OpenRouter cache reads should preserve stored end-to-end latency",
		);
		assert.equal(
			cached?.models[0]?.performance.series_token_weights?.p50,
			123,
			"OpenRouter cache reads should preserve token-share weights",
		);
	} finally {
		db.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
