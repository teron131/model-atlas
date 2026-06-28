import assert from "node:assert/strict";

import { readDeepSWERawCache } from "../src/model-atlas/llm/database/cache";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/llm/database/schema";

const databasePath = ".cache/test-database-open-cache.sqlite";

await removeDatabaseFiles(databasePath);

try {
	const firstDb = await openDatabase(databasePath);
	try {
		firstDb
			.prepare(`
				INSERT INTO aa_raw_models (
					run_id, row_index, fetched_at_epoch_seconds, url, model_id, name
				) VALUES (?, ?, ?, ?, ?, ?)
			`)
			.run(
				1,
				0,
				1_800_000_000,
				"https://artificialanalysis.ai/leaderboards/models",
				"anthropic/claude-fable-5",
				"Claude Fable 5",
			);
		firstDb
			.prepare("ALTER TABLE processed_models DROP COLUMN cursorbench")
			.run();
		firstDb
			.prepare("ALTER TABLE browsecomp_raw_rows DROP COLUMN provider_name")
			.run();
		firstDb
			.prepare(`
				INSERT INTO deep_swe_raw_rows (
					run_id, row_index, fetched_at_epoch_seconds, url, source_version,
					model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
					n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
					mean_output_tokens
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.run(
				1,
				0,
				1_800_000_000,
				"https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json",
				"v1.1",
				"Current DeepSWE Model",
				"xhigh",
				null,
				0.7,
				null,
				null,
				null,
				113,
				2,
				4,
				6,
			);
	} finally {
		firstDb.close();
	}

	const reopenedDb = await openDatabase(databasePath);
	try {
		const row = reopenedDb
			.prepare("SELECT COUNT(*) AS count FROM aa_raw_models WHERE model_id = ?")
			.get("anthropic/claude-fable-5");
		assert.equal(
			Number(row?.count ?? 0),
			1,
			"Opening the database should preserve existing source rows for cache loading",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(processed_models)")
				.all()
				.some((column) => column.name === "cursorbench"),
			"Opening the database should add missing processed_models columns",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(browsecomp_raw_rows)")
				.all()
				.some((column) => column.name === "provider_name"),
			"Opening the database should add missing raw source columns",
		);
		const deepSWECache = readDeepSWERawCache(reopenedDb);
		assert.equal(deepSWECache?.sourceVersion, "v1.1");
		assert.equal(deepSWECache?.rows[0]?.model, "Current DeepSWE Model");
		assert.equal(deepSWECache?.rows[0]?.source_version, "v1.1");
	} finally {
		reopenedDb.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
