/** Exercises keyed schema reconciliation, payload fallback, and latest-run raw cache reads. */

import assert from "node:assert/strict";
import {
	rawSourceCacheStatusFromRows,
	readDeepSWERawCache,
	readRawSourceCacheStatus,
} from "../src/model-atlas/database/cache";
import { readPayloadRows } from "../src/model-atlas/database/payload";
import {
	loadSchemaSql,
	openDatabase,
	removeDatabaseFiles,
	SCHEMA_MANIFEST_TABLE,
	type SchemaCatalogRow,
	type SchemaManifestRow,
	schemaReconciliationPlan,
	schemaTableColumns,
	schemaTableShapes,
} from "../src/model-atlas/database/schema";
import { DATABASE_PIPELINE_REVISION } from "../src/model-atlas/database/types";

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
assert.equal(
	schemaColumns
		.get("pipeline_runs")
		?.find(([column]) => column === "pipeline_revision")?.[1],
	`INTEGER NOT NULL DEFAULT ${DATABASE_PIPELINE_REVISION}`,
	"The persisted schema default should match the code-owned pipeline revision",
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
			.prepare(
				"INSERT INTO model_stage_rows (run_id, stage, row_index, model_id) VALUES (?, ?, ?, ?)",
			)
			.run(1, "final", 0, "anthropic/claude-fable-5");
		firstDb
			.prepare(`
				INSERT INTO browsecomp_raw_rows (
					run_id, row_index, fetched_at_epoch_seconds, url, model,
					provider, provider_name, score
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`)
			.run(
				1,
				0,
				1_800_000_000,
				"https://example.com/browsecomp",
				"Claude Fable 5",
				"Anthropic",
				"Anthropic",
				0.5,
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
		assert.equal(
			Number(
				reopenedDb
					.prepare(
						"SELECT COUNT(*) AS count FROM model_stage_rows WHERE run_id = 1 AND stage = 'final'",
					)
					.get()?.count ?? 0,
			),
			1,
			"Changed derived tables should preserve rows when their primary keys still match",
		);
		assert.equal(
			reopenedDb
				.prepare(
					"SELECT cursorbench FROM model_stage_rows WHERE run_id = 1 AND stage = 'final'",
				)
				.get()?.cursorbench,
			null,
			"New nullable columns should be added without inventing evidence",
		);
		assert.equal(
			Number(
				reopenedDb
					.prepare("SELECT COUNT(*) AS count FROM browsecomp_raw_rows")
					.get()?.count ?? 0,
			),
			1,
			"Changed raw tables should preserve rows when their primary keys still match",
		);
		assert.equal(
			reopenedDb.prepare("SELECT provider_name FROM browsecomp_raw_rows").get()
				?.provider_name,
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
						"PRIMARY KEY (run_id, stage, row_index)",
						"PRIMARY KEY (run_id, row_index)",
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
						"\tlogo_url TEXT,\n\tPRIMARY KEY (run_id, row_index)",
						"\tlogo_url TEXT,\n\tnew_required_field TEXT NOT NULL,\n\tPRIMARY KEY (run_id, row_index)",
					),
					reconciledCatalog,
					reconciledManifest,
				),
			/new required column new_required_field needs a DEFAULT/,
			"Automatic reconciliation should refuse required columns without a migration value",
		);
		assert.deepEqual(
			schemaReconciliationPlan(
				schemaSql.replace(
					`INTEGER NOT NULL DEFAULT ${DATABASE_PIPELINE_REVISION}`,
					`INTEGER NOT NULL DEFAULT ${DATABASE_PIPELINE_REVISION + 1}`,
				),
				reconciledCatalog,
				reconciledManifest,
			).changedTables,
			["pipeline_runs"],
			"Schema reconciliation should detect changed defaults, not only changed column shapes",
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
		] of [[2, 1_800_000_010, "Latest DeepSWE Model", 0.8, 3, 5, 7]] as const) {
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
