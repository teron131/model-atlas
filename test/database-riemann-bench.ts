/** Verifies Riemann Bench model payloads and raw-source URL cache round-trips. */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { riemannBenchPersistence } from "../src/model-atlas/benchmarks/persistence/riemann-bench";
import { readDatabasePayload } from "../src/model-atlas/database";
import { openDatabase } from "../src/model-atlas/database/schema";
import { readRiemannBenchRawCache } from "../src/model-atlas/ingest/cache";
import { SNAPSHOT_TABLES } from "../src/model-atlas/ingest/source-registry";
import type { SourceSnapshots } from "../src/model-atlas/ingest/types";
import {
	insertBenchmarkRawRows,
	insertModelEvaluations,
	insertModels,
} from "../src/model-atlas/ingest/writers";

const tempDir = await mkdtemp(join(tmpdir(), "model-atlas-riemann-bench-"));
const databasePath = join(tempDir, "database.sqlite");
const customSourceUrl = "https://example.test/custom-riemann-bench";

try {
	const db = await openDatabase(databasePath);
	try {
		db.prepare(
			"INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)",
		).run(1_800_000_001);
		const finalRows = [
			{
				id: "example/math-model",
				provider: "example",
				name: "Math Model",
				logo: "https://example.com/logo.svg",
				modalities: { input: ["text"] },
				evaluations: { riemann_bench: 0.42 },
				component_scores: {
					intelligence_score: 70,
					agentic_score: 10,
					speed_score: 50,
				},
				scores: {
					intelligence_score: 90,
					agentic_score: 20,
					speed_score: 50,
					value_score: 65,
				},
			},
		];
		insertModels(db, finalRows);
		insertModelEvaluations(db, finalRows);
		db.prepare(`
			INSERT INTO riemann_bench_raw_rows (
				row_index, fetched_at_epoch_seconds, url, provider,
				model, score, last_updated
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			0,
			1_800_000_000,
			customSourceUrl,
			"Example",
			"Custom Math Model",
			0.62,
			"05/27/2026",
		);
		const cachedRows = readRiemannBenchRawCache(db);
		assert.equal(
			cachedRows?.sourceUrl,
			customSourceUrl,
			"cache reconstruction should accept a consistent custom source URL",
		);
		const cachedSnapshot = await riemannBenchPersistence.snapshot(
			cachedRows,
			{
				last_fetch_epoch_seconds: 1_800_000_000,
				source_input_count: 1,
				cache_hit: true,
				refreshed: false,
			},
			{},
			new Map(),
			1_800_000_100,
		);
		assert.equal(cachedSnapshot.riemannBenchPersistenceUrl, customSourceUrl);

		db.prepare("DELETE FROM riemann_bench_raw_rows").run();
		insertBenchmarkRawRows(
			db,
			{
				riemannBenchModelScoreRows: cachedSnapshot.riemannBenchModelScoreRows,
				riemannBenchPersistenceUrl: cachedSnapshot.riemannBenchPersistenceUrl,
				fetchedAt: {
					riemannBench: cachedSnapshot.sourceStatus.fetchedAt,
				},
			} as unknown as SourceSnapshots,
			SNAPSHOT_TABLES.riemann_bench,
		);
		assert.equal(
			db
				.prepare("SELECT url FROM riemann_bench_raw_rows WHERE row_index = 0")
				.get()?.url,
			customSourceUrl,
			"the writer should persist snapshot provenance instead of recreating a default URL",
		);
		assert.equal(readRiemannBenchRawCache(db)?.sourceUrl, customSourceUrl);

		db.prepare(`
			INSERT INTO riemann_bench_raw_rows (
				row_index, fetched_at_epoch_seconds, url, provider,
				model, score, last_updated
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`).run(
			1,
			1_800_000_000,
			"https://example.test/different-riemann-bench",
			"Example",
			"Conflicting Math Model",
			0.41,
			null,
		);
		assert.equal(
			readRiemannBenchRawCache(db),
			null,
			"cache reconstruction should reject a run with mixed source URLs",
		);
		db.prepare(`
			INSERT INTO deep_swe_raw_rows (
				row_index, fetched_at_epoch_seconds, url, source_version,
				model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
				n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
				mean_output_tokens
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			0,
			1_800_000_000,
			"https://deepswe.datacurve.ai/artifacts/v1/leaderboard-live.json",
			"v1",
			"Previous DeepSWE Model",
			null,
			null,
			0.4,
			null,
			null,
			null,
			113,
			2,
			4,
			6,
		);
		db.prepare(`
			INSERT INTO deep_swe_raw_rows (
				row_index, fetched_at_epoch_seconds, url, source_version,
				model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
				n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
				mean_output_tokens
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			1,
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
		db.close();
	}

	const payload = readDatabasePayload(databasePath);
	assert.equal(payload.models.length, 1);
	assert.equal(
		payload.models[0]?.evaluations?.riemann_bench,
		0.42,
		"Riemann-bench should survive the normalized final-model DB payload path",
	);
	assert.equal(
		payload.metadata.artificial_analysis.available_evaluation_keys.includes(
			"riemann_bench",
		),
		true,
		"Riemann-bench should be listed as a DB-backed available evaluation key",
	);
	assert.ok(payload.deep_swe);
	assert.deepEqual(
		payload.deep_swe.rows.map((row) => row.model),
		["Current DeepSWE Model", "Previous DeepSWE Model"],
		"Database payloads should preserve v1-only DeepSWE rows while preferring v1.1 duplicates",
	);
} finally {
	await rm(tempDir, { force: true, recursive: true });
}
