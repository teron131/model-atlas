/** Exercises schema replacement, payload fallback, and latest-run raw cache reads. */

import assert from "node:assert/strict";
import {
	readDeepSWERawCache,
	readRawSourceCacheStatus,
} from "../src/model-atlas/database/cache";
import { readPayloadRows } from "../src/model-atlas/database/payload";
import {
	loadSchemaSql,
	openDatabase,
	removeDatabaseFiles,
	schemaTableColumns,
	schemaTableShapes,
} from "../src/model-atlas/database/schema";

const databasePath = ".cache/test-database-open-cache.sqlite";
const DEEP_SWE_V1_1_URL =
	"https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";
const DEEP_SWE_V1_URL =
	"https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json";
const DEEP_SWE_INSERT_SQL = `
	INSERT INTO deep_swe_raw_rows (
		run_id, row_index, fetched_at_epoch_seconds, url, source_version,
		model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
		n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
		mean_output_tokens
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const schemaSql = await loadSchemaSql();
const schemaColumns = schemaTableColumns(schemaSql);
assert.equal(
	schemaColumns
		.get("artificial_analysis_raw_models")
		?.find(([column]) => column === "url")?.[1],
	"TEXT NOT NULL",
	"schema parsing should preserve complete column definitions",
);
const processedModelShape =
	schemaTableShapes(schemaSql).get("model_stage_rows");
assert.deepEqual(
	[
		processedModelShape?.get("run_id")?.primaryKey,
		processedModelShape?.get("stage")?.primaryKey,
		processedModelShape?.get("row_index")?.primaryKey,
	],
	[1, 2, 3],
	"schema drift checks should preserve table-level primary key order",
);

const payloadRows = await readPayloadRows(
	{ id: 1, fetchedAt: 1_800_000_000 },
	async (rowGroup) => {
		if (rowGroup.optional === true) {
			throw new Error("optional table is absent");
		}
		return [];
	},
);
assert.deepEqual(
	payloadRows.valsIndexRows,
	[],
	"optional async payload row groups should degrade to empty rows",
);

await removeDatabaseFiles(databasePath);

try {
	const firstDb = await openDatabase(databasePath);
	try {
		firstDb
			.prepare(`
				INSERT INTO artificial_analysis_raw_models (
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
			.prepare("ALTER TABLE model_stage_rows DROP COLUMN cursorbench")
			.run();
		firstDb
			.prepare("ALTER TABLE browsecomp_raw_rows DROP COLUMN provider_name")
			.run();
		firstDb
			.prepare(DEEP_SWE_INSERT_SQL)
			.run(
				1,
				0,
				1_800_000_000,
				DEEP_SWE_V1_1_URL,
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
			.prepare(
				"SELECT COUNT(*) AS count FROM artificial_analysis_raw_models WHERE model_id = ?",
			)
			.get("anthropic/claude-fable-5");
		assert.equal(
			Number(row?.count ?? 0),
			0,
			"Opening a mismatched database should replace stale snapshot rows",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(model_stage_rows)")
				.all()
				.some((column) => column.name === "cursorbench"),
			"Opening the database should add missing model_stage_rows columns",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(model_stage_rows)")
				.all()
				.some((column) => column.name === "reasoning_effort"),
			"Model stage rows should persist effort observations",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(browsecomp_raw_rows)")
				.all()
				.some((column) => column.name === "provider_name"),
			"Opening the database should recreate raw source columns",
		);
		const deepSWEStatement = reopenedDb.prepare(DEEP_SWE_INSERT_SQL);
		for (const [
			runId,
			fetchedAt,
			model,
			score,
			cost,
			seconds,
			outputTokens,
		] of [
			[1, 1_800_000_000, "Current DeepSWE Model", 0.7, 2, 4, 6],
			[2, 1_800_000_010, "Latest DeepSWE Model", 0.8, 3, 5, 7],
		] as const) {
			deepSWEStatement.run(
				runId,
				0,
				fetchedAt,
				DEEP_SWE_V1_1_URL,
				"v1.1",
				model,
				"xhigh",
				null,
				score,
				null,
				null,
				null,
				113,
				cost,
				seconds,
				outputTokens,
			);
		}
		const deepSWECache = readDeepSWERawCache(reopenedDb);
		assert.equal(deepSWECache?.sourceVersion, "v1.1");
		assert.equal(deepSWECache?.rows[0]?.model, "Latest DeepSWE Model");
		assert.equal(deepSWECache?.rows[0]?.source_version, "v1.1");
		const deepSWEStatus = readRawSourceCacheStatus(
			reopenedDb,
			"deep_swe",
			1_800_000_020,
		);
		assert.equal(
			deepSWEStatus.source_input_count,
			1,
			"source cache status should count only the latest table run",
		);
		assert.equal(
			deepSWEStatus.last_fetch_epoch_seconds,
			1_800_000_010,
			"source cache status should use the latest table run timestamp",
		);
		deepSWEStatement.run(
			3,
			0,
			1_800_000_020,
			DEEP_SWE_V1_URL,
			"v1",
			"Fallback DeepSWE Model",
			"xhigh",
			null,
			0.6,
			null,
			null,
			null,
			113,
			1,
			3,
			5,
		);
		assert.equal(
			readRawSourceCacheStatus(reopenedDb, "deep_swe", 1_800_000_030).cache_hit,
			false,
			"A fallback-only DeepSWE run should not suppress a v1.1 retry",
		);
	} finally {
		reopenedDb.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
