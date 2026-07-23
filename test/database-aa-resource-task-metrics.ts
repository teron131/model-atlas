/** Verifies benchmarks and task resources round-trip through normalized final-model tables. */

import assert from "node:assert/strict";

import { readDatabasePayload } from "../src/model-atlas/database";
import {
	openDatabase,
	removeDatabaseFiles,
} from "../src/model-atlas/database/schema";
import {
	insertModelBenchmarks,
	insertModels,
	insertModelTaskMetrics,
} from "../src/model-atlas/ingest/writers";

const databasePath = ".cache/test-database-aa-resource-task-metrics.sqlite";

await removeDatabaseFiles(databasePath);

try {
	const db = await openDatabase(databasePath);
	try {
		db.prepare(
			"INSERT INTO snapshot_metadata (updated_at_epoch_seconds) VALUES (?)",
		).run(1_800_000_001);
		const finalRows = [
			{
				id: "example/aa-resource-model",
				provider: "example",
				name: "AA Resource Model",
				reasoning_effort: "xhigh",
				logo: "https://example.com/logo.svg",
				modalities: { input: ["text"] },
				benchmarks: { hle: 0.9, gdpval_normalized: 0.8 },
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
				confidence: {
					intelligence: 0.83,
					agentic: 0.47,
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
		insertModels(db, finalRows);
		insertModelBenchmarks(db, finalRows);
		insertModelTaskMetrics(db, finalRows);
		assert.equal(
			db.prepare("SELECT reasoning_effort FROM models").get()?.reasoning_effort,
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
	assert.deepEqual(model?.confidence, {
		intelligence: 0.83,
		agentic: 0.47,
	});
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
