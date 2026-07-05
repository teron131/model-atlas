/** Verifies AA evaluation resource task metrics survive the model_stage_rows database path. */

import assert from "node:assert/strict";

import { readDatabasePayload } from "../src/model-atlas/database";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import { insertModelStageRows } from "../src/model-atlas/database/writers";

const databasePath = ".cache/test-database-aa-resource-task-metrics.sqlite";

await removeDatabaseFiles(databasePath);

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
				id: "example/aa-resource-model",
				provider: "example",
				name: "AA Resource Model",
				logo: "https://example.com/logo.svg",
				modalities: { input: ["text"] },
				evaluations: { hle: 0.9, gdpval_normalized: 0.8 },
				task_metrics: {
					artificial_analysis: {
						cost: 9,
						seconds: 90,
						output_tokens: 900,
					},
					hle: {
						cost: 0.1,
						seconds: 10,
						tokens: 100,
						input_tokens: 40,
						output_tokens: 60,
					},
					gdpval_normalized: {
						cost: 0.2,
						seconds: 20,
						tokens: 200,
						input_tokens: 80,
						output_tokens: 120,
					},
				},
				component_scores: {
					intelligence_score: 90,
					agentic_score: 80,
					speed_score: 70,
				},
				scores: {
					intelligence_score: 90,
					agentic_score: 80,
					speed_score: 70,
					value_score: 65,
					overall_score: 75,
				},
			},
		]);
	} finally {
		db.close();
	}

	const payload = readDatabasePayload(databasePath);
	const model = payload.models[0];
	assert.deepEqual(model?.task_metrics?.hle, {
		cost: 0.1,
		seconds: 10,
		tokens: 100,
		input_tokens: 40,
		output_tokens: 60,
	});
	assert.deepEqual(model?.task_metrics?.gdpval_normalized, {
		cost: 0.2,
		seconds: 20,
		tokens: 200,
		input_tokens: 80,
		output_tokens: 120,
	});
	const speedTooltip = JSON.stringify(
		payload.metadata.scoring.column_tooltips.speed,
	);
	assert.equal(speedTooltip.includes("GDPval-AA v2 runtime"), true);
	assert.equal(speedTooltip.includes("HLE runtime"), true);
	assert.equal(speedTooltip.includes("Frontier benchmark runtime"), false);
} finally {
	await removeDatabaseFiles(databasePath);
}
