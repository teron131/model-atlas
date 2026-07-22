/** Exercises keyed schema reconciliation, payload fallback, and current raw cache reads. */

import assert from "node:assert/strict";
import { readPayloadRows } from "../src/model-atlas/database/payload-rows";
import {
	loadSchemaSql,
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import {
	SCHEMA_MANIFEST_TABLE,
	type SchemaCatalogRow,
	type SchemaManifestRow,
	schemaReconciliationPlan,
	schemaTableColumns,
	schemaTableShapes,
} from "../src/model-atlas/database/schema-reconciliation";
import {
	rawSourceCacheStatusFromRows,
	readDeepSWERawCache,
	readRawSourceCacheStatus,
} from "../src/model-atlas/ingest/cache";

const databasePath = ".cache/test-database-open-cache.sqlite";
const DEEP_SWE_V1_1_URL =
	"https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";
const DEEP_SWE_V1_URL =
	"https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json";
const DEEP_SWE_INSERT_SQL = `
	INSERT INTO deep_swe_raw_rows (
		row_index, fetched_at_epoch_seconds, url, source_version,
		model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
		n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
		mean_output_tokens
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const schemaSql = await loadSchemaSql();
assert.equal(
	/\bAUTOINCREMENT\b/i.test(schemaSql),
	false,
	"The snapshot schema should not create SQLite sequence bookkeeping",
);
const schemaColumns = schemaTableColumns(schemaSql);
assert.deepEqual(
	Array.from(
		schemaTableShapes(`
			CREATE TABLE compact_schema (
				row_index INTEGER NOT NULL, source TEXT NOT NULL,
				metadata_json TEXT DEFAULT json_object('key', 'value'),
				PRIMARY KEY (row_index)
			);
		`)
			.get("compact_schema")
			?.keys() ?? [],
	),
	["row_index", "source", "metadata_json"],
	"schema parsing should handle SQLite catalogs with several definitions per line",
);
assert.equal(
	schemaColumns
		.get("artificial_analysis_raw_models")
		?.find(([column]) => column === "url")?.[1],
	"TEXT NOT NULL",
	"schema parsing should preserve complete column definitions",
);
const processedModelShape = schemaTableShapes(schemaSql).get("models");
assert(
	(processedModelShape?.size ?? 0) <= 100,
	"D1 tables must stay within Cloudflare's 100-column SQLite limit",
);
assert.equal(
	processedModelShape?.has("agent_arena"),
	false,
	"Benchmark values should live in normalized evaluation rows",
);
assert.equal(
	processedModelShape?.has("task_metrics_json"),
	false,
	"Task metrics should live in normalized scalar rows rather than JSON",
);
assert.deepEqual(
	Array.from(
		schemaTableShapes(schemaSql).get("model_evaluations")?.keys() ?? [],
	),
	["model_row_index", "benchmark_key", "value"],
	"Evaluation storage should remain a narrow keyed table",
);
assert.deepEqual(
	Array.from(
		schemaTableShapes(schemaSql).get("model_task_metrics")?.keys() ?? [],
	),
	[
		"model_row_index",
		"source_key",
		"cost",
		"seconds",
		"tokens",
		"input_tokens",
		"output_tokens",
	],
	"Task metric storage should remain scalar and relational",
);
assert.equal(
	processedModelShape?.get("row_index")?.primaryKey,
	1,
	"schema drift checks should preserve table-level primary key order",
);

const staleSourceRows = [{ fetched_at_epoch_seconds: 1_800_000_000 }];
assert.equal(
	rawSourceCacheStatusFromRows("browsecomp", staleSourceRows, 1_900_000_000, {
		last_fetch_epoch_seconds: 1_900_000_000,
		source_input_count: 1,
	}).cache_hit,
	true,
	"Persisted refresh metadata should keep unchanged raw rows fresh",
);
assert.equal(
	rawSourceCacheStatusFromRows("browsecomp", staleSourceRows, 1_900_000_000, {
		last_fetch_epoch_seconds: null,
		source_input_count: 1,
	}).cache_hit,
	false,
	"An explicit missing refresh timestamp should not fall back to an old raw-row timestamp",
);

const payloadRows = await readPayloadRows(1_800_000_000, async (rowGroup) => {
	if (rowGroup.optional === true) {
		throw new Error("optional table is absent");
	}
	return [];
});
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
					row_index, fetched_at_epoch_seconds, url, model_id, name
				) VALUES (?, ?, ?, ?, ?)
			`)
			.run(
				0,
				1_800_000_000,
				"https://artificialanalysis.ai/leaderboards/models",
				"anthropic/claude-fable-5",
				"Claude Fable 5",
			);
		firstDb
			.prepare("INSERT INTO models (row_index, model_id) VALUES (?, ?)")
			.run(0, "anthropic/claude-fable-5");
		firstDb
			.prepare(`
				INSERT INTO benchmark_observation_raw_rows (
					source_key, row_index, fetched_at_epoch_seconds, benchmark_key, url,
					model_id, model, base_model, reasoning_effort, model_creator_id,
					model_creator, inference_provider, rank,
					reported_value, reported_unit, canonical_value, canonical_unit,
					score_eligible, standard_error, confidence_low,
					confidence_high, observed_at, metadata_json
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.run(
				"browsecomp",
				0,
				1_800_000_000,
				"browsecomp",
				"https://api.zeroeval.com/leaderboard/benchmarks/browsecomp/details",
				null,
				"Claude Fable 5",
				"Claude Fable 5",
				null,
				"anthropic",
				"Anthropic",
				null,
				null,
				0.5,
				"proportion",
				0.5,
				"proportion",
				1,
				null,
				null,
				null,
				null,
				JSON.stringify({}),
			);
		firstDb
			.prepare(
				"ALTER TABLE artificial_analysis_raw_models ADD COLUMN legacy_note TEXT",
			)
			.run();
		firstDb
			.prepare(
				"CREATE TABLE legacy_snapshot_rows (id INTEGER PRIMARY KEY, value TEXT)",
			)
			.run();
		firstDb
			.prepare(
				`INSERT INTO ${SCHEMA_MANIFEST_TABLE} (object_type, object_name) VALUES (?, ?)`,
			)
			.run("table", "legacy_snapshot_rows");
		firstDb.prepare("ALTER TABLE models DROP COLUMN reasoning_effort").run();
		firstDb
			.prepare(
				"ALTER TABLE benchmark_observation_raw_rows DROP COLUMN observed_at",
			)
			.run();
		firstDb
			.prepare(DEEP_SWE_INSERT_SQL)
			.run(
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
			1,
			"Schema reconciliation should preserve rows when the primary keys still match",
		);
		assert(
			!reopenedDb
				.prepare("PRAGMA table_info(artificial_analysis_raw_models)")
				.all()
				.some((column) => column.name === "legacy_note"),
			"Schema reconciliation should omit columns no longer owned by the checked-in schema",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(models)")
				.all()
				.some((column) => column.name === "reasoning_effort"),
			"Opening the database should add missing models columns",
		);
		assert(
			reopenedDb
				.prepare("PRAGMA table_info(benchmark_observation_raw_rows)")
				.all()
				.some((column) => column.name === "observed_at"),
			"Opening the database should recreate raw source columns",
		);
		assert.equal(
			Number(
				reopenedDb.prepare("SELECT COUNT(*) AS count FROM models").get()
					?.count ?? 0,
			),
			1,
			"Changed derived tables should preserve rows when their primary keys still match",
		);
		assert.equal(
			reopenedDb.prepare("SELECT reasoning_effort FROM models").get()
				?.reasoning_effort,
			null,
			"New nullable columns should be added without inventing evidence",
		);
		assert.equal(
			Number(
				reopenedDb
					.prepare(
						"SELECT COUNT(*) AS count FROM benchmark_observation_raw_rows WHERE source_key = 'browsecomp'",
					)
					.get()?.count ?? 0,
			),
			1,
			"Changed raw tables should preserve rows when their primary keys still match",
		);
		assert.equal(
			reopenedDb
				.prepare(
					"SELECT observed_at FROM benchmark_observation_raw_rows WHERE source_key = 'browsecomp'",
				)
				.get()?.observed_at,
			null,
			"Reintroduced nullable source columns should start empty",
		);
		assert.equal(
			reopenedDb
				.prepare(
					"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legacy_snapshot_rows'",
				)
				.get(),
			undefined,
			"Previously managed tables absent from the schema should be removed",
		);
		const reconciledCatalog = reopenedDb
			.prepare(
				"SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index')",
			)
			.all() as SchemaCatalogRow[];
		const reconciledManifest = reopenedDb
			.prepare(`SELECT object_type, object_name FROM ${SCHEMA_MANIFEST_TABLE}`)
			.all() as SchemaManifestRow[];
		assert.deepEqual(
			schemaReconciliationPlan(schemaSql, reconciledCatalog, reconciledManifest)
				.statements,
			[],
			"A reconciled schema should not produce repeated DDL operations",
		);
		assert.throws(
			() =>
				schemaReconciliationPlan(
					schemaSql.replace(
						"PRIMARY KEY (row_index)\n);\n\nCREATE TABLE IF NOT EXISTS model_evaluations",
						"PRIMARY KEY (row_index, model_id)\n);\n\nCREATE TABLE IF NOT EXISTS model_evaluations",
					),
					reconciledCatalog,
					reconciledManifest,
				),
			/primary key changed/,
			"Automatic reconciliation should refuse incompatible stable-key changes",
		);
		assert.throws(
			() =>
				schemaReconciliationPlan(
					schemaSql.replace(
						"\tlogo_url TEXT,\n\tPRIMARY KEY (row_index)",
						"\tlogo_url TEXT,\n\tnew_required_field TEXT NOT NULL,\n\tPRIMARY KEY (row_index)",
					),
					reconciledCatalog,
					reconciledManifest,
				),
			/new required column new_required_field needs a DEFAULT/,
			"Automatic reconciliation should refuse required columns without a migration value",
		);
		const deepSWEStatement = reopenedDb.prepare(DEEP_SWE_INSERT_SQL);
		for (const [fetchedAt, model, score, cost, seconds, outputTokens] of [
			[1_800_000_010, "Current DeepSWE Model", 0.8, 3, 5, 7],
		] as const) {
			reopenedDb.prepare("DELETE FROM deep_swe_raw_rows").run();
			deepSWEStatement.run(
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
		assert.equal(deepSWECache?.rows[0]?.model, "Current DeepSWE Model");
		assert.equal(deepSWECache?.rows[0]?.source_version, "v1.1");
		const deepSWEStatus = readRawSourceCacheStatus(
			reopenedDb,
			"deep_swe",
			1_800_000_020,
		);
		assert.equal(
			deepSWEStatus.source_input_count,
			1,
			"source cache status should count the current source rows",
		);
		assert.equal(
			deepSWEStatus.last_fetch_epoch_seconds,
			1_800_000_010,
			"source cache status should use the current source timestamp",
		);
		reopenedDb.prepare("DELETE FROM deep_swe_raw_rows").run();
		deepSWEStatement.run(
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
			"A fallback-only DeepSWE snapshot should not suppress a v1.1 retry",
		);
	} finally {
		reopenedDb.close();
	}
} finally {
	await removeDatabaseFiles(databasePath);
}
