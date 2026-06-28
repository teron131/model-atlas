import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readModelAtlasDatabasePayload } from "../src/model-atlas/llm/database";
import { openDatabase } from "../src/model-atlas/llm/database/schema";
import { insertProcessedModelRows } from "../src/model-atlas/llm/database/writers";

const tempDir = await mkdtemp(join(tmpdir(), "model-atlas-riemann-bench-"));
const databasePath = join(tempDir, "database.sqlite");

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
		insertProcessedModelRows(db, runId, "final", [
			{
				id: "example/math-model",
				provider: "example",
				name: "Math Model",
				logo: "https://example.com/logo.svg",
				modalities: { input: ["text"] },
				evaluations: { riemann_bench: 0.42 },
				scores: {
					intelligence_score: 70,
					agentic_score: 10,
					speed_score: 50,
					value_score: 60,
				},
				relative_scores: {
					intelligence_score: 90,
					agentic_score: 20,
					speed_score: 50,
					value_score: 60,
					overall_score: 70,
				},
			},
		]);
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
			"Legacy DeepSWE Model",
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

	const payload = readModelAtlasDatabasePayload(databasePath);
	assert.equal(payload.models.length, 1);
	assert.equal(
		payload.models[0]?.evaluations?.riemann_bench,
		0.42,
		"Riemann-bench should survive the main processed_models DB payload path",
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
		["Current DeepSWE Model"],
		"Database payloads should apply DeepSWE source-owned v1.1 preference when reconstructing graph rows",
	);
} finally {
	await rm(tempDir, { force: true, recursive: true });
}
