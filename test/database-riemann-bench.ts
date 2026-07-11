/** Verifies Riemann Bench model payloads and raw-source URL cache round-trips. */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readDatabasePayload } from "../src/model-atlas/database";
import { readRiemannBenchRawCache } from "../src/model-atlas/database/cache";
import { openDatabase } from "../src/model-atlas/database/schema";
import { riemannBenchSnapshot } from "../src/model-atlas/database/source-snapshots/sparse-benchmarks";
import {
	insertModelStageRows,
	insertRiemannBenchRawRows,
} from "../src/model-atlas/database/writers";

const tempDir = await mkdtemp(join(tmpdir(), "model-atlas-riemann-bench-"));
const databasePath = join(tempDir, "database.sqlite");
const customSourceUrl = "https://example.test/custom-riemann-bench";

try {
	const db = await openDatabase(databasePath);
	try {
		const run = db
			.prepare(`
				INSERT INTO pipeline_runs (
					started_at_epoch_seconds, completed_at_epoch_seconds,
					matched_row_count, enriched_row_count, final_model_count
				) VALUES (?, ?, ?, ?, ?)
			`)
			.run(1_800_000_000, 1_800_000_001, 1, 1, 1);
		const runId = Number(run.lastInsertRowid);
		insertModelStageRows(db, runId, "final", [
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
					overall_score: 70,
				},
			},
		]);
		db.prepare(`
			INSERT INTO riemann_bench_raw_rows (
				run_id, row_index, fetched_at_epoch_seconds, url, provider,
				model, score, last_updated
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			runId,
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
		const cachedSnapshot = await riemannBenchSnapshot(
			db,
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
		assert.equal(cachedSnapshot.riemannBenchSourceUrl, customSourceUrl);

		const copiedRunId = runId + 1;
		insertRiemannBenchRawRows(db, copiedRunId, {
			riemannBenchModelScoreRows: cachedSnapshot.riemannBenchModelScoreRows,
			riemannBenchSourceUrl: cachedSnapshot.riemannBenchSourceUrl,
			fetchedAt: {
				riemannBench: cachedSnapshot.sourceStatus.fetchedAt,
			},
		});
		assert.equal(
			db
				.prepare(
					"SELECT url FROM riemann_bench_raw_rows WHERE run_id = ? AND row_index = 0",
				)
				.get(copiedRunId)?.url,
			customSourceUrl,
			"the writer should persist snapshot provenance instead of recreating a default URL",
		);
		assert.equal(readRiemannBenchRawCache(db)?.sourceUrl, customSourceUrl);

		db.prepare(`
			INSERT INTO riemann_bench_raw_rows (
				run_id, row_index, fetched_at_epoch_seconds, url, provider,
				model, score, last_updated
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			copiedRunId,
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
				run_id, row_index, fetched_at_epoch_seconds, url, source_version,
				model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
				n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
				mean_output_tokens
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			runId,
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
				run_id, row_index, fetched_at_epoch_seconds, url, source_version,
				model, reasoning_effort, config, pass_at_1, ci_lo, ci_hi, ci_half,
				n_tasks_attempted, mean_cost_usd, mean_duration_seconds,
				mean_output_tokens
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			runId,
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
		"Riemann-bench should survive the main model_stage_rows DB payload path",
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
