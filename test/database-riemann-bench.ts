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
	insertModelBenchmarks,
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
				benchmarks: { riemann_bench: 0.42 },
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
		insertModelBenchmarks(db, finalRows);
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
	} finally {
		db.close();
	}

	const payload = readDatabasePayload(databasePath);
	assert.equal(payload.models.length, 1);
	assert.equal(
		payload.models[0]?.benchmarks?.riemann_bench,
		0.42,
		"Riemann-bench should survive the normalized final-model DB payload path",
	);
	assert.equal(
		payload.metadata.artificial_analysis.available_benchmark_keys.includes(
			"riemann_bench",
		),
		true,
		"Riemann-bench should be listed as a DB-backed available benchmark key",
	);
	assert.equal(
		"deep_swe" in payload,
		false,
		"Database payloads should not expose raw DeepSWE source rows",
	);
} finally {
	await rm(tempDir, { force: true, recursive: true });
}
