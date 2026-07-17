/** Verifies OpenRouter cache fidelity, route coverage, and targeted refresh policy. */

import assert from "node:assert/strict";

import {
	openRouterCacheHasScopedCandidates,
	readOpenRouterRawCache,
} from "../src/model-atlas/database/cache/openrouter";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import {
	openRouterModelIdsToRefresh,
	refreshOpenRouterRawPayload,
} from "../src/model-atlas/database/sources";
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
				{
					slug: "qwen/qwen-plus-2025-07-28",
					permaslug: "qwen/qwen-plus-2025-07-28",
				},
				{
					slug: "x-ai/grok-4.1-fast",
					permaslug: "x-ai/grok-4.1-fast",
				},
			],
			models: [
				{
					id: "anthropic/claude-fable-5",
					selected_permaslug: "anthropic/claude-5-fable-20260609",
					candidate_permaslugs: ["anthropic/claude-5-fable-20260609"],
					performance: {
						summary: {
							throughput_tokens_per_second_median: 40,
							latency_seconds_median: 5.4,
							e2e_latency_seconds_median: 16.22,
						},
						throughput: {
							data: [
								{
									x: "2026-06-17",
									y: { p50: 100 },
								},
							],
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
				{
					id: "qwen/qwen-plus-2025-07-28:thinking",
					selected_permaslug: null,
					candidate_permaslugs: ["qwen/qwen-plus-2025-07-28"],
					performance: {},
					pricing: null,
				},
				{
					id: "xai/grok-4.1-fast",
					selected_permaslug: null,
					candidate_permaslugs: ["x-ai/grok-4.1-fast"],
					performance: {},
					pricing: null,
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
			10,
			"OpenRouter raw rows should retain only meaningful estimate variants",
		);
		assert.ok(
			estimateRows.every((row) => row.value != null),
			"OpenRouter raw rows should not spend writes on null estimates",
		);
		assert.equal(estimateRows.at(-1)?.metric, "latency_e2e");
		assert.equal(estimateRows.at(-1)?.series, "final");
		assert.equal(estimateRows.at(-1)?.value, 16.22);

		const cached = readOpenRouterRawCache(db);
		assert.ok(cached != null);
		assert.equal(
			cached.models[0]?.performance.summary
				?.throughput_tokens_per_second_median,
			40,
			"Cache reconstruction should retain the upstream aggregate instead of its derived final estimate",
		);
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
		assert.deepEqual(
			cached.models.map((model) => model.id),
			[
				"anthropic/claude-fable-5",
				"qwen/qwen-plus-2025-07-28:thinking",
				"xai/grok-4.1-fast",
			],
			"Models with no stats should persist as negative cache coverage",
		);
		assert.equal(
			openRouterCacheHasScopedCandidates(db),
			true,
			"Candidate scope should use the catalog slug behind an opaque permaslug",
		);
		const freshCacheStatus = {
			last_fetch_epoch_seconds: 1_800_000_000,
			source_input_count: 3,
			cache_hit: true,
			refreshed: false,
		};
		assert.deepEqual(
			openRouterModelIdsToRefresh(
				cached,
				freshCacheStatus,
				["anthropic/claude-fable-5", "xai/grok-4.1-fast", "openai/new-model"],
				false,
			),
			["openai/new-model"],
			"Fresh OpenRouter caches should fetch only uncovered model IDs",
		);
		const scopedRefresh = await refreshOpenRouterRawPayload(
			cached,
			freshCacheStatus,
			["anthropic/claude-fable-5", "xai/grok-4.1-fast"],
			8,
		);
		assert.deepEqual(
			scopedRefresh.rawPayload?.models.map((model) => model.id),
			["anthropic/claude-fable-5", "xai/grok-4.1-fast"],
			"Fresh cache reuse should drop model keys no longer requested",
		);

		insertOpenRouterRawRows(db, 2, cached);
		const contentRows = (runId: number) =>
			db
				.prepare(
					"SELECT * FROM openrouter_raw_rows WHERE run_id = ? ORDER BY row_index",
				)
				.all(runId)
				.map(({ run_id, row_index, fetched_at_epoch_seconds, ...row }) => row);
		assert.deepEqual(
			contentRows(2),
			contentRows(1),
			"OpenRouter cache read/write round trips should be content-idempotent",
		);
	} finally {
		db.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
