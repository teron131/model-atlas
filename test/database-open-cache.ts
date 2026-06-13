import assert from "node:assert/strict";

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
	} finally {
		reopenedDb.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
