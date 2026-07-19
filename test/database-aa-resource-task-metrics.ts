/** Verifies evaluations and task resources round-trip through normalized final-model tables. */

import assert from "node:assert/strict";

import { readDatabasePayload } from "../src/model-atlas/database";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import {
	insertModelEvaluations,
	insertModels,
	insertModelTaskMetrics,
} from "../src/model-atlas/database/writers";

const databasePath = ".cache/test-database-aa-resource-task-metrics.sqlite";

await removeDatabaseFiles(databasePath);

try {
	const db = await openDatabase(databasePath);
	try {
		const run = db
			.prepare(
				"INSERT INTO pipeline_runs (completed_at_epoch_seconds) VALUES (?)",
			)
			.run(1_800_000_001);
		const runId = Number(run.lastInsertRowid);
		const finalRows = [
			{
				id: "example/aa-resource-model",
				provider: "example",
				name: "AA Resource Model",
				reasoning_effort: "xhigh",
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
				},
			},
			{
				id: "example/sparse-resource-model",
				provider: "example",
				name: "Sparse Resource Model",
				logo: "https://example.com/logo.svg",
				component_scores: {
					intelligence_score: 90,
					agentic_score: 80,
					speed_score: null,
				},
				scores: {
					intelligence_score: 90,
					agentic_score: 80,
					speed_score: null,
					value_score: null,
				},
			},
		];
		insertModels(db, runId, finalRows);
		insertModelEvaluations(db, runId, finalRows);
		insertModelTaskMetrics(db, runId, finalRows);
		assert.equal(
			db
				.prepare("SELECT reasoning_effort FROM models WHERE run_id = ?")
				.get(runId)?.reasoning_effort,
			"xhigh",
		);
	} finally {
		db.close();
	}

	const payload = readDatabasePayload(databasePath);
	assert.equal(payload.models.length, 2);
	const model = payload.models.find(
		(candidate) => candidate.id === "example/aa-resource-model",
	);
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
	assert.deepEqual(
		payload.models.find(
			(candidate) => candidate.id === "example/sparse-resource-model",
		)?.scores,
		{
			intelligence_score: 90,
			agentic_score: 80,
			speed_score: null,
			value_score: null,
		},
		"database payloads should preserve models without optional resource scores",
	);
} finally {
	await removeDatabaseFiles(databasePath);
}
